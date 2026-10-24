import { beforeAll, describe, expect, it } from 'vitest'
import { installCatalog } from '../src/component/catalog/index'
import { LINT_RULES, type LintRule } from '../src/lint/rules'
import { lintDesign } from '../src/lint/design'
import type { LintPage, LintProject } from '../src/lint/input'
import type { PageDocument, WbNode } from '../src/node'

beforeAll(() => {
  installCatalog()
})

let counter = 0
const nid = (): string => `n_${String(++counter).padStart(12, '0')}`

const node = (type: string, extra: Partial<WbNode> = {}): WbNode => ({ id: nid(), type, ...extra })

const doc = (children: WbNode[]): PageDocument => ({
  version: 1,
  root: { id: nid(), type: 'Page', children },
})

/**
 * **페이지 셋·메뉴 둘로 잰다.** 규칙 하나·페이지 하나로 재면 자리가 0이 되어 섞여도 안 죽는다
 * (전역 제약: *"하나짜리로 재지 마라"*).
 */
function project(overrides: Partial<LintProject> = {}): LintProject {
  return {
    menu: [
      { id: 'm1', parentId: null, title: '관리자' },
      { id: 'm2', parentId: 'm1', title: '회원' },
    ],
    pages: [],
    comments: [],
    ...overrides,
  }
}

function page(over: Partial<LintPage> & { document: PageDocument }): LintPage {
  return {
    id: 'pg1',
    menuNodeId: 'm2',
    title: '목록',
    target: 'page:관리자/회원/목록',
    ...over,
  }
}

const rulesOf = (issues: readonly { rule: string }[]): string[] => issues.map((issue) => issue.rule)

describe('① 코멘트가 없는 주요 컴포넌트', () => {
  it('코멘트가 없는 List·EntryForm·SearchForm을 낸다', () => {
    const list = node('List')
    const entry = node('EntryForm', { children: [node('Field')] })
    const search = node('SearchForm', { children: [node('Field')] })
    const issues = lintDesign(project({ pages: [page({ document: doc([list, entry, search]) })] })).filter(
      (issue) => issue.rule === 'comment-missing',
    )

    expect(issues.map((issue) => issue.nodeId).sort()).toEqual([list.id, entry.id, search.id].sort())
    expect(issues[0]!.severity).toBe('warning')
    expect(issues[0]!.pageId).toBe('pg1')
  })

  // L-125 — 문장은 노드를 사람이 부르는 이름(별칭 · 라벨 + 한국어 이름)으로 부르고 타입은 괄호에 붙인다. 타입만 쓰면 별칭을 지은 사람이 제 노드를 못 찾는다.
  it('메시지는 별칭이 있으면 별칭으로, 없으면 한국어 이름으로 노드를 부르고 타입을 곁에 둔다', () => {
    const named = node('List', { alias: '회원 목록' })
    const plain = node('List')
    const messages = lintDesign(project({ pages: [page({ document: doc([named, plain]) })] }))
      .filter((issue) => issue.rule === 'comment-missing')
      .map((issue) => issue.message)
    expect(messages).toEqual([
      '회원 목록(List)에 코멘트가 없습니다 — 주요 컴포넌트는 설명이 필요합니다',
      '목록(List)에 코멘트가 없습니다 — 주요 컴포넌트는 설명이 필요합니다',
    ])
  })

  it('코멘트가 붙은 노드는 내지 않는다', () => {
    const list = node('List')
    const entry = node('EntryForm', { children: [node('Field')] })
    const issues = lintDesign(
      project({
        pages: [page({ document: doc([list, entry]) })],
        comments: [{ pageId: 'pg1', nodeId: list.id }],
      }),
    ).filter((issue) => issue.rule === 'comment-missing')

    expect(issues.map((issue) => issue.nodeId)).toEqual([entry.id])
  })

  it('다른 페이지의 코멘트로는 덮이지 않는다', () => {
    const list = node('List')
    const other = node('List')
    const issues = lintDesign(
      project({
        pages: [
          page({ document: doc([list]) }),
          page({ id: 'pg2', title: '상세', target: 'page:관리자/회원/상세', document: doc([other]) }),
        ],
        comments: [{ pageId: 'pg2', nodeId: list.id }],
      }),
    ).filter((issue) => issue.rule === 'comment-missing')

    expect(issues.map((issue) => `${issue.pageId}:${issue.nodeId}`).sort()).toEqual([`pg1:${list.id}`, `pg2:${other.id}`].sort())
  })

  it('주요 컴포넌트가 아닌 노드는 보지 않는다', () => {
    const issues = lintDesign(project({ pages: [page({ document: doc([node('Text'), node('Button'), node('Card')]) })] }))
    expect(rulesOf(issues)).not.toContain('comment-missing')
  })
})

describe('② 어느 메뉴에도 연결되지 않은 페이지', () => {
  it('입력에 없는 메뉴를 가리키는 페이지를 낸다', () => {
    const issues = lintDesign(
      project({
        pages: [
          page({ document: doc([]) }),
          page({ id: 'pg2', menuNodeId: 'm없음', title: '떠 있는', target: 'page:떠 있는', document: doc([]) }),
        ],
      }),
    ).filter((issue) => issue.rule === 'page-unlinked')

    expect(issues.map((issue) => issue.pageId)).toEqual(['pg2'])
    expect(issues[0]!.message).toContain('m없음')
  })

  it('뿌리에서 닿지 않는 메뉴에 달린 페이지를 낸다 — 조상이 순환이다', () => {
    const issues = lintDesign(
      project({
        menu: [
          { id: 'm1', parentId: null, title: '관리자' },
          { id: 'm2', parentId: 'm1', title: '회원' },
          { id: 'c1', parentId: 'c2', title: '순환 가' },
          { id: 'c2', parentId: 'c1', title: '순환 나' },
        ],
        pages: [page({ document: doc([]) }), page({ id: 'pg2', menuNodeId: 'c1', title: '갇힌', target: 'page:갇힌', document: doc([]) })],
      }),
    ).filter((issue) => issue.rule === 'page-unlinked')

    expect(issues.map((issue) => issue.pageId)).toEqual(['pg2'])
  })

  it('뿌리에서 닿는 메뉴에 달린 페이지는 내지 않는다', () => {
    const issues = lintDesign(project({ pages: [page({ document: doc([]) })] }))
    expect(rulesOf(issues)).not.toContain('page-unlinked')
  })
})

describe('③ 대상 노드가 삭제된 상호작용 규칙', () => {
  it('checkNodeAction의 판정을 그대로 나른다 — severity를 바꾸지 않는다', () => {
    const button = node('Button', {
      interactions: [{ on: 'click', actions: [{ type: 'setVisible', target: 'n_00dead000001', value: true }] }],
    })
    const issues = lintDesign(project({ pages: [page({ document: doc([button]) })] })).filter(
      (issue) => issue.rule === 'interaction-target',
    )

    expect(issues).toHaveLength(1)
    // `ISSUE_SEVERITY['missing-interaction-target']`가 `warning`이다 — lint가 올리지 않는다.
    expect(issues[0]!.severity).toBe('warning')
    expect(issues[0]!.nodeId).toBe(button.id)
    expect(issues[0]!.message).toContain('n_00dead000001')
  })

  it('타겟 종류가 안 맞는 것도 같은 규칙으로 나른다', () => {
    const card = node('Card')
    const button = node('Button', {
      interactions: [{ on: 'click', actions: [{ type: 'switchTab', target: card.id }] }],
    })
    const issues = lintDesign(project({ pages: [page({ document: doc([card, button]) })] })).filter(
      (issue) => issue.rule === 'interaction-target',
    )
    expect(issues.map((issue) => issue.message.includes('TabPanel'))).toEqual([true])
  })
})

describe('④ navigate/openModal 대상 페이지가 존재하지 않음', () => {
  it('입력의 어느 페이지 타겟과도 같지 않으면 낸다', () => {
    const button = node('Button', {
      interactions: [{ on: 'click', actions: [{ type: 'navigate', target: 'page:관리자/회원/없음' }] }],
    })
    const issues = lintDesign(
      project({
        pages: [page({ document: doc([button]) }), page({ id: 'pg2', title: '상세', target: 'page:관리자/회원/상세', document: doc([]) })],
      }),
    ).filter((issue) => issue.rule === 'page-target-missing')

    expect(issues).toHaveLength(1)
    expect(issues[0]!.nodeId).toBe(button.id)
    expect(issues[0]!.message).toContain('page:관리자/회원/없음')
  })

  /**
   * **설계서 「lint 규칙」의 줄이 이름으로 든 둘 다 잰다.** 양성 케이스가 전부 `navigate`고
   * `openModal`이 *"내지 않는다"* 쪽에만 나오면, `isPageTargetAction`을 `navigate` 하나로
   * 좁히는 변이가 **아무 케이스도 죽이지 못한다.** 이 케이스가 그 변이를 잡는 자리다.
   */
  it('openModal도 같은 규칙으로 낸다 — navigate 하나만 보지 않는다', () => {
    const opener = node('Button', {
      interactions: [{ on: 'click', actions: [{ type: 'openModal', target: 'page:관리자/회원/없음' }] }],
    })
    const goer = node('Button', {
      interactions: [{ on: 'click', actions: [{ type: 'navigate', target: 'page:관리자/회원/없음2' }] }],
    })
    const issues = lintDesign(project({ pages: [page({ document: doc([opener, goer]) })] })).filter(
      (issue) => issue.rule === 'page-target-missing',
    )

    expect(issues.map((issue) => issue.nodeId).sort()).toEqual([opener.id, goer.id].sort())
    const opened = issues.find((issue) => issue.nodeId === opener.id)!
    expect(opened.message).toContain('openModal')
    expect(opened.message).toContain('page:관리자/회원/없음')
  })

  it('openModal의 빈 타겟도 낸다', () => {
    const opener = node('Button', {
      interactions: [{ on: 'click', actions: [{ type: 'openModal', target: '' }] }],
    })
    const issues = lintDesign(project({ pages: [page({ document: doc([opener]) })] })).filter(
      (issue) => issue.rule === 'page-target-missing',
    )
    expect(issues).toHaveLength(1)
    expect(issues[0]!.message).toContain('openModal')
  })

  it('있는 페이지를 가리키면 내지 않는다 — 자기 자신도 포함이다', () => {
    const button = node('Button', {
      interactions: [
        { on: 'click', actions: [{ type: 'navigate', target: 'page:관리자/회원/상세' }] },
        { on: 'click', actions: [{ type: 'openModal', target: 'page:관리자/회원/목록' }] },
      ],
    })
    const issues = lintDesign(
      project({
        pages: [page({ document: doc([button]) }), page({ id: 'pg2', title: '상세', target: 'page:관리자/회원/상세', document: doc([]) })],
      }),
    ).filter((issue) => issue.rule === 'page-target-missing')

    expect(issues).toEqual([])
  })

  it('아직 고르지 않은 타겟도 낸다 — 문장은 checkPageAction의 것이다', () => {
    const button = node('Button', {
      interactions: [{ on: 'click', actions: [{ type: 'navigate', target: '   ' }] }],
    })
    const issues = lintDesign(project({ pages: [page({ document: doc([button]) })] })).filter(
      (issue) => issue.rule === 'page-target-missing',
    )
    expect(issues).toHaveLength(1)
    expect(issues[0]!.message).toContain('아직 고르지 않았습니다')
  })
})

describe('⑤ 중복된 코멘트 번호', () => {
  it('같은 페이지에서 겹친 marker를 낸다', () => {
    const first = node('Text', { marker: 3 })
    const second = node('Text', { marker: 3 })
    const third = node('Text', { marker: 4 })
    const issues = lintDesign(project({ pages: [page({ document: doc([first, second, third]) })] })).filter(
      (issue) => issue.rule === 'duplicate-marker',
    )

    // **뒤에 온 것만 낸다** — `duplicate-id`가 같은 모양이다.
    expect(issues.map((issue) => issue.nodeId)).toEqual([second.id])
    expect(issues[0]!.message).toContain('3')
    // 자리는 **그 노드의 `marker` 필드**를 가리킨다 — 노드가 아니라 필드를 고쳐야 한다.
    expect(issues[0]!.path).toMatch(/^\/root\/children\/\d+\/marker$/)
  })

  it('다른 페이지의 같은 번호는 겹친 것이 아니다 — 번호는 페이지 단위다', () => {
    const first = node('Text', { marker: 1 })
    const second = node('Text', { marker: 1 })
    const issues = lintDesign(
      project({
        pages: [
          page({ document: doc([first]) }),
          page({ id: 'pg2', title: '상세', target: 'page:관리자/회원/상세', document: doc([second]) }),
        ],
      }),
    ).filter((issue) => issue.rule === 'duplicate-marker')

    expect(issues).toEqual([])
  })
})

describe('⑥ 구조적 공백', () => {
  it('Field가 하나도 없는 EntryForm·SearchForm을 낸다', () => {
    const entry = node('EntryForm', { children: [node('Text')] })
    const search = node('SearchForm', { children: [] })
    const filled = node('EntryForm', { children: [node('Field')] })
    const issues = lintDesign(project({ pages: [page({ document: doc([entry, search, filled]) })] })).filter(
      (issue) => issue.rule === 'structural-gap',
    )

    expect(issues.map((issue) => issue.nodeId).sort()).toEqual([entry.id, search.id].sort())
  })

  it('Field가 하나도 없는 FormTable을 낸다 — 그 표를 품은 EntryForm은 표 안 Field로 채워진다', () => {
    const empty = node('FormTable', { children: [node('Text')] })
    const filled = node('FormTable', { children: [node('Field')] })
    const entry = node('EntryForm', { children: [filled] })
    const issues = lintDesign(project({ pages: [page({ document: doc([empty, entry]) })] })).filter(
      (issue) => issue.rule === 'structural-gap',
    )

    expect(issues.map((issue) => [issue.nodeId, issue.message])).toEqual([[empty.id, 'FormTable 안에 Field가 하나도 없습니다']])
  })

  it('자손에 있으면 채워진 것으로 본다', () => {
    const entry = node('EntryForm', { children: [node('Card', { children: [node('Field')] })] })
    const issues = lintDesign(project({ pages: [page({ document: doc([entry]) })] })).filter((issue) => issue.rule === 'structural-gap')
    expect(issues).toEqual([])
  })
})

describe('⑦ 프로젝트 명명 규칙 (설정 가능)', () => {
  const pages = [
    page({ title: '회원 목록', document: doc([]) }),
    page({ id: 'pg2', title: 'member_list', target: 'page:관리자/회원/member_list', document: doc([]) }),
  ]

  it('설정을 안 주면 돌지 않는다 — 기본값을 지어내지 않는다', () => {
    expect(rulesOf(lintDesign(project({ pages })))).not.toContain('naming')
  })

  it('빈 설정을 줘도 돌지 않는다', () => {
    expect(rulesOf(lintDesign(project({ pages }), {}))).not.toContain('naming')
    expect(rulesOf(lintDesign(project({ pages }), { naming: {} }))).not.toContain('naming')
  })

  it('페이지 이름 규칙을 주면 어긋난 페이지를 낸다', () => {
    const issues = lintDesign(project({ pages }), { naming: { page: '^[가-힣 ]+$' } }).filter((issue) => issue.rule === 'naming')
    expect(issues.map((issue) => issue.pageId)).toEqual(['pg2'])
    expect(issues[0]!.message).toContain('member_list')
  })

  it('메뉴 이름 규칙을 주면 어긋난 메뉴를 낸다', () => {
    const issues = lintDesign(
      project({
        menu: [
          { id: 'm1', parentId: null, title: '관리자' },
          { id: 'm2', parentId: 'm1', title: 'Members' },
        ],
        pages,
      }),
      { naming: { menu: '^[가-힣 ]+$' } },
    ).filter((issue) => issue.rule === 'naming')

    expect(issues.map((issue) => issue.message.includes('Members'))).toEqual([true])
  })

  /**
   * **표의 `requiresConfig`에 소비자를 준다.** 소비자가 없으면 그 필드를 지우는 변이가
   * **아무 케이스도 죽이지 못한다** — 선언만 있고 아무도 안 읽는 상태다. 이 케이스가 표에서 목록을 만들어
   * *"설정 없이는 하나도 안 난다"*를 잰다 — 필드를 지우면 목록이 비어 카나리아가 죽는다.
   */
  describe('requiresConfig가 표에서 목록을 만든다', () => {
    // `LINT_RULES`는 `as const satisfies`라 항목마다 리터럴 타입이다(그래야 `OwnSeverityRuleId`가
    // severity로 갈린다). 공통 필드로 훑을 때는 선언 타입으로 넓혀서 본다.
    const configured = (LINT_RULES as readonly LintRule[]).filter((rule) => rule.requiresConfig === true)

    it('설정으로 켜지는 규칙이 표에 실제로 있다', () => {
      expect(configured.length).toBeGreaterThan(0)
      expect(configured.every((rule) => rule.owner === 'schema')).toBe(true)
    })

    it('설정을 안 주면 그 규칙이 하나도 나지 않는다', () => {
      const fired = lintDesign(project({ pages })).map((issue) => issue.rule)
      for (const rule of configured) {
        expect(fired, rule.id).not.toContain(rule.id)
      }
    })

    it('설정을 주면 그 규칙이 실제로 난다', () => {
      const fired = lintDesign(project({ pages }), { naming: { page: '^[가-힣 ]+$' } }).map((issue) => issue.rule)
      for (const rule of configured) {
        expect(fired, rule.id).toContain(rule.id)
      }
    })
  })

  it('규칙이 정규식이 아니면 그 사실을 이슈로 낸다 — 조용히 넘기지 않는다', () => {
    const issues = lintDesign(project({ pages }), { naming: { page: '([' } }).filter((issue) => issue.rule === 'naming')
    expect(issues).toHaveLength(1)
    expect(issues[0]!.pageId).toBeNull()
    expect(issues[0]!.message).toContain('([')
  })
})

describe('설계서 lint 규칙 밖 — validatePage의 나머지 이슈', () => {
  it('알 수 없는 타입·중복 id를 document-invalid로 나른다', () => {
    const dup = nid()
    const issues = lintDesign(
      project({
        pages: [
          page({
            document: {
              version: 1,
              root: {
                id: nid(),
                type: 'Page',
                children: [
                  { id: dup, type: '없는타입' },
                  { id: dup, type: 'Text' },
                ],
              },
            },
          }),
        ],
      }),
    ).filter((issue) => issue.rule === 'document-invalid')

    expect(issues.map((issue) => issue.severity)).toEqual(['error', 'error'])
    expect(issues.some((issue) => issue.message.includes('없는타입'))).toBe(true)
  })
})

describe('봉투가 깨진 문서 — 던지지 않고 이슈로 낸다', () => {
  /**
   * **lint는 남이 준 것을 읽는 도구다.** `wireb pull`이 받은 JSON도, MCP가 받은 본문도
   * `JSON.parse`의 결과라 타입이 막아 주지 않는다 — **깨진 입력이 정상 입력이다.**
   * 던지면 CLI와 MCP가 그 예외를 각자 다루게 되고 그것이 두 벌이 되는 자리다.
   */
  const broken: { name: string; document: unknown }[] = [
    { name: 'root가 없다', document: { version: 1 } },
    { name: 'root가 null이다', document: { version: 1, root: null } },
    { name: 'root가 노드가 아니다', document: { version: 1, root: 42 } },
    { name: 'version이 없다', document: { root: { id: 'n_000000000001', type: 'Page' } } },
    { name: '문서가 null이다', document: null },
    { name: '문서가 배열이다', document: [] },
  ]

  for (const { name, document } of broken) {
    it(`${name} — document-invalid를 내고 던지지 않는다`, () => {
      const issues = lintDesign(project({ pages: [page({ document: document as PageDocument })] }))
      expect(issues.every((issue) => issue.rule === 'document-invalid')).toBe(true)
      expect(issues.length).toBeGreaterThan(0)
      expect(issues[0]!.pageId).toBe('pg1')
    })
  }

  it('깨진 페이지가 멀쩡한 페이지의 검사를 막지 않는다', () => {
    const list = node('List')
    const issues = lintDesign(
      project({
        pages: [
          page({ document: { version: 1 } as unknown as PageDocument }),
          page({ id: 'pg2', title: '상세', target: 'page:관리자/회원/상세', document: doc([list]) }),
        ],
      }),
    )
    expect(issues.some((issue) => issue.pageId === 'pg1' && issue.rule === 'document-invalid')).toBe(true)
    expect(issues.some((issue) => issue.pageId === 'pg2' && issue.rule === 'comment-missing')).toBe(true)
  })

  it('봉투만 지나면 노드 단위 규칙이 그대로 돈다', () => {
    // 봉투는 통과하고 **노드**가 카탈로그와 어긋나는 문서다 — 즉시 반환이 여기까지 오면 안 된다.
    const issues = lintDesign(
      project({
        pages: [
          page({
            document: {
              version: 1,
              root: { id: nid(), type: 'Page', children: [{ id: nid(), type: '없는타입' }, node('List')] },
            },
          }),
        ],
      }),
    )
    expect(issues.some((issue) => issue.rule === 'document-invalid')).toBe(true)
    expect(issues.some((issue) => issue.rule === 'comment-missing')).toBe(true)
  })
})

describe('표를 덮는다 (D6)', () => {
  /**
   * **케이스가 표에서 목록을 만든다.** 규칙이 늘면 이 케이스가 먼저 죽는다 — 표에 줄만 더하고
   * 구현을 잊는 경로가 없다.
   */
  const owned = LINT_RULES.filter((rule) => rule.owner === 'schema')

  it('schema가 소유한 규칙이 하나도 빠짐없이 실제로 난다', () => {
    const dup = nid()
    const entry = node('EntryForm', { children: [] })
    const marked = node('Text', { marker: 2 })
    const marked2 = node('Text', { marker: 2 })
    const button = node('Button', {
      interactions: [
        { on: 'click', actions: [{ type: 'setVisible', target: 'n_00dead000001', value: true }] },
        { on: 'click', actions: [{ type: 'navigate', target: 'page:없는곳' }] },
      ],
    })
    const everything = lintDesign(
      project({
        pages: [
          page({
            title: 'bad_name',
            document: {
              version: 1,
              root: {
                id: nid(),
                type: 'Page',
                children: [node('List'), entry, marked, marked2, button, { id: dup, type: 'Text' }, { id: dup, type: 'Text' }],
              },
            },
          }),
          page({ id: 'pg2', menuNodeId: '없는메뉴', title: '떠 있는', target: 'page:떠 있는', document: doc([]) }),
          // 화면 상태 둘 — 목록 밖 상태를 가리키는 보임 · 쓰이지 않는 상태.
          page({
            id: 'pg3',
            title: '상태',
            target: 'page:관리자/회원/상태',
            document: {
              version: 2,
              viewStates: [{ id: 's_unused', name: '안씀' }],
              root: {
                id: nid(),
                type: 'Page',
                children: [{ ...node('Text'), visibility: { mode: 'only', states: ['s_gone'] } }],
              },
            },
          }),
        ],
      }),
      { naming: { page: '^[가-힣 ]+$' } },
    )

    expect([...new Set(rulesOf(everything))].sort()).toEqual(owned.map((rule) => rule.id).sort())
  })
})
