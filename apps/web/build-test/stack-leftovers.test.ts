/**
 * **`SIGKILL` 로 죽은 판이 남기는 것** — 떼어 띄운 그룹(api · vite)과 판의 DB.
 *
 * 그룹은 **띄운 프로세스가 사라지면 스스로 끝난다**(`group-lifeline.mjs`). 부모 노릇을 하는 node 가 줄에 매단 그룹을 띄우고
 * `SIGKILL` 로 죽는다 — 그룹이 한도 안에 0 이 되는지 센다(죽이기 전에 그룹이 살아 있는지가 카나리아다).
 *
 * **앞 판이 남긴 `wb_browser_*` DB 는 다음 판이 거둔다 — 산 실행의 것은 안 지운다**(`editor-stack.ts` 의 `sweepStaleBrowserDatabases`).
 *
 * `SIGKILL` 로 죽은 vitest 는 `exit` 처리기를 못 돌려 제 DB 를 남긴다. 다음 판이 이름의 기계 표 · pid · 만든 때로 가른다 — 이 기계의
 * 것은 pid 가 죽었으면, 다른 pid 공간(표가 다르다)의 것은 `STALE_BROWSER_DATABASE_MS` 가 지났으면 지운다. 판 DB 가 붙은 컨테이너에
 * 이름을 지어 DB 를 만들고 거두기를 한 번 부른다(브라우저 · 서버는 안 띄운다). 죽은 pid 는 방금 끝난 자식 프로세스의 것이다.
 */
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { describe, expect, it } from 'vitest'
import { STALE_BROWSER_DATABASE_MS, browserDatabaseName, editorStackPrerequisite, poll, sweepStaleBrowserDatabases } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

/** 방금 끝난 프로세스의 pid — 이 기계에서 죽은 pid 다. */
function deadPid(): number {
  const child = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' })
  return Number(child.stdout)
}

const LIFELINE = fileURLToPath(new URL('./group-lifeline.mjs', import.meta.url))
const EDITOR_STACK = new URL('./editor-stack.ts', import.meta.url).href

/** 프로세스 그룹 `pgid` 에 산(좀비가 아닌) 프로세스 수. */
function groupSize(pgid: number): number {
  const out = spawnSync('ps', ['-A', '-o', 'pgid=,stat='], { encoding: 'utf8' })
  if (out.status !== 0) throw new Error(`ps 를 못 돌렸다: ${out.stderr}`)
  return out.stdout
    .split('\n')
    .map((line) => line.trim().split(/\s+/))
    .filter(([group, state]) => Number(group) === pgid && state !== undefined && !state.startsWith('Z')).length
}

describe('띄운 프로세스가 사라지면 줄에 매단 그룹이 끝난다', () => {
  it('부모가 SIGKILL 로 죽으면 그룹(줄 · 명령)이 2s 안에 0 이다', async () => {
    // 부모: 줄에 매단 그룹(명령은 60s 잠)을 떼어 띄우고 그 pgid 를 찍은 채 산다.
    const parentScript = `
      const { spawn } = require('node:child_process')
      const group = spawn(process.execPath, [${JSON.stringify(LIFELINE)}, String(process.pid), process.execPath, '-e', 'setTimeout(() => {}, 60000)'], { detached: true, stdio: 'ignore' })
      process.stdout.write(String(group.pid) + '\\n')
      setInterval(() => {}, 1000)
    `
    const parent = spawn(process.execPath, ['-e', parentScript], { stdio: ['ignore', 'pipe', 'inherit'] })
    const pgid = await new Promise<number>((resolve) =>
      parent.stdout!.once('data', (chunk: Buffer) => resolve(Number(String(chunk).trim()))),
    )
    try {
      // 카나리아 — 부모가 사는 동안 그룹에 줄 · 명령 둘이 산다(세는 자가 0 과 0 을 견주지 않게).
      await poll(
        '그룹이 선다',
        async () => groupSize(pgid),
        (n) => n >= 2,
      )
      parent.kill('SIGKILL')
      const left = await poll(
        '부모가 죽은 뒤 그룹이 끝난다',
        async () => groupSize(pgid),
        (n) => n === 0,
        2_000,
      )
      expect(left).toBe(0)
    } finally {
      parent.kill('SIGKILL')
      try {
        process.kill(-pgid, 'SIGKILL')
      } catch {
        // 이미 없다
      }
    }
  })
})

/**
 * **판이 실제로 쓰는 자리 — `editor-stack.ts` 의 `spawnGroup`.** 위 케이스는 줄을 손으로 띄우므로 `spawnGroup` 이 줄을 빼거나 엉뚱한
 * pid 를 지켜보게 넘겨도 초록이다. 여기서는 부모가 `spawnGroup` 을 불러 그룹을 띄우고 `SIGKILL` 로 죽는다(부모는 `.ts` 를 그대로
 * 적재한다 — Node 의 타입 걷기).
 *
 * | 변조(`spawnGroup`) | 죽는 것 |
 * |---|---|
 * | 줄 없이 명령을 곧바로 떼어 띄운다 | 이 케이스 혼자 — 그룹이 남는다 |
 * | 줄에 `process.pid` 대신 `process.ppid` 를 넘긴다 | 이 케이스 혼자 — 줄이 산 조부모(이 테스트)를 지켜본다 |
 */
describe('판이 띄운 그룹(`spawnGroup`)도 띄운 프로세스가 사라지면 끝난다', () => {
  it('부모가 spawnGroup 으로 띄우고 SIGKILL 로 죽으면 그룹이 2s 안에 0 이다', async () => {
    const parentScript = `
      import(${JSON.stringify(EDITOR_STACK)}).then(({ spawnGroup }) => {
        const group = spawnGroup(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], process.cwd(), process.env)
        process.stdout.write(String(group.child.pid) + '\\n')
        setInterval(() => {}, 1000)
      })
    `
    const parent = spawn(process.execPath, ['--input-type=module', '-e', parentScript], { stdio: ['ignore', 'pipe', 'inherit'] })
    const pgid = await new Promise<number>((resolve, reject) => {
      parent.stdout!.once('data', (chunk: Buffer) => resolve(Number(String(chunk).trim())))
      parent.once('exit', (code) => reject(new Error(`부모가 그룹을 띄우기 전에 끝났다(종료 ${code})`)))
    })
    try {
      // 카나리아 — 부모가 사는 동안 그룹이 산다(줄 · 명령 둘. 줄이 빠진 판이면 명령 하나라 하한을 1 로 둔다).
      await poll(
        '그룹이 선다',
        async () => groupSize(pgid),
        (n) => n >= 1,
      )
      parent.kill('SIGKILL')
      const left = await poll(
        '부모가 죽은 뒤 그룹이 끝난다',
        async () => groupSize(pgid),
        (n) => n === 0,
        2_000,
      )
      expect(left).toBe(0)
    } finally {
      parent.kill('SIGKILL')
      try {
        process.kill(-pgid, 'SIGKILL')
      } catch {
        // 이미 없다
      }
    }
  })
})

describe.skipIf(!전제.ok)('앞 판이 남긴 DB 거두기', () => {
  it('이 기계에서 pid 가 죽은 것 · 표가 없는 옛 이름 · 다른 기계의 오래된 것은 지우고, 산 pid · 다른 기계의 갓 만든 것은 둔다', async () => {
    if (!전제.ok) return
    const admin = new pg.Client({ connectionString: 전제.databaseUrl })
    await admin.connect()
    const now = Date.now()
    const dead = deadPid()
    const old = now - STALE_BROWSER_DATABASE_MS - 60_000
    const names = {
      죽은: browserDatabaseName({ now, pid: dead }),
      죽은_옛이름: `wb_browser_${dead}_${randomBytes(4).toString('hex')}`,
      산: browserDatabaseName({ now: old, pid: process.pid }),
      남의기계_오래된: browserDatabaseName({ now: old, pid: process.pid, host: 'ffffffff' }),
      남의기계_갓만든: browserDatabaseName({ now: now - 60_000, pid: dead, host: 'ffffffff' }),
    }
    try {
      for (const name of Object.values(names)) await admin.query(`create database "${name}"`)
      const swept = await sweepStaleBrowserDatabases(admin, { now })
      const left = new Set((await admin.query<{ datname: string }>('select datname from pg_database')).rows.map((row) => row.datname))
      expect(Object.fromEntries(Object.entries(names).map(([key, name]) => [key, left.has(name) ? '남음' : '지움']))).toEqual({
        죽은: '지움',
        죽은_옛이름: '지움',
        산: '남음',
        남의기계_오래된: '지움',
        남의기계_갓만든: '남음',
      })
      expect(swept.dropped).toEqual(expect.arrayContaining([names.죽은, names.죽은_옛이름, names.남의기계_오래된]))
    } finally {
      for (const name of Object.values(names)) await admin.query(`drop database if exists "${name}" with (force)`)
      await admin.end()
    }
  })
})
