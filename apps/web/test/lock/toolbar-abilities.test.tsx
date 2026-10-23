/**
 * **남이 잠근 자리에서 구조 도구모음이 무엇을 하는가**(설계서 「소프트 잠금」의 1차 방어).
 *
 * # 선택만 막으면 도구가 샌다
 *
 * 1차 방어가 **선택**만 막으면(`store.selectNode`) 도구가 샌다. 잠금이 도착해도 선택은
 * 그대로 남는다 — `setLocks`는 선택을 건드리지 않고, **페이지를 열면 루트가 자동으로
 * 선택되며**(`store/editor-store.ts`의 `#selectionFor`) 루트는 문서 안 모든 노드의
 * 조상이다. 그래서 *"남이 아무 노드나 잡으면 루트가 선택된 채 잠긴다"*가 흔한 상태이고,
 * 그때 `structureAbilities`가 잠금을 **아예 보지 않으면** 도구가 살아 있다.
 *
 * **그 상태에서 켜진 버튼을 실제로 눌러 잰 값이 `edit/structure-actions.ts`의 머리말 표다.**
 * 요지: 서버의 2차 방어(`lockConflictOfOps`)는 **편집이 건드리는 자리만** 보므로 형제를
 * 더하는 편집은 통과시키고, 잠긴 서브트리를 건드리는 편집은 423으로 거절한다. 거절되면
 * 화면은 낙관적 적용을 붙였다가 재조회로 되돌리고 큐를 통째로 버린다.
 *
 * # 그래서 이 파일이 재는 것
 *
 * > **잠긴 자리에서는 판정에 매인 줄 항목이 전부 꺼지고, 버튼으로도 단축키로도 서버에 아무것도
 * > 나가지 않는다. 잠긴 서브트리 «밖»은 그대로다.**
 *
 * 뒤 문장이 없으면 *"잠금이 있으면 무조건 끈다"*와 구별되지 않는다.
 *
 * **넣기는 이 파일 밖이다.** 구조 트리의 넣기 입구(«안에 추가» · «아래 추가» · «패턴 넣기» · «프리셋» · 고르개 · Alt+Shift+I/P)는 걷었고
 * (넣기는 하단 판이 한다 — 설계 spec 「B1」), 잠긴 자리의 넣기는 하단 판의 케이스(`build-test/palette-review.test.ts` · `../palette/module-tab.test.tsx`)가 잰다.
 *
 * # 서버 대역이 진짜 판정을 든다
 *
 * `patchOps`가 `lockConflictOfOps`를 **직접** 부른다 — `apps/api`의 `lock/check.ts`가 부르는
 * 그 함수다. 손으로 적은 200/423으로 대신하면 *"화면이 막아서 안 나갔다"*와 *"서버가
 * 받아서 통과했다"*가 같은 값으로 보인다. 화면의 막기를 빼면 이 대역이 **실제로** 423을
 * 내고 알림이 뜬다.
 *
 * **api 프로젝트가 아니라 여기서 부르는 것이 요점이 아니다** — 판정의 소유자는
 * `packages/schema`이고 두 앱이 그것을 부른다(`test/lock/one-verdict.test.ts`가 소스에서
 * 센다). 여기서는 그 판정을 **대역의 재료로** 쓸 뿐이라 화면 쪽 판정이 늘지 않는다.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { CURRENT_DOCUMENT_VERSION, lockConflictOfOps, writeNodesEnvelope, type PageDocument, type PatchOp } from '@wirebound/schema'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type ApiClient } from '../../src/api/client'
import type { PageDetail, PatchResult } from '../../src/api/types'
import type { RealtimeSocket } from '../../src/realtime/connection'
import { createConnectionIdHolder, type RealtimeSetup } from '../../src/realtime/context'
import { createEditChannel } from '../../src/realtime/edit-channel'
import { createLockChannel } from '../../src/realtime/lock-channel'
import type { NodeLockView, ServerFrame } from '../../src/realtime/protocol'
import type { EditorStore } from '../../src/store/editor-store'
import { HEAD_SEQ, OTHER_PAGE_TITLE, PAGE_ID, PROJECT_ID, openPage, pageDetail, pageDoc } from '../editor-harness'
import { isOff, rowReason, rowReasons, treeTool, structureRowName } from '../panels/tree-row'
import { installPointerEvents } from '../pointer-events'

beforeAll(installPointerEvents)

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

class FakeSocket implements RealtimeSocket {
  onopen: (() => void) | null = null

  onmessage: ((event: { data: unknown }) => void) | null = null

  onclose: (() => void) | null = null

  onerror: (() => void) | null = null

  readonly sent: string[] = []

  send(): void {}

  close(): void {
    this.onclose?.()
  }
}

/**
 * ```
 * n-root (Page)
 *   n-a   (Text)
 *   n-box (Card)   n-1 (Button), n-2 (Link)
 *   n-c   (Divider)
 * ```
 * **타입이 전부 다르다** — 트리 줄의 이름이 타입이라 그래야 노드를 이름으로 고른다.
 * `n-box`가 자식을 담을 수 있는 유일한 비루트 노드이고, 잠금을 그 **안**에 두느냐
 * `n-box` **자신**에 두느냐가 서버 판정을 가른다(머리말의 표).
 */
function doc(): PageDocument {
  return pageDoc({
    id: 'n-root',
    type: 'Page',
    children: [
      { id: 'n-a', type: 'Text', props: {} },
      {
        id: 'n-box',
        type: 'Card',
        children: [
          { id: 'n-1', type: 'Button', props: {} },
          { id: 'n-2', type: 'Link', props: {} },
        ],
      },
      { id: 'n-c', type: 'Divider', props: {} },
    ],
  })
}

interface Board {
  store: EditorStore
  /** 서버가 보낸 것처럼 잠금 목록을 밀어 넣는다. */
  lock: (locks: NodeLockView[]) => void
  /** 지금까지 서버가 받은 편집. 잠긴 자리에서는 **비어 있어야 한다.** */
  calls: { ops: PatchOp[] }[]
  /** 서버가 낸 상태 코드들. 화면의 막기를 빼면 여기 `423`이 선다. */
  status: number[]
}

/**
 * 셸을 띄운다. **`onopen`을 부르지 않는 것이 의도다** — WS가 붙어 있으면 편집이 그리로
 * 나가고(`edit/use-edit-commit.tsx`), 그러면 `patchOps` 대역이 아무것도 못 본다. 잠금
 * 프레임은 `onmessage`로 그대로 들어온다.
 */
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
    const conflict = lockConflictOfOps({
      document: held,
      locks: live.filter((entry) => entry.pageId === PAGE_ID),
      ops: body.ops,
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

  const listComments: ApiClient['listComments'] = async () => []

  await openPage(doc(), {
    realtime: setup,
    apiOverrides: { patchOps, getPage, listComments },
  })

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

function foreign(nodeId: string): NodeLockView {
  return { pageId: PAGE_ID, nodeId, userId: 'u-bora', userName: '보라' }
}

function structureRegion(): HTMLElement {
  return screen.getByRole('region', { name: '구조 트리' })
}

function toolbar(): HTMLElement {
  // 옛 «구조 편집» 툴바 자리 — 줄 행동 · 고르개가 트리 영역 안에 선다(`../panels/tree-row.ts`).
  return structureRegion()
}

/** `structureAbilities`를 지나는 줄 `…` 항목 다섯. 늘어나면 아래 케이스가 새 항목도 함께 본다. */
const TOOLS = ['삭제', '위로', '아래로', '들여쓰기', '내어쓰기']

function toolButton(name: string): HTMLElement {
  return treeTool(toolbar(), name)
}

/**
 * 지금 켜져 있는 항목들. 고른 줄이 없으면 줄 행동이 없어 켜진 것도 없다(판정이 `NOTHING`이다).
 */
function live(): string[] {
  if (structureRegion().querySelector('.wb-shell-tree-row-picked') === null) return []
  return TOOLS.filter((name) => !isOff(toolButton(name)))
}

/** 트리에서 노드 하나를 고른다. 줄 이름이 타입이다. */
function select(type: string): void {
  fireEvent.click(within(structureRegion()).getByRole('button', { name: structureRowName(type) }))
}

/** 그 노드의 트리 줄. 단축키를 여기에 친다. */
function row(type: string): HTMLElement {
  return within(structureRegion()).getByRole('button', { name: structureRowName(type) })
}

/** 고른 줄 항목의 꺼진 이유(`title` · `aria-description` — `../panels/tree-row.ts`의 `rowReason`). */
function reason(name: string): string | null {
  return rowReason(toolbar(), name)
}

/** 고른 줄 항목 가운데 이유에 잠근 사람(«보라»)을 싣는 것의 수 — 고른 줄이 없으면 0. */
function namedReasons(): number {
  if (structureRegion().querySelector('.wb-shell-tree-row-picked') === null) return 0
  return Object.values(rowReasons(toolbar())).filter((text) => text?.includes('보라') === true).length
}

function alertText(): string | null {
  return document.body.querySelector('.wb-shell-edit-alert')?.textContent ?? null
}

/** 낙관적 적용·전송·재조회가 다 흐르도록 흘린다. */
async function settle(): Promise<void> {
  await act(async () => {})
  await act(async () => {})
  await act(async () => {})
}

describe('잠긴 자리에서는 판정이 전부 꺼진다', () => {
  /**
   * **페이지를 열면 루트가 골라지고, 남이 그 페이지의 아무 노드나 잡으면 루트가 그 조상이라 잠긴다** — 이것이 도구가 새는 흔한 상태다. 루트의
   * 줄 항목은 자리(루트)로 원래 꺼져 있어, 잠금이 새는지는 비루트에서 갈린다: 켜져 있던 셋(`삭제`·`위로`·`아래로`)이 그냥 두면 423을 받는다.
   */
  it('비루트가 선택된 채 그 자식이 잠기면 켜져 있던 셋이 꺼지고 이름과 함께 이유를 든다', async () => {
    const view = await board()
    select('Card')
    expect(live()).toEqual(['삭제', '위로', '아래로'])

    view.lock([foreign('n-1')])

    expect(live()).toEqual([])
    expect(reason('삭제')).toBe('보라님이 편집 중이라 고를 수도 바꿀 수도 없습니다')
  })

  it('고른 노드 «자신»이 잠겨도 같다 — 조상·자손·자기 셋이 한 판정이다', async () => {
    const view = await board()
    select('Card')

    view.lock([foreign('n-box')])

    expect(live()).toEqual([])
  })

  /**
   * **하나면 *"잠금이 있으면 무조건 끈다"*와 구분되지 않는다.** `n-a`는 잠긴 서브트리
   * 밖이라 고를 수 있고, 그 자리의 판정은 잠금 이전과 같아야 한다.
   */
  it('잠긴 서브트리 밖은 그대로다 — 잠금 하나가 페이지를 얼리지 않는다', async () => {
    const view = await board()
    view.lock([foreign('n-1')])

    select('Text')

    expect(view.store.getState().selectedNodeId).toBe('n-a')
    // `n-a`는 맏이라 `위로`·`들여쓰기`가 원래 꺼진다(앞 형제 없음) · 부모가 루트라 `내어쓰기`도. 잠금을 말하는 항목은 없다.
    expect(live()).toEqual(['삭제', '아래로'])
    expect(namedReasons()).toBe(0)
  })

  it('잠금이 풀리면 도구가 돌아온다', async () => {
    const view = await board()
    select('Card')
    view.lock([foreign('n-1')])
    expect(live()).toEqual([])

    view.lock([])

    expect(live()).toEqual(['삭제', '위로', '아래로'])
    expect(namedReasons()).toBe(0)
  })

  it('내 잠금은 판정을 끄지 않는다 — 소유자 판정은 스토어가 지난다', async () => {
    const view = await board()
    select('Card')

    view.lock([{ ...foreign('n-1'), userId: ME, userName: '테스터' }])

    expect(live()).toEqual(['삭제', '위로', '아래로'])
  })
})

describe('막힌 자리에서는 서버로 아무것도 나가지 않는다', () => {
  /**
   * **단축키가 이 파일의 핵심이다.** 판정을 툴바 컴포넌트에서 `disabled`로 겹치면 버튼은
   * 회색인데 **단축키만 살아 있다** — 키 이벤트는 `disabled`를 지나지 않는다. 그래서
   * 잠금은 `useStructureCommands`가 만드는 `abilities`에 들어 있고
   * (에디터 단축키 `shell/editor-keys.tsx`가 그 값을 지난다), 이 케이스가 그것을 잰다.
   *
   * **셋을 함께 친다** — `Delete`(삭제)와 `Alt`+`↑`·`Alt`+`↓`(순서)다. 단축키가 잠금을
   * 안 보면 이 셋이 전부 나가고 서버가 셋 다 423으로 거절한다.
   */
  it('잠긴 노드에서는 단축키가 편집을 만들지 않는다 — 버튼과 같은 판정을 지난다', async () => {
    const view = await board()
    select('Card')
    view.lock([foreign('n-1')])

    // **줄을 한 번만 잡아 둔다.** 매번 다시 찾으면 막기를 뺀 판에서 **첫 키가 그 줄을
    // 지워** 두 번째 조회가 *"요소가 없다"*로 죽는다 — 그 실패는 무엇이 나갔는지를 말하지
    // 않는다. 여기서는 나간 편집 자체가 값이어야 한다.
    const card = row('Card')
    fireEvent.keyDown(card, { key: 'Delete' })
    fireEvent.keyDown(card, { key: 'ArrowUp', altKey: true })
    fireEvent.keyDown(card, { key: 'ArrowDown', altKey: true })
    await settle()

    expect(view.calls).toEqual([])
    expect(view.status).toEqual([])
    // 서버가 거절한 것이 아니라 **애초에 안 나간 것**이다 — 알림이 없다는 것이 그 값이다.
    expect(alertText()).toBeNull()
  })

  /**
   * **대조가 없으면 위 케이스는 *"단축키가 원래 안 도는 하네스"*와 구분되지 않는다.**
   * 같은 키를 잠기지 않은 자리에서 치면 편집이 나가고 서버가 받는다.
   */
  it('대조 — 잠기지 않은 자리에서는 같은 단축키가 편집을 낸다', async () => {
    const view = await board()
    view.lock([foreign('n-1')])
    select('Text')

    fireEvent.keyDown(row('Text'), { key: 'Delete' })
    await waitFor(() => expect(view.calls).toHaveLength(1))
    await settle()

    expect(view.calls[0]?.ops).toEqual([{ op: 'remove', path: '/root/children/0' }])
    expect(view.status).toEqual([200])
    expect(alertText()).toBeNull()
  })

  /**
   * **남이 잡은 줄은 줄 행동도 끌기도 없다**(`panels/structure-tree.tsx`의 `StructureNode` — `open`). 고르기가 막힌 줄의 `…`를 열면 그
   * 줄을 못 골라 목록이 앞 선택의 명령으로 선다. 끌기는 그 노드를 뽑는 편집이 잠금에 부딪치는 판이다. 대조로 잠기지 않은 형제는 둘 다 있다.
   */
  it('남이 잡은 줄은 `+` · `…`가 없고 눌러 끌어도 들리지 않는다 — 잠기지 않은 형제는 있다', async () => {
    const view = await board()
    view.lock([foreign('n-box')])

    const rowBox = (type: string): HTMLElement =>
      within(structureRegion())
        .getByRole('button', { name: structureRowName(type) })
        .closest<HTMLElement>('[data-tree-row]')!
    expect(rowBox('Card').querySelector('.wb-shell-tree-row-actions')).toBeNull()
    expect(rowBox('Text').querySelector('.wb-shell-tree-row-actions')).not.toBeNull()

    const press = (type: string): boolean => {
      const handle = rowBox(type).querySelector<HTMLElement>('.wb-shell-structure-node')!
      fireEvent.pointerDown(handle, { button: 0, clientX: 10, clientY: 10, pointerId: 1 })
      fireEvent.pointerMove(window, { clientX: 10, clientY: 40, pointerId: 1 })
      const lifted = rowBox(type).classList.contains('wb-shell-tree-row-dragging')
      fireEvent.pointerUp(window, { clientX: 10, clientY: 40, pointerId: 1 })
      return lifted
    }
    expect(press('Card')).toBe(false)
    expect(press('Text')).toBe(true)
    expect(view.calls).toEqual([])
  })

  /**
   * **고른 뒤 잠금이 온 줄** — 줄 행동은 남지만(그 줄의 판정이 전부 끈다 — `StructureNode`의 `open`) 끌기는 없다. 끌기를 막는 것이
   * 고르기의 판정(`blockedOf`)만이면 이 판에서 들린다 — 뽑는 편집이 잠금에 부딪치는데도.
   */
  it('고른 뒤 그 자식이 잠기면 줄 행동은 남고(다 꺼짐) 끌기는 없다', async () => {
    const view = await board()
    select('Card')
    view.lock([foreign('n-1')])

    const card = within(structureRegion())
      .getByRole('button', { name: structureRowName('Card') })
      .closest<HTMLElement>('[data-tree-row]')!
    expect(card.classList.contains('wb-shell-tree-row-picked')).toBe(true)
    expect(card.querySelector('.wb-shell-tree-row-actions')).not.toBeNull()
    expect(live()).toEqual([])

    const handle = card.querySelector<HTMLElement>('.wb-shell-structure-node')!
    fireEvent.pointerDown(handle, { button: 0, clientX: 10, clientY: 10, pointerId: 1 })
    fireEvent.pointerMove(window, { clientX: 10, clientY: 40, pointerId: 1 })
    const lifted = card.classList.contains('wb-shell-tree-row-dragging')
    fireEvent.pointerUp(window, { clientX: 10, clientY: 40, pointerId: 1 })
    expect(lifted).toBe(false)
  })

  /**
   * **막지 않으면 사용자가 보는 것이 이것이다.** `n-box`가 잠긴 채 `삭제`를 누르면 노드가
   * 화면에서 사라졌다가 재조회로 되돌아오고, 큐에 있던 편집이 함께 버려진다. 그 버튼이
   * 회색이면 클릭이 핸들러에 닿지 않는다.
   */
  it('잠긴 노드에서 `삭제`를 눌러도 문서가 흔들리지 않는다 — 붙었다 사라지는 것이 없다', async () => {
    const view = await board()
    select('Card')
    view.lock([foreign('n-box')])

    fireEvent.click(treeTool(toolbar(), '삭제'))
    await settle()

    expect(view.calls).toEqual([])
    expect(alertText()).toBeNull()
    // 트리에 `Card`가 그대로 있다 — 사라졌다 돌아온 흔적도 없다.
    expect(within(structureRegion()).getByRole('button', { name: structureRowName('Card') })).toBeTruthy()
  })
})

/**
 * **판정이 다 꺼지는 자리 — 사용자가 갇히는가.**
 *
 * *"남의 잠금이 그 페이지의 모든 자리를 덮은"* 문서에서는 구조 트리의 줄 항목이 통째로 죽는다. **그것은 잠금의 뜻 그대로이지만**, 화면이 그 상태에서 정말로
 * 아무 데도 못 가면 그것은 고장이다. 그래서 **남는 길을 값으로 고정한다.**
 *
 * 여기서 재는 것은 *"구조 편집이 죽어도 셸은 산다"*이지 그 길들의 동작이 아니다 — 뷰 모드와
 * 페이지 이동은 각자의 케이스가 갖는다.
 */
describe('막다른 길이 아니다 — 구조 편집만 얼고 셸은 산다', () => {
  it('페이지의 모든 자리가 잠기면 트리 줄이 전부 꺼진다', async () => {
    const view = await board()

    view.lock([foreign('n-a'), foreign('n-box'), foreign('n-c')])

    expect(live()).toEqual([])
    // 트리 줄도 전부 꺼진다 — 고를 수 있는 노드가 하나도 없다. 줄 행동의 단추(행동 메뉴를 여는 것)는 줄이 아니다 —
    // 그 안의 항목이 꺼진 것은 위 `live`가 잰다. 머리의 «모두 접기» · «모두 펴기»도 줄이 아니다 — 접기는 고르기와 같은 읽기라
    // 잠금에 안 꺼진다(`src/panels/tree-fold.tsx`).
    const rows = within(structureRegion())
      .getAllByRole<HTMLButtonElement>('button')
      .filter((button) => button.getAttribute('aria-haspopup') !== 'menu' && !button.classList.contains('wb-shell-tree-fold'))
    expect(rows.filter((button) => !button.disabled)).toEqual([])
  })

  it('그래도 뷰 모드와 다른 페이지는 남는다 — 이유는 꺼진 항목이 이름과 함께 말한다', async () => {
    const view = await board()

    view.lock([foreign('n-a'), foreign('n-box'), foreign('n-c')])

    const modes = within(screen.getByRole('group', { name: '모드' })).getAllByRole<HTMLButtonElement>('button')
    expect(modes.map((button) => button.disabled)).toEqual([false, false])
    // 좌측 메뉴 트리의 다른 페이지로 갈 수 있다 — 잠금은 이 페이지의 것이다.
    expect(screen.getByRole('link', { name: OTHER_PAGE_TITLE })).toBeTruthy()
  })
})

/**
 * **붙이기 · 복제 · 잘라내기도 같은 잠금을 지난다**(설계서 「권한 모델」의 «화면이 편집을 미리 묻는 자리»). 고른 노드를 남이 잡은 판은 편집
 * 단축키가 서지 않고, 지을 편집이 남의 잠금에 부딪히는 판은 서버의 2차 방어와 같은 물음(`editBlockedBy`)으로 보내기 전에 막는다 — 어느
 * 쪽이든 편집 0 · 423 0 이고 하단 바가 이유를 말한다. 대조는 같은 몸짓을 잠기지 않은 자리에서 친 판이다.
 */
describe('붙이기 · 복제 · 잘라내기도 막힌 자리에서는 아무것도 안 나간다', () => {
  function clip(type: 'cut' | 'paste', text?: string): boolean {
    const data = new Map<string, string>()
    if (text !== undefined) data.set('text/plain', text)
    const event = new Event(type, { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', {
      value: { setData: (kind: string, value: string) => data.set(kind, value), getData: (kind: string) => data.get(kind) ?? '' },
    })
    document.body.dispatchEvent(event)
    return event.defaultPrevented
  }
  const ENVELOPE = writeNodesEnvelope([{ id: 'src', type: 'Divider' }], CURRENT_DOCUMENT_VERSION)

  it('고른 노드를 남이 잡았으면 붙이기 · 복제 · 잘라내기가 편집을 안 내고 이유를 말한다', async () => {
    const view = await board()
    select('Text')
    view.lock([foreign('n-a')])

    clip('paste', ENVELOPE)
    await settle()
    expect(view.calls).toEqual([])
    expect(alertText()).toBe('보라님이 편집 중이라 고를 수도 바꿀 수도 없습니다')
    fireEvent.keyDown(document.body, { key: 'd', code: 'KeyD', ctrlKey: true })
    await settle()
    expect(view.calls).toEqual([])
    expect(clip('cut')).toBe(false)
    await settle()

    expect(view.calls).toEqual([])
    expect(view.status).toEqual([])
  })

  it('지을 편집이 남의 잠금에 부딪히면(바로 뒤 형제를 남이 잡음) 붙이기 · 복제가 안 나간다', async () => {
    const view = await board()
    select('Button')
    view.lock([foreign('n-2')])

    clip('paste', ENVELOPE)
    await settle()
    expect(alertText()).toBe('보라님이 편집 중이라 바꿀 수 없습니다')
    fireEvent.keyDown(document.body, { key: 'd', code: 'KeyD', ctrlKey: true })
    await settle()

    expect(view.calls).toEqual([])
    expect(view.status).toEqual([])
  })

  it('대조 — 잠기지 않은 자리에서는 같은 붙이기 · 복제 · 잘라내기가 나가고 서버가 받는다', async () => {
    const view = await board()
    view.lock([foreign('n-1')])
    select('Divider')

    clip('paste', ENVELOPE)
    await waitFor(() => expect(view.calls).toHaveLength(1))
    fireEvent.keyDown(document.body, { key: 'd', code: 'KeyD', ctrlKey: true })
    await waitFor(() => expect(view.calls).toHaveLength(2))
    expect(clip('cut')).toBe(true)
    await waitFor(() => expect(view.calls).toHaveLength(3))
    await settle()

    expect(view.status).toEqual([200, 200, 200])
    expect(alertText()).toBeNull()
  })
})
