/**
 * **구조가 같은가**(`lock/structure.ts` 의 `sameStructure`) — 편집이 `pages.structure_seq` 를 올릴지 가르는 판정이다. DB 를 안 쓴다.
 * 판정이 틀리면 하트비트가 판정을 건너뛰어도 안 되는 때에 건너뛰거나(안전 쪽 결함 — 겹친 잠금이 선다) 늘 다시 판정한다(비용만 는다).
 * 올리는 쪽(구조가 바뀌었는데 «같다»)이 안전 쪽이므로 «다르다» 케이스가 본 잠금이다.
 */
import type { WbNode } from '@wirebound/schema'
import { describe, expect, it } from 'vitest'
import { sameStructure } from '../src/lock/structure'

const text = (id: string, content = '글'): WbNode => ({ id, type: 'Text', props: { content } })
const page = (...children: WbNode[]): WbNode => ({ id: 'n_root', type: 'Page', children })
const section = (id: string, ...children: WbNode[]): WbNode => ({ id, type: 'Section', children })

describe('sameStructure', () => {
  it('내용(props)만 달라도 같다', () => {
    expect(sameStructure(page(text('n_a', '가'), text('n_b')), page(text('n_a', '나'), text('n_b')))).toBe(true)
  })

  it('노드를 더하면 다르다', () => {
    expect(sameStructure(page(text('n_a')), page(text('n_a'), text('n_b')))).toBe(false)
  })

  it('노드를 지우면 다르다', () => {
    expect(sameStructure(page(text('n_a'), text('n_b')), page(text('n_a')))).toBe(false)
  })

  it('다른 부모로 옮기면 다르다 — 들여쓰기', () => {
    expect(sameStructure(page(section('n_s'), text('n_a')), page(section('n_s', text('n_a'))))).toBe(false)
  })

  it('같은 부모 안에서 차례를 바꾸면 다르다(다시 판정하는 쪽으로 틀린다)', () => {
    expect(sameStructure(page(text('n_a'), text('n_b')), page(text('n_b'), text('n_a')))).toBe(false)
  })

  it('노드 하나를 같은 자리에서 다른 id 로 바꾸면 다르다', () => {
    expect(sameStructure(page(text('n_a')), page(text('n_x')))).toBe(false)
  })

  it('같은 노드 수 · 같은 id 라도 부모가 다르면 다르다', () => {
    const before = page(section('n_s1', text('n_a')), section('n_s2'))
    const after = page(section('n_s1'), section('n_s2', text('n_a')))
    expect(sameStructure(before, after)).toBe(false)
  })

  it('children 안의 노드가 아닌 원소는 건너뛴다 — 검증 전 문서에서 던지지 않는다', () => {
    const odd = { id: 'n_root', type: 'Page', children: [null, text('n_a')] } as unknown as WbNode
    expect(sameStructure(odd, page(text('n_a')))).toBe(true)
  })

  describe('구역', () => {
    const card = (zones: WbNode['zones'], ...children: WbNode[]): WbNode => ({ id: 'n_card', type: 'Card', children, zones })

    it('같은 부모의 다른 구역으로 옮기면 다르다 — 부모 자리 · 차례가 같아도', () => {
      expect(sameStructure(page(card({ headEnd: [text('n_a')] })), page(card({ footer: [text('n_a')] })))).toBe(false)
    })

    it('몸통과 구역 사이를 옮기면 다르다', () => {
      expect(sameStructure(page(card({}, text('n_a'))), page(card({ footer: [text('n_a')] })))).toBe(false)
    })

    it('구역 안 노드를 더하면 다르다 · 내용만 바꾸면 같다', () => {
      expect(sameStructure(page(card({ footer: [text('n_a')] })), page(card({ footer: [text('n_a'), text('n_b')] })))).toBe(false)
      expect(sameStructure(page(card({ footer: [text('n_a', '가')] })), page(card({ footer: [text('n_a', '나')] })))).toBe(true)
    })

    it('구역 열쇠의 차례만 다르면 같다 — jsonb 는 열쇠 차례를 안 지킨다', () => {
      const before = page(card({ headEnd: [text('n_a')], footer: [text('n_b')] }))
      const after = page(card({ footer: [text('n_b')], headEnd: [text('n_a')] }))
      expect(sameStructure(before, after)).toBe(true)
    })
  })

  it('아주 깊은 문서에서 호출 스택이 안 넘친다', () => {
    const chain = (depth: number): WbNode => {
      let node: WbNode = text('n_leaf')
      for (let i = 0; i < depth; i += 1) node = { id: `n_${i}`, type: 'Section', children: [node] }
      return page(node)
    }
    expect(sameStructure(chain(50_000), chain(50_000))).toBe(true)
    expect(sameStructure(chain(50_000), chain(49_999))).toBe(false)
  })
})
