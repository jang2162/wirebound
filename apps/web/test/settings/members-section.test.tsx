/**
 * 설정 페이지의 **«멤버»** 절(`src/settings/members-section.tsx`) — jsdom. 가짜 서버는 멤버 표를 들고 불린 수를 센다. 문장은 서버
 * 봉투(`apps/api/src/routes/members.ts` · `repos/members.ts`)의 것을 그대로 싣는다 — 화면이 그 문장을 옮기는지 잰다.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from '../../src/app'
import { ApiError, type ApiClient } from '../../src/api/client'
import type { ProjectMember, ProjectRole, ProjectView, SessionUser } from '../../src/api/types'
import { fakeApi, renderWithProviders } from '../helpers'
import { adminThemeView } from '../theme-loader'

const ME: SessionUser = { id: 'u-1', email: 'me@example.com', name: '테스터' }
const NO_ACCOUNT = '해당 이메일의 사용자가 없습니다'
const ALREADY = '이미 프로젝트 멤버입니다'
const LAST_OWNER = '프로젝트에는 owner가 최소 한 명 있어야 합니다'

function member(userId: string, name: string, role: ProjectRole): ProjectMember {
  return { userId, email: `${userId}@example.com`, name, role, invitedAt: '2026-09-01T00:00:00.000Z', active: true }
}

/** 서버처럼 도는 가짜 — 멤버 표 하나를 고치고, 설정 페이지의 역할은 그 표의 «나» 줄에서 읽는다. */
function server(myRole: ProjectRole, others: ProjectMember[] = [member('u-2', '밥', 'editor')], overrides: Partial<ApiClient> = {}) {
  let members = [member('u-1', '테스터', myRole), ...others]
  const calls = { list: 0, getProject: 0, add: [] as unknown[][], update: [] as unknown[][], remove: [] as unknown[][] }
  const mine = (): ProjectRole | undefined => members.find((m) => m.userId === ME.id)?.role
  const client = fakeApi({
    me: async () => ME,
    getProject: async (): Promise<ProjectView> => {
      calls.getProject += 1
      const role = mine()
      if (role === undefined) throw new ApiError(404, 'not-found', '프로젝트를 찾을 수 없습니다', [], true)
      return { id: 'p-1', name: '관리자 콘솔', slug: 'admin', description: null, role, themeRev: 0 }
    },
    getProjectTheme: async () => adminThemeView(),
    listThemePackages: async () => [],
    listMembers: async () => {
      calls.list += 1
      return members
    },
    addMember: async (...args) => {
      calls.add.push(args)
      const [, email, role] = args
      if (email === 'nobody@example.com') throw new ApiError(404, 'not-found', NO_ACCOUNT, [], true)
      if (members.some((m) => m.email === email)) throw new ApiError(409, 'conflict', ALREADY, [], true)
      const added = { ...member('u-9', '새사람', role), email }
      members = [...members, added]
      return added
    },
    updateMemberRole: async (...args) => {
      calls.update.push(args)
      const [, userId, role] = args
      const owners = members.filter((m) => m.role === 'owner')
      if (owners.length === 1 && owners[0]!.userId === userId && role !== 'owner') throw new ApiError(409, 'conflict', LAST_OWNER, [], true)
      members = members.map((m) => (m.userId === userId ? { ...m, role } : m))
      return members.find((m) => m.userId === userId)!
    },
    removeMember: async (...args) => {
      calls.remove.push(args)
      const [, userId] = args
      const owners = members.filter((m) => m.role === 'owner')
      if (owners.length === 1 && owners[0]!.userId === userId) throw new ApiError(409, 'conflict', LAST_OWNER, [], true)
      members = members.filter((m) => m.userId !== userId)
    },
    ...overrides,
  })
  return { client, calls }
}

async function open(client: ApiClient): Promise<HTMLElement> {
  renderWithProviders(<App />, { client, route: '/projects/p-1/settings?section=members' })
  const section = await screen.findByRole('region', { name: '멤버' })
  await within(section).findByText('u-2@example.com')
  return section
}

function row(section: HTMLElement, name: string): HTMLElement {
  const found = within(section)
    .getAllByRole('listitem')
    .find((item) => within(item).queryByText(name) !== null)
  if (found === undefined) throw new Error(`${name} 줄이 없다`)
  return found
}

describe('멤버 절 — 목록', () => {
  for (const role of ['owner', 'editor', 'viewer'] as const) {
    it(`${role} 도 목록(이름 · 이메일 · 역할)을 본다`, async () => {
      const { client, calls } = server(role)
      const section = await open(client)
      const bob = row(section, '밥')
      within(bob).getByText('u-2@example.com')
      expect(bob.textContent).toContain('editor')
      expect(calls.list).toBe(1)
    })
  }

  for (const role of ['editor', 'viewer'] as const) {
    it(`${role} 에게는 초대 폼 · 역할 바꾸기 · 제외가 없다`, async () => {
      const { client } = server(role)
      const section = await open(client)
      expect(within(section).queryByRole('button', { name: '초대' })).toBeNull()
      expect(within(section).queryByRole('combobox')).toBeNull()
      expect(within(section).queryByRole('button', { name: /제외/ })).toBeNull()
    })
  }
})

describe('멤버 절 — 비활성 표지', () => {
  it('비활성 사용자의 줄에만 «비활성» 이 선다 — 행은 그대로 남는다(역할 · 제외도 그대로)', async () => {
    const { client } = server('owner', [member('u-2', '밥', 'editor'), { ...member('u-3', '떠난사람', 'owner'), active: false }])
    const section = await open(client)
    expect(within(row(section, '떠난사람')).getByText('비활성')).toBeTruthy()
    expect(within(row(section, '밥')).queryByText('비활성')).toBeNull()
    expect(within(row(section, '테스터')).queryByText('비활성')).toBeNull()
    expect(within(row(section, '떠난사람')).getByRole('combobox', { name: '떠난사람의 역할' })).toBeTruthy()
  })
})

describe('멤버 절 — owner', () => {
  function invite(section: HTMLElement, email: string, role: ProjectRole): void {
    fireEvent.change(within(section).getByLabelText('초대할 이메일'), { target: { value: email } })
    fireEvent.change(within(section).getByLabelText('초대할 역할'), { target: { value: role } })
    fireEvent.click(within(section).getByRole('button', { name: '초대' }))
  }

  it('초대하면 `addMember` 한 번 · 목록을 다시 받아 새 줄이 선다 · 이메일 칸을 비운다', async () => {
    const { client, calls } = server('owner')
    const section = await open(client)
    invite(section, 'new@example.com', 'viewer')
    await within(section).findByText('new@example.com')
    expect(calls.add).toEqual([['p-1', 'new@example.com', 'viewer']])
    expect(calls.list).toBe(2)
    expect((within(section).getByLabelText('초대할 이메일') as HTMLInputElement).value).toBe('')
  })

  it('없는 계정(404) · 이미 멤버(409)는 서버 문장을 그대로 보인다', async () => {
    const { client } = server('owner')
    const section = await open(client)
    invite(section, 'nobody@example.com', 'editor')
    await within(section).findByText(NO_ACCOUNT)
    invite(section, 'u-2@example.com', 'editor')
    await within(section).findByText(ALREADY)
  })

  it('역할을 바꾸면 `updateMemberRole` 한 번 · 목록이 새 역할이다', async () => {
    const { client, calls } = server('owner')
    const section = await open(client)
    fireEvent.change(within(row(section, '밥')).getByLabelText('밥의 역할'), { target: { value: 'viewer' } })
    await waitFor(() => expect(calls.update).toEqual([['p-1', 'u-2', 'viewer']]))
    await waitFor(() => expect((within(row(section, '밥')).getByLabelText('밥의 역할') as HTMLSelectElement).value).toBe('viewer'))
  })

  it('마지막 owner 강등(409)은 서버 문장을 보이고 고르개는 서버 값으로 돌아간다', async () => {
    const { client, calls } = server('owner')
    const section = await open(client)
    fireEvent.change(within(row(section, '테스터')).getByLabelText('테스터의 역할'), { target: { value: 'editor' } })
    await within(section).findByText(LAST_OWNER)
    expect(calls.update).toHaveLength(1)
    expect((within(row(section, '테스터')).getByLabelText('테스터의 역할') as HTMLSelectElement).value).toBe('owner')
  })

  it('제외는 확인을 한 번 더 받는다 — 첫 누름은 요청 0, 확정하면 `removeMember` 한 번 · 줄이 빠진다', async () => {
    const { client, calls } = server('owner')
    const section = await open(client)
    fireEvent.click(within(row(section, '밥')).getByRole('button', { name: '밥 제외' }))
    expect(calls.remove).toEqual([])
    fireEvent.click(within(row(section, '밥')).getByRole('button', { name: '밥 제외 확정' }))
    await waitFor(() => expect(within(section).queryByText('u-2@example.com')).toBeNull())
    expect(calls.remove).toEqual([['p-1', 'u-2']])
  })

  it('제외 확정은 연타의 둘째 누름(`detail > 1`)을 버린다', async () => {
    const { client, calls } = server('owner')
    const section = await open(client)
    fireEvent.click(within(row(section, '밥')).getByRole('button', { name: '밥 제외' }))
    fireEvent.click(within(row(section, '밥')).getByRole('button', { name: '밥 제외 확정' }), { detail: 2 })
    expect(calls.remove).toEqual([])
  })

  it('마지막 owner 제외(409)는 서버 문장을 보이고 줄은 남는다', async () => {
    const { client, calls } = server('owner')
    const section = await open(client)
    fireEvent.click(within(row(section, '테스터')).getByRole('button', { name: '테스터 제외' }))
    fireEvent.click(within(row(section, '테스터')).getByRole('button', { name: '테스터 제외 확정' }))
    await within(section).findByText(LAST_OWNER)
    expect(calls.remove).toHaveLength(1)
    row(section, '테스터')
  })
})

describe('멤버 절 — 나를 바꾸면 설정 페이지가 권한을 다시 읽는다', () => {
  it('owner 가 둘일 때 나를 editor 로 내리면 프로젝트를 다시 받고 owner 칸이 닫힌다', async () => {
    const { client, calls } = server('owner', [member('u-2', '밥', 'owner')])
    const section = await open(client)
    expect(calls.getProject).toBe(1)
    fireEvent.change(within(row(section, '테스터')).getByLabelText('테스터의 역할'), { target: { value: 'editor' } })
    await waitFor(() => expect(within(screen.getByRole('region', { name: '멤버' })).queryByRole('button', { name: '초대' })).toBeNull())
    expect(calls.getProject).toBe(2)
    // «일반» 칸도 읽기 전용이 된다 — 같은 역할에서 판정한다(절은 탭 판 안이라 탭을 옮겨 본다).
    fireEvent.click(screen.getByRole('tab', { name: '일반' }))
    expect(within(screen.getByRole('region', { name: '일반' })).queryByRole('button', { name: '저장' })).toBeNull()
  })

  it('owner 가 둘일 때 나를 빼면 프로젝트를 다시 받고 — 이제 비멤버라 «찾을 수 없음» 이다', async () => {
    const { client, calls } = server('owner', [member('u-2', '밥', 'owner')])
    const section = await open(client)
    fireEvent.click(within(row(section, '테스터')).getByRole('button', { name: '테스터 제외' }))
    fireEvent.click(within(row(section, '테스터')).getByRole('button', { name: '테스터 제외 확정' }))
    await screen.findByText('프로젝트를 찾을 수 없습니다')
    expect(calls.getProject).toBe(2)
    expect(screen.queryByRole('region', { name: '멤버' })).toBeNull()
  })
})
