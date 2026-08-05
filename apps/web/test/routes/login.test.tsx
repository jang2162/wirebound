import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { App } from '../../src/app'
import { ApiError, type ApiClient } from '../../src/api/client'
import type { SessionUser } from '../../src/api/types'
import { currentPath, fakeApi, renderWithProviders, unauthenticatedError } from '../helpers'

const USER: SessionUser = { id: 'u-1', email: 'me@example.com', name: '테스터' }

/**
 * 서버가 준 문장이 그대로 화면에 오는지 보려면, 화면이 하드코딩할 리 없는 문자열이어야
 * 한다. "로그인 실패" 같은 그럴듯한 문안을 박아 넣은 구현도 통과하는 테스트는
 * 아무것도 지키지 못한다.
 */
const SERVER_MESSAGE = '자격 증명이 어긋났습니다 [T4-LOGIN-3]'

/**
 * 세션 쿠키를 흉내 내는 가짜. `login`이 성공하기 전에는 `me`가 401이고, 성공한 뒤에는
 * 200이다 — 실제 서버가 그렇게 움직인다. 이 연동이 없으면 로그인 직후 인증 라우트가
 * 다시 로그인 화면으로 튕겨 나가서, 화면 잘못이 아닌 이유로 테스트가 깨진다.
 */
function fakeSession(login: ApiClient['login'] = async () => USER): ApiClient {
  let signedIn = false
  return fakeApi({
    me: async () => {
      if (!signedIn) throw unauthenticatedError()
      return USER
    },
    login: async (email, password) => {
      const user = await login(email, password)
      signedIn = true
      return user
    },
  })
}

/** 로그인 화면을 띄우고 세션 확인이 끝날 때까지 기다린다. */
async function renderLogin(client: ApiClient): Promise<void> {
  renderWithProviders(<App />, { client, route: '/login' })
  await screen.findByLabelText('이메일')
}

function emailInput(): HTMLInputElement {
  return screen.getByLabelText<HTMLInputElement>('이메일')
}

function submitButton(): HTMLButtonElement {
  return screen.getByRole<HTMLButtonElement>('button', { name: '로그인' })
}

function fillCredentials(email: string, password: string): void {
  fireEvent.change(screen.getByLabelText('이메일'), { target: { value: email } })
  fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: password } })
}

describe('로그인 화면', () => {
  it('이메일과 비밀번호를 입력해 제출하면 login을 부른다', async () => {
    const login = vi.fn<ApiClient['login']>(async () => USER)
    await renderLogin(fakeSession(login))

    fillCredentials('me@example.com', 'pw-1234')
    fireEvent.click(submitButton())

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith('me@example.com', 'pw-1234')
    })
  })

  it('로그인에 성공하면 프로젝트 목록으로 간다', async () => {
    await renderLogin(fakeSession())

    fillCredentials('me@example.com', 'pw-1234')
    fireEvent.click(submitButton())

    // 위치만 보면 인증 문지기가 다시 튕겨 냈어도 통과할 수 있으므로, 그 자리의 화면이
    // 실제로 떴는지까지 본다.
    await screen.findByRole('heading', { name: '프로젝트' })
    expect(currentPath()).toBe('/')
  })

  it('401이면 서버 메시지를 그대로 보여준다', async () => {
    const client = fakeSession(async () => {
      throw new ApiError(401, 'unauthenticated', SERVER_MESSAGE)
    })
    await renderLogin(client)

    fillCredentials('me@example.com', 'wrong')
    fireEvent.click(submitButton())

    await screen.findByText(SERVER_MESSAGE)
    expect(currentPath()).toBe('/login')
  })

  it('실패해도 입력한 이메일은 남는다', async () => {
    const client = fakeSession(async () => {
      throw new ApiError(401, 'unauthenticated', SERVER_MESSAGE)
    })
    await renderLogin(client)

    fillCredentials('me@example.com', 'wrong')
    fireEvent.click(submitButton())
    await screen.findByText(SERVER_MESSAGE)

    expect(emailInput().value).toBe('me@example.com')
  })

  it('제출 중에는 버튼이 비활성이다', async () => {
    let release = (): void => {}
    const pending = new Promise<SessionUser>((resolve) => {
      release = () => {
        resolve(USER)
      }
    })
    const login = vi.fn<ApiClient['login']>(() => pending)
    await renderLogin(fakeSession(login))

    fillCredentials('me@example.com', 'pw-1234')
    // 양성 대조: 제출 전에는 눌 수 있어야 한다. 그렇지 않으면 "언제나 비활성"인
    // 구현도 이 테스트를 통과한다.
    expect(submitButton().disabled).toBe(false)

    fireEvent.click(submitButton())
    await waitFor(() => {
      expect(submitButton().disabled).toBe(true)
    })

    // 비활성의 목적은 모양이 아니라 중복 제출 방지다. jsdom은 비활성 버튼의 클릭을
    // 실제로 막으므로(실측), 이 단언은 위의 `disabled`가 지켜지는 한 따라서 성립한다 —
    // 지키려는 것이 무엇인지 남겨 두는 쪽이 나아서 함께 둔다.
    fireEvent.click(submitButton())
    expect(login).toHaveBeenCalledTimes(1)

    release()
    await screen.findByRole('heading', { name: '프로젝트' })
  })

  it('이메일이 비면 제출하지 않는다', async () => {
    const login = vi.fn<ApiClient['login']>(async () => USER)
    await renderLogin(fakeSession(login))

    fillCredentials('', 'pw-1234')
    fireEvent.click(submitButton())

    expect(login).not.toHaveBeenCalled()
    // 아무 일도 일어나지 않는 화면과 구분한다 — 이유를 말해야 사용자가 고칠 수 있다.
    expect(screen.getByRole('alert').textContent).not.toBe('')
  })

  it('이미 로그인돼 있으면 로그인 화면 대신 목록으로 간다', async () => {
    renderWithProviders(<App />, {
      client: fakeApi({ me: async () => USER }),
      route: '/login',
    })

    await screen.findByRole('heading', { name: '프로젝트' })
    expect(currentPath()).toBe('/')
    expect(screen.queryByLabelText('이메일')).toBeNull()
  })

  it('me()가 401이면 로그인 화면이 보인다', async () => {
    renderWithProviders(<App />, {
      client: fakeApi({ me: async () => Promise.reject(unauthenticatedError()) }),
      route: '/login',
    })

    await screen.findByLabelText('이메일')
    expect(currentPath()).toBe('/login')
  })
})
