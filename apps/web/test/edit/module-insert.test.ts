/**
 * **모듈 묶음을 넣는 편집**(`src/palette/module-insert.ts`)과 그 자리(`src/palette/palette-add.ts` 의 `paletteAddTarget` — 모듈 `Placing`).
 *
 * 문서로 직접 잰다 — 화면 흐름(다시 읽기 · 404 · 고름)은 `../palette/module-tab.test.tsx`.
 */
import { actionTarget, applyOps, invertOps, partitionIssues, validatePage, type PageDocument, type WbNode } from '@wirebound/schema'
import { describe, expect, it } from 'vitest'
import type { Placing, StructureDrop } from '../../src/edit/structure-drop'
import { moduleDroppedNotice, moduleInsertOps } from '../../src/palette/module-insert'
import { paletteAddTarget } from '../../src/palette/palette-add'
import { STRUCTURE_WHY_DISABLED } from '../../src/panels/tree-row-actions'
import '../../src/catalog-setup'

/**
 * ```
 * n-root (Page)
 * ├ n-text (Text)
 * └ n-box  (Card)
 *    └ n-in (Text)
 * ```
 */
function doc(extra: Partial<PageDocument> = {}): PageDocument {
  return {
    version: 1,
    ...extra,
    root: {
      id: 'n-root',
      type: 'Page',
      children: [
        { id: 'n-text', type: 'Text', props: { content: '글' } },
        { id: 'n-box', type: 'Card', children: [{ id: 'n-in', type: 'Text' }] },
      ],
    },
  }
}

const NODES: WbNode[] = [
  {
    id: 'm_open',
    type: 'Button',
    props: { label: '열기' },
    interactions: [
      {
        on: 'click',
        actions: [
          { type: 'setVisible', target: 'm_close', value: false },
          { type: 'setVisible', target: 'n-text', value: true },
          { type: 'setVisible', target: 'n_elsewhere', value: true },
          { type: 'navigate', target: 'page:/없는 메뉴/없는 페이지' },
        ],
      },
    ],
  },
  { id: 'm_close', type: 'Button', props: { label: '닫기' } },
]

const PLACING: Extract<Placing, { kind: 'module' }> = { kind: 'module', key: 'project:m-1', nodes: NODES }

function counter(): () => string {
  let next = 0
  return () => `n_new${String((next += 1)).padStart(9, '0')}`
}

function target(document: PageDocument, selectedNodeId: string | null): StructureDrop {
  const verdict = paletteAddTarget({ document, selectedNodeId, placing: PLACING, blockedBy: () => null, lockedBy: () => null })
  if (!verdict.ok) throw new Error(verdict.reason)
  return verdict.target
}

const NO_PAGES = (): boolean => false

describe('자리 — 컴포넌트 카드와 같은 표', () => {
  it('고른 것 없음 · 뿌리 → 페이지 끝 · 컨테이너 → 그 안 끝 · 잎 → 바로 뒤', () => {
    const d = doc()
    expect([target(d, null), target(d, 'n-root'), target(d, 'n-box'), target(d, 'n-text')].map((t) => [t.parentId, t.index])).toEqual([
      ['n-root', 2],
      ['n-root', 2],
      ['n-box', 1],
      ['n-root', 1],
    ])
  })

  it('빈 묶음은 자리를 못 낸다', () => {
    const verdict = paletteAddTarget({
      document: doc(),
      selectedNodeId: null,
      placing: { kind: 'module', key: 'k', nodes: [] },
      blockedBy: () => null,
      lockedBy: () => null,
    })
    expect(verdict.ok).toBe(false)
  })
})

describe('moduleInsertOps', () => {
  it('편집 하나가 노드를 차례로 넣는다 · 새 id · 넣은 노드 전부를 고른다 · 결과 문서가 검증을 지난다', () => {
    const before = doc()
    const edit = moduleInsertOps(before, NODES, target(before, 'n-text'), NO_PAGES, counter())
    if ('reason' in edit) throw new Error(edit.reason)
    const after = applyOps(before, edit.ops)
    // 첫 id 는 임시 뿌리가 받아 간다(`prepareNodesForPaste` 머리말).
    expect(after.root.children!.map((node) => node.id)).toEqual(['n-text', 'n_new000000002', 'n_new000000003', 'n-box'])
    expect(edit.insertedIds).toEqual(['n_new000000002', 'n_new000000003'])
    expect(edit.selectIds).toEqual(edit.insertedIds)
    expect(partitionIssues(validatePage(after)).errors).toEqual([])
  })

  it('되돌리기(역연산 한 묶음)로 넣기 전 문서', () => {
    const before = doc()
    const edit = moduleInsertOps(before, NODES, target(before, null), NO_PAGES, counter())
    if ('reason' in edit) throw new Error(edit.reason)
    const inverse = invertOps(before, edit.ops)
    expect(applyOps(applyOps(before, edit.ops), inverse)).toEqual(before)
  })

  it('넣는 페이지에 없는 노드 · 페이지를 겨냥한 액션을 빼고 센다 — 묶음 안은 새 id 를 따라가고 페이지에 있는 노드는 남는다', () => {
    const before = doc()
    const edit = moduleInsertOps(before, NODES, target(before, null), NO_PAGES, counter())
    if ('reason' in edit) throw new Error(edit.reason)
    const open = applyOps(before, edit.ops).root.children![2]!
    expect(open.interactions![0]!.actions.map(actionTarget)).toEqual(['n_new000000003', 'n-text'])
    expect(edit.droppedActions).toBe(2)
    expect(moduleDroppedNotice(edit)).toBe('상호작용 동작 2개는 대상이 없어 빼고 넣었습니다.')
  })

  /**
   * **넣은 노드는 보임 없이 들어간다** — 모듈에는 상태가 없다(설계 spec «B3» · «C2»). 저장이 걷지만(`moduleNodesForSave`) 그 앞에 저장된 묶음 ·
   * 손으로 넣은 행에 보임이 남았어도 넣기가 걷는다 — 넣는 페이지에 같은 id 의 상태가 있어도(`s_admin`) 붙지 않는다.
   */
  it('넣은 노드는 보임 없이 들어간다 — 자손까지 · 넣는 페이지에 그 상태가 있어도', () => {
    const boxed: WbNode = {
      id: 'm_box',
      type: 'Card',
      visibility: { mode: 'only', states: ['s_admin'] },
      children: [{ id: 'm_t', type: 'Text', visibility: { mode: 'except', states: ['default'] } }],
    }
    const before = doc({ viewStates: [{ id: 's_admin', name: '관리자' }] })
    const edit = moduleInsertOps(before, [boxed], target(before, null), NO_PAGES, counter())
    if ('reason' in edit) throw new Error(edit.reason)
    const placed = applyOps(before, edit.ops).root.children![2]!
    expect(placed.visibility).toBeUndefined()
    expect(placed.children![0]!.visibility).toBeUndefined()
    // 입력(저장된 묶음)은 그대로다 — 카드가 다시 넣을 때 쓴다.
    expect(boxed.visibility).toEqual({ mode: 'only', states: ['s_admin'] })
  })

  /**
   * **상태 대상 액션도 보임과 같은 까닭으로 끊긴 것으로 다룬다**(RV-VS L3) — 모듈에는 상태가 없다. 저장이 빼지만(`moduleNodesForSave`) 그 앞에
   * 저장된 묶음 · 손으로 넣은 행에 남았어도 넣기가 뺀다 — 넣는 페이지에 같은 id 의 상태가 있어도 붙지 않는다. 기본(`default`)은 남는다.
   */
  it('«화면 상태 바꾸기» 의 상태 대상은 빼고 센다 — 넣는 페이지에 그 상태가 있어도 · 기본은 남는다', () => {
    const toggle: WbNode = {
      id: 'm_toggle',
      type: 'Button',
      props: { label: '열기' },
      interactions: [
        {
          on: 'click',
          actions: [
            { type: 'setViewState', target: 's_admin' },
            { type: 'setViewState', target: 'default' },
          ],
        },
      ],
    }
    const before = doc({ viewStates: [{ id: 's_admin', name: '관리자' }] })
    const edit = moduleInsertOps(before, [toggle], target(before, null), NO_PAGES, counter())
    if ('reason' in edit) throw new Error(edit.reason)
    const placed = applyOps(before, edit.ops).root.children![2]!
    expect({ targets: placed.interactions![0]!.actions.map(actionTarget), dropped: edit.droppedActions }).toEqual({
      targets: ['default'],
      dropped: 1,
    })
  })

  it('자식을 안 받는 부모 자리면 까닭 — `addInside` 판정의 설명', () => {
    const before = doc()
    const edit = moduleInsertOps(before, NODES, { parentId: 'n-text', index: 0, placement: 'inside' }, NO_PAGES)
    expect(edit).toEqual({ reason: STRUCTURE_WHY_DISABLED.addInside })
  })

  it('넣으면 문서가 저장될 수 없는 묶음(Page 가 든 옮긴 옛 모듈)은 까닭', () => {
    const before = doc()
    const nested: WbNode[] = [{ id: 'm_page', type: 'Page', children: [] }]
    const edit = moduleInsertOps(before, nested, target(before, null), NO_PAGES, counter())
    // 문장의 동사는 넣기의 것이다(붙여넣기와 같은 `insertMany` 를 지나지만 «붙이지»가 아니다).
    expect(edit).toEqual({ reason: '넣지 못했습니다: Page는 루트에만 둘 수 있습니다 — 페이지 안에 Page를 넣을 수 없습니다' })
  })

  it('입력 묶음을 바꾸지 않는다(탭이 쥔 모듈 목록을 그대로 넘긴다)', () => {
    const before = doc()
    const copy = structuredClone(NODES)
    moduleInsertOps(before, NODES, target(before, null), NO_PAGES, counter())
    expect(NODES).toEqual(copy)
  })
})
