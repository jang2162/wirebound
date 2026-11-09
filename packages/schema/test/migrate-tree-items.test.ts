/**
 * **판 5 → 6 — 트리 항목을 계층으로**(`src/migrate-tree-items.ts`). 잰 성질: 판 5 의 화면(항목 i 의 단 `i % depth`)에서 단 L 인 항목이 그 앞의
 * 가장 가까운 단 L − 1 항목 밑으로 가고, 글 차례가 그대로다(깊이 1 · 2 · 5 · 항목 0 · 1 · 상한) · 옛 기본값으로 그린 노드는 그 값으로 옮긴다 ·
 * 자식이 있는 항목은 펼침이다 · 몸통 · 구역 안의 트리를 다 옮긴다 · 옮긴 문서는 판 6 검증을 지나고 옛 꼴은 판 6 에서 거절된다.
 *
 * 옮긴 문서의 **기본 뷰 DOM** 이 옛 기본 뷰 DOM 과 같은 단 · 글 차례인지는 렌더러 케이스가 잰다(`packages/renderer/test/tree-items-view.test.tsx`).
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { installCatalog, TREE_ITEMS_MAX, type TreeItem } from '../src/component/catalog/index'
import { CURRENT_DOCUMENT_VERSION, migrateDocument } from '../src/migrate'
import { liftTreeNodes, treeItemsFromFlat } from '../src/migrate-tree-items'
import type { PageDocument, WbNode } from '../src/node'
import { validatePage } from '../src/validate'

beforeAll(() => {
  installCatalog()
})

/** 판 5 화면의 (단, 글) 차례 — 옛 기본 뷰가 항목 i 를 `i % depth` 단으로 그렸다. */
function oldRows(items: readonly string[], depth: number): string[] {
  return items.map((label, index) => `${index % depth}:${label}`)
}

/** 판 6 계층의 (단, 글) 차례 — 위에서 아래로 펼친 차례(접힌 것도 편다 — 옮긴 문서는 모두 펼침이다). */
function newRows(items: readonly TreeItem[], level = 0): string[] {
  return items.flatMap((item) => [`${level}:${item.label}`, ...newRows(item.children ?? [], level + 1)])
}

/** 자식이 있는 항목이 전부 펼침이고, 자식 없는 항목에 `open` · 빈 `children` 이 없다. */
function openWhereParent(items: readonly TreeItem[]): boolean {
  return items.every((item) =>
    item.children === undefined
      ? item.open === undefined
      : item.children.length > 0 && item.open === true && openWhereParent(item.children),
  )
}

const labels = (count: number): string[] => Array.from({ length: count }, (_, index) => `항목 ${index + 1}`)

describe('treeItemsFromFlat — 판 5 의 단 그대로', () => {
  it.each([
    [1, 3],
    [2, 5],
    [5, 12],
    [2, 0],
    [3, 1],
  ])('깊이 %i · 항목 %i — 같은 단 · 같은 글 차례 · 부모는 모두 펼침', (depth, count) => {
    const flat = labels(count)
    const { items, dropped } = treeItemsFromFlat(flat, depth)
    expect(newRows(items)).toEqual(oldRows(flat, depth))
    expect(openWhereParent(items)).toBe(true)
    expect(dropped).toBe(0)
  })

  it('깊이 2 — 단 1 은 바로 앞 단 0 의 자식이다', () => {
    expect(treeItemsFromFlat(['가', '나', '다', '라', '마'], 2).items).toEqual([
      { label: '가', open: true, children: [{ label: '나' }] },
      { label: '다', open: true, children: [{ label: '라' }] },
      { label: '마' },
    ])
  })

  it('깊이 5 — 다섯 단의 사슬', () => {
    expect(treeItemsFromFlat(['1', '2', '3', '4', '5'], 5).items).toEqual([
      {
        label: '1',
        open: true,
        children: [
          {
            label: '2',
            open: true,
            children: [{ label: '3', open: true, children: [{ label: '4', open: true, children: [{ label: '5' }] }] }],
          },
        ],
      },
    ])
  })

  it('상한 — 100 개는 다 옮기고 101 째부터 버려 그 수를 센다', () => {
    const at = treeItemsFromFlat(labels(TREE_ITEMS_MAX), 3)
    expect(newRows(at.items)).toEqual(oldRows(labels(TREE_ITEMS_MAX), 3))
    expect(at.dropped).toBe(0)
    const over = treeItemsFromFlat(labels(TREE_ITEMS_MAX + 7), 3)
    expect(newRows(over.items)).toEqual(oldRows(labels(TREE_ITEMS_MAX), 3))
    expect(over.dropped).toBe(7)
  })

  it('깊이가 1 – 5 의 정수가 아니면 판 5 의 기본값 2 · 글이 아닌 원소는 버린다', () => {
    for (const depth of [undefined, 0, 6, 2.5, '3']) {
      expect(newRows(treeItemsFromFlat(['가', '나', '다'], depth).items)).toEqual(oldRows(['가', '나', '다'], 2))
    }
    expect(newRows(treeItemsFromFlat(['가', 7, '나', null], 1).items)).toEqual(['0:가', '0:나'])
  })
})

describe('liftTreeNodes — 노드 묶음', () => {
  it('몸통 · 구역 안의 트리를 옮기고 `depth` 를 걷는다 · 다른 prop · 노드 칸은 그대로 · 입력을 안 고친다', () => {
    const nodes = [
      {
        id: 'n_card',
        type: 'Card',
        children: [{ id: 'n_a', type: 'Tree', alias: '좌측 메뉴', props: { items: ['가', '나'], depth: 2, selected: true } }],
        zones: { head: [{ id: 'n_b', type: 'Tree', props: { items: ['다'], depth: 1 } }] },
      },
    ]
    const before = JSON.stringify(nodes)
    const out = liftTreeNodes(nodes)
    expect(JSON.stringify(nodes)).toBe(before)
    expect(out.moved).toBe(2)
    expect(out.nodes).toEqual([
      {
        id: 'n_card',
        type: 'Card',
        children: [
          {
            id: 'n_a',
            type: 'Tree',
            alias: '좌측 메뉴',
            props: { items: [{ label: '가', open: true, children: [{ label: '나' }] }], selected: true },
          },
        ],
        zones: { head: [{ id: 'n_b', type: 'Tree', props: { items: [{ label: '다' }] } }] },
      },
    ])
  })

  it('props · `items` 가 없는 트리는 판 5 의 기본값(«항목 1» 밑 «항목 2»)으로 옮긴다 — 그 값으로 그려졌다', () => {
    const out = liftTreeNodes([
      { id: 'n_a', type: 'Tree' },
      { id: 'n_b', type: 'Tree', props: { depth: 1 } },
    ])
    expect(out.nodes).toEqual([
      { id: 'n_a', type: 'Tree', props: { items: [{ label: '항목 1', open: true, children: [{ label: '항목 2' }] }] } },
      { id: 'n_b', type: 'Tree', props: { items: [{ label: '항목 1' }, { label: '항목 2' }] } },
    ])
  })

  it('`items` 가 배열이 아니면 그 값은 두고 `depth` 만 걷는다 — 검증이 그 자리를 말한다', () => {
    expect(liftTreeNodes([{ id: 'n_a', type: 'Tree', props: { items: '가, 나', depth: 2 } }]).nodes).toEqual([
      { id: 'n_a', type: 'Tree', props: { items: '가, 나' } },
    ])
  })
})

describe('사슬 — 판 5 문서가 판 6 으로', () => {
  const v5 = (children: unknown[]): PageDocument => ({ version: 5, root: { id: 'n_root', type: 'Page', children: children as WbNode[] } })

  it('판 5 문서를 판 6 으로 올리고 옮긴 문서가 판 6 검증을 지난다', () => {
    const out = migrateDocument(v5([{ id: 'n_tree', type: 'Tree', props: { items: labels(7), depth: 3 } }]))
    expect(out.version).toBe(CURRENT_DOCUMENT_VERSION)
    expect(validatePage(out)).toEqual([])
    const items = (out.root.children?.[0]?.props as { items: TreeItem[] }).items
    expect(newRows(items)).toEqual(oldRows(labels(7), 3))
  })

  it('판 6 에서 옛 꼴(글 목록 · 깊이)은 `invalid-props` 로 거절된다 — 글 항목만 · 깊이만 든 판도 따로', () => {
    const codes = (props: Record<string, unknown>) =>
      validatePage({ version: 6, root: { id: 'n_root', type: 'Page', children: [{ id: 'n_t', type: 'Tree', props }] } }).map(
        (issue) => `${issue.code}@${issue.nodeId}`,
      )
    expect([codes({ items: ['가'], depth: 2 }), codes({ items: ['가'] }), codes({ depth: 2 })]).toEqual([
      ['invalid-props@n_t'],
      ['invalid-props@n_t'],
      ['invalid-props@n_t'],
    ])
  })
})

describe('판 6 의 트리 항목 규칙', () => {
  const page = (items: unknown): PageDocument => ({
    version: CURRENT_DOCUMENT_VERSION,
    root: { id: 'n_root', type: 'Page', children: [{ id: 'n_t', type: 'Tree', props: { items } }] },
  })
  const chain = (depth: number): TreeItem[] => {
    let item: TreeItem = { label: `${depth}` }
    for (let level = depth - 1; level >= 1; level -= 1) item = { label: `${level}`, open: true, children: [item] }
    return [item]
  }

  it('받는다 — 빈 목록 · 깊이 5 · 항목 100 · 접힌 항목', () => {
    expect(validatePage(page([]))).toEqual([])
    expect(validatePage(page(chain(5)))).toEqual([])
    expect(validatePage(page(labels(TREE_ITEMS_MAX).map((label) => ({ label }))))).toEqual([])
    expect(validatePage(page([{ label: '가', open: false, children: [{ label: '나' }] }]))).toEqual([])
  })

  it('거절한다 — 깊이 6 · 항목 101(깊이를 합쳐 센다) · 모르는 칸 · 이름이 없는 항목', () => {
    const codes = (items: unknown) => validatePage(page(items)).map((issue) => issue.code)
    expect(codes(chain(6))).toEqual(['invalid-props'])
    const wide = labels(TREE_ITEMS_MAX).map((label) => ({ label }))
    expect(codes([...wide.slice(1), { label: '가', children: [{ label: '나' }] }])).toEqual(['invalid-props'])
    expect(codes([{ label: '가', selected: true }])).toEqual(['invalid-props'])
    expect(codes([{ open: true }])).toEqual(['invalid-props'])
  })

  it('깊이 · 수 문장은 한도를 말한다', () => {
    const messages = validatePage(page(chain(6))).map((issue) => issue.message)
    expect(messages.join(' ')).toContain('트리 깊이는 5단까지입니다 (현재: 6)')
    const wide = labels(TREE_ITEMS_MAX + 1).map((label) => ({ label }))
    expect(
      validatePage(page(wide))
        .map((issue) => issue.message)
        .join(' '),
    ).toContain('트리 항목은 100개까지입니다 (현재: 101)')
  })
})
