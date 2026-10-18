/**
 * **하단 컴포넌트 판에 둘 수 있는 타입** — 갈래별 한국어 목록(`./component-palette.tsx` 의 갈래 탭 · 카드).
 *
 * ## 갈래와 이름은 카탈로그가 갖는다
 *
 * **갈래와 사람이 읽을 이름은 `ComponentDef`에 있다**(`label` · `description` · `group`). 이 파일은 그것을 읽기만 한다 — `apps/web`에 표를 손으로
 * 두면 카탈로그가 늘 때 어긋나는 자리가 하나 더 생긴다.
 *
 * **페이지에 둘 수 없는 타입은 목록에 없다.** 지금 그런 것은 `Slot` 하나이고(설계서 「레이아웃」 — 레이아웃 전용), 판정은 이름이 아니라
 * **`validatePage`를 실제로 돌려** 한다. 이름으로 거르면 카탈로그에 같은 성질의 타입이 생길 때 어긋난다.
 */
import {
  COMPONENT_GROUPS,
  COMPONENT_GROUP_LABELS,
  listComponents,
  validatePage,
  type ComponentGroup,
  type PageDocument,
} from '@wirebound/schema'
import { createNode } from '../edit/create-node'
import '../catalog-setup'

export interface PickableType {
  type: string
  label: string
  description: string
  many: boolean
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
    const node = createNode(def.type, () => 'n-probe')
    if (node === null) continue
    const probe: PageDocument = {
      version: 1,
      root: { id: 'n-probe-root', type: 'Page', children: [node] },
    }
    if (validatePage(probe).length > 0) continue

    const bucket = buckets.get(def.group) ?? []
    bucket.push({
      type: def.type,
      label: def.label,
      description: def.description,
      many: def.children === 'many',
    })
    buckets.set(def.group, bucket)
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => groupOrder(a) - groupOrder(b))
    .map(([group, types]) => ({
      group,
      label: COMPONENT_GROUP_LABELS[group as ComponentGroup] ?? group,
      // **한국어 이름순이다.** 영문 타입명순으로 두면 화면에 보이는 글자와 순서가 갈려
      // 목록을 훑는 사람이 어디를 봐야 할지 모른다.
      types: types.sort((a, b) => a.label.localeCompare(b.label, 'ko')),
    }))
}

/** 갈래의 자리. 카탈로그가 정한 순서를 그대로 쓰고, 모르는 갈래는 맨 뒤다. */
function groupOrder(group: string): number {
  const index = (COMPONENT_GROUPS as readonly string[]).indexOf(group)
  return index === -1 ? COMPONENT_GROUPS.length : index
}
