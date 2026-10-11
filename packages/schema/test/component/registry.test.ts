import { beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineComponent } from '../../src/component/define'
import { getComponent, listComponents, registerComponent, requireComponent, resetRegistry } from '../../src/component/registry'

const Sample = defineComponent({
  type: 'Sample',
  label: '표본',
  description: '검사용 표본.',
  group: 'document',
  props: z.object({ label: z.string(), disabled: z.boolean() }),
  // `disabled`가 `states`에 있으므로 `editor`에도 있어야 한다(`defineComponent`의 도달성 검사).
  editor: [
    { prop: 'label', control: 'text', label: '라벨' },
    { prop: 'disabled', control: 'switch', label: '비활성' },
  ],
  states: ['disabled'],
  children: 'none',
})

describe('컴포넌트 레지스트리', () => {
  beforeEach(() => {
    resetRegistry()
  })

  it('등록한 컴포넌트를 타입으로 찾는다', () => {
    registerComponent(Sample)
    expect(getComponent('Sample')).toBe(Sample)
  })

  it('등록하지 않은 타입은 undefined를 준다', () => {
    expect(getComponent('Unknown')).toBeUndefined()
  })

  it('requireComponent는 없는 타입에 대해 던진다', () => {
    expect(() => requireComponent('Unknown')).toThrow('알 수 없는 컴포넌트 타입: Unknown')
  })

  it('같은 타입을 두 번 등록하면 던진다', () => {
    registerComponent(Sample)
    expect(() => registerComponent(Sample)).toThrow('이미 등록된 컴포넌트 타입: Sample')
  })

  it('등록 순서대로 목록을 준다', () => {
    // 이름도 갈라야 한다 — `registerComponent`가 겹치는 이름을 던진다(아래 케이스).
    const Other = defineComponent({ ...Sample, type: 'Other', label: '다른 표본' })
    registerComponent(Sample)
    registerComponent(Other)
    expect(listComponents().map((d) => d.type)).toEqual(['Sample', 'Other'])
  })
})

describe('defineComponent', () => {
  it('상태 이름이 중복이면 던진다', () => {
    expect(() => defineComponent({ ...Sample, type: 'Dup', states: ['disabled', 'disabled'] })).toThrow('Dup: states에 중복이 있습니다')
  })

  it('editor가 가리키는 prop이 스키마에 없으면 던진다', () => {
    expect(() =>
      defineComponent({
        ...Sample,
        type: 'Bad',
        editor: [{ prop: 'missing', control: 'text', label: '없음' }],
      }),
    ).toThrow('Bad: editor가 스키마에 없는 prop을 가리킵니다: missing')
  })

  it('states가 가리키는 prop이 스키마에 없으면 던진다', () => {
    expect(() => defineComponent({ ...Sample, type: 'X', states: ['missing'] })).toThrow('X: states와 같은 이름의 prop이 없습니다: missing')
  })
})
