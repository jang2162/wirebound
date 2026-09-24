/**
 * 편집 이력 조회 라우트: `GET /:projectId/pages/:pageId/revisions` 하나뿐이다.
 * `pageRoutes`(`routes/pages.ts`)와 같은 `/api/projects` prefix로 등록한다(`app.ts`) —
 * 파일은 분리하되 URL 네임스페이스는 공유한다(`routes/tree.ts`와 같은 관례).
 *
 * **이 엔드포인트의 존재 이유는 설계서 「개인 undo/redo」의 "새로고침 후 undo 스택 복원"이다.**
 * 클라이언트가 페이지를 다시 열면 자기 actor의 최근 revision을 받아, 그 `inverse`를
 * 그대로 `PATCH .../ops`로 되보내는 것만으로 undo를 한다 — 서버에 undo라는 개념은
 * 없다. 그래서 응답은 `inverse`를 **가공 없이** 실어 준다.
 *
 * 조회 전용이므로 `projectGuard('viewer')`다(설계서 「권한 모델」). 이력은 프로젝트 멤버 모두가
 * 읽을 수 있고, `mine=true`는 권한이 아니라 편의(자기 스택 복원)를 위한 필터다.
 *
 * HTTP·zod만 다룬다 — SQL은 `repos/revisions.ts`(`listRevisions`)와
 * `repos/pages.ts`(`findPageById`)에 맡긴다(`apps/api/README.md` 「계층 규칙」 절).
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { projectGuard } from '../auth/roles'
import { notFound, unauthenticated } from '../errors'
import { parseParams, parseQuery } from '../http/parse'
import { findPageById } from '../repos/pages'
import { listRevisions, type RevisionRecord } from '../repos/revisions'

const PageParams = z.object({ projectId: z.uuid(), pageId: z.uuid() })

/** `z.strictObject`라 선언되지 않은 쿼리 키가 오면 그 자체로 400이다(본문 스키마와 같은 관례). */
const RevisionQuery = z.strictObject({
  /**
   * `'true'`면 호출자 자신의 revision만 고른다(설계서 「개인 undo/redo」의 스택 복원).
   * 쿼리스트링 값은 언제나 문자열이므로 `z.boolean()`이 아니라 리터럴 두 개를 받는다.
   * 생략하면 그 페이지의 이력 전체다 — 기본을 `mine`으로 두면 "누가 무엇을 고쳤는지"를
   * 보는 쪽(이력 패널)이 매번 명시적으로 꺼야 한다.
   */
  mine: z.enum(['true', 'false']).optional(),
  /**
   * 상한 200. 설계서 「개인 undo/redo」가 요구하는 것은 50이고, 그 몇 배까지 열어 둔다.
   * jsonb 두 컬럼(`ops`·`inverse`)을 함께 싣기 때문에 응답이 항목 수에 비례해 무거워진다.
   */
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

/**
 * API 계약이 노출하는 필드만 담는다. 지금은 `RevisionRecord`와 필드가 같지만 그래도
 * 명시적으로 투영한다 — 레코드를 그대로 흘려보내면 나중에 저장소 타입에 필드가 붙는
 * 순간(예: `pageId`) 응답 계약이 조용히 넓어진다.
 *
 * `createdAt`은 `Date`를 그대로 넘긴다 — Fastify가 ISO 8601 문자열로 직렬화한다
 * (`routes/members.ts`의 `invitedAt`과 같은 관례).
 */
function toResponse(revision: RevisionRecord) {
  return {
    id: revision.id,
    seq: revision.seq,
    actorType: revision.actorType,
    actorId: revision.actorId,
    actorLabel: revision.actorLabel,
    ops: revision.ops,
    inverse: revision.inverse,
    createdAt: revision.createdAt,
  }
}

/** `app.ts`가 `app.register(revisionRoutes(), { prefix: '/api/projects' })`로 등록하는 팩토리. */
export function revisionRoutes() {
  return async function plugin(app: FastifyInstance): Promise<void> {
    app.get('/:projectId/pages/:pageId/revisions', { preHandler: projectGuard('viewer') }, async (request) => {
      const { projectId, pageId } = parseParams(PageParams, request.params)
      const query = parseQuery(RevisionQuery, request.query)

      // `projectGuard('viewer')`가 이미 인증을 요구하므로 여기 도달했다면 `currentUser`는
      // 있다. 그래도 `as`로 좁히지 않고 던지는 이유: **이 핸들러에는 `currentUser`를 한 번도
      // 역참조하지 않는 경로가 있다.** `mine`을 생략하면 아래 조회가 `actorId`를 넘기지
      // 않으므로 `currentUser.id`를 읽지 않는다. 그래서 언젠가 가드가 빠지면 `as` 버전은
      // 미인증 요청에 401이 아니라 **200과 그 페이지의 이력**을 돌려준다(실측: 가드와 이
      // 던지기를 함께 없애면 `미인증은 401이다`가 200을 받는다).
      //
      // **가드까지 함께 빠진 상태에서는**, 이 검사를 `mine === 'true'` 분기 안으로
      // 옮기는 것만으로 그 누수가 실제로 열린다(가드가 살아 있으면 미인증 요청이
      // 여기까지 오지 못하므로 위치는 무관하다).
      //
      // 이 성질은 테스트 하나로 고정되지 않는다 — `미인증은 401이다`는 가드만 있어도,
      // 이 던지기만 있어도 통과한다. 둘을 동시에 없애야 실패한다.
      const currentUser = request.currentUser
      if (!currentUser) {
        throw unauthenticated()
      }

      // **페이지 존재를 먼저 확인한다.** 이 확인이 없으면 남의 프로젝트 페이지 id로
      // 조회했을 때 `listRevisions`가 그 페이지의 이력을 그대로 돌려준다 —
      // `revisions`에는 `project_id`가 없어 `page_id`만으로 좁히기 때문이다. 즉
      // 프로젝트 경계가 이 확인 하나에 걸려 있다(설계서 「권한 모델」: 다른 프로젝트의 id가
      // 존재를 흘리면 안 된다).
      //
      // `findPageById`는 `schema` 컬럼까지 함께 읽어 온다 — 존재 확인에는 과하지만,
      // 이 응답은 revision마다 `ops`·`inverse` 두 jsonb를 싣기 때문에 문서 한 벌이
      // 지배적인 비용이 아니다. 가벼운 존재 확인 전용 조회를 새로 만드는 것보다
      // 페이지 조회 경로가 하나인 편이 낫다.
      const page = await findPageById(app.db, projectId, pageId)
      if (!page) {
        throw notFound()
      }

      const revisions = await listRevisions(app.db, pageId, {
        ...(query.mine === 'true' ? { actorId: currentUser.id } : {}),
        limit: query.limit,
      })

      // 배열을 그대로 낸다 — `/projects`·`/members`·`/menu`가 전부 그렇다.
      // `{ revisions: [...] }` 같은 두 번째 관용구를 늘리지 않는다.
      return revisions.map(toResponse)
    })
  }
}
