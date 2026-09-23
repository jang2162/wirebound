/**
 * **페이지 메타(제목 · 설명)의 충돌 모델 — 화면 쪽의 한 자리**(이월 P = AB · 2026-09-23). 서버의 계약표는
 * `apps/api/src/routes/pages.ts`의 `PATCH` 머리말이 소유한다: 저장할 때 **고치기 전 값**(`base`)을 함께 보내고,
 * 서버는 행 잠금 안에서 지금 값과 견줘 다르면 409 · 이슈 코드 `page-meta-changed` · 칸마다 지금 값(`current`)이다.
 *
 * 이 파일이 소유하는 것은 둘이다 — **409 를 읽는 법**(`metaConflict`)과 **서버 값 하나를 세 갈래로 가르는 판정**
 * (`judgeMeta`). 제목을 고치는 자리(`tree/use-tree-commands.tsx`의 이름 변경)와 설명을 고치는 자리
 * (`panels/page-description.tsx`)가 **같은 둘을 지난다** — 두 자리가 따로 가르면 한쪽만 낡는다. 화면(«다른 사람이
 * 바꿨습니다» · 덮기 · 버리기)은 `panels/meta-conflict.tsx` 하나다.
 *
 * **React 를 모른다** — 순수 함수 둘이라 케이스가 화면을 안 지나고 잰다.
 */
import { samePageMeta } from '@wirebound/schema'
import { ApiError } from './client'

/** 서버의 `PAGE_META_CHANGED`와 같은 글자다(`apps/api/src/routes/pages.ts`). **문장으로 가르지 않는다.** */
export const PAGE_META_CHANGED = 'page-meta-changed'

/** 충돌 모델이 보는 칸. 순서 · 소속 메뉴는 이 모델 밖이다. */
export type MetaField = 'title' | 'description'

/**
 * 실패가 **그 칸의 페이지 메타 충돌**이면 서버가 견준 지금 값을, 아니면 `null`을 낸다.
 *
 * 409 라도 이슈 코드가 없으면 충돌이 아니다 — 이 라우트가 오늘 내는 409 는 이것뿐이지만, 코드로 갈라 두면 409 가
 * 느는 날에도 조용히 섞이지 않는다. 이슈에 `current`가 없는(계약 밖) 응답도 충돌로 치지 않는다 — «다른 사람의
 * 값»을 못 보이는 충돌 화면을 짓지 않는다. 그때는 여느 실패처럼 서버 문장이 선다.
 */
export function metaConflict(caught: unknown, field: MetaField): { current: string | null } | null {
  if (!(caught instanceof ApiError) || caught.code !== 'conflict') return null
  const issue = caught.issues.find((item) => item.code === PAGE_META_CHANGED && item.path === field)
  if (issue === undefined) return null
  const current: unknown = issue.current
  if (current === null || typeof current === 'string') return { current }
  return null
}

/**
 * 서버 값이 무엇과 같은가 — **판정 함수는 이것 하나다.**
 *
 * | 갈래 | 서버 값 | 뜻 |
 * |---|---|---|
 * | `'mine'` | 내가 보낸 값과 같다 | 원하던 상태다 — 저장됐거나, 누가 같은 값을 먼저 저장했다 |
 * | `'base'` | 고치기 전 값과 같다 | 내 저장이 (아직) 안 닿았다 — 초안을 남기고 다시 보낼 수 있다 |
 * | `'late'` | **매달린 내 값**(`pending`) 중 하나와 같다 | 대개 **앞서 보낸 내 저장이 늦게 닿았다** — 남이 같은 글을 쓴 판과 못 가른다(화면은 «같습니다»로만 말한다 — 리뷰 F2-F1) |
 * | `'other'` | 어느 것도 아니다 | **다른 사람이 바꿨다** — 충돌 화면 |
 *
 * 부르는 자리가 둘이다: 시간 안에 응답이 없어 **다시 읽은 값**(설명 — `write-ledger.tsx`의 «모름»)과 409 에 실려
 * 온 **지금 값**(설명 · 제목). 409 의 값은 서버가 바탕과 다르다고 판정한 값이라 `'base'`로 오지 않는다.
 *
 * **매달린 내 값**(리뷰 F2): «모름»의 판정이 `'base'`(«저장되지 않았습니다»)였던 쓰기는 **끊겼을 뿐 죽지 않았을 수
 * 있다** — 서버가 이미 받은 요청은 끊긴 뒤에도 커밋한다(Chrome: 잠금에 붙잡힌 PATCH 가 풀린 뒤 커밋). 그 글을
 * 부르는 자리가 들고 있다가 여기 넘긴다. 없으면 그 늦은 커밋이 `'other'` — **내 글이 «다른 사람의 값»으로** 보였다.
 * 누가 같은 글을 먼저 썼는지는 못 가른다(`'mine'`과 같은 한계다).
 *
 * **`mine`이 `base`보다, `base`가 `late`보다 먼저다** — 둘이 같으면(바꾼 것이 없는데 보냈다) «원하던 상태»다. 화면은
 * 바꾼 것이 없으면 보내지 않지만(설명의 `dirty`), 이 함수가 그것을 전제하지 않는다.
 *
 * **빈 값은 `''`든 `null`이든 같다**(`@wirebound/schema`의 `samePageMeta` — 서버의 견주기와 **같은 함수**다). 화면에서
 * 둘은 똑같이 «설명 없음»이다 — 가르면 나는 상자를 비웠고(`null`) 남은 `''`를 저장한 판이 «다른 사람이 바꿨습니다 /
 * (설명 없음)»으로 선다(리뷰 F3).
 */
export type MetaVerdict = 'mine' | 'base' | 'late' | 'other'

export function judgeMeta<T extends string | null>(server: T, mine: T, base: T, pending: readonly T[] = []): MetaVerdict {
  if (samePageMeta(server, mine)) return 'mine'
  if (samePageMeta(server, base)) return 'base'
  if (pending.some((value) => samePageMeta(server, value))) return 'late'
  return 'other'
}
