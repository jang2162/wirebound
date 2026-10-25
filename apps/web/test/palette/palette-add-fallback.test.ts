/**
 * **팔레트 넣기 «안» 이 거절되면 «뒤»**(`src/palette/palette-add.ts` 머리말 · 설계 spec `2026-10-25-grid-design.md` «8» · GR-B 2). 고른 노드의 몸통이
 * 넣을 것을 받는 타입 · 설 자리(`fitRefusal`)에 걸리면 그 노드 바로 뒤에 선다 — 열을 골라 «열» · «열 묶음», 행을 골라 «행», 칸을 골라 «칸», 탭을 골라
 * 글. 몸통이 받는 것은 그대로 «안» 이다. 물러선 «뒤» 도 못 서면 «안» 의 까닭, 고른 노드를 남이 잡았으면 잎의 «뒤» 와 같은 잠금 문장이다.
 */
import { describe, expect, it } from 'vitest'
import type { NodeLock, PageDocument, PatchOp } from '@wirebound/schema'
import '../../src/catalog-setup'
import { fitRefusal, type Placing } from '../../src/edit/structure-drop'
import { paletteAddTarget } from '../../src/palette/palette-add'
import { lockedSelectionStatus } from '../../src/panels/toolbar-status'

/**
 * ```
 * n-root (Page)
 * ├ n-grid (DataGrid) — 열 [n-c1 [n-t1] · n-g (열 묶음) [n-c2]] · 행 [n-row [n-cell] · n-row2] · 바닥 [n-pg]
 * ├ n-tabs (Tabs) [n-tp (TabPanel)]
 * └ n-text (Text)
 * ```
 */
function doc(): PageDocument {
  return {
    version: 5,
    root: {
      id: 'n-root',
      type: 'Page',
      children: [
        {
          id: 'n-grid',
          type: 'DataGrid',
          children: [
            { id: 'n-c1', type: 'GridColumn', children: [{ id: 'n-t1', type: 'Text' }] },
            { id: 'n-g', type: 'GridColumnGroup', children: [{ id: 'n-c2', type: 'GridColumn' }] },
          ],
          zones: {
            rows: [
              { id: 'n-row', type: 'GridRow', children: [{ id: 'n-cell', type: 'GridCell' }] },
              { id: 'n-row2', type: 'GridRow' },
            ],
            footer: [{ id: 'n-pg', type: 'Pagination' }],
          },
        },
        { id: 'n-tabs', type: 'Tabs', children: [{ id: 'n-tp', type: 'TabPanel', props: { label: '탭 1' } }] },
        { id: 'n-text', type: 'Text' },
      ],
    },
  }
}

const free = (): NodeLock | null => null
const adding = (type: string): Extract<Placing, { kind: 'new' }> => ({ kind: 'new', type })
const BOB: NodeLock = { nodeId: 'n-c1', userId: 'u-bob', userName: '밥', connectionId: 'c-bob', expiresAt: 0 } as NodeLock

const add = (input: Partial<Parameters<typeof paletteAddTarget>[0]>): ReturnType<typeof paletteAddTarget> =>
  paletteAddTarget({ document: doc(), selectedNodeId: null, placing: adding('Text'), blockedBy: free, lockedBy: () => null, ...input })

describe('«안» 이 거절되면 «뒤»', () => {
  it('열을 골라 «열» · «열 묶음» 은 그 열 뒤 — 열 묶음 안의 열이면 그 묶음 안', () => {
    expect(add({ selectedNodeId: 'n-c1', placing: adding('GridColumn') })).toEqual({
      ok: true,
      target: { parentId: 'n-grid', index: 1, placement: 'after' },
    })
    expect(add({ selectedNodeId: 'n-c1', placing: adding('GridColumnGroup') })).toEqual({
      ok: true,
      target: { parentId: 'n-grid', index: 1, placement: 'after' },
    })
    expect(add({ selectedNodeId: 'n-c2', placing: adding('GridColumn') })).toEqual({
      ok: true,
      target: { parentId: 'n-g', index: 1, placement: 'after' },
    })
  })

  it('행을 골라 «행» 은 그 행 뒤(«행» 구역) · 칸을 골라 «칸» 은 그 칸 뒤', () => {
    expect(add({ selectedNodeId: 'n-row', placing: adding('GridRow') })).toEqual({
      ok: true,
      target: { parentId: 'n-grid', zone: 'rows', index: 1, placement: 'after' },
    })
    expect(add({ selectedNodeId: 'n-cell', placing: adding('GridCell') })).toEqual({
      ok: true,
      target: { parentId: 'n-row', index: 1, placement: 'after' },
    })
  })

  it('모듈(행 하나 묶음)도 같다 — 행을 고르면 그 뒤', () => {
    const module: Extract<Placing, { kind: 'module' }> = { kind: 'module', key: 'm', nodes: [{ id: 'm-row', type: 'GridRow' }] }
    expect(add({ selectedNodeId: 'n-row2', placing: module })).toEqual({
      ok: true,
      target: { parentId: 'n-grid', zone: 'rows', index: 2, placement: 'after' },
    })
  })

  it('그리드 밖 타입도 같다 — 탭을 골라 글은 탭 뒤', () => {
    expect(add({ selectedNodeId: 'n-tabs' })).toEqual({ ok: true, target: { parentId: 'n-root', index: 2, placement: 'after' } })
  })

  it('몸통이 받으면 그대로 «안» — 열을 골라 글은 셀 틀 끝 · 행을 골라 «칸» 은 행 몸통 끝', () => {
    expect(add({ selectedNodeId: 'n-c1' })).toEqual({ ok: true, target: { parentId: 'n-c1', index: 1, placement: 'inside' } })
    expect(add({ selectedNodeId: 'n-row', placing: adding('GridCell') })).toEqual({
      ok: true,
      target: { parentId: 'n-row', index: 1, placement: 'inside' },
    })
  })
})

describe('물러선 «뒤» 도 못 서면', () => {
  it('뒤도 설 자리 밖이면 «안» 의 까닭 — 그리드를 골라 «행»(뒤는 페이지 몸통)', () => {
    expect(add({ selectedNodeId: 'n-grid', placing: adding('GridRow') })).toEqual({
      ok: false,
      reason: fitRefusal('DataGrid', 'body', 'GridRow'),
    })
  })

  it('뒤 자리의 편집이 남의 잠금에 부딪히면 «안» 의 까닭 — 넣지 않는다', () => {
    const blockedBy = (ops: readonly PatchOp[]): NodeLock | null =>
      ops.some((op) => op.path.startsWith('/root/children/0/children/1')) ? BOB : null
    expect(add({ selectedNodeId: 'n-c1', placing: adding('GridColumn'), blockedBy })).toEqual({
      ok: false,
      reason: fitRefusal('GridColumn', 'body', 'GridColumn'),
    })
  })

  it('고른 노드를 남이 잡았으면 잎의 «뒤» 와 같은 잠금 문장', () => {
    expect(add({ selectedNodeId: 'n-c1', placing: adding('GridColumn'), lockedBy: (id) => (id === 'n-c1' ? BOB : null) })).toEqual({
      ok: false,
      reason: lockedSelectionStatus('밥'),
    })
  })
})
