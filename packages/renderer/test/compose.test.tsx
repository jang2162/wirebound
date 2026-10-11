import { installCatalog, type LayoutDocument, type PageDocument } from '@wirebound/schema'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { Root, view } from '@wirebound/theme-sdk'
import { renderComposed } from '../src/compose'
import { NO_THEME } from '../src/no-theme'

beforeAll(() => {
  installCatalog()
})

const layout: LayoutDocument = {
  version: 1,
  root: {
    id: 'n_lay000000001',
    type: 'Page',
    children: [
      {
        id: 'n_lay000000002',
        type: 'Text',
        props: { content: '헤더 영역', role: 'h1' },
      },
      {
        id: 'n_lay000000003',
        type: 'Flex',
        props: { direction: 'row' },
        children: [
          {
            id: 'n_lay000000004',
            type: 'Tree',
            props: { items: ['회원관리', '권한관리'] },
          },
          { id: 'n_lay000000005', type: 'Slot' },
        ],
      },
    ],
  },
}

const page: PageDocument = {
  version: 1,
  root: {
    id: 'n_pag000000001',
    type: 'Page',
    children: [{ id: 'n_pag000000002', type: 'Text', props: { content: '회원 목록 본문' } }],
  },
}

describe('renderComposed', () => {
  it('레이아웃 껍데기를 그린다', () => {
    const html = renderToStaticMarkup(renderComposed(layout, page))
    expect(html).toContain('헤더 영역')
    expect(html).toContain('회원관리')
  })

  it('페이지를 Slot 자리에 주입한다', () => {
    const html = renderToStaticMarkup(renderComposed(layout, page))
    const slotIndex = html.indexOf('data-wb-id="n_lay000000005"')
    const pageIndex = html.indexOf('회원 목록 본문')
    expect(slotIndex).toBeGreaterThan(-1)
    expect(pageIndex).toBeGreaterThan(slotIndex)
  })

  it('페이지 루트 노드가 결과에 포함된다', () => {
    const html = renderToStaticMarkup(renderComposed(layout, page))
    expect(html).toContain('data-wb-id="n_pag000000001"')
  })

  it('테마를 레이아웃과 페이지 양쪽에 적용한다', () => {
    const Text = view(({ props }) => (
      <Root as="p" className="marked">
        {String(props.content)}
      </Root>
    ))
    const theme = { manifest: NO_THEME.manifest, views: { Text } }
    const html = renderToStaticMarkup(renderComposed(layout, page, { theme }))
    // 레이아웃의 `Text` 하나 · 페이지의 `Text` 하나.
    expect([...html.matchAll(/class="marked"/g)].length).toBe(2)
  })

  it('Slot이 없는 레이아웃이면 페이지가 나타나지 않는다', () => {
    const noSlot: LayoutDocument = {
      version: 1,
      root: { id: 'n_lay000000009', type: 'Page', children: [] },
    }
    const html = renderToStaticMarkup(renderComposed(noSlot, page))
    expect(html).not.toContain('회원 목록 본문')
  })
})
