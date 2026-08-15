/**
 * **견디는 순회 하나.** 문서를 훑어 노드를 문서 순서로 낸다.
 *
 * **`schema`의 `walkNodes`를 쓰지 않는다.** 그쪽은 `children` 배열의 원소를 노드라고 믿고
 * `null`이면 던진다. 번들은 **그리지 못하는 문서도 통과시킨다** — 렌더러가 폴백 상자를
 * 그리고 `errors`로 이름 붙이는 것이 계약이므로(D9), 여기서 던지면 그린 페이지가 통째로
 * 사라진다.
 *
 * **이 패키지 안에서 자리를 하나로 둔다.** 앞 슬라이스에는 같은 모양이 `bundle/comments.ts`
 * 안에 있었고 이 슬라이스가 둘째 소비자다 — 두 벌이 되면 *"무엇을 견디는가"*가 파일마다
 * 갈린다. (저장소 전체로는 이것이 넷째 자리다. `schema`의 `walkNodes` · `apps/web`의
 * `walkSafely` · `renderer`의 `nodeIndex`가 앞의 셋이고, 묶으려면 세 소비자의 계약을
 * 바꿔야 해서 그 판정은 여기서 하지 않는다 — 보고에 남긴다.)
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
