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
 * 0. `withTransaction`으로 트랜잭션을 연다. 이 함수 전체(1~10단계)가 그 안에서 돈다.
 * 1. `lockPageForEdit` — 페이지를 잠그고 현재 상태를 읽는다. 없으면 `not-found`.
 * 2. 저장된 문서를 `migrateDocument`로 최신 버전까지 올린다. 던지면 `unsupported-version`.
 *    (클라이언트는 GET이 이미 올려서 내보낸 문서를 기준으로 `ops`를 만들었으므로,
 *    서버도 같은 기준으로 맞춰야 경로가 일치한다.)
 * 3. `input.baseSeq !== headSeq`면 `stale` — 현재 `headSeq`를 함께 돌려준다.
 * 4. `invertOps(before, ops)` → `PatchError`면 `patch-failed`.
 * 5. `applyOps(before, ops)` → `PatchError`면 `patch-failed`.
 * 6. `validatePage(after)` → 이슈가 있으면 `invalid`.
 * 7. `after.version !== before.version`이면 `invalid` — `ops`가 `/version`을 직접
 *    건드린 경우다(아래 "`version`은 편집 대상이 아니다" 참고).
 * 8. `containsNulByte(ops) || containsNulByte(inverse) || containsNulByte(after)` → `nul-byte`.
 * 9. `insertRevision(seq = headSeq + 1)`.
 * 10. `writePageSchemaAtSeq(after, after.version, seq)`.
 *
 * **1~8 중 어디서든 실패하면 9·10에 도달하지 못한다.** 실패를 `return`하면
 * `withTransaction`의 콜백이 정상 종료하므로 그 트랜잭션은 커밋되지만, 그 시점까지
 * 아무것도 쓰지 않았으므로 무해하다. **던져서 롤백시키지 않는 이유:** 실패 사유를
 * 값으로 돌려주는 판별 유니온 설계와 예외를 섞으면 호출자가 두 경로를 모두
 * 다뤄야 한다. `PatchError`만 잡아 값으로 바꾼다 — 그 밖의 예외(예: `(page_id, seq)`
 * UNIQUE 위반)는 잡지 않고 그대로 위로 던져 500이 되게 둔다. 행 잠금이 제대로
 * 걸렸다면 그런 위반은 애초에 일어날 수 없으므로, 일어났다는 것 자체가 버그다.
 *
 * **`version`은 편집 대상이 아니다(7단계, 코드 리뷰로 추가됨).** `ops`가
 * `{op:'replace', path:'/version', value: N}`처럼 문서 버전 자체를 바꿀 수 있다 —
 * `invertOps`·`applyOps`·`validatePage` 어느 것도 이걸 막지 않는다(`version`은
 * `DocumentEnvelopeSchema`에서 그냥 양의 정수이고, `validatePage`는 버전 값 자체의
 * 의미를 검사하지 않는다). 이걸 그대로 저장하면 다음 읽기부터 `migrateDocument`가
 * `version > target`으로 던져 그 페이지의 모든 GET·편집이 영구히 막힌다 —
 * `not-found`·`stale`과 달리 클라이언트가 스스로 복구할 방법이 없다. **`PUT
 * .../schema` 전체 교체도 탈출구가 아니다:** 그 라우트도 이 파이프라인을 타므로
 * 아래 2단계가 저장된 문서를 그대로 `migrateDocument`에 태워 `unsupported-version`으로
 * 끝난다. 즉 GET·`PATCH .../ops`·`PUT .../schema` 세 경로가 전부 400이 되고, 그
 * 페이지는 API로 복구할 수 없다(인지된 결과 — `routes/pages.ts`의 GET 핸들러 주석에
 * 재현 조건과 함께 적어 뒀다). 그래서 이 7단계가 사후 복구가 아니라 **사전 차단**이다.
 * `before`는 2단계에서 이미 최신 버전으로 올라와 있으므로, `ops`가 `/version`을
 * 건드리지 않았다면 `after.version`은 `before.version`과 항상 같아야 한다 — 이
 * 불변식을 REST·WebSocket(P3) 두 호출자가 각자 다시 지키게 하는 대신 여기(공유
 * 진입점)에서 한 번 지킨다.
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
function toPatchFailed(error: unknown): Extract<EditOutcome, { reason: 'patch-failed' }> {
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

    // 7단계: version은 마이그레이션이 소유하는 필드이지 편집 대상이 아니다(코드
    // 리뷰로 추가됨, 파일 헤더의 "version은 편집 대상이 아니다" 참고). before는
    // 2단계에서 이미 최신 버전으로 올라와 있으므로, ops가 /version을 건드리지
    // 않았다면 after.version은 before.version과 같아야 한다. 다르다면 ops가 그
    // 필드를 직접 바꿨다는 뜻이고, 그대로 저장하면 다음 읽기부터 migrateDocument가
    // 던져 페이지가 영구히 열리지 않는다 — validatePage(6단계)는 이 조건을 검사하지
    // 않으므로(버전 값 자체는 봉투상 유효하다) 별도로 막아야 한다.
    if (after.version !== before.version) {
      return {
        ok: false,
        reason: 'invalid',
        issues: [{ code: 'bad-document', nodeId: null, path: '/version', message: 'version은 편집으로 바꿀 수 없습니다' }],
      }
    }

    // 8단계: ops·inverse·결과 문서 세 곳 모두를 NUL 문자로 검사한다. ops가 NUL 값을
    // add했다가 같은 요청에서 remove하면 결과 문서엔 NUL이 남지 않지만 ops는 그대로
    // jsonb 컬럼에 저장되므로, 결과 문서만 검사하면 그 경우를 놓친다.
    //
    // **`containsNulByte(input.ops)` 단독을 격리하는 테스트는 없다.** 이 패치
    // 엔진(add·remove·replace·move 네 종류, `@wirebound/schema`의 `patch/`)의 구조상
    // 반례를 만들 수 없어 보인다: ops가 NUL 값을 도입했는데 after에는 안 남는다면
    // (즉 그 값이 최종적으로 지워지거나 덮어써진다면), 지우거나 덮어쓰는 연산의
    // 역은 언제나 "지워지기/덮이기 직전의 값"을 그대로 담는다 — remove의 역은 항상
    // `{op:'add', value: 지워진 값}`이고 replace의 역은 항상 `{op:'replace', value:
    // 이전 값}`이다(`patch/inverse.ts`). 그 "이전 값"이 바로 우리가 지우려는 NUL
    // 값이므로 inverse도 함께 NUL을 갖게 된다. 값을 전혀 싣지 않는 유일한 역은
    // 배열에 새로 끼워 넣는 add의 역(그냥 remove, 값 없음)인데, 그건 "도입"이지
    // "제거"가 아니라서 after를 다시 깨끗하게 만드는 데 쓸 수 없다. 즉 지금 이
    // 함수로는 ops만 지워도 19개 케이스 중 아무것도 반례가 안 된다 — 그렇다고 이
    // 줄을 지워도 되는 신호는 아니다. jsonb 컬럼에 저장되는 건 어디까지나 `ops`
    // 그 자체이고(D8), 이 엔진에 op 종류가 늘어나면(예: 값을 안 남기는 삭제류
    // 연산) 반례가 다시 생길 수 있다.
    if (containsNulByte(input.ops) || containsNulByte(inverse) || containsNulByte(after)) {
      return { ok: false, reason: 'nul-byte' }
    }

    // 9·10단계: 여기 도달했다는 것 자체가 1~8 전부를 통과했다는 뜻이다. 이제부터만
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
