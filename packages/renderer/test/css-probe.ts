/**
 * jsdom으로 캐스케이드를 재는 프로브. **테스트 전용이고 런타임 의존이 아니다** —
 * `jsdom`은 저장소 루트의 devDependency이고 여기서만 동적 import로 쓴다
 * (P4a-1이 `packages/themes/test/emit-parse.test.ts`에서 세운 관례).
 *
 * **이 프로브가 잴 수 있는 것과 없는 것을 먼저 적는다.** 아래 세 성질은 재서 확인했고
 * (`structure-css.test.ts`가 케이스로 고정한다), 이것을 모르면 여기서 나온 값을 잘못 읽는다.
 *
 * | 성질 | jsdom 25 |
 * |---|---|
 * | 같은 특이도에서 나중 규칙이 이긴다 | **잰다** (한 시트 안에서도, 시트 둘로 나눠도) |
 * | 커스텀 프로퍼티의 계산값 | **잰다** (inline·시트 어느 쪽에서 와도) |
 * | `var()` 치환 | **못 한다** — `flex-direction: var(--x)`의 계산값이 문자열 `"var(--x)"`다 |
 * | `@layer` | **파싱 자체가 실패한다** — 시트가 통째로 버려진다 |
 *
 * 그래서 "커스텀 프로퍼티로 값이 흘러간다"는 **두 조각으로 나눠 잰다**: 노드에 실린
 * 커스텀 프로퍼티의 계산값 + 구조 기본 CSS의 선언이 그 이름을 가리키는 것. 마지막 치환
 * 한 걸음은 실제 브라우저의 몫이고 이 저장소의 자동 테스트가 재지 못한다.
 */
export interface Probe {
  /** 계산된 스타일 한 값. 커스텀 프로퍼티 이름도 그대로 받는다. */
  computed(selector: string, property: string): string
  /** 시트가 만들어졌는지와 규칙 개수. `'sheet-missing'`이면 파싱이 실패한 것이다. */
  ruleCount(index?: number): number | 'sheet-missing'
}

/**
 * `<style>` 여러 장과 본문 HTML을 넣은 문서를 만든다. **시트의 순서가 인자 순서다** —
 * D5가 구조 기본 CSS를 먼저, 테마 CSS를 나중에 놓는 것을 이 순서로 흉내 낸다.
 */
export async function probe(sheets: readonly string[], html: string): Promise<Probe> {
  const { JSDOM } = await import('jsdom')
  const head = sheets.map((css) => `<style>${css}</style>`).join('')
  const dom = new JSDOM(`<!doctype html><html><head>${head}</head><body>${html}</body></html>`)
  const { document } = dom.window

  return {
    computed(selector, property) {
      const element = document.querySelector(selector)
      if (element === null) throw new Error(`프로브가 요소를 찾지 못했습니다: ${selector}`)
      return dom.window.getComputedStyle(element).getPropertyValue(property)
    },
    ruleCount(index = 0) {
      const style = document.querySelectorAll('style')[index] as unknown as {
        sheet: { cssRules: { length: number } } | null
      } | undefined
      if (style === undefined) throw new Error(`프로브에 ${index}번 시트가 없습니다`)
      return style.sheet === null ? 'sheet-missing' : style.sheet.cssRules.length
    },
  }
}
