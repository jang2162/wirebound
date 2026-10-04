/**
 * **끄는 포인터가 접힌 줄 위에 머물면 그 줄을 편다**(설계서 「설계서 화면 구조」 «트리 줄마다 접기» — 0.7s). 접힌 줄 안에 놓을 자리를 찾아
 * 가려면 사람이 끌기를 놓고 펴고 다시 끌 수밖에 없다.
 *
 * 끄는 쪽이 셋이다 — 구조 트리 줄 끌기 · 메뉴 트리 줄 끌기(`onOver`), 컴포넌트 카드 · 캔버스 손잡이가 트리 위를 지날 때(`drag/use-placement.ts`).
 * 셋 다 포인터 밑 줄(`[data-tree-row]`)을 이미 찾으므로 그 줄을 여기 넘긴다(`hoverRow`). **펴는 것은 그 트리가 한다** — 줄 요소에
 * `HOVER_OPEN_EVENT` 를 쏘고 트리가 제 상자에서 받아 제 접힘(`tree/collapse.ts`)을 푼다. 끌기 쪽이 트리의 접힘 열쇠를 알면 경로 층이
 * 트리 둘을 다 알아야 한다.
 *
 * **포인터가 멈춰도 연다** — `onOver` 는 움직일 때만 불리므로 타이머로 잰다. 다른 줄로 옮기거나 줄 밖으로 나가면 다시 잰다. 끌기가 끝나면
 * (뗌 · 취소 · Escape) 걷는다 — 놓은 뒤에 줄이 혼자 펴지지 않게. 접히지 않은 줄(`data-tree-collapsed` 가 없음)은 재지 않는다. 끌기 장치
 * (`drag/use-pointer-drag.ts`)는 안 바꾼다 — 끝을 그 장치가 듣는 것과 같은 창 이벤트로 듣는다.
 */

/** 머무는 시간(ms). */
export const HOVER_OPEN_MS = 700

/** 트리가 제 상자에서 받는 이벤트 — 대상은 줄 요소(`[data-tree-row]`)다. */
export const HOVER_OPEN_EVENT = 'wb-tree-hover-open'

let pending: { row: HTMLElement; timer: ReturnType<typeof setTimeout> } | null = null
/**
 * **뗀 이벤트를 나르는 동안은 재지 않는다.** 끌기 장치는 뗀 좌표로 `onOver` 를 한 번 더 묻고 놓는다(`drag/use-pointer-drag.ts` 머리말 «놓는
 * 답은 보인 답이다») — 그 물음이 타이머를 다시 세우면 놓은 뒤 0.7s 에 줄이 혼자 펴진다. 창의 붙잡는 단계(capture)가 끌기 장치보다 먼저
 * 듣고, 그 이벤트를 다 나른 뒤(다음 틱)에 푼다.
 */
let releasing = false
let listening = false

function stop(): void {
  if (pending === null) return
  clearTimeout(pending.timer)
  pending = null
}

function onRelease(): void {
  stop()
  releasing = true
  setTimeout(() => {
    releasing = false
  }, 0)
}

function onKey(event: KeyboardEvent): void {
  if (event.key === 'Escape') stop()
}

function listen(): void {
  if (listening) return
  listening = true
  window.addEventListener('pointerup', onRelease, true)
  window.addEventListener('pointercancel', onRelease, true)
  window.addEventListener('keydown', onKey, true)
}

/** 끄는 포인터 밑 줄 — 없으면 `null`(트리 밖). 끄는 동안 움직일 때마다 부른다. */
export function hoverRow(row: HTMLElement | null): void {
  listen()
  if (releasing) return
  if (row !== null && pending?.row === row) return
  stop()
  if (row === null || !row.hasAttribute('data-tree-collapsed')) return
  const timer = setTimeout(() => {
    pending = null
    if (row.isConnected) row.dispatchEvent(new CustomEvent(HOVER_OPEN_EVENT, { bubbles: true }))
  }, HOVER_OPEN_MS)
  pending = { row, timer }
}
