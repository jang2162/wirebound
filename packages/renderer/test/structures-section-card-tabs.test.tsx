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

/**
 * **`plain`과 DOM이 같은 구조를 여기서 못박는다 — 이것이 재라 #7의 답이다.**
 *
 * `bordered`는 테두리, `elevated`는 그림자다. 둘 다 **§6.8이 이미 가진 어휘**로
 * 표현된다(`borderColor`·`borderWidth`·`borderStyle`·`shadow`). 즉 `plain`과 갈리는 것이
 * **스킨뿐이고 DOM은 한 글자도 다르지 않다.**
 *
 * **그래도 구현한다** — 설계 §6.5가 구조 옵션으로 열거했고, 구조 이름이 곧
 * `data-wb-structure` 셀렉터라 **테마가 세 장의 스킨을 갈라 쓸 채널**이 된다. 다른 데서
 * 얻을 수 없는 것은 그 채널 하나이고, 그것이 이 구조들의 전부다.
 *
 * **P4b-3이 알아야 할 것이 이 사실이다.** 테마를 만들 때 이 셋을 `parts` 차이로 다루면
 * 안 된다 — 조각도 태그도 같으므로 `base`의 스킨만 갈라야 한다.
 *
 * 아래 케이스가 *"같다"*를 실행 가능한 형태로 고정한다. 누가 DOM을 갈라 놓으면 여기가
 * 깨지고, 그때 이 판정을 다시 읽게 된다.
 */
function expectSameDomAsPlain(structure: string, props: Record<string, unknown>): void {
  const mine = render('Card', structure, props, [{ id: 'n_000000000002', type: 'Divider', props: {} }])
  const plain = render('Card', 'plain', props, [{ id: 'n_000000000002', type: 'Divider', props: {} }])

  // 구조 이름 하나만 다르다. 그 자리를 맞춰 놓으면 나머지가 글자까지 같아야 한다.
  expect(mine.replace(`data-wb-structure="${structure}"`, 'data-wb-structure="plain"')).toBe(plain)
  // 위 치환이 실제로 일어났는지 — 안 일어나도 두 문자열이 같으면 초록이 된다.
  expect(mine).toContain(`data-wb-structure="${structure}"`)
}

describe('Card:bordered — plain과 DOM이 같다 (재라 #7)', () => {
  it('plain과 글자까지 같다 — 구조 이름만 다르다', () => {
    expectSameDomAsPlain('bordered', { title: '제목', subtitle: '부제' })
  })

  it('부제가 없는 갈래에서도 같다', () => {
    expectSameDomAsPlain('bordered', { title: '제목', subtitle: '' })
  })

  it('구조 기본 CSS가 테두리를 정하지 않는다', () => {
    // **테두리는 스킨이다** — 구현체 안에서 색·여백을 정하지 말라는 작성 계약이 여기 걸린다.
    // 기본 CSS에 테두리를 넣으면 테마가 그것을 되돌려야 하고, 그러면 `bordered`가
    // *"테마가 고르는 스킨"*이 아니라 *"렌더러가 강요하는 모습"*이 된다.
    const css = structureCssBlocks().join('\n')
    expect(css).not.toContain('data-wb-structure="bordered"')
    // 이 절이 헛돌지 않는 것 — 이 그룹은 규칙을 갖고 있다.
    expect(css).toContain('data-wb-component="Section"')
  })

  it('계약 밖 속성이 없고 조각 이름이 전부 선언돼 있다', () => {
    const html = render('Card', 'bordered', { title: '제목', subtitle: '부제' })
    expectContractOnly(html)
    expectDeclaredParts('Card', html)
  })
})

describe('Card:elevated — plain과 DOM이 같다 (재라 #7)', () => {
  it('plain과 글자까지 같다 — 구조 이름만 다르다', () => {
    expectSameDomAsPlain('elevated', { title: '제목', subtitle: '부제' })
  })

  it('bordered와도 DOM이 같다 — 셋이 한 덩어리다', () => {
    // 셋이 같은 덩어리라는 것을 직접 못박는다. `plain`과 각각만 비교하면 이 관계가
    // 두 케이스에 흩어져 읽히지 않는다.
    const props = { title: '제목', subtitle: '부제' }
    expect(render('Card', 'elevated', props).replace('elevated', 'bordered')).toBe(
      render('Card', 'bordered', props),
    )
  })

  it('구조 기본 CSS가 그림자를 정하지 않는다', () => {
    expect(structureCssBlocks().join('\n')).not.toContain('data-wb-structure="elevated"')
  })

  it('계약 밖 속성이 없고 조각 이름이 전부 선언돼 있다', () => {
    const html = render('Card', 'elevated', { title: '제목', subtitle: '부제' })
    expectContractOnly(html)
    expectDeclaredParts('Card', html)
  })
})


describe('Card:mediaTop — 미디어 자리가 조각으로 생긴다', () => {
  /**
   * **DOM이 다르다 — `plain`에 없는 조각(`media`)이 머리에 하나 더 있다.**
   *
   * `bordered`·`elevated`와 갈리는 지점이 정확히 여기다. 저 둘은 §6.8의 어휘로 표현되는
   * **스킨**이지만, *"카드 위에 이미지 자리가 있다"*는 **테마가 겨냥할 상자가 없으면
   * 표현할 수 없다** — 조각도 어휘이므로(§6.5: *"`parts`가 headless 컴포넌트를 테마에
   * 매핑하는 실제 지점"*) 없는 조각은 만들 방법이 아예 없다.
   *
   * **`media`라는 이름을 골랐다.** `List`가 §5.1의 예시에서 이미
   * `['header','row','rowAlt','cell','item','media','title','meta']`로 같은 뜻의 조각을
   * `media`라 부른다 — 그룹마다 이름을 새로 지으면 테마 작성자가 외울 것이 는다
   * ("계획이 재지 않은 것 #4"가 지목한 부채다). 있는 이름을 따랐다.
   */
  it('media·header·title·body를 그 순서로 낸다', () => {
    expect(parts(render('Card', 'mediaTop', { title: '제목' }))).toEqual([
      'media',
      'header',
      'title',
      'body',
    ])
  })

  it('plain은 media를 내지 않는다 — 갈리는 지점', () => {
    expect(parts(render('Card', 'plain', { title: '제목' }))).not.toContain('media')
  })

  it('media가 header보다 앞에 온다 — "위"가 이 구조의 이름이다', () => {
    const html = render('Card', 'mediaTop', { title: '제목' })
    const at = (part: string): number => html.indexOf(`data-wb-part="${part}"`)

    // **둘 다 실제로 있는지부터 못박는다.** 처음에는 `at('media') < at('header')`만 적었고,
    // `media`를 통째로 지우는 변이를 심었더니 **이 케이스가 살아남았다** — `indexOf`가
    // `-1`을 돌려주는데 `-1`은 무엇보다 작기 때문이다. **대상이 아니라 장치가 틀린 쪽**
    // 이었고, 변이를 심어 보지 않았으면 못 봤다.
    expect(at('media')).toBeGreaterThanOrEqual(0)
    expect(at('header')).toBeGreaterThanOrEqual(0)
    expect(at('media')).toBeLessThan(at('header'))
  })

  it('media는 카탈로그에 선언된 조각이다', () => {
    expect(requireComponent('Card').parts).toContain('media')
  })

  it('부제가 있을 때도 조각이 다 나온다 — 조건부 갈래', () => {
    expect(parts(render('Card', 'mediaTop', { title: '제목', subtitle: '부제' }))).toEqual([
      'media',
      'header',
      'title',
      'subtitle',
      'body',
    ])
  })

  it('계약 밖 속성이 없고 조각 이름이 전부 선언돼 있다', () => {
    const html = render('Card', 'mediaTop', { title: '제목', subtitle: '부제' })
    expectContractOnly(html)
    expectDeclaredParts('Card', html)
  })

  /**
   * **구조가 서기 위한 선언 — 빈 상자에는 높이가 없다.**
   *
   * `media`는 자식이 없는 `<div>`라 아무 선언도 없으면 **높이 0이 되어 화면에서 사라진다.**
   * 그러면 *"이미지 자리가 있다"*는 구조가 서지 않는다. `Media:image`가 같은 문제를
   * `aspect-ratio`로 푼 자리를 그대로 따른다(`document.tsx`의 `frame`).
   *
   * **손잡이(`nodeVar`)를 만들지 않았다.** `Media`는 `ratio` prop이 있어 노드가 값을 나를
   * 수 있지만 `Card`에는 그런 prop이 없다 — 없는 값을 위해 통로만 뚫으면 **아무도 값을
   * 안 넣는 죽은 손잡이**가 된다(P4b-1 이월의 `Media.kind`와 같은 부류다). 테마는
   * `aspectRatio` 어휘로 이 값을 그대로 덮을 수 있다.
   *
   * **`partRule`이라 `horizontal`의 `media`도 이 규칙을 받는다.** `media`를 내는 구조가
   * 그 둘뿐이고 둘 다 같은 것을 원하므로 의도한 것이다.
   */
  it('빈 media 상자가 높이를 갖는다', async () => {
    const dom = await probe(
      [structureCssBlocks().join('\n')],
      '<div data-wb-component="Card" data-wb-structure="mediaTop">' +
        '<div data-wb-part="media"></div></div>',
    )
    expect(dom.computed('[data-wb-part="media"]', 'aspect-ratio')).toBe('16 / 9')
  })
})

describe('Card:horizontal — 미디어와 본문이 나란히 선다', () => {
  /**
   * **DOM이 다르다 — 조각 둘(`media`·`content`)이 더 있고, 그중 하나는 감싸는 상자다.**
   *
   * `mediaTop`과도 다르다. 미디어를 **옆**에 두려면 나머지(머리+본문)가 **한 덩어리로
   * 묶여야** 한다 — 안 묶으면 루트를 가로로 세우는 순간 `media`·`header`·`body` **셋이**
   * 나란히 서 버린다. 그 덩어리가 `content`다.
   *
   * **CSS로는 안 된다.** 감싸는 상자를 만드는 선언이 CSS에 없다(`display: contents`는
   * 반대 방향이다). 즉 이것은 스킨 차이가 아니라 **DOM 차이**이고, `Card`가 가진 진짜
   * 구조 차이 둘 중 하나다.
   */
  it('media·content를 내고 머리와 본문이 content 안에 있다', () => {
    expect(parts(render('Card', 'horizontal', { title: '제목' }))).toEqual([
      'media',
      'content',
      'header',
      'title',
      'body',
    ])
  })

  it('header가 content 안에 들어 있다 — mediaTop과 갈리는 지점', () => {
    const html = render('Card', 'horizontal', { title: '제목' })
    expect(html).toMatch(/data-wb-part="content"><div data-wb-part="header"/)
    // 음성 대조: `mediaTop`은 감싸지 않는다.
    expect(render('Card', 'mediaTop', { title: '제목' })).not.toContain('data-wb-part="content"')
  })

  it('content는 카탈로그에 선언된 조각이다', () => {
    expect(requireComponent('Card').parts).toContain('content')
  })

  it('계약 밖 속성이 없고 조각 이름이 전부 선언돼 있다', () => {
    const html = render('Card', 'horizontal', { title: '제목', subtitle: '부제' })
    expectContractOnly(html)
    expectDeclaredParts('Card', html)
  })

  /**
   * **구조가 서기 위한 선언 — "나란히"가 이 구조의 이름이다.**
   *
   * 루트가 가로로 서지 않으면 `media`와 `content`가 위아래로 쌓여 `mediaTop`과 구별되지
   * 않는다. 규칙은 **루트에만** 둔다(`componentRule`이 구조 이름을 넣으므로 `plain`·
   * `bordered`·`elevated`·`mediaTop`에는 닿지 않는다).
   *
   * **어휘를 골라 썼다.** `display`는 `STYLE_PROPERTIES`에 있으므로 테마가 이 줄을 덮을 수
   * 있다.
   */
  it('루트를 가로로 세운다 — 다른 Card 구조에는 닿지 않는다', async () => {
    const css = structureCssBlocks().join('\n')
    const box = (structure: string): string =>
      `<div data-wb-component="Card" data-wb-structure="${structure}"></div>`
    const dom = await probe([css], box('horizontal') + box('mediaTop'))

    expect(dom.computed('[data-wb-structure="horizontal"]', 'display')).toBe('flex')
    // 음성 대조. jsdom은 `<div>`에 UA 기본값 `block`을 준다.
    expect(dom.computed('[data-wb-structure="mediaTop"]', 'display')).toBe('block')
  })
})

/**
 * **`underline`과 DOM이 같은 구조 — `Card`의 셋과 같은 부류다** (재라 #7).
 *
 * `pill`은 알약 모양, `enclosed`는 테두리로 감싼 모양이다. 둘 다 **§6.8이 이미 가진
 * 어휘**로 표현된다(`radius`·`bg`·`borderColor`·`borderWidth`·`borderStyle`). 탭이 몇
 * 개인지, 무엇을 감싸는지는 하나도 달라지지 않으므로 **DOM이 한 글자도 다르지 않다.**
 *
 * `Card:bordered`와 다른 점은 없다 — **그래서 같은 방식으로 못박는다.**
 */
function expectSameDomAsUnderline(structure: string, props: Record<string, unknown>): void {
  const mine = render('Tabs', structure, props)
  const underline = render('Tabs', 'underline', props)

  expect(mine.replace(`data-wb-structure="${structure}"`, 'data-wb-structure="underline"')).toBe(
    underline,
  )
  expect(mine).toContain(`data-wb-structure="${structure}"`)
}

describe('Tabs:pill — underline과 DOM이 같다 (재라 #7)', () => {
  it('underline과 글자까지 같다 — 구조 이름만 다르다', () => {
    expectSameDomAsUnderline('pill', { tabs: ['가', '나', '다'], active: 1 })
  })

  it('탭이 없는 갈래에서도 같다', () => {
    expectSameDomAsUnderline('pill', { tabs: [], active: 0 })
  })

  it('구조 기본 CSS가 알약 모양을 정하지 않는다', () => {
    // 둥글기·배경은 스킨이다. 기본 CSS에 넣으면 테마가 되돌려야 한다.
    expect(structureCssBlocks().join('\n')).not.toContain('data-wb-structure="pill"')
  })

  it('계약 밖 속성이 없고 조각 이름이 전부 선언돼 있다', () => {
    const html = render('Tabs', 'pill', { tabs: ['가', '나'], active: 0 })
    expectContractOnly(html)
    expectDeclaredParts('Tabs', html)
  })
})
