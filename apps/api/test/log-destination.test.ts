/**
 * **로그 쓰기가 실패해도 서버가 멈추거나 죽지 않는다**(`src/log-destination.ts`).
 *
 * 자식 프로세스로 잰다 — 고친 것이 빠지면 자식이 `flushSync`의 되풀이에서 **영영 멈추므로** 같은 프로세스에서 재면 vitest
 * 워커가 함께 선다. 끊긴 터미널(EIO) 판은 pty 로만 재진다(그 파일의 머리말).
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { symbols } from 'pino'
import { describe, expect, it } from 'vitest'
import { withApi } from './helpers'

describe('로그 목적지의 쓰기가 실패하면', () => {
  function runChild(mode: 'at-once' | 'late') {
    const child = spawnSync(
      fileURLToPath(new URL('../node_modules/.bin/tsx', import.meta.url)),
      [fileURLToPath(new URL('./log-destination-child.ts', import.meta.url)), mode],
      { encoding: 'utf8', timeout: 20_000 },
    )
    return { status: child.status, signal: child.signal, stdout: child.stdout, stderr: child.stderr }
  }
  const finished = { status: 0, signal: null, stdout: '끝까지 왔다\n', stderr: '' }

  /** 오류가 알려진 뒤다 — 받아 버리지 않으면 pino 가 다시 던져 잡히지 않은 예외로 끝난다(종료 1). */
  it('오류가 알려진 뒤에 더 써도 던지지 않는다', () => {
    expect(runChild('late')).toEqual(finished)
  })

  /** 오류가 알려지기 전이다 — `flushSync`가 먼저 써 보지 않으면 그 되풀이에서 영영 멈춘다(한도에 걸려 신호로 끝남). */
  it('오류가 알려지기 전에 곧바로 끝내도 `flushSync`에서 멈추지 않는다', () => {
    expect(runChild('at-once')).toEqual(finished)
  })

  /**
   * **`buildApp`의 로거가 그 목적지를 쓴다** — 앱의 로거가 실제로 쓰는 스트림(pino 의 `streamSym`)에 쓰기 오류를 내 본다. pino 의
   * 기본 목적지면 그 오류가 다시 던져진다(`log-destination.ts`의 머리말).
   */
  it('앱의 로거에 쓰기 오류가 나도 던지지 않고, 그 뒤 로그는 버려진다', async () => {
    await withApi(async ({ app }) => {
      const stream = (app.log as unknown as Record<symbol, unknown>)[symbols.streamSym] as NodeJS.EventEmitter & {
        write(line: string): boolean
        flushSync(): void
      }
      expect(() => stream.emit('error', Object.assign(new Error('write EIO'), { code: 'EIO' }))).not.toThrow()
      expect(() => stream.write('버려질 줄\n')).not.toThrow()
      expect(() => stream.flushSync()).not.toThrow()
    })
  })
})
