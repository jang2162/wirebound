/**
 * **메뉴 트리의 상태 줄**(`src/panels/state-rows.tsx`) — 고르기만 한다. 상태를 다루는 입구(추가 · 이름 · 설명 · 순서 · 삭제)는 «페이지 정보» 탭이고
 * 그 케이스는 `./page-states.test.tsx` 가 갖는다.
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 차례 · 고르기 | 상태 줄이 트리 차례 · 깊이로 안 선다 · 누르면 그 상태가 안 골라진다 · 켜짐(`aria-current`)이 다른 줄에 선다 · 고르기가 편집을 낸다 |
 * | 다른 페이지 | 트리 응답의 상태로 안 선다 · 누르면 그 페이지를 `?state=` 로 연다 |
 * | 남의 상태 추가 | 열린 페이지에 남이 더한 상태가 트리를 다시 읽기 전에 안 선다 |
 * | 고르기만 | 상태 줄에 `…` 가 선다 · 페이지 줄 `…` 에 «상태 추가»가 선다 · viewer 의 고르기가 안 선다 · 상태 줄의 `Delete` 가 메뉴 트리의 삭제 확인을 건다 |
 *
 * 남의 편집은 스토어의 `applyRemoteChange`(실시간 프레임이 닿는 자리)로 싣고 가짜 서버의 문서에도 같이 얹는다(`server().remote`).
 */
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyOps, invertOps, type PageDocument, type PatchOp, type ViewState, type WbNode } from '@wirebound/schema'
import type { ApiClient } from '../../src/api/client'
import type { PageDetail, PatchResult, TreeMenuNode } from '../../src/api/types'
import type { EditorStore } from '../../src/store/editor-store'
import { HEAD_SEQ, OTHER_PAGE_ID, OTHER_PAGE_TITLE, PAGE_ID, PROJECT_ID, openPage, pageDetail, pageDoc } from '../editor-harness'
import { currentPath, currentSearch } from '../helpers'
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
afterEach(cleanup)

function shellStore(): EditorStore {
  const store = createdStores.at(-1)
  if (store === undefined) throw new Error('셸이 EditorStore를 만들지 않았습니다')
  return store as EditorStore
}

const LOGIN: ViewState = { id: 's_login', name: '로그인' }
const ADMIN: ViewState = { id: 's_admin', name: '관리자', parent: 's_login' }
const GUEST: ViewState = { id: 's_guest', name: '손님' }

const text = (id: string, content: string, visibility?: WbNode['visibility']): WbNode => ({
  id,
  type: 'Text',
  props: { content },
  ...(visibility === undefined ? {} : { visibility }),
})

/** 로그인 > 관리자 · 손님. 노드 넷 — 로그인에서만 · 관리자에서만 · 손님 빼고 · 로그인과 손님에서. */
function doc(viewStates: ViewState[] = [LOGIN, ADMIN, GUEST]): PageDocument {
  return {
    ...pageDoc({
      id: 'n-root',
      type: 'Page',
      children: [
        text('n-login', '로그인 글', { mode: 'only', states: ['s_login'] }),
        text('n-admin', '관리자 글', { mode: 'only', states: ['s_admin'] }),
        text('n-noguest', '손님 빼고', { mode: 'except', states: ['s_guest'] }),
        text('n-both', '둘 다', { mode: 'only', states: ['s_login', 's_guest'] }),
      ],
    }),
    viewStates,
  }
}

/** 하네스의 트리 — 둘째 페이지에 트리 응답의 상태 하나(«검토»)를 싣는다. */
function tree(otherStates: ViewState[] = [{ id: 's_review', name: '검토' }]): TreeMenuNode[] {
  return [
    {
      id: 'mn-1',
      title: '회원관리',
      sortOrder: 1,
      pages: [
        { id: PAGE_ID, title: '회원 목록', sortOrder: 1, viewStates: [LOGIN, ADMIN, GUEST] },
        { id: OTHER_PAGE_ID, title: OTHER_PAGE_TITLE, sortOrder: 2, viewStates: otherStates },
      ],
      children: [],
    },
  ]
}

/** 편집을 받아 문서에 얹는 가짜 서버(되돌리기의 역연산도 짓는다). `remote` 는 남의 편집 — 서버 문서에 얹고 스토어에 프레임으로 싣는다. */
function server(initial: PageDocument) {
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
      schemaVersion: 2,
      ...(body.clientOpId === undefined ? {} : { clientOpId: body.clientOpId }),
    }
    return result
  }
  const getPage: ApiClient['getPage'] = async (_projectId, pageId) => {
    const detail: PageDetail = { ...pageDetail(pageId, pageId === PAGE_ID ? held : otherDoc()), headSeq: seq }
    return detail
  }
  const remote = (ops: PatchOp[]): void => {
    held = applyOps(held, ops)
    seq += 1
    act(() => {
      shellStore().applyRemoteChange(PAGE_ID, { seq, ops, warnings: [] })
    })
  }
  return { calls, held: () => held, remote, api: { patchOps, getPage } satisfies Partial<ApiClient> }
}

function otherDoc(): PageDocument {
  return {
    ...pageDoc({ id: 'n-other', type: 'Page', children: [text('n-x', '검토 글', { mode: 'only', states: ['s_review'] })] }),
    viewStates: [{ id: 's_review', name: '검토' }],
  }
}

async function open(options: { role?: 'owner' | 'viewer'; document?: PageDocument } = {}) {
  const srv = server(options.document ?? doc())
  await openPage(srv.held(), {
    apiOverrides: {
      ...srv.api,
      getTree: async () => tree(),
      ...(options.role === 'viewer'
        ? {
            getProject: async () => ({
              id: PROJECT_ID,
              name: '관리자 콘솔 설계서',
              slug: 'admin-console',
              description: '',
              role: 'viewer' as const,
              themeRev: 0,
            }),
          }
        : {}),
    },
    docs: { [OTHER_PAGE_ID]: otherDoc() },
  })
  await waitFor(() => expect(stateList('회원 목록')).not.toBeNull())
  return srv
}

function stateList(pageTitle: string): HTMLElement | null {
  return document.body.querySelector<HTMLElement>(`ul[aria-label="${pageTitle} 화면 상태"]`)
}

/** 그 페이지의 상태 줄 — 이름 · 깊이(들여쓰기 px) · 켜짐. */
function stateRows(pageTitle: string): { name: string; indent: string; current: boolean }[] {
  const list = stateList(pageTitle)
  if (list === null) return []
  return [...list.querySelectorAll<HTMLElement>('[data-state-row]')].map((row) => {
    const link = row.querySelector<HTMLElement>('.wb-shell-tree-state')!
    return { name: link.textContent ?? '', indent: row.style.paddingLeft, current: link.getAttribute('aria-current') === 'true' }
  })
}

function stateLink(name: string): HTMLElement {
  return within(document.body.querySelector<HTMLElement>('.wb-shell-region[aria-label="메뉴·페이지 트리"]')!).getByRole('link', { name })
}

function switcherName(): string {
  return screen.getByRole('button', { name: /^화면 상태:/ }).getAttribute('aria-label') ?? ''
}

describe('상태 줄 — 차례 · 고르기', () => {
  it('트리 차례 · 깊이로 서고, 누르면 그 상태를 고른다 — 머리 전환기 · 켜짐 · 편집 0', async () => {
    const srv = await open()
    expect(stateRows('회원 목록')).toEqual([
      { name: '로그인', indent: '0px', current: false },
      { name: '관리자', indent: '12px', current: false },
      { name: '손님', indent: '0px', current: false },
    ])

    fireEvent.click(stateLink('관리자'))
    await waitFor(() => expect(switcherName()).toBe('화면 상태: 관리자'))
    expect(stateRows('회원 목록').map((row) => row.current)).toEqual([false, true, false])
    // 열린 페이지에서는 주소를 안 옮긴다(편집 모드의 주소는 페이지를 가리킨다).
    expect(`${currentPath()}${currentSearch()}`).toBe(`/projects/${PROJECT_ID}/pages/${PAGE_ID}`)
    expect(srv.calls).toEqual([])
  })

  it('다른 페이지의 상태 줄은 트리 응답에서 서고, 누르면 그 페이지를 `?state=` 로 연다', async () => {
    await open()
    expect(stateRows(OTHER_PAGE_TITLE)).toEqual([{ name: '검토', indent: '0px', current: false }])

    fireEvent.click(stateLink('검토'))
    await waitFor(() => expect(`${currentPath()}${currentSearch()}`).toBe(`/projects/${PROJECT_ID}/pages/${OTHER_PAGE_ID}?state=s_review`))
    await waitFor(() => expect(switcherName()).toBe('화면 상태: 검토'))
    expect(stateRows(OTHER_PAGE_TITLE)).toEqual([{ name: '검토', indent: '0px', current: true }])
  })

  it('열린 페이지에 남이 더한 상태는 트리를 다시 읽기 전에 선다 — 열린 문서에서 짓는다', async () => {
    const srv = await open()
    srv.remote([{ op: 'add', path: '/viewStates/-', value: { id: 's_new', name: '새 상태', parent: 's_guest' } }])
    await waitFor(() => expect(stateRows('회원 목록').map((row) => [row.name, row.indent])).toContainEqual(['새 상태', '12px']))
  })
})

describe('상태 줄은 고르기만 한다', () => {
  it('상태 줄에 `…` 가 없고 페이지 줄 `…` 에 «상태 추가»가 없다 — 관리 입구는 «페이지 정보» 탭이다', async () => {
    await open()
    // 판 카나리아 — 상태 줄은 섰다.
    expect(stateRows('회원 목록')).toHaveLength(3)
    expect(screen.queryByRole('button', { name: '상태 로그인 더 보기' })).toBeNull()
    expect(document.body.querySelectorAll('[data-state-row] button')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: '회원 목록 더 보기' }))
    const menu = screen.getByRole('menu')
    // 판 카나리아 — 줄 `…` 는 열렸다.
    expect(within(menu).getAllByRole('menuitem').length).toBeGreaterThan(0)
    expect(within(menu).queryByRole('menuitem', { name: '상태 추가' })).toBeNull()
    fireEvent.keyDown(menu, { key: 'Escape' })
  })

  it('viewer 에게도 상태 줄이 서고 고르기가 선다', async () => {
    await open({ role: 'viewer' })
    expect(stateRows('회원 목록').map((row) => row.name)).toEqual(['로그인', '관리자', '손님'])
    fireEvent.click(stateLink('손님'))
    await waitFor(() => expect(switcherName()).toBe('화면 상태: 손님'))
  })

  it('상태 줄에서 친 `Delete` 는 메뉴 트리의 삭제 확인을 걸지 않는다', async () => {
    const srv = await open()
    // 페이지 줄을 고른 채 상태 줄에 포커스를 둔다 — 안 거르면 `Delete` 가 고른 페이지의 삭제 확인을 건다.
    fireEvent.click(screen.getByRole('button', { name: '회원 목록 더 보기' }))
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    const link = stateLink('손님')
    link.focus()
    fireEvent.keyDown(link, { key: 'Delete' })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(screen.queryByRole('button', { name: '정말 삭제합니까?' })).toBeNull()
    expect(srv.calls).toEqual([])
  })
})
