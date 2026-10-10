/**
 * 노드를 **줄 하나로** 보이는 글 — 별칭(`alias`) · 요약(카탈로그 `summary`) · 트리 줄 글(`타입 (별칭) 요약`).
 *
 * 노드를 문장에서 부르는 이름(`nodeDisplayName` · `describeNode`)은 `interaction/describe.ts` 가 갖는다 — 그 이름의 재료
 * (라벨성 prop · 한국어 이름)가 거기 있다. 여기는 그 이름과 별개로 **타입을 앞세우는** 글이다: 구조 트리 줄 · 속성 패널
 * 제목 · MCP `get_page` 의 `rowLabel`.
 *
 * **카탈로그 정의를 정적으로 읽는다(`CATALOG_DEFS`) — 레지스트리가 아니다.** `installCatalog()` 를 부르지 않는 소비자
 * (exporter · MCP · CLI)도 같은 글을 내야 한다(`interaction/describe.ts` 의 `COMPONENT_NOUNS` 와 같은 까닭).
 *
 * **검증 전 문서를 견딘다.** 웹은 서버 검증 전의 낙관적 문서를 그린다 — 별칭 · props 의 모양이 틀려도 던지지 않고
 * «없음»으로 읽는다.
 */
import { isBlankAlias } from './alias'
import { isolateBidi } from './bidi'
import { CATALOG_DEFS } from './component/catalog/index'
import type { ComponentDef } from './component/define'
import { DEFAULT_CASE, type ViewState, type WbNode } from './node'

const DEFS: ReadonlyMap<string, ComponentDef> = new Map(CATALOG_DEFS.map((def) => [def.type, def]))

/** 타입을 읽지 못한 노드(`type` 이 문자열이 아님)의 이름. 문장(`describe.ts`)이 같은 자리에 쓰는 말이다. */
const UNKNOWN_TYPE = '알 수 없는 노드'

/**
 * 노드의 별칭. 없거나 모양이 틀렸으면(문자열이 아님 · 보이는 글자 없음 — `alias.ts` 의 `isBlankAlias`) `null`. 앞뒤 공백은
 * 걷어 읽는다.
 */
export function nodeAlias(node: WbNode): string | null {
  const alias = (node as { alias?: unknown }).alias
  if (typeof alias !== 'string' || isBlankAlias(alias)) return null
  return alias.trim()
}

/** 목록에 없는 상태를 가리키는 가지의 이름. 그 가지는 그려지지 않는다(렌더러 · lint). */
export const UNKNOWN_VIEW_STATE_NAME = '목록에 없는 상태'

/**
 * 상태 가지가 가리키는 상태의 이름 — 기본 가지는 «기본», 목록(`viewStates` — 그 가지가 든 페이지의 것)에 없거나 `state`가 문자열이
 * 아니면 `UNKNOWN_VIEW_STATE_NAME`.
 */
export function caseStateName(node: WbNode, viewStates?: readonly ViewState[]): string {
  const state = isRecord(node.props) ? node.props.state : undefined
  return typeof state === 'string' ? viewStateName(viewStates, state) : UNKNOWN_VIEW_STATE_NAME
}

/**
 * 상태 id 의 이름 — 기본(`default`)은 «기본», 목록에 없으면 `UNKNOWN_VIEW_STATE_NAME`. 화면은 검증 전 문서로도 부른다(구조 트리 · 상호작용
 * 패널 — 오류 경계 밖) — 목록이 배열이 아니거나 항목이 객체가 아니어도 던지지 않는다.
 */
export function viewStateName(viewStates: readonly ViewState[] | undefined, state: string): string {
  if (state === DEFAULT_CASE) return '기본'
  if (!Array.isArray(viewStates)) return UNKNOWN_VIEW_STATE_NAME
  const name = viewStates.find((entry: unknown) => isRecord(entry) && entry.id === state)?.name
  return typeof name === 'string' ? name : UNKNOWN_VIEW_STATE_NAME
}

/**
 * 줄 요약 — 카탈로그 정의의 `summary` 를 부른다. 정의가 없거나 `summary` 가 없으면 `null`.
 *
 * props 는 기본값을 채워 넘긴다(`Flex` 에 `direction` 이 없어도 `가로`). 규격에 안 맞으면 원본을 넘기고, `summary` 의
 * 읽개(`component/summary.ts`)가 틀린 값을 `null` 로 읽는다.
 */
export function nodeSummary(node: WbNode, viewStates?: readonly ViewState[]): string | null {
  if (typeof node.type !== 'string') return null
  if (node.type === 'StateSwitch') return `가지 ${Array.isArray(node.children) ? node.children.length : 0}`
  if (node.type === 'StateCase') return caseStateName(node, viewStates)
  const def = DEFS.get(node.type)
  if (def?.summary === undefined) return null
  const raw = isRecord(node.props) ? node.props : {}
  const parsed = def.props.safeParse(raw)
  const props = parsed.success && isRecord(parsed.data) ? parsed.data : raw
  return def.summary(props)
}

/**
 * 검증 · 폴백 문장이 타입 뒤에 붙이는 별칭 꼬리 — ` ('별칭')`, 별칭이 없으면 빈 글. 사람이 그 노드를 부르는 이름이라 타입만으로는 어느 노드인지 모르는 문장
 * (`validate.ts` 의 `invalid-props` · `children-not-allowed` · 렌더러의 폴백)이 쓴다. **타입이 문장 머리를 지킨다** — `타입의 props가 올바르지 않습니다 ('별칭'): …`
 * 꼴이라 첫 `(` · `:` 앞이 머리인 소비자(`apps/web` 의 `refusalHead` — 거절 조각의 열쇠)가 별칭에 따라 갈리지 않는다. 별칭이 없는 노드의 문장은 안 바뀐다.
 */
export function aliasNote(node: WbNode): string {
  const alias = nodeAlias(node)
  return alias === null ? '' : ` ('${isolateBidi(alias)}')`
}

/** `타입 (별칭)` — 별칭이 없으면 `타입`. 속성 패널 제목 · 캔버스 손잡이처럼 요약이 없는 자리가 쓴다. */
export function nodeHeading(node: WbNode): string {
  const type = typeof node.type === 'string' ? node.type : UNKNOWN_TYPE
  const alias = nodeAlias(node)
  return alias === null ? type : `${type} (${alias})`
}

/**
 * `타입 (별칭) 요약` — 구조 트리 줄 · MCP 의 `rowLabel`. 별칭 · 요약이 없으면 그 조각을 생략한다. `viewStates`는 상태 가지의 요약
 * (상태 이름)에만 쓴다 — 그 노드가 든 페이지의 목록을 넘긴다.
 */
export function nodeRowLabel(node: WbNode, viewStates?: readonly ViewState[]): string {
  const heading = nodeHeading(node)
  const summary = nodeSummary(node, viewStates)
  return summary === null ? heading : `${heading} ${summary}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
