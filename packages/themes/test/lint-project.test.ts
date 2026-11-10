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
        // 팝업 셋 — 화면 페이지를 여는 «팝업 열기» · 팝업 페이지로 «이동» · 화면 페이지의 «팝업 닫기».
        { on: 'click', actions: [{ type: 'openModal', target: 'page:관리자/bad_name' }] },
        { on: 'click', actions: [{ type: 'navigate', target: 'page:관리자/팝업' }] },
        { on: 'click', actions: [{ type: 'closeModal' }] },
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
          {
            id: 'pg4',
            menuNodeId: 'm1',
            title: '팝업',
            target: 'page:관리자/팝업',
            document: { version: 5, root: { id: nid(), type: 'Popup', props: { title: '팝업' }, children: [] } },
          },
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
          // 공통코드 다섯 — 끊긴 항목 · 사용 안 함 · 고른 값이 없음 · 31 개 · 0 개.
          {
            id: 'pg5',
            menuNodeId: 'm1',
            title: '코드',
            target: 'page:관리자/코드',
            document: doc([
              { id: nid(), type: 'Affix', code: { group: 'S', item: 'GONE' } },
              { id: nid(), type: 'Affix', code: { group: 'S', item: 'OFF' } },
              { id: nid(), type: 'CheckboxGroup', code: { group: 'S', selected: ['GONE'] } },
              { id: nid(), type: 'CheckboxGroup', code: { group: 'MANY' } },
              { id: nid(), type: 'CheckboxGroup', code: { group: 'EMPTY' } },
            ]),
          },
        ],
        comments: [],
        codes: [
          { key: 'S', name: '상태', items: [{ value: 'OFF', name: '꺼짐', active: false }] },
          { key: 'MANY', name: '많음', items: Array.from({ length: 31 }, (_, i) => ({ value: `V${i}`, name: `이름${i}`, active: true })) },
          { key: 'EMPTY', name: '빔', items: [] },
        ],
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
