/**
 * **RV-AD — 관리자 칸 넷의 리뷰 재현**(jsdom · 가짜 서버 `test/admin/admin-server.ts`). 리뷰 보고 `docs/superpowers/plans/2026-11-01-rv-ad-report.md`
 * 의 발견 번호를 케이스 이름 머리에 단다. 실브라우저 판은 `build-test/rv-ad-admin.test.ts`.
 *
 * - `describe.skip` 은 지금 빨강인 판이다 — **고칠 트랙이 skip 을 떼고 초록으로 돌린다.**
 * - 그 밖은 지금 참인 성질을 잠근다(고치기 전에도 초록이다).
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/app'
import { ApiError } from '../src/api/client'
import type { AdminProject, AdminUser, SessionUser } from '../src/api/types'
import { COPIED } from '../src/admin/link-reveal'
import { renderWithProviders } from './helpers'
import { adminProject, adminServer, adminUser, ME, type AdminServer } from './admin/admin-server'

const BOB = adminUser('u-bob', '밥')
const CAROL = adminUser('u-carol', '캐럴')
const DAVE = adminUser('u-dave', '데이브', { active: false })

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function open(server: AdminServer, route: string): void {
  renderWithProviders(<App />, { client: server.client, route })
}

function rowOf(table: HTMLElement, name: string): HTMLElement {
  const found = within(table)
    .getAllByRole('row')
    .find((tr) => tr.querySelector('td')?.textContent?.startsWith(name) === true)
  if (found === undefined) throw new Error(`${name} 줄이 없다`)
  return found
}

function choose(table: HTMLElement, name: string, item: string): void {
  fireEvent.click(within(rowOf(table, name)).getByRole('button', { name: `${name} 더 보기` }))
  fireEvent.click(screen.getByRole('menuitem', { name: item }))
}

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
  sessionStorage.clear()
})

// 고칠 트랙이 skip 을 떼고 초록으로 돌린다.
describe.skip('RV-AD H1 — 새 링크가 앞 링크의 «복사했습니다» 를 물려받는다', () => {
  it('사용자 칸 — 밥의 재설정 링크를 복사한 뒤 초대 링크를 만들면, 새 링크 상자에 «복사했습니다» 가 남아 있지 않다', async () => {
    const writeText = vi.fn(async (_text: string) => {})
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    const server = adminServer({ users: [adminUser(ME.id, ME.name, { isInstanceAdmin: true }), BOB] })
    open(server, '/admin/users')
    const table = await screen.findByRole('table', { name: '사용자' })
    choose(table, '밥', '재설정 링크 만들기')
    const resetBox = await screen.findByRole('region', { name: '밥의 비밀번호 재설정 링크' })
    fireEvent.click(within(resetBox).getByRole('button', { name: '복사' }))
    await within(resetBox).findByText(COPIED)
    expect(writeText).toHaveBeenLastCalledWith(`${window.location.origin}/reset/reset-token-u-bob`)

    fireEvent.click(screen.getByRole('button', { name: '초대 링크 만들기' }))
    const dialog = await screen.findByRole('dialog', { name: '초대 링크 만들기' })
    fireEvent.change(within(dialog).getByLabelText('이름(메모)'), { target: { value: '새 팀' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '만들기' }))
    const inviteBox = await screen.findByRole('region', { name: '초대 링크 «새 팀»' })
    // 클립보드에는 아직 밥의 재설정 링크가 있다 — 이 상자가 «복사했습니다» 라고 말하면 사람은 그것을 새 팀에 붙여 넣는다.
    expect(writeText).toHaveBeenCalledTimes(1)
    expect({
      field: (within(inviteBox).getByLabelText('링크') as HTMLInputElement).value,
      copied: within(inviteBox).queryByText(COPIED) !== null,
    }).toEqual({ field: `${window.location.origin}/invite/invite-token-i-1`, copied: false })
  })

  it('초대 링크 칸 — 링크 A 를 복사한 뒤 링크 B 를 만들면 «복사했습니다» 가 남아 있지 않다', async () => {
    const writeText = vi.fn(async (_text: string) => {})
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    const server = adminServer()
    open(server, '/admin/invites')
    async function create(name: string): Promise<HTMLElement> {
      fireEvent.click(await screen.findByRole('button', { name: '초대 링크 만들기' }))
      const dialog = await screen.findByRole('dialog', { name: '초대 링크 만들기' })
      fireEvent.change(within(dialog).getByLabelText('이름(메모)'), { target: { value: name } })
      fireEvent.click(within(dialog).getByRole('button', { name: '만들기' }))
      return screen.findByRole('region', { name: `초대 링크 «${name}»` })
    }
    const a = await create('A')
    fireEvent.click(within(a).getByRole('button', { name: '복사' }))
    await within(a).findByText(COPIED)
    const b = await create('B')
    expect(within(b).queryByText(COPIED)).toBeNull()
  })
})

describe('RV-AD — 잘못된 사람에게 쓰기(지금 참인 성질)', () => {
  it('확인 상자가 떠 있는 동안 목록이 다른 차례로 다시 그려져도 확정은 상자를 연 줄의 사람(id)에게 간다', async () => {
    const server = adminServer({ users: [adminUser(ME.id, ME.name, { isInstanceAdmin: true }), BOB, CAROL, DAVE] })
    const pending = deferred<{ user: AdminUser }>()
    const activate = server.client.activateUser
    server.client.activateUser = (id) => {
      server.calls.activateUser.push([id])
      return pending.promise.then(() => activate(id))
    }
    open(server, '/admin/users')
    const table = await screen.findByRole('table', { name: '사용자' })
    // 데이브를 다시 활성화(답이 늦다) → 그동안 밥의 비활성화 상자를 연다.
    choose(table, '데이브', '다시 활성화')
    choose(table, '밥', '비활성화')
    const dialog = await screen.findByRole('dialog', { name: '비활성화' })
    // 다른 관리자가 그새 사람을 더했고 차례가 바뀌었다 — 답이 오면 목록을 다시 받는다.
    server.users = [adminUser('u-zed', '밥밥'), CAROL, BOB, adminUser(ME.id, ME.name, { isInstanceAdmin: true }), DAVE]
    await act(async () => pending.resolve({ user: DAVE }))
    await waitFor(() => expect(within(screen.getByRole('table', { name: '사용자' })).getAllByRole('row')).toHaveLength(6))
    expect(within(dialog).getByText(/계정을 비활성화합니다/).textContent).toContain('밥(u-bob@example.com)')
    await waitFor(() => expect((within(dialog).getByRole('button', { name: '비활성화' }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(within(dialog).getByRole('button', { name: '비활성화' }))
    await waitFor(() => expect(server.calls.deactivateUser).toEqual([['u-bob']]))
  })

  it('«더 보기» 를 겹쳐 눌러도 다음 쪽 조회는 하나 · 같은 줄이 두 번 서지 않는다', async () => {
    const server = adminServer({ users: [adminUser(ME.id, ME.name, { isInstanceAdmin: true })] })
    const entry = (id: string) => ({
      id,
      at: '2026-11-01T00:00:00.000Z',
      action: 'admin.grant' as const,
      actor: { kind: 'cli' as const },
      targetUser: { id: 'u-bob', name: '밥', email: 'b@x' },
      project: null,
      invite: null,
      detail: {},
    })
    server.audit.pages = [
      { entries: [entry('a1')], next: 'c1' },
      { entries: [entry('a2')], next: null },
    ]
    const second = deferred<void>()
    const list = server.client.listAudit
    server.client.listAudit = async (query, options) => {
      if (query.before !== undefined) await second.promise
      return list(query, options)
    }
    open(server, '/admin/audit')
    const more = await screen.findByRole('button', { name: '더 보기' })
    fireEvent.click(more)
    fireEvent.click(more)
    fireEvent.keyDown(more, { key: 'Enter', repeat: true })
    fireEvent.click(more)
    await act(async () => second.resolve())
    await waitFor(() => expect(within(screen.getByRole('table', { name: '기록' })).getAllByRole('row')).toHaveLength(3))
    expect(server.calls.listAudit.filter(([query]) => (query as { before?: string }).before !== undefined)).toHaveLength(1)
  })
})

describe('RV-AD — 관리자 아님(지금 참인 성질)', () => {
  const MEMBER: SessionUser = { id: 'u-7', email: 'm@example.com', name: '멤버', isInstanceAdmin: false }
  const ADMIN_READS = ['listAdminUsers', 'listInvites', 'listAdminProjects', 'listAudit'] as const

  it.each(['/admin/users', '/admin/invites', '/admin/projects', '/admin/audit'])(
    '관리자가 아닌 사람이 %s 를 열면 관리자 조회가 0 이다',
    async (route) => {
      const server = adminServer()
      const calls: string[] = []
      for (const name of ADMIN_READS) {
        const real = server.client[name] as (...args: never[]) => unknown
        ;(server.client as unknown as Record<string, unknown>)[name] = (...args: never[]) => {
          calls.push(name)
          return real(...args)
        }
      }
      server.client.me = async () => MEMBER
      open(server, route)
      await screen.findByText('인스턴스 관리자만 볼 수 있습니다')
      await new Promise((done) => setTimeout(done, 50))
      expect(calls).toEqual([])
    },
  )
})

const DENIED = '인스턴스 관리자만 할 수 있습니다'

/** 강등된 판 — 첫 목록 뒤로는 관리자 API 가 모두 403 이다(실서버와 같다: 쓰기 뒤의 다시 받기도 막힌다). */
function demoted(): AdminServer {
  const server = adminServer({ users: [adminUser(ME.id, ME.name, { isInstanceAdmin: true }), BOB] })
  const denied = new ApiError(403, 'forbidden', DENIED, [], true)
  server.refuse.grantInstanceAdmin = denied
  const list = server.client.listAdminUsers
  let lists = 0
  server.client.listAdminUsers = (options) => {
    lists += 1
    return lists === 1 ? list(options) : Promise.reject(denied)
  }
  return server
}

// 고칠 트랙이 skip 을 떼고 초록으로 돌린다.
describe.skip('RV-AD L2 — 강등 뒤 쓰기 하나에 같은 403 문장이 두 번 서고 표가 사라진다', () => {
  it('쓰기의 실패 한 줄과 다시 받기의 실패 한 줄이 같은 문장이면 하나만 선다', async () => {
    open(demoted(), '/admin/users')
    const table = await screen.findByRole('table', { name: '사용자' })
    choose(table, '밥', '관리자로 지정')
    await waitFor(() => expect(screen.getAllByRole('alert').map((alert) => alert.textContent)).toContain(DENIED))
    await new Promise((done) => setTimeout(done, 20))
    expect(screen.getAllByRole('alert').map((alert) => alert.textContent)).toEqual([DENIED])
  })
})

// 고칠 트랙이 skip 을 떼고 초록으로 돌린다.
describe.skip('RV-AD L1 — 겹친 목록 다시 받기의 늦은 답이 새 목록을 덮는다', () => {
  it('owner 넘기기를 보낸 채 상자를 닫으면, 닫기의 다시 받기(먼저 시작 · 늦게 옴)가 넘긴 뒤의 목록을 덮지 않는다', async () => {
    const server = adminServer({
      users: [adminUser(ME.id, ME.name, { isInstanceAdmin: true }), BOB],
      projects: [adminProject('p-1', '고아', { owners: [], hasActiveOwner: false })],
    })
    const transfer = deferred<void>()
    const realTransfer = server.client.transferProjectOwner
    server.client.transferProjectOwner = async (projectId, userId) => {
      await transfer.promise
      return realTransfer(projectId, userId)
    }
    /** 다시 받기 하나를 붙잡는다 — 붙잡은 순간의 표를 낸다(그때의 서버). */
    const held: { snapshot: AdminProject[]; release: () => void }[] = []
    let holdNext = false
    server.client.listAdminProjects = (options) => {
      void options
      const snapshot = server.projects
      if (!holdNext) return Promise.resolve(snapshot)
      holdNext = false
      return new Promise((done) => held.push({ snapshot, release: () => done(snapshot) }))
    }
    open(server, '/admin/projects')
    const table = await screen.findByRole('table', { name: '프로젝트' })
    choose(table, '고아', 'owner 넘기기')
    const dialog = await screen.findByRole('dialog', { name: 'owner 넘기기' })
    const pick = (await within(dialog).findByLabelText('새 owner')) as HTMLSelectElement
    fireEvent.change(pick, { target: { value: 'u-bob' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'owner 로 만들기' }))
    // 보낸 채 닫는다 — 닫기의 다시 받기는 넘기기가 커밋되기 전의 표를 읽는다.
    holdNext = true
    fireEvent.click(within(dialog).getByRole('button', { name: '취소' }))
    await waitFor(() => expect(held).toHaveLength(1))
    await act(async () => transfer.resolve())
    await screen.findByText('«고아» — owner 를 넘겼습니다(밥).')
    await act(async () => held[0]!.release())
    await new Promise((done) => setTimeout(done, 20))
    const shown = within(screen.getByRole('table', { name: '프로젝트' }))
    expect({
      server: server.projects[0]!.hasActiveOwner,
      warning: screen.queryByText(/활성 owner 가 없는 프로젝트/) !== null,
      menu: shown.queryByRole('button', { name: '고아 더 보기' }) !== null,
    }).toEqual({ server: true, warning: false, menu: false })
  })
})
