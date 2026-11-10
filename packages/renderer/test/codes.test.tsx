// @vitest-environment jsdom
/**
 * **공통코드에 묶인 노드를 표로 그린다**(`RenderOptions.codes`) — 대표 글 · 선택지 · 고름 · 끊김 표지 · 표 없는 렌더 · 노드 캐시. 풀기 판정 자체는
 * `packages/schema/test/codes-resolve.test.ts` 가 갖는다.
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { indexCodes, installCatalog, type CodeTable, type PageDocument, type WbNode } from '@wirebound/schema'
import { renderDocument } from '@wirebound/renderer'

beforeAll(() => {
  installCatalog()
})

afterEach(() => {
  cleanup()
})

const TABLE: CodeTable = [
  {
    key: 'S',
    name: '상태',
    items: [
      { value: 'A', name: '결제 대기', active: true },
      { value: 'B', name: '배송 중', active: true },
      { value: 'C', name: '취소', active: false },
    ],
  },
  { key: 'EMPTY', name: '빔', items: [] },
]

function doc(...children: WbNode[]): PageDocument {
  return { version: 5, root: { id: 'page', type: 'Page', children } } as PageDocument
}

function draw(document: PageDocument, codes?: CodeTable) {
  return render(<>{renderDocument(document, codes === undefined ? {} : { codes: indexCodes(codes) })}</>).container
}

const select: WbNode = {
  id: 'sel',
  type: 'Select',
  props: { options: [{ label: '옛 하나' }, { label: '옛 둘', selected: true }] },
  code: { group: 'S', selected: ['B'] },
}
const affix: WbNode = { id: 'af', type: 'Affix', props: { text: '옛 이름' }, code: { group: 'S', item: 'A' } }

describe('묶인 노드를 표로 그린다', () => {
  it('RadioGroup — 선택지 글이 표의 이름이고 B 가 골라져 있다 · 사용 안 함은 빠진다', () => {
    const radio: WbNode = { ...select, id: 'rad', type: 'RadioGroup' }
    const root = draw(doc(radio), TABLE).querySelector('[data-wb-id="rad"]')!
    const options = [...root.querySelectorAll('[data-wb-part="option"]')].map((option) => [
      option.textContent,
      option.getAttribute('aria-checked'),
    ])
    expect(options).toEqual([
      ['결제 대기', 'false'],
      ['배송 중', 'true'],
    ])
  })

  it('Select — 고른 B 의 이름을 그린다 · 고른 값이 사용 안 함이면 다른 항목을 골라 보이지 않는다', () => {
    expect(draw(doc(select), TABLE).querySelector('[data-wb-id="sel"]')!.textContent).toBe('배송 중')
    cleanup()
    const off = draw(doc({ ...select, code: { group: 'S', selected: ['C'] } }), TABLE).querySelector('[data-wb-id="sel"]')!
    expect(off.textContent).toBe('== 선택 ==')
  })

  it('Affix — 표의 이름 · 지우면 옛 이름과 끊김 표지', () => {
    const live = draw(doc(affix), TABLE).querySelector('[data-wb-id="af"]')!
    expect(live.textContent).toBe('결제 대기')
    expect(live.hasAttribute('data-wb-code-broken')).toBe(false)
    cleanup()
    const gone: CodeTable = [{ ...TABLE[0]!, items: TABLE[0]!.items.filter((item) => item.value !== 'A') }]
    const broken = draw(doc(affix), gone).querySelector('[data-wb-id="af"]')!
    expect(broken.textContent).toBe('옛 이름')
    expect(broken.getAttribute('data-wb-code-broken')).toBe('')
  })

  it('표 옵션이 없으면 prop 글을 그리고 표지가 없다', () => {
    const root = draw(doc(affix, select)).querySelector('[data-wb-id="af"]')!
    expect(root.textContent).toBe('옛 이름')
    expect(document.querySelector('[data-wb-code-broken]')).toBeNull()
    expect(document.querySelector('[data-wb-id="sel"]')!.textContent).toContain('옛 둘')
  })

  it('날 키 · 값이 그린 글자에 안 나온다', () => {
    const text = draw(doc({ ...affix, props: { text: '대체' } }, select), TABLE).textContent ?? ''
    // 키 `S` · 값 `A`/`B` 는 한 글자라 글 속에 우연히 낄 수 있다 — 낱말로 센다.
    const words = text.split(/[\s⁨⁩]+/u)
    for (const raw of ['S', 'A', 'B', 'C']) expect(words).not.toContain(raw)
  })

  it('사용 중 항목이 0 개인 그룹 — 폴백 없이 빈 선택지로 선다', () => {
    const empty: WbNode = { id: 'cb', type: 'CheckboxGroup', props: { options: [{ label: '옛' }] }, code: { group: 'EMPTY' } }
    const container = draw(doc(empty), TABLE)
    expect(container.querySelector('[data-wb-error]')).toBeNull()
    const root = container.querySelector('[data-wb-id="cb"]')!
    expect(root.textContent).not.toContain('옛')
    expect(root.querySelectorAll('[data-wb-part="option"]').length).toBe(0)
  })

  it('노드 캐시 — 같은 노드에 다른 표를 주면 다시 그린다', () => {
    const document = doc(affix)
    expect(draw(document, TABLE).querySelector('[data-wb-id="af"]')!.textContent).toBe('결제 대기')
    cleanup()
    const renamed: CodeTable = [{ ...TABLE[0]!, items: [{ value: 'A', name: '새 이름', active: true }] }]
    expect(draw(document, renamed).querySelector('[data-wb-id="af"]')!.textContent).toBe('새 이름')
  })
})
