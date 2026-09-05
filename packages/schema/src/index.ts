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
export type { ComponentGroup } from './component/group'
export { COMPONENT_GROUP_LABELS, COMPONENT_GROUPS, isComponentGroup } from './component/group'
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
  MISSING_NODE_NAME,
  describeInteraction,
  describeNode,
  describePageTarget,
  listInteractionSentences,
} from './interaction/describe'

// P9-3 T4 — `wireb page get`과 §12.2의 `get_page`가 낼 것을 값으로. **CLI는 글자만
// 만든다**(D4) — 무엇을 실을지는 이 함수가 정하고, `--json`이 그 값을 그대로 낸다.
export type {
  PageView,
  PageViewComment,
  PageViewCommentInput,
  PageViewInput,
  PageViewNode,
} from './page-view'
export { pageView } from './page-view'

// P9-3 T2 — §8.1의 타겟 조립. **`apps/api/src/services/page-target.ts`에서 올라왔다**
// (P9-1 이월 §2). `lint/input.ts`의 `LintPage.target`을 채우는 자리이고 CLI·MCP가 같은
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
  PAGE_DESCRIPTION_MAX_LENGTH,
  PAGE_JSON_FILE_SUFFIX,
  PageDescriptionSchema,
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
// P9-3 T5 — 결과 거르개. **`wireb lint [경로]`의 경로는 출력 거르개이지 입력 좁히개가
// 아니다**(D5): 프로젝트 단위 규칙이 여럿이라 입력을 좁히면 그것들이 거짓을 말한다.
// §12.2의 MCP `validate`가 같은 거르개를 원하므로 CLI에 두지 않는다.
export type { LintIssueFilter } from './lint/filter'
export { filterLintIssues } from './lint/filter'
// `VALIDATION_RULE`은 *"`validatePage`의 어느 코드가 §12.4의 어느 줄로 가는가"*다. 밖으로
// 내는 이유는 그것이 **판단**이고, `themes`의 대조 케이스가 자기 표와 함께 봐야 하기
// 때문이다 — 두 표를 함께 보는 자리는 `themes`뿐이다(의존 방향).
export { VALIDATION_RULE, lintDesign } from './lint/design'
