/**
 * **속성 칸의 묶음 규칙**(`src/panels/prop-groups.ts`) — 카탈로그 타입 전부(`CATALOG_TYPES` — `listComponents()` 는 `installCatalog` 앞이면 비어
 * 아무것도 안 센다)의 칸이 묶음 넷 중 하나에 드는지 센다. 새 `control` 이 카탈로그에 들면 묶음이 `null` 이라 여기서 죽는다.
 */
import { CATALOG_TYPES, getComponent, type EditorControl } from '@wirebound/schema'
import { describe, expect, it } from 'vitest'
import { PROP_GROUPS, propGroupOf, segmentable } from '../../src/panels/prop-groups'
import '../../src/catalog-setup'

describe('속성 칸의 묶음', () => {
  it('카탈로그 타입 전부의 칸이 묶음 넷 중 하나에 든다 — 묶음 없는 칸 0', () => {
    const fields = CATALOG_TYPES.flatMap((type) => getComponent(type)!.editor.map((field) => ({ type, ...field })))
    // 카나리아 — 센 칸이 있다(카탈로그가 깔렸다).
    expect(fields.length).toBeGreaterThan(100)
    const orphans = fields.filter((field) => propGroupOf(field) === null).map((field) => `${field.type}.${field.prop}`)
    expect(orphans).toEqual([])
    const ids = new Set(PROP_GROUPS.map((group) => group.id))
    expect(fields.every((field) => ids.has(propGroupOf(field)!))).toBe(true)
  })

  it('규칙 — 글 · 목록은 내용, 상태 표의 스위치는 상태, 배치 이름은 레이아웃, 그 밖의 고르개 · 수 · 스위치는 표시', () => {
    const of = (type: string, prop: string) => propGroupOf(getComponent(type)!.editor.find((field) => field.prop === prop)!)
    expect({
      선택지: of('Select', 'options'),
      안내: of('Select', 'placeholder'),
      폭: of('Select', 'size'),
      비활성: of('Select', 'disabled'),
      필수: of('Field', 'required'),
      방향: of('Flex', 'direction'),
      줄바꿈: of('Flex', 'wrap'),
      역할: of('Text', 'role'),
      되풀이: of('GridRow', 'repeat'),
    }).toEqual({
      선택지: 'content',
      안내: 'content',
      폭: 'layout',
      비활성: 'state',
      필수: 'look',
      방향: 'layout',
      줄바꿈: 'layout',
      역할: 'look',
      되풀이: 'look',
    })
    // 모르는 꼴은 묶음이 없다 — 기본 묶음으로 새면 카탈로그에 새 꼴이 들어도 위 «묶음 없는 칸 0» 이 못 잡는다.
    expect(propGroupOf({ prop: 'x', control: 'mystery' as EditorControl })).toBeNull()
  })

  it('세그먼트는 넷 이하 · 글이 값 칸에 드는 선택지만', () => {
    expect(
      [
        ['row', 'column'],
        ['start', 'center', 'end', 'stretch'],
        ['default', 'selected', 'dimmed', 'shaded'],
        ['a'],
        ['a', 'b', 'c', 'd', 'e'],
      ].map(segmentable),
    ).toEqual([true, true, false, false, false])
  })
})
