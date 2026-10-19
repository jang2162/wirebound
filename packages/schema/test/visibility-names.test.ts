/**
 * 상태를 붙인 이름 — 노드를 부르는 자리(상호작용 문장 · 읽기 `pageView` · 대상 고르개 · 번들 코멘트)는 그 노드가 `only` 로 보이는 상태를
 * 이름에 붙인다(설계 spec `2026-10-18-modules-states-layout-design.md` 「C5」). `namingContexts` 하나가 짓는다.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { installCatalog } from '../src/component/catalog/index'
import { listInteractionSentences, namingContexts, nodeDisplayName } from '../src/interaction/describe'
import type { PageDocument, WbNode } from '../src/node'

beforeAll(() => {
  installCatalog()
})

const button = (id: string, label: string, extra: Partial<WbNode> = {}): WbNode => ({ id, type: 'Button', props: { label }, ...extra })

function doc(children: WbNode[]): PageDocument {
  return {
    version: 2,
    viewStates: [
      { id: 's_admin', name: '관리자' },
      { id: 's_guest', name: '손님' },
    ],
    root: { id: 'n_root', type: 'Page', children },
  }
}

function nameOf(document: PageDocument, node: WbNode): string {
  return nodeDisplayName(node, namingContexts(document).get(node.id))
}

describe('namingContexts', () => {
  it("only [관리자] → '승인'(관리자 상태)", () => {
    const node = button('n_ok', '승인', { visibility: { mode: 'only', states: ['s_admin'] } })
    expect(nameOf(doc([node]), node)).toBe("'승인 버튼'(관리자 상태)")
  })

  it("only 둘 → '승인'(관리자 · 손님 상태) — 기본은 «기본»", () => {
    const two = button('n_ok', '승인', { visibility: { mode: 'only', states: ['s_admin', 's_guest'] } })
    expect(nameOf(doc([two]), two)).toBe("'승인 버튼'(관리자 · 손님 상태)")
    const plain = button('n_d', '보기', { visibility: { mode: 'only', states: ['default'] } })
    expect(nameOf(doc([plain]), plain)).toBe("'보기 버튼'(기본 상태)")
  })

  it('except · 보임 없음 → 붙지 않는다', () => {
    const except = button('n_x', '숨김', { visibility: { mode: 'except', states: ['s_admin'] } })
    const none = button('n_y', '늘')
    const document = doc([except, none])
    expect(nameOf(document, except)).toBe('숨김 버튼')
    expect(nameOf(document, none)).toBe('늘 버튼')
    expect(namingContexts(document).size).toBe(0)
  })

  it('가장 가까운 보임이 정한다 — only 카드 안 버튼은 그 상태 · 안에서 except 를 만나면 끊긴다', () => {
    const inner = button('n_in', '안')
    const cut = button('n_cut', '끊김', { visibility: { mode: 'except', states: ['s_guest'] } })
    const card: WbNode = { id: 'n_card', type: 'Card', visibility: { mode: 'only', states: ['s_admin'] }, children: [inner, cut] }
    const document = doc([card])
    expect(nameOf(document, inner)).toBe("'안 버튼'(관리자 상태)")
    expect(nameOf(document, cut)).toBe('끊김 버튼')
  })

  it('상호작용 문장도 같은 이름이다', () => {
    const target = button('n_ok', '승인', { visibility: { mode: 'only', states: ['s_admin'] } })
    const source = button('n_go', '목록', {
      interactions: [{ on: 'click', actions: [{ type: 'setVisible', target: 'n_ok', value: false }] }],
    })
    const [sentence] = listInteractionSentences(doc([source, target]))
    expect(sentence!.text).toContain("'승인 버튼'(관리자 상태)")
  })
})
