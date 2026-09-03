import type { ComponentDef } from '../define'
import { getComponent, registerComponent } from '../registry'
import { ButtonDef, LinkDef } from './action'
import { KeyValueDef, ListDef, TreeDef } from './data'
import { DividerDef, MediaDef, PlaceholderDef, TextDef } from './document'
import { EntryFormDef, FieldDef, SearchFormDef } from './input'
import {
  CardDef, FlexDef, GridDef, PageDef, SectionDef, SlotDef, TabsDef,
} from './structure'

export * from './action'
export * from './data'
export * from './document'
export * from './input'
export * from './structure'

/**
 * 카탈로그 전체. **레지스트리를 거치지 않고 정의를 봐야 하는 곳이 쓴다** —
 * `interaction/describe.ts`가 `installCatalog()`와 무관하게 이름 표를 만드는 자리다.
 * 설치된 것을 보려면 `listComponents()`를 써라. 둘은 다른 질문이다.
 */
export const CATALOG_DEFS: readonly ComponentDef[] = [
  PageDef, SlotDef, SectionDef, FlexDef, GridDef, CardDef, TabsDef,
  ListDef, TreeDef, KeyValueDef,
  SearchFormDef, EntryFormDef, FieldDef,
  ButtonDef, LinkDef,
  TextDef, MediaDef, DividerDef, PlaceholderDef,
]

export const CATALOG_TYPES: readonly string[] = CATALOG_DEFS.map((def) => def.type)

/** 카탈로그를 레지스트리에 설치한다. 이미 설치돼 있으면 아무것도 하지 않는다. */
export function installCatalog(): void {
  for (const def of CATALOG_DEFS) {
    if (!getComponent(def.type)) registerComponent(def)
  }
}
