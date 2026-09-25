/**
 * **번호 어긋남 통지는 그 번호까지 품은 판이 서면 거둔다**(`panels/comment-panel.tsx`의 `divergedShown`) — 실제 서버 이력으로 선 판(M4c).
 *
 * 앨리스가 코멘트를 단다(번호 revision) → 새로고침(서버 이력 되돌리기 스택에 번호 추가의 inverse = 번호 지우기가 든다 — `restoreUndoStack`)
 * → 행을 쥔다 → 코멘트 «삭제»(마지막 코멘트라 번호를 지운다 · 줄 1) → «되돌리기»(번호 지우기 편집 · 줄 2) → 놓는다. 삭제가 먼저 커밋되고
 * 그 응답의 번호 ops 를 떠 있는 되돌리기 위에 다시 못 얹어(`applyMarkerChange`의 `'diverged'`) «번호를 화면에 반영하지 못했습니다»가 선다.
 * 되돌리기는 409 를 받고 수습이 그 번호 revision 까지 품은 판(head 3)을 싣는다 — 화면은 서버 것이라 통지는 거짓이다. 고치기 전에는 그 판
 * 뒤에도 남았다([Chrome] 2/2 — 2.5s 뒤).
 *
 * 성질로 단언한다: 캔버스의 번호가 서버와 같으면 패널은 어긋남을 말하지 않는다. 통지가 한 번 섰는지는 MutationObserver 로 적는다(판 카나리아).
 */
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { editorStackPrerequisite, poll, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

const DIVERGED = '번호를 화면에 반영하지 못했습니다'

describe.skipIf(!전제.ok)('번호 어긋남 통지 — 실제 이력', () => {
  let stack: EditorStack

  beforeAll(async () => {
    if (!전제.ok) return
    stack = await startEditorStack(전제)
  })

  afterAll(async () => {
    if (stack === undefined) return
    const { before, after } = await stack.close()
    expect(before.processes).toBeGreaterThan(0)
    expect(before.listeningPorts.length).toBeGreaterThanOrEqual(2)
    expect(before.databases).toBe(1)
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  })

  it('삭제가 지운 번호를 떠 있는 되돌리기 위에 못 얹어도 수습이 그 번호까지 실으면 통지를 거둔다', async () => {
    const alice = await stack.login(stack.users.alice)
    const fx = await fixture(stack, alice, 'marker-diverged')
    const { context, page } = await stack.openTab(stack.users.alice)
    const lines: string[] = []
    const started = Date.now()
    const at = (): string => `${Date.now() - started}ms`
    page.on('websocket', (ws) => {
      ws.on('framesent', (frame) => {
        const payload = String(frame.payload)
        if (payload.includes('"patch"')) lines.push(`${at()} WS→ patch baseSeq=${/"baseSeq":(\d+)/.exec(payload)?.[1]}`)
      })
      ws.on('framereceived', (frame) => {
        const payload = String(frame.payload)
        const kind = /"type":"(patch-ack|patch-error)"/.exec(payload)?.[1]
        if (kind !== undefined) lines.push(`${at()} WS← ${kind}`)
      })
    })
    page.on('response', (response) => {
      if (response.request().method() === 'DELETE' && response.url().includes('/comments')) lines.push(`${at()} DELETE 코멘트 ${response.status()}`)
    })
    try {
      await page.goto(fx.P1)
      await selectFirstText(page, '원문')
      await page.getByRole('tab', { name: '코멘트' }).click()
      await page.locator('#wb-comment-draft').fill('번호를 붙일 코멘트')
      await page.getByRole('button', { name: '코멘트 달기' }).click()
      await poll('번호가 붙는다', () => server(stack, alice, fx.P1), (value) => value.head === 2)
      // 새로고침 — 되돌리기 스택이 서버 이력에서 선다(번호 추가의 inverse).
      await page.reload()
      await selectFirstText(page, '원문')
      await page.getByRole('tab', { name: '코멘트' }).click()
      await watchDiverged(page)
      const undo = page.getByRole('button', { name: '되돌리기', exact: true })
      const hold = await stack.holdRow('pages', fx.first)
      try {
        await page.locator('.wb-shell-comment-delete').first().click()
        await hold.waitForWaiters(1)
        await undo.click()
        await hold.waitForWaiters(2)
      } finally {
        await hold.release()
      }
      await poll('수습이 판을 싣는다', async () => lines.join(' · '), (value) => value.includes('patch-error'), 5_000)
      await page.waitForTimeout(2_500)
      const final = await server(stack, alice, fx.P1)
      const markers = await page.locator('.wb-shell-marker').allTextContents()
      const shown = (await page.locator('.wb-shell-panel').allTextContents()).some((text) => text.includes(DIVERGED))
      const seen = await page.evaluate(() => (window as unknown as { __divergedSeen: number }).__divergedSeen)
      // eslint-disable-next-line no-console
      console.log(`[번호 어긋남] ${lines.join(' · ')} · 서버 ${JSON.stringify(final)} · 캔버스 번호 ${JSON.stringify(markers)} · 통지 선 수 ${seen} · 끝 ${shown}`)

      // 판 카나리아 — 삭제가 먼저 커밋되고(200) 되돌리기가 409 를 받았고, 그 사이 어긋남 통지가 한 번 섰다.
      const order = ['DELETE 코멘트 200', 'WS← patch-error'].map((mark) => lines.findIndex((line) => line.includes(mark)))
      expect(order[0]!).toBeGreaterThanOrEqual(0)
      expect(order[1]!).toBeGreaterThan(order[0]!)
      expect(seen).toBeGreaterThan(0)
      // 성질 — 캔버스의 번호가 서버와 같으면(둘 다 없다) 패널은 어긋남을 말하지 않는다.
      expect({ 서버: final, 캔버스번호: markers, 어긋남통지: shown }).toEqual({
        서버: { head: 3, content: ['원문'] },
        캔버스번호: [],
        어긋남통지: false,
      })
    } finally {
      await context.close()
    }
  })
})

/** 어긋남 통지가 DOM 에 선 횟수를 `window.__divergedSeen` 에 센다 — 섰다가 곧 거둬져도 남는다. */
async function watchDiverged(page: Page): Promise<void> {
  await page.evaluate((text) => {
    const box = window as unknown as { __divergedSeen: number }
    box.__divergedSeen = 0
    let present = false
    new MutationObserver(() => {
      const now = (document.body.textContent ?? '').includes(text)
      if (now && !present) box.__divergedSeen += 1
      present = now
    }).observe(document.body, { childList: true, subtree: true, characterData: true })
  }, DIVERGED)
}

async function fixture(stack: EditorStack, owner: Session, slug: string) {
  const call = (m: string, p: string, b?: unknown) => stack.request(owner, m, p, b)
  const project = (await call('POST', '/projects', { name: 'M4c', slug: `${slug}-${Date.now().toString(36)}` })).body
  const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '메뉴' })).body
  const first = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '첫째' })).body
  const P1 = `/projects/${project.id}/pages/${first.id}`
  const seeded = await call('PATCH', `${P1}/ops`, { baseSeq: 0, ops: [{ op: 'add', path: '/root/children/0', value: { id: 'n_one0000001', type: 'Text', props: { content: '원문' } } }] })
  if (seeded.status >= 300) throw new Error(`seed ${seeded.status}`)
  return { first: first.id as string, P1 }
}
async function server(stack: EditorStack, s: Session, path: string) {
  const page = (await stack.request(s, 'GET', path)).body
  return { head: page.headSeq as number, content: (page.schema.root.children ?? []).map((c: any) => `${c.props?.content}${c.marker ? '#' + c.marker : ''}`) }
}
async function selectFirstText(page: Page, content: string) {
  await page.locator('.wb-shell-canvas-frame', { hasText: content }).waitFor()
  await page.locator('li button', { hasText: 'Text' }).first().click()
  await page.locator('.wb-shell-panel').first().waitFor()
}
