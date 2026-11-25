/**
 * ⚠️ 이 파일은 테스트 DB에 **실제로 커밋한다**(`withProxiedRealApi`).
 *
 * # 표시 옵션 저장과 프로젝트 삭제의 차례 — `routes/view-prefs.ts` 의 PUT 이 `lockProjectShared` 를 먼저 잡는 까닭
 *
 * **행이 이미 있는 판의 upsert 는 FK 검사를 안 불러 프로젝트 행을 안 잡는다.** 그 잠금이 없으면 PUT 은 제 `project_view_prefs`
 * 행만 쥔 채 재확인(멤버 행 `FOR SHARE`)에 서고, 프로젝트 삭제는 프로젝트 행을 지나 CASCADE 에서 그 행에 선다 — PUT 의 재확인은
 * 삭제가 이미 지운 멤버 행에 서서 고리다(희생자는 삭제 · 500 · 행이 남는다). 잠금이 있으면 삭제가 프로젝트 행에서 PUT 을 기다린다.
 *
 * **행이 없는 판은 대조군이다** — 삽입의 FK 검사가 같은 `KEY SHARE` 를 걸어, 그 잠금을 떼도 차례가 같다.
 *
 * 판: PUT 을 재확인 질의(`MEMBER_SHARE`)에 붙잡은 뒤(upsert 는 이미 했다) owner 가 프로젝트를 지우고, 삭제가 잠금 줄에 선 것을 본 뒤
 * 놓는다.
 *
 * | 변조(`routes/view-prefs.ts`) | 죽는 것 |
 * |---|---|
 * | PUT 의 `await lockProjectShared(trx, projectId);` 줄을 뗀다 | «행 있음» 둘 — 삭제 500 · 교착 +1 · 행이 남음 · 삭제가 `delete` 에 섬. «행 없음» 둘은 산다 |
 *
 * `await` 만 `void` 로 바꾼 변조는 잠금을 안 뗀다 — 같은 연결의 질의는 보낸 차례로 돌아 그 `select … for key share` 가 upsert 보다
 * 먼저 선다(삭제가 그 판에서도 `… for update` 에 선다). 잠금을 떼는 변조로 세지 않는다.
 */
import { sql } from 'kysely'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { addMember, createProject, getTestDb, resetRealData, signup, withProxiedRealApi } from './helpers'

const db = getTestDb()

beforeEach(resetRealData)
afterEach(resetRealData)

/** 재확인(`recheckProjectRole`)의 멤버 행 질의 — upsert 뒤의 질의다. */
const MEMBER_SHARE = '"user_id" = $2 for share'

async function deadlockCount(): Promise<number> {
  const result = await sql<{ n: number }>`
    select deadlocks::int as n from pg_stat_database where datname = current_database()
  `.execute(db)
  return result.rows[0]!.n
}

/** 잠금을 기다리는 다른 연결의 질의 — 하나 이상 설 때까지(25ms 폴). */
async function lockWaiters(timeoutMs = 5_000): Promise<string[]> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const result = await sql<{ query: string }>`
      select query from pg_stat_activity
       where datname = current_database() and wait_event_type = 'Lock' and pid <> pg_backend_pid()
    `.execute(db)
    if (result.rows.length > 0) return result.rows.map((row) => row.query)
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error('프로젝트 삭제가 잠금 줄에 서지 않았습니다 — 판이 서지 않았습니다')
}

async function prefRows(projectId: string): Promise<string[][]> {
  const rows = await db.selectFrom('project_view_prefs').select('hidden_regions').where('project_id', '=', projectId).execute()
  return rows.map((row) => row.hidden_regions)
}

describe('표시 옵션 저장 × 프로젝트 삭제 — 삭제는 프로젝트 행에서 저장을 기다린다 · 교착 0', () => {
  for (const role of ['editor', 'owner'] as const) {
    for (const existing of [true, false]) {
      it(`${role} · 행 ${existing ? '있음' : '없음(대조군)'} — PUT 200 · 삭제 204 · 교착 0 · 행 0`, async () => {
        await withProxiedRealApi(async (ctx) => {
          const alice = await signup(ctx)
          const bob = await signup(ctx)
          const project = await createProject(ctx, alice.cookie)
          await addMember(ctx, project.id, bob.user.id, role)
          const url = `/api/projects/${project.id}/view-prefs`
          if (existing) {
            const first = await ctx.app.inject({ method: 'PUT', url, cookies: bob.cookie, payload: { hiddenRegions: ['subpage.a'] } })
            if (first.statusCode !== 200) throw new Error(`첫 저장 픽스처 실패 (${first.statusCode}): ${first.body}`)
          }

          const before = await deadlockCount()
          const hold = ctx.proxy.holdQuery(MEMBER_SHARE)
          const put = ctx.app.inject({ method: 'PUT', url, cookies: bob.cookie, payload: { hiddenRegions: ['subpage.b'] } })
          let waiting: string[] = []
          let del: Promise<Awaited<typeof put>> | undefined
          try {
            await hold.held
            del = ctx.app.inject({ method: 'DELETE', url: `/api/projects/${project.id}`, cookies: alice.cookie })
            waiting = await lockWaiters()
          } finally {
            hold.release()
          }
          const [saved, removed] = await Promise.all([put, del!])

          // 넷 다 값으로 보이게 `soft` 다 — 교착이면 삭제 500 · 카운터 +1 · 롤백된 삭제가 남긴 행이 한 실패 값에 함께 선다.
          expect.soft(removed.statusCode, removed.body).toBe(204)
          expect.soft((await deadlockCount()) - before, '교착 수').toBe(0)
          expect.soft(saved.statusCode, saved.body).toBe(200)
          expect.soft(await prefRows(project.id), '남은 행').toEqual([])
          // 삭제가 선 자리 — 프로젝트 행 잠금(`lockProjectRow`)이지 CASCADE 의 `delete` 가 아니다.
          expect(waiting).toEqual([expect.stringMatching(/^select "id" from "projects" .* for update/)])
        })
      }, 60_000)
    }
  }
})
