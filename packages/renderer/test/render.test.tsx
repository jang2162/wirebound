import { installCatalog, type PageDocument } from '@wirebound/schema'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { renderDocument, renderNode, resolveStructure } from '../src/render'
import { registerStructure, resetStructures } from '../src/structures/registry'

beforeAll(() => {
  installCatalog()
  resetStructures()

  registerStructure('Page', 'default', ({ attrs, children }) => (
    <div {...attrs}>{children}</div>
  ))
  registerStructure('Text', 'default', ({ attrs, props }) => (
    <p {...attrs}>{String(props.content)}</p>
  ))
  registerStructure('List', 'table', ({ attrs, part }) => (
    <table {...attrs}>
      <thead {...part('header')} />
    </table>
  ))
  registerStructure('List', 'cardGrid', ({ attrs, part }) => (
    <div {...attrs}>
      <div {...part('item')} />
    </div>
  ))
  registerStructure('Slot', 'default', ({ attrs, slot }) => <div {...attrs}>{slot}</div>)
})

function markup(element: React.ReactElement): string {
  return renderToStaticMarkup(element)
}

describe('renderNode', () => {
  it('기본 구조로 그린다', () => {
    const html = markup(renderNode({ id: 'n_000000000001', type: 'Text', props: { content: '안녕' } }))
    expect(html).toContain('data-wb-component="Text"')
    expect(html).toContain('data-wb-structure="default"')
    expect(html).toContain('안녕')
  })

  it('props 기본값을 채워 넘긴다', () => {
    const html = markup(renderNode({ id: 'n_000000000001', type: 'Text' }))
    expect(html).toContain('텍스트')
  })

  it('노드 id를 속성으로 낸다', () => {
    const html = markup(renderNode({ id: 'n_000000000042', type: 'Text' }))
    expect(html).toContain('data-wb-id="n_000000000042"')
  })

  it('자식을 재귀로 그린다', () => {
    const html = markup(
      renderNode({
        id: 'n_000000000001',
        type: 'Page',
        children: [
          { id: 'n_000000000002', type: 'Text', props: { content: '첫째' } },
          { id: 'n_000000000003', type: 'Text', props: { content: '둘째' } },
        ],
      }),
    )
    expect(html).toContain('첫째')
    expect(html).toContain('둘째')
  })

  it('options.structures로 구조를 바꾼다', () => {
    const node = { id: 'n_000000000001', type: 'List' }
    expect(markup(renderNode(node))).toContain('<table')
    expect(markup(renderNode(node, { structures: { List: 'cardGrid' } }))).toContain(
      'data-wb-structure="cardGrid"',
    )
  })

  it('조각에 data-wb-part를 붙인다', () => {
    const html = markup(renderNode({ id: 'n_000000000001', type: 'List' }))
    expect(html).toContain('data-wb-part="header"')
  })

  // 아래 셋은 예전에 "던진다"를 검사했다. renderNode는 이제 폴백으로 흡수한다(P0 이월 6번).
  // 폴백 자체의 계약은 fallback.test.tsx가 본다. 여기서는 renderNode가 그 경로로
  // 빠지는지만 확인한다. `requireComponent`·`requireStructure`·`resolveStructure`가
  // 여전히 던지는 것은 각각의 테스트가 그대로 지킨다.
  it('알 수 없는 타입이면 폴백을 그린다', () => {
    const html = markup(renderNode({ id: 'n_000000000001', type: 'Nope' }))
    expect(html).toContain('data-wb-error="알 수 없는 컴포넌트 타입: Nope"')
  })

  it('구현이 없는 구조를 지정하면 폴백을 그린다', () => {
    const html = markup(
      renderNode({ id: 'n_000000000001', type: 'List' }, { structures: { List: 'mediaList' } }),
    )
    expect(html).toContain('data-wb-error="구현되지 않은 구조: List:mediaList"')
  })

  it('카탈로그에 없는 구조를 지정하면 폴백을 그린다', () => {
    const html = markup(
      renderNode({ id: 'n_000000000001', type: 'List' }, { structures: { List: 'bogus' } }),
    )
    expect(html).toContain('data-wb-error="List에 없는 구조입니다: bogus"')
  })
})

describe('renderDocument', () => {
  it('문서 루트를 그린다', () => {
    const doc: PageDocument = {
      version: 1,
      root: {
        id: 'n_000000000001',
        type: 'Page',
        children: [{ id: 'n_000000000002', type: 'Text', props: { content: '본문' } }],
      },
    }
    expect(markup(renderDocument(doc))).toContain('본문')
  })
})

describe('resolveStructure', () => {
  it('지정이 없으면 첫 번째 구조를 쓴다', () => {
    expect(resolveStructure('List', {})).toBe('table')
  })

  it('지정이 있으면 그것을 쓴다', () => {
    expect(resolveStructure('List', { structures: { List: 'stackedList' } })).toBe('stackedList')
  })

  // renderNode에서 옮겨 왔다. renderNode는 폴백으로 흡수하지만 이 함수 자체는
  // 여전히 던지고, 그 보증을 지키는 곳이 여기 말고는 없다.
  it('카탈로그에 없는 구조를 지정하면 던진다', () => {
    expect(() => resolveStructure('List', { structures: { List: 'bogus' } })).toThrow(
      'List에 없는 구조입니다: bogus',
    )
  })

  it('알 수 없는 타입이면 던진다', () => {
    expect(() => resolveStructure('Nope', {})).toThrow('알 수 없는 컴포넌트 타입: Nope')
  })
})
