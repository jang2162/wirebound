// @vitest-environment jsdom
/**
 * **번들과 PPTX가 같은 설계서를 같게 말하는가.**
 *
 * 설계서 「자동 문장화」가 *"우측 패널, HTML 번들, PPTX 모두 이 문장을 싣는다"*고 적었다. 두 산출물이 같은
 * 페이지에서 **다른 글자**를 내면 그 문장이 거짓이 되고, 설계서를 나란히 받은 사람이 어느
 * 쪽을 믿을지 모른다.
 *
 * ---
 *
 * # 소스를 세는 것과 값을 견주는 것은 다른 물음이다
 *
 * `duplicate-census.test.ts`가 *"만드는 자리가 몇 개인가"*를 세고, 여기는 *"오늘 두 산출물이
 * 같은 값을 내는가"*를 견준다. **둘 다 필요하다** — 값만 재면 복제가 아직 값을 안 바꿨을 때
 * 안 보이고(`assembly-census.test.ts`의 머리말이 같은 말을 한다), 소스만 세면 같은 함수를
 * 부르면서 **다르게 엮는 것**이 안 보인다.
 *
 * # DOM 을 쓴다
 *
 * 번들은 HTML이고 그것을 글자로 훑으면 이스케이프와 마크업이 섞인다. `DOMParser`로
 * 지나게 해서 **브라우저가 읽는 것**을 꺼낸다 — `bundle.test.tsx`가 같은 이유로 jsdom이다.
 */
import { findAll, parseXml, textOf } from '@wirebound/exporter/test-support'
import type { PageDocument, WbNode } from '@wirebound/schema'
import { describe, expect, it } from 'vitest'
import { exportBundle, type BundlePage } from '../src/bundle/index'
import { exportPptx, type PptxPage } from '../src/pptx/index'

const BUTTON: WbNode = {
  id: 'n_000000000002',
  type: 'Button',
  props: { label: '검색' },
  marker: 1,
  interactions: [
    { on: 'click', actions: [{ type: 'setProp', target: 'n_000000000003', prop: 'loading', value: true }] },
    { on: 'click', actions: [{ type: 'navigate', target: 'page:관리자/회원/상세' }] },
  ],
}

const LIST: WbNode = {
  id: 'n_000000000003',
  type: 'List',
  props: {},
  marker: 2,
  interactions: [{ on: 'select', actions: [{ type: 'setVisible', target: 'n_000000000002', value: false }] }],
}

function documentOf(children: WbNode[]): PageDocument {
  return { version: 1, root: { id: 'n_000000000001', type: 'Page', children } }
}

/**
 * **깨진 자식을 섞는다.** 문장화가 던지는 원인이고, 두 산출물이 그것을 다르게 견디면
 * 한쪽만 문장을 잃는다 — `sentences.ts`의 머리말이 그 고장을 적는다.
 */
const BROKEN = documentOf([BUTTON, { id: 'n_000000000009', type: 'Box', children: [null as never] }])

/** **하나짜리로 재지 않는다.** 코멘트 있는 페이지 · 고아 마커 · 고아 코멘트 · 깨진 자식. */
const PAGES = [
  {
    title: '관리자 · 회원 · 목록',
    document: documentOf([BUTTON, LIST]),
    description: '회원을 조건으로 찾는 화면',
    comments: [
      { nodeId: 'n_000000000002', body: '검색 조건은 AND & OR', authorName: '장', createdAt: '2026-08-17' },
      { nodeId: 'n_000000000404', body: '<사라진> 노드에 달린 코멘트' },
      // **여러 줄 코멘트.** 설계서 코멘트는 여러 줄인 것이 정상이다.
      { nodeId: 'n_000000000003', body: '첫째 줄\n둘째 줄' },
    ],
  },
  { title: '관리자 · 회원 · 상세', document: documentOf([LIST]), comments: [] },
  { title: '문서 · 소개', document: BROKEN, comments: [] },
]

const bundle = exportBundle({ pages: PAGES as BundlePage[], runtimeJs: '/* runtime */' })
const pptx = exportPptx({ pages: PAGES as PptxPage[] })

/** 번들에서 그 페이지의 HTML. `index.html`은 첫 페이지의 사본이라 `pages/…`를 쓴다. */
function bundleDocument(index: number): Document {
  const html = bundle.files.filter((file) => file.path.startsWith('pages/'))[index]!
  return new DOMParser().parseFromString(html.content as string, 'text/html')
}

function bundleTexts(index: number, panel: 'comments' | 'interactions'): string[] {
  const section = bundleDocument(index).querySelector(`#wb-export-panel-${panel}`)!
  return [...section.querySelectorAll('.wb-export-entry')]
    .flatMap((entry) => [...entry.children].map((child) => child.textContent ?? ''))
    .filter((text) => text.length > 0)
}

/** 번들 쪽 글자를 **줄로** 가른다. pptx 는 그 줄들을 문단 여럿으로 담는다. */
function lines(text: string): string[] {
  return text.replace(/\r\n?/g, '\n').split('\n')
}

/** 브라우저가 접는 것과 같게 공백을 줄인다. **번들 쪽 글자에만 쓴다.** */
function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function slideTexts(index: number): string[] {
  const slide = pptx.parts.find((part) => part.path === `ppt/slides/slide${index + 1}.xml`)!
  return findAll(parseXml(slide.content as string), 'a:t').map(textOf)
}

function noteTexts(index: number): string[] {
  const notes = pptx.parts.find((part) => part.path === `ppt/notesSlides/notesSlide${index + 1}.xml`)!
  return findAll(parseXml(notes.content as string), 'a:t').map(textOf)
}

describe('번들과 PPTX 가 같은 글자를 싣는다', () => {
  it('자가 실제로 읽는다 — 카나리아', () => {
    // 이 둘이 비면 아래 검사가 전부 공허하게 통과한다.
    expect(bundleTexts(0, 'comments').length).toBeGreaterThan(2)
    expect(slideTexts(0).length).toBeGreaterThan(4)
  })

  it('페이지 수가 같다 — 슬라이드 하나가 페이지 하나다', () => {
    expect(pptx.parts.filter((part) => /^ppt\/slides\/slide\d+\.xml$/.test(part.path))).toHaveLength(
      bundle.files.filter((file) => file.path.startsWith('pages/')).length,
    )
  })

  for (const [index, page] of PAGES.entries()) {
    it(`코멘트 줄이 같다 — ${page.title}`, () => {
      const 슬라이드 = slideTexts(index)
      for (const text of bundleTexts(index, 'comments')) {
        // **줄마다 본다.** 번들은 여러 줄을 `<p>` 하나에 담고 pptx 는 문단 여럿으로 담는다 —
        // 담는 모양이 다른 것이 옳고, 같아야 하는 것은 **줄의 글자**다.
        for (const segment of lines(text)) {
          expect(슬라이드, `번들의 "${segment}"`).toContain(segment)
        }
      }
    })

    it(`상호작용 문장이 같다 — ${page.title}`, () => {
      const 슬라이드 = slideTexts(index)
      const 문장 = bundleTexts(index, 'interactions')
      for (const text of 문장) expect(슬라이드, `번들의 "${text}"`).toContain(text)
    })

    it(`노트도 같은 글자를 받는다 — ${page.title}`, () => {
      const 노트 = noteTexts(index)
      for (const text of [...bundleTexts(index, 'comments'), ...bundleTexts(index, 'interactions')]) {
        for (const segment of lines(text)) {
          expect(노트, `번들의 "${segment}"`).toContain(segment)
        }
      }
    })
  }

  /**
   * **깨진 자식을 둘이 같게 견딘다.** 한쪽이 던지거나 목록을 통째로 비우면 여기가 죽는다 —
   * 그 갈림은 `sentences.ts`의 머리말이 적는 부류다.
   */
  it('깨진 자식이 있어도 멀쩡한 규칙의 문장이 둘 다 산다', () => {
    const 문장 = bundleTexts(2, 'interactions')
    expect(문장.length).toBeGreaterThan(0)
    for (const text of 문장) expect(slideTexts(2)).toContain(text)
  })

  /**
   * **담긴 글자만 견주는 자는 이것을 못 본다.** 양쪽 글자에 똑같이 `\n` 이 들어 있으면
   * *"담긴 글자"* 는 같은데 **그린 결과가 갈린다** — 브라우저는 `\n` 을 공백으로 접고
   * PowerPoint 는 **공백도 없이 붙인다.** 그래서 여기서는 담긴 글자가 아니라
   * **그려질 모양**을 견준다: pptx 쪽에 날 줄바꿈이 없어야 하고, 문단을 공백으로 이으면
   * 번들이 접은 것과 같아야 한다.
   */
  it('여러 줄 코멘트를 둘이 같게 그린다 — 날 줄바꿈이 pptx 에 안 남는다', () => {
    for (const [index] of PAGES.entries()) {
      for (const text of [...slideTexts(index), ...noteTexts(index)]) {
        expect(text, JSON.stringify(text)).not.toContain('\n')
      }
    }

    // 번들이 접은 글자와 pptx 의 문단을 이은 글자가 같다.
    const 번들 = bundleTexts(0, 'comments').map(collapse)
    expect(번들).toContain('첫째 줄 둘째 줄')
    const 슬라이드 = slideTexts(0)
    const 첫째 = 슬라이드.indexOf('첫째 줄')
    expect(첫째).toBeGreaterThanOrEqual(0)
    expect(`${슬라이드[첫째]} ${슬라이드[첫째 + 1]}`).toBe('첫째 줄 둘째 줄')
  })

  it('페이지 제목이 같다 — 한 페이지를 두 이름으로 부르지 않는다', () => {
    for (const [index, page] of PAGES.entries()) {
      expect(bundleDocument(index).title).toBe(page.title)
      expect(slideTexts(index)[0]).toBe(page.title)
    }
  })
})
