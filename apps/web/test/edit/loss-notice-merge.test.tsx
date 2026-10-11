/**
 * **잃음을 말한 통지는 뒤에 온 통지에 덮여 사라지지 않는다**(`EditorStore.tellLoss` · `store/loss-notice.ts`). 통지 자리는 하나이고 잃음을
 * 말하는 쪽은 제 때에 온다 — 셸째 띄워 그 겨룸을 세운다(쓰는 자리: `edit/use-edit-commit.tsx`의 `recover` · 떠남 거절, `routes/editor.tsx`의
 * `tellLost` · `leavePage`, `realtime/use-realtime.ts`의 리베이스 버림).
 *
 * | 판 | 먼저 선 잃음 | 뒤에 온 통지 | 케이스 |
 * |---|---|---|---|
 * | P2 | 복원 다시 읽기가 버린 편집 | 판을 못 정한 수습의 답 | «복원 다시 읽기의 잃음 뒤에 …» |
 * | P3 | 떠남(끊김에 합쳐진 «모름») | 재연결 재조회의 «이력 초기화» | «떠남 통지 뒤에 …» |
 * | P4 | 새 페이지의 리베이스 버림 | 앞 페이지의 늦은 거절 | «리베이스 버림 뒤에 …» |
 *
 * 합치기(같은 틀은 수를 더한다)와 수명(새 편집 · 다시 연 페이지 · 닫기)은 뒤의 묶음이 잰다. 조각을 합치는 규칙 자체는
 * `test/store/loss-notice.test.ts`가 스토어로 잰다.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import type { PageDocument } from '@wirebound/schema'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '../../src/api/client'
import type { PageDetail, RevisionSummary } from '../../src/api/types'
import type { RealtimeSocket } from '../../src/realtime/connection'
import { createConnectionIdHolder, type RealtimeSetup } from '../../src/realtime/context'
import { createEditChannel } from '../../src/realtime/edit-channel'
import {
  HEAD_SEQ,
  OTHER_PAGE_ID,
  OTHER_PAGE_TITLE,
  PAGE_ID,
  PROJECT_ID,
  openPage,
  pageDetail,
  pageDoc,
  structureTypes,
} from '../editor-harness'
import { treeTool, structureRowName } from '../panels/tree-row'

class FakeSocket implements RealtimeSocket {
  onopen: (() => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  readonly sent: string[] = []
  send(data: string): void {
    this.sent.push(data)
  }
  close(): void {
    this.onclose?.()
  }
}

const pair = (): PageDocument =>
  pageDoc({
    id: 'n-root',
    type: 'Page',
    children: [
      { id: 'n-a', type: 'Text', props: {} },
      { id: 'n-b', type: 'Divider', props: {} },
    ],
  })
const swapped = (): PageDocument =>
  pageDoc({
    id: 'n-root',
    type: 'Page',
    children: [
      { id: 'n-b', type: 'Divider', props: {} },
      { id: 'n-a', type: 'Text', props: {} },
    ],
  })
const withButton = (): PageDocument =>
  pageDoc({
    id: 'n-root',
    type: 'Page',
    children: [
      { id: 'n-a', type: 'Text', props: {} },
      { id: 'n-b', type: 'Divider', props: {} },
      { id: 'n-bob', type: 'Button', props: {} },
    ],
  })

/** 형제 셋 — 버림을 두 번 세운다(`리베이스가 거듭 버리면 …`). */
const triple = (): PageDocument =>
  pageDoc({
    id: 'n-root',
    type: 'Page',
    children: [
      { id: 'n-a', type: 'Text', props: {} },
      { id: 'n-b', type: 'Divider', props: {} },
      { id: 'n-c', type: 'Button', props: {} },
    ],
  })

const RESTORED = { type: 'restored', projectId: PROJECT_ID, snapshotId: 's1', actor: { type: 'user', label: '밥' } } as const
const CONFLICT = { status: 409, code: 'conflict', message: '페이지가 이미 변경되었습니다' }

/** 밥이 첫째 자식을 지운 revision 의 프레임 — 그 자리를 건드린 내 안 보낸 편집은 리베이스에서 버려진다. */
const BOB_REMOVES_FIRST = (seq: number, pageId: string) =>
  ({
    type: 'page-changed',
    projectId: PROJECT_ID,
    pageId,
    seq,
    ops: [{ op: 'remove', path: '/root/children/0' }],
    warnings: [],
    actor: { type: 'user', label: '밥' },
  }) as const

interface SentPatch {
  clientOpId: string
  pageId: string
  baseSeq: number
}
interface Held {
  pageId: string
  resolve: (page: PageDetail) => void
  reject: (error: unknown) => void
}

/** 셸을 열고 소켓을 붙인다. `getPage`는 첫 부름과 `immediate`가 고른 부름만 곧바로 답하고 나머지는 `held`에 쥔다. */
async function mount(
  options: { immediate?: (pageId: string) => PageDetail | undefined; api?: Partial<ApiClient>; doc?: () => PageDocument } = {},
) {
  const doc = options.doc ?? pair
  const sockets: FakeSocket[] = []
  const scheduled: (() => void)[] = []
  const setup: RealtimeSetup = {
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
  }
  const held: Held[] = []
  let calls = 0
  const getPage = vi.fn((_projectId: string, pageId: string) => {
    calls += 1
    if (calls === 1) return Promise.resolve(pageDetail(pageId, doc()))
    const now = options.immediate?.(pageId)
    if (now !== undefined) return Promise.resolve(now)
    return new Promise<PageDetail>((resolve, reject) => held.push({ pageId, resolve, reject }))
  })
  await openPage(doc(), { realtime: setup, apiOverrides: { ...options.api, getPage } })
  act(() => {
    sockets[0]?.onopen?.()
  })
  const last = (): FakeSocket => sockets[sockets.length - 1]!
  const push = (frame: object): void => {
    act(() => {
      last().onmessage?.({ data: JSON.stringify(frame) })
    })
  }
  const patches = (): SentPatch[] =>
    sockets.flatMap((socket) => socket.sent.filter((raw) => raw.includes('"patch"')).map((raw) => JSON.parse(raw) as SentPatch))
  const tool = async (node: string, label: string): Promise<void> => {
    const tree = screen.getByRole('region', { name: '구조 트리' })
    fireEvent.click(within(tree).getByRole('button', { name: structureRowName(node) }))
    fireEvent.click(treeTool(tree, label))
    await act(async () => {})
  }
  const moveDown = async (): Promise<SentPatch> => {
    await tool('Text', '아래로')
    const sent = patches()
    return sent[sent.length - 1]!
  }
  const refuse = (patch: SentPatch): void =>
    push({ type: 'patch-error', projectId: PROJECT_ID, pageId: patch.pageId, clientOpId: patch.clientOpId, ...CONFLICT, issues: [] })
  /** 소켓만 닫는다 — 나가 있던 편집은 답을 못 받는다(다시 붙지 않는다). */
  const closeOnly = (): void => {
    act(() => {
      last().onclose?.()
    })
  }
  /** 닫힌 소켓을 다시 붙인다 — 재연결 재조회가 돈다. */
  const reopen = (): void => {
    act(() => {
      scheduled.pop()?.()
    })
    act(() => {
      last().onopen?.()
    })
  }
  return { getPage, held, push, patches, tool, moveDown, refuse, closeOnly, reopen }
}

const reloadButton = (): HTMLElement => screen.getByRole('button', { name: '다시 불러오기' })

/**
 * **거절 둘이 한 통지에 잇닿는 판** — 첫 편집이 409(`conflict`)를 받고 그 수습 조회를 붙잡는다 → 남의 복원 · «다시 불러오기»가 새 판을
 * 싣는다 → 그 판에서 둘째 편집을 낸다(수습이 끝나면 나간다) → 수습의 옛 답(판을 못 정함 · 첫 거절의 조각) → 둘째 편집이 `second`로 거절되고
 * 그 수습이 둘째 조각을 잇는다. 끝의 편집 통지 글을 낸다.
 */
async function twoRefusals(second: { status: number; code: string; message: string }): Promise<string> {
  let calls = 0
  const view = await mount({
    immediate: () => {
      calls += 1
      // 첫째(첫 수습)는 붙잡고, 그 뒤(복원 다시 읽기 · 둘째 수습)는 새 판으로 곧바로 답한다.
      return calls === 1 ? undefined : { ...pageDetail(PAGE_ID, swapped()), headSeq: HEAD_SEQ + 2 }
    },
  })
  const first = await view.moveDown()
  view.refuse(first)
  await waitFor(() => expect(view.held).toHaveLength(1))
  view.push(RESTORED)
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  fireEvent.click(reloadButton())
  await act(async () => {
    vi.advanceTimersByTime(3_000)
  })
  await act(async () => {})
  vi.useRealTimers()
  await waitFor(() => expect(view.getPage).toHaveBeenCalledTimes(3))
  await act(async () => {})
  // 새 판에서 낸 둘째 편집 — 첫 수습이 끝나야 나간다.
  await view.tool('Divider', '아래로')
  expect(view.patches()).toHaveLength(1)
  await act(async () => {
    view.held[0]!.resolve(pageDetail(PAGE_ID, pair()))
  })
  await act(async () => {})
  // 판 카나리아 — 첫 거절의 조각이 섰고 둘째 편집이 나갔다.
  expect(alertText()).toBe('페이지가 이미 변경되었습니다 — 페이지를 서버 상태로 다시 불러왔고, 편집 1개가 취소됐습니다.')
  const sent = view.patches()
  expect(sent).toHaveLength(2)
  const next = sent[1]!
  view.push({ type: 'patch-error', projectId: PROJECT_ID, pageId: next.pageId, clientOpId: next.clientOpId, ...second, issues: [] })
  await waitFor(() => expect(view.getPage).toHaveBeenCalledTimes(4))
  await act(async () => {})
  await act(async () => {})
  return alertText()
}
/** 편집 통지 자리(`shell/edit-alert.tsx`)의 글 — 캔버스의 렌더 오류 같은 다른 `alert`은 섞지 않는다. */
const alertText = (): string =>
  screen
    .queryAllByRole('alert')
    .filter((node) => node.classList.contains('wb-shell-edit-alert'))
    .map((node) => node.textContent)
    .join(' | ')
const closeButtons = (): number => screen.queryAllByRole('button', { name: '통지 닫기' }).length

const DROPPED_ONE = '다른 사람의 변경과 겹쳐 아직 저장되지 않은 편집 1개를 버렸습니다.'

afterEach(() => {
  vi.useRealTimers()
})

describe('잃음을 말한 통지는 뒤에 온 통지에 덮이지 않는다', () => {
  it('복원 다시 읽기의 잃음 뒤에 판을 못 정한 수습의 답이 와도 둘 다 말한다 (P2)', async () => {
    let calls = 0
    const view = await mount({
      immediate: () => {
        calls += 1
        // 첫째(수습)는 붙잡고, 둘째(복원 다시 읽기)는 새 판으로 곧바로 답한다.
        return calls === 1 ? undefined : { ...pageDetail(PAGE_ID, swapped()), headSeq: HEAD_SEQ + 2 }
      },
    })
    const sent = await view.moveDown()
    view.refuse(sent)
    await waitFor(() => expect(view.held).toHaveLength(1))
    // 수습 중에 낸 편집 — 전송 루프는 수습에 쥐여 안 나가고, 복원 다시 읽기가 판을 실으며 버린다.
    await view.tool('Text', '위로')
    view.push(RESTORED)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    fireEvent.click(reloadButton())
    await act(async () => {
      vi.advanceTimersByTime(3_000)
    })
    await act(async () => {})
    vi.useRealTimers()
    await waitFor(() => expect(view.getPage).toHaveBeenCalledTimes(3))
    await act(async () => {})
    const restoreLoss = '복원된 상태로 페이지를 다시 불러왔습니다. 아직 저장되지 않은 편집 1개가 취소됐습니다.'
    // 판 카나리아 — 복원 다시 읽기가 판을 정하고 제 잃음을 말했다.
    expect(alertText()).toBe(restoreLoss)

    await act(async () => {
      view.held[0]!.resolve(pageDetail(PAGE_ID, pair()))
    })
    await act(async () => {})

    // 수습의 옛 답은 싣지 않았다(세대) — 화면은 복원 다시 읽기의 판이다.
    expect(structureTypes()).toEqual(['Page', 'Divider', 'Text'])
    expect(alertText()).toBe(`${restoreLoss} 페이지가 이미 변경되었습니다 — 페이지를 서버 상태로 다시 불러왔고, 편집 1개가 취소됐습니다.`)
  })

  it('떠남 통지 뒤에 재연결 재조회가 «이력 초기화»를 말해도 떠남을 남긴다 (P3)', async () => {
    const revision: RevisionSummary = {
      id: 'rev-b',
      seq: HEAD_SEQ,
      actorType: 'user',
      actorId: 'u1',
      actorLabel: '나',
      ops: [],
      inverse: [{ op: 'replace', path: '/root/type', value: 'Page' }],
      createdAt: '2026-09-25T00:00:00.000Z',
    }
    // 2쪽에는 되돌릴 내 revision 이 있다 — 재연결 재조회가 판을 다시 실으면 «이력 초기화»를 말한다.
    const listMyRevisions: ApiClient['listMyRevisions'] = async (_projectId, pageId) => (pageId === OTHER_PAGE_ID ? [revision] : [])
    let otherCalls = 0
    const view = await mount({
      api: { listMyRevisions },
      immediate: (pageId) => {
        if (pageId !== OTHER_PAGE_ID) return undefined
        otherCalls += 1
        // 2쪽을 여는 조회는 그대로, 재연결 재조회는 밥이 고친 판이다.
        return otherCalls === 1 ? pageDetail(pageId, pair()) : { ...pageDetail(pageId, withButton()), headSeq: HEAD_SEQ + 1 }
      },
    })
    // 1쪽에서 편집 둘 — 하나는 나갔고 하나는 줄 섰다.
    await view.moveDown()
    await view.tool('Text', '위로')
    fireEvent.click(screen.getByRole('link', { name: OTHER_PAGE_TITLE }))
    await waitFor(() => expect(structureTypes()).toEqual(['Page', 'Text', 'Divider']))
    // 소켓이 닫혀 1쪽의 나간 편집이 답을 못 받는다 — 떠남 통지가 «모름»을 합쳐 말한다.
    view.closeOnly()
    await act(async () => {})
    await act(async () => {})
    const leaveLoss =
      '떠난 페이지에서 보낸 편집 1개는 답을 받지 못해 서버에 반영됐는지 알 수 없고, 보내지 않은 편집 1개는 저장되지 않았습니다 — 그 페이지를 다시 열어 확인하세요.'
    // 판 카나리아 — 떠남 통지가 섰다.
    expect(alertText()).toBe(leaveLoss)

    view.reopen()
    await waitFor(() => expect(view.getPage).toHaveBeenCalledTimes(3))
    await act(async () => {})
    await act(async () => {})

    // 판 카나리아 — 재연결 재조회가 2쪽 판을 다시 실었다.
    expect(structureTypes()).toEqual(['Page', 'Text', 'Divider', 'Button'])
    expect(alertText()).toBe(`${leaveLoss} 연결이 다시 붙어 페이지를 서버 상태로 다시 불러왔습니다. 되돌리기 이력이 초기화됐습니다.`)
    // 떠남의 조각이 남았으니 닫는 단추도 남는다.
    expect(closeButtons()).toBe(1)
  })

  it('리베이스 버림 뒤에 앞 페이지의 늦은 거절이 와도 버림을 남긴다 (P4)', async () => {
    const view = await mount({ immediate: (pageId) => (pageId === OTHER_PAGE_ID ? pageDetail(pageId, pair()) : undefined) })
    const first = await view.moveDown()
    fireEvent.click(screen.getByRole('link', { name: OTHER_PAGE_TITLE }))
    await waitFor(() => expect(structureTypes()).toEqual(['Page', 'Text', 'Divider']))
    // 2쪽 편집은 1쪽 편집의 답 뒤에 줄 선다(in-flight 는 하나).
    await view.moveDown()
    expect(view.patches().map((patch) => patch.pageId)).toEqual([PAGE_ID])
    view.push(BOB_REMOVES_FIRST(HEAD_SEQ + 1, OTHER_PAGE_ID))
    await act(async () => {})
    // 판 카나리아 — 리베이스가 2쪽의 안 보낸 편집을 버리고 말했다.
    expect(alertText()).toBe(DROPPED_ONE)

    view.refuse(first)
    await act(async () => {})
    await act(async () => {})

    expect(alertText()).toBe(
      `${DROPPED_ONE} 페이지가 이미 변경되었습니다 — 떠난 페이지에서 보낸 편집 1개가 저장되지 않았습니다. 그 페이지를 다시 열어 확인하세요.`,
    )
    expect(closeButtons()).toBe(1)
  })
})

describe('합친 통지 — 같은 틀은 수를 더하고, 참이 아니게 되면 풀린다', () => {
  /** 2쪽에서 안 보낸 편집이 리베이스에 버려지고 1쪽의 늦은 거절이 이어 붙은 판(P4)을 세운다. */
  async function mergedAfterLeave() {
    const view = await mount({ immediate: () => pageDetail(OTHER_PAGE_ID, pair()) })
    const first = await view.moveDown()
    fireEvent.click(screen.getByRole('link', { name: OTHER_PAGE_TITLE }))
    await waitFor(() => expect(structureTypes()).toEqual(['Page', 'Text', 'Divider']))
    await view.moveDown()
    view.push(BOB_REMOVES_FIRST(HEAD_SEQ + 1, OTHER_PAGE_ID))
    await act(async () => {})
    view.refuse(first)
    await act(async () => {})
    await act(async () => {})
    expect(alertText()).toContain(DROPPED_ONE)
    expect(alertText()).toContain('떠난 페이지에서 보낸 편집 1개가 저장되지 않았습니다.')
    return view
  }

  it('리베이스가 거듭 버리면 한 문장으로 수를 더한다 — 늘어놓지 않는다', async () => {
    const view = await mount({ doc: triple })
    // 나간 편집(Button)이 답을 기다리는 동안 Text · Divider 를 옮기는 편집 둘이 줄 선다.
    await view.tool('Button', '위로')
    await view.tool('Text', '아래로')
    await view.tool('Divider', '위로')
    expect(view.patches()).toHaveLength(1)
    // 밥이 Text 를 지운다 → Text 편집을 버린다. 이어 Divider 를 지운다 → Divider 편집을 버린다.
    view.push(BOB_REMOVES_FIRST(HEAD_SEQ + 1, PAGE_ID))
    await act(async () => {})
    // 판 카나리아 — 첫 버림이 말했다.
    expect(alertText()).toBe(DROPPED_ONE)
    view.push(BOB_REMOVES_FIRST(HEAD_SEQ + 2, PAGE_ID))
    await act(async () => {})

    // 판 카나리아 — 둘째 버림도 났다(Divider 가 사라지고 Button 만 남았다).
    expect(structureTypes()).toEqual(['Page', 'Button'])
    expect(alertText()).toBe('다른 사람의 변경과 겹쳐 아직 저장되지 않은 편집 2개를 버렸습니다.')
  })

  /**
   * **수습 조각의 열쇠는 거절의 `code`와 문장의 머리다**(`edit/use-edit-commit.tsx`의 `refusedLoss`) — 열쇠가 하나면 서로 다른 두 거절이 합쳐져 뒤 까닭으로
   * 읽힌다(«밥님이 편집 중인 노드입니다 — … 편집 2개» — 앞 편집은 잠금이 아니라 판이 바뀌어 취소됐다). 판: 첫 거절의 수습을 붙잡은 사이 복원
   * 다시 읽기가 새 판을 싣고, 그 판에서 낸 편집이 수습 뒤에 나가 다른 까닭으로 거절된다(`twoRefusals`).
   */
  it('서로 다른 까닭의 두 거절은 까닭마다 말한다 — 뒤 까닭으로 합치지 않는다', async () => {
    const text = await twoRefusals({ status: 409, code: 'locked', message: '밥님이 편집 중인 노드입니다' })

    expect(text).toBe(
      '페이지가 이미 변경되었습니다 — 페이지를 서버 상태로 다시 불러왔고, 편집 1개가 취소됐습니다. ' +
        '밥님이 편집 중인 노드입니다 — 페이지를 서버 상태로 다시 불러왔고, 편집 1개가 취소됐습니다.',
    )
  })

  /**
   * **같은 까닭은 서버 문장이 달라도 한 조각이다** — 409 의 번호는 문장에만 있어, 문장 전체를 열쇠에 넣으면 거절마다 조각이 는다(머리만 넣는다 —
   * `refusal-head.test.ts`). 문장은 뒤의 것이다.
   */
  it('같은 까닭의 두 거절은 문장이 달라도 한 문장으로 수를 더한다 — 늘어놓지 않는다', async () => {
    const text = await twoRefusals({ status: 409, code: 'conflict', message: '페이지가 이미 변경되었습니다 (요청 baseSeq 9, 현재 10)' })

    expect(text).toBe(
      '페이지가 이미 변경되었습니다 (요청 baseSeq 9, 현재 10) — 페이지를 서버 상태로 다시 불러왔고, 편집 2개가 취소됐습니다.',
    )
  })

  /**
   * **같은 `code` 안의 두 까닭은 까닭마다 말한다** — 서버는 `stale` · `patch-failed` 를 둘 다 `409 conflict` 로 낸다(`http/edit-outcome.ts` —
   * 클라이언트의 대응이 같아서다). 열쇠가 `code` 하나면 앞 편집의 까닭(판이 바뀜)이 뒤 까닭에 합쳐져 사라진다(«편집을 적용할 수 없습니다: … —
   * 편집 2개»). 둘째 문장은 서버가 실제로 내는 꼴이다.
   */
  it('같은 code 의 서로 다른 까닭(판이 바뀜 · 적용할 수 없음)은 까닭마다 말한다', async () => {
    const text = await twoRefusals({
      status: 409,
      code: 'conflict',
      message: '편집을 적용할 수 없습니다: 바꿀 값을 찾을 수 없습니다: /root/children/9',
    })

    expect(text).toBe(
      '페이지가 이미 변경되었습니다 — 페이지를 서버 상태로 다시 불러왔고, 편집 1개가 취소됐습니다. ' +
        '편집을 적용할 수 없습니다: 바꿀 값을 찾을 수 없습니다: /root/children/9 — 페이지를 서버 상태로 다시 불러왔고, 편집 1개가 취소됐습니다.',
    )
  })

  it('새 편집을 내면 합친 통지 전부를 치운다 — 남겨 두면 방금 낸 편집도 실패한 것으로 읽힌다', async () => {
    const view = await mergedAfterLeave()

    await view.tool('Divider', '삭제')

    // 판 카나리아 — 새 편집이 나갔다(앞 편집의 거절 뒤라 곧바로 나간다).
    expect(structureTypes()).toEqual(['Page'])
    expect(alertText()).toBe('')
  })

  it('닫기는 합친 통지 전부를 닫는다', async () => {
    await mergedAfterLeave()

    fireEvent.click(screen.getByRole('button', { name: '통지 닫기' }))

    expect(alertText()).toBe('')
  })

  it('떠남의 조각은 가리키는 페이지를 다시 열면 풀리고, 판을 비우는 자리는 떠남의 조각만 남긴다', async () => {
    await mergedAfterLeave()

    // 2쪽을 떠나 1쪽을 다시 연다 — 2쪽의 버림 조각은 판을 비우며 지워지고, 1쪽을 다시 열면 떠남 조각이 풀린다.
    fireEvent.click(screen.getByRole('link', { name: '회원 목록' }))
    await act(async () => {})
    await act(async () => {})

    expect(alertText()).toBe('')
  })
})
