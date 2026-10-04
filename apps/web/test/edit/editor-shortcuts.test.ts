/**
 * `edit/editor-shortcuts.ts` — 에디터 단축키 표 하나와 «서지 않는 때».
 *
 * **화면 없이 잰다.** 표가 키를 무엇으로 읽는지(mac 의 Cmd · 그 밖의 Ctrl · 라틴 글자가 아닌 `key`)와 거르개가 무엇을 막는지를 값으로 본다 —
 * 그 판정이 리스너를 지나는지는 `./use-editor-shortcuts.test.tsx`, 셸의 명령에 닿는지는 `./editor-keys.test.tsx` 가 잰다.
 */
import { afterEach, describe, expect, it } from 'vitest'
import {
  CLIPBOARD_SHORTCUT_LINES,
  EDITOR_SHORTCUTS,
  platformOf,
  shortcutFor,
  shortcutsBlocked,
  type Platform,
  type ShortcutCommand,
  type ShortcutKeyEvent,
} from '../../src/edit/editor-shortcuts'

function key(init: Partial<ShortcutKeyEvent>): ShortcutKeyEvent {
  return { key: '', code: '', altKey: false, shiftKey: false, metaKey: false, ctrlKey: false, ...init }
}

/** 플랫폼의 명령 키를 실은 이벤트. */
function cmd(platform: Platform, init: Partial<ShortcutKeyEvent>): ShortcutKeyEvent {
  return key(platform === 'mac' ? { metaKey: true, ...init } : { ctrlKey: true, ...init })
}

const commandOf = (event: ShortcutKeyEvent, platform: Platform): ShortcutCommand | null =>
  shortcutFor(event, platform)?.command ?? null

describe('shortcutFor — 키마다 그 명령', () => {
  const PLATFORMS: Platform[] = ['mac', 'other']

  it.each(PLATFORMS)('%s — 명령 키 조합', (platform) => {
    expect(commandOf(cmd(platform, { key: 'z', code: 'KeyZ' }), platform)).toBe('undo')
    expect(commandOf(cmd(platform, { key: 'Z', code: 'KeyZ', shiftKey: true }), platform)).toBe('redo')
    expect(commandOf(cmd(platform, { key: 'y', code: 'KeyY' }), platform)).toBe('redo')
    expect(commandOf(cmd(platform, { key: 'd', code: 'KeyD' }), platform)).toBe('duplicate')
    // Cmd+A 는 «형제 모두 고르기»다(`EDITOR_SHORTCUTS` 머리말) — Shift 를 더하면 안 선다.
    expect(commandOf(cmd(platform, { key: 'a', code: 'KeyA' }), platform)).toBe('selectSiblings')
    expect(commandOf(cmd(platform, { key: 'A', code: 'KeyA', shiftKey: true }), platform)).toBeNull()
  })

  it('Cmd 와 Ctrl 이 엇갈리면 안 선다 — mac 의 Ctrl+Z · 그 밖의 Cmd(Win)+Z', () => {
    expect(commandOf(key({ key: 'z', code: 'KeyZ', ctrlKey: true }), 'mac')).toBeNull()
    expect(commandOf(key({ key: 'z', code: 'KeyZ', metaKey: true }), 'other')).toBeNull()
    // 둘 다 눌려도 안 선다.
    expect(commandOf(key({ key: 'z', code: 'KeyZ', metaKey: true, ctrlKey: true }), 'mac')).toBeNull()
    // 명령 키 없는 글자는 표에 없다.
    expect(commandOf(key({ key: 'z', code: 'KeyZ' }), 'mac')).toBeNull()
  })

  it('`key` 가 라틴 글자가 아니면 `code` 로 읽는다 — 한글 자판의 Ctrl+ㅋ 는 되돌리기', () => {
    expect(commandOf(key({ key: 'ㅋ', code: 'KeyZ', ctrlKey: true }), 'other')).toBe('undo')
    expect(commandOf(key({ key: 'ㅛ', code: 'KeyY', ctrlKey: true }), 'other')).toBe('redo')
  })

  it('`key` 가 라틴 글자면 `key` 가 이긴다 — 자리가 다른 자판(Dvorak)에서 글자대로 선다', () => {
    // Dvorak 의 `z` 는 물리 키 `Slash` 자리다.
    expect(commandOf(key({ key: 'z', code: 'Slash', ctrlKey: true }), 'other')).toBe('undo')
    expect(commandOf(key({ key: ';', code: 'KeyZ', ctrlKey: true }), 'other')).toBeNull()
  })

  it('수식 키 없는 키', () => {
    expect(commandOf(key({ key: 'Delete' }), 'mac')).toBe('delete')
    expect(commandOf(key({ key: 'Backspace' }), 'mac')).toBe('delete')
    expect(commandOf(key({ key: 'Escape' }), 'other')).toBe('deselect')
    expect(commandOf(key({ key: 'ArrowUp' }), 'other')).toBe('selectPrev')
    expect(commandOf(key({ key: 'ArrowDown' }), 'other')).toBe('selectNext')
    expect(commandOf(key({ key: 'ArrowLeft' }), 'other')).toBe('selectParent')
    expect(commandOf(key({ key: 'ArrowRight' }), 'other')).toBe('selectFirstChild')
  })

  it('Alt 를 든 화살표는 순서 · 계층이다 — Alt 없는 화살표(선택 이동)와 갈린다', () => {
    expect(commandOf(key({ key: 'ArrowUp', altKey: true }), 'mac')).toBe('moveUp')
    expect(commandOf(key({ key: 'ArrowDown', altKey: true }), 'mac')).toBe('moveDown')
    expect(commandOf(key({ key: 'ArrowLeft', altKey: true, shiftKey: true }), 'mac')).toBe('outdent')
    expect(commandOf(key({ key: 'ArrowRight', altKey: true, shiftKey: true }), 'mac')).toBe('indent')
    // Shift 없는 Alt+좌우는 브라우저의 뒤로 · 앞으로라 비워 둔다.
    expect(commandOf(key({ key: 'ArrowLeft', altKey: true }), 'other')).toBeNull()
    expect(commandOf(key({ key: 'ArrowRight', altKey: true }), 'other')).toBeNull()
  })

  it('수식 키를 든 Delete · 화살표는 표에 없다 — Cmd+Backspace · Shift+화살표는 다른 몸짓이다', () => {
    expect(commandOf(key({ key: 'Backspace', metaKey: true }), 'mac')).toBeNull()
    expect(commandOf(key({ key: 'ArrowDown', shiftKey: true }), 'mac')).toBeNull()
    expect(commandOf(key({ key: 'ArrowDown', metaKey: true }), 'mac')).toBeNull()
  })

  it('`?` 는 Shift+/ — `key` 로도 `code` 로도', () => {
    expect(commandOf(key({ key: '?', code: 'Slash', shiftKey: true }), 'mac')).toBe('help')
    expect(commandOf(key({ key: '?', code: 'Minus', shiftKey: true }), 'other')).toBe('help') // 자판마다 자리가 다르다
    expect(commandOf(key({ key: 'Process', code: 'Slash', shiftKey: true }), 'other')).toBe('help')
    expect(commandOf(key({ key: '/', code: 'Slash' }), 'other')).toBeNull()
    expect(commandOf(key({ key: '?', code: 'Slash', shiftKey: true, ctrlKey: true }), 'other')).toBeNull()
  })

  it('Tab 은 빼앗지 않는다', () => {
    expect(commandOf(key({ key: 'Tab' }), 'mac')).toBeNull()
    expect(commandOf(key({ key: 'Tab', shiftKey: true }), 'mac')).toBeNull()
  })

  it('편집을 내는 명령과 아닌 명령이 갈린다', () => {
    const edits = EDITOR_SHORTCUTS.filter((shortcut) => shortcut.edits).map((shortcut) => shortcut.command)
    expect(edits.sort()).toEqual(['alias', 'delete', 'duplicate', 'indent', 'moveDown', 'moveUp', 'outdent', 'redo', 'undo'])
  })

  it('명령마다 줄 하나 · 도움말 글자가 플랫폼을 따른다', () => {
    const commands = EDITOR_SHORTCUTS.map((shortcut) => shortcut.command)
    expect(new Set(commands).size).toBe(commands.length)
    const undo = EDITOR_SHORTCUTS.find((shortcut) => shortcut.command === 'undo')!
    expect(undo.keys('mac')).toBe('⌘Z')
    expect(undo.keys('other')).toBe('Ctrl+Z')
    expect(CLIPBOARD_SHORTCUT_LINES.map((line) => [line.label, line.keys('mac'), line.keys('other')])).toEqual([
      ['복사', '⌘C', 'Ctrl+C'],
      ['잘라내기', '⌘X', 'Ctrl+X'],
      ['붙여넣기', '⌘V', 'Ctrl+V'],
    ])
  })
})

describe('platformOf', () => {
  it('Mac · iPad 는 mac, 그 밖은 other — platform 이 비면 userAgent', () => {
    expect(platformOf({ platform: 'MacIntel', userAgent: '' })).toBe('mac')
    expect(platformOf({ platform: 'iPad', userAgent: '' })).toBe('mac')
    expect(platformOf({ platform: 'Win32', userAgent: 'Mozilla/5.0 (Windows NT 10.0)' })).toBe('other')
    expect(platformOf({ platform: 'Linux x86_64', userAgent: '' })).toBe('other')
    expect(platformOf({ platform: '', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)' })).toBe('mac')
  })
})

describe('shortcutsBlocked — 서지 않는 때', () => {
  const mounted: Element[] = []
  afterEach(() => {
    for (const element of mounted.splice(0)) element.remove()
  })

  function mount<E extends Element>(element: E, parent: Element = document.body): E {
    parent.appendChild(element)
    if (parent === document.body) mounted.push(element)
    return element
  }

  /** 그 요소에서 키를 올려 거르개의 답을 받는다. */
  function blockedFrom(target: EventTarget, init: KeyboardEventInit = { key: 'Delete' }, prevent = false): boolean {
    let answer: boolean | null = null
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
    const listen = (seen: Event): void => {
      answer = shortcutsBlocked(seen as KeyboardEvent)
    }
    window.addEventListener('keydown', listen)
    const owner = (target as Node).ownerDocument?.defaultView
    if (owner && owner !== window) owner.addEventListener('keydown', listen)
    if (prevent) target.addEventListener('keydown', (seen) => seen.preventDefault())
    target.dispatchEvent(event)
    window.removeEventListener('keydown', listen)
    if (owner && owner !== window) owner.removeEventListener('keydown', listen)
    if (answer === null) throw new Error('거르개를 부르지 못했다')
    return answer
  }

  it('평범한 상자 · 단추에서는 선다 — 반대편', () => {
    expect(blockedFrom(mount(document.createElement('div')))).toBe(false)
    expect(blockedFrom(mount(document.createElement('button')))).toBe(false)
    expect(blockedFrom(document.body)).toBe(false)
  })

  it('한글 조합 중에는 안 선다', () => {
    expect(blockedFrom(mount(document.createElement('div')), { key: 'Backspace', isComposing: true })).toBe(true)
  })

  it('더 가까운 받는 쪽이 이미 막았으면 안 선다', () => {
    expect(blockedFrom(mount(document.createElement('div')), { key: 'Escape' }, true)).toBe(true)
  })

  it('입력 칸 · 편집 가능 상자에서는 안 선다', () => {
    expect(blockedFrom(mount(document.createElement('input')))).toBe(true)
    expect(blockedFrom(mount(document.createElement('textarea')))).toBe(true)
    const editable = document.createElement('div')
    editable.setAttribute('contenteditable', 'true')
    expect(blockedFrom(mount(editable))).toBe(true)
  })

  it('제 단축키를 받는 상자(메뉴 트리) 안에서는 안 선다', () => {
    const box = mount(document.createElement('div'))
    box.setAttribute('data-wb-own-shortcuts', '')
    const row = mount(document.createElement('button'), box)
    expect(blockedFrom(row)).toBe(true)
  })

  it('모달이 열려 있으면 안 선다 — 상자 밖에서 난 키도', () => {
    const outside = mount(document.createElement('div'))
    const dialog = mount(document.createElement('dialog'))
    dialog.setAttribute('open', '')
    expect(blockedFrom(mount(document.createElement('button'), dialog))).toBe(true)
    expect(blockedFrom(outside)).toBe(true)
    dialog.removeAttribute('open')
    expect(blockedFrom(outside)).toBe(false)
  })

  it('캔버스 iframe 의 요소도 같은 규칙 — 입력은 막고 몸은 둔다', () => {
    const frame = mount(document.createElement('iframe'))
    const inner = frame.contentDocument!
    const input = inner.createElement('input')
    inner.body.appendChild(input)
    expect(blockedFrom(input)).toBe(true)
    expect(blockedFrom(inner.body)).toBe(false)
  })
})
