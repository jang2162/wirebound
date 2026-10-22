export const PACKAGE_NAME = '@wirebound/schema'

export type {
  AnyDocument,
  Interaction,
  InteractionAction,
  InteractionTrigger,
  LayoutDocument,
  NodeVisibility,
  PageDocument,
  ViewState,
  WbNode,
} from './node'
export {
  DEFAULT_VIEW_STATE,
  NODE_ALIAS_MAX,
  VIEW_STATE_DEPTH_MAX,
  VIEW_STATE_NAME_MAX,
  VIEW_STATES_MAX,
  WEIGHT_MAX,
  WEIGHT_MIN,
  createNodeId,
} from './node'

export { replaceDocumentOps } from './document-ops'
export { effectiveViewState, isVisibleIn, stateDescendants, stateLineage, viewStateOrder, visibleTree } from './visibility'
export { addViewStateOps, moveViewStateOps, removeViewStateOps, renameViewStateOps } from './view-state-ops'
export { guardViewStateOps } from './view-state-guard'

export type { NodeVisit } from './tree'
export { collectNodeIds, findNode, findNodePath, remapNodeIds, stripMarkers, walkNodes } from './tree'

export type { LockConflictInput, NodeLock, OpsLockConflictInput, SelectionConflictInput } from './lock'
export { findLockConflict, lockConflictOfOps, locksAgainst, selectionConflicts } from './lock'

export type { ComponentDef, EditorControl, EditorField } from './component/define'
export { defineComponent } from './component/define'
export type { ComponentGroup } from './component/group'
export { COMPONENT_GROUP_LABELS, COMPONENT_GROUPS, isComponentGroup } from './component/group'
export { getComponent, listComponents, registerComponent, requireComponent, resetRegistry } from './component/registry'

export { CATALOG_TYPES, installCatalog } from './component/catalog/index'
export * from './component/catalog/index'

export type { ModuleNodes } from './module/save'
export { MODULE_NAME_MAX, countModuleNodes, moduleNodesForSave } from './module/save'

export type { IssueSeverity, ValidationCode, ValidationIssue } from './validate'
export { ISSUE_SEVERITY, partitionIssues } from './validate'
export {
  assertValidLayout,
  assertValidPage,
  checkViewStateRemoval,
  unknownVisibilityStates,
  excuseStandingNestedPages,
  nestedPagesUnderRoot,
  validateLayout,
  validatePage,
} from './validate'

export {
  DocumentEnvelopeSchema,
  InteractionSchema,
  NODE_ID_PATTERN,
  PageEnvelopeSchema,
  ViewStatesSchema,
  VisibilitySchema,
  WbNodeSchema,
} from './envelope'

// 설계서 「설계서 화면 구조」의 클립보드 — 노드 봉투 읽기 · 쓰기 · 붙일 노드 짓기. 편집 묶음의 연산 수 상한도 여기 산다
// (서버 `OpsBody` 와 화면이 같은 값을 읽는다).
export {
  MAX_OPS_PER_EDIT,
  NODES_ENVELOPE_KIND,
  prepareNodesForPaste,
  inspectNodesEnvelope,
  readNodesEnvelope,
  type NodesEnvelopeRead,
  writeNodesEnvelope,
} from './clipboard'
export type { DroppedStates } from './clipboard'

export type { ActionProblem, InteractionIssueCode, NodeTargetAction, PageTargetAction } from './interaction/check'
export { checkNodeAction, checkPageAction, isPageTargetAction } from './interaction/check'

export type { ComponentNoun, InteractionSentence, NamingContext } from './interaction/describe'
export {
  COMPONENT_NOUNS,
  MISSING_NODE_NAME,
  describeInteraction,
  describeNode,
  describePageTarget,
  listInteractionSentences,
  namingContexts,
  nodeDisplayName,
} from './interaction/describe'
export { UNKNOWN_VIEW_STATE_NAME, aliasNote, viewStateName, nodeAlias, nodeHeading, nodeRowLabel, nodeSummary } from './display'
export { hasRejectedAliasChar, isBlankAlias, tidyAlias } from './alias'
export { SUMMARY_LIST_MAX, SUMMARY_TEXT_MAX } from './component/summary'

// `wireb page get`과 설계서 「MCP 도구」의 `get_page`가 낼 것을 값으로. **CLI는 글자만
// 만든다** — 무엇을 실을지는 이 함수가 정하고, `--json`이 그 값을 그대로 낸다.
export type { PageView, PageViewComment, PageViewCommentInput, PageViewInput, PageViewNode } from './page-view'
export { pageView } from './page-view'

// 설계서 「모델」(상호작용)의 타겟 조립. **순수 함수라 여기 산다** — `apps/api`에 두면 순수 패키지가
// 못 본다. `lint/input.ts`의 `LintPage.target`을 채우는 자리이고 CLI·MCP가 같은
// 문자열을 만들어야 한다 — 두 벌이 갈리면 lint가 멀쩡한 링크를 끊겼다고 말한다.
export type { PageTargetInput, TargetMenuNode, TargetPage, TargetedPage } from './page-target'
export {
  PAGE_TARGET_PREFIX,
  duplicateTargets,
  matchPageTargets,
  pageBundleTitle,
  pageTarget,
  pageTargetPath,
  targetedPages,
} from './page-target'

export { getKoreanErrorMap } from './locale'

export type { PatchOp } from './patch/types'
export { PatchError } from './patch/types'
export { formatPointer, getByPointer, parsePointer } from './patch/pointer'
export { applyOp, applyOps } from './patch/apply'
export { invertOps } from './patch/inverse'

export type { Migration } from './migrate'
export { CURRENT_DOCUMENT_VERSION, MIGRATIONS, migrateDocument, migratePageDocument } from './migrate'
export type { LiftResult } from './migrate-document'
export { MigrationError, liftStateRegions } from './migrate-document'

export type { PageJson, PageJsonComment, PageJsonFailure, PageJsonIssue, PageJsonPage, PageJsonResult } from './page-json/envelope'
export {
  COMMENT_BODY_MAX_LENGTH,
  COMMENT_BODY_MIN_LENGTH,
  PAGE_DESCRIPTION_MAX_LENGTH,
  PAGE_JSON_FILE_SUFFIX,
  PageDescriptionSchema,
  PageJsonSchema,
  WIREBOUND_PAGE_VERSION,
  pageJsonFileName,
  pageJsonText,
  parsePageJson,
  readPageJson,
  samePageMeta,
  toPageJson,
} from './page-json/envelope'

export type { PageImportGate, PageImportPlan } from './page-json/import'
export { gatePageImport, planPageImport } from './page-json/import'

// 설계서 「lint 규칙」. **표는 그 절의 줄 전부를 들지만 구현은 소유자를 따른다**:
// 설계서 규칙은 여기, 테마 규칙은 `@wirebound/themes`. 합치는 자리는 그쪽이다.
export type { LintRule, LintRuleGroup, LintRuleId, LintRuleOwner, LintSeverity, OwnSeverityRuleId, RelayRuleId } from './lint/rules'
export { LINT_RULES, lintRule } from './lint/rules'
export type { LintIssue, LintWhere } from './lint/issue'
export { lintIssue, relayLintIssue } from './lint/issue'
export type { LintComment, LintConfig, LintMenuNode, LintPage, LintProject } from './lint/input'
// 결과 거르개. **`wireb lint [경로]`의 경로는 출력 거르개이지 입력 좁히개가
// 아니다**: 프로젝트 단위 규칙이 여럿이라 입력을 좁히면 그것들이 거짓을 말한다.
// 「MCP 도구」의 `validate`가 같은 거르개를 원하므로 CLI에 두지 않는다.
export type { LintIssueFilter } from './lint/filter'
export { filterLintIssues } from './lint/filter'
// `VALIDATION_RULE`은 *"`validatePage`의 어느 코드가 「lint 규칙」의 어느 줄로 가는가"*다. 밖으로
// 내는 이유는 그것이 **판단**이고, `themes`의 대조 케이스가 자기 표와 함께 봐야 하기
// 때문이다 — 두 표를 함께 보는 자리는 `themes`뿐이다(의존 방향).
export { VALIDATION_RULE, lintDesign } from './lint/design'
