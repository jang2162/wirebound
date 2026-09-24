/**
 * **견디는 순회 하나.** 문서를 훑어 노드를 문서 순서로 낸다.
 *
 * **`schema`의 `walkNodes`를 쓰지 않는다.** 그쪽은 `children` 배열의 원소를 노드라고 믿고
 * `null`이면 던진다. 번들은 **그리지 못하는 문서도 통과시킨다** — 렌더러가 폴백 상자를
 * 그리고 `errors`로 이름 붙이는 것이 계약이므로, 여기서 던지면 그린 페이지가 통째로
 * 사라진다.
 *
 * **이 패키지 안에서 자리를 하나로 둔다.** 소비자가 둘이다(`bundle/comments.ts` ·
 * `runtime/plan.ts`) — 두 벌이 되면 *"무엇을 견디는가"*가 파일마다 갈린다. (저장소
 * 전체로는 같은 일을 하는 자리가 넷이다 — `schema`의 `walkNodes` · `apps/web`의
 * `walkSafely` · `renderer`의 `nodeIndex` · 이것. 묶으려면 앞의 셋의 소비자 계약을
 * 바꿔야 해서 여기서 묶지 않는다.)
 */
import type { WbNode } from '@wirebound/schema'

export function* eachNode(node: unknown): Generator<WbNode> {
  if (node === null || typeof node !== 'object') return
  const shaped = node as WbNode
  yield shaped
  const children = (node as { children?: unknown }).children
  if (!Array.isArray(children)) return
  for (const child of children) yield* eachNode(child)
}

/**
 * **노드가 아닌 자식을 걷어 낸 사본.** 뿌리 자체가 노드가 아니면 `null`이다.
 *
 * ---
 *
 * `schema`의 문장화(`listInteractionSentences` → `walkNodes`)는 자식이 노드라고 믿고
 * `null`에서 **던진다.** 그것을 *"깨진 자식이 하나라도 있으면 문장 목록을 통째로 비운다"*로
 * 막으면 **상호작용 탭이 *"상호작용이 없습니다"*라고 말하는데 버튼은 눌린다.** 런타임 쪽은
 * 위 `eachNode`(견디는 순회)를 쓰기 때문이다 — *"문장과 동작이 갈리지 않는다"*가 겨냥한
 * 바로 그 자리가 열린다.
 *
 * **전부 아니면 전무를 갈래로 가른다.** 던지는 원인은 *"노드가 아닌 자식"* 하나뿐이므로,
 * **그것만 걷어 내고** 나머지는 그대로 문장화에 넘긴다. 그러면 멀쩡한 규칙의 문장이 살고,
 * 못 그린 노드는 `errors`가 이름을 든다.
 *
 * **걷어 낸 것이 타겟 해석을 바꾸지 않는다.** 걷히는 것은 노드가 아닌 값이라 `id`가 없고,
 * `id`가 없으면 어떤 액션의 타겟도 될 수 없다.
 *
 * `children`이 배열이 아니면 **키를 지운다** — 그 값은 자식 목록이 아니고, 남겨 두면
 * 순회가 문자열의 글자를 노드로 훑는다.
 */
export function nodesOnly(node: unknown): WbNode | null {
  if (node === null || typeof node !== 'object') return null
  const source = node as Record<string, unknown>
  const children = source['children']
  if (!Array.isArray(children)) {
    if (!('children' in source)) return node as WbNode
    const { children: _drop, ...rest } = source
    return rest as unknown as WbNode
  }
  return {
    ...source,
    children: children.map(nodesOnly).filter((child): child is WbNode => child !== null),
  } as unknown as WbNode
}
