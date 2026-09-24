/**
 * 자격 저장소. **리포 밖, 홈 아래**.
 *
 * `.wirebound.json`은 커밋되는 파일이므로 토큰을 거기 쓰면 다음 `git push`에 실려 나간다.
 * `test/no-token-in-repo.test.ts`가 *"CLI가 리포 안에 쓴 파일 **전부**"*를 훑어 원문이
 * 어디에도 없는지 본다 — 나중에 캐시 파일이 하나 늘어도 그 자가 먼저 말한다.
 *
 * ---
 *
 * # 환경 변수가 파일을 덮는다 — CI에는 홈이 없을 수 있다
 *
 * | 변수 | 무엇 |
 * |---|---|
 * | `WIREB_TOKEN` | **토큰 원문.** 있으면 파일을 아예 안 읽는다 |
 * | `WIREB_CREDENTIALS` | 자격 **파일 경로**. 홈 아래 기본 자리를 덮는다 |
 *
 * `WIREB_TOKEN`이 이기는 것은 그것이 *"지금 이 실행에 이 자격을 써라"*라는 더 구체적인
 * 지시이기 때문이다. 그때 `login`은 **여전히 파일에 쓴다** — 환경 변수를 고쳐 줄 수 없다.
 *
 * # 서버 × 프로젝트로 여러 벌을 담는다
 *
 * 토큰 스코프가 프로젝트 단위이므로(설계서 「권한 모델」) 리포 둘을 오가는 사람은 자격도 둘이다. 하나만
 * 담으면 리포를 바꿀 때마다 다시 로그인해야 한다.
 */
import { CliError, EXIT, configError } from './exit'
import type { Io } from './io'
import { join, resolveFrom } from './paths'

/** 자격 파일의 형식 버전. 읽는 쪽이 모르는 버전을 만나면 말하고 멈춘다. */
export const CREDENTIALS_VERSION = 1

export interface CredentialEntry {
  server: string
  projectId: string
  token: string
}

export interface CredentialStore {
  version: number
  credentials: CredentialEntry[]
}

/** 홈 아래 기본 자리. `WIREB_CREDENTIALS`가 이것을 덮는다. */
export function credentialsPath(io: Io): string {
  const override = io.env.WIREB_CREDENTIALS
  if (override !== undefined && override.length > 0) {
    return resolveFrom(io.cwd, override)
  }
  return join(io.home, '.wirebound', 'credentials.json')
}

async function readStore(io: Io): Promise<CredentialStore> {
  const path = credentialsPath(io)
  const text = await io.files.read(path)
  if (text === null) return { version: CREDENTIALS_VERSION, credentials: [] }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw configError(`자격 파일을 읽을 수 없습니다: ${path} (JSON 형식이 아닙니다)`)
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw configError(`자격 파일을 읽을 수 없습니다: ${path} (객체가 아닙니다)`)
  }

  const raw = parsed as Record<string, unknown>
  if (raw.version !== CREDENTIALS_VERSION) {
    // 모르는 형식을 **조용히 덮지 않는다** — 덮으면 그 파일의 다른 자격까지 사라진다.
    throw new CliError(
      EXIT.config,
      `이 wireb가 읽을 수 없는 자격 파일 형식입니다: ${path} (형식 ${String(raw.version)}, 지원 ${CREDENTIALS_VERSION})`,
    )
  }
  const list = Array.isArray(raw.credentials) ? raw.credentials : []
  const credentials = list.filter(isEntry)
  return { version: CREDENTIALS_VERSION, credentials }
}

function isEntry(value: unknown): value is CredentialEntry {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Record<string, unknown>
  return typeof entry.server === 'string' && typeof entry.projectId === 'string' && typeof entry.token === 'string'
}

/**
 * 그 서버·프로젝트의 토큰. 없으면 `null`.
 *
 * **`WIREB_TOKEN`이 이긴다.** 그 변수는 서버·프로젝트를 말하지 않으므로 *"지금 부르려는
 * 그것"*에 그대로 쓴다 — 스코프가 틀렸으면 서버가 404로 말한다.
 */
export async function findToken(io: Io, server: string, projectId: string): Promise<string | null> {
  const fromEnv = io.env.WIREB_TOKEN
  if (fromEnv !== undefined && fromEnv.length > 0) return fromEnv

  const store = await readStore(io)
  const found = store.credentials.find((entry) => entry.server === server && entry.projectId === projectId)
  return found?.token ?? null
}

/**
 * 자격 하나를 넣거나 갈아 끼운다. 같은 서버·프로젝트의 앞 자격은 **대체된다** —
 * 남겨 두면 어느 것이 쓰이는지가 순서에 달리고, 폐기된 토큰이 파일에 남는다.
 *
 * 파일 권한을 좁힌다(0600, 디렉터리 0700). 넓은 채로 두면 같은 기계의 다른 사용자가
 * 그대로 읽는다.
 */
export async function saveToken(io: Io, entry: CredentialEntry): Promise<string> {
  const store = await readStore(io)
  const credentials = store.credentials.filter(
    (existing) => !(existing.server === entry.server && existing.projectId === entry.projectId),
  )
  credentials.push(entry)

  const path = credentialsPath(io)
  await io.files.write(path, `${JSON.stringify({ version: CREDENTIALS_VERSION, credentials }, null, 2)}\n`, {
    mode: 0o600,
    dirMode: 0o700,
  })
  return path
}
