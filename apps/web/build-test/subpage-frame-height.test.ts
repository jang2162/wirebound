/**
 * **기본테마 서브페이지 틀 위에서도 iframe 높이가 끌기 · 남의 지움을 따라간다** — 실브라우저. 기본테마의 서브페이지 틀은 `min-height: 100vh` 다
 * (`system-themes/admin/src/theme.css` «서브페이지 틀»). 캔버스 iframe 안에서 `100vh` 는 iframe 높이라, 틀이 문서 뿌리와 함께 iframe 높이에
 * 묶인다 — 끌기가 키운 문서가 줄거나 남이 노드를 지워도 `body` 와 그 자식(틀)의 상자가 안 바뀌어 높이 관찰이 안 깨면 iframe 이 큰 채 남는다
 * (`apps/web/src/canvas/canvas-iframe.tsx` 의 높이 관찰).
 *
 * | 판 | 잡는 결함 |
 * |---|---|
 * | 서브페이지(기본테마) · 빈 레이아웃(대조) | 끌다 취소한 뒤 iframe 이 끌기 전 높이로 안 돌아온다 · 남이 노드를 지워도 안 준다 |
 *
 * 카나리아 — 서브페이지 판은 캔버스에 틀(`[data-wb-layout="subpage"]`)과 영역(`[data-wb-layout-region]`)이 섰고, 문서가 창보다 길며, 끄는 동안 iframe 이
 * 자랐다.
 */
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  canvasFrame,
  dragLayoutSettled,
  editorStackPrerequisite,
  poll,
  startEditorStack,
  type EditorStack,
  type Session,
} from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

const lines = (prefix: string) =>
  Array.from({ length: 12 }, (_, i) => ({ id: `${prefix}${i}`, type: 'Text', props: { content: `${prefix} 글 ${i}` } }))
const SEED = [
  { id: 'n_big', type: 'Card', props: { title: '큰 카드' }, children: lines('n_b') },
  ...Array.from({ length: 4 }, (_, i) => ({ id: `n_z${i}`, type: 'Text', props: { content: `끝 글 ${i}` } })),
  { id: 'n_big2', type: 'Card', props: { title: '둘째 큰 카드' }, children: lines('n_c') },
]

describe.skipIf(!전제.ok)('기본테마 서브페이지 틀 — 캔버스 iframe 높이(실브라우저)', () => {
  let stack: EditorStack
  let alice: Session

  beforeAll(async () => {
    if (!전제.ok) return
    stack = await startEditorStack(전제)
    alice = await stack.login(stack.users.alice)
  }, 180_000)

  afterAll(async () => {
    if (stack === undefined) return
    const { after } = await stack.close()
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  })

  const call = (m: string, p: string, b?: unknown) => stack.request(alice, m, p, b)

  async function fixture(layout: 'subpage' | 'blank'): Promise<string> {
    const project = (await call('POST', '/projects', { name: '틀 높이', slug: `frame-h-${layout}-${Date.now().toString(36)}` })).body
    const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '가' })).body
    const member = await call('POST', `/projects/${project.id}/members`, { email: stack.users.bob.email, role: 'editor' })
    if (member.status >= 300) throw new Error(`member ${member.status}`)
    const created = await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '쪽', kind: 'page', layout })
    if (created.status !== 201) throw new Error(`page ${created.status} ${JSON.stringify(created.body)}`)
    const P = `/projects/${project.id}/pages/${created.body.id}`
    const seeded = await call('PATCH', `${P}/ops`, {
      baseSeq: 0,
      ops: SEED.map((value, at) => ({ op: 'add', path: `/root/children/${at}`, value })),
    })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
    return P
  }

  const iframeHeight = (page: Page) =>
    page.evaluate(() => (document.querySelector('iframe.wb-shell-canvas-iframe') as HTMLIFrameElement).offsetHeight)

  it.each(['subpage', 'blank'] as const)(
    '%s — 끌다 취소하면 iframe 이 끌기 전 높이로 돌아오고, 남이 노드를 지우면 준다',
    async (layout) => {
      const P = await fixture(layout)
      const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
      try {
        await page.goto(P)
        await canvasFrame(page).locator('[data-wb-id="n_big2"]').waitFor()
        await page.waitForTimeout(800)
        const frame = await canvasFrame(page)
          .locator('html')
          .evaluate(() => ({
            frames: document.querySelectorAll('[data-wb-layout="subpage"]').length,
            regions: document.querySelectorAll('[data-wb-layout-region]').length,
          }))
        const before = await iframeHeight(page)
        await page
          .locator('.wb-shell-region[aria-label="구조 트리"] [data-tree-row][data-tree-id="n_big"]')
          .locator('button')
          .first()
          .click()
        const handle = page.locator('.wb-shell-canvas-handle')
        await handle.waitFor()
        const h = (await handle.boundingBox())!
        await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2)
        await page.mouse.down()
        await page.mouse.move(h.x + h.width / 2 + 3, h.y + h.height / 2 + 8, { steps: 3 })
        await dragLayoutSettled(page)
        const z0 = (await canvasFrame(page).locator('[data-wb-id="n_z0"]').boundingBox())!
        await page.mouse.move(z0.x + z0.width / 2, z0.y + z0.height * 0.8, { steps: 6 })
        const grew = await poll(
          '끄는 동안 iframe 이 자란다',
          () => iframeHeight(page),
          (now) => now > before,
          3000,
        ).catch(() => iframeHeight(page))
        await page.keyboard.press('Escape')
        await page.mouse.up()
        const cancelled = await poll(
          '취소 뒤 끌기 전 높이',
          () => iframeHeight(page),
          (now) => now === before,
          3000,
        ).catch(() => iframeHeight(page))
        const bob = await stack.login(stack.users.bob)
        const head = (await stack.request(bob, 'GET', P)).body.headSeq as number
        const removed = await stack.request(bob, 'PATCH', `${P}/ops`, { baseSeq: head, ops: [{ op: 'remove', path: '/root/children/5' }] })
        await poll(
          '둘째 큰 카드가 캔버스에서',
          async () => canvasFrame(page).locator('[data-wb-id="n_big2"]').count(),
          (n) => n === 0,
        ).catch(() => -1)
        const after = await poll(
          '지운 뒤 iframe 이 준다',
          () => iframeHeight(page),
          (now) => now < before - 100,
          3000,
        ).catch(() => iframeHeight(page))
        // eslint-disable-next-line no-console
        console.log(`[틀 높이] ${layout} ${JSON.stringify({ frame, before, grew, cancelled, after })}`)
        expect({
          frame: layout === 'subpage' ? { frames: frame.frames, regions: frame.regions > 0 } : frame.frames,
          tall: before > 900,
          grew: grew > before,
          cancelled: cancelled - before,
          removed: removed.status,
          shrank: after < before - 100,
        }).toEqual({
          frame: layout === 'subpage' ? { frames: 1, regions: true } : 0,
          tall: true,
          grew: true,
          cancelled: 0,
          removed: 200,
          shrank: true,
        })
      } finally {
        await context.close()
      }
    },
    120_000,
  )
})
