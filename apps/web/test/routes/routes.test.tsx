import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from '../../src/app'
import type { SessionUser } from '../../src/api/types'
import { currentPath, fakeApi, renderWithProviders } from '../helpers'

const USER: SessionUser = { id: 'u-1', email: 'me@example.com', name: '테스터' }

/**
 * 로그인된 상태로 라우트 표(설계 D6)만 본다.
 *
 * `getProject`가 **받은 id를 이름에 실어** 돌려준다. 그 이름이 화면에 뜨면 라우트가
 * 잡혔고, 경로 파라미터가 풀렸고, 그 값이 조회까지 갔다는 뜻이다 — 셸이 프로젝트
 * 이름을 서버 응답에서만 얻기 때문이다. 셸의 자리 표시자가 경로 파라미터를 그대로
 * 찍어 주던 시절보다 한 칸 더 간다.
 */
function renderAt(route: string): void {
  renderWithProviders(<App />, {
    client: fakeApi({
      me: async () => USER,
      getProject: async (projectId) => ({
        id: projectId,
        name: `설계서 ${projectId}`,
        slug: projectId,
        description: null,
        role: 'owner',
      }),
    }),
    route,
  })
}

// 뒤 태스크의 화면이 전부 이 표 안으로 들어온다. 여기서 지키는 것은 화면의 내용이
// 아니라 **라우트가 잡히고 경로 파라미터가 풀린다**는 것, 그리고 **페이지 없이 들어온
// 것과 페이지를 연 것이 화면에서 구분된다**는 것 둘이다.
describe('라우트 표', () => {
  it('프로젝트 라우트는 projectId를 넘겨준다', async () => {
    renderAt('/projects/p-1')

    await screen.findByRole('heading', { name: '설계서 p-1' })
    expect(currentPath()).toBe('/projects/p-1')
    // 페이지 없이 들어온 것과 페이지를 연 것이 구분돼야 한다.
    expect(screen.queryByText(/^페이지 /)).toBeNull()
  })

  it('페이지 라우트는 projectId와 pageId를 함께 넘겨준다', async () => {
    renderAt('/projects/p-1/pages/pg-2')

    await screen.findByRole('heading', { name: '설계서 p-1' })
    screen.getByText('페이지 pg-2')
    expect(currentPath()).toBe('/projects/p-1/pages/pg-2')
  })
})
