// @vitest-environment jsdom
/**
 * **한 DOM 이벤트가 버블링으로 규칙 여럿을 지날 때 — 바깥 규칙이 안쪽 규칙의 쓰기 위에서 돈다.**
 *
 * 노드마다 핸들러가 붙으므로(`handlersFor`) 안쪽 노드를 누르면 안쪽 · 바깥 핸들러가 **같은 이벤트 안에서** 차례로 돈다. 호스트는
 * `onEvent` 로 받은 겹layer를 상태에 싣고 다시 그리는데(캔버스 미리보기 · 내보낸 번들의 런타임), 다시 그리기 전이라 바깥 핸들러가
 * 렌더 때 받은 겹layer에서 출발하면 안쪽이 쓴 것을 모른 채 제 결과를 내고 — 호스트가 그것을 마지막으로 실어 **안쪽의 쓰기가 사라진다.**
 *
 * `interaction-runtime.test.tsx` 는 DOM 없이 핸들러를 하나씩 부르므로 이 판(같은 이벤트의 두 핸들러)을 못 선다 — 여기는 jsdom 에
 * 실제로 그려 누른다.
 */
import { installCatalog, type PageDocument, type WbNode } from '@wirebound/schema'
import { act, useState, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { EMPTY_OVERLAY, type InteractionOverlay } from '../src/interaction/runtime'
import { renderDocument, type InteractionEvent } from '../src/render'

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

const DOC: PageDocument = {
  version: 1,
  root: {
    id: 'n_root',
    type: 'Page',
    children: [
      {
        id: 'n_outer',
        type: 'Card',
        props: { title: '겉' },
        interactions: [{ on: 'click', actions: [{ type: 'setProp', target: 'n_outer', prop: 'subtitle', value: '겉눌림' }] }],
        children: [
          {
            id: 'n_inner',
            type: 'Button',
            props: { label: '속' },
            interactions: [{ on: 'click', actions: [{ type: 'setProp', target: 'n_inner', prop: 'label', value: '속눌림' }] }],
          },
        ],
      },
    ],
  } as WbNode,
}

/** 캔버스 미리보기와 같은 호스트 — 받은 겹layer를 상태에 싣고 다시 그린다(`apps/web/src/canvas/canvas.tsx` 의 `onEvent`). */
function Host(props: { events: InteractionEvent[] }): ReactElement {
  const [overlay, setOverlay] = useState<InteractionOverlay>(EMPTY_OVERLAY)
  return renderDocument(DOC, {
    interaction: {
      overlay,
      onEvent: (event) => {
        props.events.push(event)
        setOverlay(event.overlay)
      },
    },
  })
}

function mount(events: InteractionEvent[]): HTMLElement {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => root.render(<Host events={events} />))
  unmount = () => act(() => root.unmount())
  return container
}

describe('버블링으로 규칙 여럿을 지난다', () => {
  it('안쪽을 누르면 안쪽 · 바깥 규칙이 다 남는다', () => {
    const events: InteractionEvent[] = []
    const container = mount(events)
    act(() => {
      container.querySelector('[data-wb-id="n_inner"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    // 카나리아 — 두 핸들러가 한 이벤트 안에서 돌았다(안쪽이 먼저).
    expect(events.map((event) => event.nodeId)).toEqual(['n_inner', 'n_outer'])
    expect(container.querySelector('[data-wb-id="n_inner"]')?.textContent).toBe('속눌림')
    expect(container.querySelector('[data-wb-id="n_outer"]')?.textContent).toContain('겉눌림')
  })

  it('다음 누름은 앞 이벤트가 남긴 것 위에서 시작한다 — 한 이벤트의 이음은 그 이벤트 안에서만', () => {
    const events: InteractionEvent[] = []
    const container = mount(events)
    const press = (id: string): void =>
      act(() => {
        container.querySelector(`[data-wb-id="${id}"]`)!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
    press('n_inner')
    press('n_outer')
    expect(events.map((event) => event.nodeId)).toEqual(['n_inner', 'n_outer', 'n_outer'])
    // 셋째 이벤트(바깥만)의 겹layer에 첫 이벤트의 안쪽 쓰기가 남아 있다 — 상태에서 출발했다.
    expect(events[2]!.overlay).toEqual({ n_inner: { label: '속눌림' }, n_outer: { subtitle: '겉눌림' } })
    expect(container.querySelector('[data-wb-id="n_inner"]')?.textContent).toBe('속눌림')
  })
})
