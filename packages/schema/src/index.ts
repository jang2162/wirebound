export const PACKAGE_NAME = '@wirebound/schema'

export type {
  Interaction,
  InteractionAction,
  InteractionTrigger,
  LayoutDocument,
  PageDocument,
  WbNode,
} from './node'
export { createNodeId } from './node'

export type { NodeVisit } from './tree'
export { collectNodeIds, findNode, findNodePath, remapNodeIds, walkNodes } from './tree'

export type { ComponentDef, EditorControl, EditorField } from './component/define'
export { defineComponent } from './component/define'
export {
  defaultStructure,
  getComponent,
  listComponents,
  registerComponent,
  requireComponent,
  resetRegistry,
} from './component/registry'

export { CATALOG_TYPES, installCatalog } from './component/catalog/index'
export * from './component/catalog/index'

export type { ValidationCode, ValidationIssue } from './validate'
export { assertValidPage, validateLayout, validatePage } from './validate'

export type { PatchOp } from './patch/types'
export { PatchError } from './patch/types'
export { formatPointer, getByPointer, parsePointer } from './patch/pointer'
export { applyOp, applyOps } from './patch/apply'
export { invertOps } from './patch/inverse'
