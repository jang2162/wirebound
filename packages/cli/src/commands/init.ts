/**
 * `wireb init` — `.wirebound.json`을 쓴다.
 *
 * **네트워크를 안 탄다**(D5). §12.3이 `login`을 `init`보다 먼저 적었지만 **§10의 토큰은
 * 프로젝트 스코프**라 프로젝트를 모르는 채로는 발급할 수 없다. §12.1이 그 파일을
 * *"이 리포가 어느 설계 프로젝트에 대응하는가만 선언한다"*고 적었으므로 선언을 쓰는 일에
 * 서버가 필요 없다. **§12.3의 나열은 순서가 아니라 목록이다** — 설계서를 고치지 않고
 * 보고서에 적는다.
 *
 * 부수 이득: 순수 파일 조작이라 케이스가 쉬워진다.
 *
 * ---
 *
 * # 이미 있는 파일을 덮지 않는다
 *
 * 그 파일은 팀이 함께 보는 커밋된 선언이므로(D6) 조용히 갈아 끼우면 남의 리포 바인딩이
 * 사라진다. **`--force`를 줘야 덮고**, 덮을 때도 **모르는 절은 보존한다**(P9-3이 더할
 * `lint` 절이 그 자리다 — `binding.ts`의 머리말).
 */
import { BINDING_FILE, normalizeServer, serializeBinding } from '../binding'
import { CliError, EXIT, usageError } from '../exit'
import type { Io } from '../io'
import { join } from '../paths'

export interface InitOptions {
  server?: string
  project?: string
  force: boolean
}

export async function runInit(io: Io, options: InitOptions): Promise<number> {
  const server = options.server
  const project = options.project
  if (server === undefined || server.length === 0) {
    throw usageError('--server 가 필요합니다 (예: --server https://wirebound.example.com)')
  }
  if (project === undefined || project.length === 0) {
    throw usageError('--project 가 필요합니다 (프로젝트 id)')
  }

  // **위로 찾지 않는다.** `init`은 *"여기를 리포 뿌리로 선언한다"*이므로 지금 디렉터리에
  // 쓴다 — 위에 있는 것을 찾아 고치면 상위 리포의 선언을 말없이 바꾼다.
  const path = join(io.cwd, BINDING_FILE)
  const existingText = await io.files.read(path)

  if (existingText !== null && !options.force) {
    throw new CliError(EXIT.config, `${path}이 이미 있습니다. 덮어쓰려면 --force 를 주세요`)
  }

  const existing = existingText === null ? undefined : keepUnknown(existingText)
  await io.files.write(path, serializeBinding({ server: normalizeServer(server), projectId: project }, existing))

  io.out(`${existingText === null ? '만들었습니다' : '갈아 끼웠습니다'}: ${path}`)
  io.out('자격은 여기 담기지 않습니다. `wireb login`으로 토큰을 발급받으세요')
  return EXIT.ok
}

/**
 * 기존 파일에서 **모르는 절만** 건져 온다. 읽을 수 없는 파일이면 아무것도 안 건진다 —
 * `--force`를 준 사람이 원하는 것은 *"멀쩡한 선언 하나"*이지 파싱 오류가 아니다.
 */
function keepUnknown(text: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(text)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
    return parsed as Record<string, unknown>
  } catch {
    return undefined
  }
}
