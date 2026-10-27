/**
 * 팝업 페이지 — 뿌리 타입이 둘(`Page` · `Popup`)이 된 판정과 대상 없는 액션 `closeModal` 의 길.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { prepareNodesForPaste } from '../src/clipboard'
import { assertZoneReferences, CATALOG_DEFS, installCatalog } from '../src/component/catalog/index'
import { PopupDef } from '../src/component/catalog/structure'
import { WbNodeSchema } from '../src/envelope'
import { moduleNodesForSave } from '../src/module/save'
import type { LayoutDocument, PageDocument, WbNode } from '../src/node'
import { isRootType, nestedPagesUnderRoot, validateLayout, validatePage } from '../src/validate'

beforeAll(() => {
  installCatalog()
})

const codes = (doc: PageDocument) => validatePage(doc).map((issue) => `${issue.code} ${issue.nodeId}`)

describe('뿌리 타입 — Page · Popup', () => {
  it('Popup 뿌리는 이슈가 없다 — 몸통 · 바닥 구역째', () => {
    const doc: PageDocument = {
      version: 5,
      root: {
        id: 'n_pop',
        type: 'Popup',
        props: { title: '사용자 검색', size: 'large' },
        children: [{ id: 'n_txt', type: 'Text' }],
        zones: { footer: [{ id: 'n_btn', type: 'Button', interactions: [{ on: 'click', actions: [{ type: 'closeModal' }] }] }] },
      },
    }
    expect(validatePage(doc)).toEqual([])
    expect(isRootType('Popup')).toBe(true)
    expect(isRootType('Page')).toBe(true)
    expect(isRootType('Card')).toBe(false)
  })

  it('Popup 은 뿌리 밖에 못 선다 — 화면 안의 팝업 · 팝업 안의 Page 둘 다 nested-page', () => {
    const inPage: PageDocument = { version: 5, root: { id: 'n_page', type: 'Page', children: [{ id: 'n_pop', type: 'Popup' }] } }
    expect(codes(inPage)).toEqual(['nested-page n_pop'])
    const inPopup: PageDocument = { version: 5, root: { id: 'n_pop', type: 'Popup', children: [{ id: 'n_page', type: 'Page' }] } }
    expect(codes(inPopup)).toEqual(['nested-page n_page'])
    // 프리셋 저장의 탐침도 같은 판정이다.
    expect(nestedPagesUnderRoot([{ id: 'n_pop', type: 'Popup' }]).map((issue) => issue.nodeId)).toEqual(['n_pop'])
  })

  it('레이아웃 뿌리는 Page 뿐이다 — Popup 뿌리는 bad-root', () => {
    const layout: LayoutDocument = { version: 5, root: { id: 'n_pop', type: 'Popup', children: [{ id: 'n_slot', type: 'Slot' }] } }
    expect(validateLayout(layout).map((issue) => `${issue.code} ${issue.message}`)).toEqual([
      'bad-root 루트는 Page여야 합니다 (현재: Popup)',
    ])
  })

  it('다른 뿌리 타입은 bad-root — 문장이 받는 둘을 말한다', () => {
    const doc: PageDocument = { version: 5, root: { id: 'n_card', type: 'Card' } }
    expect(validatePage(doc).map((issue) => issue.message)).toEqual(['루트는 Page 또는 Popup이어야 합니다 (현재: Card)'])
  })
})

describe('Popup 정의 — 바닥의 첫 내용', () => {
  it('바닥은 [취소][저장] 이고 «취소» 가 처음부터 «팝업 닫기» 를 든다', () => {
    const footer = PopupDef.zones.find((zone) => zone.name === 'footer')
    expect(footer?.initial).toEqual([
      { type: 'Button', props: { label: '취소' }, interactions: [{ on: 'click', actions: [{ type: 'closeModal' }] }] },
      { type: 'Button', props: { label: '저장' }, variant: 'primary' },
    ])
  })
})

describe('구역의 첫 내용이 싣는 상호작용', () => {
  // 만들 때 지은 id 를 몰라 노드를 겨냥하는 액션은 못 싣는다 — 대상 없는 액션만.
  const withSeed = (actions: unknown[]) =>
    CATALOG_DEFS.map((def) =>
      def.type !== 'Popup'
        ? def
        : {
            ...def,
            zones: [{ name: 'footer', label: '바닥', initial: [{ type: 'Button', interactions: [{ on: 'click', actions }] }] }],
          },
    ) as typeof CATALOG_DEFS

  it('대상 없는 액션은 받는다', () => {
    expect(() => assertZoneReferences(withSeed([{ type: 'closeModal' }]))).not.toThrow()
  })

  it('노드를 겨냥하는 액션 · 봉투 밖 꼴은 카탈로그를 모을 때 던진다', () => {
    expect(() => assertZoneReferences(withSeed([{ type: 'setVisible', target: 'n_x', value: false }]))).toThrow(
      'Popup.footer: 기본 내용 Button의 상호작용은 대상 없는 액션만 실을 수 있습니다',
    )
    expect(() => assertZoneReferences(withSeed([{ type: 'closeModal', target: 'n_x' }]))).toThrow('대상 없는 액션만')
  })
})

describe('closeModal — 대상이 없는 액션', () => {
  const closing: WbNode = { id: 'n_btn', type: 'Button', interactions: [{ on: 'click', actions: [{ type: 'closeModal' }] }] }

  it('봉투가 받는다 — 대상을 실으면 거절한다', () => {
    expect(WbNodeSchema.safeParse(closing).success).toBe(true)
    const withTarget = { ...closing, interactions: [{ on: 'click', actions: [{ type: 'closeModal', target: 'n_x' }] }] }
    expect(WbNodeSchema.safeParse(withTarget).success).toBe(false)
  })

  it('붙이기가 남긴다 — 밖을 가리키지 않는다', () => {
    const result = prepareNodesForPaste([closing], { node: () => false, page: () => false })
    expect(result.droppedActions).toBe(0)
    expect(result.nodes[0]?.interactions).toEqual([{ on: 'click', actions: [{ type: 'closeModal' }] }])
  })

  it('모듈 저장이 남긴다', () => {
    const saved = moduleNodesForSave([closing])
    expect(saved.droppedActions).toBe(0)
    expect(saved.nodes[0]?.interactions).toEqual([{ on: 'click', actions: [{ type: 'closeModal' }] }])
  })
})
