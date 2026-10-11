/**
 * **닫는 중에 닫힘 핸드셰이크에 답하지 않는 WS 연결은 한도 뒤 끊는다 — 답하는 연결은 핸드셰이크로 닫는다**
 * (`src/ws/index.ts`의 `WS_CLOSE_GRACE_MS`).
 *
 * 진짜 포트로 잰다. 답하지 않는 연결은 핸드셰이크(101)만 하고 그 뒤 아무것도 안 읽는 날 TCP 소켓이다(잠든 노트북 · 끊긴 망의
 * 흉내). 신호를 받은 프로세스가 끝나기까지는 `shutdown.ts`가 `app.close()`를 기다리는 것이 전부라, 여기서는 `app.close()`가
 * 끝나는 시간을 잰다.
 */
import { randomBytes } from 'node:crypto'
import { connect, type Socket } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { WS_CLOSE_GRACE_MS } from '../src/ws'
import { createProject, resetRealData, signup, withRealApi, type RealApiContext } from './helpers'

beforeEach(resetRealData)
afterEach(resetRealData)

const sockets: Socket[] = []
afterEach(() => {
  for (const socket of sockets) socket.destroy()
  sockets.length = 0
})

async function scene(ctx: RealApiContext) {
  const owner = await signup(ctx)
  const project = await createProject(ctx, owner.cookie)
  return { token: owner.cookie.wb_session, projectId: project.id }
}

/** 핸드셰이크만 하고 더 안 읽는 연결. `drained()`는 그제야 읽기 시작해 서버가 끊을 때(EOF) 풀린다. */
function unansweringClient(port: number, projectId: string, token: string): Promise<{ drained: () => Promise<void>; destroy: () => void }> {
  return new Promise((resolve, reject) => {
    const socket = connect(port, '127.0.0.1')
    sockets.push(socket)
    const closed = new Promise<void>((done) => socket.once('close', () => done()))
    let head = ''
    socket.once('connect', () =>
      socket.write(
        `GET /api/projects/${projectId}/ws HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n` +
          `Sec-WebSocket-Key: ${randomBytes(16).toString('base64')}\r\nSec-WebSocket-Version: 13\r\nCookie: wb_session=${token}\r\n\r\n`,
      ),
    )
    const onData = (chunk: Buffer): void => {
      head += chunk.toString('latin1')
      if (!head.includes('\r\n\r\n')) return
      socket.off('data', onData)
      // 더 안 읽는다 — 서버의 닫힘 프레임에도 답하지 않는다.
      socket.pause()
      if (!head.startsWith('HTTP/1.1 101')) reject(new Error(`핸드셰이크 실패: ${head.split('\r\n')[0]}`))
      else
        resolve({
          drained: () => {
            socket.resume()
            return closed
          },
          destroy: () => socket.destroy(),
        })
    }
    socket.on('data', onData)
    socket.on('error', () => {})
  })
}

/** `app.close()`가 한도 안에 끝나는지 — 안 끝나면 값('still open')으로 죽는다. */
async function closeWithin(ctx: RealApiContext, ms: number): Promise<{ outcome: string; elapsedMs: number }> {
  const started = Date.now()
  const outcome = await Promise.race([
    ctx.app.close().then(() => 'closed'),
    new Promise<string>((resolve) => setTimeout(() => resolve('still open'), ms)),
  ])
  return { outcome, elapsedMs: Date.now() - started }
}

describe('닫는 중의 WS 연결', () => {
  it('닫힘에 답하지 않는 연결은 한도 뒤 끊어 `app.close()`가 끝난다', async () => {
    await withRealApi(async (ctx) => {
      const { token, projectId } = await scene(ctx)
      const client = await unansweringClient(ctx.port, projectId, token)

      const { outcome, elapsedMs } = await closeWithin(ctx, WS_CLOSE_GRACE_MS + 3_000)
      // 안 닫혔으면 이쪽에서 끊는다 — 그래야 하네스의 `app.close()`가 30s 를 안 기다리고 값으로 죽는다.
      if (outcome !== 'closed') client.destroy()
      expect(outcome).toBe('closed')
      // 한도까지는 기다린다 — 곧바로 끊지 않는다.
      expect(elapsedMs).toBeGreaterThanOrEqual(WS_CLOSE_GRACE_MS - 50)
      await client.drained()
    })
  })

  it('답하는 연결은 닫힘 핸드셰이크로 닫히고, 한도를 기다리지 않는다', async () => {
    await withRealApi(async (ctx) => {
      const { token, projectId } = await scene(ctx)
      const socket = new WebSocket(`ws://127.0.0.1:${ctx.port}/api/projects/${projectId}/ws`, {
        headers: { cookie: `wb_session=${token}` },
      } as never)
      await new Promise((resolve, reject) => {
        socket.addEventListener('open', resolve, { once: true })
        socket.addEventListener('error', reject, { once: true })
      })
      const closed = new Promise<{ code: number; wasClean: boolean }>((resolve) =>
        socket.addEventListener('close', (event) => resolve({ code: event.code, wasClean: event.wasClean }), { once: true }),
      )

      const { outcome, elapsedMs } = await closeWithin(ctx, WS_CLOSE_GRACE_MS + 3_000)
      expect(outcome).toBe('closed')
      expect(elapsedMs).toBeLessThan(WS_CLOSE_GRACE_MS / 2)
      // 1005 = 코드 없는 닫힘 프레임(`@fastify/websocket`의 기본 `close()`) · 끊겼으면 1006 · wasClean false.
      expect(await closed).toEqual({ code: 1005, wasClean: true })
    })
  })
})
