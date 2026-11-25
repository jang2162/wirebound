// @vitest-environment jsdom
/**
 * **`exportBundle`이 낸 파일들.**
 *
 * `DOMParser`로 파서를 지나게 한다 — **글자로만 재면 브라우저가 그것을 무엇으로 읽는지는
 * 안 재진다.** `parity.test.tsx`가 같은 이유로 같은 길을 쓴다.
 *
 * 여기서 **안 재는 것**: 목업(브라우저가 그린다 — `runtime-bundle.test.ts` · `bundle-parity.test.tsx`) · 계산된 스타일
 * (시트를 안 건다) · 중복 비용(`bundle-size.test.ts`).
 */
import { installCatalog, type PageDocument } from '@wirebound/schema'
import { defaultViewsCss } from '@wirebound/theme-sdk'
import { beforeAll, describe, expect, it } from 'vitest'
import { exportBundle } from '../src/bundle/index'
import type { ExportPageData } from '../src/page-data'

beforeAll(() => {
  installCatalog()
})

/** 런타임 글자 자리 — 번들은 받은 글자를 그대로 싣는다(런타임 자체는 `build-test/runtime-dist.test.ts`). */
const RUNTIME = '/* runtime */'

const LIST_PAGE: PageDocument = {
  version: 1,
  root: {
    id: 'n_000000000001',
    type: 'Page',
    children: [
      {
        id: 'n_000000000002',
        type: 'Button',
        props: { label: '검색' },
        marker: 1,
        interactions: [
          {
            on: 'click',
            actions: [{ type: 'setProp', target: 'n_000000000003', prop: 'loading', value: true }],
          },
        ],
      },
      { id: 'n_000000000003', type: 'DataGrid', marker: 2 },
    ],
  },
}

const DETAIL_PAGE: PageDocument = {
  version: 1,
  root: {
    id: 'n_000000000011',
    type: 'Page',
    children: [{ id: 'n_000000000012', type: 'Card', props: { title: '회원' } }],
  },
}

function twoPages() {
  return exportBundle({
    pages: [
      {
        title: '회원 목록',
        document: LIST_PAGE,
        description: '등급으로 거른다',
        comments: [{ nodeId: 'n_000000000003', body: '기본 정렬은 가입일 역순' }],
      },
      { title: '회원 상세', document: DETAIL_PAGE },
    ],
    runtimeJs: RUNTIME,
  })
}

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

function fileAt(bundle: ReturnType<typeof exportBundle>, path: string): string {
  const found = bundle.files.find((file) => file.path === path)
  if (found === undefined) throw new Error(`번들에 없는 경로: ${path}`)
  if (typeof found.content !== 'string') throw new Error(`글자가 아닌 파일: ${path}`)
  return found.content
}

/** 페이지에 실린 JSON(`<script id="wb-export-page">`). */
function pageData(html: string): ExportPageData {
  const node = parse(html).getElementById('wb-export-page')
  if (node === null) throw new Error('페이지 JSON 이 없습니다')
  return JSON.parse(node.textContent ?? '') as ExportPageData
}

describe('exportBundle — 파일 트리', () => {
  it('설계서 「HTML 정적 번들」의 파일 트리를 낸다', () => {
    expect(twoPages().files.map((file) => file.path)).toEqual([
      'index.html',
      'pages/회원-목록.html',
      'pages/회원-상세.html',
      'assets/shell.css',
      'assets/views.css',
      'assets/runtime.js',
      'assets/nav.js',
    ])
  })

  it('pagePaths 가 페이지 순서의 번들 안 경로다', () => {
    expect(twoPages().pagePaths).toEqual(['pages/회원-목록.html', 'pages/회원-상세.html'])
  })

  it('받은 런타임 글자를 그대로 싣는다', () => {
    expect(fileAt(twoPages(), 'assets/runtime.js')).toBe(RUNTIME)
  })

  it('파일 시스템을 부르지 않고 값으로 낸다', () => {
    for (const file of twoPages().files) expect(typeof file.content).toBe('string')
  })

  it('같은 입력이 같은 번들을 낸다', () => {
    expect(twoPages().files).toEqual(twoPages().files)
  })

  /** 빈 번들은 받는 사람이 **푼 뒤에야** 비었다는 것을 안다. */
  it('페이지가 없으면 던진다 — 빈 번들을 내지 않는다', () => {
    expect(() => exportBundle({ pages: [], runtimeJs: RUNTIME })).toThrow('번들에 실을 페이지가 없습니다')
  })
})

describe('exportBundle — CSS', () => {
  it('기본 뷰 시트가 SDK 기본 뷰 CSS 그대로다', () => {
    expect(fileAt(twoPages(), 'assets/views.css')).toBe(defaultViewsCss())
  })

  /** 셸 CSS가 문서 시트에 섞이면 *"기본 뷰 → 테마 → 토큰"* 차례에 셸이 끼어든다. */
  it('셸 CSS가 기본 뷰 시트에 섞이지 않는다', () => {
    expect(fileAt(twoPages(), 'assets/views.css')).not.toContain('wb-export')
    expect(fileAt(twoPages(), 'assets/shell.css')).not.toContain('data-wb-')
  })
})

describe('exportBundle — <head>', () => {
  /**
   * 테마가 없는 번들의 머리는 *"정확히 이 둘이다"*(셸 · 기본 뷰)를 센다 — **개수까지 센다.** *"link가 있다"*만 재면 시트가 하나
   * 더 새어도 안 죽는다. 테마가 있는 판은 `export-theme` 쪽(api)과 `bundle-theme.test.ts` 가 센다.
   */
  it.each(['index.html', 'pages/회원-목록.html'])('%s의 head에 스타일시트 링크 둘뿐이다', (path) => {
    const head = parse(fileAt(twoPages(), path)).head
    expect([...head.querySelectorAll('link')].map((link) => link.getAttribute('rel'))).toEqual(['stylesheet', 'stylesheet'])
    expect(head.querySelectorAll('style')).toHaveLength(0)
    expect(head.querySelectorAll('script')).toHaveLength(0)
  })

  /** **셸이 먼저, 문서 시트가 나중이다** — 문서 시트끼리의 차례는 캔버스와 같다(기본 뷰 → 테마 → 토큰). */
  it('시트 순서가 셸 → 기본 뷰다', () => {
    const bundle = twoPages()
    expect([...parse(fileAt(bundle, 'index.html')).head.querySelectorAll('link')].map((link) => link.getAttribute('href'))).toEqual([
      'assets/shell.css',
      'assets/views.css',
    ])
    expect(
      [...parse(fileAt(bundle, 'pages/회원-목록.html')).head.querySelectorAll('link')].map((link) => link.getAttribute('href')),
    ).toEqual(['../assets/shell.css', '../assets/views.css'])
  })

  it('제목이 페이지 제목이다', () => {
    expect(parse(fileAt(twoPages(), 'pages/회원-상세.html')).title).toBe('회원 상세')
  })

  /**
   * **개수 · 정체 · 차례를 함께 센다.** *"스크립트가 있다"*만 재면 다섯째가 새어도 안 죽는다. 데이터는 **실행되지 않고**
   * (`application/json`), 런타임은 **자산을 가리키는 고전 스크립트**이며(`type="module"`이면 `file://`에서 통째로 죽는다),
   * 번들 한 벌의 내비(`assets/nav.js`)가 그 뒤에 서고, 끝의 인라인이 `boot()` 를 부른다. `defer` 가 없어야 차례대로 돈다 — 테마 번들이 런타임의 전역을 읽는다.
   */
  it.each(['index.html', 'pages/회원-목록.html', 'pages/회원-상세.html'])(
    '%s가 스크립트를 정확히 넷 낸다 — 데이터 · runtime.js · nav.js · boot',
    (path) => {
      const scripts = [...parse(fileAt(twoPages(), path)).querySelectorAll('script')]
      expect(
        scripts.map((script) => [
          script.getAttribute('type'),
          script.getAttribute('id'),
          script.getAttribute('src'),
          script.hasAttribute('defer') || script.hasAttribute('async'),
          script.hasAttribute('src') ? null : (script.textContent ?? '').slice(0, 30),
        ]),
      ).toEqual([
        ['application/json', 'wb-export-page', null, false, (scripts[0]?.textContent ?? '').slice(0, 30)],
        [null, null, path === 'index.html' ? 'assets/runtime.js' : '../assets/runtime.js', false, null],
        [null, null, path === 'index.html' ? 'assets/nav.js' : '../assets/nav.js', false, null],
        [null, null, null, false, '__wirebound_export__.boot()'],
      ])
    },
  )

  it('자산 파일에는 스크립트 태그가 없다', () => {
    for (const file of twoPages().files) {
      if (file.path.endsWith('.html')) continue
      expect(file.content, file.path).not.toContain('<script')
    }
  })

  /** 데이터가 스크립트를 끊지 않는다 — `scriptJson`이 든 규칙이다. */
  it('데이터가 <를 이스케이프해 실린다', () => {
    const bundle = exportBundle({
      pages: [{ title: '</script><img src=x>', document: LIST_PAGE, comments: [] }],
      runtimeJs: RUNTIME,
    })
    const html = fileAt(bundle, bundle.pagePaths[0]!)
    const data = parse(html).getElementById('wb-export-page')
    expect(data?.textContent).not.toContain('<')
    expect(pageData(html).title).toBe('</script><img src=x>')
    // 카나리아 — 데이터가 스크립트를 끊었으면 이 요소가 선다.
    expect(parse(html).querySelectorAll('img')).toHaveLength(0)
  })
})

describe('exportBundle — 페이지 JSON', () => {
  it('문서 · 제목 · 타겟 · 테마 없음 · 마커를 싣는다', () => {
    const data = pageData(fileAt(twoPages(), 'pages/회원-목록.html'))
    expect(data).toEqual({
      document: LIST_PAGE,
      title: '회원 목록',
      // 이 번들은 페이지 id 를 안 줬다 — 틀의 내비는 «트리에 없는 페이지» 판이다.
      pageId: null,
      pageTitle: '회원 목록',
      path: 'pages/회원-목록.html',
      target: null,
      themeRef: null,
      manifest: null,
      tokens: {},
      hrefs: {},
      // 코멘트 탭의 줄과 같은 출처 — 번호가 있는 줄만(고아 마커 ① 포함).
      markers: [
        { nodeId: 'n_000000000002', marker: '1' },
        { nodeId: 'n_000000000003', marker: '2' },
      ],
    })
  })

  /**
   * **이 문서가 겨누는 타겟만 싣고, 자리마다 다른 상대 경로다.** 하나면 링크 · 둘 이상이면 `null` · 없으면 키가 없다 — 런타임이
   * 셋을 다른 말로 가른다(`runtime-bundle.test.ts` «못 한 것을 조용히 넘기지 않는다»).
   */
  it('hrefs 가 겨누는 타겟만 · 이 파일에서 본 경로로 싣는다', () => {
    const go = (target: string) => ({ on: 'click' as const, actions: [{ type: 'navigate' as const, target }] })
    const from: PageDocument = {
      version: 1,
      root: {
        id: 'n_a',
        type: 'Page',
        children: [
          { id: 'n_1', type: 'Button', props: { label: '하나' }, interactions: [go('page:상세')] },
          { id: 'n_2', type: 'Button', props: { label: '둘' }, interactions: [go('page:겹침')] },
          { id: 'n_3', type: 'Button', props: { label: '없음' }, interactions: [go('page:없음')] },
        ],
      },
    }
    const bundle = exportBundle({
      pages: [
        { title: '목록', document: from, target: 'page:목록' },
        { title: '상세', document: DETAIL_PAGE, target: 'page:상세' },
        { title: '겹침 가', document: DETAIL_PAGE, target: 'page:겹침' },
        { title: '겹침 나', document: DETAIL_PAGE, target: 'page:겹침' },
      ],
      runtimeJs: RUNTIME,
    })
    const expected = (prefix: string) => ({ 'page:상세': `${prefix}%EC%83%81%EC%84%B8.html`, 'page:겹침': null })
    expect(pageData(fileAt(bundle, 'index.html')).hrefs).toEqual(expected('pages/'))
    expect(pageData(fileAt(bundle, 'pages/목록.html')).hrefs).toEqual(expected(''))
    expect(pageData(fileAt(bundle, 'pages/목록.html')).target).toBe('page:목록')
  })
})

describe('exportBundle — 목업 자리는 비어 있다', () => {
  /** **목업은 브라우저가 그린다** — 여기서 문서 노드가 하나라도 서면 서버가 목업을 그린 것이다(spec 「내보내기와 PPTX」). */
  it.each(['index.html', 'pages/회원-목록.html', 'pages/회원-상세.html'])('%s에 문서 노드가 없다', (path) => {
    expect(parse(fileAt(twoPages(), path)).querySelectorAll('[data-wb-id]')).toHaveLength(0)
  })

  /** 목업 자리가 셸의 어느 상자 안에 서는지 — 런타임이 채우고 마커의 기준이 되는 자리다. */
  it('목업 자리가 셸 안에 비어 있고 스크립트가 없을 때의 한 줄이 곁에 있다', () => {
    const page = parse(fileAt(twoPages(), 'pages/회원-목록.html'))
    const canvas = page.querySelector('.wb-export-canvas')!
    expect(canvas.childNodes).toHaveLength(0)
    const chain: string[] = []
    for (let node = canvas.parentElement; node !== null; node = node.parentElement) {
      chain.push(node.tagName.toLowerCase() + (node.className === '' ? '' : `.${node.className}`))
    }
    expect(chain).toEqual(['main.wb-export-mockup', 'div.wb-export', 'body', 'html'])
    // DOMParser 는 스크립트가 꺼진 문서라 noscript 안을 마크업으로 읽는다.
    expect(page.querySelector('main.wb-export-mockup noscript')?.textContent).toBe('이 설계서의 화면은 자바스크립트로 그립니다')
  })
})

describe('exportBundle — 좌측 트리', () => {
  it('index.html이 첫 페이지를 같은 셸에 담는다 — 리디렉트가 아니다', () => {
    const index = fileAt(twoPages(), 'index.html')
    expect(index).not.toContain('http-equiv')
    expect(pageData(index).document.root.id).toBe('n_000000000001')
  })

  /**
   * **페이지 파일마다 그 페이지의 문서가 실려 있다.** 자리마다 안 보면 싣는 문서를 `pages[index]`에서 `pages[0]`으로 바꿔도
   * 아무것도 안 죽는다.
   *
   * **세는 단위를 HTML 파일 전부로 못박는다** — 자리마다 어느 문서의 뿌리인지를 한 목록으로
   * 견주므로 파일이 빠지거나 늘어도, 자리가 섞여도 죽는다.
   */
  it('HTML 파일마다 그 페이지의 문서가 실린다', () => {
    expect(
      twoPages()
        .files.filter((file) => file.path.endsWith('.html'))
        .map((file) => [file.path, pageData(file.content as string).document.root.id]),
    ).toEqual([
      ['index.html', 'n_000000000001'],
      ['pages/회원-목록.html', 'n_000000000001'],
      ['pages/회원-상세.html', 'n_000000000011'],
    ])
  })

  it('index.html의 링크가 pages/ 아래를 가리킨다', () => {
    const links = [...parse(fileAt(twoPages(), 'index.html')).querySelectorAll('.wb-export-nav-link')]
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      'pages/%ED%9A%8C%EC%9B%90-%EB%AA%A9%EB%A1%9D.html',
      'pages/%ED%9A%8C%EC%9B%90-%EC%83%81%EC%84%B8.html',
    ])
  })

  it('페이지끼리는 이름만으로 오간다', () => {
    const links = [...parse(fileAt(twoPages(), 'pages/회원-목록.html')).querySelectorAll('.wb-export-nav-link')]
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '%ED%9A%8C%EC%9B%90-%EB%AA%A9%EB%A1%9D.html',
      '%ED%9A%8C%EC%9B%90-%EC%83%81%EC%84%B8.html',
    ])
    expect(links.map((link) => link.textContent)).toEqual(['회원 목록', '회원 상세'])
  })

  it('보고 있는 페이지만 aria-current를 든다', () => {
    const links = [...parse(fileAt(twoPages(), 'pages/회원-상세.html')).querySelectorAll('.wb-export-nav-link')]
    expect(links.map((link) => link.getAttribute('aria-current'))).toEqual([null, 'page'])
  })
})

describe('exportBundle — 우측 탭 셋', () => {
  function panel(html: string): Element {
    const found = parse(html).querySelector('.wb-export-panel')
    if (found === null) throw new Error('우측 패널이 없습니다')
    return found
  }

  it('설계서 「설계서 화면 구조」의 뷰 모드와 같은 셋이다', () => {
    const labels = [...panel(fileAt(twoPages(), 'index.html')).querySelectorAll('.wb-export-tab')]
    expect(labels.map((label) => label.textContent)).toEqual(['페이지 정보', '코멘트', '상호작용'])
  })

  it('라디오 셋이 한 이름을 나누고 첫째가 켜져 있다', () => {
    const radios = [...panel(fileAt(twoPages(), 'index.html')).querySelectorAll('input[type="radio"]')]
    expect(radios.map((radio) => radio.getAttribute('name'))).toEqual(['wb-export-tab', 'wb-export-tab', 'wb-export-tab'])
    expect(radios.map((radio) => radio.hasAttribute('checked'))).toEqual([true, false, false])
  })

  /** 라벨의 `for`와 본문의 id가 어긋나면 시트의 `~` 규칙이 아무것도 안 켠다. */
  it('라벨과 본문이 라디오 id로 이어져 있다', () => {
    const box = panel(fileAt(twoPages(), 'index.html'))
    expect([...box.querySelectorAll('.wb-export-tab')].map((label) => label.getAttribute('for'))).toEqual([
      'wb-export-tab-description',
      'wb-export-tab-comments',
      'wb-export-tab-interactions',
    ])
    expect([...box.querySelectorAll('.wb-export-tabpanel')].map((section) => section.id)).toEqual([
      'wb-export-panel-description',
      'wb-export-panel-comments',
      'wb-export-panel-interactions',
    ])
  })

  it('페이지 설명을 그리고, 없으면 없다고 말한다', () => {
    expect(parse(fileAt(twoPages(), 'pages/회원-목록.html')).querySelector('.wb-export-description')?.textContent).toBe('등급으로 거른다')
    expect(parse(fileAt(twoPages(), 'pages/회원-상세.html')).querySelector('#wb-export-panel-description')?.textContent).toBe(
      '페이지 설명이 없습니다',
    )
  })
})

describe('exportBundle — 코멘트 탭', () => {
  function entries(path: string): Element[] {
    return [...parse(fileAt(twoPages(), path)).querySelectorAll('#wb-export-panel-comments .wb-export-entry')]
  }

  it('코멘트와 고아 마커를 문서 순서로 든다', () => {
    const lines = entries('pages/회원-목록.html')
    expect(lines.map((line) => line.getAttribute('data-wb-marker-for'))).toEqual(['n_000000000002', 'n_000000000003'])
    expect(lines.map((line) => line.getAttribute('data-wb-marker'))).toEqual(['1', '2'])
  })

  it('코멘트가 없는 번호를 그 사실로 말한다', () => {
    expect(entries('pages/회원-목록.html')[0]?.textContent).toContain('코멘트가 달려 있지 않습니다')
  })

  it('코멘트 본문을 그린다', () => {
    expect(entries('pages/회원-목록.html')[1]?.textContent).toContain('기본 정렬은 가입일 역순')
  })

  /**
   * **작성자·시각이 안 오면 그 줄을 안 그린다 — 그린 것에서 잰다.** 값만 재면
   * (`authorName === null`) 셸이 그 `null`로 **빈 줄을 그려도** 안 죽는다.
   */
  it('작성자·시각이 안 오면 그 줄을 그리지 않는다', () => {
    const line = entries('pages/회원-목록.html')[1]!
    expect(line.querySelectorAll('.wb-export-entry-meta')).toHaveLength(0)
  })

  it('작성자가 오면 그 줄을 그린다', () => {
    const bundle = exportBundle({
      pages: [
        {
          title: '회원 목록',
          document: LIST_PAGE,
          comments: [{ nodeId: 'n_000000000003', body: '본문', authorName: '장병현', createdAt: '2026-08-14' }],
        },
      ],
      runtimeJs: RUNTIME,
    })
    const line = [...parse(fileAt(bundle, 'pages/회원-목록.html')).querySelectorAll('#wb-export-panel-comments .wb-export-entry')][1]!
    const meta = [...line.querySelectorAll('.wb-export-entry-meta')]
    expect(meta.map((element) => element.textContent)).toEqual(['장병현 · 2026-08-14'])
  })

  it('코멘트도 마커도 없으면 없다고 말한다', () => {
    expect(parse(fileAt(twoPages(), 'pages/회원-상세.html')).querySelector('#wb-export-panel-comments')?.textContent).toBe(
      '코멘트가 없습니다',
    )
  })
})

describe('exportBundle — 상호작용 탭', () => {
  it('describeInteraction의 문장을 그린다', () => {
    const lines = [...parse(fileAt(twoPages(), 'pages/회원-목록.html')).querySelectorAll('#wb-export-panel-interactions .wb-export-entry')]
    expect(lines).toHaveLength(1)
    expect(lines[0]?.getAttribute('data-wb-interaction-for')).toBe('n_000000000002')
    expect(lines[0]?.textContent).toBe('① 검색 버튼 클릭 시 ② 그리드가 로딩 상태로 바뀝니다')
  })

  it('상호작용이 없으면 없다고 말한다', () => {
    expect(parse(fileAt(twoPages(), 'pages/회원-상세.html')).querySelector('#wb-export-panel-interactions')?.textContent).toBe(
      '상호작용이 없습니다',
    )
  })
})

describe('exportBundle — errors를 삼키지 않는다', () => {
  const BROKEN: PageDocument = {
    version: 1,
    root: {
      id: 'n_000000000021',
      type: 'Page',
      children: [{ id: 'n_000000000022', type: '없는타입' }],
    },
  }

  it('그리지 못한 노드를 페이지 이름과 함께 낸다', () => {
    const bundle = exportBundle({
      pages: [
        { title: '멀쩡', document: DETAIL_PAGE },
        { title: '깨진 문서', document: BROKEN },
      ],
      runtimeJs: RUNTIME,
    })
    expect(bundle.errors).toEqual([
      {
        path: 'pages/깨진-문서.html',
        title: '깨진 문서',
        error: {
          nodeId: 'n_000000000022',
          type: '없는타입',
          message: '알 수 없는 컴포넌트 타입: 없는타입',
        },
      },
    ])
  })

  /** `index.html`이 첫 페이지를 다시 담지만 **세는 것은 한 번이다.** */
  it('index.html이 담은 페이지의 오류를 두 번 세지 않는다', () => {
    const bundle = exportBundle({ pages: [{ title: '깨진 문서', document: BROKEN }], runtimeJs: RUNTIME })
    expect(bundle.errors).toHaveLength(1)
  })

  it('오류가 없으면 빈 목록이다', () => {
    expect(twoPages().errors).toEqual([])
  })

  /**
   * **그릴 수 있는 문서면 번들이 나온다.** 노드가 아닌 자식은 렌더러가 폴백으로 그리고
   * `errors`로 이름 붙이는데, 문장화(`listInteractionSentences` → `walkNodes`)는 노드가
   * 객체라고 믿고 거기서 던진다. 그것 때문에 **그린 페이지가 통째로 사라지면**
   * *"errors를 삼키지 않는다"*가 지키려던 것이 반대로 뒤집힌다.
   */
  it('노드가 아닌 자식이 있어도 번들이 나온다 — 그 노드는 errors가 이름을 든다', () => {
    const withNull: PageDocument = {
      version: 1,
      root: {
        id: 'n_000000000031',
        type: 'Page',
        children: [null as unknown as never, { id: 'n_000000000032', type: 'Text' }],
      },
    }
    const bundle = exportBundle({ pages: [{ title: '노드 아님', document: withNull }], runtimeJs: RUNTIME })
    expect(bundle.errors.map((item) => item.error.message)).toEqual(['노드가 객체가 아닙니다: null'])
    expect(parse(fileAt(bundle, 'pages/노드-아님.html')).querySelector('#wb-export-panel-interactions')?.textContent).toBe(
      '상호작용이 없습니다',
    )
  })
})
