/**
 * **여럿을 고른 판의 동작**(설계서 「설계서 화면 구조」의 «여럿을 고른 판의 동작» · 「개인 undo/redo」의 «편집 하나 = 되돌리기 하나»). 셸째로 — 단축키 · 클립보드 ·
 * 줄 행동 · 속성 패널이 고른 목록 전부에 묶음 하나를 내고, Ctrl+Z 한 번에 통째로 돌아오는지를 **서버 문서**(가짜 서버가 적용한 값)로 본다.
 * 남의 잠금 · 상한 · 하나일 때만 되는 것도 여기다. jsdom 값이다(jsdom 의 플랫폼은 mac 이 아니라 명령 키는 Ctrl).
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { applyOps, invertOps, readNodesEnvelope, type PatchOp, type WbNode } from '@wirebound/schema'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '../../src/api/client'
import type { PageDetail, PatchResult } from '../../src/api/types'
import { MULTI_WHY_DISABLED } from '../../src/edit/structure-actions'
import { MULTI_KEY_NOTICE } from '../../src/shell/editor-keys'
import { MIXED_TYPES_NOTICE } from '../../src/panels/property-panel'
import type { EditorStore } from '../../src/store/editor-store'
import { HEAD_SEQ, PAGE_ID, openPage, pageDetail, pageDoc } from '../editor-harness'
import { reasonOf } from '../panels/tree-row'
import '../../src/catalog-setup'

const { createdStores } = vi.hoisted(() => ({ createdStores: [] as unknown[] }))

vi.mock('../../src/store/editor-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/store/editor-store')>()
  return {
    ...actual,
    EditorStore: class extends actual.EditorStore {
      constructor() {
        super()
        createdStores.push(this)
      }
    },
  }
})

beforeEach(() => {
  createdStores.length = 0
})

function shellStore(): EditorStore {
  const store = createdStores.at(-1)
  if (store === undefined) throw new Error('셸이 EditorStore를 만들지 않았습니다')
  return store as EditorStore
}

/**
 * ```
 * n-root
 *   n-a(Text «가» body)  n-b(Text «나» body)  n-box(Card)[n-1 Button]  n-c(Text «다» h2)
 * ```
 */
function doc(): ReturnType<typeof pageDoc> {
  return pageDoc({
    id: 'n-root',
    type: 'Page',
    children: [
      { id: 'n-a', type: 'Text', props: { content: '가', role: 'body' } },
      { id: 'n-b', type: 'Text', props: { content: '나', role: 'body' } },
      { id: 'n-box', type: 'Card', children: [{ id: 'n-1', type: 'Button' }] },
      { id: 'n-c', type: 'Text', props: { content: '다', role: 'h2' } },
    ],
  })
}

/** 받은 편집을 적용하는 가짜 서버 — 화면이 아니라 이 문서(`held`)로 단언한다. */
function server(initial = doc()) {
  const calls: PatchOp[][] = []
  let seq = HEAD_SEQ
  let held = initial
  const patchOps: ApiClient['patchOps'] = async (_projectId, _pageId, body) => {
    calls.push(body.ops)
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
  const listComments: ApiClient['listComments'] = async () => []
  return { calls, held: () => held, api: { patchOps, getPage, listComments } satisfies Partial<ApiClient> }
}

/** 서버 문서 뿌리 자식 — `id:내용`. */
function children(document: ReturnType<typeof doc>): string[] {
  return (document.root.children ?? []).map((node) => {
    const content = (node.props as { content?: string } | undefined)?.content
    return content === undefined ? node.type : `${node.type}:${content}`
  })
}

function treeRow(nodeId: string): HTMLElement {
  const button = screen
    .getByRole('region', { name: '구조 트리' })
    .querySelector<HTMLElement>(`[data-tree-id="${nodeId}"] .wb-shell-structure-node`)
  if (button === null) throw new Error(`${nodeId} 줄이 없다`)
  return button
}

/** `n-a` 를 누르고 나머지를 Ctrl 클릭으로 더한다. */
function pick(...ids: string[]): void {
  const [first, ...rest] = ids
  fireEvent.click(treeRow(first!))
  for (const id of rest) fireEvent.click(treeRow(id), { ctrlKey: true })
}

function key(init: KeyboardEventInit): void {
  fireEvent.keyDown(document.body, { bubbles: true, ...init })
}

function clip(type: 'copy' | 'cut', target: EventTarget): { written: string | undefined; prevented: boolean } {
  const data = new Map<string, string>()
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clipboardData', {
    value: { setData: (kind: string, value: string) => data.set(kind, value), getData: (kind: string) => data.get(kind) ?? '' },
  })
  target.dispatchEvent(event)
  return { written: data.get('text/plain'), prevented: event.defaultPrevented }
}

function historyButton(name: '되돌리기' | '다시 실행'): HTMLButtonElement {
  return within(screen.getByRole('group', { name: '편집 이력' })).getByRole<HTMLButtonElement>('button', { name })
}

/** Ctrl+Z 한 번 — 편집 하나가 더 나가고 서버 문서가 처음으로 돌아온다. */
async function undoOnce(srv: ReturnType<typeof server>, before: number): Promise<void> {
  await waitFor(() => expect(historyButton('되돌리기').disabled).toBe(false))
  key({ key: 'z', code: 'KeyZ', ctrlKey: true })
  await waitFor(() => expect(srv.calls).toHaveLength(before + 1))
  expect(children(srv.held())).toEqual(children(doc()))
}

describe('일괄 삭제 · 복제 · 복사 · 잘라내기 — 편집 하나 · 되돌리기 하나', () => {
  /** 혼자 죽는 변조: 여럿의 삭제가 기준 노드 하나만 지운다(`removeSelected` 의 여럿 갈래를 뗌). */
  it('Delete 는 고른 것 전부를 묶음 하나로 지우고 선택을 비운다 — Ctrl+Z 한 번에 통째로 돌아온다', async () => {
    const srv = server()
    await openPage(doc(), { apiOverrides: srv.api })
    pick('n-a', 'n-box', 'n-c')

    key({ key: 'Delete' })

    await waitFor(() => expect(srv.calls).toHaveLength(1))
    expect({ server: children(srv.held()), ops: srv.calls[0]!.length, picked: shellStore().getState().selectedNodeIds }).toEqual({
      server: ['Text:나'],
      ops: 3,
      picked: [],
    })
    await undoOnce(srv, 1)
  })

  it('줄 `…` «삭제»도 고른 것 전부다 — 기준 노드의 부모를 고른다', async () => {
    const srv = server()
    await openPage(doc(), { apiOverrides: srv.api })
    pick('n-a', 'n-c')
    const more = within(screen.getByRole('region', { name: '구조 트리' }).querySelector<HTMLElement>('[data-tree-id="n-c"]')!).getByRole('button', {
      name: 'Text 다 더 보기',
    })
    fireEvent.click(more)
    fireEvent.click(screen.getByRole('menuitem', { name: '삭제' }))

    await waitFor(() => expect(srv.calls).toHaveLength(1))
    expect({ server: children(srv.held()), picked: shellStore().getState().selectedNodeIds }).toEqual({
      server: ['Text:나', 'Card'],
      picked: ['n-root'],
    })
  })

  /** 혼자 죽는 변조: 복제가 기준 노드만 복제한다 · 넣은 노드 가운데 마지막만 고른다. */
  it('Ctrl+D 는 고른 노드마다 제 바로 뒤에 사본 — 묶음 하나 · 사본 전부를 고른다 · Ctrl+Z 한 번에 통째로', async () => {
    const srv = server()
    await openPage(doc(), { apiOverrides: srv.api })
    pick('n-a', 'n-c')

    key({ key: 'd', code: 'KeyD', ctrlKey: true })

    await waitFor(() => expect(srv.calls).toHaveLength(1))
    const after = srv.held().root.children!
    expect({
      server: children(srv.held()),
      picked: shellStore().getState().selectedNodeIds,
      anchor: shellStore().getState().selectedNodeId,
    }).toEqual({
      server: ['Text:가', 'Text:가', 'Text:나', 'Card', 'Text:다', 'Text:다'],
      picked: [after[1]?.id, after[5]?.id],
      anchor: after[5]?.id,
    })
    await undoOnce(srv, 1)
  })

  /** 혼자 죽는 변조: 복사가 기준 노드만 싣는다. */
  it('복사는 고른 것을 문서 차례대로 봉투 하나에 싣는다 — 고른 차례가 아니다', async () => {
    await openPage(doc(), { apiOverrides: server().api })
    pick('n-c', 'n-a')

    const copied = clip('copy', document.body)

    expect(copied.prevented).toBe(true)
    expect(readNodesEnvelope(copied.written!)?.nodes.map((node: WbNode) => node.id)).toEqual(['n-a', 'n-c'])
  })

  it('잘라내기 = 봉투 + 지우기 편집 하나', async () => {
    const srv = server()
    await openPage(doc(), { apiOverrides: srv.api })
    pick('n-a', 'n-b')

    const cut = clip('cut', document.body)

    await waitFor(() => expect(srv.calls).toHaveLength(1))
    expect({
      nodes: readNodesEnvelope(cut.written!)?.nodes.map((node: WbNode) => node.id),
      server: children(srv.held()),
    }).toEqual({ nodes: ['n-a', 'n-b'], server: ['Card', 'Text:다'] })
  })

  /**
   * 고른 뒤 그 가운데 하나를 남이 잡았다(잠금은 고른 뒤 도착한다) — 묶음째 안 나가고 하단 바가 누가 잡았는지 말한다. 혼자 죽는 변조: 여럿의 판정이
   * 기준 노드의 잠금만 본다(`otherLock`).
   */
  it('고른 것 가운데 하나를 남이 잡으면 Delete · Ctrl+D 가 아무것도 안 낸다 — «삭제»가 꺼져 이유를 들고 하단 바가 말한다', async () => {
    const srv = server()
    await openPage(doc(), { apiOverrides: srv.api })
    pick('n-a', 'n-c')
    // 기준 노드(`n-c`)가 아닌 것을 잡는다 — 기준 노드의 잠금만 보는 판정이면 안 막힌다.
    act(() => {
      shellStore().setLocks([{ pageId: PAGE_ID, nodeId: 'n-a', userId: 'u-bora', userName: '보라' }])
    })

    key({ key: 'Delete' })
    key({ key: 'd', code: 'KeyD', ctrlKey: true })
    await new Promise((resolve) => setTimeout(resolve, 30))
    fireEvent.click(
      within(screen.getByRole('region', { name: '구조 트리' }).querySelector<HTMLElement>('[data-tree-id="n-c"]')!).getByRole('button', {
        name: 'Text 다 더 보기',
      }),
    )
    const remove = screen.getByRole('menuitem', { name: '삭제' })

    expect({
      calls: srv.calls.length,
      alert: screen.queryAllByRole('alert').map((element) => element.textContent),
      removeOff: remove.getAttribute('aria-disabled') === 'true' || (remove as HTMLButtonElement).disabled,
      reason: reasonOf(remove),
    }).toEqual({
      calls: 0,
      alert: ['보라님이 편집 중이라 고를 수도 바꿀 수도 없습니다'],
      removeOff: true,
      reason: '보라님이 편집 중인 노드가 있어 함께 지울 수 없습니다',
    })
  })
})

describe('하나일 때만 되는 것', () => {
  /** 혼자 죽는 변조: 여럿에서 순서 · 계층을 끄지 않는다(`selectionAbilities`). */
  it('여럿이면 위로 · 아래로 · 들여쓰기 · 내어쓰기가 꺼지고 이유가 «하나일 때만»이다', async () => {
    await openPage(doc(), { apiOverrides: server().api })
    pick('n-a', 'n-c')
    fireEvent.click(
      within(screen.getByRole('region', { name: '구조 트리' }).querySelector<HTMLElement>('[data-tree-id="n-c"]')!).getByRole('button', {
        name: 'Text 다 더 보기',
      }),
    )
    const items = ['위로', '아래로', '들여쓰기', '내어쓰기', '삭제'].map((name) => {
      const item = screen.getByRole('menuitem', { name })
      return [name, item.getAttribute('aria-disabled') === 'true' || (item as HTMLButtonElement).disabled, item.getAttribute('title')]
    })
    expect(items).toEqual([
      ['위로', true, MULTI_WHY_DISABLED],
      ['아래로', true, MULTI_WHY_DISABLED],
      ['들여쓰기', true, MULTI_WHY_DISABLED],
      ['내어쓰기', true, MULTI_WHY_DISABLED],
      ['삭제', false, null],
    ])
  })

  /** 혼자 죽는 변조: 키가 여럿을 거르지 않는다(`manyPicked`). */
  it('여럿이면 Alt+↑ · ↓ 가 아무것도 안 하고 하단 바가 이유를 말한다', async () => {
    const srv = server()
    await openPage(doc(), { apiOverrides: srv.api })
    pick('n-b', 'n-c')

    key({ key: 'ArrowUp', altKey: true })
    key({ key: 'ArrowDown' })
    await new Promise((resolve) => setTimeout(resolve, 30))

    expect({
      calls: srv.calls.length,
      picked: shellStore().getState().selectedNodeIds,
      alert: screen.queryAllByRole('alert').map((element) => element.textContent),
      info: screen.queryAllByRole('status').filter((element) => element.classList.contains('wb-shell-info-notice')).map((element) => element.textContent),
    }).toEqual({ calls: 0, picked: ['n-b', 'n-c'], alert: [], info: [MULTI_KEY_NOTICE] })
  })
})

describe('일괄 속성', () => {
  const field = (label: string): HTMLInputElement | HTMLSelectElement => screen.getByLabelText<HTMLInputElement>(label)

  /**
   * 같은 타입 둘 — 같은 값 칸은 값, 갈리는 칸은 «여러 값». 갈리는 칸 하나를 바꾸면 그 칸만 둘 다에 묶음 하나로, 다른 칸은 노드마다 제 값이다(서버
   * 문서로). 혼자 죽는 변조: 바꾼 칸을 기준 노드에만 쓴다 · 갈리는 칸에 기준 노드의 값을 보인다.
   */
  it('같은 타입 — 갈리는 칸은 «여러 값», 바꾼 칸만 모두에 · 묶음 하나 · Ctrl+Z 한 번', async () => {
    const srv = server()
    await openPage(doc(), { apiOverrides: srv.api })
    pick('n-b', 'n-c')

    const content = field('내용') as HTMLInputElement
    expect({ value: content.value, placeholder: content.getAttribute('placeholder') }).toEqual({ value: '', placeholder: '여러 값' })

    fireEvent.change(content, { target: { value: '같게' } })
    fireEvent.blur(content)

    await waitFor(() => expect(srv.calls).toHaveLength(1))
    const props = srv.held().root.children!.map((node) => node.props)
    expect({ ops: srv.calls[0]!.length, b: props[1], c: props[3], a: props[0] }).toEqual({
      ops: 2,
      b: { content: '같게', role: 'body' },
      c: { content: '같게', role: 'h2' },
      a: { content: '가', role: 'body' },
    })
    await undoOnce(srv, 1)
  })

  it('모두 같은 값인 칸은 그 값을 보인다', async () => {
    await openPage(doc(), { apiOverrides: server().api })
    pick('n-a', 'n-b')
    expect((field('내용') as HTMLInputElement).placeholder).toBe('여러 값')
    // 역할은 둘 다 body 다 — 고르개가 그 값을 보인다.
    expect((field('역할') as HTMLSelectElement).value).toBe('body')
  })

  /** 혼자 죽는 변조: 타입이 섞여도 기준 노드의 패널을 그린다. */
  it('타입이 섞이면 «N개 고름» · 같은 타입끼리만 · 삭제 단추가 고른 것 전부를 지운다', async () => {
    const srv = server()
    await openPage(doc(), { apiOverrides: srv.api })
    pick('n-a', 'n-box')

    expect(screen.getByText(MIXED_TYPES_NOTICE)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '고른 노드 삭제' }))

    await waitFor(() => expect(srv.calls).toHaveLength(1))
    expect(children(srv.held())).toEqual(['Text:나', 'Text:다'])
  })

  it('고른 것 가운데 하나를 남이 잡으면 위젯이 다 꺼진다', async () => {
    await openPage(doc(), { apiOverrides: server().api })
    pick('n-b', 'n-c')
    // 기준 노드(`n-c`)가 아닌 것을 잡는다.
    act(() => {
      shellStore().setLocks([{ pageId: PAGE_ID, nodeId: 'n-b', userId: 'u-bora', userName: '보라' }])
    })
    expect((field('내용') as HTMLInputElement).disabled).toBe(true)
  })
})

describe('상호작용 · 코멘트 탭은 하나일 때만', () => {
  it('여럿이면 상호작용을 걸 자리 대신 안내가 서고 코멘트 상자가 꺼진다', async () => {
    await openPage(doc(), { apiOverrides: server().api })
    pick('n-a', 'n-b')

    fireEvent.click(screen.getByRole('tab', { name: '상호작용' }))
    expect(screen.getByText('상호작용은 노드 하나를 골랐을 때 겁니다')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: '코멘트' }))
    const box = (await screen.findByLabelText('새 코멘트')) as HTMLTextAreaElement
    expect({
      disabled: box.disabled,
      notice: screen.queryByText('코멘트는 노드 하나를 골랐을 때 답니다') !== null,
    }).toEqual({ disabled: true, notice: true })
  })
})
