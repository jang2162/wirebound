/**
 * «계정 설정» 화면(`src/routes/account.tsx`) — jsdom. 내 정보 · 비밀번호 바꾸기 · API 토큰 셋. 토큰 절의 케이스는
 * `tokens.test.tsx`가 소유한다. 가짜 api 는 **불린 수를 값으로** 단언한다.
 *
 * **핵심은 `wrong-password`(401) 가 세션 끝이 아니라는 것이다** — 웹은 401 `unauthenticated`를 «세션이 끊겼다»로 읽어 로그인으로
 * 보낸다(`api/failure.tsx`). 비밀번호 칸의 틀림은 같은 401 이지만 세션은 그대로다(서버 `POST /api/auth/password`).
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from '../../src/app'
import { ApiError, type ApiClient } from '../../src/api/client'
import type { SessionUser } from '../../src/api/types'
import { currentPath, fakeApi, renderWithProviders, unauthenticatedError } from '../helpers'

const USER: SessionUser = { id: 'u-1', email: 'me@example.com', name: '테스터' }

/** 화면 문안은 구현에서 import 하지 않는다 — 문안이 바뀌어도 테스트가 따라가 버린다. */
const CHANGED = '비밀번호를 바꿨습니다. 다른 기기의 로그인은 끊겼습니다.'
const MISMATCH = '새 비밀번호 두 칸이 다릅니다'
const WRONG = '지금 비밀번호가 맞지 않습니다'

function wrongPasswordError(): ApiError {
  return new ApiError(
    401,
    'unauthenticated',
    '이메일 또는 비밀번호가 올바르지 않습니다',
    [{ path: 'currentPassword', code: 'wrong-password', message: '지금 비밀번호가 맞지 않습니다' }],
    true,
  )
}

function server(overrides: Partial<ApiClient> = {}) {
  const calls = { me: 0, change: [] as [string, string][] }
  const client = fakeApi({
    me: async () => {
      calls.me += 1
      return USER
    },
    listMyTokens: async () => [],
    changePassword: async (current, next) => {
      calls.change.push([current, next])
    },
    ...overrides,
  })
  return { client, calls }
}

function passwordSection(): HTMLElement {
  return screen.getByRole('region', { name: '비밀번호 바꾸기' })
}

function fill(current: string, next: string, again: string): void {
  const section = passwordSection()
  fireEvent.change(within(section).getByLabelText('지금 비밀번호'), { target: { value: current } })
  fireEvent.change(within(section).getByLabelText('새 비밀번호'), { target: { value: next } })
  fireEvent.change(within(section).getByLabelText('새 비밀번호 확인'), { target: { value: again } })
}

function submit(): void {
  fireEvent.click(within(passwordSection()).getByRole('button', { name: '비밀번호 바꾸기' }))
}

async function openAccount(client: ApiClient): Promise<void> {
  renderWithProviders(<App />, { client, route: '/account' })
  await screen.findByRole('heading', { level: 1, name: '계정 설정' })
}

describe('계정 설정 화면', () => {
  it('내 정보(이름 · 이메일) · 비밀번호 바꾸기 · API 토큰 세 절이 선다', async () => {
    const { client } = server()
    await openAccount(client)

    const profile = screen.getByRole('region', { name: '내 정보' })
    within(profile).getByText('테스터')
    within(profile).getByText('me@example.com')
    passwordSection()
    screen.getByRole('region', { name: 'API 토큰' })
    await screen.findByText('만든 API 토큰이 없습니다')
  })

  it('옛 주소 `/tokens` 는 `/account` 로 넘어간다', async () => {
    const { client } = server()
    renderWithProviders(<App />, { client, route: '/tokens' })
    await screen.findByRole('heading', { level: 1, name: '계정 설정' })
    expect(currentPath()).toBe('/account')
  })
})

describe('비밀번호 바꾸기', () => {
  it('새 비밀번호 두 칸이 다르면 요청 없이 그렇다고 말한다', async () => {
    const { client, calls } = server()
    await openAccount(client)
    fill('password1234', 'newpassword5678', 'newpassword5679')
    submit()
    within(passwordSection()).getByText(MISMATCH)
    expect(calls.change).toEqual([])
  })

  it('성공하면 문장을 보이고 세 칸을 비운다', async () => {
    const { client, calls } = server()
    await openAccount(client)
    fill('password1234', 'newpassword5678', 'newpassword5678')
    submit()
    await within(passwordSection()).findByText(CHANGED)
    expect(calls.change).toEqual([['password1234', 'newpassword5678']])
    for (const label of ['지금 비밀번호', '새 비밀번호', '새 비밀번호 확인']) {
      expect((within(passwordSection()).getByLabelText(label) as HTMLInputElement).value, label).toBe('')
    }
  })

  it('지금 비밀번호가 틀리면(401 `wrong-password`) 칸 곁에 말하고 — 로그아웃되지 않는다', async () => {
    const { client, calls } = server({
      changePassword: async () => {
        throw wrongPasswordError()
      },
    })
    await openAccount(client)
    fill('틀린비밀번호1234', 'newpassword5678', 'newpassword5678')
    submit()
    // 경로를 먼저 본다 — 세션 끝으로 읽으면 로그인으로 가고, 그 값이 실패로 남는다.
    await waitFor(() => {
      expect(currentPath()).toBe('/account')
      within(passwordSection()).getByText(WRONG)
    })
    screen.getByRole('heading', { level: 1, name: '계정 설정' })
    // 세션을 다시 확인하러 가지 않았다 — 문지기의 첫 `me` 하나뿐이다.
    expect(calls.me).toBe(1)
    // 친 새 비밀번호는 남긴다 — 지금 비밀번호만 다시 치면 된다.
    expect((within(passwordSection()).getByLabelText('새 비밀번호') as HTMLInputElement).value).toBe('newpassword5678')
  })

  it('대조 — 이슈 없는 401(세션이 끝남)은 로그인으로 간다', async () => {
    let expired = false
    const { client } = server({
      me: async () => {
        if (expired) throw unauthenticatedError()
        return USER
      },
      changePassword: async () => {
        expired = true
        throw unauthenticatedError()
      },
    })
    await openAccount(client)
    fill('password1234', 'newpassword5678', 'newpassword5678')
    submit()
    await waitFor(() => expect(currentPath()).toBe('/login'))
  })

  it('429 는 서버가 말한 기다릴 시간을 그대로 보인다', async () => {
    const { client } = server({
      changePassword: async () => {
        throw new ApiError(429, 'rate-limited', '로그인 시도가 너무 많습니다 — 15분 뒤 다시 시도하세요', [], true)
      },
    })
    await openAccount(client)
    fill('password1234', 'newpassword5678', 'newpassword5678')
    submit()
    await within(passwordSection()).findByText('로그인 시도가 너무 많습니다 — 15분 뒤 다시 시도하세요')
    expect(currentPath()).toBe('/account')
  })

  it('400 은 서버의 이유를 보인다', async () => {
    const { client } = server({
      changePassword: async () => {
        throw new ApiError(
          400,
          'bad-request',
          '요청을 처리할 수 없습니다',
          [{ path: 'newPassword', message: '비밀번호는 8자 이상이어야 합니다' }],
          true,
        )
      },
    })
    await openAccount(client)
    fill('password1234', 'short7!', 'short7!')
    submit()
    await within(passwordSection()).findByText('비밀번호는 8자 이상이어야 합니다')
  })
})
