// @vitest-environment jsdom
/**
 * **D8 — 이스케이프를 실측한다.**
 *
 * 문서의 문자열은 **사용자가 적은 것**이고, 번들은 **남에게 전달되는 산출물**이다. 그래서
 * 이 저장소의 다른 어느 곳보다 이 축이 세다.
 *
 * jsdom을 쓰는 것은 **문자열 단언만으로는 절반**이기 때문이다 — `&lt;`가 나왔다는 것과
 * *"브라우저가 그것을 요소로 만들지 않는다"*는 다른 주장이고, 뒤쪽이 실제로 지키려는
 * 것이다. 그래서 낸 HTML을 파서에 넣어 요소가 생겼는지도 본다.
 *
 * `exportPage` 자신이 DOM 없이 도는 것은 `page.test.ts`의 카나리아가 따로 지킨다.
 *
 * ---
 *
 * ## 재서 적은 표 — `renderToStaticMarkup`이 무엇을 바꾸나
 *
 * | 자리 | `<` | `>` | `&` | `"` | `'` |
 * |---|---|---|---|---|---|
 * | 텍스트 | `&lt;` | `&gt;` | `&amp;` | `&quot;` | `&#x27;` |
 * | 속성 값 | `&lt;` | `&gt;` | `&amp;` | `&quot;` | `&#x27;` |
 * | `<title>` | `&lt;` | `&gt;` | `&amp;` | `&quot;` | `&#x27;` |
 * | `<html lang>` | `&lt;` | `&gt;` | `&amp;` | `&quot;` | `&#x27;` |
 *
 * **네 자리가 같은 규칙을 받는다.** 그래서 `exportPage`는 `<head>`까지 React가 그리게
 * 두었다(`page.tsx`의 머리말) — 손으로 이어 붙이면 그 자리만 규칙이 갈린다.
 *
 * ## 바꾸지 **않는** 것 — 그래서 안전이 다른 데서 온다
 *
 * | 것 | 무엇이 관찰되나 | 안전은 어디서 오나 |
 * |---|---|---|
 * | `javascript:` URL | `href`에 그대로 실린다 | **렌더러다.** `structures/action.tsx`가 `Link.target` 앞에 `#`을 붙여 조각 참조로 만든다 — React도 exporter도 막지 않는다 |
 * | 백슬래시 | 그대로다 | HTML에서 뜻이 없다 |
 * | CSS | 이스케이프 대상이 아니다 | **`themes`다.** `css`는 HTML 밖의 값이고(D1·D7), 그 안에 `<`가 들어가는 길은 `bad-style-value` **error**로 막혀 `resolveTheme`이 `null`을 낸다 |
 *
 * **마지막 줄은 P8-2가 이어받는다** — 그 슬라이스가 CSS를 `<style>`로 인라인하기로 하면
 * *"`</style>`이 값에 들어갈 수 있는가"*가 그때의 물음이 되고, 오늘의 답은 아래 케이스가
 * 든다.
 */
import { installStructures } from '@wirebound/renderer'
import { installCatalog, type PageDocument } from '@wirebound/schema'
import { THEME_ISSUE_SEVERITY, resolveTheme } from '@wirebound/themes'
import { beforeAll, describe, expect, it } from 'vitest'
import { exportPage } from '../src/page'

beforeAll(() => {
  installCatalog()
  installStructures()
})

/** 텍스트 자리에 문자열 하나를 실은 문서. */
function inText(value: string): PageDocument {
  return {
    version: 1,
    root: {
      id: 'n_000000000001',
      type: 'Page',
      children: [{ id: 'n_000000000002', type: 'Text', props: { content: value } }],
    },
  }
}

/** 속성 자리(`data-wb-variant`)에 문자열 하나를 실은 문서. */
function inAttribute(value: string): PageDocument {
  return {
    version: 1,
    root: {
      id: 'n_000000000001',
      type: 'Page',
      children: [{ id: 'n_000000000003', type: 'Button', variant: value, props: { label: 'ㄱ' } }],
    },
  }
}

const EMPTY: PageDocument = { version: 1, root: { id: 'n_000000000001', type: 'Page' } }

/** 자리 넷. 문자열 하나를 받아 그 자리에 실은 HTML을 낸다. */
const SINKS = {
  텍스트: (value: string) => exportPage({ document: inText(value), title: 'ㄱ' }).html,
  '속성 값': (value: string) => exportPage({ document: inAttribute(value), title: 'ㄱ' }).html,
  '<title>': (value: string) => exportPage({ document: EMPTY, title: value }).html,
  '<html lang>': (value: string) => exportPage({ document: EMPTY, title: 'ㄱ', lang: value }).html,
} as const

/**
 * **위 표를 그대로 옮긴 것이다.** 분모(문자 다섯 × 자리 넷)를 손으로 든다 — 구현에서
 * 끌어오면 무엇을 안 바꾸게 돼도 기대값이 함께 바뀐다(P7-3 이월 §9).
 */
const ESCAPES: [character: string, expected: string][] = [
  ['<', '&lt;'],
  ['>', '&gt;'],
  ['&', '&amp;'],
  ['"', '&quot;'],
  ["'", '&#x27;'],
]

describe('renderToStaticMarkup이 바꾸는 것 (D8)', () => {
  for (const [place, render] of Object.entries(SINKS)) {
    it.each(ESCAPES)(`${place} — %s는 %s가 된다`, (character, expected) => {
      const html = render(`앞${character}뒤`)
      expect(html).toContain(`앞${expected}뒤`)
      expect(html).not.toContain(`앞${character}뒤`)
    })
  }
})

describe('바꾸지 않는 것 — 그래서 안전이 다른 데서 온다', () => {
  it('백슬래시는 그대로다', () => {
    expect(SINKS['텍스트']('앞\\뒤')).toContain('앞\\뒤')
  })

  /**
   * **`javascript:`를 React가 막지 않는다.** 막는 것은 렌더러의 구조 구현이고, 방법은
   * 검사가 아니라 `#` 접두어다 — 값이 무엇이든 조각 참조가 된다.
   */
  it('javascript: URL이 href에 그대로 실린다 — 다만 # 뒤다', () => {
    const document_: PageDocument = {
      version: 1,
      root: {
        id: 'n_000000000001',
        type: 'Page',
        children: [
          {
            id: 'n_000000000004',
            type: 'Link',
            props: { label: '링크', target: 'javascript:alert(1)' },
          },
        ],
      },
    }
    const { html } = exportPage({ document: document_, title: 'ㄱ' })

    expect(html).toContain('href="#javascript:alert(1)"')

    const anchor = new DOMParser()
      .parseFromString(html, 'text/html')
      .querySelector('a[data-wb-component="Link"]')
    expect(anchor?.getAttribute('href')).toBe('#javascript:alert(1)')
  })

  /**
   * **CSS는 이 함수의 이스케이프 대상이 아니다.** `css`는 HTML 밖의 값이라(D1·D7) 여기서
   * 바꿀 것이 없고, 대신 `<`가 값에 들어가는 길이 `themes`에서 막혀 있다. **P8-2가 CSS를
   * `<style>`로 인라인하기로 하면 이 케이스가 그때의 근거다.**
   */
  it('테마 값에 `<`를 넣으면 테마가 서지 않는다 — CSS에 도달할 길이 없다', () => {
    const { theme, issues } = resolveTheme({
      meta: { id: 'x', name: '가', version: '1.0.0' },
      tokens: { semantic: { primary: '#111' } },
      primitives: { container: { maxWidth: '</style><script>alert(1)</script>' } },
    })

    expect(theme).toBeNull()
    expect(
      issues
        .filter((issue) => THEME_ISSUE_SEVERITY[issue.code] === 'error')
        .map((issue) => `${issue.code} ${issue.path}`),
    ).toEqual(['bad-style-value primitives.container.maxWidth'])
  })

  it('폰트 src도 같은 자리에서 막힌다', () => {
    const { theme, issues } = resolveTheme({
      meta: { id: 'y', name: '나', version: '1.0.0' },
      tokens: { semantic: { primary: '#111' } },
      assets: { fonts: [{ family: 'A', src: 'https://x/a.woff2</style><script>x</script>' }] },
    })

    expect(theme).toBeNull()
    expect(issues.map((issue) => `${issue.code} ${issue.path}`)).toEqual([
      'bad-style-value assets.fonts.0.src',
    ])
  })
})

/**
 * **문자열이 아니라 결과를 본다.** `&lt;`가 나왔다는 것과 *"요소가 안 생긴다"*는 다른
 * 주장이고, 번들이 남에게 전달되는 산출물이므로 지켜야 하는 것은 뒤쪽이다.
 */
describe('넣은 것이 요소가 되지 않는다', () => {
  const PAYLOAD = '<script>alert(1)</script><img src=x onerror="alert(2)">'

  it.each(Object.keys(SINKS) as (keyof typeof SINKS)[])('%s 자리', (place) => {
    const html = SINKS[place](PAYLOAD)
    const parsed = new DOMParser().parseFromString(html, 'text/html')

    expect(parsed.querySelectorAll('script')).toHaveLength(0)
    expect(parsed.querySelectorAll('img')).toHaveLength(0)
    // 파서가 문서를 끝까지 판다 — 페이로드가 태그를 열어 뒤를 먹지 않았다는 뜻이다.
    expect(parsed.querySelector('[data-wb-component="Page"]')).not.toBeNull()
  })

  /** 속성을 닫고 새 속성을 여는 고전적 페이로드. */
  it('속성 탈출 시도가 속성 하나로 남는다', () => {
    const html = SINKS['속성 값']('"><img src=x onerror=1>')
    const parsed = new DOMParser().parseFromString(html, 'text/html')
    const button = parsed.querySelector('[data-wb-component="Button"]')

    expect(parsed.querySelectorAll('img')).toHaveLength(0)
    expect(button?.getAttribute('data-wb-variant')).toBe('"><img src=x onerror=1>')
    expect([...button!.attributes].map((attr) => attr.name).sort()).toEqual([
      'data-wb-component',
      'data-wb-id',
      'data-wb-structure',
      'data-wb-variant',
      'type',
    ])
  })

  /** `</` 로 여는 시도. 텍스트 자리에서 태그를 닫아 `<body>`를 끝내려는 부류다. */
  it('닫는 태그 흉내가 텍스트로 남는다', () => {
    const html = SINKS['텍스트']('</body></html><script>alert(1)</script>')
    const parsed = new DOMParser().parseFromString(html, 'text/html')

    expect(parsed.querySelectorAll('script')).toHaveLength(0)
    expect(parsed.querySelector('[data-wb-component="Text"]')?.textContent).toBe(
      '</body></html><script>alert(1)</script>',
    )
  })
})
