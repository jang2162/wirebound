/**
 * **노드의 자식 줄 읽기 — 한 함수다.** 노드의 자식은 몸통(`children`)과 이름 붙은 구역(`zones`)에 산다(정본 설계서 「페이지 스키마 노드」).
 * 노드를 걷는 자리(순회 · 잠금 판정 · 구조 번호 · 복사 · 렌더러 · 내보내기 · lint)는 전부 `childLists`를 부른다 — 한 자리라도 `node.children`
 * 만 돌면 구역 안 노드가 그 자리에서 사라져, 잠금 판정이면 남의 잠금을 지난다. `node.children` · `node.zones`를 직접 읽는 자리는
 * `test/child-lists-census.test.ts`가 소스에서 센다.
 *
 * **순회 차례는 카탈로그가 구역을 선언한 차례다**(`Card`면 제목 옆 → 머리 오른쪽 → 몸통 → 바닥 — 화면을 읽는 차례). 문서는 `jsonb`에 살아
 * 열쇠 차례가 저장 뒤 바뀌므로 `zones`의 열쇠 차례에 뜻을 두지 않는다. 카탈로그가 모르는 줄(검증 전 문서 · 선언 밖 구역 · `installCatalog`
 * 전)은 선언된 것 뒤에 몸통 → 이름의 코드 단위 차례로 돈다.
 */
import { BODY_ZONE, type ZoneDef } from './component/define'
import { getComponent } from './component/registry'
import type { WbNode } from './node'

/** 자식 줄 하나 — `pointer`는 노드 경로 뒤에 붙는 꼬리(`/children` · `/zones/<이름>`)다. */
export interface ChildList<T> {
  zone: string
  pointer: string
  list: readonly T[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** 구역의 꼬리 포인터 — 몸통은 `/children`, 이름 붙은 구역은 `/zones/<이름>`. */
export function zonePointer(zone: string): string {
  return zone === BODY_ZONE ? '/children' : `/zones/${zone}`
}

/** 그 타입이 선언한 구역(차례대로). 카탈로그가 모르는 타입이면 빈 목록. */
export function zoneDefs(type: unknown): readonly ZoneDef[] {
  return typeof type === 'string' ? (getComponent(type)?.zones ?? []) : []
}

/** 그 타입이 그 구역을 선언했는가. */
export function hasZone(type: unknown, zone: string): boolean {
  return zoneDefs(type).some((def) => def.name === zone)
}

/** 그 타입이 몸통을 갖는가 — «노드 안에 넣기»의 자리가 있는가. */
export function hasBody(type: unknown): boolean {
  return hasZone(type, BODY_ZONE)
}

/** 노드의 한 구역 배열 — 없거나 배열이 아니면 빈 줄. 검증 전 노드에서 던지지 않는다. */
export function zoneList(node: unknown, zone: string): readonly unknown[] {
  if (!isRecord(node)) return []
  const value = zone === BODY_ZONE ? node.children : isRecord(node.zones) ? node.zones[zone] : undefined
  return Array.isArray(value) ? value : []
}

/**
 * 노드의 자식 줄 — 순회 차례로(머리말). 선언된 구역은 비어도 든다(빈 줄). 선언 밖 줄은 배열일 때만 든다. **검증 전 문서에서 던지지 않는다** —
 * 배열이 아닌 줄은 빈 줄이고, 줄 안의 원소가 노드인지는 부르는 쪽이 본다.
 */
export function childLists(node: WbNode): ChildList<WbNode>[]
export function childLists(node: unknown): ChildList<unknown>[]
export function childLists(node: unknown): ChildList<unknown>[] {
  if (!isRecord(node)) return []
  const out: ChildList<unknown>[] = []
  const taken = new Set<string>()
  for (const def of zoneDefs(node.type)) {
    taken.add(def.name)
    out.push({ zone: def.name, pointer: zonePointer(def.name), list: zoneList(node, def.name) })
  }
  if (!taken.has(BODY_ZONE) && Array.isArray(node.children)) {
    out.push({ zone: BODY_ZONE, pointer: '/children', list: node.children })
  }
  if (isRecord(node.zones)) {
    // `zones.body`는 봉투가 거절하는 꼴이지만 검증 전 노드에 설 수 있다 — 몸통과 다른 자리라 따로 돈다(숨기면 그 안 노드가 잠금을 지난다).
    const zones = node.zones
    const extra = Object.keys(zones)
      .filter((name) => (name === BODY_ZONE || !taken.has(name)) && Array.isArray(zones[name]))
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    for (const name of extra) out.push({ zone: name, pointer: `/zones/${name}`, list: zones[name] as unknown[] })
  }
  return out
}

/** 노드의 자식 전부 — `childLists`의 차례로 이어 붙인 것. */
export function childNodes(node: WbNode): WbNode[] {
  return childLists(node).flatMap((entry) => entry.list)
}

/**
 * 자식 줄을 모두 바꾼 사본 — 몸통과 구역의 원소마다 `fn`(돌려준 값이 `null`이면 그 자식을 뺀다). 노드가 아닌 원소(검증 전 문서의 `null` 등)는
 * 그대로 둔다. **바뀐 것이 없으면 그 노드를 그대로 돌려준다**(같은 객체 — 바뀌지 않은 하위 트리를 나눠 쓰는 `visibleTree`가 기댄다).
 */
export function mapChildLists(node: WbNode, fn: (child: WbNode) => WbNode | null): WbNode {
  let changed = false
  const mapList = (list: readonly unknown[]): WbNode[] => {
    const out: unknown[] = []
    for (const child of list) {
      if (child === null || typeof child !== 'object') {
        out.push(child)
        continue
      }
      const next = fn(child as WbNode)
      if (next !== child) changed = true
      if (next !== null) out.push(next)
    }
    return out as WbNode[]
  }
  const children = Array.isArray(node.children) ? mapList(node.children) : undefined
  let zones: Record<string, WbNode[]> | undefined
  if (isRecord(node.zones)) {
    zones = {}
    for (const [name, list] of Object.entries(node.zones)) zones[name] = Array.isArray(list) ? mapList(list) : list
  }
  if (!changed) return node
  const next: WbNode = { ...node }
  if (children !== undefined) next.children = children
  if (zones !== undefined) next.zones = zones
  return next
}
