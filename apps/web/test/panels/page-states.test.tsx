/**
 * **«페이지 정보» 탭의 상태 목록**(`src/panels/page-states.tsx` · `src/panels/remove-state-dialog.tsx`) — 상태를 다루는 입구는 여기 하나다(메뉴
 * 트리의 상태 줄은 고르기만 한다 — `./state-rows.test.tsx`).
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 목록 | 트리 차례 · 깊이로 안 선다 · 설명이 이름 아래 안 선다 · 남이 더하거나 고친 상태가 다시 읽기 전에 안 선다 · 탭에서 더한 상태가 트리 상태 줄에 안 선다 |
 * | 항목 | `…` 여섯이 아니다 · 깊이 한도 · 형제 끝에서 켜져 있다 · viewer · 뷰 모드에 `…` · «상태 추가»가 선다 |
 * | 추가 · 이름 · 순서 | 규칙을 어긴 이름을 보낸다 · 더한 상태를 안 고른다 · 되돌리기 한 번에 안 빠진다 · 형제 밖으로 옮긴다 |
 * | 설명 | 쓴 설명이 문서에 안 선다 · 비우면 칸이 안 지워진다 · Escape · «취소»가 보낸다 · 그대로면 보낸다 |
 * | 삭제 확인 | 상자가 말한 집합(상태 · 지울 노드 · 걷을 보임 · 줄일 보임)이 보낸 묶음이 실제로 바꾼 것과 다르다 · 되돌리기 한 번에 안 돌아온다 ·
 *   연 뒤 바뀐 집합을 다시 안 세우거나 첫 누름에 보낸다 |
 *
 * 남의 편집은 스토어의 `applyRemoteChange`(실시간 프레임이 닿는 자리)로 싣고 가짜 서버의 문서에도 같이 얹는다(`server().remote`).
 */
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyOps, invertOps, walkNodes, type PageDocument, type PatchOp, type ViewState, type WbNode } from '@wirebound/schema'
import type { ApiClient } from '../../src/api/client'
import type { PageDetail, PatchResult, TreeMenuNode } from '../../src/api/types'
import { DESCRIBE_STATE_LABEL, SAVE_STATE_DESCRIPTION_LABEL, STATE_DESCRIPTION_LABEL, STATE_NAME_LABEL } from '../../src/panels/page-states'
import { REMOVE_STATE_TITLE, STATES_CHANGED, STATES_RECHECK } from '../../src/panels/remove-state-dialog'
import type { EditorStore } from '../../src/store/editor-store'
import { HEAD_SEQ, OTHER_PAGE_ID, OTHER_PAGE_TITLE, PAGE_ID, PROJECT_ID, openPage, pageDetail, pageDoc } from '../editor-harness'
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
  fireEvent.click(screen.getByRole('tab', { name: '페이지 정보' }))
  await waitFor(() => expect(tabStates()).not.toBeNull())
  return srv
}

/** 상태가 없는 페이지로 연다. */
async function openBare() {
  const srv = server({ ...doc(), viewStates: [] })
  await openPage(srv.held(), { apiOverrides: { ...srv.api, getTree: async () => tree() }, docs: { [OTHER_PAGE_ID]: otherDoc() } })
  fireEvent.click(screen.getByRole('tab', { name: '페이지 정보' }))
  await screen.findByText('이 페이지에는 화면 상태가 없습니다')
  return srv
}

/** 탭의 상태 목록 — 없으면(탭이 안 섰다 · 상태가 없다) `null`. */
function tabStates(): HTMLElement | null {
  return screen.queryByRole('tabpanel')?.querySelector<HTMLElement>('ul[aria-label="화면 상태"]') ?? null
}

/** 탭의 상태 줄 — 이름 · 깊이(들여쓰기 px) · 설명. */
function rows(): { name: string; indent: string; description: string | null }[] {
  const list = tabStates()
  if (list === null) return []
  return [...list.querySelectorAll<HTMLElement>(':scope > li')].map((row) => ({
    name: row.querySelector('.wb-shell-page-state-name')?.textContent ?? '',
    indent: row.style.paddingLeft,
    description: row.querySelector('.wb-shell-page-state-description')?.textContent ?? null,
  }))
}

/** 메뉴 트리의 그 페이지 상태 줄 이름. */
function treeStates(pageTitle: string): string[] {
  const list = document.body.querySelector<HTMLElement>(`ul[aria-label="${pageTitle} 화면 상태"]`)
  return list === null ? [] : [...list.querySelectorAll('[data-state-row]')].map((row) => row.textContent ?? '')
}

function switcherName(): string {
  return screen.getByRole('button', { name: /^화면 상태:/ }).getAttribute('aria-label') ?? ''
}

/** 상태 줄 `…` 를 열고 그 목록을 돌려준다(열린 채 둔다). */
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

function addState(): void {
  fireEvent.click(within(screen.getByRole('tabpanel')).getByRole('button', { name: '상태 추가' }))
}

function undo(): void {
  fireEvent.keyDown(document.body, { key: 'z', code: 'KeyZ', ctrlKey: true })
}

const ids = (document: PageDocument): string[] => [...walkNodes(document.root)].map(({ node }) => node.id)

describe('탭의 상태 목록', () => {
  it('트리 차례 · 깊이로 서고 설명이 이름 아래 선다', async () => {
    await open({ document: doc([LOGIN, { ...ADMIN, description: '운영자만\n보는 화면' }, GUEST]) })
    expect(rows()).toEqual([
      { name: '로그인', indent: '0px', description: null },
      { name: '관리자', indent: '12px', description: '운영자만\n보는 화면' },
      { name: '손님', indent: '0px', description: null },
    ])
  })

  it('남이 더하거나 설명을 고친 상태는 다시 읽기 전에 선다 — 열린 문서에서 짓는다', async () => {
    const srv = await open()
    srv.remote([{ op: 'add', path: '/viewStates/-', value: { id: 's_new', name: '새 상태', parent: 's_guest' } }])
    await waitFor(() => expect(rows().map((row) => [row.name, row.indent])).toContainEqual(['새 상태', '12px']))
    srv.remote([{ op: 'add', path: '/viewStates/0/description', value: '남이 쓴 설명' }])
    await waitFor(() => expect(rows()[0]).toEqual({ name: '로그인', indent: '0px', description: '남이 쓴 설명' }))
  })

  it('상태가 없는 페이지는 그렇다고 말하고 «상태 추가»가 선다', async () => {
    await openBare()
    expect(screen.getByText('이 페이지에는 화면 상태가 없습니다')).toBeTruthy()
    expect(within(screen.getByRole('tabpanel')).getByRole('button', { name: '상태 추가' })).toBeTruthy()
  })
})

describe('상태 줄 `…` · «상태 추가»', () => {
  it('항목 여섯 — 형제 끝에서 «위로» · «아래로»가 까닭과 함께 꺼진다', async () => {
    await open()
    expect(itemsOf(openStateMenu('로그인'))).toEqual([
      { label: '하위 상태 추가', why: null },
      { label: '이름 바꾸기', why: null },
      { label: DESCRIBE_STATE_LABEL, why: null },
      { label: '위로', why: '앞에 형제 상태가 있어야 합니다' },
      { label: '아래로', why: null },
      { label: '삭제', why: null },
    ])
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
  })

  it('깊이 한도(3)의 상태에서 «하위 상태 추가»가 까닭과 함께 꺼진다', async () => {
    const deep: ViewState = { id: 's_deep', name: '깊은', parent: 's_admin' }
    await open({ document: doc([LOGIN, ADMIN, GUEST, deep]) })
    expect(itemsOf(openStateMenu('깊은'))[0]).toEqual({ label: '하위 상태 추가', why: '상태는 3단계까지입니다' })
  })

  it('20개면 «상태 추가»가 까닭과 함께 꺼지고 누르면 입력이 안 열린다', async () => {
    const many = Array.from({ length: 20 }, (_, i): ViewState => ({ id: `s_${i}`, name: `상태 ${i}` }))
    await open({ document: doc(many) })
    const button = within(screen.getByRole('tabpanel')).getByRole('button', { name: '상태 추가' })
    expect(button.getAttribute('aria-disabled')).toBe('true')
    expect(button.getAttribute('aria-description')).toBe('상태는 20개까지입니다')
    addState()
    expect(screen.queryByRole('textbox', { name: STATE_NAME_LABEL })).toBeNull()
  })

  it('viewer 에게는 이름 · 설명만 서고 `…` · «상태 추가»가 없다', async () => {
    await open({ role: 'viewer', document: doc([LOGIN, { ...ADMIN, description: '운영자' }, GUEST]) })
    expect(rows().map((row) => [row.name, row.description])).toEqual([
      ['로그인', null],
      ['관리자', '운영자'],
      ['손님', null],
    ])
    expect(screen.queryByRole('button', { name: '상태 로그인 더 보기' })).toBeNull()
    expect(within(screen.getByRole('tabpanel')).queryByRole('button', { name: '상태 추가' })).toBeNull()
  })

  it('뷰 모드에서는 같은 탭이 읽기만 한다 — `…` · «상태 추가»가 없다', async () => {
    await open()
    // 판 카나리아 — 편집 모드에는 있다.
    expect(screen.getByRole('button', { name: '상태 로그인 더 보기' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '뷰 모드' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: '상태 로그인 더 보기' })).toBeNull())
    expect(rows()).toHaveLength(3)
    expect(within(screen.getByRole('tabpanel')).queryByRole('button', { name: '상태 추가' })).toBeNull()
  })
})

describe('상태 추가 · 이름 · 순서', () => {
  it('«상태 추가» — 겹친 이름은 보내지 않고 까닭을 말한다 · 더하면 그 상태를 고른다 · 트리 상태 줄에 곧바로 선다 · 되돌리기 한 번에 빠진다', async () => {
    const srv = await open()
    addState()
    typeName('손님')
    expect(within(screen.getByRole('tabpanel')).getByRole('status').textContent ?? '').toBe('같은 이름의 상태가 있습니다')
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
    expect(treeStates('회원 목록')).toEqual(['로그인', '관리자', '손님', '방문자'])

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
    await waitFor(() => expect(rows().map((row) => [row.name, row.indent])).toContainEqual(['손님 하위', '12px']))
  })

  it('이름 바꾸기 · 위로 — 편집 하나씩 · 형제 안에서만 옮긴다 · 트리 상태 줄도 따라간다', async () => {
    const srv = await open()
    chooseItem(openStateMenu('손님'), '이름 바꾸기')
    typeName('방문자')
    await waitFor(() => expect(srv.calls).toHaveLength(1))
    expect(srv.held().viewStates!.find((state) => state.id === 's_guest')!.name).toBe('방문자')

    chooseItem(openStateMenu('방문자'), '위로')
    await waitFor(() => expect(srv.calls).toHaveLength(2))
    // 형제(뿌리 상태) 안에서 로그인 앞으로 — 관리자는 로그인의 자식이라 그대로 그 아래다.
    await waitFor(() => expect(rows().map((row) => row.name)).toEqual(['방문자', '로그인', '관리자']))
    expect(srv.held().viewStates!.map((state) => state.id)).toEqual(['s_guest', 's_login', 's_admin'])
    expect(treeStates('회원 목록')).toEqual(['방문자', '로그인', '관리자'])
  })
})

describe('상태 설명', () => {
  function describeBox(): HTMLTextAreaElement {
    return screen.getByRole('textbox', { name: STATE_DESCRIPTION_LABEL }) as HTMLTextAreaElement
  }

  it('«설명 쓰기» — 쓴 설명이 그 상태에 선다 · 편집 하나 · 되돌리기 한 번에 빠진다', async () => {
    const srv = await open()
    chooseItem(openStateMenu('손님'), DESCRIBE_STATE_LABEL)
    fireEvent.change(describeBox(), { target: { value: '  로그인 안 한 사람\n둘째 줄 ' } })
    fireEvent.click(screen.getByRole('button', { name: SAVE_STATE_DESCRIPTION_LABEL }))
    await waitFor(() => expect(srv.calls).toHaveLength(1))
    expect(srv.held().viewStates![2]).toEqual({ ...GUEST, description: '로그인 안 한 사람\n둘째 줄' })
    await waitFor(() => expect(rows()[2]!.description).toBe('로그인 안 한 사람\n둘째 줄'))
    expect(screen.queryByRole('textbox', { name: STATE_DESCRIPTION_LABEL })).toBeNull()

    undo()
    await waitFor(() => expect(srv.calls).toHaveLength(2))
    expect(srv.held().viewStates![2]).toEqual(GUEST)
  })

  it('있는 설명으로 상자가 열리고, 비워 저장하면 칸을 지운다', async () => {
    const srv = await open({ document: doc([LOGIN, ADMIN, { ...GUEST, description: '옛 설명' }]) })
    chooseItem(openStateMenu('손님'), DESCRIBE_STATE_LABEL)
    expect(describeBox().value).toBe('옛 설명')
    fireEvent.change(describeBox(), { target: { value: ' \n ' } })
    fireEvent.click(screen.getByRole('button', { name: SAVE_STATE_DESCRIPTION_LABEL }))
    await waitFor(() => expect(srv.calls).toHaveLength(1))
    expect(srv.held().viewStates![2]).toEqual(GUEST)
    expect(srv.calls[0]!.some((op) => op.op === 'remove' && op.path === '/viewStates/2/description')).toBe(true)
  })

  it('Escape · «취소»는 보내지 않고 닫는다 · 그대로 저장해도 보내지 않는다', async () => {
    const srv = await open({ document: doc([LOGIN, ADMIN, { ...GUEST, description: '옛 설명' }]) })
    chooseItem(openStateMenu('손님'), DESCRIBE_STATE_LABEL)
    fireEvent.change(describeBox(), { target: { value: '버릴 글' } })
    fireEvent.keyDown(describeBox(), { key: 'Escape' })
    expect(screen.queryByRole('textbox', { name: STATE_DESCRIPTION_LABEL })).toBeNull()

    chooseItem(openStateMenu('손님'), DESCRIBE_STATE_LABEL)
    fireEvent.change(describeBox(), { target: { value: '또 버릴 글' } })
    fireEvent.click(screen.getByRole('button', { name: '취소' }))
    expect(screen.queryByRole('textbox', { name: STATE_DESCRIPTION_LABEL })).toBeNull()

    chooseItem(openStateMenu('손님'), DESCRIBE_STATE_LABEL)
    fireEvent.click(screen.getByRole('button', { name: SAVE_STATE_DESCRIPTION_LABEL }))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(srv.calls).toEqual([])
    expect(screen.queryByRole('textbox', { name: STATE_DESCRIPTION_LABEL })).toBeNull()
    expect(rows()[2]!.description).toBe('옛 설명')
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
    await waitFor(() =>
      expect(within(screen.getByRole('dialog', { name: REMOVE_STATE_TITLE })).getByRole('status').textContent).toBe(STATES_CHANGED),
    )
    expect(dialogShown()).toMatchObject({ removed: ['n-login'], button: STATES_RECHECK })

    confirm()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(srv.calls).toEqual([])
    expect(dialogShown().button).toBe('삭제')

    confirm()
    await waitFor(() => expect(srv.calls).toHaveLength(1))
    expect(ids(srv.held())).not.toContain('n-login')
  })
})
