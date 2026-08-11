/**
 * **`docs` 테마가 딛고 선 두 사실을 못박는다** (P4b-3 ② W4).
 *
 * 둘 다 **조용히 깨지는 부류**다 — 깨져도 이슈가 0건이고 화면에서만 드러난다.
 *
 * 1. **`parts` 규칙이 자손 결합자다**(P4b-2 이월 4-1 — *그쪽이 쟀다*). 바깥 컴포넌트의 조각
 *    스킨이 **그 안에 중첩된 다른 컴포넌트의 같은 이름 조각까지 잡는다.** `docs`는
 *    `Card`(주의 상자) 안에 `List`를, `EntryForm` 안에 `Field`를 넣는 것이 정상 구성이라
 *    이 자리를 매번 지난다.
 * 2. **막는 방법이 순서뿐이다.** 안쪽 컴포넌트가 같은 조각을 **뒤에** 선언하면 이긴다
 *    (`emit/index.ts`가 `components` 객체의 키 순서로 규칙을 낸다). 즉 이 테마의 방어는
 *    선언 하나와 **그 선언의 자리**이고, 둘 중 무엇이 사라져도 케이스 없이는 아무도 모른다.
 *
 * **왜 `apps/web`인가.** `packages/themes`는 `renderer`를 볼 수 없어(§3.3) 중첩된 DOM을
 * 그릴 수 없고, `renderer`는 `themes`를 볼 수 없어 컴파일된 CSS를 얻을 수 없다.
 * 셋을 함께 보는 자리가 여기뿐이다(`system-theme.test.ts`의 머리말과 같은 근거).
 *
 * **jsdom은 `var()`를 치환하지 않는다**(P4a-2가 쟀다 — `renderer/test/css-probe.ts`).
 * 그래서 *"어느 규칙이 이겼는가"*를 **계산값에 남은 변수 이름**으로 읽는다. 두 규칙이
 * 서로 다른 토큰을 가리키므로 그것으로 갈린다.
 *
 * **특이도는 재지 않는다.** jsdom 25는 특이도도 `!important`도 안 보고 순서만 따른다
 * (P4b-2 ③이 대조 8건으로 쟀다 — 다시 재지 않았다). 여기서 다투는 두 조각 규칙은
 * **둘 다 (0,2,0)**이므로(`[data-wb-component="X"] [data-wb-part="p"]` — 속성 둘) 실제
 * 브라우저에서도 순서가 정한다. 즉 이 케이스의 결론은 jsdom의 한계에 걸리지 않는다.
 */
import { installStructures, renderNode, structureBaseCss } from '@wirebound/renderer'
import { installCatalog } from '@wirebound/schema'
import { compileTheme, resolveStyleValue, resolveTheme, systemTheme } from '@wirebound/themes'
import type { WbNode } from '@wirebound/schema'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'

beforeAll(() => {
  installCatalog()
  installStructures()
})

/** 주의 상자 안의 목록, 폼 안의 필드 — 둘 다 문서 사이트의 정상 구성이다. */
const NESTED: WbNode = {
  id: 'n_000000000001',
  type: 'Page',
  children: [
    {
      id: 'n_000000000002',
      type: 'Card',
      props: { title: '주의', subtitle: '읽어 두세요' },
      children: [{ id: 'n_000000000003', type: 'List', props: { items: 2, pagination: false } }],
    },
    {
      id: 'n_000000000004',
      type: 'EntryForm',
      props: { title: '피드백' },
      children: [
        { id: 'n_000000000005', type: 'Field', props: { label: '이메일', control: 'text' } },
      ],
    },
  ],
} as unknown as WbNode

/**
 * `docs`를 그려 조각의 계산값을 읽는다. **읽고 나서 걷어낸다** — 시트가 문서에 남으면
 * 다음 케이스가 두 벌을 겹쳐 재게 된다(`cascade.test.tsx`와 같은 형식).
 *
 * `structures`를 넘기지 않으면 카탈로그의 **첫 구조**가 그려져 테마가 고른 것을 하나도 안
 * 본 채로 재게 된다 — 프로브 1판에서 실제로 그랬고, `Card:plain`·`List:table`이 그려져
 * 중첩 조각이 아예 나오지 않았다.
 */
function readParts(part: string, property: string): Array<[owner: string, value: string]> {
  const { theme, issues } = resolveTheme(systemTheme('docs')!)
  // **오류만 본다**(P4c-1 T4). `docs`는 `Tree.parts.node.paddingX`로 노드 손잡이를 덮어
  // 경고 1건을 낸다 — 수와 자리는 `packages/themes/test/warning-channel.test.ts`가 못박는다.
  const errors = issues.filter((entry) => entry.severity === 'error')
  expect(errors.map((entry) => `${entry.path}: ${entry.message}`)).toEqual([])

  const structures: Record<string, string> = {}
  for (const [type, component] of theme!.components) structures[type] = component.structure

  const structureTag = document.createElement('style')
  structureTag.textContent = structureBaseCss()
  const themeTag = document.createElement('style')
  themeTag.textContent = compileTheme(theme!)
  document.head.append(structureTag, themeTag)

  const host = document.createElement('div')
  host.innerHTML = renderToStaticMarkup(renderNode(NESTED, { structures }))
  document.body.append(host)

  try {
    return [...document.querySelectorAll(`[data-wb-part="${part}"]`)].map((element) => [
      (element.closest('[data-wb-component]') as HTMLElement).dataset.wbComponent!,
      getComputedStyle(element).getPropertyValue(property),
    ])
  } finally {
    structureTag.remove()
    themeTag.remove()
    host.remove()
  }
}

describe('docs — 중첩된 컴포넌트가 남의 조각 스킨을 받지 않는다', () => {
  /**
   * `Card.parts.title`(주의 상자의 제목)과 `List.parts.title`(문서 목록의 제목)이 **같은
   * 이름**이고, 카드 안에 목록을 넣으면 자손 결합자가 둘을 다 잡는다.
   *
   * **실측(내가 쟀다):** `List.parts.title` 선언을 지우면 목록 제목 둘이 카드의
   * `var(--wb-semantic-text)`로 바뀌고 **이슈는 0건**이다. 선언은 둔 채
   * `Card`와 `List`의 **순서만** 뒤집어도 같은 결과다.
   */
  it('주의 상자 안의 목록 제목이 목록 자신의 색을 받는다', () => {
    const titles = readParts('title', 'color')

    // 카드 제목 1 + 목록 항목 2. 이 수가 줄면 중첩이 안 그려진 것이고 아래 단언이 헛돈다.
    expect(titles.map(([owner]) => owner)).toEqual(['Card', 'List', 'List'])
    expect(titles).toEqual([
      ['Card', 'var(--wb-semantic-text)'],
      ['List', 'var(--wb-semantic-primary)'],
      ['List', 'var(--wb-semantic-primary)'],
    ])
  })

  /**
   * `EntryForm.parts.label`은 **폼 제목**이고 `Field.parts.label`은 **필드 라벨**이다.
   * 이름이 겹치는 것은 P0 이월이 이미 지적한 자리이고, `admin`에서도 같은 짝이 실제로
   * 닿는다(P4b-2 ③이 152조합으로 쟀다 — *그쪽이 쟀다*).
   *
   * `text-transform`으로 가른다 — `docs`는 필드 라벨만 대문자로 만든다.
   */
  it('폼 안의 필드 라벨이 필드 자신의 스킨을 받는다', () => {
    expect(readParts('label', 'text-transform')).toEqual([
      ['EntryForm', ''],
      ['Field', 'uppercase'],
    ])
  })
})

/**
 * **`primitives`를 스타일 값이 가리킨다 — 그래서 `docs`의 읽기 폭이 한 곳이 됐다.**
 *
 * **이 절은 뒤집힌 케이스다. 지우지 않고 무엇이 언제 왜 바뀌었는지 남긴다**
 * (P4b-2의 `structures-data.test.tsx`가 쓴 형식이다).
 *
 * **P4b-3까지 이 절이 단언하던 것:** *"`resolveTheme`이 `checkThemeComponents`에 토큰 표만
 * 넘기고 참조 문법의 이름공간에도 `container`가 없다. 그래서 `"container.maxWidth"`는
 * 참조로 인식되지 않고 리터럴 문자열로 통과한다 — 이슈도 없고 `var()`도 아니다."*
 * 그리고 스스로 이렇게 적어 두었다: *"**이 케이스가 죽는 날은 그 구멍이 메워진 날이다.**
 * 그때 `docs`의 `primitives.container.maxWidth`와 `Section.parts.inner.maxWidth`를 한 값으로
 * 합쳐야 한다."*
 *
 * **2026-08-11(P4c-1 T1)에 그 날이 왔다.** 어휘를 열자 이 케이스가 죽었고, 지시대로
 * `docs`의 두 자리를 합쳤다. 여기서는 **합쳐진 결과**를 못박는다 — 값이 한 곳에만 적히고,
 * `:root`의 변수를 **실제로 가리키는 규칙이 있다**는 것까지.
 */
describe('primitives 참조 — docs의 읽기 폭이 한 곳이 됐다', () => {
  it('container.maxWidth가 var()로 풀린다 — 선언된 경로일 때만', () => {
    const declared = new Set(['container.maxWidth'])
    const resolved = resolveStyleValue(
      'container.maxWidth',
      new Map(),
      'probe',
      [],
      'probe',
      declared,
    )
    expect(resolved.issues).toEqual([])
    expect(resolved.value).toBe('var(--wb-container-maxWidth)')

    // 표가 없으면(= 그 자리에서 primitives를 가리킬 수 없으면) **리터럴로 통과하지 않는다.**
    // 침묵이 아니라 이슈가 되는 것이 T1의 요점이다.
    const forbidden = resolveStyleValue('container.maxWidth', new Map(), 'probe')
    expect(forbidden.value).toBeNull()
    expect(forbidden.issues.map((issue) => issue.code)).toEqual(['bad-style-value'])
  })

  it('docs의 읽기 폭은 한 곳이고 규칙이 :root의 변수를 가리킨다', () => {
    const { theme } = resolveTheme(systemTheme('docs')!)
    const css = compileTheme(theme!)

    expect(css).toContain('--wb-container-maxWidth: 720px;')
    expect(css).toContain('max-width: var(--wb-container-maxWidth);')
    // 손으로 맞춘 중복이 사라졌다. `Text.variants.body`의 `68ch`는 다른 축이라 그대로다.
    expect(css).not.toContain('max-width: 720px;')
    expect(css).toContain('max-width: 68ch;')
  })
})
