// @vitest-environment jsdom
/**
 * system-docs 의 뷰 넷(`Card` · `List` · `Tree` · `KeyValue`) — variant 마다 그 모양의 DOM 표지가 서는가, 마커 자리가 뜻한 대로인가.
 * 뷰를 안 쓴 컴포넌트는 기본 뷰 DOM 그대로라 여기서 재지 않는다(갤러리 전부는 `build-test/wbtheme.test.ts` 의 `checkTheme`).
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { installCatalog, type PageDocument } from '@wirebound/schema'
import { focusElement, renderDocument, type NodeRenderError } from '@wirebound/renderer'
import { DOCS_THEME } from '@wirebound/system-theme-docs'

beforeAll(() => installCatalog())
// 이 저장소는 vitest `globals` 를 켜지 않아 RTL 이 cleanup 을 스스로 걸지 못한다.
afterEach(() => cleanup())

function draw(type: string, props: Record<string, unknown>, variant?: string): Element {
  const node = { id: 'n', type, props, children: [], ...(variant === undefined ? {} : { variant }) }
  const doc = { root: { id: 'root', type: 'Page', props: {}, children: [node] } } as unknown as PageDocument
  const errors: NodeRenderError[] = []
  const { container } = render(<>{renderDocument(doc, { theme: DOCS_THEME, onNodeError: (e) => errors.push(e) })}</>)
  expect(errors).toEqual([])
  const root = container.querySelector('[data-wb-id="n"]')
  if (root === null) throw new Error(`${type} 가 그려지지 않았다`)
  // 폴백 상자가 아니라 뷰가 그렸다.
  expect(root.getAttribute('data-wb-error')).toBeNull()
  return root
}

const parts = (root: Element, part: string) => Array.from(root.querySelectorAll(`[data-wb-part="${part}"]`))

describe('Card — 주의 상자', () => {
  it.each(['default', 'featured'])('%s: 표시 자리(media)와 글묶음(content)이 형제이고 머리 · 본문은 content 안이다', (variant) => {
    const root = draw('Card', { title: '참고', subtitle: '부제' }, variant)
    expect(root.getAttribute('data-wb-variant')).toBe(variant)
    const [media, content] = Array.from(root.children)
    expect(media!.getAttribute('data-wb-part')).toBe('media')
    expect(content!.getAttribute('data-wb-part')).toBe('content')
    expect(content!.querySelector('[data-wb-part="title"]')!.textContent).toBe('참고')
    expect(content!.querySelector('[data-wb-part="body"]')).not.toBeNull()
  })

  it('variant 를 안 고른 카드는 주의 상자다(옛 구조 horizontal)', () => {
    const root = draw('Card', { title: '참고' })
    expect(root.getAttribute('data-wb-variant')).toBe('default')
    expect(parts(root, 'content')).toHaveLength(1)
  })

  it('plain: 기본 뷰의 카드 — 표시 자리가 없다', () => {
    const root = draw('Card', { title: '카드' }, 'plain')
    expect(parts(root, 'media')).toHaveLength(0)
    expect(parts(root, 'content')).toHaveLength(0)
    expect(root.getAttribute('data-wb-structure')).toBe('plain')
  })

  /** 표시 자리가 왼쪽 위에 선다 — 마커를 거기 두면 주의 상자의 종류(색 표시)를 가린다. */
  it('주의 상자의 마커는 오른쪽 위다 · 보통 카드는 기본 자리다', () => {
    expect(draw('Card', {}, 'default').getAttribute('data-wb-marker')).toBe('top-end')
    cleanup()
    expect(draw('Card', {}, 'featured').getAttribute('data-wb-marker')).toBe('top-end')
    cleanup()
    expect(draw('Card', {}, 'plain').getAttribute('data-wb-marker')).toBeNull()
  })
})

describe('List — 줄 목록', () => {
  it.each(['default', 'compact'])('%s: <ul> 의 항목 수만큼 item 이 서고 페이지네이션은 마지막 줄이다', (variant) => {
    const root = draw('List', { items: 3, pagination: true }, variant)
    expect(root.tagName).toBe('UL')
    expect(parts(root, 'item')).toHaveLength(3)
    expect(parts(root, 'item').every((li) => li.tagName === 'LI')).toBe(true)
    expect(root.lastElementChild!.getAttribute('data-wb-part')).toBe('pagination')
  })

  it('페이지네이션을 끄면 그 줄이 없다', () => {
    expect(parts(draw('List', { items: 2, pagination: false }), 'pagination')).toHaveLength(0)
  })

  it('table: 기본 뷰의 표', () => {
    const root = draw('List', { items: 2, columns: ['이름', '설명'] }, 'table')
    expect(root.tagName).toBe('TABLE')
    expect(parts(root, 'header')).toHaveLength(1)
  })
})

describe('Tree — 아코디언', () => {
  it('첫 마디만 펴져 깊이만큼 panel 이 중첩되고, 나머지 마디는 접혀 있다', () => {
    const root = draw('Tree', { items: ['시작하기', '가이드', 'API'], depth: 3 })
    expect(root.getAttribute('data-wb-variant')).toBe('accordion')
    const top = Array.from(root.children)
    expect(top.map((li) => li.querySelector('[data-wb-part="label"]')!.textContent)).toEqual(['시작하기', '가이드', 'API'])
    // 깊이 3 → 첫 마디 아래 panel 둘이 겹쳐 선다.
    expect(top[0]!.querySelectorAll('[data-wb-part="panel"]')).toHaveLength(2)
    expect(top[1]!.querySelectorAll('[data-wb-part="panel"]')).toHaveLength(0)
    expect(top.map((li) => li.querySelector('[data-wb-part="toggle"]')!.textContent)).toEqual(['▾', '▸', '▸'])
  })

  it('indent: 기본 뷰 — 단계를 노드 변수로 싣는다', () => {
    const root = draw('Tree', { items: ['a', 'b'], depth: 2 }, 'indent')
    expect(root.getAttribute('data-wb-structure')).toBe('indent')
    expect(parts(root, 'panel')).toHaveLength(0)
  })
})

describe('KeyValue — 정의 목록', () => {
  it('<dl> 안에서 row 마다 <dt>/<dd> 짝이다', () => {
    const root = draw('KeyValue', { pairs: [{ key: 'id', value: '문자열' }, { key: 'limit', value: '수' }] })
    expect(root.tagName).toBe('DL')
    expect(parts(root, 'row').map((row) => [row.children[0]!.tagName, row.children[1]!.tagName])).toEqual([
      ['DT', 'DD'],
      ['DT', 'DD'],
    ])
    expect(parts(root, 'key').map((k) => k.textContent)).toEqual(['id', 'limit'])
  })

  it('table: 기본 뷰의 표', () => {
    expect(draw('KeyValue', { pairs: [{ key: 'a', value: 'b' }] }, 'table').tagName).toBe('TABLE')
  })
})

describe('선택 외곽선', () => {
  /** 네 뷰 모두 `Focus` 를 두지 않는다 — 루트 상자가 곧 노드의 모양이다(표시 자리 · 페이지네이션이 노드 밖이 아니다). */
  it.each([
    ['Card', 'default'],
    ['List', 'default'],
    ['Tree', 'accordion'],
    ['KeyValue', 'definition'],
  ])('%s(%s): 외곽선은 루트를 감싼다', (type, variant) => {
    const root = draw(type, {}, variant)
    expect(focusElement(root)).toBe(root)
  })
})
