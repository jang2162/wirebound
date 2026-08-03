import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config'
import { badRequest, conflict, forbidden, notFound, unauthenticated, validationFailed } from '../src/errors'
import { withApi } from './helpers'

const testEnv = {
  DATABASE_URL: 'postgres://wirebound:wirebound@127.0.0.1:5433/wirebound_test',
  NODE_ENV: 'test',
}

describe('loadConfig', () => {
  it('DATABASE_URL이 없으면 한국어 메시지로 던진다', () => {
    // 부분 문자열이 아니라 실제로 던져지는 문구 그 자체를 확인한다 — "DATABASE_URL"이라는
    // 글자만 어딘가 들어 있으면 통과하는 검증은 zod의 일반 메시지가 우연히 필드 경로를
    // 포함하는 것만으로도 속아 넘어간다.
    expect(() => loadConfig({ NODE_ENV: 'test' })).toThrow('DATABASE_URL이 필요합니다')
    try {
      loadConfig({ NODE_ENV: 'test' })
    } catch (error) {
      expect((error as Error).message).toMatch(/[가-힣]/)
    }
  })

  it('DATABASE_URL이 빈 문자열이어도 같은 메시지로 던진다', () => {
    expect(() => loadConfig({ ...testEnv, DATABASE_URL: '' })).toThrow('DATABASE_URL이 필요합니다')
  })

  it('기본값을 채운다', () => {
    const config = loadConfig(testEnv)
    expect(config.port).toBe(3001)
    expect(config.host).toBe('127.0.0.1')
    expect(config.sessionCookieName).toBe('wb_session')
    expect(config.nodeEnv).toBe('test')
  })

  it('숫자 env를 숫자로 만든다', () => {
    const config = loadConfig({ ...testEnv, PORT: '4000', SESSION_TTL_HOURS: '24' })
    expect(config.port).toBe(4000)
    expect(config.sessionTtlHours).toBe(24)
  })

  it('숫자가 아닌 PORT를 거부한다', () => {
    expect(() => loadConfig({ ...testEnv, PORT: '포트' })).toThrow()
  })

  it('알 수 없는 NODE_ENV를 거부한다', () => {
    expect(() => loadConfig({ ...testEnv, NODE_ENV: 'staging' })).toThrow()
  })
})

describe('ApiError', () => {
  it.each([
    [badRequest('잘못됨'), 400, 'bad-request'],
    [unauthenticated(), 401, 'unauthenticated'],
    [forbidden(), 403, 'forbidden'],
    [notFound(), 404, 'not-found'],
    [conflict('충돌'), 409, 'conflict'],
    [validationFailed('검증 실패', []), 422, 'validation-failed'],
  ])('%#: 코드에 맞는 상태를 갖는다', (error, status, code) => {
    expect(error.status).toBe(status)
    expect(error.code).toBe(code)
  })

  it('기본 메시지가 한국어다', () => {
    for (const error of [unauthenticated(), forbidden(), notFound()]) {
      expect(error.message).toMatch(/[가-힣]/)
    }
  })
})

describe('HTTP 계약', () => {
  it('GET /health가 200을 낸다', async () => {
    await withApi(async ({ app }) => {
      const res = await app.inject({ method: 'GET', url: '/health' })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ status: 'ok' })
    })
  })

  it('없는 경로는 404 not-found 봉투를 낸다', async () => {
    await withApi(async ({ app }) => {
      const res = await app.inject({ method: 'GET', url: '/그런거없음' })
      expect(res.statusCode).toBe(404)
      expect(res.json().error.code).toBe('not-found')
      expect(res.json().error.message).toMatch(/[가-힣]/)
    })
  })

  it('깨진 JSON 본문은 400 bad-request를 낸다', async () => {
    await withApi(async ({ app }) => {
      const res = await app.inject({
        method: 'POST',
        url: '/health',
        headers: { 'content-type': 'application/json' },
        payload: '{ 이건 JSON이 아니다',
      })
      expect(res.statusCode).toBe(400)
      expect(res.json().error.code).toBe('bad-request')
    })
  })

  it('예상 못 한 예외는 500 internal이고 내부 메시지를 노출하지 않는다', async () => {
    // 태스크 4 시점의 하네스는 ready()를 먼저 불렀다. Fastify 5는 ready 이후
    // 라우트 등록을 거부하므로, 이 테스트만 공용 withApp을 쓰지 못하고 자체 앱을
    // 조립해 ready() 이전에 임시 라우트를 붙이는 식으로 우회했다. 지금의 withApi는
    // ready()를 부르지 않으므로(inject()가 첫 호출에서 알아서 태운다) 그 우회가
    // 필요 없다 — 다른 테스트와 똑같이 공용 헬퍼 위에서 임시 라우트를 등록한다.
    await withApi(async ({ app }) => {
      app.get('/__boom', async () => {
        throw new Error('데이터베이스 비밀번호가 담긴 내부 메시지')
      })
      const res = await app.inject({ method: 'GET', url: '/__boom' })
      expect(res.statusCode).toBe(500)
      expect(res.json().error.code).toBe('internal')
      expect(res.body).not.toContain('비밀번호가 담긴')
    })
  })

  it('에러 봉투에 issues가 없으면 키 자체가 없다', async () => {
    await withApi(async ({ app }) => {
      const res = await app.inject({ method: 'GET', url: '/그런거없음' })
      // 키 집합을 본다. JSON의 키 순서에 의존하지 않는다.
      expect(Object.keys(res.json().error).sort()).toEqual(['code', 'message'])
    })
  })
})
