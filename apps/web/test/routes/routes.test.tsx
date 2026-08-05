import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from '../../src/app'
import type { SessionUser } from '../../src/api/types'
import { currentPath, fakeApi, renderWithProviders } from '../helpers'

const USER: SessionUser = { id: 'u-1', email: 'me@example.com', name: '테스터' }

/** 로그인된 상태로 라우트 표(설계 D6)만 본다. */
function renderAt(route: string): void {
  renderWithProviders(<App />, { client: fakeApi({ me: async () => USER }), route })
}

// 뒤 태스크의 화면이 전부 이 표 안으로 들어온다. 지금 자리 표시자가 들어 있는 것은
// 라우트가 실제로 잡히는지와 경로 파라미터가 풀리는지를 지금 못박아 두기 위해서다.
describe('라우트 표', () => {
  it('프로젝트 라우트는 projectId를 넘겨준다', async () => {
    renderAt('/projects/p-1')

    await screen.findByText('프로젝트 p-1')
    expect(currentPath()).toBe('/projects/p-1')
    // 페이지 없이 들어온 것과 페이지를 연 것이 구분돼야 한다.
    expect(screen.queryByText(/^페이지 /)).toBeNull()
  })

  it('페이지 라우트는 projectId와 pageId를 함께 넘겨준다', async () => {
    renderAt('/projects/p-1/pages/pg-2')

    await screen.findByText('프로젝트 p-1')
    screen.getByText('페이지 pg-2')
    expect(currentPath()).toBe('/projects/p-1/pages/pg-2')
  })
})
