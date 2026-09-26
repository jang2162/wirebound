/**
 * **캔버스 iframe 을 실브라우저로 잰다**(`src/canvas/canvas-iframe.tsx`). jsdom 은 레이아웃 · `@media` · 계산 스타일의 캐스케이드가
 * 없어(`test/canvas/canvas-iframe.test.tsx` 는 `scrollHeight` 를 흉내 낸다) 문서 분리의 결과를 여기서만 볼 수 있다.
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 문서가 iframe 안에 | 호스트 문서에 `data-wb-component` 가 있다 |
 * | 테마 CSS 가 에디터를 안 칠한다 | iframe 에 넣은 `button { … !important }` 가 셸의 모드 단추에 닿는다(카나리아: iframe 안의 버튼은 칠해진다) |
 * | `@media` 가 프리셋 폭으로 | iframe 폭이 아니라 창 폭(1440)으로 판정된다 |
 * | 클릭 선택 · 외곽선 자리 | 외곽선이 노드와 1px 넘게 어긋난다(줌 1 · 0.5) |
 * | 마커 자리 | 마커 중심이 노드의 왼쪽 위와 1px 넘게 어긋난다(줌 1 · 0.5) |
 * | 높이를 따라간다 | iframe 이 문서보다 작아 안쪽에 세로 스크롤이 선다 |
 */
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canvasFrame, editorStackPrerequisite, poll, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

const IFRAME = 'iframe.wb-shell-canvas-iframe'

describe.skipIf(!전제.ok)('캔버스 iframe — 실브라우저', () => {
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
    expect(before.listeningPorts.length).toBeGreaterThanOrEqual(2)
    expect(before.databases).toBe(1)
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  })

  it('캔버스 문서가 iframe 안에 그려진다 — 호스트 문서에는 노드가 없다', async () => {
    const P = await fixture(stack, alice, 'iframe-doc', 1)
    await withTab(stack, async (page) => {
      await page.goto(P)
      await canvasFrame(page).locator('[data-wb-id]').first().waitFor()
      expect({
        iframe안: await canvasFrame(page).locator('[data-wb-component]').count(),
        호스트: await page.locator('[data-wb-component]').count(),
      }).toEqual({ iframe안: 3, 호스트: 0 })
    })
  })

  it('테마 CSS 가 에디터의 버튼을 안 바꾼다', async () => {
    const P = await fixture(stack, alice, 'iframe-css', 1)
    await withTab(stack, async (page) => {
      await page.goto(P)
      await canvasFrame(page).locator('button[data-wb-id]').waitFor()
      const shellButton = async () =>
        page.locator('.wb-shell-mode').first().evaluate((el) => {
          const style = getComputedStyle(el)
          return `${style.backgroundColor} · ${style.borderTopLeftRadius}`
        })
      const before = await shellButton()
      await appendToThemeSheet(page, 'button{border-radius:0 !important;background:rgb(1,2,3) !important}')
      // 카나리아 — 넣은 규칙이 iframe 안의 버튼은 칠한다. 테마 CSS 의 `transition` 이 있어 바로 읽으면 전이의 시작값이 나온다.
      const read = async () => ({
        캔버스버튼: await canvasFrame(page).locator('button[data-wb-id]').evaluate((el) => getComputedStyle(el).backgroundColor),
        셸버튼: await shellButton(),
      })
      const settled = await settle(read, (value) => value.캔버스버튼 === 'rgb(1, 2, 3)' || value.셸버튼 !== before)
      expect(settled).toEqual({ 캔버스버튼: 'rgb(1, 2, 3)', 셸버튼: before })
    })
  })

  it('프리셋 375 에서 iframe 의 @media 가 걸린다 — 창 폭은 1440 그대로다', async () => {
    const P = await fixture(stack, alice, 'iframe-media', 1)
    await withTab(stack, async (page) => {
      await page.goto(P)
      await canvasFrame(page).locator('[data-wb-id]').first().waitFor()
      await appendToThemeSheet(page, '@media (max-width: 400px){ body{ --probe: narrow } }')
      const probe = () => canvasFrame(page).locator('body').evaluate((body) => getComputedStyle(body).getPropertyValue('--probe').trim())
      const viewport = page.getByLabel('뷰포트 폭')

      await viewport.selectOption('375')
      const narrow = { probe: await settle(probe, (value) => value === 'narrow'), 창: await page.evaluate(() => window.innerWidth) }
      await viewport.selectOption('1280')
      const wide = await settle(probe, (value) => value === '')
      expect({ narrow, wide }).toEqual({ narrow: { probe: 'narrow', 창: 1440 }, wide: '' })
    })
  })

  for (const zoom of [1, 0.5]) {
    it(`캔버스 클릭이 노드를 고르고 외곽선이 노드 상자와 겹친다 — 줌 ${zoom}`, async () => {
      const P = await fixture(stack, alice, `iframe-select-${zoom * 100}`, 3)
      await withTab(stack, async (page) => {
        await page.goto(P)
        await setZoom(page, zoom)
        const node = canvasFrame(page).locator('[data-wb-id="n_text0000002"]')
        await node.click()
        const outline = page.locator('.wb-shell-selection[data-wb-selected-id="n_text0000002"]')
        await outline.waitFor()
        await expectBoxesClose(await node.boundingBox(), await outline.boundingBox())
      })
    })

    it(`마커가 노드의 왼쪽 위에 선다 — 줌 ${zoom}`, async () => {
      const P = await fixture(stack, alice, `iframe-marker-${zoom * 100}`, 3)
      const commented = await stack.request(alice, 'POST', `${P}/comments`, { nodeId: 'n_text0000002', body: '여기' })
      expect(commented.status).toBeLessThan(300)
      await withTab(stack, async (page) => {
        await page.goto(P)
        await setZoom(page, zoom)
        const marker = page.locator('.wb-shell-marker[data-wb-marker-for="n_text0000002"]')
        await marker.waitFor()
        const node = await canvasFrame(page).locator('[data-wb-id="n_text0000002"]').boundingBox()
        const box = await marker.boundingBox()
        if (node === null || box === null) throw new Error('상자를 못 쟀다')
        const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
        expect(Math.abs(center.x - node.x)).toBeLessThanOrEqual(1)
        expect(Math.abs(center.y - node.y)).toBeLessThanOrEqual(1)
      })
    })
  }

  it('내용이 자라면 iframe 이 따라 자란다 — 안쪽 세로 스크롤이 없다', async () => {
    const P = await fixture(stack, alice, 'iframe-grow', 40)
    await withTab(stack, async (page) => {
      await page.goto(P)
      await canvasFrame(page).locator('[data-wb-id="n_text0000040"]').waitFor()
      const read = async () => ({
        iframe높이: await page.locator(IFRAME).evaluate((el) => (el as HTMLIFrameElement).clientHeight),
        문서높이: await canvasFrame(page).locator('html').evaluate((html) => html.scrollHeight),
        창높이: await canvasFrame(page).locator('html').evaluate(() => window.innerHeight),
      })
      const settled = await poll('iframe 이 문서 높이를 따라간다', read, (value) => value.iframe높이 === value.문서높이)
      expect(settled.문서높이).toBeGreaterThan(320)
      // 안쪽 스크롤이 없다 — 문서가 iframe 창 안에 다 든다.
      expect(settled.창높이).toBe(settled.문서높이)
    })
  })
})

async function withTab(stack: EditorStack, run: (page: Page) => Promise<void>): Promise<void> {
  const { context, page } = await stack.openTab(stack.users.alice)
  try {
    await run(page)
  } finally {
    await context.close()
  }
}

/**
 * 테마 시트(`style[data-wb-style="theme"]`)에 규칙을 덧붙인다 — **캔버스가 테마 CSS 를 실은 바로 그 자리**다. 시트가 어느 문서에
 * 있든(호스트 · iframe) 찾아 붙이므로, 캔버스가 테마를 호스트 문서에 싣는 판이면 이 규칙도 호스트에 닿아 케이스가 죽는다.
 */
async function appendToThemeSheet(page: Page, css: string): Promise<void> {
  const found = await page.evaluate((text) => {
    const iframe = document.querySelector<HTMLIFrameElement>('iframe.wb-shell-canvas-iframe')
    const docs = [document, iframe?.contentDocument].filter((doc): doc is Document => doc !== null && doc !== undefined)
    for (const doc of docs) {
      const sheet = doc.querySelector('style[data-wb-style="theme"]')
      if (sheet !== null) {
        sheet.textContent = `${sheet.textContent ?? ''}\n${text}`
        return true
      }
    }
    return false
  }, css)
  if (!found) throw new Error('테마 시트를 못 찾았다')
}

/** 조건이 설 때까지(최대 3s) 읽고 **마지막 값을 돌려준다** — 서지 않아도 던지지 않아, 케이스가 타임아웃이 아니라 값으로 죽는다. */
async function settle<T>(read: () => Promise<T>, done: (value: T) => boolean, timeoutMs = 3_000): Promise<T> {
  const deadline = Date.now() + timeoutMs
  let value = await read()
  while (!done(value) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50))
    value = await read()
  }
  return value
}

/** 줌 단추로 배율을 맞춘다(한 칸 25%). 문서가 그려진 뒤에 누른다. */
async function setZoom(page: Page, zoom: number): Promise<void> {
  await canvasFrame(page).locator('[data-wb-id]').first().waitFor()
  const value = page.locator('.wb-shell-zoom-value')
  const want = `${Math.round(zoom * 100)}%`
  for (let i = 0; i < 8 && (await value.textContent()) !== want; i += 1) {
    await page.getByRole('button', { name: '축소' }).click()
  }
  expect(await value.textContent()).toBe(want)
}

async function expectBoxesClose(
  a: { x: number; y: number; width: number; height: number } | null,
  b: { x: number; y: number; width: number; height: number } | null,
): Promise<void> {
  if (a === null || b === null) throw new Error('상자를 못 쟀다')
  const diff = { x: b.x - a.x, y: b.y - a.y, width: b.width - a.width, height: b.height - a.height }
  for (const value of Object.values(diff)) expect(Math.abs(value), JSON.stringify({ a, b })).toBeLessThanOrEqual(1)
}

/** `Page > [Button, Text × count]` 페이지 하나. Text 의 id 는 `n_text00000NN`(1 부터). */
async function fixture(stack: EditorStack, owner: Session, slug: string, count: number): Promise<string> {
  const call = (m: string, p: string, b?: unknown) => stack.request(owner, m, p, b)
  const project = (await call('POST', '/projects', { name: 'A1a', slug: `${slug}-${Date.now().toString(36)}` })).body
  const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '메뉴' })).body
  const page = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '첫째' })).body
  const P = `/projects/${project.id}/pages/${page.id}`
  const texts = Array.from({ length: count }, (_, index) => ({
    op: 'add',
    path: `/root/children/${index + 1}`,
    value: { id: `n_text${String(index + 1).padStart(7, '0')}`, type: 'Text', props: { content: `글 ${index + 1}` } },
  }))
  const ops = [{ op: 'add', path: '/root/children/0', value: { id: 'n_button00001', type: 'Button', props: { label: '버튼' } } }, ...texts]
  const seeded = await call('PATCH', `${P}/ops`, { baseSeq: 0, ops })
  if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
  return P
}
