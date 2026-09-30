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
import { ActionMenu, type ActionMenuItem } from '../../src/shell/action-menu'

function Where(): ReactElement {
  return <span data-testid="where">{useLocation().pathname}</span>
}

/** 끈 항목이 **맨 앞 · 가운데 · 맨 끝**에 있다 — 건너뛰기가 세 자리에서 다 돌아야 한다. */
function items(onSelect: (key: string) => void): ActionMenuItem[] {
  return [
    { key: 'x', label: '맨 앞 끔', disabled: true, onSelect: () => onSelect('x') },
    { key: 'a', label: '가', onSelect: () => onSelect('a') },
    { key: 'b', label: '가운데 끔', disabled: true, onSelect: () => onSelect('b') },
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
  it('단추를 누르면 메뉴가 열리고 첫 켠 항목에 포커스가 간다', () => {
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
    expect(focused()).toBe('가')
  })

  it('단추에서 ↓ 로도 열리고 첫 켠 항목에 포커스가 간다', () => {
    host()
    toggle().focus()
    key('ArrowDown')
    expect(toggle().getAttribute('aria-expanded')).toBe('true')
    expect(focused()).toBe('가')
  })

  it('열린 채 단추를 다시 누르면 닫힌다', () => {
    host()
    fireEvent.click(toggle())
    fireEvent.click(toggle())
    expect(screen.queryByRole('menu')).toBeNull()
  })
})

describe('키보드', () => {
  it('↓ ↑ Home End 는 끈 항목을 건너뛰고 끝에서 돈다', () => {
    host()
    fireEvent.click(toggle())
    const seen: string[] = []
    for (const name of ['ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowUp', 'ArrowUp', 'End', 'Home']) {
      key(name)
      seen.push(focused())
    }
    // 켠 항목은 가 · 다 · 가기 셋이다 — 끝에서 돌 때 맨 끝 · 맨 앞의 끈 항목을 건넌다.
    expect(seen).toEqual(['다', '가기', '가', '가기', '다', '가기', '가'])
  })

  it('Enter 는 그 항목을 한 번 부르고 닫고 포커스를 단추로 돌려준다', () => {
    const onSelect = host()
    fireEvent.click(toggle())
    key('ArrowDown')
    key('Enter')
    expect(onSelect.mock.calls).toEqual([['c']])
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(toggle())
  })

  it('Space 도 Enter 와 같다', () => {
    const onSelect = host()
    fireEvent.click(toggle())
    key(' ')
    expect(onSelect.mock.calls).toEqual([['a']])
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('링크 항목의 Enter 는 그 주소로 옮긴다', () => {
    const onSelect = host()
    fireEvent.click(toggle())
    key('End')
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
    expect(focused()).toBe('가')
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
