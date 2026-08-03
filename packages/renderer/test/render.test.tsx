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

  it('알 수 없는 타입이면 던진다', () => {
    expect(() => renderNode({ id: 'n_000000000001', type: 'Nope' })).toThrow(
      '알 수 없는 컴포넌트 타입: Nope',
    )
  })

  it('구현이 없는 구조를 지정하면 던진다', () => {
    expect(() =>
      renderNode({ id: 'n_000000000001', type: 'List' }, { structures: { List: 'mediaList' } }),
    ).toThrow('구현되지 않은 구조: List:mediaList')
  })

  it('카탈로그에 없는 구조를 지정하면 던진다', () => {
    expect(() =>
      renderNode({ id: 'n_000000000001', type: 'List' }, { structures: { List: 'bogus' } }),
    ).toThrow('List에 없는 구조입니다: bogus')
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
})
