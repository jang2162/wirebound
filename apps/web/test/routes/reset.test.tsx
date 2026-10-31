/**
 * **비밀번호 재설정 화면**(`src/routes/reset.tsx`) — jsdom · 가짜 api. 서버의 판정은 `apps/api/test/password-reset-links.test.ts` 가 잰다.
 */
import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { App } from '../../src/app'
import { ApiError, type ApiClient } from '../../src/api/client'
import { PASSWORD_MISMATCH } from '../../src/routes/new-password'
import { PASSWORD_RESET_DONE } from '../../src/routes/reset'
import { currentPath, fakeApi, renderWithProviders, unauthenticatedError } from '../helpers'

const UNUSABLE = '이 재설정 링크는 끝났다 [RESET-404]'

function client(overrides: Partial<ApiClient> = {}): ApiClient {
  return fakeApi({
    me: async () => Promise.reject(unauthenticatedError()),
    getPasswordReset: async () => ({ email: 'target@example.com', name: '대상' }),
    ...overrides,
  })
}

function open(api: ApiClient): void {
  renderWithProviders(<App />, { client: api, route: '/reset/tok-9' })
}

function fill(password: string, confirm = password): void {
  fireEvent.change(screen.getByLabelText('비밀번호(8자 이상)'), { target: { value: password } })
  fireEvent.change(screen.getByLabelText('비밀번호 확인'), { target: { value: confirm } })
}

const submit = (): void => fireEvent.click(screen.getByRole('button', { name: '비밀번호 바꾸기' }))

describe('비밀번호 재설정 화면', () => {
  it('누구의 비밀번호인지 말하고 두 칸을 그린다', async () => {
    open(client())
    await screen.findByText('대상(target@example.com)의 새 비밀번호를 정합니다')
    expect(screen.getByLabelText('비밀번호(8자 이상)')).toBeTruthy()
    expect(screen.getByLabelText('비밀번호 확인')).toBeTruthy()
  })

  it('못 쓰는 링크(404)면 폼 대신 서버 문장', async () => {
    open(client({ getPasswordReset: async () => Promise.reject(new ApiError(404, 'not-found', UNUSABLE)) }))
    await screen.findByText(UNUSABLE)
    expect(screen.queryByLabelText('비밀번호 확인')).toBeNull()
  })

  it('두 칸이 다르면 보내지 않는다', async () => {
    const completePasswordReset = vi.fn<ApiClient['completePasswordReset']>(async () => undefined)
    open(client({ completePasswordReset }))
    await screen.findByLabelText('비밀번호 확인')
    fill('password1234', 'password9999')
    submit()
    await screen.findByText(PASSWORD_MISMATCH)
    expect(completePasswordReset).not.toHaveBeenCalled()
  })

  it('바꾸면 로그인 화면으로 가고 «비밀번호를 바꿨습니다» 한 줄이 선다', async () => {
    const completePasswordReset = vi.fn<ApiClient['completePasswordReset']>(async () => undefined)
    open(client({ completePasswordReset }))
    await screen.findByLabelText('비밀번호 확인')
    fill('password1234')
    submit()
    await screen.findByText(PASSWORD_RESET_DONE)
    expect(currentPath()).toBe('/login')
    expect(completePasswordReset).toHaveBeenCalledWith('tok-9', 'password1234')
  })
})
