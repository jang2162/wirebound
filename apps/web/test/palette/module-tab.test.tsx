/**
 * **하단 판의 «컴포넌트 | 모듈» 위층 탭과 «모듈» 탭**(`src/palette/component-palette.tsx` · `src/palette/module-tab.tsx`).
 *
 * 셸을 라우트째 띄워 판을 토글로 열고 그 스토어에 드라이버를 붙인다(`palette-cards.test.tsx` 와 같은 꼴). 자리 규칙 · 거름의 표는
 * `../edit/module-insert.test.ts` 가 문서로 잰다 — 여기서 재는 것은 탭 · 묶음 · 넣기의 화면 흐름(편집 하나 · 고름 · 거절 문장 · 지워진 모듈)이다.
 * 끌어 놓기 · 새로고침 뒤의 기억은 실브라우저 판(`build-test/module-tab.test.ts`).
 *
 * **`vi.mock`은 이 파일에 있어야 한다** — 호이스팅이 그것이 적힌 파일에서만 일어난다(`editor-harness.tsx` 머리말).
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { BUILTIN_MODULES, applyOps, invertOps, type PageDocument, type PatchOp, type WbNode } from '@wirebound/schema'
import type { ThemeManifest } from '@wirebound/theme-sdk'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type ApiClient } from '../../src/api/client'
import type { PatchResult, ProjectModule } from '../../src/api/types'
import { PALETTE_VIEW_KEY } from '../../src/palette/component-palette'
import { MODULE_GONE_NOTICE, NO_PROJECT_MODULES } from '../../src/palette/module-tab'
import { lockedNotice } from '../../src/panels/property-panel'
import { EditorStore } from '../../src/store/editor-store'
import { ADMIN_FIXTURE } from '../admin-theme'
import { HEAD_SEQ, PAGE_ID, openPage, pageDoc } from '../editor-harness'
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

const PATTERNS = {
  'content.notice': {
    name: '공지 묶음',
    slots: { title: 'text' },
    schema: {
      type: 'Section',
      children: [
        { type: 'Text', props: { role: 'h2', content: '공지' }, slot: 'title' },
        { type: 'List', props: { items: 3 } },
      ],
    },
  },
}

interface Server {
  sent: PatchOp[][]
  held: () => PageDocument
  calls: { list: number; get: string[] }
  modules: ProjectModule[]
  api: Partial<ApiClient>
}

/** 편집을 받아 문서를 진행시키고 모듈 목록 · 하나를 내는 대역. */
function server(initial: ProjectModule[] = []): Server {
  const sent: PatchOp[][] = []
  const calls = { list: 0, get: [] as string[] }
  const modules = [...initial]
  let held = DOC
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
  const listModules: ApiClient['listModules'] = async () => {
    calls.list += 1
    return [...modules]
  }
  const getModule: ApiClient['getModule'] = async (_projectId, moduleId) => {
    calls.get.push(moduleId)
    const found = modules.find((entry) => entry.id === moduleId)
    if (found === undefined) throw new ApiError(404, 'not-found', '모듈을 찾을 수 없습니다')
    return found
  }
  const getProjectTheme: ApiClient['getProjectTheme'] = async () => ({
    ...adminThemeView(),
    manifest: { ...ADMIN_FIXTURE.manifest, patterns: PATTERNS } as ThemeManifest,
  })
  return { sent, held: () => held, calls, modules, api: { patchOps, listModules, getModule, getProjectTheme } }
}

async function openWithPalette(fake: Server): Promise<void> {
  await openPage(DOC, { apiOverrides: fake.api })
  fireEvent.click(within(screen.getByRole('contentinfo', { name: '하단 바' })).getByRole('button', { name: '컴포넌트' }))
}

function palette(): HTMLElement {
  return screen.getByRole('region', { name: '컴포넌트 목록' })
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

describe('묶음 셋', () => {
  it('프로젝트 모듈 · 기본 모듈 · 테마 패턴 — 차례대로 · 탭을 열 때 목록을 읽는다', async () => {
    const fake = server([projectModule('m-1', '저장 묶음')])
    await openWithPalette(fake)
    await openModules()
    const groups = [...palette().querySelectorAll('section[aria-label]')].map((element) => element.getAttribute('aria-label'))
    expect(groups).toEqual(['프로젝트 모듈', '기본 모듈', '테마 패턴'])
    expect(fake.calls.list).toBe(1)
    expect(within(group('프로젝트 모듈')).getByText('저장 묶음')).not.toBeNull()
    expect(within(group('프로젝트 모듈')).getByText('노드 2개')).not.toBeNull()
    expect(
      within(group('기본 모듈'))
        .getAllByRole('button', { name: /넣기$/ })
        .map((button) => button.getAttribute('aria-label')),
    ).toEqual(BUILTIN_MODULES.map((entry) => `${entry.name} 넣기`))
    expect(within(group('테마 패턴')).getByText('공지 묶음')).not.toBeNull()
  })

  it('프로젝트 모듈이 없으면 «모듈로 저장» 안내 한 줄', async () => {
    await openWithPalette(server())
    await openModules()
    expect(within(group('프로젝트 모듈')).getByText(NO_PROJECT_MODULES)).not.toBeNull()
  })

  it('검색이 이름으로 묶음 셋을 함께 거른다 — 컴포넌트 탭의 검색어와 따로다', async () => {
    await openWithPalette(server([projectModule('m-1', '저장 묶음')]))
    fireEvent.change(within(palette()).getByRole('searchbox', { name: '컴포넌트 찾기' }), { target: { value: '버튼' } })
    await openModules()
    expect(within(palette()).getByRole('searchbox', { name: '모듈 찾기' })).toHaveProperty('value', '')
    fireEvent.change(within(palette()).getByRole('searchbox', { name: '모듈 찾기' }), { target: { value: '상세' } })
    const names = within(palette())
      .getAllByRole('button', { name: /넣기$/ })
      .map((button) => button.getAttribute('aria-label'))
    expect(names).toEqual(['상세 조회형 넣기'])
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
    expect(open!.interactions![0]!.actions[0]!.target).toBe(close!.id)
    expect(shellStore().getState().selectedNodeIds).toEqual([open!.id, close!.id])
  })

  it('컨테이너를 고르면 그 안 끝 · 잎을 고르면 바로 뒤(컴포넌트 카드와 같은 표)', async () => {
    const fake = server()
    await openWithPalette(fake)
    await openModules()
    const detail = BUILTIN_MODULES.find((entry) => entry.key === 'detail')!
    await select('n-box')
    await insert(detail.name)
    await waitFor(() => expect(fake.sent).toHaveLength(1))
    expect(fake.held().root.children![1]!.children!.map((node) => node.type)).toEqual(['Text', 'Card', 'Flex'])
    await select('n-text')
    await act(async () => new Promise((resolve) => setTimeout(resolve, 600)))
    await insert(detail.name)
    await waitFor(() => expect(fake.sent).toHaveLength(2))
    expect(fake.held().root.children!.map((node) => node.type)).toEqual(['Text', 'Card', 'Flex', 'Card'])
  })

  it('되돌리기 한 번에 넣기 전 문서로 돌아온다', async () => {
    const fake = server()
    await openWithPalette(fake)
    await openModules()
    await select(null)
    await insert(BUILTIN_MODULES[0]!.name)
    await waitFor(() => expect(fake.sent).toHaveLength(1))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '되돌리기' }))
    })
    await waitFor(() => expect(fake.sent).toHaveLength(2))
    expect(fake.held()).toEqual(DOC)
  })

  it('테마 패턴은 첫 슬롯 노드를 고른다', async () => {
    const fake = server()
    await openWithPalette(fake)
    await openModules()
    await select(null)
    await insert('공지 묶음')
    await waitFor(() => expect(fake.sent).toHaveLength(1))
    const section = fake.held().root.children![2]!
    expect(section.type).toBe('Section')
    expect(shellStore().getState().selectedNodeIds).toEqual([section.children![0]!.id])
  })

  it('남이 잡은 잎을 고른 채 넣으면 편집 0 · 잠금 문장', async () => {
    const fake = server()
    await openWithPalette(fake)
    await openModules()
    await select('n-text')
    await act(async () => shellStore().setLocks([{ pageId: PAGE_ID, nodeId: 'n-text', userId: 'u-bora', userName: '보라' }]))
    await insert(BUILTIN_MODULES[0]!.name)
    expect(fake.sent).toEqual([])
    expect(notice()).not.toBe('')
  })

  it('넣을 자리 뒤 형제를 남이 잡았으면 편집 0 · 속성 패널의 잠금 문장', async () => {
    const fake = server()
    await openWithPalette(fake)
    await openModules()
    await select('n-text')
    await act(async () => shellStore().setLocks([{ pageId: PAGE_ID, nodeId: 'n-box', userId: 'u-bora', userName: '보라' }]))
    await insert(BUILTIN_MODULES[0]!.name)
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

  it('같은 카드의 더블클릭 둘째는 안 넣는다', async () => {
    const fake = server()
    await openWithPalette(fake)
    await openModules()
    await select(null)
    const button = within(palette()).getByRole('button', { name: `${BUILTIN_MODULES[0]!.name} 넣기` })
    fireEvent.click(button, { detail: 1, clientX: 10, clientY: 10 })
    await act(async () => {})
    fireEvent.click(button, { detail: 2, clientX: 10, clientY: 10 })
    await act(async () => {})
    await waitFor(() => expect(fake.sent).toHaveLength(1))
    await act(async () => new Promise((resolve) => setTimeout(resolve, 50)))
    expect(fake.sent).toHaveLength(1)
  })
})
