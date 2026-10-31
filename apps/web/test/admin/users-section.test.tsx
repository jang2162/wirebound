/**
 * **관리자 › 사용자**(`src/admin/users-section.tsx`) — jsdom · 가짜 서버(`./admin-server.ts`). 표의 칸 · 검색 · 상태 거름 · 줄 «…» 의 항목 ·
 * 비활성화 확인 상자 · 응답의 수 한 줄 · 재설정 링크의 한 번 보이기 · 서버 409 문장을 잰다. 확인 상자의 실클릭 · 더블클릭과 표의 넘침은 실브라우저
 * `build-test/admin-screens.test.ts` 가 잰다.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { App } from '../../src/app'
import { CUT_NOW, NO_MATCH } from '../../src/admin/users-section'
import { LINK_ONCE } from '../../src/admin/link-reveal'
import { currentPath, renderWithProviders } from '../helpers'
import { adminProject, adminServer, adminUser, conflict, ME, type AdminServer } from './admin-server'
import { isolate } from '../../src/shell/isolate'

const BOB = adminUser('u-bob', '밥', { projectCount: 2, invite: { id: 'i-1', name: '디자인팀' }, lastSeenAt: '2026-10-31T23:59:00.000Z' })
const CAROL = adminUser('u-carol', '캐럴', { isInstanceAdmin: true })
const DAVE = adminUser('u-dave', '데이브', { active: false })

function people(): AdminServer {
  return adminServer({
    users: [adminUser(ME.id, ME.name, { isInstanceAdmin: true }), BOB, CAROL, DAVE],
    projects: [
      adminProject('p-solo', '밥 혼자', { owners: [{ id: BOB.id, name: BOB.name, active: true }] }),
      adminProject('p-two', '둘', {
        owners: [
          { id: BOB.id, name: BOB.name, active: true },
          { id: CAROL.id, name: CAROL.name, active: true },
        ],
      }),
    ],
  })
}

async function open(server: AdminServer): Promise<HTMLElement> {
  renderWithProviders(<App />, { client: server.client, route: '/admin/users' })
  return screen.findByRole('table', { name: '사용자' })
}

function row(table: HTMLElement, name: string): HTMLElement {
  const found = within(table)
    .getAllByRole('row')
    .find((tr) => tr.querySelector('td')?.textContent?.startsWith(isolate(name)) === true)
  if (found === undefined) throw new Error(`${name} 줄이 없다`)
  return found
}

function menuItems(table: HTMLElement, name: string): string[] {
  fireEvent.click(within(row(table, name)).getByRole('button', { name: `${name} 더 보기` }))
  const items = screen.getAllByRole('menuitem').map((item) => item.textContent ?? '')
  fireEvent.keyDown(screen.getAllByRole('menuitem')[0]!, { key: 'Escape' })
  return items
}

function choose(table: HTMLElement, name: string, item: string): void {
  fireEvent.click(within(row(table, name)).getByRole('button', { name: `${name} 더 보기` }))
  fireEvent.click(screen.getByRole('menuitem', { name: item }))
}

afterEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

describe('관리자 › 사용자 — 표', () => {
  it('칸 여섯 — 이름(관리자 표지) · 이메일 · 상태 · 프로젝트 수 · 가입(초대 링크 이름) · 마지막 접속', async () => {
    const table = await open(people())
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((th) => th.textContent),
    ).toEqual(['이름', '이메일', '상태', '프로젝트', '가입', '마지막 접속', '행동'])
    const bob = within(row(table, '밥'))
      .getAllByRole('cell')
      .map((td) => td.textContent)
    expect(bob.slice(1, 4)).toEqual([isolate('u-bob@example.com'), '활성', '2개'])
    expect(bob[4]).toContain(`초대 «${isolate('디자인팀')}»`)
    expect(bob[4]).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/)
    expect(bob[5]).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
    expect(within(row(table, '캐럴')).getAllByRole('cell')[5]!.textContent).toBe('없음')
    expect(within(row(table, '캐럴')).getAllByRole('cell')[0]!.textContent).toBe(`${isolate('캐럴')}관리자`)
    expect(within(row(table, '밥')).getAllByRole('cell')[0]!.textContent).toBe(isolate('밥'))
  })

  it('비활성 줄은 흐리다(`data-active`) · 상태 칸 «비활성»', async () => {
    const table = await open(people())
    expect(row(table, '데이브').getAttribute('data-active')).toBe('false')
    expect(row(table, '밥').getAttribute('data-active')).toBe('true')
    expect(within(row(table, '데이브')).getAllByRole('cell')[2]!.textContent).toBe('비활성')
  })

  it('검색은 이름 · 이메일(대소문자 무시) · 상태 거름 · 0 건이면 «검색 결과가 없습니다»', async () => {
    const table = await open(people())
    const names = (): string[] =>
      within(screen.getByRole('table', { name: '사용자' }))
        .getAllByRole('row')
        .slice(1)
        .map((tr) => tr.querySelector('td')?.firstChild?.textContent ?? '')
    expect(names()).toEqual([ME.name, '밥', '캐럴', '데이브'].map(isolate))
    fireEvent.change(screen.getByLabelText('검색'), { target: { value: 'U-CAROL@' } })
    expect(names()).toEqual(['캐럴'].map(isolate))
    fireEvent.change(screen.getByLabelText('검색'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('상태'), { target: { value: 'inactive' } })
    expect(names()).toEqual(['데이브'].map(isolate))
    fireEvent.change(screen.getByLabelText('상태'), { target: { value: 'active' } })
    expect(names()).toEqual([ME.name, '밥', '캐럴'].map(isolate))
    fireEvent.change(screen.getByLabelText('검색'), { target: { value: '없는사람' } })
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.getByText(NO_MATCH)).toBeTruthy()
    expect(table.isConnected).toBe(false)
  })
})

describe('관리자 › 사용자 — 줄 «…» 의 항목은 상태에 맞게', () => {
  it('비활성엔 «다시 활성화» 하나 · 자기 줄엔 재설정만 · 남의 일반 줄 · 남의 관리자 줄', async () => {
    const table = await open(people())
    expect(menuItems(table, '데이브')).toEqual(['다시 활성화'])
    expect(menuItems(table, ME.name)).toEqual(['재설정 링크 만들기'])
    expect(menuItems(table, '밥')).toEqual(['재설정 링크 만들기', '관리자로 지정', '비활성화'])
    expect(menuItems(table, '캐럴')).toEqual(['재설정 링크 만들기', '관리자 해제', '비활성화'])
  })
})

describe('관리자 › 사용자 — 비활성화', () => {
  it('확인 상자가 «바로 끊깁니다» 와 그 사람이 마지막 활성 owner 인 프로젝트 수를 말한다 — 확정 전엔 안 보낸다', async () => {
    const server = people()
    const table = await open(server)
    choose(table, '밥', '비활성화')
    const dialog = await screen.findByRole('dialog', { name: '비활성화' })
    expect(within(dialog).getByText(new RegExp(CUT_NOW.replace(/[.]/g, '\\.')))).toBeTruthy()
    // «밥 혼자» 는 밥이 하나뿐인 활성 owner · «둘» 은 캐럴이 남는다 — 1.
    await within(dialog).findByText('이 사람이 마지막 활성 owner 인 프로젝트 1개 — 관리자 › 프로젝트에서 owner 를 넘기세요.')
    expect(server.calls.deactivateUser).toEqual([])
  })

  it('확정하면 한 번 보내고 응답의 두 수를 한 줄로 말하며 목록을 다시 받는다', async () => {
    const server = people()
    server.counts = { revokedLinks: 2, ownerlessProjects: 1 }
    const table = await open(server)
    choose(table, '밥', '비활성화')
    const dialog = await screen.findByRole('dialog', { name: '비활성화' })
    fireEvent.click(within(dialog).getByRole('button', { name: '비활성화' }))
    await screen.findByText(
      `${isolate('밥')} — 비활성화했습니다. 거둔 링크 2개 · 활성 owner 가 없어진 프로젝트 1개 — 관리자 › 프로젝트에서 owner 를 넘기세요.`,
    )
    expect(server.calls.deactivateUser).toEqual([[BOB.id]])
    await waitFor(() => expect(row(screen.getByRole('table', { name: '사용자' }), '밥').getAttribute('data-active')).toBe('false'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('연타의 둘째 누름(`detail` 2)은 버린다', async () => {
    const server = people()
    const table = await open(server)
    choose(table, '밥', '비활성화')
    const dialog = await screen.findByRole('dialog', { name: '비활성화' })
    fireEvent.click(within(dialog).getByRole('button', { name: '비활성화' }), { detail: 2 })
    expect(server.calls.deactivateUser).toEqual([])
  })

  it('409 는 서버 문장 그대로', async () => {
    const server = people()
    server.refuse.deactivateUser = conflict('활성 관리자가 한 명 남습니다 — 다른 사람을 먼저 관리자로 지정하세요')
    const table = await open(server)
    choose(table, '캐럴', '비활성화')
    fireEvent.click(within(await screen.findByRole('dialog', { name: '비활성화' })).getByRole('button', { name: '비활성화' }))
    expect((await screen.findByRole('alert')).textContent).toBe('활성 관리자가 한 명 남습니다 — 다른 사람을 먼저 관리자로 지정하세요')
  })
})

describe('관리자 › 사용자 — 지정 · 해제 · 다시 활성화', () => {
  it('관리자 해제는 확인 뒤 보내고 거둔 링크 수를 말한다 · 지정 · 다시 활성화는 곧바로 보낸다', async () => {
    const server = people()
    server.counts = { revokedLinks: 3, ownerlessProjects: 0 }
    const table = await open(server)
    choose(table, '캐럴', '관리자 해제')
    const dialog = await screen.findByRole('dialog', { name: '관리자 해제' })
    expect(server.calls.revokeInstanceAdmin).toEqual([])
    fireEvent.click(within(dialog).getByRole('button', { name: '관리자 해제' }))
    await screen.findByText(`${isolate('캐럴')} — 관리자 권한을 해제했습니다. 거둔 링크 3개.`)
    expect(server.calls.revokeInstanceAdmin).toEqual([[CAROL.id]])

    choose(screen.getByRole('table', { name: '사용자' }), '밥', '관리자로 지정')
    await screen.findByText(`${isolate('밥')} — 관리자로 지정했습니다.`)
    expect(server.calls.grantInstanceAdmin).toEqual([[BOB.id]])

    choose(screen.getByRole('table', { name: '사용자' }), '데이브', '다시 활성화')
    await screen.findByText(`${isolate('데이브')} — 다시 활성화했습니다. 일반 사용자로 돌아옵니다.`)
    expect(server.calls.activateUser).toEqual([[DAVE.id]])
  })
})

describe('관리자 › 사용자 — 재설정 링크', () => {
  it('원문으로 지은 주소를 한 번 보이고 «지금만 보입니다» 를 말한다 — 저장소 · 주소에 원문이 없다', async () => {
    const server = people()
    const table = await open(server)
    choose(table, '밥', '재설정 링크 만들기')
    const reveal = await screen.findByRole('region', { name: `${isolate('밥')}의 비밀번호 재설정 링크` })
    const url = (within(reveal).getByLabelText('링크') as HTMLInputElement).value
    expect(url).toBe(`${window.location.origin}/reset/reset-token-u-bob`)
    expect(within(reveal).getByText(LINK_ONCE)).toBeTruthy()
    expect(server.calls.createResetLink).toEqual([[BOB.id]])
    const stored = [localStorage, sessionStorage].flatMap((store) =>
      Array.from({ length: store.length }, (_, i) => `${store.key(i)}=${store.getItem(store.key(i)!)}`),
    )
    expect(stored.filter((entry) => entry.includes('reset-token'))).toEqual([])
    expect(currentPath()).toBe('/admin/users')
    expect(window.location.href.includes('reset-token')).toBe(false)
    // 닫으면 사라진다 — 다시 볼 길이 없다.
    fireEvent.click(within(reveal).getByRole('button', { name: '닫기' }))
    expect(screen.queryByRole('region', { name: `${isolate('밥')}의 비밀번호 재설정 링크` })).toBeNull()
  })

  it('409(비활성 대상)는 서버 문장 — 링크를 안 보인다', async () => {
    const server = people()
    server.refuse.createResetLink = conflict('비활성 사용자에게는 재설정 링크를 만들 수 없습니다')
    const table = await open(server)
    choose(table, '밥', '재설정 링크 만들기')
    expect((await screen.findByRole('alert')).textContent).toBe('비활성 사용자에게는 재설정 링크를 만들 수 없습니다')
    expect(screen.queryByLabelText('링크')).toBeNull()
  })
})

describe('관리자 › 사용자 — «초대 링크 만들기»', () => {
  it('초대 링크 칸과 같은 상자를 열고, 만들면 그 링크를 이 칸에서 보인다', async () => {
    const server = people()
    await open(server)
    fireEvent.click(screen.getByRole('button', { name: '초대 링크 만들기' }))
    const dialog = await screen.findByRole('dialog', { name: '초대 링크 만들기' })
    fireEvent.change(within(dialog).getByLabelText('이름(메모)'), { target: { value: '영업팀' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '만들기' }))
    const reveal = await screen.findByRole('region', { name: `초대 링크 «${isolate('영업팀')}»` })
    expect((within(reveal).getByLabelText('링크') as HTMLInputElement).value).toBe(`${window.location.origin}/invite/invite-token-i-1`)
    expect(server.calls.createInvite).toEqual([[{ name: '영업팀', kind: 'single', expiresInDays: 7 }]])
  })
})
