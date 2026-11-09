/**
 * **속성 패널의 그리드 행 칸 «행 내용: 기본 / 커스텀»**(`src/panels/row-content-field.tsx` · `src/edit/row-content.ts`) — jsdom 판. 첫 행의 끔과 까닭 ·
 * 고르기 하나 = 편집 하나 = 되돌리기 한 번 · 잃을 것이 있으면 확인 줄(취소 · Escape · 확인) · 안 고친 칸은 묻지 않음 · 셀 틀을 읽는 열의 남의 잠금.
 * 실브라우저 판은 `build-test/grid-row-content.test.ts`.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { lockConflictOfOps, type PageDocument, type PatchOp, type WbNode } from '@wirebound/schema'
import { beforeAll, describe, expect, it } from 'vitest'
import { ApiError, type ApiClient } from '../../src/api/client'
import type { PageDetail, PatchResult } from '../../src/api/types'
import { FIRST_ROW_WHY } from '../../src/edit/grid-row-actions'
import { clearCellsQuestion } from '../../src/edit/row-content'
import type { RealtimeSocket } from '../../src/realtime/connection'
import { createConnectionIdHolder, type RealtimeSetup } from '../../src/realtime/context'
import { createEditChannel } from '../../src/realtime/edit-channel'
import { createLockChannel } from '../../src/realtime/lock-channel'
import type { NodeLockView, ServerFrame } from '../../src/realtime/protocol'
import { HEAD_SEQ, PAGE_ID, PROJECT_ID, openPage, pageDetail, pageDoc } from '../editor-harness'
import { installPointerEvents } from '../pointer-events'
import '../../src/catalog-setup'

beforeAll(installPointerEvents)

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
 * n-root (Page)
 * └ n-grid (DataGrid) — 열 [n-c1 [n-t1 '값'] · n-c2 [n-t2]] · 행 [n-r1 (되풀이 3) · n-r2 · n-own [n-k1 · n-k2]]
 * ```
 */
function doc(): PageDocument {
  return pageDoc({
    id: 'n-root',
    type: 'Page',
    children: [
      {
        id: 'n-grid',
        type: 'DataGrid',
        children: [
          { id: 'n-c1', type: 'GridColumn', props: { label: '이름' }, children: [{ id: 'n-t1', type: 'Text', props: { content: '값' } }] },
          {
            id: 'n-c2',
            type: 'GridColumn',
            props: { label: '상태' },
            children: [{ id: 'n-t2', type: 'Text', props: { content: '정상' } }],
          },
        ],
        zones: {
          rows: [
            { id: 'n-r1', type: 'GridRow', props: { repeat: 3 } },
            { id: 'n-r2', type: 'GridRow' },
            {
              id: 'n-own',
              type: 'GridRow',
              children: [
                { id: 'n-k1', type: 'GridCell' },
                { id: 'n-k2', type: 'GridCell' },
              ],
            },
          ],
        },
      },
    ],
  })
}

interface Board {
  calls: PatchOp[][]
  held: () => PageDocument
  lock: (locks: NodeLockView[]) => void
  /** 남의 편집 — 서버 문서에 얹고 그 번호의 `page-changed` 프레임을 보낸다. */
  remote: (ops: PatchOp[]) => Promise<void>
}

async function board(start: PageDocument = doc()): Promise<Board> {
  const sockets: FakeSocket[] = []
  const calls: PatchOp[][] = []
  let live: NodeLockView[] = []
  let seq = HEAD_SEQ
  let held = start

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
      schemaVersion: 4,
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
  await openPage(start, { realtime: setup, apiOverrides: { patchOps, getPage, listComments: async () => [] } })
  return {
    calls,
    held: () => held,
    lock: (locks) => {
      live = locks
      const frame: ServerFrame = { type: 'locks', projectId: PROJECT_ID, locks }
      act(() => {
        sockets.at(-1)?.onmessage?.({ data: JSON.stringify(frame) })
      })
    },
    remote: async (ops) => {
      const { applyOps } = await import('@wirebound/schema')
      held = applyOps(held, ops)
      seq += 1
      const frame: ServerFrame = { type: 'page-changed', projectId: PROJECT_ID, pageId: PAGE_ID, seq, ops, warnings: [] }
      act(() => {
        sockets.at(-1)?.onmessage?.({ data: JSON.stringify(frame) })
      })
    },
  }
}

function structureRegion(): HTMLElement {
  return screen.getByRole('region', { name: '구조 트리' })
}

function row(id: string): HTMLElement {
  const found = structureRegion().querySelector<HTMLElement>(`[data-tree-row][data-tree-id="${id}"]`)
  if (found === null) throw new Error(`구조 트리에 ${id} 줄이 없다`)
  return found
}

function rowsOf(document: PageDocument): WbNode[] {
  return document.root.children![0]!.zones!.rows!
}

function pick(id: string): void {
  fireEvent.click(within(row(id)).getAllByRole('button')[0]!)
}

const group = () => screen.getByRole('radiogroup', { name: '행 내용' })
const radio = (name: '기본' | '커스텀') => within(group()).getByRole('radio', { name })
const checked = () => within(group()).getByRole('radio', { checked: true }).textContent
const why = () => document.querySelector('[data-wb-row-content-why]')?.textContent ?? null
const confirmGroup = () => screen.queryByRole('group', { name: '칸 걷기 확인' })

describe('행 내용', () => {
  it('첫 행 — «기본» 이 골라졌고 «커스텀» 은 꺼진 채 까닭 · 눌러도 안 나간다', async () => {
    const srv = await board()
    pick('n-r1')
    await waitFor(() => expect(checked()).toBe('기본'))
    expect([(radio('커스텀') as HTMLButtonElement).disabled, why(), radio('커스텀').getAttribute('aria-description')]).toEqual([
      true,
      FIRST_ROW_WHY,
      FIRST_ROW_WHY,
    ])
    fireEvent.click(radio('커스텀'))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(srv.calls).toEqual([])
  })

  it('둘째 행 «커스텀» — 편집 하나(열마다 셀 틀 사본 칸) · 골라짐이 바뀐다 · 되돌리기 한 번이 처음 문서', async () => {
    const srv = await board()
    pick('n-r2')
    await waitFor(() => expect(checked()).toBe('기본'))
    expect(why()).toBeNull()
    fireEvent.click(radio('커스텀'))
    await waitFor(() => expect(srv.calls).toHaveLength(1))
    expect(rowsOf(srv.held())[1]!.children!.map((cell) => cell.children!.map((piece) => piece.props?.content))).toEqual([['값'], ['정상']])
    await waitFor(() => expect(checked()).toBe('커스텀'))
    fireEvent.click(screen.getByRole('button', { name: '되돌리기' }))
    await waitFor(() => expect(srv.calls).toHaveLength(2))
    expect(srv.held()).toEqual(doc())
  })

  it('안 고친 커스텀 행의 «기본» 은 묻지 않고 걷는다 — 처음 문서', async () => {
    const srv = await board()
    pick('n-r2')
    await waitFor(() => expect(checked()).toBe('기본'))
    fireEvent.click(radio('커스텀'))
    await waitFor(() => expect(checked()).toBe('커스텀'))
    fireEvent.click(radio('기본'))
    expect(confirmGroup()).toBeNull()
    await waitFor(() => expect(srv.calls).toHaveLength(2))
    expect(srv.held()).toEqual(doc())
  })

  it('셀 틀과 다른 칸의 «기본» 은 확인 줄 — 취소 · Escape 는 안 나가고 확인은 칸 배열을 걷는다', async () => {
    const srv = await board()
    pick('n-own')
    await waitFor(() => expect(checked()).toBe('커스텀'))
    fireEvent.click(radio('기본'))
    expect(within(confirmGroup()!).getByText(clearCellsQuestion(2))).toBeTruthy()
    // 확인 단추로 포커스가 간다.
    expect(document.activeElement?.textContent).toBe('기본으로 돌리기')
    fireEvent.click(within(confirmGroup()!).getByRole('button', { name: '취소' }))
    expect(confirmGroup()).toBeNull()
    fireEvent.click(radio('기본'))
    fireEvent.keyDown(within(confirmGroup()!).getByRole('button', { name: '기본으로 돌리기' }), { key: 'Escape' })
    expect(confirmGroup()).toBeNull()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(srv.calls).toEqual([])

    fireEvent.click(radio('기본'))
    fireEvent.click(within(confirmGroup()!).getByRole('button', { name: '기본으로 돌리기' }))
    await waitFor(() => expect(srv.calls).toHaveLength(1))
    expect(rowsOf(srv.held())[2]).toEqual({ id: 'n-own', type: 'GridRow' })
    await waitFor(() => expect(checked()).toBe('기본'))
    expect(confirmGroup()).toBeNull()
  })

  /**
   * 확인 줄이 선 동안 남의 고침이 그 행의 칸을 바꾸면(칸 하나 더함) 확인은 걷지 않고 지금 칸으로 다시 묻는다(칸 2 → 3) — 물은 것과 다른 칸을 걷지 않는다.
   * 다시 물은 줄의 확인은 그 칸을 걷는다.
   */
  it('확인 줄 사이 남이 칸을 바꾸면 확인은 걷지 않고 다시 묻는다 — 다시 물은 확인은 걷는다', async () => {
    const srv = await board()
    pick('n-own')
    await waitFor(() => expect(checked()).toBe('커스텀'))
    fireEvent.click(radio('기본'))
    expect(within(confirmGroup()!).getByText(clearCellsQuestion(2))).toBeTruthy()
    await srv.remote([{ op: 'add', path: '/root/children/0/zones/rows/2/children/2', value: { id: 'n-k3', type: 'GridCell' } }])
    // 카나리아 — 남의 칸이 내 화면에 닿았다(구조 트리에 그 칸 줄).
    await waitFor(() => expect(row('n-k3')).toBeTruthy())
    fireEvent.click(within(confirmGroup()!).getByRole('button', { name: '기본으로 돌리기' }))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect({ calls: srv.calls.length, question: confirmGroup()?.querySelector('p')?.textContent ?? null }).toEqual({
      calls: 0,
      question: clearCellsQuestion(3),
    })

    fireEvent.click(within(confirmGroup()!).getByRole('button', { name: '기본으로 돌리기' }))
    await waitFor(() => expect(srv.calls).toHaveLength(1))
    expect(rowsOf(srv.held())[2]).toEqual({ id: 'n-own', type: 'GridRow' })
  })

  /** 셀 틀을 읽는 열을 남이 쥐면 «커스텀» 이 꺼진 채 그 사람의 이름(행 줄 «열 틀로 칸 짓기» 와 같다) · 행을 남이 쥐면 둘 다 꺼진다. */
  it('잠금 — 셀 틀을 읽는 열을 남이 쥐면 «커스텀» 이 꺼진 채 이름 · 행을 쥐면 둘 다 꺼진다', async () => {
    const srv = await board()
    pick('n-r2')
    await waitFor(() => expect(checked()).toBe('기본'))
    srv.lock([{ pageId: PAGE_ID, nodeId: 'n-t2', userId: 'u-bora', userName: '보라' }])
    await waitFor(() => expect(why()).toBe('보라님이 편집 중이라 바꿀 수 없습니다'))
    expect((radio('커스텀') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(radio('커스텀'))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(srv.calls).toEqual([])

    srv.lock([{ pageId: PAGE_ID, nodeId: 'n-r2', userId: 'u-bora', userName: '보라' }])
    await waitFor(() => expect((radio('기본') as HTMLButtonElement).disabled).toBe(true))
    expect([(radio('커스텀') as HTMLButtonElement).disabled, why()]).toEqual([true, null])
  })
})
