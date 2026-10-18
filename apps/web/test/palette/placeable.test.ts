/**
 * `placeableGroups` — 하단 컴포넌트 판에 둘 수 있는 타입 목록(`src/palette/placeable.ts`). 구조 트리의 타입 고르개를 걷으며 그 파일의 케이스
 * (옛 `panels/type-picker-placeable.test.tsx` · `panels/type-picker.test.tsx` 의 목록 성질)를 이 순수 층으로 옮겼다 — 판(카드 · 갈래 탭)의 화면은
 * `./palette-cards.test.tsx` 가 잰다.
 *
 * **분모를 손으로 적지 않는다** — `listComponents()` 를 훑어 `validatePage` 를 실제로 통과하는 것을 계산한다. 카탈로그에 컴포넌트가 늘면
 * 여기서 죽는다 — 그것이 «갈래 표를 손으로 두지 않는다»는 판단을 지키는 자리다.
 *
 * 변조: `nested-page` 검사를 떼면 첫 케이스가 죽는다. 둘째 케이스(`Slot` 이 없다 · 나머지가 있다)는 안 죽는다 — 대조군이다.
 */
import { describe, expect, it } from 'vitest'
import { listComponents, validatePage } from '@wirebound/schema'
import { createNode } from '../../src/edit/create-node'
import { placeableGroups } from '../../src/palette/placeable'

const placeable = (): string[] => placeableGroups().flatMap((group) => group.types.map((type) => type.type))

/** 페이지 문서 안에 둘 수 있는 타입 — `bad-root` 가 나는(뿌리가 될 수 없는) 타입 가운데 페이지의 자식으로 검증을 지나는 것. */
function placeableTypes(): string[] {
  return listComponents()
    .filter((def) => {
      const node = createNode(def.type, () => 'n-probe')
      if (node === null) return false
      if (!validatePage({ version: 1, root: node }).some((issue) => issue.code === 'bad-root')) return false
      return validatePage({ version: 1, root: { id: 'r', type: 'Page', children: [node] } }).length === 0
    })
    .map((def) => def.type)
}

describe('placeableGroups', () => {
  it('뿌리 타입(Page)은 목록에 없다', () => {
    expect(placeable()).not.toContain('Page')
  })

  it('대조군 — 레이아웃 전용 Slot 은 여전히 없고 일반 타입(Section · Text)은 있다', () => {
    const types = placeable()
    expect(types).not.toContain('Slot')
    expect(types).toEqual(expect.arrayContaining(['Section', 'Text']))
    expect(types.length).toBeGreaterThan(10)
  })

  it('페이지에 둘 수 있는 모든 타입이 목록에 있다 — 분모는 카탈로그에서 계산한다', () => {
    expect(placeable().slice().sort()).toEqual(placeableTypes().slice().sort())
    expect(placeable().length).toBeGreaterThan(0)
  })

  it('페이지에 둘 수 없는 타입은 목록에 없다 — 뿌리 · 레이아웃 전용', () => {
    const blocked = listComponents()
      .map((def) => def.type)
      .filter((type) => !placeableTypes().includes(type))
    expect(blocked).toEqual(['Page', 'Slot'])
    for (const type of blocked) expect(placeable(), type).not.toContain(type)
  })

  it('갈래 안은 한국어 이름순이다 — 영문 타입명순과 갈리는 갈래가 있다', () => {
    const groups = placeableGroups()
    expect(groups.length).toBeGreaterThan(0)
    let differsFromTypeOrder = 0
    for (const group of groups) {
      const names = group.types.map((type) => type.label)
      expect(names, group.label).toEqual(names.slice().sort((a, b) => a.localeCompare(b, 'ko')))
      const types = group.types.map((type) => type.type)
      if (types.join() !== types.slice().sort().join()) differsFromTypeOrder += 1
    }
    // 양성 대조 — 두 순서가 어디서도 안 갈리면 위 단언은 영문 타입명순 구현도 통과시킨다.
    expect(differsFromTypeOrder).toBeGreaterThan(0)
  })
})
