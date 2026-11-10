// @vitest-environment jsdom
/**
 * **번들의 공통코드** — 표가 있으면 페이지 데이터가 표를 싣고 런타임이 묶인 노드를 표의 이름으로 그린다. 뿌리의 `codes.html` 이 «공통코드» 장
 * (그룹마다 항목 표 + 쓰는 페이지)이고 좌측 트리가 그 장을 가리킨다. 표가 빈 프로젝트는 셋 다 없다. 실 Chrome 의 런타임(`boot`)이 표로 그리는지는
 * PPTX 의 화면 렌더 판(`apps/api/build-test/screen-chromium.test.ts` «공통코드»)이 잰다.
 */
import { NO_THEME } from '@wirebound/renderer'
import { indexCodes, installCatalog, type CodeTable } from '@wirebound/schema'
import { act } from 'react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { CODES_PATH, exportBundle, type BundlePage } from '../src/bundle/index'
import { mountExportDocument, type ExportMount } from '../src/browser/mount'
import { PAGE_DATA_ID, type ExportPageData } from '../src/page-data'
import { broadFixture, FIXTURE_CODES, SAMPLE_PAGE } from '../test-support/fixtures'

beforeAll(() => {
  installCatalog()
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

let mounted: ExportMount | null = null
afterEach(() => {
  const mount = mounted
  mounted = null
  if (mount !== null) act(() => mount.unmount())
  document.body.innerHTML = ''
})

const pages = (): BundlePage[] => [
  { title: '넓은 표본', document: broadFixture() },
  { title: '글', document: SAMPLE_PAGE },
]

function fileOf(codes: CodeTable | undefined, path: string): Document | null {
  const bundle = exportBundle({ pages: pages(), runtimeJs: '', ...(codes === undefined ? {} : { codes }) })
  const file = bundle.files.find((item) => item.path === path)
  return file === undefined ? null : new DOMParser().parseFromString(String(file.content), 'text/html')
}

const dataOf = (doc: Document): ExportPageData => JSON.parse(doc.getElementById(PAGE_DATA_ID)!.textContent!) as ExportPageData

/** 묶인 칩(`FIXTURE_CODES` 의 `MEMBER_KIND › SURVEY`)이 런타임에서 그린 글. */
function chipText(data: ExportPageData): string {
  const canvas = document.createElement('div')
  document.body.append(canvas)
  act(() => {
    mounted = mountExportDocument(canvas, {
      document: data.document,
      theme: NO_THEME,
      tokens: {},
      window,
      hrefs: {},
      markers: [],
      status: null,
      ...(data.codes === undefined ? {} : { codes: indexCodes(data.codes) }),
    })
  })
  const bound = [...canvas.querySelectorAll('[data-wb-component="Chip"]')].find((element) => element.textContent?.includes('설문'))
  if (bound === undefined) throw new Error('묶인 칩이 안 섰다')
  // 칩의 기본 뷰는 끝에 지우기 표지(«×»)를 단다 — 이름만 견준다.
  return (bound.textContent ?? '').replace(/×$/, '')
}

describe('번들의 공통코드', () => {
  it('표가 있으면 페이지 데이터가 표를 싣고, 묶인 칩이 표의 이름으로 선다', () => {
    const data = dataOf(fileOf(FIXTURE_CODES, 'pages/넓은-표본.html')!)
    expect(data.codes).toEqual(FIXTURE_CODES)
    expect(chipText(data)).toBe('설문 응답')
  })

  it('표가 없거나 비면 페이지 데이터에 codes 키가 없고, 묶인 칩은 대체 글로 선다', () => {
    for (const codes of [undefined, []]) {
      const data = dataOf(fileOf(codes, 'pages/넓은-표본.html')!)
      expect('codes' in data).toBe(false)
      expect(chipText(data)).toBe('설문')
    }
  })

  it('«공통코드» 장 — 그룹 · 항목 표(사용 안 함 포함) · 쓰는 페이지 링크와 노드 수', () => {
    const doc = fileOf(FIXTURE_CODES, CODES_PATH)!
    expect(doc.title).toBe('공통코드')
    const group = doc.querySelector('.wb-export-codes-group[aria-label="회원 구분"]')!
    expect(group.querySelector('h2')!.textContent).toBe('회원 구분 MEMBER_KIND')
    const rows = [...group.querySelectorAll('tbody tr')].map((row) => [...row.querySelectorAll('td')].map((cell) => cell.textContent))
    expect(rows).toEqual([
      ['SURVEY', '설문 응답', '사용'],
      ['OLD', '휴면', '사용 안 함'],
    ])
    // 링크는 번들이 퍼센트 인코딩해 싣는다(`bundleHref`).
    const usage = [...group.querySelectorAll('.wb-export-codes-usage li')].map((item) => ({
      text: item.textContent,
      href: item.querySelector('a')!.getAttribute('href'),
    }))
    expect(usage).toEqual([{ text: '넓은 표본 — 노드 1개', href: encodeURI('pages/넓은-표본.html') }])
    // 장의 좌측 트리도 페이지 줄을 갖고(이 파일에서 본 링크), «공통코드» 줄이 지금이다.
    const links = [...doc.querySelectorAll('.wb-export-nav-link')].map((link) => [
      link.textContent,
      link.getAttribute('href'),
      link.getAttribute('aria-current'),
    ])
    expect(links).toEqual([
      ['넓은 표본', encodeURI('pages/넓은-표본.html'), null],
      ['글', encodeURI('pages/글.html'), null],
      ['공통코드', 'codes.html', 'page'],
    ])
  })

  it('코멘트 칸 · 상호작용 탭이 묶인 노드를 표의 이름으로 부른다 — 표가 없으면 대체 글이다', () => {
    const page: BundlePage = {
      title: '이름',
      document: {
        version: 1,
        root: {
          id: 'n_root',
          type: 'Page',
          children: [
            {
              id: 'n_btn',
              type: 'Button',
              props: { label: '옛 이름' },
              code: { group: 'MEMBER_KIND', item: 'SURVEY' },
              marker: 1,
              interactions: [{ on: 'click', actions: [{ type: 'setVisible', target: 'n_btn', value: false }] }],
            },
          ],
        },
      },
      comments: [{ nodeId: 'n_btn', body: '확인' }],
    }
    const panel = (codes: CodeTable | undefined): string => {
      const bundle = exportBundle({ pages: [page], runtimeJs: '', ...(codes === undefined ? {} : { codes }) })
      const html = String(bundle.files.find((file) => file.path === 'index.html')!.content)
      // 페이지 데이터 JSON 은 문서의 대체 글을 품는다 — 우측 칸의 글만 읽는다.
      return new DOMParser().parseFromString(html, 'text/html').querySelector('.wb-export-panel')!.textContent!
    }
    const bound = panel(FIXTURE_CODES)
    expect(bound).toContain('① 설문 응답 버튼 클릭 시 ① 설문 응답 버튼이 숨겨집니다')
    expect(bound).not.toContain('옛 이름')
    expect(panel(undefined)).toContain('① 옛 이름 버튼 클릭 시 ① 옛 이름 버튼이 숨겨집니다')
  })

  it('페이지의 좌측 트리가 «공통코드» 장을 가리킨다 — 표가 빈 번들은 장 · 줄이 없다', () => {
    const nav = (doc: Document): (string | null)[][] =>
      [...doc.querySelectorAll('.wb-export-nav-link')].map((link) => [link.textContent, link.getAttribute('href')])
    expect(nav(fileOf(FIXTURE_CODES, 'pages/글.html')!).at(-1)).toEqual(['공통코드', '../codes.html'])
    expect(nav(fileOf(FIXTURE_CODES, 'index.html')!).at(-1)).toEqual(['공통코드', 'codes.html'])
    expect(fileOf([], CODES_PATH)).toBeNull()
    expect(nav(fileOf([], 'pages/글.html')!).map(([title]) => title)).toEqual(['넓은 표본', '글'])
  })
})
