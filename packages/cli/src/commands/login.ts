/**
 * `wireb login` — **유일하게 자격을 만드는 명령**(D5).
 *
 * 순서가 규격이다:
 *
 * 1. `.wirebound.json`을 읽는다(`--server`·`--project`가 덮는다)
 * 2. 이메일·비밀번호로 **세션**을 만든다 (`POST /api/auth/login`)
 * 3. 그 세션으로 **그 프로젝트의 토큰**을 발급받는다 (`POST /api/projects/:id/tokens`)
 * 4. 토큰을 홈 아래에 쓴다 (`credentials.ts` — 리포가 아니다, D6)
 * 5. **세션을 정리한다** (`POST /api/auth/logout`)
 *
 * **5가 있는 이유:** 여기서 만든 세션은 사람이 앉아 있지 않은 자격이고 이 실행 뒤로는
 * 쓸 곳이 없다. 안 지우면 서버의 `sessions`에 만료를 기다리는 행(기본 720시간)이 로그인
 * 횟수만큼 쌓인다. **실패해도 로그인 자체를 실패로 만들지 않는다** — 토큰은 이미
 * 손에 있고, 정리하지 못한 세션은 만료로 사라진다.
 *
 * ---
 *
 * # 비밀번호는 argv에 오지 않는다 (D7)
 *
 * **`--password` 플래그를 만들지 않는다.** 셸 히스토리와 프로세스 목록(`ps`)에 원문이
 * 남는다. `parseArgs`가 strict라 그 플래그를 주면 *"인식할 수 없는 옵션"*으로 죽는다 —
 * **없는 것을 케이스가 든다**(`test/login.test.ts`).
 *
 * | 어디서 | 언제 |
 * |---|---|
 * | `WIREB_PASSWORD` | 있으면 그것 |
 * | 에코 없는 프롬프트 | tty일 때 |
 * | 표준입력 | tty가 아닐 때(`echo "$PW" \| wireb login --email …`) |
 *
 * **이메일은 표준입력에서 읽지 않는다.** 둘 다 거기서 읽으면 *"첫 줄이 무엇인가"*라는
 * 규칙이 하나 더 생기고, 순서를 틀린 사람이 자기 비밀번호를 이메일 자리에 넣게 된다.
 */
import { requireBinding, normalizeServer } from '../binding'
import { callApi, cookieHeader, parseJson } from '../client'
import { saveToken } from '../credentials'
import { EXIT, configError, serverError, usageError } from '../exit'
import type { Io } from '../io'

export interface LoginOptions {
  server?: string
  project?: string
  email?: string
  /** 발급할 토큰의 꼬리표. 서버는 이름에 유일 제약을 걸지 않는다. */
  name?: string
}

export async function runLogin(io: Io, options: LoginOptions): Promise<number> {
  const { server, projectId } = await resolveTarget(io, options)

  const email = options.email ?? nonEmpty(io.env.WIREB_EMAIL)
  if (email === undefined) {
    throw usageError('--email 이 필요합니다 (또는 WIREB_EMAIL)')
  }

  const password = await readPassword(io)
  if (password === undefined) {
    throw configError(
      '비밀번호를 읽을 수 없습니다. tty가 아니면 표준입력으로 주거나 WIREB_PASSWORD를 설정하세요',
    )
  }

  const login = await callApi(io, server, {
    method: 'POST',
    path: '/api/auth/login',
    body: { email, password },
  })

  // **쿠키를 손으로 나른다** — Node의 전역 `fetch`에 쿠키 저장소가 없다(재라 #4, 쟀다).
  const cookie = cookieHeader(login.setCookie)
  if (cookie.length === 0) {
    throw serverError('로그인 응답에 세션 쿠키가 없습니다')
  }

  try {
    const issued = await callApi(io, server, {
      method: 'POST',
      path: `/api/projects/${projectId}/tokens`,
      body: { name: options.name ?? 'wireb' },
      cookie,
    })

    const body = parseJson(issued, '토큰 발급') as { value?: unknown; name?: unknown }
    if (typeof body.value !== 'string' || body.value.length === 0) {
      throw serverError('토큰 발급 응답에 value가 없습니다')
    }

    const path = await saveToken(io, { server, projectId, token: body.value })
    io.out(`토큰을 저장했습니다: ${path}`)
    io.out(`이 자격은 프로젝트 ${projectId} 하나에만 씁니다`)
  } finally {
    // **세션을 정리한다.** 실패해도 이 명령은 실패가 아니다(위 머리말).
    await releaseSession(io, server, cookie)
  }

  return EXIT.ok
}

/** 플래그가 바인딩을 덮는다. **둘 다 플래그로 주면 `.wirebound.json`이 없어도 된다.** */
async function resolveTarget(io: Io, options: LoginOptions): Promise<{ server: string; projectId: string }> {
  const flagServer = nonEmpty(options.server)
  const flagProject = nonEmpty(options.project)
  if (flagServer !== undefined && flagProject !== undefined) {
    return { server: normalizeServer(flagServer), projectId: flagProject }
  }

  const binding = await requireBinding(io)
  return {
    server: flagServer === undefined ? binding.server : normalizeServer(flagServer),
    projectId: flagProject ?? binding.projectId,
  }
}

async function readPassword(io: Io): Promise<string | undefined> {
  const fromEnv = nonEmpty(io.env.WIREB_PASSWORD)
  if (fromEnv !== undefined) return fromEnv

  const prompted = await io.promptSecret('비밀번호: ')
  if (prompted !== null) return nonEmpty(prompted)

  const stdin = await io.readStdin()
  if (stdin === null) return undefined
  // 첫 줄만 쓴다. 파이프로 온 값에는 끝의 줄바꿈이 붙는다.
  return nonEmpty(stdin.split('\n')[0]?.trim())
}

async function releaseSession(io: Io, server: string, cookie: string): Promise<void> {
  try {
    await callApi(io, server, { method: 'POST', path: '/api/auth/logout', cookie })
  } catch {
    // 여기서 끊기면 서버에 세션 행 하나가 만료까지 남는다. 그것을 이유로 방금 받은
    // 토큰을 버리는 것이 더 나쁘다.
  }
}

function nonEmpty(value: string | undefined): string | undefined {
  return value !== undefined && value.length > 0 ? value : undefined
}
