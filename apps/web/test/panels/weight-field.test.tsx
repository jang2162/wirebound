/**
 * **속성 패널 «몫» 칸**(설계서 「설계서 화면 구조」의 속성 패널 · 노드 몫) — 별칭 곁의 고정 칸. **부모가 몫을 읽을 때만** 선다(`Flex` · `Grid` · 열을
 * 정한 `SearchForm` — 렌더러의 `weightRoom` 과 같은 판정). 넣으면 `add` / `replace …/weight`, 비우면 `remove`, 1 ~ 12 정수 밖은 안 보내고 칸
 * 아래에 까닭을 말한다. 남이 잡은 노드면 꺼진다(별칭 칸과 같은 판정). 열을 정한 조회 폼의 «열 수» 를 비우면 `remove …/props/columns` 다(열을 안 정한
 * 판으로 돌아간다).
 *
 * 서버 대역은 진짜 잠금 판정(`lockConflictOfOps`)을 돈다(`./node-alias.test.tsx` 와 같은 꼴).
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
import { HEAD_SEQ, PAGE_ID, PROJECT_ID, openPage, pageDetail, pageDoc } from '../editor-harness'
import { WEIGHT_RANGE_NOTICE } from '../../src/panels/property-panel'
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
 *   n-row   (Flex)
 *     n-a   (Card)   ← 몫 2
 *     n-b   (Card)
 *   n-grid  (Grid)
 *     n-g   (Text)
 *   n-sf    (SearchForm — 열 3)
 *     n-f   (Field)
 *   n-sf0   (SearchForm — 열 없음)
 *     n-f0  (Field)
 *   n-card  (Card)
 *     n-in  (Text)
 * ```
 */
function doc(): PageDocument {
  return pageDoc({
    id: 'n-root',
    type: 'Page',
    children: [
      {
        id: 'n-row',
        type: 'Flex',
        children: [
          { id: 'n-a', type: 'Card', weight: 2 },
          { id: 'n-b', type: 'Card' },
        ],
      },
      { id: 'n-grid', type: 'Grid', props: { columns: 3 }, children: [{ id: 'n-g', type: 'Text' }] },
      { id: 'n-sf', type: 'SearchForm', props: { columns: 3 }, children: [{ id: 'n-f', type: 'Field' }] },
      { id: 'n-sf0', type: 'SearchForm', children: [{ id: 'n-f0', type: 'Field' }] },
      { id: 'n-card', type: 'Card', children: [{ id: 'n-in', type: 'Text' }] },
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
    lock: (locks) => {
      live = locks
      const frame: ServerFrame = { type: 'locks', projectId: PROJECT_ID, locks }
      act(() => {
        sockets.at(-1)?.onmessage?.({ data: JSON.stringify(frame) })
      })
    },
  }
}

function panel(): HTMLElement {
  return screen.getByRole('complementary', { name: '우측 패널' })
}

function select(nodeId: string): void {
  const button = screen
    .getByRole('region', { name: '구조 트리' })
    .querySelector<HTMLButtonElement>(`[data-tree-id="${nodeId}"] > .wb-shell-structure-node`)
  if (button === null) throw new Error(`${nodeId} 줄이 없다`)
  fireEvent.click(button)
}

function weightField(): HTMLInputElement | null {
  return within(panel()).queryByRole<HTMLInputElement>('textbox', { name: '몫' })
}

function why(): string | null {
  return panel().querySelector('[data-wb-node-weight] .wb-shell-prop-why')?.textContent ?? null
}

const A = '/root/children/0/children/0/weight'
const B = '/root/children/0/children/1/weight'

describe('속성 패널 «몫» 칸 — 서는 자리', () => {
  it.each([
    ['Flex 의 자식', 'n-a'],
    ['Grid 의 자식', 'n-g'],
    ['열을 정한 SearchForm 의 자식', 'n-f'],
  ])('%s 이면 선다 — 별칭 바로 아래 칸이다', async (_label, nodeId) => {
    await board()
    select(nodeId)
    expect(weightField()).not.toBeNull()
    const rows = [...panel().querySelectorAll('.wb-shell-prop')].map((row) => row.querySelector('.wb-shell-prop-label')?.textContent)
    expect(rows.slice(0, 2)).toEqual(['별칭', '몫'])
  })

  it.each([
    ['열을 안 정한 SearchForm 의 자식', 'n-f0'],
    ['Card 의 자식', 'n-in'],
    ['페이지 바로 아래', 'n-card'],
    ['뿌리', 'n-root'],
  ])('%s 이면 없다', async (_label, nodeId) => {
    await board()
    select(nodeId)
    expect(weightField()).toBeNull()
  })
})

describe('속성 패널 «몫» 칸 — 보내는 편집', () => {
  it('지금 몫을 보이고, 바꿔 떠나면 `replace` 하나', async () => {
    const b = await board()
    select('n-a')
    expect(weightField()!.value).toBe('2')
    fireEvent.change(weightField()!, { target: { value: '3' } })
    fireEvent.blur(weightField()!)
    await waitFor(() => expect(b.calls).toEqual([[{ op: 'replace', path: A, value: 3 }]]))
  })

  it('몫이 없던 노드는 `add` — 앞뒤 공백은 걷는다', async () => {
    const b = await board()
    select('n-b')
    expect(weightField()!.value).toBe('')
    fireEvent.change(weightField()!, { target: { value: ' 12 ' } })
    fireEvent.keyDown(weightField()!, { key: 'Enter' })
    await waitFor(() => expect(b.calls).toEqual([[{ op: 'add', path: B, value: 12 }]]))
  })

  it('비우면 `remove`', async () => {
    const b = await board()
    select('n-a')
    fireEvent.change(weightField()!, { target: { value: '' } })
    fireEvent.blur(weightField()!)
    await waitFor(() => expect(b.calls).toEqual([[{ op: 'remove', path: A }]]))
  })

  it.each(['0', '13', '1.5', '두', '-1', '1e1'])('1 ~ 12 정수 밖(%s)은 안 보내고 칸 아래에 까닭을 말한다', async (typed) => {
    const b = await board()
    select('n-b')
    fireEvent.change(weightField()!, { target: { value: typed } })
    fireEvent.blur(weightField()!)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(b.calls).toEqual([])
    expect(why()).toBe(WEIGHT_RANGE_NOTICE)
  })

  it('까닭은 바른 값을 보내면 걷힌다', async () => {
    const b = await board()
    select('n-b')
    fireEvent.change(weightField()!, { target: { value: '20' } })
    fireEvent.blur(weightField()!)
    expect(why()).toBe(WEIGHT_RANGE_NOTICE)
    fireEvent.change(weightField()!, { target: { value: '4' } })
    fireEvent.blur(weightField()!)
    await waitFor(() => expect(b.calls).toEqual([[{ op: 'add', path: B, value: 4 }]]))
    expect(why()).toBeNull()
  })

  it('남이 잡은 노드면 꺼진다 — 쳐서 떠나도 안 나간다', async () => {
    const b = await board()
    select('n-a')
    b.lock([{ pageId: PAGE_ID, nodeId: 'n-a', userId: 'u-bora', userName: '보라' }])
    expect(weightField()!.disabled).toBe(true)
    fireEvent.change(weightField()!, { target: { value: '5' } })
    fireEvent.blur(weightField()!)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(b.calls).toEqual([])
  })
})

describe('열을 정한 조회 폼의 «열 수»', () => {
  function columnsField(): HTMLInputElement {
    return within(panel()).getByRole<HTMLInputElement>('textbox', { name: '열 수' })
  }

  it('비우면 `remove …/props/columns` — 열을 안 정한 판으로 돌아간다', async () => {
    const b = await board()
    select('n-sf')
    expect(columnsField().value).toBe('3')
    fireEvent.change(columnsField(), { target: { value: '' } })
    fireEvent.blur(columnsField())
    await waitFor(() => expect(b.calls).toEqual([[{ op: 'remove', path: '/root/children/2/props/columns' }]]))
  })

  it('수를 넣으면 지금처럼 `add` / `replace`', async () => {
    const b = await board()
    select('n-sf0')
    fireEvent.change(columnsField(), { target: { value: '2' } })
    fireEvent.blur(columnsField())
    await waitFor(() => expect(b.calls).toEqual([[{ op: 'add', path: '/root/children/3/props', value: { columns: 2 } }]]))
  })
})
