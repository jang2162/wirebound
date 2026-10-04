/**
 * `edit/use-editor-shortcuts.ts` — 표를 호스트 · 캔버스 문서의 `keydown` 에 거는 리스너.
 *
 * **훅만 세워 잰다.** `run` 을 기록하는 함수로 넣고, 어느 키가 어느 명령으로 닿는지 · 무엇이 안 닿는지 · `preventDefault` 가 선 명령에만
 * 걸리는지를 본다. 캔버스 문서는 jsdom 의 iframe 문서를 그대로 넘긴다 — 셸에 붙은 판은 `./editor-keys.test.tsx`.
 */
import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ShortcutCommand } from '../../src/edit/editor-shortcuts'
import { useEditorShortcuts } from '../../src/edit/use-editor-shortcuts'

const mounted: Element[] = []
afterEach(() => {
  for (const element of mounted.splice(0)) element.remove()
})

function mount<E extends Element>(element: E): E {
  document.body.appendChild(element)
  mounted.push(element)
  return element
}

function setup(options: { editable?: boolean; canvas?: Document | null } = {}) {
  const ran: ShortcutCommand[] = []
  const hook = renderHook(
    (props: { editable: boolean; canvas: Document | null }) =>
      useEditorShortcuts({
        canvasDocument: props.canvas,
        editable: props.editable,
        run: (command) => ran.push(command),
        platform: 'other',
      }),
    { initialProps: { editable: options.editable ?? true, canvas: options.canvas ?? null } },
  )
  return { ran, hook }
}

/** 그 대상에서 키를 올리고 `preventDefault` 가 걸렸는지 돌려준다. */
function press(target: EventTarget, init: KeyboardEventInit): boolean {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(event)
  return event.defaultPrevented
}

function canvasDocument(): Document {
  const frame = mount(document.createElement('iframe'))
  return frame.contentDocument!
}

describe('useEditorShortcuts', () => {
  it('평범한 자리의 키가 그 명령으로 닿고, 닿은 키만 막는다', () => {
    const { ran } = setup()
    expect(press(document.body, { key: 'z', code: 'KeyZ', ctrlKey: true })).toBe(true)
    expect(press(document.body, { key: 'Delete' })).toBe(true)
    expect(press(document.body, { key: '?', code: 'Slash', shiftKey: true })).toBe(true)
    // 표에 없는 키는 안 막는다 — 브라우저의 기본 동작이 그대로다.
    expect(press(document.body, { key: 'Tab' })).toBe(false)
    expect(press(document.body, { key: 'q' })).toBe(false)
    expect(ran).toEqual(['undo', 'delete', 'help'])
  })

  it.each([
    ['입력 칸', () => mount(document.createElement('input'))],
    ['글 상자', () => mount(document.createElement('textarea'))],
    ['고르개', () => mount(document.createElement('select'))],
    [
      'contenteditable',
      () => {
        const box = mount(document.createElement('div'))
        box.setAttribute('contenteditable', 'true')
        return box
      },
    ],
  ])('%s 에서 친 Backspace · Ctrl+Z · 화살표는 그 칸의 것이다 — run 0 · 막지 않음', (_label, make) => {
    const { ran } = setup()
    const target = make()
    expect(press(target, { key: 'Backspace' })).toBe(false)
    expect(press(target, { key: 'z', code: 'KeyZ', ctrlKey: true })).toBe(false)
    expect(press(target, { key: 'ArrowLeft' })).toBe(false)
    expect(ran).toEqual([])
  })

  it('한글 조합 중의 Backspace · Escape 는 조합의 키다', () => {
    const { ran } = setup()
    expect(press(document.body, { key: 'Backspace', isComposing: true })).toBe(false)
    expect(press(document.body, { key: 'Escape', isComposing: true })).toBe(false)
    expect(ran).toEqual([])
  })

  it('모달이 열린 동안에는 서지 않는다', () => {
    const { ran } = setup()
    const dialog = mount(document.createElement('dialog'))
    dialog.setAttribute('open', '')
    const button = dialog.appendChild(document.createElement('button'))
    expect(press(button, { key: 'Delete' })).toBe(false)
    expect(press(document.body, { key: 'ArrowDown' })).toBe(false)
    expect(ran).toEqual([])
  })

  it('메뉴 트리 상자(제 단축키를 받는 상자) 안에서는 서지 않는다', () => {
    const { ran } = setup()
    const box = mount(document.createElement('div'))
    box.setAttribute('data-wb-own-shortcuts', '')
    const row = box.appendChild(document.createElement('button'))
    expect(press(row, { key: 'Delete' })).toBe(false)
    expect(press(row, { key: 'ArrowUp', altKey: true })).toBe(false)
    expect(ran).toEqual([])
  })

  it('편집할 수 없으면(뷰 모드 · viewer) 편집 명령은 안 서고 막지도 않는다 — 고르기 · 도움말은 선다', () => {
    const { ran } = setup({ editable: false })
    expect(press(document.body, { key: 'z', code: 'KeyZ', ctrlKey: true })).toBe(false)
    expect(press(document.body, { key: 'Delete' })).toBe(false)
    expect(press(document.body, { key: 'ArrowUp', altKey: true })).toBe(false)
    expect(press(document.body, { key: 'd', code: 'KeyD', ctrlKey: true })).toBe(false)
    expect(press(document.body, { key: 'ArrowDown' })).toBe(true)
    expect(press(document.body, { key: 'Escape' })).toBe(true)
    expect(press(document.body, { key: '?', shiftKey: true })).toBe(true)
    expect(ran).toEqual(['selectNext', 'deselect', 'help'])
  })

  it('편집 권한이 바뀌면 리스너를 다시 걸지 않고 새 값을 본다', () => {
    const { ran, hook } = setup({ editable: false })
    press(document.body, { key: 'Delete' })
    hook.rerender({ editable: true, canvas: null })
    press(document.body, { key: 'Delete' })
    expect(ran).toEqual(['delete'])
  })

  it('캔버스 문서에서 난 키도 닿는다 — 캔버스 안 입력에서 난 키는 안 닿는다', () => {
    const canvas = canvasDocument()
    const { ran } = setup({ canvas })
    const input = canvas.body.appendChild(canvas.createElement('input'))

    expect(press(canvas.body, { key: 'z', code: 'KeyZ', ctrlKey: true })).toBe(true)
    expect(press(canvas.body, { key: 'Delete' })).toBe(true)
    expect(press(input, { key: 'Backspace' })).toBe(false)
    expect(press(input, { key: '?', shiftKey: true })).toBe(false)
    expect(ran).toEqual(['undo', 'delete'])
  })

  it('캔버스 문서가 바뀌면 옛 문서의 리스너를 걷고 새 문서에 건다 — 한 키가 두 번 닿지 않는다', () => {
    const first = canvasDocument()
    const second = canvasDocument()
    const { ran, hook } = setup({ canvas: first })
    hook.rerender({ editable: true, canvas: second })

    press(first.body, { key: 'Delete' })
    press(second.body, { key: 'Escape' })
    press(document.body, { key: 'ArrowDown' })
    expect(ran).toEqual(['deselect', 'selectNext'])

    hook.unmount()
    press(second.body, { key: 'Delete' })
    press(document.body, { key: 'Delete' })
    expect(ran).toEqual(['deselect', 'selectNext'])
  })

  it('누른 채의 반복 — Delete · Backspace · Ctrl+D 는 막기만 하고 안 선다, 되돌리기 · 화살표는 선다', () => {
    const { ran } = setup()
    // 거른 반복에도 막는다 — 막지 않으면 Ctrl/Cmd+D 반복이 브라우저의 책갈피를 연다.
    expect(press(document.body, { key: 'Delete', repeat: true })).toBe(true)
    expect(press(document.body, { key: 'Backspace', repeat: true })).toBe(true)
    expect(press(document.body, { key: 'd', code: 'KeyD', ctrlKey: true, repeat: true })).toBe(true)
    expect(press(document.body, { key: 'z', code: 'KeyZ', ctrlKey: true, repeat: true })).toBe(true)
    expect(press(document.body, { key: 'ArrowDown', repeat: true })).toBe(true)
    // 첫 누름(반복 아님)은 선다.
    expect(press(document.body, { key: 'Delete' })).toBe(true)
    expect(ran).toEqual(['undo', 'selectNext', 'delete'])
  })

  /** 그 역할(과 `aria-orientation`)을 단 상자 안의 단추. */
  function widget(role: string, orientation?: string): HTMLButtonElement {
    const box = mount(document.createElement('div'))
    box.setAttribute('role', role)
    if (orientation !== undefined) box.setAttribute('aria-orientation', orientation)
    return box.appendChild(document.createElement('button'))
  }

  const ARROWS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'] as const
  const ARROW_COMMAND: Record<(typeof ARROWS)[number], ShortcutCommand> = {
    ArrowUp: 'selectPrev',
    ArrowDown: 'selectNext',
    ArrowLeft: 'selectParent',
    ArrowRight: 'selectFirstChild',
  }

  it.each([
    ['메뉴 항목', 'menuitem'],
    ['목록', 'listbox'],
  ])('%s(role) 안의 화살표 · Escape 는 위젯의 것이다(run 0 · 막지 않음) — Delete · Ctrl+Z 는 단축키가 받는다', (_label, role) => {
    const { ran } = setup()
    const inner = widget(role)
    for (const key of [...ARROWS, 'Home', 'End', 'Escape', 'Enter']) expect(press(inner, { key })).toBe(false)
    expect(press(inner, { key: 'ArrowUp', altKey: true })).toBe(false)
    expect(press(inner, { key: 'Delete' })).toBe(true)
    expect(press(inner, { key: 'z', code: 'KeyZ', ctrlKey: true })).toBe(true)
    expect(ran).toEqual(['delete', 'undo'])
  })

  it.each([
    ['가로 탭 줄', 'tablist', undefined, ['ArrowLeft', 'ArrowRight']],
    ['세로 탭 줄', 'tablist', 'vertical', ['ArrowUp', 'ArrowDown']],
    ['가로 손잡이(기본)', 'separator', undefined, ['ArrowUp', 'ArrowDown']],
    ['세로 손잡이', 'separator', 'vertical', ['ArrowLeft', 'ArrowRight']],
    ['가로 값 조절(기본)', 'slider', undefined, ['ArrowLeft', 'ArrowRight']],
  ] as const)('%s 는 제 축의 화살표만 쥔다 — 다른 축의 화살표 · Escape · Delete 는 단축키가 받는다', (_label, role, orientation, held) => {
    const { ran } = setup()
    const inner = widget(role, orientation)
    const expected: ShortcutCommand[] = []
    for (const key of ARROWS) {
      const mine = (held as readonly string[]).includes(key)
      expect(press(inner, { key })).toBe(!mine)
      if (!mine) expected.push(ARROW_COMMAND[key])
    }
    expect(press(inner, { key: 'Home' })).toBe(false)
    expect(press(inner, { key: 'Escape' })).toBe(true)
    expect(press(inner, { key: 'Delete' })).toBe(true)
    expect(ran).toEqual([...expected, 'deselect', 'delete'])
  })

  it('탭은 탭 줄의 축을 따른다 — 세로 탭 줄 안의 탭은 ↑ ↓ 를 쥔다', () => {
    const { ran } = setup()
    const list = mount(document.createElement('div'))
    list.setAttribute('role', 'tablist')
    list.setAttribute('aria-orientation', 'vertical')
    const tab = list.appendChild(document.createElement('button'))
    tab.setAttribute('role', 'tab')
    expect(press(tab, { key: 'ArrowDown' })).toBe(false)
    expect(press(tab, { key: 'ArrowRight' })).toBe(true)
    expect(ran).toEqual(['selectFirstChild'])
  })

  it('열린 행동 메뉴(`data-wb-holds-keys="menu"`)는 Delete · Backspace 도 쥔다 — 명령 키 조합 · `?` 는 단축키가 받는다', () => {
    const { ran } = setup()
    const menu = mount(document.createElement('div'))
    menu.setAttribute('data-wb-holds-keys', 'menu')
    const inside = menu.appendChild(document.createElement('button'))

    expect(press(inside, { key: 'Delete' })).toBe(false)
    expect(press(inside, { key: 'Backspace' })).toBe(false)
    expect(press(inside, { key: 'Escape' })).toBe(false)
    expect(press(inside, { key: 'd', ctrlKey: true })).toBe(true)
    expect(press(inside, { key: '?' })).toBe(true)
    expect(press(document.body, { key: 'Delete' })).toBe(true)
    expect(ran).toEqual(['duplicate', 'help', 'delete'])
  })

  it('열린 고르개(`data-wb-holds-keys`)는 포커스가 그 안일 때만 화살표 · Escape 를 쥔다 — 밖의 키 · 안의 Delete 는 단축키가 받는다', () => {
    const { ran } = setup()
    const open = mount(document.createElement('div'))
    open.setAttribute('data-wb-holds-keys', '')
    const inside = open.appendChild(document.createElement('button'))
    const outside = mount(document.createElement('button'))

    expect(press(inside, { key: 'Escape' })).toBe(false)
    expect(press(inside, { key: 'ArrowLeft' })).toBe(false)
    expect(press(inside, { key: 'Delete' })).toBe(true)
    expect(press(outside, { key: 'Escape' })).toBe(true)
    expect(press(outside, { key: 'ArrowDown' })).toBe(true)
    expect(press(document.body, { key: 'Delete' })).toBe(true)
    expect(ran).toEqual(['delete', 'deselect', 'selectNext', 'delete'])
  })

  it('캔버스 문서에서는 포커스가 문서 자체 · 단추 · 링크일 때만 선다 — 그 밖의 포커스 받은 요소(닫힌 shadow 호스트 등)는 표면이다', () => {
    const canvas = canvasDocument()
    const { ran } = setup({ canvas })
    const button = canvas.body.appendChild(canvas.createElement('button'))
    const link = canvas.body.appendChild(canvas.createElement('a'))
    link.setAttribute('href', '#x')
    const bareLink = canvas.body.appendChild(canvas.createElement('a'))
    bareLink.tabIndex = 0
    // 닫힌 shadow 안 입력에 포커스가 있으면 문서의 `activeElement` 는 그 호스트다 — jsdom 은 shadow 안 포커스를 안 옮겨 호스트를 직접 고른다.
    const host = canvas.body.appendChild(canvas.createElement('div'))
    host.attachShadow({ mode: 'closed' })
    host.tabIndex = 0
    const text = canvas.body.appendChild(canvas.createElement('div'))
    /** 그 요소에 포커스를 두고 그 요소에서 키를 올린다. */
    const at = (element: HTMLElement, init: KeyboardEventInit) => {
      element.focus()
      return press(element, init)
    }

    expect(press(canvas.body, { key: 'Delete' })).toBe(true)
    // 클립보드 이벤트처럼 대상이 포커스와 다른 판 — 포커스가 `body` 면 대상이 테마의 `div` 여도 선다.
    expect(press(text, { key: 'ArrowDown' })).toBe(true)
    expect(at(button, { key: 'Delete' })).toBe(true)
    expect(at(link, { key: 'ArrowDown' })).toBe(true)
    expect(at(bareLink, { key: 'Delete' })).toBe(false)
    expect(at(host, { key: 'Backspace' })).toBe(false)
    expect(at(host, { key: '?', shiftKey: true })).toBe(false)
    expect(at(host, { key: 'z', code: 'KeyZ', ctrlKey: true })).toBe(false)
    // 호스트 문서의 같은 요소는 그대로 선다 — 이 거름은 캔버스 문서만의 것이다.
    const hostDiv = mount(document.createElement('div'))
    hostDiv.tabIndex = 0
    expect(at(hostDiv, { key: 'Delete' })).toBe(true)
    expect(ran).toEqual(['delete', 'selectNext', 'delete', 'selectNext', 'delete'])
  })
})
