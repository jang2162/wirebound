/**
 * **구조 트리의 줄 행동 · 뿌리 `+` · 끌어 놓기**(`src/panels/structure-tree.tsx` · `src/panels/tree-row-actions.tsx` ·
 * `src/edit/structure-drop.ts`) — jsdom 판. 옛 툴바 케이스를 줄 행동으로 옮긴 판은 `./structure-toolbar.test.tsx` 등이 갖고, 여기는
 * 줄 행동에서 새로 생긴 성질을 잰다: 항목의 차례 · 여는 줄이 먼저 골라진다 · 고르개가 그 줄 아래 선다 · 뿌리 `+` · 끌어 놓기가 내는 편집.
 *
 * 끌기는 줄 상자에 가짜 자리를 준다(`./menu-row-actions.test.tsx`와 같은 꼴). 잠금이 걸린 끌기는 `../lock/toolbar-abilities.test.tsx`,
 * 실브라우저 판은 `build-test/tree-drag.test.ts`가 잰다.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { PatchOp } from '@wirebound/schema'
import type { ApiClient } from '../../src/api/client'
import type { PatchResult } from '../../src/api/types'
import { deselect, HEAD_SEQ, openPage, pageDoc, structureTypes } from '../editor-harness'
import { installPointerEvents } from '../pointer-events'
import '../../src/catalog-setup'
import { isOff, pickedRow, rootAction, rowAction, rowToggle, structureRowName, structureRowType } from './tree-row'

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

describe('줄 행동의 항목 — spec 「트리」 표', () => {
  it('노드 줄: `+` 안에 추가 · 아래 추가 · 패턴 넣기, `…` 별칭 바꾸기 · 위로 · 아래로 · 들여쓰기 · 내어쓰기 · 상태별로 나누기 · 삭제', async () => {
    await openPage(doc(), { apiOverrides: server().api })

    expect(itemsOf(row('Card'), '+')).toEqual(['안에 추가', '아래 추가', '패턴 넣기'])
    expect(itemsOf(row('Card'), '…')).toEqual(['별칭 바꾸기', '위로', '아래로', '들여쓰기', '내어쓰기', '상태별로 나누기', '삭제'])
  })

  it('뿌리 `+`(제목 줄): 페이지에 추가 · 패턴 넣기 · 프리셋', async () => {
    await openPage(doc(), { apiOverrides: server().api })
    const toggle = within(structureRegion()).getByRole('button', { name: '구조 트리에 추가' })
    expect(toggle.closest('.wb-shell-region-head')).not.toBeNull()

    fireEvent.click(toggle)
    const list = document.getElementById(toggle.getAttribute('aria-controls') ?? '')!
    expect(within(list).getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      '페이지에 추가',
      '패턴 넣기',
      '프리셋',
    ])
  })
})

describe('줄 행동을 열면 그 줄이 먼저 골라진다 · 고르개는 그 줄 아래', () => {
  it('다른 줄의 `…`를 열면 그 줄이 골라지고 항목은 그 줄의 판정이다', async () => {
    await openPage(doc(), { apiOverrides: server().api })
    // 루트가 골라져 시작한다 — 루트의 `위로`는 꺼져 있다.
    expect(isOff(rowAction(structureRegion(), '위로'))).toBe(true)

    const item = rowAction(structureRegion(), '위로', row('Divider'))

    expect(pickedRow(structureRegion())).toBe(row('Divider'))
    expect(isOff(item)).toBe(false)
  })

  it('`안에 추가` → 타입 고르개가 그 줄(li) 바로 아래 선다 · 고르면 그 안 끝에 들어간다', async () => {
    const srv = server()
    await openPage(doc(), { apiOverrides: srv.api })

    fireEvent.click(rowAction(structureRegion(), '안에 추가', row('Card')))
    const picker = within(structureRegion()).getByRole('group', { name: '타입 고르기' })
    // 고르개는 Card 줄의 항목(li) 안 · 자식 목록 앞이다.
    const item = row('Card').parentElement!
    expect(item.contains(picker)).toBe(true)
    expect(picker.compareDocumentPosition(within(item).getByRole('button', { name: structureRowName('Button') })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    fireEvent.click(within(picker).getByRole('button', { name: '추가' }))

    await waitFor(() => expect(srv.calls).toHaveLength(1))
    expect(srv.calls[0]?.[0]).toMatchObject({ op: 'add', path: '/root/children/1/children/2' })
  })

  it('뿌리 `+`의 «페이지에 추가» → 뿌리를 골라 그 아래 고르개 → 뿌리 끝에 들어간다', async () => {
    const srv = server()
    await openPage(doc(), { apiOverrides: srv.api })
    fireEvent.click(row('Card').querySelector('button')!)

    fireEvent.click(rootAction(structureRegion(), '페이지에 추가'))

    expect(pickedRow(structureRegion())).toBe(row('Page'))
    const picker = within(structureRegion()).getByRole('group', { name: '타입 고르기' })
    expect(row('Page').parentElement!.contains(picker)).toBe(true)
    fireEvent.click(within(picker).getByRole('button', { name: '추가' }))

    await waitFor(() => expect(srv.calls).toHaveLength(1))
    expect(srv.calls[0]?.[0]).toMatchObject({ op: 'add', path: '/root/children/3' })
  })

  it('고른 것이 없으면 패턴 · 프리셋 고르개는 뿌리 줄 아래 선다', async () => {
    await openPage(doc(), { apiOverrides: server().api })
    deselect()

    fireEvent.click(rootAction(structureRegion(), '프리셋'))

    const picker = await within(structureRegion()).findByRole('group', { name: '프리셋 고르기' })
    expect(row('Page').parentElement!.contains(picker)).toBe(true)
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
