/**
 * **프로젝트 설정 페이지**(`routes/settings.tsx`)의 뼈대와 «일반» 절 — 이름 · 슬러그 · 설명. «테마» 절은
 * `test/settings/theme-chooser.test.tsx` · `token-editor.test.tsx` 가 잰다.
 *
 * 목록 줄의 인라인 «수정» 은 이 페이지로 옮겼다 — 목록에는 «설정» 링크만 남는다(마지막 절).
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { App } from '../../src/app'
import { ApiError, type ApiClient } from '../../src/api/client'
import type { ProjectDetail, ProjectRole, ProjectView, SessionUser } from '../../src/api/types'
import { currentPath, fakeApi, renderWithProviders } from '../helpers'
import { adminThemeView } from '../theme-loader'
import { docWithText, openPage, PROJECT_ID, PROJECT_NAME, SHELL_MENU } from '../editor-harness'

const USER: SessionUser = { id: 'u-1', email: 'me@example.com', name: '테스터' }

function project(role: ProjectRole = 'owner', overrides: Partial<ProjectView> = {}): ProjectView {
  return { id: 'p-1', name: '관리자 콘솔', slug: 'admin', description: '운영 도구', role, themeRev: 0, ...overrides }
}

/** 설정 페이지를 연다. 테마 절이 부르는 셋은 기본으로 비어 있지 않은 값을 준다 — 이 파일은 «일반» 을 잰다. */
function renderSettings(overrides: Partial<ApiClient> = {}): void {
  renderWithProviders(<App />, {
    client: fakeApi({
      me: async () => USER,
      getProject: async () => project(),
      getProjectTheme: async () => adminThemeView(),
      listThemePackages: async () => [],
      listMembers: async () => [],
      ...overrides,
    }),
    route: '/projects/p-1/settings',
  })
}

function field(name: string): HTMLInputElement {
  return within(screen.getByRole('region', { name: '일반' })).getByLabelText(name)
}

function type(name: string, value: string): void {
  fireEvent.change(field(name), { target: { value } })
}

describe('설정 페이지 — 뼈대', () => {
  it('머리에 프로젝트 이름 · 편집기로 · 프로젝트 목록, «일반» 칸 셋이 지금 값이다', async () => {
    renderSettings()
    await screen.findByRole('heading', { name: '관리자 콘솔 설정' })
    expect(screen.getByRole('link', { name: '편집기로' }).getAttribute('href')).toBe('/projects/p-1')
    expect(screen.getByRole('link', { name: '프로젝트 목록' }).getAttribute('href')).toBe('/')
    expect(field('이름').value).toBe('관리자 콘솔')
    expect(field('슬러그').value).toBe('admin')
    expect(field('설명').value).toBe('운영 도구')
    expect(document.querySelector('main.wb-shell-settings')).not.toBeNull()
  })

  it('비멤버(404)면 «프로젝트를 찾을 수 없습니다» 와 목록 링크', async () => {
    renderSettings({
      getProject: async () => {
        throw new ApiError(404, 'not-found', '프로젝트를 찾을 수 없습니다')
      },
    })
    await screen.findByText('프로젝트를 찾을 수 없습니다')
    expect(screen.getByRole('link', { name: '프로젝트 목록' }).getAttribute('href')).toBe('/')
    expect(screen.queryByRole('region', { name: '일반' })).toBeNull()
  })
})

describe('설정 페이지 — «일반»', () => {
  it('owner 가 이름만 바꿔 저장하면 바뀐 키 하나만 보낸다', async () => {
    const updateProject = vi.fn(async (_id: string, body: Partial<ProjectDetail>) => ({ ...project(), ...body }))
    renderSettings({ updateProject })
    await screen.findByRole('heading', { name: '관리자 콘솔 설정' })
    type('이름', '새 이름')
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(updateProject).toHaveBeenCalledTimes(1))
    expect(updateProject.mock.calls[0]).toEqual(['p-1', { name: '새 이름' }])
    await screen.findByRole('heading', { name: '새 이름 설정' })
    expect(screen.getByText('저장했습니다')).toBeDefined()
  })

  it('설명을 비워 저장하면 description: null 을 보낸다 — 지우는 뜻이다', async () => {
    const updateProject = vi.fn(async () => project('owner', { description: null }))
    renderSettings({ updateProject })
    await screen.findByRole('heading', { name: '관리자 콘솔 설정' })
    type('설명', '')
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(updateProject).toHaveBeenCalledTimes(1))
    expect(updateProject.mock.calls[0]).toEqual(['p-1', { description: null }])
  })

  it('설명이 null 이면 빈 칸으로 선다 — «null» 글자가 아니다', async () => {
    renderSettings({ getProject: async () => project('owner', { description: null }) })
    await screen.findByRole('heading', { name: '관리자 콘솔 설정' })
    expect(field('설명').value).toBe('')
    // 비어 있는 채로 두면 바뀐 것이 아니다 — `null` 을 다시 보내지 않는다.
    expect((screen.getByRole('button', { name: '저장' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('이름이나 슬러그를 비우면 보내지 않고 그렇다고 말한다', async () => {
    const updateProject = vi.fn(async () => project())
    renderSettings({ updateProject })
    await screen.findByRole('heading', { name: '관리자 콘솔 설정' })
    type('이름', '')
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    await screen.findByText('이름과 슬러그는 비울 수 없습니다')
    expect(updateProject).not.toHaveBeenCalled()
  })

  it('바꾼 것이 없으면 저장 단추가 꺼져 있다', async () => {
    renderSettings()
    await screen.findByRole('heading', { name: '관리자 콘솔 설정' })
    expect((screen.getByRole('button', { name: '저장' }) as HTMLButtonElement).disabled).toBe(true)
    type('이름', '관리자 콘솔 2')
    expect((screen.getByRole('button', { name: '저장' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('슬러그 409 는 슬러그 칸 옆에 «이미 쓰는 슬러그입니다»', async () => {
    renderSettings({
      updateProject: async () => {
        throw new ApiError(409, 'conflict', '이미 사용 중인 슬러그입니다')
      },
    })
    await screen.findByRole('heading', { name: '관리자 콘솔 설정' })
    type('슬러그', 'taken')
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    const alert = await screen.findByText('이미 쓰는 슬러그입니다')
    expect(alert.closest('.wb-shell-settings-field')?.querySelector('input')).toBe(field('슬러그'))
    // 친 값은 남는다 — 고칠 자리를 잃지 않는다.
    expect(field('슬러그').value).toBe('taken')
  })

  it('400 은 서버 문장을 그대로', async () => {
    const message = '슬러그는 소문자·숫자·하이픈만 쓸 수 있고, 하이픈으로 시작하거나 끝날 수 없습니다'
    renderSettings({
      updateProject: async () => {
        throw new ApiError(400, 'bad-request', message)
      },
    })
    await screen.findByRole('heading', { name: '관리자 콘솔 설정' })
    type('슬러그', 'Bad')
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    await screen.findByText(message)
  })

  it.each(['editor', 'viewer'] as const)('%s 는 칸이 읽기 전용이고 저장 단추가 없다', async (role) => {
    renderSettings({ getProject: async () => project(role) })
    await screen.findByRole('heading', { name: '관리자 콘솔 설정' })
    for (const name of ['이름', '슬러그', '설명']) expect(field(name).readOnly, name).toBe(true)
    expect(within(screen.getByRole('region', { name: '일반' })).queryByRole('button', { name: '저장' })).toBeNull()
  })
})

describe('설정으로 가는 길', () => {
  it.each(['owner', 'editor', 'viewer'] as const)('에디터 머리의 `…` 에 «프로젝트 설정» 링크가 있다 — %s', async (role) => {
    await openPage(docWithText('t1', '안'), { apiOverrides: { getProject: async () => project(role, { id: PROJECT_ID, name: PROJECT_NAME }) } })
    fireEvent.click(screen.getByRole('button', { name: SHELL_MENU }))
    const link = screen.getByRole('menuitem', { name: '프로젝트 설정' })
    expect(link.getAttribute('href')).toBe(`/projects/${PROJECT_ID}/settings`)
  })

  it('목록 줄마다 «설정» 링크가 있고 «수정» 은 없다 — 이름 바꾸기는 설정 페이지다', async () => {
    const rows = [project('owner', { id: 'p-o', name: 'owner 것' }), project('viewer', { id: 'p-v', name: 'viewer 것' })]
    renderWithProviders(<App />, { client: fakeApi({ me: async () => USER, listProjects: async () => rows }), route: '/' })
    await screen.findByText('owner 것')
    for (const row of rows) {
      expect(screen.getByRole('link', { name: `${row.name} 설정` }).getAttribute('href')).toBe(`/projects/${row.id}/settings`)
      expect(screen.queryByRole('button', { name: `${row.name} 수정` })).toBeNull()
    }
    fireEvent.click(screen.getByRole('link', { name: 'owner 것 설정' }))
    expect(currentPath()).toBe('/projects/p-o/settings')
  })
})
