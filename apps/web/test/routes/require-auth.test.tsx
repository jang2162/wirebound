import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from '../../src/app'
import { ApiError } from '../../src/api/client'
import type { SessionUser } from '../../src/api/types'
import { currentPath, fakeApi, renderWithProviders, unauthenticatedError } from '../helpers'

const USER: SessionUser = { id: 'u-1', email: 'me@example.com', name: '테스터' }

/** 서버가 준 문장이 그대로 오는지 보기 위한, 화면이 하드코딩할 리 없는 문자열. */
const SERVER_MESSAGE = '세션 저장소가 응답하지 않습니다 [T4-AUTH-5]'

// 로그인 화면의 8번("me()가 401이면 로그인 화면이 보인다")은 `/login`에서 돌기 때문에
// 문지기의 리다이렉트를 지워도 통과한다 — 이미 로그인 화면에 있으니까. 인증이 필요한
// 라우트에서 시작하는 이 파일이 그 공백을 메운다.
describe('인증 문지기', () => {
  it('로그인하지 않은 채 인증 필요 라우트를 열면 로그인 화면으로 보낸다', async () => {
    renderWithProviders(<App />, {
      client: fakeApi({ me: async () => Promise.reject(unauthenticatedError()) }),
      route: '/',
    })

    await screen.findByLabelText('이메일')
    expect(currentPath()).toBe('/login')
  })

  it('로그인돼 있으면 인증 필요 라우트가 그대로 열린다', async () => {
    renderWithProviders(<App />, {
      client: fakeApi({ me: async () => USER }),
      route: '/',
    })

    // 양성 대조: 위 케이스는 "언제나 /login으로 보낸다"는 구현으로도 통과한다.
    await screen.findByRole('heading', { name: '프로젝트' })
    expect(currentPath()).toBe('/')
  })

  it('프로젝트 라우트도 같은 문지기를 지난다', async () => {
    renderWithProviders(<App />, {
      client: fakeApi({ me: async () => Promise.reject(unauthenticatedError()) }),
      route: '/projects/p-1/pages/pg-1',
    })

    await screen.findByLabelText('이메일')
    expect(currentPath()).toBe('/login')
  })

  it('세션 확인이 끝나기 전에는 아무것도 렌더하지 않는다', async () => {
    let admit = (): void => {}
    const pending = new Promise<SessionUser>((resolve) => {
      admit = () => {
        resolve(USER)
      }
    })
    renderWithProviders(<App />, { client: fakeApi({ me: () => pending }), route: '/' })

    // 로그인 화면도, 목록도 뜨면 안 된다 — 둘 중 하나를 그렸다가 바꾸면 깜빡인다.
    expect(screen.queryByRole('heading')).toBeNull()
    expect(screen.queryByLabelText('이메일')).toBeNull()

    // 양성 대조: 확인이 끝나면 나온다. 이것이 없으면 앱이 아예 안 뜨는 경우와
    // 구분되지 않는다.
    admit()
    await screen.findByRole('heading', { name: '프로젝트' })
  })

  it('unauthenticated가 아닌 오류면 로그인 화면으로 보내지 않고 이유를 보여준다', async () => {
    renderWithProviders(<App />, {
      client: fakeApi({
        me: async () => Promise.reject(new ApiError(500, 'internal', SERVER_MESSAGE)),
      }),
      route: '/',
    })

    // 서버가 잠깐 넘어진 것을 "로그아웃됨"으로 읽으면, 사용자는 되지도 않을 로그인을
    // 반복하게 된다. 그래서 `status`가 아니라 `code`로 갈라야 한다.
    await screen.findByText(SERVER_MESSAGE)
    expect(currentPath()).toBe('/')
    expect(screen.queryByLabelText('이메일')).toBeNull()
  })
})
