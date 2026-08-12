export const PACKAGE_NAME = '@wirebound/schema'

export type {
  AnyDocument,
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

export type { IssueSeverity, ValidationCode, ValidationIssue } from './validate'
export { ISSUE_SEVERITY, ignoredVariantMessage, partitionIssues } from './validate'
export { assertValidLayout, assertValidPage, validateLayout, validatePage } from './validate'

export { DocumentEnvelopeSchema, InteractionSchema, NODE_ID_PATTERN, WbNodeSchema } from './envelope'

export type {
  ActionProblem,
  InteractionIssueCode,
  NodeTargetAction,
  PageTargetAction,
} from './interaction/check'
export { checkNodeAction, checkPageAction, isPageTargetAction } from './interaction/check'

export type { ComponentNoun, InteractionSentence } from './interaction/describe'
export {
  COMPONENT_NOUNS,
  describeInteraction,
  describeNode,
  describePageTarget,
  listInteractionSentences,
} from './interaction/describe'

export { getKoreanErrorMap } from './locale'

export type { PatchOp } from './patch/types'
export { PatchError } from './patch/types'
export { formatPointer, getByPointer, parsePointer } from './patch/pointer'
export { applyOp, applyOps } from './patch/apply'
export { invertOps } from './patch/inverse'

export type { Migration } from './migrate'
export { CURRENT_DOCUMENT_VERSION, MIGRATIONS, migrateDocument } from './migrate'
