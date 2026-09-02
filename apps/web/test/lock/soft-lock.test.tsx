/**
 * **소프트 잠금이 화면에 서는 자리**(설계 §7.2 · P3-3 T5).
 *
 * > 잠긴 노드는 다른 사용자 화면에 *"○○ 편집 중"* 배지가 뜨고 **선택이 차단된다(1차 방어)**.
 *
 * # 셸째로 띄운다
 *
 * 배지와 차단이 서려면 셋이 함께 있어야 한다 — 서버가 보낸 `locks` 프레임, 열린 페이지의
 * 문서, 그리고 *"내가 누구인가"*(D3 — 자기 잠금에는 안 막힌다). 스토어를 직접 쥐면 그
 * 배선이 빠진 채 단언이 통과한다.
 *
 * # 하나짜리로 재지 않는다
 *
 * | 무엇을 여럿으로 두나 | 그것이 없으면 무엇이 안 죽나 |
 * |---|---|
 * | 노드 여럿 | 잠긴 노드를 안 가르고 **전부** 막아도 안 죽는다 |
 * | 사용자 둘 | 이름을 안 실어도 안 죽는다 |
 * | **같은 사용자의 다른 탭** | 소유자를 연결로 봐도 안 죽는다(D3) |
 * | 페이지 둘 | 잠금 프레임의 `pageId`를 무시해도 안 죽는다 |
 */
import { act, fireEvent, screen, within } from '@testing-library/react'
import type { PageDocument } from '@wirebound/schema'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RealtimeSocket } from '../../src/realtime/connection'
import { createConnectionIdHolder, type RealtimeSetup } from '../../src/realtime/context'
import { createEditChannel } from '../../src/realtime/edit-channel'
import { createLockChannel } from '../../src/realtime/lock-channel'
import type { NodeLockView, ServerFrame } from '../../src/realtime/protocol'
import type { EditorStore } from '../../src/store/editor-store'
import {
  OTHER_PAGE_ID,
  OTHER_PAGE_TITLE,
  PAGE_ID,
  PROJECT_ID,
  deselect,
  openPage,
  pageDoc,
  waitForNode,
} from '../editor-harness'

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

/** 하네스의 사용자 id. `editor-harness.tsx`의 `USER`와 같은 값이다. */
const ME = 'u-1'

/**
 * ```
 * n-root
 *   n-a
 *   n-b      n-b1
 * ```
 * 노드 넷이다 — 하나짜리면 *"전부 막는다"*와 구분되지 않는다.
 */
function doc(): PageDocument {
  return pageDoc({
    id: 'n-root',
    type: 'Page',
    children: [
      { id: 'n-a', type: 'Text', props: {} },
      { id: 'n-b', type: 'Section', children: [{ id: 'n-b1', type: 'Text', props: {} }] },
    ],
  })
}

interface Board {
  store: EditorStore
  /** 서버가 보낸 것처럼 프레임을 밀어 넣는다. */
  push: (frame: ServerFrame) => void
  /** 끊는다. 재연결 예약은 그대로 둔다. */
  disconnect: () => void
  /** 끊고 다시 붙는다 — 예약된 재연결을 손으로 돌린다(진짜 타이머를 남기지 않는다). */
  reconnect: () => void
  /** 지금까지 **모든 소켓으로** 나간 잠금 프레임(`ping`은 뺀다). */
  lockFrames: () => Array<{ type: string; pageId?: string; nodeId?: string }>
}

async function board(): Promise<Board> {
  const sockets: FakeSocket[] = []
  const scheduled: (() => void)[] = []
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
      schedule: (run) => {
        scheduled.push(run)
        return scheduled.length
      },
      cancel: () => {},
    },
  }

  await openPage(doc(), { realtime: setup, docs: { [OTHER_PAGE_ID]: doc() } })
  const live = (): FakeSocket => {
    const socket = sockets.at(-1)
    if (socket === undefined) throw new Error('소켓이 만들어지지 않았습니다')
    return socket
  }
  act(() => {
    live().onopen?.()
  })

  return {
    store: shellStore(),
    push: (frame) => {
      act(() => {
        live().onmessage?.({ data: JSON.stringify(frame) })
      })
    },
    disconnect: () => {
      act(() => {
        live().onclose?.()
      })
    },
    reconnect: () => {
      act(() => {
        live().onclose?.()
      })
      // 재연결 예약을 손으로 돌려 다음 소켓을 만든다.
      act(() => {
        scheduled.pop()?.()
      })
      act(() => {
        live().onopen?.()
      })
    },
    lockFrames: () =>
      sockets
        .flatMap((socket) => socket.sent)
        .map((raw) => JSON.parse(raw) as { type: string })
        .filter((frame) => frame.type === 'lock' || frame.type === 'unlock'),
  }
}

function locksFrame(locks: NodeLockView[]): ServerFrame {
  return { type: 'locks', projectId: PROJECT_ID, locks }
}

function foreign(nodeId: string, over: Partial<NodeLockView> = {}): NodeLockView {
  return { pageId: PAGE_ID, nodeId, userId: 'u-bora', userName: '보라', ...over }
}

/**
 * 노드 줄이 들어 있는 목록. **region이 아니라 이것으로 좁힌다** — 툴바 버튼이 같은 region에
 * 살고(P2b-3 D4), 캔버스에도 같은 이름의 요소가 있을 수 있다.
 */
function structureList(): HTMLElement {
  const list = screen.getByRole('region', { name: '구조 트리' }).querySelector<HTMLElement>('.wb-shell-structure')
  if (list === null) throw new Error('구조 트리 목록이 없습니다')
  return list
}

/** 구조 트리의 그 노드 줄(버튼). 이름은 노드 타입이다(`panels/node-shape.ts`). */
function treeButton(typeLabel: string): HTMLElement {
  return within(structureList()).getByRole('button', { name: typeLabel })
}

/** 같은 타입이 여럿일 때 그중 하나. 순서는 화면에 그려진 순서 그대로다. */
function treeButtonAt(typeLabel: string, index: number): HTMLElement {
  const found = within(structureList()).getAllByRole('button', { name: typeLabel })[index]
  if (found === undefined) throw new Error(`${typeLabel} 줄이 ${index}번째에 없습니다`)
  return found
}

describe('배지 — *"○○ 편집 중"*', () => {
  it('남이 잠근 노드에 이름이 뜬다', async () => {
    const view = await board()

    view.push(locksFrame([foreign('n-b')]))

    expect(screen.getByText('보라 편집 중')).toBeTruthy()
  })

  it('잠기지 않은 노드에는 안 뜬다 — 하나면 *"전부 막는다"*와 구분되지 않는다', async () => {
    const view = await board()

    view.push(locksFrame([foreign('n-b')]))

    // 배지는 하나다. 노드 넷 중 잠긴 서브트리가 둘(`n-b`·`n-b1`)이지만 **잠금은 하나이므로
    // 그 서브트리의 뿌리에만 이름을 붙인다** — 자손마다 붙이면 트리가 이름으로 뒤덮인다.
    expect(screen.getAllByText(/편집 중$/)).toHaveLength(1)
  })

  it('사람이 둘이면 이름도 둘이다', async () => {
    const view = await board()

    view.push(locksFrame([foreign('n-a'), foreign('n-b', { userId: 'u-dahye', userName: '다혜' })]))

    expect(screen.getByText('보라 편집 중')).toBeTruthy()
    expect(screen.getByText('다혜 편집 중')).toBeTruthy()
  })

  it('참가자 목록에 없는 사람의 잠금도 이름이 뜬다 (D8)', async () => {
    const view = await board()

    // `presence`가 비어 있어도 배지가 뜬다 — 잠금 프레임이 이름을 **직접** 나르기 때문이다.
    // 목록에 기대면 회수된 연결이 한 프레임 남는 창(P3-2 이월 §2.5)에서 배지가 조용히
    // 사라지거나 없는 이름을 그린다.
    view.push({ type: 'presence', projectId: PROJECT_ID, participants: [] })
    view.push(locksFrame([foreign('n-b')]))

    expect(screen.getByText('보라 편집 중')).toBeTruthy()
  })

  it('내가 잠근 것에는 안 뜬다 — 자기 이름이 뜨는 것은 뜻이 없다 (D3)', async () => {
    const view = await board()

    view.push(locksFrame([foreign('n-b', { userId: ME, userName: '테스터' })]))

    expect(screen.queryByText(/편집 중$/)).toBeNull()
  })

  it('다른 페이지의 잠금은 이 화면에 안 뜬다', async () => {
    const view = await board()

    view.push(locksFrame([foreign('n-b', { pageId: OTHER_PAGE_ID })]))

    expect(screen.queryByText(/편집 중$/)).toBeNull()
  })

  it('잠금이 풀리면 배지가 사라진다', async () => {
    const view = await board()
    view.push(locksFrame([foreign('n-b')]))
    expect(screen.getByText('보라 편집 중')).toBeTruthy()

    view.push(locksFrame([]))

    expect(screen.queryByText(/편집 중$/)).toBeNull()
  })
})

describe('연결이 끊긴 동안 — 배지는 낡은 채 남는다', () => {
  /**
   * **판정이고, 이 케이스는 그 판정을 이름과 함께 고정한다.**
   *
   * 끊긴 동안 화면은 잠금이 아직 살아 있는지 알 수 없다(서버가 TTL로 걷어 낼 수도 있고
   * 남이 놓았을 수도 있다). 두 갈래뿐이다:
   *
   * | 갈래 | 대가 |
   * |---|---|
   * | 목록을 비운다 | 남이 편집 중인 자리를 고르게 되고, **친 값이 서버에서 423으로 죽는다** |
   * | 목록을 남긴다 | 이미 풀린 잠금에 막힌다 — **할 수 있는 것을 못 한다** |
   *
   * **남기는 쪽을 골랐다.** 사용자의 입력을 잃는 쪽이 더 나쁘고, 2차 방어가 어차피 서 있어
   * 비우는 쪽이 안전해지지도 않는다(편집은 끊긴 동안 REST로 나가고 그쪽도 잠금을 본다).
   *
   * **대가는 화면이 그것을 말하지 않는 것이다** — P3-1 리뷰 C4가 연 자리이고 P3-2도 안
   * 닫았다. 이월에 적는다.
   */
  it('끊겨도 배지가 남는다 — 화면은 그것이 낡았다는 것을 말하지 않는다', async () => {
    const view = await board()
    view.push(locksFrame([foreign('n-b')]))

    view.disconnect()

    expect(screen.getByText('보라 편집 중')).toBeTruthy()
    expect((treeButton('Section') as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('선택 차단 (1차 방어)', () => {
  it('남이 잠근 노드는 눌러도 선택되지 않는다', async () => {
    const view = await board()
    view.push(locksFrame([foreign('n-b')]))

    fireEvent.click(treeButton('Section'))

    // **막혔다는 것은 "선택이 없다"가 아니라 "옮겨가지 않았다"이다** — 페이지를 열면
    // 스토어가 루트를 고른 채로 시작하므로(`store/editor-store.ts`의 `#selectionFor`)
    // 거절된 클릭은 그 자리를 그대로 둔다. `null`로 단언하면 재는 것이 거절이 아니라
    // 초기값이 된다.
    expect(view.store.getState().selectedNodeId).toBe('n-root')
  })

  it('잠긴 서브트리 **안**의 노드도 막힌다 — §7.2가 잠그는 것은 서브트리다', async () => {
    const view = await board()
    view.push(locksFrame([foreign('n-b')]))

    // 둘째 `Text`가 잠긴 `n-b` 안의 `n-b1`이다.
    fireEvent.click(treeButtonAt('Text', 1))

    expect(view.store.getState().selectedNodeId).toBe('n-root')
  })

  it('밖의 노드는 그대로 선택된다 — 대조', async () => {
    const view = await board()
    view.push(locksFrame([foreign('n-b')]))

    fireEvent.click(treeButtonAt('Text', 1))
    // 첫째 `Text`는 잠긴 서브트리 밖의 `n-a`다.
    fireEvent.click(treeButtonAt('Text', 0))

    expect(view.store.getState().selectedNodeId).toBe('n-a')
  })

  it('내 잠금은 나를 막지 않는다 (D3)', async () => {
    const view = await board()
    view.push(locksFrame([foreign('n-b', { userId: ME, userName: '테스터' })]))

    fireEvent.click(treeButton('Section'))

    expect(view.store.getState().selectedNodeId).toBe('n-b')
  })

  it('잠금이 풀리면 다시 고를 수 있다', async () => {
    const view = await board()
    view.push(locksFrame([foreign('n-b')]))
    fireEvent.click(treeButton('Section'))
    // 아직 막혀 있다 — 연 자리(루트) 그대로다.
    expect(view.store.getState().selectedNodeId).toBe('n-root')

    view.push(locksFrame([]))
    fireEvent.click(treeButton('Section'))

    expect(view.store.getState().selectedNodeId).toBe('n-b')
  })

  it('잠긴 줄은 **눌릴 수 없게 보인다** — 같은 모양인데 반응만 없으면 고장으로 읽힌다', async () => {
    const view = await board()

    view.push(locksFrame([foreign('n-b')]))

    expect((treeButton('Section') as HTMLButtonElement).disabled).toBe(true)
    // 대조: 잠기지 않은 줄은 그대로 눌린다.
    expect((treeButtonAt('Text', 0) as HTMLButtonElement).disabled).toBe(false)
  })

  it('스토어가 막는다 — 트리 밖(캔버스)에서 눌러도 같다', async () => {
    const view = await board()
    view.push(locksFrame([foreign('n-b')]))

    // 캔버스도 `store.selectNode`를 부른다. 화면 컴포넌트마다 막으면 규칙이 여러 벌이 된다.
    act(() => {
      view.store.selectNode('n-b1')
    })

    expect(view.store.getState().selectedNodeId).toBe('n-root')
  })
})

describe('잠금을 잡는다 — 선택이 곧 잠금이다 (§7.2)', () => {
  it('노드를 고르면 그 자리를 잡는 프레임이 나간다', async () => {
    const view = await board()

    fireEvent.click(treeButton('Section'))

    expect(view.lockFrames().at(-1)).toEqual({ type: 'lock', pageId: PAGE_ID, nodeId: 'n-b' })
  })

  /**
   * **루트는 claim 하지 않는다**(`realtime/use-node-lock.ts`의 머리말).
   *
   * 페이지를 열면 스토어가 루트를 고른 채로 시작하는데(`store/editor-store.ts`의
   * `#selectionFor` — 그러지 않으면 연 직후가 죽은 화면이다), 그것을 그대로 보내면
   * **페이지를 여는 것만으로 남의 그 페이지 전체가 얼어붙는다.** 루트는 문서 안 모든
   * 노드의 조상이라 그 잠금 하나가 모든 선택을 막는다.
   *
   * 잰 값: 예외를 빼면 아래 `선택을 옮기면 새 자리를 잡는다`가 `['n-b', 'n-a']` 대신
   * `['n-root', 'n-b', 'n-a']`를 본다 — 맨 앞이 아무도 누르지 않은 잠금이다.
   */
  it('페이지를 열어도 잠금이 나가지 않는다 — 루트 잠금은 페이지 전체 잠금이다', async () => {
    const view = await board()

    // 고른 것은 있다. 안 보낼 뿐이다 — 이 두 단언이 함께 있어야 "자동 선택이 안 걸렸다"와
    // 구분된다.
    expect(view.store.getState().selectedNodeId).toBe('n-root')
    expect(view.lockFrames()).toEqual([])
  })

  it('루트로 돌아오면 잡고 있던 것을 놓는다', async () => {
    const view = await board()
    fireEvent.click(treeButton('Section'))
    expect(view.lockFrames().at(-1)).toEqual({ type: 'lock', pageId: PAGE_ID, nodeId: 'n-b' })

    // 트리에서 루트 줄을 누른다. 잠글 자리를 고른 것이 아니므로 앞의 것을 놓아야 한다 —
    // 안 놓으면 사용자가 떠난 자리의 배지가 남의 화면에 남는다.
    fireEvent.click(treeButton('Page'))

    expect(view.store.getState().selectedNodeId).toBe('n-root')
    expect(view.lockFrames().at(-1)).toEqual({ type: 'unlock' })
  })

  it('선택을 옮기면 새 자리를 잡는다', async () => {
    const view = await board()

    fireEvent.click(treeButton('Section'))
    fireEvent.click(treeButtonAt('Text', 0))

    expect(view.lockFrames().map((frame) => frame.nodeId)).toEqual(['n-b', 'n-a'])
  })

  it('막힌 선택은 잠금도 안 낸다 — 화면이 안 고른 것을 서버에 알리지 않는다', async () => {
    const view = await board()
    view.push(locksFrame([foreign('n-b')]))

    fireEvent.click(treeButton('Section'))

    expect(view.lockFrames()).toEqual([])
  })

  it('같은 노드를 다시 눌러도 프레임이 늘지 않는다 — 선택이 안 바뀌었다', async () => {
    const view = await board()

    fireEvent.click(treeButton('Section'))
    fireEvent.click(treeButton('Section'))

    expect(view.lockFrames()).toHaveLength(1)
  })

  it('다시 붙으면 잡고 있던 자리를 다시 알린다 — 서버는 끊기며 놓았다', async () => {
    const view = await board()
    fireEvent.click(treeButton('Section'))
    const before = view.lockFrames().length

    view.reconnect()

    expect(view.lockFrames().length).toBeGreaterThan(before)
    expect(view.lockFrames().at(-1)).toEqual({ type: 'lock', pageId: PAGE_ID, nodeId: 'n-b' })
  })
})

describe('하트비트 — 편집 중 갱신 (§7.2)', () => {
  it('편집을 내면 잡고 있는 자리를 한 번 더 알린다', async () => {
    const view = await board()
    fireEvent.click(treeButton('Section'))
    const before = view.lockFrames().length

    // 구조 편집 하나 — 화면의 버튼으로 낸다. 어느 편집이든 전송 루프를 지나가면 하트비트가
    // 함께 나간다.
    // 메뉴 트리에도 같은 이름의 버튼이 있으므로 구조 편집 툴바로 좁힌다.
    fireEvent.click(
      within(screen.getByRole('group', { name: '구조 편집' })).getByRole('button', { name: '위로' }),
    )
    await act(async () => {})

    expect(view.lockFrames().length).toBeGreaterThan(before)
  })
})

describe('페이지를 옮길 때 (리뷰 §11)', () => {
  /**
   * **주소가 바뀐 커밋 하나 동안 스토어는 앞 페이지를 들고 있다**(`useOpenPage`의 머리말).
   * 그 커밋에서 잠금을 걸면 **새 주소에 앞 페이지의 노드로** 프레임이 나간다 — 리뷰가
   * 프로브로 그것을 찍었다:
   *
   * ```
   * lock(pg-1, n-b) → lock(pg-2, n-b) → unlock
   * ```
   *
   * **두 페이지의 노드 id가 겹치면 남의 화면에 없는 노드의 배지가 한 프레임 뜬다** — 그런
   * 문서는 가져오기·프리셋이 만든다(`POST .../pages/import`가 파일의 id를 그대로 쓴다).
   * 다음 커밋에 스스로 풀리지만, 그동안 **남의 선택을 막는다.**
   */
  it('새 주소에 **앞 페이지의 노드로** 잠금이 나가지 않는다', async () => {
    const view = await board()
    fireEvent.click(treeButton('Section'))
    expect(view.lockFrames().at(-1)).toEqual({ type: 'lock', pageId: PAGE_ID, nodeId: 'n-b' })

    // 메뉴에서 다른 페이지로 옮긴다. 두 페이지의 문서는 노드 id가 같다(`board`가 그렇게 연다).
    fireEvent.click(screen.getByRole('link', { name: OTHER_PAGE_TITLE }))
    await waitForNode('n-root')

    expect(view.lockFrames().filter((frame) => frame.pageId === OTHER_PAGE_ID)).toEqual([])
  })

  it('옮기면 앞 페이지의 잠금을 놓는다 — 대조', async () => {
    const view = await board()
    fireEvent.click(treeButton('Section'))

    fireEvent.click(screen.getByRole('link', { name: OTHER_PAGE_TITLE }))
    await waitForNode('n-root')

    expect(view.lockFrames().at(-1)).toEqual({ type: 'unlock' })
  })
})

describe('놓는다', () => {
  it('선택이 없어지면 놓는 프레임이 나간다 — 캔버스 빈 자리를 누르면 그 상태가 된다', async () => {
    const view = await board()
    fireEvent.click(treeButton('Section'))

    // **선택을 사용자가 하듯 푼다** — `store.selectNode(null)`을 직접 부르면 캔버스에서
    // 스토어까지의 배선이 빠진 채 단언이 통과한다(이 파일 머리말의 *"스토어를 직접 쥐면"*,
    // 그리고 `editor-harness.tsx`의 `deselect` 주석).
    deselect()

    expect(view.lockFrames().at(-1)).toEqual({ type: 'unlock' })
  })
})
