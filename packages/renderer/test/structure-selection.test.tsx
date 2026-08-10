/**
 * **구조 선택은 컴포넌트 *타입* 단위다 — 노드 단위가 아니다.**
 *
 * P4b-2 W4가 `Media.kind`를 판정하다 재서 확인한 **모델의 사실**이다. `Media`만의 것이
 * 아니라서 그 컴포넌트의 케이스 안에 묻지 않고 여기에 따로 둔다.
 *
 * ---
 *
 * `resolveStructureOf`가 보는 것은 `options.structures[def.type]` 하나다. 테마가 내는
 * 그 맵의 키가 **타입**이므로, 한 문서 안에서 같은 타입의 노드들이 **서로 다른 구조를
 * 가질 수 없다.** 노드 쪽에는 그 값을 적을 자리조차 없다(`WbNodeSchema`가
 * `z.strictObject`다 — 아래 케이스가 잰다).
 *
 * **이것이 §6.0과 §5가 부딪히는 자리다.**
 *
 * | 규격 | 무엇을 말하는가 |
 * |---|---|
 * | §6.0 · §6.5 | 구조는 **테마가** 고른다. 렌더러가 가진 고정 목록 중 하나 |
 * | §5 | `Media`는 *"이미지·영상·일러스트·차트 영역"*이다 — **노드마다 다른 내용** |
 *
 * `Media`에서 가장 선명하지만 **`Media`만의 문제가 아니다.** 같은 페이지에 테이블 `List`와
 * 카드그리드 `List`를 둘 수 없다는 뜻이기도 하다 — **P4b-3이 시스템 테마 다섯을 만들 때
 * 바로 부딪힌다.**
 *
 * **여기서 고치지 않는다.** 수선은 `variantFrom`과 같은 꼴의 선언(컴포넌트가 *"이 prop이
 * 구조의 단일 진실"*이라고 말하는 것)을 `resolveStructureOf`가 보게 하는 것이고, 그것은
 * `schema`의 `defineComponent`와 `renderer`의 `render.tsx`를 함께 넓히는 모델 변경이다.
 * 병렬 웨이브가 도는 중에 넷이 공유하는 자리를 넓히지 않는다.
 *
 * **아래 케이스들은 "이것이 옳다"가 아니라 "오늘 이렇다"를 못박는다.** 누가 고치면
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

/** 구현이 **둘 이상** 있는 타입. 하나뿐이면 "서로 다른 구조"를 물을 수 없다. */
function implementedStructures(type: string): string[] {
  return requireComponent(type).structures.filter(
    (structure) => getStructure(type, structure) !== undefined,
  )
}

describe('구조 선택은 타입 단위다 (P4b-2 W4)', () => {
  it('같은 타입의 형제 노드는 전부 같은 구조로 그려진다', () => {
    // **전수로 잰다.** 구현이 둘 이상인 타입이 병렬 웨이브 뒤에 늘어나므로, 이름을 박으면
    // 그때마다 이 케이스를 고쳐야 한다. 지금은 W4가 만든 둘(`Button`·`Media`)이 걸리고
    // 통합 뒤에는 `List`·`Card`·`Tabs`·`Field`…가 저절로 들어온다.
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
