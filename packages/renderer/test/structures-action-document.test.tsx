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

describe('Button:text', () => {
  it('등록돼 있다', () => {
    expect(getStructure('Button', 'text')).toBeDefined()
  })

  it('폴백이 아니라 실제 구조를 그린다', () => {
    const html = render('Button', 'text', { label: '더 보기' })
    expect(isFallback(html), html).toBe(false)
    expect(html).toContain('data-wb-structure="text"')
  })

  it('라벨 조각을 낸다', () => {
    const html = render('Button', 'text', { label: '더 보기' })
    expect(parts(html)).toEqual(['label'])
    expect(html).toContain('더 보기')
  })

  it('라벨 조각을 지우지 않는다 — 테마의 어휘가 구조마다 달라지면 안 된다', () => {
    // **`text`에서 라벨 조각을 빼고 싶은 유혹이 있다** — 겹칠 것이 없어 보이니까. 그러면
    // 테마의 `Button.parts.label` 규칙이 **`text` 구조에서만 조용히 안 걸린다.** 조각
    // 이름은 테마의 어휘이고(§6.5) 어휘는 구조를 가로질러 같아야 한다.
    expect(parts(render('Button', 'text', {}))).toEqual(parts(render('Button', 'solid', {})))
  })
})

describe('Button — 구조 셋의 DOM 동일성 (계획서 재라 #7)', () => {
  const STRUCTURES = ['solid', 'outline', 'text'] as const

  it('카탈로그가 선언한 구조 셋이 전부 구현돼 있다', () => {
    expect(requireComponent('Button').structures).toEqual([...STRUCTURES])
    for (const structure of STRUCTURES) {
      expect(getStructure('Button', structure), structure).toBeDefined()
    }
  })

  it('셋의 DOM이 data-wb-structure를 빼면 글자까지 같다', () => {
    // **W4의 판정: `Button`의 셋은 구조가 아니라 스킨이다.** 그래도 구조 채널에 남긴 이유는
    // 그 채널이 나르는 것이 *"DOM이 다르다"*가 아니라 *"테마가 무엇을 골랐는가"*이기
    // 때문이다(§6.11의 `data-wb-structure`). 아래 정규화는 그 한 속성만 지운다.
    const normalize = (html: string): string => html.replace(/ data-wb-structure="[^"]*"/, '')
    const props = { label: '저장', disabled: false, loading: false }

    const rendered = STRUCTURES.map((structure) => render('Button', structure, props))
    // 정규화가 실제로 무언가를 지웠는지 — 안 지웠으면 아래 비교가 헛돈다.
    expect(rendered.map(normalize).every((html) => html !== rendered[0])).toBe(true)

    expect([...new Set(rendered.map(normalize))]).toHaveLength(1)
  })

  it('그래도 셋은 서로 다른 문서다 — 구조 이름이 실제로 나간다', () => {
    // 위 케이스와 쌍이다. 이것이 없으면 "셋이 다 똑같은 HTML"로도 통과한다.
    const props = { label: '저장' }
    const rendered = STRUCTURES.map((structure) => render('Button', structure, props))
    expect(new Set(rendered).size).toBe(STRUCTURES.length)
    for (const [index, structure] of STRUCTURES.entries()) {
      expect(rendered[index], structure).toContain(`data-wb-structure="${structure}"`)
    }
  })
})

describe('Media:video', () => {
  it('등록돼 있다', () => {
    expect(getStructure('Media', 'video')).toBeDefined()
  })

  it('폴백이 아니라 실제 구조를 그린다', () => {
    const html = render('Media', 'video', {})
    expect(isFallback(html), html).toBe(false)
    expect(html).toContain('data-wb-structure="video"')
  })

  it('틀 안에 재생 어포던스를 낸다', () => {
    // **이것이 `image`와 갈리는 자리다.** 빈 회색 상자는 와이어프레임에서 "사진"으로
    // 읽힌다 — 영상이 영상으로 읽히려면 재생 표시가 DOM에 있어야 하고, 그것이 테마가
    // 겨냥할 조각이 된다.
    const html = render('Media', 'video', {})
    expect(parts(html)).toEqual(['frame', 'play'])
  })

  it('caption은 값이 있을 때만 나온다', () => {
    expect(parts(render('Media', 'video', { caption: '' }))).not.toContain('caption')
    expect(parts(render('Media', 'video', { caption: '제품 소개 영상' }))).toContain('caption')
    expect(render('Media', 'video', { caption: '제품 소개 영상' })).toContain('제품 소개 영상')
  })

  it('ratio를 노드 변수로 낸다 — image와 같은 통로다', () => {
    // `partRule('Media','frame', …)`은 구조 이름을 넣지 않으므로 네 구조가 같은 규칙을
    // 받는다. 값을 안 싣는 구조가 하나라도 있으면 그 구조에서만 기본값 16/9로 굳는다.
    expect(render('Media', 'video', { ratio: '4/3' })).toContain('--wb-node-media-ratio:4/3')
  })
})
