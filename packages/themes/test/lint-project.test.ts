import { beforeAll, describe, expect, it } from 'vitest'
import { LINT_RULES, installCatalog } from '@wirebound/schema'
import type { PageDocument, WbNode } from '@wirebound/schema'
import { lintProject } from '../src/lint/index'

beforeAll(() => {
  installCatalog()
})

let counter = 0
const nid = (): string => `n_${String(++counter).padStart(12, '0')}`

const doc = (children: WbNode[]): PageDocument => ({
  version: 1,
  root: { id: nid(), type: 'Page', children },
})

describe('lintProject', () => {
  it('설정은 여기로 지나간다', () => {
    const project = {
      menu: [{ id: 'm1', parentId: null, title: '관리자' }],
      pages: [{ id: 'pg1', menuNodeId: 'm1', title: 'bad_name', target: 'page:관리자/bad_name', document: doc([]) }],
      comments: [],
    }
    expect(lintProject({ project }).some((issue) => issue.rule === 'naming')).toBe(false)
    expect(lintProject({ project, config: { naming: { page: '^[가-힣 ]+$' } } }).some((issue) => issue.rule === 'naming')).toBe(true)
  })

  it('빈 프로젝트는 이슈를 내지 않는다', () => {
    expect(lintProject({ project: { menu: [], pages: [], comments: [] } })).toEqual([])
  })

  /**
   * **깨진 입력이 정상 입력이다.** `wireb pull`이 받은 JSON도 MCP가 받은 본문도
   * `JSON.parse`의 결과라 타입이 막아 주지 않는다 — 던지면 소비자 셋이 그 예외를 각자
   * 다루게 되고 그것이 두 벌이 되는 자리다.
   */
  it('봉투가 깨진 페이지를 넣어도 던지지 않고 document-invalid를 한 번만 낸다', () => {
    const brokenPage = { version: 1 } as unknown as PageDocument
    const issues = lintProject({
      project: {
        menu: [{ id: 'm1', parentId: null, title: '관리자' }],
        pages: [{ id: 'pg1', menuNodeId: 'm1', title: '목록', target: 'page:관리자/목록', document: brokenPage }],
        comments: [],
      },
    })

    expect(issues.map((issue) => issue.rule)).toEqual(['document-invalid'])
    expect(issues[0]!.pageId).toBe('pg1')
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
                  { id: nid(), type: 'DataGrid' },
                  // 번호 열의 셀 틀(`ignored-template`) · 열 둘에 칸 하나인 제 칸 행(`grid-row-cells`).
                  {
                    id: nid(),
                    type: 'DataGrid',
                    children: [
                      { id: nid(), type: 'GridColumn', props: { numbering: 'asc' }, children: [{ id: nid(), type: 'Text' }] },
                      { id: nid(), type: 'GridColumn', children: [{ id: nid(), type: 'Text' }] },
                    ],
                    zones: { rows: [{ id: nid(), type: 'GridRow', children: [{ id: nid(), type: 'GridCell' }] }] },
                  },
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
          // 화면 상태 둘 — 목록 밖 상태를 가리키는 보임 · 쓰이지 않는 상태.
          {
            id: 'pg3',
            menuNodeId: 'm1',
            title: '상태',
            target: 'page:관리자/상태',
            document: {
              version: 2,
              viewStates: [{ id: 's_unused', name: '안씀' }],
              root: {
                id: nid(),
                type: 'Page',
                children: [{ id: nid(), type: 'Text', props: { content: '밖' }, visibility: { mode: 'only', states: ['s_gone'] } }],
              },
            },
          },
        ],
        comments: [],
      },
      config: { naming: { page: '^[가-힣 ]+$' } },
      // `Button` 을 선언하되 `danger` 를 빼 — 테마 규칙(`theme-variant`)도 이 자리에서 난다.
      themeManifest: {
        id: 'acme',
        name: 'ACME',
        version: '1.0.0',
        sdk: '^1.0.0',
        tokens: { items: {} },
        components: { Button: { variants: [{ id: 'primary', label: '주' }], defaultVariant: 'primary' } },
      },
    })

    expect([...new Set(issues.map((issue) => issue.rule))].sort()).toEqual(LINT_RULES.map((rule) => rule.id).sort())
  })
})
