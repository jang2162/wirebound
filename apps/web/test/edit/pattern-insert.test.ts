/**
 * 패턴 삽입의 자리 규칙. **화면 없이 재는 자리다** — `patternInsert`가
 * 순수 함수이고, 화면을 지나는 흐름은 `../panels/structure-pattern.test.tsx`가 잰다.
 */
import { describe, expect, it } from 'vitest'
import {
  applyOps,
  getComponent,
  validatePage,
  type PageDocument,
  type WbNode,
} from '@wirebound/schema'
import { patternInsert } from '../../src/edit/pattern-insert'
import '../../src/catalog-setup'

/**
 * ```
 * n-root  (Page)     many
 * ├ n-a    (Text)    none — 자식을 못 받는다
 * ├ n-box  (Card)    many · 자식 하나
 * │  └ n-1  (Button)
 * └ n-empty (Section) many · children 키가 **없다**
 * ```
 */
function doc(): PageDocument {
  return {
    version: 1,
    root: {
      id: 'n-root',
      type: 'Page',
      children: [
        { id: 'n-a', type: 'Text' },
        { id: 'n-box', type: 'Card', children: [{ id: 'n-1', type: 'Button' }] },
        { id: 'n-empty', type: 'Section' },
      ],
    },
  }
}

/** 전개 결과를 흉내 낸 것. `expandPattern`은 `themes`가 재고, 여기서는 자리만 본다. */
function expanded(nodes: WbNode[], slots: [string, string][] = []) {
  return { nodes, slots: new Map(slots) }
}

const ONE: () => WbNode = () => ({ id: 'n-new', type: 'Section' })

/** ops를 적용한 결과 문서. 만든 ops가 실제로 적용 가능한지까지 본다. */
function applied(document: PageDocument, ops: readonly { op: string }[]): PageDocument {
  return applyOps(document, ops as never)
}

function childIds(document: PageDocument, nodeId: string): string[] {
  const find = (node: WbNode): WbNode | undefined => {
    if (node.id === nodeId) return node
    for (const child of node.children ?? []) {
      const found = find(child)
      if (found) return found
    }
    return undefined
  }
  return (find(document.root)?.children ?? []).map((child) => child.id)
}

describe('카탈로그가 자식 허용 여부를 안다', () => {
  it('ComponentDef.children이 none·many를 말한다', () => {
    // 아래 «꽂는 자리»의 *"자식을 못 받으면 형제 뒤"*가 이 값에 걸려 있다 — 추론으로 두지 않고 잰다.
    expect(getComponent('Text')?.children).toBe('none')
    expect(getComponent('Card')?.children).toBe('many')
    expect(getComponent('Page')?.children).toBe('many')
  })
})

describe('꽂는 자리', () => {
  it('선택이 없으면 root의 자식 끝이다', () => {
    const before = doc()
    const { insert } = patternInsert(before, null, expanded([ONE()]))
    expect(insert).not.toBeNull()
    expect(childIds(applied(before, insert!.ops), 'n-root')).toEqual([
      'n-a',
      'n-box',
      'n-empty',
      'n-new',
    ])
  })

  it('선택 노드가 자식을 받으면 그 자식 끝이다', () => {
    const before = doc()
    const { insert } = patternInsert(before, 'n-box', expanded([ONE()]))
    expect(childIds(applied(before, insert!.ops), 'n-box')).toEqual(['n-1', 'n-new'])
    // root는 그대로다 — 형제로 새지 않았다.
    expect(childIds(applied(before, insert!.ops), 'n-root')).toEqual(['n-a', 'n-box', 'n-empty'])
  })

  it('children 키가 없는 노드에도 배열째 넣는다', () => {
    const before = doc()
    const { insert } = patternInsert(before, 'n-empty', expanded([ONE()]))
    expect(childIds(applied(before, insert!.ops), 'n-empty')).toEqual(['n-new'])
  })

  it('선택 노드가 자식을 못 받으면 그 바로 뒤 형제다 — 거부하지 않는다', () => {
    const before = doc()
    const { insert } = patternInsert(before, 'n-a', expanded([ONE()]))
    expect(insert).not.toBeNull()
    expect(childIds(applied(before, insert!.ops), 'n-root')).toEqual([
      'n-a',
      'n-new',
      'n-box',
      'n-empty',
    ])
  })

  it('선택 노드가 문서에 없으면 만들지 않는다 — root로 흘리지 않는다', () => {
    const { insert, reason } = patternInsert(doc(), 'n-없음', expanded([ONE()]))
    expect(insert).toBeNull()
    expect(reason).toBe('no-spot')
  })

  it('노드가 여럿이면 전부 같은 자리에 순서대로 꽂는다', () => {
    const before = doc()
    const { insert } = patternInsert(
      before,
      'n-box',
      expanded([
        { id: 'n-x', type: 'Section' },
        { id: 'n-y', type: 'Divider' },
        { id: 'n-z', type: 'Text' },
      ]),
    )
    expect(childIds(applied(before, insert!.ops), 'n-box')).toEqual(['n-1', 'n-x', 'n-y', 'n-z'])
  })

  it('여럿을 children 키가 없는 노드에 꽂아도 순서가 유지된다', () => {
    const before = doc()
    const { insert } = patternInsert(
      before,
      'n-empty',
      expanded([
        { id: 'n-x', type: 'Section' },
        { id: 'n-y', type: 'Divider' },
      ]),
    )
    expect(childIds(applied(before, insert!.ops), 'n-empty')).toEqual(['n-x', 'n-y'])
  })

  it('전개 결과가 비어 있으면 만들지 않는다', () => {
    const { insert, reason } = patternInsert(doc(), 'n-box', expanded([]))
    expect(insert).toBeNull()
    expect(reason).toBe('empty')
  })
})

describe('ops 여럿이 편집 하나다', () => {
  it('노드 셋이 ops 셋이고 배열 하나로 나간다', () => {
    // **세는 단위: `PatchOp` 하나.** 편집의 수가 아니라 op의 수다 — 편집은 `commitOps`
    // 호출 하나이고, 그것을 재는 자리는 `../panels/structure-pattern.test.tsx`다.
    const { insert } = patternInsert(
      doc(),
      'n-box',
      expanded([
        { id: 'n-x', type: 'Section' },
        { id: 'n-y', type: 'Divider' },
        { id: 'n-z', type: 'Text' },
      ]),
    )
    expect(insert!.ops.length).toBe(3)
    expect(insert!.ops.every((op) => op.op === 'add')).toBe(true)
  })

  it('children 키가 없는 부모에서도 op 수가 노드 수와 같다', () => {
    // 첫 op이 배열째 `add`이고 나머지가 인덱스 `add`다 — `insertNodeOps`의 갈래를
    // 문서를 진행시키며 타므로 op이 더 늘지 않는다.
    const { insert } = patternInsert(
      doc(),
      'n-empty',
      expanded([
        { id: 'n-x', type: 'Section' },
        { id: 'n-y', type: 'Divider' },
      ]),
    )
    expect(insert!.ops.length).toBe(2)
    expect(insert!.ops[0]!.path).toBe('/root/children/2/children')
    expect(insert!.ops[1]!.path).toBe('/root/children/2/children/1')
  })
})

describe('꽂은 뒤 선택이 어디로 가는가', () => {
  it('슬롯이 있으면 첫 슬롯 노드다 — 그것을 골라야 채울 수 있다', () => {
    const { insert } = patternInsert(
      doc(),
      'n-box',
      expanded(
        [{ id: 'n-x', type: 'Section', children: [{ id: 'n-y', type: 'Text' }] }],
        [
          ['title', 'n-y'],
          ['body', 'n-x'],
        ],
      ),
    )
    expect(insert!.selectId).toBe('n-y')
  })

  it('슬롯이 없으면 전개된 첫 노드다 — 아무 데도 안 가면 흐름이 끊긴다', () => {
    const { insert } = patternInsert(doc(), 'n-box', expanded([ONE()]))
    expect(insert!.selectId).toBe('n-new')
  })

  it('슬롯이 꽂히지 않은 노드를 가리키면 첫 노드로 떨어진다', () => {
    // 전개가 그런 매핑을 내지 않지만(케이스가 고정한다), 여기서 가정하지 않는다 —
    // `selectId`는 반드시 **꽂은 노드 중 하나**여야 선택이 사라지지 않는다.
    const { insert } = patternInsert(
      doc(),
      'n-box',
      expanded([ONE()], [['title', 'n-트리밖']]),
    )
    expect(insert!.selectId).toBe('n-new')
  })
})

describe('패턴이 잘못됐다와 내가 잘못 눌렀다를 가른다', () => {
  it('카탈로그에 없는 타입을 담은 패턴은 꽂지 않는다', () => {
    const { insert, reason, issues } = patternInsert(
      doc(),
      'n-box',
      expanded([{ id: 'n-x', type: '없는타입' }]),
    )
    expect(insert).toBeNull()
    expect(reason).toBe('invalid')
    expect(issues.map((entry) => entry.code)).toEqual(['unknown-type'])
  })

  it('판정은 전개된 노드만 담은 프로브로 한다 — 문서가 이미 깨져 있어도 막지 않는다', () => {
    // 문서에 알 수 없는 타입이 이미 있으면 `validatePage`가 그 문서 전체를 `error`로
    // 본다. 그것으로 판정하면 **멀쩡한 패턴도 영영 못 꽂는다** — 그 문서를 고치는 길이
    // 삭제뿐인데(`structure-actions.ts`의 실측) 패턴 삽입은 그것과 무관하다.
    const broken: PageDocument = {
      version: 1,
      root: { id: 'n-root', type: 'Page', children: [{ id: 'n-bad', type: '없는타입' }] },
    }
    expect(validatePage(broken).length).toBeGreaterThan(0)

    const { insert, reason } = patternInsert(broken, null, expanded([ONE()]))
    expect(reason).toBeNull()
    expect(insert).not.toBeNull()
  })

  it('경고만 있는 패턴은 막지 않는다 — 서버도 막지 않는다', () => {
    // `ignored-variant`는 `warning`이다(`ISSUE_SEVERITY`). 편집 파이프라인이 거부하지
    // 않으므로 여기서 막으면 **화면만 더 엄격해진다.**
    const withWarning: WbNode = { id: 'n-x', type: 'Text', variant: 'body', props: { role: 'h2' } }
    const probe: PageDocument = {
      version: 1,
      root: { id: 'n-probe', type: 'Page', children: [withWarning] },
    }
    const found = validatePage(probe)
    expect(found.map((entry) => entry.severity)).toEqual(['warning'])

    const { insert, reason } = patternInsert(doc(), null, expanded([withWarning]))
    expect(reason).toBeNull()
    expect(insert).not.toBeNull()
  })
})
