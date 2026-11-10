/**
 * **공통코드에 묶인 입력 조각의 «종류 바꾸기»** — `code` 는 타입의 선언과 맞아야 서는 칸이라(`invalid-code-ref`) 타입만 갈면 서버가 422 로 거절한다.
 * 새 타입이 같은 묶음 꼴(선택 위젯 ↔ 선택 위젯)이면 참조를 옮기고, 아니면 같은 묶음에서 푼다(`code` 를 지우고 그때 표의 이름을 새 타입의 같은 이름
 * prop 에). 케이스마다 바꾼 문서를 `validatePage` 에 돌려 오류 0 을 함께 단언한다.
 */
import { applyOps, codeBindingOf, indexCodes, validatePage, type CodeIndex, type PageDocument, type WbNode } from '@wirebound/schema'
import { describe, expect, it } from 'vitest'
import { KIND_TYPES, changeKindOps, changeKindUnbindsCode } from '../../src/edit/change-kind'
import '../../src/catalog-setup'

const CODES = indexCodes([
  {
    key: 'G',
    name: '그룹',
    items: [
      { value: 'A', name: '새 가', active: true },
      { value: 'B', name: '새 나', active: true },
    ],
  },
])

const doc = (node: WbNode): PageDocument => ({ version: 1, root: { id: 'n_root', type: 'Page', children: [node] } })

/** 바꾼 뒤의 노드와 그 문서의 검증 오류 코드. `codes` 가 `null` 이면 표를 모르는 판이다. */
function changed(node: WbNode, to: string, codes: CodeIndex | null = CODES): { node: WbNode; errors: string[] } {
  const before = doc(node)
  // 판 카나리아 — 바꾸기 전 문서는 오류가 없다.
  expect(errorsOf(before)).toEqual([])
  const after = applyOps(before, changeKindOps(before, node.id, to, codes ?? undefined)!)
  return { node: after.root.children![0]!, errors: errorsOf(after) }
}

const errorsOf = (document: PageDocument): string[] =>
  validatePage(document)
    .filter((issue) => issue.severity === 'error')
    .map((issue) => issue.code)

const OPTIONS = [
  { label: '옛 가', selected: true },
  { label: '옛 나', selected: true },
]

describe('묶인 노드의 종류 바꾸기', () => {
  it('선택 위젯 → 받지 않는 타입 · 대표 글 타입: 참조를 푼다', () => {
    for (const to of ['TextArea', 'Input', 'DateInput']) {
      const select: WbNode = { id: 'n_a', type: 'Select', props: { options: [{ label: '옛 가' }] }, code: { group: 'G', selected: ['A'] } }
      const out = changed(select, to)
      expect(out.errors, to).toEqual([])
      expect(out.node.type).toBe(to)
      expect('code' in out.node, to).toBe(false)
      expect(changeKindUnbindsCode(select, to), to).toBe(true)
    }
  })

  it('대표 글 타입 → 선택 위젯: 참조를 푼다', () => {
    const input: WbNode = { id: 'n_a', type: 'Input', props: { value: '옛 가' }, code: { group: 'G', item: 'A' } }
    const out = changed(input, 'Select')
    expect(out.errors).toEqual([])
    expect('code' in out.node).toBe(false)
  })

  it('풀 때 그때 표의 이름을 새 타입의 같은 이름 prop 에 적는다 — 끊긴 참조 · 표 없음이면 대체 글 그대로', () => {
    const input = (item: string): WbNode => ({ id: 'n_a', type: 'Input', props: { value: '옛 가' }, code: { group: 'G', item } })
    expect(changed(input('A'), 'TextArea').node).toEqual({ id: 'n_a', type: 'TextArea', props: { value: '새 가' } })
    expect(changed(input('NOPE'), 'TextArea').node).toEqual({ id: 'n_a', type: 'TextArea', props: { value: '옛 가' } })
    expect(changed(input('A'), 'TextArea', null).node).toEqual({ id: 'n_a', type: 'TextArea', props: { value: '옛 가' } })
  })

  it('선택 위젯 → 선택 위젯: 참조를 그대로 옮긴다', () => {
    const select: WbNode = {
      id: 'n_a',
      type: 'Select',
      props: { options: [{ label: '옛 가', selected: true }] },
      code: { group: 'G', selected: ['A'] },
    }
    for (const to of ['CheckboxGroup', 'RadioGroup']) {
      const out = changed(select, to)
      expect(out.errors, to).toEqual([])
      expect(out.node.code, to).toEqual({ group: 'G', selected: ['A'] })
      expect(changeKindUnbindsCode(select, to), to).toBe(false)
    }
    const bare: WbNode = { id: 'n_a', type: 'Select', props: { options: [{ label: '옛 가' }] }, code: { group: 'G' } }
    expect(changed(bare, 'CheckboxGroup').node.code).toEqual({ group: 'G' })
  })

  it('여럿 고른 체크 묶음 → 하나 고르는 타입: 첫 값만 남기고 대체 글의 고름도 그 하나다', () => {
    const many: WbNode = { id: 'n_a', type: 'CheckboxGroup', props: { options: OPTIONS }, code: { group: 'G', selected: ['B', 'A'] } }
    for (const to of ['RadioGroup', 'Select']) {
      const out = changed(many, to)
      expect(out.errors, to).toEqual([])
      expect(out.node.code, to).toEqual({ group: 'G', selected: ['B'] })
      // 대체 글은 그 고름을 표에서 다시 푼 것이다 — 표가 사라져도 고른 것이 같은 항목으로 보인다.
      expect(out.node.props!.options, to).toEqual([{ label: '새 가' }, { label: '새 나', selected: true }])
    }
    // 표를 모르면 대체 글은 옛 선택지의 첫 고름만 남긴다(값과 글을 맞댈 길이 없다).
    const blind = changed(many, 'RadioGroup', null)
    expect(blind.errors).toEqual([])
    expect(blind.node.code).toEqual({ group: 'G', selected: ['B'] })
    expect(blind.node.props!.options).toEqual([{ label: '옛 가', selected: true }, { label: '옛 나' }])
  })

  it('묶이지 않은 노드는 푼다고 말하지 않는다', () => {
    expect(changeKindUnbindsCode({ id: 'n_a', type: 'Select' }, 'Input')).toBe(false)
  })

  /** 대표 글 ↔ 대표 글은 옮길 규칙을 안 뒀다 — 입력 조각 가운데 대표 글 타입이 둘이 되면 이 케이스가 그 규칙을 정하라고 알린다. */
  it('입력 조각 가운데 대표 글 타입은 Input 하나다', () => {
    expect(KIND_TYPES.filter((type) => codeBindingOf(type)?.kind === 'label')).toEqual(['Input'])
    expect(KIND_TYPES.filter((type) => codeBindingOf(type)?.kind === 'choices')).toEqual(['Select', 'CheckboxGroup', 'RadioGroup'])
  })
})
