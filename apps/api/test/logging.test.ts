import { Writable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import Fastify from 'fastify'
import { buildLoggerOptions } from '../src/app'
import { createSession } from '../src/auth/session'
import { loadConfig } from '../src/config'
import { registerErrorHandler } from '../src/http/error-handler'
import { healthRoutes } from '../src/routes/health'
import { signup, testConfig, withApi } from './helpers'

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

    // buildApp이 아니라 이 세 조각(로거 옵션·에러 핸들러·health 라우트)을 직접 조립한다.
    // DB 없이(=withApi 밖에서) 돌아가는 가장 빠르고 단순한 회귀 테스트로 남겨 둔다 —
    // "Fastify 기본 req 시리얼라이저가 애초에 headers를 로그에 넣지 않는다"는 성질 자체는
    // 쿠키 플러그인·인증 훅과 무관하게 항상 성립하므로, 이 조립만으로도 그 성질은 잡아낸다.
    // 다만 이것만으로는 부족하다 — 아래 두 번째 테스트가 실제 `buildApp` 파이프라인
    // (쿠키 파싱·인증 훅 포함)을 검증한다. logLevel은 'info'로 강제한다 — NODE_ENV=test의
    // 기본값인 'silent'로 두면 애초에 아무 로그도 찍히지 않아 이 테스트가 아무것도
    // 검증하지 못한다.
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

  it('실제 buildApp 파이프라인(쿠키 파싱·인증 훅 포함)에서도 세션 토큰이 로그에 나타나지 않는다', async () => {
    // `buildApp`이 `@fastify/cookie`와 세션 인증 훅을 등록하므로, 이제 /health를
    // 포함한 모든 요청에서 쿠키를 읽는다. 위 테스트는 그 파이프라인을 거치지 않으므로,
    // "언젠가 누가 request.cookies나 resolveSession의 결과를 디버그 로그로 찍는다"는
    // 회귀를 잡지 못한다. 여기서는 실제 `buildApp`을 통째로 돌리고, 실제로 DB에
    // 만들어진 세션의 진짜 토큰을 쿠키에 실어 보낸다 — 가짜 마커 문자열이 아니다.
    const { stream, read } = captureLogStream()
    let token = ''

    await withApi(
      async ({ app, db }) => {
        const user = await db.insertInto('users')
          .values({ email: 'logredact@example.com', name: '로그검증', password_hash: 'x' })
          .returning('id').executeTakeFirstOrThrow()
        const created = await createSession(db, user.id, 24)
        token = created.token

        await app.inject({ method: 'GET', url: '/health', cookies: { wb_session: token } })
      },
      { config: { ...testConfig(), logLevel: 'info' as const }, loggerStream: stream },
    )

    const logged = read()
    expect(logged.length).toBeGreaterThan(0) // 로그가 실제로 찍혔는지부터 확인한다(공허한 통과 방지).
    expect(token).not.toBe('') // 토큰이 실제로 만들어졌는지 확인한다 — 빈 문자열은 항상 "안 보임"으로 통과해 버린다.
    expect(logged).not.toContain(token)
  })

  it('로그인 요청 본문의 평문 비밀번호가 로그에 나타나지 않는다', async () => {
    // 위 두 테스트는 쿠키 헤더에 실린 세션 토큰만 다룬다. `/api/auth/login`은
    // 매 호출마다 평문 비밀번호를 요청 **본문**에 담아 나른다 — 헤더가 아니라 본문이므로
    // 위 redact 설정(`req.headers.*`)의 대상도 아니다. 이 값이 로그에 안 남는 진짜 이유는
    // `buildLoggerOptions`의 redact가 아니라(그 redact는 헤더 경로만 가린다), Fastify
    // 기본 req 시리얼라이저가 애초에 method·url·hostname 등만 담고 body를 아예 로그
    // 객체에 넣지 않기 때문이다 — 그 사실을 "그럴 것이다"로 남겨두지 않고 실측한다.
    //
    // **가입 인젝트가 빠졌다**(2026-08-20 D1 — 그 라우트가 없다). 계정을 만드는 경로가
    // 비밀번호를 안 찍는지는 `seed-user.test.ts`가 시딩 출력 전문을 읽어 잰다 — 그쪽은
    // HTTP가 아니라 콘솔이라 이 파일의 자(pino 스트림)로는 닿지 않는 자리다.
    const marker = 'MARKER-plaintext-password-f7d2b9'
    const { stream, read } = captureLogStream()

    await withApi(
      async (ctx) => {
        await signup(ctx, { email: 'logpw@example.com', name: '로그검증', password: marker })
        await ctx.app.inject({
          method: 'POST', url: '/api/auth/login',
          payload: { email: 'logpw@example.com', password: marker },
        })
      },
      { config: { ...testConfig(), logLevel: 'info' as const }, loggerStream: stream },
    )

    const logged = read()
    expect(logged.length).toBeGreaterThan(0) // 로그가 실제로 찍혔는지부터 확인한다(공허한 통과 방지).
    expect(logged).not.toContain(marker)
  })
})
