/**
 * **상호작용 문장을 만드는 자리 하나**(§8.2 · P10-1 D4).
 *
 * §8.2가 *"우측 패널, HTML 번들, PPTX 모두 이 문장을 싣는다"*고 적었다. 곧 **같은 문장을
 * 세 화면이 싣는다**는 것이 설계이고, 그러면 만드는 자리도 하나여야 한다.
 *
 * 문장 자체는 `packages/schema`의 `listInteractionSentences`가 만든다. 이 파일이 하는 일은
 * **그것을 부르기 전에 견디는 것**이고, 아래 머리말이 그 이유다.
 *
 * ---
 *
 * # 왜 그냥 부르지 않는가
 *
 * `listInteractionSentences`가 `walkNodes`를 쓰고 그 함수는 노드가 객체라고 믿는다 —
 * 자식이 `null`이면 거기서 던진다. 렌더 경로는 그 노드를 **폴백 상자로 그리고** `errors`에
 * 담으므로, 문장화만 던지면 **그리는 데 성공한 페이지가 산출물에서 통째로 사라진다.**
 *
 * **문장 목록을 통째로 비우는 것도 답이 아니다**(P8-3 리뷰 발견 4): 깨진 자식 **하나**가
 * 멀쩡한 규칙들의 문장까지 지우는데 **버튼은 그대로 눌린다** — 런타임 쪽은 견디는 순회를
 * 쓰기 때문이다. 화면이 *"상호작용이 없습니다"*라고 말하면서 실제로는 동작하는 것이고,
 * 그것이 이 저장소가 여러 번 만난 부류다.
 *
 * **그래서 던지는 원인만 걷어 낸다**(`nodesOnly`). 근거는 그 함수의 머리말에 있다.
 *
 * # 이 파일이 있어서 지켜지는 것
 *
 * P10-1 전에는 이 함수가 `bundle/shell.tsx` 안의 사설 함수였다. PPTX가 그것을 부를 수
 * 없어 **다시 짜는 것이 가장 쉬운 길**이었고, 다시 짰다면 위의 견딤 규칙이 한쪽에만 남아
 * **번들과 PPTX가 같은 설계서를 다르게 말하는** 날이 왔을 것이다. `test/duplicate-census.test.ts`가
 * 부르는 자리를 세어 그 길을 막는다.
 */
import { listInteractionSentences, type InteractionSentence, type PageDocument } from '@wirebound/schema'
import { nodesOnly } from './nodes'

/** 이 페이지의 상호작용 문장들. **문서 순서다.** */
export function pageSentences(page: PageDocument): InteractionSentence[] {
  const tree = nodesOnly(page.root)
  if (tree === null) return []
  return listInteractionSentences({ ...page, root: tree })
}
