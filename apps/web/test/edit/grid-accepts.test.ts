/**
 * **그리드의 받는 규칙 · 설 자리 — 부모를 바꾸는 입구 여섯마다**(설계 spec `2026-10-25-grid-design.md` «8» 의 «받는 규칙»). 그리드 몸통은 열 · 열
 * 묶음만, «행» 구역은 행만, 행 몸통은 칸만 받고, 열 · 열 묶음 · 행 · 칸은 제 자리에만 선다. 입구 — 끌기(캔버스 · 구조 트리 — `dropRefusal` ·
 * `zoneDropTarget`) · 팔레트 넣기 · 모듈 넣기(`paletteAddTarget`) · 붙이기(`pasteOps`) · 들여쓰기 · 내어쓰기(`levelRefusals`)가 다 `fitRefusal` 을
 * 지난다. 문장의 글자는 «문장» 케이스 하나가 갖고, 나머지는 «어느 입구에서 그 문장이 서나» 를 잰다.
 */
import { describe, expect, it } from 'vitest'
import type { NodeLock, PageDocument, WbNode } from '@wirebound/schema'
import '../../src/catalog-setup'
import { pasteOps } from '../../src/edit/paste-ops'
import { levelRefusals } from '../../src/edit/structure-actions'
import { dropRefusal, fitRefusal, zoneDropTarget, type Placing } from '../../src/edit/structure-drop'
import { paletteAddTarget } from '../../src/palette/palette-add'

/**
 * ```
 * n-root (Page)
 * ├ n-grid (DataGrid) — 열 [n-c1 [n-t1] · n-g (열 묶음) [n-c2]] · 행 [n-row [n-cell]] · 바닥 [n-pg]
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
            rows: [{ id: 'n-row', type: 'GridRow', children: [{ id: 'n-cell', type: 'GridCell' }] }],
            footer: [{ id: 'n-pg', type: 'Pagination' }],
          },
        },
        { id: 'n-text', type: 'Text' },
      ],
    },
  }
}

const free = (): NodeLock | null => null
const adding = (type: string): Placing => ({ kind: 'new', type })
const moving = (id: string): Placing => ({ kind: 'node', id })
const TEXT: WbNode = { id: 'n-new', type: 'Text', props: { content: '새 글' } }

const COLUMNS_ONLY = fitRefusal('DataGrid', 'body', 'Text')
const ROWS_ONLY = fitRefusal('DataGrid', 'rows', 'Text')
const CELLS_ONLY = fitRefusal('GridRow', 'body', 'Text')
const COLUMN_PLACE = fitRefusal('Card', 'body', 'GridColumn')

describe('문장', () => {
  it('받는 타입 밖 · 설 자리 밖 · 설 수 있는 판', () => {
    expect(COLUMNS_ONLY).toBe('그리드에는 열 · 열 묶음만 놓을 수 있습니다')
    expect(fitRefusal('GridColumnGroup', 'body', 'Text')).toBe('열 묶음에는 열 · 열 묶음만 놓을 수 있습니다')
    expect(ROWS_ONLY).toBe('그리드 행에는 행만 놓을 수 있습니다')
    expect(CELLS_ONLY).toBe('행에는 칸만 놓을 수 있습니다')
    expect(COLUMN_PLACE).toBe('열은 그리드 · 열 묶음 안에만 놓을 수 있습니다')
    expect(fitRefusal('Card', 'body', 'GridCell')).toBe('칸은 행 안에만 놓을 수 있습니다')
    expect(fitRefusal('Card', 'body', 'GridRow')).toBe('행은 그리드 행 안에만 놓을 수 있습니다')
    // 설 수 있는 판 — 열은 그리드 · 열 묶음 몸통에 · 셀 틀(열 몸통)은 무엇이든 받는다 · 바닥은 무엇이든 받는다.
    expect(fitRefusal('DataGrid', 'body', 'GridColumn')).toBeNull()
    expect(fitRefusal('GridColumnGroup', 'body', 'GridColumnGroup')).toBeNull()
    expect(fitRefusal('GridColumn', 'body', 'Button')).toBeNull()
    expect(fitRefusal('DataGrid', 'footer', 'Button')).toBeNull()
  })
})

describe('끌기 — 캔버스 · 구조 트리', () => {
  it('열 곁 · 그리드 «열» 구역 끝에 글을 놓으면 거절 — 셀 틀 «안» 은 받는다', () => {
    expect(dropRefusal(doc(), adding('Text'), 'n-c1', 'after')).toBe(COLUMNS_ONLY)
    expect(zoneDropTarget(doc(), adding('Text'), 'n-grid', 'body', free)).toBeNull()
    expect(dropRefusal(doc(), adding('Text'), 'n-c1', 'inside')).toBeNull()
  })

  it('있는 노드를 «행» 구역 · 행 몸통으로 옮기면 거절 · 열을 페이지로 옮기면 거절', () => {
    expect(zoneDropTarget(doc(), moving('n-text'), 'n-grid', 'rows', free)).toBeNull()
    expect(dropRefusal(doc(), moving('n-text'), 'n-cell', 'after')).toBe(CELLS_ONLY)
    expect(dropRefusal(doc(), moving('n-c1'), 'n-text', 'after')).toBe(COLUMN_PLACE)
    // 카나리아 — 열을 열 묶음 안으로는 옮길 수 있다.
    expect(dropRefusal(doc(), moving('n-c1'), 'n-c2', 'after')).toBeNull()
  })
})

describe('팔레트 넣기 · 모듈 넣기', () => {
  const add = (input: Partial<Parameters<typeof paletteAddTarget>[0]>): ReturnType<typeof paletteAddTarget> =>
    paletteAddTarget({ document: doc(), selectedNodeId: null, placing: adding('Text'), blockedBy: free, lockedBy: () => null, ...input })

  it('그리드 «열» · «행» 구역을 골라 글을 넣으면 이유 문장', () => {
    expect(add({ selectedZone: { parentId: 'n-grid', zone: 'body' } })).toEqual({ ok: false, reason: COLUMNS_ONLY })
    expect(add({ selectedZone: { parentId: 'n-grid', zone: 'rows' } })).toEqual({ ok: false, reason: ROWS_ONLY })
  })

  it('모듈(글 하나 묶음)을 행 · 열 묶음에 넣으면 이유 문장 — 바닥은 받는다', () => {
    const module: Placing = { kind: 'module', key: 'm', nodes: [TEXT] }
    expect(add({ placing: module, selectedZone: { parentId: 'n-row', zone: 'body' } })).toEqual({ ok: false, reason: CELLS_ONLY })
    expect(add({ placing: module, selectedZone: { parentId: 'n-g', zone: 'body' } })).toEqual({
      ok: false,
      reason: fitRefusal('GridColumnGroup', 'body', 'Text'),
    })
    expect(add({ placing: module, selectedZone: { parentId: 'n-grid', zone: 'footer' } })).toMatchObject({ ok: true })
  })
})

describe('붙이기', () => {
  it('그리드 몸통 · 행 몸통에 글을 붙이면 이유 문장 · 셀 틀은 받는다', () => {
    expect(pasteOps(doc(), { parentId: 'n-grid', zone: 'body' }, [TEXT])).toEqual({ reason: COLUMNS_ONLY })
    expect(pasteOps(doc(), { parentId: 'n-row', zone: 'body' }, [TEXT])).toEqual({ reason: CELLS_ONLY })
    expect('ops' in pasteOps(doc(), { parentId: 'n-c1', zone: 'body' }, [TEXT])).toBe(true)
  })
})

describe('들여쓰기 · 내어쓰기', () => {
  it('열 뒤 열 · 열 묶음을 들여쓰면(앞 열의 셀 틀로) 거절 · 열 묶음 뒤 열은 그 묶음으로 간다', () => {
    const grid: PageDocument = doc()
    // 열 묶음 뒤에 열 둘을 더 세운다 — 앞 형제가 열 묶음인 판(n-c3) · 앞 형제가 열인 판(n-c4).
    ;(grid.root.children![0]!.children as WbNode[]).push({ id: 'n-c3', type: 'GridColumn' }, { id: 'n-c4', type: 'GridColumn' })
    expect(levelRefusals(grid, 'n-c4').indent).toBe(COLUMN_PLACE)
    expect(levelRefusals(grid, 'n-g').indent).toBe(fitRefusal('Card', 'body', 'GridColumnGroup'))
    expect(levelRefusals(grid, 'n-c3').indent).toBeNull()
  })

  it('그리드 뒤 글을 들여쓰면(그리드 «열» 로) 거절', () => {
    expect(levelRefusals(doc(), 'n-text').indent).toBe(COLUMNS_ONLY)
  })

  it('그리드 몸통의 열을 내어쓰면(페이지로) 거절 · 셀 틀의 글을 내어쓰면(그리드 «열» 로) 거절 · 열 묶음 안 열은 그리드로 나간다', () => {
    expect(levelRefusals(doc(), 'n-c1').outdent).toBe(COLUMN_PLACE)
    expect(levelRefusals(doc(), 'n-t1').outdent).toBe(COLUMNS_ONLY)
    expect(levelRefusals(doc(), 'n-c2').outdent).toBeNull()
  })
})
