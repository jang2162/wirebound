/**
 * **연달아 넣기 — 방금 넣은 노드 «뒤»**(`src/palette/palette-add.ts` 머리말 «연달아 넣기»). 고른 노드가 하단 판이 방금 넣어 고른 것(`justPlaced`)이면
 * 자식을 받아도 그 바로 뒤에 선다. 그 «뒤» 의 부모 구역이 넣을 것을 안 받으면 표지 없는 규칙(«안» → 그 판의 이유)으로 물러서고, 잠금에 막힌 «뒤» 는
 * 물러서지 않는다. 표지가 없거나 고른 노드가 표지 밖이면 지금 규칙 그대로다. 표지의 수명(사람이 고르면 빈다)은 `store/just-placed.test.ts` 가 잰다.
 */
import { describe, expect, it } from 'vitest'
import type { NodeLock, PageDocument, PatchOp } from '@wirebound/schema'
import '../../src/catalog-setup'
import type { Placing } from '../../src/edit/structure-drop'
import { paletteAddTarget } from '../../src/palette/palette-add'
import { lockedNotice } from '../../src/panels/property-panel'
import { lockedSelectionStatus } from '../../src/panels/toolbar-status'

/**
 * ```
 * n-root (Page)
 * ├ n-form (SearchForm) [n-f1 (Field) [n-in (Input)]]
 * ├ n-flex (Flex)
 * ├ n-text (Text)
 * ├ n-tabs (Tabs) [n-tp (TabPanel)]
 * └ n-grid (DataGrid) — 열 [n-c1 (GridColumn)]
 * ```
 */
function doc(): PageDocument {
  return {
    version: 5,
    root: {
      id: 'n-root',
      type: 'Page',
      children: [
        { id: 'n-form', type: 'SearchForm', children: [{ id: 'n-f1', type: 'Field', children: [{ id: 'n-in', type: 'Input' }] }] },
        { id: 'n-flex', type: 'Flex' },
        { id: 'n-text', type: 'Text' },
        { id: 'n-tabs', type: 'Tabs', children: [{ id: 'n-tp', type: 'TabPanel', props: { label: '탭 1' } }] },
        { id: 'n-grid', type: 'DataGrid', children: [{ id: 'n-c1', type: 'GridColumn' }] },
      ],
    },
  }
}

const free = (): NodeLock | null => null
const adding = (type: string): Extract<Placing, { kind: 'new' }> => ({ kind: 'new', type })
const BOB: NodeLock = { nodeId: 'n-x', userId: 'u-bob', userName: '밥', connectionId: 'c-bob', expiresAt: 0 } as NodeLock

const add = (input: Partial<Parameters<typeof paletteAddTarget>[0]>): ReturnType<typeof paletteAddTarget> =>
  paletteAddTarget({ document: doc(), selectedNodeId: null, placing: adding('Field'), blockedBy: free, lockedBy: () => null, ...input })

describe('방금 넣은 노드 «뒤»', () => {
  it('방금 넣은 필드(자식을 받음)를 고른 채 «필드» 는 그 필드 뒤 — 폼 몸통의 형제', () => {
    expect(add({ selectedNodeId: 'n-f1', justPlaced: ['n-f1'] })).toEqual({
      ok: true,
      target: { parentId: 'n-form', index: 1, placement: 'after' },
    })
  })

  it('방금 넣은 컨테이너(Flex)를 고른 채 «배치» 는 그 뒤 — 형제', () => {
    expect(add({ selectedNodeId: 'n-flex', justPlaced: ['n-flex'], placing: adding('Flex') })).toEqual({
      ok: true,
      target: { parentId: 'n-root', index: 2, placement: 'after' },
    })
  })

  it('방금 넣은 잎(텍스트)도 그 뒤', () => {
    expect(add({ selectedNodeId: 'n-text', justPlaced: ['n-text'], placing: adding('Text') })).toEqual({
      ok: true,
      target: { parentId: 'n-root', index: 3, placement: 'after' },
    })
  })

  it('여럿을 넣어 고른 판(모듈)은 기준 노드(컨테이너) 뒤', () => {
    expect(add({ selectedNodeId: 'n-flex', justPlaced: ['n-form', 'n-flex'], placing: adding('Text') })).toEqual({
      ok: true,
      target: { parentId: 'n-root', index: 2, placement: 'after' },
    })
  })
})

describe('표지가 없으면 지금 규칙', () => {
  it('표지가 없거나 고른 노드가 표지 밖이면 자식을 받는 노드 «안»(끝)', () => {
    const inside = { ok: true, target: { parentId: 'n-f1', index: 1, placement: 'inside' } }
    expect(add({ selectedNodeId: 'n-f1' })).toEqual(inside)
    expect(add({ selectedNodeId: 'n-f1', justPlaced: null })).toEqual(inside)
    expect(add({ selectedNodeId: 'n-f1', justPlaced: ['n-flex'] })).toEqual(inside)
  })

  it('구역을 골랐으면 표지가 있어도 그 구역 끝', () => {
    expect(add({ selectedNodeId: null, selectedZone: { parentId: 'n-form', zone: 'body' }, justPlaced: ['n-f1'] })).toEqual({
      ok: true,
      target: { parentId: 'n-form', index: 1, placement: 'inside' },
    })
  })
})

describe('«뒤» 가 거절되면 물러선다', () => {
  it('탭 패널 뒤(탭 몸통)는 텍스트를 안 받는다 — 그 탭 패널 «안»', () => {
    expect(add({ selectedNodeId: 'n-tp', justPlaced: ['n-tp'], placing: adding('Text') })).toEqual({
      ok: true,
      target: { parentId: 'n-tp', index: 0, placement: 'inside' },
    })
  })

  it('열 뒤(그리드 열 구역)는 텍스트를 안 받는다 — 그 열 «안»', () => {
    expect(add({ selectedNodeId: 'n-c1', justPlaced: ['n-c1'], placing: adding('Text') })).toEqual({
      ok: true,
      target: { parentId: 'n-c1', index: 0, placement: 'inside' },
    })
  })

  it('«뒤» 도 «안» 도 못 서면 표지 없는 판의 이유 문장', () => {
    const chained = add({ selectedNodeId: 'n-tp', justPlaced: ['n-tp'], placing: adding('GridColumn') })
    const plain = add({ selectedNodeId: 'n-tp', placing: adding('GridColumn') })
    expect(chained.ok).toBe(false)
    expect(chained).toEqual(plain)
  })

  it('«뒤» 가 잠금에 막히면 물러서지 않고 잠금 문장', () => {
    // 뿌리 몸통에 바로 넣는 편집(«뒤») 만 막는다 — 그 필드 «안» 은 막지 않는다.
    const blockedBy = (ops: readonly PatchOp[]): NodeLock | null => (ops.some((op) => /^\/root\/children\/\d+$/.test(op.path)) ? BOB : null)
    expect(add({ selectedNodeId: 'n-flex', justPlaced: ['n-flex'], blockedBy })).toEqual({ ok: false, reason: lockedNotice('밥') })
    expect(add({ selectedNodeId: 'n-flex', blockedBy }).ok).toBe(true)
  })

  it('고른 노드를 남이 잡았으면 잎의 «뒤» 와 같은 잠금 문장', () => {
    expect(add({ selectedNodeId: 'n-flex', justPlaced: ['n-flex'], lockedBy: () => BOB })).toEqual({
      ok: false,
      reason: lockedSelectionStatus('밥'),
    })
  })
})
