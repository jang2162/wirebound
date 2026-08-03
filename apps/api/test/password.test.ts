import { describe, expect, it } from 'vitest'
import { DEFAULT_SCRYPT_PARAMS, hashPassword, verifyPassword } from '../src/auth/password'

// 기본 파라미터는 의도적으로 느리다. 대부분의 테스트는 낮춘 값을 쓴다.
const fast = { N: 1024, r: 8, p: 1 }

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
  ])('망가진 해시(%s)에는 던진다', async (_label, encoded) => {
    // 저장된 해시가 깨진 것은 데이터 무결성 문제다. 조용히 "비밀번호 틀림"으로
    // 가리면 진단이 불가능해지므로 던져서 500으로 드러낸다.
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
