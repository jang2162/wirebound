/**
 * **배포 compose(뿌리 `compose.yaml`)와 입구 설정(`docker/web/Caddyfile`)의 값이 api 의 값과 맞물리는가** — 이미지를 짓거나 띄우지 않는다.
 *
 * 이미지 빌드 · 기동은 게이트에 안 넣는다(시간과 크기는 `docs/guides/deploy-docker.md` 「잰 값」, 손 절차는 같은 문서 「다시 재는
 * 법」). 여기서 재는 것은 **그 절차가 잰 값이 서로 어긋나면 조용히 무너지는 자리**와 **앱만 올린다는 구성의 기본값**이다:
 *
 * | 무엇 | 어긋나면 |
 * |---|---|
 * | api `stop_grace_period` > api 의 종료 한도(`SHUTDOWN_GRACE_MS`) | 그리던 pptx 를 끝까지 답하기 전에 SIGKILL 이다 |
 * | 입구의 `grace_period` < web `stop_grace_period` | 입구가 도는 응답을 넘기기 전에 SIGKILL 이다 |
 * | api 의 `TRUST_PROXY` = 입구의 고정 주소 | 모든 요청이 입구 하나의 주소로 세어 로그인 제한이 서버 전체에 한 벌로 걸린다 |
 * | 입구 주소가 대역 안 · 다른 컨테이너가 받는 범위(`ip_range`) 밖 | 먼저 뜬 컨테이너가 그 주소를 가져가 입구가 «Address already in use» 로 안 뜬다 |
 * | 바깥 포트는 입구의 HTTP 하나 | Postgres · api 가 바깥에 열리거나, 걷은 443 이 남는다 |
 * | 입구가 TLS 를 끝내지 않는다 | 각자의 프록시가 맡을 인증서 발급이 입구에서 돌고 그 볼륨이 남는다 |
 * | 입구가 믿는 앞단의 기본값은 «아무도» · 고른 클라이언트 주소 하나로 새로 적는다 | 클라이언트가 지어 적은 `X-Forwarded-For` 가 api 에 닿는다 |
 * | 배포 값(`WIREBOUND_DEPLOY`)이 없는 자리의 `down` 이 멈춘다 | 아무 체크아웃 뿌리의 맨 `docker compose down -v` 가 그 기계의 운영 볼륨을 지운다 |
 *
 * **값으로 잰다** — compose 는 `docker compose config`(보간 · 기본값을 푼 값), Caddyfile 은 그 이미지의 `caddy adapt`(Caddy 가 읽은
 * JSON)를 읽는다. 글자로 읽으면 주석에 남긴 옛 줄 · 같은 뜻의 다른 꼴이 자를 속인다.
 *
 * **`docker compose` 가 없으면 건너뛴다** — 경로가 아니라 `docker compose version` 을 실제로 돌려 본다. compose 가 돌면 `config` 와
 * Caddy 이미지(없으면 받는다)도 돌아야 한다 — 그것이 실패하면 건너뛰지 않고 죽는다.
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { BlockList } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SHUTDOWN_GRACE_MS } from '../src/shutdown'

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))

interface ComposeService {
  stop_grace_period?: string
  ports?: { target: number; published?: string; protocol?: string; host_ip?: string }[]
  volumes?: unknown[]
  environment?: Record<string, string>
  networks?: Record<string, { ipv4_address?: string } | null>
}
interface ComposeConfig {
  name: string
  services: Record<string, ComposeService>
  networks: Record<string, { ipam?: { config?: { subnet?: string; ip_range?: string }[] } }>
  volumes?: Record<string, { name?: string }>
}

/** `docker compose` 가 이 기계에서 도는가 — 안 돌면 건너뛴다. */
const docker = spawnSync('docker', ['compose', 'version'], { encoding: 'utf8' })
const skip = docker.error !== undefined || docker.status !== 0
if (skip) {
  // eslint-disable-next-line no-console
  console.log(`[배포 compose] 건너뛴다 — docker compose 가 안 돈다: ${docker.error?.message ?? docker.stderr.trim()}`)
}

/**
 * 배포 compose 를 뿌리 `.env` 없이 푼다 — 필수 값만 채운 `.env` 를 임시 디렉터리에 두고 compose 파일을 옮겨 부른다. **docker 가 도는데
 * `config` 가 실패하면 던진다** — 건너뛰면 고장 난 compose 가 «건너뜀» 으로 지나간다.
 */
function resolvedConfig(): ComposeConfig {
  const dir = mkdtempSync(join(tmpdir(), 'wb-deploy-compose-'))
  try {
    copyFileSync(join(ROOT, 'compose.yaml'), join(dir, 'compose.yaml'))
    writeFileSync(join(dir, '.env'), 'WIREBOUND_DEPLOY=1\nPOSTGRES_PASSWORD=probe\n')
    const run = spawnSync('docker', ['compose', '-f', join(dir, 'compose.yaml'), 'config', '--format', 'json'], { encoding: 'utf8' })
    if (run.error !== undefined || run.status !== 0)
      throw new Error(`docker compose config 이 실패한다: ${run.error?.message ?? run.stderr.trim()}`)
    return JSON.parse(run.stdout) as ComposeConfig
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** web 이미지가 쓰는 Caddy 판 — `Dockerfile` 의 `ARG CADDY_IMAGE` 하나에서 읽는다. */
function caddyImage(): string {
  const args = [...readFileSync(join(ROOT, 'Dockerfile'), 'utf8').matchAll(/^ARG CADDY_IMAGE=(\S+)$/gm)]
  expect(args).toHaveLength(1)
  return args[0]![1]!
}

interface CaddyHandler {
  handler: string
  routes?: { handle: CaddyHandler[] }[]
  headers?: { request?: { set?: Record<string, string[]> } }
  transport?: { keep_alive?: { idle_timeout?: number } }
  upstreams?: { dial: string }[]
}
interface CaddyJson {
  apps: {
    tls?: unknown
    http: {
      grace_period?: number
      servers: Record<
        string,
        {
          listen: string[]
          trusted_proxies?: { source: string; ranges?: string[] }
          trusted_proxies_strict?: number
          automatic_https?: unknown
          tls_connection_policies?: unknown
          routes: { match?: { path?: string[] }[]; handle: CaddyHandler[] }[]
        }
      >
    }
  }
}

/** 입구의 Caddyfile 을 그 이미지의 Caddy 가 읽은 값 — `TRUSTED_PROXIES` 를 compose 가 넘길 값으로 준다. */
function adaptedCaddyfile(trustedProxies: string): CaddyJson {
  const run = spawnSync(
    'docker',
    [
      'run',
      '--rm',
      '-i',
      '-e',
      `TRUSTED_PROXIES=${trustedProxies}`,
      caddyImage(),
      'sh',
      '-c',
      'cat > /tmp/Caddyfile && caddy adapt --config /tmp/Caddyfile',
    ],
    { encoding: 'utf8', input: readFileSync(join(ROOT, 'docker/web/Caddyfile'), 'utf8') },
  )
  if (run.error !== undefined || run.status !== 0) throw new Error(`caddy adapt 이 안 돈다: ${run.error?.message ?? run.stderr}`)
  return JSON.parse(run.stdout) as CaddyJson
}

/** `/api/*` 를 받는 경로의 reverse_proxy 처리기. 하나뿐인지 센다. */
function apiProxy(caddy: CaddyJson): CaddyHandler {
  const servers = Object.values(caddy.apps.http.servers)
  expect(servers).toHaveLength(1)
  const routes = servers[0]!.routes.filter((route) => route.match?.some((m) => m.path?.includes('/api/*')))
  expect(routes).toHaveLength(1)
  const proxies = routes[0]!.handle
    .flatMap((h) => h.routes ?? [])
    .flatMap((r) => r.handle)
    .filter((h) => h.handler === 'reverse_proxy')
  expect(proxies).toHaveLength(1)
  return proxies[0]!
}

/** compose 의 기간 글자(`40s`)를 ms 로. 초 단위 말고는 받지 않는다 — 다른 꼴이 오면 이 자를 고친다. */
function seconds(value: string | undefined): number {
  const match = /^(\d+)s$/.exec(value ?? '')
  if (match === null) throw new Error(`초 단위 기간이 아니다: ${value}`)
  return Number(match[1]) * 1000
}

describe.skipIf(skip)('배포 compose 의 값', () => {
  const c = skip ? (undefined as unknown as ComposeConfig) : resolvedConfig()
  const caddy = skip ? undefined : adaptedCaddyfile('')
  const server = () => Object.values(caddy!.apps.http.servers)[0]!

  it('프로젝트 이름 · 운영 볼륨 이름이 고정이다 — 이미 올린 서버가 같은 DB 를 잇는다', () => {
    expect(c.name).toBe('wirebound-prod')
    expect(c.volumes?.pgdata?.name).toBe('wirebound-prod_pgdata')
  })

  it('api 를 끄는 쪽의 한도가 api 의 종료 한도보다 길다', () => {
    expect(seconds(c.services.api?.stop_grace_period)).toBeGreaterThan(SHUTDOWN_GRACE_MS)
  })

  it('입구의 grace_period 가 api 의 종료 한도보다 길고 web 을 끄는 쪽의 한도보다 짧다', () => {
    const grace = (caddy!.apps.http.grace_period ?? 0) / 1e6
    expect(grace).toBeGreaterThan(SHUTDOWN_GRACE_MS)
    expect(grace).toBeLessThan(seconds(c.services.web?.stop_grace_period))
  })

  it('api 가 믿는 앞단은 web 의 고정 주소이고, 그 주소는 대역 안 · 다른 컨테이너가 받는 범위 밖이다', () => {
    const edge = c.services.web?.networks?.backend?.ipv4_address
    expect(edge).toMatch(/^\d+\.\d+\.\d+\.\d+$/)
    expect(c.services.api?.environment?.TRUST_PROXY).toBe(edge)
    const ipam = c.networks.backend?.ipam?.config?.[0]
    // 범위가 없으면 도커가 대역 전체에서 나눠 준다 — 그것이 «Address already in use» 판이다.
    expect([typeof ipam?.subnet, typeof ipam?.ip_range]).toEqual(['string', 'string'])
    const within = (cidr: string | undefined) => {
      const [address, prefix] = (cidr ?? '').split('/')
      const list = new BlockList()
      list.addSubnet(address!, Number(prefix))
      return list.check(edge!)
    }
    expect([within(ipam?.subnet), within(ipam?.ip_range)]).toEqual([true, false])
  })

  it('바깥 포트는 입구의 HTTP 하나다 — 기본 8080 이 입구의 80 으로', () => {
    const published = Object.entries(c.services).flatMap(([name, service]) =>
      (service.ports ?? []).map((port) => `${name} ${port.host_ip ?? ''}:${port.published}->${port.target}/${port.protocol ?? 'tcp'}`),
    )
    expect(published).toEqual(['web :8080->80/tcp'])
  })

  it('입구가 TLS 를 끝내지 않는다 — HTTP 80 하나만 듣고 인증서 앱 · 볼륨이 없다', () => {
    expect(caddy!.apps.tls).toBeUndefined()
    expect(server().listen).toEqual([':80'])
    expect(server().tls_connection_policies).toBeUndefined()
    expect(c.services.web?.volumes ?? []).toEqual([])
    expect(Object.keys(c.volumes ?? {})).toEqual(['pgdata'])
  })

  it('입구가 믿는 앞단의 기본값은 «아무도» 다 — 값을 주면 그 범위만 믿는다', () => {
    expect(c.services.web?.environment?.TRUSTED_PROXIES).toBe('')
    expect(server().trusted_proxies).toEqual({ source: 'static' })
    const given = Object.values(adaptedCaddyfile('10.9.0.0/16 172.30.0.5').apps.http.servers)[0]!
    expect(given.trusted_proxies).toEqual({ source: 'static', ranges: ['10.9.0.0/16', '172.30.0.5'] })
  })

  it('클라이언트 주소는 오른쪽부터 고르고, api 에는 그 주소 하나로 새로 적어 넘긴다', () => {
    // 왼쪽 끝(기본)은 클라이언트가 지어 적은 값이다 — 믿는 앞단이 이어 붙인 오른쪽부터 읽어야 한다.
    expect(server().trusted_proxies_strict).toBe(1)
    const proxy = apiProxy(caddy!)
    expect(proxy.headers?.request?.set?.['X-Forwarded-For']).toEqual(['{http.vars.client_ip}'])
    expect(proxy.upstreams).toEqual([{ dial: 'api:3001' }])
  })

  it('입구는 `/api/*` 와 `/health` 를 api 로 넘긴다 — `/health` 는 앞의 프록시가 입구 너머 api 의 생사를 묻는 자리다', () => {
    const routes = server().routes.filter((route) =>
      route.handle.flatMap((h) => h.routes ?? []).some((r) => r.handle.some((h) => h.handler === 'reverse_proxy')),
    )
    expect(routes.flatMap((route) => route.match ?? []).flatMap((m) => m.path ?? [])).toEqual(['/api/*', '/health'])
  })

  it('입구가 쥐는 상류 keep-alive 가 api 의 keepAliveTimeout(72s)보다 짧다', () => {
    const idle = apiProxy(caddy!).transport?.keep_alive?.idle_timeout ?? Number.POSITIVE_INFINITY
    expect(idle / 1e9).toBeLessThan(72)
  })

  it('배포 값이 없는 자리에서는 `down -v` 도 멈춘다 — 셸에 `POSTGRES_PASSWORD` 가 있어도', () => {
    // 프로젝트 이름은 파일의 `name` 에서 와야 한다 — `-p` · `COMPOSE_PROJECT_NAME` 을 주면 compose 의 `down` 은 파일을 못 풀어도 그 이름의
    // 라벨로 내린다(그 판은 그 이름만 닿는다). 이 케이스는 운영 이름을 시험용 이름으로 바꾼 사본을 `--dry-run` 으로 친다 — 가드를 뗀
    // 변조에서도 아무것도 안 지운다.
    const dir = mkdtempSync(join(tmpdir(), 'wb-deploy-guard-'))
    try {
      const source = readFileSync(join(ROOT, 'compose.yaml'), 'utf8')
      expect(source.match(/^name: wirebound-prod$/gm)).toHaveLength(1)
      writeFileSync(join(dir, 'compose.yaml'), source.replace(/^name: wirebound-prod$/m, 'name: wb-deploy-guard-probe'))
      const env: NodeJS.ProcessEnv = { ...process.env, POSTGRES_PASSWORD: 'probe' }
      delete env.WIREBOUND_DEPLOY
      delete env.COMPOSE_PROJECT_NAME
      const run = spawnSync('docker', ['compose', '-f', join(dir, 'compose.yaml'), '--dry-run', 'down', '-v'], { encoding: 'utf8', env })
      expect([run.status, /WIREBOUND_DEPLOY/.test(run.stderr)]).toEqual([1, true])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('시딩 비밀번호는 api 의 환경에 안 남는다', () => {
    expect(c.services.api?.environment?.SEED_USER_PASSWORD).toBe('')
  })
})
