/**
 * `shell.css`가 설계 D7을 지키는지 보는 검사. 규칙의 뜻과 근거는 `shell.css` 머리말에 있고,
 * 여기 있는 것은 **그 규칙을 기계가 보는 형태**다.
 *
 * **왜 rg 명령이 아니라 파서인가.** 앞 라운드까지 이 검사는 `shell.css` 주석에 적힌 `rg`
 * 명령 셋이었다. 리뷰가 표로 적은 위반 열넷을 심어 재보니 **열넷 다 빠져나갔다** — 정규식이
 * 속성 이름 목록을 훑는 형태라 목록에 없는 상속 속성(`font-weight`·`list-style`·
 * `pointer-events`…)을 못 보고, `{` 앞의 공백 하나에 매여 있어 `.a{ color: red }`도
 * 못 봤다. 그래서 두 가지를 바꿨다.
 *
 * 1. **포맷을 보지 않는다.** 주석을 걷고 중괄호를 세어 규칙으로 가르므로 줄바꿈·공백·
 *    콤마 나열이 결과를 바꾸지 않는다.
 * 2. **허용 목록으로 뒤집었다.** 문서를 감싸는 상자에는 *열거한 것만* 걸 수 있다. 금지
 *    목록이면 내가 열거하지 못한 상속 속성이 그대로 새지만, 허용 목록이면 열거하지 않은
 *    속성은 상속되든 아니든 일단 걸린다.
 *
 * **이 검사가 보지 못하는 것**(고의로 열어 둔 것이 아니라, 못 보는 것):
 *
 * - `shell.css` **밖의** 스타일. `.tsx`의 인라인 `style`, `<style>` 태그, 다른 CSS 파일은
 *   읽지 않는다. `apps/web/src`의 CSS 파일은 `shell.css` 하나이고 JSX `<style>` 태그는
 *   없다(검산: `rg --files apps/web/src -g '*.css'` — **`rg -l '\.css$'`로 쓰지 마라.**
 *   그것은 파일 이름이 아니라 **내용**에서 `.css`로 끝나는 줄을 찾아 `draft-css.ts`를 낸다).
 *
 *   **인라인 `style`은 두 부류뿐이고 둘 다 상속되지 않는 속성만 건다.**
 *
 *   ㉠ **자리·크기를 코드가 계산하는 것** — 캔버스 프레임의 폭·줌(`routes/editor.tsx`),
 *      선택 아웃라인의 자리(`canvas/canvas.tsx`).
 *   ㉡ **값 자체가 스타일인 미리보기** — 토큰 GUI의 색 견본·간격 막대·타이포 표본
 *      (`theme/token-editor.tsx`). 초안의 값을 그대로 그려야 해서 정적 CSS로 쓸 수 없고,
 *      커스텀 프로퍼티로 우회하면 그 이름이 테마가 `:root`에 싣는 것과 겹친다.
 *
 *   **수를 적지 않는 것이 의도다** — 자리 수는 파일이 하나 늘 때마다 낡고, 이 저장소가
 *   여러 사이클 연속 깨진 부류가 정확히 그것이다. **부류가 늘 때만 이 주석을 고친다.**
 *   새 인라인이 ㉠·㉡ 어디에도 안 들어가면 그때는 정말로 검토가 필요한 것이다.
 *   지금 자리를 세려면: `grep -rn 'style={' apps/web/src`.
 *
 *   어느 쪽이든 **검사가 보고 있어서 안전한 것이 아니다.**
 *
 *   **P4a-2에서 셋째가 생겼다:** `theme/use-theme-css.ts`가 `document.head`에 `<style>`
 *   둘을 만들어 붙인다. 그 시트는 **문서 노드를 겨냥하는 것이 일**이므로 D7이 금지하는
 *   대상이 아니다 — D7이 가른 선은 *"셸이 문서를 스타일하지 않는다"*이고, 저 시트의
 *   내용은 셸이 아니라 `packages/renderer`의 구조 기본 CSS와 `packages/themes`가 컴파일한
 *   테마 CSS다. 다만 **이 검사는 그 시트를 읽지 않는다**는 사실은 위와 같다.
 * - `WRAPPERS`에 없는 상자. 문서를 감싸는 상자가 새로 생기면 **사람이 여기 더해야** 한다.
 *   그 목록은 `canvas/canvas.tsx`·`routes/editor.tsx`가 무엇을 감싸는지에 매여 있고,
 *   검사가 스스로 알아낼 방법이 없다.
 * - 주석 걷기를 속이는 형태. 주석 여는 기호가 CSS 문자열 안에 들어 있으면 파서가 거기서
 *   부터 잘못 읽는다. **지금 파일의 CSS 문자열에는 중괄호도 주석 기호도 없다** — 문자열
 *   자체는 10줄에 있다(`grid-template-areas`의 두 줄, `'Segoe UI'` 다섯 줄, 속성 선택자
 *   세 줄). 즉 오늘 파서를 속이는 것이 없을 뿐, 문자열을 다루지 않아도 되는 것은 아니다.
 *   흔한 형태(`content: "{"`)에서는 `unreadable`을 내고 **거기서 스캔을 멈춘다** — 조용히
 *   지나가지는 않지만 그 뒤의 위반은 보고되지 않는다.
 * - **CSS 중첩. 실질적인 사각이다.** 비-wrapper 규칙 안의 중첩은 완전히 보이지 않는다
 *   (실측: `.wb-shell-header { .planted { color: blue } }`·`{ & div { … } }`·
 *   `{ @media (…) { … } }` 전부 **0건**). 감싸는 상자 넷 안의 중첩은 `checkWrapperBody`가
 *   선언 파서로 훑다가 우연히 걸리지만 메시지가 틀린 말을 한다. 그리고
 *   `.wb-shell-header { & ~ .wb-shell-canvas * { font-family: serif } }`처럼 중첩 안에서
 *   결합자로 문서까지 뻗으면 **진짜 D7 위반이 검사를 통과한다**(실측 0건). CSS 중첩은
 *   오늘 브라우저에 다 있으므로 P4a·P4b가 쓰기 전에 닫아야 한다.
 * - **`@import`.** 조용히 0건이다(실측: `@import url('other.css');`). `shell.css`가 다른
 *   파일을 import하면 그 안의 규칙 전부가 검사 밖에 놓인다. `@font-face`를 fail-loud로
 *   막은 것과 같은 이유로 막는 편이 일관된다.
 * - **`@keyframes`의 이름과 그 안의 선언.** 통째로 건너뛴다(`scanRules`의 주석 — 거짓
 *   양성을 없애려고 그렇게 뒀다). 애니메이션 이름에 `wb-shell-` 접두어가 있는지 보지
 *   않는다.
 *
 * **거짓 양성으로 남겨 둔 것 둘**(잰 값이다):
 *
 * - 선언만 갖는 at-rule(`@font-face` 등)은 `unreadable`을 낸다. **설계된 fail-loud다** —
 *   조용히 지나가면 그 안이 검사 밖에 놓이므로, 메시지가 "검사를 확장하고 나서 써라"라고
 *   말한다.
 * - 규칙이 하나도 없는 `@media (…) { }`도 같은 이유로 `unreadable`이 된다. 규칙 없는
 *   미디어 쿼리는 죽은 코드라 실질적으로 무해하다.
 */

/** 검사 이름. 어느 규칙이 물었는지가 실패 메시지와 양성 대조 표에 그대로 나온다. */
export type CheckName =
  | 'selector-prefix'
  | 'selector-combinator'
  | 'selector-class'
  | 'selector-function'
  | 'wrapper-property'
  | 'wrapper-variable'
  | 'unreadable'

export interface Violation {
  check: CheckName
  /** 문제가 된 선택자(공백을 한 칸으로 고른 형태). 읽을 수 없는 조각이면 그 조각이다. */
  selector: string
  message: string
}

/**
 * 문서를 **감싸는** 상자들. 여기 걸린 상속 속성은 선택자가 문서 노드를 겨냥하지 않아도
 * 자식으로 물려 내려간다 — 선택자 검사가 못 보는 누수라 속성으로 따로 본다.
 *
 * **세는 단위는 "문서 노드가 그 안에 들어오는 클래스"다.** 한 줄에 하나씩 적는다.
 * 검산 — 문서 노드가 **바로 그 안에** 들어오는 상자 둘(캔버스·갤러리 항목)을 소스에서 찾는다:
 * `rg -n 'wb-shell-canvas-surface|wb-shell-gallery-item' apps/web/src`
 * (검산 명령에 `*` 뒤 `/`를 쓰지 마라 — 이 주석이 거기서 끝난다. 처음에 그렇게 적었다가
 * `esbuild`가 이 파일을 통째로 못 읽었다.)
 *
 * 1. `wb-shell` — 에디터 셸의 루트(`shell.css` 머리말 4번의 사슬 첫 칸)
 * 2. `wb-shell-canvas` — 그 사슬 둘째
 * 3. `wb-shell-canvas-frame` — 셋째
 * 4. `wb-shell-canvas-surface` — 넷째. 여기 안에 페이지 문서가 들어온다
 * 5. `wb-shell-theme` — **테마 저작 화면의 루트**(P4c-2 D1). 셸 밖의 별도 라우트라
 *    사슬이 따로다
 * 6. `wb-shell-theme-gallery` — 그 사슬 둘째. 라우트가 그리는 `<main>`이다
 * 7. `wb-shell-gallery-list` — 그 사슬 셋째. 항목 상자들이 여기 들어온다(②의 W3이 더했다)
 * 8. `wb-shell-gallery-item` — 그 사슬 넷째. **여기 안에 갤러리가 `renderNode`로 그린 문서
 *    노드가 들어온다.** 캡션(`wb-shell-gallery-caption`)은 그 문서 노드의 **형제**라
 *    감싸는 상자가 아니다 — 그래서 이 목록에 없고 글자 속성을 마음대로 건다
 *
 * > **①이 자리를 만들 때 6번을 미리 넣었고, 7·8은 갤러리를 채운 W3이 넣었다.** 그것이
 * > 이 목록의 유일한 갱신 방법이다 — 목록에 없는 상자에 상속 속성을 걸면 **0 사망**이고
 * > 있으면 **14 사망**이다(①이 6번으로 재서 확인했다). 즉 여기 더하지 않으면 D7 위반이
 * > 조용히 지나간다. **갤러리 안에 상자를 또 만드는 사람은 여기 한 줄을 더해야 한다.**
 */
const WRAPPERS = new Set([
  'wb-shell',
  'wb-shell-canvas',
  'wb-shell-canvas-frame',
  'wb-shell-canvas-surface',
  'wb-shell-theme',
  'wb-shell-theme-gallery',
  'wb-shell-gallery-list',
  'wb-shell-gallery-item',
])

/**
 * 감싸는 상자에 걸 수 있는 속성. **여기 없는 것은 전부 위반이다.**
 *
 * 지금 목록은 그 넷이 실제로 쓰는 속성 그대로이고, 전부 상속되지 않는 속성이다. 새 속성이
 * 필요하면 **상속되지 않는지 확인한 뒤** 여기 더해라 — 그 확인을 사람이 한 번 하라는 것이
 * 이 목록의 목적이다. 상속되는 속성은 셸이 실제로 그리는 조각(머리·좌측·우측·안내 화면)에
 * 걸면 되고, 그 조각들은 이 검사의 대상이 아니다.
 */
const WRAPPER_PROPERTIES = new Set([
  'position',
  'inset',
  'display',
  'grid-template-columns',
  'grid-template-rows',
  'grid-template-areas',
  'grid-area',
  'gap',
  'background',
  'min-width',
  'min-height',
  'overflow',
  'padding',
  'margin',
  'transform-origin',
  'box-shadow',
])

/** 셸의 클래스·변수 접두어. 테마가 쓰는 이름과 겹칠 수 없다는 것이 D7의 1번이다. */
const PREFIX = 'wb-shell'

interface Rule {
  prelude: string
  body: string
}

/** `shell.css` 전문에서 D7 위반을 찾는다. 빈 배열이면 위반이 없다. */
export function findViolations(css: string): Violation[] {
  const violations: Violation[] = []
  const rules: Rule[] = []

  scanRules(stripComments(css), rules, violations)

  for (const rule of rules) {
    const selectors = splitTop(rule.prelude, ',')
    for (const selector of selectors) checkSelector(selector, violations)

    // 선택자 목록 중 **하나라도** 감싸는 상자면 그 블록의 선언 전부가 그 상자에 걸린다.
    // 첫 클래스만 보지 않는 것은 `.wb-shell-title.wb-shell-canvas-frame`처럼 감싸는 상자가
    // 뒤에 오는 형태를 놓치지 않기 위해서다. 결합자가 있는 선택자는 여기서 빼는데, 그 선언이
    // 걸리는 것은 상자가 아니라 그 **안쪽**이기 때문이다 — 그런 선택자는 이미 위에서 걸렸고,
    // 여기까지 세면 메시지가 "상자에 건 속성"이라고 잘못 말한다.
    const wrappers = selectors.filter(
      (selector) =>
        !hasCombinator(selector) &&
        classNames(skeleton(selector)).some((name) => WRAPPERS.has(name)),
    )
    if (wrappers.length > 0) checkWrapperBody(rule.body, wrappers.join(', '), violations)
  }

  return violations
}

/**
 * `shell.css`가 **규칙을 갖는** 클래스 이름 전부. `shell-css-coverage.ts`가 이것을 쓴다 —
 * *"코드가 붙인 클래스에 규칙이 있는가"*의 CSS 쪽 절반이다.
 *
 * **`findViolations`와 파서를 나눠 쓰는 것이 요점이다.** 주석 걷기·중괄호 세기·선택자
 * 가르기를 두 벌 두면 한쪽만 고쳐지는 자리가 생기고, 그러면 D7 검사와 커버리지 검사가
 * **같은 파일을 다르게 읽는다**.
 *
 * **못 보는 것**(이 함수 몫):
 *
 * - `@keyframes` 안. `scanRules`가 통째로 건너뛰므로 그 안의 이름은 여기 없다. 키프레임
 *   선택자는 클래스가 아니므로 의도한 것이다.
 * - **상태만 갖는 규칙과 진짜 규칙을 구분하지 않는다.** `.x:disabled { … }`만 있고
 *   `.x { … }`가 없어도 `x`는 "규칙이 있다"로 센다. 가르려면 의사 클래스 목록을 여기
 *   두어야 하는데, 그 목록이 낡는 쪽이 더 나쁘다.
 * - `:not(.y)` 안의 `.y`는 **세지 않는다**(`stripParens`). 그 클래스는 규칙을 받는 것이
 *   아니라 배제되는 것이다. 오늘 이 파일에 함수형 의사 클래스는 없다 — `checkSelector`가
 *   막는다.
 * - **복합 선택자 `.a.b`의 두 이름을 낱개로 센다.** 그 규칙은 둘이 **함께** 붙은 요소에만
 *   걸리는데, 여기서는 `a`도 `b`도 각각 "규칙 있음"이 된다. 그래서 `.a.b` 규칙만 있고
 *   `a`만 붙이는 자리가 있으면 그 자리는 무스타일인데 커버리지 검사가 통과한다.
 *   **오늘 `shell.css`에 다중 클래스 선택자는 0개다**(검산:
 *   `grep -cE '^\.wb-shell[A-Za-z0-9_-]*\.wb-shell' apps/web/src/shell.css`). 가르려면
 *   "이 클래스 하나만으로 걸리는 규칙이 있는가"를 봐야 하는데, 그러면 `.a:disabled`처럼
 *   정당한 형태와 구분할 규칙이 하나 더 필요해진다 — 0건인 것을 위해 들일 복잡도가 아니다.
 */
export function ruledClasses(css: string): Set<string> {
  const rules: Rule[] = []
  // 위반은 여기서 보지 않는다 — 그 몫은 `findViolations`다. 같은 파일을 두 번 읽는 대신
  // 파서만 같이 쓰고 결과를 각자 만든다.
  scanRules(stripComments(css), rules, [])

  const names = new Set<string>()
  for (const rule of rules) {
    for (const selector of splitTop(rule.prelude, ',')) {
      for (const name of classNames(stripParens(skeleton(selector)))) names.add(name)
    }
  }
  return names
}

/**
 * **`--wb-shell-*` 팔레트를 선언하는 클래스들** — 즉 "화면 루트". `shell-css-palette.test.ts`가
 * 이것을 쓴다.
 *
 * **이 집합이 왜 따로 필요한가.** 셸 밖 라우트는 `.wb-shell` 아래에 있지 않으므로 팔레트를
 * 스스로 선언해야 한다. 안 하면 `var(--wb-shell-accent)`가 **계산 시점에 무효**가 되고
 * `color`는 상속 속성이라 결과가 검정이다 — 렌더는 되고 아무것도 실패하지 않는다.
 * 이번 브랜치가 잡으려던 침묵과 정확히 같은 부류라 기계가 보게 한다.
 *
 * 값은 `ruledClasses`와 같은 파서에서 나온다. **못 보는 것도 그쪽과 같다**(복합 선택자를
 * 낱개로 세는 것 포함).
 */
export function paletteRoots(css: string): Set<string> {
  const rules: Rule[] = []
  scanRules(stripComments(css), rules, [])

  const roots = new Set<string>()
  for (const rule of rules) {
    // 선언 이름이 `--wb-shell-`로 시작하는 것이 하나라도 있으면 그 선택자들이 화면 루트다.
    const declares = splitTop(rule.body, ';').some((declaration) =>
      declaration.trim().toLowerCase().startsWith(`--${PREFIX}-`),
    )
    if (!declares) continue

    for (const selector of splitTop(rule.prelude, ',')) {
      for (const name of classNames(stripParens(skeleton(selector)))) roots.add(name)
    }
  }
  return roots
}

/** `var(--x, …)` 사용 한 자리. `shell-css-palette.test.ts`가 이것을 쓴다. */
export interface VariableUse {
  /** `--`를 포함한 이름 그대로. `var(` 뒤의 첫 토큰이므로 `--`로 시작하지 않을 수도 있다. */
  name: string
  /** `var(--x, #fff)`처럼 대체값이 있는가. 있으면 선언이 없어도 무효가 되지 않는다. */
  hasFallback: boolean
}

/**
 * **`shell.css`가 선언하는 커스텀 프로퍼티 이름 전부**(`--`를 포함한 형태).
 * `shell-css-palette.test.ts`가 `variableUses`와 짝지어 *"쓰는데 선언이 없는 이름"*을 찾는다.
 *
 * 값은 `paletteRoots`와 **같은 파서에서 같은 방식으로** 나온다 — 주석을 걷고, 규칙으로
 * 가르고, 본문을 `;`로 나눈다. 그래서 팔레트 검사가 "어느 선택자가 선언하는가"로 보는 것과
 * 이쪽이 "어떤 이름이 선언되는가"로 보는 것이 **같은 글자를 읽는다.**
 *
 * **못 보는 것:**
 *
 * - `@keyframes` 안의 선언. `scanRules`가 통째로 건너뛴다(그쪽 주석). 키프레임 안에서만
 *   선언되고 밖에서 쓰이는 변수는 여기 없어 "선언 없음"으로 잡히는데, 그것은 실제로도
 *   밖에서 무효이므로 **틀린 판정이 아니다.**
 * - **이름의 접두어를 보지 않는다.** `.wb-shell-comment-body { --brand: red }`처럼 감싸는
 *   상자가 아닌 규칙에서 접두어 없는 변수를 선언하면 여기 그대로 들어온다. 그 형태를 막는
 *   것은 `wrapper-variable`인데 그쪽은 `WRAPPERS`만 본다. **이 함수의 몫이 아니다** —
 *   여기서 접두어까지 요구하면 "선언됐는가"와 "이름이 옳은가"가 한 함수에 섞인다.
 */
export function declaredVariables(css: string): Set<string> {
  const rules: Rule[] = []
  scanRules(stripComments(css), rules, [])

  const names = new Set<string>()
  for (const rule of rules) {
    for (const declaration of splitTop(rule.body, ';')) {
      const colon = declaration.indexOf(':')
      if (colon === -1) continue
      const property = declaration.slice(0, colon).trim().toLowerCase()
      if (property.startsWith('--')) names.add(property)
    }
  }
  return names
}

/**
 * **`shell.css`의 `var(…)` 사용 전부**, 나온 순서대로. 같은 이름이 여러 번 나오면 여러 번
 * 들어온다 — 세는 쪽이 쓸 일이 있고, 줄이는 것은 부르는 쪽에서 하면 된다.
 *
 * **여기만 `scanRules`를 안 쓴다.** 위의 셋(`findViolations`·`ruledClasses`·`paletteRoots`)은
 * *"어느 규칙이 무엇을 하는가"*를 묻지만 이쪽은 *"이 이름이 이 파일에서 쓰이는가"*를 묻고,
 * 그 답에 규칙 구조가 필요 없다. 그리고 주석을 걷은 원문을 통째로 훑는 쪽이 **더 많이 본다** —
 * `scanRules`가 건너뛰는 `@keyframes` 안의 `var()`도 여기서는 보인다. 주석 걷기는 그대로
 * 공유하므로 *"주석에 적힌 예시가 검사에 걸린다"*는 사고는 여기서도 안 난다(이 파일 머리말이
 * 그 예를 든다 — `shell.css`의 팔레트 주석이 본문에 `var(--wb-shell-accent)`를 적고 있다).
 *
 * **`var(` 뒤의 첫 토큰을 그대로 담는다.** `--`로 시작하지 않는 이상한 형태도 버리지 않고
 * 그 글자 그대로 내보내, 부르는 쪽에서 "선언되지 않은 이름"으로 **소리 내며** 걸리게 한다.
 * 조용히 버리면 그것이야말로 이 검사가 없애려는 침묵이다.
 *
 * **못 보는 것:** `shell.css` 밖. `theme/use-theme-css.ts`가 `document.head`에 붙이는 시트와
 * `.tsx`의 인라인 `style`은 읽지 않는다(머리말의 같은 항목). 그쪽은 **테마의 어휘**라
 * `--wb-shell-*`를 쓰지도 않는다(D5 — 두 이름 집합의 교집합이 비어 있다).
 */
export function variableUses(css: string): VariableUse[] {
  const uses: VariableUse[] = []
  // 이름 뒤에 오는 것은 `,`(대체값 있음) 아니면 `)`(없음)뿐이다. 둘 다 아니면 깨진
  // 형태이므로 대체값 없음으로 두어 아래 검사에서 걸리게 한다.
  const pattern = /var\(\s*([^,)\s]*)\s*([,)]?)/g

  for (const match of stripComments(css).matchAll(pattern)) {
    // `?? ''`는 `noUncheckedIndexedAccess` 때문이다 — 두 그룹 다 `*`·`?`라 항상 참여하므로
    // 실행 시점에 `undefined`가 될 수 없지만, 타입은 그것을 모른다.
    uses.push({ name: match[1] ?? '', hasFallback: match[2] === ',' })
  }
  return uses
}

/** 주석을 걷는다. 주석 안의 선택자·속성이 검사에 걸리면 안 된다(머리말이 그 예를 든다). */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, ' ')
}

/**
 * 중괄호를 세어 규칙으로 가른다. **선택자와 `{` 사이의 공백을 보지 않는다** — 앞 라운드의
 * `rg` 검사가 정확히 그 공백 하나에 매여 있었다.
 *
 * `@media`처럼 안에 규칙을 품는 at-rule은 안으로 들어가고, 선언만 갖는 at-rule
 * (`@font-face` 등)은 **읽을 수 없다고 신고한다** — 조용히 지나가면 그 안의 규칙이
 * 검사 밖에 놓인다.
 */
function scanRules(css: string, rules: Rule[], violations: Violation[]): void {
  let index = 0
  let start = 0

  while (index < css.length) {
    const char = css[index]

    if (char === '{') {
      const prelude = css.slice(start, index).trim()
      const end = matchBrace(css, index)

      if (end === -1) {
        violations.push({
          check: 'unreadable',
          selector: normalize(prelude),
          message: '닫히지 않은 블록이라 검사가 이 아래를 읽지 못한다',
        })
        return
      }

      const body = css.slice(index + 1, end)

      if (prelude.startsWith('@')) {
        // **`@keyframes`는 통째로 건너뛴다.** 안의 `from`·`to`·`50%`는 선택자가 아니라
        // 키프레임 선택자인데, 그것을 규칙으로 세면 `` `.wb-shell…` 클래스로 시작하지
        // 않는다 ``는 엉뚱한 말로 **정당한 CSS를 막는다**(실측: `@keyframes wb-shell-spin
        // { from{…} to{…} }` 하나가 `selector-prefix` 2건을 냈다).
        //
        // 안의 선언이 문서로 새지 않는 것은 **애니메이션을 감싸는 상자에 걸 수 없기**
        // 때문이다 — `animation`도 `animation-name`도 `WRAPPER_PROPERTIES`에 없어 그
        // 자리에서 먼저 걸린다. 대신 **애니메이션 이름의 접두어는 보지 않는다**(아래
        // 머리말의 못 보는 것 목록).
        if (!isKeyframes(prelude)) {
          if (body.includes('{')) scanRules(body, rules, violations)
          else
            violations.push({
              check: 'unreadable',
              selector: normalize(prelude),
              message: '이 at-rule은 검사가 다루지 않는다 — 검사를 확장하고 나서 써라',
            })
        }
      } else if (prelude !== '') {
        rules.push({ prelude, body })
      }

      index = end + 1
      start = index
      continue
    }

    if (char === '}') {
      // 짝 없는 닫는 괄호. 여기서 멈추면 뒤가 통째로 안 보이므로 다음 규칙부터 다시 읽는다.
      index += 1
      start = index
      continue
    }

    index += 1
  }
}

/**
 * `@keyframes`인가. 뒤에 애니메이션 이름이 붙으므로 전체가 아니라 앞부분으로 본다.
 * 벤더 접두어(`@-webkit-keyframes`)도 같이 잡는다.
 */
function isKeyframes(prelude: string): boolean {
  return /^@(-[a-z]+-)?keyframes\b/i.test(prelude)
}

/** `open`의 `{`와 짝이 되는 `}`의 위치. 없으면 `-1`이다. */
function matchBrace(css: string, open: number): number {
  let depth = 0

  for (let index = open; index < css.length; index += 1) {
    if (css[index] === '{') depth += 1
    else if (css[index] === '}') {
      depth -= 1
      if (depth === 0) return index
    }
  }

  return -1
}

/**
 * 괄호·대괄호·따옴표 안을 건너뛰며 `separator`로 가른다. 선택자 목록의 콤마와 선언의
 * 세미콜론이 같은 함수를 쓴다.
 */
function splitTop(text: string, separator: string): string[] {
  const parts: string[] = []
  let depth = 0
  let quote: string | null = null
  let buffer = ''

  for (const char of text) {
    if (quote !== null) {
      buffer += char
      if (char === quote) quote = null
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      buffer += char
      continue
    }
    if (char === '(' || char === '[') depth += 1
    else if (char === ')' || char === ']') depth -= 1

    if (char === separator && depth === 0) {
      parts.push(buffer)
      buffer = ''
      continue
    }
    buffer += char
  }

  parts.push(buffer)
  return parts.map((part) => part.trim()).filter((part) => part !== '')
}

/**
 * 선택자 하나를 본다. 허용하는 형태는 **`wb-shell` 클래스 하나로 시작하는 복합 선택자
 * 하나**뿐이다 — 결합자도, 함수형 의사 클래스도 없다.
 *
 * 이 한 문장이 D7의 2·3번을 함께 막는다. 요소 선택자(`div`)·전체 선택자(`*`)·속성 선택자
 * (`[data-wb-id]`)·id 선택자는 전부 "`wb-shell` 클래스로 시작하지 않는다"에 걸리고,
 * 자손·자식·형제는 "결합자가 있다"에 걸린다.
 */
function checkSelector(selector: string, violations: Violation[]): void {
  const shown = normalize(selector)
  const bare = skeleton(selector)

  // 함수형 의사 클래스는 안에 **선택자 목록**을 품는다(`:is(div)`). 그 안을 따로 보는 대신
  // 통째로 막는다 — 셸에는 필요한 자리가 없고, 열어 두면 여기로 요소 선택자가 들어온다.
  const functional = /:[a-zA-Z-]+\(/.exec(bare)
  if (functional !== null) {
    violations.push({
      check: 'selector-function',
      selector: shown,
      message: `함수형 의사 클래스(${functional[0]})는 안에 선택자를 품는다 — 쓰지 않는다`,
    })
  }

  const outside = stripParens(bare)
  if (hasCombinator(selector)) {
    violations.push({
      check: 'selector-combinator',
      selector: shown,
      message:
        '결합자(자손·자식·형제·전체)는 셸의 상자 안에 들어올 내용까지 겨냥한다 — 클래스를 직접 붙여라',
    })
  }

  const base = baseClass(selector)
  if (base === null || !isShellName(base)) {
    violations.push({
      check: 'selector-prefix',
      selector: shown,
      message: `\`.${PREFIX}…\` 클래스로 시작하지 않는다 — 요소·전체·속성·id 선택자는 문서 노드에 그대로 닿는다`,
    })
  }

  for (const name of classNames(outside)) {
    if (!isShellName(name)) {
      violations.push({
        check: 'selector-class',
        selector: shown,
        message: `\`.${name}\`에 \`${PREFIX}-\` 접두어가 없다 — 테마가 쓰는 이름과 겹칠 수 있다`,
      })
    }
  }
}

/**
 * 감싸는 상자의 선언을 본다. **허용 목록 밖은 전부 위반이다**(위 `WRAPPER_PROPERTIES`).
 *
 * 커스텀 프로퍼티는 따로 본다. `--wb-shell-*`는 두기로 한 예외이고(머리말 4번), 접두어 없는
 * 변수는 테마의 변수 이름과 겹칠 수 있어 막는다 — 앞 라운드의 `rg` 검사는 속성 이름 목록을
 * 훑는 형태라 `--*`를 아예 보지 못했다.
 */
function checkWrapperBody(body: string, selector: string, violations: Violation[]): void {
  for (const declaration of splitTop(body, ';')) {
    const colon = declaration.indexOf(':')
    if (colon === -1) continue

    const property = declaration.slice(0, colon).trim().toLowerCase()
    if (property === '') continue

    if (property.startsWith('--')) {
      if (!property.startsWith(`--${PREFIX}-`)) {
        violations.push({
          check: 'wrapper-variable',
          selector,
          message: `\`${property}\`는 문서 안까지 물려 내려간다 — 셸의 변수에는 \`--${PREFIX}-\` 접두어를 붙여라`,
        })
      }
      continue
    }

    if (!WRAPPER_PROPERTIES.has(property)) {
      violations.push({
        check: 'wrapper-property',
        selector,
        message: `\`${property}\`는 문서를 감싸는 상자의 허용 목록에 없다 — 상속되지 않는 속성임을 확인했다면 \`WRAPPER_PROPERTIES\`에 더해라`,
      })
    }
  }
}

/**
 * 결합자(자손·자식·형제)가 있는가. 대괄호·따옴표·괄호 안은 빼고 본다 — `[href^='a b']`의
 * 공백이나 `:not(a > b)`의 `>`를 결합자로 세면 안 된다.
 */
function hasCombinator(selector: string): boolean {
  return /[>+~]|\s/.test(stripParens(skeleton(selector)).trim())
}

/** 선택자의 첫 클래스 이름. 클래스로 시작하지 않으면 `null`이다. */
function baseClass(selector: string): string | null {
  const match = /^\.([A-Za-z0-9_-]+)/.exec(skeleton(selector).trim())
  return match?.[1] ?? null
}

/** 선택자에 나오는 클래스 이름 전부. */
function classNames(selector: string): string[] {
  return [...selector.matchAll(/\.([A-Za-z0-9_-]+)/g)].map((match) => match[1] ?? '')
}

function isShellName(name: string): boolean {
  return name === PREFIX || name.startsWith(`${PREFIX}-`)
}

/**
 * 대괄호와 따옴표 안을 지운 형태. 그 안의 문자는 결합자도 클래스도 아니다 —
 * `[data-x="a.b"]`의 `.b`를 클래스로 세면 안 된다.
 */
function skeleton(selector: string): string {
  let out = ''
  let quote: string | null = null
  let bracket = 0

  for (const char of selector) {
    if (quote !== null) {
      if (char === quote) quote = null
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (char === '[') {
      bracket += 1
      out += '['
      continue
    }
    if (char === ']') {
      bracket -= 1
      out += ']'
      continue
    }
    if (bracket > 0) continue
    out += char
  }

  return out
}

/** 괄호 안을 지운다. 결합자 검사가 `:not(a > b)` 안의 `>`를 세지 않게 한다. */
function stripParens(selector: string): string {
  let out = ''
  let depth = 0

  for (const char of selector) {
    if (char === '(') {
      depth += 1
      continue
    }
    if (char === ')') {
      depth -= 1
      continue
    }
    if (depth > 0) continue
    out += char
  }

  return out
}

/** 여러 줄에 걸친 선택자를 한 줄로 — 실패 메시지에 그대로 나오는 값이다. */
function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}
