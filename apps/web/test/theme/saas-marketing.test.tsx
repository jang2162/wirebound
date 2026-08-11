/**
 * **`saas-marketing` 시스템 테마가 실제로 무엇을 만드는지 렌더해서 잰다** (P4b-3 ② W1).
 *
 * `packages/themes/test/system.test.ts`는 *"이슈 0건이고 CSS에 선언이 있다"*까지 본다.
 * 이 파일이 재는 것은 그 다음이다 — **DOM이 같은 다섯 묶음에서 스킨이 실제로 갈리는가**(D4),
 * **조각 규칙이 중첩된 컴포넌트로 새는가**(D6 벽 2), **침묵 덮어쓰기 손잡이를 건드리는가**
 * (D6 벽 3).
 *
 * **여기 두는 이유는 `system-theme.test.ts`와 같다** — `themes`는 `renderer`를 볼 수 없고
 * (§3.3) 그 반대도 마찬가지라, 테마가 고른 구조를 실제로 그려 보는 것은 `apps/web`에서만
 * 된다.
 *
 * ---
 *
 * **jsdom의 한계를 알고 읽어야 한다.**
 *
 * 1. **`var()`를 치환하지 않는다.** 계산된 값은 선언된 문자열 그대로다. 그래서 값이
 *    토큰에서 오는 자리는 *"두 테마가 서로 다른 이름을 가리킨다"* 또는 *"`:root`의 값이
 *    다르다"*로 나눠 잰다(`cascade.test.tsx`가 세운 방식 그대로다).
 * 2. **캐스케이드가 문서 순서 하나다 — 특이도도 `!important`도 안 본다**
 *    (P4b-2 ③·수정 웨이브가 대조 8건으로 쟀다. **나는 다시 재지 않았다**). 그래서 아래
 *    *"테마가 렌더러의 `display: grid`를 이긴다"*류의 단언은 **순서만으로도 초록이 된다** —
 *    같은 특이도라는 것은 셀렉터 문자열이 보증하고(`componentRule`이 만든다), 실제 승패는
 *    Chromium에서 확인해야 한다. 그 실측은 P4b-2 리뷰가 구조 기본 CSS 전수 20/20으로
 *    했고 여기서 다시 하지 않았다.
 */
import { installStructures, renderNode, structureBaseCss } from '@wirebound/renderer'
import { installCatalog } from '@wirebound/schema'
import { compileTheme, resolveTheme, systemTheme, type ResolvedTheme } from '@wirebound/themes'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { themeStructures } from '../../src/theme/theme-structures'

beforeAll(() => {
  installCatalog()
  installStructures()
})

const MARKETING = 'saas-marketing'

function resolved(id: string): ResolvedTheme {
  const { theme, issues } = resolveTheme(systemTheme(id)!)
  expect(issues.map((entry) => `${entry.path}: ${entry.message}`), id).toEqual([])
  return theme!
}

/**
 * 테마 하나로 문서를 그린 뒤 계산된 스타일을 읽는다. **읽고 나서 걷어낸다** — 두 테마의
 * 시트가 한 문서에 함께 있으면 나중에 붙은 쪽이 이겨 비교가 무의미해진다
 * (`cascade.test.tsx`가 같은 이유로 같은 모양을 쓴다).
 *
 * 시트 순서는 D5 그대로 **구조 기본 CSS 먼저, 테마 CSS 나중**이다.
 */
function withTheme<T>(id: string, doc: unknown, body: (root: HTMLElement) => T): T {
  const theme = resolved(id)

  const structureTag = document.createElement('style')
  structureTag.textContent = structureBaseCss()
  const themeTag = document.createElement('style')
  themeTag.textContent = compileTheme(theme)
  document.head.append(structureTag, themeTag)

  const host = document.createElement('div')
  host.innerHTML = renderToStaticMarkup(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    renderNode(doc as any, { structures: themeStructures(theme) }),
  )
  document.body.append(host)

  try {
    return body(host)
  } finally {
    structureTag.remove()
    themeTag.remove()
    host.remove()
  }
}

function computed(root: HTMLElement, selector: string, property: string): string {
  const element = root.querySelector(selector)
  if (element === null) throw new Error(`요소를 찾지 못했습니다: ${selector}`)
  return getComputedStyle(element).getPropertyValue(property)
}

/**
 * **DOM이 같은 다섯 묶음만 담은 문서.** `Card`·`Tabs`·`EntryForm`·`Field`·`Button` 다섯이
 * 그 묶음이고(P4b-2 ③이 전수로 쟀다), `admin`과 이 테마는 그 다섯에서 **서로 다른 구조를
 * 고른다.** 그러므로 이 문서의 마크업은 두 테마에서 `data-wb-structure` 값 말고 한 글자도
 * 다르면 안 된다 — 아래 첫 케이스가 그것을 잰다.
 */
const SKIN_DOC = {
  id: 'n_000000000001',
  type: 'Page',
  children: [
    {
      id: 'n_000000000002',
      type: 'Card',
      props: { title: '카드 제목', subtitle: '부제' },
      children: [],
    },
    { id: 'n_000000000003', type: 'Tabs', props: { tabs: ['월간', '연간'], active: 0 } },
    {
      id: 'n_000000000004',
      type: 'EntryForm',
      props: { title: '문의하기' },
      children: [
        { id: 'n_000000000005', type: 'Field', props: { label: '이메일', control: 'text' } },
        // **변형을 달지 않는다.** `variant: 'primary'`를 달았다가 두 테마의 배경이 똑같이
        // `var(--wb-semantic-primary)`로 나왔다 — 변형 규칙이 뒤에 와서 구조 스킨을 덮은
        // 것이고, 그러면 재려던 것(`solid` vs `outline`)이 안 보인다. **대상이 아니라
        // 측정 장치가 틀린 부류였다.**
        { id: 'n_000000000006', type: 'Button', props: { label: '보내기' } },
      ],
    },
  ],
}

/**
 * **랜딩 페이지의 모양을 한 문서.** 중첩을 일부러 만든다 —
 * `Card` 안에 `List`, `EntryForm` 안에 `Field`·`Button`. 그 둘이 D6 벽 2의 자리다.
 */
const PAGE_DOC = {
  id: 'n_000000000101',
  type: 'Page',
  children: [
    {
      id: 'n_000000000102',
      type: 'Section',
      variant: 'hero',
      children: [
        { id: 'n_000000000103', type: 'Text', props: { content: '한 줄로 끝나는 약속', role: 'display' } },
        {
          id: 'n_000000000104',
          type: 'Card',
          props: { title: '기능 묶음', subtitle: '' },
          children: [
            { id: 'n_000000000105', type: 'List', props: { items: 2, pagination: false } },
          ],
        },
        { id: 'n_000000000106', type: 'Tree', props: { items: ['질문 하나', '질문 둘'], depth: 2 } },
        {
          id: 'n_000000000107',
          type: 'KeyValue',
          props: { pairs: [{ key: '가동률', value: '99.9%' }], columns: 2 },
        },
        { id: 'n_000000000108', type: 'Media', props: { kind: 'illustration', caption: '개념도', ratio: '4/3' } },
        {
          id: 'n_000000000109',
          type: 'EntryForm',
          props: { title: '문의하기' },
          children: [
            { id: 'n_000000000110', type: 'Field', props: { label: '이메일', control: 'text' } },
            { id: 'n_000000000111', type: 'Button', props: { label: '보내기' }, variant: 'primary' },
          ],
        },
        { id: 'n_000000000112', type: 'Flex', props: { direction: 'column' } },
        { id: 'n_000000000113', type: 'Placeholder', props: { label: '스크린샷', height: 320 } },
      ],
    },
  ],
}

/** `data-wb-structure` 값만 지운 마크업. 나머지가 한 글자라도 다르면 DOM이 갈린 것이다. */
function withoutStructureNames(markup: string): string {
  return markup.replace(/data-wb-structure="[^"]*"/g, 'data-wb-structure="…"')
}

describe('D4 — DOM이 같은 다섯 묶음은 스킨이 전부다', () => {
  it('다섯 묶음에서 admin과 다른 구조를 고른다', () => {
    const admin = themeStructures(resolved('admin'))
    const marketing = themeStructures(resolved(MARKETING))

    expect([admin.Card, admin.Tabs, admin.EntryForm, admin.Field, admin.Button]).toEqual([
      'plain',
      'underline',
      'labelLeft',
      'outlined',
      'solid',
    ])
    expect([
      marketing.Card,
      marketing.Tabs,
      marketing.EntryForm,
      marketing.Field,
      marketing.Button,
    ]).toEqual(['elevated', 'pill', 'labelTop', 'filled', 'outline'])
  })

  /**
   * **다른 구조를 골랐는데 마크업이 같다.** 이것이 P4b-2 ③의 전수 측정을 이 테마에서
   * 다시 확인하는 자리이고, 아래 케이스들이 *"그러면 무엇이 갈리는가"*에 답한다.
   */
  it('그런데 두 테마의 마크업이 구조 이름 말고는 같다', () => {
    const render = (id: string) =>
      renderToStaticMarkup(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        renderNode(SKIN_DOC as any, { structures: themeStructures(resolved(id)) }),
      )

    const adminMarkup = render('admin')
    const marketingMarkup = render(MARKETING)

    expect(adminMarkup).not.toBe(marketingMarkup)
    expect(withoutStructureNames(adminMarkup)).toBe(withoutStructureNames(marketingMarkup))
  })

  /**
   * **그래서 갈리는 것은 전부 CSS다.** 다섯 자리를 각각 잰다.
   *
   * 값이 `var(…)`인 자리와 리터럴인 자리가 섞여 있는데, 그것이 곧 *"토큰이 갈린 것"*과
   * *"선언 자체가 갈린 것"*의 구분이다. 어느 쪽이든 **두 테마의 계산값이 실제로 다르다.**
   */
  it('다섯 자리의 계산된 스타일이 실제로 갈린다', () => {
    const readings: readonly (readonly [string, string])[] = [
      // Card — `plain`에는 그림자가 없고 `elevated`는 있다. 이 묶음의 이름이 곧 그것이다.
      ['[data-wb-component="Card"]', 'box-shadow'],
      // Tabs — 알약은 `radius`와 배경으로만 만들어진다.
      ['[data-wb-component="Tabs"] [data-wb-part="tab"]', 'border-radius'],
      // EntryForm — 라벨이 위로 가는 것은 `Field` 루트의 흐름이라 폼 쪽은 상자 스킨이 갈린다.
      ['[data-wb-component="EntryForm"]', 'box-shadow'],
      // Field — `filled`는 테두리를 지우고 배경을 준다.
      ['[data-wb-component="Field"] [data-wb-part="control"]', 'border-width'],
      // Button — `outline`은 배경이 면이 아니라 표면색이다.
      ['[data-wb-component="Button"]', 'background'],
    ]

    const read = (id: string) =>
      withTheme(id, SKIN_DOC, (root) =>
        readings.map(([selector, property]) => computed(root, selector, property)),
      )

    const admin = read('admin')
    const marketing = read(MARKETING)

    expect(marketing).toEqual([
      'var(--wb-shadow-md)',
      'var(--wb-radius-full)',
      'var(--wb-shadow-md)',
      '0px',
      'var(--wb-semantic-surface)',
    ])
    expect(admin).toEqual(['', '', '', '1px', 'var(--wb-semantic-primary)'])
    // 다섯 자리가 **전부** 갈린다 — 하나라도 같으면 그 자리는 스킨이 안 갈린 것이다.
    readings.forEach((_, index) => expect(marketing[index]).not.toBe(admin[index]))
  })

  /**
   * **`Field`의 라벨이 위로 가는 것은 구조가 아니라 스킨이다.** `EntryForm:labelTop`의 DOM이
   * `labelLeft`와 같으므로(구현체의 판정) 라벨 자리는 `Field` 루트의 흐름이 정한다.
   */
  it('labelTop의 "라벨이 위"는 Field 루트의 display가 만든다', () => {
    expect(withTheme(MARKETING, SKIN_DOC, (root) => computed(root, '[data-wb-component="Field"]', 'display'))).toBe('grid')
    // `admin`은 `Field`의 `display`를 선언하지 않으므로 `<div>`의 UA 기본값이 남는다.
    expect(withTheme('admin', SKIN_DOC, (root) => computed(root, '[data-wb-component="Field"]', 'display'))).toBe('block')
  })
})

describe('D6 벽 2 — 조각 규칙이 중첩된 컴포넌트로 샌다', () => {
  /**
   * **`Card` 안에 `List`를 넣으면 `Card`의 조각 규칙이 `List`의 조각을 잡는다.**
   *
   * 조각 규칙이 자손 결합자라 컴포넌트 경계를 보지 않는다(P4b-2 이월 4-1 — *그쪽이 쟀고
   * 나는 이 테마에서 다시 확인했다*). 잡히는 수를 세는 것이 이 부류의 크기다.
   */
  it('Card의 title 규칙이 중첩된 List의 title까지 잡는다', () => {
    withTheme(MARKETING, PAGE_DOC, (root) => {
      const caught = root.querySelectorAll('[data-wb-component="Card"] [data-wb-part="title"]')
      // 카드 자신의 제목 1 + 카드 안 `List:cardGrid`의 항목 제목 2 = 3.
      expect(caught.length).toBe(3)

      const own = root.querySelector('[data-wb-component="Card"] > [data-wb-part="header"] > [data-wb-part="title"]')
      const nested = root.querySelector('[data-wb-component="List"] [data-wb-part="title"]')
      expect(own).not.toBeNull()
      expect(nested).not.toBeNull()
      // 남의 것도 바깥 규칙에 **맞는다** — 이것이 결함의 실재다.
      expect(nested!.matches('[data-wb-component="Card"] [data-wb-part="title"]')).toBe(true)
    })
  })

  /**
   * **그런데 화면은 안 깨진다 — 순서 덕이다.** `List`가 `Card`보다 뒤에 방출되므로
   * (`components`의 선언 순서가 곧 방출 순서다) 같은 프로퍼티를 둘 다 선언한 자리는
   * `List`가 이긴다. **모델이 아니라 카탈로그 순서가 막고 있다**는 P4b-2의 판정이
   * 이 테마에서도 그대로다.
   */
  it('겹치는 프로퍼티는 뒤에 방출된 List가 이긴다', () => {
    withTheme(MARKETING, PAGE_DOC, (root) => {
      // 카드 제목은 h3, 카드 안 목록의 항목 제목은 h4 — 섞이지 않았다.
      expect(computed(root, '[data-wb-component="Card"] > [data-wb-part="header"] > [data-wb-part="title"]', 'font-size')).toBe(
        'var(--wb-typography-h3-fontSize)',
      )
      expect(computed(root, '[data-wb-component="List"] [data-wb-part="title"]', 'font-size')).toBe(
        'var(--wb-typography-h4-fontSize)',
      )
    })
  })

  /**
   * **`EntryForm`의 `label`이 중첩된 `Field`·`Button`의 `label`을 잡는다.**
   * P4b-2가 `admin`에서 이 자리를 3건 쟀다 — *"전부 `EntryForm.parts.label`이 중첩된
   * `Tree`·`Field`·`Button`의 `label`을 잡는 것"*. 이 테마에서도 같은 부류다.
   */
  it('EntryForm의 label 규칙이 중첩된 Field·Button의 label까지 잡는다', () => {
    withTheme(MARKETING, PAGE_DOC, (root) => {
      const caught = root.querySelectorAll('[data-wb-component="EntryForm"] [data-wb-part="label"]')
      // 폼 제목 1 + 필드 라벨 1 + 버튼 라벨 1 = 3.
      expect(caught.length).toBe(3)
    })
  })

  /**
   * **막는 방법이 "안쪽에서 같은 프로퍼티를 다시 선언하는 것"뿐이다.**
   *
   * 이 테마의 `EntryForm.parts.label`은 디스플레이 서체를 건다. 그것을 그대로 두면
   * 중첩된 필드 라벨과 버튼 라벨도 그 서체를 받는다 — `fontFamily`는 `List`/`Card`의
   * `title`처럼 안쪽이 자동으로 덮어 주는 프로퍼티가 아니기 때문이다. 그래서
   * `Field.parts.label`·`Button.parts.label`에 **본문 서체를 중복 선언**해 막았다.
   * 이 케이스가 그 중복이 실제로 일하고 있음을 잰다 — 지우면 값이 디스플레이 서체로 바뀐다.
   */
  it('중첩 라벨의 서체는 안쪽의 중복 선언이 막고 있다', () => {
    withTheme(MARKETING, PAGE_DOC, (root) => {
      expect(computed(root, '[data-wb-component="EntryForm"] > [data-wb-part="label"]', 'font-family')).toBe(
        'var(--wb-typography-family-display)',
      )
      expect(computed(root, '[data-wb-component="Field"] [data-wb-part="label"]', 'font-family')).toBe(
        'var(--wb-typography-family-sans)',
      )
      expect(computed(root, '[data-wb-component="Button"] [data-wb-part="label"]', 'font-family')).toBe(
        'var(--wb-typography-family-sans)',
      )
    })
  })
})

describe('D6 벽 3 — 침묵 덮어쓰기 손잡이를 건드리지 않는다', () => {
  /**
   * 손잡이는 아홉이고 이름은 여덟이다(P4b-2 이월 5번 — *그쪽이 전수로 쟀다*).
   * **테마가 그 어휘를 손잡이와 같은 셀렉터에서 내면 노드의 값이 침묵으로 무시된다.**
   * 이 테마는 여덟 중 어느 것도 그 셀렉터에서 내지 않는다 — 아래가 그것을 CSS 문자열로
   * 확인한다(렌더 없이 잴 수 있는 부류다).
   */
  it('손잡이를 읽는 여섯 규칙과 같은 셀렉터에 그 프로퍼티가 없다', () => {
    const css = compileTheme(resolved(MARKETING))

    /** 셀렉터 하나의 블록 본문. 없으면 `null`이다(규칙 자체를 안 낸 것). */
    const block = (selector: string): string | null => {
      const at = css.indexOf(`${selector} {`)
      return at === -1 ? null : css.slice(at, css.indexOf('}', at))
    }

    /**
     * 그 블록이 이 CSS 프로퍼티를 **선언하는가.**
     *
     * **부분 문자열로 세면 안 된다 — 걸려서 고쳤다.** `Placeholder` 블록에
     * `'height'`가 있는지 봤더니 참이었는데, 실제로 들어 있던 것은
     * `line-height`였다(`typography: 'caption'`이 펼친 것). 선언은 줄 머리에
     * `  <이름>: `으로 나가므로 그 모양을 그대로 찾는다.
     */
    const declares = (selector: string, property: string): boolean => {
      const body = block(selector)
      expect(body, `${selector} 블록이 없다`).not.toBeNull()
      return body!.includes(`\n  ${property}: `)
    }

    // `Flex:default` — direction·align·justify·wrap 넷.
    const FLEX = '[data-wb-component="Flex"][data-wb-structure="default"]'
    for (const property of ['flex-direction', 'align-items', 'justify-content', 'flex-wrap']) {
      expect(declares(FLEX, property), property).toBe(false)
    }
    // 이 블록이 무언가는 선언한다 — `declares`가 늘 거짓인 장치가 아니라는 대조군이다.
    expect(declares(FLEX, 'gap')).toBe(true)

    // `Grid:default`·`KeyValue:cardGrid` — gridColumns.
    expect(declares('[data-wb-component="Grid"][data-wb-structure="default"]', 'grid-template-columns')).toBe(false)
    expect(
      declares('[data-wb-component="KeyValue"][data-wb-structure="cardGrid"]', 'grid-template-columns'),
    ).toBe(false)

    // `Media [frame]` — aspectRatio.
    expect(declares('[data-wb-component="Media"] [data-wb-part="frame"]', 'aspect-ratio')).toBe(false)

    // `Placeholder:default` — height. (`line-height`는 있고 `height`는 없다.)
    const PLACEHOLDER = '[data-wb-component="Placeholder"][data-wb-structure="default"]'
    expect(declares(PLACEHOLDER, 'height')).toBe(false)
    expect(declares(PLACEHOLDER, 'line-height')).toBe(true)
  })

  /**
   * **`Tree`의 손잡이는 이 테마에서 아예 성립하지 않는다.** `--wb-node-tree-level`을 읽는
   * 규칙이 P4b-2 ③에서 `:where(indent)`로 좁혀졌는데 이 테마는 `accordion`을 고른다 —
   * 즉 아홉 중 하나가 **구조 선택만으로** 판에서 빠진다.
   */
  it('accordion을 골라서 Tree 들여쓰기 규칙이 이 테마의 노드에 안 걸린다', () => {
    withTheme(MARKETING, PAGE_DOC, (root) => {
      const node = root.querySelector('[data-wb-component="Tree"] [data-wb-part="node"]')
      expect(node).not.toBeNull()
      expect(
        node!.matches('[data-wb-component="Tree"]:where([data-wb-structure="indent"]) [data-wb-part="node"]'),
      ).toBe(false)
    })
  })

  /**
   * **노드가 나르는 값이 살아 있다.** 위가 *"안 덮는다"*를 재고 이것이 *"그래서 노드 값이
   * 실제로 쓰인다"*를 잰다 — 둘 중 하나만 있으면 규칙을 지웠을 때 아무것도 안 죽는다.
   */
  it('Flex의 방향과 KeyValue의 열 수가 노드의 것으로 남는다', () => {
    withTheme(MARKETING, PAGE_DOC, (root) => {
      expect(computed(root, '[data-wb-component="Flex"]', 'flex-direction')).toBe(
        'var(--wb-node-flex-direction, row)',
      )
      expect(computed(root, '[data-wb-component="Flex"]', '--wb-node-flex-direction')).toBe('column')
      expect(computed(root, '[data-wb-component="KeyValue"]', 'grid-template-columns')).toBe(
        'repeat(var(--wb-node-keyvalue-columns, 1), 1fr)',
      )
      expect(computed(root, '[data-wb-component="KeyValue"]', '--wb-node-keyvalue-columns')).toBe('2')
    })
  })
})

describe('서체 — 두 층이 갈려 있고 둘 다 있어야 보인다', () => {
  /**
   * **아래층: `assets.fonts` → `@font-face`**(P4b-3 D5 — ①이 만들었다).
   * `weights`가 값마다 블록 하나이므로 둘 × 둘 = **넷**이다.
   */
  it('@font-face가 넷이고 시트 맨 앞에 온다', () => {
    const css = compileTheme(resolved(MARKETING))
    expect(css.startsWith('@font-face {')).toBe(true)
    expect(css.match(/@font-face \{/g)?.length).toBe(4)
    expect(css).toContain('font-weight: 700;')
    expect(css).toContain('font-weight: 800;')
    // 네트워크를 쓰지 않는다 — `local()`뿐이고 `url(`이 하나도 없다.
    expect(css).not.toContain('url(')

    // 대조군 — `admin`에는 `assets`가 없으므로 하나도 안 나간다(D7의 절반, ①이 닫았다).
    expect(compileTheme(resolved('admin'))).not.toContain('@font-face')
  })

  /**
   * **위층: `fontFamily` 어휘가 그 서체를 컴포넌트에 건다.** `@font-face`만 있으면 아무도
   * 안 쓰는 CSS이고, 어휘만 있으면 실을 것이 없다.
   */
  it('선언한 family 이름이 토큰을 지나 컴포넌트 규칙까지 이어진다', () => {
    withTheme(MARKETING, PAGE_DOC, (root) => {
      // 큰 제목은 디스플레이 서체, 본문 뿌리는 본문 서체.
      expect(computed(root, '[data-wb-component="Text"][data-wb-variant="display"]', 'font-family')).toBe(
        'var(--wb-typography-family-display)',
      )
      expect(computed(root, '[data-wb-component="Page"]', 'font-family')).toBe(
        'var(--wb-typography-family-sans)',
      )
    })

    // 마지막 한 걸음(`var()` 치환)은 jsdom이 못 한다 — 이름이 이어지는 것까지만 잰다.
    const css = compileTheme(resolved(MARKETING))
    expect(css).toContain('--wb-typography-family-display: "Wirebound Marketing Display"')
    expect(css).toContain('font-family: "Wirebound Marketing Display";')
  })
})

describe('§6.0의 약속과 마케팅 골격', () => {
  /**
   * **§6.0이 이름으로 지목한 문장이다** — *"같은 `List` 노드가 관리자 테마에서는 테이블로,
   * 마케팅 테마에서는 카드 그리드로."* 같은 문서를 두 테마로 그려 태그가 갈리는 것을 본다.
   */
  it('같은 List 노드가 admin에서는 table, 여기서는 cardGrid로 그려진다', () => {
    const render = (id: string) =>
      renderToStaticMarkup(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        renderNode(PAGE_DOC as any, { structures: themeStructures(resolved(id)) }),
      )

    expect(render('admin')).toContain('<table data-wb-id="n_000000000105"')
    const marketing = render(MARKETING)
    expect(marketing).toContain('<div data-wb-id="n_000000000105"')
    expect(marketing).toContain('data-wb-structure="cardGrid"')
  })

  /**
   * **`splitBg`를 고른 이유가 이 조각 하나다.** `contained`에는 `band`가 없어 배경 워시를
   * 담을 상자가 아예 없다(§6.5 — 테마는 `parts`에 없는 조각을 스타일링할 수 없다).
   *
   * **렌더러의 `display: grid`를 `display: block`으로 덮는다.** 구현체가 *"테마가 이 두 줄을
   * 그대로 덮을 수 있다"*고 적어 둔 자리다. **다만 jsdom은 순서만 보므로**(머리말 2)
   * 이 초록이 보증하는 것은 *"덮는 규칙이 나중에 온다"*까지다.
   */
  it('splitBg의 band가 배경 워시를 담고 루트는 block으로 덮인다', () => {
    withTheme(MARKETING, PAGE_DOC, (root) => {
      const band = root.querySelector('[data-wb-component="Section"] [data-wb-part="band"]')
      expect(band).not.toBeNull()
      expect(computed(root, '[data-wb-component="Section"] [data-wb-part="band"]', 'position')).toBe('absolute')
      // 히어로 변형이 band의 그라디언트를 갈아 끼운다.
      expect(computed(root, '[data-wb-component="Section"] [data-wb-part="band"]', 'background-image')).toContain(
        'var(--wb-semantic-primarySoft)',
      )
      expect(computed(root, '[data-wb-component="Section"]', 'display')).toBe('block')
    })
  })

  /**
   * **골격의 수가 `admin`과 갈린다.** §6.4가 이 둘을 이름으로 들어 적었다 —
   * *"관리자 화면은 좁은 섹션 여백을, 마케팅 사이트는 `1200px`에 넉넉한 여백을."*
   */
  it('컨테이너 폭과 섹션 리듬이 admin과 다르다', () => {
    const value = (id: string, path: string) => resolved(id).primitives.get(path)
    expect(value('admin', 'container.maxWidth')).toBe('1440px')
    expect(value(MARKETING, 'container.maxWidth')).toBe('1200px')
    // `space.20` = 80px vs `space.8` = 32px. 같은 눈금(4px)에서 다른 단계를 쓴다.
    expect(resolved('admin').tokens.get('space.8')).toBe('32px')
    expect(resolved(MARKETING).tokens.get('space.20')).toBe('80px')
    expect(value('admin', 'section.paddingY')).toBe('var(--wb-space-8)')
    expect(value(MARKETING, 'section.paddingY')).toBe('var(--wb-space-20)')
  })

  /**
   * **뒤집힌 케이스다. 지우지 않고 무엇이 언제 왜 바뀌었는지 남긴다.**
   *
   * **P4b-3까지 단언하던 것:** *"`TOKEN_NAMESPACES`에 `container`·`grid`·`section`이 없어
   * `container.maxWidth`가 참조로 인식되지 않고 리터럴로 실린다. `admin`이 그 자리를
   * 그렇게 적어 두었고, 컴파일 결과에 `max-width: container.maxWidth;`라는 **무효 선언이
   * 이슈 0건으로** 나간다. **이 테마는 그래서 리터럴을 쓴다.**"*
   *
   * **2026-08-11(P4c-1 T1)이 그 전제를 없앴다.** 스타일 전용 이름공간 셋이 열려
   * `admin`의 무효 선언 둘이 `var()`가 됐고, 이 테마도 리터럴 우회를 그만두었다.
   * 그래서 이제 **둘이 같은 문법을 쓴다** — 그것을 못박는다.
   *
   * 폭이 다르다는 사실은 위 `컨테이너 폭과 섹션 리듬이 admin과 다르다`가 계속 지킨다.
   */
  it('admin과 이 테마가 같은 문법으로 primitives를 가리킨다', () => {
    const adminCss = compileTheme(resolved('admin'))
    expect(adminCss).toContain('max-width: var(--wb-container-maxWidth);')
    expect(adminCss).toContain('gap: var(--wb-grid-gap);')
    // 무효 선언이 사라졌다 — 이것이 P4c-1 T1의 산출물이다.
    expect(adminCss).not.toContain('max-width: container.maxWidth;')
    expect(adminCss).not.toContain('gap: grid.gap;')

    const css = compileTheme(resolved(MARKETING))
    expect(css).toContain('max-width: var(--wb-container-maxWidth);')
    expect(css).toContain('--wb-container-maxWidth: 1200px;')
    // 손으로 맞춘 중복이 사라졌다.
    expect(css).not.toContain('max-width: 1200px;')
  })
})
