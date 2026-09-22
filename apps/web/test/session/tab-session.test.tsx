/**
 * **탭 사이의 세션** — 다른 탭의 로그인·로그아웃을 이 탭이 안다(이월 Y · Z). 무엇을 왜 하는지는
 * `src/session/session-context.tsx`의 «탭 사이»가 갖고, 통로는 `src/session/tab-channel.tsx`다.
 *
 * 다른 탭은 `tabHub()`로 흉내 낸다 — 이 탭이 낸 소식은 `posted`에 쌓이고, `fromOtherTab`이 다른 탭의 소식을
 * 건넨다. **쿠키는 흉내 내지 않는다** — 여기는 «알면 무엇을 하는가»만 잰다. 쓰기가 누구의 쿠키로 나가는가는
 * `test/panels/write-ledger.test.tsx`의 «탭 사이» 절, WS 가 새 쿠키로 붙는가는 `test/edit/reconnect-resync.test.tsx`
 * 의 «다른 탭이 같은 사람으로 …»가 잰다.
 *
 * 각 케이스가 혼자 죽는 변조(웹 전량에서 쟀다 — 백업 → 한 줄 → 복원 · 바이트 비교):
 *
 * | 변조 | 죽는 것 |
 * |---|---|
 * | 로그인(`confirm`)이 알리지 않는다 | *"이 탭에서 로그인하면 …"* **혼자** |
 * | 로그아웃 단추가 알리지 않는 무효화를 부른다(앞 판) | *"이 탭에서 로그아웃하면 …"* **혼자** |
 * | 401 의 무효화도 로그아웃을 알린다 | *"401 로 끊긴 세션은 알리지 않는다 …"* **혼자** |
 * | 로그인 화면(`anonymous`)에서 다른 탭의 로그인을 버린다 | *"로그인 화면의 탭은 …"* **혼자** |
 * | 다른 탭의 로그아웃을 버린다 | *"다른 탭이 로그아웃하면 …"* **혼자** |
 * | 문지기가 사람이 바뀌어도 머문다 | *"다른 탭이 다른 사람으로 들어오면 목록으로 …"* 와 *"… 이미 목록이어도 …"* — **축의 주인은 앞의 것** |
 * | 문지기가 옮기기만 하고 앞 화면을 내리지 않는다(이미 `/`면 그대로) | *"… 이미 목록이어도 새로 받는다 …"* **혼자** |
 * | 세션 확인이 도는 동안 온 소식을 늦게 온 답이 덮는다 | *"세션 확인이 도는 동안 온 소식이 이긴다 …"* **혼자** |
 * | 떼어도 계속 듣는다(구독을 안 뗀다) | *"떠나면 그만 듣는다"* **혼자** |
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useEffect, type ReactElement } from 'react'
import { MemoryRouter, Outlet, Route, Routes, useLocation } from 'react-router'
import { describe, expect, it } from 'vitest'
import { App } from '../../src/app'
import type { ApiClient } from '../../src/api/client'
import { ApiProvider } from '../../src/api/context'
import type { SessionUser } from '../../src/api/types'
import { RedirectWhenAuthenticated, RequireAuth } from '../../src/routes/require-auth'
import { SessionProvider, useSessionEpoch, useSessionUser } from '../../src/session/session-context'
import { SessionMenu } from '../../src/session/session-menu'
import { TabChannelProvider } from '../../src/session/tab-channel'
import { currentPath, fakeApi, renderWithProviders, tabHub, unauthenticatedError, type TabHub } from '../helpers'

const ALICE: SessionUser = { id: 'u-1', email: 'alice@example.com', name: '앨리스' }
const BOB: SessionUser = { id: 'u-2', email: 'bob@example.com', name: '밥' }

/** 목록 자리 — **새로 설 때마다 센다**(앞 사람의 목록이 새 사람에게 남는가). */
const homeMounts: number[] = []

function Home(): ReactElement {
  useEffect(() => {
    homeMounts.push(1)
  }, [])
  return <span>목록</span>
}

function Probe(): ReactElement {
  const user = useSessionUser()
  return (
    <>
      <span data-testid="tab-path">{useLocation().pathname}</span>
      <span data-testid="tab-user">{user?.name ?? '-'}</span>
      <span data-testid="tab-epoch">{useSessionEpoch()}</span>
    </>
  )
}

const path = (): string => screen.getByTestId('tab-path').textContent ?? ''
const who = (): string => screen.getByTestId('tab-user').textContent ?? ''
const epoch = (): number => Number(screen.getByTestId('tab-epoch').textContent)

/** 문지기 둘과 목록 · 다른 화면 · 로그아웃 단추. `<App />`보다 작다 — 에디터를 안 띄운다. */
function renderTab(options: { client: ApiClient; route: string; hub: TabHub }): { unmount: () => void } {
  homeMounts.length = 0
  return render(
    <ApiProvider client={options.client}>
      <TabChannelProvider channel={options.hub.channel}>
        <MemoryRouter initialEntries={[options.route]}>
          <SessionProvider>
            <Routes>
              <Route
                path="/login"
                element={
                  <RedirectWhenAuthenticated>
                    <span>로그인 폼</span>
                  </RedirectWhenAuthenticated>
                }
              />
              <Route
                element={
                  <RequireAuth>
                    <SessionMenu />
                    <Outlet />
                  </RequireAuth>
                }
              >
                <Route path="/" element={<Home />} />
                <Route path="/elsewhere" element={<span>다른 화면</span>} />
              </Route>
            </Routes>
            <Probe />
          </SessionProvider>
        </MemoryRouter>
      </TabChannelProvider>
    </ApiProvider>,
  )
}

describe('이 탭이 알린다 — 이 탭에서 일어난 로그인·로그아웃만', () => {
  it('이 탭에서 로그인하면 다른 탭에 그 사람을 알린다', async () => {
    const hub = tabHub()
    const client = fakeApi({
      me: async () => {
        throw unauthenticatedError()
      },
      login: async () => ALICE,
      listProjects: async () => [],
    })
    renderWithProviders(<App />, { client, route: '/login', tabChannel: hub.channel })
    fireEvent.change(await screen.findByLabelText('이메일'), { target: { value: ALICE.email } })
    fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: '아무 비밀번호' } })
    fireEvent.click(screen.getByRole('button', { name: '로그인' }))
    await waitFor(() => expect(currentPath()).toBe('/'))

    expect(hub.posted).toEqual([{ kind: 'signed-in', user: ALICE }])
  })

  it('이 탭에서 로그아웃하면 다른 탭에 알린다', async () => {
    const hub = tabHub()
    renderTab({ client: fakeApi({ me: async () => ALICE, logout: async () => undefined }), route: '/', hub })
    await screen.findByText('목록')

    fireEvent.click(screen.getByRole('button', { name: '로그아웃' }))
    await waitFor(() => expect(path()).toBe('/login'))

    expect(hub.posted).toEqual([{ kind: 'signed-out' }])
  })

  it('401 로 끊긴 세션은 알리지 않는다 — 그 401 은 낡은 쿠키로 나간 요청의 것일 수 있다', async () => {
    // 다른 탭이 밥으로 들어온 **뒤에** 앨리스의 쿠키로 나갔던 요청이 401 을 받는 판이다. 그것을 «로그아웃»으로
    // 알리면 멀쩡한 밥의 탭이 로그인 화면으로 간다 — 401 은 **그 요청이 실은 쿠키**에 대해서만 말한다.
    const hub = tabHub()
    const client = fakeApi({
      me: async () => ALICE,
      listProjects: async () => {
        throw unauthenticatedError()
      },
    })
    renderWithProviders(<App />, { client, route: '/', tabChannel: hub.channel })
    await screen.findByLabelText('이메일')

    expect(hub.posted).toEqual([])
  })
})

describe('다른 탭의 소식을 받는다', () => {
  it('로그인 화면의 탭은 다른 탭의 로그인을 따라 들어간다 — 쿠키가 이미 그 사람이다', async () => {
    const hub = tabHub()
    renderTab({
      client: fakeApi({
        me: async () => {
          throw unauthenticatedError()
        },
      }),
      route: '/login',
      hub,
    })
    await screen.findByText('로그인 폼')

    await hub.fromOtherTab({ kind: 'signed-in', user: BOB })

    await screen.findByText('목록')
    expect(path()).toBe('/')
    expect(who()).toBe('밥')
  })

  it('다른 탭이 로그아웃하면 이 탭도 로그인 화면으로 간다 — 세대가 오른다', async () => {
    const hub = tabHub()
    renderTab({ client: fakeApi({ me: async () => ALICE }), route: '/elsewhere', hub })
    await screen.findByText('다른 화면')
    const before = epoch()

    await hub.fromOtherTab({ kind: 'signed-out' })

    expect(path()).toBe('/login')
    expect(screen.queryByText('다른 화면')).toBeNull()
    expect(epoch()).toBe(before + 1)
  })

  it('다른 탭이 다른 사람으로 들어오면 목록으로 — 앞 사람의 화면을 새 사람에게 두지 않는다', async () => {
    const hub = tabHub()
    renderTab({ client: fakeApi({ me: async () => ALICE }), route: '/elsewhere', hub })
    await screen.findByText('다른 화면')

    await hub.fromOtherTab({ kind: 'signed-in', user: BOB })

    await screen.findByText('목록')
    expect(path()).toBe('/')
    expect(who()).toBe('밥')
    expect(screen.queryByText('다른 화면')).toBeNull()
  })

  it('다른 탭이 다른 사람으로 들어오면 이미 목록이어도 새로 받는다 — 앞 사람의 목록이 남지 않는다', async () => {
    const hub = tabHub()
    renderTab({ client: fakeApi({ me: async () => ALICE }), route: '/', hub })
    await screen.findByText('목록')
    expect(homeMounts).toHaveLength(1)

    await hub.fromOtherTab({ kind: 'signed-in', user: BOB })

    await waitFor(() => expect(homeMounts).toHaveLength(2))
    expect(path()).toBe('/')
    expect(who()).toBe('밥')
  })

  it('세션 확인이 도는 동안 온 소식이 이긴다 — 늦게 온 확인의 답은 그 소식보다 낡았다', async () => {
    const hub = tabHub()
    let answer: (user: SessionUser) => void = () => {}
    renderTab({
      client: fakeApi({
        me: () =>
          new Promise<SessionUser>((resolve) => {
            answer = resolve
          }),
      }),
      route: '/',
      hub,
    })

    await hub.fromOtherTab({ kind: 'signed-in', user: BOB })
    await screen.findByText('목록')
    // 마운트의 `me()`는 다른 탭이 쿠키를 바꾸기 **전에** 나갔다 — 앞 사람을 답한다.
    await act(async () => {
      answer(ALICE)
    })

    expect(who()).toBe('밥')
  })

  it('떠나면 그만 듣는다', async () => {
    const hub = tabHub()
    const { unmount } = renderTab({ client: fakeApi({ me: async () => ALICE }), route: '/', hub })
    await screen.findByText('목록')
    expect(hub.listeners()).toBe(1)

    unmount()

    expect(hub.listeners()).toBe(0)
  })
})
