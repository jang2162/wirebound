/**
 * **조합 입력의 카탈로그 계약**(`src/component/catalog/input.ts` · `src/component/define.ts`) — `Field` 의 값 구역과 기본 내용, 선택지 규칙(하나 이상 ·
 * 상한 · 하나만 고르는 두 타입), 편집 칸 `optionList` 의 고르는 수.
 */
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineComponent } from '../../src/component/define'
import { CheckboxGroupDef, FieldDef, OPTIONS_MAX, RadioGroupDef, SelectDef } from '../../src/component/catalog/input'

describe('Field', () => {
  it('값 구역은 몸통 하나이고 무엇이든 받으며 새로 만들면 Input 하나가 든다 · 입력의 prop 은 없다', () => {
    expect(FieldDef.zones).toEqual([{ name: 'body', label: '값', initial: [{ type: 'Input' }] }])
    expect(FieldDef.props.safeParse({ label: '이름', control: 'text' }).success).toBe(false)
    expect(FieldDef.props.safeParse({ label: '이름', required: true }).success).toBe(true)
    expect(FieldDef.variantFrom).toBeUndefined()
  })
})

describe('선택지', () => {
  const options = (selected: number[], length = 3) =>
    Array.from({ length }, (_, index) => (selected.includes(index) ? { label: `${index}`, selected: true } : { label: `${index}` }))

  it.each([
    ['Select', SelectDef],
    ['RadioGroup', RadioGroupDef],
  ] as const)('%s — 고른 것 0 · 1 개는 받고 2 개는 «하나만 고를 수 있습니다» 로 거절한다', (_, def) => {
    expect(def.props.safeParse({ options: options([]) }).success).toBe(true)
    expect(def.props.safeParse({ options: options([1]) }).success).toBe(true)
    const two = def.props.safeParse({ options: options([0, 2]) })
    expect(two.success).toBe(false)
    expect(two.error!.issues.map((issue) => [issue.path.join('/'), issue.message])).toEqual([['options', '하나만 고를 수 있습니다']])
  })

  it('CheckboxGroup — 여럿을 받는다', () => {
    expect(CheckboxGroupDef.props.safeParse({ options: options([0, 1, 2]) }).success).toBe(true)
  })

  it.each([
    ['Select', SelectDef],
    ['RadioGroup', RadioGroupDef],
    ['CheckboxGroup', CheckboxGroupDef],
  ] as const)(`%s — 하나 이상 · ${OPTIONS_MAX} 개 이하 · 모르는 키는 거절`, (_, def) => {
    expect(def.props.safeParse({ options: [] }).success).toBe(false)
    expect(def.props.safeParse({ options: options([], OPTIONS_MAX) }).success).toBe(true)
    expect(def.props.safeParse({ options: options([], OPTIONS_MAX + 1) }).success).toBe(false)
    expect(def.props.safeParse({ options: [{ label: '가', value: 1 }] }).success).toBe(false)
  })
})

describe('편집 칸 optionList 의 고르는 수', () => {
  const base = {
    type: 'Probe',
    label: '프로브',
    description: '시험용.',
    group: 'input' as const,
    props: z.strictObject({ options: z.array(z.object({ label: z.string() })).default([]), label: z.string().default('') }),
    states: [],
    zones: [],
  }

  it('optionList 에 select 가 없으면 · 다른 칸에 select 가 있으면 정의하는 자리에서 던진다', () => {
    expect(() => defineComponent({ ...base, editor: [{ prop: 'options', control: 'optionList', label: '선택지' }] })).toThrow('select')
    expect(() => defineComponent({ ...base, editor: [{ prop: 'label', control: 'text', label: '글', select: 'one' }] })).toThrow('select')
    expect(() =>
      defineComponent({ ...base, editor: [{ prop: 'options', control: 'optionList', label: '선택지', select: 'many' }] }),
    ).not.toThrow()
  })

  it('카탈로그 — 하나 고르는 두 타입은 one, 체크 묶음은 many', () => {
    const select = (def: typeof SelectDef) => def.editor.find((field) => field.prop === 'options')?.select
    expect([select(SelectDef), select(RadioGroupDef), select(CheckboxGroupDef)]).toEqual(['one', 'one', 'many'])
  })
})
