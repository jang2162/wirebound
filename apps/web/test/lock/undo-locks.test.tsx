/**
 * **되돌리기가 남의 잠금을 지나는가**(설계서 「소프트 잠금」의 1차 방어 · 「에러 처리」의
 * *"발생 시 안내 — 자동 재시도하지 않는다"*).
 *
 * # 되돌리기는 구조 도구의 판정을 안 지난다
 *
 * 구조 도구 아홉과 고르개 넷은 `structureAbilities`의 잠금 판정으로 꺼진다. **되돌리기는 그
 * 판정을 안 지난다** — `startUndo`/`startRedo` → `#enqueue` → 펌프 경로는 스토어의
 * `lockedBy`를 한 번도 부르지 않는다. undo는 자기가 낸 편집을 되감는 것이라 결이 달라
 * 별도 판정이 필요하다.
 *
 * # 판정의 단위가 다르다 — 그래서 답도 다르다
 *
 * 툴바는 «고른 노드»가 단위라 서버(«편집이 건드리는 포인터»)보다 **엄격할 수밖에** 없고,
 * 그 대가를 받아들여 «전부 끈다»를 고른다(`edit/structure-actions.ts`의 표).
 * **되돌리기에는 선택이 없다.** 단위가 `inverse` **ops**이고 그것이 곧 서버가 재는 것이라,
 * 화면은 `findLockConflict`에 **서버와 같은 입력**을 넣을 수 있다 — **누를 때 서 있던 잠금에
 * 대해** 과차단도 과소차단도 0이다.
 *
 * 진짜 api·진짜 WS 잠금으로 잰 값이 아래다(`inverse`는 서버가 준 그대로 되보냈다).
 * 이 파일의 케이스가 **여섯 줄을 다 태운다**:
 *
 * | 되돌리는 것 | 나가는 포인터 | 서버 | 재는 케이스 |
 * |---|---|---|---|
 * | 내가 고친 노드를 남이 잠갔다 | `replace …/props/content` | **423** | `잠긴 노드의 속성 편집…` |
 * | 지운 노드를 되살리는 자리가 잠겼다 | `add /root/children/0` | **423** | `되살릴 자리가 잠겼으면…` |
 * | 되돌리기가 만드는 편집(redo) | `replace …/props/content` | **423** | `다시 실행도…` |
 * | 잠긴 서브트리 **밖**의 편집 | `replace …/props/content` | 통과 | `잠긴 서브트리 밖은…` |
 * | **형제 자리**(인덱스가 안 겹친다) | `add /root/children/0` | 통과 | `형제 자리는 막지 않는다…` |
 * | 내 잠금 · 다른 페이지의 잠금 | — | 통과 | 소유자·페이지 필터 케이스 둘 |
 *
 * **아랫줄 셋이 없으면 *"잠금이 있으면 무조건 막는다"*와 구별되지 않는다.**
 *
 * # 이 파일이 잠그는 것은 «누를 때 서 있던 잠금»까지다 — 그 밖은 재지 않는다
 *
 * 1차 방어는 **낙관적**이다. 아래 케이스는 전부 *"누르기 전에 잠금 프레임이 도착한"* 판이고,
 * **누름과 전송 사이에 오는 잠금은 화면이 못 막는다** — 화면이 잠금을 아는 것은 WS 프레임이
 * 도착한 뒤이기 때문이다. 그때는 요청이 나가고 **서버의 2차 방어**가 423으로 받으며, 바로 아래
 * «막지 않으면 무엇을 잃는가»가 **그대로 밟힌다** — 스택 2에서 누르면 `[200, 200, 423]` ·
 * **undo 0 · redo 0**이 된다.
 *
 * **그것은 화면 쪽 막기의 결함이 아니라 1차 방어의 성질이다.** 지우려면 423을 받은 `recover`가
 * *"이력 전부가 아니라 그 항목만 버린다"*로 바뀌어야 한다(설계서 「에러 처리」). 그래서 **이
 * 파일은 그 창을 재는 케이스를 두지 않는다** — 두면 화면 쪽 막기가 닫지 않는 것을 잠그게 된다.
 *
 * # 막지 않으면 무엇을 잃는가
 *
 * 423은 `edit/use-edit-commit.tsx`의 `recover`로 가고 그 재조회의 `loadPage`가 **undo·redo
 * 스택을 통째로 비운다.** 스택이 2일 때 눌러도 undo 0 · redo 0이 되고 되돌리기 버튼이
 * 비활성이 된다. 설계서 「에러 처리」가 undo 실패에 대해 적은 것(*"그 항목만 스택에서 버리고
 * 나머지는 그대로 쓴다"*)과 어긋나는 값이다. 그래서 아래 `막힌 항목은 스택에 남는다`가 이
 * 파일의 본론이다 — 막는 것 자체보다 **막힌 뒤에 되돌아올 수 있는가**가 요점이다.
 *
 * # 서버 대역이 진짜 판정을 든다
 *
 * `patchOps`가 `findLockConflict`를 **직접** 부른다 — `apps/api`의 `lock/check.ts`가 부르는
 * 그 함수다(`toolbar-abilities.test.tsx`와 같은 형태이고 같은 이유다). 손으로 적은 200/423
 * 으로 대신하면 *"화면이 막아서 안 나갔다"*와 *"서버가 받아서 통과했다"*가 같은 값으로 보인다.
 * 화면의 막기를 빼면 이 대역이 **실제로** 423을 낸다.
 *
 * **`onopen`을 부르지 않는다** — WS가 붙어 있으면 편집이 그리로 나가 `patchOps` 대역이
 * 아무것도 못 본다. 잠금 프레임은 `onmessage`로 그대로 들어온다.
 *
 * # 케이스마다 «혼자 죽는 변조»가 있다 — 재는 척만 하는 케이스를 안 만들려고 잰 것이다
 *
 * 왼쪽 열이 그 케이스만 죽이는 변조다.
 *
 * | 케이스 | 혼자 죽이는 변조 |
 * |---|---|
 * | 잠긴 노드의 속성 편집은 되돌려지지 않는다 | 막기 **전에** 낙관 적용을 붙인다 |
 * | 되살릴 자리가 잠겼으면 삭제도 안 된다 | `add` 포인터를 판정에서 뺀다 |
 * | 다시 실행도 같은 자리에서 막힌다 | `kind === 'undo'`일 때만 막는다 |
 * | 잠긴 서브트리 **밖**은 되돌려진다 | `replace`가 섞이면 페이지 통째로 본다 |
 * | 형제 자리는 막지 않는다 | 포인터를 한 단계 **올려** 본다(형제가 부모로 뭉개진다) |
 * | 내 잠금에는 안 막힌다 | `viewerUserId`를 `''`로 넘긴다 |
 * | 다른 페이지의 잠금은 안 막는다 | `pageId` 필터를 뺀다 |
 * | 막혀도 이력을 잃지 않는다 | 막을 때 그 항목을 한 번 더 쌓는다 |
 * | 잠금이 풀리면 그대로 되돌아간다 | `setLocks`가 빈 목록을 무시한다 |
 * | 이름과 함께 말한다 | 건너뜀이 0이어도 접두어를 붙인다 |
 * | 건너뛴 것도 함께 말한다 | 건너뛴 것을 스택에 남긴다 |
 *
 * **넓게 죽는 변조 넷이 그 위에 겹친다** — 판정을 통째로 빼면 일곱이, «페이지에 남의 잠금이
 * 하나라도 있으면 막는다»(채택하지 않은 갈래)로 바꾸면 **정확히 «안 막는다» 둘이** 죽는다.
 * 뒤엣것이 *"그 갈래는 서버가 200을 낼 것까지 막는다"*의 실증이다.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { findLockConflict, lockPointers, type PageDocument, type PatchOp } from '@wirebound/schema'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type ApiClient } from '../../src/api/client'
import type { PageDetail, PatchResult } from '../../src/api/types'
import type { RealtimeSocket } from '../../src/realtime/connection'
import { createConnectionIdHolder, type RealtimeSetup } from '../../src/realtime/context'
import { createEditChannel } from '../../src/realtime/edit-channel'
import { createLockChannel } from '../../src/realtime/lock-channel'
import type { NodeLockView, ServerFrame } from '../../src/realtime/protocol'
import type { EditorStore } from '../../src/store/editor-store'
import {
  HEAD_SEQ,
  OTHER_PAGE_ID,
  OTHER_PAGE_TITLE,
  PAGE_ID,
  PROJECT_ID,
  openPage,
  pageDetail,
  pageDoc,
} from '../editor-harness'
import '../../src/catalog-setup'

const { createdStores } = vi.hoisted(() => ({ createdStores: [] as unknown[] }))

vi.mock('../../src/store/editor-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/store/editor-store')>()
  return {
    ...actual,
    EditorStore: class extends actual.EditorStore {
      constructor() {
        super()
        createdStores.push(this)
      }
    },
  }
})

beforeEach(() => {
  createdStores.length = 0
})

function shellStore(): EditorStore {
  const store = createdStores.at(-1)
  if (store === undefined) throw new Error('셸이 EditorStore를 만들지 않았습니다')
  return store as EditorStore
}

/** 하네스의 사용자 id. `editor-harness.tsx`의 `USER`와 같은 값이다. */
const ME = 'u-1'

/** 처음 값. 되돌리기가 여기로 돌아오는 것이 «되돌아갔다»의 뜻이다. */
const OLD_TEXT = '옛 내용'

class FakeSocket implements RealtimeSocket {
  onopen: (() => void) | null = null

  onmessage: ((event: { data: unknown }) => void) | null = null

  onclose: (() => void) | null = null

  onerror: (() => void) | null = null

  send(): void {}

  close(): void {
    this.onclose?.()
  }
}

/**
 * ```
 * n-root (Page)
 *   n-a   (Text)      ← 속성을 고치는 노드. 인덱스 0
 *   n-box (Card)      ← 인덱스 1
 *   n-c   (Divider)   ← 인덱스 2
 * ```
 * **타입이 전부 다르다** — 트리 줄의 이름이 타입이라 그래야 노드를 이름으로 고른다.
 *
 * **형제가 셋인 것이 요점이다.** `n-a`를 지우면 `n-box`가 인덱스 0으로 **앞당겨 오고**,
 * 되살리는 `add /root/children/0`이 그 자리를 가리킨다 — 잠금을 `n-box`에 두느냐 `n-c`에
 * 두느냐가 서버 판정을 가른다. 둘이면 그 갈림이 안 생긴다.
 */
function doc(): PageDocument {
  return pageDoc({
    id: 'n-root',
    type: 'Page',
    children: [
      { id: 'n-a', type: 'Text', props: { content: OLD_TEXT, role: 'body' } },
      { id: 'n-box', type: 'Card', children: [{ id: 'n-1', type: 'Button', props: {} }] },
      { id: 'n-c', type: 'Divider', props: {} },
    ],
  })
}

interface Board {
  store: EditorStore
  /** 서버가 보낸 것처럼 잠금 목록을 밀어 넣는다. */
  lock: (locks: NodeLockView[]) => void
  /** 지금까지 서버가 **받은** 편집. 화면이 막았으면 늘지 않는다. */
  calls: { ops: PatchOp[] }[]
  /** 서버가 낸 상태 코드들. 화면의 막기를 빼면 여기 `423`이 선다. */
  status: number[]
}

async function board(): Promise<Board> {
  const sockets: FakeSocket[] = []
  const calls: { ops: PatchOp[] }[] = []
  const status: number[] = []
  let live: NodeLockView[] = []
  let seq = HEAD_SEQ
  let held = doc()

  const patchOps: ApiClient['patchOps'] = async (_projectId, _pageId, body) => {
    calls.push({ ops: body.ops })
    // **서버의 2차 방어를 그대로 돈다**(`apps/api/src/lock/check.ts`와 같은 인자).
    const conflict = findLockConflict({
      root: held.root,
      locks: live.filter((entry) => entry.pageId === PAGE_ID),
      pointers: lockPointers(body.ops),
      viewerUserId: ME,
    })
    if (conflict !== null) {
      status.push(423)
      throw new ApiError(423, 'locked', `${conflict.userName}님이 편집 중인 영역입니다`)
    }
    status.push(200)
    const { applyOps, invertOps } = await import('@wirebound/schema')
    const inverse = invertOps(held, body.ops)
    held = applyOps(held, body.ops)
    seq += 1
    const result: PatchResult = {
      seq,
      revisionId: `rev-${seq}`,
      inverse,
      schemaVersion: 1,
      ...(body.clientOpId === undefined ? {} : { clientOpId: body.clientOpId }),
    }
    return result
  }

  const getPage: ApiClient['getPage'] = async (_projectId, pageId) => {
    const detail: PageDetail = { ...pageDetail(pageId, held), headSeq: seq }
    return detail
  }

  const setup: RealtimeSetup = {
    holder: createConnectionIdHolder(),
    channel: createEditChannel(),
    lockChannel: createLockChannel(),
    origin: 'http://localhost:5173',
    connection: {
      createSocket: () => {
        const socket = new FakeSocket()
        sockets.push(socket)
        return socket
      },
      schedule: () => 1,
      cancel: () => {},
    },
  }

  await openPage(doc(), { realtime: setup, apiOverrides: { patchOps, getPage } })

  return {
    store: shellStore(),
    lock: (locks) => {
      live = locks
      const frame: ServerFrame = { type: 'locks', projectId: PROJECT_ID, locks }
      act(() => {
        sockets.at(-1)?.onmessage?.({ data: JSON.stringify(frame) })
      })
    },
    calls,
    status,
  }
}

function foreign(nodeId: string, over: Partial<NodeLockView> = {}): NodeLockView {
  return { pageId: PAGE_ID, nodeId, userId: 'u-bora', userName: '보라', ...over }
}

function structureRegion(): HTMLElement {
  return screen.getByRole('region', { name: '구조 트리' })
}

/** 트리에서 노드 하나를 고른다. 줄 이름이 타입이다. */
function select(type: string): void {
  fireEvent.click(within(structureRegion()).getByRole('button', { name: type }))
}

function history(): HTMLElement {
  return screen.getByRole('group', { name: '편집 이력' })
}

function undoButton(): HTMLButtonElement {
  return within(history()).getByRole<HTMLButtonElement>('button', { name: '되돌리기' })
}

function redoButton(): HTMLButtonElement {
  return within(history()).getByRole<HTMLButtonElement>('button', { name: '다시 실행' })
}

function panel(): HTMLElement {
  return screen.getByRole('complementary', { name: '우측 패널' })
}

/** 텍스트 컨트롤에 값을 넣고 blur로 커밋한다. */
function typeAndCommit(value: string): void {
  const input = within(panel()).getByLabelText<HTMLElement>('내용')
  fireEvent.change(input, { target: { value } })
  fireEvent.blur(input)
}

function toolButton(name: string): HTMLButtonElement {
  return within(within(structureRegion()).getByRole('group', { name: '구조 편집' })).getByRole<HTMLButtonElement>(
    'button',
    { name },
  )
}

function alertText(): string | null {
  return document.body.querySelector('.wb-shell-edit-alert')?.textContent ?? null
}

function canvasTextOf(nodeId: string): string {
  const node = document.body.querySelector(`[data-wb-id="${nodeId}"]`)
  if (node === null) throw new Error(`캔버스에 노드가 없다: ${nodeId}`)
  return node.textContent ?? ''
}

function stacks(view: Board): { undo: number; redo: number } {
  const state = view.store.getState()
  return { undo: state.undoStack.length, redo: state.redoStack.length }
}

/** 낙관적 적용·전송·재조회가 다 흐르도록 흘린다. */
async function settle(): Promise<void> {
  await act(async () => {})
  await act(async () => {})
  await act(async () => {})
}

/**
 * 속성 편집 하나를 내고 ack까지 받는다. **되돌릴 것을 만드는 자리**이므로 잠금은 이 뒤에
 * 온다 — `setLocks`가 선택을 안 건드리는 그 창이 되돌리기가 잠금을 지나야 하는 자리이기도 하다.
 */
async function editText(view: Board, value: string): Promise<void> {
  const before = view.calls.length
  select('Text')
  typeAndCommit(value)
  await waitFor(() => expect(view.calls).toHaveLength(before + 1))
  await waitFor(() => expect(undoButton().disabled).toBe(false))
}

/** `n-a`를 지운다. `inverse`는 `add /root/children/0`이고 그 자리에 `n-box`가 앞당겨 온다. */
async function removeText(view: Board): Promise<void> {
  select('Text')
  fireEvent.click(toolButton('삭제'))
  await waitFor(() => expect(view.calls).toHaveLength(1))
  await waitFor(() => expect(undoButton().disabled).toBe(false))
}

describe('막는다 — 서버가 423을 낼 되돌리기는 나가지 않는다', () => {
  it('잠긴 노드의 속성 편집은 되돌려지지 않는다', async () => {
    const view = await board()
    await editText(view, '새 내용')

    view.lock([foreign('n-a')])
    fireEvent.click(undoButton())
    await settle()

    // **요청이 늘지 않았다.** 늘었으면 대역이 423을 냈을 것이고 `status`가 그것을 말한다.
    expect(view.calls).toHaveLength(1)
    expect(view.status).toEqual([200])
    // 낙관적 적용도 안 붙었다 — 화면은 편집한 값 그대로다.
    expect(canvasTextOf('n-a')).toBe('새 내용')
  })

  it('되살릴 자리가 잠겼으면 삭제도 되돌려지지 않는다 — 앞당겨 온 형제가 그 자리다', async () => {
    const view = await board()
    await removeText(view)

    // `n-a`가 사라져 `n-box`가 인덱스 0이다. `add /root/children/0`이 그 자리를 가리킨다.
    view.lock([foreign('n-box')])
    fireEvent.click(undoButton())
    await settle()

    expect(view.calls).toHaveLength(1)
    expect(view.status).toEqual([200])
  })

  it('다시 실행도 같은 자리에서 막힌다 — redo는 undo가 만든 편집이다', async () => {
    const view = await board()
    await editText(view, '새 내용')

    fireEvent.click(undoButton())
    await settle()
    await waitFor(() => expect(redoButton().disabled).toBe(false))
    expect(view.calls).toHaveLength(2)

    view.lock([foreign('n-a')])
    fireEvent.click(redoButton())
    await settle()

    expect(view.calls).toHaveLength(2)
    expect(view.status).toEqual([200, 200])
  })
})

describe('안 막는다 — 서버가 통과시킬 것은 그대로 나간다', () => {
  it('잠긴 서브트리 **밖**의 편집은 되돌려진다', async () => {
    const view = await board()
    await editText(view, '새 내용')

    // 잠긴 것은 `n-box`이고 되돌리기가 건드리는 것은 `n-a`다.
    view.lock([foreign('n-box')])
    fireEvent.click(undoButton())
    await settle()

    expect(view.calls).toHaveLength(2)
    expect(view.status).toEqual([200, 200])
    await waitFor(() => expect(canvasTextOf('n-a')).toBe(OLD_TEXT))
  })

  it('형제 자리는 막지 않는다 — 인덱스가 안 겹치면 서버도 받는다', async () => {
    const view = await board()
    await removeText(view)

    // 잠근 것은 `n-c`(지금 인덱스 1)이고 되살리는 자리는 `/root/children/0`이다.
    // **바로 위 케이스와 잠금 하나만 다르다** — 그 하나가 서버 판정을 가른다.
    view.lock([foreign('n-c')])
    fireEvent.click(undoButton())
    await settle()

    expect(view.calls).toHaveLength(2)
    expect(view.status).toEqual([200, 200])
  })

  it('내 잠금에는 안 막힌다 — 소유자는 사람이다', async () => {
    const view = await board()
    await editText(view, '새 내용')

    // 같은 사람의 **다른 탭**이 잡은 것이다.
    view.lock([foreign('n-a', { userId: ME, userName: '나' })])
    fireEvent.click(undoButton())
    await settle()

    expect(view.calls).toHaveLength(2)
    expect(view.status).toEqual([200, 200])
  })

  it('**다른 페이지**의 잠금은 이 페이지의 되돌리기를 안 막는다 — 노드 id는 페이지를 넘어 겹친다', async () => {
    const view = await board()
    await editText(view, '새 내용')

    view.lock([foreign('n-a', { pageId: OTHER_PAGE_ID })])
    fireEvent.click(undoButton())
    await settle()

    expect(view.calls).toHaveLength(2)
    expect(view.status).toEqual([200, 200])
  })
})

describe('막힌 항목은 스택에 남는다 — 설계서 「에러 처리」의 *"발생 시 안내 — 자동 재시도하지 않는다"*', () => {
  it('막혀도 이력을 잃지 않는다 — 스택도 버튼도 그대로다', async () => {
    const view = await board()
    await editText(view, '첫째')
    await editText(view, '둘째')
    await waitFor(() => expect(stacks(view).undo).toBe(2))

    view.lock([foreign('n-a')])
    fireEvent.click(undoButton())
    await settle()

    // **화면이 막지 않으면 여기가 `{ undo: 0, redo: 0 }`이 된다** — 423이 재조회를 태우고
    // `loadPage`가 두 스택을 비운다(파일 머리말 «막지 않으면 무엇을 잃는가»).
    expect(stacks(view)).toEqual({ undo: 2, redo: 0 })
    expect(undoButton().disabled).toBe(false)
  })

  /**
   * **막다른 길 확인이 이 케이스 안에 있다.** 구조 도구 쪽은 그것을 별도 케이스로 두지만
   * (`toolbar-abilities.test.tsx`) 여기서 그렇게 두면 **어느 변조에서도 혼자 죽지 않는다**
   * — 되돌리기의 막기는 셸을 건드리지 않으므로 그 단언을 혼자 세우면 아무것도 안 잠근다
   * («재는 척하는 케이스»가 정확히 그 모양이다). 그래서 **죽는 케이스에 얹는다:** 되돌리기의
   * 진짜 막다른 길은 *"그 항목에 영영 못 닿는다"*이고, 그것을 재는 것이 아래 두 번째 누름이다.
   *
   * **얹은 뒤에도 그 축의 주인은 여기가 아니다.** 주인의 **정확한 이름은 아래 그 단언
   * 옆에** 적혀 있다 — 이름을 여기 한 벌 더 두면 그 이름이 갈린다.
   *
   * **변조 «몇 건»을 적지 않는 것은 일부러다.** 그 수는 다음 사람이 다시 잴 수 없고, 같은
   * 수를 두 자리가 적으면 갈린다 — 이 docstring이 답하는 것은 *"이 단언이 무엇을 잠그나"*다.
   */
  it('잠금이 풀리면 그대로 되돌아간다 — 막다른 길이 아니다', async () => {
    const view = await board()
    await editText(view, '새 내용')

    view.lock([foreign('n-a')])
    fireEvent.click(undoButton())
    await settle()
    expect(view.calls).toHaveLength(1)

    // 막힌 동안에도 셸은 산다 — 모드 전환 둘과 다른 페이지 링크가 그대로다.
    //
    // **이 축을 소유하는 것은 여기가 아니다 — 고유 구분력으로 착각하지 마라.** 아래 두 줄은
    // 되돌리기의 막기를 겨눈 어떤 변조에도 **혼자 죽지 않는다**(그 막기가 셸을 안 건드린다).
    // 죽을 때는 늘 다른 케이스들과 함께 죽고, 그중
    // `test/lock/toolbar-abilities.test.tsx`의 `막다른 길이 아니다 — 구조 편집만 얼고 셸은
    // 산다 > 그래도 뷰 모드와 다른 페이지는 남는다 — 이유는 상태줄이 이름과 함께 말한다`가
    // **같은 값을 잰다.** 그 케이스가 축의 주인이고 여기 남긴 것은 중복이다.
    //
    // **그래도 지우지 않는 것은 «재는 척하는 케이스»와 다르기 때문이다** — 그쪽은
    // 아무 변조에서도 안 죽지만 이것은 죽고, 무엇보다 이 케이스는 그 단언 없이도 자기 힘으로
    // 죽는다(아래 두 번째 누름이 본론이다). 여기 있는 값은 *"**막힌 동안에도** 그렇다"*를 이
    // 판에서 함께 보는 것뿐이다.
    const modes = within(screen.getByRole('group', { name: '모드' })).getAllByRole<HTMLButtonElement>('button')
    expect(modes.map((button) => button.disabled)).toEqual([false, false])
    expect(screen.getByRole('link', { name: OTHER_PAGE_TITLE })).toBeTruthy()

    view.lock([])
    fireEvent.click(undoButton())
    await settle()

    expect(view.calls).toHaveLength(2)
    expect(view.status).toEqual([200, 200])
    await waitFor(() => expect(canvasTextOf('n-a')).toBe(OLD_TEXT))
  })
})

describe('왜 안 되는지 말한다', () => {
  it('이름과 함께, 그리고 되돌아올 수 있다는 것까지 말한다', async () => {
    const view = await board()
    await editText(view, '새 내용')

    view.lock([foreign('n-a')])
    fireEvent.click(undoButton())
    await settle()

    // **뒷문장이 없으면 사용자는 이력이 사라진 줄 안다.**
    expect(alertText()).toBe('보라님이 편집 중이라 되돌릴 수 없습니다. 잠금이 풀리면 그대로 되돌릴 수 있습니다.')
  })

  it('건너뛴 것이 함께 있으면 둘 다 말한다 — 한쪽만 말하면 나머지가 조용히 사라진다', async () => {
    const view = await board()
    await editText(view, '새 내용')

    // **스택 맨 위에 «적용 불가»를 하나 얹는다.** 남이 지운 노드를 되돌리는 판이고(설계서 「개인 undo/redo」),
    // 그 아래에 잠금에 막히는 항목이 있다.
    act(() => {
      view.store.restoreUndoStack([
        { revisionId: 'rev-gone', inverse: [{ op: 'replace', path: '/root/children/9/props/content', value: 'x' }] },
        ...view.store.getState().undoStack.slice().reverse(),
      ])
    })
    view.lock([foreign('n-a')])
    fireEvent.click(undoButton())
    await settle()

    expect(alertText()).toBe(
      '되돌릴 수 없는 편집 1개를 건너뛰었습니다. 그 앞의 편집은 보라님이 편집 중이라 되돌릴 수 없습니다. 잠금이 풀리면 그대로 되돌릴 수 있습니다.',
    )
    // **건너뛴 것은 버리고 막힌 것은 남긴다.** 둘이 같은 값이면 이 줄이 죽는다.
    expect(stacks(view).undo).toBe(1)
  })
})
