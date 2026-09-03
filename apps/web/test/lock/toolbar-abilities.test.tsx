/**
 * **남이 잠근 자리에서 구조 도구모음이 무엇을 하는가**(설계 §7.2의 1차 방어).
 *
 * # 이 파일이 생긴 이유 — 세 번째 라운드가 남긴 이월
 *
 * §7.2의 1차 방어는 **선택**만 막았다(`store.selectNode`). 그런데 잠금이 도착해도 선택은
 * 그대로 남는다 — `setLocks`는 선택을 건드리지 않고, **페이지를 열면 루트가 자동으로
 * 선택되며**(`store/editor-store.ts`의 `#selectionFor`) 루트는 문서 안 모든 노드의
 * 조상이다. 그래서 *"남이 아무 노드나 잡으면 루트가 선택된 채 잠긴다"*가 흔한 상태이고,
 * 그때 `structureAbilities`는 잠금을 **아예 보지 않아** 도구가 살아 있었다.
 *
 * **그 상태에서 켜진 버튼을 실제로 눌러 잰 값이 `edit/structure-actions.ts`의 머리말 표다.**
 * 요지: 서버의 2차 방어(`findLockConflict`)는 **편집이 건드리는 자리만** 보므로 형제를
 * 더하는 편집은 통과시키고, 잠긴 서브트리를 건드리는 편집은 423으로 거절한다. 거절되면
 * 화면은 낙관적 적용을 붙였다가 재조회로 되돌리고 큐를 통째로 버린다.
 *
 * # 그래서 이 파일이 재는 것
 *
 * > **잠긴 자리에서는 판정 일곱이 전부 꺼지고, 버튼으로도 단축키로도 서버에 아무것도
 * > 나가지 않는다. 잠긴 서브트리 «밖»은 그대로다.**
 *
 * 뒤 문장이 없으면 *"잠금이 있으면 무조건 끈다"*와 구별되지 않는다.
 *
 * # 서버 대역이 진짜 판정을 든다
 *
 * `patchOps`가 `findLockConflict`를 **직접** 부른다 — `apps/api`의 `lock/check.ts`가 부르는
 * 그 함수다. 손으로 적은 200/423으로 대신하면 *"화면이 막아서 안 나갔다"*와 *"서버가
 * 받아서 통과했다"*가 같은 값으로 보인다. 고침을 되돌리면 이 대역이 **실제로** 423을 내고
 * 알림이 뜬다(구분력 실증에서 확인했다).
 *
 * **api 프로젝트가 아니라 여기서 부르는 것이 요점이 아니다** — 판정의 소유자는
 * `packages/schema`이고 두 앱이 그것을 부른다(`test/lock/one-verdict.test.ts`가 소스에서
 * 센다). 여기서는 그 판정을 **대역의 재료로** 쓸 뿐이라 화면 쪽 판정이 늘지 않는다.
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
import { HEAD_SEQ, PAGE_ID, PROJECT_ID, openPage, pageDetail, pageDoc } from '../editor-harness'

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
  /** 서버가 낸 상태 코드들. 고침을 되돌리면 여기 `423`이 선다. */
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

function foreign(nodeId: string): NodeLockView {
  return { pageId: PAGE_ID, nodeId, userId: 'u-bora', userName: '보라' }
}

function structureRegion(): HTMLElement {
  return screen.getByRole('region', { name: '구조 트리' })
}

function toolbar(): HTMLElement {
  return within(structureRegion()).getByRole('group', { name: '구조 편집' })
}

/** 판정을 지나는 버튼 일곱. 늘어나면 아래 케이스가 새 버튼도 함께 본다. */
const TOOLS = ['안에 추가', '아래 추가', '삭제', '위로', '아래로', '들여쓰기', '내어쓰기']

/** 지금 켜져 있는 도구들. 판정 밖의 `패턴 넣기`·`프리셋`은 여기 없다. */
function live(): string[] {
  return TOOLS.filter(
    (name) => !within(toolbar()).getByRole<HTMLButtonElement>('button', { name }).disabled,
  )
}

/** 트리에서 노드 하나를 고른다. 줄 이름이 타입이다. */
function select(type: string): void {
  fireEvent.click(within(structureRegion()).getByRole('button', { name: type }))
}

/** 그 노드의 트리 줄. 단축키를 여기에 친다. */
function row(type: string): HTMLElement {
  return within(structureRegion()).getByRole('button', { name: type })
}

function statusLine(): string {
  return structureRegion().querySelector('.wb-shell-structure-status')?.textContent ?? ''
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
   * **이것이 이월이 지목한 상태다.** 페이지를 열면 루트가 자동 선택되고, 남이 그 페이지의
   * 아무 노드나 잡으면 루트가 그 조상이라 `lockedBy(root)`가 그 잠금을 낸다.
   *
   * 고치기 전에는 여기서 `안에 추가` **하나**가 켜져 있었고(루트라 나머지 여섯은 원래
   * 꺼진다), 그것을 누르면 `add /root/children/3`이 나가 **서버가 통과시켰다.**
   */
  it('루트가 선택된 채 남이 자손을 잠그면 하나 남았던 `안에 추가`까지 꺼진다', async () => {
    const view = await board()
    expect(view.store.getState().selectedNodeId).toBe('n-root')
    expect(live()).toEqual(['안에 추가'])

    view.lock([foreign('n-1')])

    expect(live()).toEqual([])
    expect(statusLine()).toBe('보라님이 편집 중이라 고를 수도 바꿀 수도 없습니다')
  })

  /**
   * **비루트는 꺼지는 것이 다섯이라 값이 다르다.** 그 다섯 중 셋(`삭제`·`위로`·`아래로`)은
   * 그냥 두면 423을 받고, 둘(`안에 추가`·`아래 추가`)은 서버가 통과시킨다 — 그래도 전부
   * 끄는 근거는 `edit/structure-actions.ts`의 머리말에 있다.
   */
  it('비루트가 선택된 채 그 자식이 잠기면 다섯이 함께 꺼진다', async () => {
    const view = await board()
    select('Card')
    expect(live()).toEqual(['안에 추가', '아래 추가', '삭제', '위로', '아래로'])

    view.lock([foreign('n-1')])

    expect(live()).toEqual([])
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
    // `n-a`는 잎이라 `안에 추가`·`들여쓰기`가 원래 꺼진다(앞 형제 `없음` · 자식 불가).
    expect(live()).toEqual(['아래 추가', '삭제', '아래로'])
    expect(statusLine()).toBe('자식을 담지 못하는 타입입니다')
  })

  it('잠금이 풀리면 도구가 돌아온다', async () => {
    const view = await board()
    select('Card')
    view.lock([foreign('n-1')])
    expect(live()).toEqual([])

    view.lock([])

    expect(live()).toEqual(['안에 추가', '아래 추가', '삭제', '위로', '아래로'])
    expect(statusLine()).toBe('')
  })

  it('내 잠금은 판정을 끄지 않는다 (D3) — 소유자 판정은 스토어가 지난다', async () => {
    const view = await board()
    select('Card')

    view.lock([{ ...foreign('n-1'), userId: ME, userName: '테스터' }])

    expect(live()).toEqual(['안에 추가', '아래 추가', '삭제', '위로', '아래로'])
  })
})

describe('막힌 자리에서는 서버로 아무것도 나가지 않는다', () => {
  /**
   * **단축키가 이 파일의 핵심이다.** 판정을 툴바 컴포넌트에서 `disabled`로 겹쳤다면 버튼은
   * 회색인데 **단축키만 살아 있었을 것이다** — 키 이벤트는 `disabled`를 지나지 않는다.
   * 그래서 잠금을 `useStructureCommands`가 만드는 `abilities`에 넣었고
   * (`panels/structure-tree.tsx`의 `SHORTCUTS`가 그 값을 지난다), 이 케이스가 그것을 잰다.
   *
   * **셋을 함께 친다** — `Delete`(삭제)와 `Alt`+`↑`·`Alt`+`↓`(순서)다. 고치기 전에는
   * 이 셋이 전부 나갔고 서버가 셋 다 423으로 거절했다.
   */
  it('잠긴 노드에서는 단축키가 편집을 만들지 않는다 — 버튼과 같은 판정을 지난다', async () => {
    const view = await board()
    select('Card')
    view.lock([foreign('n-1')])

    // **줄을 한 번만 잡아 둔다.** 매번 다시 찾으면 고침을 되돌렸을 때 **첫 키가 그 줄을
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
   * **고치기 전에 사용자가 본 것이 이것이다.** `n-box`가 잠긴 채 `삭제`를 누르면 노드가
   * 화면에서 사라졌다가 재조회로 되돌아오고, 큐에 있던 편집이 함께 버려졌다.
   * 지금은 그 버튼이 회색이라 클릭이 핸들러에 닿지 않는다.
   */
  it('잠긴 노드에서 `삭제`를 눌러도 문서가 흔들리지 않는다 — 붙었다 사라지는 것이 없다', async () => {
    const view = await board()
    select('Card')
    view.lock([foreign('n-box')])

    fireEvent.click(within(toolbar()).getByRole('button', { name: '삭제' }))
    await settle()

    expect(view.calls).toEqual([])
    expect(alertText()).toBeNull()
    // 트리에 `Card`가 그대로 있다 — 사라졌다 돌아온 흔적도 없다.
    expect(within(structureRegion()).getByRole('button', { name: 'Card' })).toBeTruthy()
  })
})
