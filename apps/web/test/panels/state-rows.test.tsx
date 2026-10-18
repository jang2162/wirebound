/**
 * **메뉴 트리의 상태 줄 · 상태 삭제 확인**(`src/panels/state-rows.tsx` · `src/panels/remove-state-dialog.tsx` — 설계 spec
 * `2026-10-18-modules-states-layout-design.md` 「C3」 · 계획 V3 Task 4 · Review Focus 4).
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 차례 · 고르기 | 상태 줄이 트리 차례 · 깊이로 안 선다 · 누르면 그 상태가 안 골라진다 · 켜짐(`aria-current`)이 다른 줄에 선다 · 고르기가 편집을 낸다 |
 * | 다른 페이지 | 트리 응답의 상태로 안 선다 · 누르면 그 페이지를 `?state=` 로 안 연다 |
 * | 남의 상태 추가 | 열린 페이지에 남이 더한 상태가 트리를 다시 읽기 전에 안 선다 |
 * | 항목 | `…` 다섯이 아니다 · 열리지 않은 페이지 · 깊이 한도에서 켜져 있다 · viewer · 뷰 모드에 `…` 가 선다 |
 * | 추가 · 이름 · 순서 | 규칙을 어긴 이름을 보낸다 · 더한 상태를 안 고른다 · 되돌리기 한 번에 안 빠진다 · 형제 밖으로 옮긴다 |
 * | 삭제 확인 | 상자가 말한 집합(상태 · 지울 노드 · 걷을 보임 · 줄일 보임)이 보낸 묶음이 실제로 바꾼 것과 다르다 · 되돌리기 한 번에 안 돌아온다 ·
 *   연 뒤 바뀐 집합을 다시 안 세우거나 첫 누름에 보낸다 · 상태 줄의 `Delete` 가 메뉴 트리의 삭제 확인을 건다 |
 *
 * 남의 편집은 스토어의 `applyRemoteChange`(실시간 프레임이 닿는 자리)로 싣고 가짜 서버의 문서에도 같이 얹는다(`server().remote`).
 */
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyOps, invertOps, walkNodes, type PageDocument, type PatchOp, type ViewState, type WbNode } from '@wirebound/schema'
import type { ApiClient } from '../../src/api/client'
import type { PageDetail, PatchResult, TreeMenuNode } from '../../src/api/types'
import { REMOVE_STATE_TITLE, STATES_CHANGED, STATES_RECHECK } from '../../src/panels/remove-state-dialog'
import { STATE_NAME_LABEL, STATE_PAGE_CLOSED_REASON } from '../../src/panels/state-rows'
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

/** 상태 줄 `…` 를 열고 항목 이름 · 끈 까닭을 읽는다(열린 채 둔다). */
function openStateMenu(name: string): HTMLElement {
  fireEvent.click(screen.getByRole('button', { name: `상태 ${name} 더 보기` }))
  return screen.getByRole('menu')
}

function itemsOf(menu: HTMLElement): { label: string; why: string | null }[] {
  return within(menu)
    .getAllByRole('menuitem')
    .map((item) => ({
      label: item.textContent ?? '',
      why: item.getAttribute('aria-disabled') === 'true' ? item.getAttribute('aria-description') : null,
    }))
}

function chooseItem(menu: HTMLElement, label: string): void {
  fireEvent.click(within(menu).getByRole('menuitem', { name: label }))
}

function typeName(value: string): void {
  const input = screen.getByRole('textbox', { name: STATE_NAME_LABEL })
  fireEvent.change(input, { target: { value } })
  fireEvent.keyDown(input, { key: 'Enter' })
}

function undo(): void {
  fireEvent.keyDown(document.body, { key: 'z', code: 'KeyZ', ctrlKey: true })
}

const ids = (document: PageDocument): string[] => [...walkNodes(document.root)].map(({ node }) => node.id)

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

describe('상태 줄 `…`', () => {
  it('항목 다섯 — 열린 페이지에서 켜지고, 열리지 않은 페이지는 까닭과 함께 꺼진다', async () => {
    await open()
    expect(itemsOf(openStateMenu('로그인'))).toEqual([
      { label: '하위 상태 추가', why: null },
      { label: '이름 바꾸기', why: null },
      { label: '위로', why: '앞에 형제 상태가 있어야 합니다' },
      { label: '아래로', why: null },
      { label: '삭제', why: null },
    ])
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
  })

  it('열리지 않은 페이지의 상태 줄 `…` 는 그 페이지를 연다 — 연 뒤에 켜진다', async () => {
    await open()
    openStateMenu('검토')
    // 여는 누름이 그 줄을 고른다 — 그 페이지를 `?state=` 로 연다.
    await waitFor(() => expect(`${currentPath()}${currentSearch()}`).toBe(`/projects/${PROJECT_ID}/pages/${OTHER_PAGE_ID}?state=s_review`))
    await waitFor(() =>
      expect(itemsOf(screen.getByRole('menu')).map((item) => item.why)).toEqual([null, null, expect.any(String), expect.any(String), null]),
    )
  })

  it('페이지 줄 `…` 의 «상태 추가» — 열린 페이지에서만 켜진다', async () => {
    await open()
    const itemOf = (pageTitle: string) => {
      fireEvent.click(screen.getByRole('button', { name: `${pageTitle} 더 보기` }))
      const item = within(screen.getByRole('menu')).getByRole('menuitem', { name: '상태 추가' })
      const why = item.getAttribute('aria-disabled') === 'true' ? item.getAttribute('aria-description') : null
      fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
      return why
    }
    expect(itemOf('회원 목록')).toBeNull()
    expect(itemOf(OTHER_PAGE_TITLE)).toBe(STATE_PAGE_CLOSED_REASON)
  })

  it('깊이 한도(3)의 상태에서 «하위 상태 추가»가 까닭과 함께 꺼진다', async () => {
    const deep: ViewState = { id: 's_deep', name: '깊은', parent: 's_admin' }
    await open({ document: doc([LOGIN, ADMIN, GUEST, deep]) })
    expect(itemsOf(openStateMenu('깊은'))[0]).toEqual({ label: '하위 상태 추가', why: '상태는 3단계까지입니다' })
  })

  it('viewer 에게는 상태 줄만 서고 `…` 가 없다 — 고르기는 선다', async () => {
    await open({ role: 'viewer' })
    expect(stateRows('회원 목록').map((row) => row.name)).toEqual(['로그인', '관리자', '손님'])
    expect(screen.queryByRole('button', { name: '상태 로그인 더 보기' })).toBeNull()
    fireEvent.click(stateLink('손님'))
    await waitFor(() => expect(switcherName()).toBe('화면 상태: 손님'))
  })

  it('뷰 모드에서는 `…` 가 없다', async () => {
    await open()
    fireEvent.click(screen.getByRole('button', { name: '뷰 모드' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: '상태 로그인 더 보기' })).toBeNull())
    expect(stateRows('회원 목록')).toHaveLength(3)
  })
})

describe('상태 추가 · 이름 · 순서', () => {
  it('«상태 추가» — 겹친 이름은 보내지 않고 까닭을 말한다 · 더하면 그 상태를 고른다 · 되돌리기 한 번에 빠진다', async () => {
    const srv = await open()
    fireEvent.click(screen.getByRole('button', { name: '회원 목록 더 보기' }))
    chooseItem(screen.getByRole('menu'), '상태 추가')
    typeName('손님')
    expect(screen.getByRole('status', { name: '' }).textContent ?? '').toBe('같은 이름의 상태가 있습니다')
    expect(srv.calls).toEqual([])

    typeName(' 방문자 ')
    await waitFor(() => expect(srv.calls).toHaveLength(1))
    expect(srv.held().viewStates!.map((state) => [state.name, state.parent])).toEqual([
      ['로그인', undefined],
      ['관리자', 's_login'],
      ['손님', undefined],
      ['방문자', undefined],
    ])
    await waitFor(() => expect(switcherName()).toBe('화면 상태: 방문자'))

    undo()
    await waitFor(() => expect(srv.calls).toHaveLength(2))
    expect(srv.held().viewStates).toEqual([LOGIN, ADMIN, GUEST])
  })

  it('«하위 상태 추가» — 그 상태의 자식으로 더한다', async () => {
    const srv = await open()
    chooseItem(openStateMenu('손님'), '하위 상태 추가')
    typeName('손님 하위')
    await waitFor(() => expect(srv.calls).toHaveLength(1))
    expect(srv.held().viewStates!.at(-1)).toMatchObject({ name: '손님 하위', parent: 's_guest' })
    await waitFor(() => expect(stateRows('회원 목록').map((row) => [row.name, row.indent])).toContainEqual(['손님 하위', '12px']))
  })

  it('이름 바꾸기 · 위로 — 편집 하나씩 · 형제 안에서만 옮긴다', async () => {
    const srv = await open()
    chooseItem(openStateMenu('손님'), '이름 바꾸기')
    typeName('방문자')
    await waitFor(() => expect(srv.calls).toHaveLength(1))
    expect(srv.held().viewStates!.find((state) => state.id === 's_guest')!.name).toBe('방문자')

    chooseItem(openStateMenu('방문자'), '위로')
    await waitFor(() => expect(srv.calls).toHaveLength(2))
    // 형제(뿌리 상태) 안에서 로그인 앞으로 — 관리자는 로그인의 자식이라 그대로 그 아래다.
    await waitFor(() => expect(stateRows('회원 목록').map((row) => row.name)).toEqual(['방문자', '로그인', '관리자']))
    expect(srv.held().viewStates!.map((state) => state.id)).toEqual(['s_guest', 's_login', 's_admin'])
  })
})

describe('상태 삭제 확인', () => {
  /** 상자가 보인 것 — 문장 둘 · 함께 지워지는 노드의 id. */
  function dialogShown(): { sentences: string[]; removed: string[]; button: string } {
    const dialog = screen.getByRole('dialog', { name: REMOVE_STATE_TITLE })
    return {
      sentences: [...dialog.querySelectorAll('.wb-shell-view-states-sentence')].map((p) => p.textContent ?? ''),
      removed: [...dialog.querySelectorAll('[data-node-id]')].map((li) => li.getAttribute('data-node-id') ?? ''),
      button: within(dialog).getAllByRole('button').at(-1)!.textContent ?? '',
    }
  }
  const confirm = (): void => {
    const dialog = screen.getByRole('dialog', { name: REMOVE_STATE_TITLE })
    fireEvent.click(within(dialog).getAllByRole('button').at(-1)!, { detail: 1 })
  }

  it('상태 · 하위 상태 · 보임이 걸린 노드 셋을 말하고, 보낸 묶음이 바꾼 것이 상자가 말한 것과 같다 · 되돌리기 한 번에 돌아온다', async () => {
    const srv = await open()
    const before = srv.held()
    chooseItem(openStateMenu('로그인'), '삭제')

    expect(dialogShown()).toEqual({
      sentences: [
        '"로그인" 상태와 하위 상태 1개(관리자)를 지웁니다.',
        '노드 2개가 함께 삭제됩니다 · 노드 1개는 남은 상태에서만 보임이 유지됩니다.',
      ],
      removed: ['n-login', 'n-admin'],
      button: '삭제',
    })

    confirm()
    await waitFor(() => expect(srv.calls).toHaveLength(1))
    const after = srv.held()
    // **상자가 말한 것 = 묶음이 바꾼 것**(Review Focus 4) — 사라진 노드 · 사라진 상태 · 보임이 바뀐 노드를 앞뒤 문서로 센다.
    expect(ids(before).filter((id) => !ids(after).includes(id))).toEqual(['n-login', 'n-admin'])
    expect(after.viewStates).toEqual([GUEST])
    const changed = [...walkNodes(after.root)]
      .filter(
        ({ node }) =>
          JSON.stringify(node.visibility) !==
          JSON.stringify([...walkNodes(before.root)].find((v) => v.node.id === node.id)!.node.visibility),
      )
      .map(({ node }) => [node.id, node.visibility])
    expect(changed).toEqual([['n-both', { mode: 'only', states: ['s_guest'] }]])
    expect(screen.queryByRole('dialog', { name: REMOVE_STATE_TITLE })).toBeNull()

    undo()
    await waitFor(() => expect(srv.calls).toHaveLength(2))
    expect(srv.held()).toEqual(before)
  })

  it('`except` 가 비는 노드는 보임을 걷는다고 말하고 걷는다', async () => {
    const srv = await open()
    chooseItem(openStateMenu('손님'), '삭제')
    expect(dialogShown().sentences).toEqual([
      '"손님" 상태를 지웁니다.',
      '노드 1개는 모든 상태에서 보이게 됩니다 · 노드 1개는 남은 상태에서만 보임이 유지됩니다.',
    ])
    confirm()
    await waitFor(() => expect(srv.calls).toHaveLength(1))
    const node = (id: string) => [...walkNodes(srv.held().root)].find((visit) => visit.node.id === id)!.node
    expect(node('n-noguest').visibility).toBeUndefined()
    expect(node('n-both').visibility).toEqual({ mode: 'only', states: ['s_login'] })
  })

  it('연 뒤 남이 그 상태에 보임을 걸면 새 집합으로 다시 서고, 첫 누름은 안 보낸다 — 둘째 누름이 지금 집합을 지운다', async () => {
    const srv = await open()
    chooseItem(openStateMenu('손님'), '삭제')
    expect(dialogShown().removed).toEqual([])

    // 남이 «로그인 글»을 손님에서만 보이게 바꾼다 — 지우면 그 노드가 함께 지워진다.
    srv.remote([{ op: 'replace', path: '/root/children/0/visibility', value: { mode: 'only', states: ['s_guest'] } }])
    await waitFor(() => expect(screen.getByRole('status', { name: '' }).textContent).toBe(STATES_CHANGED))
    expect(dialogShown()).toMatchObject({ removed: ['n-login'], button: STATES_RECHECK })

    confirm()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(srv.calls).toEqual([])
    expect(dialogShown().button).toBe('삭제')

    confirm()
    await waitFor(() => expect(srv.calls).toHaveLength(1))
    expect(ids(srv.held())).not.toContain('n-login')
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
