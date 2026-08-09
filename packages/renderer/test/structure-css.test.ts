import { describe, expect, it } from 'vitest'
import { NODE_VAR_PREFIX, structureBaseCss } from '../src/structure-css'
import { probe } from './css-probe'

/** 테마 CSS가 낼 셀렉터 모양. `compileTheme`의 `pushComponent`가 이 꼴을 만든다. */
function themeRule(type: string, structure: string, body: string): string {
  return `[data-wb-component="${type}"][data-wb-structure="${structure}"] { ${body} }`
}

describe('Task 1 — 캐스케이드 층을 무엇으로 할지 잰 결과', () => {
  /**
   * **(A) `@layer`를 고르지 않은 이유가 이 케이스다.**
   *
   * jsdom 25의 CSS 파서는 `@layer`를 모른다. 모르는 것에서 끝나지 않고 **그 규칙이 든
   * 시트를 통째로 버린다** — 아래에서 `@layer` 밖에 있는 `.plain`까지 함께 죽고
   * `style.sheet`가 `null`이 된다. 즉 `@layer`로 가면 이 저장소의 자동 테스트는
   * 층 순서를 재기는커녕 **CSS가 먹히는지조차 잴 수 없다.**
   *
   * 나중에 누가 (A)로 바꾸려 하면 이 케이스가 근거다. 바꾸려면 먼저 이것을 반증해야 한다
   * (jsdom이 `@layer`를 지원하게 되거나, 실제 브라우저로 재는 수단이 생기거나).
   */
  it('jsdom은 @layer가 든 시트를 통째로 버린다 — 그래서 층이 아니라 순서로 간다', async () => {
    const withLayer = await probe(
      ['.plain { display: flex; }\n@layer a { .x { display: grid; } }'],
      '<div class="plain"></div>',
    )
    expect(withLayer.ruleCount()).toBe('sheet-missing')
    // `@layer` 밖의 규칙도 함께 죽는다 — 초기값이 그대로 남는다.
    expect(withLayer.computed('.plain', 'display')).toBe('block')

    // 대조군: 같은 규칙만 두면 산다. 위가 "jsdom이 원래 아무것도 못 잰다"가 아님을 못박는다.
    const withoutLayer = await probe(['.plain { display: flex; }'], '<div class="plain"></div>')
    expect(withoutLayer.ruleCount()).toBe(1)
    expect(withoutLayer.computed('.plain', 'display')).toBe('flex')
  })

  it('같은 특이도에서는 나중에 온 규칙이 이긴다 — 한 시트 안', async () => {
    const forward = await probe(['.x { display: flex; }\n.x { display: grid; }'], '<div class="x"></div>')
    const backward = await probe(['.x { display: grid; }\n.x { display: flex; }'], '<div class="x"></div>')
    expect(forward.computed('.x', 'display')).toBe('grid')
    expect(backward.computed('.x', 'display')).toBe('flex')
  })

  /** D5의 전제. 시트를 둘로 나눠도 한 문자열 안의 순서와 결과가 같아야 한다. */
  it('시트를 둘로 나눠도 순서의 결과가 같다', async () => {
    const forward = await probe(['.x { display: flex; }', '.x { display: grid; }'], '<div class="x"></div>')
    const backward = await probe(['.x { display: grid; }', '.x { display: flex; }'], '<div class="x"></div>')
    expect(forward.computed('.x', 'display')).toBe('grid')
    expect(backward.computed('.x', 'display')).toBe('flex')
  })

  /**
   * **P0 이월 #7이 화면에서 어떻게 나타나는지.** 지금 `FlexDefault`가 내는 것과 같은
   * inline 선언을 두면 테마가 진다 — `!important` 없이는 이길 수 없다는 그 문장의 실측이다.
   * Task 2가 이 inline 선언을 걷어내면 아래 "테마가 이긴다" 케이스가 성립한다.
   */
  it('inline 일반 선언은 테마를 이긴다 — 걷어내야 하는 이유', async () => {
    const dom = await probe(
      [themeRule('Flex', 'default', 'display: grid;')],
      '<div data-wb-component="Flex" data-wb-structure="default" style="display:flex"></div>',
    )
    expect(dom.computed('[data-wb-component="Flex"]', 'display')).toBe('flex')
  })

  /**
   * **D2의 근거.** 커스텀 프로퍼티만 실린 inline style은 캐스케이드에서 이길 것이 없다 —
   * 그 자체로는 아무것도 그리지 않기 때문이다. 위 케이스와 같은 자리에서 결과가 뒤집힌다.
   */
  it('커스텀 프로퍼티만 실린 inline style은 테마를 이기지 않는다', async () => {
    const dom = await probe(
      [themeRule('Flex', 'default', 'display: grid;')],
      '<div data-wb-component="Flex" data-wb-structure="default" style="--wb-node-flex-direction:column"></div>',
    )
    expect(dom.computed('[data-wb-component="Flex"]', 'display')).toBe('grid')
    // 값은 그대로 실려 있다 — 지운 것이 아니라 통로로 바꾼 것이다.
    expect(dom.computed('[data-wb-component="Flex"]', '--wb-node-flex-direction')).toBe('column')
  })
})

describe('Task 1 — structureBaseCss', () => {
  it('테마와 같은 모양의 셀렉터를 쓴다', () => {
    // 같은 특이도여야 순서가 우선순위가 된다. 구조 기본 CSS가 더 구체적인 셀렉터를 쓰면
    // 나중에 온 테마가 져서 이 계획 전체가 무너진다.
    expect(structureBaseCss()).toContain('[data-wb-component="Flex"][data-wb-structure="default"]')
  })

  it('!important를 쓰지 않는다', () => {
    expect(structureBaseCss()).not.toContain('!important')
  })

  /**
   * 재라 #5. 노드가 나르는 값의 이름은 전부 `--wb-node-` 아래에 있어야 한다 —
   * 테마가 `cssVarName`으로 만드는 이름(`--wb-grid-columns` 등)과 겹치지 않게 하는 것이
   * 이 접두어의 전부다. **두 이름 집합이 실제로 겹치지 않는 것은 두 패키지를 함께 볼 수
   * 있는 `apps/web/test/theme/var-names.test.ts`가 대조한다** — `renderer`는 `themes`를
   * 보지 않는다(§3.3).
   */
  it('노드가 나르는 커스텀 프로퍼티는 전부 --wb-node- 아래에 있다', () => {
    const names = [...structureBaseCss().matchAll(/--[\w-]+/g)].map((match) => match[0])
    expect(names.length).toBeGreaterThan(0)
    expect(names.filter((name) => !name.startsWith(NODE_VAR_PREFIX))).toEqual([])
  })

  it('jsdom이 파싱할 수 있는 CSS다', async () => {
    const dom = await probe([structureBaseCss()], '<div></div>')
    expect(dom.ruleCount()).not.toBe('sheet-missing')
    expect(dom.ruleCount()).toBeGreaterThan(0)
  })

  it('Flex 노드에 display:flex를 준다', async () => {
    const dom = await probe(
      [structureBaseCss()],
      '<div data-wb-component="Flex" data-wb-structure="default"></div>',
    )
    expect(dom.computed('[data-wb-component="Flex"]', 'display')).toBe('flex')
  })

  /**
   * **이 케이스가 이 계획 전체의 성공 판정이다.** 구조 기본 CSS가 낸 `display:flex`를
   * 테마 CSS의 `display:grid`가 `!important` 없이 덮는다. §6.0의 약속(*"같은 페이지
   * 스키마가 테마에 따라 데이터 테이블로도, 카드 그리드로도"*)이 여기에 걸려 있다.
   */
  it('테마 CSS가 구조 기본 CSS를 덮는다 — !important 없이', async () => {
    const html = '<div data-wb-id="n_000000000001" data-wb-component="Flex" data-wb-structure="default"></div>'

    // **덮는 것을 재려면 먼저 덮일 것이 있어야 한다.** 이 줄이 없으면 구조 기본 CSS가
    // 아예 안 맞을 때도 케이스가 초록이 된다 — 셀렉터에 `[data-wb-id]`를 더해 특이도를
    // 올려 봤더니 실제로 그랬다(기본 CSS가 안 맞으니 테마가 거저 이겼다).
    const baseOnly = await probe([structureBaseCss()], html)
    expect(baseOnly.computed('[data-wb-component="Flex"]', 'display')).toBe('flex')

    const both = await probe([structureBaseCss(), themeRule('Flex', 'default', 'display: grid;')], html)
    expect(both.computed('[data-wb-component="Flex"]', 'display')).toBe('grid')
  })
})
