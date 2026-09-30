/**
 * 설정 «테마» 절의 **토큰 편집기 · 미리보기**(`settings/token-editor.tsx` · `token-field.tsx` · `theme-preview.tsx`).
 *
 * jsdom 값이다 — 미리보기 iframe 의 머리 시트는 요소로, 갤러리는 `[data-wb-gallery-item]` 수로 잰다. 토큰 변수의 계산값(겹침)은 실브라우저
 * 판(`build-test/theme-settings.test.ts`)이 잰다.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import type { ThemeManifest } from '@wirebound/theme-sdk'
import { describe, expect, it, vi } from 'vitest'
import { App } from '../../src/app'
import { ApiError, type ApiClient } from '../../src/api/client'
import type { ProjectRole, ProjectThemeView } from '../../src/api/types'
import { fakeApi, renderWithProviders } from '../helpers'

const USER = { id: 'u-1', email: 'me@example.com', name: '테스터' }

/** 여섯 타입 전부와 무리 없는 키 하나. */
const MANIFEST: ThemeManifest = {
  id: 'system-admin',
  name: '관리자',
  version: '0.1.0',
  sdk: '^1.0.0',
  tokens: {
    groups: [
      { id: 'shape', label: '모양' },
      { id: 'color', label: '색' },
    ],
    items: {
      'semantic.primary': { type: 'color', label: '주색', group: 'color', default: '#2563eb' },
      'semantic.soft': { type: 'color', label: '옅은 색', group: 'color', default: 'rgb(1, 2, 3)' },
      'radius.sm': { type: 'length', label: '모서리', group: 'shape', default: '4px' },
      density: { type: 'select', label: '밀도', group: 'shape', options: ['compact', 'cozy'], default: 'cozy' },
      'space.scale': { type: 'number', label: '간격 배율', group: 'shape', default: 1 },
      'font.body': { type: 'font', label: '본문 글꼴', group: 'color', default: 'Inter' },
      'shadow.card': { type: 'shadow', label: '카드 그림자', default: 'none' },
    },
  },
}

function view(tokens: Record<string, string | number> = {}, rev = 3): ProjectThemeView {
  return { themeId: 'system-admin', version: '0.1.0', tokens, rev, manifest: MANIFEST, latest: '0.1.0' }
}

function renderEditor(role: ProjectRole = 'owner', overrides: Partial<ApiClient> = {}) {
  const api = {
    getProjectTheme: vi.fn(async () => view({ 'semantic.primary': '#ff0000' })),
    listThemePackages: vi.fn(async () => []),
    putProjectTheme: vi.fn(async (_id: string, body: { tokens: Record<string, string | number>; rev: number }) => view(body.tokens, body.rev + 1)),
    ...overrides,
  }
  renderWithProviders(<App />, {
    client: fakeApi({
      me: async () => USER,
      getProject: async () => ({ id: 'p-1', name: '관리자 콘솔', slug: 'admin', description: null, role, themeRev: 3 }),
      ...api,
    }),
    route: '/projects/p-1/settings',
  })
  return api
}

function editor(): HTMLElement {
  return screen.getByRole('group', { name: '토큰' })
}

async function ready(): Promise<void> {
  await waitFor(() => expect(within(editor()).getByLabelText('주색')).toBeDefined())
}

function input(label: string): HTMLInputElement {
  return within(editor()).getByLabelText(label)
}

function type(label: string, value: string): void {
  fireEvent.change(input(label), { target: { value } })
}

function save(): HTMLButtonElement {
  return within(editor()).getByRole('button', { name: '토큰 저장' })
}

function preview(): Document {
  const frame = document.querySelector<HTMLIFrameElement>('.wb-shell-settings-preview iframe')
  if (frame?.contentDocument == null) throw new Error('미리보기 iframe 이 없습니다')
  return frame.contentDocument
}

function previewTokens(): string {
  return preview().head.querySelector('style[data-wb-style="tokens"]')?.textContent ?? ''
}

describe('토큰 편집기 — 폼', () => {
  it('무리 차례대로 서고 무리 없는 키는 «기타» 다', async () => {
    renderEditor()
    await ready()
    const legends = within(editor())
      .getAllByRole('group')
      .map((group) => group.querySelector('legend')?.textContent)
      .filter((text) => text !== undefined)
    expect(legends).toEqual(['모양', '색', '기타'])
  })

  it('타입마다 컨트롤 — color 는 #rrggbb 면 색 칸 + 글 칸, rgb() 면 글 칸만', async () => {
    renderEditor()
    await ready()
    expect(input('주색').value).toBe('#ff0000')
    expect(within(editor()).getByLabelText<HTMLInputElement>('주색 색 고르기').type).toBe('color')
    expect(input('옅은 색').value).toBe('rgb(1, 2, 3)')
    expect(within(editor()).queryByLabelText('옅은 색 색 고르기')).toBeNull()
    expect(input('모서리').type).toBe('number')
    expect(within(editor()).getByLabelText<HTMLSelectElement>('모서리 단위').value).toBe('px')
    expect(within(editor()).getByLabelText<HTMLSelectElement>('밀도').tagName).toBe('SELECT')
    expect(input('간격 배율').type).toBe('number')
    expect(input('본문 글꼴').getAttribute('list')).not.toBeNull()
    expect(input('카드 그림자').type).toBe('text')
  })

  it('반쯤 친 값(#12)은 칸에 사유가 서고 저장이 꺼진다 — 미리보기는 그 키만 기본값', async () => {
    const api = renderEditor()
    await ready()
    type('주색', '#12')
    const field = input('주색').closest('.wb-shell-settings-token')!
    expect(within(field as HTMLElement).getByRole('alert').textContent).toMatch(/색/)
    expect(save().disabled).toBe(true)
    expect(within(editor()).getByText('고칠 칸이 있습니다 — 주색')).toBeDefined()
    await waitFor(() => expect(previewTokens()).toContain('--wb-semantic-primary: #2563eb;'))
    // 고치면 사유가 걷힌다.
    type('주색', '#123456')
    expect(within(field as HTMLElement).queryByRole('alert')).toBeNull()
    expect(save().disabled).toBe(false)
    expect(api.putProjectTheme).not.toHaveBeenCalled()
  })

  it('길이의 수를 비우면 사유 · 저장 꺼짐 — 단위를 바꾸면 값이 따라간다', async () => {
    renderEditor()
    await ready()
    fireEvent.change(within(editor()).getByLabelText('모서리 단위'), { target: { value: 'rem' } })
    await waitFor(() => expect(previewTokens()).toContain('--wb-radius-sm: 4rem;'))
    type('모서리', '')
    expect(save().disabled).toBe(true)
  })

  it('«기본값으로» 는 그 칸을 · «전부 기본값으로» 는 전부를 기본값으로 — 저장 본문에서 빠진다', async () => {
    const api = renderEditor()
    await ready()
    type('카드 그림자', '0 1px 2px #000')
    fireEvent.click(within(input('주색').closest('.wb-shell-settings-token') as HTMLElement).getByRole('button', { name: '기본값으로' }))
    expect(input('주색').value).toBe('#2563eb')
    fireEvent.click(save())
    await waitFor(() => expect(api.putProjectTheme).toHaveBeenCalledTimes(1))
    expect(vi.mocked(api.putProjectTheme).mock.calls[0]).toEqual([
      'p-1',
      { themeId: 'system-admin', version: '0.1.0', tokens: { 'shadow.card': '0 1px 2px #000' }, rev: 3 },
    ])

    fireEvent.click(within(editor()).getByRole('button', { name: '전부 기본값으로' }))
    expect(input('카드 그림자').value).toBe('none')
    fireEvent.click(save())
    await waitFor(() => expect(api.putProjectTheme).toHaveBeenCalledTimes(2))
    expect(vi.mocked(api.putProjectTheme).mock.calls[1]![1]).toEqual({ themeId: 'system-admin', version: '0.1.0', tokens: {}, rev: 4 })
  })

  it('바꾼 것이 없으면 저장이 꺼져 있다 · 수 칸은 수로 보낸다', async () => {
    const api = renderEditor()
    await ready()
    expect(save().disabled).toBe(true)
    type('간격 배율', '1.5')
    fireEvent.click(save())
    await waitFor(() => expect(api.putProjectTheme).toHaveBeenCalledTimes(1))
    expect(vi.mocked(api.putProjectTheme).mock.calls[0]![1].tokens).toEqual({ 'semantic.primary': '#ff0000', 'space.scale': 1.5 })
  })

  it.each(['editor', 'viewer'] as const)('%s 는 칸이 읽기 전용이고 저장이 없다', async (role) => {
    renderEditor(role)
    await ready()
    expect(input('주색').readOnly).toBe(true)
    expect(within(editor()).getByLabelText<HTMLSelectElement>('밀도').disabled).toBe(true)
    expect(within(editor()).queryByRole('button', { name: '토큰 저장' })).toBeNull()
    expect(within(editor()).queryByRole('button', { name: '전부 기본값으로' })).toBeNull()
  })
})

describe('토큰 편집기 — 저장의 실패', () => {
  it('409 — 다른 칸만 «서버 값 · 내 값» 나란히, «서버 값으로» 는 초안을 서버 값으로 · rev 를 갱신', async () => {
    const current = view({ 'semantic.primary': '#00ff00', 'radius.sm': '8px' }, 7)
    const put = vi.fn(async (_id: string, body: { tokens: Record<string, string | number>; rev: number }) => {
      if (put.mock.calls.length === 1) throw new ApiError(409, 'conflict', '다른 곳에서 테마를 먼저 저장했습니다', [], true, current)
      return view(body.tokens, body.rev + 1)
    })
    renderEditor('owner', { putProjectTheme: put })
    await ready()
    type('주색', '#0000ff')
    fireEvent.click(save())
    const conflict = await within(editor()).findByRole('group', { name: '서버 값과 내 값' })
    const rows = within(conflict).getAllByRole('row').slice(1).map((row) => row.textContent)
    expect(rows).toEqual(['주색#00ff00#0000ff', '모서리8px4px'])

    fireEvent.click(within(conflict).getByRole('button', { name: '서버 값으로' }))
    expect(input('주색').value).toBe('#00ff00')
    expect(within(editor()).queryByRole('group', { name: '서버 값과 내 값' })).toBeNull()
    type('본문 글꼴', 'Pretendard')
    fireEvent.click(save())
    await waitFor(() => expect(put).toHaveBeenCalledTimes(2))
    expect(put.mock.calls[1]![1].rev).toBe(7)
  })

  it('409 — «내 값으로 덮기» 는 서버 rev 로 다시 보낸다', async () => {
    const current = view({ 'semantic.primary': '#00ff00' }, 7)
    const put = vi.fn(async (_id: string, body: { tokens: Record<string, string | number>; rev: number }) => {
      if (put.mock.calls.length === 1) throw new ApiError(409, 'conflict', '다른 곳에서 테마를 먼저 저장했습니다', [], true, current)
      return view(body.tokens, body.rev + 1)
    })
    renderEditor('owner', { putProjectTheme: put })
    await ready()
    type('주색', '#0000ff')
    fireEvent.click(save())
    const conflict = await within(editor()).findByRole('group', { name: '서버 값과 내 값' })
    fireEvent.click(within(conflict).getByRole('button', { name: '내 값으로 덮기' }))
    await waitFor(() => expect(put).toHaveBeenCalledTimes(2))
    expect(put.mock.calls[1]![1]).toEqual({ themeId: 'system-admin', version: '0.1.0', tokens: { 'semantic.primary': '#0000ff' }, rev: 7 })
    await waitFor(() => expect(within(editor()).queryByRole('group', { name: '서버 값과 내 값' })).toBeNull())
  })

  it('422 — tokens.<키> 사유가 그 칸에 선다', async () => {
    renderEditor('owner', {
      putProjectTheme: vi.fn(async () => {
        throw new ApiError(422, 'validation-failed', '테마를 저장하지 않았습니다', [
          { code: 'token-too-long', path: 'tokens.font.body', message: '토큰 값은 200 글자까지입니다(201)' },
        ])
      }),
    })
    await ready()
    type('본문 글꼴', 'Pretendard')
    fireEvent.click(save())
    const field = input('본문 글꼴').closest('.wb-shell-settings-token') as HTMLElement
    await waitFor(() => expect(within(field).getByRole('alert').textContent).toBe('토큰 값은 200 글자까지입니다(201)'))
  })
})

describe('토큰 편집기 — 미리보기', () => {
  it('미리보기 iframe 에 갤러리가 서고, 초안을 고치면 tokens 시트만 바뀐다 — 요청 없음', async () => {
    const api = renderEditor()
    await ready()
    await waitFor(() => expect(preview().querySelectorAll('[data-wb-gallery-item]').length).toBeGreaterThan(10))
    const sheets = [...preview().head.querySelectorAll('[data-wb-style]')].map((el) => el.getAttribute('data-wb-style'))
    expect(sheets).toEqual(['base', 'theme', 'tokens'])
    expect(previewTokens()).toContain('--wb-semantic-primary: #ff0000;')
    const reads = vi.mocked(api.getProjectTheme).mock.calls.length

    type('주색', '#abcdef')
    await waitFor(() => expect(previewTokens()).toContain('--wb-semantic-primary: #abcdef;'))
    expect(api.putProjectTheme).not.toHaveBeenCalled()
    expect(vi.mocked(api.getProjectTheme).mock.calls.length).toBe(reads)
  })

  it('미리보기 갤러리는 서버 manifest 의 variant 로 칸을 짓는다 — 번들이 실은 manifest 가 아니라', async () => {
    // 서버에만 Button `huge` — 번들(시험용 로더의 ADMIN_FIXTURE)은 제 manifest 에 없는 variant 다.
    const server: ThemeManifest = { ...MANIFEST, components: { Button: { variants: [{ id: 'huge', label: '아주 큼' }], defaultVariant: 'huge' } } }
    renderEditor('owner', { getProjectTheme: vi.fn(async () => ({ ...view(), manifest: server })) })
    await ready()
    await waitFor(() => expect(preview().querySelectorAll('[data-wb-gallery-item^="Button/"]').length).toBeGreaterThan(0))
    const buttons = new Set([...preview().querySelectorAll('[data-wb-gallery-item^="Button/"]')].map((el) => el.getAttribute('data-wb-gallery-item')!.split('/')[1]))
    expect([...buttons]).toEqual(['huge'])
  })
})
