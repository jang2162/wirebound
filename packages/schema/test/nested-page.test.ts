import { beforeAll, describe, expect, it } from 'vitest'
import { installCatalog } from '../src/component/catalog/index'
import type { LayoutDocument, PageDocument, WbNode } from '../src/node'
import { ISSUE_SEVERITY, excuseStandingNestedPages, validateLayout, validatePage } from '../src/validate'

beforeAll(() => {
  installCatalog()
})

function page(children: WbNode[]): PageDocument {
  return { version: 1, root: { id: 'n_000000000001', type: 'Page', children } }
}

const nested = (doc: PageDocument) => validatePage(doc).filter((issue) => issue.code === 'nested-page')

describe('nested-page — 뿌리 밖의 Page', () => {
  it('뿌리의 자식인 Page 는 오류다 — 노드 · 경로가 그 Page 다', () => {
    const doc = page([{ id: 'n_000000000002', type: 'Page' }])
    expect(validatePage(doc)).toEqual([
      expect.objectContaining({ code: 'nested-page', severity: 'error', nodeId: 'n_000000000002', path: '/root/children/0' }),
    ])
  })

  it('깊이와 상관없다 — Flex 안 Flex 안의 Page', () => {
    const doc = page([
      { id: 'n_000000000002', type: 'Text' },
      {
        id: 'n_000000000003',
        type: 'Flex',
        children: [{ id: 'n_000000000004', type: 'Flex', children: [{ id: 'n_000000000005', type: 'Page' }] }],
      },
    ])
    expect(nested(doc)).toEqual([expect.objectContaining({ nodeId: 'n_000000000005', path: '/root/children/1/children/0/children/0' })])
  })

  it('중첩된 Page 안의 Page 도 하나씩 센다', () => {
    const doc = page([{ id: 'n_000000000002', type: 'Page', children: [{ id: 'n_000000000003', type: 'Page' }] }])
    expect(nested(doc).map((issue) => issue.nodeId)).toEqual(['n_000000000002', 'n_000000000003'])
  })

  it('뿌리 Page 하나는 이슈가 아니다', () => {
    expect(validatePage(page([]))).toEqual([])
    expect(validatePage(page([{ id: 'n_000000000002', type: 'Flex', children: [{ id: 'n_000000000003', type: 'Text' }] }]))).toEqual([])
  })

  it('레이아웃도 같은 판정이다', () => {
    const layout: LayoutDocument = {
      version: 1,
      root: {
        id: 'n_000000000001',
        type: 'Page',
        children: [
          { id: 'n_000000000002', type: 'Slot' },
          { id: 'n_000000000003', type: 'Page' },
        ],
      },
    }
    expect(validateLayout(layout)).toEqual([expect.objectContaining({ code: 'nested-page', nodeId: 'n_000000000003' })])
  })

  it('저장을 막는 오류다', () => {
    expect(ISSUE_SEVERITY['nested-page']).toBe('error')
  })
})

describe('excuseStandingNestedPages — 편집 전 문서에 이미 선 중첩 Page', () => {
  const standing = page([
    { id: 'n_000000000002', type: 'Text' },
    { id: 'n_000000000003', type: 'Page' },
  ])

  it('편집 전에 있던 id 의 nested-page 는 걷는다 — 앞에 형제를 넣어 경로가 밀려도', () => {
    const after = page([
      { id: 'n_000000000009', type: 'Text' },
      { id: 'n_000000000002', type: 'Text' },
      { id: 'n_000000000003', type: 'Page' },
    ])
    expect(validatePage(after).map((issue) => issue.path)).toEqual(['/root/children/2'])
    expect(excuseStandingNestedPages(standing, validatePage(after))).toEqual([])
  })

  it('옮겨도 걷는다 — 같은 id 다', () => {
    const after = page([{ id: 'n_000000000002', type: 'Flex', children: [{ id: 'n_000000000003', type: 'Page' }] }])
    expect(excuseStandingNestedPages(standing, validatePage(after))).toEqual([])
  })

  it('새 id 의 중첩 Page 는 남긴다 — 옛 것이 곁에 있어도', () => {
    const after = page([
      { id: 'n_000000000003', type: 'Page' },
      { id: 'n_000000000004', type: 'Page' },
    ])
    expect(excuseStandingNestedPages(standing, validatePage(after))).toEqual([
      expect.objectContaining({ code: 'nested-page', nodeId: 'n_000000000004' }),
    ])
  })

  it('편집 전 문서에서 뿌리였던 id 는 걷지 않는다 — 뿌리를 안으로 넣은 판', () => {
    // 뿌리 id 를 안의 Page 가 쥔 문서 — `duplicate-id` 가 함께 서지만 `nested-page` 도 걷히지 않고 남는다.
    const after = page([{ id: 'n_000000000001', type: 'Page' }])
    expect(excuseStandingNestedPages(page([]), validatePage(after)).filter((issue) => issue.code === 'nested-page')).toEqual([
      expect.objectContaining({ nodeId: 'n_000000000001' }),
    ])
  })

  it('다른 이슈는 그대로 둔다', () => {
    const after = page([
      { id: 'n_000000000003', type: 'Page' },
      { id: 'n_000000000005', type: 'Nope' },
    ])
    expect(excuseStandingNestedPages(standing, validatePage(after)).map((issue) => issue.code)).toEqual(['unknown-type'])
  })
})
