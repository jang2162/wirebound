/**
 * **입력 그룹의 구조 구현체** — `SearchForm`·`EntryForm`·`Field` (P4b-2 ② W3).
 *
 * 파일을 새로 만든 것은 병렬 워커 넷이 `structures.test.tsx` 하나를 동시에 고치면
 * 충돌하기 때문이다(계획서 ②). 여기에는 **입력 그룹만** 든다.
 *
 * ---
 *
 * **이 파일이 덮는 사각 — `forEachVariation`은 자식 없는 노드만 그린다.**
 *
 * `structures.test.tsx`의 전수 가드 셋(part 이름 · 계약 밖 `data-*` · `style` 일반 선언)은
 * `renderNode({ id, type, props })`를 부른다. `children`이 없으므로 `renderNode`가
 * `children`을 `null`로 만들고, **자식을 감싸며 생기는 조각은 그 순회에 한 번도 나오지
 * 않는다.** 이 그룹이 만드는 `SearchForm:stacked`의 `row`와 `EntryForm:sectioned`의
 * `section`·`sectionTitle`이 정확히 그 부류다 — 자식이 있어야만 나온다.
 *
 * 실측으로 확인했다: 두 구조를 만든 뒤에도 `structures.test.tsx`는 그 조각들을 한 번도
 * 스캔하지 않는다. 그래서 아래 `describe('W3 — 자식이 있을 때의 전수 가드')`가 같은 검사
 * 셋을 **자식을 달아** 한 번 더 돌린다.
 */
import { installCatalog, requireComponent } from '@wirebound/schema'
import type { WbNode } from '@wirebound/schema'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { renderNode } from '../src/render'
import { installStructures } from '../src/structures/index'
import { getStructure } from '../src/structures/registry'

beforeAll(() => {
  installCatalog()
  installStructures()
})

/** 이 그룹의 컴포넌트와 그 구조 전부. 카탈로그에서 읽는다 — 손으로 적으면 늘 때 어긋난다. */
const INPUT_TYPES = ['SearchForm', 'EntryForm', 'Field'] as const

/** 자식 노드 n개. `Field`를 쓰는 것은 실제 폼이 그렇기 때문이다. */
function fields(count: number): WbNode[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `n_00000000000${index + 1}` as string,
    type: 'Field',
    props: { label: `항목${index + 1}` },
  })) as WbNode[]
}

function render(
  type: string,
  structure: string,
  props: Record<string, unknown> = {},
  children: WbNode[] = [],
): string {
  return renderToStaticMarkup(
    renderNode({ id: 'n_000000000000', type, props, children } as WbNode, {
      structures: { [type]: structure },
    }),
  )
}

function partsOf(html: string): string[] {
  return [...html.matchAll(/data-wb-part="([^"]*)"/g)].map((match) => match[1]!)
}

function countOf(html: string, part: string): number {
  return partsOf(html).filter((name) => name === part).length
}

describe('SearchForm:stacked — 한 줄에 한 필드', () => {
  it('fields·actions 조각을 낸다', () => {
    const html = render('SearchForm', 'stacked', {}, fields(2))
    expect(html).toContain('data-wb-structure="stacked"')
    expect(countOf(html, 'fields')).toBe(1)
    expect(countOf(html, 'actions')).toBe(1)
  })

  it('자식 하나마다 row 조각을 하나씩 낸다', () => {
    // **이것이 `inline`과 갈리는 지점이다.** 테마는 §6.5에서 `parts`만 겨냥할 수 있고
    // 자식 컴포넌트를 직접 겨냥할 수 없으므로, 줄이 조각으로 나오지 않으면 테마가
    // 줄 사이 간격·구분선에 손댈 방법이 없다.
    for (const count of [0, 1, 3]) {
      expect(countOf(render('SearchForm', 'stacked', {}, fields(count)), 'row'), `${count}`).toBe(
        count,
      )
    }
  })

  it('inline은 row를 내지 않는다 — 대조군', () => {
    // 이 케이스가 없으면 위 케이스는 "SearchForm이 원래 row를 낸다"로도 설명된다.
    expect(countOf(render('SearchForm', 'inline', {}, fields(3)), 'row')).toBe(0)
  })

  it('자식이 줄 안에 들어간다 — 줄만 세고 자식을 버리지 않았다', () => {
    const html = render('SearchForm', 'stacked', {}, fields(2))
    expect(html).toContain('항목1')
    expect(html).toContain('항목2')
    // 줄이 자식을 감싼다: `row` 다음에 자식 노드의 여는 태그가 온다.
    expect(html).toMatch(/data-wb-part="row"[^>]*>\s*<[^>]*data-wb-component="Field"/)
  })
})

/**
 * **`SearchForm.collapsed`는 오늘 죽어 있다 — `collapsible`이 그것을 살린다.**
 *
 * `Media.kind`와 같은 부류였다(P4b-1 이월 1번): 속성 패널에 `접힌 상태` 스위치가 **있고**
 * 켜면 문서에 저장되고 검증도 통과하는데 **화면은 아무것도 바뀌지 않는다.** 실측 —
 * `SearchFormInline`이 `props`를 아예 받지 않는다(`attrs`·`part`·`children`뿐).
 *
 * **`Media.kind`와 갈리는 점:** 그쪽은 `kind`와 `structures`가 **같은 이름 넷**이라
 * 구조와 중복이었다. 여기서는 이름이 겹치지 않는다 — `collapsed`는 *"지금 접혀 있는가"*
 * 이고 `collapsible`은 *"접을 수 있는 형태인가"*다. 하나는 노드가 정하고 하나는 테마가
 * 고른다. 그래서 **지울 것이 아니라 읽어야 하는 prop**이고, 그것이 이 구조다.
 *
 * **`states`에는 더하지 않았다.** 더하면 `data-wb-state="collapsed"`가 `inline`·`stacked`
 * 에서도 나가는데, 그 둘에는 접힘이라는 개념이 없어 테마가 켤 수 없는 상태 스킨이 하나
 * 생긴다(P4b-1이 닫은 도달성 구멍의 거울상이다). 접힘은 여기서 **DOM으로** 표현된다.
 */
describe('SearchForm:collapsible — 접힘을 DOM으로 표현한다', () => {
  it('toggle 조각을 낸다 — 접혀 있어도 이것은 남는다', () => {
    for (const collapsed of [false, true]) {
      const html = render('SearchForm', 'collapsible', { collapsed }, fields(2))
      expect(countOf(html, 'toggle'), `${collapsed}`).toBe(1)
    }
  })

  it('펼쳐져 있으면 fields·actions가 나온다', () => {
    const html = render('SearchForm', 'collapsible', { collapsed: false }, fields(2))
    expect(countOf(html, 'fields')).toBe(1)
    expect(countOf(html, 'actions')).toBe(1)
    expect(html).toContain('항목1')
  })

  it('접혀 있으면 fields·actions가 사라진다', () => {
    const html = render('SearchForm', 'collapsible', { collapsed: true }, fields(2))
    expect(countOf(html, 'fields')).toBe(0)
    expect(countOf(html, 'actions')).toBe(0)
    // 자식도 함께 사라진다 — 접힌 폼은 내용을 보이지 않는다.
    expect(html).not.toContain('항목1')
  })

  it('inline·stacked는 collapsed를 읽지 않는다 — 그것이 이 prop이 죽어 있던 모습이다', () => {
    // **음성 대조이자 기록이다.** `collapsible`이 생기기 전에는 세 구조가 다 이랬다.
    for (const structure of ['inline', 'stacked']) {
      const open = render('SearchForm', structure, { collapsed: false }, fields(2))
      const shut = render('SearchForm', structure, { collapsed: true }, fields(2))
      expect(shut, structure).toBe(open)
    }
  })

  it('collapsible에서는 collapsed가 렌더를 가른다 — 양성 대조', () => {
    const open = render('SearchForm', 'collapsible', { collapsed: false }, fields(2))
    const shut = render('SearchForm', 'collapsible', { collapsed: true }, fields(2))
    expect(shut).not.toBe(open)
  })
})

/**
 * 두 구조의 렌더 결과를 **구조 이름만 지우고** 맞대 본다. 같으면 `data-wb-structure`
 * 하나를 빼고 DOM이 글자까지 같다는 뜻이다.
 */
function sameDomIgnoringStructureName(html: string, other: string): boolean {
  const strip = (value: string): string => value.replace(/ data-wb-structure="[^"]*"/g, '')
  return strip(html) === strip(other)
}

/**
 * **발견: `EntryForm:labelTop`은 `labelLeft`와 DOM이 같다. 케이스가 그것을 실행 가능한
 * 형태로 고정한다** (계획서 "재라 #1"·"계획이 재지 않은 것 #5"가 `Field`에 대해 의심한
 * 것과 같은 부류이고, 여기서도 성립했다).
 *
 * **원인은 소유권이다.** 라벨과 컨트롤의 짝은 `EntryForm`이 아니라 **자식 `Field` 안에**
 * 있다. `EntryForm`의 구조 구현체가 받는 `children`은 이미 그려진 ReactNode이고, 그 안쪽을
 * 헤집는 것은 남의 컴포넌트의 구조를 만지는 것이다. 즉 라벨을 위에 두는 것은
 * **`Field` 루트의 `flex-direction` 하나**이고 그것은 CSS다.
 *
 * **더 나아가 이 구조는 테마의 `Field` 스킨과 중복이다.** 테마는 이미
 * `components.Field.base`에 `flexDirection`을 쓸 수 있으므로, `labelTop`을 고르지 않고도
 * 라벨을 위에 두는 폼을 만들 수 있다.
 *
 * **그래도 구현한다** — 설계 §6.5가 구조 옵션으로 열거했고, 등록해 두면
 * `data-wb-structure="labelTop"`이라는 셀렉터 하나는 테마에 남는다. **판정은 P4b-3과
 * §6.5의 구조/변형 경계 재검토로 넘긴다.**
 *
 * > **후보 하나를 재고 버렸다:** `EntryForm` 루트가 커스텀 프로퍼티를 싣고 `Field`의
 * > 기본 CSS가 그것을 `var()`로 읽으면(커스텀 프로퍼티는 상속된다) DOM 없이도 부모가
 * > 자식 배치를 정할 수 있다. 버린 이유 둘 — (1) 손잡이가 하나 늘고 그것은 D4가 판정을
 * > 미뤄 둔 부류를 키운다, (2) `Field`의 기본 CSS에 `display:flex`를 넣게 되는데 그것은
 * > *"구조가 서기 위한 최소 선언"*이 아니라 스킨이다(§4.3 — 스타일 값은 테마에 있다).
 */
describe('EntryForm:labelTop — DOM이 labelLeft와 같다(발견)', () => {
  it('label·row·actions 조각을 낸다', () => {
    const html = render('EntryForm', 'labelTop', { title: '회원 정보' }, fields(2))
    expect(html).toContain('data-wb-structure="labelTop"')
    expect(countOf(html, 'label')).toBeGreaterThan(0)
    expect(countOf(html, 'row')).toBe(1)
    expect(countOf(html, 'actions')).toBe(1)
  })

  it('labelLeft와 data-wb-structure 하나만 다르다', () => {
    for (const props of [{ title: '' }, { title: '회원 정보' }]) {
      for (const count of [0, 2]) {
        const left = render('EntryForm', 'labelLeft', props, fields(count))
        const top = render('EntryForm', 'labelTop', props, fields(count))

        // 양성 대조: 이름을 지우기 전에는 다르다. 이것이 없으면 아래 단언이
        // "둘 다 폴백이라 같다"로도 설명된다.
        expect(top).not.toBe(left)
        expect(sameDomIgnoringStructureName(top, left), JSON.stringify({ props, count })).toBe(true)
      }
    }
  })

  it('음성 대조 — sectioned는 labelLeft와 DOM이 다르다', () => {
    // 비교 함수가 무엇이든 같다고 하는 것이 아님을 못박는다.
    const left = render('EntryForm', 'labelLeft', { title: '회원 정보' }, fields(2))
    const sectioned = render('EntryForm', 'sectioned', { title: '회원 정보' }, fields(2))
    expect(sameDomIgnoringStructureName(sectioned, left)).toBe(false)
  })
})

/**
 * **`sectioned`는 이 그룹에서 DOM이 실제로 갈리는 셋 중 하나다.**
 *
 * 구획이 몇 개인지 말해 주는 prop이 없다. 그래서 **최상위 자식 하나를 구획 하나로 본다** —
 * 설계서에서 폼을 나눌 때 저자가 실제로 하는 일(필드 묶음을 `Card`·`Flex` 같은 것으로
 * 묶어 넣는 것)과 같은 모양이고, prop을 새로 만들지 않아도 된다.
 */
describe('EntryForm:sectioned — 자식 하나가 구획 하나다', () => {
  it('자식 하나마다 section·sectionTitle을 낸다', () => {
    for (const count of [0, 1, 3]) {
      const html = render('EntryForm', 'sectioned', { title: '회원 정보' }, fields(count))
      expect(countOf(html, 'section'), `${count}`).toBe(count)
      expect(countOf(html, 'sectionTitle'), `${count}`).toBe(count)
    }
  })

  it('구획이 자식을 감싼다 — 구획만 세고 자식을 버리지 않았다', () => {
    const html = render('EntryForm', 'sectioned', {}, fields(2))
    expect(html).toContain('항목1')
    expect(html).toContain('항목2')
    expect(html).toMatch(/data-wb-part="section"/)
  })

  it('labelLeft·labelTop은 section을 내지 않는다 — 대조군', () => {
    for (const structure of ['labelLeft', 'labelTop']) {
      expect(countOf(render('EntryForm', structure, {}, fields(2)), 'section'), structure).toBe(0)
    }
  })

  it('title은 labelLeft와 같은 자리에 남는다', () => {
    // 폼 제목은 구획과 무관하다 — `admin`이 `EntryForm.parts.label`에 스킨을 걸고 있으므로
    // 여기서 이름을 바꾸면 그 스킨이 갈 곳을 잃는다(D5 — 화면이 바뀌면 안 된다).
    //
    // **자식을 달지 않는다.** 자식 `Field`도 `label` 조각을 내므로 자식이 있으면 이 수는
    // 폼의 제목을 세는 것이 아니게 된다 — 처음에 `fields(1)`로 쓰고 `2`를 받았다.
    // (계획서: *"측정이 예상과 다르면 대상이 아니라 측정 장치를 먼저 의심하라."*)
    const html = render('EntryForm', 'sectioned', { title: '회원 정보' }, fields(0))
    expect(html).toContain('회원 정보')
    expect(countOf(html, 'label')).toBe(1)
    expect(render('EntryForm', 'sectioned', { title: '' }, fields(0))).not.toContain(
      'data-wb-part="label"',
    )
  })
})

/**
 * **자식이 있을 때의 전수 가드.** 머리말에 적은 사각을 덮는다 — `structures.test.tsx`의
 * 순회는 자식 없는 노드만 그리므로, 자식을 감싸며 나오는 조각은 거기서 스캔되지 않는다.
 *
 * 검사 셋은 그쪽과 같은 것이다(§6.11의 여섯 속성 · 카탈로그의 `parts` · `style`의 커스텀
 * 프로퍼티만). **분모를 손으로 적지 않는다** — 카탈로그의 `structures`를 훑으므로 이
 * 그룹에 구조가 늘면 자동으로 함께 검사된다.
 */
const CONTRACT_ATTRS = [
  'data-wb-id',
  'data-wb-component',
  'data-wb-structure',
  'data-wb-variant',
  'data-wb-part',
  'data-wb-state',
]

describe('W3 — 자식이 있을 때의 전수 가드', () => {
  /**
   * 이 그룹의 모든 구조 × props 갈래 × 자식 수.
   *
   * **아직 구현이 없는 구조는 건너뛴다.** 폴백에는 inline 일반 선언이 들어 있어(그것은
   * 이름 있는 예외다 — `structures.test.tsx`) 건너뛰지 않으면 미구현 하나가 이 가드 셋을
   * 통째로 붉게 만든다. 무엇이 남았는지는 `structure-coverage.test.ts`가 이름으로 센다.
   */
  function eachRender(visit: (info: { key: string; html: string }) => void): number {
    let renders = 0
    for (const type of INPUT_TYPES) {
      const def = requireComponent(type)
      const defaults = def.props.parse({}) as Record<string, unknown>
      for (const structure of def.structures) {
        if (getStructure(type, structure) === undefined) continue
        for (const props of [defaults, { ...defaults, collapsed: true, title: '제목' }]) {
          if (!def.props.safeParse(props).success) continue
          for (const count of [0, 1, 3]) {
            const html = render(type, structure, props, fields(count))
            // 폴백이 떴으면 그 조합은 그려진 것이 아니다.
            expect(html, `${type}:${structure}`).not.toContain('data-wb-error')
            visit({ key: `${type}:${structure}`, html })
            renders += 1
          }
        }
      }
    }
    return renders
  }

  it('카탈로그에 선언된 part만 낸다', () => {
    const offenders: string[] = []
    let scanned = 0

    const renders = eachRender(({ key, html }) => {
      const [type] = key.split(':') as [string]
      const declared = new Set(requireComponent(type).parts)
      for (const part of partsOf(html)) {
        scanned += 1
        // 자식 `Field`의 조각도 함께 잡히므로 그 컴포넌트의 선언으로 대조한다.
        if (!declared.has(part) && !new Set(requireComponent('Field').parts).has(part)) {
          offenders.push(`${type}: ${part}`)
        }
      }
    })

    expect(renders).toBeGreaterThan(0)
    expect(scanned).toBeGreaterThan(0)
    expect([...new Set(offenders)]).toEqual([])
  })

  it('계약 밖 data-* 속성이 없다', () => {
    const offenders: string[] = []
    let scanned = 0

    eachRender(({ key, html }) => {
      for (const match of html.matchAll(/\s(data-[\w-]+)=/gi)) {
        scanned += 1
        if (!CONTRACT_ATTRS.includes(match[1]!)) offenders.push(`${key}: ${match[1]}`)
      }
    })

    expect(scanned).toBeGreaterThan(0)
    expect([...new Set(offenders)]).toEqual([])
  })

  it('style에 일반 선언이 없다', () => {
    const offenders: string[] = []

    eachRender(({ key, html }) => {
      for (const value of html.matchAll(/\sstyle="([^"]*)"/g)) {
        for (const declaration of value[1]!.split(';').map((part) => part.trim())) {
          if (declaration !== '' && !declaration.startsWith('--')) {
            offenders.push(`${key}: ${declaration}`)
          }
        }
      }
    })

    expect([...new Set(offenders)]).toEqual([])
  })
})
