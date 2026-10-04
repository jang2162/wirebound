/**
 * `drag/hover-open.ts` — 끄는 포인터가 접힌 줄 위에 0.7s 머물면 그 줄에 이벤트를 쏜다. 끌기 셋과 트리의 배선은 실브라우저
 * (`build-test/tree-fold.test.ts`)가 잰다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HOVER_OPEN_EVENT, HOVER_OPEN_MS, hoverRow } from '../../src/drag/hover-open'

let opened: string[] = []

function row(id: string, collapsed: boolean): HTMLElement {
  const element = document.createElement('div')
  element.setAttribute('data-tree-row', '')
  element.dataset['treeId'] = id
  if (collapsed) element.setAttribute('data-tree-collapsed', '')
  document.body.append(element)
  return element
}

function listen(event: Event): void {
  opened.push((event.target as HTMLElement).dataset['treeId'] ?? '')
}

beforeEach(() => {
  vi.useFakeTimers()
  opened = []
  document.addEventListener(HOVER_OPEN_EVENT, listen)
})

afterEach(() => {
  hoverRow(null)
  document.removeEventListener(HOVER_OPEN_EVENT, listen)
  document.body.replaceChildren()
  vi.useRealTimers()
})

describe('접힌 줄 위 0.7s', () => {
  it('머물면 그 줄에 쏜다 — 그 전에는 안 쏜다 · 같은 줄의 다음 움직임은 시계를 다시 세우지 않는다', () => {
    const target = row('m', true)
    hoverRow(target)
    vi.advanceTimersByTime(HOVER_OPEN_MS - 100)
    hoverRow(target)
    vi.advanceTimersByTime(99)
    expect(opened).toEqual([])
    vi.advanceTimersByTime(1)
    expect(opened).toEqual(['m'])
  })

  it('다른 줄로 옮기거나 트리 밖으로 나가면 다시 잰다', () => {
    const first = row('a', true)
    const second = row('b', true)
    hoverRow(first)
    vi.advanceTimersByTime(HOVER_OPEN_MS - 1)
    hoverRow(second)
    vi.advanceTimersByTime(HOVER_OPEN_MS - 1)
    expect(opened).toEqual([])
    hoverRow(null)
    vi.advanceTimersByTime(HOVER_OPEN_MS)
    expect(opened).toEqual([])
  })

  it('접히지 않은 줄은 재지 않는다', () => {
    hoverRow(row('open', false))
    vi.advanceTimersByTime(HOVER_OPEN_MS * 2)
    expect(opened).toEqual([])
  })

  it('끌기가 끝나면(뗌 · 취소 · Escape) 걷는다 — 뗀 이벤트 안의 다시 물음은 시계를 세우지 않는다', () => {
    const target = row('m', true)
    for (const end of ['pointerup', 'pointercancel'] as const) {
      hoverRow(target)
      vi.advanceTimersByTime(HOVER_OPEN_MS - 1)
      // 끌기 장치는 뗀 좌표로 `onOver` 를 한 번 더 묻는다(`drag/use-pointer-drag.ts`) — 같은 이벤트를 나르는 동안이다.
      window.addEventListener(end, () => hoverRow(target), { once: true })
      window.dispatchEvent(new Event(end))
      vi.advanceTimersByTime(HOVER_OPEN_MS * 2)
      expect(opened).toEqual([])
    }

    hoverRow(target)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    vi.advanceTimersByTime(HOVER_OPEN_MS * 2)
    expect(opened).toEqual([])
  })
})
