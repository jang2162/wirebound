/**
 * **운영 compose(`deploy/docker-compose.yml`)의 값이 api 의 값과 맞물리는가** — 이미지를 짓거나 띄우지 않는다.
 *
 * 이미지 빌드 · 기동은 게이트에 안 넣는다(빌드 2분 안팎 · api 이미지 1.8GB — 최상위 README 「배포하려면」의 «다시 재는 법»이 손
 * 절차다). 여기서 재는 것은 **그 절차가 잰 값이 서로 어긋나면 조용히 무너지는 자리**다:
 *
 * | 무엇 | 어긋나면 |
 * |---|---|
 * | api `stop_grace_period` > api 의 종료 한도(`SHUTDOWN_GRACE_MS`) | 그리던 pptx 를 끝까지 답하기 전에 SIGKILL 이다 |
 * | 앞단의 `grace_period`(Caddyfile) < web `stop_grace_period` | 앞단이 도는 응답을 넘기기 전에 SIGKILL 이다 |
 * | api 의 `TRUST_PROXY` = 앞단의 고정 주소 | 모든 요청이 앞단 하나의 주소로 세어 로그인 제한이 서버 전체에 한 벌로 걸린다 |
 * | 앞단 주소가 대역 안 · 다른 컨테이너가 받는 범위(`ip_range`) 밖 | 먼저 뜬 컨테이너가 그 주소를 가져가 앞단이 «Address already in use» 로 안 뜬다 |
 * | 바깥 포트는 앞단만 | Postgres · api 가 바깥에 열린다 |
 *
 * **값으로 잰다** — 글자가 아니라 `docker compose config`(보간 · 기본값을 푼 값)를 읽는다. 앞단의 `grace_period`만 Caddyfile 의
 * 글자로 읽는다(Caddy 를 부르지 않으려고) — 그 줄이 하나인지 먼저 센다.
 *
 * **`docker compose` 가 없으면 건너뛴다** — 경로가 아니라 `docker compose config` 를 실제로 돌려 본다.
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { BlockList } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SHUTDOWN_GRACE_MS } from '../src/shutdown'

const DEPLOY = fileURLToPath(new URL('../../../deploy/', import.meta.url))

interface ComposeService {
  stop_grace_period?: string
  ports?: unknown[]
  environment?: Record<string, string>
  networks?: Record<string, { ipv4_address?: string } | null>
}
interface ComposeConfig {
  services: Record<string, ComposeService>
  networks: Record<string, { ipam?: { config?: { subnet?: string; ip_range?: string }[] } }>
}

/** 운영 compose 를 `.env` 없이 푼다 — 필수 값 둘만 채운 `.env` 를 임시 디렉터리에 두고 compose 파일을 옮겨 부른다. */
function resolvedConfig(): ComposeConfig | string {
  const dir = mkdtempSync(join(tmpdir(), 'wb-deploy-compose-'))
  try {
    copyFileSync(join(DEPLOY, 'docker-compose.yml'), join(dir, 'docker-compose.yml'))
    writeFileSync(join(dir, '.env'), 'SITE_ADDRESS=wirebound.example.com\nPOSTGRES_PASSWORD=probe\n')
    const run = spawnSync('docker', ['compose', '-f', join(dir, 'docker-compose.yml'), 'config', '--format', 'json'], { encoding: 'utf8' })
    if (run.error !== undefined || run.status !== 0) return `docker compose config 이 안 돈다: ${run.error?.message ?? run.stderr.trim().split('\n')[0]}`
    return JSON.parse(run.stdout) as ComposeConfig
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const config = resolvedConfig()
if (typeof config === 'string') {
  // eslint-disable-next-line no-console
  console.log(`[운영 compose] 건너뛴다 — ${config}`)
}

/** compose 의 기간 글자(`40s`)를 ms 로. 초 단위 말고는 받지 않는다 — 다른 꼴이 오면 이 자를 고친다. */
function seconds(value: string | undefined): number {
  const match = /^(\d+)s$/.exec(value ?? '')
  if (match === null) throw new Error(`초 단위 기간이 아니다: ${value}`)
  return Number(match[1]) * 1000
}

describe.skipIf(typeof config === 'string')('운영 compose 의 값', () => {
  const c = config as ComposeConfig

  it('api 를 끄는 쪽의 한도가 api 의 종료 한도보다 길다', () => {
    expect(seconds(c.services.api?.stop_grace_period)).toBeGreaterThan(SHUTDOWN_GRACE_MS)
  })

  it('앞단의 grace_period 가 api 의 종료 한도보다 길고 web 을 끄는 쪽의 한도보다 짧다', () => {
    const caddyfile = readFileSync(join(DEPLOY, 'Caddyfile'), 'utf8')
    const lines = [...caddyfile.matchAll(/^\s*grace_period\s+(\S+)\s*$/gm)]
    expect(lines).toHaveLength(1)
    const grace = seconds(lines[0]![1])
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

  it('바깥 포트는 앞단만 연다', () => {
    const published = Object.entries(c.services)
      .filter(([, service]) => (service.ports ?? []).length > 0)
      .map(([name]) => name)
    expect(published).toEqual(['web'])
  })

  it('시딩 비밀번호는 api 의 환경에 안 남는다', () => {
    expect(c.services.api?.environment?.SEED_USER_PASSWORD).toBe('')
  })
})
