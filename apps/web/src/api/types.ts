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
import type { PageDocument, PatchOp, ValidationIssue, ViewState, WbNode } from '@wirebound/schema'
import type { ThemeManifest } from '@wirebound/theme-sdk'

/** 프로젝트 멤버의 역할. `owner` > `editor` > `viewer`(README "권한(역할)"). */
export type ProjectRole = 'owner' | 'editor' | 'viewer'

/** `POST /api/auth/login`·`GET /api/auth/me`의 응답. */
export interface SessionUser {
  id: string
  email: string
  name: string
  /**
   * 인스턴스 관리자인가 — 뼈대 사이드바의 «관리자» 묶음(`shell/workspace-layout.tsx`)과 관리자 화면의 판정이 이 값을 읽는다. 서버는 세 응답
   * (`/me` · 로그인 · 초대 가입)에 늘 싣는다. **선택 키로 두는 것은** 이 값을 안 든 가짜 사용자(테스트 픽스처)를 «관리자 아님» 으로 읽게 하려는 것이다 — 없으면 거짓이다.
   */
  isInstanceAdmin?: boolean
}

/**
 * 프로젝트 멤버 한 줄(`GET · POST · PATCH /api/projects/:projectId/members` — 서버 README 「엔드포인트」). `role` 은 **그 멤버의** 역할이다 —
 * 화면이 보이고 바꿀 값이지 부르는 사람의 권한 판정이 아니다(판정은 `projects/project-actions.ts` 의 `projectAbilities`).
 */
export interface ProjectMember {
  userId: string
  email: string
  name: string
  role: ProjectRole
  invitedAt: string
  /** 그 사람이 지금 활성인가 — 비활성 사용자도 멤버 행은 그대로 갖는다(멤버 절의 «비활성» 표지). */
  active: boolean
}

/**
 * `GET /api/auth/tokens`의 한 줄 — **로그인한 사람의 토큰 전부**(프로젝트를 가로지른다). 원문은 없다.
 * `projectName`은 지금 그 프로젝트의 멤버일 때만 있다 — 멤버가 아니면 `null`이고 `member`가 `false`다(서버
 * `routes/tokens.ts`의 «내 토큰은 프로젝트를 가로지른다»). `lastUsedAt`은 한 번도 안 쓴 토큰이면 `null`이다.
 */
export interface MyApiToken {
  id: string
  name: string
  createdAt: string
  lastUsedAt: string | null
  projectId: string
  projectName: string | null
  member: boolean
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
 * 호출자의 역할이 실린 프로젝트. **프로젝트를 내는 응답은 지금 넷이고 전부 이 키를 싣는다** — 목록 항목은 두 칸
 * (`ProjectListItem`), 상세는 `themeRev`(`ProjectView`)가 더 있다.
 *
 * 네 자리의 키 집합(api `test/project-list-fields.test.ts` 의 «응답 넷의 키 집합» 이 잰다):
 *
 * | 응답 | 상태 | 키 집합 | `role` |
 * |---|---|---|---|
 * | `POST /api/projects` | 201 | `["description","id","name","role","slug"]` | `"owner"`(만든 사람이 owner다) |
 * | `GET /api/projects` 각 항목 | 200 | 위 + `memberCount` · `updatedAt` | 그 사용자의 역할 |
 * | `GET /api/projects/:projectId` | 200 | 위 + `themeRev` | 그 사용자의 역할 |
 * | `PATCH /api/projects/:projectId` | 200 | `["description","id","name","role","slug"]` | 그 사용자의 역할(owner만 부를 수 있다) |
 *
 * **생성 응답에도 `role`이 있다.** `apps/api/src/repos/projects.ts`의 `insertProject`가
 * `.returning(['id','name','slug','description'])`으로 고른 뒤 **`{ ...project, role: 'owner' as const }`로
 * 감싸** 돌려준다 — `.returning` 줄만 읽으면 *"생성 응답에는 `role`이 없다"*로 잘못 읽힌다.
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
 * `GET /api/projects` 의 한 항목. `memberCount` 는 그 프로젝트의 멤버 행 수, `updatedAt` 은 프로젝트 행과 그 페이지들 가운데 가장 늦게
 * 바뀐 시각(ISO — 정의는 서버 `repos/projects.ts` 의 `projectActivityColumns` 머리말)이다. 목록의 정렬 · 상대 시각이 이 둘을 읽는다
 * (`projects/project-filter.ts`).
 */
export interface ProjectListItem extends ProjectDetail {
  memberCount: number
  updatedAt: string
}

/**
 * `GET /api/projects/:projectId` 의 응답 — 역할에 더해 **`themeRev`** 를 싣는다(다른 셋은 안 싣는다). `theme-changed` 방송을 놓친 탭이
 * 다시 읽을 때 쥔 바인딩보다 새것인지 이 값으로 가른다(`theme/project-theme.tsx` 의 `catchUp`).
 */
export interface ProjectView extends ProjectDetail {
  themeRev: number
}

/** 패키지 판 하나를 가리키는 이름 — 파일 경로 · 캐시 키가 이 둘이다. */
export interface ThemeRef {
  themeId: string
  version: string
}

/**
 * `GET · PUT /api/projects/:projectId/theme` 의 응답(409 의 `current` 도 같은 모양 — `ApiError.current`). `latest` 는 그 테마의 숨기지
 * 않은 판 가운데 가장 높은 것이다(«새 버전» 표시).
 *
 * **바인딩 칸은 `null` 일 수 있다** — 시스템 테마를 시딩하기 전에 만든 프로젝트는 다음 기동까지 비어 있다(api README 「테마 패키지와
 * 프로젝트 테마」 의 «바인딩»). 그때 `manifest` 도 `null` 이다.
 */
export interface ProjectThemeView {
  themeId: string | null
  version: string | null
  /** 기본값과 다른 값만. */
  tokens: Record<string, string | number>
  rev: number
  manifest: ThemeManifest | null
  latest: string | null
  /** `latest` 판의 이름(테마 목록의 테마 이름과 같다) — `latest` 가 `null` 이면 `null`. */
  latestName: string | null
}

/** `GET …/theme/impact` 의 응답 — 테마를 바꾸기 전 확인 창의 수(spec 「테마 바꾸기와 버전 올리기」). */
export interface ThemeImpact {
  tokens: { kept: number; dropped: number; defaulted: number }
  /** 새 테마에 없는 variant 를 쓰는 노드 수 — 그런 노드가 있는 페이지만, 설계서 트리의 차례로. */
  variants: { pageId: string; title: string; count: number }[]
}

/** 패키지 판 한 줄 — `GET /api/theme-packages` 의 `versions[]` 와 관리자 숨김(`PATCH`)의 응답이 같다. */
export interface ThemePackageVersion {
  themeId: string
  version: string
  name: string
  preview: string | null
  hidden: boolean
  size: number
  uploadedAt: string
  /** `null` 이면 시스템 테마(기동이 넣었다). */
  uploadedBy: { id: string; name: string } | null
}

/**
 * `GET /api/theme-packages` 의 한 줄 — 테마 하나와 그 판들(semver 가 큰 것부터). **숨긴 판은 관리자에게만 실린다.** `latest` 는 숨기지
 * 않은 판의 최대이고 다 숨었으면 `null` 이다.
 */
export interface ThemePackageSummary {
  themeId: string
  name: string
  description: string | null
  latest: string | null
  versions: ThemePackageVersion[]
}

/** `POST /api/admin/theme-packages` 의 201 응답. */
export interface ThemePackageUploaded {
  themeId: string
  version: string
  name: string
  sha256: string
  size: number
}

/**
 * `POST /api/projects/:projectId/menu`·`PATCH .../menu/:nodeId`의 응답.
 *
 * **트리 노드(`TreeMenuNode`)와 다른 모양이다 — `pages`·`children`이 없다.** 그래서 만든
 * 결과를 트리에 그대로 꽂을 수 없고, 조작이 성공하면 트리를 다시 받는다.
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
  /**
   * 그 페이지의 화면 상태 목록(트리 응답 — `apps/api/src/services/menu-tree.ts` 의 `TreePage`). 메뉴 트리의 상태 줄이 열리지 않은 페이지에서
   * 쓴다(`panels/state-rows.tsx`). 없으면 상태가 없는 페이지로 읽는다.
   */
  viewStates?: ViewState[]
  /**
   * 페이지의 종류 — 문서 뿌리가 `Popup` 이면 `popup`(트리 응답 — `apps/api/src/services/menu-tree.ts` 의 `TreePage`). 메뉴 트리 줄의 «팝업» 표지 ·
   * 상호작용 탭의 대상 고르개가 닫힌 페이지에서 쓴다. 없으면 화면 페이지로 읽는다.
   */
  kind?: 'page' | 'popup'
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
 * 트리 응답 그대로 — 트리와 그 **메뉴 트리 판 번호**(`rev` — 서버가 트리 쓰기마다 올린다 · `apps/api/README.md` 「실시간 (WebSocket)」의 «트리 쓰기는
 * `menu-changed`를 낸다»). 번호와 트리는 서버가 한 시점에서 읽었다. 트리 칸이 겹친 조회의 낡은 답을 가르는 값이다(`tree/use-tree-commands.tsx`).
 */
export interface TreeRead {
  menu: TreeMenuNode[]
  rev: number
}

/**
 * `GET /api/projects/:projectId/pages/:pageId`의 응답. 여덟 키가 전부다 —
 * `projectId`는 경로에 이미 있어 응답에 없다(`apps/api/test/pages.test.ts`
 * "페이지 응답은 계약된 키만 담는다"가 이 키 집합을 못박고 있다).
 *
 * `headSeq`가 다음 편집 요청의 `baseSeq`다.
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
 * `POST /api/projects/:projectId/pages/import`의 응답(설계서 「페이지 JSON」).
 *
 * **`page`는 `PageDetail`과 같은 여덟 키다** — 서버가 같은 `toResponse`로 만든다. 그래서
 * 화면은 만들어진 페이지로 곧바로 옮길 수 있다.
 *
 * **`comments`가 둘을 갈라 센다.** `dangling`은 *"파일의 트리에 없는 노드를 가리키던
 * 코멘트"*이고 **그것도 들어간다** — 들어간 뒤 코멘트 탭이 *"사라진 노드"* 무리로
 * 보인다. 수를 말하지 않으면 사용자는 자기가 고아를 만든 줄 모른다.
 *
 * **`ignoredLayoutRef`는 파일이 그 값을 들었을 때만 온다** — 없으면 **키 자체가 없다**
 * (`clientOpId`·`warnings`와 같은 관례). 지금은 페이지가 레이아웃을 고르는 경로가 없어
 * 서버가 그 값을 쓰지 않고, 조용히 버리는 대신 말한다.
 */
export interface PageImported {
  page: PageDetail
  comments: { inserted: number; dangling: number }
  ignoredLayoutRef?: string
  warnings?: ValidationIssue[]
}

/**
 * `PATCH /api/projects/:projectId/pages/:pageId/ops`의 응답.
 *
 * **`inverse`는 서버가 만든다.** 설계서 「정방향 흐름」이 못박은 것: *"`inverse`는 서버가 적용 직전
 * 상태를 보고 생성한다. 클라이언트가 계산해 보내지 않는다 — 클라이언트 상태가 낙관적으로
 * 앞서 있을 수 있기 때문이다."* 클라이언트는 그것을 그대로 `ops`로 되보내는 것 말고는
 * 아무것도 하지 않는다(README 「편집 파이프라인」 — 그것이 undo다. 서버에 undo 개념은 없다).
 *
 * `clientOpId`는 **요청에 그 키가 있었을 때만** 실려 온다(`apps/api/src/routes/pages.ts` —
 * 서버가 만들어 내는 값이 아니라 클라이언트가 맡긴 값을 되돌려 주는 것이다).
 */
export interface PatchResult {
  /** 이 편집이 만든 revision의 seq. **다음 요청의 `baseSeq`가 이 값이다**(README 「편집 파이프라인」). */
  seq: number
  revisionId: string
  inverse: PatchOp[]
  schemaVersion: number
  clientOpId?: string
  /**
   * 저장된 문서의 **경고**. **경고가 있을 때만 붙는다 — 없으면 키 자체가 없다**
   * (`apps/api/src/http/warnings.ts`의 `withWarnings`. 테마 쪽 `warnings`와 같은 관례).
   *
   * `error`는 여기 오지 않는다 — 그것은 422이고 `ApiError.issues`로 온다.
   *
   * **이 키를 선언에서 빼면 경고가 아무 데도 안 간다.** 서버는 싣지만(`routes/pages.ts`의
   * 두 자리) 클라이언트가 그 필드를 모르면, 상호작용 이슈 셋(`missing-interaction-target`·
   * `invalid-interaction-target`·`invalid-interaction-prop`)이 **전부 `warning`이라 아무도 볼 수
   * 없다.** **읽는 자리는 `edit/use-edit-commit.tsx`다.**
   */
  warnings?: ValidationIssue[]
}

/**
 * `GET /api/projects/:projectId/pages/:pageId/revisions`의 항목. 여덟 키가 계약이다
 * (README "편집 파이프라인"의 예시 JSON).
 *
 * `ops`·`inverse`는 저장된 그대로 실려 나온다 — README가 그렇게 못박은 것은
 * **새로고침 뒤의 스택 복원이 `inverse`만으로 성립해야 하기 때문**이다(설계서 「개인 undo/redo」).
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
 * `?fields=inverse`로 받은 항목 — `RevisionSummary`에서 `ops`만 없다. 되돌리기(새로고침 뒤 스택 복원 · 되짚기)는 `inverse`만 쓰는데, 문서 통째 교체
 * revision 은 `ops` · `inverse`가 각각 문서 한 벌이라 그 조회의 응답이 반이 된다(`api/http-client.ts`의 `listMyRevisions` · `listRevisionsBefore`).
 */
export type RevisionInverse = Omit<RevisionSummary, 'ops'>

/**
 * 코멘트 하나. 근거는 `apps/api/README.md`의 엔드포인트 표와 "코멘트와 번호"다.
 *
 * **`marker`가 없는 것이 요점이다.** 번호는 코멘트가 아니라 **노드**의 값이라
 * (설계서 「페이지 스키마 노드」) 문서에서 읽는다 — 화면이 `nodeId`로 문서의 노드를 찾아 `marker`를 얻는다.
 * 여기 번호를 실으면 같은 노드의 코멘트 셋이 번호를 세 벌 들게 되고, 그중 하나가 낡는
 * 날 화면이 어느 것을 믿을지 알 수 없다.
 *
 * `authorName`은 **지금** 그 사람의 이름이다(서버가 조인해서 낸다) — `RevisionSummary`의
 * `actorLabel`이 편집 시점의 스냅샷인 것과 갈린다.
 */
/**
 * 코멘트 토큰을 푸는 프로젝트 전체의 번호 색인(`GET …/comments/index` — `apps/api/README.md`). `markers` 는 코멘트가 달린 노드와 이 프로젝트 코멘트의
 * 토큰이 가리키는 노드만이다 — 번호가 걷힌 노드는 `marker: null`.
 */
export interface CommentIndex {
  pages: { id: string; title: string; menuPath: string }[]
  markers: { pageId: string; nodeId: string; marker: number | null; nodeName: string; firstComment: string }[]
}

export interface Comment {
  id: string
  nodeId: string
  body: string
  authorId: string
  authorName: string
  createdAt: string
  updatedAt: string
}

/**
 * **그 요청이 문서에 낸 변화.** 코멘트를 만들고 지우고 재번호하는 셋이 이것을 낸다.
 *
 * `markerOps`는 서버가 실제로 적용한 `PatchOp[]`이고, 화면은 **자기 문서에 같은 ops를
 * 적용한다** — 문서를 통째로 받으면 아직 보내지 않은 낙관적 편집이 사라지기 때문이다
 * (서버 README의 "코멘트와 번호"). 문서가 안 바뀌었으면 빈 배열이고 `seq`는 그대로다.
 */
export interface MarkerChange {
  seq: number
  markerOps: PatchOp[]
}

/**
 * 코멘트를 만든 결과. `marker`는 그 노드가 갖게 된(또는 이미 갖고 있던) 번호다.
 *
 * **`null`은 멱등 키의 재생에서만 온다** — 같은 키로 이미 달린 게시를 돌려줄 때 그 노드의
 * **지금** 번호를 싣는데, 그 사이 노드가 지워졌거나 번호가 사라졌으면 없다(`apps/api/README.md`의
 * «멱등 키»). 새로 단 게시는 늘 번호를 받는다.
 */
export interface CommentCreated extends MarkerChange {
  comment: Comment
  marker: number | null
}

/**
 * 스냅샷 하나 — 설계서 「스냅샷」의 **삭제 없는 태그**.
 *
 * **`payload`가 없다.** 목록 응답이 애초에 그것을 싣지 않고(서버 README 「스냅샷 응답 형태」),
 * **이 화면은 상세를 부르지 않는다** — 목록 · 저장 폼 · 복원 어느 것도 `payload`를 읽지 않는다
 * (복원은 스냅샷 id 하나로 서버에 맡긴다 — `restoreSnapshot`).
 *
 * `payloadBytes`는 `octet_length(payload::text)`다 — DB가 들고 있는 문서의 옥텟 수이고,
 * 설계서 「열린 질문」의 스냅샷 보관 정책을 닫을 관측이다. 상한은 없다.
 */
/**
 * 프로젝트 모듈 하나(정본 설계서 「모듈」 · api README «모듈 응답 형태») — 구조 트리에서 고른 노드를 «모듈로 저장…» 한 묶음이다. 하단 판 «모듈» 탭의
 * «프로젝트 모듈» 묶음이 그린다. 개인 모듈(`PersonalModule`)도 같은 꼴이다.
 *
 * **`nodes` 는 문서 봉투가 아니다** — 넣으면 고른 자리의 형제가 될 노드들이고, 서버가 저장할 때 `marker` · 묶음 밖 액션을 걷었다.
 */
export interface ProjectModule {
  id: string
  name: string
  nodes: WbNode[]
  /** `nodes` 의 노드 수(자손까지) — 카드의 «노드 N개». */
  nodeCount: number
  createdBy: string
  createdAt: string
  updatedAt: string
}

/**
 * 개인 모듈 하나(`GET /api/me/modules`) — 사람이 소유하고 그 사람이 여는 모든 프로젝트의 «개인 모듈» 묶음에 선다. 응답 꼴은 프로젝트 모듈과 같고
 * `createdBy` 가 소유자다(서버가 같은 모양으로 낸다 — `routes/personal-modules.ts`).
 */
export type PersonalModule = ProjectModule

/** 프로젝트에 올린 그림 하나(`GET /api/projects/:projectId/assets` 의 항목 · 올리기의 답). `id` 가 그 바이트의 sha256 이다. */
export interface AssetInfo {
  id: string
  name: string
  mime: string
  size: number
  width: number
  height: number
  createdAt: string
}

/** 프로젝트의 그림 목록 · 쓴 용량 · 한도(바이트). */
export interface AssetList {
  assets: AssetInfo[]
  usedBytes: number
  limitBytes: number
  fileLimitBytes: number
}

/**
 * 가져오기의 답 — 옮긴 그림 · 못 옮긴 그림과 까닭. `not-readable` 은 «출처에 없음 · 출처의 멤버가 아님 · 출처가 지워짐» 을 가르지 않는다
 * (서버 `apps/api/src/routes/assets.ts` 머리말).
 */
export interface AssetClaimResult {
  claimed: string[]
  failed: { id: string; reason: 'not-readable' | 'quota' }[]
}

/** 가져오기의 출처 — 다른 프로젝트 · 내 개인 몫. */
export type AssetSource = { projectId: string } | { personal: true }

export interface SnapshotSummary {
  id: string
  tag: string
  description: string | null
  createdBy: string
  /** 만든 사람의 **지금** 이름. 서버가 조인해서 낸다(`repos/snapshots.ts`). */
  createdByName: string
  createdAt: string
  payloadBytes: number
}

/**
 * 복원 결과. **화면이 말할 것 셋이 전부 여기 있다** — 바뀐 페이지 수·그대로인 페이지
 * 수·안전망 스냅샷의 태그.
 *
 * **`summary`가 자원마다 갈려 있는 것이 요점이다.** 하나로 접으면 *"12개가 바뀌었습니다"*가
 * 되는데, 사용자가 알고 싶은 것은 *"내 페이지가 몇 개 되돌아갔나"*이지 총합이 아니다.
 */
export interface RestoreResult {
  summary: {
    menu: { created: number; updated: number; deleted: number }
    pages: {
      created: number
      metaUpdated: number
      /** 문서가 실제로 되돌아간 페이지 수. */
      schemaChanged: number
      /** **내용이 같아 아무것도 쓰지 않은** 페이지 수. */
      schemaUnchanged: number
      deleted: number
    }
    comments: { created: number; updated: number; deleted: number }
  }
  /**
   * 복원 **직전** 상태를 담은 스냅샷. 서버가 자동으로 만든다 — 화면은 *"되돌리려면 이것"*을
   * 가리킬 수 있어야 한다.
   */
  safetySnapshot: { id: string; tag: string }
}

/**
 * 이 서버가 낼 줄 아는 형식(`apps/api/src/routes/export.ts`의 `EXPORT_FORMATS`).
 *
 * **유니온에서 뽑는다** — 아래 두 갈래에 형식을 더하면 이 타입이 저절로 따라오고, 손으로
 * 적은 목록이 갈래와 어긋나는 날이 오지 않는다.
 */
export type ExportFormat = ExportPreview['format']

/**
 * 내보내기 미리보기(설계서 「HTML 정적 번들」). **내려받기 버튼이 조용히 성공하면 안 된다.**
 *
 * 그리지 못한 노드가 있어도 폴백이 든 HTML은 눈으로는 그럴듯한 한 장이고, **번들은 그것을
 * 남에게 전달한다.** 그래서 화면이 내려받기 **전에** 무엇이 실릴지와 무엇이 어긋났는지
 * 볼 수 있어야 한다.
 *
 * # 형식마다 **다른 것**을 말한다 — 그래서 판별 유니온이다
 *
 * `duplicateTargets`·`brokenLinks`·`errors`·`themeId`는 **HTML 번들의 성질이다.** PPTX는
 * 페이지 사이 링크를 만들지 않고 설계서 「테마 시스템」의 테마도 안 쓴다 — 대신 **화면 이미지**에 대해 셋을
 * 낸다(`screenless`·`screenFailures`·`fontWarning`). 서버가 이미 그렇게 가른 것을
 * (`routes/export.ts`) 화면 쪽 타입이 그대로 받는다.
 *
 * **두 모양을 옵셔널로 뭉치지 않는다.** 뭉치면 *"pptx인데 `brokenLinks`를 읽는"* 코드가
 * **타입 검사를 통과하고**, 그 자리는 `undefined.length`로 렌더 도중 죽는다 — 이 화면을
 * 감싸는 오류 경계가 없다(`api/http-client.ts`의 `isExportPreview`가 같은 근거를 든다).
 *
 * **`format`은 서버가 응답에 되싣는 값이다** — 키 유무로 갈래를 짐작하지 않는다
 * (`routes/export.ts`: *"화면이 어느 갈래를 받았는지 키 유무로 짐작하지 않는다"*).
 */
export type ExportPreview = HtmlExportPreview | PptxExportPreview

/** HTML 정적 번들(zip)의 미리보기. */
export interface HtmlExportPreview {
  format: 'html'
  /** 번들에 실릴 페이지들. **순서가 곧 번들의 순서다.** */
  pages: ExportPagePlan[]
  /**
   * 둘 이상의 페이지가 든 타겟. **그 타겟을 겨눈 링크는 어디에도 안 생긴다** — 먼저 온
   * 것을 이기게 두면 조용히 첫 페이지로 가는데, 읽는 사람이 그것을 알아챌 방법이 없다.
   */
  duplicateTargets: string[]
  brokenLinks: ExportBrokenLink[]
  /** 그리지 못한 노드들. `title`이 **어느 페이지인지** 말한다. */
  errors: ExportNodeError[]
  /** 번들이 실은 테마(`"id@판"`) — 프로젝트가 고정한 판. 바인딩이 없거나 패키지를 못 읽었으면 `null`(기본 뷰 — 서버 README 「내보내기」). */
  themeId: string | null
  /** 바인딩은 있는데 서버가 패키지를 못 읽어 기본 뷰로 내보낸다는 한 줄. 정상이면 `null`. */
  themeWarning: string | null
  /** 내려받을 때 붙을 이름. **화면이 지어내지 않는다** — 두 벌이면 갈린다. */
  fileName: string
}

/**
 * PPTX의 미리보기.
 *
 * **`pages`는 HTML 갈래와 같은 모양이다** — 서버의 `ProjectPptx.pages`가 번들의 것과 같은
 * 값을 낸다. 나머지 셋은 **화면 이미지**에 대한 것이고 HTML 번들에는 없는 축이다.
 */
export interface PptxExportPreview {
  format: 'pptx'
  /** 슬라이드에 실릴 페이지들. **순서가 곧 슬라이드 차례다.** */
  pages: ExportPagePlan[]
  /**
   * **아무도 그리지 않은** 페이지 이름들. 그리는 자가 없으면 **전부**다.
   *
   * **`screenFailures`와 접지 마라** — *"아직 아무도 안 만들었다"*와 *"만들려다 실패했다"*가
   * 같은 말이 되면 화면이 거짓을 말한다(`services/export-pptx.ts`).
   */
  screenless: string[]
  /** **그리려다 죽은** 페이지들과 그 이유. `screenless`와 겹치지 않는다. */
  screenFailures: ExportScreenFailure[]
  /**
   * 그린 기계에 한글 글꼴이 없었다. 없으면 `null`이다.
   *
   * **이 값이 화면에 닿지 않으면 이유가 아무 데도 안 간다** — 브라우저나 글꼴이 없는
   * 서버에서 pptx를 내보내면 파일은 200으로 나오고 슬라이드는 *"화면 이미지가 실리지
   * 않았습니다"*만 말한다.
   */
  fontWarning: string | null
  /** 내려받을 때 붙을 이름. **화면이 지어내지 않는다** — 두 벌이면 갈린다. */
  fileName: string
}

/** 화면 이미지를 못 그린 페이지 하나와 그 이유. */
export interface ExportScreenFailure {
  /** 페이지의 번들 이름. **`pages[].title`·`screenless[]`와 같은 이름이다.** */
  title: string
  /** 사람이 읽을 한 줄. 브라우저가 낸 말이거나 서버가 정한 말이다. */
  reason: string
}

export interface ExportPagePlan {
  id: string
  title: string
  /**
   * 이 페이지를 가리키는 설계서 「상호작용」 「모델」의 타겟. **상호작용 탭의 페이지 고르개가 짓는 문자열과 같다** — 목록 밖이면
   * `페이지 경로` 칸에 그대로 적는다.
   */
  target: string
  /** 페이지의 종류 — 뿌리가 `Popup` 이면 `popup`. 없으면 화면(옛 서버). */
  kind?: 'page' | 'popup'
}

export interface ExportBrokenLink {
  target: string
  /** 그 타겟을 겨눈 페이지들의 제목. */
  from: string[]
  /** `missing`이면 그 타겟을 든 페이지가 없고, `ambiguous`면 둘 이상이다. */
  reason: 'missing' | 'ambiguous'
}

export interface ExportNodeError {
  /** 번들 안의 파일 경로. **화면은 이것을 짚지 않는다** — 아직 압축을 풀지 않은 사람에게 뜻이 없다. */
  path: string
  /** 그 페이지의 제목. */
  title: string
  error: { nodeId?: string; message?: string }
}

/**
 * 관리자 화면(`apps/web/src/admin/*`)이 읽는 `/api/admin` 응답 — 서버 README «계정 — 초대 · 비활성화 · 재설정 · 기록». 시각은 ISO 글자다.
 * 꼴의 정본은 서버(`apps/api/src/repos/users.ts` 의 `AdminUserRecord` · `repos/invites.ts` · `repos/admin-projects.ts` · `repos/admin-audit.ts`)다.
 */
export interface AdminUser {
  id: string
  email: string
  name: string
  isInstanceAdmin: boolean
  active: boolean
  createdAt: string
  /** 사용자 행과 살아 있는 세션의 마지막 접속 중 늦은 것 — 한 번도 안 들어왔으면 `null`. 세션이 지워져도 남는다. */
  lastSeenAt: string | null
  projectCount: number
  /** 들어온 초대 링크 — 시딩 · 서버 명령으로 만든 계정이면 `null`. */
  invite: { id: string; name: string } | null
}

export type InviteKind = 'single' | 'multi'
export type InviteState = 'usable' | 'expired' | 'revoked' | 'used-up'

/** 초대 링크 한 줄. **원문은 없다** — 원문은 만들기 응답(`CreatedInvite`) 하나에만 실린다. */
export interface AdminInvite {
  id: string
  name: string
  kind: InviteKind
  expiresAt: string
  state: InviteState
  signups: number
  createdAt: string
  createdBy: { id: string; name: string }
}

export interface CreatedInvite {
  invite: AdminInvite
  /** 링크 원문 — 이 응답에만 있다. 화면은 상태에만 두고 저장 · 주소 · 콘솔에 남기지 않는다(`admin/link-reveal.tsx`). */
  token: string
}

/** 재설정 링크 — 원문은 이 응답에만 있다(24 시간 · 한 번). */
export interface CreatedResetLink {
  token: string
  expiresAt: string
}

/** 관리자 › 프로젝트의 한 줄 — 관리자가 멤버가 아닌 프로젝트도 실린다(내용은 못 연다). */
export interface AdminProject {
  id: string
  name: string
  slug: string
  owners: { id: string; name: string; active: boolean }[]
  hasActiveOwner: boolean
  memberCount: number
  updatedAt: string
}

export type AuditAction =
  | 'invite.create'
  | 'invite.revoke'
  | 'invite.signup'
  | 'reset.create'
  | 'reset.use'
  | 'user.deactivate'
  | 'user.activate'
  | 'admin.grant'
  | 'admin.revoke'
  | 'project.owner'
  | 'theme.upload'
  | 'theme.hide'
  | 'theme.unhide'

export interface AuditEntry {
  id: string
  at: string
  action: AuditAction
  /** `cli` 는 서버 명령(`db/admin.ts`)이다. */
  actor: { kind: 'user'; id: string; name: string } | { kind: 'cli' }
  targetUser: { id: string; name: string; email: string } | null
  project: { id: string; name: string } | null
  invite: { id: string; name: string } | null
  detail: Record<string, string | number | boolean>
}

/** 기록 한 쪽 — `next` 는 다음 쪽의 `before` 다(없으면 끝). */
export interface AuditPage {
  entries: AuditEntry[]
  next: string | null
}

/** 기록 거름 — 둘 다 없으면 전부. `before` 는 앞 쪽의 `next`. */
export interface AuditQuery {
  action?: AuditAction
  actorId?: string
  before?: string
}
