/**
 * `repos/comments.ts` — 라우트를 지나지 않고 저장소를 직접 재는 자리
 * (`repos-layouts.test.ts`·`repos-themes.test.ts`와 같은 배치).
 *
 * **여기서만 잴 수 있는 것 둘:**
 *
 * 1. **NUL 가드가 마지막 방벽으로 실제로 선다.** 라우트가 먼저 400으로 끊으므로 HTTP
 *    경로에서는 이 가드에 도달하지 못한다 — 그래서 이 파일이 직접 부른다.
 * 2. **문서 변경과 행 삽입이 한 트랜잭션이다.** 라우트가 그것을 `withTransaction` 하나로
 *    묶는데, HTTP 경로에는 *"파이프라인은 성공했는데 삽입이 실패하는"* 입력이 없다
 *    (NUL은 라우트가 먼저 막는다). 여기서는 그 조합을 손으로 만들 수 있다.
 */
import { describe, expect, it } from 'vitest'
import { migrateDocument, type PageDocument } from '@wirebound/schema'
import { withTransaction } from '../src/db/tx'
import { findPageById } from '../src/repos/pages'
import {
  CommentNulByteError,
  countNodeComments,
  deleteComment,
  findCommentById,
  insertComment,
  listComments,
  updateCommentBody,
} from '../src/repos/comments'
import { applyEdit } from '../src/services/edit-pipeline'
import { createMenuNode, createPage, createProject, signup, withApi, type TestContext } from './helpers'

const NUL = String.fromCharCode(0)

interface Fixture {
  cookie: { wb_session: string }
  userId: string
  userName: string
  projectId: string
  pageId: string
  rootNodeId: string
}

async function setup(ctx: TestContext): Promise<Fixture> {
  const owner = await signup(ctx)
  const project = await createProject(ctx, owner.cookie)
  const menu = await createMenuNode(ctx, owner.cookie, project.id)
  const page = await createPage(ctx, owner.cookie, project.id, menu.id)

  return {
    cookie: owner.cookie,
    userId: owner.user.id,
    userName: owner.user.name,
    projectId: project.id,
    pageId: page.id,
    rootNodeId: (page.schema as { root: { id: string } }).root.id,
  }
}

async function readSchema(ctx: TestContext, fx: Fixture): Promise<PageDocument> {
  const page = await findPageById(ctx.db, fx.projectId, fx.pageId)
  if (!page) throw new Error('페이지가 사라졌다')
  return migrateDocument(page.schema)
}

describe('멱등 키의 유일 색인(0012)', () => {
  it('같은 (페이지, 작성자, 키)의 둘째 행은 들어가지 않는다 — 라우트의 확인이 빠져도 조용한 두 행이 안 된다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      const input = { pageId: fx.pageId, nodeId: fx.rootNodeId, body: '말', authorId: fx.userId, idempotencyKey: 'k' }
      await insertComment(ctx.db, input)

      await expect(withTransaction(ctx.db, (trx) => insertComment(trx, input))).rejects.toThrow(
        /comments_page_author_idempotency_key_idx/,
      )
      // 키가 없는 행은 여럿이다 — `NULL`끼리는 같은 값이 아니다.
      await insertComment(ctx.db, { ...input, idempotencyKey: undefined })
      await insertComment(ctx.db, { ...input, idempotencyKey: undefined })
      expect(await listComments(ctx.db, fx.pageId)).toHaveLength(3)
    })
  })
})

describe('NUL 가드 — 마지막 방벽', () => {
  it('삽입이 NUL을 던진다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)

      await expect(
        insertComment(ctx.db, {
          pageId: fx.pageId,
          nodeId: fx.rootNodeId,
          body: `가${NUL}나`,
          authorId: fx.userId,
        }),
      ).rejects.toBeInstanceOf(CommentNulByteError)
    })
  })

  it('갱신도 NUL을 던진다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      const created = await insertComment(ctx.db, {
        pageId: fx.pageId,
        nodeId: fx.rootNodeId,
        body: '멀쩡한 말',
        authorId: fx.userId,
      })

      await expect(
        updateCommentBody(ctx.db, fx.pageId, created.id, `가${NUL}나`),
      ).rejects.toBeInstanceOf(CommentNulByteError)
    })
  })

  it('던지는 것이 DB보다 앞이다 — 트랜잭션이 오염되지 않는다', async () => {
    // 가드가 없으면 `pg`가 `22021`을 던지고, 그러면 Postgres가 트랜잭션 전체를 aborted로
    // 만들어 **그 뒤의 아무 조회나 `25P02`로 죽는다**(`db/tx.ts`의 머리말). 가드가 앞에
    // 서면 문장 자체가 나가지 않으므로 그 오염이 성립하지 않는다.
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      await expect(
        insertComment(ctx.db, { pageId: fx.pageId, nodeId: fx.rootNodeId, body: NUL, authorId: fx.userId }),
      ).rejects.toBeInstanceOf(CommentNulByteError)

      // 같은 트랜잭션에서 이어지는 조회가 그대로 돈다.
      await expect(listComments(ctx.db, fx.pageId)).resolves.toEqual([])
    })
  })
})

describe('조회', () => {
  it('작성자 이름을 조인해서 낸다 — 스냅샷이 아니다', async () => {
    // `revisions.actor_label`과 갈리는 자리다. 이름을 바꾸면 코멘트의 이름도 바뀐다.
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      await insertComment(ctx.db, {
        pageId: fx.pageId,
        nodeId: fx.rootNodeId,
        body: '말',
        authorId: fx.userId,
      })

      const before = await listComments(ctx.db, fx.pageId)
      expect(before[0]?.authorName).toBe(fx.userName)

      await ctx.db.updateTable('users').set({ name: '바뀐 이름' }).where('id', '=', fx.userId).execute()

      const after = await listComments(ctx.db, fx.pageId)
      expect(after[0]?.authorName).toBe('바뀐 이름')
    })
  })

  it('코멘트 하나는 페이지로도 좁힌다 — id만으로 찾지 않는다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      const menu = await createMenuNode(ctx, fx.cookie, fx.projectId)
      const other = await createPage(ctx, fx.cookie, fx.projectId, menu.id)
      const created = await insertComment(ctx.db, {
        pageId: fx.pageId,
        nodeId: fx.rootNodeId,
        body: '말',
        authorId: fx.userId,
      })

      await expect(findCommentById(ctx.db, fx.pageId, created.id)).resolves.not.toBeNull()
      await expect(findCommentById(ctx.db, other.id, created.id)).resolves.toBeNull()
    })
  })

  it('노드별로 센다 — "마지막 코멘트"를 판정하는 값이다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      await insertComment(ctx.db, { pageId: fx.pageId, nodeId: 'n_a', body: '가', authorId: fx.userId })
      await insertComment(ctx.db, { pageId: fx.pageId, nodeId: 'n_a', body: '나', authorId: fx.userId })
      await insertComment(ctx.db, { pageId: fx.pageId, nodeId: 'n_b', body: '다', authorId: fx.userId })

      await expect(countNodeComments(ctx.db, fx.pageId, 'n_a')).resolves.toBe(2)
      await expect(countNodeComments(ctx.db, fx.pageId, 'n_b')).resolves.toBe(1)
      await expect(countNodeComments(ctx.db, fx.pageId, 'n_c')).resolves.toBe(0)
    })
  })

  it('삭제가 그 행의 nodeId를 돌려준다 — 지운 뒤에는 읽을 수 없다', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      const created = await insertComment(ctx.db, {
        pageId: fx.pageId,
        nodeId: 'n_a',
        body: '가',
        authorId: fx.userId,
      })

      await expect(deleteComment(ctx.db, fx.pageId, created.id)).resolves.toEqual({ nodeId: 'n_a' })
      await expect(deleteComment(ctx.db, fx.pageId, created.id)).resolves.toBe('not-found')
    })
  })
})

describe('번호와 행이 한 트랜잭션이다', () => {
  it('삽입이 실패하면 방금 붙인 번호도 되돌아간다', async () => {
    // **라우트의 `withTransaction` 하나가 이것을 지킨다.** 나누면 *"번호는 붙었는데
    // 코멘트가 없다"*(`routes/comments.ts` 머리말의 「번호는 있는데 코멘트 행이 없는 노드」)가
    // 실패 경로에서 실제로 만들어진다.
    await withApi(async (ctx) => {
      const fx = await setup(ctx)

      await expect(
        withTransaction(ctx.db, async (trx) => {
          const outcome = await applyEdit(trx, {
            projectId: fx.projectId,
            pageId: fx.pageId,
            baseSeq: 0,
            ops: [{ op: 'add', path: '/root/marker', value: 1 }],
            actor: { type: 'user', id: fx.userId, label: fx.userName },
          })
          expect(outcome.ok).toBe(true)

          // 여기서 던진다 — 라우트에서는 NUL이 이 자리에 도달하는 유일한 경로다.
          return insertComment(trx, {
            pageId: fx.pageId,
            nodeId: fx.rootNodeId,
            body: NUL,
            authorId: fx.userId,
          })
        }),
      ).rejects.toBeInstanceOf(CommentNulByteError)

      // 번호가 안 남았다.
      expect((await readSchema(ctx, fx)).root.marker).toBeUndefined()
      // revision도 안 남았다 — `head_seq`가 그대로다.
      const page = await findPageById(ctx.db, fx.projectId, fx.pageId)
      expect(page?.headSeq).toBe(0)
    })
  })

  it('성공하면 번호와 행이 함께 남는다 — 대조군', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)

      await withTransaction(ctx.db, async (trx) => {
        await applyEdit(trx, {
          projectId: fx.projectId,
          pageId: fx.pageId,
          baseSeq: 0,
          ops: [{ op: 'add', path: '/root/marker', value: 1 }],
          actor: { type: 'user', id: fx.userId, label: fx.userName },
        })
        await insertComment(trx, {
          pageId: fx.pageId,
          nodeId: fx.rootNodeId,
          body: '멀쩡한 말',
          authorId: fx.userId,
        })
      })

      expect((await readSchema(ctx, fx)).root.marker).toBe(1)
      expect(await listComments(ctx.db, fx.pageId)).toHaveLength(1)
    })
  })
})
