/**
 * **관리자 › 초대 링크**(`src/admin/invites-section.tsx`) — jsdom · 가짜 서버(`./admin-server.ts`). 만들기 상자(기본값 · 검사) → 한 번 보이기 ·
 * 목록에 «복사» 가 없음 · 상태 넷의 글 · 거두기 확인 · 409 문장 · 복사 단추를 잰다.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../src/app'
import { COPIED, COPY_FAILED } from '../../src/admin/link-reveal'
import { NO_INVITES } from '../../src/admin/invites-section'
import { renderWithProviders } from '../helpers'
import { adminServer, conflict, invite, type AdminServer } from './admin-server'
import { isolate } from '../../src/shell/isolate'

const FOUR = [
  invite('i-1', '디자인팀', { kind: 'multi', signups: 3 }),
  invite('i-2', '지난 행사', { state: 'expired' }),
  invite('i-3', '거둔 것', { state: 'revoked' }),
  invite('i-4', '한 사람', { state: 'used-up', signups: 1 }),
]

async function open(server: AdminServer): Promise<void> {
  renderWithProviders(<App />, { client: server.client, route: '/admin/invites' })
  await screen.findByRole('heading', { name: '초대 링크' })
}

function rowOf(name: string): HTMLElement {
  const found = within(screen.getByRole('table', { name: '초대 링크' }))
    .getAllByRole('row')
    .find((tr) => tr.querySelector('td')?.textContent === isolate(name))
  if (found === undefined) throw new Error(`${name} 줄이 없다`)
  return found
}

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
  sessionStorage.clear()
})

describe('관리자 › 초대 링크 — 표', () => {
  it('칸 · 종류 · 상태 넷의 글 · 가입 수 · 만든 사람', async () => {
    await open(adminServer({ invites: FOUR }))
    const table = await screen.findByRole('table', { name: '초대 링크' })
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((th) => th.textContent),
    ).toEqual(['이름', '종류', '만료', '가입', '상태', '만든 사람', '행동'])
    const cells = (name: string) =>
      within(rowOf(name))
        .getAllByRole('cell')
        .map((td) => td.textContent)
    expect(cells('디자인팀')).toEqual([
      isolate('디자인팀'),
      '여러 명',
      expect.stringMatching(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/),
      '3명',
      '사용 중',
      isolate('나관리'),
      '',
    ])
    expect([cells('지난 행사')[4], cells('거둔 것')[4], cells('한 사람')[4]]).toEqual(['만료', '거둠', '다 씀'])
    expect(cells('한 사람')[1]).toBe('한 번')
  })

  it('목록에는 «복사» 가 없다(원문은 만든 직후만) · «…» 는 쓸 수 있는 줄에만', async () => {
    await open(adminServer({ invites: FOUR }))
    await screen.findByRole('table', { name: '초대 링크' })
    expect(screen.queryByRole('button', { name: /복사/ })).toBeNull()
    expect(within(rowOf('디자인팀')).queryByRole('button', { name: '«디자인팀» 더 보기' })).not.toBeNull()
    for (const name of ['지난 행사', '거둔 것', '한 사람']) expect(within(rowOf(name)).queryByRole('button')).toBeNull()
  })

  it('빈 목록이면 «만든 초대 링크가 없습니다»', async () => {
    await open(adminServer())
    expect(await screen.findByText(NO_INVITES)).toBeTruthy()
  })
})

describe('관리자 › 초대 링크 — 만들기', () => {
  it('상자 — 종류 기본 «한 번» · 만료 기본 7 일 · 만들면 원문 주소를 한 번 보이고 그 자리에만 «복사» 가 선다', async () => {
    const server = adminServer()
    await open(server)
    fireEvent.click(screen.getByRole('button', { name: '초대 링크 만들기' }))
    const dialog = await screen.findByRole('dialog', { name: '초대 링크 만들기' })
    expect((within(dialog).getByLabelText(/^만료/) as HTMLInputElement).value).toBe('7')
    expect((within(dialog).getByRole('radio', { name: /^한 번/ }) as HTMLInputElement).checked).toBe(true)
    fireEvent.change(within(dialog).getByLabelText('이름(메모)'), { target: { value: '  디자인팀  ' } })
    fireEvent.click(within(dialog).getByRole('radio', { name: /^여러 명/ }))
    fireEvent.change(within(dialog).getByLabelText(/^만료/), { target: { value: '30' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '만들기' }))
    const reveal = await screen.findByRole('region', { name: `초대 링크 «${isolate('디자인팀')}»` })
    expect(server.calls.createInvite).toEqual([[{ name: '디자인팀', kind: 'multi', expiresInDays: 30 }]])
    expect((within(reveal).getByLabelText('링크') as HTMLInputElement).value).toBe(`${window.location.origin}/invite/invite-token-i-1`)
    expect(screen.getAllByRole('button', { name: '복사' })).toHaveLength(1)
    expect(screen.queryByRole('dialog')).toBeNull()
    // 목록을 다시 받아 새 줄이 선다 — 그 줄에는 «복사» 가 없다.
    await waitFor(() => expect(within(rowOf('디자인팀')).queryByRole('button', { name: /복사/ })).toBeNull())
  })

  it('이름이 비거나 만료가 1 – 90 밖이면 보내지 않고 문장', async () => {
    const server = adminServer()
    await open(server)
    fireEvent.click(screen.getByRole('button', { name: '초대 링크 만들기' }))
    const dialog = await screen.findByRole('dialog', { name: '초대 링크 만들기' })
    fireEvent.click(within(dialog).getByRole('button', { name: '만들기' }))
    expect(within(dialog).getByRole('alert').textContent).toBe('이름을 적으세요 — 누구에게 줄 링크인지 알아보는 메모입니다')
    fireEvent.change(within(dialog).getByLabelText('이름(메모)'), { target: { value: '가' } })
    fireEvent.change(within(dialog).getByLabelText(/^만료/), { target: { value: '91' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '만들기' }))
    expect(within(dialog).getByRole('alert').textContent).toBe('만료는 1 – 90일 가운데 고르세요')
    expect(server.calls.createInvite).toEqual([])
  })

  it('«복사» 는 클립보드에 주소를 싣고 «복사했습니다» · 클립보드가 없으면 칸을 골라 직접 복사하라고 말한다', async () => {
    const writeText = vi.fn(async () => {})
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    const server = adminServer()
    await open(server)
    fireEvent.click(screen.getByRole('button', { name: '초대 링크 만들기' }))
    const dialog = await screen.findByRole('dialog', { name: '초대 링크 만들기' })
    fireEvent.change(within(dialog).getByLabelText('이름(메모)'), { target: { value: '가' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '만들기' }))
    const reveal = await screen.findByRole('region', { name: `초대 링크 «${isolate('가')}»` })
    fireEvent.click(within(reveal).getByRole('button', { name: '복사' }))
    await within(reveal).findByText(COPIED)
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/invite/invite-token-i-1`)

    vi.stubGlobal('navigator', { ...navigator, clipboard: undefined })
    fireEvent.click(within(reveal).getByRole('button', { name: '복사' }))
    await within(reveal).findByText(COPY_FAILED)
    // 칸이 통째로 골라져 있다 — 사람이 곧바로 Cmd+C 를 칠 수 있다.
    const field = within(reveal).getByLabelText('링크') as HTMLInputElement
    expect([field.selectionStart, field.selectionEnd]).toEqual([0, field.value.length])
  })
})

describe('관리자 › 초대 링크 — 거두기', () => {
  it('확인 상자를 거쳐 한 번 보내고 줄의 상태가 «거둠» 이 된다', async () => {
    const server = adminServer({ invites: FOUR })
    await open(server)
    await screen.findByRole('table', { name: '초대 링크' })
    fireEvent.click(within(rowOf('디자인팀')).getByRole('button', { name: '«디자인팀» 더 보기' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '거두기' }))
    const dialog = await screen.findByRole('dialog', { name: '초대 링크 거두기' })
    expect(server.calls.revokeInvite).toEqual([])
    fireEvent.click(within(dialog).getByRole('button', { name: '거두기' }))
    await screen.findByText(`«${isolate('디자인팀')}» — 거뒀습니다. 이 링크로는 가입할 수 없습니다.`)
    expect(server.calls.revokeInvite).toEqual([['i-1']])
    await waitFor(() => expect(within(rowOf('디자인팀')).getAllByRole('cell')[4]!.textContent).toBe('거둠'))
  })

  it('이미 못 쓰면 409 서버 문장', async () => {
    const server = adminServer({ invites: FOUR })
    server.refuse.revokeInvite = conflict('이미 쓸 수 없는 링크입니다')
    await open(server)
    await screen.findByRole('table', { name: '초대 링크' })
    fireEvent.click(within(rowOf('디자인팀')).getByRole('button', { name: '«디자인팀» 더 보기' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '거두기' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: '초대 링크 거두기' })).getByRole('button', { name: '거두기' }))
    expect((await screen.findByRole('alert')).textContent).toBe('이미 쓸 수 없는 링크입니다')
  })
})
