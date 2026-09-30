/**
 * **남의 복원 배너의 «다시 불러오기»를 속성 칸에 친 채 눌러도 반영된 편집을 «취소됐다»고 말하지 않는다.**
 *
 * 실클릭은 먼저 포커스를 옮기고 blur 가 편집을 커밋한다(WS). 단추는 곧바로 페이지를 다시 읽는다(REST). 두 요청이 **다른 연결**로
 * 겨루므로, 읽기가 커밋 앞을 읽으면 화면은 편집 전 판을 싣고 그 편집을 «취소됐다»고 말하는데 서버에는 그 글이 있다. 지금은
 * 판을 다시 싣는 길이 보낸 편집의 답을 기다린다(`routes/editor.tsx` · `store/editor-store.ts` 의 `wasSent`).
 *
 * jsdom 에서는 이 판이 안 선다 — `fireEvent.click` 이 포커스를 안 옮겨 blur 가 안 난다. 루프백은 두 연결의 지연 차가 0 이라
 * 도착 순서가 늘 보내는 순서다 — 그래서 **WS 연결만 10ms 늦춘다**(`startWsDelay`). 그 지연이 없던 측정에서 WS 가 GET 보다
 * 8–15ms 앞섰으니, 10ms 는 망의 흔들림 폭 안에서 순서를 뒤집는 값이다.
 *
 * 둘째 케이스는 단추의 다시 읽기가 도는 사이 다른 페이지로 옮긴 판이다(배너가 풀리는가).
 */
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { editorStackPrerequisite, poll, startEditorStack, type EditorStack, canvasFrame, canvasText } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

/** WS 연결만 늦추는 폭(ms). */
const WS_DELAY_MS = 10

describe.skipIf(!전제.ok)('배너 «다시 불러오기»와 blur 커밋의 겨룸', () => {
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

  it(`친 채 누르면 화면이 서버와 같고 «취소됐다»가 없다 — WS ${WS_DELAY_MS}ms 지연`, async () => {
    const alice = await stack.login(stack.users.alice)
    const bob = await stack.login(stack.users.bob)
    const call = (method: string, path: string, body?: unknown) => stack.request(alice, method, path, body)
    const project = await created(await call('POST', '/projects', { name: '배너 겨룸', slug: `banner-${Date.now().toString(36)}` }))
    const member = await call('POST', `/projects/${project.id}/members`, { email: stack.users.bob.email, role: 'owner' })
    if (member.status >= 300) throw new Error(`픽스처 member ${member.status} ${JSON.stringify(member.body)}`)
    const menu = await created(await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '메뉴' }))
    const target = await created(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '페이지' }))
    const P = `/projects/${project.id}/pages/${target.id}`
    const seeded = await call('PATCH', `${P}/ops`, {
      baseSeq: 0,
      ops: [{ op: 'add', path: '/root/children/0', value: { id: 'n_text000001', type: 'Text', props: { content: '원문' } } }],
    })
    if (seeded.status >= 300) throw new Error(`픽스처 ops ${seeded.status}`)
    // 이 페이지를 바꾸지 않는 복원이다 — 편집은 복원과 부딪히지 않아 받아져야 한다(바뀌는 복원이면 409 가 참이라 «취소»가 맞다).
    const snapshot = await created(await call('POST', `/projects/${project.id}/snapshots`, { tag: 'blur' }))
    const server = async () => {
      const page = (await call('GET', P)).body
      return { head: page.headSeq as number, content: page.schema.root.children?.[0]?.props?.content as string }
    }

    const delay = await stack.startWsDelay(WS_DELAY_MS)
    const { context, page } = await stack.openTab(stack.users.alice, { origin: delay.origin })
    const events: string[] = []
    const t0 = Date.now()
    const at = () => Date.now() - t0
    page.on('websocket', (ws) => {
      ws.on('framesent', (frame) => {
        if (String(frame.payload).includes('"patch"')) events.push(`${at()} WS→ patch`)
      })
      ws.on('framereceived', (frame) => {
        const kind = /"type":"(patch-ack|patch-error)"/.exec(String(frame.payload))?.[1]
        if (kind !== undefined) events.push(`${at()} WS← ${kind}`)
      })
    })
    page.on('request', (request) => {
      if (request.method() === 'GET' && request.url().endsWith(`/api${P}`)) events.push(`${at()} GET page`)
    })
    try {
      await page.goto(P)
      await selectText(page, '원문')
      const box = page.locator('.wb-shell-panel textarea').first()
      await box.click()
      await box.fill('앨리스가 친 글')

      const restore = await stack.request(bob, 'POST', `/projects/${project.id}/snapshots/${snapshot.id}/restore`)
      expect(restore.status).toBeLessThan(300)
      const reload = page.getByRole('button', { name: '다시 불러오기' })
      await reload.waitFor()
      // 칸이 아직 커밋 전이다 — 누름의 blur 가 편집을 낸다. 여기서 이미 나갔으면 겨룸이 없다.
      expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('TEXTAREA')
      expect(events.filter((line) => line.includes('WS→'))).toEqual([])

      const clickedAt = at()
      await reload.click()
      // 다시 실은 판이 배너를 걷고, 편집이 서버에 닿는다.
      await reload.waitFor({ state: 'detached' })
      const landed = await poll('편집이 서버에 닿는다', server, (value) => value.head === 2)
      // 뒤늦은 답이 화면을 한 번 더 바꿀 수 있다 — 캔버스 · 통지가 멈출 때까지 본다.
      const settled = await stable(page)
      // eslint-disable-next-line no-console
      console.log(`[배너 겨룸] 누름 +${clickedAt} · ${events.join(' · ')} · 통지 ${JSON.stringify(settled.notices)}`)

      expect({ 서버: landed, 캔버스: settled.canvas, 통지: settled.notices, 순서: events }).toEqual({
        서버: { head: 2, content: '앨리스가 친 글' },
        캔버스: expect.stringContaining('앨리스가 친 글'),
        통지: [expect.not.stringContaining('취소됐')],
        순서: expect.any(Array),
      })
      // 판이 섰는가: 편집이 누름 **뒤에** 나갔고(blur 커밋) 단추가 페이지를 다시 읽었다. 둘 중 하나라도 없으면 겨룸이 없던 판이다.
      const sentAt = events.filter((line) => line.includes('WS→ patch')).map((line) => Number(line.split(' ')[0]))
      expect(sentAt).toHaveLength(1)
      expect(sentAt[0]).toBeGreaterThanOrEqual(clickedAt)
      expect(events.filter((line) => line.endsWith('GET page') && Number(line.split(' ')[0]) >= clickedAt).length).toBeGreaterThanOrEqual(1)
    } finally {
      await context.close()
      await delay.close()
    }
  })
  /**
   * **«다시 불러오기»가 도는 사이 다른 페이지로 옮겨도 배너가 풀린다**(`EditorStore.#keepsRestored`의 `#rereadBegun`). 단추는 메뉴 · 테마 ·
   * 우측 본문을 곧바로 다시 읽고 페이지는 보낸 편집의 답 뒤에 읽는다. 그 페이지 조회가 도는 사이 옮기면 복원 이펙트는 판을 못 싣고 물러나고,
   * 옮긴 페이지의 여는 조회가 판을 싣는다 — 그 조회는 다시 읽기가 시작된 뒤에 시작했으니 복원 뒤를 읽었다. 고치기 전에는 그 판이 배너를 안
   * 풀어 2.5s 뒤에도 복원 배너가 남았다([Chrome] — 단추를 한 번 더 누르면 풀렸다).
   */
  it('다시 읽기 도중 다른 페이지로 옮기면 배너가 풀린다', async () => {
    const bob = await stack.login(stack.users.bob)
    const call = (method: string, path: string, body?: unknown) => stack.request(bob, method, path, body)
    const project = created(await call('POST', '/projects', { name: '옮기는 다시 읽기', slug: `reread-leave-${Date.now().toString(36)}` }))
    const member = await call('POST', `/projects/${project.id}/members`, { email: stack.users.alice.email, role: 'owner' })
    if (member.status >= 300) throw new Error(`픽스처 member ${member.status} ${JSON.stringify(member.body)}`)
    const menu = created(await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '메뉴' }))
    const first = created(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '첫째' }))
    const second = created(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '둘째' }))
    for (const [id, content, nodeId] of [
      [first.id, '첫째 원문', 'n_one0000001'],
      [second.id, '둘째 원문', 'n_two0000001'],
    ] as const) {
      const seeded = await call('PATCH', `/projects/${project.id}/pages/${id}/ops`, {
        baseSeq: 0,
        ops: [{ op: 'add', path: '/root/children/0', value: { id: nodeId, type: 'Text', props: { content } } }],
      })
      if (seeded.status >= 300) throw new Error(`픽스처 ops ${seeded.status}`)
    }
    const snapshot = created(await call('POST', `/projects/${project.id}/snapshots`, { tag: 'leave' }))
    const { context, page } = await stack.openTab(stack.users.alice)
    const events: string[] = []
    const t0 = Date.now()
    const at = (): number => Date.now() - t0
    const firstPath = `/api/projects/${project.id}/pages/${first.id}`
    const secondPath = `/api/projects/${project.id}/pages/${second.id}`
    try {
      await page.goto(`/projects/${project.id}/pages/${first.id}`)
      await canvasFrame(page).locator('body', { hasText: '첫째 원문' }).waitFor()
      const restored = await call('POST', `/projects/${project.id}/snapshots/${snapshot.id}/restore`)
      if (restored.status !== 200) throw new Error(`복원 ${restored.status}`)
      const button = page.getByRole('button', { name: '다시 불러오기' })
      await button.waitFor()
      // 다시 읽기의 페이지 조회를 1.5s 붙잡는다 — 그 사이 옮긴다.
      await page.route(`**${firstPath}`, async (route) => {
        if (route.request().method() !== 'GET') return route.fallback()
        events.push(`${at()} GET 첫째 붙잡음`)
        await new Promise((resolve) => setTimeout(resolve, 1_500))
        await route.fallback()
      })
      page.on('request', (request) => {
        if (request.method() === 'GET' && request.url().endsWith(secondPath)) events.push(`${at()} GET 둘째`)
      })
      await button.click()
      await poll('다시 읽기의 페이지 조회가 붙잡힌다', async () => events.slice(), (lines) => lines.some((line) => line.endsWith('GET 첫째 붙잡음')))
      events.push(`${at()} 둘째로 옮김`)
      await page.getByRole('link', { name: '둘째' }).click()
      await canvasFrame(page).locator('body', { hasText: '둘째 원문' }).waitFor()
      await page.waitForTimeout(2_500)
      const banners = await page.locator('.wb-shell-remote-alert').allTextContents()
      // eslint-disable-next-line no-console
      console.log(`[다시 읽기 도중 옮김] ${events.join(' · ')} · 배너 ${JSON.stringify(banners)}`)

      // 판 카나리아 — 붙잡은 조회가 도는 사이 옮겼고 둘째를 읽었다.
      expect(events.map((line) => line.replace(/^\d+ /, ''))).toEqual(['GET 첫째 붙잡음', '둘째로 옮김', 'GET 둘째'])
      expect(banners).toEqual([])
    } finally {
      await context.close()
    }
  })
})

function created(response: { status: number; body: any }): { id: string } {
  if (response.status !== 201) throw new Error(`픽스처 ${response.status} ${JSON.stringify(response.body)}`)
  return response.body
}

async function selectText(page: Page, content: string): Promise<void> {
  await canvasFrame(page).locator('body', { hasText: content }).waitFor()
  await page.locator('li button', { hasText: 'Text' }).first().click()
  await page.locator('.wb-shell-panel textarea').first().waitFor()
}

/** 캔버스 글 · 머리 통지가 500ms 동안 안 바뀌면 그 값. */
async function stable(page: Page): Promise<{ canvas: string; notices: string[] }> {
  const read = async () => ({
    canvas: (await canvasText(page)).replace(/\s+/g, ' '),
    notices: await page.locator('.wb-shell-footer [role=status], .wb-shell-footer [role=alert]').allTextContents(),
  })
  let last = await read()
  let since = Date.now()
  const until = Date.now() + 10_000
  while (Date.now() < until) {
    await new Promise((resolve) => setTimeout(resolve, 100))
    const now = await read()
    if (JSON.stringify(now) !== JSON.stringify(last)) {
      last = now
      since = Date.now()
    } else if (Date.now() - since >= 500) {
      return now
    }
  }
  throw new Error(`화면이 10s 안에 멈추지 않았다 — ${JSON.stringify(last)}`)
}
