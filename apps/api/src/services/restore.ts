/**
 * 스냅샷 복원 — 설계 §4.5의 **되돌리는 쪽**이다. 얼리는 쪽은 `snapshot-capture.ts`(P6-1).
 *
 * `services/`는 SQL을 직접 쓰지 않고 HTTP도 모른다 — `repos/`의 함수와
 * `services/restore-plan.ts`의 판정을 조율할 뿐이다. zod도 Fastify도 상태 코드도 여기 없다.
 *
 * ---
 *
 * # 아래 순서 자체가 규격이다
 *
 * 0. `withTransaction` — **1~9 전부가 그 안에서 돈다**(D1: 부분 성공을 만들지 않는다).
 * 1. `lockProjectForRestore` — 프로젝트와 네 표를 잠근다(D8). **가장 먼저다.**
 * 2. `findSnapshotById(projectId, snapshotId)` — 없으면 `not-found`(존재를 숨긴다).
 * 3. `payloadVersion > SNAPSHOT_PAYLOAD_VERSION`이면 `payload-version`(이월 §3의 게이트).
 * 4. `captureSnapshot` — **안전망 스냅샷의 payload이자 지금 상태다**(D2). 지문이 어긋나면
 *    `fingerprint-mismatch`.
 * 5. `planRestore(대상 payload, 지금 payload)` — 막는 갈래 넷은 그쪽이 판정한다.
 * 6. 코멘트 작성자가 아직 있는가 — DB 질문이라 계획이 못 한다.
 * 7. `insertSnapshot` — **여기가 첫 쓰기다.** 태그가 부딪히면 `safety-tag-taken`.
 * 8. 계획의 `steps`를 **순서대로** 실행한다.
 * 9. 테마 비교 보고(D6).
 *
 * **1~6은 아무것도 쓰지 않는다.** 그러므로 그 갈래들의 *"이 갈래는 무엇을 되돌리는가"*
 * (P6-1 이월 §6)에 대한 답은 캡처와 같다: **되돌릴 것이 없다.** 7 이후의 실패는 답이
 * 다르다 — **트랜잭션이 되돌린다.**
 *
 * ## 그래서 실패를 **던진다**
 *
 * `applyEdit`은 실패를 **값으로** 돌려준다(`{ok:false, reason}`). 그것을 받아 `return`하면
 * `withTransaction`의 콜백이 정상 종료하므로 **바깥 트랜잭션이 커밋된다** — P5-1의 B5가
 * 정확히 그 사고였다(DELETE가 409를 냈는데 코멘트는 지워졌다). 그래서 이 파일은 실패를
 * `RestoreAbort`로 **던져** 트랜잭션을 되돌리고, 트랜잭션 **밖에서** 잡아 값으로 바꾼다.
 * 호출자는 판별 유니온 하나만 다루면 되고, 그 사이에 커밋되는 것은 없다.
 *
 * ---
 *
 * # 지금 상태를 **안전망 스냅샷의 payload로** 읽는다 — 두 번 읽지 않는다
 *
 * 4단계의 캡처가 이미 다섯 자원을 전부 읽었고 그 결과는 `SnapshotPayload`다. 계획이
 * 필요로 하는 *"지금 상태"*와 **모양이 같으므로** 그것을 그대로 넘긴다.
 *
 * 왕복을 아끼는 것이 이유가 아니다. **안전망이 저장한 것과 계획이 본 것이 같은 값이어야
 * 하기 때문이다** — 따로 읽으면 그 사이에 갈릴 자리가 생기고(잠갔으므로 오늘은 갈리지
 * 않지만, 그것은 다른 함수의 성질이다), 갈리는 순간 *"되돌리려면 이것"*이라고 가리킨
 * 스냅샷이 실제로 되돌아갈 상태가 아니게 된다.
 *
 * ---
 *
 * # 안전망 스냅샷 (D2)
 *
 * 복원은 **파괴적**이다 — 스냅샷 이후에 만들어진 페이지를 지우면 그 페이지의 revision
 * 이력이 함께 사라진다(재라 #3을 재서 확인했다: 삭제 전 1 → 삭제 후 0). §4.5의 *"복원을
 * 다시 되돌릴 수도 있다"*는 그 페이지에 대해서는 **거짓**이므로, 복원이 먼저 캡처를 불러
 * 그 문장을 자원 전체에 대해 참으로 만든다.
 *
 * **바꿀 것이 없어도 만든다.** 안전망은 *"계획이 틀렸을 때"*를 위한 보험인데, 만들지
 * 말지를 그 계획으로 판정하면 보험의 뜻이 사라진다. 대가는 안다 — 스냅샷은 지울 수
 * 없으므로(§4.5) 복원 횟수만큼 태그가 쌓인다. 복원은 owner 전용의 드문 조작이므로
 * 그 대가를 받는다.
 *
 * **태그는 `복원 전 <capturedAt>`이다.** 원본 태그를 태그에 싣지 않는 이유는 길이다 —
 * 태그 상한이 60자인데 원본 태그만으로 60자를 쓸 수 있다. 대신 **설명**에 원본 태그와
 * id를 싣는다(설명은 2000자다). 형식은 `SAFETY_TAG_PREFIX`가 든다.
 *
 * **태그가 부딪히면 조용히 덮지도 이름을 바꾸지도 않고 실패한다**(계획서 D2가 판정을
 * 요구한 자리). 근거: 자동 태그가 부딪히려면 **같은 밀리초에** 같은 프로젝트를 두 번
 * 복원해야 한다(`capturedAt`이 `clock_timestamp()`다). 그 상황에서 조용히 이름을 바꾸면
 * 응답이 가리키는 태그와 사용자가 예상하는 태그가 갈리고, 조용히 덮으면 **앞 복원의
 * 안전망이 사라진다** — 지울 수 없는 자원에서 가장 나쁜 결과다. 실패는 재시도로 풀린다.
 *
 * ---
 *
 * # `fingerprint-mismatch`는 **죽은 갈래가 아니다** — 잠금의 구멍이 그것을 살려 둔다
 *
 * 1단계에서 잠그고 4단계에서 캡처하므로 *"수집 도중 남이 커밋한다"*가 대부분 막힌다.
 * **그런데 하나가 남는다:** 복원은 테마 **행**을 쓰지 않아 그 표를 잠그지 않는데(D6),
 * 지문에는 **담기는 테마가 들어 있다**(`readCaptureFingerprint`의 4번 절). 그래서
 * *"복원이 도는 동안 누가 테마 문서를 고친다"*가 이 갈래를 실제로 낸다.
 *
 * **재서 확인했다. 다만 비율은 이 갈래의 성질이 아니라 *"테마를 얼마나 자주 고치느냐"*의
 * 성질이다** — 파라미터 없이 비율만 적으면 *"드물다"*로 오독된다. 복원 한 판이 도는 동안 테마를 얼마나 자주 커밋하느냐에 **비율이 그대로 따라간다** —
 * 12판씩 세 조건을 갈라 쟀다:
 *
 * | 조건 | 지문 불일치 |
 * |---|---|
 * | **단발** — 복원을 쏜 뒤 `0~11ms` 사이 한 번만 커밋(판마다 지연을 1ms씩 늘린다) | **4/12** |
 * | **연속** — 복원이 끝날 때까지 UPDATE를 쉬지 않고 돌린다 | **12/12** |
 * | **무관한 테마** — 레이아웃이 **가리키지 않는** 테마를 같은 속도로 고친다 | **0/12** |
 *
 * **셋째 줄이 지문의 범위를 말한다:** 지문의 테마 절은 `layouts`를 조인하므로 **담기는
 * 테마**(= 레이아웃이 가리키는 것)만 본다. 그 밖의 테마를 아무리 고쳐도 복원은 `restored`다.
 *
 * **409는 옳은 결과다** — 이 갈래는 첫 쓰기(안전망 삽입)보다 앞이라 **아무것도 남기지
 * 않는다.** 사용자가 할 일은 다시 시도하는 것이고, 그 사이 테마가 그대로면 통과한다.
 *
 * 레이스라 케이스로 쓸 수 없어 `captureHooks`로 결정적으로 만들었다
 * (`test/restore.test.ts`의 `복원 도중 테마가 바뀌면 409다`).
 *
 * **그러니 이 갈래를 지우지 마라.** *"잠갔으니 안 난다"*는 테마를 함께 잠그기 전까지 거짓이고,
 * 테마를 잠그는 것은 D6이 막은 일이 아니라 **하지 않기로 한 일**이다(복원이 안 쓰므로).
 *
 * ---
 *
 * # NUL(U+0000) — 검사를 두지 않는다. 이유가 있다
 *
 * P6-1 이월 §7이 *"복원도 같은 자리를 갖는다 … 400으로 옮기지 않으면 500이 된다"*고
 * 적었다. **그 경고는 복원이 테마 행을 쓴다는 전제 위에 서 있었고, D6이 그 전제를
 * 없앴다** — 복원은 테마 문서를 되돌리지 않는다.
 *
 * 남은 질문은 *"payload의 다른 절에 NUL이 있을 수 있는가"*이고 답은 **없다**이다:
 * `snapshots.payload`가 **jsonb**라 NUL이 든 값은 **삽입 시점에 거부된다**(`22P05`).
 * 이월 §7이 짚은 구멍은 `themes`의 절이 `json`(jsonb가 아니다)이라 뚫린 것이었고,
 * 그 값이 스냅샷으로 넘어갈 때는 다시 jsonb를 만나 `insertSnapshot`의 가드가 400으로
 * 끊는다. 즉 **저장된 payload에는 NUL이 있을 수 없다.**
 *
 * 그러므로 여기 가드를 두면 **도달 경로가 0인 줄**이 되고, 그런 줄은 근거가 없으면
 * 다음 사람이 지운다(이월 §7이 정확히 그 형태의 사고를 적어 두었다 — *"죽은 코드가
 * 아니다"*라는 반대 방향의). 없는 위험에 가드를 두는 대신 **왜 없는지를 여기 적는다.**
 * 마지막 방벽도 남아 있다: 페이지 문서는 `applyEdit` 8단계가 다시 본다.
 */
import { canonicalJson } from '../canonical-json'
import type { DbHandle } from '../db/tx'
import { withTransaction } from '../db/tx'
import { deleteComment, insertCommentWithId, writeCommentBody } from '../repos/comments'
import { updateLayoutTheme } from '../repos/layouts'
import { deleteMenuNodeRow, insertMenuNodeWithId, writeMenuNodePlacement } from '../repos/menu'
import { deletePageRow, insertPageWithId, writePagePlacement } from '../repos/pages'
import { findSnapshotById, insertSnapshot, lockProjectForRestore } from '../repos/snapshots'
import { countExistingUsers } from '../repos/users'
import { applyEdit, type EditOutcome } from './edit-pipeline'
import { captureSnapshot, freezeTheme, type CaptureHooks } from './snapshot-capture'
import { planRestore, type RestoreSummary } from './restore-plan'
import { SNAPSHOT_PAYLOAD_VERSION, type SnapshotPayload } from '@wirebound/themes'
import type { UnsupportedVersionPage } from './restore-plan'
import type { ValidationIssue } from '@wirebound/schema'

/**
 * 안전망 스냅샷의 태그 앞머리. **형식을 못박고 케이스가 그 형식을 고정한다**(D10과 같은
 * 이유) — 화면이 *"되돌리려면 이것"*을 가리키려면 사람이 목록에서 알아볼 수 있어야 한다.
 */
export const SAFETY_TAG_PREFIX = '복원 전 '

/**
 * 복원이 만드는 revision의 `actor_label` 형식(D10). **`actor_type`은 `'user'`다** —
 * `revisions_actor_type_check`가 `user|mcp|cli` 셋만 받는 것을 재서 확인했다(재라 #1:
 * `'robot'`을 넣으면 `23514`).
 *
 * **길이 제약이 없는 것도 재서 확인했다** — `actor_label`은 `text`이고
 * `information_schema.columns.character_maximum_length`가 `null`이다(5000자를 실제로 넣고
 * 되읽어 5000자를 받았다). 태그가 60자까지이므로 이 형식은 최대 64자이고, 잘릴 자리가 없다.
 */
export function restoreActorLabel(tag: string): string {
  return `복원: ${tag}`
}

/** 응답이 싣는 테마 보고 한 줄(D6). **되돌리지 않고 다름을 말한다.** */
export interface RestoreThemeReport {
  layoutId: string
  /** 복원 뒤 그 레이아웃이 가리키는 테마 id. */
  themeId: string | null
  /** payload의 동결본과 지금 그 참조가 내는 병합 결과가 다른가. */
  differs: boolean
}

export interface RestoreResult {
  summary: RestoreSummary
  safety: { id: string; tag: string }
  themes: RestoreThemeReport[]
}

export type RestoreOutcome =
  | { kind: 'restored'; result: RestoreResult }
  | { kind: 'not-found' }
  | { kind: 'payload-version'; payloadVersion: number; supported: number }
  | { kind: 'fingerprint-mismatch' }
  | { kind: 'safety-tag-taken'; tag: string }
  | { kind: 'layout-mismatch'; snapshot: string[]; current: string[] }
  | { kind: 'unsupported-version'; pages: UnsupportedVersionPage[] }
  | { kind: 'invalid-document'; pageId: string; title: string; issues: ValidationIssue[] }
  | { kind: 'dangling-reference'; references: string[] }
  | { kind: 'missing-author'; authorIds: string[] }
  /**
   * 페이지 문서를 되돌리다 편집 파이프라인이 거절했다. **`title`·`baseSeq`를 함께 든다** —
   * 라우트가 응답에 *"어느 페이지"*를 실어야 하기 때문이다(D5가 400에서 그렇게 하는 것과
   * 같은 이유: 프로젝트 전체를 막은 응답이 어느 페이지 때문인지 말하지 않으면 사용자가
   * 고칠 자리를 찾지 못한다).
   */
  | {
      kind: 'edit-failed'
      pageId: string
      title: string
      baseSeq: number
      outcome: Extract<EditOutcome, { ok: false }>
    }

type RestoreFailure = Exclude<RestoreOutcome, { kind: 'restored' }>

/**
 * 트랜잭션을 되돌리기 위해 던지는 값. **밖으로 새지 않는다** — `restoreSnapshot`이
 * `withTransaction` 바깥에서 잡아 값으로 바꾼다(위 머리말의 *"그래서 실패를 던진다"*).
 */
class RestoreAbort extends Error {
  constructor(readonly outcome: RestoreFailure) {
    super(`restore-abort: ${outcome.kind}`)
    this.name = 'RestoreAbort'
  }
}

/** Postgres 유니크 위반 SQLSTATE. `routes/snapshots.ts`와 같은 값이다. */
const UNIQUE_VIOLATION = '23505'

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === UNIQUE_VIOLATION
}

export interface RestoreInput {
  projectId: string
  snapshotId: string
  /** 복원을 부른 사람. revision의 actor이자 안전망 스냅샷의 `created_by`다. */
  actorId: string
  /**
   * 4단계 캡처의 수집 도중에 끼어들 자리. **테스트 전용이다** — 라우트는 채우지 않는다.
   * `services/snapshot-capture.ts`의 `CaptureHooks`가 P6-1에서 같은 이유로 생긴 이음매이고,
   * 여기는 그것을 **그대로 통과시킬 뿐** 새 개념을 만들지 않는다.
   *
   * **없으면 `fingerprint-mismatch` 갈래를 결정적으로 잴 수 없다.** 복원은 잠그고 나서
   * 캡처하므로 그 창에 끼어들 수 있는 것이 하나뿐인데(아래), 그 하나를 정확한 지점에 밀어
   * 넣는 타이밍은 바깥에서 만들 수 없다 — 레이스로 재면 **테마를 고치는 속도에 따라 4/12에서
   * 12/12까지 흔들린다**(위 머리말의 표).
   */
  captureHooks?: CaptureHooks
}

export async function restoreSnapshot(db: DbHandle, input: RestoreInput): Promise<RestoreOutcome> {
  try {
    const result = await withTransaction(db, async (trx) => runRestore(trx, input))
    return { kind: 'restored', result }
  } catch (error) {
    if (error instanceof RestoreAbort) return error.outcome
    throw error
  }
}

async function runRestore(trx: DbHandle, input: RestoreInput): Promise<RestoreResult> {
  // 1단계. **잠그는 것이 가장 먼저다** — 아래의 어떤 읽기보다 앞서야 P5-1이 만든 규칙
  // (*"서버가 값을 읽어 밀어붙이는 것은 잠근 뒤에 읽을 때만 참이다"*)을 지킨다.
  await lockProjectForRestore(trx, input.projectId)

  // 2단계. 남의 프로젝트의 스냅샷 id도 여기서 `null`이다 — 존재를 숨긴다(§10).
  const target = await findSnapshotById(trx, input.projectId, input.snapshotId)
  if (!target) throw new RestoreAbort({ kind: 'not-found' })

  // 3단계. **게이트가 서는 자리가 여기다**(P6-1 이월 §3) — 규격은 미래 버전을 통과시키고
  // `GET`도 막지 않는다. 모르는 형식을 **쓰는** 것만 막는다.
  if (target.payload.payloadVersion > SNAPSHOT_PAYLOAD_VERSION) {
    throw new RestoreAbort({
      kind: 'payload-version',
      payloadVersion: target.payload.payloadVersion,
      supported: SNAPSHOT_PAYLOAD_VERSION,
    })
  }

  // 4단계. 안전망의 payload이자 계획이 견줄 "지금"이다(위 머리말).
  const captured = await captureSnapshot(trx, input.projectId, input.captureHooks)
  if (captured.kind === 'fingerprint-mismatch') throw new RestoreAbort({ kind: 'fingerprint-mismatch' })
  const now: SnapshotPayload = captured.payload

  // 5단계.
  const planned = planRestore(target.payload, now)
  if (planned.kind === 'layout-mismatch') {
    throw new RestoreAbort({ kind: 'layout-mismatch', snapshot: planned.snapshot, current: planned.current })
  }
  if (planned.kind === 'unsupported-version') {
    throw new RestoreAbort({ kind: 'unsupported-version', pages: planned.pages })
  }
  if (planned.kind === 'invalid-document') {
    throw new RestoreAbort({
      kind: 'invalid-document',
      pageId: planned.pageId,
      title: planned.title,
      issues: planned.issues,
    })
  }
  if (planned.kind === 'dangling-reference') {
    throw new RestoreAbort({ kind: 'dangling-reference', references: planned.references })
  }
  const { steps, summary } = planned.plan

  // 6단계. **만들 코멘트의 작성자가 아직 있는가.** `comments.author_id`가 RESTRICT라
  // (0008) 없는 사용자로 삽입하면 `23503`이고 그것은 `pg`의 raw 예외이므로 **500**이 된다.
  //
  // **오늘 사용자를 지우는 경로는 0건이다** — `deleteFrom('users')`가 `src/` 전체에 없고
  // (`repos/users.ts`는 `findUserByEmail`·`insertUser` 둘뿐이다), `DELETE .../members/:userId`는
  // 멤버십을 지우지 사용자를 지우지 않는다. 그래도 검사를 두는 이유: payload는 **users 표의
  // 오늘 보장보다 오래 산다.** 그 경로가 생기는 날(또는 DB 복구·수동 삭제) 이 자리는
  // 500이 되는데, 그것은 *"사용자가 보낸 것 때문에 서버가 잘못했다고 말하는"* 형태다.
  const newAuthorIds = [
    ...new Set(steps.filter((step) => step.kind === 'create-comment').map((step) => step.comment.authorId)),
  ]
  if (newAuthorIds.length > 0) {
    const found = await countExistingUsers(trx, newAuthorIds)
    const missing = newAuthorIds.filter((id) => !found.includes(id))
    if (missing.length > 0) throw new RestoreAbort({ kind: 'missing-author', authorIds: missing })
  }

  // 7단계. **첫 쓰기다.** 위의 어떤 갈래도 여기 도달하지 못한다.
  const safetyTag = `${SAFETY_TAG_PREFIX}${now.capturedAt}`
  let safety
  try {
    safety = await insertSnapshot(trx, {
      projectId: input.projectId,
      tag: safetyTag,
      description: `"${target.tag}"(으)로 복원하기 직전 상태 — 스냅샷 ${target.id}`,
      payload: now,
      createdBy: input.actorId,
    })
  } catch (error) {
    if (isUniqueViolation(error)) throw new RestoreAbort({ kind: 'safety-tag-taken', tag: safetyTag })
    throw error
  }

  // 8단계. 계획의 순서가 곧 FK 순서다(`services/restore-plan.ts`의 표).
  const headSeqByPage = new Map(now.pages.map((page) => [page.id, page.headSeq]))
  const actorLabel = restoreActorLabel(target.tag)

  for (const step of steps) {
    switch (step.kind) {
      case 'delete-comment':
        await deleteComment(trx, step.pageId, step.id)
        break
      case 'delete-page':
        await deletePageRow(trx, input.projectId, step.id)
        break
      case 'create-menu':
        await insertMenuNodeWithId(trx, input.projectId, step.node)
        break
      case 'update-menu':
        await writeMenuNodePlacement(trx, input.projectId, step.node)
        break
      case 'update-page-meta':
        await writePagePlacement(trx, input.projectId, step.page)
        break
      case 'delete-menu':
        await deleteMenuNodeRow(trx, input.projectId, step.id)
        break
      case 'create-page':
        await insertPageWithId(trx, input.projectId, {
          ...step.page,
          // payload의 `headSeq`를 심지 않는다 — 이유는 `insertPageWithId`의 머리말에 있다.
        })
        break
      case 'write-page-schema': {
        // **`PUT .../schema`가 쓰는 것과 같은 두 ops다**(D4) — `applyOp`가 문서 루트에
        // 적용하지 못하므로 `{version, root}`를 한 번에 갈아 끼울 수 없다
        // (`routes/pages.ts`의 같은 자리 주석).
        //
        // `baseSeq`는 4단계가 읽은 그 페이지의 `head_seq`다. 1단계에서 잠갔으므로 그 사이
        // 바뀔 수 없고, 그래도 바뀌었다면 `stale`이 나 복원 전체가 되돌아간다 —
        // **조용히 덮어쓰지 않는다.**
        const baseSeq = headSeqByPage.get(step.page.id) ?? 0
        const outcome = await applyEdit(trx, {
          projectId: input.projectId,
          pageId: step.page.id,
          baseSeq,
          ops: [
            { op: 'replace', path: '/root', value: step.page.schema.root },
            { op: 'replace', path: '/version', value: step.page.schema.version },
          ],
          // D10 — 복원이 만든 revision은 평범한 편집과 구분돼야 한다(§4.5의 *"복원 자체가
          // 이력에 남고"*의 실질).
          actor: { type: 'user', id: input.actorId, label: actorLabel },
        })
        if (!outcome.ok) {
          // **던진다.** 값으로 돌려주면 트랜잭션이 커밋된다(위 머리말).
          throw new RestoreAbort({
            kind: 'edit-failed',
            pageId: step.page.id,
            title: step.page.title,
            baseSeq,
            outcome,
          })
        }
        break
      }
      case 'create-comment':
        await insertCommentWithId(trx, {
          id: step.comment.id,
          pageId: step.comment.pageId,
          nodeId: step.comment.nodeId,
          body: step.comment.body,
          authorId: step.comment.authorId,
          // **그때의 시각을 되돌린다** — 이 표의 스레드 순서는 시각뿐이다(0008).
          createdAt: new Date(step.comment.createdAt),
          updatedAt: new Date(step.comment.updatedAt),
        })
        break
      case 'update-comment':
        await writeCommentBody(trx, {
          id: step.comment.id,
          pageId: step.comment.pageId,
          body: step.comment.body,
          updatedAt: new Date(step.comment.updatedAt),
        })
        break
      case 'set-layout-theme':
        await updateLayoutTheme(trx, step.layoutId, step.themeId)
        break
    }
  }

  // 9단계. **테마는 되돌리지 않고 다름을 말한다**(D6). 얼리는 규칙은 캡처의 것을 그대로
  // 쓴다 — 두 벌이면 한쪽만 고쳐진다.
  const frozenByLayout = new Map(target.payload.themes.map((entry) => [entry.layoutId, entry.theme]))
  const themes: RestoreThemeReport[] = []
  for (const layout of target.payload.layouts) {
    const nowTheme = await freezeTheme(trx, layout.themeId)
    const frozen = frozenByLayout.get(layout.id) ?? null
    themes.push({
      layoutId: layout.id,
      themeId: layout.themeId,
      // **키 순서는 보지 못한다 — 볼 수 없다.** `snapshots.payload`가 jsonb라 캡처가 무엇을
      // 담든 저장되는 순간 키가 정렬되고, `themes`의 절은 `json`이라 원문 순서를 들고 있다.
      // 순서를 보는 비교는 *"항상 다르다"*만 내놓는다(실측: 같은 테마의 `meta`가 한쪽은
      // `{id,name,version,description}`, 다른 쪽은 `{id,name,description,version}`).
      // 잃는 것과 되찾으려면 무엇이 필요한지는 `src/canonical-json.ts`에 적었다.
      differs: canonicalJson(nowTheme ?? null) !== canonicalJson(frozen),
    })
  }

  return { summary, safety: { id: safety.id, tag: safety.tag }, themes }
}
