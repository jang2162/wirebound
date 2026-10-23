/**
 * **구조 트리의 구역 줄**(`src/panels/structure-tree.tsx` 의 `rowLists` — 설계 spec `2026-10-23-node-slots-design.md` 「5. 에디터 · 구조 트리」).
 *
 * - 몸통 하나뿐인 노드는 구역 줄을 안 세운다 — 자식 줄이 지금처럼 바로 선다.
 * - 이름 붙은 구역이 있는 노드는 카탈로그 차례대로 구역 줄을 전부 세우고(빈 구역 포함 · «비어 있음»), 그 구역의 노드 줄을 그 밑에 둔다.
 * - 구역 줄은 노드가 아니다 — 줄 단추가 없다(고르기 · 넣기의 대상은 다음 차수의 일이다).
 */
import { screen, within } from '@testing-library/react'
import type { PageDocument } from '@wirebound/schema'
import { describe, expect, it } from 'vitest'
import { openPage, pageDoc } from '../editor-harness'
import '../../src/catalog-setup'

function doc(): PageDocument {
  return pageDoc({
    id: 'n-root',
    type: 'Page',
    children: [
      {
        id: 'n-card',
        type: 'Card',
        props: { title: '회원 정보' },
        children: [{ id: 'n-kv', type: 'KeyValue' }],
        zones: { headEnd: [{ id: 'n-edit', type: 'Button', props: { label: '수정' } }] },
      },
      { id: 'n-flex', type: 'Flex', children: [{ id: 'n-text', type: 'Text', props: { content: '글' } }] },
    ],
  })
}

function region(): HTMLElement {
  return screen.getByRole('region', { name: '구조 트리' })
}

/** 그 노드 줄(`li`) 바로 밑 목록의 구역 줄 — `[구역 키, 머리 글, 그 구역의 노드 id 들]`. */
function zoneRows(nodeId: string): [string | null, string, string[]][] {
  const row = region().querySelector(`[data-tree-id="${nodeId}"]`)!.closest('li')!
  const list = row.querySelector(':scope > ul')
  if (list === null) return []
  return [...list.querySelectorAll(':scope > li.wb-shell-structure-zone')].map((zone) => [
    zone.getAttribute('data-tree-zone'),
    zone.querySelector('.wb-shell-structure-zone-label')!.textContent ?? '',
    [...zone.querySelectorAll('[data-tree-id]')].map((el) => el.getAttribute('data-tree-id')!),
  ])
}

describe('구조 트리 — 구역 줄', () => {
  it('이름 붙은 구역이 있는 노드는 카탈로그 차례로 구역 줄을 전부 세운다 — 빈 구역은 «비어 있음»', async () => {
    await openPage(doc())
    expect(zoneRows('n-card')).toEqual([
      ['/zones/titleSide', '제목 옆 · 비어 있음', []],
      ['/zones/headEnd', '머리 오른쪽', ['n-edit']],
      ['/children', '몸통', ['n-kv']],
      ['/zones/footer', '바닥 · 비어 있음', []],
    ])
  })

  it('몸통 하나뿐인 노드는 구역 줄이 없다 — 자식 줄이 바로 선다', async () => {
    await openPage(doc())
    expect(zoneRows('n-flex')).toEqual([])
    const flex = region().querySelector('[data-tree-id="n-flex"]')!.closest('li')!
    expect(flex.querySelector(':scope > ul > li [data-tree-id="n-text"]')).not.toBeNull()
  })

  it('구역 줄에는 줄 단추가 없다 — 노드가 아니다', async () => {
    await openPage(doc())
    const zones = [...region().querySelectorAll('li.wb-shell-structure-zone')]
    // 카나리아 — 구역 줄이 섰다(없으면 아래 단언이 빈 목록에서 참이다).
    expect(zones).toHaveLength(4)
    for (const zone of zones) {
      expect(within(zone.querySelector('.wb-shell-structure-zone-label') as HTMLElement).queryAllByRole('button')).toEqual([])
    }
  })
})
