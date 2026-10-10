import { beforeAll, describe, expect, it } from 'vitest'
import { installCatalog } from '../src/component/catalog/index'
import type { LayoutDocument, PageDocument } from '../src/node'
import {
  ISSUE_SEVERITY,
  assertValidLayout,
  assertValidPage,
  partitionIssues,
  validateLayout,
  validatePage,
} from '../src/validate'

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

  it('invalid-props · children-not-allowed 문장은 별칭이 있으면 타입 뒤에 별칭을 붙인다 — 없으면 그대로다(L-125)', () => {
    const doc = page({
      id: 'n_000000000001',
      type: 'Page',
      children: [
        { id: 'n_000000000002', type: 'List', alias: '회원 목록', props: { items: -1 } },
        { id: 'n_000000000003', type: 'List', props: { items: -1 } },
        { id: 'n_000000000004', type: 'Divider', alias: '구분선', children: [{ id: 'n_000000000005', type: 'Text', props: { content: 'x' } }] },
      ],
    })
    const issues = validatePage(doc)
    const said = (code: string, nodeId: string) => issues.find((issue) => issue.code === code && issue.nodeId === nodeId)?.message
    expect(said('invalid-props', 'n_000000000002')).toMatch(/^List의 props가 올바르지 않습니다 \('회원 목록'\): /)
    expect(said('invalid-props', 'n_000000000003')).toMatch(/^List의 props가 올바르지 않습니다: /)
    expect(said('children-not-allowed', 'n_000000000004')).toBe("Divider은 자식을 담을 수 없습니다 ('구분선')")
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
  /**
   * **이름이 *"`error`가 있으면"*이다 — *"이슈가 있으면"*이 아니다.**
   * `throwOnFirstIssue`는 **`error`만 본다**(`partitionIssues(issues).errors[0]`) —
   * 경고만 있는 문서는 저장되므로 assert도 통과시켜야 하기 때문이고, 그 근거가 그 함수의
   * 머리말에 있다.
   *
   * **이름이 틀려도 이 케이스는 초록이다.** 케이스가 쓰는 값(`bad-root`)이 `error`라,
   * 규칙이 *"이슈가 있으면"* → *"`error`가 있으면"*으로 좁아져도 단언은 그대로 지나가고
   * **이름만 낡는다.** 그러니 규칙을 바꿀 때는 이름을 직접 다시 읽어야 한다.
   * `themes`의 `resolve.test.ts`·`font-face.test.ts`·`emit.test.ts` 셋이 **같은 부류**다.
   */
  it('error가 있으면 첫 오류 메시지로 던진다', () => {
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

describe('variantFrom이 있는 컴포넌트의 node.variant', () => {
  const doc = (variant: string, props: Record<string, unknown>): PageDocument => ({
    version: 1,
    root: {
      id: 'n_000000000001',
      type: 'Page',
      children: [{ id: 'n_000000000002', type: 'Text', variant, props }],
    },
  })

  /**
   * 갈리는 입력 둘이다. 판정이 어긋나면 **하나는 거짓 양성, 하나는 침묵**이 된다:
   *
   * | 입력 | 이슈 | 어긋나면 |
   * |---|---|---|
   * | `variant:'없는변형'` + `role:'h1'` | `ignored-variant` | **이슈 0건** — 적은 값이 조용히 사라진다 |
   * | `variant:'caption'` + `role:'h2'` | `ignored-variant` | **이슈 0건** — 적은 값이 조용히 사라진다 |
   *
   * 둘 다 같은 일이 일어나므로(적은 값이 버려진다) 같은 이슈를 받는 것이 맞다.
   */
  it('enum 밖의 값이어도 ignored-variant다', () => {
    const issues = validatePage(doc('없는변형', { role: 'h1' }))
    expect(issues.map((issue) => issue.code)).toEqual(['ignored-variant'])
    expect(issues[0]!.path).toBe('/root/children/0/variant')
  })

  it('enum 안의 값이어도 조용히 사라지지 않는다', () => {
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

  // 대조군. «값을 판정하지 않는다» 축의 주인은 `component/theme-owned-vocabulary.test.ts`의
  // «variant 는 스키마가 판정하지 않는다 — 아무 문자열이나 통과한다»다 — 이 케이스는 그것과 함께 죽는다.
  it('variantFrom이 없는 컴포넌트는 이슈가 없다', () => {
    const issues = validatePage({
      version: 1,
      root: {
        id: 'n_000000000001',
        type: 'Page',
        children: [{ id: 'n_000000000002', type: 'Button', variant: 'rainbow' }],
      },
    })
    expect(issues).toEqual([])
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

/**
 * **severity — 경고와 거부를 가른다.**
 *
 * severity가 없으면 **모든** 이슈가 설계서 「정방향 흐름」의 게이트에서 편집을 막는다 —
 * `ignored-variant`가 한 번 들어간 문서는 **그 노드와 무관한 편집까지 422**로 거부된다
 * (`edit-pipeline`이 `validatePage(after)`로 문서 전체를 검증하기 때문이다).
 */
describe('ValidationIssue.severity', () => {
  /**
   * **경고가 넷이다** — `ignored-variant`와 상호작용 셋.
   * 나머지는 「정방향 흐름」이 "편집을 막아야 한다"고 정한 것이고, 이 필드는 그 목록을 줄이는 것이
   * 아니라 표현할 수 있게 만드는 것이다.
   *
   * **목록을 손으로 적지 않는다** — `ISSUE_SEVERITY`를 훑어 센다. `ValidationCode`에 코드가
   * 늘면 `Record<ValidationCode, IssueSeverity>`가 **타입체크에서** 먼저 죽고(항목 누락),
   * 누군가 그 자리를 `warning`으로 채우면 이 케이스가 죽는다. **그것이 이 케이스가 사는
   * 이유다:** 새 경고는 근거를 적고 이 목록을 고쳐야 지나간다.
   *
   * 상호작용 셋이 경고인 근거는 `validate.ts`의 `ISSUE_SEVERITY` 머리말에 있다 —
   * 요지는 *"`error`로 두면 타겟이 된 노드를 지우는 편집이 막힌다"*이고,
   * `test/interaction-validate.test.ts`가 그 성질을 잰다.
   */
  it('경고인 코드는 넷이다 — ignored-variant와 상호작용 셋', () => {
    const warnings = Object.entries(ISSUE_SEVERITY)
      .filter(([, severity]) => severity === 'warning')
      .map(([code]) => code)
    expect(warnings).toEqual([
      'ignored-variant',
      'missing-interaction-target',
      'invalid-interaction-target',
      'invalid-interaction-prop',
    ])
  })

  it('그 밖의 코드는 전부 error다', () => {
    const others = Object.entries(ISSUE_SEVERITY).filter(([, severity]) => severity !== 'warning')
    expect(others.length).toBeGreaterThan(0)
    expect(others.map(([, severity]) => severity)).toEqual(others.map(() => 'error'))
  })

  /**
   * 표가 아니라 **실제로 나온 이슈**가 severity를 달고 있는지 본다. 표만 검사하면
   * 이슈를 만드는 자리가 표를 안 보고 값을 박아도 통과한다.
   */
  it('validatePage가 낸 이슈의 severity가 표와 일치한다', () => {
    const doc = page({
      id: 'n_000000000001',
      type: 'Page',
      children: [
        { id: 'n_000000000002', type: 'Text', variant: 'caption', props: { role: 'h2' } },
        { id: 'n_000000000003', type: 'Nope' },
      ],
    })
    const issues = validatePage(doc)
    expect(issues.length).toBe(2)
    for (const issue of issues) {
      expect(issue.severity).toBe(ISSUE_SEVERITY[issue.code])
    }
    expect(issues.find((issue) => issue.code === 'ignored-variant')?.severity).toBe('warning')
    expect(issues.find((issue) => issue.code === 'unknown-type')?.severity).toBe('error')
  })

  it('validateLayout이 낸 이슈도 severity를 단다', () => {
    const issues = validateLayout({ version: 1, root: { id: 'n_000000000001', type: 'Page' } })
    expect(issues.map((issue) => issue.severity)).toEqual(['error'])
  })

  it('봉투 이슈(bad-document)도 severity를 단다', () => {
    const issues = validatePage({ version: 1, root: null } as never)
    expect(issues.length).toBeGreaterThan(0)
    expect(issues.every((issue) => issue.severity === 'error')).toBe(true)
  })

  describe('partitionIssues', () => {
    it('error와 warning을 가른다 — 순서는 그대로다', () => {
      const doc = page({
        id: 'n_000000000001',
        type: 'Page',
        children: [
          { id: 'n_000000000002', type: 'Text', variant: 'caption', props: { role: 'h2' } },
          { id: 'n_000000000003', type: 'Nope' },
        ],
      })
      const { errors, warnings } = partitionIssues(validatePage(doc))
      expect(errors.map((issue) => issue.code)).toEqual(['unknown-type'])
      expect(warnings.map((issue) => issue.code)).toEqual(['ignored-variant'])
    })

    it('이슈가 없으면 둘 다 빈 배열이다', () => {
      const { errors, warnings } = partitionIssues([])
      expect(errors).toEqual([])
      expect(warnings).toEqual([])
    })
  })

  /**
   * `assertValidPage`도 같은 선을 쓴다 — **경고는 던지지 않는다.** 여기가 갈리면
   * "저장되는 문서"와 "assert를 지나는 문서"가 서로 다른 집합이 된다.
   */
  it('assertValidPage는 경고만 있는 문서를 통과시킨다', () => {
    const doc = page({
      id: 'n_000000000001',
      type: 'Page',
      children: [{ id: 'n_000000000002', type: 'Text', variant: 'caption', props: { role: 'h2' } }],
    })
    expect(validatePage(doc).map((issue) => issue.code)).toEqual(['ignored-variant'])
    expect(() => assertValidPage(doc)).not.toThrow()
  })

  it('assertValidPage는 경고와 오류가 섞여 있으면 오류로 던진다', () => {
    const doc = page({
      id: 'n_000000000001',
      type: 'Page',
      children: [
        { id: 'n_000000000002', type: 'Text', variant: 'caption', props: { role: 'h2' } },
        { id: 'n_000000000003', type: 'Nope' },
      ],
    })
    expect(() => assertValidPage(doc)).toThrow(/unknown-type/)
  })
})
