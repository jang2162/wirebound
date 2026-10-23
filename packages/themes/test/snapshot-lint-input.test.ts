/**
 * **payload → lint 입력 변환의 판정들.**
 *
 * payload와 lint 입력은 이름도 nullable도 다르다. 그 대응 표를 소비자가 각자 맞추면
 * `wireb lint`와 MCP `validate`가 갈린다. 여기서 재는 것은 **그 표를 지키는 함수 하나**다.
 *
 * **하나짜리로 재지 않는다** — 페이지 하나로 재면 짝짓기가 통째로 뒤바뀌어도
 * 통과한다. 아래 픽스처는 메뉴 둘·깊이 둘·페이지 셋이다.
 */
import { describe, expect, it } from 'vitest'
import { installCatalog, type PageDocument } from '@wirebound/schema'
import { snapshotToLintInput } from '../src/snapshot/lint-input'
import type { SnapshotLayout, SnapshotPayload } from '../src/snapshot/payload'

installCatalog()

const LAYOUT_A = '11111111-1111-4111-8111-111111111111'

function 문서(nodes: unknown[] = []): PageDocument {
  return { version: 3, root: { id: 'root', type: 'Page', children: nodes } } as PageDocument
}

function layout(id: string): SnapshotLayout {
  return { id, name: '기본', schema: { version: 3, root: { id: 'l', type: 'Slot' } } as never }
}

/**
 * 메뉴 둘 · 깊이 둘 · 페이지 셋. **`sortOrder`를 배열 순서와 어긋나게 준다** — 타겟을
 * 만드는 자가 정렬을 하는지가 여기서 드러난다.
 */
function payload(over: Partial<SnapshotPayload> = {}): SnapshotPayload {
  return {
    payloadVersion: 2,
    capturedAt: '2026-08-16T00:00:00.000Z',
    menu: [
      { id: 'm2', parentId: 'm1', title: '회원', sortOrder: 0 },
      { id: 'm1', parentId: null, title: '관리자', sortOrder: 0 },
    ],
    pages: [
      { id: 'p2', menuNodeId: 'm2', title: '상세', sortOrder: 1, description: null, schemaVersion: 3, schema: 문서(), headSeq: 0 },
      { id: 'p1', menuNodeId: 'm2', title: '목록', sortOrder: 0, description: null, schemaVersion: 3, schema: 문서(), headSeq: 0 },
      { id: 'p3', menuNodeId: 'm1', title: '대시보드', sortOrder: 0, description: null, schemaVersion: 3, schema: 문서(), headSeq: 0 },
    ],
    layouts: [layout(LAYOUT_A)],
    comments: [
      {
        id: 'c1',
        pageId: 'p1',
        nodeId: 'root',
        body: '설명',
        authorId: 'u1',
        authorName: '사람',
        createdAt: '2026-08-16T00:00:00.000Z',
        updatedAt: '2026-08-16T00:00:00.000Z',
      },
    ],
    ...over,
  }
}

describe('절 이름을 옮긴다', () => {
  it('payload의 `schema`가 lint의 `document`가 된다', () => {
    const { input } = snapshotToLintInput(payload())
    // 이름이 안 바뀌면 여기가 `undefined`다.
    expect(input.project.pages.every((page) => page.document?.root !== undefined)).toBe(true)
  })

  it('메뉴는 평평한 채로 `sortOrder`만 떨어뜨린다', () => {
    const { input } = snapshotToLintInput(payload())
    expect(input.project.menu).toEqual([
      { id: 'm2', parentId: 'm1', title: '회원' },
      { id: 'm1', parentId: null, title: '관리자' },
    ])
  })

  it('코멘트는 자리 둘만 남는다', () => {
    const { input } = snapshotToLintInput(payload())
    expect(input.project.comments).toEqual([{ pageId: 'p1', nodeId: 'root' }])
  })

  /**
   * **`target`은 payload에 아예 없다.** 승격한 `targetedPages`가 만드는 자리이고, 이것이
   * 없으면 규칙 ④(끊긴 링크)가 멀쩡한 링크를 끊겼다고 말한다.
   */
  it('타겟을 조립해 채운다 — 조상 메뉴가 붙는다', () => {
    const { input } = snapshotToLintInput(payload())
    const byId = new Map(input.project.pages.map((page) => [page.id, page.target]))
    expect(byId.get('p1')).toBe('page:관리자/회원/목록')
    expect(byId.get('p2')).toBe('page:관리자/회원/상세')
    expect(byId.get('p3')).toBe('page:관리자/대시보드')
  })
})

describe('schemaVersion — 마이그레이션을 지난다', () => {
  it('올릴 수 없는 버전이어도 페이지를 버리지 않는다 — 타겟이 사라지면 남의 링크가 끊긴다', () => {
    const 미래 = payload()
    미래.pages[0]!.schema = { version: 999, root: { id: 'root', type: 'Page', children: [] } } as never
    미래.pages[0]!.schemaVersion = 999

    const { input, notes } = snapshotToLintInput(미래)

    expect(input.project.pages).toHaveLength(3)
    expect(input.project.pages.map((page) => page.target)).toContain('page:관리자/회원/상세')
    expect(notes.map((note) => note.kind)).toEqual(['document-version'])
    expect(notes[0]?.pageId).toBe('p2')
  })

  it('올릴 수 있는 문서는 조용히 지나간다', () => {
    const { notes } = snapshotToLintInput(payload())
    expect(notes.filter((note) => note.kind === 'document-version')).toEqual([])
  })
})

describe('메뉴를 잃은 페이지', () => {
  /**
   * FK가 이 상태를 막지 않는다 — `pages_menu_node_id_fkey`가 프로젝트를 안 본다.
   * **버리면 그 페이지의 타겟이 사라지고 남의 멀쩡한 링크가 끊긴 것으로
   * 보고된다.**
   */
  it('조상 없는 타겟을 붙이고 그렇다고 말한다', () => {
    const 떠돌이 = payload()
    떠돌이.pages[2]!.menuNodeId = 'm없음'

    const { input, notes } = snapshotToLintInput(떠돌이)

    expect(input.project.pages).toHaveLength(3)
    expect(input.project.pages.find((page) => page.id === 'p3')?.target).toBe('page:대시보드')
    expect(notes.map((note) => note.kind)).toEqual(['menu-detached'])
  })
})

describe('config는 그대로 지난다', () => {
  it('준 것이 그대로 실린다', () => {
    const config = { naming: { page: '^[가-힣 ]+$' } }
    expect(snapshotToLintInput(payload(), config).input.config).toBe(config)
  })

  it('안 주면 없다 — 기본값을 지어내지 않는다', () => {
    expect(snapshotToLintInput(payload()).input.config).toBeUndefined()
  })
})
