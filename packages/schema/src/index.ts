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

export type { LockConflictInput, NodeLock } from './lock'
export { findLockConflict, lockPointers, locksAgainst } from './lock'

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

export type { PagePreset } from './preset/builtin'
export { BUILTIN_PRESETS, stripMarkers } from './preset/builtin'

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

export type {
  PageJson,
  PageJsonComment,
  PageJsonFailure,
  PageJsonIssue,
  PageJsonPage,
  PageJsonResult,
} from './page-json/envelope'
export {
  COMMENT_BODY_MAX_LENGTH,
  COMMENT_BODY_MIN_LENGTH,
  PAGE_JSON_FILE_SUFFIX,
  PageJsonSchema,
  WIREBOUND_PAGE_VERSION,
  pageJsonFileName,
  pageJsonText,
  parsePageJson,
  readPageJson,
  toPageJson,
} from './page-json/envelope'

export type { PageImportGate, PageImportPlan } from './page-json/import'
export { gatePageImport, planPageImport } from './page-json/import'

// P9-1 — §12.4의 lint 규칙. **표는 열셋 전부를 들지만 구현은 소유자를 따른다**(D2):
// 설계서 규칙은 여기, 테마 규칙은 `@wirebound/themes`. 합치는 자리는 그쪽이다.
export type { LintRule, LintRuleGroup, LintRuleId, LintRuleOwner, OwnSeverityRuleId, RelayRuleId } from './lint/rules'
export { LINT_RULES, lintRule } from './lint/rules'
export type { LintIssue, LintWhere } from './lint/issue'
export { lintIssue, relayLintIssue } from './lint/issue'
export type { LintComment, LintConfig, LintMenuNode, LintPage, LintProject } from './lint/input'
// `VALIDATION_RULE`은 *"`validatePage`의 어느 코드가 §12.4의 어느 줄로 가는가"*다. 밖으로
// 내는 이유는 그것이 **판단**이고, `themes`의 대조 케이스가 자기 표와 함께 봐야 하기
// 때문이다 — 두 표를 함께 보는 자리는 `themes`뿐이다(의존 방향).
export { VALIDATION_RULE, lintDesign } from './lint/design'
