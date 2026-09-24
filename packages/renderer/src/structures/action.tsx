/**
 * **액션 그룹.** `Button`·`Link`.
 *
 * 카탈로그의 `component/catalog/action.ts`와 같은 경계다. 등록(`ACTION_ENTRIES`)과
 * 기본 CSS(`actionCssBlocks`)를 이 파일이 소유한다. 공용 도구는 `../structure-css-tools`에
 * 있다 — 복사해 오지 마라.
 */
import type { StructureEntry, StructureRenderer } from './registry'

/**
 * **`Button`의 구조 셋(`solid`·`outline`·`text`)은 DOM이 같다 — 함수 하나가 셋을 그린다.**
 *
 * 재고 정한 것이다. 버튼이 그릴 수 있는 것은
 * `<button>` 하나와 라벨 조각 하나가 전부이고, 셋을 가르는 것은 **채움·테두리·글자색**
 * 뿐이라 전부 CSS다. 세 함수로 갈라 써 봤자 본문이 글자까지 같다.
 *
 * **그래도 구조가 셋인 것은 맞다.** `data-wb-structure`가 `solid`/`outline`/`text`로
 * 갈려 나가고 테마는 그 셀렉터로 세 모습을 만든다(설계서 「컴파일」). 구조 채널이 나르는 것은
 * *"DOM이 다르다"*가 아니라 *"테마가 고른 것이 무엇인가"*이고, 이 셋은 후자만 쓴다.
 *
 * **`variants`(primary·secondary·danger·ghost)와 겹치지 않는다.** 겹쳐 보이는 것은
 * `ghost` 하나인데 채널이 다르다 — 구조는 **테마가 컴포넌트 전체에** 고르고, 변형은
 * **노드가 자기 하나에** 고른다(설계서 「components — 구조 + 스킨」). 그래서 *"이 사이트의 버튼은 전부 아웃라인이고,
 * 그중 이 버튼만 danger"*가 표현된다. 둘을 합치면 그 문장을 쓸 수 없다.
 *
 * **함수를 셋으로 갈라 두지 않는 이유:** 갈라 두면 한쪽만 고쳐 조용히 어긋난다. 지금은
 * 어긋날 자리가 없고, 셋 중 하나가 정말 다른 DOM을 갖게 되는 날 그때 가른다 —
 * `test/structures-action-document.test.tsx`의 동일성 케이스가 그 순간을 잡는다.
 */
export const ButtonBase: StructureRenderer = ({ attrs, props, part }) => (
  <button {...attrs} type="button" disabled={props.disabled === true}>
    <span {...part('label')}>{String(props.label)}</span>
  </button>
)

/** `ButtonBase`의 다른 이름. 셋을 다 그리는 것은 `ButtonBase`다. */
export const ButtonSolid = ButtonBase

export const LinkDefault: StructureRenderer = ({ attrs, props }) => (
  <a {...attrs} href={props.target ? `#${String(props.target)}` : '#'}>
    {String(props.label)}
  </a>
)

/**
 * 이 그룹의 구조가 서기 위한 최소 CSS. **비어 있다** — `Button`·`Link`는 값을
 * 나르는 노드 변수가 없다.
 *
 * 빈 함수를 지우지 않는 것은, 이 그룹에 규칙이 필요해졌을 때 **어디에 넣을지
 * 찾지 않게** 하려는 것이다. 규칙을 더하면 여기에 `blocks.push(…)`를 더한다.
 * 셀렉터를 손으로 쓰지 마라 — `componentRule`·`partRule`만 쓴다.
 */
export function actionCssBlocks(): string[] {
  return []
}

/** 이 그룹이 등록하는 구조. 구조를 더하면 여기에 한 줄을 더한다(파일 끝에 둔다 — TDZ). */
export const ACTION_ENTRIES: StructureEntry[] = [
  ['Button', 'solid', ButtonBase],
  ['Button', 'outline', ButtonBase],
  ['Button', 'text', ButtonBase],
  ['Link', 'default', LinkDefault],
]
