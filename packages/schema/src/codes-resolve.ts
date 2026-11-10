/**
 * 공통코드 참조(`WbNode.code`)를 표로 푼다 — 렌더러 · 요약 · 이름 · lint · `pageView` 가 이 한 벌을 부른다. 표가 없는 소비자(표를 못 받은 자리)는
 * 부르지 않고 prop 의 글을 쓴다 — prop 은 묶을 때 적어 둔 대체 글이다(정본 설계서 「페이지 스키마 노드」).
 *
 * 묶인 선택 위젯은 사용 중 항목을 차례대로 앞 `OPTIONS_MAX` 개까지 그린다 — 테마의 칩 · 세그먼트 배치가 그 한도에 맞춰 있어 한도를 올리지 않는다.
 * 고름의 정본은 `code.selected`(코드값)다. `options` 의 `selected` 는 대체 글일 뿐이라 어긋나면 `code.selected` 가 이긴다.
 */
import type { CodeGroup, CodeItem, CodeTable } from './codes'
import { OPTIONS_MAX, type ChoiceOption } from './component/catalog/input'
import { CATALOG_DEFS } from './component/catalog/index'
import type { CodeBinding } from './component/define'
import type { CodeRef, WbNode } from './node'

/** 그룹 키 → 그룹. 같은 표로 여러 번 풀므로 한 번 짓는다. */
export type CodeIndex = ReadonlyMap<string, CodeGroup>

export function indexCodes(table: CodeTable): CodeIndex {
  return new Map(table.map((group) => [group.key, group]))
}

export interface ResolvedChoices {
  /** 그릴 선택지 — 사용 중 항목 앞 `OPTIONS_MAX` 개. 그룹이 끊겼으면 빈 배열이다(그리는 쪽은 prop 의 대체 글로 간다). */
  options: ChoiceOption[]
  /** `options` 와 같은 차례의 항목. */
  items: CodeItem[]
  /** 사용 중 항목이 `OPTIONS_MAX` 를 넘어 뒤를 잘랐다. */
  truncated: boolean
  brokenGroup: boolean
  /** 고른 값 가운데 그리기에서 빠진 것 — 표에 없거나 사용 안 함. 그룹이 끊겼으면 빈 배열(그룹 끊김이 덮는다). */
  brokenSelected: string[]
}

export function resolveChoices(index: CodeIndex, ref: CodeRef): ResolvedChoices {
  const group = index.get(ref.group)
  if (group === undefined) return { options: [], items: [], truncated: false, brokenGroup: true, brokenSelected: [] }
  const active = group.items.filter((item) => item.active)
  const items = active.slice(0, OPTIONS_MAX)
  const selected = new Set(ref.selected ?? [])
  const usable = new Set(active.map((item) => item.value))
  return {
    options: items.map((item) => (selected.has(item.value) ? { label: item.name, selected: true } : { label: item.name })),
    items,
    truncated: active.length > OPTIONS_MAX,
    brokenGroup: false,
    brokenSelected: (ref.selected ?? []).filter((value) => !usable.has(value)),
  }
}

/** 대표 글 노드가 가리키는 항목의 이름. 그룹 · 항목이 표에 없으면 `null`(끊김). 사용 안 함 항목도 이름을 그린다(lint 가 알린다). */
export function resolveLabel(index: CodeIndex, ref: CodeRef): { name: string; inactive: boolean } | null {
  if (ref.item === undefined) return null
  const item = index.get(ref.group)?.items.find((entry) => entry.value === ref.item)
  return item === undefined ? null : { name: item.name, inactive: !item.active }
}

const BINDINGS: ReadonlyMap<string, CodeBinding> = new Map(
  CATALOG_DEFS.flatMap((def) => (def.code === undefined ? [] : [[def.type, def.code] as const])),
)

/**
 * 표로 푼 props — 묶인 노드면 대표 글 prop · `options` 를 표의 이름으로 바꾼 사본, 아니면(묶이지 않음 · 받지 않는 타입 · 끊김) `null`.
 * 끊긴 참조는 prop 의 대체 글을 그대로 쓰므로 `null` 이다. **카탈로그를 정적으로 읽는다** — `installCatalog()` 를 부르지 않는 소비자(exporter ·
 * MCP · CLI)도 같은 글을 낸다(`display.ts` 머리말과 같은 까닭).
 */
export function resolvedCodeProps(node: WbNode, index: CodeIndex): Record<string, unknown> | null {
  const ref = node.code
  if (ref === undefined || typeof node.type !== 'string') return null
  const binding = BINDINGS.get(node.type)
  if (binding === undefined) return null
  const props = node.props !== null && typeof node.props === 'object' ? node.props : {}
  if (binding.kind === 'label') {
    const label = resolveLabel(index, ref)
    return label === null ? null : { ...props, [binding.prop]: label.name }
  }
  const choices = resolveChoices(index, ref)
  return choices.brokenGroup ? null : { ...props, options: choices.options }
}

/**
 * 묶인 노드의 풀린 값 — 표를 읽어 내는 출력(`wireb page get` · MCP `get_page` 의 `nodes[].code.resolved`)이 싣는다. 대표 글은 그 항목의 이름
 * (끊겼으면 `null`), 선택 위젯은 그릴 선택지 이름 · 그중 고른 것 · 빠진 고른 값이다. 그리기(`resolvedCodeProps`)와 같은 풀기를 지난다.
 */
export type ResolvedCode =
  | { kind: 'label'; broken: boolean; name: string | null; inactive: boolean }
  | { kind: 'choices'; broken: boolean; options: string[]; selected: string[]; truncated: boolean; brokenSelected: string[] }

/** 묶인 노드의 풀린 값(`ResolvedCode`). 묶이지 않았거나 받지 않는 타입이면 `null`. */
export function resolveCode(node: WbNode, index: CodeIndex): ResolvedCode | null {
  const ref = node.code
  if (ref === undefined || typeof node.type !== 'string') return null
  const binding = BINDINGS.get(node.type)
  if (binding === undefined) return null
  if (binding.kind === 'label') {
    const label = resolveLabel(index, ref)
    return { kind: 'label', broken: label === null, name: label?.name ?? null, inactive: label?.inactive ?? false }
  }
  const choices = resolveChoices(index, ref)
  const picked = new Set(ref.selected ?? [])
  return {
    kind: 'choices',
    broken: choices.brokenGroup,
    options: choices.items.map((item) => item.name),
    selected: choices.items.filter((item) => picked.has(item.value)).map((item) => item.name),
    truncated: choices.truncated,
    brokenSelected: choices.brokenSelected,
  }
}

/** 노드의 참조가 끊겼는가 — 그룹이 없거나(선택 위젯 · 대표 글) 항목이 없다(대표 글). 고른 값만 빠진 것은 끊김이 아니다(그룹은 산다). */
export function isCodeBroken(node: WbNode, index: CodeIndex): boolean {
  const ref = node.code
  if (ref === undefined || typeof node.type !== 'string') return false
  const binding = BINDINGS.get(node.type)
  if (binding === undefined) return false
  return binding.kind === 'label' ? resolveLabel(index, ref) === null : !index.has(ref.group)
}
