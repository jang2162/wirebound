import { z } from 'zod'
import { COMPONENT_GROUPS, isComponentGroup, type ComponentGroup } from './group'

/** 속성 패널이 자동 생성할 입력 컨트롤 종류 */
export type EditorControl = 'text' | 'textarea' | 'number' | 'switch' | 'select' | 'stringList' | 'pairList'

export interface EditorField {
  prop: string
  control: EditorControl
  label: string
  /** control이 'select'일 때 선택지 */
  options?: string[]
}

/** 사람이 읽을 이름의 상한. 고르개의 `<option>` 한 줄에 표시(`담을 수 있음`)와 함께 든다. */
const LABEL_MAX = 12

/**
 * 설명의 상한. 240px 좌측 패널에서 12px 글자로 **두 줄**쯤이다. 상한이 없으면 한 컴포넌트가
 * 고르개를 세로로 밀어낸다 — 긴 이름이 프리셋 고르개를 가로로 밀어내는 것과 같은 부류다.
 */
const DESCRIPTION_MAX = 60

/**
 * 컴포넌트의 계약.
 *
 * ## 두 축이 있다 — 섞지 않는다
 *
 * | 축 | 필드 | 누가 읽는가 |
 * |---|---|---|
 * | **노드의 계약** | `props`·`editor`·`variantFrom`·`states`·`zones`·`placement`·`bodyHost` | 검증기·렌더러·속성 패널 |
 * | **사람이 읽을 것** | `label`·`description`·`group`·`summary` | 저작 UI(타입 고르개·문장화·구조 트리 줄) |
 *
 * 아래 축은 **DOM에 나가지 않는다.** 렌더러가 노드에 싣는 `data-wb-*`(`id`·`component`·`variant`·`state`)는 전부 위
 * 축에서 나오고, 사람이 읽을 필드는 그중 하나도 만들지 않는다.
 *
 * **구조 · 조각 · 변형은 여기 없다 — 테마가 선언한다.** 화면은 테마의 뷰가 그리고(`@wirebound/theme-sdk`), 고를 수 있는
 * 변형은 테마 manifest 의 `components[type].variants` 가 든다. 그래서 스키마는 `node.variant` 의 값을 판정하지 않는다
 * (`validate.ts`).
 */
export interface ComponentDef {
  type: string
  /**
   * 사람이 읽는 이름. `List` → `목록`. **한국어 UI가 영문 타입명을 그대로 내지 않게 하는
   * 자리다** — 고르개도 상호작용 문장도 이것을 쓴다(`interaction/describe.ts`의
   * `COMPONENT_NOUNS`가 여기서 유도된다).
   *
   * **필수다.** 선택으로 두면 새 컴포넌트가 조용히 영문 이름으로 떨어지는데, 그것이 이
   * 필드가 막는 고장 그 자체다.
   */
  label: string
  /**
   * 한 줄 설명. *"EntryForm이 무엇인가"*를 화면이 답하는 자리다.
   *
   * **필수다.** 이름만으로 갈리지 않는 짝이 카탈로그에 이미 있다(`SearchForm` 검색폼 ·
   * `EntryForm` 입력폼 / `Flex` 배치 · `Grid` 그리드). 선택으로 두면 하필 그런 것이 비고
   * 화면은 다시 답하지 못한다.
   */
  description: string
  /**
   * 갈래. 카탈로그가 **파일로** 나눠 둔 분류를 런타임에 올린 것이고, 선언과 파일이
   * 어긋나지 않는 것은 케이스가 본다 — 근거는 `group.ts`가 소유한다.
   */
  group: ComponentGroup
  props: z.ZodType
  editor: EditorField[]
  /**
   * 이 enum prop의 값이 `data-wb-variant`가 된다 — `node.variant` 대신(`renderer`의 `resolveVariant`).
   *
   * **왜 새 선언 채널을 만들지 않는가:** `data-wb-role`(Text)·`data-control`(Field)·
   * `data-direction`(Divider) 같은 속성은 한 부류다 — 셋 다 *"노드의 enum
   * prop에서 파생되는 표현 변형"*이고, 채널이 없으면 컴포넌트마다 각자 속성을 만든다.
   * 설계서 「컴포넌트 정의 구조」는 이미 같은 모양의 채널을 하나 갖고 있다(같은 이름의 boolean prop이 true면
   * `data-wb-state`). 빠진 것은 **enum prop → `data-wb-variant`**뿐이므로 그것을 채운다 — 테마가 겨냥할 속성이 늘지 않는다.
   */
  variantFrom?: string
  /**
   * 구조 트리 줄에서 타입 곁에 흐리게 붙는 한 줄 — 같은 타입이 여럿일 때 어느 것인지 가르는 데까지만(`Flex` → `가로`,
   * `Button` → 라벨). 없는 컴포넌트는 요약이 없다. 받는 값은 기본값을 채운 props 이고, 규격에 안 맞는 노드면 원본
   * props 다 — 그래서 값을 믿지 않고 읽는다(`./summary.ts`의 읽개들). 부르는 자리는 `display.ts`의 `nodeSummary` 하나다.
   */
  summary?: (props: Record<string, unknown>) => string | null
  /** 같은 이름의 prop이 true면 활성화되는 상태 */
  states: string[]
  /**
   * 자식 자리(구역) 선언 — **차례가 곧 순회 · 화면 차례다**(`../zones.ts`의 `childLists`). 이름이 `BODY_ZONE`(`body`)이면 몸통(`node.children`),
   * 그 밖은 `node.zones[name]`이다. 빈 목록이면 자식을 안 받는다.
   */
  zones: readonly ZoneDef[]
  /** 이 타입이 설 수 있는 자리. 없으면 아무 데나. 밖에 서면 검증의 `misplaced-component`다. */
  placement?: { type: string; zone: string }
  /**
   * 몸통을 누가 그리나. `'parent'` 면 이 타입의 뷰는 몸통을 `null` 로 받고, 렌더러가 그 몸통을 부모 뷰의 `items[i].content` 로 넘긴다
   * (탭 머리와 탭 내용이 DOM 에서 부모 · 자식이 아닌 `TabPanel`). 없으면 `'self'`.
   */
  bodyHost?: 'self' | 'parent'
}

/** 구역 하나의 선언. */
export interface ZoneDef {
  /** `body` 면 몸통(`children`), 그 밖은 `zones[name]`. 꼴은 `ZONE_NAME_PATTERN`이고 한 컴포넌트 안에서 겹치지 않는다. */
  name: string
  /** 화면 이름 — 구조 트리의 구역 줄 · 이유 문장. `label`과 같은 검사를 받는다. */
  label: string
  /** 받는 타입. 없으면 무엇이든(밖이면 검증의 `zone-type-not-allowed`). */
  accepts?: readonly string[]
  /**
   * 에디터가 노드를 새로 만들 때 이 구역에 넣는 내용 — 지울 수 있는 보통 노드다(id 는 만들 때 짓는다). 문서에 굽는 prop 기본값과 다른 축이다:
   * 이것은 사람이 고치고 지울 **내용**이다. MCP · REST 로 쓰는 쪽은 받지 않는다(서버는 문서를 고쳐 쓰지 않는다).
   */
  initial?: readonly NodeSeed[]
}

/** 기본 내용 한 개. `props`가 그 타입의 규격을 지나는지는 카탈로그를 모은 자리가 본다(`catalog/index.ts`의 `assertZoneReferences`). */
export interface NodeSeed {
  type: string
  props?: Record<string, unknown>
  /**
   * 노드의 `variant` — 폼의 주 단추(`primary`)처럼 기본 내용 가운데 하나를 돋운다. 값은 스키마가 판정하지 않는다(테마가 선언한다). 선언 안 한 테마는
   * lint `theme-variant`(경고)를 내고 제 `defaultVariant` 로 그리므로, 흔한 이름(스타터 테마 · 기본테마가 둘 다 선언하는 `primary`)만 쓴다.
   */
  variant?: string
}

/** 구역 이름의 꼴 — JSON Pointer 이스케이프가 필요 없고 프로토타입 토큰(`__proto__`)이 꼴에서 빠진다. */
export const ZONE_NAME_PATTERN = /^[a-z][A-Za-z0-9]{0,31}$/

/** 몸통 구역의 이름 — 그 내용은 `node.children` 에 산다(`node.zones.body` 는 봉투가 거절한다). */
export const BODY_ZONE = 'body'

/** 계약의 자체 정합성을 확인하고 그대로 돌려준다. */
export function defineComponent(def: ComponentDef): ComponentDef {
  const { type } = def

  /**
   * **사람이 읽을 축을 같은 결로 검사한다.** 아래 어휘 검사들이 *"선언은 있는데 닿을 수
   * 없다"*를 막는 것처럼, 여기서는 *"화면에 낼 말이 없다"*와 *"내면 화면이 깨진다"*를
   * 막는다. 걸리면 컴포넌트를 정의하는 **그 자리에서** 걸린다.
   *
   * **빈 문자열을 통과시키지 않는다.** 타입만으로는 `label: ''`이 막히지 않는데, 그러면
   * 고르개에 **글자 없는 항목**이 서고 고를 수는 있다 — 없는 것보다 나쁜 상태다.
   */
  assertHumanText(type, 'label', def.label, LABEL_MAX)
  assertHumanText(type, 'description', def.description, DESCRIPTION_MAX)
  // 타입이 이미 막지만 `as`로 지나온 값·JSON에서 온 값은 여기서만 걸린다. 조용히 통과하면
  // 고르개가 그 컴포넌트를 **어느 그룹에도 못 넣어** 목록에서 통째로 사라진다.
  if (!isComponentGroup(def.group)) {
    throw new Error(`${type}: group이 갈래 목록에 없습니다: ${String(def.group)} ` + `(${COMPONENT_GROUPS.join(' · ')})`)
  }

  assertUnique(type, 'states', def.states)
  assertUnique(
    type,
    'zones',
    def.zones.map((zone) => zone.name),
  )
  for (const zone of def.zones) {
    if (!ZONE_NAME_PATTERN.test(zone.name)) throw new Error(`${type}: 구역 이름의 꼴이 아닙니다: ${zone.name}`)
    assertHumanText(type, `zones.${zone.name}.label`, zone.label, LABEL_MAX)
  }
  if (def.bodyHost === 'parent' && !def.zones.some((zone) => zone.name === BODY_ZONE)) {
    throw new Error(`${type}: bodyHost 가 parent 인데 몸통 구역이 없습니다`)
  }

  const known = propKeys(def.props)
  for (const field of def.editor) {
    if (!known.has(field.prop)) {
      throw new Error(`${type}: editor가 스키마에 없는 prop을 가리킵니다: ${field.prop}`)
    }
  }

  // **도달 가능한 prop 집합.** 테마 manifest 의 `hideProps`가 감추는 것도 센다 — 그것은 변형에 따라 **감출**
  // 뿐이고, 다른 변형에서는 보인다. 감춰지는 것과 없는 것은 다르다.
  const editable = new Set(def.editor.map((field) => field.prop))

  for (const state of def.states) {
    if (!known.has(state)) {
      throw new Error(`${type}: states와 같은 이름의 prop이 없습니다: ${state}`)
    }
  }

  /**
   * **도달성 — 설계서 「컴포넌트 정의 구조」가 *"속성 패널이 `editor`에서 자동 생성된다"*고 한 것의 결과.**
   *
   * `editor`에 없는 prop은 **UI에서 도달 불가**다. 상태가 그렇게 되면 설계서 「컴포넌트 정의 구조」이 상태의 쓸모로
   * 든 *"'선택된 행 강조' 같은 서술을 목업에서 실제로 보여주려면"*이 성립하지 않는다 —
   * 켤 방법이 없기 때문이다. 이 검사가 없으면 그런 자리가 카탈로그에 소리 없이 생긴다.
   *
   * **케이스를 하나씩 더하는 대신 여기서 던진다.** 카탈로그가 커질 때 같은 구멍이 다시
   * 나지 않게 하려는 것이고, 걸리면 컴포넌트를 정의하는 **그 자리에서** 걸린다.
   *
   * **한 번에 전부 말한다** — 하나씩 고치며 다시 돌리게 하지 않는다.
   */
  const unreachableStates = def.states.filter((state) => !editable.has(state))
  if (unreachableStates.length > 0) {
    throw new Error(
      `${type}: states가 editor에 없어 속성 패널에서 켤 수 없습니다: ${unreachableStates.join(', ')} ` +
        '(속성 패널은 editor에서 자동 생성됩니다)',
    )
  }

  if (def.variantFrom !== undefined) {
    const prop = def.variantFrom
    if (!known.has(prop)) {
      throw new Error(`${type}: variantFrom이 스키마에 없는 prop을 가리킵니다: ${prop}`)
    }
    const values = enumValues(def.props, prop)
    if (values === null) {
      throw new Error(`${type}: variantFrom이 가리키는 prop이 enum이 아닙니다: ${prop}`)
    }
    /**
     * **`variantFrom`의 예외가 구멍이 되는 자리.**
     *
     * 속성 패널은 `variantFrom`을 가진 컴포넌트에 **변형 컨트롤을 내지 않는다**(내면
     * `node.variant`가 버려지는 것을 알면서 값을 넣게 되어 `ignored-variant`를
     * UI가 유도하는 셈이다). 그러면 그 변형에 닿는 길은 **이 prop의 컨트롤 하나뿐**이고,
     * 그것마저 `editor`에 없으면 **변형이 통째로 도달 불가**가 된다. 여기서 던지지 않으면
     * 그 상태를 막는 것이 없다.
     */
    if (!editable.has(prop)) {
      throw new Error(
        `${type}: variantFrom(${prop})이 editor에 없어 변형에 도달할 수 없습니다 ` +
          '(variantFrom을 가진 컴포넌트에는 패널이 변형 컨트롤을 내지 않습니다)',
      )
    }
  }

  return def
}

/**
 * 사람에게 보이는 한 줄. **비어 있지 않고 · 한 줄이고 · 상한 안**이어야 한다.
 *
 * **줄바꿈을 막는 것이 상한과 별개다.** `<option>`은 줄바꿈을 공백으로 접어 조용히
 * 넘어가고, 설명 줄은 반대로 상자를 세로로 민다 — 어느 쪽이든 적은 사람이 본 모양과
 * 화면이 갈린다. 상한만 두면 `\n`이 든 짧은 말이 그대로 지난다.
 */
function assertHumanText(type: string, field: string, value: string, max: number): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${type}: ${field}가 비어 있습니다`)
  }
  if (/[\r\n]/.test(value)) {
    throw new Error(`${type}: ${field}는 한 줄이어야 합니다`)
  }
  if ([...value].length > max) {
    throw new Error(`${type}: ${field}가 ${max}자를 넘습니다 (${[...value].length}자)`)
  }
}

function assertUnique(type: string, field: string, values: string[]): void {
  if (new Set(values).size !== values.length) {
    throw new Error(`${type}: ${field}에 중복이 있습니다`)
  }
}

/**
 * prop **하나**의 스키마. 그 컴포넌트에 없는 prop이면 `undefined`다.
 *
 * **`setProp` 상호작용의 값 검사가 이것을 쓴다**(설계서 「모델」(상호작용)의 *"prop 유효성"*). 노드 전체를
 * `def.props.safeParse`로 보는 것과 다른 이유: 상호작용이 바꾸는 것은 **prop 하나**이고,
 * 통째로 파싱하면 그 노드에 없는 **다른** 필수 prop 때문에 실패가 난다.
 *
 * **`propKeys`와 같은 계열로 zod 내부 표현(`shape`)에 기댄다.** 카탈로그의 props는 전부
 * `z.strictObject`라 `shape`가 있고, 없으면 `undefined`를 내 *"모르는 prop"*과 같은 답이
 * 된다 — 그쪽은 조용히 통과하는 것이 아니라 `invalid-interaction-prop`이 된다.
 */
export function propSchema(def: ComponentDef, prop: string): z.ZodType | undefined {
  const shape = (def.props as unknown as { shape?: Record<string, z.ZodType> }).shape
  if (shape === undefined) return undefined
  return Object.hasOwn(shape, prop) ? shape[prop] : undefined
}

/** zod 객체 스키마에서 최상위 prop 이름을 뽑는다. */
function propKeys(schema: z.ZodType): Set<string> {
  const shape = (schema as unknown as { shape?: Record<string, unknown> }).shape
  return new Set(shape ? Object.keys(shape) : [])
}

/** zod 내부 표현. 공개 타입에 없으므로 여기서만 쓰는 만큼 적는다(`propKeys`와 같은 계열이다). */
interface ZodInternal {
  def?: { type?: string; innerType?: ZodInternal }
  options?: unknown
}

/**
 * enum prop의 값 목록. enum이 아니면 `null`이다.
 *
 * **감싼 것을 벗겨야 한다.** 카탈로그의 props는 거의 전부 `.default()`가 붙어 있어
 * 최상위의 `def.type`이 `'default'`이고 실제 enum은 `def.innerType`에 있다(`.optional()`도
 * 같다). 재서 확인한 zod 4.4.3의 모양이다:
 *
 * ```
 * z.enum(['a','b']).default('a')  →  def.type='default', def.innerType.def.type='enum'
 * z.enum(['a','b']).optional()    →  def.type='optional', def.innerType.def.type='enum'
 * z.string().default('x')         →  def.innerType.def.type='string' (options 없음)
 * ```
 *
 * 깊이 제한을 두지 않고 `innerType`을 끝까지 따라간다 — 감싸는 것이 둘 이상 붙어도
 * (`.optional().default()`) 같은 길로 닿는다. 순환은 zod가 만들지 않지만, 만들어지더라도
 * `innerType`이 없어지는 순간 멈추므로 무한히 돌지 않는다.
 *
 * **내부 표현에 기댄다는 것을 숨기지 않는다.** zod가 이 모양을 바꾸면 `variantFrom`을
 * 쓰는 카탈로그 셋이 *"enum이 아닙니다"*로 **던지며** 드러난다 — 조용히 검사를 건너뛰지
 * 않는 것이 이 함수가 `null`과 빈 배열을 가르는 이유다.
 */
function enumValues(schema: z.ZodType, prop: string): string[] | null {
  const shape = (schema as unknown as { shape?: Record<string, ZodInternal> }).shape
  let cursor: ZodInternal | undefined = shape?.[prop]

  while (cursor !== undefined) {
    if (cursor.def?.type === 'enum' && Array.isArray(cursor.options)) {
      return cursor.options.filter((value): value is string => typeof value === 'string')
    }
    cursor = cursor.def?.innerType
  }
  return null
}
