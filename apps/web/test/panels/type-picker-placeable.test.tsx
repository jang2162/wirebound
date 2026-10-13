/**
 * `placeableGroups` — 페이지 안에 둘 수 있는 타입 목록. **뿌리 타입(`Page`)은 안에 둘 수 없다** — 검증(`validatePage`)이 뿌리 밖 `Page` 를
 * `nested-page` 로 막아, 다른 타입과 같은 프로브 한 줄이 거른다(`panels/type-picker.tsx` 의 `placeableGroups`).
 *
 * 변조: `nested-page` 검사를 떼면 첫 케이스가 죽는다. 둘째 케이스(`Slot` 이 없다 · 나머지가 있다)는 안 죽는다 — 대조군이다.
 */
import { describe, expect, it } from 'vitest'
import { placeableGroups } from '../../src/panels/type-picker'

const placeable = (): string[] => placeableGroups().flatMap((group) => group.types.map((type) => type.type))

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
})
