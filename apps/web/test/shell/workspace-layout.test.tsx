/**
 * **에디터 밖 화면의 뼈대**(`src/shell/workspace-layout.tsx`) — 사이드바(로고 · 칸 · 관리자 묶음 · 이름 · 로그아웃)와 내용 칸 머리.
 *
 * **화면을 지나 잰다** — `<App />`을 라우트째 그린다. 지키는 고장은 부품이 아니라 **그 화면이 뼈대 안에 서 있는가**다(`shell-nav.test.tsx` 머리말).
 * 폭 · 좁은 창의 꼴은 jsdom 이 CSS 를 안 그려 못 잰다 — 실브라우저 `build-test/workspace-layout.test.ts` 가 잰다. 여기서는 «메뉴» 단추가 목록의
 * `data-folded` 를 바꾸는 것까지만 본다.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from '../../src/app'
import { ApiError, type ApiClient } from '../../src/api/client'
import type { ProjectView, SessionUser } from '../../src/api/types'
import { ADMIN_NAV } from '../../src/shell/workspace-nav'
import { currentPath, currentSearch, fakeApi, listItem, renderWithProviders } from '../helpers'
import { adminThemeView } from '../theme-loader'

/** 화면이 지어낼 리 없는 이름 — 사이드바 바닥에 서버가 준 값이 그대로 오는지 잰다. */
const MEMBER: SessionUser = { id: 'u-7', email: 'side@example.com', name: '옆칸사람 [T-WS]', isInstanceAdmin: false }
const ADMIN: SessionUser = { ...MEMBER, isInstanceAdmin: true }
const SERVER_MESSAGE = '세션 저장소가 응답하지 않습니다 [T-WS-LOGOUT]'

const PROJECT: ProjectView = { id: 'p-1', name: '관리자 콘솔', slug: 'admin', description: null, role: 'owner', themeRev: 0 }

/** 뼈대 안의 화면 넷 — 주소 · 그 화면이 부르는 조회 · 사이드바에서 `aria-current` 가 설 칸(없으면 `null`). */
const SCREENS = [
  { screen: '프로젝트 목록', route: '/', heading: '프로젝트', current: '프로젝트', api: { listProjects: async () => [] } },
  {
    screen: '프로젝트 설정',
    route: '/projects/p-1/settings',
    heading: '관리자 콘솔 설정',
    current: null,
    api: {
      getProject: async () => PROJECT,
      getProjectTheme: async () => adminThemeView(),
      listThemePackages: async () => [],
      listMembers: async () => [],
    },
  },
  { screen: '계정 설정', route: '/account', heading: '계정 설정', current: '계정', api: { listMyTokens: async () => [] } },
  { screen: '테마 관리', route: '/admin/themes', heading: '테마 관리', current: '테마', api: { listThemePackages: async () => [] } },
] as const satisfies readonly { screen: string; route: string; heading: string; current: string | null; api: Partial<ApiClient> }[]

type Screen = (typeof SCREENS)[number]

async function open(at: Screen, user: SessionUser, overrides: Partial<ApiClient> = {}): Promise<void> {
  renderWithProviders(<App />, {
    client: fakeApi({ me: async () => user, listProjects: async () => [], ...at.api, ...overrides }),
    route: at.route,
  })
  await screen.findByRole('heading', { name: at.heading })
}

function side(): HTMLElement {
  const found = document.body.querySelector<HTMLElement>('.wb-shell-workspace-side')
  if (found === null) throw new Error('사이드바를 찾지 못했습니다')
  return found
}

/** 사이드바의 칸 이름 — 차례 그대로. */
function links(name: string): string[] {
  return within(within(side()).getByRole('navigation', { name }))
    .getAllByRole('link')
    .map((link) => link.textContent ?? '')
}

describe.each(SCREENS)('$screen 은 뼈대 안에 선다', (at) => {
  it('관리자가 아니면 — «프로젝트» · «계정» · 이름 · 로그아웃, 관리자 묶음 없음', async () => {
    await open(at, MEMBER)
    expect(links('작업 공간')).toEqual(['프로젝트', '계정'])
    expect(within(side()).queryByRole('navigation', { name: '관리자' })).toBeNull()
    expect(within(side()).getByText(MEMBER.name)).toBeTruthy()
    expect(within(side()).getByRole('button', { name: '로그아웃' })).toBeTruthy()
    // 옛 머리의 `…`(계정 설정 · 테마 관리 · 로그아웃)는 없다 — 그 일을 사이드바가 맡는다.
    expect(screen.queryByRole('button', { name: '더 보기' })).toBeNull()
  })

  it('관리자면 — 관리자 묶음의 다섯 칸이 `ADMIN_NAV` 차례로, 주소도 그대로', async () => {
    await open(at, ADMIN)
    expect(links('관리자')).toEqual(ADMIN_NAV.map((item) => item.label))
    const hrefs = within(within(side()).getByRole('navigation', { name: '관리자' }))
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'))
    expect(hrefs).toEqual(['/admin/users', '/admin/invites', '/admin/projects', '/admin/themes', '/admin/audit'])
  })

  it('지금 화면의 칸에만 `aria-current="page"` 가 선다', async () => {
    await open(at, ADMIN)
    const current = within(side())
      .getAllByRole('link')
      .filter((link) => link.getAttribute('aria-current') === 'page')
      .map((link) => link.textContent)
    expect(current).toEqual(at.current === null ? [] : [at.current])
  })

  it('로고는 프로젝트 목록으로 간다', async () => {
    await open(at, MEMBER)
    expect(within(side()).getByRole('link', { name: '프로젝트 목록' }).getAttribute('href')).toBe('/')
  })

  it('«로그아웃»은 한 번 부르고 로그인 화면으로 나간다', async () => {
    let calls = 0
    await open(at, MEMBER, {
      logout: async () => {
        calls += 1
      },
    })
    fireEvent.click(within(side()).getByRole('button', { name: '로그아웃' }))
    await waitFor(() => expect(currentPath()).toBe('/login'))
    expect(calls).toBe(1)
  })

  it('로그아웃이 실패하면 서버 문장을 내용 칸 머리 아래에 내고 그 화면에 남는다', async () => {
    await open(at, MEMBER, {
      logout: async () => {
        throw new ApiError(500, 'internal', SERVER_MESSAGE)
      },
    })
    fireEvent.click(within(side()).getByRole('button', { name: '로그아웃' }))
    const alert = await screen.findByText(SERVER_MESSAGE)
    expect(alert.getAttribute('role')).toBe('alert')
    const head = document.body.querySelector('.wb-shell-workspace-head')
    expect(alert.previousElementSibling).toBe(head)
    expect(currentPath()).toBe(at.route)
  })
})

describe('좁은 창의 «메뉴»', () => {
  it('누르면 목록의 `data-folded` 가 풀리고 `aria-expanded` 가 참이 된다 — 다시 누르면 접힌다', async () => {
    await open(SCREENS[0], MEMBER)
    const toggle = within(side()).getByRole('button', { name: '메뉴' })
    const list = document.getElementById(toggle.getAttribute('aria-controls') ?? '')
    expect(list?.getAttribute('data-folded')).toBe('true')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')

    fireEvent.click(toggle)
    expect(list?.getAttribute('data-folded')).toBe('false')
    expect(toggle.getAttribute('aria-expanded')).toBe('true')

    fireEvent.click(toggle)
    expect(list?.getAttribute('data-folded')).toBe('true')
  })

  /** 펴 둔 목록 — 단추 · 목록 · 펴짐을 돌려준다. */
  function unfolded(): { toggle: HTMLElement; folded: () => string | null | undefined } {
    const toggle = within(side()).getByRole('button', { name: '메뉴' })
    fireEvent.click(toggle)
    const folded = () => document.getElementById(toggle.getAttribute('aria-controls') ?? '')?.getAttribute('data-folded')
    expect(folded()).toBe('false')
    return { toggle, folded }
  }

  it('같은 꼴의 화면 사이를 옮겨도(관리자 › 사용자 → 초대 링크) 주소가 바뀌면 접힌다', async () => {
    renderWithProviders(<App />, {
      client: fakeApi({ me: async () => ADMIN, listAdminUsers: async () => [], listInvites: async () => [] }),
      route: '/admin/users',
    })
    await screen.findByRole('heading', { name: '사용자' })
    const { folded } = unfolded()
    const sideBefore = side()
    fireEvent.click(within(screen.getByRole('navigation', { name: '관리자' })).getByRole('link', { name: '초대 링크' }))
    await screen.findByRole('heading', { name: '초대 링크' })
    // 뼈대는 재조정으로 이어졌다 — 새로 선 것이 아니다(그래서 주소를 보고 접어야 한다).
    expect(side()).toBe(sideBefore)
    expect(folded()).toBe('true')
  })

  it('질의만 바뀌면(목록의 검색 칸) 안 접힌다', async () => {
    await open(SCREENS[0], MEMBER, { listProjects: async () => [listItem(PROJECT)] })
    const { folded } = unfolded()
    fireEvent.change(await screen.findByRole('searchbox'), { target: { value: '관리' } })
    // 판 카나리아 — 주소의 질의가 실제로 바뀌었다(경로는 그대로).
    await waitFor(() => expect(currentSearch()).toContain('q='))
    expect(currentPath()).toBe('/')
    expect(folded()).toBe('false')
  })
})

describe('관리자 칸 넷 — 칸마다 제 화면', () => {
  /** 칸마다 그 화면만 그리는 빈 상태 문장 — 칸이 서로 다른 화면인지(한 라우트가 넷을 받지 않는지) 이것으로 가른다. */
  const EMPTY: Record<string, string> = {
    users: '검색 결과가 없습니다',
    invites: '만든 초대 링크가 없습니다',
    projects: '검색 결과가 없습니다',
    audit: '남은 기록이 없습니다',
  }
  it.each(['users', 'invites', 'projects', 'audit'])(
    '/admin/%s — 제목은 그 칸의 이름 · 그 칸에 `aria-current` · 그 화면의 빈 상태',
    async (key) => {
      const item = ADMIN_NAV.find((nav) => nav.key === key)!
      renderWithProviders(<App />, {
        client: fakeApi({
          me: async () => ADMIN,
          listProjects: async () => [],
          listAdminUsers: async () => [],
          listInvites: async () => [],
          listAdminProjects: async () => [],
          listAudit: async () => ({ entries: [], next: null }),
        }),
        route: `/admin/${key}`,
      })
      await screen.findByRole('heading', { name: item.label })
      await screen.findByText(EMPTY[key]!)
      const admin = screen.getByRole('navigation', { name: '관리자' })
      expect(within(admin).getByRole('link', { name: item.label }).getAttribute('aria-current')).toBe('page')
    },
  )

  it('관리자가 아니면 «인스턴스 관리자만 볼 수 있습니다»', async () => {
    renderWithProviders(<App />, { client: fakeApi({ me: async () => MEMBER }), route: '/admin/users' })
    await screen.findByRole('heading', { name: '사용자' })
    expect(screen.getByRole('alert').textContent).toBe('인스턴스 관리자만 볼 수 있습니다')
    expect(screen.queryByText('준비 중입니다')).toBeNull()
  })

  it('모르는 칸이면 프로젝트 목록으로 간다', async () => {
    renderWithProviders(<App />, { client: fakeApi({ me: async () => ADMIN, listProjects: async () => [] }), route: '/admin/nope' })
    await screen.findByRole('heading', { name: '프로젝트' })
    expect(currentPath()).toBe('/')
  })
})
