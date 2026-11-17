/**
 * **코멘트 묶음이 캔버스를 가리킨다**(`src/panels/comment-panel.tsx` 머리말 «묶음이 캔버스를 가리킨다») — 포커스가 곧 «고름»(묶음에 포커스가 듦 ·
 * 묶음 누름 · 묶음 자체의 Enter/Space)이라 링과 함께 곧바로 숨은 노드를 보이는 화면 상태로, 머리 단추(편집 모드)는 진짜 선택 + «컴포넌트» 탭.
 *
 * jsdom 이라 누름이 포커스를 안 옮긴다 — 포커스 · 누름 · 키를 따로 낸다. 실브라우저의 차례(누름이 포커스를 주고 클릭이 뒤따름)는
 * `build-test/comment-focus.test.ts` 가 잰다.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PageDocument } from '@wirebound/schema'
import type { Comment } from '../../src/api/types'
import type { EditorStore } from '../../src/store/editor-store'
import { HEAD_SEQ, openPage, PAGE_ID, PAGE_ROUTE, pageDoc, PROJECT_NAME, renderEditor, requireNode } from '../editor-harness'

/** 셸이 만든 스토어를 쥔다 — 포커스 · 고름이 선택을 안 바꾸는지 스토어 값으로 잰다(`../canvas/canvas.test.tsx` 의 같은 장치). */
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

/** `n_a` 는 늘 보이고 `n_b` 는 `s_admin` 에서만 보인다. `n_z` 는 문서에 없다(사라진 노드). */
function doc(): PageDocument {
  return {
    ...pageDoc({
      id: 'n_root',
      type: 'Page',
      children: [
        { id: 'n_a', type: 'Text', props: { content: '늘' }, marker: 1 },
        { id: 'n_b', type: 'Text', props: { content: '관리' }, marker: 2, visibility: { mode: 'only', states: ['s_admin'] } },
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

const COMMENTS = [comment('c1', 'n_a'), comment('c2', 'n_b'), comment('c3', 'n_z')]

async function open(): Promise<void> {
  await openPage(doc(), {
    apiOverrides: {
      listComments: async () => COMMENTS,
      deleteComment: async () => ({ seq: HEAD_SEQ + 1, markerOps: [] }),
    },
  })
}

async function openCommentTab(): Promise<void> {
  fireEvent.click(screen.getByRole('tab', { name: '코멘트' }))
  await waitFor(() => expect(document.querySelector('[data-comment-node="n_b"]')).not.toBeNull())
}

function group(nodeId: string): HTMLElement {
  const found = document.querySelector<HTMLElement>(`.wb-shell-comments [data-comment-node="${nodeId}"]`)
  if (found === null) throw new Error(`묶음이 없습니다: ${nodeId}`)
  return found
}

function focusGroup(nodeId: string): void {
  act(() => group(nodeId).focus())
}

function switcherName(): string {
  return screen.getByRole('button', { name: /^화면 상태:/ }).getAttribute('aria-label') ?? ''
}

async function pickStateFromHead(name: string): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: /^화면 상태:/ }))
  fireEvent.click(await screen.findByRole('menuitemradio', { name }))
}

function rings(): string[] {
  return [...document.querySelectorAll('[data-wb-comment-pointed]')].map((element) => element.getAttribute('data-wb-comment-pointed') ?? '')
}

function tabSelected(name: string): string | null {
  return screen.getByRole('tab', { name }).getAttribute('aria-selected')
}

describe('포커스가 곧 고름 — 링 · 보이는 상태가 곧바로 · 선택은 그대로', () => {
  it('숨은 노드의 묶음에 포커스 — 그 렌더에서 보이는 상태로 바뀌고 링이 선다 · 선택은 그대로다', async () => {
    await open()
    await openCommentTab()
    const selected = shellStore().getState().selectedNodeIds

    focusGroup('n_b')

    expect(switcherName()).toBe('화면 상태: 관리자')
    expect(rings()).toEqual(['n_b'])
    expect(shellStore().getState().selectedNodeIds).toEqual(selected)
  })

  it('보이는 노드의 묶음에 포커스 — 상태를 안 바꾼다', async () => {
    await open()
    await openCommentTab()
    await pickStateFromHead('관리자')
    await waitFor(() => expect(switcherName()).toBe('화면 상태: 관리자'))

    focusGroup('n_a')

    expect(switcherName()).toBe('화면 상태: 관리자')
    expect(rings()).toEqual(['n_a'])
  })
})

describe('고름 — 숨었으면 보이는 상태로', () => {
  it('숨은 노드의 묶음을 누르면 그 노드가 보이는 상태로 바꾸고 링이 선다', async () => {
    await open()
    await openCommentTab()
    const selected = shellStore().getState().selectedNodeIds

    fireEvent.click(group('n_b'))

    await waitFor(() => expect(switcherName()).toBe('화면 상태: 관리자'))
    await waitFor(() => expect(rings()).toEqual(['n_b']))
    expect(shellStore().getState().selectedNodeIds).toEqual(selected)
  })

  it('보이는 노드의 묶음을 누르면 상태를 안 바꾼다', async () => {
    await open()
    await openCommentTab()
    await pickStateFromHead('관리자')
    await waitFor(() => expect(switcherName()).toBe('화면 상태: 관리자'))

    fireEvent.click(group('n_a'))

    expect(switcherName()).toBe('화면 상태: 관리자')
  })

  it('묶음 자체에 포커스가 선 채 Enter · Space — 그 사이 사람이 바꾼 상태를 다시 고른다', async () => {
    await open()
    await openCommentTab()
    focusGroup('n_b')
    expect(switcherName()).toBe('화면 상태: 관리자')

    // 묶음에서 친 키만 낸다 — 포커스를 다시 주면 그것이 고름이라 Enter · Space 를 못 가른다.
    for (const key of ['Enter', ' ']) {
      await pickStateFromHead('기본')
      await waitFor(() => expect(switcherName()).toBe('화면 상태: 기본'))
      fireEvent.keyDown(group('n_b'), { key })
      expect(switcherName()).toBe('화면 상태: 관리자')
    }
  })
})

describe('누름은 곧바로 고른다 — 두 번 누름 · 글을 고른 채여도', () => {
  /** 더블클릭 간격(500ms)보다 넉넉히 기다린다 — 늦게 서는 고름이 있으면 이 뒤에는 섰다. */
  const later = () => act(() => new Promise((resolve) => setTimeout(resolve, 700)))

  it('한 번 누름(`detail` 1)이 그 렌더에서 고르고, 곧이어 사람이 바꾼 상태를 뒤에 덮지 않는다', async () => {
    await open()
    await openCommentTab()

    fireEvent.click(group('n_b'), { detail: 1 })
    expect(switcherName()).toBe('화면 상태: 관리자')
    expect(rings()).toEqual(['n_b'])

    await pickStateFromHead('기본')
    await waitFor(() => expect(switcherName()).toBe('화면 상태: 기본'))
    await later()
    expect(switcherName()).toBe('화면 상태: 기본')
  })

  it('두 번 누름(`detail` 2) · 묶음 안에 글을 고른 채 누름도 고름이다', async () => {
    await open()
    await openCommentTab()
    const body = group('n_b').querySelector('.wb-shell-comment-body')
    if (body === null) throw new Error('본문이 없습니다')

    fireEvent.click(body, { detail: 2 })
    expect(switcherName()).toBe('화면 상태: 관리자')

    await pickStateFromHead('기본')
    await waitFor(() => expect(switcherName()).toBe('화면 상태: 기본'))
    const range = document.createRange()
    range.selectNodeContents(body)
    act(() => {
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
    })
    expect(window.getSelection()?.isCollapsed).toBe(false)
    fireEvent.click(body, { detail: 1 })
    expect(switcherName()).toBe('화면 상태: 관리자')
    act(() => window.getSelection()?.removeAllRanges())
  })
})

describe('묶음 안의 단추 · 글 상자 — 포커스가 들면 고르고, 그 단추의 누름은 다시 고르지 않는다', () => {
  it('«수정» · «삭제» 단추 · 고치는 상자에 포커스가 들면 고른다', async () => {
    await open()
    await openCommentTab()
    const edit = within(group('n_b')).getByRole('button', { name: '수정' })
    const remove = within(group('n_b')).getAllByRole('button', { name: '삭제' })[0]!

    act(() => edit.focus())
    expect(switcherName()).toBe('화면 상태: 관리자')

    await pickStateFromHead('기본')
    await waitFor(() => expect(switcherName()).toBe('화면 상태: 기본'))
    act(() => remove.focus())
    expect(switcherName()).toBe('화면 상태: 관리자')

    fireEvent.click(edit)
    const box = await within(group('n_b')).findByRole('textbox', { name: '코멘트 수정' })
    await pickStateFromHead('기본')
    await waitFor(() => expect(switcherName()).toBe('화면 상태: 기본'))
    act(() => box.focus())
    expect(switcherName()).toBe('화면 상태: 관리자')
  })

  it('포커스가 든 뒤 사람이 상태를 바꾸면, 그 안 단추 · 글 상자의 누름 · Enter 는 그 상태를 안 덮는다 · 묶음 자신의 누름은 다시 고른다', async () => {
    await open()
    await openCommentTab()
    const edit = within(group('n_b')).getByRole('button', { name: '수정' })
    act(() => edit.focus())
    expect(switcherName()).toBe('화면 상태: 관리자')
    await pickStateFromHead('기본')
    await waitFor(() => expect(switcherName()).toBe('화면 상태: 기본'))

    // jsdom 의 `fireEvent` 는 포커스를 안 옮긴다 — 포커스가 «수정» 에 선 채 그 단추를 누른 판이다.
    fireEvent.keyDown(edit, { key: 'Enter' })
    fireEvent.click(edit)
    const box = await within(group('n_b')).findByRole('textbox', { name: '코멘트 수정' })
    fireEvent.keyDown(box, { key: 'Enter' })
    fireEvent.click(box)
    expect(switcherName()).toBe('화면 상태: 기본')

    // 양성 대조 — 같은 판에서 묶음 자체를 누르면 다시 고른다.
    fireEvent.click(group('n_b'))
    expect(switcherName()).toBe('화면 상태: 관리자')
  })
})

describe('묶음 안에서는 노드 단축키가 안 선다', () => {
  const rootChildren = () =>
    shellStore()
      .getState()
      .document?.root.children?.map((child) => child.id) ?? []

  it('묶음 · 그 안 «수정» 단추에서 친 Delete · Cmd+D · ↓ · Escape 가 고른 노드를 안 바꾼다', async () => {
    await open()
    fireEvent.click(requireNode('n_a'))
    await waitFor(() => expect(shellStore().getState().selectedNodeIds).toEqual(['n_a']))
    await openCommentTab()

    const edit = within(group('n_b')).getByRole('button', { name: '수정' })
    for (const target of [group('n_b'), edit, group('n_z')]) {
      // jsdom 의 `navigator` 는 mac 이 아니라 복제는 Ctrl+D 다(`platformOf`) — 둘 다 친다.
      const keys = [
        { key: 'Delete' },
        { key: 'd', ctrlKey: true, code: 'KeyD' },
        { key: 'd', metaKey: true, code: 'KeyD' },
        { key: 'ArrowDown' },
        { key: 'Escape' },
      ]
      for (const key of keys) {
        fireEvent.keyDown(target, key)
      }
    }
    expect(shellStore().getState().selectedNodeIds).toEqual(['n_a'])
    expect(rootChildren()).toEqual(['n_a', 'n_b'])

    // 양성 대조 — 묶음 밖(문서 몸)에서 친 Delete 는 고른 노드를 지운다.
    fireEvent.keyDown(document.body, { key: 'Delete' })
    await waitFor(() => expect(rootChildren()).toEqual(['n_b']))
  })
})

describe('가리킬 자리가 없는 묶음 — 사라진 노드 · 문서를 못 읽음', () => {
  it('사라진 노드의 묶음 — Tab 정지점 · 머리 단추가 없고 누름도 아무것도 안 한다', async () => {
    await open()
    await openCommentTab()
    // 양성 대조 — 있는 노드의 묶음은 셋 다 있다.
    expect(group('n_a').getAttribute('tabindex')).toBe('0')
    expect(group('n_a').querySelector('.wb-shell-comment-group-pick')).not.toBeNull()

    expect(group('n_z').hasAttribute('tabindex')).toBe(false)
    expect(group('n_z').querySelector('.wb-shell-comment-group-pick')).toBeNull()
    fireEvent.click(group('n_z'))
    expect(rings()).toEqual([])
    expect(switcherName()).toBe('화면 상태: 기본')
  })

  it('문서를 못 읽은 묶음 — Tab 정지점 · 머리 단추가 없다', async () => {
    renderEditor({ apiOverrides: { listComments: async () => COMMENTS }, route: PAGE_ROUTE })
    await screen.findByRole('heading', { name: PROJECT_NAME })
    fireEvent.click(screen.getByRole('tab', { name: '코멘트' }))
    await waitFor(() => expect(document.querySelectorAll('.wb-shell-comment-group')).toHaveLength(3))

    for (const element of document.querySelectorAll('.wb-shell-comment-group')) {
      expect(element.hasAttribute('tabindex')).toBe(false)
      expect(element.querySelector('.wb-shell-comment-group-pick')).toBeNull()
    }
  })
})

describe('머리 단추 — 편집 모드에서 고르고 «컴포넌트» 탭으로', () => {
  it('누르면 그 노드를 고르고 «컴포넌트» 탭으로 가며, 숨었으면 보이는 상태로 바꾼다', async () => {
    await open()
    await openCommentTab()
    const pick = within(group('n_b')).getByRole('button', { name: '2 n_b' })
    act(() => pick.focus())

    fireEvent.click(pick)

    expect(shellStore().getState().selectedNodeIds).toEqual(['n_b'])
    expect(tabSelected('컴포넌트')).toBe('true')
    await waitFor(() => expect(switcherName()).toBe('화면 상태: 관리자'))
    await waitFor(() => expect(document.querySelector('[data-wb-selected-id="n_b"]')).not.toBeNull())
    expect(rings()).toEqual([])
  })

  it('남이 잡아 안 골라지면 탭을 안 옮긴다', async () => {
    await open()
    await openCommentTab()
    act(() => shellStore().setLocks([{ pageId: PAGE_ID, nodeId: 'n_b', userId: 'u-bora', userName: '보라' }]))
    const before = shellStore().getState().selectedNodeIds

    fireEvent.click(within(group('n_b')).getByRole('button', { name: '2 n_b' }))

    expect(shellStore().getState().selectedNodeIds).toEqual(before)
    expect(tabSelected('코멘트')).toBe('true')
  })
})

describe('뷰 모드', () => {
  it('머리 단추가 없고 묶음 누름이 링 · 상태 전환을 한다', async () => {
    await open()
    fireEvent.click(screen.getByRole('button', { name: '뷰 모드' }))
    await openCommentTab()

    expect(document.querySelectorAll('.wb-shell-comment-group-pick')).toHaveLength(0)
    fireEvent.click(group('n_b'))

    await waitFor(() => expect(switcherName()).toBe('화면 상태: 관리자'))
    await waitFor(() => expect(rings()).toEqual(['n_b']))
  })
})

describe('«컴포넌트» 탭의 «코멘트» 묶음에는 걸지 않는다', () => {
  it('고른 노드의 묶음 — Tab 정지점 · 머리 단추가 없다', async () => {
    await open()
    fireEvent.click(requireNode('n_a'))
    await waitFor(() => expect(document.querySelector('.wb-shell-comments [data-comment-node="n_a"]')).not.toBeNull())
    expect(tabSelected('컴포넌트')).toBe('true')

    expect(group('n_a').hasAttribute('tabindex')).toBe(false)
    expect(group('n_a').querySelector('.wb-shell-comment-group-pick')).toBeNull()
  })
})
