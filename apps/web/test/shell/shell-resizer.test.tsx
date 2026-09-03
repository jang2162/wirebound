/**
 * 손잡이 하나가 **사람의 몸짓을 픽셀로 옮기는지**. 값·한계·보존은 여기 없다 —
 * `sidebar-layout.test.ts`가 본다.
 *
 * ## 왜 `onGrab`을 세는가
 *
 * 드래그도 화살표도 *"지금 값에서 얼마"*로 움직인다. 그 *"지금 값"*을 손잡이가 들고 있으면
 * 부르는 쪽이 값을 바꿨을 때(창이 줄어 잘렸을 때 등) 손잡이가 낡은 값에서 출발한다. 그래서
 * 몸짓이 시작될 때마다 물어보고, 이 파일은 **물어본 뒤에 움직이는지**를 재는 것이다.
 *
 * ## 이 검사가 보지 못하는 것
 *
 * - **좌표가 없다.** jsdom에는 레이아웃이 없어 손잡이의 자리도 크기도 0이다. 여기서
 *   통과하는 것은 *"`clientX`가 이만큼 바뀌면 `onMove`가 이 값으로 불린다"*이지
 *   *"경계가 포인터를 따라간다"*가 아니다. 그쪽은 브라우저에서 쟀다(200px → 200.0px).
 * - **`:hover`·`:focus-visible`의 생김새.** CSS는 이 파일이 읽지 않는다.
 * - **터치.** `touch-action: none`이 없으면 터치에서 드래그가 스크롤로 새는데, jsdom에는
 *   그 동작 자체가 없다.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ShellResizer, type ShellResizerProps } from '../../src/shell/shell-resizer'
import { RESIZE_STEP } from '../../src/shell/sidebar-layout'
import { installPointerEvents } from '../pointer-events'

// jsdom에는 `PointerEvent`가 없어 `button`·`clientX`가 사라진다. 왜 그것이 거짓 초록이
// 되는지는 그 파일의 머리말에 있다.
installPointerEvents()

/** 손잡이 하나와, 그것이 부른 것을 세는 첩자들. */
function setup(overrides: Partial<ShellResizerProps> = {}) {
  const spies = {
    onGrab: vi.fn(() => 264),
    onMove: vi.fn(),
    onEdge: vi.fn(),
    onReset: vi.fn(),
  }
  const props: ShellResizerProps = {
    orientation: 'vertical',
    className: 'wb-shell-side-resizer',
    label: '사이드바 폭',
    value: 264,
    min: 200,
    max: 811,
    valueText: '264px',
    ...spies,
    ...overrides,
  }
  render(<ShellResizer {...props} />)
  return { ...spies, handle: screen.getByRole('separator', { name: props.label }) }
}

describe('접근성 — window splitter 모양', () => {
  it('`separator`이고 초점을 받고 값 셋을 말한다', () => {
    const { handle } = setup()
    expect(handle.getAttribute('aria-orientation')).toBe('vertical')
    expect(handle.getAttribute('aria-valuenow')).toBe('264')
    expect(handle.getAttribute('aria-valuemin')).toBe('200')
    expect(handle.getAttribute('aria-valuemax')).toBe('811')
    expect(handle.getAttribute('aria-valuetext')).toBe('264px')
    // 초점을 못 받으면 화살표가 오지 않는다 — 키보드 사용자에게는 기능이 없는 것과 같다.
    expect(handle.tabIndex).toBe(0)
  })

  it('소수점은 반올림해서 말한다 — 스크린 리더가 읽을 수 있는 수여야 한다', () => {
    const { handle } = setup({ value: 263.62, min: 200.4, max: 810.7 })
    expect(handle.getAttribute('aria-valuenow')).toBe('264')
    expect(handle.getAttribute('aria-valuemin')).toBe('200')
    expect(handle.getAttribute('aria-valuemax')).toBe('811')
  })

  it('가로 손잡이는 `horizontal`이다', () => {
    const { handle } = setup({ orientation: 'horizontal', label: '좌측 두 영역의 세로 배분' })
    expect(handle.getAttribute('aria-orientation')).toBe('horizontal')
  })
})

describe('키보드', () => {
  it('세로 손잡이는 ←→로 한 칸씩 움직인다', () => {
    const { handle, onGrab, onMove } = setup()
    fireEvent.keyDown(handle, { key: 'ArrowRight' })
    expect(onGrab).toHaveBeenCalledTimes(1)
    expect(onMove).toHaveBeenLastCalledWith(264 + RESIZE_STEP)
    fireEvent.keyDown(handle, { key: 'ArrowLeft' })
    expect(onMove).toHaveBeenLastCalledWith(264 - RESIZE_STEP)
  })

  it('가로 손잡이는 ↑↓로 움직인다', () => {
    const { handle, onMove } = setup({ orientation: 'horizontal', onGrab: vi.fn(() => 400) })
    fireEvent.keyDown(handle, { key: 'ArrowDown' })
    expect(onMove).toHaveBeenLastCalledWith(400 + RESIZE_STEP)
    fireEvent.keyDown(handle, { key: 'ArrowUp' })
    expect(onMove).toHaveBeenLastCalledWith(400 - RESIZE_STEP)
  })

  it('축이 다른 화살표는 무시한다 — 옆으로 미는 손잡이가 위아래로 움직이면 안 된다', () => {
    const { handle, onMove } = setup()
    fireEvent.keyDown(handle, { key: 'ArrowUp' })
    fireEvent.keyDown(handle, { key: 'ArrowDown' })
    expect(onMove).not.toHaveBeenCalled()
  })

  it('`Home`·`End`가 양 끝으로 보낸다', () => {
    const { handle, onEdge } = setup()
    fireEvent.keyDown(handle, { key: 'Home' })
    expect(onEdge).toHaveBeenLastCalledWith('min')
    fireEvent.keyDown(handle, { key: 'End' })
    expect(onEdge).toHaveBeenLastCalledWith('max')
  })

  it('`Enter`가 기본값으로 되돌린다 — 두 번 누르기의 키보드 짝이다', () => {
    // **이것이 없으면 키보드 사용자만 기본값으로 갈 길이 없다.**
    const { handle, onReset } = setup()
    fireEvent.keyDown(handle, { key: 'Enter' })
    expect(onReset).toHaveBeenCalledTimes(1)
  })

  it('그 밖의 키는 지나간다', () => {
    const { handle, onMove, onEdge, onReset } = setup()
    for (const key of ['a', 'Tab', 'Escape', ' ']) fireEvent.keyDown(handle, { key })
    expect(onMove).not.toHaveBeenCalled()
    expect(onEdge).not.toHaveBeenCalled()
    expect(onReset).not.toHaveBeenCalled()
  })
})

describe('마우스', () => {
  it('두 번 누르면 기본값이다', () => {
    const { handle, onReset } = setup()
    fireEvent.doubleClick(handle)
    expect(onReset).toHaveBeenCalledTimes(1)
  })

  it('잡고 밀면 시작값 + 델타로 부른다', () => {
    const { handle, onGrab, onMove } = setup()
    fireEvent.pointerDown(handle, { button: 0, clientX: 265, clientY: 400 })
    expect(onGrab).toHaveBeenCalledTimes(1)
    fireEvent.pointerMove(window, { clientX: 321, clientY: 400 })
    expect(onMove).toHaveBeenLastCalledWith(264 + 56)
    fireEvent.pointerMove(window, { clientX: 205, clientY: 400 })
    expect(onMove).toHaveBeenLastCalledWith(264 - 60)
  })

  it('가로 손잡이는 세로 좌표를 본다', () => {
    const { handle, onMove } = setup({ orientation: 'horizontal', onGrab: vi.fn(() => 400) })
    fireEvent.pointerDown(handle, { button: 0, clientX: 130, clientY: 471 })
    fireEvent.pointerMove(window, { clientX: 999, clientY: 271 })
    // 가로로 아무리 움직여도 세로만 센다.
    expect(onMove).toHaveBeenLastCalledWith(400 - 200)
  })

  it('놓으면 리스너를 뗀다 — 손을 뗀 뒤의 움직임은 따라오지 않는다', () => {
    // 안 떼면 다음 마우스 이동이 전부 손잡이를 끄는 것처럼 보인다.
    const { handle, onMove } = setup()
    fireEvent.pointerDown(handle, { button: 0, clientX: 265, clientY: 400 })
    fireEvent.pointerMove(window, { clientX: 321, clientY: 400 })
    fireEvent.pointerUp(window)
    onMove.mockClear()
    fireEvent.pointerMove(window, { clientX: 600, clientY: 400 })
    expect(onMove).not.toHaveBeenCalled()
  })

  it('포인터를 잃어도 뗀다 — `pointercancel`도 드래그의 끝이다', () => {
    const { handle, onMove } = setup()
    fireEvent.pointerDown(handle, { button: 0, clientX: 265, clientY: 400 })
    fireEvent.pointerCancel(window)
    onMove.mockClear()
    fireEvent.pointerMove(window, { clientX: 600, clientY: 400 })
    expect(onMove).not.toHaveBeenCalled()
  })

  it('주 버튼이 아니면 시작하지 않는다', () => {
    const { handle, onGrab, onMove } = setup()
    fireEvent.pointerDown(handle, { button: 2, clientX: 265, clientY: 400 })
    expect(onGrab).not.toHaveBeenCalled()
    fireEvent.pointerMove(window, { clientX: 600, clientY: 400 })
    expect(onMove).not.toHaveBeenCalled()
  })

  it('드래그를 새로 시작하면 값을 다시 물어본다', () => {
    // 부르는 쪽이 값을 잘랐을 수 있다(창이 줄었을 때). 손잡이가 들고 있으면 낡은 값에서
    // 출발한다.
    const onGrab = vi.fn().mockReturnValueOnce(264).mockReturnValueOnce(420)
    const { handle, onMove } = setup({ onGrab })
    fireEvent.pointerDown(handle, { button: 0, clientX: 265, clientY: 400 })
    fireEvent.pointerUp(window)
    fireEvent.pointerDown(handle, { button: 0, clientX: 421, clientY: 400 })
    fireEvent.pointerMove(window, { clientX: 431, clientY: 400 })
    expect(onMove).toHaveBeenLastCalledWith(430)
  })
})
