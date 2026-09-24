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
 * 4. 레이아웃마다 `findThemeById` → 파생이면 `mergeTheme`으로 **얼린다**(아래 「테마를 얼리는 규칙」).
 * 5. `listProjectComments` — 코멘트.
 * 6. `readCaptureFingerprint` — **수집 후** 지문. **그 문장의 `clock_timestamp()`가
 *    `capturedAt`이 된다**(아래 "시각" 절).
 * 7. 두 지문이 다르면 `'fingerprint-mismatch'`. **여기서 끝난다.**
 * 8. payload를 조립하고 `SnapshotPayloadSchema`로 파싱해 규격을 확인한다.
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
 * # 테마를 얼리는 규칙 (설계서 「스냅샷」)
 *
 * `services/project-theme.ts`의 `currentProjectTheme`과 **같은 사슬을 따라간다**: 레이아웃 → `theme_id` →
 * `themes` 행 → 파생이면 코드의 시스템 테마와 `mergeTheme`. 다른 점은 하나다 — 그쪽은
 * **기본 레이아웃 하나**를 보고, 여기는 **레이아웃 전부**를 본다.
 *
 * **`mergeTheme` 결과에 `extends`가 남지 않는다**: 병합 결과의
 * `meta`가 `{id, name, version}`뿐이고 문서 전체를 `JSON.stringify`해도 `"extends"` 문자열이
 * 없다. 그것이 이 규칙이 성립하는 조건이다 — 남아 있으면 payload가 자기완결이 아니고, 복원이
 * 그때의 base를 다시 요구하므로 「스냅샷」이 막으려던 일이 그대로 일어난다.
 *
 * ---
 *
 * # 시각 — `capturedAt`은 **수집 후 지문을 읽은 그 순간**이다
 *
 * **Node의 시계(`new Date()`)를 쓰지 않는다** — 그 값은 `snapshots.created_at`과 *"같은
 * 트랜잭션의 같은 시점"*이 아니고 수십 ms 어긋난다. 원인 셋은 `repos/snapshots.ts`의
 * `insertSnapshot` 머리말에 있다.
 *
 * 그 값은 **6단계 문장의 `clock_timestamp()`**이고 `insertSnapshot`이 그것을
 * `created_at`에 그대로 심는다. **왜 6단계인가:** 그 순간이 *"payload의 내용이 그대로임을
 * 마지막으로 확인한"* 시점이다. 0단계(수집 전)를 쓰면 그 뒤 수집 동안 상태가 그대로였다는
 * 것만 알 뿐, 그 시각의 상태가 payload와 같다는 보장을 **앞쪽 끝**에서 주장하게 된다 —
 * 둘 다 참이지만 뒤쪽이 더 강한 진술이고, 지문이 증명하는 구간의 **닫는 끝**이다.
 *
 * **`theme: null`이 되는 갈래가 셋이다.** 레이아웃이 테마를 안 골랐거나, 그 행이
 * 사라졌거나, 파생의 상속 대상이 코드에 없다(`systemTheme()`이 `undefined`). 셋 다
 * **캡처를 실패시키지 않는다** — 캡처는 읽기 연산이고, 읽기가 실패하면 사용자는 얼릴
 * 수단 자체를 잃는다(문서를 마이그레이션하지 않고 담는 판단과 같다).
 */
import { mergeTheme, systemTheme, type Theme, type ThemePatch } from '@wirebound/themes'
import type { DbHandle } from '../db/tx'
import { listProjectComments } from '../repos/comments'
import { listLayouts } from '../repos/layouts'
import { listMenuNodes } from '../repos/menu'
import { listPages } from '../repos/pages'
import { findThemeById } from '../repos/themes'
import { readCaptureFingerprint } from '../repos/snapshots'
import {
  SNAPSHOT_PAYLOAD_VERSION,
  SnapshotPayloadSchema,
  type SnapshotLayoutTheme,
  type SnapshotPayload,
} from '@wirebound/themes'

/**
 * 캡처의 결과. **`'fingerprint-mismatch'`가 유일한 실패 갈래다** — 그 밖의 사정(테마가
 * 없다, 문서 버전이 미래다, 프로젝트가 비었다)은 전부 정상이고 payload에 그대로 실린다.
 */
export type CaptureOutcome =
  | { kind: 'captured'; payload: SnapshotPayload }
  | { kind: 'fingerprint-mismatch' }

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

export async function captureSnapshot(
  db: DbHandle,
  projectId: string,
  hooks?: CaptureHooks,
): Promise<CaptureOutcome> {
  const before = await readCaptureFingerprint(db, projectId)

  const menu = await listMenuNodes(db, projectId)
  const pages = await listPages(db, projectId)

  if (hooks?.afterPages) await hooks.afterPages()

  const layouts = await listLayouts(db, projectId)
  const themes: SnapshotLayoutTheme[] = []
  for (const layout of layouts) {
    themes.push({ layoutId: layout.id, themeId: layout.themeId, theme: await freezeTheme(db, layout.themeId) })
  }
  const comments = await listProjectComments(db, projectId)

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
      themeId: layout.themeId,
      schema: layout.schema,
    })),
    themes,
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
  }

  // **규격을 지나게 한다.** 통과하지 못하면 그것은 이 파일의 버그이므로 조용히 저장하지
  // 않고 크게 실패한다 — `insertComment`가 *"방금 만든 코멘트를 다시 읽지 못했습니다"*로
  // 던지는 것과 같은 자리다. 여기서 막히는 것은 봉투가 깨진 문서뿐이고(버전 값의 의미는
  // 보지 않는다 — `@wirebound/themes`의 `snapshot/payload.ts`의 「저장된 문서를 그대로 담는다」 절), 그런 문서는 쓰기 경로가 이미 거부한다.
  return { kind: 'captured', payload: SnapshotPayloadSchema.parse(payload) }
}

/**
 * 레이아웃이 가리키는 테마를 **홀로 서는 문서**로 얼린다. `services/project-theme.ts`의
 * `currentProjectTheme`이 기본 레이아웃 하나에 대해 하는 일과 같다.
 *
 * **export하는 것은 복원 때문이다.** 복원은 테마 **행**을 되돌리지 않고 참조만
 * 되돌린 뒤, *"그 참조가 가리키는 지금 테마가 payload의 동결본과 같은가"*를 응답에 싣는다.
 * 그 판정을 복원이 따로 짜면 **얼리는 규칙이 두 벌이 되어** 한쪽만 고쳐지는 날 화면이
 * 없는 차이를 말하거나 있는 차이를 놓친다.
 */
export async function freezeTheme(db: DbHandle, themeId: string | null): Promise<Theme | null> {
  if (themeId === null) return null

  const record = await findThemeById(db, themeId)
  if (!record) return null

  const stored = record.theme
  if (stored.meta.extends === undefined) return stored

  const base = systemTheme(stored.meta.extends)
  // 상속 대상이 코드에 없다 — 지금 그릴 수 없는 테마이고, 그것을 그대로 얼리면 payload가
  // 자기완결이 아니게 된다. 캡처를 실패시키지는 않는다(위 머리말의 셋째 갈래).
  if (base === undefined) return null

  return mergeTheme(base, stored as ThemePatch).theme
}
