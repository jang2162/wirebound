/**
 * **문서 판 5 → 6 — `Tree` 의 항목을 계층으로 옮긴다.** 판 5 의 트리는 글 목록(`items: string[]`)과 깊이(`depth` 1 – 5)였고 화면은 항목 i 를
 * `i % depth` 단으로 들여 그렸다 — 어느 항목이 어느 항목 밑인지는 사람이 못 정했다. 판 6 은 항목마다 이름 · 펼침 · 자식 목록이다
 * (`component/catalog/data.ts` 의 `TreeItemSchema`). 문서가 들어오는 모든 경계가 이 단계를 탄다 — `migrate.ts` 의 `MIGRATIONS` 둘째 줄이고, DB
 * 마이그레이션(`apps/api` 의 `0035-tree-items`)은 이 파일의 함수를 직접 부른다.
 *
 * **이 단계는 판 5 → 6 의 뜻으로 얼어 있다 — 고치지 않는다.** 런타임 사슬이 판 6 꼴 항목을 남기는 갈래(아래 «런타임 사슬은 판 6 꼴 항목을
 * 남긴다»)는 판 5 문서의 뜻을 안 바꾼다 — 판 5 검증을 지난 문서는 글 항목뿐이다. 카탈로그를 import 하지 않는다(한도 · 옛 기본값을 여기 사본으로 둔다) — 뒤의 판이
 * 트리 꼴을 또 바꾸면 새 단계를 더한다. 아는 노드 키는 `type` · `props` · `children` · `zones` 뿐이다.
 *
 * 옮기는 규칙은 **판 5 의 화면 그대로**다:
 *
 * | 판 5 | 판 6 |
 * |---|---|
 * | 항목 i 의 단 `i % depth` | 단 L(> 0)인 항목은 그 앞의 가장 가까운 단 L − 1 항목의 자식, 없으면 맨 위 |
 * | `items` 가 없음 | 판 5 의 기본값 `['항목 1', '항목 2']` 으로 옮긴다(그 값으로 그려졌다) |
 * | `depth` 가 없거나 1 – 5 의 정수가 아님 | 판 5 의 기본값 2 |
 * | 글이 아닌 원소 | 버린다(판 5 검증이 거절한 꼴이다) — 런타임 사슬은 이름이 글인 객체(판 6 꼴 항목)만 아래 «남긴다» 로 남긴다 |
 * | 101 째부터의 글 항목 | 버린다(판 6 의 항목 상한 100) — `dropped` 로 센다 |
 * | 자식이 있는 항목 | `open: true` — 판 5 는 모두 펴서 그렸다 |
 * | `depth` | 걷는다 |
 *
 * **런타임 사슬은 판 6 꼴 항목을 남긴다**(`liftTreeItems` — `keepLifted`). 판 5 라고 적힌 문서에 이미 판 6 꼴 항목(이름이 글인 객체)이 들면 그
 * 항목은 제 꼴(펼침 · 자식째) · 제 자리 그대로 맨 위에 두고 글 항목만 위 표대로 옮긴다. 글 항목의 단은 글 항목끼리의 차례로 센다(`s % depth`),
 * 판 6 꼴 항목 뒤의 글 항목은 그 앞의 글 항목을 부모로 잡지 않는다 — 펼친 차례가 들어온 차례 그대로다. 상한은 글 항목에만 건다 — 남긴 항목까지
 * 합쳐 100 을 넘으면 판 6 검증이 그 자리를 말한다. 이름이 글이 아닌 객체는 앞처럼 버린다. DB 마이그레이션(`0035`)이 부르는 `liftTreeNodes` 의
 * 기본은 남기지 않는다 — 판 5 로 저장된 문서는 판 5 검증을 지나 글 항목뿐이다.
 *
 * `items` 가 배열이 아니면(판 5 검증이 거절한 꼴) 그 값은 그대로 두고 `depth` 만 걷는다 — 검증의 `invalid-props` 가 그 자리를 말한다. `setProp`
 * 액션이 `items` · `depth` 를 바꾸던 것은 옮기지 않는다 — 검증 경고 `invalid-interaction-prop` 이 그 자리를 말한다(`0032` 의 옛 prop 과 같다).
 */
import type { AnyDocument, WbNode } from './node'

/** 판 6 의 항목 상한(`TREE_ITEMS_MAX`)의 사본 — 이 단계가 얼어 있어 카탈로그 값을 읽지 않는다. */
const ITEMS_MAX = 100
/** 판 5 카탈로그의 기본값 — 노드에 없을 때 그 값으로 그렸다. */
const OLD_ITEMS = ['항목 1', '항목 2'] as const
const OLD_DEPTH = 2
const DEPTH_MIN = 1
const DEPTH_MAX = 5

interface Raw {
  type?: unknown
  props?: unknown
  children?: unknown
  zones?: unknown
  [key: string]: unknown
}

/** 판 6 의 항목 — 이 단계가 짓는 꼴. */
export interface LiftedTreeItem {
  label: string
  open?: true
  children?: LiftedTreeItem[]
}

function isRecord(value: unknown): value is Raw {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** 판 6 꼴 항목 — 이름이 글인 객체. 나머지 칸은 판 6 검증이 본다. */
function isLiftedItem(value: unknown): value is LiftedTreeItem {
  return isRecord(value) && typeof value.label === 'string'
}

/**
 * 판 5 의 글 목록 · 깊이를 판 6 의 항목 계층으로(입력을 고치지 않는다). `items` 는 글 목록이어야 한다 — 글이 아닌 원소는 버린다. 101 째부터는 버리고
 * 그 수를 `dropped` 로 낸다. `keepLifted` 면 판 6 꼴 항목을 버리지 않고 사본으로 제 자리에 남긴다(머리말 «런타임 사슬은 판 6 꼴 항목을 남긴다»).
 */
export function treeItemsFromFlat(
  items: readonly unknown[],
  depth: unknown,
  options: { keepLifted?: boolean } = {},
): { items: LiftedTreeItem[]; dropped: number } {
  const levels = typeof depth === 'number' && Number.isInteger(depth) && depth >= DEPTH_MIN && depth <= DEPTH_MAX ? depth : OLD_DEPTH
  const top: LiftedTreeItem[] = []
  // 단마다 가장 늦게 본 글 항목. 판 5 의 단은 `s % depth` 라 단 L(> 0) 항목의 바로 앞 글 항목이 늘 단 L − 1 이다 — 그것이 «가장 가까운 앞 단
  // L − 1 항목» 이고, 부모가 없는 판은 단 0 뿐이다. 남긴 판 6 꼴 항목이 사이에 서면 비운다(그 뒤의 글 항목이 그 앞을 부모로 잡지 않는다).
  let last: (LiftedTreeItem | undefined)[] = []
  let strings = 0
  let dropped = 0
  for (const entry of items) {
    if (typeof entry === 'string') {
      if (strings >= ITEMS_MAX) {
        dropped += 1
        continue
      }
      const level = strings % levels
      strings += 1
      const item: LiftedTreeItem = { label: entry }
      const parent = level === 0 ? undefined : last[level - 1]
      if (parent === undefined) top.push(item)
      else {
        parent.open = true
        ;(parent.children ??= []).push(item)
      }
      last[level] = item
    } else if (options.keepLifted === true && isLiftedItem(entry)) {
      top.push(structuredClone(entry))
      last = []
    }
  }
  return { items: top, dropped }
}

/** 노드 묶음의 결과 — 옮긴 사본 · 옮긴 `Tree` 수 · 상한에서 버린 항목 수. */
export interface LiftTreeResult {
  nodes: unknown[]
  moved: number
  dropped: number
}

/**
 * 노드 묶음 안의 `Tree` 를 판 6 꼴로(입력을 고치지 않는다) — 몸통(`children`)과 모든 구역(`zones`)을 걷는다. `keepLifted` 는
 * `treeItemsFromFlat` 의 것이다 — 기본(남기지 않음)이 DB 마이그레이션의 뜻이다.
 */
export function liftTreeNodes(nodes: readonly unknown[], options: { keepLifted?: boolean } = {}): LiftTreeResult {
  let moved = 0
  let dropped = 0
  const walk = (node: unknown): unknown => {
    if (!isRecord(node)) return node
    const next: Raw = { ...node }
    if (Array.isArray(node.children)) next.children = node.children.map(walk)
    if (isRecord(node.zones)) {
      const zones: Record<string, unknown> = {}
      for (const [name, list] of Object.entries(node.zones)) zones[name] = Array.isArray(list) ? list.map(walk) : list
      next.zones = zones
    }
    if (node.type !== 'Tree') return next
    const props: Record<string, unknown> = isRecord(node.props) ? { ...node.props } : {}
    const items = props.items === undefined ? OLD_ITEMS : props.items
    const depth = props.depth
    delete props.depth
    if (Array.isArray(items)) {
      const lifted = treeItemsFromFlat(items, depth, options)
      props.items = lifted.items
      dropped += lifted.dropped
    }
    next.props = props
    moved += 1
    return next
  }
  return { nodes: nodes.map(walk), moved, dropped }
}

/** 판 5 → 6 의 결과 — 옮긴 문서(`version` 은 부르는 쪽이 올린다) · 옮긴 `Tree` 수 · 상한에서 버린 항목 수. */
export interface LiftTreeDocumentResult<T extends AnyDocument> {
  doc: T
  moved: number
  dropped: number
}

/** 문서 하나를 판 6 꼴로(입력을 고치지 않는다). 뿌리부터 걷는다. 런타임 사슬의 단계라 판 6 꼴 항목을 남긴다(머리말). */
export function liftTreeItems<T extends AnyDocument>(doc: T): LiftTreeDocumentResult<T> {
  const result = liftTreeNodes([doc.root], { keepLifted: true })
  return { doc: { ...doc, root: result.nodes[0] as WbNode }, moved: result.moved, dropped: result.dropped }
}
