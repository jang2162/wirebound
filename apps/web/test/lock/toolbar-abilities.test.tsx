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
 * > **잠긴 자리에서는 도구 아홉이 전부 꺼지고, 버튼으로도 단축키로도 서버에 아무것도
 * > 나가지 않는다. 잠긴 서브트리 «밖»은 그대로다.**
 *
 * 뒤 문장이 없으면 *"잠금이 있으면 무조건 끈다"*와 구별되지 않는다.
 *
 * # 아홉인 까닭 — 판정 밖의 둘
 *
 * `structureAbilities`가 내는 판정은 일곱이고, `패턴 넣기`·`프리셋`은 **걸 `ability`가
 * 없다.** 그 둘이 잠금을 안 보면 **그대로 423을 낸다:** 잠긴 노드를 고른 채 패턴을 꽂으면
 * `add …/children/2`가 나가 423을 받고 낙관적 적용이 붙었다 사라진다. 하필 그때 상태줄은
 * *"고를 수도 **바꿀 수도** 없습니다"* 라고 말하고 있고, 그 문장을 읽은 사용자가 **탭으로
 * 처음 닿는 것이 그 둘**이다(`../panels/toolbar-status-reach.test.tsx`의 표).
 *
 * **그래서 그 둘은 «꽂힐 자리»의 잠금을 지난다** — 판정에 키를 만들지 않은 이유는 그대로다
 * (`panels/structure-tree.tsx`의 `TREE_SHORTCUTS`). 둘이 지나는 잠금이 **서로 다른 것**이
 * 이 파일에서 값으로 갈린다:
 *
 * | 조작 | 지나는 잠금 | 왜 |
 * |---|---|---|
 * | `패턴 넣기` | 고른 노드(고른 것이 없으면 루트) | 꽂히는 자리를 선택이 정한다 |
 * | `프리셋` | **페이지에 남의 잠금이 하나라도** | op이 `replace /root/children` 하나라 언제나 부딪친다 |
 *
 * 아래 `잠기지 않은 잎을 고르면 패턴만 살아난다`가 그 갈림을 한 자리에서 고정한다 —
 * 그 케이스가 없으면 둘을 같은 값으로 묶어도 안 죽는다.
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
import {
  BUILTIN_PRESETS,
  lockConflictOfOps,
  writeNodesEnvelope,
  type PageDocument,
  type PatchOp,
} from '@wirebound/schema'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type ApiClient } from '../../src/api/client'
import type { PageDetail, PatchResult } from '../../src/api/types'
import { ADMIN_FIXTURE } from '../admin-theme'
import type { ThemeManifest } from '@wirebound/theme-sdk'
import { adminThemeView } from '../theme-loader'
import type { RealtimeSocket } from '../../src/realtime/connection'
import { createConnectionIdHolder, type RealtimeSetup } from '../../src/realtime/context'
import { createEditChannel } from '../../src/realtime/edit-channel'
import { createLockChannel } from '../../src/realtime/lock-channel'
import type { NodeLockView, ServerFrame } from '../../src/realtime/protocol'
import type { EditorStore } from '../../src/store/editor-store'
import {
  HEAD_SEQ,
  OTHER_PAGE_TITLE,
  PAGE_ID,
  PROJECT_ID,
  deselect,
  openPage,
  pageDetail,
  pageDoc,
} from '../editor-harness'
import { isOff, treeTool } from '../panels/tree-row'
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


/**
 * **패턴 목록이 비지 않게 셸이 읽는 바인딩의 manifest 에 패턴 하나를 싣는다** — 목록이 비면 고르개가 «패턴이 없습니다» 로 서서,
 * 대조 케이스가 잠금 때문이 아니라 목록이 없어서 통과할 수 있다. 가짜가 닿았는지는 `themeReads` 로 센다.
 */
const patternTheme = { themeReads: 0 }
const getProjectTheme: ApiClient['getProjectTheme'] = async () => {
  patternTheme.themeReads += 1
  const patterns = { 'hero.plain': { name: '민 히어로', schema: { type: 'Section' } } }
  return { ...adminThemeView(), manifest: { ...ADMIN_FIXTURE.manifest, patterns } as ThemeManifest }
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

  // **프리셋 고르개가 목록을 조회한다.** 스텁하지 않으면 `notStubbed`가 던지고, 그 예외는
  // 고르개 안에서 삼켜져 *"목록이 비었다"*로 위장된다 — 그러면 이 파일의 대조 케이스가
  // 잠금 때문이 아니라 목록이 없어서 통과한다. 패턴 목록은 캔버스 테마의 manifest 가 준다(파일 머리의 목).
  const listPresets: ApiClient['listPresets'] = async () =>
    BUILTIN_PRESETS.map((preset) => ({
      id: `builtin:${preset.key}`,
      source: 'builtin' as const,
      name: preset.name,
      description: preset.description,
      nodes: [...preset.nodes],
    }))
  const listComments: ApiClient['listComments'] = async () => []

  await openPage(doc(), {
    realtime: setup,
    apiOverrides: { patchOps, getPage, listPresets, listComments, getProjectTheme },
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
  // 옛 «구조 편집» 툴바 자리 — 줄 행동 · 고르개 · 상태줄이 트리 영역 안에 선다(`../panels/tree-row.ts`).
  return structureRegion()
}

/** `structureAbilities`를 지나는 버튼 일곱. 늘어나면 아래 케이스가 새 버튼도 함께 본다. */
const TOOLS = ['안에 추가', '아래 추가', '삭제', '위로', '아래로', '들여쓰기', '내어쓰기']

function toolButton(name: string): HTMLElement {
  return treeTool(toolbar(), name)
}

/**
 * 지금 켜져 있는 도구들. **판정 밖의 둘은 여기 없다** — 아래 `gates`가 그것을 본다. 고른 줄이 없으면 줄 행동이 없어 켜진 것도 없다
 * (옛 툴바의 «일곱이 다 꺼졌다»와 같은 값 — 판정이 `NOTHING`이다).
 */
function live(): string[] {
  if (structureRegion().querySelector('.wb-shell-tree-row-picked') === null) return []
  return TOOLS.filter((name) => !isOff(toolButton(name)))
}

/**
 * 판정 밖의 둘이 지금 켜져 있는가. **둘을 한 값으로 읽는 것이 요점이다** — 이 파일이
 * 재려는 것 하나가 *"둘이 서로 다른 잠금을 지난다"*이므로 그 갈림이 한 줄에 보여야 한다.
 */
function gates(): { pattern: boolean; preset: boolean } {
  return {
    pattern: !isOff(toolButton('패턴 넣기')),
    preset: !isOff(toolButton('프리셋')),
  }
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
  it('셸의 테마 읽기가 닿는다 — 패턴 목록이 빈 판이 아니다', async () => {
    patternTheme.themeReads = 0
    await board()
    expect(patternTheme.themeReads).toBe(1)
  })

  /**
   * **이것이 도구가 새는 흔한 상태다.** 페이지를 열면 루트가 자동 선택되고, 남이 그 페이지의
   * 아무 노드나 잡으면 루트가 그 조상이라 `lockedBy(root)`가 그 잠금을 낸다.
   *
   * 도구가 잠금을 안 보면 여기서 `안에 추가` **하나**가 켜져 있고(루트라 나머지 여섯은 원래
   * 꺼진다), 그것을 누르면 `add /root/children/3`이 나가 **서버가 통과시킨다.**
   */
  it('루트가 선택된 채 남이 자손을 잠그면 하나 남았던 `안에 추가`까지 꺼진다', async () => {
    const view = await board()
    expect(view.store.getState().selectedNodeId).toBe('n-root')
    expect(live()).toEqual(['안에 추가'])

    view.lock([foreign('n-1')])

    expect(live()).toEqual([])
    // **판정 밖의 둘도 함께 꺼진다.** 그러지 않으면 아래 문장의 *"바꿀 수도"*가 거짓이다 —
    // 사용자가 그 문장을 읽고 탭을 누르면 살아 있는 «바꾸는» 버튼에 닿는다.
    expect(gates()).toEqual({ pattern: false, preset: false })
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
    expect(gates()).toEqual({ pattern: false, preset: false })
  })

  it('고른 노드 «자신»이 잠겨도 같다 — 조상·자손·자기 셋이 한 판정이다', async () => {
    const view = await board()
    select('Card')

    view.lock([foreign('n-box')])

    expect(live()).toEqual([])
    expect(gates()).toEqual({ pattern: false, preset: false })
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

  /**
   * **둘이 같은 잠금을 지나지 않는다는 것이 이 케이스의 전부다.**
   *
   * 고른 `n-a`는 잠긴 서브트리 밖이라 패턴이 꽂힐 자리에 남의 잠금이 없다 — 그래서 켜져
   * 있다. 프리셋은 다르다: op이 `replace /root/children` 하나라 **잠긴 `n-1`을 통째로
   * 지운다.** 서버가 그것을 423으로 거절하는 것을 대역이 그대로 잰다(아래 묶음).
   *
   * **이 케이스가 없으면 둘을 한 값으로 묶어도 안 죽는다** — 그리고 그렇게 묶은 구현은
   * 남이 아무 노드나 잡는 동안 **패턴 삽입을 페이지 통째로 얼린다.**
   */
  it('잠기지 않은 잎을 고르면 패턴만 살아난다 — 둘이 지나는 잠금이 다르다', async () => {
    const view = await board()
    view.lock([foreign('n-1')])

    select('Text')

    expect(gates()).toEqual({ pattern: true, preset: false })
  })

  /**
   * **선택이 없어도 되는 조작이지만 «자리»는 있다** — 그때 꽂히는 곳이 루트의 자식 끝이다
   * (`edit/pattern-insert.ts`의 `insertSpot`). 루트는 문서 안 모든 노드의 조상이라 남의
   * 잠금이 하나라도 있으면 고를 수 없고, 그래서 그 자리도 바꿀 수 없다 — `안에 추가`를
   * 루트에서 막는 것과 **같은 op 모양**(`add /root/children/N`)이므로 같은 답이어야 한다.
   *
   * **서버는 이것을 통과시킨다**(실측: `add /root/children/3` → 200). 그래도 막는 것은
   * `edit/structure-actions.ts`의 머리말이 적은 것과 같은 근거다 — 여기서 열어 두면
   * *"선택을 풀면 되는"* 탈출구가 생기고, 그것은 **어떻게 그 자리에 도착했는지가 할 수
   * 있는 것을 정하는** 바로 그 모양이다.
   */
  it('고른 것이 없어도 페이지에 잠금이 있으면 둘 다 꺼진다', async () => {
    const view = await board()
    view.lock([foreign('n-1')])

    deselect()

    expect(view.store.getState().selectedNodeId).toBeNull()
    expect(gates()).toEqual({ pattern: false, preset: false })
  })

  /**
   * **아홉이 다 회색이면 상태줄이 그 이유를 말해야 한다.** 고른 것이 없을 때의 문장
   * *"트리에서 노드를 고르면 편집할 수 있습니다"*는 이 상태에서 두 가지를 빠뜨린다 —
   * 지금 켜진 도구가 하나도 없다는 것과, 그 원인이 남의 잠금이라는 것.
   *
   * **여기서만 재지는 자리다.** 이 케이스가 잠그는 것은 **배선**이다 —
   * `useStructureCommands`가 `프리셋`을 끄는 데 쓰는 `pageLock`을 상태줄에도 넘기는가.
   * 안 넘기면 순수 함수 케이스는 전부 초록인 채 화면만 잠금을 모르는 문장으로 돌아간다.
   *
   * **문안을 글자로 다시 적지 않는다.** 그 자는 `../panels/toolbar-status.test.ts`가
   * 소유하고, 여기서 같은 문장을 한 벌 더 두면 문안을 고칠 때 **자가 둘이라 갈린다**
   * (*"판정이 두 벌이면 갈린다"*와 같은 부류다 — 다른 케이스의 단언을 글자 그대로 복사한
   * 케이스는 어느 변조에서도 혼자 죽지 않는다). 여기서 재는 축은 둘이다:
   * **잠금 소유자가 그 줄에 실렸는가**와 **잠금을 모르는 문장이 아닌가.**
   */
  it('그때 상태줄이 아홉이 회색인 이유를 말한다 — 이름과 함께', async () => {
    const view = await board()
    view.lock([foreign('n-1')])

    deselect()

    // 전제를 값으로 못박는다 — 아홉이 다 회색인 것이 이 문장이 서는 근거다.
    expect(live()).toEqual([])
    expect(gates()).toEqual({ pattern: false, preset: false })
    expect(statusLine()).toContain('보라')
    expect(statusLine()).not.toBe('트리에서 노드를 고르면 편집할 수 있습니다')
  })

  it('대조 — 잠금이 없으면 고른 것이 없어도 둘 다 켜져 있다', async () => {
    await board()

    deselect()

    expect(gates()).toEqual({ pattern: true, preset: true })
  })

  it('잠금이 풀리면 도구가 돌아온다', async () => {
    const view = await board()
    select('Card')
    view.lock([foreign('n-1')])
    expect(live()).toEqual([])

    view.lock([])

    expect(live()).toEqual(['안에 추가', '아래 추가', '삭제', '위로', '아래로'])
    expect(gates()).toEqual({ pattern: true, preset: true })
    expect(statusLine()).toBe('')
  })

  it('내 잠금은 판정을 끄지 않는다 — 소유자 판정은 스토어가 지난다', async () => {
    const view = await board()
    select('Card')

    view.lock([{ ...foreign('n-1'), userId: ME, userName: '테스터' }])

    expect(live()).toEqual(['안에 추가', '아래 추가', '삭제', '위로', '아래로'])
    // 프리셋까지 함께 본다 — `pageLock`도 같은 소유자 판정을 지나야 한다.
    expect(gates()).toEqual({ pattern: true, preset: true })
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
   * **판정 밖의 둘도 단축키를 갖는다**(`Alt`+`Shift`+`I`·`P`). 단축키 표가 그 둘의 판정
   * 자리를 `null`로 두면 `null`이 *"지날 것이 없다"*를 뜻해 **잠금도 안 본다.** 그래서 표가
   * 불린을 내는 함수를 들고 그 둘도 자기 값을 갖는다(`panels/structure-tree.tsx`의
   * `TREE_SHORTCUTS`).
   *
   * **잠금이 풀린 «뒤»를 봐야 이 케이스가 산다.** 잠긴 동안 목록이 없는 것만 보면 단축키
   * 게이트를 빼도 **아무것도 안 죽는다**: 아래 `고르개가 열린 뒤에 잠금이 오면` 케이스가 세운 렌더
   * 게이트가 그 창을 이미 덮고 있어, 단축키가 `adding`을 세워도 화면에는 안 보인다.
   * 갈리는 것은 **잠금이 풀린 다음**이다 — 막지 않았으면 그때 목록이 **뒤늦게 튀어나온다.**
   * (단축키 게이트를 `() => false`로 바꿔 두 형태를 나란히 재면 갈린다.)
   */
  it('잠긴 자리에서 누른 패턴·프리셋 단축키는 잠금이 풀려도 목록을 열지 않는다', async () => {
    const view = await board()
    select('Card')
    view.lock([foreign('n-box')])

    const card = row('Card')
    fireEvent.keyDown(card, { code: 'KeyI', altKey: true, shiftKey: true })
    fireEvent.keyDown(card, { code: 'KeyP', altKey: true, shiftKey: true })
    await settle()
    expect(screen.queryByRole('group', { name: '패턴 고르기' })).toBeNull()
    expect(screen.queryByRole('group', { name: '프리셋 고르기' })).toBeNull()

    // **여기가 갈리는 자리다.** 눌린 것이 기억돼 있었으면 지금 목록이 뜬다.
    view.lock([])

    expect(screen.queryByRole('group', { name: '패턴 고르기' })).toBeNull()
    expect(screen.queryByRole('group', { name: '프리셋 고르기' })).toBeNull()
    expect(view.calls).toEqual([])
  })

  it('대조 — 잠기지 않은 자리에서는 같은 단축키가 패턴 고르개를 연다', async () => {
    const view = await board()
    view.lock([foreign('n-1')])
    select('Text')

    fireEvent.keyDown(row('Text'), { code: 'KeyI', altKey: true, shiftKey: true })

    expect(await screen.findByRole('group', { name: '패턴 고르기' })).toBeTruthy()
    // 프리셋은 같은 판에서도 안 열린다 — 둘이 지나는 잠금이 다르다.
    fireEvent.keyDown(row('Text'), { code: 'KeyP', altKey: true, shiftKey: true })
    expect(screen.queryByRole('group', { name: '프리셋 고르기' })).toBeNull()
    expect(view.calls).toEqual([])
  })

  /**
   * **버튼을 끄는 것만으로는 안 닫히는 창이 있다.** 고르개를 연 **뒤에** 잠금이 도착하면
   * 목록이 그대로 남고, 거기서 `추가`를 누르면 편집이 나간다 — 회색으로 만든 버튼을
   * 우회하는 길이다. 그래서 고르개도 같은 값으로 그린다
   * (`panels/structure-toolbar.tsx`의 `visiblePicker`).
   *
   * **고르개 넷을 다 태운다.** 조건이 넷 다 다르므로(그 함수의 표) 하나만 재면 나머지가
   * 조용히 열려 있어도 안 죽는다.
   */
  it('패턴 고르개 — 열린 뒤에 잠금이 오면 목록이 사라진다', async () => {
    const view = await board()
    select('Card')
    fireEvent.click(toolButton('패턴 넣기'))
    expect(await screen.findByRole('group', { name: '패턴 고르기' })).toBeTruthy()

    view.lock([foreign('n-box')])

    expect(screen.queryByRole('group', { name: '패턴 고르기' })).toBeNull()
    expect(view.calls).toEqual([])
  })

  it('프리셋 고르개도 같다 — 잠금이 하나라도 오면 사라진다', async () => {
    const view = await board()
    fireEvent.click(toolButton('프리셋'))
    expect(await screen.findByRole('group', { name: '프리셋 고르기' })).toBeTruthy()

    // 프리셋은 페이지 통째라 **어느 노드가 잠기든** 부딪친다 — 고른 것과 무관하다.
    view.lock([foreign('n-1')])

    expect(screen.queryByRole('group', { name: '프리셋 고르기' })).toBeNull()
    expect(view.calls).toEqual([])
  })

  /**
   * **타입 고르개는 여는 버튼이 막혀도 창이 남는다.** `안에 추가`·`아래 추가`가 여는 것이라
   * **여는 버튼은 잠금에 막히지만**, 연 뒤에 잠금이 오는 창이 있다 — 고르개를 같은 값으로
   * 그리지 않으면 그때 목록에서 고른 것이 `add /root/children/1/children/2`로 나가
   * **423 + "편집 1개가 취소됐습니다"**를 받는다.
   *
   * **잠금이 풀리면 목록이 돌아오는 것도 함께 잰다.** `adding`을 비우지 않는 것이 판단이고,
   * 비우는 구현과 여기서 갈린다. **돌아오는 것은 «어느 고르개가 열려 있었는지»뿐이다** —
   * 그 안에서 고르던 것은 함께 돌아오지 않는다(아래 두 케이스가 그 값을 든다).
   */
  it('타입 고르개도 같다 — 사라지고, 잠금이 풀리면 돌아온다', async () => {
    const view = await board()
    select('Card')
    fireEvent.click(toolButton('안에 추가'))
    expect(await screen.findByRole('group', { name: '타입 고르기' })).toBeTruthy()

    view.lock([foreign('n-box')])
    expect(screen.queryByRole('group', { name: '타입 고르기' })).toBeNull()
    expect(view.calls).toEqual([])

    view.lock([])

    expect(screen.getByRole('group', { name: '타입 고르기' })).toBeTruthy()
  })

  /**
   * **여기서부터 둘은 잠금이 오갔다 온 뒤에 무엇이 남는지를 못박는다.**
   * 답이 서로 다르고, **그 갈림 자체가 판단이다.**
   *
   * | 무엇 | 잠금이 풀린 뒤 | 왜 |
   * |---|---|---|
   * | 고른 타입 · 고른 프리셋 | **되돌아간다** | «지금 꽂을 수 있는 것»에서 고른 값이라 초기화가 방어 가능하다 |
   * | 이름칸에 **친** 글자 | **그대로 있다** | 사용자 자신의 것이고 문서와 무관해 낡을 수가 없다 |
   *
   * *"잠깐 잠긴 사이에 사용자가 고르던 것을 잃지 않는다"*는 **그냥 두면 둘 다에 대해
   * 거짓이다** — 조건이 거짓인 동안 컴포넌트가 DOM에서 빠지므로 그 `useState`가 함께
   * 사라진다. 아랫줄이 살아남는 것은 그 문자열 하나를 `StructureTree`가 들기 때문이다.
   *
   * **근거는 `panels/structure-toolbar.tsx`의 `visiblePicker` 머리말이 갖는다** —
   * 두 축을 왜 갈랐는지가 거기 있다. 판단이 다시 바뀌면 이 두 케이스와 그 머리말을
   * **함께** 고쳐야 한다: 한쪽만 고치면 다시 말과 코드가 갈린다.
   */
  it('잠금이 오갔다 오면 타입 고르개의 고른 타입이 초깃값으로 되돌아간다', async () => {
    const view = await board()
    select('Card')
    fireEvent.click(toolButton('안에 추가'))
    const typeSelect = () =>
      within(screen.getByRole('group', { name: '타입 고르기' })).getByRole<HTMLSelectElement>(
        'combobox',
      )
    await screen.findByRole('group', { name: '타입 고르기' })

    const initial = typeSelect().value
    const other = [...typeSelect().options].map((option) => option.value).find((v) => v !== initial)
    // **전제를 값으로 못박는다.** 목록에 둘 이상 없으면 아래가 아무것도 재지 못한다.
    expect(other).toBeDefined()
    fireEvent.change(typeSelect(), { target: { value: other! } })
    expect(typeSelect().value).toBe(other)

    view.lock([foreign('n-box')])
    view.lock([])

    expect(typeSelect().value).toBe(initial)
    // **설명 줄도 함께 되돌아간다** — 그 줄은 고른 타입에서 나온다.
    const desc = screen
      .getByRole('group', { name: '타입 고르기' })
      .querySelector('.wb-shell-picker-desc')
    expect(desc?.textContent).toContain(initial)
  })

  /**
   * **친 글자는 살아남는다 — 위 케이스와 반대다.** 타입·프리셋 목록은 눈앞에 다시 있지만
   * 이름칸의 글자는 사용자가 **친** 것이라 다시 쳐 줄 사람이 없다. 그래서 그 문자열
   * 하나만 `StructureTree`가 들고 `PresetPicker`에 내려 준다.
   *
   * **함께 잰다: «살렸다»가 «목록을 DOM에 남겼다»가 아니라는 것.** 잠긴 동안 고르개는
   * 그대로 사라져야 하고(회색 버튼을 우회하는 길 — 위 «패턴 고르개» 케이스의 머리말), 서버로는
   * 여전히 아무것도 안 나가야 한다. 그 셋이 다 참일 때만 글자를 살리는 것이 **실패 방향을
   * 안 바꾼 것**이다.
   */
  it('프리셋 고르개가 사라졌다 와도 이름칸에 친 글자는 남는다', async () => {
    const view = await board()
    fireEvent.click(toolButton('프리셋'))
    const group = () => screen.getByRole('group', { name: '프리셋 고르기' })
    const nameInput = () => group().querySelector<HTMLInputElement>('.wb-shell-picker-input')!
    await screen.findByRole('group', { name: '프리셋 고르기' })

    fireEvent.change(nameInput(), { target: { value: '회원 목록 기본' } })
    expect(nameInput().value).toBe('회원 목록 기본')

    view.lock([foreign('n-1')])
    // **잠긴 동안에는 고르개가 DOM 에 없다** — 살린 것은 문자열 하나이지 목록이 아니다.
    expect(screen.queryByRole('group', { name: '프리셋 고르기' })).toBeNull()
    view.lock([])
    await settle()

    expect(nameInput().value).toBe('회원 목록 기본')
    // **서버로는 여전히 아무것도 안 나갔다** — 실패 방향이 안 바뀌었다는 값이다.
    expect(view.calls).toEqual([])
  })

  /**
   * **`아래 추가`가 여는 것도 같은 목록이지만 조건이 다르다**(`addAfter` — 루트가 아닌
   * 노드면 참이다). 하나만 재면 두 키 중 한쪽만 본 구현이 안 죽는다.
   */
  it('`아래 추가`로 연 목록도 사라진다 — 조건이 두 키다', async () => {
    const view = await board()
    select('Card')
    fireEvent.click(toolButton('아래 추가'))
    expect(await screen.findByRole('group', { name: '타입 고르기' })).toBeTruthy()

    view.lock([foreign('n-box')])

    expect(screen.queryByRole('group', { name: '타입 고르기' })).toBeNull()
    expect(view.calls).toEqual([])
  })

  /**
   * **남이 잡은 줄은 줄 행동도 끌기도 없다**(`panels/structure-tree.tsx`의 `StructureNode` — `open`). 고르기가 막힌 줄의 `…`를 열면 그
   * 줄을 못 골라 목록이 앞 선택의 명령으로 선다. 끌기는 그 노드를 뽑는 편집이 잠금에 부딪치는 판이다. 대조로 잠기지 않은 형제는 둘 다 있다.
   */
  it('남이 잡은 줄은 `+` · `…`가 없고 눌러 끌어도 들리지 않는다 — 잠기지 않은 형제는 있다', async () => {
    const view = await board()
    view.lock([foreign('n-box')])

    const rowBox = (type: string): HTMLElement =>
      within(structureRegion()).getByRole('button', { name: type }).closest<HTMLElement>('[data-tree-row]')!
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

    const card = within(structureRegion()).getByRole('button', { name: 'Card' }).closest<HTMLElement>('[data-tree-row]')!
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
    expect(within(structureRegion()).getByRole('button', { name: 'Card' })).toBeTruthy()
  })
})

/**
 * **아홉이 다 꺼지는 자리 — 사용자가 갇히는가.**
 *
 * 판정 밖의 둘까지 막으면 *"남의 잠금이 그 페이지의 모든 자리를 덮은"* 문서에서 구조
 * 도구모음이 통째로 죽는다. **그것은 잠금의 뜻 그대로이지만**, 화면이 그 상태에서 정말로
 * 아무 데도 못 가면 그것은 고장이다. 그래서 **남는 길을 값으로 고정한다.**
 *
 * 여기서 재는 것은 *"구조 편집이 죽어도 셸은 산다"*이지 그 길들의 동작이 아니다 — 뷰 모드와
 * 페이지 이동은 각자의 케이스가 갖는다.
 */
describe('막다른 길이 아니다 — 구조 편집만 얼고 셸은 산다', () => {
  it('페이지의 모든 자리가 잠기면 도구 아홉과 트리 줄이 전부 꺼진다', async () => {
    const view = await board()

    view.lock([foreign('n-a'), foreign('n-box'), foreign('n-c')])

    expect(live()).toEqual([])
    expect(gates()).toEqual({ pattern: false, preset: false })
    // 트리 줄도 전부 꺼진다 — 고를 수 있는 노드가 하나도 없다. 줄 행동 · 뿌리 `+`의 단추(행동 메뉴를 여는 것)는 줄이 아니다 —
    // 그 안의 항목이 꺼진 것은 위 `live` · `gates`가 잰다.
    const rows = within(structureRegion())
      .getAllByRole<HTMLButtonElement>('button')
      .filter((button) => button.getAttribute('aria-haspopup') !== 'menu')
    expect(rows.filter((button) => !button.disabled)).toEqual([])
    expect(statusLine()).toBe('보라님이 편집 중이라 고를 수도 바꿀 수도 없습니다')
  })

  it('그래도 뷰 모드와 다른 페이지는 남는다 — 이유는 상태줄이 이름과 함께 말한다', async () => {
    const view = await board()

    view.lock([foreign('n-a'), foreign('n-box'), foreign('n-c')])

    const modes = within(screen.getByRole('group', { name: '모드' })).getAllByRole<HTMLButtonElement>(
      'button',
    )
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
  const ENVELOPE = writeNodesEnvelope([{ id: 'src', type: 'Divider' }], 1)

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
