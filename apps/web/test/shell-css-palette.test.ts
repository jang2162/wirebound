/**
 * **팔레트가 실제로 닿는가.** `shell-css.test.ts`(D7 누수) ·
 * `shell-css-coverage.test.ts`(규칙 없는 클래스)에 이어지는 셋째 검사다.
 *
 * **묻는 것이 둘이다.** ㉠ **화면 루트가 팔레트를 받는가**(1~4번) — 셸 밖 라우트가 팔레트
 * 선언을 못 받으면 그 화면의 `var()`가 전부 무효가 된다. ㉡ **쓰는 이름이 선언돼 있는가**
 * (5~6번) — 루트가 팔레트를 받아도 그 안에 그 이름이 없으면 같은 일이 난다.
 *
 * **한 파일에 두는 것은 두 질문이 같은 고장의 양끝이기 때문이다.** 둘 다 결과가
 * `var(--x)`의 **계산 시점 무효**이고, 둘 다 렌더는 되고 콘솔은 조용하다. 파일을 가르면
 * *"내 변수가 왜 안 먹지"*로 온 사람이 둘 중 어느 파일이 자기 것인지 먼저 골라야 하고,
 * 아래 "무엇이 조용히 깨지는가"를 두 벌 적게 된다. 그리고 ㉡을 만든 계기가 ㉠의 사각이라
 * (아래) **그 사각과 그것을 막은 검사가 같은 자리에 있는 편이 읽힌다.**
 *
 * ## 무엇이 조용히 깨지는가
 *
 * `--wb-shell-*` 일곱은 `:root`가 아니라 **화면 루트 클래스들**에만 선언된다(`shell.css`의
 * 팔레트 블록). 셸 밖 라우트(`.wb-shell` 아래가 아닌 화면)가 그 목록에 없으면
 * `var(--wb-shell-accent)`가 **계산 시점에 무효**가 되고, `color`는 상속 속성이라 결과가
 * **검정**이다. 렌더는 되고 콘솔도 조용하고 테스트도 통과한다.
 *
 * **실제로 그렇게 깨져 있었다.** 이 브랜치 이전 스냅샷 화면 실측:
 * 루트의 `--wb-shell-line`이 빈 문자열, `.wb-shell-snapshots-back`의 `color`가 `rgb(0,0,0)`
 * (강조색이어야 했다). 고친 뒤 `rgb(47,111,237)`이다.
 *
 * **CSS 주석이 "새 화면 루트를 만드는 사람은 여기 한 줄을 더해라"라고 적고 있었지만 기계가
 * 지키지 않았다.** 이 파일이 그 자리다.
 *
 * ## 이 검사가 보지 못하는 것 — 먼저 읽어라
 *
 * **"화면 루트"를 기계가 알아내지 못한다.** 라우트 컴포넌트가 **바깥에서 두 번째로 반환하는
 * JSX**까지 봐야 하는데, 그 모양이 파일마다 다르다 — `routes/snapshots.tsx`만 해도 루트가
 * **셋**이다(조회 중·실패의 `.wb-shell-notice` 둘, 본문의 `.wb-shell-snapshots`). "가장 바깥
 * `className`" 같은 어림짐작은 **오늘의 실제 코드에서 이미 틀린다.** 틀린 판정 기준을 세워
 * 초록을 만드는 것보다, 잡을 수 있는 것만 잡고 못 잡는 것을 여기 적는 편이 낫다.
 *
 * **1~4번은 선택자만 본다 — 변수 이름은 안 본다.** 그래서 한때 이런 사각이 있었다:
 * 팔레트 블록에서 선언 한 줄(`--wb-shell-comment: #d92d20;`)을 통째로 지워도 **web 전체
 * 1729건이 그대로 초록이었다**(2026-08-20 실측). 그 순간
 * `background: var(--wb-shell-comment)`가 계산 시점에 무효가 되어 코멘트 배지가 **배경
 * 없이** 그려지는데 아무 데서도 울지 않았다. **5번이 그 자리다** — 같은 변조가 이제 운다
 * (아래 구분력 표). 선택자를 빼는 쪽은 예나 지금이나 1번이 잡는다.
 *
 * 그래서 아래 **여섯**을 본다.
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
 * 6. **대체값(`var(--x, #fff)`)을 쓰는 자리가 없다.** 오늘 0건이고, 첫 하나가 생길 때
 *    사람이 이 머리말을 읽고 결정하게 하는 자리다.
 *
 * **5번은 왜 한쪽 방향인가 — 선언했는데 안 쓰는 변수(죽은 변수)는 잡지 않는다.**
 * `shell-css-coverage.ts`가 같은 이유로 반대 방향(**규칙은 있는데 코드가 안 붙이는 클래스**)을
 * 뺐다: 개발 중간 상태마다 문다. 스타일을 먼저 적고 마크업을 나중에 붙이는 순서가 정상이고,
 * 변수도 같다 — 팔레트에 색을 먼저 세우고 쓸 자리를 채우는 동안 검사가 울면 **검사를 끄게
 * 된다.** 여기서만 양방향으로 가면 **두 검사의 태도가 갈리고**, 갈린 태도는 "이 저장소의
 * 검사는 어느 쪽을 무는가"를 매번 확인하게 만든다. 죽은 변수는 아무것도 그리지 않으므로
 * (`shell.css` 머리말 4번이 같은 말을 한다) **조용히 틀리지 않는다** — 이 파일이 무는 것은
 * 조용히 틀리는 것뿐이다.
 *
 * **6번은 왜 금지가 아니라 0건 잠금인가.** `var(--x, #fff)`는 선언이 없어도 무효가 되지
 * 않으므로 **5번이 봐야 할 고장이 아니다**(그래서 5번은 대체값이 있으면 건너뛴다). 그렇다고
 * 값이 두 벌 사는 것이 공짜는 아니다 — 팔레트 주석이 *"값을 두 벌 적으면 한쪽만 고쳐지는
 * 자리가 된다"*라고 적고 있는 그것이다. 그래서 **막지 않고 세운다**: 첫 대체값이 들어올 때
 * 이 케이스가 울고, 쓰는 사람이 여기 근거를 적고 수를 고친다.
 *
 * **5·6번이 못 보는 것**(`shell-css-guard.ts`의 두 함수 주석에 기계 쪽 몫이 더 있다):
 *
 * - **선언 이름의 접두어를 안 본다.** 감싸는 상자가 아닌 규칙에서 `--brand: red`를 선언하고
 *   `var(--brand)`로 쓰면 **5번은 통과한다**(선언이 있으니까). `wrapper-variable`이 그
 *   형태를 막지만 그쪽은 `WRAPPERS` 넷만 본다. 즉 **접두어 없는 변수를 셸 안에서 쓰는 길이
 *   아직 열려 있다.** 조용히 깨지지는 않는다(값이 나온다) — D5의 *"셸이 읽는 것은 전부
 *   `--wb-shell-*`"*가 사람의 규율로 남아 있는 자리다.
 * - **`shell.css` 밖.** 인라인 `style`과 `use-theme-css.ts`가 `document.head`에 붙이는
 *   시트는 대상이 아니다. 그쪽은 **테마의 어휘**이고 D5가 두 이름 집합의 교집합이 비어
 *   있다고 말한다 — 셸의 변수를 쓰지 않으므로 여기서 볼 것이 없다.
 * - **선언의 값이 옳은지는 안 본다.** `--wb-shell-accent: ;`처럼 빈 값이어도 "선언됐다"다.
 *
 * **4번은 필요조건이지 충분조건이 아니다.** 이미 루트를 쓰는 라우트 파일 **안에** 두 번째
 * 루트를 더하면(예: `snapshots.tsx`가 `.wb-shell-archive`를 루트로 하는 화면을 하나 더
 * 그리게 되는 경우) 이 검사는 조용하다. 그 경우를 잡으려면 위의 "화면 루트 판정"이 필요하고,
 * 그것이 안 되는 이유가 위에 있다. **실제로 그 조용함을 관측했다** — 팔레트 목록에서
 * `.wb-shell-snapshots`를 빼는 실험에서 1번은 울었고 4번은 통과했다(`snapshots.tsx`가
 * 허용 루트인 `wb-shell-notice`도 쓰기 때문이다).
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
 * **팔레트를 선언하는 화면 루트 다섯.** `shell.css`의 팔레트 블록과 **정확히 같아야 한다.**
 *
 * | 클래스 | 화면 | 셸 안인가 |
 * |---|---|---|
 * | `wb-shell` | 에디터 셸(§9) | 자기가 셸이다 |
 * | `wb-shell-theme` | 테마 저작(P4c-2 D1) | 아니다 — 별도 라우트 |
 * | `wb-shell-snapshots` | 스냅샷(P6-1 D10) | 아니다 |
 * | `wb-shell-project-list` | 프로젝트 목록 | 아니다 |
 * | `wb-shell-login` | 로그인 | 아니다 |
 *
 * **여기 더하기 전에 물어라: 그 화면이 정말 셸 밖인가.** 셸 안이라면 `.wb-shell`이 이미
 * 물려주므로 더할 필요가 없고, 더하면 같은 값을 두 번 선언하는 자리가 된다.
 */
const SCREEN_ROOTS = [
  'wb-shell',
  'wb-shell-login',
  'wb-shell-project-list',
  'wb-shell-snapshots',
  'wb-shell-theme',
]

/**
 * **팔레트를 안 받는 화면 루트.** 여기 있으려면 조건이 하나다 — **자기 규칙이
 * `var(--wb-shell-…)`를 쓰지 않아야 한다.** 아래 케이스가 그것을 기계로 본다.
 *
 * `wb-shell-notice`가 유일하다. 셸에 이르지 못한 화면(조회 중·조회 실패)이고, 색을
 * `#1d2530` 리터럴로 갖는다 — 팔레트가 생기기 전부터 그랬다. 라우트 셋이 이것을 쓴다
 * (`snapshots.tsx`·`theme-editor.tsx`·`editor.tsx`).
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
    // `var()` 자리가 스타일을 손볼 때마다 바뀌기 때문이다(오늘 200 남짓).
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
    // 고장이 아니다(머리말 6번). 그 자리 자체는 6번이 따로 센다.
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
      '대체값을 쓰기로 했다면 금지가 아니다 — 다만 값이 팔레트와 여기 두 벌 살게 되므로, 머리말 6번에 근거를 적고 이 케이스를 고쳐라',
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
      const without = shellCss.replace('.wb-shell-snapshots,\n', '')
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
      // 2026-08-20 에 이 변조가 **web 전체 1729건을 통과했다**(머리말). 그것이 5번의 자리다.
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

    it('선언이 없어도 대체값이 있으면 5번은 넘어간다 — 6번이 대신 센다', () => {
      // 허용의 **근거**를 재는 케이스다(머리말 6번). 대체값을 5번이 물기 시작하면 여기서
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
