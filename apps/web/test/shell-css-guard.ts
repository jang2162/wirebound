/**
 * `shell.css`가 셸 CSS 격리 규칙(셸 규칙이 캔버스 안의 문서 노드로 새지 않는다)을 지키는지
 * 보는 검사. 규칙의 뜻과 근거는 `shell.css` 머리말에 있고,
 * 여기 있는 것은 **그 규칙을 기계가 보는 형태**다.
 *
 * **왜 rg 명령이 아니라 파서인가.** `shell.css` 주석에 `rg` 명령을 적어 두고 사람이 돌리게
 * 하면, `shell-css.test.ts` 심기 표의 위반 열넷이 **다 빠져나간다** — 정규식이 속성 이름
 * 목록을 훑는 형태라 목록에 없는 상속 속성(`font-weight`·`list-style`·`pointer-events`…)을
 * 못 보고, `{` 앞의 공백 하나에 매여 `.a{ color: red }`도 못 본다. 그래서 두 가지가 다르다.
 *
 * 1. **포맷을 보지 않는다.** 주석을 걷고 중괄호를 세어 규칙으로 가르므로 줄바꿈·공백·
 *    콤마 나열이 결과를 바꾸지 않는다.
 * 2. **허용 목록이다.** 문서를 감싸는 상자에는 *열거한 것만* 걸 수 있다. 금지
 *    목록이면 내가 열거하지 못한 상속 속성이 그대로 새지만, 허용 목록이면 열거하지 않은
 *    속성은 상속되든 아니든 일단 걸린다.
 *
 * **이 검사가 보지 못하는 것**(고의로 열어 둔 것이 아니라, 못 보는 것):
 *
 * - `shell.css` **밖의** 스타일. `.tsx`의 인라인 `style`, `<style>` 태그, 다른 CSS 파일은
 *   읽지 않는다. `apps/web/src`의 CSS 파일은 `shell.css` 하나이고 JSX `<style>` 태그는
 *   없다(검산: `rg --files apps/web/src -g '*.css'` — **`rg -l '\.css$'`로 쓰지 마라.**
 *   그것은 파일 이름이 아니라 **내용**에서 `.css`로 끝나는 줄을 찾는다).
 *
 *   **인라인 `style`은 한 부류뿐이고 상속되지 않는 속성만 건다** — **자리·크기를 코드가 계산하는 것**: 캔버스 프레임의
 *   폭·줌(`routes/editor.tsx`), 선택 아웃라인의 자리(`canvas/canvas.tsx`), 캔버스 iframe 의 크기(`canvas/canvas-iframe.tsx`),
 *   팝오버의 자리.
 *
 *   **수를 적지 않는 것이 의도다** — 자리 수는 파일이 하나 늘 때마다 낡고, 그렇게 낡은
 *   주석은 아무것도 실패시키지 않은 채 거짓이 된다. **부류가 늘 때만 이 주석을 고친다.**
 *   새 인라인이 그 부류에 안 들어가면 그때는 정말로 검토가 필요한 것이다.
 *   지금 자리를 세려면: `grep -rn 'style={' apps/web/src`.
 *
 *   어느 쪽이든 **검사가 보고 있어서 안전한 것이 아니다.**
 *
 *   **다른 부류가 있다:** 캔버스 iframe(`canvas/canvas-iframe.tsx`)이 그 문서의 head 에 시트 셋을 붙인다
 *   (`canvas/canvas.tsx`의 `canvasSheets` — SDK 기본 뷰 · 테마 `theme.css` 링크 · 토큰). 그 시트는 **문서 노드를 겨냥하는 것이 일**이므로
 *   격리 규칙이 금지하는 대상이 아니다 — 그 규칙이 가른 선은 *"셸이 문서를 스타일하지 않는다"*이고, 저 시트의 내용은 셸이 아니라
 *   SDK 기본 뷰 CSS · 테마 CSS · 토큰 변수다. 다만 **이 검사는 그 시트를 읽지 않는다**는 사실은 위와 같다.
 * - `WRAPPERS`에 없는 상자. 문서를 감싸는 상자가 새로 생기면 **사람이 여기 더해야** 한다.
 *   그 목록은 `canvas/canvas.tsx`·`routes/editor.tsx`가 무엇을 감싸는지에 매여 있고,
 *   검사가 스스로 알아낼 방법이 없다.
 * - 주석 걷기를 속이는 형태. 주석 여는 기호가 CSS 문자열 안에 들어 있으면 파서가 거기서
 *   부터 잘못 읽는다. **지금 파일의 CSS 문자열에는 중괄호도 주석 기호도 없다** — 문자열
 *   자체는 10줄에 있다(`grid-template-areas`의 두 줄, `'Segoe UI'` 다섯 줄, 속성 선택자
 *   세 줄). 즉 지금 파서를 속이는 것이 없을 뿐, 문자열을 다루지 않아도 되는 것은 아니다.
 *   흔한 형태(`content: "{"`)에서는 `unreadable`을 내고 **거기서 스캔을 멈춘다** — 조용히
 *   지나가지는 않지만 그 뒤의 위반은 보고되지 않는다.
 * - **CSS 중첩. 실질적인 사각이다.** 비-wrapper 규칙 안의 중첩은 완전히 보이지 않는다
 *   (실측: `.wb-shell-header { .planted { color: blue } }`·`{ & div { … } }`·
 *   `{ @media (…) { … } }` 전부 **0건**). 감싸는 상자 넷 안의 중첩은 `checkWrapperBody`가
 *   선언 파서로 훑다가 우연히 걸리지만 메시지가 틀린 말을 한다. 그리고
 *   `.wb-shell-header { & ~ .wb-shell-canvas * { font-family: serif } }`처럼 중첩 안에서
 *   결합자로 문서까지 뻗으면 **진짜 격리 위반이 검사를 통과한다**(실측 0건). CSS 중첩은
 *   지금 브라우저에 다 있으므로 `shell.css`에 중첩을 쓰기 전에 이 사각을 먼저 닫아야 한다.
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
 * 검산 — 문서 노드가 **바로 그 안에** 들어오는 상자(캔버스)를 소스에서 찾는다:
 * `rg -n 'wb-shell-canvas-surface' apps/web/src`
 * (검산 명령에 `*` 뒤 `/`를 쓰지 마라 — 이 주석이 거기서 끝나 `esbuild`가 이 파일을 통째로
 * 못 읽는다.)
 *
 * 1. `wb-shell` — 에디터 셸의 루트(`shell.css` 머리말 «상속되는 속성은 문서를 감싸는 상자에 걸지 않는다»의 사슬 첫 칸)
 * 2. `wb-shell-canvas` — 그 사슬 둘째
 * 3. `wb-shell-canvas-stage` — 셋째. 보이는 폭(프리셋 × 줌)의 무대(`routes/editor.tsx`의 `CanvasFrame`)
 * 4. `wb-shell-canvas-frame` — 넷째
 * 5. `wb-shell-canvas-surface` — 다섯째. 여기 안에 페이지 문서가 들어온다
 * 6. `wb-shell-settings-preview` — 설정 페이지의 갤러리 미리보기(`settings/theme-preview.tsx`). 문서(갤러리)가 iframe 째 들어온다
 *
 * > **문서를 감싸는 상자를 만드는 사람이 여기 한 줄을 더하는 것이 이 목록의 유일한 갱신
 * > 방법이다** — 목록에 없는 상자에 상속 속성을 걸면 **아무 케이스도 안 죽고**, 목록에 있으면
 * > 여러 케이스가 죽는다(4번 상자에 상속 속성을 심고 목록에서 넣었다 뺐다 하며 다시 잰다).
 * > 즉 여기 더하지 않으면 격리 위반이 조용히 지나간다.
 */
const WRAPPERS = new Set([
  'wb-shell',
  'wb-shell-canvas',
  'wb-shell-canvas-stage',
  'wb-shell-canvas-frame',
  'wb-shell-canvas-surface',
  'wb-shell-settings-preview',
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

/** 셸의 클래스·변수 접두어. 테마가 쓰는 이름과 겹칠 수 없다는 것이 `shell.css` 머리말의 «모든 클래스에 `wb-shell-` 접두어를 붙인다» 규칙이다. */
const PREFIX = 'wb-shell'

interface Rule {
  prelude: string
  body: string
}

/** `shell.css` 전문에서 격리 위반을 찾는다. 빈 배열이면 위반이 없다. */
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
 * 가르기를 두 벌 두면 한쪽만 고쳐지는 자리가 생기고, 그러면 누수 검사와 커버리지 검사가
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
 *   아니라 배제되는 것이다. 지금 이 파일에 함수형 의사 클래스는 없다 — `checkSelector`가
 *   막는다.
 * - **복합 선택자 `.a.b`의 두 이름을 낱개로 센다.** 그 규칙은 둘이 **함께** 붙은 요소에만
 *   걸리는데, 여기서는 `a`도 `b`도 각각 "규칙 있음"이 된다. 그래서 `.a.b` 규칙만 있고
 *   `a`만 붙이는 자리가 있으면 그 자리는 무스타일인데 커버리지 검사가 통과한다.
 *   **지금 `shell.css`에 다중 클래스 선택자는 0개다**(검산:
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
 * 커버리지 검사가 잡는 침묵(규칙 없는 클래스가 조용히 무스타일이 된다)과 같은 부류라 기계가
 * 보게 한다.
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

/**
 * **커스텀 프로퍼티의 대소문자 규칙 — 두 자리가 정반대다.** 아래 두 함수가 이 문단을
 * 가리키므로 여기 한 벌만 적는다.
 *
 * | | 규칙 | 명세 |
 * |---|---|---|
 * | 함수 이름 `var(` | **대소문자를 무시한다** — `VAR(`도 유효한 참조다 | `<function-token>`은 ident로 시작하고, CSS의 키워드·함수 이름 매칭은 ASCII 대소문자를 무시한다 (css-syntax-3 §4 · css-values-4 §1) |
 * | 변수 이름 `--Foo` | **대소문자를 구분한다** — `--Foo`와 `--foo`는 **다른 프로퍼티**다 | 커스텀 프로퍼티 이름은 `<dashed-ident>`이고 대소문자를 구분한다 (css-variables-1 §2). **일반 속성 이름이 대소문자를 무시하는 것과 갈리는 자리다** |
 *
 * **인용만 하지 않고 Chrome 151에서 직접 쟀다:**
 *
 * ```
 * #a { --wb-x: rgb(1,2,3); background: VAR(--wb-x) }  → rgb(1, 2, 3)      함수명 대문자, 동작한다
 * #b { --wb-x: rgb(1,2,3); background: vAr(--wb-x) }  → rgb(1, 2, 3)      섞여도 동작한다
 * #c { --wb-x: rgb(1,2,3); background: var(--WB-X) }  → rgba(0,0,0,0)     이름 대문자, 무효다
 * #d { --Foo: rgb(9,9,9); --foo: rgb(4,5,6); var(--foo) } → rgb(4, 5, 6)  둘이 공존한다
 * #e { --Foo: rgb(9,9,9); var(--Foo) }  → rgb(9, 9, 9)                    구분해서 읽는다
 * #f { --Foo: rgb(9,9,9); var(--foo) }  → rgba(0,0,0,0)                   소문자로는 못 읽는다
 * #g { BACKGROUND-COLOR: rgb(7,7,7) }   → rgb(7, 7, 7)                    일반 속성은 무시한다
 * ```
 *
 * **이 둘을 뒤집으면 두 갈래로 샌다.** 정규식에 `i`가 없으면 `VAR(--없는이름)`이 검사를
 * 통째로 빠져나가고(`shell-css-palette.test.ts`의 «함수 이름이 대문자여도 잡는다»가 잠근다),
 * `declaredVariables`만 `toLowerCase`를 걸면 대소문자 섞인 **유효한** 이름이 거짓 양성으로 운다. 한쪽만 정규화하는 **비대칭**이 둘째
 * 증상의 원인이다 — 그래서 **양쪽 다 이름을 원문 그대로 다룬다.**
 */

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
 *   **판정은 `shell-css-palette.test.ts`의 7번이 한다**(이 함수의 결과를 그대로 쓴다).
 *
 * **이름을 소문자로 내리지 않는다** — 커스텀 프로퍼티 이름은 대소문자를 구분한다(위 표).
 * `paletteRoots`는 `toLowerCase`를 걸지만 **그쪽은 무해하고 여기는 아니다**: 그쪽은 `startsWith('--wb-shell-')`만 보므로 소문자화가 판정을 안 바꾸지만,
 * 여기서는 이름 자체가 결과라 `--Foo`가 `--foo`로 바뀌어 나간다. 그러면 `variableUses`가
 * 담는 원문과 짝이 안 맞아 **유효한 CSS가 거짓 양성으로 운다**(실측: `--wb-shell-Accent2`를
 * 선언하고 그대로 쓴 실물 변조에서 *"어디에도 선언이 없다"*가 났다).
 */
export function declaredVariables(css: string): Set<string> {
  const rules: Rule[] = []
  scanRules(stripComments(css), rules, [])

  const names = new Set<string>()
  for (const rule of rules) {
    for (const declaration of splitTop(rule.body, ';')) {
      const colon = declaration.indexOf(':')
      if (colon === -1) continue
      // 소문자로 내리지 않는다(위 머리말). `--`에는 대소문자가 없으므로 커스텀
      // 프로퍼티인지 가르는 데는 원문 그대로로 충분하다.
      const property = declaration.slice(0, colon).trim()
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
 * **`i` 플래그가 붙어 있다** — `VAR(`·`vAr(`도 유효한 참조이기 때문이다(위 대소문자 표).
 * **이것이 없으면 대문자 하나로 검사가 통째로 열린다**(`VAR(--wb-shell-nowhere)`를 실물에
 * 심는 `shell-css-palette.test.ts`의 «함수 이름이 대문자여도 잡는다»가 그 자리다). 이름 쪽은 `[^,)\s]*`·`[,)]?`라 대소문자가 없으므로
 * 플래그를 전체에 걸어도 **함수 이름에만 듣는다** — 이름은 여전히 원문 그대로 담긴다.
 *
 * **못 보는 것 둘:**
 *
 * - **`shell.css` 밖.** 캔버스 iframe 이 그 문서의 head 에 붙이는 시트와
 *   `.tsx`의 인라인 `style`은 읽지 않는다(머리말의 같은 항목). 그쪽은 **테마의 어휘**라
 *   `--wb-shell-*`를 쓰지도 않는다(두 이름 집합의 교집합이 비어 있다).
 * - **문자열 리터럴 안의 `var(`도 사용으로 센다.** `content: "var(--없는것)"`이 그 형태다 —
 *   `stripComments`는 주석만 걷고 문자열은 안 걷는다. **거짓 양성이라 방향이 안전한 쪽이고,
 *   `shell-css-coverage.ts`가 같은 부류(주석 안의 `className`)를 문서화로 처리한 선례를
 *   따른다**: 없는 사용을 더 세는 것이므로 *"선언이 있는데 없다"*고 말하지는 않는다. 반대로
 *   **문자열에 예시로 적은 이름의 선언이 없으면 검사가 운다.** 지금 그런 자리는 0건이다
 *   (검산: `grep -nE '"[^"]*var\(|'"'"'[^'"'"']*var\(' apps/web/src/shell.css`).
 *   **고치려면 문자열 걷기가 필요한데 그것은 `stripComments`를 셋째 정규화로 갈라 놓는다** —
 *   누수 검사 파서와 공유하는 걷기가 두 벌이 되는 값이 0건짜리 거짓 양성보다 크다.
 */
export function variableUses(css: string): VariableUse[] {
  const uses: VariableUse[] = []
  // 이름 뒤에 오는 것은 `,`(대체값 있음) 아니면 `)`(없음)뿐이다. 둘 다 아니면 깨진
  // 형태이므로 대체값 없음으로 두어 아래 검사에서 걸리게 한다.
  const pattern = /var\(\s*([^,)\s]*)\s*([,)]?)/gi

  for (const match of stripComments(css).matchAll(pattern)) {
    // `?? ''`는 `noUncheckedIndexedAccess` 때문이다 — 두 그룹 다 `*`·`?`라 항상 참여하므로
    // 실행 시점에 `undefined`가 될 수 없지만, 타입은 그것을 모른다.
    uses.push({ name: match[1] ?? '', hasFallback: match[2] === ',' })
  }
  return uses
}

/**
 * **클래스 하나에 곧바로 걸리는 선언들** — `.wb-shell-x { … }` 꼴 규칙의 본문이다.
 * `shell-css-picker.test.ts`가 이것을 쓴다: *"이 상자가 감싸도록 선언돼 있는가"*를 물으려면
 * 규칙 **본문**을 봐야 하는데, 위의 셋(`ruledClasses`·`paletteRoots`·`declaredVariables`)은
 * 이름만 낸다.
 *
 * **`.x` 하나뿐인 선택자만 센다.** `.x:disabled`·`.x[aria-pressed]`·`.x.y`는 **조건이 붙은
 * 규칙**이라 "이 클래스를 붙이면 늘 걸리는 값"이 아니다 — 섞어 담으면 부르는 쪽이
 * *"선언돼 있다"*를 잘못 읽는다. `shell.css`에 다중 클래스 선택자는 0개다(`ruledClasses`의
 * 머리말이 그 검산을 갖는다).
 *
 * **같은 클래스에 규칙이 여럿이면 뒤엣것이 이긴다.** 특이도가 같으므로 캐스케이드가
 * 그렇게 정한다. 원문 순서를 그대로 따라가면 되는 자리다.
 *
 * **속성 이름은 소문자로 내리고 값은 그대로 둔다.** 일반 속성 이름은 ASCII 대소문자를
 * 무시하지만(위 대소문자 표의 `#g`) 값은 그렇지 않은 것이 섞여 있다(`content`의 문자열,
 * `url()`). 키워드를 대조하는 쪽이 필요하면 **부르는 쪽에서** 접어라.
 *
 * **커스텀 프로퍼티(`--*`)는 빼지 않는다** — 이름만 소문자로 내려가면 `--Foo`와 `--foo`가
 * 접혀 **다른 프로퍼티 둘이 하나가 된다**(위 표의 `#d`). 그래서 `--`로 시작하는 이름은
 * 원문 그대로 담는다. 커스텀 프로퍼티를 세는 것이 일이면 `declaredVariables`가 그 자리다.
 *
 * **못 보는 것**(파서는 위의 셋과 같으므로 그쪽 목록이 그대로 걸린다):
 *
 * - **단축 속성을 펼치지 않는다.** `flex: 1 0 100%`는 `flex` 하나로 담기고 `flex-basis`로는
 *   안 보인다. 펼치려면 속성마다 문법을 아는 표가 필요한데, 그 표가 낡는 쪽이 더 나쁘다 —
 *   **부르는 쪽이 자기가 보는 속성의 단축형을 알고 함께 물어야 한다.**
 *
 *   **그 규칙을 안 지키면 이렇게 샌다.** 부르는 쪽이 `flex-wrap`만 묻고 `flex-flow`를 안
 *   물으면, 뜻이 같은 `flex-flow: row wrap`으로 바꾸는 것만으로 **케이스가 거짓으로 운다.**
 *   없는 위반을 부르는 쪽이라 방향은 안전하지만 정확하지는 않다 — `shell-css-picker.test.ts`가
 *   `flex-flow`도 함께 보는 까닭이다. 이 함수를 새로 쓰는 사람은 자기가 보는 속성의 단축형
 *   목록을 **먼저** 적어라. 지금 걸리는 짝:
 *   `flex-basis`↔`flex`, `flex-wrap`·`flex-direction`↔`flex-flow`, `row-gap`·`column-gap`↔`gap`.
 * - `@media` 안의 규칙도 **같은 이름으로 담긴다.** 조건이 붙은 값인데 그것이 안 보인다.
 *   지금 `shell.css`에 `@media`는 0건이다(검산: `grep -n '@media' apps/web/src/shell.css`).
 *   첫 하나가 생기면 이 항목을 다시 읽어라 — 조건 밖의 값과 안의 값이 한 칸에 겹쳐 담긴다.
 */
export function classDeclarations(css: string): Map<string, Map<string, string>> {
  const rules: Rule[] = []
  scanRules(stripComments(css), rules, [])

  const byClass = new Map<string, Map<string, string>>()
  for (const rule of rules) {
    for (const selector of splitTop(rule.prelude, ',')) {
      // `.x` 하나뿐인 형태만. 의사 클래스·속성 선택자·결합자가 붙으면 여기서 걸러진다.
      const match = /^\.([A-Za-z0-9_-]+)$/.exec(skeleton(selector).trim())
      if (match === null) continue
      const name = match[1] ?? ''

      let declarations = byClass.get(name)
      if (declarations === undefined) {
        declarations = new Map<string, string>()
        byClass.set(name, declarations)
      }

      for (const declaration of splitTop(rule.body, ';')) {
        const colon = declaration.indexOf(':')
        if (colon === -1) continue
        const raw = declaration.slice(0, colon).trim()
        if (raw === '') continue
        // 커스텀 프로퍼티는 대소문자를 구분한다 — 위 표의 `#d`.
        const property = raw.startsWith('--') ? raw : raw.toLowerCase()
        declarations.set(property, normalize(declaration.slice(colon + 1)))
      }
    }
  }
  return byClass
}

/** 주석을 걷는다. 주석 안의 선택자·속성이 검사에 걸리면 안 된다(머리말이 그 예를 든다). */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, ' ')
}

/**
 * 중괄호를 세어 규칙으로 가른다. **선택자와 `{` 사이의 공백을 보지 않는다** — `rg` 정규식으로
 * 재면 정확히 그 공백 하나에 매인다(머리말).
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
 * 이 한 문장이 `shell.css` 머리말의 «요소 선택자를 쓰지 않는다» · «자손 선택자를 쓰지 않는다»를 함께 막는다. 요소 선택자(`div`)·전체 선택자(`*`)·속성 선택자
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
 * 커스텀 프로퍼티는 따로 본다. `--wb-shell-*`는 두기로 한 예외이고(`shell.css` 머리말 «상속되는 속성은 문서를 감싸는 상자에 걸지 않는다»의 «예외 — 커스텀 프로퍼티»), 접두어 없는
 * 변수는 테마의 변수 이름과 겹칠 수 있어 막는다 — 속성 이름 목록을 훑는 `rg` 정규식은
 * `--*`를 아예 보지 못한다.
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
