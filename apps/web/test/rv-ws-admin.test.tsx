/**
 * RV-WS 리뷰 항목 3 — 관리자 칸(`shell/workspace-layout.tsx` 의 관리자 묶음 · `routes/admin-pending.tsx` · `routes/admin-themes.tsx`). jsdom 값이다.
 *
 * - 첫 describe(초록): 관리자가 아닌 사람이 다섯 주소를 직접 쳐도 관리자 묶음이 없고 «관리자만» 한 줄이며, 테마 관리는 조회를 안 낸다.
 * - 둘째 describe(초록 — 지금 동작을 적는다): 열린 탭에서 강등되면 사이드바는 관리자 묶음을 그대로 두고(판정 값이 세션 사용자의
 *   `isInstanceAdmin` 이라 `/me` 를 다시 받기 전에는 안 바뀐다), 칸을 누른 화면이 서버의 403 문장을 말한다 — 데이터는 안 보인다.
 * - 셋째 describe(**skip — 지금 빨강**): 다른 탭에서 **같은 사람**이 다시 로그인한 소식이 강등된 값(`isInstanceAdmin: false`)을 실어 와도 이 탭의
 *   사이드바가 관리자 묶음을 그대로 둔다 — `session/session-context.tsx` 의 `heard` 가 같은 사람이면 `renewal` 만 올리고 소식의 사용자를 버린다.
 *   **고칠 트랙이 skip 을 떼고 초록으로 돌린다.**
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from '../src/app'
import { ApiError } from '../src/api/client'
import type { SessionUser } from '../src/api/types'
import { ADMIN_ONLY } from '../src/routes/admin-themes'
import { ADMIN_NAV } from '../src/shell/workspace-nav'
import { fakeApi, renderWithProviders, tabHub } from './helpers'

const MEMBER: SessionUser = { id: 'u-rv', email: 'rv@example.com', name: '리뷰사람 [RV-WS]', isInstanceAdmin: false }
const ADMIN: SessionUser = { ...MEMBER, isInstanceAdmin: true }
const SERVER_FORBIDDEN = '관리자 권한이 없습니다 [RV-WS-403]'

function side(): HTMLElement {
  const found = document.body.querySelector<HTMLElement>('.wb-shell-workspace-side')
  if (found === null) throw new Error('사이드바를 찾지 못했습니다')
  return found
}

function adminGroup(): HTMLElement | null {
  return within(side()).queryByRole('navigation', { name: '관리자' })
}

describe('RV-WS 항목 3 — 관리자가 아닌 사람이 관리자 주소 다섯을 직접 친다', () => {
  it.each(ADMIN_NAV.map((item) => [item.to, item.label] as const))(
    '%s — 관리자 묶음 없음 · «관리자만» 한 줄 · 관리자 조회 0',
    async (to, label) => {
      let themeCalls = 0
      renderWithProviders(<App />, {
        client: fakeApi({
          me: async () => MEMBER,
          listProjects: async () => [],
          listThemePackages: async () => {
            themeCalls += 1
            return []
          },
        }),
        route: to,
      })
      await screen.findByRole('heading', { name: label === '테마' ? '테마 관리' : label })
      const alert = await screen.findByRole('alert')
      expect(alert.textContent).toBe(ADMIN_ONLY)
      expect(adminGroup()).toBeNull()
      expect(themeCalls).toBe(0)
    },
  )
})

describe('RV-WS 항목 3 — 열린 탭에서 강등된 뒤', () => {
  it('사이드바는 관리자 묶음을 그대로 두고, 테마 관리는 서버의 403 문장을 말한다(목록은 안 그린다)', async () => {
    renderWithProviders(<App />, {
      client: fakeApi({
        me: async () => ADMIN,
        listProjects: async () => [],
        listThemePackages: async () => {
          throw new ApiError(403, 'forbidden', SERVER_FORBIDDEN)
        },
      }),
      route: '/',
    })
    await screen.findByRole('heading', { name: '프로젝트' })
    expect(adminGroup()).not.toBeNull()

    fireEvent.click(within(adminGroup() as HTMLElement).getByRole('link', { name: '테마' }))
    await screen.findByRole('heading', { name: '테마 관리' })
    // 목록 조회의 403 은 실패 문장(서버의 것)으로 선다 — `forbidden` 갈래(«관리자만»)는 동작(업로드 · 숨김)의 403 에만 선다.
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(SERVER_FORBIDDEN))
    // 판정 값(`isInstanceAdmin`)은 `/me` 를 다시 받기 전에는 그대로다 — 묶음이 남는다.
    expect(adminGroup()).not.toBeNull()
    expect(document.body.querySelector('[aria-label="테마 목록"]')).toBeNull()
  })
})

/**
 * **이월(2026-10-31 사내 공용 운영) — R-3a.** 다른 탭에서 같은 사람이 다시 로그인한 소식이 강등된 값을 실어 와도 이 탭의 관리자 묶음이 남는다 — 표시만
 * 낡고 권한은 서버가 가른다. 고칠 방향은 보고 `docs/superpowers/plans/2026-10-31-rv-ws-report.md` «3».
 */
describe.skip('RV-WS 항목 3 — 다른 탭에서 같은 사람이 다시 로그인한 소식(강등된 값)', () => {
  it('이 탭의 사이드바가 관리자 묶음을 거둔다', async () => {
    const hub = tabHub()
    renderWithProviders(<App />, {
      client: fakeApi({ me: async () => ADMIN, listProjects: async () => [] }),
      route: '/',
      tabChannel: hub.channel,
    })
    await screen.findByRole('heading', { name: '프로젝트' })
    expect(adminGroup()).not.toBeNull()

    await hub.fromOtherTab({ kind: 'signed-in', user: MEMBER })
    await waitFor(() => expect(adminGroup()).toBeNull())
  })
})
