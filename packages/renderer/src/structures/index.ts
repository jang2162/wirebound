/**
 * 기본 구조 구현체를 레지스트리에 싣는다.
 *
 * **이 파일은 모으기만 한다** (P4b-2 ①). 앞서는 여기 `DEFAULTS` 배열 하나에 모든 구조가
 * 들어 있었는데, P4b-2가 구조 26개를 **워커 넷이 병렬로** 만들면서 넷이 전부 이 한 배열에
 * 줄을 더하게 된다. 그래서 등록 목록을 **그룹 다섯**이 나눠 갖게 하고 여기서는 이어 붙인다.
 *
 * 그룹 경계는 카탈로그 파일의 경계와 같다(`component/catalog/structure.ts`·`data.ts`·
 * `input.ts`·`action.ts`·`document.ts`) — 그래야 `parts`를 넓혀야 할 때도 서로 안 겹친다.
 * `test/structure-groups.test.ts`가 그 대응을 지킨다.
 */
import { ACTION_ENTRIES } from './action'
import { DATA_ENTRIES } from './data'
import { DOCUMENT_ENTRIES } from './document'
import { INPUT_ENTRIES } from './input'
import { getStructure, registerStructure, type StructureEntry } from './registry'
import { STRUCTURE_ENTRIES } from './structure'

/**
 * 그룹 다섯을 모은 것. **순서는 카탈로그의 `ALL`과 같게 둔다** — `listStructureKeys()`가
 * 삽입 순서를 그대로 돌려주고, `structures.test.tsx`의 전수 가드가 그 순서로 순회한다.
 */
const DEFAULTS: StructureEntry[] = [
  ...STRUCTURE_ENTRIES,
  ...DATA_ENTRIES,
  ...INPUT_ENTRIES,
  ...ACTION_ENTRIES,
  ...DOCUMENT_ENTRIES,
]

/** 기본 구조를 등록한다. 이미 등록돼 있으면 건너뛴다. */
export function installStructures(): void {
  for (const [type, structure, render] of DEFAULTS) {
    if (!getStructure(type, structure)) registerStructure(type, structure, render)
  }
}
