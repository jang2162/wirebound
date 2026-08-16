/**
 * `wireb`의 실행 진입점. **`run(argv, io)` 꼴이다**(D9) — 부수효과는 전부 `io`가 나르고,
 * 종료 코드는 **값으로** 돌아간다(`process.exit`가 이 파일에 없다).
 *
 * ---
 *
 * # 인자 파서를 들이지 않는다 (D10)
 *
 * `node:util`의 `parseArgs`를 쓴다. **`wireb page get <경로>` 꼴을 다룰 수 있는지 쟀다**
 * (계획서 재라 #8 — *"Node 문서를 기억으로 쓴다"*):
 *
 * | 무엇 | 값 |
 * |---|---|
 * | `['page','get','관리자/회원/목록']` | `positionals`에 셋이 **순서대로** 들어온다 |
 * | 옵션이 위치 인자 뒤에 와도 | 잡힌다(`parseArgs`는 첫 위치 인자에서 멈추지 않는다) |
 * | 모르는 옵션(strict) | `ERR_PARSE_ARGS_UNKNOWN_OPTION`으로 **던진다** — D7이 이것에 기댄다 |
 * | 명령마다 다른 옵션 | **한 번에 못 판다.** 옵션 표가 파싱 전체에 걸리므로 명령 마디를 먼저 떼야 한다 |
 *
 * 마지막 줄이 아래 `matchCommand`가 있는 이유다. **명령 마디는 맨 앞에 온다** —
 * `git`과 같은 규칙이고, 그러지 않으면 `--server https://x init`에서 값이 명령으로
 * 읽힌다(옵션 값은 `-`로 시작하지 않으므로 마디와 구분되지 않는다).
 *
 * **여러 마디 명령을 미리 다룬다.** P9-3이 `page get`을 더할 자리이고, 그때 이 파일의
 * 모양이 바뀌면 안 된다 — `test/args.test.ts`가 두 마디 명세로 그것을 잰다.
 */
import { parseArgs, type ParseArgsConfig } from 'node:util'
import { runExport } from './commands/export'
import { runInit } from './commands/init'
import { runLint } from './commands/lint'
import { runLogin } from './commands/login'
import { runPageGet } from './commands/page-get'
import { runPull } from './commands/pull'
import { CliError, EXIT, usageError, type ExitCode } from './exit'
import type { Io } from './io'

type OptionsConfig = NonNullable<ParseArgsConfig['options']>
type ParsedValues = Record<string, string | boolean | (string | boolean)[] | undefined>

export interface CommandSpec {
  /** 명령 마디. `['page','get']`이면 두 마디다. */
  words: string[]
  /** 쓰임말 한 줄. `--help`가 이것을 그대로 낸다. */
  summary: string
  options: OptionsConfig
  run(io: Io, values: ParsedValues, positionals: string[]): Promise<number>
}

/**
 * **`--password`가 여기 없다**(D7). 없는 것을 `test/login.test.ts`가 케이스로 든다 —
 * strict 파싱이 그것을 *"인식할 수 없는 옵션"*으로 죽인다.
 */
export const COMMANDS: CommandSpec[] = [
  {
    words: ['init'],
    summary: 'wireb init --server <주소> --project <id>    .wirebound.json 생성 (네트워크를 타지 않는다)',
    options: {
      server: { type: 'string' },
      project: { type: 'string' },
      force: { type: 'boolean', default: false },
    },
    run: (io, values) =>
      runInit(io, {
        server: asString(values.server),
        project: asString(values.project),
        force: values.force === true,
      }),
  },
  {
    words: ['login'],
    summary: 'wireb login --email <메일> [--name <꼬리표>]    토큰 발급 및 저장',
    options: {
      server: { type: 'string' },
      project: { type: 'string' },
      email: { type: 'string' },
      name: { type: 'string' },
    },
    run: (io, values) =>
      runLogin(io, {
        server: asString(values.server),
        project: asString(values.project),
        email: asString(values.email),
        name: asString(values.name),
      }),
  },
  {
    words: ['pull'],
    summary: 'wireb pull [-o <파일>]                        프로젝트 스냅샷을 로컬 JSON으로 (읽기 전용)',
    options: {
      out: { type: 'string', short: 'o' },
    },
    run: (io, values) => runPull(io, { out: asString(values.out) }),
  },
  {
    words: ['export'],
    summary: 'wireb export --format html -o <dir>          §11.3 정적 번들을 그 디렉터리에 푼다',
    options: {
      format: { type: 'string' },
      out: { type: 'string', short: 'o' },
      force: { type: 'boolean', default: false },
    },
    run: (io, values) =>
      runExport(io, {
        format: asString(values.format),
        out: asString(values.out),
        force: values.force === true,
      }),
  },
  {
    words: ['lint'],
    summary: 'wireb lint [경로] [--fail-on warning]        §12.4 규칙 검증 (결함이 있으면 코드 10)',
    options: {
      'fail-on': { type: 'string' },
    },
    run: (io, values, positionals) => runLint(io, positionals[0], { failOn: asString(values['fail-on']) }),
  },
  {
    words: ['page', 'get'],
    summary: 'wireb page get <경로> [--json]                페이지 하나를 스키마·코멘트·상호작용 문장으로',
    options: {
      json: { type: 'boolean', default: false },
    },
    run: (io, values, positionals) => runPageGet(io, positionals[0], { json: values.json === true }),
  },
]

export function usage(commands: CommandSpec[] = COMMANDS): string[] {
  return [
    'wireb — wirebound 설계서를 리포에서 다룬다',
    '',
    '사용법: wireb <명령> [옵션]',
    '',
    ...commands.map((command) => `  ${command.summary}`),
    '',
    '자격은 홈 아래에 저장된다. WIREB_TOKEN·WIREB_CREDENTIALS가 그것을 덮는다',
  ]
}

/**
 * 맨 앞의 마디들로 명령을 고른다. 못 고르면 `null`.
 *
 * **긴 것이 먼저 맞는다** — `page get`이 있는데 `page`도 있으면 두 마디 쪽이 이겨야 한다.
 */
export function matchCommand(argv: string[], commands: CommandSpec[] = COMMANDS): CommandSpec | null {
  const byLength = [...commands].sort((a, b) => b.words.length - a.words.length)
  return byLength.find((command) => command.words.every((word, index) => argv[index] === word)) ?? null
}

/**
 * **이 함수는 던지지 않는다.** 종료 코드를 값으로 낸다 — 케이스가 그것을 읽을 수 있어야
 * 하고(D9), `bin.ts`는 그 값으로 끝내는 몇 줄이면 된다.
 */
export async function run(argv: string[], io: Io): Promise<number> {
  try {
    return await dispatch(argv, io)
  } catch (error) {
    if (error instanceof CliError) {
      io.err(error.message)
      return error.code
    }
    if (isParseArgsError(error)) {
      // `parseArgs`의 문장은 영어이고 *"`--` 뒤에 두라"*는 이 CLI와 무관한 조언을 단다.
      // 첫 문장만 옮기고 쓰임말을 붙인다.
      io.err(firstSentence(errorMessage(error)))
      for (const line of usage()) io.err(line)
      return EXIT.usage
    }
    // **예상하지 못한 것은 버그다.** 사용자가 고칠 수 있는 갈래(1~4)와 섞지 않는다.
    io.err(`예상하지 못한 오류: ${errorMessage(error)}`)
    return EXIT.internal
  }
}

async function dispatch(argv: string[], io: Io): Promise<number> {
  const first = argv[0]

  if (first === undefined) {
    // **인자가 없으면 쓰임말이고 코드는 1이다.** 아무것도 안 하고 0으로 끝나면 스크립트가
    // *"됐다"*로 읽는다.
    for (const line of usage()) io.err(line)
    return EXIT.usage
  }

  if (first === '--help' || first === '-h' || first === 'help') {
    // **물어봐서 받은 쓰임말은 표준출력이고 코드는 0이다** — 실패가 아니다.
    for (const line of usage()) io.out(line)
    return EXIT.ok
  }

  const command = matchCommand(argv)
  if (command === null) {
    throw usageError(`모르는 명령입니다: ${argv.filter((word) => !word.startsWith('-')).join(' ') || first}`)
  }

  const { values, positionals } = parseArgs({
    args: argv.slice(command.words.length),
    options: command.options,
    allowPositionals: true,
    strict: true,
  })

  return await command.run(io, values as ParsedValues, positionals)
}

export type { ExitCode }

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function isParseArgsError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    error.code.startsWith('ERR_PARSE_ARGS')
  )
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function firstSentence(message: string): string {
  return message.split('. ')[0] ?? message
}
