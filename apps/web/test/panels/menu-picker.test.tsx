/**
 * **옮기기 목록의 «취소» — 연 자리로 포커스를 돌려준다**(`src/panels/menu-picker.tsx` 머리말). jsdom 값이다 — 줄 `…` 에서 연 실브라우저 판은
 * `build-test/keyboard-holes.test.ts` «5» 가 갖는다.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MenuPicker } from '../../src/panels/menu-picker'

/** 연 자리(`opener`)에 포커스를 둔 채 목록을 그린다. */
function mount(): { opener: HTMLButtonElement; other: HTMLButtonElement; onCancel: ReturnType<typeof vi.fn> } {
  const opener = document.body.appendChild(document.createElement('button'))
  opener.textContent = '연 자리'
  const other = document.body.appendChild(document.createElement('button'))
  other.textContent = '다른 자리'
  opener.focus()
  const onCancel = vi.fn()
  render(<MenuPicker options={[{ id: 'm-1', path: '가' }]} onPick={() => {}} onCancel={onCancel} />)
  return { opener, other, onCancel }
}

describe('옮기기 목록의 «취소»', () => {
  // 연 자리 · 다른 자리 단추는 `render` 밖에 붙였다 — 케이스마다 걷는다.
  afterEach(() => document.body.replaceChildren())

  it('포커스가 목록 안이면 닫으며 연 자리로 돌려준다', () => {
    const { opener, onCancel } = mount()
    const cancel = screen.getByRole('button', { name: '취소' })
    cancel.focus()
    fireEvent.click(cancel)
    expect({ called: onCancel.mock.calls.length, focus: document.activeElement === opener }).toEqual({ called: 1, focus: true })
  })

  it('포커스가 목록 밖이면 그 자리를 안 뺏는다', () => {
    const { other, onCancel } = mount()
    other.focus()
    fireEvent.click(screen.getByRole('button', { name: '취소' }))
    expect({ called: onCancel.mock.calls.length, focus: document.activeElement === other }).toEqual({ called: 1, focus: true })
  })
})
