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
 * 4. 통과한 문서만 `updatePageSchema`로 저장한다.
 * 1·3단계가 갈리는 이유: "요청이 잘못됨"(400)과 "내용이 처리 불가함"(422)은 다른
 * 성질이다(설계 §13). 1~3 중 어디서든 실패하면 저장(4단계)에 도달하지 못하므로
 * 기존 `schema`는 그대로 남는다 — 이 게이트가 존재하는 이유 자체다.
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
import { badRequest, notFound, validationFailed } from '../errors'
import { parseBody, parseParams } from '../http/parse'
import {
  MenuNodeNotFoundError,
  deletePage,
  findPageById,
  insertPage,
  updatePage,
  updatePageSchema,
  type PageRecord,
} from '../repos/pages'

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
      // 여기서 잡지 않으면 그 페이지의 모든 후속 GET이 처리되지 않은 예외로 500이
      // 되고, PUT과 달리 그 페이지는 고칠 방법(같은 GET)조차 막혀 영구히 죽는다.
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
      if (containsNulByte(migrated)) {
        throw badRequest('문서에 NUL 문자(U+0000)를 포함할 수 없습니다')
      }

      // 4단계: 통과한 문서만 저장한다.
      const page = await updatePageSchema(app.db, projectId, pageId, migrated, migrated.version)
      if (!page) {
        throw notFound()
      }
      return toResponse(page)
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
