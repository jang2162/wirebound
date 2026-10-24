/**
 * **겹친 올리기 · 가져오기와 한도** — 두 요청이 함께 «한도 밑» 을 보고 둘 다 넣으면 한도를 넘는다. 한도는 소유자마다의 자물쇠(`pg_advisory_xact_lock` —
 * `repos/assets.ts` 머리말 «한도는 자물쇠 안에서 센다») 안에서 센다. 프로젝트 몫(`addProjectAsset`) · 개인 몫(`addPersonalAsset`) 둘 다 잰다.
 *
 * **두 요청이 겹친 판만 센다** — 테스트 트랜잭션이 프로젝트 행을 `FOR UPDATE` 로 쥐어 두 요청을 한도 자물쇠 **앞**에 세우고, 둘 다 그 트랜잭션에 줄 선 것
 * (`pg_blocking_pids`)을 본 뒤 놓는다(`overlapAtGate`). 줄이 안 서면 던진다. 문은 한도 자물쇠와 무관한 자리라 자물쇠를 떼도 판이 선다 — 문을 자물쇠 자체로
 * 세우면 자물쇠를 뗀 변조가 값이 아니라 «줄 서지 않았다» 로 죽는다. 놓은 뒤 둘이 함께 합을 세는 창을 넓히려고 소유 행 삽입의 커밋을 늦춘다
 * (`DEFERRABLE INITIALLY DEFERRED` 제약 트리거의 `pg_sleep` — AGENTS.md «COMMIT 만 느리게 하려면») — 자물쇠가 없으면 둘 다 커밋 전의 합(0)을 보고 넣는다.
 */
import { sql } from 'kysely'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createProject, getTestDb, resetRealData, signup, testConfig, withRealApi } from './helpers'
import { pngOfSize } from './asset-samples'

beforeEach(resetRealData)
afterEach(resetRealData)

type Db = ReturnType<typeof getTestDb>

/**
 * `gateRows` 의 프로젝트 행을 쥔 채 `fire` 가 낸 두 요청이 그 트랜잭션에 줄 서기를 기다렸다가 놓는다. `slowTable` 삽입의 커밋을 0.5s 늦춘다.
 * 문 · 늦춤은 끝나면 걷는다.
 */
async function overlapAtGate<T>(
  db: Db,
  gateRows: readonly string[],
  slowTable: 'project_assets' | 'personal_assets',
  fire: () => Promise<T>,
): Promise<T> {
  let both: Promise<T> | undefined
  await sql`create function wb_test_slow_commit() returns trigger language plpgsql as $$ begin perform pg_sleep(0.5); return null; end $$`.execute(
    db,
  )
  await sql`create constraint trigger wb_test_slow_commit after insert on ${sql.table(slowTable)} deferrable initially deferred for each row execute function wb_test_slow_commit()`.execute(
    db,
  )
  try {
    let held!: (pid: number) => void
    let release!: () => void
    const isHeld = new Promise<number>((done) => (held = done))
    const gate = new Promise<void>((done) => (release = done))
    const holder = db.transaction().execute(async (trx) => {
      await trx
        .selectFrom('projects')
        .select('id')
        .where('id', 'in', [...gateRows])
        .forUpdate()
        .execute()
      const pid = await sql<{ pid: number }>`select pg_backend_pid() as pid`.execute(trx)
      held(pid.rows[0]!.pid)
      await gate
    })
    const holderPid = await isHeld
    both = fire()
    const deadline = Date.now() + 10_000
    let waiting = 0
    while (Date.now() < deadline) {
      const row = await sql<{ n: string }>`
        select count(*)::text as n from pg_stat_activity
        where pid <> pg_backend_pid() and ${holderPid}::int = any(pg_blocking_pids(pid))
      `.execute(db)
      waiting = Number(row.rows[0]!.n)
      if (waiting >= 2) break
      await new Promise((done) => setTimeout(done, 20))
    }
    release()
    await holder
    if (waiting < 2) throw new Error(`두 요청이 프로젝트 행에 줄 서지 않았다(${waiting})`)
  } finally {
    await (both ?? Promise.resolve()).catch(() => undefined)
    await sql`drop trigger if exists wb_test_slow_commit on ${sql.table(slowTable)}`.execute(db)
    await sql`drop function if exists wb_test_slow_commit()`.execute(db)
  }
  return both!
}

describe('겹친 올리기 — 한도를 넘지 않는다', () => {
  it('둘이 프로젝트 행에 줄 섰다가 함께 풀린 판에서 하나만 들고 하나는 409 asset-quota · 합은 한도 안', async () => {
    const base = testConfig()
    await withRealApi(
      async (ctx) => {
        const owner = await signup(ctx)
        const projectId = (await createProject(ctx, owner.cookie)).id
        const db = getTestDb()
        const send = (seed: number) =>
          ctx.app.inject({
            method: 'POST',
            url: `/api/projects/${projectId}/assets`,
            cookies: owner.cookie,
            headers: { 'content-type': 'image/png' },
            payload: pngOfSize(1500, seed),
          })
        // 문은 그 프로젝트 행 — 올리기가 한도 자물쇠 앞에서 `lockProjectShared` 로 잡는다.
        const results = await overlapAtGate(db, [projectId], 'project_assets', () => Promise.all([send(1), send(2)]))
        expect(results.map((res) => res.statusCode).sort()).toEqual([201, 409])
        const used = await db
          .selectFrom('project_assets')
          .innerJoin('asset_blobs', 'asset_blobs.sha256', 'project_assets.sha256')
          .select(sql<string>`coalesce(sum(asset_blobs.size), 0)`.as('total'))
          .where('project_id', '=', projectId)
          .executeTakeFirstOrThrow()
        expect(Number(used.total)).toBe(1500)
        // 못 든 쪽의 덩이는 남지 않는다 — 그 트랜잭션이 롤백됐다.
        expect(await db.selectFrom('asset_blobs').select('sha256').execute()).toHaveLength(1)
      },
      { config: { ...base, assetLimits: { ...base.assetLimits, projectBytes: 2000 } } },
    )
  })
})

describe('겹친 개인 몫 가져오기 — 사람 한도를 넘지 않는다', () => {
  it('다른 두 출처에서 개인 몫으로 가져오는 둘이 겹친 판에서 하나만 claimed · 하나는 quota · 쓴 용량은 한도 안', async () => {
    const base = testConfig()
    await withRealApi(
      async (ctx) => {
        const owner = await signup(ctx)
        const db = getTestDb()
        const sources: { projectId: string; id: string }[] = []
        for (const seed of [1, 2]) {
          const projectId = (await createProject(ctx, owner.cookie)).id
          const uploaded = await ctx.app.inject({
            method: 'POST',
            url: `/api/projects/${projectId}/assets`,
            cookies: owner.cookie,
            headers: { 'content-type': 'image/png' },
            payload: pngOfSize(1500, seed),
          })
          if (uploaded.statusCode !== 201) throw new Error(`올리기 ${uploaded.statusCode} ${uploaded.body}`)
          sources.push({ projectId, id: uploaded.json<{ id: string }>().id })
        }
        const claim = (source: { projectId: string; id: string }) =>
          ctx.app.inject({
            method: 'POST',
            url: '/api/me/assets/claim',
            cookies: owner.cookie,
            payload: { ids: [source.id], from: { projectId: source.projectId } },
          })
        // 문은 두 출처 프로젝트 행 — 개인 몫 가져오기가 한도 자물쇠 앞에서 `holdSourceProject`(`KEY SHARE`)로 잡는다.
        const results = await overlapAtGate(
          db,
          sources.map((source) => source.projectId),
          'personal_assets',
          () => Promise.all(sources.map(claim)),
        )
        const bodies = results.map((res) => ({
          status: res.statusCode,
          ...res.json<{ claimed: string[]; failed: { reason: string }[] }>(),
        }))
        expect({
          statuses: bodies.map((body) => body.status),
          claimed: bodies.flatMap((body) => body.claimed).length,
          failed: bodies.flatMap((body) => body.failed.map((one) => one.reason)),
        }).toEqual({ statuses: [200, 200], claimed: 1, failed: ['quota'] })
        const used = await db
          .selectFrom('personal_assets')
          .innerJoin('asset_blobs', 'asset_blobs.sha256', 'personal_assets.sha256')
          .select(sql<string>`coalesce(sum(asset_blobs.size), 0)`.as('total'))
          .where('owner_id', '=', owner.user.id)
          .executeTakeFirstOrThrow()
        expect(Number(used.total)).toBe(1500)
      },
      { config: { ...base, assetLimits: { ...base.assetLimits, personalBytes: 2000 } } },
    )
  })
})
