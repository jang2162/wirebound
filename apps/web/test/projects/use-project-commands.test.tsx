/**
 * 목록 훅의 뼈대(P2b-5 Task 3). **화면을 지나지 않고 훅을 직접 태운다** — 탐침 컴포넌트가
 * 훅이 낸 값을 DOM에 적고 케이스는 그것만 읽는다.
 *
 * **훅을 직접 태우는 이유:** D2가 가르는 것은 **잠금(`ref`)과 표시(`state`)**인데, 화면을
 * 지나면 버튼의 `disabled`가 그 둘을 함께 덮어 어느 쪽이 막았는지 드러나지 않는다.
 * P2b-4가 같은 이유로 `use-tree-commands`를 직접 태우는 케이스를 따로 두었다.
 */
import { act, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router'
import { ApiProvider } from '../../src/api/context'
import { ApiError, type ApiClient } from '../../src/api/client'
import type { ProjectDetail } from '../../src/api/types'
import { useProjectCommands, type ProjectCommands } from '../../src/projects/use-project-commands'
import { fakeApi, unauthenticatedError } from '../helpers'

const SERVER_MESSAGE = '프로젝트 저장소가 응답하지 않습니다 [T3-HOOK-1]'

function project(overrides: Partial<ProjectDetail> = {}): ProjectDetail {
  return { id: 'p-1', name: '관리자 콘솔', slug: 'admin', description: null, role: 'owner', ...overrides }
}

/**
 * **마지막 렌더의 `commands`를 손에 쥐는 자리.** 화면을 지나지 않고 훅을 직접 부르는 케이스가
 * 이것을 쓴다 — 버튼의 `disabled`는 `busy`(state)가 만드는 것이라, 그것을 지나면 잠금(`ref`)이
 * 무엇을 막는지 드러나지 않는다.
 */
let latest: ProjectCommands | null = null

/** 훅이 낸 값을 DOM에 적는 탐침. 케이스는 이 문자열만 읽는다. */
function Probe(): ReactElement {
  const commands = useProjectCommands()
  latest = commands
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
      <span data-testid="form">{commands.form === null ? 'closed' : 'open'}</span>
      <span data-testid="names">
        {commands.state.status === 'ready' ? commands.state.projects.map((p) => p.name).join(',') : ''}
      </span>
    </div>
  )
}

function mount(client: ApiClient): void {
  latest = null
  render(
    <ApiProvider client={client}>
      <MemoryRouter initialEntries={['/']}>
        <Probe />
      </MemoryRouter>
    </ApiProvider>,
  )
}

const read = (id: string): string => screen.getByTestId(id).textContent ?? ''

/** 마지막 렌더의 `commands`. 없으면 그 자리에서 실패시킨다. */
function grab(): ProjectCommands {
  if (latest === null) throw new Error('탐침이 commands를 잡지 못했다')
  return latest
}

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

  /**
   * **아래 둘이 D2의 "잠금은 `ref`다"를 재는 자리다.** 화면 케이스(`project-crud.test.tsx`의
   * `요청이 나가 있는 동안 …`)는 버튼의 `disabled`를 재는데 그것은 `busy`(state)가 만든다 —
   * 실제로 막는 `inFlight`(ref)를 지워도 그 케이스는 살아남는다(실측: 0 사망).
   *
   * **P2b-4가 정확히 이 자리에서 사고를 냈다:** 여는 조작 하나가 잠기지 않아 `busy` 중에
   * 삭제 확인이 걸리고, 잠금이 풀린 뒤 클릭 한 번에 지워졌다.
   */
  it('같은 tick에 두 번 제출해도 요청은 한 번이다', async () => {
    // **같은 렌더의 `commands`를 붙잡고 두 번 부른다.** `busy`는 다음 렌더에야 `true`가
    // 되므로 state로는 이 재진입을 막지 못한다.
    let calls = 0
    mount(
      fakeApi({
        listProjects: async () => [project()],
        createProject: async () => {
          calls += 1
          return project({ id: 'p-new' })
        },
      }),
    )
    await waitFor(() => expect(read('status')).toBe('ready'))

    act(() => {
      grab().openCreate()
    })
    // **폼이 열린 뒤의 렌더에서 다시 집는다.** `submitForm`은 자기 렌더의 `form`을 닫으므로,
    // 열기 전에 집은 것으로 부르면 `form === null`이라 그 자리에서 되돌아온다(재서 알았다).
    const opened = grab()
    await act(async () => {
      opened.submitForm({ name: '가', slug: 'ga', description: '' })
      opened.submitForm({ name: '가', slug: 'ga', description: '' })
    })

    expect(calls).toBe(1)
  })

  it('조작이 나가 있는 동안에는 폼이 열리지 않는다', async () => {
    // **여는 것도 잠근다(D2).** 훅 API로는 열리는데, 그때 친 값은 요청도 못 나가고 조용히
    // 사라진다 — `submitForm`이 `run`에 닿아도 `inFlight`가 서 있어 되돌아오기 때문이다.
    let release = (): void => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    mount(
      fakeApi({
        listProjects: async () => [project()],
        createProject: async () => {
          await gate
          return project({ id: 'p-new' })
        },
      }),
    )
    await waitFor(() => expect(read('status')).toBe('ready'))

    act(() => {
      grab().openCreate()
    })
    act(() => {
      grab().submitForm({ name: '가', slug: 'ga', description: '' })
    })
    // 요청이 나가 있다. 폼은 성공한 뒤에 닫히므로 아직 열려 있다 — **닫는 것은 잠기지 않는다.**
    await waitFor(() => expect(read('busy')).toBe('true'))
    act(() => {
      grab().closeForm()
    })
    expect(read('form')).toBe('closed')

    // **여기가 P2b-4의 사고 자리다** — 잠금 중에 열리면 친 값이 조용히 사라진다.
    act(() => {
      grab().openCreate()
    })
    expect(read('form')).toBe('closed')

    release()
    await waitFor(() => expect(read('busy')).toBe('false'))
    // 잠금이 풀리면 다시 열린다 — **영구 차단이 아니라 잠금이다.**
    act(() => {
      grab().openCreate()
    })
    expect(read('form')).toBe('open')
  })
})
