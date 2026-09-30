/**
 * **포인터 드래그 부품**(`src/drag/use-pointer-drag.ts`)의 계약 — 끌기 시작 문턱 · 놓을 자리 표시 · 놓기 · 취소 · 끌고 난 뒤의
 * 클릭 · 끝 스크롤. 부품은 무엇을 끄는지 모르므로 이 파일도 트리를 쓰지 않는다 — 글자 셋과 좌표로 가르는 `onOver` 하나로 잰다.
 *
 * jsdom 에는 `PointerEvent` 도 `setPointerCapture` 도 없다 — 앞은 `../pointer-events.ts` 가 메우고, 뒤는 부품이 «있으면 부른다»로
 * 넘어간다(캡처가 캔버스 iframe 위에서 끌기를 이어 주는 것은 실브라우저 판 `build-test/tree-drag.test.ts` 가 잰다).
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useRef, type ReactElement } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { CanvasDocumentProvider, usePublishCanvasDocument } from '../../src/canvas/canvas-document'
import { DropIndicator } from '../../src/drag/drop-indicator'
import { usePointerDrag, type DropHint } from '../../src/drag/use-pointer-drag'
import { installPointerEvents } from '../pointer-events'

beforeAll(installPointerEvents)
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const RECT = { left: 0, top: 40, width: 120, height: 20 }

/** 위 50px 은 «앞에», 50 ~ 150 은 «안에», 그 아래는 못 놓는 자리. */
function zones(_source: string, point: { x: number; y: number }): DropHint<string> | null {
  if (point.y < 50) return { value: '앞', rect: RECT, placement: 'before' }
  if (point.y < 150) return { value: '안', rect: RECT, placement: 'inside' }
  return null
}

function Harness(props: {
  onDrop: (source: string, value: string) => void
  onOver?: (source: string, point: { x: number; y: number }) => DropHint<string> | null
  onClick?: (id: string) => void
  scroll?: boolean
}): ReactElement {
  const box = useRef<HTMLDivElement>(null)
  const drag = usePointerDrag<string, string>({
    onOver: props.onOver ?? zones,
    onDrop: props.onDrop,
    scrollContainer: props.scroll === true ? () => box.current : undefined,
  })
  return (
    <div ref={box} data-testid="box">
      {['가', '나'].map((id) => (
        <button key={id} type="button" onClick={() => props.onClick?.(id)} {...drag.bind(id)}>
          {id}
        </button>
      ))}
      <p data-testid="dragging">{drag.dragging ?? ''}</p>
      <DropIndicator hint={drag.hint} />
    </div>
  )
}

function indicator(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.wb-shell-drop-indicator')
}

function press(name: string, x = 10, y = 10): void {
  fireEvent.pointerDown(screen.getByRole('button', { name }), { button: 0, clientX: x, clientY: y, pointerId: 1 })
}

function moveTo(x: number, y: number): void {
  fireEvent.pointerMove(window, { clientX: x, clientY: y, pointerId: 1 })
}

function release(x: number, y: number): void {
  fireEvent.pointerUp(window, { clientX: x, clientY: y, pointerId: 1 })
}

describe('끌기 시작 문턱', () => {
  it('4px 안의 움직임은 클릭이다 — 끌기가 안 서고 놓아도 onDrop 이 없다', () => {
    const onDrop = vi.fn()
    const onOver = vi.fn(zones)
    const onClick = vi.fn()
    render(<Harness onDrop={onDrop} onOver={onOver} onClick={onClick} />)

    press('가', 10, 10)
    moveTo(13, 12) // 거리 3.6
    expect(screen.getByTestId('dragging').textContent).toBe('')
    release(13, 12)
    fireEvent.click(screen.getByRole('button', { name: '가' }))

    expect(onOver).not.toHaveBeenCalled()
    expect(onDrop).not.toHaveBeenCalled()
    expect(indicator()).toBeNull()
    // 클릭(선택 · 열기)은 그대로 산다.
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('4px 를 넘으면 끌기가 서고 onOver 가 준 자리의 표시가 선다', () => {
    const onOver = vi.fn(zones)
    render(<Harness onDrop={vi.fn()} onOver={onOver} />)

    press('가', 10, 10)
    moveTo(10, 20)

    expect(screen.getByTestId('dragging').textContent).toBe('가')
    expect(onOver).toHaveBeenLastCalledWith('가', { x: 10, y: 20 })
    const line = indicator()
    expect(line?.dataset['placement']).toBe('before')
  })

  it('끌기가 서는 순간 누른 요소가 포인터를 붙잡는다 — 누를 때가 아니라', () => {
    const capture = vi.fn()
    HTMLElement.prototype.setPointerCapture = capture
    try {
      render(<Harness onDrop={vi.fn()} />)
      press('가', 10, 10)
      expect(capture).not.toHaveBeenCalled()
      moveTo(10, 30)
      expect(capture).toHaveBeenCalledTimes(1)
      expect(capture.mock.contexts[0]).toBe(screen.getByRole('button', { name: '가' }))
    } finally {
      delete (HTMLElement.prototype as { setPointerCapture?: unknown }).setPointerCapture
    }
  })
})

describe('놓기', () => {
  it('놓으면 그 자리로 onDrop 이 한 번 — 표시와 끌기가 걷힌다', () => {
    const onDrop = vi.fn()
    render(<Harness onDrop={onDrop} />)

    press('나', 10, 10)
    moveTo(10, 30)
    moveTo(10, 90)
    expect(indicator()?.dataset['placement']).toBe('inside')
    release(10, 90)

    expect(onDrop).toHaveBeenCalledTimes(1)
    expect(onDrop).toHaveBeenCalledWith('나', '안')
    expect(indicator()).toBeNull()
    expect(screen.getByTestId('dragging').textContent).toBe('')
  })

  it('못 놓는 자리(null)에서는 표시가 없고 놓아도 onDrop 이 없다', () => {
    const onDrop = vi.fn()
    render(<Harness onDrop={onDrop} />)

    press('가', 10, 10)
    moveTo(10, 30)
    expect(indicator()).not.toBeNull()
    moveTo(10, 200)
    expect(indicator()).toBeNull()
    release(10, 200)

    expect(onDrop).not.toHaveBeenCalled()
    expect(screen.getByTestId('dragging').textContent).toBe('')
  })

  it('놓는 좌표로 자리를 다시 묻는다 — 마지막 move 와 up 사이에 자리가 바뀌어도 up 의 자리다', () => {
    const onDrop = vi.fn()
    render(<Harness onDrop={onDrop} />)

    press('가', 10, 10)
    moveTo(10, 30)
    release(10, 200)

    expect(onDrop).not.toHaveBeenCalled()
  })

  it('끌고 놓은 뒤 따라오는 클릭은 삼킨다 — 다음 클릭은 산다', async () => {
    vi.useFakeTimers()
    const onClick = vi.fn()
    render(<Harness onDrop={vi.fn()} onClick={onClick} />)

    press('가', 10, 10)
    moveTo(10, 30)
    release(10, 30)
    // 브라우저는 누른 요소와 뗀 요소가 같으면(캡처로 늘 같다) 그 요소에 click 을 낸다.
    fireEvent.click(screen.getByRole('button', { name: '가' }))
    expect(onClick).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10)
    })
    fireEvent.click(screen.getByRole('button', { name: '가' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})

describe('취소', () => {
  it('Escape → 표시가 걷히고 뒤의 pointerup 도 onDrop 을 안 낸다', () => {
    const onDrop = vi.fn()
    render(<Harness onDrop={onDrop} />)

    press('가', 10, 10)
    moveTo(10, 30)
    fireEvent.keyDown(window, { key: 'Escape' })

    expect(indicator()).toBeNull()
    expect(screen.getByTestId('dragging').textContent).toBe('')
    release(10, 30)
    expect(onDrop).not.toHaveBeenCalled()
  })

  it('캔버스 iframe 문서에서 난 Escape 도 취소한다', () => {
    const onDrop = vi.fn()
    const canvas = document.implementation.createHTMLDocument('캔버스')
    function Publish(): null {
      usePublishCanvasDocument(canvas)
      return null
    }
    render(
      <CanvasDocumentProvider>
        <Publish />
        <Harness onDrop={onDrop} />
      </CanvasDocumentProvider>,
    )

    press('가', 10, 10)
    moveTo(10, 30)
    act(() => {
      canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })

    expect(indicator()).toBeNull()
    release(10, 30)
    expect(onDrop).not.toHaveBeenCalled()
  })

  it('pointercancel → 취소 · onDrop 없음', () => {
    const onDrop = vi.fn()
    render(<Harness onDrop={onDrop} />)

    press('가', 10, 10)
    moveTo(10, 30)
    fireEvent.pointerCancel(window, { pointerId: 1 })

    expect(indicator()).toBeNull()
    release(10, 30)
    expect(onDrop).not.toHaveBeenCalled()
  })

  it('끌기 전의 Escape 는 건드리지 않는다 — 끌기가 없으면 리스너도 없다', () => {
    const add = vi.spyOn(window, 'addEventListener')
    render(<Harness onDrop={vi.fn()} />)
    const keydowns = (): number => add.mock.calls.filter(([type]) => type === 'keydown').length
    expect(keydowns()).toBe(0)
    add.mockRestore()
  })
})

describe('끝 스크롤', () => {
  function frame(box: HTMLElement): void {
    box.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 200, bottom: 300, width: 200, height: 300, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
  }

  it('아래 끝 24px 안이면 초당 일정하게 아래로 민다 — 멈춰 있어도 이어서', async () => {
    vi.useFakeTimers()
    render(<Harness onDrop={vi.fn()} scroll />)
    const box = screen.getByTestId('box')
    frame(box)

    press('가', 10, 100)
    moveTo(10, 290)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })
    const after500 = box.scrollTop
    expect(after500).toBeGreaterThan(0)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })
    // 속도가 일정하다 — 두 번째 반 초도 같은 만큼(틱 하나의 어긋남까지).
    expect(Math.abs(box.scrollTop - 2 * after500)).toBeLessThanOrEqual(after500 / 10)
  })

  it('위 끝이면 위로, 가운데면 안 민다 · 놓으면 멈춘다', async () => {
    vi.useFakeTimers()
    render(<Harness onDrop={vi.fn()} scroll />)
    const box = screen.getByTestId('box')
    frame(box)
    box.scrollTop = 400

    press('가', 10, 100)
    moveTo(10, 150)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    expect(box.scrollTop).toBe(400)

    moveTo(10, 10)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    const pushed = box.scrollTop
    expect(pushed).toBeLessThan(400)

    release(10, 10)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    expect(box.scrollTop).toBe(pushed)
  })

  it('밀고 나면 같은 좌표로 자리를 다시 묻는다 — 줄이 포인터 밑으로 지나간다', async () => {
    vi.useFakeTimers()
    const onOver = vi.fn(zones)
    render(<Harness onDrop={vi.fn()} onOver={onOver} scroll />)
    frame(screen.getByTestId('box'))

    press('가', 10, 100)
    moveTo(10, 290)
    const calls = onOver.mock.calls.length
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })
    expect(onOver.mock.calls.length).toBeGreaterThan(calls)
    expect(onOver).toHaveBeenLastCalledWith('가', { x: 10, y: 290 })
  })
})
