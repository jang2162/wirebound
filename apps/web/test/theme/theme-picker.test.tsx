/**
 * **테마 고르개**(P4b-3 계획서 D2·P2).
 *
 * **완료 조건이 "고른 값이 캔버스에 반영되는 것"이다.** 그래서 이 파일의 핵심 케이스는
 * `<App />`을 라우트째 렌더해 **셸 → 신호 → 캔버스 → `useProjectTheme` → `useThemeCss`**
 * 배선을 통째로 지난 뒤 **`<style>`의 내용**을 본다. 고르개만 떼어 내 `setProjectTheme`이
 * 불렸는지 세면 그 사슬이 하나라도 끊겨 있어도 초록이다 — 이 저장소가 *"형제 가드를
 * 지나지 않은 자리"*로 여섯 번 겪은 부류다(P4a-3 이월).
 *
 * **가짜 서버가 상태를 든다.** `setProjectTheme`이 값을 바꾸고 `getProjectTheme`이 그것을
 * 읽어야 *"다시 조회했다"*와 *"응답을 화면에 꽂았다"*가 갈린다. 고정 응답을 주면 캔버스가
 * 재조회를 안 해도 같은 값이 보인다.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { systemTheme, type Theme } from '@wirebound/themes'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '../../src/api/client'
import type { ProjectTheme, ThemeSummary } from '../../src/api/types'
import { THEME_STYLE_ID } from '../../src/theme/use-theme-css'
import { openPage, pageDoc, renderEditor } from '../editor-harness'

const ADMIN_ID = 'th-admin'
const BRAND_ID = 'th-brand'

/** `admin`에 없는 값이라야 시트에서 갈린 것을 알아볼 수 있다. */
const BRAND_PRIMARY = '#abc123'

function brandTheme(): Theme {
  return {
    meta: { id: 'brand', name: '브랜드', version: '1.0.0' },
    tokens: { semantic: { primary: BRAND_PRIMARY } },
  }
}

const OPTIONS: ThemeSummary[] = [
  { id: ADMIN_ID, system: true, theme: systemTheme('admin')! },
  { id: BRAND_ID, system: false, theme: brandTheme() },
]

/**
 * 서버의 `themes` 상태를 흉내 내는 가짜. **`setProjectTheme`이 실제로 상태를 바꾼다.**
 *
 * `null`은 *"테마를 고르지 않았다"*이고 정상 상태다 — 그때 `theme`도 `null`이라
 * 화면은 구조 기본 CSS만으로 그려진다(서버와 같은 규칙).
 */
function fakeThemeServer(initial: string | null = ADMIN_ID) {
  let chosen = initial

  const byId = (id: string | null): Theme | null =>
    OPTIONS.find((entry) => entry.id === id)?.theme ?? null

  const setProjectTheme = vi.fn(async (_projectId: string, themeId: string | null) => {
    chosen = themeId
    return { themeId: chosen, theme: byId(chosen), issues: [] } satisfies ProjectTheme
  })

  return {
    chosen: () => chosen,
    setProjectTheme,
    overrides: {
      listProjectThemes: async () => OPTIONS,
      getProjectTheme: async () => ({ themeId: chosen, theme: byId(chosen), issues: [] }),
      setProjectTheme,
    } satisfies Partial<ApiClient>,
  }
}

function picker(): HTMLSelectElement {
  return screen.getByRole<HTMLSelectElement>('combobox', { name: '테마' })
}

function themeCss(): string {
  return document.head.querySelector(`style[data-wb-style="${THEME_STYLE_ID}"]`)?.textContent ?? ''
}

beforeEach(() => {
  // `<style>`은 `document.head`의 전역 공유 자원이고 훅이 정리에서 지우지 않는다
  // (`use-theme-css.ts`의 근거). 케이스끼리 새지 않도록 여기서 치운다.
  document.head.querySelector(`style[data-wb-style="${THEME_STYLE_ID}"]`)?.remove()
})

describe('테마 고르개', () => {
  it('지금 골라진 테마가 선택되어 있다', async () => {
    const server = fakeThemeServer(BRAND_ID)
    renderEditor({ apiOverrides: server.overrides })
    await screen.findByRole('heading', { name: '관리자 콘솔 설계서' })

    // **`themeId`로 맞춘다.** `theme.meta.id`(slug)로는 못 맞댄다 — 시스템 테마와
    // 프로젝트 테마가 같은 slug를 가질 수 있다(`api/types.ts`의 `ProjectTheme.themeId`).
    await waitFor(() => expect(picker().value).toBe(BRAND_ID))
  })

  it('목록에 없음과 두 테마가 있고 시스템 테마에 표시가 붙는다', async () => {
    renderEditor({ apiOverrides: fakeThemeServer().overrides })
    await screen.findByRole('heading', { name: '관리자 콘솔 설계서' })
    await waitFor(() => expect(picker().value).toBe(ADMIN_ID))

    expect(within(picker()).getAllByRole('option').map((option) => option.textContent)).toEqual([
      '없음',
      // 시스템 표시가 없으면 같은 이름의 프로젝트 테마와 갈리지 않는다.
      '관리자 (내장)',
      '브랜드',
    ])
  })

  /**
   * **이 케이스가 P2의 완료 조건이다.** 고르개 → 서버 → 캔버스의 사슬 전체를 지난다.
   */
  it('고른 테마가 캔버스의 시트에 실린다', async () => {
    const server = fakeThemeServer(ADMIN_ID)
    await openPage(pageDoc({ id: 'n1', type: 'Text', props: { content: '가' } }), {
      apiOverrides: server.overrides,
    })

    // **양성 대조**: 고르기 전에는 그 값이 없다. 이것이 없으면 시트가 처음부터
    // 브랜드 색을 담고 있어도 아래가 통과한다.
    await waitFor(() => expect(themeCss()).toContain('--wb-'))
    expect(themeCss()).not.toContain(BRAND_PRIMARY)

    fireEvent.change(picker(), { target: { value: BRAND_ID } })

    // 서버가 바뀌고,
    await waitFor(() => expect(server.chosen()).toBe(BRAND_ID))
    // **캔버스가 다시 조회해 다시 컴파일한다.**
    await waitFor(() => expect(themeCss()).toContain(BRAND_PRIMARY))
  })

  /**
   * **`없음`이 자리표시가 아니라 선택지다**(D2). *"테마를 고르지 않았다"*는 정상 상태이고
   * 화면은 그때 구조 기본 CSS만으로 그려진다 — 고르개에 이 항목이 있어야 그 상태를
   * 눈으로 확인할 수 있다.
   */
  it('없음을 고르면 테마 시트가 비고 서버에 null이 간다', async () => {
    const server = fakeThemeServer(BRAND_ID)
    await openPage(pageDoc({ id: 'n1', type: 'Text', props: { content: '가' } }), {
      apiOverrides: server.overrides,
    })
    await waitFor(() => expect(themeCss()).toContain(BRAND_PRIMARY))

    fireEvent.change(picker(), { target: { value: '' } })

    await waitFor(() => expect(server.chosen()).toBeNull())
    expect(server.setProjectTheme).toHaveBeenCalledWith(expect.any(String), null)
    await waitFor(() => expect(themeCss()).toBe(''))
  })

  it('owner가 아니면 읽기 전용이다', async () => {
    const server = fakeThemeServer()
    renderEditor({
      apiOverrides: {
        ...server.overrides,
        getProject: async () => ({
          id: 'p-1',
          name: '관리자 콘솔 설계서',
          slug: 'admin-console',
          description: null,
          role: 'editor' as const,
        }),
      },
    })
    await screen.findByRole('heading', { name: '관리자 콘솔 설계서' })
    await waitFor(() => expect(picker().value).toBe(ADMIN_ID))

    // 서버도 403으로 막지만(§10) 화면이 미리 보여주는 편이 낫다.
    expect(picker().disabled).toBe(true)
  })

  /**
   * **실패하면 화면이 서버의 상태로 돌아간다.** 그대로 두면 고르개가 서버에 없는 상태를
   * 말하고, 사용자는 테마가 바뀐 줄 안 채 캔버스만 안 바뀌는 것을 본다.
   */
  it('서버가 거절하면 고른 값을 되돌린다', async () => {
    const failing: Partial<ApiClient> = {
      listProjectThemes: async () => OPTIONS,
      getProjectTheme: async () => ({ themeId: ADMIN_ID, theme: systemTheme('admin')!, issues: [] }),
      setProjectTheme: async () => {
        throw new Error('거절')
      },
    }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderEditor({ apiOverrides: failing })
    await screen.findByRole('heading', { name: '관리자 콘솔 설계서' })
    await waitFor(() => expect(picker().value).toBe(ADMIN_ID))

    fireEvent.change(picker(), { target: { value: BRAND_ID } })

    await waitFor(() => expect(picker().value).toBe(ADMIN_ID))
    vi.mocked(console.error).mockRestore()
  })

  it('목록을 못 읽으면 고르개를 안 그린다', async () => {
    // 빈 목록을 그리면 사용자가 *"고를 테마가 없다"*로 읽는데 실제로는 못 읽은 것이다.
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderEditor({
      apiOverrides: {
        listProjectThemes: async () => {
          throw new Error('못 읽음')
        },
      },
    })
    await screen.findByRole('heading', { name: '관리자 콘솔 설계서' })

    await waitFor(() => expect(console.error).toHaveBeenCalled())
    expect(screen.queryByRole('combobox', { name: '테마' })).toBeNull()
    vi.mocked(console.error).mockRestore()
  })
})
