/**
 * **FX-AD — 리뷰 대응의 jsdom 판**(리뷰 `docs/superpowers/plans/2026-11-01-rv-ad-report.md` · 대응 `2026-11-01-fx-ad-report.md`). 리뷰가 세운 판은
 * `test/rv-ad-admin.test.tsx` 에 그대로 두고, 여기는 대응이 더한 장치를 잰다.
 *
 * - H3 — 링크 상자가 `pagehide` 에 닫힌다. bfcache 로 되사는 판 자체는 jsdom 이 못 낸다 — `build-test/rv-ad-admin.test.ts` «H3».
 * - H2 — 사용자 칸의 줄 쓰기는 한 번에 하나다(앞 쓰기의 답 전에 온 고름을 버린다).
 * - L2 — 다시 받기가 실패하면 앞 표를 두고 그 실패를 한 줄로 말한다.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { App } from '../../src/app'
import { ApiError } from '../../src/api/client'
import { renderWithProviders } from '../helpers'
import { adminServer, adminUser, invite, ME, type AdminServer } from './admin-server'

const BOB = adminUser('u-bob', '밥')

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

function choose(name: string, item: string): void {
  fireEvent.click(screen.getByRole('button', { name: `${name} 더 보기` }))
  fireEvent.click(screen.getByRole('menuitem', { name: item }))
}

afterEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

describe('FX-AD H3 — 링크 상자는 문서를 떠나면(`pagehide`) 닫힌다', () => {
  it('사용자 칸의 재설정 링크 상자', async () => {
    const server = adminServer({ users: [adminUser(ME.id, ME.name, { isInstanceAdmin: true }), BOB] })
    open(server, '/admin/users')
    await screen.findByRole('table', { name: '사용자' })
    choose('밥', '재설정 링크 만들기')
    await screen.findByRole('region', { name: '밥의 비밀번호 재설정 링크' })
    act(() => {
      window.dispatchEvent(new Event('pagehide'))
    })
    // 동기로 걷혀야 한다 — bfcache 는 `pagehide` 직후의 DOM 을 담는다.
    expect(screen.queryByRole('region', { name: '밥의 비밀번호 재설정 링크' })).toBeNull()
    expect(document.body.innerHTML.includes('reset-token-u-bob')).toBe(false)
  })

  it('초대 링크 칸의 새 링크 상자', async () => {
    const server = adminServer()
    open(server, '/admin/invites')
    fireEvent.click(await screen.findByRole('button', { name: '초대 링크 만들기' }))
    const dialog = await screen.findByRole('dialog', { name: '초대 링크 만들기' })
    fireEvent.change(within(dialog).getByLabelText('이름(메모)'), { target: { value: '떠남' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '만들기' }))
    await screen.findByRole('region', { name: '초대 링크 «떠남»' })
    act(() => {
      window.dispatchEvent(new Event('pagehide'))
    })
    expect(screen.queryByRole('region', { name: '초대 링크 «떠남»' })).toBeNull()
    expect(document.body.innerHTML.includes('invite-token-i-1')).toBe(false)
  })
})

describe('FX-AD H2 — 사용자 칸의 줄 쓰기는 한 번에 하나다', () => {
  it('«관리자로 지정» 의 답 전에 같은 줄의 «재설정 링크 만들기» 를 골라도 재설정 링크를 안 만든다 · 답 뒤에는 만든다', async () => {
    const server = adminServer({ users: [adminUser(ME.id, ME.name, { isInstanceAdmin: true }), BOB] })
    const pending = deferred<void>()
    const grant = server.client.grantInstanceAdmin
    server.client.grantInstanceAdmin = async (id) => {
      await pending.promise
      return grant(id)
    }
    open(server, '/admin/users')
    await screen.findByRole('table', { name: '사용자' })
    choose('밥', '관리자로 지정')
    choose('밥', '재설정 링크 만들기')
    await new Promise((done) => setTimeout(done, 20))
    const during = server.calls.createResetLink.length
    await act(async () => pending.resolve())
    await screen.findByText('밥 — 관리자로 지정했습니다.')
    choose('밥', '재설정 링크 만들기')
    await screen.findByRole('region', { name: '밥의 비밀번호 재설정 링크' })
    expect({ during, after: server.calls.createResetLink.length, grant: server.calls.grantInstanceAdmin.length }).toEqual({
      during: 0,
      after: 1,
      grant: 1,
    })
  })
})

describe('FX-AD L2 — 다시 받기가 실패하면 앞 표를 둔다', () => {
  it('초대 링크를 만든 뒤의 다시 받기가 실패하면 표 · 새 링크 상자가 남고 실패가 한 줄로 선다', async () => {
    const server = adminServer({ invites: [invite('i-old', '옛 링크')] })
    const failed = new ApiError(500, 'internal', '서버가 잠시 답하지 않습니다', [], true)
    const list = server.client.listInvites
    let lists = 0
    server.client.listInvites = (options) => {
      lists += 1
      return lists === 1 ? list(options) : Promise.reject(failed)
    }
    open(server, '/admin/invites')
    await screen.findByRole('table', { name: '초대 링크' })
    fireEvent.click(screen.getByRole('button', { name: '초대 링크 만들기' }))
    const dialog = await screen.findByRole('dialog', { name: '초대 링크 만들기' })
    fireEvent.change(within(dialog).getByLabelText('이름(메모)'), { target: { value: '새 링크' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '만들기' }))
    await screen.findByRole('region', { name: '초대 링크 «새 링크»' })
    await waitFor(() => expect(lists).toBe(2))
    await new Promise((done) => setTimeout(done, 20))
    expect({
      table: screen.queryByRole('table', { name: '초대 링크' }) !== null,
      alerts: screen.queryAllByRole('alert').map((alert) => alert.textContent),
    }).toEqual({ table: true, alerts: ['서버가 잠시 답하지 않습니다'] })
  })
})
