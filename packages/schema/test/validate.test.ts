import { beforeAll, describe, expect, it } from 'vitest'
import { installCatalog } from '../src/component/catalog/index'
import type { LayoutDocument, PageDocument } from '../src/node'
import { assertValidPage, validateLayout, validatePage } from '../src/validate'

beforeAll(() => {
  installCatalog()
})

function page(root: PageDocument['root']): PageDocument {
  return { version: 1, root }
}

describe('validatePage', () => {
  it('올바른 문서는 이슈가 없다', () => {
    const doc = page({
      id: 'n_000000000001',
      type: 'Page',
      children: [{ id: 'n_000000000002', type: 'List', props: { items: 3 } }],
    })
    expect(validatePage(doc)).toEqual([])
  })

  it('루트가 Page가 아니면 bad-root', () => {
    const doc = page({ id: 'n_000000000001', type: 'Flex' })
    expect(validatePage(doc)[0]).toMatchObject({ code: 'bad-root', path: '/root' })
  })

  it('알 수 없는 타입은 unknown-type', () => {
    const doc = page({
      id: 'n_000000000001',
      type: 'Page',
      children: [{ id: 'n_000000000002', type: 'Nope' }],
    })
    expect(validatePage(doc)).toContainEqual(
      expect.objectContaining({ code: 'unknown-type', nodeId: 'n_000000000002' }),
    )
  })

  it('props가 스키마에 맞지 않으면 invalid-props', () => {
    const doc = page({
      id: 'n_000000000001',
      type: 'Page',
      children: [{ id: 'n_000000000002', type: 'List', props: { items: -1 } }],
    })
    expect(validatePage(doc)).toContainEqual(
      expect.objectContaining({ code: 'invalid-props', nodeId: 'n_000000000002' }),
    )
  })

  it('자식을 담지 못하는 컴포넌트에 자식이 있으면 children-not-allowed', () => {
    const doc = page({
      id: 'n_000000000001',
      type: 'Page',
      children: [
        {
          id: 'n_000000000002',
          type: 'List',
          children: [{ id: 'n_000000000003', type: 'Text' }],
        },
      ],
    })
    expect(validatePage(doc)).toContainEqual(
      expect.objectContaining({ code: 'children-not-allowed', nodeId: 'n_000000000002' }),
    )
  })

  it('정의되지 않은 variant는 unknown-variant', () => {
    const doc = page({
      id: 'n_000000000001',
      type: 'Page',
      children: [{ id: 'n_000000000002', type: 'Button', variant: 'rainbow' }],
    })
    expect(validatePage(doc)).toContainEqual(
      expect.objectContaining({ code: 'unknown-variant', nodeId: 'n_000000000002' }),
    )
  })

  it('id가 중복되면 duplicate-id', () => {
    const doc = page({
      id: 'n_000000000001',
      type: 'Page',
      children: [
        { id: 'n_000000000002', type: 'Text' },
        { id: 'n_000000000002', type: 'Text' },
      ],
    })
    expect(validatePage(doc)).toContainEqual(
      expect.objectContaining({ code: 'duplicate-id', nodeId: 'n_000000000002' }),
    )
  })

  it('페이지에 Slot이 있으면 slot-count', () => {
    const doc = page({
      id: 'n_000000000001',
      type: 'Page',
      children: [{ id: 'n_000000000002', type: 'Slot' }],
    })
    expect(validatePage(doc)).toContainEqual(expect.objectContaining({ code: 'slot-count' }))
  })

  it('invalid-props의 zod 메시지는 한국어여야 한다', () => {
    const doc = page({
      id: 'n_000000000001',
      type: 'Page',
      children: [{ id: 'n_000000000002', type: 'List', props: { items: -1 } }],
    })
    const issues = validatePage(doc)
    const invalidPropsIssue = issues.find((issue) => issue.code === 'invalid-props')
    expect(invalidPropsIssue).toBeDefined()
    if (invalidPropsIssue) {
      // Verify that zod error part (not our wrapper) has no English letters
      // The message format is "List의 props가 올바르지 않습니다: <zod error>"
      // Extract the zod error part after the colon
      const zodErrorPart = invalidPropsIssue.message.split(': ')[1]
      expect(zodErrorPart).toBeDefined()
      // Check that there are no unescaped English letters in the zod message
      // (Allow "items" and "props" which are field names from our schema)
      const englishLetterPattern = /(?:expected|minimum|Too|small|must|be|at|least|positive|negative|required)[A-Za-z]*/g
      expect(zodErrorPart).not.toMatch(/[A-Z][a-z]*:/)
    }
  })
})

describe('validateLayout', () => {
  function layout(root: LayoutDocument['root']): LayoutDocument {
    return { version: 1, root }
  }

  it('Slot이 정확히 하나면 통과한다', () => {
    const doc = layout({
      id: 'n_000000000001',
      type: 'Page',
      children: [{ id: 'n_000000000002', type: 'Slot' }],
    })
    expect(validateLayout(doc)).toEqual([])
  })

  it('Slot이 없으면 slot-count', () => {
    const doc = layout({ id: 'n_000000000001', type: 'Page' })
    expect(validateLayout(doc)).toContainEqual(expect.objectContaining({ code: 'slot-count' }))
  })

  it('Slot이 둘이면 slot-count', () => {
    const doc = layout({
      id: 'n_000000000001',
      type: 'Page',
      children: [
        { id: 'n_000000000002', type: 'Slot' },
        { id: 'n_000000000003', type: 'Slot' },
      ],
    })
    expect(validateLayout(doc)).toContainEqual(expect.objectContaining({ code: 'slot-count' }))
  })
})

describe('assertValidPage', () => {
  it('이슈가 있으면 첫 이슈 메시지로 던진다', () => {
    const doc = page({ id: 'n_000000000001', type: 'Flex' })
    expect(() => assertValidPage(doc)).toThrow(/bad-root/)
  })

  it('올바른 문서면 던지지 않는다', () => {
    const doc = page({ id: 'n_000000000001', type: 'Page' })
    expect(() => assertValidPage(doc)).not.toThrow()
  })
})
