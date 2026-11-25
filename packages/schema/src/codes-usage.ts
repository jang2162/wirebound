/**
 * 공통코드의 사용처 — 그룹 · 항목을 가리키는 노드를 페이지 · 레이아웃 · 모듈에서 찾는다. 서버(`GET …/codes/usage`) · CLI · MCP · 번들의
 * «공통코드» 장이 이 한 벌을 부른다 — 걷는 자리가 갈리면 화면마다 사용 수가 다르다.
 *
 * 화면 상태로 숨은 노드도 센다(숨은 상태의 화면도 고칠 곳이다). 노드 걷기는 `walkNodes`(구역 포함 — `zones.ts` 의 `childLists`) 하나다.
 */
import type { CodeIndex } from './codes-resolve'
import { nodeDisplayName } from './interaction/describe'
import type { WbNode } from './node'
import { walkNodes } from './tree'

export interface UsageSource {
  kind: 'page' | 'module'
  id: string
  title: string
  /** 뿌리들 — 페이지는 `[root]`, 모듈은 저장된 노드 묶음. */
  nodes: readonly WbNode[]
}

export interface UsageHit {
  kind: UsageSource['kind']
  id: string
  title: string
  nodes: { nodeId: string; name: string }[]
}

/**
 * 그 노드가 `group`(· `item`)을 가리키는가. 선택 위젯(그룹을 가리킨다)은 `item` 을 주면 `selected` 에 든 것만, 대표 글은 `code.item` 이 같은 것만.
 * 선택 위젯과 대표 글을 `item` 칸의 있음으로 가른다 — 검증(`invalid-code-ref`)이 둘이 섞이지 않게 막는다.
 */
function refersTo(node: WbNode, group: string, item: string | undefined): boolean {
  const ref = node.code
  if (ref === undefined || ref.group !== group) return false
  if (item === undefined) return true
  return ref.item === item || (ref.selected ?? []).includes(item)
}

/**
 * `codes` 를 주면 노드를 표의 이름으로 부른다(캔버스와 같은 이름) — 끊긴 참조의 노드는 prop 의 대체 글이다. 안 주면 모두 대체 글이라, 이름을
 * 사람에게 보이는 자리는 표를 넘긴다.
 */
export function codeUsage(sources: readonly UsageSource[], group: string, item?: string, codes?: CodeIndex): UsageHit[] {
  const hits: UsageHit[] = []
  for (const source of sources) {
    const nodes: UsageHit['nodes'] = []
    for (const root of source.nodes) {
      for (const { node } of walkNodes(root)) {
        if (refersTo(node, group, item)) nodes.push({ nodeId: node.id, name: nodeDisplayName(node, undefined, codes) })
      }
    }
    if (nodes.length > 0) hits.push({ kind: source.kind, id: source.id, title: source.title, nodes })
  }
  return hits
}

export interface CodeUsageCount {
  /** 그 그룹을 가리키는 노드 수(항목을 가리키는 것 포함). */
  group: number
  /** 코드값 → 그 항목을 가리키는 노드 수(대표 글의 `item` · 선택 위젯의 `selected`). */
  items: Map<string, number>
}

/** 그룹 키마다 사용 수 — 공통코드 화면의 목록이 한 번에 받는다. 노드 하나는 그룹에 한 번, 항목마다 한 번 센다. */
export function codeUsageCounts(sources: readonly UsageSource[]): Map<string, CodeUsageCount> {
  const counts = new Map<string, CodeUsageCount>()
  for (const source of sources) {
    for (const root of source.nodes) {
      for (const { node } of walkNodes(root)) {
        const ref = node.code
        if (ref === undefined) continue
        const count = counts.get(ref.group) ?? { group: 0, items: new Map<string, number>() }
        count.group += 1
        const values = new Set([...(ref.item === undefined ? [] : [ref.item]), ...(ref.selected ?? [])])
        for (const value of values) count.items.set(value, (count.items.get(value) ?? 0) + 1)
        counts.set(ref.group, count)
      }
    }
  }
  return counts
}
