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
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type ApiClient } from '../../src/api/client'
import { createHttpClient, READ_DEADLINE_MS } from '../../src/api/http-client'
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
/** 다시 싣기가 버린 목록을 말하는 한 줄(`routes/editor.tsx`의 `UNDO_RESTORE_DROPPED_NOTICE`). */
const UNDO_LINE = '페이지를 다시 불러와 되돌리기 이력을 싣지 않았습니다 — 새로고침하면 다시 불러옵니다.'

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

function redoButton(): HTMLButtonElement {
  return within(screen.getByRole('group', { name: '편집 이력' })).getByRole<HTMLButtonElement>('button', { name: '다시 실행' })
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

  it('되짚기 조회를 받는 동안 판이 또 올라도 그 조회 하나로 되짚는다 — 목록 답을 실은 판에서 되짚는다', async () => {
    const { setup, sockets } = wiring()
    const list = deferred<RevisionSummary[]>()
    const answer = deferred<RevisionSummary[]>()
    const before = vi.fn((_projectId: string, _pageId: string, _range: { beforeSeq: number; limit: number }) => answer.promise)
    await openPage(doc(text('n-ga', '가'), text('n-na', '나')), {
      realtime: setup,
      apiOverrides: { listMyRevisions: () => list.promise, listRevisionsBefore: before },
    })
    act(() => {
      sockets[0]?.onopen?.()
    })
    const bob = (seq: number, id: string, content: string) =>
      act(() => {
        sockets[0]?.onmessage?.({
          data: JSON.stringify({
            type: 'page-changed',
            projectId: PROJECT_ID,
            pageId: PAGE_ID,
            seq,
            ops: [{ op: 'add', path: '/root/children/0', value: text(id, content) }],
            warnings: [],
            actor: { type: 'user', label: '밥' },
          }),
        })
      })
    bob(HEAD_SEQ + 1, 'n-bob', '밥')
    await act(async () => {
      list.resolve([myEdit(HEAD_SEQ, 1)])
    })
    await waitFor(() => expect(undoButton().disabled).toBe(false))
    fireEvent.click(undoButton())
    await waitFor(() => expect(before).toHaveBeenCalledTimes(1))
    // 되짚기 조회가 도는 동안 밥이 한 번 더 넣는다 — 목록 답을 실은 판(8) 위의 번호라 되짚을 구간 밖이다.
    bob(HEAD_SEQ + 2, 'n-bob2', '밥2')
    await act(async () => {
      answer.resolve([bobInsert(HEAD_SEQ + 1)])
    })

    const patches = () => (sockets[0]?.sent ?? []).filter((frame) => (frame as { type?: string }).type === 'patch') as { ops: PatchOp[] }[]
    await waitFor(() => expect(patches()).toHaveLength(1))
    expect(before.mock.calls.map((call) => call[2])).toEqual([{ beforeSeq: HEAD_SEQ + 2, limit: 1 }])
    expect(patches()[0]?.ops).toEqual([{ op: 'replace', path: '/root/children/3/props/content', value: '옛 나' }])
    expect(contents()).toEqual(['밥2', '밥', '가', '옛 나'])
  })

  /**
   * **한 조회의 상한(200)보다 긴 구간은 받은 것을 넘기고 다시 묻는다**(`edit/use-edit-commit.tsx`의 `UNDO_HISTORY_ROUNDS`). 내 편집(1) 뒤에
   * 밥이 205 번 고쳤다 — 첫 조회가 206 ~ 7 을, 둘째가 6 ~ 2 를 받는다.
   */
  it('되짚을 구간이 한 조회보다 길면 한 번 더 받아 되짚는다', async () => {
    const patch = recordingPatch()
    const HEAD = 206
    const history = [
      ...Array.from({ length: HEAD - 1 }, (_, index) =>
        summary(HEAD - index, [{ op: 'replace', path: '/root/children/1/props/content', value: `나${HEAD - index - 1}` }], 'u-bob'),
      ),
      summary(1, [{ op: 'replace', path: '/root/children/0/props/content', value: '옛 가' }]),
    ]
    const before = vi.fn(async (_projectId: string, _pageId: string, range: { beforeSeq: number; limit: number }) =>
      history.filter((entry) => entry.seq < range.beforeSeq).slice(0, range.limit),
    )
    const opened = doc(text('n-ga', '가'), text('n-na', `나${HEAD}`))
    await openPage(opened, {
      apiOverrides: {
        getPage: async (_projectId, pageId) => ({ ...pageDetail(pageId, opened), headSeq: HEAD }),
        listMyRevisions: async () => history.filter((entry) => entry.actorId === 'u-1'),
        listRevisionsBefore: before,
        patchOps: patch.patchOps,
      },
    })
    await waitFor(() => expect(undoButton().disabled).toBe(false))

    fireEvent.click(undoButton())

    // 보냈거나 건너뛰었다 — 한 번만 받으면 6 ~ 2 가 빠져 내 1 을 못 짓고 건너뛴다.
    await waitFor(() => expect(patch.calls.length > 0 || screen.queryByText('건너뛰었습니다', { exact: false }) !== null).toBe(true))
    expect({ fetches: before.mock.calls.map((call) => call[2]), sent: patch.calls }).toEqual({
      fetches: [
        { beforeSeq: HEAD + 1, limit: 200 },
        { beforeSeq: HEAD - 199, limit: HEAD - 201 },
      ],
      sent: [[{ op: 'replace', path: '/root/children/0/props/content', value: '옛 가' }]],
    })
  })

  /**
   * **한 누름에 받는 한도(`UNDO_HISTORY_ROUNDS` × 200)보다 긴 구간은 받은 데까지로 되짚고, 못 지은 항목은 건너뛰고 말한다** — 받을 만큼 받은 뒤의
   * 누름은 멈추지 않는다(`startUndo`의 `historyLoaded`). 멈추면 아무것도 안 하고 말도 없이 단추가 켜진 채 남아, 누를 때마다 같은 세 조회를 낸다.
   * 내 편집(1) 뒤에 밥이 609 번 고쳤다.
   */
  it('되짚을 구간이 한 누름에 받는 한도보다 길면 받은 데까지로 되짚고 못 지은 항목은 건너뛰고 말한다', async () => {
    const patch = recordingPatch()
    const HEAD = 610
    const history = [
      ...Array.from({ length: HEAD - 1 }, (_, index) =>
        summary(HEAD - index, [{ op: 'replace', path: '/root/children/1/props/content', value: `나${HEAD - index - 1}` }], 'u-bob'),
      ),
      summary(1, [{ op: 'replace', path: '/root/children/0/props/content', value: '옛 가' }]),
    ]
    const before = vi.fn(async (_projectId: string, _pageId: string, range: { beforeSeq: number; limit: number }) =>
      history.filter((entry) => entry.seq < range.beforeSeq).slice(0, range.limit),
    )
    const opened = doc(text('n-ga', '가'), text('n-na', `나${HEAD}`))
    await openPage(opened, {
      apiOverrides: {
        getPage: async (_projectId, pageId) => ({ ...pageDetail(pageId, opened), headSeq: HEAD }),
        listMyRevisions: async () => history.filter((entry) => entry.actorId === 'u-1'),
        listRevisionsBefore: before,
        patchOps: patch.patchOps,
      },
    })
    await waitFor(() => expect(undoButton().disabled).toBe(false))

    fireEvent.click(undoButton())
    await waitFor(() => expect(before).toHaveBeenCalledTimes(3))
    await act(async () => {})
    await act(async () => {})

    expect({
      fetches: before.mock.calls.map((call) => call[2]),
      sent: patch.calls,
      notice: screen.queryByText('건너뛰었습니다', { exact: false })?.textContent ?? null,
      enabled: !undoButton().disabled,
    }).toEqual({
      fetches: [
        { beforeSeq: HEAD + 1, limit: 200 },
        { beforeSeq: HEAD - 199, limit: 200 },
        { beforeSeq: HEAD - 399, limit: 200 },
      ],
      sent: [],
      notice: '되돌릴 수 없는 편집 1개를 건너뛰었습니다. 되돌릴 것이 더 없습니다.',
      enabled: false,
    })
  })
})

/**
 * **되짚기 이력은 처음 누를 때 받는다**(`edit/use-edit-commit.tsx`의 `loadUndoHistory`) — 누른 뒤 답을 기다리는 동안의 판. 판: 연 판 7 · 내 5 · 6
 * 은 «나»를 고쳤고 밥의 7 이 맨 앞에 «밥»을 넣었다 — 되짚으려면 7 을 받아야 한다.
 */
describe('누른 뒤 되짚기 이력을 기다리는 동안', () => {
  const MINE = [
    summary(HEAD_SEQ - 1, [{ op: 'replace', path: '/root/children/1/props/content', value: '옛 나' }]),
    summary(HEAD_SEQ - 2, [{ op: 'replace', path: '/root/children/1/props/content', value: '옛옛 나' }]),
  ]
  const OPENED = doc(text('n-bob', '밥'), text('n-ga', '가'), text('n-na', '나'))

  it('열 때는 되짚기 조회를 내지 않는다 — 처음 누를 때 한 번 받는다', async () => {
    const patch = recordingPatch()
    const before = vi.fn(async () => [bobInsert(HEAD_SEQ)])
    await openPage(OPENED, { apiOverrides: { listMyRevisions: async () => MINE, listRevisionsBefore: before, patchOps: patch.patchOps } })
    await waitFor(() => expect(undoButton().disabled).toBe(false))
    await act(async () => {})
    const atOpen = before.mock.calls.length

    fireEvent.click(undoButton())
    await waitFor(() => expect(patch.calls).toHaveLength(1))
    await act(async () => {})
    fireEvent.click(undoButton())
    await waitFor(() => expect(patch.calls).toHaveLength(2))

    expect({ atOpen, fetches: before.mock.calls.length, contents: contents() }).toEqual({ atOpen: 0, fetches: 1, contents: ['밥', '가', '옛옛 나'] })
  })

  /**
   * **받는 동안 단추가 꺼진다**(`canUndo`의 `undoHistoryLoading` — React 는 꺼진 단추의 클릭을 안 부른다). `undo`도 받는 중이면 버리지만 그 겹은
   * 이 케이스가 못 잰다 — 단추가 먼저 막는다. 되돌리기에는 단축키가 없어(`store/editor-store.ts`의 `startUndo` 머리말) 그 겹은 입구가 늘 때를
   * 위한 것이다.
   */
  it('받는 동안 단추가 꺼지고 그 사이 누른 것은 버린다 — 받은 뒤 한 번만 되돌린다', async () => {
    const patch = recordingPatch()
    const answer = deferred<RevisionSummary[]>()
    const before = vi.fn(() => answer.promise)
    await openPage(OPENED, { apiOverrides: { listMyRevisions: async () => MINE, listRevisionsBefore: before, patchOps: patch.patchOps } })
    await waitFor(() => expect(undoButton().disabled).toBe(false))

    fireEvent.click(undoButton())
    await waitFor(() => expect(undoButton().disabled).toBe(true))
    fireEvent.click(undoButton())
    fireEvent.click(undoButton())
    await act(async () => {
      answer.resolve([bobInsert(HEAD_SEQ)])
    })
    await waitFor(() => expect(patch.calls).toHaveLength(1))
    await act(async () => {})

    expect({ fetches: before.mock.calls.length, sent: patch.calls, enabled: !undoButton().disabled }).toEqual({
      fetches: 1,
      sent: [[{ op: 'replace', path: '/root/children/2/props/content', value: '옛 나' }]],
      enabled: true,
    })
  })

  it('받는 동안 떠나면 조회를 끊고 되돌리지 않는다', async () => {
    const patch = recordingPatch()
    const answer = deferred<RevisionSummary[]>()
    const signals: (AbortSignal | undefined)[] = []
    const before = vi.fn((_projectId: string, _pageId: string, _range: unknown, options?: { cancel?: AbortSignal }) => {
      signals.push(options?.cancel)
      return answer.promise
    })
    await openPage(OPENED, {
      apiOverrides: { listMyRevisions: async (_projectId, pageId) => (pageId === PAGE_ID ? MINE : []), listRevisionsBefore: before, patchOps: patch.patchOps },
      docs: { 'pg-2': doc(text('n-other', '다른 페이지')) },
    })
    await waitFor(() => expect(undoButton().disabled).toBe(false))
    fireEvent.click(undoButton())
    await waitFor(() => expect(before).toHaveBeenCalledTimes(1))

    fireEvent.click(within(screen.getByRole('region', { name: '메뉴·페이지 트리' })).getByRole('link', { name: OTHER_PAGE_TITLE }))
    await waitForNode('n-other')
    await act(async () => {
      answer.resolve([bobInsert(HEAD_SEQ)])
    })
    await act(async () => {})

    expect({ aborted: signals[0]?.aborted, sent: patch.calls, contents: contents() }).toEqual({ aborted: true, sent: [], contents: ['다른 페이지'] })
  })

  it('받는 동안 이 탭의 편집이 맨 위에 오르면 그 누름은 되돌리지 않는다 — 누른 때 되돌리려던 것이 아니다', async () => {
    const patch = recordingPatch()
    const answer = deferred<RevisionSummary[]>()
    await openPage(OPENED, {
      apiOverrides: { listMyRevisions: async () => MINE, listRevisionsBefore: () => answer.promise, patchOps: patch.patchOps },
    })
    await waitFor(() => expect(undoButton().disabled).toBe(false))
    fireEvent.click(undoButton())
    await waitFor(() => expect(undoButton().disabled).toBe(true))

    fireEvent.click(within(screen.getByRole('region', { name: '구조 트리' })).getAllByRole('button', { name: 'Text' })[1]!)
    const box = within(screen.getByRole('complementary', { name: '우측 패널' })).getByLabelText<HTMLTextAreaElement>('내용')
    fireEvent.change(box, { target: { value: '가 고침' } })
    fireEvent.blur(box)
    await waitFor(() => expect(patch.calls).toHaveLength(1))
    await act(async () => {
      answer.resolve([bobInsert(HEAD_SEQ)])
    })
    await act(async () => {})

    expect({ sent: patch.calls.length, contents: contents(), enabled: !undoButton().disabled }).toEqual({
      sent: 1,
      contents: ['밥', '가 고침', '나'],
      enabled: true,
    })
  })

  /**
   * **받는 동안 다시 실행 단추도 꺼진다**(`canRedo`의 `undoHistoryLoading`). 판: 열고 나서 «가»를 고치고(세션 편집) 되돌려 다시 실행 스택에 하나가
   * 있다. 되돌리기를 한 번 더 누르면 맨 위가 복원 항목이라 받는다 — 그 사이 다시 실행을 누르면 세션 편집이 맨 위에 올라 받은 뒤 그 누름을 말없이
   * 버린다(`loadUndoHistory`의 맨 위 비교). 단추를 끄면 받은 뒤 되돌리고, 다시 실행은 그 뒤에 둘(되돌린 복원 항목 · 세션 편집)로 남는다.
   * `redo` 안의 «받는 중이면 버린다» 가드는 이 케이스가 못 잰다 — 단추가 먼저 막는다(위 되돌리기 단추의 케이스와 같다).
   */
  it('받는 동안 다시 실행 단추도 꺼진다 — 받은 뒤 되돌리고, 다시 실행은 그 뒤에 남는다', async () => {
    const patch = recordingPatch()
    const answer = deferred<RevisionSummary[]>()
    await openPage(OPENED, {
      apiOverrides: { listMyRevisions: async () => MINE, listRevisionsBefore: () => answer.promise, patchOps: patch.patchOps },
    })
    await waitFor(() => expect(undoButton().disabled).toBe(false))
    fireEvent.click(within(screen.getByRole('region', { name: '구조 트리' })).getAllByRole('button', { name: 'Text' })[1]!)
    const box = within(screen.getByRole('complementary', { name: '우측 패널' })).getByLabelText<HTMLTextAreaElement>('내용')
    fireEvent.change(box, { target: { value: '가 고침' } })
    fireEvent.blur(box)
    await waitFor(() => expect(patch.calls).toHaveLength(1))
    await act(async () => {})
    fireEvent.click(undoButton())
    await waitFor(() => expect(patch.calls).toHaveLength(2))
    await waitFor(() => expect(redoButton().disabled).toBe(false))

    fireEvent.click(undoButton())
    await waitFor(() => expect(undoButton().disabled).toBe(true))
    const whileLoading = { undo: undoButton().disabled, redo: redoButton().disabled }
    fireEvent.click(redoButton())
    await act(async () => {
      answer.resolve([bobInsert(HEAD_SEQ)])
    })
    await waitFor(() => expect(patch.calls.length).toBeGreaterThan(2))
    await act(async () => {})

    expect({ whileLoading, sent: patch.calls.slice(2), notice: screen.queryByRole('alert')?.textContent ?? null, redo: !redoButton().disabled }).toEqual({
      whileLoading: { undo: true, redo: true },
      sent: [[{ op: 'replace', path: '/root/children/2/props/content', value: '옛 나' }]],
      notice: null,
      redo: true,
    })
  })

  /**
   * **맨 위 세션 항목을 건너뛴 누름도 복원 항목에 닿으면 받고 되돌린다**(`EditorStore.#startFrom`의 `history`). 판: 열고 나서 «가»를 고쳐 ack(8 —
   * 세션 항목), 밥이 «가»를 지웠다(9). 누르면 세션 항목은 못 얹어 건너뛰고 같은 누름이 내 6 에 닿는다 — 되짚으려면 7 을 받아야 한다. 받지 않고
   * 붙잡으면 6 · 5 를 못 짓고 한 누름에 전부 건너뛰어 스택이 빈다. 누르기 직전까지 세우고 보낸 편집 프레임을 읽는 함수를 돌려준다.
   */
  async function sessionTopGone(before: ApiClient['listRevisionsBefore']): Promise<() => PatchOp[][]> {
    const { setup, sockets } = wiring()
    await openPage(OPENED, { realtime: setup, apiOverrides: { listMyRevisions: async () => MINE, listRevisionsBefore: before } })
    act(() => {
      sockets[0]?.onopen?.()
    })
    await waitFor(() => expect(undoButton().disabled).toBe(false))
    const patches = () => (sockets[0]?.sent ?? []).filter((frame) => (frame as { type?: string }).type === 'patch') as { ops: PatchOp[]; clientOpId: string }[]
    fireEvent.click(within(screen.getByRole('region', { name: '구조 트리' })).getAllByRole('button', { name: 'Text' })[1]!)
    const box = within(screen.getByRole('complementary', { name: '우측 패널' })).getByLabelText<HTMLTextAreaElement>('내용')
    fireEvent.change(box, { target: { value: '가 고침' } })
    fireEvent.blur(box)
    await waitFor(() => expect(patches()).toHaveLength(1))
    const frame = (data: Record<string, unknown>) =>
      act(() => {
        sockets[0]?.onmessage?.({ data: JSON.stringify({ projectId: PROJECT_ID, pageId: PAGE_ID, warnings: [], ...data }) })
      })
    frame({
      type: 'patch-ack',
      clientOpId: patches()[0]?.clientOpId,
      seq: HEAD_SEQ + 1,
      revisionId: 'rev-session',
      inverse: [{ op: 'replace', path: '/root/children/1/props/content', value: '가' }],
    })
    await act(async () => {})
    frame({ type: 'page-changed', seq: HEAD_SEQ + 2, ops: [{ op: 'remove', path: '/root/children/1' }], actor: { type: 'user', label: '밥' } })
    await waitFor(() => expect(contents()).toEqual(['밥', '나']))
    return () => patches().slice(1).map((sent) => sent.ops)
  }

  it('맨 위 세션 항목을 건너뛴 누름이 복원 항목에 닿으면 받은 뒤 제 노드를 되돌리고, 건너뛴 것은 그 세션 항목 하나다', async () => {
    const before = vi.fn(async () => [bobInsert(HEAD_SEQ)])
    const sent = await sessionTopGone(before)

    fireEvent.click(undoButton())
    // 보냈거나 건너뛰고 멈췄다 — 받지 않고 붙잡으면 보냄 0 · «되돌릴 것이 더 없습니다»로 끝난다.
    await waitFor(() => expect(sent().length > 0 || screen.queryByText('되돌릴 것이 더 없습니다', { exact: false }) !== null).toBe(true))
    await act(async () => {})

    expect({
      fetches: before.mock.calls.map((call) => (call as unknown[])[2]),
      sent: sent(),
      notice: screen.queryByText('건너뛰었습니다', { exact: false })?.textContent ?? null,
      enabled: !undoButton().disabled,
      contents: contents(),
    }).toEqual({
      fetches: [{ beforeSeq: HEAD_SEQ + 1, limit: 1 }],
      sent: [[{ op: 'replace', path: '/root/children/1/props/content', value: '옛 나' }]],
      notice: '되돌릴 수 없는 편집 1개를 건너뛰었습니다. 그 앞의 편집을 되돌렸습니다.',
      enabled: true,
      contents: ['밥', '옛 나'],
    })
  })

  it('맨 위 세션 항목을 건너뛴 누름의 되짚기 조회가 실패하면 건너뛴 것과 실패를 함께 말하고, 다시 누르면 받아 제 노드를 되돌린다', async () => {
    let calls = 0
    const sent = await sessionTopGone(async () => {
      calls += 1
      if (calls === 1) throw new ApiError(500, 'internal', '되짚기 조회 실패 [UR]')
      return [bobInsert(HEAD_SEQ)]
    })

    fireEvent.click(undoButton())
    const notice = await screen.findByText('되돌리지 않았습니다', { exact: false })
    await act(async () => {})
    const first = { notice: notice.textContent, sent: sent().length, enabled: !undoButton().disabled }
    fireEvent.click(undoButton())
    await waitFor(() => expect(sent()).toHaveLength(1))

    expect(first).toEqual({
      notice: '되돌릴 수 없는 편집 1개를 건너뛰었습니다. 되짚기 조회 실패 [UR] — 되돌리지 않았습니다. 다시 누르면 다시 불러옵니다.',
      sent: 0,
      enabled: true,
    })
    expect({ sent: sent(), contents: contents() }).toEqual({
      sent: [[{ op: 'replace', path: '/root/children/1/props/content', value: '옛 나' }]],
      contents: ['밥', '옛 나'],
    })
  })

  /**
   * **조회가 실패하면 되돌리지 않고 그렇다고 말한다 — 항목은 남고 다시 누르면 다시 받는다.** 받은 데까지로 되짚으면 못 지은 항목이 건너뛰어져
   * 스택에서 사라진다. 세션이 끊겼으면 로그인으로 간다(아래 케이스). 판마다 서버가 답하는 실패다.
   */
  const FAILURES: readonly { name: string; error: () => unknown; says: string }[] = [
    { name: '403', error: () => new ApiError(403, 'forbidden', '권한이 없습니다 [UR]'), says: '권한이 없습니다 [UR]' },
    { name: '404', error: () => new ApiError(404, 'not-found', '페이지가 없습니다 [UR]'), says: '페이지가 없습니다 [UR]' },
    { name: '500', error: () => new ApiError(500, 'internal', '되짚기 조회 실패 [UR]'), says: '되짚기 조회 실패 [UR]' },
    { name: '연결 실패', error: () => new TypeError('Failed to fetch'), says: '되돌리기 이력을 불러오지 못했습니다' },
  ]
  for (const failure of FAILURES) {
    it(`되짚기 조회가 실패하면(${failure.name}) 되돌리지 않고 말하며, 다시 누르면 다시 받아 제 노드를 되돌린다`, async () => {
      const patch = recordingPatch()
      let calls = 0
      const before = vi.fn(async () => {
        calls += 1
        if (calls === 1) throw failure.error()
        return [bobInsert(HEAD_SEQ)]
      })
      await openPage(OPENED, { apiOverrides: { listMyRevisions: async () => MINE, listRevisionsBefore: before, patchOps: patch.patchOps } })
      await waitFor(() => expect(undoButton().disabled).toBe(false))

      fireEvent.click(undoButton())
      const notice = await screen.findByText('되돌리지 않았습니다', { exact: false })
      await act(async () => {})
      const first = { notice: notice.textContent, sent: patch.calls.length, contents: contents(), enabled: !undoButton().disabled }
      fireEvent.click(undoButton())
      await waitFor(() => expect(patch.calls).toHaveLength(1))

      expect(first).toEqual({ notice: `${failure.says} — 되돌리지 않았습니다. 다시 누르면 다시 불러옵니다.`, sent: 0, contents: ['밥', '가', '나'], enabled: true })
      expect(patch.calls[0]).toEqual([{ op: 'replace', path: '/root/children/2/props/content', value: '옛 나' }])
    })
  }

  /**
   * **조회가 끝내 답하지 않아도 단추가 꺼진 채 남지 않는다** — 되짚기 조회는 일반 읽기라 HTTP 클라이언트의 시간 한도를 탄다(`api/http-client.ts`의
   * `READ_DEADLINE_MS` — 머리까지 10초 · 두 번). 넘으면 실패 갈래로 가 말하고 단추가 다시 켜진다. 여기는 가짜 api 가 아니라 실물 클라이언트에 답하지
   * 않는 `fetch`를 물린다(끊기면 `fetch`처럼 거절한다).
   */
  describe('되짚기 조회가 답하지 않으면', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('시간 한도에 실패로 끝나 말하고 단추가 다시 켜지며, 다시 누르면 다시 받아 제 노드를 되돌린다', async () => {
      const patch = recordingPatch()
      let answers = false
      const asked: string[] = []
      const fetchImpl: typeof fetch = (input, init) => {
        asked.push(String(input))
        if (answers) {
          return Promise.resolve(new Response(JSON.stringify([bobInsert(HEAD_SEQ)]), { status: 200, headers: { 'content-type': 'application/json' } }))
        }
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        })
      }
      const http = createHttpClient(fetchImpl)
      await openPage(OPENED, {
        apiOverrides: { listMyRevisions: async () => MINE, listRevisionsBefore: http.listRevisionsBefore, patchOps: patch.patchOps },
      })
      await waitFor(() => expect(undoButton().disabled).toBe(false))
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })

      fireEvent.click(undoButton())
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2 * READ_DEADLINE_MS - 1)
      })
      const waiting = { asked: asked.length, disabled: undoButton().disabled, notice: screen.queryByText('되돌리지 않았습니다', { exact: false }) }
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1)
      })
      const timedOut = {
        notice: screen.queryByText('되돌리지 않았습니다', { exact: false })?.textContent ?? null,
        sent: patch.calls.length,
        enabled: !undoButton().disabled,
      }
      expect({ waiting, timedOut }).toEqual({
        waiting: { asked: 2, disabled: true, notice: null },
        timedOut: { notice: '서버가 응답하지 않습니다 — 잠시 뒤 새로고침하세요 — 되돌리지 않았습니다. 다시 누르면 다시 불러옵니다.', sent: 0, enabled: true },
      })
      vi.useRealTimers()
      answers = true
      fireEvent.click(undoButton())
      await waitFor(() => expect(patch.calls).toHaveLength(1))

      expect({ asked: asked.length, sent: patch.calls, contents: contents() }).toEqual({
        asked: 3,
        sent: [[{ op: 'replace', path: '/root/children/2/props/content', value: '옛 나' }]],
        contents: ['밥', '가', '옛 나'],
      })
    })
  })

  it('되짚기 조회가 401 이면 되돌리지 않고 로그인으로 간다', async () => {
    const patch = recordingPatch()
    await openPage(OPENED, {
      apiOverrides: {
        listMyRevisions: async () => MINE,
        listRevisionsBefore: async () => {
          throw new ApiError(401, 'unauthenticated', '로그인이 필요합니다')
        },
        patchOps: patch.patchOps,
      },
    })
    await waitFor(() => expect(undoButton().disabled).toBe(false))

    fireEvent.click(undoButton())

    await screen.findByLabelText('이메일')
    expect(patch.calls).toEqual([])
  })
})

/**
 * **둘이 번갈아 고친 페이지** — 밥이 «가» · «나»를 넣은 뒤(1) 나는 «가»를(짝수), 밥은 «나»를(홀수) 10 번씩 번갈아 고쳤다(판 21). 내 revision
 * 사이마다 남의 것이 하나씩 끼어 구멍이 열이다. 되짚기 조회가 구멍마다 하나씩 들면 회수 한도(`UNDO_HISTORY_ROUNDS`)가 먼저 차 그 아래 항목을 못
 * 짓는다 — 빠진 구간의 아래 끝은 이미 가진 번호가 아니라 «그 아래가 모두 찬 데»까지다(`EditorStore.undoHistoryNeed`).
 */
describe('번갈아 고친 페이지', () => {
  const EDITS = 10
  const HEAD = 2 * EDITS + 1
  const revision = (seq: number): RevisionSummary => {
    const k = seq / 2
    return seq % 2 === 0
      ? summary(seq, [{ op: 'replace', path: '/root/children/0/props/content', value: `가${k - 1}` }])
      : summary(seq, [{ op: 'replace', path: '/root/children/1/props/content', value: `나${(seq - 1) / 2 - 1}` }], 'u-bob')
  }
  const history = Array.from({ length: HEAD - 1 }, (_, index) => revision(HEAD - index))

  it('되짚기 조회 한 번으로 내 편집 열을 전부 되돌리고 밥의 «나»는 그대로다', async () => {
    const patch = recordingPatch()
    const before = vi.fn(async (_projectId: string, _pageId: string, range: { beforeSeq: number; limit: number }) =>
      history.filter((entry) => entry.seq < range.beforeSeq).slice(0, range.limit),
    )
    const opened = doc(text('n-ga', `가${EDITS}`), text('n-na', `나${EDITS}`))
    await openPage(opened, {
      apiOverrides: {
        getPage: async (_projectId, pageId) => ({ ...pageDetail(pageId, opened), headSeq: HEAD }),
        listMyRevisions: async () => history.filter((entry) => entry.actorId === 'u-1'),
        listRevisionsBefore: before,
        patchOps: patch.patchOps,
      },
    })
    await waitFor(() => expect(undoButton().disabled).toBe(false))

    for (let press = 0; press < EDITS && !undoButton().disabled; press += 1) {
      const sent = patch.calls.length
      fireEvent.click(undoButton())
      await waitFor(() => expect(patch.calls.length > sent || screen.queryByText('건너뛰었습니다', { exact: false }) !== null).toBe(true))
      await act(async () => {})
    }

    expect({
      fetches: before.mock.calls.map((call) => call[2]),
      sent: patch.calls.length,
      skipped: screen.queryByText('건너뛰었습니다', { exact: false })?.textContent ?? null,
      contents: contents(),
    }).toEqual({ fetches: [{ beforeSeq: HEAD + 1, limit: HEAD - 2 }], sent: EDITS, skipped: null, contents: ['가0', `나${EDITS}`] })
  })
})

describe('목록을 받는 동안 판이 다시 실리거나 떠나면 그 답을 싣지 않는다', () => {
  /** 되돌리기 목록을 붙잡은 채 연결을 한 번 끊었다 다시 붙인다 — 재조회가 돌려주는 판은 `resync`다. */
  async function reconnectWhileListing(resync: { headSeq: number; doc: PageDocument }): Promise<{ release(mine?: RevisionSummary[]): Promise<void> }> {
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
      async release(mine = [myEdit(HEAD_SEQ, 1)]) {
        await act(async () => {
          list.resolve(mine)
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

  /**
   * **버린 것을 한 줄 말한다**(`routes/editor.tsx`의 `UNDO_RESTORE_DROPPED_NOTICE`) — 다시 싣기는 그때 스택이 비어 있어 이력을 잃었다고 말하지
   * 않았다(`tellLost`의 `hadUndo`). 실을 것이 없던 목록이면 잃은 것이 없어 말하지 않는다(대조).
   */
  it('재연결 재조회가 판을 다시 실어 목록 답을 버리면 그렇다고 한 줄 말한다', async () => {
    const view = await reconnectWhileListing({ headSeq: HEAD_SEQ + 1, doc: doc(text('n-bob', '밥'), text('n-ga', '가'), text('n-na', '나')) })
    await waitForNode('n-bob')
    const beforeRelease = screen.queryByRole('alert')?.textContent ?? null

    await view.release()

    expect({ beforeRelease, after: screen.queryByRole('alert')?.textContent ?? null }).toEqual({
      beforeRelease: null,
      after: '페이지를 다시 불러와 되돌리기 이력을 싣지 않았습니다 — 새로고침하면 다시 불러옵니다.',
    })
  })

  /**
   * **다시 싣기가 이미 말했으면 덮지 않는다** — 그 문장이 버린 편집을 말하고 있으면 덮는 순간 그 수를 잃는다. 판: 목록을 붙잡은 채 편집이 거절돼
   * 수습이 판을 다시 싣고 거절을 말했다. 이력 한 줄은 그보다 약하다(잃은 편집이 없다) — 잃음의 조각으로 그 문장 **뒤에** 잇는다
   * (`EditorStore.tellLoss` · `store/loss-notice.ts`의 세기).
   */
  it('편집 실패 수습이 판을 다시 실으며 이미 말했으면 목록 답을 버려도 그 문장을 덮지 않는다', async () => {
    const list = deferred<RevisionSummary[]>()
    await openPage(doc(text('n-ga', '가'), text('n-na', '나')), {
      apiOverrides: {
        listMyRevisions: () => list.promise,
        patchOps: async () => {
          throw new ApiError(422, 'validation-failed', '거절된 편집 [UL]')
        },
      },
    })
    fireEvent.click(within(screen.getByRole('region', { name: '구조 트리' })).getAllByRole('button', { name: 'Text' })[0]!)
    const box = within(screen.getByRole('complementary', { name: '우측 패널' })).getByLabelText<HTMLTextAreaElement>('내용')
    fireEvent.change(box, { target: { value: '가 고침' } })
    fireEvent.blur(box)
    await screen.findByText('거절된 편집 [UL]', { exact: false })
    const said = screen.getByRole('alert').textContent

    await act(async () => {
      list.resolve([myEdit(HEAD_SEQ, 1)])
    })
    await act(async () => {})

    const now = screen.getByRole('alert').textContent ?? ''
    expect({ kept: said !== null && now.startsWith(said), undoLine: now.endsWith(UNDO_LINE), undo: undoButton().disabled }).toEqual({
      kept: true,
      undoLine: true,
      undo: true,
    })
  })

  it('재연결 재조회가 판을 다시 실었어도 실을 것이 없던 목록이면 말하지 않는다', async () => {
    const view = await reconnectWhileListing({ headSeq: HEAD_SEQ + 1, doc: doc(text('n-bob', '밥'), text('n-ga', '가'), text('n-na', '나')) })
    await waitForNode('n-bob')

    await view.release([])

    expect(screen.queryByRole('alert')).toBeNull()
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
