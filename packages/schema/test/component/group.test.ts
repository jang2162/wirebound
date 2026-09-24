/**
 * **선언한 갈래가 파일과 어긋나지 않는 것을 여기서 본다.**
 *
 * `group.ts`가 갈래를 «선언»으로 둔 근거는 *"실행 시점에 파일 경로를 모른다"*다.
 * **테스트는 안다** — 카탈로그 모듈을 하나씩 따로 import하면 그 모듈이 내보내는 것이
 * 무엇인지가 곧 파일이 소유한 목록이다. 그래서 유도의 무결성을 여기서 되찾는다.
 *
 * **이 파일이 없으면 선언은 그냥 손으로 적은 표다.** `catalog/data.ts`에 새 컴포넌트를
 * 더하며 `group: 'structure'`를 복사해 오면 아무도 안 울고, 고르개에서 그것이 «구조»
 * 아래 선다.
 */
import { describe, expect, it } from 'vitest'
import * as actionModule from '../../src/component/catalog/action'
import * as dataModule from '../../src/component/catalog/data'
import * as documentModule from '../../src/component/catalog/document'
import * as inputModule from '../../src/component/catalog/input'
import * as structureModule from '../../src/component/catalog/structure'
import { CATALOG_DEFS } from '../../src/component/catalog/index'
import type { ComponentDef } from '../../src/component/define'
import {
  COMPONENT_GROUPS,
  COMPONENT_GROUP_LABELS,
  isComponentGroup,
} from '../../src/component/group'

/**
 * 파일 → 그 파일이 선언해야 할 갈래. **이 표만이 손으로 적은 것이고, 그 항목 수가
 * `COMPONENT_GROUPS`와 같은지는 아래 케이스가 본다** — 파일을 새로 만들고 여기 안 적으면
 * 그 파일의 컴포넌트가 통째로 검사 밖이 되기 때문이다.
 */
const FILES = [
  { group: 'structure', module: structureModule, file: 'catalog/structure.ts' },
  { group: 'data', module: dataModule, file: 'catalog/data.ts' },
  { group: 'input', module: inputModule, file: 'catalog/input.ts' },
  { group: 'action', module: actionModule, file: 'catalog/action.ts' },
  { group: 'document', module: documentModule, file: 'catalog/document.ts' },
] as const

/** 모듈이 내보내는 `ComponentDef`들. 다른 것을 내보내면 무시한다. */
function defsOf(module: Record<string, unknown>): ComponentDef[] {
  return Object.values(module).filter(
    (value): value is ComponentDef =>
      typeof value === 'object' && value !== null && 'type' in value && 'group' in value,
  )
}

describe('갈래 선언과 카탈로그 파일', () => {
  it.each(FILES.map((entry) => [entry.file, entry] as const))(
    '%s 이 내보내는 def은 전부 그 파일의 갈래를 선언한다',
    (_file, entry) => {
      const defs = defsOf(entry.module)
      expect(defs.length).toBeGreaterThan(0)
      for (const def of defs) {
        expect(def.group, def.type).toBe(entry.group)
      }
    },
  )

  it('갈래마다 파일이 하나씩 있다', () => {
    // 갈래를 더하고 파일을 안 만들면(또는 그 반대) 위 검사가 그 갈래를 통째로 못 본다.
    expect(FILES.map((entry) => entry.group).slice().sort()).toEqual(
      [...COMPONENT_GROUPS].sort(),
    )
  })

  it('카탈로그 전체가 다섯 파일에 남김없이 들어 있다', () => {
    // **`CATALOG_DEFS`에는 있는데 어느 모듈에도 없는 def**을 잡는다. 그런 것이 생기면
    // 위 파일별 검사가 그것을 지나친다.
    const inFiles = FILES.flatMap((entry) => defsOf(entry.module)).map((def) => def.type)
    expect(inFiles.slice().sort()).toEqual(CATALOG_DEFS.map((def) => def.type).slice().sort())
  })

  it('모든 갈래에 이름이 있다', () => {
    for (const group of COMPONENT_GROUPS) {
      expect(COMPONENT_GROUP_LABELS[group], group).toBeTruthy()
    }
  })

  it('isComponentGroup은 목록 밖을 거른다', () => {
    expect(isComponentGroup('structure')).toBe(true)
    expect(isComponentGroup('Structure')).toBe(false)
    expect(isComponentGroup('')).toBe(false)
    expect(isComponentGroup(undefined)).toBe(false)
  })

  it('갈래 순서는 담는 것에서 담기는 것으로 간다', () => {
    // 알파벳순으로 두면 `action`이 맨 앞에 와 화면을 만드는 순서와 어긋난다.
    // 고르개가 이 순서를 그대로 쓰므로 여기가 그 순서를 잠근다.
    expect([...COMPONENT_GROUPS]).toEqual(['structure', 'data', 'input', 'action', 'document'])
  })
})
