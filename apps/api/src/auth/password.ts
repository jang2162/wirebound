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
 * 저장된 해시 문자열을 파싱한다. 형식이 어긋나면(필드 수 부족, 알고리즘 불일치,
 * 숫자 파싱 실패 등) `Error`를 던진다 — 저장된 값이 깨진 것은 데이터 무결성
 * 문제이므로, 조용히 `false`를 돌려줘서 "비밀번호 틀림"으로 가리지 않는다.
 */
function parseEncoded(encoded: string): {
  params: ScryptParams
  salt: Buffer
  hash: Buffer
} {
  const parts = encoded.split('$')
  if (parts.length !== 6) {
    throw new Error('비밀번호 해시 형식이 올바르지 않습니다 (필드 수 불일치)')
  }

  const [algorithm, nRaw, rRaw, pRaw, saltRaw, hashRaw] = parts as [string, string, string, string, string, string]

  if (algorithm !== FORMAT_PREFIX) {
    throw new Error(`비밀번호 해시 형식이 올바르지 않습니다 (알 수 없는 알고리즘: ${algorithm})`)
  }

  const N = Number(nRaw)
  const r = Number(rRaw)
  const p = Number(pRaw)
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) {
    throw new Error('비밀번호 해시 형식이 올바르지 않습니다 (파라미터가 숫자가 아님)')
  }

  return {
    params: { N, r, p },
    salt: Buffer.from(saltRaw, 'base64url'),
    hash: Buffer.from(hashRaw, 'base64url'),
  }
}

/**
 * 평문 비밀번호가 저장된 해시와 일치하는지 검증한다. 현재의 기본 파라미터가
 * 아니라 **해시에 저장된 파라미터**로 다시 계산한다 — 그래야 나중에 비용을
 * 올려도 예전 해시가 계속 통과한다.
 *
 * 비교는 `timingSafeEqual`로 한다. 길이가 다르면 그 함수가 예외를 던지므로,
 * 먼저 길이를 확인해 다르면 (타이밍에 좌우되지 않는) `false`를 돌려준다.
 */
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const { params, salt, hash } = parseEncoded(encoded)
  const candidate = await scrypt(password, salt, hash.length, params)
  if (candidate.length !== hash.length) {
    return false
  }
  return timingSafeEqual(candidate, hash)
}
