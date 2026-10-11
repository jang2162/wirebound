/**
 * `.wirebound.json` — 설계서 「리포 바인딩」.
 *
 * ```jsonc
 * { "server": "https://wirebound.example.com", "projectId": "prj_a1b2" }
 * ```
 *
 * *"이 리포가 어느 설계 프로젝트에 대응하는가"*만 선언한다. **그래서 `wireb init`은
 * 네트워크를 안 탄다** — 선언을 쓰는 데 서버가 필요 없다.
 *
 * ---
 *
 * # 이 파일은 커밋되는 파일이다 — **자격을 여기 쓰지 않는다**
 *
 * 설계서가 *"개발 리포 루트에 둔다"*고 적었고 리포 바인딩을 **선언**하는 것이 존재
 * 이유이므로, 팀이 함께 보는 파일이다. 토큰은 `credentials.ts`가 홈 아래에 쓴다.
 *
 * # 모르는 키를 거부하지 않는다
 *
 * 이 파일에는 **최상위 `lint` 키**(lint 설정 — `LintConfig`)도 산다. `z.strictObject` 같은
 * 태도를 취하면 키가 하나 늘 때마다 이 파서가 먼저 죽는다. 그래서 **아는 둘만 보고 나머지는
 * 그대로 둔다** — `init`이 다시 쓸 때도 남은 절을 보존한다.
 *
 * # `lint` 절
 *
 * ```jsonc
 * { "server": "…", "projectId": "…", "lint": { "naming": { "page": "…", "menu": "…" } } }
 * ```
 *
 * **`LintConfig`의 모양을 그대로 싣는다.** 중간에 이름을 바꾸면 파일과 타입이 두 벌이 된다.
 * **설계서 「리포 바인딩」의 예시에는 그 키가 없다** — 예시는 필수 둘만 싣고, `lint` 절은
 * 없어도 되는 선택 절이다.
 *
 * **`init`은 그 절을 만들지 않는다.** 기본값이 없으므로 빈 절을 써 두면
 * *"안 줬다"*와 *"빈 것을 줬다"*가 섞인다.
 */
import type { LintConfig } from '@wirebound/schema'
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
 * 앞뒤 공백과 끝의 `/`를 걷고, **못 쓰는 것이면 여기서 끊는다.**
 *
 * 끝의 `/`를 안 걷으면 `https://x.com/` + `/api/…`가 `//api/…`가 된다 — 그 요청은 서버에
 * 따라 404가 되고, 원인이 URL 문자열 하나라는 것이 응답에 안 보인다.
 *
 * ---
 *
 * # 왜 여기서 끊는가 — `client.ts`의 `assertSendableHeaders`와 **같은 부류다**
 *
 * `server`가 스킴이 없거나(`wb.example.com`) 오타면(`htp://…`) `fetch`가 던지고,
 * `client.ts`의 `catch`가 그것을 **"서버에 연결할 수 없습니다"(코드 4)**로 옮긴다.
 * **원인은 사용자의 설정 파일 한 줄인데 코드가 *"주소·네트워크·서버 기동을 보라"*고 말한다.**
 * `WIREB_TOKEN`에 비-ASCII가 들었을 때와 정확히 같은 모양이고, 답도 같다 — 보내기 전에
 * 검사한다.
 *
 * **`new URL()`만으로는 모자라다** — 아래는 각 값을 `new URL()`과 `fetch`에 넣어 본 결과다.
 *
 * | 값 | `new URL()` | `fetch` |
 * |---|---|---|
 * | `wb.example.com` | **던진다**(Invalid URL) | Invalid URL |
 * | `htp://wb.example.com` | **통과한다**(`protocol: 'htp:'`) | **unknown scheme** |
 * | `ftp://x` | **통과한다** | **unknown scheme** |
 * | `https://` | **통과한다**(host가 빈다) | `getaddrinfo ENOTFOUND api` ← 경로 첫 마디를 호스트로 읽는다 |
 *
 * 그래서 셋을 다 본다: **파싱되고 · 스킴이 http(s)이고 · 호스트가 있다.**
 *
 * **코드는 2다**(*"설정을 고쳐라"*). `exit.ts`의 4는 *"주소·네트워크·서버 기동을 본다"*라
 * 표 안에 들어가기는 하지만, 사람이 할 일이 **`.wirebound.json` 한 줄 고치기**라면 그것은
 * `wireb init`을 가리키는 2 쪽이다.
 *
 * **`init`도 이 함수를 지난다** — 그래서 못 쓰는 주소로는 바인딩이 **아예 안 써진다.**
 * 검사를 `client.ts`에 두면 파일은 이미 쓰인 뒤라 사람이 두 번 고쳐야 한다.
 */
export function normalizeServer(server: string): string {
  const trimmed = server.trim().replace(/\/+$/, '')

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw configError(`${SERVER_HINT}: ${JSON.stringify(server)}`)
  }
  if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || parsed.host.length === 0) {
    throw configError(`${SERVER_HINT}: ${JSON.stringify(server)}`)
  }

  return trimmed
}

/** 두 갈래가 같은 문장을 쓴다 — 갈래마다 다른 말을 하면 사람이 원인을 둘로 센다. */
const SERVER_HINT = '서버 주소는 http:// 또는 https:// 로 시작해야 합니다. `.wirebound.json`의 server 나 --server 를 확인하세요'

/** 바인딩 파일의 글자. **`init`이 쓰는 것과 케이스가 읽는 것이 같은 함수에서 나온다.** */
export function serializeBinding(binding: Binding, existing?: Record<string, unknown>): string {
  // 아는 둘을 앞에 두고 모르는 절은 뒤에 그대로 남긴다(위 머리말).
  const { server: _server, projectId: _projectId, ...rest } = existing ?? {}
  return `${JSON.stringify({ server: binding.server, projectId: binding.projectId, ...rest }, null, 2)}\n`
}

/**
 * `.wirebound.json`의 `lint` 절을 `LintConfig`로 읽는다. **없으면 `undefined`다** —
 * 빈 객체를 지어내지 않는다 — 안 주면 그 축이 안 도는 것이 옳다.
 *
 * **정규식을 여기서 컴파일하지 않는다.** 못 읽는 정규식은 `lintDesign`이 이미
 * `naming` 이슈로 낸다 — 여기서 먼저 죽이면 *"규칙 하나가 잘못 적혔다"*가 *"명령이 서지
 * 못했다"*(코드 2)가 되어, 나머지 규칙의 결과까지 함께 사라진다.
 *
 * **모양이 어긋나면 코드 2다.** 사람이 자기 리포의 파일 한 줄을 고치면 되는 상태이고,
 * 조용히 무시하면 *"명명 규칙을 켰는데 안 돈다"*를 아무도 못 알아챈다.
 */
export function readLintConfig(binding: LoadedBinding): LintConfig | undefined {
  const section = binding.raw.lint
  if (section === undefined || section === null) return undefined
  const where = join(binding.root, BINDING_FILE)
  if (typeof section !== 'object' || Array.isArray(section)) {
    throw configError(`${where}의 lint 는 객체여야 합니다`)
  }

  const naming = (section as Record<string, unknown>).naming
  if (naming === undefined || naming === null) return {}
  if (typeof naming !== 'object' || Array.isArray(naming)) {
    throw configError(`${where}의 lint.naming 은 객체여야 합니다`)
  }

  const config: LintConfig = { naming: {} }
  for (const axis of ['page', 'menu'] as const) {
    const value = (naming as Record<string, unknown>)[axis]
    if (value === undefined) continue
    if (typeof value !== 'string') {
      throw configError(`${where}의 lint.naming.${axis} 는 정규식 문자열이어야 합니다`)
    }
    config.naming![axis] = value
  }
  return config
}
