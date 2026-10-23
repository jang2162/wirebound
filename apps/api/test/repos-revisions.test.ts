import { describe, expect, it } from 'vitest'
import type { PageDocument, PatchOp } from '@wirebound/schema'
import { lockPageForEdit, writePageSchemaAtSeq } from '../src/repos/pages'
import { insertRevision, listRevisions, type RevisionActor } from '../src/repos/revisions'
import { addMember, createMenuNode, createPage, createProject, getTestDb, signup, withApi } from './helpers'

/** 존재하지 않는(그리고 문법적으로 유효한) uuid. `menu.test.ts`·`projects.test.ts`와 같은 관례. */
const NONEXISTENT_UUID = '00000000-0000-0000-0000-000000000000'

function actorFor(user: { id: string; name: string }): RevisionActor {
  return { type: 'user', id: user.id, label: user.name }
}

/**
 * 저장소 함수(`repos/revisions.ts`·`repos/pages.ts`의 편집용 함수)를 라우트 없이
 * 직접 부르는 테스트다. `withApi`로 감싸 테스트마다 롤백되는 트랜잭션 위에서
 * `signup`/`createProject`/`createMenuNode`/`createPage` 픽스처로 페이지를 만든다.
 */
describe('repos/revisions', () => {
  it('insertRevision은 넣은 값을 그대로 돌려준다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const menu = await createMenuNode(ctx, owner.cookie, project.id)
      const page = await createPage(ctx, owner.cookie, project.id, menu.id)

      const ops: PatchOp[] = [{ op: 'replace', path: '/root/props/title', value: '새 제목' }]
      const inverse: PatchOp[] = [{ op: 'replace', path: '/root/props/title', value: '이전 제목' }]

      const record = await insertRevision(ctx.db, {
        pageId: page.id,
        seq: 1,
        actor: actorFor(owner.user),
        ops,
        inverse,
      })

      expect(typeof record.id).toBe('string')
      // seq는 pg가 문자열로 주는 bigint 컬럼이지만, 저장소 경계에서 number로
      // 바뀌어야 한다 — 이 단언이 그 변환이 실제로 일어났는지를 고정한다
      // (`Number()` 변환을 빼먹으면 여기서 '1' !== 1로 실패한다).
      expect(record.seq).toBe(1)
      expect(typeof record.seq).toBe('number')
      expect(record.actorType).toBe('user')
      expect(record.actorId).toBe(owner.user.id)
      expect(record.actorLabel).toBe(owner.user.name)
      expect(record.ops).toEqual(ops)
      expect(record.inverse).toEqual(inverse)
      expect(record.createdAt).toBeInstanceOf(Date)
    })
  })

  it('insertRevision이 넣은 ops·inverse는 조회 시 배열로 돌아온다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const menu = await createMenuNode(ctx, owner.cookie, project.id)
      const page = await createPage(ctx, owner.cookie, project.id, menu.id)

      // 원시값뿐 아니라 중첩 객체·배열·유니코드까지 왕복하는지 보려고 일부러
      // 구조를 갖춘 값을 쓴다 — 배열 길이나 타입만 확인하면 jsonb 캐스팅이
      // 값을 문자열로 뭉개도(또는 얕은 필드만 남겨도) 놓친다.
      const ops: PatchOp[] = [
        { op: 'add', path: '/root/children/0', value: { id: 'n_abc123def456', type: 'Text', props: { text: '안녕' } } },
      ]
      const inverse: PatchOp[] = [{ op: 'remove', path: '/root/children/0' }]

      await insertRevision(ctx.db, { pageId: page.id, seq: 1, actor: actorFor(owner.user), ops, inverse })

      const [revision] = await listRevisions(ctx.db, page.id, { limit: 10 })
      expect(revision).toBeDefined()
      expect(revision?.ops).toEqual(ops)
      expect(revision?.inverse).toEqual(inverse)
      expect(Array.isArray(revision?.ops)).toBe(true)
      expect(Array.isArray(revision?.inverse)).toBe(true)
    })
  })

  it('insertRevision이 (page_id, seq) UNIQUE 위반으로 실패해도, withTransaction의 세이브포인트가 바깥 트랜잭션을 지킨다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const menu = await createMenuNode(ctx, owner.cookie, project.id)
      const page = await createPage(ctx, owner.cookie, project.id, menu.id)
      const actor = actorFor(owner.user)

      await insertRevision(ctx.db, { pageId: page.id, seq: 1, actor, ops: [], inverse: [] })

      // 같은 (page_id, seq)로 다시 넣어 실제 23505 UNIQUE 위반을 일으킨다.
      await expect(insertRevision(ctx.db, { pageId: page.id, seq: 1, actor, ops: [], inverse: [] })).rejects.toThrow()

      // 세이브포인트가 실제로 트랜잭션을 지켰다는 유일한 증거: 같은 withApi
      // 트랜잭션 위에서 던진 이후 쿼리가 25P02 없이 성공한다. "실패한다"만
      // 확인하고 끝내면 insertRevision이 withTransaction으로 감싸져 있든
      // 아니든 통과한다(위반 자체는 어느 쪽이든 던진다) — 판별력은 전적으로
      // 그 다음 쿼리가 사는가에 있다.
      const rows = await ctx.db.selectFrom('revisions').select('seq').where('page_id', '=', page.id).execute()
      expect(rows).toHaveLength(1)
    })
  })

  it('listRevisions는 seq 내림차순이다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const menu = await createMenuNode(ctx, owner.cookie, project.id)
      const page = await createPage(ctx, owner.cookie, project.id, menu.id)
      const actor = actorFor(owner.user)

      // 삽입 순서(2, 3, 1)를 기대하는 정렬 순서(3, 2, 1)와 일부러 어긋나게 만든다.
      // ORDER BY 절을 지워도 Postgres가 우연히 삽입 순서로 돌려주면 이 테스트가
      // 통과해 버리는 함정을 피하기 위해서다(`menu.test.ts`와 같은 관례).
      for (const seq of [2, 3, 1]) {
        await insertRevision(ctx.db, { pageId: page.id, seq, actor, ops: [], inverse: [] })
      }

      const revisions = await listRevisions(ctx.db, page.id, { limit: 10 })
      expect(revisions.map((r) => r.seq)).toEqual([3, 2, 1])
    })
  })

  it('listRevisions는 limit을 지킨다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const menu = await createMenuNode(ctx, owner.cookie, project.id)
      const page = await createPage(ctx, owner.cookie, project.id, menu.id)
      const actor = actorFor(owner.user)

      // 순서(2, 5, 1, 4, 3)로 삽입한다 — 삽입 순서의 앞 두 개
      // (2, 5)가 기대하는 정렬 결과의 앞 두 개(5, 4)와 다르므로, LIMIT과 ORDER BY
      // 둘 중 하나라도 빠지면 이 단언이 반드시 깨진다.
      for (const seq of [2, 5, 1, 4, 3]) {
        await insertRevision(ctx.db, { pageId: page.id, seq, actor, ops: [], inverse: [] })
      }

      const revisions = await listRevisions(ctx.db, page.id, { limit: 2 })
      expect(revisions).toHaveLength(2)
      expect(revisions.map((r) => r.seq)).toEqual([5, 4])
    })
  })

  it('listRevisions의 actorId는 그 사용자 것만 고른다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const other = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      await addMember(ctx, project.id, other.user.id, 'editor')
      const menu = await createMenuNode(ctx, owner.cookie, project.id)
      const page = await createPage(ctx, owner.cookie, project.id, menu.id)

      await insertRevision(ctx.db, { pageId: page.id, seq: 1, actor: actorFor(owner.user), ops: [], inverse: [] })
      await insertRevision(ctx.db, { pageId: page.id, seq: 2, actor: actorFor(other.user), ops: [], inverse: [] })
      await insertRevision(ctx.db, { pageId: page.id, seq: 3, actor: actorFor(owner.user), ops: [], inverse: [] })

      const ownerRevisions = await listRevisions(ctx.db, page.id, { actorId: owner.user.id, limit: 10 })
      expect(ownerRevisions.map((r) => r.seq)).toEqual([3, 1])

      const otherRevisions = await listRevisions(ctx.db, page.id, { actorId: other.user.id, limit: 10 })
      expect(otherRevisions.map((r) => r.seq)).toEqual([2])
    })
  })

  it('listRevisions는 actorId가 없으면 모든 액터의 revision을 돌려준다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const other = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      await addMember(ctx, project.id, other.user.id, 'editor')
      const menu = await createMenuNode(ctx, owner.cookie, project.id)
      const page = await createPage(ctx, owner.cookie, project.id, menu.id)

      await insertRevision(ctx.db, { pageId: page.id, seq: 1, actor: actorFor(owner.user), ops: [], inverse: [] })
      await insertRevision(ctx.db, { pageId: page.id, seq: 2, actor: actorFor(other.user), ops: [], inverse: [] })

      const all = await listRevisions(ctx.db, page.id, { limit: 10 })
      expect(all.map((r) => r.seq)).toEqual([2, 1])
    })
  })

  it('listRevisions는 다른 페이지의 revision을 섞지 않는다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const menu = await createMenuNode(ctx, owner.cookie, project.id)
      const pageA = await createPage(ctx, owner.cookie, project.id, menu.id)
      const pageB = await createPage(ctx, owner.cookie, project.id, menu.id)
      const actor = actorFor(owner.user)

      // 두 페이지 모두 seq 1을 쓴다 — (page_id, seq) UNIQUE가 페이지별이라
      // 충돌하지 않는다는 사실도 함께 확인한다.
      await insertRevision(ctx.db, { pageId: pageA.id, seq: 1, actor, ops: [], inverse: [] })
      await insertRevision(ctx.db, { pageId: pageB.id, seq: 1, actor, ops: [], inverse: [] })
      await insertRevision(ctx.db, { pageId: pageA.id, seq: 2, actor, ops: [], inverse: [] })

      const revisionsA = await listRevisions(ctx.db, pageA.id, { limit: 10 })
      expect(revisionsA.map((r) => r.seq)).toEqual([2, 1])

      const revisionsB = await listRevisions(ctx.db, pageB.id, { limit: 10 })
      expect(revisionsB.map((r) => r.seq)).toEqual([1])
    })
  })

  it('lockPageForEdit은 다른 프로젝트의 페이지에 null을 준다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const otherProject = await createProject(ctx, owner.cookie)
      const menu = await createMenuNode(ctx, owner.cookie, project.id)
      const page = await createPage(ctx, owner.cookie, project.id, menu.id)

      const locked = await lockPageForEdit(ctx.db, otherProject.id, page.id)
      expect(locked).toBeNull()

      // 같은 페이지를 정확한 projectId로 잠그면 실제로 찾아진다는 것도 함께
      // 확인한다 — 위 단언만 있으면 "항상 null을 준다"는 퇴행도 통과해 버린다.
      const correctlyLocked = await lockPageForEdit(ctx.db, project.id, page.id)
      expect(correctlyLocked).not.toBeNull()
      expect(correctlyLocked?.id).toBe(page.id)
    })
  })

  it('lockPageForEdit이 준 headSeq는 number다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const menu = await createMenuNode(ctx, owner.cookie, project.id)
      const page = await createPage(ctx, owner.cookie, project.id, menu.id)

      const locked = await lockPageForEdit(ctx.db, project.id, page.id)
      expect(locked).not.toBeNull()
      expect(typeof locked?.headSeq).toBe('number')
      expect(locked?.headSeq).toBe(0)
    })
  })

  it('writePageSchemaAtSeq는 schema·schema_version·head_seq·structure_seq·updated_at을 함께 갱신한다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const menu = await createMenuNode(ctx, owner.cookie, project.id)
      const page = await createPage(ctx, owner.cookie, project.id, menu.id)

      const before = await ctx.db.selectFrom('pages').select(['updated_at']).where('id', '=', page.id).executeTakeFirstOrThrow()

      const newSchema: PageDocument = {
        version: 3,
        root: { id: 'n_root000001', type: 'Page', children: [{ id: 'n_child00001', type: 'Text', props: { text: '새 내용' } }] },
      }

      await writePageSchemaAtSeq(ctx.db, page.id, newSchema, 2, 5, 3)

      const after = await ctx.db
        .selectFrom('pages')
        .select(['schema', 'schema_version', 'head_seq', 'structure_seq', 'updated_at'])
        .where('id', '=', page.id)
        .executeTakeFirstOrThrow()

      expect(after.schema).toEqual(newSchema)
      expect(after.schema_version).toBe(2)
      expect(Number(after.head_seq)).toBe(5)
      expect(Number(after.structure_seq)).toBe(3)
      expect(after.updated_at.getTime()).toBeGreaterThanOrEqual(before.updated_at.getTime())
    })
  })

  it('writePageSchemaAtSeq는 title·menu_node_id를 건드리지 않는다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const menu = await createMenuNode(ctx, owner.cookie, project.id)
      const page = await createPage(ctx, owner.cookie, project.id, menu.id, { title: '원래 제목' })

      const newSchema: PageDocument = { version: 3, root: { id: 'n_root000002', type: 'Page', children: [] } }
      await writePageSchemaAtSeq(ctx.db, page.id, newSchema, 1, 1, 1)

      const after = await ctx.db.selectFrom('pages').select(['title', 'menu_node_id']).where('id', '=', page.id).executeTakeFirstOrThrow()

      expect(after.title).toBe('원래 제목')
      expect(after.menu_node_id).toBe(menu.id)
    })
  })

  it('writePageSchemaAtSeq가 NUL 문자로 인한 22P05로 실패해도, withTransaction의 세이브포인트가 바깥 트랜잭션을 지킨다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const menu = await createMenuNode(ctx, owner.cookie, project.id)
      const page = await createPage(ctx, owner.cookie, project.id, menu.id)

      // 애플리케이션 경계의 사전 필터(containsNulByte — routes/pages.ts의 3.5단계와
      // 파이프라인 8단계)를 우회해 저장소 함수를 직접 부른다 — schema::jsonb 캐스팅
      // 자체가 22P05로 죽는지 실측한다. 라우트를 거치면 NUL 문서가 DB까지 도달할
      // 방법이 없으므로, 이 함수를 감싼 withTransaction이 실제로 바깥 트랜잭션을
      // 지키는지는 이렇게 계층을 건너뛰어야만 확인할 수 있다.
      // NUL 문자를 소스에 직접 타이핑하지 않는 이유는 db/nul-guard.ts의
      // 헤더 주석이 설명한다 — String.fromCharCode(0)으로 런타임에 만든다.
      const nul = String.fromCharCode(0)
      const docWithNul: PageDocument = {
        version: 3,
        root: { id: 'n_root', type: 'Page', children: [{ id: 'n_text', type: 'Text', props: { content: `a${nul}b` } }] },
      }

      // `rejects.toThrow()`만 두면 **22P05가 아닌 이유로 실패해도 통과한다** — 예컨대
      // 이 함수 맨 앞의 `isTransaction` 가드가 던지는 에러도 rejection이다. 그러면
      // 이 테스트 이름이 주장하는 "NUL 문자로 인한 22P05"가 실제로 일어났는지는
      // 아무도 확인하지 않는다. pg 에러의 SQLSTATE는 message가 아니라 `code`에
      // 실리므로(message는 'unsupported Unicode escape sequence'다) 코드를 단언한다.
      await expect(writePageSchemaAtSeq(ctx.db, page.id, docWithNul, 1, 1, 1)).rejects.toMatchObject({ code: '22P05' })

      // 세이브포인트가 실제로 트랜잭션을 지켰다는 유일한 증거: 같은 withApi
      // 트랜잭션 위에서 던진 이후 쿼리가 25P02 없이 성공한다. "실패한다"만
      // 확인하고 끝내면 writePageSchemaAtSeq가 withTransaction으로 감싸져
      // 있든 아니든 통과한다 — 판별력은 전적으로 그 다음 쿼리가 사는가에 있다.
      const row = await ctx.db.selectFrom('pages').select('id').where('id', '=', page.id).executeTakeFirstOrThrow()
      expect(row.id).toBe(page.id)
    })
  })

  /**
   * `lockPageForEdit`·`writePageSchemaAtSeq`는 트랜잭션 밖에서 불리면 `FOR UPDATE`
   * 잠금이 즉시 풀려 동시성 방어가 조용히 사라진다(두 함수의
   * 독스트링 참고). 그 실수를 크게 실패시키는 방어 코드가 있는지를 여기서 직접
   * 확인한다 — `getTestDb()`는 트랜잭션이 아닌 루트 핸들이다(`db.test.ts`의
   * "트랜잭션 밖에서는 새로 연다"와 같은 방법). 두 함수 모두 실제 쿼리를 날리기
   * 전에 이 검사를 하므로 존재하지 않는 id를 써도 안전하다 — DB에 아무것도
   * 쓰지 않고 즉시 던진다.
   */
  it('lockPageForEdit는 트랜잭션이 아닌 핸들로 부르면 크게 실패한다', async () => {
    const root = getTestDb()
    expect(root.isTransaction).toBe(false)
    await expect(lockPageForEdit(root, NONEXISTENT_UUID, NONEXISTENT_UUID)).rejects.toThrow()
  })

  it('writePageSchemaAtSeq는 트랜잭션이 아닌 핸들로 부르면 크게 실패한다', async () => {
    const root = getTestDb()
    expect(root.isTransaction).toBe(false)
    const schema: PageDocument = { version: 3, root: { id: 'n_guardtest01', type: 'Page', children: [] } }
    await expect(writePageSchemaAtSeq(root, NONEXISTENT_UUID, schema, 1, 1, 1)).rejects.toThrow()
  })
})
