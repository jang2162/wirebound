// @vitest-environment jsdom
/**
 * **SDK 기본 뷰가 prop 표지 · 상태로 제 모양을 바꾸는가** — 테마가 없는 판에서도 화면이 바뀌어야 한다. 표지가 실리는지는
 * `prop-marks.test.tsx` 가 재고, 여기는 표지 · 상태가 바꾸는 DOM 과 기본 CSS 를 잰다.
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { installCatalog, type PageDocument, type WbNode } from '@wirebound/schema'
import { defaultViewsCss } from '@wirebound/theme-sdk'
import { renderDocument } from '@wirebound/renderer'

beforeAll(() => {
  installCatalog()
})

afterEach(() => {
  cleanup()
})

function draw(node: WbNode): Element {
  const doc = { version: 1, root: { id: 'page', type: 'Page', children: [node] } } as unknown as PageDocument
  const { container } = render(<>{renderDocument(doc)}</>)
  const el = container.querySelector(`[data-wb-id="${node.id}"]`)
  if (el === null) throw new Error(`${node.id} 가 안 그려졌다`)
  return el
}

const parts = (el: Element, part: string) => Array.from(el.querySelectorAll(`[data-wb-part="${part}"]`))
const childParts = (el: Element) => Array.from(el.children).map((child) => child.getAttribute('data-wb-part'))

describe('SearchForm — collapsed', () => {
  const field: WbNode = { id: 'f', type: 'Field', props: { label: '검색어' } }

  it('펴진 판은 필드 · 단추 — 머리줄이 없다', () => {
    const el = draw({ id: 's', type: 'SearchForm', props: {}, children: [field] })
    expect(childParts(el)).toEqual(['fields', 'actions'])
    expect(el.querySelector('[data-wb-id="f"]')).not.toBeNull()
  })

  it('접힌 판은 머리줄(toggle)만 남고 자식이 DOM 에서 빠진다', () => {
    const el = draw({ id: 's', type: 'SearchForm', props: { collapsed: true }, children: [field] })
    expect(childParts(el)).toEqual(['toggle'])
    expect(el.querySelector('[data-wb-id="f"]')).toBeNull()
    expect(el.getAttribute('data-wb-structure')).toBe('inline')
  })
})

describe('List — selectable · empty · loading', () => {
  const plain: WbNode = { id: 'l', type: 'List', props: { items: 3, columns: ['이름', '상태'], pagination: true } }

  it('selectable — 머리와 행마다 맨 앞에 체크 칸 · 쪽 번호 칸이 그만큼 넓다', () => {
    const el = draw({ ...plain, props: { ...plain.props, selectable: true } })
    expect(Array.from(el.querySelectorAll('tr')).map((tr) => tr.firstElementChild?.getAttribute('data-wb-cell') ?? null)).toEqual([
      'check', 'check', 'check', 'check', null,
    ])
    expect(parts(el, 'checkbox')).toHaveLength(4)
    expect(parts(el, 'pagination')[0]!.getAttribute('colspan')).toBe('3')
  })

  it('selectable 이 꺼지면 체크 칸이 없다', () => {
    expect(parts(draw(plain), 'checkbox')).toHaveLength(0)
  })

  it('empty — 행 대신 «데이터가 없습니다» 한 줄이 모든 칸을 덮는다', () => {
    const el = draw({ ...plain, props: { ...plain.props, empty: true, selectable: true } })
    expect(el.querySelectorAll('tbody tr')).toHaveLength(1)
    expect(parts(el, 'empty').map((cell) => [cell.textContent, cell.getAttribute('colspan')])).toEqual([['데이터가 없습니다', '3']])
  })

  it('loading — 칸마다 — 대신 막대', () => {
    const el = draw({ ...plain, props: { ...plain.props, loading: true } })
    expect(parts(el, 'skeleton')).toHaveLength(3 * 2)
    expect(el.querySelector('tbody')!.textContent).toBe('')
  })
})

describe('KeyValue — columns', () => {
  const pairs = [
    { key: '이름', value: '홍' },
    { key: '나이', value: '3' },
    { key: '부서', value: '개발' },
  ]

  it('columns 쌍씩 한 행 — 모자란 마지막 행은 빈 칸 하나가 나머지 폭을 덮는다', () => {
    const el = draw({ id: 'kv', type: 'KeyValue', props: { pairs, columns: 2 } })
    expect(Array.from(el.querySelectorAll('tr')).map((tr) => Array.from(tr.children).map((cell) => `${cell.getAttribute('data-wb-part')}:${cell.textContent}:${cell.getAttribute('colspan') ?? 1}`))).toEqual([
      ['key:이름:1', 'value:홍:1', 'key:나이:1', 'value:3:1'],
      ['key:부서:1', 'value:개발:1', 'filler::2'],
    ])
  })

  it('columns 1 이면 쌍마다 한 행 · 빈 칸이 없다', () => {
    const el = draw({ id: 'kv', type: 'KeyValue', props: { pairs, columns: 1 } })
    expect(el.querySelectorAll('tr')).toHaveLength(3)
    expect(parts(el, 'filler')).toHaveLength(0)
  })
})

describe('Media — kind', () => {
  it.each([
    ['image', null],
    ['video', '▶'],
    ['illustration', '✎'],
    ['chart', '▤'],
  ])('%s — 틀 가운데 표지 %s', (kind, glyph) => {
    const el = draw({ id: 'm', type: 'Media', props: { kind } })
    const found = parts(el, 'glyph')
    expect(found.map((g) => g.textContent)).toEqual(glyph === null ? [] : [glyph])
    expect(found.every((g) => g.parentElement?.getAttribute('data-wb-part') === 'frame')).toBe(true)
  })
})

describe('기본 CSS', () => {
  /** 규칙 하나의 선언 묶음 — 셀렉터가 글자 그대로 맞는 첫 규칙. */
  function block(selector: string): string | null {
    const css = defaultViewsCss()
    const at = css.indexOf(`${selector} {`)
    return at < 0 ? null : css.slice(at, css.indexOf('}', at))
  }

  it('Section 의 위아래 여백은 compact 면 준다 — 둘 다 특이도 0 이라 테마가 이긴다', () => {
    const normal = /padding-block: (\d+)px/.exec(block(':where([data-wb-component="Section"])') ?? '')
    const compact = /padding-block: (\d+)px/.exec(block(':where([data-wb-component="Section"][data-wb-compact])') ?? '')
    expect(normal).not.toBeNull()
    expect(compact).not.toBeNull()
    expect(Number(compact![1])).toBeLessThan(Number(normal![1]))
  })

  it('체크 칸 · 막대는 크기를 갖는다 — 빈 span 은 테마 없이 안 보인다', () => {
    expect(block(':where([data-wb-component="List"] [data-wb-part="checkbox"])')).toMatch(/width: \d+px;/)
    expect(block(':where([data-wb-component="List"] [data-wb-part="skeleton"])')).toMatch(/height: [\d.]+em;/)
  })
})

describe('Field — 접근성 속성은 control 조각에 선다', () => {
  const attrs = (el: Element, names: string[]) => names.map((name) => el.getAttribute(name))
  const control = (el: Element) => el.querySelector('[data-wb-part="control"]')!

  it.each([
    ['text', 'textbox'],
    ['number', 'spinbutton'],
    ['select', 'combobox'],
    ['date', 'textbox'],
    ['dateRange', 'textbox'],
    ['checkbox', 'checkbox'],
    ['radio', 'radiogroup'],
    ['textarea', 'textbox'],
  ])('%s → role=%s · 이름 · required · invalid 가 조각에, 루트에는 없다', (kind, role) => {
    const el = draw({ id: 'f1', type: 'Field', props: { label: '이름', control: kind, required: true, invalid: true } })
    expect(attrs(control(el), ['role', 'aria-label', 'aria-required', 'aria-invalid'])).toEqual([role, '이름', 'true', 'true'])
    expect(attrs(el, ['aria-required', 'aria-invalid'])).toEqual([null, null])
  })

  it('상태가 꺼져 있으면 조각에도 안 선다', () => {
    const el = draw({ id: 'f2', type: 'Field', props: { label: '이름' } })
    expect(attrs(control(el), ['role', 'aria-required', 'aria-invalid'])).toEqual(['textbox', null, null])
  })

  it('file 은 required 를 받는 역할이 없어 루트에 그대로 두고 조각에는 역할 · 이름을 안 단다', () => {
    const el = draw({ id: 'f3', type: 'Field', props: { label: '첨부', control: 'file', required: true } })
    expect(attrs(el, ['aria-required'])).toEqual(['true'])
    expect(attrs(control(el), ['role', 'aria-label', 'aria-required'])).toEqual([null, null, null])
  })

  it('disabled 는 전역 속성이라 루트에 그대로 선다', () => {
    const el = draw({ id: 'f4', type: 'Field', props: { label: '이름', disabled: true } })
    expect(attrs(el, ['aria-disabled'])).toEqual(['true'])
  })
})
