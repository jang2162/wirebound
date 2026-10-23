import { describe, expect, it } from 'vitest'
import { CURRENT_DOCUMENT_VERSION, applyOps, type PageDocument, type PatchOp } from '@wirebound/schema'
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
 * 테스트다 — HTTP·WebSocket 핸들러의 매핑과 파이프라인 규칙을
 * 분리해서 검사하기 위해서다.
 *
 * 공통 픽스처(`setup`)는 사용자·프로젝트·메뉴·페이지를 만든다. 기본 페이지는
 * `{ version: 3, root: { id, type: 'Page', children: [] } }`이므로 대부분의
 * 케이스는 먼저 `add /root/children/0`으로 Text 노드를 넣은 상태(`seed`)에서
 * 시작한다. 그 준비 자체도 `applyEdit`으로 한다 — 준비가 성공한다는 사실 자체가
 * 이미 «첫 편집은 seq 1을 받는다»의 신호와 같다.
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
        .select(['schema', 'head_seq', 'schema_version'])
        .where('id', '=', fx.page.id)
        .executeTakeFirstOrThrow()

      expect(row.schema).toEqual(outcome.schema)
      expect(Number(row.head_seq)).toBe(outcome.seq)

      // schemaVersion은 after.version에서 파생돼야 한다 — 저장된 schema_version
      // 컬럼(locked.schemaVersion)을 그대로 흘려보내면 마이그레이션이 버전을 올리는
      // 순간 두 값이 어긋난다. MIGRATIONS가 비어 있는 동안은 두 값이 우연히 같으므로
      // 이 단언만으로는 파생 여부를 못 가른다 — outcome.schema.version과의 일치,
      // 그리고 실제로 저장된 schema_version 컬럼과의 일치를 함께 고정해 둔다.
      expect(outcome.schemaVersion).toBe(outcome.schema.version)
      expect(row.schema_version).toBe(outcome.schemaVersion)
    })
  })

  it('schemaVersion은 저장된 schema_version 컬럼이 아니라 결과 문서의 version에서 나온다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)

      // **가르는 것은 단언이 아니라 픽스처다.** 바로 위 테스트가 이미
      // `outcome.schemaVersion === outcome.schema.version`을 단언하지만, `MIGRATIONS`가
      // 비어 있는 동안은 저장된 `schema_version` 컬럼과 문서 `version`이 항상 같은
      // 값이라 파이프라인이 어느 쪽에서 파생시켜도 그 단언이 통과한다.
      //
      // `pages.schema_version`에는 문서 `version`과 값을 묶는 제약이 없다
      // (마이그레이션 0004: 그냥 `integer NOT NULL`). 그래서 두 값을 일부러 갈라
      // 둘 수 있다 — 마이그레이션이 실제로 버전을 올리기 시작했을 때 벌어질 상황을
      // 미리 만드는 것이다.
      await withTransaction(ctx.db, (trx) => trx.updateTable('pages').set({ schema_version: 7 }).where('id', '=', fx.page.id).execute())

      const outcome = await applyEdit(ctx.db, {
        projectId: fx.project.id,
        pageId: fx.page.id,
        baseSeq: 0,
        ops: [seedOp()],
        actor: actorFor(fx.owner.user),
      })
      if (!outcome.ok) throw new Error(`편집이 실패했습니다: ${JSON.stringify(outcome)}`)

      // 저장된 문서 자체의 버전은 1 그대로다 — 컬럼만 갈라 둔 것이므로.
      expect(outcome.schema.version).toBe(CURRENT_DOCUMENT_VERSION)
      // `locked.schemaVersion`을 흘려보내면 여기가 7이 된다.
      expect(outcome.schemaVersion).toBe(CURRENT_DOCUMENT_VERSION)

      // 응답값뿐 아니라 저장까지 본다 — `writePageSchemaAtSeq`에 넘기는 버전도 같은
      // 곳에서 나와야 한다. 컬럼이 7로 남으면 그 다음 GET부터 응답의 `schemaVersion`이
      // 문서 `version`과 어긋난다.
      const row = await ctx.db.selectFrom('pages').select('schema_version').where('id', '=', fx.page.id).executeTakeFirstOrThrow()
      expect(row.schema_version).toBe(CURRENT_DOCUMENT_VERSION)
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

      const rows = await ctx.db.selectFrom('revisions').select(['id', 'ops', 'inverse']).where('page_id', '=', fx.page.id).execute()

      expect(rows).toHaveLength(1)
      expect(rows[0]?.id).toBe(outcome.revisionId)
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

      const before = await ctx.db.selectFrom('pages').select(['head_seq', 'schema']).where('id', '=', fx.page.id).executeTakeFirstOrThrow()

      const outcome = await applyEdit(ctx.db, {
        projectId: fx.project.id,
        pageId: fx.page.id,
        baseSeq: edit1.seq,
        ops: [{ op: 'add', path: '/root/children/1', value: { id: 'n_bogus00002', type: 'Bogus' } }],
        actor: actorFor(fx.owner.user),
      })
      expect(outcome.ok).toBe(false)

      const after = await ctx.db.selectFrom('pages').select(['head_seq', 'schema']).where('id', '=', fx.page.id).executeTakeFirstOrThrow()

      expect(Number(after.head_seq)).toBe(Number(before.head_seq))
      expect(after.schema).toEqual(before.schema)

      // «stale이면 아무것도 쓰지 않는다»·«patch-failed면 아무것도 쓰지 않는다»와 대칭으로 revisions 행 수도 확인한다 —
      // head_seq·schema만 보면 insertRevision만 validatePage보다 앞으로 옮겨져도
      // (그래서 append-only 로그에 고아 행이 남아도) 이 테스트는 초록인 채로
      // 통과해 버린다.
      const revisions = await ctx.db.selectFrom('revisions').select('id').where('page_id', '=', fx.page.id).execute()
      expect(revisions).toHaveLength(1)
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
      // 저장 시점에 22P05로 죽는다. 결과 문서만 검사하면 이 케이스를 놓친다.
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

  it('ops가 /version을 직접 바꾸면 invalid다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      const edit1 = await seed(ctx, fx)

      // version은 마이그레이션이 소유하는 필드다. validatePage는 이 필드의 값
      // 자체(양의 정수)만 보고 "편집으로 바뀌었는가"는 보지 않으므로, 이 케이스는
      // validatePage만으로는 안 잡히고 before.version과의 비교가 있어야 잡힌다.
      // 저장됐다면 다음 읽기부터 migrateDocument가 던져 페이지가 영구히 막힌다.
      const outcome = await applyEdit(ctx.db, {
        projectId: fx.project.id,
        pageId: fx.page.id,
        baseSeq: edit1.seq,
        ops: [{ op: 'replace', path: '/version', value: CURRENT_DOCUMENT_VERSION + 1 }],
        actor: actorFor(fx.owner.user),
      })

      expect(outcome.ok).toBe(false)
      if (!outcome.ok && outcome.reason === 'invalid') {
        expect(outcome.issues[0]?.path).toBe('/version')
      } else {
        throw new Error(`invalid를 기대했지만 실제로는 ${JSON.stringify(outcome)}`)
      }
    })
  })

  it('/version을 바꾸는 편집이 거부되면 아무것도 쓰지 않는다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      const edit1 = await seed(ctx, fx)

      const before = await ctx.db.selectFrom('pages').select(['head_seq', 'schema']).where('id', '=', fx.page.id).executeTakeFirstOrThrow()

      const outcome = await applyEdit(ctx.db, {
        projectId: fx.project.id,
        pageId: fx.page.id,
        baseSeq: edit1.seq,
        ops: [{ op: 'replace', path: '/version', value: CURRENT_DOCUMENT_VERSION + 1 }],
        actor: actorFor(fx.owner.user),
      })
      expect(outcome.ok).toBe(false)

      const after = await ctx.db.selectFrom('pages').select(['head_seq', 'schema']).where('id', '=', fx.page.id).executeTakeFirstOrThrow()

      expect(Number(after.head_seq)).toBe(Number(before.head_seq))
      expect(after.schema).toEqual(before.schema)

      const revisions = await ctx.db.selectFrom('revisions').select('id').where('page_id', '=', fx.page.id).execute()
      expect(revisions).toHaveLength(1)
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
