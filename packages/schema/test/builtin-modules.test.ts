/**
 * 기본 모듈(`module/builtin.ts` — 옛 내장 페이지 프리셋 셋의 내용). **정본 설계서 「모듈」이 이름으로 지목한 것을 하나씩 대조한다.**
 *
 * **수를 산문에 적지 않는다.** 모듈이 셋인 것도, 각 모듈이 무엇을 쓰는지도 아래 케이스가 목록에서 만든다 — 산문에 적은 수는 목록이 바뀔
 * 때 함께 안 바뀌어 조용히 낡는다.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { installCatalog } from '../src/component/catalog/index'
import { CATALOG_TYPES } from '../src/component/catalog/index'
import { BUILTIN_MODULES } from '../src/module/builtin'
import type { PageDocument, WbNode } from '../src/node'
import { collectNodeIds, walkNodes } from '../src/tree'
import { MODULE_NAME_MAX } from '../src/module/save'
import { validatePage } from '../src/validate'

beforeAll(() => {
  installCatalog()
})

/** 옛 내장 프리셋(`git show 35c2158b:packages/schema/src/preset/builtin.ts`)의 노드 수 — 옮기며 노드가 빠지거나 늘지 않았는지 잰다. */
const NODE_COUNTS: Record<string, number> = { 'search-list': 5, detail: 6, 'entry-form': 8 }

/**
 * 모듈을 페이지 끝에 넣은 문서로 만든다. root 는 모듈의 것이 아니다 — 아무 페이지의 root 를 빌려 `children`만 꽂는다.
 */
function documentOf(nodes: readonly WbNode[]): PageDocument {
  return { version: 1, root: { id: 'n_root', type: 'Page', children: [...nodes] } }
}

/** 모듈 하나가 품은 모든 노드. 트리를 평평하게 편다. */
function allNodes(nodes: readonly WbNode[]): WbNode[] {
  return nodes.flatMap((node) => [...walkNodes(node)].map((visit) => visit.node))
}

function typesOf(nodes: readonly WbNode[]): string[] {
  return allNodes(nodes).map((node) => node.type)
}

/**
 * 키로 하나 고른다. **케이스 안의 헬퍼다** — 부르는 자리가 케이스뿐인 것을 공개 표면
 * (`getBuiltinModule` 같은 export)에 두면 그것이 무엇을 지키는지 아무도
 * 확인하지 않은 채 남는다.
 */
function builtin(key: string) {
  const found = BUILTIN_MODULES.find((entry) => entry.key === key)
  if (found === undefined) throw new Error(`기본 모듈이 없습니다: ${key}`)
  return found
}

/** 이 트리에 `marker`가 하나라도 있는가. 같은 이유로 케이스 안에 둔다. */
function hasMarker(nodes: readonly WbNode[]): boolean {
  return allNodes(nodes).some((node) => node.marker !== undefined)
}

describe('기본 모듈', () => {
  it('정본 설계서 「모듈」이 든 셋이 키로 있다', () => {
    // **수를 적지 않고 키를 적는다** — 하나가 사라지거나 이름이 바뀌면 이 배열이 그것을 말한다.
    expect(BUILTIN_MODULES.map((entry) => entry.key)).toEqual(['search-list', 'detail', 'entry-form'])
  })

  it('키가 서로 다르다', () => {
    const keys = BUILTIN_MODULES.map((entry) => entry.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('키가 이름과 짝이다', () => {
    expect(builtin('detail').name).toBe('상세 조회형')
  })

  // **케이스가 모듈마다 돈다.** 목록에서 만들므로 모듈을 더해도 이 파일의 수가 낡지 않는다.
  for (const entry of BUILTIN_MODULES) {
    describe(entry.key, () => {
      it('꽂은 문서가 validatePage를 이슈 없이 지난다', () => {
        // **`error`만이 아니라 이슈 전부가 0이어야 한다.** `ignored-variant`는 warning이라
        // 저장을 막지 않지만, 기본 모듈이 그것을 달고 다니면 **넣은 문서가 매번 경고를
        // 낸다** — `Field`에 `variant`를 적으면 그렇게 된다(`variantFrom: 'control'`).
        expect(validatePage(documentOf(entry.nodes))).toEqual([])
      })

      it('marker를 담지 않는다', () => {
        expect(hasMarker(entry.nodes)).toBe(false)
      })

      it('노드 id가 모듈 안에서 유일하다', () => {
        const ids = entry.nodes.flatMap((node) => collectNodeIds(node))
        expect(new Set(ids).size).toBe(ids.length)
      })

      it('카탈로그에 있는 타입만 쓴다', () => {
        expect(typesOf(entry.nodes).filter((type) => !CATALOG_TYPES.includes(type))).toEqual([])
      })

      it('이름이 비어 있지 않다 · 모듈 이름 한도 안이다', () => {
        expect(entry.name.length).toBeGreaterThan(0)
        expect(entry.name.length).toBeLessThanOrEqual(MODULE_NAME_MAX)
      })

      it('넣는 노드 수가 옮기기 전(옛 내장 프리셋)과 같다', () => {
        expect(allNodes(entry.nodes).length).toBe(NODE_COUNTS[entry.key])
      })
    })
  }

  /**
   * **옛 「페이지 프리셋」의 문장(지금 정본 「모듈」의 «기본 모듈»)을 그대로 대조한다.** 타입 이름이 카탈로그에 있는지만 보면
   * **props가 그 모양을 낼 수 있는지는 모른다** — *"페이지네이션"*은
   * 컴포넌트가 아니라 `List.props.pagination`이고, *"액션 버튼 그룹"*은 `Flex` 안의
   * `Button` 여럿이다. 그 둘이 여기서 값으로 확인된다.
   */
  it('검색 + 목록형은 SearchForm·List를 쓰고 페이지네이션이 켜져 있다', () => {
    const found = builtin('search-list')
    expect(typesOf(found.nodes)).toContain('SearchForm')
    const list = allNodes(found.nodes).find((node) => node.type === 'List')
    expect(list?.props?.['pagination']).toBe(true)
  })

  it('상세 조회형은 Card·KeyValue와 버튼 묶음을 쓴다', () => {
    const found = builtin('detail')
    const types = typesOf(found.nodes)
    expect(types).toContain('Card')
    expect(types).toContain('KeyValue')
    // *"액션 버튼 그룹"* — 버튼 하나가 아니라 묶음이고, 묶는 것이 `Flex`다.
    const group = allNodes(found.nodes).find((node) => node.type === 'Flex')
    expect(group?.children?.map((child) => child.type)).toEqual(['Button', 'Button', 'Button'])
  })

  it('등록/수정 폼형은 EntryForm과 필드 묶음을 쓰고 저장·취소가 있다', () => {
    const found = builtin('entry-form')
    const form = allNodes(found.nodes).find((node) => node.type === 'EntryForm')
    expect(form?.children?.every((child) => child.type === 'Field')).toBe(true)
    expect(form?.children?.length).toBeGreaterThan(1)
    const labels = allNodes(found.nodes)
      .filter((node) => node.type === 'Button')
      .map((node) => node.props?.['label'])
    expect(labels).toEqual(['저장', '취소'])
  })
})
