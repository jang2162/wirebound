/**
 * **팝업 덮개 층을 실브라우저로 잰다** — `@wirebound/renderer` 의 `PopupLayer` 를 에디터 뷰 모드(`src/canvas/canvas-popups.tsx`)와 HTML 번들
 * (`packages/exporter/src/browser/mount.tsx`)이 그린다(정본 §8.3 «팝업 — 덮개 층»).
 *
 * | 판 | 재는 것 |
 * | --- | --- |
 * | 뷰 모드 — 열기 · ✖ | 상자 하나 · `aria-modal` · 포커스가 상자 안 ✖ · ✖ 가 보이는 캔버스 칸 안(iframe 은 기기 폭이라 칸보다 넓다) · ✖ 로 닫으면 연 단추로 포커스 |
 * | 뷰 모드 — Escape | 한글 조합 중(CDP `Input.imeSetComposition`)의 Escape 는 안 닫고, 조합이 끝난 뒤의 Escape 는 닫는다 |
 * | 뷰 모드 — «팝업 닫기» | 바닥 «취소» 가 닫고 포커스를 돌려준다 |
 * | 뷰 모드 — 겹 다섯 | 팝업 안에서 다시 열면 쌓이고 여섯째는 안 쌓인다 · 아래 겹은 `inert` · Escape 는 맨 위만 |
 * | 뷰 모드 — 덮개 | 덮개 밖(연 단추 자리)의 `elementFromPoint` 가 층이다 · 그 자리를 실클릭해도 뒤 화면에 안 닿고 닫지도 않는다 |
 * | 뷰 모드 — 셸 모달과 겹침 | 셸의 대화 상자가 Escape 를 받아 그것만 닫힌다 — 팝업은 남는다 |
 * | 뷰 모드 — Tab 순환 | Tab · Shift+Tab 아홉 번씩 — 포커스가 맨 위 상자 안을 돈다(✖ → 다시 열기 → 보통 열기 → 취소 → 저장 → ✖) |
 * | 뷰 모드 — 굴림 | 긴 화면 맨 위에서 열고 캔버스 칸을 끝까지 굴려도 ✖ 가 칸 안 · 칸 안에 선 뒤 화면 «아래 열기» 자리의 맨 위 요소가 층 |
 * | 뷰 모드 — 더블클릭 | 여는 단추 더블클릭은 한 겹 · 팝업 안에서 다른 대상을 더블클릭해도 한 겹 더 · 닫은 뒤 다시 열면 연다 |
 * | 번들 — 열기 · 목차 | 페이지를 안 옮기고 상자가 선다 · ✖ 로 닫으면 포커스 · 목차의 팝업 줄 «팝업» 표지 |
 * | 번들 — 좁은 창 · 넓은 창 | 390: 상자 폭 ≤ 창 − 48 · 가로 넘침 0 · ✖ 가 창 안 · 몸통 끝과 바닥 단추가 창 안. 1280: 가운데 · 덮개가 창 전체 |
 * | 번들 — 페이지로 연 팝업 | 390 · 720 · 1000 · 1280 화면 모드: 상자 폭 = min(크기, 창 − 48)(팝업 레이아웃의 틀 — 여백 24px) · 상자 밖 글 0 · 넘친 요소 0. 찍는 판(720 · `data-wb-capture` + `CAPTURE_CSS` — PPTX)은 큰 팝업이 960 그대로이고 문서 안이다 |
 * | 번들 — 팝업 안 폼 표 | 1280 · 1000 에서 보통 팝업 안 2열 폼 표는 한 줄에 쌍 하나 · 큰 팝업은 2열 그대로 |
 *
 * 번들은 저장소 빌드의 산출물(api 가 `packages/*\/dist` 를 읽는다)로 그린다 — `pnpm build` 가 먼저다.
 */
import { CAPTURE_CSS } from '@wirebound/theme-sdk/capture'
import type { Frame, Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canvasFrame, editorStackPrerequisite, poll, startEditorStack, zoomToFull, type EditorStack, type Session } from './editor-stack'
import { exportBundle, openBundlePage, type UnpackedBundle } from './layout-bundle'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

const LONG_BODY = Array.from({ length: 24 }, (_, i) => ({
  id: `n_line${String(i).padStart(2, '0')}`,
  type: 'Text',
  props: { content: `몸통 ${i + 1} — 상자보다 길어 몸통만 굴러야 한다` },
}))
const field = (id: string, label: string) => ({
  id,
  type: 'Field',
  props: { label },
  children: [{ id: `${id}_in`, type: 'Input', props: { value: `${label} 값` } }],
})
const FORM = (id: string) => ({
  id,
  type: 'FormTable',
  props: { columns: 2 },
  children: [field(`${id}_a`, '분반명'), field(`${id}_b`, '정원'), field(`${id}_c`, '시작일'), field(`${id}_d`, '종료일')],
})
const opener = (id: string, label: string, target: string) => ({
  id,
  type: 'Button',
  props: { label },
  interactions: [{ on: 'click', actions: [{ type: 'openModal', target }] }],
})

describe.skipIf(!전제.ok)('팝업 덮개 층 — 실브라우저', () => {
  let stack: EditorStack
  let alice: Session
  let P: string
  let LONG: string
  let projectId: string

  beforeAll(async () => {
    if (!전제.ok) return
    stack = await startEditorStack(전제)
    alice = await stack.login(stack.users.alice)
    ;({ P, LONG, projectId } = await fixture(stack, alice))
  }, 120_000)

  afterAll(async () => {
    if (stack === undefined) return
    const { after } = await stack.close()
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  })

  describe('에디터 뷰 모드', () => {
    it('열면 상자 하나 · aria-modal · 포커스가 ✖ — ✖ 로 닫으면 연 단추로 포커스가 돌아온다', async () => {
      await withView(stack, P, async (page, frame) => {
        await canvasFrame(page).locator('[data-wb-id="n_open"]').click()
        await frame.locator('[data-wb-popup-frame]').waitFor()
        expect(await layerState(frame)).toEqual({ levels: 1, modal: ['true'], focus: 'close', inert: 0 })
        // ✖ 가 호스트에서 보이는 캔버스 칸 안이다 — 판 카나리아로 iframe 이 칸보다 넓은 판인지 함께 적는다.
        const pane = (await page.locator('.wb-shell-canvas').boundingBox())!
        const iframe = (await page.locator('iframe.wb-shell-canvas-iframe').boundingBox())!
        const close = (await canvasFrame(page).locator('[data-wb-popup-frame] [data-wb-part="close"]').boundingBox())!
        expect(iframe.x + iframe.width).toBeGreaterThan(pane.x + pane.width)
        expect({
          x: close.x >= pane.x && close.x + close.width <= pane.x + pane.width,
          y: close.y >= pane.y && close.y + close.height <= pane.y + pane.height,
        }).toEqual({ x: true, y: true })
        await canvasFrame(page).locator('[data-wb-popup-frame] [data-wb-part="close"]').click()
        await frame.locator('[data-wb-popup-layer]').waitFor({ state: 'detached' })
        expect(await focusedNode(frame)).toBe('n_open')
      })
    })

    it('한글 조합 중의 Escape 는 안 닫고, 조합이 끝난 뒤의 Escape 는 닫는다', async () => {
      await withView(stack, P, async (page, frame) => {
        await canvasFrame(page).locator('[data-wb-id="n_open"]').click()
        await frame.locator('[data-wb-popup-frame]').waitFor()
        // 기본 뷰의 입력 칸은 읽기 전용이라 조합이 안 선다 — 상자 몸통에 쓸 수 있는 칸을 심고 거기서 조합을 세운다.
        await frame.evaluate(() => {
          const body = document.querySelector('[data-wb-popup-frame] [data-wb-part="body"]')!
          const input = document.createElement('input')
          input.setAttribute('data-probe', '')
          body.prepend(input)
          input.focus()
          const seen: string[] = []
          ;(window as unknown as { __seen: string[] }).__seen = seen
          input.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') seen.push(`Escape composing=${event.isComposing}`)
          })
        })
        const cdp = await page.context().newCDPSession(page)
        await cdp.send('Input.imeSetComposition', { text: '한', selectionStart: 1, selectionEnd: 1 })
        await page.keyboard.press('Escape')
        await page.waitForTimeout(300)
        const during = {
          levels: (await layerState(frame)).levels,
          seen: await frame.evaluate(() => (window as unknown as { __seen: string[] }).__seen.slice()),
        }
        await cdp.send('Input.insertText', { text: '한' })
        await page.keyboard.press('Escape')
        await frame.locator('[data-wb-popup-layer]').waitFor({ state: 'detached' })
        // 판 카나리아 — 조합 중의 Escape 가 실제로 `isComposing` 으로 났다.
        expect(during).toEqual({ levels: 1, seen: ['Escape composing=true'] })
        expect(await focusedNode(frame)).toBe('n_open')
      })
    })

    it('바닥 «취소»(«팝업 닫기») 가 닫고 연 단추로 포커스를 돌려준다', async () => {
      await withView(stack, P, async (page, frame) => {
        await canvasFrame(page).locator('[data-wb-id="n_open"]').click()
        await frame.locator('[data-wb-popup-frame]').waitFor()
        await canvasFrame(page).locator('[data-wb-popup-frame] [data-wb-zone="footer"] button', { hasText: '취소' }).click()
        await frame.locator('[data-wb-popup-layer]').waitFor({ state: 'detached' })
        expect(await focusedNode(frame)).toBe('n_open')
      })
    })

    it('겹은 다섯까지 — 여섯째는 안 쌓고 말한다 · 아래 겹은 inert · Escape 는 맨 위 하나만 닫고 그것을 연 단추로 돌아간다', async () => {
      await withView(stack, P, async (page, frame) => {
        await canvasFrame(page).locator('[data-wb-id="n_open"]').click()
        await frame.locator('[data-wb-popup-frame]').waitFor()
        for (let level = 2; level <= 6; level++) {
          await canvasFrame(page).locator('[data-wb-popup-level]:not([inert]) [data-wb-id="n_again"]').click()
          await poll(
            '겹',
            () => layerState(frame),
            (state) => state.levels === Math.min(level, 5),
          )
        }
        await page.locator('.wb-shell-canvas-runtime', { hasText: '팝업은 다섯 겹까지 엽니다' }).waitFor()
        expect(await layerState(frame)).toEqual({ levels: 5, modal: ['true', 'true', 'true', 'true', 'true'], focus: 'n_again', inert: 4 })
        await page.keyboard.press('Escape')
        await poll(
          '닫힘',
          () => layerState(frame),
          (state) => state.levels === 4,
        )
        expect(await layerState(frame)).toEqual({ levels: 4, modal: ['true', 'true', 'true', 'true'], focus: 'n_again', inert: 3 })
      })
    })

    it('덮개 밖 누름 — 연 단추 자리의 맨 위 요소는 층이고, 그 자리를 실클릭해도 뒤 단추가 안 눌리고 닫지도 않는다', async () => {
      await withView(stack, P, async (page, frame) => {
        await canvasFrame(page).locator('[data-wb-id="n_open"]').click()
        await frame.locator('[data-wb-popup-frame]').waitFor()
        const box = await frame.evaluate(() => {
          const button = document.querySelector('[data-wb-id="n_open"]')!.getBoundingClientRect()
          const x = button.left + button.width / 2
          const y = button.top + button.height / 2
          const hit = document.elementFromPoint(x, y)
          return {
            x,
            y,
            inLayer: hit?.closest('[data-wb-popup-layer]') !== null,
            inFrame: hit?.closest('[data-wb-popup-frame]') !== null,
          }
        })
        // 판 카나리아 — 연 단추 자리가 상자 밖(덮개)이다.
        expect({ inLayer: box.inLayer, inFrame: box.inFrame }).toEqual({ inLayer: true, inFrame: false })
        const iframe = (await page.locator('iframe.wb-shell-canvas-iframe').boundingBox())!
        await page.mouse.click(iframe.x + box.x, iframe.y + box.y)
        await page.waitForTimeout(300)
        expect(await layerState(frame)).toEqual({ levels: 1, modal: ['true'], focus: 'close', inert: 0 })
      })
    })

    it('셸의 대화 상자와 겹치면 Escape 는 셸 상자가 받는다 — 셸 상자만 닫히고 팝업은 남는다', async () => {
      await withView(stack, P, async (page, frame) => {
        await canvasFrame(page).locator('[data-wb-id="n_open"]').click()
        await frame.locator('[data-wb-popup-frame]').waitFor()
        await page.getByRole('button', { name: '더 보기', exact: true }).click()
        await page.getByRole('menuitem', { name: '스냅샷' }).click()
        await page.locator('dialog[open]').waitFor()
        await page.keyboard.press('Escape')
        await page.locator('dialog[open]').waitFor({ state: 'detached' })
        await page.waitForTimeout(300)
        expect((await layerState(frame)).levels).toBe(1)
      })
    })

    it('Tab · Shift+Tab 은 맨 위 상자 안을 돈다 — 아홉 번씩', async () => {
      await withView(stack, P, async (page, frame) => {
        await canvasFrame(page).locator('[data-wb-id="n_open"]').click()
        await frame.locator('[data-wb-popup-frame]').waitFor()
        const walk = async (key: string) => {
          const seen: string[] = []
          for (let i = 0; i < 9; i++) {
            await page.keyboard.press(key)
            seen.push(await focusedInPopup(frame))
          }
          return seen
        }
        const forward = await walk('Tab')
        const backward = await walk('Shift+Tab')
        expect({ forward, backward }).toEqual({
          forward: ['n_again', 'n_open_mid', '취소', '저장', 'close', 'n_again', 'n_open_mid', '취소', '저장'],
          backward: ['취소', 'n_open_mid', 'n_again', 'close', '저장', '취소', 'n_open_mid', 'n_again', 'close'],
        })
      })
    })

    it('열고 캔버스 칸을 굴려도 덮개가 보이는 칸을 따라온다 — ✖ 가 칸 안 · 칸 아래쪽 «아래 열기» 자리의 맨 위 요소가 층', async () => {
      await withView(
        stack,
        LONG,
        async (page, frame) => {
          await canvasFrame(page).locator('[data-wb-id="n_open"]').click()
          await frame.locator('[data-wb-popup-frame]').waitFor()
          const scrolled = await page.locator('.wb-shell-canvas').evaluate((pane) => {
            pane.scrollTop = pane.scrollHeight
            return pane.scrollTop
          })
          await settleFrames(page, frame)
          const pane = (await page.locator('.wb-shell-canvas').boundingBox())!
          const iframe = (await page.locator('iframe.wb-shell-canvas-iframe').boundingBox())!
          const close = (await canvasFrame(page).locator('[data-wb-popup-frame] [data-wb-part="close"]').boundingBox())!
          // 굴린 뒤 칸 아래쪽에 선 뒤 화면의 «아래 열기» 가운데 — 층이 칸을 따라왔으면 그 점의 맨 위 요소가 층이다.
          const bottom = await frame.evaluate(() => {
            const box = document.querySelector('[data-wb-id="n_open_bottom"]')!.getBoundingClientRect()
            const x = box.left + box.width / 2
            const y = box.top + box.height / 2
            return { x, y, layer: document.elementFromPoint(x, y)?.closest('[data-wb-popup-layer]') !== null }
          })
          // 판 카나리아 — 칸을 실제로 굴렸고, «아래 열기» 가 칸 안에 보인다(층이 안 덮으면 눌린다).
          expect({
            scrolled: scrolled > 1000,
            bottomInPane: iframe.y + bottom.y > pane.y && iframe.y + bottom.y < pane.y + pane.height,
          }).toEqual({ scrolled: true, bottomInPane: true })
          expect({
            closeInPane: close.y >= pane.y && close.y + close.height <= pane.y + pane.height,
            layer: bottom.layer,
          }).toEqual({ closeInPane: true, layer: true })
        },
        'n_open_bottom',
      )
    })

    it('여는 단추 더블클릭은 한 겹이다 — 팝업 안의 다른 대상도 한 겹 더 · 닫은 뒤 다시 열면 연다', async () => {
      await withView(stack, P, async (page, frame) => {
        const top = '[data-wb-popup-level]:not([inert])'
        await canvasFrame(page).locator('[data-wb-id="n_open"]').dblclick()
        await frame.locator('[data-wb-popup-frame]').waitFor()
        await page.waitForTimeout(1500)
        expect((await layerState(frame)).levels).toBe(1)
        // 팝업이 연 팝업(다른 대상 «보통») — 더블클릭이 한 겹만 더한다.
        await canvasFrame(page).locator(`${top} [data-wb-id="n_open_mid"]`).dblclick()
        await poll(
          '둘째 겹',
          () => layerState(frame),
          (state) => state.levels >= 2,
        )
        await page.waitForTimeout(1500)
        expect((await layerState(frame)).levels).toBe(2)
        // 닫은 뒤 같은 대상을 다시 열면 연다 — 버림은 열기를 기다리는 동안만이다.
        await canvasFrame(page).locator(`${top} [data-wb-part="close"]`).click()
        await poll(
          '닫힘',
          () => layerState(frame),
          (state) => state.levels === 1,
        )
        await canvasFrame(page).locator(`${top} [data-wb-id="n_open_mid"]`).click()
        await poll(
          '다시 엶',
          () => layerState(frame),
          (state) => state.levels >= 2,
        )
        await page.waitForTimeout(500)
        expect((await layerState(frame)).levels).toBe(2)
      })
    })
  })

  describe('HTML 번들', () => {
    let bundle: UnpackedBundle

    beforeAll(async () => {
      if (!전제.ok) return
      bundle = await exportBundle(stack, alice, projectId)
    }, 120_000)

    afterAll(() => bundle?.dispose())

    it('여는 페이지 — 페이지를 안 옮기고 상자가 선다 · ✖ 로 닫으면 연 단추로 포커스 · 목차의 팝업 줄에 «팝업» 표지', async () => {
      const { context, page } = await openBundlePage(stack, bundle.pages['관리자-목록']!, { viewport: { width: 1280, height: 800 } })
      try {
        const url = page.url()
        expect(
          await page.evaluate(() =>
            [...document.querySelectorAll('.wb-export-nav-item')].map((item) => [
              item.querySelector('.wb-export-nav-kind')?.textContent ?? '',
              item.textContent?.replace('팝업', '').replace(' — 팝업', '').trim(),
            ]),
          ),
        ).toEqual([
          ['', '관리자 목록'],
          ['팝업', '관리자 등록'],
          ['팝업', '관리자 보통'],
          ['팝업', '관리자 넓은'],
          ['', '관리자 긴 목록'],
        ])
        await page.locator('.wb-export-canvas [data-wb-id="n_open"]').click()
        await page.locator('[data-wb-popup-frame]').waitFor()
        expect(page.url()).toBe(url)
        expect(await layerState(page.mainFrame())).toEqual({ levels: 1, modal: ['true'], focus: 'close', inert: 0 })
        await page.locator('[data-wb-popup-frame] [data-wb-part="close"]').click()
        await page.locator('[data-wb-popup-layer]').waitFor({ state: 'detached' })
        expect(await focusedNode(page.mainFrame())).toBe('n_open')
      } finally {
        await context.close()
      }
    })

    for (const width of [390, 1280]) {
      it(`덮개 위 상자 — 창 ${width}`, async () => {
        const { context, page } = await openBundlePage(stack, bundle.pages['관리자-목록']!, {
          viewport: { width, height: 700 },
          screen: true,
        })
        try {
          await page.locator('[data-wb-id="n_open"]').click()
          await page.locator('[data-wb-popup-frame]').waitFor()
          const seen = await page.evaluate(() => {
            const box = document.querySelector('[data-wb-popup-frame] > [data-wb-component="Popup"]')!.getBoundingClientRect()
            const close = document.querySelector('[data-wb-popup-frame] [data-wb-part="close"]')!.getBoundingClientRect()
            const backdrop = document.querySelector('[data-wb-popup-backdrop]')!.getBoundingClientRect()
            const body = document.querySelector<HTMLElement>('[data-wb-popup-frame] [data-wb-part="body"]')!
            return {
              boxWidth: Math.round(box.width),
              boxLeft: Math.round(box.left),
              boxRight: Math.round(window.innerWidth - box.right),
              scrollWidth: document.documentElement.scrollWidth,
              closeInside: close.left >= 0 && close.right <= window.innerWidth && close.top >= 0 && close.bottom <= window.innerHeight,
              backdrop: [backdrop.left, backdrop.top, backdrop.width, backdrop.height].map(Math.round),
              bodyScrolls: body.scrollHeight > body.clientHeight,
            }
          })
          await page.evaluate(() =>
            document.querySelector('[data-wb-popup-frame] [data-wb-id="n_line23"]')!.scrollIntoView({ block: 'end' }),
          )
          const end = await page.evaluate(() => {
            const inside = (rect: DOMRect) =>
              rect.top >= 0 && rect.bottom <= window.innerHeight && rect.left >= 0 && rect.right <= window.innerWidth
            const last = document.querySelector('[data-wb-popup-frame] [data-wb-id="n_line23"]')!.getBoundingClientRect()
            const buttons = [...document.querySelectorAll('[data-wb-popup-frame] [data-wb-zone="footer"] button')].map((b) =>
              b.getBoundingClientRect(),
            )
            return {
              last: inside(last),
              footer: buttons.length > 0 && buttons.every(inside),
              title: inside(document.querySelector('[data-wb-popup-frame] [data-wb-part="title"]')!.getBoundingClientRect()),
            }
          })
          const viewport = page.viewportSize()!
          expect(seen.scrollWidth).toBe(width)
          expect(seen.closeInside).toBe(true)
          expect(seen.backdrop).toEqual([0, 0, width, viewport.height])
          // 높이가 넘쳐 몸통이 구른다(판 카나리아) — 끝까지 굴려도 제목 · 바닥 단추가 창 안이다.
          expect(seen.bodyScrolls).toBe(true)
          expect(end).toEqual({ last: true, footer: true, title: true })
          if (width === 390) expect(seen.boxWidth).toBeLessThanOrEqual(390 - 48)
          else {
            expect(seen.boxWidth).toBe(720)
            expect(Math.abs(seen.boxLeft - seen.boxRight)).toBeLessThanOrEqual(1)
          }
        } finally {
          await context.close()
        }
      })
    }

    for (const width of [390, 720, 1000, 1280]) {
      it(`페이지로 연 팝업 — 화면 모드 창 ${width}: 상자 폭 = min(크기, 창 − 48) · 상자 밖 글 · 넘친 요소 0`, async () => {
        for (const name of ['관리자-등록', '관리자-보통', '관리자-넓은']) {
          const { context, page } = await openBundlePage(stack, bundle.pages[name]!, { viewport: { width, height: 800 }, screen: true })
          try {
            const seen = await page.evaluate(() => {
              const root = document.querySelector('.wb-export-canvas [data-wb-component="Popup"]')!
              const right = root.getBoundingClientRect().right
              let past = 0
              const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
              for (let n = walker.nextNode(); n; n = walker.nextNode()) {
                if (!n.textContent?.trim()) continue
                const range = document.createRange()
                range.selectNodeContents(n)
                for (const r of range.getClientRects()) if (r.right > right + 0.5) past += 1
              }
              const over = [...root.querySelectorAll('*')].filter((el) => el.getBoundingClientRect().right > right + 0.5).length
              return { width: Math.round(root.getBoundingClientRect().width), past, over, texts: walker.root.textContent!.length }
            })
            expect(seen.texts, name).toBeGreaterThan(0)
            expect([name, seen.past, seen.over], name).toEqual([name, 0, 0])
            // 페이지로 연 판은 팝업 레이아웃의 틀(막 · 여백 24px — SDK 기본 CSS 의 `[data-wb-layout="popup"]`) 안이라 창 − 2 × 여백보다 넓지 않다(상자의
            // `max-width: 100%`) — 크기(넓은 960 · 보통 · 등록 720)와 창 − 48 가운데 작은 쪽이다.
            expect([name, seen.width]).toEqual([name, Math.min(name === '관리자-넓은' ? 960 : 720, width - 48)])
          } finally {
            await context.close()
          }
        }
      })
    }

    it('찍는 판(PPTX — 창 720 · data-wb-capture + CAPTURE_CSS) — 큰 팝업은 줄지 않고 960 그대로 문서 안에 선다', async () => {
      const { context, page } = await openBundlePage(stack, bundle.pages['관리자-넓은']!, {
        viewport: { width: 720, height: 800 },
        screen: true,
      })
      try {
        const seen = await page.evaluate((css) => {
          const style = document.createElement('style')
          style.textContent = css
          document.head.append(style)
          document.documentElement.setAttribute('data-wb-capture', '')
          const root = document.querySelector('.wb-export-canvas [data-wb-component="Popup"]')!.getBoundingClientRect()
          const over = [...document.querySelectorAll('.wb-export-canvas [data-wb-component="Popup"] *')].filter(
            (el) => el.getBoundingClientRect().right > root.right + 0.5,
          ).length
          return { width: Math.round(root.width), inDocument: root.right <= document.documentElement.scrollWidth + 0.5, over }
        }, CAPTURE_CSS)
        expect(seen).toEqual({ width: 960, inDocument: true, over: 0 })
      } finally {
        await context.close()
      }
    })

    it('페이지로 연 팝업 — 뷰어의 문서 칸이 390 이면 상자가 칸 폭으로 준다 · 상자 밖 글 · 넘친 요소 0', async () => {
      for (const name of ['관리자-등록', '관리자-보통']) {
        const { context, page } = await openBundlePage(stack, bundle.pages[name]!, {
          viewport: { width: 1280, height: 800 },
          docWidth: 390,
        })
        try {
          const seen = await page.evaluate(() => {
            const root = document.querySelector('.wb-export-canvas [data-wb-component="Popup"]')!
            const right = root.getBoundingClientRect().right
            let past = 0
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
            for (let n = walker.nextNode(); n; n = walker.nextNode()) {
              if (!n.textContent?.trim()) continue
              const range = document.createRange()
              range.selectNodeContents(n)
              for (const r of range.getClientRects()) if (r.right > right + 0.5) past += 1
            }
            const over = [...root.querySelectorAll('*')].filter((el) => el.getBoundingClientRect().right > right + 0.5).length
            return { width: Math.round(root.getBoundingClientRect().width), past, over }
          })
          expect([name, seen]).toEqual([name, { width: 390, past: 0, over: 0 }])
        } finally {
          await context.close()
        }
      }
    })

    for (const width of [1000, 1280]) {
      it(`팝업 안 폼 표 — 창 ${width}: 보통 팝업은 한 줄에 쌍 하나 · 큰 팝업은 2열 그대로`, async () => {
        const rows: Record<string, number> = {}
        for (const name of ['관리자-보통', '관리자-넓은']) {
          const { context, page } = await openBundlePage(stack, bundle.pages[name]!, { viewport: { width, height: 800 }, screen: true })
          try {
            rows[name] = await page.evaluate(() => {
              const labels = [
                ...document.querySelectorAll('[data-wb-component="FormTable"] [data-wb-component="Field"] > [data-wb-part="label"]'),
              ]
              if (labels.length !== 4) return -labels.length
              return new Set(labels.map((label) => Math.round(label.getBoundingClientRect().top))).size
            })
          } finally {
            await context.close()
          }
        }
        expect(rows).toEqual({ '관리자-보통': 4, '관리자-넓은': 2 })
      })
    }
  })
})

/** 층의 겹 수 · 겹마다 상자의 `aria-modal` · 포커스가 선 조각(이나 노드) · `inert` 겹 수. */
async function layerState(frame: Frame): Promise<{ levels: number; modal: (string | null)[]; focus: string | null; inert: number }> {
  return frame.evaluate(() => {
    const levels = [...document.querySelectorAll('[data-wb-popup-level]')]
    const active = document.activeElement
    return {
      levels: levels.length,
      modal: levels.map(
        (level) => level.querySelector('[data-wb-popup-frame] > [data-wb-component="Popup"]')?.getAttribute('aria-modal') ?? null,
      ),
      focus: active?.getAttribute('data-wb-part') ?? active?.closest('[data-wb-id]')?.getAttribute('data-wb-id') ?? null,
      inert: levels.filter((level) => level.hasAttribute('inert')).length,
    }
  })
}

/** 포커스가 선 요소의 노드 id. */
async function focusedNode(frame: Frame): Promise<string | null> {
  return frame.evaluate(() => document.activeElement?.closest('[data-wb-id]')?.getAttribute('data-wb-id') ?? null)
}

/** 맨 위 상자 안에 선 포커스의 이름(✖ 는 `close` · 바닥 단추는 글 · 그 밖은 노드 id). 상자 밖이면 `밖:` 을 붙인다. */
async function focusedInPopup(frame: Frame): Promise<string> {
  return frame.evaluate(() => {
    const active = document.activeElement
    const levels = document.querySelectorAll('[data-wb-popup-level]')
    const top = levels[levels.length - 1]
    const name =
      active?.getAttribute('data-wb-part') ??
      (active?.closest('[data-wb-zone="footer"]') !== null
        ? (active?.textContent?.trim() ?? '')
        : (active?.closest('[data-wb-id]')?.getAttribute('data-wb-id') ?? ''))
    return top !== undefined && active !== null && top.contains(active) ? name : `밖:${active?.tagName ?? 'null'}`
  })
}

/** 호스트 · 캔버스 문서 둘 다 두 프레임 — 굴림 리스너가 다시 잰 값이 그려진 뒤다. */
async function settleFrames(page: Page, frame: Frame): Promise<void> {
  const twoFrames = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  await page.evaluate(`(${twoFrames.toString()})()`)
  await frame.evaluate(`(${twoFrames.toString()})()`)
}

/** 페이지(`path`)를 열어 뷰 모드로 두고 캔버스 문서의 Frame 을 넘긴다. `ready` 는 그 페이지가 섰는지 기다릴 노드다. */
async function withView(
  stack: EditorStack,
  path: string,
  run: (page: Page, frame: Frame) => Promise<void>,
  ready = 'n_open',
): Promise<void> {
  const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
  try {
    await page.goto(path)
    await canvasFrame(page).locator(`[data-wb-id="${ready}"]`).waitFor()
    // 배율 100% 판 — 덮개 판들은 iframe(문서 1280)이 칸보다 넓은 판을 잰다. 폭 맞춤이면 문서가 칸 안에 들어 그 판이 안 선다.
    await zoomToFull(page)
    await page.getByRole('button', { name: '뷰 모드' }).click()
    const handle = await page.$('iframe.wb-shell-canvas-iframe')
    const frame = await handle?.contentFrame()
    if (frame === null || frame === undefined) throw new Error('캔버스 iframe 이 없다')
    await run(page, frame)
  } finally {
    await context.close()
  }
}

/**
 * 메뉴 «관리자» 아래 — «목록»(화면: 등록을 여는 단추) · «등록»(팝업 보통: 긴 몸통 · 자기를 다시 여는 단추 · «보통» 을 여는 단추 · 바닥
 * [취소][저장]) · «보통»(팝업 보통: 2열 폼 표) · «넓은»(팝업 크게: 2열 폼 표) · «긴 목록»(화면: 맨 위 «등록 열기» · 뒤 화면 80 줄 · 맨 아래 «아래 열기»).
 */
async function fixture(stack: EditorStack, owner: Session): Promise<{ P: string; LONG: string; projectId: string }> {
  const call = (method: string, path: string, body?: unknown) => stack.request(owner, method, path, body)
  const ok = (response: { status: number; body: any }, what: string) => {
    if (response.status >= 300) throw new Error(`픽스처 ${what} ${response.status} ${JSON.stringify(response.body)}`)
    return response.body
  }
  const project = ok(await call('POST', '/projects', { name: '팝업', slug: `popup-${Date.now().toString(36)}` }), '프로젝트')
  const menu = ok(await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '관리자' }), '메뉴')
  const pages: [string, 'page' | 'popup', string | null, unknown[]][] = [
    [
      '목록',
      'page',
      null,
      [opener('n_open', '등록 열기', 'page:관리자/등록'), { id: 'n_after', type: 'Text', props: { content: '뒤 화면' } }],
    ],
    [
      '등록',
      'popup',
      null,
      [opener('n_again', '다시 열기', 'page:관리자/등록'), opener('n_open_mid', '보통 열기', 'page:관리자/보통'), ...LONG_BODY],
    ],
    ['보통', 'popup', 'medium', [FORM('n_mid')]],
    ['넓은', 'popup', 'large', [FORM('n_wide')]],
    [
      '긴 목록',
      'page',
      null,
      [
        opener('n_open', '등록 열기', 'page:관리자/등록'),
        ...Array.from({ length: 80 }, (_, i) => ({
          id: `n_row${String(i).padStart(2, '0')}`,
          type: 'Text',
          props: { content: `뒤 화면 ${i + 1}` },
        })),
        opener('n_open_bottom', '아래 열기', 'page:관리자/등록'),
      ],
    ],
  ]
  let P = ''
  let LONG = ''
  for (const [title, kind, size, nodes] of pages) {
    const page = ok(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title, kind }), title)
    if (P === '') P = `/projects/${project.id}/pages/${page.id}`
    if (title === '긴 목록') LONG = `/projects/${project.id}/pages/${page.id}`
    const ops: unknown[] = nodes.map((value, i) => ({ op: 'add', path: `/root/children/${i}`, value }))
    if (size !== null) ops.push({ op: 'add', path: '/root/props/size', value: size })
    ok(await call('PATCH', `/projects/${project.id}/pages/${page.id}/ops`, { baseSeq: 0, ops }), `ops ${title}`)
  }
  return { P, LONG, projectId: project.id }
}
