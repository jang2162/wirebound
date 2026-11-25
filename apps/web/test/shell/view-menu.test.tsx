/**
 * **머리의 «보기»**(`src/shell/view-menu.tsx` 머리말의 표) — 편집 모드에만 선다 · 끌 영역이 없으면 꺼지고 까닭을 말한다 · 항목을 누르면 PUT 하나
 * (연달아 누른 것은 마지막 값 하나) · 실패면 되돌리고 하단 바에 한 줄. 값의 낙관 반영 · 겹치지 않는 PUT 자체는 `../store/view-prefs.test.tsx` 가
 * 공급자만 세워 잰다 — 여기는 머리의 단추로 누른 판이다.
 *
 * 하네스 테마(`../admin-theme.ts`)는 `layouts` 가 없다 — 영역을 선언한 판은 바인딩의 manifest 에 `layouts` 를 얹는다(캔버스 번들은 그대로다).
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { isolateBidi, type PageDocument } from '@wirebound/schema'
import type { ThemeManifest } from '@wirebound/theme-sdk'
import { describe, expect, it } from 'vitest'
import { ApiError, type ApiClient } from '../../src/api/client'
import { VIEW_MENU_LABEL, VIEW_MENU_NO_REGIONS, VIEW_MENU_NO_THEME } from '../../src/shell/view-menu'
import { VIEW_PREFS_FAILED } from '../../src/store/use-view-prefs'
import { ADMIN_FIXTURE } from '../admin-theme'
import { openPage, pageDoc } from '../editor-harness'
import { adminThemeView } from '../theme-loader'
import '../../src/catalog-setup'

/** 방향 제어 글자를 든 영역 이름 — 메뉴 이름이 `isolateBidi` 를 지났는지 가른다. */
const TRICKY = '\u202E왼쪽'

const LAYOUTS: ThemeManifest['layouts'] = {
  subpage: {
    regions: [
      { id: 'gnb', label: 'GNB' },
      { id: 'lnb', label: TRICKY },
      { id: 'title', label: '페이지 제목', toggle: false },
    ],
  },
}

const BODY = [{ id: 'n-text', type: 'Text', props: { content: '본문' } }]
const SUBPAGE: PageDocument = { ...pageDoc({ id: 'n-root', type: 'Page', children: BODY }), layout: 'subpage' }
const BLANK: PageDocument = pageDoc({ id: 'n-root', type: 'Page', children: BODY })

interface Put {
  body: string[]
  resolve: (value: string[]) => void
  reject: (reason: unknown) => void
}

function server(layouts: ThemeManifest['layouts'] | null = LAYOUTS): { puts: Put[]; api: Partial<ApiClient> } {
  const puts: Put[] = []
  const view = adminThemeView()
  return {
    puts,
    api: {
      getProjectTheme: async () => ({ ...view, manifest: { ...ADMIN_FIXTURE.manifest, ...(layouts === null ? {} : { layouts }) } }),
      getViewPrefs: async () => [],
      putViewPrefs: (_projectId, hiddenRegions) =>
        new Promise<string[]>((resolve, reject) => {
          puts.push({ body: [...hiddenRegions], resolve, reject })
        }),
    },
  }
}

function viewButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: VIEW_MENU_LABEL }) as HTMLButtonElement
}

function item(name: string): HTMLElement {
  return within(screen.getByRole('menu', { name: VIEW_MENU_LABEL })).getByRole('menuitemcheckbox', { name })
}

async function openMenu(): Promise<void> {
  await waitFor(() => expect(viewButton().disabled).toBe(false))
  fireEvent.click(viewButton())
  await screen.findByRole('menu', { name: VIEW_MENU_LABEL })
}

describe('머리의 «보기»', () => {
  it('편집 모드에만 선다 — 끌 수 있는 영역마다 켠 항목 · 이름은 manifest 의 label(방향 격리)', async () => {
    const { api } = server()
    await openPage(SUBPAGE, { apiOverrides: api })
    await openMenu()
    const items = within(screen.getByRole('menu', { name: VIEW_MENU_LABEL })).getAllByRole('menuitemcheckbox')
    expect(items.map((entry) => [entry.textContent, entry.getAttribute('aria-checked')])).toEqual([
      ['GNB', 'true'],
      [isolateBidi(TRICKY), 'true'],
    ])
    // 항목도 아이콘(켬 · 끔의 표지)을 받는다 — 아이콘 인구조사(`./icon-census.test.tsx`)는 꺼진 «보기» 를 못 연다.
    expect(items.map((entry) => entry.querySelector('svg.wb-shell-action-menu-icon') !== null)).toEqual([true, true])
    fireEvent.click(screen.getByRole('button', { name: '뷰 모드' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: VIEW_MENU_LABEL })).toBeNull())
  })

  it('끌 영역이 없는 레이아웃이면 꺼지고 까닭을 말한다', async () => {
    const { api } = server()
    await openPage(BLANK, { apiOverrides: api })
    await waitFor(() => expect(viewButton().getAttribute('aria-description')).toBe(VIEW_MENU_NO_REGIONS))
    expect([viewButton().disabled, viewButton().title]).toEqual([true, VIEW_MENU_NO_REGIONS])
  })

  it('영역을 선언하지 않은 테마면 꺼지고 까닭을 말한다', async () => {
    const { api } = server(null)
    await openPage(SUBPAGE, { apiOverrides: api })
    await waitFor(() => expect(viewButton().getAttribute('aria-description')).toBe(VIEW_MENU_NO_THEME))
    expect(viewButton().disabled).toBe(true)
  })

  it('누르면 메뉴가 열린 채 곧바로 바뀌고 PUT 하나 — 연달아 셋을 누르면 앞 답 뒤에 마지막 값 하나', async () => {
    const { api, puts } = server()
    await openPage(SUBPAGE, { apiOverrides: api })
    await openMenu()
    fireEvent.click(item('GNB'))
    expect(item('GNB').getAttribute('aria-checked')).toBe('false')
    expect(puts.map((put) => put.body)).toEqual([['subpage.gnb']])
    fireEvent.click(item(isolateBidi(TRICKY)))
    fireEvent.click(item('GNB'))
    expect([item('GNB').getAttribute('aria-checked'), item(isolateBidi(TRICKY)).getAttribute('aria-checked')]).toEqual(['true', 'false'])
    expect(puts).toHaveLength(1)
    await act(async () => puts[0]!.resolve(puts[0]!.body))
    await waitFor(() => expect(puts.map((put) => put.body)).toEqual([['subpage.gnb'], ['subpage.lnb']]))
  })

  it('PUT 이 실패하면 서버 값으로 되돌리고 하단 바에 한 줄', async () => {
    const { api, puts } = server()
    await openPage(SUBPAGE, { apiOverrides: api })
    await openMenu()
    fireEvent.click(item('GNB'))
    expect(item('GNB').getAttribute('aria-checked')).toBe('false')
    await act(async () => puts[0]!.reject(new ApiError(500, 'internal', '서버 오류')))
    await waitFor(() => expect(item('GNB').getAttribute('aria-checked')).toBe('true'))
    expect(await screen.findByText(VIEW_PREFS_FAILED, { exact: false })).toBeTruthy()
  })
})
