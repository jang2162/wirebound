/**
 * **두 문서의 구조가 같은가** — 노드의 id 와 부모 · 차례만 본다(내용은 안 본다). 편집 파이프라인이 `pages.structure_seq` 를 올릴지 정하는 자리다
 * (`0023-pages-structure-seq`).
 *
 * 잠금의 판정(`@wirebound/schema` 의 `selectionConflicts`)은 전위 순회의 «자리마다 id · 부모 자리» 만 읽는다. 그래서 같음의 기준도 **전위 순회의
 * (id, 부모 자리) 열이 같은가**다 — 노드를 더하거나 지우면 열이 달라지고, 옮기면 부모 자리나 열의 차례가 달라진다. 형제끼리 차례만 바뀐 것도
 * 다르다고 본다(판정은 안 바뀌지만 «옮김» 을 좁히려고 규칙을 늘리지 않는다 — 다시 판정하는 쪽으로 틀린다).
 *
 * **재귀가 아니다** — 스택으로 돈다(깊은 문서에서 호출 스택이 안 넘친다). `children` 안의 노드 아닌 원소는 건너뛴다(`selectionConflicts` 와 같다).
 */
import type { WbNode } from '@wirebound/schema'

function preorder(root: WbNode): { ids: string[]; parents: number[] } {
  const ids: string[] = []
  const parents: number[] = []
  const stack: { node: WbNode; up: number }[] = [{ node: root, up: -1 }]
  while (stack.length > 0) {
    const { node, up } = stack.pop()!
    const at = ids.length
    ids.push(node.id)
    parents.push(up)
    const children: unknown = node.children
    if (!Array.isArray(children)) continue
    for (let i = children.length - 1; i >= 0; i -= 1) {
      const child: unknown = children[i]
      if (child !== null && typeof child === 'object') stack.push({ node: child as WbNode, up: at })
    }
  }
  return { ids, parents }
}

export function sameStructure(before: WbNode, after: WbNode): boolean {
  const left = preorder(before)
  const right = preorder(after)
  if (left.ids.length !== right.ids.length) return false
  for (let at = 0; at < left.ids.length; at += 1) {
    if (left.ids[at] !== right.ids[at] || left.parents[at] !== right.parents[at]) return false
  }
  return true
}
