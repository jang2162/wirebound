import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from '../../src/app'
import { ApiError, type ApiClient } from '../../src/api/client'
import type { ProjectDetail, SessionUser } from '../../src/api/types'
import { currentPath, fakeApi, renderWithProviders, unauthenticatedError } from '../helpers'

const USER: SessionUser = { id: 'u-1', email: 'me@example.com', name: '테스터' }

/** 서버가 준 문장이 그대로 오는지 보기 위한, 화면이 하드코딩할 리 없는 문자열. */
const SERVER_MESSAGE = '세션 저장소가 응답하지 않습니다 [T4-AUTH-5]'

/**
 * 보호된 라우트가 **열렸는지** 보기 위한 문자열. 그 자리의 목록 화면은 조회가 실패해도
 * 제목을 그리므로, 제목만 보면 문지기가 통과시켰다는 것 말고는 아무것도 보장하지
 * 못한다(실측). 목록의 데이터로만 나올 수 있는 이름을 본다.
 */
const PROJECT_NAME = '보호된 설계서 [T4-AUTH-도착지]'
const PROJECTS: ProjectDetail[] = [{ id: 'p-1', name: PROJECT_NAME, slug: 'guarded', description: null, role: 'viewer' }]

/** 로그인된 사용자. 목록 화면이 부르는 `listProjects`까지 갖춰 둔다. */
function signedIn(): ApiClient {
  return fakeApi({ me: async () => USER, listProjects: async () => PROJECTS })
}

// `login.test.tsx`의 «me()가 401이면 로그인 화면이 보인다»는 `/login`에서 돌기 때문에
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
    renderWithProviders(<App />, { client: signedIn(), route: '/' })

    // 양성 대조: 위 케이스는 "언제나 /login으로 보낸다"는 구현으로도 통과한다.
    await screen.findByText(PROJECT_NAME)
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
    renderWithProviders(<App />, {
      client: fakeApi({ me: () => pending, listProjects: async () => PROJECTS }),
      route: '/',
    })

    // 로그인 화면도, 목록도 뜨면 안 된다 — 둘 중 하나를 그렸다가 바꾸면 깜빡인다.
    expect(screen.queryByRole('heading')).toBeNull()
    expect(screen.queryByLabelText('이메일')).toBeNull()

    // 양성 대조: 확인이 끝나면 나온다. 이것이 없으면 앱이 아예 안 뜨는 경우와
    // 구분되지 않는다.
    admit()
    await screen.findByText(PROJECT_NAME)
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

  it('로그인 화면에서는 unauthenticated가 아닌 오류에도 로그인 폼이 보인다', async () => {
    renderWithProviders(<App />, {
      client: fakeApi({
        me: async () => Promise.reject(new ApiError(500, 'internal', SERVER_MESSAGE)),
      }),
      route: '/login',
    })

    // 보호된 라우트에서는 실패 이유를 보여주는 것이 맞지만(위 케이스), 로그인 화면에서는
    // 정반대다. 여기서 폼을 치우면 사용자가 할 수 있는 유일한 행동이 사라지고, 자동
    // 재시도도 재시도 버튼도 없으므로 새로고침 말고는 복구 경로가 없다.
    await screen.findByLabelText('이메일')
    expect(currentPath()).toBe('/login')
    // 왜 로그인 화면에 있는지 알려 준다 — 서버가 준 문장 그대로.
    expect(screen.getByRole('status').textContent).toBe(SERVER_MESSAGE)
  })

  it('네트워크가 끊겨 ApiError조차 아니어도 로그인 폼이 보인다', async () => {
    // `fetch`는 응답을 받지 못하면 raw `TypeError`로 reject한다. `http-client`가 그것을
    // `ApiError`로 번역하지만, 화면은 `ApiError`가 아닌 값도 받을 수 있어야 한다 —
    // `ApiError`가 아닌 값이 실제로 들어오는 자리가 이 경로이므로 따로 못박는다.
    renderWithProviders(<App />, {
      client: fakeApi({ me: async () => Promise.reject(new TypeError('Failed to fetch')) }),
      route: '/login',
    })

    await screen.findByLabelText('이메일')
    expect(currentPath()).toBe('/login')
    // 서버가 이유를 주지 않았으므로 화면이 가진 문장을 쓴다.
    expect(screen.getByRole('status').textContent).toBe('세션을 확인하지 못했습니다')
  })
})
