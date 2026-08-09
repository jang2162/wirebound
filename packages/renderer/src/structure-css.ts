/**
 * 구조 구현체가 서기 위한 최소 CSS. **스킨이 아니다.**
 *
 * ---
 *
 * **왜 이것이 `renderer`에 있는가 (D1).** 구조 구현체와 그것이 성립하기 위한 선언은 같은
 * 패키지에 있어야 둘이 갈리지 않는다. 무엇보다 `themes`는 `renderer`를 볼 수 없다(§3.3의
 * 의존표) — 반대 방향이면 의존이 뒤집힌다.
 *
 * **§3.2의 *"스타일은 전부 `themes`가 컴파일한 CSS가 담당한다"*와 어긋나지 않는다.**
 * 여기 있는 것은 스킨이 아니라 **구조가 서기 위한 최소 선언**이고, 테마가 그것을 덮을 수
 * 있어야 한다는 것이 요구다. 덮지 못하면 이 파일은 실패한 것이고,
 * `test/structure-css.test.ts`가 계산된 스타일로 그것을 지킨다.
 *
 * ---
 *
 * **어떻게 테마가 이것을 이기는가 (재라 #1 — 잰 결과: 순서).**
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
 * **테마 시트보다 먼저** 깐다(D5). 같은 특이도에서는 나중에 온 규칙이 이긴다 —
 * 한 시트 안에서도, 시트 둘로 나눠도 같다는 것을 쟀다.
 *
 * **대가:** 이 파일이 더 구체적인 셀렉터를 쓰는 순간 테마가 진다. `@layer`였다면 특이도와
 * 무관했을 자리다. 그래서 셀렉터 모양을 `componentRule`·`partRule` 두 함수로만 만든다 —
 * 손으로 셀렉터를 쓰는 자리를 남기지 않는 것이 그 대가를 관리하는 방법이다.
 *
 * ---
 *
 * **`!important`를 쓰지 않는다 (D8).** 이 계획의 성공 판정이 곧 그것이다.
 */

/**
 * 노드마다 달라지는 값을 나르는 커스텀 프로퍼티의 접두어 (재라 #5 — 잰 결과: 갈랐다).
 *
 * **계획서 D3은 `--wb-<컴포넌트 소문자>-<prop>`이라고 적었는데, 그 규칙은 테마가 내는
 * 변수 이름과 실제로 충돌한다.** 재서 확인한 것:
 *
 * - `cssVarName`이 `primitives`의 경로에서 변수 이름을 만든다(`--wb-<경로의 .을 ->`).
 *   `primitives.grid.columns`는 `--wb-grid-columns`가 되고, **오늘 `GridDefault`가 내는
 *   이름이 정확히 그것이다.** 이름이 같은데 뜻이 다르다 — 하나는 사이트의 12칼럼 그리드,
 *   하나는 이 노드의 열 수다.
 * - `primitives.section.*`도 컴포넌트 `Section`과 이름공간이 겹친다(`--wb-section-paddingY`).
 *
 * **오늘 눈에 보이는 고장은 아니다.** 노드가 자기 값을 항상 인라인으로 실으므로
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
 * 컴포넌트 루트 규칙. **셀렉터 모양이 `compileTheme`의 `pushComponent`와 같아야 한다** —
 * 특이도가 갈리면 순서가 우선순위가 아니게 된다.
 */
function componentRule(type: string, structure: string, declarations: string[]): string {
  return rule(`[data-wb-component="${type}"][data-wb-structure="${structure}"]`, declarations)
}

function rule(selector: string, declarations: string[]): string {
  return `${selector} {\n${declarations.map((line) => `  ${line}`).join('\n')}\n}`
}

/**
 * 구조 기본 CSS 한 장.
 *
 * **`var(…, 기본값)`의 기본값 자리에 대하여 (재라 #2 — 잰 결과: 둘 다 둔다).**
 * 오늘 렌더러는 **값을 항상 낸다** — 카탈로그의 props가 전부 `.default()`를 갖고
 * `renderNode`가 `safeParse`한 결과(`parsed.data`)를 구조 구현체에 넘기므로, 노드가 prop을
 * 비워도 기본값이 채워진 뒤에 온다. 검증이 실패하면 구조가 아예 그려지지 않고 폴백이
 * 그려진다. **즉 아래 기본값들은 이 경로로는 도달하지 않는다.**
 *
 * 그럼에도 적는 이유는 하나다: `var(--x)`에 값이 없으면 그 선언은 **무효(invalid at
 * computed-value time)**가 되어 상속값이나 초기값으로 떨어지는데, 그 결과가 `display:flex`
 * 옆에서 무엇이 될지는 프로퍼티마다 다르다. 기본값을 적으면 **어떤 경로로 값이 비어도
 * 구조는 선다.** 값이 하나도 없는 세계가 어떻게 보이는지를 케이스가 고정한다.
 */
export function structureBaseCss(): string {
  const blocks: string[] = []

  // ── Flex ──────────────────────────────────────────────────────────────────
  //
  // **`start`/`end`를 그대로 싣고 `flex-start`로 바꾸지 않는다** (Task 2가 정한 것).
  // 근거는 §6.0의 약속이다 — 테마가 이 규칙의 `display`를 `grid`로 덮을 수 있어야 하는데,
  // `flex-start`는 flexbox 밖에서 뜻이 흐려지는 값이고 `start`는 상자 정렬(Box Alignment)
  // 어느 문맥에서나 같은 뜻이다. 변환이 필요한 것은 CSS에 대응 키워드가 없는
  // `between` → `space-between` 하나뿐이고, 그것은 `structure.tsx`가 한다.
  blocks.push(
    componentRule('Flex', 'default', [
      'display: flex;',
      `flex-direction: var(${nodeVar('flex', 'direction')}, row);`,
      `align-items: var(${nodeVar('flex', 'align')}, stretch);`,
      `justify-content: var(${nodeVar('flex', 'justify')}, start);`,
      `flex-wrap: var(${nodeVar('flex', 'wrap')}, nowrap);`,
    ]),
  )

  // ── Grid ──────────────────────────────────────────────────────────────────
  //
  // 열 수는 `repeat()` 안쪽에서만 쓰이므로 **트랙 목록 전체가 아니라 수 하나**를 나른다.
  // `GridDefault`가 이미 `--wb-grid-columns`를 내면서 바로 옆에 `grid-template-columns`를
  // inline으로 박아 무력화하고 있었다 — 옳은 절반이 이미 있었고 틀린 절반을 지운 것이다.
  blocks.push(
    componentRule('Grid', 'default', [
      'display: grid;',
      `grid-template-columns: repeat(var(${nodeVar('grid', 'columns')}, 1), 1fr);`,
    ]),
  )

  return blocks.join('\n')
}
