/**
 * **우측 패널 — 실브라우저**(`src/routes/editor.tsx` 의 `RightPanel` · `src/shell/sidebar-layout.ts` 의 `panelWidthDefault` · `shell.css` 의
 * `.wb-shell-tabs`). 픽스처는 `right-panel-fixture.ts`(공통코드에 묶인 Select 가 든 관리자 목록 화면).
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 기본 폭 | 창 1280 · 1440 · 1920 에서 우측 패널이 창의 24% 를 300 ~ 380 으로 자른 폭이 아니다 · 열린 배율이 그 칸에 맞춰지지 않는다 |
 * | 탭 줄이 창 안 | 긴 Select 를 고르고 본문을 끝까지 굴리면 탭 줄이 패널 위 끝 밖으로 나간다 · 탭 줄 밑을 지나는 본문이 탭을 덮는다 |
 *
 * `RP_SHOTS=<디렉터리>` 를 주면 판마다 화면 그림을 그 디렉터리에 남긴다(보고의 후 캡처).
 */
import { join } from 'node:path'
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { panelWidthDefault } from '../src/shell/sidebar-layout'
import { canvasFrame, editorStackPrerequisite, poll, startEditorStack, type EditorStack, type Session } from './editor-stack'
import { seedRightPanel, type RightPanelFixture } from './right-panel-fixture'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

const shotPath = (name: string): string | undefined => (process.env.RP_SHOTS ? join(process.env.RP_SHOTS, name) : undefined)

describe.skipIf(!전제.ok)('우측 패널 — 실브라우저', () => {
  let stack: EditorStack
  let alice: Session
  let fx: RightPanelFixture

  beforeAll(async () => {
    if (!전제.ok) return
    stack = await startEditorStack(전제)
    alice = await stack.login(stack.users.alice)
    fx = await seedRightPanel(stack, alice, 'rp')
  })

  afterAll(async () => {
    if (stack === undefined) return
    const { before, after } = await stack.close()
    expect(before.processes).toBeGreaterThan(0)
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  })

  async function open(width: number, height = 900): Promise<{ page: Page; close: () => Promise<void> }> {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width, height } })
    await page.goto(fx.path)
    await canvasFrame(page).locator('[data-wb-id="n_sel"]').waitFor({ state: 'attached' })
    return { page, close: () => context.close() }
  }

  /** 구조 트리 줄을 눌러 고른다 — 트리 줄은 탭을 안 옮겨 처음 탭(«컴포넌트»)이 그대로다. */
  async function pickInTree(page: Page, id: string): Promise<void> {
    await page.locator(`.wb-shell-region[aria-label="구조 트리"] [data-tree-row][data-tree-id="${id}"] .wb-shell-structure-node`).click()
    await poll(
      `${id} 를 고른다`,
      () =>
        page.evaluate(
          () =>
            document
              .querySelector('.wb-shell-structure-node[aria-current="true"]')
              ?.closest('[data-tree-row]')
              ?.getAttribute('data-tree-id') ?? null,
        ),
      (v) => v === id,
    )
  }

  it.each([1280, 1440, 1920])('창 %i — 우측 패널은 창에 따른 기본 폭이고 열린 배율이 남은 칸에 맞는다', async (width) => {
    const { page, close } = await open(width)
    try {
      // 폭 맞춤은 칸 폭을 본 뒤에 선다 — 배율 글이 «폭 맞춤» 표지를 달 때까지 기다린다.
      await poll(
        '폭 맞춤',
        () => page.evaluate(() => document.querySelector('.wb-shell-zoom-value-fitted') !== null),
        (v) => v,
      )
      const seen = await page.evaluate(() => {
        const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect()
        return {
          panel: Math.round(box('.wb-shell-panel').width),
          canvas: Math.round(box('.wb-shell-canvas').width),
          // 문서(iframe)의 오른끝이 캔버스 칸 안인가 — 폭 맞춤의 성질(값은 `ui-zoom-fit.test.ts` 가 잰다).
          inside: box('iframe.wb-shell-canvas-iframe').right <= box('.wb-shell-canvas').right,
          zoom: document.querySelector('.wb-shell-zoom-value')?.textContent ?? '',
        }
      })
      // eslint-disable-next-line no-console
      console.log(`[우측 기본 폭 ${width}] ${JSON.stringify(seen)}`)
      expect(seen.panel).toBe(panelWidthDefault(width))
      expect({ 1280: 307, 1440: 346, 1920: 380 }[width]).toBe(seen.panel)
      expect(seen.inside).toBe(true)
    } finally {
      await close()
    }
  })

  it('긴 Select 를 고르고 본문을 끝까지 굴려도 탭 줄이 패널 위 끝에 남는다', async () => {
    const { page, close } = await open(1440)
    try {
      await pickInTree(page, 'n_sel')
      const shot = shotPath('component-scrolled.png')
      const seen = await page.evaluate(async () => {
        const panel = document.querySelector('.wb-shell-panel') as HTMLElement
        const list = document.querySelector('[role="tablist"][aria-label="우측 패널 탭"]') as HTMLElement
        const room = panel.scrollHeight - panel.clientHeight
        panel.scrollTop = panel.scrollHeight
        await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
        const p = panel.getBoundingClientRect()
        const l = list.getBoundingClientRect()
        // 탭 줄 가운데 점의 맨 위 요소가 탭(또는 그 안)인가 — 밑을 지나는 본문이 덮지 않는다.
        const tabs = [...list.querySelectorAll('[role="tab"]')].map((tab) => {
          const r = tab.getBoundingClientRect()
          const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
          return top !== null && tab.contains(top)
        })
        return {
          room,
          scrolled: panel.scrollTop,
          panelTop: Math.round(p.top),
          listTop: Math.round(l.top),
          listBottom: Math.round(l.bottom),
          tabs,
        }
      })
      if (shot !== undefined) await page.screenshot({ path: shot })
      // eslint-disable-next-line no-console
      console.log(`[탭 줄 고정] ${JSON.stringify(seen)}`)
      // 카나리아 — 굴러갈 본문이 있고 실제로 굴렀다.
      expect(seen.room).toBeGreaterThan(100)
      expect(seen.scrolled).toBeGreaterThan(100)
      expect({ 위: seen.listTop - seen.panelTop, 밑: seen.listBottom > seen.panelTop, 탭: seen.tabs }).toEqual({
        위: 0,
        밑: true,
        탭: [true, true, true, true],
      })
    } finally {
      await close()
    }
  })
})
