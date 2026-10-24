// @vitest-environment jsdom
/**
 * **폼 표(`FormTable`)를 렌더러 + SDK 기본 뷰로 그린 DOM** — 열 수 표지(`cells` 조각) · 자른 몫(`ViewItem.span`) · 빈 쌍(`filler`) · 머리줄 ·
 * 옆 칸 · 이름. 칸 흐름의 셈은 `packages/theme-sdk/test/pair-rows.test.ts`, 격자가 그 줄에 놓는지(상자)는 `apps/web/build-test/form-table.test.ts`.
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { installCatalog, type PageDocument, type WbNode } from '@wirebound/schema'
import { renderDocument } from '@wirebound/renderer'
import { DEFAULT_VIEWS, type ThemeManifest, type View, type ViewItem } from '@wirebound/theme-sdk'

beforeAll(() => {
  installCatalog()
})

afterEach(() => {
  cleanup()
})

const manifest: ThemeManifest = { id: 't', name: 't', version: '0.0.0', sdk: '^1.0.0', tokens: { items: {} } }
const page = (...children: WbNode[]): PageDocument => ({ version: 1, root: { id: 'page', type: 'Page', children } })
const field = (id: string, label = id, more: Partial<WbNode> = {}): WbNode => ({
  id,
  type: 'Field',
  props: { label },
  children: [],
  ...more,
})
const table = (props: Record<string, unknown>, children: WbNode[], zones?: WbNode['zones']): WbNode => ({
  id: 't',
  type: 'FormTable',
  props,
  children,
  ...(zones === undefined ? {} : { zones }),
})

/** `cells` 조각의 직계를 차례로 — 노드면 id, 빈 쌍이면 `_`. */
function cells(container: HTMLElement): string[] {
  const host = container.querySelector('[data-wb-id="t"] > [data-wb-part="cells"]')
  if (host === null) throw new Error('cells 조각이 없다')
  return [...host.children].map((el) => el.getAttribute('data-wb-id') ?? (el.getAttribute('data-wb-part') === 'filler' ? '_' : '?'))
}

describe('폼 표 — 칸 · 빈 쌍', () => {
  it('2열 · 전폭(몫 12 → 2) · 끝 빈 쌍 — 줄 끝과 넓은 칸 앞의 구멍에 빈 쌍이 선다', () => {
    const { container } = render(
      <>{renderDocument(page(table({ columns: 2 }, [field('a'), field('b', 'b', { weight: 12 }), field('c'), field('d'), field('e')])))}</>,
    )
    expect(cells(container)).toEqual(['a', '_', 'b', 'c', 'd', 'e', '_'])
    const cellsEl = container.querySelector<HTMLElement>('[data-wb-part="cells"]')!
    expect([cellsEl.getAttribute('data-wb-columns'), cellsEl.style.getPropertyValue('--wb-node-formtable-columns')]).toEqual(['2', '2'])
    // 몫은 열 수로 잘려 실린다 — 칸을 세는 부모라 `span` 자리다.
    expect(container.querySelector<HTMLElement>('[data-wb-id="b"]')!.style.getPropertyValue('--wb-node-weight')).toBe('2')
  })

  it('열 수를 안 적으면 1 열(카탈로그 기본값) — 빈 쌍이 없고 표지는 1', () => {
    const { container } = render(<>{renderDocument(page(table({}, [field('a'), field('b', 'b', { weight: 3 })])))}</>)
    expect(cells(container)).toEqual(['a', 'b'])
    expect(container.querySelector('[data-wb-part="cells"]')!.getAttribute('data-wb-columns')).toBe('1')
    expect(container.querySelector<HTMLElement>('[data-wb-id="b"]')!.style.getPropertyValue('--wb-node-weight')).toBe('1')
  })

  it('상태로 숨은 필드의 자리는 다음 칸이 채우고 빈 쌍은 끝으로 간다', () => {
    const doc = {
      version: 4,
      viewStates: [{ id: 's_e', name: '수정' }],
      root: {
        id: 'page',
        type: 'Page',
        children: [table({ columns: 2 }, [field('a'), field('b', 'b', { visibility: { mode: 'only', states: ['s_e'] } }), field('c')])],
      },
    } as unknown as PageDocument
    const shown = render(<>{renderDocument(doc, { viewState: 's_e' })}</>)
    expect(cells(shown.container)).toEqual(['a', 'b', 'c', '_'])
    cleanup()
    const hidden = render(<>{renderDocument(doc, { viewState: null })}</>)
    expect(cells(hidden.container)).toEqual(['a', 'c'])
  })

  it('빈 쌍은 Field 와 같은 두 조각이고 보조 기술에 안 보인다 · 노드가 아니다', () => {
    const { container } = render(<>{renderDocument(page(table({ columns: 3 }, [field('a')])))}</>)
    const fillers = [...container.querySelectorAll('[data-wb-part="filler"]')]
    expect(fillers).toHaveLength(2)
    for (const filler of fillers) {
      expect(filler.getAttribute('aria-hidden')).toBe('true')
      expect(filler.hasAttribute('data-wb-id')).toBe(false)
      expect([...filler.children].map((el) => el.getAttribute('data-wb-part'))).toEqual(['label', 'value'])
    }
  })
})

describe('폼 표 — 머리줄 · 옆 칸 · 이름', () => {
  it('제목이 있으면 머리줄의 title 조각이 서고 뿌리가 그 이름의 group 이다', () => {
    const { container } = render(<>{renderDocument(page(table({ title: '계정상태 정보' }, [field('a')])))}</>)
    const root = container.querySelector('[data-wb-id="t"]')!
    const title = root.querySelector(':scope > [data-wb-part="header"] > [data-wb-part="title"]')!
    expect(title.textContent).toBe('계정상태 정보')
    expect([root.getAttribute('role'), root.getAttribute('aria-labelledby')]).toEqual(['group', title.id])
  })

  it('제목도 머리 오른쪽도 없으면 머리줄째 없고 역할도 없다', () => {
    const { container } = render(<>{renderDocument(page(table({}, [field('a')])))}</>)
    const root = container.querySelector('[data-wb-id="t"]')!
    expect(root.querySelector(':scope > [data-wb-part="header"]')).toBeNull()
    expect(root.hasAttribute('role')).toBe(false)
  })

  it('머리 오른쪽만 차도 제목 없는 머리줄이 선다 · 옆 칸은 칸 앞에 선다', () => {
    const zones = { headEnd: [{ id: 'btn', type: 'Button', props: { label: '처리이력조회' } }], aside: [{ id: 'ph', type: 'Placeholder' }] }
    const { container } = render(<>{renderDocument(page(table({}, [field('a')], zones)))}</>)
    const root = container.querySelector('[data-wb-id="t"]')!
    expect([...root.children].map((el) => el.getAttribute('data-wb-part'))).toEqual(['header', 'aside', 'cells'])
    expect(root.querySelector('[data-wb-part="header"] > [data-wb-part="title"]')).toBeNull()
    expect(root.querySelector('[data-wb-part="headEnd"][data-wb-zone="headEnd"] [data-wb-id="btn"]')).not.toBeNull()
    expect(root.querySelector('[data-wb-part="aside"][data-wb-zone="aside"] [data-wb-id="ph"]')).not.toBeNull()
  })

  it('라벨이 빈 Field 는 이름 없는 group 을 안 낸다 — 라벨 조각은 남는다', () => {
    const { container } = render(<>{renderDocument(page(table({ columns: 2 }, [field('a', ''), field('b', '이름')])))}</>)
    const blank = container.querySelector('[data-wb-id="a"]')!
    expect([blank.hasAttribute('role'), blank.hasAttribute('aria-labelledby')]).toEqual([false, false])
    expect(blank.querySelector(':scope > [data-wb-part="label"]')).not.toBeNull()
    expect(container.querySelector('[data-wb-id="b"]')!.getAttribute('role')).toBe('group')
  })
})

describe('ViewItem.span — 칸을 세는 부모에서만', () => {
  /** 그 타입을 그리는 뷰를 갈아 끼워 받은 `items` 를 적는다. */
  function itemsOf(node: WbNode): (number | undefined)[] {
    let seen: readonly ViewItem[] = []
    const Inner = DEFAULT_VIEWS[node.type]!
    const Spy: View = (props) => {
      seen = props.items
      return <Inner {...props} />
    }
    render(<>{renderDocument(page(node), { theme: { manifest, views: { [node.type]: Spy } } })}</>)
    return seen.map((item) => item.span)
  }
  const text = (id: string, weight?: number): WbNode => ({ id, type: 'Text', ...(weight === undefined ? {} : { weight }) })

  it('Grid · FormTable · 열을 정한 SearchForm — 자른 몫(없으면 1)', () => {
    expect(itemsOf({ id: 'g', type: 'Grid', props: { columns: 3 }, children: [text('a', 5), text('b')] })).toEqual([3, 1])
    expect(itemsOf({ id: 't', type: 'FormTable', props: { columns: 2 }, children: [field('a', 'a', { weight: 2 }), field('b')] })).toEqual([
      2, 1,
    ])
    expect(itemsOf({ id: 's', type: 'SearchForm', props: { columns: 2 }, children: [field('a', 'a', { weight: 4 })] })).toEqual([2])
  })

  it('그 밖의 부모(Flex · 열을 안 정한 SearchForm · Card)는 싣지 않는다', () => {
    expect(itemsOf({ id: 'f', type: 'Flex', children: [text('a', 2)] })).toEqual([undefined])
    expect(itemsOf({ id: 's', type: 'SearchForm', props: {}, children: [field('a', 'a', { weight: 2 })] })).toEqual([undefined])
    expect(itemsOf({ id: 'c', type: 'Card', children: [text('a', 2)] })).toEqual([undefined])
  })
})
