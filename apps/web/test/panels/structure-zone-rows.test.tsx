/**
 * **구조 트리의 구역 줄**(`src/panels/structure-tree.tsx` 의 `rowLists` — 설계 spec `2026-10-23-node-slots-design.md` 「5. 에디터 · 구조 트리」).
 *
 * - 몸통 하나뿐인 노드는 구역 줄을 안 세운다 — 자식 줄이 지금처럼 바로 선다.
 * - 이름 붙은 구역이 있는 노드는 카탈로그 차례대로 구역 줄을 세우고 그 구역의 노드 줄을 그 밑에 둔다. **빈 구역 줄은 그 노드를 기준 노드로
 *   골랐을 때 · 그 구역을 넣을 자리로 골랐을 때만 선다**(«비어 있음») — 그 밖에는 노드 줄 끝 칩 «빈 구역 N» 이다. 끄는 포인터가 머물러 펴는
 *   판은 실브라우저 `build-test/ui-structure-zones.test.ts`.
 * - 구역 줄은 노드가 아니다 — 줄 행동(`…`)이 없고, 머리를 누르면 넣을 자리로 고른다(스토어의 `selectedZone` — 노드 선택이 빈다). 속성 패널은 구역
 *   이름과 넣는 길 한 줄을 보인다.
 */
import { fireEvent, screen, within } from '@testing-library/react'
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

/** 그 노드 줄의 «빈 구역 N» 칩 글 — 없으면 `null`. */
function chip(nodeId: string): string | null {
  return region().querySelector(`[data-tree-id="${nodeId}"] .wb-shell-structure-empty-zones`)?.textContent ?? null
}

/** 노드 줄을 누른다(그 노드를 기준 노드로 고른다). */
function pick(nodeId: string): void {
  fireEvent.click(region().querySelector(`[data-tree-id="${nodeId}"] > button`)!)
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
  it('빈 구역 줄은 감추고 줄 끝 칩 «빈 구역 N» 으로 접는다 — 내용이 있는 구역 줄은 선다', async () => {
    await openPage(doc())
    expect({ rows: zoneRows('n-card'), chip: chip('n-card'), flexChip: chip('n-flex') }).toEqual({
      rows: [
        ['/zones/headEnd', '머리 오른쪽', ['n-edit']],
        ['/children', '몸통', ['n-kv']],
      ],
      chip: '빈 구역 2',
      flexChip: null,
    })
  })

  it('그 노드를 고르면 카탈로그 차례로 구역 줄을 전부 세운다 — 빈 구역은 «비어 있음» · 칩은 걷힌다', async () => {
    await openPage(doc())
    pick('n-card')
    expect(chip('n-card')).toBeNull()
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

  it('구역 줄에는 줄 행동이 없다 — 머리 단추 하나만 선다', async () => {
    await openPage(doc())
    pick('n-card')
    const zones = [...region().querySelectorAll('li.wb-shell-structure-zone')]
    // 카나리아 — 구역 줄이 섰다(없으면 아래 단언이 빈 목록에서 참이다).
    expect(zones).toHaveLength(4)
    for (const zone of zones) {
      const head = zone.querySelector(':scope > .wb-shell-structure-zone-label') as HTMLElement
      expect(head.tagName).toBe('BUTTON')
      // 머리 단추 곁에 줄 행동(`…` — 메뉴를 여는 단추)이 없다. 구역 안 노드 줄의 `…` 는 그 노드의 것이라 머리와 형제가 아니다.
      expect([...zone.querySelectorAll(':scope > button[aria-haspopup="menu"], :scope > div > button[aria-haspopup="menu"]')]).toEqual([])
    }
  })

  it('구역 줄을 누르면 넣을 자리로 고른다 — 노드 선택이 비어도 그 줄은 서고, 노드를 누르면 구역이 빈다', async () => {
    await openPage(doc())
    pick('n-card')
    const footer = within(region()).getByRole('button', { name: '바닥 · 비어 있음' })
    fireEvent.click(footer)
    expect(footer.getAttribute('aria-current')).toBe('true')
    // 노드 줄의 고른 표시가 없다 — 고른 노드가 비었다.
    expect(within(region()).queryAllByRole('button', { current: true })).toEqual([footer])
    // 속성 패널은 구역 이름과 넣는 길.
    expect(screen.getByRole('heading', { name: 'Card · 바닥' })).not.toBeNull()

    fireEvent.click(region().querySelector('[data-tree-id="n-text"] > button')!)
    expect(screen.queryByRole('heading', { name: 'Card · 바닥' })).toBeNull()
    expect(
      within(region())
        .queryAllByRole('button', { current: true })
        .map((button) => button.textContent),
    ).toEqual(['Text 글'])
    // 구역도 노드도 카드가 아니게 되면 빈 구역 줄이 다시 접힌다.
    expect({ attached: footer.isConnected, chip: chip('n-card') }).toEqual({ attached: false, chip: '빈 구역 2' })
  })

  /**
   * **감춘 구역 줄에 있던 포커스는 그 노드 줄로 간다** — 고른 것이 포커스 없이 바뀌는 판(단축키). jsdom 의 `fireEvent.click` 은 포커스를 안 옮겨
   * 그 판을 흉내 낸다 — 실브라우저의 누름은 누른 줄에 포커스를 준다.
   */
  it('빈 구역 줄이 접힐 때 그 줄에 있던 포커스는 노드 줄 단추로 간다', async () => {
    await openPage(doc())
    pick('n-card')
    const footer = within(region()).getByRole('button', { name: '바닥 · 비어 있음' })
    fireEvent.click(footer)
    footer.focus()
    pick('n-text')
    expect(document.activeElement).toBe(region().querySelector('[data-tree-id="n-card"] > button'))
  })
})
