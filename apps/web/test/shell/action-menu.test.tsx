/**
 * **행동 메뉴**(`src/shell/action-menu.tsx`) — 에디터 머리 · 목록 머리의 `…` 와 트리 줄의 `+` · `…` 가 함께 쓰는 부품.
 *
 * 최소 숙주로 잰다(`popover-dismiss.test.tsx` 와 같은 판단) — 머리에 붙어 무엇을 여는지는 그 화면의 파일이 잰다
 * (`editor-header.test.tsx` · `routes/project-list.test.tsx`).
 *
 * # 이 자가 못 보는 것
 *
 * - **jsdom 의 `fireEvent.mouseDown` 은 포커스를 안 옮긴다.** 실브라우저의 바깥 누름은 누른 자리가 포커스를 받는다 — «포커스가 단추로
 *   돌아온다»는 메뉴 안에 있던 포커스를 떠돌게 두지 않는다는 것까지다(누른 자리가 포커스를 받는 판은 그 누름이 가져간다).
 * - **자리(`usePopoverSide`)는 안 잰다** — jsdom 은 레이아웃이 없다. 그 판정은 `popover-side.test.tsx` 가 잰다.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter, useLocation } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { ActionMenu, DOUBLE_CLICK_MS, DOUBLE_CLICK_SLOP, type ActionMenuItem } from '../../src/shell/action-menu'
import { keyHeldByWidget } from '../../src/edit/editor-shortcuts'

function Where(): ReactElement {
  return <span data-testid="where">{useLocation().pathname}</span>
}

/** 끈 항목이 **맨 앞 · 가운데 · 맨 끝**에 있다 — 화살표가 세 자리에 다 서고 그 자리의 Enter · Space · 누름이 아무것도 안 해야 한다. */
function items(onSelect: (key: string) => void): ActionMenuItem[] {
  return [
    { key: 'x', label: '맨 앞 끔', disabled: true, onSelect: () => onSelect('x') },
    { key: 'a', label: '가', onSelect: () => onSelect('a') },
    { key: 'b', label: '가운데 끔', disabled: true, description: '가운데가 꺼진 이유', onSelect: () => onSelect('b') },
    { key: 'c', label: '다', onSelect: () => onSelect('c') },
    { key: 'go', label: '가기', to: '/elsewhere' },
    { key: 'd', label: '맨 끝 끔', disabled: true, onSelect: () => onSelect('d') },
  ]
}

function host(onSelect = vi.fn<(key: string) => void>(), heading?: string): typeof onSelect {
  render(
    <MemoryRouter initialEntries={['/here']}>
      <ActionMenu label="더 보기" heading={heading} items={items(onSelect)} />
      <button type="button">바깥</button>
      <Where />
    </MemoryRouter>,
  )
  return onSelect
}

function toggle(): HTMLElement {
  return screen.getByRole('button', { name: '더 보기' })
}

function menu(): HTMLElement {
  return screen.getByRole('menu')
}

function focused(): string {
  return document.activeElement?.textContent ?? ''
}

function key(name: string): void {
  fireEvent.keyDown(document.activeElement ?? document.body, { key: name })
}

describe('여닫기', () => {
  it('단추를 누르면 메뉴가 열리고 첫 항목에 포커스가 간다 — 끈 항목이어도', () => {
    host()
    expect(toggle().getAttribute('aria-haspopup')).toBe('menu')
    expect(toggle().getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('menu')).toBeNull()

    fireEvent.click(toggle())

    expect(toggle().getAttribute('aria-expanded')).toBe('true')
    expect(menu()).toBeTruthy()
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      '맨 앞 끔',
      '가',
      '가운데 끔',
      '다',
      '가기',
      '맨 끝 끔',
    ])
    expect(focused()).toBe('맨 앞 끔')
  })

  it('단추에서 ↓ · ↑ 로도 열리고 첫 · 끝 항목에 포커스가 간다', () => {
    host()
    toggle().focus()
    key('ArrowDown')
    expect(toggle().getAttribute('aria-expanded')).toBe('true')
    expect(focused()).toBe('맨 앞 끔')
    key('Escape')
    key('ArrowUp')
    expect(focused()).toBe('맨 끝 끔')
  })

  it('열린 채 단추를 다시 누르면 닫힌다', () => {
    host()
    fireEvent.click(toggle())
    fireEvent.click(toggle())
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('열린 동안 `openWhile` 이 거짓이 되면 닫고 포커스를 단추로 돌려준다 — 참인 채 다시 그리면 그대로다', () => {
    const view = (openWhile: boolean) => (
      <MemoryRouter>
        <ActionMenu label="더 보기" items={items(vi.fn())} openWhile={openWhile} />
      </MemoryRouter>
    )
    const { rerender } = render(view(true))
    fireEvent.click(toggle())
    rerender(view(true))
    expect({ menus: screen.queryAllByRole('menu').length, focus: focused() }).toEqual({ menus: 1, focus: '맨 앞 끔' })
    rerender(view(false))
    expect({ menus: screen.queryAllByRole('menu').length, focus: document.activeElement === toggle() }).toEqual({ menus: 0, focus: true })
  })

  /**
   * 목록은 `document.body` 로 portal 되어 단추 상자 밖이다(`src/shell/action-menu.tsx` 머리말 «목록은 문서 맨 위 겹에 선다») — 목록에도 같은
   * 표지를 단다. 둘 다 에디터 단축키의 판정(`keyHeldByWidget`)으로 잰다.
   */
  it('열린 동안만 단추까지 감싼 상자와 목록에 `data-wb-holds-keys="menu"` 를 단다 — 단추와 목록의 키(Delete · Backspace 포함)가 메뉴의 것이다', () => {
    host()
    const held = (element: Element, name = 'ArrowDown') => keyHeldByWidget({ key: name, target: element })
    expect([held(toggle()), held(toggle(), 'Delete')]).toEqual([false, false])
    fireEvent.click(toggle())
    expect([held(toggle()), held(document.activeElement!), held(toggle(), 'Delete'), held(document.activeElement!, 'Backspace')]).toEqual([true, true, true, true])
    key('Escape')
    expect([held(toggle()), held(toggle(), 'Delete')]).toEqual([false, false])
  })
})

describe('키보드', () => {
  it('↓ ↑ Home End 는 끈 항목에도 서고 끝에서 돈다', () => {
    host()
    fireEvent.click(toggle())
    const seen: string[] = []
    for (const name of ['ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowUp', 'ArrowUp', 'End', 'ArrowDown', 'ArrowUp', 'Home', 'ArrowUp']) {
      key(name)
      seen.push(focused())
    }
    expect(seen).toEqual(['가', '가운데 끔', '다', '가운데 끔', '가', '맨 끝 끔', '맨 앞 끔', '맨 끝 끔', '맨 앞 끔', '맨 끝 끔'])
  })

  it('끈 항목에 선 포커스는 그 이유(`aria-description`)를 든다 — 키보드로 이유에 닿는 자리', () => {
    host()
    fireEvent.click(toggle())
    key('ArrowDown')
    key('ArrowDown')
    expect(document.activeElement?.getAttribute('role')).toBe('menuitem')
    expect(document.activeElement?.getAttribute('aria-disabled')).toBe('true')
    expect(document.activeElement?.getAttribute('aria-description')).toBe('가운데가 꺼진 이유')
  })

  it('끈 항목의 Enter · Space 는 아무것도 안 부르고 메뉴는 열린 채 · 포커스도 그 자리다', () => {
    const onSelect = host()
    fireEvent.click(toggle())
    for (const name of ['Enter', ' ']) {
      key(name)
      expect({ name, menus: screen.queryAllByRole('menu').length, focus: focused() }).toEqual({ name, menus: 1, focus: '맨 앞 끔' })
    }
    key('End')
    key('Enter')
    expect({ menus: screen.queryAllByRole('menu').length, focus: focused() }).toEqual({ menus: 1, focus: '맨 끝 끔' })
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('Enter 는 그 항목을 한 번 부르고 닫고 포커스를 단추로 돌려준다', () => {
    const onSelect = host()
    fireEvent.click(toggle())
    key('ArrowDown')
    key('ArrowDown')
    key('ArrowDown')
    key('Enter')
    expect(onSelect.mock.calls).toEqual([['c']])
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(toggle())
  })

  it('Space 도 Enter 와 같다', () => {
    const onSelect = host()
    fireEvent.click(toggle())
    key('ArrowDown')
    key(' ')
    expect(onSelect.mock.calls).toEqual([['a']])
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('링크 항목의 Enter 는 그 주소로 옮긴다', () => {
    const onSelect = host()
    fireEvent.click(toggle())
    key('End')
    key('ArrowUp')
    expect(focused()).toBe('가기')
    key('Enter')
    expect(screen.getByTestId('where').textContent).toBe('/elsewhere')
    expect(onSelect).not.toHaveBeenCalled()
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('Escape 는 아무것도 안 부르고 닫고 포커스를 단추로 돌려준다', () => {
    const onSelect = host()
    fireEvent.click(toggle())
    key('ArrowDown')
    key('Escape')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(toggle())
    expect(onSelect).not.toHaveBeenCalled()
  })
})

describe('누름', () => {
  it('항목을 누르면 한 번 부르고 닫고 포커스를 단추로 돌려준다', () => {
    const onSelect = host()
    fireEvent.click(toggle())
    fireEvent.click(screen.getByRole('menuitem', { name: '다' }))
    expect(onSelect.mock.calls).toEqual([['c']])
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(toggle())
  })

  it('끈 항목은 눌러도 안 부르고 메뉴가 열린 채다', () => {
    const onSelect = host()
    fireEvent.click(toggle())
    const off = screen.getByRole('menuitem', { name: '가운데 끔' })
    expect(off.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(off)
    expect(onSelect).not.toHaveBeenCalled()
    expect(menu()).toBeTruthy()
  })

  it('바깥을 누르면 아무것도 안 부르고 닫고 포커스를 단추로 돌려준다', () => {
    const onSelect = host()
    fireEvent.click(toggle())
    expect(focused()).toBe('맨 앞 끔')
    fireEvent.mouseDown(screen.getByRole('button', { name: '바깥' }))
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(toggle())
    expect(onSelect).not.toHaveBeenCalled()
  })
})

describe('머리', () => {
  it('머리는 목록 위에 선다', () => {
    host(vi.fn(), '홍길동')
    fireEvent.click(toggle())
    const heading = screen.getByText('홍길동')
    expect(heading.compareDocumentPosition(menu()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // 머리는 항목이 아니다 — 화살표가 거기 서지 않는다.
    expect(heading.closest('[role="menu"]')).toBeNull()
  })

  it('머리가 없으면 그리지 않는다', () => {
    host()
    fireEvent.click(toggle())
    expect(menu().previousElementSibling).toBeNull()
  })
})

/**
 * **포인터로 고른 뒤 한 더블클릭 간격 동안 오는 클릭 하나를 삼킨다**(`action-menu.tsx` 머리말 · C2 리뷰 발견 3). jsdom 은 좌표가 없어
 * «닫힌 자리 밑의 요소»를 못 세운다 — 여기서는 삼키는 시간 · 하나만 · 키보드는 안 삼킴을 재고, 실브라우저의 폭 · 자리 판은
 * `build-test/tree-drag-review.test.ts` «삭제 항목의 둘째 누름 …»이 잰다.
 */
describe('고른 뒤의 둘째 누름', () => {
  function hostWithOutside(): { onSelect: ReturnType<typeof vi.fn>; outside: ReturnType<typeof vi.fn> } {
    const onSelect = vi.fn()
    const outside = vi.fn()
    render(
      <MemoryRouter initialEntries={['/here']}>
        <ActionMenu label="더 보기" items={items(onSelect)} />
        <button type="button" onClick={outside}>
          밑
        </button>
      </MemoryRouter>,
    )
    return { onSelect, outside }
  }

  it('포인터로 고르면(`detail` 1) 같은 자리에 곧이어 온 클릭 하나는 밑의 요소에 안 닿는다 — 그다음 클릭은 닿는다', () => {
    vi.useFakeTimers()
    try {
      const { onSelect, outside } = hostWithOutside()
      fireEvent.click(toggle())
      fireEvent.click(screen.getByRole('menuitem', { name: '가' }), { detail: 1, clientX: 40, clientY: 60 })
      // 더블클릭의 둘째 누름 — 첫 누름 자리에서 손 떨림만큼.
      fireEvent.click(screen.getByRole('button', { name: '밑' }), { detail: 2, clientX: 43, clientY: 64 })
      expect({ select: onSelect.mock.calls, outside: outside.mock.calls.length }).toEqual({ select: [['a']], outside: 0 })

      fireEvent.click(screen.getByRole('button', { name: '밑' }), { detail: 1 })
      expect(outside).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('다른 자리의 클릭은 곧이어 와도 삼키지 않는다 — 고른 항목이 연 확인 · 대화 상자를 곧바로 누르는 판', () => {
    vi.useFakeTimers()
    try {
      const { outside } = hostWithOutside()
      fireEvent.click(toggle())
      fireEvent.click(screen.getByRole('menuitem', { name: '가' }), { detail: 1, clientX: 40, clientY: 60 })
      fireEvent.click(screen.getByRole('button', { name: '밑' }), { detail: 1, clientX: 40, clientY: 60 + DOUBLE_CLICK_SLOP + 1 })
      expect(outside).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('더블클릭 간격이 지나면 삼키지 않는다', () => {
    vi.useFakeTimers()
    try {
      const { outside } = hostWithOutside()
      fireEvent.click(toggle())
      fireEvent.click(screen.getByRole('menuitem', { name: '가' }), { detail: 1 })
      vi.advanceTimersByTime(DOUBLE_CLICK_MS)
      fireEvent.click(screen.getByRole('button', { name: '밑' }), { detail: 1 })
      expect(outside).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('키보드로 고르면(Enter — `detail` 0) 삼키지 않는다', () => {
    const { onSelect, outside } = hostWithOutside()
    fireEvent.click(toggle())
    key('ArrowDown')
    key('Enter')
    fireEvent.click(screen.getByRole('button', { name: '밑' }), { detail: 1 })
    expect({ select: onSelect.mock.calls, outside: outside.mock.calls.length }).toEqual({ select: [['a']], outside: 1 })
  })
})
