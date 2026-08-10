/**
 * 구조 기본 CSS를 만드는 **공용 도구.** 그룹 모듈 다섯이 전부 여기서 가져다 쓴다.
 *
 * **한 곳에 남긴 이유** (P4b-2 ①): 규칙을 만드는 자리가 그룹마다 생기면 다섯 벌이 따로
 * 썩는다. 특히 아래 `componentRule`·`partRule`은 **셀렉터의 특이도를 테마와 맞추는 것**이
 * 전부인 함수라, 한 그룹에서만 모양이 어긋나도 그 컴포넌트에서 테마가 진다. 손으로
 * 셀렉터를 쓰는 자리를 남기지 않는 것이 그 위험을 관리하는 방법이다
 * (`structure-css.ts`의 캐스케이드 판정 참고).
 *
 * **이 파일은 잎이다** — 아무것도 import하지 않는다. 그룹 모듈이 이것을 보고
 * `structure-css.ts`가 그룹 모듈을 보므로, 순환이 생기지 않는다.
 */

/**
 * 노드마다 달라지는 값을 나르는 커스텀 프로퍼티의 접두어 (P4a-2 재라 #5 — 잰 결과: 갈랐다).
 *
 * **계획서 D3은 `--wb-<컴포넌트 소문자>-<prop>`이라고 적었는데, 그 규칙은 테마가 내는
 * 변수 이름과 실제로 충돌한다.** 재서 확인한 것:
 *
 * - `cssVarName`이 `primitives`의 경로에서 변수 이름을 만든다(`--wb-<경로의 .을 ->`).
 *   `primitives.grid.columns`는 `--wb-grid-columns`가 되고, **그때 `GridDefault`가 내던
 *   이름이 정확히 그것이었다.** 이름이 같은데 뜻이 다르다 — 하나는 사이트의 12칼럼 그리드,
 *   하나는 이 노드의 열 수다.
 * - `primitives.section.*`도 컴포넌트 `Section`과 이름공간이 겹친다(`--wb-section-paddingY`).
 *
 * **그때 눈에 보이는 고장은 아니었다.** 노드가 자기 값을 항상 인라인으로 실으므로
 * `:root`의 값이 그 노드에서 가려진다. 그러나 **읽는 쪽이 늘어나는 순간 조용히 틀린다** —
 * P4b가 `List:cardGrid`의 기본 CSS에 `var(--wb-grid-columns, 3)`을 쓰면 테마의 12를
 * 집어 온다. P4a-1이 토큰 층에서 이미 겪은 *"조용한 충돌은 마지막 값이 이기고 아무도
 * 모른다"*와 같은 부류다.
 *
 * 그래서 **노드가 나르는 값에만 `--wb-node-` 접두어를 준다.** 테마의 어휘(`cssVarName`)는
 * 경로에서 나오므로 `node.`으로 시작하는 경로가 생기지 않는 한 이 이름공간에 들어올 수
 * 없고, `primitives`의 경로는 스키마가 닫아 두었다(container·grid·section·breakpoints).
 * `test/structure-css.test.ts`가 두 이름 집합이 겹치지 않는 것을 대조한다.
 */
export const NODE_VAR_PREFIX = '--wb-node-'

/** 노드가 나르는 값 하나의 변수 이름. `nodeVar('flex', 'direction')` → `--wb-node-flex-direction` */
export function nodeVar(component: string, prop: string): string {
  return `${NODE_VAR_PREFIX}${component}-${prop}`
}

/**
 * 들여쓰기 한 단계의 폭. **테마의 손잡이다 — P4b-1이 그 경로를 열었다.**
 *
 * P4a-2가 여기에 *"이 이름에 값을 넣을 수 있는 것은 오늘 아무것도 없고 늘 기본값 `16px`이
 * 쓰인다"*고 적었다(계획서 Task 3의 산문을 구현 중 반증한 자리다). **그것이 이제 낡았다** —
 * `themes`의 `treeIndent` 어휘가 이 이름에 값을 낸다(§6.8 밖의 어휘라
 * `STYLE_PROPERTIES_BEYOND_SPEC`에 근거와 함께 등록돼 있다).
 *
 * **이름이 계약이 됐다.** 여기를 바꾸면 테마가 내는 이름과 어긋나 손잡이가 **조용히**
 * 죽는다 — `themes`는 이 패키지를 볼 수 없으므로(§3.3) 그 어긋남을 볼 수 있는 자리는
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
 * 조각 규칙. **구조 이름을 넣지 않는다** — `compileTheme`의 조각 규칙이
 * `[data-wb-component="X"] [data-wb-part="p"]`(특이도 0,2,0)이므로 구조를 더하면
 * 0,3,0이 되어 테마가 진다.
 *
 * **대가:** 같은 컴포넌트의 다른 구조도 이 규칙을 받는다. P4b-2가 구조를 늘리면서 그것이
 * 실제로 드러난다 — 값을 안 싣는 구조는 `var()`의 기본값을 받는다.
 */
export function partRule(type: string, part: string, declarations: string[]): string {
  return rule(`[data-wb-component="${type}"] [data-wb-part="${part}"]`, declarations)
}

function rule(selector: string, declarations: string[]): string {
  return `${selector} {\n${declarations.map((line) => `  ${line}`).join('\n')}\n}`
}
