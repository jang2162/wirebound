/**
 * 인자와 종료 코드.
 *
 * **`parseArgs`로 `wireb page get <경로>` 꼴을 다룰 수 있는가**를 여기서 잰다 — 두 마디
 * 명령과 그 뒤의 위치 인자를 `run.ts`의 `matchCommand`가 명령 표와 무관하게 가른다.
 */
import { describe, expect, it } from 'vitest'
import { COMMANDS, matchCommand, run, usage, type CommandSpec } from '../src/run'
import { EXIT } from '../src/exit'
import { createFakeIo } from './fake-io'

describe('종료 코드는 값으로 나온다', () => {
  it('인자가 없으면 쓰임말을 stderr에 내고 1이다', async () => {
    const io = createFakeIo()
    const code = await run([], io)

    expect(code).toBe(EXIT.usage)
    expect(io.stderr.join('\n')).toContain('사용법: wireb <명령>')
    // **stdout이 비어야 한다** — 실패를 파이프로 받는 쪽에 섞이면 안 된다.
    expect(io.stdout).toEqual([])
  })

  it('--help 는 stdout에 내고 0이다 — 실패가 아니다', async () => {
    for (const flag of ['--help', '-h', 'help']) {
      const io = createFakeIo()
      const code = await run([flag], io)

      expect(code, flag).toBe(EXIT.ok)
      expect(io.stdout.join('\n'), flag).toContain('사용법: wireb <명령>')
      expect(io.stderr, flag).toEqual([])
    }
  })

  it('모르는 명령은 1이고 무엇이 모르는 것인지 말한다', async () => {
    const io = createFakeIo()
    const code = await run(['nope'], io)

    expect(code).toBe(EXIT.usage)
    expect(io.stderr.join('\n')).toContain('모르는 명령입니다: nope')
  })

  it('모르는 옵션은 1이고 쓰임말이 따라온다', async () => {
    const io = createFakeIo()
    const code = await run(['pull', '--nope'], io)

    expect(code).toBe(EXIT.usage)
    expect(io.stderr.join('\n')).toContain("Unknown option '--nope'")
    expect(io.stderr.join('\n')).toContain('사용법: wireb <명령>')
    // `parseArgs`가 다는 *"`--` 뒤에 두라"*는 조언은 이 CLI와 무관하다 — 걷는다.
    expect(io.stderr.join('\n')).not.toContain('place it at the end')
  })

  it('쓰임말이 명령을 하나도 빠뜨리지 않는다 — 분모를 표에서 만든다', () => {
    const text = usage().join('\n')
    for (const command of COMMANDS) {
      expect(text, command.words.join(' ')).toContain(`wireb ${command.words.join(' ')}`)
    }
    expect(COMMANDS.length).toBeGreaterThan(2)
  })
})

/**
 * **두 마디 명령의 모양을 잰다.** 두 마디 명령이 실제로 골라지고, 그 뒤의 위치 인자가
 * 순서대로 오고, 옵션이 뒤에 와도 잡히는가.
 *
 * 여기서 명세를 **지어서** 재는 것이 요점이다 — 실제 `page get` 명세에 기대면 그 명령의
 * 옵션이 바뀔 때 `matchCommand`·`parseArgs`의 성질을 재는 자가 함께 흔들린다.
 */
describe('여러 마디 명령 (`page get <경로>` 꼴)', () => {
  const seen: { positionals: string[]; json: unknown }[] = []
  const FAKE: CommandSpec[] = [
    {
      words: ['page'],
      summary: 'wireb page …',
      options: {},
      run: async () => EXIT.ok,
    },
    {
      words: ['page', 'get'],
      summary: 'wireb page get <경로> [--json]',
      options: { json: { type: 'boolean' } },
      run: async (_io, values, positionals) => {
        seen.push({ positionals, json: values.json })
        return EXIT.ok
      },
    },
  ]

  it('긴 마디가 먼저 맞는다', () => {
    expect(matchCommand(['page', 'get', '관리자/회원/목록'], FAKE)?.words).toEqual(['page', 'get'])
    expect(matchCommand(['page'], FAKE)?.words).toEqual(['page'])
    expect(matchCommand(['pull'], FAKE)).toBeNull()
  })

  it('마디 뒤의 위치 인자와 옵션이 함께 잡힌다', async () => {
    // `run`은 실제 표를 쓰므로 여기서는 명세를 직접 태워 `parseArgs`의 성질만 잰다.
    const { parseArgs } = await import('node:util')
    const spec = matchCommand(['page', 'get', '관리자/회원/목록', '--json'], FAKE)
    expect(spec).not.toBeNull()

    const parsed = parseArgs({
      args: ['page', 'get', '관리자/회원/목록', '--json'].slice(spec!.words.length),
      options: spec!.options,
      allowPositionals: true,
      strict: true,
    })

    expect(parsed.positionals).toEqual(['관리자/회원/목록'])
    expect(parsed.values.json).toBe(true)
  })

  it('경로에 슬래시와 한국어가 있어도 옵션으로 오인되지 않는다', async () => {
    const { parseArgs } = await import('node:util')
    const parsed = parseArgs({
      args: ['관리자/회원/목록', '--json'],
      options: { json: { type: 'boolean' } },
      allowPositionals: true,
      strict: true,
    })
    expect(parsed.positionals).toEqual(['관리자/회원/목록'])
  })
})
