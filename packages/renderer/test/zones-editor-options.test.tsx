// @vitest-environment jsdom
/**
 * **에디터가 넘기는 구역 옵션 둘** — 끄는 동안의 빈 구역 칸(`RenderOptions.emptyZones`)과 고른 노드 펼쳐 보이기(`RenderOptions.reveal`). 둘 다 그
 * 렌더에서만이고 문서는 안 바뀐다(설계 spec `2026-10-23-node-slots-design.md` Q2 · Q3).
 */
import { cleanup, render } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { installCatalog, type PageDocument, type WbNode } from '@wirebound/schema'
import { renderDocument } from '@wirebound/renderer'

beforeAll(() => {
  installCatalog()
})

afterEach(() => {
  cleanup()
})

function draw(nodes: WbNode[], options: Parameters<typeof renderDocument>[1] = {}, doc?: PageDocument): HTMLElement {
  const { container } = render(<>{renderDocument(doc ?? page(nodes), options)}</>)
  return container
}

const page = (nodes: WbNode[]): PageDocument => ({ version: 3, root: { id: 'page', type: 'Page', children: nodes } })
const button = (id: string): WbNode => ({ id, type: 'Button', props: { label: id } })
const slot = (nodeId: string, zone: string) => createElement('span', { 'data-slot': `${nodeId}:${zone}` })

describe('빈 구역 칸(`emptyZones`)', () => {
  // 케이스마다 새 노드 객체다 — 렌더러의 노드 캐시는 객체로 열쇠를 잡아, 나눠 쓰면 앞 케이스의 그림이 뒤 케이스에 나온다. 캐시 열쇠는 «없으면 …» 케이스가 잰다.
  const card = (): WbNode => ({ id: 'c', type: 'Card', props: { title: '회원' }, zones: { headEnd: [button('e')] } })

  it('이름 붙은 구역마다 물어 받은 것을 그 구역 끝에 둔다 — 빈 구역도 그 자리가 선다 · 몸통은 안 묻는다', () => {
    const asked: string[] = []
    const el = draw([card()], {
      emptyZones: {
        key: 'k',
        render: (nodeId, zone) => {
          asked.push(`${nodeId}:${zone}`)
          return zone === 'headEnd' ? null : slot(nodeId, zone)
        },
      },
    })
    expect(asked.filter((entry) => entry.startsWith('c:')).sort()).toEqual(['c:footer', 'c:headEnd', 'c:titleSide'])
    expect(el.querySelector('[data-wb-zone="footer"] > [data-slot="c:footer"]')).not.toBeNull()
    expect(el.querySelector('[data-wb-zone="titleSide"] > [data-slot="c:titleSide"]')).not.toBeNull()
    // 든 구역에 `null` 이면 그 구역은 그대로다.
    expect(el.querySelector('[data-wb-zone="headEnd"] [data-slot]')).toBeNull()
    expect(el.querySelector('[data-wb-zone="headEnd"] > [data-wb-id="e"]')).not.toBeNull()
  })

  it('든 구역에도 덧붙으면 내용 뒤에 선다', () => {
    const el = draw([card()], { emptyZones: { key: 'k2', render: (nodeId, zone) => (zone === 'headEnd' ? slot(nodeId, zone) : null) } })
    const zone = el.querySelector('[data-wb-zone="headEnd"]')!
    expect(Array.from(zone.children).map((child) => child.getAttribute('data-wb-id') ?? child.getAttribute('data-slot'))).toEqual([
      'e',
      'c:headEnd',
    ])
  })

  it('없으면 빈 구역은 감싸는 요소째 없다 — 같은 노드 객체를 다른 열쇠로 그리면 캐시가 옛 그림을 안 낸다', () => {
    const doc = page([card()])
    const plain = draw([], {}, doc)
    expect(plain.querySelector('[data-wb-zone="footer"]')).toBeNull()
    cleanup()
    const slotted = draw([], { emptyZones: { key: 'k3', render: (nodeId, zone) => (zone === 'footer' ? slot(nodeId, zone) : null) } }, doc)
    expect(slotted.querySelector('[data-wb-zone="footer"] > [data-slot="c:footer"]')).not.toBeNull()
    cleanup()
    expect(draw([], {}, doc).querySelector('[data-wb-zone="footer"]')).toBeNull()
  })
})

describe('펼쳐 보이기(`reveal`)', () => {
  const tabs: WbNode = {
    id: 'tabs',
    type: 'Tabs',
    props: { active: 0 },
    children: [
      { id: 'p1', type: 'TabPanel', props: { label: '기본' }, children: [{ id: 't1', type: 'Text', props: { content: '하나' } }] },
      { id: 'p2', type: 'TabPanel', props: { label: '상세' }, children: [{ id: 't2', type: 'Text', props: { content: '둘' } }] },
    ],
  }
  const form: WbNode = {
    id: 'form',
    type: 'SearchForm',
    props: { collapsed: true },
    children: [{ id: 'f1', type: 'Field', props: { label: '이름' } }],
    zones: { actions: [button('go')] },
  }

  it('지금 탭이 아닌 패널 안 노드를 보이면 그 패널을 연 판으로 그린다 — 안 주면 지금 탭 그대로', () => {
    const doc = page([tabs])
    expect(draw([], {}, doc).querySelector('[data-wb-id="t2"]')).toBeNull()
    cleanup()
    const shown = draw([], { reveal: ['t2'] }, doc)
    expect(shown.querySelector('[data-wb-id="t2"]')).not.toBeNull()
    expect(shown.querySelector('[data-wb-id="t1"]')).toBeNull()
    // 문서는 안 바뀌었다.
    expect(tabs.props).toEqual({ active: 0 })
    cleanup()
    // 캐시가 펼친 그림을 남기지 않는다.
    expect(draw([], {}, doc).querySelector('[data-wb-id="t2"]')).toBeNull()
  })

  it('접힌 검색폼 안 노드(몸통 · 단추 구역)를 보이면 펴진 판으로 그린다', () => {
    const doc = page([form])
    expect(draw([], {}, doc).querySelector('[data-wb-id="go"]')).toBeNull()
    cleanup()
    expect(draw([], { reveal: ['go'] }, doc).querySelector('[data-wb-id="go"]')).not.toBeNull()
    cleanup()
    expect(draw([], { reveal: ['f1'] }, doc).querySelector('[data-wb-id="f1"]')).not.toBeNull()
  })

  it('패널 머리(탭 패널 자신)를 보이면 그 탭을 연다 — 이미 보이는 노드면 아무것도 안 바뀐다', () => {
    const doc = page([tabs])
    const opened = draw([], { reveal: ['p2'] }, doc)
    expect(opened.querySelector('[data-wb-id="t2"]')).not.toBeNull()
    cleanup()
    const same = draw([], { reveal: ['t1'] }, doc)
    expect(same.querySelector('[data-wb-id="t1"]')).not.toBeNull()
    expect(same.querySelector('[data-wb-id="t2"]')).toBeNull()
  })
})
