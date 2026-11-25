/**
 * **하단 컴포넌트 판에 둘 수 있는 타입** — 갈래별 한국어 목록(`./component-palette.tsx` 의 갈래 탭 · 카드).
 *
 * ## 갈래와 이름은 카탈로그가 갖는다
 *
 * **갈래와 사람이 읽을 이름은 `ComponentDef`에 있다**(`label` · `description` · `group`). 이 파일은 그것을 읽기만 한다 — `apps/web`에 표를 손으로
 * 두면 카탈로그가 늘 때 어긋나는 자리가 하나 더 생긴다.
 *
 * **프리셋(`ComponentDef.presets`)은 카드가 따로 선다** — 같은 타입의 다른 첫 내용이다(`placeableGroups` 의 차례).
 *
 * **페이지에 둘 수 없는 타입은 목록에 없다.** 지금 그런 것은 뿌리 타입(`Page` · `Popup`)이고, 판정은 이름이 아니라
 * **`validatePage`를 실제로 돌려** 한다. 이름으로 거르면 카탈로그에 같은 성질의 타입이 생길 때 어긋난다.
 */
import {
  BODY_ZONE,
  CURRENT_DOCUMENT_VERSION,
  hasBody,
  COMPONENT_GROUPS,
  COMPONENT_GROUP_LABELS,
  getComponent,
  listComponents,
  placementsOf,
  validatePage,
  type ComponentGroup,
  type PageDocument,
  type WbNode,
} from '@wirebound/schema'
import { createNode } from '../edit/create-node'
import '../catalog-setup'

export interface PickableType {
  /** 카드를 가르는 열쇠 — 타입 카드는 타입 이름, 프리셋 카드는 `<타입>:<프리셋 키>`(`paletteKey`). 카드 · 축소판 창 · 표본의 속성 값이다. */
  key: string
  type: string
  /** 프리셋 카드면 그 키(`ComponentDef.presets`). 타입 카드면 없다. */
  preset?: string
  label: string
  description: string
  many: boolean
}

/** 카드의 열쇠(`PickableType.key`). 타입 이름에는 `:` 가 없다(`ZONE_NAME_PATTERN` 과 같은 식별자 꼴). */
export function paletteKey(type: string, preset?: string): string {
  return preset === undefined ? type : `${type}:${preset}`
}

/** 열쇠를 타입 · 프리셋으로 푼다. */
export function parsePaletteKey(key: string): { type: string; preset?: string } {
  const at = key.indexOf(':')
  return at === -1 ? { type: key } : { type: key.slice(0, at), preset: key.slice(at + 1) }
}

export interface PickableGroup {
  group: string
  label: string
  types: PickableType[]
}

/**
 * 페이지 문서에 둘 수 있는 타입을 갈래별로 — 하단 컴포넌트 판의 갈래 탭 · 카드(`./component-palette.tsx`)가 이 목록이다.
 *
 * **`validatePage`를 실제로 돌려 거른다.** `createNode`가 만든 노드를 빈 페이지의 자식으로
 * 넣어 이슈가 없는 것만 남긴다 — 이름 목록을 손으로 두는 것보다 정확하고, 카탈로그가
 * 늘어도 여기가 스스로 따라간다(머리말 «갈래와 이름은 카탈로그가 갖는다»).
 *
 * **뿌리 타입(`Page`)도 같은 검증이 뺀다** — 뿌리 밖의 `Page` 는 `nested-page` 오류다. 이름으로 따로 빼지 않는다.
 *
 * **갈래를 데이터에서 모은 뒤 순서만 준다.** `COMPONENT_GROUPS`를 훑어 각 갈래의 타입을
 * 담으면 목록에 없는 갈래를 가진 타입이 **조용히 사라진다**. 반대로 하면 그 상태에서도
 * 항목이 남고(순서가 뒤로 갈 뿐), 사라지는 것보다 낫다.
 */
export function placeableGroups(): PickableGroup[] {
  const buckets = new Map<string, PickableType[]>()

  for (const def of listComponents()) {
    // 기본 내용의 노드도 id 가 겹치지 않게 차례를 붙인다 — 겹치면 `duplicate-id` 로 그 타입이 판에서 빠진다.
    let made = 0
    const node = createNode(def.type, () => `n-probe-${made++}`)
    if (node === null) continue
    // 설 자리가 정해진 타입(`TabPanel`)은 그 자리(부모 타입의 그 구역)에 놓아 재 본다 — 뿌리에 두면 `misplaced-component` 로 늘 빠진다.
    // 설 자리가 정해진 타입(`TabPanel` · 그리드 부품)은 그 자리(부모 타입의 그 구역)에 놓아 재 본다 — 뿌리에 두면 `misplaced-component` 로 늘 빠진다.
    // 부모도 설 자리가 정해졌으면(칸 › 행 › 그리드) 그 부모의 자리까지 차례로 감싼다. 자리가 여럿이면(열 — 그리드 몸통 · 열 묶음 몸통) 첫 자리다.
    let placed: WbNode = node
    for (let host = placementsOf(def)[0], depth = 0; host !== undefined && depth < 8; depth++) {
      placed = {
        id: `n-probe-host-${depth}`,
        type: host.type,
        ...(host.zone === BODY_ZONE ? { children: [placed] } : { zones: { [host.zone]: [placed] } }),
      }
      host = placementsOf(getComponent(host.type))[0]
    }
    const probe: PageDocument = {
      version: CURRENT_DOCUMENT_VERSION,
      layout: 'blank',
      root: { id: 'n-probe-root', type: 'Page', children: [placed] },
    }
    if (validatePage(probe).length > 0) continue

    const bucket = buckets.get(def.group) ?? []
    bucket.push({
      key: paletteKey(def.type),
      type: def.type,
      label: def.label,
      description: def.description,
      many: hasBody(def.type),
    })
    buckets.set(def.group, bucket)
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => groupOrder(a) - groupOrder(b))
    .map(([group, types]) => ({
      group,
      label: COMPONENT_GROUP_LABELS[group as ComponentGroup] ?? group,
      // **한국어 이름순이다.** 영문 타입명순으로 두면 화면에 보이는 글자와 순서가 갈려
      // 목록을 훑는 사람이 어디를 봐야 할지 모른다. 프리셋 카드는 제 타입 카드 바로 뒤다(«그리드» 다음 «반복 행 표») — 같은 노드의 다른 첫 내용이라
      // 이름 차례로 흩으면 둘이 한 타입인 것이 안 보인다. 프리셋은 그 타입 카드가 섰을 때만 선다(같은 판정을 지난 타입이다).
      types: types.sort((a, b) => a.label.localeCompare(b.label, 'ko')).flatMap((type) => [type, ...presetCards(type)]),
    }))
}

/** 타입 카드 뒤에 설 그 타입의 프리셋 카드. */
function presetCards(type: PickableType): PickableType[] {
  return (getComponent(type.type)?.presets ?? []).map((preset) => ({
    key: paletteKey(type.type, preset.key),
    type: type.type,
    preset: preset.key,
    label: preset.label,
    description: preset.description,
    many: type.many,
  }))
}

/** 갈래의 자리. 카탈로그가 정한 순서를 그대로 쓰고, 모르는 갈래는 맨 뒤다. */
function groupOrder(group: string): number {
  const index = (COMPONENT_GROUPS as readonly string[]).indexOf(group)
  return index === -1 ? COMPONENT_GROUPS.length : index
}
