/**
 * 프로젝트 권한 가드. 설계 §10의 권한 모델을 구현하는 단일 지점이다.
 *
 * `requireProjectRole`은 Fastify를 전혀 모른다 — `db` 핸들과 `projectId`·`userId`·
 * 최소 역할 네 값만 받고 `ApiError`를 던진다. `projectGuard`는 그 위에 얹은 얇은
 * Fastify preHandler 껍데기일 뿐이다.
 *
 * **P3의 WebSocket은 껍데기를 새로 만들지 않았다 — 이 문단이 그렇게 예상했지만 거짓이었다
 * (P3-1이 재서 고쳐 적는다).** `@fastify/websocket`은 업그레이드 요청을 평범한 라우트로
 * 태우고 훅을 전부 돌린 뒤에야 소켓을 넘기므로, `ws/routes.ts`가 **`projectGuard('viewer')`를
 * 그대로 preHandler로 쓴다.** 설계 §10의 *"REST와 WebSocket이 동일한 가드 함수를 쓴다"*가
 * 글자 그대로 지켜진다.
 *
 * **연결 도중의 재확인은 다른 자리다.** §10의 *"각 patch 수신 시 한 번"*은 preHandler가
 * 닿지 않는 곳이므로 `ws/broadcast.ts`의 `stillAllowed`가 `findMembership`·`roleAtLeast`를
 * 직접 조합한다 — 그쪽도 이 파일의 함수를 쓰지 자기 판정을 만들지 않는다.
 *
 * **역할을 비교하는 코드는 이 파일의 `roleAtLeast` 하나뿐이어야 한다.** 다른 곳에서
 * 역할 순위를 다시 비교하는 코드를 쓰면 이 가드의 판정과 갈라질 수 있다.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify'
import { z } from 'zod'
import type { DbHandle } from '../db/tx'
import type { ProjectRole } from '../db/types'
import { forbidden, notFound, unauthenticated } from '../errors'
import { parseParams } from '../http/parse'

/** 컬럼 타입과 도메인 타입이 갈라지지 않도록 `db/types.ts`의 타입을 그대로 재수출한다. */
export type { ProjectRole }

declare module 'fastify' {
  interface FastifyRequest {
    /** `projectGuard`를 통과하면 실제 역할이 담긴다. 가드를 거치지 않은 요청은 `null`이다. */
    projectRole: ProjectRole | null
  }
}

/** 역할 순위. 숫자가 클수록 강한 권한이다(설계 §10: viewer < editor < owner). */
export const ROLE_RANK: Record<ProjectRole, number> = {
  viewer: 0,
  editor: 1,
  owner: 2,
}

/**
 * `actual`이 `min` 이상의 권한을 가지는지 비교한다.
 * **두 역할을 비교하는 코드베이스의 유일한 지점이다** — 다른 곳에서 `ROLE_RANK`를
 * 직접 비교하거나 역할 순서를 재구현하지 않는다.
 */
export function roleAtLeast(actual: ProjectRole, min: ProjectRole): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[min]
}

/**
 * 사용자가 프로젝트의 멤버인지 조회한다. 멤버가 아니면 `null`이다 — 프로젝트
 * 자체가 없는 경우와, 프로젝트는 있지만 이 사용자가 멤버가 아닌 경우를 구분하지
 * 않는다. `requireProjectRole`이 이 성질을 그대로 이용해 404/403을 가른다.
 */
export async function findMembership(db: DbHandle, projectId: string, userId: string): Promise<ProjectRole | null> {
  const row = await db
    .selectFrom('project_members')
    .select('role')
    .where('project_id', '=', projectId)
    .where('user_id', '=', userId)
    .executeTakeFirst()

  return row?.role ?? null
}

/**
 * 프로젝트에 대한 최소 역할을 요구한다. 설계 §10의 404/403 규칙을 구현하는 단일 함수다.
 *
 * | 상황 | 응답 |
 * |---|---|
 * | 프로젝트가 없다 | 404 |
 * | 프로젝트는 있지만 멤버가 아니다 | 404 — 존재를 숨긴다 |
 * | **자격이 다른 프로젝트에 묶여 있다**(API 토큰) | **404** — 아래 `scopeProjectId` |
 * | 멤버지만 역할이 모자라다 | 403 |
 *
 * 앞의 두 상황은 `findMembership`이 똑같이 `null`을 돌려주므로 조회 한 번으로
 * 구분 없이 처리된다 — 존재하지 않는 프로젝트와 멤버가 아닌 프로젝트가 같은
 * 응답을 내야 프로젝트 id의 존재 여부가 비멤버에게 새어 나가지 않는다.
 *
 * Fastify를 전혀 모른다: `db`·`projectId`·`userId`·`min`과 스코프만 받고 `ApiError`를
 * 던진다. `projectGuard`(REST)와 P3의 WebSocket 껍데기가 이 함수를 함께 재사용한다.
 */
export async function requireProjectRole(
  db: DbHandle,
  projectId: string,
  userId: string,
  min: ProjectRole,
  /**
   * **이 요청의 자격이 묶인 프로젝트**(P9-2 D4). 세션 쿠키는 묶이지 않으므로 `null`이고,
   * API 토큰은 §10대로 프로젝트 하나에 묶인다.
   *
   * **스코프 밖은 *"멤버가 아니다"*와 같게 다룬다 — 그래서 404다**(403이 아니다).
   * 남의 프로젝트 id를 토큰으로 찔러 존재를 알아낼 수 없어야 하고(§10), 그 성질을 이미
   * 갖고 있는 것이 위 표의 둘째 줄이다. **판정을 여기 두는 것이 요점이다** — 훅이나
   * 라우트에 두면 *"역할을 비교하는 코드는 한 자리"*가 두 자리가 된다.
   */
  scopeProjectId: string | null = null,
): Promise<ProjectRole> {
  const outOfScope = scopeProjectId !== null && scopeProjectId !== projectId
  const role = outOfScope ? null : await findMembership(db, projectId, userId)
  if (!role) {
    throw notFound('프로젝트를 찾을 수 없습니다')
  }
  if (!roleAtLeast(role, min)) {
    throw forbidden('이 작업을 수행할 권한이 없습니다')
  }
  return role
}

/**
 * `projectGuard`가 경로 파라미터에서 읽는 스키마. `z.object`(비엄격)를 쓴다 —
 * 이후 태스크가 `/projects/:projectId/pages/:pageId`처럼 `projectId` 외의
 * 파라미터를 함께 갖는 라우트에도 이 가드를 그대로 붙일 수 있어야 한다.
 */
const ProjectParams = z.object({ projectId: z.uuid() })

/**
 * `requireProjectRole`을 감싼 Fastify preHandler. 라우트에
 * `{ preHandler: projectGuard('editor') }` 형태로 붙인다.
 *
 * - `request.params.projectId`를 uuid로 파싱한다(형식이 틀리면 `parseParams`가 400을 던진다).
 * - 로그인하지 않았으면(`request.currentUser`가 없으면) 401을 던진다.
 * - `requireProjectRole`의 결과(사용자의 실제 역할)를 `request.projectRole`에 담는다.
 *
 * 이 함수 자체는 얇은 껍데기일 뿐 판정 로직을 갖지 않는다 — 전부 `requireProjectRole`이
 * 한다.
 *
 * **WebSocket의 방 입장이 이 함수를 그대로 쓴다**(P3-1 — 이 자리에 *"자신만의 껍데기를
 * 만든다"*고 적혀 있던 예상은 거짓이었고, 리뷰가 이 사본이 남은 것을 찾았다).
 * `ws/routes.ts`가 `{ websocket: true, preHandler: projectGuard('viewer') }`로 단다 —
 * `@fastify/websocket`이 업그레이드 요청을 평범한 라우트로 태우고 훅을 전부 돌린 뒤에야
 * 소켓을 넘기기 때문이다.
 *
 * **연결 도중의 재확인만 다른 자리다.** §10의 *"각 patch 수신 시 한 번"*은 preHandler가
 * 닿지 않으므로 `ws/broadcast.ts`의 `stillAllowed`가 `findMembership`·`roleAtLeast`를 직접
 * 조합한다. **그 함수의 최소 역할은 `viewer`이고 그것이 옳다 — 받는 기준이기 때문이다.**
 * **보내는 것(patch)에 그것을 그대로 쓰면 안 된다:** §10이 viewer를 *"조회 전용 — 편집·
 * 코멘트 모두 불가"*로 못박았으므로, WS로 편집을 받는 경로(P3-2)는 `editor` 이상을 따로
 * 요구해야 한다.
 */
export function projectGuard(min: ProjectRole): preHandlerHookHandler {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    const { projectId } = parseParams(ProjectParams, request.params)
    if (!request.currentUser) {
      throw unauthenticated()
    }
    request.projectRole = await requireProjectRole(
      request.server.db,
      projectId,
      request.currentUser.id,
      min,
      // **API 토큰이 실린 요청이면 그 토큰의 프로젝트다**(P9-2 D4). 세션이면 `null`이라
      // 위 함수의 스코프 검사가 그대로 지나간다 — 기존 호출자의 행동이 바뀌지 않는다.
      request.tokenProjectId,
    )
  }
}

/**
 * `FastifyRequest.projectRole` 데코레이터를 등록한다. `app.ts`의 `buildApp`이
 * 한 번 부른다 — `registerAuthPlugin`이 `currentUser`를 등록하는 것과 같은 자리다.
 */
export function registerProjectRoleDecorator(app: FastifyInstance): void {
  app.decorateRequest('projectRole', null)
}
