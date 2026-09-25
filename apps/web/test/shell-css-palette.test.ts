/**
 * **팔레트가 실제로 닿는가.** `shell-css.test.ts`(누수) ·
 * `shell-css-coverage.test.ts`(규칙 없는 클래스)에 이어지는 셋째 검사다.
 *
 * **묻는 것이 둘이다.** ㉠ **화면 루트가 팔레트를 받는가**(1~4번) — 셸 밖 라우트가 팔레트
 * 선언을 못 받으면 그 화면의 `var()`가 전부 무효가 된다. ㉡ **쓰는 이름이 선언돼 있는가**
 * (5~7번) — 루트가 팔레트를 받아도 그 안에 그 이름이 없으면 같은 일이 난다.
 *
 * **한 파일에 두는 것은 두 질문이 같은 고장의 양끝이기 때문이다.** 둘 다 결과가
 * `var(--x)`의 **계산 시점 무효**이고, 둘 다 렌더는 되고 콘솔은 조용하다. 파일을 가르면
 * *"내 변수가 왜 안 먹지"*로 온 사람이 둘 중 어느 파일이 자기 것인지 먼저 골라야 하고,
 * 아래 "무엇이 조용히 깨지는가"를 두 벌 적게 된다. 그리고 ㉡은 ㉠의 사각을 막는 검사라
 * (아래) **그 사각과 그것을 막는 검사가 같은 자리에 있는 편이 읽힌다.**
 *
 * ## 무엇이 조용히 깨지는가
 *
 * `--wb-shell-*` 일곱은 `:root`가 아니라 **화면 루트 클래스들**에만 선언된다(`shell.css`의
 * 팔레트 블록). 셸 밖 라우트(`.wb-shell` 아래가 아닌 화면)가 그 목록에 없으면
 * `var(--wb-shell-accent)`가 **계산 시점에 무효**가 되고, `color`는 상속 속성이라 결과가
 * **검정**이다. 렌더는 되고 콘솔도 조용하고 테스트도 통과한다.
 *
 * **실측한 고장의 모양:** 팔레트 목록에 없는 셸 밖 화면에서 루트의 `--wb-shell-line`이
 * 빈 문자열이 되고, 강조색이어야 할 링크의 `color`가 `rgb(0,0,0)`이다(목록에 넣으면
 * `rgb(47,111,237)`).
 *
 * **CSS 주석의 *"새 화면 루트를 만드는 사람은 여기 한 줄을 더해라"*는 기계가 지키지
 * 않는다.** 이 파일이 그 자리다.
 *
 * ## 이 검사가 보지 못하는 것 — 먼저 읽어라
 *
 * **"화면 루트"를 기계가 알아내지 못한다.** 라우트 컴포넌트가 **바깥에서 두 번째로 반환하는
 * JSX**까지 봐야 하는데, 그 모양이 파일마다 다르다 — `routes/theme-editor.tsx`만 해도 루트가
 * **셋**이다(조회 중·실패의 `.wb-shell-notice` 둘, 본문의 `.wb-shell-theme`). "가장 바깥
 * `className`" 같은 어림짐작은 **지금의 실제 코드에서 이미 틀린다.** 틀린 판정 기준을 세워
 * 초록을 만드는 것보다, 잡을 수 있는 것만 잡고 못 잡는 것을 여기 적는 편이 낫다.
 *
 * **1~4번은 선택자만 본다 — 변수 이름은 안 본다.** 그래서 1~4번만으로는 사각이 있다:
 * 팔레트 블록에서 선언 한 줄(`--wb-shell-comment: #d92d20;`)을 통째로 지워도 **1~4번은
 * 그대로 초록이다.** 그 순간 `background: var(--wb-shell-comment)`가 계산 시점에 무효가
 * 되어 코멘트 배지가 **배경 없이** 그려지는데 1~4번 어디서도 울지 않는다. **5번이 그
 * 자리다** — 같은 변조에 5번이 운다(아래 구분력 표). 선택자를 빼는 쪽은 1번이 잡는다.
 *
 * 그래서 아래 **일곱**을 본다.
 *
 * 1. **CSS의 팔레트 선택자 집합 == 이 파일의 `SCREEN_ROOTS`.** 한쪽만 바뀌면 운다.
 *    새 루트를 CSS에 더하면 여기도 고쳐야 하고, 고치는 사람이 이 머리말을 읽게 된다.
 * 2. **팔레트를 안 받는 화면 루트는 `var(--wb-shell-…)`를 쓰지 않는다.** `.wb-shell-notice`가
 *    그런 자리다(자기 색을 리터럴로 갖는다). 그 근거가 깨지면 허용도 깨져야 한다.
 * 3. **팔레트 루트는 코드가 실제로 쓰는 클래스다.** CSS 쪽 이름이 오타면 그 규칙은 아무
 *    요소에도 안 걸리는데, 1번은 CSS와 목록만 대조하므로 **양쪽에 같은 오타가 들어가면
 *    통과한다.** 이 검사가 그 구멍을 막는다.
 * 4. **`routes/*.tsx`는 화면 루트를 하나 이상 쓴다.** 새 라우트 파일이 자기 클래스만 갖고
 *    들어오면 여기서 운다.
 * 5. **`var(…)`로 쓰는 이름이 전부 선언돼 있다.** 사용 → 선언 **한쪽 방향이다.**
 * 6. **대체값(`var(--x, #fff)`)을 쓰는 자리가 없다.** 지금 0건이고, 첫 하나가 생길 때
 *    사람이 이 머리말을 읽고 결정하게 하는 자리다.
 * 7. **선언하는 커스텀 프로퍼티가 전부 `--wb-shell-` 접두어를 갖는다.** 5번이 *"선언됐는가"*를
 *    본다면 이쪽은 *"그 이름이 셸의 것인가"*를 본다.
 *
 * **5번은 왜 한쪽 방향인가 — 선언했는데 안 쓰는 변수(죽은 변수)는 잡지 않는다.**
 * `shell-css-coverage.ts`가 같은 이유로 반대 방향(**규칙은 있는데 코드가 안 붙이는 클래스**)을
 * 뺐다: 개발 중간 상태마다 문다. 스타일을 먼저 적고 마크업을 나중에 붙이는 순서가 정상이고,
 * 변수도 같다 — 팔레트에 색을 먼저 세우고 쓸 자리를 채우는 동안 검사가 울면 **검사를 끄게
 * 된다.** 여기서만 양방향으로 가면 **두 검사의 태도가 갈리고**, 갈린 태도는 "이 저장소의
 * 검사는 어느 쪽을 무는가"를 매번 확인하게 만든다. 죽은 변수는 아무것도 그리지 않으므로
 * (`shell.css` 머리말 «상속되는 속성은 문서를 감싸는 상자에 걸지 않는다»의 «예외 — 커스텀 프로퍼티»가 같은 말을 한다) **조용히 틀리지 않는다** — 이 파일이 무는 것은
 * 조용히 틀리는 것뿐이다.
 *
 * **6번은 왜 금지가 아니라 0건 잠금인가.** `var(--x, #fff)`는 선언이 없어도 무효가 되지
 * 않으므로 **5번이 봐야 할 고장이 아니다**(그래서 5번은 대체값이 있으면 건너뛴다). 그렇다고
 * 값이 두 벌 사는 것이 공짜는 아니다 — 팔레트 주석이 *"값을 두 벌 적으면 한쪽만 고쳐지는
 * 자리가 된다"*라고 적고 있는 그것이다. 그래서 **막지 않고 세운다**: 첫 대체값이 들어올 때
 * 이 케이스가 울고, 쓰는 사람이 여기 근거를 적고 수를 고친다.
 *
 * **7번은 왜 누수 검사 파일(`shell-css.test.ts`)이 아니라 여기인가.** 규칙만 보면 그쪽이다 —
 * `shell.css` 머리말 «상속되는 속성은 문서를 감싸는 상자에 걸지 않는다»가
 * *"접두어 없는 변수는 그 넷에 선언할 수 없다 — 검사가 막는다"*라고 적고 있고, 그 검사가
 * `wrapper-variable`이다. **7번은 그 규칙을 감싸는 상자에서 파일 전체로 넓힌 것**이다.
 * 그래도 여기 둔 이유 둘:
 *
 * - **`shell-css.test.ts`의 케이스는 전부 `findViolations`의 산출을 재는 형태다**
 *   (`PLANTED` 표와 `ALLOWED` 표가 그 파일의 뼈대다). 7번은 `Violation`을 내지 않는다.
 * - **`findViolations`에 새 검사로 접으면 감싸는 상자에서 두 번 신고한다.** 거기서는
 *   `wrapper-variable`이 이미 물고 있고, 그쪽 메시지는 *"문서 안까지 물려 내려간다"*로
 *   **다른 손해**를 말한다(상속 누수). 7번이 말하는 손해는 *"셸이 테마의 어휘를 쓴다"*다 —
 *   테마가 `:root`에 싣는 이름과 셸의 이름은 교집합이 비어 있어야 한다.
 *   겹치지 않게 하려면 기존 규칙을 고쳐야 하고, 그러면 그 파일의 심기 표를 건드린다.
 *
 * **그래서 이름을 다루는 셋(5·6·7)이 한 자리에 모인다.** 실패 메시지에 선택자가 필요해지면
 * `findViolations`의 `CheckName`으로 올리는 길이 있다 — 그때 위의 두 번 신고를 함께 풀어라.
 *
 * **7번은 대소문자를 구분해서 본다.** `--WB-SHELL-x`는 `--wb-shell-x`와 **다른 프로퍼티**이므로
 * (`shell-css-guard.ts`의 대소문자 표) 접두어도 원문 그대로 본다. 참고로 `wrapper-variable`은
 * 속성 이름을 소문자로 내려 보므로 그 형태를 통과시킨다 — **7번이 그것까지 잡는다.**
 *
 * **5·6·7번이 못 보는 것**(`shell-css-guard.ts`의 두 함수 주석에 기계 쪽 몫이 더 있다):
 *
 * - **문자열 리터럴 안의 `var(`를 사용으로 센다.** `content: "var(--없는것)"`이 그 형태다.
 *   **거짓 양성이라 방향이 안전한 쪽이고**, `shell-css-coverage.ts`가 같은 부류(주석 안의
 *   `className`)를 문서화로 처리한 선례를 따랐다 — 근거와 검산 명령은 `variableUses`의
 *   주석에 있다. 지금 0건이다.
 * - **`shell.css` 밖.** 인라인 `style`과 `use-theme-css.ts`가 `document.head`에 붙이는
 *   시트는 대상이 아니다. 그쪽은 **테마의 어휘**이고 두 이름 집합의 교집합이 비어
 *   있다 — 셸의 변수를 쓰지 않으므로 여기서 볼 것이 없다.
 * - **선언의 값이 옳은지는 안 본다.** `--wb-shell-accent: ;`처럼 빈 값이어도 "선언됐다"다.
 *   같은 부류의 침묵이 **값 쪽에 남아 있다**.
 * - **7번은 선언만 본다.** 쓰는 쪽에 접두어 없는 이름이 나오면 5번이 *"선언 없음"*으로 잡고,
 *   선언까지 함께 있으면 7번이 잡는다 — **`shell.css` 안에서는 둘이 짝을 이뤄 새는 곳이
 *   없다.** 파일 밖은 위의 항목 그대로다.
 *
 * **4번은 필요조건이지 충분조건이 아니다.** 이미 루트를 쓰는 라우트 파일 **안에** 두 번째
 * 루트를 더하면(예: `theme-editor.tsx`가 `.wb-shell-archive`를 루트로 하는 화면을 하나 더
 * 그리게 되는 경우) 이 검사는 조용하다. 그 경우를 잡으려면 위의 "화면 루트 판정"이 필요하고,
 * 그것이 안 되는 이유가 위에 있다. **그 조용함은 `.wb-shell-theme`으로 다시 잰다:**
 *
 * - **CSS에서만 빼면** 1번이 운다(4번은 조용하다).
 * - **CSS와 아래 목록에서 함께 빼면 이 파일 전 케이스가 초록이다** — 그 순간 테마 저작 화면의
 *   `var(--wb-shell-*)`가 계산 시점에 무효가 되는데도 그렇다. `theme-editor.tsx`가 허용
 *   루트인 `wb-shell-notice`도 쓰기 때문에 4번이 만족되고, 1번은 양쪽이 같아 조용하다.
 *   **이것이 4번이 필요조건일 뿐이라는 것의 실측이다.**
 */
import { describe, expect, it } from 'vitest'
import shellCss from '../src/shell.css?raw'
import { declaredVariables, paletteRoots, variableUses } from './shell-css-guard'
import { shellClassesInSource } from './shell-css-coverage'

/** `apps/web/src/routes`의 라우트 파일들. `shell-css-coverage.test.ts`와 같은 기전이다. */
const ROUTE_SOURCES = Object.entries(
  import.meta.glob('../src/routes/*.tsx', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>,
)
  .map(([path, source]): [string, string] => [path.replace(/^\.\.\/src\//, ''), source])
  .sort(([a], [b]) => (a < b ? -1 : 1))

/**
 * **팔레트를 선언하는 화면 루트 넷.** `shell.css`의 팔레트 블록과 **정확히 같아야 한다.**
 *
 * | 클래스 | 화면 | 셸 안인가 |
 * |---|---|---|
 * | `wb-shell` | 에디터 셸(설계서 「설계서 화면 구조」) | 자기가 셸이다 |
 * | `wb-shell-theme` | 테마 저작 | 아니다 — 별도 라우트 |
 * | `wb-shell-project-list` | 프로젝트 목록 | 아니다 |
 * | `wb-shell-login` | 로그인 | 아니다 |
 *
 * **여기 더하기 전에 물어라: 그 화면이 정말 셸 밖인가.** 셸 안이라면 `.wb-shell`이 이미
 * 물려주므로 더할 필요가 없고, 더하면 같은 값을 두 번 선언하는 자리가 된다.
 *
 * **스냅샷 팝오버(`wb-shell-snapshots`)는 여기 없다** — 셸 머리에 뜨므로 위 물음의 답이
 * *"셸 안이다"*다(`src/shell/snapshots-panel.tsx` 머리말). 목록에 넣어도 빼도 화면은
 * 같다(팔레트를 상속으로 받는다). 이 검사가 지키는 것은 그러므로 *"화면이 검게 나오는가"*가
 * 아니라 **CSS와 이 목록이 갈리지 않는 것**이고, 아래 구분력 두 케이스가 그 양방향이다.
 */
const SCREEN_ROOTS = ['wb-shell', 'wb-shell-login', 'wb-shell-project-list', 'wb-shell-theme']

/**
 * **팔레트를 안 받는 화면 루트.** 여기 있으려면 조건이 하나다 — **자기 규칙이
 * `var(--wb-shell-…)`를 쓰지 않아야 한다.** 아래 케이스가 그것을 기계로 본다.
 *
 * `wb-shell-notice`가 유일하다. 셸에 이르지 못한 화면(조회 중·조회 실패)이고, 색을
 * `#1d2530` 리터럴로 갖는다. 라우트 **둘**이 이것을 쓴다(`theme-editor.tsx`·`editor.tsx`).
 * 스냅샷 팝오버는 셸이 이미 떠 있는 위의 작은 상자라 이 자리를 쓰지 않는다.
 */
const PALETTE_FREE_ROOTS = ['wb-shell-notice']

/** 규칙 하나의 본문. 없으면 `null`이다. 팔레트 없는 루트의 근거를 재는 데 쓴다. */
function ruleBody(css: string, className: string): string | null {
  const match = new RegExp(`\\.${className}\\s*\\{([^}]*)\\}`).exec(css)
  return match?.[1] ?? null
}

describe('팔레트가 실제로 닿는가', () => {
  it('검사가 진짜 shell.css와 진짜 라우트를 읽는다', () => {
    expect(shellCss).toContain('--wb-shell-accent')
    expect(ROUTE_SOURCES.length).toBeGreaterThan(3)
    expect(ROUTE_SOURCES.map(([file]) => file)).toContain('routes/login.tsx')

    // **5번이 헛돌지 않는지 여기서 잰다.** `variableUses`가 빈 배열을 내면 5번은 비교할
    // 것이 없어 **아무 일도 없이 초록**이 된다 — 정규식이 조용히 안 맞게 되는 순간 검사가
    // 사라지고 아무도 모른다. 그래서 "무언가를 봤다"를 따로 잠근다. 수를 못 박지 않는 것은
    // `var()` 자리가 스타일을 손볼 때마다 바뀌기 때문이다.
    expect(variableUses(shellCss).length).toBeGreaterThan(50)
    expect(declaredVariables(shellCss).has('--wb-shell-accent')).toBe(true)
  })

  it('CSS의 팔레트 선택자와 이 파일의 목록이 같다', () => {
    // **양방향이다.** CSS에 더하고 여기 안 더해도, 여기 더하고 CSS에 안 더해도 운다.
    expect([...paletteRoots(shellCss)].sort()).toEqual([...SCREEN_ROOTS].sort())
  })

  it('팔레트를 안 받는 루트는 `var(--wb-shell-…)`를 쓰지 않는다', () => {
    // 허용의 **근거**를 재는 케이스다. `.wb-shell-notice`에 `var(--wb-shell-muted)`를
    // 넣는 순간 그 화면의 글자가 조용히 검게 되므로, 그때 이 케이스가 먼저 운다.
    for (const root of PALETTE_FREE_ROOTS) {
      const body = ruleBody(shellCss, root)
      expect(body, `.${root} 규칙을 찾지 못했다`).not.toBeNull()
      expect(body ?? '').not.toContain('var(--wb-shell-')
    }
  })

  it('팔레트 루트는 코드가 실제로 쓰는 클래스다 — 오타면 아무 데도 안 걸린다', () => {
    const usedAnywhere = new Set(
      Object.values(
        import.meta.glob('../src/**/*.{ts,tsx}', {
          query: '?raw',
          import: 'default',
          eager: true,
        }) as Record<string, string>,
      ).flatMap((source) => shellClassesInSource(source)),
    )
    for (const root of SCREEN_ROOTS) expect([root, usedAnywhere.has(root)]).toEqual([root, true])
  })

  it('`var(…)`로 쓰는 이름이 전부 선언돼 있다', () => {
    const declared = declaredVariables(shellCss)
    // **대체값이 있는 자리는 뺀다** — 선언이 없어도 무효가 되지 않으므로 이 검사가 볼
    // 고장이 아니다(머리말 «대체값(`var(--x, #fff)`)을 쓰는 자리가 없다»). 그 자리 자체는 6번이 따로 센다.
    const missing = [
      ...new Set(
        variableUses(shellCss)
          .filter((use) => !use.hasFallback && !declared.has(use.name))
          .map((use) => use.name),
      ),
    ].sort()

    expect(
      missing,
      '이 이름들은 `var()`로 쓰이는데 `shell.css` 어디에도 선언이 없다 — 그리는 쪽이 계산 시점에 무효가 되어 조용히 사라진다',
    ).toEqual([])
  })

  it('대체값을 쓰는 `var(--x, …)`는 아직 없다', () => {
    const withFallback = [...new Set(variableUses(shellCss).filter((use) => use.hasFallback).map((use) => use.name))]

    expect(
      withFallback,
      '대체값을 쓰기로 했다면 금지가 아니다 — 다만 값이 팔레트와 여기 두 벌 살게 되므로, 머리말 «대체값(`var(--x, #fff)`)을 쓰는 자리가 없다»에 근거를 적고 이 케이스를 고쳐라',
    ).toEqual([])
  })

  it('선언하는 커스텀 프로퍼티는 전부 `--wb-shell-` 접두어를 갖는다', () => {
    // **대소문자를 구분해 본다** — `--WB-SHELL-x`는 다른 프로퍼티다(머리말).
    const stray = [...declaredVariables(shellCss)].filter((name) => !name.startsWith('--wb-shell-')).sort()

    expect(
      stray,
      '이 이름들은 `--wb-shell-` 접두어가 없다 — 셸이 읽는 커스텀 프로퍼티가 전부 그 접두어라는 것이 «테마가 `:root`에 싣는 이름과 교집합이 비어 있다»를 떠받친다',
    ).toEqual([])
  })

  describe('라우트 파일은 화면 루트를 하나 이상 쓴다', () => {
    const known = new Set([...SCREEN_ROOTS, ...PALETTE_FREE_ROOTS])

    it.each(ROUTE_SOURCES)('%s', (file, source) => {
      const classes = shellClassesInSource(source)
      // `wb-shell-` 클래스를 하나도 안 쓰는 라우트는 화면을 그리지 않는 것이다
      // (`require-auth.tsx`가 그렇다 — 자식으로 위임한다).
      if (classes.length === 0) return

      const roots = classes.filter((name) => known.has(name))
      expect([file, roots.length > 0]).toEqual([file, true])
    })
  })

  describe('구분력 — 목록이 갈리면 운다', () => {
    it('CSS에서 팔레트 선택자를 빼면 목록 대조가 실패한다', () => {
      // 앵커는 팔레트 선택자 목록의 한 줄이다 — 그 줄의 글자가 바뀌면 아래 `not.toBe`가 먼저 운다.
      const without = shellCss.replace('.wb-shell-project-list,\n', '')
      expect(without).not.toBe(shellCss)
      expect([...paletteRoots(without)].sort()).not.toEqual([...SCREEN_ROOTS].sort())
    })

    it('CSS에 팔레트 선택자를 더해도 목록 대조가 실패한다', () => {
      const withExtra = shellCss.replace('.wb-shell-login {', '.wb-shell-login,\n.wb-shell-archive {')
      expect(withExtra).not.toBe(shellCss)
      expect([...paletteRoots(withExtra)].sort()).not.toEqual([...SCREEN_ROOTS].sort())
    })

    it('팔레트 없는 루트가 `var()`를 쓰기 시작하면 잡는다', () => {
      const broken = shellCss.replace(
        /(\.wb-shell-notice \{[^}]*?)color: #1d2530;/,
        '$1color: var(--wb-shell-ink);',
      )
      expect(broken).not.toBe(shellCss)
      expect(ruleBody(broken, 'wb-shell-notice') ?? '').toContain('var(--wb-shell-')
    })

    it('자기 클래스만 갖는 새 라우트는 잡힌다', () => {
      const known = new Set([...SCREEN_ROOTS, ...PALETTE_FREE_ROOTS])
      const planted = `export function ArchiveRoute() {
        return <main className="wb-shell-archive"><h1 className="wb-shell-archive-title">보관함</h1></main>
      }`
      const roots = shellClassesInSource(planted).filter((name) => known.has(name))
      expect(roots).toEqual([])
    })
  })

  /**
   * **5·6번의 구분력.** 위 describe 와 가르는 것은 재는 대상이 다르기 때문이다 — 저쪽은
   * *"목록 둘이 갈리면 우는가"*, 이쪽은 *"이름이 갈리면 우는가"*다.
   *
   * 셋 다 `shellCss` 원문을 메모리에서 변조한다. **파일을 건드리지 않는 것이 요점이다** —
   * 실제 파일을 고쳤다 되돌리는 검사는 실패했을 때 작업 트리를 오염시킨 채 끝난다.
   */
  describe('구분력 — 이름이 갈리면 운다', () => {
    /** 5번이 실제로 재는 계산. 케이스 본문과 같은 식이어야 의미가 있다. */
    function missingNames(css: string): string[] {
      const declared = declaredVariables(css)
      return [
        ...new Set(
          variableUses(css)
            .filter((use) => !use.hasFallback && !declared.has(use.name))
            .map((use) => use.name),
        ),
      ].sort()
    }

    it('팔레트에서 선언 한 줄을 지우면 잡는다 — 이 검사가 생긴 이유다', () => {
      // 이 변조는 **1~4번을 전부 통과한다**(머리말). 그것이 5번의 자리다.
      const without = shellCss.replace('  --wb-shell-comment: #d92d20;\n', '')
      expect(without, '심을 자리가 사라졌다 — 팔레트 선언의 글자가 바뀌었으면 이 문자열을 고쳐라').not.toBe(shellCss)
      expect(missingNames(shellCss)).toEqual([])
      expect(missingNames(without)).toEqual(['--wb-shell-comment'])
    })

    it('쓰는 쪽 이름에 오타가 나면 잡는다', () => {
      const typo = shellCss.replace('var(--wb-shell-comment)', 'var(--wb-shell-coment)')
      expect(typo, '심을 자리가 사라졌다 — `var(--wb-shell-comment)`를 쓰는 곳이 없어졌으면 다른 이름으로 바꿔라').not.toBe(shellCss)
      expect(missingNames(typo)).toEqual(['--wb-shell-coment'])
    })

    it('함수 이름이 대문자여도 잡는다 — `VAR(`도 유효한 참조다', () => {
      // 정규식에 `i`가 없으면 이 변조가 5번을 그대로 통과한다. 대소문자 근거는
      // `shell-css-guard.ts`의 표에 있다.
      const upper = shellCss.replace('var(--wb-shell-comment)', 'VAR(--wb-shell-nowhere)')
      expect(upper, '심을 자리가 사라졌다 — 아래 케이스들과 같은 자리를 쓴다').not.toBe(shellCss)
      expect(missingNames(upper)).toEqual(['--wb-shell-nowhere'])
    })

    it('대소문자 섞인 이름은 거짓 양성을 내지 않는다 — 유효한 CSS다', () => {
      // `--Foo`와 `--foo`는 **다른 프로퍼티**이므로, 섞인 이름을 선언하고 그대로 쓰는 것은
      // 유효하다. `declaredVariables`만 소문자로 내리면 이것이 운다.
      const mixed = shellCss
        .replace('  --wb-shell-comment: #d92d20;', '  --wb-shell-comment: #d92d20;\n  --wb-shell-Accent2: #2f6fed;')
        .replace('var(--wb-shell-comment)', 'var(--wb-shell-Accent2)')
      expect(mixed, '심을 자리가 사라졌다').not.toBe(shellCss)
      expect(declaredVariables(mixed).has('--wb-shell-Accent2')).toBe(true)
      expect(missingNames(mixed)).toEqual([])
    })

    it('접두어 없는 변수를 감싸는 상자 밖에 선언하면 7번이 잡는다', () => {
      // `wrapper-variable`은 `WRAPPERS`만 보므로 이 자리를 안 문다(머리말).
      const stray = shellCss.replace(
        '.wb-shell-comment-marker {',
        '.wb-shell-comment-marker {\n  --brand: red;',
      )
      expect(stray, '심을 자리가 사라졌다 — `.wb-shell-comment-marker` 규칙이 없어졌으면 다른 규칙으로 바꿔라').not.toBe(shellCss)
      expect([...declaredVariables(shellCss)].filter((n) => !n.startsWith('--wb-shell-'))).toEqual([])
      expect([...declaredVariables(stray)].filter((n) => !n.startsWith('--wb-shell-'))).toEqual(['--brand'])
    })

    it('선언이 없어도 대체값이 있으면 5번은 넘어간다 — 6번이 대신 센다', () => {
      // 허용의 **근거**를 재는 케이스다(머리말 «대체값(`var(--x, #fff)`)을 쓰는 자리가 없다»). 대체값을 5번이 물기 시작하면 여기서
      // 먼저 갈린다.
      const fallback = shellCss.replace('var(--wb-shell-comment)', 'var(--wb-shell-nowhere, #d92d20)')
      expect(fallback, '심을 자리가 사라졌다 — 위 케이스와 같은 자리를 쓴다').not.toBe(shellCss)
      expect(missingNames(fallback)).toEqual([])
      expect(variableUses(fallback).filter((use) => use.hasFallback).map((use) => use.name)).toEqual([
        '--wb-shell-nowhere',
      ])
    })
  })
})
