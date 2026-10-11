/**
 * **에디터를 실브라우저로 모는 판 하나를 통째로 세우고 내린다** — 일회용 DB · api · 웹(vite dev) · 헤드리스 Chrome.
 *
 * jsdom 은 포커스 · blur · 클릭 순서 · 좌표를 재지 못하고(`fireEvent.click` 은 포커스를 안 옮겨 blur 가 안 난다), 서로 다른
 * 연결(WS · REST)로 가는 두 요청의 겨룸도 없다. 그 자리의 결함은 jsdom 케이스가 초록인 채 실브라우저에서만 선다. 이 파일이 그
 * 판을 저장소 안에서 다시 세우는 자리다 — 케이스는 `*.test.ts` 가 들고, 여기는 판을 세우고 거두는 것만 한다.
 *
 * # 무엇을 띄우나
 *
 * | 무엇 | 어디 | 왜 그렇게 |
 * |---|---|---|
 * | DB | `apps/api/.env`(셸이 이긴다)의 `DATABASE_URL` 이 가리키는 컨테이너에 **새 DB 하나** | 워크트리 dev DB · 테스트 DB 를 안 건드린다. 끝에 `DROP … WITH (FORCE)` |
 * | 계정 | `migrate latest` 의 시딩(`SEED_USER_*`) — 서버와 같은 길 | 비밀번호는 `randomBytes` 로 만들어 자식의 `env` 로만 넘긴다. 명령 글자에 안 싣는다 |
 * | api | `tsx --conditions=development src/main.ts` · 빈 포트 | 패키지를 `dist` 가 아니라 소스로 읽는다 — `pnpm test:build` 의 다른 파일이 `dist` 를 비웠다 채우는 것과 무관하다 |
 * | 웹 | `vite --port <빈 포트> --strictPort`(운영 번들 판이면 `vite preview`) · 셸 `PORT` 로 프록시 대상을 준다 | 셸이 `apps/api/.env` 를 이긴다(`config/api-proxy-target.ts`) |
 * | 브라우저 | `playwright-core` + 아래 `chromeCandidates` 가운데 **실제로 뜨는 것** | 사람의 브라우저 · 공유 프로필을 안 쓴다 |
 *
 * **포트를 고정하지 않는다** — 워크트리 여럿이 동시에 돌려도 부딪히지 않는다. 쿠키 이름도 api 포트를 붙여 짓고 케이스는 그
 * 이름을 글자로 적지 않는다 — 로그인 응답의 `Set-Cookie` 에서 읽는다.
 *
 * # 끝에 무엇을 재나
 *
 * `close()` 는 거두기 **앞 · 뒤로 센다**(`Teardown`) — 띄운 프로세스 그룹에 산 프로세스 · 띄운 포트의 LISTEN(접속이 거절되는지로
 * 잰다 — `lsof` 가 없는 기계에서도 선다) · 만든 DB. 케이스 파일의 `afterAll` 이 뒤 값 0 과 앞 값(카나리아)을 단언한다. 판을 세우다
 * 던져도 그때까지 띄운 것을 거둔다. vitest 가 신호로 죽으면 `process.on('exit')` 이 그룹째 `SIGKILL` 한다.
 *
 * **`SIGKILL` 로 죽은 실행의 DB 는 다음 판이 거둔다**(`sweepStaleBrowserDatabases`) — 죽은 프로세스는 `exit` 처리기도 못 돌린다.
 * 산 실행(같은 워크트리에서 동시에 도는 `pnpm test:browser`)의 것은 안 지운다 — 이름에 적은 pid 가 살아 있으면 둔다. 그때 떼어
 * 띄운 그룹(api · vite)은 스스로 끝난다 — 띄운 이 프로세스가 사라지면 그룹째 죽는 줄(`group-lifeline.mjs`)에 매달아 띄운다.
 *
 * # 이 판이 못 재는 것
 *
 * - **운영 번들은 기본으로 안 잰다.** vite dev 로 띄운다 — 모듈이 쪼개져 오고 React 개발 판이라 `StrictMode` 가 이펙트를 두 번
 *   돌린다(페이지를 열 때 조회가 두 번 나간다 — 운영 번들은 한 번). 셸의 `EDITOR_STACK_BUNDLE=build` 면 `vite build` + `vite
 *   preview`(같은 프록시)로 띄운다 — 이펙트 · 마운트 순서를 바꾸는 트랙은 그 판으로 한 번 더 돈다. [Chrome] 이 디렉터리의 판 전부가
 *   두 판에서 같은 판정이었다(판 하나가 `vite build` 한 번만큼 늦다).
 * - **망 지연 · 끊김.** 모두 루프백이다 — 두 연결의 지연 차가 0 이라 도착 순서가 늘 보내는 순서다. 겨룸을 재는 케이스는 `startWsDelay`
 *   로 한쪽 연결만 늦추고, 끊김을 재는 케이스는 `startCutProxy` 로 고른 연결만 끊는다.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { lstatSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import net from 'node:net'
import { hostname, tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'
import pg from 'pg'
import { chromium, type Browser, type BrowserContext, type FrameLocator, type Page } from 'playwright-core'

const API_DIR = fileURLToPath(new URL('../../api/', import.meta.url))
const WEB_DIR = fileURLToPath(new URL('../', import.meta.url))
const TSX = `${API_DIR}node_modules/.bin/tsx`
const LIFELINE = fileURLToPath(new URL('./group-lifeline.mjs', import.meta.url))

/**
 * 웹을 무엇으로 띄우나 — 기본은 vite dev. 셸의 `EDITOR_STACK_BUNDLE=build` 면 `vite build` 한 번 뒤 `vite preview`(같은 프록시 설정)
 * 로 **운영 번들**을 띄운다. 머리말 「이 판이 못 재는 것」의 «운영 번들».
 */
const BUNDLE: 'dev' | 'build' = process.env.EDITOR_STACK_BUNDLE === 'build' ? 'build' : 'dev'
const VITE = `${WEB_DIR}node_modules/.bin/vite`

/**
 * 띄워 볼 브라우저 — **앞에서부터 실제로 떠 보고 처음 뜬 것**을 쓴다. `undefined` 는 playwright-core 캐시의 헤드리스 셸이다.
 * 시스템 Chrome 을 앞에 두는 것은 이 판들의 전 · 후 값을 그 브라우저로 쟀기 때문이다. 셸의 `EDITOR_BROWSER_PATH` 는 **그것 하나만**
 * 띄워 본다 — 브라우저를 고르는 길이자 «못 뜨면 건너뛴다»를 다시 재는 길이다(없는 경로를 주면 전부 건너뛴다).
 */
function chromeCandidates(): (string | undefined)[] {
  const fromShell = process.env.EDITOR_BROWSER_PATH
  if (fromShell !== undefined && fromShell !== '') return [fromShell]
  return ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', undefined]
}

/** `apps/api/.env` 의 `DATABASE_URL` — 셸이 이긴다(`--env-file-if-exists` 와 같은 순서). 새 DB 를 만들 컨테이너를 가리킨다. */
function baseDatabaseUrl(): string | undefined {
  const fromShell = process.env.DATABASE_URL
  if (fromShell !== undefined && fromShell !== '') return fromShell
  try {
    const value = parseEnv(readFileSync(`${API_DIR}.env`, 'utf8')).DATABASE_URL
    return value === undefined || value === '' ? undefined : value
  } catch {
    return undefined
  }
}

/**
 * compose 기본 포트 — `apps/api/src/db/port-agreement.ts` 의 `COMPOSE_DEFAULT_POSTGRES_PORT` 와 같은 값이어야 한다(두 앱은 서로를
 * import 하지 않는다).
 */
const COMPOSE_DEFAULT_POSTGRES_PORT = '5433'

/** 체크아웃 뿌리의 `.git` 이 파일이면 git 워크트리다(`apps/api/test/test-database-url.ts` 의 `isInsideGitWorktree` 와 같은 규칙). */
function insideGitWorktree(dir: string): boolean {
  for (let current = dir; ; current = dirname(current)) {
    try {
      return lstatSync(join(current, '.git')).isFile()
    } catch {
      // 한 칸 올라간다
    }
    if (dirname(current) === current) return false
  }
}

function withDatabase(url: string, database: string): string {
  const parsed = new URL(url)
  parsed.pathname = `/${database}`
  return parsed.toString()
}

export type Prerequisite = { ok: true; executablePath: string | undefined; databaseUrl: string } | { ok: false; reason: string }

/**
 * **건너뛸 전제를 실물로 정한다** — 경로가 있는지가 아니라 브라우저를 띄워 보고 DB 에 붙어 본다. 경로로 정하면 문서대로 세운
 * 기계에서 전부 건너뛴 채 초록으로 끝난다(`apps/api/build-test/screen-chromium.test.ts` 의 `browserLaunches`).
 */
export async function editorStackPrerequisite(): Promise<Prerequisite> {
  let executablePath: string | undefined | null = null
  for (const candidate of chromeCandidates()) {
    try {
      const browser = await chromium.launch({ executablePath: candidate, headless: true })
      await browser.close()
      executablePath = candidate
      break
    } catch {
      // 다음 후보
    }
  }
  if (executablePath === null) {
    return {
      ok: false,
      reason: `브라우저를 띄우지 못했다 — ${chromeCandidates()
        .map((path) => path ?? 'playwright-core 캐시')
        .join(' · ')}(README 「넣는 법」 절)`,
    }
  }
  const databaseUrl = baseDatabaseUrl()
  if (databaseUrl === undefined) {
    return { ok: false, reason: 'DATABASE_URL 이 없다 — 셸에도 apps/api/.env 에도 없다(README 「세우기 — 다섯 걸음」 절)' }
  }
  // **워크트리에서 compose 기본 포트면 멈춘다** — 그 컨테이너는 최상위 체크아웃의 것, 곧 사용자의 설계서가 든 DB 다. 거기에 DB 를
  // 만들고 지우지 않는다. 건너뛰지 않고 던지는 것은 조용히 초록이 되지 않게 하려는 것이다.
  if (insideGitWorktree(API_DIR) && new URL(databaseUrl).port === COMPOSE_DEFAULT_POSTGRES_PORT) {
    throw new Error(
      `이 워크트리의 DATABASE_URL 이 compose 기본 포트(${COMPOSE_DEFAULT_POSTGRES_PORT}) — 최상위 체크아웃의 컨테이너를 가리킨다. ` +
        'README 「워크트리를 여럿 띄울 때」 절대로 이 워크트리의 컨테이너를 띄우고 apps/api/.env 를 그 값으로 적는다.',
    )
  }
  const client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 3000 })
  try {
    await client.connect()
    await client.query('select 1')
  } catch (error) {
    return { ok: false, reason: `DATABASE_URL 의 Postgres 에 붙지 못했다 — ${(error as Error).message}` }
  } finally {
    await client.end().catch(() => {})
  }
  return { ok: true, executablePath, databaseUrl }
}

export interface StackUser {
  readonly email: string
  readonly name: string
  readonly password: string
}

export interface Session {
  /** `이름=값` — `Set-Cookie` 에서 읽은 그대로. */
  readonly cookie: string
}

export interface RowHold {
  /**
   * 이 잠금 뒤에 줄 선 연결이 `count` 개가 될 때까지 기다린다 — 안 서면 던진다. 요청이 정말 줄 섰는지의 카나리아다. **사슬째 센다** —
   * 한 행에 둘째로 줄 선 연결은 쥔 연결이 아니라 앞의 대기자를 기다린다(`pg_blocking_pids`). DB 전체의 대기자를 세지 않는다 — 다른
   * 행의 줄까지 읽는다(`CLAUDE.md` «경주를 재는 케이스는 두 요청이 겹친 판만 센다»).
   */
  waitForWaiters(count?: number, timeoutMs?: number): Promise<void>
  release(): Promise<void>
}

/** 쥔 연결 뒤에 **줄을 서는** 잠금(`queueRow`). 줄에 섰는지는 앞 잠금의 `waitForWaiters` 로 센다. */
export interface QueuedRowHold {
  /** 앞의 잠금이 풀려 이 연결이 행을 쥐었을 때 풀린다. */
  readonly acquired: Promise<void>
  /** 쥔 뒤에 놓는다 — 아직 줄에 서 있으면 쥘 때까지 기다렸다가 놓는다. */
  release(): Promise<void>
}

/**
 * 브라우저와 웹(vite) 사이의 TCP 프록시 — **고른 연결만 끊는다.** 연결마다 마지막 요청 줄(`GET /api/…/ws` · `PATCH …`)을 적어 두고
 * 그 줄로 고른다. 모든 소켓을 끊으면 vite 의 HMR 소켓까지 끊겨 페이지가 새로고침되고 측정이 사라진다 — 그래서 요청 줄로 고른다
 * (`CLAUDE.md` «실브라우저로 끊김을 잴 때는 api 연결만 골라 끊는다»). 새 연결은 늘 그대로 흐른다.
 */
export interface CutProxy {
  /** 이 주소로 탭을 연다(`openTab` 의 `origin`). */
  readonly origin: string
  /** 요청 줄이 `match` 에 맞는 **지금 열린** 연결의 브라우저 → 서버 바이트를 버린다(연결은 산다). 맞은 연결 수. */
  blackhole(match: RegExp): number
  /** 요청 줄이 `match` 에 맞는 지금 열린 연결을 RST 로 끊는다. 맞은 연결 수. */
  reset(match: RegExp): number
  close(): Promise<void>
}

/**
 * api ↔ DB 사이의 TCP 프록시(`startEditorStack`의 `dbHalfCut` 옵션) — **그 질의를 서버에 넘긴 뒤 api 쪽 소켓만 끊는다.** 서버의 백엔드는 상대가 떠난 줄
 * 모른 채 그 트랜잭션을 마친다 — 커밋은 되는데 api 는 COMMIT 의 답을 잃는다(`apps/api/test/pg-fault-proxy.ts`의 `halfCutOnQuery`와 같은 장치다. 두 앱은
 * 서로를 import 하지 않아 이쪽에 작게 다시 짓는다).
 */
export interface DbHalfCut {
  /**
   * 무장한다 — **그 글자를 담은 질의를 보낸 연결이 다음에 보내는 `COMMIT`**에서 쏜다(한 번 쏘면 풀린다). 배경 요청의 COMMIT 이 먼저 맞지 않게 연결마다
   * 글자를 본 뒤의 COMMIT 만 고른다.
   */
  arm(fragment: string): void
  /** 쐈는가 — 판이 섰는지의 카나리아다. */
  readonly fired: boolean
}

export interface Census {
  /** 띄운 프로세스 그룹에 산 프로세스. */
  readonly processes: number
  /** LISTEN 인 포트(api · 웹 · 지연 프록시). */
  readonly listeningPorts: number[]
  /** 이 판의 DB 가 있나(0 · 1). */
  readonly databases: number
}

/**
 * 거두기 **앞 · 뒤**의 센 값. 앞 값은 세는 자의 카나리아다 — 도는 동안 0 이면 뒤의 0 은 0 과 0 을 견준 것이다
 * (`ps` 가 없는 기계에서 프로세스 수가 늘 0 이던 판이 있었다 — `CLAUDE.md` 「목 · 계측은 불린 수를 값으로 확인하고」 절).
 */
export interface Teardown {
  readonly before: Census
  readonly after: Census
}

export interface EditorStack {
  readonly webUrl: string
  readonly apiUrl: string
  readonly users: { readonly alice: StackUser; readonly bob: StackUser }
  readonly browser: Browser
  /** api 에 직접 로그인한다 — Node 쪽 픽스처용. */
  login(user: StackUser): Promise<Session>
  /** api 에 직접 보낸다(`/api` 뒤의 경로). */
  request(session: Session, method: string, path: string, body?: unknown): Promise<{ status: number; body: any }>
  /** 새 브라우저 컨텍스트에 `user` 로 로그인하고 탭 하나를 연다. `origin` 을 주면 그 주소(지연 프록시)로 연다. */
  openTab(
    user: StackUser,
    options?: { viewport?: { width: number; height: number }; origin?: string },
  ): Promise<{ context: BrowserContext; page: Page }>
  /** 이 판의 DB 에 질의한다(따로 붙은 연결). */
  query<Row extends Record<string, unknown> = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<Row[]>
  /** 행 하나를 `FOR UPDATE` 로 쥔다 — 그 행을 쓰는 요청이 서버에서 줄 선다. */
  holdRow(table: 'pages', id: string): Promise<RowHold>
  /**
   * 그 행에 `FOR UPDATE` 를 **보내기만 하고** 돌아온다 — 앞의 잠금이 쥐고 있으면 줄에 선다. 요청 둘 사이에 끼워 뒤 요청을 앞 요청이
   * 커밋한 뒤에도 붙잡아 두는 데 쓴다.
   */
  queueRow(table: 'pages', id: string): Promise<QueuedRowHold>
  /** 브라우저 → 웹 방향의 WS 연결(요청 줄에 `/ws`) 바이트만 `ms` 늦추는 프록시. 그 밖의 연결은 그대로 지난다. */
  startWsDelay(ms: number): Promise<{ origin: string; close(): Promise<void> }>
  /**
   * **서버 → 브라우저 방향**의 바이트만 `ms` 늦추는 프록시(순서는 지킨다). 첫 요청 줄이 `match`(기본: WS 연결 `GET …/ws`)에 맞는
   * 연결만 늦춘다 — 서로 다른 연결로 가는 두 메시지의 도착 순서(WS 프레임 대 REST 응답)를 뒤집는 자리다(`CLAUDE.md` «서로 다른 연결로
   * 가는 두 메시지의 도착 순서»). `delayed()` 는 지금까지 늦춘 덩어리 수 — 판이 섰는지의 카나리아다.
   */
  startDownDelay(ms: number, match?: RegExp): Promise<{ origin: string; delayed(): number; close(): Promise<void> }>
  /** 고른 연결만 끊는 프록시(`CutProxy`). */
  startCutProxy(): Promise<CutProxy>
  /** api 가 DB 에 닿는 길의 프록시 — `startEditorStack(…, { dbHalfCut: true })`일 때만 있다. */
  readonly dbHalfCut: DbHalfCut | null
  close(): Promise<Teardown>
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** 빈 포트 하나. 닫은 뒤 넘기므로 창이 있다 — 그 사이 다른 것이 잡으면 `--strictPort` · `listen` 이 던져 판이 선다. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address !== null ? address.port : 0
      server.close(() => resolve(port))
    })
  })
}

/** 그 포트에 붙을 수 있나 — 거절되면 LISTEN 이 없다. */
function listening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1')
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => resolve(false))
  })
}

/** 프로세스 그룹 `pgid` 에 산 프로세스 수. 좀비는 세지 않는다 — 거둘 차례만 남은 것이다. */
function groupSize(pgid: number): number {
  const out = spawnSync('ps', ['-A', '-o', 'pgid=,stat='], { encoding: 'utf8' })
  if (out.status !== 0) throw new Error(`ps 를 못 돌렸다: ${out.stderr}`)
  return out.stdout
    .split('\n')
    .map((line) => line.trim().split(/\s+/))
    .filter(([group, state]) => Number(group) === pgid && state !== undefined && !state.startsWith('Z')).length
}

/** 자식 환경 — 이 테스트 프로세스의 vitest · DB 값이 새지 않게 걷고 `extra` 를 얹는다. */
function childEnv(extra: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (/^(VITEST|TEST_|NODE_ENV$|DATABASE_URL$|POSTGRES_PORT$|PORT$|SESSION_COOKIE_NAME$|SEED_USER_)/.test(key)) continue
    env[key] = value
  }
  return { ...env, ...extra }
}

export interface Spawned {
  readonly child: ChildProcess
  /** 최근 출력 — 기동 실패를 말할 때 붙인다. */
  readonly output: () => string
}

const liveGroups = new Set<number>()
process.on('exit', () => {
  for (const pgid of liveGroups) {
    try {
      process.kill(-pgid, 'SIGKILL')
    } catch {
      // 이미 없다
    }
  }
})

/**
 * 자기 프로세스 그룹으로 띄운다(`detached`) — 거둘 때 손자(tsx 의 node · vite 의 esbuild)까지 그룹째 보낸다. 그룹의 머리는
 * `group-lifeline.mjs` 다 — 이 프로세스가 `SIGKILL` 로 사라지면 그룹째 끝낸다(머리말 «끝에 무엇을 재나»).
 */
export function spawnGroup(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): Spawned {
  const child = spawn(process.execPath, [LIFELINE, String(process.pid), command, ...args], {
    cwd,
    env,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (child.pid !== undefined) liveGroups.add(child.pid)
  let tail = ''
  const keep = (chunk: Buffer) => {
    tail = (tail + chunk.toString('utf8')).slice(-4000)
  }
  child.stdout?.on('data', keep)
  child.stderr?.on('data', keep)
  return { child, output: () => tail }
}

async function stopGroup(spawned: Spawned): Promise<void> {
  const pgid = spawned.child.pid
  if (pgid === undefined) return
  const signal = (name: NodeJS.Signals) => {
    try {
      process.kill(-pgid, name)
    } catch {
      // 그룹이 이미 없다
    }
  }
  signal('SIGTERM')
  for (let waited = 0; waited < 5000 && groupSize(pgid) > 0; waited += 100) await sleep(100)
  if (groupSize(pgid) > 0) signal('SIGKILL')
  for (let waited = 0; waited < 3000 && groupSize(pgid) > 0; waited += 100) await sleep(100)
  liveGroups.delete(pgid)
}

async function waitUntil(what: string, spawned: Spawned | undefined, check: () => Promise<boolean>, timeoutMs: number): Promise<void> {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    if (spawned !== undefined && spawned.child.exitCode !== null) {
      throw new Error(`${what}: 프로세스가 종료 ${spawned.child.exitCode} 로 끝났다\n${spawned.output()}`)
    }
    if (await check().catch(() => false)) return
    await sleep(100)
  }
  throw new Error(`${what}: ${timeoutMs}ms 안에 안 섰다\n${spawned?.output() ?? ''}`)
}

function cookieFrom(response: Response): string {
  const [first] = response.headers.getSetCookie()
  const pair = first?.split(';')[0] ?? ''
  if (!pair.includes('=')) throw new Error(`로그인 응답에 Set-Cookie 가 없다(${response.status})`)
  return pair
}

/**
 * 이 기계의 표 — DB 이름에 싣는다. 같은 DB 컨테이너를 **다른 pid 공간**(리눅스 컨테이너 안의 vitest)이 쓰면 그 실행의 pid 는 여기서
 * 늘 죽은 것으로 보인다 — 표가 다르면 pid 를 안 믿고 나이로 가른다.
 */
const HOST_TAG = createHash('sha256').update(hostname()).digest('hex').slice(0, 8)

/**
 * 표가 다른 기계의 DB 는 이만큼 지나야 지운다 — 판 하나가 도는 시간(수 분)보다 넉넉히 길다.
 */
export const STALE_BROWSER_DATABASE_MS = 60 * 60 * 1000

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // EPERM 은 남의 프로세스가 그 pid 로 살아 있다는 뜻이다.
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/**
 * 이 판이 만드는 DB 이름 — `wb_browser_<기계 표>_<pid>_<만든 때(초 · 36진)>_<무작위>`. 앞 판의 것을 거둘 때 이 셋으로 가른다
 * (`sweepStaleBrowserDatabases`).
 */
export function browserDatabaseName(options: { now?: number; pid?: number; host?: string } = {}): string {
  const made = Math.floor((options.now ?? Date.now()) / 1000).toString(36)
  return `wb_browser_${options.host ?? HOST_TAG}_${options.pid ?? process.pid}_${made}_${randomBytes(4).toString('hex')}`
}

/**
 * **앞 판이 남긴 `wb_browser_*` DB 를 지운다.** 이 기계의 것은 이름의 pid 가 죽었으면 곧바로, 다른 기계(표가 다르다)의 것은 만든 지
 * `STALE_BROWSER_DATABASE_MS` 가 지났으면. 표 · 만든 때가 없는 옛 이름(`wb_browser_<pid>_<무작위>`)은 이 기계의 것으로 본다. 이름 꼴이
 * 아닌 DB 는 안 본다.
 */
export async function sweepStaleBrowserDatabases(
  admin: pg.Client,
  options: { now?: number; alive?: (pid: number) => boolean } = {},
): Promise<{ dropped: string[]; kept: string[] }> {
  const now = options.now ?? Date.now()
  const alive = options.alive ?? pidAlive
  const names = (
    await admin.query<{ datname: string }>("select datname from pg_database where datname like 'wb\\_browser\\_%' order by datname")
  ).rows
  const dropped: string[] = []
  const kept: string[] = []
  for (const { datname } of names) {
    const parts = datname.slice('wb_browser_'.length).split('_')
    let stale: boolean
    if (parts.length === 2 && /^\d+$/.test(parts[0]!) && /^[0-9a-f]{8}$/.test(parts[1]!)) {
      stale = !alive(Number(parts[0]))
    } else if (parts.length === 4 && /^[0-9a-f]{8}$/.test(parts[0]!) && /^\d+$/.test(parts[1]!) && /^[0-9a-z]+$/.test(parts[2]!)) {
      stale = parts[0] === HOST_TAG ? !alive(Number(parts[1])) : now - parseInt(parts[2]!, 36) * 1000 >= STALE_BROWSER_DATABASE_MS
    } else {
      continue
    }
    if (!stale) {
      kept.push(datname)
      continue
    }
    await admin.query(`drop database if exists "${datname}" with (force)`)
    dropped.push(datname)
  }
  return { dropped, kept }
}

/**
 * 판을 세운다. **도중에 던지면 그때까지 띄운 것을 거두고 다시 던진다.**
 */
export async function startEditorStack(
  prerequisite: Extract<Prerequisite, { ok: true }>,
  options: { dbHalfCut?: boolean } = {},
): Promise<EditorStack> {
  const database = browserDatabaseName()
  const admin = new pg.Client({ connectionString: prerequisite.databaseUrl })
  await admin.connect()
  // 거두기가 실패해도 판은 세운다 — 남은 DB 는 판을 틀리게 하지 않고 자리만 먹는다. 실패는 말한다.
  const swept = await sweepStaleBrowserDatabases(admin).catch((error: unknown) => {
    // eslint-disable-next-line no-console
    console.log(`[에디터 실브라우저 판] 앞 판이 남긴 DB 를 거두지 못했다 — ${(error as Error).message}`)
    return undefined
  })
  if (swept !== undefined && swept.dropped.length > 0) {
    // eslint-disable-next-line no-console
    console.log(`[에디터 실브라우저 판] 앞 판이 남긴 DB ${swept.dropped.length}개를 지웠다 — ${swept.dropped.join(', ')}`)
  }
  const spawned: Spawned[] = []
  /** 띄운 프로세스 그룹 — 거둔 뒤에도 센다(`spawned` 는 거두며 빈다). */
  const groups: number[] = []
  const ports: number[] = []
  const closers: (() => Promise<void>)[] = []
  let db: pg.Client | undefined
  let browser: Browser | undefined
  let created = false
  /** 운영 번들 판이면 `vite build` 가 쓴 자리. */
  let builtWeb: string | undefined

  const census = async (): Promise<Census> => {
    const listeningPorts: number[] = []
    for (const port of ports) if (await listening(port)) listeningPorts.push(port)
    const left = await admin.query('select count(*)::int as n from pg_database where datname = $1', [database])
    return { processes: groups.reduce((sum, pgid) => sum + groupSize(pgid), 0), listeningPorts, databases: left.rows[0].n }
  }

  const teardown = async (): Promise<Teardown> => {
    const before = await census()
    try {
      for (const close of closers.splice(0).reverse()) await close().catch(() => {})
      await browser?.close().catch(() => {})
      await db?.end().catch(() => {})
      for (const one of spawned.splice(0).reverse()) await stopGroup(one)
      if (created) await admin.query(`drop database if exists "${database}" with (force)`)
      if (builtWeb !== undefined) rmSync(builtWeb, { recursive: true, force: true })
      return { before, after: await census() }
    } finally {
      await admin.end().catch(() => {})
    }
  }

  try {
    await admin.query(`create database "${database}"`)
    created = true
    const databaseUrl = withDatabase(prerequisite.databaseUrl, database)

    const users = {
      alice: { email: 'alice@browser.test', name: '앨리스', password: randomBytes(12).toString('hex') },
      bob: { email: 'bob@browser.test', name: '밥', password: randomBytes(12).toString('hex') },
    }
    for (const user of Object.values(users)) {
      const migrate = spawnSync(TSX, ['--conditions=development', 'src/db/migrate.ts', 'latest'], {
        cwd: API_DIR,
        env: childEnv({
          DATABASE_URL: databaseUrl,
          SEED_USER_EMAIL: user.email,
          SEED_USER_NAME: user.name,
          SEED_USER_PASSWORD: user.password,
        }),
        encoding: 'utf8',
        timeout: 60_000,
      })
      if (migrate.status !== 0) throw new Error(`migrate 종료 ${migrate.status}\n${migrate.stdout}\n${migrate.stderr}`)
    }

    // 옵션을 준 판만 api 를 DB 프록시 뒤에 둔다 — 다른 케이스 파일의 api 는 DB 에 곧장 붙는다.
    let dbHalfCut: DbHalfCut | null = null
    let apiDatabaseUrl = databaseUrl
    if (options.dbHalfCut === true) {
      const proxy = await startDbHalfCutProxy(databaseUrl)
      ports.push(proxy.port)
      closers.push(proxy.close)
      dbHalfCut = proxy
      const proxied = new URL(databaseUrl)
      proxied.hostname = '127.0.0.1'
      proxied.port = String(proxy.port)
      apiDatabaseUrl = proxied.toString()
    }

    const apiPort = await freePort()
    ports.push(apiPort)
    const apiUrl = `http://127.0.0.1:${apiPort}`
    const api = spawnGroup(
      TSX,
      ['--conditions=development', 'src/main.ts'],
      API_DIR,
      childEnv({
        NODE_ENV: 'development',
        HOST: '127.0.0.1',
        PORT: String(apiPort),
        DATABASE_URL: apiDatabaseUrl,
        SESSION_COOKIE_NAME: `wb_browser_${apiPort}`,
        LOG_LEVEL: 'warn',
      }),
    )
    spawned.push(api)
    if (api.child.pid !== undefined) groups.push(api.child.pid)
    await waitUntil('api 기동', api, async () => (await fetch(`${apiUrl}/health`)).ok, 60_000)

    const webPort = await freePort()
    ports.push(webPort)
    const webUrl = `http://127.0.0.1:${webPort}`
    const serve = ['--port', String(webPort), '--strictPort', '--host', '127.0.0.1']
    if (BUNDLE === 'build') {
      builtWeb = mkdtempSync(join(tmpdir(), 'wb-browser-web-'))
      const built = spawnSync(VITE, ['build', '--outDir', builtWeb, '--emptyOutDir'], {
        cwd: WEB_DIR,
        env: childEnv({ NODE_ENV: 'production' }),
        encoding: 'utf8',
        timeout: 180_000,
      })
      if (built.status !== 0) throw new Error(`vite build 종료 ${built.status}\n${built.stdout}\n${built.stderr}`)
    }
    const web = spawnGroup(
      VITE,
      BUNDLE === 'build' ? ['preview', '--outDir', builtWeb!, ...serve] : serve,
      WEB_DIR,
      childEnv({ NODE_ENV: BUNDLE === 'build' ? 'production' : 'development', PORT: String(apiPort) }),
    )
    spawned.push(web)
    if (web.child.pid !== undefined) groups.push(web.child.pid)
    await waitUntil('웹 기동', web, async () => (await fetch(`${webUrl}/`)).ok, 60_000)
    // 프록시가 이 api 로 가는지 — 옆 워크트리의 api 에 붙으면 로그인이 401 로 갈린다(`config/api-proxy-target.ts`).
    await waitUntil(
      '웹 → api 프록시',
      web,
      async () => {
        const response = await fetch(`${webUrl}/api/auth/login`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: users.alice.email, password: users.alice.password }),
        })
        return response.ok && cookieFrom(response).startsWith(`wb_browser_${apiPort}=`)
      },
      30_000,
    )

    db = new pg.Client({ connectionString: databaseUrl })
    await db.connect()
    browser = await chromium.launch({ executablePath: prerequisite.executablePath, headless: true })

    // vite 는 첫 요청에서 모듈을 변환한다 — 첫 케이스가 그 시간을 먹지 않게 한 번 불러 둔다.
    {
      const warm = await browser.newPage()
      await warm.goto(`${webUrl}/`, { waitUntil: 'networkidle' })
      await warm.close()
    }

    const stackDb = db
    const stackBrowser = browser
    const stack: EditorStack = {
      webUrl,
      apiUrl,
      users,
      browser: stackBrowser,
      async login(user) {
        const response = await fetch(`${apiUrl}/api/auth/login`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: user.email, password: user.password }),
        })
        if (!response.ok) throw new Error(`login ${response.status}`)
        return { cookie: cookieFrom(response) }
      },
      async request(session, method, path, body) {
        const response = await fetch(`${apiUrl}/api${path}`, {
          method,
          headers: { cookie: session.cookie, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
          body: body === undefined ? undefined : JSON.stringify(body),
        })
        const text = await response.text()
        let parsed: unknown = text
        try {
          parsed = JSON.parse(text)
        } catch {
          // 본문이 JSON 이 아니다
        }
        return { status: response.status, body: parsed }
      },
      async openTab(user, options = {}) {
        const origin = options.origin ?? webUrl
        const context = await stackBrowser.newContext({ baseURL: origin, viewport: options.viewport ?? { width: 1440, height: 900 } })
        const response = await context.request.post(`${origin}/api/auth/login`, { data: { email: user.email, password: user.password } })
        if (!response.ok()) throw new Error(`browser login ${response.status()}`)
        return { context, page: await context.newPage() }
      },
      async query(sql, params = []) {
        return (await stackDb.query(sql, params)).rows
      },
      async holdRow(table, id) {
        const holder = new pg.Client({ connectionString: databaseUrl })
        await holder.connect()
        await holder.query('begin')
        await holder.query(`select id from ${table} where id = $1 for update`, [id])
        const pid = (await holder.query('select pg_backend_pid() as pid')).rows[0].pid as number
        let released = false
        const release = async () => {
          if (released) return
          released = true
          await holder.query('commit').catch(() => {})
          await holder.end().catch(() => {})
        }
        closers.push(release)
        return {
          async waitForWaiters(count = 1, timeoutMs = 10_000) {
            await waitUntil(
              `행 ${id} 에 줄 선 요청 ${count}`,
              undefined,
              async () => (await chainedWaiters(stackDb, pid)) >= count,
              timeoutMs,
            )
          },
          release,
        }
      },
      async queueRow(table, id) {
        const holder = new pg.Client({ connectionString: databaseUrl })
        await holder.connect()
        await holder.query('begin')
        // 기다리는 동안 이 연결로는 아무것도 못 보낸다 — 잠금 질의를 보내고 결과를 붙든다(pg 는 질의를 차례로 보낸다).
        const acquired = holder.query(`select id from ${table} where id = $1 for update`, [id]).then(() => undefined)
        let released = false
        const release = async () => {
          if (released) return
          released = true
          await acquired.catch(() => {})
          await holder.query('commit').catch(() => {})
          await holder.end().catch(() => {})
        }
        closers.push(release)
        return { acquired, release }
      },
      async startWsDelay(ms) {
        const proxy = await startWsDelayProxy(webPort, ms)
        ports.push(proxy.port)
        closers.push(proxy.close)
        return { origin: `http://127.0.0.1:${proxy.port}`, close: proxy.close }
      },
      async startDownDelay(ms, match = WS_REQUEST_LINE) {
        const proxy = await startDownDelayProxy(webPort, ms, match)
        ports.push(proxy.port)
        closers.push(proxy.close)
        return { origin: `http://127.0.0.1:${proxy.port}`, delayed: proxy.delayed, close: proxy.close }
      },
      async startCutProxy() {
        const proxy = await startCutProxy(webPort)
        ports.push(proxy.port)
        closers.push(proxy.close)
        return { origin: `http://127.0.0.1:${proxy.port}`, blackhole: proxy.blackhole, reset: proxy.reset, close: proxy.close }
      },
      dbHalfCut,
      close: teardown,
    }
    return stack
  } catch (error) {
    const left = await teardown().catch(() => undefined)
    throw new Error(`판을 못 세웠다(거둔 뒤 남은 것: ${JSON.stringify(left)}): ${(error as Error).message}`)
  }
}

/** `DbHalfCut`의 프록시 — 위 타입의 머리말. 연결마다 무장 글자를 본 뒤의 `COMMIT`(단순 질의 `Q`)을 서버에 넘기고 api 쪽 소켓만 끊는다. */
function startDbHalfCutProxy(databaseUrl: string): Promise<DbHalfCut & { port: number; close(): Promise<void> }> {
  const upstream = new URL(databaseUrl)
  const upstreamPort = Number(upstream.port || 5432)
  const upstreamHost = upstream.hostname
  const sockets = new Set<net.Socket>()
  let fragment: string | null = null
  let fired = false
  const server = net.createServer((client) => {
    const up = net.connect(upstreamPort, upstreamHost)
    sockets.add(client)
    sockets.add(up)
    let sawFragment = false
    /** 쏘았다 — 서버 쪽 소켓은 `close()`까지 둔다. */
    let orphaned = false
    client.on('data', (chunk: Buffer) => {
      const text = chunk.toString('latin1').toLowerCase()
      if (fragment !== null && text.includes(fragment)) sawFragment = true
      if (fragment !== null && sawFragment && chunk[0] === 0x51 && text.slice(5).startsWith('commit')) {
        fragment = null
        fired = true
        orphaned = true
        up.write(chunk)
        client.destroy()
        return
      }
      up.write(chunk)
    })
    up.on('data', (chunk) => {
      if (!orphaned) client.write(chunk)
    })
    const end = (): void => {
      client.destroy()
      if (!orphaned) up.destroy()
    }
    client.on('error', end)
    client.on('close', end)
    up.on('error', () => client.destroy())
    up.on('close', () => client.destroy())
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address !== null ? address.port : 0
      resolve({
        port,
        arm(next) {
          fragment = next.toLowerCase()
          fired = false
        },
        get fired() {
          return fired
        },
        async close() {
          for (const socket of sockets) socket.destroy()
          await new Promise<void>((done) => server.close(() => done()))
        },
      })
    })
  })
}

/**
 * 브라우저 → 웹 방향에서 **WS 연결의 바이트만** 늦춘다(순서는 지킨다). 연결 하나의 첫 조각이 `GET …/ws` 요청 줄이면 WS 다 —
 * vite 의 HMR 소켓(`GET /?token=…`)은 안 걸린다.
 */
function startWsDelayProxy(targetPort: number, ms: number): Promise<{ port: number; close(): Promise<void> }> {
  const sockets = new Set<net.Socket>()
  const server = net.createServer((client) => {
    const upstream = net.connect(targetPort, '127.0.0.1')
    sockets.add(client)
    sockets.add(upstream)
    let isWs: boolean | null = null
    let due = 0
    client.on('data', (chunk) => {
      if (isWs === null) isWs = /^GET [^\r\n]*\/ws[ ?]/.test(chunk.toString('latin1'))
      if (!isWs) {
        upstream.write(chunk)
        return
      }
      const now = performance.now()
      due = Math.max(due, now + ms)
      setTimeout(() => {
        if (!upstream.destroyed) upstream.write(chunk)
      }, due - now)
    })
    upstream.on('data', (chunk) => client.write(chunk))
    const end = () => {
      client.destroy()
      upstream.destroy()
      sockets.delete(client)
      sockets.delete(upstream)
    }
    client.on('error', end)
    upstream.on('error', end)
    client.on('close', end)
    upstream.on('close', end)
  })
  let closed = false
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address !== null ? address.port : 0
      resolve({
        port,
        close: () => {
          if (closed) return Promise.resolve()
          closed = true
          for (const socket of sockets) socket.destroy()
          return new Promise((done) => server.close(() => done()))
        },
      })
    })
  })
}

/** WS 연결의 첫 요청 줄 — vite 의 HMR 소켓(`GET /?token=…`)은 안 맞는다. */
const WS_REQUEST_LINE = /^GET [^\r\n]*\/ws[ ?]/

/**
 * `EditorStack.startDownDelay` 의 몸통 — 브라우저 → 웹 은 그대로, 웹 → 브라우저 는 첫 요청 줄이 `match` 에 맞는 연결만 `ms` 늦춘다.
 * 덩어리마다 «앞 덩어리의 시각 이후 · 받은 때 + ms» 에 쓴다 — 순서가 안 뒤바뀐다.
 */
function startDownDelayProxy(
  targetPort: number,
  ms: number,
  match: RegExp,
): Promise<{ port: number; delayed(): number; close(): Promise<void> }> {
  const sockets = new Set<net.Socket>()
  let delayedChunks = 0
  const server = net.createServer((client) => {
    const upstream = net.connect(targetPort, '127.0.0.1')
    sockets.add(client)
    sockets.add(upstream)
    let slow: boolean | null = null
    let due = 0
    client.on('data', (chunk) => {
      if (slow === null) slow = match.test(chunk.toString('latin1'))
      upstream.write(chunk)
    })
    upstream.on('data', (chunk) => {
      if (!slow) {
        client.write(chunk)
        return
      }
      delayedChunks += 1
      const now = performance.now()
      due = Math.max(due, now + ms)
      setTimeout(() => {
        if (!client.destroyed) client.write(chunk)
      }, due - now)
    })
    const end = () => {
      client.destroy()
      upstream.destroy()
      sockets.delete(client)
      sockets.delete(upstream)
    }
    client.on('error', end)
    upstream.on('error', end)
    client.on('close', end)
    // 위쪽이 닫히면 늦춘 덩어리가 다 나간 뒤에 닫는다 — 곧바로 닫으면 뒤의 바이트를 잃는다.
    upstream.on('close', () => setTimeout(end, Math.max(0, due - performance.now())))
  })
  let closed = false
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      resolve({
        port: typeof address === 'object' && address !== null ? address.port : 0,
        delayed: () => delayedChunks,
        close: () => {
          if (closed) return Promise.resolve()
          closed = true
          for (const socket of sockets) socket.destroy()
          return new Promise((done) => server.close(() => done()))
        },
      })
    })
  })
}

/**
 * `rootPid` 가 쥔 잠금 뒤에 **사슬로** 줄 선 연결 수 — `rootPid` 를 기다리는 연결, 그 연결을 기다리는 연결 … 을 다 센다.
 */
async function chainedWaiters(db: pg.Client, rootPid: number): Promise<number> {
  const rows = (
    await db.query<{ pid: number; blockers: number[] }>(
      "select pid, pg_blocking_pids(pid) as blockers from pg_stat_activity where pid <> pg_backend_pid() and wait_event_type = 'Lock'",
    )
  ).rows
  const chain = new Set([rootPid])
  for (let grew = true; grew;) {
    grew = false
    for (const row of rows) {
      if (!chain.has(row.pid) && row.blockers.some((blocker) => chain.has(blocker))) {
        chain.add(row.pid)
        grew = true
      }
    }
  }
  return chain.size - 1
}

/** `CutProxy` 의 몸통 — 브라우저 → 웹 한 연결마다 위쪽 연결 하나. */
function startCutProxy(targetPort: number): Promise<{
  port: number
  blackhole(match: RegExp): number
  reset(match: RegExp): number
  close(): Promise<void>
}> {
  interface Link {
    readonly client: net.Socket
    readonly upstream: net.Socket
    line: string
    swallow: boolean
  }
  const links = new Set<Link>()
  const server = net.createServer((client) => {
    const link: Link = { client, upstream: net.connect(targetPort, '127.0.0.1'), line: '', swallow: false }
    links.add(link)
    client.on('data', (chunk) => {
      const request = /^(GET|POST|PATCH|PUT|DELETE|HEAD|OPTIONS) [^\r\n]*/.exec(chunk.toString('latin1'))
      if (request !== null) link.line = request[0]
      if (!link.swallow) link.upstream.write(chunk)
    })
    link.upstream.on('data', (chunk) => client.write(chunk))
    const end = () => {
      links.delete(link)
      client.destroy()
      link.upstream.destroy()
    }
    client.on('error', end)
    link.upstream.on('error', end)
    client.on('close', end)
    link.upstream.on('close', end)
  })
  const pick = (match: RegExp) => [...links].filter((link) => match.test(link.line))
  let closed = false
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      resolve({
        port: typeof address === 'object' && address !== null ? address.port : 0,
        blackhole(match) {
          const picked = pick(match)
          for (const link of picked) link.swallow = true
          return picked.length
        },
        reset(match) {
          const picked = pick(match)
          for (const link of picked) {
            links.delete(link)
            link.client.resetAndDestroy()
            link.upstream.destroy()
          }
          return picked.length
        },
        close() {
          if (closed) return Promise.resolve()
          closed = true
          for (const link of links) {
            link.client.destroy()
            link.upstream.destroy()
          }
          return new Promise((done) => server.close(() => done()))
        },
      })
    })
  })
}

/**
 * 조건이 설 때까지 100ms 마다 묻는다 — 고정 시간을 기다리지 않는다. 안 서면 `describe()` 가 낸 마지막 상태를 붙여 던진다.
 */
export async function poll<T>(what: string, read: () => Promise<T>, done: (value: T) => boolean, timeoutMs = 10_000): Promise<T> {
  const until = Date.now() + timeoutMs
  let last: T | undefined
  while (Date.now() < until) {
    last = await read()
    if (done(last)) return last
    await sleep(100)
  }
  throw new Error(`${what}: ${timeoutMs}ms 안에 안 섰다 — 마지막 값 ${JSON.stringify(last)}`)
}

/**
 * 스냅샷 복원 요청의 주소(`POST /api/projects/:id/snapshots/:id/restore`)인가.
 *
 * 부분 글자(`includes('/restore')`)로 가르면 dev 서버가 내는 소스 모듈(`/src/…/restore-….ts`)의 응답이 복원 답으로 센다 —
 * `apps/web/src` 에 `restore` 가 든 새 파일이 늘 때마다 가짜 요청이 끼어 순서 단언이 죽는다.
 */
export function isRestoreUrl(url: string): boolean {
  return /\/api\/projects\/[^/]+\/snapshots\/[^/]+\/restore(?:[?#]|$)/.test(url)
}

/** `delayServerFrames` 가 돌려주는 것 — 늦춘 프레임 수(판이 섰는지의 카나리아)와 이 탭이 서버로 보낸 프레임의 종류 차례. */
export interface FrameDelay {
  /** 지금까지 늦춘 프레임 수. 0 이면 늦출 프레임이 안 와 판이 안 선 것이다. */
  delayed(): number
  /** 이 탭이 서버로 보낸 프레임의 `type` 차례(`patch` · `lock` …). */
  sent(): string[]
  /**
   * **페이지에 건넨** 프레임의 `type` 과 시각(`Date.now()`) 차례 — 늦춘 것은 늦춘 뒤의 시각이다. `page.on('websocket')` 의 `framereceived` 는
   * 가로챈 소켓에서는 서버에서 **온** 시각이라 늦춤이 안 보인다.
   */
  delivered(): { type: string; at: number }[]
}

/**
 * **서버 → 브라우저 프레임 가운데 `kinds` 의 `type` 인 것만** `ms` 늦춘다 — 나머지 프레임은 그대로 지나, 늦춘 프레임이 뒤따르는 프레임에
 * 추월당한다. `startDownDelay` 는 같은 연결의 바이트를 전부 늦춰 두 프레임의 **차례**를 못 뒤집는다(`patch-ack` 와 `membership-changed` 가
 * 1 ~ 28ms 로 붙어 와 «ack 뒤에 강등» 이 늘 그 차례다). 늦춘 프레임은 늦추는 동안 새 프레임이 와도 제 시각에 나간다.
 *
 * `page.goto` **앞에** 건다 — 소켓은 페이지가 열릴 때 붙는다. 이 탭의 `/ws` 연결에만 닿는다(다른 탭 · vite HMR 소켓은 그대로).
 */
export async function delayServerFrames(page: Page, kinds: readonly string[], ms: number): Promise<FrameDelay> {
  let delayedFrames = 0
  const sent: string[] = []
  const delivered: { type: string; at: number }[] = []
  const typeOf = (message: string | Buffer): string => {
    try {
      const frame = JSON.parse(typeof message === 'string' ? message : message.toString()) as { type?: unknown }
      return typeof frame.type === 'string' ? frame.type : ''
    } catch {
      return ''
    }
  }
  await page.routeWebSocket(/\/ws(?:[?#]|$)/, (route) => {
    const server = route.connectToServer()
    route.onMessage((message) => {
      sent.push(typeOf(message))
      server.send(message)
    })
    server.onMessage((message) => {
      const type = typeOf(message)
      if (!kinds.includes(type)) {
        delivered.push({ type, at: Date.now() })
        route.send(message)
        return
      }
      delayedFrames += 1
      setTimeout(() => {
        try {
          delivered.push({ type, at: Date.now() })
          route.send(message)
        } catch {
          // 탭이 닫힌 뒤에 닿은 늦은 프레임이다.
        }
      }, ms)
    })
  })
  return { delayed: () => delayedFrames, sent: () => sent.slice(), delivered: () => delivered.slice() }
}

/**
 * **캔버스 문서가 그려지는 iframe**(`src/canvas/canvas-iframe.tsx`). 문서의 글자 · 노드는 여기 안에 있다 — 호스트의
 * `.wb-shell-canvas-frame` 의 `innerText` · `hasText` 는 iframe 안의 글자를 담지 않는다. 선택 외곽선 · 번호 마커 · 배너는
 * 호스트 문서 그대로다.
 */
export function canvasFrame(page: Page): FrameLocator {
  return page.frameLocator('iframe.wb-shell-canvas-iframe')
}

/** 캔버스 문서의 글자(`body.innerText`). iframe 이 없으면(페이지 없음 · 불러오는 중 · 실패) 빈 문자열이다. */
export async function canvasText(page: Page): Promise<string> {
  const handle = await page.$('iframe.wb-shell-canvas-iframe')
  const frame = await handle?.contentFrame()
  if (frame === null || frame === undefined) return ''
  return frame.evaluate(() => document.body.innerText)
}

/** 지금 보인 놓을 자리 하나(`shownDrops`). */
export interface ShownDrop {
  /** 트리의 선 · 강조(`.wb-shell-drop-indicator`)인가, 캔버스의 배치 미리보기인가. */
  kind: 'line' | 'preview'
  placement: string | null
  axis: string | null
  /** 호스트 창 좌표 — 선이면 그 선 · 강조, 미리보기면 끼운 미리보기 노드의 상자. */
  rect: { x: number; y: number; width: number; height: number }
  /** 미리보기가 선 자리 — `부모 id@노드 차례`(미리보기 자신을 센 차례). 선이면 `null`. */
  at: string | null
  /** 미리보기의 부모 · 바로 앞 · 바로 뒤 노드 id(옮기는 원본 — 미리보기 id 의 머리를 뗀 id — 은 건너뛴다). 선이면 셋 다 `null`. */
  parent: string | null
  prev: string | null
  next: string | null
}

/**
 * **지금 보인 놓을 자리** — 끌기 중 사람이 보는 것. 트리 위의 자리는 선 · 강조(`.wb-shell-drop-indicator` — 겹의 창 좌표)로, 캔버스 위의
 * 자리는 캔버스 문서에 끼운 배치 미리보기(`src/canvas/canvas-preview.ts` — 캔버스 표면의 `data-wb-preview` · `data-wb-preview-axis` 와
 * 미리보기 노드)로 선다. 기다리지 않고 읽는다(없으면 `[]` 가 값이다).
 */
export async function shownDrops(page: Page): Promise<ShownDrop[]> {
  return page.evaluate(() => {
    const out: ShownDrop[] = []
    for (const el of Array.from(document.querySelectorAll('.wb-shell-drop-indicator'))) {
      const r = el.getBoundingClientRect()
      out.push({
        kind: 'line',
        placement: el.getAttribute('data-placement'),
        axis: el.getAttribute('data-axis'),
        rect: { x: r.x, y: r.y, width: r.width, height: r.height },
        at: null,
        parent: null,
        prev: null,
        next: null,
      })
    }
    const surface = document.querySelector('.wb-shell-canvas-surface')
    const placement = surface?.getAttribute('data-wb-preview') ?? null
    const iframe = document.querySelector('iframe.wb-shell-canvas-iframe') as HTMLIFrameElement | null
    const doc = iframe?.contentDocument ?? null
    if (placement !== null && iframe !== null && doc !== null) {
      const isPreview = (el: Element | null) => (el?.getAttribute('data-wb-id') ?? '').startsWith('wb:preview:')
      const nodeOf = (el: Element | null): Element | null => el?.parentElement?.closest('[data-wb-id]') ?? null
      const root = Array.from(doc.querySelectorAll('[data-wb-id]')).find((el) => isPreview(el) && !isPreview(nodeOf(el))) ?? null
      if (root !== null) {
        const parent = nodeOf(root)
        const siblings = parent === null ? [] : Array.from(parent.querySelectorAll('[data-wb-id]')).filter((el) => nodeOf(el) === parent)
        const f = iframe.getBoundingClientRect()
        const r = root.getBoundingClientRect()
        const zoom = f.width / iframe.offsetWidth
        const original = (root.getAttribute('data-wb-id') ?? '').slice('wb:preview:'.length)
        const others = siblings.filter((el) => el.getAttribute('data-wb-id') !== original)
        const at = others.indexOf(root)
        out.push({
          kind: 'preview',
          placement,
          axis: surface?.getAttribute('data-wb-preview-axis') ?? null,
          rect: { x: f.x + r.x * zoom, y: f.y + r.y * zoom, width: r.width * zoom, height: r.height * zoom },
          at: `${parent?.getAttribute('data-wb-id') ?? '?'}@${siblings.indexOf(root)}`,
          parent: parent?.getAttribute('data-wb-id') ?? null,
          prev: others[at - 1]?.getAttribute('data-wb-id') ?? null,
          next: others[at + 1]?.getAttribute('data-wb-id') ?? null,
        })
      }
    }
    return out
  })
}
