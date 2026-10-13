/**
 * `nestedPagesUnderRoot` — 프리셋 저장(`apps/api` 의 `routes/presets.ts`)이 새 프리셋에 거는 판정. 노드 묶음을 뿌리 `Page` 의 자식으로
 * 놓았을 때 설 `nested-page` 만 낸다.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { installCatalog, nestedPagesUnderRoot } from '../src/index'

beforeAll(() => {
  installCatalog()
})

describe('nestedPagesUnderRoot', () => {
  it('맨 위 Page · 깊은 Page 를 묶음 기준 경로로 낸다', () => {
    const issues = nestedPagesUnderRoot([
      { id: 'n_text000001', type: 'Text', props: { content: '앞' } },
      { id: 'n_page000001', type: 'Page' },
      { id: 'n_sect000001', type: 'Section', children: [{ id: 'n_page000002', type: 'Page' }] },
    ])
    expect(issues.map((issue) => [issue.code, issue.severity, issue.nodeId, issue.path])).toEqual([
      ['nested-page', 'error', 'n_page000001', '/1'],
      ['nested-page', 'error', 'n_page000002', '/2/children/0'],
    ])
  })

  it('Page 가 없으면 빈 목록 — 다른 카탈로그 위반(알 수 없는 타입 · id 중복)은 내지 않는다', () => {
    expect(
      nestedPagesUnderRoot([
        { id: 'n_odd0000001', type: '없는타입' },
        { id: 'n_odd0000001', type: 'Text', props: { content: 1 } },
      ]),
    ).toEqual([])
    expect(nestedPagesUnderRoot([])).toEqual([])
  })
})
