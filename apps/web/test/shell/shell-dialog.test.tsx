/**
 * **대화 상자**(`src/shell/shell-dialog.tsx`) — 앱의 모달 하나. 스냅샷 · 내보내기가 그 안에 선다.
 *
 * **두 갈래를 다 잰다.** jsdom 25 의 `HTMLDialogElement`에는 `showModal`이 없다(`open` 속성으로 세우는 갈래가 돈다). 실브라우저는
 * `showModal` 갈래다 — 여기서는 프로토타입에 스텁을 얹어 그 갈래의 배선(부름 · `cancel` 이벤트)을 잰다. 스텁은 `open` 속성만 세운다 —
 * 포커스 가둠 · top layer 는 브라우저의 것이라 여기서 못 잰다(실브라우저 판은 `build-test/editor-restore-*.test.ts` 가 대화 상자로 연다).
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState, type ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ShellDialog } from '../../src/shell/shell-dialog'

function Host(props: { onClose: () => void }): ReactElement {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        열기
      </button>
      <ShellDialog
        open={open}
        title="스냅샷"
        onClose={() => {
          props.onClose()
          setOpen(false)
        }}
      >
        <input aria-label="태그" />
      </ShellDialog>
    </>
  )
}

function openHost(): ReturnType<typeof vi.fn> {
  const onClose = vi.fn()
  render(<Host onClose={onClose} />)
  const opener = screen.getByRole('button', { name: '열기' })
  opener.focus()
  fireEvent.click(opener)
  return onClose
}

function dialog(): HTMLElement {
  return screen.getByRole('dialog', { name: '스냅샷' })
}

const modes = [
  { name: 'showModal 이 없는 판(jsdom 기본)', modal: false },
  { name: 'showModal 이 있는 판(스텁)', modal: true },
] as const

/**
 * `showModal` · `close` 스텁. `open` 속성만 세우고 걷는다 — 실브라우저가 `close()`에서 하는 일 가운데 이 부품이 기대는 것은 그것이다
 * (닫힌 상자에 다시 `showModal`을 부를 수 있다 · 뒤 화면의 `inert`가 풀려 연 요소가 포커스를 받는다).
 */
function stubModal(): { showModal: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn>; restore: () => void } {
  const showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  })
  const close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open')
  })
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { value: showModal, configurable: true })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { value: close, configurable: true })
  return {
    showModal,
    close,
    restore: () => {
      delete (HTMLDialogElement.prototype as { showModal?: unknown }).showModal
      delete (HTMLDialogElement.prototype as { close?: unknown }).close
    },
  }
}

describe.each(modes)('$name', ({ modal }) => {
  let stub: ReturnType<typeof stubModal> | null = null

  beforeEach(() => {
    stub = modal ? stubModal() : null
  })
  afterEach(() => {
    // 열린 채 끝난 케이스의 상자를 스텁이 있는 동안 내린다 — 전역 `cleanup`은 이 뒤에 돈다.
    cleanup()
    stub?.restore()
  })

  it('열면 제목이 이름인 대화 상자가 서고 포커스가 그 안에 간다', () => {
    openHost()
    const box = dialog()
    expect(box.tagName).toBe('DIALOG')
    expect(box.hasAttribute('open')).toBe(true)
    expect(box.contains(document.activeElement)).toBe(true)
    expect(stub?.showModal.mock.calls.length ?? 0).toBe(modal ? 1 : 0)
  })

  it('닫혀 있으면 대화 상자가 없다', () => {
    render(<Host onClose={vi.fn()} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('닫기 단추는 onClose 를 한 번 부르고 연 요소로 포커스를 돌려준다', () => {
    const onClose = openHost()
    fireEvent.click(screen.getByRole('button', { name: '닫기' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(stub?.close.mock.calls.length ?? 0).toBe(modal ? 1 : 0)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '열기' }))
  })

  it('Escape 는 onClose 를 한 번 부르고 연 요소로 포커스를 돌려준다', () => {
    const onClose = openHost()
    const input = screen.getByRole('textbox', { name: '태그' })
    input.focus()
    // 브라우저는 모달의 Escape 에 `cancel`을 낸다. 두 신호가 한 번의 닫기로 모여야 한다 — 둘 다 보낸다.
    fireEvent.keyDown(input, { key: 'Escape' })
    const still = screen.queryByRole('dialog')
    if (modal && still !== null) fireEvent(still, new Event('cancel', { cancelable: true }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '열기' }))
  })

  it('한글 조합 중의 Escape 로는 닫지 않는다 — 친 글을 잃지 않는다', () => {
    const onClose = openHost()
    const input = screen.getByRole('textbox', { name: '태그' })
    // 조합 중인지는 두 길로 온다 — 키 이벤트의 `isComposing`과, 모달이면 조합 사이에 온 `cancel`(브라우저가 그 Escape 에 `cancel`을
    // 내는지는 이 자가 모른다 — 내도 닫지 않게 조합 구간을 따로 든다).
    fireEvent.compositionStart(input)
    fireEvent.keyDown(input, { key: 'Escape', isComposing: true })
    if (modal) fireEvent(dialog(), new Event('cancel', { cancelable: true }))
    expect(onClose).not.toHaveBeenCalled()
    expect(dialog()).toBeTruthy()
    // 조합이 끝나면 다시 닫힌다.
    fireEvent.compositionEnd(input)
    fireEvent.keyDown(input, { key: 'Escape' })
    if (modal) fireEvent(dialog(), new Event('cancel', { cancelable: true }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('바깥(backdrop)을 눌러도 닫지 않는다 — 폼에 친 글을 잃지 않게', () => {
    const onClose = openHost()
    fireEvent.mouseDown(dialog())
    fireEvent.click(dialog())
    expect(onClose).not.toHaveBeenCalled()
    expect(dialog()).toBeTruthy()
  })

  it('열린 채 셸째 내려가도 던지지 않는다 — 연 요소도 함께 내려갔다', () => {
    const { unmount } = render(<Host onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: '열기' }))
    expect(dialog()).toBeTruthy()
    unmount()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('cancel 이벤트', () => {
  it('브라우저가 스스로 닫지 않게 기본 동작을 막는다 — 열림은 open 값이 정한다', () => {
    const stub = stubModal()
    try {
      openHost()
      const cancel = new Event('cancel', { cancelable: true })
      fireEvent(dialog(), cancel)
      expect(cancel.defaultPrevented).toBe(true)
    } finally {
      cleanup()
      stub.restore()
    }
  })
})
