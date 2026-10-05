/**
 * **캔버스 도구(뷰포트 폭 · 줌)가 에디터 머리에 서고 하단 바에는 «컴포넌트»만 남는가를 실브라우저로 잰다**(`src/routes/editor.tsx` 의
 * `wb-shell-head-tools` · `src/shell/head-fold.ts`). jsdom 은 배치 · 미디어 쿼리가 없어 «머리가 넘치는가»를 못 잰다.
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 자리 · 차례 | 뷰포트 폭 · 줌이 머리에 없거나 «편집 / 뷰» 앞이거나 `…` 뒤다 · 하단 바에 «컴포넌트» 말고 단추 · 고르개가 있다 · 뷰 모드에서 폭 · 줌이 사라진다 |
 * | 창 1440 · 900 · 700 | 머리가 두 줄이 되거나 창 밖으로 넘친다 · 머리의 단추 · 고르개가 덮인다 · 줌을 접은 판에서 `…` 의 줌 항목이 배율을 안 바꾼다 |
 * | 하단 바 높이 | «컴포넌트»만 남은 하단 바가 도구가 있던 때의 높이와 다르다(편집 · 뷰 모드) |
 */
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canvasFrame, editorStackPrerequisite, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

/** 머리 · 하단 바의 모양 — 높이 · 넘침 · 덮인 컨트롤 · 컨트롤 이름(고르개는 감싼 `<label>` 글의 첫 낱말).*/
interface Shape {
  /** 머리 높이(px) · 한 줄 높이와 같은가는 케이스가 견준다. */
  head: number
  /** 머리의 가로 넘침(px) — 머리 상자 오른끝 밖으로 나간 자식의 끝. */
  overflow: number
  /** 머리의 단추 · 고르개 가운데 가운데 점이 그것이 아닌 것의 이름. */
  covered: string[]
  /** 하단 바 높이(px). */
  footer: number
  /** 하단 바의 단추 · 고르개 이름. */
  footerControls: string[]
  /** 머리의 컨트롤 이름 — DOM 차례. */
  headControls: string[]
}

async function shape(page: Page): Promise<Shape> {
  return page.evaluate(() => {
    const head = document.querySelector('.wb-shell-header')!
    const footer = document.querySelector('.wb-shell-footer')!
    const name = (element: Element): string =>
      element.getAttribute('aria-label') ?? (element.closest('label')?.textContent?.trim().split(/\s/)[0] ?? element.textContent?.trim() ?? '')
    const controls = (box: Element): Element[] => [...box.querySelectorAll('button, select, a')].filter((element) => (element as HTMLElement).offsetParent !== null)
    const box = head.getBoundingClientRect()
    let right = box.right
    for (const element of controls(head)) right = Math.max(right, element.getBoundingClientRect().right)
    const covered = controls(head)
      .filter((element) => {
        const r = element.getBoundingClientRect()
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
        return hit === null || !element.contains(hit)
      })
      .map(name)
    return {
      head: Math.round(box.height),
      overflow: Math.round(Math.max(right, head.scrollWidth + box.left) - Math.min(box.right, document.documentElement.clientWidth)),
      covered,
      footer: Math.round(footer.getBoundingClientRect().height),
      footerControls: controls(footer).map(name),
      headControls: controls(head).map(name),
    }
  })
}

describe.skipIf(!전제.ok)('머리의 캔버스 도구 — 실브라우저', () => {
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

  async function fixture(slug: string): Promise<string> {
    const call = (m: string, p: string, b?: unknown) => stack.request(alice, m, p, b)
    const project = (await call('POST', '/projects', { name: '관리자 콘솔 설계서', slug: `${slug}-${Date.now().toString(36)}` })).body
    const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '메뉴' })).body.id
    const pageId = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu, title: '첫째' })).body.id
    const P = `/projects/${project.id}/pages/${pageId}`
    await call('PATCH', `${P}/ops`, { baseSeq: 0, ops: [{ op: 'add', path: '/root/children/0', value: { id: 'n_text0000001', type: 'Text', props: { content: '글' } } }] })
    return P
  }

  async function open(P: string, viewport: { width: number; height: number }): Promise<{ page: Page; close: () => Promise<void> }> {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport })
    await page.goto(P)
    await canvasFrame(page).locator('[data-wb-id]').first().waitFor()
    return { page, close: () => context.close() }
  }

  /** 창 셋 × 두 모드 — 머리 한 줄(48) · 넘침 0 · 덮인 컨트롤 없음, 차례, 하단 바는 «컴포넌트»뿐이고 높이 40. 접힌 창(700)에는 줌이 머리에 없다. */
  it('창 1440 · 900 · 700 × 편집 · 뷰 — 머리는 한 줄이고 넘치지 않으며, 캔버스 도구는 «편집 / 뷰» 뒤 · `…` 앞에 선다', async () => {
    const P = await fixture('head-shape')
    const seen: Record<string, Shape> = {}
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 900, height: 700 },
      { width: 700, height: 700 },
    ]) {
      const { page, close } = await open(P, viewport)
      try {
        for (const mode of ['편집 모드', '뷰 모드'] as const) {
          await page.getByRole('button', { name: mode, exact: true }).click()
          await page.waitForTimeout(100)
          seen[`${viewport.width} ${mode}`] = await shape(page)
        }
      } finally {
        await close()
      }
    }
    // eslint-disable-next-line no-console
    console.log('[머리 · 하단 바 모양]', JSON.stringify(seen))

    const zoom = ['축소', '확대', '화면 맞춤']
    const head = (mode: '편집 모드' | '뷰 모드', folded: boolean): string[] => [
      '좌측 패널 접기',
      '프로젝트 목록',
      ...(mode === '편집 모드' ? ['되돌리기', '다시 실행', '배치 선'] : []),
      '편집 모드',
      '뷰 모드',
      '뷰포트',
      ...(folded ? [] : zoom),
      '우측 패널 접기',
      '더 보기',
    ]
    const expected: Record<string, Shape> = {}
    for (const width of [1440, 900, 700]) {
      for (const mode of ['편집 모드', '뷰 모드'] as const) {
        expected[`${width} ${mode}`] = {
          head: 48,
          overflow: 0,
          covered: [],
          footer: 40,
          footerControls: mode === '편집 모드' ? ['컴포넌트'] : [],
          headControls: head(mode, width === 700),
        }
      }
    }
    expect(seen).toEqual(expected)
  })

  /** 고르개의 이름은 «뷰포트 폭» 그대로다 — 글을 감춘 창(900)에서도 이름으로 찾아 고른다. 글이 보이는가는 창마다 다르다. */
  it('«뷰포트 폭» 글은 900 에서 눈에서만 감추고 이름은 그대로다', async () => {
    const P = await fixture('head-label')
    const seen: Record<number, { visible: number; frame: string }> = {}
    for (const width of [1440, 900]) {
      const { page, close } = await open(P, { width, height: 700 })
      try {
        await page.getByLabel('뷰포트 폭').selectOption('375')
        const visible = await page.locator('.wb-shell-header label').evaluate((label) => {
          const text = [...label.querySelectorAll('span')].find((span) => span.textContent === '뷰포트 폭')!
          return Math.round(text.getBoundingClientRect().width)
        })
        const frame = await page.locator('.wb-shell-canvas-frame').evaluate((el) => (el as HTMLElement).style.width)
        seen[width] = { visible: visible > 1 ? 1 : 0, frame }
      } finally {
        await close()
      }
    }
    expect(seen).toEqual({ 1440: { visible: 1, frame: '375px' }, 900: { visible: 0, frame: '375px' } })
  })

  /** 접힌 창(700) — `…` 의 첫 항목 셋이 줌이고, 누르면 배율이 바뀐다(배율은 캔버스 프레임의 `scale`). 같은 자리를 다시 누를 때는 더블클릭 간격을 넘긴다. */
  it('창 700 — 줌은 셸 `…` 의 첫 항목 셋이고 누르면 배율이 바뀐다', async () => {
    const P = await fixture('head-folded')
    const { page, close } = await open(P, { width: 700, height: 700 })
    try {
      const scale = () => page.locator('.wb-shell-canvas-frame').evaluate((el) => (el as HTMLElement).style.transform)
      const menu = page.locator('.wb-shell-header').getByRole('button', { name: '더 보기', exact: true })
      await menu.click()
      const items = (await page.getByRole('menuitem').allTextContents()).slice(0, 3)
      const before = await scale()
      await page.getByRole('menuitem', { name: '확대', exact: true }).click()
      const afterIn = await scale()
      await page.waitForTimeout(600)
      await menu.click()
      await page.getByRole('menuitem', { name: '축소', exact: true }).click()
      const afterOut = await scale()
      await page.waitForTimeout(600)
      await menu.click()
      await page.getByRole('menuitem', { name: '화면 맞춤', exact: true }).click()
      const afterFit = await scale()
      expect({ items, before, afterIn, afterOut, fitChanged: afterFit !== afterOut }).toEqual({
        items: ['축소', '확대', '화면 맞춤'],
        before: 'scale(1)',
        afterIn: 'scale(1.25)',
        afterOut: 'scale(1)',
        fitChanged: true,
      })
    } finally {
      await close()
    }
  })

  /**
   * **문턱을 재는 자** — 머리 한 줄에 드는 최소 창 폭을 이분 탐색해 로그로 낸다(단언은 수가 섰는지만 — 글꼴이 기계마다 달라 수는 로그의
   * 값이다). 지금 문턱의 단계로 재므로 단계마다 재려면 `src/shell/head-fold.ts` 의 두 상수를 바꿔 돌린다(그 파일 «다시 재는 길»). 창을 바꾼
   * 뒤 두 프레임을 기다린다 — 미디어 쿼리의 바뀜은 다음 그리기 때 온다.
   */
  it('머리 한 줄에 드는 최소 창 폭을 로그로 낸다(편집 · 뷰)', async () => {
    const P = await fixture('head-least')
    const { page, close } = await open(P, { width: 2400, height: 900 })
    try {
      const height = () => page.locator('.wb-shell-header').evaluate((el) => el.getBoundingClientRect().height)
      const least: Record<string, number> = {}
      for (const mode of ['편집 모드', '뷰 모드'] as const) {
        await page.setViewportSize({ width: 2400, height: 900 })
        await page.getByRole('button', { name: mode, exact: true }).click()
        const one = await height()
        let narrow = 300
        let wide = 2400
        while (wide - narrow > 1) {
          const mid = Math.floor((narrow + wide) / 2)
          await page.setViewportSize({ width: mid, height: 900 })
          await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
          if ((await height()) <= one) wide = mid
          else narrow = mid
        }
        least[mode] = wide
      }
      // eslint-disable-next-line no-console
      console.log(`[머리 한 줄 최소 창 폭] ${JSON.stringify(least)}`)
      expect(Object.keys(least).length).toBe(2)
    } finally {
      await close()
    }
  })
})
