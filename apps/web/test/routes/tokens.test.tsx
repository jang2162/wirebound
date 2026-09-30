/**
 * «API 토큰» 절(`src/account/tokens-section.tsx` — 계정 설정 `/account` 의 한 절) — jsdom. 목 · 가짜 api 는 **불린 수를 값으로** 단언한다(`CLAUDE.md`
 * «목 · 계측은 불린 수를 값으로 확인하고»). 실브라우저 값은 이 트랙의 보고에 따로 있다.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from '../../src/app'
import { ApiError, type ApiClient } from '../../src/api/client'
import type { MyApiToken, SessionUser } from '../../src/api/types'
import { currentPath, fakeApi, renderWithProviders, unauthenticatedError } from '../helpers'

const USER: SessionUser = { id: 'u-1', email: 'me@example.com', name: '테스터' }

/** 화면 문안은 구현에서 import 하지 않는다 — 문안이 바뀌어도 테스트가 따라가 버린다. */
const EMPTY_NOTICE = '만든 API 토큰이 없습니다'

function token(overrides: Partial<MyApiToken> = {}): MyApiToken {
  return {
    id: 't-1',
    name: 'CI',
    createdAt: '2026-09-01T00:00:00.000Z',
    lastUsedAt: null,
    projectId: 'p-1',
    projectName: '관리자 콘솔',
    member: true,
    ...overrides,
  }
}

/** 서버처럼 도는 가짜 — 지운 것은 다음 목록에서 빠진다. 불린 수를 센다. */
function server(initial: MyApiToken[], overrides: Partial<ApiClient> = {}) {
  let tokens = [...initial]
  const calls = { list: 0, revoke: [] as string[], revokeAll: 0 }
  const client = fakeApi({
    me: async () => USER,
    listProjects: async () => [],
    listMyTokens: async () => {
      calls.list += 1
      return tokens
    },
    revokeMyToken: async (id) => {
      calls.revoke.push(id)
      tokens = tokens.filter((t) => t.id !== id)
    },
    revokeAllMyTokens: async () => {
      calls.revokeAll += 1
      const revoked = tokens.length
      tokens = []
      return { revoked }
    },
    ...overrides,
  })
  return { client, calls }
}

describe('API 토큰 절', () => {
  /** 옛 계정 묶음의 «API 토큰» 링크는 없다 — 셸 밖 화면 머리의 `…`(`shell/page-head.tsx`)가 «계정 설정»으로 가고 토큰은 그 한 절이다. */
  it('머리 `…` 의 «계정 설정»이 계정 설정으로 가고 그 안에 토큰 절이 선다', async () => {
    const { client, calls } = server([token()], {
      me: async () => ({ ...USER, isInstanceAdmin: true }),
      listThemePackages: async () => [],
    })
    renderWithProviders(<App />, { client, route: '/admin/themes' })

    fireEvent.click(await screen.findByRole('button', { name: '더 보기' }))
    expect(currentPath()).toBe('/admin/themes')
    fireEvent.click(screen.getByRole('menuitem', { name: '계정 설정' }))
    await screen.findByRole('heading', { name: 'API 토큰' })
    expect(currentPath()).toBe('/account')
    await screen.findByText('CI')
    expect(calls.list).toBe(1)
  })

  it('멤버가 아닌 프로젝트의 줄은 이름 대신 그 사실과 id 를 적는다 · 쓴 적 없으면 «없음»', async () => {
    const { client } = server([
      token(),
      token({ id: 't-2', name: '떠난 곳', projectId: 'p-9', projectName: null, member: false, lastUsedAt: '2026-09-02T00:00:00.000Z' }),
    ])
    renderWithProviders(<App />, { client, route: '/account' })

    const rows = await screen.findAllByRole('listitem')
    expect(rows).toHaveLength(2)
    within(rows[0]!).getByText('관리자 콘솔')
    expect(rows[0]!.textContent).toContain('마지막 사용 없음')
    within(rows[1]!).getByText('멤버가 아닌 프로젝트 (p-9)')
    expect(rows[1]!.textContent).not.toContain('마지막 사용 없음')
  })

  it('하나 폐기 — 첫 누름은 확인만 열고, 확정하면 그 id 로 한 번 부른 뒤 목록을 다시 받는다', async () => {
    const { client, calls } = server([token(), token({ id: 't-2', name: '노트북' })])
    renderWithProviders(<App />, { client, route: '/account' })

    fireEvent.click(await screen.findByRole('button', { name: 'CI 폐기' }))
    expect(calls.revoke).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: 'CI 폐기 확정' }))

    await waitFor(() => expect(screen.queryByText('CI')).toBeNull())
    expect(calls.revoke).toEqual(['t-1'])
    expect(calls.list).toBe(2)
    screen.getByText('노트북')
    screen.getByText('토큰을 폐기했습니다')
  })

  it('하나 폐기가 404(이미 없다)면 성공으로 친다 — 실패 문장 없이 목록을 다시 받는다', async () => {
    const { client, calls } = server([token()], {
      revokeMyToken: async () => {
        throw new ApiError(404, 'not-found', '토큰을 찾을 수 없습니다', [], true)
      },
    })
    renderWithProviders(<App />, { client, route: '/account' })

    fireEvent.click(await screen.findByRole('button', { name: 'CI 폐기' }))
    fireEvent.click(screen.getByRole('button', { name: 'CI 폐기 확정' }))

    await screen.findByText('토큰을 폐기했습니다')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(calls.list).toBe(2)
  })

  it('전부 폐기 — 확인 뒤 한 번 부르고 거둔 수를 말한다 · 목록이 빈다', async () => {
    const { client, calls } = server([token(), token({ id: 't-2', name: '노트북' }), token({ id: 't-3', name: '떠난 곳', member: false, projectName: null })])
    renderWithProviders(<App />, { client, route: '/account' })

    fireEvent.click(await screen.findByRole('button', { name: '전부 폐기' }))
    expect(calls.revokeAll).toBe(0)
    fireEvent.click(screen.getByRole('button', { name: '토큰 전부 폐기 확정' }))

    await screen.findByText('토큰 3개를 폐기했습니다')
    await screen.findByText(EMPTY_NOTICE)
    expect(calls.revokeAll).toBe(1)
    expect(calls.list).toBe(2)
    expect(screen.queryByRole('button', { name: '전부 폐기' })).toBeNull()
  })

  it('전부 폐기의 확정은 수를 말하지 않는다 — 누른 순간의 전부를 지우고 알림이 서버가 거둔 수를 말한다', async () => {
    // 화면은 둘을 받았고, 그 사이 다른 탭이 하나를 더 발급했다 — 서버의 «전부»는 셋이다.
    const { client, calls } = server([token(), token({ id: 't-2', name: '노트북' })], {
      revokeAllMyTokens: async () => {
        calls.revokeAll += 1
        return { revoked: 3 }
      },
    })
    renderWithProviders(<App />, { client, route: '/account' })

    fireEvent.click(await screen.findByRole('button', { name: '전부 폐기' }))
    expect(screen.getByRole('button', { name: '토큰 전부 폐기 확정' }).textContent).not.toMatch(/\d/)
    fireEvent.click(screen.getByRole('button', { name: '토큰 전부 폐기 확정' }))

    await screen.findByText('토큰 3개를 폐기했습니다')
    expect(calls.revokeAll).toBe(1)
  })

  it('확정은 연타의 둘째 누름(`detail > 1`)을 버린다 — 전부 폐기 · 줄 하나 폐기 둘 다 · 키보드(`detail` 0)는 지난다', async () => {
    const { client, calls } = server([token(), token({ id: 't-2', name: '노트북' })])
    renderWithProviders(<App />, { client, route: '/account' })

    fireEvent.click(await screen.findByRole('button', { name: '전부 폐기' }), { detail: 1 })
    fireEvent.click(screen.getByRole('button', { name: '토큰 전부 폐기 확정' }), { detail: 2 })
    fireEvent.click(screen.getByRole('button', { name: '토큰 전부 폐기 확정' }), { detail: 3 })
    expect(calls.revokeAll).toBe(0)
    fireEvent.click(screen.getByRole('button', { name: '취소' }))

    fireEvent.click(screen.getByRole('button', { name: 'CI 폐기' }), { detail: 1 })
    fireEvent.click(screen.getByRole('button', { name: 'CI 폐기 확정' }), { detail: 2 })
    expect(calls.revoke).toEqual([])

    // 확인은 열린 채다 — 따로 누른 한 번(`detail` 1)은 지난다.
    fireEvent.click(screen.getByRole('button', { name: 'CI 폐기 확정' }), { detail: 1 })
    await waitFor(() => expect(calls.revoke).toEqual(['t-1']))
    await screen.findByText('토큰을 폐기했습니다')

    fireEvent.click(screen.getByRole('button', { name: '전부 폐기' }))
    fireEvent.click(screen.getByRole('button', { name: '토큰 전부 폐기 확정' }), { detail: 0 })
    await waitFor(() => expect(calls.revokeAll).toBe(1))
  })

  it('폐기가 실패하면 서버 문장을 그리고 목록은 그대로다', async () => {
    const { client, calls } = server([token()], {
      revokeAllMyTokens: async () => {
        throw new ApiError(500, 'internal', '토큰 저장소가 응답하지 않습니다 [TK-9]', [], true)
      },
    })
    renderWithProviders(<App />, { client, route: '/account' })

    fireEvent.click(await screen.findByRole('button', { name: '전부 폐기' }))
    fireEvent.click(screen.getByRole('button', { name: '토큰 전부 폐기 확정' }))

    expect((await screen.findByRole('alert')).textContent).toBe('토큰 저장소가 응답하지 않습니다 [TK-9]')
    screen.getByText('CI')
    expect(calls.list).toBe(1)
  })

  it('목록이 401 이면 로그인으로 간다', async () => {
    const { client } = server([], {
      listMyTokens: async () => {
        throw unauthenticatedError()
      },
    })
    renderWithProviders(<App />, { client, route: '/account' })

    await waitFor(() => expect(currentPath()).toBe('/login'))
  })
})
