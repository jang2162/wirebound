/**
 * 설정 페이지 «테마» 절의 **고르기 · 확인**(`settings/theme-section.tsx` · `theme-chooser.tsx`). 토큰 편집은
 * `token-editor.test.tsx` 가 잰다.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { ADMIN_FIXTURE } from '../admin-theme'
import type { ThemeManifest } from '@wirebound/theme-sdk'
import { migrateTokens } from '@wirebound/themes'
import { describe, expect, it, vi } from 'vitest'
import { App } from '../../src/app'
import { ApiError, type ApiClient } from '../../src/api/client'
import type { ProjectRole, ProjectThemeView, ThemePackageSummary, ThemePackageVersion } from '../../src/api/types'
import { fakeApi, renderWithProviders } from '../helpers'

const USER = { id: 'u-1', email: 'me@example.com', name: '테스터' }

const CURRENT: ProjectThemeView = {
  themeId: 'system-admin',
  version: '0.1.0',
  tokens: { 'semantic.primary': '#ff0000', 'radius.sm': '2px', 'semantic.danger': '#aa0000' },
  rev: 4,
  manifest: ADMIN_FIXTURE.manifest,
  latest: '0.2.0',
  latestName: '관리자',
}

/** 바꿀 대상 — 주색은 잇고(같은 타입) · 모서리는 타입이 달라 버린다 · 위험색은 없다. */
const ACME: ThemeManifest = {
  id: 'acme',
  name: 'Acme',
  version: '1.0.0',
  sdk: '^1.0.0',
  tokens: {
    items: {
      'semantic.primary': { type: 'color', label: '주색', default: '#000000' },
      'radius.sm': { type: 'number', label: '모서리', default: 2 },
      fresh: { type: 'color', label: '새것', default: '#ffffff' },
    },
  },
}

function version(themeId: string, v: string, hidden = false): ThemePackageVersion {
  return { themeId, version: v, name: themeId, preview: null, hidden, size: 10, uploadedAt: '2026-09-28T00:00:00.000Z', uploadedBy: null }
}

const PACKAGES: ThemePackageSummary[] = [
  { themeId: 'acme', name: 'Acme', description: null, latest: '1.0.0', versions: [version('acme', '1.0.0')] },
  {
    themeId: 'system-admin',
    name: '관리자',
    description: null,
    latest: '0.2.0',
    versions: [version('system-admin', '0.2.0'), version('system-admin', '0.1.0')],
  },
]

/** 관리자 응답 — 숨긴 판이 «숨김» 으로 실린다. 지금 고정한 0.1.0 도 숨겼다. */
const ADMIN_PACKAGES: ThemePackageSummary[] = [
  {
    themeId: 'acme',
    name: 'Acme',
    description: null,
    latest: '1.0.0',
    versions: [version('acme', '1.1.0', true), version('acme', '1.0.0')],
  },
  {
    themeId: 'system-admin',
    name: '관리자',
    description: null,
    latest: '0.2.0',
    versions: [version('system-admin', '0.2.0'), version('system-admin', '0.1.0', true)],
  },
]

const IMPACT = { tokens: { kept: 3, dropped: 1, defaulted: 2 }, variants: [{ pageId: 'pg-1', title: '회원 목록', count: 2 }] }

function renderTheme(role: ProjectRole = 'owner', overrides: Partial<ApiClient> = {}) {
  const api = {
    getProjectTheme: vi.fn(async () => CURRENT),
    listThemePackages: vi.fn(async () => PACKAGES),
    getThemeManifest: vi.fn(async () => ACME),
    getThemeImpact: vi.fn(async () => IMPACT),
    putProjectTheme: vi.fn(async () => ({
      ...CURRENT,
      themeId: 'acme',
      version: '1.0.0',
      manifest: ACME,
      rev: 5,
      latest: '1.0.0',
      latestName: 'Acme',
    })),
    ...overrides,
  }
  renderWithProviders(<App />, {
    client: fakeApi({
      me: async () => USER,
      getProject: async () => ({ id: 'p-1', name: '관리자 콘솔', slug: 'admin', description: null, role, themeRev: 4 }),
      ...api,
    }),
    route: '/projects/p-1/settings?section=theme',
  })
  return api
}

function section(): HTMLElement {
  return screen.getByRole('region', { name: '테마' })
}

async function ready(): Promise<void> {
  await waitFor(() => expect(within(section()).getByText(/system-admin@0\.1\.0/)).toBeDefined())
}

function select(name: string): HTMLSelectElement {
  return within(section()).getByLabelText(name)
}

function options(name: string): string[] {
  return [...select(name).options].map((option) => `${option.textContent}${option.disabled ? ' [off]' : ''}`)
}

async function chooseAcme(api: ReturnType<typeof renderTheme>): Promise<HTMLElement> {
  await ready()
  await waitFor(() => expect(options('테마')).toContain('Acme'))
  fireEvent.change(select('테마'), { target: { value: 'acme' } })
  const confirm = await within(section()).findByRole('group', { name: '테마 바꾸기 확인' })
  await waitFor(() => expect(within(confirm).getByText('이어짐 3 · 버려짐 1 · 기본값 2')).toBeDefined())
  expect(api.getThemeManifest).toHaveBeenCalledWith({ themeId: 'acme', version: '1.0.0' }, expect.anything())
  expect(api.getThemeImpact).toHaveBeenCalledWith('p-1', { themeId: 'acme', version: '1.0.0' }, expect.anything())
  return confirm
}

describe('«테마» 절 — 지금 값', () => {
  it('이름 id@버전 과 더 높은 판이 있으면 «새 버전»', async () => {
    renderTheme()
    await ready()
    expect(within(section()).getByText('관리자 system-admin@0.1.0')).toBeDefined()
    expect(within(section()).getByText('새 버전 0.2.0')).toBeDefined()
  })

  it('이름은 테마 줄의 것(숨기지 않은 최신판 — 고르개와 같은 이름)이다 — 고정한 판의 manifest 이름이 달라도', async () => {
    const pinned = { ...CURRENT, manifest: { ...ADMIN_FIXTURE.manifest, name: '옛 이름' }, latestName: '새 이름' }
    renderTheme('viewer', { getProjectTheme: async () => pinned })
    await ready()
    expect(within(section()).getByText('새 이름 system-admin@0.1.0')).toBeDefined()
  })

  it('숨기지 않은 판이 없으면(latest 가 null) 고정한 판의 manifest 이름이다', async () => {
    const hidden = { ...CURRENT, manifest: { ...ADMIN_FIXTURE.manifest, name: '옛 이름' }, latest: null, latestName: null }
    renderTheme('viewer', { getProjectTheme: async () => hidden })
    await ready()
    expect(within(section()).getByText('옛 이름 system-admin@0.1.0')).toBeDefined()
  })

  it.each(['editor', 'viewer'] as const)('%s 는 고르개가 없다 — 지금 값만', async (role) => {
    const api = renderTheme(role)
    await ready()
    expect(within(section()).queryByLabelText('테마')).toBeNull()
    expect(within(section()).queryByLabelText('버전')).toBeNull()
    expect(api.listThemePackages).not.toHaveBeenCalled()
  })
})

describe('«테마» 절 — 목록', () => {
  it('비관리자 응답에는 숨긴 판이 없다', async () => {
    renderTheme()
    await ready()
    await waitFor(() => expect(options('테마')).toEqual(['Acme', '관리자']))
    expect(select('테마').value).toBe('system-admin')
    expect(options('버전')).toEqual(['0.2.0', '0.1.0 (지금)'])
  })

  it('관리자 응답의 숨긴 판은 «숨김» 으로 고를 수 없다 — 지금 고정한 판은 숨겼어도 그대로 선다', async () => {
    renderTheme('owner', { listThemePackages: async () => ADMIN_PACKAGES })
    await ready()
    await waitFor(() => expect(options('버전')).toEqual(['0.2.0', '0.1.0 (지금 · 숨김)']))
    fireEvent.change(select('테마'), { target: { value: 'acme' } })
    expect(options('버전')).toEqual(['1.1.0 (숨김) [off]', '1.0.0'])
    expect(select('버전').value).toBe('1.0.0')
  })

  it('지금 고정한 판이 목록에 없으면(비관리자 · 숨긴 판) 그 판을 지금 값으로 넣는다', async () => {
    renderTheme('owner', { listThemePackages: async () => [PACKAGES[0]!] })
    await ready()
    await waitFor(() => expect(options('테마')).toEqual(['Acme', '관리자']))
    expect(options('버전')).toEqual(['0.1.0 (지금)'])
  })
})

describe('«테마» 절 — 바꾸기 확인', () => {
  it('다른 판을 고르면 인라인 확인에 토큰 수와 페이지별 variant 수가 선다', async () => {
    const api = renderTheme()
    const confirm = await chooseAcme(api)
    expect(within(confirm).getByText('회원 목록 — 없는 variant 2개')).toBeDefined()
    expect(api.putProjectTheme).not.toHaveBeenCalled()
  })

  it('«바꾸기» — 본문의 토큰은 migrateTokens 의 결과 · rev 는 지금 값', async () => {
    const api = renderTheme()
    const confirm = await chooseAcme(api)
    fireEvent.click(within(confirm).getByRole('button', { name: '바꾸기' }))
    await waitFor(() => expect(api.putProjectTheme).toHaveBeenCalledTimes(1))
    const expected = migrateTokens(ADMIN_FIXTURE.manifest, ACME, CURRENT.tokens).tokens
    expect(expected).toEqual({ 'semantic.primary': '#ff0000' })
    expect(vi.mocked(api.putProjectTheme).mock.calls[0]).toEqual(['p-1', { themeId: 'acme', version: '1.0.0', tokens: expected, rev: 4 }])
    await waitFor(() => expect(within(section()).getByText('Acme acme@1.0.0')).toBeDefined())
    expect(within(section()).queryByRole('group', { name: '테마 바꾸기 확인' })).toBeNull()
  })

  it('«취소» — 요청이 없고 고르개가 지금 값으로 돌아간다', async () => {
    const api = renderTheme()
    const confirm = await chooseAcme(api)
    fireEvent.click(within(confirm).getByRole('button', { name: '취소' }))
    expect(within(section()).queryByRole('group', { name: '테마 바꾸기 확인' })).toBeNull()
    expect(select('테마').value).toBe('system-admin')
    expect(select('버전').value).toBe('0.1.0')
    expect(api.putProjectTheme).not.toHaveBeenCalled()
  })

  it('409 — 문장과 서버 값으로 다시 읽기', async () => {
    const api = renderTheme('owner', {
      putProjectTheme: vi.fn(async () => {
        throw new ApiError(409, 'conflict', '다른 곳에서 테마를 먼저 저장했습니다', [], true, { ...CURRENT, rev: 5 })
      }),
    })
    const confirm = await chooseAcme(api)
    fireEvent.click(within(confirm).getByRole('button', { name: '바꾸기' }))
    await within(section()).findByText('다른 사람이 먼저 바꿨습니다 — 지금 값을 다시 읽었습니다')
    await waitFor(() => expect(api.getProjectTheme).toHaveBeenCalledTimes(2))
  })

  it('422 hidden-version — «이 판은 숨겨져 고를 수 없습니다»', async () => {
    const api = renderTheme('owner', {
      putProjectTheme: vi.fn(async () => {
        throw new ApiError(422, 'validation-failed', '테마를 저장하지 않았습니다', [
          { code: 'hidden-version', path: 'version', message: '숨긴 버전은 새로 고를 수 없습니다: acme@1.0.0' },
        ])
      }),
    })
    const confirm = await chooseAcme(api)
    fireEvent.click(within(confirm).getByRole('button', { name: '바꾸기' }))
    await within(section()).findByText('이 판은 숨겨져 고를 수 없습니다')
  })
})

/**
 * 고르개의 저장 · 409 다시 읽기도 절의 바인딩을 바꾼다 — 옆 토큰 편집기의 저장 안 한 초안이 남는지(`settings/token-editor.tsx` 머리말
 * «바인딩이 바뀌어도»). 실브라우저 판은 `build-test/theme-review.test.ts` 의 «토큰 초안을 둔 채 …» 둘이다.
 */
describe('«테마» 절 — 고르개와 토큰 초안', () => {
  function draft(label: string): HTMLInputElement {
    return within(screen.getByRole('group', { name: '토큰' })).getByLabelText(label)
  }

  it('다른 판으로 바꾸면 이어지는 칸의 초안은 남고, 옮기지 못한 칸의 수를 한 줄로 말한다', async () => {
    const api = renderTheme()
    await ready()
    fireEvent.change(draft('주색'), { target: { value: '#123456' } })
    // 위험 — 새 판에 없다 · 모서리(작게) — 새 판에서 타입이 다르다.
    fireEvent.change(draft('위험'), { target: { value: '#bbbbbb' } })
    fireEvent.change(draft('모서리(작게)'), { target: { value: '6' } })
    const confirm = await chooseAcme(api)
    fireEvent.click(within(confirm).getByRole('button', { name: '바꾸기' }))
    await waitFor(() => expect(within(section()).getByText('Acme acme@1.0.0')).toBeDefined())
    expect(draft('주색').value).toBe('#123456')
    expect(draft('새것').value).toBe('#ffffff')
    expect(
      within(screen.getByRole('group', { name: '토큰' })).getByText('바꾼 판으로 옮기지 못한 토큰 2 개의 초안을 버렸습니다'),
    ).toBeDefined()
  })

  it('고르개가 409 로 다시 읽어도 같은 판의 초안은 반쯤 친 값까지 남고, 초안이 없는 칸은 서버 값으로 선다', async () => {
    const reread = { ...CURRENT, rev: 5, tokens: { ...CURRENT.tokens, 'semantic.danger': '#00aa00' } }
    const api = renderTheme('owner', {
      getProjectTheme: vi.fn().mockResolvedValueOnce(CURRENT).mockResolvedValue(reread),
      putProjectTheme: vi.fn(async () => {
        throw new ApiError(409, 'conflict', '다른 곳에서 테마를 먼저 저장했습니다', [], true, reread)
      }),
    })
    await ready()
    // 검사에 걸리는 값 — 판이 같으면 옮기지 않고 그대로 둔다(`migrateTokens` 는 이런 값을 버린다).
    fireEvent.change(draft('주색'), { target: { value: '#12' } })
    const confirm = await chooseAcme(api)
    fireEvent.click(within(confirm).getByRole('button', { name: '바꾸기' }))
    await within(section()).findByText('다른 사람이 먼저 바꿨습니다 — 지금 값을 다시 읽었습니다')
    await waitFor(() => expect(draft('위험').value).toBe('#00aa00'))
    expect(draft('주색').value).toBe('#12')
    expect(within(screen.getByRole('group', { name: '토큰' })).queryByText(/옮기지 못한/)).toBeNull()
  })
})
