/**
 * **준비 웨이브(P4b-2 ①)가 가른 경계를 지키는 케이스.**
 *
 * P4b-2는 구조 26개를 **워커 넷이 병렬로** 만든다. 가르기 전에는 넷이 동시에 만질 파일이
 * 둘이었다 — `structures/index.ts`의 `DEFAULTS` 배열 하나와 `structure-css.ts`의 규칙 배열
 * 하나. 지금은 **그룹 모듈 다섯**(`structures/structure.tsx`·`data.tsx`·`input.tsx`·
 * `action.tsx`·`document.tsx`)이 자기 등록과 자기 CSS를 소유하고, `structures/index.ts`와
 * `structure-css.ts`는 그것들을 **모으기만** 한다.
 *
 * 그래서 이 파일이 지키는 것은 셋이다.
 *
 * 1. **모으는 쪽이 아무것도 빠뜨리지 않는다** — 그룹이 가진 항목과 레지스트리가 일치한다.
 * 2. **경계가 겹치지 않는다** — 두 그룹이 같은 키를 갖지 않는다.
 * 3. **CSS 규칙의 순서가 그대로다** — P4a-2가 *"시트 순서가 곧 우선순위"*를 못박았고
 *    (`structure-css.test.ts`의 캐스케이드 케이스들이 그 위에 얹혀 있다), 가르면서 순서가
 *    바뀌면 그 판정이 조용히 달라진다.
 *
 * **이 파일의 단언은 "늘어나는 것"에 죽지 않게 썼다.** 병렬 워커가 자기 그룹에 구조를
 * 더할 때마다 이 파일이 죽으면 넷이 서로를 막는다 — 그것이 가르기의 목적과 정반대다.
 * 그래서 수를 못박는 대신 **준비 웨이브의 것이 그대로 남아 있는지**를 본다.
 */
import { describe, expect, it } from 'vitest'
import { ACTION_ENTRIES } from '../src/structures/action'
import { DATA_ENTRIES } from '../src/structures/data'
import { DOCUMENT_ENTRIES } from '../src/structures/document'
import { installStructures } from '../src/structures/index'
import { INPUT_ENTRIES } from '../src/structures/input'
import { listStructureKeys, resetStructures, type StructureEntry } from '../src/structures/registry'
import { STRUCTURE_ENTRIES } from '../src/structures/structure'

/**
 * 그룹 다섯. **순서가 `installStructures()`·`structureBaseCss()`가 모으는 순서와 같아야
 * 한다** — 아래 순서 케이스가 이 배열을 기준으로 재기 때문이다.
 */
const GROUPS: [name: string, entries: readonly StructureEntry[]][] = [
  ['structure', STRUCTURE_ENTRIES],
  ['data', DATA_ENTRIES],
  ['input', INPUT_ENTRIES],
  ['action', ACTION_ENTRIES],
  ['document', DOCUMENT_ENTRIES],
]

function keysOf(entries: readonly StructureEntry[]): string[] {
  return entries.map(([type, structure]) => `${type}:${structure}`)
}

/**
 * **준비 웨이브가 가르기 직전의 19개.** 그룹별로 적어 둔다 — 어느 그룹이 무엇을 잃었는지
 * 실패 메시지가 바로 말하게 하려는 것이다.
 *
 * 이 목록은 **줄면 안 되고 늘 수는 있다.** 병렬 워커가 26개를 채우면 각 그룹의 배열이
 * 길어지지만, 여기 적힌 것은 그대로 있어야 한다.
 */
const BASELINE: Record<string, string[]> = {
  structure: [
    'Page:default',
    'Slot:default',
    'Section:contained',
    'Flex:default',
    'Grid:default',
    'Card:plain',
    'Tabs:underline',
  ],
  data: ['List:table', 'Tree:indent', 'KeyValue:table'],
  input: ['SearchForm:inline', 'EntryForm:labelLeft', 'Field:outlined'],
  action: ['Button:solid', 'Link:default'],
  document: ['Text:default', 'Media:image', 'Divider:default', 'Placeholder:default'],
}

describe('P4b-2 ① — 등록이 그룹 다섯으로 갈렸다', () => {
  it('installStructures()가 다섯 그룹의 항목을 빠짐없이 등록한다', () => {
    resetStructures()
    installStructures()

    const registered = [...listStructureKeys()].sort()
    const declared = [...GROUPS.flatMap(([, entries]) => keysOf(entries))].sort()

    // 목록이 비면 아래 비교가 `[] === []`로 통과한다.
    expect(declared.length).toBeGreaterThan(0)
    expect(registered).toEqual(declared)
  })

  it('두 그룹이 같은 키를 갖지 않는다 — 경계가 겹치면 registerStructure가 던진다', () => {
    const owner = new Map<string, string>()
    const collisions: string[] = []

    for (const [name, entries] of GROUPS) {
      for (const key of keysOf(entries)) {
        const previous = owner.get(key)
        if (previous !== undefined) collisions.push(`${key}: ${previous} ↔ ${name}`)
        else owner.set(key, name)
      }
    }

    expect(owner.size).toBeGreaterThan(0)
    expect(collisions).toEqual([])
  })

  it('그룹이 가진 것을 하나도 잃지 않았다 — 준비 웨이브의 19개', () => {
    for (const [name, entries] of GROUPS) {
      const keys = new Set(keysOf(entries))
      const lost = BASELINE[name]!.filter((key) => !keys.has(key))
      expect(lost, name).toEqual([])
    }
    // 위 순회가 헛돌지 않는 것 — 목록 전체가 19다.
    expect(Object.values(BASELINE).flat()).toHaveLength(19)
  })

  it('그룹 경계가 카탈로그 파일의 경계와 같다', () => {
    // **D2가 이 경계에 기대어 워커 넷을 나눴다.** 카탈로그 파일이 같은 경계로 갈려 있어야
    // `parts`를 넓혀야 할 때도 서로 안 겹친다. 여기서는 그 대응을 **컴포넌트 타입**으로
    // 고정한다 — 그룹이 남의 컴포넌트를 등록하기 시작하면 그 전제가 깨진다.
    const CATALOG_GROUPS: Record<string, string[]> = {
      structure: ['Page', 'Slot', 'Section', 'Flex', 'Grid', 'Card', 'Tabs'],
      data: ['List', 'Tree', 'KeyValue'],
      input: ['SearchForm', 'EntryForm', 'Field'],
      action: ['Button', 'Link'],
      document: ['Text', 'Media', 'Divider', 'Placeholder'],
    }

    for (const [name, entries] of GROUPS) {
      const types = [...new Set(entries.map(([type]) => type))].sort()
      expect(types, name).toEqual([...CATALOG_GROUPS[name]!].sort())
    }
  })

  it('installStructures()는 여전히 멱등하다', () => {
    // `catalog-setup`이 import만으로 부르고, 테스트 여럿이 beforeAll에서 또 부른다.
    // `registerStructure` 자체는 중복 등록에 던지므로 이 멱등이 유일한 방어다.
    resetStructures()
    installStructures()
    const first = listStructureKeys().length

    expect(() => installStructures()).not.toThrow()
    expect(listStructureKeys()).toHaveLength(first)
  })
})
