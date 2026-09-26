import {
  defaultStructure,
  getComponent,
  getKoreanErrorMap,
  requireComponent,
  type AnyDocument,
  type ComponentDef,
  type InteractionTrigger,
  type WbNode,
} from '@wirebound/schema'
import { DEFAULT_VIEWS, type NodeBinding, type ThemeDefinition } from '@wirebound/theme-sdk'
import { Fragment, type ReactElement, type ReactNode } from 'react'
import { activeStates, nodeAttrs, partAttrs, type WbHandlers } from './attrs'
import { FallbackNode } from './fallback'
import {
  hiddenByOverlay,
  overlayProps,
  runInteraction,
  type InteractionOverlay,
  type InteractionResult,
} from './interaction/runtime'
import { getStructure } from './structures/registry'
import { resolveVariant } from './variant'
import { ViewHost } from './view-host'

export interface RenderOptions {
  /** 컴포넌트 타입 → 구조 이름. 테마가 제공한다. 없으면 카탈로그의 첫 구조를 쓴다. */
  structures?: Record<string, string>
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
   * 이 키를 주지 않은 호출(편집 모드의 캔버스·테마 갤러리·기존 케이스 전부)은 **한 글자도
   * 다르지 않게** 그려진다.
   *
   * `renderer`가 이것을 소유하는 이유는 `interaction/runtime.ts`의 머리말에 있다 — 요지는
   * 「HTML 정적 번들」의 *"렌더러가 하나뿐이라 결과가 어긋날 수 없다"*이고, `apps/web`에 두면
   * 정적 번들이 다른 런타임을 갖는다.
   */
  interaction?: InteractionOptions
  /**
   * **테마 경로를 켠다.** 주면 노드마다 «테마 뷰 → SDK 기본 뷰» 를 React 컴포넌트로 그리고 `structures` 는 보지 않는다.
   * 주지 않으면 구조 경로 그대로다 — 내보내기가 그 경로를 쓴다.
   */
  theme?: ThemeDefinition
}

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

export type StructureResolution = { ok: true; structure: string } | { ok: false; message: string }

/**
 * 구조 이름 결정의 실제 본체. 던지는 대신 결과를 돌려준다.
 *
 * `resolveStructure`를 try/catch로 감싸지 않는 이유: catch는 이 함수가 의도한 실패만이
 * 아니라 그 안에서 난 모든 예외를 똑같이 폴백으로 삼켜, 진짜 버그를 "구조를 못 찾았다"로
 * 위장한다.
 *
 * **공개한다 — 편집기의 속성 패널이 캔버스와 같은 구조를 보려고 부른다**
 * (`apps/web/src/panels/property-panel.tsx`의 `currentStructure`). 패널이 구조 표를 스스로 읽으면
 * 판정이 두 벌이 되어 캔버스와 갈린다. 패널은 오류 경계 밖이라 던지는 `resolveStructure` 대신 이것을 쓴다.
 */
export function resolveStructureOf(def: ComponentDef, options: RenderOptions): StructureResolution {
  const requested = options.structures?.[def.type]
  if (requested === undefined) return { ok: true, structure: defaultStructure(def) }
  if (!def.structures.includes(requested)) {
    return { ok: false, message: `${def.type}에 없는 구조입니다: ${requested}` }
  }
  return { ok: true, structure: requested }
}

/**
 * 던지는 공개 API. `renderNode`는 이것을 쓰지 않고 폴백으로 흡수하지만,
 * 구조 이름만 알고 싶은 호출자(테마 도구 등)에게는 실패가 예외인 편이 낫다.
 */
export function resolveStructure(type: string, options: RenderOptions): string {
  const resolved = resolveStructureOf(requireComponent(type), options)
  if (!resolved.ok) throw new Error(resolved.message)
  return resolved.structure
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

/** 자식 Fragment의 key. id를 문자열로 읽지 못하면 인덱스로 대신한다 — 모양 가드가 흡수할 자식이다. */
function childKey(child: unknown, index: number): string {
  const id = (child as { id?: unknown } | null | undefined)?.id
  return typeof id === 'string' ? id : `wb-invalid-${index}`
}

/**
 * 노드 하나를 그린다. **구조 구현체 본문에서 난 예외를 빼면 던지지 않는다** — 노드가
 * 잘못돼 있으면 그 자리에 폴백을 그린다. 던지면 React가 서브트리를 통째로
 * 버리는데, 에디터는 서버 검증 전에 낙관적 패치를 적용하므로(「정방향 흐름」) 일시적으로
 * 유효하지 않은 문서가 정상 상태다. 편집 중에 화면이 사라지면 안 된다.
 *
 * 폴백으로 흡수하는 것: 노드가 객체가 아니거나 `id`·`type`이 문자열이 아닌 경우,
 * `children`이 배열이 아니거나 그 원소가 노드가 아닌 경우, 알 수 없는 컴포넌트 타입,
 * props 검증 실패, 카탈로그에 없는 구조, 구현이 없는 구조.
 *
 * **흡수하지 않는 것: `registerStructure`로 등록된 구조 구현체 본문이 던지는 예외.**
 * 일부러 그렇게 뒀다 — 구조 구현체는 렌더러 밖에서 등록되는 임의의 함수이고, 여기서 감싸면
 * 그 안의 진짜 버그가 "폴백이 떴네"로 위장된다. 이 경로가 남아 있으므로 **캔버스는 이
 * 호출 위에 React Error Boundary를 두어야 한다.** "renderNode는 안 던진다"에만 기대면
 * 구조 구현체 하나의 버그가 캔버스 전체를 흰 화면으로 만든다.
 *
 * **테마 경로(`options.theme`)에서는 뷰 본문의 예외를 노드마다 둔 경계가 받아 그 자리에 폴백을 그린다**
 * (`view-host.tsx`) — 그 폴백은 React 가 뷰를 그릴 때 서므로 동기 `onNodeError` 에는 실리지 않는다.
 */
export function renderNode(node: WbNode, options: RenderOptions = {}): ReactElement {
  // 상호작용 타겟을 풀려면 **트리 전체**가 필요한데(다른 노드를 가리킨다) 이 진입점이 받는
  // 것은 노드 하나다. 그 노드를 뿌리로 삼는다 — 부분 트리를 그리는 호출자에게는 그 부분이
  // 곧 세계이고, 밖을 가리키는 타겟은 `사라진 노드`가 되어 `issues`로 말하는 경로로 간다.
  return renderNodeIn(node, node, options)
}

/**
 * 재귀 본체. `root`는 **상호작용 타겟을 푸는 세계**이고 재귀 내내 같다.
 *
 * 공개 API에 `root`를 노출하지 않는 이유: 호출자가 문서와 다른 뿌리를 줄 수 있게 되면
 * *"이 액션의 타겟이 무엇인가"*가 호출자마다 갈린다 — 「HTML 정적 번들」의 *"렌더러가 하나뿐이라
 * 결과가 어긋날 수 없다"*가 그 자리에서 깨진다.
 */
function renderNodeIn(root: WbNode, node: WbNode, options: RenderOptions): ReactElement {
  const raw = node as unknown as { id?: unknown; type?: unknown; children?: unknown } | null
  const nodeId = readString(raw?.id)

  // **숨긴 노드는 자식까지 함께 사라진다**(`setVisible { value: false }`). 자식을 그리기
  // **전에** 걸러야 하는 것이 요점이다: 뒤에 두면 보이지도 않는 서브트리의 폴백이
  // `onNodeError`로 보고되어, 화면에 없는 노드 때문에 배너가 뜬다.
  //
  // 감추지 않고 **DOM에서 빼는** 것은 `apps/web`이 뷰 모드에서 구조 트리를 빼는 것과 같은
  // 판단이다 — `display:none`으로 두면 테마가 그것을 덮어 되살릴 수 있어 *"숨겨졌다"*가
  // 아니게 된다(`structures/input.tsx`의 `SearchFormCollapsible`이 같은 근거를 적었다).
  if (nodeId !== '' && hiddenByOverlay(options.interaction?.overlay, nodeId)) return <></>

  const rawChildren = raw?.children

  // 자식을 먼저 그린다. 이 노드가 실패해도 자식은 폴백 안에 그대로 들어간다 —
  // 부모를 못 그리는 것과 자식을 못 그리는 것은 별개다.
  //
  // `children`이 배열이 아니면 자식 없음으로 다룬다(그냥 `.map`을 부르면 TypeError다).
  // 배열 원소가 노드가 아니면 재귀 호출의 모양 가드가 그 자리에 폴백을 그린다.
  const childNodes: unknown[] = Array.isArray(rawChildren) ? rawChildren : []
  const children: ReactNode =
    childNodes.length > 0
      ? childNodes.map((child, index) => (
          <Fragment key={childKey(child, index)}>
            {renderNodeIn(root, child as WbNode, options)}
          </Fragment>
        ))
      : null

  const type = readString(raw?.type)

  const fallback = (message: string): ReactElement => {
    options.onNodeError?.({ nodeId, type, message })
    return (
      <FallbackNode nodeId={nodeId} message={message}>
        {children}
      </FallbackNode>
    )
  }

  // 모양 가드. `node`가 null/undefined면 바로 아래 `node.props` 접근에서 TypeError가 난다.
  // id·type이 문자열이 아닌 경우는 아래 경로가 던지지는 않지만(카탈로그 조회가 그냥 빗나간다)
  // 여기서 흡수한다 — 무엇이 잘못됐는지를 `알 수 없는 컴포넌트 타입: undefined`보다
  // 정확히 말해 주기 때문이다.
  const shape = shapeError(node)
  if (shape !== null) return fallback(shape)

  const def = getComponent(type)
  if (!def) return fallback(`알 수 없는 컴포넌트 타입: ${type}`)

  // **겹layer가 문서의 props를 덮는다.** 겹layer에 이 노드가 없으면 `node.props`가
  // 그대로 돌아오므로 꺼진 렌더는 이 줄을 지나도 같은 값이다.
  //
  // **덮은 값도 검증을 지난다.** 통과하지 못하면 이 노드는 폴백이 되는데, 그 상태는
  // 겹layer에 닿기 전에 런타임의 판정이 먼저 걸러 낸다 — `checkNodeAction`이 같은 카탈로그
  // 스키마로 값을 보고 `invalid-interaction-prop`을 낸다. 즉 여기까지 오는 겹layer 값은
  // 이미 그 prop의 계약을 만족한다.
  const nodeProps = overlayProps(options.interaction?.overlay, nodeId, node.props)

  // 로케일을 넘기는 이유: 이 경로가 내는 메시지도 사용자가 그대로 읽는다.
  // 넘기지 않으면 서버 검증은 한국어, 렌더는 영문이 되어 같은 문제가 둘로 보인다.
  const parsed = def.props.safeParse(nodeProps ?? {}, { error: getKoreanErrorMap() })
  if (!parsed.success) {
    // 문안은 validate.ts의 `invalid-props` 이슈와 같아야 한다.
    // fallback.test.tsx가 두 문자열이 같은지 직접 비교해 갈라지는 것을 막는다.
    return fallback(
      `${node.type}의 props가 올바르지 않습니다: ${parsed.error.issues
        .map((issue) => `${issue.path.join('.')} ${issue.message}`)
        .join(', ')}`,
    )
  }

  if (options.theme !== undefined) {
    const fallbackView = DEFAULT_VIEWS[node.type]
    if (fallbackView === undefined) return fallback(`기본 뷰가 없는 컴포넌트: ${node.type}`)
    const props = parsed.data as Record<string, unknown>
    const variant = resolveVariant(def, node, props, options.theme.manifest)
    const states = activeStates(def, props)
    const attrs: Record<string, string> = { 'data-wb-id': node.id, 'data-wb-component': node.type }
    if (variant !== undefined) attrs['data-wb-variant'] = variant
    if (states.length > 0) attrs['data-wb-state'] = states.join(' ')
    const binding: Omit<NodeBinding, 'markRootRendered'> = {
      attrs: options.interaction === undefined ? attrs : { ...attrs, ...handlersFor(root, node, options) },
    }
    return (
      <ViewHost
        key={node.id}
        nodeId={node.id}
        view={options.theme.views[node.type] ?? fallbackView}
        fallbackView={fallbackView}
        binding={binding}
        viewProps={{ nodeId: node.id, type: node.type, props, states, variant, children, slot: options.slot ?? null }}
      />
    )
  }

  const resolved = resolveStructureOf(def, options)
  if (!resolved.ok) return fallback(resolved.message)

  const render = getStructure(node.type, resolved.structure)
  if (!render) return fallback(`구현되지 않은 구조: ${node.type}:${resolved.structure}`)

  const props = parsed.data as Record<string, unknown>
  const attrs = nodeAttrs(node, def, resolved.structure, props)

  return render({
    node,
    props,
    // **꺼져 있으면 `nodeAttrs`가 낸 객체 그대로 넘어간다** — 스프레드로 새 객체를 만들지도
    // 않는다(끈 렌더는 상호작용이 없는 렌더와 한 글자도 달라서는 안 된다).
    attrs: options.interaction === undefined ? attrs : { ...attrs, ...handlersFor(root, node, options) },
    part: partAttrs,
    children,
    slot: options.slot ?? null,
  })
}

/**
 * 트리거 4종 → DOM 이벤트.
 *
 * **`attrs`에 얹는 것이 요점이다.** 구조 구현체는 전부 `{...attrs}`를 자기 루트 태그에
 * 편다(전수 — `structures/*.tsx`). 그래서 여기 핸들러를 넣으면 **구조 구현체를 한
 * 글자도 안 고치고** 모든 컴포넌트가 상호작용을 받는다.
 *
 * **설계서 「컴파일」의 여섯 속성 계약을 넓히지 않는다.** 이것들은 `data-*` 속성이 아니라 React의
 * 이벤트 prop이라 DOM에 속성으로 나가지 않고, 테마의 셀렉터 어휘에 아무것도 더하지
 * 않는다(`test/contract-attrs.test.ts`가 세는 것도 `data-wb-*`다). **일곱째 데이터 속성이
 * 필요해지면 만들기 전에 멈추고 묻는다.**
 *
 * **`select`가 `onClick`인 것은 판정이다.** 와이어프레임 DOM에는 *"선택"*을 내는 네이티브
 * 이벤트원이 없다 — `Tabs`는 탭마다 `<span>`을 그리고(`structures/structure.tsx`) `List`도
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
      fire(root, node, dom, options)
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
 */
function fire(root: WbNode, node: WbNode, dom: keyof WbHandlers, options: RenderOptions): void {
  const onEvent = options.interaction?.onEvent
  let overlay = options.interaction?.overlay
  for (const trigger of TRIGGERS_OF[dom] ?? []) {
    const result = runInteraction(root, node.id, trigger, overlay)
    overlay = result.overlay
    // **아무 규칙도 없으면 알리지 않는다.** 노드마다 트리거가 하나뿐인 것이 보통이라
    // 그러지 않으면 빈 결과가 늘 하나씩 따라 나간다.
    if (result.matched === 0) continue
    onEvent?.({ ...result, nodeId: node.id, trigger })
  }
}

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
 * 문서 하나를 그린다. 보증은 `renderNode`와 같다 — 구조 구현체 본문의 예외를 빼면 던지지
 * 않는다.
 *
 * `?.`를 쓰는 이유: 타입상 `doc`도 `root`도 반드시 있지만, 런타임에는 문서가 아직 없거나
 * (로딩 중) 낙관적 패치가 `/root`를 지운 중간 상태가 들어올 수 있다. 어느 쪽이든
 * `renderNode`의 모양 가드가 루트 자리에 폴백을 그린다.
 */
export function renderDocument(doc: AnyDocument, options: RenderOptions = {}): ReactElement {
  const root = doc?.root as WbNode
  return renderNodeIn(root, root, options)
}
