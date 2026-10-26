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
import { actionTarget, CURRENT_DOCUMENT_VERSION, readNodesEnvelope, writeNodesEnvelope, type WbNode } from '@wirebound/schema'
import { CLIPBOARD_SHORTCUT_LINES, EDITOR_SHORTCUTS, platformOf } from '../../src/edit/editor-shortcuts'
import { droppedActionsNotice } from '../../src/edit/paste-ops'
import { PASTE_REJECTED_HEAD } from '../../src/shell/editor-keys'
import { HEAD_SEQ, canvasDocument, openPage, pageDetail, pageDoc, structureTypes } from '../editor-harness'
import '../../src/catalog-setup'
import { structureRowName, structureRowType } from '../panels/tree-row'

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
  return within(structureRegion()).getByRole('button', { name: structureRowName(type) })
}

/** 지금 고른 줄의 타입. 없으면 `null`. */
function selectedType(): string | null {
  return structureRowType(structureRegion().querySelector('.wb-shell-structure-node[aria-current="true"]'))
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

  it('↑ ↓ ← → 가 구조 트리의 줄 차례로 고른다 — 자식 줄이 있는 줄의 ← 는 먼저 접고 → 는 먼저 편다', async () => {
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
    // 편 Card 의 ← 는 접는다 — 고른 것은 그대로, 안의 줄이 숨는다(`src/edit/selection-move.ts` 의 `foldStep`).
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' })
    expect(selectedType()).toBe('Card')
    expect(structureTypes()).toEqual(['Page', 'Text', 'Card', 'Divider'])
    // 접힌 줄의 ↓ 는 그 안을 건너뛴다.
    fireEvent.keyDown(document.body, { key: 'ArrowDown' })
    expect(selectedType()).toBe('Divider')
    fireEvent.keyDown(document.body, { key: 'ArrowUp' })
    expect(selectedType()).toBe('Card')
    // 접힌 Card 의 → 는 편다 · 다시 → 는 첫 자식.
    fireEvent.keyDown(document.body, { key: 'ArrowRight' })
    expect(selectedType()).toBe('Card')
    expect(structureTypes()).toEqual(INITIAL_TYPES)
    fireEvent.keyDown(document.body, { key: 'ArrowRight' })
    expect(selectedType()).toBe('Button')
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' })
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' })
    // 접힌 Card 의 ← 는 부모로.
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' })
    expect(selectedType()).toBe('Page')
  })

  it('Escape 가 선택을 푼다 — 포커스가 열린 행동 메뉴 안이면 메뉴만 닫는다', async () => {
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

  it('? 가 단축키 목록을 연다 — 표 · 클립보드 세 줄, 열린 동안 Delete 는 안 서고 Escape 로 닫힌다', async () => {
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
    ])
    expect(rows[0]).toEqual(['Ctrl+Z', '되돌리기'])
    // 구조 트리의 넣기 단축키(Alt+Shift+I · P)는 걷었다 — 도움말에도 없다.
    expect(rows.filter(([keys]) => keys === 'Alt+Shift+I' || keys === 'Alt+Shift+P')).toEqual([])

    fireEvent.keyDown(within(dialog).getByRole('button', { name: '닫기' }), { key: 'Delete' })
    fireEvent.keyDown(document.body, { key: 'Delete' })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(srv.calls).toHaveLength(0)

    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: '단축키' })).toBeNull()
    expect(selectedType()).toBe('Card')
  })

  // 옛 구조 트리의 고르개 단축키(Alt+Shift+I «패턴 넣기» · Alt+Shift+P «프리셋»)는 걷었다 — 줄에서 쳐도 편집 · 상자 · 키 가로채기가 없다.
  it('Alt+Shift+I · Alt+Shift+P 는 아무것도 안 한다 — 편집 0 · 상자 0 · 키를 안 가로챈다', async () => {
    const srv = server()
    await openPage(doc(), { apiOverrides: srv.api })
    fireEvent.click(row('Card'))

    const prevented = [
      { code: 'KeyI', key: 'I' },
      { code: 'KeyP', key: 'P' },
    ].map((key) => !fireEvent.keyDown(row('Card'), { ...key, altKey: true, shiftKey: true }))
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(prevented).toEqual([false, false])
    expect(screen.queryAllByRole('dialog')).toEqual([])
    expect(srv.calls).toHaveLength(0)
    expect(structureTypes()).toEqual(INITIAL_TYPES)
    expect(selectedType()).toBe('Card')
  })
})

/** 클립보드 이벤트를 올린다 — jsdom 에는 `clipboardData` 가 없어 가짜를 싣는다(`./use-clipboard.test.tsx` 머리말). */
function clip(type: 'copy' | 'cut' | 'paste', target: EventTarget, text?: string): { written: string | undefined; prevented: boolean } {
  const data = new Map<string, string>()
  if (text !== undefined) data.set('text/plain', text)
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clipboardData', {
    value: { setData: (kind: string, value: string) => data.set(kind, value), getData: (kind: string) => data.get(kind) ?? '' },
  })
  target.dispatchEvent(event)
  return { written: data.get('text/plain'), prevented: event.defaultPrevented }
}

function alertTexts(): string[] {
  return screen.queryAllByRole('alert').map((element) => element.textContent ?? '')
}

/** 정보 통지 한 칸(`shell/info-notice.tsx` — `role="status"`)의 글. 실패 자리(`alert`)와 갈라 읽는다. */
function infoTexts(): string[] {
  return screen
    .queryAllByRole('status')
    .filter((element) => element.classList.contains('wb-shell-info-notice'))
    .map((element) => element.textContent ?? '')
}

/** 서버에 닿은 편집을 적용한 문서의 뿌리 자식 타입들 — 화면이 아니라 서버 문서로 본다. */
async function undoOnceRestores(srv: ReturnType<typeof server>, before: number): Promise<void> {
  await waitFor(() => expect(historyButton('되돌리기').disabled).toBe(false))
  fireEvent.keyDown(document.body, ctrl('z'))
  await waitFor(() => expect(srv.calls).toHaveLength(before + 1))
  await waitFor(() => expect(structureTypes()).toEqual(INITIAL_TYPES))
}

describe('클립보드 · 복제 — 셸', () => {
  it('복사가 고른 노드의 서브트리를 봉투로 싣는다 — 루트를 고른 판은 브라우저 복사가 그대로다', async () => {
    await openPage(doc(), { apiOverrides: server().api })
    fireEvent.click(row('Card'))
    const copied = clip('copy', document.body)
    expect(copied.prevented).toBe(true)
    expect(readNodesEnvelope(copied.written!)).toEqual({
      nodes: [{ id: 'n-box', type: 'Card', children: [{ id: 'n-1', type: 'Button' }] }],
    })

    fireEvent.click(row('Page'))
    expect(clip('copy', document.body)).toEqual({ written: undefined, prevented: false })
  })

  it('붙이기가 편집 하나를 내고(새 id · 기준 노드 바로 뒤) 붙인 노드를 고른다 — Ctrl+Z 한 번에 통째로 돌아온다', async () => {
    const srv = server()
    await openPage(doc(), { apiOverrides: srv.api })
    fireEvent.click(row('Card'))
    const envelope = clip('copy', document.body).written!
    fireEvent.click(row('Text'))

    expect(clip('paste', document.body, envelope).prevented).toBe(true)
    await waitFor(() => expect(srv.calls).toHaveLength(1))
    const [op] = srv.calls[0]!
    expect(op).toMatchObject({ op: 'add', path: '/root/children/1' })
    const pasted = (op as { value: WbNode }).value
    expect(pasted.type).toBe('Card')
    expect(pasted.id).not.toBe('n-box')
    expect(pasted.children![0]!.id).not.toBe('n-1')
    expect(structureTypes()).toEqual(['Page', 'Text', 'Card', 'Button', 'Card', 'Button', 'Divider'])
    expect(structureRegion().querySelectorAll('[aria-current="true"]')).toHaveLength(1)
    expect(
      within(structureRegion())
        .getAllByRole('button', { name: structureRowName('Card') })[0]!
        .getAttribute('aria-current'),
    ).toBe('true')

    await undoOnceRestores(srv, 1)
  })

  it('봉투가 아닌 글은 아무것도 안 한다 — 편집 0 · 통지 0', async () => {
    const srv = server()
    await openPage(doc(), { apiOverrides: srv.api })
    fireEvent.click(row('Card'))
    for (const text of ['그냥 글', '{"a":1}', JSON.stringify({ wirebound: 'page', version: 1, nodes: [] })]) {
      expect(clip('paste', document.body, text).prevented).toBe(false)
    }
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(srv.calls).toHaveLength(0)
    expect([...alertTexts(), ...infoTexts()]).toEqual([])
  })

  /**
   * L-048 — 우리 봉투(`wirebound: "nodes"`)인데 이 판에 못 싣는 것(없는 타입 · 중복 id · 지금보다 높은 버전)은 «봉투 아님» 처럼 말없이 안 붙지
   * 않고 정보 통지가 까닭을 말한다. 브라우저의 붙여넣기는 막는다(`prevented`) — 같은 글이 캔버스에 글로 붙는 일은 없다.
   */
  it('검증을 못 지나는 봉투는 안 붙이고 까닭을 정보 통지로 말한다', async () => {
    const srv = server()
    await openPage(doc(), { apiOverrides: srv.api })
    fireEvent.click(row('Card'))
    const unknown = writeNodesEnvelope([{ id: 'x', type: 'NoSuchType' }] as WbNode[], CURRENT_DOCUMENT_VERSION)
    expect(clip('paste', document.body, unknown).prevented).toBe(true)
    await waitFor(() => expect(infoTexts()).toEqual([`${PASTE_REJECTED_HEAD} 알 수 없는 컴포넌트 타입: NoSuchType`]))
    expect(alertTexts()).toEqual([])
    // 같은 종류의 정보 통지는 쌓지 않고 바꿔 끼운다.
    expect(
      clip(
        'paste',
        document.body,
        writeNodesEnvelope(
          [
            { id: 'y', type: 'Text' },
            { id: 'y', type: 'Text' },
          ] as WbNode[],
          CURRENT_DOCUMENT_VERSION,
        ),
      ).prevented,
    ).toBe(true)
    await waitFor(() => expect(infoTexts()).toHaveLength(1))
    expect(infoTexts()[0]).not.toContain('NoSuchType')
    expect(srv.calls).toHaveLength(0)
  })

  /** L-047 — 붙이기는 성공했다. 뺀 동작 수는 `alert` 가 아니라 정보 통지다 · 다음 편집이 치운다. */
  it('붙이며 뺀 동작 수는 실패 자리가 아니라 정보 통지가 말하고 다음 편집이 치운다', async () => {
    const srv = server()
    await openPage(doc(), { apiOverrides: srv.api })
    fireEvent.click(row('Divider'))
    const button: WbNode = {
      id: 'src-btn',
      type: 'Button',
      interactions: [{ on: 'click', actions: [{ type: 'setVisible', target: 'n-elsewhere', value: true }] }],
    }
    clip('paste', document.body, writeNodesEnvelope([button], CURRENT_DOCUMENT_VERSION))
    await waitFor(() => expect(infoTexts()).toEqual([droppedActionsNotice(1)]))
    expect(alertTexts()).toEqual([])

    fireEvent.keyDown(document.body, ctrl('d'))
    await waitFor(() => expect(srv.calls).toHaveLength(2))
    expect(infoTexts()).toEqual([])
  })

  it('대상이 없는 동작은 빼고 붙이고 그 수를 말한다 — 지금 문서의 노드 · 프로젝트의 페이지를 가리키면 남긴다', async () => {
    const srv = server()
    await openPage(doc(), { apiOverrides: srv.api })
    fireEvent.click(row('Divider'))
    const button: WbNode = {
      id: 'src-btn',
      type: 'Button',
      interactions: [
        {
          on: 'click',
          actions: [
            { type: 'setVisible', target: 'n-box', value: false }, // 지금 문서에 있다
            { type: 'setVisible', target: 'n-elsewhere', value: true }, // 없다
            { type: 'navigate', target: 'page:회원관리/회원 상세' }, // 지금 프로젝트에 있다
            { type: 'openModal', target: 'page:남의 프로젝트/설정' }, // 없다
          ],
        },
      ],
    }
    clip('paste', document.body, writeNodesEnvelope([button], CURRENT_DOCUMENT_VERSION))

    await waitFor(() => expect(srv.calls).toHaveLength(1))
    const pasted = (srv.calls[0]![0] as { value: WbNode }).value
    expect(pasted.interactions![0]!.actions.map(actionTarget)).toEqual(['n-box', 'page:회원관리/회원 상세'])
    await waitFor(() => expect(infoTexts()).toEqual([droppedActionsNotice(2)]))
  })

  it('잘라내기 = 봉투 + 지우기 편집 하나 — Ctrl+Z 한 번에 돌아온다', async () => {
    const srv = server()
    await openPage(doc(), { apiOverrides: srv.api })
    fireEvent.click(row('Card'))

    const cut = clip('cut', document.body)
    expect(cut.prevented).toBe(true)
    expect(readNodesEnvelope(cut.written!)?.nodes[0]?.id).toBe('n-box')
    await waitFor(() => expect(srv.calls).toEqual([[{ op: 'remove', path: '/root/children/1' }]]))
    expect(structureTypes()).toEqual(['Page', 'Text', 'Divider'])
    // 키보드 삭제처럼 선택을 비운다 — 부모를 고르면 이어 친 Ctrl+X 가 형제를 든 그 부모를 잘라 낸다(`shell/editor-keys.tsx` 의 `cut`).
    expect(structureRegion().querySelectorAll('[aria-current="true"]')).toHaveLength(0)

    await undoOnceRestores(srv, 1)
  })

  /**
   * **복제 사본은 원본의 상태 보임을 그대로 든다** — 같은 페이지라 상태가 같다(`edit/paste-ops.ts` 의 `duplicateOps`). 복사가 지나는
   * `stripMarkers` 가 보임을 빠뜨리면 사본이 숨기던 상태에서 보인다(고치기 전 판 — V3 보고 Task 4).
   */
  it('Ctrl+D 사본은 원본의 상태 보임을 든다', async () => {
    const VISIBLE_DOC = () => ({
      ...pageDoc({
        id: 'n-root',
        type: 'Page',
        children: [{ id: 'b-a', type: 'Button', visibility: { mode: 'only' as const, states: ['s_admin'] } }],
      }),
      viewStates: [{ id: 's_admin', name: '관리자' }],
    })
    const srv = server(VISIBLE_DOC())
    await openPage(VISIBLE_DOC(), { apiOverrides: srv.api })
    fireEvent.click(row('Button'))
    fireEvent.keyDown(document.body, ctrl('d'))

    await waitFor(() => expect(srv.calls).toHaveLength(1))
    expect(srv.calls[0]![0]).toMatchObject({
      op: 'add',
      path: '/root/children/1',
      value: { visibility: { mode: 'only', states: ['s_admin'] } },
    })
  })

  it('루트를 고른 잘라내기는 아무것도 안 싣고 안 지운다', async () => {
    const srv = server()
    await openPage(doc(), { apiOverrides: srv.api })
    fireEvent.click(row('Page'))
    expect(clip('cut', document.body)).toEqual({ written: undefined, prevented: false })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(srv.calls).toHaveLength(0)
  })

  it('Ctrl+D 가 제 바로 뒤에 사본을 넣고 사본을 고른다 — Ctrl+Z 한 번에 돌아온다', async () => {
    const srv = server()
    await openPage(doc(), { apiOverrides: srv.api })
    fireEvent.click(row('Card'))
    fireEvent.keyDown(document.body, ctrl('d'))

    await waitFor(() => expect(srv.calls).toHaveLength(1))
    expect(srv.calls[0]).toHaveLength(1)
    expect(srv.calls[0]![0]).toMatchObject({ op: 'add', path: '/root/children/2' })
    expect(structureTypes()).toEqual(['Page', 'Text', 'Card', 'Button', 'Card', 'Button', 'Divider'])
    expect(
      within(structureRegion())
        .getAllByRole('button', { name: structureRowName('Card') })[1]!
        .getAttribute('aria-current'),
    ).toBe('true')

    await undoOnceRestores(srv, 1)
  })

  it('루트를 고른 Ctrl+D 는 편집 없이 이유를 말한다', async () => {
    const srv = server()
    await openPage(doc(), { apiOverrides: srv.api })
    fireEvent.click(row('Page'))
    fireEvent.keyDown(document.body, ctrl('d'))
    await waitFor(() => expect(alertTexts()).toEqual(['루트가 아닌 노드를 고르세요']))
    expect(srv.calls).toHaveLength(0)
  })

  it('뷰 모드에서는 붙이기 · 잘라내기 · 복제가 안 서고 복사는 선다', async () => {
    const srv = server()
    await openPage(doc(), { apiOverrides: srv.api })
    fireEvent.click(row('Card'))
    const envelope = clip('copy', document.body).written!
    fireEvent.click(screen.getByRole('button', { name: '뷰 모드' }))

    expect(clip('paste', document.body, envelope).prevented).toBe(false)
    expect(clip('cut', document.body).prevented).toBe(false)
    fireEvent.keyDown(document.body, ctrl('d'))
    expect(clip('copy', document.body).prevented).toBe(true)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(srv.calls).toHaveLength(0)
  })
})
