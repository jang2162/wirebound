import { z } from 'zod'

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

/**
 * 컴포넌트의 계약. 여기 선언된 것이 테마가 쓸 수 있는 어휘 전부다.
 * 실제 DOM을 그리는 함수는 renderer 패키지가 (타입, 구조) 키로 등록한다.
 */
export interface ComponentDef {
  type: string
  props: z.ZodTypeAny
  editor: EditorField[]
  /** 첫 번째가 기본 구조 */
  structures: string[]
  parts: string[]
  variants: string[]
  /** 같은 이름의 prop이 true면 활성화되는 상태 */
  states: string[]
  children: 'none' | 'many'
}

/** 계약의 자체 정합성을 확인하고 그대로 돌려준다. */
export function defineComponent(def: ComponentDef): ComponentDef {
  const { type } = def

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

  for (const state of def.states) {
    if (!known.has(state)) {
      throw new Error(`${type}: states와 같은 이름의 prop이 없습니다: ${state}`)
    }
  }

  return def
}

function assertUnique(type: string, field: string, values: string[]): void {
  if (new Set(values).size !== values.length) {
    throw new Error(`${type}: ${field}에 중복이 있습니다`)
  }
}

/** zod 객체 스키마에서 최상위 prop 이름을 뽑는다. */
function propKeys(schema: z.ZodTypeAny): Set<string> {
  const shape = (schema as unknown as { shape?: Record<string, unknown> }).shape
  return new Set(shape ? Object.keys(shape) : [])
}
