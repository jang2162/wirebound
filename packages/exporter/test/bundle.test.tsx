// @vitest-environment jsdom
/**
 * **`exportBundle`이 낸 파일들**(T3 · D1·D2·D4·D6·D9).
 *
 * `DOMParser`로 파서를 지나게 한다 — **글자로만 재면 브라우저가 그것을 무엇으로 읽는지는
 * 안 재진다.** `parity.test.tsx`가 같은 이유로 같은 길을 쓴다.
 *
 * 여기서 **안 재는 것**: 캔버스와의 견주기(`bundle-parity.test.tsx`) · 계산된 스타일
 * (시트를 안 건다) · 중복 비용(`bundle-size.test.ts`).
 */
import { installStructures, structureBaseCss } from '@wirebound/renderer'
import { installCatalog, type PageDocument } from '@wirebound/schema'
import { compileTheme, resolveTheme, systemTheme, THEME_ISSUE_SEVERITY } from '@wirebound/themes'
import type { ResolvedTheme } from '@wirebound/themes'
import { beforeAll, describe, expect, it } from 'vitest'
import { exportBundle } from '../src/bundle/index'

/**
 * **테마 해석이 카탈로그를 본다** — 테마의 패턴이 컴포넌트 타입을 가리키므로 설치 없이
 * `resolveTheme`을 부르면 `bad-pattern-node` error가 쏟아진다. `exportBundle`이 스스로
 * 설치하므로 순서에 따라 통과하기도 하는데(먼저 부른 케이스가 설치해 준다), 그 순서에
 * 기대면 파일 하나를 따로 돌릴 때 결과가 달라진다.
 */
beforeAll(() => {
  installCatalog()
  installStructures()
})

function resolved(id: string): ResolvedTheme {
  const { theme, issues } = resolveTheme(systemTheme(id)!)
  expect(issues.filter((issue) => THEME_ISSUE_SEVERITY[issue.code] === 'error')).toEqual([])
  return theme!
}

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
            actions: [
              { type: 'setProp', target: 'n_000000000003', prop: 'loading', value: true },
            ],
          },
        ],
      },
      { id: 'n_000000000003', type: 'List', marker: 2 },
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
    theme: resolved('portal'),
  })
}

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

function fileAt(bundle: ReturnType<typeof exportBundle>, path: string): string {
  const found = bundle.files.find((file) => file.path === path)
  if (found === undefined) throw new Error(`번들에 없는 경로: ${path}`)
  return found.content
}

/** 번들의 페이지에서 문서 뿌리. 셸의 상자들은 `data-wb-id`를 달지 않는다. */
function documentRoot(html: string): Element {
  const root = parse(html).querySelector('[data-wb-id]')
  if (root === null) throw new Error('페이지에 문서가 없습니다')
  return root
}

describe('exportBundle — 파일 트리 (D1 · §11.3)', () => {
  it('§11.3의 파일 트리를 낸다', () => {
    expect(twoPages().files.map((file) => file.path)).toEqual([
      'index.html',
      'pages/회원-목록.html',
      'pages/회원-상세.html',
      'assets/shell.css',
      'assets/theme.css',
    ])
  })

  it('파일 시스템을 부르지 않고 값으로 낸다', () => {
    for (const file of twoPages().files) expect(typeof file.content).toBe('string')
  })

  it('같은 입력이 같은 번들을 낸다', () => {
    expect(twoPages().files).toEqual(twoPages().files)
  })

  /** 빈 번들은 받는 사람이 **푼 뒤에야** 비었다는 것을 안다. */
  it('페이지가 없으면 던진다 — 빈 번들을 내지 않는다', () => {
    expect(() => exportBundle({ pages: [] })).toThrow('번들에 실을 페이지가 없습니다')
  })
})

describe('exportBundle — CSS (D6 · P8-1 이월 §5)', () => {
  it('테마 시트가 exportPage의 css와 같은 한 장이다', () => {
    const theme = resolved('portal')
    expect(fileAt(twoPages(), 'assets/theme.css')).toBe(
      `${structureBaseCss()}\n${compileTheme(theme)}`,
    )
  })

  it('테마가 없으면 구조 기본 CSS 그대로다', () => {
    const bundle = exportBundle({ pages: [{ title: 'ㄱ', document: DETAIL_PAGE }] })
    expect(fileAt(bundle, 'assets/theme.css')).toBe(structureBaseCss())
  })

  /** 셸 CSS가 테마 CSS에 섞이면 *"구조 기본 → 테마"* 순서에 셸이 끼어든다. */
  it('셸 CSS가 테마 시트에 섞이지 않는다', () => {
    expect(fileAt(twoPages(), 'assets/theme.css')).not.toContain('wb-export')
    expect(fileAt(twoPages(), 'assets/shell.css')).not.toContain('data-wb-')
  })
})

describe('exportBundle — <head> (D6 · D8)', () => {
  /**
   * **P8-1은 `<head>`에 `style`·`script`·`link`가 0개인 것을 지켰다.** 셸이 시트를 걸므로
   * 그 명제가 여기서 *"정확히 이 둘이다"*로 바뀐다 — **개수까지 센다.** 0을 세지 않고
   * *"link가 있다"*만 재면 시트가 하나 더 새어도 안 죽는다.
   */
  it.each(['index.html', 'pages/회원-목록.html'])('%s의 head에 스타일시트 링크 둘뿐이다', (path) => {
    const head = parse(fileAt(twoPages(), path)).head
    expect([...head.querySelectorAll('link')].map((link) => link.getAttribute('rel'))).toEqual([
      'stylesheet',
      'stylesheet',
    ])
    expect(head.querySelectorAll('style')).toHaveLength(0)
    expect(head.querySelectorAll('script')).toHaveLength(0)
  })

  /** **셸이 먼저, 테마가 나중이다** — 그 순서가 곧 *"테마가 이긴다"*이다. */
  it('시트 순서가 셸 → 테마다', () => {
    const bundle = twoPages()
    expect(
      [...parse(fileAt(bundle, 'index.html')).head.querySelectorAll('link')].map((link) =>
        link.getAttribute('href'),
      ),
    ).toEqual(['assets/shell.css', 'assets/theme.css'])
    expect(
      [...parse(fileAt(bundle, 'pages/회원-목록.html')).head.querySelectorAll('link')].map((link) =>
        link.getAttribute('href'),
      ),
    ).toEqual(['../assets/shell.css', '../assets/theme.css'])
  })

  it('제목이 페이지 제목이다', () => {
    expect(parse(fileAt(twoPages(), 'pages/회원-상세.html')).title).toBe('회원 상세')
  })

  it('스크립트를 하나도 싣지 않는다 — runtime.js는 P8-3이다', () => {
    for (const file of twoPages().files) expect(file.content).not.toContain('<script')
  })
})

describe('exportBundle — 셸이 문서를 감싼다 (D8)', () => {
  /**
   * **P8-1은 *"문서 뿌리를 아무것도 감싸지 않는다"*를 지켰다.** 번들에서는 감싼다. 명제를
   * 지우지 않고 **정확히 무엇이 감싸는지**로 바꾼다 — 그러지 않으면 그 축이 사라진다.
   */
  it.each(['index.html', 'pages/회원-목록.html'])('%s에서 감싸개가 정확히 셋이다', (path) => {
    const root = documentRoot(fileAt(twoPages(), path))
    const chain: string[] = []
    for (let node = root.parentElement; node !== null; node = node.parentElement) {
      chain.push(node.tagName.toLowerCase() + (node.className === '' ? '' : `.${node.className}`))
    }
    expect(chain).toEqual([
      'div.wb-export-canvas',
      'main.wb-export-mockup',
      'div.wb-export',
      'body',
      'html',
    ])
  })

  /** 셸의 어휘가 문서 **안으로** 들어오면 견주기가 깨진다. 여기가 먼저 이름으로 말한다. */
  it('문서 뿌리 아래에 셸의 어휘가 없다', () => {
    const root = documentRoot(fileAt(twoPages(), 'pages/회원-목록.html'))
    expect(root.querySelectorAll('[class*="wb-export"]')).toHaveLength(0)
    const attributes = [...root.querySelectorAll('*')].flatMap((element) =>
      [...element.attributes].map((attribute) => attribute.name),
    )
    expect(attributes.filter((name) => name.startsWith('data-wb-marker'))).toEqual([])
  })
})

describe('exportBundle — 좌측 트리 (D2·D3)', () => {
  it('index.html이 첫 페이지를 같은 셸에 담는다 — 리디렉트가 아니다', () => {
    const index = fileAt(twoPages(), 'index.html')
    expect(index).not.toContain('http-equiv')
    expect(documentRoot(index).getAttribute('data-wb-id')).toBe('n_000000000001')
  })

  it('index.html의 링크가 pages/ 아래를 가리킨다', () => {
    const links = [...parse(fileAt(twoPages(), 'index.html')).querySelectorAll('.wb-export-nav-link')]
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      'pages/%ED%9A%8C%EC%9B%90-%EB%AA%A9%EB%A1%9D.html',
      'pages/%ED%9A%8C%EC%9B%90-%EC%83%81%EC%84%B8.html',
    ])
  })

  it('페이지끼리는 이름만으로 오간다', () => {
    const links = [
      ...parse(fileAt(twoPages(), 'pages/회원-목록.html')).querySelectorAll('.wb-export-nav-link'),
    ]
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '%ED%9A%8C%EC%9B%90-%EB%AA%A9%EB%A1%9D.html',
      '%ED%9A%8C%EC%9B%90-%EC%83%81%EC%84%B8.html',
    ])
    expect(links.map((link) => link.textContent)).toEqual(['회원 목록', '회원 상세'])
  })

  it('보고 있는 페이지만 aria-current를 든다', () => {
    const links = [
      ...parse(fileAt(twoPages(), 'pages/회원-상세.html')).querySelectorAll('.wb-export-nav-link'),
    ]
    expect(links.map((link) => link.getAttribute('aria-current'))).toEqual([null, 'page'])
  })
})

describe('exportBundle — 우측 탭 셋 (D3 · 재라 #2)', () => {
  function panel(html: string): Element {
    const found = parse(html).querySelector('.wb-export-panel')
    if (found === null) throw new Error('우측 패널이 없습니다')
    return found
  }

  it('§9의 뷰 모드와 같은 셋이다', () => {
    const labels = [...panel(fileAt(twoPages(), 'index.html')).querySelectorAll('.wb-export-tab')]
    expect(labels.map((label) => label.textContent)).toEqual([
      '페이지 설명',
      '코멘트',
      '상호작용',
    ])
  })

  it('라디오 셋이 한 이름을 나누고 첫째가 켜져 있다', () => {
    const radios = [
      ...panel(fileAt(twoPages(), 'index.html')).querySelectorAll('input[type="radio"]'),
    ]
    expect(radios.map((radio) => radio.getAttribute('name'))).toEqual([
      'wb-export-tab',
      'wb-export-tab',
      'wb-export-tab',
    ])
    expect(radios.map((radio) => radio.hasAttribute('checked'))).toEqual([true, false, false])
  })

  /** 라벨의 `for`와 본문의 id가 어긋나면 시트의 `~` 규칙이 아무것도 안 켠다. */
  it('라벨과 본문이 라디오 id로 이어져 있다', () => {
    const box = panel(fileAt(twoPages(), 'index.html'))
    expect([...box.querySelectorAll('.wb-export-tab')].map((label) => label.getAttribute('for'))).toEqual(
      ['wb-export-tab-description', 'wb-export-tab-comments', 'wb-export-tab-interactions'],
    )
    expect([...box.querySelectorAll('.wb-export-tabpanel')].map((section) => section.id)).toEqual([
      'wb-export-panel-description',
      'wb-export-panel-comments',
      'wb-export-panel-interactions',
    ])
  })

  it('페이지 설명을 그리고, 없으면 없다고 말한다', () => {
    expect(
      parse(fileAt(twoPages(), 'pages/회원-목록.html')).querySelector('.wb-export-description')
        ?.textContent,
    ).toBe('등급으로 거른다')
    expect(
      parse(fileAt(twoPages(), 'pages/회원-상세.html')).querySelector('#wb-export-panel-description')
        ?.textContent,
    ).toBe('페이지 설명이 없습니다')
  })
})

describe('exportBundle — 코멘트 탭 (D4)', () => {
  function entries(path: string): Element[] {
    return [
      ...parse(fileAt(twoPages(), path)).querySelectorAll('#wb-export-panel-comments .wb-export-entry'),
    ]
  }

  it('코멘트와 고아 마커를 문서 순서로 든다', () => {
    const lines = entries('pages/회원-목록.html')
    expect(lines.map((line) => line.getAttribute('data-wb-marker-for'))).toEqual([
      'n_000000000002',
      'n_000000000003',
    ])
    expect(lines.map((line) => line.getAttribute('data-wb-marker'))).toEqual(['1', '2'])
  })

  it('코멘트가 없는 번호를 그 사실로 말한다', () => {
    expect(entries('pages/회원-목록.html')[0]?.textContent).toContain('코멘트가 달려 있지 않습니다')
  })

  it('코멘트 본문을 그린다', () => {
    expect(entries('pages/회원-목록.html')[1]?.textContent).toContain('기본 정렬은 가입일 역순')
  })

  /**
   * **D4의 *"안 오면 안 그린다"*를 그린 것에서 잰다.** 값만 재면(`authorName === null`)
   * 셸이 그 `null`로 **빈 줄을 그려도** 안 죽는다 — 실제로 변이 *"작성자가 없어도 자리를
   * 그린다"*가 사망 0이었고, 이 케이스가 그 자리를 메운다.
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
          comments: [
            { nodeId: 'n_000000000003', body: '본문', authorName: '장병현', createdAt: '2026-08-14' },
          ],
        },
      ],
    })
    const line = [
      ...parse(fileAt(bundle, 'pages/회원-목록.html')).querySelectorAll(
        '#wb-export-panel-comments .wb-export-entry',
      ),
    ][1]!
    const meta = [...line.querySelectorAll('.wb-export-entry-meta')]
    expect(meta.map((element) => element.textContent)).toEqual(['장병현 · 2026-08-14'])
  })

  it('코멘트도 마커도 없으면 없다고 말한다', () => {
    expect(
      parse(fileAt(twoPages(), 'pages/회원-상세.html')).querySelector('#wb-export-panel-comments')
        ?.textContent,
    ).toBe('코멘트가 없습니다')
  })
})

describe('exportBundle — 상호작용 탭 (D3 · 재라 #1)', () => {
  it('describeInteraction의 문장을 그린다', () => {
    const lines = [
      ...parse(fileAt(twoPages(), 'pages/회원-목록.html')).querySelectorAll(
        '#wb-export-panel-interactions .wb-export-entry',
      ),
    ]
    expect(lines).toHaveLength(1)
    expect(lines[0]?.getAttribute('data-wb-interaction-for')).toBe('n_000000000002')
    expect(lines[0]?.textContent).toBe('① 검색 버튼 클릭 시 ② 목록이 로딩 상태로 바뀝니다')
  })

  it('상호작용이 없으면 없다고 말한다', () => {
    expect(
      parse(fileAt(twoPages(), 'pages/회원-상세.html')).querySelector(
        '#wb-export-panel-interactions',
      )?.textContent,
    ).toBe('상호작용이 없습니다')
  })
})

describe('exportBundle — errors를 삼키지 않는다 (D9)', () => {
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

  /** `index.html`이 첫 페이지를 다시 담지만 **그리는 것은 한 번이다.** */
  it('index.html이 담은 페이지의 오류를 두 번 세지 않는다', () => {
    const bundle = exportBundle({ pages: [{ title: '깨진 문서', document: BROKEN }] })
    expect(bundle.errors).toHaveLength(1)
  })

  it('오류가 없으면 빈 목록이다', () => {
    expect(twoPages().errors).toEqual([])
  })

  /**
   * **그릴 수 있는 문서면 번들이 나온다.** 노드가 아닌 자식은 렌더 경로가 폴백으로 그리고
   * `errors`로 이름 붙이는데, 문장화(`listInteractionSentences` → `walkNodes`)는 노드가
   * 객체라고 믿고 거기서 던진다. 그것 때문에 **그린 페이지가 통째로 사라지면** D9가 지키려던
   * 것이 반대로 뒤집힌다.
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
    const bundle = exportBundle({ pages: [{ title: '노드 아님', document: withNull }] })
    expect(bundle.errors.map((item) => item.error.message)).toEqual([
      '노드가 객체가 아닙니다: null',
    ])
    expect(
      parse(fileAt(bundle, 'pages/노드-아님.html')).querySelector('#wb-export-panel-interactions')
        ?.textContent,
    ).toBe('상호작용이 없습니다')
  })
})
