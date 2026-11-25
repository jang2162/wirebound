/**
 * **새 중첩 `Page`를 넣는 입구** — 저장 경계 앞에서 판정하는 자리마다 `Page`가 든 노드를 넣으려 하면 무엇이 되는지(`nested-page` —
 * `packages/schema` 의 `validate.ts`). 편집 · `PUT` · 복원 · 옛 문서는 `apps/api/test/nested-page-old-document.test.ts`, 붙이기는
 * `paste-ops.test.ts`, 하단 판의 컴포넌트 목록은 `palette/placeable.test.ts` 가 잰다. 모듈 저장은 서버가 422 `nested-page` 로 막는다
 * (`apps/api/test/modules.test.ts`).
 */
import { beforeAll, describe, expect, it } from 'vitest'
import {
  CURRENT_DOCUMENT_VERSION,
  WIREBOUND_PAGE_VERSION,
  gatePageImport,
  inspectNodesEnvelope,
  installCatalog,
  writeNodesEnvelope,
  type PageDocument,
  type WbNode,
} from '@wirebound/schema'
import { moduleInsertOps } from '../../src/palette/module-insert'

beforeAll(() => {
  installCatalog()
})

const DOC: PageDocument = {
  version: CURRENT_DOCUMENT_VERSION,
  layout: 'blank',
  root: { id: 'n-root', type: 'Page', children: [{ id: 'n-a', type: 'Text' }] },
}
const WITH_PAGE: WbNode = { id: 'n-box', type: 'Flex', children: [{ id: 'n-inner', type: 'Page' }] }
const PLAIN: WbNode = { id: 'n-box', type: 'Flex', children: [{ id: 'n-inner', type: 'Text' }] }

describe('새 중첩 Page 를 넣는 입구', () => {
  // 옮긴 옛 프리셋 · MCP 가 낸 모듈은 화면의 저장 상자를 안 지났을 수 있다 — 넣기가 마지막으로 막는다.
  it('모듈 넣기 — 까닭 · nested-page 문장 (대조: Page 가 없으면 넣는다)', () => {
    let next = 0
    const generate = () => `n-gen-${(next += 1)}`
    const end = { parentId: 'n-root', index: 1, placement: 'inside' as const }
    const refused = moduleInsertOps(DOC, [WITH_PAGE], end, () => false, generate)
    expect(refused).toEqual({ reason: '넣지 못했습니다: Page는 루트에만 둘 수 있습니다 — 페이지 안에 Page를 넣을 수 없습니다' })
    expect('reason' in moduleInsertOps(DOC, [PLAIN], end, () => false, generate)).toBe(false)
  })

  it('페이지 JSON 가져오기 — invalid-document · nested-page (대조: Page 가 없으면 지난다)', () => {
    const file = (children: WbNode[]) => ({
      wireboundVersion: WIREBOUND_PAGE_VERSION,
      page: { title: '가져온 페이지', description: null },
      schema: { version: CURRENT_DOCUMENT_VERSION, layout: 'blank' as const, root: { id: 'n_file_root01', type: 'Page', children } },
      comments: [],
    })
    const refused = gatePageImport(file([{ id: 'n_file_page01', type: 'Page' }]))
    expect(refused).toMatchObject({ ok: false, reason: 'invalid-document' })
    expect(!refused.ok && refused.reason === 'invalid-document' && refused.issues.map((issue) => issue.code)).toEqual(['nested-page'])
    expect(gatePageImport(file([{ id: 'n_file_text01', type: 'Text' }])).ok).toBe(true)
  })

  it('클립보드 봉투 읽기 — rejected · 그 문장 (대조: Page 가 없으면 읽는다)', () => {
    expect(inspectNodesEnvelope(writeNodesEnvelope([WITH_PAGE], CURRENT_DOCUMENT_VERSION))).toEqual({
      kind: 'rejected',
      reason: 'Page는 루트에만 둘 수 있습니다 — 페이지 안에 Page를 넣을 수 없습니다',
    })
    expect(inspectNodesEnvelope(writeNodesEnvelope([PLAIN], CURRENT_DOCUMENT_VERSION)).kind).toBe('ok')
  })
})
