/**
 * 기본 뷰(`default-views/*`)의 CSS 를 만드는 도구. 이름 · 셀렉터 모양의 근거(노드 변수 접두어, 특이도를 테마와 맞추는 까닭,
 * `:where()` 의 Chromium 실측표)는 걷힌 구조 경로의 같은 이름 도구에 있었다 — 다시 보려면
 * `git show b1cfd823^:packages/renderer/src/structure-css-tools.ts` 의 머리말.
 */

/** 노드마다 달라지는 값을 나르는 커스텀 프로퍼티의 접두어. 테마 토큰(`--wb-<키>`)과 이름공간을 가른다. */
export const NODE_VAR_PREFIX = '--wb-node-'

/** 노드가 나르는 값 하나의 변수 이름. `nodeVar('flex', 'direction')` → `--wb-node-flex-direction` */
export function nodeVar(component: string, prop: string): string {
  return `${NODE_VAR_PREFIX}${component}-${prop}`
}

/**
 * 노드 몫을 나르는 변수. `Root` 가 몫이 있는 노드의 뿌리에 인라인으로 싣고, 기본 CSS(`structureCssBlocks`)가 `Flex` · `Grid` 의 자식에서 읽는다.
 * `nodeVar` 꼴(`--wb-node-<컴포넌트>-<prop>`)이 아닌 까닭: 컴포넌트 prop 이 아니라 모든 노드의 필드다.
 */
export const WEIGHT_VAR = `${NODE_VAR_PREFIX}weight`

/** 트리 들여쓰기 한 단계의 폭. **이름이 테마의 손잡이다** — 바꾸면 테마 CSS 가 내는 값이 조용히 안 닿는다. */
export const TREE_INDENT_VAR = '--wb-tree-indent'

/** 컴포넌트 루트 규칙. 특이도 (0,2,0) — 테마 CSS 가 같은 특이도로 뒤에 와서 이긴다. */
export function componentRule(type: string, structure: string, declarations: string[]): string {
  return rule(`[data-wb-component="${type}"][data-wb-structure="${structure}"]`, declarations)
}

/** 조각 규칙. `structures` 를 주면 `:where()` 로 감싸 특이도 (0,2,0) 을 지키며 구조를 가린다. */
export function partRule(type: string, part: string, declarations: string[], structures?: readonly string[]): string {
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
