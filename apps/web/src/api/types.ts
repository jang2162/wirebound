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
