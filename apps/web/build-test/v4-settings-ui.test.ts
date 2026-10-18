/**
 * **셸 밖 화면 넷과 빈 캔버스의 배치**(V4 — 홈 · `/account` · 프로젝트 설정 · `/admin/themes` · 페이지를 안 고른 에디터) — 실브라우저 판.
 *
 * jsdom 은 좌표 · 미디어 질의 · iframe 안 시트를 못 잰다. 여기서 재는 것:
 *
 * | 케이스 | 재는 값 |
 * |---|---|
 * | 가로 스크롤 | 창 1440 · 900 · 700 에서 다섯 화면(설정은 «테마» 탭도)의 문서 `scrollWidth` ≤ `clientWidth` |
 * | `/account` 간격 | «내 정보» 의 이름 줄 아래끝 ↔ 이메일 줄 위끝 ≥ 12px(고른 값 16px) — 창 셋 |
 * | 미리보기 | `/admin/themes` 에서 고른 판이 그 테마로 그려진다 — 미리보기 iframe 의 테마 시트 주소 · 토큰 변수의 계산값 · 테마 뷰의 요소(«샘플 카드») |
 * | 미리보기 높이 | 설정 «테마» 의 미리보기 틀이 창 높이를 안 넘는다(넓은 창) · 창 높이의 60% 를 안 넘는다(좁은 창 — 폼 밑으로 쌓일 때) |
 * | 빈 캔버스 | 안내(그림 · 제목 · 보조 글)의 가운데가 캔버스 칸(보이는 안쪽)의 가운데 ±2px |
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright-core'
import { editorStackPrerequisite, startEditorStack, type EditorStack } from './editor-stack'
import { makeAdmin, sampleTheme, themeProject, uploadRaw } from './theme-fixtures'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

const WIDTHS = [1440, 900, 700] as const
const HEIGHT = 900

/** 문서의 가로 넘침(px) — 0 이면 가로 스크롤이 없다. */
function overflowX(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
}

describe.skipIf(!전제.ok)('V4 — 셸 밖 화면 · 빈 캔버스의 배치', () => {
  let stack: EditorStack
  let projectId = ''

  beforeAll(async () => {
    if (!전제.ok) return
    stack = await startEditorStack(전제)
    await makeAdmin(stack, stack.users.alice)
    const alice = await stack.login(stack.users.alice)
    projectId = (await themeProject(stack, alice)).id
    expect(await uploadRaw(stack, alice, await sampleTheme())).toBe(201)
  })

  afterAll(async () => {
    if (stack === undefined) return
    const { before, after } = await stack.close()
    expect(before.processes).toBeGreaterThan(0)
    expect(before.listeningPorts.length).toBeGreaterThanOrEqual(2)
    expect(before.databases).toBe(1)
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  })

  it('창 1440 · 900 · 700 에서 다섯 화면이 가로 스크롤 없이 선다', async () => {
    const screens: [string, string, (page: Page) => Promise<void>][] = [
      ['홈', '/', (page) => page.getByRole('link', { name: '테마 판', exact: true }).waitFor()],
      ['계정', '/account', (page) => page.getByText('alice@browser.test').waitFor()],
      ['설정', `/projects/${projectId}/settings`, (page) => page.getByRole('region', { name: '일반' }).waitFor()],
      ['설정 «테마»', `/projects/${projectId}/settings?section=theme`, (page) => page.locator('iframe.wb-shell-canvas-iframe').waitFor()],
      ['테마 관리', '/admin/themes', (page) => page.locator('iframe.wb-shell-canvas-iframe').waitFor()],
      ['빈 캔버스', `/projects/${projectId}`, (page) => page.getByText('왼쪽 트리에서 페이지를 고르세요').waitFor()],
    ]
    const measured: string[] = []
    for (const width of WIDTHS) {
      const tab = await stack.openTab(stack.users.alice, { viewport: { width, height: HEIGHT } })
      try {
        for (const [name, path, ready] of screens) {
          await tab.page.goto(path)
          await ready(tab.page)
          measured.push(`${name}@${width}:${await overflowX(tab.page)}`)
        }
      } finally {
        await tab.context.close()
      }
    }
    // 카나리아 — 판 수가 화면 × 창이다(한 판이라도 건너뛰면 아래 «모두 0» 이 덜 잰 것이다).
    expect(measured).toHaveLength(screens.length * WIDTHS.length)
    expect(measured.filter((line) => !line.endsWith(':0'))).toEqual([])
  })

  it('/account — 이름 줄과 이메일 줄 사이가 12px 이상이다(창 셋)', async () => {
    for (const width of WIDTHS) {
      const tab = await stack.openTab(stack.users.alice, { viewport: { width, height: HEIGHT } })
      try {
        await tab.page.goto('/account')
        const profile = tab.page.getByRole('region', { name: '내 정보' })
        const name = profile.getByText('앨리스', { exact: true })
        const email = profile.getByText('이메일', { exact: true })
        await email.waitFor()
        // 줄(라벨 | 값)의 상자로 잰다 — 값이 라벨 밑으로 접힌 판(좁은 창)에도 줄 사이를 잰다.
        const gap = await tab.page.evaluate(
          ([a, b]) => {
            const row = (el: Element): DOMRect => (el.parentElement as HTMLElement).getBoundingClientRect()
            return row(b!).top - row(a!).bottom
          },
          [await name.elementHandle(), await email.elementHandle()],
        )
        expect(gap, `창 ${width}`).toBeGreaterThanOrEqual(12)
      } finally {
        await tab.context.close()
      }
    }
  })

  it('/admin/themes — 고른 판이 그 테마로 그려진다(시트 주소 · 토큰 값 · 테마 뷰), 다른 테마를 고르면 갈린다', async () => {
    const tab = await stack.openTab(stack.users.alice)
    try {
      const { page } = tab
      await page.goto('/admin/themes?theme=sample&version=1.0.0')
      const preview = page.frameLocator('.wb-shell-settings-preview iframe.wb-shell-canvas-iframe')
      await preview.locator('body', { hasText: '샘플 카드' }).waitFor()
      expect(await preview.locator('head link[data-wb-style="theme"]').getAttribute('href')).toBe(
        '/api/theme-packages/sample/1.0.0/files/theme.css',
      )
      // 표지 토큰 — sample 의 `color.primary` 기본값이 미리보기 문서의 변수로 선다.
      const primary = await preview
        .locator('html')
        .evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--wb-color-primary').trim())
      expect(primary).toBe('#e11d48')

      // 목록에서 다른 테마를 고르면 미리보기가 그 테마로 갈린다 — 샘플 뷰가 사라지고 시트가 바뀐다.
      await page
        .getByRole('list', { name: '테마 목록' })
        .getByRole('button', { name: /^커머스/ })
        .click()
      await page.getByRole('heading', { name: /^미리보기 — system-commerce@/ }).waitFor()
      await expect
        .poll(() => preview.locator('head link[data-wb-style="theme"]').getAttribute('href'), { timeout: 10_000 })
        .toMatch(/^\/api\/theme-packages\/system-commerce\/[^/]+\/files\/theme\.css$/)
      expect(await preview.locator('body', { hasText: '샘플 카드' }).count()).toBe(0)
    } finally {
      await tab.context.close()
    }
  })

  it('설정 «테마» — 미리보기 틀은 창 높이 안이다(넓은 창) · 창 높이의 60% 안이다(폼 밑으로 쌓이는 좁은 창)', async () => {
    for (const [width, limit] of [
      [1440, HEIGHT],
      [700, HEIGHT * 0.6],
    ] as const) {
      const tab = await stack.openTab(stack.users.alice, { viewport: { width, height: HEIGHT } })
      try {
        await tab.page.goto(`/projects/${projectId}/settings?section=theme`)
        await tab.page
          .frameLocator('.wb-shell-settings-preview iframe.wb-shell-canvas-iframe')
          .locator('[data-wb-component]')
          .first()
          .waitFor()
        const m = await tab.page.evaluate(() => {
          const frame = document.querySelector('.wb-shell-settings-preview-frame') as HTMLElement
          const box = document.querySelector('.wb-shell-settings-preview') as HTMLElement
          return { frame: frame.getBoundingClientRect().height, gallery: box.scrollHeight }
        })
        // 카나리아 — 갤러리가 틀보다 길다(묶지 않으면 틀이 갤러리 길이로 선다).
        expect(m.gallery, `창 ${width}`).toBeGreaterThan(limit * 2)
        expect(m.frame, `창 ${width}`).toBeLessThanOrEqual(limit + 1)
      } finally {
        await tab.context.close()
      }
    }
  })

  it('빈 캔버스 — 안내의 가운데가 캔버스 칸 가운데에 선다(창 셋)', async () => {
    for (const width of WIDTHS) {
      const tab = await stack.openTab(stack.users.alice, { viewport: { width, height: HEIGHT } })
      try {
        await tab.page.goto(`/projects/${projectId}`)
        const title = tab.page.getByText('왼쪽 트리에서 페이지를 고르세요', { exact: true })
        await title.waitFor()
        const m = await title.evaluate((el) => {
          const canvas = document.querySelector('main[aria-label="캔버스"]') as HTMLElement
          const c = canvas.getBoundingClientRect()
          const s = getComputedStyle(canvas)
          // 칸의 보이는 안쪽 — 테두리 · 스크롤바 안, 안쪽 여백 포함.
          const inner = {
            x: c.left + canvas.clientLeft + canvas.clientWidth / 2,
            y: c.top + canvas.clientTop + canvas.clientHeight / 2,
          }
          // 안내 덩어리 — 그림 위끝 ~ 보조 글 아래끝.
          const block = el.parentElement as HTMLElement
          const first = block.firstElementChild!.getBoundingClientRect()
          const last = block.lastElementChild!.getBoundingClientRect()
          const t = el.getBoundingClientRect()
          return {
            dx: (t.left + t.right) / 2 - inner.x,
            dy: (first.top + last.bottom) / 2 - inner.y,
            fontFamily: getComputedStyle(el).fontFamily,
            padding: s.paddingTop,
          }
        })
        expect(Math.abs(m.dx), `창 ${width} 가로`).toBeLessThanOrEqual(2)
        expect(Math.abs(m.dy), `창 ${width} 세로`).toBeLessThanOrEqual(2)
        // 셸 글꼴이다 — 프레임 안 맨 `<p>` 였을 때는 브라우저 기본 세리프였다.
        expect(m.fontFamily).toContain('system-ui')
      } finally {
        await tab.context.close()
      }
    }
  })
})
