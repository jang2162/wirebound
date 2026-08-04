/**
 * 페이지 라우트: 조회·생성·수정·삭제, 그리고 이 태스크의 핵심인 스키마 검증 게이트
 * (`PUT .../schema`). `menuRoutes`(`routes/menu.ts`)와 같은 `/api/projects` prefix로
 * 등록한다(`app.ts`) — 파일은 분리하되 URL 네임스페이스는 공유한다. 이 파일의
 * 라우트는 전부 `/:projectId/pages`(그 아래 `/:pageId`, `/:pageId/schema`) 아래에 있다.
 *
 * HTTP·zod 검증만 다룬다 — SQL과 정렬·이동 불변식은 전부 `repos/pages.ts`에 맡긴다.
 * 권한 판정은 `auth/roles.ts`의 `projectGuard` 하나가 전담한다 — 이 파일은 역할을
 * 비교하지 않는다.
 *
 * **`PUT .../schema`가 설계 §7.1의 서버 게이트다.** 순서가 규격이다:
 * 1. 본문을 `z.strictObject({ schema: DocumentEnvelopeSchema })`로 파싱한다.
 *    실패(봉투가 깨짐) → 400 `bad-request`.
 * 2. `migrateDocument`로 최신 버전까지 올린다. 던지면(지원하지 않는 버전) → 400.
 * 3. `validatePage`를 부른다. 이슈가 있으면(봉투는 멀쩡한데 카탈로그 규칙 위반)
 *    → 422 `validation-failed`, `issues`에 `ValidationIssue[]`를 그대로 싣는다.
 * 4. 통과한 문서만 `applyEdit`(편집 파이프라인)에 태워 저장한다 — `PATCH .../ops`와
 *    **같은 쓰기 경로**다.
 * 1·3단계가 갈리는 이유: "요청이 잘못됨"(400)과 "내용이 처리 불가함"(422)은 다른
 * 성질이다(설계 §13). 1~3 중 어디서든 실패하면 저장(4단계)에 도달하지 못하므로
 * 기존 `schema`는 그대로 남는다 — 이 게이트가 존재하는 이유 자체다.
 *
 * **`pages.schema`를 바꾸는 경로는 파이프라인 하나뿐이다(설계 결정 D1).** 그래서
 * 통째 교체인 `PUT`도 revision을 남긴다. 예외를 두면 이렇게 깨진다: PUT이 문서만
 * 갈아 끼우고 `head_seq`를 그대로 두면, 그 뒤 클라이언트가 보내는 undo(저장된
 * `inverse`의 재적용)가 **교체된 문서** 위에서 돈다. 경로가 어긋나면 409로 튕기지만
 * 우연히 살아 있으면 조용히 엉뚱한 값이 들어간다. `repos/pages.ts`에 revision 없이
 * `schema`를 쓰는 함수를 남겨 두지 않는 것도(이 태스크가 그런 함수 하나를 지웠다)
 * 같은 이유다 — 두 번째 쓰기 경로가 있으면 그것을 부르는 순간 같은 구멍이 다시 난다.
 *
 * **`PATCH .../ops`는 같은 게이트를 부분 편집에 대해 수행한다.** 다만 검증·적용·
 * 이력 기록을 이 파일이 직접 하지 않고 `services/edit-pipeline.ts`의 `applyEdit`
 * 하나에 맡긴다 — P3의 WebSocket 핸들러가 같은 함수를 부르므로, 규칙이 이 파일에
 * 있으면 두 진입점이 갈라진다. 여기 남는 것은 zod 경계(본문 모양·경로 제약·ops 상한)와
 * `EditOutcome`의 실패 사유를 상태 코드로 옮기는 일뿐이다.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  CURRENT_DOCUMENT_VERSION,
  DocumentEnvelopeSchema,
  createNodeId,
  migrateDocument,
  validatePage,
} from '@wirebound/schema'
import { projectGuard } from '../auth/roles'
import { containsNulByte } from '../db/nul-guard'
import { badRequest, conflict, notFound, unauthenticated, validationFailed, type ApiError } from '../errors'
import { parseBody, parseParams } from '../http/parse'
import { applyEdit, type EditOutcome } from '../services/edit-pipeline'
import { MenuNodeNotFoundError, deletePage, findPageById, insertPage, updatePage, type PageRecord } from '../repos/pages'

const ProjectIdParams = z.object({ projectId: z.uuid() })
const PageParams = z.object({ projectId: z.uuid(), pageId: z.uuid() })

const Title = z.string().min(1, '제목을 입력하세요').max(200, '제목은 200자 이하여야 합니다')
const Description = z.string().max(2000, '설명은 2000자 이하여야 합니다').nullable()

/** `repos/menu.ts`의 `sortOrder`와 같은 이유(음수는 여기서 400, 형제 수보다 큰 값은 저장소가 클램프한다). */
const SortOrder = z.int().min(0)

/** `z.strictObject`라 선언되지 않은 키가 오면 그 자체로 400이다(`routes/menu.ts`와 같은 관례). */
const CreatePageBody = z.strictObject({
  menuNodeId: z.uuid(),
  title: Title,
  description: Description.optional(),
})

/** 필드가 전부 optional이므로, 빈 본문(`{}`)이 통과하지 않도록 `.refine`으로 따로 막는다(`routes/menu.ts`와 같은 관례). */
const UpdatePageBody = z
  .strictObject({
    title: Title.optional(),
    description: Description.optional(),
    menuNodeId: z.uuid().optional(),
    sortOrder: SortOrder.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: '변경할 값이 없습니다' })

/**
 * `PUT .../schema`의 본문. `schema` 하나만 선언한다 — 그 밖의 키는 게이트 1단계에서
 * 바로 400이다. `DocumentEnvelopeSchema`(`@wirebound/schema`)가 봉투(버전·루트 노드
 * 트리) 형태를 검사한다: `version`은 양의 정수, 각 노드는 `id`(패턴 일치)·`type`을
 * 갖고 선언되지 않은 키(예: `style`)를 갖지 않는다.
 */
const PutSchemaBody = z.strictObject({ schema: DocumentEnvelopeSchema })

/**
 * ops의 경로 제약. `/root`이거나 `/root/`로 시작해야 한다.
 *
 * `version`은 마이그레이션이 소유하는 필드이지 편집 대상이 아니다(설계 §13.1).
 * 문서 루트 자체(`""`)는 `applyOp`가 애초에 거부한다. 이 제약을 **HTTP 본문에만**
 * 거는 이유: `PUT .../schema`가 파이프라인을 부를 때 만드는 `replace /version`은
 * 서버가 스스로 만든 것이라 신뢰할 수 있고, 이 zod를 거치지 않는다.
 *
 * 파이프라인도 `/version` 편집을 `invalid`(422)로 막지만 그건 마지막 방어선이다 —
 * 여기서 400으로 미리 끊어야 "본문이 계약을 어겼다"와 "문서 내용이 처리 불가하다"가
 * 섞이지 않는다(설계 §13).
 */
const PatchPath = z
  .string()
  .max(2000, '경로가 너무 깁니다')
  .refine((path) => path === '/root' || path.startsWith('/root/'), {
    message: '경로는 /root 아래여야 합니다',
  })

/**
 * `add`·`replace`가 싣는 임의의 JSON 값. **키 자체가 있어야 한다** — 값 없는 add는
 * 문서에 `undefined`를 심고, 그건 jsonb 직렬화에서 조용히 사라져 클라이언트가 보낸
 * 편집과 서버에 남은 문서가 말없이 갈라진다.
 *
 * **키 부재를 실제로 막는 것은 zod 4.4.3의 객체 파서다.** `.optional()`이 붙지 않은
 * 필드는 그 타입이 `undefined`를 받아들이든 말든 키가 없으면 `invalid_type`으로
 * 거부한다 — 변이 검사로 확인했다: 아래 술어를 `() => true`로 바꿔도 값 없는 add는
 * 여전히 400이고, `.optional()`을 붙여야 비로소 통과한다. 그러니 이 술어는 그 판정을
 * 대신하는 게 아니라 **그보다 먼저 걸려 사람이 읽을 메시지를 주는 층**이다. 술어 없이
 * `z.unknown()`만 두면 응답에 "잘못된 입력: 예상 타입은 nonoptional, 받은 타입은
 * undefined입니다"가 실려 zod 내부 용어가 그대로 클라이언트에게 새어 나간다.
 *
 * `envelope.ts`의 `SetPropActionSchema`에는 "z.unknown()은 키를 선택적으로 만든다"는
 * 정반대 주석이 달려 있다 — 지금 zod에서는 사실이 아니다. 그 주석을 믿고 이 필드를
 * `.optional()`로 바꾸면 값 없는 add가 통과한다.
 *
 * `null`은 통과한다 — 정당한 JSON 값이다. 막는 것은 값의 **부재**뿐이다.
 */
const PatchValue = z.custom<unknown>((value) => value !== undefined, { message: 'value가 필요합니다' })

/**
 * ops 하나. `@wirebound/schema`의 `PatchOp`(add·remove·replace·move 넷)와 같은
 * 모양을 zod로 다시 쓴 것이다 — 그 패키지에는 대응하는 zod 스키마가 없다. 패치
 * 함수들은 이미 신뢰된 입력을 받는 순수 함수이고(브라우저에서도 돈다), 신뢰할 수
 * 없는 입력을 거르는 것은 HTTP 경계인 이 파일의 몫이기 때문이다. 두 정의가 갈라지면
 * 컴파일이 깨진다 — `applyEdit`이 `PatchOp[]`를 받으므로 여기 추론 결과가 그 타입에
 * 대입 가능해야 한다.
 *
 * 네 종류 밖(예: RFC 6902의 `copy`)은 여기서 400이다. 파이프라인은 op 종류를 검사
 * 하지 않는다 — `applyOp`의 switch가 어느 분기도 타지 않아 문서가 그대로 남으므로,
 * 여기서 막지 않으면 "아무 일도 안 일어났는데 revision만 남는" 편집이 된다.
 */
const PatchOpBody = z.discriminatedUnion('op', [
  z.strictObject({ op: z.literal('add'), path: PatchPath, value: PatchValue }),
  z.strictObject({ op: z.literal('remove'), path: PatchPath }),
  z.strictObject({ op: z.literal('replace'), path: PatchPath, value: PatchValue }),
  z.strictObject({ op: z.literal('move'), path: PatchPath, from: PatchPath }),
])

/** `PATCH .../ops`의 본문. */
const OpsBody = z.strictObject({
  /** 클라이언트가 아는 마지막 seq. 새 페이지(이력 없음)는 0이다. */
  baseSeq: z.int().min(0),
  /**
   * 최대 200개. 상한을 두는 이유는 요청 하나가 임의로 큰 문서 변형을 일으켜
   * 메모리·CPU를 소진하는 것을 막기 위해서다 — 파이프라인은 ops마다 문서를
   * structuredClone하므로 비용이 ops 수에 선형이다. 사람의 한 동작이 만드는
   * ops는 많아야 몇 개이고, 큰 변형은 `PUT .../schema`(통째 교체)의 몫이다.
   *
   * 빈 배열은 허용한다(`.min(1)`을 걸지 않는다) — 파이프라인이 빈 ops에도 revision을
   * 남기도록 정의돼 있고, 그 성질에 기대는 호출자가 생길 수 있다.
   */
  ops: z.array(PatchOpBody).max(200, 'ops는 200개 이하여야 합니다'),
  /**
   * 클라이언트의 pending 큐 식별자. 서버는 저장하지 않고 응답에 그대로 되돌려
   * 준다 — 멱등 키가 아니다(설계 결정 D4). 중복 적용은 baseSeq가 막는다.
   */
  clientOpId: z.string().min(1).max(64).optional(),
})

/**
 * 파이프라인의 실패 사유를 HTTP 에러로 옮긴다. 매핑 표가 곧 이 함수다.
 *
 * **`default` 절을 두지 않는다.** 반환 타입을 `ApiError`로 못박아 두면 `EditOutcome`에
 * 새 사유가 생기는 순간 "값을 반환하지 않고 끝나는 경로가 있다"로 컴파일이 깨진다.
 * `default`를 두면 그 신호가 사라지고, 새 사유가 조용히 엉뚱한 상태 코드로 나간다.
 */
function toApiError(outcome: Extract<EditOutcome, { ok: false }>, baseSeq: number): ApiError {
  switch (outcome.reason) {
    case 'not-found':
      return notFound()
    case 'stale':
      // 현재 headSeq를 에러 봉투의 새 필드가 아니라 **메시지에** 싣는다: 봉투는
      // `{ error: { code, message, issues? } }` 하나뿐이고, 409를 받은 클라이언트는
      // 어차피 페이지를 재조회한다 — 권위 있는 값은 그 재조회 응답의 headSeq다.
      // 여기 숫자는 사람이 로그를 읽을 때를 위한 것이다.
      return conflict(`페이지가 이미 변경되었습니다 (요청 baseSeq ${baseSeq}, 현재 ${outcome.headSeq})`)
    case 'patch-failed':
      // 400이 아니라 409인 이유: 본문 자체는 계약을 지켰다(zod를 통과했다). 서버
      // 문서의 현재 모양과 맞지 않을 뿐이라 stale과 같은 성질의 충돌이고, 클라이언트의
      // 대응도 같다 — 재조회 후 다시 시도한다.
      return conflict(`편집을 적용할 수 없습니다: ${outcome.message}`)
    case 'invalid':
      return validationFailed('스키마 검증에 실패했습니다', outcome.issues)
    case 'unsupported-version':
      return badRequest(outcome.message)
    case 'nul-byte':
      return badRequest('문서에 NUL 문자(U+0000)를 포함할 수 없습니다')
  }
}

/** API 계약이 노출하는 필드만 담는다 — 저장소의 `projectId`는 응답에 싣지 않는다(경로에 이미 있다). */
function toResponse(page: PageRecord) {
  return {
    id: page.id,
    menuNodeId: page.menuNodeId,
    title: page.title,
    description: page.description,
    sortOrder: page.sortOrder,
    schemaVersion: page.schemaVersion,
    schema: page.schema,
    headSeq: page.headSeq,
  }
}

/** `app.ts`가 `app.register(pageRoutes(), { prefix: '/api/projects' })`로 등록하는 팩토리. */
export function pageRoutes() {
  return async function plugin(app: FastifyInstance): Promise<void> {
    app.get('/:projectId/pages/:pageId', { preHandler: projectGuard('viewer') }, async (request) => {
      const { projectId, pageId } = parseParams(PageParams, request.params)
      const page = await findPageById(app.db, projectId, pageId)
      if (!page) {
        throw notFound()
      }
      // 설계 §13.1: 읽을 때 최신 버전으로 올려 내보낸다. 이 응답을 만드는 데만
      // 쓰고, 올라간 결과를 다시 저장하지는 않는다 — 다음 저장(PUT .../schema) 때
      // 갱신된다.
      //
      // migrateDocument는 한 번만 부르고 `schemaVersion`·`schema`를 **그 결과 하나**에서
      // 함께 파생시킨다. 저장된 `schema_version` 컬럼을 그대로 흘려보내면(예:
      // `{ ...page, schema: migrateDocument(page.schema) }`처럼 스프레드로 옛 컬럼
      // 값을 살려 두면) 실제 마이그레이션이 문서 버전을 올리는 순간 응답의
      // `schemaVersion`과 `schema.version`이 서로 다른 값을 가리키게 된다 —
      // `PUT .../schema`가 저장 시 `migrated.version`으로 두 값을 동시에 맞추는 것과
      // 같은 이유로, 읽기도 똑같이 해야 한다.
      //
      // `PUT .../schema`(아래)와 마찬가지로 try/catch로 감싼다. 오늘은 PUT이 저장
      // 시점에 지원하지 않는 버전을 이미 400으로 막아 이 조회 경로가 그런 문서를
      // 볼 일이 없지만, 그 보장은 이 프로세스가 아는 `CURRENT_DOCUMENT_VERSION` 안에서만
      // 유효하다 — 더 새 배포가 저장한 문서를 이 프로세스가 되읽으면(예: 배포 롤백,
      // 여러 버전이 같은 DB를 공유하는 롤링 배포) `migrateDocument`가 똑같이 던진다.
      // 여기서 잡지 않으면 그 페이지의 모든 후속 GET이 처리되지 않은 예외로 500이 된다.
      //
      // **그리고 그런 문서는 API로 되살릴 수 없다 — 인지된 결과다.** 전에는 `PUT
      // .../schema`가 탈출구였다: 그 경로는 **들어온** 문서만 마이그레이션하고 저장된
      // 문서를 통째로 덮어썼기 때문이다. 지금은 PUT도 편집 파이프라인을 타고, 그
      // 2단계가 **저장된** 문서를 `migrateDocument`에 태워 `unsupported-version` →
      // 400으로 끝난다. 즉 GET·`PATCH .../ops`·`PUT .../schema` 세 경로가 전부 같은
      // 이유로 400이다. 그래도 파이프라인을 우회하는 쓰기 경로를 되살리지는 않는다 —
      // 그것은 D1(모든 스키마 변경이 revision을 남긴다)을 다시 뚫는 일이고, 복구
      // 경로를 어떻게 줄지는 별도 설계 결정이다(P6 스냅샷 복원이 유력한 자리다).
      // 여기서 500을 400으로 바꾸는 것은 그 사이에 최소한 원인을 말해 주기 위해서다.
      let migrated
      try {
        migrated = migrateDocument(page.schema)
      } catch (error) {
        throw badRequest(error instanceof Error ? error.message : '지원하지 않는 문서 버전입니다')
      }
      return toResponse({ ...page, schema: migrated, schemaVersion: migrated.version })
    })

    app.post('/:projectId/pages', { preHandler: projectGuard('editor') }, async (request, reply) => {
      const { projectId } = parseParams(ProjectIdParams, request.params)
      const body = parseBody(CreatePageBody, request.body)

      let page
      try {
        page = await insertPage(app.db, projectId, {
          menuNodeId: body.menuNodeId,
          title: body.title,
          description: body.description ?? null,
          schema: { version: CURRENT_DOCUMENT_VERSION, root: { id: createNodeId(), type: 'Page', children: [] } },
          schemaVersion: CURRENT_DOCUMENT_VERSION,
        })
      } catch (error) {
        if (error instanceof MenuNodeNotFoundError) {
          throw notFound(error.message)
        }
        throw error
      }

      reply.code(201)
      return toResponse(page)
    })

    app.patch('/:projectId/pages/:pageId', { preHandler: projectGuard('editor') }, async (request) => {
      const { projectId, pageId } = parseParams(PageParams, request.params)
      const body = parseBody(UpdatePageBody, request.body)

      let page
      try {
        page = await updatePage(app.db, projectId, pageId, body)
      } catch (error) {
        if (error instanceof MenuNodeNotFoundError) {
          throw notFound(error.message)
        }
        throw error
      }

      if (!page) {
        throw notFound()
      }
      return toResponse(page)
    })

    app.put('/:projectId/pages/:pageId/schema', { preHandler: projectGuard('editor') }, async (request) => {
      const { projectId, pageId } = parseParams(PageParams, request.params)
      // 1단계: 봉투 파싱. 실패(모양이 깨짐, 선언 안 된 키, root.id 형식 위반 등)는
      // parseBody가 바로 400 bad-request로 던진다.
      const body = parseBody(PutSchemaBody, request.body)

      // 2단계: 최신 버전으로 마이그레이션. 지원하지 않는 버전(target보다 큰 버전,
      // 또는 체인에 없는 낮은 버전)이면 던진다 — 이것도 400이다(요청 자체가 처리
      // 불가한 버전을 실었다는 뜻이지, 카탈로그 규칙 위반이 아니다).
      let migrated
      try {
        migrated = migrateDocument(body.schema)
      } catch (error) {
        throw badRequest(error instanceof Error ? error.message : '지원하지 않는 문서 버전입니다')
      }

      // 3단계: 카탈로그 검증. 봉투는 멀쩡하지만 내용이 처리 불가하면 422다.
      const issues = validatePage(migrated)
      if (issues.length > 0) {
        throw validationFailed('스키마 검증에 실패했습니다', issues)
      }

      // 3.5단계: NUL 문자(U+0000) 검사. `DocumentEnvelopeSchema`(1단계)는 타입만,
      // `validatePage`(3단계)는 카탈로그 규칙만 본다 — 문자열 값의 문자 내용은
      // 둘 다 검사하지 않으므로 NUL이 여기까지 그대로 통과한다. 이 검사가 없으면
      // 4단계의 `schema::jsonb` 캐스팅이 Postgres에서 `22P05 unsupported Unicode
      // escape sequence`로 죽는다(실측 확인). Postgres의 텍스트 계열 타입이 NUL을
      // 담지 못하는 한정적 제약이라, 브라우저에서도 도는 `@wirebound/schema`
      // (`DocumentEnvelopeSchema`)가 아니라 여기(API, Postgres를 아는 계층)에서 막는다.
      //
      // 파이프라인도 같은 검사를 하므로(8단계) 지워도 400이 나오기는 한다. 그래도
      // 남기는 이유는 1~3단계와 같다 — 여기서 걸러야 이 요청이 잠금도 트랜잭션도
      // 열지 않고 끝난다.
      if (containsNulByte(migrated)) {
        throw badRequest('문서에 NUL 문자(U+0000)를 포함할 수 없습니다')
      }

      // `PATCH .../ops`와 같은 이유로 `as`로 좁히지 않고 던진다 — 이 라우트도 이제
      // append-only 로그에 actor를 남긴다.
      const currentUser = request.currentUser
      if (!currentUser) {
        throw unauthenticated()
      }

      // 4단계: 통과한 문서를 파이프라인에 태운다. 이 엔드포인트가 `PATCH .../ops`와
      // **같은 쓰기 경로**를 쓰는 것이 D1(모든 스키마 변경이 revision을 남긴다)이다.
      //
      // `PUT`은 "통째 교체"이므로 baseSeq를 본문으로 받지 않고 라우트가 현재 head_seq를
      // 읽어 넘긴다 — 이 엔드포인트의 실제 사용자는 JSON 가져오기(P7)와 스냅샷
      // 복원(P6)이고, 그 둘은 마지막 쓰기가 이기는 것이 옳다. 에디터(P2b)는 이
      // 엔드포인트를 쓰지 않는다.
      //
      // **읽기와 파이프라인 호출 사이에는 경합 창이 있다.** 그 사이 다른 편집이
      // 커밋되면 파이프라인이 `stale`을 돌려주고, 그건 그대로 409가 된다(위
      // `toApiError`). 재시도 루프를 넣지 않는다: 창이 매우 좁고, 409를 받은
      // 호출자(가져오기 도구)가 다시 시도하면 된다. `stale`을 조용히 삼켜 덮어쓰면
      // "덮어썼는데 무엇을 덮어썼는지 모르는" 상황이 된다.
      const before = await findPageById(app.db, projectId, pageId)
      if (!before) {
        throw notFound()
      }

      // ops를 두 개로 만드는 이유: `applyOp`는 문서 루트(`""`)에 연산을 적용하지
      // 못하므로(`resolveSlot`이 거부한다) `{version, root}` 전체를 한 번에 갈아
      // 끼울 수 없다. `/root`와 `/version`을 따로 replace한다. `/version`이 같은
      // 값이어도 생략하지 않는다 — 두 필드를 항상 함께 기록해야 inverse가
      // 마이그레이션으로 올라간 버전까지 정확히 되돌린다.
      //
      // 이 `replace /version`은 파이프라인 7단계(`after.version !== before.version`이면
      // `invalid`)에 걸리지 않는다. **`MIGRATIONS`의 모든 단계가 `to <= CURRENT_DOCUMENT_VERSION`을
      // 지킨다는 전제 하에** `migrateDocument`는 목표 버전에 도달하거나 던지거나 둘 중
      // 하나이고, 저장된 문서(파이프라인 2단계)와 들어온 문서(위 2단계)를 둘 다 그
      // 함수에 태우므로 두 버전이 반드시 같다. 그 전제가 깨지면(어떤 단계의 `to`가
      // 목표를 넘으면) `migrateDocument`가 목표를 초과한 채 반환하므로 이 성질도 함께
      // 깨진다 — 그 보증은 `packages/schema`의 몫이다.
      const outcome = await applyEdit(app.db, {
        projectId,
        pageId,
        baseSeq: before.headSeq,
        ops: [
          { op: 'replace', path: '/root', value: migrated.root },
          { op: 'replace', path: '/version', value: migrated.version },
        ],
        actor: { type: 'user', id: currentUser.id, label: currentUser.name },
      })

      if (!outcome.ok) {
        throw toApiError(outcome, before.headSeq)
      }

      // 응답 형태는 바뀌지 않는다(페이지 객체 그대로). 바뀐 세 필드만 파이프라인
      // 결과로 덮어쓰고 나머지(제목·메뉴·순서)는 위에서 읽은 레코드를 쓴다 — 이
      // 엔드포인트는 그 필드들을 건드리지 않으므로 DB를 다시 조회할 이유가 없다.
      return toResponse({
        ...before,
        schema: outcome.schema,
        schemaVersion: outcome.schemaVersion,
        headSeq: outcome.seq,
      })
    })

    app.patch('/:projectId/pages/:pageId/ops', { preHandler: projectGuard('editor') }, async (request) => {
      const { projectId, pageId } = parseParams(PageParams, request.params)
      const body = parseBody(OpsBody, request.body)

      // `projectGuard('editor')`가 이미 인증을 요구하므로 여기 도달했다면
      // `currentUser`는 있다. 그래도 `as`로 좁히지 않고 던지는 이유: 이 핸들러는 아래에서
      // `currentUser.id`·`.name`을 **반드시** 읽으므로, `as` 버전은 가드가 빠지는 순간
      // 미인증 요청에 `null` 역참조로 500을 낸다(실측). 500은 처리되지 않은 프로그래밍
      // 오류지 "로그인이 필요하다"는 응답이 아니다 — 이 던지기가 그것을 401로 바꾼다.
      //
      // **actor 없는 revision이 로그에 남는 것을 막는 것은 아니다.** `applyEdit`에 넘길
      // actor를 만드는 시점에 이미 던지므로, `as` 버전이든 이쪽이든 그 경우엔 아무것도
      // 기록되지 않는다. 반면 `routes/revisions.ts`의 같은 검사는 성질이 다르다 —
      // 그쪽엔 `currentUser`를 역참조하지 않는 경로가 있어 검사가 사라지면 실제로
      // 미인증 요청에 데이터가 나간다.
      const currentUser = request.currentUser
      if (!currentUser) {
        throw unauthenticated()
      }

      // 검증·적용·역패치·기록은 전부 파이프라인이 한 트랜잭션 안에서 한다. 이
      // 핸들러는 그 결과를 HTTP로 옮기기만 한다 — P3의 WebSocket이 같은 `applyEdit`을
      // 부르므로, 규칙을 여기 두면 두 진입점이 갈라진다.
      const outcome = await applyEdit(app.db, {
        projectId,
        pageId,
        baseSeq: body.baseSeq,
        ops: body.ops,
        actor: { type: 'user', id: currentUser.id, label: currentUser.name },
      })

      if (!outcome.ok) {
        throw toApiError(outcome, body.baseSeq)
      }

      // 성공 결과의 `schema`(적용 후 문서 전체)는 응답에 싣지 않는다 — 클라이언트는
      // 같은 ops를 자기도 적용했으므로 문서를 이미 갖고 있다. 편집마다 문서 전체를
      // 되돌려 주면 이 엔드포인트를 타이핑 속도로 부르는 의미가 없어진다.
      // `clientOpId`는 요청에 있었을 때만 넣는다 — 서버가 만들어 내는 값이 아니라
      // 클라이언트가 맡긴 값을 그대로 되돌려 주는 것이므로, 없던 키가 생기면
      // 클라이언트의 pending 큐 대조가 어긋난다.
      return {
        seq: outcome.seq,
        revisionId: outcome.revisionId,
        inverse: outcome.inverse,
        schemaVersion: outcome.schemaVersion,
        ...(body.clientOpId !== undefined ? { clientOpId: body.clientOpId } : {}),
      }
    })

    app.delete('/:projectId/pages/:pageId', { preHandler: projectGuard('editor') }, async (request, reply) => {
      const { projectId, pageId } = parseParams(PageParams, request.params)

      const result = await deletePage(app.db, projectId, pageId)
      if (result === 'not-found') {
        throw notFound()
      }
      reply.code(204).send()
    })
  }
}
