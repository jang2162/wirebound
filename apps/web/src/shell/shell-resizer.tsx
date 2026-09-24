/**
 * 셸의 손잡이 하나. **드래그와 키보드가 같은 값을 움직인다.**
 *
 * 값과 한계와 보존은 이 파일이 모른다 — `shell/sidebar-layout.ts`가 갖고, 여기는 사람의
 * 몸짓을 픽셀로 옮기는 일만 한다. 그래서 세로 손잡이(폭)와 가로 손잡이(배분)가 **같은
 * 컴포넌트**다: 둘 다 사람이 잡고 밀면 픽셀이 움직이고, 그 픽셀을 무엇으로 볼지는 부르는
 * 쪽이 정한다(폭은 그대로 px, 배분은 나눠 쓰는 세로로 나눠 비율).
 *
 * # 왜 `role="separator"`인가
 *
 * 이 손잡이가 드래그 전용이면 **키보드 사용자에게는 이 기능이 없는 것과 같다.** WAI-ARIA가
 * 이 물건을 window splitter로 이미 규정한다: 초점을 받는 `separator`는 `aria-valuenow`·
 * `aria-valuemin`·`aria-valuemax`를 갖고 화살표로 움직인다. 새로 만들지 않고 그 모양을
 * 그대로 쓴다 — 스크린 리더가 이미 아는 물건이 된다.
 *
 * `aria-orientation`은 **분리선 자신이 놓인 방향**이다. 좌우를 가르는 세로줄이
 * `vertical`이고, 위아래를 가르는 가로줄이 `horizontal`이다. 화살표 키가 그 방향의
 * 직각으로 움직인다(세로줄은 ←→, 가로줄은 ↑↓) — 사람이 손잡이를 미는 방향과 같다.
 *
 * # 되돌리는 길이 셋인 이유
 *
 * 손잡이를 끝까지 밀어 놓으면 그것을 **다시 잡기가 어렵다.** 그 사고를 막는 첫 겹은
 * 최소·최대이고(`sidebar-layout.ts`), 그래도 극단으로 간 사람을 위해 셋을 둔다:
 *
 * - **두 번 누르기** — 기본값. 마우스로 가장 짧은 길이다.
 * - **`Home`·`End`** — 양 끝. 키보드에서 한 칸씩 밀지 않고 건너뛴다.
 * - **`Enter`** — 기본값. **두 번 누르기의 키보드 짝이다.** 표준이 정한 키는 아니지만,
 *   이것이 없으면 키보드 사용자만 기본값으로 돌아갈 길이 없다. `title`이 그 셋을 말한다.
 *
 * # 드래그를 `window`에서 듣는다
 *
 * `setPointerCapture`가 아니라 `window` 리스너인 것은 두 가지 때문이다. 포인터가 캔버스
 * 위로 나가도 계속 따라와야 하고(캡처도 그 일을 한다), **jsdom에 `setPointerCapture`가
 * 없다**(캡처만 쓰면 테스트에서 드래그 경로가 통째로 죽는다). `window` 리스너는 양쪽에서
 * 같은 코드가 돈다.
 *
 * `preventDefault()`는 드래그가 **글자 선택으로 새는 것**을 막는다. 대신
 * `user-select: none`을 얹지 않는 것은 그것이 상속 속성이라 셸의 감싸는 상자에 걸 수 없기
 * 때문이다 — 실측으로 `preventDefault()` 하나면 선택이 시작되지 않는다.
 */
import { useCallback, type KeyboardEvent, type PointerEvent, type ReactElement, type Ref } from 'react'
import { RESIZE_STEP } from './sidebar-layout'

export interface ShellResizerProps {
  /** 분리선이 놓인 방향. 좌우를 가르는 세로줄이 `vertical`이다. */
  orientation: 'vertical' | 'horizontal'
  className: string
  /** 접근성 이름. 무엇을 조절하는 손잡이인지 말한다. */
  label: string
  /** `aria-valuenow`. 단위는 부르는 쪽의 것이다(px이든 %이든). */
  value: number
  min: number
  max: number
  /** 화면에 읽어 줄 값. 숫자만으로는 단위를 알 수 없다. */
  valueText: string
  ref?: Ref<HTMLDivElement>
  /** 몸짓이 시작될 때의 값(px). 드래그도 화살표도 여기서 출발한다. */
  onGrab: () => number
  /** `onGrab()`이 준 값에 델타를 더한 값(px). */
  onMove: (px: number) => void
  /** `Home`·`End`. */
  onEdge: (edge: 'min' | 'max') => void
  /** 두 번 누르기·`Enter`. */
  onReset: () => void
}

/** 손잡이를 미는 방향의 좌표. 세로줄은 가로로, 가로줄은 세로로 움직인다. */
function axisOf(orientation: ShellResizerProps['orientation'], event: { clientX: number; clientY: number }): number {
  return orientation === 'vertical' ? event.clientX : event.clientY
}

export function ShellResizer(props: ShellResizerProps): ReactElement {
  const { orientation, onGrab, onMove, onEdge, onReset } = props

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>): void => {
      // 주 버튼만. 오른쪽·가운데 버튼으로 시작한 드래그는 사람이 뜻한 것이 아니다.
      if (event.button !== 0) return
      event.preventDefault()

      const start = axisOf(orientation, event)
      const from = onGrab()

      const move = (moved: globalThis.PointerEvent): void => {
        onMove(from + axisOf(orientation, moved) - start)
      }
      const stop = (): void => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', stop)
        // 포인터를 잃은 경우(창 밖으로 나감·기기 분리)도 드래그의 끝이다. 안 떼면
        // 리스너가 남아 다음 클릭이 손잡이를 끄는 것처럼 보인다.
        window.removeEventListener('pointercancel', stop)
      }

      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', stop)
      window.addEventListener('pointercancel', stop)
    },
    [orientation, onGrab, onMove],
  )

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>): void => {
      const back = orientation === 'vertical' ? 'ArrowLeft' : 'ArrowUp'
      const forth = orientation === 'vertical' ? 'ArrowRight' : 'ArrowDown'

      if (event.key === back || event.key === forth) {
        event.preventDefault()
        onMove(onGrab() + (event.key === back ? -RESIZE_STEP : RESIZE_STEP))
        return
      }
      if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault()
        onEdge(event.key === 'Home' ? 'min' : 'max')
        return
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        onReset()
      }
    },
    [orientation, onGrab, onMove, onEdge, onReset],
  )

  return (
    <div
      ref={props.ref}
      className={props.className}
      role="separator"
      aria-orientation={props.orientation}
      aria-label={props.label}
      aria-valuenow={Math.round(props.value)}
      aria-valuemin={Math.round(props.min)}
      aria-valuemax={Math.round(props.max)}
      aria-valuetext={props.valueText}
      // 초점을 받아야 화살표가 온다. `separator`는 초점을 받는 순간 window splitter다.
      tabIndex={0}
      title={`${props.label} — 끌어서 조절, 두 번 눌러 기본값(Enter), 화살표 한 칸, Home·End 양 끝`}
      onPointerDown={handlePointerDown}
      onDoubleClick={onReset}
      onKeyDown={handleKeyDown}
    />
  )
}
