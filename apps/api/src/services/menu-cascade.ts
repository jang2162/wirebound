/**
 * 메뉴 연쇄 삭제 — 메뉴 하나와 그 밑의 메뉴 · 페이지를 한 트랜잭션에서 지운다(설계서 「메뉴 트리」의 삭제). `services/`는 SQL 을 직접 쓰지
 * 않고 HTTP 도 모른다 — `repos/`를 조율할 뿐이다(`restore.ts`와 같은 자리).
 *
 * # 아래 순서 자체가 규격이다
 *
 * 1. `lockProjectForRestore` — 프로젝트 행과 메뉴 · 페이지 · 레이아웃 · 코멘트를 **복원과 같은 차례**로 잠근다. 서브트리만 잠그지 않는
 *    까닭은 3 의 캡처다: 지문(`readCaptureFingerprint`)이 프로젝트 전체를 보므로 서브트리 밖의 편집 하나가 캡처를 깨뜨린다 — 바쁜
 *    프로젝트에서 삭제가 «다시 시도하십시오»로 되풀이된다. 복원과 같은 잠금을 쥐면 그 판단(무엇이 막히고 무엇이 안 막히나)도 복원의
 *    것을 그대로 받는다(`repos/snapshots.ts`의 `lockProjectForRestore` 머리말 · `test/restore-lock-census.test.ts`).
 * 2. `readMenuSubtree` — 없으면 `not-found`. 그 뒤 **권한 재확인**(`recheck`) — 수를 견주기 **전**이다. 잠금을 기다리는 동안 멤버에서
 *    빠진 사람에게 지금 수를 409 로 흘리지 않는다(`routes/menu.ts`의 `PATCH` 머리말 «재확인이 견줌보다 먼저다»와 같은 까닭).
 * 3. 화면이 본 수와 견준다 — 다르면 `subtree-changed`(지금 수를 싣는다). **여기까지 아무것도 쓰지 않는다.**
 * 4. `captureSnapshot` → `insertSnapshot` — **안전망 스냅샷**. 첫 쓰기다.
 * 5. `deleteMenuSubtree`.
 *
 * 실패는 전부 4 앞에서 나므로 값으로 돌려줘도 커밋되는 것이 없다 — 4 의 태그 충돌만 던진다(그 뒤의 트랜잭션은 못 쓴다).
 *
 * # 안전망 스냅샷
 *
 * 연쇄 삭제는 페이지의 이력(`revisions` — CASCADE)까지 지워 되돌리기가 없다. 그래서 지우기 직전의 프로젝트를 스냅샷 하나로 남긴다 —
 * 그것으로 복원하면(owner) 지운 서브트리가 그 id 그대로 돌아온다. 태그는 `메뉴 "<제목>" 삭제 전 <capturedAt>`이고 제목은 태그
 * 상한(60자 — `routes/snapshots.ts`의 `SnapshotBody`)에 맞게 줄인다. 원래 제목 · id · 지운 수는 설명에 싣는다. 태그가 부딪히면(같은
 * 밀리초) 조용히 이름을 바꾸지 않고 실패한다 — 복원의 안전망과 같은 판단이다(`services/restore.ts` 머리말 «안전망 스냅샷»).
 */
import type { DbHandle } from '../db/tx'
import { deleteMenuSubtree, readMenuSubtree } from '../repos/menu'
import { insertSnapshot, lockProjectForRestore } from '../repos/snapshots'
import { captureSnapshot } from './snapshot-capture'

/** 하위 메뉴 수(자기 빼고) · 페이지 수(자기와 하위에 매인 것 전부). 화면의 확인 문장이 보인 수다. */
export interface SubtreeCounts {
  menus: number
  pages: number
}

export type MenuCascadeOutcome =
  | { kind: 'deleted'; deleted: SubtreeCounts; safety: { id: string; tag: string } }
  | { kind: 'not-found' }
  | { kind: 'subtree-changed'; subtree: SubtreeCounts }
  | { kind: 'fingerprint-mismatch' }

/** 안전망 태그 충돌 — 첫 쓰기에서 나므로 던져 트랜잭션째 되돌린다(머리말). */
export class CascadeSafetyTagTakenError extends Error {
  constructor(readonly tag: string) {
    super('같은 이름의 안전망 스냅샷이 이미 있습니다 — 다시 시도하십시오')
    this.name = 'CascadeSafetyTagTakenError'
  }
}

/** 태그 상한(`routes/snapshots.ts`의 `SnapshotBody` — 60). */
const TAG_MAX = 60

/**
 * 안전망 태그. 제목을 줄이는 단위는 **코드 포인트**다 — UTF-16 단위로 자르면 서로게이트 한 짝이 남는다. 상한은 UTF-16 길이로 잰다
 * (zod 의 `max`가 그렇게 센다).
 */
export function cascadeSafetyTag(title: string, capturedAt: string): string {
  const frame = (name: string): string => `메뉴 "${name}" 삭제 전 ${capturedAt}`
  if (frame(title).length <= TAG_MAX) return frame(title)
  const points = [...title]
  while (points.length > 0 && frame(`${points.join('')}…`).length > TAG_MAX) points.pop()
  return frame(`${points.join('')}…`)
}

const UNIQUE_VIOLATION = '23505'

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === UNIQUE_VIOLATION
}

export async function deleteMenuCascade(
  trx: DbHandle,
  input: {
    projectId: string
    nodeId: string
    expect: SubtreeCounts
    actorId: string
    /** 커밋 순간의 권한(`auth/roles.ts`의 `recheckProjectRole`) — 던지면 트랜잭션째 되돌아간다. */
    recheck: () => Promise<void>
  },
): Promise<MenuCascadeOutcome> {
  await lockProjectForRestore(trx, input.projectId)
  const subtree = await readMenuSubtree(trx, input.projectId, input.nodeId)
  if (subtree === null) return { kind: 'not-found' }
  await input.recheck()

  const counts: SubtreeCounts = { menus: subtree.descendantIds.length, pages: subtree.pageIds.length }
  if (counts.menus !== input.expect.menus || counts.pages !== input.expect.pages) {
    return { kind: 'subtree-changed', subtree: counts }
  }

  const captured = await captureSnapshot(trx, input.projectId)
  if (captured.kind === 'fingerprint-mismatch') return { kind: 'fingerprint-mismatch' }
  const tag = cascadeSafetyTag(subtree.title, captured.payload.capturedAt)
  let safety
  try {
    safety = await insertSnapshot(trx, {
      projectId: input.projectId,
      tag,
      description: `메뉴 "${subtree.title}"와 하위 메뉴 ${counts.menus}개 · 페이지 ${counts.pages}개를 지우기 직전 상태 — 메뉴 ${subtree.id}`,
      payload: captured.payload,
      createdBy: input.actorId,
    })
  } catch (error) {
    if (isUniqueViolation(error)) throw new CascadeSafetyTagTakenError(tag)
    throw error
  }

  await deleteMenuSubtree(trx, input.projectId, subtree)
  return { kind: 'deleted', deleted: counts, safety: { id: safety.id, tag: safety.tag } }
}
