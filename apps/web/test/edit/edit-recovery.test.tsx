/**
 * 편집이 실패했을 때. **어떤 실패든 같은 경로로 수렴한다** — 페이지를 다시 받아
 * 문서와 `headSeq`를 서버 상태로 맞추고, 보내지 못한 편집을 버리고, 사용자에게 알린다.
 *
 * **세션이 끊긴 실패만 갈린다.** 그것은 재조회로 나아지지 않는다 — 다시 받아도 401이고,
 * 그 사이 요청만 쌓인다. 그 하나는 세션 무효화 경로로 보낸다.
 *
 * 하네스는 `use-edit-commit.test.tsx`와 같다 — 셸을 `<App />`으로 띄우고 셸이 만든 바로
 * 그 스토어에 드라이버를 붙인다. **`vi.mock`은 파일마다 있어야 한다**(호이스팅이 그것이
 * 적힌 파일에서만 일어난다 — `editor-harness.tsx` 머리말의 실측).
 */
import { act, render, screen, waitFor } from '@testing-library/react'
import { type ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type ApiClient } from '../../src/api/client'
import { ApiProvider } from '../../src/api/context'
import type { PageDetail, PatchResult } from '../../src/api/types'
import { useEditCommit } from '../../src/edit/use-edit-commit'
import { EditorStore } from '../../src/store/editor-store'
import { EditorStoreProvider } from '../../src/store/use-editor-store'
import { HEAD_SEQ, PAGE_ID, PAGE_ROUTE, PROJECT_ID, PROJECT_NAME, openPage, pageDetail, pageDoc, canvasQuery } from '../editor-harness'
import { currentPath } from '../helpers'

const createdStores: EditorStore[] = []

vi.mock('../../src/store/editor-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/store/editor-store')>()
  return {
    ...actual,
    EditorStore: class extends actual.EditorStore {
      constructor() {
        let issued = 0
        super({
          nextOpId: () => {
            issued += 1
            return `op-${issued}`
          },
        })
        createdStores.push(this)
      }
    },
  }
})

beforeEach(() => {
  createdStores.length = 0
  commitRef.current = null
})

function shellStore(): EditorStore {
  const store = createdStores.at(-1)
  if (store === undefined) throw new Error('셸이 EditorStore를 만들지 않았습니다')
  return store as EditorStore
}

const TEXT_ID = 'n-text'
const OLD_TEXT = '옛 내용'
const NEW_TEXT = '새 내용'
/** 서버가 재조회에서 낼 값. 낙관적으로 넣은 값과 달라야 수렴을 잴 수 있다. */
const SERVER_TEXT = '서버가 든 내용 [T6]'
/** 서버가 준 실패 문장. 화면이 하드코딩할 리 없는 문자열이어야 한다. */
const SERVER_REASON = '문서가 이미 바뀌었습니다 [T6-409]'
/** 재조회 뒤의 서버 `headSeq`. 낙관적 편집이 만들었을 값과 겹치지 않게 멀리 둔다. */
const SERVER_HEAD_SEQ = 42

function textDoc(content: string): ReturnType<typeof pageDoc> {
  return pageDoc({
    id: 'n-root',
    type: 'Page',
    children: [{ id: TEXT_ID, type: 'Text', props: { content } }],
  })
}

const commitRef: { current: ((nodeId: string, prop: string, value: unknown) => void) | null } = {
  current: null,
}

function CommitDriver(): ReactElement {
  const { commitProp, status } = useEditCommit({ projectId: PROJECT_ID, pageId: PAGE_ID })
  commitRef.current = commitProp
  return <span data-testid="edit-status">{status}</span>
}

function mountDriver(client: ApiClient): void {
  render(
    <ApiProvider client={client}>
      <EditorStoreProvider store={shellStore()}>
        <CommitDriver />
      </EditorStoreProvider>
    </ApiProvider>,
  )
}

function commit(value: string, nodeId = TEXT_ID): void {
  const commitProp = commitRef.current
  if (commitProp === null) throw new Error('드라이버가 아직 뜨지 않았습니다')
  act(() => {
    commitProp(nodeId, 'content', value)
  })
}

function canvasText(): string {
  const node = canvasQuery(`[data-wb-id="${TEXT_ID}"]`)
  if (node === null) throw new Error('캔버스에 텍스트 노드가 없습니다')
  return node.textContent ?? ''
}

interface Harness {
  /** `getPage` 호출 수. 첫 조회 하나가 이미 들어 있다. */
  getPageCalls: () => number
  patchCalls: () => number
}

/**
 * 셸을 띄우고 드라이버를 붙인다. `patchOps`는 주어진 대로 실패하거나 성공한다.
 *
 * 재조회는 `getPage`를 다시 부르는 것으로 나타나므로 호출 수를 센다. **재조회가 내는
 * 문서는 첫 조회와 다르다** — 그래야 "서버 것으로 수렴했다"를 잴 수 있다.
 */
async function openWithFailure(options: {
  patch: () => Promise<PatchResult>
  /** 재조회가 실패하는 판. 기본은 성공이다. */
  refetchFails?: boolean
}): Promise<Harness> {
  let getPageCalls = 0
  let patchCalls = 0

  const getPage = async (_projectId: string, pageId: string): Promise<PageDetail> => {
    getPageCalls += 1
    if (getPageCalls === 1) return pageDetail(pageId, textDoc(OLD_TEXT))
    if (options.refetchFails === true) {
      throw new ApiError(500, 'internal', '페이지 조회가 실패했습니다 [T6-refetch]')
    }
    return { ...pageDetail(pageId, textDoc(SERVER_TEXT)), headSeq: SERVER_HEAD_SEQ }
  }

  const patchOps: ApiClient['patchOps'] = async () => {
    patchCalls += 1
    return options.patch()
  }

  await openPage(textDoc(OLD_TEXT), { apiOverrides: { getPage, patchOps }, route: PAGE_ROUTE })
  mountDriver({ getPage, patchOps } as unknown as ApiClient)

  return { getPageCalls: () => getPageCalls, patchCalls: () => patchCalls }
}

/** 실패를 만드는 손잡이들. 셋이 **같은 경로로** 수렴해야 한다. */
const CONFLICT = (): Promise<PatchResult> => Promise.reject(new ApiError(409, 'conflict', SERVER_REASON))
const VALIDATION = (): Promise<PatchResult> =>
  Promise.reject(
    new ApiError(422, 'validation-failed', SERVER_REASON, [{ path: '/root/children/0/props/content', message: '알 수 없는 prop' }]),
  )
/** `ApiError`가 아닌 값. `fetch`가 응답을 못 받으면 raw `TypeError`로 reject한다. */
const NETWORK = (): Promise<PatchResult> => Promise.reject(new TypeError('Failed to fetch'))

function alertTexts(): string[] {
  return screen.queryAllByRole('alert').map((element) => element.textContent ?? '')
}

describe('편집 실패는 재조회로 수렴한다', () => {
  it('409를 받으면 페이지를 다시 받는다', async () => {
    const harness = await openWithFailure({ patch: CONFLICT })

    commit(NEW_TEXT)

    await waitFor(() => expect(harness.getPageCalls()).toBe(2))
  })

  it('재조회 뒤 문서와 headSeq가 서버 것이다', async () => {
    const harness = await openWithFailure({ patch: CONFLICT })

    commit(NEW_TEXT)
    await waitFor(() => expect(harness.getPageCalls()).toBe(2))

    // 낙관적으로 넣은 값이 서버 값으로 되돌아갔다. **로컬 `inverse`로 되돌리는 구현과
    // 갈린다** — 그쪽은 `OLD_TEXT`가 되지 `SERVER_TEXT`가 되지 않는다.
    await waitFor(() => expect(canvasText()).toBe(SERVER_TEXT))

    // `headSeq`도 서버 것이다. 다음 편집이 그 위에서 만들어져야 또 409를 받지 않는다.
    commit('그다음 내용')
    await waitFor(() => expect(harness.patchCalls()).toBe(2))
  })

  it('422를 받아도 같은 경로로 수렴한다', async () => {
    // **이 파일의 요지다** — 실패 종류마다 다르게 복구하는 구현을 막는다.
    const harness = await openWithFailure({ patch: VALIDATION })

    commit(NEW_TEXT)

    await waitFor(() => expect(harness.getPageCalls()).toBe(2))
    await waitFor(() => expect(canvasText()).toBe(SERVER_TEXT))
  })

  it('네트워크 실패도 같다', async () => {
    // `ApiError`가 아닌 값이 던져져도 같은 자리로 온다.
    const harness = await openWithFailure({ patch: NETWORK })

    commit(NEW_TEXT)

    await waitFor(() => expect(harness.getPageCalls()).toBe(2))
    await waitFor(() => expect(canvasText()).toBe(SERVER_TEXT))
  })

  it('실패하면 서버가 준 이유를 알린다', async () => {
    const harness = await openWithFailure({ patch: CONFLICT })

    commit(NEW_TEXT)
    await waitFor(() => expect(harness.getPageCalls()).toBe(2))

    // **`role="alert"` 하나다.** 어느 화면에서 시작됐든 결과가 같으므로 자리를 나눌
    // 이유가 없다.
    await waitFor(() => expect(alertTexts()).toHaveLength(1))
    expect(alertTexts()[0]).toContain(SERVER_REASON)
  })

  it('보내지 못한 편집을 잃었다고 알린다', async () => {
    // 요청이 떠 있는 동안 편집을 더 내면 큐에 쌓인다. 실패하면 그 전부가 버려진다 —
    // 사용자는 몇 개를 잃었는지 알아야 한다.
    let release = (): void => {}
    const blocked = new Promise<void>((resolve) => {
      release = resolve
    })
    const harness = await openWithFailure({
      patch: async () => {
        await blocked
        throw new ApiError(409, 'conflict', SERVER_REASON)
      },
    })

    commit(NEW_TEXT)
    await waitFor(() => expect(harness.patchCalls()).toBe(1))
    commit('두 번째')
    commit('세 번째')

    await act(async () => {
      release()
    })
    await waitFor(() => expect(harness.getPageCalls()).toBe(2))

    // 셋이 버려졌다 — 전송에 실패한 하나와 큐에 남아 있던 둘이다. 수는 하드코딩이
    // 아니라 그 자리에서 세어 나온 값이어야 한다.
    await waitFor(() => expect(alertTexts()[0]).toContain('3개'))
  })

  it('성공하면 알림이 없다', async () => {
    // **양성 대조** — 늘 알리는 구현을 잡는다.
    const harness = await openWithFailure({
      patch: async () => ({
        seq: HEAD_SEQ + 1,
        revisionId: 'rev-8',
        inverse: [],
        schemaVersion: 1,
        clientOpId: 'op-1',
      }),
    })

    commit(NEW_TEXT)
    await waitFor(() => expect(harness.patchCalls()).toBe(1))
    await act(async () => {})

    expect(alertTexts()).toEqual([])
    // 재조회도 없다 — 성공한 편집에 페이지를 다시 받을 이유가 없다.
    expect(harness.getPageCalls()).toBe(1)
    expect(canvasText()).toBe(NEW_TEXT)
  })

  it('세션이 끊긴 실패는 로그인으로 보낸다', async () => {
    // **재조회하지 않는다.** 다시 받아도 401이고 그 사이 요청만 쌓인다. 세션 무효화
    // 경로로 보내는 것이 답이다(`api/failure.tsx`의 `SignedOut`).
    const harness = await openWithFailure({
      patch: () => Promise.reject(new ApiError(401, 'unauthenticated', '로그인이 필요합니다')),
    })

    commit(NEW_TEXT)

    await screen.findByLabelText('이메일')
    expect(currentPath()).toBe('/login')
    // 첫 조회 하나뿐이다.
    expect(harness.getPageCalls()).toBe(1)
  })

  it('재조회 중에도 셸이 살아 있다', async () => {
    // 흰 화면이 되면 사용자가 다른 페이지로 옮겨 갈 길이 없다.
    const harness = await openWithFailure({ patch: CONFLICT })

    commit(NEW_TEXT)
    await waitFor(() => expect(harness.getPageCalls()).toBe(2))

    screen.getByRole('heading', { name: PROJECT_NAME })
    screen.getByRole('region', { name: '메뉴·페이지 트리' })
    screen.getByRole('main', { name: '캔버스' })
  })

  it('재조회마저 실패하면 그 이유를 알리고 멈춘다', async () => {
    // 재조회가 실패하면 `idle`로 두고 조회 실패 문안을 낸다.
    // 여기서 다시 재조회하면 서버가 계속 실패하는 동안 요청이 쌓인다.
    const harness = await openWithFailure({ patch: CONFLICT, refetchFails: true })

    commit(NEW_TEXT)
    await waitFor(() => expect(harness.getPageCalls()).toBe(2))
    await act(async () => {})

    expect(harness.getPageCalls()).toBe(2)
    await waitFor(() => expect(alertTexts()).toHaveLength(1))
    expect(alertTexts()[0]).toContain('[T6-refetch]')
    expect(screen.getByTestId('edit-status').textContent).toBe('idle')
  })

  /**
   * **이 갈래는 화면을 되돌리지 않는다 — 그러니 그렇다고 말해야 한다**(*"실패했다고 말하는데
   * 조작은 일어났다"* 부류다).
   *
   * 재조회가 **성공**하면 `loadPage`가 문서·선택·큐를 서버 것으로 놓는다. **실패하면 그
   * 셋을 아무것도 안 놓는다** — `failEdits`는 큐만 비우므로 **낙관적으로 적용된 편집이
   * 문서에 그대로 남고 화면이 그것을 계속 그린다.** 되돌릴 서버 상태를 못 읽었으므로
   * 화면을 고칠 수는 없고, **할 수 있는 정직한 일은 그 상태를 말하는 것뿐이다.**
   *
   * **위 케이스는 이 사실을 못 잡는다** — `toContain('[T6-refetch]')`이라 우리 문장을
   * 덧붙이든 말든 통과한다.
   */
  it('재조회마저 실패하면 화면에 남은 편집이 저장되지 않았다고 말한다', async () => {
    const harness = await openWithFailure({ patch: CONFLICT, refetchFails: true })

    commit(NEW_TEXT)
    await waitFor(() => expect(alertTexts()).toHaveLength(1))

    const alert = alertTexts()[0] ?? ''
    // 서버가 준 이유는 그대로 싣는다(`api/failure.tsx`의 경계).
    expect(alert).toContain('[T6-refetch]')
    // **그리고 우리 문장이 화면 상태를 말한다.**
    expect(alert).toContain('저장되지 않았습니다')
    expect(alert).toContain('새로고침')
  })

  it('실패한 뒤 새 편집을 내면 앞 알림이 사라진다', async () => {
    // 알림이 남아 있으면 사용자는 방금 낸 편집도 실패했다고 읽는다.
    let fail = true
    const harness = await openWithFailure({
      patch: async () => {
        if (fail) throw new ApiError(409, 'conflict', SERVER_REASON)
        return {
          seq: SERVER_HEAD_SEQ + 1,
          revisionId: 'rev-43',
          inverse: [],
          schemaVersion: 1,
          clientOpId: 'op-2',
        }
      },
    })

    commit(NEW_TEXT)
    await waitFor(() => expect(alertTexts()).toHaveLength(1))

    fail = false
    commit('그다음 내용')
    await waitFor(() => expect(harness.patchCalls()).toBe(2))
    await act(async () => {})

    expect(alertTexts()).toEqual([])
  })

  it('재조회를 기다리는 동안 낸 편집은 서버로 나가지 않는다', async () => {
    // **재조회 창의 고아 편집.** 재조회가 창의 편집을 버리지 않으면 그 편집이 큐에 남아
    // 있다가 다음 편집이 펌프를 깨울 때 **재조회 이후의 `baseSeq` 위에서** 서버로 나간다
    // (요청 자취 `{baseSeq:7,"편집A"} {baseSeq:42,"편집B"} {baseSeq:42,"편집C"}`).
    // 사용자는 "취소됐다"고 들은 편집이 적용된 문서를 보게 된다.
    let release = (): void => {}
    const blocked = new Promise<void>((resolve) => {
      release = resolve
    })
    let getPageCalls = 0
    let patchCalls = 0
    const values: unknown[] = []

    const getPage: ApiClient['getPage'] = async (_projectId, pageId) => {
      getPageCalls += 1
      if (getPageCalls === 1) return pageDetail(pageId, textDoc(OLD_TEXT))
      // 재조회는 테스트가 흘려 준다 — 그 사이가 창이다.
      await blocked
      return { ...pageDetail(pageId, textDoc(SERVER_TEXT)), headSeq: SERVER_HEAD_SEQ }
    }
    const patchOps: ApiClient['patchOps'] = async (_projectId, _pageId, body) => {
      patchCalls += 1
      values.push((body.ops as { value?: unknown }[])[0]?.value)
      if (patchCalls === 1) throw new ApiError(409, 'conflict', SERVER_REASON)
      return {
        seq: SERVER_HEAD_SEQ + patchCalls,
        revisionId: `rev-${patchCalls}`,
        inverse: [],
        schemaVersion: 1,
        ...(body.clientOpId === undefined ? {} : { clientOpId: body.clientOpId }),
      }
    }

    await openPage(textDoc(OLD_TEXT), { apiOverrides: { getPage, patchOps } })
    mountDriver({ getPage, patchOps } as unknown as ApiClient)

    commit('편집A')
    await waitFor(() => expect(patchCalls).toBe(1))
    await act(async () => {})

    // 창 안에서 낸 편집. 큐에는 들어가지만 펌프가 이미 돌고 있어 전송되지 않는다.
    commit('편집B')
    await act(async () => {})
    expect(shellStore().getState().pending).toHaveLength(1)

    await act(async () => {
      release()
    })
    await waitFor(() => expect(getPageCalls).toBe(2))

    // 재조회가 문서를 서버 것으로 놓으면서 창의 편집도 버린다.
    expect(shellStore().getState().pending).toHaveLength(0)

    // 다음 편집이 펌프를 깨워도 편집B는 되살아나지 않는다.
    commit('편집C')
    await waitFor(() => expect(patchCalls).toBe(2))
    await act(async () => {})

    expect(values).toEqual(['편집A', '편집C'])
    expect(patchCalls).toBe(2)
  })

  it('재조회 창의 편집은 undo 스택에도 쌓이지 않는다', async () => {
    // 창의 편집을 버리지 않으면 편집B가 나중에 ack되며 undo 스택에 실린다(실측: `undo=2`).
    // 되돌릴 수 없는 편집이 스택에 있으면 undo가 서버 상태와 어긋난다.
    let release = (): void => {}
    const blocked = new Promise<void>((resolve) => {
      release = resolve
    })
    let getPageCalls = 0
    let patchCalls = 0

    const getPage: ApiClient['getPage'] = async (_projectId, pageId) => {
      getPageCalls += 1
      if (getPageCalls === 1) return pageDetail(pageId, textDoc(OLD_TEXT))
      await blocked
      return { ...pageDetail(pageId, textDoc(SERVER_TEXT)), headSeq: SERVER_HEAD_SEQ }
    }
    const patchOps: ApiClient['patchOps'] = async (_projectId, _pageId, body) => {
      patchCalls += 1
      if (patchCalls === 1) throw new ApiError(409, 'conflict', SERVER_REASON)
      return {
        seq: SERVER_HEAD_SEQ + patchCalls,
        revisionId: `rev-${patchCalls}`,
        inverse: [],
        schemaVersion: 1,
        ...(body.clientOpId === undefined ? {} : { clientOpId: body.clientOpId }),
      }
    }

    await openPage(textDoc(OLD_TEXT), { apiOverrides: { getPage, patchOps } })
    mountDriver({ getPage, patchOps } as unknown as ApiClient)

    commit('편집A')
    await waitFor(() => expect(patchCalls).toBe(1))
    await act(async () => {})
    commit('편집B')
    await act(async () => {})

    await act(async () => {
      release()
    })
    await waitFor(() => expect(getPageCalls).toBe(2))

    // 재조회가 문서를 되돌렸으므로 그 전 revision도 되돌릴 수 없다.
    expect(shellStore().getState().undoStack).toHaveLength(0)

    commit('편집C')
    await waitFor(() => expect(patchCalls).toBe(2))
    await act(async () => {})

    // 편집C 하나뿐이다 — 창의 편집을 버리지 않으면 둘이다.
    expect(shellStore().getState().undoStack).toHaveLength(1)
  })

  it('알림은 재조회 창의 편집까지 세어 말한다', async () => {
    // `failEdits()`가 센 값만 쓰면 `편집 1개가 취소됐습니다`가 된다 — 창에서 들어온
    // 편집이 수에서 빠진다.
    let release = (): void => {}
    const blocked = new Promise<void>((resolve) => {
      release = resolve
    })
    let getPageCalls = 0
    let patchCalls = 0

    const getPage: ApiClient['getPage'] = async (_projectId, pageId) => {
      getPageCalls += 1
      if (getPageCalls === 1) return pageDetail(pageId, textDoc(OLD_TEXT))
      await blocked
      return { ...pageDetail(pageId, textDoc(SERVER_TEXT)), headSeq: SERVER_HEAD_SEQ }
    }
    const patchOps: ApiClient['patchOps'] = () => {
      patchCalls += 1
      return Promise.reject(new ApiError(409, 'conflict', SERVER_REASON))
    }

    await openPage(textDoc(OLD_TEXT), { apiOverrides: { getPage, patchOps } })
    mountDriver({ getPage, patchOps } as unknown as ApiClient)

    commit('편집A')
    await waitFor(() => expect(patchCalls).toBe(1))
    await act(async () => {})
    commit('편집B')
    commit('편집C')
    await act(async () => {})

    await act(async () => {
      release()
    })
    await waitFor(() => expect(getPageCalls).toBe(2))

    // 전송에 실패한 하나 + 창에서 들어온 둘 = 셋.
    await waitFor(() => expect(alertTexts()[0]).toContain('3개'))
  })

  it('서버 문장과 우리 문장이 이어 붙어 명사구로 읽히지 않는다', async () => {
    // **`toFailure`가 `issues`를 쓰기 때문에 생기는 자리다.** 카탈로그 위반의
    // `issues[0].message`가 **타입 이름으로 끝난다** — `알 수 없는 컴포넌트 타입: 없는타입`.
    // 그 뒤에 우리 문장을 공백 하나로 붙이면
    //
    //   `알 수 없는 컴포넌트 타입: 없는타입 페이지를 서버 상태로 다시 불러왔고, …`
    //
    // 가 되어 **"없는타입 페이지를"이 하나의 명사구로 읽힌다.**
    //
    // **이것은 `unknown-type` 하나의 문제가 아니다 — 이어 붙이는 형태가 만드는 부류다.**
    // 이 경로가 실제로 받는 문장을 api 하네스로 재면 **끝에 마침표를 두는 것이 하나도 없다:**
    // 409가 `…(요청 baseSeq 99, 현재 0)`(괄호)와 `편집을 적용할 수 없습니다: … /root/…`(**경로**),
    // 422가 타입 이름, 400이 `…undefined입니다`. 즉 **어떤 서버 문장이 와도 두 문장이 한
    // 문장처럼 붙는다.** 구분자가 그 부류를 닫는다.
    const harness = await openWithFailure({
      patch: () =>
        Promise.reject(
          new ApiError(422, 'validation-failed', '스키마 검증에 실패했습니다', [
            {
              code: 'unknown-type',
              nodeId: 'n_1',
              path: '/root/children/0',
              message: '알 수 없는 컴포넌트 타입: 없는타입',
            },
          ]),
        ),
    })

    commit(NEW_TEXT)
    await waitFor(() => expect(harness.getPageCalls()).toBe(2))
    await waitFor(() => expect(alertTexts()).toHaveLength(1))

    const text = alertTexts()[0] ?? ''
    // 서버 문장은 그대로 남는다 — 이유를 우리가 다시 쓰지 않는다.
    expect(text).toContain('알 수 없는 컴포넌트 타입: 없는타입')
    // **그리고 우리 문장과 붙어 읽히지 않는다.**
    expect(text).not.toContain('없는타입 페이지를')
  })

  it('재조회가 실패해도 창의 편집이 남지 않는다', async () => {
    // 재조회가 실패하면 서버 상태를 모르므로 문서를 되돌리지 못한다. 그래도 창의 편집은
    // 버린다 — 남기면 **낡은 `baseSeq` 위에서** 나가고 서버가 다시 409를 낸다
    // (실측: 버리지 않으면 그 편집이 `baseSeq 7`로 나간다. 재조회가 성공한 판의 42와 다르다).
    let release = (): void => {}
    const blocked = new Promise<void>((resolve) => {
      release = resolve
    })
    let getPageCalls = 0
    let patchCalls = 0
    const values: unknown[] = []

    const getPage: ApiClient['getPage'] = async (_projectId, pageId) => {
      getPageCalls += 1
      if (getPageCalls === 1) return pageDetail(pageId, textDoc(OLD_TEXT))
      await blocked
      throw new ApiError(500, 'internal', '페이지 조회가 실패했습니다 [T6-refetch]')
    }
    const patchOps: ApiClient['patchOps'] = async (_projectId, _pageId, body) => {
      patchCalls += 1
      values.push((body.ops as { value?: unknown }[])[0]?.value)
      if (patchCalls === 1) throw new ApiError(409, 'conflict', SERVER_REASON)
      return {
        seq: SERVER_HEAD_SEQ + patchCalls,
        revisionId: `rev-${patchCalls}`,
        inverse: [],
        schemaVersion: 1,
        ...(body.clientOpId === undefined ? {} : { clientOpId: body.clientOpId }),
      }
    }

    await openPage(textDoc(OLD_TEXT), { apiOverrides: { getPage, patchOps } })
    mountDriver({ getPage, patchOps } as unknown as ApiClient)

    commit('편집A')
    await waitFor(() => expect(patchCalls).toBe(1))
    await act(async () => {})
    commit('편집B')
    await act(async () => {})
    expect(shellStore().getState().pending).toHaveLength(1)

    await act(async () => {
      release()
    })
    await waitFor(() => expect(getPageCalls).toBe(2))
    await act(async () => {})

    expect(shellStore().getState().pending).toHaveLength(0)

    commit('편집C')
    await waitFor(() => expect(patchCalls).toBe(2))
    await act(async () => {})

    expect(values).toEqual(['편집A', '편집C'])
  })

  it('재조회는 그 전에 성공한 편집의 undo 스택도 비운다', async () => {
    // **앞 케이스가 못 잡는 자리다.** `재조회 창의 편집은 undo 스택에도 쌓이지 않는다`는
    // 그 시나리오에서 재조회 시점의 스택이 이미 비어 있어(성공한 편집이 없다) `loadPage`의
    // undo 비우기를 되돌려도 죽지 않는다. 여기서는 **성공한 편집을 하나 먼저**
    // 만들어 스택을 채운 뒤 실패시킨다.
    //
    // 왜 비워야 하나: 문서가 서버 것으로 되돌아갔으므로 그 전 revision의 `inverse`를
    // 되보내면 서버 상태와 어긋난다. 새로고침 뒤의 복원은
    // `GET .../revisions?mine=true`가 따로 채운다.
    let getPageCalls = 0
    let patchCalls = 0

    const getPage: ApiClient['getPage'] = async (_projectId, pageId) => {
      getPageCalls += 1
      if (getPageCalls === 1) return pageDetail(pageId, textDoc(OLD_TEXT))
      return { ...pageDetail(pageId, textDoc(SERVER_TEXT)), headSeq: SERVER_HEAD_SEQ }
    }
    const patchOps: ApiClient['patchOps'] = async (_projectId, _pageId, body) => {
      patchCalls += 1
      // 첫 편집은 성공해 undo 스택을 채우고, 둘째가 실패해 재조회를 부른다.
      if (patchCalls === 2) throw new ApiError(409, 'conflict', SERVER_REASON)
      return {
        seq: HEAD_SEQ + patchCalls,
        revisionId: `rev-${patchCalls}`,
        inverse: [{ op: 'replace', path: '/root/children/0/props/content', value: OLD_TEXT }],
        schemaVersion: 1,
        ...(body.clientOpId === undefined ? {} : { clientOpId: body.clientOpId }),
      }
    }

    await openPage(textDoc(OLD_TEXT), { apiOverrides: { getPage, patchOps } })
    mountDriver({ getPage, patchOps } as unknown as ApiClient)

    commit('성공한 편집')
    await waitFor(() => expect(patchCalls).toBe(1))
    await act(async () => {})
    // 양성 대조: 스택이 실제로 찼다. 이것이 없으면 아래 단언이 "원래 비어 있었다"로도 참이다.
    expect(shellStore().getState().undoStack).toHaveLength(1)

    commit('실패할 편집')
    await waitFor(() => expect(getPageCalls).toBe(2))
    await act(async () => {})

    expect(shellStore().getState().undoStack).toHaveLength(0)
  })
})
