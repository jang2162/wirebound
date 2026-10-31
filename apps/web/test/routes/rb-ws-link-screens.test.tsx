/**
 * **링크 화면(초대 가입 · 재설정)과 뼈대의 맞물림** — jsdom · 가짜 api. 두 화면은 로그인 화면과 같은 자리라 뼈대(`shell/workspace-layout.tsx`)
 * 밖이고, 로그인한 사람은 프로젝트 목록(뼈대 안)으로 간다(`app.tsx` 의 라우트 표). 가입 뒤 뼈대의 사이드바는 가입 응답의 사용자를 그린다.
 * 화면 각자의 폼 · 판정은 `invite.test.tsx` · `reset.test.tsx` 가 잰다.
 */
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { App } from '../../src/app'
import type { ApiClient } from '../../src/api/client'
import type { ProjectListItem, SessionUser } from '../../src/api/types'
import { currentPath, fakeApi, listItem, renderWithProviders, unauthenticatedError } from '../helpers'

const PROJECT_NAME = '뼈대 안 목록 [RB-WS-목록]'
const PROJECTS: ProjectListItem[] = [listItem({ id: 'p-1', name: PROJECT_NAME, slug: 'p', description: null, role: 'owner' })]
const SIGNED_IN: SessionUser = { id: 'u-1', email: 'me@example.com', name: '이미 들어온 사람', isInstanceAdmin: true }
const NEWCOMER: SessionUser = { id: 'u-new', email: 'new@example.com', name: '갓 가입한 사람 [RB-WS-이름]', isInstanceAdmin: false }

const sidebar = (): HTMLElement | null => screen.queryByRole('navigation', { name: '작업 공간' })

describe('링크 화면과 뼈대', () => {
  for (const route of ['/invite/tok-1', '/reset/tok-1']) {
    it(`로그인한 사람이 ${route.split('/')[1]} 링크를 열면 링크를 확인하지 않고 뼈대 안의 프로젝트 목록에 선다`, async () => {
      const checkInvite = vi.fn<ApiClient['checkInvite']>(async () => undefined)
      const getPasswordReset = vi.fn<ApiClient['getPasswordReset']>(async () => ({ email: 'x@example.com', name: '엑스' }))
      renderWithProviders(<App />, {
        client: fakeApi({ me: async () => SIGNED_IN, listProjects: async () => PROJECTS, checkInvite, getPasswordReset }),
        route,
      })
      await screen.findByText(PROJECT_NAME)
      expect(currentPath()).toBe('/')
      expect(sidebar()).not.toBeNull()
      expect(checkInvite).not.toHaveBeenCalled()
      expect(getPasswordReset).not.toHaveBeenCalled()
    })
  }

  it('로그인하지 않은 사람의 가입 화면에는 사이드바(작업 공간 · 로그아웃)가 없다', async () => {
    const api = fakeApi({
      me: async () => Promise.reject(unauthenticatedError()),
      checkInvite: async () => undefined,
    })
    renderWithProviders(<App />, { client: api, route: '/invite/tok-2' })
    await screen.findByLabelText('이메일')
    expect(sidebar()).toBeNull()
    expect(screen.queryByRole('button', { name: '로그아웃' })).toBeNull()
  })

  it('로그인하지 않은 사람의 재설정 화면에도 사이드바가 없다', async () => {
    const api = fakeApi({
      me: async () => Promise.reject(unauthenticatedError()),
      getPasswordReset: async () => ({ email: 'target@example.com', name: '대상' }),
    })
    renderWithProviders(<App />, { client: api, route: '/reset/tok-2' })
    await screen.findByLabelText('비밀번호 확인')
    expect(sidebar()).toBeNull()
    expect(screen.queryByRole('button', { name: '로그아웃' })).toBeNull()
  })

  it('가입하면 뼈대의 사이드바 바닥이 가입 응답의 이름을 그리고 «관리자» 묶음은 없다', async () => {
    let signedIn = false
    const api = fakeApi({
      me: async () => {
        if (!signedIn) throw unauthenticatedError()
        return NEWCOMER
      },
      listProjects: async () => PROJECTS,
      checkInvite: async () => undefined,
      signupWithInvite: async () => {
        signedIn = true
        return NEWCOMER
      },
    })
    renderWithProviders(<App />, { client: api, route: '/invite/tok-3' })
    await screen.findByLabelText('이메일')
    fireEvent.change(screen.getByLabelText('이메일'), { target: { value: NEWCOMER.email } })
    fireEvent.change(screen.getByLabelText('이름'), { target: { value: NEWCOMER.name } })
    fireEvent.change(screen.getByLabelText('비밀번호(8자 이상)'), { target: { value: 'password1234' } })
    fireEvent.change(screen.getByLabelText('비밀번호 확인'), { target: { value: 'password1234' } })
    fireEvent.click(screen.getByRole('button', { name: '가입' }))
    await screen.findByText(PROJECT_NAME)
    await waitFor(() => expect(sidebar()).not.toBeNull())
    expect(screen.getByText(NEWCOMER.name)).toBeTruthy()
    expect(screen.queryByRole('navigation', { name: '관리자' })).toBeNull()
  })
})
