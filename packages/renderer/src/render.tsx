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
   * 같은 노드가 여러 번 보고될 수 있으니(React StrictMode의 이중 렌더 등) 받는 쪽은
   * nodeId 기준으로 중복을 걸러라.
   */
  onNodeError?: (error: NodeRenderError) => void
}

export interface NodeRenderError {
  nodeId: string
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

/**
 * 노드 하나를 그린다. **어떤 노드가 잘못돼 있어도 던지지 않는다** — 대신 그 자리에
 * 폴백을 그린다(P0 이월 6번). 던지면 React가 서브트리를 통째로 버리는데, P2b의 에디터는
 * 서버 검증 전에 낙관적 패치를 적용하므로(설계 §7.1) 일시적으로 유효하지 않은 문서가
 * 정상 상태다. 편집 중에 화면이 사라지면 안 된다.
 */
export function renderNode(node: WbNode, options: RenderOptions = {}): ReactElement {
  // 자식을 먼저 그린다. 이 노드가 실패해도 자식은 폴백 안에 그대로 들어간다 —
  // 부모를 못 그리는 것과 자식을 못 그리는 것은 별개다.
  const children: ReactNode =
    node.children && node.children.length > 0
      ? node.children.map((child) => (
          <Fragment key={child.id}>{renderNode(child, options)}</Fragment>
        ))
      : null

  const fallback = (message: string): ReactElement => {
    options.onNodeError?.({ nodeId: node.id, type: node.type, message })
    return (
      <FallbackNode nodeId={node.id} message={message}>
        {children}
      </FallbackNode>
    )
  }

  const def = getComponent(node.type)
  if (!def) return fallback(`알 수 없는 컴포넌트 타입: ${node.type}`)

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

export function renderDocument(doc: AnyDocument, options: RenderOptions = {}): ReactElement {
  return renderNode(doc.root, options)
}
