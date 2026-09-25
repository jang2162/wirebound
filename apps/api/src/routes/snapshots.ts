/**
 * 스냅샷 라우트 — 설계서 「스냅샷」의 **삭제 없는 태그**, 그중 **얼리는 쪽**이다.
 * `pageRoutes`와 같은 `/api/projects` prefix로 등록한다(`app.ts`) — 파일은 갈리되 URL
 * 네임스페이스는 공유한다(`routes/comments.ts`·`routes/themes.ts`와 같은 관례).
 *
 * HTTP·zod 검증만 다룬다 — SQL은 `repos/snapshots.ts`, payload를 만드는 것은
 * `services/snapshot-capture.ts`다. **권한 판정은 `auth/roles.ts`의 `projectGuard` 하나가
 * 전담한다** — 이 파일은 역할을 비교하지 않는다(`apps/api/README.md` 「계층 규칙」 절).
 *
 * ---
 *
 * # 엔드포인트 다섯이고 **삭제는 없다**
 *
 * | 경로 | 가드 | 근거 |
 * |---|---|---|
 * | `POST /:projectId/snapshots` | **editor** | 설계서 「권한 모델」 — *"editor: … 스냅샷 생성 (복원 불가)"* |
 * | `GET /:projectId/snapshots` | viewer | 조회 |
 * | `GET /:projectId/snapshots/:snapshotId` | viewer | 조회 |
 * | `POST /:projectId/snapshots/:snapshotId/restore` | **owner** | 「권한 모델」 — 복원은 owner뿐이다 |
 * | **`GET /:projectId/snapshot`(단수)** | viewer | **행을 쓰지 않는 읽기 전용 덤프** |
 *
 * **단수와 복수가 갈리는 것이 계약이다.** 복수는 *"삭제 없는 태그"*라 부를 때마다 지울 수
 * 없는 행이 하나 쌓이고 editor여야 한다. 단수는 **아무것도 남기지 않는다** — `wireb pull`이
 * 부를 것이 그쪽이다(아래 그 핸들러의 머리말).
 *
 * **owner 가드를 미리 만들어 두지 않는다**(*"쓰이지 않는 가드는 그것이 무엇을
 * 지키는지 아무도 확인하지 않은 채 남는다"*) — 그 가드는 쓰이는 자리(복원)에만 있다.
 * `test/snapshots.test.ts`의 `owner 가드는 복원 하나에만 걸려 있다`가 그것을 실행으로 지킨다.
 *
 * **DELETE를 만들지 않는다**(「스냅샷」 — *"삭제 없는"*). 스키마에는 그것을 막는 장치가 없으므로
 * (테이블은 평범하다) **라우트가 없다는 것이 곧 그 규칙이다.** `test/snapshots.test.ts`가
 * 이 파일에 `app.delete`가 없다는 것을 실행으로 센다 — 손으로 세면 낡는다.
 *
 * ---
 *
 * # 오류 표
 *
 * ## 생성
 *
 * | 상황 | 상태 | 어디서 |
 * |---|---|---|
 * | 태그 중복 | **409** | `insertSnapshot`의 `23505`를 잡아 옮긴다 |
 * | 지문 불일치(수집 도중 남이 고쳤다) | **409** | 캡처가 값으로 알려 준다 |
 * | NUL(U+0000) | **400** | 아래 `containsNulByte` + `SnapshotNulByteError` |
 * | 태그·설명 길이 위반 | **400** | 본문 zod(`SnapshotBody`) |
 *
 * ## 복원 — 갈래마다 한 줄
 *
 * | 상황 | 상태 | 왜 그 상태인가 |
 * |---|---|---|
 * | 없는 스냅샷 / 남의 프로젝트의 스냅샷 | **404** | `findSnapshotById`가 `projectId`를 함께 받는다(존재를 숨긴다) |
 * | `payloadVersion`이 이 프로세스보다 크다 | **400** | 모르는 형식을 읽지 않는 게이트다. 재시도로 풀리지 않는다 |
 * | 복원 도중 프로젝트가 바뀌었다(지문 불일치) | **409** | 그대로 다시 보내면 된다 |
 * | 안전망 스냅샷의 태그가 이미 있다 | **409** | 같은 밀리초에 두 번 복원했다. 다시 보내면 된다 |
 * | 레이아웃 id 집합이 다르다 | **409** | 조용히 맞추지 않는다. 프로젝트를 고쳐야 풀린다 |
 * | 코멘트 작성자가 없다 | **409** | `comments.author_id`가 RESTRICT다. 그 사용자를 되살려야 풀린다 |
 * | 미지원 문서 버전 | **400** + 어느 페이지가 어떤 버전인지 | **클라이언트가 풀 수 없다.** 배포가 바뀌어야 한다 |
 * | payload 안의 참조가 끊겼다 | **400** | 그 payload로는 영영 못 쓴다 |
 * | 만들 페이지의 문서가 카탈로그 검증에 걸렸다 | **422** | `PUT .../schema`가 같은 자리에서 쓰는 상태다 |
 * | `applyEdit` 실패 | 파이프라인 표 | `http/edit-outcome.ts` 하나가 옮긴다 — 두 벌로 두지 않는다 |
 *
 * **400과 409를 가르는 선은 *"다시 보내면 풀리는가"*다.** 409 넷은 전부 지금 상태와의
 * 충돌이라 재시도나 프로젝트 수정으로 풀리고, 400 셋은 그 스냅샷·그 배포로는 풀리지 않는다.
 *
 * **문장이 서로 달라야 한다.** 코드가 같은 409 넷을 화면은 `code`로 가를 수 없으므로
 * 서버가 문장을 갈라 준다.
 *
 * **NUL을 잠그기 전에 끊는다.** `repos/snapshots.ts`도 같은 검사를 하지만(마지막 방벽),
 * 여기서 걸러야 이 요청이 **큰 jsonb를 만들기 전에** 끝난다 — `routes/comments.ts`가 같은
 * 이유로 파이프라인보다 먼저 검사하는 것과 같은 판단이다. 다만 **payload는 여기서 검사할
 * 수 없다** — 그것은 캡처가 만들기 전이라 아직 없다. 그래서 본문의 두 필드(`tag`·
 * `description`)만 여기서 보고, payload는 repo가 본다.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requestEventActor } from '../auth/actor'
import { projectGuard, recheckProjectRole } from '../auth/roles'
import { containsNulByte } from '../db/nul-guard'
import { withTransaction } from '../db/tx'
import { ApiError, badRequest, conflict, notFound, unauthenticated, validationFailed } from '../errors'
import { editOutcomeToApiError } from '../http/edit-outcome'
import { parseBody, parseParams } from '../http/parse'
import {
  SnapshotNulByteError,
  findSnapshotById,
  insertSnapshot,
  listSnapshots,
  type SnapshotDetail,
  type SnapshotSummary,
} from '../repos/snapshots'
import { lockProjectShared } from '../repos/projects'
import { captureSnapshot, type CaptureHooks } from '../services/snapshot-capture'
import { runConfirmedTransaction } from '../services/lost-commit'
import { restoreSnapshot, type RestoreOutcome, type RestoreResult } from '../services/restore'
import { broadcastOrigin, notifyRestored } from '../ws/notify'

const ProjectIdParams = z.object({ projectId: z.uuid() })
const SnapshotParams = z.object({ projectId: z.uuid(), snapshotId: z.uuid() })

/**
 * 태그는 **이름이므로 짧다**(1~60자). 설명은 0~2000자로 코멘트 본문·프로젝트
 * 설명과 같은 값이다 — 상한이 없으면 비용이 payload로 옮겨 간다.
 *
 * `z.strictObject`라 선언되지 않은 키는 그 자체로 400이다(`routes/projects.ts`와 같은 관례).
 */
const SnapshotBody = z.strictObject({
  tag: z
    .string()
    .min(1, '태그를 입력하세요')
    .max(60, '태그는 60자 이하여야 합니다'),
  description: z.string().max(2000, '설명은 2000자 이하여야 합니다').nullable().optional(),
})

/** Postgres 유니크 위반 SQLSTATE. `routes/themes.ts`·`routes/projects.ts`와 같은 값이다. */
const UNIQUE_VIOLATION = '23505'

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === UNIQUE_VIOLATION
}

/**
 * 목록 항목의 응답 형태. **`payload`가 없다** — 본문은 상세만 준다.
 * `payloadBytes`는 설계서 「열린 질문 (구현 중 결정)」의 스냅샷 보관 정책을 닫을 관측이다.
 */
function toSummaryResponse(record: SnapshotSummary) {
  return {
    id: record.id,
    tag: record.tag,
    description: record.description,
    createdBy: record.createdBy,
    createdByName: record.createdByName,
    createdAt: record.createdAt,
    payloadBytes: record.payloadBytes,
  }
}

/** 상세·생성의 응답 형태. 요약에 payload 본문이 더 붙는다. */
function toDetailResponse(record: SnapshotDetail) {
  return { ...toSummaryResponse(record), payload: record.payload }
}

/**
 * `app.ts`가 `app.register(snapshotRoutes(), { prefix: '/api/projects' })`로 등록하는 팩토리.
 *
 * `captureHooks`는 **테스트 전용이다** — 운영 등록은 인자 없이 부른다. 근거는
 * `services/snapshot-capture.ts`의 `CaptureHooks` 머리말에 있다(요지: 수집 도중의 편집을
 * 결정적으로 만들지 못하면 지문(`readCaptureFingerprint`)의 방어를 잴 수 없다). 테스트는 이 팩토리를 **다른 prefix로**
 * 한 번 더 등록해 같은 핸들러를 재현한다 — 라우트를 베끼면 그 사본이 진짜 라우트와 갈린다.
 */
export function snapshotRoutes(options?: { captureHooks?: CaptureHooks }) {
  return async function plugin(app: FastifyInstance): Promise<void> {
    /**
     * **지금 상태를 태그 하나로 얼린다.** 설계서 「권한 모델」이 editor에게 연 자리다.
     *
     * 순서가 규격이다: 본문 검증 → NUL → **캡처** → 삽입. 캡처가 먼저인 것은 지문
     * 불일치가 **아무것도 쓰지 않고** 끝나야 하기 때문이다(아니면 *"실패했다고 말하는데
     * 조작은 일어났다"*가 된다). 태그 중복은 반대로 삽입 시점에야 드러나는데, 그때는 캡처가
     * 만든 payload를 버릴 뿐 DB에 남는 것이 없다.
     *
     * **캡처와 삽입을 한 트랜잭션으로 묶지 않는다.** 묶으면 `insertSnapshot`이 여는
     * 세이브포인트가 이 구간 안으로 들어가는 것 말고 달라지는 것이 없고(캡처는 읽기뿐이라
     * 롤백할 것이 없다), 대신 큰 payload를 든 트랜잭션이 삽입까지 열려 있게 된다.
     */
    app.post('/:projectId/snapshots', { preHandler: projectGuard('editor') }, async (request, reply) => {
      const { projectId } = parseParams(ProjectIdParams, request.params)
      const body = parseBody(SnapshotBody, request.body)

      if (containsNulByte(body.tag) || containsNulByte(body.description ?? null)) {
        throw badRequest('스냅샷에 NUL 문자(U+0000)를 포함할 수 없습니다')
      }

      // `projectGuard('editor')`가 이미 인증을 요구하므로 여기 도달했다면 `currentUser`는
      // 있다. `as`로 좁히지 않고 던지는 것은 아래에서 `.id`를 반드시 읽기 때문이다 —
      // 가드가 빠지는 순간 `as` 버전은 미인증 요청에 `null` 역참조로 500을 낸다
      // (`routes/comments.ts`의 같은 자리와 같은 근거).
      const currentUser = request.currentUser
      if (!currentUser) {
        throw unauthenticated()
      }

      const outcome = await captureSnapshot(app.db, projectId, options?.captureHooks)
      if (outcome.kind === 'fingerprint-mismatch') {
        // **재시도 루프를 넣지 않는다** — `PUT .../schema`가 같은 자리에서 같은 판단을
        // 한다. 문장이 태그 중복과 달라야 화면이 *"다시 시도한다"*와 *"이름을 바꾼다"*를
        // 가를 수 있다(위 오류 표).
        throw conflict('스냅샷을 뜨는 동안 프로젝트가 바뀌었습니다. 다시 시도해 주세요')
      }

      let record: SnapshotDetail
      try {
        record = await withTransaction(app.db, async (trx) => {
          // **프로젝트 행이 먼저다**(`repos/projects.ts`의 `lockProjectShared`). 삽입의 FK 도 같은 `KEY SHARE`를 걸지만
          // 그것은 프로젝트 삭제 뒤에 섰다가 깨면 23503 — 봉투 없는 500 이다. 먼저 잡으면 0 행 → 404.
          await lockProjectShared(trx, projectId)
          const inserted = await insertSnapshot(trx, {
            projectId,
            tag: body.tag,
            description: body.description ?? null,
            payload: outcome.payload,
            createdBy: currentUser.id,
          })
          // **커밋 순간의 권한**(`auth/roles.ts`의 `recheckProjectRole`). 삽입의 FK 가 프로젝트 행에 거는
          // `KEY SHARE`가 복원 · 프로젝트 삭제의 `FOR UPDATE` 뒤에 섰을 수 있다 — 그 대기 뒤의 역할로 판정한다. 캡처는
          // 이 트랜잭션 밖이다(위 머리말) — 재확인은 쓰는 자리에만 선다.
          await recheckProjectRole(trx, request)
          return inserted
        })
      } catch (error) {
        if (error instanceof SnapshotNulByteError) {
          // repo의 마지막 방벽에 걸렸다. 위에서 본문 둘은 이미 걸렀으므로 여기 오는 것은
          // payload 안의 NUL이고, API 로 거기 닿는 길은 `repos/themes.ts`의 가드가 막는다
          // (`repos/snapshots.ts` 머리말 「payload 검사는 죽은 코드가 아니다」).
          throw badRequest(error.message)
        }
        if (isUniqueViolation(error)) {
          throw conflict('같은 태그의 스냅샷이 이미 있습니다')
        }
        throw error
      }

      return reply.status(201).send(toDetailResponse(record))
    })

    /**
     * **읽기 전용 프로젝트 덤프.** `wireb pull`이 부르는 것이 이것이다.
     *
     * # 왜 새 라우트인가
     *
     * 프로젝트 전체를 한 번에 내는 다른 라우트(`POST .../snapshots`)는
     * **쓰기이고 editor 전용이며 지울 수 없는 태그 이름 공간을 더럽힌다** — CLI가 리포를
     * 동기화할 때마다 그것을 부르면 태그가 무한히 쌓이고 viewer는 아예 못 쓴다.
     *
     * # 새 수집 코드를 짜지 않는다
     *
     * `captureSnapshot`을 **그대로** 부른다. 그 함수의 모양이 이것을 거의 공짜로 만든다 — 그 함수는
     * `{ kind: 'captured', payload }`를 값으로 낼 뿐 **행을 쓰지 않고**(삽입은 위 POST
     * 핸들러가 한다), 지문 불일치도 던지지 않고 값으로 낸다. 그래서 이 핸들러는 그 값을
     * HTTP로 옮기는 것이 전부다.
     *
     * **payload가 `SnapshotPayload`와 같은 함수에서 나와야 한다.** 갈리면 `wireb lint`의
     * 입력이 두 벌이 된다 — lint 는 `wireb pull`이 쓴 payload 를 기준으로 읽는다.
     *
     * # 응답은 payload **그 자체**다
     *
     * 복수 쪽 상세는 `{ …메타, payload }`로 감싸지만 여기는 감싸지 않는다. 감쌀 메타가
     * 없기 때문이다 — 태그도 만든 사람도 id도 없다(행이 없으므로). payload는
     * `payloadVersion`·`capturedAt`을 스스로 들어 자기를 설명하고, **CLI가 받은 것을 그대로
     * 파일에 쓰면 된다.**
     *
     * # 지문 불일치의 409도 그 값에서 온다
     *
     * 문장은 생성 쪽과 같다 — 사용자가 할 일이 같기 때문이다(그대로 다시 보낸다).
     */
    app.get('/:projectId/snapshot', { preHandler: projectGuard('viewer') }, async (request) => {
      const { projectId } = parseParams(ProjectIdParams, request.params)

      const outcome = await captureSnapshot(app.db, projectId, options?.captureHooks)
      if (outcome.kind === 'fingerprint-mismatch') {
        throw conflict('스냅샷을 뜨는 동안 프로젝트가 바뀌었습니다. 다시 시도해 주세요')
      }
      return outcome.payload
    })

    /** 목록. **payload 본문을 싣지 않는다** — 크기만 낸다. */
    app.get('/:projectId/snapshots', { preHandler: projectGuard('viewer') }, async (request) => {
      const { projectId } = parseParams(ProjectIdParams, request.params)
      const records = await listSnapshots(app.db, projectId)
      return records.map(toSummaryResponse)
    })

    /**
     * 상세. **payload 본문을 함께 낸다.**
     *
     * **`payloadVersion`을 여기서 막지 않는다.** 태그는 지워지지 않는 기록이므로(설계서 「스냅샷」)
     * 읽기까지 막으면 기록 자체가 사라진 것과 같다 — 모르는 버전을 거부하는 것은 **복원**의
     * 자리다.
     */
    app.get('/:projectId/snapshots/:snapshotId', { preHandler: projectGuard('viewer') }, async (request) => {
      const { projectId, snapshotId } = parseParams(SnapshotParams, request.params)
      const record = await findSnapshotById(app.db, projectId, snapshotId)
      if (!record) {
        // 남의 프로젝트의 스냅샷 id도 같은 404다 — 존재를 숨긴다(설계서 「권한 모델」).
        throw notFound('스냅샷을 찾을 수 없습니다')
      }
      return toDetailResponse(record)
    })

    /**
     * **그때로 되돌린다.** 설계서 「권한 모델」이 owner에게만 연 자리다 — editor는 생성만 한다.
     *
     * **본문이 없다.** 되돌릴 대상은 경로가 다 말하고, 안전망 스냅샷의 태그는 서버가 짓는다
     * (사람이 지으면 그 이름을 짓느라 복원이 멈추고, 지울 수 없는 자원에 사람 손으로
     * 지은 이름이 하나 더 쌓인다). 그래서 `parseBody`가 없다.
     *
     * **판정과 쓰기는 전부 `services/restore.ts`가 한 트랜잭션 안에서 한다.** 이
     * 핸들러가 하는 일은 그 결과를 HTTP로 옮기는 것 하나다 — 위 오류 표가 곧 아래
     * `restoreOutcomeToApiError`다.
     */
    app.post(
      '/:projectId/snapshots/:snapshotId/restore',
      { preHandler: projectGuard('owner') },
      async (request) => {
        const { projectId, snapshotId } = parseParams(SnapshotParams, request.params)

        // `projectGuard('owner')`가 이미 인증을 요구하므로 여기 도달했다면 `currentUser`는
        // 있다. `as`로 좁히지 않는 이유는 생성 핸들러와 같다 — 아래에서 `.id`를 반드시 읽으므로
        // 가드가 빠지는 순간 `as` 버전은 미인증 요청에 `null` 역참조로 500을 낸다.
        const currentUser = request.currentUser
        if (!currentUser) {
          throw unauthenticated()
        }

        // **COMMIT 답을 잃으면 그 트랜잭션이 커밋됐는지 새 연결로 확인한다**(`services/lost-commit.ts`) — 커밋됐으면 성공이다.
        // `restored`는 페이지의 `seq`를 싣지 않고 받는 쪽이 다시 읽게 하는 프레임이라 머리를 보지 않고 보낸다.
        const { result: outcome } = await runConfirmedTransaction(
          app.db,
          async (trx) => {
            const restored = await restoreSnapshot(trx, { projectId, snapshotId, actorId: currentUser.id })
            // **커밋 순간의 권한**(`auth/roles.ts`의 `recheckProjectRole`). 복원은 프로젝트의 페이지를
            // 전부 잠근다(`lockProjectForRestore`) — 그 대기 뒤의 역할로 판정한다. 던지면 복원째 되돌아간다
            // (`restoreSnapshot`의 트랜잭션은 이 안의 세이브포인트가 된다).
            if (restored.kind === 'restored') await recheckProjectRole(trx, request)
            return restored
          },
          async (restored) => (restored.kind === 'restored' ? true : null),
        )
        if (outcome.kind !== 'restored') {
          throw restoreOutcomeToApiError(outcome)
        }

        // **복원을 룸에 알린다.** 복원은 다섯 자원을 한꺼번에 바꾸므로, 알리지 않으면
        // 다른 접속자는 낡은 문서 위에서 편집하다 `stale` 409를 받고 화면은 왜인지 말할
        // 수단이 없다. **커밋 뒤**다 — `restoreSnapshot`이 자기
        // 트랜잭션을 닫고 돌아온 뒤에 알린다.
        notifyRestored(app, {
          projectId,
          snapshotId,
          actor: requestEventActor(request),
          origin: broadcastOrigin(request),
        })

        return toRestoreResponse(outcome.result)
      },
    )
  }
}

/** 복원 응답. 화면이 보일 넷(바뀐 수·그대로인 수·안전망 태그·테마 차이)이 전부 여기 있다. */
function toRestoreResponse(result: RestoreResult) {
  return {
    summary: result.summary,
    /** *"되돌리려면 이것"*을 화면이 가리킬 수 있어야 한다. */
    safetySnapshot: result.safety,
    /**
     * **되돌리지 않은 것에 대한 보고다.** payload의 테마는 병합 결과라 그것을 `themes`
     * 행에 쓰면 파생 테마가 평탄화되어 상속이 영구히 사라진다 — 그래서 참조만 되돌리고,
     * 지금 그 참조가 내는 모습이 그때와 다르면 여기서 말한다.
     */
    themes: result.themes,
  }
}

/**
 * 복원 실패를 HTTP 에러로 옮긴다. **매핑 표가 곧 이 함수다**(`http/edit-outcome.ts`와 같은
 * 관례). `default` 절을 두지 않는 이유도 같다 — `RestoreOutcome`에 갈래가 늘면
 * "값을 반환하지 않고 끝나는 경로가 있다"로 컴파일이 깨진다.
 *
 * `edit-failed`만 다른 표로 넘긴다. 그 실패는 편집 파이프라인의 것이고, 같은 위험에 대한
 * 규칙을 두 벌로 두면 한쪽만 고쳐진다.
 */
function restoreOutcomeToApiError(outcome: Exclude<RestoreOutcome, { kind: 'restored' }>) {
  switch (outcome.kind) {
    case 'not-found':
      return notFound('스냅샷을 찾을 수 없습니다')
    case 'payload-version':
      return badRequest(
        `이 서버가 읽을 수 없는 스냅샷 형식입니다 (형식 ${outcome.payloadVersion}, 지원 ${outcome.supported})`,
      )
    case 'fingerprint-mismatch':
      // 생성 쪽의 같은 갈래와 **문장을 맞춘다** — 사용자가 할 일이 같다(그대로 다시 보낸다).
      return conflict('복원하는 동안 프로젝트가 바뀌었습니다. 다시 시도해 주세요')
    case 'safety-tag-taken':
      return conflict(`복원 전 상태를 저장할 태그(${outcome.tag})가 이미 있습니다. 다시 시도해 주세요`)
    case 'layout-mismatch':
      return conflict(
        `레이아웃 구성이 스냅샷과 다릅니다 (스냅샷 ${outcome.snapshot.length}개, 현재 ${outcome.current.length}개). 복원하지 않았습니다`,
      )
    case 'missing-author':
      return conflict(`스냅샷의 코멘트를 남긴 사용자가 더 이상 없습니다 (${outcome.authorIds.length}명)`)
    case 'unsupported-version':
      // **어느 페이지가 어떤 버전이라 막혔는지**를 싣는다(설계서 「스키마 마이그레이션」이 *"400 응답이 최소한
      // 원인을 말해 주는 상태로 둔다"*고 한 것을 한 단계 민다).
      return badRequest(
        `지원하지 않는 문서 버전이라 복원할 수 없습니다: ${outcome.pages
          .map((page) => `${page.title}(${page.source === 'stored' ? '현재' : '스냅샷'} 버전 ${page.version})`)
          .join(', ')}`,
      )
    case 'dangling-reference':
      return badRequest(`스냅샷 안의 참조가 끊겨 있습니다: ${outcome.references.join(', ')}`)
    case 'invalid-document':
      return validationFailed(`복원할 페이지의 스키마 검증에 실패했습니다: ${outcome.title}`, outcome.issues)
    case 'edit-failed': {
      // **파이프라인의 표를 그대로 쓰고 앞에 페이지만 붙인다**(`http/edit-outcome.ts` 하나가
      // 상태 코드를 소유한다 — 여기서 다시 매핑하면 두 벌이 된다).
      //
      // **페이지를 붙이지 않으면** 갱신되는 페이지에서 파이프라인이 거절할 때
      // 응답이 *"스키마 검증에 실패했습니다"*라고만 말해, 프로젝트 전체가 막혔는데 **어느
      // 페이지 때문인지 알 수 없다.** `unsupported-version`이 400에서 어느 페이지가 어떤 버전인지
      // 싣는 것과 같은 이유로 여기도 싣는다.
      const mapped = editOutcomeToApiError(outcome.outcome, outcome.baseSeq)
      return new ApiError(mapped.code, `${outcome.title}: ${mapped.message}`, mapped.issues)
    }
  }
}
