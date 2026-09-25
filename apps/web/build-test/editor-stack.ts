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
 * | 웹 | `vite --port <빈 포트> --strictPort` · 셸 `PORT` 로 프록시 대상을 준다 | 셸이 `apps/api/.env` 를 이긴다(`config/api-proxy-target.ts`) |
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
 * # 이 판이 못 재는 것
 *
 * - **운영 번들.** vite dev 로 띄운다 — 모듈이 쪼개져 오고 React 개발 판이다. 타이밍이 운영과 다를 수 있다.
 * - **망 지연.** 모두 루프백이다 — 두 연결의 지연 차가 0 이라 도착 순서가 늘 보내는 순서다. 겨룸을 재는 케이스는 `startWsDelay`
 *   로 한쪽 연결만 늦춘다.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { lstatSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import net from 'node:net'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'
import pg from 'pg'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core'

const API_DIR = fileURLToPath(new URL('../../api/', import.meta.url))
const WEB_DIR = fileURLToPath(new URL('../', import.meta.url))
const TSX = `${API_DIR}node_modules/.bin/tsx`
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

export type Prerequisite =
  | { ok: true; executablePath: string | undefined; databaseUrl: string }
  | { ok: false; reason: string }

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
      reason: `브라우저를 띄우지 못했다 — ${chromeCandidates().map((path) => path ?? 'playwright-core 캐시').join(' · ')}(README 「넣는 법」 절)`,
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
  /** 이 행을 기다리는 다른 연결이 `count` 개가 될 때까지 기다린다 — 안 서면 던진다. 요청이 정말 줄 섰는지의 카나리아다. */
  waitForWaiters(count?: number, timeoutMs?: number): Promise<void>
  release(): Promise<void>
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
  openTab(user: StackUser, options?: { viewport?: { width: number; height: number }; origin?: string }): Promise<{ context: BrowserContext; page: Page }>
  /** 이 판의 DB 에 질의한다(따로 붙은 연결). */
  query<Row extends Record<string, unknown> = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<Row[]>
  /** 행 하나를 `FOR UPDATE` 로 쥔다 — 그 행을 쓰는 요청이 서버에서 줄 선다. */
  holdRow(table: 'pages', id: string): Promise<RowHold>
  /** 브라우저 → 웹 방향의 WS 연결(요청 줄에 `/ws`) 바이트만 `ms` 늦추는 프록시. 그 밖의 연결은 그대로 지난다. */
  startWsDelay(ms: number): Promise<{ origin: string; close(): Promise<void> }>
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

interface Spawned {
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

/** 자기 프로세스 그룹으로 띄운다(`detached`) — 거둘 때 손자(tsx 의 node · vite 의 esbuild)까지 그룹째 보낸다. */
function spawnGroup(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): Spawned {
  const child = spawn(command, args, { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
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
 * 판을 세운다. **도중에 던지면 그때까지 띄운 것을 거두고 다시 던진다.**
 */
export async function startEditorStack(prerequisite: Extract<Prerequisite, { ok: true }>): Promise<EditorStack> {
  const database = `wb_browser_${process.pid}_${randomBytes(4).toString('hex')}`
  const admin = new pg.Client({ connectionString: prerequisite.databaseUrl })
  await admin.connect()
  const spawned: Spawned[] = []
  /** 띄운 프로세스 그룹 — 거둔 뒤에도 센다(`spawned` 는 거두며 빈다). */
  const groups: number[] = []
  const ports: number[] = []
  const closers: (() => Promise<void>)[] = []
  let db: pg.Client | undefined
  let browser: Browser | undefined
  let created = false

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
        DATABASE_URL: databaseUrl,
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
    const web = spawnGroup(
      VITE,
      ['--port', String(webPort), '--strictPort', '--host', '127.0.0.1'],
      WEB_DIR,
      childEnv({ NODE_ENV: 'development', PORT: String(apiPort) }),
    )
    spawned.push(web)
    if (web.child.pid !== undefined) groups.push(web.child.pid)
    await waitUntil('웹 기동', web, async () => (await fetch(`${webUrl}/`)).ok, 60_000)
    // 프록시가 이 api 로 가는지 — 옆 워크트리의 api 에 붙으면 로그인이 401 로 갈린다(`config/api-proxy-target.ts`).
    await waitUntil('웹 → api 프록시', web, async () => {
      const response = await fetch(`${webUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: users.alice.email, password: users.alice.password }),
      })
      return response.ok && cookieFrom(response).startsWith(`wb_browser_${apiPort}=`)
    }, 30_000)

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
            // 쥔 백엔드를 기다리는 연결을 센다 — DB 전체의 대기자를 세면 다른 행의 줄까지 읽는다.
            await waitUntil(`행 ${id} 에 줄 선 요청 ${count}`, undefined, async () => {
              const rows = await stackDb.query(
                'select count(*)::int as n from pg_stat_activity where pid <> pg_backend_pid() and $1 = any(pg_blocking_pids(pid))',
                [pid],
              )
              return rows.rows[0].n >= count
            }, timeoutMs)
          },
          release,
        }
      },
      async startWsDelay(ms) {
        const proxy = await startWsDelayProxy(webPort, ms)
        ports.push(proxy.port)
        closers.push(proxy.close)
        return { origin: `http://127.0.0.1:${proxy.port}`, close: proxy.close }
      },
      close: teardown,
    }
    return stack
  } catch (error) {
    const left = await teardown().catch(() => undefined)
    throw new Error(`판을 못 세웠다(거둔 뒤 남은 것: ${JSON.stringify(left)}): ${(error as Error).message}`)
  }
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
