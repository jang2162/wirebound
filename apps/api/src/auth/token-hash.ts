/**
 * 무작위 자격 문자열을 만들고 그 검증자(sha256 hex)를 계산하는 한 자리.
 *
 * **세션 쿠키(`auth/session.ts`)와 API 토큰(`repos/api-tokens.ts`)이 이 파일을 함께 쓴다.**
 * 둘 다 *"원문은 발급 응답에만 실리고 DB에는 해시만 남는다"*라는 같은 성질을 갖는다
 * (설계 §4.2·§10) — 그 성질을 만드는 코드가 두 벌이면 한쪽만 약해지는 날을 아무도 못 본다.
 *
 * ---
 *
 * # 수명 정책은 여기 없다 — 그것이 이 가름의 요점이다 (P9-2 T2의 판정)
 *
 * 계획서가 물은 것은 *"세션의 해시 자리를 토큰이 재사용하면 한쪽 수명 정책이 다른 쪽에
 * 새는가"*였다. **재사용하는 것은 해시 함수이지 조회 함수가 아니다.**
 *
 * | 무엇 | 어디 | 수명 |
 * |---|---|---|
 * | 세션 조회 | `auth/session.ts`의 `resolveSession` | `expires_at > now()`를 **SQL에** 넣는다 |
 * | 토큰 조회 | `repos/api-tokens.ts`의 `findApiTokenByRaw` | **만료 조건이 없다** — 폐기(DELETE)뿐이다 |
 *
 * 두 조회가 서로 다른 테이블·서로 다른 술어를 갖고, 이 파일은 그 어느 쪽도 모른다.
 * **한 테이블을 함께 쓰는 갈래를 고르지 않은 이유가 그것이다** — `sessions`에 토큰을 함께
 * 담으면 `resolveSession`의 만료 조건이 토큰에도 걸리고, 그것을 피하려고 조건을 느슨하게
 * 하는 순간 §10의 *"세션 행을 지우면 권한도 즉시 회수된다"*가 토큰 쪽 사정으로 흔들린다.
 */
import { createHash, randomBytes } from 'node:crypto'

/** 자격 원문의 바이트 길이. base64url 인코딩 후 43자가 된다. */
const TOKEN_BYTES = 32

/**
 * 새 자격 원문. **호출자는 이 값을 저장하지 않는다** — 응답에 한 번 싣고 버린다.
 */
export function randomTokenValue(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url')
}

/**
 * 자격 원문의 sha256 hex. **쓰기와 읽기가 같은 함수를 써야 한다** — 다른 해시를 쓰면
 * 넣은 행을 영영 못 찾는다(`auth/session.ts`가 같은 문장을 적어 두었다).
 */
export function hashTokenValue(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}
