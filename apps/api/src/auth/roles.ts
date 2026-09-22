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
import { assertLocking } from '../db/locking'
import type { DbHandle } from '../db/tx'
import type { ProjectRole } from '../db/types'
import { forbidden, notFound, unauthenticated } from '../errors'
import { requestClientKind } from './actor'
import { parseParams } from '../http/parse'

/** 컬럼 타입과 도메인 타입이 갈라지지 않도록 `db/types.ts`의 타입을 그대로 재수출한다. */
export type { ProjectRole }

declare module 'fastify' {
  interface FastifyRequest {
    /** `projectGuard`를 통과하면 실제 역할이 담긴다. 가드를 거치지 않은 요청은 `null`이다. */
    projectRole: ProjectRole | null
    /**
     * `projectGuard`가 **요구한** 최소 역할. 가드를 거치지 않은 요청은 `null`이다. 커밋 직전의 재확인
     * (`recheckProjectRole`)이 가드와 **같은 값**으로 보게 하려고 남긴다 — 라우트가 역할을 두 자리에 적지 않는다.
     */
    projectGuardMin: ProjectRole | null
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
export async function findMembership(
  db: DbHandle,
  projectId: string,
  userId: string,
  /** `'share'`면 그 멤버 행을 `FOR SHARE`로 잡는다 — 커밋 순간의 재확인만 쓴다(`recheckProjectRole`). */
  lock: 'none' | 'share' = 'none',
): Promise<ProjectRole | null> {
  const query = db
    .selectFrom('project_members')
    .select('role')
    .where('project_id', '=', projectId)
    .where('user_id', '=', userId)
  if (lock === 'share') assertLocking(db, 'findMembership')
  const row = await (lock === 'share' ? query.forShare() : query).executeTakeFirst()

  return row?.role ?? null
}

/**
 * **자격이 다른 프로젝트에 묶여 있는가**(API 토큰 — P9-2 D4). 세션은 묶이지 않으므로(`null`) 늘 거짓이다.
 *
 * `requireProjectRole`이 이것으로 스코프 밖을 404 로 만든다. **밖에 내놓는 것은 부르는 자리가 둘이라서다** —
 * 코멘트 게시의 재생이 가드 **앞**에서 돌며 같은 판정을 먼저 봐야 한다(`routes/comments.ts`의
 * `replayBeforeGuard`). 술어를 거기 한 벌 더 쓰면 아래 문단의 *"두 자리"*가 된다.
 */
export function outOfTokenScope(scopeProjectId: string | null, projectId: string): boolean {
  return scopeProjectId !== null && scopeProjectId !== projectId
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
  /** 멤버 행을 잡는가 — `findMembership`의 같은 인자. 가드는 안 잡고 커밋 순간의 재확인만 잡는다. */
  lock: 'none' | 'share' = 'none',
): Promise<ProjectRole> {
  const role = outOfTokenScope(scopeProjectId, projectId) ? null : await findMembership(db, projectId, userId, lock)
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

    // **입력 검증이 조작보다 먼저 선다** (P9-5 리뷰 지적 1). `x-wb-client`가 모르는 값이면
    // 여기서 400이고, **핸들러 본문은 아예 안 돈다.**
    //
    // 앞 판은 이 검사가 `requestActor` 안에만 있었다 — 곧 *"핸들러가 actor를 만들 때"*가
    // 검사 시점이었다. 대부분의 쓰기는 `applyEdit` 앞에서 actor를 만들어 무해했는데
    // **복원 하나만** 반대였다: `restoreSnapshot`이 자기 트랜잭션을 커밋한 **뒤**
    // `notifyRestored`가 처음 헤더를 봐서, 400을 받은 클라이언트 몰래 프로젝트가 통째로
    // 되돌아가고 룸에는 아무것도 안 갔다(리뷰어가 진짜 Postgres로 실증했다).
    //
    // **핸들러 두 줄을 위로 올리는 것으로는 다음 라우트를 못 막는다** — 순서를 지키는 자가
    // 산문뿐이기 때문이다. preHandler로 올리면 *"본문보다 먼저"*가 **구조**가 되고,
    // `actor-census.test.ts`의 라우트 인구조사가 등록된 `:projectId` 라우트 **전부**에
    // 대해 그것을 잰다.
    //
    // **읽기도 지난다.** 읽기는 `actorType`을 안 쓰지만, 헤더 오타를 **첫 요청에서** 알려
    // 주는 편이 낫다 — 쓸 때까지 모르면 그 사이 요청들이 조용히 기본값으로 기록된다.
    requestClientKind(request)

    if (!request.currentUser) {
      throw unauthenticated()
    }
    request.projectGuardMin = min
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
 * **커밋 순간의 권한으로 판정한다**(이월 AA · 2026-09-22). 쓰기 트랜잭션 **안에서**, 페이지 잠금을 잡은
 * **뒤에** 부른다 — 가드(`projectGuard`)가 핸들러 앞에서 한 번 본 것을 그 자리에서 다시 본다.
 *
 * **왜 필요한가.** 가드는 잠금 **밖**에서 한 번 돈다. 쓰기가 페이지 잠금에 쥐인 동안 그 사람이 강등되거나
 * 멤버에서 빠져도, 잠금이 풀리면 **그 사람 이름으로 커밋됐다**(좁은 반증 4차 a-4 — Chrome · psql 이 페이지
 * 행을 22s 쥔 판: 22s 에 커밋된 행의 작성자는 그 순간 이미 viewer·비멤버였다). 잠금 대기가 길수록 가드의
 * 판정은 낡는다 — 여기서 다시 보면 판정이 **커밋과 같은 트랜잭션**의 것이 된다.
 *
 * **술어는 가드와 같다 — `requireProjectRole` 하나다.** 입력도 가드와 같은 자리에서 읽는다: 프로젝트는 경로
 * (`ProjectParams`), 사람은 `currentUser`, 최소 역할은 **가드가 남긴 `projectGuardMin`**, 스코프는
 * `tokenProjectId`. 그래서 거절도 가드와 같은 상태 코드 · 봉투다(비멤버 404 · 역할 모자람 403).
 * 던지면 부른 쪽의 트랜잭션이 되돌아간다.
 *
 * **멤버 행을 `FOR SHARE`로 잡는다.** 잡지 않으면 «재확인 → (역할 변경 커밋) → 이 쓰기의 커밋»이 선다 —
 * 강등이 200 으로 끝난 **뒤에** 옛 역할로 판정된 쓰기가 커밋된다. 잡으면 그 행을 바꾸는 역할 변경
 * (`repos/members.ts`의 UPDATE·DELETE)이 이 쓰기의 커밋을 기다리고, 먼저 바뀌고 있던 행이면 이 쪽이
 * 그 커밋을 기다렸다가 **바뀐 값**으로 판정한다. 뒤의 방향은 `test/guard-in-lock.test.ts`의 동시 역할 변경
 * 절이 잰다. 앞의 방향은 재확인 뒤로 커밋밖에 없어 결정적으로 세울 판이 없다 — 재확인 뒤에 800ms 를 끼워
 * 넣어 한 번 쟀다(2026-09-22, 코멘트 게시 · 250ms 에 강등): 잡지 않으면 **강등 200 @292ms → 쓰기 201 @856ms**
 * (viewer 이름의 행), 잡으면 **쓰기 201 @837ms → 강등 200 @840ms**.
 *
 * **재생은 이것을 부르지 않는다.** 같은 키로 이미 커밋된 자기 행은 권한을 잃어도 돌려준다 — 가드 앞 재생
 * (`routes/comments.ts`의 `replayBeforeGuard`)과 같은 판정이다. 쓰는 갈래만 부른다.
 */
export async function recheckProjectRole(trx: DbHandle, request: FastifyRequest): Promise<ProjectRole> {
  assertLocking(trx, 'recheckProjectRole')
  const min = request.projectGuardMin
  const currentUser = request.currentUser
  if (min === null || !currentUser) {
    // 가드를 안 지난 요청이다 — 부른 자리가 틀렸다(프로그래밍 오류). 권한 판정으로 흉내 내지 않는다.
    throw new Error('recheckProjectRole은 projectGuard를 지난 요청에서만 부른다')
  }
  const { projectId } = parseParams(ProjectParams, request.params)
  return requireProjectRole(trx, projectId, currentUser.id, min, request.tokenProjectId, 'share')
}

/**
 * `FastifyRequest.projectRole` 데코레이터를 등록한다. `app.ts`의 `buildApp`이
 * 한 번 부른다 — `registerAuthPlugin`이 `currentUser`를 등록하는 것과 같은 자리다.
 */
export function registerProjectRoleDecorator(app: FastifyInstance): void {
  app.decorateRequest('projectRole', null)
  app.decorateRequest('projectGuardMin', null)
}
