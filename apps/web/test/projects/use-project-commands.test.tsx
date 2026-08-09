/**
 * 목록 훅의 뼈대(P2b-5 Task 3). **화면을 지나지 않고 훅을 직접 태운다** — 탐침 컴포넌트가
 * 훅이 낸 값을 DOM에 적고 케이스는 그것만 읽는다.
 *
 * **훅을 직접 태우는 이유:** D2가 가르는 것은 **잠금(`ref`)과 표시(`state`)**인데, 화면을
 * 지나면 버튼의 `disabled`가 그 둘을 함께 덮어 어느 쪽이 막았는지 드러나지 않는다.
 * P2b-4가 같은 이유로 `use-tree-commands`를 직접 태우는 케이스를 따로 두었다.
 */
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router'
import { ApiProvider } from '../../src/api/context'
import { ApiError, type ApiClient } from '../../src/api/client'
import type { ProjectDetail } from '../../src/api/types'
import { useProjectCommands } from '../../src/projects/use-project-commands'
import { fakeApi, unauthenticatedError } from '../helpers'

const SERVER_MESSAGE = '프로젝트 저장소가 응답하지 않습니다 [T3-HOOK-1]'

function project(overrides: Partial<ProjectDetail> = {}): ProjectDetail {
  return { id: 'p-1', name: '관리자 콘솔', slug: 'admin', description: null, role: 'owner', ...overrides }
}

/** 훅이 낸 값을 DOM에 적는 탐침. 케이스는 이 문자열만 읽는다. */
function Probe(): ReactElement {
  const commands = useProjectCommands()
  return (
    <div>
      <span data-testid="status">{commands.state.status}</span>
      <span data-testid="busy">{String(commands.busy)}</span>
      <span data-testid="failure">
        {commands.failure === null ? 'null' : commands.failure.kind === 'signed-out' ? 'signed-out' : commands.failure.message}
      </span>
      <span data-testid="load-failure">
        {commands.state.status === 'failed'
          ? commands.state.failure.kind === 'signed-out'
            ? 'signed-out'
            : commands.state.failure.message
          : 'none'}
      </span>
      <span data-testid="names">
        {commands.state.status === 'ready' ? commands.state.projects.map((p) => p.name).join(',') : ''}
      </span>
    </div>
  )
}

function mount(client: ApiClient): void {
  render(
    <ApiProvider client={client}>
      <MemoryRouter initialEntries={['/']}>
        <Probe />
      </MemoryRouter>
    </ApiProvider>,
  )
}

const read = (id: string): string => screen.getByTestId(id).textContent ?? ''

describe('useProjectCommands — 뼈대', () => {
  it('마운트하면 목록을 받아 ready가 된다', async () => {
    mount(fakeApi({ listProjects: async () => [project(), project({ id: 'p-2', name: '고객 포털' })] }))

    await waitFor(() => expect(read('status')).toBe('ready'))
    expect(read('names')).toBe('관리자 콘솔,고객 포털')
  })

  it('조회가 실패하면 그 실패는 state에 담기고 조작 실패는 null로 남는다', async () => {
    // **D8이 가르는 두 상태를 처음부터 갈라 둔다.** 조회 실패가 `failure`(조작)에도 실리면
    // 다음 조작이 성공했을 때 그 문장이 함께 지워져, 목록을 못 받은 사실이 화면에서 사라진다.
    mount(
      fakeApi({
        listProjects: async () => {
          throw new ApiError(500, 'internal', SERVER_MESSAGE)
        },
      }),
    )

    await waitFor(() => expect(read('status')).toBe('failed'))
    expect(read('load-failure')).toBe(SERVER_MESSAGE)
    // **조작 실패는 건드리지 않는다** — 조작을 한 적이 없다.
    expect(read('failure')).toBe('null')
  })

  it('세션이 끊긴 조회 실패는 signed-out으로 옮겨진다', async () => {
    // 판정은 `api/failure.tsx`가 한다(D5). 훅이 다시 판정하지 않는 것을 여기서 고정한다.
    mount(
      fakeApi({
        listProjects: async () => {
          throw unauthenticatedError()
        },
      }),
    )

    await waitFor(() => expect(read('status')).toBe('failed'))
    expect(read('load-failure')).toBe('signed-out')
  })

  it('조작이 없으면 busy는 서지 않는다', async () => {
    // 양성 대조 — `busy`가 늘 `true`인 구현이 위 케이스들을 통과하지 못하게 한다.
    mount(fakeApi({ listProjects: async () => [project()] }))

    await waitFor(() => expect(read('status')).toBe('ready'))
    expect(read('busy')).toBe('false')
  })
})
