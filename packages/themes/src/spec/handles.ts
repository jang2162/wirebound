import { own } from '../own'
import { STYLE_PROPERTIES } from '../resolve/style'

/**
 * **노드 손잡이 표** — 구조 기본 CSS(`renderer`)가 노드에서 받은 값을 읽어 내는 자리
 * (P4c-1 T4 · 재라 #6).
 *
 * ---
 *
 * ## 무엇을 막는가 — P4b-3의 "벽 3"
 *
 * 구조 구현체는 노드 props를 커스텀 프로퍼티로 실어 보내고(`--wb-node-*`), 구조 기본
 * CSS가 그것을 읽어 실제 선언을 만든다. 예: `Flex`의 `direction` prop이
 * `--wb-node-flex-direction`이 되고 규칙이 `flex-direction: var(--wb-node-flex-direction, row)`를
 * 낸다.
 *
 * **테마가 같은 셀렉터에서 같은 CSS 프로퍼티를 내면 그 손잡이가 통째로 죽는다.** 두
 * 셀렉터의 특이도가 같고(둘 다 (0,2,0) — `:where()`는 0이다) 테마 시트가 뒤에 오므로
 * **테마가 이긴다.** §6.5대로 테마가 이기는 것 자체는 옳다 — 결함은 그것이 **조용하다**는
 * 것이다. 노드에서 `direction: 'column'`을 고른 사람은 그 값이 어디로 갔는지 알 수 없다.
 *
 * **W3이 그 결말을 실증했다**(P4b-2의 W3이 쟀다): `Media.parts.frame`에 `aspectRatio`를
 * 심으니 노드의 `ratio`가 **이슈 0건·죽는 케이스 0건**으로 사라졌다.
 *
 * ---
 *
 * ## 구조를 표에 넣지 않는다 — **덫은 한 칸 거리다**
 *
 * 손잡이 규칙 중 하나(`Tree.node`)는 `:where([data-wb-structure="indent"])`로 좁혀져 있어서
 * 그 구조를 고르지 않은 테마에서는 **오늘 적중이 0이다.** P4b-3의 ③이 쟀다:
 * `portal`·`docs`가 `Tree.parts.node.paddingX`를 선언하고 손잡이와 **셀렉터가 정확히
 * 같은데**, 둘 다 `Tree:accordion`을 골라 손잡이 규칙이 0개 적중한다.
 *
 * **그럼에도 경고를 붙인다.** 근거는 그 이월의 판정이다 — *"선택이 신중해서 안 아픈 것이
 * 아니라 우연이다. 누구든 `Tree:indent` + `Tree.parts.node.paddingX`를 함께 고르는 순간
 * 들여쓰기가 **이슈 0건으로** 사라진다. 그 조합은 전혀 이상하지 않다."* 구조까지 표에 넣어
 * 경고를 좁히면, **구조를 한 칸 바꾸는 편집이 경고 없이 값을 없앤다.** 경고의 쓸모는
 * *"지금 죽었다"*가 아니라 *"여기서 죽는다"*다.
 *
 * 그래서 축은 셋이다: **(컴포넌트, 범위, CSS 프로퍼티)**. 범위는 `null`(컴포넌트 루트)이나
 * 조각 이름이다 — 그것이 두 규칙의 셀렉터가 겹치는 단위다.
 *
 * ---
 *
 * ## 이 표를 `themes`가 갖는 이유와 대조하는 자리 (§3.3)
 *
 * `themes`는 `renderer`를 볼 수 없다(§3.3의 의존표). `treeIndent`가 같은 문제를 이미
 * 겪었고 해법이 **소유를 가르고 `apps/web`이 대조하는 것**이었다
 * (`STYLE_PROPERTIES_BEYOND_SPEC`의 소유 표).
 *
 * | 무엇 | 소유 | 왜 |
 * |---|---|---|
 * | 손잡이 목록(이 표) | **`themes`** | 테마 문서를 검증하는 것이 이 패키지다 |
 * | 손잡이를 **읽는 규칙** | **`renderer`**(`*CssBlocks()`) | 손잡이는 구조 구현체의 것이다 |
 * | 둘이 어긋나지 않는지 | **`apps/web`의 케이스** | 둘 다 보는 자리가 거기뿐이다 |
 *
 * **대조는 한 벌이다.** `apps/web/test/theme/node-handles.test.ts`가 렌더러의 구조 기본
 * CSS를 파싱해 같은 축의 표를 만들고 **이 표와 통째로 비교한다.** P4b-2 이월이
 * *"9개면 대조가 9벌"*이라고 적었다가 그 판의 리뷰가 반증했다(**그쪽이 쟀다**) —
 * 표 하나를 비교하는 케이스 하나면 되고 손잡이가 늘어도 안 바뀐다.
 *
 * **`schema`로 옮기지 않는다.** §5.1의 `ComponentDef`에 손잡이 축이 없어 계약을 넓히는
 * 일이 된다(`STYLE_PROPERTIES_BEYOND_SPEC`이 같은 이유로 같은 판정을 했다).
 *
 * **`spec/components.ts` 안이 아니라 새 파일인 이유(재라 #6):** 그 파일이 대조하는 것은
 * **카탈로그**(`schema`의 `ComponentDef`)이고, 이 표가 대조하는 것은 **렌더러의 CSS**다.
 * 소유자가 다른 두 계약이라 한 파일에 두면 `apps/web`의 대조가 무엇을 겨냥하는지 흐려진다.
 */
export interface NodeHandle {
  /** 카탈로그 컴포넌트 타입. */
  component: string
  /** `null`이면 컴포넌트 루트 규칙, 아니면 조각 이름. */
  part: string | null
  /** 구조 기본 CSS가 그 자리에서 내는 CSS 프로퍼티 이름. */
  property: string
  /** 손잡이가 나르는 값이 무엇인지 — 경고 문장에 그대로 실린다. */
  carries: string
}

/**
 * **오늘 규칙 6개·선언 9개다**(P4b-3의 ③이 셌고 P4c-1이 `apps/web`의 대조로 다시 센다).
 * 여기 개수를 적지 않는 것은 그 대조가 수를 세기 때문이다.
 */
export const NODE_HANDLES: readonly NodeHandle[] = [
  // `structures/structure.tsx` — Flex:default
  { component: 'Flex', part: null, property: 'flex-direction', carries: 'Flex의 direction prop' },
  { component: 'Flex', part: null, property: 'align-items', carries: 'Flex의 align prop' },
  { component: 'Flex', part: null, property: 'justify-content', carries: 'Flex의 justify prop' },
  { component: 'Flex', part: null, property: 'flex-wrap', carries: 'Flex의 wrap prop' },
  // `structures/structure.tsx` — Grid:default
  {
    component: 'Grid',
    part: null,
    property: 'grid-template-columns',
    carries: 'Grid의 columns prop',
  },
  // `structures/data.tsx` — KeyValue:cardGrid
  {
    component: 'KeyValue',
    part: null,
    property: 'grid-template-columns',
    carries: 'KeyValue의 columns prop',
  },
  // `structures/data.tsx` — Tree:indent (조각 `node`)
  {
    component: 'Tree',
    part: 'node',
    property: 'padding-left',
    carries: 'Tree:indent의 단계별 들여쓰기',
  },
  // `structures/document.tsx` — Media (조각 `frame`, 구조 전부)
  { component: 'Media', part: 'frame', property: 'aspect-ratio', carries: 'Media의 ratio prop' },
  // `structures/document.tsx` — Placeholder:default
  { component: 'Placeholder', part: null, property: 'height', carries: 'Placeholder의 height prop' },
]

/**
 * 축약 프로퍼티가 덮는 낱개 프로퍼티.
 *
 * **§6.8의 어휘 중 이 표에 실제로 걸리는 것은 `padding` 하나다** — `Tree.parts.node`의
 * `padding-left`를 `padding` 한 줄이 덮는다. `paddingX`는 이미 `padding-left`를 직접 내므로
 * (`STYLE_PROPERTIES`) 여기 없어도 잡힌다. `margin`은 오늘 어느 손잡이도 마진을 안 내지만
 * 같은 부류라 함께 적는다 — 손잡이가 하나 늘 때 이 자리를 다시 발견하지 않게 한다.
 *
 * **CSS 축약 전체를 모델링하지 않는다.** `background`가 `background-size`를 지우는 것 같은
 * 자리는 여기 없다 — 손잡이가 그 프로퍼티를 내지 않으므로 오늘 세울 근거가 없고,
 * 근거 없이 표를 넓히면 거짓 양성이 는다.
 */
const SHORTHAND_COVERS: Readonly<Record<string, readonly string[]>> = {
  padding: ['padding-top', 'padding-bottom', 'padding-left', 'padding-right'],
  margin: ['margin-top', 'margin-bottom', 'margin-left', 'margin-right'],
}

/** 스타일 어휘 하나가 실제로 덮는 CSS 프로퍼티 전부(축약 포함). */
export function coveredProperties(prop: string): readonly string[] {
  return own(SHORTHAND_COVERS, prop) ?? own(STYLE_PROPERTIES, prop) ?? []
}

/**
 * 이 자리에서 스타일 어휘 하나가 덮어쓰는 손잡이들. 없으면 빈 배열이다.
 *
 * `part`는 `null`(컴포넌트 루트)이거나 조각 이름이다.
 */
export function overwrittenHandles(
  component: string,
  part: string | null,
  prop: string,
): readonly NodeHandle[] {
  const covered = coveredProperties(prop)
  if (covered.length === 0) return []
  return NODE_HANDLES.filter(
    (handle) =>
      handle.component === component &&
      handle.part === part &&
      covered.includes(handle.property),
  )
}

/** 경고 문장. **한 곳에서 만든다** — 두 자리가 따로 쓰면 같은 문제가 다르게 읽힌다. */
export function handleOverwriteMessage(handle: NodeHandle, prop: string): string {
  return (
    `${prop}가 ${handle.component}${handle.part === null ? '' : `의 ${handle.part} 조각`}에서 ` +
    `구조 기본 CSS의 ${handle.property}를 덮어씁니다 — ${handle.carries}가 화면에 반영되지 않습니다 ` +
    '(§6.5대로 테마가 이깁니다. 의도한 것이면 그대로 두세요)'
  )
}
