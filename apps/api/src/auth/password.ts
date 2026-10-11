/**
 * 비밀번호 해싱. `node:crypto`의 scrypt만 쓴다 — 네이티브 애드온(argon2 등)을
 * 빌드에 끌어들이지 않으면서도 OWASP가 인정하는 비용 파라미터를 만족한다.
 *
 * DB도 HTTP도 모르는 순수 함수 두 개(`hashPassword`, `verifyPassword`)만 담는다.
 *
 * **NFC.** 같은 글자가 입력기 · 붙여넣기에 따라 완성형(NFC — `한`)이나 조합형(NFD — `ㅎ ㅏ ㄴ`)으로 온다 — 바이트가 다르다.
 * 받은 글자를 그대로 해시하면 정할 때와 칠 때의 꼴이 갈린 사람은 맞는 비밀번호로 로그인하지 못한다. 그래서 **NFC 판을
 * 해시한다.** 견줄 때는 NFC 판 · 받은 글자 · NFD 판을 차례로 견준다 — 뒤의 둘은 **정규화 전에 받은 글자 그대로 해시한 옛
 * 해시**를 위해서다(정할 때 NFD 였으면 NFD 판이, 친 그대로면 받은 글자가 맞는다). 판이 같으면 한 번만 견준다 — ASCII 는 늘
 * 한 번이다. 견주는 수는 받은 글자로만 정해지므로 없는 계정의 더미 검증(`routes/auth.ts`)과 시간이 갈리지 않는다. 옛 해시를
 * 다시 해시하지 않는다 — 로그인이 사용자 행을 쓰게 된다. 잰 값은 `test/password-nfc.test.ts`.
 */
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'

export interface ScryptParams {
  N: number
  r: number
  p: number
}

/**
 * OWASP 권장 하한(N=2^15=32768, r=8, p=1). 의도적으로 느리다 — 로그인 한 번에
 * 수십~수백 ms가 걸리는 것이 정상이다. 비용을 올리고 싶으면 이 값만 바꾸면 되고,
 * 이미 저장된 해시는 자기 파라미터를 동봉하고 있어 그대로 검증된다.
 */
export const DEFAULT_SCRYPT_PARAMS: ScryptParams = { N: 32768, r: 8, p: 1 }

/** 파생 키(해시) 길이. bytes. */
const KEY_LENGTH = 32

/** salt 길이. bytes. */
const SALT_LENGTH = 16

const FORMAT_PREFIX = 'scrypt'

/**
 * scrypt 파라미터가 실제로 요구하는 메모리(대략 `128 × N × r` 바이트)의 상한.
 * `N`·`r`·`p` 각각에 개별 상한을 두는 대신 **이 곱셈 결과**에 상한을 건다 —
 * 개별 상한은 각각의 한도 안에 있는 조합끼리 곱했을 때도 여전히 터무니없이
 * 클 수 있어(예: N이 상한이고 r도 상한이면 곱은 두 상한의 곱만큼 커진다),
 * 상한을 두는 목적(메모리 소진 방지) 자체를 놓친다.
 *
 * 512 MiB로 잡은 근거: 기본값(N=2^15, r=8)이 요구하는 메모리는 정확히
 * 32 MiB다. `N`을 (r을 그대로 두고) 3번 두 배로 올리면 32 × 2^3 = 256 MiB가
 * 필요해지므로, 그보다 한 번 더 두 배의 여유(512 MiB = 32 × 2^4)를 둬 "비용을
 * 몇 차례 올릴 여지"가 실제로 남도록 했다. 그러면서도 깨진 행 하나가 이 값을
 * 넘는 파라미터를 요구하면, 실제 메모리를 할당하기 전에 거부되어 요청이 멎거나
 * 프로세스가 OOM되는 사고로 이어지지 않는다.
 *
 * `scrypt()` 헬퍼가 계산하는 `maxmem`(이 값의 2배 헤드룸)도 항상 이 상한을
 * 통과한 `N`·`r`로만 계산되므로, `maxmem`이 이 상한과 어긋날 일이 없다.
 */
const MAX_SCRYPT_MEMORY_BYTES = 512 * 1024 * 1024

/**
 * `n`이 2의 거듭제곱인 양의 정수인지 정확히 판정한다.
 *
 * 흔한 구현인 `(n & (n - 1)) === 0`은 JS의 비트 연산이 피연산자를 32비트
 * 정수로 자르고 계산하기 때문에 2^31 이상에서 거짓 양성을 낼 수 있다 — 예를
 * 들어 2의 거듭제곱이 **아닌** `2^32 + 2^31`도 그 방식으로는 "거듭제곱"으로
 * 잘못 판정된다(직접 확인함). 이 함수는 `BigInt`로 계산해 크기와 무관하게
 * 정확하다.
 */
function isPowerOfTwo(n: number): boolean {
  if (!Number.isInteger(n) || n <= 0) {
    return false
  }
  const big = BigInt(n)
  return (big & (big - 1n)) === 0n
}

/**
 * scrypt 비용 파라미터가 안전한지 검증한다. **쓰기 경로(`hashPassword`)와
 * 읽기 경로(`parseEncoded`)가 반드시 이 함수 하나를 같이 쓴다.** 두 경로가
 * 따로 검증하면(또는 한쪽만 검증하면), `DEFAULT_SCRYPT_PARAMS`의 `N`을 상한
 * 근처로 올렸을 때 "해싱은 조용히 성공하고, 그 해시로 로그인은 매번 실패
 * (500)하는" 상황이 생길 수 있다 — 쓰기 시점엔 조용하고 읽기 시점엔 전면
 * 잠금이라 원인 추적이 어렵다. 잘못된 파라미터는 해싱 시점에 크게(즉시 던져서)
 * 실패해야 한다.
 */
function validateScryptParams(params: ScryptParams): void {
  const { N, r, p } = params

  if (!isPowerOfTwo(N) || N <= 1) {
    throw new Error(`scrypt 파라미터가 올바르지 않습니다 (N은 1보다 큰 2의 거듭제곱인 정수여야 함: ${N})`)
  }
  if (!Number.isInteger(r) || r < 1) {
    throw new Error(`scrypt 파라미터가 올바르지 않습니다 (r은 1 이상의 정수여야 함: ${r})`)
  }
  if (!Number.isInteger(p) || p < 1) {
    throw new Error(`scrypt 파라미터가 올바르지 않습니다 (p는 1 이상의 정수여야 함: ${p})`)
  }

  // 개별 상한이 아니라 실제 메모리 요구량에 상한을 건다 — 위 독스트링 참고.
  const requiredBytes = 128 * N * r
  if (requiredBytes > MAX_SCRYPT_MEMORY_BYTES) {
    const requiredMiB = Math.ceil(requiredBytes / (1024 * 1024))
    const maxMiB = MAX_SCRYPT_MEMORY_BYTES / (1024 * 1024)
    throw new Error(
      `scrypt 파라미터가 올바르지 않습니다 (N=${N}, r=${r} 조합이 필요로 하는 메모리 약 ${requiredMiB}MiB가 상한 ${maxMiB}MiB를 넘음)`,
    )
  }
}

/**
 * `crypto.scrypt` 콜백판을 Promise로 감싼다. `scryptSync`는 이벤트 루프를
 * 프로덕션 파라미터 기준 수십 ms 이상 막으므로 절대 쓰지 않는다.
 *
 * `maxmem`을 명시한다 — scrypt는 대략 `128 × N × r` 바이트를 쓰는데, 기본
 * 파라미터(N=32768, r=8)에서 그 값이 정확히 Node의 기본 `maxmem`(32MiB)과
 * 같아 경계에서 `ERR_CRYPTO_INVALID_SCRYPT_PARAMS`가 날 수 있다. 여유를 두고
 * 두 배로 잡는다.
 */
function scrypt(password: string | Buffer, salt: Buffer, keylen: number, params: ScryptParams): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const maxmem = 256 * params.N * params.r
    scryptCallback(password, salt, keylen, { N: params.N, r: params.r, p: params.p, maxmem }, (err, derivedKey) => {
      if (err) {
        reject(err)
        return
      }
      resolve(derivedKey)
    })
  })
}

/**
 * 비밀번호를 해싱해 `scrypt$N$r$p$salt$hash` 형식 문자열로 돌려준다.
 * salt는 매번 무작위로 만들므로 같은 비밀번호도 매번 다른 결과가 나온다.
 *
 * `params`는 `validateScryptParams`로 `parseEncoded`(검증 경로)와 똑같이
 * 검증한다 — 호출자가 부주의한 파라미터를 넘기면 여기서 즉시 던진다.
 */
export async function hashPassword(password: string, params: ScryptParams = DEFAULT_SCRYPT_PARAMS): Promise<string> {
  validateScryptParams(params)
  const salt = randomBytes(SALT_LENGTH)
  const derivedKey = await scrypt(password.normalize('NFC'), salt, KEY_LENGTH, params)
  return [FORMAT_PREFIX, params.N, params.r, params.p, salt.toString('base64url'), derivedKey.toString('base64url')].join('$')
}

/**
 * `parts.length === 6`을 확인하고 나서만 6-튜플로 좁혀준다. 배열 구조분해는
 * `noUncheckedIndexedAccess`의 보호를 받지 않으므로, 길이 확인과 타입 좁히기를
 * 한곳에 모아 둔다.
 */
function asSixParts(parts: string[]): [string, string, string, string, string, string] {
  if (parts.length !== 6) {
    throw new Error('비밀번호 해시 형식이 올바르지 않습니다 (필드 수 불일치)')
  }
  return parts as [string, string, string, string, string, string]
}

/**
 * base64url 조각을 디코딩하고 바이트 길이가 정확히 `expectedLength`인지 확인한다.
 * `Buffer.from(str, 'base64url')`은 잘못된 문자를 조용히 건너뛸 뿐 던지지 않으므로,
 * 길이 확인이 깨진 세그먼트를 잡아내는 유일한 수단이다. 이 확인이 없으면 예를 들어
 * 빈 문자열이 0바이트 버퍼로 조용히 디코딩되고, 그 0바이트를 파생 키 길이로 쓰면
 * `timingSafeEqual(빈 버퍼, 빈 버퍼)`가 항상 `true`가 되어 아무 비밀번호나 통과한다.
 */
function decodeFixedLength(base64url: string, expectedLength: number, label: string): Buffer {
  const buf = Buffer.from(base64url, 'base64url')
  if (buf.length !== expectedLength) {
    throw new Error(`비밀번호 해시 형식이 올바르지 않습니다 (${label} 길이가 올바르지 않음)`)
  }
  return buf
}

/**
 * 저장된 해시 문자열을 파싱한다. 형식이 어긋나면(필드 수 부족, 알고리즘 불일치,
 * 파라미터가 숫자가 아니거나 안전 범위를 벗어남, salt/hash 세그먼트 길이 불일치
 * 등) `Error`를 던진다 — 저장된 값이 깨진 것은 데이터 무결성 문제이므로, 조용히
 * `false`를 돌려줘서 "비밀번호 틀림"으로 가리지 않는다.
 *
 * 파라미터 검증은 `hashPassword`와 똑같이 `validateScryptParams` 하나로 한다
 * (쓰기·읽기 경로가 다른 기준을 쓰지 않도록).
 */
function parseEncoded(encoded: string): {
  params: ScryptParams
  salt: Buffer
  hash: Buffer
} {
  const [algorithm, nRaw, rRaw, pRaw, saltRaw, hashRaw] = asSixParts(encoded.split('$'))

  if (algorithm !== FORMAT_PREFIX) {
    throw new Error(`비밀번호 해시 형식이 올바르지 않습니다 (알 수 없는 알고리즘: ${algorithm})`)
  }

  const params: ScryptParams = { N: Number(nRaw), r: Number(rRaw), p: Number(pRaw) }
  validateScryptParams(params)

  return {
    params,
    salt: decodeFixedLength(saltRaw, SALT_LENGTH, 'salt'),
    hash: decodeFixedLength(hashRaw, KEY_LENGTH, 'hash'),
  }
}

/**
 * 평문 비밀번호가 저장된 해시와 일치하는지 검증한다. 현재의 기본 파라미터가
 * 아니라 **해시에 저장된 파라미터**로 다시 계산한다 — 그래야 나중에 비용을
 * 올려도 예전 해시가 계속 통과한다.
 *
 * 파생 키 길이는 항상 `KEY_LENGTH` 상수로 고정한다 — 저장된 데이터에서 읽은
 * 길이(예: `hash.length`)를 쓰면 안 된다. 저장된 해시 세그먼트가 깨져 0바이트가
 * 되는 등 짧아진 경우, 그 길이를 그대로 파생 키 길이로 넘기면 두 0바이트 버퍼는
 * 항상 같으므로 `timingSafeEqual`이 무조건 `true`를 내 인증이 우회된다. (이 경로는
 * `parseEncoded`가 salt/hash 길이를 이미 검증하므로 정상적으로는 도달하지 않지만,
 * 그 검증에 절대 기대지 않도록 파생 키 길이 자체를 상수로 고정해 둔다.)
 *
 * 비교는 `timingSafeEqual`로 한다. 길이가 다르면 그 함수가 예외를 던지므로,
 * 먼저 길이를 확인해 다르면 (타이밍에 좌우되지 않는) `false`를 돌려준다 — 위와
 * 같이 도달할 일이 없지만, 방어적으로 남겨 둔다.
 */
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const { params, salt, hash } = parseEncoded(encoded)
  // 머리말 «NFC» — NFC 판이 먼저다(이 파일이 만든 해시). 나머지는 옛 해시의 꼴이다.
  const forms = new Set([password.normalize('NFC'), password, password.normalize('NFD')])
  for (const form of forms) {
    const candidate = await scrypt(form, salt, KEY_LENGTH, params)
    if (candidate.length === hash.length && timingSafeEqual(candidate, hash)) return true
  }
  return false
}
