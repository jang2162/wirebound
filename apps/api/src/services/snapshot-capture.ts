/**
 * 스냅샷 캡처 — 설계서 「스냅샷」의 **얼리는 쪽**이다. 되돌리는 쪽(복원)은 `services/restore.ts`다.
 *
 * `services/`는 SQL을 직접 쓰지 않고 HTTP도 모른다 — `repos/`의 함수를 조율할 뿐이다
 * (`edit-pipeline.ts`와 같은 자리). zod도 Fastify도 상태 코드도 이 파일에 없다.
 *
 * ---
 *
 * # 아래 순서 자체가 규격이다
 *
 * 0. `readCaptureFingerprint` — **수집 전** 지문.
 * 1. `listMenuNodes` — 메뉴.
 * 2. `listPages` — 페이지(문서 포함, **마이그레이션 없이** — `@wirebound/themes`의 `snapshot/payload.ts` 「저장된 문서를 그대로 담는다」 절).
 * 3. `listLayouts` — 레이아웃 **전부**(프로젝트의 레이아웃이 하나라는 보장이 없다).
 * 4. `listProjectComments` — 코멘트.
 * 5. `readCaptureFingerprint` — **수집 후** 지문. **그 문장의 `clock_timestamp()`가
 *    `capturedAt`이 된다**(아래 "시각" 절).
 * 6. 두 지문이 다르면 `'fingerprint-mismatch'`. **여기서 끝난다.**
 * 7. payload를 조립하고 `SnapshotPayloadSchema`로 파싱해 규격을 확인한다.
 *
 * **이 함수는 아무것도 쓰지 않는다.** 새 실패 갈래마다 *"이 갈래는 무엇을 되돌리는가"*를
 * 묻는다(*"실패했다고 말하는데 조작은 일어났다"*를 막으려고) — 이 갈래의 답은 **"되돌릴 것이 없다"**이다 — 쓰기는 라우트가 이 함수의 결과를
 * 받은 **뒤에** 한다(`repos/snapshots.ts`의 `insertSnapshot`). 판정을 쓰기보다 먼저 하는
 * 배치 자체가 그 성질을 만든다. `snapshot-capture.test.ts`가 지문 불일치 뒤 `snapshots`
 * 행이 0인 것을 케이스로 고정한다.
 *
 * **던지지 않고 값으로 돌려준다.** `edit-pipeline.ts`가 같은 이유로 판별 유니온을 쓴다 —
 * 실패 사유를 값으로 돌려주는 설계에 예외를 섞으면 호출자가 두 경로를 모두 다뤄야 한다.
 *
 * ---
 *
 * # 지문이 왜 필요한가
 *
 * 근거와 실측표는 `repos/snapshots.ts`의 `readCaptureFingerprint` 머리말에 있다. 요지:
 * `withTransaction`은 **이미 트랜잭션 안이면** 격리 수준을 못 올리고(`25001`), 라우트는
 * 자기가 어느 쪽인지 모른다. READ COMMITTED에서는 SELECT마다 스냅샷이 새로 잡히므로
 * **한 번도 함께 존재한 적 없는 조합**이 payload에 담길 수 있다.
 *
 * **재시도 루프를 넣지 않는다** — `PUT .../schema`가 같은 자리에서 같은 판단을 한다.
 *
 * ---
 *
 * # 시각 — `capturedAt`은 **수집 후 지문을 읽은 그 순간**이다
 *
 * **Node의 시계(`new Date()`)를 쓰지 않는다** — 그 값은 `snapshots.created_at`과 *"같은
 * 트랜잭션의 같은 시점"*이 아니고 수십 ms 어긋난다. 원인 셋은 `repos/snapshots.ts`의
 * `insertSnapshot` 머리말에 있다.
 *
 * 그 값은 **5단계 문장의 `clock_timestamp()`**이고 `insertSnapshot`이 그것을
 * `created_at`에 그대로 심는다. **왜 5단계인가:** 그 순간이 *"payload의 내용이 그대로임을
 * 마지막으로 확인한"* 시점이다. 0단계(수집 전)를 쓰면 그 뒤 수집 동안 상태가 그대로였다는
 * 것만 알 뿐, 그 시각의 상태가 payload와 같다는 보장을 **앞쪽 끝**에서 주장하게 된다 —
 * 둘 다 참이지만 뒤쪽이 더 강한 진술이고, 지문이 증명하는 구간의 **닫는 끝**이다.
 */
import type { DbHandle } from '../db/tx'
import { listProjectComments } from '../repos/comments'
import { listLayouts } from '../repos/layouts'
import { listMenuNodes } from '../repos/menu'
import { listPages } from '../repos/pages'
import { findProjectTheme } from '../repos/projects'
import { readCaptureFingerprint } from '../repos/snapshots'
import { SNAPSHOT_PAYLOAD_VERSION, SnapshotPayloadSchema, type SnapshotPayload } from '@wirebound/themes'

/**
 * 캡처의 결과. **`'fingerprint-mismatch'`가 유일한 실패 갈래다** — 그 밖의 사정(문서
 * 버전이 미래다, 프로젝트가 비었다)은 전부 정상이고 payload에 그대로 실린다.
 */
export type CaptureOutcome = { kind: 'captured'; payload: SnapshotPayload } | { kind: 'fingerprint-mismatch' }

/**
 * 수집 도중에 끼어들 자리. **테스트 전용이다** — 운영 코드(`routes/snapshots.ts`)는 절대
 * 채우지 않는다. `app.ts`의 `BuildAppOptions.loggerStream`과 같은 부류의 이음매다.
 *
 * **왜 이것이 없으면 잴 수 없는가.** 지문이 막는 것은 *"수집이 도는 동안 남이 커밋한다"*인데,
 * 그 타이밍은 바깥에서 만들 수 없다 — 요청 하나가 통째로 도는 사이에 다른 커넥션을 정확한
 * 지점에 밀어 넣어야 하고, `Promise.all` + 지연으로 흉내 내면 그 케이스가 타이밍에
 * 흔들린다. 이 이음매가 그 지점을 **결정적으로** 만든다.
 *
 * **`afterPages`인 것이 요점이다.** 수집의 **한가운데**(페이지는 읽었고 코멘트는 아직)여야
 * *"한 시점에 존재한 적 없는 payload"*가 실제로 만들어진다 — 수집이 다 끝난 뒤에 끼어들면
 * payload는 전부 편집 이전 값이라 그 자체로는 모순이 없다.
 */
export interface CaptureHooks {
  afterPages?: () => Promise<void>
}

export async function captureSnapshot(db: DbHandle, projectId: string, hooks?: CaptureHooks): Promise<CaptureOutcome> {
  const before = await readCaptureFingerprint(db, projectId)

  const menu = await listMenuNodes(db, projectId)
  const pages = await listPages(db, projectId)

  if (hooks?.afterPages) await hooks.afterPages()

  const layouts = await listLayouts(db, projectId)
  const comments = await listProjectComments(db, projectId)
  const binding = await findProjectTheme(db, projectId)

  const after = await readCaptureFingerprint(db, projectId)
  if (after.fingerprint !== before.fingerprint) return { kind: 'fingerprint-mismatch' }

  const payload: SnapshotPayload = {
    payloadVersion: SNAPSHOT_PAYLOAD_VERSION,
    // **수집 후 지문을 읽은 그 문장의 `clock_timestamp()`다** — Node의 시계가 아니다.
    // 뜻은 *"캡처가 payload의 내용을 마지막으로 확인한 순간"*이고, `insertSnapshot`이
    // 이 값을 `snapshots.created_at`에 그대로 심어 **둘이 같은 값이 된다**
    // (`repos/snapshots.ts`의 두 머리말).
    capturedAt: after.at.toISOString(),
    menu: menu.map((node) => ({
      id: node.id,
      parentId: node.parentId,
      title: node.title,
      sortOrder: node.sortOrder,
    })),
    pages: pages.map((page) => ({
      id: page.id,
      menuNodeId: page.menuNodeId,
      title: page.title,
      description: page.description,
      sortOrder: page.sortOrder,
      // **DB에 있는 값 그대로다** — `migrateDocument`를 부르지 않는다.
      schemaVersion: page.schemaVersion,
      schema: page.schema,
      headSeq: page.headSeq,
    })),
    layouts: layouts.map((layout) => ({
      id: layout.id,
      name: layout.name,
      schema: layout.schema,
    })),
    comments: comments.map((comment) => ({
      id: comment.id,
      pageId: comment.pageId,
      nodeId: comment.nodeId,
      body: comment.body,
      authorId: comment.authorId,
      authorName: comment.authorName,
      createdAt: comment.createdAt.toISOString(),
      updatedAt: comment.updatedAt.toISOString(),
    })),
    // 테마는 참조로 얼린다 — 패키지는 지우지 않는다(`@wirebound/themes`의 `snapshot/payload.ts` 「테마는 참조로 얼린다」 절).
    theme:
      binding?.themeId == null || binding.version == null
        ? null
        : { themeId: binding.themeId, version: binding.version, tokens: binding.tokens },
  }

  // **규격을 지나게 한다.** 통과하지 못하면 그것은 이 파일의 버그이므로 조용히 저장하지
  // 않고 크게 실패한다 — `insertComment`가 *"방금 만든 코멘트를 다시 읽지 못했습니다"*로
  // 던지는 것과 같은 자리다. 여기서 막히는 것은 봉투가 깨진 문서뿐이고(버전 값의 의미는
  // 보지 않는다 — `@wirebound/themes`의 `snapshot/payload.ts`의 「저장된 문서를 그대로 담는다」 절), 그런 문서는 쓰기 경로가 이미 거부한다.
  return { kind: 'captured', payload: SnapshotPayloadSchema.parse(payload) }
}
