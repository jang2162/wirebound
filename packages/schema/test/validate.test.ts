import { beforeAll, describe, expect, it } from 'vitest'
import { installCatalog } from '../src/component/catalog/index'
import type { LayoutDocument, PageDocument } from '../src/node'
import { assertValidLayout, assertValidPage, validateLayout, validatePage } from '../src/validate'

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
      // The message format is "List의 props가 올바르지 않습니다: <zod error message>"
      // Extract the zod error part after the wrapper text
      const messageContent = invalidPropsIssue.message
      // zod error should contain Korean characters (너무, 작습니다, 이상, etc.)
      const koreanCharPattern = /[가-힣]/
      expect(messageContent).toMatch(koreanCharPattern)
      // Ensure no English words that are typical in English zod messages
      // (avoid "Too", "small", "expected" - these indicate English locale was used)
      expect(messageContent).not.toMatch(/\bToo\b|\bsmall\b|\bexpected\b|\brequired\b/)
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

describe('assertValidLayout', () => {
  it('assertValidLayout은 Slot이 정확히 하나인 레이아웃을 통과시킨다', () => {
    const doc: LayoutDocument = {
      version: 1,
      root: { id: 'n_000000000001', type: 'Page', children: [{ id: 'n_000000000002', type: 'Slot' }] },
    }
    expect(() => assertValidLayout(doc)).not.toThrow()
  })

  it('assertValidLayout은 Slot이 없으면 첫 이슈를 메시지에 담아 던진다', () => {
    const doc: LayoutDocument = {
      version: 1,
      root: { id: 'n_000000000001', type: 'Page', children: [] },
    }
    expect(() => assertValidLayout(doc)).toThrow(/slot-count/)
  })
})

describe('variantFrom이 있는 컴포넌트의 node.variant (P4a-2 수정 웨이브)', () => {
  const doc = (variant: string, props: Record<string, unknown>): PageDocument => ({
    version: 1,
    root: {
      id: 'n_000000000001',
      type: 'Page',
      children: [{ id: 'n_000000000002', type: 'Text', variant, props }],
    },
  })

  /**
   * 리뷰가 만든 갈리는 입력 둘이다. 고치기 전에는 **하나는 거짓 양성, 하나는 침묵**이었다:
   *
   * | 입력 | 고치기 전 | 지금 |
   * |---|---|---|
   * | `variant:'없는변형'` + `role:'h1'` | `unknown-variant` (원인을 잘못 가리킨다) | `ignored-variant` |
   * | `variant:'caption'` + `role:'h2'` | **이슈 0건** (조용히 사라진다) | `ignored-variant` |
   *
   * 둘 다 같은 일이 일어나므로(적은 값이 버려진다) 같은 이슈를 받는 것이 맞다.
   */
  it('선언되지 않은 값이어도 unknown-variant가 아니라 ignored-variant다', () => {
    const issues = validatePage(doc('없는변형', { role: 'h1' }))
    expect(issues.map((issue) => issue.code)).toEqual(['ignored-variant'])
    expect(issues[0]!.path).toBe('/root/children/0/variant')
  })

  it('선언된 값이어도 조용히 사라지지 않는다', () => {
    const issues = validatePage(doc('caption', { role: 'h2' }))
    expect(issues.map((issue) => issue.code)).toEqual(['ignored-variant'])
  })

  it('메시지가 버려진다는 것과 무엇이 대신 쓰이는지를 말한다', () => {
    const message = validatePage(doc('caption', { role: 'h2' }))[0]!.message
    expect(message).toContain('무시됩니다')
    expect(message).toContain('caption')
    // 무엇이 대신 쓰이는가 — 이것이 없으면 사용자가 고칠 곳을 모른다.
    expect(message).toContain('role')
  })

  it('variantFrom이 없는 컴포넌트는 그대로 unknown-variant다', () => {
    const issues = validatePage({
      version: 1,
      root: {
        id: 'n_000000000001',
        type: 'Page',
        children: [{ id: 'n_000000000002', type: 'Button', variant: 'rainbow' }],
      },
    })
    expect(issues.map((issue) => issue.code)).toEqual(['unknown-variant'])
  })

  it('variant를 안 주면 이슈가 없다', () => {
    expect(
      validatePage({
        version: 1,
        root: {
          id: 'n_000000000001',
          type: 'Page',
          children: [{ id: 'n_000000000002', type: 'Text', props: { role: 'h1' } }],
        },
      }),
    ).toEqual([])
  })
})
