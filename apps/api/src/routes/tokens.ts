/**
 * API 토큰 라우트 — 설계서 「권한 모델」의 *"API 토큰은 발급자의 권한을 상속한다 … 토큰
 * 스코프는 프로젝트 단위다"*. `pageRoutes`와 같은 `/api/projects` prefix로 등록한다.
 *
 * HTTP·zod만 다룬다 — SQL은 `repos/api-tokens.ts`, 자격을 사람으로 바꾸는 것은
 * `auth/plugin.ts`, 권한 판정은 `auth/roles.ts`의 `projectGuard` 하나다.
 *
 * ---
 *
 * # 발급은 멤버 누구나 한다
 *
 * 설계서 「권한 모델」의 viewer 행이 *"API 토큰 발급은 된다(토큰은 발급자의 권한을 넘지
 * 않는다)"*이다. 그래서 가드가 `projectGuard('viewer')`이고, **그 토큰이 무엇을 할 수
 * 있는지는 이 파일이 정하지 않는다** — 요청 시점에 `requireProjectRole`이
 * `project_members`를 읽어 정한다. viewer가 발급한 토큰은 조회만 된다 — 토큰은 새 권한을
 * 만들지 않는다.
 *
 * ---
 *
 * # 이 셋은 **세션으로만** 부를 수 있다
 *
 * `authKind`가 `'token'`이면 403이다. **근거: 폐기가 자격을 실제로 거둘 수 있어야 한다.**
 * 토큰으로 토큰을 만들 수 있으면 새어 나간 토큰 하나가 스스로 대체품을 남기고, 폐기는
 * 그 사슬을 못 끊는다 — *"폐기할 수 없는 자격은 두지 않는다"*가 그때 거짓이 된다.
 *
 * ---
 *
 * # 목록·폐기는 **자기 것만** 본다
 *
 * 설계서 「권한 모델」은 이 범위를 적지 않는다. 발급이 viewer에게 열려 있으므로 프로젝트
 * 단위로 열면 **viewer가 owner의 토큰을 지울 수 있다** — viewer에게 열린 쓰기는 자기
 * 토큰 발급 하나이고, 남의 자격을 거두는 것은 그 밖이다.
 *
 * **프로젝트 차원의 회수 수단은 이미 있다: 멤버십 제거다.** 역할이 요청 시점에
 * 결정되므로, 멤버에서 빼면 그 사람의 토큰 전부가 그 프로젝트에서 **404**가 된다
 * (`test/api-tokens.test.ts`가 든다). owner가 남의 토큰 행을 지울 필요가 없다.
 *
 * ---
 *
 * # 오류 표
 *
 * | 상황 | 상태 |
 * |---|---|
 * | 이름이 1~60자 밖 | **400**(본문 zod) |
 * | 이름에 NUL(U+0000) | **400** |
 * | 토큰으로 부름 | **403** |
 * | 없는 토큰 id · 남의 토큰 id | **404**(존재를 숨긴다) |
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { projectGuard, recheckProjectRole } from '../auth/roles'
import { containsNulByte } from '../db/nul-guard'
import { withTransaction } from '../db/tx'
import { badRequest, forbidden, notFound, unauthenticated } from '../errors'
import { parseBody, parseParams } from '../http/parse'
import { deleteApiToken, insertApiToken, listApiTokens, type ApiTokenRecord } from '../repos/api-tokens'
import { lockProjectShared } from '../repos/projects'

const ProjectIdParams = z.object({ projectId: z.uuid() })
const TokenParams = z.object({ projectId: z.uuid(), tokenId: z.uuid() })

/**
 * 이름은 **사람이 이 자격을 알아보는 꼬리표다** — `snapshots.tag`와 같은 1~60자를 쓴다.
 * `z.strictObject`라 선언되지 않은 키는 그 자체로 400이다(이 저장소의 관례).
 */
const CreateTokenBody = z.strictObject({
  name: z.string().min(1, '이름을 입력하세요').max(60, '이름은 60자 이하여야 합니다'),
})

/** 목록·폐기가 내는 형태. **원문(`value`)이 없다** — 발급 응답만 그것을 낸다. */
function toResponse(record: ApiTokenRecord) {
  return {
    id: record.id,
    name: record.name,
    createdAt: record.createdAt,
    lastUsedAt: record.lastUsedAt,
  }
}

export function tokenRoutes() {
  return async function plugin(app: FastifyInstance): Promise<void> {
    /**
     * 토큰을 발급한다. **원문이 실리는 유일한 응답이다** — 다시 볼 수 없다.
     *
     * `projectGuard('viewer')`가 이미 인증을 요구하므로 여기 도달했다면 `currentUser`는
     * 있다. `as`로 좁히지 않고 던지는 것은 `routes/snapshots.ts`와 같은 근거다 —
     * 가드가 빠지는 순간 `as` 버전은 미인증 요청에 `null` 역참조로 500을 낸다.
     */
    app.post('/:projectId/tokens', { preHandler: projectGuard('viewer') }, async (request, reply) => {
      const { projectId } = parseParams(ProjectIdParams, request.params)
      const body = parseBody(CreateTokenBody, request.body)

      if (containsNulByte(body.name)) {
        throw badRequest('토큰 이름에 NUL 문자(U+0000)를 포함할 수 없습니다')
      }

      const currentUser = requireSessionUser(request)
      const issued = await withTransaction(app.db, async (trx) => {
        // **프로젝트 행이 먼저다**(`repos/projects.ts`의 `lockProjectShared`). 삽입의 FK 도 같은 `KEY SHARE`를 걸지만
        // 그것은 프로젝트 삭제 뒤에 섰다가 깨면 23503 — 봉투 없는 500 이다. 먼저 잡으면 0 행 → 404.
        await lockProjectShared(trx, projectId)
        const inserted = await insertApiToken(trx, { projectId, userId: currentUser.id, name: body.name })
        // **커밋 순간의 권한**(`auth/roles.ts`의 `recheckProjectRole`). 삽입의 FK 가 프로젝트 행에 거는
        // `KEY SHARE`가 복원 · 프로젝트 삭제의 `FOR UPDATE` 뒤에 섰을 수 있다 — 그 사이 멤버에서 빠졌으면 404 다(가드가
        // `viewer`라 한 단계 내릴 자리는 없다). 원문이 나가기 전에 되돌린다.
        await recheckProjectRole(trx, request)
        return inserted
      })

      // **`value`는 여기서만 나간다.** 저장된 것은 해시뿐이라 이 뒤로는 낼 수단이 없다.
      return reply.status(201).send({ ...toResponse(issued.record), value: issued.value })
    })

    /** 자기가 이 프로젝트에서 만든 토큰 전부. **원문이 없다.** */
    app.get('/:projectId/tokens', { preHandler: projectGuard('viewer') }, async (request) => {
      const { projectId } = parseParams(ProjectIdParams, request.params)
      const currentUser = requireSessionUser(request)
      const records = await listApiTokens(app.db, projectId, currentUser.id)
      return records.map(toResponse)
    })

    /** 폐기. 남의 토큰 id·없는 id는 404다(존재를 숨긴다). */
    app.delete('/:projectId/tokens/:tokenId', { preHandler: projectGuard('viewer') }, async (request, reply) => {
      const { projectId, tokenId } = parseParams(TokenParams, request.params)
      const currentUser = requireSessionUser(request)

      const deleted = await deleteApiToken(app.db, projectId, currentUser.id, tokenId)
      if (!deleted) {
        throw notFound('토큰을 찾을 수 없습니다')
      }
      return reply.status(204).send()
    })
  }
}

/**
 * 이 요청이 **세션으로** 인증됐는지 확인하고 그 사용자를 낸다. 토큰이면 403이다.
 *
 * 근거는 이 파일 머리말의 *"이 셋은 세션으로만 부를 수 있다"*에 있다. 셋이 같은 문장을
 * 쓰도록 함수 하나로 둔다 — 갈리면 한 라우트만 열려 있는 상태가 조용히 생긴다.
 */
function requireSessionUser(request: {
  currentUser: { id: string; email: string; name: string } | null
  authKind: 'session' | 'token' | null
}): { id: string; email: string; name: string } {
  const currentUser = request.currentUser
  if (!currentUser) {
    throw unauthenticated()
  }
  if (request.authKind !== 'session') {
    throw forbidden('API 토큰으로는 토큰을 관리할 수 없습니다. 로그인 후 다시 시도하세요')
  }
  return currentUser
}
