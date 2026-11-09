/**
 * **코멘트 목록의 실시간 갱신 — 실브라우저 두 사람 판.** 앨리스는 페이지를 연 채 아무것도 안 하고, 밥이 자기 탭(다른 컨텍스트 · 다른 사람)에서
 * 단다 · 고친다 · 지운다. 앨리스의 두 자리(«코멘트» 탭 · «컴포넌트» 탭의 «코멘트» 묶음)가 그 목록으로 서는지 서버 값과 화면으로 잰다.
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | «코멘트» 탭 | 밥이 단 말(번호가 붙는 첫 말 · 번호가 그대로인 둘째 말) · 고친 글 · 지운 말이 앨리스의 «코멘트» 탭에 안 선다 |
 * | «컴포넌트» 탭 | 같은 걸음(밥의 REST — 앨리스가 고른 노드는 밥의 탭이 잠금으로 못 고른다)이 앨리스가 고른 노드의 «코멘트» 묶음에 안 선다 |
 * | 노드를 바꿔 고름 | 신호를 놓친 판(앨리스 탭의 `comments-changed` 를 늦춤)에서 «컴포넌트» 탭의 다른 노드를 골라도 그 노드의 말이 안 선다 |
 * | 몰아친 쓰기 | 밥의 쓰기 여섯이 몰아쳐 오면 앨리스가 쓰기마다(또는 그 이상) 목록을 다시 읽는다 |
 * | 늦은 옛 답 | 첫 다시 읽기의 답(밥의 첫 말만 든 목록)이 둘째 다시 읽기의 답(두 말)보다 늦게 와서 목록을 덮는다 |
 *
 * 앨리스가 목록을 다시 읽은 수는 그 탭이 낸 `GET …/comments` 요청 수로 센다(`page.on('request')`).
 */
import type { Page, Request } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  canvasFrame,
  delayServerFrames,
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

/** 앨리스가 아무것도 안 하고 기다리는 한도. 넘으면 그때의 화면으로 견준다 — 안 서는 판이 시간 초과가 아니라 값으로 죽게. */
const SETTLE_MS = 5_000

const COMMENTS_GET = /\/api\/projects\/[^/]+\/pages\/[^/]+\/comments$/

describe.skipIf(!전제.ok)('코멘트 목록 실시간 갱신 — 실브라우저', () => {
  let stack: EditorStack
  let alice: Session
  let bob: Session

  beforeAll(async () => {
    if (!전제.ok) return
    stack = await startEditorStack(전제)
    alice = await stack.login(stack.users.alice)
    bob = await stack.login(stack.users.bob)
  })

  afterAll(async () => {
    if (stack === undefined) return
    const { before, after } = await stack.close()
    expect(before.processes).toBeGreaterThan(0)
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  })

  const call = (m: string, p: string, b?: unknown) => stack.request(alice, m, p, b)

  /** 글 노드 둘(`n_a` · `n_b`)이 든 페이지 — bob 도 editor 다. 경로(`/projects/…/pages/…`)를 낸다. */
  async function seed(slug: string): Promise<string> {
    const project = (await call('POST', '/projects', { name: '코멘트 실시간', slug: `${slug}-${Date.now().toString(36)}` })).body
    const member = await call('POST', `/projects/${project.id}/members`, { email: stack.users.bob.email, role: 'editor' })
    if (member.status >= 300) throw new Error(`member ${member.status}`)
    const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '가' })).body
    const pageId = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '쪽' })).body.id
    const P = `/projects/${project.id}/pages/${pageId}`
    const nodes = [
      { id: 'n_a', type: 'Text', props: { content: '가 글 노드입니다' } },
      { id: 'n_b', type: 'Text', props: { content: '나 글 노드입니다' } },
    ]
    const seeded = await call('PATCH', `${P}/ops`, {
      baseSeq: 0,
      ops: nodes.map((value, at) => ({ op: 'add', path: `/root/children/${at}`, value })),
    })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
    return P
  }

  /** 서버의 코멘트 본문 — 만든 차례. */
  async function serverBodies(P: string): Promise<string[]> {
    return ((await call('GET', `${P}/comments`)).body as { body: string }[]).map((row) => row.body)
  }

  interface Tab {
    page: Page
    /** 이 탭이 낸 코멘트 목록 조회 수(`GET …/comments`). */
    reads(): number
    close(): Promise<void>
  }

  /**
   * 그 사람의 탭을 열고 실시간 룸에 들기(`joined`)를 기다린다 — 그 전의 신호는 이 탭에 안 온다. `before` 는 `goto` 앞에 돈다(`delayServerFrames`).
   * 가로챈 소켓(`routeWebSocket`)은 `page.on('websocket')` 에 안 잡혀, 그 판은 `joined` 를 부르는 쪽이 준다.
   */
  async function open(user: 'alice' | 'bob', P: string, before?: (page: Page) => Promise<() => boolean>): Promise<Tab> {
    const { context, page } = await stack.openTab(stack.users[user], { viewport: { width: 1920, height: 900 } })
    let reads = 0
    page.on('request', (request: Request) => {
      if (request.method() === 'GET' && COMMENTS_GET.test(new URL(request.url()).pathname)) reads += 1
    })
    let joinedSeen = false
    page.on('websocket', (socket) => {
      socket.on('framereceived', (frame) => {
        if (typeof frame.payload === 'string' && frame.payload.includes('"type":"joined"')) joinedSeen = true
      })
    })
    const joined = (await before?.(page)) ?? (() => joinedSeen)
    await page.goto(P)
    await canvasFrame(page).locator('[data-wb-id="n_b"]').waitFor()
    await poll(`${user} 가 룸에 든다`, async () => joined(), Boolean, 15_000)
    return { page, reads: () => reads, close: () => context.close() }
  }

  async function selectedTab(page: Page): Promise<string> {
    return ((await page.locator('[role="tab"][aria-selected="true"]').textContent()) ?? '').trim()
  }

  async function tab(page: Page, name: string): Promise<void> {
    await page.getByRole('tab', { name, exact: true }).click()
    await poll(
      `${name} 탭`,
      () => selectedTab(page),
      (v) => v === name,
    )
  }

  async function selectedId(page: Page): Promise<string | null> {
    return page.evaluate(
      () =>
        document.querySelector('.wb-shell-structure-node[aria-current="true"]')?.closest('[data-tree-row]')?.getAttribute('data-tree-id') ??
        null,
    )
  }

  /** 구조 트리 줄을 눌러 고른다 — 우측 탭을 안 옮긴다. */
  async function pickRow(page: Page, id: string): Promise<void> {
    await page.locator(`.wb-shell-region[aria-label="구조 트리"] [data-tree-row][data-tree-id="${id}"] .wb-shell-structure-node`).click()
    await poll(
      `${id} 를 고른다`,
      () => selectedId(page),
      (v) => v === id,
    )
  }

  /** 지금 탭 판에 보이는 코멘트 본문 — 문서 차례. */
  async function bodies(page: Page): Promise<string[]> {
    return page.locator('[role="tabpanel"] .wb-shell-comment-body').allTextContents()
  }

  /** 앨리스의 화면이 `want` 가 될 때까지 `SETTLE_MS` 기다리고 그때의 화면을 낸다 — 안 서면 던지지 않는다(단언이 값으로 죽는다). */
  async function settle(page: Page, want: string[]): Promise<string[]> {
    const until = Date.now() + SETTLE_MS
    const from = Date.now()
    let seen = await bodies(page)
    while (JSON.stringify(seen) !== JSON.stringify(want) && Date.now() < until) {
      await page.waitForTimeout(50)
      seen = await bodies(page)
    }
    // 잰 값 — 걸음 뒤 앨리스의 화면이 서기까지(보고에 옮긴다).
    // eslint-disable-next-line no-console
    console.log(`[comment-live] ${JSON.stringify(want)} ${Date.now() - from}ms`)
    return seen
  }

  const panel = (page: Page) => page.locator('[role="tabpanel"]')

  /** 밥이 자기 탭에서 고른 노드에 단다 — 서버에 서기를 기다린다. */
  async function bobPosts(bobTab: Tab, P: string, body: string): Promise<void> {
    await panel(bobTab.page).getByLabel('새 코멘트', { exact: true }).fill(body)
    await panel(bobTab.page).getByRole('button', { name: '코멘트 달기' }).click()
    await poll(
      `«${body}» 가 서버에 선다`,
      () => serverBodies(P),
      (rows) => rows.includes(body),
    )
  }

  async function bobEdits(bobTab: Tab, P: string, from: string, to: string): Promise<void> {
    const row = panel(bobTab.page).locator('.wb-shell-comment').filter({ hasText: from })
    await row.getByRole('button', { name: '수정' }).click()
    await row.getByLabel('코멘트 수정', { exact: true }).fill(to)
    await row.getByRole('button', { name: '저장' }).click()
    await poll(
      `«${to}» 로 고쳐 선다`,
      () => serverBodies(P),
      (rows) => rows.includes(to) && !rows.includes(from),
    )
  }

  async function bobDeletes(bobTab: Tab, P: string, body: string): Promise<void> {
    await panel(bobTab.page)
      .locator('.wb-shell-comment')
      .filter({ hasText: body })
      .getByRole('button', { name: '삭제', exact: true })
      .click()
    await poll(
      `«${body}» 가 서버에서 빠진다`,
      () => serverBodies(P),
      (rows) => !rows.includes(body),
    )
  }

  /** 밥이 쓰는 길 — 자기 탭의 «코멘트» 탭(UI)이거나, 자기 세션의 REST(MCP · CLI 가 쓰는 길 — 연결 id 를 안 싣는다). */
  interface BobHand {
    post(body: string): Promise<void>
    edit(from: string, to: string): Promise<void>
    remove(body: string): Promise<void>
  }

  /** 밥의 탭 UI — «코멘트» 탭에서 `n_a` 를 고른 채 쓴다. */
  async function bobUi(bobTab: Tab, P: string): Promise<BobHand> {
    await tab(bobTab.page, '코멘트')
    await pickRow(bobTab.page, 'n_a')
    return {
      post: (body) => bobPosts(bobTab, P, body),
      edit: (from, to) => bobEdits(bobTab, P, from, to),
      remove: (body) => bobDeletes(bobTab, P, body),
    }
  }

  /** 밥의 REST — 고른 노드의 잠금과 무관하게 `n_a` 에 쓴다(앨리스가 `n_a` 를 고르면 밥의 탭은 그 노드를 못 고른다). */
  function bobRest(P: string): BobHand {
    const idOf = async (body: string): Promise<string> =>
      ((await stack.request(bob, 'GET', `${P}/comments`)).body as { id: string; body: string }[]).find((row) => row.body === body)!.id
    return {
      post: async (body) => expect((await stack.request(bob, 'POST', `${P}/comments`, { nodeId: 'n_a', body })).status).toBe(201),
      edit: async (from, to) =>
        expect((await stack.request(bob, 'PATCH', `${P}/comments/${await idOf(from)}`, { body: to })).status).toBe(200),
      remove: async (body) => expect((await stack.request(bob, 'DELETE', `${P}/comments/${await idOf(body)}`)).status).toBe(200),
    }
  }

  /**
   * 밥의 걸음 다섯(번호가 붙는 첫 말 · 번호가 그대로인 둘째 말 · 고침 · 마지막이 아닌 삭제 · 마지막 삭제)마다 앨리스의 화면을 적는다.
   */
  async function bobWalk(aliceTab: Tab, hand: BobHand): Promise<Record<string, string[]>> {
    const seen: Record<string, string[]> = {}
    await hand.post('밥 첫말')
    seen['단다 · 번호 붙음'] = await settle(aliceTab.page, ['밥 첫말'])
    await hand.post('밥 둘째')
    seen['단다 · 번호 그대로'] = await settle(aliceTab.page, ['밥 첫말', '밥 둘째'])
    await hand.edit('밥 첫말', '밥 첫말 고침')
    seen['고친다'] = await settle(aliceTab.page, ['밥 첫말 고침', '밥 둘째'])
    await hand.remove('밥 둘째')
    seen['지운다 · 마지막 아님'] = await settle(aliceTab.page, ['밥 첫말 고침'])
    await hand.remove('밥 첫말 고침')
    seen['지운다 · 마지막'] = await settle(aliceTab.page, [])
    return seen
  }

  const WALK = {
    '단다 · 번호 붙음': ['밥 첫말'],
    '단다 · 번호 그대로': ['밥 첫말', '밥 둘째'],
    고친다: ['밥 첫말 고침', '밥 둘째'],
    '지운다 · 마지막 아님': ['밥 첫말 고침'],
    '지운다 · 마지막': [],
  }

  it('밥이 단다 · 고친다 · 지운다 → 앨리스의 «코멘트» 탭이 아무것도 안 해도 그 목록으로 선다', async () => {
    const P = await seed('cl-comments')
    const aliceTab = await open('alice', P)
    const bobTab = await open('bob', P)
    try {
      await tab(aliceTab.page, '코멘트')
      // 카나리아 — 판이 섰다(빈 목록).
      await panel(aliceTab.page).getByText('아직 코멘트가 없습니다').waitFor()
      const readsBefore = aliceTab.reads()
      expect(await bobWalk(aliceTab, await bobUi(bobTab, P))).toEqual(WALK)
      // eslint-disable-next-line no-console
      console.log(`[comment-live] 걸음 다섯의 다시 읽기 ${aliceTab.reads() - readsBefore}`)
      // 폭주 없음 — 걸음 다섯에 다시 읽기가 걸음 수의 두 배를 안 넘는다.
      expect(aliceTab.reads() - readsBefore).toBeLessThanOrEqual(10)
    } finally {
      await bobTab.close()
      await aliceTab.close()
    }
  })

  it('밥이 단다 · 고친다 · 지운다 → 앨리스가 고른 노드의 «컴포넌트» 탭 «코멘트» 묶음이 그 목록으로 선다', async () => {
    const P = await seed('cl-component')
    const aliceTab = await open('alice', P)
    try {
      await tab(aliceTab.page, '컴포넌트')
      await pickRow(aliceTab.page, 'n_a')
      // 카나리아 — 묶음이 섰다(비어 있다).
      await panel(aliceTab.page).getByText('이 노드에 단 코멘트가 없습니다').waitFor()
      expect(await bobWalk(aliceTab, bobRest(P))).toEqual(WALK)
      expect(await selectedTab(aliceTab.page)).toBe('컴포넌트')
    } finally {
      await aliceTab.close()
    }
  })

  it('«컴포넌트» 탭에서 다른 노드를 고르면 그 노드의 목록이 선다 — 신호를 놓쳐도(같은 마운트)', async () => {
    const P = await seed('cl-pick')
    let delay: Awaited<ReturnType<typeof delayServerFrames>> | undefined
    // 앨리스 탭의 코멘트 신호를 이 케이스 동안 안 닿게 늦춘다 — 다시 읽기는 노드를 바꿔 고른 것만이 낸다.
    const aliceTab = await open('alice', P, async (page) => {
      const frames = await delayServerFrames(page, ['comments-changed'], 60_000)
      delay = frames
      return () => frames.delivered().some((frame) => frame.type === 'joined')
    })
    try {
      await tab(aliceTab.page, '컴포넌트')
      await pickRow(aliceTab.page, 'n_a')
      await panel(aliceTab.page).getByText('이 노드에 단 코멘트가 없습니다').waitFor()
      const posted = await stack.request(bob, 'POST', `${P}/comments`, { nodeId: 'n_b', body: '밥이 나에 단 말' })
      expect(posted.status).toBe(201)
      await pickRow(aliceTab.page, 'n_b')
      const seen = await settle(aliceTab.page, ['밥이 나에 단 말'])
      expect({ seen, 탭: await selectedTab(aliceTab.page) }).toEqual({ seen: ['밥이 나에 단 말'], 탭: '컴포넌트' })
      // 카나리아 — 신호가 늦춰져 이 판이 신호 없이 섰다(서버가 신호를 냈다면 1, 안 냈다면 0 — 고치기 전 판).
      expect(delay!.delayed()).toBeLessThanOrEqual(1)
    } finally {
      await aliceTab.close()
    }
  })

  it('밥의 쓰기 여섯이 몰아쳐 오면 앨리스는 묶어서 다시 읽는다', async () => {
    const P = await seed('cl-burst')
    const aliceTab = await open('alice', P)
    try {
      await tab(aliceTab.page, '코멘트')
      await panel(aliceTab.page).getByText('아직 코멘트가 없습니다').waitFor()
      // 탭을 연 조회가 끝날 틈.
      await aliceTab.page.waitForTimeout(500)
      const readsBefore = aliceTab.reads()
      for (let i = 1; i <= 6; i += 1) {
        const body = `몰아친 말 ${i}`
        expect((await stack.request(bob, 'POST', `${P}/comments`, { nodeId: i % 2 === 0 ? 'n_a' : 'n_b', body })).status).toBe(201)
      }
      // 번호 차례로 무리를 짓는다 — 먼저 단 `n_b`(번호 1 · 말 1 · 3 · 5) 뒤 `n_a`(번호 2 · 말 2 · 4 · 6).
      const grouped = ['몰아친 말 1', '몰아친 말 3', '몰아친 말 5', '몰아친 말 2', '몰아친 말 4', '몰아친 말 6']
      expect(await settle(aliceTab.page, grouped)).toEqual(grouped)
      await aliceTab.page.waitForTimeout(500)
      const reads = aliceTab.reads() - readsBefore
      // eslint-disable-next-line no-console
      console.log(`[comment-live] 몰아친 쓰기 여섯의 다시 읽기 ${reads}`)
      // 카나리아 — 신호로 다시 읽었다. 폭주 없음 — 쓰기 여섯에 다시 읽기 셋 이하.
      expect(reads).toBeGreaterThan(0)
      expect(reads).toBeLessThanOrEqual(3)
    } finally {
      await aliceTab.close()
    }
  })

  it('첫 다시 읽기의 답이 둘째 답보다 늦게 와도 목록을 덮지 않는다', async () => {
    const P = await seed('cl-late')
    const aliceTab = await open('alice', P)
    try {
      await tab(aliceTab.page, '코멘트')
      await panel(aliceTab.page).getByText('아직 코멘트가 없습니다').waitFor()
      await aliceTab.page.waitForTimeout(500)
      let held = 0
      let released = false
      let release: () => void = () => {}
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      // 다음 조회 하나만 붙잡는다 — 답은 그때 서버에서 읽고(밥의 첫 말만 든 목록) 내주기를 늦춘다.
      await aliceTab.page.route(
        (url) => COMMENTS_GET.test(url.pathname),
        async (route) => {
          if (route.request().method() !== 'GET' || held > 0) return route.continue()
          held += 1
          const response = await route.fetch()
          await gate
          await route.fulfill({ response })
          released = true
        },
      )
      expect((await stack.request(bob, 'POST', `${P}/comments`, { nodeId: 'n_a', body: '첫 말' })).status).toBe(201)
      await poll(
        '첫 다시 읽기를 붙잡았다',
        async () => held,
        (v) => v === 1,
      )
      // 붙잡은 조회가 서버에서 읽을 틈 — 그 답은 «첫 말» 만 든다.
      await aliceTab.page.waitForTimeout(300)
      expect((await stack.request(bob, 'POST', `${P}/comments`, { nodeId: 'n_a', body: '둘째 말' })).status).toBe(201)
      const before = await settle(aliceTab.page, ['첫 말', '둘째 말'])
      release()
      await poll(
        '붙잡은 답을 내줬다',
        async () => released,
        (v) => v,
      )
      await aliceTab.page.waitForTimeout(500)
      expect({ before, after: await bodies(aliceTab.page) }).toEqual({ before: ['첫 말', '둘째 말'], after: ['첫 말', '둘째 말'] })
    } finally {
      await aliceTab.close()
    }
  })
})
