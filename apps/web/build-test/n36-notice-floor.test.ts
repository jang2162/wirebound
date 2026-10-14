/**
 * **판이 바닥(`PALETTE_HEIGHT_FLOOR` 120)에 닿는 낮은 창에서 하단 바 통지가 어떻게 서는지 잰다**(L-286 — 사용자 결정: 통지 무리에 `max-height` 를 걸지 않는다,
 * Q-N1-3 (나) — 실패 통지가 접힌 칸에 가려지면 말없는 실패).
 *
 * 코드는 안 고친다 — 값으로 닫는다. 바닥에서는 셸이 창을 넘는다(하단 바 328 이 창 400 을 넘는다 — 판을 줄여도 못 푼다). 이 파일은 그 넘침의 **크기**가 아니라 지켜야 할
 * **성질**을 잠근다:
 *
 * 1. 통지는 접히지 않는다 — 통지 무리의 높이가 통지들의 합이고, 어느 통지도 제 상자 안에서 잘리지 않는다(`scrollHeight` = `clientHeight`).
 * 2. 판은 바닥 아래로 안 간다 — 판 높이 ≥ 120.
 * 3. 바닥에 안 닿는 칸(1440×400)은 셸이 안 넘치고 마지막 통지가 창 안이다. **바닥에 닿는 칸은 마지막 통지가 창 아래로 나가고 닿을 길이 없다**(셸 칸이 스크롤되지
 *    않는다 — `scrollIntoView` 가 안 움직인다). 그 값은 잠그지 않고 재 둔다 — 설계대로의 대가로 단언하면 말없는 실패를 «설계» 로 굳힌다(보고 · 장부 L-286).
 *
 * `n1-layout.test.ts` 의 «창 크기 표» 는 창 높이 500 이상 24 칸을 잰다 — 바닥에 닿는 판은 그 표 밖이다.
 */
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PALETTE_HEIGHT_FLOOR } from '../src/shell/sidebar-layout'
import { canvasFrame, editorStackPrerequisite, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

/** 설계의 바닥 값(`shell/sidebar-layout.ts` 의 `PALETTE_HEIGHT_FLOOR`). 상수만 바꾸면 그 상수끼리 견주는 단언은 못 죽으므로 값을 한 번 박아 둔다. */
const FLOOR = 120

const NOTICE = (i: number) => `통지 ${i + 1} — 남이 이 페이지를 바꿔 화면이 낡았습니다. 다시 불러오면 서버의 판으로 돌아갑니다.`
const TEXTS = [0, 1, 2].map((at) => ({ id: `n_t${at}000000000`, type: 'Text', props: { content: `글 ${at}` } }))

describe.skipIf(!전제.ok)('판 바닥 · 통지 여덟 — 실브라우저', () => {
  let stack: EditorStack
  let alice: Session

  beforeAll(async () => {
    if (!전제.ok) return
    stack = await startEditorStack(전제)
    alice = await stack.login(stack.users.alice)
  })

  afterAll(async () => {
    if (stack === undefined) return
    const { before, after } = await stack.close()
    expect(before.processes).toBeGreaterThan(0)
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  })

  const call = (m: string, p: string, b?: unknown) => stack.request(alice, m, p, b)

  async function fixture(slug: string): Promise<string> {
    const project = (await call('POST', '/projects', { name: 'N36', slug: `${slug}-${Date.now().toString(36)}` })).body
    const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '가' })).body
    const pageId = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '쪽' })).body.id
    const P = `/projects/${project.id}/pages/${pageId}`
    const seeded = await call('PATCH', `${P}/ops`, {
      baseSeq: 0,
      ops: TEXTS.map((value, at) => ({ op: 'add', path: `/root/children/${at}`, value })),
    })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
    return P
  }

  async function open(P: string, viewport: { width: number; height: number }) {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport })
    await page.goto(P)
    await canvasFrame(page).locator('[data-wb-id]').first().waitFor()
    await page.locator('[data-tree-row]').first().waitFor({ state: 'attached' })
    return { page, close: () => context.close() }
  }

  async function openPaletteAtMax(page: Page): Promise<void> {
    await page.getByRole('contentinfo', { name: '하단 바' }).getByRole('button', { name: '컴포넌트', exact: true }).click()
    await page.getByRole('region', { name: '컴포넌트 목록' }).waitFor()
    await page.getByRole('separator', { name: '컴포넌트 목록 높이' }).focus()
    await page.keyboard.press('End')
  }

  /** 하단 바의 통지 무리에 통지 꼴 `<p>` 를 `count` 개로 맞춘다 — 마지막 하나는 `role="alert"`(실패 통지의 역할)다. */
  const setNotices = (page: Page, count: number) =>
    page.evaluate(
      ([n, make]) => {
        const box = document.querySelector('.wb-shell-footer-notices')!
        for (const p of box.querySelectorAll('.wb-test-notice')) p.remove()
        for (let i = 0; i < (n as number); i += 1) {
          const p = document.createElement('p')
          p.className = 'wb-shell-remote-alert wb-test-notice'
          p.setAttribute('role', i === (n as number) - 1 ? 'alert' : 'status')
          p.textContent = (make as string[])[i]!
          box.appendChild(p)
        }
      },
      [count, [0, 1, 2, 3, 4, 5, 6, 7].map(NOTICE)] as const,
    )

  type Measured = Awaited<ReturnType<typeof measure>>

  /** 통지가 하단 바의 보이는 칸(그리고 창) 안에 서는가 — 바를 맨 위로 되돌린 뒤 통지마다 `scrollIntoView` 로 잰다. */
  async function measure(page: Page) {
    return await page.evaluate(() => {
      const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect()
      const shell = document.querySelector('.wb-shell') as HTMLElement
      const footer = document.querySelector('.wb-shell-footer') as HTMLElement
      const box = document.querySelector('.wb-shell-footer-notices') as HTMLElement
      const notices = [...box.querySelectorAll('.wb-test-notice')] as HTMLElement[]
      const visible = (el: HTMLElement): boolean => {
        const r = el.getBoundingClientRect()
        const f = footer.getBoundingClientRect()
        return r.top >= f.top - 0.5 && r.bottom <= f.bottom + 0.5 && r.bottom <= innerHeight + 0.5 && r.top >= -0.5
      }
      const last = notices[notices.length - 1]!
      footer.scrollTop = 0
      const lastAtTop = visible(last)
      // 통지마다 보이는 자리로 스크롤한 뒤 창 안인지 — 닿을 수 있는가.
      const reachable = notices.map((el) => {
        el.scrollIntoView({ block: 'nearest' })
        return visible(el)
      })
      footer.scrollTop = 0
      return {
        shellOverflow: shell.scrollHeight - shell.clientHeight,
        palette: Math.round(rect('.wb-shell-palette').height),
        canvas: Math.round(rect('.wb-shell-canvas').height),
        footer: Math.round(rect('.wb-shell-footer').height),
        footerBottom: Math.round(rect('.wb-shell-footer').bottom - innerHeight),
        footerScrollable: footer.scrollHeight - footer.clientHeight,
        footerOverflowY: getComputedStyle(footer).overflowY,
        boxHeight: Math.round(box.getBoundingClientRect().height),
        boxMaxHeight: getComputedStyle(box).maxHeight,
        boxClipped: box.scrollHeight - box.clientHeight,
        noticeHeights: notices.map((p) => Math.round(p.getBoundingClientRect().height)),
        noticesClipped: notices.map((p) => p.scrollHeight - p.clientHeight),
        lastAtTop,
        reachable,
      }
    })
  }

  /** 새 `role="alert"` 통지를 하나 더 세우고(바를 맨 위에 둔 채) 한 프레임 뒤 그 통지가 보이는 자리에 있는지. */
  async function addAlertAndSee(page: Page): Promise<boolean> {
    await page.evaluate(() => {
      const footer = document.querySelector('.wb-shell-footer') as HTMLElement
      footer.scrollTop = 0
      const p = document.createElement('p')
      p.className = 'wb-shell-remote-alert wb-test-notice wb-test-new'
      p.setAttribute('role', 'alert')
      p.textContent = '새 실패 통지 — 방금 저장하지 못했습니다.'
      document.querySelector('.wb-shell-footer-notices')!.appendChild(p)
    })
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    return await page.evaluate(() => {
      const footer = document.querySelector('.wb-shell-footer') as HTMLElement
      const r = document.querySelector('.wb-test-new')!.getBoundingClientRect()
      const f = footer.getBoundingClientRect()
      return r.top >= f.top - 0.5 && r.bottom <= f.bottom + 0.5 && r.bottom <= innerHeight + 0.5
    })
  }

  it('낮은 창 · 통지 여덟 — 바만 스크롤하고, 모든 통지에 닿으며, 새 실패 통지는 보이는 자리로 간다', async () => {
    const P = await fixture('n36-floor')
    const seen: Record<string, Measured & { newAlertVisible: boolean }> = {}
    for (const width of [1440, 800]) {
      for (const height of [400, 320]) {
        const { page, close } = await open(P, { width, height })
        try {
          await openPaletteAtMax(page)
          await setNotices(page, 8)
          await page.waitForTimeout(400)
          const v = await measure(page)
          seen[`${width}×${height}`] = { ...v, newAlertVisible: await addAlertAndSee(page) }
        } finally {
          await close()
        }
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[판 바닥 · 통지 여덟] ${JSON.stringify(seen)}`)
    const cells = Object.entries(seen)
    expect(cells).toHaveLength(4)
    expect(PALETTE_HEIGHT_FLOOR).toBe(FLOOR)

    // 판 카나리아 — 판이 실제로 바닥에 닿은 칸이 있고(바닥에 안 닿는 판만 재면 아래가 늘 참이다), 닿지 않은 칸(대조군)도 있다.
    const atFloor = cells.filter(([, v]) => v.palette === FLOOR).map(([label]) => label)
    expect(atFloor).toEqual(['1440×320', '800×400', '800×320'])

    for (const [label, v] of cells) {
      // ④ 통지는 접히지 않는다 — 무리에 `max-height` 가 없고, 무리 · 통지 어느 상자도 안의 글을 자르지 않으며, 통지마다 제 높이(한 줄 16px 이상)를 쓴다.
      expect({ label, maxHeight: v.boxMaxHeight, clipped: v.boxClipped, each: v.noticesClipped }).toEqual({
        label,
        maxHeight: 'none',
        clipped: 0,
        each: [0, 0, 0, 0, 0, 0, 0, 0],
      })
      expect(v.noticeHeights.every((height) => height >= 16)).toBe(true)
      expect(v.boxHeight).toBeGreaterThanOrEqual(v.noticeHeights.reduce((sum, height) => sum + height, 0))
      // ⑤ 판은 바닥 아래로 안 간다.
      expect({ label, palette: v.palette >= FLOOR }).toEqual({ label, palette: true })
      // ② 셸이 창을 안 넘고 하단 바가 창 안에서 끝난다.
      expect({ label, shellOverflow: v.shellOverflow, footerBottom: v.footerBottom }).toEqual({ label, shellOverflow: 0, footerBottom: 0 })
      // ③ 모든 통지(마지막 `role=alert` 포함)가 스크롤해서 닿는다 · 새 실패 통지는 보이는 자리로 간다.
      expect({ label, reachable: v.reachable }).toEqual({ label, reachable: [true, true, true, true, true, true, true, true] })
      expect({ label, newAlertVisible: v.newAlertVisible }).toEqual({ label, newAlertVisible: true })
    }

    // ① 대조군 — 바닥에 안 닿고 바가 창에 들어가는 칸은 스크롤이 없고 지금과 같은 자리다(1440×400: 판 181 · 하단 바 168 · 캔버스 48 · 마지막 통지가 맨 위에서 이미 보인다).
    expect(seen['1440×400']).toMatchObject({ palette: 181, footer: 168, canvas: 48, footerScrollable: 0, lastAtTop: true })
    // 바닥에 닿는 칸은 바가 스크롤한다(마지막 통지는 맨 위에서는 안 보이고 스크롤해야 닿는다).
    for (const label of atFloor)
      expect({ label, scrollable: seen[label]!.footerScrollable > 0, lastAtTop: seen[label]!.lastAtTop }).toEqual({
        label,
        scrollable: true,
        lastAtTop: false,
      })
  }, 180_000)
})
