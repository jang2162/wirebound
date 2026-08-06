import {
  defaultStructure,
  getComponent,
  getKoreanErrorMap,
  requireComponent,
  type AnyDocument,
  type ComponentDef,
  type WbNode,
} from '@wirebound/schema'
import { Fragment, type ReactElement, type ReactNode } from 'react'
import { nodeAttrs, partAttrs } from './attrs'
import { FallbackNode } from './fallback'
import { getStructure } from './structures/registry'

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
}

export interface NodeRenderError {
  /** 폴백이 그려진 노드의 id. 노드에서 문자열 id를 읽지 못했으면 빈 문자열이다. */
  nodeId: string
  /** 노드의 type. 문자열로 읽지 못했으면 빈 문자열이다. */
  type: string
  /** 한국어 메시지. 사용자에게 그대로 보여도 된다. */
  message: string
}

type StructureResolution = { ok: true; structure: string } | { ok: false; message: string }

/**
 * 구조 이름 결정의 실제 본체. 던지는 대신 결과를 돌려준다.
 *
 * `resolveStructure`를 try/catch로 감싸지 않는 이유: catch는 이 함수가 의도한 실패만이
 * 아니라 그 안에서 난 모든 예외를 똑같이 폴백으로 삼켜, 진짜 버그를 "구조를 못 찾았다"로
 * 위장한다.
 */
function resolveStructureOf(def: ComponentDef, options: RenderOptions): StructureResolution {
  const requested = options.structures?.[def.type]
  if (requested === undefined) return { ok: true, structure: defaultStructure(def) }
  if (!def.structures.includes(requested)) {
    return { ok: false, message: `${def.type}에 없는 구조입니다: ${requested}` }
  }
  return { ok: true, structure: requested }
}

/**
 * 던지는 공개 API. `renderNode`는 이제 이것을 쓰지 않고 폴백으로 흡수하지만,
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
 * 지나간 것이라(설계 §7.1) 일시적으로 타입을 만족하지 않을 수 있다. 컴파일러가 막아 주는
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
 * 잘못돼 있으면 그 자리에 폴백을 그린다(P0 이월 6번). 던지면 React가 서브트리를 통째로
 * 버리는데, P2b의 에디터는 서버 검증 전에 낙관적 패치를 적용하므로(설계 §7.1) 일시적으로
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
 */
export function renderNode(node: WbNode, options: RenderOptions = {}): ReactElement {
  const raw = node as unknown as { id?: unknown; type?: unknown; children?: unknown } | null
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
          <Fragment key={childKey(child, index)}>{renderNode(child as WbNode, options)}</Fragment>
        ))
      : null

  const nodeId = readString(raw?.id)
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

  // 로케일을 넘기는 이유: 이 경로가 내는 메시지도 사용자가 그대로 읽는다.
  // 넘기지 않으면 서버 검증은 한국어, 렌더는 영문이 되어 같은 문제가 둘로 보인다.
  const parsed = def.props.safeParse(node.props ?? {}, { error: getKoreanErrorMap() })
  if (!parsed.success) {
    // 문안은 validate.ts의 `invalid-props` 이슈와 같아야 한다.
    // fallback.test.tsx가 두 문자열이 같은지 직접 비교해 갈라지는 것을 막는다.
    return fallback(
      `${node.type}의 props가 올바르지 않습니다: ${parsed.error.issues
        .map((issue) => `${issue.path.join('.')} ${issue.message}`)
        .join(', ')}`,
    )
  }

  const resolved = resolveStructureOf(def, options)
  if (!resolved.ok) return fallback(resolved.message)

  const render = getStructure(node.type, resolved.structure)
  if (!render) return fallback(`구현되지 않은 구조: ${node.type}:${resolved.structure}`)

  const props = parsed.data as Record<string, unknown>

  return render({
    node,
    props,
    attrs: nodeAttrs(node, def, resolved.structure, props),
    part: partAttrs,
    children,
    slot: options.slot ?? null,
  })
}

/**
 * 문서 하나를 그린다. 보증은 `renderNode`와 같다 — 구조 구현체 본문의 예외를 빼면 던지지
 * 않는다.
 *
 * `?.`를 쓰는 이유: 타입상 `doc`도 `root`도 반드시 있지만, 런타임에는 문서가 아직 없거나
 * (로딩 중) 낙관적 패치가 `/root`를 지운 중간 상태가 들어올 수 있다. 어느 쪽이든
 * `renderNode`의 모양 가드가 루트 자리에 폴백을 그린다.
 */
export function renderDocument(doc: AnyDocument, options: RenderOptions = {}): ReactElement {
  return renderNode(doc?.root as WbNode, options)
}
