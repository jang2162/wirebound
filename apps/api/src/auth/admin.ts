/**
 * **인스턴스 관리자 판정** — 테마 패키지를 올리고 숨기고 템플릿을 받는 라우트(`routes/admin-themes.ts`)가 부른다.
 *
 * 관리자는 프로젝트 역할과 별개다(spec `docs/superpowers/specs/2026-09-27-code-themes-design.md` 「인스턴스 관리자」). 그래서
 * `projectGuard` 를 안 쓰고, 판정을 **가드 앞 훅이 아니라 핸들러 첫 줄**에 둔다 — 이 저장소는 `requireAuth` 뒤에 붙는 훅을
 * 허용 목록으로만 받는다(`test/pre-guard-hook-census.test.ts`). `routes/tokens.ts` 의 `requireSessionUser` 와 같은 꼴이다.
 *
 * **판정은 요청마다 DB 에서 읽는다** — 세션에 얼려 두면 `admin revoke`(`db/admin.ts`)가 그 세션이 끝날 때까지 안 먹는다.
 */
import type { FastifyRequest } from 'fastify'
import { assertLocking } from '../db/locking'
import type { DbHandle } from '../db/tx'
import { forbidden, unauthenticated } from '../errors'
import { isInstanceAdmin } from '../repos/users'
import { recheckCredential, requestCredential } from './roles'

const NOT_ADMIN = '인스턴스 관리자만 할 수 있습니다'

/** 로그인한 사람이 지금 관리자인지 본다 — 아니면 403. 로그인 안 한 요청은 `requireAuth` 가 먼저 401 로 끊는다. 그 사람의 id 를 돌려준다. */
export async function requireInstanceAdmin(db: DbHandle, request: FastifyRequest): Promise<string> {
  const user = request.currentUser
  if (!user) throw unauthenticated()
  if (!(await isInstanceAdmin(db, user.id))) throw forbidden(NOT_ADMIN)
  return user.id
}

/**
 * **관리자 쓰기의 커밋 직전 재확인** — 쓰기 트랜잭션 안, 쓰는 문장 뒤에서 부른다. 핸들러 첫 줄의 판정은 트랜잭션 밖이라 그 뒤의
 * 강등 · 로그아웃을 못 본다(프로젝트 쓰기의 `recheckProjectRole` 과 같은 까닭 — `auth/roles.ts`).
 *
 * - 자격(세션 행)을 `recheckCredential` 로 본다 — 로그아웃했으면 401.
 * - `users.is_instance_admin` 을 `FOR SHARE` 로 읽는다 — 거짓이면 403. `admin revoke` 는 그 행을 고치는 `UPDATE` 라 둘이 줄을 선다:
 *   강등이 먼저 커밋되면 여기서 거짓을 읽고 쓰기가 되돌아간다. 여기가 먼저 잡으면 강등이 이 커밋을 기다린다.
 */
export async function recheckInstanceAdmin(trx: DbHandle, request: FastifyRequest): Promise<void> {
  assertLocking(trx, 'recheckInstanceAdmin')
  const user = request.currentUser
  if (!user) throw new Error('recheckInstanceAdmin 은 로그인한 요청에서만 부른다')
  await recheckCredential(trx, requestCredential(request))
  if (!(await isInstanceAdmin(trx, user.id, 'share'))) throw forbidden(NOT_ADMIN)
}
