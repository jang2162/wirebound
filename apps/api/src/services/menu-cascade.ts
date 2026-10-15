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
 * 2. `readMenuSubtree` → **권한 재확인**(`recheck`) → 없으면 `not-found`. 재확인이 «없다»(404)보다도 목록을 견주기보다도 **먼저**다. 잠금을 기다리는 동안 멤버에서
 *    빠진 사람에게 «지워졌다»(404)나 지금 목록(409)을 흘리지 않는다(`routes/menu.ts`의 `PATCH` 머리말 «재확인이 견줌보다 먼저다»와 같은 까닭).
 * 3. 화면이 본 **id 집합**(밑의 메뉴 · 페이지)과 견준다 — 다르면 `subtree-changed`(지금 목록을 싣는다). **여기까지 아무것도 쓰지 않는다.**
 *    수로 견주지 않는 까닭: 남이 하나 빼고 하나 넣으면 수가 같아, 사람이 본 적 없는 페이지를 지우고 본 페이지를 남긴다. 이름만 바뀐 판은
 *    같은 행이라 지나간다(상자의 이름이 낡았을 뿐 지우는 것은 본 그 행이다).
 * 4. `captureSnapshot` → `insertSnapshot` — **안전망 스냅샷**. 첫 쓰기다.
 * 5. `trimCascadeSafetySnapshots` — 상한 밖의 옛 안전망을 지운다(아래 «안전망 스냅샷»).
 * 6. `deleteMenuSubtree`.
 *
 * 실패는 전부 4 앞에서 나므로 값으로 돌려줘도 커밋되는 것이 없다 — 4 의 태그 충돌만 던진다(그 뒤의 트랜잭션은 못 쓴다).
 *
 * # 안전망 스냅샷
 *
 * 연쇄 삭제는 페이지의 이력(`revisions` — CASCADE)까지 지워 되돌리기가 없다. 그래서 지우기 직전의 프로젝트를 스냅샷 하나로 남긴다 —
 * 그것으로 복원하면(owner) 지운 서브트리가 그 id 그대로 돌아온다. 태그는 `메뉴 "<제목>" 삭제 전 <capturedAt>`이고 제목은 태그
 * 상한(60자 — `routes/snapshots.ts`의 `SnapshotBody`)에 맞게 줄인다. 원래 제목 · id · 지운 수는 설명에 싣는다. 태그가 부딪히면(같은
 * 밀리초) 조용히 이름을 바꾸지 않고 실패한다 — 복원의 안전망과 같은 판단이다(`services/restore.ts` 머리말 «안전망 스냅샷»).
 *
 * **프로젝트마다 `CASCADE_SAFETY_KEEP`개까지 남긴다** — 넘으면 새 안전망을 넣은 뒤 같은 트랜잭션에서 오래된 것부터 지운다. 연쇄마다 프로젝트
 * 전체 payload 가 하나씩 쌓이고(`test/cascade-safety-keep.test.ts`), 오래된 안전망일수록 복원하면 그 뒤의 일을 더 많이 지워 쓸모가 준다.
 * 세는 것은 `kind = 'cascade-safety'` 뿐이다(`db/migrations/0022-snapshot-kind.ts`) — 태그 글자로 가르면 그 꼴로 적은 사람의 스냅샷을 지운다.
 * - **새 안전망을 넣은 뒤다.** 그 앞의 실패(404 · 409)는 값으로 돌아와 트랜잭션이 커밋되므로, 앞에서 지우면 거절된 연쇄가 안전망을 지운다.
 * - **프로젝트 행을 쥔 뒤다.** 복원과 프로젝트 삭제도 그 행을 먼저 쥔다 — 복원하는 중인 스냅샷은 그 복원이 끝난 뒤에 지우고, 잠그기 전에
 *   지우면 프로젝트 삭제의 CASCADE 와 교착한다(`test/menu-cascade-concurrency.test.ts` «안전망 상한»).
 */
import type { DbHandle } from '../db/tx'
import { deleteMenuSubtree, readMenuSubtree, type SubtreeEntry } from '../repos/menu'
import { insertSnapshot, lockProjectForRestore, trimCascadeSafetySnapshots } from '../repos/snapshots'
import { captureSnapshot } from './snapshot-capture'

/** 하위 메뉴 수(자기 빼고) · 페이지 수(자기와 하위에 매인 것 전부). 지운 뒤 답에 싣는다. */
export interface SubtreeCounts {
  menus: number
  pages: number
}

/** 화면이 확인 상자에 보인 것 — 밑의 메뉴 id(자기 빼고) · 자기와 밑에 매인 페이지 id. */
export interface SubtreeSeen {
  menuIds: readonly string[]
  pageIds: readonly string[]
}

/** 409 에 싣는 지금 목록 — 화면은 이것으로 상자를 다시 세운다(차례는 `MenuSubtree`의 `listing`). */
export interface SubtreeListing {
  title: string
  menus: SubtreeEntry[]
  pages: SubtreeEntry[]
}

export type MenuCascadeOutcome =
  | { kind: 'deleted'; deleted: SubtreeCounts; safety: { id: string; tag: string } }
  | { kind: 'not-found' }
  | { kind: 'subtree-changed'; subtree: SubtreeListing }
  | { kind: 'fingerprint-mismatch' }

function sameIds(seen: readonly string[], actual: readonly string[]): boolean {
  const set = new Set(seen)
  return set.size === actual.length && actual.every((id) => set.has(id))
}

/** 안전망 태그 충돌 — 첫 쓰기에서 나므로 던져 트랜잭션째 되돌린다(머리말). */
export class CascadeSafetyTagTakenError extends Error {
  constructor(readonly tag: string) {
    super('같은 이름의 안전망 스냅샷이 이미 있습니다 — 다시 시도하십시오')
    this.name = 'CascadeSafetyTagTakenError'
  }
}

/** 프로젝트마다 남기는 연쇄 삭제 안전망의 수(머리말 «안전망 스냅샷»). */
export const CASCADE_SAFETY_KEEP = 20

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
    seen: SubtreeSeen
    actorId: string
    /** 커밋 순간의 권한(`auth/roles.ts`의 `recheckProjectRole`) — 던지면 트랜잭션째 되돌아간다. */
    recheck: () => Promise<void>
  },
): Promise<MenuCascadeOutcome> {
  await lockProjectForRestore(trx, input.projectId)
  const subtree = await readMenuSubtree(trx, input.projectId, input.nodeId)
  // **재확인이 «메뉴가 없다»(404)보다 먼저다** — 잠금을 기다린 사이 빠지거나 내려간 사람이 «지워졌다»를 받으면 가드 응답과 갈린다.
  await input.recheck()
  if (subtree === null) return { kind: 'not-found' }

  if (!sameIds(input.seen.menuIds, subtree.descendantIds) || !sameIds(input.seen.pageIds, subtree.pageIds)) {
    return { kind: 'subtree-changed', subtree: { title: subtree.title, ...subtree.listing } }
  }
  const counts: SubtreeCounts = { menus: subtree.descendantIds.length, pages: subtree.pageIds.length }

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
      kind: 'cascade-safety',
    })
  } catch (error) {
    if (isUniqueViolation(error)) throw new CascadeSafetyTagTakenError(tag)
    throw error
  }

  await trimCascadeSafetySnapshots(trx, input.projectId, CASCADE_SAFETY_KEEP)
  await deleteMenuSubtree(trx, input.projectId, subtree)
  return { kind: 'deleted', deleted: counts, safety: { id: safety.id, tag: safety.tag } }
}
