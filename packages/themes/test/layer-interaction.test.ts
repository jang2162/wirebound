import { installCatalog } from '@wirebound/schema'
import { beforeAll, describe, expect, it } from 'vitest'
import { compileTheme } from '../src/emit/index'
import { resolveTheme } from '../src/resolve/index'
import type { Theme } from '../src/spec/theme'

beforeAll(() => {
  installCatalog()
})

function css(theme: Theme): string {
  const { theme: resolved, issues } = resolveTheme(theme)
  expect(issues.map((issue) => `${issue.path}: ${issue.message}`)).toEqual([])
  return compileTheme(resolved!)
}

/** 두 셀렉터 중 어느 것이 먼저 나오는지. 같은 특이도에서는 나중이 이긴다. */
function orderOf(source: string, first: string, second: string): 'first-then-second' | 'second-then-first' {
  const a = source.indexOf(first)
  const b = source.indexOf(second)
  expect(a, `찾지 못했다: ${first}`).toBeGreaterThanOrEqual(0)
  expect(b, `찾지 못했다: ${second}`).toBeGreaterThanOrEqual(0)
  return a < b ? 'first-then-second' : 'second-then-first'
}

/**
 * **재라 #6 — `bgGradient`와 `bgImage`가 같은 CSS 프로퍼티다.**
 *
 * **잰 것:** 둘 다 있으면 `background-image` 선언이 **둘 나가고, 문서에 나중에 적힌 쪽이
 * 이긴다.** 순서를 바꿔 값이 뒤집히는 것을 확인했다(실제 브라우저가 아니라 방출 순서로
 * 잰다 — 아래 케이스).
 *
 * **원인:** `STYLE_PROPERTIES`가 두 어휘를 같은 CSS 프로퍼티(`background-image`)로 보내고,
 * `checkStyleMap`이 `Object.entries` 순서로 선언을 쌓는다. 즉 **우선순위를 정하는 것은
 * 테마 작성자의 JSON 키 순서**다.
 *
 * **판정: 이슈로 내지 않고 그대로 둔다.** 근거 셋.
 *
 * 1. 같은 프로퍼티를 두 번 적는 것은 CSS의 정상적인 관용구(폴백)이고, 나중이 이기는 것은
 *    규칙대로다. 여기서 이슈를 내면 오늘 잘 그려지는 문서가 거부된다.
 * 2. **진짜 문제는 순서가 저장을 못 견딘다는 것**이고 그것은 이 자리의 문제가 아니다 —
 *    P4a-1이 Postgres `jsonb`가 객체 키 순서를 (길이, 바이트)로 정규화하는 것을 컨테이너에서
 *    쟀다. 저장을 거치면 `bgGradient`(10자)와 `bgImage`(7자) 중 **짧은 `bgImage`가 앞으로
 *    가서 `bgGradient`가 이긴다** — 작성자가 무엇을 적었든. 고치려면 순서를 계약에서
 *    빼거나 저장 형식을 바꿔야 하고, **그 판단의 맥락은 P4a-3에 있다**(`states` 순서와
 *    같은 부류이므로 함께 정해야 한다).
 * 3. 지금 이슈를 만들면 P4a-3이 그것을 되돌려야 할 수 있다.
 */
describe('재라 #6 — bgGradient와 bgImage가 같은 프로퍼티다', () => {
  const withBoth = (keys: Record<string, string>): string =>
    css({
      meta: { id: 'x', name: 'x', version: '1' },
      components: { Card: { structure: 'plain', base: keys } },
    })

  it('선언이 둘 나간다', () => {
    const out = withBoth({
      bgGradient: 'linear-gradient(red, blue)',
      bgImage: 'url(/a.png)',
    })
    expect(out.match(/background-image:/g)).toHaveLength(2)
  })

  it('문서에 나중에 적힌 쪽이 나중에 나온다 — 즉 이긴다', () => {
    const gradientFirst = withBoth({
      bgGradient: 'linear-gradient(red, blue)',
      bgImage: 'url(/a.png)',
    })
    expect(orderOf(gradientFirst, 'linear-gradient', 'url(/a.png)')).toBe('first-then-second')

    const imageFirst = withBoth({
      bgImage: 'url(/a.png)',
      bgGradient: 'linear-gradient(red, blue)',
    })
    expect(orderOf(imageFirst, 'linear-gradient', 'url(/a.png)')).toBe('second-then-first')
  })
})

/**
 * **재라 #7 — `@media`가 `states`를 덮는다. 실제로 덮는 것을 확인했다.**
 *
 * **잰 것:** 실제 브라우저(Chromium)에서 `states.disabled`가 `opacity: 0.5`, 같은
 * 컴포넌트의 `responsive.<bp>.base`가 `opacity: 0.9`일 때, 브레이크포인트가 맞는 폭에서
 * 계산값이 **0.9**였다. 즉 상태 스킨이 반응형에 진다.
 *
 * **원인:** `compileTheme`이 `pushResponsive`를 **맨 뒤**에 부르고, `@media` 안의 셀렉터
 * (`[data-wb-component][data-wb-structure]`)와 상태 셀렉터(`[data-wb-component][data-wb-state~=]`)의
 * 특이도가 **둘 다 0,2,0**이다. 같은 특이도에서는 나중이 이긴다.
 *
 * **jsdom으로는 잴 수 없다.** jsdom 25의 `getComputedStyle`은 `@media` 블록 안의 규칙을
 * **전혀 적용하지 않는다** — 조건이 참이든 거짓이든 무시한다(`(max-width: 99999px)`처럼
 * 언제나 참인 조건으로 확인했다). 그래서 여기서는 **방출 순서**만 고정하고, 그 순서가
 * 실제로 만드는 결과는 위에 적은 브라우저 측정이 근거다.
 *
 * **판정: 순서를 바꾸지 않는다.** §6.5가 이 상호작용을 말하지 않지만, 반응형이 마지막에
 * 오는 것은 §6.11의 예시가 `@media`를 맨 뒤에 둔 모양 그대로이고 CSS 관례이기도 하다.
 * 상태가 반응형을 이겨야 한다는 요구는 설계 어디에도 없다. **바꾸려면 근거가 필요한 쪽은
 * 바꾸자는 쪽이다.**
 */
describe('재라 #7 — @media가 states보다 뒤에 온다', () => {
  const out = (): string =>
    css({
      meta: { id: 'x', name: 'x', version: '1' },
      primitives: { breakpoints: { md: 768 } },
      components: {
        List: {
          structure: 'table',
          base: { opacity: 1 },
          states: { disabled: { opacity: 0.5 } },
          responsive: { md: { base: { opacity: 0.9 } } },
        },
      },
    })

  it('상태 규칙보다 @media 블록이 나중에 나온다', () => {
    expect(orderOf(out(), '[data-wb-state~="disabled"]', '@media')).toBe('first-then-second')
  })

  it('두 셀렉터의 특이도가 같다 — 그래서 순서가 곧 우선순위다', () => {
    // 속성 선택자 개수를 센다. 둘 다 둘이면 특이도가 같다.
    const stateSelector = '[data-wb-component="List"][data-wb-state~="disabled"]'
    const responsiveSelector = '[data-wb-component="List"][data-wb-structure="table"]'
    expect(stateSelector.match(/\[/g)).toHaveLength(2)
    expect(responsiveSelector.match(/\[/g)).toHaveLength(2)
    expect(out()).toContain(stateSelector)
    expect(out()).toContain(responsiveSelector)
  })
})

/**
 * **재라 #10 — `assets.fonts`는 여전히 아무것도 내지 않는다.**
 *
 * **잰 것:** `assets.fonts`가 있는 테마를 컴파일하면 CSS가 **빈 문자열**이다(`@font-face`가
 * 없다). P4a-1의 판단 그대로다.
 *
 * **그 판단이 여전히 서는가 — 선다. 그리고 이유가 하나 늘었다.** P4a-1의 근거는
 * *"P8이 URL을 다시 쓰므로 지금 만들면 되돌려야 한다"*였다. 여기에 더해, **오늘은
 * `@font-face`를 내도 쓸 방법이 없다** — §6.8의 스타일 화이트리스트에 `fontFamily`가
 * **없어서** 어떤 테마도 폰트를 컴포넌트에 걸 수 없다(`STYLE_PROPERTIES`를 훑어 확인했다).
 * 즉 폰트 로딩만 만들면 **로드는 되는데 아무도 안 쓰는 CSS**가 된다.
 *
 * **P4a-1 이월의 문장 하나가 이것과 어긋난다:** *"`font-family`는 나가므로 시스템 폰트로
 * 눈에 보이게 폴백한다."* 나가지 않는다 — 낼 어휘가 없다.
 */
describe('재라 #10 — assets.fonts', () => {
  it('@font-face를 내지 않는다', () => {
    const out = css({
      meta: { id: 'x', name: 'x', version: '1' },
      assets: { fonts: [{ family: 'Pretendard', src: 'https://example.test/p.woff2' }] },
    })
    expect(out).not.toContain('@font-face')
    expect(out).toBe('')
  })
})

/**
 * **재라 #11 — `url()`의 대상을 검증하지 않는다. 실제 브라우저에서 확인했다.**
 *
 * **잰 것:** 외부 호스트(`url(https://…)`)가 CSS에 그대로 실려 나가고, 브라우저가 실제로
 * **그 주소로 요청을 보낸다**(Chromium에서 `net::ERR_NAME_NOT_RESOLVED`가 났다 — 즉 막힌
 * 것이 아니라 요청이 나갔다가 이름 해석에 실패했다). `data:` URI도 그대로 적용된다.
 *
 * **CSP는 아무것도 막지 않는다 — 이 앱에 CSP가 없기 때문이다.** `apps/web/index.html`·
 * `vite.config.ts`·`apps/api/src`를 훑었는데 `Content-Security-Policy`를 세우는 자리가
 * 없다. 즉 *"CSP가 무엇을 막는가"*의 답은 **"막을 CSP가 아직 없다"**이고, 그것을 세우는
 * 것은 이 태스크의 범위 밖이다(P5 내보내기·배포가 함께 정할 일이다).
 *
 * 여기서는 **값이 손대지 않은 채 나간다**는 것만 고정한다.
 */
describe('재라 #11 — url()의 대상이 그대로 나간다', () => {
  it('외부 호스트와 data: URI가 손대지 않은 채 실린다', () => {
    const external = css({
      meta: { id: 'x', name: 'x', version: '1' },
      components: { Card: { structure: 'plain', base: { bgImage: 'url(https://example.invalid/x.png)' } } },
    })
    expect(external).toContain('url(https://example.invalid/x.png)')

    const dataUri = css({
      meta: { id: 'x', name: 'x', version: '1' },
      components: { Card: { structure: 'plain', base: { bgImage: 'url(data:image/gif;base64,R0lGOD)' } } },
    })
    expect(dataUri).toContain('url(data:image/gif;base64,R0lGOD)')
  })
})
