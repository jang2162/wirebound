/**
 * **셸 머리의 팝오버를 바깥 클릭과 `Escape`로 닫는 장치.** 내보내기·스냅샷 둘이 쓴다.
 *
 * 돌려주는 ref를 **토글 버튼까지 감싸는 상자**에 건다. 그 배치가 이 훅의 계약이고,
 * 아래 두 성질이 거기서 나온다.
 *
 * ## `click`이 아니라 `mousedown`이다
 *
 * 갈리는 것은 **누른 채 끌고 나가는 동작**이다. 팝오버 안의 글자를 긁다가 밖에서 손을
 * 떼면 브라우저는 두 요소의 **공통 조상**에서 `click`을 내고 그 `target`은 팝오버 밖이라,
 * `click`으로 판정하는 구현은 그때 닫는다 — 사용자는 글자를 긁었을 뿐인데 화면이
 * 사라진다. `mousedown`은 **누른 자리**로 판정하므로 그 일이 없다.
 *
 * 부수적으로 하나 더 맞는다: `mousedown`은 뒤에 있는 요소의 `click`보다 **먼저** 돌아,
 * 팝오버가 열린 채로 뒤쪽 버튼을 누르면 한 번에 눌린다(`click`으로 닫으면 첫 클릭이
 * 닫는 데 쓰이고 사용자가 두 번 눌러야 한다).
 *
 * 반대편 손해는 받아들인다 — 밖에서 눌러 안으로 끌고 와 떼면 닫힌다. 그쪽은 사용자가
 * 이미 *"밖을 눌렀다"*이다.
 *
 * ## 토글이 두 번 처리되지 않는다
 *
 * 토글 버튼이 ref 상자 **안**이므로 그 위의 `mousedown`은 *"바깥"*이 아니다. 그래서
 * 닫는 일은 토글 자신의 `onClick` 하나가 하고, 이 훅은 아무것도 안 한다. 상자를 본문만
 * 감싸게 좁히면 `mousedown`이 먼저 닫고 이어진 `click`이 다시 열어 **닫히지 않는다.**
 *
 * ## `Escape`도 함께 닫는다 — **다만 IME 조합 중에는 안 본다**
 *
 * 키보드만 쓰는 사람에게는 *"바깥을 누른다"*가 대안이 못 된다. 초점을 되돌리는 일까지는
 * 하지 않는다 — 이 저장소의 팝오버 둘 다 초점 덫이 없어 초점이 애초에 안 갇힌다.
 *
 * **한글을 조합하는 중의 `Escape`는 조합을 취소하는 키다.** 그것으로 팝오버를 닫으면
 * 본문이 언마운트되어 **그때까지 친 태그·설명이 통째로 사라진다.** 이 저장소는 한국어가
 * 1차 언어이고 스냅샷 태그·설명은 한글을 적는 자리다. CDP로 진짜 조합 상태를
 * 만들어 재면 `한`을 조합하는 중의 `Escape`가
 * `{ key: 'Escape', keyCode: 27, isComposing: true }`로 온다 — 거르지 않으면 팝오버가 닫힌다.
 *
 * **`keyCode === 229`를 함께 보지 않는다.** 그 값은 `isComposing`이 없던 시절의 대용인데,
 * 여기서는 둘 다 근거가 없다.
 *
 * - **관측된 고장을 못 잡는다.** 위 실측의 `keyCode`가 **27**이다 — 크롬은 조합 중에도
 *   `Escape`에는 실제 키코드를 싣는다. 229로 가르면 이 고장은 그대로 남는다.
 *   즉 더한다 해도 **아무것도 막지 못하는 가지**이고, 그래서 케이스로 잴 수도 없다.
 * - **이 저장소가 지원하는 브라우저에는 `isComposing`이 다 있다.** `browserslist`가 없고
 *   (검산: `apps/web`·루트 어디에도 0건) vite 7의 기본 타깃은 baseline이며 `tsconfig`의
 *   `target`이 `ES2022`다. `isComposing`은 Chrome 25 · Firefox 31 · Safari 10.1부터다.
 * - **`keyCode`는 이 저장소에 한 자리도 없다**(검산: `apps/web/src`와 `packages` 아래 소스
 *   전부에서 0건).
 *   폐기된 속성을 첫 자리로 들이는 값이 없다.
 *
 * 그래서 `isComposing` 하나만 본다. **막히는 날의 신호는 "조합 중에 Escape가 먹는다"이고,
 * 그때 이 문단을 읽고 229를 더하면 된다.**
 *
 * ## 열려 있지 않으면 아무것도 걸지 않는다
 *
 * 셸 머리에 팝오버가 둘이라, 닫힌 채로도 거는 구현은 설계서를 여는 것만으로 전역
 * 리스너를 둘 얹는다. 그 부류는 화면에 아무것도 안 남기므로
 * `test/shell/popover-dismiss.test.tsx`가 등록·해제를 수로 센다.
 */
import { useEffect, useRef, type RefObject } from 'react'

export function usePopoverDismiss<T extends HTMLElement = HTMLDivElement>(
  open: boolean,
  close: () => void,
): RefObject<T | null> {
  const ref = useRef<T>(null)

  /**
   * **마지막 `close`를 ref로 든다.** 부르는 쪽이 인라인 화살표를 넘기면 그것이 렌더마다
   * 새 함수라, `close`를 의존으로 두면 **렌더마다 리스너를 걷었다 다시 건다.** 그러면
   * 이 훅의 계약이 *"안정된 콜백을 넘겨라"*가 되어 부르는 쪽 둘에 규칙이 하나 생긴다.
   *
   * 렌더 중에 쓰지 않고 이펙트로 옮기는 것은 React의 규칙 그대로다. 아래 이펙트보다
   * **먼저 선언한다** — 이펙트는 선언 순서로 도므로 리스너가 걸릴 때 이미 최신이다.
   */
  const latest = useRef(close)
  useEffect(() => {
    latest.current = close
  })

  useEffect(() => {
    if (!open) return

    // **`ref.current`를 이펙트 밖에서 읽어 두지 않는다.** 여닫는 사이에 상자가 다시
    // 마운트되면 그 시점의 것이 낡는다 — 누를 때마다 읽으면 그 창이 없다.
    const onMouseDown = (event: MouseEvent): void => {
      const box = ref.current
      // `Node`가 아닌 target(창 밖으로 나간 포인터 등)은 `contains`가 판정할 수 없다.
      // 그때 닫지 않는 쪽을 고른다 — 바깥이라고 단정할 근거가 없다.
      if (box === null || !(event.target instanceof Node)) return
      if (box.contains(event.target)) return
      latest.current()
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      // **조합 중에는 어떤 키도 안 본다**(위 머리말) — 조합 중의 `Escape`는 조합을
      // 취소하는 키이지 화면을 닫는 키가 아니다.
      //
      // **`key` 판정보다 앞에 두는 것은 케이스가 재지 못한다**(두 줄의 순서를 바꿔도
      // `test/shell/popover-dismiss.test.tsx`가 그대로 통과한다 — 보는 키가 `Escape` 하나뿐이라 두 순서의
      // 결과가 같다). 그래도 앞에 두는 것은 규칙이 *"조합 중에는 **어떤** 키도 안 본다"*라서다:
      // 여기 키가 하나 더 늘어도 그 규칙이 저절로 따라온다.
      if (event.isComposing) return
      if (event.key !== 'Escape') return
      latest.current()
    }

    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return ref
}
