/**
 * **갤러리가 그릴 문서**(② W3). React를 안 쓰는 순수 데이터 케이스라 `theme-gallery.test.tsx`와
 * 갈라 두었다 — 그쪽은 렌더링을 잰다.
 *
 * **가르는 데는 이유가 하나 더 있다.** 이 파일은 `src/theme/gallery-document`와
 * `@wirebound/schema`·`@wirebound/themes`만 import한다. 그래서 그 모듈의
 * `import '../catalog-setup'`이 **카탈로그가 설치되는 유일한 경로**이고, 그 줄을 지우면
 * 아래 케이스가 죽는다(재서 확인했다 — 보고서의 변조 표). `theme-gallery.test.tsx`는
 * `draft-css`를 import하는데 **그쪽이 카탈로그를 또 끌어오므로** 같은 구분력을 얻지 못한다 —
 * ①이 `draft-css.ts`에서 만난 것과 같은 부류다(그쪽 0 사망).
 *
 * ---
 *
 * **§5의 수를 여기서 붙든다.** `gallery-document.ts` 머리말이 재라 #5의 근거로 수 여섯을
 * 적었는데, 그 수가 낡는 것이 이 저장소에서 반복된 실패다(P4c-1 이월 §5 · ①의 보고서 §7-2).
 * 그래서 **주석이 아니라 케이스가 센다** — 값이 바뀌면 여기서 죽고, 죽으면 머리말을 고치게 된다.
 */
import { describe, expect, it } from 'vitest'
import { getComponent, listComponents, validatePage } from '@wirebound/schema'
import { compileTheme, resolveTheme, systemTheme, type Theme } from '@wirebound/themes'
import {
  GALLERY_EXCLUDED,
  GALLERY_SAMPLE_TYPES,
  galleryDocument,
  galleryItems,
  structureCount,
  structureKey,
} from '../../src/theme/gallery-document'

describe('갤러리 문서', () => {
  it('validatePage를 이슈 0건으로 지난다 — 샘플이 사용자 문서와 같은 규칙을 지킨다', () => {
    // 이 한 줄이 잡는 것 다섯: 중복 id · 없는 prop · children을 못 갖는 타입의 자식 ·
    // variantFrom 타입에 node.variant를 쓴 것(ignored-variant) · Slot을 넣은 것(slot-count).
    expect(validatePage(galleryDocument())).toEqual([])
  })

  it('제외한 둘 말고 카탈로그의 모든 타입이 나온다', () => {
    const drawn = new Set(galleryItems().map((item) => item.node.type))
    const expected = listComponents()
      .map((def) => def.type)
      .filter((type) => !GALLERY_EXCLUDED.has(type))

    // 새 컴포넌트가 카탈로그에 들어오면 여기서 죽는다 — 갤러리가 조용히 낡는 것을 막는 자리다.
    expect([...expected].sort()).toEqual([...drawn].sort())
    expect([...GALLERY_EXCLUDED.keys()].sort()).toEqual(['Page', 'Slot'])
  })

  it('선언된 변형과 상태를 하나도 빠뜨리지 않는다', () => {
    const items = galleryItems()
    const seen = (axis: string): string[] =>
      items
        .filter((item) => item.axis === axis)
        .map((item) => `${item.node.type}:${item.name}`)
        .sort()

    const declaredVariants: string[] = []
    const declaredStates: string[] = []
    for (const def of listComponents()) {
      if (GALLERY_EXCLUDED.has(def.type)) continue
      for (const variant of def.variants) declaredVariants.push(`${def.type}:${variant}`)
      for (const state of def.states) declaredStates.push(`${def.type}:${state}`)
    }

    expect(seen('variant')).toEqual(declaredVariants.sort())
    expect(seen('state')).toEqual(declaredStates.sort())
  })

  it('variantFrom 타입은 base를 내지 않는다 — 변형 항목 하나와 글자까지 같아진다', () => {
    const withoutBase = listComponents()
      .filter((def) => def.variantFrom !== undefined && !GALLERY_EXCLUDED.has(def.type))
      .map((def) => def.type)
      .sort()
    const bases = galleryItems()
      .filter((item) => item.axis === 'base')
      .map((item) => item.node.type)

    expect(withoutBase).toEqual(['Divider', 'Field', 'Text'])
    for (const type of withoutBase) expect(bases).not.toContain(type)
  })

  it('변형은 파생 prop으로, 그렇지 않으면 node.variant로 심는다', () => {
    const items = galleryItems()
    // Text는 `role`에서 파생한다 — node.variant를 쓰면 렌더러가 무시하고 validatePage가
    // `ignored-variant`를 낸다(위 첫 케이스가 그것을 잡는다).
    const textH1 = items.find((item) => item.node.type === 'Text' && item.name === 'h1')
    expect(textH1?.node.props?.role).toBe('h1')
    expect(textH1?.node.variant).toBeUndefined()

    // Button은 파생 prop이 없다 — node.variant가 유일한 길이다.
    const danger = items.find((item) => item.node.type === 'Button' && item.name === 'danger')
    expect(danger?.node.variant).toBe('danger')
  })

  it('상태는 같은 이름의 prop을 true로 켠 것이다', () => {
    const loading = galleryItems().find(
      (item) => item.node.type === 'Button' && item.axis === 'state' && item.name === 'loading',
    )
    expect(loading?.node.props?.loading).toBe(true)
  })

  it('노드 id가 유일하고 두 번 불러도 같은 객체다', () => {
    const first = galleryItems()
    const ids = first.map((item) => item.node.id)
    expect(new Set(ids).size).toBe(ids.length)
    // 캐시가 깨지면 React 키가 매 렌더 갈려 예순 개 서브트리가 다시 마운트된다.
    expect(galleryItems()).toBe(first)
  })

  it('샘플 표에 카탈로그에 없는 키가 남아 있지 않다', () => {
    const stale = GALLERY_SAMPLE_TYPES.filter(
      (type) => getComponent(type) === undefined || GALLERY_EXCLUDED.has(type),
    )
    expect(stale).toEqual([])
  })

  it('structureKey는 순서가 아니라 내용으로 갈린다', () => {
    // `themeStructures`가 테마의 선언 순서를 그대로 쓰므로, 같은 선택을 다른 순서로 적은
    // 두 초안이 다른 키를 내면 오류 경계가 이유 없이 되살아난다.
    expect(structureKey({ Card: 'bordered', List: 'table' })).toBe(
      structureKey({ List: 'table', Card: 'bordered' }),
    )
    expect(structureKey({ Card: 'bordered' })).not.toBe(structureKey({ Card: 'plain' }))
  })
})

/**
 * **재라 #5의 근거를 세는 자리.** `gallery-document.ts` 머리말의 표 여섯 줄이 그대로 여기 있다.
 *
 * 검산: `pnpm vitest run --project web apps/web/test/theme/gallery-document.test.ts -t '재라 #5'`
 */
describe('재라 #5 — 왜 구조 옵션 45개를 늘어놓지 않는가', () => {
  const types = listComponents().map((def) => def.type)

  it('카탈로그는 타입 19개 · 구조 옵션 45개다', () => {
    expect(types.length).toBe(19)
    expect(types.reduce((sum, type) => sum + structureCount(type), 0)).toBe(45)
  })

  it('admin 테마는 45개 중 15개에만 base 규칙을 낸다 — 나머지 30개는 무테마로 그려진다', () => {
    const { theme } = resolveTheme(systemTheme('admin') as Theme)
    expect(theme).not.toBeNull()
    const css = compileTheme(theme!)

    // 방출이 컴포넌트 base를 내는 선택자는 `[…component][…structure]` **붙어 있는** 형태다.
    // 조각·변형·상태는 구조를 안 끼우므로 여기 안 걸린다(`emit/index.ts`의 pushComponent).
    const based = new Set(
      [...css.matchAll(/\[data-wb-component="([^"]+)"\]\[data-wb-structure="([^"]+)"\]/g)].map(
        (match) => `${match[1]}:${match[2]}`,
      ),
    )

    expect(based.size).toBe(15)
    expect(45 - based.size).toBe(30)
  })

  it('admin이 내는 변형 21 · 상태 8 — 구조만 늘어놓는 갤러리는 그 29개를 못 보인다', () => {
    const { theme } = resolveTheme(systemTheme('admin') as Theme)
    let variants = 0
    let states = 0
    for (const [, component] of theme!.components) {
      variants += component.variants.size
      states += component.states.size
    }
    expect(variants).toBe(21)
    expect(states).toBe(8)
  })

  it('admin이 아무 말도 하지 않는 타입이 정확히 갤러리가 제외한 둘이다', () => {
    const { theme } = resolveTheme(systemTheme('admin') as Theme)
    const silent = types.filter((type) => !theme!.components.has(type)).sort()
    expect(silent).toEqual([...GALLERY_EXCLUDED.keys()].sort())
  })
})
