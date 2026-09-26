/**
 * **페이지를 여는 조회가 도는 동안 그 페이지에 온 revision 은 실린 판 뒤에 남는다** — 남의 편집 · 내 편집의 늦은 ack.
 *
 * 여는 길(`routes/editor.tsx` 의 `CanvasFrame`)은 조회 전에 판을 비운다(`clearPage`). 룸이 프로젝트라 그 조회가 도는 동안에도 그
 * 페이지의 프레임 · ack 는 온다. 조회가 그 커밋 앞을 읽었으면 서버에는 있는데 실린 판에는 없는 revision 이다 — 남의 프레임은 다시
 * 오지 않고, 내 편집은 방송이 낸 연결을 뺀다. 조용히 빠지면 화면은 옛 판 · 낡음 없음이고, 다음 편집이 옛 번호로 나가 409 로 취소된다.
 * 스토어가 여는 페이지의 창을 적어 두었다가 실린 판 뒤에 얹는다(`store/editor-store.ts` 의 `#windowChanges`).
 *
 * 조회의 답만 붙잡는다 — `route.fetch` 가 서버에서 곧바로 읽고(그 커밋 앞) 답을 쥔다. 창 안에 그 revision 이 왔는지는 WS 로그로 잰다
 * (안 왔으면 판이 안 선 것이라 던진다). jsdom 판은 `apps/web/test/edit/reload-sent-edits.test.tsx` 의 «여는 창» 묶음이 든다.
 */
import type { Page, Route } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { editorStackPrerequisite, poll, startEditorStack, type EditorStack, type Session, canvasFrame, canvasText } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

describe.skipIf(!전제.ok)('페이지를 여는 조회의 창', () => {
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

  it('여는 조회가 읽은 뒤 남이 넣은 글이 실린 판에 남는다 — 다음 편집이 409 없이 나간다', async () => {
    const alice = await stack.login(stack.users.alice)
    const bob = await stack.login(stack.users.bob)
    const fx = await fixture(stack, alice, 'open-frame')
    const { context, page } = await stack.openTab(stack.users.alice)
    const log = watch(page, fx)
    try {
      await page.goto(fx.P2)
      await canvasFrame(page).locator('body', { hasText: '2쪽 원문' }).waitFor()
      const held = holdNextRead(page, fx.P1, log)

      await page.getByRole('link', { name: '첫째' }).click()
      await held.read
      const bobs = await stack.request(bob, 'PATCH', `${fx.P1}/ops`, {
        baseSeq: 1,
        ops: [{ op: 'add', path: '/root/children/-', value: { id: 'n_bob0000001', type: 'Text', props: { content: '밥이 넣은 글' } } }],
      })
      expect(bobs.status).toBe(200)
      // 판이 섰는가 — 밥의 프레임이 붙잡은 답보다 먼저 닿았다.
      await poll('밥의 프레임이 여는 창 안에 닿는다', async () => log.lines.slice(), (lines) => lines.some((line) => line.includes('WS← page-changed seq 2')))
      held.release()

      const opened = await stable(page)
      expect({ 캔버스: opened.canvas, 통지: opened.notices }).toEqual({
        캔버스: expect.stringContaining('밥이 넣은 글'),
        통지: [],
      })

      await editFirstText(page, '1쪽 원문', '앨리스 다음 편집')
      const landed = await poll('다음 편집이 서버에 닿는다', () => server(stack, alice, fx.P1), (value) => value.head === 3)
      const settled = await stable(page)
      // eslint-disable-next-line no-console
      console.log(`[여는 창 · 남의 프레임] ${log.lines.join(' · ')} · 서버 ${JSON.stringify(landed)}`)
      expect({ 서버: landed, 통지: settled.notices }).toEqual({
        서버: { head: 3, content: ['앨리스 다음 편집', '밥이 넣은 글'] },
        통지: [],
      })
      expect(log.lines.filter((line) => line.includes('WS→ patch'))).toEqual(['WS→ patch 1쪽 baseSeq=2'])
    } finally {
      await context.close()
    }
  })

  it('떠났다 돌아오는 여는 조회의 창에 온 내 편집의 ack 가 실린 판에 남는다', async () => {
    const alice = await stack.login(stack.users.alice)
    const fx = await fixture(stack, alice, 'open-ack')
    const { context, page } = await stack.openTab(stack.users.alice)
    const log = watch(page, fx)
    try {
      await page.goto(fx.P1)
      const box = await selectFirstText(page, '1쪽 원문')
      await box.click()
      await box.fill('떠나며 낸 글')

      const hold = await stack.holdRow('pages', fx.first)
      // 실클릭 — blur 가 1쪽 편집을 낸다. 행에 줄 서야 판이 선다.
      await page.getByRole('link', { name: '둘째' }).click()
      await hold.waitForWaiters(1)
      await canvasFrame(page).locator('body', { hasText: '2쪽 원문' }).waitFor()

      // 1쪽을 다시 연다 — 조회는 곧바로 읽힌다(행 잠금은 읽기를 막지 않는다 · 그 편집의 커밋 앞).
      const held = holdNextRead(page, fx.P1, log)
      await page.getByRole('link', { name: '첫째' }).click()
      await held.read
      await hold.release()
      await poll('1쪽 편집의 ack 가 여는 창 안에 닿는다', async () => log.lines.slice(), (lines) => lines.some((line) => line.includes('WS← patch-ack seq 2')))
      held.release()

      const opened = await stable(page)
      expect({ 캔버스: opened.canvas, 통지: opened.notices }).toEqual({
        캔버스: expect.stringContaining('떠나며 낸 글'),
        통지: [],
      })
      expect(await server(stack, alice, fx.P1)).toEqual({ head: 2, content: ['떠나며 낸 글'] })

      await editFirstText(page, '떠나며 낸 글', '돌아와 낸 글')
      const landed = await poll('다음 편집이 서버에 닿는다', () => server(stack, alice, fx.P1), (value) => value.head === 3)
      const settled = await stable(page)
      // eslint-disable-next-line no-console
      console.log(`[여는 창 · 내 ack] ${log.lines.join(' · ')} · 서버 ${JSON.stringify(landed)}`)
      expect({ 서버: landed, 통지: settled.notices }).toEqual({ 서버: { head: 3, content: ['돌아와 낸 글'] }, 통지: [] })
      expect(log.lines.filter((line) => line.includes('WS→ patch'))).toEqual(['WS→ patch 1쪽 baseSeq=1', 'WS→ patch 1쪽 baseSeq=2'])
    } finally {
      await context.close()
    }
  })

  /**
   * 코멘트 게시는 번호를 매긴 revision 을 남기고 그 방송은 낸 연결을 뺀다 — 이 탭이 그 revision 을 받는 길은 게시의 응답 하나다
   * (`panels/comment-panel.tsx` 의 `landed` → `EditorStore.applyMarkerChange`). 응답이 여는 창 안에 오면 그 창에 적어야 실린 판 뒤에 얹힌다.
   */
  it('떠났다 돌아오는 여는 조회의 창에 온 코멘트 번호가 실린 판에 남는다', async () => {
    const alice = await stack.login(stack.users.alice)
    const fx = await fixture(stack, alice, 'open-marker')
    const { context, page } = await stack.openTab(stack.users.alice)
    const log = watch(page, fx)
    try {
      await page.goto(fx.P1)
      await selectFirstText(page, '1쪽 원문')
      await page.getByRole('tab', { name: '코멘트' }).click()
      await page.locator('#wb-comment-draft').fill('번호가 붙을 코멘트')

      const hold = await stack.holdRow('pages', fx.first)
      const posted = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().includes('/comments'))
      await page.getByRole('button', { name: '코멘트 달기' }).click()
      await hold.waitForWaiters(1)
      await page.getByRole('link', { name: '둘째' }).click()
      await canvasFrame(page).locator('body', { hasText: '2쪽 원문' }).waitFor()

      // 1쪽을 다시 연다 — 조회는 게시의 커밋 앞을 읽는다(행 잠금은 읽기를 막지 않는다).
      const held = holdNextRead(page, fx.P1, log)
      await page.getByRole('link', { name: '첫째' }).click()
      await held.read
      await hold.release()
      // 판이 섰는가 — 게시의 응답이 붙잡은 답보다 먼저 닿았다.
      const response = await posted
      log.lines.push(`POST 코멘트 ${response.status()} seq ${(await response.json()).seq}`)
      held.release()

      const opened = await stable(page)
      expect({ 번호: await page.locator('.wb-shell-marker').allTextContents(), 통지: opened.notices }).toEqual({ 번호: ['1'], 통지: [] })
      expect(await server(stack, alice, fx.P1)).toEqual({ head: 2, content: ['1쪽 원문'] })

      await page.getByRole('tab', { name: '속성' }).click()
      await editFirstText(page, '1쪽 원문', '돌아와 낸 글')
      const landed = await poll('다음 편집이 서버에 닿는다', () => server(stack, alice, fx.P1), (value) => value.head === 3, 5_000).catch(
        async () => server(stack, alice, fx.P1),
      )
      const settled = await stable(page)
      // eslint-disable-next-line no-console
      console.log(`[여는 창 · 번호 응답] ${log.lines.join(' · ')} · 서버 ${JSON.stringify(landed)} · 통지 ${JSON.stringify(settled.notices)}`)
      expect({ 서버: landed, 통지: settled.notices }).toEqual({ 서버: { head: 3, content: ['돌아와 낸 글'] }, 통지: [] })
      expect(log.lines.filter((line) => line.includes('WS→ patch'))).toEqual(['WS→ patch 1쪽 baseSeq=2'])
    } finally {
      await context.close()
    }
  })
})

interface Fixture {
  first: string
  second: string
  P1: string
  P2: string
}

async function fixture(stack: EditorStack, owner: Session, slug: string): Promise<Fixture> {
  const call = (method: string, path: string, body?: unknown) => stack.request(owner, method, path, body)
  const project = created(await call('POST', '/projects', { name: '여는 창', slug: `${slug}-${Date.now().toString(36)}` }))
  const member = await call('POST', `/projects/${project.id}/members`, { email: stack.users.bob.email, role: 'editor' })
  if (member.status >= 300) throw new Error(`픽스처 member ${member.status} ${JSON.stringify(member.body)}`)
  const menu = created(await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '메뉴' }))
  const first = created(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '첫째' }))
  const second = created(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '둘째' }))
  const P1 = `/projects/${project.id}/pages/${first.id}`
  const P2 = `/projects/${project.id}/pages/${second.id}`
  const text = (id: string, content: string) => ({ op: 'add', path: '/root/children/0', value: { id, type: 'Text', props: { content } } })
  for (const [path, node] of [
    [P1, text('n_one0000001', '1쪽 원문')],
    [P2, text('n_two0000001', '2쪽 원문')],
  ] as const) {
    const seeded = await call('PATCH', `${path}/ops`, { baseSeq: 0, ops: [node] })
    if (seeded.status >= 300) throw new Error(`픽스처 ops ${seeded.status} ${JSON.stringify(seeded.body)}`)
  }
  return { first: first.id, second: second.id, P1, P2 }
}

function created(response: { status: number; body: any }): { id: string } {
  if (response.status !== 201) throw new Error(`픽스처 ${response.status} ${JSON.stringify(response.body)}`)
  return response.body
}

async function server(stack: EditorStack, session: Session, path: string): Promise<{ head: number; content: string[] }> {
  const page = (await stack.request(session, 'GET', path)).body
  return { head: page.headSeq as number, content: (page.schema.root.children ?? []).map((child: any) => child.props?.content) }
}

/** 편집 · 답 프레임과 붙잡은 조회를 시각 순으로 적는다. */
function watch(page: Page, fx: Fixture): { lines: string[] } {
  const lines: string[] = []
  page.on('websocket', (ws) => {
    ws.on('framesent', (frame) => {
      const payload = String(frame.payload)
      if (!payload.includes('"patch"')) return
      const target = /"pageId":"([^"]+)"/.exec(payload)?.[1]
      lines.push(`WS→ patch ${target === fx.first ? '1쪽' : target === fx.second ? '2쪽' : target} baseSeq=${/"baseSeq":(\d+)/.exec(payload)?.[1]}`)
    })
    ws.on('framereceived', (frame) => {
      const payload = String(frame.payload)
      const kind = /"type":"(patch-ack|patch-error|page-changed)"/.exec(payload)?.[1]
      if (kind !== undefined) lines.push(`WS← ${kind} ${/"(seq|status)":(\d+)/.exec(payload)?.[0]?.replace(/"|:/g, (c) => (c === ':' ? ' ' : '')) ?? ''}`)
    })
  })
  return { lines }
}

/**
 * 다음 `GET <path>` 하나를 서버에서 곧바로 읽고 답만 쥔다. `read` 는 읽힌 뒤 풀리고, `release()` 가 답을 흘린다. 그 밖의 요청은
 * 그대로 지난다.
 */
function holdNextRead(page: Page, path: string, log: { lines: string[] }): { read: Promise<void>; release(): void } {
  let armed = true
  let readDone!: () => void
  let letGo!: () => void
  const read = new Promise<void>((resolve) => (readDone = resolve))
  const gate = new Promise<void>((resolve) => (letGo = resolve))
  void page.route(`**/api${path}`, async (route: Route) => {
    if (!armed || route.request().method() !== 'GET') return route.fallback()
    armed = false
    const response = await route.fetch()
    const body = await response.json()
    log.lines.push(`GET 읽힘 head ${body.headSeq} — 답 쥠`)
    readDone()
    await gate
    log.lines.push('쥔 답 흘림')
    await route.fulfill({ response, json: body })
  })
  return { read, release: () => letGo() }
}

/** 구조 트리에서 첫 글 노드를 골라 속성 칸을 연다 — 캔버스가 그 글을 그린 뒤에. */
async function selectFirstText(page: Page, content: string) {
  await canvasFrame(page).locator('body', { hasText: content }).waitFor()
  await page.locator('li button', { hasText: 'Text' }).first().click()
  const box = page.locator('.wb-shell-panel textarea').first()
  await box.waitFor()
  return box
}

/** 첫 글을 고치고 blur 로 커밋한다. */
async function editFirstText(page: Page, current: string, next: string): Promise<void> {
  const box = await selectFirstText(page, current)
  await box.click()
  await box.fill(next)
  await box.evaluate((element) => (element as HTMLElement).blur())
}

/** 캔버스 글 · 머리 통지가 500ms 동안 안 바뀌면 그 값. */
async function stable(page: Page): Promise<{ canvas: string; notices: string[] }> {
  const read = async () => ({
    canvas: (await canvasText(page)).replace(/\s+/g, ' '),
    notices: await page.locator('.wb-shell-header [role=status], .wb-shell-header [role=alert]').allTextContents(),
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
