/**
 * 판 1 → 2 — 상태 영역을 노드 보임으로 푼다(설계 spec `2026-10-18-modules-states-layout-design.md` 「C4」 · 계획 Review Focus 3).
 *
 * **성질로 단언한다:** 상태마다(기본 포함) 판 1 의 «그 상태에서 보이는 트리»에서 영역 · 가지 노드를 뺀 노드 id 차례 = 판 2 에서 숨은 노드를 뺀
 * 트리의 차례. 판 1 의 판정은 이 파일 안의 사본(`v1VisibleIds` — 걷은 `view-state.ts` 의 `caseFor` · `visibleTree` 를 옮겨 적은 것)이다 —
 * schema 가 판 1 을 더는 그리지 않으므로 얼린 사본과 견준다.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { installCatalog } from '../src/component/catalog/index'
import { CURRENT_DOCUMENT_VERSION, migrateDocument, migratePageDocument } from '../src/migrate'
import { MigrationError, liftStateRegions } from '../src/migrate-document'
import type { PageDocument, ViewState, WbNode } from '../src/node'
import { validatePage } from '../src/validate'
import { visibleTree } from '../src/visibility'

beforeAll(() => {
  installCatalog()
})

// ---- 판 1 의 판정(얼린 사본) ----

function v1CaseFor(sw: WbNode, viewState: string | null): WbNode | null {
  const cases = sw.children ?? []
  const isCase = (child: WbNode, state: string) => child.type === 'StateCase' && child.props?.state === state
  if (viewState !== null && viewState !== 'default') {
    const own = cases.find((child) => isCase(child, viewState))
    if (own !== undefined) return own
  }
  return cases.find((child) => isCase(child, 'default')) ?? null
}

function v1VisibleIds(doc: PageDocument, viewState: string | null): string[] {
  const known = viewState !== null && (doc.viewStates ?? []).some((entry) => entry.id === viewState) ? viewState : null
  const out: string[] = []
  const visit = (node: WbNode): void => {
    if (node.type === 'StateSwitch') {
      const picked = v1CaseFor(node, known)
      if (picked !== null) visit(picked)
      return
    }
    if (node.type !== 'StateCase') out.push(node.id)
    for (const child of node.children ?? []) visit(child)
  }
  visit(doc.root)
  return out
}

const v2VisibleIds = (doc: PageDocument, viewState: string | null): string[] => {
  const out: string[] = []
  const visit = (node: WbNode): void => {
    out.push(node.id)
    node.children?.forEach(visit)
  }
  visit(visibleTree(doc, viewState))
  return out
}

/** 상태마다(기본 · 목록의 상태 전부 · 목록 밖 하나) 판 1 과 판 2 의 보이는 차례. */
function samePerState(v1: PageDocument): void {
  const v2 = migrateDocument(v1)
  const states: (string | null)[] = [null, ...(v1.viewStates ?? []).map((state) => state.id), 's_unlisted']
  for (const state of states) expect(v2VisibleIds(v2, state), `상태 ${state}`).toEqual(v1VisibleIds(v1, state))
}

// ---- 판 짓기 ----

const ADMIN: ViewState = { id: 's_admin', name: '관리자' }
const GUEST: ViewState = { id: 's_guest', name: '손님' }

const text = (id: string): WbNode => ({ id, type: 'Text', props: { content: id } })
const branch = (id: string, state: string, children: WbNode[]): WbNode => ({ id, type: 'StateCase', props: { state }, children })
const region = (id: string, cases: WbNode[]): WbNode => ({ id, type: 'StateSwitch', children: cases })

function v1(children: WbNode[], viewStates: ViewState[] = [ADMIN, GUEST]): PageDocument {
  return { version: 1, root: { id: 'n_root', type: 'Page', children }, viewStates }
}

const vis = (doc: PageDocument): Record<string, unknown> => {
  const out: Record<string, unknown> = {}
  const visit = (node: WbNode): void => {
    if (node.visibility !== undefined) out[node.id] = node.visibility
    node.children?.forEach(visit)
  }
  visit(doc.root)
  return out
}

const ids = (node: WbNode): string[] => [node.id, ...(node.children ?? []).flatMap(ids)]

describe('판 1 → 2', () => {
  it('지금 판은 2 · 판 2 문서는 그대로', () => {
    expect(CURRENT_DOCUMENT_VERSION).toBe(2)
    const doc: PageDocument = { version: 2, root: { id: 'n_root', type: 'Page', children: [text('n_a')] } }
    expect(migratePageDocument(doc)).toEqual(doc)
  })

  it('기본 가지만 — 자식이 영역 자리에 보임 없이 선다', () => {
    const doc = v1([text('n_a'), region('n_sw', [branch('n_d', 'default', [text('n_b'), text('n_c')])]), text('n_z')])
    const out = migratePageDocument(doc)
    expect(out.version).toBe(2)
    expect(ids(out.root)).toEqual(['n_root', 'n_a', 'n_b', 'n_c', 'n_z'])
    expect(vis(out)).toEqual({})
    expect(validatePage(out)).toEqual([])
    samePerState(doc)
  })

  it('기본 + 상태 둘 — 기본은 except [두 상태] · 상태 가지는 only [그 상태] · 꺼낸 차례', () => {
    const doc = v1([
      region('n_sw', [
        branch('n_g', 's_guest', [text('n_g1')]),
        branch('n_d', 'default', [text('n_d1'), text('n_d2')]),
        branch('n_a', 's_admin', [text('n_a1')]),
      ]),
    ])
    const out = migratePageDocument(doc)
    expect(ids(out.root)).toEqual(['n_root', 'n_d1', 'n_d2', 'n_g1', 'n_a1'])
    expect(vis(out)).toEqual({
      n_d1: { mode: 'except', states: ['s_admin', 's_guest'] },
      n_d2: { mode: 'except', states: ['s_admin', 's_guest'] },
      n_g1: { mode: 'only', states: ['s_guest'] },
      n_a1: { mode: 'only', states: ['s_admin'] },
    })
    expect(validatePage(out)).toEqual([])
    samePerState(doc)
  })

  it('빈 가지 — 아무것도 안 꺼낸다', () => {
    const doc = v1([region('n_sw', [branch('n_d', 'default', []), branch('n_a', 's_admin', [])]), text('n_z')])
    expect(ids(migratePageDocument(doc).root)).toEqual(['n_root', 'n_z'])
    samePerState(doc)
  })

  it('목록 밖 상태의 가지 · 같은 상태의 둘째 가지는 버리고 센다', () => {
    const doc = v1([
      region('n_sw', [
        branch('n_d', 'default', [text('n_d1')]),
        branch('n_x', 's_gone', [text('n_x1'), { id: 'n_x2', type: 'Card', children: [text('n_x3')] }]),
        branch('n_a', 's_admin', [text('n_a1')]),
        branch('n_a2', 's_admin', [text('n_dup')]),
      ]),
    ])
    const { doc: out, dropped } = liftStateRegions(doc)
    expect(dropped).toEqual(['n_x1', 'n_x2', 'n_x3', 'n_dup'])
    expect(ids(out.root)).toEqual(['n_root', 'n_d1', 'n_a1'])
    // 기본의 except 는 목록 밖 가지의 상태를 싣지 않는다 — 그 가지는 버렸다.
    expect(vis(out)).toEqual({ n_d1: { mode: 'except', states: ['s_admin'] }, n_a1: { mode: 'only', states: ['s_admin'] } })
    samePerState(doc)
  })

  it('영역 안 영역 — 바깥 가지의 조건을 합친 집합을 only 로', () => {
    const doc = v1([
      region('n_out', [
        branch('n_od', 'default', [
          text('n_od1'),
          region('n_in', [branch('n_id', 'default', [text('n_id1')]), branch('n_ig', 's_guest', [text('n_ig1')])]),
        ]),
        branch('n_oa', 's_admin', [
          region('n_in2', [branch('n_i2d', 'default', [text('n_i2d1')]), branch('n_i2g', 's_guest', [text('n_i2g1')])]),
        ]),
      ]),
    ])
    const { doc: out, dropped } = liftStateRegions(doc)
    expect(ids(out.root)).toEqual(['n_root', 'n_od1', 'n_id1', 'n_ig1', 'n_i2d1'])
    expect(vis(out)).toEqual({
      n_od1: { mode: 'except', states: ['s_admin'] },
      // 바깥 기본(관리자가 아닌 곳) ∩ 안쪽 기본(손님이 아닌 곳) = 기본만.
      n_id1: { mode: 'only', states: ['default'] },
      n_ig1: { mode: 'only', states: ['s_guest'] },
      n_i2d1: { mode: 'only', states: ['s_admin'] },
    })
    // 관리자 가지 안 손님 가지는 어느 상태에서도 안 그려졌다.
    expect(dropped).toEqual(['n_i2g1'])
    expect(validatePage(out)).toEqual([])
    samePerState(doc)
  })

  it('영역이 깊은 자리 — 컨테이너 안이면 부모가 이미 조건을 들어 자식은 제 조건만', () => {
    const doc = v1([
      {
        id: 'n_card',
        type: 'Card',
        children: [
          region('n_sw', [
            branch('n_d', 'default', [
              {
                id: 'n_box',
                type: 'Card',
                children: [region('n_in', [branch('n_id', 'default', [text('n_deep')]), branch('n_ia', 's_admin', [text('n_deep_a')])])],
              },
            ]),
            branch('n_g', 's_guest', [text('n_g1')]),
          ]),
        ],
      },
    ])
    const out = migratePageDocument(doc)
    expect(vis(out)).toEqual({
      n_box: { mode: 'except', states: ['s_guest'] },
      // 부모(n_box)가 «손님이 아닌 곳»이라 그 안에서는 관리자 가지를 빼면 기본만 남는다.
      n_deep: { mode: 'only', states: ['default'] },
      n_deep_a: { mode: 'only', states: ['s_admin'] },
      n_g1: { mode: 'only', states: ['s_guest'] },
    })
    samePerState(doc)
  })

  it('목록 없는 문서(레이아웃 · 클립보드 임시 뿌리) — 기본 가지만 남는다', () => {
    const doc = v1([region('n_sw', [branch('n_d', 'default', [text('n_d1')]), branch('n_a', 's_admin', [text('n_a1')])])], [])
    const { doc: out, dropped } = liftStateRegions(doc)
    expect(ids(out.root)).toEqual(['n_root', 'n_d1'])
    expect(vis(out)).toEqual({})
    expect(dropped).toEqual(['n_a1'])
  })

  it('영역 밖의 가지 · 가지가 아닌 영역 자식', () => {
    const doc = v1([
      branch('n_loose', 'default', [text('n_l1')]),
      region('n_sw', [text('n_bad'), branch('n_d', 'default', [text('n_d1')])]),
    ])
    const { doc: out, dropped } = liftStateRegions(doc)
    expect(ids(out.root)).toEqual(['n_root', 'n_l1', 'n_d1'])
    expect(dropped).toEqual(['n_bad'])
  })

  it('같은 id 가 둘이면 MigrationError — 페이지 id 를 싣는다', () => {
    const doc = v1([text('n_a'), region('n_sw', [branch('n_d', 'default', [text('n_a')])])])
    expect(() => migratePageDocument(doc, { pageId: 'p-1' })).toThrow(MigrationError)
    try {
      migratePageDocument(doc, { pageId: 'p-1' })
    } catch (error) {
      expect(error).toMatchObject({ nodeId: 'n_a', pageId: 'p-1' })
      expect((error as Error).message).toContain('p-1')
    }
  })

  it('상태 영역이 없는 문서는 겹친 id 를 보지 않는다 — 검증의 duplicate-id 몫이다', () => {
    const doc: PageDocument = { version: 1, root: { id: 'n_root', type: 'Page', children: [text('n_a'), text('n_a')] } }
    expect(migratePageDocument(doc)).toEqual({ ...doc, version: 2 })
  })

  it('입력을 고치지 않는다', () => {
    const doc = v1([region('n_sw', [branch('n_d', 'default', [text('n_a')]), branch('n_x', 's_admin', [text('n_b')])])])
    const before = structuredClone(doc)
    migratePageDocument(doc)
    expect(doc).toEqual(before)
  })
})
