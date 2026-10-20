/**
 * **테마 관리**(`routes/admin-themes.tsx`) — 인스턴스 관리자의 업로드 · 숨김 · 템플릿과 목록 머리의 링크, 목록 + 상세 + 미리보기의 고르기
 * (주소 `?theme=` · `?version=`). 미리보기가 그 테마로 그려지는지는 실브라우저 판(`build-test/v4-settings-ui.test.ts`)이 잰다 — 여기는 고른
 * 판의 manifest 를 읽고 그 판을 번들 로더에 싣는지(설정 미리보기와 같은 길)를 센다.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { WBTHEME_LIMITS } from '@wirebound/themes'
import { describe, expect, it, vi } from 'vitest'
import { App } from '../../src/app'
import { ApiError, type ApiClient } from '../../src/api/client'
import type { SessionUser, ThemePackageSummary, ThemePackageVersion } from '../../src/api/types'
import { currentPath, currentSearch, fakeApi, renderWithProviders, unauthenticatedError } from '../helpers'
import { ADMIN_FIXTURE } from '../admin-theme'
import { staticBundleLoader, type StaticBundleLoader } from '../theme-loader'

const ADMIN: SessionUser = { id: 'u-1', email: 'admin@example.com', name: '관리자님', isInstanceAdmin: true }
const MEMBER: SessionUser = { id: 'u-2', email: 'me@example.com', name: '멤버', isInstanceAdmin: false }

function version(themeId: string, v: string, extra: Partial<ThemePackageVersion> = {}): ThemePackageVersion {
  return {
    themeId,
    version: v,
    name: themeId === 'acme' ? 'Acme' : '기본테마',
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
    versions: [
      version('acme', '1.1.0', { hidden: true, uploadedBy: { id: 'u-1', name: '관리자님' } }),
      version('acme', '1.0.0', { uploadedBy: { id: 'u-1', name: '관리자님' } }),
    ],
  },
  { themeId: 'system-admin', name: '기본테마', description: null, latest: '0.1.0', versions: [version('system-admin', '0.1.0')] },
]

function renderAdmin(
  user: SessionUser = ADMIN,
  overrides: Partial<ApiClient> = {},
  options: { route?: string; loader?: StaticBundleLoader } = {},
) {
  const api = {
    getThemeManifest: vi.fn(async (ref: { themeId: string; version: string }) => ({
      ...ADMIN_FIXTURE.manifest,
      id: ref.themeId,
      version: ref.version,
    })),
    listThemePackages: vi.fn(async () => PACKAGES),
    uploadThemePackage: vi.fn(async () => ({ themeId: 'acme', version: '2.0.0', name: 'Acme', sha256: 'ab', size: 10 })),
    setThemePackageHidden: vi.fn(async (ref: { themeId: string; version: string }, hidden: boolean) =>
      version(ref.themeId, ref.version, { hidden }),
    ),
    downloadThemeTemplate: vi.fn(async () => new Blob([Uint8Array.from([0x50, 0x4b])], { type: 'application/zip' })),
    ...overrides,
  }
  renderWithProviders(<App />, {
    client: fakeApi({ me: async () => user, listProjects: async () => [], ...api }),
    route: options.route ?? '/admin/themes',
    ...(options.loader === undefined ? {} : { bundleLoader: options.loader }),
  })
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
    // 상세는 고른 테마 하나다 — 목록에서 고른다.
    expect(screen.queryByRole('region', { name: 'system-admin' })).toBeNull()
    fireEvent.click(within(screen.getByRole('list', { name: '테마 목록' })).getByRole('button', { name: /^기본테마/ }))
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
    expect(
      within(issues)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['manifest.json:version — 판이 semver 가 아닙니다 (bad-version)', 'assets/x.exe — 허용하지 않는 파일입니다'])
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

describe('프로젝트 목록 머리 `…` 의 «테마 관리»', () => {
  it('관리자에게만 선다', async () => {
    renderWithProviders(<App />, { client: fakeApi({ me: async () => ADMIN, listProjects: async () => [] }), route: '/' })
    await screen.findByText('참여 중인 프로젝트가 없습니다')
    fireEvent.click(screen.getByRole('button', { name: '더 보기' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '테마 관리' }))
    expect(currentPath()).toBe('/admin/themes')
  })

  it('비관리자에게는 없다', async () => {
    renderWithProviders(<App />, { client: fakeApi({ me: async () => MEMBER, listProjects: async () => [] }), route: '/' })
    await screen.findByText('참여 중인 프로젝트가 없습니다')
    fireEvent.click(screen.getByRole('button', { name: '더 보기' }))
    expect(screen.getAllByRole('menuitem').length).toBeGreaterThan(0)
    expect(screen.queryByRole('menuitem', { name: '테마 관리' })).toBeNull()
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
    fireEvent.click(await screen.findByRole('button', { name: '더 보기' }))
    await screen.findByRole('menuitem', { name: '테마 관리' })
    // `/me` 를 다시 부르지 않고 선다 — 첫 세션 확인 한 번뿐이다.
    expect(me).toHaveBeenCalledTimes(1)
  })
})

describe('테마 관리 — 목록 · 상세 · 미리보기', () => {
  const list = (): HTMLElement => screen.getByRole('list', { name: '테마 목록' })
  const current = (): string[] =>
    within(list())
      .getAllByRole('button')
      .filter((button) => button.getAttribute('aria-current') === 'true')
      .map((button) => button.textContent ?? '')

  it('목록은 테마마다 이름 · id · 판 수 · 숨긴 판 수 — 처음에는 첫 테마를 고르고 그 latest 를 미리 본다', async () => {
    const api = renderAdmin()
    await waitFor(() => theme('acme'))
    expect(
      within(list())
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Acmeacme · 2판 · 숨김 1', '기본테마system-admin · 1판'])
    expect(current()).toEqual(['Acmeacme · 2판 · 숨김 1'])
    // latest 는 숨기지 않은 판의 최대(1.0.0)다 — 숨긴 1.1.0 이 위에 있어도.
    expect(within(theme('acme')).getByRole('button', { name: 'acme@1.0.0 미리보기' }).getAttribute('aria-pressed')).toBe('true')
    expect(within(theme('acme')).getByRole('button', { name: 'acme@1.1.0 미리보기' }).getAttribute('aria-pressed')).toBe('false')
    await waitFor(() => expect(api.getThemeManifest).toHaveBeenCalledWith({ themeId: 'acme', version: '1.0.0' }, expect.anything()))
    within(theme('acme')).getByRole('heading', { name: '미리보기 — acme@1.0.0' })
  })

  it('주소의 ?theme= · ?version= 으로 열면 그 테마 · 그 판(숨긴 판도)이다', async () => {
    const loader = staticBundleLoader()
    const api = renderAdmin(ADMIN, {}, { route: '/admin/themes?theme=acme&version=1.1.0', loader })
    await waitFor(() => theme('acme'))
    expect(within(theme('acme')).getByRole('button', { name: 'acme@1.1.0 미리보기' }).getAttribute('aria-pressed')).toBe('true')
    await waitFor(() => expect(api.getThemeManifest).toHaveBeenCalledWith({ themeId: 'acme', version: '1.1.0' }, expect.anything()))
    // 미리보기는 설정 미리보기와 같은 부품 — 같은 번들 로더로 그 판을 싣는다.
    await waitFor(() => expect(loader.calls).toContain('acme@1.1.0'))
    within(theme('acme')).getByRole('region', { name: '미리보기' })
  })

  it('모르는 테마 · 판이면 첫 테마 · 그 latest 로 선다', async () => {
    renderAdmin(ADMIN, {}, { route: '/admin/themes?theme=nope&version=9.9.9' })
    await waitFor(() => theme('acme'))
    expect(within(theme('acme')).getByRole('button', { name: 'acme@1.0.0 미리보기' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('목록에서 고르면 주소가 그 테마 · latest 로 바뀌고 상세가 갈린다 · 판의 «미리보기» 는 판만 바꾼다', async () => {
    const api = renderAdmin()
    await waitFor(() => theme('acme'))
    fireEvent.click(within(list()).getByRole('button', { name: /^기본테마/ }))
    expect(Object.fromEntries(new URLSearchParams(currentSearch()))).toEqual({ theme: 'system-admin', version: '0.1.0' })
    expect(current()).toEqual(['기본테마system-admin · 1판'])
    expect(screen.queryByRole('region', { name: 'acme' })).toBeNull()
    await waitFor(() => expect(api.getThemeManifest).toHaveBeenCalledWith({ themeId: 'system-admin', version: '0.1.0' }, expect.anything()))

    fireEvent.click(within(list()).getByRole('button', { name: /^Acme/ }))
    fireEvent.click(within(theme('acme')).getByRole('button', { name: 'acme@1.1.0 미리보기' }))
    expect(Object.fromEntries(new URLSearchParams(currentSearch()))).toEqual({ theme: 'acme', version: '1.1.0' })
    within(theme('acme')).getByRole('heading', { name: '미리보기 — acme@1.1.0' })
  })

  it('manifest 를 못 읽으면 미리보기 자리에 서버 문장 — 판 줄 · 숨김은 그대로 선다', async () => {
    renderAdmin(ADMIN, {
      getThemeManifest: vi.fn(async () => {
        throw new ApiError(404, 'not-found', '테마 판을 찾을 수 없습니다')
      }),
    })
    await within(await waitFor(() => theme('acme'))).findByText('테마 판을 찾을 수 없습니다')
    within(theme('acme')).getByRole('button', { name: 'acme@1.0.0 숨김' })
  })

  it('올리기가 성공하면 올린 판을 고른다', async () => {
    renderAdmin()
    await waitFor(() => theme('acme'))
    fireEvent.click(within(list()).getByRole('button', { name: /^기본테마/ }))
    upload(wbtheme())
    await screen.findByText('acme@2.0.0 을 올렸습니다')
    await waitFor(() => expect(Object.fromEntries(new URLSearchParams(currentSearch()))).toEqual({ theme: 'acme', version: '2.0.0' }))
    // 목록(가짜)에 2.0.0 이 없으니 판은 latest 로 서지만 테마는 올린 테마다.
    theme('acme')
  })
})
