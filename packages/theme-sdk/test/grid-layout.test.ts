/**
 * **그리드 배치**(`src/grid-layout.ts`) — 머리 줄의 `colspan` · `rowspan`, 몸 줄의 칸 차례(선택 · 번호 · 셀 틀 원본 · 제 칸 · 빈 칸 · 생략 띠), 세로 칸의
 * 덮임, 고정 열. 브라우저가 그 칸을 실제로 그 자리에 놓는지(상자 좌표 · 접근성 트리)는 실브라우저 판 `apps/web/build-test/data-grid.test.ts` 가 잰다.
 * 페이지네이션 바의 수(`paginationRange`)도 여기서 잰다.
 */
import { describe, expect, it } from 'vitest'
import { gridLayout, paginationRange, type GridBodyCell, type GridLayout, type ViewItem } from '@wirebound/theme-sdk'

const item = (nodeId: string, type: string, props: Record<string, unknown> = {}, items: ViewItem[] = []): ViewItem => ({
  nodeId,
  type,
  index: 0,
  props,
  element: null,
  content: null,
  items,
  copy: () => ({ element: null, content: null }),
})
const col = (id: string, props: Record<string, unknown> = {}) => item(id, 'GridColumn', props)
const group = (id: string, children: ViewItem[]) => item(id, 'GridColumnGroup', { label: id }, children)
const row = (id: string, props: Record<string, unknown> = {}, cells: ViewItem[] = []) => item(id, 'GridRow', props, cells)
const cell = (id: string, props: Record<string, unknown> = {}) => item(id, 'GridCell', props)

/** 머리 줄을 `id:colSpan×rowSpan@col` 글로. */
const headOf = (layout: GridLayout) =>
  layout.head.map((line) =>
    line.map((h) => (h.kind === 'select' ? `select:${h.rowSpan}` : `${h.item.nodeId}:${h.colSpan}×${h.rowSpan}@${h.col}`)),
  )

/** 몸 칸 하나를 짧은 글로. */
function short(c: GridBodyCell): string {
  switch (c.kind) {
    case 'select':
      return 'S'
    case 'number':
      return `#${c.value}`
    case 'template':
      return `${c.origin ? 'T' : 't'}:${c.leaf.item.nodeId}`
    case 'own':
      return `${c.copy ? 'o' : 'O'}:${c.item.nodeId}@${c.col}${c.colSpan > 1 ? `+${c.colSpan}` : ''}${c.rowSpan > 1 ? `v${c.rowSpan}` : ''}`
    case 'blank':
      return `_@${c.col}`
    case 'gap':
      return `gap+${c.colSpan}`
  }
}
const bodyOf = (layout: GridLayout) => layout.lines.map((line) => `${line.row.nodeId}.${line.line}|${line.cells.map(short).join(' ')}`)

describe('머리 줄 — 열 묶음의 깊이가 단이다', () => {
  it('묶음 없음 — 한 단 · 칸마다 1×1', () => {
    const layout = gridLayout([col('a'), col('b')], [], {})
    expect(layout.depth).toBe(1)
    expect(headOf(layout)).toEqual([['a:1×1@0', 'b:1×1@1']])
    expect(layout.width).toBe(2)
  })

  it('두 단 — 묶음은 아래 열 수만큼 가로로, 묶음 아닌 열은 두 줄을 세로로', () => {
    const layout = gridLayout([col('no'), group('g', [col('x'), col('y')]), col('z')], [], {})
    expect(headOf(layout)).toEqual([
      ['no:1×2@0', 'g:2×1@1', 'z:1×2@3'],
      ['x:1×1@1', 'y:1×1@2'],
    ])
    expect(layout.leaves.map((leaf) => leaf.item.nodeId)).toEqual(['no', 'x', 'y', 'z'])
  })

  it('세 단 — 월 › 일 › 요일. 선택 칸은 첫 줄에서 모든 단을 세로로 덮는다', () => {
    const month = group('m', [group('d1', [col('mon')]), group('d2', [col('tue'), col('wed')])])
    const layout = gridLayout([col('name'), month], [], { select: 'check' })
    expect(layout.depth).toBe(3)
    expect(headOf(layout)).toEqual([
      ['select:3', 'name:1×3@1', 'm:3×1@2'],
      ['d1:1×1@2', 'd2:2×1@3'],
      ['mon:1×1@2', 'tue:1×1@3', 'wed:1×1@4'],
    ])
    expect(layout.width).toBe(5)
  })

  it('빈 열 묶음은 한 칸을 차지한다(셀 틀은 없다 — 빈 칸)', () => {
    const layout = gridLayout([group('g', []), col('a')], [row('r')], {})
    expect(headOf(layout)).toEqual([['g:1×1@0', 'a:1×1@1']])
    expect(bodyOf(layout)).toEqual(['r.0|_@0 T:a'])
  })

  it('숨은 열은 목록에 없어 병합 머리가 다시 센다', () => {
    const layout = gridLayout([group('g', [col('x')])], [], {})
    expect(headOf(layout)).toEqual([['g:1×1@0'], ['x:1×1@0']])
  })
})

describe('몸 줄', () => {
  it('되풀이 — 셀 틀은 열마다 첫 줄이 원본, 나머지 줄은 사본 · 줄 번호는 1 부터', () => {
    const layout = gridLayout([col('a'), col('b')], [row('r', { repeat: 3 })], {})
    expect(bodyOf(layout)).toEqual(['r.0|T:a T:b', 'r.1|t:a t:b', 'r.2|t:a t:b'])
    expect(layout.lines.map((line) => line.number)).toEqual([1, 2, 3])
    expect(layout.linesOf.get('r')).toHaveLength(3)
  })

  it('번호 열 — 데이터 줄만 센다(합계 · 생략 띠는 안 센다) · desc 는 거꾸로', () => {
    const columns = [col('asc', { numbering: 'asc' }), col('desc', { numbering: 'desc' }), col('v')]
    // 합계 줄 · 생략 띠가 데이터 줄 사이에 서도 데이터 줄만 이어 센다.
    const layout = gridLayout(
      columns,
      [row('r1', { repeat: 2 }), row('gap', { kind: 'gap' }), row('sum', { kind: 'total' }), row('r2')],
      {},
    )
    expect(bodyOf(layout)).toEqual(['r1.0|#1 #3 T:v', 'r1.1|#2 #2 t:v', 'gap.0|gap+3', 'sum.0|_@0 _@1 _@2', 'r2.0|#3 #1 t:v'])
  })

  it('선택 칸 — 데이터 줄 맨 앞, 합계 줄은 빈 칸, 생략 띠는 선택 칸까지 덮는다', () => {
    const layout = gridLayout([col('a')], [row('r'), row('sum', { kind: 'total' }), row('gap', { kind: 'gap', repeat: 4 })], {
      select: 'radio',
    })
    expect(bodyOf(layout)).toEqual(['r.0|S T:a', 'sum.0|_@0 _@1', 'gap.0|gap+2'])
    expect(layout.select).toBe('radio')
  })

  it('제 칸을 가진 행은 제 칸만 — 앞에서부터 덮고 모자란 열은 빈 칸 · 넘친 칸은 그대로 선다', () => {
    const columns = [col('a'), col('b'), col('c')]
    const layout = gridLayout(
      columns,
      [row('short', {}, [cell('k1', { span: 2 })]), row('wide', {}, [cell('k2', { span: 3 }), cell('k3')]), row('tpl')],
      {},
    )
    expect(bodyOf(layout)).toEqual(['short.0|O:k1@0+2 _@2', 'wide.0|O:k2@0+3 O:k3@3', 'tpl.0|T:a T:b T:c'])
  })

  it('세로 칸 — 아래 줄의 그 열을 건너뛰고(셀 틀 줄도) · 생략 띠 · 표 끝에서 끊긴다', () => {
    const layout = gridLayout(
      [col('a'), col('b'), col('c')],
      [
        row('head', {}, [cell('h', { rowSpan: 9 }), cell('h2'), cell('h3')]),
        row('mid', {}, [cell('m1'), cell('m2')]),
        row('tpl'),
        row('gap', { kind: 'gap' }),
        row('after', { repeat: 2 }),
      ],
      {},
    )
    expect(bodyOf(layout)).toEqual([
      'head.0|O:h@0v3 O:h2@1 O:h3@2',
      'mid.0|O:m1@1 O:m2@2',
      'tpl.0|T:b T:c',
      'gap.0|gap+3',
      'after.0|T:a t:b t:c',
      'after.1|t:a t:b t:c',
    ])
  })

  it('제 칸을 가진 행의 되풀이 — 첫 줄이 원본, 나머지는 사본 · 칸 자리는 줄마다(사본은 `<칸 id>~<줄>`)', () => {
    const layout = gridLayout([col('a'), col('b')], [row('r', { repeat: 2 }, [cell('k', { span: 2 })])], {})
    expect(bodyOf(layout)).toEqual(['r.0|O:k@0+2', 'r.1|o:k@0+2'])
    expect([...layout.cellOf.keys()]).toEqual(['k', 'k~2'])
  })

  it('합계 줄 — 칸이 없으면 셀 틀이 아니라 빈 칸이다', () => {
    const layout = gridLayout([col('a'), col('b')], [row('sum', { kind: 'total' })], {})
    expect(bodyOf(layout)).toEqual(['sum.0|_@0 _@1'])
  })

  it('셀 틀의 원본은 덮이지 않은 첫 셀 틀 줄 — 세로 칸이 첫 줄의 그 열을 덮으면 다음 줄로 간다', () => {
    const layout = gridLayout(
      [col('a'), col('b')],
      [row('own', {}, [cell('k', { rowSpan: 2 }), cell('k2')]), row('tpl', { repeat: 2 })],
      {},
    )
    expect(bodyOf(layout)).toEqual(['own.0|O:k@0v2 O:k2@1', 'tpl.0|T:b', 'tpl.1|T:a t:b'])
  })
})

describe('고정 열 — 선택 · 번호 열을 센 왼쪽부터의 칸 수', () => {
  it('고정 구역 안 칸은 inside, 끝 칸은 last, 밖은 false · 걸친 묶음은 밖이다', () => {
    const layout = gridLayout([col('a'), group('g', [col('x'), col('y')])], [row('r')], { select: 'check', fixedColumns: 3 })
    expect(layout.fixed).toBe(3)
    expect(layout.head[0]!.map((h) => h.fixed)).toEqual(['inside', 'inside', false])
    expect(layout.head[1]!.map((h) => h.fixed)).toEqual(['last', false])
    expect(layout.lines[0]!.cells.map((c) => (c.kind === 'gap' ? null : c.fixed))).toEqual(['inside', 'inside', 'last', false])
  })

  it('표 칸 수보다 크면 표 칸 수로 자른다 · 0 이면 없다', () => {
    expect(gridLayout([col('a')], [], { fixedColumns: 20 }).fixed).toBe(1)
    expect(gridLayout([col('a')], [], {}).head[0]![0]!.fixed).toBe(false)
  })
})

describe('페이지네이션 바의 수(설계 Q3)', () => {
  const range = (total: number, pageSize: number, page: number) => {
    const r = paginationRange({ total, pageSize, page })
    return `${r.from}-${r.to}/${r.total} 쪽 ${r.page}/${r.pageCount} [${r.pages.join(',')}]`
  }

  it('기본 — 72 건 · 10 개씩 · 1쪽', () => {
    expect(range(72, 10, 1)).toBe('1-10/72 쪽 1/8 [1,2,3,4,5,6,7,8]')
  })

  it('0 건 — «0 - 0» · 쪽 하나', () => {
    expect(range(0, 10, 1)).toBe('0-0/0 쪽 1/1 [1]')
  })

  it('쪽 크기보다 적음 — 끝이 총 건수', () => {
    expect(range(3, 10, 1)).toBe('1-3/3 쪽 1/1 [1]')
  })

  it('마지막 쪽 — 끝이 총 건수', () => {
    expect(range(72, 10, 8)).toBe('71-72/72 쪽 8/8 [1,2,3,4,5,6,7,8]')
  })

  it('지금 쪽이 쪽 수보다 크면 마지막 쪽이다', () => {
    expect(range(72, 50, 9)).toBe('51-72/72 쪽 2/2 [1,2]')
  })

  // 쪽 번호는 자리 아홉이다 — 첫 쪽 · 끝 쪽은 늘 서고, 사이가 비면 «…»(설계 «5» 의 `« ‹ 1 2 … 9 › »`). `pages` 는 보이는 번호만 차례로 싣고
  // 이웃 번호가 1 보다 벌어진 자리가 «…» 다(`paginationRange` 머리말).
  it('쪽 수가 아홉 이하면 다 선다 · «…» 없음', () => {
    expect(range(90, 10, 1)).toBe('1-10/90 쪽 1/9 [1,2,3,4,5,6,7,8,9]')
    expect(range(90, 10, 9)).toBe('81-90/90 쪽 9/9 [1,2,3,4,5,6,7,8,9]')
  })

  it('쪽 수가 열부터 — 앞 · 둘째 · 앞 문턱(5 · 6) · 가운데 · 끝 문턱(쪽 수 − 4 · − 5) · 끝', () => {
    expect(range(100, 10, 1)).toBe('1-10/100 쪽 1/10 [1,2,3,4,5,6,7,10]')
    expect(range(1000, 10, 1)).toBe('1-10/1000 쪽 1/100 [1,2,3,4,5,6,7,100]')
    expect(range(1000, 10, 2)).toBe('11-20/1000 쪽 2/100 [1,2,3,4,5,6,7,100]')
    expect(range(1000, 10, 5)).toBe('41-50/1000 쪽 5/100 [1,2,3,4,5,6,7,100]')
    expect(range(1000, 10, 6)).toBe('51-60/1000 쪽 6/100 [1,4,5,6,7,8,100]')
    expect(range(1000, 10, 50)).toBe('491-500/1000 쪽 50/100 [1,48,49,50,51,52,100]')
    expect(range(1000, 10, 95)).toBe('941-950/1000 쪽 95/100 [1,93,94,95,96,97,100]')
    expect(range(1000, 10, 96)).toBe('951-960/1000 쪽 96/100 [1,94,95,96,97,98,99,100]')
    expect(range(1000, 10, 100)).toBe('991-1000/1000 쪽 100/100 [1,94,95,96,97,98,99,100]')
  })

  it('1,000,000 건 — 가운데 쪽 · 끝 쪽', () => {
    expect(range(1_000_000, 1, 500_000)).toBe('500000-500000/1000000 쪽 500000/1000000 [1,499998,499999,500000,500001,500002,1000000]')
    expect(range(1_000_000, 10, 99_999)).toBe('999981-999990/1000000 쪽 99999/100000 [1,99994,99995,99996,99997,99998,99999,100000]')
  })
})
