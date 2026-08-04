import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import * as passwordModule from '../src/auth/password'
import { signup, withApi } from './helpers'

/**
 * 존재하지 않는 이메일로 로그인해도 서버가 더미 해시로 verifyPassword를 한 번
 * 돌리는지 고정한다(routes/auth.ts). 그 호출이 이메일 존재 여부에 따른 응답
 * 시간 차이를 없애는 유일한 장치인데, 그 줄을 지워도 P1의 스위트는 전부 초록이었다.
 *
 * 시간을 재지 않는다 — 타이밍 단언은 CI 부하에 따라 흔들린다. 대신 "그 경로에서
 * verifyPassword가 정확히 한 번 불린다"는 관측 가능한 사실을 고정한다.
 *
 * `vi.mock` 대신 `vi.spyOn`을 쓰는 이유: 이 파일이 (다른 모든 api 테스트처럼)
 * `./helpers`를 정적으로 import하는데, `apps/api/test/setup.ts`(vitest의
 * `setupFiles`)가 테스트 파일 자체보다 먼저 실행되면서 `./helpers` → `../src/app`
 * → `routes/auth.ts` → `auth/password.ts`를 이미 한 번 로드해 버린다 — 그
 * 시점에 `routes/auth.ts`의 `verifyPassword` 바인딩이 실제 구현으로 굳는다.
 * `vi.mock` 팩토리는 이 파일 맨 위로 호이스팅되긴 하지만 `setupFiles` 실행
 * 시점보다는 뒤라서, 이미 로드되어 굳어버린 그 그래프를 대체하지 못한다 —
 * 직접 `vi.mock` + `vi.hoisted`로 시도해서 스파이 호출 수가 항상 0으로 나오는
 * 것을 확인했다. `vi.spyOn`은 새 모듈을 만드는 대신 **이미 로드되어 있는**
 * 모듈 네임스페이스 객체의 프로퍼티를 그 자리에서 패치하므로, 로드 순서와
 * 무관하게 `routes/auth.ts`가 참조하는 바로 그 함수를 감싼다.
 */
describe('로그인 타이밍 방어', () => {
  let verifySpy: MockInstance<typeof passwordModule.verifyPassword>

  beforeEach(() => {
    verifySpy = vi.spyOn(passwordModule, 'verifyPassword')
  })

  afterEach(() => {
    verifySpy.mockRestore()
  })

  it('없는 이메일로 로그인해도 verifyPassword를 한 번 돈다', async () => {
    await withApi(async (ctx) => {
      // signup 픽스처가 그 전에 해싱 경로(hashPassword)를 돌 수 있고, 앱 조립
      // (buildApp)이 더미 해시를 만들 때도 hashPassword를 부른다(verifyPassword가
      // 아니다). 그래도 실제 로그인 요청 직전에 카운터를 0으로 맞춰 확실히 한다.
      verifySpy.mockClear()

      const res = await ctx.app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'nobody@example.com', password: 'password1234' },
      })

      expect(res.statusCode).toBe(401)
      expect(verifySpy).toHaveBeenCalledTimes(1)
    })
  })

  it('있는 이메일에 틀린 비밀번호일 때와 호출 횟수가 같다', async () => {
    await withApi(async (ctx) => {
      const { user } = await signup(ctx)
      verifySpy.mockClear()

      const res = await ctx.app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: user.email, password: '틀린비밀번호1234' },
      })

      expect(res.statusCode).toBe(401)
      expect(verifySpy).toHaveBeenCalledTimes(1)
    })
  })
})
