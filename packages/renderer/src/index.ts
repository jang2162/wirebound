export type { WbAttrs } from './attrs'
export { activeStates, nodeAttrs, partAttrs } from './attrs'

export type { StructureContext, StructureRenderer } from './structures/registry'
export {
  getStructure,
  listStructureKeys,
  registerStructure,
  requireStructure,
  resetStructures,
} from './structures/registry'

export { FallbackNode } from './fallback'

// `TREE_INDENT_VAR`는 **테마가 값을 넣는 손잡이의 이름**이다(P4b-1의 `treeIndent` 어휘).
// `themes`는 이 패키지를 볼 수 없으므로(§3.3) 두 문자열이 같은지는 `apps/web`이 대조한다 —
// 그 케이스가 이 export를 쓴다.
export { NODE_VAR_PREFIX, TREE_INDENT_VAR, nodeVar, structureBaseCss } from './structure-css'

export type { NodeRenderError, RenderOptions } from './render'
export { renderDocument, renderNode, resolveStructure } from './render'

export { installStructures } from './structures/index'

export { renderComposed } from './compose'
