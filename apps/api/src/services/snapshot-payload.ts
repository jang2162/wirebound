/**
 * 스냅샷 payload의 규격(설계 §4.5). **`apps/api`가 소유한다 — 계획서 D2.**
 *
 * payload는 `PageDocument`(`@wirebound/schema`)와 `Theme`(`@wirebound/themes`)를 **동시에**
 * 참조한다. 그래서 둘 중 어느 패키지에도 둘 수 없다:
 *
 * | 후보 | 왜 아닌가 |
 * |---|---|
 * | `packages/schema` | `schema → themes` 역방향 의존이 생긴다. CLAUDE.md의 *"의존 방향은 한 방향이다"*를 깬다 |
 * | `packages/themes` | 스냅샷이 테마 개념이 된다. `themes`는 페이지·메뉴·코멘트를 몰라야 한다 |
 * | **`apps/api`** | 이미 둘 다 의존한다. 쓰는 데가 여기 하나다 |
 *
 * P9의 `wireb pull`(§12)이 이 규격을 필요로 하면 그때 패키지로 올린다. **지금 올리면
 * 소비자가 하나인 패키지가 생긴다.**
 *
 * ---
 *
 * # `payloadVersion`은 `PageDocument.version`과 다른 축이다 (계획서 D3)
 *
 * payload **형식**이 바뀌는 것과 **컴포넌트 props**가 바뀌는 것은 서로 독립이다. 페이지
 * 문서에 마이그레이션이 하나 붙어도 payload의 모양은 그대로일 수 있고, 반대로 payload에
 * 자원이 하나 더 실려도 문서 스키마는 그대로다.
 *
 * - 모르는 `payloadVersion`(현재 값보다 큰 것)을 **복원**하려 하면 P6-2가 거부한다.
 * - **조회는 막지 않는다.** 태그는 지워지지 않는 기록이므로(§4.5) 읽기까지 막으면 기록
 *   자체가 사라진 것과 같다.
 * - **이 슬라이스는 값을 심고 상세 응답에 싣기만 한다.** 게이트는 P6-2의 몫이다.
 *
 * 그래서 아래 `payloadVersion` 필드가 **`z.literal(SNAPSHOT_PAYLOAD_VERSION)`이 아니라
 * `z.int().positive()`다.** 리터럴로 박으면 이 규격으로 **읽는** 쪽이 미래 payload를
 * 파싱조차 못 하게 되는데, 그것이 바로 위 두 번째 줄이 금지하는 일이다. 무엇을 거부할지는
 * **읽는 쪽이** 값을 보고 판정한다.
 *
 * ---
 *
 * # 저장된 문서를 그대로 담는다 — 마이그레이션하지 않는다 (계획서 D4)
 *
 * 각 페이지의 `schema`·`schemaVersion`을 **DB에 있는 값 그대로** 싣는다. 캡처에서
 * `migrateDocument`를 돌리면 §13.1이 적어 둔 그 상태(저장된 문서의 버전이
 * `CURRENT_DOCUMENT_VERSION`보다 큰 페이지)가 **하나만 있어도 프로젝트 전체 캡처가
 * 실패한다** — 캡처는 읽기 연산이고, 읽기가 실패하면 사용자는 **얼릴 수단 자체를 잃는다.**
 *
 * **실측**(재라 #5): `pages.schema_version`을 999로 심고 `findPageById`로 읽으면 그대로
 * 999가 나오고(repo는 마이그레이션을 모른다), 같은 페이지를 `GET .../pages/:pageId`로
 * 읽으면 **400 `지원하지 않는 문서 버전: 999`**다. 즉 마이그레이션을 하는 것은 라우트이지
 * repo가 아니고, 캡처가 repo를 지나는 한 그 실패는 캡처에 옮겨붙지 않는다.
 *
 * **그런데 아래 스키마는 `DocumentEnvelopeSchema`로 문서를 검사한다 — 모순이 아니다.**
 * 그 스키마는 `{ version: z.int().positive(), root: WbNodeSchema }`이고 **버전 값의
 * *의미*를 보지 않는다.** 999도 통과한다. 막히는 것은 봉투 자체가 깨진 문서뿐이고, 그런
 * 문서는 쓰기 경로가 이미 거부하므로 DB에 없다. 즉 D4가 피하려던 실패(버전 때문에 캡처
 * 전체가 죽는 것)는 일어나지 않으면서, payload가 무엇을 담는지는 규격에 남는다.
 *
 * ---
 *
 * # 테마는 병합된 결과로 얼린다 (계획서 D5 = §4.5)
 *
 * §4.5: *"참조만 저장하면 테마가 나중에 바뀌었을 때 스냅샷이 다른 모습으로 복원된다.
 * (…) 상속 테마는 병합된 결과를 저장한다."*
 *
 * **담는 단위는 레이아웃이다.** 프로젝트당 레이아웃이 하나라고 가정하지 않는다 —
 * **재라 #2를 재서 거짓임을 확인했다:** `layouts`에는 `project_id` 유니크가 없고
 * (`0007-layouts.ts`), 같은 프로젝트에 두 번째 레이아웃을 실제로 넣어 보니 **들어간다**
 * (프로젝트 생성 직후 1건 → 삽입 후 2건). 오늘 그 두 번째를 만드는 코드 경로가 없을 뿐이다.
 * 그래서 `layouts`·`themes` 둘 다 **배열**이고, §4.4의 레이아웃 에디터가 붙어도 규격이
 * 바뀌지 않는다.
 *
 * **`theme`이 `null`인 것은 정상이다** — `layouts.theme_id`가 `NULL`을 받는다(0007 재라 #7).
 * 그것은 *"구조 기본 CSS만으로 그려진 화면"*을 뜻한다. `themeId`가 있는데 `theme`이
 * `null`인 경우도 있다 — 상속이 끊긴 파생 테마다(`routes/themes.ts`의 `currentTheme`이
 * 같은 자리에서 같은 값을 낸다).
 *
 * ---
 *
 * # 겹layer(런타임 상태)를 담지 않는다 (P5-3 이월 §3.3)
 *
 * §4.5가 나열한 다섯은 메뉴·페이지·레이아웃·테마·코멘트이고 그 밖은 없다. 겹layer를
 * 넣으면 *"버튼을 눌러 둔 상태"*가 복원되어 **문서에 없는 것이 문서에서 온 것처럼 보인다.**
 * 아래 `SnapshotPayloadSchema`가 `z.strictObject`인 것이 그 규칙을 실행으로 지키는 자리다 —
 * 선언되지 않은 절이 payload에 실리면 그 자리에서 파싱이 죽는다.
 */
import { z } from 'zod'
import { DocumentEnvelopeSchema, type LayoutDocument, type PageDocument } from '@wirebound/schema'
import { ThemeSchema, type Theme } from '@wirebound/themes'

/**
 * 이 코드가 만드는 payload의 형식 버전. **올리는 것은 payload의 모양이 바뀔 때뿐이다** —
 * 자원이 늘거나, 필드의 뜻이 바뀌거나, 절이 사라질 때. 값이 늘어나는 것(예: 페이지가 하나
 * 더 생기는 것)은 형식 변경이 아니다.
 */
export const SNAPSHOT_PAYLOAD_VERSION = 1

/** 메뉴 트리 노드 하나. 트리로 접지 않고 **평평하게** 담는다 — `parentId`가 구조를 나른다. */
export interface SnapshotMenuNode {
  id: string
  parentId: string | null
  title: string
  sortOrder: number
}

/**
 * 페이지 하나. `schema`·`schemaVersion`은 **DB에 있는 값 그대로**다(D4).
 *
 * **`headSeq`를 함께 싣는 것이 §4.5의 요구다** — *"각 페이지의 `head_seq`를 함께
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

/** 레이아웃 하나. `themeId`는 **참조**이고, 그 참조가 가리키던 문서는 `themes`에 있다. */
export interface SnapshotLayout {
  id: string
  name: string
  themeId: string | null
  schema: LayoutDocument
}

/**
 * 레이아웃 하나가 그 시점에 입고 있던 테마 — **병합이 끝난 홀로 서는 문서**다(D5).
 *
 * `layoutId`로 매단다. `themeId`도 함께 싣는 것은 복원이 *"그 테마 행이 아직 있는가"*를
 * 물을 수 있어야 하기 때문이다 — 있으면 다시 가리키고, 없으면 payload의 문서로 되살린다.
 * 그 판정은 P6-2의 몫이고 이 슬라이스는 **둘 다 남겨 둔다.**
 */
export interface SnapshotLayoutTheme {
  layoutId: string
  themeId: string | null
  theme: Theme | null
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

export interface SnapshotPayload {
  payloadVersion: number
  /** 캡처 시각(ISO 8601). `snapshots.created_at`과 같은 트랜잭션의 같은 시점이다(0009의 주석). */
  capturedAt: string
  menu: SnapshotMenuNode[]
  pages: SnapshotPage[]
  layouts: SnapshotLayout[]
  themes: SnapshotLayoutTheme[]
  comments: SnapshotComment[]
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
  // 버전 값의 **의미**를 보지 않는 검사다(위 D4 절). 999도 통과한다.
  schema: DocumentEnvelopeSchema,
  headSeq: z.int().nonnegative(),
}) as z.ZodType<SnapshotPage>

const LayoutSchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  themeId: z.uuid().nullable(),
  schema: DocumentEnvelopeSchema,
}) as z.ZodType<SnapshotLayout>

const LayoutThemeSchema = z.strictObject({
  layoutId: z.uuid(),
  themeId: z.uuid().nullable(),
  // **`ThemeSchema`다 — `ThemePatchSchema`가 아니다.** 병합이 끝난 문서는 §6.9의 삭제
  // 지시(`null`)를 담을 수 없고, 담고 있다면 그것은 병합이 안 끝났다는 뜻이다.
  theme: ThemeSchema.nullable(),
}) as z.ZodType<SnapshotLayoutTheme>

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

/**
 * payload 전체. **`z.strictObject`인 것이 규칙이다** — 겹layer든 무엇이든 선언되지 않은
 * 절이 실리면 파싱이 죽는다(위 "겹layer" 절).
 */
export const SnapshotPayloadSchema: z.ZodType<SnapshotPayload> = z.strictObject({
  // 리터럴이 아닌 이유는 위 D3 절에 있다 — 읽는 쪽이 값을 보고 판정한다.
  payloadVersion: z.int().positive(),
  capturedAt: z.string(),
  menu: z.array(MenuNodeSchema),
  pages: z.array(PageSchema),
  layouts: z.array(LayoutSchema),
  themes: z.array(LayoutThemeSchema),
  comments: z.array(CommentSchema),
}) as z.ZodType<SnapshotPayload>

/**
 * payload가 담는 자원의 이름. **손으로 적지 않고 규격에서 읽는다** — 세는 쪽과 담는 쪽이
 * 어긋날 자리를 없앤다(`packages/themes`의 `SECTIONS`가 같은 방식이다).
 *
 * 사실 2(*"payload에 담기는 것은 다섯이고 겹layer는 없다"*)를 실행으로 지키는 케이스가
 * 이것을 센다.
 */
export const SNAPSHOT_RESOURCES: readonly string[] = Object.keys(
  (SnapshotPayloadSchema as unknown as { shape: Record<string, unknown> }).shape,
).filter((key) => key !== 'payloadVersion' && key !== 'capturedAt')
