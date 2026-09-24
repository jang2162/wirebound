/**
 * ⚠️ 이 파일은 테스트 DB에 **실제로 커밋한다.** `snapshots-concurrency.test.ts`와 같은
 * 부류이고 그 파일의 머리말이 근거·격리·주의를 이미 적어 두었다(요지: `withApi`는 테스트
 * 하나를 커넥션 하나·트랜잭션 하나로 감싸므로 **서로 다른 커넥션이 실제로 잠가야만 검증되는
 * 성질**을 잴 수 없다).
 *
 * ---
 *
 * # 여기서만 잴 수 있는 것 — 복원의 잠금이 **실제로 걸리는가**
 *
 * `restore.test.ts`의 케이스들은 전부 하네스 트랜잭션 하나 안에서 돌므로 잠금이 아무것도
 * 막지 않는다(자기 잠금은 자기를 막지 않는다). **그래서 `lockProjectForRestore` 호출을
 * 통째로 지우는 변이가 그 파일에서는 하나도 안 죽는다** — 방어가 있는 판과 없는 판이
 * 관측상 같다. 이 파일이 그 축을 겨냥한다.
 *
 * ## 겨냥 — 무엇을 붙잡고 재는가
 *
 * *"복원이 도는 동안 남이 못 고치는가"*를 그대로 재려 하면 **방어가 없어도 막힌다.**
 * 복원은 언제나 안전망 스냅샷을 넣고, `snapshots.project_id`가 `projects(id)`를
 * 참조하므로 그 삽입만으로도 `projects` 행에 `FOR KEY SHARE`가 걸린다. 즉 `projects` 행을
 * 잡고 재면 잠금을 지워도 막힌다 — **그 불변량은 두 판이 동시에 만족한다.**
 *
 * 그래서 **`menu_nodes` 행을 붙잡는다.** 아무것도 바뀌지 않은 프로젝트를 복원하면
 * (계획의 `steps`가 비어 있다) 복원은 그 표에 **아무것도 쓰지 않는다** — 잠금 문장을
 * 빼면 지나가고, 두면 걸린다. 두 판의 관측이 갈리는 유일한 자리다.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'kysely'
import type { FastifyInstance } from 'fastify'
import { restoreSnapshot } from '../src/services/restore'
import {
  createMenuNode,
  createPage,
  createProject,
  getTestDb,
  resetRealData,
  signup,
  withRealApi,
  type TestContext,
} from './helpers'

const db = getTestDb()

// 청소도 하네스도 `helpers.ts`에 있다.
beforeEach(resetRealData)
afterEach(resetRealData)

/** 잠금이 걸렸는지 판정하는 창. 아래 음성 대조가 같은 창에서 끝나는 것을 함께 잰다. */
const WAIT_MS = 700

interface Fixture {
  projectId: string
  snapshotId: string
  userId: string
}

async function setup(app: FastifyInstance): Promise<Fixture> {
  const ctx: TestContext = { app, db }
  const owner = await signup(ctx)
  const project = await createProject(ctx, owner.cookie)
  const menu = await createMenuNode(ctx, owner.cookie, project.id, { title: '설정' })
  await createPage(ctx, owner.cookie, project.id, menu.id, { title: '사용자 목록' })

  const res = await app.inject({
    method: 'POST',
    url: `/api/projects/${project.id}/snapshots`,
    cookies: owner.cookie,
    payload: { tag: 'v1' },
  })
  if (res.statusCode !== 201) throw new Error(`스냅샷 픽스처 실패 (${res.statusCode}): ${res.body}`)

  return { projectId: project.id, snapshotId: (res.json() as { id: string }).id, userId: owner.user.id }
}

/** 복원을 **await하지 않고** 쏜다. 끝났는지를 밖에서 볼 수 있어야 한다. */
function fireRestore(fx: Fixture): { done: () => boolean; promise: Promise<unknown> } {
  let settled = false
  const promise = restoreSnapshot(db, {
    projectId: fx.projectId,
    snapshotId: fx.snapshotId,
    actorId: fx.userId,
  }).then((outcome) => {
    settled = true
    return outcome
  })
  return { done: () => settled, promise }
}

describe('복원은 프로젝트를 잠근다', () => {
  it('아무도 잡고 있지 않으면 창 안에 끝난다 — 음성 대조', async () => {
    await withRealApi(async ({ app }) => {
      const fx = await setup(app)

      const restore = fireRestore(fx)
      await new Promise((resolve) => setTimeout(resolve, WAIT_MS))

      // 이것이 없으면 아래 케이스의 *"막힌다"*가 *"그냥 느리다"*와 구분되지 않는다.
      expect(restore.done()).toBe(true)
      expect(await restore.promise).toMatchObject({ kind: 'restored' })
    })
  }, 60_000)

  it('남이 메뉴 행을 잡고 있으면 복원이 기다린다', async () => {
    await withRealApi(async ({ app }) => {
      const fx = await setup(app)

      let release: () => void = () => {}
      const held = new Promise<void>((resolve) => {
        release = resolve
      })
      let locked = false
      const holder = db.transaction().execute(async (trx) => {
        await sql`select id from menu_nodes where project_id = ${fx.projectId} for update`.execute(trx)
        locked = true
        await held
      })
      while (!locked) await new Promise((resolve) => setTimeout(resolve, 20))

      let blocked: boolean
      try {
        const restore = fireRestore(fx)
        await new Promise((resolve) => setTimeout(resolve, WAIT_MS))
        blocked = !restore.done()
      } finally {
        // **놓아 주는 것이 `finally`에 있어야 한다.** `expect` 뒤에 두면, 잠금을 지우는
        // 변이를 심었을 때 그 `expect`가 던지면서 이 트랜잭션이 영영 열린 채로 남는다.
        // 그러면 `afterEach`의 `deleteFrom('projects')`가 그 잠금을 기다리며 **스위트
        // 전체가 멈춘다**(프로세스를 죽여야 풀린다). 변이를 심는 것이
        // 곧 이 파일을 그 상태에 두는 일이므로, 실패 경로에서도 반드시 놓아야 한다.
        release()
        await holder
      }

      // **여기가 이 파일의 요점이다.** 잠금 문장을 지우면 이 판이 위 음성 대조와 같아진다 —
      // 바뀔 것이 없는 복원은 `menu_nodes`에 아무것도 쓰지 않기 때문이다.
      expect(blocked).toBe(true)
    })
  }, 60_000)
})
