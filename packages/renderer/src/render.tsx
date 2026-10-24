import {
  aliasNote,
  BODY_ZONE,
  childLists,
  effectiveViewState,
  getComponent,
  getKoreanErrorMap,
  isVisibleIn,
  stateLineage,
  WEIGHT_MAX,
  WEIGHT_MIN,
  type AnyDocument,
  type InteractionTrigger,
  type ViewState,
  type WbNode,
  zoneList,
} from '@wirebound/schema'
import { DEFAULT_VIEWS, type NodeBinding, type ThemeDefinition, type ViewField, type ViewItem } from '@wirebound/theme-sdk'
import { Fragment, type ReactElement, type ReactNode } from 'react'
import { activeStates, type WbAttrs, type WbHandlers } from './attrs'
import { FallbackNode } from './fallback'
import { hiddenByOverlay, overlayProps, runInteraction, type InteractionOverlay, type InteractionResult } from './interaction/runtime'
import { NO_THEME } from './no-theme'
import { resolveVariant } from './variant'
import { ViewHost } from './view-host'
import { warnUnusedViewKeys } from './view-keys'

export interface RenderOptions {
  /** Slot 자리에 넣을 내용. compose가 채운다. */
  slot?: ReactNode
  /**
   * 노드 렌더에 실패할 때마다 불린다. 앱이 배너 등으로 알릴 때 쓴다.
   *
   * 엘리먼트 트리를 만드는 도중에 불린다 — 즉 호출자가 렌더 중이면 렌더 중에 불린다.
   *
   * **이 콜백 안에서 `setState`를 부르지 마라.** 호출자의 렌더 중에 상태를 갱신하는 것이
   * 되어 React가 무한 루프(`Too many re-renders`)나 교차 컴포넌트 갱신 경고를 낸다.
   * nodeId로 중복을 걸러도 이 문제는 남는다 — 걸러지는 것은 값이지 호출 시점이 아니다.
   *
   * 대신 렌더 중에는 지역 배열(또는 ref)에 모아라. `renderNode`/`renderDocument`는 트리
   * 전체를 동기적으로 훑으므로, **함수가 돌아온 시점에 그 트리의 오류가 이미 다 들어 있다.**
   * 즉 상태 없이 같은 렌더 안에서 바로 쓸 수 있다:
   *
   * ```tsx
   * const errors: NodeRenderError[] = []
   * const tree = renderDocument(doc, { onNodeError: (e) => errors.push(e) })
   * return <>{errors.length > 0 && <ErrorBanner errors={errors} />}{tree}</>
   * ```
   *
   * (이 "돌아온 시점에 다 모여 있다"는 성질은 `fallback.test.tsx`의
   * `onNodeError는 renderDocument가 돌아오기 전에 트리 전체를 보고한다`가 지킨다.)
   *
   * 오류를 렌더 밖으로 내보내야 하면(로깅·토스트 등) 위 배열을 ref에 담고 `useEffect`에서
   * 읽어라. 이때 `setState(새 배열)`을 조건 없이 부르면 매 렌더마다 새 참조가 되어 다시
   * 무한 루프가 된다 — 이전 값과 내용이 같으면 갱신하지 않도록 비교해야 한다.
   *
   * 같은 노드가 여러 번 보고될 수 있다(React StrictMode의 이중 렌더 등). 위처럼 렌더마다
   * 새 배열에 모으면 저절로 해결되지만, 렌더를 넘겨 누적한다면 nodeId로 중복을 걸러라.
   */
  onNodeError?: (error: NodeRenderError) => void
  /**
   * **상호작용 런타임을 켠다**(설계서 「상호작용」의 「실행」). **없으면 꺼진 것이고 그것이 기본이다** —
   * 이 키를 주지 않은 호출(편집 모드의 캔버스·기존 케이스 전부)은 **한 글자도
   * 다르지 않게** 그려진다.
   *
   * `renderer`가 이것을 소유하는 이유는 `interaction/runtime.ts`의 머리말에 있다 — 요지는
   * 「HTML 정적 번들」의 *"렌더러가 하나뿐이라 결과가 어긋날 수 없다"*이고, `apps/web`에 두면
   * 정적 번들이 다른 런타임을 갖는다.
   */
  interaction?: InteractionOptions
  /**
   * **그릴 테마.** 노드마다 «테마 뷰 → SDK 기본 뷰» 를 React 컴포넌트로 그린다. 주지 않으면 `NO_THEME` — 모든 노드가
   * 기본 뷰다.
   */
  theme?: ThemeDefinition
  /**
   * **지금 화면 상태**(`PageDocument.viewStates`의 id). 그 상태에서 숨은 노드(`isVisibleIn` — 노드 보임 · 물려받기)는 그 자손째 그리지 않는다.
   * 없거나 `null`이면 기본이다. 목록(`viewStates`)에 없는 id 도 기본이다.
   */
  viewState?: string | null
  /**
   * 판정에 쓰는 상태 트리(그 문서의 `viewStates`). `renderDocument`는 문서에서 읽어 이 값을 덮는다(레이아웃은 목록이 없다). `renderNode`는
   * 문서를 모르므로 부르는 쪽이 준다 — 안 주면 목록이 빈 것이라 상태를 고른 판도 기본으로 판정한다.
   */
  viewStates?: readonly ViewState[]
  /**
   * **이름 붙은 구역 끝에 덧붙일 것** — 에디터가 끄는 동안만 빈 구역 칸을 세운다(`apps/web/src/canvas/empty-zones.tsx`). 노드의 선언된 이름 붙은
   * 구역마다(몸통은 아니다) `render(노드 id, 구역 이름)` 을 불러 `null` 이 아니면 그 구역 내용 뒤에 둔다 — 구역이 비었어도 그것이 내용이라 뷰의
   * `<Zone>` 이 그 자리를 편다. `key` 는 노드 캐시의 열쇠에 든다(같은 노드라도 덧붙일 것이 다르면 다시 그린다). **없으면 한 글자도 안 바뀐다.**
   */
  emptyZones?: { key: string; render: (nodeId: string, zone: string) => ReactNode | null }
  /**
   * **펼쳐 보일 노드**(설계 spec `2026-10-23-node-slots-design.md` Q3 (가)) — 이 노드들의 조상 가운데 자손을 가리는 타입(`ComponentDef.reveal` —
   * 지금 탭이 아닌 패널을 든 `Tabs` · 접힌 `SearchForm`)을 **이 렌더에서만** 펼친 props 로 그린다. 문서 · 내보내기 · 뷰 모드는 그대로다 — 에디터
   * 캔버스가 고른 노드를 준다. 덮을 것이 없으면(고른 노드가 이미 보인다) 한 글자도 안 바뀐다.
   *
   * 노드 id 는 그 노드의 **조상**만 덮는다. `{ nodeId, zone }`(넣을 자리로 고른 구역)은 그 부모 **자신**도 덮는다 — 부모가 제 구역을 가리는
   * 타입(접힌 `SearchForm` 의 단추 구역)이면 고른 구역이 화면에 없다(리뷰 RV-ZE L2).
   */
  reveal?: readonly RevealTarget[]
}

/** 펼쳐 보일 것 하나 — 노드 id, 또는 노드의 구역(`RenderOptions.reveal`). */
export type RevealTarget = string | { readonly nodeId: string; readonly zone: string }

/**
 * `reveal` 을 푼 것 — 덮을 노드의 props 와, 노드 캐시를 지나칠 노드(덮을 노드와 그 조상 — 조상의 캐시된 엘리먼트는 덮기 전 자식을 든다).
 * 렌더러 안에서만 쓴다(`withReveal`).
 */
interface RevealPlan {
  props: ReadonlyMap<string, Record<string, unknown>>
  uncached: ReadonlySet<string>
}

/** 렌더 옵션 + 푼 `reveal`. */
type Options = RenderOptions & { revealPlan?: RevealPlan }

/**
 * 상호작용 런타임의 입출력. **상태는 호출자가 든다** — 이 렌더러는 함수이지 컴포넌트가
 * 아니라 상태를 들 자리가 없고, 설계서 「HTML 정적 번들」에는 React가 없을 수도 있다.
 */
export interface InteractionOptions {
  /**
   * 지금 겹layer. **문서를 바꾸지 않고 그 위에 얹는다** — 뷰 모드에서 일어나는 것은
   * 시연이지 편집이 아니다.
   *
   * **모드를 나가거나 페이지를 옮기면 비우는 것은 호출자의 일이다.** 런타임은
   * 상태를 들지 않으므로 언제 리셋할지도 알 수 없다.
   */
  overlay?: InteractionOverlay
  /**
   * 노드에서 트리거가 일어났다. **`runInteraction`은 이미 여기서 돌았고, 그 결과가 인자다** —
   * 호출자가 할 일은 `result.overlay`를 다음 렌더에 되돌려 주고, `requests`를 처리하고
   * (라우팅은 렌더러 밖이다), `issues`를 말하는 것뿐이다.
   *
   * **판정을 호출자에게 넘기지 않는 것이 요점이다.** 앱이 `runInteraction`을 직접 부르게
   * 하면 웹 앱과 정적 번들이 각자 부르는 자리를 갖고, 순서·리셋·오류 처리가 갈릴 수 있다.
   * 렌더러가 부르면 그 셋이 한 벌이다.
   *
   * **`onNodeError`와 달리 이 콜백 안에서는 `setState`를 불러도 된다.** 그쪽은 엘리먼트
   * 트리를 만드는 **렌더 도중**에 불려 호출자의 렌더 중 상태 갱신이 되지만(그래서 무한
   * 루프가 난다), 이쪽은 **DOM 이벤트 핸들러 안**이라 렌더가 끝난 뒤다. 두 콜백이 같은
   * 모양이라 같은 규칙이 걸린다고 오해하기 쉬워 여기 적어 둔다.
   */
  onEvent?: (event: InteractionEvent) => void
}

/** `onEvent`가 받는 것. `runInteraction`의 결과에 *"어디서 무엇이 일어났나"*를 더한 것이다. */
export interface InteractionEvent extends InteractionResult {
  /** 트리거가 일어난 노드. 규칙이 걸린 노드이기도 하다. */
  nodeId: string
  trigger: InteractionTrigger
}

export interface NodeRenderError {
  /** 폴백이 그려진 노드의 id. 노드에서 문자열 id를 읽지 못했으면 빈 문자열이다. */
  nodeId: string
  /** 노드의 type. 문자열로 읽지 못했으면 빈 문자열이다. */
  type: string
  /** 한국어 메시지. 사용자에게 그대로 보여도 된다. */
  message: string
}

/**
 * **부모가 자식의 몫(`WbNode.weight`)을 읽는 법**(정본 설계서 「페이지 스키마 노드」의 몫). `flex` — 몫 그대로(`flex: <몫>`). `span` — 차지할
 * 칸 수라 부모 열 수로 자른다. 없음 — 그 부모 안에서 몫은 아무 일도 안 한다(값은 노드에 남는다).
 *
 * **자르기를 렌더러가 하는 까닭:** CSS `span min(var(몫), var(열 수))` 는 Chrome 에서 서지만 열 수를 상속으로만 읽는다 — 자식이 `Grid` 면 제
 * 뷰가 같은 변수에 제 열 수를 실어 부모 열 수가 아니라 제 열 수로 잘린다(넘치면 암묵 열이 생겨 격자가 넓어진다). 부모를 아는 곳은 여기다.
 */
export type WeightRoom = { kind: 'flex' } | { kind: 'span'; columns: number }

const FLEX_ROOM: WeightRoom = { kind: 'flex' }

/**
 * 이 타입의 노드가 자식에게 주는 몫의 자리. `Grid` 는 늘 열 수가 있고(기본값 2), `SearchForm` 은 열을 정한 판만이다. 없으면 그 부모 안에서 몫은 아무
 * 일도 안 한다. **속성 패널이 «몫» 칸을 보일지도 이것으로 가른다**(`apps/web/src/panels/property-panel.tsx`) — 판정이 두 벌이면 칸이 서는데 화면이
 * 안 바뀌는 부모가 생긴다.
 */
export function weightRoom(type: string, props: WbNode['props']): WeightRoom | undefined {
  // `Field` 의 값 구역은 `Flex` 처럼 몫을 읽는다 — 몫을 준 조각이 남는 폭을 나눠 갖는다(`[입력 몫 1][중복확인]`).
  if (type === 'Flex' || type === 'Field') return FLEX_ROOM
  if (type !== 'Grid' && type !== 'SearchForm') return undefined
  // 열 수는 카탈로그가 정한 모양 · 기본값으로 읽는다 — 못 읽으면(검증 실패) 이 노드는 폴백이라 자식의 몫이 서지 않는다.
  const parsed = getComponent(type)?.props.safeParse(props ?? {})
  const columns = parsed?.success === true ? (parsed.data as { columns?: unknown }).columns : undefined
  return typeof columns === 'number' ? { kind: 'span', columns } : undefined
}

/** 값을 받는 입력 조각 — `Field` 몸통에서 필드 이름(`ViewProps.field`)을 받는다. 단추 · 사이 글자 · 칩은 제 글이 이름이라 안 받는다. */
const VALUE_PIECES: ReadonlySet<string> = new Set(['Input', 'TextArea', 'Select', 'DateInput', 'TimeInput', 'CheckboxGroup', 'RadioGroup'])

/**
 * `Field` 몸통의 자식마다 실을 필드 이름(몸통 배열의 자리 → 이름) — 그 판에 서는 입력 조각만. 조각이 하나면 라벨, 여럿이면 라벨 + 별칭(없으면
 * 서는 조각 사이의 차례)이라 같은 필드의 조각끼리 갈린다(«기간 1» · «기간 2»). 라벨이 비었거나 props 를 못 읽으면 없다(조각은 제 이름으로 선다).
 *
 * **이름을 렌더러가 짓는 까닭:** 필드의 라벨 · 필수 · 형제 조각 수는 부모가 안다 — 조각 뷰는 제 노드만 받는다. 라벨 요소의 id 를 가리키게(`aria-labelledby`)
 * 하면 테마의 `FieldView` 가 그 id 를 그리는지에 기대게 되고, 글로 넘기면 어느 `FieldView` 아래서도 선다.
 */
function fieldNames(type: string, props: WbNode['props'], body: readonly unknown[], options: RenderOptions): (ViewField | undefined)[] {
  if (type !== 'Field') return []
  const parsed = getComponent(type)?.props.safeParse(props ?? {})
  if (parsed?.success !== true) return []
  const { label, required } = parsed.data as { label?: unknown; required?: unknown }
  const base = typeof label === 'string' ? label.trim() : ''
  if (base === '') return []
  const pieces = body.flatMap((child, index) =>
    child !== null &&
    typeof child === 'object' &&
    VALUE_PIECES.has(readString((child as { type?: unknown }).type)) &&
    shownIn(child, options)
      ? [{ index, alias: readString((child as { alias?: unknown }).alias).trim() }]
      : [],
  )
  const names: (ViewField | undefined)[] = []
  pieces.forEach(({ index, alias }, order) => {
    names[index] = { name: pieces.length === 1 ? base : `${base} ${alias !== '' ? alias : order + 1}`, required: required === true }
  })
  return names
}

function roomKey(room: WeightRoom | undefined): string {
  return room === undefined ? '' : room.kind === 'flex' ? 'flex' : `span${room.columns}`
}

/** 이 자리에서 실을 몫. 모양이 틀린 몫(낙관적 패치가 지난 문서 — `shapeError` 머리말)은 없는 것으로 친다. */
function weightIn(room: WeightRoom | undefined, weight: unknown): number | undefined {
  if (room === undefined) return undefined
  if (typeof weight !== 'number' || !Number.isInteger(weight) || weight < WEIGHT_MIN || weight > WEIGHT_MAX) return undefined
  return room.kind === 'flex' ? weight : Math.min(weight, room.columns)
}

/** 노드에서 문자열 하나를 읽는다. 문자열이 아니면 빈 문자열이다(모양 가드가 흡수한 노드). */
function readString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * `node`가 노드의 모양인지 본다. 아니면 그 이유를 한국어로 돌려주고, 맞으면 null이다.
 *
 * `WbNode` 타입을 믿지 않는 이유: 이 렌더러가 받는 문서는 서버 검증 **전에** 낙관적 패치가
 * 지나간 것이라(설계서 「정방향 흐름」) 일시적으로 타입을 만족하지 않을 수 있다. 컴파일러가 막아 주는
 * 것은 호출부의 타입뿐이고, 런타임에 들어오는 값이 아니다.
 */
function shapeError(node: unknown): string | null {
  if (node === null) return '노드가 객체가 아닙니다: null'
  if (typeof node !== 'object') return `노드가 객체가 아닙니다: ${typeof node}`
  const { id, type } = node as { id?: unknown; type?: unknown }
  if (typeof id !== 'string') return '노드의 id가 문자열이 아닙니다'
  if (typeof type !== 'string') return '노드의 type이 문자열이 아닙니다'
  return null
}

/**
 * 그 자식이 이 렌더에서 서는가 — 겹layer가 안 숨겼고 고른 상태에서 보인다(`renderNodeUncached` 의 두 숨김과 같은 판정). 빈 구역(`ViewProps.zones` 의
 * `null`)과 뷰가 받는 자식 목록(`items`)이 이것으로 가른다. 노드가 아닌 원소는 그 자리에 폴백이 서므로 선다.
 */
function shownIn(child: unknown, options: RenderOptions): boolean {
  if (child === null || typeof child !== 'object') return true
  const id = readString((child as { id?: unknown }).id)
  if (id !== '' && hiddenByOverlay(options.interaction?.overlay, id)) return false
  return isVisibleIn(child as WbNode, options.viewState ?? null, options.viewStates)
}

/** 자식 Fragment의 key. id를 문자열로 읽지 못하면 인덱스로 대신한다 — 모양 가드가 흡수할 자식이다. */
function childKey(child: unknown, index: number): string {
  const id = (child as { id?: unknown } | null | undefined)?.id
  return typeof id === 'string' ? id : `wb-invalid-${index}`
}

/**
 * 노드 하나를 그린다. **던지지 않는다** — 노드가
 * 잘못돼 있으면 그 자리에 폴백을 그린다. 던지면 React가 서브트리를 통째로
 * 버리는데, 에디터는 서버 검증 전에 낙관적 패치를 적용하므로(「정방향 흐름」) 일시적으로
 * 유효하지 않은 문서가 정상 상태다. 편집 중에 화면이 사라지면 안 된다.
 *
 * 폴백으로 흡수하는 것: 노드가 객체가 아니거나 `id`·`type`이 문자열이 아닌 경우,
 * `children`이 배열이 아니거나 그 원소가 노드가 아닌 경우, 알 수 없는 컴포넌트 타입,
 * props 검증 실패, 기본 뷰가 없는 컴포넌트.
 *
 * **뷰 본문의 예외는 노드마다 둔 경계가 받아 그 자리에 폴백을 그린다**
 * (`view-host.tsx`) — 그 폴백은 React 가 뷰를 그릴 때 서므로 동기 `onNodeError` 에는 실리지 않는다.
 */
export function renderNode(node: WbNode, options: RenderOptions = {}): ReactElement {
  // 상호작용 타겟을 풀려면 **트리 전체**가 필요한데(다른 노드를 가리킨다) 이 진입점이 받는
  // 것은 노드 하나다. 그 노드를 뿌리로 삼는다 — 부분 트리를 그리는 호출자에게는 그 부분이
  // 곧 세계이고, 밖을 가리키는 타겟은 `사라진 노드`가 되어 `issues`로 말하는 경로로 간다.
  return renderNodeIn(node, node, withReveal(node, options))
}

/**
 * `reveal` 을 푼다 — 보일 노드마다 뿌리부터의 조상 사슬을 걸어, 자손을 가리는 타입(`ComponentDef.reveal`)의 props 를 그 자식 줄 자리로 덮은 값과
 * 견준다. 값이 바뀌는 조상만 덮고, 그 조상과 그 위 사슬은 캐시를 지나친다. 덮을 것이 없으면 옵션 그대로다(캐시도 그대로 쓴다).
 */
function withReveal(root: WbNode, options: RenderOptions): Options {
  const targets = options.reveal
  if (targets === undefined || targets.length === 0) return options
  const wanted = new Set(targets.filter((target) => typeof target === 'string'))
  // 구역 — 부모 id → 구역 이름들. 그 부모 자신을 «그 구역 끝의 자식이 보인다» 로 덮는다.
  const zones = new Map<string, string[]>()
  for (const target of targets) {
    if (typeof target !== 'string') zones.set(target.nodeId, [...(zones.get(target.nodeId) ?? []), target.zone])
  }
  const props = new Map<string, Record<string, unknown>>()
  const uncached = new Set<string>()
  const chain: { id: string; type: string; props: unknown; step: { zone: string; index: number } }[] = []
  /** 사슬(뿌리 → 보일 것의 부모)의 덮을 조상을 덮는다. */
  const cover = (): void => {
    for (let i = chain.length - 1; i >= 0; i -= 1) {
      const link = chain[i]!
      const def = getComponent(link.type)
      if (def?.reveal === undefined) continue
      const parsed = def.props.safeParse(props.get(link.id) ?? link.props ?? {})
      if (!parsed.success) continue
      const now = parsed.data as Record<string, unknown>
      const next = def.reveal(now, link.step)
      if (Object.keys(next).every((key) => Object.is(next[key], now[key]))) continue
      props.set(link.id, next)
      for (let j = 0; j <= i; j += 1) uncached.add(chain[j]!.id)
    }
  }
  const walk = (node: unknown): void => {
    if (node === null || typeof node !== 'object') return
    const raw = node as { id?: unknown; type?: unknown; props?: unknown }
    const id = readString(raw.id)
    if (wanted.has(id)) cover()
    for (const zone of zones.get(id) ?? []) {
      // 그 구역의 끝(넣을 자리)이 보일 자리다 — 부모 자신을 사슬 끝에 얹어 덮는다.
      const end = childLists(node).find((entry) => entry.zone === zone)?.list.length ?? 0
      chain.push({ id, type: readString(raw.type), props: raw.props, step: { zone, index: end } })
      cover()
      chain.pop()
    }
    for (const entry of childLists(node)) {
      entry.list.forEach((child, index) => {
        chain.push({ id: readString(raw.id), type: readString(raw.type), props: raw.props, step: { zone: entry.zone, index } })
        walk(child)
        chain.pop()
      })
    }
  }
  walk(root)
  return props.size === 0 ? options : { ...options, revealPlan: { props, uncached } }
}

/**
 * 재귀 본체. `root`는 **상호작용 타겟을 푸는 세계**이고 재귀 내내 같다.
 *
 * 공개 API에 `root`를 노출하지 않는 이유: 호출자가 문서와 다른 뿌리를 줄 수 있게 되면
 * *"이 액션의 타겟이 무엇인가"*가 호출자마다 갈린다 — 「HTML 정적 번들」의 *"렌더러가 하나뿐이라
 * 결과가 어긋날 수 없다"*가 그 자리에서 깨진다.
 */
function renderNodeIn(root: WbNode, node: WbNode, options: Options, room?: WeightRoom, field?: ViewField): ReactElement {
  // 펼쳐 보이느라 덮는 노드와 그 조상은 캐시를 지나친다(`RevealPlan`). 필드 이름을 받는 조각도 — 이름이 부모(라벨 · 형제 수)에서 오고, 부모가 새로 그릴
  // 때만 다시 그려진다(부모는 제 캐시를 쓴다). 이름마다 열쇠를 두면 라벨을 고칠 때마다 열쇠가 쌓인다.
  const cache =
    field !== undefined || options.revealPlan?.uncached.has(readString((node as { id?: unknown } | null)?.id)) === true
      ? null
      : nodeCacheFor(node, options, room)
  if (cache === null) return renderNodeUncached(root, node, options, room, field)
  const hit = cache.get(node)
  if (hit !== undefined) return hit
  let failed = false
  const element = renderNodeUncached(
    root,
    node,
    {
      ...options,
      onNodeError: (error) => {
        failed = true
        options.onNodeError?.(error)
      },
    },
    room,
  )
  // **오류가 난 서브트리는 기억하지 않는다** — 오류는 `onNodeError` 로 말해야 하므로 다시 그려야 하고, 폴백은 카탈로그 설치 같은 렌더러 밖의 상태에도 기대
  // (`getComponent` — 설치 전에 그린 폴백이 설치 뒤에도 남으면 안 된다). 오류 없는 서브트리만 재사용하면 `onNodeError` 를 다시 흉내 낼 일도 없다.
  if (!failed) cache.set(node, element)
  return element
}

/** 테마 → 화면 상태 · 몫의 자리 → 노드 객체 → 그린 엘리먼트. 키가 약해서 문서 · 테마가 버려지면 함께 사라진다. */
const NODE_CACHE = new WeakMap<object, Map<string, WeakMap<object, ReactElement>>>()

/**
 * **노드 객체 동일성으로 엘리먼트를 재사용한다** — 문서의 편집은 지나는 길의 노드만 새 객체로 만들고(`applyOps` · `canvas/canvas-preview.ts` 의
 * `previewDocument`) 나머지 서브트리는 그 객체 그대로다. 같은 엘리먼트를 돌려주면 React 가 그 서브트리를 다시 그리지 않는다 — 배치 미리보기가 서고 걷힐
 * 때마다 문서 전체(노드 200 이면 긴 작업 두 번 · 각 68ms)를 다시 그리던 비용이 길 위의 노드로 줄어든다(`apps/web/build-test/canvas-preview.test.ts` «노드 200»).
 *
 * **캐시가 서는 판은 «그린 것이 노드 · 테마 · 화면 상태만으로 정해지는» 판이다.** 상호작용 런타임을 켠 렌더(`interaction` — 핸들러가 문서 `root` 를 닫는다 · 겹layer 가
 * 노드를 숨기고 props 를 덮는다)와 `slot` 을 받는 렌더(레이아웃 — 같은 노드가 주입한 엘리먼트에 따라 갈린다)는 안 쓴다 — `null`. 오류가 난 서브트리도 기억하지 않는다
 * (`renderNodeIn`).
 *
 * **노드 객체를 제자리에서 고치지 마라** — 고치면 캐시가 옛 모양을 돌려준다. 문서는 불변으로 다룬다(스토어의 편집은 새 객체를 만든다).
 *
 * **부모가 정한 몫의 자리(`WeightRoom`)도 열쇠다** — 같은 노드라도 부모 `Grid` 의 열 수가 바뀌면 실을 몫이 달라지는데, 부모만 새 객체가 되고
 * 이 노드는 그 객체 그대로다.
 */
function nodeCacheFor(node: unknown, options: RenderOptions, room: WeightRoom | undefined): WeakMap<object, ReactElement> | null {
  if (options.interaction !== undefined || options.slot !== undefined) return null
  if (typeof node !== 'object' || node === null) return null
  const theme: object = options.theme ?? NO_THEME
  let byState = NODE_CACHE.get(theme)
  if (byState === undefined) {
    byState = new Map()
    NODE_CACHE.set(theme, byState)
  }
  // 숨김 판정은 고른 상태의 조상 줄(`stateLineage`)에만 기댄다 — 목록의 다른 상태 · 이름이 바뀌어도 같은 열쇠다. 상태 id 는 노드 id 규칙이라
  // 쉼표 · 줄바꿈이 없다 — 몫의 자리와 섞이지 않는다.
  const lineage = stateLineage(options.viewStates, effectiveViewState(options.viewState ?? null, options.viewStates)).join(',')
  const stateKey = `${lineage}\n${roomKey(room)}${options.emptyZones === undefined ? '' : `\n${options.emptyZones.key}`}`
  let byNode = byState.get(stateKey)
  if (byNode === undefined) {
    byNode = new WeakMap()
    byState.set(stateKey, byNode)
  }
  return byNode
}

function renderNodeUncached(root: WbNode, node: WbNode, options: Options, room: WeightRoom | undefined, field?: ViewField): ReactElement {
  const raw = node as unknown as { id?: unknown; type?: unknown; props?: unknown; children?: unknown } | null
  const nodeId = readString(raw?.id)

  // **숨긴 노드는 자식까지 함께 사라진다**(`setVisible { value: false }`). 자식을 그리기
  // **전에** 걸러야 하는 것이 요점이다: 뒤에 두면 보이지도 않는 서브트리의 폴백이
  // `onNodeError`로 보고되어, 화면에 없는 노드 때문에 배너가 뜬다.
  //
  // 감추지 않고 **DOM에서 빼는** 것은 `apps/web`이 뷰 모드에서 구조 트리를 빼는 것과 같은
  // 판단이다 — `display:none`으로 두면 테마가 그것을 덮어 되살릴 수 있어 *"숨겨졌다"*가
  // 아니게 된다.
  if (nodeId !== '' && hiddenByOverlay(options.interaction?.overlay, nodeId)) return <></>

  // **그 상태에서 숨은 노드도 자식까지 함께 사라진다**(`isVisibleIn` — 부모가 숨으면 자손도 숨는다). 겹layer와 같은 까닭으로 자식을 그리기
  // 전에 거르고 DOM 에서 뺀다 — 숨은 노드는 마커 · 외곽선을 걸 요소가 없다.
  if (raw !== null && typeof raw === 'object' && !isVisibleIn(node, options.viewState ?? null, options.viewStates)) return <></>

  const type = readString(raw?.type)
  const def = getComponent(type)

  // 자식을 먼저 그린다. 이 노드가 실패해도 자식은 폴백 안에 그대로 들어간다 —
  // 부모를 못 그리는 것과 자식을 못 그리는 것은 별개다.
  //
  // 자식 줄은 몸통과 구역 전부다(`childLists` — 카탈로그의 구역 선언 차례). 줄이 배열이 아니면 빈 줄이고, 원소가 노드가 아니면 재귀 호출의
  // 모양 가드가 그 자리에 폴백을 그린다. **몫의 자리는 몸통에만 준다** — 몫이 듣는 배치(`Flex` · `Grid` · 열을 정한 `SearchForm`)는 몸통이다.
  const ownProps = overlayProps(options.interaction?.overlay, nodeId, raw?.props as WbNode['props'])
  const childRoom = weightRoom(type, ownProps)
  const drawn = (list: readonly unknown[], at: WeightRoom | undefined, fields: readonly (ViewField | undefined)[] = []): ReactElement[] =>
    list.map((child, index) => (
      <Fragment key={childKey(child, index)}>{renderNodeIn(root, child as WbNode, options, at, fields[index])}</Fragment>
    ))
  const lists = childLists(raw)
  const bodyList = lists.find((entry) => entry.pointer === '/children')?.list ?? []
  const bodyDrawn = drawn(bodyList, childRoom, fieldNames(type, ownProps, bodyList, options))
  // 몸통을 부모에게 맡기는 타입(`TabPanel`)은 제 뷰에 몸통을 안 준다 — 부모가 `items[i].content` 로 둔다(그 몸통은 부모의 폴백에도 실린다).
  const hostedByParent = def?.bodyHost === 'parent'
  const children: ReactNode = !hostedByParent && bodyDrawn.length > 0 ? bodyDrawn : null
  const zones: Record<string, ReactNode> = {}
  const strays: ReactNode[] = []
  for (const entry of lists) {
    if (entry.pointer === '/children') continue
    const elements = drawn(entry.list, undefined)
    // 몸통이 아닌 줄인데 이름이 `body` 인 것(검증 전 `zones.body`)과 선언 밖 구역은 뷰에 안 간다 — 폴백에만 싣는다.
    if (entry.zone !== BODY_ZONE && def?.zones.some((zone) => zone.name === entry.zone) === true) {
      const extra = options.emptyZones?.render(nodeId, entry.zone) ?? null
      const content = entry.list.some((child) => shownIn(child, options)) ? elements : null
      zones[entry.zone] = extra === null ? content : [...(content ?? []), <Fragment key="wb-empty-zone">{extra}</Fragment>]
    } else if (elements.length > 0) strays.push(<Fragment key={`wb-zone-${entry.pointer}`}>{elements}</Fragment>)
  }
  const items: ViewItem[] = []
  bodyList.forEach((child, index) => {
    if (!shownIn(child, options)) return
    const shaped = child as { id?: unknown; type?: unknown } | null
    const hosted = getComponent(readString(shaped?.type))?.bodyHost === 'parent'
    const content = hosted ? drawn(zoneList(child, BODY_ZONE), undefined) : []
    items.push({ nodeId: readString(shaped?.id), index, element: bodyDrawn[index], content: content.length > 0 ? content : null })
  })
  const fallbackChildren: ReactNode = (
    <>
      {hostedByParent ? null : children}
      {lists
        .filter((entry) => entry.pointer !== '/children')
        .map((entry) => (
          <Fragment key={`wb-zone-${entry.pointer}`}>{drawn(entry.list, undefined)}</Fragment>
        ))}
      {items.map((item) => (item.content === null ? null : <Fragment key={`wb-content-${item.nodeId}`}>{item.content}</Fragment>))}
    </>
  )

  const fallback = (message: string): ReactElement => {
    options.onNodeError?.({ nodeId, type, message })
    return (
      <FallbackNode nodeId={nodeId} message={message}>
        {fallbackChildren}
      </FallbackNode>
    )
  }

  // 모양 가드. `node`가 null/undefined면 바로 아래 `node.props` 접근에서 TypeError가 난다.
  // id·type이 문자열이 아닌 경우는 아래 경로가 던지지는 않지만(카탈로그 조회가 그냥 빗나간다)
  // 여기서 흡수한다 — 무엇이 잘못됐는지를 `알 수 없는 컴포넌트 타입: undefined`보다
  // 정확히 말해 주기 때문이다.
  const shape = shapeError(node)
  if (shape !== null) return fallback(shape)

  if (!def) return fallback(`알 수 없는 컴포넌트 타입: ${type}`)

  // **겹layer가 문서의 props를 덮는다.** 겹layer에 이 노드가 없으면 `node.props`가
  // 그대로 돌아오므로 꺼진 렌더는 이 줄을 지나도 같은 값이다.
  //
  // **덮은 값도 검증을 지난다.** 통과하지 못하면 이 노드는 폴백이 되는데, 그 상태는
  // 겹layer에 닿기 전에 런타임의 판정이 먼저 걸러 낸다 — `checkNodeAction`이 같은 카탈로그
  // 스키마로 값을 보고 `invalid-interaction-prop`을 낸다. 즉 여기까지 오는 겹layer 값은
  // 이미 그 prop의 계약을 만족한다.
  // **펼쳐 보이느라 덮는 props**(`RenderOptions.reveal`) — 이 렌더에서만이다. 덮을 것이 없으면 겹layer를 지난 그대로다.
  const nodeProps = options.revealPlan?.props.get(nodeId) ?? overlayProps(options.interaction?.overlay, nodeId, node.props)

  // 로케일을 넘기는 이유: 이 경로가 내는 메시지도 사용자가 그대로 읽는다.
  // 넘기지 않으면 서버 검증은 한국어, 렌더는 영문이 되어 같은 문제가 둘로 보인다.
  const parsed = def.props.safeParse(nodeProps ?? {}, { error: getKoreanErrorMap() })
  if (!parsed.success) {
    // 문안은 validate.ts의 `invalid-props` 이슈와 같아야 한다.
    // fallback.test.tsx가 두 문자열이 같은지 직접 비교해 갈라지는 것을 막는다.
    return fallback(
      `${node.type}의 props가 올바르지 않습니다${aliasNote(node)}: ${parsed.error.issues
        .map((issue) => `${issue.path.join('.')} ${issue.message}`)
        .join(', ')}`,
    )
  }

  const theme = options.theme ?? NO_THEME
  const fallbackView = DEFAULT_VIEWS[node.type]
  if (fallbackView === undefined) return fallback(`기본 뷰가 없는 컴포넌트: ${node.type}`)
  const props = parsed.data as Record<string, unknown>
  const variant = resolveVariant(def, node, props, theme.manifest)
  const states = activeStates(def, props)
  const attrs: WbAttrs = { 'data-wb-id': node.id, 'data-wb-component': node.type }
  if (variant !== undefined) attrs['data-wb-variant'] = variant
  if (states.length > 0) attrs['data-wb-state'] = states.join(' ')
  const binding: Omit<NodeBinding, 'markRootRendered'> = {
    // **꺼져 있으면 속성 객체 그대로 넘어간다** — 끈 렌더는 상호작용이 없는 렌더와 한 글자도 달라서는 안 된다.
    attrs: options.interaction === undefined ? attrs : { ...attrs, ...handlersFor(root, node, options) },
  }
  const weight = weightIn(room, node.weight)
  if (weight !== undefined) binding.weight = weight
  return (
    <ViewHost
      key={node.id}
      nodeId={node.id}
      view={theme.views[node.type] ?? fallbackView}
      fallbackView={fallbackView}
      binding={binding}
      viewProps={{
        nodeId: node.id,
        type: node.type,
        props,
        states,
        variant,
        children,
        zones,
        items,
        slot: options.slot ?? null,
        ...(field === undefined ? {} : { field }),
      }}
      fallbackChildren={fallbackChildren}
    />
  )
}

/**
 * 트리거 4종 → DOM 이벤트.
 *
 * **`attrs`에 얹는 것이 요점이다.** 뷰는 노드 속성을 `Root`에 펴므로(`@wirebound/theme-sdk`) 여기 핸들러를 넣으면
 * **뷰를 한 글자도 안 고치고** 모든 컴포넌트가 상호작용을 받는다.
 *
 * **설계서 「노드 속성」의 여섯 속성 계약을 넓히지 않는다.** 이것들은 `data-*` 속성이 아니라 React의
 * 이벤트 prop이라 DOM에 속성으로 나가지 않고, 테마의 셀렉터 어휘에 아무것도 더하지
 * 않는다(`test/contract-attrs.test.ts`가 세는 것도 `data-wb-*`다). **일곱째 데이터 속성이
 * 필요해지면 만들기 전에 멈추고 묻는다.**
 *
 * **`select`가 `onClick`인 것은 판정이다.** 와이어프레임 DOM에는 *"선택"*을 내는 네이티브
 * 이벤트원이 없다 — `Tabs`의 기본 뷰는 탭마다 `<span>`을 그리고 `List`도
 * 행이 `<div>`다. 「자동 문장화」의 표본(*"③ 상세정보 탭 선택 시"*)이 실제로 뜻하는 조작은 **그 노드
 * 안을 누르는 것**이고, 그것이 루트로 버블링해 여기 닿는다. React의 `onSelect`(텍스트
 * 선택)는 그 조작이 아니다.
 *
 * **`change`·`submit`은 사용자 조작으로는 닿지 않는다** — `Field`가 `<input>`이 아니라
 * `<div>`를 그리고(와이어프레임이므로), 폼에는 제출 버튼이 없어 `<span>조회</span>`가
 * 아무것도 제출하지 않는다. **그래도 다는 것은** 그 이벤트가 나면 규칙이 돌아야 하고
 * (프로그램적 제출·미래의 실제 컨트롤), 달지 않으면 *"트리거 4종"*이라는 「모델」의 계약이
 * 화면에서 반만 참이 되기 때문이다.
 */
function handlersFor(root: WbNode, node: WbNode, options: RenderOptions): WbHandlers {
  const interactions = node.interactions
  if (!Array.isArray(interactions) || interactions.length === 0) return NO_HANDLERS

  const handlers: WbHandlers = {}
  for (const interaction of interactions) {
    const dom = DOM_EVENT[interaction?.on as InteractionTrigger]
    // 트리거 이름이 4종 밖이면 붙일 자리가 없다. 검증 전 문서가 그럴 수 있다.
    if (dom === undefined || handlers[dom] !== undefined) continue
    handlers[dom] = (event) => {
      // **이 줄을 지우면 폼 제출이 페이지를 떠난다. 지우지 마라.**
      //
      // 와이어프레임에는 제출을 보낼 곳이 없는데, `<form>`은 막지 않으면 기본 동작으로
      // **문서를 떠난다** — 그러면 겹layer(뷰 모드에서 눌러 만든 화면 상태)가 통째로 사라지고
      // 사용자는 *"눌렀더니 페이지가 리로드됐다"*를 본다.
      //
      // **실브라우저에서 A/B/A로 쟀다.** 렌더된 `<form>`에 `action`을 걸고
      // `<button type="submit">`을 꽂아 눌렀다:
      //
      // | 번들 | 이동했나 | window 버블의 `defaultPrevented` |
      // |---|---|---|
      // | A — 이 줄 있음 | **안 한다** | `true` |
      // | B — 이 줄 없음 | **`/landed.html`로 이동한다**(JS 문맥이 파괴됐다) | `false` |
      // | A′ — 되돌림 | 안 한다 | `true` |
      //
      // **이 줄은 하중이 있다 — *"React가 이미 막는다"*가 아니다.** 잴 때 함정이 있다:
      // `src/render.tsx`에 A/B를 심어도 번들러가 `package.json`의 `exports`를 따라
      // **`dist/`를** 보면 두 번들이 **바이트까지 같아져** 이 줄이 하중 0으로 보인다.
      // `--alias`로 `src`를 보게 하고 재야 한다. window 버블에서 `true`인 것은 React가
      // 아니라 **React의 루트 리스너가 부른 이 핸들러**다.
      //
      // **jsdom으로는 이 갈래를 잴 수 없다** — 거기서는 제출이 이동을 만들지 않는다.
      // 그래서 회귀가 이 줄을 지키지 못한다(`test/interaction-runtime.test.tsx`의
      // `submit 규칙은 기본 동작을 막는다`가 **`defaultPrevented`만** 본다).
      if (dom === 'onSubmit') event.preventDefault()
      fire(root, node, dom, options, (event as { nativeEvent?: object }).nativeEvent)
    }
  }
  return handlers
}

/**
 * 한 DOM 이벤트가 도맡는 트리거 전부를 돌린다.
 *
 * **`click`과 `select`가 같은 `onClick`을 쓰므로 둘을 함께 돌린다.** 하나만 돌리면 같은
 * 노드에 둘을 건 사용자가 *"하나는 되고 하나는 안 되는"* 화면을 본다.
 *
 * **결과를 합칠 때 겹layer를 이어 붙인다** — 앞 트리거가 만든 겹layer 위에서 뒤 트리거가
 * 돌아야 순서(`runInteraction`의 머리말 「순서」)가 한 벌로 남는다.
 *
 * **같은 DOM 이벤트가 버블링으로 지나는 핸들러끼리도 잇는다**(`native` — React 가 버블링 내내 같은 네이티브 이벤트를 넘긴다). 안쪽
 * 노드의 핸들러가 낸 겹layer를 호스트가 상태에 실어 다시 그리기 전에 바깥 노드의 핸들러가 돈다 — 렌더 때 받은 겹layer에서 출발하면
 * 안쪽의 쓰기를 모른 채 제 결과를 내고, 호스트가 그것을 마지막으로 실어 안쪽 쓰기가 사라진다(`test/interaction-bubble.test.tsx`).
 */
function fire(root: WbNode, node: WbNode, dom: keyof WbHandlers, options: RenderOptions, native: object | undefined): void {
  const onEvent = options.interaction?.onEvent
  let overlay = (native === undefined ? undefined : GESTURE_OVERLAY.get(native)) ?? options.interaction?.overlay
  for (const trigger of TRIGGERS_OF[dom] ?? []) {
    const result = runInteraction(root, node.id, trigger, overlay)
    overlay = result.overlay
    // **아무 규칙도 없으면 알리지 않는다.** 노드마다 트리거가 하나뿐인 것이 보통이라
    // 그러지 않으면 빈 결과가 늘 하나씩 따라 나간다.
    if (result.matched === 0) continue
    onEvent?.({ ...result, nodeId: node.id, trigger })
  }
  if (native !== undefined && overlay !== undefined) GESTURE_OVERLAY.set(native, overlay)
}

/** 네이티브 이벤트 → 그 이벤트 안에서 마지막으로 낸 겹layer(`fire`의 머리말). 이벤트가 버려지면 함께 사라진다. */
const GESTURE_OVERLAY = new WeakMap<object, InteractionOverlay>()

/** 핸들러가 없을 때. **참조를 고정한다** — 매번 `{}`를 만들면 `attrs`가 렌더마다 새 것이 된다. */
const NO_HANDLERS: WbHandlers = Object.freeze({})

/** 트리거 → 그것을 받는 DOM 이벤트. 근거는 `handlersFor`의 머리말. */
const DOM_EVENT: Record<InteractionTrigger, keyof WbHandlers> = {
  click: 'onClick',
  select: 'onClick',
  change: 'onChange',
  submit: 'onSubmit',
}

/**
 * 위 표의 역방향. **한 이벤트가 트리거 둘을 도맡을 수 있다**(`onClick` ← `click`·`select`).
 * 표에서 유도하는 것이 요점이다 — 손으로 적으면 위 표를 고친 날 둘이 갈린다.
 */
const TRIGGERS_OF: Record<string, InteractionTrigger[]> = (() => {
  const out: Record<string, InteractionTrigger[]> = {}
  for (const [trigger, dom] of Object.entries(DOM_EVENT) as [InteractionTrigger, keyof WbHandlers][]) {
    ;(out[dom] ??= []).push(trigger)
  }
  return out
})()

/**
 * 문서 하나를 그린다. 보증은 `renderNode`와 같다 — 던지지 않는다.
 *
 * `?.`를 쓰는 이유: 타입상 `doc`도 `root`도 반드시 있지만, 런타임에는 문서가 아직 없거나
 * (로딩 중) 낙관적 패치가 `/root`를 지운 중간 상태가 들어올 수 있다. 어느 쪽이든
 * `renderNode`의 모양 가드가 루트 자리에 폴백을 그린다.
 */
export function renderDocument(doc: AnyDocument, options: RenderOptions = {}): ReactElement {
  warnUnusedViewKeys(options.theme)
  const root = doc?.root as WbNode
  return renderNodeIn(
    root,
    root,
    withReveal(root, { ...options, viewState: knownViewState(doc, options.viewState), viewStates: documentStates(doc) }),
  )
}

/** 문서의 상태 목록 — 레이아웃 · 검증 전 문서(배열이 아님)는 빈 목록. 원소의 모양은 판정(`stateLineage`)이 견딘다. */
function documentStates(doc: AnyDocument): readonly ViewState[] {
  const states: unknown = (doc as { viewStates?: unknown } | null | undefined)?.viewStates
  return Array.isArray(states) ? (states.filter((state) => state !== null && typeof state === 'object') as ViewState[]) : []
}

/**
 * `viewState`가 그 문서의 목록(`viewStates`)에 있으면 그대로, 아니면 `null`(기본). 레이아웃에는 목록이 없어 늘 `null`이다 —
 * `renderComposed`가 같은 옵션으로 두 문서를 그려도 레이아웃은 기본으로 판정한다. 검증 전 문서의 목록(배열이 아님 · 원소가 객체가
 * 아님)도 던지지 않고 «없음»으로 읽는다.
 */
function knownViewState(doc: AnyDocument, viewState: string | null | undefined): string | null {
  if (typeof viewState !== 'string') return null
  const states: unknown = (doc as { viewStates?: unknown } | null | undefined)?.viewStates
  if (!Array.isArray(states)) return null
  return states.some((state) => (state as { id?: unknown } | null)?.id === viewState) ? viewState : null
}
