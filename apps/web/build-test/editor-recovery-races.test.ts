/**
 * **수습 · 재연결 · 다시 읽기가 겹칠 때 화면이 서버와 갈린 채 말없이 남지 않는다** — 판 셋.
 *
 * | 판 | 겹치는 것 | 막는 장치 |
 * |---|---|---|
 * | 두 조회 겹침 | 끊겨 답을 못 받은 편집의 수습 조회가 도는 사이 재연결 조회가 «판이 같다»로 넘어간다 | 재연결의 «같은 판» 판정이 화면까지 본다(`store/editor-store.ts` 의 `holdsServerPage`) |
 * | 리베이스 뒤 이동 | 리베이스가 버린 1쪽 편집의 거절이 2쪽으로 옮긴 뒤에 온다 | **두 겹이 각각 혼자 막는다** — 떠날 때 나가 있던 편집을 떠남으로 적어 전송 루프가 그 거절을 거르고(`EditorStore.wasAbandoned`), 거기를 지나도 수습이 그 편집이 나간 큐가 지금 큐일 때만 돈다(`sentFromOpenQueue`). 둘 다 떼야 이 판이 죽는다 — 큐 가드 혼자의 축(같은 페이지를 다시 실은 뒤 · 떠났다 돌아온 뒤의 거절)은 jsdom 이 잰다 |
 * | 창 안 ack | 다시 읽는 조회가 커밋 앞을 읽은 사이 내 편집의 ack 가 온다 | 창 안의 ack 를 실린 판과 견줘 `gap` 을 말한다(`#windowAcks`) |
 *
 * **단언은 증상 문장이 아니라 성질이다** — 화면이 서버와 같거나, 다르면 낡았다고 말한다(`CLAUDE.md` «퇴행을 재는 케이스는 옛 증상
 * 문장이 아니라 성질로 단언한다»). 서버 값은 한도 안에 기다린 뒤 그때의 값으로 견준다 — 막는 장치를 떼면 한도를 넘겨 타임아웃으로
 * 죽는 것이 아니라 화면 ≠ 서버로 죽는다.
 *
 * 판이 섰는지는 판마다 로그로 본다 — 붙잡은 조회가 정말 읽혔는가 · 그 사이 재연결 조회가 흘렀는가 · 편집이 행에 줄 섰는가 · ack 가
 * 창 안에 닿았는가. 안 섰으면 던진다. jsdom 판은 `apps/web/test/edit/reload-sent-edits.test.tsx` 가 든다.
 */
import type { Page, Route } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { editorStackPrerequisite, poll, startEditorStack, type EditorStack, type Session, canvasFrame, canvasText } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

/** 판이 선 뒤 서버 값을 기다리는 한도 — 넘기면 그때 값으로 견준다(머리말). */
const SETTLE_MS = 5_000

describe.skipIf(!전제.ok)('수습 · 재연결 · 다시 읽기의 겹침', () => {
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

  /**
   * 편집이 서버에 안 닿은 채 WS 가 끊긴다(브라우저 → 서버 바이트를 버린 뒤 RST) → «모름» → 수습 조회. 그 답을 붙잡은 사이 WS 가 다시
   * 붙고 재연결 조회가 서버 판(편집 앞 그대로)을 읽는다. 재연결이 «판이 같다»로 넘어가고 수습의 답이 세대에 밀리면 서버에 없는 편집이
   * 화면에 남는다.
   */
  it('끊긴 편집의 수습 조회가 도는 사이 재연결 조회가 끝나도 화면은 서버 판이다(두 조회 겹침)', async () => {
    const alice = await stack.login(stack.users.alice)
    const fx = await fixture(stack, alice, 'superseded', { bob: null, first: [text('n_text000001', '원문')] })
    const cut = await stack.startCutProxy()
    const { context, page } = await stack.openTab(stack.users.alice, { origin: cut.origin })
    const log = watch(page, fx)
    try {
      const reads = holdReads(page, fx.P1, log)
      await page.goto(fx.P1)
      const box = await selectFirstText(page, '원문')
      await box.click()
      await box.fill('앨리스가 친 글')
      expect(cut.blackhole(/\/ws[ ?]/)).toBeGreaterThanOrEqual(1)
      await box.evaluate((element) => (element as HTMLElement).blur())
      await poll('편집 프레임이 나간다(서버에는 안 닿는다)', async () => log.lines.slice(), (lines) => lines.includes('WS→ patch 1쪽 baseSeq=1'))

      reads.arm()
      expect(cut.reset(/\/ws[ ?]/)).toBeGreaterThanOrEqual(1)
      await reads.held
      // 판이 섰는가 — 붙잡은 수습 조회 뒤에 재연결 조회가 읽혀 흘렀다.
      await poll('재연결 조회가 흐른다', async () => log.lines.slice(), (lines) => lines.lastIndexOf('GET 흘림 head 1') > lines.indexOf('GET 읽힘 head 1 — 답 쥠'), 15_000)
      reads.release()

      const shown = await stable(page)
      const landed = await server(stack, alice, fx.P1)
      // eslint-disable-next-line no-console
      console.log(`[두 조회 겹침] ${log.lines.join(' · ')} · 화면 ${JSON.stringify(shown)} · 서버 ${JSON.stringify(landed)}`)
      expect(landed).toEqual({ head: 1, content: ['원문'] })
      expect({ 캔버스: shown.canvas, 친글이남음: shown.canvas.includes('앨리스가 친 글') }).toEqual({
        캔버스: expect.stringContaining('원문'),
        친글이남음: false,
      })
    } finally {
      await context.close()
      await cut.close()
    }
  })

  /**
   * 1쪽 편집(글 삭제)이 행에 줄 선 사이 밥이 앞 형제를 지워 커밋한다 — 리베이스가 그 편집을 버린다. 앨리스는 2쪽으로 옮겨 글을 고친다
   * (전송 루프는 1쪽 편집의 답을 기다려 2쪽 편집은 아직 안 나간다). 그 뒤 1쪽 편집이 409 를 받는다. 수습이 지금 큐(2쪽)를 비우면
   * 2쪽 편집은 한 번도 안 나간 채 화면에만 남는다.
   *
   * 줄: 쥔 연결 ← 밥의 삭제 ← 둘째로 쥘 연결 ← 앨리스의 삭제. 첫째를 놓으면 밥이 커밋하고 둘째가 쥐어 앨리스를 계속 붙잡는다.
   */
  it('리베이스가 버린 편집의 거절이 페이지를 옮긴 뒤에 와도 옮겨 간 페이지의 편집은 서버에 닿는다(리베이스 뒤 이동)', async () => {
    const alice = await stack.login(stack.users.alice)
    const bob = await stack.login(stack.users.bob)
    const fx = await fixture(stack, alice, 'rebase-nav', {
      bob: 'editor',
      first: [{ op: 'add', path: '/root/children/0', value: { id: 'n_zero000001', type: 'Divider', props: {} } }, text('n_one0000001', '1쪽 글', 1)],
      second: [text('n_two0000001', '2쪽 원문')],
    })
    const { context, page } = await stack.openTab(stack.users.alice)
    const log = watch(page, fx)
    try {
      await page.goto(fx.P1)
      await selectFirstText(page, '1쪽 글')

      const first = await stack.holdRow('pages', fx.first)
      const bobs = stack.request(bob, 'PATCH', `${fx.P1}/ops`, { baseSeq: 1, ops: [{ op: 'remove', path: '/root/children/0' }] })
      await first.waitForWaiters(1)
      const second = await stack.queueRow('pages', fx.first)
      await first.waitForWaiters(2)
      await page.getByRole('group', { name: '구조 편집' }).getByRole('button', { name: '삭제' }).click()
      await first.waitForWaiters(3)
      await first.release()
      expect((await bobs).status).toBe(200)
      await second.acquired
      await poll('밥의 프레임이 닿는다(리베이스)', async () => log.lines.slice(), (lines) => lines.includes('WS← page-changed seq 2'))

      await page.getByRole('link', { name: '둘째' }).click()
      const box = await selectFirstText(page, '2쪽 원문')
      await box.click()
      await box.fill('2쪽에 친 글')
      await box.evaluate((element) => (element as HTMLElement).blur())
      await canvasFrame(page).locator('body', { hasText: '2쪽에 친 글' }).waitFor()
      // 판이 섰는가 — 1쪽 편집은 아직 행에 서 있고 2쪽 편집은 안 나갔다.
      expect(log.lines.filter((line) => line.startsWith('WS→'))).toEqual(['WS→ patch 1쪽 baseSeq=1'])
      await second.release()

      await poll('1쪽 편집의 거절이 닿는다', async () => log.lines.slice(), (lines) => lines.includes('WS← patch-error status 409'))
      const landed = await pollOrLast(() => server(stack, alice, fx.P2), (value) => value.head === 2)
      const shown = await stable(page)
      // eslint-disable-next-line no-console
      console.log(`[리베이스 뒤 이동] ${log.lines.join(' · ')} · 화면 ${JSON.stringify(shown)} · 서버 2쪽 ${JSON.stringify(landed)}`)
      expect({ 서버2쪽: landed, 화면에친글: shown.canvas.includes('2쪽에 친 글') }).toEqual({
        서버2쪽: { head: 2, content: ['2쪽에 친 글'] },
        화면에친글: true,
      })
      expect(await server(stack, alice, fx.P1)).toEqual({ head: 2, content: ['1쪽 글'] })
    } finally {
      await context.close()
    }
  })

  /**
   * 남의 복원 뒤 배너 «다시 불러오기»의 조회가 복원 판을 읽고 답만 붙잡힌 사이, 앨리스가 글을 고쳐 커밋하고 ack 를 받는다. 옛 답이
   * 실리면 화면은 그 편집 앞이다 — 서버에는 있다. 조용히 그러면 다음 편집이 옛 번호로 나가 409 로 취소된다.
   */
  it('다시 읽는 조회의 창 안에서 ack 된 내 편집이 실린 판에 없으면 낡았다고 말한다(창 안 ack)', async () => {
    const alice = await stack.login(stack.users.alice)
    const bob = await stack.login(stack.users.bob)
    const fx = await fixture(stack, alice, 'window-ack', { bob: 'owner', first: [text('n_text000001', '원문')] })
    const snapshot = await stack.request(alice, 'POST', `/projects/${fx.projectId}/snapshots`, { tag: 'window-ack' })
    if (snapshot.status !== 201) throw new Error(`픽스처 snapshot ${snapshot.status} ${JSON.stringify(snapshot.body)}`)
    const { context, page } = await stack.openTab(stack.users.alice)
    const log = watch(page, fx)
    try {
      const reads = holdReads(page, fx.P1, log)
      await page.goto(fx.P1)
      await canvasFrame(page).locator('body', { hasText: '원문' }).waitFor()
      const restored = await stack.request(bob, 'POST', `/projects/${fx.projectId}/snapshots/${snapshot.body.id}/restore`)
      expect(restored.status).toBe(200)
      const reload = page.getByRole('button', { name: '다시 불러오기' })
      await reload.waitFor()

      reads.arm()
      await reload.click()
      await reads.held
      const box = await selectFirstText(page, '원문')
      await box.click()
      await box.fill('창 안에서 친 글')
      await box.evaluate((element) => (element as HTMLElement).blur())
      // 판이 섰는가 — 그 편집의 ack 가 붙잡은 답보다 먼저 닿았다.
      await poll('ack 가 창 안에 닿는다', async () => log.lines.slice(), (lines) => lines.includes('WS← patch-ack seq 2'))
      reads.release()

      const shown = await stable(page)
      const landed = await server(stack, alice, fx.P1)
      // eslint-disable-next-line no-console
      console.log(`[창 안 ack] ${log.lines.join(' · ')} · 화면 ${JSON.stringify(shown)} · 서버 ${JSON.stringify(landed)}`)
      expect(landed).toEqual({ head: 2, content: ['창 안에서 친 글'] })
      const sameAsServer = shown.canvas.includes('창 안에서 친 글')
      const saysStale = shown.notices.some((notice) => notice.includes('화면이 최신이 아닙니다'))
      expect({ 화면이서버와같거나낡았다고말한다: sameAsServer || saysStale, 화면: shown }).toEqual({
        화면이서버와같거나낡았다고말한다: true,
        화면: shown,
      })
    } finally {
      await context.close()
    }
  })
})

interface Fixture {
  projectId: string
  first: string
  second: string
  P1: string
  P2: string
}

function text(id: string, content: string, at = 0) {
  return { op: 'add', path: `/root/children/${at}`, value: { id, type: 'Text', props: { content } } }
}

/** 프로젝트 · 메뉴 · 페이지 둘(«첫째» · «둘째»). `bob` 이 역할이면 밥을 멤버로 넣는다. 각 페이지에 ops 를 한 번에 싣는다(head 1). */
async function fixture(
  stack: EditorStack,
  owner: Session,
  slug: string,
  options: { bob: 'editor' | 'owner' | null; first: unknown[]; second?: unknown[] },
): Promise<Fixture> {
  const call = (method: string, path: string, body?: unknown) => stack.request(owner, method, path, body)
  const project = created(await call('POST', '/projects', { name: '겹침', slug: `${slug}-${Date.now().toString(36)}` }))
  if (options.bob !== null) {
    const member = await call('POST', `/projects/${project.id}/members`, { email: stack.users.bob.email, role: options.bob })
    if (member.status >= 300) throw new Error(`픽스처 member ${member.status} ${JSON.stringify(member.body)}`)
  }
  const menu = created(await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '메뉴' }))
  const first = created(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '첫째' }))
  const second = created(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '둘째' }))
  const P1 = `/projects/${project.id}/pages/${first.id}`
  const P2 = `/projects/${project.id}/pages/${second.id}`
  for (const [path, ops] of [
    [P1, options.first],
    [P2, options.second ?? []],
  ] as const) {
    if (ops.length === 0) continue
    const seeded = await call('PATCH', `${path}/ops`, { baseSeq: 0, ops })
    if (seeded.status >= 300) throw new Error(`픽스처 ops ${seeded.status} ${JSON.stringify(seeded.body)}`)
  }
  return { projectId: project.id, first: first.id, second: second.id, P1, P2 }
}

function created(response: { status: number; body: any }): { id: string } {
  if (response.status !== 201) throw new Error(`픽스처 ${response.status} ${JSON.stringify(response.body)}`)
  return response.body
}

async function server(stack: EditorStack, session: Session, path: string): Promise<{ head: number; content: string[] }> {
  const page = (await stack.request(session, 'GET', path)).body
  return {
    head: page.headSeq as number,
    content: (page.schema.root.children ?? []).filter((child: any) => child.type === 'Text').map((child: any) => child.props?.content),
  }
}

/** `done` 이 설 때까지 기다리되, 한도를 넘기면 던지지 않고 마지막 값을 낸다(머리말 — 견주는 것은 단언이다). */
async function pollOrLast<T>(read: () => Promise<T>, done: (value: T) => boolean): Promise<T> {
  const until = Date.now() + SETTLE_MS
  let last = await read()
  while (!done(last) && Date.now() < until) {
    await new Promise((resolve) => setTimeout(resolve, 100))
    last = await read()
  }
  return last
}

/** 편집 · 답 · 페이지 변경 프레임과 붙잡은 조회를 시각 순으로 적는다. */
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
      if (kind === undefined) return
      const value = /"(seq|status)":(\d+)/.exec(payload)
      lines.push(`WS← ${kind}${value === null ? '' : ` ${value[1]} ${value[2]}`}`)
    })
  })
  return { lines }
}

/**
 * `GET <path>` 을 지켜본다. `arm()` 뒤의 첫 조회는 서버에서 곧바로 읽고(`route.fetch`) 답만 쥔다 — `held` 가 읽힌 뒤 풀리고
 * `release()` 가 답을 흘린다. 그 밖의 조회는 그대로 흘리며 적는다.
 */
function holdReads(page: Page, path: string, log: { lines: string[] }): { arm(): void; held: Promise<void>; release(): void } {
  let armed = false
  let readDone!: () => void
  let letGo!: () => void
  const held = new Promise<void>((resolve) => (readDone = resolve))
  const gate = new Promise<void>((resolve) => (letGo = resolve))
  void page.route(`**/api${path}`, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    const response = await route.fetch()
    const body = await response.json()
    if (!armed) {
      log.lines.push(`GET 흘림 head ${body.headSeq}`)
      return route.fulfill({ response, json: body })
    }
    armed = false
    log.lines.push(`GET 읽힘 head ${body.headSeq} — 답 쥠`)
    readDone()
    await gate
    log.lines.push('쥔 답 흘림')
    await route.fulfill({ response, json: body })
  })
  return { arm: () => (armed = true), held, release: () => letGo() }
}

/** 구조 트리에서 첫 글 노드를 골라 속성 칸을 연다 — 캔버스가 그 글을 그린 뒤에. */
async function selectFirstText(page: Page, content: string) {
  await canvasFrame(page).locator('body', { hasText: content }).waitFor()
  await page.locator('li button', { hasText: 'Text' }).first().click()
  const box = page.locator('.wb-shell-panel textarea').first()
  await box.waitFor()
  return box
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
