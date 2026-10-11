import { beforeAll, describe, expect, it } from 'vitest'
import { installCatalog, lintRule, type PageDocument, type WbNode } from '@wirebound/schema'
import type { ThemeManifest } from '../src/index'
import { lintProject } from '../src/lint/index'

/**
 * **«현재 테마에 없는 variant»**(spec `docs/superpowers/specs/2026-09-27-code-themes-design.md` 「CLI · MCP」) — `lintProject` 가
 * 프로젝트가 고정한 manifest 를 받으면 `components` 가 선언한 컴포넌트의 노드 `variant` 가 선언 밖일 때 경고한다.
 */
beforeAll(() => {
  installCatalog()
})

const MANIFEST = {
  id: 'acme',
  name: 'ACME',
  version: '1.0.0',
  sdk: '^1.0.0',
  tokens: { items: {} },
  components: {
    List: {
      variants: [
        { id: 'table', label: '테이블' },
        { id: 'cards', label: '카드' },
      ],
      defaultVariant: 'table',
    },
  },
} as ThemeManifest

const doc = (children: WbNode[]): PageDocument => ({ version: 1, root: { id: 'root', type: 'Page', children } })

const project = (children: WbNode[]) => ({
  menu: [{ id: 'm1', parentId: null, title: '관리자' }],
  pages: [{ id: 'pg1', menuNodeId: 'm1', title: '목록', target: 'page:관리자/목록', document: doc(children) }],
  comments: [],
})

const themeIssues = (children: WbNode[], themeManifest?: ThemeManifest) =>
  lintProject({ project: project(children), ...(themeManifest ? { themeManifest } : {}) }).filter((issue) => issue.rule === 'theme-variant')

describe('theme-variant', () => {
  it('선언 밖 variant 는 경고 한 건 — 노드 · 페이지를 짚는다', () => {
    const issues = themeIssues([{ id: 'list1', type: 'List', variant: 'grid' }], MANIFEST)
    expect(issues).toEqual([
      {
        rule: 'theme-variant',
        severity: 'warning',
        pageId: 'pg1',
        nodeId: 'list1',
        path: '/root/children/0/variant',
        message: 'List 의 variant "grid" 는 테마 acme@1.0.0 에 없습니다 — table(기본)으로 그려집니다',
      },
    ])
    expect(lintRule('theme-variant')?.severity).toBe('warning')
  })

  it('안쪽 노드도 센다', () => {
    const issues = themeIssues([{ id: 'sec', type: 'Section', children: [{ id: 'inner', type: 'List', variant: 'grid' }] }], MANIFEST)
    expect(issues.map((issue) => [issue.nodeId, issue.path])).toEqual([['inner', '/root/children/0/children/0/variant']])
  })

  it('선언 안의 variant · variant 없는 노드는 없음', () => {
    expect(
      themeIssues(
        [
          { id: 'a', type: 'List', variant: 'cards' },
          { id: 'b', type: 'List' },
        ],
        MANIFEST,
      ),
    ).toEqual([])
  })

  it('선언이 없는 컴포넌트의 variant 는 없음 — 선언이 없으면 모든 값이 통과한다', () => {
    expect(themeIssues([{ id: 'btn', type: 'Button', variant: 'weird' }], MANIFEST)).toEqual([])
  })

  it('variantFrom 컴포넌트는 보지 않는다', () => {
    // `Text` 는 `role` prop 에서 변형을 짓는다 — manifest 가 그 컴포넌트에 variants 를 선언할 수 없다(검증이 막는다).
    const forced = {
      ...MANIFEST,
      components: { ...MANIFEST.components, Text: { variants: [{ id: 'x', label: 'x' }], defaultVariant: 'x' } },
    }
    expect(themeIssues([{ id: 't', type: 'Text', variant: 'other', props: { content: '글' } }], forced as ThemeManifest)).toEqual([])
  })

  it('manifest 가 없으면 이 규칙은 돌지 않는다', () => {
    expect(themeIssues([{ id: 'list1', type: 'List', variant: 'grid' }])).toEqual([])
  })

  it('봉투가 깨진 페이지에서 던지지 않는다', () => {
    const broken = { version: 1 } as unknown as PageDocument
    expect(() =>
      lintProject({
        project: { ...project([]), pages: [{ id: 'pg1', menuNodeId: 'm1', title: '목록', target: 'page:관리자/목록', document: broken }] },
        themeManifest: MANIFEST,
      }),
    ).not.toThrow()
  })
})
