/**
 * 스냅샷 라우트 — 설계 §4.5의 **삭제 없는 태그**, 그중 **얼리는 쪽**이다.
 * `pageRoutes`와 같은 `/api/projects` prefix로 등록한다(`app.ts`) — 파일은 갈리되 URL
 * 네임스페이스는 공유한다(`routes/comments.ts`·`routes/themes.ts`와 같은 관례).
 *
 * HTTP·zod 검증만 다룬다 — SQL은 `repos/snapshots.ts`, payload를 만드는 것은
 * `services/snapshot-capture.ts`다. **권한 판정은 `auth/roles.ts`의 `projectGuard` 하나가
 * 전담한다** — 이 파일은 역할을 비교하지 않는다(README "계층 규칙").
 *
 * ---
 *
 * # 엔드포인트 셋이고 **복원도 삭제도 없다**
 *
 * | 경로 | 가드 | 근거 |
 * |---|---|---|
 * | `POST /:projectId/snapshots` | **editor** | §10 — *"editor: … 스냅샷 생성 (복원 불가)"* |
 * | `GET /:projectId/snapshots` | viewer | 조회 |
 * | `GET /:projectId/snapshots/:snapshotId` | viewer | 조회 |
 *
 * **복원(owner)은 P6-2다. owner 가드를 미리 만들어 두지 않는다**(계획서 D8) — 쓰이지 않는
 * 가드는 그것이 무엇을 지키는지 아무도 확인하지 않은 채 남는다.
 *
 * **DELETE를 만들지 않는다**(§4.5 — *"삭제 없는"*). 스키마에는 그것을 막는 장치가 없으므로
 * (테이블은 평범하다) **라우트가 없다는 것이 곧 그 규칙이다.** `test/snapshots.test.ts`가
 * 이 파일에 `app.delete`가 없다는 것을 실행으로 센다 — 손으로 세면 낡는다.
 *
 * ---
 *
 * # 오류 표
 *
 * | 상황 | 상태 | 어디서 |
 * |---|---|---|
 * | 태그 중복 | **409** | `insertSnapshot`의 `23505`를 잡아 옮긴다 |
 * | 지문 불일치(수집 도중 남이 고쳤다) | **409** | 캡처가 값으로 알려 준다(D6) |
 * | NUL(U+0000) | **400** | 아래 `containsNulByte` + `SnapshotNulByteError` |
 * | 태그·설명 길이 위반 | **400** | 본문 zod(`SnapshotBody`) |
 *
 * **두 409의 문장이 서로 다르다.** 사용자가 할 일이 다르기 때문이다 — 태그 중복은 *"이름을
 * 바꾼다"*이고 지문 불일치는 *"다시 시도한다"*이다. 화면이 그 둘을 갈라 보여야 하므로
 * (계획서 T4) 여기서 같은 문장을 쓰면 화면이 코드로는 가를 수 없다.
 *
 * **NUL을 잠그기 전에 끊는다.** `repos/snapshots.ts`도 같은 검사를 하지만(마지막 방벽),
 * 여기서 걸러야 이 요청이 **큰 jsonb를 만들기 전에** 끝난다 — `routes/comments.ts`가 같은
 * 이유로 파이프라인보다 먼저 검사하는 것과 같은 판단이다. 다만 **payload는 여기서 검사할
 * 수 없다** — 그것은 캡처가 만들기 전이라 아직 없다. 그래서 본문의 두 필드(`tag`·
 * `description`)만 여기서 보고, payload는 repo가 본다.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { projectGuard } from '../auth/roles'
import { containsNulByte } from '../db/nul-guard'
import { badRequest, conflict, notFound, unauthenticated } from '../errors'
import { parseBody, parseParams } from '../http/parse'
import {
  SnapshotNulByteError,
  findSnapshotById,
  insertSnapshot,
  listSnapshots,
  type SnapshotDetail,
  type SnapshotSummary,
} from '../repos/snapshots'
import { captureSnapshot, type CaptureHooks } from '../services/snapshot-capture'

const ProjectIdParams = z.object({ projectId: z.uuid() })
const SnapshotParams = z.object({ projectId: z.uuid(), snapshotId: z.uuid() })

/**
 * 태그는 **이름이므로 짧다**(계획서 D7 — 1~60자). 설명은 0~2000자로 코멘트 본문·프로젝트
 * 설명과 같은 값이다(P5-1 이월 #4) — 상한이 없으면 비용이 payload로 옮겨 간다.
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
 * 목록 항목의 응답 형태. **`payload`가 없다**(계획서 D9) — 본문은 상세만 준다.
 * `payloadBytes`는 §16의 보관 정책을 닫을 관측이다.
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
 * 결정적으로 만들지 못하면 D6의 방어를 잴 수 없다). 테스트는 이 팩토리를 **다른 prefix로**
 * 한 번 더 등록해 같은 핸들러를 재현한다 — 라우트를 베끼면 그 사본이 진짜 라우트와 갈린다.
 */
export function snapshotRoutes(options?: { captureHooks?: CaptureHooks }) {
  return async function plugin(app: FastifyInstance): Promise<void> {
    /**
     * **지금 상태를 태그 하나로 얼린다.** §10이 editor에게 연 자리다.
     *
     * 순서가 규격이다: 본문 검증 → NUL → **캡처** → 삽입. 캡처가 먼저인 것은 지문
     * 불일치가 **아무것도 쓰지 않고** 끝나야 하기 때문이다(사실 5 — *"실패했다고 말하는데
     * 조작은 일어났다"*). 태그 중복은 반대로 삽입 시점에야 드러나는데, 그때는 캡처가
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
        // **재시도 루프를 넣지 않는다**(D6) — `PUT .../schema`가 같은 자리에서 같은 판단을
        // 했다. 문장이 태그 중복과 달라야 화면이 *"다시 시도한다"*와 *"이름을 바꾼다"*를
        // 가를 수 있다(위 오류 표).
        throw conflict('스냅샷을 뜨는 동안 프로젝트가 바뀌었습니다. 다시 시도해 주세요')
      }

      let record: SnapshotDetail
      try {
        record = await insertSnapshot(app.db, {
          projectId,
          tag: body.tag,
          description: body.description ?? null,
          payload: outcome.payload,
          createdBy: currentUser.id,
        })
      } catch (error) {
        if (error instanceof SnapshotNulByteError) {
          // repo의 마지막 방벽에 걸렸다. 위에서 본문 둘은 이미 걸렀으므로 여기 오는 것은
          // payload 안의 NUL이고, 그 도달 경로는 오늘 0이다(`repos/snapshots.ts`의 재라 #3 절).
          throw badRequest(error.message)
        }
        if (isUniqueViolation(error)) {
          throw conflict('같은 태그의 스냅샷이 이미 있습니다')
        }
        throw error
      }

      return reply.status(201).send(toDetailResponse(record))
    })

    /** 목록. **payload 본문을 싣지 않는다**(D9) — 크기만 낸다. */
    app.get('/:projectId/snapshots', { preHandler: projectGuard('viewer') }, async (request) => {
      const { projectId } = parseParams(ProjectIdParams, request.params)
      const records = await listSnapshots(app.db, projectId)
      return records.map(toSummaryResponse)
    })

    /**
     * 상세. **payload 본문을 함께 낸다.**
     *
     * **`payloadVersion`을 여기서 막지 않는다**(D3). 태그는 지워지지 않는 기록이므로(§4.5)
     * 읽기까지 막으면 기록 자체가 사라진 것과 같다 — 모르는 버전을 거부하는 것은 **복원**
     * (P6-2)의 자리다.
     */
    app.get('/:projectId/snapshots/:snapshotId', { preHandler: projectGuard('viewer') }, async (request) => {
      const { projectId, snapshotId } = parseParams(SnapshotParams, request.params)
      const record = await findSnapshotById(app.db, projectId, snapshotId)
      if (!record) {
        // 남의 프로젝트의 스냅샷 id도 같은 404다 — 존재를 숨긴다(§10).
        throw notFound('스냅샷을 찾을 수 없습니다')
      }
      return toDetailResponse(record)
    })
  }
}
