/**
 * 화면 테스트의 공통 배선. 두 가지를 준다 — 서버 대역인 `fakeApi`와, Provider·라우터를
 * 씌워 렌더하는 `renderWithProviders`.
 *
 * 테스트는 `http-client.ts`를 거치지 않는다. 화면이 보는 것은 `ApiClient` 인터페이스
 * 하나뿐이므로, 여기서 그 인터페이스를 직접 만족시키는 편이 `fetch`를 흉내 내는 것보다
 * 짧고 무엇을 검사하는지가 분명하다.
 */
import { render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter, useLocation } from 'react-router'
import { ApiError, type ApiClient } from '../src/api/client'
import { ApiProvider } from '../src/api/context'
import type { SessionUser } from '../src/api/types'

/**
 * 스텁되지 않은 메서드 자리에 놓는 함수. **`undefined`를 돌려주지 않고 던진다.**
 * 예상하지 못한 호출이 조용히 지나가면, 화면이 부르지도 않은 데이터로 그린 것처럼
 * 보이는 거짓 초록이 된다.
 */
function notStubbed(method: string): () => never {
  return () => {
    throw new Error(`fakeApi: ${method}가 스텁되지 않았습니다`)
  }
}

/** 테스트가 명시적으로 스텁한 메서드만 동작하는 `ApiClient`. */
export function fakeApi(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    login: notStubbed('login'),
    logout: notStubbed('logout'),
    me: notStubbed('me'),
    listProjects: notStubbed('listProjects'),
    getProject: notStubbed('getProject'),
    getTree: notStubbed('getTree'),
    getPage: notStubbed('getPage'),
    ...overrides,
  }
}

/** 세션이 없을 때 서버가 내는 오류. 여러 테스트가 같은 모양을 쓴다. */
export function unauthenticatedError(message = '로그인이 필요합니다'): ApiError {
  return new ApiError(401, 'unauthenticated', message)
}

/**
 * **첫 호출만 성공하고 그 뒤로는 세션이 없다고 답하는 `me`.**
 *
 * 재현하는 상황은 "화면에 들어와 있는 동안 서버가 세션을 지웠다"이다 — 문지기
 * (`routes/require-auth.tsx`)는 첫 호출로 이미 통과했고, 그다음 조회부터 401이 온다.
 * D5의 `code` 분기가 문지기 하나에만 있으면 사용자는 그 화면에 갇힌다.
 *
 * **뒤 호출까지 성공하게 두면 안 된다.** 로그인 화면의 `RedirectWhenAuthenticated`가 다시
 * `me()`를 부르는데, 그것이 성공하면 목록으로 되돌려 보내고 그 목록이 다시 401을 받아
 * 케이스가 두 주소를 무한히 오간다.
 */
export function expiringSession(user: SessionUser): ApiClient['me'] {
  let alive = true
  return async () => {
    if (alive) {
      alive = false
      return user
    }
    throw unauthenticatedError()
  }
}

/** `currentPath()`가 읽는 자리. 화면이 쓸 일이 없도록 테스트 전용 이름을 쓴다. */
const LOCATION_PROBE = 'location-probe'

/**
 * 지금 라우터 위치를 DOM에 적어 두는 탐침. `renderWithProviders`가 아무것도 돌려주지
 * 않으므로(라우터 객체를 손에 쥐지 않으므로), 위치를 단언하는 통로가 이것 하나다.
 */
function LocationProbe(): ReactElement {
  const location = useLocation()
  return <span data-testid={LOCATION_PROBE}>{location.pathname}</span>
}

export interface RenderOptions {
  /** 화면이 볼 `ApiClient`. 생략하면 모든 메서드가 던지는 가짜다. */
  client?: ApiClient
  /** 라우터의 시작 위치. 생략하면 `/`다. */
  route?: string
}

/**
 * 앱을 `ApiProvider` + 메모리 라우터 안에서 렌더한다.
 *
 * 브라우저 히스토리 대신 `MemoryRouter`를 쓰는 이유는 jsdom의 URL이 파일 간에 공유되기
 * 때문이다 — 앞 테스트가 옮겨 놓은 주소에서 뒤 테스트가 시작되면 원인을 찾기 어려운
 * 순서 의존이 생긴다.
 */
export function renderWithProviders(ui: ReactElement, options: RenderOptions = {}): void {
  render(
    <ApiProvider client={options.client ?? fakeApi()}>
      <MemoryRouter initialEntries={[options.route ?? '/']}>
        {ui}
        <LocationProbe />
      </MemoryRouter>
    </ApiProvider>,
  )
}

/** 지금 라우터 위치의 경로. `renderWithProviders`로 렌더한 뒤에만 쓸 수 있다. */
export function currentPath(): string {
  return screen.getByTestId(LOCATION_PROBE).textContent ?? ''
}
