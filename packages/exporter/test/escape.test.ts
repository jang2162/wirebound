// @vitest-environment jsdom
/**
 * **이스케이프를 실측한다.**
 *
 * 문서의 문자열은 **사용자가 적은 것**이고, 번들은 **남에게 전달되는 산출물**이다. 그래서
 * 이 저장소의 다른 어느 곳보다 이 축이 세다.
 *
 * jsdom을 쓰는 것은 **문자열 단언만으로는 절반**이기 때문이다 — `&lt;`가 나왔다는 것과
 * *"브라우저가 그것을 요소로 만들지 않는다"*는 다른 주장이고, 뒤쪽이 실제로 지키려는
 * 것이다. 그래서 낸 HTML을 파서에 넣어 요소가 생겼는지도 보고, 목업은 번들 런타임이 그리는 그 진입(`mountExportDocument`)으로
 * 그려 본다.
 *
 * ---
 *
 * ## 문자열이 어디로 가나 — 자리 넷
 *
 * 번들 페이지의 HTML 에 사용자 문자열이 실리는 자리는 둘뿐이다 — `<title>` 과 `<html lang>`(`renderHtmlDocument` 가 React 로
 * 그린다). **문서의 문자열(텍스트 · 속성 값)은 HTML 로 실리지 않는다** — 페이지 JSON(`<script type="application/json">`, `scriptJson`)에
 * 실려 가고, 목업은 브라우저에서 React 가 DOM 으로 짓는다(글자는 `textContent` · 속성은 `setAttribute` — 파서를 안 지난다).
 *
 * | 자리 | `<` | `>` | `&` | `"` | `'` |
 * |---|---|---|---|---|---|
 * | `<title>` | `&lt;` | `&gt;` | `&amp;` | `&quot;` | `&#x27;` |
 * | `<html lang>` | `&lt;` | `&gt;` | `&amp;` | `&quot;` | `&#x27;` |
 * | 페이지 JSON(텍스트 · 속성 값) | `<` | 그대로 | 그대로 | `\"` | 그대로 |
 *
 * **HTML 의 두 자리가 같은 규칙을 받는다.** 그래서 `<head>`까지 React가 그리게 두었다(`page.tsx`의 `renderHtmlDocument`) —
 * 손으로 이어 붙이면 그 자리만 규칙이 갈린다. 페이지 JSON 의 규칙은 `scriptJson` 이 든다(`src/script-json.ts`).
 *
 * ## 바꾸지 **않는** 것 — 그래서 안전이 다른 데서 온다
 *
 * | 것 | 무엇이 관찰되나 | 안전은 어디서 오나 |
 * |---|---|---|
 * | `javascript:` URL | `href`에 그대로 실린다 | **뷰다.** SDK 기본 뷰 `Link`(`packages/theme-sdk/src/default-views/action.tsx`)가 `target` 앞에 `#`을 붙여 조각 참조로 만든다 — React도 exporter도 막지 않는다. 테마 뷰는 신뢰 코드라 그 판정을 스스로 진다(spec `docs/superpowers/specs/2026-09-27-code-themes-design.md` 「확정한 결정」의 신뢰 경계) |
 * | 백슬래시 | 목업에 그대로다(페이지 JSON 에서는 `\\`) | HTML에서 뜻이 없다 |
 * | **날 제어 문자**(U+0000 NUL · U+000B 등) | **목업에 그대로 실린다** — `<title>`에도 | **저장 경계다**(NUL만). 아래 참조 |
 * | **줄·문단 분리자**(U+2028 · U+2029) | **그대로 실린다** | **필요 없다.** ES2019가 그 둘을 문자열 리터럴에서 합법으로 만들었다 — 아래 참조 |
 * | CSS | 이스케이프 대상이 아니다 | **인라인하지 않는 것이다.** 번들은 시트를 전부 링크로 건다(`views.css` · 테마의 `theme.css` · `tokens.css`). 테마 CSS 는 관리자가 올린 신뢰 코드다(같은 spec 의 신뢰 경계) |
 *
 * **CSS 줄의 물음은 인라인할 때 생긴다** — CSS를 `<style>`로 인라인하는 경로를 만들면 *"`</style>`이 값에 들어갈 수 있는가"*가
 * 물음이 된다. 그 경로를 만드는 쪽이 그 답을 세운다.
 *
 * ---
 *
 * ## 제어 문자와 분리자 — **막지 않는다. 판정과 근거**
 *
 * ### NUL(U+0000) — **저장 경계가 이미 막는다. 여기서 두 번 막지 않는다**
 *
 * `apps/api/src/db/nul-guard.ts`의 `containsNulByte`가 문서 트리를 훑어 막고, 그 자리를
 * 고른 근거가 그 파일에 적혀 있다: **Postgres의 `text`/`jsonb`가 NUL을 담지 못하는 제약**
 * 이고, 그래서 브라우저에서도 도는 `@wirebound/schema`가 아니라 **Postgres를 아는 계층**에
 * 있다. 코멘트·프리셋도 각자의 경계에서 같은 것을 막는다.
 *
 * **여기서 또 막으면 판정이 두 벌이 된다.** 그리고 이 패키지가 막을
 * 이유가 없다 — NUL은 HTML에서 **문법을 끊지 않는다**(파서가 U+FFFD로 바꾸거나 그대로
 * 둘 뿐이고, 태그도 속성도 열지 못한다).
 *
 * > **저장을 지나지 않는 경로는 그 방벽 밖이다.** 파일에서 읽은 문서를 저장 없이 바로
 * > 내보내는 경로는 `nul-guard`를 지나지 않는다. **그 경로를 만드는 쪽이 판정할 자리다** —
 * > exporter가 미리 막으면 저장을 지난 문서까지 두 번 검사한다. (`wireb export`는 서버가
 * > 만든 번들을 받으므로 방벽 안이다.)
 *
 * ### U+2028·U+2029 — **HTML에서도 JS 문자열 리터럴에서도 안 깨진다**
 *
 * 이 둘은 HTML 텍스트에서 아무 뜻이 없다(공백류 문자다). 그리고 **ES2019가 그 둘을 문자열
 * 리터럴에서 합법으로 만들었다** — `test/script-json.test.ts`가 날 분리자를 넣은 리터럴을
 * 실제로 파싱해 그것을 값으로 든다.
 *
 * > **깨지는 곳은 분리자가 아니라 `</script>`다.** 그 둘만 막는 코드는 막을 필요가 없는
 * > 것을 막고 **실제로 깨지는 `</script>`를 놓친다.** 그 규칙은 `scriptJson`이 든다
 * > (`src/script-json.ts`).
 *
 * **그래서 exporter도 저장 경계도 이 둘을 막지 않는다.** 문서에서 금지하면 사용자가 적을
 * 수 있는 글자를 우리가 줄이는 것인데, 줄여서 얻을 것이 없다.
 */
import { NO_THEME } from '@wirebound/renderer'
import { installCatalog, type PageDocument } from '@wirebound/schema'
import { act } from 'react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { exportBundle } from '../src/bundle/index'
import { mountExportDocument, type ExportMount } from '../src/browser/mount'
import { PAGE_DATA_ID, type ExportPageData } from '../src/page-data'

beforeAll(() => {
  installCatalog()
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

let mounted: ExportMount[] = []
afterEach(() => {
  const all = mounted
  mounted = []
  act(() => all.forEach((mount) => mount.unmount()))
  document.body.innerHTML = ''
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

/** 번들 페이지 한 장의 HTML. 런타임은 글자만 둔다 — 여기서 재는 것은 HTML 의 모양이다. */
function pageHtml(document_: PageDocument, title = 'ㄱ', lang?: string): string {
  const bundle = exportBundle({
    pages: [{ title, document: document_ }],
    runtimeJs: '/* runtime */',
    ...(lang === undefined ? {} : { lang }),
  })
  return String(bundle.files.find((file) => file.path === bundle.pagePaths[0])!.content)
}

/** 페이지 HTML 을 파서에 넣는다. */
function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

/**
 * **번들 런타임이 하는 그대로 목업을 짓는다** — 페이지 HTML 을 파서에 넣고, 페이지 JSON 을 읽어, 그 문서를 `mountExportDocument` 로
 * 그린다. 목업이 선 캔버스를 낸다.
 */
function mockup(document_: PageDocument): HTMLElement {
  const data = JSON.parse(parse(pageHtml(document_)).getElementById(PAGE_DATA_ID)!.textContent!) as ExportPageData
  const canvas = document.createElement('div')
  const status = document.createElement('div')
  document.body.append(canvas, status)
  act(() => {
    mounted.push(
      mountExportDocument(canvas, { document: data.document, theme: NO_THEME, tokens: {}, window, hrefs: {}, markers: [], status }),
    )
  })
  return canvas
}

/**
 * 페이지 JSON 앞의 마크업 — HTML 이 사용자 문자열을 싣는 자리(`<title>` · `<html lang>`)는 여기 있다. 제목은 페이지 JSON 에도 실리므로
 * (`ExportPageData.title`) 페이지 전체로 재면 JSON 쪽의 글자가 섞인다.
 */
function markup(html: string): string {
  const at = html.indexOf(`<script type="application/json" id="${PAGE_DATA_ID}"`)
  if (at === -1) throw new Error('페이지 JSON 을 못 찾았다')
  return html.slice(0, at)
}

/** HTML 의 두 자리. 문자열 하나를 받아 그 자리에 실은 페이지 HTML(페이지 JSON 앞)을 낸다. */
const HTML_SINKS = {
  '<title>': (value: string) => markup(pageHtml(EMPTY, value)),
  '<html lang>': (value: string) => markup(pageHtml(EMPTY, 'ㄱ', value)),
} as const

/** 목업의 두 자리. 문자열 하나를 받아 그 자리에서 읽은 값을 낸다(번들 런타임이 그린 DOM 에서). */
const MOCKUP_SINKS = {
  텍스트: (value: string) => mockup(inText(value)).querySelector('[data-wb-component="Text"]')!.textContent,
  '속성 값': (value: string) => mockup(inAttribute(value)).querySelector('[data-wb-component="Button"]')!.getAttribute('data-wb-variant'),
} as const

/** 페이지 JSON 에 실린 꼴. 문자열 하나를 받아 페이지 HTML 을 낸다. */
const DATA_SINKS = {
  텍스트: (value: string) => pageHtml(inText(value)),
  '속성 값': (value: string) => pageHtml(inAttribute(value)),
} as const

/**
 * **위 표를 그대로 옮긴 것이다.** 분모(문자 다섯 × 자리)를 손으로 든다 — 구현에서
 * 끌어오면 무엇을 안 바꾸게 돼도 기대값이 함께 바뀐다.
 */
const ESCAPES: [character: string, expected: string][] = [
  ['<', '&lt;'],
  ['>', '&gt;'],
  ['&', '&amp;'],
  ['"', '&quot;'],
  ["'", '&#x27;'],
]

const DATA_ESCAPES: [character: string, expected: string][] = [
  ['<', '\\u003c'],
  ['>', '>'],
  ['&', '&'],
  ['"', '\\"'],
  ["'", "'"],
]

describe('renderToStaticMarkup이 바꾸는 것', () => {
  for (const [place, render] of Object.entries(HTML_SINKS)) {
    it.each(ESCAPES)(`${place} — %s는 %s가 된다`, (character, expected) => {
      const html = render(`앞${character}뒤`)
      expect(html).toContain(`앞${expected}뒤`)
      expect(html).not.toContain(`앞${character}뒤`)
    })
  }
})

describe('문서의 문자열은 페이지 JSON 으로 가고 목업에 그대로 선다', () => {
  for (const [place, render] of Object.entries(DATA_SINKS)) {
    it.each(DATA_ESCAPES)(`페이지 JSON(${place}) — %s는 %s로 실린다`, (character, expected) => {
      expect(render(`앞${character}뒤`)).toContain(`앞${expected}뒤`)
    })
  }

  for (const [place, read] of Object.entries(MOCKUP_SINKS)) {
    it.each(ESCAPES)(`목업(${place}) — %s가 그대로 선다`, (character) => {
      expect(read(`앞${character}뒤`)).toBe(`앞${character}뒤`)
    })
  }
})

/**
 * **날 제어 문자를 소스에 적지 않는다.** 그것이 든 파일은 `grep`이 조용히 건너뛴다 —
 * census가 그것을 잰다(`apps/api/test/source-control-bytes.test.ts`).
 * `String.fromCharCode`로 만들면 소스 텍스트 어디에도 그 문자가 없다 — `db/nul-guard.ts`가
 * 같은 이유로 같은 방법을 쓴다.
 */
const NUL = String.fromCharCode(0x00)
const VERTICAL_TAB = String.fromCharCode(0x0b)
const LINE_SEPARATOR = String.fromCharCode(0x2028)
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029)

describe('제어 문자와 분리자를 그대로 실어 보낸다', () => {
  const RAW: [name: string, character: string][] = [
    ['NUL U+0000', NUL],
    ['수직 탭 U+000B', VERTICAL_TAB],
    ['줄 분리자 U+2028', LINE_SEPARATOR],
    ['문단 분리자 U+2029', PARAGRAPH_SEPARATOR],
  ]

  for (const [place, render] of Object.entries(HTML_SINKS)) {
    it.each(RAW)(`${place} — %s가 그대로 실린다`, (_name, character) => {
      expect(render(`앞${character}뒤`)).toContain(`앞${character}뒤`)
    })
  }

  for (const [place, read] of Object.entries(MOCKUP_SINKS)) {
    it.each(RAW)(`목업(${place}) — %s가 그대로 선다`, (_name, character) => {
      expect(read(`앞${character}뒤`)).toBe(`앞${character}뒤`)
    })
  }

  /**
   * **그래도 요소가 되지는 않는다** — 이 넷은 태그도 속성도 열지 못한다. 표의 *"안전은
   * 어디서 오나"*가 *"HTML에서 뜻이 없다"*인 근거가 이것이다. 페이지 HTML 의 스크립트는 번들이 싣는 것(데이터 · 런타임 · 부팅)뿐이다.
   */
  it.each(RAW)('%s를 넣어도 파서가 페이지를 그대로 판다', (_name, character) => {
    const parsed = parse(pageHtml(EMPTY, `앞${character}뒤`))
    expect(parsed.querySelectorAll('script')).toHaveLength(parse(pageHtml(EMPTY)).querySelectorAll('script').length)
    expect(parsed.getElementById(PAGE_DATA_ID)).not.toBeNull()
  })

  /**
   * **`JSON.stringify`가 그 둘을 이스케이프하지 않는다.** 같은 함수가 제어 문자는
   * 이스케이프하므로 빠뜨린 것이 아니라 규격이 그렇다.
   *
   * **그것이 위험하다는 뜻은 아니다** — ES2019 이후 그대로 두어도 리터럴이 안 깨진다
   * (`test/script-json.test.ts`가 파싱해서 잰다). 이 성질을 위험으로 읽고 그 둘만 막으면
   * 실제로 깨지는 `</script>`를 놓친다(위 머리말).
   */
  it('JSON.stringify가 분리자를 이스케이프하지 않는다', () => {
    expect(JSON.stringify(LINE_SEPARATOR)).toContain(LINE_SEPARATOR)
    expect(JSON.stringify(PARAGRAPH_SEPARATOR)).toContain(PARAGRAPH_SEPARATOR)
    // 견줌: 같은 함수가 제어 문자는 이스케이프한다. 즉 빠뜨린 것이 아니라 규격이 그렇다.
    expect(JSON.stringify(NUL)).toBe('"\\u0000"')
  })

  /**
   * **이 케이스가 드는 것은 하나다: exporter 가 NUL을 통과시킨다** — 페이지 JSON 에는 `\u0000` 으로 실리고(`JSON.stringify`) 목업에
   * 그대로 선다.
   *
   * *"저장 경계가 그것을 막는다"*는 여기서 재지 않는다 — 그 판정은 `apps/api`의 것이고
   * (`db/nul-guard.ts`), 그쪽 케이스가 자기 자리에서 잰다. 패키지가 앱을 볼 수 없으므로
   * 여기서 확인하려면 그 로직을 **베껴야** 하고, 베낀 검사는 진짜 구현과 안 움직인다.
   * 위 머리말이 그 귀속을 적는다.
   */
  it('exporter는 NUL을 통과시킨다 — 막는 것은 저장 경계의 일이다', () => {
    expect(DATA_SINKS['텍스트'](`앞${NUL}뒤`)).toContain('앞\\u0000뒤')
    expect(MOCKUP_SINKS['텍스트'](`앞${NUL}뒤`)).toBe(`앞${NUL}뒤`)
  })
})

describe('바꾸지 않는 것 — 그래서 안전이 다른 데서 온다', () => {
  it('백슬래시는 목업에 그대로다', () => {
    expect(MOCKUP_SINKS['텍스트']('앞\\뒤')).toBe('앞\\뒤')
  })

  /**
   * **`javascript:`를 React가 막지 않는다.** 막는 것은 SDK 기본 뷰 `Link`이고, 방법은
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
    const anchor = mockup(document_).querySelector('a[data-wb-component="Link"]')
    expect(anchor?.getAttribute('href')).toBe('#javascript:alert(1)')
  })
})

/**
 * **문자열이 아니라 결과를 본다.** `&lt;`가 나왔다는 것과 *"요소가 안 생긴다"*는 다른
 * 주장이고, 번들이 남에게 전달되는 산출물이므로 지켜야 하는 것은 뒤쪽이다. 페이지 HTML 은 파서에 넣고, 목업은 번들 런타임이 그리는
 * 진입으로 그린다.
 */
describe('넣은 것이 요소가 되지 않는다', () => {
  const PAYLOAD = '<script>alert(1)</script><img src=x onerror="alert(2)">'
  /** 값 없는 페이지의 스크립트 수 — 번들이 싣는 것(데이터 · 런타임 · 부팅)이다. */
  const baseline = (): number => parse(pageHtml(EMPTY)).querySelectorAll('script').length

  it.each([
    ['<title>', () => pageHtml(EMPTY, PAYLOAD)],
    ['<html lang>', () => pageHtml(EMPTY, 'ㄱ', PAYLOAD)],
    ['페이지 JSON(텍스트)', () => DATA_SINKS['텍스트'](PAYLOAD)],
    ['페이지 JSON(속성 값)', () => DATA_SINKS['속성 값'](PAYLOAD)],
  ] as const)('페이지 HTML — %s 자리', (_place, render) => {
    const parsed = parse(render())
    expect(parsed.querySelectorAll('script')).toHaveLength(baseline())
    expect(parsed.querySelectorAll('img')).toHaveLength(0)
    // 파서가 문서를 끝까지 판다 — 페이로드가 태그를 열어 뒤를 먹지 않았다는 뜻이다.
    expect(parsed.querySelector('.wb-export-canvas')).not.toBeNull()
  })

  it.each([
    ['텍스트', inText],
    ['속성 값', inAttribute],
  ] as const)('목업 — %s 자리', (_place, build) => {
    const canvas = mockup(build(PAYLOAD))
    expect(canvas.querySelectorAll('script')).toHaveLength(0)
    expect(canvas.querySelectorAll('img')).toHaveLength(0)
    expect(canvas.querySelector('[data-wb-component="Page"]')).not.toBeNull()
  })

  /** 속성을 닫고 새 속성을 여는 고전적 페이로드. */
  it('속성 탈출 시도가 속성 하나로 남는다', () => {
    const canvas = mockup(inAttribute('"><img src=x onerror=1>'))
    const button = canvas.querySelector('[data-wb-component="Button"]')

    expect(canvas.querySelectorAll('img')).toHaveLength(0)
    expect(button?.getAttribute('data-wb-variant')).toBe('"><img src=x onerror=1>')
    expect([...button!.attributes].map((attr) => attr.name).sort()).toEqual([
      'data-wb-component',
      'data-wb-id',
      'data-wb-structure',
      'data-wb-variant',
      'type',
    ])
  })

  /** `</` 로 여는 시도. 텍스트 자리에서 태그를 닫아 `<body>`를 끝내려는 부류다 — 페이지 JSON 에서는 `</script>` 를 흉내 낸다. */
  it('닫는 태그 흉내가 텍스트로 남는다', () => {
    const value = '</script></body></html><script>alert(1)</script>'
    const parsed = parse(DATA_SINKS['텍스트'](value))
    expect(parsed.querySelectorAll('script')).toHaveLength(baseline())
    expect(MOCKUP_SINKS['텍스트'](value)).toBe(value)
  })
})
