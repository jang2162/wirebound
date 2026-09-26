/**
 * **내 복원의 신호와 답이 어떤 차례로 와도 화면이 서버와 같거나 배너가 그렇다고 말한다**(`EditorStore.markRestored`).
 *
 * 복원의 방송은 낸 연결도 빼지 않는다(서버 `ws/notify.ts`의 `notifyRestored`) — 답을 잃은 탭에게는 그 신호만이 서버가 복원했다는 것을 알린다.
 * 그래서 내 복원의 신호가 늘 이 탭에 오고, 탭은 답을 받은 복원을 안전망 스냅샷 id 로 알아보고 넘긴다. 입구는 스냅샷 팝오버 하나다(MCP · CLI 에는
 * 복원이 없다). 칸은 넷이다:
 *
 * | | 신호가 답보다 먼저 | 신호가 답(다시 읽기)보다 늦게 |
 * |---|---|---|
 * | 답을 받음 | 아래 «답보다 먼저» — 거짓 배너 0 | 아래 «다시 읽기보다 늦게» — 거짓 배너 0 |
 * | 답을 잃음 | `editor-restore-unanswered.test.ts` — «반영됐습니다» | 아래 «늦게 커밋» — 배너가 다시 선다 |
 *
 * 차례는 붙잡아 세운다: 답을 신호 뒤로 미루려면 `route.fetch` 뒤 신호를 기다렸다 `fulfill`, 신호를 뒤로 미루려면 서버 → 브라우저 WS 만 늦춘다
 * (`startDownDelay`), 커밋을 다시 읽기 뒤로 미루려면 페이지 행을 쥐어 복원을 서버에 세운다(`holdRow`). 거짓 배너는 끝 화면이 아니라 DOM 에 선
 * 횟수로 센다 — 섰다가 다시 읽기가 걷은 판도 센다.
 */
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { editorStackPrerequisite, poll, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

/** 서버 → 브라우저 WS 지연 — 복원 답 · 다시 읽기(수백 ms)보다 넉넉히 길다. */
const DELAY_MS = 1_500

describe.skipIf(!전제.ok)('내 복원의 신호와 답의 차례', () => {
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

  it('답을 받음 · 신호가 답보다 먼저 — 배너가 한 번도 서지 않는다', async () => {
    const alice = await stack.login(stack.users.alice)
    const fx = await fixture(stack, alice, 'restore-first')
    const { context, page } = await stack.openTab(stack.users.alice)
    const { lines: events, at } = watch(page)
    // **답을 신호 뒤로 미룬다** — 서버는 끝냈고, 그 신호가 이 탭에 닿은 뒤에야 답을 건넨다.
    await page.route('**/restore', async (route) => {
      const answer = await route.fetch()
      await poll('신호가 먼저 닿는다', async () => events.slice(), (lines) => lines.some((line) => line.endsWith('WS← restored')), 10_000)
      events.push(`${at()} 복원 답 ${answer.status()} 건넴`)
      await route.fulfill({ response: answer })
    })
    try {
      await page.goto(fx.P)
      await page.locator('.wb-shell-canvas-frame', { hasText: '바뀐 글' }).waitFor()
      await poll('소켓이 룸에 든다', async () => events.slice(), (lines) => lines.some((line) => line.endsWith('WS← joined')))
      await countBanners(page)
      await restore(page)
      await page.locator('.wb-shell-canvas-frame', { hasText: '원문' }).waitFor({ timeout: 10_000 })
      await page.waitForTimeout(1_000)
      const seen = await bannersSeen(page)
      // eslint-disable-next-line no-console
      console.log(`[답보다 먼저] ${events.join(' · ')} · 배너 선 수 ${seen}`)

      // 판 카나리아 — 신호가 답보다 먼저 닿았다.
      expect(first(events, 'WS← restored')).toBeLessThan(first(events, '복원 답 200 건넴'))
      expect({ 서버: await server(stack, alice, fx.P), 배너: seen }).toEqual({ 서버: '원문', 배너: 0 })
    } finally {
      await context.close()
    }
  })

  it('답을 받음 · 신호가 다시 읽기보다 늦게 — 배너가 한 번도 서지 않는다', async () => {
    const alice = await stack.login(stack.users.alice)
    const fx = await fixture(stack, alice, 'restore-late-signal')
    const delay = await stack.startDownDelay(DELAY_MS)
    const { context, page } = await stack.openTab(stack.users.alice, { origin: delay.origin })
    const { lines: events, at } = watch(page)
    try {
      await page.goto(fx.P)
      await page.locator('.wb-shell-canvas-frame', { hasText: '바뀐 글' }).waitFor()
      await poll('앨리스의 WS 가 늦춰진 채 붙는다', async () => delay.delayed(), (n) => n >= 1)
      await poll('소켓이 룸에 든다', async () => events.slice(), (lines) => lines.some((line) => line.endsWith('WS← joined')), 10_000)
      await countBanners(page)
      await restore(page)
      await page.locator('.wb-shell-canvas-frame', { hasText: '원문' }).waitFor({ timeout: 10_000 })
      await poll('신호가 늦게 닿는다', async () => events.slice(), (lines) => lines.some((line) => line.endsWith('WS← restored')), 10_000)
      await page.waitForTimeout(1_000)
      const seen = await bannersSeen(page)
      // eslint-disable-next-line no-console
      console.log(`[다시 읽기보다 늦게] ${events.join(' · ')} · 배너 선 수 ${seen}`)

      // 판 카나리아 — 신호는 답과 다시 읽기의 페이지 조회 뒤에 닿았다.
      expect(first(events, 'WS← restored')).toBeGreaterThan(last(events, 'GET page'))
      expect(last(events, 'GET page')).toBeGreaterThan(first(events, '복원 답 200'))
      expect({ 서버: await server(stack, alice, fx.P), 배너: seen }).toEqual({ 서버: '원문', 배너: 0 })
    } finally {
      await context.close()
      await delay.close()
    }
  })

  /**
   * **F1** — 답을 잃으면 «모른다»가 서고(`editor-restore-unanswered.test.ts`), 그 단추의 다시 읽기가 배너를 걷는다. 답을 잃었다는 것은 서버가
   * 아직 처리 중일 수 있다는 뜻이라, 다시 읽은 **뒤에** 커밋되면 그 신호만이 화면이 낡았다는 것을 안다. 연결을 빼던 판에서는 서버 `원문` ·
   * 캔버스 «바뀐 글» · 배너 없음 · `WS← restored` 없음이었다.
   */
  it('답을 잃음 · 다시 읽기보다 늦게 커밋 — 배너가 다시 서고, 그 단추가 화면을 서버 판으로 맞춘다', async () => {
    const alice = await stack.login(stack.users.alice)
    const fx = await fixture(stack, alice, 'restore-late-commit')
    const { context, page } = await stack.openTab(stack.users.alice)
    const { lines: events, at } = watch(page)
    const hold = await stack.holdRow('pages', fx.pageId)
    let released = false
    // **서버로는 보내고 브라우저에는 끊는다** — 서버에 선 요청은 행을 놓을 때 커밋된다.
    let late: Promise<number> | undefined
    await page.route('**/restore', async (route) => {
      late = route.fetch({ timeout: 60_000 }).then((answer) => {
        events.push(`${at()} 늦은 커밋 ${answer.status()}`)
        return answer.status()
      })
      await hold.waitForWaiters(1)
      events.push(`${at()} 복원이 서버에 섰다 · 브라우저에는 끊김`)
      await route.abort('connectionreset')
    })
    try {
      await page.goto(fx.P)
      await page.locator('.wb-shell-canvas-frame', { hasText: '바뀐 글' }).waitFor()
      await poll('소켓이 룸에 든다', async () => events.slice(), (lines) => lines.some((line) => line.endsWith('WS← joined')))
      await restore(page)
      await poll('답을 잃은 배너가 선다', async () => banner(page), (shown) => shown, 10_000)

      // 사람이 배너의 단추로 다시 읽는다 — 서버는 아직 복원 전이다(행을 쥐었다).
      await page.locator('.wb-shell-remote-alert').getByRole('button', { name: '다시 불러오기' }).click()
      await poll('배너가 걷힌다', async () => banner(page), (shown) => !shown, 10_000)
      await page.waitForTimeout(500)
      const reread = { 서버: await server(stack, alice, fx.P), 캔버스: await canvas(page), 배너: await banner(page) }

      await hold.release()
      released = true
      expect(await late).toBe(200)
      await page.waitForTimeout(2_000)
      const after = { 서버: await server(stack, alice, fx.P), 캔버스: await canvas(page), 배너: await banner(page) }
      const statuses = await page.locator('[role=status]').allTextContents()
      // eslint-disable-next-line no-console
      console.log(`[늦은 커밋] ${events.join(' · ')} · 다시 읽은 뒤 ${JSON.stringify(reread)} · 커밋 뒤 ${JSON.stringify(after)} · 상태줄 ${JSON.stringify(statuses)}`)

      // 판 카나리아 — 다시 읽기는 복원 앞을 읽었고, 복원은 그 뒤에 커밋됐다.
      expect(reread).toEqual({ 서버: '바뀐 글', 캔버스: expect.stringContaining('바뀐 글') as unknown as string, 배너: false })
      expect(after.서버).toBe('원문')
      // 성질 — 화면이 서버와 다르면 그렇다고 말한다(단추가 있다). 남의 복원이라고 하지 않는다.
      expect({ 맞음: after.캔버스.includes(after.서버), 배너: after.배너 }).toEqual({ 맞음: false, 배너: true })
      expect(statuses.some((text) => text.includes('다른 사람이 스냅샷을 복원했습니다'))).toBe(false)

      await page.locator('.wb-shell-remote-alert').getByRole('button', { name: '다시 불러오기' }).click()
      await page.locator('.wb-shell-canvas-frame', { hasText: '원문' }).waitFor({ timeout: 10_000 })
      await page.waitForTimeout(500)
      expect({ 캔버스: await canvas(page), 배너: await banner(page) }).toEqual({ 캔버스: expect.stringContaining('원문') as unknown as string, 배너: false })
    } finally {
      if (!released) await hold.release()
      await late?.catch(() => undefined)
      await context.close()
    }
  })
})

/** `원문`을 스냅샷 v1 에 얼리고 `바뀐 글`로 고친 페이지. */
async function fixture(stack: EditorStack, owner: Session, slug: string): Promise<{ P: string; pageId: string }> {
  const call = (method: string, path: string, body?: unknown) => stack.request(owner, method, path, body)
  const project = created(await call('POST', '/projects', { name: '복원 차례', slug: `${slug}-${Date.now().toString(36)}` }))
  const menu = created(await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '메뉴' }))
  const target = created(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '페이지' }))
  const P = `/projects/${project.id}/pages/${target.id}`
  const seeded = await call('PATCH', `${P}/ops`, {
    baseSeq: 0,
    ops: [{ op: 'add', path: '/root/children/0', value: { id: 'n_text000001', type: 'Text', props: { content: '원문' } } }],
  })
  if (seeded.status >= 300) throw new Error(`픽스처 ops ${seeded.status}`)
  created(await call('POST', `/projects/${project.id}/snapshots`, { tag: 'v1' }))
  const changed = await call('PATCH', `${P}/ops`, {
    baseSeq: 1,
    ops: [{ op: 'replace', path: '/root/children/0/props/content', value: '바뀐 글' }],
  })
  if (changed.status >= 300) throw new Error(`픽스처 ops ${changed.status}`)
  return { P, pageId: target.id }
}

/** 이 탭이 받은 것의 차례 — `joined` · `restored` 프레임, 복원 답, 페이지 조회. 줄 머리는 시작부터 ms 다. */
function watch(page: Page): { lines: string[]; at(): number } {
  const t0 = Date.now()
  const lines: string[] = []
  const at = (): number => Date.now() - t0
  page.on('websocket', (ws) => {
    ws.on('framereceived', (frame) => {
      const kind = /"type":"(joined|restored)"/.exec(String(frame.payload))?.[1]
      if (kind !== undefined) lines.push(`${at()} WS← ${kind}`)
    })
  })
  page.on('response', (response) => {
    if (response.url().includes('/restore')) lines.push(`${at()} 복원 답 ${response.status()}`)
  })
  page.on('request', (request) => {
    if (request.method() === 'GET' && /\/api\/projects\/[^/]+\/pages\/[^/?]+$/.test(request.url())) lines.push(`${at()} GET page`)
  })
  return { lines, at }
}

/** 꼬리가 `tail`인 첫 줄 · 끝 줄의 자리(없으면 -1) — 줄 머리의 ms 없이 견준다. */
function first(lines: string[], tail: string): number {
  return lines.findIndex((line) => line.endsWith(tail))
}

function last(lines: string[], tail: string): number {
  for (let index = lines.length - 1; index >= 0; index -= 1) if (lines[index]!.endsWith(tail)) return index
  return -1
}

async function restore(page: Page): Promise<void> {
  await page.getByRole('button', { name: '스냅샷' }).click()
  await page.getByRole('button', { name: '이 상태로 되돌리기' }).click()
  await page.getByRole('button', { name: '되돌린다' }).click()
}

/** 복원 배너(«다시 불러오기» 단추가 있는 머리 통지)가 DOM 에 선 횟수를 세기 시작한다. */
async function countBanners(page: Page): Promise<void> {
  await page.evaluate(() => {
    const box = window as unknown as { __restoreBanners: number }
    box.__restoreBanners = 0
    let present = false
    new MutationObserver(() => {
      const now = document.querySelector('.wb-shell-remote-alert .wb-shell-remote-reload') !== null
      if (now && !present) box.__restoreBanners += 1
      present = now
    }).observe(document.body, { childList: true, subtree: true, characterData: true })
  })
}

async function bannersSeen(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __restoreBanners: number }).__restoreBanners)
}

async function server(stack: EditorStack, session: Session, P: string): Promise<string> {
  const detail = await stack.request(session, 'GET', P)
  return String(detail.body?.schema?.root?.children?.[0]?.props?.content)
}

async function canvas(page: Page): Promise<string> {
  return (await page.locator('.wb-shell-canvas-frame').textContent()) ?? ''
}

async function banner(page: Page): Promise<boolean> {
  return (await page.locator('.wb-shell-remote-alert', { hasText: '다시 불러오기' }).count()) > 0
}

function created(response: { status: number; body: any }): { id: string } {
  if (response.status !== 201) throw new Error(`픽스처 ${response.status} ${JSON.stringify(response.body)}`)
  return response.body
}
