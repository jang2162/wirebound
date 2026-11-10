/**
 * **하단 판의 «컴포넌트 | 모듈» 위층 탭과 «모듈» 탭**(`src/palette/component-palette.tsx` · `src/palette/module-tab.tsx`).
 *
 * 셸을 라우트째 띄워 판을 토글로 열고 그 스토어에 드라이버를 붙인다(`palette-cards.test.tsx` 와 같은 꼴). 자리 규칙 · 거름의 표는
 * `../edit/module-insert.test.ts` 가 문서로 잰다 — 여기서 재는 것은 탭 · 묶음 · 넣기 · 복사의 화면 흐름(편집 하나 · 고름 · 거절 문장 · 지워진 모듈)과
 * 역할 · 모드마다 서는 단추다. 끌어 놓기 · 넣을 수 없는 판의 끌기 · 새로고침 뒤의 기억은 실브라우저 판(`build-test/module-tab.test.ts`).
 *
 * **`vi.mock`은 이 파일에 있어야 한다** — 호이스팅이 그것이 적힌 파일에서만 일어난다(`editor-harness.tsx` 머리말).
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { actionTarget, applyOps, invertOps, type PageDocument, type PatchOp, type WbNode } from '@wirebound/schema'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type ApiClient } from '../../src/api/client'
import type { PatchResult, PersonalModule, ProjectModule } from '../../src/api/types'
import { PALETTE_VIEW_KEY } from '../../src/palette/component-palette'
import { FIRST_ROW_ASK_CONFIRM, FIRST_ROW_ASK_TITLE } from '../../src/edit/first-row-ask'
import { MODULE_GONE_NOTICE, NO_PERSONAL_MODULES, NO_PROJECT_MODULES, copiedNotice } from '../../src/palette/module-tab'
import { lockedNotice } from '../../src/panels/property-panel'
import { EditorStore } from '../../src/store/editor-store'
import { HEAD_SEQ, PAGE_ID, PROJECT_ID, openPage, pageDoc } from '../editor-harness'
import { adminThemeView } from '../theme-loader'

const createdStores: EditorStore[] = []

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

function shellStore(): EditorStore {
  const store = createdStores.at(-1)
  if (store === undefined) throw new Error('셸이 EditorStore를 만들지 않았습니다')
  return store as EditorStore
}

/**
 * ```
 * n-root (Page)
 * ├ n-text (Text)
 * └ n-box  (Card)
 *    └ n-in (Text)
 * ```
 */
const DOC: PageDocument = pageDoc({
  id: 'n-root',
  type: 'Page',
  children: [
    { id: 'n-text', type: 'Text', props: { content: '글' } },
    { id: 'n-box', type: 'Card', children: [{ id: 'n-in', type: 'Text' }] },
  ],
})

/** 프로젝트 모듈 하나 — 버튼 둘(앞 버튼이 뒤 버튼을 숨긴다 — 묶음 안 대상). */
function projectModule(id: string, name: string): ProjectModule {
  const nodes: WbNode[] = [
    {
      id: 'm_open',
      type: 'Button',
      props: { label: '열기' },
      interactions: [{ on: 'click', actions: [{ type: 'setVisible', target: 'm_close', value: false }] }],
    },
    { id: 'm_close', type: 'Button', props: { label: '닫기' } },
  ]
  return { id, name, nodes, nodeCount: 2, createdBy: 'u-1', createdAt: '2026-10-19T00:00:00.000Z', updatedAt: '2026-10-19T00:00:00.000Z' }
}

/** 개인 모듈 하나 — 카드 하나와 그 안의 글(자손까지 노드 둘). */
function personalModule(id: string, name: string): PersonalModule {
  const nodes: WbNode[] = [{ id: 'p_card', type: 'Card', children: [{ id: 'p_text', type: 'Text', props: { content: '안' } }] }]
  return { id, name, nodes, nodeCount: 2, createdBy: 'u-me', createdAt: '2026-10-20T00:00:00.000Z', updatedAt: '2026-10-20T00:00:00.000Z' }
}

interface Server {
  sent: PatchOp[][]
  held: () => PageDocument
  calls: {
    list: number
    mine: number
    get: string[]
    getMine: string[]
    created: { name: string; nodes: WbNode[] }[]
    createdMine: { name: string; nodes: WbNode[] }[]
    renamedMine: string[]
    deletedMine: string[]
  }
  modules: ProjectModule[]
  personal: PersonalModule[]
  api: Partial<ApiClient>
  /** 연 문서 — 대역이 처음 든 문서와 같다. */
  start: PageDocument
}

/** 편집을 받아 문서를 진행시키고 모듈 목록 · 하나를 내는 대역. */
function server(initial: ProjectModule[] = [], mine: PersonalModule[] = [], start: PageDocument = DOC): Server {
  const sent: PatchOp[][] = []
  const calls: Server['calls'] = { list: 0, mine: 0, get: [], getMine: [], created: [], createdMine: [], renamedMine: [], deletedMine: [] }
  const modules = [...initial]
  const personal = [...mine]
  let held = start
  let seq = HEAD_SEQ
  const patchOps: ApiClient['patchOps'] = async (_projectId, _pageId, body) => {
    sent.push(body.ops)
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
  const gone = (): never => {
    throw new ApiError(404, 'not-found', '모듈을 찾을 수 없습니다')
  }
  const api: Partial<ApiClient> = {
    patchOps,
    listModules: async () => {
      calls.list += 1
      return [...modules]
    },
    getModule: async (_projectId, moduleId) => {
      calls.get.push(moduleId)
      return modules.find((entry) => entry.id === moduleId) ?? gone()
    },
    createModule: async (_projectId, body) => {
      calls.created.push(body)
      const made = { ...projectModule(`m-copy-${calls.created.length}`, body.name), nodes: body.nodes }
      modules.unshift(made)
      return made
    },
    listMyModules: async () => {
      calls.mine += 1
      return [...personal]
    },
    getMyModule: async (moduleId) => {
      calls.getMine.push(moduleId)
      return personal.find((entry) => entry.id === moduleId) ?? gone()
    },
    createMyModule: async (body) => {
      calls.createdMine.push(body)
      const made = { ...personalModule(`p-copy-${calls.createdMine.length}`, body.name), nodes: body.nodes }
      personal.unshift(made)
      return made
    },
    renameMyModule: async (moduleId, body) => {
      calls.renamedMine.push(`${moduleId}:${body.name}`)
      const found = personal.find((entry) => entry.id === moduleId) ?? gone()
      found.name = body.name
      return found
    },
    deleteMyModule: async (moduleId) => {
      calls.deletedMine.push(moduleId)
      const at = personal.findIndex((entry) => entry.id === moduleId)
      if (at < 0) gone()
      personal.splice(at, 1)
    },
    getProjectTheme: async () => adminThemeView(),
  }
  return { sent, held: () => held, calls, modules, personal, api, start }
}

/** 가짜가 내는 프로젝트 — 역할만 바꾼다(`editor-harness.tsx` 의 `PROJECT` 와 같은 값). */
function asRole(role: 'owner' | 'viewer'): Partial<ApiClient> {
  return {
    getProject: async () => ({
      id: PROJECT_ID,
      name: '관리자 콘솔 설계서',
      slug: 'admin-console',
      description: '내부 운영 도구',
      role,
      themeRev: 0,
    }),
  }
}

async function openWithPalette(fake: Server, role: 'owner' | 'viewer' = 'owner'): Promise<void> {
  await openPage(fake.start, { apiOverrides: { ...fake.api, ...(role === 'viewer' ? asRole('viewer') : {}) } })
  fireEvent.click(within(footer()).getByRole('button', { name: role === 'viewer' ? '모듈' : '컴포넌트' }))
}

function footer(): HTMLElement {
  return screen.getByRole('contentinfo', { name: '하단 바' })
}

/** 판 — 넣을 수 있으면 «컴포넌트 목록», 없으면 «모듈 목록»(`paletteNames`). */
function palette(): HTMLElement {
  return screen.queryByRole('region', { name: '컴포넌트 목록' }) ?? screen.getByRole('region', { name: '모듈 목록' })
}

/** 카드 단추의 접근 이름 전부 — 묶음 하나에서. */
function buttonsIn(name: string): string[] {
  return within(group(name))
    .queryAllByRole('button')
    .map((button) => button.getAttribute('aria-label') ?? '')
}

function infoNotice(): string {
  return footer().querySelector('.wb-shell-info-notice')?.textContent ?? ''
}

function viewTabs(): HTMLElement[] {
  return within(within(palette()).getByRole('tablist', { name: '목록 종류' })).getAllByRole('tab')
}

async function openModules(): Promise<void> {
  fireEvent.click(within(within(palette()).getByRole('tablist', { name: '목록 종류' })).getByRole('tab', { name: '모듈' }))
  await act(async () => {})
}

function group(name: string): HTMLElement {
  return within(palette()).getByRole('region', { name })
}

function notice(): string {
  return palette().querySelector('[data-wb-palette-notice]')?.textContent ?? ''
}

async function select(nodeId: string | null): Promise<void> {
  await act(async () => shellStore().selectNode(nodeId))
}

async function insert(name: string): Promise<void> {
  fireEvent.click(within(palette()).getByRole('button', { name: `${name} 넣기` }))
  await act(async () => {})
  await act(async () => {})
}

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('위층 탭', () => {
  it('«컴포넌트 | 모듈» 둘이고 처음은 «컴포넌트» — 갈래 탭은 컴포넌트 쪽에만 선다', async () => {
    await openWithPalette(server())
    expect(viewTabs().map((tab) => [tab.textContent, tab.getAttribute('aria-selected')])).toEqual([
      ['컴포넌트', 'true'],
      ['모듈', 'false'],
    ])
    expect(within(palette()).queryByRole('tablist', { name: '갈래' })).not.toBeNull()
    await openModules()
    expect(within(palette()).queryByRole('tablist', { name: '갈래' })).toBeNull()
    expect(within(palette()).getByRole('searchbox', { name: '모듈 찾기' })).not.toBeNull()
  })

  it('고른 탭을 저장소에 적는다 · 적힌 탭으로 선다', async () => {
    await openWithPalette(server())
    await openModules()
    expect(localStorage.getItem(PALETTE_VIEW_KEY)).toBe('modules')
  })

  it('저장소에 «modules» 가 있으면 «모듈» 탭으로 선다', async () => {
    localStorage.setItem(PALETTE_VIEW_KEY, 'modules')
    await openWithPalette(server())
    expect(viewTabs().map((tab) => tab.getAttribute('aria-selected'))).toEqual(['false', 'true'])
  })

  it('저장소가 던지면(읽기 · 쓰기) «컴포넌트» 로 서고 탭은 바뀐다', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('막힌 저장소')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('막힌 저장소')
    })
    await openWithPalette(server())
    expect(viewTabs().map((tab) => tab.getAttribute('aria-selected'))).toEqual(['true', 'false'])
    await openModules()
    expect(viewTabs().map((tab) => tab.getAttribute('aria-selected'))).toEqual(['false', 'true'])
  })
})

describe('묶음 둘', () => {
  it('개인 모듈 · 프로젝트 모듈 — 차례대로 · 탭을 열 때 두 목록을 읽는다 · 내장 묶음은 없다', async () => {
    const fake = server([projectModule('m-1', '저장 묶음')], [personalModule('p-1', '내 카드')])
    await openWithPalette(fake)
    await openModules()
    const groups = [...palette().querySelectorAll('section[aria-label]')].map((element) => element.getAttribute('aria-label'))
    expect(groups).toEqual(['개인 모듈', '프로젝트 모듈'])
    expect([fake.calls.mine, fake.calls.list]).toEqual([1, 1])
    expect(within(group('개인 모듈')).getByText('내 카드')).not.toBeNull()
    expect(within(group('개인 모듈')).getByText('노드 2개')).not.toBeNull()
    expect(within(group('프로젝트 모듈')).getByText('저장 묶음')).not.toBeNull()
  })

  it('개인 · 프로젝트 모듈이 없으면 묶음마다 «모듈로 저장» 안내 한 줄', async () => {
    await openWithPalette(server())
    await openModules()
    expect(within(group('개인 모듈')).getByText(NO_PERSONAL_MODULES)).not.toBeNull()
    expect(within(group('프로젝트 모듈')).getByText(NO_PROJECT_MODULES)).not.toBeNull()
    expect(NO_PERSONAL_MODULES).toBe("구조 트리에서 노드를 골라 '모듈로 저장'에서 '개인 모듈'을 고르면 여기에 섭니다")
  })

  it('검색이 이름으로 묶음 둘을 함께 거른다 — 컴포넌트 탭의 검색어와 따로다', async () => {
    await openWithPalette(server([projectModule('m-1', '저장 묶음')], [personalModule('p-1', '내 묶음 상세')]))
    fireEvent.change(within(palette()).getByRole('searchbox', { name: '컴포넌트 찾기' }), { target: { value: '버튼' } })
    await openModules()
    expect(within(palette()).getByRole('searchbox', { name: '모듈 찾기' })).toHaveProperty('value', '')
    const named = (): string[] =>
      within(palette())
        .getAllByRole('button', { name: /넣기$/ })
        .map((button) => button.getAttribute('aria-label') ?? '')
    fireEvent.change(within(palette()).getByRole('searchbox', { name: '모듈 찾기' }), { target: { value: '묶음' } })
    expect(named()).toEqual(['내 묶음 상세 넣기', '저장 묶음 넣기'])
    fireEvent.change(within(palette()).getByRole('searchbox', { name: '모듈 찾기' }), { target: { value: '상세' } })
    expect(named()).toEqual(['내 묶음 상세 넣기'])
  })
})

describe('넣기', () => {
  it('고른 것 없음 → 페이지 끝 · 편집 하나 · 새 id · 넣은 노드 전부를 고른다 · 다시 읽은 모듈을 넣는다', async () => {
    const fake = server([projectModule('m-1', '저장 묶음')])
    await openWithPalette(fake)
    await openModules()
    await select(null)
    await insert('저장 묶음')
    expect(fake.calls.get).toEqual(['m-1'])
    await waitFor(() => expect(fake.sent).toHaveLength(1))
    const children = fake.held().root.children!
    expect(children.map((node) => node.type)).toEqual(['Text', 'Card', 'Button', 'Button'])
    const [open, close] = children.slice(2)
    expect([open!.id, close!.id]).not.toContain('m_open')
    // 묶음 안을 가리키던 대상은 새 id 를 따라간다.
    expect(actionTarget(open!.interactions![0]!.actions[0]!)).toBe(close!.id)
    expect(shellStore().getState().selectedNodeIds).toEqual([open!.id, close!.id])
  })

  it('개인 모듈 — 다시 읽고(getMyModule) 컨테이너를 고르면 그 안 끝 · 잎을 고르면 바로 뒤(컴포넌트 카드와 같은 표)', async () => {
    const fake = server([], [personalModule('p-1', '내 카드')])
    await openWithPalette(fake)
    await openModules()
    await select('n-box')
    await insert('내 카드')
    expect(fake.calls.getMine).toEqual(['p-1'])
    await waitFor(() => expect(fake.sent).toHaveLength(1))
    expect(fake.held().root.children![1]!.children!.map((node) => node.type)).toEqual(['Text', 'Card'])
    await select('n-text')
    await act(async () => new Promise((resolve) => setTimeout(resolve, 600)))
    await insert('내 카드')
    await waitFor(() => expect(fake.sent).toHaveLength(2))
    expect(fake.held().root.children!.map((node) => node.type)).toEqual(['Text', 'Card', 'Card'])
  })

  it('되돌리기 한 번에 넣기 전 문서로 돌아온다', async () => {
    const fake = server([], [personalModule('p-1', '내 카드')])
    await openWithPalette(fake)
    await openModules()
    await select(null)
    await insert('내 카드')
    await waitFor(() => expect(fake.sent).toHaveLength(1))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '되돌리기' }))
    })
    await waitFor(() => expect(fake.sent).toHaveLength(2))
    expect(fake.held()).toEqual(DOC)
  })

  it('남이 잡은 잎을 고른 채 넣으면 편집 0 · 잠금 문장', async () => {
    const fake = server([], [personalModule('p-1', '내 카드')])
    await openWithPalette(fake)
    await openModules()
    await select('n-text')
    await act(async () => shellStore().setLocks([{ pageId: PAGE_ID, nodeId: 'n-text', userId: 'u-bora', userName: '보라' }]))
    await insert('내 카드')
    expect(fake.sent).toEqual([])
    expect(notice()).not.toBe('')
  })

  it('넣을 자리 뒤 형제를 남이 잡았으면 편집 0 · 속성 패널의 잠금 문장', async () => {
    const fake = server([], [personalModule('p-1', '내 카드')])
    await openWithPalette(fake)
    await openModules()
    await select('n-text')
    await act(async () => shellStore().setLocks([{ pageId: PAGE_ID, nodeId: 'n-box', userId: 'u-bora', userName: '보라' }]))
    await insert('내 카드')
    expect(fake.sent).toEqual([])
    expect(notice()).toBe(lockedNotice('보라'))
  })

  /** Review Focus 5 — 탭을 연 뒤 남이 지운 모듈. */
  it('남이 지운 모듈을 넣으면 404 → «이 모듈은 지워졌습니다» · 편집 0 · 목록을 다시 읽는다', async () => {
    const fake = server([projectModule('m-1', '지울 묶음')])
    await openWithPalette(fake)
    await openModules()
    expect(fake.calls.list).toBe(1)
    fake.modules.splice(0)
    await insert('지울 묶음')
    expect(notice()).toBe(MODULE_GONE_NOTICE)
    expect(fake.sent).toEqual([])
    await waitFor(() => expect(fake.calls.list).toBe(2))
    expect(within(group('프로젝트 모듈')).queryByText('지울 묶음')).toBeNull()
  })

  it('다른 탭에서 지운 개인 모듈을 넣으면 404 → «이 모듈은 지워졌습니다» · 편집 0 · 개인 목록만 다시 읽는다', async () => {
    const fake = server([], [personalModule('p-1', '지울 카드')])
    await openWithPalette(fake)
    await openModules()
    fake.personal.splice(0)
    await insert('지울 카드')
    expect(notice()).toBe(MODULE_GONE_NOTICE)
    expect(fake.sent).toEqual([])
    await waitFor(() => expect(fake.calls.mine).toBe(2))
    expect(fake.calls.list).toBe(1)
    expect(within(group('개인 모듈')).queryByText('지울 카드')).toBeNull()
  })

  it('같은 카드의 더블클릭 둘째는 안 넣는다', async () => {
    const fake = server([], [personalModule('p-1', '내 카드')])
    await openWithPalette(fake)
    await openModules()
    await select(null)
    const button = within(palette()).getByRole('button', { name: '내 카드 넣기' })
    fireEvent.click(button, { detail: 1, clientX: 10, clientY: 10 })
    await act(async () => {})
    fireEvent.click(button, { detail: 2, clientX: 10, clientY: 10 })
    await act(async () => {})
    await waitFor(() => expect(fake.sent).toHaveLength(1))
    await act(async () => new Promise((resolve) => setTimeout(resolve, 50)))
    expect(fake.sent).toHaveLength(1)
  })

  /** Review Focus 1 — 판은 뷰 모드에도 남으므로 읽는 사이 넣을 수 없게 될 수 있다. */
  it('다시 읽는 사이 뷰 모드로 바꾸면 넣지 않는다 — 편집 0', async () => {
    const fake = server([], [personalModule('p-1', '내 카드')])
    let release: () => void = () => {}
    const getMyModule = fake.api.getMyModule!
    fake.api.getMyModule = async (moduleId) => {
      await new Promise<void>((resolve) => {
        release = resolve
      })
      return getMyModule(moduleId)
    }
    await openWithPalette(fake)
    await openModules()
    await select(null)
    fireEvent.click(within(palette()).getByRole('button', { name: '내 카드 넣기' }))
    await act(async () => {})
    fireEvent.click(screen.getByRole('button', { name: '뷰 모드' }))
    await act(async () => release())
    await act(async () => new Promise((resolve) => setTimeout(resolve, 50)))
    expect(fake.sent).toEqual([])
    expect(fake.held()).toEqual(DOC)
  })
})

describe('넣기 — 첫 행 확인(`src/edit/first-row-ask.ts`)', () => {
  /** 기본 행 둘인 그리드 — 기본인 첫 행(`n-r1`)을 고르고 «칸» 모듈을 넣으면 그 행 안 끝에 들어가 첫 행이 커스텀이 되고 `n-r2` 가 기본으로 남는다. */
  const GRID: PageDocument = pageDoc({
    id: 'n-root',
    type: 'Page',
    children: [
      {
        id: 'n-grid',
        type: 'DataGrid',
        children: [{ id: 'n-c1', type: 'GridColumn', props: { label: '이름' } }],
        zones: {
          rows: [
            { id: 'n-r1', type: 'GridRow' },
            { id: 'n-r2', type: 'GridRow' },
          ],
        },
      },
    ],
  })
  const cellModule = (): ProjectModule => ({
    ...projectModule('m-cell', '칸 묶음'),
    nodes: [{ id: 'm_cell', type: 'GridCell', children: [{ id: 'm_cell_text', type: 'Text', props: { content: '값' } }] }],
    nodeCount: 2,
  })
  const asking = (): HTMLElement | null => screen.queryByRole('dialog', { name: FIRST_ROW_ASK_TITLE })

  it('기본인 첫 행을 고르고 «칸» 모듈을 넣으면 묻는다 · 취소면 편집 0 · 계속이면 한 편집으로 넣고 넣은 노드를 고른다', async () => {
    const fake = server([cellModule()], [], GRID)
    await openWithPalette(fake)
    await openModules()
    await select('n-r1')
    await insert('칸 묶음')
    await waitFor(() => expect(asking()).not.toBeNull())
    expect(fake.sent).toHaveLength(0)
    fireEvent.click(within(asking()!).getByRole('button', { name: '취소' }))
    await act(async () => {})
    expect({ 상자: asking() !== null, 보냄: fake.sent.length }).toEqual({ 상자: false, 보냄: 0 })

    await act(async () => new Promise((resolve) => setTimeout(resolve, 600)))
    await insert('칸 묶음')
    await waitFor(() => expect(asking()).not.toBeNull())
    fireEvent.click(within(asking()!).getByRole('button', { name: FIRST_ROW_ASK_CONFIRM }))
    await waitFor(() => expect(fake.sent).toHaveLength(1))
    const first = fake.held().root.children![0]!.zones!.rows![0]!
    expect({ 첫행: first.id, 칸: first.children?.map((node) => node.type), 고른: shellStore().getState().selectedNodeIds }).toEqual({
      첫행: 'n-r1',
      칸: ['GridCell'],
      고른: [first.children![0]!.id],
    })
  })
})

describe('카드 행동 · 복사', () => {
  it('개인 모듈의 이름 바꾸기 · 삭제는 개인 길로 가고 개인 목록만 다시 읽는다', async () => {
    const fake = server([], [personalModule('p-1', '내 카드'), personalModule('p-2', '지울 카드')])
    await openWithPalette(fake)
    await openModules()
    fireEvent.click(within(group('개인 모듈')).getByRole('button', { name: '내 카드 이름 바꾸기' }))
    const input = within(group('개인 모듈')).getByRole('textbox', { name: '내 카드 새 이름' })
    fireEvent.change(input, { target: { value: '새 카드' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(within(group('개인 모듈')).queryByText('새 카드')).not.toBeNull())
    fireEvent.click(within(group('개인 모듈')).getByRole('button', { name: '지울 카드 삭제' }))
    fireEvent.click(within(group('개인 모듈')).getByRole('button', { name: '삭제 확인' }))
    await waitFor(() => expect(within(group('개인 모듈')).queryByText('지울 카드')).toBeNull())
    expect({ renamed: fake.calls.renamedMine, deleted: fake.calls.deletedMine, list: fake.calls.list }).toEqual({
      renamed: ['p-1:새 카드'],
      deleted: ['p-2'],
      list: 1,
    })
  })

  it('«프로젝트 모듈로 복사» — 원본을 다시 읽고 그 이름 · 노드로 프로젝트 모듈을 저장하고 프로젝트 목록을 다시 읽는다 · 원본은 그대로', async () => {
    const original = personalModule('p-1', '내 카드')
    const fake = server([], [original])
    await openWithPalette(fake)
    await openModules()
    fireEvent.click(within(group('개인 모듈')).getByRole('button', { name: '내 카드 프로젝트 모듈로 복사' }))
    await waitFor(() => expect(within(group('프로젝트 모듈')).queryByText('내 카드')).not.toBeNull())
    expect({ read: fake.calls.getMine, created: fake.calls.created, list: fake.calls.list, mine: fake.personal }).toEqual({
      read: ['p-1'],
      created: [{ name: '내 카드', nodes: original.nodes }],
      list: 2,
      mine: [personalModule('p-1', '내 카드')],
    })
    expect(infoNotice()).toBe(copiedNotice('내 카드', 'project'))
    expect(copiedNotice('내 카드', 'project')).toBe("'내 카드' 을 프로젝트 모듈로 복사했습니다")
  })

  it('«개인 모듈로 복사» — 프로젝트 모듈을 다시 읽고 개인 모듈로 저장하고 개인 목록을 다시 읽는다', async () => {
    const fake = server([projectModule('m-1', '저장 묶음')])
    await openWithPalette(fake)
    await openModules()
    fireEvent.click(within(group('프로젝트 모듈')).getByRole('button', { name: '저장 묶음 개인 모듈로 복사' }))
    await waitFor(() => expect(within(group('개인 모듈')).queryByText('저장 묶음')).not.toBeNull())
    expect({ read: fake.calls.get, created: fake.calls.createdMine.map((body) => body.name), mine: fake.calls.mine }).toEqual({
      read: ['m-1'],
      created: ['저장 묶음'],
      mine: 2,
    })
    expect(infoNotice()).toBe(copiedNotice('저장 묶음', 'personal'))
  })

  it('복사할 원본이 지워졌으면 «이 모듈은 지워졌습니다» · 저장 0 · 원본 목록을 다시 읽는다', async () => {
    const fake = server([projectModule('m-1', '지울 묶음')])
    await openWithPalette(fake)
    await openModules()
    fake.modules.splice(0)
    fireEvent.click(within(group('프로젝트 모듈')).getByRole('button', { name: '지울 묶음 개인 모듈로 복사' }))
    await waitFor(() => expect(notice()).toBe(MODULE_GONE_NOTICE))
    expect(fake.calls.createdMine).toEqual([])
    await waitFor(() => expect(fake.calls.list).toBe(2))
  })
})

/**
 * **역할 · 모드마다 서는 것**(`module-tab.tsx` 머리말 «무엇이 서는가»). 판은 편집할 수 없는 판에도 서고 «모듈» 하나다.
 */
describe('역할 · 모드', () => {
  const both = (): Server => server([projectModule('m-1', '저장 묶음')], [personalModule('p-1', '내 카드')])

  async function shape(): Promise<Record<string, unknown>> {
    return {
      toggle: within(footer())
        .queryAllByRole('button', { name: /^(컴포넌트|모듈)$/ })
        .map((button) => button.textContent),
      region: palette().getAttribute('aria-label'),
      tabs: viewTabs().map((tab) => tab.textContent),
      personal: buttonsIn('개인 모듈'),
      project: buttonsIn('프로젝트 모듈'),
    }
  }

  it('owner · 편집 모드 — «컴포넌트 | 모듈» · 넣기 · 쓰기 · 복사 전부', async () => {
    await openWithPalette(both())
    await openModules()
    expect(await shape()).toEqual({
      toggle: ['컴포넌트'],
      region: '컴포넌트 목록',
      tabs: ['컴포넌트', '모듈'],
      personal: ['내 카드 넣기', '내 카드 이름 바꾸기', '내 카드 삭제', '내 카드 프로젝트 모듈로 복사'],
      project: ['저장 묶음 넣기', '저장 묶음 이름 바꾸기', '저장 묶음 삭제', '저장 묶음 개인 모듈로 복사'],
    })
  })

  it('owner · 뷰 모드 — 판 «모듈 목록» · 탭 «모듈» 하나 · 넣기 없음 · 모듈 쓰기와 복사는 선다', async () => {
    await openWithPalette(both())
    fireEvent.click(screen.getByRole('button', { name: '뷰 모드' }))
    await act(async () => {})
    expect(await shape()).toEqual({
      toggle: ['모듈'],
      region: '모듈 목록',
      tabs: ['모듈'],
      personal: ['내 카드 이름 바꾸기', '내 카드 삭제', '내 카드 프로젝트 모듈로 복사'],
      project: ['저장 묶음 이름 바꾸기', '저장 묶음 삭제', '저장 묶음 개인 모듈로 복사'],
    })
  })

  it('viewer — 판 «모듈 목록» · 넣기 없음 · 개인 쓰기 · «개인 모듈로 복사» 만 · 프로젝트 쓰기 · «프로젝트 모듈로 복사» 없음', async () => {
    await openWithPalette(both(), 'viewer')
    await act(async () => {})
    expect(await shape()).toEqual({
      toggle: ['모듈'],
      region: '모듈 목록',
      tabs: ['모듈'],
      personal: ['내 카드 이름 바꾸기', '내 카드 삭제'],
      project: ['저장 묶음 개인 모듈로 복사'],
    })
  })

  it('넣을 수 없는 판은 기억한 탭을 안 쓴다 — 편집 모드로 돌아오면 «컴포넌트» 로 선다', async () => {
    await openWithPalette(both())
    fireEvent.click(screen.getByRole('button', { name: '뷰 모드' }))
    await act(async () => {})
    expect(localStorage.getItem(PALETTE_VIEW_KEY)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '편집 모드' }))
    await act(async () => {})
    expect(viewTabs().map((tab) => [tab.textContent, tab.getAttribute('aria-selected')])).toEqual([
      ['컴포넌트', 'true'],
      ['모듈', 'false'],
    ])
  })
})

/**
 * **그림 — 개인 몫과 프로젝트 사이**(`src/edit/claim-images.ts`). 개인 모듈을 넣거나 프로젝트로 복사하면 그림을 개인 몫에서 이 프로젝트로 먼저 가져오고
 * 못 가져온 것을 비운 뒤 말한다. 프로젝트 모듈을 개인 몫으로 복사하면 그림을 개인 몫으로 가져오고, 하나라도 못 가져오면 복사하지 않는다.
 */
describe('그림 — 개인 몫과 프로젝트 사이', () => {
  const KEPT = 'c'.repeat(64)
  const LOST = 'd'.repeat(64)
  const pictured: WbNode[] = [
    { id: 'p_a', type: 'Placeholder', props: { label: '배너', image: KEPT } },
    { id: 'p_b', type: 'Placeholder', props: { label: '로고', image: LOST } },
  ]
  const imagesOf = (nodes: readonly WbNode[]) => nodes.map((node) => (node.props as { image?: string } | undefined)?.image)

  function withClaims(fake: Server, failed: { id: string; reason: 'not-readable' | 'quota' }[]) {
    const claims: { projectId: string; ids: string[]; from: unknown; sentBefore: number }[] = []
    const mine: { ids: string[]; from: string }[] = []
    fake.api.claimAssets = async (projectId, ids, from) => {
      claims.push({ projectId, ids: [...ids], from, sentBefore: fake.sent.length })
      return { claimed: ids.filter((id) => !failed.some((one) => one.id === id)), failed: failed.filter((one) => ids.includes(one.id)) }
    }
    fake.api.claimMyAssets = async (ids, from) => {
      mine.push({ ids: [...ids], from })
      return { claimed: ids.filter((id) => !failed.some((one) => one.id === id)), failed: failed.filter((one) => ids.includes(one.id)) }
    }
    fake.api.listAssets = async () => ({ assets: [], usedBytes: 0, limitBytes: 1, fileLimitBytes: 1 })
    return { claims, mine }
  }

  it('개인 모듈 넣기 — 편집 전에 개인 몫에서 가져오고 · 못 가져온 그림만 비우고 · 정보 통지로 말한다', async () => {
    const fake = server([], [{ ...personalModule('p-1', '그림 묶음'), nodes: pictured }])
    const seen = withClaims(fake, [{ id: LOST, reason: 'quota' }])
    await openWithPalette(fake)
    await openModules()
    await insert('그림 묶음')
    await waitFor(() => expect(fake.sent).toHaveLength(1))
    expect(seen.claims).toEqual([{ projectId: PROJECT_ID, ids: [KEPT, LOST], from: { personal: true }, sentBefore: 0 }])
    expect(imagesOf(fake.held().root.children!.slice(2))).toEqual([KEPT, undefined])
    await waitFor(() => expect(infoNotice()).toBe('그림 1개를 가져오지 못해 비웠습니다 — 이 프로젝트의 그림 공간이 찼습니다'))
  })

  it('프로젝트 모듈 넣기는 가져오기를 부르지 않는다 — 같은 프로젝트다', async () => {
    const fake = server([{ ...projectModule('m-1', '그림 묶음'), nodes: pictured }])
    const seen = withClaims(fake, [])
    await openWithPalette(fake)
    await openModules()
    await insert('그림 묶음')
    await waitFor(() => expect(fake.sent).toHaveLength(1))
    expect(seen.claims).toEqual([])
    expect(imagesOf(fake.held().root.children!.slice(2))).toEqual([KEPT, LOST])
  })

  it('«프로젝트 모듈로 복사» — 개인 몫에서 가져오고 못 가져온 그림은 비운 채 저장하고 말한다', async () => {
    const fake = server([], [{ ...personalModule('p-1', '그림 묶음'), nodes: pictured }])
    const seen = withClaims(fake, [{ id: LOST, reason: 'not-readable' }])
    await openWithPalette(fake)
    await openModules()
    fireEvent.click(within(group('개인 모듈')).getByRole('button', { name: '그림 묶음 프로젝트 모듈로 복사' }))
    await waitFor(() => expect(fake.calls.created).toHaveLength(1))
    expect(seen.claims.map((one) => one.from)).toEqual([{ personal: true }])
    expect(imagesOf(fake.calls.created[0]!.nodes)).toEqual([KEPT, undefined])
    expect(infoNotice()).toBe(`${copiedNotice('그림 묶음', 'project')} 그림 1개를 가져오지 못해 비웠습니다 — 출처에 들어갈 수 없습니다`)
  })

  it('«개인 모듈로 복사» — 그림을 개인 몫으로 가져오고, 하나라도 못 가져오면 복사하지 않고 까닭을 말한다', async () => {
    const fake = server([{ ...projectModule('m-1', '그림 묶음'), nodes: pictured }])
    const seen = withClaims(fake, [{ id: LOST, reason: 'quota' }])
    await openWithPalette(fake)
    await openModules()
    fireEvent.click(within(group('프로젝트 모듈')).getByRole('button', { name: '그림 묶음 개인 모듈로 복사' }))
    await waitFor(() => expect(notice()).toBe('그림 1개를 개인 몫으로 가져오지 못해 저장하지 않았습니다 — 개인 그림 공간이 찼습니다'))
    expect({ mine: seen.mine, created: fake.calls.createdMine }).toEqual({ mine: [{ ids: [KEPT, LOST], from: PROJECT_ID }], created: [] })
  })
})

describe('공통코드 — 표에 없는 키를 든 모듈', () => {
  it('거절 없이 들어가고 «끊긴 공통코드 1개» 를 말한다(Review Focus 1)', async () => {
    const bound: ProjectModule = {
      ...projectModule('m-code', '코드 칩'),
      nodes: [{ id: 'm_affix', type: 'Affix', props: { text: '옛 이름' }, code: { group: 'NOT_HERE', item: 'X' } }],
      nodeCount: 1,
    }
    const fake = server([bound])
    fake.api.listCodes = async () => [{ key: 'ORDER_STATUS', name: '주문 상태', items: [] }]
    await openWithPalette(fake)
    await openModules()
    await select(null)
    await insert('코드 칩')
    await waitFor(() => expect(fake.sent).toHaveLength(1))
    const placed = fake.held().root.children!.at(-1)!
    expect(placed.code).toEqual({ group: 'NOT_HERE', item: 'X' })
    await waitFor(() => expect(infoNotice()).toContain('끊긴 공통코드 1개'))
  })
})
