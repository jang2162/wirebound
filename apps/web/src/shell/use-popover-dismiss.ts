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
 * ## `Escape`도 함께 닫는다
 *
 * 키보드만 쓰는 사람에게는 *"바깥을 누른다"*가 대안이 못 된다. 초점을 되돌리는 일까지는
 * 하지 않는다 — 이 저장소의 팝오버 둘 다 초점 덫이 없어 초점이 애초에 안 갇힌다.
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
