/**
 * 구조 구현체가 서기 위한 최소 CSS. **스킨이 아니다.**
 *
 * **이 파일은 모으기만 한다** (P4b-2 ①). 규칙은 **그룹 모듈 다섯**이 소유한다 —
 * `structures/structure.tsx`·`data.tsx`·`input.tsx`·`action.tsx`·`document.tsx`가 각각
 * `*CssBlocks()`를 내보내고 여기서 순서대로 이어 붙인다. 앞서는 이 파일 하나에 규칙
 * 배열이 있었는데, P4b-2가 구조 26개를 **워커 넷이 병렬로** 만들면서 넷이 전부 그 한
 * 배열을 만지게 된다. 규칙을 만드는 **공용 도구**(`nodeVar`·`componentRule`·`partRule`·
 * `TREE_INDENT_VAR`)는 `structure-css-tools.ts` 한 곳에 있다.
 *
 * ---
 *
 * **왜 이것이 `renderer`에 있는가 (P4a-2 D1).** 구조 구현체와 그것이 성립하기 위한 선언은
 * 같은 패키지에 있어야 둘이 갈리지 않는다. 무엇보다 `themes`는 `renderer`를 볼 수 없다
 * (§3.3의 의존표) — 반대 방향이면 의존이 뒤집힌다.
 *
 * **§3.2의 *"스타일은 전부 `themes`가 컴파일한 CSS가 담당한다"*와 어긋나지 않는다.**
 * 여기 있는 것은 스킨이 아니라 **구조가 서기 위한 최소 선언**이고, 테마가 그것을 덮을 수
 * 있어야 한다는 것이 요구다. 덮지 못하면 이 파일은 실패한 것이고,
 * `test/structure-css.test.ts`가 계산된 스타일로 그것을 지킨다.
 *
 * ---
 *
 * **어떻게 테마가 이것을 이기는가 (P4a-2 재라 #1 — 잰 결과: 순서).**
 *
 * 후보가 둘이었다. (A) `@layer wb.structure, wb.theme`으로 층을 못박기, (B) 셀렉터를
 * 테마와 **같은 모양**으로 맞추고 나중에 오는 테마가 이기게 하기.
 *
 * **(A)는 이 저장소에서 실증할 수 없다.** jsdom 25의 CSS 파서가 `@layer`를 모르는데,
 * 모르는 규칙을 건너뛰는 것이 아니라 **그것이 든 시트를 통째로 버린다**(`style.sheet`가
 * `null`이 되고 `@layer` 밖의 규칙도 함께 죽는다 — 재서 케이스로 고정했다). 층을 쓰면
 * 층 순서는커녕 CSS가 먹히는지조차 자동 테스트가 잴 수 없다.
 *
 * **그래서 (B)다.** 셀렉터를 `compileTheme`이 내는 것과 같은 꼴
 * (`[data-wb-component="X"][data-wb-structure="Y"]` — 특이도 0,2,0)로 맞추고, 이 시트를
 * **테마 시트보다 먼저** 깐다(P4a-2 D5). 같은 특이도에서는 나중에 온 규칙이 이긴다 —
 * 한 시트 안에서도, 시트 둘로 나눠도 같다는 것을 쟀다.
 *
 * **대가:** 이 CSS가 더 구체적인 셀렉터를 쓰는 순간 테마가 진다. `@layer`였다면 특이도와
 * 무관했을 자리다. 그래서 셀렉터 모양을 `componentRule`·`partRule` 두 함수로만 만든다 —
 * 손으로 셀렉터를 쓰는 자리를 남기지 않는 것이 그 대가를 관리하는 방법이다.
 *
 * **그리고 그 두 함수는 이제 그룹 다섯이 나눠 쓴다.** 병렬 워커가 자기 그룹에서 손으로
 * 셀렉터를 쓰면 그 컴포넌트에서만 테마가 지고, 그것은 **화면에 안 보인다.**
 * `test/structure-groups.test.ts`가 그룹의 규칙이 자기 컴포넌트만 겨냥하는 것까지 본다.
 *
 * ---
 *
 * **`!important`를 쓰지 않는다 (P4a-2 D8).** 그 계획의 성공 판정이 곧 그것이다.
 */
import { actionCssBlocks } from './structures/action'
import { dataCssBlocks } from './structures/data'
import { documentCssBlocks } from './structures/document'
import { inputCssBlocks } from './structures/input'
import { structureCssBlocks } from './structures/structure'

// 공용 도구는 `structure-css-tools.ts`가 소유한다. 여기서 다시 내보내는 것은 **부르는
// 자리를 바꾸지 않기 위해서**이고(공개 API·기존 import), 정의는 한 벌뿐이다.
export { NODE_VAR_PREFIX, TREE_INDENT_VAR, componentRule, nodeVar, partRule } from './structure-css-tools'

/**
 * 구조 기본 CSS 한 장.
 *
 * **그룹 순서가 곧 캐스케이드 순서다.** 카탈로그의 `ALL`과 같은 순서로 둔다 — 순서가
 * 바뀌면 같은 특이도의 규칙끼리 우열이 뒤집힌다(위 (B) 판정). `structure-groups.test.ts`가
 * 준비 웨이브의 규칙 다섯이 이 순서로 남아 있는 것을 지킨다.
 *
 * ---
 *
 * **`var(…, 기본값)`의 기본값 자리에 대하여 (P4a-2 재라 #2 — 잰 결과: 둘 다 둔다).**
 * 오늘 렌더러는 **값을 항상 낸다** — 카탈로그의 props가 전부 `.default()`를 갖고
 * `renderNode`가 `safeParse`한 결과(`parsed.data`)를 구조 구현체에 넘기므로, 노드가 prop을
 * 비워도 기본값이 채워진 뒤에 온다. 검증이 실패하면 구조가 아예 그려지지 않고 폴백이
 * 그려진다. **즉 그 기본값들은 이 경로로는 도달하지 않는다.**
 *
 * 그럼에도 적는 이유는 하나다: `var(--x)`에 값이 없으면 그 선언은 **무효(invalid at
 * computed-value time)**가 되어 상속값이나 초기값으로 떨어지는데, 그 결과가 `display:flex`
 * 옆에서 무엇이 될지는 프로퍼티마다 다르다. 기본값을 적으면 **어떤 경로로 값이 비어도
 * 구조는 선다.** 값이 하나도 없는 세계가 어떻게 보이는지를 케이스가 고정한다.
 */
export function structureBaseCss(): string {
  return [
    ...structureCssBlocks(),
    ...dataCssBlocks(),
    ...inputCssBlocks(),
    ...actionCssBlocks(),
    ...documentCssBlocks(),
  ].join('\n')
}
