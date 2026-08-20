/**
 * **셸 밖 화면 루트가 팔레트를 받는가.** `shell-css.test.ts`(D7 누수) ·
 * `shell-css-coverage.test.ts`(규칙 없는 클래스)에 이어지는 셋째 검사다.
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
 * **그리고 이 검사는 선택자만 본다 — 변수 이름은 안 본다.** 팔레트 블록에서 선언 한 줄
 * (`--wb-shell-comment: #d92d20;`)을 통째로 지워도 **web 전체 1729건이 그대로 초록이다**
 * (2026-08-20 실측). 그 순간 `background: var(--wb-shell-comment)`는 계산 시점에 무효가
 * 되어 코멘트 배지가 **배경 없이** 그려지는데, 아무 데서도 울지 않는다. 위의 "조용히
 * 깨진다"와 같은 부류의 사고이고, **아직 기계가 보지 않는 쪽**이다. 선택자를 빼는 쪽은
 * 잡힌다(아래 1번). **잡으려면 `var(--wb-shell-…)` 사용처와 선언 이름을 대조해야 한다.**
 *
 * 그래서 아래 **넷**만 본다.
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
import { paletteRoots } from './shell-css-guard'
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

describe('셸 밖 화면 루트가 팔레트를 받는가', () => {
  it('검사가 진짜 shell.css와 진짜 라우트를 읽는다', () => {
    expect(shellCss).toContain('--wb-shell-accent')
    expect(ROUTE_SOURCES.length).toBeGreaterThan(3)
    expect(ROUTE_SOURCES.map(([file]) => file)).toContain('routes/login.tsx')
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
})
