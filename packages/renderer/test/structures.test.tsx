import { CATALOG_TYPES, defaultStructure, installCatalog, requireComponent } from '@wirebound/schema'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { renderNode } from '../src/render'
import { installStructures } from '../src/structures/index'
import { getStructure, listStructureKeys } from '../src/structures/registry'

beforeAll(() => {
  installCatalog()
  installStructures()
})

describe('기본 구조 구현체', () => {
  it('카탈로그의 모든 컴포넌트가 기본 구조 구현을 갖는다', () => {
    for (const type of CATALOG_TYPES) {
      const structure = defaultStructure(requireComponent(type))
      expect(getStructure(type, structure), `${type}:${structure}`).toBeDefined()
    }
  })

  it('모든 컴포넌트를 기본 props로 그릴 수 있다', () => {
    for (const type of CATALOG_TYPES) {
      const html = renderToStaticMarkup(renderNode({ id: 'n_000000000001', type }))
      expect(html, type).toContain(`data-wb-component="${type}"`)
    }
  })

  it('두 번 설치해도 던지지 않는다', () => {
    expect(() => installStructures()).not.toThrow()
  })
})

/** 렌더러가 테마에 노출하기로 한 속성 계약 전부. 설계 문서 §6.11 */
const CONTRACT_ATTRS = [
  'data-wb-id',
  'data-wb-component',
  'data-wb-structure',
  'data-wb-variant',
  'data-wb-part',
  'data-wb-state',
]

/**
 * 계약 밖인데 지금 실제로 나오는 속성. **비었다** — P0 이월 #8이 닫혔다.
 *
 * 셋(`data-wb-role`·`data-control`·`data-direction`)은 전부 `variantFrom`으로
 * `data-wb-variant`에 접혔다. 목록을 지우지 않고 빈 채로 두는 것은 **다음에 부채가
 * 생기면 여기 이름이 적히게** 하려는 것이다.
 */
const DEFERRED_NON_CONTRACT_ATTRS: string[] = []

function renderDefault(type: string): string {
  return renderToStaticMarkup(renderNode({ id: 'n_000000000001', type }))
}

function captures(html: string, pattern: RegExp): string[] {
  return [...html.matchAll(pattern)].map((match) => match[1]!)
}

describe('part 계약', () => {
  it('모든 컴포넌트가 카탈로그에 선언된 part만 낸다', () => {
    // 검사가 전부 루프 안에 있다. part가 하나도 안 나오면 단언 없이 통과하므로 못을 박는다.
    expect.hasAssertions()
    for (const type of CATALOG_TYPES) {
      const declared = new Set(requireComponent(type).parts)
      for (const part of captures(renderDefault(type), /data-wb-part="([^"]*)"/g)) {
        expect(declared.has(part), `${type}: 카탈로그에 없는 part "${part}"`).toBe(true)
      }
    }
  })

  it('계약 밖 data-* 속성이 하나도 없다', () => {
    const found = new Set<string>()
    let scanned = 0
    for (const type of CATALOG_TYPES) {
      // React는 `data-wbFoo`처럼 대문자·밑줄이 섞인 이름도 그대로 내보낸다.
      // 소문자·하이픈만 훑으면 그런 속성이 검사를 그냥 빠져나간다.
      for (const attr of captures(renderDefault(type), /\s(data-[\w-]+)=/gi)) {
        scanned += 1
        if (!CONTRACT_ATTRS.includes(attr)) found.add(attr)
      }
    }
    // **allowlist가 비었으므로 검사가 실제로 도는지 못을 박는다.** 정규식이 아무것도
    // 잡지 못해도 `found`는 비고, 그러면 이 케이스는 아무것도 지키지 않는 초록이 된다.
    expect(scanned).toBeGreaterThan(0)
    expect([...found].sort()).toEqual(DEFERRED_NON_CONTRACT_ATTRS)
  })
})

/** 렌더된 HTML에서 모든 `style` 속성의 선언을 뽑는다. */
function styleDeclarations(html: string): string[] {
  return captures(html, /\sstyle="([^"]*)"/g)
    .flatMap((value) => value.split(';'))
    .map((declaration) => declaration.trim())
    .filter((declaration) => declaration !== '')
}

describe('구조는 style에 커스텀 프로퍼티만 싣는다 (P0 이월 #7)', () => {
  /**
   * **일반 선언은 모든 셀렉터를 이기므로 테마가 `!important` 없이는 진다.** 그것이
   * P0 이월 #7의 본체이고, `structure-css.test.ts`가 그 캐스케이드를 실제로 쟀다.
   *
   * 아래 두 케이스가 **쌍으로** 있어야 하는 이유: 이 케이스만 있으면 값을 그냥 지워도
   * 초록이 된다. 값이 여전히 나가는 것은 `structure-css.test.ts`의 계산된 스타일
   * 케이스가 지킨다.
   */
  it('Flex는 style에 커스텀 프로퍼티만 싣는다', () => {
    const html = renderToStaticMarkup(
      renderNode({
        id: 'n_000000000001',
        type: 'Flex',
        props: { direction: 'column', align: 'center', justify: 'between', wrap: true },
      }),
    )
    const declarations = styleDeclarations(html)
    expect(declarations.length).toBeGreaterThan(0)
    expect(declarations.filter((declaration) => !declaration.startsWith('--'))).toEqual([])
  })

  it('Grid는 style에 커스텀 프로퍼티만 싣는다', () => {
    const html = renderToStaticMarkup(
      renderNode({ id: 'n_000000000001', type: 'Grid', props: { columns: 3 } }),
    )
    const declarations = styleDeclarations(html)
    expect(declarations.length).toBeGreaterThan(0)
    expect(declarations.filter((declaration) => !declaration.startsWith('--'))).toEqual([])
  })

  /**
   * **전수 가드.** Task 2·3은 다섯 구조를 손으로 고쳤다. 이 케이스는 **P4b가 구조를 늘릴
   * 때 같은 실수가 반복되지 않게 한다** — 등록된 모든 구조를 기본 props로 그려 `style`에
   * 일반 선언이 하나라도 남으면 어느 구조인지와 함께 실패한다.
   *
   * 위의 개별 케이스들을 대신하지 않는다. 이것은 **일반 선언이 없다**만 보고, 값이 여전히
   * 나가는 것은 `structure-css.test.ts`의 계산된 스타일 케이스가 본다.
   */
  it('어떤 구조도 style에 일반 선언을 내지 않는다', () => {
    const keys = listStructureKeys()
    // 목록이 비면 루프가 안 돌고 그냥 초록이 된다.
    expect(keys.length).toBeGreaterThan(0)

    const offenders: string[] = []
    for (const key of keys) {
      const [type, structure] = key.split(':') as [string, string]
      const html = renderToStaticMarkup(
        renderNode({ id: 'n_000000000001', type }, { structures: { [type]: structure } }),
      )
      for (const declaration of styleDeclarations(html)) {
        if (!declaration.startsWith('--')) offenders.push(`${key}: ${declaration}`)
      }
    }
    expect(offenders).toEqual([])
  })

  /**
   * **재라 #3 — 폴백의 inline style은 걷어내지 않고 이름 있는 예외로 둔다.**
   *
   * 판정 근거 셋:
   *
   * 1. **테마의 대상이 아니다.** 테마가 스타일할 수 있는 것은 카탈로그가 선언한 컴포넌트와
   *    그 `parts`뿐이고(§5.1) 폴백은 그 목록에 없다. 즉 **폴백을 겨냥하는 테마 규칙이
   *    존재할 수 없으므로 캐스케이드에서 이길 것도 질 것도 없다** — 위 가드가 막으려는
   *    사고(테마가 진다)가 여기서는 성립하지 않는다.
   * 2. **걷어내면 실제로 나빠진다.** 폴백은 *"노드를 그리지 못했다"*를 **눈에 보이게**
   *    하려고 있는 것이다(P0 이월 #6). 스타일을 빼면 테두리도 색도 없는 맨 텍스트가 되어,
   *    이 프로젝트가 반복해 겪은 *"화면이 조용히 비었다"* 부류로 돌아간다.
   * 3. **테마와 무관하게 같은 모습이어야 한다.** 어느 테마에서든 오류 표시는 오류 표시로
   *    읽혀야 하고, 그것을 보장하는 방법이 inline 선언이다.
   *
   * 그래서 아래 케이스가 **예외를 이름으로 고정한다.** 누가 폴백의 스타일을 걷어내면
   * 이 케이스가 깨지고, 그때 위 판정을 다시 읽게 된다.
   */
  it('폴백만 일반 선언을 낸다 — 이름 있는 예외', () => {
    // 카탈로그에 없는 타입이라 폴백이 그려진다.
    const html = renderToStaticMarkup(renderNode({ id: 'n_000000000001', type: '없는컴포넌트' }))
    expect(html).toContain('data-wb-error')

    const plain = styleDeclarations(html).filter((declaration) => !declaration.startsWith('--'))
    expect(plain.length).toBeGreaterThan(0)
  })

  it('Tree·Media·Placeholder도 style에 커스텀 프로퍼티만 싣는다', () => {
    const cases: [type: string, props: Record<string, unknown>][] = [
      ['Tree', { items: ['가', '나', '다', '라'], depth: 3 }],
      ['Media', { ratio: '4/3' }],
      ['Placeholder', { height: 240 }],
    ]
    for (const [type, props] of cases) {
      const declarations = styleDeclarations(
        renderToStaticMarkup(renderNode({ id: 'n_000000000001', type, props })),
      )
      expect(declarations.length, type).toBeGreaterThan(0)
      expect(declarations.filter((declaration) => !declaration.startsWith('--')), type).toEqual([])
    }
  })
})

describe('개별 구조', () => {
  it('Text는 role을 그대로 내려보낸다', () => {
    const html = renderToStaticMarkup(
      renderNode({ id: 'n_000000000001', type: 'Text', props: { content: '제목', role: 'h1' } }),
    )
    expect(html).toContain('<h1')
    expect(html).toContain('제목')
  })

  it('List는 컬럼 수만큼 헤더 셀을 낸다', () => {
    const html = renderToStaticMarkup(
      renderNode({
        id: 'n_000000000001',
        type: 'List',
        props: { columns: ['가', '나', '다'], items: 2 },
      }),
    )
    expect(html.match(/data-wb-part="cell"/g)).toHaveLength(3 + 3 * 2)
  })

  it('List는 items 수만큼 행을 내고 짝수·홀수 행 조각을 번갈아 쓴다', () => {
    const html = renderToStaticMarkup(
      renderNode({ id: 'n_000000000001', type: 'List', props: { items: 4 } }),
    )
    expect(html.match(/data-wb-part="row"/g)).toHaveLength(2)
    expect(html.match(/data-wb-part="rowAlt"/g)).toHaveLength(2)
  })

  it('Button은 라벨을 낸다', () => {
    const html = renderToStaticMarkup(
      renderNode({ id: 'n_000000000001', type: 'Button', props: { label: '저장' } }),
    )
    expect(html).toContain('저장')
  })

  it('Button의 disabled는 상태 속성으로 나온다', () => {
    const html = renderToStaticMarkup(
      renderNode({ id: 'n_000000000001', type: 'Button', props: { disabled: true } }),
    )
    expect(html).toContain('data-wb-state="disabled"')
  })

  it('Field는 라벨과 컨트롤 조각을 낸다', () => {
    const html = renderToStaticMarkup(
      renderNode({ id: 'n_000000000001', type: 'Field', props: { label: '아이디' } }),
    )
    expect(html).toContain('data-wb-part="label"')
    expect(html).toContain('data-wb-part="control"')
    expect(html).toContain('아이디')
  })

  it('Grid는 열 수를 CSS 변수로 낸다', () => {
    const html = renderToStaticMarkup(
      renderNode({ id: 'n_000000000001', type: 'Grid', props: { columns: 3 } }),
    )
    // 이름이 `--wb-grid-columns`에서 바뀌었다. 옛 이름은 테마가 `primitives.grid.columns`에서
    // 만드는 변수 이름과 **정확히 같았다** — 근거는 `src/structure-css.ts`의 `NODE_VAR_PREFIX`.
    expect(html).toContain('--wb-node-grid-columns:3')
  })

  it('KeyValue는 키와 값 조각을 낸다', () => {
    const html = renderToStaticMarkup(
      renderNode({
        id: 'n_000000000001',
        type: 'KeyValue',
        props: { pairs: [{ key: '이름', value: '홍길동' }] },
      }),
    )
    expect(html).toContain('data-wb-part="key"')
    expect(html).toContain('홍길동')
  })

  it('Slot은 주입된 내용을 낸다', () => {
    const html = renderToStaticMarkup(
      renderNode({ id: 'n_000000000001', type: 'Slot' }, { slot: <span>주입됨</span> }),
    )
    expect(html).toContain('주입됨')
  })
})
