/**
 * 설정 페이지의 **«위험 구역»**(`src/settings/danger-section.tsx`) — 프로젝트 삭제. 목록 줄에 있던 삭제 케이스(확인 · 이름 정확히 일치 ·
 * Esc · 취소 · 실패 문장 · 함께 사라지는 것)를 이 절로 옮겼다. 확인 부품 자체의 까닭은 `src/settings/delete-confirm.tsx` 머리말.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { App } from '../../src/app'
import { ApiError, type ApiClient } from '../../src/api/client'
import type { ProjectDetail, ProjectRole, ProjectView, SessionUser } from '../../src/api/types'
import { currentPath, fakeApi, renderWithProviders } from '../helpers'
import { adminThemeView } from '../theme-loader'

const USER: SessionUser = { id: 'u-1', email: 'me@example.com', name: '테스터' }
/** 화면이 하드코딩할 리 없는 문자열이어야 서버 문장이 그대로 온 것을 잴 수 있다. */
const FORBIDDEN = '이 작업을 수행할 권한이 없습니다 [C3-403]'
const TYPE_NAME = '삭제하려면 프로젝트 이름을 입력하세요'

function project(role: ProjectRole = 'owner', name = '내 프로젝트'): ProjectView {
  return { id: 'p-own', name, slug: 'mine', description: null, role, themeRev: 0 }
}

function renderSettings(options: { role?: ProjectRole; name?: string; deleteProject?: ApiClient['deleteProject']; lists?: ProjectDetail[][] } = {}) {
  const deleteProject = vi.fn(options.deleteProject ?? (async () => undefined))
  const lists = options.lists ?? [[]]
  let call = 0
  const listProjects = vi.fn(async () => lists[Math.min(call++, lists.length - 1)] ?? [])
  renderWithProviders(<App />, {
    client: fakeApi({
      me: async () => USER,
      getProject: async () => project(options.role, options.name),
      getProjectTheme: async () => adminThemeView(),
      listThemePackages: async () => [],
      listMembers: async () => [],
      listProjects,
      deleteProject,
    }),
    route: '/projects/p-own/settings',
  })
  return { deleteProject, listProjects }
}

async function openDanger(): Promise<HTMLElement> {
  const section = await screen.findByRole('region', { name: '위험 구역' })
  fireEvent.click(within(section).getByRole('button', { name: '프로젝트 삭제' }))
  return section
}

const confirmButton = (): HTMLButtonElement => screen.getByRole('button', { name: '삭제 확정' }) as HTMLButtonElement
const type = (value: string): void => {
  fireEvent.change(screen.getByLabelText(TYPE_NAME), { target: { value } })
}

describe('위험 구역 — 누구에게', () => {
  it('owner 에게만 선다 — 페이지 맨 아래 절이다', async () => {
    renderSettings()
    const section = await screen.findByRole('region', { name: '위험 구역' })
    const sections = screen.getAllByRole('region')
    expect(sections[sections.length - 1]).toBe(section)
  })

  for (const role of ['editor', 'viewer'] as const) {
    it(`${role} 에게는 절째 없다`, async () => {
      renderSettings({ role })
      await screen.findByRole('region', { name: '멤버' })
      expect(screen.queryByRole('region', { name: '위험 구역' })).toBeNull()
      expect(screen.queryByRole('button', { name: '프로젝트 삭제' })).toBeNull()
    })
  }
})

describe('위험 구역 — 삭제 확인', () => {
  it('누르면 입력이 열리고 요청이 나가지 않는다 · 포커스가 이름 입력으로 간다', async () => {
    const h = renderSettings()
    await openDanger()
    expect(document.activeElement).toBe(screen.getByLabelText(TYPE_NAME))
    expect(h.deleteProject).not.toHaveBeenCalled()
  })

  it('이름이 정확히 일치할 때만 확정 버튼이 활성이다 — 앞뒤 공백이 붙으면 아니다', async () => {
    renderSettings()
    await openDanger()
    expect(confirmButton().disabled).toBe(true)
    type('내 프로젝')
    expect(confirmButton().disabled).toBe(true)
    type(' 내 프로젝트')
    expect(confirmButton().disabled).toBe(true)
    type('내 프로젝트 ')
    expect(confirmButton().disabled).toBe(true)
    type('내 프로젝트')
    expect(confirmButton().disabled).toBe(false)
  })

  it('무엇이 함께 사라지는지 알린다', async () => {
    renderSettings()
    await openDanger()
    screen.getByText(/메뉴·페이지·편집 이력.*함께 사라집니다/)
  })

  it('Esc 로 닫힌다 · 요청 0', async () => {
    const h = renderSettings()
    await openDanger()
    fireEvent.keyDown(screen.getByLabelText(TYPE_NAME), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByLabelText(TYPE_NAME)).toBeNull())
    expect(h.deleteProject).not.toHaveBeenCalled()
  })

  it('취소로 닫힌다', async () => {
    renderSettings()
    await openDanger()
    fireEvent.click(screen.getByRole('button', { name: '삭제 취소' }))
    await waitFor(() => expect(screen.queryByLabelText(TYPE_NAME)).toBeNull())
  })
})

describe('위험 구역 — 삭제', () => {
  it('확정하면 `deleteProject` 한 번 · 목록으로 가고 목록에 그 프로젝트가 없다', async () => {
    const other: ProjectDetail = { id: 'p-two', name: '둘째 프로젝트', slug: 'two', description: null, role: 'owner' }
    const h = renderSettings({ lists: [[other]] })
    await openDanger()
    type('내 프로젝트')
    fireEvent.click(confirmButton())

    await waitFor(() => expect(currentPath()).toBe('/'))
    expect(h.deleteProject.mock.calls).toEqual([['p-own']])
    await screen.findByText('둘째 프로젝트')
    expect(screen.queryByText('내 프로젝트')).toBeNull()
    expect(h.listProjects).toHaveBeenCalledTimes(1)
  })

  it('실패하면 서버 문장이 남고 설정 페이지에 머문다 — 확인은 열린 채다', async () => {
    const h = renderSettings({
      deleteProject: async () => {
        throw new ApiError(403, 'forbidden', FORBIDDEN, [], true)
      },
    })
    await openDanger()
    type('내 프로젝트')
    fireEvent.click(confirmButton())

    await screen.findByText(FORBIDDEN)
    expect(currentPath()).toBe('/projects/p-own/settings')
    expect((screen.getByLabelText(TYPE_NAME) as HTMLInputElement).value).toBe('내 프로젝트')
    expect(h.deleteProject).toHaveBeenCalledTimes(1)
    expect(h.listProjects).not.toHaveBeenCalled()
  })
})

/**
 * **이름 꼴의 판**(C3 리뷰 — `docs/superpowers/plans/2026-09-30-c3-review.md`). 확인은 글자 그대로 견준다(`settings/delete-confirm.tsx`
 * 머리말 «입력을 `trim`하지 않는다»). 대소문자가 다르면 안 열린다. **서버가 이름을 NFC 로 펴지 않아** 조합형(NFD)으로 붙여 만든 이름은
 * 완성형으로 쳐서는 안 열린다 — 안전 쪽 실패(지울 수 없음)이고 붙여 넣으면 열린다. 지금 동작을 값으로 적는다.
 */
describe('위험 구역 — 이름 꼴(대소문자 · NFC)', () => {
  it('대소문자가 다르면 확정이 안 열린다', async () => {
    renderSettings({ name: 'Admin Console' })
    await openDanger()
    type('admin console')
    expect(confirmButton().disabled).toBe(true)
    type('Admin Console')
    expect(confirmButton().disabled).toBe(false)
  })

  it('조합형(NFD)으로 저장된 이름은 완성형(NFC)으로 쳐서는 안 열리고, 같은 조합형이면 열린다', async () => {
    const nfd = '관리자 콘솔'.normalize('NFD')
    renderSettings({ name: nfd })
    await openDanger()
    type('관리자 콘솔'.normalize('NFC'))
    expect(confirmButton().disabled).toBe(true)
    type(nfd)
    expect(confirmButton().disabled).toBe(false)
  })
})
