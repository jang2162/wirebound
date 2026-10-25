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

describe('DataGrid — 열 틀 · 사본 · 병합 머리 · 선택 · 번호 · 빈 결과 · 제 칸', () => {
  const column = (id: string, label: string, props: Record<string, unknown> = {}, children?: WbNode[]): WbNode => ({
    id,
    type: 'GridColumn',
    props: { label, ...props },
    children: children ?? [{ id: `${id}t`, type: 'Text', props: { content: '홍길동' } }],
  })
  const grid = (props: Record<string, unknown>, columns: WbNode[], rows: WbNode[], zones: WbNode['zones'] = {}): WbNode => ({
    id: 'g',
    type: 'DataGrid',
    props,
    children: columns,
    zones: { ...zones, rows },
  })
  const bodyRows = (el: Element) => Array.from(el.querySelectorAll(':scope > [data-wb-part="scroll"] > table > tbody > tr'))

  it('되풀이 행 — 첫 줄이 행 노드 · 나머지는 사본(data-wb-copy-of) · 셀 틀 원본은 한 번만 data-wb-id · 사본의 글은 원본과 같다(Q4)', () => {
    const el = draw(grid({}, [column('c1', '이름'), column('c2', '상태')], [{ id: 'r', type: 'GridRow', props: { repeat: 3 } }]))
    const rows = bodyRows(el)
    expect(rows.map((tr) => [tr.getAttribute('data-wb-id'), tr.getAttribute('data-wb-copy-of')])).toEqual([
      ['r', null],
      [null, 'r'],
      [null, 'r'],
    ])
    expect(el.querySelectorAll('[data-wb-id="c1t"]')).toHaveLength(1)
    expect(el.querySelectorAll('[data-wb-copy-of="c1t"]')).toHaveLength(2)
    expect(rows[0]!.querySelector('[data-wb-id="c1t"]')).not.toBeNull()
    expect(rows.map((tr) => Array.from(tr.children).map((td) => td.textContent))).toEqual([
      ['홍길동', '홍길동'],
      ['홍길동', '홍길동'],
      ['홍길동', '홍길동'],
    ])
    // 사본도 노드 속성 · 표지가 같다 — 테마 CSS 가 같게 듣는다.
    const copy = el.querySelector('[data-wb-copy-of="c1t"]')!
    expect(copy.getAttribute('data-wb-component')).toBe('Text')
    expect(copy.getAttribute('data-wb-variant')).toBe('body')
    // `[data-wb-id]` 를 훑는 자리가 같은 노드를 둘로 세지 않는다.
    const ids = Array.from(el.querySelectorAll('[data-wb-id]')).map((node) => node.getAttribute('data-wb-id'))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('사본의 뷰가 짓는 HTML id 가 안 겹친다 · 셀 틀 입력 조각의 접근 이름은 열 머리 이름(사본은 « (n행)»)', () => {
    const field: WbNode = { id: 'f', type: 'Field', props: { label: '메모' }, children: [{ id: 'fi', type: 'Input' }] }
    const el = draw(
      grid(
        {},
        [column('c1', '단위기간명', {}, [{ id: 'in', type: 'Input' }]), column('c2', '비고', {}, [field])],
        [{ id: 'r', type: 'GridRow', props: { repeat: 3 } }],
      ),
    )
    const htmlIds = Array.from(el.querySelectorAll('[id]')).map((node) => node.id)
    expect(htmlIds.length).toBeGreaterThan(0)
    expect(new Set(htmlIds).size).toBe(htmlIds.length)
    const names = Array.from(el.querySelectorAll('[data-wb-component="Input"]')).map((input) => input.getAttribute('aria-label'))
    expect(names).toEqual(['단위기간명', '메모', '단위기간명 (2행)', '메모 (2행)', '단위기간명 (3행)', '메모 (3행)'])
  })

  it('두 단 병합 머리 — 묶음은 colspan · 묶음 아닌 열은 rowspan · scope', () => {
    const group: WbNode = {
      id: 'grp',
      type: 'GridColumnGroup',
      props: { label: '기간' },
      children: [column('a', '시작'), column('b', '끝')],
    }
    const el = draw(
      grid(
        {},
        [column('no', 'No', { numbering: 'desc' }, []), group, column('z', '상태')],
        [{ id: 'r', type: 'GridRow', props: { repeat: 2 } }],
      ),
    )
    const head = Array.from(el.querySelectorAll('thead > tr')).map((tr) =>
      Array.from(tr.children).map(
        (th) => `${th.textContent}:${th.getAttribute('colspan') ?? 1}×${th.getAttribute('rowspan') ?? 1}:${th.getAttribute('scope')}`,
      ),
    )
    expect(head).toEqual([
      ['No:1×2:col', '기간:2×1:colgroup', '상태:1×2:col'],
      ['시작:1×1:col', '끝:1×1:col'],
    ])
    // 번호 열(desc) — 데이터 줄을 거꾸로 센다.
    expect(bodyRows(el).map((tr) => tr.firstElementChild!.textContent)).toEqual(['2', '1'])
  })

  it('체크 선택 — 머리 «모두 고르기» 체크 · 데이터 줄마다 체크 · 합계 줄은 빈 칸 · 생략 띠는 전폭 한 칸', () => {
    const rows: WbNode[] = [
      { id: 'r1', type: 'GridRow', props: { tone: 'selected' } },
      { id: 'gap', type: 'GridRow', props: { kind: 'gap' } },
      {
        id: 'sum',
        type: 'GridRow',
        props: { kind: 'total' },
        children: [{ id: 'k', type: 'GridCell', props: { span: 2 }, children: [{ id: 'kt', type: 'Text', props: { content: '합계' } }] }],
      },
    ]
    const el = draw(grid({ select: 'check' }, [column('c1', '이름'), column('c2', '상태')], rows))
    expect(el.querySelector('thead [data-wb-cell="select"] [data-wb-part="checkbox"]')).not.toBeNull()
    expect(
      bodyRows(el).map((tr) => Array.from(tr.children).map((td) => td.getAttribute('data-wb-cell') ?? td.getAttribute('data-wb-part'))),
    ).toEqual([['select', 'template', 'template'], ['gap'], ['blank', 'own']])
    expect(el.querySelector('[data-wb-part="gap"]')!.getAttribute('colspan')).toBe('3')
    expect(el.querySelector('[data-wb-id="k"]')!.getAttribute('colspan')).toBe('2')
    expect(el.querySelector('tr[data-wb-id="r1"]')!.getAttribute('data-wb-tone')).toBe('selected')
  })

  it('제 칸을 가진 행의 되풀이 — 칸도 사본 · 칸 몸통의 입력 조각은 그 칸이 덮는 열의 머리 이름', () => {
    const own: WbNode = {
      id: 'r',
      type: 'GridRow',
      props: { repeat: 2 },
      children: [
        { id: 'k1', type: 'GridCell', children: [{ id: 'k1i', type: 'Input' }] },
        { id: 'k2', type: 'GridCell', children: [{ id: 'k2i', type: 'Select' }] },
      ],
    }
    const el = draw(grid({}, [column('c1', '이름'), column('c2', '구분')], [own]))
    const rows = bodyRows(el)
    expect(rows[1]!.querySelector('[data-wb-copy-of="k1"]')!.tagName).toBe('TD')
    expect(el.querySelectorAll('[data-wb-id="k1"]')).toHaveLength(1)
    expect(
      Array.from(el.querySelectorAll('[data-wb-component="Input"], [data-wb-component="Select"]')).map((n) => n.getAttribute('aria-label')),
    ).toEqual(['이름', '구분', '이름 (2행)', '구분 (2행)'])
  })

  it('빈 상태 — 행 노드를 안 그리고 전폭 한 줄 «검색 결과가 없습니다.»(선택 칸까지)', () => {
    const el = draw(
      grid(
        { empty: true, select: 'radio' },
        [column('c1', '이름'), column('c2', '상태')],
        [{ id: 'r', type: 'GridRow', props: { repeat: 5 } }],
      ),
    )
    expect(bodyRows(el)).toHaveLength(1)
    expect(parts(el, 'empty').map((cell) => [cell.textContent, cell.getAttribute('colspan')])).toEqual([['검색 결과가 없습니다.', '3']])
    expect(el.querySelector('[data-wb-id="c1t"]')).toBeNull()
  })

  it('불러오는 중 — 칸마다 내용 대신 막대', () => {
    const el = draw(
      grid({ loading: true }, [column('c1', '이름'), column('c2', '상태')], [{ id: 'r', type: 'GridRow', props: { repeat: 2 } }]),
    )
    expect(parts(el, 'skeleton')).toHaveLength(2 * 2)
    expect(el.querySelector('tbody')!.textContent).toBe('')
  })

  it('고정 열 — 선택 칸을 센 왼쪽 칸에 data-wb-fixed(끝 칸 last) · 표에 고정 열 수', () => {
    const el = draw(
      grid({ select: 'check', fixedColumns: 2 }, [column('c1', '이름'), column('c2', '상태')], [{ id: 'r', type: 'GridRow' }]),
    )
    expect(el.querySelector('table')!.getAttribute('data-wb-fixed-columns')).toBe('2')
    expect(
      Array.from(el.querySelectorAll('tr')).map((tr) => Array.from(tr.children).map((cell) => cell.getAttribute('data-wb-fixed'))),
    ).toEqual([
      ['inside', 'last', null],
      ['inside', 'last', null],
    ])
  })

  it('바닥 구역의 페이지네이션 — 범위 글 · 지금 쪽(aria-current) · 행 수 셀렉트', () => {
    const el = draw(
      grid({}, [column('c1', '이름')], [], { footer: [{ id: 'pg', type: 'Pagination', props: { total: 72, pageSize: 50, page: 2 } }] }),
    )
    const bar = el.querySelector('[data-wb-id="pg"]')!
    expect(bar.tagName).toBe('NAV')
    expect(bar.getAttribute('aria-label')).toBe('쪽 넘김')
    expect(parts(bar, 'range')[0]!.textContent).toBe('51 - 72 (총 72 항목 중)')
    expect(parts(bar, 'page').map((page) => [page.textContent, page.getAttribute('aria-current')])).toEqual([
      ['1', null],
      ['2', 'page'],
    ])
    expect(parts(bar, 'sizeSelect')[0]!.textContent).toBe('50 ▼')
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
    expect(block(':where([data-wb-component="DataGrid"] :is([data-wb-part="checkbox"], [data-wb-part="radio"]))')).toMatch(/width: \d+px;/)
    expect(block(':where([data-wb-component="DataGrid"] [data-wb-part="skeleton"])')).toMatch(/height: [\d.]+em;/)
  })

  it('찍는 판(<html data-wb-capture>)은 층 안의 !important 로 스크롤 상자를 풀고 고정 열을 놓는다', () => {
    const css = defaultViewsCss()
    const layer = css.slice(css.indexOf('@layer wb-capture {'))
    expect(layer.length).toBeGreaterThan(0)
    expect(layer).toContain(
      ':where(html[data-wb-capture] [data-wb-component="DataGrid"] > [data-wb-part="scroll"]) {\n  overflow: visible !important;',
    )
    expect(layer).toContain(
      ':where(html[data-wb-capture] [data-wb-component="DataGrid"] [data-wb-fixed]) {\n  position: static !important;',
    )
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
