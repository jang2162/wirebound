/**
 * **구조 트리의 줄 행동 · 끌어 놓기**(`src/panels/structure-tree.tsx` · `src/panels/tree-row-actions.tsx` ·
 * `src/edit/structure-drop.ts`) — jsdom 판. 옛 툴바 케이스를 줄 행동으로 옮긴 판은 `./structure-toolbar.test.tsx` 등이 갖고, 여기는
 * 줄 행동에서 새로 생긴 성질을 잰다: 항목의 차례 · 걷은 넣기 입구가 없다 · 여는 줄이 먼저 골라진다 · 끌어 놓기가 내는 편집.
 *
 * 끌기는 줄 상자에 가짜 자리를 준다(`./menu-row-actions.test.tsx`와 같은 꼴). 잠금이 걸린 끌기는 `../lock/toolbar-abilities.test.tsx`,
 * 실브라우저 판은 `build-test/tree-drag.test.ts`가 잰다.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { PatchOp } from '@wirebound/schema'
import type { ApiClient } from '../../src/api/client'
import type { PatchResult } from '../../src/api/types'
import { HEAD_SEQ, openPage, pageDoc, structureTypes } from '../editor-harness'
import { installPointerEvents } from '../pointer-events'
import '../../src/catalog-setup'
import { isOff, pickedRow, rowAction, rowToggle, structureRowName, structureRowType } from './tree-row'

beforeAll(installPointerEvents)
afterEach(() => {
  vi.restoreAllMocks()
})

/**
 * ```
 * n-root (Page)
 * ├ n-a   (Text)
 * ├ n-box (Card)
 * │  ├ n-1 (Button)
 * │  └ n-2 (Link)
 * └ n-c   (Divider)
 * ```
 * 줄 이름이 타입이라 타입이 전부 다르다.
 */
function doc(): ReturnType<typeof pageDoc> {
  return pageDoc({
    id: 'n-root',
    type: 'Page',
    children: [
      { id: 'n-a', type: 'Text' },
      {
        id: 'n-box',
        type: 'Card',
        children: [
          { id: 'n-1', type: 'Button' },
          { id: 'n-2', type: 'Link' },
        ],
      },
      { id: 'n-c', type: 'Divider' },
    ],
  })
}

function server(): { calls: PatchOp[][]; api: Partial<ApiClient> } {
  const calls: PatchOp[][] = []
  let seq = HEAD_SEQ
  let held = doc()
  const patchOps: ApiClient['patchOps'] = async (_projectId, _pageId, body) => {
    calls.push(body.ops)
    const { applyOps, invertOps } = await import('@wirebound/schema')
    const inverse = invertOps(held, body.ops)
    held = applyOps(held, body.ops)
    seq += 1
    const result: PatchResult = {
      seq,
      revisionId: `rev-${seq}`,
      inverse,
      schemaVersion: 1,
      ...(body.clientOpId === undefined ? {} : { clientOpId: body.clientOpId }),
    }
    return result
  }
  return { calls, api: { patchOps } }
}

function structureRegion(): HTMLElement {
  return screen.getByRole('region', { name: '구조 트리' })
}

/** 구조 트리에서 타입 이름의 줄 상자. */
function row(type: string): HTMLElement {
  const button = within(structureRegion()).getByRole('button', { name: structureRowName(type) })
  const box = button.closest<HTMLElement>('[data-tree-row]')
  if (box === null) throw new Error(`${type} 줄 상자가 없다`)
  return box
}

function itemsOf(box: HTMLElement, which: '+' | '…'): string[] {
  const toggle = rowToggle(box, which)
  if (toggle === null) throw new Error(`${which} 가 없다`)
  if (toggle.getAttribute('aria-expanded') !== 'true') fireEvent.click(toggle)
  const list = document.getElementById(toggle.getAttribute('aria-controls') ?? '')
  if (list === null) throw new Error('목록이 없다')
  return within(list)
    .getAllByRole('menuitem')
    .map((item) => item.textContent ?? '')
}

/** 걷은 넣기 입구의 이름 — 하단 판(컴포넌트 · 모듈 탭)이 넣기를 한다(설계 spec 「B1」). */
const REMOVED_ENTRANCES = ['안에 추가', '아래 추가', '페이지에 추가', '패턴 넣기', '프리셋']

/** 구조 트리 영역의 행동 메뉴 단추를 전부 열어 항목 이름을 모은다(닫고 나온다). */
function allTreeItems(): string[] {
  const names: string[] = []
  for (const toggle of structureRegion().querySelectorAll<HTMLButtonElement>('[aria-haspopup="menu"]')) {
    if (toggle.getAttribute('aria-expanded') !== 'true') fireEvent.click(toggle)
    const list = document.getElementById(toggle.getAttribute('aria-controls') ?? '')
    if (list === null) throw new Error('목록이 없다')
    names.push(
      ...within(list)
        .getAllByRole('menuitem')
        .map((item) => item.textContent ?? ''),
    )
    fireEvent.click(toggle)
  }
  return names
}

describe('줄 행동의 항목 — spec 「트리」 표', () => {
  it('노드 줄: `+` 없음, `…` 별칭 바꾸기 · 모듈로 저장… · 위로 · 아래로 · 들여쓰기 · 내어쓰기 · 삭제', async () => {
    await openPage(doc(), { apiOverrides: server().api })

    expect(rowToggle(row('Card'), '+')).toBeNull()
    expect(itemsOf(row('Card'), '…')).toEqual(['별칭 바꾸기', '모듈로 저장…', '위로', '아래로', '들여쓰기', '내어쓰기', '삭제'])
  })

  it('뿌리 줄: `+` 없음, `…` 에 «모듈로 저장…» 없음 · 제목 줄에 뿌리 `+` 가 없다', async () => {
    await openPage(doc(), { apiOverrides: server().api })

    expect(rowToggle(row('Page'), '+')).toBeNull()
    expect(itemsOf(row('Page'), '…')).toEqual(['별칭 바꾸기', '위로', '아래로', '들여쓰기', '내어쓰기', '삭제'])
    expect(structureRegion().querySelector('.wb-shell-region-head [aria-haspopup="menu"]')).toBeNull()
  })

  it('트리 어디에도 걷은 넣기 입구가 없다 — 줄마다 메뉴를 열어 접근 이름으로 센다', async () => {
    await openPage(doc(), { apiOverrides: server().api })

    const names = allTreeItems()
    // 카나리아 — 줄 여섯(뿌리 + 다섯)의 `…` 가 다 열렸다(줄마다 «삭제» 하나).
    expect(names.filter((name) => name === '삭제')).toHaveLength(6)
    expect(names.filter((name) => REMOVED_ENTRANCES.includes(name))).toEqual([])
    for (const name of REMOVED_ENTRANCES) expect(within(structureRegion()).queryAllByRole('button', { name })).toEqual([])
  })
})

describe('줄 행동을 열면 그 줄이 먼저 골라진다', () => {
  it('다른 줄의 `…`를 열면 그 줄이 골라지고 항목은 그 줄의 판정이다', async () => {
    await openPage(doc(), { apiOverrides: server().api })
    // 루트가 골라져 시작한다 — 루트의 `위로`는 꺼져 있다.
    expect(isOff(rowAction(structureRegion(), '위로'))).toBe(true)

    const item = rowAction(structureRegion(), '위로', row('Divider'))

    expect(pickedRow(structureRegion())).toBe(row('Divider'))
    expect(isOff(item)).toBe(false)
  })
})

/** 구조 줄마다 문서 차례로 20px 자리를 준다(`./menu-row-actions.test.tsx`의 `layRows`와 같은 꼴). */
function layRows(): string[] {
  const rows = () => [...structureRegion().querySelectorAll<HTMLElement>('[data-tree-row]')]
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const at = rows().indexOf(this)
    if (at === -1) return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) }
    const top = at * 20
    return { left: 0, top, right: 200, bottom: top + 20, width: 200, height: 20, x: 0, y: top, toJSON: () => ({}) }
  })
  return rows().map((box) => structureRowType(box.querySelector('.wb-shell-structure-node')) ?? '')
}

function drag(titles: string[], from: string, to: string, zone: 'top' | 'middle' | 'bottom'): void {
  const handle = row(from).querySelector<HTMLElement>('.wb-shell-structure-node')!
  const start = titles.indexOf(from) * 20 + 10
  fireEvent.pointerDown(handle, { button: 0, clientX: 50, clientY: start, pointerId: 1 })
  fireEvent.pointerMove(window, { clientX: 50, clientY: start + 8, pointerId: 1 })
  const y = titles.indexOf(to) * 20 + (zone === 'top' ? 2 : zone === 'middle' ? 10 : 18)
  fireEvent.pointerMove(window, { clientX: 50, clientY: y, pointerId: 1 })
  fireEvent.pointerUp(window, { clientX: 50, clientY: y, pointerId: 1 })
}

describe('끌어 놓기 — 내는 편집(jsdom · 가짜 자리)', () => {
  it('줄 차례가 트리 차례다 — 가짜 자리의 전제', async () => {
    await openPage(doc(), { apiOverrides: server().api })
    expect(layRows()).toEqual(['Page', 'Text', 'Card', 'Button', 'Link', 'Divider'])
  })

  it('노드를 다른 컨테이너 안으로 → move 편집 하나 · 트리가 그렇게 선다', async () => {
    const srv = server()
    await openPage(doc(), { apiOverrides: srv.api })
    const titles = layRows()

    drag(titles, 'Divider', 'Card', 'middle')

    await waitFor(() => expect(srv.calls).toHaveLength(1))
    expect(srv.calls[0]).toEqual([{ op: 'move', from: '/root/children/2', path: '/root/children/1/children/2' }])
    expect(structureTypes()).toEqual(['Page', 'Text', 'Card', 'Button', 'Link', 'Divider'])
    expect(row('Divider').parentElement!.parentElement!.closest('li')).toBe(row('Card').parentElement)
  })

  it('형제 앞 · 뒤 — 같은 부모 안 뒤로 옮기면 옮긴 뒤 차례', async () => {
    const srv = server()
    await openPage(doc(), { apiOverrides: srv.api })
    const titles = layRows()

    // Text 를 Divider 뒤로 → [Card Divider Text].
    drag(titles, 'Text', 'Divider', 'bottom')

    await waitFor(() => expect(srv.calls).toHaveLength(1))
    expect(srv.calls[0]).toEqual([{ op: 'move', from: '/root/children/0', path: '/root/children/2' }])
  })

  it('자식을 안 받는 컴포넌트 위 · 자기 자손 위 · 뿌리는 → 편집이 없다', async () => {
    const srv = server()
    await openPage(doc(), { apiOverrides: srv.api })
    const titles = layRows()

    drag(titles, 'Text', 'Divider', 'middle') // Divider 는 반으로 갈라 middle(10) 은 «뒤» — 안이 아니다
    await waitFor(() => expect(srv.calls).toHaveLength(1))
    srv.calls.length = 0
    const again = layRows()
    drag(again, 'Card', 'Button', 'middle') // 자기 자손
    drag(again, 'Page', 'Card', 'middle') // 뿌리는 안 끌린다
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(srv.calls).toEqual([])
  })
})
