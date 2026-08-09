/**
 * 캔버스에 CSS를 주입하는 훅.
 *
 * **D5 — `<style>` 둘이고 순서가 고정이다.** 구조 기본 CSS가 먼저, 테마 CSS가 나중.
 * 같은 특이도에서 나중에 온 것이 이기므로 **그 순서가 곧 "테마가 이긴다"**이고,
 * 그 캐스케이드 자체는 `packages/renderer/test/structure-css.test.ts`가 쟀다.
 * 여기서 보는 것은 **주입이 그 순서를 실제로 만드는가**다.
 */
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import { structureBaseCss } from '@wirebound/renderer'
import { STRUCTURE_STYLE_ID, THEME_STYLE_ID, useThemeCss } from '../../src/theme/use-theme-css'
import type { ThemeSource } from '../../src/theme/theme-source'

function Harness(props: { source?: ThemeSource }): ReactElement {
  useThemeCss(props.source)
  return <div data-testid="canvas" />
}

function styleTags(): HTMLStyleElement[] {
  return [...document.head.querySelectorAll<HTMLStyleElement>('style[data-wb-style]')]
}

function tag(id: string): HTMLStyleElement | null {
  return document.head.querySelector<HTMLStyleElement>(`style[data-wb-style="${id}"]`)
}

describe('useThemeCss', () => {
  it('구조 기본 CSS와 테마 CSS가 순서대로 head에 실린다', () => {
    render(<Harness />)

    const tags = styleTags()
    expect(tags.map((element) => element.dataset.wbStyle)).toEqual([
      STRUCTURE_STYLE_ID,
      THEME_STYLE_ID,
    ])
    expect(tags[0]!.textContent).toBe(structureBaseCss())
    expect(tags[1]!.textContent).toContain(':root {')
    expect(tags[1]!.textContent).toContain('--wb-semantic-primary')
  })

  it('두 번 그려도 style 태그가 늘지 않는다', () => {
    const view = render(<Harness />)
    view.rerender(<Harness />)
    view.rerender(<Harness />)
    expect(styleTags()).toHaveLength(2)
  })

  it('언마운트하면 걷어낸다', () => {
    // 남겨 두면 다음 화면이 옛 테마 위에서 그려진다.
    const view = render(<Harness />)
    expect(styleTags()).toHaveLength(2)
    view.unmount()
    expect(styleTags()).toHaveLength(0)
  })

  /**
   * **이 프로젝트가 반복해 겪은 "빈 화면" 부류.** `resolveTheme`이 `null`을 내면 테마 CSS를
   * 넣지 않고 구조 기본 CSS만 남긴다 — 던지지 않는다. 테마가 깨진 것과 화면이 사라지는
   * 것은 다른 일이다.
   */
  it('테마 해석이 실패해도 화면이 사라지지 않는다', () => {
    const broken: ThemeSource = () => ({
      meta: { id: 'broken', name: '깨진', version: '1' },
      tokens: { semantic: { primary: 'palette.없는색' } },
    })

    expect(() => render(<Harness source={broken} />)).not.toThrow()
    expect(document.querySelector('[data-testid="canvas"]')).not.toBeNull()

    // 구조 기본 CSS는 남는다 — 그것이 없으면 문서가 통째로 무너진다.
    expect(tag(STRUCTURE_STYLE_ID)?.textContent).toBe(structureBaseCss())
    // 테마 CSS는 비어 있다. 태그 자체는 자리를 지킨다(순서가 계약이므로).
    expect(tag(THEME_STYLE_ID)?.textContent).toBe('')
  })

  it('테마가 없어도 구조 기본 CSS는 실린다', () => {
    render(<Harness source={() => null} />)
    expect(tag(STRUCTURE_STYLE_ID)?.textContent).toBe(structureBaseCss())
    expect(tag(THEME_STYLE_ID)?.textContent).toBe('')
  })

  /**
   * **D6 — 주입 자리는 `document.head`다.** 계획서가 근거로 적은 *"CSS는 삽입 위치로
   * 범위를 갖지 않는다"*를 여기서 잰다: 캔버스 **안쪽**에 넣은 시트가 캔버스 **바깥**
   * 요소에도 그대로 적용되는지.
   */
  it('캔버스 안에 넣어도 범위가 좁아지지 않는다 — head에 두는 근거', () => {
    const inside = document.createElement('div')
    const outside = document.createElement('div')
    outside.setAttribute('data-wb-component', 'Flex')
    outside.setAttribute('data-wb-structure', 'default')
    document.body.append(inside, outside)

    const style = document.createElement('style')
    style.textContent = '[data-wb-component="Flex"][data-wb-structure="default"] { display: grid; }'
    inside.append(style)

    // 시트는 `inside` 안에 있는데 `outside`가 그 규칙을 받는다.
    expect(getComputedStyle(outside).display).toBe('grid')

    inside.remove()
    outside.remove()
  })
})
