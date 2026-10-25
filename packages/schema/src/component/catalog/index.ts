import { placementsOf, type ComponentDef } from '../define'
import { getComponent, registerComponent } from '../registry'
import { ButtonDef, LinkDef } from './action'
import { DataGridDef, GridCellDef, GridColumnDef, GridColumnGroupDef, GridRowDef, KeyValueDef, PaginationDef, TreeDef } from './data'
import { DividerDef, MediaDef, PlaceholderDef, TextDef } from './document'
import {
  AffixDef,
  CheckboxGroupDef,
  ChipDef,
  DateInputDef,
  EntryFormDef,
  FieldDef,
  FormTableDef,
  InputDef,
  RadioGroupDef,
  SearchFormDef,
  SelectDef,
  TextAreaDef,
  TimeInputDef,
} from './input'
import { CardDef, FlexDef, GridDef, PageDef, SectionDef, SlotDef, TabPanelDef, TabsDef } from './structure'

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
  PageDef,
  SlotDef,
  SectionDef,
  FlexDef,
  GridDef,
  CardDef,
  TabsDef,
  TabPanelDef,
  DataGridDef,
  GridColumnGroupDef,
  GridColumnDef,
  GridRowDef,
  GridCellDef,
  PaginationDef,
  TreeDef,
  KeyValueDef,
  SearchFormDef,
  EntryFormDef,
  FormTableDef,
  FieldDef,
  InputDef,
  TextAreaDef,
  SelectDef,
  DateInputDef,
  TimeInputDef,
  CheckboxGroupDef,
  RadioGroupDef,
  ChipDef,
  AffixDef,
  ButtonDef,
  LinkDef,
  TextDef,
  MediaDef,
  DividerDef,
  PlaceholderDef,
]

export const CATALOG_TYPES: readonly string[] = CATALOG_DEFS.map((def) => def.type)

/**
 * **구역의 기본 내용 · 받는 타입 · 설 자리가 카탈로그 안의 타입을 가리키고, 기본 내용의 `props`가 그 타입의 규격을 지나는가** — 정의 하나만 보는
 * `defineComponent`는 다른 타입을 모르므로 카탈로그를 모은 이 자리에서 본다. 걸리면 import 하는 순간 던진다.
 */
function assertZoneReferences(defs: readonly ComponentDef[]): void {
  const byType = new Map(defs.map((def) => [def.type, def]))
  for (const def of defs) {
    for (const zone of def.zones) {
      for (const type of zone.accepts ?? []) {
        if (!byType.has(type)) throw new Error(`${def.type}.${zone.name}: accepts 가 카탈로그에 없는 타입을 가리킵니다: ${type}`)
      }
      for (const seed of zone.initial ?? []) {
        const target = byType.get(seed.type)
        if (target === undefined) throw new Error(`${def.type}.${zone.name}: 기본 내용이 카탈로그에 없는 타입입니다: ${seed.type}`)
        if (!target.props.safeParse(seed.props ?? {}).success) {
          throw new Error(`${def.type}.${zone.name}: 기본 내용 ${seed.type}의 props 가 규격에 맞지 않습니다`)
        }
        // `variantFrom` 을 가진 타입은 `node.variant` 를 버린다(검증 경고 `ignored-variant`) — 새로 만든 노드가 경고를 들고 서지 않게.
        if (seed.variant !== undefined && target.variantFrom !== undefined) {
          throw new Error(`${def.type}.${zone.name}: 기본 내용 ${seed.type}은 variant 를 ${target.variantFrom} prop 에서 파생합니다`)
        }
        if (zone.accepts !== undefined && !zone.accepts.includes(seed.type)) {
          throw new Error(`${def.type}.${zone.name}: 기본 내용 ${seed.type}을 그 구역이 받지 않습니다`)
        }
      }
    }
    for (const place of placementsOf(def)) {
      const host = byType.get(place.type)
      if (host === undefined || !host.zones.some((zone) => zone.name === place.zone)) {
        throw new Error(`${def.type}: placement 가 카탈로그에 없는 구역을 가리킵니다: ${place.type}.${place.zone}`)
      }
    }
  }
}

assertZoneReferences(CATALOG_DEFS)

/** 카탈로그를 레지스트리에 설치한다. 이미 설치돼 있으면 아무것도 하지 않는다. */
export function installCatalog(): void {
  for (const def of CATALOG_DEFS) {
    if (!getComponent(def.type)) registerComponent(def)
  }
}
