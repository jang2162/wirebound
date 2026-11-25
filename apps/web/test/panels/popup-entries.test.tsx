/**
 * **팝업 페이지의 에디터 입구** — 상호작용 탭(«팝업 닫기» · 페이지 고르개) · 페이지 정보 «종류» · 메뉴 트리 줄의 «팝업» 표지. 메뉴 줄 `+` 의
 * «팝업 페이지 추가» 는 `menu-crud.test.tsx` 가 잰다. 덮개 위에 띄우는 것은 `canvas/interaction-runtime.test.tsx` 가 잰다.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { PageDocument, PatchOp } from '@wirebound/schema'
import type { ApiClient } from '../../src/api/client'
import type { PatchResult, TreeMenuNode } from '../../src/api/types'
import { openPage, OTHER_PAGE_ID, PAGE_ID, pageDoc } from '../editor-harness'
import '../../src/catalog-setup'
import { structureRowName } from './tree-row'

/** 팝업 페이지 둘(`회원관리/회원 상세` · `회원관리/사용자 검색`)과 화면 페이지 하나가 든 트리 — 고르개의 차례를 잰다. */
const TREE: TreeMenuNode[] = [
  {
    id: 'mn-1',
    title: '회원관리',
    sortOrder: 1,
    pages: [
      { id: PAGE_ID, title: '회원 목록', sortOrder: 1, kind: 'page' },
      { id: OTHER_PAGE_ID, title: '회원 상세', sortOrder: 2, kind: 'popup' },
      { id: 'pg-3', title: '사용자 검색', sortOrder: 3, kind: 'popup' },
    ],
    children: [],
  },
]

const DOC = pageDoc({ id: 'n-root', type: 'Page', children: [{ id: 'n-btn', type: 'Button', props: { label: '열기' } }] })

function editable(): { calls: { ops: PatchOp[] }[]; api: Partial<ApiClient> } {
  const calls: { ops: PatchOp[] }[] = []
  let seq = 7
  const patchOps: ApiClient['patchOps'] = async (_projectId, _pageId, body) => {
    calls.push({ ops: body.ops })
    seq += 1
    const result: PatchResult = {
      seq,
      revisionId: `rev-${seq}`,
      inverse: [],
      schemaVersion: 5,
      ...(body.clientOpId === undefined ? {} : { clientOpId: body.clientOpId }),
    }
    return result
  }
  return { calls, api: { patchOps, getTree: async () => TREE } }
}

async function openTab(name: string): Promise<void> {
  fireEvent.click(screen.getByRole('tab', { name }))
  await waitFor(() => expect(screen.getByRole('tab', { name }).getAttribute('aria-selected')).toBe('true'))
}

function selectNode(type: string): void {
  const list = document.body.querySelector('.wb-shell-structure-list')
  if (list === null) throw new Error('구조 트리 목록이 없습니다')
  fireEvent.click(within(list as HTMLElement).getByRole('button', { name: structureRowName(type) }))
}

/** 버튼에 규칙 하나 · 액션 하나를 걸고 그 액션의 종류를 고른다 — 나간 편집을 기다린다. */
async function actionOfType(calls: { ops: PatchOp[] }[], label: string): Promise<HTMLElement> {
  fireEvent.click(screen.getByRole('button', { name: '상호작용 추가' }))
  await waitFor(() => expect(calls).toHaveLength(1))
  fireEvent.click(screen.getByRole('button', { name: '규칙 1에 액션 추가' }))
  await waitFor(() => expect(calls).toHaveLength(2))
  const group = screen.getByRole('group', { name: '액션 1' })
  fireEvent.change(within(group).getByLabelText('종류'), { target: { value: label } })
  await waitFor(() => expect(calls).toHaveLength(3))
  return screen.getByRole('group', { name: '액션 1' })
}

describe('상호작용 탭 — 팝업 열기 · 닫기', () => {
  it('«팝업 닫기» 는 대상이 없다 — 대상 칸 · 페이지 칸이 서지 않고 { type: closeModal } 이 나간다', async () => {
    const { calls, api } = editable()
    await openPage(DOC, { apiOverrides: api })
    await openTab('상호작용')
    selectNode('Button')

    const group = await actionOfType(calls, 'closeModal')

    expect(calls[2]!.ops).toEqual([
      { op: 'replace', path: '/root/children/0/interactions', value: [{ on: 'click', actions: [{ type: 'closeModal' }] }] },
    ])
    expect(within(group).queryByLabelText('대상')).toBeNull()
    expect(within(group).queryByLabelText('페이지')).toBeNull()
    expect(within(group).queryByLabelText('페이지 경로')).toBeNull()
  })

  it('페이지 고르개는 팝업 페이지를 먼저 · 화면 페이지를 뒤에 보이고, 고르면 그 대상 글자가 나간다', async () => {
    const { calls, api } = editable()
    await openPage(DOC, { apiOverrides: api })
    await openTab('상호작용')
    selectNode('Button')

    const group = await actionOfType(calls, 'openModal')
    const picker = within(group).getByLabelText('페이지') as HTMLSelectElement
    await waitFor(() => expect(picker.querySelectorAll('option').length).toBe(4))
    expect(
      [...picker.querySelectorAll('optgroup')].map((optgroup) => [
        optgroup.label,
        [...optgroup.querySelectorAll('option')].map((o) => o.textContent),
      ]),
    ).toEqual([
      ['팝업 페이지', ['회원관리 / 회원 상세', '회원관리 / 사용자 검색']],
      ['화면 페이지', ['회원관리 / 회원 목록']],
    ])

    fireEvent.change(picker, { target: { value: 'page:회원관리/사용자 검색' } })

    await waitFor(() => expect(calls).toHaveLength(4))
    expect(calls[3]!.ops).toEqual([
      {
        op: 'replace',
        path: '/root/children/0/interactions',
        value: [{ on: 'click', actions: [{ type: 'openModal', target: 'page:회원관리/사용자 검색' }] }],
      },
    ])
    // 직접 적는 칸이 고른 글자를 그대로 보인다.
    expect((within(group).getByLabelText('페이지 경로') as HTMLInputElement).value).toBe('page:회원관리/사용자 검색')
  })
})

describe('페이지 정보 «종류»', () => {
  it('화면 → 팝업: 레이아웃 · 뿌리 타입 · 제목(페이지 이름)을 바꾸는 묶음 하나 — 앞에 뿌리 타입 · 레이아웃의 test', async () => {
    const { calls, api } = editable()
    await openPage(DOC, { apiOverrides: api })
    await openTab('페이지 정보')

    const group = await screen.findByRole('radiogroup', { name: '종류' })
    expect(within(group).getByRole('radio', { name: '화면' }).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(within(group).getByRole('radio', { name: '팝업' }))

    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]!.ops).toEqual([
      { op: 'test', path: '/root/type', value: 'Page' },
      { op: 'test', path: '/layout', value: 'blank' },
      { op: 'add', path: '/layout', value: 'popup' },
      { op: 'replace', path: '/root/type', value: 'Popup' },
      { op: 'add', path: '/root/props', value: { title: '회원 목록' } },
    ])
    await waitFor(() => expect(within(group).getByRole('radio', { name: '팝업' }).getAttribute('aria-checked')).toBe('true'))
  })

  it('팝업 → 화면: 바닥 노드를 몸통 끝으로 옮기고(지우지 않는다) 바닥 · props 를 걷는다', async () => {
    const popup: PageDocument = pageDoc({
      id: 'n-root',
      type: 'Popup',
      props: { title: '회원 목록' },
      children: [{ id: 'n-text', type: 'Text' }],
      zones: {
        footer: [
          { id: 'n-cancel', type: 'Button', props: { label: '취소' } },
          { id: 'n-save', type: 'Button', props: { label: '저장' } },
        ],
      },
    })
    const { calls, api } = editable()
    await openPage(popup, { apiOverrides: api })
    await openTab('페이지 정보')

    fireEvent.click(within(await screen.findByRole('radiogroup', { name: '종류' })).getByRole('radio', { name: '화면' }))

    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]!.ops).toEqual([
      { op: 'test', path: '/root/type', value: 'Popup' },
      { op: 'test', path: '/layout', value: 'popup' },
      { op: 'add', path: '/layout', value: 'blank' },
      { op: 'move', from: '/root/zones/footer/0', path: '/root/children/-' },
      { op: 'move', from: '/root/zones/footer/0', path: '/root/children/-' },
      { op: 'remove', path: '/root/zones' },
      { op: 'remove', path: '/root/props' },
      { op: 'replace', path: '/root/type', value: 'Page' },
    ])
  })
})

describe('메뉴 트리 — 팝업 표지', () => {
  it('팝업 페이지 줄은 이름 뒤에 « — 팝업» 을 읽는다 · 화면 페이지 줄은 그대로다', async () => {
    await openPage(DOC, { apiOverrides: { getTree: async () => TREE } })
    const tree = screen.getByRole('region', { name: '메뉴·페이지 트리' })
    await waitFor(() => expect(within(tree).getByRole('link', { name: '회원 상세 — 팝업' })).toBeDefined())
    expect(within(tree).getByRole('link', { name: '사용자 검색 — 팝업' })).toBeDefined()
    expect(within(tree).getByRole('link', { name: '회원 목록' })).toBeDefined()
  })

  it('열린 페이지는 열린 문서의 뿌리로 읽는다 — 트리 응답이 화면이라 해도', async () => {
    const tree: TreeMenuNode[] = [{ ...TREE[0]!, pages: [{ id: PAGE_ID, title: '회원 목록', sortOrder: 1, kind: 'page' }] }]
    await openPage(pageDoc({ id: 'n-root', type: 'Popup', props: { title: '회원 목록' } }), { apiOverrides: { getTree: async () => tree } })
    const region = screen.getByRole('region', { name: '메뉴·페이지 트리' })
    await waitFor(() => expect(within(region).getByRole('link', { name: '회원 목록 — 팝업' })).toBeDefined())
  })
})
