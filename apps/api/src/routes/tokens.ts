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
 * **프로젝트 차원의 회수 수단은 이미 있다: 멤버십 제거다.** 멤버에서 빼면 그 사람의 그 프로젝트
 * 토큰이 같은 트랜잭션에서 지워진다(`repos/api-tokens.ts`의 `deleteMemberTokens` — `test/api-tokens.test.ts`가
 * 든다). owner가 남의 토큰 행을 하나씩 지울 필요가 없다.
 *
 * ---
 *
 * # 내 토큰은 프로젝트를 가로지른다 — `/api/auth/tokens`
 *
 * 위 셋은 프로젝트 아래라 **그 프로젝트의 멤버만** 부른다(가드가 비멤버에게 404). 그런데 멤버가 아닌 프로젝트의 토큰도 남을 수
 * 있다 — 멤버 제거가 지우지만(`deleteMemberTokens`) 제거와 겹쳐 발급하자마자 쓰인 토큰은 건너뛰고(그 함수의 `SKIP LOCKED`),
 * 이 표를 훑어 지우는 마이그레이션이 없어 제거가 토큰을 안 지우는 판으로 빠진 멤버의 토큰도 남아 있을 수 있다. 그 토큰은
 * 비멤버인 동안 404 로 잠들었다가 **다시 멤버가 되면 산다.**
 * 옛 비밀번호가 새어 토큰을 거둘 사람에게는 그 프로젝트 목록이 안 보이므로, 계정 아래에 **로그인한 사람의 토큰 전부**를
 * 프로젝트 · 멤버 여부와 함께 내는 목록 · 하나 폐기 · 전부 폐기를 둔다(`myTokenRoutes`). 세션으로만 부르는 규칙은 같다.
 *
 * **비멤버 프로젝트의 이름은 안 싣는다**(`projectName: null`) — 그 프로젝트의 id 만 낸다. 판정: *"한때 멤버였던 사람에게
 * 이름이 새는가"* — **샌다.** 토큰은 멤버일 때만 발급되니 그 사람은 발급 때의 이름을 알았지만, 응답이 싣는 것은 **지금의**
 * 이름이다. 빠진 뒤 owner 가 바꾼 이름은 그 사람이 모르는 것이고, 설계서 「권한 모델」은 비멤버에게 프로젝트를 404 로
 * 숨긴다. id 는 그 사람이 토큰을 발급할 때 이미 받은 값이라 새는 것이 없다. **숨기지 못하는 것 하나 — 그 프로젝트가 아직
 * 있다는 사실.** 토큰 행은 프로젝트 삭제의 CASCADE 로 함께 사라지므로 줄이 보이면 프로젝트가 있다. 지울 줄을 보여 주려면
 * 피할 수 없고, 그 사람이 거둬야 할 자격이 그 프로젝트에 살아 있다는 뜻이기도 하다.
 *
 * **폐기에 재확인을 걸지 않는다** — 권한을 줄이는 쓰기다(설계서 「권한 모델」의 «예외는 자기 API 토큰의 폐기다»). 잠금을
 * 기다리는 사이 로그아웃했다고 폐기를 되돌리면 거두려던 자격이 남는다.
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
 * | `/api/auth/tokens`를 토큰으로 부름 | **401**(`:projectId`가 없는 라우트라 토큰이 사람을 안 채운다 — `auth/plugin.ts`) |
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { projectGuard, recheckProjectRole } from '../auth/roles'
import { requireSessionUser as requireSession } from '../auth/session-only'
import { containsNulByte } from '../db/nul-guard'
import { withTransaction } from '../db/tx'
import { badRequest, notFound } from '../errors'
import { parseBody, parseParams } from '../http/parse'
import {
  deleteAllUserTokens,
  deleteApiToken,
  deleteUserToken,
  insertApiToken,
  listApiTokens,
  listUserTokens,
  type ApiTokenRecord,
  type MyApiTokenRecord,
} from '../repos/api-tokens'
import { lockProjectShared } from '../repos/projects'

const ProjectIdParams = z.object({ projectId: z.uuid() })
const TokenParams = z.object({ projectId: z.uuid(), tokenId: z.uuid() })
const MyTokenParams = z.object({ tokenId: z.uuid() })

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

/** «내 토큰» 목록의 형태 — 위에 프로젝트 칸 셋을 더한다. `projectName`은 멤버일 때만 있다(머리말 «내 토큰은 프로젝트를 가로지른다»). */
function toMyResponse(record: MyApiTokenRecord) {
  return {
    ...toResponse(record),
    projectId: record.projectId,
    projectName: record.projectName,
    member: record.member,
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
 * **로그인한 사람의 토큰 전부** — `/api/auth` 아래에 등록한다(머리말 «내 토큰은 프로젝트를 가로지른다»). 가드가
 * `requireAuth`다 — 프로젝트가 없으니 역할을 볼 자리가 없고, 다루는 것은 자기 자격뿐이다.
 */
export function myTokenRoutes() {
  return async function plugin(app: FastifyInstance): Promise<void> {
    /** 목록. **원문이 없다.** 비멤버 프로젝트의 줄은 `projectName: null`이다. */
    app.get('/tokens', { preHandler: app.requireAuth }, async (request) => {
      const currentUser = requireSessionUser(request)
      const records = await listUserTokens(app.db, currentUser.id)
      return records.map(toMyResponse)
    })

    /** 하나 폐기 — 어느 프로젝트의 것이든. 남의 토큰 id · 없는 id 는 404 다. */
    app.delete('/tokens/:tokenId', { preHandler: app.requireAuth }, async (request, reply) => {
      const { tokenId } = parseParams(MyTokenParams, request.params)
      const currentUser = requireSessionUser(request)
      if (!(await deleteUserToken(app.db, currentUser.id, tokenId))) {
        throw notFound('토큰을 찾을 수 없습니다')
      }
      return reply.status(204).send()
    })

    /** 전부 폐기. 지운 수를 낸다(0 이어도 200 — «남은 토큰이 없다»가 이루려던 상태다). */
    app.delete('/tokens', { preHandler: app.requireAuth }, async (request) => {
      const currentUser = requireSessionUser(request)
      return { revoked: await deleteAllUserTokens(app.db, currentUser.id) }
    })
  }
}

/**
 * 토큰 관리 여섯(«내 토큰» 셋 포함)이 같은 문장으로 거절하게 한 자리에 둔다 — 판정은 `auth/session-only.ts`.
 */
function requireSessionUser(request: Parameters<typeof requireSession>[0]) {
  return requireSession(request, 'API 토큰으로는 토큰을 관리할 수 없습니다. 로그인 후 다시 시도하세요')
}
