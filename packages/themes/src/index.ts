export const PACKAGE_NAME = '@wirebound/themes'

// 패턴 검증 · 전개가 내는 이슈. 코드 유니온과 severity 표는 `issue.ts`가 갖는다.
export type { ThemeIssue, ThemeIssueCode } from './issue'

export type { PatternNode, SlotType, ThemePattern } from './spec/patterns'
export {
  PATTERN_CATEGORIES,
  PatternNodeSchema,
  PatternSchema,
  PatternsSchema,
  SLOT_TYPES,
  checkPatterns,
} from './spec/patterns'

// 패턴 전개(설계서 「patterns — 테마가 소유한 구성 레시피」). 부르는 곳은 `apps/web`이다.
// **`apps/web`이 아니라 여기 두는 것은** 패턴 삽입이 에이전트가 할 일이기도 해서다
// (설계서 「LLM 연계 (P9)」) — CLI·MCP가 부르려면 패키지에 있어야 한다.
export type { ExpandedPattern } from './pattern/expand'
export { expandPattern } from './pattern/expand'

// 설계서 「lint 규칙」의 lint. 규칙은 `schema`가 구현하고 CLI·MCP가 이 이름을 부른다(`lint/index.ts`의 머리말).
export type { ProjectLintInput } from './lint/index'
export { lintProject } from './lint/index'

// 스냅샷 payload 규격과 lint 입력 변환. **패키지에 두는 이유:** api·CLI(`wireb pull`·
// `wireb lint`)·MCP가 같은 모양을 읽는다 — 패키지에 없으면 셋이 모양을 각자 선언한다.
export type {
  SnapshotComment,
  SnapshotLayout,
  SnapshotMenuNode,
  SnapshotPage,
  SnapshotPayload,
} from './snapshot/payload'
export { SNAPSHOT_PAYLOAD_VERSION, SNAPSHOT_RESOURCES, SnapshotPayloadSchema } from './snapshot/payload'
export type { SnapshotLintNote, SnapshotLintNoteKind, SnapshotLintPlan } from './snapshot/lint-input'
export { snapshotToLintInput } from './snapshot/lint-input'

// 테마 manifest 규격과 검증(spec `2026-09-27-code-themes-design.md` 「manifest」). 빌드(`wb-theme build`) · 업로드 · 호스트가
// 같은 함수를 부른다 — 셋이 각자 검증하면 빌드를 지난 파일이 업로드에서 거부된다.
export type { ManifestIssue, ManifestIssueCode } from './manifest/schema'
export { ManifestSchema, validateManifest } from './manifest/schema'
export { compareVersions, SDK_RANGE_PATTERN, satisfiesSdk, VERSION_PATTERN } from './manifest/semver'

// `.wbtheme` 읽기 · 쓰기(spec 「`.wbtheme` 파일」 · 「업로드 검증」). 빌드가 쓰고, 업로드 · 시딩 · 호스트가 같은 읽기로 검증한다.
export type { WbthemeFiles, WbthemeIssue, WbthemeIssueCode } from './wbtheme/read'
export { readWbtheme, WBTHEME_LIMITS } from './wbtheme/read'
export { packWbtheme } from './wbtheme/pack'
