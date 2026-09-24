/**
 * 구조 기본 CSS를 만드는 **공용 도구.** 그룹 모듈 다섯이 전부 여기서 가져다 쓴다.
 *
 * **한 곳에 두는 이유:** 규칙을 만드는 자리가 그룹마다 생기면 다섯 벌이 따로
 * 썩는다. 특히 아래 `componentRule`·`partRule`은 **셀렉터의 특이도를 테마와 맞추는 것**이
 * 전부인 함수라, 한 그룹에서만 모양이 어긋나도 그 컴포넌트에서 테마가 진다. 손으로
 * 셀렉터를 쓰는 자리를 남기지 않는 것이 그 위험을 관리하는 방법이다
 * (`structure-css.ts`의 캐스케이드 판정 참고).
 *
 * **이 파일은 잎이다** — 아무것도 import하지 않는다. 그룹 모듈이 이것을 보고
 * `structure-css.ts`가 그룹 모듈을 보므로, 순환이 생기지 않는다.
 */

/**
 * 노드마다 달라지는 값을 나르는 커스텀 프로퍼티의 접두어.
 *
 * **`--wb-<컴포넌트 소문자>-<prop>` 꼴은 테마가 내는 변수 이름과 실제로 충돌한다:**
 *
 * - `cssVarName`이 `primitives`의 경로에서 변수 이름을 만든다(`--wb-<경로의 .을 ->`).
 *   `primitives.grid.columns`는 `--wb-grid-columns`가 되는데, 그 꼴이면 `GridDefault`가 내는
 *   이름도 정확히 그것이다. 이름이 같은데 뜻이 다르다 — 하나는 사이트의 12칼럼 그리드,
 *   하나는 이 노드의 열 수다.
 * - `primitives.section.*`도 컴포넌트 `Section`과 이름공간이 겹친다(`--wb-section-paddingY`).
 *
 * **눈에 보이는 고장은 아니다.** 노드가 자기 값을 항상 인라인으로 실으므로
 * `:root`의 값이 그 노드에서 가려진다. 그러나 **읽는 쪽이 늘어나는 순간 조용히 틀린다** —
 * 구조 기본 CSS(예: `List:cardGrid`)가 `var(--wb-grid-columns, 3)`을 쓰면 테마의 12를
 * 집어 온다. 토큰 층의 *"조용한 충돌은 마지막 값이 이기고 아무도 모른다"*와 같은 부류다.
 *
 * 그래서 **노드가 나르는 값에만 `--wb-node-` 접두어를 준다.** 테마의 어휘(`cssVarName`)는
 * 경로에서 나오므로 `node.`으로 시작하는 경로가 생기지 않는 한 이 이름공간에 들어올 수
 * 없고, `primitives`의 경로는 스키마가 닫아 두었다(container·grid·section·breakpoints).
 * `test/structure-css.test.ts`가 두 이름 집합이 겹치지 않는 것을 대조한다.
 *
 * **`--wb-container-*`·`--wb-grid-*`·`--wb-section-*`를 읽는 자리는 테마의 컴포넌트
 * 스타일이다**(`STYLE_PRIMITIVE_NAMESPACES`) — 거기서는 사이트 골격 상수로 읽는 것이 맞다.
 * **구조 기본 CSS가 그 이름을 읽으면 안 된다.** 읽는 순간 사이트 골격 상수(12칼럼)를 이
 * 노드의 열 수로 착각하게 되고, 그것이 이 접두어를 만든 이유다.
 */
export const NODE_VAR_PREFIX = '--wb-node-'

/** 노드가 나르는 값 하나의 변수 이름. `nodeVar('flex', 'direction')` → `--wb-node-flex-direction` */
export function nodeVar(component: string, prop: string): string {
  return `${NODE_VAR_PREFIX}${component}-${prop}`
}

/**
 * 들여쓰기 한 단계의 폭. **테마의 손잡이다.**
 *
 * `themes`의 `treeIndent` 어휘가 이 이름에 값을 낸다(설계서 「스타일 프로퍼티 화이트리스트」
 * 밖의 어휘라 `STYLE_PROPERTIES_BEYOND_SPEC`에 근거와 함께 등록돼 있다). 테마가 값을 안
 * 주면 기본값 `16px`이 쓰인다.
 *
 * **이름이 계약이다.** 여기를 바꾸면 테마가 내는 이름과 어긋나 손잡이가 **조용히**
 * 죽는다 — `themes`는 이 패키지를 볼 수 없으므로(설계서 「각 패키지의 책임과 의존」) 그 어긋남을 볼 수 있는 자리는
 * `apps/web/test/theme/cascade.test.tsx`의 대조 케이스뿐이고, 이 상수를 `index.ts`에서
 * 내보내는 것이 그 때문이다.
 *
 * **실측(Chromium):** 테마가 `40px`를 주면 단계별 `padding-left`가 0/40/80px이고,
 * 안 주면 기본값으로 0/16/32px이다. 그 표는 위 케이스의 머리말에 있다.
 */
export const TREE_INDENT_VAR = '--wb-tree-indent'

/**
 * 컴포넌트 루트 규칙. **셀렉터 모양이 `compileTheme`의 `pushComponent`와 같아야 한다** —
 * 특이도가 갈리면 순서가 우선순위가 아니게 된다.
 */
export function componentRule(type: string, structure: string, declarations: string[]): string {
  return rule(`[data-wb-component="${type}"][data-wb-structure="${structure}"]`, declarations)
}

/**
 * 조각 규칙.
 *
 * **구조 이름을 맨 셀렉터로 넣지 않는다** — `compileTheme`의 조각 규칙이
 * `[data-wb-component="X"] [data-wb-part="p"]`(특이도 0,2,0)이므로 구조를 그냥 더하면
 * 0,3,0이 되어 **그 컴포넌트에서 테마가 진다.**
 *
 * **`structures`를 주면 `:where()`로 감싸 그 대가 없이 구조를 가린다.**
 * `:where()` 안의 것은 **특이도가 0**이므로
 * `[data-wb-component="X"]:where([data-wb-structure="Y"]) [data-wb-part="p"]`는
 * 여전히 **(0,2,0)**이면서 `Y`가 아닌 구조는 안 받는다.
 *
 * **Chromium 151로 쟀다 — jsdom으로는 못 잰다.** jsdom 25는 **특이도를 아예 계산하지
 * 않고 순서만 따른다**(실측: `#v`(1,0,0)가 뒤에 온 `[data-wb-part]`(0,1,0)에게 진다).
 * 그래서 아래 표는 전부 실제 브라우저의 값이다. `test/structure-css.test.ts`는 셀렉터
 * **모양**만 문자열로 단언하고, 이기고 지는 것은 재지 않는다 — 잴 수 없기 때문이다.
 *
 * | 시트 | `vertical`의 `list` | `underline`의 `list` |
 * |---|---|---|
 * | 구조 없는 꼴만 | 받는다 | **받는다 — 이것이 샘이다** |
 * | `:where(vertical)`만 | 받는다 | **안 받는다** |
 * | `:where(vertical)` + 테마 조각 규칙(나중) | **테마가 이긴다** | — |
 * | 맨 셀렉터로 구조 + 테마 조각 규칙(나중) | **구조가 이긴다 — 고장** | — |
 *
 * **언제 주고 언제 안 주는가.** 그 조각을 내는 구조 **전부가** 이 선언을 원하면 주지 마라
 * (`Media`의 `frame` — 넷 다 비율을 싣는다). 원하는 구조가 그중 일부일 때만 준다.
 * 어느 쪽이든 **누가 받는지는 `test/structure-css.test.ts`의 수신자 표가 못박는다.**
 */
export function partRule(
  type: string,
  part: string,
  declarations: string[],
  structures?: readonly string[],
): string {
  const scope =
    structures === undefined || structures.length === 0
      ? ''
      : `:where(${structures.map((name) => `[data-wb-structure="${name}"]`).join(', ')})`
  return rule(`[data-wb-component="${type}"]${scope} [data-wb-part="${part}"]`, declarations)
}

function rule(selector: string, declarations: string[]): string {
  return `${selector} {\n${declarations.map((line) => `  ${line}`).join('\n')}\n}`
}
