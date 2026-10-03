/**
 * 셸에 붙은 에디터 단축키(`shell/editor-keys.tsx`) — `<App />` 을 라우트째 띄우고 키를 호스트 · 캔버스 문서에서 올린다.
 *
 * **되돌리기는 머리 단추와 같은 길이다** — 단추로 되돌린 판과 키로 되돌린 판이 같은 요청 · 같은 화면 · 같은 단추 상태를 내는지 견준다.
 * jsdom 의 플랫폼은 mac 이 아니라(`navigator.platform` 이 비고 `userAgent` 에 `Mac` 이 없다) 명령 키는 Ctrl 이다 — 첫 케이스가 그 전제를 잰다.
 */
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { PatchOp } from '@wirebound/schema'
import type { ApiClient } from '../../src/api/client'
import type { PageDetail, PatchResult } from '../../src/api/types'
import { CLIPBOARD_SHORTCUT_LINES, EDITOR_SHORTCUTS, platformOf } from '../../src/edit/editor-shortcuts'
import { HEAD_SEQ, canvasDocument, openPage, pageDetail, pageDoc, structureTypes } from '../editor-harness'
import '../../src/catalog-setup'

/**
 * ```
 * n-root (Page)
 * ├ n-a   (Text)
 * ├ n-box (Card)
 * │  └ n-1 (Button)
 * └ n-c   (Divider)
 * ```
 */
function doc(): ReturnType<typeof pageDoc> {
  return pageDoc({
    id: 'n-root',
    type: 'Page',
    children: [
      { id: 'n-a', type: 'Text', props: { content: '지울 글자' } },
      { id: 'n-box', type: 'Card', children: [{ id: 'n-1', type: 'Button' }] },
      { id: 'n-c', type: 'Divider' },
    ],
  })
}

const INITIAL_TYPES = ['Page', 'Text', 'Card', 'Button', 'Divider']

function server(initial: ReturnType<typeof pageDoc> = doc()) {
  const calls: PatchOp[][] = []
  let seq = HEAD_SEQ
  let held = initial
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
  const getPage: ApiClient['getPage'] = async (_projectId, pageId) => {
    const detail: PageDetail = { ...pageDetail(pageId, held), headSeq: seq }
    return detail
  }
  return { calls, api: { patchOps, getPage } satisfies Partial<ApiClient> }
}

function structureRegion(): HTMLElement {
  return screen.getByRole('region', { name: '구조 트리' })
}

function row(type: string): HTMLElement {
  return within(structureRegion()).getByRole('button', { name: type })
}

/** 지금 고른 줄의 타입. 없으면 `null`. */
function selectedType(): string | null {
  return structureRegion().querySelector('[aria-current="true"]')?.textContent ?? null
}

function historyButton(name: '되돌리기' | '다시 실행'): HTMLButtonElement {
  return within(screen.getByRole('group', { name: '편집 이력' })).getByRole<HTMLButtonElement>('button', { name })
}

function ctrl(key: string, init: KeyboardEventInit = {}): KeyboardEventInit {
  return { key, code: `Key${key.toUpperCase()}`, ctrlKey: true, ...init }
}

/** 화면의 비교 값 — 보낸 요청 · 구조 트리 · 두 단추. */
function snapshot(calls: PatchOp[][]) {
  return {
    calls: structuredClone(calls),
    types: structureTypes(),
    canUndo: !historyButton('되돌리기').disabled,
    canRedo: !historyButton('다시 실행').disabled,
  }
}

describe('에디터 단축키 — 셸', () => {
  it('jsdom 의 플랫폼은 mac 이 아니다 — 명령 키는 Ctrl', () => {
    expect(platformOf(navigator)).toBe('other')
  })

  it('Ctrl+Z 는 머리의 «되돌리기» 단추와 같은 요청 · 같은 화면 · 같은 단추 상태를 낸다', async () => {
    const results = []
    for (const via of ['button', 'key'] as const) {
      const srv = server()
      await openPage(doc(), { apiOverrides: srv.api })
      fireEvent.click(row('Card'))
      fireEvent.keyDown(row('Card'), { key: 'ArrowUp', altKey: true })
      await waitFor(() => expect(srv.calls).toHaveLength(1))
      await waitFor(() => expect(historyButton('되돌리기').disabled).toBe(false))

      if (via === 'button') fireEvent.click(historyButton('되돌리기'))
      else fireEvent.keyDown(document.body, ctrl('z'))
      await waitFor(() => expect(srv.calls).toHaveLength(2))
      await waitFor(() => expect(historyButton('다시 실행').disabled).toBe(false))
      results.push(snapshot(srv.calls))
      cleanup()
    }
    expect(results[1]).toEqual(results[0])
    expect(results[0]!.types).toEqual(INITIAL_TYPES)
  })

  it('Ctrl+Shift+Z · Ctrl+Y 는 «다시 실행» 단추와 같다', async () => {
    const results = []
    for (const via of ['button', 'shift-z', 'y'] as const) {
      const srv = server()
      await openPage(doc(), { apiOverrides: srv.api })
      fireEvent.click(row('Card'))
      fireEvent.keyDown(row('Card'), { key: 'ArrowUp', altKey: true })
      await waitFor(() => expect(srv.calls).toHaveLength(1))
      await waitFor(() => expect(historyButton('되돌리기').disabled).toBe(false))
      fireEvent.click(historyButton('되돌리기'))
      await waitFor(() => expect(historyButton('다시 실행').disabled).toBe(false))

      if (via === 'button') fireEvent.click(historyButton('다시 실행'))
      else if (via === 'shift-z') fireEvent.keyDown(document.body, ctrl('Z', { shiftKey: true }))
      else fireEvent.keyDown(document.body, ctrl('y'))
      await waitFor(() => expect(srv.calls).toHaveLength(3))
      await waitFor(() => expect(historyButton('되돌리기').disabled).toBe(false))
      results.push(snapshot(srv.calls))
      cleanup()
    }
    expect(results[1]).toEqual(results[0])
    expect(results[2]).toEqual(results[0])
  })

  it('캔버스 문서에 포커스가 있어도 Delete · Ctrl+Z · 화살표가 선다', async () => {
    const srv = server()
    await openPage(doc(), { apiOverrides: srv.api })
    fireEvent.click(row('Card'))
    const canvas = canvasDocument()

    fireEvent.keyDown(canvas.body, { key: 'ArrowDown' })
    expect(selectedType()).toBe('Button')
    fireEvent.keyDown(canvas.body, { key: 'ArrowLeft' })
    expect(selectedType()).toBe('Card')

    fireEvent.keyDown(canvas.body, { key: 'Delete' })
    await waitFor(() => expect(srv.calls).toEqual([[{ op: 'remove', path: '/root/children/1' }]]))
    await waitFor(() => expect(historyButton('되돌리기').disabled).toBe(false))

    fireEvent.keyDown(canvas.body, ctrl('z'))
    await waitFor(() => expect(srv.calls).toHaveLength(2))
    await waitFor(() => expect(structureTypes()).toEqual(INITIAL_TYPES))
  })

  it('↑ ↓ ← → 가 구조 트리의 줄 차례로 고른다', async () => {
    await openPage(doc(), { apiOverrides: server().api })
    fireEvent.click(row('Text'))

    fireEvent.keyDown(document.body, { key: 'ArrowDown' })
    expect(selectedType()).toBe('Card')
    fireEvent.keyDown(document.body, { key: 'ArrowRight' })
    expect(selectedType()).toBe('Button')
    fireEvent.keyDown(document.body, { key: 'ArrowDown' })
    expect(selectedType()).toBe('Divider')
    fireEvent.keyDown(document.body, { key: 'ArrowUp' })
    expect(selectedType()).toBe('Button')
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' })
    expect(selectedType()).toBe('Card')
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' })
    expect(selectedType()).toBe('Page')
  })

  it('Escape 가 선택을 푼다 — 열린 행동 메뉴가 있으면 메뉴만 닫는다', async () => {
    await openPage(doc(), { apiOverrides: server().api })
    fireEvent.click(row('Card'))
    fireEvent.click(within(structureRegion()).getByRole('button', { name: 'Card 더 보기' }))
    const menu = screen.getByRole('menu')

    fireEvent.keyDown(within(menu).getAllByRole('menuitem')[0]!, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(selectedType()).toBe('Card')

    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(selectedType()).toBeNull()
  })

  it('뷰 모드에서는 편집 단축키가 안 선다', async () => {
    const srv = server()
    await openPage(doc(), { apiOverrides: srv.api })
    fireEvent.click(row('Card'))
    fireEvent.keyDown(row('Card'), { key: 'ArrowUp', altKey: true })
    await waitFor(() => expect(srv.calls).toHaveLength(1))

    fireEvent.click(screen.getByRole('button', { name: '뷰 모드' }))
    fireEvent.keyDown(document.body, ctrl('z'))
    fireEvent.keyDown(document.body, { key: 'Delete' })
    fireEvent.keyDown(document.body, { key: 'ArrowDown', altKey: true })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(srv.calls).toHaveLength(1)
  })

  it('속성 패널의 글 칸에서 친 Ctrl+Z · Backspace 는 그 칸의 것이다 — 노드 편집 0', async () => {
    const srv = server()
    await openPage(doc(), { apiOverrides: srv.api })
    fireEvent.click(row('Card'))
    fireEvent.keyDown(row('Card'), { key: 'ArrowUp', altKey: true })
    await waitFor(() => expect(srv.calls).toHaveLength(1))
    await waitFor(() => expect(historyButton('되돌리기').disabled).toBe(false))

    fireEvent.click(row('Text'))
    const field = within(screen.getByRole('complementary', { name: '우측 패널' })).getByLabelText('내용')
    fireEvent.keyDown(field, ctrl('z'))
    fireEvent.keyDown(field, { key: 'Backspace' })
    fireEvent.keyDown(field, { key: 'ArrowUp' })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(srv.calls).toHaveLength(1)
    expect(selectedType()).toBe('Text')
  })

  it('메뉴 트리 상자의 Delete 는 고른 노드를 지우지 않는다', async () => {
    const srv = server()
    await openPage(doc(), { apiOverrides: srv.api })
    fireEvent.click(row('Card'))
    const menuTree = screen.getByRole('region', { name: '메뉴·페이지 트리' })
    const link = within(menuTree).getByRole('link', { name: '회원 목록' })

    fireEvent.keyDown(link, { key: 'Delete' })
    fireEvent.keyDown(link, { key: 'ArrowDown' })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(srv.calls).toHaveLength(0)
    expect(structureTypes()).toEqual(INITIAL_TYPES)
    expect(selectedType()).toBe('Card')
  })

  it('? 가 단축키 목록을 연다 — 표 · 클립보드 세 줄 · 구조 트리 줄, 열린 동안 Delete 는 안 서고 Escape 로 닫힌다', async () => {
    const srv = server()
    await openPage(doc(), { apiOverrides: srv.api })
    fireEvent.click(row('Card'))

    fireEvent.keyDown(document.body, { key: '?', code: 'Slash', shiftKey: true })
    const dialog = screen.getByRole('dialog', { name: '단축키' })
    const rows = within(dialog)
      .getAllByRole('row')
      .map((line) => [...line.children].map((cell) => cell.textContent))
    expect(rows).toEqual([
      ...EDITOR_SHORTCUTS.map((shortcut) => [shortcut.keys('other'), shortcut.label]),
      ...CLIPBOARD_SHORTCUT_LINES.map((line) => [line.keys('other'), line.label]),
      ['Alt+Shift+I', '패턴 넣기'],
      ['Alt+Shift+P', '프리셋'],
    ])
    expect(rows[0]).toEqual(['Ctrl+Z', '되돌리기'])

    fireEvent.keyDown(within(dialog).getByRole('button', { name: '닫기' }), { key: 'Delete' })
    fireEvent.keyDown(document.body, { key: 'Delete' })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(srv.calls).toHaveLength(0)

    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: '단축키' })).toBeNull()
    expect(selectedType()).toBe('Card')
  })
})
