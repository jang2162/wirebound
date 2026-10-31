/**
 * **FX-AD M1 — 사람이 지은 글은 방향을 격리해 그린다**(`src/shell/isolate.ts` · 리뷰 `docs/superpowers/plans/2026-11-01-rv-ad-report.md` M1).
 *
 * 화면마다 사람이 지은 글(사용자 이름 · 이메일 · 초대 링크 이름 · 프로젝트 이름)에 덮어쓰기 글자 U+202E 를 넣고, 그 화면의 글이 서는 판(표 ·
 * 확인 상자 · 결과 한 줄 · 새 링크 상자 · 고르개 · 기록 줄 · 단추 글)을 다 세운 뒤 **문서의 글 노드에 U+202E 가 하나도 안 남았는지** 센다.
 * `isolate` 는 감싸며 그 글자를 걷으므로, 남은 하나가 곧 감싸지 않은 자리다. 접근 이름 · `title`(속성)은 세지 않는다 — 감싸지 않기로 했다
 * (`isolate.ts` 머리말).
 *
 * 화면에 실제로 보이는 차례(뒤집히는가)는 실브라우저 `build-test/rv-ad-admin.test.ts` «M1» 이 잰다 — jsdom 은 글을 배치하지 않는다.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { App } from '../../src/app'
import type { ApiClient } from '../../src/api/client'
import type { AuditEntry, ProjectMember, ProjectView, SessionUser } from '../../src/api/types'
import { isolate } from '../../src/shell/isolate'
import { fakeApi, renderWithProviders, unauthenticatedError } from '../helpers'
import { adminThemeView } from '../theme-loader'
import { adminProject, adminServer, adminUser, invite, ME, type AdminServer } from './admin-server'

const RLO = String.fromCharCode(0x202e)
const PDI = String.fromCharCode(0x2069)
/** 끝을 안 닫은 덮어쓰기 · 우리 격리를 먼저 닫으려는 PDI 를 함께 든 이름. */
const spoof = (text: string): string => `${text}${PDI}${RLO}`

/** 글 노드 가운데 U+202E 가 남은 것 — 감싸지 않은 자리. */
function leaks(): string[] {
  const found: string[] = []
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const text = (node as Text).data
    if (text.includes(RLO)) found.push(`${node.parentElement?.tagName ?? '?'}: ${JSON.stringify(text)}`)
  }
  return found
}

/** 판 카나리아 — 그 글이 실제로 화면에 섰다(감싼 꼴로). */
function shown(text: string): boolean {
  return document.body.textContent?.includes(isolate(spoof(text))) === true
}

function open(server: AdminServer, route: string): void {
  renderWithProviders(<App />, { client: server.client, route })
}

function choose(name: string, item: string): void {
  fireEvent.click(screen.getByRole('button', { name: `${spoof(name)} 더 보기` }))
  fireEvent.click(screen.getByRole('menuitem', { name: item }))
}

afterEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

describe('isolate', () => {
  it('FSI … PDI 로 감싸고 안의 내장 · 덮어쓰기 · 격리 글자를 걷는다 — 방향 표지(RLM)는 둔다', () => {
    const RLM = String.fromCharCode(0x200f)
    const codes = (text: string) => [...text].map((c) => c.codePointAt(0)!.toString(16))
    expect(codes(isolate(`가${PDI}${RLO}나${RLM}`))).toEqual(['2068', 'ac00', 'b098', '200f', '2069'])
  })
})

describe('FX-AD M1 — 화면마다 U+202E 가 글 노드에 안 남는다', () => {
  it('관리자 › 사용자 — 표 · 비활성화 · 해제 상자 · 결과 한 줄 · 재설정 · 초대 링크 상자', async () => {
    const server = adminServer({
      users: [
        adminUser(ME.id, ME.name, { isInstanceAdmin: true }),
        adminUser('u-bob', spoof('밥'), { email: spoof('bob@x'), invite: { id: 'i-1', name: spoof('디자인팀') } }),
        adminUser('u-carol', spoof('캐럴'), { email: spoof('carol@x'), isInstanceAdmin: true }),
      ],
    })
    open(server, '/admin/users')
    await screen.findByRole('table', { name: '사용자' })
    const seen: Record<string, string[]> = { 표: leaks() }
    choose('밥', '비활성화')
    await screen.findByRole('dialog', { name: '비활성화' })
    seen['비활성화 상자'] = leaks()
    fireEvent.click(within(screen.getByRole('dialog', { name: '비활성화' })).getByRole('button', { name: '취소' }))
    choose('캐럴', '관리자 해제')
    const revoke = await screen.findByRole('dialog', { name: '관리자 해제' })
    seen['해제 상자'] = leaks()
    fireEvent.click(within(revoke).getByRole('button', { name: '관리자 해제' }))
    await waitFor(() => expect(server.calls.revokeInstanceAdmin).toHaveLength(1))
    await screen.findByText(/관리자 권한을 해제했습니다/)
    seen['결과 한 줄'] = leaks()
    choose('밥', '재설정 링크 만들기')
    await screen.findByText(/비밀번호 재설정 링크를 만들었습니다/)
    seen['재설정 링크 상자'] = leaks()
    fireEvent.click(screen.getByRole('button', { name: '초대 링크 만들기' }))
    const dialog = await screen.findByRole('dialog', { name: '초대 링크 만들기' })
    fireEvent.change(within(dialog).getByLabelText('이름(메모)'), { target: { value: spoof('새 팀') } })
    fireEvent.click(within(dialog).getByRole('button', { name: '만들기' }))
    await waitFor(() => expect(shown('새 팀')).toBe(true))
    seen['초대 링크 상자'] = leaks()
    expect({ bob: shown('밥'), email: shown('bob@x'), invite: shown('디자인팀') }).toEqual({ bob: true, email: true, invite: true })
    expect(seen).toEqual({ 표: [], '비활성화 상자': [], '해제 상자': [], '결과 한 줄': [], '재설정 링크 상자': [], '초대 링크 상자': [] })
  })

  it('관리자 › 초대 링크 — 표 · 거두기 상자 · 결과 한 줄', async () => {
    const server = adminServer({ invites: [invite('i-1', spoof('디자인팀'), { createdBy: { id: 'u-bob', name: spoof('밥') } })] })
    open(server, '/admin/invites')
    await screen.findByRole('table', { name: '초대 링크' })
    const seen: Record<string, string[]> = { 표: leaks() }
    fireEvent.click(screen.getByRole('button', { name: `«${spoof('디자인팀')}» 더 보기` }))
    fireEvent.click(screen.getByRole('menuitem', { name: '거두기' }))
    const dialog = await screen.findByRole('dialog', { name: '초대 링크 거두기' })
    seen['거두기 상자'] = leaks()
    fireEvent.click(within(dialog).getByRole('button', { name: '거두기' }))
    await screen.findByText(/거뒀습니다/)
    seen['결과 한 줄'] = leaks()
    expect({ name: shown('디자인팀'), by: shown('밥') }).toEqual({ name: true, by: true })
    expect(seen).toEqual({ 표: [], '거두기 상자': [], '결과 한 줄': [] })
  })

  it('관리자 › 프로젝트 — 표(링크 · owner) · owner 넘기기 상자 · 고르개 · 결과 한 줄', async () => {
    const server = adminServer({
      users: [adminUser(ME.id, ME.name, { isInstanceAdmin: true }), adminUser('u-bob', spoof('밥'), { email: spoof('bob@x') })],
      projects: [
        adminProject('p-mine', spoof('내 것')),
        adminProject('p-orphan', spoof('고아'), {
          owners: [{ id: 'u-gone', name: spoof('떠난사람'), active: false }],
          hasActiveOwner: false,
        }),
      ],
      mine: ['p-mine'],
    })
    open(server, '/admin/projects')
    await screen.findByRole('table', { name: '프로젝트' })
    const seen: Record<string, string[]> = { 표: leaks() }
    choose('고아', 'owner 넘기기')
    const dialog = await screen.findByRole('dialog', { name: 'owner 넘기기' })
    const pick = (await within(dialog).findByLabelText('새 owner')) as HTMLSelectElement
    seen['상자 · 고르개'] = leaks()
    fireEvent.change(pick, { target: { value: 'u-bob' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'owner 로 만들기' }))
    await screen.findByText(/owner 를 넘겼습니다/)
    seen['결과 한 줄'] = leaks()
    expect({ mine: shown('내 것'), owner: shown('떠난사람') }).toEqual({ mine: true, owner: true })
    expect(seen).toEqual({ 표: [], '상자 · 고르개': [], '결과 한 줄': [] })
  })

  it('관리자 › 기록 — 줄(사람 · 링크 · 프로젝트) · 누가 · 사람 고르개', async () => {
    const server = adminServer({
      users: [adminUser(ME.id, ME.name, { isInstanceAdmin: true }), adminUser('u-bob', spoof('밥'), { email: spoof('bob@x') })],
    })
    const who = { id: 'u-bob', name: spoof('밥'), email: spoof('bob@x') }
    const entry = (id: string, action: AuditEntry['action'], extra: Partial<AuditEntry>): AuditEntry => ({
      id,
      at: '2026-11-01T00:00:00.000Z',
      action,
      actor: { kind: 'user', id: 'u-bob', name: spoof('밥') },
      targetUser: null,
      project: null,
      invite: null,
      detail: {},
      ...extra,
    })
    server.audit.pages = [
      {
        entries: [
          entry('a', 'invite.signup', { invite: { id: 'i', name: spoof('디자인팀') }, targetUser: who }),
          entry('b', 'project.owner', { project: { id: 'p', name: spoof('고아') }, targetUser: who }),
        ],
        next: null,
      },
    ]
    open(server, '/admin/audit')
    await screen.findByRole('table', { name: '기록' })
    await waitFor(() => expect(screen.getByLabelText('사람').querySelectorAll('option').length).toBe(3))
    expect({ who: shown('밥'), invite: shown('디자인팀'), project: shown('고아') }).toEqual({ who: true, invite: true, project: true })
    expect(leaks()).toEqual([])
  })

  it('프로젝트 설정 › 멤버 — 이름 · 이메일 · 제외 단추 · 확정 단추', async () => {
    const me: SessionUser = { id: 'u-1', email: 'me@example.com', name: '테스터' }
    const member = (userId: string, name: string, email: string, role: ProjectMember['role']): ProjectMember => ({
      userId,
      email,
      name,
      role,
      invitedAt: '2026-09-01T00:00:00.000Z',
      active: true,
    })
    const client: ApiClient = fakeApi({
      me: async () => me,
      getProject: async (): Promise<ProjectView> => ({
        id: 'p-1',
        name: '콘솔',
        slug: 'admin',
        description: null,
        role: 'owner',
        themeRev: 0,
      }),
      getProjectTheme: async () => adminThemeView(),
      listThemePackages: async () => [],
      listMembers: async () => [member('u-1', '테스터', 'me@example.com', 'owner'), member('u-2', spoof('밥'), spoof('bob@x'), 'editor')],
    })
    renderWithProviders(<App />, { client, route: '/projects/p-1/settings?section=members' })
    const section = await screen.findByRole('region', { name: '멤버' })
    await waitFor(() => expect(shown('bob@x')).toBe(true))
    const seen: Record<string, string[]> = { 줄: leaks() }
    // 밥의 줄 — 단추는 이름이 아니라 끝 글로 찾는다(이름이 안 감싸져도 판이 서 값으로 죽게).
    const bob = within(section)
      .getAllByRole('listitem')
      .find((item) => item.textContent?.includes('bob@x') === true)!
    fireEvent.click(within(bob).getByRole('button', { name: /제외$/ }))
    seen['확정 단추'] = leaks()
    expect(within(bob).getByRole('button', { name: /제외 확정$/ })).toBeTruthy()
    expect(seen).toEqual({ 줄: [], '확정 단추': [] })
  })

  it('비밀번호 재설정 화면 — 누구의 비밀번호인지 말하는 문장', async () => {
    const client = fakeApi({
      me: async () => Promise.reject(unauthenticatedError()),
      getPasswordReset: async () => ({ email: spoof('target@x'), name: spoof('대상') }),
    })
    renderWithProviders(<App />, { client, route: '/reset/tok-9' })
    await screen.findByText(/의 새 비밀번호를 정합니다/)
    await act(async () => {})
    expect({ name: shown('대상'), email: shown('target@x') }).toEqual({ name: true, email: true })
    expect(leaks()).toEqual([])
  })
})
