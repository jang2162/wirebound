/**
 * 서버와 이야기하는 유일한 통로. **화면은 `fetch`를 직접 부르지 않고 이 인터페이스만
 * 본다** — 그래야 테스트가 가짜 구현을 끼워 넣을 수 있고, 경로·쿠키·에러 번역이 한
 * 곳에만 있다.
 *
 * 구현은 `http-client.ts`(실제 서버)와 각 화면 테스트의 가짜 두 부류다.
 */
import type { PatchOp } from '@wirebound/schema'
import type {
  MenuNode,
  PageDetail,
  PatchResult,
  ProjectDetail,
  RevisionSummary,
  SessionUser,
  TreeMenuNode,
} from './types'

export interface ApiClient {
  login(email: string, password: string): Promise<SessionUser>
  logout(): Promise<void>
  me(): Promise<SessionUser>
  /** 호출자가 속한 프로젝트 목록. 각 항목에 호출자의 `role`이 실려 온다. */
  listProjects(): Promise<ProjectDetail[]>
  getProject(projectId: string): Promise<ProjectDetail>
  /** 메뉴·페이지 통합 트리. 서버의 `{ menu }` 봉투는 구현이 벗겨 준다. */
  getTree(projectId: string): Promise<TreeMenuNode[]>
  /**
   * 메뉴 노드를 만든다. **`parentId: null`이 "루트에 만든다"이고 그것을 값으로 싣는다** —
   * 서버가 `z.uuid().nullable().optional()`로 받으므로 키를 빼는 것과 결과는 같지만,
   * 부르는 쪽의 뜻이 본문에서 사라지지 않게 한다.
   *
   * **응답을 트리에 그대로 꽂을 수 없다**(`MenuNode`에 `pages`·`children`이 없다). 부르는
   * 쪽은 성공하면 `getTree`를 다시 부른다(P2b-4 D1).
   */
  createMenu(projectId: string, body: { parentId: string | null; title: string }): Promise<MenuNode>
  /**
   * 메뉴 노드를 고친다. **준 키만 본문에 실린다.** 서버의 본문 스키마가 `z.strictObject`에
   * `.refine(빈 본문 금지)`까지 걸려 있어(`apps/api/src/routes/menu.ts`), 키를 만드는 방식이
   * 그대로 200과 400을 가른다.
   *
   * `parentId: null`은 **"루트로 옮긴다"**이고 키가 없는 것("부모를 바꾸지 않는다")과
   * 다르다 — 내어쓰기의 목적지가 루트 목록일 때 그 값이 나간다.
   */
  updateMenu(
    projectId: string,
    nodeId: string,
    body: { title?: string; parentId?: string | null; sortOrder?: number },
  ): Promise<MenuNode>
  /** 메뉴 노드를 지운다. **자식 메뉴·페이지가 있으면 서버가 409를 낸다**(README 엔드포인트 표). */
  deleteMenu(projectId: string, nodeId: string): Promise<void>
  /**
   * 페이지를 만든다. 서버가 빈 `Page` 문서를 기본 스키마로 채워 준다(README).
   *
   * **`description`을 싣지 않는다** — 설계 §9가 그 편집을 우측 패널의 "페이지 설명" 탭에
   * 두기로 했고, 트리에서 만드는 자리는 제목만 묻는다.
   */
  createPage(projectId: string, body: { menuNodeId: string; title: string }): Promise<PageDetail>
  /**
   * 페이지의 제목·소속 메뉴·순서를 고친다. `updateMenu`와 같은 계약이다 — 준 키만 실린다.
   *
   * **`description`·`schema`는 여기서 못 바꾼다**(전자는 이 단계 밖, 후자는 서버가
   * `PUT .../schema`·`PATCH .../ops`로만 받는다).
   */
  updatePage(
    projectId: string,
    pageId: string,
    body: { title?: string; menuNodeId?: string; sortOrder?: number },
  ): Promise<PageDetail>
  deletePage(projectId: string, pageId: string): Promise<void>
  getPage(projectId: string, pageId: string): Promise<PageDetail>
  /**
   * 편집 하나를 보낸다. **응답의 `seq`가 다음 호출의 `baseSeq`다**(README 4단계).
   *
   * **호출은 직렬화해야 한다** — README가 *"in-flight 요청은 항상 하나여야 한다 — 앞
   * 요청의 `seq`를 받아야 다음 `baseSeq`가 정해지기 때문이다. 어기면 두 번째 요청이
   * 409를 받는다"*라고 못박았다. 그 직렬화는 이 인터페이스가 아니라 부르는 쪽이 한다
   * (`edit/use-edit-commit.tsx`) — 여기서 큐를 들면 가짜를 끼우는 테스트마다 그 큐가
   * 함께 딸려 온다.
   *
   * `clientOpId`는 클라이언트가 붙이는 값이고 서버는 그대로 되돌려 준다. **다만 클라이언트는
   * 그 에코를 읽지 않는다** — ack는 보낸 요청의 id와 큐의 `[0]`을 맞춘다
   * (`store/edit-queue.ts`의 `PendingEdit.clientOpId`에 근거가 있다). 그래서
   * `PatchResult.clientOpId`는 지금 **읽는 자리가 없는 필드**다(이월 문서의 `ApiError.status`와
   * 같은 부류 — 계약에 있으니 타입에 두지만 소비자가 아직 없다).
   */
  patchOps(
    projectId: string,
    pageId: string,
    body: { baseSeq: number; ops: PatchOp[]; clientOpId?: string },
  ): Promise<PatchResult>
  /**
   * 이 페이지에서 **내가** 만든 revision. 새로고침 뒤 undo 스택을 복원하는 데 쓴다(D10).
   *
   * **응답은 `seq` 내림차순이고 여기서 뒤집지 않는다** — 스택으로 옮기는 자리가 그 순서를
   * 안다(`store/editor-store.ts`의 `restoreUndoStack`).
   *
   * **`limit`을 붙이지 않는다.** 서버 기본값 50이 설계 §7.3의 "최근 50개"와 같고,
   * **선언하지 않은 쿼리 키는 그 자체로 400이다**(README) — `mine` 외에는 아무것도 붙일 수 없다.
   */
  listMyRevisions(projectId: string, pageId: string): Promise<RevisionSummary[]>
}

/** 서버 에러 봉투의 `code`(README "에러 형식"). */
export type ApiErrorCode =
  | 'bad-request'
  | 'unauthenticated'
  | 'forbidden'
  | 'not-found'
  | 'conflict'
  | 'validation-failed'
  | 'internal'

/** 실패 응답에 실려 오는 개별 이슈. `code`·`nodeId`는 카탈로그 검증 실패에만 채워진다. */
export interface ApiErrorIssue {
  path: string
  message: string
  code?: string
  nodeId?: string | null
}

/**
 * 요청이 실패했을 때 클라이언트가 던지는 오류.
 *
 * **화면은 `status`가 아니라 `code`로 분기한다.** 서버는 "프로젝트가 없음"과
 * "멤버가 아님"을 일부러 구분하지 않고 둘 다 404로 낸다(설계 §10 — 다른 프로젝트의
 * 존재를 흘리지 않기 위해서다). HTTP 숫자로 분기하면 그 의도가 화면에서 깨진다.
 * `status`는 로그·디버깅용으로만 싣는다.
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: ApiErrorCode
  /** 항상 배열이다 — 서버가 키를 생략해도 `[]`다. 화면이 그냥 순회할 수 있어야 한다. */
  readonly issues: ApiErrorIssue[]

  constructor(status: number, code: ApiErrorCode, message: string, issues?: ApiErrorIssue[]) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.issues = issues ?? []
  }
}
