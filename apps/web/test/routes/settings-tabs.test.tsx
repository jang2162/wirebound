/**
 * **프로젝트 설정의 절 목차**(`routes/settings.tsx` 머리말 «절 목차») — jsdom. 왼쪽 세로 탭이 절 하나씩을 보이고, 주소의 `?section=` 이
 * 고른 절을 든다. 재는 것: 접근 이름과 탭 ↔ 판의 이음 · 주소로 절 열기(모르는 값 · 없는 절은 «일반») · 고르면 주소가 바뀐다 ·
 * 키보드(↑↓ ←→ Home End · 로빙 `tabIndex`) · 탭을 옮겨도 친 값이 남는다 · viewer 는 «위험 구역» 탭이 없고 테마 칸이 읽기 전용이다.
 *
 * 각 절의 내용은 그 절의 파일이 잰다(`test/routes/settings.test.tsx` «일반» · `test/settings/*`).
 */
import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from '../../src/app'
import type { ProjectRole, ProjectView, SessionUser } from '../../src/api/types'
import { currentSearch, fakeApi, renderWithProviders } from '../helpers'
import { adminThemeView } from '../theme-loader'

const USER: SessionUser = { id: 'u-1', email: 'me@example.com', name: '테스터' }
const OWNER_TABS = ['일반', '테마', '멤버', '위험 구역']

function project(role: ProjectRole): ProjectView {
  return { id: 'p-1', name: '관리자 콘솔', slug: 'admin', description: '운영 도구', role, themeRev: 0 }
}

async function renderSettings(options: { role?: ProjectRole; query?: string } = {}): Promise<void> {
  renderWithProviders(<App />, {
    client: fakeApi({
      me: async () => USER,
      getProject: async () => project(options.role ?? 'owner'),
      getProjectTheme: async () => adminThemeView(),
      listThemePackages: async () => [],
      listMembers: async () => [],
    }),
    route: `/projects/p-1/settings${options.query ?? ''}`,
  })
  await screen.findByRole('tablist', { name: '설정 절' })
}

const tabNames = (): string[] => screen.getAllByRole('tab').map((tab) => tab.textContent ?? '')
const selectedTab = (): string => screen.getAllByRole('tab').find((tab) => tab.getAttribute('aria-selected') === 'true')?.textContent ?? ''
/** 보이는 절(`<section>`)의 이름들 — 숨은 판의 절은 접근성 트리에 없다. 테마 절 안의 «미리보기» 영역은 절이 아니라 뺀다. */
const visibleSections = (): string[] =>
  screen
    .getAllByRole('region')
    .filter((region) => region.tagName === 'SECTION')
    .map((region) => document.getElementById(region.getAttribute('aria-labelledby') ?? '')?.textContent ?? '')

/** 판 안의 절 이름 — 숨은 판도 본다. */
const sectionIn = (panel: HTMLElement): string =>
  document.getElementById(panel.querySelector('section')?.getAttribute('aria-labelledby') ?? '')?.textContent ?? ''

describe('설정 절 목차 — 접근 이름과 이음', () => {
  it('세로 탭 목록 «설정 절» 에 탭 넷 · 탭은 제 판을 가리키고 판은 탭을 이름으로 갖는다 · 고른 판 하나만 보인다', async () => {
    await renderSettings()
    const list = screen.getByRole('tablist', { name: '설정 절' })
    expect(list.getAttribute('aria-orientation')).toBe('vertical')
    expect(tabNames()).toEqual(OWNER_TABS)
    for (const tab of screen.getAllByRole('tab')) {
      const panel = document.getElementById(tab.getAttribute('aria-controls') ?? '')
      expect(panel?.getAttribute('role'), tab.textContent ?? '').toBe('tabpanel')
      expect(panel?.getAttribute('aria-labelledby')).toBe(tab.id)
      // 판 안의 절이 그 탭의 이름과 같은 이름이다.
      expect(sectionIn(panel!)).toBe(tab.textContent)
    }
    expect(selectedTab()).toBe('일반')
    expect(screen.getAllByRole('tabpanel').map((panel) => panel.getAttribute('aria-labelledby'))).toEqual([
      screen.getByRole('tab', { name: '일반' }).id,
    ])
    expect(visibleSections()).toEqual(['일반'])
  })
})

describe('설정 절 목차 — 주소', () => {
  it.each([
    ['?section=theme', '테마'],
    ['?section=members', '멤버'],
    ['?section=danger', '위험 구역'],
    ['?section=general', '일반'],
    ['?section=zzz', '일반'],
    ['', '일반'],
  ])('%s 로 열면 «%s» 가 고른 탭이고 그 절만 보인다', async (query, name) => {
    await renderSettings({ query })
    expect(selectedTab()).toBe(name)
    expect(visibleSections()).toEqual([name])
  })

  it('탭을 고르면 주소의 `section` 이 바뀌고 다른 질의는 남는다', async () => {
    await renderSettings({ query: '?from=list' })
    fireEvent.click(screen.getByRole('tab', { name: '멤버' }))
    expect(new URLSearchParams(currentSearch()).get('section')).toBe('members')
    expect(new URLSearchParams(currentSearch()).get('from')).toBe('list')
    expect(visibleSections()).toEqual(['멤버'])
    fireEvent.click(screen.getByRole('tab', { name: '테마' }))
    expect(new URLSearchParams(currentSearch()).get('section')).toBe('theme')
    expect(visibleSections()).toEqual(['테마'])
  })
})

describe('설정 절 목차 — 키보드', () => {
  it('고른 탭만 Tab 정지점이다(로빙 tabIndex)', async () => {
    await renderSettings({ query: '?section=members' })
    expect(screen.getAllByRole('tab').map((tab) => tab.tabIndex)).toEqual([-1, -1, 0, -1])
  })

  it('↓ ↑ 는 다음 · 앞 탭으로 옮겨 그 절을 열고 포커스를 옮긴다 — 끝에서 돌아간다', async () => {
    await renderSettings()
    const list = screen.getByRole('tablist', { name: '설정 절' })
    screen.getByRole('tab', { name: '일반' }).focus()
    fireEvent.keyDown(list, { key: 'ArrowDown' })
    expect(selectedTab()).toBe('테마')
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: '테마' }))
    expect(visibleSections()).toEqual(['테마'])
    fireEvent.keyDown(list, { key: 'ArrowUp' })
    fireEvent.keyDown(list, { key: 'ArrowUp' })
    expect(selectedTab()).toBe('위험 구역')
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: '위험 구역' }))
  })

  it('→ ← 도 옮긴다(좁은 창의 가로 줄) · Home · End 는 처음 · 끝', async () => {
    await renderSettings()
    const list = screen.getByRole('tablist', { name: '설정 절' })
    fireEvent.keyDown(list, { key: 'ArrowRight' })
    expect(selectedTab()).toBe('테마')
    fireEvent.keyDown(list, { key: 'End' })
    expect(selectedTab()).toBe('위험 구역')
    fireEvent.keyDown(list, { key: 'ArrowLeft' })
    expect(selectedTab()).toBe('멤버')
    fireEvent.keyDown(list, { key: 'Home' })
    expect(selectedTab()).toBe('일반')
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: '일반' }))
  })

  it('다른 키는 고른 탭을 안 바꾼다', async () => {
    await renderSettings()
    fireEvent.keyDown(screen.getByRole('tablist', { name: '설정 절' }), { key: 'a' })
    expect(selectedTab()).toBe('일반')
  })
})

describe('설정 절 목차 — 탭을 옮겨도 남는다', () => {
  it('«일반» 에 친 이름이 «멤버» 로 갔다 와도 남는다', async () => {
    await renderSettings()
    const name = within(screen.getByRole('region', { name: '일반' })).getByLabelText('이름') as HTMLInputElement
    fireEvent.change(name, { target: { value: '바꾼 이름' } })
    fireEvent.click(screen.getByRole('tab', { name: '멤버' }))
    fireEvent.click(screen.getByRole('tab', { name: '일반' }))
    expect((within(screen.getByRole('region', { name: '일반' })).getByLabelText('이름') as HTMLInputElement).value).toBe('바꾼 이름')
  })
})

describe('설정 절 목차 — 역할', () => {
  it.each(['editor', 'viewer'] as const)('%s 에게는 «위험 구역» 탭이 없다', async (role) => {
    await renderSettings({ role })
    expect(tabNames()).toEqual(['일반', '테마', '멤버'])
  })

  it('viewer 가 «테마» 를 주소로 열면 토큰 칸이 읽기 전용이고 고르개 · 저장이 없다', async () => {
    await renderSettings({ role: 'viewer', query: '?section=theme' })
    const theme = screen.getByRole('region', { name: '테마' })
    const tokens = await within(theme).findByRole('group', { name: '토큰' })
    const fields = within(tokens).getAllByRole('textbox') as HTMLInputElement[]
    expect(fields.length).toBeGreaterThan(0)
    expect(fields.every((field) => field.readOnly)).toBe(true)
    expect(within(theme).queryByLabelText('버전')).toBeNull()
    expect(within(theme).queryByRole('button', { name: '토큰 저장' })).toBeNull()
  })
})
