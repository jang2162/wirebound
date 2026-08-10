/**
 * **이 파일이 P4a-3 전체의 판정이다.**
 *
 * 앞의 아홉 태스크가 전부 초록이어도 여기가 실패하면 이 슬라이스는 아무것도 하지 않은
 * 것이다. 판정 문장: **파생 테마를 만들면 그 프로젝트의 화면이 달라진다.**
 *
 * 다른 테마 둘을 손으로 그려 비교하는 것이 아니다(그것은 P4a-2의 `cascade.test.tsx`가
 * 이미 한다). 여기서 재는 것은 **저장 경계를 지난 값이 화면을 바꾸는가**이므로,
 * 서버가 실제로 내는 것과 같은 모양을 통과시킨다:
 *
 * ```
 * 파생 테마(extends: system:admin)
 *   → 서버의 GET /:projectId/theme 가 mergeTheme으로 합쳐 홀로 서는 테마 하나로 낸다
 *   → useProjectTheme 가 ThemeSource 로 넘긴다
 *   → useThemeCss 가 resolve·compile 해 <style> 에 싣는다
 *   → 캔버스의 계산된 스타일이 갈린다
 * ```
 *
 * **`mergeTheme`을 여기서 부르는 것이 요점이다** — 서버가 그 함수로 합쳐 내므로
 * (`routes/themes.ts`의 `GET /:projectId/theme`), 같은 함수를 통과시켜야 이 케이스가
 * 실제 응답과 어긋나지 않는다. 서버를 띄우지 않는 대신 **서버가 내는 값 그 자체**를 쓴다.
 *
 * ---
 *
 * **jsdom이 `var()`를 치환하지 못한다**(P4a-2가 쟀다). 그래서 값이 토큰에서 오는 자리는
 * 두 조각으로 나눠 잰다 — `:root`의 커스텀 프로퍼티 값이 갈리는 것과, 컴포넌트 규칙이
 * 그 이름을 가리키는 것. 마지막 치환 한 걸음은 실제 브라우저의 몫이다.
 */
import { render, waitFor } from '@testing-library/react'
import { installStructures, renderDocument } from '@wirebound/renderer'
import { installCatalog, type PageDocument } from '@wirebound/schema'
import { ADMIN_THEME, mergeTheme, type Theme, type ThemePatch } from '@wirebound/themes'
import type { ReactElement } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiProvider } from '../../src/api/context'
import type { ProjectTheme } from '../../src/api/types'
import { STRUCTURE_STYLE_ID, THEME_STYLE_ID, useThemeCss } from '../../src/theme/use-theme-css'
import { useProjectTheme } from '../../src/theme/use-project-theme'
import { fakeApi } from '../helpers'

beforeAll(() => {
  installCatalog()
  installStructures()
})

/**
 * **파생 테마.** `system:admin`을 상속해 `semantic` 색 하나와 그것을 쓰는 자리를 덮는다.
 *
 * 값을 **리터럴로** 적는 이유는 jsdom이 `var()`를 치환하지 못하기 때문이다 — 토큰
 * 참조로만 두면 컴포넌트 규칙의 계산값이 두 테마에서 같은 문자열(`var(--wb-…)`)이 되어
 * 갈림이 보이지 않는다. `:root`의 값은 따로 잰다.
 */
const DERIVED: Theme = {
  meta: { id: 'derived', name: '파생', version: '1.0.0', extends: 'system:admin' },
  tokens: { semantic: { surface: '#00ff00' } },
  components: { Card: { structure: 'plain', base: { bg: '#00ff00' } } },
}

/** 서버가 `GET /:projectId/theme`에서 내는 것과 **같은 값**. */
function serverMerged(): Theme {
  const merged = mergeTheme(ADMIN_THEME, DERIVED as ThemePatch)
  expect(merged.issues).toEqual([])
  return merged.theme!
}

const PAGE: PageDocument = {
  version: 1,
  root: {
    id: 'n_000000000001',
    type: 'Page',
    children: [{ id: 'n_000000000002', type: 'Card', props: { title: '카드' } }],
  },
}

/**
 * 캔버스처럼 테마를 싣고 문서를 그리는 최소 컴포넌트.
 *
 * `canvas.tsx` 자체를 렌더하지 않는 이유: 그것은 스토어·선택·오류 경계를 함께 들고 오는데
 * 이 케이스가 재려는 것은 **테마가 화면에 닿는가** 하나다. 겨냥되는 자리(`data-wb-component`
 * 등)는 렌더러가 붙이므로 같은 `renderDocument`를 쓰면 어긋나지 않는다.
 */
function Screen(props: { projectId: string }): ReactElement {
  useThemeCss(useProjectTheme(props.projectId))
  return <>{renderDocument(PAGE)}</>
}

function styleText(id: string): string {
  return document.head.querySelector(`style[data-wb-style="${id}"]`)?.textContent ?? ''
}

/** 테마 하나를 서버가 준 것처럼 실어 화면을 그리고, 잰 값을 돌려준다. */
async function paint(theme: Theme | null): Promise<{ cardBg: string; surfaceVar: string; css: string }> {
  const view = render(
    <ApiProvider client={fakeApi({ getProjectTheme: async (): Promise<ProjectTheme> => ({ themeId: null, theme, issues: [] }) })}>
      <Screen projectId="p1" />
    </ApiProvider>,
  )

  await waitFor(() => expect(styleText(THEME_STYLE_ID)).not.toBe(''))

  const card = view.container.querySelector('[data-wb-component="Card"]')!
  const cardBg = getComputedStyle(card).backgroundColor || getComputedStyle(card).background
  const surfaceVar = getComputedStyle(document.documentElement).getPropertyValue('--wb-semantic-surface').trim()
  const css = styleText(THEME_STYLE_ID)

  view.unmount()
  return { cardBg, surfaceVar, css }
}

beforeEach(() => {
  // `<style>`은 `document.head`의 전역 공유 자원이고 훅이 정리에서 지우지 않는다
  // (`use-theme-css.ts`의 근거). 케이스끼리 새지 않도록 여기서 치운다 — 두 테마의 시트가
  // 함께 남으면 나중 것이 이겨 비교 자체가 무의미해진다.
  for (const id of [STRUCTURE_STYLE_ID, THEME_STYLE_ID]) {
    document.head.querySelector(`style[data-wb-style="${id}"]`)?.remove()
  }
  vi.restoreAllMocks()
})

describe('P4a-3의 판정 — 파생 테마가 화면을 바꾼다', () => {
  it('같은 페이지가 시스템 테마와 파생 테마에서 다르게 그려진다', async () => {
    const system = await paint(ADMIN_THEME)
    const derived = await paint(serverMerged())

    // (1) 컴포넌트 규칙이 실제로 갈린다 — 리터럴이라 계산값 그대로 비교된다.
    expect(derived.cardBg).not.toBe(system.cardBg)
    expect(derived.cardBg).toContain('0, 255, 0')

    // (2) `:root`의 토큰 값도 갈린다. jsdom이 `var()`를 치환하지 못하므로 이 조각을 따로 잰다.
    expect(derived.surfaceVar).not.toBe(system.surfaceVar)
    expect(derived.surfaceVar).toBe('#00ff00')
  })

  /**
   * **파생이 덮지 않은 것은 base에서 그대로 온다.** 이것이 없으면 위 케이스가
   * "테마를 통째로 갈아 끼웠다"로도 설명된다 — 상속이 실제로 일어났음을 보여야 한다.
   */
  it('파생이 덮지 않은 절은 base의 것이 그대로 실린다', async () => {
    const system = await paint(ADMIN_THEME)
    const derived = await paint(serverMerged())

    // `admin`이 정의한 다른 토큰들이 그대로 있다.
    const rootVars = (css: string): string[] =>
      [...css.matchAll(/--wb-[a-z0-9-]+(?=:)/gi)].map((match) => match[0]).sort()

    const inherited = rootVars(system.css).filter((name) => name !== '--wb-semantic-surface')
    expect(rootVars(derived.css)).toEqual(expect.arrayContaining(inherited))
  })

  /**
   * **홀로 선다.** 서버가 합쳐 내므로 `extends`가 빠져 있고, 그래서 화면이
   * `resolveTheme(theme)`을 base 없이 부를 수 있다(`ThemeSource`가
   * `() => Theme | null`인 이유).
   */
  it('서버가 준 값에는 extends가 없다', () => {
    expect(serverMerged().meta.extends).toBeUndefined()
    expect(DERIVED.meta.extends).toBe('system:admin')
  })

  it('테마가 없으면 구조 기본 CSS만 남고 화면은 그대로 그려진다', async () => {
    const view = render(
      <ApiProvider client={fakeApi({ getProjectTheme: async () => ({ themeId: null, theme: null, issues: [] }) })}>
        <Screen projectId="p1" />
      </ApiProvider>,
    )

    await waitFor(() => expect(styleText(STRUCTURE_STYLE_ID)).not.toBe(''))
    expect(styleText(THEME_STYLE_ID)).toBe('')
    expect(view.container.querySelector('[data-wb-component="Card"]')).toBeTruthy()
  })
})
