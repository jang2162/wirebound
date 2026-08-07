/**
 * 서버와 이야기하는 유일한 통로. **화면은 `fetch`를 직접 부르지 않고 이 인터페이스만
 * 본다** — 그래야 테스트가 가짜 구현을 끼워 넣을 수 있고, 경로·쿠키·에러 번역이 한
 * 곳에만 있다.
 *
 * 구현은 `http-client.ts`(실제 서버)와 각 화면 테스트의 가짜 두 부류다.
 */
import type { PatchOp } from '@wirebound/schema'
import type { PageDetail, PatchResult, ProjectDetail, SessionUser, TreeMenuNode } from './types'

export interface ApiClient {
  login(email: string, password: string): Promise<SessionUser>
  logout(): Promise<void>
  me(): Promise<SessionUser>
  /** 호출자가 속한 프로젝트 목록. 각 항목에 호출자의 `role`이 실려 온다. */
  listProjects(): Promise<ProjectDetail[]>
  getProject(projectId: string): Promise<ProjectDetail>
  /** 메뉴·페이지 통합 트리. 서버의 `{ menu }` 봉투는 구현이 벗겨 준다. */
  getTree(projectId: string): Promise<TreeMenuNode[]>
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
   * `clientOpId`는 클라이언트가 붙이는 값이고 서버는 그대로 되돌려 준다. pending 큐가
   * 그것으로 ack를 가른다.
   */
  patchOps(
    projectId: string,
    pageId: string,
    body: { baseSeq: number; ops: PatchOp[]; clientOpId?: string },
  ): Promise<PatchResult>
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
