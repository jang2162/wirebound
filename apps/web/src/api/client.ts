/**
 * 서버와 이야기하는 유일한 통로. **화면은 `fetch`를 직접 부르지 않고 이 인터페이스만
 * 본다** — 그래야 테스트가 가짜 구현을 끼워 넣을 수 있고, 경로·쿠키·에러 번역이 한
 * 곳에만 있다.
 *
 * 구현은 `http-client.ts`(실제 서버)와 각 화면 테스트의 가짜 두 부류다.
 */
import type { PatchOp, WbNode } from '@wirebound/schema'
import type { Theme } from '@wirebound/themes'
import type {
  Comment,
  ExportFormat,
  ExportPreview,
  CommentCreated,
  MarkerChange,
  MenuNode,
  PageDetail,
  PageImported,
  PatchResult,
  Preset,
  ProjectDetail,
  ProjectTheme,
  RevisionSummary,
  SessionUser,
  RestoreResult,
  SnapshotSummary,
  ThemeDetail,
  ThemeSummary,
  TreeMenuNode,
} from './types'

/**
 * 쓰기 하나에 얹는 선택 — **`signal`뿐이다.** 끊을지·언제 끊을지는 부르는 쪽이 정한다
 * (`panels/write-ledger.tsx`의 시간 제한). 지금 이것을 받는 것은 우측 패널의 쓰기 다섯(설명 ·
 * 코멘트 넷)이고, 그 장부가 잠금을 쥐는 쓰기들이다.
 *
 * **끊겨도 서버는 끝낼 수 있다** — 끊는 것은 이 브라우저가 응답을 더 기다리지 않는다는 뜻이지
 * 서버가 안 썼다는 뜻이 아니다(그 장부의 머리말에 실측이 있다).
 */
export interface WriteOptions {
  readonly signal?: AbortSignal
}

export interface ApiClient {
  login(email: string, password: string): Promise<SessionUser>
  logout(): Promise<void>
  me(): Promise<SessionUser>
  /** 호출자가 속한 프로젝트 목록. 각 항목에 호출자의 `role`이 실려 온다. */
  listProjects(): Promise<ProjectDetail[]>
  getProject(projectId: string): Promise<ProjectDetail>
  /**
   * 프로젝트를 만든다. **부른 사람이 owner가 된다**(서버가 같은 트랜잭션에서
   * `project_members`에 넣는다 — `repos/projects.ts`).
   *
   * **응답이 `ProjectDetail`이다 — `role: "owner"`까지 실려 온다.** 계획서 D1이
   * *"생성 응답에는 `role`이 없어 목록 항목과 다른 모양이다"*라고 적었던 것은 거짓이고,
   * 그 근거는 `api/types.ts`의 `ProjectDetail` 주석에 실측 표로 있다.
   *
   * **그래도 응답을 목록에 그대로 꽂지 않는다**(P2b-5 D1). 되돌릴 것이 목록 하나뿐이라
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
   * **슬러그 형식을 클라이언트가 다시 보지 않는다**(D5). 서버가 400과 함께 문장을 주고,
   * 중복은 409다 — 규칙을 두 곳에 두면 어긋난다. **다만 그 문장이 무엇이 틀렸는지 다
   * 말해 주지는 않는다:** 형식·길이·빈 문자열이 **전부 같은 한 문장**이다(실측 —
   * `a`×65·`""`·`Abc`·`-abc`·`가나`가 모두 400 `"슬러그는 소문자·숫자·하이픈만 쓸 수 있고,
   * 하이픈으로 시작하거나 끝날 수 없습니다"`. `a`×64는 201이다). **길이 초과에서는 그
   * 문장이 원인을 설명하지 못한다** — 화면(Task 4)이 그 한계를 안고 간다.
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
   * 딸린 것이 함께 사라지는 범위는 Task 6이 재서 `projects/delete-confirm.tsx`에 적는다.
   */
  deleteProject(projectId: string): Promise<void>
  /** 메뉴·페이지 통합 트리. 서버의 `{ menu }` 봉투는 구현이 벗겨 준다. */
  getTree(projectId: string): Promise<TreeMenuNode[]>
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
  /**
   * 메뉴 노드를 지운다. **자식 메뉴·페이지가 있으면 서버가 409를 낸다.**
   *
   * **실측**(api 하네스): 자식 메뉴만 있는 메뉴와 페이지만 있는 메뉴가 **둘 다** 409이고
   * 코드·문장이 같다(`conflict` / `하위 메뉴나 페이지가 있어 삭제할 수 없습니다`).
   * 둘 다 없으면 204다. `tree/tree-actions.ts`의 `remove`가 두 배열을 다 보는 근거이고,
   * 계획서의 재라 #4가 이것으로 닫힌다.
   */
  deleteMenu(projectId: string, nodeId: string): Promise<void>
  /**
   * 페이지를 만든다. 서버가 빈 `Page` 문서를 기본 스키마로 채워 준다(README).
   *
   * **`description`을 싣지 않는다** — 설계 §9가 그 편집을 우측 패널의 "페이지 설명" 탭에
   * 두기로 했고, 트리에서 만드는 자리는 제목만 묻는다.
   */
  createPage(projectId: string, body: { menuNodeId: string; title: string }): Promise<PageDetail>
  /**
   * 페이지의 제목·설명·소속 메뉴·순서를 고친다. `updateMenu`와 같은 계약이다 — 준 키만 실린다.
   *
   * **`schema`는 여기서 못 바꾼다** — 서버가 `PUT .../schema`·`PATCH .../ops`로만 받는다.
   *
   * ## `description`이 여기 있다 — 서버는 처음부터 받고 있었다
   *
   * **앞 판의 이 자리는 *"`description`은 여기서 못 바꾼다"*였고 그 근거를 *"이 단계 밖"*이라고
   * 적었다.** 그 문장은 이 인터페이스에 대해서만 참이었다 — `routes/pages.ts`의
   * `UpdatePageBody`는 **처음부터** `description`을 받았고 `repos/pages.ts`의 `updatePage`도
   * 그것을 썼다. 막고 있던 것은 **여기 시그니처와 `http-client.ts`의 `BODY_KEYS.updatePage`
   * 화이트리스트** 둘뿐이고, 후자가 `declaredOnly`로 그 키를 떨궈 냈다.
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
   * | **`{description:'a\x00b'}`(NUL)** | **500** `"서버 오류가 발생했습니다"` — 아래 |
   * | viewer가 보냄 | 403 |
   * | **남이 그 페이지의 노드를 잠근 동안** | **200** |
   *
   * ### NUL은 500이다 — **`importPage`와 갈린다**(선재 결함, 이 슬라이스 밖)
   *
   * `description`도 `title`도 NUL(`U+0000`)이 들어가면 **400이 아니라 500**이다(실측 —
   * `POST .../pages`도 같다). Postgres가 `invalid byte sequence for encoding "UTF8": 0x00`
   * 으로 거절하는 것이 그대로 올라온다. **`routes/pages.ts`의 `containsNulByte`는
   * `PUT .../schema` 한 자리에서만 불리고 이 라우트는 그것을 안 지난다.**
   *
   * **같은 값이 `importPage`로 오면 400이고 문장까지 있다** — `"페이지 제목·설명에 NUL
   * 문자(U+0000)를 포함할 수 없습니다"`(실측. 아래 `importPage`의 실패 표에도 그 갈래가
   * 있다). **한 값에 두 답이 있는 것이고 새 발견이 아니다** —
   * `docs/superpowers/plans/2026-08-12-p6-1-carryforward.md`가 *"NUL이 500을 내는 여섯
   * 경로"*로 이미 적었다. **여기 적는 이유는 이 표를 읽는 사람이 그 갈래를 모르기
   * 때문이다** — 고치는 것은 `apps/api` 쪽 일이라 이 슬라이스가 하지 않는다.
   *
   * **화면은 이 갈래를 다시 판정하지 않는다.** 500이면 서버가 문장을 안 주므로
   * `toFailure`가 `SAVE_FAILED`(*"설명을 저장하지 못했습니다"*)를 쓴다 — 그것이 D5이고,
   * 화면이 NUL을 미리 막으면 서버와 규칙이 두 벌이 된다.
   *
   * **잠금이 이 경로를 안 본다**(실측). §7.2의 `findLockConflict`는 **문서 안 포인터**를
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
    body: { title?: string; description?: string | null; menuNodeId?: string; sortOrder?: number },
    options?: WriteOptions,
  ): Promise<PageDetail>
  deletePage(projectId: string, pageId: string): Promise<void>
  /**
   * **페이지 JSON 파일 한 벌로 새 페이지를 만든다**(§11.2 — P7-3). **덮지 않는다** —
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
   * > **앞 판은 여기에 *"그래야 화면이 통과시킨 파일을 서버가 다른 이유로 거절하는 일이
   * > 없다"*고 적었고 그것은 거짓이었다**(리뷰가 셋을 실측했다 — 그때 미리보기는 봉투만
   * > 봤다). P7-1 이월 §2가 이름 붙인 부류를 **이 주석 자신이 만들고 있었다.**
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
   * `clientOpId`는 클라이언트가 붙이는 값이고 서버는 그대로 되돌려 준다. **다만 ack가 그 에코를
   * 쓰지 않는다** — 보낸 요청의 id와 큐의 `[0]`을 맞춘다(`store/edit-queue.ts`의
   * `PendingEdit.clientOpId`에 근거가 있다). 즉 `PatchResult.clientOpId`는 **계약에 있으니 타입에
   * 두지만 ack의 판정에는 쓰이지 않는 필드**다(`ApiError.status`와 같은 부류).
   *
   * **"소비자가 아직 없다"로 적지 않는다** — 그 형태가 이 저장소에서 여러 번 저절로 낡았다
   * (`test/api-consumers.test.ts`의 머리말). 위 문장은 **무엇이 무엇을 쓰는가**를 말하므로
   * 소비자가 생겨도 거짓이 되지 않는다.
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
  /**
   * 이 프로젝트의 화면이 지금 써야 할 테마(설계 §4.2의 사슬을 서버가 따라간다).
   *
   * **`theme`이 `null`인 것은 실패가 아니다** — 테마를 고르지 않은 상태가 정상이고 그때
   * 화면은 구조 기본 CSS만으로 그려진다. 그래서 이 메서드는 그 경우에도 던지지 않는다.
   *
   * **파생 테마는 서버가 합쳐서 준다.** 받는 쪽이 base를 따로 얻어 `resolveTheme`의 두
   * 인자를 맞출 필요가 없다 — `ThemeSource`가 `() => Theme | null`로 남는 이유다.
   * 편집용 형태(파생 문서 + `base`)는 다른 엔드포인트가 내고 이 화면은 쓰지 않는다.
   */
  getProjectTheme(projectId: string): Promise<ProjectTheme>
  /**
   * **이 프로젝트에서 고를 수 있는 테마 전부.** 시스템 테마가 함께 나오고 그것이 먼저다
   * (서버가 정렬한다 — 시스템 먼저, 각 무리 안에서 `slug` 순). 여기서 다시 정렬하지
   * 않는다: 순서가 서버의 계약이고 두 자리에서 정렬하면 갈릴 수 있다.
   */
  listProjectThemes(projectId: string): Promise<ThemeSummary[]>
  /**
   * **이 프로젝트가 쓸 테마를 고른다.** `null`은 *"테마를 벗긴다"*이고 그것은 정상 상태다 —
   * 화면이 구조 기본 CSS만으로 그려진다.
   *
   * **응답이 `getProjectTheme`과 같은 꼴이다**(서버가 같은 함수로 만든다). 그래서 고른 뒤
   * 다시 조회할 필요가 없다 — 다만 캔버스는 자기 훅으로 읽으므로 화면을 갱신하려면
   * 그쪽에 알려야 한다(`theme/use-project-theme.ts`의 `reloadToken`).
   *
   * **owner만 성공한다**(§10 — 테마 편집과 같은 등급). 서버가 막지만 화면도 미리 막는다.
   */
  setProjectTheme(projectId: string, themeId: string | null): Promise<ProjectTheme>
  /**
   * **저작 UI가 편집할 테마 하나**(P4c-2 D1). `getProjectTheme`과 **다른 것을 낸다** —
   * 그쪽은 캔버스가 그대로 쓸 **홀로 서는 테마**이고, 이쪽은 **사람이 적은 파생 문서
   * 그대로 + `base`**다(서버 README의 소비자 표).
   *
   * **viewer도 읽을 수 있다.** 편집을 막는 것은 쓰기 둘이고(§10), 이 라우트는 `viewer`
   * 게이트다 — 화면이 읽기 전용으로 그릴 수 있어야 하기 때문이다.
   *
   * **시스템 테마는 어느 프로젝트에서나 읽힌다**(`project_id IS NULL`). 남의 프로젝트
   * 테마는 404다(설계 §10의 존재 숨김).
   */
  getTheme(projectId: string, themeId: string): Promise<ThemeDetail>
  /**
   * 테마를 만든다. **owner만 부를 수 있다**(§10 — 테마 편집은 owner).
   *
   * D2의 *"이 테마를 바탕으로 새 테마 만들기"*가 부르는 자리다. 그때 본문은
   * `{ theme: { meta: { id, name, extends: 'system:<slug>' } } }`뿐이고 나머지 절은 비운다 —
   * **파생은 덮어쓸 것만 적는 것이 §6.9의 뜻**이다.
   *
   * **`meta.id`(slug)가 충돌하면 409다.** 유일성 단위가 `(project_id, slug)`이므로
   * 시스템 테마와 같은 slug는 충돌하지 않는다.
   *
   * **응답의 `id`가 편집 화면의 주소가 된다** — `SHAPES.themeDetail`이 빈 문자열을 막는
   * 이유가 그것이다(`pageDetail`의 "주소가 되는 값" 축과 같다).
   */
  createTheme(projectId: string, body: { theme: Theme }): Promise<ThemeDetail>
  /**
   * **통째 교체다**(D3). 서버의 `updateTheme`이 절 다섯을 전부 쓰므로 **본문에 없는 절은
   * 실제로 비워진다** — 부분 갱신이 아니다. **owner만 부를 수 있고 시스템 테마는 403이다.**
   *
   * `updateProject` 부류와 달리 `updateBody`(빈 본문 차단)를 지나지 않는다 — 키가
   * `theme` 하나뿐이라 "바꿀 값이 없는 본문"이라는 것이 성립하지 않는다.
   *
   * **`error`가 있으면 422다**(`ApiError.issues`에 `ThemeIssue[]`가 실려 온다).
   * **경고만 있으면 저장되고** 응답의 `warnings`에 실린다 — 없으면 그 키 자체가 없다.
   */
  updateTheme(projectId: string, themeId: string, body: { theme: Theme }): Promise<ThemeDetail>
  /**
   * 이 페이지의 코멘트 전부(P5-1). **선택한 노드의 것만이 아니다** — 설계 §9의 우측
   * 목록이 *"① 검색폼 - … / ② 목록 - …"*로 **전부**를 보인다.
   *
   * **번호 순이 아니라 `createdAt` 오름차순으로 온다.** 서버는 번호를 모른다(번호는
   * 문서의 값이다). 번호로 묶고 늘어놓는 것은 문서를 든 화면의 일이다.
   *
   * `viewer`도 읽는다 — 막는 것은 쓰기 넷이다(§10).
   */
  listComments(projectId: string, pageId: string): Promise<Comment[]>
  /**
   * 코멘트를 단다. **그 노드에 번호가 없으면 서버가 번호를 붙이고 revision을 남긴다**
   * (계획서 D2 — `marker`는 페이지 문서의 값이므로 편집 파이프라인을 지나야 한다).
   *
   * **`markerOps`를 화면이 자기 문서에 적용해야 한다.** 그러지 않으면 캔버스에 번호가
   * 뜨지 않고 `headSeq`가 서버보다 뒤처져 다음 편집이 409를 받는다. 그 적용은
   * `EditorStore.applyMarkerChange` 하나가 한다.
   *
   * **문서에 없는 노드는 404다.** 본문은 1~2000자이고 그 밖은 400이다.
   * **그 사이 남이 페이지를 고쳤으면 409다** — 서버가 `head_seq`를 잠그기 전에 읽어
   * 낙관적 잠금으로 쓰기 때문이고, 그래야 두 노드의 첫 코멘트가 같은 번호를 받지 않는다.
   */
  createComment(
    projectId: string,
    pageId: string,
    body: { nodeId: string; body: string },
    options?: WriteOptions,
  ): Promise<CommentCreated>
  /**
   * 본문을 고친다. **작성자만 부를 수 있다** — 남의 것이면 403이다(서버 재라 #2:
   * 남의 이름이 붙은 채 내용이 바뀌면 말을 지어내는 일이 된다).
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
   * 코멘트를 지운다. **그 노드의 마지막이었으면 번호도 함께 사라진다**(§4.3의
   * *"없으면 코멘트 없음"*) — 그때 `markerOps`에 `remove`가 실려 온다.
   *
   * **204가 아니라 200에 본문이 온다** — 다른 `DELETE` 셋과 갈리는 이유는 이것이 문서를
   * 바꿀 수 있기 때문이다. **남의 코멘트도 지울 수 있다**(수정과 갈린다).
   */
  deleteComment(projectId: string, pageId: string, commentId: string, options?: WriteOptions): Promise<MarkerChange>
  /**
   * **문서 순서대로 재번호**(§9의 버튼). 번호가 **있는** 노드만 1부터 다시 매긴다 —
   * 번호가 없는 노드에 새로 주지 않는다.
   *
   * **한 revision이다.** 노드마다 따로 부르면 중간 상태에 번호가 겹친다.
   * 바꿀 것이 없으면 `markerOps: []`이고 문서도 revision도 안 건드린다.
   */
  renumberComments(projectId: string, pageId: string, options?: WriteOptions): Promise<MarkerChange>
  /**
   * 이 프로젝트의 스냅샷 전부(P6-1). **최근 것이 먼저** 오고 동률이면 태그 순이다 —
   * 순서가 서버의 계약이므로 여기서 다시 정렬하지 않는다(`listProjectThemes`와 같은 판단).
   *
   * **`payload`가 실려 오지 않는다**(서버 D9) — 목록이 payload 전부를 나르면 프로젝트가
   * 커질수록 목록만으로 무거워진다. 크기(`payloadBytes`)만 온다.
   *
   * `viewer`도 읽는다 — 막는 것은 생성 하나다(§10).
   */
  /**
   * **이 프로젝트에서 고를 수 있는 프리셋 전부**(§11.1 — P7-2 D2). 내장 3종이 먼저 오고
   * 프로젝트 프리셋이 만든 순서대로 뒤에 붙는다 — **순서가 서버의 계약이므로 여기서 다시
   * 정렬하지 않는다**(`listProjectThemes`와 같은 판단).
   *
   * **프로젝트 프리셋이 하나도 없는 것이 기본 상태다.** 그때도 응답이 비지 않는다.
   */
  listPresets(projectId: string): Promise<Preset[]>
  /**
   * **지금 페이지를 프리셋으로 남긴다**(§11.1). `nodes`는 root의 `children`이지 문서
   * 봉투가 아니다(D3).
   *
   * **`marker`는 서버가 버린다**(D4) — 화면이 미리 지우지 않는 것은 그 규칙의 자리가
   * 하나여야 하기 때문이다. 응답의 `nodes`에는 이미 없다.
   *
   * 이름 1~60자·설명 0~2000자 밖은 400이고, **이름 중복은 오류가 아니다**(D2).
   */
  createPreset(
    projectId: string,
    body: { name: string; description?: string | null; schema: WbNode[] },
  ): Promise<Preset>
  listSnapshots(projectId: string): Promise<SnapshotSummary[]>
  /**
   * **지금 상태를 태그 하나로 얼린다.** §10이 **editor**에게 연 자리다 — 테마 고르기가
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
   * **그때로 되돌린다**(P6-2). §10이 **owner**에게만 연 자리다 — 생성이 editor까지 열린 것과
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
  restoreSnapshot(projectId: string, snapshotId: string): Promise<RestoreResult>
  /**
   * **내려받기 전에 화면이 말할 것**(§11.3 — P8-4). 번들을 실제로 만들어 보고 그 결과를
   * 값으로 낸다 — 그래서 **싸지 않다.** 화면을 열 때가 아니라 사람이 내보내기를 누를 때
   * 부른다.
   *
   * **페이지가 하나도 없으면 409다.** 빈 번들을 내면 받는 사람이 푼 뒤에야 비었다는 것을
   * 안다.
   */
  getExportPreview(projectId: string, format: ExportFormat): Promise<ExportPreview>
  /**
   * 파일을 받는 **주소**(zip 또는 pptx). 요청을 보내지 않는다 — 반환한 것을
   * `<a download href>`에 그대로 건다.
   *
   * **`fetch`로 받아 blob으로 넘기지 않는 이유 둘.** 번들 전체가 페이지 수의 제곱이라
   * (P8-2 이월 §4) 다 받아 메모리에 드는 것이 그대로 비용이 되고, `URL.createObjectURL`은
   * 이 저장소의 테스트 환경(jsdom)에 없어서 그 경로는 케이스가 닿지 못한다. 앵커는 브라우저가
   * 곧장 디스크로 흘려보내고 세션 쿠키도 그대로 실린다.
   *
   * **그래도 이 함수가 `ApiClient`에 있는 이유:** 주소를 아는 자리가 하나여야 한다.
   * 화면이 `/api/…`를 직접 적기 시작하면 경로가 두 곳이 된다.
   *
   * **`format`에 기본값을 두지 않는다.** 서버는 기본이 `html`이지만(P8-4가 만든 URL이
   * 인자 없이 계속 zip을 받아야 한다) **이쪽에서 생략을 허용하면** 형식을 고를 줄 아는
   * 화면이 그 인자를 빠뜨렸을 때 *"pptx를 보고 zip을 받는"* 상태가 조용히 선다. 필수로
   * 두면 타입 검사가 모든 호출부에서 그것을 묻는다.
   */
  exportUrl(projectId: string, format: ExportFormat): string
}

/** 서버 에러 봉투의 `code`(README "에러 형식"). */
export type ApiErrorCode =
  | 'bad-request'
  | 'unauthenticated'
  | 'forbidden'
  | 'not-found'
  | 'conflict'
  /**
   * 소프트 잠금 충돌(설계 §7.2 · 423). **`conflict`와 갈라 두는 것이 P3-3 D1의 판정이다** —
   * `edit/use-edit-commit.tsx`의 조건부 재전송이 `status === 409`로 갈리는데, 잠금 충돌이
   * 409면 그 재전송이 돌아 **사용자가 막힌 줄 모르고 남의 구역을 편집한 것**이 된다.
   */
  | 'locked'
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
