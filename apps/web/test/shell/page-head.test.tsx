/**
 * **셸 밖 화면의 머리**(`src/shell/page-head.tsx`) — 프로젝트 설정 · 계정 설정 · 테마 관리. 로고(프로젝트 목록으로) · 제목 · `…`(계정 설정 ·
 * 테마 관리(관리자) · 로그아웃). 프로젝트 목록 머리의 같은 성질은 `test/routes/project-list.test.tsx`의 «목록 머리의 `…`»(로고가 없다)와
 * `test/routes/shell-nav.test.tsx`의 «프로젝트 목록에서도 로그아웃한다»가 잰다.
 *
 * **화면을 지나 잰다** — `<App />`을 라우트째 그린다. 지키는 고장은 부품이 아니라 **그 화면의 머리에 달려 있는가**다(`shell-nav.test.tsx` 머리말).
 * 옛 계정 묶음(이름 · «API 토큰» 링크 · 로그아웃 단추)이 없다는 것도 여기서 잰다.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from '../../src/app'
import { ApiError, type ApiClient } from '../../src/api/client'
import type { ProjectView, SessionUser } from '../../src/api/types'
import { currentPath, fakeApi, renderWithProviders } from '../helpers'
import { openedMenu } from '../opened-menu'
import { adminThemeView } from '../theme-loader'

/** 화면이 지어낼 리 없는 이름 — `…` 의 머리에 서버가 준 값이 그대로 오는지 잰다. */
const MEMBER: SessionUser = { id: 'u-7', email: 'head@example.com', name: '머리사람 [T-HEAD]', isInstanceAdmin: false }
const ADMIN: SessionUser = { ...MEMBER, isInstanceAdmin: true }
const SERVER_MESSAGE = '세션 저장소가 응답하지 않습니다 [T-HEAD-LOGOUT]'

const PROJECT: ProjectView = { id: 'p-1', name: '관리자 콘솔', slug: 'admin', description: null, role: 'owner', themeRev: 0 }

/** 머리를 가진 셸 밖 화면 셋 — 주소와 그 화면이 부르는 조회. */
const SCREENS = [
  {
    screen: '프로젝트 설정',
    route: '/projects/p-1/settings',
    heading: '관리자 콘솔 설정',
    api: {
      getProject: async () => PROJECT,
      getProjectTheme: async () => adminThemeView(),
      listThemePackages: async () => [],
      listMembers: async () => [],
    },
  },
  { screen: '계정 설정', route: '/account', heading: '계정 설정', api: { listMyTokens: async () => [] } },
  { screen: '테마 관리', route: '/admin/themes', heading: '테마 관리', api: { listThemePackages: async () => [] } },
] as const satisfies readonly { screen: string; route: string; heading: string; api: Partial<ApiClient> }[]

type Screen = (typeof SCREENS)[number]

async function open(at: Screen, user: SessionUser, overrides: Partial<ApiClient> = {}): Promise<void> {
  renderWithProviders(<App />, {
    client: fakeApi({ me: async () => user, listProjects: async () => [], ...at.api, ...overrides }),
    route: at.route,
  })
  await screen.findByRole('heading', { name: at.heading })
}

function head(): HTMLElement {
  const found = document.body.querySelector<HTMLElement>('.wb-shell-project-head')
  if (found === null) throw new Error('머리를 찾지 못했습니다')
  return found
}

function openMenu(): string[] {
  fireEvent.click(within(head()).getByRole('button', { name: '더 보기' }))
  return within(openedMenu(head()))
    .getAllByRole('menuitem')
    .map((item) => item.textContent ?? '')
}

describe.each(SCREENS)('$screen 머리', (at) => {
  it('조작은 로고 · `…` 둘 — 옛 계정 묶음(이름 · «API 토큰» · 로그아웃 단추)은 없다', async () => {
    await open(at, MEMBER)
    const controls = [...within(head()).queryAllByRole('link'), ...within(head()).queryAllByRole('button')].map(
      (element) => element.getAttribute('aria-label') ?? element.textContent ?? '',
    )
    expect(controls).toEqual(['프로젝트 목록', '더 보기'])
    // 이름은 `…` 를 연 뒤 그 머리에만 선다(계정 설정은 «내 정보» 절에도 이름이 있어 머리 안으로 좁힌다).
    expect(within(head()).queryByText(MEMBER.name)).toBeNull()
    expect(screen.queryByRole('link', { name: 'API 토큰' })).toBeNull()
    expect(screen.queryByRole('button', { name: '로그아웃' })).toBeNull()
  })

  it('로고는 프로젝트 목록으로 간다', async () => {
    await open(at, MEMBER)
    fireEvent.click(within(head()).getByRole('link', { name: '프로젝트 목록' }))
    await screen.findByRole('heading', { name: '프로젝트' })
    expect(currentPath()).toBe('/')
  })

  it('`…` — 계정 설정 · 로그아웃, 메뉴 머리에 이름. 계정 설정은 /account', async () => {
    await open(at, MEMBER)
    expect(openMenu()).toEqual(['계정 설정', '로그아웃'])
    expect(within(openedMenu(head())).getByText(MEMBER.name)).toBeTruthy()
    expect(within(openedMenu(head())).getByRole('menuitem', { name: '계정 설정' }).getAttribute('href')).toBe('/account')
  })

  it('인스턴스 관리자에게는 «테마 관리»가 가운데에 선다 — /admin/themes', async () => {
    await open(at, ADMIN)
    expect(openMenu()).toEqual(['계정 설정', '테마 관리', '로그아웃'])
    expect(within(openedMenu(head())).getByRole('menuitem', { name: '테마 관리' }).getAttribute('href')).toBe('/admin/themes')
  })

  it('«로그아웃»은 한 번 부르고 로그인 화면으로 나간다', async () => {
    let calls = 0
    await open(at, MEMBER, {
      logout: async () => {
        calls += 1
      },
    })
    openMenu()
    fireEvent.click(within(openedMenu(head())).getByRole('menuitem', { name: '로그아웃' }))
    await waitFor(() => expect(currentPath()).toBe('/login'))
    expect(calls).toBe(1)
  })

  it('로그아웃이 실패하면 서버 문장을 머리 아래에 내고 그 화면에 남는다', async () => {
    await open(at, MEMBER, {
      logout: async () => {
        throw new ApiError(500, 'internal', SERVER_MESSAGE)
      },
    })
    openMenu()
    fireEvent.click(within(openedMenu(head())).getByRole('menuitem', { name: '로그아웃' }))
    const alert = await screen.findByText(SERVER_MESSAGE)
    expect(alert.getAttribute('role')).toBe('alert')
    // 머리 **아래** 형제다 — 머리 안에 끼면 그 줄이 두꺼워진다(`shell/page-head.tsx` 머리말).
    expect(head().contains(alert)).toBe(false)
    expect(alert.previousElementSibling).toBe(head())
    expect(currentPath()).toBe(at.route)
  })
})

describe('프로젝트 설정 머리 아래의 «에디터로 돌아가기»', () => {
  it('프로젝트를 받은 뒤 그 프로젝트의 에디터로 간다 — 받기 전에는 없다', async () => {
    let answer: (project: ProjectView) => void = () => {}
    renderWithProviders(<App />, {
      client: fakeApi({
        me: async () => MEMBER,
        ...SCREENS[0].api,
        getProject: () => new Promise<ProjectView>((resolve) => (answer = resolve)),
      }),
      route: '/projects/p-1/settings',
    })
    await screen.findByRole('heading', { name: '프로젝트 설정' })
    expect(screen.queryByRole('link', { name: '에디터로 돌아가기' })).toBeNull()

    answer(PROJECT)
    const back = await screen.findByRole('link', { name: '에디터로 돌아가기' })
    expect(back.getAttribute('href')).toBe('/projects/p-1')
  })
})
