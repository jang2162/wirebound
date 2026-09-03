/**
 * 테마가 고른 구조를 `RenderOptions.structures`로 넘기는 배선.
 *
 * §6.0의 약속 — *"같은 페이지 스키마가 테마에 따라 데이터 테이블로도, 카드 그리드로도"* —
 * 이 여기 걸려 있다. **오늘은 컴포넌트마다 구현체가 하나씩뿐이라 갈아 끼울 것이 없다**
 * (P4b가 채운다). 그래도 배선을 지금 하는 것은, 없으면 P4b가 테마를 만들어도 렌더러가
 * 그것을 못 보기 때문이다.
 */
import { getStructure, renderNode } from '@wirebound/renderer'
import { installStructures } from '@wirebound/renderer'
import { ListDef, defineComponent, installCatalog, registerComponent } from '@wirebound/schema'
import { resolveTheme, systemTheme, themeStructures, type Theme } from '@wirebound/themes'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'

beforeAll(() => {
  installCatalog()
  installStructures()
})

function resolved(theme: Theme) {
  const { theme: value, issues } = resolveTheme(theme)
  expect(issues.map((issue) => `${issue.path}: ${issue.message}`)).toEqual([])
  return value!
}

describe('themeStructures', () => {
  it('테마가 없으면 빈 객체다', () => {
    // 렌더러가 카탈로그의 첫 구조를 쓴다(`resolveStructureOf`).
    expect(themeStructures(null)).toEqual({})
  })

  it('components[type].structure를 그대로 옮긴다', () => {
    const map = themeStructures(resolved(systemTheme('admin')!))
    expect(map.List).toBe('table')
    expect(map.Card).toBe('plain')
    expect(map.Field).toBe('outlined')
  })

  it('테마가 structure를 생략한 컴포넌트에는 카탈로그의 첫 구조가 들어 있다', () => {
    // `checkThemeComponents`가 생략을 `defaultStructure`로 채운다 — 여기서 다시 채우지 않는다.
    const map = themeStructures(
      resolved({
        meta: { id: 'x', name: 'x', version: '1' },
        components: { List: { base: { gap: '4px' } } },
      }),
    )
    expect(map.List).toBe('table')
  })

  it('테마가 언급하지 않은 컴포넌트는 키가 없다', () => {
    const map = themeStructures(
      resolved({
        meta: { id: 'x', name: 'x', version: '1' },
        components: { List: { structure: 'cardGrid' } },
      }),
    )
    expect(Object.keys(map)).toEqual(['List'])
  })

  it('물려받은 이름을 키로 만들지 않는다', () => {
    // 컴포넌트 이름은 문서에서 오는 문자열이다. 결과가 평범한 객체 리터럴이면
    // 그것을 읽는 쪽(`options.structures?.[def.type]`)이 `toString`에서 함수를 집는다.
    const map = themeStructures(resolved({ meta: { id: 'x', name: 'x', version: '1' } }))
    expect((map as Record<string, unknown>).toString).toBeUndefined()
    expect((map as Record<string, unknown>).constructor).toBeUndefined()
  })
})

/**
 * **오늘 구현이 없는 구조를 테마가 고르면 무엇이 보이는가.**
 *
 * 판정: **폴백 문장이 사용자에게 보이는 것이 맞다.** 근거 셋.
 *
 * 1. **대안이 조용한 거짓말이다.** 없는 구조를 기본 구조로 슬쩍 바꿔 그리면 화면은
 *    멀쩡한데 **테마가 고른 것과 다른 것이 그려진다.** 그러면 테마 작성자는 자기 설정이
 *    먹혔다고 믿고, §6.0이 약속한 "테마가 구조를 고른다"가 조용히 깨진 채로 남는다.
 * 2. **문장이 고칠 수 있는 것을 가리킨다.** `구현되지 않은 구조: <타입>:<구조>`는
 *    무엇을 고쳐야 하는지(테마의 그 줄, 또는 렌더러의 그 구현)를 그대로 말한다.
 *    P0 이월 #6이 폴백을 만든 이유가 이것이다 — 던져서 서브트리를 죽이지도, 조용히
 *    비우지도 않는다.
 * 3. **P4b가 이 상태를 빠르게 지운다.** 구조 구현체를 채우는 것이 바로 다음 단계다.
 *
 * 그래서 이 케이스는 **버그가 아니라 계약**으로 고정한다. 문장이 바뀌면 여기가 깨진다.
 *
 * ---
 *
 * **근거 3이 이 케이스를 잡아먹을 뻔했다 (P4b-2 ① D1).** 앞서 여기는 `List:cardGrid`를
 * *"구현이 없는 조합"*으로 썼는데, **P4b-2의 W2가 바로 그것을 만든다** — 그러면 이 계약이
 * 재는 대상이 사라져 두 케이스가 죽는다(준비 웨이브에서 26개를 전부 등록해 실측했다).
 *
 * 그리고 **P4b-2가 끝나면 카탈로그의 45개가 전부 구현된다.** 즉 "구현이 없는 조합"을
 * 실제 컴포넌트에서 빌려 오는 방식은 이 계약을 **일시적으로만** 잴 수 있다.
 *
 * 그래서 **탐침 컴포넌트**로 바꾼다. 카탈로그에는 등록하되 구조 구현을 **하나도** 등록하지
 * 않으므로 그 조합은 영구히 빈다 — 계약이 P4b-2의 진척과 무관해진다. 같은 수법이
 * `canvas.test.tsx`(`터지는구조`)와 `property-panel.test.tsx`에 이미 있다.
 */
const NO_IMPL_TYPE = '구현없는컴포넌트'

// props 스키마를 새로 쓰려면 zod가 필요한데 `apps/web`은 zod에 의존하지 않는다 —
// `ListDef`를 그대로 빌리고 타입 이름만 바꾼다(`canvas.test.tsx`와 같은 이유).
// **구조 구현은 등록하지 않는다.** `installStructures()`가 이 타입을 모르므로 영구히 빈다.
registerComponent(defineComponent({ ...ListDef, type: NO_IMPL_TYPE, label: NO_IMPL_TYPE }))

describe('구현이 없는 구조를 테마가 고를 때', () => {
  const themeChoosing = {
    meta: { id: 'x', name: 'x', version: '1' },
    components: { [NO_IMPL_TYPE]: { structure: 'cardGrid' } },
  }
  const MESSAGE = `구현되지 않은 구조: ${NO_IMPL_TYPE}:cardGrid`

  it('렌더러가 폴백을 그리고 무엇이 없는지 말한다', () => {
    const map = themeStructures(resolved(themeChoosing))

    const html = renderToStaticMarkup(
      renderNode({ id: 'n_000000000001', type: NO_IMPL_TYPE }, { structures: map }),
    )
    expect(html).toContain(MESSAGE)
    // 노드 id가 남는다 — 캔버스의 선택이 id로 노드를 찾으므로, 깨진 노드도 눌러서 고칠 수 있다.
    expect(html).toContain('data-wb-id="n_000000000001"')
  })

  it('같은 문서의 다른 노드는 정상으로 그려진다', () => {
    const map = themeStructures(resolved(themeChoosing))

    const html = renderToStaticMarkup(
      renderNode(
        {
          id: 'n_000000000001',
          type: 'Page',
          children: [
            { id: 'n_000000000002', type: NO_IMPL_TYPE },
            { id: 'n_000000000003', type: 'Text', props: { content: '살아남은 형제' } },
          ],
        },
        { structures: map },
      ),
    )
    expect(html).toContain(MESSAGE)
    expect(html).toContain('살아남은 형제')
  })

  it('탐침이 실제로 비어 있다 — 이 계약이 재는 대상이 있는지', () => {
    // **이 케이스가 없으면 위 둘은 탐침이 사라져도 설명이 된다.** 누가 이 타입에 구조
    // 구현을 등록하면 여기가 먼저 죽고, 그때 위 판정을 다시 읽게 된다.
    expect(getStructure(NO_IMPL_TYPE, 'cardGrid')).toBeUndefined()
    // 음성 대조 — 진짜 컴포넌트에는 구현이 있다. 레지스트리 조회 자체가 도는지 못을 박는다.
    expect(getStructure('List', 'table')).toBeDefined()
  })
})
