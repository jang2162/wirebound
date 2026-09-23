/**
 * **역할이 켜 둔 화면에 닿는다**(이월 5차) — 서버가 그 사람의 연결에 `membership-changed`를 보내면 셸이 프로젝트를 다시 읽고
 * `canEdit`이 새 값으로 선다. 그리고 **F4** — 선택이 잠금을 걸지 않는 사람(viewer)은 남이 잡은 노드와 그 조상도 고른다.
 *
 * 값은 [jsdom]이다. 같은 절차의 Chrome 값은 보고 (e) — 여기 적지 않는다(두 벌).
 *
 * 자리 케이스(«어느 입구가 숨었나 · 꺼졌나»)는 `viewer-entries.test.tsx`가 **실행 중에 내린 판**으로도 잰다. 이 파일은 그
 * 판이 못 말하는 것 — **바뀌는 순간**(잠금 · 통지 · 다시 읽기가 실패하면 · 끊겼다 붙으면 · 답이 엇갈려 오면)을 잰다.
 * **그래서 이 파일은 그 자리들(메뉴 · 구조 툴바 · 되돌리기 · 속성 · 상호작용 · 코멘트)을 단언하지 않는다** — 단언하면 그 자리의
 * 변조가 이 파일과 그 판에서 함께 죽어 어느 쪽이 무엇을 소유하는지가 흐려진다. «역할이 섰다»의 표지로는 그 파일이 안 보는
 * 자리 — **테마 고르개**(owner 전용 · `chooseTheme`)와 통지 문장을 쓴다.
 */
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { PageDocument } from '@wirebound/schema'
import { ApiError } from '../../src/api/client'
import type { ProjectDetail, ProjectRole } from '../../src/api/types'
import { OTHER_PAGE_ID, PAGE_ID, PROJECT_ID, PROJECT_NAME, openPage, pageDoc, waitForNode } from '../editor-harness'
import { fakeRealtime, type FakeRealtime } from '../fake-realtime'
import '../../src/catalog-setup'

const ME = 'u-1'

const DOC: PageDocument = pageDoc({
  id: 'n-root',
  type: 'Page',
  children: [
    { id: 'n-card', type: 'Card', props: { title: '회원 정보' } },
    { id: 'n-btn', type: 'Button', props: { label: '검색' } },
  ],
})

const OTHER_DOC: PageDocument = pageDoc({
  id: 'n-root2',
  type: 'Page',
  children: [{ id: 'n-x', type: 'Card', props: { title: '상세' } }],
})

const project = (role: ProjectRole): ProjectDetail => ({ id: PROJECT_ID, name: PROJECT_NAME, slug: 'admin-console', description: null, role })

const MEMBERSHIP = { type: 'membership-changed', projectId: PROJECT_ID }
/** 밥이 그 노드를 쥐었다 — 서버의 `locks` 프레임(프로젝트 전부). */
const bobHolds = (pageId: string, nodeId: string): Record<string, unknown> => ({
  type: 'locks',
  projectId: PROJECT_ID,
  locks: [{ pageId, nodeId, userId: 'u-2', userName: '밥' }],
})

/** 역할을 **바꿀 수 있는** 가짜 서버 — `getProject`가 그때의 값을 낸다. `fail`을 세우면 그 실패를 던진다. */
interface Server {
  role: ProjectRole
  fail: unknown
  reads: number
  /** 세우면 **다음 한 번의** 조회가 이것을 기다린 뒤 답한다(역할은 부른 순간의 값). */
  hold?: Promise<void>
}

async function open(server: Server, docs: Record<string, PageDocument> = {}): Promise<FakeRealtime> {
  const rt = await mount(server, docs)
  rt.open()
  return rt
}

/** 셸을 띄우되 **소켓은 아직 안 열렸다**(룸에 들기 전 — 리뷰 R1 의 여는 창). */
async function mount(server: Server, docs: Record<string, PageDocument> = {}): Promise<FakeRealtime> {
  const rt = fakeRealtime(PROJECT_ID, ME)
  await openPage(DOC, {
    docs,
    realtime: rt.realtime,
    apiOverrides: {
      getProject: async () => {
        server.reads += 1
        const { role, fail, hold } = server
        server.hold = undefined
        if (hold !== undefined) await hold
        if (fail !== null) throw fail
        return project(role)
      },
    },
  })
  return rt
}

function pick(nodeId: string): void {
  const el = document.body.querySelector(`.wb-shell-canvas [data-wb-id="${nodeId}"]`)
  if (el === null) throw new Error(`캔버스에 ${nodeId} 가 없다`)
  fireEvent.click(el)
}

/** 테마 고르개가 켜졌나(owner 전용) — `null`이면 아직 안 섰다. */
const themeOn = (): boolean | null => {
  const select = screen.queryByRole('combobox', { name: '테마' }) as HTMLSelectElement | null
  return select === null ? null : !select.disabled
}
const said = (lead: string): boolean => notice().some((text) => text.startsWith(lead))
const titleBox = (): HTMLInputElement => within(screen.getByRole('tabpanel')).getByRole('textbox', { name: '제목' }) as HTMLInputElement
const notice = (): string[] => screen.queryAllByRole('status').map((el) => el.textContent ?? '')
const treeRow = (label: string): HTMLButtonElement =>
  within(screen.getByRole('region', { name: '구조 트리' })).getByRole('button', { name: label }) as HTMLButtonElement

describe('역할이 실행 중에 바뀐다 — 새로고침 없이(이월 5차)', () => {
  /**
   * 혼자 죽는 변조 둘: 통지의 두 문장이 뒤바뀐다 · `useNodeLock`이 `canHold`가 거짓이면 잡은 자리를 **안 놓는다**
   * (`viewer-entries` «잠금»은 **안 보냄**을 재고 이쪽은 **놓음**을 잰다 — 갈린다). 승격이 **곧장 다시 잡지 않는 것**은 아래 R3
   * 케이스의 축이다(여기서도 함께 죽는다).
   */
  it('editor → viewer → editor — 잡은 자리를 놓고, 올라와도 곧장 잡지 않고, 바뀐 순간을 말한다(입구는 viewer-entries 의 내린 판)', async () => {
    const server: Server = { role: 'editor', fail: null, reads: 0 }
    const rt = await open(server)
    pick('n-card')
    await waitFor(() => expect(rt.frames()).toEqual(['lock n-card']))
    expect(said('편집 권한')).toBe(false)

    const readsBefore = server.reads
    server.role = 'viewer'
    rt.deliver(MEMBERSHIP)
    await waitFor(() => expect(said('편집 권한이 없어져')).toBe(true))
    // 선택은 그대로(카드의 속성이 그대로 보인다) · 잡은 자리는 놓는다.
    expect(titleBox().value).toBe('회원 정보')
    expect(rt.frames()).toEqual(['lock n-card', 'unlock'])

    server.role = 'editor'
    rt.deliver(MEMBERSHIP)
    await waitFor(() => expect(said('편집 권한이 생겨')).toBe(true))
    // 선택 · 속성은 그대로다. 잡는 것은 사용자의 다음 행동이다 — 그 축은 아래 R3 케이스가 소유한다.
    expect(titleBox().value).toBe('회원 정보')
    // 신호마다 한 번 읽는다.
    expect(server.reads - readsBefore).toBe(2)
  })

  /** 혼자 죽는 변조: 다시 읽기의 404 갈래를 지운다(그러면 «역할을 모른다»로 간다 — 셸이 남는다). */
  it('멤버에서 빠졌으면(다시 읽기 404) 셸째 내려가 «설계서를 열지 못했습니다» — 연결도 닫는다', async () => {
    const server: Server = { role: 'editor', fail: null, reads: 0 }
    const rt = await open(server)

    server.fail = new ApiError(404, 'not-found', '프로젝트를 찾을 수 없습니다', [], true)
    rt.deliver(MEMBERSHIP)

    expect(await screen.findByRole('heading', { name: '설계서를 열지 못했습니다' })).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toBe('프로젝트를 찾을 수 없습니다')
    expect(rt.closed()).toBe(true)
  })

  /** 혼자 죽는 변조: 멤버십 신호 뒤의 다시 읽기가 실패해도 `roleKnown`을 안 내린다(앞 역할 그대로 선다). */
  it('다시 읽기가 실패하면(연결 · 시간 제한) 역할을 모른다 — 고칠 수 없는 쪽으로 서고 그렇다고 말한다', async () => {
    const server: Server = { role: 'owner', fail: null, reads: 0 }
    const rt = await open(server)
    await waitFor(() => expect(themeOn()).toBe(true))

    server.fail = new ApiError(0, 'internal', '서버에 연결할 수 없습니다')
    rt.deliver(MEMBERSHIP)

    // 역할을 모르면 판정 함수의 «모르는 값» — owner 의 고르개까지 꺼진다.
    await waitFor(() => expect(themeOn()).toBe(false))
    expect(said('권한이 바뀌었는데 확인하지 못해')).toBe(true)
    // 셸은 남는다 — 읽기는 그대로다.
    expect(screen.getByRole('heading', { name: PROJECT_NAME })).toBeTruthy()

    // 다음 신호가 성공하면 돌아온다.
    server.fail = null
    rt.deliver(MEMBERSHIP)
    await waitFor(() => expect(themeOn()).toBe(true))
  })

  /**
   * 끊긴 동안 바뀐 역할 — 그 사이의 `membership-changed`는 사라졌다. 다시 붙으면(두 번째 `open`) 다시 읽는다. 그 다시 읽기의
   * 실패는 **조용하다**(바뀌었다는 신호가 없다).
   *
   * 혼자 죽는 변조 둘: 셸의 재연결 콜백이 프로젝트를 다시 읽지 않는다 · 재연결의 실패도 «역할을 모른다»로 보낸다.
   */
  it('끊긴 동안 바뀐 역할은 다시 붙을 때 닿는다 — 그 다시 읽기가 실패하면 조용히 앞 역할이다', async () => {
    const server: Server = { role: 'owner', fail: null, reads: 0 }
    const rt = await open(server)
    await waitFor(() => expect(themeOn()).toBe(true))

    // 조용한 실패 먼저.
    server.fail = new ApiError(0, 'internal', '서버에 연결할 수 없습니다')
    const readsBefore = server.reads
    rt.reconnect()
    await waitFor(() => expect(server.reads).toBe(readsBefore + 1))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(themeOn()).toBe(true)
    expect(notice().filter((text) => text.includes('권한'))).toEqual([])

    server.fail = null
    server.role = 'viewer'
    rt.reconnect()
    await waitFor(() => expect(themeOn()).toBe(false))
  })

  /** 혼자 죽는 변조: 다시 읽기의 성공 갈래가 차례(`reads`)를 안 본다. */
  it('두 신호의 답이 거꾸로 오면 늦게 낸 조회의 답이 선다', async () => {
    const server: Server = { role: 'owner', fail: null, reads: 0 }
    const rt = await open(server)
    await waitFor(() => expect(themeOn()).toBe(true))

    // 첫 신호의 조회(viewer)는 붙잡고, 둘째(editor)는 곧장 답한다 — 첫 답이 나중에 온다.
    let release = (): void => {}
    server.hold = new Promise<void>((resolve) => {
      release = resolve
    })
    const readsBefore = server.reads
    server.role = 'viewer'
    rt.deliver(MEMBERSHIP)
    server.role = 'owner'
    rt.deliver(MEMBERSHIP)
    await waitFor(() => expect(server.reads).toBe(readsBefore + 2))
    release()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(themeOn()).toBe(true)
    expect(notice().filter((text) => text.includes('권한'))).toEqual([])
  })
})

/**
 * **리뷰 R1 · R2 — 신호가 닿지 않는 창.** 서버는 룸에 든 연결에만 `membership-changed`를 보낸다. 그래서 첫 조회의 답과 룸 참가 사이의
 * 변경은 누구도 안 알리고(R1), 신호의 조회가 뒤의 조회에 밀려 그 조회가 실패하면 신호가 왔다는 사실이 사라졌다(R2).
 */
describe('신호가 닿지 않는 창(리뷰 R1 · R2)', () => {
  /** 혼자 죽는 변조: 셸이 `joined`에 다시 읽지 않는다(`use-realtime.ts`의 `joined` 갈래). */
  it('첫 조회와 룸 참가 사이에 강등되면 — 룸에 든 순간 다시 읽어 닿는다', async () => {
    const server: Server = { role: 'owner', fail: null, reads: 0 }
    const rt = await mount(server)
    await waitFor(() => expect(themeOn()).toBe(true))

    // 첫 조회의 답은 owner — 룸에 들기 전에 강등이 커밋됐다(신호는 룸에 든 연결에만 간다 — 이 연결은 못 받는다).
    server.role = 'viewer'
    rt.open()

    await waitFor(() => expect(themeOn()).toBe(false))
    expect(said('편집 권한이 없어져')).toBe(true)
    expect(server.reads).toBe(2)
  })

  /** 혼자 죽는 변조: 셸이 핸드셰이크 거절(열리지 못하고 닫힘)에 다시 읽지 않는다. */
  it('룸에 들기 전에 멤버에서 빠지면 — 핸드셰이크가 거절된 순간 다시 읽어 셸째 내려가고 재연결을 멈춘다', async () => {
    const server: Server = { role: 'editor', fail: null, reads: 0 }
    const rt = await mount(server)

    server.fail = new ApiError(404, 'not-found', '프로젝트를 찾을 수 없습니다', [], true)
    rt.refuse()
    expect(rt.reconnectPending()).toBe(true)

    expect(await screen.findByRole('heading', { name: '설계서를 열지 못했습니다' })).toBeTruthy()
    // 셸이 내려가며 연결을 닫는다 — 맡겨 둔 재연결이 취소된다(`close()` — 앞 판은 13초에 5번 되풀이했다).
    expect(rt.reconnectPending()).toBe(false)
    expect(server.reads).toBe(2)
  })

  /**
   * 신호의 조회가 붙잡힌 사이 끊겼다 붙고, 룸에 든 뒤의 조회가 실패한다 — 그 뒤 신호의 답(viewer)이 늦게 오지만 차례가 지나 버려진다.
   * 혼자 죽는 변조: 실패의 판정이 **그 차례의 원인**만 본다(앞 판 — `signalUnanswered`를 안 본다).
   */
  it('신호의 조회가 밀리고 뒤의 조회가 실패하면 — 역할을 모른다(앞 역할로 조용히 서지 않는다)', async () => {
    const server: Server = { role: 'owner', fail: null, reads: 0 }
    const rt = await open(server)
    await waitFor(() => expect(themeOn()).toBe(true))

    let release = (): void => {}
    server.hold = new Promise<void>((resolve) => {
      release = resolve
    })
    const readsBefore = server.reads
    server.role = 'viewer'
    rt.deliver(MEMBERSHIP)
    server.fail = new ApiError(503, 'internal', '잠시 후 다시 시도해 주세요')
    rt.reconnect()
    await waitFor(() => expect(server.reads).toBe(readsBefore + 2))
    release()

    await waitFor(() => expect(themeOn()).toBe(false))
    expect(said('권한이 바뀌었는데 확인하지 못해')).toBe(true)

    // 다음 성공이 풀어 준다(그때의 역할로).
    server.fail = null
    server.role = 'owner'
    rt.reconnect()
    await waitFor(() => expect(themeOn()).toBe(true))
  })
})

/**
 * **리뷰 R3 · 2회 LK — 잡는 시각을 사용자가 정한다.** 승격 · 서버가 거절한 잠금은 곧장 잡지 않고 «잡지 않은 선택»으로 남는다
 * (`lock-channel.ts`). 채널 단독의 축(거절의 세 경로 · 옮겨 간 뒤의 거절)은 `realtime/lock-channel.test.ts`가 잰다 — 여기는 셸째로 잇는다.
 */
describe('잡는 시각을 사용자가 정한다(리뷰 R3 · 2회 LK)', () => {
  const carolHolds = (nodeId: string): Record<string, unknown> => ({
    type: 'locks',
    projectId: PROJECT_ID,
    locks: [{ pageId: PAGE_ID, nodeId, userId: ME, userName: '캐럴' }],
  })
  const noLocks = { type: 'locks', projectId: PROJECT_ID, locks: [] }

  function editTitle(value: string): void {
    const input = titleBox()
    fireEvent.change(input, { target: { value } })
    fireEvent.keyDown(input, { key: 'Enter' })
  }

  /**
   * 혼자 죽는 변조: `useNodeLock`이 승격 순간 막히지 않은 자리를 곧장 잡는다(앞 판). 잠금 통로의 `reannounce`가 잡지 않은 선택을
   * 잡는 변조에는 `lock-channel`의 «거절된 자리» · 아래 거절 케이스와 함께 죽는다(다시 붙는 축의 주인은 아래 거절 케이스).
   */
  it('viewer → editor — 고른 카드는 잡지 않은 채 남고(다시 붙어도), 첫 편집이 `lock` 다음 `patch`로 잡는다', async () => {
    const server: Server = { role: 'viewer', fail: null, reads: 0 }
    const rt = await open(server)
    pick('n-card')

    server.role = 'editor'
    rt.deliver(MEMBERSHIP)
    await waitFor(() => expect(said('편집 권한이 생겨')).toBe(true))
    expect(treeRow('Card').getAttribute('aria-current')).toBe('true')
    expect(titleBox().disabled).toBe(false)
    expect(rt.frames()).toEqual([])
    rt.reconnect()
    expect(rt.frames()).toEqual([])

    editTitle('회원 정보2')
    await waitFor(() => expect(rt.frames()).toEqual(['lock n-card', 'patch']))
  })

  /**
   * **다시 붙어 보낸 `lock`을 서버가 거절한다**(이월 5차 2회 LK — C 리뷰 2 N1 의 셸 판). 끊긴 동안 밥이 카드를 잡았다 — 캐럴의
   * 재알림은 그대로 나가고(`reannounce`) 서버가 거절하면 «잡지 않은 선택»이 된다: 또 다시 붙어도 안 보내고, 루트로 옮겨도 놓을
   * 것이 없고(서버가 이미 놓았다), 밥이 놓은 뒤 첫 편집이 잡는다. 앞 판의 R4(목록에서 빠지면 잃음 — `observe`)는 이 판으로
   * 바뀌었다 — 서버가 판정하므로 목록을 보지 않는다. 혼자 죽는 변조: `use-realtime`이 `lock-denied`를 잠금 통로에 안 넘긴다.
   */
  it('다시 붙어 보낸 `lock`을 서버가 거절하면 잡지 않은 선택이다 — 또 붙어도 안 보내고, 밥이 놓은 뒤 첫 편집이 잡는다', async () => {
    const server: Server = { role: 'editor', fail: null, reads: 0 }
    const rt = await open(server)
    pick('n-card')
    await waitFor(() => expect(rt.frames()).toEqual(['lock n-card']))
    rt.deliver(carolHolds('n-card'))

    let reads = server.reads
    rt.reconnect()
    await waitFor(() => expect(server.reads).toBe(reads + 1))
    expect(rt.frames()).toEqual(['lock n-card', 'lock n-card'])
    rt.deliver({ type: 'lock-denied', projectId: PROJECT_ID, pageId: PAGE_ID, nodeId: 'n-card', lockId: rt.lastLockId() })
    rt.deliver(bobHolds(PAGE_ID, 'n-card'))
    await waitFor(() => expect(titleBox().disabled).toBe(true))
    expect(treeRow('Card').getAttribute('aria-current')).toBe('true')

    reads = server.reads
    rt.reconnect()
    await waitFor(() => expect(server.reads).toBe(reads + 1))
    rt.deliver(bobHolds(PAGE_ID, 'n-card'))
    expect(rt.frames()).toEqual(['lock n-card', 'lock n-card'])

    rt.deliver(noLocks)
    await waitFor(() => expect(titleBox().disabled).toBe(false))
    editTitle('회원 정보3')
    await waitFor(() => expect(rt.frames()).toEqual(['lock n-card', 'lock n-card', 'lock n-card', 'patch']))
  })
})

describe('F4 — 선택이 잠금을 걸지 않는 사람은 남이 잡은 자리도 고른다', () => {
  /** 혼자 죽는 변조 둘: `selectNode`가 `selectionClaims`를 안 본다 · 구조 트리의 `disabled`가 `lockOf`를 본다. */
  it('viewer — 밥이 쥔 카드를 캔버스 · 구조 트리에서 고르고 속성 값을 읽는다. 배지는 선다 · 프레임 0', async () => {
    const server: Server = { role: 'viewer', fail: null, reads: 0 }
    const rt = await open(server)
    rt.deliver(bobHolds(PAGE_ID, 'n-card'))
    await waitFor(() => expect(screen.getByText('밥 편집 중')).toBeTruthy())

    expect(treeRow('Card').disabled).toBe(false)
    expect(treeRow('Page').disabled).toBe(false)
    pick('n-card')
    expect(titleBox().value).toBe('회원 정보')
    pick('n-btn')
    fireEvent.click(treeRow('Card'))
    expect(treeRow('Card').getAttribute('aria-current')).toBe('true')
    expect(titleBox().value).toBe('회원 정보')
    expect(rt.frames()).toEqual([])

    // 대조: editor 에게는 막힌다(앞 판 그대로).
    cleanup()
    const editor: Server = { role: 'editor', fail: null, reads: 0 }
    const rt2 = await open(editor)
    rt2.deliver(bobHolds(PAGE_ID, 'n-card'))
    await waitFor(() => expect(treeRow('Card').disabled).toBe(true))
    pick('n-card')
    expect(treeRow('Card').getAttribute('aria-current')).toBeNull()
  })

  /** 혼자 죽는 변조: 여는 경로의 루트 자동 선택(`#selectionFor`)이 `selectionClaims`를 안 본다. */
  it('viewer — 밥이 쥔 페이지를 열어도 루트를 고른 채 시작한다(editor 는 앞 판대로 비어 시작한다)', async () => {
    for (const [role, rootPicked] of [
      ['viewer', 'true'],
      ['editor', null],
    ] as const) {
      const server: Server = { role, fail: null, reads: 0 }
      const rt = await open(server, { [OTHER_PAGE_ID]: OTHER_DOC })
      rt.deliver(bobHolds(OTHER_PAGE_ID, 'n-x'))
      fireEvent.click(screen.getByRole('link', { name: '회원 상세' }))
      await waitForNode('n-root2')
      await waitFor(() => expect(treeRow('Page').getAttribute('aria-current'), role).toBe(rootPicked))
      cleanup()
    }
  })

  /**
   * 승격 순간 — 고른 자리를 밥이 쥐었으면 **놓고 잡지 않는다**(겹친 잠금이면 밥이 막힌다). 혼자 죽는 변조 둘:
   * `setSelectionClaims`가 막힌 선택을 안 놓는다 · `useNodeLock`이 보내기 전에 지금 막혔는지 안 묻는다(한 커밋의 창).
   */
  it('viewer → editor 승격 — 밥이 쥔 카드를 고른 채였으면 선택을 놓고 `lock`을 안 보낸다', async () => {
    const server: Server = { role: 'viewer', fail: null, reads: 0 }
    const rt = await open(server)
    rt.deliver(bobHolds(PAGE_ID, 'n-card'))
    await waitFor(() => expect(screen.getByText('밥 편집 중')).toBeTruthy())
    pick('n-card')
    expect(treeRow('Card').getAttribute('aria-current')).toBe('true')

    server.role = 'editor'
    rt.deliver(MEMBERSHIP)
    await waitFor(() => expect(said('편집 권한이 생겨')).toBe(true))
    expect(treeRow('Card').getAttribute('aria-current')).toBeNull()
    expect(treeRow('Card').disabled).toBe(true)
    expect(within(screen.getByRole('tabpanel')).getByText('노드를 고르면 속성이 보입니다')).toBeTruthy()
    expect(rt.frames()).toEqual([])
  })
})
