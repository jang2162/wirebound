/**
 * **D6이 견줄 문서와 테마, 그리고 무엇을 덮었는지 세는 자.**
 *
 * `dom-compare.ts`와 같은 이유로 여기 산다 — `packages/exporter`의 견주기와 `apps/web`의
 * 캔버스↔번들 견주기가 **같은 문서·같은 테마**를 써야 두 결과를 나란히 읽을 수 있다.
 *
 * ---
 *
 * ## 덮개의 분모와 실제값
 *
 * **분모는 카탈로그**(`CATALOG_TYPES`가 선언한 타입·구조·variant)이고, **실제값은 그려진
 * DOM에서 읽는다.** 픽스처를 카탈로그에서 만들어도 census가 공허해지지 않는 이유가 그것이다 —
 * 덮였다고 세려면 렌더러가 실제로 `data-wb-structure`·`data-wb-variant`를 **내야** 하고,
 * §6.11의 그 계약이 깨지면 덮개가 줄어 census가 죽는다.
 */
import {
  CATALOG_TYPES,
  requireComponent,
  type ComponentDef,
  type PageDocument,
  type WbNode,
} from '@wirebound/schema'

/* ------------------------------------------------------------------ 문서 */

let nextId = 0

function id(): string {
  nextId += 1
  return `n_${String(nextId).padStart(12, '0')}`
}

/**
 * **카탈로그의 컴포넌트를 넓게 쓰는 문서**(D6: *"문서 하나로 재지 마라"*).
 *
 * **`Slot`만 빠져 있고 그것은 강제된 것이다** — §4.4가 `Slot`을 레이아웃의 것으로 두었고
 * `validatePage`가 페이지에 있는 `Slot`을 `error`로 막는다. 그래서 `slotFixture()`가 따로 있다.
 *
 * props를 기본값으로 두지 않는 것은 §6.11의 여섯 속성 중 `data-wb-variant`·`data-wb-state`가
 * **기본 props에서는 안 나오기** 때문이다.
 */
export function broadFixture(): PageDocument {
  nextId = 0
  return {
    version: 1,
    root: {
      id: id(),
      type: 'Page',
      children: [
        {
          id: id(),
          type: 'Section',
          variant: 'hero',
          children: [
            { id: id(), type: 'Text', props: { content: '회원 <목록> & "관리"', role: 'h2' } },
            { id: id(), type: 'Text', props: { content: '본문 텍스트' } },
            { id: id(), type: 'Divider', props: { direction: 'vertical' } },
            { id: id(), type: 'Media', props: { caption: '스크린샷', kind: 'chart' } },
            { id: id(), type: 'Placeholder', props: { label: '미정', height: 200 } },
          ],
        },
        {
          id: id(),
          type: 'Flex',
          props: { direction: 'column', wrap: true },
          children: [
            { id: id(), type: 'Button', variant: 'primary', props: { label: '저장', loading: true } },
            { id: id(), type: 'Button', variant: 'danger', props: { label: '삭제', disabled: true } },
            { id: id(), type: 'Link', variant: 'muted', props: { label: '도움말', disabled: true } },
          ],
        },
        {
          id: id(),
          type: 'Grid',
          props: { columns: 3 },
          children: [
            {
              id: id(),
              type: 'Card',
              props: { title: '요약', subtitle: '부제' },
              children: [{ id: id(), type: 'KeyValue', props: { columns: 2 } }],
            },
            {
              id: id(),
              type: 'Tabs',
              props: { tabs: ['개요', '상세'], active: 1 },
              children: [{ id: id(), type: 'Tree', props: { selected: true } }],
            },
          ],
        },
        {
          id: id(),
          type: 'SearchForm',
          children: [
            { id: id(), type: 'Field', props: { control: 'select', required: true, label: '등급' } },
          ],
        },
        {
          id: id(),
          type: 'EntryForm',
          props: { title: '등록' },
          children: [
            {
              id: id(),
              type: 'Field',
              props: { control: 'checkbox', disabled: true, invalid: true, label: '동의' },
            },
          ],
        },
        { id: id(), type: 'List', variant: 'compact', props: { items: 3, selected: true } },
      ],
    },
  }
}

/**
 * `Slot` 하나만 든 문서. **유효한 페이지가 아니다** — `validatePage`가 `slot-count`
 * `error`를 낸다(케이스가 그 문장을 값으로 든다).
 *
 * 그래도 견주는 이유: 렌더 경로는 검증을 지나지 않으므로 이 노드를 그리고, **P8-2가
 * 레이아웃을 번들에 넣을지 판정하는 자리**(P7-3 이월 §5)에서 이것이 첫 손님이 된다.
 */
export function slotFixture(): PageDocument {
  nextId = 900
  return {
    version: 1,
    root: { id: id(), type: 'Page', children: [{ id: id(), type: 'Slot' }] },
  }
}

/**
 * `data-wb-variant`에 실릴 값을 노드에 어떻게 넣는지는 **컴포넌트마다 다르다**(P4a-1의
 * `variantFrom`). 그 갈래를 카탈로그에서 읽어 노드를 만든다.
 *
 * - `variantFrom`이 있으면 그 **prop**에 값을 넣는다(`Text.role`·`Divider.direction`·
 *   `Field.control`). 그쪽이 `node.variant`를 **이긴다**(`attrs.ts`의 판정).
 * - 없으면 `node.variant`에 넣는다.
 */
function variantNode(def: ComponentDef, variant: string): WbNode {
  const node: WbNode = { id: id(), type: def.type }
  if (def.variantFrom !== undefined) return { ...node, props: { [def.variantFrom]: variant } }
  return { ...node, variant }
}

/**
 * **카탈로그가 선언한 variant를 전부 쓰는 문서.**
 *
 * 카탈로그에서 만든다. **그래도 census가 공허하지 않다** — 덮였다고 세는 것은 이 문서가
 * 아니라 **그려진 DOM의 `data-wb-variant`**이고, 렌더러가 그 속성을 안 내면 덮개가 줄어
 * census가 죽는다(§6.11의 계약이 바로 그 자리다).
 *
 * `children: 'none'`인 컴포넌트도 있으므로 **자식을 달지 않는다** — 달면
 * `children-not-allowed` `error`가 난다.
 */
export function variantFixture(): PageDocument {
  nextId = 1000
  const children = CATALOG_TYPES.flatMap((type) => {
    const def = requireComponent(type)
    return def.variants.map((variant) => variantNode(def, variant))
  })
  return { version: 1, root: { id: id(), type: 'Page', children } }
}

/**
 * **폴백 상자를 그리게 하는 문서.** 렌더러가 노드를 못 그리는 갈래 넷을 한 문서에 담는다 —
 * 알 수 없는 타입 · props 검증 실패 · 노드가 객체가 아님 · `id`가 문자열이 아님.
 *
 * **유효한 페이지가 아니다**(그것이 요점이다). 번들이 폴백이 든 HTML을 내는 것은 실재하는
 * 상태이고(카탈로그가 늦게 바뀐 문서·낙관적 패치가 지나간 문서), **그 상자에는 인라인
 * `style`이 단축 속성(`font`)까지 실려 있어** 갈림 ㉠이 가장 세게 나타나는 자리다.
 */
export function brokenFixture(): PageDocument {
  nextId = 2000
  return {
    version: 1,
    root: {
      id: id(),
      type: 'Page',
      children: [
        { id: id(), type: '없는타입' },
        { id: id(), type: 'List', props: { 없는프롭: 1 } },
        null as unknown as WbNode,
        { id: 7 as unknown as string, type: 'Text' },
      ],
    },
  }
}

/* ------------------------------------------------------------------ 테마 */

/** 테마 규격의 최소 꼴. `resolveTheme`이 받는 문서다. */
export interface CoverageThemeDocument {
  meta: { id: string; name: string; version: string }
  components: Record<string, { structure: string }>
}

/**
 * **카탈로그가 선언한 구조를 전부 고르게 하는 테마 묶음.**
 *
 * 시스템 테마 다섯이 고르는 것만으로는 구조가 다 안 덮인다(실측: `Section:fullBleed` ·
 * `Tabs:vertical` · `SearchForm:stacked` · `Media:video` · `Media:chart`가 남았다). 구조를
 * 고르는 것은 **테마**이므로(`themeStructures`), 남은 것을 덮으려면 그것을 고르는 테마가
 * 있어야 한다 — `exportPage`에 구조를 직접 넘기는 인자를 만들지 않는 이유는 그러면 구조
 * 선택의 자리가 둘이 되기 때문이다(D6).
 *
 * 테마 하나가 타입마다 구조 하나를 고르므로 **가장 많은 구조를 선언한 타입의 수만큼** 테마가
 * 필요하다. `i`번째 테마는 각 타입의 `structures[i]`를 고르고, 그 타입에 그만큼이 없으면
 * 마지막 것을 고른다.
 */
export function coverageThemes(): CoverageThemeDocument[] {
  const depth = Math.max(...CATALOG_TYPES.map((type) => requireComponent(type).structures.length))
  return Array.from({ length: depth }, (_unused, index) => ({
    meta: { id: `coverage-${index}`, name: `덮개 ${index}`, version: '1.0.0' },
    components: Object.fromEntries(
      CATALOG_TYPES.map((type) => {
        const structures = requireComponent(type).structures
        return [type, { structure: structures[Math.min(index, structures.length - 1)]! }]
      }),
    ),
  }))
}

/* ------------------------------------------------------------------ 세는 자 */

/** 카탈로그가 선언한 `타입:구조` 전부. */
export function declaredStructures(): string[] {
  return CATALOG_TYPES.flatMap((type) =>
    requireComponent(type).structures.map((structure) => `${type}:${structure}`),
  ).sort()
}

/** 카탈로그가 선언한 `타입:variant` 전부. */
export function declaredVariants(): string[] {
  return CATALOG_TYPES.flatMap((type) =>
    requireComponent(type).variants.map((variant) => `${type}:${variant}`),
  ).sort()
}

/** 문서가 실제로 쓰는 컴포넌트 타입. */
export function typesIn(document_: PageDocument): string[] {
  const seen = new Set<string>()
  const walk = (node: unknown): void => {
    if (node === null || typeof node !== 'object') return
    const { type, children } = node as { type?: unknown; children?: unknown }
    if (typeof type === 'string') seen.add(type)
    if (Array.isArray(children)) children.forEach(walk)
  }
  walk(document_.root)
  return [...seen].sort()
}

/**
 * 그려진 트리가 실제로 낸 `타입:구조`·`타입:variant`.
 *
 * **DOM에서 읽는 것이 요점이다** — 문서에 적힌 것이 아니라 §6.11의 속성으로 **나온 것**을
 * 센다. 렌더러가 그 속성을 안 내면 여기서 줄어든다.
 */
export function renderedPairs(root: Element): { structures: string[]; variants: string[] } {
  const structures = new Set<string>()
  const variants = new Set<string>()
  const visit = (element: Element): void => {
    const type = element.getAttribute('data-wb-component')
    if (type !== null) {
      const structure = element.getAttribute('data-wb-structure')
      if (structure !== null) structures.add(`${type}:${structure}`)
      const variant = element.getAttribute('data-wb-variant')
      if (variant !== null) variants.add(`${type}:${variant}`)
    }
    for (const child of [...element.children]) visit(child)
  }
  visit(root)
  return { structures: [...structures].sort(), variants: [...variants].sort() }
}
