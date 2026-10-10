/**
 * **본문 · 문서의 중첩 깊이 상한** — 재귀로 도는 코드(`@wirebound/schema` 의 `applyOps` · `invertOps`, `db/nul-guard.ts` 의 훑기)가 호출 스택을 넘기기 전에
 * 입구에서 400 으로 끊는다. 상한이 없으면 깊이 1500 안팎(노드 단계 — 이 기계의 Node 기본 스택에서 `applyOps` 가 1000 단계는 지나고 1500 단계에서 넘쳤다)부터
 * 500 이고(PUT · 가져오기는 400 에 «Maximum call stack size exceeded» 문장이 실렸다), 한도 없이 쌓인 깊은 문서는 그 뒤 **모든 편집이 500** 이다.
 * 다시 재는 법: `apps/api/test/nesting-limit.test.ts`(깊이 3000 · 8000 · 한도 위의 값).
 *
 * | 상수 | 무엇을 세나 | 값의 근거 |
 * |---|---|---|
 * | `MAX_JSON_NESTING` | 본문(JSON) 값의 객체 · 배열 중첩 | 노드 하나가 객체 + `children` 배열 = 2 단계라 노드 300 단계. 문서 한도(아래)와 더해도 넘치는 깊이(노드 1200+)의 절반 아래 |
 * | `MAX_NODE_DEPTH` | 문서의 노드 깊이(`children` 따라) | 현실의 설계서는 수십 단계 안이다. 편집 하나가 더할 수 있는 깊이(`MAX_JSON_NESTING` / 2)와 더해도 넘치는 깊이의 절반 아래 |
 *
 * 둘 다 **기술 한도다 — 제품 규칙이 아니다.** 넘기는 설계서가 나오면 올리되, 그 전에 재귀를 반복으로 바꾸는 쪽(`@wirebound/schema`)이 먼저다.
 * 훑기는 모두 **스택으로 돈다**(이 파일이 재귀면 지키려던 것에 같은 방식으로 진다).
 */
import type { WbNode } from '@wirebound/schema'

export const MAX_JSON_NESTING = 600
export const MAX_NODE_DEPTH = 250

/** 값의 객체 · 배열 중첩이 `limit` 단계를 넘는가. 원시값은 0 단계다. */
export function jsonNestingExceeds(value: unknown, limit: number = MAX_JSON_NESTING): boolean {
  if (value === null || typeof value !== 'object') return false
  const stack: { value: object; depth: number }[] = [{ value, depth: 1 }]
  while (stack.length > 0) {
    const { value: current, depth } = stack.pop()!
    if (depth > limit) return true
    for (const child of Array.isArray(current) ? current : Object.values(current)) {
      if (child !== null && typeof child === 'object') stack.push({ value: child, depth: depth + 1 })
    }
  }
  return false
}

/** 문서 루트부터 `children` 을 따라 `limit` 단계를 넘는 노드가 있는가(루트가 1 단계). 노드 아닌 원소는 건너뛴다. */
export function nodeDepthExceeds(root: WbNode, limit: number = MAX_NODE_DEPTH): boolean {
  const stack: { node: WbNode; depth: number }[] = [{ node: root, depth: 1 }]
  while (stack.length > 0) {
    const { node, depth } = stack.pop()!
    if (depth > limit) return true
    const children: unknown = node.children
    if (!Array.isArray(children)) continue
    for (const child of children as unknown[]) {
      if (child !== null && typeof child === 'object') stack.push({ node: child as WbNode, depth: depth + 1 })
    }
  }
  return false
}

/** 400 에 싣는 문장 — 입구마다 같다. */
export const TOO_DEEP_MESSAGE = `본문의 중첩이 너무 깊습니다(객체 · 배열 ${MAX_JSON_NESTING} 단계 · 노드 ${MAX_NODE_DEPTH} 단계까지)`
