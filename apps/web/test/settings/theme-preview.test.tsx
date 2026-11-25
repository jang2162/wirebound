/**
 * 테마 **미리보기의 두 보기**(`settings/theme-preview.tsx`) — «컴포넌트» · «예제 페이지» 전환, 예제의 장 이름 줄, 토큰을 고쳐도 남는 보기 · 장,
 * 관리자 › 테마가 같은 부품을 쓰는지. jsdom 값이다 — 폭 따라가기 · 팝업 구간 · 바깥 기록(«뒤로»)은 실브라우저 판
 * (`build-test/theme-preview.test.ts`)이 잰다.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import type { ThemeManifest } from '@wirebound/theme-sdk'
import { describe, expect, it, vi } from 'vitest'
import { App } from '../../src/app'
import type { ProjectThemeView } from '../../src/api/types'
import { fakeApi, renderWithProviders } from '../helpers'

const USER = { id: 'u-1', email: 'me@example.com', name: '테스터' }

const MANIFEST: ThemeManifest = {
  id: 'system-admin',
  name: '기본테마',
  version: '0.1.0',
  sdk: '^1.0.0',
  tokens: { items: { 'semantic.primary': { type: 'color', label: '주색', default: '#2563eb' } } },
}

const VIEW: ProjectThemeView = {
  themeId: 'system-admin',
  version: '0.1.0',
  tokens: {},
  rev: 1,
  manifest: MANIFEST,
  latest: '0.1.0',
  latestName: '기본테마',
}

function renderSettings(): void {
  renderWithProviders(<App />, {
    client: fakeApi({
      me: async () => USER,
      getProject: async () => ({ id: 'p-1', name: '관리자 콘솔', slug: 'admin', description: null, role: 'owner', themeRev: 1 }),
      getProjectTheme: vi.fn(async () => VIEW),
      listThemePackages: vi.fn(async () => []),
    }),
    route: '/projects/p-1/settings?section=theme',
  })
}

function previewRegion(): HTMLElement {
  return screen.getByRole('region', { name: '미리보기' })
}

function frameDoc(): Document {
  const frame = previewRegion().querySelector('iframe')
  if (frame?.contentDocument == null) throw new Error('미리보기 iframe 이 없습니다')
  return frame.contentDocument
}

const shownPage = (): string | null => frameDoc().querySelector('[data-wb-examples]')?.getAttribute('data-wb-examples') ?? null
const currentPage = (): string[] =>
  within(screen.getByRole('navigation', { name: '예제 페이지' }))
    .getAllByRole('button')
    .filter((button) => button.getAttribute('aria-current') === 'page')
    .map((button) => button.textContent ?? '')

async function examplesOpen(): Promise<void> {
  await waitFor(() => expect(frameDoc().querySelectorAll('[data-wb-gallery-item]').length).toBeGreaterThan(10))
  fireEvent.click(within(screen.getByRole('radiogroup', { name: '미리보기 보기' })).getByRole('radio', { name: '예제 페이지' }))
  await waitFor(() => expect(shownPage()).toBe('dashboard'))
}

describe('미리보기 — 보기 둘', () => {
  it('처음은 «컴포넌트»(그룹 격자) · 장 이름 줄이 없다', async () => {
    renderSettings()
    await waitFor(() => expect(frameDoc().querySelectorAll('[data-wb-gallery-group]').length).toBe(5))
    const radios = within(screen.getByRole('radiogroup', { name: '미리보기 보기' })).getAllByRole('radio') as HTMLInputElement[]
    expect(radios.map((radio) => [radio.labels?.[0]?.textContent, radio.checked])).toEqual([
      ['컴포넌트', true],
      ['예제 페이지', false],
    ])
    expect(screen.queryByRole('navigation', { name: '예제 페이지' })).toBeNull()
  })

  it('«예제 페이지» 를 고르면 장 이름 줄이 서고 첫 장 «대시보드» 가 지금 장이다 · 장 이름으로 고른다', async () => {
    renderSettings()
    await examplesOpen()
    const pages = within(screen.getByRole('navigation', { name: '예제 페이지' })).getAllByRole('button')
    expect(pages.map((button) => button.textContent)).toEqual(['대시보드', '주문 목록', '주문 상세', '주문 등록'])
    expect(currentPage()).toEqual(['대시보드'])
    expect(frameDoc().querySelector('[data-wb-gallery-item]')).toBeNull()
    fireEvent.click(within(screen.getByRole('navigation', { name: '예제 페이지' })).getByRole('button', { name: '주문 상세' }))
    await waitFor(() => expect(shownPage()).toBe('order'))
    expect(currentPage()).toEqual(['주문 상세'])
  })

  it('예제 안의 이동이 장 이름 줄을 따라 바꾼다', async () => {
    renderSettings()
    await examplesOpen()
    // 대시보드 «최근 주문» 카드의 «전체 보기» — 문서 안 이음(틀 링크는 테마의 레이아웃 뷰가 그려 실브라우저 판이 잰다).
    fireEvent.click(frameDoc().querySelector('[data-wb-id="ex-d-all"]')!)
    await waitFor(() => expect(shownPage()).toBe('orders'))
    expect(currentPage()).toEqual(['주문 목록'])
  })

  it('토큰을 고쳐도 고른 보기 · 장이 남는다', async () => {
    renderSettings()
    await examplesOpen()
    fireEvent.click(within(screen.getByRole('navigation', { name: '예제 페이지' })).getByRole('button', { name: '주문 등록' }))
    await waitFor(() => expect(shownPage()).toBe('order-form'))
    fireEvent.change(within(screen.getByRole('group', { name: '토큰' })).getByLabelText('주색'), { target: { value: '#123456' } })
    await waitFor(() => expect(frameDoc().head.querySelector('style[data-wb-style="tokens"]')?.textContent).toContain('#123456'))
    expect(shownPage()).toBe('order-form')
    expect(currentPage()).toEqual(['주문 등록'])
    expect((screen.getByRole('radio', { name: '예제 페이지' }) as HTMLInputElement).checked).toBe(true)
  })
})
