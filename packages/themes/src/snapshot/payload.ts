/**
 * 스냅샷 payload의 규격(설계서 「스냅샷」). **`packages/themes`가 소유한다.**
 *
 * payload는 `PageDocument`(`@wirebound/schema`)를 참조한다. 이 모양을
 * 읽는 것이 api만이 아니다 — CLI(`wireb pull`, 그리고 `GET .../snapshot`의 응답을 lint
 * 입력으로 바꾸는 `wireb lint`)와 MCP도 읽는다. 패키지에 없으면 CLI와 MCP가 이 모양을
 * **각자 다시 선언한다.**
 *
 * | 후보 | 왜 아닌가 / 왜인가 |
 * |---|---|
 * | `packages/schema` | 스냅샷은 문서 하나가 아니라 프로젝트 전체(메뉴 · 페이지 · 코멘트 · 테마 바인딩 · 공통코드)의 기록이다 — `schema` 는 노드 · 문서 규격만 든다 |
 * | **`packages/themes`** | **골랐다.** `themes → schema`가 이미 의존 방향이라 payload가 나르는 것을 다 볼 수 있다. **`lintProject`가 여기 사는 것과 같은 근거다** |
 * | `apps/api` | CLI·MCP가 못 본다 |
 *
 * **대가:** `themes`가 페이지·메뉴·코멘트라는 이름을 알게 된다. `lintProject`가 이미
 * `LintProject`(메뉴·페이지·코멘트)를 받고 있으므로 그 선은 이미 넘었다. 규격은
 * `snapshot/` 아래에 따로 둔다 — 테마 어휘(`spec/`)와 섞지 않는다.
 *
 * ---
 *
 * # `payloadVersion`은 `PageDocument.version`과 다른 축이다
 *
 * payload **형식**이 바뀌는 것과 **컴포넌트 props**가 바뀌는 것은 서로 독립이다. 페이지
 * 문서에 마이그레이션이 하나 붙어도 payload의 모양은 그대로일 수 있고, 반대로 payload에
 * 자원이 하나 더 실려도 문서 스키마는 그대로다.
 *
 * - 모르는 `payloadVersion`(현재 값보다 큰 것)을 **복원**하려 하면 복원이 거부한다
 *   (`apps/api`의 `services/restore.ts`).
 * - **조회는 막지 않는다.** 태그는 지워지지 않는 기록이므로(「스냅샷」) 읽기까지 막으면 기록
 *   자체가 사라진 것과 같다.
 * - **이 규격은 값을 싣기만 하고 거부하지 않는다.** 게이트는 복원이 든다.
 *
 * 그래서 아래 `payloadVersion` 필드가 **`z.literal(SNAPSHOT_PAYLOAD_VERSION)`이 아니라
 * `z.int().positive()`다.** 리터럴로 박으면 이 규격으로 **읽는** 쪽이 미래 payload를
 * 파싱조차 못 하게 되는데, 그것이 바로 위 두 번째 줄이 금지하는 일이다. 무엇을 거부할지는
 * **읽는 쪽이** 값을 보고 판정한다.
 *
 * ---
 *
 * # 저장된 문서를 그대로 담는다 — 마이그레이션하지 않는다
 *
 * 각 페이지의 `schema`·`schemaVersion`을 **DB에 있는 값 그대로** 싣는다. 캡처에서
 * `migrateDocument`를 돌리면 설계서 「스키마 마이그레이션」이 적어 둔 그 상태(저장된 문서의 버전이
 * `CURRENT_DOCUMENT_VERSION`보다 큰 페이지)가 **하나만 있어도 프로젝트 전체 캡처가
 * 실패한다** — 캡처는 읽기 연산이고, 읽기가 실패하면 사용자는 **얼릴 수단 자체를 잃는다.**
 *
 * **실측**: `pages.schema_version`을 999로 심고 `findPageById`로 읽으면 그대로
 * 999가 나오고(repo는 마이그레이션을 모른다), 같은 페이지를 `GET .../pages/:pageId`로
 * 읽으면 **400 `지원하지 않는 문서 버전: 999`**다. 즉 마이그레이션을 하는 것은 라우트이지
 * repo가 아니고, 캡처가 repo를 지나는 한 그 실패는 캡처에 옮겨붙지 않는다.
 *
 * **그런데 아래 스키마는 `PageEnvelopeSchema`로 문서를 검사한다 — 모순이 아니다.**
 * 그 스키마는 버전 값을 양의 정수로만 보고 **그 *의미*를 보지 않는다**(판 7 ~ 지금 판에서 `layout` 을 묻는 것뿐이다). 999도 통과한다. 막히는 것은 봉투 자체가 깨진 문서뿐이고, 그런
 * 문서는 쓰기 경로가 이미 거부하므로 DB에 없다. 즉 이 절이 피하려는 실패(버전 때문에 캡처
 * 전체가 죽는 것)는 일어나지 않으면서, payload가 무엇을 담는지는 규격에 남는다.
 *
 * ---
 *
 * # 테마는 참조로 얼린다 — 판 3
 *
 * 테마는 코드 패키지이고 지우지 않는다(spec `docs/superpowers/specs/2026-09-27-code-themes-design.md` 「스냅샷」). 그래서 테마 내용
 * 대신 프로젝트의 바인딩 `{ themeId, version, tokens }` 를 싣는다(`theme`). 캡처 때 바인딩이 비어 있었으면 `null` 이다(테마는 프로젝트당
 * 하나다).
 *
 * **판 2 payload 에는 `theme` 가 없다** — 그래서 규격에서 선택이다. 판 2 를 복원하면 바인딩을 건드리지 않는다(`apps/api`의
 * `services/restore-plan.ts`). 판 1 에는 `themes`(레이아웃마다 병합된 옛 JSON 테마)와 `layouts[].themeId` 가 있었다 — 저장된 판 1 은
 * 마이그레이션(`apps/api`의 `0018-drop-json-themes.ts`)이 판 2 로 고친다. 판 3 을 이 판보다 앞선 `wireb` 는 못 읽는다(`z.strictObject`) —
 * 저장소 안의 소비자는 같이 바뀐다.
 *
 * ---
 *
 * # 공통코드 표 — 판 4
 *
 * 프로젝트의 공통코드 표를 통째로 싣는다(`codes` — 그룹 · 항목 차례대로). 페이지의 노드가 «그룹 키 · 코드값»으로 표를 가리키므로, 페이지를
 * 되돌리면서 표를 지금 것으로 두면 되돌린 페이지의 참조가 엇갈린다 — 판 4 의 복원은 표를 그 판으로 덮는다(`apps/api`의
 * `services/restore.ts`). **판 3 이하에는 키가 없고 그 복원은 표를 건드리지 않는다.** 판 4 를 이 판보다 앞선 `wireb` 는 못 읽는다.
 *
 * ---
 *
 * # 레이아웃 표를 담지 않는다 — 판 5
 *
 * 판 4 이하 payload 에는 프로젝트의 레이아웃 문서 목록(`layouts` — `Page > Slot`)이 있었다. 페이지 레이아웃은 문서의 필드(`schema.layout`)로
 * 옮겼고 레이아웃 표는 없다 — 판 5 에는 키가 없다. 저장된 판 4 이하는 마이그레이션(`apps/api`의 `0038-drop-layouts.ts`)이 판 5 로 고친다.
 * 판 5 를 이 판보다 앞선 `wireb` 는 못 읽는다(그쪽 규격이 `layouts` 를 묻는다).
 *
 * **판 4 이하 payload 의 `layouts` 는 받고 걷는다**(아래 `dropRetiredLayouts`) — 이 판의 `wireb` 가 옛 서버의 덤프(`GET …/snapshot`)를
 * 읽어야 한다. 앞 판까지는 규격이 키를 더하기만 해 새 CLI 가 옛 덤프를 읽었고, 키를 걷은 이 판에서 그 방향을 지키는 자리가 이것이다.
 * 걷은 값은 보지 않는다(레이아웃 문서를 읽는 소비자가 없다). **판 5 이상의 `layouts` 는 모르는 키다** — 아래 strict 가 그대로 죽인다.
 *
 * ---
 *
 * # 겹layer(런타임 상태)를 담지 않는다
 *
 * payload 가 담는 것은 메뉴·페이지·코멘트와 테마 바인딩 · 공통코드 표이고 그 밖은 없다. 겹layer를
 * 넣으면 *"버튼을 눌러 둔 상태"*가 복원되어 **문서에 없는 것이 문서에서 온 것처럼 보인다.**
 * 아래 `SnapshotPayloadSchema`가 `z.strictObject`인 것이 그 규칙을 실행으로 지키는 자리다 —
 * 선언되지 않은 절이 payload에 실리면 그 자리에서 파싱이 죽는다.
 */
import { z } from 'zod'
import { CodeTableSchema, PageEnvelopeSchema, type CodeTable, type PageDocument } from '@wirebound/schema'

/**
 * 이 코드가 만드는 payload의 형식 버전. **올리는 것은 payload의 모양이 바뀔 때뿐이다** —
 * 자원이 늘거나, 필드의 뜻이 바뀌거나, 절이 사라질 때. 값이 늘어나는 것(예: 페이지가 하나
 * 더 생기는 것)은 형식 변경이 아니다.
 */
export const SNAPSHOT_PAYLOAD_VERSION = 5

/** 메뉴 트리 노드 하나. 트리로 접지 않고 **평평하게** 담는다 — `parentId`가 구조를 나른다. */
export interface SnapshotMenuNode {
  id: string
  parentId: string | null
  title: string
  sortOrder: number
}

/**
 * 페이지 하나. `schema`·`schemaVersion`은 **DB에 있는 값 그대로**다(위 「저장된 문서를 그대로 담는다」 절).
 *
 * **`headSeq`를 함께 싣는 것이 「스냅샷」의 요구다** — *"각 페이지의 `head_seq`를 함께
 * 기록한다."* 복원이 그 값으로 *"이 문서가 어느 편집 시점의 것인가"*를 안다.
 */
export interface SnapshotPage {
  id: string
  menuNodeId: string
  title: string
  description: string | null
  sortOrder: number
  schemaVersion: number
  schema: PageDocument
  headSeq: number
}

/** 코멘트 하나. `authorName`은 **그 시점의 이름**이다 — 스냅샷은 그때의 사실을 보여야 한다. */
export interface SnapshotComment {
  id: string
  pageId: string
  nodeId: string
  body: string
  authorId: string
  authorName: string
  createdAt: string
  updatedAt: string
}

/** 프로젝트의 테마 바인딩(판 3). 토큰은 기본값과 다른 값만이다(`projects.theme_tokens` 그대로). */
export interface SnapshotTheme {
  themeId: string
  version: string
  tokens: Record<string, string | number>
}

export interface SnapshotPayload {
  payloadVersion: number
  /**
   * 캡처 시각(ISO 8601) — **Postgres의 `clock_timestamp()`이고 Node의 시계가 아니다.**
   *
   * 뜻은 *"캡처가 payload의 내용을 그대로임을 마지막으로 확인한 순간"*이다(수집 **후**
   * 지문을 읽은 그 문장에서 함께 읽는다 — `services/snapshot-capture.ts`).
   *
   * **`snapshots.created_at`과 같은 값이다** — `insertSnapshot`이 이 값을 그 컬럼에 심는다.
   * 둘을 따로 재면 시점도 시계도 갈린다 — 근거는 `apps/api`의 `repos/snapshots.ts`의
   * `insertSnapshot` 머리말에 있다.
   *
   * **복원이 *"그때"*로 읽어야 하는 값이 이것이다.**
   */
  capturedAt: string
  menu: SnapshotMenuNode[]
  pages: SnapshotPage[]
  comments: SnapshotComment[]
  /** 판 3 부터. 판 2 이하에는 키가 없다. 캡처 때 바인딩이 비어 있었으면 `null`. */
  theme?: SnapshotTheme | null
  /** 판 4 부터 — 공통코드 표(그룹 · 항목 차례대로). 판 3 이하에는 키가 없다(아래 「공통코드 표 — 판 4」 절). */
  codes?: CodeTable
}

const MenuNodeSchema = z.strictObject({
  id: z.uuid(),
  parentId: z.uuid().nullable(),
  title: z.string(),
  sortOrder: z.int(),
})

const PageSchema = z.strictObject({
  id: z.uuid(),
  menuNodeId: z.uuid(),
  title: z.string(),
  description: z.string().nullable(),
  sortOrder: z.int(),
  schemaVersion: z.int().positive(),
  // 버전 값의 **의미**를 보지 않는 검사다(위 「저장된 문서를 그대로 담는다」 절). 999도 통과한다. 페이지 봉투라 화면 상태 목록을 받는다.
  schema: PageEnvelopeSchema,
  headSeq: z.int().nonnegative(),
}) as z.ZodType<SnapshotPage>

const CommentSchema = z.strictObject({
  id: z.uuid(),
  pageId: z.uuid(),
  nodeId: z.string(),
  body: z.string(),
  authorId: z.uuid(),
  authorName: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const ThemeSchema = z.strictObject({
  themeId: z.string().min(1),
  version: z.string().min(1),
  tokens: z.record(z.string(), z.union([z.string(), z.number()])),
})

const PayloadObjectSchema = z.strictObject({
  // 리터럴이 아닌 이유는 위 `payloadVersion` 절에 있다 — 읽는 쪽이 값을 보고 판정한다.
  payloadVersion: z.int().positive(),
  // **`z.string()`이 아니라 ISO datetime이다.** `insertSnapshot`이 이 값을
  // `new Date(...)`로 바꿔 `created_at`에 심으므로, 형식이 깨지면 `Invalid Date`가
  // Postgres까지 내려가 500이 된다. 규격이 그 자리를 막는다.
  capturedAt: z.iso.datetime(),
  menu: z.array(MenuNodeSchema),
  pages: z.array(PageSchema),
  comments: z.array(CommentSchema),
  // 판 2 이하 payload 에는 없다 — 선택이다(위 「테마는 참조로 얼린다」 절).
  theme: ThemeSchema.nullable().optional(),
  // 판 3 이하 payload 에는 없다 — 선택이다(위 「공통코드 표 — 판 4」 절).
  codes: CodeTableSchema.optional(),
})

/** 판 4 이하의 `layouts` 키를 걷는다(위 「레이아웃 표를 담지 않는다 — 판 5」 절). 다른 값은 그대로 넘겨 strict 가 본다. */
function dropRetiredLayouts(input: unknown): unknown {
  if (typeof input !== 'object' || input === null || Array.isArray(input) || !('layouts' in input)) return input
  const version = (input as { payloadVersion?: unknown }).payloadVersion
  if (typeof version !== 'number' || !Number.isInteger(version) || version > 4) return input
  const { layouts: _retired, ...rest } = input as Record<string, unknown>
  return rest
}

/**
 * payload 전체. **`z.strictObject`인 것이 규칙이다** — 겹layer든 무엇이든 선언되지 않은
 * 절이 실리면 파싱이 죽는다(위 "겹layer" 절). 그 앞에서 판 4 이하의 `layouts` 만 걷는다.
 */
export const SnapshotPayloadSchema: z.ZodType<SnapshotPayload> = z.preprocess(
  dropRetiredLayouts,
  PayloadObjectSchema,
) as unknown as z.ZodType<SnapshotPayload>

/**
 * payload가 담는 자원의 이름. **손으로 적지 않고 규격에서 읽는다** — 세는 쪽과 담는 쪽이
 * 어긋날 자리를 없앤다(이 패키지의 `SECTIONS`가 같은 방식이다).
 *
 * *"payload에 담기는 것은 넷이고 겹layer는 없다"*를 실행으로 지키는 케이스가
 * 이것을 센다.
 */
export const SNAPSHOT_RESOURCES: readonly string[] = Object.keys(PayloadObjectSchema.shape).filter(
  (key) => key !== 'payloadVersion' && key !== 'capturedAt',
)
