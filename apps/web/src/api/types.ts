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
import type { PageDocument, PatchOp, ValidationIssue, WbNode } from '@wirebound/schema'

/** 프로젝트 멤버의 역할. `owner` > `editor` > `viewer`(README "권한(역할)"). */
export type ProjectRole = 'owner' | 'editor' | 'viewer'

/** `POST /api/auth/login`·`GET /api/auth/me`의 응답. */
export interface SessionUser {
  id: string
  email: string
  name: string
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
 * 호출자의 역할이 실린 프로젝트. **프로젝트를 내는 응답은 지금 넷이고 전부 이 형태다.**
 *
 * **실측**(api 테스트 하네스에 임시 케이스를 두고 네 자리를 불러 응답의 키 집합을 잰다) — 네 자리의 키 집합이
 * `["description","id","name","role","slug"]`로 같다:
 *
 * | 응답 | 상태 | `role` |
 * |---|---|---|
 * | `POST /api/projects` | 201 | `"owner"`(만든 사람이 owner다) |
 * | `GET /api/projects` 각 항목 | 200 | 그 사용자의 역할 |
 * | `GET /api/projects/:projectId` | 200 | 그 사용자의 역할 |
 * | `PATCH /api/projects/:projectId` | 200 | 그 사용자의 역할(owner만 부를 수 있다) |
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
 * 이 프로젝트에서 **고를 수 있는** 프리셋 하나(설계서 「페이지 프리셋」). 목록이 내장과 프로젝트
 * 것을 함께 내고 `source`가 그 둘을 가른다.
 *
 * **`nodes`가 목록에 실려 온다.** 스냅샷의 `payload`와 갈리는 자리다 — 크기가 페이지
 * 하나의 트리라 목록이 이미 나르는 것과 같고, 고른 직후 적용하는 화면이 그것을 반드시
 * 쓴다(빼면 왕복이 하나 늘고 그 실패 갈래가 하나 더 생긴다).
 *
 * **문서 봉투가 아니라 root의 `children`이다** — 적용이 root를 바꾸지 않는다.
 *
 * 서버는 `source === 'project'`인 항목에 `createdBy`·`createdByName`·`createdAt`도
 * 싣지만(api README) **이 타입은 그것을 담지 않는다** — 고르개가 읽지 않는 값이다.
 */
export interface Preset {
  id: string
  source: 'builtin' | 'project'
  name: string
  description: string | null
  nodes: WbNode[]
}

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
  /** 번들이 실은 테마. 늘 `null` 이다 — 번들은 테마 없이 SDK 기본 뷰 CSS 로 그린다(서버 README 「내보내기」). */
  themeId: string | null
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
   * 이 페이지를 가리키는 설계서 「상호작용」 「모델」의 타겟. **상호작용 탭의 `페이지 경로`에 그대로 적는
   * 문자열이다** — 그 자리는 자유 입력이라 서버가 무엇을 조립하는지 알 길이 여기뿐이다.
   */
  target: string
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
