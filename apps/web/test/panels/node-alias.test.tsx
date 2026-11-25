/**
 * **노드 별칭을 고치는 자리**(설계서 「설계서 화면 구조」의 노드 별칭) — 속성 패널 맨 아래 «별칭» 칸 · 구조 트리 줄의 더블클릭 · F2 ·
 * 줄 `…` «별칭 바꾸기». 넷 다 편집 하나(`add` · `replace` · `remove` `/…/alias` — `src/edit/ops.ts` 의 `aliasOps`)를 지금 편집 길로
 * 보낸다 — 되돌리기 한 번 · 남의 잠금이면 막힘.
 *
 * 서버 대역은 진짜 잠금 판정(`lockConflictOfOps`)을 돈다(`../lock/props-lock.test.tsx` 와 같은 꼴). 줄은 노드 id 로 찾는다
 * (`data-tree-id`) — 줄의 접근 이름은 이 파일이 재는 것이 아니다.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { applyOps, lockConflictOfOps, type PageDocument, type PatchOp } from '@wirebound/schema'
import { describe, expect, it } from 'vitest'
import { ApiError, type ApiClient } from '../../src/api/client'
import type { PageDetail, PatchResult } from '../../src/api/types'
import type { RealtimeSocket } from '../../src/realtime/connection'
import { createConnectionIdHolder, type RealtimeSetup } from '../../src/realtime/context'
import { createEditChannel } from '../../src/realtime/edit-channel'
import { createLockChannel } from '../../src/realtime/lock-channel'
import type { NodeLockView, ServerFrame } from '../../src/realtime/protocol'
import { HEAD_SEQ, PAGE_ID, PROJECT_ID, canvasDocument, openPage, pageDetail, pageDoc } from '../editor-harness'
import { DROPPED_DRAFT_NOTICE } from '../../src/panels/property-panel'
import { ALIAS_MANY_NOTICE } from '../../src/shell/editor-keys'
import { isOff, rowAction } from './tree-row'
import '../../src/catalog-setup'

const ME = 'u-1'

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
 * n-root  (Page)
 *   n-card  (Card)          ← 별칭 «회원 카드»
 *     n-save  (Button)
 *   n-text  (Text)
 * ```
 */
function doc(): PageDocument {
  return pageDoc({
    id: 'n-root',
    type: 'Page',
    children: [
      {
        id: 'n-card',
        type: 'Card',
        alias: '회원 카드',
        props: { title: '회원' },
        children: [{ id: 'n-save', type: 'Button', props: { label: '저장' } }],
      },
      { id: 'n-text', type: 'Text', props: { content: '안내' } },
    ],
  })
}

interface Board {
  calls: PatchOp[][]
  lock: (locks: NodeLockView[]) => void
  /** 같은 사람의 다른 탭이 낸 편집 — 서버 문서에 적용하고 그 revision 의 `page-changed` 프레임을 보낸다. */
  peer: (ops: PatchOp[]) => void
}

async function board(): Promise<Board> {
  const sockets: FakeSocket[] = []
  const calls: PatchOp[][] = []
  let live: NodeLockView[] = []
  let seq = HEAD_SEQ
  let held = doc()

  const patchOps: ApiClient['patchOps'] = async (_projectId, _pageId, body) => {
    calls.push(body.ops)
    const conflict = lockConflictOfOps({ document: held, locks: live, ops: body.ops, viewerUserId: ME })
    if (conflict !== null) throw new ApiError(423, 'locked', `${conflict.userName}님이 편집 중인 영역입니다`)
    const { invertOps } = await import('@wirebound/schema')
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
    calls,
    peer: (ops) => {
      held = applyOps(held, ops)
      seq += 1
      const frame: ServerFrame = {
        type: 'page-changed',
        projectId: PROJECT_ID,
        pageId: PAGE_ID,
        seq,
        ops,
        warnings: [],
      }
      act(() => {
        sockets.at(-1)?.onmessage?.({ data: JSON.stringify(frame) })
      })
    },
    lock: (locks) => {
      live = locks
      const frame: ServerFrame = { type: 'locks', projectId: PROJECT_ID, locks }
      act(() => {
        sockets.at(-1)?.onmessage?.({ data: JSON.stringify(frame) })
      })
    },
  }
}

function structureRegion(): HTMLElement {
  return screen.getByRole('region', { name: '구조 트리' })
}

function panel(): HTMLElement {
  return screen.getByRole('complementary', { name: '우측 패널' })
}

/** 노드 id 의 줄 단추. */
function rowButton(nodeId: string): HTMLButtonElement {
  const button = structureRegion().querySelector<HTMLButtonElement>(`[data-tree-id="${nodeId}"] > .wb-shell-structure-node`)
  if (button === null) throw new Error(`${nodeId} 줄이 없다`)
  return button
}

function aliasField(): HTMLInputElement {
  return within(panel()).getByRole<HTMLInputElement>('textbox', { name: '별칭' })
}

/** 구조 트리에 선 별칭 입력. 없으면 `null`. */
/** 정보 통지 한 칸(`shell/info-notice.tsx`)의 글. */
function infoTexts(): string[] {
  return screen
    .queryAllByRole('status')
    .filter((element) => element.classList.contains('wb-shell-info-notice'))
    .map((element) => element.textContent ?? '')
}

function treeInput(): HTMLInputElement | null {
  return within(structureRegion()).queryByRole<HTMLInputElement>('textbox', { name: '별칭' })
}

function historyButton(name: '되돌리기' | '다시 실행'): HTMLButtonElement {
  return within(screen.getByRole('group', { name: '편집 이력' })).getByRole<HTMLButtonElement>('button', { name })
}

const CARD = '/root/children/0/alias'
const SAVE = '/root/children/0/children/0/alias'

describe('속성 패널 «별칭» 칸', () => {
  it('머리 카드 안 첫 칸이다 — 고른 노드의 별칭을 보이고, 바꿔 떠나면 `replace` 하나를 보낸다', async () => {
    const b = await board()
    fireEvent.click(rowButton('n-card'))

    const rows = panel().querySelectorAll('.wb-shell-prop')
    expect(rows.length).toBeGreaterThan(1)
    // 별칭 칸은 칸들 위 머리 카드(`src/panels/node-head.tsx`) 안이다 — 속성 칸 줄 가운데 첫째.
    expect(rows[0]?.querySelector('.wb-shell-prop-label')?.textContent).toBe('별칭')
    expect(rows[0]?.closest('.wb-shell-node-head')).not.toBeNull()
    expect(aliasField().value).toBe('회원 카드')

    fireEvent.change(aliasField(), { target: { value: '회원 정보 카드' } })
    fireEvent.blur(aliasField())
    await waitFor(() => expect(b.calls).toEqual([[{ op: 'replace', path: CARD, value: '회원 정보 카드' }]]))
  })

  it('별칭이 없던 노드는 `add` — 패널 제목이 `타입 (별칭)` 이 된다', async () => {
    const b = await board()
    fireEvent.click(rowButton('n-save'))
    expect(aliasField().value).toBe('')
    expect(panel().querySelector('.wb-shell-panel-title')?.textContent).toBe('Button')

    fireEvent.change(aliasField(), { target: { value: '머리 저장' } })
    fireEvent.keyDown(aliasField(), { key: 'Enter' })
    await waitFor(() => expect(b.calls).toEqual([[{ op: 'add', path: SAVE, value: '머리 저장' }]]))
    expect(panel().querySelector('.wb-shell-panel-title')?.textContent).toBe('Button (머리 저장)')
  })

  it('비우면 `remove`', async () => {
    const b = await board()
    fireEvent.click(rowButton('n-card'))
    fireEvent.change(aliasField(), { target: { value: '  ' } })
    fireEvent.blur(aliasField())
    await waitFor(() => expect(b.calls).toEqual([[{ op: 'remove', path: CARD }]]))
  })

  it('편집할 속성이 없는 컴포넌트(Page)에도 선다', async () => {
    await board()
    fireEvent.click(rowButton('n-root'))
    expect(aliasField().value).toBe('')
  })

  it('남이 잡은 노드면 꺼진다 — 쳐서 떠나도 안 나간다', async () => {
    const b = await board()
    fireEvent.click(rowButton('n-save'))
    b.lock([{ pageId: PAGE_ID, nodeId: 'n-save', userId: 'u-bora', userName: '보라' }])
    expect(aliasField().disabled).toBe(true)
    fireEvent.change(aliasField(), { target: { value: '몰래' } })
    fireEvent.blur(aliasField())
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(b.calls).toEqual([])
  })

  it('여럿을 고른 판에는 없다', async () => {
    await board()
    fireEvent.click(rowButton('n-save'))
    fireEvent.click(rowButton('n-text'), { ctrlKey: true })
    expect(within(panel()).queryByRole('textbox', { name: '별칭' })).toBeNull()
  })
})

describe('구조 트리 줄에서 고치기', () => {
  it('더블클릭이 줄 아래에 입력을 연다 — 지금 별칭이 든 채, Enter 로 `replace` 하나', async () => {
    const b = await board()
    fireEvent.click(rowButton('n-card'))
    fireEvent.doubleClick(rowButton('n-card'))
    const input = treeInput()
    expect(input).not.toBeNull()
    expect(input!.value).toBe('회원 카드')
    expect(input!.closest('li')?.querySelector(':scope > [data-tree-id]')?.getAttribute('data-tree-id')).toBe('n-card')

    fireEvent.change(input!, { target: { value: '회원 요약' } })
    fireEvent.keyDown(input!, { key: 'Enter' })
    await waitFor(() => expect(b.calls).toEqual([[{ op: 'replace', path: CARD, value: '회원 요약' }]]))
    expect(treeInput()).toBeNull()
  })

  it('Escape 는 아무것도 안 보내고 닫는다', async () => {
    const b = await board()
    fireEvent.click(rowButton('n-save'))
    fireEvent.doubleClick(rowButton('n-save'))
    fireEvent.change(treeInput()!, { target: { value: '버릴 이름' } })
    fireEvent.keyDown(treeInput()!, { key: 'Escape' })
    expect(treeInput()).toBeNull()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(b.calls).toEqual([])
  })

  it('F2 — 트리 줄에 포커스가 있을 때', async () => {
    const b = await board()
    fireEvent.click(rowButton('n-save'))
    rowButton('n-save').focus()
    fireEvent.keyDown(rowButton('n-save'), { key: 'F2', code: 'F2' })
    expect(treeInput()?.value).toBe('')
    expect(document.activeElement).toBe(treeInput())
    fireEvent.change(treeInput()!, { target: { value: '저장 단추' } })
    fireEvent.keyDown(treeInput()!, { key: 'Enter' })
    await waitFor(() => expect(b.calls).toEqual([[{ op: 'add', path: SAVE, value: '저장 단추' }]]))
  })

  it('F2 — 캔버스 문서에서 쳐도 트리에 선다', async () => {
    await board()
    fireEvent.click(rowButton('n-card'))
    fireEvent.keyDown(canvasDocument().body, { key: 'F2', code: 'F2' })
    expect(treeInput()?.value).toBe('회원 카드')
  })

  it('줄 `…` «별칭 바꾸기»', async () => {
    await board()
    fireEvent.click(rowButton('n-text'))
    fireEvent.click(rowAction(structureRegion(), '별칭 바꾸기'))
    expect(treeInput()?.value).toBe('')
  })

  it('되돌리기 한 번에 옛 별칭으로 돌아간다', async () => {
    const b = await board()
    fireEvent.click(rowButton('n-card'))
    fireEvent.doubleClick(rowButton('n-card'))
    fireEvent.change(treeInput()!, { target: { value: '바뀐 카드' } })
    fireEvent.keyDown(treeInput()!, { key: 'Enter' })
    await waitFor(() => expect(b.calls).toHaveLength(1))
    await waitFor(() => expect(historyButton('되돌리기').disabled).toBe(false))

    fireEvent.click(historyButton('되돌리기'))
    await waitFor(() => expect(b.calls).toHaveLength(2))
    expect(b.calls[1]).toEqual([{ op: 'replace', path: CARD, value: '회원 카드' }])
    await waitFor(() => expect(aliasField().value).toBe('회원 카드'))
  })

  it('남이 잡은 노드면 더블클릭 · F2 · `…` 가 입력을 안 연다', async () => {
    const b = await board()
    fireEvent.click(rowButton('n-save'))
    b.lock([{ pageId: PAGE_ID, nodeId: 'n-save', userId: 'u-bora', userName: '보라' }])

    fireEvent.doubleClick(rowButton('n-save'))
    expect(treeInput()).toBeNull()
    fireEvent.keyDown(canvasDocument().body, { key: 'F2', code: 'F2' })
    expect(treeInput()).toBeNull()
    expect(isOff(rowAction(structureRegion(), '별칭 바꾸기'))).toBe(true)
  })

  it('여럿을 고른 판에서 기준 줄을 더블클릭해도 입력을 안 연다', async () => {
    // 잠긴 줄은 단추가 꺼져 더블클릭이 안 난다 — 판정(`aliasLocked`)이 혼자 막는 판은 이것이다.
    await board()
    fireEvent.click(rowButton('n-save'))
    fireEvent.click(rowButton('n-text'), { ctrlKey: true })
    fireEvent.doubleClick(rowButton('n-text'))
    expect(treeInput()).toBeNull()
  })

  it('여럿을 고른 판의 F2 는 입력을 안 연다', async () => {
    await board()
    fireEvent.click(rowButton('n-save'))
    fireEvent.click(rowButton('n-text'), { ctrlKey: true })
    fireEvent.keyDown(canvasDocument().body, { key: 'F2', code: 'F2' })
    expect(treeInput()).toBeNull()
    // 말없이 안 하지 않는다 — 정보 통지(`role="status"`)가 «하나만 고르면 바꿀 수 있다» 를 말하고, 실패 자리(`alert`)는 비어 있다.
    expect(infoTexts()).toEqual([ALIAS_MANY_NOTICE])
    expect(screen.queryAllByRole('alert')).toEqual([])
    // 하나로 다시 고르면 걷는다 — 낡은 말이 남지 않는다. 같은 고름 위의 F2 는 걷지 않는다(위 단언).
    fireEvent.click(rowButton('n-save'))
    expect(infoTexts()).toEqual([])
  })

  /**
   * L-041 — 좌측을 접으면 구조 트리 줄이 안 보인다(DOM 에는 남는다). F2 가 접힌 채 입력을 열면 보이는 것이 없고 펴는 순간 묻지 않은 입력이 서
   * 있었다. 지금은 F2 가 펴고 연다 — 혼자 죽는 변조: `onUnfoldSide` 호출을 뗀다.
   */
  it('좌측을 접은 채 F2 — 펴고 입력을 연다', async () => {
    await board()
    fireEvent.click(rowButton('n-card'))
    fireEvent.click(screen.getByRole('button', { name: '좌측 패널 접기' }))
    expect(document.querySelector('.wb-shell-side')!.classList.contains('wb-shell-folded')).toBe(true)

    fireEvent.keyDown(canvasDocument().body, { key: 'F2', code: 'F2' })

    expect(document.querySelector('.wb-shell-side')!.classList.contains('wb-shell-folded')).toBe(false)
    expect(treeInput()?.value).toBe('회원 카드')
  })

  /** L-042 — 속성 패널 별칭 칸은 61자째부터 받지 않고 «60자까지» 를 말한다(떠날 때 말없이 잘리던 판). */
  it('속성 패널 별칭 칸은 60자까지 받는다고 말한다', async () => {
    await board()
    fireEvent.click(rowButton('n-card'))
    // 입력창의 `maxLength` 는 UTF-16 상한(`2 ×`)일 뿐이다 — 60 코드 포인트는 `clampPoints` 가 자른다(`test/panels/text-clamp.test.ts` · 실브라우저 `build-test/n19-notices.test.ts`).
    expect(aliasField().maxLength).toBe(120)
    // 한도는 칸 밑 안내(`aria-describedby`)다 — 빈 칸의 자리표로 두면 값처럼 읽혔다.
    expect(aliasField().placeholder).toBe('')
    expect(document.getElementById(aliasField().getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      '트리 · 코멘트에 보이는 이름, 60자까지',
    )
  })

  it('입력이 연 뒤 남이 그 노드를 잡으면 Enter 가 안 보낸다', async () => {
    const b = await board()
    fireEvent.click(rowButton('n-save'))
    fireEvent.doubleClick(rowButton('n-save'))
    fireEvent.change(treeInput()!, { target: { value: '늦은 이름' } })
    b.lock([{ pageId: PAGE_ID, nodeId: 'n-save', userId: 'u-bora', userName: '보라' }])
    if (treeInput() !== null) fireEvent.keyDown(treeInput()!, { key: 'Enter' })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(b.calls).toEqual([])
  })
})

/**
 * **접힘(F1)과 별칭 입력(F2)이 한 줄에 선 판.** ← → 는 에디터 단축키가 접고 펴는 키이고(`edit/selection-move.ts` 의 `foldStep`) 별칭 입력은
 * 그 줄 아래의 글 칸이다 — 칸 안의 ← → 는 캐럿을 옮기는 키라 줄을 접거나 고른 노드를 옮기면 안 된다.
 */
describe('접힘과 별칭 입력', () => {
  function toggle(nodeId: string): HTMLButtonElement {
    const button = structureRegion().querySelector<HTMLButtonElement>(`[data-tree-id="${nodeId}"] > [data-tree-toggle]`)
    if (button === null) throw new Error(`${nodeId} 펼침 단추가 없다`)
    return button
  }

  function current(): string | null {
    return structureRegion().querySelector('[aria-current="true"]')?.closest('[data-tree-id]')?.getAttribute('data-tree-id') ?? null
  }

  it('입력 안의 ← 는 펴진 줄을 접지 않고, → 는 고른 노드를 첫 자식으로 옮기지 않는다', async () => {
    await board()
    fireEvent.click(rowButton('n-card'))
    fireEvent.doubleClick(rowButton('n-card'))
    const input = treeInput()!
    input.focus()
    fireEvent.keyDown(input, { key: 'ArrowLeft', code: 'ArrowLeft' })
    expect(rowButton('n-card').getAttribute('aria-expanded')).toBe('true')
    expect(treeInput()).not.toBeNull()
    fireEvent.keyDown(input, { key: 'ArrowRight', code: 'ArrowRight' })
    expect(current()).toBe('n-card')
    expect(treeInput()).toBe(input)
  })

  it('접힌 줄의 입력 안 → 는 펴지 않고, 잎 줄의 입력 안 ← 는 부모로 안 옮긴다', async () => {
    await board()
    fireEvent.click(rowButton('n-card'))
    fireEvent.click(toggle('n-card'))
    expect(rowButton('n-card').getAttribute('aria-expanded')).toBe('false')
    fireEvent.doubleClick(rowButton('n-card'))
    treeInput()!.focus()
    fireEvent.keyDown(treeInput()!, { key: 'ArrowRight', code: 'ArrowRight' })
    expect(rowButton('n-card').getAttribute('aria-expanded')).toBe('false')
    fireEvent.keyDown(treeInput()!, { key: 'Escape' })

    fireEvent.click(toggle('n-card'))
    fireEvent.click(rowButton('n-save'))
    fireEvent.doubleClick(rowButton('n-save'))
    treeInput()!.focus()
    fireEvent.keyDown(treeInput()!, { key: 'ArrowLeft', code: 'ArrowLeft' })
    expect(current()).toBe('n-save')
    expect(treeInput()).not.toBeNull()
  })

  it('접힌 줄에서 F2 — 입력은 그 줄 아래에 서고 줄은 접힌 채다', async () => {
    await board()
    fireEvent.click(rowButton('n-card'))
    fireEvent.click(toggle('n-card'))
    fireEvent.keyDown(canvasDocument().body, { key: 'F2', code: 'F2' })
    expect(treeInput()?.value).toBe('회원 카드')
    expect(rowButton('n-card').getAttribute('aria-expanded')).toBe('false')
  })

  it('고른 노드가 접힌 줄 안에 숨었을 때 F2 — 조상을 펴고 그 줄 아래에 입력이 선다', async () => {
    // 사람이 고른 노드의 조상을 직접 접은 판(F1 — 저절로 다시 펴지 않는다). F2 가 숨은 줄에 입력을 «열면» 화면에 아무것도 안 서고,
    // 나중에 사람이 그 줄을 펴는 순간 묻지 않은 입력이 선다.
    await board()
    fireEvent.click(rowButton('n-save'))
    fireEvent.click(toggle('n-card'))
    expect(structureRegion().querySelector('[data-tree-id="n-save"]')).toBeNull()
    fireEvent.keyDown(canvasDocument().body, { key: 'F2', code: 'F2' })
    expect(rowButton('n-card').getAttribute('aria-expanded')).toBe('true')
    expect(treeInput()?.closest('li')?.querySelector(':scope > [data-tree-id]')?.getAttribute('data-tree-id')).toBe('n-save')
  })

  it('글 칸 안의 F2 는 트리 입력을 안 연다 — 속성 패널 «별칭» 칸에서 친 글이 그 칸에 남는다', async () => {
    // 트리 줄 입력 안의 F2 는 같은 노드를 다시 «열» 뿐이라 거름을 떼도 안 보인다 — 거름이 하는 일이 보이는 칸은 다른 글 칸이다.
    await board()
    fireEvent.click(rowButton('n-card'))
    const field = aliasField()
    field.focus()
    fireEvent.change(field, { target: { value: '고치는 중' } })
    fireEvent.keyDown(field, { key: 'F2', code: 'F2' })
    expect(treeInput()).toBeNull()
    expect(document.activeElement).toBe(field)
    expect(field.value).toBe('고치는 중')
  })
})

/**
 * **입력을 연 노드가 문서에서 빠진 판**(같은 사람의 다른 탭 · 같은 계정의 에이전트 — 남은 그 노드를 못 지운다). 입력은 노드 id 에 매인 화면
 * 상태라(`src/panels/alias-edit.tsx`) 노드가 빠질 때 닫지 않으면 같은 id 가 되살아나는 순간(되돌리기 · 다른 탭) 묻지 않은 입력이 다시 서고
 * 포커스를 가져간다.
 */
describe('입력을 연 노드가 문서에서 빠지면', () => {
  const SAVE_NODE = { id: 'n-save', type: 'Button', props: { label: '저장' } }
  const alerts = () => screen.queryAllByRole('alert').map((el) => el.textContent)

  it('입력을 닫고 친 글을 버렸다고 하단 바가 말한다 — 같은 id 가 되살아나도 입력은 다시 안 서고 포커스를 안 가져간다', async () => {
    const b = await board()
    fireEvent.click(rowButton('n-save'))
    fireEvent.doubleClick(rowButton('n-save'))
    fireEvent.change(treeInput()!, { target: { value: '지움 중' } })

    b.peer([{ op: 'remove', path: '/root/children/0/children/0' }])
    expect({ input: treeInput(), alerts: alerts() }).toEqual({ input: null, alerts: [DROPPED_DRAFT_NOTICE] })

    b.peer([{ op: 'add', path: '/root/children/0/children/0', value: SAVE_NODE }])
    rowButton('n-save')
    expect({ input: treeInput(), focus: document.activeElement?.tagName }).toEqual({ input: null, focus: 'BODY' })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(b.calls).toEqual([])
  })

  it('친 글이 없으면 말하지 않는다', async () => {
    const b = await board()
    fireEvent.click(rowButton('n-save'))
    fireEvent.doubleClick(rowButton('n-save'))

    b.peer([{ op: 'remove', path: '/root/children/0/children/0' }])
    b.peer([{ op: 'add', path: '/root/children/0/children/0', value: SAVE_NODE }])
    rowButton('n-save')
    expect({ input: treeInput(), alerts: alerts() }).toEqual({ input: null, alerts: [] })
  })

  it('다른 부모로 옮겨지면 입력은 새 자리에 친 글째 선다 — Enter 가 옮긴 자리에 쓴다', async () => {
    const b = await board()
    fireEvent.click(rowButton('n-save'))
    fireEvent.doubleClick(rowButton('n-save'))
    fireEvent.change(treeInput()!, { target: { value: '옮김 중' } })

    b.peer([{ op: 'move', from: '/root/children/0/children/0', path: '/root/children/-' }])
    const input = treeInput()
    const owner = input?.closest('li')?.querySelector(':scope > [data-tree-id]')?.getAttribute('data-tree-id')
    expect({ value: input?.value, owner, alerts: alerts() }).toEqual({ value: '옮김 중', owner: 'n-save', alerts: [] })

    fireEvent.keyDown(input!, { key: 'Enter' })
    await waitFor(() => expect(b.calls).toEqual([[{ op: 'add', path: '/root/children/2/alias', value: '옮김 중' }]]))
  })
})

/**
 * **«컴포넌트» 탭의 머리 카드**(`src/panels/node-head.tsx`) — 제목 · 줄 요약 · 위치 사슬. 사슬 단추는 그 조상을 고르고(구조 트리 줄의 `aria-current`가
 * 옮겨 간다), 남이 쥔 조상의 단추는 꺼진다. 단추의 접근 이름은 ««줄 이름» 고르기» 다 — 같은 이름의 구조 트리 줄과 갈린다.
 */
describe('머리 카드', () => {
  function crumbs(): HTMLButtonElement[] {
    return within(within(panel()).getByRole('navigation', { name: '고른 노드의 위치' })).getAllByRole('button')
  }

  function current(): string | null {
    return (
      structureRegion()
        .querySelector('.wb-shell-structure-node[aria-current="true"]')
        ?.closest('[data-tree-id]')
        ?.getAttribute('data-tree-id') ?? null
    )
  }

  it('제목은 «타입 (별칭)» · 곁에 줄 요약 · 위치는 뿌리부터 부모까지이고 누르면 그 조상을 고른다', async () => {
    await board()
    fireEvent.click(rowButton('n-save'))
    const head = panel().querySelector('.wb-shell-node-head')!
    expect({
      제목: head.querySelector('h2')?.textContent,
      배지: head.querySelector('.wb-shell-node-head-type')?.textContent,
      요약: head.querySelector('.wb-shell-node-head-summary')?.textContent,
      위치: crumbs().map((button) => button.getAttribute('aria-label')),
    }).toEqual({ 제목: 'Button', 배지: 'Button', 요약: '저장', 위치: ['«Page» 고르기', '«Card (회원 카드) 회원» 고르기'] })

    fireEvent.click(crumbs()[1]!)
    await waitFor(() => expect(current()).toBe('n-card'))
    expect(panel().querySelector('.wb-shell-node-head h2')?.textContent).toBe('Card (회원 카드)')
    expect(crumbs().map((button) => button.getAttribute('aria-label'))).toEqual(['«Page» 고르기'])

    fireEvent.click(crumbs()[0]!)
    await waitFor(() => expect(current()).toBe('n-root'))
    // 뿌리는 위치가 없다 — 사슬이 안 선다.
    expect(within(panel()).queryByRole('navigation', { name: '고른 노드의 위치' })).toBeNull()
  })

  // 고를 수 없는 조상은 스토어의 고르기 판정과 같다(`useLockedBy`) — 남의 잠금을 품은 조상(뿌리)도 고를 수 없다.
  it('고를 수 없는 조상(남의 잠금을 품은 뿌리)의 단추는 꺼지고 눌러도 고르지 않는다', async () => {
    const b = await board()
    fireEvent.click(rowButton('n-save'))
    b.lock([{ pageId: PAGE_ID, nodeId: 'n-text', userId: 'u-bora', userName: '보라' }])
    await waitFor(() => expect(crumbs()[0]!.disabled).toBe(true))
    expect(crumbs()[1]!.disabled).toBe(false)
    fireEvent.click(crumbs()[0]!)
    expect(current()).toBe('n-save')
  })
})
