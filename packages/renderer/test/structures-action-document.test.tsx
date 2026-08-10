/**
 * **액션·문서 그룹의 구조 구현체.** P4b-2 ② W4가 만드는 다섯 —
 * `Button:outline`·`Button:text`·`Media:video`·`Media:illustration`·`Media:chart`.
 *
 * **파일을 새로 만든 것은 병렬 때문이다.** 워커 넷이 동시에 도는 동안 기존 테스트 파일에
 * 절을 더하면 병합에서 부딪힌다. 이 파일은 W4만 만진다.
 *
 * 여기서 재는 것은 셋이다 — **조각이 나오는가**, **계약 밖 속성이 없는가**(전수 가드는
 * `structures.test.tsx`에 있고 여기서는 이 그룹만 다시 못을 박는다), **조건부 조각이
 * 조건에서 나오는가**.
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

/**
 * 구조를 **이름으로 지목해** 그린다. 기본 구조(카탈로그의 첫째)가 아닌 것을 재려면
 * 이 경로여야 한다 — `renderNode(node)`는 늘 첫째를 고른다.
 */
function render(type: string, structure: string, props: Record<string, unknown> = {}): string {
  const node = { id: 'n_000000000001', type, props } as unknown as WbNode
  return renderToStaticMarkup(renderNode(node, { structures: { [type]: structure } }))
}

/** 폴백이 그려졌는지. 구현이 없으면 이것이 참이고 그 아래 단언들은 뜻을 잃는다. */
function isFallback(html: string): boolean {
  return html.includes('data-wb-error')
}

function parts(html: string): string[] {
  return [...html.matchAll(/data-wb-part="([^"]*)"/g)].map((match) => match[1]!)
}

describe('Button:outline', () => {
  it('등록돼 있다', () => {
    expect(getStructure('Button', 'outline')).toBeDefined()
  })

  it('폴백이 아니라 실제 구조를 그린다', () => {
    const html = render('Button', 'outline', { label: '취소' })
    expect(isFallback(html), html).toBe(false)
    expect(html).toContain('data-wb-structure="outline"')
  })

  it('라벨 조각을 낸다', () => {
    const html = render('Button', 'outline', { label: '취소' })
    expect(parts(html)).toEqual(['label'])
    expect(html).toContain('취소')
  })

  it('disabled prop이 버튼 요소까지 닿는다', () => {
    // `data-wb-state`는 `nodeAttrs`가 내므로 구조가 안 그려도 나온다. **`disabled` 속성은
    // 구조 구현체만 낼 수 있다** — 그래서 이 케이스가 "구조가 실제로 그렸다"를 잰다.
    expect(render('Button', 'outline', { disabled: true })).toContain('disabled=""')
    expect(render('Button', 'outline', { disabled: false })).not.toContain('disabled=""')
  })

  it('solid와 DOM이 같다 — data-wb-structure만 다르다', () => {
    // **이것이 "쟀다"의 실행 가능한 형태다**(계획서 재라 #7). 셋을 가르는 것이 CSS뿐이라는
    // 판정을 산문으로만 두면 아무도 다시 재지 않는다. 셋 중 하나가 정말 다른 DOM을 갖게
    // 되는 날 이 케이스가 먼저 죽고, 그때 `ButtonBase`를 가르면 된다.
    const solid = render('Button', 'solid', { label: '저장', disabled: false })
    const outline = render('Button', 'outline', { label: '저장', disabled: false })

    expect(solid).not.toBe(outline)
    expect(outline.replace('"outline"', '"solid"')).toBe(solid)
  })
})
