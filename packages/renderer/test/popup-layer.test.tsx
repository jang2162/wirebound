// @vitest-environment jsdom
/**
 * **덮개 층**(`src/popup-layer.tsx`) — 쌓기 · 닫기(✖ · Escape · 규칙) · 포커스 · 겹 상한 · 팝업마다의 겹layer. jsdom 이라 좌표 · 누름이 덮개에
 * 막히는지는 못 잰다 — 그것은 실브라우저 판(`apps/web/build-test/popup-layer.test.ts`)이 잰다.
 */
import { installCatalog, type PageDocument, type WbNode } from '@wirebound/schema'
import { act, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { isPopupClose, POPUP_DEPTH_MAX, PopupLayer, popupOpener, usePopupStack, type PopupStack } from '../src/popup-layer'
import type { InteractionEvent } from '../src/render'

beforeAll(() => {
  installCatalog()
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

let unmount: (() => void) | null = null
afterEach(() => {
  unmount?.()
  unmount = null
  document.body.innerHTML = ''
})

function popupDoc(id: string, title: string, body: WbNode[], footer: WbNode[] = []): PageDocument {
  return { version: 5, root: { id, type: 'Popup', props: { title }, children: body, zones: { footer } } }
}

const CLOSE: WbNode = {
  id: 'n_cancel',
  type: 'Button',
  props: { label: '취소' },
  interactions: [{ on: 'click', actions: [{ type: 'closeModal' }] }],
}

/** 부른 쪽 흉내 — 요청 가운데 닫기는 `pop`, 열기는 표의 문서를 `push`. 받은 이벤트를 쌓는다. */
function mount(docs: Record<string, PageDocument>): { stack: () => PopupStack; events: InteractionEvent[]; opener: HTMLButtonElement } {
  const opener = document.createElement('button')
  opener.textContent = '열기'
  document.body.appendChild(opener)
  const host = document.createElement('div')
  document.body.appendChild(host)
  const events: InteractionEvent[] = []
  let current: PopupStack | null = null
  function Harness(): ReactElement {
    const stack = usePopupStack()
    current = stack
    return (
      <PopupLayer
        stack={stack}
        onEvent={(event) => {
          events.push(event)
          for (const request of event.requests) {
            if (request.type === 'closeModal') stack.pop()
            else if (request.type === 'openModal') {
              const doc = docs[request.target]
              if (doc !== undefined) stack.push({ document: doc, opener: popupOpener(document, request.sourceNodeId) })
            }
          }
        }}
      />
    )
  }
  const root = createRoot(host)
  act(() => root.render(<Harness />))
  unmount = () => act(() => root.unmount())
  return { stack: () => current!, events, opener }
}

const levels = (): Element[] => Array.from(document.querySelectorAll('[data-wb-popup-level]'))
const key = (target: Element, init: KeyboardEventInit): void => {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }))
  })
}

describe('PopupLayer — 쌓기 · 닫기', () => {
  it('쌓은 팝업을 덮개 위 상자로 그리고 상자 뿌리에 aria-modal 을 단다 · 포커스가 상자 안 첫 요소(✖)로 간다', () => {
    const view = mount({})
    act(() => {
      view.opener.focus()
      view.stack().push({ document: popupDoc('n_pop', '사용자 검색', [{ id: 'n_t', type: 'Text' }], [CLOSE]), opener: view.opener })
    })
    expect(levels()).toHaveLength(1)
    const box = document.querySelector('[data-wb-popup-frame] > [data-wb-component="Popup"]')!
    expect(box.getAttribute('aria-modal')).toBe('true')
    expect(box.getAttribute('role')).toBe('dialog')
    expect(document.activeElement?.getAttribute('data-wb-part')).toBe('close')
  })

  it('✖ 를 누르면 맨 위를 닫고 연 요소로 포커스를 돌려준다', () => {
    const view = mount({})
    act(() => {
      view.stack().push({ document: popupDoc('n_pop', '가', []), opener: view.opener })
    })
    const close = document.querySelector<HTMLElement>('[data-wb-part="close"]')!
    expect(isPopupClose(close)).toBe(true)
    act(() => close.click())
    expect(levels()).toHaveLength(0)
    expect(document.activeElement).toBe(view.opener)
  })

  it('Escape 는 맨 위 하나만 닫는다 — 한글 조합 중의 Escape 는 닫지 않는다', () => {
    const view = mount({})
    act(() => {
      view.stack().push({ document: popupDoc('n_a', '가', []), opener: view.opener })
      view.stack().push({ document: popupDoc('n_b', '나', []), opener: null })
    })
    expect(levels()).toHaveLength(2)
    const inside = document.activeElement!
    key(inside, { key: 'Escape', isComposing: true })
    expect(levels()).toHaveLength(2)
    key(inside, { key: 'Escape' })
    expect(levels()).toHaveLength(1)
    expect(document.querySelector('[data-wb-popup-frame] [data-wb-part="title"]')?.textContent).toBe('가')
  })

  it('조합 구간(compositionstart ~ end)의 Escape 도 닫지 않는다 — isComposing 이 없는 판', () => {
    const view = mount({})
    act(() => {
      view.stack().push({ document: popupDoc('n_a', '가', []), opener: view.opener })
    })
    const inside = document.activeElement!
    act(() => {
      inside.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    })
    key(inside, { key: 'Escape' })
    expect(levels()).toHaveLength(1)
    act(() => {
      inside.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))
    })
    key(inside, { key: 'Escape' })
    expect(levels()).toHaveLength(0)
  })

  it('«팝업 닫기» 규칙이 맨 위를 닫는다 — 요청은 부른 쪽에 간다', () => {
    const view = mount({})
    act(() => {
      view.stack().push({ document: popupDoc('n_pop', '가', [], [CLOSE]), opener: view.opener })
    })
    act(() => document.querySelector<HTMLElement>('[data-wb-id="n_cancel"]')!.click())
    expect(view.events.map((event) => event.requests.map((request) => request.type))).toEqual([['closeModal']])
    expect(levels()).toHaveLength(0)
    expect(document.activeElement).toBe(view.opener)
  })

  it('겹은 다섯까지 — 여섯째는 쌓지 않는다 · 아래 겹은 inert', () => {
    const view = mount({})
    const results: boolean[] = []
    act(() => {
      for (let i = 0; i < POPUP_DEPTH_MAX + 1; i += 1)
        results.push(view.stack().push({ document: popupDoc(`n_${i}`, `${i}`, []), opener: null }))
    })
    expect(results).toEqual([true, true, true, true, true, false])
    expect(levels().map((level) => level.hasAttribute('inert'))).toEqual([true, true, true, true, false])
  })

  it('팝업 안에서 연 팝업을 닫으면 그것을 연 팝업 안의 단추로 포커스가 돌아온다', () => {
    const inner = popupDoc('n_inner', '안', [])
    const view = mount({ 'page:안': inner })
    const openInner: WbNode = {
      id: 'n_open',
      type: 'Button',
      props: { label: '더 열기' },
      interactions: [{ on: 'click', actions: [{ type: 'openModal', target: 'page:안' }] }],
    }
    act(() => {
      view.stack().push({ document: popupDoc('n_outer', '밖', [openInner]), opener: view.opener })
    })
    const button = document.querySelector<HTMLElement>('[data-wb-id="n_open"]')!
    act(() => {
      button.focus()
      button.click()
    })
    expect(levels()).toHaveLength(2)
    key(document.activeElement!, { key: 'Escape' })
    expect(levels()).toHaveLength(1)
    expect(document.activeElement).toBe(button)
  })

  it('모두 걷기(clear)는 포커스를 돌려주지 않는다', () => {
    const view = mount({})
    act(() => {
      view.stack().push({ document: popupDoc('n_a', '가', []), opener: view.opener })
    })
    act(() => view.stack().clear())
    expect(levels()).toHaveLength(0)
    expect(document.activeElement).not.toBe(view.opener)
  })

  it('Tab 은 맨 위 상자 안을 돈다', () => {
    const view = mount({})
    act(() => {
      view.stack().push({
        document: popupDoc(
          'n_a',
          '가',
          [{ id: 'n_b1', type: 'Button', props: { label: '하나' } }],
          [{ id: 'n_b2', type: 'Button', props: { label: '둘' } }],
        ),
        opener: view.opener,
      })
    })
    const last = document.querySelector<HTMLElement>('[data-wb-id="n_b2"]')!
    act(() => last.focus())
    key(last, { key: 'Tab' })
    expect(document.activeElement?.getAttribute('data-wb-part')).toBe('close')
    key(document.activeElement!, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
  })

  it('팝업마다 제 겹layer — 닫았다 다시 열면 처음 판이다', () => {
    const hide: WbNode = {
      id: 'n_hide',
      type: 'Button',
      props: { label: '숨기기' },
      interactions: [{ on: 'click', actions: [{ type: 'setVisible', target: 'n_t', value: false }] }],
    }
    const doc = popupDoc('n_a', '가', [hide, { id: 'n_t', type: 'Text', props: { content: '글' } }])
    const view = mount({})
    act(() => {
      view.stack().push({ document: doc, opener: null })
    })
    act(() => document.querySelector<HTMLElement>('[data-wb-id="n_hide"]')!.click())
    expect(document.querySelector('[data-wb-id="n_t"]')).toBeNull()
    act(() => {
      view.stack().pop()
    })
    act(() => {
      view.stack().push({ document: doc, opener: null })
    })
    expect(document.querySelector('[data-wb-id="n_t"]')).not.toBeNull()
  })

  it('덮개 누름은 막는다 — 포커스가 상자 밖으로 안 나가고 닫지도 않는다', () => {
    const view = mount({})
    act(() => {
      view.stack().push({ document: popupDoc('n_a', '가', []), opener: null })
    })
    const backdrop = document.querySelector('[data-wb-popup-backdrop]')!
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    act(() => {
      backdrop.dispatchEvent(down)
      ;(backdrop as HTMLElement).click()
    })
    expect(down.defaultPrevented).toBe(true)
    expect(levels()).toHaveLength(1)
  })
})
