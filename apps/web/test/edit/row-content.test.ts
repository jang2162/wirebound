/**
 * **그리드 행 «행 내용: 기본 / 커스텀»**(`src/edit/row-content.ts` 머리말) — 베껴 넣기(기본 → 커스텀) · 걷기(커스텀 → 기본)가 검증 · lint 를 지나고 화면
 * 배치(`gridLayout`)가 베끼기 전과 같은가 · 첫 행 · 잃을 것이 있는가 · 걷기의 전제.
 */
import { describe, expect, it } from 'vitest'
import { applyOps, BODY_ZONE, lintDesign, validatePage, zoneList, type PageDocument, type WbNode } from '@wirebound/schema'
import { gridLayout, type GridBodyCell, type ViewItem } from '@wirebound/theme-sdk'
import '../../src/catalog-setup'
import { buildCellsOps, buildCellsRefusal, FIRST_ROW_WHY, GAP_ROW_WHY } from '../../src/edit/grid-row-actions'
import { cellsToLose, clearCellsOps, rowContentOf, toBasicRefusal } from '../../src/edit/row-content'

function counter(): () => string {
  let n = 0
  return () => `new${++n}`
}

function find(node: WbNode, id: string): WbNode | undefined {
  if (node.id === id) return node
  for (const child of [...(node.children ?? []), ...Object.values(node.zones ?? {}).flat()]) {
    const hit = find(child, id)
    if (hit !== undefined) return hit
  }
  return undefined
}

function applied(document: PageDocument, edit: ReturnType<typeof buildCellsOps>): PageDocument {
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

/** 구역의 노드들 — `zoneList` 는 원소를 `unknown` 으로 낸다. */
function nodesIn(node: WbNode, zone: string): WbNode[] {
  return zoneList(node, zone) as WbNode[]
}

function itemOf(node: WbNode, index: number): ViewItem {
  return {
    nodeId: node.id,
    type: node.type,
    index,
    props: (node.props ?? {}) as Record<string, unknown>,
    element: null,
    content: null,
    get items() {
      return nodesIn(node, BODY_ZONE).map(itemOf)
    },
    copy: () => ({ element: null, content: null }),
  }
}

/** 칸 안 조각의 꼴 — 타입과 글(번호 칸은 번호 글). id 는 안 본다. */
function piecesOf(items: readonly ViewItem[]): string[] {
  return items.map((item) => `${item.type}:${String(item.props.content ?? item.props.label ?? item.props.value ?? '')}`)
}

/** 화면 배치 — 줄마다 칸의 [자리 · 가로 · 세로 · 고정 · 안의 조각]. 셀 틀 · 번호 · 빈 칸과 제 칸을 같은 꼴로 편다. */
function layoutOf(document: PageDocument, gridId: string): unknown[] {
  const grid = find(document.root, gridId)!
  const layout = gridLayout(
    nodesIn(grid, BODY_ZONE).map(itemOf),
    nodesIn(grid, 'rows').map(itemOf),
    (grid.props ?? {}) as Record<string, unknown>,
  )
  const cell = (body: GridBodyCell): unknown => {
    switch (body.kind) {
      case 'select':
        return ['select', body.col, body.fixed]
      case 'gap':
        return ['gap', body.colSpan]
      case 'number':
        return [body.col, 1, 1, body.fixed, [`Text:${body.value}`]]
      case 'template':
        return [body.col, 1, 1, body.fixed, piecesOf(body.leaf.item.items)]
      case 'blank':
        return [body.col, 1, 1, body.fixed, []]
      case 'own':
        return [body.col, body.colSpan, body.rowSpan, body.fixed, piecesOf(body.item.items)]
    }
  }
  return [layout.width, layout.head.length, ...layout.lines.map((line) => [line.kind, line.cells.map(cell)])]
}

const column = (id: string, label: string, pieces: WbNode[], props: Record<string, unknown> = {}): WbNode => ({
  id,
  type: 'GridColumn',
  props: { label, ...props },
  children: pieces,
})

/** 열 묶음(열 둘) · 번호 열 · 선택 열(check) · 고정 열 2 · 빈 열 묶음 — 행: 첫 행 · 둘째 행 · 합계. */
const wide = (): PageDocument => ({
  version: 5,
  root: {
    id: 'n-root',
    type: 'Page',
    children: [
      {
        id: 'n-grid',
        type: 'DataGrid',
        props: { select: 'check', fixedColumns: 2 },
        children: [
          column('n-no', 'No', [{ id: 'n-no-t', type: 'Text', props: { content: '무시' } }], { numbering: 'asc' }),
          {
            id: 'n-group',
            type: 'GridColumnGroup',
            props: { label: '인적 사항' },
            children: [
              column('n-name', '이름', [{ id: 'n-name-i', type: 'Input', props: { placeholder: '이름' } }]),
              column('n-tel', '전화', [{ id: 'n-tel-t', type: 'Text', props: { content: '010' } }]),
            ],
          },
          { id: 'n-empty', type: 'GridColumnGroup', props: { label: '빈 묶음' } },
          column('n-del', '삭제', [{ id: 'n-del-b', type: 'Button', props: { label: '삭제' } }]),
        ],
        zones: {
          rows: [
            { id: 'n-r1', type: 'GridRow' },
            { id: 'n-r2', type: 'GridRow' },
            { id: 'n-r3', type: 'GridRow', props: { repeat: 2 } },
            { id: 'n-total', type: 'GridRow', props: { kind: 'total' } },
          ],
        },
      },
    ],
  },
})

/** 열 셋(셀 틀 입력 둘 · 단추) — 반복 행 표 꼴 · 행 둘. */
const three = (): PageDocument => ({
  version: 5,
  root: {
    id: 'n-root',
    type: 'Page',
    children: [
      {
        id: 'n-grid',
        type: 'DataGrid',
        children: [
          column('n-a', '항목 1', [{ id: 'n-a-i', type: 'Input' }]),
          column('n-b', '항목 2', [{ id: 'n-b-i', type: 'Input' }]),
          column('n-c', '삭제', [{ id: 'n-c-b', type: 'Button', props: { label: '삭제' } }]),
        ],
        zones: {
          rows: [
            { id: 'n-r1', type: 'GridRow' },
            { id: 'n-r2', type: 'GridRow' },
          ],
        },
      },
    ],
  },
})

describe('베껴 넣기 · 걷기 — 검증 · 배치', () => {
  for (const [name, doc, rowId] of [
    ['열 묶음 · 번호 열 · 선택 열 · 고정 열 · 빈 열 묶음', wide, 'n-r2'],
    ['열 셋(반복 행 표)', three, 'n-r2'],
  ] as const)
    it(`${name} — 커스텀으로 베낀 칸이 지금 화면과 같은 배치 · 검증 · lint 0 · 걷으면 처음 문서`, () => {
      const document = doc()
      expect(rowContentOf(document, rowId)).toBe('basic')
      const before = layoutOf(document, 'n-grid')
      const custom = applied(document, buildCellsOps(document, rowId, counter()))
      expect(rowContentOf(custom, rowId)).toBe('custom')
      expect(errorsOf(custom)).toEqual([])
      expect(rowCellIssues(custom)).toEqual([])
      expect(layoutOf(custom, 'n-grid')).toEqual(before)

      const back = applied(custom, clearCellsOps(custom, rowId))
      expect(rowContentOf(back, rowId)).toBe('basic')
      expect(errorsOf(back)).toEqual([])
      expect(back).toEqual(document)
    })

  /**
   * **되풀이 2 이상인 행의 번호는 굳는다**(`grid-row-actions.ts` 머리말 «번호 열») — 제 칸 행은 번호를 안 센다. 칸 꼴(자리 · 폭)은 같고 둘째 줄의 번호 글만
   * 첫 줄의 수로 바뀐다. 이 판은 화면이 바뀌는 유일한 자리다(보고 «결정»).
   */
  it('되풀이 2 인 행은 칸 꼴이 같고 둘째 줄의 번호 글만 첫 줄 수로 굳는다', () => {
    const document = wide()
    const before = layoutOf(document, 'n-grid')
    const custom = applied(document, buildCellsOps(document, 'n-r3', counter()))
    const after = layoutOf(custom, 'n-grid')
    const changed = after.flatMap((line, at) => (JSON.stringify(line) === JSON.stringify(before[at]) ? [] : [at]))
    // 줄 차례: [폭, 머리 줄 수, 첫 행, 둘째 행, 셋째 행 줄 1, 줄 2, 합계] — 셋째 행의 둘째 줄(번호 4)만.
    expect(changed).toEqual([5])
    expect((after[5] as [string, unknown[]])[1][1]).toEqual([1, 1, 1, 'last', ['Text:3']])
    expect((before[5] as [string, unknown[]])[1][1]).toEqual([1, 1, 1, 'last', ['Text:4']])
  })
})

describe('첫 행', () => {
  it('첫 행은 커스텀으로 못 바꾼다(까닭) — 줄 행동 «열 틀로 칸 짓기» 도 같은 판정', () => {
    const document = three()
    expect(buildCellsRefusal(document, 'n-r1')).toBe(FIRST_ROW_WHY)
    expect(buildCellsOps(document, 'n-r1')).toEqual({ reason: FIRST_ROW_WHY })
    expect(buildCellsRefusal(document, 'n-r2')).toBeNull()
  })

  it('이미 칸을 가진 첫 행(합계 행이 첫 줄)은 커스텀으로 읽히고 기본으로 돌릴 수 있다', () => {
    const document = three()
    find(document.root, 'n-r1')!.children = [
      { id: 'n-k', type: 'GridCell', props: { span: 3 }, children: [{ id: 'n-k-t', type: 'Text', props: { content: '합계' } }] },
    ]
    expect(rowContentOf(document, 'n-r1')).toBe('custom')
    expect(toBasicRefusal(document, 'n-r1')).toBeNull()
    expect(cellsToLose(document, 'n-r1')).toBe(1)
    const back = applied(document, clearCellsOps(document, 'n-r1'))
    expect(find(back.root, 'n-r1')).toEqual({ id: 'n-r1', type: 'GridRow' })
  })
})

describe('잃을 것이 있는가', () => {
  /** 커스텀으로 바꾸고 아무것도 안 고친 칸은 걷어도 잃는 것이 없다 — 칸 안을 가리키는 상호작용이 사본으로 옮겨 간 판도 같은 꼴로 읽는다. */
  it('안 고친 칸은 0 · 칸 안 글 · 가로 칸 수 · 칸 지움 · 조각 더함은 칸 수', () => {
    const document = three()
    find(document.root, 'n-a')!.children = [
      {
        id: 'n-a-i',
        type: 'Input',
        interactions: [{ on: 'click', actions: [{ type: 'setVisible', target: 'n-a-x', value: false }] }],
      },
      { id: 'n-a-x', type: 'Text', props: { content: '설명' }, marker: 4 },
    ]
    const custom = applied(document, buildCellsOps(document, 'n-r2', counter()))
    expect(cellsToLose(custom, 'n-r2')).toBe(0)
    const cells = find(custom.root, 'n-r2')!.children!
    const rowPath = '/root/children/0/zones/rows/1/children'
    const edits: Record<string, Parameters<typeof applyOps>[1]> = {
      '칸 안 글': [{ op: 'add', path: `${rowPath}/1/children/0/props`, value: { value: '홍길동' } }],
      '가로 칸 수': [{ op: 'add', path: `${rowPath}/0/props`, value: { span: 2 } }],
      '칸 지움': [{ op: 'remove', path: `${rowPath}/2` }],
      '조각 더함': [{ op: 'add', path: `${rowPath}/2/children/1`, value: { id: 'n-more', type: 'Text' } }],
    }
    const lost = Object.fromEntries(Object.entries(edits).map(([name, ops]) => [name, cellsToLose(applyOps(custom, ops), 'n-r2')]))
    expect(lost).toEqual({ '칸 안 글': cells.length, '가로 칸 수': cells.length, '칸 지움': cells.length - 1, '조각 더함': cells.length })
    // 셀 틀이 그 뒤 바뀌면 칸은 지금 셀 틀과 달라 잃을 것이 있다(칸이 옛 셀 틀을 들고 있다).
    const template = applyOps(custom, [{ op: 'replace', path: '/root/children/0/children/2/children/0/props/label', value: '지우기' }])
    expect(cellsToLose(template, 'n-r2')).toBe(cells.length)
  })
})

describe('걷기', () => {
  it('전제 — 남이 그 사이 칸을 고쳤으면 안 얹힌다 · 다른 행의 고침에는 얹힌다', () => {
    const custom = applied(three(), buildCellsOps(three(), 'n-r2', counter()))
    const edit = clearCellsOps(custom, 'n-r2')
    if ('reason' in edit) throw new Error(edit.reason)
    expect(edit.ops.map((op) => `${op.op} ${op.path}`)).toEqual([
      'test /root/children/0/zones/rows/1/children',
      'remove /root/children/0/zones/rows/1/children',
    ])
    const theirs = applyOps(custom, [{ op: 'add', path: '/root/children/0/zones/rows/1/children/0/props', value: { span: 2 } }])
    expect(() => applyOps(theirs, edit.ops)).toThrow()
    const other = applyOps(custom, [{ op: 'add', path: '/root/children/0/zones/rows/0/props', value: { tone: 'selected' } }])
    expect(() => applyOps(other, edit.ops)).not.toThrow()
  })

  it('못 하는 판 — 칸 없는 행 · 생략 띠 · 행이 아님', () => {
    const document = three()
    expect('reason' in clearCellsOps(document, 'n-r2')).toBe(true)
    const custom = applied(document, buildCellsOps(document, 'n-r2', counter()))
    find(custom.root, 'n-r2')!.props = { kind: 'gap' }
    expect(toBasicRefusal(custom, 'n-r2')).toBe(GAP_ROW_WHY)
    expect(clearCellsOps(custom, 'n-r2')).toEqual({ reason: GAP_ROW_WHY })
    expect(rowContentOf(document, 'n-a')).toBeNull()
    expect('reason' in clearCellsOps(document, 'n-a')).toBe(true)
  })
})
