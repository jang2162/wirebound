/**
 * **그리드 행 줄 행동 — «한 행 떼어 내기» · «열 틀로 칸 짓기»**(`src/edit/grid-row-actions.ts` 머리말). 묶음이 무엇을 내는가 · 얹은 문서가 검증 · lint
 * `grid-row-cells` 를 지나는가 · 못 하는 판의 까닭.
 */
import { describe, expect, it } from 'vitest'
import { applyOps, lintDesign, validatePage, type PageDocument, type WbNode } from '@wirebound/schema'
import '../../src/catalog-setup'
import { BUILD_CELLS_WHY, GAP_ROW_WHY, SPLIT_ROW_WHY, buildCellsOps, buildCellsReads, splitRowOps } from '../../src/edit/grid-row-actions'

function counter(): () => string {
  let n = 0
  return () => `new${++n}`
}

function page(grid: WbNode, after: WbNode[] = []): PageDocument {
  return { version: 5, root: { id: 'n-root', type: 'Page', children: [grid, ...after] } }
}

function find(node: WbNode, id: string): WbNode | undefined {
  if (node.id === id) return node
  for (const child of [...(node.children ?? []), ...Object.values(node.zones ?? {}).flat()]) {
    const hit = find(child, id)
    if (hit !== undefined) return hit
  }
  return undefined
}

function applied(document: PageDocument, edit: ReturnType<typeof splitRowOps>): PageDocument {
  if ('reason' in edit) throw new Error(edit.reason)
  return applyOps(document, edit.ops)
}

function errorsOf(document: PageDocument): string[] {
  return validatePage(document)
    .filter((issue) => issue.severity === 'error')
    .map((issue) => issue.message)
}

function rowCellIssues(document: PageDocument): string[] {
  return lintDesign({
    menu: [{ id: 'm1', parentId: null, title: '관리자' }],
    pages: [{ id: 'pg', menuNodeId: 'm1', title: '목록', target: 'page:관리자/목록', document }],
    comments: [],
  })
    .filter((issue) => issue.rule === 'grid-row-cells')
    .map((issue) => `${issue.nodeId}: ${issue.message}`)
}

const column = (id: string, children: WbNode[], props: Record<string, unknown> = {}): WbNode => ({
  id,
  type: 'GridColumn',
  props: { label: id, ...props },
  children,
})

describe('한 행 떼어 내기', () => {
  /** 되풀이 5 · 강조 · 별칭 · 코멘트 번호를 단 행 하나와 그 뒤 행. */
  const doc = (): PageDocument =>
    page({
      id: 'n-grid',
      type: 'DataGrid',
      children: [column('n-c1', [{ id: 'n-t1', type: 'Text', props: { content: '값' } }])],
      zones: {
        rows: [
          { id: 'n-row', type: 'GridRow', alias: '강조 행', marker: 3, props: { repeat: 5, tone: 'selected' } },
          { id: 'n-last', type: 'GridRow' },
        ],
      },
    })

  it('앞 행이 원본 id · 별칭 · 번호를 지키고 되풀이를 걷는다 · 뒤 행은 새 id 에 되풀이 n − 1 · 같은 꼴 · 번호 없음 — 묶음 둘', () => {
    const document = doc()
    const edit = splitRowOps(document, 'n-row', counter())
    if ('reason' in edit) throw new Error(edit.reason)
    expect(edit.ops.map((op) => `${op.op} ${op.path}`)).toEqual([
      'remove /root/children/0/zones/rows/0/props/repeat',
      'add /root/children/0/zones/rows/1',
    ])
    const after = applyOps(document, edit.ops)
    const rows = find(after.root, 'n-grid')!.zones!.rows!
    expect(rows).toEqual([
      { id: 'n-row', type: 'GridRow', alias: '강조 행', marker: 3, props: { tone: 'selected' } },
      { id: edit.insertedIds[0], type: 'GridRow', alias: '강조 행', props: { repeat: 4, tone: 'selected' } },
      { id: 'n-last', type: 'GridRow' },
    ])
    expect(errorsOf(after)).toEqual([])
  })

  it('되풀이 2 면 뒤 행도 되풀이 1(키 없음) · 제 칸을 가진 행은 칸째 새 id 로 · 두 번 떼면 첫 둘이 하나씩', () => {
    const two = doc()
    find(two.root, 'n-row')!.props = { repeat: 2 }
    const once = applied(two, splitRowOps(two, 'n-row', counter()))
    expect(find(once.root, 'n-grid')!.zones!.rows!.map((row) => [row.id, row.props ?? null])).toEqual([
      ['n-row', {}],
      ['new2', null],
      ['n-last', null],
    ])

    const owned = page({
      id: 'n-grid',
      type: 'DataGrid',
      children: [column('n-c1', [])],
      zones: {
        rows: [
          {
            id: 'n-row',
            type: 'GridRow',
            props: { repeat: 3 },
            children: [{ id: 'n-cell', type: 'GridCell', children: [{ id: 'n-x', type: 'Text', props: { content: '제 칸' } }] }],
          },
        ],
      },
    })
    const ids = counter()
    const split = applied(owned, splitRowOps(owned, 'n-row', ids))
    const tail = find(split.root, 'n-grid')!.zones!.rows![1]!
    expect(tail).toEqual({
      id: 'new2',
      type: 'GridRow',
      props: { repeat: 2 },
      children: [{ id: 'new3', type: 'GridCell', children: [{ id: 'new4', type: 'Text', props: { content: '제 칸' } }] }],
    })
    // 둘째 떼기 — 뒤 행(되풀이 2)을 다시 떼면 [1 · 1 · 1].
    const again = applied(split, splitRowOps(split, 'new2', ids))
    expect(find(again.root, 'n-grid')!.zones!.rows!.map((row) => (row.props?.repeat as number | undefined) ?? 1)).toEqual([1, 1, 1])
    expect(errorsOf(again)).toEqual([])
  })

  it('못 하는 판 — 되풀이 1 · 생략 띠 · 행이 아님', () => {
    const document = doc()
    expect(splitRowOps(document, 'n-last')).toEqual({ reason: SPLIT_ROW_WHY })
    find(document.root, 'n-row')!.props = { repeat: 5, kind: 'gap' }
    expect(splitRowOps(document, 'n-row')).toEqual({ reason: GAP_ROW_WHY })
    expect('reason' in splitRowOps(document, 'n-c1')).toBe(true)
    expect('reason' in splitRowOps(document, 'n-gone')).toBe(true)
  })
})

describe('열 틀로 칸 짓기', () => {
  /**
   * 선택 열 · 번호 열(asc) · 셀 틀 둘(단추 + 입력 · 글 — 글은 단추를 가리키는 상호작용 · 바깥 글을 가리키는 상호작용 · 번호 표지) · 빈 열 묶음 · 열 묶음 안
   * 열 하나. 행: 되풀이 3 → 칸 없는 행 → 합계 행.
   */
  const doc = (): PageDocument =>
    page(
      {
        id: 'n-grid',
        type: 'DataGrid',
        props: { select: 'check' },
        children: [
          column('n-no', [{ id: 'n-no-t', type: 'Text', props: { content: '무시' } }], { numbering: 'asc' }),
          column('n-c1', [
            { id: 'n-b', type: 'Button', props: { label: '수정' } },
            { id: 'n-i', type: 'Input' },
          ]),
          column('n-c2', [
            {
              id: 'n-t',
              type: 'Text',
              marker: 7,
              props: { content: '홍길동' },
              interactions: [
                { on: 'click', actions: [{ type: 'setVisible', target: 'n-b', value: false }] },
                { on: 'click', actions: [{ type: 'setVisible', target: 'n-outside', value: false }] },
              ],
            },
          ]),
          { id: 'n-empty', type: 'GridColumnGroup', props: { label: '빈 묶음' } },
          { id: 'n-g', type: 'GridColumnGroup', props: { label: '묶음' }, children: [column('n-c3', [{ id: 'n-t3', type: 'Text' }])] },
        ],
        zones: {
          rows: [
            { id: 'n-r1', type: 'GridRow', props: { repeat: 3 } },
            { id: 'n-r2', type: 'GridRow' },
            { id: 'n-total', type: 'GridRow', props: { kind: 'total' } },
          ],
        },
      },
      [{ id: 'n-outside', type: 'Text', props: { content: '바깥' } }],
    )

  it('잎 열마다 칸 — 번호 열은 그 줄의 번호 글 · 셀 틀 열은 셀 틀 사본(새 id · 번호 걷음 · 안을 가리키던 대상은 사본을 따라감) · 빈 열 묶음은 빈 칸', () => {
    const document = doc()
    const edit = buildCellsOps(document, 'n-r2', counter())
    if ('reason' in edit) throw new Error(edit.reason)
    expect(edit.ops).toHaveLength(5)
    const after = applyOps(document, edit.ops)
    const cells = find(after.root, 'n-r2')!.children!
    expect(cells.map((cell) => [cell.type, (cell.children ?? []).map((child) => child.type)])).toEqual([
      ['GridCell', ['Text']],
      ['GridCell', ['Button', 'Input']],
      ['GridCell', ['Text']],
      ['GridCell', []],
      ['GridCell', ['Text']],
    ])
    // 번호 — 앞 행 되풀이 3 뒤 넷째 데이터 줄.
    expect(cells[0]!.children![0]!.props).toEqual({ content: '4' })
    const copied = cells[2]!.children![0]!
    const button = cells[1]!.children![0]!
    expect(copied.marker).toBeUndefined()
    expect(copied.props).toEqual({ content: '홍길동' })
    expect(copied.interactions!.map((interaction) => interaction.actions[0]!.target)).toEqual([button.id, 'n-outside'])
    // 새 id 는 원본과 겹치지 않는다 · 셀 틀은 그대로다.
    for (const id of ['n-b', 'n-i', 'n-t', 'n-t3'])
      expect(cells.flatMap((cell) => (cell.children ?? []).map((child) => child.id))).not.toContain(id)
    expect(find(after.root, 'n-c2')!.children).toEqual(find(document.root, 'n-c2')!.children)
    expect(find(after.root, 'n-t')!.marker).toBe(7)
    expect(errorsOf(after)).toEqual([])
    expect(rowCellIssues(after)).toEqual([])
  })

  it('번호 열 desc · 합계 행은 빈 칸만 · 셀 틀을 읽은 열(잠금을 볼 열)', () => {
    const document = doc()
    find(document.root, 'n-no')!.props = { label: 'No', numbering: 'desc' }
    const desc = applied(document, buildCellsOps(document, 'n-r2', counter()))
    // 데이터 줄 넷(3 + 1) 가운데 넷째 → desc 1.
    expect(find(desc.root, 'n-r2')!.children![0]!.children![0]!.props).toEqual({ content: '1' })

    const total = applied(document, buildCellsOps(document, 'n-total', counter()))
    expect(find(total.root, 'n-total')!.children!.map((cell) => (cell.children ?? []).length)).toEqual([0, 0, 0, 0, 0])
    expect(rowCellIssues(total)).toEqual([])

    expect(buildCellsReads(document, 'n-r2')).toEqual(['n-c1', 'n-c2', 'n-c3'])
    expect(buildCellsReads(document, 'n-total')).toEqual([])
  })

  it('위 행의 세로 칸이 덮은 열은 건너뛴다 — 칸 폭 합이 열 수와 맞는다', () => {
    const document = page({
      id: 'n-grid',
      type: 'DataGrid',
      children: [column('n-a', [{ id: 'n-ta', type: 'Text' }]), column('n-b', [{ id: 'n-tb', type: 'Text' }]), column('n-c', [])],
      zones: {
        rows: [
          {
            id: 'n-head',
            type: 'GridRow',
            children: [
              { id: 'n-k1', type: 'GridCell', props: { rowSpan: 2 } },
              { id: 'n-k2', type: 'GridCell' },
              { id: 'n-k3', type: 'GridCell' },
            ],
          },
          { id: 'n-under', type: 'GridRow' },
        ],
      },
    })
    const after = applied(document, buildCellsOps(document, 'n-under', counter()))
    expect(find(after.root, 'n-under')!.children!.map((cell) => (cell.children ?? []).map((child) => child.type))).toEqual([['Text'], []])
    expect(rowCellIssues(after)).toEqual([])
  })

  it('못 하는 판 — 칸을 가진 행 · 생략 띠 · 행이 아님', () => {
    const document = doc()
    const built = applied(document, buildCellsOps(document, 'n-r2', counter()))
    expect(buildCellsOps(built, 'n-r2')).toEqual({ reason: BUILD_CELLS_WHY })
    find(document.root, 'n-r1')!.props = { kind: 'gap' }
    expect(buildCellsOps(document, 'n-r1')).toEqual({ reason: GAP_ROW_WHY })
    expect('reason' in buildCellsOps(document, 'n-c1')).toBe(true)
  })
})
