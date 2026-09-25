/**
 * **로그 쓰기가 실패해도 서버가 멈추거나 죽지 않는다**(`src/log-destination.ts`).
 *
 * 자식 프로세스로 잰다 — 고친 것이 빠지면 자식이 `flushSync`의 되풀이에서 **영영 멈추므로** 같은 프로세스에서 재면 vitest
 * 워커가 함께 선다. 끊긴 터미널(EIO) 판은 pty 로만 재진다(그 파일의 머리말).
 */
import { spawnSync } from 'node:child_process'
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { symbols } from 'pino'
import { describe, expect, it, vi } from 'vitest'
import { logDestination } from '../src/log-destination'
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
  /** 버릴 때 표준에러에 한 줄 — 첫 오류가 두 번 와도(pino 가 다시 낸다) 한 번이다. */
  const finished = {
    status: 0,
    signal: null,
    stdout: '끝까지 왔다\n',
    stderr: expect.stringMatching(/^로그 목적지\(fd \d+\)에 쓰지 못해\(EBADF\) 이 뒤의 로그를 버립니다 — 서버는 계속 돕니다\n$/),
  }

  /** 오류가 알려진 뒤다 — 받아 버리지 않으면 pino 가 다시 던져 잡히지 않은 예외로 끝난다(종료 1). */
  it('오류가 알려진 뒤에 더 써도 던지지 않는다', () => {
    expect(runChild('late')).toEqual(finished)
  })

  /** 오류가 알려지기 전이다 — `flushSync`가 먼저 써 보지 않으면 그 되풀이에서 영영 멈춘다(한도에 걸려 신호로 끝남). */
  it('오류가 알려지기 전에 곧바로 끝내도 `flushSync`에서 멈추지 않는다', () => {
    expect(runChild('at-once')).toEqual(finished)
  })

  /**
   * **공간이 차면(ENOSPC) 버리지 않고 그동안 줄만 떨군 뒤 이어 쓴다**(그 파일의 «공간이 차면 줄만 떨군다»). 가득 찬 디스크는
   * 케이스로 못 만들어 오류를 흘려 넣는다 — 첫 오류는 pino 처럼 두 번 낸다.
   */
  it('공간이 차면 그동안 줄만 떨구고, 다시 써지면 이어 쓰며 떨군 수를 알린다', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wb-log-'))
    const path = join(dir, 'out.log')
    const fd = openSync(path, 'w')
    try {
      const notices: string[] = []
      const stream = logDestination(fd, { notice: (line) => notices.push(line), retryMs: 20 })
      // 앞 줄의 쓰기가 답(`write` 이벤트)까지 끝난 뒤에 흘려 넣는다 — 늦게 온 그 답이 떨굼을 풀면 다시 써 보기를 안 잰다.
      const written = new Promise((resolve) => stream.once('write', resolve))
      stream.write('앞 줄\n')
      await written
      expect(readFileSync(path, 'utf8')).toBe('앞 줄\n')

      const full = Object.assign(new Error('write ENOSPC'), { code: 'ENOSPC' })
      stream.emit('error', full)
      stream.emit('error', full)
      stream.write('떨굴 줄 1\n')
      stream.write('떨굴 줄 2\n')
      expect(notices).toEqual([`로그 목적지(fd ${fd})에 쓰지 못해(ENOSPC) 쓸 수 있을 때까지 로그 줄을 버립니다`])

      await vi.waitFor(() => expect(notices).toHaveLength(2))
      expect(notices[1]).toBe(`로그 목적지(fd ${fd})에 다시 씁니다 — 못 쓰는 동안 2줄을 버렸습니다`)
      stream.write('뒤 줄\n')
      await vi.waitFor(() => expect(readFileSync(path, 'utf8')).toBe('앞 줄\n뒤 줄\n'))
    } finally {
      closeSync(fd)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('끝난 목적지의 오류(EIO)는 그 뒤를 버리고 한 번만 알린다', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wb-log-'))
    const path = join(dir, 'out.log')
    const fd = openSync(path, 'w')
    try {
      const notices: string[] = []
      const stream = logDestination(fd, { notice: (line) => notices.push(line), retryMs: 20 })
      const lost = Object.assign(new Error('write EIO'), { code: 'EIO' })
      stream.emit('error', lost)
      stream.emit('error', lost)
      stream.write('버려질 줄\n')
      await new Promise((resolve) => setTimeout(resolve, 100))
      expect(notices).toEqual([`로그 목적지(fd ${fd})에 쓰지 못해(EIO) 이 뒤의 로그를 버립니다 — 서버는 계속 돕니다`])
      expect(readFileSync(path, 'utf8')).toBe('')
    } finally {
      closeSync(fd)
      rmSync(dir, { recursive: true, force: true })
    }
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
