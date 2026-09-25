/**
 * **로그 쓰기가 실패해도 서버가 멈추거나 죽지 않는다**(`src/log-destination.ts`).
 *
 * 자식 프로세스로 잰다 — 고친 것이 빠지면 자식이 `flushSync`의 되풀이에서 **영영 멈추므로** 같은 프로세스에서 재면 vitest
 * 워커가 함께 선다. 끊긴 터미널(EIO) 판은 pty 로만 재진다(그 파일의 머리말).
 */
import { spawnSync } from 'node:child_process'
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync, writeSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { symbols } from 'pino'
import { describe, expect, it, vi } from 'vitest'
import { logDestination, stderrNotice } from '../src/log-destination'
import { withApi } from './helpers'

/**
 * 이 기계에 늘 ENOSPC 를 내는 `/dev/full` 이 있나 — 경로가 아니라 **실제로 1 바이트를 써 본다**(macOS 에는 없다 · Linux 에는 있다).
 */
function devFullRefuses(): boolean {
  try {
    const fd = openSync('/dev/full', 'w')
    try {
      writeSync(fd, Buffer.from('x'))
      return false
    } finally {
      closeSync(fd)
    }
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ENOSPC'
  }
}
const DEV_FULL = devFullRefuses()

describe('로그 목적지의 쓰기가 실패하면', () => {
  function runChild(mode: 'at-once' | 'late' | 'full') {
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

  /**
   * **떨구는 중의 `flushSync` 는 아무것도 안 한다** — 진짜 ENOSPC 가 있어야 갈린다(흘려 넣은 오류로는 sonic-boom 의 버퍼가 안
   * 찬다). `/dev/full` 이 없는 기계(macOS)는 건너뛴다 — 이 케이스는 Linux 에서만 돈다.
   *
   * **이 케이스가 보는 것은 «밀어내지 않는다»까지다.** `/dev/full` 은 0 바이트 쓰기도 ENOSPC 로 거절해, 떨구는 중에 밀어내면
   * `flushSync` 의 0 바이트 확인이 걸려 로그를 버리고 알림이 한 줄 더 선다 — 그 줄로 죽는다. 밀어냈을 때의 진짜 증상(sonic-boom 의
   * `flushSync` 가 ENOSPC 에 100ms 쉬고 영영 되풀이)은 **0 바이트는 되고 1 바이트는 ENOSPC 인** 가득 찬 파일시스템에서만 선다 —
   * 그 판은 `build-test/log-destination-full-disk.test.ts` 가 잰다(tmpfs 를 채운 리눅스 컨테이너 · `pnpm test:build`).
   */
  it.skipIf(!DEV_FULL)('공간이 찬 채로 끝내도 `flushSync` 에서 멈추지 않는다(Linux `/dev/full`)', () => {
    expect(runChild('full')).toEqual({
      status: 0,
      signal: null,
      stdout: '끝까지 왔다\n',
      stderr: expect.stringMatching(/^로그 목적지\(fd \d+\)에 쓰지 못해\(ENOSPC\) 쓸 수 있을 때까지 로그 줄을 버립니다\n$/),
    })
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
  it('앱의 로거에 쓰기 오류가 나도 던지지 않고, 그 뒤 로그는 버려진다고 한 번 알린다', async () => {
    // 알림은 표준에러로 가는 기본 자리 — 가로채지 않으면 테스트 출력에 한 줄이 샌다.
    const noticed = vi.spyOn(stderrNotice, 'line').mockImplementation(() => {})
    try {
      await withApi(async ({ app }) => {
        const stream = (app.log as unknown as Record<symbol, unknown>)[symbols.streamSym] as NodeJS.EventEmitter & {
          write(line: string): boolean
          flushSync(): void
        }
        expect(() => stream.emit('error', Object.assign(new Error('write EIO'), { code: 'EIO' }))).not.toThrow()
        expect(() => stream.write('버려질 줄\n')).not.toThrow()
        expect(() => stream.flushSync()).not.toThrow()
      })
      expect(noticed.mock.calls).toEqual([['로그 목적지(fd 1)에 쓰지 못해(EIO) 이 뒤의 로그를 버립니다 — 서버는 계속 돕니다']])
    } finally {
      noticed.mockRestore()
    }
  })
})
