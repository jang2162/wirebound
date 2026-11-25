/**
 * **셸 단추의 두 높이 — 실브라우저**(`src/shell.css` «셸 단추의 두 높이»). 에디터 밖 화면(관리자 · 공통코드 · 프로젝트 목록)에 보이는 단추가
 * 전부 `--wb-shell-button-sm` · `--wb-shell-button-md` 가운데 한 높이에 서는지 센다 — 창 1280 · 390.
 *
 * | 판 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 화면마다 보이는 단추 | 높이가 두 토큰 값 가운데 하나다 · 화면마다 잰 단추 수 > 0 · 토큰 둘이 선언돼 있다 |
 *
 * **센다** — `<button>` 전부와 단추 꼴로 그린 링크 · 라벨(`DRAWN_AS_BUTTON`). **안 센다**(`NOT_BUTTONS` — 단추 요소지만 단추 꼴이 아니다): 목록의
 * 고르개 카드(`-admin-pick`) · «프로젝트 추가» 카드(`-home-add-button`) · 표 안의 글 링크 단추(`-codes-uses`). 카드 바닥의 보조 링크
 * (`-home-settings` — 손가락 하한 36px)는 `<a>` 이고 `DRAWN_AS_BUTTON` 에 없어 안 센다 — 그 높이는 `project-cards.test.ts` «눌리는 크기» 가 잰다.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright-core'
import { editorStackPrerequisite, startEditorStack, type EditorStack, type Session } from './editor-stack'
import { makeAdmin } from './theme-fixtures'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

const DRAWN_AS_BUTTON = ['wb-shell-settings-open', 'wb-shell-admin-upload']
const NOT_BUTTONS = ['wb-shell-admin-pick', 'wb-shell-home-add-button', 'wb-shell-codes-uses']

interface Seen {
  tokens: { sm: number; md: number }
  buttons: { cls: string; name: string; height: number }[]
}

async function measure(page: Page): Promise<Seen> {
  return page.evaluate(
    ({ drawn, skip }) => {
      const root = document.querySelector('.wb-shell-workspace')
      const read = (name: string): number => (root === null ? NaN : parseFloat(getComputedStyle(root).getPropertyValue(name)))
      const selector = ['button', ...drawn.map((cls) => `.${cls}`)].join(', ')
      const buttons = [...document.querySelectorAll<HTMLElement>(selector)]
        .filter((el) => !skip.some((cls) => el.classList.contains(cls)))
        .map((el) => ({ el, rect: el.getBoundingClientRect() }))
        .filter(({ rect }) => rect.width > 0 && rect.height > 0)
        .map(({ el, rect }) => ({
          cls: el.className,
          name: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim(),
          height: Math.round(rect.height * 100) / 100,
        }))
      return { tokens: { sm: read('--wb-shell-button-sm'), md: read('--wb-shell-button-md') }, buttons }
    },
    { drawn: DRAWN_AS_BUTTON, skip: NOT_BUTTONS },
  )
}

describe.skipIf(!전제.ok)('셸 단추의 두 높이 — 실브라우저', () => {
  let stack: EditorStack
  let alice: Session
  let projectId: string

  beforeAll(async () => {
    if (!전제.ok) return
    stack = await startEditorStack(전제)
    await makeAdmin(stack, stack.users.alice)
    alice = await stack.login(stack.users.alice)
    const project = (await stack.request(alice, 'POST', '/projects', { name: '단추 높이', slug: `buttons-${Date.now().toString(36)}` }))
      .body
    projectId = project.id
    const base = `/projects/${projectId}`
    expect((await stack.request(alice, 'POST', `${base}/codes`, { key: 'CD_402', name: '과목 분류' })).status).toBe(201)
    for (let i = 1; i <= 3; i += 1) {
      expect((await stack.request(alice, 'POST', `${base}/codes/CD_402/items`, { value: `40210${i}`, name: `분류0${i}` })).status).toBe(201)
    }
    // 초대 링크 하나 — 초대 표의 줄 «…» 가 선다.
    expect((await stack.request(alice, 'POST', '/admin/invites', { name: '단추 링크', kind: 'single' })).status).toBe(201)
  })

  afterAll(async () => {
    if (stack === undefined) return
    const { before, after } = await stack.close()
    expect(before.processes).toBeGreaterThan(0)
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  })

  it('관리자 · 공통코드 · 프로젝트 목록 — 보이는 단추가 두 높이 가운데 하나다(창 1280 · 390)', async () => {
    const screens: { name: string; path: string; ready: (page: Page) => Promise<void> }[] = [
      { name: '프로젝트 목록', path: '/', ready: (page) => page.getByRole('link', { name: '단추 높이 열기' }).waitFor() },
      {
        name: '공통코드',
        path: `/projects/${projectId}/codes`,
        ready: (page) => page.getByRole('table', { name: '공통코드 항목' }).locator('tbody tr').nth(2).waitFor(),
      },
      { name: '테마 관리', path: '/admin/themes', ready: (page) => page.locator('.wb-shell-project-item').first().waitFor() },
      { name: '사용자', path: '/admin/users', ready: (page) => page.locator('.wb-shell-admin-row').nth(1).waitFor() },
      { name: '초대 링크', path: '/admin/invites', ready: (page) => page.locator('.wb-shell-admin-row').first().waitFor() },
      { name: '관리자 프로젝트', path: '/admin/projects', ready: (page) => page.locator('.wb-shell-admin-row').first().waitFor() },
    ]
    const log: Record<string, unknown>[] = []
    for (const width of [1280, 390]) {
      const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width, height: 900 } })
      try {
        for (const screen of screens) {
          await page.goto(screen.path)
          await screen.ready(page)
          const seen = await measure(page)
          const label = `${screen.name} · ${width}`
          // 판 카나리아 — 토큰이 읽히고 단추를 셌다.
          expect(seen.tokens.sm, label).toBeGreaterThan(0)
          expect(seen.tokens.md, label).toBeGreaterThan(seen.tokens.sm)
          expect(seen.buttons.length, label).toBeGreaterThan(0)
          const off = seen.buttons.filter((button) => button.height !== seen.tokens.sm && button.height !== seen.tokens.md)
          expect({ label, off }).toEqual({ label, off: [] })
          log.push({ label, count: seen.buttons.length, heights: [...new Set(seen.buttons.map((button) => button.height))] })
        }
      } finally {
        await context.close()
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[shell-buttons] ${JSON.stringify(log)}`)
  })

  /**
   * 테마 판 줄(`/admin/themes`)의 «미리보기» · «숨김» — 같은 위 · 같은 높이이고, 줄 첫 줄(판 이름)과 같은 가운데에 선다. 판 이름의 상자는 줄의
   * 첫 줄 높이 그대로라(가운데 맞춤 아래에서) 그 가운데가 첫 줄의 가운데다.
   */
  it('테마 판 줄 — 두 단추가 같은 위 · 같은 높이 · 판 이름과 같은 가운데(창 1280 · 900)', async () => {
    const log: Record<string, unknown>[] = []
    for (const width of [1280, 900]) {
      const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width, height: 900 } })
      try {
        await page.goto('/admin/themes')
        await page.locator('.wb-shell-admin-version').first().waitFor()
        const rows = await page.evaluate(() =>
          [...document.querySelectorAll('.wb-shell-admin-version')].map((row) => {
            const box = (el: Element | null) => {
              const rect = el?.getBoundingClientRect()
              return rect === undefined ? null : { top: rect.top, height: rect.height, mid: rect.top + rect.height / 2 }
            }
            const [preview, hide] = [...row.querySelectorAll('button')].map(box)
            return { name: box(row.querySelector('.wb-shell-tokens-name')), preview, hide }
          }),
        )
        // 판 카나리아 — 판 줄이 있고 줄마다 단추 둘 · 판 이름이 섰다.
        expect(rows.length).toBeGreaterThan(0)
        for (const row of rows) {
          expect(row.name !== null && row.preview !== undefined && row.hide !== undefined).toBe(true)
          const gaps = {
            top: Math.abs(row.preview!.top - row.hide!.top),
            height: Math.abs(row.preview!.height - row.hide!.height),
            mid: Math.abs(row.name!.mid - row.preview!.mid),
          }
          log.push({ width, ...gaps })
          expect({ width, top: gaps.top, height: gaps.height }).toEqual({ width, top: 0, height: 0 })
          expect(gaps.mid, `${width}`).toBeLessThanOrEqual(1)
        }
      } finally {
        await context.close()
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[shell-buttons 판 줄] ${JSON.stringify(log)}`)
  })
  /**
   * 프로젝트 목록 위 줄 — 검색 · 역할 · 정렬 칸이 한 높이(`--wb-shell-button-md`)다. 같은 줄의 카드는 설명이 없어도 바닥 줄(슬러그 · 단추)이 설명 있는
   * 카드와 같은 높이에 선다 — 설명 없는 카드의 빈자리는 빈 줄이 아니라 같은 줄 카드의 높이에 맞춘 늘임이다(창 390 의 한 줄 하나에서는 안 남는다).
   */
  it('프로젝트 목록 — 위 줄 칸 셋이 한 높이 · 같은 줄 카드의 바닥 줄이 같은 높이(창 1280)', async () => {
    await stack.request(alice, 'POST', '/projects', {
      name: '설명 있음',
      slug: `described-${Date.now().toString(36)}`,
      description: '설명 한 줄',
    })
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1280, height: 900 } })
    try {
      await page.goto('/')
      await page.getByRole('link', { name: '설명 있음 열기' }).waitFor()
      const got = await page.evaluate(() => {
        const root = document.querySelector('.wb-shell-workspace')!
        const md = parseFloat(getComputedStyle(root).getPropertyValue('--wb-shell-button-md'))
        const controls = [...document.querySelectorAll('.wb-shell-home-bar input, .wb-shell-home-bar select')].map(
          (el) => el.getBoundingClientRect().height,
        )
        const cards = [...document.querySelectorAll('.wb-shell-home-card:not(.wb-shell-home-add)')].map((card) => ({
          top: card.getBoundingClientRect().top,
          described: card.querySelector('.wb-shell-home-desc') !== null,
          actions: card.querySelector('.wb-shell-home-actions')!.getBoundingClientRect().top,
        }))
        return { md, controls, cards }
      })
      // 판 카나리아 — 칸 셋 · 같은 줄에 설명 있는 카드와 없는 카드.
      expect(got.controls).toHaveLength(3)
      const row = got.cards.filter((card) => card.top === got.cards[0]!.top)
      expect(new Set(row.map((card) => card.described))).toEqual(new Set([true, false]))
      expect(got.controls).toEqual([got.md, got.md, got.md])
      expect(new Set(row.map((card) => card.actions)).size).toBe(1)
    } finally {
      await context.close()
    }
  })
})
