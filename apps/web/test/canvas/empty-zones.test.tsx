/**
 * **끄는 동안만 서는 빈 구역 칸 — 어느 구역에 서나**(`src/canvas/empty-zones.tsx` 의 `emptyZonesFor` — 머리말의 표). 칸의 그림 · 판정은 실브라우저
 * 판(`build-test/zone-drop.test.ts`)이 잰다.
 */
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { PageDocument } from '@wirebound/schema'
import '../../src/catalog-setup'
import { EMPTY_ZONE_ATTR, EMPTY_ZONE_OF_ATTR, emptyZonesFor } from '../../src/canvas/empty-zones'
import type { Placing } from '../../src/edit/structure-drop'

function doc(): PageDocument {
  return {
    version: 3,
    root: {
      id: 'n-root',
      type: 'Page',
      children: [
        { id: 'n-card', type: 'Card', zones: { headEnd: [{ id: 'n-edit', type: 'Button' }] }, children: [] },
        {
          id: 'n-outer',
          type: 'Card',
          children: [{ id: 'n-inner', type: 'Card' }],
        },
        { id: 'n-tabs', type: 'Tabs', children: [{ id: 'n-tp', type: 'TabPanel' }] },
        { id: 'n-form', type: 'SearchForm', zones: { actions: [] } },
      ],
    },
  }
}

/** 칸이 서는 «부모:구역» 목록 — 렌더러가 묻는 차례와 무관하게 정렬해 견준다. */
function slots(placing: Placing): string[] {
  const zones = emptyZonesFor(doc(), placing)
  if (zones === null) return []
  const out: string[] = []
  for (const id of ['n-root', 'n-card', 'n-outer', 'n-inner', 'n-tabs', 'n-tp', 'n-form', 'n-edit']) {
    for (const zone of ['body', 'titleSide', 'headEnd', 'footer', 'actions', 'headStart']) {
      const element = zones.render(id, zone)
      if (element === null) continue
      // 그린 칸이 판정의 표지(부모 id · 구역)를 든다 — `canvasHitAt` 이 이것으로 찾는다.
      const { container, unmount } = render(element)
      const drawn = container.firstElementChild!
      expect([drawn.getAttribute(EMPTY_ZONE_OF_ATTR), drawn.getAttribute(EMPTY_ZONE_ATTR)]).toEqual([id, zone])
      unmount()
      out.push(`${id}:${zone}`)
    }
  }
  return out.sort()
}

describe('빈 구역 칸이 서는 자리', () => {
  it('새 단추 — 비어 있는 이름 붙은 구역마다(든 구역 · 몸통은 아니다)', () => {
    expect(slots({ kind: 'new', type: 'Button' })).toEqual([
      'n-card:footer',
      'n-card:titleSide',
      'n-form:actions',
      'n-inner:footer',
      'n-inner:headEnd',
      'n-inner:titleSide',
      'n-outer:footer',
      'n-outer:headEnd',
      'n-outer:titleSide',
    ])
  })

  it('옮기는 노드 — 그 노드의 서브트리 안 구역은 빠진다', () => {
    expect(slots({ kind: 'node', id: 'n-outer' })).toEqual(['n-card:footer', 'n-card:titleSide', 'n-form:actions'])
  })

  it('설 자리가 정해진 타입(탭 패널) — 이름 붙은 구역 어디에도 안 선다 · 칸이 없으면 `null`', () => {
    expect(emptyZonesFor(doc(), { kind: 'new', type: 'TabPanel' })).toBeNull()
  })

  it('열쇠는 끄는 것과 칸 집합이다 — 끄는 것이 다르면 다르다', () => {
    const a = emptyZonesFor(doc(), { kind: 'new', type: 'Button' })!.key
    const b = emptyZonesFor(doc(), { kind: 'new', type: 'Text' })!.key
    expect(a).not.toBe(b)
    expect(emptyZonesFor(doc(), { kind: 'new', type: 'Button' })!.key).toBe(a)
  })
})
