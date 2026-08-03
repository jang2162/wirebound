import {
  defaultStructure,
  requireComponent,
  type AnyDocument,
  type WbNode,
} from '@wirebound/schema'
import { Fragment, type ReactElement, type ReactNode } from 'react'
import { nodeAttrs, partAttrs } from './attrs'
import { requireStructure } from './structures/registry'

export interface RenderOptions {
  /** 컴포넌트 타입 → 구조 이름. 테마가 제공한다. 없으면 카탈로그의 첫 구조를 쓴다. */
  structures?: Record<string, string>
  /** Slot 자리에 넣을 내용. compose가 채운다. */
  slot?: ReactNode
}

export function resolveStructure(type: string, options: RenderOptions): string {
  const def = requireComponent(type)
  const requested = options.structures?.[type]
  if (requested === undefined) return defaultStructure(def)
  if (!def.structures.includes(requested)) {
    throw new Error(`${type}에 없는 구조입니다: ${requested}`)
  }
  return requested
}

export function renderNode(node: WbNode, options: RenderOptions = {}): ReactElement {
  const def = requireComponent(node.type)
  const structure = resolveStructure(node.type, options)
  const render = requireStructure(node.type, structure)

  const props = def.props.parse(node.props ?? {}) as Record<string, unknown>

  const children: ReactNode =
    node.children && node.children.length > 0
      ? node.children.map((child) => (
          <Fragment key={child.id}>{renderNode(child, options)}</Fragment>
        ))
      : null

  return render({
    node,
    props,
    attrs: nodeAttrs(node, def, structure, props),
    part: partAttrs,
    children,
    slot: options.slot ?? null,
  })
}

export function renderDocument(doc: AnyDocument, options: RenderOptions = {}): ReactElement {
  return renderNode(doc.root, options)
}
