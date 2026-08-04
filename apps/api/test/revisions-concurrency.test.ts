import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import type { PatchOp } from '@wirebound/schema'
import { buildApp } from '../src/app'
import {
  createMenuNode,
  createPage,
  createProject,
  getTestDb,
  signup,
  testConfig,
  type CreatedPage,
  type CreatedProject,
  type SignedUpUser,
  type TestContext,
} from './helpers'

/**
 * ⚠️ 이 파일은 테스트 DB에 **실제로 커밋한다.** 저장소의 다른 모든 api 테스트와
 * 다르다.
 *
 * 이유: `withApi`는 테스트 하나를 커넥션 하나·트랜잭션 하나 안에서 돌린다. 그
 * 안에서 `Promise.all`로 요청을 겹쳐도 전부 같은 트랜잭션 위에서 직렬화되므로,
 * `SELECT ... FOR UPDATE`가 있든 없든 똑같이 통과한다 — 실패할 수 없는 테스트다.
 * 행 잠금과 seq 채번의 원자성은 서로 다른 커넥션이 실제로 커밋해야만 검증된다.
 *
 * 격리: 각 테스트 전후로 `projects`·`users`를 지운다. `projects` 삭제는
 * `menu_nodes`·`pages`(CASCADE) → `revisions`(CASCADE)까지 지우고, `users`
 * 삭제는 `sessions`(CASCADE)를 지운다. vitest의 api 프로젝트는
 * `fileParallelism: false`이므로 이 파일이 도는 동안 다른 파일이 같은 DB를
 * 만지지 않는다.
 *
 * 이 파일에 새 테스트를 더할 때는 반드시 "여러 커넥션이 실제로 커밋해야만
 * 검증되는 성질"인지 먼저 확인한다. 그렇지 않으면 `withApi`를 쓴다.
 *
 * **`projects` 한 번의 DELETE로 `pages`까지 지워지는 것은 우연이 아니다.**
 * `pages.menu_node_id`는 `ON DELETE RESTRICT`이고 `menu_nodes`도 `projects`의
 * CASCADE 대상이라, 두 CASCADE의 순서에 따라 RESTRICT가 먼저 걸릴 수 있어 보인다.
 * Postgres는 한 문장이 유발한 연쇄 삭제를 참조하는 쪽부터 처리하므로 실제로는
 * `pages`가 먼저 지워진다(실측 확인) — 그래도 이 순서에 기대는 코드가 여기밖에
 * 없다는 점은 알고 있어야 한다. 이 reset이 언젠가 FK 위반으로 실패하기 시작하면
 * `pages` → `menu_nodes` → `projects` 순서로 명시적으로 지우면 된다.
 */

/** 이 파일은 하네스가 아니라 풀 핸들을 직접 쓴다. 파일이 끝나면 `setup.ts`의 `afterAll`이 닫는다. */
const db = getTestDb()

async function reset(): Promise<void> {
  await db.deleteFrom('projects').execute()
  await db.deleteFrom('users').execute()
}

// `beforeEach`와 `afterEach` 양쪽에서 지운다. 테스트가 중간에 죽으면 `afterEach`가
// 안 돌 수 있고, 그 잔여 데이터가 다음 테스트를 오염시킨다.
beforeEach(reset)
afterEach(reset)

/**
 * 앱을 만들고 테스트가 끝나면 닫는다. `buildApp`에 **트랜잭션이 아니라 풀 핸들**을
 * 넘기는 것이 이 파일의 존재 이유다 — 요청마다 서로 다른 커넥션을 잡고 각자 커밋한다.
 */
async function withRealApi(fn: (ctx: TestContext) => Promise<void>): Promise<void> {
  const app: FastifyInstance = await buildApp({ db, config: testConfig() })
  try {
    await fn({ app, db })
  } finally {
    await app.close()
  }
}

interface Fixture {
  owner: SignedUpUser
  project: CreatedProject
  page: CreatedPage
}

async function setup(ctx: TestContext): Promise<Fixture> {
  const owner = await signup(ctx)
  const project = await createProject(ctx, owner.cookie)
  const menu = await createMenuNode(ctx, owner.cookie, project.id)
  const page = await createPage(ctx, owner.cookie, project.id, menu.id)
  return { owner, project, page }
}

/** 배열에 Text 노드 하나를 끼워 넣는 연산. id만 다르면 서로 다른 편집이 된다. */
function addTextOp(id: string): PatchOp {
  return { op: 'add', path: '/root/children/0', value: { id, type: 'Text', props: { content: id } } }
}

function patchOps(ctx: TestContext, fx: Fixture, pageId: string, baseSeq: number, ops: PatchOp[]) {
  return ctx.app.inject({
    method: 'PATCH',
    url: `/api/projects/${fx.project.id}/pages/${pageId}/ops`,
    cookies: fx.owner.cookie,
    payload: { baseSeq, ops },
  })
}

async function headSeqOf(pageId: string): Promise<number> {
  const row = await db.selectFrom('pages').select('head_seq').where('id', '=', pageId).executeTakeFirstOrThrow()
  return Number(row.head_seq)
}

async function revisionSeqsOf(pageId: string): Promise<number[]> {
  const rows = await db.selectFrom('revisions').select('seq').where('page_id', '=', pageId).orderBy('seq').execute()
  return rows.map((row) => Number(row.seq))
}

/** 상태 코드를 오름차순으로 정렬한다. `Promise.all`의 완료 순서에 의존하지 않기 위해서다. */
function sorted(codes: number[]): number[] {
  return codes.slice().sort((a, b) => a - b)
}

describe('편집 seq 채번의 동시성', () => {
  it('같은 baseSeq로 동시에 두 편집이 오면 하나만 성공한다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await setup(ctx)

      const [a, b] = await Promise.all([
        patchOps(ctx, fx, fx.page.id, 0, [addTextOp('n_conc_a')]),
        patchOps(ctx, fx, fx.page.id, 0, [addTextOp('n_conc_b')]),
      ])

      // 정렬해서 비교한다 — 어느 쪽이 이기는지는 정해져 있지 않다.
      //
      // **`[200, 500]`이 나오면 행 잠금이 없다는 뜻이다.** `.forUpdate()`가 빠지면
      // 두 트랜잭션이 같은 `head_seq`를 읽고 둘 다 `seq: 1`로 insert하려다
      // `(page_id, seq)` UNIQUE에 걸린다. 파이프라인은 그 예외를 잡지 않으므로
      // (`edit-pipeline.ts` 헤더: "행 잠금이 제대로 걸렸다면 그런 위반은 애초에
      // 일어날 수 없으므로, 일어났다는 것 자체가 버그다") 409가 아니라 500이 된다.
      //
      // **다만 이 케이스는 그 퇴행의 믿을 만한 검출기가 아니다.** `.forUpdate()`를
      // 지우고 여섯 번 돌려 본 결과 이 케이스는 한 번만 실패했다 — 요청이 둘뿐이면
      // 뒤엣것이 앞엣것의 커밋 뒤에 `head_seq`를 읽는 일이 잦아 잠금 없이도 409가
      // 나온다. 같은 조건에서 아래 열 개 케이스와 PUT 케이스는 여섯 번 모두
      // 실패했다. 이 케이스가 고정하는 것은 "동시에 둘이 오면 하나만 성공한다"는
      // 계약 자체이고, 잠금 유무를 가르는 일은 그 둘이 맡는다.
      expect(sorted([a.statusCode, b.statusCode]), `${a.body} / ${b.body}`).toEqual([200, 409])

      expect(await headSeqOf(fx.page.id)).toBe(1)
      expect(await revisionSeqsOf(fx.page.id)).toEqual([1])

      // 진 쪽의 409 메시지가 `toApiError`의 두 인자를 고정한다: 요청이 실은
      // `baseSeq`(0)와 잠근 뒤 읽은 현재 `head_seq`(1)다. 두 숫자가 뒤바뀌면
      // "요청 baseSeq 1, 현재 0"이 되어 이 단언이 죽는다.
      const loser = a.statusCode === 409 ? a : b
      const message = loser.json<{ error: { code: string; message: string } }>().error
      expect(message.code).toBe('conflict')
      expect(message.message).toContain('요청 baseSeq 0')
      expect(message.message).toContain('현재 1')
    })
  })

  it('동시 편집 열 개 중 정확히 하나만 성공한다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await setup(ctx)

      // 열 개는 `createPool`의 `pg` 기본 `max`(10)와 정확히 같다. 요청 하나가
      // 동시에 두 커넥션을 잡는 구간이 없어(권한 조회는 파이프라인 트랜잭션을 열기
      // 전에 끝난다) 상한에 걸려도 대기만 할 뿐 교착되지 않는다 — 실행해서
      // 타임아웃(20초)에 걸리지 않는 것을 확인했다.
      const responses = await Promise.all(
        Array.from({ length: 10 }, (_, i) => patchOps(ctx, fx, fx.page.id, 0, [addTextOp(`n_conc_${i}`)])),
      )

      const codes = sorted(responses.map((res) => res.statusCode))
      // 개수만 세지 않고 배열 전체를 못박는다 — `filter(c => c === 409).length`만
      // 보면 나머지 하나가 500이어도 통과한다.
      expect(codes, responses.map((r) => r.body).join('\n')).toEqual([200, ...Array<number>(9).fill(409)])

      expect(await headSeqOf(fx.page.id)).toBe(1)
      expect(await revisionSeqsOf(fx.page.id)).toEqual([1])
    })
  })

  it('직렬로 보내면 열 개가 모두 성공하고 seq에 구멍이 없다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await setup(ctx)

      // 양성 대조다. 위 두 케이스가 409를 기대하므로, 잠금이 지나치게 넓어져
      // 정상 편집까지 막는 퇴행은 그 둘로는 드러나지 않는다.
      const seqs: number[] = []
      let base = 0
      for (let i = 0; i < 10; i += 1) {
        const res = await patchOps(ctx, fx, fx.page.id, base, [addTextOp(`n_serial_${i}`)])
        expect(res.statusCode, res.body).toBe(200)
        base = res.json<{ seq: number }>().seq
        seqs.push(base)
      }

      expect(seqs).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
      expect(await headSeqOf(fx.page.id)).toBe(10)
      expect(await revisionSeqsOf(fx.page.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    })
  })

  it('서로 다른 페이지의 동시 편집은 서로를 막지 않는다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await setup(ctx)
      const menu = await createMenuNode(ctx, fx.owner.cookie, fx.project.id)
      const other = await createPage(ctx, fx.owner.cookie, fx.project.id, menu.id)

      // 잠금 범위가 페이지 **행**이 아니라 테이블이면(누군가 `LOCK TABLE`을 쓰거나
      // 잠금 대상 조건을 잘못 잡으면) 둘 중 하나가 상대를 기다리게 된다. 그래도
      // 결국 둘 다 200이므로 상태 코드만으로는 구분되지 않는다 — 이 케이스가
      // 잡는 것은 그 퇴행이 **교착이나 타임아웃으로 번지는** 경우다.
      const [a, b] = await Promise.all([
        patchOps(ctx, fx, fx.page.id, 0, [addTextOp('n_page_a')]),
        patchOps(ctx, fx, other.id, 0, [addTextOp('n_page_b')]),
      ])

      expect(a.statusCode, a.body).toBe(200)
      expect(b.statusCode, b.body).toBe(200)
      expect(await headSeqOf(fx.page.id)).toBe(1)
      expect(await headSeqOf(other.id)).toBe(1)
    })
  })

  it('PUT은 현재 head_seq를 읽은 뒤 다른 편집이 커밋되면 409다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await setup(ctx)

      // 이 페이지의 head_seq를 1로 만들어 둔다. 아래 409 메시지의 두 숫자가 0과 1이
      // 아니라 1과 2가 되게 하려는 것이다 — 0이면 `toApiError(outcome, before.headSeq)`의
      // 두 번째 인자를 상수 0으로 바꿔도 메시지가 같아 단언이 아무것도 고정하지 못한다.
      const seed = await patchOps(ctx, fx, fx.page.id, 0, [addTextOp('n_put_seed')])
      expect(seed.statusCode, seed.body).toBe(200)

      // `PUT .../schema`의 핸들러는 `findPageById`로 현재 head_seq를 읽은 **뒤에**
      // 파이프라인을 부른다(`routes/pages.ts`: "읽기와 파이프라인 호출 사이에는
      // 경합 창이 있다"). 그 창을 결정적으로 벌린다:
      //
      // 1. 다른 커넥션에서 페이지 행을 잠그고 head_seq를 2로 올리되 **커밋하지 않는다.**
      //    커밋 전이므로 PUT의 `findPageById`(잠금 없는 읽기)는 READ COMMITTED에서
      //    여전히 1을 본다 — 여기엔 타이밍 가정이 없다.
      // 2. PUT을 던진다. 읽기를 마치고 `FOR UPDATE`에서 막힌다.
      // 3. **막힌 것을 확인한 뒤**(pg_locks 폴링) 커밋한다. 이 확인이 있어야
      //    "PUT이 아직 읽지도 않았는데 커밋해 버려 우연히 2를 읽는" 경우가 없다.
      let release = (): void => {}
      const blocked = new Promise<void>((resolve) => {
        release = resolve
      })
      const otherEditor = db.transaction().execute(async (trx) => {
        await trx
          .selectFrom('pages')
          .select('head_seq')
          .where('id', '=', fx.page.id)
          .forUpdate()
          .executeTakeFirstOrThrow()
        await trx
          .insertInto('revisions')
          .values({
            page_id: fx.page.id,
            seq: 2,
            actor_type: 'user',
            actor_id: fx.owner.user.id,
            actor_label: fx.owner.user.name,
            ops: JSON.stringify([]),
            inverse: JSON.stringify([]),
          })
          .execute()
        await trx.updateTable('pages').set({ head_seq: 2 }).where('id', '=', fx.page.id).execute()
        await blocked
      })

      const put = ctx.app.inject({
        method: 'PUT',
        url: `/api/projects/${fx.project.id}/pages/${fx.page.id}/schema`,
        cookies: fx.owner.cookie,
        payload: { schema: { version: 1, root: { id: 'n_put_root', type: 'Page', children: [] } } },
      })

      await waitForLockWaiter()
      release()
      await otherEditor

      const res = await put
      expect(res.statusCode, res.body).toBe(409)
      // 요청이 실은 baseSeq는 PUT이 읽어 넘긴 head_seq(1)이고, 현재 값은 그 사이
      // 커밋된 2다. 이 두 숫자가 `toApiError`의 두 인자 그 자체다.
      const error = res.json<{ error: { code: string; message: string } }>().error
      expect(error.code).toBe('conflict')
      expect(error.message).toContain('요청 baseSeq 1')
      expect(error.message).toContain('현재 2')

      // 409였으므로 PUT은 아무것도 쓰지 않았다 — head_seq는 다른 편집자가 남긴 2 그대로다.
      expect(await headSeqOf(fx.page.id)).toBe(2)
      expect(await revisionSeqsOf(fx.page.id)).toEqual([1, 2])
    })
  })
})

/**
 * 어떤 트랜잭션이 잠금을 기다리며 막힐 때까지 기다린다.
 *
 * `pg_locks`에서 `granted = false`인 행은 "이 백엔드가 잠금을 요청했지만 아직 못
 * 받았다"는 뜻이다. 이 파일이 도는 동안 같은 DB를 만지는 다른 테스트 파일이 없으므로
 * (`fileParallelism: false`) 그런 행이 나타났다는 것은 우리가 던진 요청이 `FOR UPDATE`에서
 * 막혔다는 뜻이다. 고정 `sleep` 대신 이것을 쓰는 이유는 느린 머신에서 조용히 시나리오가
 * 뒤집히는(= 아무것도 검증하지 않는 초록) 것을 막기 위해서다 — 나타나지 않으면 던진다.
 */
async function waitForLockWaiter(timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const result = await sql<{ n: number }>`select count(*)::int as n from pg_locks where not granted`.execute(db)
    if ((result.rows[0]?.n ?? 0) > 0) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error('행 잠금을 기다리는 트랜잭션이 나타나지 않았습니다 — 시나리오가 성립하지 않았습니다')
}
