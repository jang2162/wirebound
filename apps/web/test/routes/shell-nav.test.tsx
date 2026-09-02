/**
 * **셸에서 나가는 두 길** — 프로젝트 목록으로 돌아가는 것과 로그아웃.
 *
 * ## 무엇이 없었는가
 *
 * 에디터 머리의 제목은 `<h1>` 글자였고 그것이 전부였다 — 프로젝트 목록으로 가는 길이
 * 화면에 **없었다**(브라우저 뒤로 가기나 주소를 손으로 고치는 것뿐). 로그아웃은 더해서,
 * `api.logout()`이 P1부터 있었는데 **부르는 화면이 0개**였다 — 세션을 끝낼 길이 앱 전체에
 * 없었다는 뜻이다. `test/api-consumers.test.ts`의 `logout: []`이 그 사실을 값으로 들고
 * 있었고, 그 줄의 주석이 *"로그아웃 단추를 만들면 이 줄이 먼저 죽는다"*고 예고했다.
 *
 * ## 여기서 재는 것과 재지 않는 것
 *
 * **화면을 지나 잰다.** `SessionMenu`를 떼어 내 렌더하면 케이스가 짧아지지만, 그러면
 * *"머리에 실제로 달려 있는가"*가 빠진다 — 이 슬라이스가 고친 고장이 정확히 그것이므로
 * (기능이 없던 것이 아니라 **부르는 자리가 없던 것**) 배선을 지나지 않는 케이스는 이
 * 고장을 다시 잡지 못한다. `<App />`을 라우트째 렌더하는 것도 같은 이유다
 * (`routes/editor-shell.test.tsx` 머리말의 거짓 초록).
 *
 * **주소가 실제로 옮겨졌는지까지 본다.** 링크가 있다는 것과 그것이 목록으로 데려다준다는
 * 것은 다른 사실이고, `to`를 잘못 적은 판이 앞쪽만으로는 통과한다.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ApiError } from '../../src/api/client'
import type { SessionUser } from '../../src/api/types'
import { App } from '../../src/app'
import { currentPath, fakeApi, renderWithProviders, unauthenticatedError } from '../helpers'
import { PAGE_ROUTE, PROJECT_NAME, openPage, pageDoc } from '../editor-harness'

const DOC = pageDoc({ id: 'n-root', type: 'Page', children: [] })

/**
 * **하네스의 기본 사용자(`테스터`)를 쓰지 않는다.** 화면이 하드코딩할 리 없는 이름이어야
 * *"서버가 준 값이 그대로 나온다"*를 잰다 — 그럴듯한 문안을 박아 넣은 구현도 통과하는
 * 단언은 아무것도 지키지 않는다(`editor-shell.test.tsx`의 `SERVER_MESSAGE`와 같은 근거).
 */
const USER: SessionUser = { id: 'u-9', email: 'nav@example.com', name: '나가는사람 [T-NAV]' }

/** 서버가 준 문장이 그대로 오는지 보려면 화면이 지어낼 리 없는 글자여야 한다. */
const SERVER_MESSAGE = '세션 저장소가 응답하지 않습니다 [T-NAV-LOGOUT]'

/** 셸의 머리. 링크·버튼을 여기 안에서 찾아 캔버스·트리의 같은 이름과 섞이지 않게 한다. */
function header(): HTMLElement {
  const found = document.body.querySelector<HTMLElement>('.wb-shell-header')
  if (found === null) throw new Error('셸 머리를 찾지 못했습니다')
  return found
}

/**
 * 페이지를 연 셸. `logout`은 케이스가 주고, 나머지는 하네스 기본값이다.
 *
 * `listProjects`를 함께 스텁하는 것은 **목록으로 돌아가는 케이스가 그 화면까지 그리기**
 * 때문이다 — 안 주면 `notStubbed`가 던져 목록이 오류 문장으로 뜨고, 단언이
 * *"돌아왔는가"*가 아니라 *"오류가 떴는가"*를 보게 된다.
 */
async function openShell(logout: () => Promise<void>): Promise<void> {
  await openPage(DOC, {
    apiOverrides: { me: async () => USER, logout, listProjects: async () => [] },
  })
}

describe('머리에서 프로젝트 목록으로 돌아간다', () => {
  it('제목 옆에 목록으로 가는 링크가 있다', async () => {
    await openShell(async () => {})

    const back = within(header()).getByRole('link', { name: '프로젝트 목록으로 돌아가기' })
    // **`href`까지 본다.** 링크라는 것만으로는 어디로 가는지 모른다 — 주소가 있는 이동이라는
    // 것이 이 자리를 `<button>`이 아니라 `<Link>`로 만든 근거이므로 그 주소가 계약이다.
    expect(back.getAttribute('href')).toBe('/')
  })

  it('눌러서 실제로 목록에 닿는다', async () => {
    await openShell(async () => {})

    fireEvent.click(within(header()).getByRole('link', { name: '프로젝트 목록으로 돌아가기' }))

    expect(currentPath()).toBe('/')
    // 주소만 보면 목록이 그려지지 않는 판도 통과한다.
    expect(await screen.findByRole('heading', { name: '프로젝트' })).toBeTruthy()
  })

  it('제목 자체는 링크가 아니다 — 갈 곳을 말하는 것은 링크의 글자다', async () => {
    // **판정을 값으로 고정한다.** 제목을 `<Link>`로 감싸는 판도 *"목록에 닿는다"*를
    // 통과하지만, 그러면 `관리자 콘솔 설계서`라는 글자가 **목록**으로 데려간다 — 링크의
    // 글자가 목적지를 말해야 한다는 계약을 어긴다.
    await openShell(async () => {})

    const title = screen.getByRole('heading', { name: PROJECT_NAME })
    expect(title.querySelector('a')).toBeNull()
  })
})

describe('머리에서 로그아웃한다', () => {
  it('지금 로그인한 사람을 보인다', async () => {
    await openShell(async () => {})

    expect(within(header()).getByText(USER.name)).toBeTruthy()
  })

  it('누르면 로그아웃을 부르고 로그인 화면으로 간다', async () => {
    let calls = 0
    await openShell(async () => {
      calls += 1
    })

    fireEvent.click(within(header()).getByRole('button', { name: '로그아웃' }))

    await waitFor(() => expect(currentPath()).toBe('/login'))
    expect(calls).toBe(1)
  })

  it('세션까지 끊는다 — 로그인 화면이 목록으로 되돌려 보내지 않는다', async () => {
    // **주소만 옮기는 판을 가른다.** `invalidate()`를 빠뜨리면 세션 상태가
    // `authenticated`로 남아 `RedirectWhenAuthenticated`가 곧장 `/`로 되튕긴다.
    await openShell(async () => {})

    fireEvent.click(within(header()).getByRole('button', { name: '로그아웃' }))

    expect(await screen.findByRole('button', { name: '로그인' })).toBeTruthy()
    expect(currentPath()).toBe('/login')
  })

  it('실패하면 이유를 그 자리에 내고 셸에 남는다', async () => {
    // **끊지 않는 것이 판정이다.** 서버가 세션을 안 지웠는데 화면만 끊으면 *"로그아웃
    // 했다"*가 거짓이 된다 — 쿠키는 살아 있어 다른 탭이 그대로 들어간다.
    await openShell(async () => {
      throw new ApiError(500, 'internal', SERVER_MESSAGE)
    })

    fireEvent.click(within(header()).getByRole('button', { name: '로그아웃' }))

    expect((await within(header()).findByRole('alert')).textContent).toBe(SERVER_MESSAGE)
    expect(currentPath()).toBe(PAGE_ROUTE)
    // 셸이 살아 있어야 사용자가 하던 일을 이어 갈 수 있다.
    expect(screen.getByRole('heading', { name: PROJECT_NAME })).toBeTruthy()
  })

  it('실패한 뒤에 다시 누를 수 있다', async () => {
    // 요청이 도는 동안 잠그는 장치(`busy`)가 실패 경로에서 안 풀리면 사용자는 영영
    // 나가지 못한다 — 그 자리는 화면에 아무 표시도 없이 죽는다.
    let calls = 0
    await openShell(async () => {
      calls += 1
      throw new ApiError(500, 'internal', SERVER_MESSAGE)
    })
    fireEvent.click(within(header()).getByRole('button', { name: '로그아웃' }))
    await within(header()).findByRole('alert')

    const button = within(header()).getByRole('button', { name: '로그아웃' })
    expect(button.hasAttribute('disabled')).toBe(false)
    fireEvent.click(button)

    await waitFor(() => expect(calls).toBe(2))
  })

  it('서버가 세션이 없다고 답하면 성공으로 친다', async () => {
    // 로그아웃이 이루려던 상태가 이미 참이다. 오류를 그리면 사용자는 나가지 못한 줄 알고
    // 다시 누른다.
    await openShell(async () => {
      throw unauthenticatedError()
    })

    fireEvent.click(within(header()).getByRole('button', { name: '로그아웃' }))

    await waitFor(() => expect(currentPath()).toBe('/login'))
    // 실패 문장을 내지 않는다 — 셸은 이미 사라졌고 로그인 화면에 오류가 따라붙지도 않는다.
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('프로젝트 목록에서도 로그아웃한다', () => {
  /**
   * **셸 머리에만 두면 반쪽이다.** 원래 고장은 *"로그아웃 UI가 앱 전체에 하나도 없다"*였고,
   * 목록 화면(`/`)에 없으면 프로젝트를 하나 열지 않고는 나갈 수 없다.
   */
  async function openList(logout: () => Promise<void>): Promise<void> {
    renderWithProviders(<App />, {
      client: fakeApi({ me: async () => USER, logout, listProjects: async () => [] }),
      route: '/',
    })
    await screen.findByRole('heading', { name: '프로젝트' })
  }

  it('누구로 들어와 있는지와 로그아웃이 함께 있다', async () => {
    await openList(async () => {})

    expect(screen.getByText(USER.name)).toBeTruthy()
    expect(screen.getByRole('button', { name: '로그아웃' })).toBeTruthy()
  })

  it('눌러서 로그인 화면으로 나간다', async () => {
    let calls = 0
    await openList(async () => {
      calls += 1
    })

    fireEvent.click(screen.getByRole('button', { name: '로그아웃' }))

    await waitFor(() => expect(currentPath()).toBe('/login'))
    expect(calls).toBe(1)
    expect(screen.getByRole('button', { name: '로그인' })).toBeTruthy()
  })
})
