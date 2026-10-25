// @vitest-environment jsdom
/**
 * **그리드 사본의 렌더러 몫** — 되풀이 행의 사본이 상호작용을 그대로 받고(셋째 줄의 링크를 눌러도 그 규칙이 돈다), 노드 캐시가 사본 열쇠마다 따로이고,
 * 사본의 폴백도 `data-wb-copy-of` 로 선다. 사본의 속성 · 글 · 접근 이름은 `default-view-props.test.tsx` 의 그리드 절이 잰다.
 */
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { installCatalog, type PageDocument, type WbNode } from '@wirebound/schema'
import { renderDocument, type InteractionEvent } from '@wirebound/renderer'

beforeAll(() => {
  installCatalog()
})

afterEach(() => {
  cleanup()
})

const doc = (template: WbNode[], repeat = 3): PageDocument =>
  ({
    version: 5,
    root: {
      id: 'page',
      type: 'Page',
      children: [
        {
          id: 'g',
          type: 'DataGrid',
          children: [{ id: 'c', type: 'GridColumn', props: { label: '과정명' }, children: template }],
          zones: { rows: [{ id: 'r', type: 'GridRow', props: { repeat } }] },
        },
        { id: 'target', type: 'Text', props: { content: '대상' } },
      ],
    },
  }) as unknown as PageDocument

describe('그리드 사본', () => {
  it('사본도 상호작용을 받는다 — 셋째 줄의 링크를 누르면 원본 노드의 규칙이 그 노드 id 로 돈다', () => {
    const link: WbNode = {
      id: 'lk',
      type: 'Link',
      props: { label: '상세' },
      interactions: [{ on: 'click', actions: [{ type: 'setVisible', target: 'target', value: false }] }],
    }
    const events: InteractionEvent[] = []
    const { container } = render(<>{renderDocument(doc([link]), { interaction: { onEvent: (event) => events.push(event) } })}</>)
    const copies = container.querySelectorAll('[data-wb-copy-of="lk"]')
    expect(copies).toHaveLength(2)
    fireEvent.click(copies[1]!)
    expect(events.map((event) => [event.nodeId, event.trigger, event.matched])).toEqual([['lk', 'click', 1]])
    expect(events[0]!.overlay['target']).toEqual({ visible: false })
  })

  it('노드 캐시는 사본 열쇠마다 따로다 — 같은 노드 객체를 원본 · 사본으로 그려도 속성이 섞이지 않는다', () => {
    const document = doc([{ id: 't', type: 'Text', props: { content: '홍길동' } }])
    for (let round = 0; round < 2; round++) {
      const { container } = render(<>{renderDocument(document)}</>)
      expect(container.querySelectorAll('[data-wb-id="t"]')).toHaveLength(1)
      expect(container.querySelectorAll('[data-wb-copy-of="t"]')).toHaveLength(2)
      cleanup()
    }
  })

  it('열 머리를 고치면 캐시된 행의 제 칸도 새 이름을 받는다 — 열 편집은 행 객체를 안 바꾼다', () => {
    const row: WbNode = { id: 'r', type: 'GridRow', children: [{ id: 'k', type: 'GridCell', children: [{ id: 'ki', type: 'Input' }] }] }
    const page = (label: string): PageDocument =>
      ({
        version: 5,
        root: {
          id: 'page',
          type: 'Page',
          children: [{ id: 'g', type: 'DataGrid', children: [{ id: 'c', type: 'GridColumn', props: { label } }], zones: { rows: [row] } }],
        },
      }) as unknown as PageDocument
    const name = (document: PageDocument) => {
      const { container } = render(<>{renderDocument(document)}</>)
      const value = container.querySelector('[data-wb-id="ki"]')!.getAttribute('aria-label')
      cleanup()
      return value
    }
    expect(name(page('이름'))).toBe('이름')
    expect(name(page('성명'))).toBe('성명')
  })

  it('사본의 폴백도 data-wb-copy-of 로 선다 — 틀린 셀 틀 노드가 data-wb-id 를 겹쳐 싣지 않는다', () => {
    const { container } = render(<>{renderDocument(doc([{ id: 'bad', type: 'Text', props: { content: 3 } } as unknown as WbNode]))}</>)
    expect(container.querySelectorAll('[data-wb-id="bad"][data-wb-error]')).toHaveLength(1)
    expect(container.querySelectorAll('[data-wb-copy-of="bad"][data-wb-error]')).toHaveLength(2)
  })
})
