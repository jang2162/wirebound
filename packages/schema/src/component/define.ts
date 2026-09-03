import { z } from 'zod'
import { COMPONENT_GROUPS, isComponentGroup, type ComponentGroup } from './group'

/** 속성 패널이 자동 생성할 입력 컨트롤 종류 */
export type EditorControl =
  | 'text'
  | 'textarea'
  | 'number'
  | 'switch'
  | 'select'
  | 'stringList'
  | 'pairList'

export interface EditorField {
  prop: string
  control: EditorControl
  label: string
  /** control이 'select'일 때 선택지 */
  options?: string[]
  /** 특정 구조에서만 보이는 속성 (예: 컬럼은 table 구조에서만 의미가 있다) */
  visibleWhen?: { structure: string }
}

/** 사람이 읽을 이름의 상한. 고르개의 `<option>` 한 줄에 표시(`담을 수 있음`)와 함께 든다. */
const LABEL_MAX = 12

/**
 * 설명의 상한. 240px 좌측 패널에서 12px 글자로 **두 줄**쯤이다. 상한이 없으면 한 컴포넌트가
 * 고르개를 세로로 밀어낸다 — 3차의 프리셋 고르개가 가로로 겪은 것과 같은 부류다.
 */
const DESCRIPTION_MAX = 60

/**
 * 컴포넌트의 계약.
 *
 * ## 두 축이 있다 — 섞지 않는다
 *
 * | 축 | 필드 | 누가 읽는가 |
 * |---|---|---|
 * | **테마 어휘** | `props`·`editor`·`structures`·`parts`·`variants`·`variantFrom`·`states`·`children` | 테마 검증기(§12.4)·`checkThemeComponents`·렌더러 |
 * | **사람이 읽을 것** | `label`·`description`·`group` | 저작 UI(타입 고르개·문장화) |
 *
 * 아래 축은 **DOM에 나가지 않는다.** §6.11이 못박은 여섯(`data-wb-id`·`data-wb-component`·
 * `data-wb-structure`·`data-wb-variant`·`data-wb-part`·`data-wb-state`)은 전부 위 축에서
 * 나오고, 사람이 읽을 필드는 그중 하나도 만들지 않는다 — 그래서 §6.11 계약을 넓히지
 * 않는다(`variantFrom`의 주석이 말하는 *"일곱 번째 속성"*은 **DOM 속성**이다).
 * `checkThemeComponents`가 어휘를 필드 이름으로 골라 읽는 것이 그 분리를 실제로 지킨다
 * (`test/component/human-axis.test.ts`가 새 필드를 변형·상태·조각 이름으로 써 봐 확인한다).
 *
 * 실제 DOM을 그리는 함수는 renderer 패키지가 (타입, 구조) 키로 등록한다.
 */
export interface ComponentDef {
  type: string
  /**
   * 사람이 읽는 이름. `List` → `목록`. **한국어 UI가 영문 타입명을 그대로 내지 않게 하는
   * 자리다** — 고르개도 상호작용 문장도 이것을 쓴다(`interaction/describe.ts`의
   * `COMPONENT_NOUNS`가 여기서 유도된다).
   *
   * **필수다.** 선택으로 두면 새 컴포넌트가 조용히 영문 이름으로 떨어지는데, 그것이 지금
   * 고치는 고장 그 자체다.
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
  /** 첫 번째가 기본 구조 */
  structures: string[]
  parts: string[]
  variants: string[]
  /**
   * 이 enum prop의 값이 `data-wb-variant`가 된다. **그 값들이 `variants`에 전부 선언돼
   * 있어야 한다** — `defineComponent`가 검사한다.
   *
   * **왜 새 선언 채널을 만들지 않았는가** (P0 이월 #8): `data-wb-role`(Text)·
   * `data-control`(Field)·`data-direction`(Divider)은 한 부류다 — 셋 다 *"노드의 enum
   * prop에서 파생되는 표현 변형"*인데 계약에 채널이 없어 각자 속성을 만들었다.
   * §5.1은 이미 같은 모양의 채널을 하나 갖고 있다(같은 이름의 boolean prop이 true면
   * `data-wb-state`). 빠진 것은 **enum prop → `data-wb-variant`**뿐이므로 그것을 채운다.
   * 일곱 번째 속성을 만들면 §6.11이 *"이 여섯이 전체 계약"*이라고 못박은 것이 깨지고,
   * 테마 검증기(§12.4)와 `checkThemeComponents`가 볼 어휘가 함께 넓어진다.
   *
   * **여기서 «속성»은 렌더러가 내보내는 `data-wb-*` DOM 속성이다** — `ComponentDef`의
   * 필드 수가 아니다(§6.11의 표가 세는 것이 그 여섯이다). 그래서 `label`·`description`·
   * `group`처럼 **DOM에 나가지 않는** 필드는 이 못을 건드리지 않는다. 위
   * `ComponentDef` 주석의 두 축 표가 그 구분을 소유한다. 이 문장이 없어서 P10-3이
   * *"사람이 읽을 이름을 계약에 두면 §6.11이 깨지는가"*를 처음부터 다시 물었다.
   */
  variantFrom?: string
  /** 같은 이름의 prop이 true면 활성화되는 상태 */
  states: string[]
  children: 'none' | 'many'
}

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
    throw new Error(
      `${type}: group이 갈래 목록에 없습니다: ${String(def.group)} ` +
        `(${COMPONENT_GROUPS.join(' · ')})`,
    )
  }

  if (def.structures.length === 0) {
    throw new Error(`${type}: structures는 최소 하나여야 합니다`)
  }
  assertUnique(type, 'structures', def.structures)
  assertUnique(type, 'parts', def.parts)
  assertUnique(type, 'variants', def.variants)
  assertUnique(type, 'states', def.states)

  const known = propKeys(def.props)
  for (const field of def.editor) {
    if (!known.has(field.prop)) {
      throw new Error(`${type}: editor가 스키마에 없는 prop을 가리킵니다: ${field.prop}`)
    }
    if (field.visibleWhen && !def.structures.includes(field.visibleWhen.structure)) {
      throw new Error(
        `${type}: editor의 visibleWhen이 없는 구조를 가리킵니다: ${field.visibleWhen.structure}`,
      )
    }
  }

  // **도달 가능한 prop 집합.** `visibleWhen`이 붙은 것도 센다 — 그것은 구조에 따라 **감출**
  // 뿐이고, 그 구조를 고른 테마에서는 보인다. 감춰지는 것과 없는 것은 다르다.
  const editable = new Set(def.editor.map((field) => field.prop))

  for (const state of def.states) {
    if (!known.has(state)) {
      throw new Error(`${type}: states와 같은 이름의 prop이 없습니다: ${state}`)
    }
  }

  /**
   * **도달성 — §5.1이 *"속성 패널이 `editor`에서 자동 생성된다"*고 한 것의 결과**(P0 이월 #9).
   *
   * `editor`에 없는 prop은 **UI에서 도달 불가**다. 상태가 그렇게 되면 §6.5가 상태의 쓸모로
   * 든 *"'선택된 행 강조' 같은 서술을 목업에서 실제로 보여주려면"*이 성립하지 않는다 —
   * 켤 방법이 없기 때문이다. 카탈로그에 그런 자리가 **다섯** 있었다(P4b-1이 닫았다).
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
        '(§5.1 — 패널은 editor에서 자동 생성됩니다)',
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
    // **이것이 핵심 검사다.** 선언되지 않은 값이 `data-wb-variant`로 나가면 테마 검증기가
    // 대조할 선언이 없다 — `checkThemeComponents`는 `def.variants`를 어휘로 쓴다.
    const undeclared = values.filter((value) => !def.variants.includes(value))
    if (undeclared.length > 0) {
      throw new Error(
        `${type}: variantFrom(${prop})의 값이 variants에 선언돼 있지 않습니다: ${undeclared.join(', ')}`,
      )
    }

    /**
     * **반대 방향 — `variants ⊆ enum 값`.** 위 검사만으로는 한쪽이 열려 있었다.
     *
     * `variants`에 enum에 없는 이름이 있으면 **그 이름은 선언돼 있는데 고를 길이 없다** —
     * `variantFrom`이 있으므로 속성 패널이 변형 컨트롤을 내지 않고(재라 #4의 A안),
     * `node.variant`를 적어도 `variantFrom`이 이겨 무시된다(P4a-2의 결정 — 그때
     * `ignored-variant`가 생겼다). **두 길이 다 막혀 있다.**
     *
     * 테마가 그 이름에 스킨을 정의하면 **아무도 켤 수 없는 스킨**이 되어 `Media.kind`와
     * 같은 *"선언은 있는데 화면에 닿지 않는다"* 부류가 하나 생긴다.
     *
     * **앞서 `test/component/variant-from.test.ts`가 정반대를 단언하고 있었다** —
     * *"variants가 enum보다 넓은 것은 막지 않는다"*이고 근거는 *"노드가 `variant`로 직접
     * 고르는 값이 따로 있을 수 있다"*였다. **그 근거가 거짓이다:** `variantFrom`을 가진
     * 컴포넌트에서 `node.variant`는 선언된 값이든 아니든 똑같이 버려진다. 리뷰가 반례를
     * 만들어 잡았고, 그 케이스는 근거와 함께 뒤집었다.
     */
    const unreachableVariants = def.variants.filter((value) => !values.includes(value))
    if (unreachableVariants.length > 0) {
      throw new Error(
        `${type}: variants에 ${prop} enum에 없는 이름이 있어 고를 길이 없습니다: ` +
          `${unreachableVariants.join(', ')} ` +
          `(variantFrom을 가진 컴포넌트에서는 node.variant가 무시되고 패널도 변형 컨트롤을 내지 않습니다)`,
      )
    }

    /**
     * **`variantFrom`의 예외가 구멍이 되는 자리 — 계획 D2가 의심하라고 한 것이 여기다.**
     *
     * 속성 패널은 `variantFrom`을 가진 컴포넌트에 **변형 컨트롤을 내지 않는다**(재라 #4의
     * A안 — 내면 `node.variant`가 버려지는 것을 알면서 값을 넣게 되어 `ignored-variant`를
     * UI가 유도하는 셈이다). 그러면 그 변형에 닿는 길은 **이 prop의 컨트롤 하나뿐**이고,
     * 그것마저 `editor`에 없으면 **변형이 통째로 도달 불가**가 된다.
     *
     * 오늘 셋(Text·Divider·Field)은 전부 갖고 있었다 — **강제하는 것이 없었을 뿐이다.**
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
 * **`setProp` 상호작용의 값 검사가 이것을 쓴다**(§8.1의 *"prop 유효성"*). 노드 전체를
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
