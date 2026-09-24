/**
 * **구조 선택은 컴포넌트 *타입* 단위다 — 노드 단위가 아니다.**
 *
 * `Media.kind`를 판정하다 재서 확인한 **모델의 사실**이다. `Media`만의 것이
 * 아니라서 그 컴포넌트의 케이스 안에 묻지 않고 여기에 따로 둔다.
 *
 * ---
 *
 * `resolveStructureOf`가 보는 것은 `options.structures[def.type]` 하나다. 테마가 내는
 * 그 맵의 키가 **타입**이므로, 한 문서 안에서 같은 타입의 노드들이 **서로 다른 구조를
 * 가질 수 없다.** 노드 쪽에는 그 값을 적을 자리조차 없다(`WbNodeSchema`가
 * `z.strictObject`다 — 아래 케이스가 잰다).
 *
 * **이것이 설계서 「테마의 범위」와 「컴포넌트 카탈로그」가 부딪히는 자리다.**
 *
 * | 규격 | 무엇을 말하는가 |
 * |---|---|
 * | 「테마의 범위」 · 「components — 구조 + 스킨」 | 구조는 **테마가** 고른다. 렌더러가 가진 고정 목록 중 하나 |
 * | 「컴포넌트 카탈로그」 | `Media`는 *"이미지·영상·일러스트·차트 영역"*이다 — **노드마다 다른 내용** |
 *
 * `Media`에서 가장 선명하지만 **`Media`만의 문제가 아니다.** 같은 페이지에 테이블 `List`와
 * 카드그리드 `List`를 둘 수 없다는 뜻이기도 하다 — **테마가 타입마다 구조 하나를 고르므로
 * 한 페이지 안에서 둘을 섞을 길이 없다.**
 *
 * **여기서 고치지 않는다.** 수선은 `variantFrom`과 같은 꼴의 선언(컴포넌트가 *"이 prop이
 * 구조의 단일 진실"*이라고 말하는 것)을 `resolveStructureOf`가 보게 하는 것이고, 그것은
 * `schema`의 `defineComponent`와 `renderer`의 `render.tsx`를 함께 넓히는 모델 변경이라
 * 렌더러 테스트 한 자리에서 정할 일이 아니다 — 그 선언을 들이기로 정하면 닫힌다.
 *
 * **아래 케이스들은 "이것이 옳다"가 아니라 "지금 이렇다"를 못박는다.** 누가 고치면
 * 그때 죽고, 그 자리에서 이 주석을 다시 읽게 된다.
 */
import { CATALOG_TYPES, WbNodeSchema, installCatalog, requireComponent } from '@wirebound/schema'
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

/** 같은 타입의 형제 노드 둘을 `Page` 아래 두고 그린다. */
function siblings(type: string, structure: string): string {
  const node = {
    id: 'n_000000000001',
    type: 'Page',
    children: [
      { id: 'n_000000000002', type, props: {} },
      { id: 'n_000000000003', type, props: {} },
    ],
  } as unknown as WbNode
  return renderToStaticMarkup(renderNode(node, { structures: { [type]: structure } }))
}

function countStructure(html: string, structure: string): number {
  return html.split(`data-wb-structure="${structure}"`).length - 1
}

/**
 * prop 하나를 흔들 값들. **enum을 반드시 포함한다** — 구조 이름과 겹치는 enum(`Media.kind`)이
 * 통로가 될 가장 유력한 후보이기 때문이다.
 */
function propCandidates(schema: { def?: { type?: string; innerType?: unknown }; options?: unknown[] } | undefined): unknown[] {
  let inner = schema
  // `.default()`·`.optional()` 등을 벗긴다.
  while (inner?.def?.innerType !== undefined) {
    inner = inner.def.innerType as typeof inner
  }
  const kind = inner?.def?.type
  if (kind === 'enum' && Array.isArray(inner?.options)) return [...inner.options]
  if (kind === 'boolean') return [true, false]
  if (kind === 'string') return ['값']
  if (kind === 'number') return [1, 3]
  return []
}

/** 구현이 **둘 이상** 있는 타입. 하나뿐이면 "서로 다른 구조"를 물을 수 없다. */
function implementedStructures(type: string): string[] {
  return requireComponent(type).structures.filter(
    (structure) => getStructure(type, structure) !== undefined,
  )
}

describe('구조 선택은 타입 단위다', () => {
  it('같은 타입의 형제 노드는 전부 같은 구조로 그려진다', () => {
    // **전수로 잰다.** 구현이 둘 이상인 타입은 구조가 늘 때마다 늘어나므로, 이름을 박으면
    // 그때마다 이 케이스를 고쳐야 한다. 새로 둘 이상이 된 타입은 저절로 들어온다.
    const types = CATALOG_TYPES.filter((type) => implementedStructures(type).length >= 2)
    expect(types.length, '구현이 둘 이상인 타입이 없으면 이 케이스는 헛돈다').toBeGreaterThan(0)

    for (const type of types) {
      const [first, second] = implementedStructures(type) as [string, string]
      const html = siblings(type, second)

      // 형제 둘에게 서로 다른 구조를 주고 싶어도 **줄 수 있는 통로가 없다.**
      expect(countStructure(html, second), `${type}: ${second}`).toBe(2)
      expect(countStructure(html, first), `${type}: ${first}`).toBe(0)
    }
  })

  it('노드 봉투에 구조를 적을 자리가 없다', () => {
    // 위 케이스가 *"통로가 없다"*고 말하는 근거다. 이것이 없으면 *"렌더러가 노드의
    // `structure`를 안 읽을 뿐 적기는 할 수 있다"*로도 읽힌다.
    const withStructure = {
      id: 'n_000000000002',
      type: 'Media',
      props: {},
      structure: 'video',
    }
    const parsed = WbNodeSchema.safeParse(withStructure)

    expect(parsed.success).toBe(false)
    expect(JSON.stringify(parsed.error?.issues)).toContain('structure')
  })

  /**
   * **가장 유력한 변경(`structureFrom`)을 잡는 케이스.**
   *
   * 위 두 케이스는 **봉투의 `structure` 필드**만 막는다. 그런데 머리말이 든 수선은
   * 봉투가 아니라 **prop**을 통로로 쓴다(`variantFrom`과 같은 꼴). 그러면 위 둘은 그대로
   * 초록이다 — 형제 둘에게 `props: {}`를 주므로 **둘 다 기본값**이고, prop이 구조를 정하게
   * 되어도 여전히 같은 구조가 나온다.
   *
   * 이 케이스가 없으면 그 변경을 잡는 것은 `structures.test.tsx`의 `Media.kind` 카나리아뿐인데
   * **그것은 우연이다** — `Media`가 마침 `kind`라는 이름 넷을 가졌을 뿐이고, 다른
   * 컴포넌트에 통로가 뚫리면 아무도 안 죽는다.
   *
   * **그래서 prop을 흔든다.** 형제 하나는 기본 props, 다른 하나는 prop 하나를 바꾼 판으로
   * 그리고 **둘의 `data-wb-structure`가 같은지** 본다. 어떤 prop이든 구조의 통로가 되는
   * 순간 여기서 죽는다.
   */
  it('노드의 prop을 바꿔도 구조가 안 바뀐다 — prop은 구조의 통로가 아니다', () => {
    const types = CATALOG_TYPES.filter((type) => implementedStructures(type).length >= 2)
    expect(types.length).toBeGreaterThan(0)

    let compared = 0
    for (const type of types) {
      const def = requireComponent(type)
      // 테마가 고르는 것은 **첫째가 아닌 쪽**으로 둔다 — 카탈로그 기본값과 같으면
      // *"통로가 기본값을 집어서 우연히 맞은 것"*과 구별되지 않는다.
      const chosen = implementedStructures(type)[1] as string
      const defaults = def.props.parse({}) as Record<string, unknown>
      const shape = (def.props as unknown as { shape?: Record<string, { def?: { type?: string }; options?: unknown[] } > }).shape ?? {}

      for (const name of Object.keys(shape)) {
        for (const value of propCandidates(shape[name])) {
          const candidate = { ...defaults, [name]: value }
          if (!def.props.safeParse(candidate).success) continue

          const node = {
            id: 'n_000000000001',
            type: 'Page',
            children: [
              { id: 'n_000000000002', type, props: defaults },
              { id: 'n_000000000003', type, props: candidate },
            ],
          } as unknown as WbNode
          const html = renderToStaticMarkup(renderNode(node, { structures: { [type]: chosen } }))

          // 폴백이 떴으면 그 판은 그려진 것이 아니다 — 조용히 지나가지 않게 잡는다.
          expect(html, `${type}.${name}=${String(value)}: 폴백`).not.toContain('data-wb-error')
          expect(countStructure(html, chosen), `${type}.${name}=${String(value)}`).toBe(2)
          compared += 1
        }
      }
    }
    // 순회가 헛돌면 위 단언이 하나도 안 돈다.
    expect(compared).toBeGreaterThan(20)
  })

  it('음성 대조 — variant는 노드마다 다를 수 있다', () => {
    // 이 케이스가 없으면 위 둘이 *"노드는 아무것도 못 정한다"*로도 설명된다. 봉투가 닫아
    // 둔 것은 **구조**이지 노드의 표현 선택 전부가 아니다 — `variant`는 노드의 필드다.
    const node = {
      id: 'n_000000000001',
      type: 'Page',
      children: [
        { id: 'n_000000000002', type: 'Button', props: {}, variant: 'primary' },
        { id: 'n_000000000003', type: 'Button', props: {}, variant: 'danger' },
      ],
    } as unknown as WbNode
    const html = renderToStaticMarkup(renderNode(node, { structures: { Button: 'outline' } }))

    expect(html).toContain('data-wb-variant="primary"')
    expect(html).toContain('data-wb-variant="danger"')
    // 구조는 그래도 하나다.
    expect(countStructure(html, 'outline')).toBe(2)
  })
})
