import { describe, expect, it } from 'vitest'
import { applyOps, type PageDocument, type PatchOp } from '@wirebound/schema'
import { applyEdit } from '../src/services/edit-pipeline'
import { withTransaction } from '../src/db/tx'
import type { RevisionActor } from '../src/repos/revisions'
import {
  createMenuNode,
  createPage,
  createProject,
  signup,
  withApi,
  type CreatedPage,
  type CreatedProject,
  type SignedUpUser,
  type TestContext,
} from './helpers'

/**
 * `services/edit-pipeline.ts`의 `applyEdit`을 라우트를 거치지 않고 직접 부르는
 * 테스트다 — HTTP 매핑(P3에서 추가될 WebSocket 핸들러 몫)과 파이프라인 규칙을
 * 분리해서 검사하기 위해서다.
 *
 * 공통 픽스처(`setup`)는 사용자·프로젝트·메뉴·페이지를 만든다. 기본 페이지는
 * `{ version: 1, root: { id, type: 'Page', children: [] } }`이므로 대부분의
 * 케이스는 먼저 `add /root/children/0`으로 Text 노드를 넣은 상태(`seed`)에서
 * 시작한다. 그 준비 자체도 `applyEdit`으로 한다 — 준비가 성공한다는 사실 자체가
 * 이미 케이스 1의 신호와 같다.
 */

const NONEXISTENT_UUID = '00000000-0000-0000-0000-000000000000'

function actorFor(user: { id: string; name: string }): RevisionActor {
  return { type: 'user', id: user.id, label: user.name }
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

/** 빈 페이지에 Text 노드 하나를 심는 연산. 대부분의 케이스가 이 상태에서 시작한다. */
function seedOp(): PatchOp {
  return { op: 'add', path: '/root/children/0', value: { id: 'n_seedtext001', type: 'Text', props: { content: '시드' } } }
}

/** `seedOp`를 `applyEdit`으로 적용해 seq 1을 만든다. 실패하면(픽스처 자체가 깨졌다는 뜻) 크게 던진다. */
async function seed(ctx: TestContext, fx: Fixture) {
  const outcome = await applyEdit(ctx.db, {
    projectId: fx.project.id,
    pageId: fx.page.id,
    baseSeq: 0,
    ops: [seedOp()],
    actor: actorFor(fx.owner.user),
  })
  if (!outcome.ok) {
    throw new Error(`시드 편집이 실패했습니다: ${JSON.stringify(outcome)}`)
  }
  return outcome
}

describe('applyEdit', () => {
  it('첫 편집은 seq 1을 받는다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)

      const outcome = await applyEdit(ctx.db, {
        projectId: fx.project.id,
        pageId: fx.page.id,
        baseSeq: 0,
        ops: [seedOp()],
        actor: actorFor(fx.owner.user),
      })

      if (!outcome.ok) throw new Error(`편집이 실패했습니다: ${JSON.stringify(outcome)}`)
      expect(outcome.seq).toBe(1)
    })
  })

  it('연속 편집은 seq가 1씩 오른다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)

      const edit1 = await seed(ctx, fx)

      const edit2 = await applyEdit(ctx.db, {
        projectId: fx.project.id,
        pageId: fx.page.id,
        baseSeq: edit1.seq,
        ops: [{ op: 'replace', path: '/root/children/0/props/content', value: '수정1' }],
        actor: actorFor(fx.owner.user),
      })
      if (!edit2.ok) throw new Error(`두 번째 편집이 실패했습니다: ${JSON.stringify(edit2)}`)

      const edit3 = await applyEdit(ctx.db, {
        projectId: fx.project.id,
        pageId: fx.page.id,
        baseSeq: edit2.seq,
        ops: [{ op: 'replace', path: '/root/children/0/props/content', value: '수정2' }],
        actor: actorFor(fx.owner.user),
      })
      if (!edit3.ok) throw new Error(`세 번째 편집이 실패했습니다: ${JSON.stringify(edit3)}`)

      expect([edit1.seq, edit2.seq, edit3.seq]).toEqual([1, 2, 3])
    })
  })

  it('성공하면 pages.schema와 head_seq가 함께 바뀐다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)

      const outcome = await applyEdit(ctx.db, {
        projectId: fx.project.id,
        pageId: fx.page.id,
        baseSeq: 0,
        ops: [seedOp()],
        actor: actorFor(fx.owner.user),
      })
      if (!outcome.ok) throw new Error(`편집이 실패했습니다: ${JSON.stringify(outcome)}`)

      const row = await ctx.db
        .selectFrom('pages')
        .select(['schema', 'head_seq'])
        .where('id', '=', fx.page.id)
        .executeTakeFirstOrThrow()

      expect(row.schema).toEqual(outcome.schema)
      expect(Number(row.head_seq)).toBe(outcome.seq)
    })
  })

  it('성공하면 revision 행이 ops와 inverse를 함께 담는다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      const ops: PatchOp[] = [seedOp()]

      const outcome = await applyEdit(ctx.db, {
        projectId: fx.project.id,
        pageId: fx.page.id,
        baseSeq: 0,
        ops,
        actor: actorFor(fx.owner.user),
      })
      if (!outcome.ok) throw new Error(`편집이 실패했습니다: ${JSON.stringify(outcome)}`)

      const rows = await ctx.db
        .selectFrom('revisions')
        .select(['ops', 'inverse'])
        .where('page_id', '=', fx.page.id)
        .execute()

      expect(rows).toHaveLength(1)
      expect(rows[0]?.ops).toEqual(ops)
      expect(rows[0]?.inverse).toEqual(outcome.inverse)
    })
  })

  it('inverse를 적용하면 원래 문서로 정확히 돌아온다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      const before = fx.page.schema as PageDocument

      const outcome = await applyEdit(ctx.db, {
        projectId: fx.project.id,
        pageId: fx.page.id,
        baseSeq: 0,
        ops: [seedOp()],
        actor: actorFor(fx.owner.user),
      })
      if (!outcome.ok) throw new Error(`편집이 실패했습니다: ${JSON.stringify(outcome)}`)

      const restored = applyOps(outcome.schema, outcome.inverse)
      expect(restored).toEqual(before)
    })
  })

  it('없는 페이지는 not-found다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)

      const outcome = await applyEdit(ctx.db, {
        projectId: project.id,
        pageId: NONEXISTENT_UUID,
        baseSeq: 0,
        ops: [],
        actor: actorFor(owner.user),
      })

      expect(outcome).toEqual({ ok: false, reason: 'not-found' })
    })
  })

  it('다른 프로젝트의 페이지는 not-found다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      const otherProject = await createProject(ctx, fx.owner.cookie)

      const outcome = await applyEdit(ctx.db, {
        projectId: otherProject.id,
        pageId: fx.page.id,
        baseSeq: 0,
        ops: [],
        actor: actorFor(fx.owner.user),
      })

      expect(outcome).toEqual({ ok: false, reason: 'not-found' })
    })
  })

  it('baseSeq가 낡으면 stale이고 현재 head_seq를 알려준다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      const edit1 = await seed(ctx, fx)

      const edit2 = await applyEdit(ctx.db, {
        projectId: fx.project.id,
        pageId: fx.page.id,
        baseSeq: edit1.seq,
        ops: [{ op: 'replace', path: '/root/children/0/props/content', value: '수정' }],
        actor: actorFor(fx.owner.user),
      })
      if (!edit2.ok) throw new Error(`두 번째 편집이 실패했습니다: ${JSON.stringify(edit2)}`)

      const stale = await applyEdit(ctx.db, {
        projectId: fx.project.id,
        pageId: fx.page.id,
        // 이미 seq 2까지 진행했는데 여전히 1을 baseSeq로 보낸다 — 낡은 클라이언트.
        baseSeq: 1,
        ops: [{ op: 'replace', path: '/root/children/0/props/content', value: '다른수정' }],
        actor: actorFor(fx.owner.user),
      })

      expect(stale).toEqual({ ok: false, reason: 'stale', headSeq: 2 })
    })
  })

  it('baseSeq가 앞서 있어도 stale이다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)

      const outcome = await applyEdit(ctx.db, {
        projectId: fx.project.id,
        pageId: fx.page.id,
        baseSeq: 5,
        ops: [seedOp()],
        actor: actorFor(fx.owner.user),
      })

      expect(outcome).toEqual({ ok: false, reason: 'stale', headSeq: 0 })
    })
  })

  it('stale이면 아무것도 쓰지 않는다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      const edit1 = await seed(ctx, fx)

      const edit2 = await applyEdit(ctx.db, {
        projectId: fx.project.id,
        pageId: fx.page.id,
        baseSeq: edit1.seq,
        ops: [{ op: 'replace', path: '/root/children/0/props/content', value: '수정' }],
        actor: actorFor(fx.owner.user),
      })
      if (!edit2.ok) throw new Error(`두 번째 편집이 실패했습니다: ${JSON.stringify(edit2)}`)

      const stale = await applyEdit(ctx.db, {
        projectId: fx.project.id,
        pageId: fx.page.id,
        baseSeq: 1,
        ops: [{ op: 'replace', path: '/root/children/0/props/content', value: '다른수정' }],
        actor: actorFor(fx.owner.user),
      })
      expect(stale.ok).toBe(false)

      const row = await ctx.db.selectFrom('pages').select('head_seq').where('id', '=', fx.page.id).executeTakeFirstOrThrow()
      expect(Number(row.head_seq)).toBe(2)

      const revisions = await ctx.db.selectFrom('revisions').select('id').where('page_id', '=', fx.page.id).execute()
      expect(revisions).toHaveLength(2)
    })
  })

  it('없는 경로를 replace하면 patch-failed다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      const edit1 = await seed(ctx, fx)
      const path = '/root/children/99/props/x'

      const outcome = await applyEdit(ctx.db, {
        projectId: fx.project.id,
        pageId: fx.page.id,
        baseSeq: edit1.seq,
        ops: [{ op: 'replace', path, value: 'x' }],
        actor: actorFor(fx.owner.user),
      })

      expect(outcome.ok).toBe(false)
      if (!outcome.ok && outcome.reason === 'patch-failed') {
        expect(outcome.path).toBe(path)
      } else {
        throw new Error(`patch-failed를 기대했지만 실제로는 ${JSON.stringify(outcome)}`)
      }
    })
  })

  it('patch-failed면 아무것도 쓰지 않는다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      const edit1 = await seed(ctx, fx)

      const before = await ctx.db.selectFrom('pages').select('head_seq').where('id', '=', fx.page.id).executeTakeFirstOrThrow()

      const outcome = await applyEdit(ctx.db, {
        projectId: fx.project.id,
        pageId: fx.page.id,
        baseSeq: edit1.seq,
        ops: [{ op: 'replace', path: '/root/children/99/props/x', value: 'x' }],
        actor: actorFor(fx.owner.user),
      })
      expect(outcome.ok).toBe(false)

      const after = await ctx.db.selectFrom('pages').select('head_seq').where('id', '=', fx.page.id).executeTakeFirstOrThrow()
      expect(Number(after.head_seq)).toBe(Number(before.head_seq))

      const revisions = await ctx.db.selectFrom('revisions').select('id').where('page_id', '=', fx.page.id).execute()
      expect(revisions).toHaveLength(1)
    })
  })

  it('카탈로그를 위반하면 invalid다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      const edit1 = await seed(ctx, fx)

      const outcome = await applyEdit(ctx.db, {
        projectId: fx.project.id,
        pageId: fx.page.id,
        baseSeq: edit1.seq,
        ops: [{ op: 'add', path: '/root/children/1', value: { id: 'n_bogus00001', type: 'Bogus' } }],
        actor: actorFor(fx.owner.user),
      })

      expect(outcome.ok).toBe(false)
      if (!outcome.ok && outcome.reason === 'invalid') {
        expect(outcome.issues[0]?.code).toBe('unknown-type')
      } else {
        throw new Error(`invalid를 기대했지만 실제로는 ${JSON.stringify(outcome)}`)
      }
    })
  })

  it('invalid면 아무것도 쓰지 않는다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      const edit1 = await seed(ctx, fx)

      const before = await ctx.db
        .selectFrom('pages')
        .select(['head_seq', 'schema'])
        .where('id', '=', fx.page.id)
        .executeTakeFirstOrThrow()

      const outcome = await applyEdit(ctx.db, {
        projectId: fx.project.id,
        pageId: fx.page.id,
        baseSeq: edit1.seq,
        ops: [{ op: 'add', path: '/root/children/1', value: { id: 'n_bogus00002', type: 'Bogus' } }],
        actor: actorFor(fx.owner.user),
      })
      expect(outcome.ok).toBe(false)

      const after = await ctx.db
        .selectFrom('pages')
        .select(['head_seq', 'schema'])
        .where('id', '=', fx.page.id)
        .executeTakeFirstOrThrow()

      expect(Number(after.head_seq)).toBe(Number(before.head_seq))
      expect(after.schema).toEqual(before.schema)
    })
  })

  it('NUL이 결과 문서에 들어가면 nul-byte다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      const edit1 = await seed(ctx, fx)
      const nul = String.fromCharCode(0)

      const outcome = await applyEdit(ctx.db, {
        projectId: fx.project.id,
        pageId: fx.page.id,
        baseSeq: edit1.seq,
        ops: [{ op: 'replace', path: '/root/children/0/props/content', value: `a${nul}b` }],
        actor: actorFor(fx.owner.user),
      })

      expect(outcome).toEqual({ ok: false, reason: 'nul-byte' })
    })
  })

  it('NUL이 ops에만 있고 문서에 안 남아도 nul-byte다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      const edit1 = await seed(ctx, fx)
      const nul = String.fromCharCode(0)

      // add로 NUL이 든 값을 넣고 같은 요청의 remove로 바로 되돌린다 — 결과 문서
      // (after)에는 NUL이 전혀 남지 않지만, ops 자체는 jsonb로 그대로 저장되므로
      // 저장 시점에 22P05로 죽는다. 결과 문서만 검사하면 이 케이스를 놓친다(D8).
      const ops: PatchOp[] = [
        { op: 'add', path: '/root/children/1', value: { id: 'n_niltemp001', type: 'Text', props: { content: `x${nul}y` } } },
        { op: 'remove', path: '/root/children/1' },
      ]

      const outcome = await applyEdit(ctx.db, {
        projectId: fx.project.id,
        pageId: fx.page.id,
        baseSeq: edit1.seq,
        ops,
        actor: actorFor(fx.owner.user),
      })

      expect(outcome).toEqual({ ok: false, reason: 'nul-byte' })
    })
  })

  it('지원하지 않는 버전이 저장돼 있으면 unsupported-version이다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)

      // 관례(제약 위반 가능 경로)에 따라 withTransaction으로 감싸 직접 심는다.
      await withTransaction(ctx.db, (trx) =>
        trx
          .updateTable('pages')
          .set({ schema: JSON.stringify({ version: 999, root: { id: 'n_root', type: 'Page', children: [] } }) })
          .where('id', '=', fx.page.id)
          .execute(),
      )

      const outcome = await applyEdit(ctx.db, {
        projectId: fx.project.id,
        pageId: fx.page.id,
        baseSeq: 0,
        ops: [seedOp()],
        actor: actorFor(fx.owner.user),
      })

      expect(outcome.ok).toBe(false)
      if (!outcome.ok) {
        expect(outcome.reason).toBe('unsupported-version')
      }
    })
  })

  it('actor 정보가 revision에 그대로 남는다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      const actor: RevisionActor = { type: 'user', id: fx.owner.user.id, label: '홍길동' }

      const outcome = await applyEdit(ctx.db, {
        projectId: fx.project.id,
        pageId: fx.page.id,
        baseSeq: 0,
        ops: [seedOp()],
        actor,
      })
      if (!outcome.ok) throw new Error(`편집이 실패했습니다: ${JSON.stringify(outcome)}`)

      const row = await ctx.db
        .selectFrom('revisions')
        .select(['actor_type', 'actor_id', 'actor_label'])
        .where('page_id', '=', fx.page.id)
        .executeTakeFirstOrThrow()

      expect(row.actor_type).toBe('user')
      expect(row.actor_id).toBe(fx.owner.user.id)
      expect(row.actor_label).toBe('홍길동')
    })
  })

  it('ops가 빈 배열이어도 revision을 남긴다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)

      const outcome = await applyEdit(ctx.db, {
        projectId: fx.project.id,
        pageId: fx.page.id,
        baseSeq: 0,
        ops: [],
        actor: actorFor(fx.owner.user),
      })

      if (!outcome.ok) throw new Error(`편집이 실패했습니다: ${JSON.stringify(outcome)}`)
      expect(outcome.seq).toBe(1)
      expect(outcome.inverse).toEqual([])

      const revisions = await ctx.db.selectFrom('revisions').select('id').where('page_id', '=', fx.page.id).execute()
      expect(revisions).toHaveLength(1)
    })
  })
})
