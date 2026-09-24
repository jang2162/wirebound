/**
 * 편집이 서버로 나가는 경로. **셸은 `<App />`을 라우트째 렌더해서 띄운다**
 * (`editor-harness.tsx`의 관례) — 그러지 않으면 조회가 실패한 화면 위에서도 단언이
 * 통과한다.
 *
 * **이 파일은 편집을 내는 위젯을 거치지 않는다.** 셸이 만든 **바로 그 스토어**에 `useEditCommit`을 붙인 작은 드라이버를 곁에 띄워 편집을 낸다 —
 * 스토어가 같으므로 낙관적 적용은 진짜 캔버스에 그려지고, 요청은 진짜 `ApiClient`
 * 가짜를 지난다. 스토어를 새로 만들어 쥐면 그 대조가 사라진다.
 *
 * **`vi.mock`은 이 파일에 있어야 한다.** 호이스팅이 그것이 적힌 파일에서만 일어나므로
 * (`editor-harness.tsx` 머리말의 실측), 헬퍼로 옮기면 import 순서에 따라 mock이 늦게
 * 걸려 셸이 진짜 `EditorStore`를 만든다.
 */
import { act, render, screen, waitFor } from '@testing-library/react'
import { useRef, type ReactElement } from 'react'
import type { PatchOp } from '@wirebound/schema'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '../../src/api/client'
import { ApiProvider } from '../../src/api/context'
import type { PatchResult } from '../../src/api/types'
import { useEditCommit } from '../../src/edit/use-edit-commit'
import { EditorStore } from '../../src/store/editor-store'
import { EditorStoreProvider } from '../../src/store/use-editor-store'
import {
  HEAD_SEQ,
  OTHER_PAGE_ID,
  PAGE_ID,
  PROJECT_ID,
  openPage,
  pageDoc,
  waitForNode,
} from '../editor-harness'

/** 셸이 만든 스토어를 붙잡는 자리. 아래 `vi.mock`이 채운다. */
const createdStores: EditorStore[] = []

vi.mock('../../src/store/editor-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/store/editor-store')>()
  return {
    ...actual,
    EditorStore: class extends actual.EditorStore {
      constructor() {
        // **결정적인 `clientOpId`를 주입한다.** 셸은 인자 없이 만들므로 여기서 끼워야
        // 요청 본문의 id를 단언할 수 있다. 그것이 생성기를 주입 가능하게 둔 이유다.
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
})

/** 셸이 지금 들고 있는 스토어. 셸이 떠 있는 동안에만 쓸 수 있다. */
function shellStore(): EditorStore {
  const store = createdStores.at(-1)
  if (store === undefined) throw new Error('셸이 EditorStore를 만들지 않았습니다')
  return store as EditorStore
}

const TEXT_ID = 'n-text'
const OLD_TEXT = '옛 내용'
const NEW_TEXT = '새 내용'

function textDoc(content = OLD_TEXT): ReturnType<typeof pageDoc> {
  return pageDoc({
    id: 'n-root',
    type: 'Page',
    children: [{ id: TEXT_ID, type: 'Text', props: { content } }],
  })
}

/** 서버가 낼 성공 응답. `inverse`는 서버가 만든 것이다(설계서 「정방향 흐름」). */
function patchResult(seq: number, clientOpId: string): PatchResult {
  return {
    seq,
    revisionId: `rev-${seq}`,
    inverse: [{ op: 'replace', path: `/root/children/0/props/content`, value: OLD_TEXT }],
    schemaVersion: 1,
    clientOpId,
  }
}

interface RecordedPatch {
  projectId: string
  pageId: string
  body: { baseSeq: number; ops: PatchOp[]; clientOpId?: string }
  /** 이 요청의 응답을 내보내는 손잡이. 부르기 전까지 요청은 떠 있는 상태다. */
  settle: (result?: PatchResult) => void
  fail: (error: unknown) => void
}

/**
 * 응답을 **테스트가 직접 흘려 주는** `patchOps`. 요청이 떠 있는 동안을 볼 수 있어야
 * *"in-flight는 하나"*를 잴 수 있다 — 곧바로 resolve하는 가짜로는 두 요청이 겹치는
 * 순간이 존재하지 않아 병렬 전송 구현도 통과한다.
 */
function deferredPatchOps(): { calls: RecordedPatch[]; patchOps: ApiClient['patchOps'] } {
  const calls: RecordedPatch[] = []
  const patchOps: ApiClient['patchOps'] = (projectId, pageId, body) =>
    new Promise<PatchResult>((resolve, reject) => {
      calls.push({
        projectId,
        pageId,
        body,
        settle: (result) =>
          resolve(result ?? patchResult(body.baseSeq + 1, body.clientOpId ?? 'op-?')),
        fail: reject,
      })
    })
  return { calls, patchOps }
}

/** 지금 편집을 낼 수 있는 손. 드라이버가 매 렌더 여기에 자기 `commitProp`을 적어 둔다. */
const commitRef: { current: ((nodeId: string, prop: string, value: unknown) => void) | null } = {
  current: null,
}

function CommitDriver(props: { pageId: string }): ReactElement {
  const { commitProp, status } = useEditCommit({ projectId: PROJECT_ID, pageId: props.pageId })
  const ref = useRef(commitProp)
  ref.current = commitProp
  commitRef.current = commitProp
  return <span data-testid="edit-status">{status}</span>
}

/** 셸이 만든 스토어에 드라이버를 붙인다. 셸이 뜬 **뒤에** 부른다. */
function mountDriver(client: ApiClient, pageId: string = PAGE_ID): void {
  render(
    <ApiProvider client={client}>
      <EditorStoreProvider store={shellStore()}>
        <CommitDriver pageId={pageId} />
      </EditorStoreProvider>
    </ApiProvider>,
  )
}

/** 캔버스에 그려진 텍스트 노드의 내용. */
function canvasText(): string {
  const node = document.body.querySelector(`[data-wb-id="${TEXT_ID}"]`)
  if (node === null) throw new Error('캔버스에 텍스트 노드가 없습니다')
  return node.textContent ?? ''
}

function commit(value: string, nodeId = TEXT_ID, prop = 'content'): void {
  const commitProp = commitRef.current
  if (commitProp === null) throw new Error('드라이버가 아직 뜨지 않았습니다')
  act(() => {
    commitProp(nodeId, prop, value)
  })
}

describe('useEditCommit', () => {
  beforeEach(() => {
    commitRef.current = null
  })

  it('편집하면 화면이 먼저 바뀐다', async () => {
    // **낙관적 적용의 실측이다.** 응답을 흘리지 않은 채로 캔버스를 본다 — 요청이 아직
    // 떠 있는데도 화면에는 새 값이 있어야 한다.
    const { calls, patchOps } = deferredPatchOps()
    const client = { patchOps } as unknown as ApiClient
    await openPage(textDoc(), { apiOverrides: { patchOps } })
    mountDriver(client)

    expect(canvasText()).toBe(OLD_TEXT)
    commit(NEW_TEXT)

    expect(canvasText()).toBe(NEW_TEXT)
    // 응답은 아직 오지 않았다 — 그 사실이 "먼저"의 뜻이다.
    expect(calls).toHaveLength(1)
  })

  it('baseSeq는 지금 headSeq다', async () => {
    const { calls, patchOps } = deferredPatchOps()
    await openPage(textDoc(), { apiOverrides: { patchOps } })
    mountDriver({ patchOps } as unknown as ApiClient)

    commit(NEW_TEXT)

    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]?.body.baseSeq).toBe(HEAD_SEQ)
    expect(calls[0]?.projectId).toBe(PROJECT_ID)
    expect(calls[0]?.pageId).toBe(PAGE_ID)
    expect(calls[0]?.body.ops).toEqual([
      { op: 'replace', path: '/root/children/0/props/content', value: NEW_TEXT },
    ])
  })

  it('ack를 받으면 다음 baseSeq가 응답의 seq다', async () => {
    // `apps/api/README.md` 「편집 파이프라인」 절 — *"응답의 `seq`가 다음 요청의 `baseSeq`다."* 이것이 어긋나면 두 번째
    // 편집이 409를 받는다.
    const { calls, patchOps } = deferredPatchOps()
    await openPage(textDoc(), { apiOverrides: { patchOps } })
    mountDriver({ patchOps } as unknown as ApiClient)

    commit(NEW_TEXT)
    await waitFor(() => expect(calls).toHaveLength(1))
    await act(async () => {
      calls[0]?.settle(patchResult(HEAD_SEQ + 1, 'op-1'))
    })

    commit('또 다른 내용')
    await waitFor(() => expect(calls).toHaveLength(2))
    expect(calls[1]?.body.baseSeq).toBe(HEAD_SEQ + 1)
  })

  it('in-flight 중의 편집은 기다린다', async () => {
    // **이 케이스가 *"in-flight는 하나"*의 전부다.** README: *"in-flight 요청은 항상 하나여야 한다 — 앞
    // 요청의 `seq`를 받아야 다음 `baseSeq`가 정해지기 때문이다. 어기면 두 번째 요청이
    // 409를 받는다."* 없으면 병렬 전송 구현이 나머지를 전부 통과한다.
    const { calls, patchOps } = deferredPatchOps()
    await openPage(textDoc(), { apiOverrides: { patchOps } })
    mountDriver({ patchOps } as unknown as ApiClient)

    commit(NEW_TEXT)
    await waitFor(() => expect(calls).toHaveLength(1))
    commit('두 번째')
    commit('세 번째')

    // 응답을 흘리지 않았으므로 요청은 여전히 하나뿐이다.
    await act(async () => {})
    expect(calls).toHaveLength(1)
    // 낙관적 적용은 기다리지 않는다 — 화면은 마지막 편집을 보여 준다.
    expect(canvasText()).toBe('세 번째')
  })

  it('앞 요청이 끝나면 다음이 나간다', async () => {
    // 위 케이스의 짝이다. 기다리기만 하고 보내지 않는 구현을 잡는다.
    const { calls, patchOps } = deferredPatchOps()
    await openPage(textDoc(), { apiOverrides: { patchOps } })
    mountDriver({ patchOps } as unknown as ApiClient)

    commit(NEW_TEXT)
    await waitFor(() => expect(calls).toHaveLength(1))
    commit('두 번째')

    await act(async () => {
      calls[0]?.settle(patchResult(HEAD_SEQ + 1, 'op-1'))
    })

    await waitFor(() => expect(calls).toHaveLength(2))
    // 순서대로다. 두 번째 요청은 첫 요청의 `seq` 위에서 만들어진다.
    expect(calls[0]?.body.clientOpId).toBe('op-1')
    expect(calls[1]?.body.clientOpId).toBe('op-2')
    expect(calls[1]?.body.baseSeq).toBe(HEAD_SEQ + 1)
    expect(calls[1]?.body.ops).toEqual([
      { op: 'replace', path: '/root/children/0/props/content', value: '두 번째' },
    ])
  })

  it('적용할 수 없는 편집은 요청을 만들지 않는다', async () => {
    // 없는 노드다. `propOps`가 `null`을 내고 거기서 멈춘다.
    const { calls, patchOps } = deferredPatchOps()
    await openPage(textDoc(), { apiOverrides: { patchOps } })
    mountDriver({ patchOps } as unknown as ApiClient)

    commit(NEW_TEXT, 'n-없는노드')

    await act(async () => {})
    expect(calls).toHaveLength(0)
    // 화면도 그대로다 — 낙관적으로 적용해 놓고 요청만 안 보내는 구현을 잡는다.
    expect(canvasText()).toBe(OLD_TEXT)
  })

  it('페이지를 옮기면 앞 페이지의 편집이 새 페이지로 가지 않는다', async () => {
    // 스토어의 `clearPage`가 큐를 비우므로 앞 페이지의 pending이 새 경로로 나갈 길이 없다.
    const { calls, patchOps } = deferredPatchOps()
    await openPage(textDoc(), {
      apiOverrides: { patchOps },
      docs: { [OTHER_PAGE_ID]: pageDoc({ id: 'n-other', type: 'Page' }) },
    })
    mountDriver({ patchOps } as unknown as ApiClient)

    commit(NEW_TEXT)
    await waitFor(() => expect(calls).toHaveLength(1))

    // 주소를 옮긴다. 셸의 이펙트가 `clearPage()`를 부르고 새 페이지를 받는다.
    await act(async () => {
      shellStore().clearPage()
      shellStore().loadPage(OTHER_PAGE_ID, pageDoc({ id: 'n-other', type: 'Page' }), 20)
    })
    await act(async () => {
      calls[0]?.settle(patchResult(HEAD_SEQ + 1, 'op-1'))
    })
    await act(async () => {})

    // 앞 페이지의 두 번째 편집이 없었으므로 요청은 하나뿐이고, 그 하나의 경로에는
    // 새 페이지 id가 없다.
    expect(calls).toHaveLength(1)
    expect(calls.map((call) => call.pageId)).toEqual([PAGE_ID])
  })

  it('보낼 것이 없으면 status가 idle이다', async () => {
    const { patchOps } = deferredPatchOps()
    await openPage(textDoc(), { apiOverrides: { patchOps } })
    mountDriver({ patchOps } as unknown as ApiClient)

    expect(screen.getByTestId('edit-status').textContent).toBe('idle')
  })

  it('요청이 떠 있는 동안 status가 sending이다', async () => {
    const { calls, patchOps } = deferredPatchOps()
    await openPage(textDoc(), { apiOverrides: { patchOps } })
    mountDriver({ patchOps } as unknown as ApiClient)

    commit(NEW_TEXT)
    await waitFor(() => expect(calls).toHaveLength(1))

    expect(screen.getByTestId('edit-status').textContent).toBe('sending')

    await act(async () => {
      calls[0]?.settle(patchResult(HEAD_SEQ + 1, 'op-1'))
    })
    await waitFor(() =>
      expect(screen.getByTestId('edit-status').textContent).toBe('idle'),
    )
  })

  it('캔버스는 ack 뒤에도 낙관적으로 적용한 값을 유지한다', async () => {
    // 서버는 문서를 되돌려 주지 않는다(`apps/api/src/routes/pages.ts` — 클라이언트가 같은
    // ops를 이미 적용했기 때문이다). ack에서 문서를 건드리는 구현을 잡는다.
    const { calls, patchOps } = deferredPatchOps()
    await openPage(textDoc(), { apiOverrides: { patchOps } })
    mountDriver({ patchOps } as unknown as ApiClient)

    commit(NEW_TEXT)
    await waitFor(() => expect(calls).toHaveLength(1))
    await act(async () => {
      calls[0]?.settle(patchResult(HEAD_SEQ + 1, 'op-1'))
    })

    await waitForNode(TEXT_ID)
    expect(canvasText()).toBe(NEW_TEXT)
  })

  it('스토어가 다른 페이지를 들고 있으면 편집이 나가지 않는다', async () => {
    // **주소 대조의 동작 케이스다.** `store-access.test.ts`의 가드만 있으면 대조를 스토어
    // 직접 읽기로 바꾸는 변이에서 죽는 동작 케이스가 없다. **둘은 다른 것을 잡는다:** 가드는 소스 텍스트라 "우회를 썼다"는 사실만
    // 알고, 이 케이스는 "우회하면 무엇이 잘못되는가"를 잡는다.
    //
    // 잘못되는 것: 대조가 없으면 **앞 페이지의 ops가 다음 페이지 경로로, 앞 페이지의
    // revision을 `baseSeq`로 달고** 나간다(실측: 우회 판에서 `PATCH …/pages/pg-2/ops`가
    // `baseSeq 7`로 1건 나가고 ops의 경로는 `pg-1` 문서에서 만든 것이다). 두 페이지의
    // 구조가 겹치면 서버가 엉뚱한 페이지에 편집을 적용한다.
    const { calls, patchOps } = deferredPatchOps()
    await openPage(textDoc(), { apiOverrides: { patchOps } })

    // 스토어에는 `pg-1`이 실려 있는데 드라이버에는 `pg-2`를 준다 — 주소가 먼저 바뀐
    // 커밋의 상태다.
    mountDriver({ patchOps } as unknown as ApiClient, OTHER_PAGE_ID)

    commit(NEW_TEXT)
    await act(async () => {})

    expect(calls).toHaveLength(0)
    // 낙관적 적용도 없다 — 요청만 막고 문서를 바꾸는 구현을 잡는다.
    expect(canvasText()).toBe(OLD_TEXT)
  })
})
