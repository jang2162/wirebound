/**
 * 편집 파이프라인. 편집 요청 하나(`ApplyEditInput`)가 페이지의 `schema`를 바꾸고
 * `revisions`에 이력을 남기기까지 거치는 전 과정이 `applyEdit` 함수 하나에 있다.
 * P3의 WebSocket 핸들러도 같은 함수를 그대로 부른다.
 *
 * `services/`는 SQL을 직접 쓰지 않고 HTTP도 모른다 — `repos/pages.ts`·`repos/revisions.ts`의
 * 함수를 조율할 뿐이다. zod도 Fastify도 상태 코드도 이 파일에 없다.
 *
 * **아래 순서 자체가 규격이다.** 순서를 바꾸면 통과해선 안 될 테스트가 통과해
 * 버린다(`edit-pipeline.test.ts`의 변이 검사 표가 각 순서를 하나씩 고정한다).
 *
 * 0. `withTransaction`으로 트랜잭션을 연다. 이 함수 전체(1~9단계)가 그 안에서 돈다.
 * 1. `lockPageForEdit` — 페이지를 잠그고 현재 상태를 읽는다. 없으면 `not-found`.
 * 2. 저장된 문서를 `migrateDocument`로 최신 버전까지 올린다. 던지면 `unsupported-version`.
 *    (클라이언트는 GET이 이미 올려서 내보낸 문서를 기준으로 `ops`를 만들었으므로,
 *    서버도 같은 기준으로 맞춰야 경로가 일치한다.)
 * 3. `input.baseSeq !== headSeq`면 `stale` — 현재 `headSeq`를 함께 돌려준다.
 * 4. `invertOps(before, ops)` → `PatchError`면 `patch-failed`.
 * 5. `applyOps(before, ops)` → `PatchError`면 `patch-failed`.
 * 6. `validatePage(after)` → 이슈가 있으면 `invalid`.
 * 7. `containsNulByte(ops) || containsNulByte(inverse) || containsNulByte(after)` → `nul-byte`.
 * 8. `insertRevision(seq = headSeq + 1)`.
 * 9. `writePageSchemaAtSeq(after, after.version, seq)`.
 *
 * **1~7 중 어디서든 실패하면 8·9에 도달하지 못한다.** 실패를 `return`하면
 * `withTransaction`의 콜백이 정상 종료하므로 그 트랜잭션은 커밋되지만, 그 시점까지
 * 아무것도 쓰지 않았으므로 무해하다. **던져서 롤백시키지 않는 이유:** 실패 사유를
 * 값으로 돌려주는 판별 유니온 설계와 예외를 섞으면 호출자가 두 경로를 모두
 * 다뤄야 한다. `PatchError`만 잡아 값으로 바꾼다 — 그 밖의 예외(예: `(page_id, seq)`
 * UNIQUE 위반)는 잡지 않고 그대로 위로 던져 500이 되게 둔다. 행 잠금이 제대로
 * 걸렸다면 그런 위반은 애초에 일어날 수 없으므로, 일어났다는 것 자체가 버그다.
 *
 * **4를 5보다 먼저 한다.** `invertOps`는 `before`(적용 전 문서)를 필요로 하고, 두
 * 함수 모두 같은 조건에서 `PatchError`를 던진다. `invertOps`가 미묘하게 더
 * 엄격하다 — 값이 `undefined`인 키를 `replace`하려 하면 `invertOps`만 던진다.
 * jsonb에서 읽은 문서에는 `undefined`가 있을 수 없으므로 실무적으로는 같지만,
 * 더 엄격한 쪽을 먼저 돌려 두 함수가 서로 다른 판정을 내리는 상황 자체를 없앤다.
 *
 * **두 함수가 각각 문서를 복제하므로 적용을 두 번 하는 셈이다.** 페이지 문서는
 * 작고 편집 빈도는 사람의 타이핑 속도이므로 문제되지 않는다. 최적화하지 않는다.
 *
 * **`schemaVersion`은 `after.version`에서 파생시킨다.** 저장된 `schema_version`
 * 컬럼을 흘려보내면 마이그레이션이 버전을 올린 순간 두 값이 어긋난다
 * (`routes/pages.ts`의 GET이 같은 이유로 그렇게 한다).
 */
import {
  applyOps,
  invertOps,
  migrateDocument,
  validatePage,
  PatchError,
  type PatchOp,
  type PageDocument,
  type ValidationIssue,
} from '@wirebound/schema'
import { containsNulByte } from '../db/nul-guard'
import { withTransaction, type DbHandle } from '../db/tx'
import { lockPageForEdit, writePageSchemaAtSeq } from '../repos/pages'
import { insertRevision, type RevisionActor } from '../repos/revisions'

export interface ApplyEditInput {
  projectId: string
  pageId: string
  /** 클라이언트가 아는 마지막 seq. 페이지의 현재 head_seq와 정확히 같아야 한다. */
  baseSeq: number
  ops: PatchOp[]
  actor: RevisionActor
}

export type EditOutcome =
  | {
      ok: true
      seq: number
      revisionId: string
      inverse: PatchOp[]
      schema: PageDocument
      schemaVersion: number
    }
  | { ok: false; reason: 'not-found' }
  | { ok: false; reason: 'stale'; headSeq: number }
  | { ok: false; reason: 'patch-failed'; path: string; message: string }
  | { ok: false; reason: 'invalid'; issues: ValidationIssue[] }
  | { ok: false; reason: 'unsupported-version'; message: string }
  | { ok: false; reason: 'nul-byte' }

/** `PatchError`를 잡아 `patch-failed` 결과 값으로 바꾼다. 다른 예외는 다시 던진다. */
function toPatchFailed(error: unknown): { ok: false; reason: 'patch-failed'; path: string; message: string } {
  if (error instanceof PatchError) {
    return { ok: false, reason: 'patch-failed', path: error.path, message: error.message }
  }
  throw error
}

export async function applyEdit(db: DbHandle, input: ApplyEditInput): Promise<EditOutcome> {
  return withTransaction(db, async (trx) => {
    // 1단계: 잠그고 현재 상태를 읽는다.
    const locked = await lockPageForEdit(trx, input.projectId, input.pageId)
    if (!locked) {
      return { ok: false, reason: 'not-found' }
    }

    // 2단계: 저장된 문서를 최신 버전까지 올린다. 클라이언트는 GET이 이미 올려서
    // 내보낸 문서를 기준으로 ops를 만들었으므로, 서버도 같은 기준이어야 경로가 맞다.
    let before: PageDocument
    try {
      before = migrateDocument(locked.schema)
    } catch (error) {
      return {
        ok: false,
        reason: 'unsupported-version',
        message: error instanceof Error ? error.message : '지원하지 않는 문서 버전입니다',
      }
    }

    // 3단계: 클라이언트가 알고 있던 baseSeq가 현재 head_seq와 정확히 같아야 한다.
    // 낡았든(작음) 앞서 있든(큼) 둘 다 stale이다 — 어느 쪽이든 클라이언트가 보는
    // 상태가 서버와 어긋난다는 뜻은 같다.
    if (input.baseSeq !== locked.headSeq) {
      return { ok: false, reason: 'stale', headSeq: locked.headSeq }
    }

    // 4단계: invertOps를 applyOps보다 먼저 돌린다 — invertOps가 더 엄격하고, before
    // (적용 전 문서)가 필요하다(위 독스트링의 "4를 5보다 먼저 한다" 참고).
    let inverse: PatchOp[]
    try {
      inverse = invertOps(before, input.ops)
    } catch (error) {
      return toPatchFailed(error)
    }

    // 5단계: 실제 적용.
    let after: PageDocument
    try {
      after = applyOps(before, input.ops)
    } catch (error) {
      return toPatchFailed(error)
    }

    // 6단계: 적용 후 문서를 검증한다 — 적용 전 문서를 검증하면 항상 통과해 버려
    // 아무것도 증명하지 못한다.
    const issues = validatePage(after)
    if (issues.length > 0) {
      return { ok: false, reason: 'invalid', issues }
    }

    // 7단계: ops·inverse·결과 문서 세 곳 모두를 NUL 문자로 검사한다. ops가 NUL 값을
    // add했다가 같은 요청에서 remove하면 결과 문서엔 NUL이 남지 않지만 ops는 그대로
    // jsonb 컬럼에 저장되므로, 결과 문서만 검사하면 그 경우를 놓친다.
    if (containsNulByte(input.ops) || containsNulByte(inverse) || containsNulByte(after)) {
      return { ok: false, reason: 'nul-byte' }
    }

    // 8·9단계: 여기 도달했다는 것 자체가 1~7 전부를 통과했다는 뜻이다. 이제부터만
    // 실제로 쓴다.
    const seq = locked.headSeq + 1
    const revision = await insertRevision(trx, {
      pageId: input.pageId,
      seq,
      actor: input.actor,
      ops: input.ops,
      inverse,
    })
    await writePageSchemaAtSeq(trx, input.pageId, after, after.version, seq)

    return {
      ok: true,
      seq,
      revisionId: revision.id,
      inverse,
      schema: after,
      schemaVersion: after.version,
    }
  })
}
