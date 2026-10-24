/**
 * **입력 조각의 «종류 바꾸기»**(설계 spec `docs/superpowers/specs/2026-10-24-compose-input-design.md` Q2 (가)) — 값 칸의 `Input` 을 `Select` 로 바꾸듯
 * 노드의 타입만 갈아 끼운다. 순수 함수이고 React · DOM 을 모른다. 입구는 구조 트리 줄 `…` 의 «종류 바꾸기…» 상자(`panels/change-kind-dialog.tsx`)다.
 *
 * | 지키는 것 | 버리는 것 |
 * |---|---|
 * | 노드 id · 번호 · 별칭 · 상태 보임 · 상호작용 · 몫 — 노드 봉투의 필드라 안 건드린다 | `variant` — 변형은 타입마다 테마가 선언한다(`RadioGroup` 의 세그먼트가 `Select` 에 없다) |
 * | 이름이 같고 새 타입의 규격을 지나는 prop(`placeholder` · `disabled` · `readonly` · `invalid` · `value` · `size` · `options`) | 새 타입에 없는 prop · 규격을 못 지나는 값(`Input.kind` 는 `Select` 에 없다) |
 *
 * **하나만 고르는 타입으로 갈 때 고른 항목은 첫째만 남긴다** — 여럿 고른 체크 묶음의 `options` 를 그대로 옮기면 `Select` · `RadioGroup` 의 규격이 거절해
 * 그 prop 이 통째로 빠진다(항목을 잃는다).
 *
 * **op 은 노드째 바꾸지 않고 필드마다 낸다**(`type` · `props` · `variant`) — 노드째 `replace` 는 그 사이 남이 단 번호 · 별칭 · 상호작용을 덮는다. 필드
 * `replace` 는 남이 같은 필드를 고쳤어도 뒤의 것이 이긴다(`store/anchored-ops.ts` 머리말 — 리베이스가 원래 하던 일이다). `props` 는 통째다 — 새
 * 타입의 규격에 맞는 한 덩이라 그 사이 남이 고친 옛 타입의 prop 하나를 얹으면 규격이 깨진다.
 */
import { getComponent, propSchema, type PageDocument, type PatchOp, type WbNode } from '@wirebound/schema'
import { findNodePathSafely, findNodeSafely } from './safe-walk'

/** 서로 바꿀 수 있는 입력 조각 — 값을 받는 일곱(사이 글자 · 칩은 입력이 아니라 뺀다). 차례가 상자의 단추 차례다. */
export const KIND_TYPES = ['Input', 'TextArea', 'Select', 'DateInput', 'TimeInput', 'CheckboxGroup', 'RadioGroup'] as const

/** 하나만 고르는 선택지를 가진 타입 — 카탈로그의 `select: 'one'` 편집 칸에서 읽는다. */
function singleChoice(type: string): boolean {
  return getComponent(type)?.editor.some((field) => field.prop === 'options' && field.select === 'one') ?? false
}

/** 이 타입에서 바꿀 수 있는 종류들 — 입력 조각이 아니면 빈 목록이다. */
export function kindTargets(type: unknown): string[] {
  if (typeof type !== 'string' || !(KIND_TYPES as readonly string[]).includes(type)) return []
  return KIND_TYPES.filter((target) => target !== type)
}

/** 옮길 props — 이름이 같고 새 타입의 규격을 지나는 것만. */
export function carriedProps(from: Record<string, unknown>, toType: string): Record<string, unknown> {
  const def = getComponent(toType)
  if (def === undefined) return {}
  const out: Record<string, unknown> = {}
  for (const [prop, raw] of Object.entries(from)) {
    const schema = propSchema(def, prop)
    if (schema === undefined) continue
    const value = prop === 'options' && singleChoice(toType) ? firstPickOnly(raw) : raw
    if (schema.safeParse(value).success) out[prop] = value
  }
  // 하나씩은 지나도 함께 못 지나는 판을 막는다 — 그때는 아무것도 옮기지 않는다(기본값으로 선다).
  return def.props.safeParse(out).success ? out : {}
}

/** 고른 항목을 첫째 하나만 남긴다. 배열이 아니면 그대로(규격이 거른다). */
function firstPickOnly(options: unknown): unknown {
  if (!Array.isArray(options)) return options
  let kept = false
  return options.map((option) => {
    if (option === null || typeof option !== 'object' || (option as { selected?: unknown }).selected !== true) return option
    if (!kept) {
      kept = true
      return option
    }
    const { selected: _, ...rest } = option as Record<string, unknown>
    return rest
  })
}

/**
 * 노드의 종류를 `toType` 으로 바꾸는 op. 노드가 없거나 · 입력 조각이 아니거나 · 같은 종류면 `null`.
 *
 * | 필드 | op |
 * |---|---|
 * | `type` | `replace` |
 * | `props` | 옮길 것이 있으면 `replace`(키가 없었으면 `add`), 없고 키가 있었으면 `remove` |
 * | `variant` | 있었으면 `remove` |
 */
export function changeKindOps(document: PageDocument, nodeId: string, toType: string): PatchOp[] | null {
  const node = findNodeSafely(document.root, nodeId) as WbNode | undefined
  const path = findNodePathSafely(document.root, nodeId)
  if (node === undefined || path === undefined) return null
  if (!kindTargets(node.type).includes(toType)) return null

  const from = node.props !== null && typeof node.props === 'object' ? (node.props as Record<string, unknown>) : {}
  const props = carriedProps(from, toType)
  const ops: PatchOp[] = [{ op: 'replace', path: `${path}/type`, value: toType }]
  const hasProps = Object.hasOwn(node, 'props')
  if (Object.keys(props).length > 0) ops.push({ op: hasProps ? 'replace' : 'add', path: `${path}/props`, value: props })
  else if (hasProps) ops.push({ op: 'remove', path: `${path}/props` })
  if (Object.hasOwn(node, 'variant')) ops.push({ op: 'remove', path: `${path}/variant` })
  return ops
}
