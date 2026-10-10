// @vitest-environment jsdom
/**
 * **재사용한 엘리먼트를 React 가 다시 그리지 않는다**(`src/render.tsx` 의 `nodeCacheFor` — 배치 미리보기 비용 L-009). 뷰가 렌더 수를 세는 테마로 노드 200 인 문서를 그린 뒤
 * 한 자식만 새 객체로 바꾼 문서를 다시 그려 **그린 뷰의 수**를 센다 — 시간이 아니라 일의 양이라 기계가 붐벼도 흔들리지 않는다.
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { installCatalog, type PageDocument, type WbNode } from '@wirebound/schema'
import { Root, view, type ThemeDefinition, type ThemeManifest } from '@wirebound/theme-sdk'
import { renderDocument } from '@wirebound/renderer'

beforeAll(() => {
  installCatalog()
})
afterEach(cleanup)

const manifest: ThemeManifest = { id: 't', name: 't', version: '0.0.0', sdk: '^1.0.0', tokens: { items: {} } }

function countingTheme(): { theme: ThemeDefinition; drawn: Map<string, number> } {
  const drawn = new Map<string, number>()
  const Text = view(({ nodeId, props }) => {
    drawn.set(nodeId, (drawn.get(nodeId) ?? 0) + 1)
    return <Root as="p">{String(props.content)}</Root>
  })
  return { theme: { manifest, views: { Text } }, drawn }
}

const texts = (count: number): WbNode[] => Array.from({ length: count }, (_, i) => ({ id: `n_${i}`, type: 'Text', props: { content: `글 ${i}` } }))
const page = (children: WbNode[]): PageDocument => ({ version: 1, root: { id: 'n_root', type: 'Page', children } }) as unknown as PageDocument

describe('다시 그릴 때 건드리지 않은 서브트리는 뷰를 다시 부르지 않는다', () => {
  it('노드 200 에서 한 자식만 새 객체면 그 자식만 다시 그린다', () => {
    const { theme, drawn } = countingTheme()
    const children = texts(200)
    const first = render(<>{renderDocument(page(children), { theme })}</>)
    const afterFirst = new Map(drawn)

    const edited = [...children]
    edited[100] = { id: 'n_100', type: 'Text', props: { content: '글 100 고침' } }
    first.rerender(<>{renderDocument(page(edited), { theme })}</>)

    const redrawn = [...drawn].filter(([id, count]) => count !== (afterFirst.get(id) ?? 0)).map(([id]) => id)
    expect({ firstDrawn: afterFirst.size, redrawn, text: first.container.querySelector('[data-wb-id="n_100"]')?.textContent }).toEqual({
      firstDrawn: 200,
      redrawn: ['n_100'],
      text: '글 100 고침',
    })
  })

  it('미리보기처럼 자식 하나가 끼어도 나머지는 그대로다', () => {
    const { theme, drawn } = countingTheme()
    const children = texts(200)
    const view = render(<>{renderDocument(page(children), { theme })}</>)
    drawn.clear()

    const inserted: WbNode = { id: 'wb:preview:0', type: 'Text', props: { content: '미리보기' } }
    view.rerender(<>{renderDocument(page([...children.slice(0, 50), inserted, ...children.slice(50)]), { theme })}</>)

    expect([...drawn.keys()]).toEqual(['wb:preview:0'])
  })
})
