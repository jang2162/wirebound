import { beforeAll, describe, expect, it } from 'vitest'
import { LINT_RULES, installCatalog } from '@wirebound/schema'
import type { PageDocument, WbNode } from '@wirebound/schema'
import { lintProject } from '../src/lint/project'

beforeAll(() => {
  installCatalog()
})

let counter = 0
const nid = (): string => `n_${String(++counter).padStart(12, '0')}`

const doc = (children: WbNode[]): PageDocument => ({
  version: 1,
  root: { id: nid(), type: 'Page', children },
})

const meta = (id: string) => ({ id, name: id, version: '1.0.0' })

describe('합치는 자리', () => {
  it('설계서 규칙과 테마 규칙이 한 목록으로 나온다', () => {
    const issues = lintProject({
      project: {
        menu: [{ id: 'm1', parentId: null, title: '관리자' }],
        pages: [
          {
            id: 'pg1',
            menuNodeId: 'm1',
            title: '목록',
            target: 'page:관리자/목록',
            document: doc([{ id: nid(), type: 'List' }]),
          },
        ],
        comments: [],
      },
      themes: [{ id: 'th1', document: { meta: meta('th1'), tokens: { semantic: { primary: 'semantic.없는것' } } } }],
    })

    expect(issues.some((issue) => issue.rule === 'comment-missing')).toBe(true)
    expect(issues.some((issue) => issue.rule === 'theme-token')).toBe(true)
  })

  it('설계서 이슈가 앞이다 — 자리 순으로 읽힌다', () => {
    const issues = lintProject({
      project: {
        menu: [],
        pages: [
          {
            id: 'pg1',
            menuNodeId: '없는메뉴',
            title: '떠 있는',
            target: 'page:떠 있는',
            document: doc([]),
          },
        ],
        comments: [],
      },
      themes: [{ id: 'th1', document: { meta: meta('th1'), tokens: 42 } }],
    })

    const firstTheme = issues.findIndex((issue) => issue.themeId !== null)
    const lastPage = issues.map((issue) => issue.pageId !== null).lastIndexOf(true)
    expect(lastPage).toBeLessThan(firstTheme)
  })

  it('설정은 여기로 지나간다', () => {
    const project = {
      menu: [{ id: 'm1', parentId: null, title: '관리자' }],
      pages: [
        { id: 'pg1', menuNodeId: 'm1', title: 'bad_name', target: 'page:관리자/bad_name', document: doc([]) },
      ],
      comments: [],
    }
    expect(lintProject({ project, themes: [] }).some((issue) => issue.rule === 'naming')).toBe(false)
    expect(
      lintProject({ project, themes: [], config: { naming: { page: '^[가-힣 ]+$' } } }).some(
        (issue) => issue.rule === 'naming',
      ),
    ).toBe(true)
  })

  it('빈 프로젝트는 이슈를 내지 않는다', () => {
    expect(lintProject({ project: { menu: [], pages: [], comments: [] }, themes: [] })).toEqual([])
  })

  /**
   * **깨진 입력이 정상 입력이다.** `wireb pull`이 받은 JSON도 MCP가 받은 본문도
   * `JSON.parse`의 결과라 타입이 막아 주지 않는다 — 던지면 소비자 셋이 그 예외를 각자
   * 다루게 되고 그것이 두 벌이 되는 자리다.
   */
  it('봉투가 깨진 페이지를 양쪽 절반에 넣어도 던지지 않고 document-invalid를 한 번만 낸다', () => {
    const brokenPage = { version: 1 } as unknown as PageDocument
    const issues = lintProject({
      project: {
        menu: [{ id: 'm1', parentId: null, title: '관리자' }],
        pages: [
          { id: 'pg1', menuNodeId: 'm1', title: '목록', target: 'page:관리자/목록', document: brokenPage },
        ],
        comments: [],
      },
      themes: [
        {
          id: 'th1',
          document: {
            meta: meta('th1'),
            components: { Button: { base: { padding: '4px' }, variants: { primary: { padding: '8px' } } } },
          },
          pages: [{ id: 'pg1', document: brokenPage }],
        },
      ],
    })

    expect(issues.map((issue) => issue.rule)).toEqual(['document-invalid'])
    expect(issues[0]!.pageId).toBe('pg1')
    // 문서의 결함은 **설계서 규칙**이 말한다 — 테마 쪽이 함께 내면 owner가 샌다.
    expect(issues[0]!.themeId).toBeNull()
  })
})

describe('표 전체가 이 한 자리에서 돈다', () => {
  it('LINT_RULES의 모든 규칙이 lintProject 하나로 난다', () => {
    const dup = nid()
    const entry: WbNode = { id: nid(), type: 'EntryForm', children: [] }
    const button: WbNode = {
      id: nid(),
      type: 'Button',
      variant: 'danger',
      interactions: [
        { on: 'click', actions: [{ type: 'setVisible', target: 'n_00dead000001', value: true }] },
        { on: 'click', actions: [{ type: 'navigate', target: 'page:없는곳' }] },
      ],
    }
    const issues = lintProject({
      project: {
        menu: [{ id: 'm1', parentId: null, title: '관리자' }],
        pages: [
          {
            id: 'pg1',
            menuNodeId: 'm1',
            title: 'bad_name',
            target: 'page:관리자/bad_name',
            document: {
              version: 1,
              root: {
                id: nid(),
                type: 'Page',
                children: [
                  { id: nid(), type: 'List' },
                  entry,
                  button,
                  { id: nid(), type: 'Text', marker: 2 },
                  { id: nid(), type: 'Text', marker: 2 },
                  { id: dup, type: 'Text' },
                  { id: dup, type: 'Text' },
                ],
              },
            },
          },
          { id: 'pg2', menuNodeId: '없는메뉴', title: '떠 있는', target: 'page:떠 있는', document: doc([]) },
        ],
        comments: [],
      },
      themes: [
        {
          id: 'th1',
          document: {
            meta: meta('th1'),
            tokens: { semantic: { primary: 'semantic.없는것' } },
            components: { Button: { structure: '없는구조', base: { 없는프로퍼티: '1px' } } },
            patterns: { 'hero.basic': { name: '기본', slots: { 안쓰는슬롯: 'text' }, schema: { type: 'Text' } } },
          },
        },
        { id: 'th2', document: { meta: { ...meta('th2'), extends: 'system:nonexistent' } } },
        { id: 'th3', document: { meta: meta('th3'), tokens: 42 } },
        {
          id: 'th4',
          document: {
            meta: meta('th4'),
            components: { Button: { base: { padding: '4px' }, variants: { primary: { padding: '8px' } } } },
          },
          pages: [{ id: 'pg1', document: doc([button]) }],
        },
      ],
      config: { naming: { page: '^[가-힣 ]+$' } },
    })

    expect([...new Set(issues.map((issue) => issue.rule))].sort()).toEqual(
      LINT_RULES.map((rule) => rule.id).sort(),
    )
  })
})
