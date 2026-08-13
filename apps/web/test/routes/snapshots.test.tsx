/**
 * 스냅샷 화면(P6-1 T4).
 *
 * **이 파일의 요점은 실패의 화면판이다.** *"실패했다고 말하는데 조작은 일어났다"*가
 * P5-1·P5-2·P5-3에서 여섯 형태로 관측됐고, 계획서 T4가 그 화면판을 확인하라고 적었다.
 * 아래 `저장이 실패했을 때 화면에 남는 것` 블록이 그것을 셋으로 나눠 잰다.
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { App } from '../../src/app'
import { ApiError, type ApiClient } from '../../src/api/client'
import type { ProjectDetail, ProjectRole, RestoreResult, SnapshotSummary } from '../../src/api/types'
import { currentPath, expiringSession, fakeApi, renderWithProviders } from '../helpers'

const PROJECT_ID = 'p1'
const ROUTE = `/projects/${PROJECT_ID}/snapshots`

/** 문지기(`RequireAuth`)를 지나려면 `me`가 있어야 한다. 이 라우트는 그 아래에 산다. */
const user = { id: 'u1', email: 'a@example.com', name: '홍길동' }

function project(role: ProjectRole): ProjectDetail {
  return { id: PROJECT_ID, name: '관리자 화면', slug: 'admin', description: null, role }
}

function snapshot(overrides: Partial<SnapshotSummary> = {}): SnapshotSummary {
  return {
    id: 's1',
    tag: 'v1',
    description: '첫 릴리스 직전',
    createdBy: 'u1',
    createdByName: '홍길동',
    createdAt: '2026-08-12T09:00:00.000Z',
    payloadBytes: 8123,
    ...overrides,
  }
}

/** 서버가 태그 중복으로 내는 409. **문장이 지문 불일치와 다르다**(서버 README). */
function duplicateTagError(): ApiError {
  return new ApiError(409, 'conflict', '같은 태그의 스냅샷이 이미 있습니다')
}

/** 서버가 지문 불일치로 내는 409. */
function fingerprintError(): ApiError {
  return new ApiError(409, 'conflict', '스냅샷을 뜨는 동안 프로젝트가 바뀌었습니다. 다시 시도해 주세요')
}

/**
 * **`fireEvent`다 — `@testing-library/user-event`는 이 저장소의 의존이 아니다**(전역 제약:
 * *"`apps/web`에 새 런타임 의존을 더하지 않는다"*). `theme-editor.test.tsx`가 같은 선례다.
 */
function saveWith(tag: string, description?: string): void {
  fireEvent.change(screen.getByLabelText('태그'), { target: { value: tag } })
  if (description !== undefined) {
    fireEvent.change(screen.getByLabelText('설명'), { target: { value: description } })
  }
  fireEvent.click(screen.getByRole('button', { name: '지금 상태를 태그로 저장' }))
}

describe('목록', () => {
  it('태그·설명·만든 사람·시각·바이트를 그린다', async () => {
    const client = fakeApi({
      me: async () => user,
      getProject: async () => project('owner'),
      listSnapshots: async () => [snapshot()],
    })

    renderWithProviders(<App />, { client, route: ROUTE })

    expect(await screen.findByText('v1')).toBeTruthy()
    expect(screen.getByText('첫 릴리스 직전')).toBeTruthy()
    expect(screen.getByText('홍길동')).toBeTruthy()
    expect(screen.getByText('2026-08-12T09:00:00.000Z')).toBeTruthy()
    // **자릿수 구분만 하고 단위를 바꾸지 않는다** — KB로 접으면 작은 스냅샷이 전부 `0KB`가
    // 되어 §16을 닫을 관측이 사라진다.
    expect(screen.getByText('8,123B')).toBeTruthy()
  })

  it('비었으면 그렇게 말한다', async () => {
    const client = fakeApi({
      me: async () => user,
      getProject: async () => project('owner'),
      listSnapshots: async () => [],
    })

    renderWithProviders(<App />, { client, route: ROUTE })

    expect(await screen.findByText('아직 스냅샷이 없습니다.')).toBeTruthy()
  })

  /**
   * **복원 버튼은 없다 — 회색으로 비활성해 두지도 않는다**(계획서 D1). 이 케이스는
   * *"없는 기능을 UI에 그려 두지 않는다"*를 **비활성 버튼까지 포함해서** 잰다.
   */
  /**
   * **P6-1의 `복원 버튼이 없다`를 갱신한 자리다.** 그 케이스가 지키던 명제는 *"없는 기능을
   * UI에 그려 두지 않는다"*였다. P6-2가 기능을 만들었으므로 owner에게는 버튼이 서지만,
   * **owner가 아닌 사람에게는 여전히 없어야 한다 — 회색으로도 없다**(D11). 형태가
   * *"아무에게도 없다"*에서 *"owner에게만 있다"*로 바뀌었을 뿐이라 지우지 않고 이어받는다.
   */
  for (const role of ['editor', 'viewer'] as const) {
    it(`${role}에게는 복원 버튼이 없다 — 비활성 상태로도 없다`, async () => {
      const client = fakeApi({
        me: async () => user,
        getProject: async () => project(role),
        listSnapshots: async () => [snapshot()],
      })

      renderWithProviders(<App />, { client, route: ROUTE })
      await screen.findByText('v1')

      // `hidden: true`로 훑어 `aria-hidden`이나 비활성 버튼까지 본다.
      // **`queryAllByRole`이다** — viewer에게는 저장 폼도 없어 버튼이 **0개**이고,
      // `getAllByRole`은 0개에서 던진다(그러면 이 케이스가 재려는 것과 무관하게 죽는다).
      const labels = screen.queryAllByRole('button', { hidden: true }).map((button) => button.textContent)
      expect(labels.filter((label) => label !== null && /복원|되돌리/.test(label))).toEqual([])
    })
  }

  it('owner에게는 줄마다 복원 버튼이 선다', async () => {
    const client = fakeApi({
      me: async () => user,
      getProject: async () => project('owner'),
      listSnapshots: async () => [snapshot(), snapshot({ id: 's2', tag: 'v2' })],
    })

    renderWithProviders(<App />, { client, route: ROUTE })
    await screen.findByText('v1')

    expect(screen.getAllByRole('button', { name: '이 상태로 되돌리기' })).toHaveLength(2)
  })
})

/**
 * 복원(P6-2 D11). **확인을 받고, 결과를 말한다.**
 *
 * 이 블록이 재는 것 넷: 확인 단계가 실제로 있는가 · 결과가 말할 넷을 말하는가 ·
 * 실패가 서버 문장 그대로 보이는가 · **성공 뒤 재조회가 실패해도 성공 알림이 남는가**
 * (P6-1의 일곱째 — 복원은 그 부류가 더 위험하다).
 */
describe('복원 (P6-2 D11)', () => {
  function restoreResult(overrides: Partial<RestoreResult> = {}): RestoreResult {
    return {
      summary: {
        menu: { created: 0, updated: 1, deleted: 0 },
        pages: { created: 0, metaUpdated: 0, schemaChanged: 2, schemaUnchanged: 3, deleted: 1 },
        comments: { created: 0, updated: 0, deleted: 0 },
        layouts: { themeRefChanged: 0 },
      },
      safetySnapshot: { id: 's9', tag: '복원 전 2026-08-12T09:24:30.443Z' },
      themes: [{ layoutId: 'l1', themeId: 't1', differs: false }],
      ...overrides,
    }
  }

  /** owner로 목록을 그리고 첫 줄의 복원 버튼을 누른 상태까지 간다. */
  async function openConfirm(client: ApiClient): Promise<void> {
    renderWithProviders(<App />, { client, route: ROUTE })
    await screen.findByText('v1')
    fireEvent.click(screen.getByRole('button', { name: '이 상태로 되돌리기' }))
  }

  it('버튼 한 번으로는 되돌리지 않는다 — 확인을 받는다', async () => {
    const restore = vi.fn(async () => restoreResult())
    const client = fakeApi({
      me: async () => user,
      getProject: async () => project('owner'),
      listSnapshots: async () => [snapshot()],
      restoreSnapshot: restore,
    })

    await openConfirm(client)

    // **아직 아무것도 부르지 않았다.**
    expect(restore).not.toHaveBeenCalled()
    // 무엇을 되돌리는지 문장이 말한다 — 줄이 여럿인 목록에서 어느 줄에 답하는지 알 수 있어야 한다.
    expect(screen.getByRole('alert').textContent).toContain('v1')
    expect(screen.getByRole('alert').textContent).toContain('프로젝트 전체가 바뀝니다')
  })

  it('취소하면 부르지 않고 확인만 닫는다', async () => {
    const restore = vi.fn(async () => restoreResult())
    const client = fakeApi({
      me: async () => user,
      getProject: async () => project('owner'),
      listSnapshots: async () => [snapshot()],
      restoreSnapshot: restore,
    })

    await openConfirm(client)
    fireEvent.click(screen.getByRole('button', { name: '취소' }))

    expect(restore).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '이 상태로 되돌리기' })).toBeTruthy()
  })

  it('확인하면 그 스냅샷 id로 부른다', async () => {
    const restore = vi.fn(async () => restoreResult())
    const client = fakeApi({
      me: async () => user,
      getProject: async () => project('owner'),
      listSnapshots: async () => [snapshot({ id: 's7' })],
      restoreSnapshot: restore,
    })

    await openConfirm(client)
    fireEvent.click(screen.getByRole('button', { name: '되돌린다' }))

    await waitFor(() => expect(restore).toHaveBeenCalledWith(PROJECT_ID, 's7'))
  })

  /**
   * **바뀐 수와 그대로인 수를 따로 말한다**(D11). 둘째가 빠지면 *"0개가 바뀌었습니다"*가
   * **아무 일도 안 일어난 것**과 **전부 그대로였던 것**을 구분하지 못한다.
   */
  it('결과가 넷을 말한다 — 바뀐 수·그대로인 수·안전망 태그·테마 차이', async () => {
    const client = fakeApi({
      me: async () => user,
      getProject: async () => project('owner'),
      listSnapshots: async () => [snapshot()],
      restoreSnapshot: async () => restoreResult({ themes: [{ layoutId: 'l1', themeId: 't1', differs: true }] }),
    })

    await openConfirm(client)
    fireEvent.click(screen.getByRole('button', { name: '되돌린다' }))

    const status = await screen.findByRole('status')
    expect(status.textContent).toContain('v1')
    expect(status.textContent).toContain('2개가 바뀌')
    expect(status.textContent).toContain('3개는 그대로')
    expect(status.textContent).toContain('복원 전 2026-08-12T09:24:30.443Z')
    expect(status.textContent).toContain('테마는 스냅샷 당시와 다릅니다')
  })

  it('테마가 같으면 테마 이야기를 하지 않는다 — 매번 보이는 줄은 신호가 아니다', async () => {
    const client = fakeApi({
      me: async () => user,
      getProject: async () => project('owner'),
      listSnapshots: async () => [snapshot()],
      restoreSnapshot: async () => restoreResult(),
    })

    await openConfirm(client)
    fireEvent.click(screen.getByRole('button', { name: '되돌린다' }))

    const status = await screen.findByRole('status')
    expect(status.textContent).toContain('되돌렸습니다')
    expect(status.textContent).not.toContain('테마')
  })

  it('성공하면 목록을 다시 받는다 — 프로젝트가 바뀌었고 안전망이 하나 생겼다', async () => {
    const list = vi.fn(async () => [snapshot()])
    const client = fakeApi({
      me: async () => user,
      getProject: async () => project('owner'),
      listSnapshots: list,
      restoreSnapshot: async () => restoreResult(),
    })

    await openConfirm(client)
    expect(list).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: '되돌린다' }))

    await waitFor(() => expect(list).toHaveBeenCalledTimes(2))
  })

  /**
   * **서버 문장을 그대로 그린다.** 복원의 실패는 여덟 갈래인데 코드로는 넷으로만 갈린다 —
   * 화면이 문안을 다시 쓰면 사용자는 *"레이아웃이 다르다"*와 *"다시 시도하라"*를 구분하지 못한다.
   */
  it('실패하면 서버 문장을 그대로 보이고 목록을 다시 받지 않는다', async () => {
    const list = vi.fn(async () => [snapshot()])
    const client = fakeApi({
      me: async () => user,
      getProject: async () => project('owner'),
      listSnapshots: list,
      restoreSnapshot: async () => {
        throw new ApiError(409, 'conflict', '레이아웃 구성이 스냅샷과 다릅니다 (스냅샷 1개, 현재 2개). 복원하지 않았습니다')
      },
    })

    await openConfirm(client)
    fireEvent.click(screen.getByRole('button', { name: '되돌린다' }))

    const alert = await screen.findByText(/레이아웃 구성이 스냅샷과 다릅니다/)
    expect(alert).toBeTruthy()
    // **실패한 복원이 목록을 바꿀 수 없다.**
    expect(list).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('status')).toBeNull()
  })

  /**
   * **P6-1의 일곱째 — 복원은 그 부류가 더 위험하다.** 사용자가 실패한 줄 알고 다시 누르면
   * 이미 되돌아간 상태 위에 **안전망 스냅샷이 하나 더 쌓이고, 스냅샷은 지울 수 없다**(§4.5).
   */
  it('성공 뒤 목록 재조회가 실패해도 성공 알림이 남는다', async () => {
    let calls = 0
    const client = fakeApi({
      me: async () => user,
      getProject: async () => project('owner'),
      listSnapshots: async () => {
        calls += 1
        if (calls > 1) throw new ApiError(500, 'internal', '서버 오류가 발생했습니다')
        return [snapshot()]
      },
      restoreSnapshot: async () => restoreResult(),
    })

    await openConfirm(client)
    fireEvent.click(screen.getByRole('button', { name: '되돌린다' }))

    // 성공 알림과 재조회 실패가 **나란히** 선다 — 하나가 다른 하나를 지우지 않는다.
    const status = await screen.findByRole('status')
    expect(status.textContent).toContain('되돌렸습니다')
    await waitFor(() => expect(screen.getByText(/저장은 됐지만 목록을 갱신하지 못했습니다/)).toBeTruthy())
    // 화면이 갈아엎히지 않았다 — 목록이 그대로 있다.
    expect(screen.getByText('v1')).toBeTruthy()
  })

  it('저장 성공 알림과 복원 성공 알림이 함께 보이지 않는다 — 알림은 하나다', async () => {
    const client = fakeApi({
      me: async () => user,
      getProject: async () => project('owner'),
      listSnapshots: async () => [snapshot()],
      createSnapshot: async () => snapshot({ id: 's2', tag: 'v2' }),
      restoreSnapshot: async () => restoreResult(),
    })

    renderWithProviders(<App />, { client, route: ROUTE })
    await screen.findByText('v1')
    saveWith('v2')
    await screen.findByText('v2 저장됨')

    fireEvent.click(screen.getAllByRole('button', { name: '이 상태로 되돌리기' })[0]!)
    fireEvent.click(screen.getByRole('button', { name: '되돌린다' }))

    await screen.findByText(/되돌렸습니다/)
    expect(screen.queryByText('v2 저장됨')).toBeNull()
  })
})

describe('권한 (§10 — 생성은 editor)', () => {
  it('editor는 저장 폼을 본다', async () => {
    const client = fakeApi({
      me: async () => user,
      getProject: async () => project('editor'),
      listSnapshots: async () => [],
    })

    renderWithProviders(<App />, { client, route: ROUTE })

    expect(await screen.findByRole('button', { name: '지금 상태를 태그로 저장' })).toBeTruthy()
  })

  it('viewer는 목록만 본다 — 폼 자리에 이유가 있다', async () => {
    const client = fakeApi({
      me: async () => user,
      getProject: async () => project('viewer'),
      listSnapshots: async () => [snapshot()],
    })

    renderWithProviders(<App />, { client, route: ROUTE })

    expect(await screen.findByText('v1')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '지금 상태를 태그로 저장' })).toBeNull()
    expect(screen.getByText(/스냅샷을 만들 권한이 없습니다/)).toBeTruthy()
  })
})

describe('저장', () => {
  it('태그를 보내고 성공하면 목록을 다시 받는다', async () => {
    const createSnapshot = vi.fn(async () => snapshot({ tag: 'v2' }))
    const listSnapshots = vi
      .fn<() => Promise<SnapshotSummary[]>>()
      .mockResolvedValueOnce([])
      .mockResolvedValue([snapshot({ tag: 'v2' })])
    const client = fakeApi({
      me: async () => user,
      getProject: async () => project('owner'),
      listSnapshots,
      createSnapshot,
    })

    renderWithProviders(<App />, { client, route: ROUTE })
    await screen.findByText('아직 스냅샷이 없습니다.')
    saveWith('v2')

    await waitFor(() => expect(createSnapshot).toHaveBeenCalledWith(PROJECT_ID, { tag: 'v2' }))
    expect(await screen.findByText('v2')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('v2 저장됨')
  })

  /**
   * **빈 설명은 키를 만들지 않는다.** `''`를 보내면 *"설명이 빈 문자열"*이 되고 `null`
   * (적지 않음)과 갈린다 — 서버가 둘을 다르게 저장한다(`description` 컬럼이 nullable이다).
   */
  it('설명을 적지 않으면 그 키를 보내지 않는다', async () => {
    // **`vi.fn(async () => …)`으로 두면 인자 튜플이 `[]`로 추론되어 `mock.calls[0][1]`이
    // 컴파일 오류다**(vitest는 타입을 안 보므로 테스트만으로는 안 드러난다 — 이 파일에서
    // 실제로 그렇게 났다). `ApiClient['createSnapshot']`을 그대로 씌워 인자 모양을 준다.
    const createSnapshot = vi.fn<ApiClient['createSnapshot']>(async () => snapshot())
    const client = fakeApi({
      me: async () => user,
      getProject: async () => project('owner'),
      listSnapshots: async () => [],
      createSnapshot,
    })

    renderWithProviders(<App />, { client, route: ROUTE })
    await screen.findByText('아직 스냅샷이 없습니다.')
    saveWith('v1')

    await waitFor(() => expect(createSnapshot).toHaveBeenCalledTimes(1))
    expect(Object.hasOwn(createSnapshot.mock.calls[0]![1], 'description')).toBe(false)
  })

  it('설명을 적으면 함께 보낸다', async () => {
    const createSnapshot = vi.fn(async () => snapshot())
    const client = fakeApi({
      me: async () => user,
      getProject: async () => project('owner'),
      listSnapshots: async () => [],
      createSnapshot,
    })

    renderWithProviders(<App />, { client, route: ROUTE })
    await screen.findByText('아직 스냅샷이 없습니다.')
    saveWith('v1', '릴리스 직전')

    await waitFor(() =>
      expect(createSnapshot).toHaveBeenCalledWith(PROJECT_ID, { tag: 'v1', description: '릴리스 직전' }),
    )
  })
})

/**
 * # 두 409가 서로 다른 문장으로 보인다 (계획서 T4)
 *
 * 사용자가 할 일이 다르다 — 태그 중복은 *"이름을 바꾼다"*이고 지문 불일치는 *"그대로 다시
 * 보낸다"*이다. **코드는 둘 다 `conflict`이라 화면이 코드로는 가를 수 없고**, 서버가 문장을
 * 갈라 준다. 그래서 화면은 문안을 다시 쓰지 않고 서버 문장을 그대로 그린다.
 */
describe('두 409를 가른다', () => {
  it('태그 중복이면 이름을 바꾸라는 문장이 보인다', async () => {
    const client = fakeApi({
      me: async () => user,
      getProject: async () => project('owner'),
      listSnapshots: async () => [snapshot()],
      createSnapshot: async () => {
        throw duplicateTagError()
      },
    })

    renderWithProviders(<App />, { client, route: ROUTE })
    await screen.findByText('v1')
    saveWith('v1')

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('같은 태그의 스냅샷이 이미 있습니다')
    expect(alert.textContent).not.toContain('다시 시도')
  })

  it('지문 불일치면 다시 시도하라는 문장이 보인다', async () => {
    const client = fakeApi({
      me: async () => user,
      getProject: async () => project('owner'),
      listSnapshots: async () => [snapshot()],
      createSnapshot: async () => {
        throw fingerprintError()
      },
    })

    renderWithProviders(<App />, { client, route: ROUTE })
    await screen.findByText('v1')
    saveWith('v2')

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('다시 시도')
    expect(alert.textContent).not.toContain('이미 있습니다')
  })
})

/**
 * # *"실패했다고 말하는데 조작은 일어났다"*의 화면판 (사실 5)
 *
 * 셋을 각각 잰다. **셋째가 요점이다** — 성공과 실패 표시를 각각의 상태로 두면 *"저장됨"*과
 * 오류가 함께 보이는 조합이 생긴다.
 */
describe('저장이 실패했을 때 화면에 남는 것', () => {
  it('목록에 새 줄이 생기지 않는다 — 목록을 다시 받지 않는다', async () => {
    const listSnapshots = vi.fn(async () => [snapshot()])
    const client = fakeApi({
      me: async () => user,
      getProject: async () => project('owner'),
      listSnapshots,
      createSnapshot: async () => {
        throw duplicateTagError()
      },
    })

    renderWithProviders(<App />, { client, route: ROUTE })
    await screen.findByText('v1')
    saveWith('v1')

    await screen.findByRole('alert')
    // 목록 조회가 한 번뿐이다 = 실패한 저장이 목록을 다시 받게 하지 않았다.
    expect(listSnapshots).toHaveBeenCalledTimes(1)
    expect(screen.getAllByText('v1')).toHaveLength(1)
  })

  it('폼이 비워지지 않는다 — 다시 시도할 때 사용자가 다시 타이핑하지 않는다', async () => {
    const client = fakeApi({
      me: async () => user,
      getProject: async () => project('owner'),
      listSnapshots: async () => [],
      createSnapshot: async () => {
        throw fingerprintError()
      },
    })

    renderWithProviders(<App />, { client, route: ROUTE })
    await screen.findByText('아직 스냅샷이 없습니다.')
    saveWith('v9')

    await screen.findByRole('alert')
    expect((screen.getByLabelText('태그') as HTMLInputElement).value).toBe('v9')
  })

  it('앞의 "저장됨"이 오류와 함께 남지 않는다', async () => {
    const createSnapshot = vi
      .fn<() => Promise<SnapshotSummary>>()
      .mockResolvedValueOnce(snapshot({ tag: 'v1' }))
      .mockRejectedValue(duplicateTagError())
    const client = fakeApi({
      me: async () => user,
      getProject: async () => project('owner'),
      listSnapshots: async () => [snapshot()],
      createSnapshot,
    })

    renderWithProviders(<App />, { client, route: ROUTE })
    await screen.findByText('v1')

    saveWith('v1')
    expect((await screen.findByRole('status')).textContent).toContain('저장됨')

    saveWith('v1')
    await screen.findByRole('alert')
    // **성공 알림이 사라졌다.** 남아 있으면 "저장됨"과 오류가 함께 보인다.
    expect(screen.queryByRole('status')).toBeNull()
  })

  /**
   * **위 케이스는 `setNotice(null)`을 재지 못한다 — 심어서 알았다.**
   *
   * 그 줄을 지워도 **0 사망**이다. `notice`가 판별 유니온 **하나**라서 실패 경로의
   * `setNotice({kind:'error'})`가 앞 값을 어차피 덮기 때문이다 — *"둘이 함께 보이지
   * 않는다"*를 떠받치는 것은 그 줄이 아니라 **상태를 하나로 둔 구조**다.
   *
   * `setNotice(null)`이 실제로 지키는 것은 **요청이 도는 동안**이다: 지우지 않으면 앞의
   * *"저장됨"*이 다음 요청 내내 화면에 남아, 사용자가 **아직 끝나지 않은 저장을 이미
   * 성공했다고 읽는다.** 이 케이스가 그 창을 잰다 — 응답을 붙들어 둔 채 화면을 본다.
   */
  it('요청이 도는 동안 앞의 "저장됨"이 남지 않는다', async () => {
    let release: (() => void) | undefined
    const createSnapshot = vi
      .fn<() => Promise<SnapshotSummary>>()
      .mockResolvedValueOnce(snapshot({ tag: 'v1' }))
      .mockImplementationOnce(
        () =>
          new Promise<SnapshotSummary>((resolve) => {
            release = () => resolve(snapshot({ tag: 'v2' }))
          }),
      )
    const client = fakeApi({
      me: async () => user,
      getProject: async () => project('owner'),
      listSnapshots: async () => [snapshot()],
      createSnapshot,
    })

    renderWithProviders(<App />, { client, route: ROUTE })
    await screen.findByText('v1')

    saveWith('v1')
    expect((await screen.findByRole('status')).textContent).toContain('저장됨')

    // 두 번째 저장은 응답이 오지 않는다 — 그 사이의 화면을 본다.
    saveWith('v2')
    await waitFor(() => expect(createSnapshot).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('status')).toBeNull()

    // 붙들어 둔 응답을 풀어 준다 — 안 풀면 이 테스트가 끝난 뒤 상태 갱신이 새어 나간다.
    release?.()
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('v2 저장됨'))
  })
})

/**
 * # 일곱째 — **저장은 성공했는데 목록 재조회가 실패하는** 갈래
 *
 * 위 셋은 *"저장이 실패했을 때"*를 다룬다. 이 블록은 그 반대편이다. **리뷰가 찾았고
 * 이월이 아니라 고치는 쪽으로 판정했다** — 성공했는데 실패만 보이면 사용자는 같은 태그로
 * 다시 시도해 409를 받고, 스냅샷은 지울 수 없으므로(§4.5) 그 태그는 영영 그 이름이다.
 *
 * 고치기 전 실측: 화면 전문이 `"스냅샷을 열지 못했습니다서버 오류가 발생했습니다…"`이고
 * `role=status`가 **빈 배열**이었다 — *"저장됨"*이 통째로 사라졌다.
 */
describe('저장은 됐는데 목록만 못 받았을 때', () => {
  /** 두 번째 조회부터 실패하는 `listSnapshots`. 첫 조회(화면 진입)는 성공해야 한다. */
  function listThenFail(): ReturnType<typeof vi.fn<() => Promise<SnapshotSummary[]>>> {
    return vi
      .fn<() => Promise<SnapshotSummary[]>>()
      .mockResolvedValueOnce([])
      .mockRejectedValue(new ApiError(500, 'internal', '서버 오류가 발생했습니다'))
  }

  function savedThenFailingReload() {
    return fakeApi({
      me: async () => user,
      getProject: async () => project('owner'),
      listSnapshots: listThenFail(),
      createSnapshot: async () => snapshot({ tag: 'v2' }),
    })
  }

  it('"저장됨"이 그대로 남는다', async () => {
    renderWithProviders(<App />, { client: savedThenFailingReload(), route: ROUTE })
    await screen.findByText('아직 스냅샷이 없습니다.')
    saveWith('v2')

    // 목록 갱신 실패가 화면에 뜬 **뒤에도** 성공 알림이 살아 있어야 한다.
    await screen.findByRole('alert')
    expect(screen.getByRole('status').textContent).toContain('v2 저장됨')
  })

  it('목록을 못 갱신했다는 것도 함께 보인다 — 서버 문장을 그대로 싣는다', async () => {
    renderWithProviders(<App />, { client: savedThenFailingReload(), route: ROUTE })
    await screen.findByText('아직 스냅샷이 없습니다.')
    saveWith('v2')

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('저장은 됐지만 목록을 갱신하지 못했습니다')
    expect(alert.textContent).toContain('서버 오류가 발생했습니다')
  })

  it('오류 화면으로 갈아엎지 않는다 — 목록이 그대로 있다', async () => {
    const client = fakeApi({
      me: async () => user,
      getProject: async () => project('owner'),
      listSnapshots: vi
        .fn<() => Promise<SnapshotSummary[]>>()
        .mockResolvedValueOnce([snapshot({ tag: 'v1' })])
        .mockRejectedValue(new ApiError(500, 'internal', '서버 오류가 발생했습니다')),
      createSnapshot: async () => snapshot({ tag: 'v2' }),
    })

    renderWithProviders(<App />, { client, route: ROUTE })
    await screen.findByText('v1')
    saveWith('v2')

    await screen.findByRole('alert')
    // 앞서 받은 목록이 살아 있다. 갈아엎었다면 `FAILURE_TITLE` 화면만 남는다.
    expect(screen.getByText('v1')).toBeTruthy()
    expect(screen.queryByText('스냅샷을 열지 못했습니다')).toBeNull()
    // 폼도 살아 있어야 다시 시도할 수 있다.
    expect(screen.getByRole('button', { name: '지금 상태를 태그로 저장' })).toBeTruthy()
  })

  /**
   * **`signed-out`만 예외다.** 세션이 끊긴 것은 *"목록만 못 받았다"*가 아니다 — 낡은 목록을
   * 계속 보여 주면 사용자가 아직 로그인해 있다고 믿는다.
   */
  it('세션이 끊겼으면 목록을 붙들지 않고 로그인으로 보낸다', async () => {
    const client = fakeApi({
      me: expiringSession(user),
      getProject: async () => project('owner'),
      listSnapshots: vi
        .fn<() => Promise<SnapshotSummary[]>>()
        .mockResolvedValueOnce([])
        .mockRejectedValue(new ApiError(401, 'unauthenticated', '로그인이 필요합니다')),
      createSnapshot: async () => snapshot({ tag: 'v2' }),
    })

    renderWithProviders(<App />, { client, route: ROUTE })
    await screen.findByText('아직 스냅샷이 없습니다.')
    saveWith('v2')

    await waitFor(() => expect(currentPath()).toBe('/login'))
  })

  /** **첫 조회 실패는 그대로 오류 화면이다** — 붙들 화면이 아직 없다. 음성 대조. */
  it('첫 조회가 실패하면 여전히 오류 화면이다', async () => {
    const client = fakeApi({
      me: async () => user,
      getProject: async () => project('owner'),
      listSnapshots: async () => {
        throw new ApiError(500, 'internal', '서버 오류가 발생했습니다')
      },
    })

    renderWithProviders(<App />, { client, route: ROUTE })

    expect(await screen.findByText('스냅샷을 열지 못했습니다')).toBeTruthy()
  })

  /** 재조회가 성공하면 그 문장이 사라진다 — 남아 있으면 낫지 않은 실패를 계속 말한다. */
  it('다음 저장이 목록까지 성공하면 그 문장이 사라진다', async () => {
    const client = fakeApi({
      me: async () => user,
      getProject: async () => project('owner'),
      listSnapshots: vi
        .fn<() => Promise<SnapshotSummary[]>>()
        .mockResolvedValueOnce([])
        .mockRejectedValueOnce(new ApiError(500, 'internal', '서버 오류가 발생했습니다'))
        .mockResolvedValue([snapshot({ tag: 'v3' })]),
      createSnapshot: async () => snapshot({ tag: 'v3' }),
    })

    renderWithProviders(<App />, { client, route: ROUTE })
    await screen.findByText('아직 스냅샷이 없습니다.')
    saveWith('v2')
    await screen.findByRole('alert')

    saveWith('v3')

    expect(await screen.findByText('v3')).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(screen.getByRole('status').textContent).toContain('v3 저장됨')
  })
})

describe('조회 실패', () => {
  it('세션이 끊겼으면 로그인으로 보낸다', async () => {
    // **문지기는 통과시키고 그다음 조회부터 401이다.** 재현하는 상황은 *"화면에 들어와
    // 있는 동안 서버가 세션을 지웠다"*이고, `expiringSession`이 그 형태를 만든다 —
    // 뒤 호출까지 성공하게 두면 로그인 화면이 다시 목록으로 돌려보내 두 주소를 오간다.
    const client = fakeApi({
      me: expiringSession(user),
      getProject: async () => {
        throw new ApiError(401, 'unauthenticated', '로그인이 필요합니다')
      },
      listSnapshots: async () => [],
    })

    renderWithProviders(<App />, { client, route: ROUTE })

    await waitFor(() => expect(currentPath()).toBe('/login'))
  })

  it('그 밖의 실패는 서버 문장을 그대로 그린다', async () => {
    const client = fakeApi({
      me: async () => user,
      getProject: async () => {
        throw new ApiError(404, 'not-found', '프로젝트를 찾을 수 없습니다')
      },
      listSnapshots: async () => [],
    })

    renderWithProviders(<App />, { client, route: ROUTE })

    expect((await screen.findByRole('alert')).textContent).toContain('프로젝트를 찾을 수 없습니다')
  })
})
