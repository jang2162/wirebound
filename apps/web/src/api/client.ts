/**
 * 서버와 이야기하는 유일한 통로. **화면은 `fetch`를 직접 부르지 않고 이 인터페이스만
 * 본다** — 그래야 테스트가 가짜 구현을 끼워 넣을 수 있고, 경로·쿠키·에러 번역이 한
 * 곳에만 있다.
 *
 * 구현은 `http-client.ts`(실제 서버)와 각 화면 테스트의 가짜 두 부류다.
 */
import type { PatchOp, WbNode } from '@wirebound/schema'
import type {
  Comment,
  ExportFormat,
  ExportPreview,
  CommentCreated,
  MarkerChange,
  MenuNode,
  MyApiToken,
  ProjectMember,
  ProjectRole,
  PageDetail,
  PageImported,
  PatchResult,
  Preset,
  ProjectDetail,
  ProjectThemeView,
  ProjectView,
  RevisionInverse,
  SessionUser,
  RestoreResult,
  SnapshotSummary,
  ThemeImpact,
  ThemePackageSummary,
  ThemePackageUploaded,
  ThemePackageVersion,
  ThemeRef,
  TreeMenuNode,
} from './types'
import type { ThemeManifest } from '@wirebound/theme-sdk'

/**
 * 쓰기 하나에 얹는 선택. **`signal`** — 끊을지·언제 끊을지는 부르는 쪽이 정한다
 * (`panels/write-ledger.tsx`의 시간 제한). 지금 이것을 받는 것은 우측 패널의 쓰기 다섯(설명 ·
 * 코멘트 넷)이고, 그 장부가 잠금을 쥐는 쓰기들이다.
 *
 * **끊겨도 서버는 끝낼 수 있다** — 끊는 것은 이 브라우저가 응답을 더 기다리지 않는다는 뜻이지
 * 서버가 안 썼다는 뜻이 아니다(그 장부의 머리말에 실측이 있다).
 *
 * **`connectionId`** — 이 쓰기를 **낸** 연결(`x-wb-connection-id`). 없으면 **지금** 연결이다
 * (`createHttpClient`의 둘째 인자). 받는 것은 게시의 같은 키 재전송 하나다 — 다시 보낸 것은 같은 요청이라
 * 첫 보내기의 연결을 싣는다(`panels/comment-panel.tsx`의 `submit`). 지금 연결을 실으면 그 사이 셸이
 * 바뀌었을 때 서버가 **새 셸의** 연결을 방송에서 빼서 번호가 새 셸에 안 선다.
 */
export interface WriteOptions {
  readonly signal?: AbortSignal
  readonly connectionId?: string
}

/**
 * 복원 하나에 얹는 선택. **`clientRestoreId`** — 이 탭이 지은 그 복원의 id(`x-wb-restore-id`). 서버가 그 복원의 `restored` 신호에 되돌려 주어,
 * 답이 오기 전 · 답을 잃은 뒤에 온 신호를 이 탭이 알아본다(`store/editor-store.ts`의 `markRestored`).
 */
export interface RestoreOptions {
  readonly clientRestoreId?: string
}

/**
 * 읽기 하나에 얹는 선택. **신호가 둘이고 뜻이 다르다** — 누가 시간을 재는가가 갈린다.
 *
 * - **`signal`** — **판정용 다시 읽기**(`panels/write-ledger.tsx`의 `race`)가 싣는다. 부른 쪽이 제 시간 제한으로
 *   끊으므로 **여기서는 시간을 안 건다** — 두 시계가 한 요청을 다투지 않게(`http-client.ts`의 `READ_DEADLINE_MS`).
 * - **`cancel`** — **조회 이펙트**가 싣는다. 정리(떠남)가 끊는다 — 떠난 방문의 조회가 브라우저 연결을 쥐고
 *   있지 않게(`http-client.ts`의 `READ_DEADLINE_MS` «떠난 조회는 끊는다»). **시간은 여전히 여기서
 *   잰다**(일반 읽기의 10초) — 끊겼으면 다시 보내지 않는다. 끊긴 조회의 거절은 아무에게도 안 보인다(부른 쪽이
 *   `alive`로 버린다).
 */
export interface ReadOptions {
  readonly signal?: AbortSignal
  readonly cancel?: AbortSignal
}

export interface ApiClient {
  login(email: string, password: string): Promise<SessionUser>
  logout(): Promise<void>
  /** `cancel`은 세션 문맥이 내려가면 끊는다(`session/session-context.tsx`). */
  me(options?: ReadOptions): Promise<SessionUser>
  /** 호출자가 속한 프로젝트 목록. 각 항목에 호출자의 `role`이 실려 온다. */
  listProjects(): Promise<ProjectDetail[]>
  /**
   * **로그인한 사람의 API 토큰 전부** — 멤버가 아닌 프로젝트의 것도 든다(`account/tokens-section.tsx`). 세션으로만 부른다(서버가
   * 토큰 요청에 401).
   */
  listMyTokens(): Promise<MyApiToken[]>
  /** 토큰 하나를 폐기한다 — 어느 프로젝트의 것이든. 없거나 남의 것이면 404 다. */
  revokeMyToken(tokenId: string): Promise<void>
  /** 내 토큰 전부를 폐기하고 지운 수를 낸다. */
  revokeAllMyTokens(): Promise<{ revoked: number }>
  /**
   * 로그인한 사람의 비밀번호를 바꾼다(`account/password-section.tsx`). 성공하면 이 세션만 남고 다른 세션은 끝난다. **지금 비밀번호가
   * 틀리면 401 `unauthenticated` + 이슈 코드 `wrong-password`** — 세션은 그대로라 받는 쪽이 «세션 끝»(`api/failure.tsx`의
   * `toFailure`)과 가른다(`WRONG_PASSWORD`). 한도에 닿으면 429 `rate-limited`(서버 README «로그인 시도 제한»).
   */
  changePassword(currentPassword: string, newPassword: string): Promise<void>
  /** 프로젝트 멤버 목록 — 초대한 차례(viewer 부터 부른다). 설정 페이지의 멤버 절(`settings/members-section.tsx`)이 부른다. */
  listMembers(projectId: string, options?: ReadOptions): Promise<ProjectMember[]>
  /** 이미 계정이 있는 사람을 초대한다(owner). 없는 계정 404 · 이미 멤버 409 — 문장은 서버 봉투다. */
  addMember(projectId: string, email: string, role: ProjectRole): Promise<ProjectMember>
  /** 멤버의 역할을 바꾼다(owner). 마지막 owner 의 강등은 409 · 이미 빠진 멤버는 404. */
  updateMemberRole(projectId: string, userId: string, role: ProjectRole): Promise<ProjectMember>
  /** 멤버를 뺀다(owner). 그 사람의 그 프로젝트 토큰도 함께 지워진다(서버). 마지막 owner 는 409 · 이미 빠졌으면 404. */
  removeMember(projectId: string, userId: string): Promise<void>
  /**
   * `cancel`은 셸을 떠나면 끊는다(`routes/editor.tsx`의 첫 조회 · `reread`). 응답의 `themeRev` 는 셸의 다시 읽기가 테마를 따라잡는 데
   * 쓴다(`ProjectView`).
   */
  getProject(projectId: string, options?: ReadOptions): Promise<ProjectView>
  /**
   * 프로젝트를 만든다. **부른 사람이 owner가 된다**(서버가 같은 트랜잭션에서
   * `project_members`에 넣는다 — `repos/projects.ts`).
   *
   * **응답이 `ProjectDetail`이다 — `role: "owner"`까지 실려 와 목록 항목과 모양이 같다.**
   * 그 근거는 `api/types.ts`의 `ProjectDetail` 주석에 실측 표로 있다.
   *
   * **그래도 응답을 목록에 그대로 꽂지 않는다.** 되돌릴 것이 목록 하나뿐이라
   * undo가 없고, 성공하면 목록을 다시 받는 편이 곧 수렴이기 때문이다. **모양이 같다는
   * 것이 그 판단을 뒤집지는 않는다** — 뒤집는다면 그것은 이 층이 아니라 목록 화면의
   * 판단이다.
   *
   * **나가는 본문에는 서버가 선언한 세 키만 담긴다**(`http-client.ts`의 `declaredOnly` +
   * `BODY_KEYS.createProject`).
   * 두 가지가 그 안에서 갈린다:
   *
   * - **`description`을 주지 않으면 그 키를 만들지 않는다.** `undefined`를 실은 키가
   *   통과하는 것은 `JSON.stringify`가 지워 주는 우연이라 그것에 기대지 않는다.
   *   **`null`은 다르다 — "설명 없음"이라는 값이고 그대로 싣는다**(서버가
   *   `z.string().max(2000).nullable().optional()`로 받는다).
   * - **선언되지 않은 키는 떨어져 나간다.** 서버의 `CreateProjectBody`가 `z.strictObject`라
   *   그런 키는 그 자체로 400이다 — **응답 객체를 그대로 되보내는 것이 그 경로다**(실측:
   *   `{id,name,slug,description,role}`을 보내면 `400 인식할 수 없는 키: "id", "role"`).
   *   **타입이 그것을 막지 못한다** — 스프레드 리터럴(`{ ...project }`)은 초과 속성 검사에
   *   걸리지 않는다(`declaredOnly` 머리말의 `tsc` 프로브 표).
   *
   * **슬러그 형식을 클라이언트가 다시 보지 않는다.** 서버가 400과 함께 문장을 주고,
   * 중복은 409다 — 규칙을 두 곳에 두면 어긋난다. **다만 그 문장이 무엇이 틀렸는지 다
   * 말해 주지는 않는다:** 형식·길이·빈 문자열이 **전부 같은 한 문장**이다(실측 —
   * `a`×65·`""`·`Abc`·`-abc`·`가나`가 모두 400 `"슬러그는 소문자·숫자·하이픈만 쓸 수 있고,
   * 하이픈으로 시작하거나 끝날 수 없습니다"`. `a`×64는 201이다). **길이 초과에서는 그
   * 문장이 원인을 설명하지 못한다** — 화면이 그 한계를 안고 간다.
   */
  createProject(body: {
    name: string
    slug: string
    description?: string | null
  }): Promise<ProjectDetail>
  /**
   * 프로젝트의 이름·슬러그·설명을 고친다. **owner만 부를 수 있다** — 그보다 낮은 멤버는
   * 403, 멤버가 아니면 404다(실측은 `projects/project-actions.ts` 머리말에 있다).
   *
   * `updateMenu`·`updatePage`와 같은 계약이다: **준 키만 실리고, 남은 키가 없으면 그
   * 자리에서 던진다.** 서버가 같은 본문에 400을 낸다(실측: `PATCH /projects/:id {}` →
   * `bad-request` / `변경할 값이 없습니다`).
   *
   * **`createProject`와 같이 선언된 세 키만 실린다** — 응답 객체를 그대로 넘겨도 `id`·`role`이
   * 나가지 않는다(그쪽 주석의 실측). **그 둘만 담긴 본문을 넘기면 "바꿀 내용이 없다"로
   * 그 자리에서 거절된다** — 미선언 키를 먼저 떨어낸 뒤에 남은 키를 세기 때문이다.
   *
   * `description: null`은 **"설명을 지운다"**이고 키가 없는 것("설명을 바꾸지 않는다")과
   * 다르다 — `updateMenu`의 `parentId: null`과 같은 자리다.
   */
  updateProject(
    projectId: string,
    body: { name?: string; slug?: string; description?: string | null },
  ): Promise<ProjectDetail>
  /**
   * 프로젝트를 지운다. **owner만 부를 수 있다.**
   *
   * **서버가 아무것도 막지 않는다** — 메뉴 삭제가 자식이 있으면 409를 내는 것과 다르다.
   * 딸린 것이 함께 사라지는 범위는 `projects/delete-confirm.tsx`의 머리말이 적는다.
   */
  deleteProject(projectId: string): Promise<void>
  /**
   * 메뉴·페이지 통합 트리. 서버의 `{ menu }` 봉투는 구현이 벗겨 준다. `options.signal`은 **판정용 다시 읽기**가 싣는다 —
   * 트리 이름 변경의 «모름»(`tree/use-tree-commands.tsx`의 `rename` · `ReadOptions`의 머리말).
   */
  getTree(projectId: string, options?: ReadOptions): Promise<TreeMenuNode[]>
  /**
   * 메뉴 노드를 만든다. **`parentId: null`이 "루트에 만든다"이고 그것을 값으로 싣는다.**
   *
   * 서버는 그 필드를 `z.uuid().nullable().optional()`로 받아 `body.parentId ?? null`로
   * 쓴다(`apps/api/src/routes/menu.ts`). **실측**(api 하네스, 루트에 둘을 깔아 둔 뒤 두 본문을
   * 실제로 보냈다): 키를 뺀 것과 `parentId: null`을 실은 것이 **같은 곳(루트 맨 뒤)**에
   * 만들어진다 — 루트 배치가 `[기존1:0, 기존2:1, 키없음:2, 널명시:3]`이고 둘 다
   * `parentId: null`로 응답한다.
   *
   * **그래도 값으로 싣는다.** 결과가 같아도 부르는 쪽의 뜻이 본문에서 사라지지 않게 하려는
   * 것이고, `updateMenu`의 `parentId: null`(내어쓰기로 루트에 보낸다)과 같은 모양이어야 한다.
   *
   * **응답을 트리에 그대로 꽂을 수 없다**(`MenuNode`에 `pages`·`children`이 없다). 부르는
   * 쪽은 성공하면 `getTree`를 다시 부른다.
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
    body: {
      title?: string
      parentId?: string | null
      sortOrder?: number
      /**
       * **고치기 전 제목**(메뉴 제목의 충돌 모델). 주면 서버가 지금 제목과 견주고, 다르면 409 · 이슈 코드
       * `menu-title-changed` · 지금 제목(`current`)이다. 안 주면 나중이 이긴다. 읽는 법은 `api/page-meta.ts`가 소유한다 —
       * 페이지 메타와 같은 함수다.
       */
      base?: { title?: string }
    },
    options?: WriteOptions,
  ): Promise<MenuNode>
  /**
   * 메뉴 노드를 지운다. **자식 메뉴·페이지가 있으면 서버가 409를 낸다.**
   *
   * **실측**(api 하네스): 자식 메뉴만 있는 메뉴와 페이지만 있는 메뉴가 **둘 다** 409이고
   * 코드·문장이 같다(`conflict` / `하위 메뉴나 페이지가 있어 삭제할 수 없습니다`).
   * 둘 다 없으면 204다. `tree/tree-actions.ts`의 `remove`가 두 배열을 다 보는 근거다.
   */
  deleteMenu(projectId: string, nodeId: string): Promise<void>
  /**
   * 페이지를 만든다. 서버가 빈 `Page` 문서를 기본 스키마로 채워 준다(README).
   *
   * **`description`을 싣지 않는다** — 설계서 「설계서 화면 구조」가 그 편집을 우측 패널의 "페이지 설명" 탭에
   * 두기로 했고, 트리에서 만드는 자리는 제목만 묻는다.
   */
  createPage(projectId: string, body: { menuNodeId: string; title: string }): Promise<PageDetail>
  /**
   * 페이지의 제목·설명·소속 메뉴·순서를 고친다. `updateMenu`와 같은 계약이다 — 준 키만 실린다.
   *
   * **`schema`는 여기서 못 바꾼다** — 서버가 `PUT .../schema`·`PATCH .../ops`로만 받는다.
   *
   * ## `description`을 이 층에서 막을 수 있는 자리는 둘이다
   *
   * 서버는 `description`을 받는다 — `routes/pages.ts`의 `UpdatePageBody`가 받고
   * `repos/pages.ts`의 `updatePage`가 쓴다. 이 층에서 그 키를 막을 수 있는 자리는 **여기
   * 시그니처와 `http-client.ts`의 `BODY_KEYS.updatePage` 화이트리스트** 둘이고, 후자에서 빠지면
   * `declaredOnly`가 그 키를 떨궈 낸다(무엇이 보이는지는 그 줄의 주석).
   *
   * **실측**(api 하네스, `projectGuard('editor')`):
   *
   * | 보낸 것 | 결과 |
   * |---|---|
   * | `{description:'설명'}` | 200, 되읽으면 그대로 |
   * | `{description:null}` | 200, `null` — *"설명을 지운다"* |
   * | `{description:''}` | 200, `""` — **빈 문자열은 `null`로 접히지 않는다** |
   * | `{description:'a'×2000}` | 200 |
   * | `{description:'a'×2001}` · `{description:'가'×2001}` | 400 `"설명은 2000자 이하여야 합니다"` |
   * | `{description:'a\x00b'}`(NUL) | 400 `"페이지 제목·설명에 NUL 문자(U+0000)를 포함할 수 없습니다"` — 아래 |
   * | viewer가 보냄 | 403 |
   * | **남이 그 페이지의 노드를 잠근 동안** | **200** |
   *
   * ### NUL은 400이다 — 서버가 판정하고 문장을 준다
   *
   * `description`도 `title`도 NUL(`U+0000`)이 들어가면 400이고 봉투의 문장이 이유다(`POST .../pages`·`importPage`도
   * 같은 문장이다). 어느 텍스트 칸이 그 판정을 지나는지는 `apps/api` 의 `src/db/nul-guard.ts` `NulByteError` 머리말이
   * 소유하고, 칸마다 HTTP 로 재는 것은 `apps/api/test/nul-text-inputs.test.ts` 다.
   *
   * **화면은 이 갈래를 다시 판정하지 않는다.** `toFailure`가 봉투의 문장을 그대로 보인다(`issues`가 없는 400 —
   * `api/failure.tsx`의 `reason`) — 화면이 NUL을 미리 막으면 서버와 규칙이 두 벌이 된다.
   *
   * **잠금이 이 경로를 안 본다**(실측). 소프트 잠금(설계서 「소프트 잠금」)의 `findLockConflict`는 **문서 안 포인터**를
   * 보는데 `pages.description`은 문서 밖 컬럼이라, 이 라우트는 `lockConflictError`를 아예
   * 지나지 않는다. `title` 갱신도 같다. **그래서 화면이 잠금을 판정하지 않는다** — 없는
   * 실패를 화면이 지어내면 그것이 곧 두 번째 판정이다.
   *
   * `description: null`은 **"설명을 지운다"**이고 키가 없는 것("설명을 바꾸지 않는다")과
   * 다르다 — `updateMenu`의 `parentId: null`과 같은 자리다.
   */
  updatePage(
    projectId: string,
    pageId: string,
    body: {
      title?: string
      description?: string | null
      menuNodeId?: string
      sortOrder?: number
      /**
       * **고치기 전 값**(페이지 메타의 충돌 모델). 주면 서버가 지금 값과 견주고, 다르면 409 · 이슈 코드
       * `page-meta-changed` · 칸마다 지금 값(`current`)이다. 안 주면 나중이 이긴다. 무엇을 싣고 409 를 어떻게 읽는지는
       * `api/page-meta.ts`가 소유한다.
       */
      base?: { title?: string; description?: string | null }
    },
    options?: WriteOptions,
  ): Promise<PageDetail>
  deletePage(projectId: string, pageId: string): Promise<void>
  /**
   * **페이지 JSON 파일 한 벌로 새 페이지를 만든다**(설계서 「페이지 JSON」). **덮지 않는다** —
   * `menuNodeId`가 가리키는 메뉴의 맨 끝에 붙는다.
   *
   * `file`이 봉투 전체다. **화면이 보내기 전에 서버와 같은 게이트 셋을 지난다** —
   * 봉투(`readPageJson`) · 문서 버전(`migrateDocument`) · 카탈로그(`validatePage`)이고
   * 셋 다 `@wirebound/schema`의 같은 함수다(`panels/page-json-panel.tsx`의
   * `previewPageJson`).
   *
   * **그래도 서버만 아는 것이 남는다** — 대상 메뉴가 아직 있는지 · NUL · 본문 크기 ·
   * 권한, 그리고 배포 편차. 아래 표의 실패는 **미리보기를 지나고도 올 수 있다.**
   *
   * > **"화면이 통과시킨 파일을 서버가 다른 이유로 거절하는 일은 없다"고 적지 마라** —
   * > 위의 서버만 아는 것 때문에 거짓이다.
   *
   * `title`은 파일의 제목을 덮는다. **없으면 키를 만들지 않는다** — 페이지 제목에 유일
   * 제약이 없어 같은 파일을 두 번 가져오면 같은 이름 둘이 생기고, 그것을 가르는 것이
   * 이 필드다.
   *
   * | 실패 | 코드 | 무엇 |
   * |---|---|---|
   * | 봉투 위반 · 모르는 `wireboundVersion` · 지원하지 않는 문서 버전 · NUL | `bad-request`(400) | `issues[].path`가 **파일의 자리**를 가리킨다 |
   * | 없는 메뉴 노드 | `not-found`(404) | |
   * | 카탈로그 **오류** | `validation-failed`(422) | `issues[].nodeId`가 **파일의 노드 id**다 |
   *
   * **어느 갈래에서 끊기든 아무것도 만들어지지 않는다** — 서버가 한 트랜잭션으로 묶는다.
   */
  importPage(
    projectId: string,
    body: { menuNodeId: string; file: unknown; title?: string },
  ): Promise<PageImported>
  getPage(projectId: string, pageId: string, options?: ReadOptions): Promise<PageDetail>
  /**
   * 편집 하나를 보낸다. **응답의 `seq`가 다음 호출의 `baseSeq`다**(`apps/api/README.md` 「편집
   * 파이프라인」의 4단계).
   *
   * **호출은 직렬화해야 한다** — 같은 절이 *"in-flight 요청은 항상 하나여야 한다 — 앞
   * 요청의 `seq`를 받아야 다음 `baseSeq`가 정해지기 때문이다. 어기면 두 번째 요청이
   * 409를 받는다"*라고 못박았다. 그 직렬화는 이 인터페이스가 아니라 부르는 쪽이 한다
   * (`edit/use-edit-commit.tsx`) — 여기서 큐를 들면 가짜를 끼우는 테스트마다 그 큐가
   * 함께 딸려 온다.
   *
   * `clientOpId`는 클라이언트가 붙이는 값이고 서버는 그대로 되돌려 준다. **다만 ack가 그 에코를
   * 쓰지 않는다** — 보낸 요청의 id와 큐의 `[0]`을 맞춘다(`store/edit-queue.ts`의
   * `PendingEdit.clientOpId`에 근거가 있다). 즉 `PatchResult.clientOpId`는 **계약에 있으니 타입에
   * 두지만 ack의 판정에는 쓰이지 않는 필드**다(`ApiError.status`와 같은 부류).
   *
   * **"소비자가 아직 없다"로 적지 않는다** — 그 형태는 호출부가 생기는 순간 저절로 낡는다
   * (호출부는 `test/api-consumers.test.ts`가 실행으로 센다). 위 문장은 **무엇이 무엇을 쓰는가**를 말하므로
   * 소비자가 생겨도 거짓이 되지 않는다.
   */
  patchOps(
    projectId: string,
    pageId: string,
    body: { baseSeq: number; ops: PatchOp[]; clientOpId?: string },
  ): Promise<PatchResult>
  /**
   * 이 페이지에서 **내가** 만든 revision. 새로고침 뒤 undo 스택을 복원하는 데 쓴다. `inverse`만 싣는다(`RevisionInverse`).
   *
   * **응답은 `seq` 내림차순이고 여기서 뒤집지 않는다** — 스택으로 옮기는 자리가 그 순서를
   * 안다(`store/editor-store.ts`의 `restoreUndoStack`).
   *
   * **`limit`을 붙이지 않는다.** 서버 기본값 50이 설계서 「개인 undo/redo」의 "최근 50개"와 같다. 선언하지 않은 쿼리 키는
   * 그 자체로 400이다(README) — 캐시 버스터도 못 붙인다.
   */
  listMyRevisions(projectId: string, pageId: string, options?: ReadOptions): Promise<RevisionInverse[]>
  /**
   * 이 페이지의 revision 가운데 `seq < beforeSeq`인 것 — **누가 냈든** 최신순으로 `limit`개(서버 상한 200). 새로고침으로 채운 되돌리기가
   * 내 revision 사이에 낀 남의 revision 을 받아 거꾸로 되짚는 데 쓴다(`store/editor-store.ts`의 `undoHistoryNeed`). `inverse`만 싣는다(`RevisionInverse`).
   */
  listRevisionsBefore(
    projectId: string,
    pageId: string,
    range: { beforeSeq: number; limit: number },
    options?: ReadOptions,
  ): Promise<RevisionInverse[]>
  /**
   * 이 페이지의 코멘트 전부. **선택한 노드의 것만이 아니다** — 「설계서 화면 구조」의 우측
   * 목록이 *"① 검색폼 - … / ② 목록 - …"*로 **전부**를 보인다.
   *
   * **번호 순이 아니라 `createdAt` 오름차순으로 온다.** 서버는 번호를 모른다(번호는
   * 문서의 값이다). 번호로 묶고 늘어놓는 것은 문서를 든 화면의 일이다.
   *
   * `viewer`도 읽는다 — 막는 것은 쓰기 넷이다(「권한 모델」).
   */
  listComments(projectId: string, pageId: string, options?: ReadOptions): Promise<Comment[]>
  /**
   * 코멘트를 단다. **그 노드에 번호가 없으면 서버가 번호를 붙이고 revision을 남긴다**
   * (`marker`는 페이지 문서의 값이므로 편집 파이프라인을 지나야 한다).
   *
   * **`markerOps`를 화면이 자기 문서에 적용해야 한다.** 그러지 않으면 캔버스에 번호가
   * 뜨지 않고 `headSeq`가 서버보다 뒤처져 다음 편집이 409를 받는다. 그 적용은
   * `EditorStore.applyMarkerChange` 하나가 한다.
   *
   * **문서에 없는 노드는 404다.** 본문은 1~2000자이고 그 밖은 400이다.
   * **그 사이 남이 페이지를 고쳐도 409 가 아니다** — 서버가 잠근 뒤의 문서로 번호를 매긴다(`apps/api/README.md`
   * 「코멘트와 번호」). 응답의 `seq`는 이 화면이 아직 못 받은 revision 뒤의 것일 수 있다 — `applyMarkerChange`가 그 사이
   * 프레임을 기다렸다 얹는다.
   *
   * **`idempotencyKey`** — 같은 (페이지, 작성자, 키)로 이미 달렸으면 서버가 **그 행을 200 으로**
   * 돌려준다(새 행·새 번호가 없고 `markerOps: []`). 같은 키에 다른 글이면 409 다. 계약은
   * `apps/api/README.md`의 «멱등 키», 화면이 키를 어디에 드는지는 `panels/comment-panel.tsx`의
   * `POST_KEYS`가 갖는다.
   */
  createComment(
    projectId: string,
    pageId: string,
    body: { nodeId: string; body: string; idempotencyKey?: string },
    options?: WriteOptions,
  ): Promise<CommentCreated>
  /**
   * 본문을 고친다. **작성자만 부를 수 있다** — 남의 것이면 403이다(남의 이름이 붙은 채 내용이 바뀌면 말을 지어내는 일이 된다).
   *
   * **문서를 안 바꾸므로 `seq`가 없다.** 응답은 코멘트 하나뿐이다.
   */
  updateComment(
    projectId: string,
    pageId: string,
    commentId: string,
    body: { body: string },
    options?: WriteOptions,
  ): Promise<Comment>
  /**
   * 코멘트를 지운다. **그 노드의 마지막이었으면 번호도 함께 사라진다**(설계서 「페이지 스키마 노드」의
   * *"없으면 코멘트 없음"*) — 그때 `markerOps`에 `remove`가 실려 온다.
   *
   * **204가 아니라 200에 본문이 온다** — 다른 `DELETE` 셋과 갈리는 이유는 이것이 문서를
   * 바꿀 수 있기 때문이다. **남의 코멘트도 지울 수 있다**(수정과 갈린다).
   */
  deleteComment(projectId: string, pageId: string, commentId: string, options?: WriteOptions): Promise<MarkerChange>
  /**
   * **문서 순서대로 재번호**(「설계서 화면 구조」의 버튼). 번호가 **있는** 노드만 1부터 다시 매긴다 —
   * 번호가 없는 노드에 새로 주지 않는다.
   *
   * **한 revision이다.** 노드마다 따로 부르면 중간 상태에 번호가 겹친다.
   * 바꿀 것이 없으면 `markerOps: []`이고 문서도 revision도 안 건드린다.
   */
  renumberComments(projectId: string, pageId: string, options?: WriteOptions): Promise<MarkerChange>
  /**
   * 이 프로젝트의 스냅샷 전부. **최근 것이 먼저** 오고 동률이면 태그 순이다 —
   * 순서가 서버의 계약이므로 여기서 다시 정렬하지 않는다 — 두 자리에서 정렬하면 갈릴 수 있다.
   *
   * **`payload`가 실려 오지 않는다** — 목록이 payload 전부를 나르면 프로젝트가
   * 커질수록 목록만으로 무거워진다. 크기(`payloadBytes`)만 온다.
   *
   * `viewer`도 읽는다 — 막는 것은 생성 하나다(「권한 모델」).
   */
  /**
   * **이 프로젝트에서 고를 수 있는 프리셋 전부**(설계서 「페이지 프리셋」). 내장 3종이 먼저 오고
   * 프로젝트 프리셋이 만든 순서대로 뒤에 붙는다 — **순서가 서버의 계약이므로 여기서 다시
   * 정렬하지 않는다**(스냅샷 목록과 같은 판단).
   *
   * **프로젝트 프리셋이 하나도 없는 것이 기본 상태다.** 그때도 응답이 비지 않는다.
   */
  listPresets(projectId: string, options?: ReadOptions): Promise<Preset[]>
  /**
   * **지금 페이지를 프리셋으로 남긴다**(「페이지 프리셋」). `nodes`는 root의 `children`이지 문서
   * 봉투가 아니다.
   *
   * **`marker`는 서버가 버린다** — 화면이 미리 지우지 않는 것은 그 규칙의 자리가
   * 하나여야 하기 때문이다. 응답의 `nodes`에는 이미 없다.
   *
   * 이름 1~60자·설명 0~2000자 밖은 400이고, **이름 중복은 오류가 아니다.**
   */
  createPreset(
    projectId: string,
    body: { name: string; description?: string | null; schema: WbNode[] },
  ): Promise<Preset>
  listSnapshots(projectId: string): Promise<SnapshotSummary[]>
  /**
   * **지금 상태를 태그 하나로 얼린다.** 「권한 모델」이 **editor**에게 연 자리다 — 테마 고르기가
   * owner인 것과 갈리는 이유는 스냅샷이 **아무것도 바꾸지 않기** 때문이다.
   *
   * **409가 둘이고 서로 다른 문장이 온다.** 코드는 둘 다 `conflict`이라 화면은 `code`로
   * 가를 수 없다:
   *
   * | 사유 | 서버 문장 | 사용자가 할 일 |
   * |---|---|---|
   * | 태그 중복 | *"같은 태그의 스냅샷이 이미 있습니다"* | 이름을 바꾼다 |
   * | 수집 중 프로젝트 변경 | *"스냅샷을 뜨는 동안 프로젝트가 바뀌었습니다. 다시 시도해 주세요"* | 그대로 다시 보낸다 |
   *
   * 태그는 1~60자, 설명은 0~2000자이고 그 밖은 400이다. NUL(U+0000)도 400이다.
   *
   * **응답이 목록 항목보다 넓다**(`payload`가 붙는다). 그래도 `SnapshotSummary`로 받는 것은
   * **이 화면이 그것을 읽지 않기** 때문이다 — 저장하면 목록을 다시 받는다(`createProject`가
   * 응답을 목록에 그대로 꽂지 않는 것과 같은 판단이고, 근거도 같다: 되돌릴 것이 목록
   * 하나뿐이라 다시 받는 편이 곧 수렴이다).
   */
  createSnapshot(projectId: string, body: { tag: string; description?: string | null }): Promise<SnapshotSummary>
  /**
   * **그때로 되돌린다.** 「권한 모델」이 **owner**에게만 연 자리다 — 생성이 editor까지 열린 것과
   * 갈리는 이유는 복원이 **프로젝트 전체를 바꾸기** 때문이다.
   *
   * **본문이 없다.** 되돌릴 대상은 주소가 다 말하고, 복원 직전 상태를 담는 안전망 스냅샷의
   * 태그는 서버가 짓는다.
   *
   * **되돌릴 수 없는 조작은 아니다** — 서버가 복원 **직전** 상태를 스냅샷으로 떠서
   * `safetySnapshot`으로 돌려준다. 그것으로 다시 복원하면 되돌아간다.
   *
   * **실패가 여덟 갈래이고 코드로는 넷으로만 갈린다**(서버 README "복원의 오류 표"). 화면은
   * `code`로 가를 수 없으므로 **서버 문장을 그대로 그린다**:
   *
   * | 코드 | 갈래 | 사용자가 할 일 |
   * |---|---|---|
   * | `conflict`(409) | 지문 불일치 · 안전망 태그 중복 | 그대로 다시 보낸다 |
   * | `conflict`(409) | 레이아웃 불일치 · 코멘트 작성자 없음 | 프로젝트를 고쳐야 한다 |
   * | `bad-request`(400) | 모르는 payload 형식 · 미지원 문서 버전 · 끊긴 참조 | 그 스냅샷으로는 못 한다 |
   * | `validation-failed`(422) | 되살릴 페이지의 문서가 카탈로그 검증에 걸렸다 | 〃 |
   * | `not-found`(404) | 없는 스냅샷 | 목록을 다시 받는다 |
   *
   * **어느 갈래에서 끊기든 아무것도 바뀌지 않는다** — 서버가 한 트랜잭션으로 묶는다.
   */
  restoreSnapshot(projectId: string, snapshotId: string, options?: RestoreOptions): Promise<RestoreResult>
  /**
   * **내려받기 전에 화면이 말할 것**(설계서 「HTML 정적 번들」). 번들을 실제로 만들어 보고 그 결과를
   * 값으로 낸다 — 그래서 **싸지 않다.** 화면을 열 때가 아니라 사람이 내보내기를 누를 때
   * 부른다.
   *
   * **페이지가 하나도 없으면 409다.** 빈 번들을 내면 받는 사람이 푼 뒤에야 비었다는 것을
   * 안다.
   *
   * **시간 제한은 없고 `cancel`은 듣는다** — 패널이 닫히거나 다시 부르면 끊는다(`shell/export-panel.tsx`의 `load`).
   */
  getExportPreview(
    projectId: string,
    format: ExportFormat,
    options?: Pick<ReadOptions, 'cancel'>,
  ): Promise<ExportPreview>
  /**
   * 파일(zip 또는 pptx)을 **받아 온다** — 화면이 저장은 따로 한다(`shell/export-panel.tsx`의 `DownloadButton`).
   *
   * **앵커(`<a download href>`)로 받지 않는 이유:** 앵커의 실패는 브라우저의 내려받기 목록에서만 `canceled`로 끝나고 화면은
   * 그 사실을 모른다 — 503(밀려 있다) · 409(페이지가 없다) · 401 을 사람이 못 듣는다. 받아 온 뒤 저장하면 실패가 다른
   * 요청처럼 `ApiError`로 온다. **대가:** 파일이 저장되기 전에 한 벌 통째로 브라우저에 든다(값은 그 파일의 머리말).
   *
   * **`format`에 기본값을 두지 않는다.** 서버는 기본이 `html`이지만(형식 없이 부르는 URL이
   * 계속 zip을 받아야 한다) **이쪽에서 생략을 허용하면** 형식을 고를 줄 아는
   * 화면이 그 인자를 빠뜨렸을 때 *"pptx를 보고 zip을 받는"* 상태가 조용히 선다. 필수로
   * 두면 타입 검사가 모든 호출부에서 그것을 묻는다.
   *
   * **시간 제한은 없고 `cancel`은 듣는다** — `getExportPreview`와 같다.
   */
  downloadExport(projectId: string, format: ExportFormat, options?: Pick<ReadOptions, 'cancel'>): Promise<Blob>
  /** 프로젝트가 고정한 테마 · 토큰 · manifest(viewer 이상). 에디터 셸과 설정 페이지가 부른다. */
  getProjectTheme(projectId: string, options?: ReadOptions): Promise<ProjectThemeView>
  /**
   * 테마 · 판 · 토큰을 저장한다(owner). `rev` 가 서버 값과 다르면 409 이고 서버의 지금 값이 `ApiError.current` 에 실린다. 숨긴 판으로
   * 새로 바꾸면 422 `hidden-version`, 토큰 값이 규격 밖이면 422 에 `issues[].path` 가 `tokens.<키>` 다.
   */
  putProjectTheme(
    projectId: string,
    body: { themeId: string; version: string; tokens: Record<string, string | number>; rev: number },
  ): Promise<ProjectThemeView>
  /** 그 판으로 바꾸면 무엇이 달라지나 — 확인 창의 수(viewer 이상). */
  getThemeImpact(projectId: string, ref: ThemeRef, options?: ReadOptions): Promise<ThemeImpact>
  /** 올라온 테마 패키지 목록(로그인한 사람). 숨긴 판은 관리자에게만 실린다. */
  listThemePackages(options?: ReadOptions): Promise<ThemePackageSummary[]>
  /** 판 하나의 manifest 전문 — 숨긴 판도 낸다. */
  getThemeManifest(ref: ThemeRef, options?: ReadOptions): Promise<ThemeManifest>
  /**
   * `.wbtheme`(zip) 바이트를 그대로 올린다(인스턴스 관리자). 본문은 JSON 이 아니다 — `content-type: application/zip` 에 파일 그대로
   * (spec 「업로드 검증」 — multipart 를 쓰지 않는다). 검증 실패 422 의 `issues[]` 에 `manifestCode` 가 실릴 수 있다.
   */
  uploadThemePackage(file: Blob): Promise<ThemePackageUploaded>
  /** 판을 숨기거나 되살린다(인스턴스 관리자). */
  setThemePackageHidden(ref: ThemeRef, hidden: boolean): Promise<ThemePackageVersion>
  /** 스타터 템플릿 zip 을 받아 온다(인스턴스 관리자) — `downloadExport` 와 같은 꼴(받은 것의 형식을 본다 · 시간 제한 없음). */
  downloadThemeTemplate(options?: Pick<ReadOptions, 'cancel'>): Promise<Blob>
}

/** 서버 에러 봉투의 `code`(README "에러 형식"). */
export type ApiErrorCode =
  | 'bad-request'
  | 'unauthenticated'
  | 'forbidden'
  | 'not-found'
  | 'conflict'
  /**
   * 소프트 잠금 충돌(「소프트 잠금」 · 423). **`conflict`와 갈라 둔다** —
   * `edit/use-edit-commit.tsx`의 조건부 재전송이 `status === 409`로 갈리는데, 잠금 충돌이
   * 409면 그 재전송이 돌아 **사용자가 막힌 줄 모르고 남의 구역을 편집한 것**이 된다.
   */
  | 'locked'
  | 'validation-failed'
  /** 로그인 시도 제한(429). 화면은 서버 문장을 그대로 그린다(`routes/login.tsx`). */
  | 'rate-limited'
  | 'internal'

/** 비밀번호 바꾸기에서 지금 비밀번호가 틀렸을 때의 이슈 코드(서버 `routes/auth.ts`의 `WRONG_PASSWORD` — 같은 글자여야 한다). */
export const WRONG_PASSWORD = 'wrong-password'

/** 실패 응답에 실려 오는 개별 이슈. `code`·`nodeId`는 카탈로그 검증 실패에만 채워진다. */
export interface ApiErrorIssue {
  path: string
  message: string
  code?: string
  nodeId?: string | null
  /** 그 칸의 지금 값 — 페이지 메타 충돌(`api/page-meta.ts`)에만 실린다. */
  current?: string | null
  /** 테마 업로드의 `manifest` 이슈가 든 원래 코드(`validateManifest` 의 코드 — api README 「테마 패키지와 프로젝트 테마」). */
  manifestCode?: string
}

/**
 * 요청이 실패했을 때 클라이언트가 던지는 오류.
 *
 * **화면은 `status`가 아니라 `code`로 분기한다.** 서버는 "프로젝트가 없음"과
 * "멤버가 아님"을 일부러 구분하지 않고 둘 다 404로 낸다(「권한 모델」 — 다른 프로젝트의
 * 존재를 흘리지 않기 위해서다). HTTP 숫자로 분기하면 그 의도가 화면에서 깨진다.
 * `status`는 로그·디버깅용으로만 싣는다.
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: ApiErrorCode
  /** 항상 배열이다 — 서버가 키를 생략해도 `[]`다. 화면이 그냥 순회할 수 있어야 한다. */
  readonly issues: ApiErrorIssue[]
  /**
   * **이 api 의 오류 봉투**(`{ error: { code, message } }`)를 실은 HTTP 응답이었다. 봉투 없는 실패 응답은
   * 앞단(프록시)이 낸 것이다 — Vite 개발 프록시는 api 가 요청을 쥔 채 죽으면 `500 text/plain` 빈 본문을
   * 준다(잰 값 — `panels/comment-panel.tsx`의 `knownRejection`). 같은 500 이라도 **누가 냈는지**가 **그
   * 요청의** 결과를 아는지를 가른다(무엇에 대해 아는지 — 다시 보낸 게시의 500 은 봉투가 있어도 앞 게시를 모른다 —
   * 는 그 함수의 표가 소유한다). 응답을 못 받은 실패(`status` 0)는 `false`다. WS `patch-error` 프레임은 늘 `true`다 — 프레임은
   * api 만 짓는다(`realtime/edit-channel.ts`의 `deliver`).
   */
  readonly enveloped: boolean
  /**
   * 봉투 옆에 실려 온 **서버의 지금 값** — 테마 저장(`PUT …/theme`)의 409 가 싣는다(`ProjectThemeView` 모양). 모양은 그 값을 읽는
   * 화면이 본다(`settings/theme-section.tsx`). 없으면 `undefined` 다.
   */
  readonly current: unknown

  constructor(
    status: number,
    code: ApiErrorCode,
    message: string,
    issues?: ApiErrorIssue[],
    enveloped = false,
    current?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.issues = issues ?? []
    this.enveloped = enveloped
    this.current = current
  }
}
