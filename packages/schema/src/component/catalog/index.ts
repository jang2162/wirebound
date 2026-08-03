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

const ALL: ComponentDef[] = [
  PageDef, SlotDef, SectionDef, FlexDef, GridDef, CardDef, TabsDef,
  ListDef, TreeDef, KeyValueDef,
  SearchFormDef, EntryFormDef, FieldDef,
  ButtonDef, LinkDef,
  TextDef, MediaDef, DividerDef, PlaceholderDef,
]

export const CATALOG_TYPES: readonly string[] = ALL.map((def) => def.type)

/** 카탈로그를 레지스트리에 설치한다. 이미 설치돼 있으면 아무것도 하지 않는다. */
export function installCatalog(): void {
  for (const def of ALL) {
    if (!getComponent(def.type)) registerComponent(def)
  }
}
