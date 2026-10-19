/**
 * **개발 DB 의 compose 프로젝트 이름이 체크아웃 디렉터리를 따르는가** — 루트 `package.json` 의 `db` 스크립트를 그대로 돌려 잰다.
 *
 * 그 이름이 두 가지를 쥔다(`docker/dev/compose.yaml` 머리말):
 *
 * - **워크트리 격리** — 체크아웃마다 컨테이너 · 볼륨이 갈린다(`<프로젝트>_wirebound-pgdata`). 이름이 한 값으로 모이면 워크트리가
 *   서로의 DB 를 쓴다 — 아무도 안 운다.
 * - **최상위 체크아웃의 데이터** — 디렉터리 이름이 `wirebound` 인 체크아웃이 쓰는 볼륨은 `wirebound_wirebound-pgdata` 다. 이름 규칙이
 *   바뀌면 그 체크아웃이 빈 볼륨으로 뜨고 설계서가 남의 이름 밑에 남는다.
 *
 * **스크립트의 글자가 아니라 그 스크립트가 낸 `config` 를 본다** — 임시 디렉터리 둘(하나는 `wirebound`)에 `docker/dev/` 와
 * `apps/api/.env` 를 두고 그 안에서 `sh -c '<db 스크립트> config --format json'` 을 친다.
 *
 * **`docker compose` 가 없으면 건너뛴다.**
 */
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const DB_SCRIPT = (JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> }).scripts.db!

interface DevConfig {
  name: string
  services: { postgres: { ports: { published: string }[]; volumes: { type: string; source: string }[] } }
  volumes: Record<string, { name: string }>
}

// 실제 경로로 — macOS 의 `/var` 는 `/private/var` 의 링크라 compose 가 찍는 경로와 글자가 갈린다.
const base = realpathSync(mkdtempSync(join(tmpdir(), 'wb-dev-compose-')))
afterAll(() => rmSync(base, { recursive: true, force: true }))

/** `<base>/<이름>` 에 체크아웃 흉내를 세우고 그 안에서 명령을 친다. */
function checkout(name: string, port: string): string {
  const dir = join(base, name)
  mkdirSync(join(dir, 'apps/api'), { recursive: true })
  cpSync(join(ROOT, 'docker/dev'), join(dir, 'docker/dev'), { recursive: true })
  writeFileSync(join(dir, 'apps/api/.env'), `POSTGRES_PORT=${port}\n`)
  return dir
}

function run(dir: string, command: string) {
  return spawnSync('sh', ['-c', command], { cwd: dir, encoding: 'utf8' })
}

function devConfig(dir: string): DevConfig | string {
  const r = run(dir, `${DB_SCRIPT} config --format json`)
  if (r.error !== undefined || r.status !== 0)
    return `db 스크립트의 config 가 안 돈다: ${r.error?.message ?? r.stderr.trim().split('\n')[0]}`
  return JSON.parse(r.stdout) as DevConfig
}

const docker = spawnSync('docker', ['compose', 'version'], { encoding: 'utf8' })
const skip = docker.error !== undefined || docker.status !== 0
if (skip) {
  // eslint-disable-next-line no-console
  console.log(`[개발 compose] 건너뛴다 — docker compose 가 안 돈다: ${docker.error?.message ?? docker.stderr.trim()}`)
}

describe.skipIf(skip)('개발 DB 의 compose 프로젝트', () => {
  it('최상위 체크아웃(디렉터리 `wirebound`)은 `wirebound_wirebound-pgdata` 를 쓴다 — 옮기기 전과 같은 볼륨', () => {
    const c = devConfig(checkout('wirebound', '5433'))
    expect(typeof c, String(c)).toBe('object')
    const config = c as DevConfig
    expect([config.name, config.volumes['wirebound-pgdata']?.name]).toEqual(['wirebound', 'wirebound_wirebound-pgdata'])
  })

  it('체크아웃 둘은 프로젝트 · 볼륨 · 포트가 다 갈린다', () => {
    const a = devConfig(checkout('wt-alpha', '15441')) as DevConfig
    const b = devConfig(checkout('wt-beta', '15442')) as DevConfig
    const shape = (c: DevConfig) => [c.name, c.volumes['wirebound-pgdata']?.name, c.services.postgres.ports[0]?.published]
    expect([shape(a), shape(b)]).toEqual([
      ['wt-alpha', 'wt-alpha_wirebound-pgdata', '15441'],
      ['wt-beta', 'wt-beta_wirebound-pgdata', '15442'],
    ])
  })

  it('init 스크립트의 바인드는 그 체크아웃의 `docker/dev/postgres-init` 이다', () => {
    const dir = checkout('wt-init', '15443')
    const binds = (devConfig(dir) as DevConfig).services.postgres.volumes.filter((v) => v.type === 'bind').map((v) => v.source)
    expect(binds).toEqual([join(dir, 'docker/dev/postgres-init')])
  })

  it('스크립트를 거치지 않은 호출은 멈춘다 — 그대로 두면 모든 체크아웃의 이름이 `dev` 다', () => {
    const r = run(checkout('wt-raw', '15444'), 'docker compose -f docker/dev/compose.yaml --env-file apps/api/.env config')
    expect([r.status, /WIREBOUND_DEV_DB/.test(r.stderr)]).toEqual([1, true])
  })
})
