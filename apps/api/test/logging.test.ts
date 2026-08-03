import { Writable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import Fastify from 'fastify'
import { buildLoggerOptions } from '../src/app'
import { loadConfig } from '../src/config'
import { registerErrorHandler } from '../src/http/error-handler'
import { healthRoutes } from '../src/routes/health'

const testEnv = {
  DATABASE_URL: 'postgres://wirebound:wirebound@127.0.0.1:5433/wirebound_test',
  NODE_ENV: 'test',
}

/** 로그를 파일·콘솔이 아니라 메모리로 받는다. 캡처한 텍스트는 read()로 읽는다. */
function captureLogStream(): { stream: Writable; read: () => string } {
  const chunks: Buffer[] = []
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
      callback()
    },
  })
  return { stream, read: () => Buffer.concat(chunks).toString('utf8') }
}

describe('로그 리다크션', () => {
  it('세션 쿠키·인증 헤더에 실린 값이 로그에 나타나지 않는다', async () => {
    const marker = 'MARKER-3f9a1c7e-9b2d-session-secret'
    const { stream, read } = captureLogStream()

    // buildApp이 아니라 이 세 조각(로거 옵션·에러 핸들러·health 라우트)을 직접 조립한다 —
    // buildApp의 로거는 스트림을 주입할 통로가 없기 때문이다(BuildAppOptions는 이 태스크에서
    // { config }뿐이어야 한다). logLevel은 'info'로 강제한다 — NODE_ENV=test의 기본값인
    // 'silent'로 두면 애초에 아무 로그도 찍히지 않아 이 테스트가 아무것도 검증하지 못한다.
    const config = { ...loadConfig(testEnv), logLevel: 'info' as const }
    const app = Fastify({ logger: { ...buildLoggerOptions(config), stream } })
    registerErrorHandler(app)
    await app.register(healthRoutes)
    await app.ready()

    try {
      await app.inject({
        method: 'GET',
        url: '/health',
        headers: {
          cookie: `wb_session=${marker}`,
          authorization: `Bearer ${marker}`,
        },
      })
    } finally {
      await app.close()
    }

    const logged = read()
    expect(logged.length).toBeGreaterThan(0) // 로그가 실제로 찍혔는지부터 확인한다(공허한 통과 방지).
    expect(logged).not.toContain(marker)
  })
})
