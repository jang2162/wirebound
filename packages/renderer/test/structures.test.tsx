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
 * 그래서 여기서 고친다. 비용은 **+11 렌더(390 → 401, +2.8%)**이고 시간 차는 재지 못했다.
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
 * | 조합 | 조합 수 × 변형 = 렌더 |
 * |---|---|
 * | 하나씩(옛 판) | 390 |
 * | 하나씩 + 수를 흔든다 | 401 |
 * | **쌍까지 + 수를 흔든다(지금)** | **1408**(3.5배) |
 *
 * 가드 셋이 이 순회를 쓰므로 회귀 1회에 **4224 렌더**다. **실제 케이스 시간**은
 * part 47ms · `data-*` 26ms · `style` 13ms = **약 86ms**이고(중앙값 3회), 전체 회귀가
 * 18초이므로 **0.5% 미만**이다. 구조가 26개 늘면(19 → 45) 그 비례로 200ms 남짓이 된다.
 *
 * > **P4b-2 ③이 다시 쟀다 — 위 예측이 맞았다.** 구조 45개 · 자식 순회까지 넣고
 * > 순회 1회 **3902 렌더**(가드 셋이면 11706), 케이스 시간 **88 + 40 + 40 ≈ 168ms**
 * > (중앙값 3회). 전체 회귀 19초의 **0.9%**다. 예측한 "200ms 남짓"의 범위 안이다.
 * > **자식 순회가 더한 몫은 그중 작다** — 자식 없이 세면 3756이므로 **+146(+3.9%)**뿐이다.
 * > 자식을 받는 컴포넌트가 8개이고 그것들이 대체로 props가 적어서다.
 *
 * > **이 수를 다시 잴 때는 `add`의 dedup이 켜져 있는지부터 확인하라.** 앞 판은 **dedup을
 * > 넣기 전에 재고 다시 재지 않아** 530 / 541 / 2749(·가드 셋 *"약 8200"*)를 적었다 —
 * > **dedup만 끄면 그 셋이 그대로 재현되고 가드 셋은 8247이다.** 조합을 넓히는 변경과
 * > 중복을 걷는 변경이 같은 커밋에 있으면 이 실수가 난다.
 *
 * **렌더 시간과 케이스 시간은 다르다** — 위 표는 렌더만 센 것이고, 가드는 그 위에
 * 정규식 스캔을 얹는다. 판정에 쓸 값은 **케이스 시간**이다.
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
 *
 * ---
 *
 * **넷째 사각 — 이 순회가 자식 있는 노드를 한 번도 그리지 않았다. P4b-2 ③이 닫는다.**
 *
 * P4b-2 ②의 W3이 찾았다. 여기서 만드는 노드에 `children`이 없으므로 `renderNode`가
 * 자식을 `null`로 만들고, **자식을 감싸며 생기는 조각은 순회에 나오지 않는다.**
 * `SearchForm:stacked`의 `row`, `EntryForm:sectioned`의 `section`·`sectionTitle`,
 * `Card:horizontal`의 `content`가 그 부류다 — 자식이 있어야만 그려진다.
 *
 * **실측(③이 심어 확인했다):** `EntryFormSectioned`가 자식마다 감싸는 조각에 위반 셋을
 * 한꺼번에 심었다 — 선언 안 된 part 이름 · 계약 밖 `data-wb-bogus` · inline `color: red`.
 *
 * | 자식 | 이 파일의 가드 27건 |
 * |---|---|
 * | 안 단다(전) | **0 죽음 — 27건 전부 초록** |
 * | 단다(후) | 3 죽음 (가드 셋이 각각 하나씩) |
 *
 * W3은 자기 그룹만 덮는 케이스를 따로 뒀는데(`structures-input.test.tsx`), 그 방식은
 * **그룹마다 같은 파일을 다시 쓰게 하고 새 그룹이 생기면 또 빠진다.** 순회 자체에 자식을
 * 다는 편이 낫다는 그쪽 제안을 그대로 따랐다.
 *
 * **자식 있는 판과 없는 판을 둘 다 돈다.** 자식이 **없을 때만** 그려지는 가지(빈 상태
 * 자리 표시자 따위)가 있으므로 없는 판을 버리면 그쪽이 사각이 된다. 자식을 받는 컴포넌트는
 * 8개뿐이라(카탈로그: `many` 8 · `none` 11) 비용도 그만큼만 는다.
 *
 * **자식은 `Text`다** — 잎이라 재귀가 깊어지지 않고, 자식 자신의 조각이 부모의 조각과
 * 섞여 오탐을 만들지 않는다(`Text`는 `parts`가 비어 있다). **둘을 다는 것은** 자식마다
 * 조각을 내는 구조에서 `Children.map`의 인덱스 갈래(`row`/`rowAlt` 같은 교대)가 한 번은
 * 지나가게 하려는 것이다.
 */
function forEachVariation(visit: (rendered: { key: string; html: string }) => void): number {
  const keys = listStructureKeys()
  // 목록이 비면 순회가 안 돌고 부르는 쪽이 그냥 초록이 된다.
  expect(keys.length).toBeGreaterThan(0)

  // 잎이고 `parts`가 비어 있다 — 자식이 부모의 조각 스캔을 오염시키지 않는다.
  const kids = [
    { id: 'n_00000000000c', type: 'Text' },
    { id: 'n_00000000000d', type: 'Text' },
  ]

  let renders = 0
  for (const key of keys) {
    const [type, structure] = key.split(':') as [string, string]
    const def = requireComponent(type)
    // 자식을 못 받는 컴포넌트에 자식을 달면 검증이 막아 폴백이 그려진다 — 그 판은 돌지 않는다.
    const childSets: (typeof kids | undefined)[] =
      def.children === 'none' ? [undefined] : [undefined, kids]

    for (const props of propVariations(def)) {
      // 선언된 변형 전부 + 변형 없음.
      for (const variant of [undefined, ...def.variants]) {
        for (const children of childSets) {
          const node = {
            id: 'n_000000000001',
            type,
            props,
            ...(variant === undefined ? {} : { variant }),
            ...(children === undefined ? {} : { children }),
          }
          visit({ key, html: renderToStaticMarkup(renderNode(node, { structures: { [type]: structure } })) })
          renders += 1
        }
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
 * **재라 #6 판정 (P4b-2 W4) — `Media.kind`는 지우지 않는다. `kind`는 구조와 중복이 아니다.**
 *
 * P4a-2가 이 절을 *"오늘 죽어 있다"*로 열어 두고 답을 P4b-2에 넘겼다. 계획서 D3이 판정
 * 기준을 이렇게 적었다 — *"넷이 서로 다르게 그리면 `kind`는 구조와 중복이니 지우는 것이
 * 맞다."* **W4가 구조 넷을 만들고 재 보니 그 전제가 서지 않는다.**
 *
 * ### 관찰 (전부 실측)
 *
 * | # | 무엇 | 값 |
 * |---|---|---|
 * | 1 | 구조 넷의 DOM이 서로 다른가 | **다르다** — 정규화 후 집합 크기 4(폴백 가드 포함). `image`=빈 틀 · `video`=+`play` · `illustration`=+`glyph` · `chart`=+`plot`+`legend` |
 * | 2 | 넷 중 하나라도 `props.kind`를 읽는가 | **아니다** — 아래 *"`kind`를 바꿔도 …"*가 여전히 초록이다 |
 * | 3 | 구조를 고르는 단위 | **컴포넌트 타입**이다(`resolveStructureOf`가 `options.structures[def.type]`를 읽는다) |
 *
 * ### 판정
 *
 * **1은 D3의 전제를 만족하지만 결론이 따라 나오지 않는다.** 3 때문이다 — 지우면 **한
 * 페이지에 이미지와 영상을 같이 놓을 수 없다.** 그러면 §5의 *"`Media` = 이미지·영상·
 * 일러스트·차트 영역"*이 **실행 불가능해진다.** `kind`가 구조와 중복인 것이 아니라,
 * **구조 선택이 노드 단위가 아닌 것**이 결함이다. 3은 `Media`만의 것이 아니므로
 * `test/structure-selection.test.ts(x)`에 모델의 사실로 따로 고정했다.
 *
 * **`variantFrom`으로 접지도 않는다.** `data-wb-variant="video"`가 `data-wb-structure="image"`
 * 위에 실릴 뿐 DOM은 여전히 `image`다(`play`가 없다) — *"조용히 틀린다"*가 *"시끄럽게
 * 어긋난다"*가 될 뿐이고, 오늘 비어 있는 `Media.variants`를 태워 없앤다.
 *
 * ### 삭제 비용 (실측)
 *
 * `Media`에 모르는 키를 주면 `invalid-props` · severity `error`이고 `renderNode`는 폴백을
 * 그린다. 즉 **저장된 문서 중 `Media` 노드가 있는 것이 전부 깨진다.** `MIGRATIONS`는 비어
 * 있고 `CURRENT_DOCUMENT_VERSION`이 1이므로 v1→v2 한 단계 + 버전 상승 + `apps/api`의
 * `pages.schema` 전수 재해석이 필요하다(§13.1). **능력이 줄어드는 변경에 스키마 버전
 * 이벤트를 쓰는 셈이다.**
 *
 * ### 그래서 아래 케이스들이 말하는 것
 *
 * **"이것이 옳다"가 아니라 "오늘 이렇고 왜 그런지"다.** 수선은 `variantFrom`과 같은 꼴의
 * 선언을 `resolveStructureOf`가 보게 하는 것이고, 그것은 `schema`의 `defineComponent`와
 * `renderer`의 `render.tsx`를 함께 넓히는 모델 변경이라 이 슬라이스에서 하지 않는다.
 * **누가 고치면 아래가 죽고, 그때 이 판정을 다시 읽게 된다.**
 */
describe('재라 #6 판정 — Media.kind는 오늘도 렌더에 닿지 않는다', () => {
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

  it('kind를 바꿔도 렌더 결과가 글자까지 같다 — 구조 넷이 다 생긴 뒤에도', () => {
    // **이것이 "닿지 않는다"의 실행 가능한 형태다.** 구조 구현체가 그 값을 읽기 시작하거나
    // `kind`가 구조 선택에 닿게 되면 여기가 **먼저** 죽는다.
    //
    // **초록인 것이 옳다는 뜻이 아니다.** 위 판정이 그 이유를 적었다 — 노드가 자기 구조를
    // 고를 통로가 아직 없어서이지, `kind`가 무의미해서가 아니다.
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

  it('그 구조가 이제 진짜로 있다 — 없어서 안 그려지는 것이 아니다', () => {
    // **위 케이스만 있으면 "video 구조가 없어서 image로 떨어졌다"로도 읽힌다.** P4b-2
    // 전에는 실제로 그랬다. 지금은 넷이 다 있고 **DOM도 서로 다른데** 노드의 `kind`가
    // 그중 무엇도 고르지 못한다 — 그것이 이 판정의 요점이다.
    const rendered = KINDS.map((structure) =>
      renderToStaticMarkup(
        renderNode(
          { id: 'n_000000000001', type: 'Media', props: { ratio: '16/9', caption: '' } },
          { structures: { Media: structure } },
        ),
      ),
    )

    expect(rendered.filter((html) => html.includes('data-wb-error'))).toEqual([])
    expect(new Set(rendered).size).toBe(KINDS.length)
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

  it('구조 넷이 다 구현됐다 — P4b-2 W4가 채웠다', () => {
    // **앞서 이 케이스가 `['image']`를 단언하며 일부러 죽어 있었다.** 준비 웨이브가 그것을
    // *"`Media.kind` 판정을 강제하는 장치"*로 남겼고, 위 판정이 그 답이다.
    const implemented = KINDS.filter((structure) => getStructure('Media', structure) !== undefined)

    expect(implemented).toEqual([...KINDS])
  })
})
