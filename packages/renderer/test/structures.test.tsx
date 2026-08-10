import { CATALOG_TYPES, defaultStructure, installCatalog, requireComponent } from '@wirebound/schema'
import type { ComponentDef } from '@wirebound/schema'
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

/** zod 내부 표현. 공개 타입에 없으므로 여기서 쓰는 만큼만 적는다. */
interface ZodInternal {
  def?: { type?: string; innerType?: ZodInternal }
  options?: unknown
}

/** 감싼 것(`.default()`·`.optional()`)을 벗겨 안쪽 타입을 본다. */
function unwrap(schema: ZodInternal | undefined): ZodInternal | undefined {
  let cursor = schema
  while (cursor !== undefined) {
    const kind = cursor.def?.type
    if (kind !== 'default' && kind !== 'optional' && kind !== 'nullable') return cursor
    cursor = cursor.def?.innerType
  }
  return undefined
}

/**
 * prop 하나가 가질 만한 값들. **기본값과 다른 가지를 지나가게 하는 것이 목적**이므로
 * 값의 의미가 아니라 **렌더가 갈리는 지점**을 고른다.
 *
 * - enum → 선언된 값 전부 (구조가 값마다 다른 것을 그릴 수 있다)
 * - boolean → 양쪽 (조건부 조각의 가장 흔한 스위치다)
 * - string → 빈 문자열과 찬 문자열 (`props.caption ? … : null` 부류가 여기 걸린다)
 * - array → 빈 배열과 기본값 (목록이 없을 때의 가지)
 * - **수 → `0`·`1`·기본값** (아래)
 *
 * **앞서 여기에 *"수·객체는 흔들지 않는다 — 렌더 갈래를 만들지 않고 범위 제약만 있다"*고
 * 적었고 그 문장은 거짓이었다.** 리뷰가 잡았다. `ListTable`이
 * `Array.from({ length: items })`이므로 **`items: 0`은 렌더 갈래다** — 그 값에서 `<tr>`이
 * 하나도 안 나오고, 그때만 그려지는 조각(빈 상태 표시 따위)이 생기면 **이 순회가 통째로
 * 지나친다.** 실측: `items === 0`일 때만 나오는 조각에 계약 밖 part 이름을 심으니 **0건이
 * 죽었다.**
 *
 * **P4b-1이 셋째 가드(part 이름)를 이 순회에 얹으면서 그 거짓 문장에 기대게 됐다** —
 * 그래서 여기서 고친다. 비용은 **+11 렌더(530 → 541, +2%)**이고 시간 차는 재지 못했다.
 *
 * `0`·`1`을 고른 이유: 대부분의 범위 하한이 그 둘이고(`min(0)`·`min(1)`), 범위를 벗어나는
 * 후보는 `propVariations`의 `safeParse`가 거른다. **상한은 흔들지 않는다** — 큰 수는 렌더
 * 갈래를 만들지 않고 렌더 비용만 늘린다.
 *
 * **객체 prop은 오늘 카탈로그에 없다**(문자열·수·불리언·문자열 배열·키-값 배열이 전부다).
 */
function propCandidates(schema: ZodInternal | undefined, fallback: unknown): unknown[] {
  const inner = unwrap(schema)
  const kind = inner?.def?.type

  if (kind === 'enum' && Array.isArray(inner?.options)) return [...inner.options]
  if (kind === 'boolean') return [true, false]
  if (kind === 'string') return ['', '값']
  if (kind === 'array') return [[], fallback]
  if (kind === 'number') return [...new Set([0, 1, fallback])]
  return [fallback]
}

/**
 * 컴포넌트 하나가 그려질 props 조합들. **한 쌍까지** 기본값에서 흔든다.
 *
 * **앞서는 한 번에 하나만 흔들었고, 그것이 사각이었다** — 리뷰가 실측했다:
 * `selectable && loading`처럼 **두 prop이 동시에** 특정 값일 때만 그려지는 조각에 계약 밖
 * part 이름을 심으니 **0건이 죽었다.** 한 번에 하나만 흔들면 그런 가지에 절대 닿지 않는다.
 *
 * **비용을 재고 넓혔다**(중앙값 7회, 워밍업 뒤):
 *
 * | 조합 | 렌더 | 시간 |
 * |---|---|---|
 * | 하나씩(옛 판) | 530 | 5ms |
 * | 하나씩 + 수를 흔든다 | 541 | 4ms |
 * | **쌍까지 + 수를 흔든다(지금)** | **2749** | **26ms** |
 *
 * 가드 셋이 이 순회를 쓰므로 회귀 1회에 약 8200 렌더·80ms다. **전체 회귀가 18초이므로
 * 0.4%**이고, 구조가 26개 늘어도(19 → 45) 그 비례로 200ms 남짓이다.
 *
 * **지금 넓히는 것이 P4b-2 뒤보다 싸다** — 그쪽이 구조 26개를 만들며 두 prop 조건을
 * 만들면 이 가드가 **조용히** 놓친다. P4a-3의 *"발견된 것만 닫으면 매번 하나가 남는다"*와
 * 같은 판단이다.
 *
 * **셋 이상은 넓히지 않았다.** 쌍에서 이미 5배이고, 세 개 동시 조건은 오늘 카탈로그에
 * 없으며 **그 사각은 열어 둔 채로 적어 둔다**(이월 문서).
 *
 * **중복은 걷는다** — 쌍 순회가 `(a 변화, b 기본)` 꼴로 하나씩 판을 다시 만들어서다.
 */
function propVariations(def: ComponentDef): Record<string, unknown>[] {
  const defaults = def.props.parse({}) as Record<string, unknown>
  const shape = (def.props as unknown as { shape?: Record<string, ZodInternal> }).shape ?? {}
  const names = Object.keys(shape)

  const seen = new Set<string>()
  const out: Record<string, unknown>[] = []
  const add = (candidate: Record<string, unknown>): void => {
    // 범위 제약에 걸리는 조합은 건너뛴다(렌더러가 폴백을 그릴 뿐이다).
    if (!def.props.safeParse(candidate).success) return
    const key = JSON.stringify(candidate)
    if (seen.has(key)) return
    seen.add(key)
    out.push(candidate)
  }

  add(defaults)
  for (const name of names) {
    for (const value of propCandidates(shape[name], defaults[name])) {
      add({ ...defaults, [name]: value })
    }
  }
  for (let i = 0; i < names.length; i += 1) {
    for (let j = i + 1; j < names.length; j += 1) {
      const first = names[i]!
      const second = names[j]!
      for (const a of propCandidates(shape[first], defaults[first])) {
        for (const b of propCandidates(shape[second], defaults[second])) {
          add({ ...defaults, [first]: a, [second]: b })
        }
      }
    }
  }
  return out
}

function captures(html: string, pattern: RegExp): string[] {
  return [...html.matchAll(pattern)].map((match) => match[1]!)
}

/**
 * 등록된 모든 구조를 **비기본 props로** 그려 콜백에 넘긴다. 렌더 횟수를 돌려준다.
 *
 * **가드 셋이 이 순회를 함께 쓴다** — `data-*` 계약, `style` 일반 선언, **part 이름 계약**.
 * P4a-2가 앞의 둘을 옮길 때 `data-*` 쪽만 먼저 옮기고 `style` 쪽을 기본 props로 남겨 뒀는데,
 * **조건부 조각에 inline `color:red`를 심으니 1220 케이스가 통과했다**(재현했다). 그것은
 * 그 계획이 닫으려던 결함(P0 이월 #7) 그 자체다.
 *
 * **셋째(part 이름)는 P4b-1이 옮겼다 — 같은 부류가 한 번 더 남아 있었다.** 조건부 조각이
 * 카탈로그에 없는 part 이름을 내도 **0건이 죽었다**(실측, 대조군은 2건). 그것이 P0 이월
 * #10이고, "계획이 재지 않은 것 #5"가 *"이미 닫혔을 수 있다"*고 적은 자리다 — **절반만
 * 닫혀 있었다.**
 *
 * **순회를 하나로 모으면 그 자리가 생기지 않는다.**
 */
function forEachVariation(visit: (rendered: { key: string; html: string }) => void): number {
  const keys = listStructureKeys()
  // 목록이 비면 순회가 안 돌고 부르는 쪽이 그냥 초록이 된다.
  expect(keys.length).toBeGreaterThan(0)

  let renders = 0
  for (const key of keys) {
    const [type, structure] = key.split(':') as [string, string]
    const def = requireComponent(type)

    for (const props of propVariations(def)) {
      // 선언된 변형 전부 + 변형 없음.
      for (const variant of [undefined, ...def.variants]) {
        const node = { id: 'n_000000000001', type, props, ...(variant === undefined ? {} : { variant }) }
        visit({ key, html: renderToStaticMarkup(renderNode(node, { structures: { [type]: structure } })) })
        renders += 1
      }
    }
  }
  return renders
}

describe('part 계약', () => {
  /**
   * **P0 이월 #10 — 이 가드가 기본 props로만 훑고 있었다. P4b-1이 닫는다.**
   *
   * P4a-2가 `data-*` 계약과 `style` 가드를 `forEachVariation`으로 옮기면서 **part 이름
   * 계약은 기본 props에 남겨 두었다.** 그래서 **조건부로만 그려지는 조각**(`Media.caption`·
   * `Card.subtitle`·`Field.help`·`List.item`/`media`/`title`/`meta`·`EntryForm.label`/`control`)이
   * 카탈로그에 없는 이름을 내도 아무도 보지 못했다.
   *
   * **실측(P4b-1이 심어 확인했다):**
   *
   * | 심은 것 | 죽은 수 |
   * |---|---|
   * | 조건부 조각(`Media.caption`)이 선언되지 않은 part 이름을 낸다 | **0** |
   * | 늘 그려지는 조각(`Media.frame`)에 같은 변조 — 대조군 | 2 |
   *
   * **P4b-2가 구조 26개를 만들기 직전이라 지금이 가장 싸다** — 그쪽이 만드는 구조마다
   * 조건부 조각이 늘어난다. P0 이월이 든 `EntryFormLabelLeft`의 압력(폼의 `title`을
   * `part('label')` 안에 렌더한다)도 같은 부류다.
   */
  it('모든 컴포넌트가 카탈로그에 선언된 part만 낸다 — 비기본 props로 전수', () => {
    const offenders: string[] = []
    let scanned = 0

    const renders = forEachVariation(({ key, html }) => {
      const [type] = key.split(':') as [string]
      const declared = new Set(requireComponent(type).parts)
      for (const part of captures(html, /data-wb-part="([^"]*)"/g)) {
        scanned += 1
        if (!declared.has(part)) offenders.push(`${type}: ${part}`)
      }
    })

    // 셋 다 못을 박는다 — 하나라도 0이면 위 순회가 헛돈 것이다.
    expect(renders).toBeGreaterThan(100)
    expect(scanned).toBeGreaterThan(0)
    expect([...new Set(offenders)]).toEqual([])
  })

  /**
   * **비기본 props로도 훑는다.**
   *
   * 아래 기본 props 스캔은 **조건부로만 그려지는 조각을 보지 못한다**(P0 이월 #10이 지적한
   * 한계다 — `Media.caption`·`Card.subtitle`·`Field.help` 따위는 값이 있을 때만 나온다).
   * 원문 가드(`contract-attrs.test.ts`)가 그 사각을 덮을 것으로 기대했는데 **덮지 못한다** —
   * 그쪽은 문자열 안의 `//`를 주석으로 보고 그 줄의 나머지를 지운다. **두 사각의 교집합이
   * 비어 있지 않았다:** 조건부 `<figcaption>`에 `{...{ 'x://y': '', 'data-wb-bad': '1' }}`를
   * 심으니 **두 가드가 다 통과했다**(재서 확인했다).
   *
   * 그래서 여기서 props를 흔든다. **완전 조합이 아니라 한 번에 한 prop만** 바꾼다 —
   * 조합 폭발 없이 "그 값일 때만 그려지는 가지"를 전부 지나가는 것이 목적이다.
   */
  it('비기본 props로 전수 렌더해도 계약 밖 data-* 속성이 없다', () => {
    const offenders: string[] = []
    let scanned = 0

    const renders = forEachVariation(({ key, html }) => {
      // 폴백이 떴으면 그 조합은 렌더된 것이 아니다 — 조용히 지나가지 않게 잡는다.
      if (html.includes('data-wb-error')) {
        offenders.push(`${key}: 폴백`)
        return
      }
      for (const attr of captures(html, /\s(data-[\w-]+)=/gi)) {
        scanned += 1
        if (!CONTRACT_ATTRS.includes(attr)) offenders.push(`${key}: ${attr}`)
      }
    })

    // 셋 다 못을 박는다 — 하나라도 0이면 위 순회가 헛돈 것이다.
    expect(renders).toBeGreaterThan(100)
    expect(scanned).toBeGreaterThan(0)
    expect([...new Set(offenders)]).toEqual([])
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
    const offenders: string[] = []
    let scanned = 0

    // **`data-*` 계약 가드와 같은 순회를 쓴다.** 앞서 여기만 기본 props로 남아 있었고,
    // 조건부 조각(`Media.caption`처럼 값이 있을 때만 그려지는 자리)에 inline `color:red`를
    // 심으면 **1220 케이스가 전부 통과했다** — 재현해서 확인했다. 그 자리가
    // **P0 이월 #7 그 자체**이므로 순회를 갈라 둘 이유가 없다.
    const renders = forEachVariation(({ key, html }) => {
      for (const declaration of styleDeclarations(html)) {
        scanned += 1
        if (!declaration.startsWith('--')) offenders.push(`${key}: ${declaration}`)
      }
    })

    expect(renders).toBeGreaterThan(100)
    // 선언을 하나도 못 모으면 위 검사가 헛돈다 — 구조가 커스텀 프로퍼티를 내는 한 0이 아니다.
    expect(scanned).toBeGreaterThan(0)
    expect([...new Set(offenders)]).toEqual([])
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

/**
 * **재라 #6 — `Media.kind`는 오늘 죽어 있다. 지우지 않고 그 사실을 케이스로 고정한다.**
 *
 * `Media`의 `kind` prop과 `structures`가 **같은 이름 넷**이다(`image`·`video`·
 * `illustration`·`chart`). 하나는 노드가 정하고 하나는 **테마가 고른다.**
 *
 * **실측: `MediaImage`가 `props.kind`를 한 번도 읽지 않는다**(`ratio`·`caption`만 쓴다).
 * `kind`는 §6.11의 여섯 속성 어디에도 실리지 않으므로 **구조 구현체 안에서만 쓰일 수
 * 있는데 쓰이지 않는다.**
 *
 * > **이것은 "조용히 틀린다" 부류다.** 속성 패널에 `종류` 컨트롤이 **있고**, 사용자가
 * > `video`를 고르면 문서에 저장되고 검증도 통과하는데 **화면은 아무것도 바뀌지 않는다.**
 * > 이슈도 0건이다.
 *
 * **지우지 않는 이유 둘.**
 *
 * 1. **P4b-2가 `Media` 구조 넷을 만든다. 그 질문의 답은 거기서 나온다** — `MediaVideo`가
 *    `MediaImage`와 다르게 그리면 `kind`는 구조와 중복이라 지우는 것이 맞고, 구조들이
 *    `kind`를 읽을 일이 있으면 남는다. **구조가 없는 지금 정하는 것은 근거 없이 정하는 것이다.**
 * 2. `Media.props`가 `z.strictObject`라 prop을 빼는 것은 **문서 마이그레이션이 필요한
 *    파괴적 변경**이다(§13.1). 스키마 버전을 올리는 일을 어휘 슬라이스에서 하지 않는다.
 *
 * **`variantFrom`으로 접지도 않았다** — 그러면 `data-wb-variant`와 `data-wb-structure`가
 * **같은 값**이 되는데 설계가 그 상태를 말하지 않는다(P4a-2가 접지 않은 이유 그대로).
 *
 * **P4b-2가 이것을 깨면서 고치게 된다.**
 */
describe('재라 #6 — Media.kind는 렌더에 닿지 않는다', () => {
  const KINDS = ['image', 'video', 'illustration', 'chart'] as const

  function render(kind: string): string {
    return renderToStaticMarkup(
      renderNode({ id: 'n_000000000001', type: 'Media', props: { kind, ratio: '16/9', caption: '' } }),
    )
  }

  it('카탈로그가 kind와 structures를 같은 이름 넷으로 갖는다 — 카나리아', () => {
    const def = requireComponent('Media')
    expect(def.structures).toEqual([...KINDS])
    expect(def.editor.some((field) => field.prop === 'kind')).toBe(true)
  })

  it('kind를 바꿔도 렌더 결과가 글자까지 같다', () => {
    // **이것이 "죽어 있다"의 실행 가능한 형태다.** 구조 구현체가 그 값을 읽기 시작하면
    // 여기가 먼저 죽는다.
    const baseline = render('image')
    for (const kind of KINDS) {
      expect(render(kind), kind).toBe(baseline)
    }
  })

  it('kind가 data-wb-variant로 나가지 않는다', () => {
    // `Media`는 `variantFrom`을 갖지 않으므로 그 속성 자체가 안 나온다. §6.11의 여섯
    // 속성 계약을 넓히지 않았다는 것이기도 하다.
    for (const kind of KINDS) {
      expect(render(kind), kind).not.toContain('data-wb-variant')
    }
  })

  it('노드가 video라고 적어도 data-wb-structure는 image다', () => {
    // **어긋남이 가장 선명하게 보이는 자리다.** 노드가 정한 `kind`와 테마(오늘은 기본값)가
    // 고른 구조가 **같은 이름 공간**인데 서로를 모른다. 사용자가 "동영상"을 골랐는데
    // 그려지는 것은 이미지 구조다 — 그리고 이슈가 0건이다.
    expect(render('video')).toContain('data-wb-structure="image"')
  })

  it('음성 대조 — ratio는 실제로 렌더에 닿는다', () => {
    // 이 케이스가 없으면 위 둘이 "Media가 아무것도 안 그린다"로도 설명된다.
    const wide = renderToStaticMarkup(
      renderNode({ id: 'n_000000000001', type: 'Media', props: { ratio: '16/9' } }),
    )
    const square = renderToStaticMarkup(
      renderNode({ id: 'n_000000000001', type: 'Media', props: { ratio: '1/1' } }),
    )

    expect(wide).not.toBe(square)
    expect(square).toContain('1/1')
  })

  it('구조 넷 중 구현이 있는 것은 image 하나다 — P4b-2가 채운다', () => {
    // **테마가 나머지 셋을 고르면 폴백이 그려진다.** `kind`의 답이 P4b-2에서 나오는
    // 이유가 이것이다 — 그쪽이 셋을 만들 때 각자 `kind`를 읽을지 정하게 된다.
    const implemented = KINDS.filter((structure) => getStructure('Media', structure) !== undefined)

    expect(implemented).toEqual(['image'])
  })
})
