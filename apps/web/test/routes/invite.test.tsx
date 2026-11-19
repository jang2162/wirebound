/**
 * **초대 링크 가입 화면**(`src/routes/invite.tsx`) — jsdom · 가짜 api. 서버의 판정(못 쓰는 링크 · 이메일 중복)은 `apps/api/test/invites.test.ts` 가 잰다.
 */
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { App } from '../../src/app'
import { ApiError, type ApiClient } from '../../src/api/client'
import type { ProjectListItem, SessionUser } from '../../src/api/types'
import { PASSWORD_MISMATCH, PASSWORD_TOO_SHORT } from '../../src/account/new-password-fields'
import { currentPath, fakeApi, listItem, renderWithProviders, unauthenticatedError } from '../helpers'

const USER: SessionUser = { id: 'u-new', email: 'new@example.com', name: '새 사람' }
const PROJECT_NAME = '가입 뒤 도착 [INVITE-도착지]'
const PROJECTS: ProjectListItem[] = [listItem({ id: 'p-1', name: PROJECT_NAME, slug: 'p', description: null, role: 'viewer' })]
/** 서버가 준 문장 — 화면이 하드코딩할 리 없는 글이어야 «서버 문장을 그대로 낸다» 가 잰다. */
const UNUSABLE = '이 링크는 끝났다 [INVITE-404]'
const TAKEN = '그 이메일은 있다 [INVITE-409]'

function client(overrides: Partial<ApiClient> = {}): ApiClient {
  let signedIn = false
  return fakeApi({
    me: async () => {
      if (!signedIn) throw unauthenticatedError()
      return USER
    },
    listProjects: async () => PROJECTS,
    checkInvite: async () => undefined,
    ...overrides,
    signupWithInvite: async (token, body) => {
      const user = await (overrides.signupWithInvite ?? (async () => USER))(token, body)
      signedIn = true
      return user
    },
  })
}

async function open(api: ApiClient): Promise<void> {
  renderWithProviders(<App />, { client: api, route: '/invite/tok-123' })
}

function fill(values: { email?: string; name?: string; password?: string; confirm?: string }): void {
  fireEvent.change(screen.getByLabelText('이메일'), { target: { value: values.email ?? 'new@example.com' } })
  fireEvent.change(screen.getByLabelText('이름'), { target: { value: values.name ?? '새 사람' } })
  fireEvent.change(screen.getByLabelText('비밀번호(8자 이상)'), { target: { value: values.password ?? 'password1234' } })
  fireEvent.change(screen.getByLabelText('비밀번호 확인'), { target: { value: values.confirm ?? values.password ?? 'password1234' } })
}

const submit = (): void => {
  fireEvent.click(screen.getByRole('button', { name: '가입' }))
}

describe('초대 링크 가입 화면', () => {
  it('링크를 확인한 뒤 칸 넷을 그린다 — 주소의 원문으로 확인한다', async () => {
    const checkInvite = vi.fn<ApiClient['checkInvite']>(async () => undefined)
    await open(client({ checkInvite }))
    await screen.findByLabelText('이메일')
    for (const label of ['이름', '비밀번호(8자 이상)', '비밀번호 확인']) expect(screen.getByLabelText(label)).toBeTruthy()
    expect(checkInvite).toHaveBeenCalledWith('tok-123')
  })

  it('못 쓰는 링크(404)면 폼 대신 서버 문장', async () => {
    await open(client({ checkInvite: async () => Promise.reject(new ApiError(404, 'not-found', UNUSABLE)) }))
    await screen.findByText(UNUSABLE)
    expect(screen.queryByLabelText('이메일')).toBeNull()
  })

  /** 새 비밀번호 두 칸에도 «보기» 가 선다 — 칸마다 따로이고 이름으로 갈린다(`account/password-input.tsx`). */
  it('새 비밀번호 두 칸에 «보기» 토글이 칸마다 따로 선다', async () => {
    await open(client())
    await screen.findByLabelText('이메일')
    const first = screen.getByLabelText<HTMLInputElement>('비밀번호(8자 이상)')
    const second = screen.getByLabelText<HTMLInputElement>('비밀번호 확인')
    expect([first.autocomplete, second.autocomplete]).toEqual(['new-password', 'new-password'])
    fireEvent.click(screen.getByRole('button', { name: '비밀번호 확인 보기' }))
    expect([first.type, second.type]).toEqual(['password', 'text'])
    fireEvent.click(screen.getByRole('button', { name: '비밀번호 보기' }))
    expect([first.type, second.type]).toEqual(['text', 'text'])
  })

  it('확인이 다르면 보내지 않고 말한다', async () => {
    const signupWithInvite = vi.fn<ApiClient['signupWithInvite']>(async () => USER)
    await open(client({ signupWithInvite }))
    await screen.findByLabelText('이메일')
    fill({ password: 'password1234', confirm: 'password12345' })
    submit()
    await screen.findByText(PASSWORD_MISMATCH)
    expect(signupWithInvite).not.toHaveBeenCalled()
  })

  it('8 자 미만이면 보내지 않고 말한다', async () => {
    const signupWithInvite = vi.fn<ApiClient['signupWithInvite']>(async () => USER)
    await open(client({ signupWithInvite }))
    await screen.findByLabelText('이메일')
    fill({ password: 'short12' })
    submit()
    await screen.findByText(PASSWORD_TOO_SHORT)
    expect(signupWithInvite).not.toHaveBeenCalled()
  })

  it('이미 있는 이메일(409)이면 서버 문장 · 입력은 남는다', async () => {
    await open(client({ signupWithInvite: async () => Promise.reject(new ApiError(409, 'conflict', TAKEN)) }))
    await screen.findByLabelText('이메일')
    fill({})
    submit()
    await screen.findByText(TAKEN)
    expect(screen.getByLabelText<HTMLInputElement>('이메일').value).toBe('new@example.com')
    expect(currentPath()).toBe('/invite/tok-123')
  })

  it('보내는 사이 못 쓰게 됐으면(404) 폼째 그 문장으로', async () => {
    await open(client({ signupWithInvite: async () => Promise.reject(new ApiError(404, 'not-found', UNUSABLE)) }))
    await screen.findByLabelText('이메일')
    fill({})
    submit()
    await screen.findByText(UNUSABLE)
    expect(screen.queryByLabelText('이메일')).toBeNull()
  })

  it('가입하면 보낸 값으로 부르고 `/` 의 목록에 선다', async () => {
    const signupWithInvite = vi.fn<ApiClient['signupWithInvite']>(async () => USER)
    await open(client({ signupWithInvite }))
    await screen.findByLabelText('이메일')
    fill({ email: ' new@example.com ', name: ' 새 사람 ' })
    submit()
    await screen.findByText(PROJECT_NAME)
    expect(currentPath()).toBe('/')
    await waitFor(() =>
      expect(signupWithInvite).toHaveBeenCalledWith('tok-123', { email: 'new@example.com', name: '새 사람', password: 'password1234' }),
    )
  })
})
