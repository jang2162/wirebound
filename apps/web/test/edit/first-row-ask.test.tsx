/**
 * **커스텀 행이 첫 자리로 오는 편집의 확인**(`src/edit/first-row-ask.ts` · `src/edit/use-edit-commit.tsx` 의 `commitOps` · `src/shell/first-row-dialog.tsx`)
 * — 판정 표와 셸에 붙은 입구(키 · 줄 메뉴 · 삭제 · 잘라내기)의 jsdom 판. 끌기(캔버스 손잡이 · 구조 트리)와 묻는 사이 남의 편집이 닿는 판은
 * 실브라우저(`build-test/first-row-ask.test.ts`)가 잰다.
 *
 * 입구 셈(설계서 §9 «행 내용» — 부모 · 차례를 바꾸는 입구 전부가 `commitOps` 하나를 지난다):
 *
 * | 입구 | 첫 자리로 오는가 | 판 |
 * |---|---|---|
 * | 위로(Alt+↑ · 줄 메뉴) | 커스텀인 둘째 행을 올림 | «위로 — Alt+↑» |
 * | 아래로(Alt+↓ · 줄 메뉴) | 기본인 첫 행을 내림 | «아래로 — 줄 메뉴» |
 * | 삭제(Delete · 줄 메뉴) · 잘라내기 | 기본인 첫 행을 지움 | «삭제 — Delete» · «잘라내기» |
 * | 여럿 삭제(Delete · 타입이 섞인 고름의 «고른 노드 삭제») | 기본인 첫 행을 함께 지움 | «여럿 삭제 — …» 둘 |
 * | 끌기(캔버스 손잡이 · 구조 트리) | 커스텀 행을 첫 자리에 놓음 | 실브라우저 |
 * | 들여쓰기 · 내어쓰기 | 못 온다 — 행은 «행» 구역에만 선다(`accepts`) | — |
 * | 복제 · 붙이기 · 모듈 넣기 | 못 온다 — 복제는 바로 뒤, 붙이기는 고른 것 뒤 · 구역 끝이다(빈 구역에 넣은 행은 앞 첫 행이 없어 안 묻는다) | — |
 * | 되돌리기 · 다시 실행 | 묻지 않는다 — 앞 판으로 돌아간다(`commitOps` 를 안 지난다) | «다시 실행은 묻지 않는다» |
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { applyOps, invertOps, type PageDocument, type PatchOp, type WbNode } from '@wirebound/schema'
import { beforeAll, describe, expect, it } from 'vitest'
import type { ApiClient } from '../../src/api/client'
import type { PageDetail, PatchResult } from '../../src/api/types'
import { FIRST_ROW_ASK_CONFIRM, FIRST_ROW_ASK_TITLE, customRowLeads } from '../../src/edit/first-row-ask'
import { HEAD_SEQ, openPage, pageDetail, pageDoc } from '../editor-harness'
import { installPointerEvents } from '../pointer-events'
import '../../src/catalog-setup'
import { rowAction } from '../panels/tree-row'

beforeAll(installPointerEvents)

const cell = (id: string): WbNode => ({ id, type: 'GridCell' })

/** 행 셋 — 기본 `n-r1` · 커스텀 `n-own` · 기본 `n-r2`. */
function doc(
  rows: WbNode[] = [
    { id: 'n-r1', type: 'GridRow' },
    { id: 'n-own', type: 'GridRow', children: [cell('n-k1'), cell('n-k2')] },
    { id: 'n-r2', type: 'GridRow' },
  ],
): PageDocument {
  return pageDoc({
    id: 'n-root',
    type: 'Page',
    children: [
      {
        id: 'n-grid',
        type: 'DataGrid',
        children: [
          { id: 'n-c1', type: 'GridColumn', props: { label: '이름' }, children: [{ id: 'n-t1', type: 'Text', props: { content: '값' } }] },
          { id: 'n-c2', type: 'GridColumn', props: { label: '상태' } },
        ],
        zones: { rows },
      },
    ],
  })
}

const rowIds = (document: PageDocument): string[] => (document.root.children![0]!.zones!.rows ?? []).map((row) => row.id)

describe('판정 — customRowLeads', () => {
  const move = (from: number, to: number): PatchOp[] => [
    { op: 'move', from: `/root/children/0/zones/rows/${from}`, path: `/root/children/0/zones/rows/${to}` },
  ]

  it('묻는 판 — 커스텀 행을 첫 자리로 올림 · 기본인 첫 행을 내림 · 첫 행을 지움', () => {
    const before = doc()
    expect(customRowLeads(before, applyOps(before, move(1, 0)))).toEqual({ gridId: 'n-grid', rowId: 'n-own' })
    expect(customRowLeads(before, applyOps(before, move(0, 1)))).toEqual({ gridId: 'n-grid', rowId: 'n-own' })
    expect(customRowLeads(before, applyOps(before, [{ op: 'remove', path: '/root/children/0/zones/rows/0' }]))).toEqual({
      gridId: 'n-grid',
      rowId: 'n-own',
    })
  })

  it('안 묻는 판 — 기본 행끼리 · 이미 커스텀이 첫 행 · 기본 행이 안 남음 · 새 그리드 · 첫 행을 커스텀으로 짓기는 판정이 아니다', () => {
    const before = doc()
    // 기본 행끼리 바꿈(첫 행이 여전히 기본).
    const swapped = applyOps(before, move(2, 0))
    expect(customRowLeads(before, swapped)).toBeNull()
    // 이미 커스텀이 첫 행.
    const led = applyOps(before, move(1, 0))
    expect(customRowLeads(led, applyOps(led, move(1, 2)))).toBeNull()
    // 기본 행이 안 남는다 — 다른 꼴이 될 행이 없다.
    const two = doc([
      { id: 'n-r1', type: 'GridRow' },
      { id: 'n-own', type: 'GridRow', children: [cell('n-k1')] },
    ])
    expect(customRowLeads(two, applyOps(two, [{ op: 'remove', path: '/root/children/0/zones/rows/0' }]))).toBeNull()
    // 새 그리드(붙임 · 모듈) — 그 문서에서 이미 그 꼴이다.
    const bare = pageDoc({ id: 'n-root', type: 'Page', children: [] })
    expect(
      customRowLeads(
        bare,
        applyOps(bare, [{ op: 'add', path: '/root/children/0', value: applyOps(before, move(1, 0)).root.children![0] }]),
      ),
    ).toBeNull()
    // 생략 띠가 첫 행이던 판은 기본으로 센다 — 묻는다(띠도 칸이 없다).
    const gap = doc([
      { id: 'n-gap', type: 'GridRow', props: { kind: 'gap' } },
      { id: 'n-own', type: 'GridRow', children: [cell('n-k1')] },
      { id: 'n-r2', type: 'GridRow' },
    ])
    expect(customRowLeads(gap, applyOps(gap, move(0, 2)))?.rowId).toBe('n-own')
  })
})

interface Board {
  calls: PatchOp[][]
  held: () => PageDocument
}

async function board(start: PageDocument = doc()): Promise<Board> {
  const calls: PatchOp[][] = []
  let seq = HEAD_SEQ
  let held = start
  const patchOps: ApiClient['patchOps'] = async (_projectId, _pageId, body) => {
    calls.push(body.ops)
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
  await openPage(start, { apiOverrides: { patchOps, getPage, listComments: async () => [] } })
  return { calls, held: () => held }
}

function structureRegion(): HTMLElement {
  return screen.getByRole('region', { name: '구조 트리' })
}

function row(id: string): HTMLElement {
  const found = structureRegion().querySelector<HTMLElement>(`[data-tree-row][data-tree-id="${id}"]`)
  if (found === null) throw new Error(`구조 트리에 ${id} 줄이 없다`)
  return found
}

function rowButton(id: string): HTMLElement {
  return row(id).querySelector<HTMLElement>('button.wb-shell-structure-node')!
}

function pick(id: string): void {
  fireEvent.click(rowButton(id))
}

const asking = (): HTMLElement | null => screen.queryByRole('dialog', { name: FIRST_ROW_ASK_TITLE })

/** 상자가 선 뒤 잠깐 — 낸 편집이 있으면 그 사이 대역에 닿는다. */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((done) => setTimeout(done, 30))
  })
}

function confirm(): void {
  fireEvent.click(within(asking()!).getByRole('button', { name: FIRST_ROW_ASK_CONFIRM }))
}

function cancel(): void {
  fireEvent.click(within(asking()!).getByRole('button', { name: '취소' }))
}

describe('입구 — 묻고, 취소면 아무것도 안 내고, 계속이면 낸다', () => {
  it('위로 — Alt+↑ 로 커스텀인 둘째 행을 올리면 묻는다 · 취소 0 · 계속 1', async () => {
    const b = await board()
    pick('n-own')
    fireEvent.keyDown(rowButton('n-own'), { key: 'ArrowUp', altKey: true })
    await settle()
    expect({ 상자: asking() !== null, 보냄: b.calls.length }).toEqual({ 상자: true, 보냄: 0 })
    cancel()
    await settle()
    expect({ 상자: asking() !== null, 보냄: b.calls.length, 행: rowIds(b.held()) }).toEqual({
      상자: false,
      보냄: 0,
      행: ['n-r1', 'n-own', 'n-r2'],
    })
    fireEvent.keyDown(rowButton('n-own'), { key: 'ArrowUp', altKey: true })
    await waitFor(() => expect(asking()).not.toBeNull())
    confirm()
    await waitFor(() => expect(b.calls).toHaveLength(1))
    expect(rowIds(b.held())).toEqual(['n-own', 'n-r1', 'n-r2'])
  })

  it('아래로 — 줄 메뉴 «아래로» 로 기본인 첫 행을 내리면 묻는다 · 계속이면 낸다', async () => {
    const b = await board()
    pick('n-r1')
    fireEvent.click(rowAction(structureRegion(), '아래로', row('n-r1')))
    await settle()
    expect({ 상자: asking() !== null, 보냄: b.calls.length }).toEqual({ 상자: true, 보냄: 0 })
    confirm()
    await waitFor(() => expect(b.calls).toHaveLength(1))
    expect(rowIds(b.held())).toEqual(['n-own', 'n-r1', 'n-r2'])
  })

  it('삭제 — Delete 로 기본인 첫 행을 지우면 묻는다 · Escape 는 취소 · 줄 메뉴 «삭제» 도 묻고 계속이면 지운 뒤 부모를 고른다', async () => {
    const b = await board()
    pick('n-r1')
    fireEvent.keyDown(document.body, { key: 'Delete' })
    await settle()
    expect({ 상자: asking() !== null, 보냄: b.calls.length }).toEqual({ 상자: true, 보냄: 0 })
    fireEvent.keyDown(asking()!, { key: 'Escape' })
    await settle()
    expect({ 상자: asking() !== null, 보냄: b.calls.length }).toEqual({ 상자: false, 보냄: 0 })
    pick('n-r1')
    fireEvent.click(rowAction(structureRegion(), '삭제', row('n-r1')))
    await waitFor(() => expect(asking()).not.toBeNull())
    confirm()
    await waitFor(() => expect(b.calls).toHaveLength(1))
    // 낸 뒤의 일(`after`) — 묻지 않은 줄 «삭제» 와 같게 부모가 골라진다.
    const picked = [...structureRegion().querySelectorAll('.wb-shell-structure-node[aria-current="true"]')].map((node) =>
      node.closest('[data-tree-row]')?.getAttribute('data-tree-id'),
    )
    expect({ 행: rowIds(b.held()), 고른: picked }).toEqual({ 행: ['n-own', 'n-r2'], 고른: ['n-grid'] })
  })

  it('잘라내기 — 기본인 첫 행을 잘라내면 묻는다 · 취소면 문서가 그대로다', async () => {
    const b = await board()
    pick('n-r1')
    const event = new Event('cut', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: { setData: () => {}, getData: () => '' } })
    document.body.dispatchEvent(event)
    await settle()
    expect({ 상자: asking() !== null, 보냄: b.calls.length }).toEqual({ 상자: true, 보냄: 0 })
    cancel()
    await settle()
    expect({ 보냄: b.calls.length, 행: rowIds(b.held()) }).toEqual({ 보냄: 0, 행: ['n-r1', 'n-own', 'n-r2'] })
  })
})

describe('여럿 삭제 — 고른 것 전부를 묶음 하나로 지우는 길도 묻는다', () => {
  /** 기본 행 셋 사이에 커스텀 행 — 기본인 `n-r1` · `n-r2` 를 함께 지우면 첫 행이 `n-own` 이 되고 기본 행 `n-r3` 이 남는다. */
  const fourRows = (): PageDocument =>
    doc([
      { id: 'n-r1', type: 'GridRow' },
      { id: 'n-own', type: 'GridRow', children: [cell('n-k1'), cell('n-k2')] },
      { id: 'n-r2', type: 'GridRow' },
      { id: 'n-r3', type: 'GridRow' },
    ])

  it('Delete — Ctrl 클릭으로 고른 기본 행 둘을 지우면 묻는다 · 취소 0 · 계속이면 한 묶음으로 지우고 선택을 비운다(묻지 않은 키보드 삭제와 같다)', async () => {
    const b = await board(fourRows())
    pick('n-r1')
    fireEvent.click(rowButton('n-r2'), { ctrlKey: true })
    fireEvent.keyDown(document.body, { key: 'Delete' })
    await settle()
    expect({ 상자: asking() !== null, 보냄: b.calls.length }).toEqual({ 상자: true, 보냄: 0 })
    cancel()
    await settle()
    expect({ 상자: asking() !== null, 보냄: b.calls.length, 행: rowIds(b.held()) }).toEqual({
      상자: false,
      보냄: 0,
      행: ['n-r1', 'n-own', 'n-r2', 'n-r3'],
    })
    fireEvent.keyDown(document.body, { key: 'Delete' })
    await waitFor(() => expect(asking()).not.toBeNull())
    confirm()
    await waitFor(() => expect(b.calls).toHaveLength(1))
    const picked = [...structureRegion().querySelectorAll('.wb-shell-structure-node[aria-current="true"]')].map((node) =>
      node.closest('[data-tree-row]')?.getAttribute('data-tree-id'),
    )
    expect({ 행: rowIds(b.held()), 고른: picked, 묶음: b.calls[0]!.filter((op) => op.op === 'remove').length }).toEqual({
      행: ['n-own', 'n-r3'],
      고른: [],
      묶음: 2,
    })
  })

  it('«고른 노드 삭제» — 타입이 섞인 고름(기본인 첫 행 · 열의 글)을 지우면 묻는다 · 계속이면 한 묶음으로 낸다', async () => {
    const b = await board()
    pick('n-r1')
    fireEvent.click(rowButton('n-t1'), { ctrlKey: true })
    fireEvent.click(screen.getByRole('button', { name: '고른 노드 삭제' }))
    await settle()
    expect({ 상자: asking() !== null, 보냄: b.calls.length }).toEqual({ 상자: true, 보냄: 0 })
    confirm()
    await waitFor(() => expect(b.calls).toHaveLength(1))
    // 묻지 않은 판은 낸 뒤 선택을 비운다(`onRemoved`) — 물은 판은 `after` 가 없어도 지운 노드가 고름에서 빠져 같은 값이다.
    const picked = [...structureRegion().querySelectorAll('.wb-shell-structure-node[aria-current="true"]')].map((node) =>
      node.closest('[data-tree-row]')?.getAttribute('data-tree-id'),
    )
    expect({ 행: rowIds(b.held()), 고른: picked, 묶음: b.calls[0]!.filter((op) => op.op === 'remove').length }).toEqual({
      행: ['n-own', 'n-r2'],
      고른: [],
      묶음: 2,
    })
  })
})

describe('묻지 않는 판', () => {
  it('기본 행끼리 옮김은 묻지 않고 곧바로 낸다', async () => {
    const b = await board()
    pick('n-r2')
    fireEvent.keyDown(rowButton('n-r2'), { key: 'ArrowUp', altKey: true })
    await waitFor(() => expect(b.calls).toHaveLength(1))
    expect({ 상자: asking() !== null, 행: rowIds(b.held()) }).toEqual({ 상자: false, 행: ['n-r1', 'n-r2', 'n-own'] })
  })

  it('다시 실행은 묻지 않는다 — 물어서 낸 잘라내기를 되돌린 뒤 다시 실행하면 곧바로 낸다', async () => {
    const b = await board()
    pick('n-r1')
    const event = new Event('cut', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: { setData: () => {}, getData: () => '' } })
    document.body.dispatchEvent(event)
    await waitFor(() => expect(asking()).not.toBeNull())
    confirm()
    await waitFor(() => expect(b.calls).toHaveLength(1))
    fireEvent.keyDown(document.body, { key: 'z', code: 'KeyZ', ctrlKey: true })
    await waitFor(() => expect(b.calls).toHaveLength(2))
    fireEvent.keyDown(document.body, { key: 'y', code: 'KeyY', ctrlKey: true })
    await waitFor(() => expect(b.calls).toHaveLength(3))
    expect({ 상자: asking() !== null, 행: rowIds(b.held()) }).toEqual({ 상자: false, 행: ['n-own', 'n-r2'] })
  })
})
