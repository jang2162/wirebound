/**
 * **구역을 넣을 자리로** — 구역 끝의 판정(`src/edit/structure-drop.ts` 의 `zoneDropTarget`), 못 놓는 까닭의 문장(`fitRefusal` · `dropRefusal`),
 * 하단 판 넣기(`src/palette/palette-add.ts` 의 `selectedZone`) · 붙여넣기(`src/edit/paste-ops.ts` 의 구역 기준) — 설계 spec
 * `2026-10-23-node-slots-design.md` 「5. 에디터」 «넣기 · 붙여넣기 · 모듈 넣기의 대상».
 *
 * 연산은 패치 엔진으로 실제로 얹어 어디에 섰는지 본다(경로 모양만 보면 앞 연산이 민 좌표를 못 잰다).
 */
import { describe, expect, it } from 'vitest'
import {
  applyOps,
  lockConflictOfOps,
  partitionIssues,
  validatePage,
  type NodeLock,
  type PageDocument,
  type PatchOp,
} from '@wirebound/schema'
import '../../src/catalog-setup'
import { pasteOps } from '../../src/edit/paste-ops'
import { dropRefusal, fitRefusal, zoneDropRefusal, zoneDropTarget, type Placing } from '../../src/edit/structure-drop'
import { paletteAddTarget } from '../../src/palette/palette-add'
import { NOT_IN_DOCUMENT_STATUS } from '../../src/panels/toolbar-status'

/**
 * ```
 * n-root (Page)
 * ├ n-card (Card) — 몸통 [n-kv] · 머리 오른쪽 [n-edit] · 제목 옆 · 바닥 비어 있음
 * ├ n-bare (Card) — `zones` 맵이 없다
 * ├ n-tabs (Tabs) — 몸통 [n-tp1 [n-t1]]
 * └ n-text (Text)
 * ```
 */
function doc(): PageDocument {
  return {
    version: 5,
    root: {
      id: 'n-root',
      type: 'Page',
      children: [
        {
          id: 'n-card',
          type: 'Card',
          children: [{ id: 'n-kv', type: 'KeyValue' }],
          zones: { headEnd: [{ id: 'n-edit', type: 'Button', props: { label: '수정' } }] },
        },
        { id: 'n-bare', type: 'Card' },
        {
          id: 'n-tabs',
          type: 'Tabs',
          children: [{ id: 'n-tp1', type: 'TabPanel', props: { label: '기본' }, children: [{ id: 'n-t1', type: 'Text' }] }],
        },
        { id: 'n-text', type: 'Text' },
      ],
    },
  }
}

const free = (): NodeLock | null => null
const adding = (type: string): Extract<Placing, { kind: 'new' }> => ({ kind: 'new', type })
const moving = (id: string): Placing => ({ kind: 'node', id })

function lockOn(nodeId: string, document: PageDocument = doc()): (ops: readonly PatchOp[]) => NodeLock | null {
  return (ops) => lockConflictOfOps({ document, locks: [{ nodeId, userId: 'u-bora', userName: '보라' }], ops, viewerUserId: 'u-me' })
}

/** 그 부모의 그 구역 id 차례 — 얹은 문서에서. */
function idsIn(document: PageDocument, parentId: string, zone: string): string[] {
  const find = (node: Record<string, unknown>): Record<string, unknown> | null => {
    if (node['id'] === parentId) return node
    const lists = [node['children'], ...Object.values((node['zones'] as Record<string, unknown> | undefined) ?? {})]
    for (const list of lists)
      for (const child of (list as Record<string, unknown>[] | undefined) ?? []) {
        const hit = find(child)
        if (hit !== null) return hit
      }
    return null
  }
  const parent = find(document.root as unknown as Record<string, unknown>)
  const list = zone === 'body' ? parent?.['children'] : (parent?.['zones'] as Record<string, unknown> | undefined)?.[zone]
  return ((list as { id: string }[] | undefined) ?? []).map((node) => node.id)
}

describe('구역 끝(`zoneDropTarget`)', () => {
  it('빈 구역 · 든 구역 · `zones` 맵이 없는 노드 — 끝 차례 · 띠 «안»', () => {
    expect(zoneDropTarget(doc(), adding('Button'), 'n-card', 'footer', free)).toEqual({
      parentId: 'n-card',
      zone: 'footer',
      index: 0,
      placement: 'inside',
    })
    expect(zoneDropTarget(doc(), adding('Button'), 'n-card', 'headEnd', free)).toEqual({
      parentId: 'n-card',
      zone: 'headEnd',
      index: 1,
      placement: 'inside',
    })
    expect(zoneDropTarget(doc(), adding('Button'), 'n-bare', 'titleSide', free)?.index).toBe(0)
    // 몸통도 구역이다 — 구역 줄 «몸통» 을 고른 판.
    expect(zoneDropTarget(doc(), adding('Text'), 'n-card', 'body', free)).toEqual({ parentId: 'n-card', index: 1, placement: 'inside' })
  })

  it('노드를 다른 구역으로 옮긴다 — 머리 오른쪽 단추를 빈 바닥으로', () => {
    const target = zoneDropTarget(doc(), moving('n-edit'), 'n-card', 'footer', free)
    expect(target).toEqual({ parentId: 'n-card', zone: 'footer', index: 0, placement: 'inside' })
  })

  it('못 놓는 자리 → null — 구역이 없는 타입 · 문서에 없는 부모 · 자기 서브트리 · 제자리 · 남의 잠금', () => {
    expect(zoneDropTarget(doc(), adding('Button'), 'n-text', 'footer', free)).toBeNull()
    expect(zoneDropTarget(doc(), adding('Button'), 'n-card', 'nowhere', free)).toBeNull()
    expect(zoneDropTarget(doc(), adding('Button'), 'n-gone', 'footer', free)).toBeNull()
    // 자기 서브트리 — 진단 줄의 까닭(`drag/drag-debug.ts`)도 그 판의 것이다(옮기기 연산이 먼저 막아도 «연산을 못 지음» 으로 적히지 않게).
    const why: string[] = []
    expect(zoneDropTarget(doc(), moving('n-card'), 'n-card', 'footer', free, (reason) => why.push(reason))).toBeNull()
    expect(why).toEqual(['into-own-subtree'])
    expect(zoneDropTarget(doc(), moving('n-edit'), 'n-card', 'headEnd', free)).toBeNull()
    expect(zoneDropTarget(doc(), adding('Button'), 'n-card', 'footer', lockOn('n-card'))).toBeNull()
    // 카나리아 — 잠금이 무관한 노드면 선다.
    expect(zoneDropTarget(doc(), adding('Button'), 'n-card', 'footer', lockOn('n-text'))).not.toBeNull()
  })

  it('받는 타입 · 설 자리 — 탭 몸통에 단추 · 카드 바닥에 탭 패널 → null', () => {
    expect(zoneDropTarget(doc(), adding('Button'), 'n-tabs', 'body', free)).toBeNull()
    expect(zoneDropTarget(doc(), adding('TabPanel'), 'n-card', 'footer', free)).toBeNull()
    expect(zoneDropTarget(doc(), adding('TabPanel'), 'n-tabs', 'body', free)).not.toBeNull()
  })
})

/**
 * 아래 케이스들의 이유 문장은 `fitRefusal` 이 짓는 그대로다 — 글자는 «받는 타입 밖 · 설 자리 밖 · 설 수 있는 판» 케이스 하나가 갖는다(문장을 바꾸는
 * 변조는 그 케이스만 죽고, 나머지는 «어느 판에서 그 문장이 서나» 를 잰다).
 */
const TABS_ONLY_PANELS = fitRefusal('Tabs', 'body', 'Button')
const PANEL_ONLY_IN_TABS = fitRefusal('Card', 'footer', 'TabPanel')

describe('못 놓는 까닭의 문장', () => {
  it('받는 타입 밖 · 설 자리 밖 · 설 수 있는 판', () => {
    expect(fitRefusal('Tabs', 'body', 'Button')).toBe('탭에는 탭 패널만 놓을 수 있습니다')
    expect(fitRefusal('Card', 'footer', 'TabPanel')).toBe('탭 패널은 탭 안에만 놓을 수 있습니다')
    expect(fitRefusal('Card', 'footer', 'Button')).toBeNull()
    expect(fitRefusal('Tabs', 'body', 'TabPanel')).toBeNull()
  })

  it('포인터 밑 노드 · 띠의 문장(`dropRefusal`) — 탭 «안» · 패널 곁 · 패널 «안»', () => {
    expect(dropRefusal(doc(), adding('Button'), 'n-tabs', 'inside')).toBe(TABS_ONLY_PANELS)
    expect(dropRefusal(doc(), adding('Button'), 'n-tp1', 'after')).toBe(TABS_ONLY_PANELS)
    expect(dropRefusal(doc(), adding('Button'), 'n-tp1', 'inside')).toBeNull()
    expect(dropRefusal(doc(), moving('n-tp1'), 'n-text', 'after')).toBe(PANEL_ONLY_IN_TABS)
    expect(zoneDropRefusal(doc(), adding('TabPanel'), 'n-card', 'footer')).toBe(PANEL_ONLY_IN_TABS)
  })
})

describe('하단 판 넣기 — 고른 구역(`paletteAddTarget` 의 `selectedZone`)', () => {
  const add = (input: Partial<Parameters<typeof paletteAddTarget>[0]>): ReturnType<typeof paletteAddTarget> =>
    paletteAddTarget({
      document: doc(),
      selectedNodeId: null,
      placing: adding('Button'),
      blockedBy: free,
      lockedBy: () => null,
      ...input,
    })

  it('고른 구역의 끝 — 고른 노드보다 앞선다', () => {
    expect(add({ selectedZone: { parentId: 'n-card', zone: 'footer' } })).toEqual({
      ok: true,
      target: { parentId: 'n-card', zone: 'footer', index: 0, placement: 'inside' },
    })
    expect(add({ selectedZone: { parentId: 'n-card', zone: 'headEnd' }, selectedNodeId: 'n-text' })).toEqual({
      ok: true,
      target: { parentId: 'n-card', zone: 'headEnd', index: 1, placement: 'inside' },
    })
  })

  it('못 넣으면 까닭 — 받는 타입 밖은 이유 문장 · 부모가 사라짐은 «문서에 없다»', () => {
    expect(add({ selectedZone: { parentId: 'n-tabs', zone: 'body' } })).toEqual({ ok: false, reason: TABS_ONLY_PANELS })
    expect(add({ selectedZone: { parentId: 'n-gone', zone: 'footer' } })).toEqual({ ok: false, reason: NOT_IN_DOCUMENT_STATUS })
  })

  it('고른 노드의 판도 받는 타입 밖이면 이유 문장이다 — 탭을 고르고 단추 넣기', () => {
    expect(add({ selectedNodeId: 'n-tabs' })).toEqual({ ok: false, reason: TABS_ONLY_PANELS })
  })

  it('고른 노드가 구역 안 잎이면 같은 구역의 그 뒤 — 머리 오른쪽 단추를 고른 판', () => {
    expect(add({ selectedNodeId: 'n-edit' })).toEqual({
      ok: true,
      target: { parentId: 'n-card', zone: 'headEnd', index: 1, placement: 'after' },
    })
  })
})

describe('붙여넣기 — 고른 구역(`pasteOps`)', () => {
  const button = { id: 'n-new', type: 'Button', props: { label: '목록' } }

  it('빈 구역 · `zones` 맵이 없는 노드 · 든 구역의 끝에 붙는다 — 결과 문서가 검증을 지난다', () => {
    for (const [parentId, zone, expected] of [
      ['n-card', 'footer', ['n-new']],
      ['n-bare', 'headEnd', ['n-new']],
      ['n-card', 'headEnd', ['n-edit', 'n-new']],
    ] as const) {
      const edit = pasteOps(doc(), { parentId, zone }, [button])
      if ('reason' in edit) throw new Error(edit.reason)
      const next = applyOps(doc(), edit.ops)
      expect(idsIn(next, parentId, zone)).toEqual(expected)
      expect(partitionIssues(validatePage(next)).errors).toEqual([])
    }
  })

  it('받는 타입 밖이면 이유 문장 · 부모가 없으면 붙일 자리 없음', () => {
    expect(pasteOps(doc(), { parentId: 'n-tabs', zone: 'body' }, [button])).toEqual({ reason: TABS_ONLY_PANELS })
    expect('reason' in pasteOps(doc(), { parentId: 'n-gone', zone: 'footer' }, [button])).toBe(true)
  })
})
