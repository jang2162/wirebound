import { installCatalog, type PageDocument } from '@wirebound/schema'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { renderDocument, renderNode } from '../src/render'

beforeAll(() => {
  installCatalog()
})

function markup(element: React.ReactElement): string {
  return renderToStaticMarkup(element)
}

describe('renderNode', () => {
  it('기본 뷰로 그린다', () => {
    const html = markup(renderNode({ id: 'n_000000000001', type: 'Text', props: { content: '안녕' } }))
    expect(html).toContain('data-wb-component="Text"')
    expect(html).toContain('안녕')
  })

  it('theme 을 안 주면 기본 뷰로 그린다 — 버튼은 button 태그다', () => {
    const html = markup(renderNode({ id: 'b', type: 'Button', props: { label: 'x' } }))
    expect(html).toMatch(/^<button [^>]*data-wb-id="b"/)
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

  // renderNode는 던지지 않고 폴백으로 흡수한다. 폴백 자체의 계약은 fallback.test.tsx가
  // 본다. 여기서는 renderNode가 그 경로로 빠지는지만 확인한다.
  it('알 수 없는 타입이면 폴백을 그린다', () => {
    const html = markup(renderNode({ id: 'n_000000000001', type: 'Nope' }))
    expect(html).toContain('data-wb-error="알 수 없는 컴포넌트 타입: Nope"')
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

describe('공개 API', () => {
  it('구조 경로의 이름이 공개 API 에 없다', async () => {
    const api = await import('@wirebound/renderer')
    for (const name of [
      'registerStructure',
      'getStructure',
      'requireStructure',
      'listStructureKeys',
      'resetStructures',
      'installStructures',
      'structureBaseCss',
      'resolveStructure',
      'resolveStructureOf',
      'partAttrs',
      'nodeAttrs',
      'nodeVar',
      'TREE_INDENT_VAR',
      'NODE_VAR_PREFIX',
    ]) {
      expect(name in api, name).toBe(false)
    }
  })
})
