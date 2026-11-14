/**
 * **코멘트가 가리킨 노드의 링**(`src/canvas/canvas.tsx` 의 `ringId` · `src/comments/comment-pointing.tsx`) — «코멘트» 탭의 묶음에 포커스가 들면
 * 캔버스가 그 노드에 고른 것과 같은 꼴의 링(`.wb-shell-selection[data-wb-comment-pointed]`)을 세운다. **진짜 선택이 아니다** — 스토어의 선택 ·
 * 고른 외곽선(`data-wb-selected-id`)은 그대로다.
 *
 * jsdom 이라 상자는 0 이다 — 링 요소가 서는지 · 어느 노드에 붙는지로 잰다. 자리 · Tab 차례는 실브라우저(`build-test/comment-focus.test.ts`)가 잰다.
 */
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PageDocument } from '@wirebound/schema'
import type { Comment } from '../../src/api/types'
import type { EditorStore } from '../../src/store/editor-store'
import { canvasDocument, deselect, HEAD_SEQ, openPage, PAGE_ID, pageDoc, requireNode } from '../editor-harness'

/** 셸이 만든 스토어를 쥔다 — 링이 선택이 아님을 스토어 값으로 잰다(`./canvas.test.tsx` 의 같은 장치). */
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
  if (store === undefined) throw new Error('셸이 스토어를 만들지 않았습니다')
  return store as EditorStore
}

/** `n_form` · `n_grid` 는 늘 보이고 `n_admin` 은 `s_admin` 에서만 보인다. */
function doc(): PageDocument {
  return {
    ...pageDoc({
      id: 'n_root',
      type: 'Page',
      children: [
        { id: 'n_form', type: 'Text', props: { content: '폼' } },
        { id: 'n_grid', type: 'Text', props: { content: '표' } },
        { id: 'n_admin', type: 'Text', props: { content: '관리' }, visibility: { mode: 'only', states: ['s_admin'] } },
      ],
    }),
    viewStates: [{ id: 's_admin', name: '관리자' }],
  }
}

function comment(id: string, nodeId: string): Comment {
  return {
    id,
    nodeId,
    body: `${nodeId} 의 말`,
    authorId: 'u-1',
    authorName: '테스터',
    createdAt: '2026-11-14T09:00:00.000Z',
    updatedAt: '2026-11-14T09:00:00.000Z',
  }
}

async function open(): Promise<void> {
  await openPage(doc(), {
    apiOverrides: { listComments: async () => [comment('c1', 'n_grid'), comment('c2', 'n_admin'), comment('c3', 'n_form')] },
  })
}

async function openCommentTab(): Promise<void> {
  fireEvent.click(screen.getByRole('tab', { name: '코멘트' }))
  await waitFor(() => expect(document.querySelector('[data-comment-node="n_grid"]')).not.toBeNull())
}

/** 그 노드의 묶음에 포커스를 준다 — 사람이 Tab 으로 드는 것과 같은 `focusin`. */
function focusGroup(nodeId: string): void {
  const group = document.querySelector<HTMLElement>(`[data-comment-node="${nodeId}"]`)
  if (group === null) throw new Error(`묶음이 없습니다: ${nodeId}`)
  act(() => group.focus())
}

function rings(): string[] {
  return [...document.querySelectorAll('[data-wb-comment-pointed]')].map((element) => element.getAttribute('data-wb-comment-pointed') ?? '')
}

function selectedOutlines(): string[] {
  return [...document.querySelectorAll('[data-wb-selected-id]')].map((element) => element.getAttribute('data-wb-selected-id') ?? '')
}

describe('코멘트 링 — 진짜 선택이 아니다', () => {
  it('아무것도 안 고른 채 묶음에 포커스 — 링 하나 · 고른 외곽선 없음 · 선택 그대로', async () => {
    await open()
    deselect()
    await openCommentTab()
    expect(rings()).toEqual([])

    focusGroup('n_grid')

    expect(rings()).toEqual(['n_grid'])
    expect(document.querySelector('[data-wb-comment-pointed]')?.classList.contains('wb-shell-selection')).toBe(true)
    expect(selectedOutlines()).toEqual([])
    expect(shellStore().getState().selectedNodeIds).toEqual([])
  })

  it('다른 노드를 고른 채 — 고른 외곽선은 그대로 · 링은 따로', async () => {
    await open()
    fireEvent.click(requireNode('n_form'))
    await openCommentTab()

    focusGroup('n_grid')

    expect(rings()).toEqual(['n_grid'])
    expect(selectedOutlines()).toEqual(['n_form'])
    expect(shellStore().getState().selectedNodeIds).toEqual(['n_form'])
  })

  it('고른 노드를 가리키면 링을 따로 안 그린다', async () => {
    await open()
    fireEvent.click(requireNode('n_grid'))
    await openCommentTab()

    focusGroup('n_grid')
    expect(rings()).toEqual([])
    expect(selectedOutlines()).toEqual(['n_grid'])

    // 양성 대조 — 같은 판에서 다른 묶음은 링이 선다.
    focusGroup('n_form')
    expect(rings()).toEqual(['n_form'])
  })

  it('고른 옅은 노드(여럿 고름의 기준 아닌 것)를 가리키면 링 대신 그 옅은 외곽선 그대로다', async () => {
    await open()
    fireEvent.click(requireNode('n_form'))
    fireEvent.click(requireNode('n_grid'), { metaKey: true, ctrlKey: true })
    await waitFor(() => expect(shellStore().getState().selectedNodeIds).toHaveLength(2))
    const members = () =>
      [...document.querySelectorAll('[data-wb-member-id]')].map((element) => element.getAttribute('data-wb-member-id') ?? '')
    const base = shellStore().getState().selectedNodeId
    const member =
      shellStore()
        .getState()
        .selectedNodeIds.find((id) => id !== base) ?? ''
    expect(members()).toEqual([member])
    await openCommentTab()

    focusGroup(member)

    expect(rings()).toEqual([])
    expect(members()).toEqual([member])
    expect(selectedOutlines()).toEqual([base])
  })

  it('뷰 모드에서도 선다 — 고른 외곽선은 없다', async () => {
    await open()
    fireEvent.click(screen.getByRole('button', { name: '뷰 모드' }))
    await openCommentTab()

    focusGroup('n_grid')

    expect(rings()).toEqual(['n_grid'])
    expect(selectedOutlines()).toEqual([])
  })

  it('지금 상태에서 숨은 노드를 가리키면 링이 없다', async () => {
    await open()
    deselect()
    await openCommentTab()

    focusGroup('n_admin')
    expect(canvasDocument().querySelector('[data-wb-id="n_admin"]')).toBeNull()
    expect(rings()).toEqual([])

    // 양성 대조 — 보이는 노드로 옮기면 선다.
    focusGroup('n_grid')
    expect(rings()).toEqual(['n_grid'])
  })
})

describe('코멘트 링 · 펼침 — 그 노드가 문서에서 사라지면 걷힌다', () => {
  it('남이 지운 뒤 같은 id 로 다시 세워도 링이 되살지 않는다', async () => {
    await open()
    deselect()
    await openCommentTab()
    focusGroup('n_grid')
    expect(rings()).toEqual(['n_grid'])
    // 포커스를 묶음 밖으로 — 사람은 다른 데를 본다.
    act(() => (document.activeElement as HTMLElement | null)?.blur())

    act(() =>
      shellStore().applyRemoteChange(PAGE_ID, { seq: HEAD_SEQ + 1, ops: [{ op: 'remove', path: '/root/children/1' }], warnings: [] }),
    )
    await waitFor(() => expect(canvasDocument().querySelector('[data-wb-id="n_grid"]')).toBeNull())
    expect(rings()).toEqual([])

    act(() =>
      shellStore().applyRemoteChange(PAGE_ID, {
        seq: HEAD_SEQ + 2,
        ops: [{ op: 'add', path: '/root/children/1', value: { id: 'n_grid', type: 'Text', props: { content: '표' } } }],
        warnings: [],
      }),
    )
    await waitFor(() => expect(canvasDocument().querySelector('[data-wb-id="n_grid"]')).not.toBeNull())
    expect(rings()).toEqual([])
  })
})

describe('코멘트 링 — 걷히는 때', () => {
  /**
   * 고름이 서는 누름은 탭을 «컴포넌트» 로 옮겨(`src/shell/canvas-pick.tsx`) 그쪽이 먼저 걷는다. 누름 자체가 걷는지는 **고름이 안 서는** 누름 —
   * 남이 잡은 노드 — 으로 잰다(탭이 «코멘트» 에 머문다).
   */
  it('캔버스의 노드를 누르면 걷힌다 — 남이 잡아 안 골라져 탭이 머물러도', async () => {
    await open()
    deselect()
    await openCommentTab()
    act(() => shellStore().setLocks([{ pageId: PAGE_ID, nodeId: 'n_form', userId: 'u-bora', userName: '보라' }]))
    focusGroup('n_grid')
    expect(rings()).toEqual(['n_grid'])

    fireEvent.click(requireNode('n_form'))

    expect(shellStore().getState().selectedNodeIds).toEqual([])
    expect(screen.getByRole('tab', { name: '코멘트' }).getAttribute('aria-selected')).toBe('true')
    expect(rings()).toEqual([])
  })

  it('캔버스 빈 자리를 누르면 걷힌다', async () => {
    await open()
    deselect()
    await openCommentTab()
    focusGroup('n_grid')
    expect(rings()).toEqual(['n_grid'])

    deselect()

    expect(rings()).toEqual([])
  })

  it('뷰 모드에서도 캔버스를 누르면 걷힌다', async () => {
    await open()
    fireEvent.click(screen.getByRole('button', { name: '뷰 모드' }))
    await openCommentTab()
    focusGroup('n_grid')
    expect(rings()).toEqual(['n_grid'])

    fireEvent.click(requireNode('n_form'))

    expect(rings()).toEqual([])
  })

  it('다른 탭으로 가면 걷힌다', async () => {
    await open()
    deselect()
    await openCommentTab()
    focusGroup('n_grid')
    expect(rings()).toEqual(['n_grid'])

    fireEvent.click(screen.getByRole('tab', { name: '페이지 정보' }))

    await waitFor(() => expect(rings()).toEqual([]))
  })

  it('우측 패널을 접으면 걷힌다', async () => {
    await open()
    deselect()
    await openCommentTab()
    focusGroup('n_grid')
    expect(rings()).toEqual(['n_grid'])

    fireEvent.click(screen.getByRole('button', { name: '우측 패널 접기' }))

    await waitFor(() => expect(rings()).toEqual([]))
  })
})

/**
 * **펼침**(`src/comments/comment-pointing.tsx` 머리말 «펼침») — 지금 탭이 아닌 패널 안 노드의 묶음을 고르면(묶음 Enter) 캔버스가 그 패널을 펼쳐
 * 그린다. 걷히는 때를 잰다 — 실브라우저 판(`build-test/comment-focus.test.ts` «안 보이는 탭 패널 …»)은 펼침 · 링 자리 · 문서 그대로를 잰다.
 */
describe('코멘트 펼침 — 걷히는 때', () => {
  /** `n_tabs` 의 지금 탭은 첫째 — `n_in2` 는 둘째 탭 안이라 그리지 않는다. `n_top` 은 늘 보인다. */
  function tabsDoc(): PageDocument {
    const panel = (id: string, label: string, inner: string) => ({
      id,
      type: 'TabPanel',
      props: { label },
      children: [{ id: inner, type: 'Text', props: { content: label } }],
    })
    return pageDoc({
      id: 'n_root',
      type: 'Page',
      children: [
        { id: 'n_top', type: 'Text', props: { content: '위' } },
        { id: 'n_tabs', type: 'Tabs', props: { active: 0 }, children: [panel('n_p1', '첫', 'n_in1'), panel('n_p2', '둘', 'n_in2')] },
      ],
    })
  }

  async function openTabs(): Promise<void> {
    await openPage(tabsDoc(), {
      apiOverrides: { listComments: async () => [comment('c1', 'n_in2'), comment('c2', 'n_top')] },
    })
    fireEvent.click(screen.getByRole('tab', { name: '코멘트' }))
    await waitFor(() => expect(document.querySelector('[data-comment-node="n_in2"]')).not.toBeNull())
  }

  const drawn = (nodeId: string) => canvasDocument().querySelector(`[data-wb-id="${nodeId}"]`) !== null

  /** 묶음을 고른다 — 포커스를 두고 Enter(곧바로 고른다). */
  function pick(nodeId: string): void {
    focusGroup(nodeId)
    const group = document.querySelector<HTMLElement>(`[data-comment-node="${nodeId}"]`)
    if (group === null) throw new Error(`묶음이 없습니다: ${nodeId}`)
    fireEvent.keyDown(group, { key: 'Enter' })
  }

  it('포커스로는 안 펼치고 고르면 펼친다 · 다른 묶음으로 옮겨도 남는다', async () => {
    await openTabs()
    expect(drawn('n_in2')).toBe(false)

    focusGroup('n_in2')
    expect(drawn('n_in2')).toBe(false)

    pick('n_in2')
    await waitFor(() => expect(drawn('n_in2')).toBe(true))
    expect(rings()).toEqual(['n_in2'])

    focusGroup('n_top')
    expect(rings()).toEqual(['n_top'])
    expect(drawn('n_in2')).toBe(true)
  })

  it('캔버스를 누르면 걷힌다 — 뷰 모드(누름이 선택을 안 바꾼다)', async () => {
    await openTabs()
    fireEvent.click(screen.getByRole('button', { name: '뷰 모드' }))
    await waitFor(() => expect(document.querySelector('[data-comment-node="n_in2"]')).not.toBeNull())
    pick('n_in2')
    await waitFor(() => expect(drawn('n_in2')).toBe(true))

    fireEvent.click(requireNode('n_top'))

    await waitFor(() => expect(drawn('n_in2')).toBe(false))
  })

  it('펼친 노드가 문서에서 사라지면 걷히고, 같은 id 로 다시 서도 되살지 않는다', async () => {
    await openTabs()
    pick('n_in2')
    await waitFor(() => expect(drawn('n_in2')).toBe(true))

    // 둘째 패널의 글을 남이 지운다 — 패널은 남는다.
    act(() =>
      shellStore().applyRemoteChange(PAGE_ID, {
        seq: HEAD_SEQ + 1,
        ops: [{ op: 'remove', path: '/root/children/1/children/1/children/0' }],
        warnings: [],
      }),
    )
    await waitFor(() => expect(drawn('n_in2')).toBe(false))
    act(() =>
      shellStore().applyRemoteChange(PAGE_ID, {
        seq: HEAD_SEQ + 2,
        ops: [
          { op: 'add', path: '/root/children/1/children/1/children/0', value: { id: 'n_in2', type: 'Text', props: { content: '둘' } } },
        ],
        warnings: [],
      }),
    )
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)))
    // 지금 탭(첫째)이 그대로라 둘째 패널 안 글은 그리지 않는다 — 펼침이 되살면 선다.
    expect(drawn('n_in1')).toBe(true)
    expect(drawn('n_in2')).toBe(false)
  })

  it('진짜 선택이 바뀌면 걷히고, 선택이 되돌아와도 되살지 않는다', async () => {
    await openTabs()
    const before = shellStore().getState().selectedNodeId
    expect(before).not.toBeNull()
    pick('n_in2')
    await waitFor(() => expect(drawn('n_in2')).toBe(true))

    act(() => shellStore().selectNode('n_top'))
    await waitFor(() => expect(drawn('n_in2')).toBe(false))

    act(() => shellStore().selectNode(before))
    // 이펙트가 돌 틈을 준다 — 되살면 이 사이에 다시 선다.
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)))
    expect(drawn('n_in2')).toBe(false)
  })
})
