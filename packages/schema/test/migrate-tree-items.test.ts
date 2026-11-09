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
import { liftTreeItems, liftTreeNodes, treeItemsFromFlat } from '../src/migrate-tree-items'
import type { PageDocument, WbNode } from '../src/node'
import { validatePage } from '../src/validate'
import { inspectNodesEnvelope, writeNodesEnvelope } from '../src/clipboard'
import { WIREBOUND_PAGE_VERSION } from '../src/page-json/envelope'
import { gatePageImport } from '../src/page-json/import'

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

describe('판 5 라고 적힌 문서의 판 6 꼴 항목 — 사슬은 남긴다', () => {
  // 판 6 꼴 항목(이름이 글인 객체 · 자식 · 펼침) 둘 사이에 판 5 글 항목 셋이 끼었다. 깊이 2 — 글 항목의 단은 글 항목끼리의 차례 `s % 2` 다.
  const KEPT_A: TreeItem = { label: '주문', open: false, children: [{ label: '목록' }, { label: '통계' }] }
  const KEPT_B: TreeItem = { label: '설정' }
  const MIXED = [KEPT_A, '회원', '가입', KEPT_B, '탈퇴']
  const v5 = (items: unknown): PageDocument => ({
    version: 5,
    root: { id: 'n_root', type: 'Page', children: [{ id: 'n_tree', type: 'Tree', props: { items, depth: 2 } }] },
  })
  const itemsOf = (doc: PageDocument): unknown => (doc.root.children![0]!.props as { items: unknown }).items

  it('사슬(`migrateDocument`) — 판 6 꼴 항목은 제 꼴 · 제 자리 그대로 · 글 항목만 옮긴다 · 판 6 검증을 지난다', () => {
    const out = migrateDocument(v5(MIXED))
    expect(itemsOf(out)).toEqual([
      KEPT_A,
      // 글 항목 0(«회원»)은 단 0 · 1(«가입»)은 단 1 — 앞의 단 0 글 항목 밑.
      { label: '회원', open: true, children: [{ label: '가입' }] },
      KEPT_B,
      // 글 항목 2(«탈퇴»)는 단 0.
      { label: '탈퇴' },
    ])
    expect(validatePage(out)).toEqual([])
  })

  it('판 6 꼴 항목 뒤의 단 1 글 항목은 그 항목 밑으로 안 들어가고 맨 위에 선다 — 판 6 꼴 항목은 손대지 않는다', () => {
    // 글 항목 0(«가») 단 0 · 판 6 꼴 · 글 항목 1(«나») 단 1 — 앞의 단 0 글 항목 «가» 는 판 6 꼴 항목을 넘어 있어 부모로 잡지 않는다.
    expect(itemsOf(migrateDocument(v5(['가', KEPT_B, '나'])))).toEqual([{ label: '가' }, KEPT_B, { label: '나' }])
  })

  it('이름이 글이 아닌 객체 · 글 · 객체가 아닌 원소는 앞처럼 버린다', () => {
    expect(itemsOf(migrateDocument(v5([{ label: 7 }, { open: true }, 3, null, KEPT_B, '가'])))).toEqual([KEPT_B, { label: '가' }])
  })

  it('`liftTreeItems` 는 입력을 고치지 않는다 · 남긴 항목은 입력과 값을 나눠 쓰지 않는다', () => {
    const doc = v5(MIXED)
    const before = JSON.stringify(doc)
    const out = liftTreeItems(doc).doc
    expect(JSON.stringify(doc)).toBe(before)
    const kept = (itemsOf(out) as TreeItem[])[0]!
    expect(kept.label).toBe('주문')
    expect(kept).not.toBe(KEPT_A)
    expect(kept.children).not.toBe(KEPT_A.children)
  })

  it('DB 마이그레이션이 부르는 `liftTreeNodes` 의 기본은 판 5 → 6 의 얼린 뜻 그대로 — 판 6 꼴 항목을 버린다', () => {
    const out = liftTreeNodes([{ id: 'n_tree', type: 'Tree', props: { items: MIXED, depth: 2 } }])
    expect((out.nodes[0] as { props: { items: unknown } }).props.items).toEqual([
      { label: '회원', open: true, children: [{ label: '가입' }] },
      { label: '탈퇴' },
    ])
  })

  it('입구 — 페이지 JSON 가져오기(`gatePageImport`)가 판 6 꼴 항목을 지닌 채 받는다', () => {
    const gate = gatePageImport({
      wireboundVersion: WIREBOUND_PAGE_VERSION,
      page: { title: '섞인 트리', description: null },
      schema: v5(MIXED),
      comments: [],
    })
    expect(gate.ok).toBe(true)
    if (!gate.ok) return
    expect(newRows(itemsOf(gate.document) as TreeItem[])).toEqual(['0:주문', '1:목록', '1:통계', '0:회원', '1:가입', '0:설정', '0:탈퇴'])
  })

  it('입구 — 클립보드 봉투(`inspectNodesEnvelope`)가 판 5 봉투의 판 6 꼴 항목을 지닌 채 받는다', () => {
    const read = inspectNodesEnvelope(writeNodesEnvelope([{ id: 'n_tree', type: 'Tree', props: { items: MIXED, depth: 2 } }], 5))
    expect(read.kind).toBe('ok')
    if (read.kind !== 'ok') return
    expect(newRows((read.nodes[0]!.props as { items: TreeItem[] }).items)).toEqual([
      '0:주문',
      '1:목록',
      '1:통계',
      '0:회원',
      '1:가입',
      '0:설정',
      '0:탈퇴',
    ])
  })
})
