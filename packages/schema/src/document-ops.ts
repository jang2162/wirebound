/**
 * 페이지 문서를 **통째로 갈아 끼우는** 묶음 — `PUT …/schema` · 페이지 JSON 가져오기 · 스냅샷 복원과 그 방송이 쓴다(`apps/api`).
 * `applyOp`는 문서 루트(`""`)에 연산을 적용하지 못하므로 문서의 필드마다 따로 갈아 끼운다: `/root` · `/viewStates` · `/version`.
 *
 * **`/viewStates`를 빼먹으면 조용히 낡는다** — `/root`만 갈아 끼우면 상태 목록은 옛 것이 남고(새 문서에 없던 상태가 남거나 새 상태가
 * 빠진다), 검증은 목록 밖 가지를 오류로 보지 않아(lint 의 몫) 아무것도 막지 않는다. 그래서 세 자리가 이 함수 하나를 부른다.
 *
 * - `next`에 목록이 있으면 `add /viewStates`(객체 멤버의 `add`는 있으면 바꾸고 없으면 만든다 — RFC 6902).
 * - `next`에 없고 `before`에 있으면 `remove /viewStates`. 둘 다 없으면 아무것도 안 낸다.
 * - `/version`은 같은 값이어도 낸다 — 역연산이 마이그레이션으로 올라간 버전까지 되돌린다(`apps/api`의 `routes/pages.ts` PUT 주석).
 *
 * `before`는 그 묶음이 설 문서(파이프라인이 잠그고 읽은 것과 같은 head)여야 한다 — 다르면 `remove`가 없는 키에 닿아 `patch-failed`다.
 */
import type { PageDocument } from './node'
import type { PatchOp } from './patch/types'

export function replaceDocumentOps(before: { viewStates?: unknown }, next: PageDocument): PatchOp[] {
  const ops: PatchOp[] = [{ op: 'replace', path: '/root', value: next.root }]
  if (next.viewStates !== undefined) ops.push({ op: 'add', path: '/viewStates', value: next.viewStates })
  else if (before.viewStates !== undefined) ops.push({ op: 'remove', path: '/viewStates' })
  ops.push({ op: 'replace', path: '/version', value: next.version })
  return ops
}
