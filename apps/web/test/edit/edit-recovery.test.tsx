/**
 * 편집이 실패했을 때. **어떤 실패든 같은 경로로 수렴한다**(D4) — 페이지를 다시 받아
 * 문서와 `headSeq`를 서버 상태로 맞추고, 보내지 못한 편집을 버리고, 사용자에게 알린다.
 *
 * **세션이 끊긴 실패만 갈린다.** 그것은 재조회로 나아지지 않는다 — 다시 받아도 401이고,
 * 그 사이 요청만 쌓인다. 그 하나는 웨이브 1이 만든 세션 무효화 경로로 보낸다.
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
import {
  HEAD_SEQ,
  PAGE_ID,
  PAGE_ROUTE,
  PROJECT_ID,
  PROJECT_NAME,
  openPage,
  pageDetail,
  pageDoc,
} from '../editor-harness'
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
  const node = document.body.querySelector(`[data-wb-id="${TEXT_ID}"]`)
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

/** 실패를 만드는 손잡이들. 셋이 **같은 경로로** 수렴해야 한다(D4). */
const CONFLICT = (): Promise<PatchResult> =>
  Promise.reject(new ApiError(409, 'conflict', SERVER_REASON))
const VALIDATION = (): Promise<PatchResult> =>
  Promise.reject(
    new ApiError(422, 'validation-failed', SERVER_REASON, [
      { path: '/root/children/0/props/content', message: '알 수 없는 prop' },
    ]),
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
    // 갈린다** — 그쪽은 `OLD_TEXT`가 되지 `SERVER_TEXT`가 되지 않는다(D4).
    await waitFor(() => expect(canvasText()).toBe(SERVER_TEXT))

    // `headSeq`도 서버 것이다. 다음 편집이 그 위에서 만들어져야 또 409를 받지 않는다.
    commit('그다음 내용')
    await waitFor(() => expect(harness.patchCalls()).toBe(2))
  })

  it('422를 받아도 같은 경로로 수렴한다', async () => {
    // **D4의 요지다** — 실패 종류마다 다르게 복구하는 구현을 막는다.
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

    // **`role="alert"` 하나다**(D8). 어느 화면에서 시작됐든 결과가 같으므로 자리를 나눌
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
    // **재조회하지 않는다.** 다시 받아도 401이고 그 사이 요청만 쌓인다. 웨이브 1이 만든
    // 세션 무효화 경로로 보내는 것이 답이다(D5의 `SignedOut`).
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
    // 계획서 Step 2의 3번 — 재조회가 실패하면 `idle`로 두고 조회 실패 문안을 낸다.
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
})
