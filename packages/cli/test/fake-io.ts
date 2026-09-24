/**
 * 케이스가 쓰는 가짜 `Io` 하나. **파일도 소켓도 진짜를 건드리지 않는다.**
 *
 * **두 벌을 만들지 않는다.** 명령마다 지역 가짜를 두면 *"어느 하네스에서 잰 값인가"*가
 * 매번 물음이 되고, 무엇보다 비밀을 훑는 자(`no-token-in-repo.test.ts`)가
 * **CLI가 리포에 쓴 파일 전부**를 훑으려면 그 기록이 한 곳에 모여 있어야 한다.
 */
import type { ClientKind, HttpRequestInit, HttpResponse, Io } from '../src/io'

export interface RecordedRequest {
  method: string
  url: string
  headers: Record<string, string>
  body: string | undefined
}

export interface StubResponse {
  status: number
  body?: unknown
  /** 날 문자열 본문. `body`보다 우선한다 — JSON이 아닌 응답을 재는 자리다. */
  text?: string
  /**
   * 날 바이트 본문. **`wireb export`가 받는 zip이 그것이다.**
   *
   * `text`·`body`와 **따로 둔다** — 문자열을 UTF-8로 되돌리는 대역을 쓰면 zip처럼
   * 문자열로 왕복할 수 없는 바이트를 재는 자가 조용히 다른 것을 재게 된다.
   */
  bytes?: Uint8Array
  setCookie?: string[]
  /**
   * 응답 헤더. **키는 소문자로 준다**(진짜 `Headers.get`이 대소문자를 안 가리므로 여기서
   * 흉내만 내면 된다).
   *
   * **`wireb export --format pptx`가 `content-disposition`에서 파일 이름을 읽는다.**
   * 가짜가 헤더를 못 주면 그 자리를 재는 케이스 자체가 설 수 없다 — 아래 `modes`
   * (*"셋째 인자를 버리면 권한을 못 본다"*)·`createFakeIo`의 `consume`(*"본문은 한 번만
   * 읽힌다"*)과 같은 부류다.
   */
  headers?: Record<string, string>
}

export type Route = (request: RecordedRequest) => StubResponse | Error

export interface FakeIo extends Io {
  /**
   * 쓴 파일 전부. **디렉터리 개념이 없다** — 절대 경로가 키다.
   *
   * **값이 글자일 수도 바이트일 수도 있다.** `Io.files.write`가 그 둘을 받으므로
   * 여기서 글자로 좁히면 **가짜가 진짜보다 좁아진다** — `wireb export --format pptx`가 쓴
   * 바이트를 케이스가 관찰할 수단 자체가 없어진다(아래 `modes`가 `write`의 셋째 인자에서
   * 막는 것과 같은 부류다).
   */
  readonly fs: Map<string, string | Uint8Array>
  /**
   * 그 경로의 내용을 **글자로**. 없으면 `undefined`.
   *
   * 바이트로 쓰였으면 UTF-8로 되돌린다 — 진짜 `readFile(path, 'utf8')`이 하는 그대로다.
   */
  readonly text: (path: string) => string | undefined
  /**
   * 쓴 파일 **전부**를 글자로. `[경로, 내용]` 짝이다.
   *
   * **비밀을 훑는 자가 이것을 쓴다**(`no-token-in-repo.test.ts`). `fs`를 직접 훑으면
   * 바이너리 파일이 `Uint8Array`라 `includes`가 안 되고, 그 파일만 검사에서 빠진다 —
   * **훑는 자가 눈을 감는 자리**다. 여기서 되돌리면 바이너리에 실린 비밀도 걸린다.
   */
  readonly textEntries: () => [string, string][]
  /**
   * `files.write`가 받은 **셋째 인자**를 경로별로 기록한다.
   *
   * **이것을 버리면 자가 눈을 감는다.** `Io`의 계약은 `write(path, content, options?: { mode?, dirMode? })`인데
   * 가짜가 셋째 인자를 아예 안 받으면 **단위 케이스가 권한을 관찰할 수단 자체가 없다** —
   * 자격 파일의 0600/0700을 0644/0755로 바꿔도 아무 케이스도 안 죽는다.
   */
  readonly modes: Map<string, { mode?: number; dirMode?: number }>
  readonly stdout: string[]
  readonly stderr: string[]
  readonly requests: RecordedRequest[]
  /** `METHOD /경로` → 응답. 없으면 404를 낸다. */
  readonly routes: Map<string, Route>
}

export interface FakeIoOptions {
  /**
   * 이 프로세스가 자기를 무엇이라 말하는가. 기본은 `'cli'`다 — `wireb`의 케이스가 다수다.
   *
   * **가짜가 이 필드를 버리면 자가 눈을 감는다.** `callApi`가 그것을 헤더로 싣는데
   * 가짜가 안 들면 *"헤더를 싣는다"*를 재는 케이스 자체가 설 수 없다 —
   * 위 `modes`가 `write`의 셋째 인자에서 막는 것과 같은 부류다.
   */
  client?: ClientKind
  cwd?: string
  home?: string
  env?: Record<string, string | undefined>
  /** 파일을 미리 심는다. 키는 절대 경로. */
  files?: Record<string, string>
  /**
   * 그 경로를 읽으면 **던진다.** 진짜 파일 시스템에서만 나는 실패(`EACCES`·`EPERM`…)를
   * 케이스가 만들 수 있게 하는 자리다 — `chmod 000`으로 재면 **root로 도는 판에서 그냥
   * 읽혀** 값이 누가 돌리느냐에 갈린다.
   *
   * `files`보다 **먼저** 본다: 파일이 있는데 못 읽는 상태가 재려는 것이다.
   */
  readFailures?: Record<string, Error>
  /** tty처럼 굴어 `promptSecret`이 이 값을 낸다. `undefined`면 tty가 아니다. */
  secret?: string
  /** 표준입력 전문. `undefined`면 비어 있다. */
  stdin?: string
}

export function createFakeIo(options: FakeIoOptions = {}): FakeIo {
  const fs = new Map<string, string | Uint8Array>(Object.entries(options.files ?? {}))
  const modes = new Map<string, { mode?: number; dirMode?: number }>()
  const stdout: string[] = []
  const stderr: string[] = []
  const requests: RecordedRequest[] = []
  const routes = new Map<string, Route>()

  const fetchImpl = async (url: string, init?: HttpRequestInit): Promise<HttpResponse> => {
    const request: RecordedRequest = {
      method: init?.method ?? 'GET',
      url,
      headers: init?.headers ?? {},
      body: init?.body,
    }
    requests.push(request)

    const path = url.replace(/^https?:\/\/[^/]+/, '')
    const route = routes.get(`${request.method} ${path}`)
    const outcome: StubResponse | Error = route
      ? route(request)
      : { status: 404, body: { error: { code: 'not-found', message: '대상을 찾을 수 없습니다' } } }

    // **던지는 것이 *"닿지 못했다"*다** — 전역 `fetch`가 DNS·연결 거부에서 그렇게 한다.
    if (outcome instanceof Error) throw outcome

    const text = outcome.text ?? (outcome.body === undefined ? '' : JSON.stringify(outcome.body))
    const setCookie = outcome.setCookie ?? []
    const headers = outcome.headers ?? {}

    /**
     * **본문은 한 번만 내준다** — 진짜 `Response`의 계약이다.
     *
     * `text()`와 `bytes()`를 몇 번이든 내주면 `callApiBytes`가 2xx에서 **둘 다** 부르게
     * 바꿔도 케이스가 하나도 안 죽는다. 그 코드는 실서버에서 즉시 깨진다. **가짜가 계약을
     * 안 흉내 내면 자가 눈을 감는다** — 위 `modes`(*"셋째 인자를 버리면 권한을 못 본다"*)와
     * 같은 부류이고, 여기서 지키는 것은 인자가 아니라 **한 번만 읽힌다는 성질**이다.
     *
     * 문장은 진짜 `Response`의 것을 따른다(`TypeError: Body is unusable`).
     */
    let consumed: 'text' | 'bytes' | null = null
    const consume = (what: 'text' | 'bytes'): void => {
      if (consumed !== null) {
        throw new TypeError(`Body is unusable: already read (${consumed} 뒤에 ${what})`)
      }
      consumed = what
    }

    return {
      status: outcome.status,
      headers: {
        get: (name) => {
          const key = name.toLowerCase()
          if (key === 'set-cookie') return setCookie[0] ?? null
          return headers[key] ?? null
        },
        getSetCookie: () => setCookie,
      },
      text: async () => {
        consume('text')
        return text
      },
      bytes: async () => {
        consume('bytes')
        return outcome.bytes ?? new TextEncoder().encode(text)
      },
    }
  }

  return {
    client: options.client ?? 'cli',
    cwd: options.cwd ?? '/repo',
    home: options.home ?? '/home/tester',
    env: options.env ?? {},
    out: (line) => stdout.push(line),
    err: (line) => stderr.push(line),
    files: {
      read: async (path) => {
        // **있는데 못 읽는 상태가 먼저다.** `null`(없다)과 갈라야 하는 것이 그것이다.
        const failure = options.readFailures?.[path]
        if (failure) throw failure
        const found = fs.get(path)
        if (found === undefined) return null
        // **바이트를 글자로 되돌린다.** 진짜 `readFile(path, 'utf8')`이 하는 그대로다 —
        // *"있다"*를 재는 자리(`conflicts`)가 바이너리 파일을 못 보면 덮어쓰기 검사가 샌다.
        return typeof found === 'string' ? found : new TextDecoder().decode(found)
      },
      // **셋째 인자를 버리지 않는다** — 버리면 권한을 재는 자가 설 수 없다(위 `modes`).
      write: async (path, content, options) => {
        fs.set(path, content)
        modes.set(path, { mode: options?.mode, dirMode: options?.dirMode })
      },
      /**
       * **디렉터리를 키에서 유추한다.** 이 가짜에는 디렉터리 개념이 없으므로(위 `fs`)
       * *"그 경로로 시작하는 키가 있으면 디렉터리"*로 읽는다 — 진짜 파일 시스템에서
       * `mkdir -p`가 만드는 것과 같은 자리다.
       *
       * **파일이 먼저다.** 같은 이름이 파일이면서 디렉터리일 수는 없다.
       */
      kind: async (path) => {
        const failure = options.readFailures?.[path]
        if (failure) throw failure
        if (fs.has(path)) return 'file'
        return [...fs.keys()].some((key) => key.startsWith(`${path}/`)) ? 'directory' : null
      },
    },
    fetch: fetchImpl,
    promptSecret: async () => options.secret ?? null,
    readStdin: async () => options.stdin ?? null,
    fs,
    text: (path) => {
      const found = fs.get(path)
      if (found === undefined) return undefined
      return typeof found === 'string' ? found : new TextDecoder().decode(found)
    },
    textEntries: () =>
      [...fs.entries()].map(([path, content]) => [
        path,
        typeof content === 'string' ? content : new TextDecoder().decode(content),
      ]),
    modes,
    stdout,
    stderr,
    requests,
    routes,
  }
}

/** 라우트를 건다. 문자열 키를 손으로 조립하지 않게 감싼다. */
export function stub(io: FakeIo, method: string, path: string, response: StubResponse | Route): void {
  io.routes.set(`${method} ${path}`, typeof response === 'function' ? response : () => response)
}
