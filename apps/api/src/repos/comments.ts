/**
 * 코멘트 저장소. SQL만 안다 — HTTP도 zod도 편집 파이프라인도 이 파일 밖의 일이다
 * (`repos/layouts.ts`·`repos/themes.ts`와 같은 관례). API가 주고받는 키는 camelCase,
 * DB 컬럼은 snake_case이고 그 변환은 이 파일이 전담한다.
 *
 * **번호(`marker`)는 여기 없다.** 그것은 페이지 문서의 노드가 들고, 바꾸는
 * 경로는 편집 파이프라인 하나다 — 이 파일은 `node_id`로만 매여 있어 **번호를 모른다.**
 * 그래서 재번호가 문서만 바꾸고 이 표를 건드리지 않는다.
 *
 * ---
 *
 * **작성자 이름을 조인해서 낸다 — 스냅샷이 아니다.**
 *
 * `revisions.actor_label`은 편집 **시점의** 표시 이름을 박아 둔다(이력은 그때의 사실을
 * 보여야 한다). 코멘트는 반대다 — *"지금 이 말을 한 사람이 누구인가"*를 보여야 하므로
 * 이름을 바꾸면 코멘트의 이름도 함께 바뀌는 편이 맞는다. 그래서 컬럼이 아니라 조인이다.
 *
 * ---
 *
 * **NUL(U+0000)을 여기서 막는다.**
 *
 * `repos/themes.ts`와 **같은 자리이지만 원인이 다르다.** 그쪽은 절 컬럼이 `json`이라
 * DB가 삽입 시점에 안 막고 나중에 텍스트를 뽑을 때 죽는다. 여기 `body`는 `text`라
 * **DB가 삽입 시점에 막는다** — 다만 그것은 `pg` 드라이버가 던지는 raw 예외라
 * `http/error-handler.ts`가 **500**으로 낸다. 사용자가 보내온 글자 때문에 나는 실패는
 * 500(서버가 잘못했다)이 아니라 400이어야 하므로, 그 예외가 나기 전에 여기서 끊는다.
 * `routes/pages.ts`가 `PUT .../schema`에서 같은 이유로 파이프라인보다 먼저 검사하는 것과
 * 같은 판단이다.
 *
 * **막지 않으면 무엇이 나오는가**: 가드를 지우고 `body`에 NUL을 넣어
 * `POST .../comments`를 부르면 `500 internal`이다(`comments.test.ts`의
 * `본문의 NUL 문자를 400으로 막는다`가 그 구분력을 지킨다).
 */
import { sql } from 'kysely'
import type { PatchOp } from '@wirebound/schema'
import { assertLocking } from '../db/locking'
import { containsNulByte } from '../db/nul-guard'
import type { DbHandle } from '../db/tx'
import type { RevisionActorType } from '../db/types'

export interface CommentRecord {
  id: string
  pageId: string
  /** 이 코멘트가 붙은 노드의 id. `pages.schema` 안의 값이라 FK가 아니다(0008의 주석). */
  nodeId: string
  body: string
  authorId: string
  /** 조인해서 낸다 — 스냅샷이 아니다(위 머리말). */
  authorName: string
  createdAt: Date
  updatedAt: Date
}

/** 코멘트 어딘가에 NUL(U+0000)이 있을 때 던진다. 호출자가 400으로 매핑한다. */
export class CommentNulByteError extends Error {
  constructor() {
    super('코멘트에 NUL 문자(U+0000)를 포함할 수 없습니다')
    this.name = 'CommentNulByteError'
  }
}

/**
 * `comments`에서 뽑는 컬럼. **`users.name`은 여기 없다** — 조인 별칭이라 아래
 * `selectComments`가 따로 붙인다. 목록을 상수로 두는 것은 `repos/layouts.ts`·
 * `repos/themes.ts`와 같은 관례다(읽는 자리가 셋이라 흩어지면 하나만 낡는다).
 */
const COMMENT_COLUMNS = [
  'comments.id',
  'comments.page_id',
  'comments.node_id',
  'comments.body',
  'comments.author_id',
  'comments.created_at',
  'comments.updated_at',
] as const

interface CommentRow {
  id: string
  page_id: string
  node_id: string
  body: string
  author_id: string
  author_name: string
  created_at: Date
  updated_at: Date
}

function toRecord(row: CommentRow): CommentRecord {
  return {
    id: row.id,
    pageId: row.page_id,
    nodeId: row.node_id,
    body: row.body,
    authorId: row.author_id,
    authorName: row.author_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function assertNoNulByte(body: string): void {
  if (containsNulByte(body)) {
    throw new CommentNulByteError()
  }
}

/**
 * 작성자를 조인한 기본 질의. **정렬이 계약이다** — `created_at` 오름차순(먼저 단 말이
 * 먼저)이고, 같은 시각이면 `id`로 가른다.
 *
 * **2차 키가 순서를 만들어 내지는 못한다.** `id`는 랜덤 uuid라 삽입 순서와 무관하고,
 * 여기서 하는 일은 *"동률에서 결과가 매번 같다"*뿐이다. 삽입 순서를 실제로 나르는 것은
 * `created_at`이고, 그것이 `now()`가 아니라 `clock_timestamp()`인 이유가 0008의 주석에 있다.
 *
 * **번호 순으로 정렬하지 않는다** — 이 표는 번호를 모른다(위 머리말). 화면이 문서에서
 * `marker`를 읽어 묶고 번호 순으로 늘어놓는다(`apps/web/src/panels/comment-panel.tsx`).
 */
function selectComments(db: DbHandle) {
  return db
    .selectFrom('comments')
    .innerJoin('users', 'users.id', 'comments.author_id')
    .select([...COMMENT_COLUMNS, 'users.name as author_name'])
    .orderBy('comments.created_at', 'asc')
    .orderBy('comments.id', 'asc')
}

/** 그 페이지의 코멘트 전부. 없으면 빈 배열이다. */
export async function listComments(db: DbHandle, pageId: string): Promise<CommentRecord[]> {
  const rows = await selectComments(db).where('comments.page_id', '=', pageId).execute()
  return rows.map((row) => toRecord(row as CommentRow))
}

/**
 * 프로젝트의 코멘트 **전부**(스냅샷 캡처가 부른다). 페이지를 조인해 프로젝트로 좁힌다 —
 * `comments`는 `page_id`만 알고 `project_id`를 모른다(0008의 머리말: 코멘트는 페이지의
 * **노드**에 붙는다).
 *
 * **`listComments`를 페이지마다 부르지 않는 이유**는 그 형태가 페이지 수만큼 왕복을 만들고,
 * 그 왕복 사이에 다른 페이지가 바뀌면 **한 시점에 존재한 적 없는 조합**이 담기기 때문이다 —
 * 캡처가 막으려는 바로 그것이다. 한 문장이면 그 창이 이 질의 안으로 줄어든다.
 *
 * 정렬은 `selectComments`의 계약(`created_at` 오름차순, 동률은 `id`)을 그대로 쓴다.
 */
export async function listProjectComments(db: DbHandle, projectId: string): Promise<CommentRecord[]> {
  const rows = await selectComments(db)
    .innerJoin('pages', 'pages.id', 'comments.page_id')
    .where('pages.project_id', '=', projectId)
    .execute()

  return rows.map((row) => toRecord(row as CommentRow))
}

/**
 * 코멘트 하나. **`pageId`를 함께 받는다** — 경로가 `.../pages/:pageId/comments/:commentId`라
 * 남의 페이지의 코멘트 id를 실은 요청이 통하면 안 된다. id만으로 찾고 나서 비교하는 대신
 * 질의 조건에 두는 것은, 비교를 빠뜨린 판이 조용히 통과하기 때문이다.
 */
export async function findCommentById(
  db: DbHandle,
  pageId: string,
  commentId: string,
): Promise<CommentRecord | null> {
  const row = await selectComments(db)
    .where('comments.page_id', '=', pageId)
    .where('comments.id', '=', commentId)
    .executeTakeFirst()

  return row ? toRecord(row as CommentRow) : null
}

/**
 * 그 사람이 그 키로 이 페이지에 단 코멘트. 없으면 `null`이다(`0012-comment-idempotency-key`).
 *
 * **범위가 (페이지, 작성자, 키)인 것이 요점이다** — 그 마이그레이션의 머리말. 남이 같은 키를
 * 실어도 이 조회는 그 사람의 행을 찾지 않는다.
 */
export async function findCommentByIdempotencyKey(
  db: DbHandle,
  pageId: string,
  authorId: string,
  idempotencyKey: string,
): Promise<CommentRecord | null> {
  const row = await selectComments(db)
    .where('comments.page_id', '=', pageId)
    .where('comments.author_id', '=', authorId)
    .where('comments.idempotency_key', '=', idempotencyKey)
    .executeTakeFirst()

  return row ? toRecord(row as CommentRow) : null
}

/** 게시가 번호를 붙이며 만든 revision — 재생이 룸에 다시 보내는 것(`findPostRevision`). */
export interface PostRevision {
  seq: number
  ops: PatchOp[]
  actorType: RevisionActorType
  actorLabel: string
}

/**
 * 그 게시가 노드에 번호를 붙이며 만든 revision(`0015-comment-revision-seq`). 번호를 새로 붙이지 않은 게시 · 가져오기 ·
 * 복원이 넣은 행이면 `null`이다. 읽는 자리는 게시의 재생뿐이다 — COMMIT 답을 잃은 게시가 못 한 방송을 잇는다.
 */
export async function findPostRevision(db: DbHandle, pageId: string, commentId: string): Promise<PostRevision | null> {
  const row = await db
    .selectFrom('comments')
    .innerJoin('revisions', (join) =>
      join.onRef('revisions.page_id', '=', 'comments.page_id').onRef('revisions.seq', '=', 'comments.revision_seq'),
    )
    .select(['revisions.seq', 'revisions.ops', 'revisions.actor_type', 'revisions.actor_label'])
    .where('comments.page_id', '=', pageId)
    .where('comments.id', '=', commentId)
    .executeTakeFirst()

  return row ? { seq: Number(row.seq), ops: row.ops, actorType: row.actor_type, actorLabel: row.actor_label } : null
}

/**
 * 그 사람이 그 키로 이 페이지에 단 게시가 **달렸다가 지워졌는가**(`0013-comment-tombstones`).
 * 범위는 `findCommentByIdempotencyKey`와 같다 — 남의 묘비는 이 조회에 안 걸린다.
 */
export async function hasCommentTombstone(
  db: DbHandle,
  pageId: string,
  authorId: string,
  idempotencyKey: string,
): Promise<boolean> {
  const row = await db
    .selectFrom('comment_tombstones')
    .select('comment_id')
    .where('page_id', '=', pageId)
    .where('author_id', '=', authorId)
    .where('idempotency_key', '=', idempotencyKey)
    .executeTakeFirst()

  return row !== undefined
}

/**
 * 이 노드에 붙은 코멘트 수. ***"마지막 코멘트를 지우면 번호가 사라진다"*를 판정하는
 * 자리다** — 라우트가 삭제 **뒤에** 이것을 세어 0이면 문서에서 `marker`를 지운다.
 *
 * 세는 것과 지우는 것이 같은 트랜잭션 안에서 일어나야 한다(라우트가 그렇게 부른다) —
 * 아니면 그 사이에 들어온 새 코멘트가 번호 없는 채로 남는다.
 */
export async function countNodeComments(db: DbHandle, pageId: string, nodeId: string): Promise<number> {
  const row = await db
    .selectFrom('comments')
    .select((eb) => eb.fn.countAll<string>().as('count'))
    .where('page_id', '=', pageId)
    .where('node_id', '=', nodeId)
    .executeTakeFirstOrThrow()

  // `count(*)`는 int8이라 `pg`가 문자열로 준다(`revisions.seq`와 같은 비대칭).
  return Number(row.count)
}

/**
 * 코멘트를 만든다.
 *
 * **삽입과 조회가 두 문장인 것은 조인 때문이다.** `RETURNING`은 삽입한 테이블의 컬럼만
 * 낼 수 있어 `users.name`을 함께 받을 수 없다. 라우트가 아는 `currentUser.name`을 그대로
 * 실어 한 문장으로 줄일 수도 있지만, 그러면 **읽기 경로와 쓰기 경로가 이름을 서로 다른
 * 곳에서 얻게 되고** 둘이 갈리는 날 아무도 모른다 — 이 파일이 조립을 독점하는 이유
 * (`repos/themes.ts`의 머리말)와 같다.
 */
export async function insertComment(
  db: DbHandle,
  input: { pageId: string; nodeId: string; body: string; authorId: string; idempotencyKey?: string; revisionSeq?: number },
): Promise<CommentRecord> {
  assertNoNulByte(input.body)

  const inserted = await db
    .insertInto('comments')
    .values({
      page_id: input.pageId,
      node_id: input.nodeId,
      body: input.body,
      author_id: input.authorId,
      // 없으면 키를 만들지 않는다 — 컬럼의 기본값(`NULL`)이 «키 없는 게시»다(0012).
      ...(input.idempotencyKey === undefined ? {} : { idempotency_key: input.idempotencyKey }),
      // 번호를 붙인 게시만 싣는다 — 그 revision 을 재생이 다시 보낸다(0015).
      ...(input.revisionSeq === undefined ? {} : { revision_seq: input.revisionSeq }),
    })
    .returning('id')
    .executeTakeFirstOrThrow()

  const record = await findCommentById(db, input.pageId, inserted.id)
  if (record === null) {
    // 방금 같은 트랜잭션에서 넣은 행이 안 보인다면 그것 자체가 버그다. 조용히
    // `null`을 흘리면 라우트가 그것을 404로 옮겨 "만들었는데 없다"가 된다.
    throw new Error('방금 만든 코멘트를 다시 읽지 못했습니다')
  }
  return record
}

/**
 * **가져오기의 코멘트를 한 문장으로 넣는다**(`services/page-import.ts`의 `insertComments`). 가져오기는 트리 쓰기라
 * 이 문장이 도는 동안 프로젝트 행을 쥐고 있다(`repos/projects.ts`의 `lockProjectTree` 머리말 «대가»). 행마다 `insertComment`를
 * 부르면 문장이 댓글 수의 두 배라, 그 시간만큼 같은 프로젝트의 다른 트리 쓰기가 줄을 선다.
 *
 * **`created_at`을 직접 매긴다 — 순서가 곧 파일의 순서다.** 스레드의 순서는 `created_at`뿐이다(`selectComments`). 컬럼 기본값
 * `clock_timestamp()`에 맡기면 순서가 두 가지에 기댄다 — 한 행을 넣는 데 1µs 넘게 걸린다는 것(더 빠르면 동률이 나고, 동률을 가르는
 * 랜덤 `id`가 순서를 섞는다)과 `INSERT … SELECT`가 `unnest`의 순서대로 행을 넣는다는 것(SQL 이 보장하지 않는다). 둘 다 기대지
 * 않으려고 문장의 시각 하나에서 **파일의 순번만큼 1µs 씩 거슬러** 매긴다 — 마지막 코멘트가 그 시각이고 앞의 것은 그보다 이르다.
 * 앞으로(미래로) 매기지 않는 것은, 커밋 뒤 곧바로 달린 새 코멘트가 가져온 코멘트보다 앞에 설 수 있어서다. 이 페이지는 이
 * 트랜잭션에서 만들어져 그보다 이른 코멘트가 없다.
 *
 * NUL 은 넣기 전에 전부 본다(`insertComment`와 같은 `CommentNulByteError` — 부르는 쪽이 트랜잭션을 되돌린다).
 */
export async function insertImportedComments(
  trx: DbHandle,
  input: { pageId: string; authorId: string; comments: readonly { nodeId: string; body: string }[] },
): Promise<void> {
  if (input.comments.length === 0) return
  for (const comment of input.comments) assertNoNulByte(comment.body)

  const nodeIds = input.comments.map((comment) => comment.nodeId)
  const bodies = input.comments.map((comment) => comment.body)
  await sql`
    with base as (select clock_timestamp() as at)
    insert into comments (page_id, node_id, body, author_id, created_at, updated_at)
    select ${input.pageId}::uuid, c.node_id, c.body, ${input.authorId}::uuid, c.at, c.at
      from (
        select u.node_id, u.body, base.at - (${input.comments.length} - u.ord) * interval '1 microsecond' as at
          from base, unnest(${nodeIds}::text[], ${bodies}::text[]) with ordinality as u(node_id, body, ord)
      ) c
  `.execute(trx)
}

/**
 * 본문을 고친다. 없으면 `null`이다.
 *
 * **`updated_at`을 함께 갱신한다** — `repos/pages.ts`·`repos/themes.ts`가 같은 자리에서
 * `now()`를 쓰는데 여기는 `clock_timestamp()`다(0008의 주석과 같은 이유: 한 트랜잭션
 * 안에서 두 번 고치면 `now()`는 같은 값이라 "언제 고쳤나"가 사라진다).
 */
export async function updateCommentBody(
  db: DbHandle,
  pageId: string,
  commentId: string,
  body: string,
): Promise<CommentRecord | null> {
  assertNoNulByte(body)

  const updated = await db
    .updateTable('comments')
    .set({ body, updated_at: sql<Date>`clock_timestamp()` })
    .where('page_id', '=', pageId)
    .where('id', '=', commentId)
    .returning('id')
    .executeTakeFirst()

  return updated ? findCommentById(db, pageId, updated.id) : null
}

/**
 * **지우며 묻는다 — 코멘트를 지우는 문장은 이것 하나다**(`0013-comment-tombstones` · `0014`).
 * `commentId`가 있으면 그 행 하나(`deleteComment`), 없으면 그 페이지의 행 전부(`deletePageComments`)다.
 *
 * **지우기와 묻기가 한 문장이다**(데이터를 바꾸는 CTE). 두 문장이면 둘 사이의 실패나, 트랜잭션 밖에서 이 함수를
 * 부르는 날 «행은 지웠는데 묘비가 없다»가 설 수 있고, 그것이 곧 되살림이다. 부르는 자리가 전부 트랜잭션 안이어도
 * 그 순서에 기대지 않는다.
 *
 * **묘비의 `project_id`는 페이지에서 읽는다** — 코멘트는 프로젝트를 모른다(`listProjectComments`의 머리말). 그
 * 페이지는 이 문장이 도는 동안 살아 있다: 페이지 삭제는 이것을 **먼저** 부르고 페이지를 지운다(`deletePage`).
 *
 * **부르는 트랜잭션은 프로젝트 행을 먼저 잡는다**(`lockProjectForBurial` · 페이지 삭제는 `lockProjectTree`) — 묘비 삽입이 FK 로 그 행에 거는
 * `FOR KEY SHARE`가 페이지 행을 쥔 뒤에 처음 잡히면, 프로젝트 행 → 페이지 행 순으로 잡는 복원 · 프로젝트 삭제와
 * 고리가 된다.
 */
async function deleteAndBury(db: DbHandle, pageId: string, commentId: string | null) {
  const oneRow = commentId === null ? sql`` : sql`and id = ${commentId}`
  const result = await sql<{ node_id: string }>`
    with gone as (
      delete from comments
       where page_id = ${pageId} ${oneRow}
      returning id, page_id, author_id, idempotency_key, node_id
    ), buried as (
      insert into comment_tombstones (comment_id, page_id, project_id, author_id, idempotency_key)
      select g.id, g.page_id, p.project_id, g.author_id, g.idempotency_key
        from gone g join pages p on p.id = g.page_id
       where g.idempotency_key is not null
    )
    select node_id from gone
  `.execute(db)
  return result.rows
}

/**
 * 코멘트를 지운다. **하드 삭제다** — 근거는 `routes/comments.ts`의 머리말에 있다.
 *
 * 없으면 `'not-found'`다. 지운 행의 `nodeId`를 함께 돌려주는 것은 라우트가 **그 노드에
 * 남은 코멘트가 있는지**를 세야 하기 때문이다 — 지우고 나면 그 값을 다시 읽을 수 없다.
 *
 * **키가 있던 행이면 묘비를 남긴다**(`deleteAndBury`). 코멘트 하나를 지우는 길은 둘이고(라우트의 `DELETE` · 복원의
 * `delete-comment`) 둘 다 이 함수를 지난다. 페이지째 지우는 길은 `deletePageComments`가 같은 문장으로 묻는다.
 * 프로젝트 삭제의 CASCADE 는 묻지 않는다 — 묘비도 프로젝트와 함께 간다(`0014`).
 */
export async function deleteComment(
  db: DbHandle,
  pageId: string,
  commentId: string,
): Promise<{ nodeId: string } | 'not-found'> {
  const row = (await deleteAndBury(db, pageId, commentId))[0]
  return row ? { nodeId: row.node_id } : 'not-found'
}

/**
 * 그 페이지의 코멘트를 전부 지우며 키 있는 행을 묻는다(`0014-comment-tombstones-project`). **페이지 삭제가
 * CASCADE 전에 부른다**(`repos/pages.ts`의 `deletePage`). CASCADE 에 맡기면 묘비 없이 사라져, 복원이 그 페이지를
 * 되살린 뒤 같은 키 재전송이 되살림(201)이다.
 *
 * 부르는 자리는 그 페이지 행을 `FOR UPDATE`로 쥔 채 부른다 — 쥐지 않으면 이 문장과 페이지 `DELETE` 사이에 커밋된
 * 게시가 묘비 없이 CASCADE 로 간다(`test/comment-tombstone.test.ts`의 동시성 판).
 */
export async function deletePageComments(trx: DbHandle, pageId: string): Promise<void> {
  await deleteAndBury(trx, pageId, null)
}

/**
 * **묻을 트랜잭션의 첫 잠금** — 프로젝트 행을 `FOR KEY SHARE`로 잡는다(`0014-comment-tombstones-project`).
 *
 * 묘비의 FK 가 프로젝트를 가리키므로 묘비 삽입은 어차피 이 잠금을 건다. 문제는 **언제**다 — 페이지 행을 쥔 뒤에
 * 처음 잡으면, 프로젝트 행을 `FOR UPDATE`로 쥐고 페이지 행을 기다리는 복원(`lockProjectForRestore`) · 프로젝트 삭제
 * (`routes/projects.ts`)와 서로를 기다린다. 그래서 페이지를 잡기 전에 먼저 잡는다 — 그쪽이 쥐고 있으면 페이지를
 * 쥐기 전에 기다린다(고리가 아니다).
 *
 * 부르는 자리: 코멘트 `DELETE`(`routes/comments.ts`). **페이지 삭제(`repos/pages.ts`의 `deletePage`)는 이것을 안 부른다** —
 * 트리 쓰기의 첫 잠금 `lockProjectTree`(`FOR NO KEY UPDATE`)가 같은 자리에서 먼저 잡고, 그것은 제 트랜잭션의
 * FK `KEY SHARE`와 안 부딪히며 복원 · 프로젝트 삭제의 `FOR UPDATE`와는 페이지를 잡기 전에 기다린다. 복원은 프로젝트
 * 행을 이미 `FOR UPDATE`로 쥐고 묻는다. `KEY SHARE`는 다른 `KEY SHARE` · `FOR SHARE` · `NO KEY UPDATE`와 부딪히지
 * 않는다 — 같은 프로젝트의 코멘트 삭제끼리는 줄을 서지 않는다.
 *
 * 대상이 없으면(그 사이 지워졌다) 아무것도 안 잡는다 — 뒤의 페이지 잠금(`lockAndCheck`)이 없음을 보고 404 가 된다.
 * `lockProjectTree`처럼 `ProjectGoneError`를 던지지 않는 것은 뒤에 그 판정을 하는 자리가 이미 있어서다(답은 같은 404).
 */
export async function lockProjectForBurial(trx: DbHandle, projectId: string): Promise<void> {
  assertLocking(trx, 'lockProjectForBurial')
  await trx.selectFrom('projects').select('id').where('id', '=', projectId).forKeyShare().execute()
}

/**
 * 프로젝트의 코멘트 행 전부를 `FOR UPDATE`로 잠근다. **복원 전용이다.**
 *
 * `pages`를 조인해 프로젝트로 좁히되 **`for update of c`**로 코멘트 행만 잠근다 —
 * `for update`만 쓰면 조인한 `pages` 행까지 잠그는데, 그것은 `lockProjectPages`가
 * 이미 하는 일이라 같은 잠금을 두 번 거는 셈이다.
 *
 * 근거와 실측표는 `repos/snapshots.ts`의 `lockProjectForRestore` 머리말에 있다.
 */
export async function lockProjectComments(trx: DbHandle, projectId: string): Promise<void> {
  assertLocking(trx, 'lockProjectComments')
  await sql`
    select c.id from comments c
    join pages p on p.id = c.page_id
    where p.project_id = ${projectId}
    for update of c
  `.execute(trx)
}

/**
 * **id와 시각을 함께 받아** 코멘트를 만든다(id를 보존한다).
 *
 * **`created_at`·`updated_at`을 payload의 값으로 심는 것이 요점이다.** 컬럼 기본값
 * (`clock_timestamp()`)에 맡기면 복원된 코멘트가 **전부 복원 시각**을 갖게 되고, 이 표의
 * 스레드 순서는 시각뿐이므로(0008의 머리말) *"먼저 단 말이 먼저 나온다"*가 깨진다 —
 * 복원이 되돌리는 것은 내용만이 아니라 **그때의 순서**다.
 *
 * `assertNoNulByte`를 부르지 않는다: 이 함수의 유일한 호출자는 복원이고, 그 `body`는
 * `snapshots.payload`(**jsonb**)에서 온다. jsonb는 NUL을 **삽입 시점에** 거부하므로
 * (`22P05`) 그 컬럼에 든 값에는 NUL이 있을 수 없다. 근거는 `services/restore.ts`의
 * "NUL" 절에 실측과 함께 있다.
 */
export async function insertCommentWithId(
  trx: DbHandle,
  input: {
    id: string
    pageId: string
    nodeId: string
    body: string
    authorId: string
    createdAt: Date
    updatedAt: Date
  },
): Promise<void> {
  // **지웠던 행을 같은 id 로 되살리면 키도 돌려준다**(`0013-comment-tombstones`). payload 에는 키가 없다 —
  // 그 행의 키를 아는 것은 지울 때 남긴 묘비뿐이다. 묘비를 지우며 키를 되붙이므로 같은 키 재전송은 다시
  // 재생(200)이 된다. 키를 되붙이지 않으면 `NULL`이라 재전송이 새 행을 세운다(같은 글 두 행). 되붙이지 않고 묘비만
  // 남기면 반대로 틀린다 — 행이 서 있는데 «그 뒤 지워졌다».
  const buried = await trx
    .deleteFrom('comment_tombstones')
    .where('comment_id', '=', input.id)
    .where('page_id', '=', input.pageId)
    .where('author_id', '=', input.authorId)
    .returning('idempotency_key')
    .executeTakeFirst()

  await trx
    .insertInto('comments')
    .values({
      id: input.id,
      page_id: input.pageId,
      node_id: input.nodeId,
      body: input.body,
      author_id: input.authorId,
      created_at: input.createdAt,
      updated_at: input.updatedAt,
      ...(buried === undefined ? {} : { idempotency_key: buried.idempotency_key }),
    })
    .execute()
}

/**
 * 코멘트의 본문과 `updated_at`을 **주어진 값 그대로** 쓴다(복원 전용).
 *
 * `updateCommentBody`와 갈리는 지점은 `updated_at`이다 — 그쪽은 `clock_timestamp()`(지금)를
 * 쓰고 여기는 payload의 값(그때)을 쓴다. 복원은 *"그때의 사실"*을 되돌리는 일이다.
 */
export async function writeCommentBody(
  trx: DbHandle,
  input: { id: string; pageId: string; body: string; updatedAt: Date },
): Promise<void> {
  await trx
    .updateTable('comments')
    .set({ body: input.body, updated_at: input.updatedAt })
    .where('id', '=', input.id)
    .where('page_id', '=', input.pageId)
    .execute()
}
