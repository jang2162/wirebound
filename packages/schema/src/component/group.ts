/**
 * **컴포넌트의 갈래.** 카탈로그가 파일로 나눠 둔 분류를 런타임에 올린다.
 *
 * ## 왜 «선언»인가 — 파일에서 유도할 수 없다
 *
 * 분류는 이미 파일에 있다(`catalog/structure.ts` · `data.ts` · `input.ts` · `action.ts` ·
 * `document.ts`). 그것을 그대로 쓰면 두 벌이 안 되지만 **실행 시점에 파일 경로를 모른다** —
 * 번들러를 지나면 다섯 모듈이 한 덩어리가 되고 `import.meta.url`류로 되짚는 것은 zod 외의
 * 런타임 의존을 갖지 않는다는 이 패키지의 제약을 넘는다.
 *
 * **그래서 선언하고, 어긋나는 것은 케이스가 막는다.** 테스트는 파일 경로를 안다 —
 * `catalog/*`를 모듈째 각각 import해 *"그 모듈이 내보내는 def은 전부 그 파일의 갈래를
 * 선언한다"*를 기계로 본다(`test/component/group.test.ts`). 선언과 파일이 갈리는 순간
 * 거기서 죽으므로, 선언의 단순함을 얻으면서 유도의 무결성을 잃지 않는다.
 *
 * ## 이것은 설계서 「컴파일」(테마)의 «여섯» 밖이다
 *
 * 「컴파일」이 못박은 여섯은 **렌더러가 내보내는 DOM 속성**이다(`data-wb-id` ·
 * `data-wb-component` · `data-wb-structure` · `data-wb-variant` · `data-wb-part` ·
 * `data-wb-state`). 갈래는 DOM에 나가지 않고 테마 셀렉터가 되지도 않는다 —
 * 사람에게 보이는 축이지 테마의 어휘가 아니다. `define.ts`의 `ComponentDef` 주석이 그
 * 구분을 적는다.
 */

/**
 * 갈래의 **순서**이기도 하다. 고르개가 이 순서로 그룹을 낸다 — 담는 것(구조)에서
 * 담기는 것(문서)으로 간다. 알파벳순으로 두면 `action`이 맨 앞에 와 화면을 만드는 순서와
 * 어긋난다.
 */
export const COMPONENT_GROUPS = ['structure', 'data', 'input', 'action', 'document'] as const

export type ComponentGroup = (typeof COMPONENT_GROUPS)[number]

/**
 * 갈래를 사람이 부르는 이름. **고르개의 `<optgroup label>`이 이것이다.**
 *
 * `Record<ComponentGroup, string>`이므로 갈래를 더하면 여기를 채우지 않고는 컴파일되지
 * 않는다 — 표가 낡는 것을 타입이 막는 자리다.
 */
export const COMPONENT_GROUP_LABELS: Record<ComponentGroup, string> = {
  structure: '구조',
  data: '데이터',
  input: '입력',
  action: '액션',
  document: '문서',
}

export function isComponentGroup(value: unknown): value is ComponentGroup {
  return typeof value === 'string' && (COMPONENT_GROUPS as readonly string[]).includes(value)
}
