/**
 * **노드 엘리먼트 재사용**(`src/render.tsx` 의 `renderNodeIn` · `nodeCacheFor`) — 같은 노드 객체 · 같은 테마 · 같은 화면 상태면 같은 엘리먼트를 돌려줘 React 가 그 서브트리를
 * 다시 그리지 않는다. 편집은 지나는 길의 노드만 새 객체로 만든다는 불변 문서의 성질에 기댄다.
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 같은 노드 둘째 렌더 | 같은 엘리먼트가 아니다(재사용이 안 선다) |
 * | 한 자식만 새 객체 | 건드리지 않은 형제의 엘리먼트가 바뀐다 · 고친 자식과 그 부모가 옛 것이다(낡은 그림) |
 * | 테마 · 화면 상태 | 다른 테마 · 다른 상태가 같은 엘리먼트를 돌려받는다 |
 * | 상호작용 런타임 · slot | 켠 렌더가 엘리먼트를 재사용한다(핸들러가 낡은 `root` 를 닫는다) |
 * | 오류 서브트리 | 오류가 난 서브트리를 기억해 `onNodeError` 를 다시 못 받는다 · 설치 전에 그린 폴백이 설치 뒤에도 남는다 |
 */
import { installCatalog, type PageDocument, type WbNode } from '@wirebound/schema'
import { NO_THEME, renderDocument, renderNode } from '../src/index'
import type { ThemeDefinition } from '@wirebound/theme-sdk'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { beforeAll, describe, expect, it } from 'vitest'
import type { NodeRenderError } from '../src/render'

beforeAll(() => {
  installCatalog()
})

const text = (id: string, content: string): WbNode => ({ id, type: 'Text', props: { content } })
const page = (...children: WbNode[]): PageDocument =>
  ({ version: 1, root: { id: 'n_root', type: 'Page', children } }) as unknown as PageDocument

/** 뿌리 엘리먼트가 든 자식 엘리먼트들 — `renderNodeIn` 이 각 자식을 `<Fragment key>` 로 감싸므로 한 겹 벗긴다. */
function childElements(root: ReactElement): ReactElement[] {
  const viewProps = (root.props as { viewProps: { children: ReactNode } }).viewProps
  const children = viewProps.children
  if (!Array.isArray(children)) throw new Error('자식 배열이 아니다')
  return children.map((fragment) => {
    const inner = (fragment as ReactElement<{ children: ReactNode }>).props.children
    if (!isValidElement(inner)) throw new Error('자식 엘리먼트가 아니다')
    return inner
  })
}

describe('같은 노드 객체는 같은 엘리먼트다', () => {
  it('같은 문서를 두 번 그리면 뿌리 엘리먼트가 같다', () => {
    const doc = page(text('n_a', '가'), text('n_b', '나'))
    expect(renderDocument(doc)).toBe(renderDocument(doc))
  })

  it('한 자식만 새 객체로 바뀌면 형제의 엘리먼트는 그대로고 그 자식과 부모는 새것이다', () => {
    const a = text('n_a', '가')
    const b = text('n_b', '나')
    const before = renderDocument(page(a, b))
    const b2 = text('n_b', '나 고침')
    const after = renderDocument(page(a, b2))

    const [beforeA, beforeB] = childElements(before)
    const [afterA, afterB] = childElements(after)
    expect({ siblingReused: afterA === beforeA, editedIsNew: afterB !== beforeB, parentIsNew: after !== before }).toEqual({
      siblingReused: true,
      editedIsNew: true,
      parentIsNew: true,
    })
  })

  it('렌더 결과 마크업이 재사용 여부와 무관하게 같다', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server')
    const a = text('n_a', '가')
    const first = renderToStaticMarkup(renderDocument(page(a, text('n_b', '나'))))
    const second = renderToStaticMarkup(renderDocument(page(a, text('n_b', '나 고침'))))
    expect(first).toContain('나')
    expect(second).toContain('나 고침')
    expect(second).not.toContain('>나</')
  })
})

describe('테마 · 화면 상태가 다르면 다른 엘리먼트다', () => {
  it('다른 테마 객체는 같은 노드도 새로 그린다', () => {
    const node = text('n_a', '가')
    const otherTheme: ThemeDefinition = { ...NO_THEME }
    expect(renderNode(node, { theme: otherTheme })).not.toBe(renderNode(node, { theme: NO_THEME }))
    expect(renderNode(node, { theme: otherTheme })).toBe(renderNode(node, { theme: otherTheme }))
  })

  it('화면 상태의 조상 줄이 다르면 다른 엘리먼트다 — 목록 밖 상태는 기본과 같은 열쇠', () => {
    const node = text('n_a', '가')
    const viewStates = [
      { id: 'state-a', name: '가' },
      { id: 'state-b', name: '나' },
    ]
    expect(renderNode(node, { viewState: 'state-a', viewStates })).not.toBe(renderNode(node, { viewState: 'state-b', viewStates }))
    expect(renderNode(node, { viewState: 'state-a', viewStates })).toBe(
      renderNode(node, { viewState: 'state-a', viewStates: [...viewStates] }),
    )
    expect(renderNode(node, { viewState: 'state-gone', viewStates })).toBe(renderNode(node, { viewStates }))
  })

  it('목록에서 부모를 바꾸면 같은 상태 id 도 다른 엘리먼트다 — 물려받기가 바뀐다', () => {
    const node = text('n_a', '가')
    const flat = [
      { id: 'state-a', name: '가' },
      { id: 'state-b', name: '나' },
    ]
    const nested = [flat[0]!, { ...flat[1]!, parent: 'state-a' }]
    expect(renderNode(node, { viewState: 'state-b', viewStates: flat })).not.toBe(
      renderNode(node, { viewState: 'state-b', viewStates: nested }),
    )
  })
})

describe('캐시가 안 서는 렌더', () => {
  it('상호작용 런타임을 켠 렌더는 매번 새로 그린다 — 핸들러가 `root` 를 닫는다', () => {
    const node = text('n_a', '가')
    const options = { interaction: { overlay: {} } }
    expect(renderNode(node, options)).not.toBe(renderNode(node, options))
  })

  it('오류가 난 서브트리는 기억하지 않는다 — `onNodeError` 를 렌더마다 받는다', () => {
    const broken: WbNode = { id: 'n_x', type: 'NoSuchThing' }
    const root: WbNode = { id: 'n_root', type: 'Page', children: [text('n_a', '가'), broken] }
    const seen: NodeRenderError[] = []
    const first = renderNode(root, { onNodeError: (error) => seen.push(error) })
    const second = renderNode(root, { onNodeError: (error) => seen.push(error) })
    expect({ errors: seen.map((error) => error.nodeId), reused: first === second }).toEqual({ errors: ['n_x', 'n_x'], reused: false })
    // 오류 없는 형제는 그 사이 재사용된다.
    expect(childElements(first)[0]).toBe(childElements(second)[0])
  })
})
