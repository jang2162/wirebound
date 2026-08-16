/**
 * `.wirebound.json` — 설계 §12.1의 **리포 바인딩**.
 *
 * ```jsonc
 * { "server": "https://wirebound.example.com", "projectId": "prj_a1b2" }
 * ```
 *
 * *"이 리포가 어느 설계 프로젝트에 대응하는가"*만 선언한다. **그래서 `wireb init`은
 * 네트워크를 안 탄다**(D5) — 선언을 쓰는 데 서버가 필요 없다.
 *
 * ---
 *
 * # 이 파일은 커밋되는 파일이다 — **자격을 여기 쓰지 않는다**(D6)
 *
 * §12.1이 *"개발 리포 루트에 둔다"*고 적었고 리포 바인딩을 **선언**하는 것이 존재
 * 이유이므로, 팀이 함께 보는 파일이다. 토큰은 `credentials.ts`가 홈 아래에 쓴다.
 *
 * # 모르는 키를 거부하지 않는다
 *
 * P9-1 이월 §5가 lint 설정(`LintConfig`)의 자리를 이 파일로 지목했고 **그 모양은 P9-3이
 * 정한다.** 지금 `z.strictObject` 같은 태도를 취하면 그 슬라이스가 키를 더하는 순간 이
 * 파서가 먼저 죽는다. 그래서 **아는 둘만 보고 나머지는 그대로 둔다** — `init`이 다시 쓸
 * 때도 남은 절을 보존한다.
 */
import { configError } from './exit'
import type { Io } from './io'
import { join, parent } from './paths'

export const BINDING_FILE = '.wirebound.json'

export interface Binding {
  server: string
  projectId: string
}

/** 파일이 실제로 있던 자리까지 함께 나른다 — `pull`이 그 디렉터리를 리포 뿌리로 쓴다. */
export interface LoadedBinding extends Binding {
  /** `.wirebound.json`이 있던 디렉터리. */
  root: string
  /** 파일 전문(모르는 키 포함). `init`이 다시 쓸 때 보존한다. */
  raw: Record<string, unknown>
}

/**
 * `start`에서 위로 올라가며 `.wirebound.json`을 찾는다. 없으면 `null`.
 *
 * **위로 찾는 이유:** 사람은 리포 뿌리에서만 명령을 치지 않는다. `git`이 같은 규칙을
 * 쓰므로 놀랄 자리가 없다.
 */
export async function findBinding(io: Io, start: string = io.cwd): Promise<LoadedBinding | null> {
  let dir = start
  for (;;) {
    const path = join(dir, BINDING_FILE)
    const text = await io.files.read(path)
    if (text !== null) {
      return { ...parseBinding(text, path), root: dir }
    }
    const up = parent(dir)
    if (up === dir) return null
    dir = up
  }
}

/**
 * 찾아서 없으면 **무엇을 하라고 말하고** 끝낸다. *"설정이 없다"*는 사용자가 고칠 수 있는
 * 상태이므로 코드 2다(`exit.ts`의 표).
 */
export async function requireBinding(io: Io): Promise<LoadedBinding> {
  const found = await findBinding(io)
  if (!found) {
    throw configError(`${BINDING_FILE}을 찾을 수 없습니다. 리포 뿌리에서 \`wireb init\`을 먼저 실행하세요`)
  }
  return found
}

export function parseBinding(text: string, path: string): LoadedBinding {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw configError(`${path}을 읽을 수 없습니다: JSON 형식이 아닙니다`)
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw configError(`${path}을 읽을 수 없습니다: 객체가 아닙니다`)
  }

  const raw = parsed as Record<string, unknown>
  const server = raw.server
  const projectId = raw.projectId
  if (typeof server !== 'string' || server.length === 0) {
    throw configError(`${path}에 server가 없습니다`)
  }
  if (typeof projectId !== 'string' || projectId.length === 0) {
    throw configError(`${path}에 projectId가 없습니다`)
  }

  return { server: normalizeServer(server), projectId, raw, root: parent(path) }
}

/**
 * 끝의 `/`를 걷는다. 안 걷으면 `https://x.com/` + `/api/…`가 `//api/…`가 된다 —
 * 그 요청은 서버에 따라 404가 되고, 원인이 URL 문자열 하나라는 것이 응답에 안 보인다.
 */
export function normalizeServer(server: string): string {
  return server.replace(/\/+$/, '')
}

/** 바인딩 파일의 글자. **`init`이 쓰는 것과 케이스가 읽는 것이 같은 함수에서 나온다.** */
export function serializeBinding(binding: Binding, existing?: Record<string, unknown>): string {
  // 아는 둘을 앞에 두고 모르는 절은 뒤에 그대로 남긴다(위 머리말).
  const { server: _server, projectId: _projectId, ...rest } = existing ?? {}
  return `${JSON.stringify({ server: binding.server, projectId: binding.projectId, ...rest }, null, 2)}\n`
}
