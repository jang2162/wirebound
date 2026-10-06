/**
 * **에디터 머리가 좁은 창에서 접히는 단계**(`routes/editor.tsx` 의 `wb-shell-head-tools` — 캔버스 도구가 머리의 «편집 / 뷰» 뒤에 선다).
 *
 * | 단계 | 창 폭 | 머리 |
 * |---|---|---|
 * | `wide` | `HEAD_SHORT_BELOW` 이상 | 로고 글자 «wirebound» · 뷰포트 폭 고르개 앞에 «뷰포트 폭» 글 · 줌 묶음(축소 / 값 / 확대 / 화면 맞춤) |
 * | `short` | 그보다 좁고 `HEAD_TIGHT_BELOW` 이상 | 로고를 아이콘만 남기고(`BrandLink` 의 `compact` — 접근 이름은 그대로) «뷰포트 폭» 글을 눈에서만 감춘다(접근 이름은 그대로 — 고르개의 이름이 그 글이다) |
 * | `tight` | 그보다 좁고 `HEAD_FOLD_BELOW` 이상 | 위에 더해 상태 전환기(`shell/view-state-switcher.tsx`)를 머리에서 빼고 셸 `…` 의 첫 항목들(상태 목록 · 상태 다루기)로 접는다 |
 * | `folded` | `HEAD_FOLD_BELOW` 보다 좁다 | 위에 더해 줌 묶음을 머리에서 빼고 셸 `…` 의 첫 항목들(축소 · 확대 · 화면 맞춤)로 접는다 · 구분선도 뺀다 |
 *
 * 머리의 양 끝에는 단계와 무관하게 좌측 · 우측 접기 토글이 선다(`shell/panel-fold.tsx` — 둘이 82 를 먹는다). 그 폭을 `short` 부터 로고 글자(78)가
 * 내준다.
 *
 * **문턱은 잰 값이다** — 편집 모드(되돌리기 묶음이 선 가장 넓은 머리) · 프로젝트 이름 «관리자 콘솔 설계서» 에서 머리가 한 줄에 드는 가장
 * 좁은 창 폭을 단계마다 이분 탐색한 값(Chrome)에 여유 20 남짓을 얹었다(값과 다시 재는 길은 아래 세 상수의 주석). 그래서 창 1440 은
 * `wide`, 900 은 `tight`, 700 은 `folded` 이고 셋 다 머리가 한 줄이다.
 *
 * **상태 전환기를 줌보다 먼저 접는다** — 줌은 어느 페이지에서나 쓰고, 상태 전환기는 상태가 있는 페이지에서만 고를 것이 있다. 전환기의 폭은
 * 지금 상태 이름에 달리지 않는다(긴 이름은 줄임표 — `shell.css` 의 `.wb-shell-action-menu-text`). 문턱은 «기본»으로 잰 값이다. 이름이 길면 왼쪽의 제목이 줄임표로 줄지 않고 머리가 줄을 바꾼다
 * (`.wb-shell-header` 의 `flex-wrap` — 넘치지는 않는다).
 *
 * **창 폭으로 가른다 — 머리를 재지 않는다.** 머리가 넘치는지를 재서 접으면 접은 뒤엔 넘치지 않아 다시 펴고, 편 뒤엔 다시 넘친다(문턱
 * 둘레에서 깜박인다). 창 폭은 접는 것이 바꾸지 않는 입력이라 그 고리가 없다. 대가는 위의 «이름이 길면»이다.
 *
 * jsdom 에는 `matchMedia` 가 없다 — 그때는 `wide` 다(접힌 판은 실브라우저 `build-test/editor-head-tools.test.ts` 가 잰다).
 */
import { useSyncExternalStore } from 'react'

export type HeadFold = 'wide' | 'short' | 'tight' | 'folded'

/**
 * 이보다 좁은 창이면 «뷰포트 폭» 글 · 로고 글자를 감춘다. 잰 값: 글이 선 머리(`wide`)가 한 줄에 드는 최소 창 폭 — 편집 1078 · 뷰 952. 여유 21.
 *
 * **다시 재는 길:** `build-test/editor-head-tools.test.ts` «머리 한 줄에 드는 최소 창 폭» 이 지금 문턱의 단계로 이분 탐색해 로그를 낸다 — 단계마다
 * 재려면 세 상수를 `0 · 0 · 0`(wide) · `99999 · 0 · 0`(short) · `99999 · 99999 · 0`(tight) · `99999 · 99999 · 99999`(folded)로 바꿔 돌린다.
 * 넷째 단계의 값: 편집 687 · 뷰 561(창 700 의 여유 13 — 접힌 머리는 구분선도 뺀다).
 */
export const HEAD_SHORT_BELOW = 1099
/** 이보다 좁은 창이면 상태 전환기를 `…` 로 접는다. 잰 값: 글을 감춘 머리(`short`)가 한 줄에 드는 최소 창 폭 — 편집 945 · 뷰 819. 여유 20. */
export const HEAD_TIGHT_BELOW = 965
/** 이보다 좁은 창이면 줌 묶음을 `…` 로 접는다. 잰 값: 전환기를 접은 머리(`tight`)가 한 줄에 드는 최소 창 폭 — 편집 858 · 뷰 732. 여유 20. */
export const HEAD_FOLD_BELOW = 878

/** 문턱 셋의 미디어 쿼리 — 처음 물을 때 한 번 짓는다. `matchMedia` 가 없으면 `null`. */
let queries: readonly MediaQueryList[] | null | undefined

function media(): readonly MediaQueryList[] | null {
  if (queries === undefined) {
    queries =
      typeof window === 'undefined' || typeof window.matchMedia !== 'function'
        ? null
        : [
            window.matchMedia(`(width < ${HEAD_SHORT_BELOW}px)`),
            window.matchMedia(`(width < ${HEAD_TIGHT_BELOW}px)`),
            window.matchMedia(`(width < ${HEAD_FOLD_BELOW}px)`),
          ]
  }
  return queries
}

function subscribe(onChange: () => void): () => void {
  const lists = media()
  if (lists === null) return () => {}
  for (const list of lists) list.addEventListener('change', onChange)
  return () => {
    for (const list of lists) list.removeEventListener('change', onChange)
  }
}

function snapshot(): HeadFold {
  const lists = media()
  if (lists === null) return 'wide'
  const [short, tight, folded] = lists
  if (folded!.matches) return 'folded'
  if (tight!.matches) return 'tight'
  return short!.matches ? 'short' : 'wide'
}

/** 지금 창의 단계 — 문턱을 넘을 때만 다시 그린다. */
export function useHeadFold(): HeadFold {
  return useSyncExternalStore(subscribe, snapshot, () => 'wide')
}
