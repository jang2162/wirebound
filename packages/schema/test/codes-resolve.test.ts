import { beforeAll, describe, expect, it } from 'vitest'
import {
  indexCodes,
  installCatalog,
  isCodeBroken,
  nodeDisplayName,
  nodeRowLabel,
  resetRegistry,
  resolveChoices,
  resolvedCodeProps,
  resolveLabel,
  stripMarkers,
  remapNodeIds,
  type CodeGroup,
  type WbNode,
} from '../src/index'

beforeAll(() => {
  resetRegistry()
  installCatalog()
})

const items = (n: number, inactive: number[] = []) =>
  Array.from({ length: n }, (_, i) => ({ value: `V${i}`, name: `이름${i}`, active: !inactive.includes(i) }))
const group = (key: string, list: CodeGroup['items']): CodeGroup => ({ key, name: `${key} 그룹`, items: list })

describe('resolveChoices', () => {
  it('사용 중 항목만 차례대로', () => {
    const index = indexCodes([group('S', items(4, [2]))])
    const out = resolveChoices(index, { group: 'S' })
    expect(out.options.map((o) => o.label)).toEqual(['이름0', '이름1', '이름3'])
    expect(out.truncated).toBe(false)
  })

  it('사용 중 31 개면 앞 30 개 · truncated', () => {
    const out = resolveChoices(indexCodes([group('S', items(31))]), { group: 'S' })
    expect(out.options).toHaveLength(30)
    expect(out.options.at(-1)?.label).toBe('이름29')
    expect(out.truncated).toBe(true)
  })

  it('사용 중 0 개면 빈 배열', () => {
    const out = resolveChoices(indexCodes([group('S', items(2, [0, 1]))]), { group: 'S' })
    expect(out).toMatchObject({ options: [], truncated: false, brokenGroup: false })
  })

  it('고른 값은 값으로 맞춘다', () => {
    const out = resolveChoices(indexCodes([group('S', items(3))]), { group: 'S', selected: ['V1'] })
    expect(out.options).toEqual([{ label: '이름0' }, { label: '이름1', selected: true }, { label: '이름2' }])
  })

  it('표에 없는 값을 고름 → brokenSelected · 다른 항목을 고르지 않는다', () => {
    const out = resolveChoices(indexCodes([group('S', items(3))]), { group: 'S', selected: ['GONE'] })
    expect(out.brokenSelected).toEqual(['GONE'])
    expect(out.options.some((o) => o.selected === true)).toBe(false)
  })

  it('사용 안 함 값을 고름 → 선택지에서 빠지고 brokenSelected', () => {
    const out = resolveChoices(indexCodes([group('S', items(3, [1]))]), { group: 'S', selected: ['V1'] })
    expect(out.options.map((o) => o.label)).toEqual(['이름0', '이름2'])
    expect(out.brokenSelected).toEqual(['V1'])
    expect(out.options.some((o) => o.selected === true)).toBe(false)
  })

  it('없는 그룹', () => {
    expect(resolveChoices(indexCodes([]), { group: 'S', selected: ['V1'] })).toMatchObject({
      brokenGroup: true,
      options: [],
      brokenSelected: [],
    })
  })
})

describe('resolveLabel', () => {
  const index = indexCodes([group('S', items(2, [1]))])
  it('이름 · 사용 안 함', () => {
    expect(resolveLabel(index, { group: 'S', item: 'V0' })).toEqual({ name: '이름0', inactive: false })
    expect(resolveLabel(index, { group: 'S', item: 'V1' })).toEqual({ name: '이름1', inactive: true })
  })
  it('없는 그룹 · 항목은 null', () => {
    expect(resolveLabel(index, { group: 'X', item: 'V0' })).toBeNull()
    expect(resolveLabel(index, { group: 'S', item: 'X' })).toBeNull()
  })
})

describe('묶인 노드의 이름 · 줄 글', () => {
  const index = indexCodes([group('ORDER_STATUS', [{ value: 'WAIT', name: '결제 대기', active: true }])])
  const button: WbNode = { id: 'n_b', type: 'Button', props: { label: '옛 이름' }, code: { group: 'ORDER_STATUS', item: 'WAIT' } }

  it('표를 주면 표의 이름, 안 주면 대체 글', () => {
    expect(nodeDisplayName(button, undefined, index)).toContain('결제 대기')
    expect(nodeDisplayName(button)).toContain('옛 이름')
    expect(nodeRowLabel(button, index)).toContain('결제 대기')
    expect(nodeRowLabel(button)).toContain('옛 이름')
  })

  it('끊긴 참조는 대체 글로 읽고 isCodeBroken', () => {
    const gone = { ...button, code: { group: 'ORDER_STATUS', item: 'GONE' } }
    expect(resolvedCodeProps(gone, index)).toBeNull()
    expect(nodeDisplayName(gone, undefined, index)).toContain('옛 이름')
    expect(isCodeBroken(gone, index)).toBe(true)
    expect(isCodeBroken(button, index)).toBe(false)
    expect(isCodeBroken({ id: 'n_s', type: 'Select', code: { group: 'NOPE' } }, index)).toBe(true)
  })
})

describe('노드를 옮기는 길이 code 를 나른다', () => {
  const node: WbNode = { id: 'n_s', type: 'CheckboxGroup', code: { group: 'S', selected: ['A', 'B'] } }
  it('stripMarkers · remapNodeIds 가 사본으로 옮긴다', () => {
    const [copied] = stripMarkers([node])
    expect(copied!.code).toEqual(node.code)
    expect(copied!.code!.selected).not.toBe(node.code!.selected)
    const remapped = remapNodeIds(node).root
    expect(remapped.code).toEqual(node.code)
    expect(remapped.code!.selected).not.toBe(node.code!.selected)
  })
})
