/**
 * **잃음을 말하는 통지를 합친다** — 편집 실패 통지 자리(`shell/edit-alert.tsx`)는 하나이고, 편집을 잃었다고 말하는 쪽은 여럿이 **제 때에**
 * 온다(`EditorStore.tellLoss`를 부르는 자리: 리베이스 버림 · 편집 실패 수습 · 판을 다시 싣는 조회 · 떠남). 하나가 앞의 것을 덮어쓰면 앞 통지가
 * 말한 잃음이 화면에서 사라진다(jsdom: 복원 다시 읽기가 버린 편집의 문장을 늦게 온 수습의 답이 덮음 · 떠남 통지를 재연결 재조회의 «이력
 * 초기화»가 덮음 · 새 페이지의 리베이스 버림을 앞 페이지의 늦은 거절이 덮음). 그래서 잃음은 **조각으로 들고** 앞 조각 뒤에 잇는다.
 *
 * **끝없이 길어지지 않는다 — 같은 열쇠(`key`)의 조각은 수(`counts`)를 자리마다 더한다.** 열쇠는 문장의 틀 하나마다 하나라 조각 수는 틀의
 * 수를 넘지 않는다(수습의 거절은 틀 하나를 까닭 — 거절의 `code`와 서버 문장의 머리 — 마다 가른다: 까닭이 다른 두 거절을 합치면 뒤 까닭으로
 * 읽힌다 — `edit/use-edit-commit.tsx`의 `refusedLoss` · `refusalHead`). 틀 안의 서버 문장 전체(`409`의 번호처럼 매번 다르다)는 열쇠에 넣지
 * 않는다 — 넣으면 거절마다 조각이 는다. 합친 조각은 뒤에 온
 * 것의 문장 함수로 짓는다.
 *
 * **세기로 줄 세운다**(`LOSS_RANK`) — 반영됐는지 모르는 것(다시 확인해야 한다)이 앞, 저장되지 않은 것, 되돌리기 이력만 잃은 것이 뒤다.
 * 세션이 끊긴 통지(`signed-out`)는 조각이 아니다 — 그 통지는 셸을 로그인으로 보내고, 뒤에 온 잃음이 그것을 덮지 않는다(`tellLoss`).
 *
 * **조각이 아닌 통지(`EditorStore.setEditFailure`)는 앞 조각을 통째로 치운다** — 새 편집 · 되돌리기 · 패턴 · 프리셋처럼 사람이 방금 누른
 * 동작의 결과라서다. 그러니 **비동기로 오는 약한 통지**(잃은 편집은 없고 되돌리기 이력만 못 실었다 — 세기 `history`)를 `setEditFailure`로
 * 세우면 그 사이 선 잃음 조각을 지운다. 그런 통지는 `tellLoss`에 `LOSS_RANK.history`로 싣는다 — 앞 잃음 뒤에 이어지고 세기 순으로 맨
 * 끝에 선다. 사람이 누른 동작의 통지까지 덮지 않으려면 `overOther: false`를 준다(`routes/editor.tsx`의 `UNDO_RESTORE_DROPPED_NOTICE`).
 * «통지가 비어 있을 때만 `setEditFailure`로 세운다»로 비켜 가면 덮지는 않지만, 그 뒤에 온 잃음 조각이 그 통지를 앞 조각으로 보지 않아
 * **덮는다**(조각이 아닌 통지 뒤의 `tellLoss`는 새로 시작한다).
 */

/** 조각의 세기. 클수록 앞에 선다 — 숫자는 서로의 순서로만 뜻이 있다. */
export const LOSS_RANK = {
  /** 되돌리기 이력만 잃었다. */
  history: 0,
  /** 편집이 저장되지 않았다(취소 · 버림 · 거절). */
  cancelled: 1,
  /** 보낸 편집이 서버에 반영됐는지 모른다 — 다시 확인해야 한다. */
  unknown: 2,
} as const

export interface LossPart {
  /** 합치는 열쇠 — 문장의 틀 하나에 하나다(머리말). */
  key: string
  /** 세기(`LOSS_RANK`). 합치면 큰 쪽이다. */
  rank: number
  /** 문장이 싣는 수 — 같은 열쇠끼리 자리마다 더한다. */
  counts: readonly number[]
  /**
   * 수로 문장을 짓는다. **수가 없는 조각(`counts`가 비었다)은 합치면 뒤에 온 문장이 선다** — 떠남(거절의 문장이 떠날 때 버린 것까지 합쳐
   * 센다 — `EditorStore.abandonedUnsent`)과 «다시 불러오지 못했다»가 그렇다.
   */
  render: (counts: readonly number[]) => string
  /**
   * **판을 비워도 남는다**(`EditorStore.clearPage` · `reset`) — 떠난 뒤의 화면에 서는 것이 요점인 조각이다(떠남). `pages`는 그 조각이 «다시
   * 열어 확인하세요»라고 가리키는 페이지다 — 전부 다시 열면 그 조각이 풀린다(`EditorStore.loadPage`). 비어 있으면 다시 열어 풀리지 않는다.
   */
  sticky?: { pages: readonly string[] }
  /**
   * **판을 다시 실으면 거짓이 된다** — «화면에 남아 있는 편집은 저장되지 않았습니다»(수습이 판을 못 읽은 갈래). 덮어쓰던 때는 뒤에 온 통지가
   * 그 문장을 치웠다 — 잇는 지금은 판이 실리는 자리가 치운다(`EditorStore.loadPage`).
   */
  untilLoad?: boolean
}

/** 조각 하나를 목록에 더한다 — 같은 열쇠가 있으면 그 자리에서 합치고(머리말), 없으면 뒤에 붙인다. */
export function mergeLoss(parts: readonly LossPart[], told: LossPart): LossPart[] {
  const at = parts.findIndex((part) => part.key === told.key)
  if (at < 0) return [...parts, told]
  const before = parts[at]!
  const merged: LossPart = {
    ...told,
    rank: Math.max(before.rank, told.rank),
    counts: told.counts.map((count, index) => count + (before.counts[index] ?? 0)),
  }
  return parts.map((part, index) => (index === at ? merged : part))
}

/** 목록을 한 문장으로 — 세기 순이고 같은 세기는 먼저 온 것이 앞이다(`Array.prototype.sort`는 안정 정렬이다). */
export function lossMessage(parts: readonly LossPart[]): string {
  return [...parts]
    .sort((a, b) => b.rank - a.rank)
    .map((part) => part.render(part.counts))
    .join(' ')
}
