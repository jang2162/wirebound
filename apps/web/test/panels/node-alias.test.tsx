/**
 * **노드 별칭을 고치는 자리**(설계서 「설계서 화면 구조」의 노드 별칭) — 속성 패널 맨 위 «별칭» 칸 · 구조 트리 줄의 더블클릭 · F2 ·
 * 줄 `…` «별칭 바꾸기». 넷 다 편집 하나(`add` · `replace` · `remove` `/…/alias` — `src/edit/ops.ts` 의 `aliasOps`)를 지금 편집 길로
 * 보낸다 — 되돌리기 한 번 · 남의 잠금이면 막힘.
 *
 * 서버 대역은 진짜 잠금 판정(`lockConflictOfOps`)을 돈다(`../lock/props-lock.test.tsx` 와 같은 꼴). 줄은 노드 id 로 찾는다
 * (`data-tree-id`) — 줄의 접근 이름은 이 파일이 재는 것이 아니다.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { lockConflictOfOps, type PageDocument, type PatchOp } from '@wirebound/schema'
import { describe, expect, it } from 'vitest'
import { ApiError, type ApiClient } from '../../src/api/client'
import type { PageDetail, PatchResult } from '../../src/api/types'
import type { RealtimeSocket } from '../../src/realtime/connection'
import { createConnectionIdHolder, type RealtimeSetup } from '../../src/realtime/context'
import { createEditChannel } from '../../src/realtime/edit-channel'
import { createLockChannel } from '../../src/realtime/lock-channel'
import type { NodeLockView, ServerFrame } from '../../src/realtime/protocol'
import { HEAD_SEQ, PAGE_ID, PROJECT_ID, canvasDocument, openPage, pageDetail, pageDoc } from '../editor-harness'
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
    calls,
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
function treeInput(): HTMLInputElement | null {
  return within(structureRegion()).queryByRole<HTMLInputElement>('textbox', { name: '별칭' })
}

function historyButton(name: '되돌리기' | '다시 실행'): HTMLButtonElement {
  return within(screen.getByRole('group', { name: '편집 이력' })).getByRole<HTMLButtonElement>('button', { name })
}

const CARD = '/root/children/0/alias'
const SAVE = '/root/children/0/children/0/alias'

describe('속성 패널 «별칭» 칸', () => {
  it('맨 위 칸이다 — 고른 노드의 별칭을 보이고, 바꿔 떠나면 `replace` 하나를 보낸다', async () => {
    const b = await board()
    fireEvent.click(rowButton('n-card'))

    const rows = panel().querySelectorAll('.wb-shell-prop')
    expect(rows[0]?.querySelector('.wb-shell-prop-label')?.textContent).toBe('별칭')
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
