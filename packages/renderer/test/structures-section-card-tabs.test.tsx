/**
 * **구조 그룹(`structures/structure.tsx`)이 P4b-2 ②에서 더한 구조 아홉.**
 *
 * `Section` fullBleed·splitBg · `Card` bordered·elevated·mediaTop·horizontal ·
 * `Tabs` pill·enclosed·vertical.
 *
 * **왜 새 파일인가.** `structures.test.tsx`는 그룹 넷이 함께 쓰는 전수 가드가 있는 자리다.
 * 병렬 워커 넷이 동시에 거기에 절을 더하면 병합에서 부딪힌다 — 준비 웨이브가 등록과 CSS를
 * 그룹별로 가른 것과 같은 이유로 케이스도 그룹별 파일에 둔다.
 *
 * **이 파일이 재는 것은 셋이다.**
 *
 * 1. **조각이 나오는가** — 구조가 약속한 `data-wb-part`가 실제로 나오는가.
 * 2. **계약 밖 속성이 없는가** — §6.11의 여섯 말고는 아무것도 나가지 않는다.
 * 3. **DOM이 정말 다른가** — 재라 #7이 물은 것. 같은 것은 *같다고* 못박는다.
 *
 * 3번이 이 파일의 핵심이다. `Card:bordered`처럼 **`plain`과 DOM이 같은** 구조가 있고,
 * 그것은 숨길 것이 아니라 **재서 적어 둘 것**이다(아래 각 절의 머리말). 못박아 두면
 * 나중에 누가 DOM을 갈랐을 때 이 케이스가 깨지고, 그때 *"이것이 구조인가 스킨인가"*를
 * 다시 읽게 된다.
 */
import { installCatalog, requireComponent } from '@wirebound/schema'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { renderNode } from '../src/render'
import { structureCssBlocks } from '../src/structures/structure'
import { installStructures } from '../src/structures/index'
import { probe } from './css-probe'

beforeAll(() => {
  installCatalog()
  installStructures()
})

/** 렌더러가 테마에 노출하기로 한 속성 계약 전부. 설계 §6.11 */
const CONTRACT_ATTRS = [
  'data-wb-id',
  'data-wb-component',
  'data-wb-structure',
  'data-wb-variant',
  'data-wb-part',
  'data-wb-state',
]

function render(
  type: string,
  structure: string,
  props: Record<string, unknown> = {},
  children: unknown[] = [],
): string {
  return renderToStaticMarkup(
    renderNode(
      { id: 'n_000000000001', type, props, children } as never,
      { structures: { [type]: structure } },
    ),
  )
}

function parts(html: string): string[] {
  return [...html.matchAll(/data-wb-part="([^"]*)"/g)].map((match) => match[1]!)
}

/** 렌더된 HTML에서 태그 이름을 순서대로 뽑는다. DOM 모양을 비교할 때 쓴다. */
function tags(html: string): string[] {
  return [...html.matchAll(/<([a-zA-Z][\w-]*)/g)].map((match) => match[1]!)
}

/**
 * **구조를 하나 그릴 때마다 세 가지를 함께 잰다.** 개별 절이 조각 이름을 재고, 이것이
 * 나머지 둘(계약 밖 속성 없음 · 폴백이 아님)을 잰다.
 *
 * 전수 가드(`structures.test.tsx`)가 이미 같은 것을 보지만 **그쪽은 실패했을 때 어느
 * 구조인지만 말한다.** 여기서 구조별로 부르면 그 구조의 절이 통째로 빨개져서 무엇을
 * 고쳐야 하는지가 바로 보인다.
 */
function expectContractOnly(html: string): void {
  expect(html).not.toContain('data-wb-error')
  const attrs = [...html.matchAll(/\s(data-[\w-]+)=/gi)].map((match) => match[1]!)
  expect(attrs.length).toBeGreaterThan(0)
  expect([...new Set(attrs.filter((attr) => !CONTRACT_ATTRS.includes(attr)))]).toEqual([])
  // 구조가 `style`에 일반 선언을 내지 않는다(P0 이월 #7). 이 그룹은 커스텀 프로퍼티조차
  // 싣지 않으므로 `style` 속성 자체가 없어야 한다.
  expect([...html.matchAll(/\sstyle="([^"]*)"/g)].map((match) => match[1]!)).toEqual([])
}

/** 이 그룹이 내는 조각 이름은 전부 카탈로그에 선언돼 있어야 한다(작성 계약 2). */
function expectDeclaredParts(type: string, html: string): void {
  const declared = new Set(requireComponent(type).parts)
  expect([...new Set(parts(html).filter((part) => !declared.has(part)))]).toEqual([])
}

describe('Section:fullBleed — 안쪽 래퍼가 없다', () => {
  /**
   * **DOM이 `contained`와 다르다 — 조각 하나가 통째로 없다.**
   *
   * `contained`가 `div[part=inner]`로 자식을 감싸는 것은 **테마가 그 자리에 `maxWidth`를
   * 걸어 폭을 가두기 위해서**다(§6.4의 `container.max`가 그 값이다). `fullBleed`는 폭을
   * 가두지 않는 섹션이므로 **가둘 자리 자체가 없어야 한다** — 래퍼를 남긴 채
   * `max-width: none`을 거는 것은 테마가 매번 되돌려야 하는 기본값을 만드는 것이고,
   * 그러면 *"어느 테마에서 무엇이 이겼는가"*가 다시 조용해진다.
   *
   * 그래서 이것은 스킨이 아니라 **구조**다. 자식이 `<section>`의 직계가 된다.
   */
  it('inner 조각을 내지 않는다 — contained와 갈리는 지점', () => {
    const html = render('Section', 'fullBleed')
    expect(parts(html)).toEqual([])
    expect(html).toContain('data-wb-structure="fullBleed"')
  })

  it('자식이 section의 직계다', () => {
    const html = render('Section', 'fullBleed', {}, [
      { id: 'n_000000000002', type: 'Divider', props: {} },
    ])
    // 래퍼가 없으므로 `<section>` 바로 다음 태그가 자식이다.
    expect(tags(html)).toEqual(['section', 'hr'])
  })

  it('contained는 여전히 inner를 낸다 — 음성 대조', () => {
    // 이것이 없으면 위 둘이 "Section이 아무 조각도 안 낸다"로도 설명된다.
    expect(parts(render('Section', 'contained'))).toEqual(['inner'])
  })

  it('계약 밖 속성이 없고 조각 이름이 전부 선언돼 있다', () => {
    const html = render('Section', 'fullBleed', { compact: true })
    expectContractOnly(html)
    expectDeclaredParts('Section', html)
  })
})

describe('Section:splitBg — 배경이 갈린 자리가 조각으로 있다', () => {
  /**
   * **DOM이 다르다 — `contained`에 없는 조각(`band`)이 하나 더 있다.**
   *
   * *"배경이 갈렸다"*를 테마가 그리려면 **갈린 쪽을 겨냥할 셀렉터가 있어야 한다.**
   * 오늘 테마가 스타일할 수 있는 것은 컴포넌트 루트와 `parts`뿐이고(§5.1), 의사 요소는
   * 어휘에 없다. 즉 조각 없이는 *"섹션의 절반만 다른 배경"*을 **표현할 방법이 아예 없다** —
   * CSS 차이가 아니라 **없던 표현이 생기는 것**이므로 구조가 맞다.
   *
   * `band`는 비어 있는 상자다. 무엇을 그릴지는 테마가 정한다(§6.8의 `bg`·`bgImage`·
   * `bgGradient`가 이미 있는 어휘다) — 구현체는 색을 정하지 않는다.
   */
  it('band와 inner를 그 순서로 낸다', () => {
    const html = render('Section', 'splitBg')
    expect(parts(html)).toEqual(['band', 'inner'])
  })

  it('자식은 inner 안에 들어간다 — band는 비어 있다', () => {
    const html = render('Section', 'splitBg', {}, [
      { id: 'n_000000000002', type: 'Divider', props: {} },
    ])
    // `band`가 먼저 닫히고 그 뒤 `inner` 안에 `<hr>`이 온다.
    expect(html).toMatch(/data-wb-part="band"[^>]*><\/div><div data-wb-part="inner"><hr/)
  })

  it('band는 카탈로그에 선언된 조각이다', () => {
    // 선언되지 않은 이름을 내면 `structures.test.tsx`의 part 계약이 죽는다(작성 계약 2).
    expect(requireComponent('Section').parts).toContain('band')
  })

  it('계약 밖 속성이 없고 조각 이름이 전부 선언돼 있다', () => {
    const html = render('Section', 'splitBg', { compact: true })
    expectContractOnly(html)
    expectDeclaredParts('Section', html)
  })

  /**
   * **구조가 서기 위한 선언 — 두 조각이 나란히 서야 "갈렸다"가 된다.**
   *
   * 규칙을 **루트에만** 둔다. `band`·`inner`에 규칙을 달면 `partRule`이 구조 이름을 넣지
   * 않으므로(특이도 때문이다 — `structure-css-tools.ts`) `contained`의 `inner`까지 받아
   * **오늘 화면이 바뀐다**(D5). 루트 규칙은 `componentRule`이 구조 이름을 넣으므로
   * `splitBg`에만 닿는다.
   *
   * **어휘를 골라 썼다.** `display`·`gridColumns` 둘 다 `STYLE_PROPERTIES`에 있으므로
   * **테마가 이 두 줄을 그대로 덮을 수 있다.** `flex-grow` 같은 것으로 갈랐으면 테마에
   * 대응 어휘가 없어 되돌릴 길이 없는 선언이 됐다 — 그것은 구조가 아니라 강요다.
   */
  it('두 조각을 나란히 세운다 — 루트에만 규칙을 둔다', async () => {
    const dom = await probe(
      [structureCssBlocks().join('\n')],
      '<section data-wb-component="Section" data-wb-structure="splitBg">' +
        '<div data-wb-part="band"></div><div data-wb-part="inner"></div></section>',
    )
    expect(dom.computed('[data-wb-structure="splitBg"]', 'display')).toBe('grid')
    expect(dom.computed('[data-wb-structure="splitBg"]', 'grid-template-columns')).toBe('1fr 1fr')
  })

  it('그 규칙이 contained에는 닿지 않는다 — 음성 대조', async () => {
    const dom = await probe(
      [structureCssBlocks().join('\n')],
      '<section data-wb-component="Section" data-wb-structure="contained">' +
        '<div data-wb-part="inner"></div></section>',
    )
    // `''`가 아니라 `'block'`이다 — jsdom이 `<section>`에 UA 기본값을 준다. 처음에 `''`로
    // 적었다가 여기서 갈렸고, **대상이 아니라 장치가 틀린 쪽**이었다.
    expect(dom.computed('[data-wb-structure="contained"]', 'display')).toBe('block')
  })
})
