import { describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'
import { loadConfig } from '../src/config'
import { badRequest, conflict, forbidden, notFound, unauthenticated, validationFailed } from '../src/errors'

const testEnv = {
  DATABASE_URL: 'postgres://wirebound:wirebound@127.0.0.1:5433/wirebound_test',
  NODE_ENV: 'test',
}

async function withApp(fn: (app: FastifyInstance) => Promise<void>): Promise<void> {
  const app = await buildApp({ config: loadConfig(testEnv) })
  await app.ready()
  try {
    await fn(app)
  } finally {
    await app.close()
  }
}

describe('loadConfig', () => {
  it('DATABASE_URL이 없으면 한국어 메시지로 던진다', () => {
    expect(() => loadConfig({ NODE_ENV: 'test' })).toThrow(/DATABASE_URL/)
    try {
      loadConfig({ NODE_ENV: 'test' })
    } catch (error) {
      expect((error as Error).message).toMatch(/[가-힣]/)
    }
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
    await withApp(async (app) => {
      const res = await app.inject({ method: 'GET', url: '/health' })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ status: 'ok' })
    })
  })

  it('없는 경로는 404 not-found 봉투를 낸다', async () => {
    await withApp(async (app) => {
      const res = await app.inject({ method: 'GET', url: '/그런거없음' })
      expect(res.statusCode).toBe(404)
      expect(res.json().error.code).toBe('not-found')
      expect(res.json().error.message).toMatch(/[가-힣]/)
    })
  })

  it('깨진 JSON 본문은 400 bad-request를 낸다', async () => {
    await withApp(async (app) => {
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
    // Fastify는 ready() 이후 라우트 추가를 막는다(플러그인 트리가 이미 부팅된 상태로 취급).
    // 그래서 이 테스트만 공용 withApp을 쓰지 않고, ready() 이전에 임시 라우트를 붙인다.
    const app = await buildApp({ config: loadConfig(testEnv) })
    app.get('/__boom', async () => {
      throw new Error('데이터베이스 비밀번호가 담긴 내부 메시지')
    })
    await app.ready()
    try {
      const res = await app.inject({ method: 'GET', url: '/__boom' })
      expect(res.statusCode).toBe(500)
      expect(res.json().error.code).toBe('internal')
      expect(res.body).not.toContain('비밀번호가 담긴')
    } finally {
      await app.close()
    }
  })

  it('에러 봉투에 issues가 없으면 키 자체가 없다', async () => {
    await withApp(async (app) => {
      const res = await app.inject({ method: 'GET', url: '/그런거없음' })
      // 키 집합을 본다. JSON의 키 순서에 의존하지 않는다.
      expect(Object.keys(res.json().error).sort()).toEqual(['code', 'message'])
    })
  })
})
