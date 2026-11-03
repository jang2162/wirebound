/**
 * **그리드 행 줄 행동 — «한 행 떼어 내기» · «열 틀로 칸 짓기»**(`src/edit/grid-row-actions.ts` 머리말). 묶음이 무엇을 내는가 · 얹은 문서가 검증 · lint
 * `grid-row-cells` 를 지나는가 · 못 하는 판의 까닭.
 */
import { describe, expect, it } from 'vitest'
import { actionTarget, applyOps, lintDesign, validatePage, type PageDocument, type WbNode } from '@wirebound/schema'
import '../../src/catalog-setup'
import {
  BUILD_CELLS_WHY,
  COVERED_ROW_WHY,
  GAP_ROW_WHY,
  SPLIT_ROW_WHY,
  TARGETED_ROW_WHY,
  buildCellsOps,
  buildCellsReads,
  buildCellsRefusal,
  splitRowOps,
  splitRowRefusal,
} from '../../src/edit/grid-row-actions'

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
      'test /root/children/0/zones/rows/0',
      'remove /root/children/0/zones/rows/0/props/repeat',
      'add /root/children/0/zones/rows/1',
    ])
    // 전제는 지은 판의 행 통째 — 아래 «전제» 케이스가 칸마다 잰다.
    expect(edit.ops[0]).toMatchObject({ value: find(document.root, 'n-row') })
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

  /**
   * **전제는 행 통째**(머리말 «전제» · 리뷰 H1). 남이 그 행의 칸 하나를 바꾼 문서에는 묶음이 안 얹힌다 — 있던 칸을 바꾼 판 · 없던 칸을 처음 단 판 둘 다.
   * 남이 다른 행을 고친 판은 그대로 얹힌다(전제가 그 행만 본다).
   */
  it('전제 — 남이 그 행의 별칭 · props · 보임 · 상호작용 · 제 칸 · 번호를 바꿨으면 안 얹힌다 · 다른 행의 고침에는 얹힌다', () => {
    const document = page({
      id: 'n-grid',
      type: 'DataGrid',
      children: [column('n-c1', [])],
      zones: {
        rows: [
          {
            id: 'n-row',
            type: 'GridRow',
            props: { repeat: 3 },
            children: [{ id: 'n-k', type: 'GridCell', children: [{ id: 'n-x', type: 'Text', props: { content: '옛' } }] }],
          },
          { id: 'n-last', type: 'GridRow' },
        ],
      },
    })
    const edit = splitRowOps(document, 'n-row', counter())
    if ('reason' in edit) throw new Error(edit.reason)
    const row = '/root/children/0/zones/rows/0'
    const theirs: Record<string, unknown[]> = {
      별칭: [{ op: 'add', path: `${row}/alias`, value: '밥' }],
      되풀이: [{ op: 'replace', path: `${row}/props/repeat`, value: 7 }],
      '행 꼴': [{ op: 'add', path: `${row}/props/tone`, value: 'dimmed' }],
      보임: [{ op: 'add', path: `${row}/visibility`, value: { mode: 'except', states: ['default'] } }],
      상호작용: [
        {
          op: 'add',
          path: `${row}/interactions`,
          value: [{ on: 'click', actions: [{ type: 'setVisible', target: 'n-row', value: false }] }],
        },
      ],
      '제 칸 글': [{ op: 'replace', path: `${row}/children/0/children/0/props/content`, value: '밥' }],
      '제 칸 더함': [{ op: 'add', path: `${row}/children/1`, value: { id: 'n-bob', type: 'GridCell' } }],
      번호: [{ op: 'add', path: `${row}/marker`, value: 9 }],
    }
    const landed = Object.fromEntries(
      Object.entries(theirs).map(([name, ops]) => {
        const changed = applyOps(document, ops as Parameters<typeof applyOps>[1])
        try {
          applyOps(changed, edit.ops)
          return [name, '얹힘']
        } catch {
          return [name, '안 얹힘']
        }
      }),
    )
    expect(landed).toEqual(Object.fromEntries(Object.keys(theirs).map((name) => [name, '안 얹힘'])))
    const other = applyOps(document, [{ op: 'add', path: '/root/children/0/zones/rows/1/props', value: { tone: 'dimmed' } }])
    expect(() => applyOps(other, edit.ops)).not.toThrow()
  })

  /**
   * **바깥의 상호작용이 그 행을 가리키면 못 뗀다**(머리말 · 리뷰 M5) — 뒤 행은 새 id 라 바깥 동작이 첫 줄에만 닿는다. 행 안 · 행 자신의 상호작용은 사본을
   * 따라가 뗄 수 있다. 행 안 노드를 가리키는 바깥 동작도 못 뗀다.
   */
  it('바깥 노드의 상호작용이 그 행(이나 그 안)을 가리키면 못 뗀다 · 행 안의 상호작용은 뗄 수 있다', () => {
    const build = (button: WbNode['interactions'], inner: WbNode['interactions']): PageDocument =>
      page(
        {
          id: 'n-grid',
          type: 'DataGrid',
          children: [column('n-c1', [])],
          zones: {
            rows: [
              {
                id: 'n-row',
                type: 'GridRow',
                props: { repeat: 4 },
                ...(inner === undefined ? {} : { interactions: inner }),
                children: [{ id: 'n-k', type: 'GridCell', children: [{ id: 'n-x', type: 'Text' }] }],
              },
            ],
          },
        },
        [{ id: 'n-button', type: 'Button', props: { label: '숨김' }, ...(button === undefined ? {} : { interactions: button }) }],
      )
    const hide = (target: string): WbNode['interactions'] => [{ on: 'click', actions: [{ type: 'setVisible', target, value: false }] }]
    const verdicts = {
      바깥에서행: splitRowRefusal(build(hide('n-row'), undefined), 'n-row'),
      바깥에서칸안: splitRowRefusal(build(hide('n-x'), undefined), 'n-row'),
      바깥에서다른노드: splitRowRefusal(build(hide('n-grid'), undefined), 'n-row'),
      행자신: splitRowRefusal(build(undefined, hide('n-row')), 'n-row'),
      없음: splitRowRefusal(build(undefined, undefined), 'n-row'),
    }
    expect(verdicts).toEqual({
      바깥에서행: TARGETED_ROW_WHY,
      바깥에서칸안: TARGETED_ROW_WHY,
      바깥에서다른노드: null,
      행자신: null,
      없음: null,
    })
    expect(splitRowOps(build(hide('n-row'), undefined), 'n-row')).toEqual({ reason: TARGETED_ROW_WHY })
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
    // 전제(열 트리) 하나 + 칸 다섯.
    expect(edit.ops).toHaveLength(6)
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
    expect(copied.interactions!.map((interaction) => actionTarget(interaction.actions[0]!))).toEqual([button.id, 'n-outside'])
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

  it('칸 배열이 이미 있으면(빈 배열) 그 배열이 비었다는 전제를 앞에 둔다 — 남이 그 사이 칸을 넣었으면 묶음째 안 얹힌다', () => {
    const document = doc()
    find(document.root, 'n-r2')!.children = []
    const edit = buildCellsOps(document, 'n-r2', counter())
    if ('reason' in edit) throw new Error(edit.reason)
    expect(edit.ops[1]).toEqual({ op: 'test', path: '/root/children/0/zones/rows/1/children', value: [] })
    const theirs = applyOps(document, [
      { op: 'add', path: '/root/children/0/zones/rows/1/children/0', value: { id: 'n-bob', type: 'GridCell' } },
    ])
    expect(() => applyOps(theirs, edit.ops)).toThrow()
    // 배열이 없던 판은 칸 배열의 전제 없이 첫 `add` 가 배열째 짓는다(리베이스의 전제가 지킨다).
    const bare = buildCellsOps(doc(), 'n-r2', counter())
    if ('reason' in bare) throw new Error(bare.reason)
    expect(bare.ops.map((op) => `${op.op} ${op.path}`)).toEqual([
      'test /root/children/0/children',
      'add /root/children/0/zones/rows/1/children',
      'add /root/children/0/zones/rows/1/children/1',
      'add /root/children/0/zones/rows/1/children/2',
      'add /root/children/0/zones/rows/1/children/3',
      'add /root/children/0/zones/rows/1/children/4',
    ])
  })

  /**
   * **전제는 그 그리드의 열 트리 통째**(머리말 «전제» · 리뷰 M3). 남이 열을 더하거나 · 지우거나 · 옮기거나 · 셀 틀을 고쳤으면 안 얹힌다(칸 수가 잎 열 수와
   * 어긋나거나 낡은 셀 틀을 베낀다). 남이 다른 행을 고친 판은 얹힌다.
   */
  it('전제 — 남이 열을 더함 · 지움 · 옮김 · 열 묶음 안에 더함 · 셀 틀 고침이면 안 얹힌다 · 다른 행의 고침에는 얹힌다', () => {
    const document = doc()
    const edit = buildCellsOps(document, 'n-r2', counter())
    if ('reason' in edit) throw new Error(edit.reason)
    expect(edit.ops[0]).toEqual({ op: 'test', path: '/root/children/0/children', value: find(document.root, 'n-grid')!.children })
    const grid = '/root/children/0'
    const theirs: Record<string, unknown[]> = {
      '열 더함': [{ op: 'add', path: `${grid}/children/5`, value: column('n-bob', []) }],
      '열 지움': [{ op: 'remove', path: `${grid}/children/2` }],
      '열 옮김': [{ op: 'move', from: `${grid}/children/2`, path: `${grid}/children/1` }],
      '묶음 안에 더함': [{ op: 'add', path: `${grid}/children/4/children/1`, value: column('n-bob', []) }],
      '셀 틀 고침': [{ op: 'replace', path: `${grid}/children/2/children/0/props/content`, value: '밥' }],
    }
    const landed = Object.fromEntries(
      Object.entries(theirs).map(([name, ops]) => {
        try {
          applyOps(applyOps(document, ops as Parameters<typeof applyOps>[1]), edit.ops)
          return [name, '얹힘']
        } catch {
          return [name, '안 얹힘']
        }
      }),
    )
    expect(landed).toEqual(Object.fromEntries(Object.keys(theirs).map((name) => [name, '안 얹힘'])))
    const other = applyOps(document, [{ op: 'replace', path: `${grid}/zones/rows/0/props/repeat`, value: 2 }])
    expect(() => applyOps(other, edit.ops)).not.toThrow()
  })

  /** **상태로 숨은 열도 칸을 받는다**(머리말 «문서의 열 전부를 센다») — 칸 폭 합이 잎 열 수와 같아야 lint 가 안 선다. */
  it('화면 상태에서 숨은 열도 칸을 받는다 — 칸 수 = 잎 열 수 · lint 0', () => {
    const document: PageDocument = {
      ...page({
        id: 'n-grid',
        type: 'DataGrid',
        children: [
          column('n-a', [{ id: 'n-ta', type: 'Text', props: { content: 'A' } }]),
          { ...column('n-b', [{ id: 'n-tb', type: 'Text', props: { content: 'B' } }]), visibility: { mode: 'except', states: ['s_x'] } },
          column('n-c', [{ id: 'n-tc', type: 'Text', props: { content: 'C' } }]),
        ],
        // 첫 행은 늘 기본이라(`FIRST_ROW_WHY`) 칸은 둘째 행에 짓는다.
        zones: {
          rows: [
            { id: 'n-top', type: 'GridRow' },
            { id: 'n-r', type: 'GridRow', props: { repeat: 2 } },
          ],
        },
      }),
      viewStates: [{ id: 's_x', name: '요약' }],
    }
    const after = applied(document, buildCellsOps(document, 'n-r', counter()))
    expect(find(after.root, 'n-r')!.children!.map((cell) => cell.children?.[0]?.props?.content)).toEqual(['A', 'B', 'C'])
    expect(rowCellIssues(after)).toEqual([])
  })

  /**
   * **위 행의 세로 칸이 줄마다 다르게 덮으면 못 짓는다**(머리말 · 리뷰 M1). 위 행 첫 칸이 세로 2 · 아래 행이 되풀이 2 면 아래 행의 첫 줄만 덮인다 — 첫 줄에서
   * 읽은 칸 수(둘)로 지으면 둘째 줄의 칸이 왼쪽으로 밀린다. 세로 3(두 줄 다 덮임)이면 줄마다 같아 짓고 lint 0 이다.
   */
  it('위 행의 세로 칸이 되풀이 행의 첫 줄만 덮으면 못 짓는다(까닭) · 모든 줄을 덮으면 짓는다', () => {
    const under = (rowSpan: number): PageDocument =>
      page({
        id: 'n-grid',
        type: 'DataGrid',
        children: [column('n-a', [{ id: 'n-ta', type: 'Text' }]), column('n-b', [{ id: 'n-tb', type: 'Text' }]), column('n-c', [])],
        zones: {
          rows: [
            {
              id: 'n-head',
              type: 'GridRow',
              children: [
                { id: 'n-k1', type: 'GridCell', props: { rowSpan } },
                { id: 'n-k2', type: 'GridCell' },
                { id: 'n-k3', type: 'GridCell' },
              ],
            },
            { id: 'n-under', type: 'GridRow', props: { repeat: 2 } },
          ],
        },
      })
    expect(buildCellsRefusal(under(2), 'n-under')).toBe(COVERED_ROW_WHY)
    expect(buildCellsOps(under(2), 'n-under')).toEqual({ reason: COVERED_ROW_WHY })
    expect(buildCellsRefusal(under(3), 'n-under')).toBeNull()
    const after = applied(under(3), buildCellsOps(under(3), 'n-under', counter()))
    expect(find(after.root, 'n-under')!.children).toHaveLength(2)
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
