/**
 * **옮기기 목록이 내려갈 때 — 연 자리로 포커스를 돌려준다**(`src/panels/menu-picker.tsx` 머리말). 목록이 내려가는 길은 «취소» · 목록 안의 Escape · 메뉴를
 * 고른 뒤 셋이고, 돌려주는 것은 **내려갈 때**(정리) 한 곳이다. jsdom 값이다 — 줄 `…` 에서 연 실브라우저 판은 `build-test/keyboard-holes.test.ts` «5» ·
 * «7» 이 갖는다.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MenuPicker } from '../../src/panels/menu-picker'

/** 목록을 연 부모 — 취소 · 고르기가 목록을 내린다(`onCancel` 이 부모의 상태를 바꿔 목록을 뺀다). */
function Host(props: { onCancel: () => void; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(true)
  return open ? (
    <MenuPicker
      options={[{ id: 'm-1', path: '가' }]}
      onPick={(id) => {
        props.onPick(id)
        setOpen(false)
      }}
      onCancel={() => {
        props.onCancel()
        setOpen(false)
      }}
    />
  ) : null
}

/** 연 자리(`opener`)에 포커스를 둔 채 목록을 그린다. */
function mount(): { opener: HTMLButtonElement; other: HTMLButtonElement; onCancel: ReturnType<typeof vi.fn>; onPick: ReturnType<typeof vi.fn> } {
  const opener = document.body.appendChild(document.createElement('button'))
  opener.textContent = '연 자리'
  const other = document.body.appendChild(document.createElement('button'))
  other.textContent = '다른 자리'
  opener.focus()
  const onCancel = vi.fn()
  const onPick = vi.fn()
  render(<Host onCancel={onCancel} onPick={onPick} />)
  return { opener, other, onCancel, onPick }
}

describe('옮기기 목록이 내려갈 때', () => {
  // 연 자리 · 다른 자리 단추는 `render` 밖에 붙였다 — 케이스마다 걷는다.
  afterEach(() => document.body.replaceChildren())

  it('«취소»로 내리면 포커스가 목록 안이었을 때 연 자리로 돌려준다', () => {
    const { opener, onCancel } = mount()
    const cancel = screen.getByRole('button', { name: '취소' })
    cancel.focus()
    fireEvent.click(cancel)
    expect({ called: onCancel.mock.calls.length, focus: document.activeElement === opener, listed: screen.queryByRole('button', { name: '취소' }) }).toEqual({ called: 1, focus: true, listed: null })
  })

  it('목록 안의 Escape 도 내리고 연 자리로 돌려준다 — 고르는 칸 · «취소» 모두', () => {
    for (const target of ['고르는 칸', '취소'] as const) {
      const { opener, onCancel } = mount()
      const element = target === '취소' ? screen.getByRole('button', { name: '취소' }) : screen.getByRole('combobox')
      element.focus()
      fireEvent.keyDown(element, { key: 'Escape' })
      expect({ target, called: onCancel.mock.calls.length, focus: document.activeElement === opener }).toEqual({ target, called: 1, focus: true })
      document.body.replaceChildren()
    }
  })

  it('한글 조합 중의 Escape 는 조합의 키라 내리지 않는다', () => {
    const { onCancel } = mount()
    const select = screen.getByRole('combobox')
    select.focus()
    fireEvent.keyDown(select, { key: 'Escape', isComposing: true })
    expect({ called: onCancel.mock.calls.length, listed: screen.queryByRole('button', { name: '취소' }) !== null }).toEqual({ called: 0, listed: true })
  })

  it('메뉴를 고르면 내리고 포커스가 목록 안이었으면 연 자리로 돌려준다', () => {
    const { opener, onPick } = mount()
    const select = screen.getByRole('combobox')
    select.focus()
    fireEvent.change(select, { target: { value: 'm-1' } })
    expect({ picked: onPick.mock.calls, focus: document.activeElement === opener }).toEqual({ picked: [['m-1']], focus: true })
  })

  it('포커스가 목록 밖이면 그 자리를 안 뺏는다', () => {
    const { other, onCancel } = mount()
    other.focus()
    fireEvent.click(screen.getByRole('button', { name: '취소' }))
    expect({ called: onCancel.mock.calls.length, focus: document.activeElement === other }).toEqual({ called: 1, focus: true })
  })
})
