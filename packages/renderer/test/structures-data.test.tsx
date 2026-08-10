/**
 * **데이터 그룹의 구조 구현체** — `List`·`Tree`·`KeyValue` (P4b-2 ② W2).
 *
 * **새 파일인 이유:** 워커 넷이 동시에 돈다. 기존 `structures.test.tsx`에 절을 더하면
 * 넷이 같은 파일에 줄을 더해 병합에서 부딪힌다 — 준비 웨이브가 소스에서 가른 것과 같은
 * 이유로 케이스도 가른다.
 *
 * **여기가 재지 않는 것:** 계약 밖 `data-*`·`style`의 일반 선언·선언되지 않은 part 이름은
 * `structures.test.tsx`의 **전수 가드 셋**이 등록된 모든 구조에 대해 이미 잰다. 그러니
 * 여기서는 **이 여섯 구조가 무엇을 그리는가**만 못박는다.
 */
import { installCatalog, requireComponent } from '@wirebound/schema'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { renderNode } from '../src/render'
import { structureBaseCss } from '../src/structure-css'
import { nodeVar } from '../src/structure-css-tools'
import { installStructures } from '../src/structures/index'
import { probe } from './css-probe'

beforeAll(() => {
  installCatalog()
  installStructures()
})

/** 노드 하나를 **그 구조로** 그린다. 테마가 구조를 고르는 경로(`options.structures`)와 같다. */
function render(type: string, structure: string, props: Record<string, unknown> = {}): string {
  return renderToStaticMarkup(
    renderNode({ id: 'n_000000000001', type, props }, { structures: { [type]: structure } }),
  )
}

/** 렌더된 HTML에 나온 조각 이름 전부(순서대로, 중복 포함). */
function parts(html: string): string[] {
  return [...html.matchAll(/data-wb-part="([^"]*)"/g)].map((match) => match[1]!)
}

function countOf(html: string, part: string): number {
  return parts(html).filter((name) => name === part).length
}

/**
 * 이 구조가 쓰는 조각 이름이 **카탈로그에 선언돼 있는가.** 없으면 전수 가드가 죽는다.
 *
 * 조각을 하나도 못 찾으면 `['조각 0개']`를 돌려준다 — 빈 배열을 돌려주면 폴백이 그려진
 * 자리에서도 통과해 아무것도 지키지 않는다.
 */
function undeclared(type: string, html: string): string[] {
  const found = [...new Set(parts(html))]
  if (found.length === 0) return ['조각 0개']
  const declared = new Set(requireComponent(type).parts)
  return found.filter((name) => !declared.has(name))
}

describe('List:cardGrid', () => {
  it('items 수만큼 item 조각을 내고 각 카드가 media·title·meta를 갖는다', () => {
    const html = render('List', 'cardGrid', { items: 3 })
    expect(html).toContain('data-wb-structure="cardGrid"')
    expect(countOf(html, 'item')).toBe(3)
    expect(countOf(html, 'media')).toBe(3)
    expect(countOf(html, 'title')).toBe(3)
    expect(countOf(html, 'meta')).toBe(3)
  })

  it('items가 0이면 카드가 하나도 없다 — 수 prop의 렌더 갈래', () => {
    const html = render('List', 'cardGrid', { items: 0 })
    expect(countOf(html, 'item')).toBe(0)
    expect(html).toContain('data-wb-component="List"')
  })

  it('pagination이 켜졌을 때만 pagination 조각이 나온다 — 조건부 조각', () => {
    expect(countOf(render('List', 'cardGrid', { pagination: true }), 'pagination')).toBe(1)
    expect(countOf(render('List', 'cardGrid', { pagination: false }), 'pagination')).toBe(0)
  })

  it('table의 조각(header·row·cell)을 쓰지 않는다 — 두 구조가 실제로 다르다', () => {
    const cardGrid = new Set(parts(render('List', 'cardGrid')))
    // 조각이 하나도 없으면 아래 셋이 전부 거저 통과한다(폴백이 그려져도 그렇다).
    expect(cardGrid.size).toBeGreaterThan(0)
    expect(cardGrid.has('header')).toBe(false)
    expect(cardGrid.has('row')).toBe(false)
    expect(cardGrid.has('cell')).toBe(false)

    // 대조군 — 같은 노드를 table로 그리면 그 셋이 나온다. 없으면 위 셋이 "아무것도
    // 안 그린다"로도 설명된다.
    const table = new Set(parts(render('List', 'table')))
    expect([...table].sort()).toContain('cell')
  })

  it('쓰는 조각 이름이 전부 카탈로그에 선언돼 있다', () => {
    expect(undeclared('List', render('List', 'cardGrid'))).toEqual([])
  })

  /**
   * **재라 — `List:cardGrid`의 열 수를 무엇이 정하는가.**
   *
   * 답: **테마다.** 노드에는 열 수를 담을 prop이 없다 — `List.columns`는
   * `visibleWhen:{structure:'table'}`인 **컬럼 이름 목록**(`string[]`)이라 카드 그리드에서는
   * 패널에 보이지도 않고 뜻도 다르다(P4a-3이 실측한 것). 그래서 구조 기본 CSS는
   * **grid를 세우고 최소한의 트랙만** 주고, 실제 열 수는 테마의 `gridColumns` 어휘가 정한다
   * (P4b-1이 그 어휘를 §6.8 밖으로 열면서 근거에 이 자리를 적어 두었다).
   *
   * **아래 두 케이스가 그 답의 실행 가능한 형태다.**
   */
  it('기본 CSS가 grid를 세운다 — 열 수는 기본값 2다', async () => {
    const dom = await probe([structureBaseCss()], render('List', 'cardGrid', { items: 2 }))
    const list = '[data-wb-component="List"]'
    expect(dom.computed(list, 'display')).toBe('grid')
    expect(dom.computed(list, 'grid-template-columns')).toBe('repeat(2, 1fr)')
  })

  it('테마의 gridColumns가 그 열 수를 덮는다 — !important 없이', async () => {
    // `compileTheme`의 `pushComponent`가 내는 셀렉터 모양이다(특이도가 같아야 순서가
    // 우선순위가 된다). `gridColumns: 4`가 이 문자열로 펼쳐진다.
    const themeRule =
      '[data-wb-component="List"][data-wb-structure="cardGrid"]' +
      ' { grid-template-columns: repeat(4, 1fr); }'
    const html = render('List', 'cardGrid', { items: 2 })

    // 덮을 것이 실제로 있는지 먼저 못박는다 — 없으면 아래가 거저 통과한다.
    const baseOnly = await probe([structureBaseCss()], html)
    expect(baseOnly.computed('[data-wb-component="List"]', 'grid-template-columns')).toBe(
      'repeat(2, 1fr)',
    )

    const both = await probe([structureBaseCss(), themeRule], html)
    expect(both.computed('[data-wb-component="List"]', 'grid-template-columns')).toBe(
      'repeat(4, 1fr)',
    )
  })

  it('노드는 열 수를 나르지 않는다 — 손잡이를 새로 만들지 않았다', async () => {
    // **이것이 "테마가 정한다"의 음성 대조다.** 노드 변수를 만들어 두고 아무도 값을 안
    // 실으면 `Media.kind`와 같은 "조용히 죽은 손잡이"가 하나 더 생긴다.
    const html = render('List', 'cardGrid', { items: 2, columns: ['가', '나', '다'] })
    expect(html).not.toContain(nodeVar('list', 'columns'))

    const dom = await probe([structureBaseCss()], html)
    // 트랙에 `var()`가 끼어 있지 않다 — 읽을 노드 변수가 없다는 것의 다른 표현이다.
    expect(dom.computed('[data-wb-component="List"]', 'grid-template-columns')).not.toContain('var(')
  })
})
