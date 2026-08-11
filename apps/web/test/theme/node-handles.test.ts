/**
 * **`themes`의 손잡이 표와 `renderer`의 구조 기본 CSS를 통째로 대조한다** (P4c-1 T4).
 *
 * ---
 *
 * ## 왜 이 자리인가 (§3.3)
 *
 * `themes`는 `renderer`를 볼 수 없다(§3.3의 의존표 — `public-api.test.ts`가 그것을
 * 소스 grep으로 지킨다). 그래서 손잡이 목록의 **소유가 갈라져 있다**:
 *
 * | 무엇 | 소유 |
 * |---|---|
 * | 손잡이 목록(`NODE_HANDLES`) | `themes`의 `spec/handles.ts` |
 * | 손잡이를 **읽는 규칙** | `renderer`의 `*CssBlocks()` |
 * | 둘이 어긋나지 않는지 | **여기** |
 *
 * `treeIndent`가 같은 문제를 먼저 겪었고 해법이 같았다(`cascade.test.tsx`의
 * `STYLE_PROPERTIES_BEYOND_SPEC` 대조).
 *
 * **표가 어긋나면 경고가 엉뚱한 자리에 붙거나 진짜 자리를 놓친다** — 어느 쪽도 케이스
 * 없이는 안 보인다. 손잡이는 값이 **조용히** 사라지는 부류이기 때문이다.
 *
 * ## 대조는 한 벌이다
 *
 * P4b-2 이월이 *"9개면 대조가 9벌"*이라고 적었다가 그 판의 리뷰가 반증했다
 * (**그쪽이 쟀다**). 여기서는 **표 하나를 통째로 비교**하므로 손잡이가 늘어도 이 파일이
 * 안 바뀐다 — 늘어난 손잡이를 `themes`가 등록하지 않으면 그 자체로 죽는다.
 *
 * ## 이 파일이 CSS를 파싱한다
 *
 * `structureBaseCss()`는 문자열 하나다. 규칙마다 셀렉터에서 **(컴포넌트, 범위)**를 읽고
 * 선언에서 `var(--wb-node-…)`·`var(--wb-tree-indent…)`를 읽는 것이 대조의 전부다.
 * 파서가 헛돌면 빈 집합끼리 비교해 조용히 통과하므로 **아래 첫 케이스가 그 파서를 먼저
 * 잰다**(`shell-css.test.ts`가 쓰는 카나리아 형식이다).
 */
import {
  NODE_VAR_PREFIX,
  TREE_INDENT_VAR,
  installStructures,
  structureBaseCss,
} from '@wirebound/renderer'
import { installCatalog } from '@wirebound/schema'
import { NODE_HANDLES, type NodeHandle } from '@wirebound/themes'
import { beforeAll, describe, expect, it } from 'vitest'

beforeAll(() => {
  installCatalog()
  installStructures()
})

/** `[data-wb-component="X"]` 하나와, 있으면 `[data-wb-part="p"]` 하나를 읽는다. */
const COMPONENT = /\[data-wb-component="([^"]+)"\]/
const PART = /\[data-wb-part="([^"]+)"\]/

/**
 * 구조 기본 CSS에서 **손잡이를 읽는 선언**을 전부 뽑는다.
 *
 * *"손잡이를 읽는다"*의 정의는 **선언 값이 노드 변수나 손잡이 변수를 가리킨다**이고,
 * 그 두 이름은 `renderer`가 상수로 내보낸다(`NODE_VAR_PREFIX`·`TREE_INDENT_VAR`) —
 * 여기서 문자열을 손으로 적지 않는다.
 */
function handlesInRendererCss(): NodeHandle[] {
  const found: NodeHandle[] = []
  for (const block of structureBaseCss().split('}')) {
    const open = block.indexOf('{')
    if (open === -1) continue
    const selector = block.slice(0, open)
    const component = COMPONENT.exec(selector)?.[1]
    if (component === undefined) continue
    const part = PART.exec(selector)?.[1] ?? null

    for (const line of block.slice(open + 1).split('\n')) {
      const declaration = /^\s*([-a-zA-Z]+):\s*(.+);\s*$/.exec(line)
      if (declaration === null) continue
      const [, property, value] = declaration as unknown as [string, string, string]
      if (!value.includes(`var(${NODE_VAR_PREFIX}`) && !value.includes(`var(${TREE_INDENT_VAR}`)) {
        continue
      }
      found.push({ component, part, property, carries: '' })
    }
  }
  return found
}

const key = (handle: { component: string; part: string | null; property: string }) =>
  `${handle.component}.${handle.part ?? '(base)'}.${handle.property}`

describe('노드 손잡이 표 — themes ↔ renderer 대조', () => {
  /**
   * **파서가 헛돌면 아래 대조가 빈 집합끼리 비교해 조용히 통과한다.** 그래서 먼저
   * 파서가 실제로 무언가를 읽는지, 그리고 **읽지 말아야 할 것을 안 읽는지**를 잰다.
   */
  it('파서가 실제로 구조 기본 CSS를 읽는다', () => {
    const css = structureBaseCss()
    expect(css.length).toBeGreaterThan(0)
    expect(css).toContain(NODE_VAR_PREFIX)

    const found = handlesInRendererCss()
    expect(found.length).toBeGreaterThan(0)
    // 손잡이를 안 읽는 선언(`display: grid` 등)은 걸리면 안 된다.
    expect(found.map((handle) => handle.property)).not.toContain('display')
  })

  /**
   * **표 하나를 통째로 비교한다.** 렌더러가 손잡이를 하나 더 만들고 `themes`에
   * 등록하지 않으면 여기가 죽고, 반대로 `themes`가 없는 손잡이를 적어도 죽는다.
   */
  it('두 표가 정확히 같다', () => {
    expect(handlesInRendererCss().map(key).sort()).toEqual(NODE_HANDLES.map(key).sort())
  })

  /**
   * **수를 따로 못박는다.** 위 대조는 *"둘이 같다"*만 말하므로 **양쪽이 함께 0이 되어도
   * 초록이다.** P4b-3의 ③이 이 값을 쟀다(*"규칙 6개·선언 9개"*) — 여기서 다시 센다.
   */
  it('규칙 6개 · 선언 9개다 — P4b-3의 ③이 잰 수와 같다', () => {
    const found = handlesInRendererCss()
    expect(found).toHaveLength(9)
    expect(new Set(found.map((handle) => `${handle.component}.${handle.part ?? '(base)'}`)).size).toBe(6)
  })

  /**
   * **`carries`는 대조하지 않는다 — 사람이 읽을 문장이라 렌더러에 대응물이 없다.**
   * 그래도 비어 있으면 경고 문장이 *"무엇이 사라지는가"*를 말하지 못하므로 그것만 본다.
   */
  it('손잡이마다 무엇을 나르는지가 적혀 있다', () => {
    for (const handle of NODE_HANDLES) {
      expect(handle.carries.length, key(handle)).toBeGreaterThan(0)
    }
  })
})
