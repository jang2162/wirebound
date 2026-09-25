/**
 * **페이지를 떠나며 버린 편집은 전부 센다** — 답을 기다리던 보낸 편집 하나와 그 뒤에 쌓인 안 보낸 편집.
 *
 * 앞 편집의 답이 늦는 동안(행 잠금 · 느린 서버) 같은 칸을 다시 고치면 둘째 편집은 큐에만 선다(in-flight 는 늘 하나). 그 채 다른
 * 페이지로 옮기면 큐가 판째 비워진다(`clearPage`) — 안 보낸 편집은 서버에 한 번도 안 갔다. 떠나는 순간 그 수를 말하고, 보낸
 * 편집이 거절되면 그 답이 올 때 둘을 합쳐 말한다(`edit/use-edit-commit.tsx` 의 `leftBehindNotice`).
 *
 * 앨리스의 편집을 서버에 붙잡는 것은 페이지 행 잠금이다 — 줄이 섰는지는 DB 에서 센다(안 서면 던진다). jsdom 판은
 * `apps/web/test/edit/reload-sent-edits.test.tsx` 의 «편집은 큐의 주인 페이지로 나간다» 묶음이 든다.
 */
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { editorStackPrerequisite, poll, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

describe.skipIf(!전제.ok)('떠나며 버린 편집의 수', () => {
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

  it('보낸 편집이 저장돼도 안 보낸 편집이 사라진 것을 말한다', async () => {
    const alice = await stack.login(stack.users.alice)
    const fx = await fixture(stack, alice, 'leave-saved')
    const { context, page } = await stack.openTab(stack.users.alice)
    const log = watch(page, fx)
    try {
      await page.goto(fx.P1)
      const hold = await stack.holdRow('pages', fx.first)
      await sendThenQueue(page, stack, 1)
      await page.getByRole('link', { name: '둘째' }).click()
      await page.locator('.wb-shell-canvas-frame', { hasText: '2쪽 원문' }).waitFor()
      await hold.release()

      await poll('보낸 편집이 서버에 닿는다', () => server(stack, alice, fx.P1), (value) => value.head === 2)
      const settled = await stable(page)
      // eslint-disable-next-line no-console
      console.log(`[떠남 · 저장됨] ${log.lines.join(' · ')} · 통지 ${JSON.stringify(settled.notices)}`)
      expect({ 서버: await server(stack, alice, fx.P1), 통지: settled.notices }).toEqual({
        서버: { head: 2, content: ['E1 보낸 글', '1쪽 둘째'] },
        통지: ['떠난 페이지에서 아직 보내지 않은 편집 1개는 저장되지 않았습니다 — 그 페이지를 다시 열어 확인하세요.'],
      })
      // 판이 섰는가 — 둘째 편집은 한 번도 안 나갔다.
      expect(log.lines.filter((line) => line.startsWith('WS→'))).toEqual(['WS→ patch 1쪽 baseSeq=1'])
    } finally {
      await context.close()
    }
  })

  it('보낸 편집이 거절되면 보낸 것과 안 보낸 것을 합쳐 말한다', async () => {
    const alice = await stack.login(stack.users.alice)
    const bob = await stack.login(stack.users.bob)
    const fx = await fixture(stack, alice, 'leave-refused')
    const { context, page } = await stack.openTab(stack.users.alice)
    const log = watch(page, fx)
    try {
      await page.goto(fx.P1)
      const hold = await stack.holdRow('pages', fx.first)
      // 밥이 먼저 줄 선다 — 풀면 밥이 커밋하고 앨리스의 편집은 옛 번호로 닿아 409 다.
      const bobs = stack.request(bob, 'PATCH', `${fx.P1}/ops`, { baseSeq: 1, ops: [{ op: 'remove', path: '/root/children/1' }] })
      await waitLocked(stack, 1)
      await sendThenQueue(page, stack, 2)
      await page.getByRole('link', { name: '둘째' }).click()
      await page.locator('.wb-shell-canvas-frame', { hasText: '2쪽 원문' }).waitFor()
      await hold.release()
      expect((await bobs).status).toBe(200)

      await poll('앨리스 편집의 거절이 닿는다', async () => log.lines.slice(), (lines) => lines.some((line) => line.startsWith('WS← patch-error')))
      const settled = await stable(page)
      // eslint-disable-next-line no-console
      console.log(`[떠남 · 거절됨] ${log.lines.join(' · ')} · 통지 ${JSON.stringify(settled.notices)}`)
      expect({ 서버: await server(stack, alice, fx.P1), 통지: settled.notices }).toEqual({
        서버: { head: 2, content: ['1쪽 원문'] },
        통지: [
          '페이지가 이미 변경되었습니다 (요청 baseSeq 1, 현재 2) — 떠난 페이지에서 보낸 편집 1개와 보내지 않은 편집 1개가 저장되지 않았습니다. ' +
            '그 페이지를 다시 열어 확인하세요.',
        ],
      })
      expect(log.lines.filter((line) => line.startsWith('WS→'))).toEqual(['WS→ patch 1쪽 baseSeq=1'])
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
  const project = created(await call('POST', '/projects', { name: '떠남', slug: `${slug}-${Date.now().toString(36)}` }))
  const member = await call('POST', `/projects/${project.id}/members`, { email: stack.users.bob.email, role: 'editor' })
  if (member.status >= 300) throw new Error(`픽스처 member ${member.status} ${JSON.stringify(member.body)}`)
  const menu = created(await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '메뉴' }))
  const first = created(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '첫째' }))
  const second = created(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '둘째' }))
  const P1 = `/projects/${project.id}/pages/${first.id}`
  const P2 = `/projects/${project.id}/pages/${second.id}`
  const text = (id: string, content: string) => ({ id, type: 'Text', props: { content } })
  for (const [path, nodes] of [
    [P1, [text('n_one0000001', '1쪽 원문'), text('n_one0000002', '1쪽 둘째')]],
    [P2, [text('n_two0000001', '2쪽 원문')]],
  ] as const) {
    const ops = nodes.map((value, index) => ({ op: 'add', path: `/root/children/${index}`, value }))
    const seeded = await call('PATCH', `${path}/ops`, { baseSeq: 0, ops })
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

/**
 * 이 판의 DB 에서 잠금을 기다리는 연결이 `count` 개가 될 때까지 기다린다. **사슬째 센다** — 한 행에 둘째로 줄 선 요청은 쥔 연결이
 * 아니라 첫째 대기자를 기다린다(`holdRow` 의 `waitForWaiters` 는 쥔 연결을 곧바로 기다리는 것만 센다). 이 DB 는 이 판의 것이라
 * 다른 대기자가 없다.
 */
async function waitLocked(stack: EditorStack, count: number): Promise<void> {
  await poll(
    `잠금에 줄 선 요청 ${count}`,
    async () =>
      (
        await stack.query<{ n: number }>(
          "select count(*)::int as n from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'",
        )
      )[0]!.n,
    (n) => n >= count,
  )
}

/** 첫 글을 고쳐 보내고(행에 줄 선다) 같은 칸을 다시 고쳐 큐에만 세운다. */
async function sendThenQueue(page: Page, stack: EditorStack, waiters: number): Promise<void> {
  await page.locator('.wb-shell-canvas-frame', { hasText: '1쪽 원문' }).waitFor()
  await page.locator('li button', { hasText: 'Text' }).first().click()
  const box = page.locator('.wb-shell-panel textarea').first()
  await box.waitFor()
  await box.click()
  await box.fill('E1 보낸 글')
  await box.evaluate((element) => (element as HTMLElement).blur())
  await waitLocked(stack, waiters)
  await box.click()
  await box.fill('E2 안 보낸 글')
  await box.evaluate((element) => (element as HTMLElement).blur())
  await page.locator('.wb-shell-canvas-frame', { hasText: 'E2 안 보낸 글' }).waitFor()
}

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
      const kind = /"type":"(patch-ack|patch-error)"/.exec(payload)?.[1]
      if (kind !== undefined) lines.push(`WS← ${kind} ${/"(seq|status)":(\d+)/.exec(payload)?.slice(1).join(' ') ?? ''}`)
    })
  })
  return { lines }
}

/** 캔버스 글 · 머리 통지가 500ms 동안 안 바뀌면 그 값. */
async function stable(page: Page): Promise<{ canvas: string; notices: string[] }> {
  const read = async () => ({
    canvas: (await page.locator('.wb-shell-canvas-frame').innerText()).replace(/\s+/g, ' '),
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
