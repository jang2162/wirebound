/**
 * 서버가 주고받는 리소스의 타입. 근거는 `apps/api/README.md`의 엔드포인트 표다.
 *
 * **`apps/api`에서 타입을 import하지 않고 여기 다시 선언한다.** 같은 저장소에 있어도
 * HTTP 경계 너머이고, 이 앱의 의존 방향은 `packages/schema` ← `packages/renderer` ←
 * `apps/web` 한 방향이다. 서버가 응답 형태를 바꾸면 여기가 따라 바뀌어야 한다 —
 * 컴파일러가 그것을 대신 알려 주지 않는다는 뜻이므로, 각 타입에 근거를 적어 둔다.
 *
 * 예외는 `PageDetail.schema`다. 문서 스키마는 서버가 아니라 `@wirebound/schema`가
 * 소유하는 단일 진실이므로 그 타입을 그대로 쓴다.
 */
import type { PageDocument, PatchOp } from '@wirebound/schema'
import type { Theme, ThemeIssue } from '@wirebound/themes'

/** 프로젝트 멤버의 역할. `owner` > `editor` > `viewer`(README "권한(역할)"). */
export type ProjectRole = 'owner' | 'editor' | 'viewer'

/** `POST /api/auth/login`·`GET /api/auth/me`의 응답. */
export interface SessionUser {
  id: string
  email: string
  name: string
}

/**
 * 프로젝트의 공통 필드. **이것만 오는 응답은 없다** — 아래 `ProjectDetail`의 실측 표가
 * 프로젝트를 내는 네 자리가 전부 `role`까지 싣는다는 것을 보인다. 여기 따로 두는 것은
 * `ProjectDetail`이 "공통 필드 + 역할"임을 타입으로 남기기 위해서다.
 */
export interface ProjectSummary {
  id: string
  name: string
  slug: string
  description: string | null
}

/**
 * 호출자의 역할이 실린 프로젝트. **프로젝트를 내는 응답은 지금 넷이고 전부 이 형태다.**
 *
 * **실측**(P2b-5 웨이브 1, api 하네스에 임시 파일을 두고 재고 지웠다. 계획서의 **재라 #1**이
 * 이것으로 닫힌다) — 네 자리의 키 집합이 `["description","id","name","role","slug"]`로 같다:
 *
 * | 응답 | 상태 | `role` |
 * |---|---|---|
 * | `POST /api/projects` | 201 | `"owner"`(만든 사람이 owner다) |
 * | `GET /api/projects` 각 항목 | 200 | 그 사용자의 역할 |
 * | `GET /api/projects/:projectId` | 200 | 그 사용자의 역할 |
 * | `PATCH /api/projects/:projectId` | 200 | 그 사용자의 역할(owner만 부를 수 있다) |
 *
 * **계획서 D1이 *"생성 응답에는 `role`이 없다"*고 확정해 적었던 것은 거짓이다.**
 * `apps/api/src/repos/projects.ts`의 `insertProject`가 `.returning(['id','name','slug',
 * 'description'])`으로 고른 뒤 **`{ ...project, role: 'owner' as const }`로 감싸** 돌려준다 —
 * 계획서는 앞줄만 읽고 확정했다.
 *
 * **그런데도 응답을 그대로 요청 본문으로 되보낼 수 없다.** 서버의 `CreateProjectBody`·
 * `UpdateProjectBody`가 `z.strictObject`라 선언되지 않은 키가 있으면 400이다. 실측 둘 —
 * 어긋난 키를 **한 issue에 모아서** 알려 준다:
 *
 * ```
 * POST  {name,slug,role:'owner'}              → 400 인식할 수 없는 키: "role"
 * POST·PATCH {id,name,slug,description,role}  → 400 인식할 수 없는 키: "id", "role"
 * ```
 *
 * **타입은 그것을 막지 못한다** — 초과 속성 검사가 스프레드 리터럴에 걸리지 않는다
 * (`http-client.ts`의 `declaredOnly` 머리말에 `tsc` 프로브 표가 있다). **그래서 나가는 본문을
 * 만드는 자리에서 선언된 키만 골라 담는다.**
 */
export interface ProjectDetail extends ProjectSummary {
  role: ProjectRole
}

/**
 * `POST /api/projects/:projectId/menu`·`PATCH .../menu/:nodeId`의 응답.
 *
 * **트리 노드(`TreeMenuNode`)와 다른 모양이다 — `pages`·`children`이 없다.** 그래서 만든
 * 결과를 트리에 그대로 꽂을 수 없고, 조작이 성공하면 트리를 다시 받는다(P2b-4 D1).
 *
 * `parentId`가 `null`이면 루트 메뉴다.
 */
export interface MenuNode {
  id: string
  projectId: string
  parentId: string | null
  title: string
  sortOrder: number
}

/** 통합 트리의 페이지 항목. `schema`는 실리지 않는다(README "트리 응답 형태"). */
export interface TreePage {
  id: string
  title: string
  sortOrder: number
}

/** 통합 트리의 메뉴 노드. 페이지는 항상 메뉴 노드에 속하므로 루트 페이지 목록은 없다. */
export interface TreeMenuNode {
  id: string
  title: string
  sortOrder: number
  pages: TreePage[]
  children: TreeMenuNode[]
}

/**
 * `GET /api/projects/:projectId/pages/:pageId`의 응답. 여덟 키가 전부다 —
 * `projectId`는 경로에 이미 있어 응답에 없다(`apps/api/test/pages.test.ts`
 * "페이지 응답은 계약된 키만 담는다"가 이 키 집합을 못박고 있다).
 *
 * `headSeq`가 다음 편집 요청의 `baseSeq`다(P2b-2).
 */
export interface PageDetail {
  id: string
  menuNodeId: string
  title: string
  description: string | null
  sortOrder: number
  schemaVersion: number
  headSeq: number
  schema: PageDocument
}

/**
 * `PATCH /api/projects/:projectId/pages/:pageId/ops`의 응답.
 *
 * **`inverse`는 서버가 만든다.** 설계 §7.1이 못박은 것: *"`inverse`는 서버가 적용 직전
 * 상태를 보고 생성한다. 클라이언트가 계산해 보내지 않는다 — 클라이언트 상태가 낙관적으로
 * 앞서 있을 수 있기 때문이다."* 클라이언트는 그것을 그대로 `ops`로 되보내는 것 말고는
 * 아무것도 하지 않는다(README 4단계 — 그것이 undo다. 서버에 undo 개념은 없다).
 *
 * `clientOpId`는 **요청에 그 키가 있었을 때만** 실려 온다(`apps/api/src/routes/pages.ts` —
 * 서버가 만들어 내는 값이 아니라 클라이언트가 맡긴 값을 되돌려 주는 것이다).
 */
export interface PatchResult {
  /** 이 편집이 만든 revision의 seq. **다음 요청의 `baseSeq`가 이 값이다**(README 4단계). */
  seq: number
  revisionId: string
  inverse: PatchOp[]
  schemaVersion: number
  clientOpId?: string
}

/**
 * `GET /api/projects/:projectId/pages/:pageId/revisions`의 항목. 여덟 키가 계약이다
 * (README "편집 파이프라인"의 예시 JSON).
 *
 * `ops`·`inverse`는 저장된 그대로 실려 나온다 — README가 그렇게 못박은 것은
 * **새로고침 뒤의 스택 복원이 `inverse`만으로 성립해야 하기 때문**이다(설계 §7.3, D10).
 */
export interface RevisionSummary {
  id: string
  seq: number
  actorType: 'user' | 'mcp' | 'cli'
  actorId: string | null
  actorLabel: string | null
  ops: PatchOp[]
  inverse: PatchOp[]
  createdAt: string
}

/**
 * `GET /api/projects/:projectId/theme`의 응답 — **이 프로젝트의 화면이 지금 써야 할 테마**다.
 *
 * `theme`이 `null`인 경우가 셋이고 **전부 정상이다**(서버 README): 기본 레이아웃이 없다 ·
 * 레이아웃이 테마를 고르지 않았다 · 테마 행이 사라졌다. 그때 화면은 구조 기본 CSS만으로
 * 그려진다 — `theme/theme-source.ts`가 `null`을 낼 수 있는 것과 같은 상태다.
 *
 * **파생 테마는 서버가 이미 합쳐서 준다**(홀로 서는 테마 하나). 그래서 이 값을
 * `resolveTheme(theme)`에 base 없이 그대로 넣을 수 있고, `ThemeSource`가
 * `() => Theme | null`로 남는다. 편집용 형태(파생 문서 + `base`)는 `.../themes/:themeId`가
 * 내는 것이고 이 화면이 쓰지 않는다.
 *
 * `issues`는 **서버가 합치다 실패했을 때** 채워진다(그때 `theme`은 `null`이다).
 * 화면에 뿌리지 않고 콘솔에만 남긴다 — P4a-2의 재라 #12 결정 그대로다.
 */
export interface ProjectTheme {
  /**
   * **지금 골라져 있는 테마의 행 id.** 고르지 않았거나 그 행이 사라졌으면 `null`이다.
   *
   * **`theme.meta.id`로 대신할 수 없다.** 그것은 slug이고 유일성 단위가
   * `(project_id, slug)`라 **시스템 테마와 프로젝트 테마가 같은 slug를 가질 수 있다.**
   * 게다가 파생 테마는 서버가 합쳐서 주므로 `meta`가 base의 것과 섞인다.
   *
   * **캔버스는 이 값을 안 읽는다** — 그리는 쪽은 유래가 필요 없다. 고르개만 쓴다.
   */
  themeId: string | null
  theme: Theme | null
  issues: { path: string; message: string }[]
}

/**
 * 테마 목록의 항목 — **고르개가 고를 수 있는 것 하나**다.
 *
 * `theme`을 통째로 싣는 것은 서버가 그렇게 내기 때문이고(`GET /:projectId/themes`),
 * 고르개가 실제로 읽는 것은 `id`·`system`·`theme.meta.name`이다. **목록에는 `base`가
 * 없다** — 파생 항목마다 시스템 테마 전문이 붙어 응답이 항목 수만큼 부풀기 때문이고,
 * 목록의 쓸모는 **고르기이지 그리기가 아니다**(서버 README).
 */
export interface ThemeSummary {
  id: string
  /** `true`면 wirebound 내장 테마다(§6.10 — 읽기 전용, 어느 프로젝트에서나 고를 수 있다). */
  system: boolean
  theme: Theme
}

/**
 * **테마 하나 — 저작 UI가 편집하는 대상**(`GET`·`POST`·`PUT .../themes[/:themeId]`).
 *
 * 서버 README가 *"바탕은 네 키 + 조건부 둘"*로 적은 그 형태다. **셋을 한 타입으로 두는
 * 것이 판정이다** — 세 라우트가 같은 `toResponse`를 지나고 조건부 키만 갈리므로
 * (`apps/api/src/routes/themes.ts`), 타입을 셋으로 쪼개면 내용이 같은 셋이 생겨 한쪽만
 * 고쳐지는 자리가 된다(`http-client.ts`의 `SHAPES.pageDetail`이 같은 판단을 적어 두었다).
 * **대신 어느 라우트가 무엇을 낼 수 있는지는 아래 두 필드가 말한다.**
 *
 * | 라우트 | `base` | `warnings` |
 * |---|---|---|
 * | `GET .../themes/:themeId` | 파생이면 붙는다 | **안 붙는다** — 이 라우트는 테마를 해석하지 않는다 |
 * | `POST .../themes` · `PUT .../themes/:themeId` | **안 붙는다** | 경고가 있으면 붙는다 |
 *
 * **`ThemeSummary`와 다른 타입이다.** 목록 항목에는 `updatedAt`이 없고 조건부 둘도 없다 —
 * 목록의 쓸모는 고르기이지 편집이 아니다(서버 README).
 */
export interface ThemeDetail {
  /** **행의 uuid다**(`theme.meta.id`는 slug다). 경로에 쓰는 것이 이 값이다. */
  id: string
  /** `true`면 편집할 수 없다(§6.10). 서버가 `PUT`·`DELETE`를 403으로 막는다. */
  system: boolean
  updatedAt: string
  /** **저장된 그대로다** — 파생이면 `meta.extends`를 지닌 채 온다(합쳐지지 않는다). */
  theme: Theme
  /**
   * 상속 대상 시스템 테마 전문. **파생 테마의 상세 조회에만 붙는다.**
   *
   * `resolveTheme(document, base)`가 base 없이는 파생 문서의 해석 자체를 거부하므로
   * (`bad-extends`), 편집 중 검증을 클라이언트가 돌려면 이것이 반드시 필요하다.
   *
   * **상속 대상이 코드에 없으면 파생인데도 키가 없다**(서버 `toDetailResponse` — 동기화가
   * 남긴 낡은 파생). 그 상태는 *"열 수는 있지만 검증이 안 되는 테마"*이고, 화면이 그것을
   * `theme.meta.extends`의 유무와 이 키의 유무를 함께 보고 판정해야 한다.
   */
  base?: Theme
  /**
   * 저장된 테마의 **경고**. **쓰기 둘에만, 경고가 있을 때만 붙는다 — 없으면 키 자체가
   * 없다**(P4c-1이 그렇게 만들었다. 페이지 쪽 `warnings`·`clientOpId`와 같은 관례).
   *
   * `error`는 여기 오지 않는다 — 그것은 422이고 `ApiError.issues`로 온다.
   */
  warnings?: ThemeIssue[]
}
