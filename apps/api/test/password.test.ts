import { describe, expect, it } from 'vitest'
import { DEFAULT_SCRYPT_PARAMS, hashPassword, verifyPassword } from '../src/auth/password'

// 기본 파라미터는 의도적으로 느리다. 대부분의 테스트는 낮춘 값을 쓴다.
const fast = { N: 1024, r: 8, p: 1 }

// 아래 망가진 해시 케이스들을 만드는 데 쓰는, 길이가 맞는(또는 일부러 안 맞는) base64url 조각.
// `.join('$')`으로 조립해 리터럴 문자열 안에서 `$` 개수를 손으로 세는 실수를 피한다.
const b64 = (byteLength: number, fill = 1) => Buffer.alloc(byteLength, fill).toString('base64url')
const validSalt = b64(16) // SALT_LENGTH
const validHash = b64(32, 2) // KEY_LENGTH
const shortSalt = b64(15) // SALT_LENGTH보다 1바이트 짧음
const shortHash = b64(31, 2) // KEY_LENGTH보다 1바이트 짧음

describe('hashPassword', () => {
  it('형식이 scrypt$N$r$p$salt$hash다', async () => {
    const encoded = await hashPassword('비밀번호1234', fast)
    const parts = encoded.split('$')
    expect(parts).toHaveLength(6)
    expect(parts[0]).toBe('scrypt')
    expect(Number(parts[1])).toBe(fast.N)
    expect(Number(parts[2])).toBe(fast.r)
    expect(Number(parts[3])).toBe(fast.p)
    expect(parts[4]).not.toBe('')
    expect(parts[5]).not.toBe('')
  })

  it('같은 비밀번호도 매번 다른 해시를 낸다 (salt가 무작위다)', async () => {
    const a = await hashPassword('같은비밀번호', fast)
    const b = await hashPassword('같은비밀번호', fast)
    expect(a).not.toBe(b)
  })

  it('해시에 비밀번호 원문이 들어 있지 않다', async () => {
    const encoded = await hashPassword('원문이드러나면안됨', fast)
    expect(encoded).not.toContain('원문이드러나면안됨')
  })

  it.each([
    ['N이 0', { N: 0, r: 8, p: 1 }],
    // Node가 자체적으로 거부하지 않는 유일한 규칙이 메모리 상한이다 —
    // scrypt() 헬퍼가 maxmem을 128*N*r의 두 배로 넉넉히 넘기므로 Node의 maxmem
    // 검사에 걸리지 않는다. 이 행이 표 전체의 판별력을 담당한다.
    ['N·r 조합이 메모리 상한을 넘음', { N: 2 ** 20, r: 8, p: 1 }],
    ['r이 0', { N: 1024, r: 0, p: 1 }],
    ['p가 0', { N: 1024, r: 8, p: 0 }],
  ])('쓰기 경로도 읽기 경로와 같은 검증을 쓴다 — parseEncoded라면 거부할 파라미터(%s)는 해싱 전에 거부한다', async (_label, badParams) => {
    // 메시지까지 단언하는 이유: 그냥 rejects.toThrow()면 Node가 던진 영문 에러로도
    // 통과해 버려, validateScryptParams를 지워도 초록이 된다. 우리 검증 함수의
    // 한국어 메시지를 고정한다.
    await expect(hashPassword('아무비번', badParams)).rejects.toThrow(/scrypt 파라미터가 올바르지 않습니다/)
  })
})

describe('verifyPassword', () => {
  it('맞는 비밀번호를 통과시킨다', async () => {
    const encoded = await hashPassword('비밀번호1234', fast)
    expect(await verifyPassword('비밀번호1234', encoded)).toBe(true)
  })

  it('틀린 비밀번호를 거부한다', async () => {
    const encoded = await hashPassword('비밀번호1234', fast)
    expect(await verifyPassword('비밀번호12345', encoded)).toBe(false)
  })

  it('빈 비밀번호를 거부한다', async () => {
    const encoded = await hashPassword('비밀번호1234', fast)
    expect(await verifyPassword('', encoded)).toBe(false)
  })

  it('유니코드와 이모지를 정확히 다룬다', async () => {
    const encoded = await hashPassword('한글비밀번호🔐', fast)
    expect(await verifyPassword('한글비밀번호🔐', encoded)).toBe(true)
    expect(await verifyPassword('한글비밀번호', encoded)).toBe(false)
  })

  it('저장된 파라미터로 검증한다 — 기본값이 바뀌어도 옛 해시가 통한다', async () => {
    const encoded = await hashPassword('예전비밀번호', { N: 256, r: 8, p: 1 })
    expect(encoded).toContain('$256$')
    expect(await verifyPassword('예전비밀번호', encoded)).toBe(true)
  })

  it.each([
    ['빈 문자열', ''],
    ['알고리즘이 다름', 'bcrypt$1024$8$1$aaaa$bbbb'],
    ['필드 수가 모자람', 'scrypt$1024$8$1$aaaa'],
    ['N이 숫자가 아님', 'scrypt$엔$8$1$aaaa$bbbb'],
    // 필드 수는 정확히 6개이지만 그 안의 세그먼트 자체가 깨진 경우들.
    // 해시 조각이 빈 문자열이면 0바이트 파생 키끼리 비교돼 timingSafeEqual이
    // 항상 true를 내 아무 비밀번호나 통과한다(아래 *"보안 회귀 — 해시 조각이 잘려 비어
    // 있으면 어떤 비밀번호도 통과되면 안 된다"* 참고).
    ['해시 조각이 비어 있음', ['scrypt', 1024, 8, 1, validSalt, ''].join('$')],
    ['salt 조각이 비어 있음', ['scrypt', 1024, 8, 1, '', validHash].join('$')],
    ['해시가 1바이트 짧음(31바이트)', ['scrypt', 1024, 8, 1, validSalt, shortHash].join('$')],
    ['salt가 1바이트 짧음(15바이트)', ['scrypt', 1024, 8, 1, shortSalt, validHash].join('$')],
    // N/r/p 자체가 말이 안 되는 경우. 검증 없이 scrypt에 그대로 넘기면 Node가
    // 조용히 다른 값으로 대체하거나(N=0) 별다른 에러 없이 계산을 마쳐버린다(r=0, p=0).
    ['N이 0', ['scrypt', 0, 8, 1, validSalt, validHash].join('$')],
    ['N이 음수', ['scrypt', -1024, 8, 1, validSalt, validHash].join('$')],
    ['N이 2의 거듭제곱이 아님', ['scrypt', 1000, 8, 1, validSalt, validHash].join('$')],
    // 2^32(uint32 상한 초과) — Node 자체 범위 검증으로도 막히지만, 상한을 우리
    // 코드에서 명시적으로 걷어내는 것이 목적이므로 회귀 케이스로 남긴다. (실제로
    // 위험한 "2의 거듭제곱이면서 uint32 범위 안인데도 터무니없이 큰 N", 예를 들어
    // 2^24~2^30 같은 값은 진짜로 스크립트를 계산 시도하면 수백MB~수GB를 할당하려
    // 들어 테스트 러너 자체가 멎거나 OOM날 위험이 있어 여기서 실행하지 않는다 —
    // `MAX_N` 상수가 그 구간을 소스 리뷰로 확인 가능한 방식으로 막는다.)
    ['N이 절대적으로 큼(2^32, uint32 상한 초과)', ['scrypt', 2 ** 32, 8, 1, validSalt, validHash].join('$')],
    ['r이 0', ['scrypt', 1024, 0, 1, validSalt, validHash].join('$')],
    ['p가 0', ['scrypt', 1024, 8, 0, validSalt, validHash].join('$')],
  ])('망가진 해시(%s)에는 던진다', async (_label, encoded) => {
    // 저장된 해시가 깨진 것은 데이터 무결성 문제다. 조용히 "비밀번호 틀림"으로
    // 가리면 진단이 불가능해지므로 던져서 500으로 드러낸다.
    await expect(verifyPassword('아무거나', encoded)).rejects.toThrow()
  })

  it('보안 회귀 — 해시 조각이 잘려 비어 있으면 어떤 비밀번호도 통과되면 안 된다', async () => {
    // 인증 우회: 저장된 해시 문자열의 마지막 세그먼트가 (컬럼 truncation 등으로)
    // 통째로 잘려 빈 문자열이 됐을 때, 검증 시 파생 키 길이를 "저장된 해시의 바이트
    // 길이"(0바이트)로 계산해 scrypt를 부르면 0바이트 파생 키끼리는 항상 같으므로
    // timingSafeEqual(빈 버퍼, 빈 버퍼)가 true를 내 어떤 비밀번호로도 인증이 통과된다.
    // 그래서 파생 키 길이를 항상 상수(KEY_LENGTH)로 고정하고, 저장된 salt/hash의
    // 디코딩된 바이트 길이가 그 상수와 다르면 파싱 단계에서 던진다.
    const encoded = await hashPassword('진짜비밀번호', fast)
    const truncated = encoded.slice(0, encoded.lastIndexOf('$') + 1)
    expect(truncated.endsWith('$')).toBe(true) // 마지막 세그먼트가 실제로 비어 있는지 확인
    await expect(verifyPassword('완전히_아무_비밀번호', truncated)).rejects.toThrow()
  })

  it('N=2^24처럼 2의 거듭제곱이고 uint32 범위 안이어도 메모리 상한을 넘으면 던진다', async () => {
    // Node 자신의 range 검증이나 거듭제곱 검증만으로는 이 값을 못 거른다 — 둘 다
    // 통과하는 "합법적으로 보이는" 값이기 때문이다. 오직 우리 쪽 메모리 상한
    // (128×N×r ≤ MAX_SCRYPT_MEMORY_BYTES) 검사만이 이 값을 막는다.
    //
    // 이 검증은 scrypt를 호출하기 전에 끝나므로 실제로는 아무 메모리도 할당되지
    // 않아 라이브로 안전하게 테스트할 수 있다 — 이 순서가 훗날 뒤바뀌면 이
    // 테스트는 조용히 통과하는 대신 멎거나(hang) OOM 나야 정상이다(그 자체가
    // 순서가 깨졌다는 신호다).
    const encoded = ['scrypt', 2 ** 24, 8, 1, validSalt, validHash].join('$')
    await expect(verifyPassword('아무거나', encoded)).rejects.toThrow()
  })
})

describe('기본 파라미터', () => {
  it('N이 OWASP 권장선 이상이다', () => {
    expect(DEFAULT_SCRYPT_PARAMS.N).toBeGreaterThanOrEqual(32768)
    expect(DEFAULT_SCRYPT_PARAMS.r).toBe(8)
    expect(DEFAULT_SCRYPT_PARAMS.p).toBe(1)
  })

  it('기본 파라미터로도 왕복이 된다 (maxmem 경계 확인)', async () => {
    const encoded = await hashPassword('기본파라미터확인', DEFAULT_SCRYPT_PARAMS)
    expect(await verifyPassword('기본파라미터확인', encoded)).toBe(true)
  }, 20_000)
})
