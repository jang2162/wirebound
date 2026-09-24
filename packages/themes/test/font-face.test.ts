/**
 * **`assets.fonts` → `@font-face`.**
 *
 * `fontFamily` 어휘가 가리킬 폰트를 싣는 경로가 이것이다 — 이 경로가 없으면 어휘는 있어도
 * 폰트는 폴백으로 그려진다. 서체는 시스템 테마 다섯의 인상 차이에서 가장 큰 몫이다.
 *
 * **여기서 재지 못하는 것이 있다.** `@font-face`가 실제로 시트에 걸리는지, `font-family`를
 * 건 요소의 계산된 값이 선언한 이름을 갖는지는 **jsdom이 못 본다** — jsdom 25의 캐스케이드는
 * 문서 순서 하나이고 특이도도 `!important`도 안 본다(`emit-parse.test.ts`의 *"순서를 뒤집으면
 * 이기는 쪽도 뒤집힌다"*가 그것을 못박는다). 이 파일이 재는 것은
 * **방출된 문자열**이고, 브라우저 쪽은 Chrome 151로 쟀다 —
 * 잰 값과 프로브를 커밋하지 않은 이유는 `src/emit/index.ts`의 `pushFontFaces` 머리말에 있다.
 */
import { describe, expect, it } from 'vitest'
import { compileTheme } from '../src/emit/index'
import { resolveTheme } from '../src/resolve/index'
import { ADMIN_THEME } from '../src/system/admin'
import type { Theme } from '../src/spec/theme'
import { installCatalog } from '@wirebound/schema'
import { beforeAll } from 'vitest'

beforeAll(() => {
  installCatalog()
})

function compile(theme: Theme): string {
  const { theme: resolved, issues } = resolveTheme(theme)
  expect(issues.map((issue) => `${issue.path}: ${issue.message}`)).toEqual([])
  return compileTheme(resolved!)
}

function themeWith(assets: Theme['assets']): Theme {
  return {
    meta: { id: 'fonts', name: '폰트', version: '1.0.0' },
    tokens: { semantic: { primary: '#000000' } },
    ...(assets === undefined ? {} : { assets }),
  }
}

describe('assets.fonts가 @font-face로 나간다', () => {
  it('family와 src를 그대로 낸다', () => {
    const css = compile(themeWith({ fonts: [{ family: 'Pretendard', src: 'local("Pretendard")' }] }))
    expect(css).toContain('@font-face {\n  font-family: Pretendard;\n  src: local("Pretendard");\n}')
  })

  /**
   * **가중치마다 블록 하나다 — 범위로 접지 않는다.** 근거는 `pushFontFaces`의 머리말에
   * 표로 적었다: 범위는 **문서에 없는 값을 만들고**(`[400,500,700]`의 범위가 600을 포함한다)
   * `src`가 정적 폰트일 때 굵게가 말없이 사라진다.
   */
  it('weights 하나마다 블록 하나다', () => {
    const css = compile(
      themeWith({ fonts: [{ family: 'P', src: 'local("P")', weights: [400, 500, 700] }] }),
    )
    expect([...css.matchAll(/@font-face \{/g)]).toHaveLength(3)
    expect(css).toContain('  font-weight: 400;')
    expect(css).toContain('  font-weight: 500;')
    expect(css).toContain('  font-weight: 700;')
    // 없는 값을 만들지 않는다 — 범위였다면 600도 뜻하게 된다.
    expect(css).not.toContain('font-weight: 400 700')
  })

  it('weights가 없으면 font-weight를 안 낸다', () => {
    const css = compile(themeWith({ fonts: [{ family: 'P', src: 'local("P")' }] }))
    expect(css).not.toContain('font-weight')
  })

  it('폰트가 여럿이면 선언 순서를 지킨다', () => {
    const css = compile(
      themeWith({
        fonts: [
          { family: 'First', src: 'local("First")' },
          { family: 'Second', src: 'local("Second")' },
        ],
      }),
    )
    expect(css.indexOf('First')).toBeLessThan(css.indexOf('Second'))
  })

  /**
   * **@font-face가 어느 규칙보다 앞에 온다.** 이 저장소의 캐스케이드 계약이 순서이므로
   * 새 층의 자리를 문자열로 못박는다 — jsdom이 못 보는 것을 셀렉터
   * 문자열로 지키는 `structure-css.test.ts`의 특이도 못과 같은 형식이다.
   */
  it('@font-face가 :root보다 앞에 온다', () => {
    const css = compile(themeWith({ fonts: [{ family: 'P', src: 'local("P")' }] }))
    expect(css.indexOf('@font-face')).toBeLessThan(css.indexOf(':root {'))
    expect(css.startsWith('@font-face {')).toBe(true)
  })

  it('fonts가 없는 assets는 아무것도 안 낸다', () => {
    // `icons`·`placeholder`만 있는 테마 — `placeholder.style`은 컴파일하지
    // 않는다(테마→렌더러 채널은 `structures` 하나뿐이다).
    const css = compile(themeWith({ icons: 'lucide', placeholder: { style: 'blueprint' } }))
    expect(css).not.toContain('@font-face')
  })
})

/**
 * **`@font-face` 층이 `admin`의 CSS를 한 글자도 바꾸면 안 된다.**
 *
 * `admin`에는 `assets`가 없으므로 `@font-face`가 **빈 문자열**이어야 한다. 여기서는
 * *"새 층이 `admin`에 아무것도 더하지 않는다"*만 닫는다 — `admin`의 CSS 전체가 그대로인지는
 * 이 파일이 재지 않는다.
 */
describe('admin은 @font-face를 하나도 안 낸다', () => {
  it('admin에 assets가 없다', () => {
    // 이 전제가 깨지면 아래 두 케이스의 뜻이 달라진다.
    expect(ADMIN_THEME.assets).toBeUndefined()
  })

  it('admin의 CSS에 @font-face가 없다', () => {
    expect(compile(ADMIN_THEME)).not.toContain('@font-face')
  })

  /**
   * **자리까지 본다.** 위 케이스는 *"없다"*만 말하는데, 새 층이 빈 문자열을 하나 밀어
   * 넣어도(`blocks.push('')`) 그 케이스는 통과하고 CSS는 개행 하나만큼 달라진다.
   */
  it('admin의 CSS가 :root로 시작한다', () => {
    expect(compile(ADMIN_THEME).startsWith(':root {')).toBe(true)
  })
})

/**
 * **`src`·`family`가 CSS 문법을 끊고 나가지 못한다.**
 *
 * `spec/assets.ts`는 *"선언을 검증할 뿐 리소스를 가져오지 않는다"*. 그래도
 * **이 값은 CSS로 나가므로** `bgImage`와 같은 부류다 —
 * 방출이 값을 그대로 문자열에 붙이므로(이 패키지는 CSS 파서를 안 들인다) 검증하지 않으면
 * 선언과 블록을 끝내고 나갈 수 있다.
 */
describe('src·family의 주입 경계', () => {
  function issuesOf(assets: Theme['assets']): string[] {
    return resolveTheme(themeWith(assets)).issues.map((issue) => issue.path)
  }

  it('src가 블록을 끝내고 나가지 못한다', () => {
    expect(issuesOf({ fonts: [{ family: 'P', src: 'local("P"); } body{display:none' }] })).toEqual([
      'assets.fonts.0.src',
    ])
  })

  it('family가 스타일 블록을 끝내지 못한다', () => {
    expect(issuesOf({ fonts: [{ family: 'P</style><b>', src: 'local("P")' }] })).toEqual([
      'assets.fonts.0.family',
    ])
  })

  it('따옴표 짝이 맞지 않으면 이슈다', () => {
    // 홀수 따옴표는 **선언 하나가 아니라 스타일시트 전체**를 못 만들게 한다
    // (`resolve/functions.ts`가 jsdom으로 잰 자리다).
    expect(issuesOf({ fonts: [{ family: 'P', src: 'local("P)' }] })).toEqual(['assets.fonts.0.src'])
  })

  it('허용 밖 함수는 이슈다', () => {
    expect(issuesOf({ fonts: [{ family: 'P', src: 'image-set("a.woff2")' }] })).toEqual([
      'assets.fonts.0.src',
    ])
    // family에는 함수가 하나도 못 온다.
    expect(issuesOf({ fonts: [{ family: 'local("P")', src: 'local("P")' }] })).toEqual([
      'assets.fonts.0.family',
    ])
  })

  it('url·local·format·tech는 통과한다', () => {
    expect(
      issuesOf({ fonts: [{ family: 'P', src: 'local("P"), url(/f.woff2) format("woff2")' }] }),
    ).toEqual([])
    expect(issuesOf({ fonts: [{ family: 'P', src: 'url(/f.woff2) tech(variations)' }] })).toEqual([])
  })

  /**
   * **data URI가 통과한다** — `;`는 `url()` 안쪽에서만 예외이고
   * (`resolve/functions.ts`가 그 이유를 적어 두었다) `data:font/woff2;base64,…`가 그것을 쓴다.
   * 브라우저 프로브가 `local()`을 고른 것은 이것이 안 되어서가 아니다 — **둘 다 브라우저에서
   * 재서 둘 다 통과했다**(`src/emit/index.ts`의 `pushFontFaces` 머리말의 표).
   */
  it('data URI는 통과한다', () => {
    expect(
      issuesOf({ fonts: [{ family: 'P', src: 'url(data:font/woff2;base64,d09GMg==)' }] }),
    ).toEqual([])
  })

  /**
   * **이 케이스의 값(`src: 'a{b}'`)은 `error`라, `null`의 기준이 *"이슈가 있으면"*이든
   * *"`error`가 있으면"*이든 단언은 통과한다** — 기준(`resolve/index.ts`)이 바뀌어도 테스트로는
   * 안 잡히고 이름과 주석만 조용히 거짓이 된다. 기준을 바꾸면 이 이름과 주석을 손으로 맞춘다.
   */
  it('error가 있으면 테마 전체가 못 쓰인다', () => {
    // `resolveTheme`은 **`error`가** 하나라도 있으면 `theme: null`이다 — 즉 나쁜 `src`
    // 하나가 그 테마를 통째로 막는다. 저장 경계(`assertResolvable`)가 422를 낸다.
    // 이 값이 내는 것은 `bad-style-value`(`error`) 한 건이고 `checkAssets`는 `warning`을
    // 낼 길이 없다.
    expect(resolveTheme(themeWith({ fonts: [{ family: 'P', src: 'a{b}' }] })).theme).toBeNull()
  })
})
