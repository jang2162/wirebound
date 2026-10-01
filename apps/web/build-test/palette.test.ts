/**
 * **하단 컴포넌트 판을 실브라우저로 잰다**(spec `docs/superpowers/specs/2026-10-01-component-drag-design.md` 「하단 컴포넌트 목록」) —
 * 판의 높이와 캔버스 몫(`src/shell/sidebar-layout.ts` 머리말 «하단 판의 높이»).
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 판을 열면 캔버스 칸이 준다 | 판 높이만큼 안 준다 · 최대에서 캔버스 칸이 `CANVAS_MIN_HEIGHT` 아래 · 셸이 세로로 넘친다 · 새로고침 뒤 열림 · 높이를 잃는다 |
 */
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { CANVAS_MIN_HEIGHT, PALETTE_HEIGHT_DEFAULT, PALETTE_HEIGHT_MIN } from '../src/shell/sidebar-layout'
import { canvasFrame, editorStackPrerequisite, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

/** 프로젝트 · 페이지 하나에 노드를 싣는다. */
async function fixture(stack: EditorStack, owner: Session, slug: string, nodes: unknown[]): Promise<{ P: string; projectId: string; pageId: string }> {
  const call = (m: string, p: string, b?: unknown) => stack.request(owner, m, p, b)
  const project = (await call('POST', '/projects', { name: 'D2 목록', slug: `${slug}-${Date.now().toString(36)}` })).body
  const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '메뉴' })).body
  const page = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '첫째' })).body
  const P = `/projects/${project.id}/pages/${page.id}`
  const ops = nodes.map((value, index) => ({ op: 'add', path: `/root/children/${index}`, value }))
  if (ops.length > 0) {
    const seeded = await call('PATCH', `${P}/ops`, { baseSeq: 0, ops })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
  }
  return { P, projectId: project.id, pageId: page.id }
}

const texts = (count: number) =>
  Array.from({ length: count }, (_, index) => ({ id: `n_t${index}`, type: 'Text', props: { content: `글 ${index} — 캔버스를 세로로 채운다` } }))

/** 셸 조각들의 높이(셸 · 머리 · 캔버스 칸 · 판 · 하단 바)와 셸의 세로 넘침. */
async function heights(page: Page) {
  return page.evaluate(() => {
    const h = (selector: string) => document.querySelector(selector)?.getBoundingClientRect().height ?? null
    const shell = document.querySelector('.wb-shell') as HTMLElement
    return {
      shell: h('.wb-shell'),
      head: h('.wb-shell-header'),
      canvas: h('.wb-shell-canvas'),
      palette: h('.wb-shell-palette'),
      footer: h('.wb-shell-footer'),
      overflow: shell.scrollHeight - shell.clientHeight,
    }
  })
}

describe.skipIf(!전제.ok)('하단 컴포넌트 판 — 실브라우저', () => {
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

  it.each([900, 700])('판을 열면 캔버스 칸이 판 높이만큼 준다 — 창 높이 %i', async (windowHeight) => {
    const { P } = await fixture(stack, alice, `pal-h${windowHeight}`, texts(3))
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: windowHeight } })
    try {
      await page.goto(P)
      await canvasFrame(page).locator('[data-wb-id="n_t0"]').waitFor()
      const closed = await heights(page)

      const toggle = page.getByRole('contentinfo', { name: '하단 바' }).getByRole('button', { name: '컴포넌트', exact: true })
      await toggle.click()
      await page.getByRole('region', { name: '컴포넌트 목록' }).waitFor()
      const opened = await heights(page)

      const handle = page.getByRole('separator', { name: '컴포넌트 목록 높이' })
      await handle.focus()
      await page.keyboard.press('End')
      const tallest = await heights(page)
      await page.keyboard.press('Home')
      const lowest = await heights(page)
      // 끌기 — 위로 40px 끌면 40px 커진다(`reversed`).
      await page.keyboard.press('Enter')
      const box = (await handle.boundingBox())!
      await page.mouse.move(box.x + 200, box.y + 3)
      await page.mouse.down()
      await page.mouse.move(box.x + 200, box.y + 3 - 40, { steps: 4 })
      await page.mouse.up()
      const dragged = await heights(page)

      await page.reload()
      await canvasFrame(page).locator('[data-wb-id="n_t0"]').waitFor()
      const reloaded = await heights(page)

      // eslint-disable-next-line no-console
      console.log(`[하단 판 높이] 창 ${windowHeight}: ${JSON.stringify({ closed, opened, tallest, lowest, dragged, reloaded })}`)

      expect(opened.palette).toBe(PALETTE_HEIGHT_DEFAULT)
      // 닫힌 판의 빈 줄도 칸 사이 여백을 쥐어 — 캔버스는 판 높이만큼만 준다.
      expect(closed.canvas! - opened.canvas!).toBe(PALETTE_HEIGHT_DEFAULT)
      expect(tallest.canvas!).toBeGreaterThanOrEqual(CANVAS_MIN_HEIGHT)
      expect(lowest.palette).toBe(PALETTE_HEIGHT_MIN)
      expect(dragged.palette).toBe(PALETTE_HEIGHT_DEFAULT + 40)
      expect(reloaded.palette).toBe(PALETTE_HEIGHT_DEFAULT + 40)
      for (const state of [closed, opened, tallest, lowest, dragged, reloaded]) expect(state.overflow).toBe(0)
    } finally {
      await context.close()
    }
  })
})
