/**
 * **이유를 싣는 꺼진 단추 — 행동 메뉴 밖**(`src/panels/meta-conflict.tsx` · `src/panels/menu-tree.tsx`의 `RemoveConfirm`). 행동 메뉴의 끈 항목과
 * 같은 방식이다(`src/shell/action-menu.tsx` 머리말 «끈 항목은 …»): `disabled` 대신 `aria-disabled` 로 꺼 포커스는 받고(이유에 키보드로
 * 닿는다), 누르기 · Enter 는 아무것도 안 한다. 같은 자리의 나머지 둘(빈 트리 «최상위 메뉴» · 연쇄 삭제 «모두 삭제»)은
 * `./menu-root.test.tsx` · `./menu-cascade-delete.test.tsx`가 앱째로 잰다.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MetaConflict } from '../../src/panels/meta-conflict'
import { RemoveConfirm } from '../../src/panels/menu-tree'
import { BUSY_REASON } from '../../src/panels/toolbar-status'
import { treeAbilities } from '../../src/tree/tree-actions'
import type { TreeCommands } from '../../src/tree/use-tree-commands'

afterEach(cleanup)

/** 꺼졌고 포커스를 받고 이유를 든다 — 세 값을 한 번에. */
function offState(button: HTMLElement): {
  off: string | null
  nativeDisabled: boolean
  focused: boolean
  title: string
  description: string | null
} {
  button.focus()
  return {
    off: button.getAttribute('aria-disabled'),
    nativeDisabled: (button as HTMLButtonElement).disabled,
    focused: document.activeElement === button,
    title: button.title,
    description: button.getAttribute('aria-description'),
  }
}

describe('제목 충돌 단추 — 덮기가 나가 있는 동안', () => {
  it('덮기 · 버리기 둘 다 꺼진 채 포커스를 받고 이유를 들고 · 눌러도 안 부른다', () => {
    const onOverwrite = vi.fn()
    const onDiscard = vi.fn()
    render(
      <MetaConflict what="제목" theirs="남의 제목" onOverwrite={onOverwrite} onDiscard={onDiscard} disabled disabledReason={BUSY_REASON} />,
    )
    for (const name of ['내 글로 덮기', '내 글 버리기']) {
      const button = screen.getByRole('button', { name })
      expect(offState(button), name).toEqual({
        off: 'true',
        nativeDisabled: false,
        focused: true,
        title: BUSY_REASON,
        description: BUSY_REASON,
      })
      fireEvent.click(button)
      fireEvent.keyDown(button, { key: 'Enter' })
    }
    expect({ overwrite: onOverwrite.mock.calls.length, discard: onDiscard.mock.calls.length }).toEqual({ overwrite: 0, discard: 0 })
  })

  it('«확인» 하나뿐인 판도 같다', () => {
    const onDiscard = vi.fn()
    render(<MetaConflict what="제목" theirs="남의 제목" onDiscard={onDiscard} disabled disabledReason={BUSY_REASON} />)
    const button = screen.getByRole('button', { name: '확인' })
    expect(offState(button)).toEqual({ off: 'true', nativeDisabled: false, focused: true, title: BUSY_REASON, description: BUSY_REASON })
    fireEvent.click(button)
    expect(onDiscard).not.toHaveBeenCalled()
  })

  it('대조 — 켜진 판은 이유가 없고 누르면 부른다', () => {
    const onOverwrite = vi.fn()
    render(<MetaConflict what="제목" theirs="남의 제목" onOverwrite={onOverwrite} onDiscard={vi.fn()} />)
    const button = screen.getByRole('button', { name: '내 글로 덮기' })
    expect(button.getAttribute('aria-disabled')).toBeNull()
    expect(button.getAttribute('aria-description')).toBeNull()
    fireEvent.click(button)
    expect(onOverwrite).toHaveBeenCalledTimes(1)
  })
})

describe('메뉴 삭제의 두 번 누르기 확인 — 조작이 나가 있는 동안', () => {
  function commands(busy: boolean): { commands: TreeCommands; confirmRemove: ReturnType<typeof vi.fn> } {
    const menu = [{ id: 'm-1', title: '회원관리', sortOrder: 0, pages: [], children: [] }]
    const selection = { kind: 'menu' as const, id: 'm-1' }
    const confirmRemove = vi.fn()
    return {
      confirmRemove,
      commands: {
        selection,
        busy,
        abilities: treeAbilities(menu, selection),
        confirmRemove,
        cancelRemove: vi.fn(),
      } as unknown as TreeCommands,
    }
  }

  it('«정말 삭제합니까?»가 꺼진 채 포커스를 받고(열릴 때 포커스가 선다) 이유를 들고 · 눌러도 안 지운다', () => {
    const { commands: busy, confirmRemove } = commands(true)
    render(<RemoveConfirm commands={busy} />)
    const button = screen.getByRole('button', { name: '정말 삭제합니까?' })
    expect(document.activeElement).toBe(button)
    expect(offState(button)).toEqual({ off: 'true', nativeDisabled: false, focused: true, title: BUSY_REASON, description: BUSY_REASON })
    fireEvent.click(button)
    expect(confirmRemove).not.toHaveBeenCalled()
  })

  it('대조 — 켜진 판은 누르면 지운다', () => {
    const { commands: idle, confirmRemove } = commands(false)
    render(<RemoveConfirm commands={idle} />)
    const button = screen.getByRole('button', { name: '정말 삭제합니까?' })
    expect(button.getAttribute('aria-disabled')).toBeNull()
    fireEvent.click(button)
    expect(confirmRemove).toHaveBeenCalledTimes(1)
  })
})
