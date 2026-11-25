import { InteractionSchema } from '../../envelope'
import { isTargetlessAction } from '../../interaction/check'
import { BODY_ZONE, placementsOf, type ComponentDef, type NodeTemplate } from '../define'
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
  FileAttachDef,
  FormTableDef,
  InputDef,
  RadioGroupDef,
  SearchFormDef,
  SelectDef,
  TextAreaDef,
  TimeInputDef,
} from './input'
import { CardDef, FlexDef, GridDef, PageDef, PopupDef, SectionDef, TabPanelDef, TabsDef } from './structure'

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
  PopupDef,
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
  FileAttachDef,
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
export function assertZoneReferences(defs: readonly ComponentDef[]): void {
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
        // 만들 때 지은 id 를 몰라 노드를 겨냥하는 액션은 못 싣는다 — 꼴이 봉투를 지나고 대상 없는 액션뿐인지 본다.
        for (const interaction of seed.interactions ?? []) {
          if (!InteractionSchema.safeParse(interaction).success || !interaction.actions.every(isTargetlessAction)) {
            throw new Error(`${def.type}.${zone.name}: 기본 내용 ${seed.type}의 상호작용은 대상 없는 액션만 실을 수 있습니다`)
          }
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

/**
 * **프리셋의 카드 이름이 다른 카드와 겹치지 않는가** — 팔레트는 타입마다 · 프리셋마다 카드를 세운다(`apps/web/src/palette/placeable.ts`). 이름이 같으면
 * 고르개에서 갈리지 않는 카드 둘이 선다(`registry.ts` 의 이름 겹침과 같은 고장). 레지스트리는 타입만 보므로 여기서 본다.
 */
export function assertPresetLabels(defs: readonly ComponentDef[]): void {
  const taken = new Map(defs.map((def) => [def.label, def.type]))
  for (const def of defs) {
    for (const preset of def.presets ?? []) {
      const clash = taken.get(preset.label)
      if (clash !== undefined) throw new Error(`${def.type}: 프리셋 ${preset.key} 의 이름이 이미 쓰입니다: ${preset.label} (${clash})`)
      taken.set(preset.label, `${def.type}.${preset.key}`)
    }
  }
}

assertPresetLabels(CATALOG_DEFS)

/**
 * **프리셋의 템플릿이 카탈로그의 규칙(타입 · props · 구역 · 받는 타입 · 설 자리)을 지나는가** — 기본 내용(`assertZoneReferences`)과 같은 축을 템플릿 트리
 * 전부에 건다. 걸리면 import 하는 순간 던진다. **`validatePage` 를 여기서 부르지 않는다** — 검증은 표시 이름(`display.ts`)을 거쳐 이 모듈의
 * `CATALOG_DEFS` 를 맨 위에서 읽어, 이 모듈이 먼저 실리면 고리가 덜 지은 값을 읽는다. 검증을 지나는지는 케이스가 센다(`packages/schema/test/component/preset.test.ts`).
 */
export function assertPresets(defs: readonly ComponentDef[]): void {
  const byType = new Map(defs.map((def) => [def.type, def]))
  const walk = (owner: string, node: NodeTemplate, parent: { type: string; zone: string } | null): void => {
    const def = byType.get(node.type)
    if (def === undefined) throw new Error(`${owner}: 카탈로그에 없는 타입입니다: ${node.type}`)
    if (!def.props.safeParse(node.props ?? {}).success) throw new Error(`${owner}: ${node.type}의 props 가 규격에 맞지 않습니다`)
    if (node.variant !== undefined && def.variantFrom !== undefined)
      throw new Error(`${owner}: ${node.type}은 variant 를 ${def.variantFrom} prop 에서 파생합니다`)
    const places = placementsOf(def)
    if (parent !== null && places.length > 0 && !places.some((place) => place.type === parent.type && place.zone === parent.zone)) {
      throw new Error(`${owner}: ${node.type}이 설 수 없는 자리입니다: ${parent.type}.${parent.zone}`)
    }
    const lists: [string, readonly NodeTemplate[]][] = [
      ...(node.children === undefined ? [] : ([[BODY_ZONE, node.children]] as [string, readonly NodeTemplate[]][])),
      ...Object.entries(node.zones ?? {}),
    ]
    for (const [zone, list] of lists) {
      const declared = def.zones.find((one) => one.name === zone)
      if (declared === undefined || (zone === BODY_ZONE) !== (list === node.children))
        throw new Error(`${owner}: ${node.type}에 없는 구역입니다: ${zone}`)
      for (const child of list) {
        if (declared.accepts !== undefined && !declared.accepts.includes(child.type)) {
          throw new Error(`${owner}: ${node.type}.${zone} 이 ${child.type}을 받지 않습니다`)
        }
        walk(owner, child, { type: node.type, zone })
      }
    }
  }
  for (const def of defs) for (const preset of def.presets ?? []) walk(`${def.type}.${preset.key}`, preset.node, null)
}

assertPresets(CATALOG_DEFS)

/** 카탈로그를 레지스트리에 설치한다. 이미 설치돼 있으면 아무것도 하지 않는다. */
export function installCatalog(): void {
  for (const def of CATALOG_DEFS) {
    if (!getComponent(def.type)) registerComponent(def)
  }
}
