/**
 * 패턴 전개(P7-1 T1·T2). `spec/patterns.ts`가 *"전개는 만들지 않는다(D7)"*로 미뤄 둔 자리를
 * 여기서 잰다.
 *
 * **세는 단위를 케이스가 만든다.** 계획서가 산문에 적은 수(*"다섯 중 둘"*)를 여기서 다시
 * 세되, 세는 단위는 **`patterns` 객체의 키 하나**다 — `grep -c patterns`는 주석의 언급과
 * 절 이름을 함께 세므로 다른 수를 낸다(재라 #2).
 */
import {
  WbNodeSchema,
  installCatalog,
  validatePage,
  type PageDocument,
  type WbNode,
} from '@wirebound/schema'
import { beforeAll, describe, expect, it } from 'vitest'
import { expandPattern } from '../src/pattern/expand'
import { SYSTEM_THEME_IDS, systemTheme } from '../src/system/index'
import type { ThemePattern } from '../src/spec/patterns'

beforeAll(() => {
  installCatalog()
})

/** 테스트용 결정적 id 생성기. `n_t0`·`n_t1`… 순으로 낸다. */
function counter(): () => string {
  let next = 0
  return () => `n_t${next++}`
}

/** §6.6의 예시를 줄인 것 — 슬롯 둘이 서로 다른 깊이에 있다. */
const NOTICE: ThemePattern = {
  name: '공지 목록',
  slots: { title: 'text', keyword: 'text' },
  schema: {
    type: 'Section',
    children: [
      { type: 'Text', props: { role: 'h2', content: '공지사항' }, slot: 'title' },
      {
        type: 'SearchForm',
        props: { collapsed: true },
        children: [
          { type: 'Field', props: { label: '검색어', control: 'text' }, slot: 'keyword' },
        ],
      },
    ],
  },
}

/** 전개 결과의 모든 노드를 전위 순회로 편다. */
function flatten(nodes: readonly WbNode[]): WbNode[] {
  const out: WbNode[] = []
  const visit = (node: WbNode): void => {
    out.push(node)
    for (const child of node.children ?? []) visit(child)
  }
  for (const node of nodes) visit(node)
  return out
}

describe('expandPattern — D2: slot이 결과에 남지 않는다', () => {
  it('전개된 노드에 slot 키가 하나도 없다', () => {
    const { expanded, issues } = expandPattern(NOTICE, counter())
    expect(issues).toEqual([])
    expect(expanded).not.toBeNull()

    const all = flatten(expanded!.nodes)
    // **키의 존재를 본다** — 값이 `undefined`인 키가 남아도 `WbNodeSchema`가 죽는다.
    const withSlot = all.filter((node) => Object.hasOwn(node, 'slot'))
    expect(withSlot).toEqual([])
  })

  it('재라 #1 — slot이 남으면 봉투가 실제로 죽는다', () => {
    // 계획서가 *"안 읽고 가정했다"*고 적은 문장을 실행으로 바꾼다. `WbNodeSchema`가
    // `z.strictObject`이므로 선언 안 된 키 하나가 파싱을 실패시킨다.
    const clean = WbNodeSchema.safeParse({ id: 'n_a', type: 'Text' })
    const dirty = WbNodeSchema.safeParse({ id: 'n_a', type: 'Text', slot: 'title' })
    expect(clean.success).toBe(true)
    expect(dirty.success).toBe(false)
  })

  it('전개 결과의 모든 노드가 WbNodeSchema를 통과한다', () => {
    const { expanded } = expandPattern(NOTICE, counter())
    for (const node of expanded!.nodes) {
      const parsed = WbNodeSchema.safeParse(node)
      expect(parsed.success, JSON.stringify(node)).toBe(true)
    }
  })
})

describe('expandPattern — id 발급', () => {
  it('새 id가 매번 다르다', () => {
    const first = expandPattern(NOTICE).expanded!
    const second = expandPattern(NOTICE).expanded!

    const firstIds = flatten(first.nodes).map((node) => node.id)
    const secondIds = flatten(second.nodes).map((node) => node.id)

    // 한 번의 전개 안에서도 겹치지 않는다.
    expect(new Set(firstIds).size).toBe(firstIds.length)
    // 두 전개 사이에서도 겹치지 않는다 — 같은 패턴을 두 번 꽂을 수 있어야 한다.
    expect(firstIds.some((id) => secondIds.includes(id))).toBe(false)
  })

  it('id 생성기를 주입할 수 있다 — 케이스가 결과를 고정할 수 있어야 한다', () => {
    const { expanded } = expandPattern(NOTICE, counter())
    // **수를 산문에 적지 않는다** — 노드 수는 아래 순서 케이스가 만든다.
    expect(flatten(expanded!.nodes).map((node) => node.id)).toEqual(['n_t0', 'n_t1', 'n_t2', 'n_t3'])
  })

  it('id는 전위 순회 순서로 발급된다', () => {
    const { expanded } = expandPattern(NOTICE, counter())
    const root = expanded!.nodes[0]!
    expect(root.id).toBe('n_t0')
    expect(root.children?.[0]?.id).toBe('n_t1')
    expect(root.children?.[1]?.id).toBe('n_t2')
    expect(root.children?.[1]?.children?.[0]?.id).toBe('n_t3')
  })
})

describe('expandPattern — D3: 슬롯은 채우지 않고 어느 노드인지만 돌려준다', () => {
  it('slots 매핑이 실제 전개된 노드를 가리킨다', () => {
    const { expanded } = expandPattern(NOTICE, counter())
    const ids = new Set(flatten(expanded!.nodes).map((node) => node.id))

    expect([...expanded!.slots.keys()].sort()).toEqual(['keyword', 'title'])
    for (const [slot, nodeId] of expanded!.slots) {
      expect(ids.has(nodeId), `${slot} → ${nodeId}`).toBe(true)
    }
  })

  it('슬롯이 가리키는 노드는 템플릿에서 그 slot이 붙어 있던 노드다', () => {
    const { expanded } = expandPattern(NOTICE, counter())
    const byId = new Map(flatten(expanded!.nodes).map((node) => [node.id, node]))

    // `title`은 템플릿에서 `Text`, `keyword`는 `Field`였다.
    expect(byId.get(expanded!.slots.get('title')!)?.type).toBe('Text')
    expect(byId.get(expanded!.slots.get('keyword')!)?.type).toBe('Field')
  })

  it('슬롯 값을 props에 채워 넣지 않는다 — 템플릿의 props가 그대로다', () => {
    const { expanded } = expandPattern(NOTICE, counter())
    const byId = new Map(flatten(expanded!.nodes).map((node) => [node.id, node]))
    const title = byId.get(expanded!.slots.get('title')!) as { props?: Record<string, unknown> }

    // 템플릿의 `props`는 그대로 오고, 슬롯 이름으로 만든 키는 없다.
    expect(title.props).toEqual({ role: 'h2', content: '공지사항' })
  })

  it('선언 안 된 슬롯 이름은 오류다 — 조용히 무시하지 않는다', () => {
    const bad: ThemePattern = {
      name: '잘못된 패턴',
      slots: { title: 'text' },
      schema: {
        type: 'Section',
        children: [{ type: 'Text', slot: 'title' }, { type: 'Text', slot: '지어낸이름' }],
      },
    }

    const { expanded, issues } = expandPattern(bad, counter())
    expect(expanded).toBeNull()
    expect(issues.map((entry) => entry.code)).toEqual(['unknown-slot'])
    expect(issues[0]!.severity).toBe('error')
    expect(issues[0]!.message).toContain('지어낸이름')
    // 경로가 그 노드를 가리킨다 — 어느 자리인지 말하지 않으면 테마 작성자가 못 고친다.
    expect(issues[0]!.path).toBe('schema.children.1')
  })

  it('slots 선언 자체가 없는데 slot이 붙어 있어도 오류다', () => {
    const bad: ThemePattern = {
      name: '슬롯 선언 없음',
      schema: { type: 'Section', children: [{ type: 'Text', slot: 'title' }] },
    }
    const { expanded, issues } = expandPattern(bad, counter())
    expect(expanded).toBeNull()
    expect(issues.map((entry) => entry.code)).toEqual(['unknown-slot'])
  })

  it('선언됐는데 schema가 쓰지 않는 슬롯은 여기서 보지 않는다 — checkPatterns의 몫이다', () => {
    const unused: ThemePattern = {
      name: '안 쓰는 슬롯',
      slots: { title: 'text', 안쓰임: 'text' },
      schema: { type: 'Section', children: [{ type: 'Text', slot: 'title' }] },
    }
    const { expanded, issues } = expandPattern(unused, counter())
    expect(issues).toEqual([])
    // 매핑에는 실제로 쓰인 것만 실린다.
    expect([...expanded!.slots.keys()]).toEqual(['title'])
  })

  it('한 슬롯 이름을 노드 둘이 쓰면 처음 만난 노드가 실린다', () => {
    // `checkPatterns`가 이 경우를 막지 않는다(그쪽 주석: *"§6.6이 그 경우를 말하지 않았다"*).
    // 전개는 **전위 순회로 처음 만난 노드**를 고른다 — 어느 쪽도 규격에 없으므로 위에서
    // 아래로 채우는 감각에 맞췄다. 이것이 슬롯 **타입 체계**(§16)를 닫지는 않는다.
    const twice: ThemePattern = {
      name: '슬롯 둘',
      slots: { title: 'text' },
      schema: {
        type: 'Section',
        children: [{ type: 'Text', slot: 'title' }, { type: 'Text', slot: 'title' }],
      },
    }
    const { expanded, issues } = expandPattern(twice, counter())
    expect(issues).toEqual([])
    expect(expanded!.slots.get('title')).toBe('n_t1')
  })
})

describe('expandPattern — D6: marker가 따라오지 않는다', () => {
  it('전개 결과에 marker가 없다', () => {
    const { expanded } = expandPattern(NOTICE, counter())
    const withMarker = flatten(expanded!.nodes).filter((node) => Object.hasOwn(node, 'marker'))
    expect(withMarker).toEqual([])
  })

  it('템플릿이 marker를 들고 있어도 결과로 새지 않는다', () => {
    // `PatternNode`는 `marker`를 받지 않지만(사실 5), 그것은 **타입**이 막는 것이다.
    // 런타임 값이 그 자리에 오는 경로가 생겨도 전개가 옮기지 않는 것을 여기서 고정한다.
    const smuggled = {
      name: 'marker 밀반입',
      schema: { type: 'Section', marker: 3, children: [{ type: 'Text', marker: 4 }] },
    } as unknown as ThemePattern

    const { expanded } = expandPattern(smuggled, counter())
    const withMarker = flatten(expanded!.nodes).filter((node) => Object.hasOwn(node, 'marker'))
    expect(withMarker).toEqual([])
  })

  it('템플릿의 interactions도 결과로 새지 않는다 — 재라 #5', () => {
    // `PatternNode`에 `interactions`가 없으므로 전개가 리매핑할 `target`이 없다.
    // 그래서 `remapNodeIds`를 쓸 자리가 없다. 밀반입되어도 옮기지 않는다.
    const smuggled = {
      name: 'interactions 밀반입',
      schema: {
        type: 'Section',
        interactions: [{ on: 'click', actions: [{ type: 'setVisible', target: 'n_없음', value: true }] }],
      },
    } as unknown as ThemePattern

    const { expanded } = expandPattern(smuggled, counter())
    expect(Object.hasOwn(expanded!.nodes[0]!, 'interactions')).toBe(false)
  })
})

describe('expandPattern — 옮기는 필드', () => {
  it('type·props·variant·children을 옮긴다', () => {
    const pattern: ThemePattern = {
      name: '필드 확인',
      schema: {
        type: 'Section',
        variant: 'hero',
        props: { padded: true },
        children: [{ type: 'Text', props: { role: 'h2' } }],
      },
    }
    const { expanded } = expandPattern(pattern, counter())
    expect(expanded!.nodes).toEqual([
      {
        id: 'n_t0',
        type: 'Section',
        variant: 'hero',
        props: { padded: true },
        children: [{ id: 'n_t1', type: 'Text', props: { role: 'h2' } }],
      },
    ])
  })

  it('없는 필드는 만들지 않는다 — props·variant·children 키가 생기지 않는다', () => {
    const { expanded } = expandPattern(
      { name: '빈 노드', schema: { type: 'Section' } },
      counter(),
    )
    expect(expanded!.nodes).toEqual([{ id: 'n_t0', type: 'Section' }])
  })

  it('nodes는 오늘 항상 하나다 — ThemePattern.schema가 노드 하나이기 때문이다', () => {
    // 배열로 내는 것은 계획서 D3의 계약이고, 삽입 쪽(D5)이 *"여럿이면 순서대로"*를 이미
    // 다룰 수 있게 한다. 그 수가 오늘 무엇인지는 여기서 못박는다.
    expect(expandPattern(NOTICE, counter()).expanded!.nodes.length).toBe(1)
  })
})

describe('T2 — 시스템 테마의 실제 패턴이 문서에 들어간다', () => {
  /** 테마 id → `patterns` 객체의 **키 개수**. 세는 단위는 키 하나다(재라 #2). */
  function patternKeyCount(themeId: string): number {
    return Object.keys(systemTheme(themeId)?.patterns ?? {}).length
  }

  it('재라 #2 — 패턴을 가진 시스템 테마와 그 개수를 센다', () => {
    const counts = Object.fromEntries(SYSTEM_THEME_IDS.map((id) => [id, patternKeyCount(id)]))
    expect(counts).toEqual({
      admin: 0,
      'saas-marketing': 0,
      portal: 1,
      commerce: 1,
      docs: 0,
    })
    // 계획서가 산문에 적은 *"다섯 중 둘"*을 케이스가 다시 만든다.
    expect(SYSTEM_THEME_IDS.length).toBe(5)
    expect(SYSTEM_THEME_IDS.filter((id) => patternKeyCount(id) > 0)).toEqual(['portal', 'commerce'])
  })

  it('portal·commerce의 패턴을 전개하면 validatePage가 통과하는 문서가 된다', () => {
    for (const themeId of ['portal', 'commerce']) {
      const patterns = systemTheme(themeId)!.patterns!
      for (const [key, pattern] of Object.entries(patterns)) {
        const { expanded, issues } = expandPattern(pattern)
        expect(issues, `${themeId}/${key}`).toEqual([])

        const document: PageDocument = {
          version: 1,
          root: { id: 'n_root0000000', type: 'Page', children: expanded!.nodes },
        }
        const found = validatePage(document)
        expect(
          found,
          `${themeId}/${key}: ${found.map((entry) => `${entry.path} ${entry.message}`).join(' | ')}`,
        ).toEqual([])
      }
    }
  })

  it('두 패턴의 슬롯 이름이 전부 매핑된다', () => {
    const seen: Record<string, string[]> = {}
    for (const themeId of ['portal', 'commerce']) {
      for (const [key, pattern] of Object.entries(systemTheme(themeId)!.patterns!)) {
        const { expanded } = expandPattern(pattern)
        seen[`${themeId}/${key}`] = [...expanded!.slots.keys()]
        // 선언한 슬롯과 매핑된 슬롯이 같다.
        expect([...expanded!.slots.keys()].sort()).toEqual(Object.keys(pattern.slots ?? {}).sort())
      }
    }
    expect(seen).toEqual({
      'portal/content.noticeBoard': ['title', 'keyword'],
      'commerce/content.product': ['image', 'title', 'price', 'cart'],
    })
  })
})
