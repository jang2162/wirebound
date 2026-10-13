/**
 * **새 중첩 `Page`를 넣는 입구** — 저장 경계 앞에서 판정하는 자리마다 `Page`가 든 노드를 넣으려 하면 무엇이 되는지(`nested-page` —
 * `packages/schema` 의 `validate.ts`). 편집 · `PUT` · 복원 · 옛 문서는 `apps/api/test/nested-page-old-document.test.ts`, 붙이기는
 * `paste-ops.test.ts`, 타입 고르개는 `panels/type-picker-placeable.test.tsx` 가 잰다.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import {
  WIREBOUND_PAGE_VERSION,
  gatePageImport,
  inspectNodesEnvelope,
  installCatalog,
  writeNodesEnvelope,
  type PageDocument,
  type WbNode,
} from '@wirebound/schema'
import { patternInsert } from '../../src/edit/pattern-insert'
import { presetApply } from '../../src/edit/preset-apply'

beforeAll(() => {
  installCatalog()
})

const DOC: PageDocument = { version: 1, root: { id: 'n-root', type: 'Page', children: [{ id: 'n-a', type: 'Text' }] } }
const WITH_PAGE: WbNode = { id: 'n-box', type: 'Flex', children: [{ id: 'n-inner', type: 'Page' }] }
const PLAIN: WbNode = { id: 'n-box', type: 'Flex', children: [{ id: 'n-inner', type: 'Text' }] }

describe('새 중첩 Page 를 넣는 입구', () => {
  it('패턴 넣기 — invalid · nested-page (대조: Page 가 없으면 넣는다)', () => {
    const refused = patternInsert(DOC, null, { nodes: [WITH_PAGE], slots: new Map() })
    expect(refused.reason).toBe('invalid')
    expect(refused.issues.map((issue) => issue.code)).toEqual(['nested-page'])
    expect(patternInsert(DOC, null, { nodes: [PLAIN], slots: new Map() }).reason).toBeNull()
  })

  it('프리셋 적용 — invalid · nested-page (대조: Page 가 없으면 놓는다)', () => {
    let next = 0
    const generate = () => `n-gen-${(next += 1)}`
    const refused = presetApply(DOC, [WITH_PAGE], generate)
    expect(refused.reason).toBe('invalid')
    expect(refused.issues.map((issue) => issue.code)).toEqual(['nested-page'])
    expect(presetApply(DOC, [PLAIN], generate).reason).toBeNull()
  })

  it('페이지 JSON 가져오기 — invalid-document · nested-page (대조: Page 가 없으면 지난다)', () => {
    const file = (children: WbNode[]) => ({
      wireboundVersion: WIREBOUND_PAGE_VERSION,
      page: { title: '가져온 페이지', description: null },
      schema: { version: 1, root: { id: 'n_file_root01', type: 'Page', children } },
      comments: [],
    })
    const refused = gatePageImport(file([{ id: 'n_file_page01', type: 'Page' }]))
    expect(refused).toMatchObject({ ok: false, reason: 'invalid-document' })
    expect(!refused.ok && refused.reason === 'invalid-document' && refused.issues.map((issue) => issue.code)).toEqual(['nested-page'])
    expect(gatePageImport(file([{ id: 'n_file_text01', type: 'Text' }])).ok).toBe(true)
  })

  it('클립보드 봉투 읽기 — rejected · 그 문장 (대조: Page 가 없으면 읽는다)', () => {
    expect(inspectNodesEnvelope(writeNodesEnvelope([WITH_PAGE], 1))).toEqual({
      kind: 'rejected',
      reason: 'Page는 루트에만 둘 수 있습니다 — 페이지 안에 Page를 넣을 수 없습니다',
    })
    expect(inspectNodesEnvelope(writeNodesEnvelope([PLAIN], 1)).kind).toBe('ok')
  })
})
