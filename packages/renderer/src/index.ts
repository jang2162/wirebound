export type { WbAttrs, WbHandlers } from './attrs'
export { activeStates, nodeAttrs, partAttrs } from './attrs'

// **상호작용 런타임**(설계서 「상호작용」의 「실행」). `RenderOptions.interaction`으로 켜고, 상태는 호출자가
// 든다 — 근거는 `interaction/runtime.ts`의 머리말에 있다.
export type {
  InteractionIssue,
  InteractionOverlay,
  InteractionRequest,
  InteractionResult,
} from './interaction/runtime'
export {
  EMPTY_OVERLAY,
  hiddenByOverlay,
  overlayProps,
  runInteraction,
  VISIBLE_KEY,
} from './interaction/runtime'

export type { StructureContext, StructureRenderer } from './structures/registry'
export {
  getStructure,
  listStructureKeys,
  registerStructure,
  requireStructure,
  resetStructures,
} from './structures/registry'

export { FallbackNode } from './fallback'

// `TREE_INDENT_VAR`는 **테마가 값을 넣는 손잡이의 이름**이다(`themes`의 `treeIndent` 어휘).
// `themes`는 이 패키지를 볼 수 없으므로(설계서 「각 패키지의 책임과 의존」) 두 문자열이 같은지는 `apps/web`이 대조한다 —
// 그 케이스가 이 export를 쓴다.
export { NODE_VAR_PREFIX, TREE_INDENT_VAR, nodeVar, structureBaseCss } from './structure-css'

export type {
  InteractionEvent,
  InteractionOptions,
  NodeRenderError,
  RenderOptions,
} from './render'
export { renderDocument, renderNode, resolveStructure } from './render'

export { installStructures } from './structures/index'

export { renderComposed } from './compose'
