/**
 * **닫는 중에 답한 요청의 keep-alive 연결이 `app.close()`를 붙잡지 않는다**(`src/app.ts`의
 * `closeConnectionsAfterReplyWhileClosing`) — 진짜 포트로 잰다. `inject()`는 소켓을 만들지 않아 keep-alive 가 없다.
 *
 * 없으면 `close()`가 Fastify 의 `keepAliveTimeout`(72s)만큼 걸린다 — 그래서 시간을 넘으면 값으로 거절한다.
 */
import { Agent, request as httpRequest, type IncomingMessage } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import { buildApp } from '../src/app'
import { getTestDb, testConfig } from './helpers'

function get(port: number, path: string, agent: Agent): Promise<{ status: number; connection: string | undefined; body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, path, agent }, (res: IncomingMessage) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk: string) => (body += chunk))
      res.on('end', () => resolve({ status: res.statusCode!, connection: res.headers.connection, body }))
    })
    req.on('error', reject)
    req.end()
  })
}

/** `ms` 안에 안 끝나면 거절한다. */
function within<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([promise, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${ms}ms 안에 안 끝났습니다`)), ms))])
}

describe('닫는 중에 도는 요청', () => {
  it('끝까지 답하고, 그 연결이 close() 를 붙잡지 않는다', async () => {
    const app = await buildApp({ db: getTestDb(), config: testConfig() })
    let entered!: () => void
    const inHandler = new Promise<void>((resolve) => (entered = resolve))
    let release!: () => void
    const released = new Promise<void>((resolve) => (release = resolve))
    app.get('/probe/slow', async () => {
      entered()
      await released
      return { done: true }
    })
    await app.listen({ port: 0, host: '127.0.0.1' })
    const { port } = app.server.address() as { port: number }
    const agent = new Agent({ keepAlive: true })
    let closed: Promise<void> | undefined
    try {
      const reply = get(port, '/probe/slow', agent)
      await inHandler
      closed = app.close()
      // 서버가 듣기를 멈춘 뒤에 답한다 — 그 전에 답하면 연결이 `server.close()` 때 이미 쉬고 있어 저절로 닫힌다.
      await vi.waitFor(() => expect(app.server.listening).toBe(false))
      release()

      // 도는 요청은 끊기지 않고 답한다 — `forceCloseConnections: true`로 «고치면» 여기서 죽는다.
      const answered = await reply
      expect(answered).toMatchObject({ status: 200, body: '{"done":true}' })
      expect(answered.connection).toBe('close')
      await within(closed, 5_000)
    } finally {
      release()
      agent.destroy()
      // 거절된 판에서도 72s 를 기다리지 않는다.
      app.server.closeAllConnections()
      await closed?.catch(() => undefined)
    }
  }, 120_000)
})
