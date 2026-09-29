/**
 * **에디터가 프로젝트가 고정한 테마로 그린다**(`theme/project-theme.tsx`) — 첫 적재 · `theme-changed` · 다시 읽기의 따라잡기 · 번들 실패.
 *
 * jsdom 값이다 — 번들은 시험용 로더(`test/theme-loader.ts`)가 주고, 시트는 iframe 머리의 요소 차례로 잰다. 시트의 겹침(토큰이 테마 시트의
 * `:root` 를 이기는가)과 실제 스크립트 적재는 실브라우저 판(`build-test/theme-canvas.test.ts`)이 잰다.
 */
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { ADMIN_V0 } from '@wirebound/system-theme-admin'
import { DEFAULT_VIEWS, defineTheme, Root, view, type ThemeDefinition } from '@wirebound/theme-sdk'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../src/api/client'
import type { ProjectThemeView, ProjectView } from '../../src/api/types'
import {
  canvasDocument,
  docWithText,
  OTHER_PAGE_ID,
  openPage,
  PAGE_ID,
  PROJECT_ID,
  PROJECT_NAME,
  renderEditor,
  waitForNode,
} from '../editor-harness'
import { fakeRealtime } from '../fake-realtime'
import { ADMIN_REF, adminThemeView, staticBundleLoader } from '../theme-loader'

/** 테마 뷰로 그렸는지 가르는 판 — `Text` 가 `data-theme` 를 단다(SDK 기본 뷰는 안 단다). */
function themed(id: string, marker: string): ThemeDefinition {
  const Text = view<{ content?: string }>(({ props }) => (
    <Root>
      <span data-theme={marker}>{String(props.content ?? '')}</span>
    </Root>
  ))
  return defineTheme({ manifest: { ...ADMIN_V0.manifest, id }, views: { ...DEFAULT_VIEWS, Text } })
}

const ADMIN = themed('system-admin', 'admin')
const ACME_MANIFEST = { ...ADMIN_V0.manifest, id: 'acme', name: 'Acme', version: '1.0.0' }
const ACME = defineTheme({ manifest: ACME_MANIFEST, views: { ...themed('acme', 'acme').views } })
const ACME_VIEW: ProjectThemeView = { themeId: 'acme', version: '1.0.0', tokens: {}, rev: 1, manifest: ACME_MANIFEST, latest: '1.0.0' }

const DOC = docWithText('t1', '안녕')

function sheets(): string[] {
  return [...canvasDocument().head.querySelectorAll('[data-wb-style]')].map(
    (el) => `${el.tagName.toLowerCase()}:${el.getAttribute('data-wb-style')}${el.getAttribute('href') === null ? '' : `=${el.getAttribute('href')}`}`,
  )
}

function tokenCss(): string {
  return canvasDocument().head.querySelector('style[data-wb-style="tokens"]')?.textContent ?? ''
}

function themeMarker(): string | null {
  return canvasDocument().querySelector('[data-wb-id="t1"]')?.querySelector('[data-theme]')?.getAttribute('data-theme') ?? null
}

function frame(rev: number, tokens: Record<string, string | number>, ref = ADMIN_REF): Record<string, unknown> {
  return { type: 'theme-changed', projectId: PROJECT_ID, ...ref, tokens, rev, actor: { type: 'user', id: 'u-2', label: '밥' } }
}

afterEach(() => vi.useRealTimers())

describe('에디터의 프로젝트 테마', () => {
  it('첫 적재 — base style · theme link · tokens style 차례로, 토큰은 CSS 변수로', async () => {
    const loader = staticBundleLoader({ 'system-admin@0.1.0': ADMIN })
    const getProjectTheme = vi.fn(async () => adminThemeView({ 'semantic.primary': '#ff0000' }))
    await openPage(DOC, { bundleLoader: loader, apiOverrides: { getProjectTheme } })
    await waitFor(() => expect(themeMarker()).toBe('admin'))
    expect(sheets()).toEqual(['style:base', 'link:theme=/api/theme-packages/system-admin/0.1.0/files/theme.css', 'style:tokens'])
    expect(tokenCss()).toContain('--wb-semantic-primary: #ff0000;')
    expect(getProjectTheme).toHaveBeenCalledTimes(1)
    expect(loader.calls).toEqual(['system-admin@0.1.0'])
  })

  it('같은 판의 theme-changed 는 토큰 시트만 바꾼다 — 다시 읽지도 다시 싣지도 않는다 · 같은 프레임 · 옛 rev 는 버린다', async () => {
    const live = fakeRealtime(PROJECT_ID, 'u-1')
    const loader = staticBundleLoader({ 'system-admin@0.1.0': ADMIN })
    const getProjectTheme = vi.fn(async () => adminThemeView({}, 3))
    await openPage(DOC, { bundleLoader: loader, apiOverrides: { getProjectTheme }, realtime: live.realtime })
    live.open()
    await waitFor(() => expect(themeMarker()).toBe('admin'))

    live.deliver(frame(4, { 'semantic.primary': '#00ff00' }))
    await waitFor(() => expect(tokenCss()).toContain('--wb-semantic-primary: #00ff00;'))
    live.deliver(frame(4, { 'semantic.primary': '#0000ff' }))
    live.deliver(frame(2, { 'semantic.primary': '#123456' }))
    await act(async () => {})
    expect(tokenCss()).toContain('--wb-semantic-primary: #00ff00;')
    expect(getProjectTheme).toHaveBeenCalledTimes(1)
    expect(loader.calls).toEqual(['system-admin@0.1.0'])
    expect(themeMarker()).toBe('admin')
  })

  it('다른 판의 theme-changed 는 다시 읽고 새 번들을 싣는다 — 싣는 동안 옛 정의로 그린다', async () => {
    const live = fakeRealtime(PROJECT_ID, 'u-1')
    const loader = staticBundleLoader({ 'system-admin@0.1.0': ADMIN, 'acme@1.0.0': 'hang' })
    let answer: ProjectThemeView = adminThemeView({}, 0)
    const getProjectTheme = vi.fn(async () => answer)
    await openPage(DOC, { bundleLoader: loader, apiOverrides: { getProjectTheme }, realtime: live.realtime })
    live.open()
    await waitFor(() => expect(themeMarker()).toBe('admin'))

    answer = ACME_VIEW
    live.deliver(frame(1, {}, { themeId: 'acme', version: '1.0.0' }))
    await waitFor(() => expect(loader.calls).toEqual(['system-admin@0.1.0', 'acme@1.0.0']))
    expect(getProjectTheme).toHaveBeenCalledTimes(2)
    // 싣는 동안 — 노드도 옛 정의도 옛 시트도 그대로다.
    expect(themeMarker()).toBe('admin')
    expect(sheets()[1]).toBe('link:theme=/api/theme-packages/system-admin/0.1.0/files/theme.css')

    await act(async () => loader.release('acme@1.0.0', { status: 'ok', definition: ACME }))
    await waitFor(() => expect(themeMarker()).toBe('acme'))
    expect(sheets()[1]).toBe('link:theme=/api/theme-packages/acme/1.0.0/files/theme.css')
  })

  it('다시 읽기의 themeRev 가 쥔 rev 보다 크면 다시 읽는다 — 같으면 안 부른다', async () => {
    const live = fakeRealtime(PROJECT_ID, 'u-1')
    const loader = staticBundleLoader({ 'system-admin@0.1.0': ADMIN })
    let project: ProjectView = { id: PROJECT_ID, name: PROJECT_NAME, slug: 'admin-console', description: null, role: 'owner', themeRev: 2 }
    let answer = adminThemeView({}, 2)
    const getProjectTheme = vi.fn(async () => answer)
    await openPage(DOC, {
      bundleLoader: loader,
      apiOverrides: { getProjectTheme, getProject: async () => project },
      realtime: live.realtime,
    })
    live.open()
    await waitFor(() => expect(themeMarker()).toBe('admin'))
    await act(async () => {})
    // 룸에 든 다시 읽기(`joined`)의 themeRev 가 같다 — 다시 읽지 않는다.
    expect(getProjectTheme).toHaveBeenCalledTimes(1)

    // 끊긴 동안 남이 저장했다 — 프레임은 사라졌고 다시 붙은 뒤의 다시 읽기가 새 rev 를 싣는다.
    project = { ...project, themeRev: 3 }
    answer = adminThemeView({ 'semantic.primary': '#abcdef' }, 3)
    live.reconnect()
    await waitFor(() => expect(tokenCss()).toContain('--wb-semantic-primary: #abcdef;'))
    expect(getProjectTheme).toHaveBeenCalledTimes(2)
    expect(loader.calls).toEqual(['system-admin@0.1.0'])
  })

  it('번들이 실패하면 기본 뷰로 그리고 머리에 알린다 — «다시 불러오기» 가 다시 싣고 서면 알림이 걷힌다', async () => {
    const loader = staticBundleLoader({ 'system-admin@0.1.0': 'fail' })
    await openPage(DOC, { bundleLoader: loader, apiOverrides: { getProjectTheme: async () => adminThemeView() } })
    const alert = await screen.findByText(/테마를 불러오지 못해 기본 모양으로 그립니다 — 테마 번들을 받지 못했습니다/)
    expect(alert.closest('.wb-shell-theme-alert')).not.toBeNull()
    expect(themeMarker()).toBeNull()
    await waitForNode('t1')
    // theme 시트를 빼고 base · tokens 만.
    expect(sheets()).toEqual(['style:base', 'style:tokens'])

    loader.set('system-admin@0.1.0', ADMIN)
    fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }))
    await waitFor(() => expect(themeMarker()).toBe('admin'))
    expect(screen.queryByText(/테마를 불러오지 못해/)).toBeNull()
    expect(loader.calls).toEqual(['system-admin@0.1.0', 'system-admin@0.1.0'])
  })

  it('번들이 한도까지 안 오면 같은 알림 — 빈 캔버스로 멈추지 않는다', async () => {
    const loader = staticBundleLoader({ 'system-admin@0.1.0': 'hang' })
    renderEditor({ bundleLoader: loader, docs: { [PAGE_ID]: DOC }, apiOverrides: { getProjectTheme: async () => adminThemeView() } })
    // 기다리는 동안은 «여는 중» 꼴이다 — 로더의 한도(`BUNDLE_DEADLINE_MS`)가 끝낸다(한도 자체는 `bundle-loader.test.ts`).
    await screen.findByText('테마를 불러오는 중…')
    await act(async () =>
      loader.release('system-admin@0.1.0', { status: 'failed', reason: '테마 번들이 10초 안에 오지 않았습니다(system-admin@0.1.0)' }),
    )
    await screen.findByText(/테마를 불러오지 못해 기본 모양으로 그립니다 — 테마 번들이 10초 안에/)
    await waitForNode('t1')
  })

  it('테마를 읽지 못하면(500) failed 알림 · 기본 뷰', async () => {
    const loader = staticBundleLoader({ 'system-admin@0.1.0': ADMIN })
    await openPage(DOC, {
      bundleLoader: loader,
      apiOverrides: {
        getProjectTheme: async () => {
          throw new ApiError(500, 'internal', '서버 오류')
        },
      },
    })
    await screen.findByText(/테마를 불러오지 못해 기본 모양으로 그립니다 — 서버 오류/)
    expect(themeMarker()).toBeNull()
    expect(loader.calls).toEqual([])
    expect(sheets()).toEqual(['style:base', 'style:tokens'])
  })

  it('페이지를 옮겨 iframe 이 새로 서도 세 시트가 같은 차례로 선다', async () => {
    const loader = staticBundleLoader({ 'system-admin@0.1.0': ADMIN })
    await openPage(DOC, {
      bundleLoader: loader,
      apiOverrides: { getProjectTheme: async () => adminThemeView({ 'semantic.primary': '#ff0000' }) },
      docs: { [OTHER_PAGE_ID]: docWithText('t1', '다른 쪽') },
    })
    await waitFor(() => expect(themeMarker()).toBe('admin'))
    const first = canvasDocument()
    fireEvent.click(screen.getByRole('link', { name: '회원 상세' }))
    await waitFor(() => expect(canvasDocument()).not.toBe(first))
    await waitFor(() => expect(themeMarker()).toBe('admin'))
    expect(sheets()).toEqual(['style:base', 'link:theme=/api/theme-packages/system-admin/0.1.0/files/theme.css', 'style:tokens'])
    expect(tokenCss()).toContain('--wb-semantic-primary: #ff0000;')
    expect(loader.calls).toEqual(['system-admin@0.1.0'])
  })
})
