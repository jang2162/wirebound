/**
 * **테마 관리**(`routes/admin-themes.tsx`) — 인스턴스 관리자의 업로드 · 숨김 · 템플릿과 목록 머리의 링크.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { WBTHEME_LIMITS } from '@wirebound/themes'
import { describe, expect, it, vi } from 'vitest'
import { App } from '../../src/app'
import { ApiError, type ApiClient } from '../../src/api/client'
import type { SessionUser, ThemePackageSummary, ThemePackageVersion } from '../../src/api/types'
import { currentPath, fakeApi, renderWithProviders, unauthenticatedError } from '../helpers'

const ADMIN: SessionUser = { id: 'u-1', email: 'admin@example.com', name: '관리자님', isInstanceAdmin: true }
const MEMBER: SessionUser = { id: 'u-2', email: 'me@example.com', name: '멤버', isInstanceAdmin: false }

function version(themeId: string, v: string, extra: Partial<ThemePackageVersion> = {}): ThemePackageVersion {
  return {
    themeId,
    version: v,
    name: themeId === 'acme' ? 'Acme' : '관리자',
    preview: null,
    hidden: false,
    size: 2048,
    uploadedAt: '2026-09-28T01:02:03.000Z',
    uploadedBy: null,
    ...extra,
  }
}

const PACKAGES: ThemePackageSummary[] = [
  {
    themeId: 'acme',
    name: 'Acme',
    description: null,
    latest: '1.0.0',
    versions: [version('acme', '1.1.0', { hidden: true, uploadedBy: { id: 'u-1', name: '관리자님' } }), version('acme', '1.0.0', { uploadedBy: { id: 'u-1', name: '관리자님' } })],
  },
  { themeId: 'system-admin', name: '관리자', description: null, latest: '0.1.0', versions: [version('system-admin', '0.1.0')] },
]

function renderAdmin(user: SessionUser = ADMIN, overrides: Partial<ApiClient> = {}) {
  const api = {
    listThemePackages: vi.fn(async () => PACKAGES),
    uploadThemePackage: vi.fn(async () => ({ themeId: 'acme', version: '2.0.0', name: 'Acme', sha256: 'ab', size: 10 })),
    setThemePackageHidden: vi.fn(async (ref: { themeId: string; version: string }, hidden: boolean) => version(ref.themeId, ref.version, { hidden })),
    downloadThemeTemplate: vi.fn(async () => new Blob([Uint8Array.from([0x50, 0x4b])], { type: 'application/zip' })),
    ...overrides,
  }
  renderWithProviders(<App />, { client: fakeApi({ me: async () => user, listProjects: async () => [], ...api }), route: '/admin/themes' })
  return api
}

function theme(themeId: string): HTMLElement {
  return screen.getByRole('region', { name: themeId })
}

function upload(file: File): void {
  fireEvent.change(screen.getByLabelText('테마 패키지 올리기'), { target: { files: [file] } })
}

const wbtheme = (bytes = 4): File => new File([new Uint8Array(bytes)], 'acme-2.0.0.wbtheme', { type: '' })

describe('테마 관리 — 목록', () => {
  it('관리자에게 테마별 판 목록 — 숨김 표시 · 올린 사람 · «시스템»', async () => {
    renderAdmin()
    await screen.findByRole('heading', { name: '테마 관리' })
    const acme = await waitFor(() => theme('acme'))
    const rows = within(acme).getAllByRole('listitem')
    expect(rows[0]!.textContent).toContain('1.1.0')
    expect(rows[0]!.textContent).toContain('숨김')
    expect(rows[0]!.textContent).toContain('관리자님')
    expect(within(rows[0]!).getByRole('button', { name: 'acme@1.1.0 되살림' })).toBeDefined()
    expect(within(rows[1]!).getByRole('button', { name: 'acme@1.0.0 숨김' })).toBeDefined()
    expect(within(theme('system-admin')).getByRole('listitem').textContent).toContain('시스템')
  })

  it('비관리자가 주소로 오면 «인스턴스 관리자만 볼 수 있습니다» 와 목록 링크 — 조회하지 않는다', async () => {
    const api = renderAdmin(MEMBER)
    await screen.findByText('인스턴스 관리자만 볼 수 있습니다')
    expect(screen.getByRole('link', { name: '프로젝트 목록' }).getAttribute('href')).toBe('/')
    expect(api.listThemePackages).not.toHaveBeenCalled()
  })

  it('동작이 403 이면 같은 문장으로 선다 — 그 사이 강등됐다', async () => {
    renderAdmin(ADMIN, {
      setThemePackageHidden: vi.fn(async () => {
        throw new ApiError(403, 'forbidden', '인스턴스 관리자만 할 수 있습니다')
      }),
    })
    const acme = await waitFor(() => theme('acme'))
    fireEvent.click(within(acme).getByRole('button', { name: 'acme@1.0.0 숨김' }))
    await screen.findByText('인스턴스 관리자만 볼 수 있습니다')
  })
})

describe('테마 관리 — 업로드', () => {
  it('파일을 고르면 그대로 올리고 201 이면 알린 뒤 목록을 다시 읽는다', async () => {
    const api = renderAdmin()
    await waitFor(() => theme('acme'))
    const file = wbtheme()
    upload(file)
    await screen.findByText('acme@2.0.0 을 올렸습니다')
    expect(api.uploadThemePackage).toHaveBeenCalledWith(file)
    await waitFor(() => expect(api.listThemePackages).toHaveBeenCalledTimes(2))
  })

  it('422 는 이슈를 줄마다 — manifestCode 까지', async () => {
    renderAdmin(ADMIN, {
      uploadThemePackage: vi.fn(async () => {
        throw new ApiError(422, 'validation-failed', '테마 패키지를 올리지 않았습니다', [
          { code: 'manifest', path: 'manifest.json:version', message: '판이 semver 가 아닙니다', manifestCode: 'bad-version' },
          { code: 'not-allowed', path: 'assets/x.exe', message: '허용하지 않는 파일입니다' },
        ])
      }),
    })
    await waitFor(() => theme('acme'))
    upload(wbtheme())
    const issues = await screen.findByRole('list', { name: '업로드를 거절한 까닭' })
    expect(within(issues).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'manifest.json:version — 판이 semver 가 아닙니다 (bad-version)',
      'assets/x.exe — 허용하지 않는 파일입니다',
    ])
  })

  it.each([
    [409, 'conflict', '같은 판이 이미 있습니다'],
    [413, 'bad-request', '10 MB 를 넘습니다'],
  ] as const)('%i(%s) 이면 그 문장', async (status, code, sentence) => {
    renderAdmin(ADMIN, {
      uploadThemePackage: vi.fn(async () => {
        throw new ApiError(status, code, '서버 문장')
      }),
    })
    await waitFor(() => theme('acme'))
    upload(wbtheme())
    await screen.findByText(sentence)
  })

  it('10 MB 를 넘는 파일은 보내기 전에 막는다', async () => {
    const api = renderAdmin()
    await waitFor(() => theme('acme'))
    upload(wbtheme(WBTHEME_LIMITS.zipBytes + 1))
    await screen.findByText('10 MB 를 넘습니다')
    expect(api.uploadThemePackage).not.toHaveBeenCalled()
  })
})

describe('테마 관리 — 숨김 · 템플릿', () => {
  it('«숨김» → setThemePackageHidden(ref, true) · 줄이 «되살림» 으로', async () => {
    const api = renderAdmin()
    const acme = await waitFor(() => theme('acme'))
    fireEvent.click(within(acme).getByRole('button', { name: 'acme@1.0.0 숨김' }))
    await within(acme).findByRole('button', { name: 'acme@1.0.0 되살림' })
    expect(api.setThemePackageHidden).toHaveBeenCalledWith({ themeId: 'acme', version: '1.0.0' }, true)
  })

  it('«스타터 템플릿 받기» → downloadThemeTemplate · 404 는 서버 문장 그대로', async () => {
    const message = '템플릿이 빌드되지 않았습니다 — `pnpm build:template`'
    const api = renderAdmin(ADMIN, {
      downloadThemeTemplate: vi.fn(async () => {
        throw new ApiError(404, 'not-found', message)
      }),
    })
    await waitFor(() => theme('acme'))
    fireEvent.click(screen.getByRole('button', { name: '스타터 템플릿 받기' }))
    await screen.findByText(message)
    expect(api.downloadThemeTemplate).toHaveBeenCalledTimes(1)
  })
})

describe('프로젝트 목록 머리의 «테마 관리»', () => {
  it('관리자에게만 선다', async () => {
    renderWithProviders(<App />, { client: fakeApi({ me: async () => ADMIN, listProjects: async () => [] }), route: '/' })
    await screen.findByText('참여 중인 프로젝트가 없습니다')
    fireEvent.click(screen.getByRole('link', { name: '테마 관리' }))
    expect(currentPath()).toBe('/admin/themes')
  })

  it('비관리자에게는 없다', async () => {
    renderWithProviders(<App />, { client: fakeApi({ me: async () => MEMBER, listProjects: async () => [] }), route: '/' })
    await screen.findByText('참여 중인 프로젝트가 없습니다')
    expect(screen.queryByRole('link', { name: '테마 관리' })).toBeNull()
  })

  it('로그인 직후에도 선다 — 로그인 응답의 isInstanceAdmin 으로', async () => {
    let signedIn = false
    const me = vi.fn(async () => {
      if (!signedIn) throw unauthenticatedError()
      return ADMIN
    })
    renderWithProviders(<App />, {
      client: fakeApi({
        me,
        listProjects: async () => [],
        login: async () => {
          signedIn = true
          return ADMIN
        },
      }),
      route: '/login',
    })
    fireEvent.change(await screen.findByLabelText('이메일'), { target: { value: 'admin@example.com' } })
    fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'password1234' } })
    fireEvent.click(screen.getByRole('button', { name: '로그인' }))
    await screen.findByRole('link', { name: '테마 관리' })
    // `/me` 를 다시 부르지 않고 선다 — 첫 세션 확인 한 번뿐이다.
    expect(me).toHaveBeenCalledTimes(1)
  })
})
