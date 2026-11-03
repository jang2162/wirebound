/**
 * **그리드 행 줄 `…` 의 «한 행 떼어 내기» · «열 틀로 칸 짓기»**(`src/panels/tree-row-actions.tsx` · `src/panels/structure-toolbar.tsx` ·
 * `src/edit/grid-row-actions.ts`) — jsdom 판. 항목이 행 줄에만 서고 · 행의 모양이 못 하게 하면 꺼진 채 까닭을 들며 · 누름 하나가 편집 하나이고 ·
 * 되돌리기 한 번이 둘 다 돌리며 · 남의 잠금(행 · 셀 틀을 읽는 열)에서는 편집이 안 나가는 것을 잰다. 묶음의 모양은 `../edit/grid-row-actions.test.ts`,
 * 실브라우저 판(두 사람 · 새로고침 뒤 되돌리기)은 `build-test/grid-row-actions.test.ts`.
 *
 * 하네스는 `./change-kind.test.tsx` 와 같은 꼴이다 — 가짜 소켓으로 잠금 프레임을 밀어 넣고 서버의 2차 방어(`lockConflictOfOps`)를 대역이 그대로 돈다.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { lockConflictOfOps, type PageDocument, type PatchOp, type WbNode } from '@wirebound/schema'
import { beforeAll, describe, expect, it } from 'vitest'
import { ApiError, type ApiClient } from '../../src/api/client'
import type { PageDetail, PatchResult } from '../../src/api/types'
import {
  BUILD_CELLS_LABEL,
  BUILD_CELLS_WHY,
  COVERED_ROW_WHY,
  FIRST_ROW_WHY,
  SPLIT_ROW_LABEL,
  SPLIT_ROW_WHY,
  TARGETED_ROW_WHY,
} from '../../src/edit/grid-row-actions'
import type { RealtimeSocket } from '../../src/realtime/connection'
import { createConnectionIdHolder, type RealtimeSetup } from '../../src/realtime/context'
import { createEditChannel } from '../../src/realtime/edit-channel'
import { createLockChannel } from '../../src/realtime/lock-channel'
import type { NodeLockView, ServerFrame } from '../../src/realtime/protocol'
import { HEAD_SEQ, PAGE_ID, PROJECT_ID, openPage, pageDetail, pageDoc } from '../editor-harness'
import { installPointerEvents } from '../pointer-events'
import '../../src/catalog-setup'
import { isOff, queryRowAction, rowAction, rowReason } from './tree-row'

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

describe('항목이 서는 줄 · 끔', () => {
  it('그리드 행 줄에만 선다 — 열 · 셀 틀 글 · 칸 · 그리드 · 뿌리 줄에는 없다', async () => {
    await board()
    for (const id of ['n-r1', 'n-r2', 'n-own'])
      for (const label of [SPLIT_ROW_LABEL, BUILD_CELLS_LABEL])
        expect(queryRowAction(structureRegion(), label, row(id)), `${id} ${label}`).not.toBeNull()
    for (const id of ['n-c1', 'n-t1', 'n-k1', 'n-grid', 'n-root'])
      for (const label of [SPLIT_ROW_LABEL, BUILD_CELLS_LABEL])
        expect(queryRowAction(structureRegion(), label, row(id)), `${id} ${label}`).toBeNull()
  })

  it('행의 모양이 못 하게 하면 꺼진 채 까닭 — 되풀이 1 은 떼기 · 칸을 가진 행 · 첫 행은 칸 짓기', async () => {
    await board()
    expect([
      isOff(rowAction(structureRegion(), SPLIT_ROW_LABEL, row('n-r1'))),
      isOff(rowAction(structureRegion(), BUILD_CELLS_LABEL, row('n-r1'))),
    ]).toEqual([false, true])
    // 첫 행은 늘 기본이다(`FIRST_ROW_WHY` — 속성 패널 «행 내용» 과 같은 판정).
    expect(rowReason(structureRegion(), BUILD_CELLS_LABEL, row('n-r1'))).toBe(FIRST_ROW_WHY)
    expect(rowReason(structureRegion(), SPLIT_ROW_LABEL, row('n-r2'))).toBe(SPLIT_ROW_WHY)
    expect(rowReason(structureRegion(), BUILD_CELLS_LABEL, row('n-r2'))).toBeNull()
    expect(rowReason(structureRegion(), BUILD_CELLS_LABEL, row('n-own'))).toBe(BUILD_CELLS_WHY)
    // 까닭 글만이 아니라 꺼짐(`aria-disabled`)도 — 까닭은 끔과 따로 지어진다(`panels/toolbar-status.ts` 의 `structureWhy`).
    expect([
      isOff(rowAction(structureRegion(), SPLIT_ROW_LABEL, row('n-r2'))),
      isOff(rowAction(structureRegion(), BUILD_CELLS_LABEL, row('n-r2'))),
    ]).toEqual([true, false])
    expect(isOff(rowAction(structureRegion(), BUILD_CELLS_LABEL, row('n-own')))).toBe(true)
  })

  /**
   * **문서가 못 하게 하는 판**(`edit/grid-row-actions.ts` 머리말) — 바깥 단추의 상호작용이 n-r1 을 가리키면 떼기가(리뷰 M5), 위 행의 세로 칸이 되풀이 행의
   * 첫 줄만 덮으면 칸 짓기가(리뷰 M1) 꺼진 채 까닭을 든다.
   */
  it('바깥 상호작용이 그 행을 가리키면 떼기 · 위 행 세로 칸이 첫 줄만 덮으면 칸 짓기가 꺼진 채 까닭', async () => {
    const start = doc()
    const grid = start.root.children![0]!
    grid.zones!.rows = [
      {
        id: 'n-top',
        type: 'GridRow',
        children: [
          { id: 'n-k1', type: 'GridCell', props: { rowSpan: 2 } },
          { id: 'n-k2', type: 'GridCell' },
        ],
      },
      { id: 'n-r1', type: 'GridRow', props: { repeat: 3 } },
    ]
    start.root.children!.push({
      id: 'n-button',
      type: 'Button',
      props: { label: '숨김' },
      interactions: [{ on: 'click', actions: [{ type: 'setVisible', target: 'n-r1', value: false }] }],
    })
    await board(start)
    const split = rowAction(structureRegion(), SPLIT_ROW_LABEL, row('n-r1'))
    expect([isOff(split), rowReason(structureRegion(), SPLIT_ROW_LABEL, row('n-r1'))]).toEqual([true, TARGETED_ROW_WHY])
    const build = rowAction(structureRegion(), BUILD_CELLS_LABEL, row('n-r1'))
    expect([isOff(build), rowReason(structureRegion(), BUILD_CELLS_LABEL, row('n-r1'))]).toEqual([true, COVERED_ROW_WHY])
  })
})

describe('누름 하나 = 편집 하나 = 되돌리기 한 번', () => {
  it('«한 행 떼어 내기» — 앞 행(원본 id)은 되풀이 1 · 뒤 새 행은 되풀이 2 · 고른 것은 앞 행 · 되돌리기 한 번이 처음 문서', async () => {
    const srv = await board()
    fireEvent.click(rowAction(structureRegion(), SPLIT_ROW_LABEL, row('n-r1')))
    await waitFor(() => expect(srv.calls).toHaveLength(1))
    const rows = rowsOf(srv.held())
    expect(rows.map((node) => [node.id.startsWith('n-') ? node.id : 'new', node.props?.repeat ?? 1])).toEqual([
      ['n-r1', 1],
      ['new', 2],
      ['n-r2', 1],
      ['n-own', 1],
    ])
    await waitFor(() => expect(row('n-r1').classList.contains('wb-shell-tree-row-picked')).toBe(true))

    fireEvent.click(screen.getByRole('button', { name: '되돌리기' }))
    await waitFor(() => expect(srv.calls).toHaveLength(2))
    expect(srv.held()).toEqual(doc())
  })

  it('«열 틀로 칸 짓기» — 칸 둘(셀 틀 사본) · 셀 틀은 그대로 · 되돌리기 한 번이 처음 문서', async () => {
    const srv = await board()
    fireEvent.click(rowAction(structureRegion(), BUILD_CELLS_LABEL, row('n-r2')))
    await waitFor(() => expect(srv.calls).toHaveLength(1))
    const built = rowsOf(srv.held())[1]!
    expect(built.children!.map((cell) => [cell.type, cell.children!.map((piece) => piece.props?.content)])).toEqual([
      ['GridCell', ['값']],
      ['GridCell', ['정상']],
    ])
    expect(srv.held().root.children![0]!.children).toEqual(doc().root.children![0]!.children)
    await waitFor(() => expect(row('n-r2').classList.contains('wb-shell-tree-row-picked')).toBe(true))

    fireEvent.click(screen.getByRole('button', { name: '되돌리기' }))
    await waitFor(() => expect(srv.calls).toHaveLength(2))
    expect(srv.held()).toEqual(doc())
  })
})

describe('잠금', () => {
  it('고른 행을 남이 잡으면 두 항목이 꺼지고 잡은 사람의 이름을 말한다', async () => {
    const srv = await board()
    fireEvent.click(within(row('n-r1')).getAllByRole('button')[0]!)
    srv.lock([{ pageId: PAGE_ID, nodeId: 'n-r1', userId: 'u-bora', userName: '보라' }])
    for (const label of [SPLIT_ROW_LABEL, BUILD_CELLS_LABEL]) expect(rowReason(structureRegion(), label, row('n-r1'))).toContain('보라')
  })

  /**
   * 셀 틀을 읽는 열을 남이 쥐면 칸 짓기 항목이 꺼지고 그 사람의 이름을 까닭으로 든다(리뷰 L5 — 누른 뒤에야 막던 것). 첫 열 · 둘째 열을 따로 잰다 — 열을
   * 하나 건너뛰는 물음이 첫 열 판에서만 산다(리뷰 변조 X7). 잠금이 걷히면 다시 켜진다. 떼어 내기는 열을 안 써 나간다.
   */
  for (const [what, held] of [
    ['첫 열', 'n-t1'],
    ['둘째 열', 'n-t2'],
  ] as const)
    it(`셀 틀을 읽는 열(${what})을 남이 쥐었으면 «열 틀로 칸 짓기» 가 꺼진 채 그 사람의 이름 · 안 나간다 · 놓으면 켜진다 · 떼어 내기는 나간다`, async () => {
      const srv = await board()
      // 칸 짓기는 둘째 행(n-r2)에 — 첫 행은 늘 기본이다(`FIRST_ROW_WHY`).
      fireEvent.click(within(row('n-r2')).getAllByRole('button')[0]!)
      srv.lock([{ pageId: PAGE_ID, nodeId: held, userId: 'u-bora', userName: '보라' }])
      const build = () => rowAction(structureRegion(), BUILD_CELLS_LABEL, row('n-r2'))
      expect([isOff(build()), rowReason(structureRegion(), BUILD_CELLS_LABEL, row('n-r2'))]).toEqual([
        true,
        '보라님이 편집 중이라 바꿀 수 없습니다',
      ])
      fireEvent.click(build())
      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(srv.calls).toEqual([])

      srv.lock([])
      expect([isOff(build()), rowReason(structureRegion(), BUILD_CELLS_LABEL, row('n-r2'))]).toEqual([false, null])
      srv.lock([{ pageId: PAGE_ID, nodeId: held, userId: 'u-bora', userName: '보라' }])
      fireEvent.click(rowAction(structureRegion(), SPLIT_ROW_LABEL, row('n-r1')))
      await waitFor(() => expect(srv.calls).toHaveLength(1))
      expect(rowsOf(srv.held()).map((node) => node.props?.repeat ?? 1)).toEqual([1, 2, 1, 1])
    })
})

describe('속성 패널 — 그리드 편집 칸의 안내 한 줄', () => {
  /** 고른 노드의 속성 패널에서 그 이름의 칸 줄이 든 안내(`.wb-shell-prop-note`) — 없으면 `null`. */
  function hintOf(label: string): string | null {
    const panel = screen.getByRole('tabpanel', { name: '속성' })
    const line = within(panel).getByText(label, { selector: 'label' }).closest('.wb-shell-prop')
    return line?.querySelector('.wb-shell-prop-note')?.textContent ?? null
  }

  it('«되풀이» · «가로 칸 수» · «세로 칸 수» · «고정 열 수» · «열 폭» 칸 밑에 안내 · 안내가 없는 칸은 없다', async () => {
    await board()
    const pick = async (id: string) => {
      fireEvent.click(within(row(id)).getAllByRole('button')[0]!)
      await waitFor(() => expect(row(id).classList.contains('wb-shell-tree-row-picked')).toBe(true))
    }
    await pick('n-r1')
    expect([hintOf('되풀이'), hintOf('행 꼴')]).toEqual(['이 행을 몇 줄로 그릴지 — 둘째 줄부터는 첫 줄과 같은 꼴입니다', null])
    await pick('n-k1')
    expect([hintOf('가로 칸 수'), hintOf('세로 칸 수')]).toEqual([
      '이 칸이 덮는 열 수 — 행의 칸 수 합이 열 수와 같아야 합니다',
      '아래로 덮는 줄 수 — 아래 행의 칸은 덮인 열을 건너뜁니다',
    ])
    await pick('n-grid')
    expect(hintOf('고정 열 수')).toBe('가로로 굴려도 왼쪽에 남는 열 수 — 선택 · 번호 열도 셉니다')
    await pick('n-c1')
    expect([hintOf('열 폭'), hintOf('머리 이름')]).toEqual(['정하지 않으면 칸 글이 한 줄로 길어집니다 — 꺾으려면 폭을 정하세요', null])
  })

  /** 여럿 고른 판의 속성 패널도 같은 안내를 든다(리뷰 변조 X10 — 하나 고른 판만 재던 빈칸). */
  it('행 둘을 고른 판에도 «되풀이» 칸 밑에 안내', async () => {
    await board()
    // 줄의 노드 단추(`.wb-shell-structure-node`)에 Ctrl 클릭 — `./multiselect-gestures.test.tsx` 와 같은 꼴.
    const nodeButton = (id: string) => row(id).querySelector<HTMLElement>('.wb-shell-structure-node')!
    fireEvent.click(nodeButton('n-r1'))
    fireEvent.click(nodeButton('n-r2'), { ctrlKey: true })
    await waitFor(() => expect(row('n-r2').classList.contains('wb-shell-tree-row-picked')).toBe(true))
    // 여럿 고른 판의 패널이다(머리가 «GridRow 2개»).
    expect(screen.getByRole('tabpanel', { name: '속성' }).textContent).toContain('GridRow 2개')
    expect([hintOf('되풀이'), hintOf('행 꼴')]).toEqual(['이 행을 몇 줄로 그릴지 — 둘째 줄부터는 첫 줄과 같은 꼴입니다', null])
  })
})
