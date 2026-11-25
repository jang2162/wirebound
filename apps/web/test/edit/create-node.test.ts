// @vitest-environment node
/**
 * `createNode`의 계약. **화면 없이 돈다** — 순수 함수다.
 *
 * **이 파일의 값어치는 카탈로그를 훑는 케이스에 있다.** 분모를 손으로 적지 않으므로
 * 컴포넌트가 늘면 거기서 죽는다(속성 패널 테스트가 `listComponents()`로 control 일곱을
 * 대조하는 것과 같은 방식).
 */
import {
  BODY_ZONE,
  CURRENT_DOCUMENT_VERSION,
  getComponent,
  isRootType,
  listComponents,
  newPageDocument,
  placementsOf,
  validatePage,
  type PageDocument,
  type ValidationIssue,
  type WbNode,
} from '@wirebound/schema'
import { describe, expect, it } from 'vitest'
import '../../src/catalog-setup'
import { createNode } from '../../src/edit/create-node'

/** 뿌리 타입(`Page` · `Popup`)을 그대로 뿌리로 둔 페이지 — 레이아웃은 그 뿌리의 짝이다. */
function rootPage(node: WbNode): PageDocument {
  return { version: CURRENT_DOCUMENT_VERSION, layout: node.type === 'Popup' ? 'popup' : 'blank', root: node }
}

/** 만든 노드를 루트 밑에 하나 단 페이지. 검증은 문서 단위라 봉투가 필요하다. */
function pageWith(node: WbNode): PageDocument {
  return { version: CURRENT_DOCUMENT_VERSION, layout: 'blank', root: { id: 'n_root', type: 'Page', children: [node] } }
}

/** 설 자리가 정해진 타입(`TabPanel`)은 그 자리(부모 타입의 그 구역)에 놓은 페이지 — 뿌리 밑에 두면 `misplaced-component` 로 늘 거절된다. */
/** 설 자리가 정해진 타입은 그 자리에 놓는다 — 설 자리의 부모도 설 자리가 있으면(칸 → 행 → 그리드) 겹으로 감싼다. */
function placedPage(node: WbNode): PageDocument {
  let placed = node
  for (
    let host = placementsOf(getComponent(node.type))[0], depth = 0;
    host !== undefined;
    host = placementsOf(getComponent(host.type))[0], depth++
  ) {
    placed = {
      id: `n_host${depth}`,
      type: host.type,
      ...(host.zone === BODY_ZONE ? { children: [placed] } : { zones: { [host.zone]: [placed] } }),
    }
  }
  return pageWith(placed)
}

/** 구역에 기본 내용(`initial`)을 갖는 타입인가 — 그 타입은 만들 때 그 노드가 함께 든다. */
const seeded = (type: string): boolean => (getComponent(type)?.zones ?? []).some((zone) => zone.initial !== undefined)

/**
 * 노드 자체의 검증 이슈만. `slot-count`는 **노드가 아니라 문서 종류의 제약**이라
 * 가른다 — 페이지에는 `Slot`을 둘 수 없다(설계서 「레이아웃」). 그것은 `createNode`가 무엇을
 * 만드느냐의 문제가 아니고, 타입 목록이 무엇을 보이느냐의 문제다.
 */
function nodeIssues(document: PageDocument): ValidationIssue[] {
  return validatePage(document).filter((issue) => issue.code !== 'slot-count')
}

/** 결정적인 id 생성기. 스토어의 `nextOpId`를 주입하는 것과 같은 이유다. */
function countingIds(): () => string {
  let n = 0
  return () => `n_test${(n += 1)}`
}

describe('createNode', () => {
  it('타입과 id를 가진 노드를 만든다', () => {
    expect(createNode('Text', countingIds())).toEqual({ id: 'n_test1', type: 'Text' })
  })

  it('id가 매번 다르다', () => {
    // 주입 없이 실제 생성기를 쓴다 — 기본 인자가 상수를 내는 구현을 잡는다.
    const first = createNode('Text')
    const second = createNode('Text')

    expect(first?.id).not.toBe(second?.id)
    expect(first?.id).toMatch(/^n_[0-9a-f]{12}$/)
  })

  it('카탈로그에 없는 타입이면 null이다', () => {
    expect(createNode('Nonexistent')).toBeNull()
  })

  it('없는 타입이면 id를 소비하지 않는다', () => {
    // 스토어의 `applyEdit`이 적용 실패 시 id를 소비하지 않는 것과 같은 이유다 —
    // 주입한 생성기의 결정성이 실패한 호출 때문에 어긋나면 안 된다.
    const nextId = countingIds()

    expect(createNode('Nonexistent', nextId)).toBeNull()
    expect(createNode('Text', nextId)).toEqual({ id: 'n_test1', type: 'Text' })
  })

  it('만든 노드가 검증을 통과한다', () => {
    // **핵심.** props를 하나도 채우지 않는데 통과하는 것은 카탈로그의 모든 prop이
    // `.default()`를 갖기 때문이다(아래 케이스가 그것을 카탈로그째 고정한다).
    const node = createNode('Card', countingIds())

    expect(node).not.toBeNull()
    expect(validatePage(pageWith(node as WbNode))).toEqual([])
  })

  it('모든 카탈로그 타입에 대해 검증을 통과한다', () => {
    // **분모를 손으로 적지 않는다** — 카탈로그에 컴포넌트가 늘면 여기서 죽는다. 뿌리 타입(`Page` · `Popup`)은 페이지 안에 못 선다(`nested-page`
    // — 아래 «페이지에 둘 수 없는 타입») — 뿌리로 세워 잰다.
    const nextId = countingIds()

    for (const def of listComponents().filter((def) => def.type !== 'Page')) {
      const node = createNode(def.type, nextId)
      expect(node, def.type).not.toBeNull()
      const doc = isRootType(def.type) ? rootPage(node as WbNode) : placedPage(node as WbNode)
      expect(nodeIssues(doc), def.type).toEqual([])
    }
  })

  it('.default()가 없는 필수 prop을 가진 컴포넌트가 없다', () => {
    // **그런 컴포넌트의 수를 재는 자리다 — 0이어야 한다.** 카탈로그 전부가
    // `props.safeParse({})`를 통과하므로 `createNode`는 `{ id, type }`만 만들면 된다.
    // 손으로 기본값 표를 두지 않는 근거가 이것이고, **하나라도 생기면 여기서 죽는다** —
    // 그때 채울 값은 `props.parse({})`가 주는 것을 그대로 쓰는 편이 정확하다.
    const failing = listComponents()
      .filter((def) => !def.props.safeParse({}).success)
      .map((def) => def.type)

    expect(failing).toEqual([])
  })

  it('props를 만들지 않는다', () => {
    // 위 케이스의 짝이다. 기본값을 문서에 굽지 않는 것은 **카탈로그가 기본값을 바꾸면
    // 옛 노드만 옛 값에 붙박이기 때문이다** — 검증·렌더가 `props ?? {}`로 스키마
    // 기본값을 읽으므로(`validate.ts`·렌더러) 문서에 없는 것이 곧 "카탈로그를 따른다"다.
    // 기본 내용이 든 타입(검색폼 · 입력폼 · 탭 · 입력 필드)은 제 노드에 `props` 가 없고, 든 노드는 카탈로그 `initial` 이 적은 props 만 갖는다
    // (아래 «기본 내용» 케이스).
    for (const def of listComponents()) {
      const node = createNode(def.type, countingIds())
      if (seeded(def.type)) expect(node, def.type).not.toHaveProperty('props')
      else expect(node, def.type).toEqual({ id: 'n_test1', type: def.type })
    }
  })

  it('기본 내용 — 구역의 `initial` 이 실제 노드로 들고 id 는 같은 생성기에서 차례로 나온다', () => {
    const withSeeds = listComponents().filter((def) => seeded(def.type))
    expect(withSeeds.map((def) => def.type).sort()).toEqual([
      'DataGrid',
      'EntryForm',
      'Field',
      'FileAttach',
      'FormTable',
      'GridColumn',
      'Popup',
      'SearchForm',
      'Tabs',
    ])

    // 입력 필드는 팔레트 한 걸음으로 «라벨 + 입력 하나» 가 선다 — 값 칸에 `Input` 하나(props 없음 · 카탈로그 기본값을 따른다).
    expect(createNode('Field', countingIds())).toEqual({ id: 'n_test1', type: 'Field', children: [{ id: 'n_test2', type: 'Input' }] })

    expect(createNode('SearchForm', countingIds())).toEqual({
      id: 'n_test1',
      type: 'SearchForm',
      zones: {
        actions: [
          { id: 'n_test2', type: 'Button', props: { label: '초기화' } },
          { id: 'n_test3', type: 'Button', props: { label: '검색' }, variant: 'primary' },
        ],
      },
    })
    // 새 입력폼은 1쌍 폼 표(필드 셋 — 필드마다 값 칸의 `Input`)를 들고 선다 — 기본 내용이 겹으로 돈다.
    const field = (n: number) => ({ id: `n_test${n}`, type: 'Field', children: [{ id: `n_test${n + 1}`, type: 'Input' }] })
    expect(createNode('EntryForm', countingIds())).toEqual({
      id: 'n_test1',
      type: 'EntryForm',
      children: [{ id: 'n_test2', type: 'FormTable', children: [field(3), field(5), field(7)] }],
      zones: {
        actions: [
          { id: 'n_test9', type: 'Button', props: { label: '저장' }, variant: 'primary' },
          { id: 'n_test10', type: 'Button', props: { label: '취소' } },
        ],
      },
    })
    expect(createNode('Tabs', countingIds())).toEqual({
      id: 'n_test1',
      type: 'Tabs',
      children: [
        { id: 'n_test2', type: 'TabPanel', props: { label: '탭 1' } },
        { id: 'n_test3', type: 'TabPanel', props: { label: '탭 2' } },
      ],
    })
    // 새 그리드는 열 셋(열마다 셀 틀 글 하나) · 되풀이 5 줄 · 바닥의 페이지네이션 바를 들고 선다 — 열의 셀 틀도 기본 내용이라 겹으로 돈다.
    const column = (n: number, label: string) => ({
      id: `n_test${n}`,
      type: 'GridColumn',
      props: { label },
      children: [{ id: `n_test${n + 1}`, type: 'Text', props: { content: '—' } }],
    })
    expect(createNode('DataGrid', countingIds())).toEqual({
      id: 'n_test1',
      type: 'DataGrid',
      children: [column(2, '컬럼 1'), column(4, '컬럼 2'), column(6, '컬럼 3')],
      zones: {
        rows: [{ id: 'n_test8', type: 'GridRow', props: { repeat: 5 } }],
        footer: [{ id: 'n_test9', type: 'Pagination' }],
      },
    })
    // 새 팝업의 바닥은 `[취소][저장]` — «취소» 가 처음부터 «팝업 닫기» 를 든다(기본 내용의 상호작용도 싣는다).
    expect(createNode('Popup', countingIds())).toEqual({
      id: 'n_test1',
      type: 'Popup',
      zones: {
        footer: [
          { id: 'n_test2', type: 'Button', props: { label: '취소' }, interactions: [{ on: 'click', actions: [{ type: 'closeModal' }] }] },
          { id: 'n_test3', type: 'Button', props: { label: '저장' }, variant: 'primary' },
        ],
      },
    })
    for (const def of withSeeds) {
      const node = createNode(def.type, countingIds()) as WbNode
      const doc = isRootType(def.type) ? rootPage(node) : placedPage(node)
      expect(validatePage(doc), def.type).toEqual([])
    }
  })

  it('프리셋 — 템플릿이 내용 전부다(구역의 기본 내용을 안 붙인다) · id 는 같은 생성기에서 · 검증을 지난다', () => {
    const column = (n: number, label: string, piece: Record<string, unknown>, props: Record<string, unknown> = {}) => ({
      id: `n_test${n}`,
      type: 'GridColumn',
      props: { label, ...props },
      children: [{ id: `n_test${n + 1}`, ...piece }],
    })
    const made = createNode('DataGrid', countingIds(), 'repeatRows')
    expect(made).toEqual({
      id: 'n_test1',
      type: 'DataGrid',
      children: [
        column(2, '항목 1', { type: 'Input' }),
        column(4, '항목 2', { type: 'Input' }),
        column(6, '삭제', { type: 'Button', props: { label: '삭제' } }, { size: 'short', align: 'center' }),
      ],
      zones: {
        headEnd: [{ id: 'n_test8', type: 'Button', props: { label: '추가' } }],
        rows: [{ id: 'n_test9', type: 'GridRow', props: { repeat: 2 } }],
      },
    })
    expect(validatePage(placedPage(made as WbNode))).toEqual([])
  })

  it('프리셋 — 그 타입에 없는 키면 null 이고 id 를 안 쓴다', () => {
    const ids = countingIds()
    expect(createNode('DataGrid', ids, 'nope')).toBeNull()
    expect(createNode('Button', ids, 'repeatRows')).toBeNull()
    expect(createNode('Nope', ids, 'repeatRows')).toBeNull()
    expect(ids()).toBe('n_test1')
  })

  it('서버가 짓는 새 팝업 페이지의 뿌리는 에디터가 짓는 팝업 노드와 같은 꼴이다 — 제목 · 빈 몸통만 더한다', () => {
    // 두 자리(`@wirebound/schema` 의 `newPageDocument` · 이 함수)가 기본 내용을 따로 편다 — 갈리면 여기서 죽는다.
    expect(newPageDocument('popup', '사용자 검색', countingIds()).root).toEqual({
      ...createNode('Popup', countingIds()),
      props: { title: '사용자 검색' },
      children: [],
    })
  })

  it('몸통을 받는 타입도 빈 children을 갖지 않는다 — 기본 내용이 없는 구역은 키가 없다', () => {
    // 어느 쪽이든 검증은 통과한다(실측: `children: []`을 붙인 판도 이슈 0이다). 갖지 않는
    // 쪽을 고른 것은 `insertNodeOps`가 `children` 키가 없는 부모에 **배열째 넣는 갈래를
    // 갖기** 때문이다(그쪽 실측).
    //
    // **"빈 배열을 미리 두면 undo 왕복 뒤 그 키가 남아 원본과 달라진다"는 근거가 못 된다** —
    // 재 보면 **두 판 모두 왕복이 자기 원본과 같다.** 잔여물은 오히려 지금 구현 쪽에 있고
    // (넣은 뒤 `removeNodeOps`로 지우면 `children: []`이 남는다) 그것도 무해하다. 자세한 값은
    // `src/edit/create-node.ts` 머리말에 있다.
    const many = listComponents().filter((def) => def.zones.some((zone) => zone.name === 'body' && zone.initial === undefined))

    // 분모가 0이면 이 케이스는 아무것도 재지 않는다.
    expect(many.length).toBeGreaterThan(0)
    for (const def of many) {
      expect(createNode(def.type, countingIds()), def.type).not.toHaveProperty('children')
    }
    // 이름 붙은 구역도 기본 내용이 없으면 `zones` 키가 없다(카드 — 구역이 다 빈 채 서는 타입은 지금 이것 하나다).
    expect(createNode('Card', countingIds())).toEqual({ id: expect.any(String), type: 'Card' })
  })

  it('페이지에 바로 둘 수 없는 타입은 뿌리 Page · Popup · Slot · 탭 안의 TabPanel · 그리드의 부품 넷이다', () => {
    // `createNode`의 계약이 아니라 **카탈로그의 성질**이다. 타입 목록이 무엇을
    // 걸러야 하는지가 여기서 나온다 — 설계서 「레이아웃」이 Slot을 레이아웃 전용으로 두고,
    // `validatePage`가 `slot-count`로 거절한다(실측). `Page` 는 뿌리에만 서고 안에 두면 `nested-page` 다. `TabPanel` 은 탭 안에만 서고
    // 페이지에 바로 두면 `misplaced-component` 다(설 자리가 정해진 타입 — 하단 판은 그 자리에 놓아 잰다 · `palette/placeable.ts`). 그리드의 열 묶음 ·
    // 열 · 행 · 칸도 그렇다(그리드 · 열 묶음 · 행 안에만 선다).
    // 카탈로그에 그런 타입이 더 생기면 여기서 죽어야 한다.
    const blocked = listComponents()
      .filter((def) => {
        const node = createNode(def.type, countingIds())
        return node !== null && validatePage(pageWith(node)).length > 0
      })
      .map((def) => def.type)

    expect(blocked).toEqual(['Page', 'Popup', 'Slot', 'TabPanel', 'GridColumnGroup', 'GridColumn', 'GridRow', 'GridCell'])
  })
})
