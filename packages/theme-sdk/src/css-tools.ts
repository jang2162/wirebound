/**
 * 기본 뷰의 CSS 를 만드는 도구. `packages/renderer/src/structure-css-tools.ts` 의 사본이다 — 렌더러의 구조
 * 경로가 걷히면(A1b) 이쪽이 남는다. 이름 · 셀렉터 모양의 근거(노드 변수 접두어, 특이도를 테마와 맞추는 까닭,
 * `:where()` 의 Chromium 실측표)는 그 파일의 머리말이 갖는다.
 *
 * **두 벌이 같은 문자열을 내야 한다** — 캔버스(기본 뷰)와 내보내기(구조 경로)가 같은 CSS 를 읽어야 같은 화면이다.
 * `packages/renderer/test/default-view-parity.test.tsx` 의 «기본 CSS 는 기본 구조를 겨냥한 옛 규칙을 전부 싣는다» 가 대조한다.
 */

/** 노드마다 달라지는 값을 나르는 커스텀 프로퍼티의 접두어. 테마 토큰(`--wb-<키>`)과 이름공간을 가른다. */
export const NODE_VAR_PREFIX = '--wb-node-'

/** 노드가 나르는 값 하나의 변수 이름. `nodeVar('flex', 'direction')` → `--wb-node-flex-direction` */
export function nodeVar(component: string, prop: string): string {
  return `${NODE_VAR_PREFIX}${component}-${prop}`
}

/** 트리 들여쓰기 한 단계의 폭. **이름이 테마의 손잡이다** — 바꾸면 테마 CSS 가 내는 값이 조용히 안 닿는다. */
export const TREE_INDENT_VAR = '--wb-tree-indent'

/** 컴포넌트 루트 규칙. 특이도 (0,2,0) — 테마 CSS 가 같은 특이도로 뒤에 와서 이긴다. */
export function componentRule(type: string, structure: string, declarations: string[]): string {
  return rule(`[data-wb-component="${type}"][data-wb-structure="${structure}"]`, declarations)
}

/** 조각 규칙. `structures` 를 주면 `:where()` 로 감싸 특이도 (0,2,0) 을 지키며 구조를 가린다. */
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

/**
 * 특이도 0 규칙(`:where(…)`). prop 표지 · 상태가 테마 없이도 화면을 바꾸게 하는 최소 모양에 쓴다 — 테마는 같은 속성을 `[data-wb-component]`
 * 하나(특이도 (0,1,0))로 덮는 일이 흔해, `componentRule` 의 (0,2,0) 으로 두면 기본값이 테마를 이긴다.
 */
export function zeroRule(selector: string, declarations: string[]): string {
  return rule(`:where(${selector})`, declarations)
}

function rule(selector: string, declarations: string[]): string {
  return `${selector} {\n${declarations.map((line) => `  ${line}`).join('\n')}\n}`
}
