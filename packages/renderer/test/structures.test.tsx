import { CATALOG_TYPES, defaultStructure, installCatalog, requireComponent } from '@wirebound/schema'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { renderNode } from '../src/render'
import { installStructures } from '../src/structures/index'
import { getStructure } from '../src/structures/registry'

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
 * 계약 밖인데 지금 실제로 나오는 속성. **승인된 어휘가 아니라 남은 부채다.**
 * - `data-wb-role`: Text (structures/document.tsx)
 * - `data-control`: Field (structures/input.tsx)
 * - `data-direction`: Divider (structures/document.tsx)
 *
 * 테마 규격을 확정하는 P4a에서 계약 어휘로 흡수하거나 없앤다.
 * 아래 검사는 이 목록과 **정확히 같을 때만** 통과한다. 새 구조가 계약 밖 속성을 내면 깨지고,
 * 셋 중 하나를 정리해도 깨진다 — 목록이 실제 상태를 계속 정직하게 가리키게 하려는 것이다.
 */
const DEFERRED_NON_CONTRACT_ATTRS = ['data-control', 'data-direction', 'data-wb-role']

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

  it('계약 밖 data-* 속성은 P4a로 미뤄둔 셋뿐이다', () => {
    const found = new Set<string>()
    for (const type of CATALOG_TYPES) {
      // React는 `data-wbFoo`처럼 대문자·밑줄이 섞인 이름도 그대로 내보낸다.
      // 소문자·하이픈만 훑으면 그런 속성이 검사를 그냥 빠져나간다.
      for (const attr of captures(renderDefault(type), /\s(data-[\w-]+)=/gi)) {
        if (!CONTRACT_ATTRS.includes(attr)) found.add(attr)
      }
    }
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
