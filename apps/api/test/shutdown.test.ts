/**
 * **신호를 받으면 도는 요청을 끝까지 답한 뒤 닫는다 — 한도 안에서**(`src/shutdown.ts`).
 *
 * 진짜 포트로 잰다. 프로세스는 가짜다 — 진짜 `process`에 신호를 보내면 vitest 워커가 받는다. 진짜 프로세스가 진짜 브라우저로
 * 그리는 판은 `build-test/screen-chromium.test.ts`의 「그리는 중에 신호를 받아도」가 잰다.
 */
import { spawnSync } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { closeOnSignals, launchedByTsxCli, SHUTDOWN_SIGNALS, type TerminalProbe } from '../src/shutdown'
import { SRC_ROOT, stripComments } from './source-census'

/** tsx CLI 가 띄운 자식의 `execArgv` 꼴(`«깔린 tsx»`가 실물로 잰다). */
const TSX_CLI_ARGV = [
  '--require',
  '/app/node_modules/.pnpm/tsx@4/node_modules/tsx/dist/preflight.cjs',
  '--import',
  'file:///app/node_modules/tsx/dist/loader.mjs',
]

class FakeProcess extends EventEmitter {
  exits: number[] = []
  ppid = 4242
  constructor(readonly execArgv: readonly string[]) {
    super()
  }
  exit(code: number): void {
    this.exits.push(code)
  }
}

let app: FastifyInstance | undefined
let release: () => void = () => {}

afterEach(async () => {
  release()
  app?.server.closeAllConnections()
  await app?.close().catch(() => undefined)
  app = undefined
})

/**
 * 답을 붙잡는 라우트 하나를 둔 앱 · 가짜 프로세스 · 가짜 DB. 터미널은 안 본다(`terminal`을 주면 그것을 본다). 프로세스는 tsx CLI 가
 * 띄운 꼴이다(`execArgv`를 주면 그것).
 */
async function harness(graceMs = 60_000, terminal: TerminalProbe | null = null, execArgv: readonly string[] = TSX_CLI_ARGV) {
  app = Fastify({ logger: false })
  let entered!: () => void
  const inHandler = new Promise<void>((resolve) => (entered = resolve))
  const released = new Promise<void>((resolve) => (release = resolve))
  app.get('/slow', async () => {
    entered()
    await released
    return { done: true }
  })
  await app.listen({ port: 0, host: '127.0.0.1' })
  const { port } = app.server.address() as { port: number }
  const proc = new FakeProcess(execArgv)
  const db = { destroy: vi.fn(async () => {}) }
  closeOnSignals(app, db, { process: proc, graceMs, terminal, lifelineMs: 10 })
  const reply = new Promise<{ status: number; body: string }>((resolve, reject) => {
    // 답한 뒤 연결을 남기지 않는다 — keep-alive 로 남으면 `close()`가 72s 를 기다린다(`app.ts`의 `closeConnectionsAfterReplyWhileClosing`).
    const req = httpRequest({ host: '127.0.0.1', port, path: '/slow', agent: false }, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk: string) => (body += chunk))
      res.on('end', () => resolve({ status: res.statusCode!, body }))
    })
    req.on('error', reject)
    req.end()
  })
  reply.catch(() => undefined)
  await inHandler
  return { proc, db, reply }
}

describe('신호를 받으면', () => {
  it.each(SHUTDOWN_SIGNALS)('%s — 도는 요청을 끝까지 답한 뒤 DB 를 닫고 0 으로 끝낸다', async (signal) => {
    const { proc, db, reply } = await harness()
    proc.emit(signal)
    await vi.waitFor(() => expect(app!.server.listening).toBe(false))
    // 도는 요청이 답하기 전에는 끝내지 않는다.
    expect(proc.exits).toEqual([])
    expect(db.destroy).not.toHaveBeenCalled()

    release()
    expect(await reply).toEqual({ status: 200, body: '{"done":true}' })
    await vi.waitFor(() => expect(proc.exits).toEqual([0]))
    expect(db.destroy).toHaveBeenCalledTimes(1)
  })

  it('SIGHUP 도 받는다 — 셋이 다 걸린다', () => {
    expect([...SHUTDOWN_SIGNALS].sort()).toEqual(['SIGHUP', 'SIGINT', 'SIGTERM'])
  })

  /**
   * **둘째 신호는 기다림을 끊지 않는다** — `pnpm start` 아래에서 Ctrl-C 한 번이 node 에 두 번 닿는다(`shutdown.ts`의 머리말).
   */
  it('같은 신호가 두 번 와도 한 번만 닫고, 도는 요청을 끊지 않는다', async () => {
    const { proc, db, reply } = await harness()
    proc.emit('SIGINT')
    proc.emit('SIGINT')
    await vi.waitFor(() => expect(app!.server.listening).toBe(false))
    expect(proc.exits).toEqual([])

    release()
    expect(await reply).toEqual({ status: 200, body: '{"done":true}' })
    await vi.waitFor(() => expect(proc.exits).toEqual([0]))
    // 기다린 뒤에도 둘째가 따로 끝내지 않는다.
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(proc.exits).toEqual([0])
    expect(db.destroy).toHaveBeenCalledTimes(1)
  })

  it('도는 요청이 한도를 넘기면 기다리지 않고 1 로 끝낸다', async () => {
    const { proc, db } = await harness(150)
    const started = Date.now()
    proc.emit('SIGTERM')
    await vi.waitFor(() => expect(proc.exits).toEqual([1]), { timeout: 5_000 })
    expect(Date.now() - started).toBeGreaterThanOrEqual(140)
    expect(db.destroy).not.toHaveBeenCalled()
  })
})

/**
 * **신호 없이 오는 «닫아라» 둘**(`shutdown.ts`의 «신호 없이 오는» 절) — 터미널이 끊겼거나 띄운 부모가 끝났다. 끊긴 진짜 터미널이
 * 0 바이트 쓰기에 EIO 를 내는 것은 pty 로만 재진다(그 절의 잰 값).
 */
describe('신호 없이', () => {
  it('터미널이 끊기면(0 바이트 쓰기가 EIO) 도는 요청을 끝까지 답한 뒤 0 으로 끝낸다', async () => {
    let lost = false
    const probed: string[] = []
    const { proc, db, reply } = await harness(60_000, async () => {
      const code = lost ? 'EIO' : undefined
      probed.push(code ?? 'ok')
      return code
    })
    await new Promise((resolve) => setTimeout(resolve, 60))
    // 터미널이 살아 있는 동안은 여러 번 봐도 안 닫는다.
    expect(probed.length).toBeGreaterThanOrEqual(2)
    expect(app!.server.listening).toBe(true)

    lost = true
    await vi.waitFor(() => expect(app!.server.listening).toBe(false))
    expect(proc.exits).toEqual([])
    release()
    expect(await reply).toEqual({ status: 200, body: '{"done":true}' })
    await vi.waitFor(() => expect(proc.exits).toEqual([0]))
    expect(db.destroy).toHaveBeenCalledTimes(1)
  })

  it('EIO 가 아닌 터미널 쓰기 오류로는 닫지 않는다', async () => {
    let probes = 0
    await harness(60_000, async () => {
      probes++
      return 'EAGAIN'
    })
    await vi.waitFor(() => expect(probes).toBeGreaterThanOrEqual(3))
    expect(app!.server.listening).toBe(true)
  })

  it('tsx CLI 가 띄운 판에서 부모가 끝나면(`ppid`가 바뀜) 도는 요청을 끝까지 답한 뒤 0 으로 끝낸다', async () => {
    const { proc, db, reply } = await harness()
    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(app!.server.listening).toBe(true)

    proc.ppid = 1
    await vi.waitFor(() => expect(app!.server.listening).toBe(false))
    expect(proc.exits).toEqual([])
    release()
    expect(await reply).toEqual({ status: 200, body: '{"done":true}' })
    await vi.waitFor(() => expect(proc.exits).toEqual([0]))
    expect(db.destroy).toHaveBeenCalledTimes(1)
  })

  /**
   * **tsx CLI 가 아닌 부모는 서버보다 먼저 끝나도 된다** — `nohup node --import tsx … &` 뒤 셸을 닫는 판 · 준비될 때까지 기다린 뒤
   * 끝나는 래퍼(`shutdown.ts`의 머리말 «부모를 보는 것은»).
   */
  it.each([
    ['node --import tsx', ['--import', 'tsx']],
    ['플래그 없는 node', []],
  ])('%s 로 뜬 판은 부모가 끝나도 닫지 않는다', async (_name, execArgv) => {
    const { proc } = await harness(60_000, null, execArgv)
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(app!.server.listening).toBe(true)

    // 수명줄 주기(10ms)의 여러 배를 기다린다.
    proc.ppid = 1
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(app!.server.listening).toBe(true)
    expect(proc.exits).toEqual([])
  })
})

/**
 * **깔린 tsx 로 판별을 잰다**(`shutdown.ts`의 머리말 «tsx 판본에 매인다»). 판별이 어긋나면 조용히 «부모를 안 본다»로 떨어지므로
 * 실제 tsx 가 띄운 자식이 스스로를 어떻게 보는지 잰다 — tsx 를 올려 자식에 싣는 플래그가 바뀌면 여기가 먼저 죽는다.
 */
describe('깔린 tsx', () => {
  const apiRoot = fileURLToPath(new URL('..', import.meta.url))
  const child = fileURLToPath(new URL('./tsx-cli-child.ts', import.meta.url))
  function launched(command: string, args: string[]) {
    const run = spawnSync(command, [...args, child], { cwd: apiRoot, encoding: 'utf8', timeout: 20_000 })
    return { status: run.status, stdout: run.stdout, stderr: run.stderr }
  }

  it('tsx CLI 가 띄운 자식은 «tsx CLI 가 띄웠다»로 본다', () => {
    expect(launched(join(apiRoot, 'node_modules/.bin/tsx'), [])).toEqual({ status: 0, stdout: 'true', stderr: '' })
  })

  it('`node --import tsx` 로 뜬 node 는 아니라고 본다', () => {
    expect(launched(process.execPath, ['--import', 'tsx'])).toEqual({ status: 0, stdout: 'false', stderr: '' })
  })

  it('판별은 인자 하나가 preflight 경로로 끝나는지다 — 윈도 경로도', () => {
    expect(launchedByTsxCli(['--require', 'C:\\app\\node_modules\\tsx\\dist\\preflight.cjs'])).toBe(true)
    expect(launchedByTsxCli(['--require', '/app/node_modules/tsx/dist/preflight.cjs.map'])).toBe(false)
  })
})

/**
 * **`main.ts`가 그것을 건다 — 소스에서 센다.** 그 파일은 부팅해야 돌아 케이스가 못 닿는다. 신호 처리기를 따로 거는 자리가 다시
 * 생기면(`process.on('SIGTERM', …)`) 한도 · 둘째 신호 규칙을 비껴간다.
 */
describe('main.ts 가 그것을 건다', () => {
  const main = stripComments(readFileSync(join(SRC_ROOT, 'main.ts'), 'utf8'))

  it('`closeOnSignals(app, db)` 를 부르고, 신호 처리기를 따로 걸지 않는다', () => {
    expect(main).toMatch(/closeOnSignals\s*\(\s*app\s*,\s*db\s*\)/)
    expect(main).not.toMatch(/process\s*\.\s*(on|once|addListener)\s*\(/)
  })
})
