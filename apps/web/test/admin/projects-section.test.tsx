/**
 * **관리자 › 프로젝트**(`src/admin/projects-section.tsx`) — jsdom · 가짜 서버(`./admin-server.ts`). «활성 owner 가 없는 프로젝트 N» 경고와 거름 ·
 * «owner 넘기기» 가 그 줄에만 · 대상 고르개가 활성 사용자(나 포함) · 409 문장 · 이름 링크는 멤버일 때만을 잰다.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from '../../src/app'
import { renderWithProviders } from '../helpers'
import { adminProject, adminServer, adminUser, conflict, ME, type AdminServer } from './admin-server'
import { isolate } from '../../src/shell/isolate'

const GONE = { id: 'u-gone', name: '떠난사람', active: false }

function server(): AdminServer {
  return adminServer({
    users: [
      adminUser(ME.id, ME.name, { isInstanceAdmin: true }),
      adminUser('u-bob', '밥'),
      adminUser('u-dave', '데이브', { active: false }),
    ],
    projects: [
      adminProject('p-mine', '내 프로젝트'),
      adminProject('p-orphan', '주인 없음', { owners: [GONE], hasActiveOwner: false, memberCount: 3 }),
      adminProject('p-other', '남의 것', { owners: [{ id: 'u-bob', name: '밥', active: true }] }),
      adminProject('p-empty', '빈 owner', { owners: [], hasActiveOwner: false }),
    ],
    mine: ['p-mine'],
  })
}

async function open(at: AdminServer): Promise<HTMLElement> {
  renderWithProviders(<App />, { client: at.client, route: '/admin/projects' })
  return screen.findByRole('table', { name: '프로젝트' })
}

function names(): string[] {
  return within(screen.getByRole('table', { name: '프로젝트' }))
    .getAllByRole('row')
    .slice(1)
    .map((tr) => tr.querySelector('td')?.textContent ?? '')
}

function rowOf(name: string): HTMLElement {
  const found = within(screen.getByRole('table', { name: '프로젝트' }))
    .getAllByRole('row')
    .find((tr) => tr.querySelector('td')?.textContent === isolate(name))
  if (found === undefined) throw new Error(`${name} 줄이 없다`)
  return found
}

describe('관리자 › 프로젝트', () => {
  it('«활성 owner 가 없는 프로젝트 N» 경고 · 그것만 보는 거름 · 비활성 owner 표지', async () => {
    await open(server())
    expect(screen.getByText('활성 owner 가 없는 프로젝트 2개 — 줄의 «…» 에서 owner 를 넘기세요.')).toBeTruthy()
    expect(names()).toEqual(['내 프로젝트', '주인 없음', '남의 것', '빈 owner'].map(isolate))
    fireEvent.click(screen.getByLabelText('활성 owner 가 없는 것만'))
    expect(names()).toEqual(['주인 없음', '빈 owner'].map(isolate))
    const cells = within(rowOf('주인 없음'))
      .getAllByRole('cell')
      .map((td) => td.textContent)
    expect(cells.slice(1, 4)).toEqual(['p-orphan', `${isolate('떠난사람')}비활성활성 owner 없음`, '3명'])
    expect(within(rowOf('빈 owner')).getAllByRole('cell')[2]!.textContent).toBe('없음활성 owner 없음')
  })

  it('경고는 모두 활성 owner 가 있으면 안 선다', async () => {
    const at = adminServer({ projects: [adminProject('p-mine', '내 프로젝트')], mine: ['p-mine'] })
    await open(at)
    expect(screen.queryByText(/활성 owner 가 없는 프로젝트/)).toBeNull()
  })

  it('«owner 넘기기» 는 활성 owner 가 없는 줄에만 있다', async () => {
    await open(server())
    expect(within(rowOf('주인 없음')).queryByRole('button', { name: '주인 없음 더 보기' })).not.toBeNull()
    expect(within(rowOf('빈 owner')).queryByRole('button', { name: '빈 owner 더 보기' })).not.toBeNull()
    expect(within(rowOf('내 프로젝트')).queryByRole('button')).toBeNull()
    expect(within(rowOf('남의 것')).queryByRole('button')).toBeNull()
  })

  it('이름은 내가 멤버인 프로젝트만 링크다', async () => {
    await open(server())
    const link = within(rowOf('내 프로젝트')).getByRole('link', { name: isolate('내 프로젝트') })
    expect(link.getAttribute('href')).toBe('/projects/p-mine')
    for (const name of ['주인 없음', '남의 것', '빈 owner']) expect(within(rowOf(name)).queryByRole('link')).toBeNull()
  })

  it('대상은 활성 사용자(나 포함 · 비활성 빼고) — 고르면 넘기고 한 줄 · 목록을 다시 받아 그 줄의 «…» 가 사라진다', async () => {
    const at = server()
    await open(at)
    fireEvent.click(within(rowOf('주인 없음')).getByRole('button', { name: '주인 없음 더 보기' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'owner 넘기기' }))
    const dialog = await screen.findByRole('dialog', { name: 'owner 넘기기' })
    const pick = (await within(dialog).findByLabelText('새 owner')) as HTMLSelectElement
    expect([...pick.options].map((option) => option.textContent)).toEqual([
      '고르세요',
      `${isolate(ME.name)} (${isolate('u-me@example.com')}) — 나`,
      `${isolate('밥')} (${isolate('u-bob@example.com')})`,
    ])
    expect((within(dialog).getByRole('button', { name: 'owner 로 만들기' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(pick, { target: { value: ME.id } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'owner 로 만들기' }))
    await screen.findByText(`«${isolate('주인 없음')}» — owner 를 넘겼습니다(${isolate(ME.name)}).`)
    expect(at.calls.transferProjectOwner).toEqual([['p-orphan', ME.id]])
    await waitFor(() => expect(within(rowOf('주인 없음')).queryByRole('button')).toBeNull())
  })

  it('그새 활성 owner 가 생겼으면(409) 상자 안에 서버 문장 — 닫으면 목록을 다시 받는다', async () => {
    const at = server()
    at.refuse.transferProjectOwner = conflict('이 프로젝트에는 이미 활성 owner 가 있습니다')
    await open(at)
    fireEvent.click(within(rowOf('주인 없음')).getByRole('button', { name: '주인 없음 더 보기' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'owner 넘기기' }))
    const dialog = await screen.findByRole('dialog', { name: 'owner 넘기기' })
    fireEvent.change(await within(dialog).findByLabelText('새 owner'), { target: { value: 'u-bob' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'owner 로 만들기' }))
    expect((await within(dialog).findByRole('alert')).textContent).toBe('이 프로젝트에는 이미 활성 owner 가 있습니다')
    // 그 사이 남이 넘겼다 — 닫으면 다시 받은 목록에서 그 줄의 «…» 가 사라진다.
    at.projects = at.projects.map((p) => (p.id === 'p-orphan' ? { ...p, hasActiveOwner: true } : p))
    fireEvent.click(within(dialog).getByRole('button', { name: '취소' }))
    await waitFor(() => expect(within(rowOf('주인 없음')).queryByRole('button')).toBeNull())
  })
})
