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
 * 잡혔고 경로 파라미터가 풀렸다는 뜻이다.
 *
 * **거기까지다.** 가짜가 돌려주는 `설계서 ${projectId}`는 경로 파라미터만으로 만들 수
 * 있는 문자열이라, 셸이 조회 결과를 버리고 경로 id로 제목을 지어도 아래 두 케이스는
 * 통과한다(실측: 셸이 `project.name` 대신 `props.project.id`를 찍게 바꾸면
 * `editor-shell.test.tsx` 8케이스가 죽고 여기 둘은 산다). "이름이 조회 결과에서 왔다"를
 * 지키는 것은 경로로 만들 수 없는 이름을 쓰는 `editor-shell.test.tsx`의
 * `프로젝트 이름이 셸에 보인다`다.
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
      // 셸의 세 자리가 각각 조회한다. 여기서 보는 것은 라우트 표뿐이지만, 스텁하지 않은
      // 메서드는 `fakeApi`가 던지므로 트리와 캔버스가 오류 화면이 된다 — 그러면 아래
      // 단언이 "라우트가 잡혔다"가 아니라 "오류가 떴다"를 보게 된다.
      getTree: async () => [],
      getPage: async (_projectId, pageId) => ({
        id: pageId,
        menuNodeId: 'm-1',
        title: `페이지 ${pageId}`,
        description: null,
        sortOrder: 0,
        schemaVersion: 1,
        headSeq: 1,
        schema: { version: 1, root: { id: 'n_00000000000a', type: 'Page', children: [] } },
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
    // 캔버스는 `pageId`로 문서를 받아 온 **뒤에** 그 자리를 그린다. 조회가 끝날 때까지
    // 기다려야 하는 것은 그래서다.
    await screen.findByText('페이지 pg-2')
    expect(currentPath()).toBe('/projects/p-1/pages/pg-2')
  })
})
