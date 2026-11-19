/**
 * **페이지를 열면 폭 맞춤으로 연다 — 실브라우저 판**(`src/routes/editor.tsx` 의 `useAutoFitZoom` · 스토어의 `zoomFit`). jsdom 은 칸 폭이 0 이라 맞춤을
 * 못 잰다 — 켜고 끄는 규칙은 `test/store/editor-store.test.ts` «폭 맞춤은 …».
 *
 * | 케이스 | 재는 값 |
 * |---|---|
 * | 넓은 문서 · 좁은 문서 | 창 1440 에서 1280 문서를 열면 배율 < 1 · 문서 오른끝이 칸 안(±0.5) · 배율 글이 «폭 맞춤» 표지(`wb-shell-zoom-value-fitted` · 줌 묶음 설명). 프리셋 375 로 바꾸면 100% · 표지 없음 |
 * | 손대기 전에는 따른다 | 폭 맞춤인 채 창을 1100 으로 줄이면 배율이 따라 줄고 문서 오른끝이 칸 안 |
 * | 손댄 뒤에는 그대로 | «확대» 를 누르면 다음 눈금(63% → 75%) · 그 뒤 창을 1100 으로 줄여도 배율 그대로 · 표지 없음 · 다른 페이지를 열면 다시 폭 맞춤 |
 * | 바닥 아래의 «축소» | 창 760(접힌 머리) · 1280 문서는 25% 아래로 맞춰진다 · `…` › «축소» 는 배율을 안 바꾸고 폭 맞춤을 끈다 — `…` 배율 줄의 «폭 맞춤» 이 걷힌다 · 창 700 · 820 에도 그 배율 |
 */
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canvasFrame, editorStackPrerequisite, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

describe.skipIf(!전제.ok)('폭 맞춤으로 열기 — 실브라우저', () => {
  let stack: EditorStack
  let alice: Session

  beforeAll(async () => {
    if (!전제.ok) return
    stack = await startEditorStack(전제)
    alice = await stack.login(stack.users.alice)
  })

  afterAll(async () => {
    if (stack === undefined) return
    const { after } = await stack.close()
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  })

  const call = (m: string, p: string, b?: unknown) => stack.request(alice, m, p, b)

  /** 글 노드 하나가 든 페이지 둘(같은 메뉴) — 경로 둘을 낸다. */
  async function fixture(slug: string): Promise<[string, string]> {
    const project = (await call('POST', '/projects', { name: '폭 맞춤', slug: `${slug}-${Date.now().toString(36)}` })).body
    const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '가' })).body
    const paths: string[] = []
    for (const title of ['첫째', '둘째']) {
      const pageId = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title })).body.id
      const P = `/projects/${project.id}/pages/${pageId}`
      const seeded = await call('PATCH', `${P}/ops`, {
        baseSeq: 0,
        ops: [{ op: 'add', path: '/root/children/0', value: { id: 'n_text', type: 'Text', props: { content: title } } }],
      })
      if (seeded.status >= 300) throw new Error(`seed ${seeded.status}`)
      paths.push(P)
    }
    return [paths[0]!, paths[1]!]
  }

  /** 배율 · 문서 오른끝이 칸 안인가 · 표지. 프레임의 `transform` 이 다 실린 뒤(두 프레임) 잰다. */
  async function zoomState(page: Page): Promise<{ zoom: number; inside: boolean; fitted: boolean; described: string | null }> {
    return page.evaluate(
      () =>
        new Promise((done) =>
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              const canvas = document.querySelector('.wb-shell-canvas')!
              const frame = document.querySelector('.wb-shell-canvas-frame') as HTMLElement
              const style = getComputedStyle(canvas)
              const c = canvas.getBoundingClientRect()
              const usableRight = c.left + canvas.clientLeft + canvas.clientWidth - parseFloat(style.paddingRight)
              const match = /scale\(([\d.]+)\)/.exec(frame.style.transform)
              const value = document.querySelector('.wb-shell-zoom-value')
              done({
                zoom: match === null ? NaN : Number(match[1]),
                inside: frame.getBoundingClientRect().right <= usableRight + 0.5,
                fitted: value?.classList.contains('wb-shell-zoom-value-fitted') ?? false,
                described: document.querySelector('.wb-shell-zoom')?.getAttribute('aria-description') ?? null,
              })
            }),
          ),
        ),
    )
  }

  async function open(P: string, width: number): Promise<{ page: Page; close: () => Promise<void> }> {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width, height: 900 } })
    await page.goto(P)
    await canvasFrame(page).locator('[data-wb-id="n_text"]').waitFor()
    return { page, close: () => context.close() }
  }

  it('창 1440 에서 1280 문서는 칸 폭에 맞춰 열리고(문서 오른끝이 칸 안 · 표지) · 375 로 바꾸면 100% 다', async () => {
    const [P] = await fixture('wide')
    const { page, close } = await open(P, 1440)
    try {
      const wide = await zoomState(page)
      await page.getByRole('combobox', { name: '뷰포트 폭' }).selectOption('375')
      await page.waitForTimeout(300)
      const narrow = await zoomState(page)
      // eslint-disable-next-line no-console
      console.log(`[폭 맞춤] 1280 문서 · 창 1440 배율 ${wide.zoom} · 375 문서 ${narrow.zoom}`)
      expect({ wide: { ...wide, below: wide.zoom < 1 }, narrow }).toEqual({
        wide: { zoom: wide.zoom, inside: true, fitted: true, described: '폭 맞춤', below: true },
        narrow: { zoom: 1, inside: true, fitted: false, described: null },
      })
    } finally {
      await close()
    }
  })

  it('손대기 전에는 창을 줄이면 배율이 따라 준다', async () => {
    const [P] = await fixture('follow')
    const { page, close } = await open(P, 1440)
    try {
      const before = await zoomState(page)
      await page.setViewportSize({ width: 1100, height: 900 })
      await page.waitForTimeout(300)
      const after = await zoomState(page)
      expect({ shrank: after.zoom < before.zoom, inside: after.inside, fitted: after.fitted }).toEqual({
        shrank: true,
        inside: true,
        fitted: true,
      })
    } finally {
      await close()
    }
  })

  it('«확대» 를 누른 뒤에는 창을 줄여도 배율 그대로이고, 다른 페이지를 열면 다시 폭 맞춤이다', async () => {
    const [P, Q] = await fixture('manual')
    const { page, close } = await open(P, 1440)
    try {
      const fitted = await zoomState(page)
      await page.getByRole('group', { name: '줌' }).getByRole('button', { name: '확대', exact: true }).click()
      const picked = await zoomState(page)
      await page.setViewportSize({ width: 1100, height: 900 })
      await page.waitForTimeout(300)
      const resized = await zoomState(page)
      // 다른 페이지 — 메뉴 트리의 그 페이지 링크로 옮긴다.
      await page.getByRole('region', { name: '메뉴·페이지 트리' }).getByRole('link', { name: '둘째', exact: true }).click()
      await page.waitForURL((url) => url.pathname === Q)
      await canvasFrame(page).getByText('둘째').waitFor()
      await page.waitForTimeout(300)
      const reopened = await zoomState(page)
      expect({
        // 맞춘 배율(63%)에서 확대는 다음 눈금 75% 다(`useZoomCommands` — 눈금에 붙는다).
        fittedBelow: fitted.zoom < 0.75,
        picked: picked.zoom,
        pickedFitted: picked.fitted,
        resized: resized.zoom === picked.zoom,
        resizedFitted: resized.fitted,
        reopened: { fitted: reopened.fitted, inside: reopened.inside, below: reopened.zoom < 1 },
      }).toEqual({
        fittedBelow: true,
        picked: 0.75,
        pickedFitted: false,
        resized: true,
        resizedFitted: false,
        reopened: { fitted: true, inside: true, below: true },
      })
    } finally {
      await close()
    }
  })

  it('25% 아래로 맞춘 판에서 «축소» 를 누르면 그 배율로 남는다 — 창을 줄이고 늘려도 그대로다', async () => {
    const [P] = await fixture('floor')
    const { page, close } = await open(P, 760)
    try {
      // 창 760 은 머리가 접혀 줌 묶음이 `…` 에 든다(`shell/head-fold.ts`) — 같은 `zoomOut` 을 부르는 입구다.
      await page.getByRole('combobox', { name: '뷰포트 폭' }).selectOption('1280')
      await page.waitForTimeout(300)
      const fitted = await zoomState(page)
      // 접힌 머리에는 배율 글이 없다 — 표지는 `…` 의 배율 줄(«배율 15% · 폭 맞춤»)이 말한다.
      const more = page.getByRole('button', { name: '더 보기', exact: true })
      await more.click()
      const zoomRow = page.getByRole('menuitem', { name: /^배율 / })
      const rowBefore = await zoomRow.textContent()
      await page.getByRole('menuitem', { name: '축소', exact: true }).click()
      const pressed = await zoomState(page)
      await more.click()
      const rowAfter = await zoomRow.textContent()
      await page.keyboard.press('Escape')
      await page.setViewportSize({ width: 700, height: 900 })
      await page.waitForTimeout(300)
      const narrower = await zoomState(page)
      await page.setViewportSize({ width: 820, height: 900 })
      await page.waitForTimeout(300)
      const wider = await zoomState(page)
      // eslint-disable-next-line no-console
      console.log(
        `[폭 맞춤] 바닥 아래 축소 — 맞춘 ${fitted.zoom} · 누른 뒤 ${pressed.zoom} · 창 700 ${narrower.zoom} · 창 820 ${wider.zoom}`,
      )
      expect({
        floorBelow: fitted.zoom < 0.25,
        rowBefore: rowBefore?.includes('폭 맞춤'),
        pressed: pressed.zoom,
        rowAfter: rowAfter?.includes('폭 맞춤'),
        narrower: narrower.zoom,
        wider: wider.zoom,
      }).toEqual({
        floorBelow: true,
        rowBefore: true,
        pressed: fitted.zoom,
        rowAfter: false,
        narrower: fitted.zoom,
        wider: fitted.zoom,
      })
    } finally {
      await close()
    }
  })
})
