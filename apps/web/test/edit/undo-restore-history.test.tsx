/**
 * **새로고침으로 채우는 되돌리기가 끊긴 자리를 더 받아 되짚는다**(`routes/editor.tsx`의 `restoreUndo` → `EditorStore.undoHistoryNeed` ·
 * `restoreUndoStack`). 스토어 쪽의 입구 × 출처 표는 `test/store/editor-store.test.ts`의 «새로고침 되돌리기의 입구 × 출처»가 들고, 여기는 셸이
 * 그 길을 실제로 밟는지 — 목록 뒤에 되짚기 조회를 내는지 · 목록을 받는 동안 판을 다시 실은 입구(재연결)의 답을 버리는지 · 떠났다 돌아온
 * 판에서 옛 답이 안 실리는지 · 되짚기 조회가 실패해도 남의 노드를 고치지 않고 건너뛴 것을 말하는지 — 를 잰다.
 *
 * 판: 연 판은 `HEAD_SEQ`(7). 되돌리기가 고칠 것은 «나»의 글이다 — 내 revision 의 `inverse`는 그 revision 을 기록한 판의 자리 경로라, 그 뒤 남이
 * 맨 앞에 «밥»을 넣었으면 옛 자리(`children/1`)는 «가»다.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import type { PageDocument, PatchOp } from '@wirebound/schema'
import { describe, expect, it, vi } from 'vitest'
import { ApiError, type ApiClient } from '../../src/api/client'
import type { PatchResult, RevisionSummary } from '../../src/api/types'
import type { RealtimeSocket } from '../../src/realtime/connection'
import { createConnectionIdHolder, type RealtimeSetup } from '../../src/realtime/context'
import { createEditChannel } from '../../src/realtime/edit-channel'
import {
  HEAD_SEQ,
  OTHER_PAGE_TITLE,
  PAGE_ID,
  PROJECT_ID,
  openPage,
  pageDetail,
  pageDoc,
  waitForNode,
} from '../editor-harness'
import '../../src/catalog-setup'

class FakeSocket implements RealtimeSocket {
  onopen: (() => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  /** 보낸 프레임 — 소켓이 열려 있으면 편집이 이 길로 나간다(`edit/ws-transport.ts`). */
  readonly sent: unknown[] = []
  send(data: string): void {
    this.sent.push(JSON.parse(data))
  }
  close(): void {
    this.onclose?.()
  }
}

const text = (id: string, content: string) => ({ id, type: 'Text', props: { content, role: 'body' } })

function doc(...children: ReturnType<typeof text>[]): PageDocument {
  return pageDoc({ id: 'n-root', type: 'Page', children })
}

function summary(seq: number, inverse: PatchOp[], actorId = 'u-1'): RevisionSummary {
  return { id: `rev-${seq}`, seq, actorType: 'user', actorId, actorLabel: actorId, ops: [], inverse, createdAt: '2026-09-25T09:00:00.000Z' }
}

/** 내 revision — «나»(연 판의 자리 `at`)의 글을 «옛 나»로 되돌린다. */
const myEdit = (seq: number, at: number) => summary(seq, [{ op: 'replace', path: `/root/children/${at}/props/content`, value: '옛 나' }])
/** 밥이 맨 앞에 넣은 revision 의 `inverse`. */
const bobInsert = (seq: number) => summary(seq, [{ op: 'remove', path: '/root/children/0' }], 'u-bob')

function undoButton(): HTMLButtonElement {
  return within(screen.getByRole('group', { name: '편집 이력' })).getByRole<HTMLButtonElement>('button', { name: '되돌리기' })
}

function contents(): string[] {
  return [...document.body.querySelectorAll('[data-wb-id^="n-"]')]
    .filter((node) => node.getAttribute('data-wb-id') !== 'n-root')
    .map((node) => node.textContent ?? '')
}

/** 풀 때까지 답을 붙잡는 약속. */
function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

interface Wiring {
  setup: RealtimeSetup
  sockets: FakeSocket[]
  scheduled: (() => void)[]
}

function wiring(): Wiring {
  const sockets: FakeSocket[] = []
  const scheduled: (() => void)[] = []
  return {
    sockets,
    scheduled,
    setup: {
      holder: createConnectionIdHolder(),
      channel: createEditChannel(),
      origin: 'http://localhost:5173',
      connection: {
        createSocket: () => {
          const socket = new FakeSocket()
          sockets.push(socket)
          return socket
        },
        schedule: (run) => {
          scheduled.push(run)
          return scheduled.length
        },
        cancel: () => {},
      },
    },
  }
}

/** 보낸 편집을 적고 번호를 올려 답한다. */
function recordingPatch(): { calls: PatchOp[][]; patchOps: ApiClient['patchOps'] } {
  const calls: PatchOp[][] = []
  let seq = 100
  return {
    calls,
    patchOps: async (_projectId, _pageId, body) => {
      calls.push(body.ops)
      seq += 1
      const result: PatchResult = { seq, revisionId: `rev-new-${seq}`, inverse: [], schemaVersion: 1, ...(body.clientOpId === undefined ? {} : { clientOpId: body.clientOpId }) }
      return result
    },
  }
}

describe('새로고침 되돌리기가 끊긴 자리를 받아 되짚는다', () => {
  it('내 마지막 편집 뒤에 남의 revision 이 있으면 그 구간을 받아 되짚고, 되돌리기가 제 노드를 고친다', async () => {
    const patch = recordingPatch()
    const before = vi.fn(async () => [bobInsert(HEAD_SEQ)])
    await openPage(doc(text('n-bob', '밥'), text('n-ga', '가'), text('n-na', '나')), {
      apiOverrides: { listMyRevisions: async () => [myEdit(HEAD_SEQ - 1, 1)], listRevisionsBefore: before, patchOps: patch.patchOps },
    })
    await waitFor(() => expect(undoButton().disabled).toBe(false))

    fireEvent.click(undoButton())

    await waitFor(() => expect(patch.calls).toHaveLength(1))
    expect(before.mock.calls.map((call) => (call as unknown[])[2])).toEqual([{ beforeSeq: HEAD_SEQ + 1, limit: 1 }])
    expect(patch.calls[0]).toEqual([{ op: 'replace', path: '/root/children/2/props/content', value: '옛 나' }])
    expect(contents()).toEqual(['밥', '가', '옛 나'])
  })

  it('이어진 내 revision 만이면 되짚기 조회를 내지 않는다', async () => {
    const before = vi.fn(async () => [])
    await openPage(doc(text('n-ga', '가'), text('n-na', '나')), {
      apiOverrides: { listMyRevisions: async () => [myEdit(HEAD_SEQ, 1)], listRevisionsBefore: before },
    })
    await waitFor(() => expect(undoButton().disabled).toBe(false))

    expect(before).not.toHaveBeenCalled()
  })

  it('목록 답이 오기 전에 남의 프레임이 닿으면 그 번호를 받아 되짚고 남의 노드는 그대로다', async () => {
    const { setup, sockets } = wiring()
    const patch = recordingPatch()
    const list = deferred<RevisionSummary[]>()
    const before = vi.fn(async () => [bobInsert(HEAD_SEQ + 1)])
    await openPage(doc(text('n-ga', '가'), text('n-na', '나')), {
      realtime: setup,
      apiOverrides: { listMyRevisions: () => list.promise, listRevisionsBefore: before, patchOps: patch.patchOps },
    })
    act(() => {
      sockets[0]?.onopen?.()
    })
    act(() => {
      sockets[0]?.onmessage?.({
        data: JSON.stringify({
          type: 'page-changed',
          projectId: PROJECT_ID,
          pageId: PAGE_ID,
          seq: HEAD_SEQ + 1,
          ops: [{ op: 'add', path: '/root/children/0', value: text('n-bob', '밥') }],
          warnings: [],
          actor: { type: 'user', label: '밥' },
        }),
      })
    })
    await waitForNode('n-bob')

    await act(async () => {
      list.resolve([myEdit(HEAD_SEQ, 1)])
    })
    await waitFor(() => expect(undoButton().disabled).toBe(false))
    fireEvent.click(undoButton())

    const patches = () => (sockets[0]?.sent ?? []).filter((frame) => (frame as { type?: string }).type === 'patch') as { ops: PatchOp[] }[]
    await waitFor(() => expect(patches().length + patch.calls.length).toBe(1))
    expect(before.mock.calls.map((call) => (call as unknown[])[2])).toEqual([{ beforeSeq: HEAD_SEQ + 2, limit: 1 }])
    expect([...patches().map((frame) => frame.ops), ...patch.calls]).toEqual([[{ op: 'replace', path: '/root/children/2/props/content', value: '옛 나' }]])
    expect(contents()).toEqual(['밥', '가', '옛 나'])
  })

  it('되짚기 조회가 실패하면 그 항목은 누를 때 건너뛰고 그 수를 말한다 — 경로 그대로 보내지 않는다', async () => {
    const patch = recordingPatch()
    await openPage(doc(text('n-bob', '밥'), text('n-ga', '가'), text('n-na', '나')), {
      apiOverrides: {
        listMyRevisions: async () => [myEdit(HEAD_SEQ - 1, 1)],
        listRevisionsBefore: async () => {
          throw new ApiError(500, 'internal', '되짚기 조회 실패 [UR]')
        },
        patchOps: patch.patchOps,
      },
    })
    await waitFor(() => expect(undoButton().disabled).toBe(false))

    fireEvent.click(undoButton())

    expect(await screen.findByText('되돌릴 수 없는 편집 1개를 건너뛰었습니다.', { exact: false })).toBeTruthy()
    await act(async () => {})
    expect(patch.calls).toEqual([])
    expect(contents()).toEqual(['밥', '가', '나'])
  })
})

describe('목록을 받는 동안 판이 다시 실리거나 떠나면 그 답을 싣지 않는다', () => {
  /** 되돌리기 목록을 붙잡은 채 연결을 한 번 끊었다 다시 붙인다 — 재조회가 돌려주는 판은 `resync`다. */
  async function reconnectWhileListing(resync: { headSeq: number; doc: PageDocument }): Promise<{ release(): Promise<void> }> {
    const { setup, sockets, scheduled } = wiring()
    const list = deferred<RevisionSummary[]>()
    let calls = 0
    const getPage = vi.fn(async (_projectId: string, pageId: string) => {
      calls += 1
      return calls === 1 ? pageDetail(pageId, doc(text('n-ga', '가'), text('n-na', '나'))) : { ...pageDetail(pageId, resync.doc), headSeq: resync.headSeq }
    })
    await openPage(doc(text('n-ga', '가'), text('n-na', '나')), {
      realtime: setup,
      apiOverrides: { getPage, listMyRevisions: () => list.promise, listRevisionsBefore: async () => [bobInsert(HEAD_SEQ + 1)] },
    })
    act(() => {
      sockets[0]?.onopen?.()
    })
    act(() => {
      sockets[0]?.onclose?.()
    })
    act(() => {
      scheduled.pop()?.()
    })
    act(() => {
      sockets[1]?.onopen?.()
    })
    await waitFor(() => expect(getPage).toHaveBeenCalledTimes(2))
    await act(async () => {})
    return {
      async release() {
        await act(async () => {
          list.resolve([myEdit(HEAD_SEQ, 1)])
        })
        await act(async () => {})
      },
    }
  }

  it('재연결 재조회가 판을 다시 실으면 붙잡혔던 목록 답을 싣지 않는다', async () => {
    const view = await reconnectWhileListing({ headSeq: HEAD_SEQ + 1, doc: doc(text('n-bob', '밥'), text('n-ga', '가'), text('n-na', '나')) })
    await waitForNode('n-bob')

    await view.release()

    expect(undoButton().disabled).toBe(true)
  })

  /** 대조 — 재조회가 판을 다시 싣지 않고 넘어가면(서버 판이 그대로) 같은 판이라 답을 싣는다. */
  it('재연결 재조회가 같은 판이라 넘어가면 붙잡혔던 목록 답을 싣는다', async () => {
    const view = await reconnectWhileListing({ headSeq: HEAD_SEQ, doc: doc(text('n-ga', '가'), text('n-na', '나')) })

    await view.release()

    await waitFor(() => expect(undoButton().disabled).toBe(false))
  })

  /**
   * **두 겹이 막는다 — 한 겹씩 떼면 초록이다.** 앞 방문의 조회는 떠나면 버려지고(`restoreUndo`의 `alive`), 버려지지 않아도 판의 세대가 달라 스토어가
   * 싣지 않는다(`EditorStore.restoreUndoStack`의 `point.epoch`). 세대 한 겹은 스토어의 «새로고침 되돌리기의 입구 × 출처»(떠났다 돌아옴)가 혼자 잰다.
   */
  it('떠났다 돌아온 판에 앞 방문의 목록 답이 실리지 않는다 — 돌아온 방문의 답만 싣는다', async () => {
    const patch = recordingPatch()
    const lists = [deferred<RevisionSummary[]>(), deferred<RevisionSummary[]>()]
    let listCalls = 0
    const listMyRevisions: ApiClient['listMyRevisions'] = (_projectId, pageId) => {
      if (pageId !== PAGE_ID) return Promise.resolve([])
      const answer = lists[listCalls]
      listCalls += 1
      return answer === undefined ? Promise.resolve([]) : answer.promise
    }
    await openPage(doc(text('n-ga', '가'), text('n-na', '나')), {
      apiOverrides: { listMyRevisions, patchOps: patch.patchOps },
      docs: { 'pg-2': doc(text('n-other', '다른 페이지')) },
    })
    const tree = () => within(screen.getByRole('region', { name: '메뉴·페이지 트리' }))
    fireEvent.click(tree().getByRole('link', { name: OTHER_PAGE_TITLE }))
    await waitForNode('n-other')
    fireEvent.click(tree().getByRole('link', { name: '회원 목록' }))
    await waitForNode('n-ga')
    await waitFor(() => expect(listCalls).toBe(2))

    await act(async () => {
      lists[0]?.resolve([summary(HEAD_SEQ, [{ op: 'replace', path: '/root/children/0/props/content', value: '앞 방문' }])])
    })
    await act(async () => {
      lists[1]?.resolve([summary(HEAD_SEQ, [{ op: 'replace', path: '/root/children/0/props/content', value: '돌아온 방문' }])])
    })
    await waitFor(() => expect(undoButton().disabled).toBe(false))
    fireEvent.click(undoButton())
    await waitFor(() => expect(patch.calls).toHaveLength(1))

    expect(patch.calls[0]).toEqual([{ op: 'replace', path: '/root/children/0/props/content', value: '돌아온 방문' }])
    expect(undoButton().disabled).toBe(true)
  })
})
