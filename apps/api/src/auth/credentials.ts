/**
 * 자격 값의 규격. **이메일·이름·비밀번호가 무엇을 통과하는가**를 한 자리에서 정한다.
 *
 * 여기 모은 이유는 **계정을 만드는 자와 로그인하는 자가 다른 파일이기 때문이다** —
 * 만드는 자는 `db/seed-user.ts`(마이그레이션 뒤의 시딩)이고 받는 자는 `routes/auth.ts`
 * (로그인)다. 두 벌이 되면 조용히 갈린다: 시딩이 7자 비밀번호를 허용하면 그
 * 계정은 만들어지지만 로그인 본문 검증이 400을 내 **아무도 못 쓰는 계정**이 남는다.
 *
 * 그 성질(*"시딩한 계정은 로그인된다"*)을 규율이 아니라 구조로 만드는 것이 이 파일이다. 비밀번호는 정하는 규칙
 * (`NewPassword`)과 받는 규칙(`LoginPassword`)이 둘이다 — 받는 쪽이 정한 것의 모든 꼴(NFC · NFD · 정규화 전 원문)을 덮는다.
 * `test/seed-user.test.ts`가 두 경계값(7·8자, 200·201자)을 양쪽에서 함께 잰다.
 */
import { z } from 'zod'

/**
 * `.email()`은 형식만 검증한다 — 정규화(소문자화)는 이 스키마의 `.transform()`이 한다.
 * 이후 `repos/users.ts`는 이미 정규화된 이메일만 받는다고 가정한다.
 *
 * zod 기본 정규식(`regexes.email`)을 그대로 쓴다 — 로컬 파트를 ASCII로 제한한다.
 * 국제화 로컬 파트 지원은 이 도구가 메일을 보내지도 않는 시점에 저장 데이터의
 * 게이트만 느슨하게 할 뿐 실질적인 이득이 없는 별도의 제품 결정이라, 여기서
 * 임의로 넓히지 않는다.
 */
export const NormalizedEmail = z.email().transform((value) => value.toLowerCase())

/** 사용자 표시 이름. `users.name`이 `NOT NULL`이라 빈 문자열을 받지 않는다. */
export const DisplayName = z.string().min(1).max(80)

/**
 * 비밀번호의 길이 범위. **하한 8은 정책이고 상한 200은 방어다** —
 * scrypt는 입력 길이에 비례해 비용이 늘지 않지만, 상한이 없으면 요청 본문 크기만큼의
 * 문자열이 해시 함수로 그대로 들어간다. 정하는 자리는 이것을 NFC 판에(`NewPassword`), 받는 자리는 받은 글자나 NFC 판에
 * (`LoginPassword`) 댄다.
 */
export const RawPassword = z.string().min(8).max(200)

/**
 * **정하는 비밀번호 — NFC 로 세고 NFC 를 낸다**(`auth/password.ts` 머리말 «NFC»). 시딩 · 재설정 명령이 쓴다. NFC 로 세는 까닭:
 * 같은 비밀번호를 완성형으로 치면 그 길이가 로그인에 닿는다 — 조합형(NFD)으로 8자를 넘어도 NFC 로 모자라면, 완성형으로 치는
 * 사람에게 로그인이 400 이다.
 */
export const NewPassword = z
  .string()
  .transform((value) => value.normalize('NFC'))
  .pipe(RawPassword)

/**
 * NFD 가 한 글자를 푸는 가장 긴 꼴 — 받는 글자의 상한을 이만큼 넓힌다. 한글 음절은 셋(`ㅎ ㅏ ㄴ`), 그리스 문자에 넷이 있다
 * (U+1F82 → α + ̓ + ̀ + ͅ).
 */
const DECOMPOSITION_MAX = 4

/**
 * **받는 비밀번호 — 정한 것을 어떤 꼴로 쳐도 받는다.** 받은 글자나 그 NFC 판 가운데 하나가 `RawPassword`를 지나면 받는다.
 * - NFC 판: `NewPassword`로 정한 것을 조합형으로 치면 받은 글자는 NFC 판보다 길어(200 을 넘을 수 있다) NFC 판으로 잰다.
 * - 받은 글자: 정규화 전에 정한 비밀번호(`RawPassword`를 받은 글자로 쟀다)는 NFC 판이 8자에 모자랄 수 있다 — 그때 친 그대로의 꼴이면 받는다.
 *
 * 상한 방어는 `DECOMPOSITION_MAX`배로 넓힌 받은 글자의 상한이 맡는다. ASCII 는 두 판이 같아 `RawPassword`와 같다.
 */
export const LoginPassword = z
  .string()
  .max(200 * DECOMPOSITION_MAX)
  .refine((value) => RawPassword.safeParse(value).success || RawPassword.safeParse(value.normalize('NFC')).success, {
    message: '비밀번호는 8–200자여야 합니다',
  })
