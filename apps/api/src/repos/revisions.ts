/**
 * 페이지 편집 이력(`revisions`) 저장소. SQL만 안다 — HTTP도 zod도 패치 적용도 이
 * 파일 밖의 일이다(파이프라인은 `services/edit-pipeline.ts`).
 *
 * `revisions`는 append-only다 — UPDATE·DELETE 문장이 이 파일에 없다(페이지 삭제 시
 * `ON DELETE CASCADE`로 함께 사라지는 것만 예외이고, 그것도 이 파일이 아니라
 * `repos/pages.ts`의 `deletePage`가 발동시킨다). 과거 revision을 고치거나 지우는
 * 함수를 이 파일에 추가하려 한다면 그 전에 왜 append-only 로그가 바뀌어야 하는지부터
 * 의심해야 한다.
 *
 * API가 주고받는 키는 camelCase, DB 컬럼은 snake_case다. 그 변환은 이 파일이
 * 전담한다 — `repos/pages.ts`와 같은 관례다.
 */
import type { PatchOp } from '@wirebound/schema'
import { withTransaction, type DbHandle } from '../db/tx'
import type { RevisionActorType } from '../db/types'

export interface RevisionActor {
  type: RevisionActorType
  id: string | null
  label: string
}

export interface RevisionRecord {
  id: string
  seq: number
  actorType: RevisionActorType
  actorId: string | null
  actorLabel: string
  ops: PatchOp[]
  inverse: PatchOp[]
  createdAt: Date
}

export interface InsertRevisionInput {
  pageId: string
  seq: number
  actor: RevisionActor
  ops: PatchOp[]
  inverse: PatchOp[]
}

const REVISION_COLUMNS = ['id', 'seq', 'actor_type', 'actor_id', 'actor_label', 'ops', 'inverse', 'created_at'] as const

interface RevisionRow {
  id: string
  /** `pg`가 int8을 문자열로 준다(`db/types.ts`의 `seq` 컬럼 타입 참고). */
  seq: string
  actor_type: RevisionActorType
  actor_id: string | null
  actor_label: string
  ops: PatchOp[]
  inverse: PatchOp[]
  created_at: Date
}

function toRecord(row: RevisionRow): RevisionRecord {
  return {
    id: row.id,
    // seq는 pg가 문자열로 주는 bigint다 — 호출자(파이프라인·API 응답)는 number를
    // 기대하므로 저장소 경계에서 변환한다(`repos/pages.ts`의 head_seq와 같은 이유).
    seq: Number(row.seq),
    actorType: row.actor_type,
    actorId: row.actor_id,
    actorLabel: row.actor_label,
    ops: row.ops,
    inverse: row.inverse,
    createdAt: row.created_at,
  }
}

/**
 * revision 한 행을 append한다. 호출자(파이프라인)가 `lockPageForEdit`으로
 * 잠근 `head_seq`를 바탕으로 `seq`를 이미 채번해 넘긴다 — 이 함수는 채번하지 않는다.
 *
 * `withTransaction`으로 감싼다. `(page_id, seq)` UNIQUE 위반과 `ops`/`inverse`의
 * `jsonb` 캐스팅 실패(NUL 문자, `db/nul-guard.ts` 참고) 둘 다 제약 위반으로 실패할
 * 수 있는데, 세이브포인트 없이 실패하면 호출자의 트랜잭션(파이프라인이 이미 열어
 * 둔 트랜잭션이든, 테스트의 `withApi` 트랜잭션이든) 전체가 aborted(`25P02`)로 빠져
 * 그 뒤의 모든 문장이 실제 내용과 무관하게 실패한다(`src/db/tx.ts` 참고).
 *
 * `.returning(...)`으로 삽입한 행을 그대로 받는다 — 별도 SELECT를 돌지 않는다.
 */
export async function insertRevision(trx: DbHandle, input: InsertRevisionInput): Promise<RevisionRecord> {
  return withTransaction(trx, async (tx) => {
    const row = await tx
      .insertInto('revisions')
      .values({
        page_id: input.pageId,
        seq: input.seq,
        actor_type: input.actor.type,
        actor_id: input.actor.id,
        actor_label: input.actor.label,
        // ops·inverse는 JSONColumnType<PatchOp[]>다 — 삽입 시엔 JSON.stringify한
        // 문자열을 넘긴다(컬럼 타입의 비대칭, db/types.ts 참고).
        ops: JSON.stringify(input.ops),
        inverse: JSON.stringify(input.inverse),
      })
      .returning(REVISION_COLUMNS)
      .executeTakeFirstOrThrow()

    return toRecord(row)
  })
}

export interface ListRevisionsOptions {
  /** 주면 `actor_type = 'user' AND actor_id = <이 값>`으로 좁힌다. */
  actorId?: string
  limit: number
}

/**
 * 페이지의 revision을 최신순(`seq` 내림차순)으로 최대 `limit`개 조회한다.
 *
 * `options.actorId`가 있으면 `actor_type = 'user'` 조건을 함께 건다. `actor_id`는
 * `actor_type`이 `'mcp'`·`'cli'`일 때 `users.id`가 아니라 `api_tokens.id`(마이그레이션
 * 0005 주석)를 가리키므로, `actor_type`을 걸지 않으면 값이 우연히 겹칠 때 남의
 * 이력이 섞인다.
 */
export async function listRevisions(
  db: DbHandle,
  pageId: string,
  options: ListRevisionsOptions,
): Promise<RevisionRecord[]> {
  let query = db.selectFrom('revisions').select(REVISION_COLUMNS).where('page_id', '=', pageId)

  if (options.actorId !== undefined) {
    query = query.where('actor_type', '=', 'user').where('actor_id', '=', options.actorId)
  }

  const rows = await query.orderBy('seq', 'desc').limit(options.limit).execute()
  return rows.map(toRecord)
}
