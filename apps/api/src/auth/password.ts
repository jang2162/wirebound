/**
 * 비밀번호 해싱. `node:crypto`의 scrypt만 쓴다 — 네이티브 애드온(argon2 등)을
 * 빌드에 끌어들이지 않으면서도 OWASP가 인정하는 비용 파라미터를 만족한다.
 *
 * DB도 HTTP도 모르는 순수 함수 두 개(`hashPassword`, `verifyPassword`)만 담는다.
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
 * 저장된 파라미터가 넘을 수 없는 상한. `parseEncoded`가 이 값을 넘는 N/r/p를
 * 즉시 거부해, 깨진 행 하나가 scrypt를 실제로 호출해 수백 MB~수 GiB 메모리를
 * 할당하려 들면서 요청을 멎게 하거나 프로세스를 OOM으로 몰아넣는 것을 막는다.
 *
 * `MAX_N`(2^20)은 기본값(2^15)의 32배로, 앞으로 비용을 몇 차례 올릴 여지는
 * 남기면서도 2의 거듭제곱이라는 조건과 함께 최악의 메모리 요청을 유한하게
 * 묶어 둔다. `MAX_R`·`MAX_P`도 같은 이유로 기본값의 소수 배 안에서 넉넉히
 * 잡았다 — scrypt 실무에서 r·p를 이보다 크게 쓸 이유가 없다.
 */
const MAX_N = 2 ** 20
const MAX_R = 16
const MAX_P = 16

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
 */
export async function hashPassword(password: string, params: ScryptParams = DEFAULT_SCRYPT_PARAMS): Promise<string> {
  const salt = randomBytes(SALT_LENGTH)
  const derivedKey = await scrypt(password, salt, KEY_LENGTH, params)
  return [
    FORMAT_PREFIX,
    params.N,
    params.r,
    params.p,
    salt.toString('base64url'),
    derivedKey.toString('base64url'),
  ].join('$')
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

/** `N`을 파싱하고 검증한다: 정수, 2의 거듭제곱, 1보다 크고, `MAX_N` 이하. */
function parseScryptN(raw: string): number {
  const N = Number(raw)
  if (!Number.isInteger(N) || N <= 1 || N > MAX_N || (N & (N - 1)) !== 0) {
    throw new Error(`비밀번호 해시 형식이 올바르지 않습니다 (N이 올바르지 않음: ${raw})`)
  }
  return N
}

/** `r`·`p`처럼 "1 이상, 상한 이하인 정수"만 허용하는 필드를 파싱한다. */
function parseBoundedInt(raw: string, max: number, label: string): number {
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`비밀번호 해시 형식이 올바르지 않습니다 (${label}이(가) 올바르지 않음: ${raw})`)
  }
  return value
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
 * 파라미터가 숫자가 아니거나 범위를 벗어남, salt/hash 세그먼트 길이 불일치 등)
 * `Error`를 던진다 — 저장된 값이 깨진 것은 데이터 무결성 문제이므로, 조용히
 * `false`를 돌려줘서 "비밀번호 틀림"으로 가리지 않는다.
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

  const N = parseScryptN(nRaw)
  const r = parseBoundedInt(rRaw, MAX_R, 'r')
  const p = parseBoundedInt(pRaw, MAX_P, 'p')

  return {
    params: { N, r, p },
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
 * 같이 이제는 도달할 일이 없지만, 방어적으로 남겨 둔다.
 */
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const { params, salt, hash } = parseEncoded(encoded)
  const candidate = await scrypt(password, salt, KEY_LENGTH, params)
  if (candidate.length !== hash.length) {
    return false
  }
  return timingSafeEqual(candidate, hash)
}
