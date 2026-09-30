/**
 * **세션으로만 부르는 라우트의 판정** — 토큰 관리(`routes/tokens.ts` 머리말 «이 셋은 세션으로만 부를 수 있다»)와 비밀번호 바꾸기
 * (`routes/auth.ts` 의 `/password`)가 부른다. 판정이 갈리면 한 라우트만 열려 있는 상태가 조용히 생기므로 함수 하나로 둔다.
 *
 * 프로젝트 밖 라우트(`/api/auth/*`)에는 토큰이 사람을 안 채워 `requireAuth` 가 먼저 401 을 낸다(`auth/plugin.ts` 머리말 «토큰은
 * 프로젝트 라우트에서만 사람을 채운다») — 그 라우트에서 이 함수의 403 은 그 규칙이 바뀐 날의 두 번째 겹이다.
 */
import { forbidden, unauthenticated } from '../errors'
import type { SessionUser } from './session'

/**
 * 이 요청이 **세션으로** 인증됐는지 확인하고 그 사용자를 낸다. 자격이 없으면 401, 토큰이면 403 `refusal`.
 */
export function requireSessionUser(
  request: { currentUser: SessionUser | null; authKind: 'session' | 'token' | null },
  refusal: string,
): SessionUser {
  const currentUser = request.currentUser
  if (!currentUser) {
    throw unauthenticated()
  }
  if (request.authKind !== 'session') {
    throw forbidden(refusal)
  }
  return currentUser
}
