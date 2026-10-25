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

  const search: WbNode = { id: 'b', type: 'Button', props: { label: '검색' } }

  it('펴진 판은 필드 · 단추 구역 — 머리줄이 없다 · 단추 구역은 구역 속성을 단다', () => {
    const el = draw({ id: 's', type: 'SearchForm', props: {}, children: [field], zones: { actions: [search] } })
    expect(childParts(el)).toEqual(['fields', 'actions'])
    expect(el.querySelector('[data-wb-id="f"]')).not.toBeNull()
    expect(el.querySelector('[data-wb-part="actions"]')!.getAttribute('data-wb-zone')).toBe('actions')
    expect(el.querySelector('[data-wb-zone="actions"] > [data-wb-id="b"]')).not.toBeNull()
  })

  it('단추 구역이 비면 단추줄째 없다 — 조회 전용 폼', () => {
    const el = draw({ id: 's', type: 'SearchForm', props: {}, children: [field] })
    expect(childParts(el)).toEqual(['fields'])
  })

  it('접힌 판은 머리줄(toggle)만 남고 두 구역이 DOM 에서 빠진다', () => {
    const el = draw({ id: 's', type: 'SearchForm', props: { collapsed: true }, children: [field], zones: { actions: [search] } })
    expect(childParts(el)).toEqual(['toggle'])
    expect(el.querySelector('[data-wb-id="f"]')).toBeNull()
    expect(el.querySelector('[data-wb-id="b"]')).toBeNull()
    expect(el.getAttribute('data-wb-structure')).toBe('inline')
  })
})

describe('List — selectable · empty · loading', () => {
  const plain: WbNode = { id: 'l', type: 'List', props: { items: 3, columns: ['이름', '상태'], pagination: true } }

  it('selectable — 머리와 행마다 맨 앞에 체크 칸 · 쪽 번호 칸이 그만큼 넓다', () => {
    const el = draw({ ...plain, props: { ...plain.props, selectable: true } })
    expect(Array.from(el.querySelectorAll('tr')).map((tr) => tr.firstElementChild?.getAttribute('data-wb-cell') ?? null)).toEqual([
      'check',
      'check',
      'check',
      'check',
      null,
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
    expect(
      Array.from(el.querySelectorAll('tr')).map((tr) =>
        Array.from(tr.children).map(
          (cell) => `${cell.getAttribute('data-wb-part')}:${cell.textContent}:${cell.getAttribute('colspan') ?? 1}`,
        ),
      ),
    ).toEqual([
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

describe('Field — 라벨 이름을 단 group · 값 칸에 조각', () => {
  const attrs = (el: Element, names: string[]) => names.map((name) => el.getAttribute(name))

  it('뿌리는 group 이고 라벨 조각의 id 를 이름으로 가리킨다 · 라벨 · 값 조각이 형제다', () => {
    const el = draw({ id: 'f1', type: 'Field', props: { label: '이름' }, children: [{ id: 'i1', type: 'Input' }] })
    expect(attrs(el, ['role'])).toEqual(['group'])
    const label = el.querySelector(':scope > [data-wb-part="label"]')!
    expect(label.textContent).toBe('이름')
    expect(el.getAttribute('aria-labelledby')).toBe(label.id)
    expect(label.id).not.toBe('')
    expect(childParts(el)).toEqual(['label', 'value'])
    expect(el.querySelector(':scope > [data-wb-part="value"] > [data-wb-id="i1"]')).not.toBeNull()
  })

  it('필수는 상태 · 별(라벨)이고 group 에 aria-required 를 안 단다', () => {
    const el = draw({ id: 'f2', type: 'Field', props: { label: '이름', required: true } })
    expect((el.getAttribute('data-wb-state') ?? '').split(' ')).toContain('required')
    expect(el.hasAttribute('aria-required')).toBe(false)
  })

  it('라벨 id 는 노드마다 갈린다 — 한 문서에 필드가 둘이어도 이름이 섞이지 않는다', () => {
    const doc = {
      version: 5,
      root: {
        id: 'page',
        type: 'Page',
        children: [
          { id: 'fa', type: 'Field', props: { label: '가' } },
          { id: 'fb', type: 'Field', props: { label: '나' } },
        ],
      },
    } as unknown as PageDocument
    const { container } = render(<>{renderDocument(doc)}</>)
    const ids = Array.from(container.querySelectorAll('[data-wb-component="Field"]')).map((f) => f.getAttribute('aria-labelledby'))
    expect(new Set(ids).size).toBe(2)
  })
})

describe('입력 조각 — 역할 · 이름 · 상태', () => {
  const attrs = (el: Element, names: string[]) => names.map((name) => el.getAttribute(name))

  it.each([
    ['Input', {}, 'textbox'],
    ['Input', { kind: 'number' }, 'spinbutton'],
    ['Input', { kind: 'password' }, 'textbox'],
    ['TextArea', {}, 'textbox'],
    ['Select', {}, 'combobox'],
    ['DateInput', {}, 'textbox'],
    ['TimeInput', {}, 'textbox'],
  ])('%s %j → role=%s · invalid · readonly 가 뿌리에', (type, props, role) => {
    const states = type === 'Select' ? { invalid: true } : { invalid: true, readonly: true }
    const el = draw({ id: 'p', type, props: { ...props, ...states } })
    expect(attrs(el, ['role', 'aria-invalid'])).toEqual([role, 'true'])
    if (type !== 'Select') expect(el.getAttribute('aria-readonly')).toBe('true')
  })

  it('값이 있으면 값, 없으면 흐린 안내 · 비밀번호는 점', () => {
    const text = (el: Element) => el.querySelector('[data-wb-part="text"]')!
    const hint = draw({ id: 'a', type: 'Input', props: { placeholder: '이름' } })
    expect([text(hint).textContent, text(hint).hasAttribute('data-wb-placeholder')]).toEqual(['이름', true])
    expect(hint.getAttribute('aria-label')).toBe('이름')
    cleanup()
    const value = draw({ id: 'b', type: 'Input', props: { placeholder: '이름', value: '홍' } })
    expect([text(value).textContent, text(value).hasAttribute('data-wb-placeholder')]).toEqual(['홍', false])
    cleanup()
    expect(text(draw({ id: 'c', type: 'Input', props: { kind: 'password', value: 'abcd' } })).textContent).toBe('••••')
  })

  it('셀렉트는 고른 항목, 없으면 안내 문구', () => {
    const text = (el: Element) => el.querySelector('[data-wb-part="text"]')!.textContent
    expect(text(draw({ id: 's1', type: 'Select', props: {} }))).toBe('== 선택 ==')
    cleanup()
    expect(text(draw({ id: 's2', type: 'Select', props: { options: [{ label: '10' }, { label: '20', selected: true }] } }))).toBe('20')
  })

  it.each([
    ['CheckboxGroup', 'group', 'checkbox'],
    ['RadioGroup', 'radiogroup', 'radio'],
  ])('%s — 묶음 역할 %s · 항목마다 %s · 고른 항목만 aria-checked=true', (type, groupRole, optionRole) => {
    const el = draw({ id: 'g', type, props: { options: [{ label: '가' }, { label: '나', selected: true }, { label: '다' }] } })
    expect(el.getAttribute('role')).toBe(groupRole)
    const options = parts(el, 'option')
    expect(options.map((o) => [o.getAttribute('role'), o.textContent, o.getAttribute('aria-checked')])).toEqual([
      [optionRole, '가', 'false'],
      [optionRole, '나', 'true'],
      [optionRole, '다', 'false'],
    ])
    expect(options.every((o) => o.querySelector(':scope > [data-wb-part="mark"]') !== null)).toBe(true)
    expect(options.every((o) => o.hasAttribute('data-wb-id'))).toBe(false)
  })

  it('칩의 지우기 표지는 removable 일 때만', () => {
    expect(parts(draw({ id: 'c1', type: 'Chip', props: {} }), 'remove')).toHaveLength(1)
    cleanup()
    expect(parts(draw({ id: 'c2', type: 'Chip', props: { removable: false } }), 'remove')).toHaveLength(0)
  })
})

describe('값 칸의 몫 — Field 는 Flex 처럼 몫을 읽는다', () => {
  it('몫을 준 조각의 뿌리에 --wb-node-weight 가 선다 · 기본 CSS 가 값 칸 자식에 flex 를 건다', () => {
    const el = draw({
      id: 'f',
      type: 'Field',
      props: { label: '아이디' },
      children: [
        { id: 'i', type: 'Input', weight: 1 },
        { id: 'b', type: 'Button', props: { label: '중복확인' } },
      ],
    })
    const input = el.querySelector('[data-wb-id="i"]') as HTMLElement
    expect(input.style.getPropertyValue('--wb-node-weight')).toBe('1')
    expect((el.querySelector('[data-wb-id="b"]') as HTMLElement).style.getPropertyValue('--wb-node-weight')).toBe('')
    expect(defaultViewsCss()).toContain(':where([data-wb-component="Field"] > [data-wb-part="value"] > *)')
  })
})

it('조각의 disabled 는 전역 속성이라 뿌리에 선다', () => {
  expect(draw({ id: 'd', type: 'Select', props: { disabled: true } }).getAttribute('aria-disabled')).toBe('true')
})
