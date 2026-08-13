/**
 * 내장 페이지 프리셋(P7-2 T1 — D1·D4). **§11.1이 이름으로 지목한 것을 하나씩 대조한다.**
 *
 * **수를 산문에 적지 않는다.** 프리셋이 셋인 것도, 각 프리셋이 무엇을 쓰는지도 아래
 * 케이스가 목록에서 만든다 — 계획서의 전역 제약이 요구한 것이고, P7-1에서 사망 수가
 * 한 세션 안에 세 번 낡은 것이 그 이유다.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { installCatalog } from '../src/component/catalog/index'
import { CATALOG_TYPES } from '../src/component/catalog/index'
import { BUILTIN_PRESETS, getBuiltinPreset, hasMarker, stripMarkers } from '../src/preset/builtin'
import type { PageDocument, WbNode } from '../src/node'
import { collectNodeIds, walkNodes } from '../src/tree'
import { validatePage } from '../src/validate'

beforeAll(() => {
  installCatalog()
})

/**
 * 프리셋을 페이지 문서로 만든다. **root는 프리셋의 것이 아니다**(D3) — 적용도 root를
 * 바꾸지 않으므로, 여기서도 아무 페이지의 root를 빌려 `children`만 꽂는다.
 */
function documentOf(nodes: readonly WbNode[]): PageDocument {
  return { version: 1, root: { id: 'n_root', type: 'Page', children: [...nodes] } }
}

/** 프리셋 하나가 품은 모든 노드. 트리를 평평하게 편다. */
function allNodes(nodes: readonly WbNode[]): WbNode[] {
  return nodes.flatMap((node) => [...walkNodes(node)].map((visit) => visit.node))
}

function typesOf(nodes: readonly WbNode[]): string[] {
  return allNodes(nodes).map((node) => node.type)
}

describe('내장 프리셋', () => {
  it('§11.1이 든 셋이 키로 있다', () => {
    // 계획서가 §11.1에서 옮긴 이름 셋. **수를 적지 않고 키를 적는다** —
    // 하나가 사라지거나 이름이 바뀌면 이 배열이 그것을 말한다.
    expect(BUILTIN_PRESETS.map((preset) => preset.key)).toEqual([
      'search-list',
      'detail',
      'entry-form',
    ])
  })

  it('키가 서로 다르다', () => {
    const keys = BUILTIN_PRESETS.map((preset) => preset.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('키로 고를 수 있고 없는 키는 undefined다', () => {
    expect(getBuiltinPreset('detail')?.name).toBe('상세 조회형')
    expect(getBuiltinPreset('없는키')).toBeUndefined()
  })

  // **케이스가 프리셋마다 돈다.** 목록에서 만들므로 프리셋을 더해도 이 파일의 수가
  // 낡지 않는다.
  for (const preset of BUILTIN_PRESETS) {
    describe(preset.key, () => {
      it('꽂은 문서가 validatePage를 이슈 없이 지난다', () => {
        // **`error`만이 아니라 이슈 전부가 0이어야 한다.** `ignored-variant`는 warning이라
        // 저장을 막지 않지만, 내장 프리셋이 그것을 달고 다니면 **적용한 문서가 매번 경고를
        // 낸다** — `Field`에 `variant`를 적으면 그렇게 된다(`variantFrom: 'control'`).
        expect(validatePage(documentOf(preset.nodes))).toEqual([])
      })

      it('marker를 담지 않는다(D4)', () => {
        expect(hasMarker(preset.nodes)).toBe(false)
      })

      it('노드 id가 프리셋 안에서 유일하다', () => {
        const ids = preset.nodes.flatMap((node) => collectNodeIds(node))
        expect(new Set(ids).size).toBe(ids.length)
      })

      it('카탈로그에 있는 타입만 쓴다', () => {
        expect(typesOf(preset.nodes).filter((type) => !CATALOG_TYPES.includes(type))).toEqual([])
      })

      it('이름과 설명이 비어 있지 않다', () => {
        expect(preset.name.length).toBeGreaterThan(0)
        expect(preset.description.length).toBeGreaterThan(0)
      })
    })
  }

  /**
   * **§11.1의 문장을 그대로 대조한다**(재라 #3). 계획서는 타입 이름이 카탈로그에 있는지만
   * `grep`으로 봤고 **props가 그 모양을 낼 수 있는지는 안 봤다** — *"페이지네이션"*은
   * 컴포넌트가 아니라 `List.props.pagination`이고, *"액션 버튼 그룹"*은 `Flex` 안의
   * `Button` 여럿이다. 그 둘이 여기서 값으로 확인된다.
   */
  it('검색 + 목록형은 SearchForm·List를 쓰고 페이지네이션이 켜져 있다', () => {
    const preset = getBuiltinPreset('search-list')!
    expect(typesOf(preset.nodes)).toContain('SearchForm')
    const list = allNodes(preset.nodes).find((node) => node.type === 'List')
    expect(list?.props?.['pagination']).toBe(true)
  })

  it('상세 조회형은 Card·KeyValue와 버튼 묶음을 쓴다', () => {
    const preset = getBuiltinPreset('detail')!
    const types = typesOf(preset.nodes)
    expect(types).toContain('Card')
    expect(types).toContain('KeyValue')
    // *"액션 버튼 그룹"* — 버튼 하나가 아니라 묶음이고, 묶는 것이 `Flex`다.
    const group = allNodes(preset.nodes).find((node) => node.type === 'Flex')
    expect(group?.children?.map((child) => child.type)).toEqual(['Button', 'Button', 'Button'])
  })

  it('등록/수정 폼형은 EntryForm과 필드 묶음을 쓰고 저장·취소가 있다', () => {
    const preset = getBuiltinPreset('entry-form')!
    const form = allNodes(preset.nodes).find((node) => node.type === 'EntryForm')
    expect(form?.children?.every((child) => child.type === 'Field')).toBe(true)
    expect(form?.children?.length).toBeGreaterThan(1)
    const labels = allNodes(preset.nodes)
      .filter((node) => node.type === 'Button')
      .map((node) => node.props?.['label'])
    expect(labels).toEqual(['저장', '취소'])
  })
})

describe('stripMarkers', () => {
  it('트리 어디에 있든 marker를 버린다', () => {
    const nodes: WbNode[] = [
      {
        id: 'a',
        type: 'Card',
        marker: 1,
        children: [{ id: 'b', type: 'Text', marker: 2, props: { text: '값' } }],
      },
    ]
    const stripped = stripMarkers(nodes)
    expect(hasMarker(stripped)).toBe(false)
    // 원본은 건드리지 않는다 — 부르는 쪽이 들고 있는 문서다.
    expect(hasMarker(nodes)).toBe(true)
  })

  it('marker 말고는 그대로 두고 상호작용도 남긴다(D4)', () => {
    const nodes: WbNode[] = [
      {
        id: 'a',
        type: 'Button',
        props: { label: '저장' },
        variant: 'primary',
        marker: 3,
        interactions: [{ on: 'click', actions: [{ type: 'setVisible', target: 'b', value: true }] }],
        children: [],
      },
    ]
    expect(stripMarkers(nodes)).toEqual([
      {
        id: 'a',
        type: 'Button',
        props: { label: '저장' },
        variant: 'primary',
        interactions: [{ on: 'click', actions: [{ type: 'setVisible', target: 'b', value: true }] }],
        children: [],
      },
    ])
  })

  it('값을 공유하지 않는다 — 뒤에 원본을 고쳐도 담은 것이 그대로다', () => {
    const nodes: WbNode[] = [{ id: 'a', type: 'List', props: { columns: ['하나'] } }]
    const stripped = stripMarkers(nodes)
    ;(nodes[0]!.props!['columns'] as string[]).push('둘')
    expect(stripped[0]!.props!['columns']).toEqual(['하나'])
  })

  /**
   * **`structuredClone`을 쓰지 않은 이유를 값으로 고정한다**(P7-1 이월 §1 ㉡). 함수를 담은
   * props에서 `structuredClone`은 `DOMException`을 던진다 — 저장 경계 **앞**에서 던지면
   * 사용자는 왜 저장이 안 되는지 듣지 못한다. 여기서는 그 자리가 조용히 비고, 무엇이
   * 잘못됐는지는 저장 경계의 카탈로그 검증이 말한다.
   */
  it('함수를 담은 props에서 던지지 않는다', () => {
    const nodes: WbNode[] = [{ id: 'a', type: 'Text', props: { text: () => 1 } }]
    expect(() => stripMarkers(nodes)).not.toThrow()
    expect(stripMarkers(nodes)[0]!.props).toEqual({})
  })
})
