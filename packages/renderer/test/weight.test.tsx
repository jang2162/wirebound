// @vitest-environment jsdom
/**
 * **렌더러가 부모를 보고 자식의 몫을 정하는가**(`src/render.tsx` 의 `weightRoom`). `Flex` 안이면 노드의 몫 그대로, `Grid` 안이면 부모 열 수로
 * 자른 칸 수, 그 밖이면 싣지 않는다. 실은 값이 화면에서 무엇을 하는지는 실브라우저 판 `apps/web/build-test/layout-weight.test.ts` 가 잰다.
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { installCatalog, type PageDocument, type WbNode } from '@wirebound/schema'
import { renderDocument } from '@wirebound/renderer'

beforeAll(() => {
  installCatalog()
})

afterEach(() => {
  cleanup()
})

const page = (...children: WbNode[]): PageDocument => ({ version: 1, root: { id: 'page', type: 'Page', children } })

/** 그린 문서에서 노드 뿌리의 `--wb-node-weight`. 없으면 빈 글. */
function weights(doc: PageDocument, ...ids: string[]): string[] {
  const { container } = render(<>{renderDocument(doc)}</>)
  return ids.map((id) => {
    const el = container.querySelector<HTMLElement>(`[data-wb-id="${id}"]`)
    if (el === null) throw new Error(`${id} 가 안 그려졌다`)
    return el.style.getPropertyValue('--wb-node-weight')
  })
}

const text = (id: string, weight?: number): WbNode => ({ id, type: 'Text', ...(weight === undefined ? {} : { weight }) })

describe('부모가 정하는 몫', () => {
  it('Flex 안 — 노드의 몫 그대로(12 도)', () => {
    expect(weights(page({ id: 'f', type: 'Flex', children: [text('a', 1), text('b', 12), text('c')] }), 'a', 'b', 'c')).toEqual([
      '1',
      '12',
      '',
    ])
  })

  it('Grid 안 — 열 수로 자른다(3열에 5 → 3, 2 → 2)', () => {
    const grid: WbNode = { id: 'g', type: 'Grid', props: { columns: 3 }, children: [text('a', 5), text('b', 2)] }
    expect(weights(page(grid), 'a', 'b')).toEqual(['3', '2'])
  })

  it('Grid 의 열 수를 안 적었으면 카탈로그 기본값(2)으로 자른다', () => {
    expect(weights(page({ id: 'g', type: 'Grid', children: [text('a', 5)] }), 'a')).toEqual(['2'])
  })

  it('Grid 안의 Grid — 바깥 열 수로 자르고, 안쪽 자식은 안쪽 열 수로 자른다', () => {
    const inner: WbNode = { id: 'in', type: 'Grid', weight: 3, props: { columns: 2 }, children: [text('x', 4)] }
    const outer: WbNode = { id: 'out', type: 'Grid', props: { columns: 4 }, children: [inner] }
    expect(weights(page(outer), 'in', 'x')).toEqual(['3', '2'])
  })

  it('그 밖의 부모(Card · Section · 열을 안 정한 SearchForm · 뿌리) 안에서는 싣지 않는다', () => {
    const doc = page(
      text('top', 3),
      { id: 'card', type: 'Card', children: [text('a', 2)] },
      { id: 'sec', type: 'Section', children: [text('b', 2)] },
      { id: 'sf', type: 'SearchForm', children: [{ id: 'fd', type: 'Field', weight: 2 }] },
    )
    expect(weights(doc, 'top', 'a', 'b', 'fd')).toEqual(['', '', '', ''])
  })

  it('열을 정한 SearchForm 안 — 열 수로 자른다(3열에 5 → 3)', () => {
    const form: WbNode = {
      id: 'sf',
      type: 'SearchForm',
      props: { columns: 3 },
      children: [
        { id: 'a', type: 'Field', weight: 5 },
        { id: 'b', type: 'Field', weight: 2 },
      ],
    }
    expect(weights(page(form), 'a', 'b')).toEqual(['3', '2'])
  })

  it('열을 정한 SearchForm 의 fields 조각에 «정했다» 속성과 열 수 변수가 선다 · 안 정했으면 둘 다 없다', () => {
    const { container } = render(
      <>
        {renderDocument(
          page({ id: 'on', type: 'SearchForm', props: { columns: 3 }, children: [] }, { id: 'off', type: 'SearchForm', children: [] }),
        )}
      </>,
    )
    const fields = (id: string) => container.querySelector<HTMLElement>(`[data-wb-id="${id}"] > [data-wb-part="fields"]`)!
    expect([fields('on').getAttribute('data-wb-columns'), fields('on').style.getPropertyValue('--wb-node-searchform-columns')]).toEqual([
      '3',
      '3',
    ])
    expect([fields('off').hasAttribute('data-wb-columns'), fields('off').hasAttribute('style')]).toEqual([false, false])
  })

  it('몫을 준 Card 안의 Flex 자식은 Card 의 몫이 아니라 제 몫을 싣는다', () => {
    const card: WbNode = { id: 'card', type: 'Card', weight: 2, children: [{ id: 'f', type: 'Flex', children: [text('a'), text('b', 1)] }] }
    expect(weights(page({ id: 'row', type: 'Flex', children: [card] }), 'card', 'a', 'b')).toEqual(['2', '', '1'])
  })

  it('상태 영역 · 가지는 요소를 안 남기므로 가지 안 노드의 부모는 영역의 부모다', () => {
    const area: WbNode = {
      id: 'sw',
      type: 'StateSwitch',
      children: [{ id: 'cs', type: 'StateCase', props: { state: 'default' }, children: [text('a', 4)] }],
    }
    expect(weights(page({ id: 'g', type: 'Grid', props: { columns: 3 }, children: [area] }), 'a')).toEqual(['3'])
  })

  it('모양이 틀린 몫(낙관적 패치가 지난 문서)은 싣지 않는다', () => {
    const odd = (id: string, weight: unknown) => ({ id, type: 'Text', weight }) as unknown as WbNode
    const doc = page({ id: 'f', type: 'Flex', children: [odd('a', 0), odd('b', 13), odd('c', 1.5), odd('d', '2')] })
    expect(weights(doc, 'a', 'b', 'c', 'd')).toEqual(['', '', '', ''])
  })
})

describe('노드 캐시', () => {
  it('부모 Grid 의 열 수만 바뀌어도(자식은 같은 객체) 자식의 몫이 다시 잘린다', () => {
    const child = text('a', 4)
    const before = page({ id: 'g', type: 'Grid', props: { columns: 4 }, children: [child] })
    expect(weights(before, 'a')).toEqual(['4'])
    cleanup()
    const after = page({ id: 'g', type: 'Grid', props: { columns: 2 }, children: [child] })
    expect(weights(after, 'a')).toEqual(['2'])
  })

  it('같은 자식을 Flex 에서 Grid 로 옮기면 자른 값이 선다', () => {
    const child = text('a', 7)
    expect(weights(page({ id: 'f', type: 'Flex', children: [child] }), 'a')).toEqual(['7'])
    cleanup()
    expect(weights(page({ id: 'g', type: 'Grid', props: { columns: 3 }, children: [child] }), 'a')).toEqual(['3'])
  })
})
