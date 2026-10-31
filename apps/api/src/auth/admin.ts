/**
 * **인스턴스 관리자 판정** — `/api/admin` 아래 라우트(테마 `routes/admin-themes.ts` · 사용자 `routes/admin-users.ts` · 초대
 * `routes/admin-invites.ts` · 프로젝트 `routes/admin-projects.ts` · 기록 `routes/admin-audit.ts`)가 부른다.
 *
 * 관리자는 프로젝트 역할과 별개다(spec `docs/superpowers/specs/2026-09-27-code-themes-design.md` 「인스턴스 관리자」 ·
 * `docs/superpowers/specs/2026-10-31-workspace-admin-design.md`). 그래서
 * `projectGuard` 를 안 쓰고, 판정을 **가드 앞 훅이 아니라 핸들러 첫 줄**에 둔다 — 이 저장소는 `requireAuth` 뒤에 붙는 훅을
 * 허용 목록으로만 받는다(`test/pre-guard-hook-census.test.ts`). `auth/session-only.ts` 의 `requireSessionUser` 와 같은 꼴이다.
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
 * **관리자 쓰기의 커밋 순간 재확인** — 쓰기 트랜잭션 안에서 부른다. 핸들러 첫 줄의 판정은 트랜잭션 밖이라 그 뒤의 강등 · 로그아웃을
 * 못 본다(프로젝트 쓰기의 `recheckProjectRole` 과 같은 까닭 — `auth/roles.ts`). 잡은 잠금(사용자 행 `FOR SHARE` · 자격 `KEY SHARE`)을
 * 커밋까지 쥐므로 쓰기 앞에서 불러도 판정은 커밋 순간의 것이다.
 *
 * **어디서 부르나** — 테마 쓰기(`theme_packages` 행만 잡는다)는 쓰는 문장 뒤다. 사용자 · 링크 · owner 를 바꾸는 쓰기는 쓰기 **앞**이다
 * (`routes/admin-users.ts` 머리말 «잠금 차례») — 뒤에 두면 «링크 행 → 사용자 행» 이 되어 비활성화 · 해제(«사용자 행 → 링크 행»)와
 * 교착이다([api] `admin-deactivate-race.test.ts` «그 사람이 제 링크를 거두는 중»).
 *
 * - `users.is_instance_admin` 을 `FOR SHARE` 로 읽는다 — 거짓이면 403. `admin revoke` 는 그 행을 고치는 `UPDATE` 라 둘이 줄을 선다:
 *   강등이 먼저 커밋되면 여기서 거짓을 읽고 쓰기가 되돌아간다. 여기가 먼저 잡으면 강등이 이 커밋을 기다린다.
 * - 자격(세션 행)을 `recheckCredential` 로 본다 — 로그아웃했으면 401.
 *
 * **사용자 행 → 자격 차례다.** 사용자 행을 고치고 그 사람의 세션을 지우는 쓰기(비밀번호 바꾸기 `routes/auth.ts` 의 `/password` ·
 * 재설정 명령 `db/reset-password.ts`)가 «사용자 행 → 세션» 으로 잡는다. 여기가 «자격 → 사용자 행» 이면 같은 사람의 다른 세션이 낸
 * 관리자 쓰기와 고리가 서서 한쪽이 교착(40P01)으로 500 이다([api] `auth-password-review.test.ts`). 사용자 행을 먼저 잡으면 둘이
 * 거기서 줄을 선다 — 이 쓰기가 먼저면 바꾸기가 이 커밋을 기다리고, 바꾸기가 먼저면 여기서 지워진 세션을 보고 401 로 되돌아간다.
 */
export async function recheckInstanceAdmin(trx: DbHandle, request: FastifyRequest): Promise<void> {
  assertLocking(trx, 'recheckInstanceAdmin')
  const user = request.currentUser
  if (!user) throw new Error('recheckInstanceAdmin 은 로그인한 요청에서만 부른다')
  const admin = await isInstanceAdmin(trx, user.id, 'share')
  await recheckCredential(trx, requestCredential(request))
  if (!admin) throw forbidden(NOT_ADMIN)
}
