/**
 * `edit/use-clipboard.ts` — `copy` · `cut` · `paste` 이벤트 리스너.
 *
 * **jsdom 에는 `ClipboardEvent` 의 `clipboardData` 가 없다** — 이벤트에 가짜 `DataTransfer`(`setData` · `getData`)를 실어 올린다. 셸에 붙은
 * 판(편집 · 선택 · 통지)은 `./editor-keys.test.tsx`, 실제 OS 클립보드는 `build-test/clipboard.test.ts` 가 잰다.
 */
import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useClipboard } from '../../src/edit/use-clipboard'

const mounted: Element[] = []
afterEach(() => {
  for (const element of mounted.splice(0)) element.remove()
  window.getSelection()?.removeAllRanges()
})

function mount<E extends Element>(element: E): E {
  document.body.appendChild(element)
  mounted.push(element)
  return element
}

/** 클립보드 이벤트를 올리고 실린 글자 · `preventDefault` 를 돌려준다. `data: null` 이면 `clipboardData` 가 없는 판. */
function clip(type: 'copy' | 'cut' | 'paste', target: EventTarget, text?: string, data: 'fake' | null = 'fake') {
  const store = new Map<string, string>()
  if (text !== undefined) store.set('text/plain', text)
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clipboardData', {
    value:
      data === null
        ? null
        : { setData: (kind: string, value: string) => store.set(kind, value), getData: (kind: string) => store.get(kind) ?? '' },
  })
  target.dispatchEvent(event)
  return { written: store.get('text/plain'), prevented: event.defaultPrevented }
}

function setup(
  options: { editable?: boolean; canvas?: Document | null; copy?: string | null; cut?: string | null; handles?: boolean } = {},
) {
  const log: string[] = []
  const hook = renderHook(
    (props: { editable: boolean }) =>
      useClipboard({
        canvasDocument: options.canvas ?? null,
        editable: props.editable,
        copy: () => {
          log.push('copy')
          return options.copy === undefined ? 'ENVELOPE' : options.copy
        },
        cut: () => {
          log.push('cut')
          return options.cut === undefined ? 'ENVELOPE' : options.cut
        },
        paste: (text) => {
          log.push(`paste:${text}`)
          return options.handles ?? true
        },
      }),
    { initialProps: { editable: options.editable ?? true } },
  )
  return { log, hook }
}

describe('useClipboard', () => {
  it('복사는 봉투를 text/plain 에 싣고 막는다', () => {
    const { log } = setup()
    expect(clip('copy', document.body)).toEqual({ written: 'ENVELOPE', prevented: true })
    expect(log).toEqual(['copy'])
  })

  it('실을 노드가 없으면(고른 것 없음 · 루트) 브라우저의 복사가 그대로다', () => {
    setup({ copy: null })
    expect(clip('copy', document.body)).toEqual({ written: undefined, prevented: false })
  })

  it('입력 칸의 복사 · 잘라내기 · 붙여넣기는 그 칸의 것이다', () => {
    const { log } = setup()
    const input = mount(document.createElement('input'))
    expect(clip('copy', input).prevented).toBe(false)
    expect(clip('cut', input).prevented).toBe(false)
    expect(clip('paste', input, 'ENVELOPE').prevented).toBe(false)
    expect(log).toEqual([])
  })

  it('긁어 고른 글자가 있으면 그 글자의 복사다 — 봉투로 바꾸지 않는다', () => {
    const { log } = setup()
    const text = mount(document.createElement('p'))
    text.textContent = '코멘트 본문'
    window.getSelection()!.selectAllChildren(text)
    expect(clip('copy', text).prevented).toBe(false)
    expect(clip('cut', text).prevented).toBe(false)
    expect(log).toEqual([])
  })

  it('모달 · 메뉴 트리 상자 안에서는 서지 않는다', () => {
    const { log } = setup()
    const dialog = mount(document.createElement('dialog'))
    dialog.setAttribute('open', '')
    expect(clip('copy', dialog).prevented).toBe(false)
    dialog.removeAttribute('open')
    const box = mount(document.createElement('div'))
    box.setAttribute('data-wb-own-shortcuts', '')
    expect(clip('paste', box, 'ENVELOPE').prevented).toBe(false)
    expect(log).toEqual([])
  })

  it('잘라내기는 cut 이 낸 봉투를 싣는다 — cut 이 null 이면(못 지움) 아무것도 안 싣는다', () => {
    const { log, hook } = setup()
    expect(clip('cut', document.body)).toEqual({ written: 'ENVELOPE', prevented: true })
    expect(log).toEqual(['cut'])
    hook.unmount()

    const refused = setup({ cut: null })
    expect(clip('cut', document.body)).toEqual({ written: undefined, prevented: false })
    expect(refused.log).toEqual(['cut'])
  })

  it('clipboardData 가 없으면 잘라내기가 지우지 않는다 — 싣지 못한 채 지우면 노드를 잃는다', () => {
    const { log } = setup()
    expect(clip('cut', document.body, undefined, null).prevented).toBe(false)
    expect(log).toEqual([])
  })

  it('붙여넣기는 글자를 넘기고, 봉투였을 때만 막는다', () => {
    const handled = setup()
    expect(clip('paste', document.body, 'ENVELOPE').prevented).toBe(true)
    expect(handled.log).toEqual(['paste:ENVELOPE'])
    handled.hook.unmount()

    const other = setup({ handles: false })
    expect(clip('paste', document.body, '그냥 글').prevented).toBe(false)
    expect(other.log).toEqual(['paste:그냥 글'])
    other.hook.unmount()

    const empty = setup()
    expect(clip('paste', document.body, '').prevented).toBe(false)
    expect(empty.log).toEqual([])
  })

  it('편집할 수 없으면 잘라내기 · 붙여넣기는 안 서고 복사는 선다', () => {
    const { log } = setup({ editable: false })
    expect(clip('cut', document.body).prevented).toBe(false)
    expect(clip('paste', document.body, 'ENVELOPE').prevented).toBe(false)
    expect(clip('copy', document.body).prevented).toBe(true)
    expect(log).toEqual(['copy'])
  })

  it('캔버스 문서의 이벤트도 받는다', () => {
    const frame = mount(document.createElement('iframe'))
    const canvas = frame.contentDocument!
    const { log } = setup({ canvas })
    expect(clip('copy', canvas.body).prevented).toBe(true)
    expect(clip('paste', canvas.body, 'ENVELOPE').prevented).toBe(true)
    expect(log).toEqual(['copy', 'paste:ENVELOPE'])
  })
})
