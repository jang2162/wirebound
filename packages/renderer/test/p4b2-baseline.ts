/**
 * **P4b-2 준비 웨이브가 잰 것.** 구조 구현이 어디까지 와 있었는지를 이름으로 적어 둔 것이고,
 * `structure-groups.test.ts`·`structure-coverage.test.ts` 둘이 이것을 기준으로 잰다.
 *
 * **왜 수가 아니라 이름인가.** 병렬 워커 넷이 구조를 만들 때마다 수가 바뀐다. 수를
 * 못박으면 케이스가 매번 죽어 넷이 서로를 막고, 수만 재면 **무엇이 남았는지** 알 수 없다.
 * 이름으로 적으면 둘 다 된다 — 남은 것을 이름으로 말하면서, 하나가 만들어져도 안 죽는다.
 *
 * **이 파일은 카탈로그를 import하지 않는다.** 순수한 데이터라야 "카탈로그가 선언한 것"과
 * 대조할 대상이 된다 — 같은 자리에서 읽어 오면 대조가 아니라 동어 반복이 된다.
 */

/**
 * 준비 웨이브 직전에 **구현이 있던** 구조 19개. 그룹별로 적는다.
 *
 * 그룹 이름은 `structures/` 아래의 모듈 이름이자 `component/catalog/` 아래의 파일
 * 이름이다(P4b-2 D2가 그 둘이 같은 경계라는 데 기대어 워커를 나눴다).
 *
 * **이 목록은 줄면 안 되고 늘 수는 있다.**
 */
export const PREP_IMPLEMENTED: Record<string, string[]> = {
  structure: [
    'Page:default',
    'Slot:default',
    'Section:contained',
    'Flex:default',
    'Grid:default',
    'Card:plain',
    'Tabs:underline',
  ],
  data: ['List:table', 'Tree:indent', 'KeyValue:table'],
  input: ['SearchForm:inline', 'EntryForm:labelLeft', 'Field:outlined'],
  action: ['Button:solid', 'Link:default'],
  document: ['Text:default', 'Media:image', 'Divider:default', 'Placeholder:default'],
}

/**
 * 준비 웨이브 직전에 **구현이 없던** 구조 26개. **P4b-2 ②가 채울 목록 전체다.**
 *
 * 워커별로 적는다 — 계획서 D2의 분배 그대로다. `structure-coverage.test.ts`가
 * *"이 26이 정말 선언 45에서 구현 19를 뺀 것인가"*를 카탈로그와 대조하므로, 이 표가
 * 계획서에서 잘못 옮겨졌으면 그 케이스가 잡는다.
 *
 * **W4만 그룹 둘에 걸친다**(action·document). 나머지 셋은 그룹 하나와 워커 하나가 일대일이다.
 */
export const PREP_MISSING: Record<string, string[]> = {
  // 구조 그룹 — `structures/structure.tsx`
  W1: [
    'Section:fullBleed',
    'Section:splitBg',
    'Card:bordered',
    'Card:elevated',
    'Card:mediaTop',
    'Card:horizontal',
    'Tabs:pill',
    'Tabs:enclosed',
    'Tabs:vertical',
  ],
  // 데이터 그룹 — `structures/data.tsx`
  W2: [
    'List:cardGrid',
    'List:stackedList',
    'List:mediaList',
    'Tree:accordion',
    'KeyValue:definitionList',
    'KeyValue:cardGrid',
  ],
  // 입력 그룹 — `structures/input.tsx`
  W3: [
    'SearchForm:stacked',
    'SearchForm:collapsible',
    'EntryForm:labelTop',
    'EntryForm:sectioned',
    'Field:filled',
    'Field:underlined',
  ],
  // 액션·문서 그룹 — `structures/action.tsx`·`document.tsx`
  W4: ['Button:outline', 'Button:text', 'Media:video', 'Media:illustration', 'Media:chart'],
}

/** 워커 → 그 워커가 소유한 그룹 모듈. W4만 둘이다. */
export const WORKER_GROUPS: Record<string, string[]> = {
  W1: ['structure'],
  W2: ['data'],
  W3: ['input'],
  W4: ['action', 'document'],
}

/** 그룹 → 그 그룹이 소유한 컴포넌트 타입. 카탈로그 파일의 경계와 같다. */
export const GROUP_TYPES: Record<string, string[]> = {
  structure: ['Page', 'Slot', 'Section', 'Flex', 'Grid', 'Card', 'Tabs'],
  data: ['List', 'Tree', 'KeyValue'],
  input: ['SearchForm', 'EntryForm', 'Field'],
  action: ['Button', 'Link'],
  document: ['Text', 'Media', 'Divider', 'Placeholder'],
}

export const PREP_IMPLEMENTED_KEYS: string[] = Object.values(PREP_IMPLEMENTED).flat()
export const PREP_MISSING_KEYS: string[] = Object.values(PREP_MISSING).flat()
