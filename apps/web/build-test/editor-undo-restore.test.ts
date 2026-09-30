/**
 * **새로고침으로 채운 되돌리기가 흔한 판에서도 서고, 남의 노드는 고치지 않는다**(`EditorStore.restoreUndoStack` · `routes/editor.tsx`의
 * `restoreUndo`).
 *
 * 서버의 `inverse`는 그 revision 을 막 기록한 문서의 자리 경로다 — 그 뒤 남이 앞자리에 넣었으면 옛 자리가 남의 노드다. 그래서 스토어는 그
 * revision 의 문서를 지금 판에서 거꾸로 되짚어 노드 id 로 붙잡는다. 되짚는 길에 남의 revision 이 끼면 그 `inverse`도 받아 되짚는다 — 안 받으면
 * 내 마지막 편집 뒤에 남이 한 번만 고쳐도(코멘트 번호 포함) · 목록 응답 전에 프레임이나 내 ack 가 와도 되돌리기가 통째로 0 이 된다.
 *
 * 판 넷 — 앨리스의 revision 1(«가» · «나» 넣음) · 2(«나» → «나 고침»)가 있는 페이지:
 * 1. 밥이 맨 앞에 «밥»을 넣은 뒤(3) 앨리스가 연다.
 * 2. 밥이 «가»에 코멘트를 단 뒤(3 — 번호 revision) 앨리스가 연다.
 * 3. 앨리스가 연다 — 목록 답을 서버가 읽은 뒤 붙잡아 두고, 밥이 맨 앞에 넣은 프레임이 닿은 뒤 놓는다.
 * 4. 앨리스가 연다 — 목록 답을 붙잡아 둔 채 앨리스가 «가»를 고쳐 ack 를 받은 뒤 놓는다(세션 항목이 복원 항목 위에 남는다).
 *
 * 단언은 성질이다 — 되돌리기가 앨리스의 편집을 되돌리고(서버 값) · 남의 노드는 그대로이고 · 화면이 서버와 같다.
 *
 * **2 는 혼자 죽는 변조가 없다** — 사이 구간을 받아 되짚는 길(`EditorStore.undoHistoryNeed` · 되돌리기의 `loadUndoHistory`)을 떼면 1 · 3 과 함께
 * 죽는다. 2 가 드는 것은 번호 revision(남의 코멘트)도 남의 revision 으로 받아 되짚는다는 것이다 — 되짚기의 축은 1 이 소유한다. 세션 항목을 덮는
 * 변조에는 4 만 죽는다.
 */
import type { Page, Route } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { editorStackPrerequisite, poll, startEditorStack, type EditorStack, type Session, canvasFrame, canvasText } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

const text = (id: string, content: string) => ({ id, type: 'Text', props: { content } })

describe.skipIf(!전제.ok)('새로고침으로 채운 되돌리기', () => {
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

  it('내 마지막 편집 뒤에 남이 맨 앞에 넣은 판을 열어도 되돌리기가 내 편집을 되돌리고 남의 노드는 그대로다', async () => {
    const fx = await fixture(stack, 'after-other')
    const bobs = await stack.request(fx.bob, 'PATCH', `${fx.P}/ops`, { baseSeq: 2, ops: [{ op: 'add', path: '/root/children/0', value: text('n_bob0000001', '밥') }] })
    expect(bobs.status).toBe(200)

    const { context, page } = await stack.openTab(stack.users.alice)
    try {
      await page.goto(fx.P)
      await canvasFrame(page).locator('body', { hasText: '밥' }).waitFor()
      await undoOnce(page)
      const landed = await landedOrSkipped(stack, fx, page, 4)
      const after = await stable(page)
      // eslint-disable-next-line no-console
      console.log(`[남 뒤 되돌리기] 서버 ${JSON.stringify(landed)} · 앨리스 ${JSON.stringify(after)}`)
      expect(landed.content).toEqual(['밥', '가', '나'])
      expect(after.canvas).toBe('밥 가 나')
    } finally {
      await context.close()
    }
  })

  it('내 마지막 편집 뒤에 남이 코멘트를 단 판을 열어도 되돌리기가 내 편집을 되돌리고 번호는 그대로다', async () => {
    const fx = await fixture(stack, 'after-comment')
    const comment = await stack.request(fx.bob, 'POST', `/projects/${fx.projectId}/pages/${fx.pageId}/comments`, { nodeId: 'n_ga00000001', body: '밥의 코멘트' })
    expect(comment.status).toBe(201)
    const numbered = await server(stack, fx.alice, fx.P)
    expect(numbered.head).toBe(3)

    const { context, page } = await stack.openTab(stack.users.alice)
    try {
      await page.goto(fx.P)
      await canvasFrame(page).locator('body', { hasText: '나 고침' }).waitFor()
      await undoOnce(page)
      const landed = await landedOrSkipped(stack, fx, page, 4)
      // eslint-disable-next-line no-console
      console.log(`[코멘트 뒤 되돌리기] 서버 ${JSON.stringify(landed)}`)
      expect(landed.content).toEqual(['가', '나'])
      expect(landed.markers).toEqual(numbered.markers)
      expect(numbered.markers[0]).not.toBeUndefined()
    } finally {
      await context.close()
    }
  })

  it('목록 답이 오기 전에 남의 프레임이 닿아도 되돌리기가 내 편집을 되돌리고 남의 노드는 그대로다', async () => {
    const fx = await fixture(stack, 'frame-first')
    const { context, page } = await stack.openTab(stack.users.alice)
    const held = holdMyRevisions(page)
    try {
      await page.goto(fx.P)
      await canvasFrame(page).locator('body', { hasText: '나 고침' }).waitFor()
      // 서버가 목록을 읽었다(head 2) — 그 답을 붙잡아 둔 채 밥의 편집이 프레임으로 닿게 한다.
      await held.read
      const bobs = await stack.request(fx.bob, 'PATCH', `${fx.P}/ops`, { baseSeq: 2, ops: [{ op: 'add', path: '/root/children/0', value: text('n_bob0000001', '밥') }] })
      expect(bobs.status).toBe(200)
      await canvasFrame(page).locator('body', { hasText: '밥' }).waitFor()
      held.release()
      await held.delivered

      await undoOnce(page)
      const landed = await landedOrSkipped(stack, fx, page, 4)
      const after = await stable(page)
      // eslint-disable-next-line no-console
      console.log(`[프레임 먼저] 서버 ${JSON.stringify(landed)} · 앨리스 ${JSON.stringify(after)}`)
      expect(landed.content).toEqual(['밥', '가', '나'])
      expect(after.canvas).toBe('밥 가 나')
    } finally {
      await context.close()
    }
  })

  it('목록 답이 오기 전에 이 탭에서 고친 편집은 복원 항목 위에 남는다 — 먼저 그것을, 다음에 앞 편집을 되돌린다', async () => {
    const fx = await fixture(stack, 'session-first')
    const { context, page } = await stack.openTab(stack.users.alice)
    const held = holdMyRevisions(page)
    try {
      await page.goto(fx.P)
      await canvasFrame(page).locator('body', { hasText: '나 고침' }).waitFor()
      await held.read
      await page.locator('li button', { hasText: 'Text' }).first().click()
      const box = page.locator('.wb-shell-panel textarea').first()
      await box.waitFor()
      await box.click()
      await box.fill('가 고침')
      await box.evaluate((element) => (element as HTMLElement).blur())
      await poll('세션 편집이 서버에 닿는다', () => server(stack, fx.alice, fx.P), (value) => value.head === 3)
      held.release()
      await held.delivered

      await undoOnce(page)
      const first = await landedOrSkipped(stack, fx, page, 4)
      await undoOnce(page)
      const second = await landedOrSkipped(stack, fx, page, 5)
      const after = await stable(page)
      // eslint-disable-next-line no-console
      console.log(`[세션 먼저] 첫 ${JSON.stringify(first)} · 둘째 ${JSON.stringify(second)} · 앨리스 ${JSON.stringify(after)}`)
      expect(first.content).toEqual(['가', '나 고침'])
      expect(second.content).toEqual(['가', '나'])
      expect(after.canvas).toBe('가 나')
    } finally {
      await context.close()
    }
  })
})

/**
 * **되짚기 이력은 열 때가 아니라 처음 누를 때 받는다**(`edit/use-edit-commit.tsx`의 `loadUndoHistory`) — 문서 통째 교체 revision 은 문서 두 벌이라
 * 그것이 낀 페이지를 열 때 미리 받으면 되돌리기를 안 눌러도 수 MB ~ 수백 MB 를 내려받는다. 판: 앨리스의 1 · 2 뒤에 밥이 문서를 통째로 10 번
 * 갈았다(맨 앞에 긴 글 노드 2000 개). 받는 동안 단추는 꺼지고, 그 사이의 더블클릭은 되돌리기 하나다. 누를 때 받는 답에는 `ops`가 없다
 * (`fields=inverse` — 받는 바이트가 반이다).
 */
describe.skipIf(!전제.ok)('문서 교체가 낀 페이지의 되돌리기', () => {
  let stack: EditorStack

  beforeAll(async () => {
    if (!전제.ok) return
    stack = await startEditorStack(전제)
  })

  afterAll(async () => {
    if (stack === undefined) return
    const { after } = await stack.close()
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  })

  it('열 때 되짚기 이력을 받지 않고, 누른 뒤 받는 동안 더블클릭해도 한 번만 되돌린다', async () => {
    const fx = await fixture(stack, 'replaced')
    const REPLACES = 10
    for (let round = 0; round < REPLACES; round += 1) {
      const current = (await stack.request(fx.bob, 'GET', fx.P)).body
      const fillers = Array.from({ length: 2000 }, (_, index) => text(`n_f${round}_${index}`, `${round}:${index} ${'글'.repeat(60)}`))
      const kept = (current.schema.root.children as { id: string }[]).filter((child) => !child.id.startsWith('n_f'))
      const replaced = await stack.request(fx.bob, 'PUT', `${fx.P}/schema`, { schema: { ...current.schema, root: { ...current.schema.root, children: [...fillers, ...kept] } } })
      expect(replaced.status).toBe(200)
    }
    const head = 2 + REPLACES

    const { context, page } = await stack.openTab(stack.users.alice)
    const fetched: { at: 'open' | 'press'; bytes: number; ops: boolean }[] = []
    let pressed = false
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route(/\/revisions\?beforeSeq=/, async (route: Route) => {
      const response = await route.fetch()
      const body = await response.body()
      // 되짚기 조회는 `inverse`만 받는다(`fields=inverse`) — 문서 교체 revision 은 `ops`도 문서 한 벌이다.
      const ops = (JSON.parse(body.toString('utf8')) as Record<string, unknown>[]).some((item) => 'ops' in item)
      fetched.push({ at: pressed ? 'press' : 'open', bytes: body.length, ops })
      // 누른 뒤의 조회만 붙잡는다 — 받는 동안의 단추를 잰다.
      if (pressed) await gate
      await route.fulfill({ response })
    })
    try {
      await page.goto(fx.P)
      await canvasFrame(page).locator('body', { hasText: '나 고침' }).waitFor()
      const undo = page.getByRole('group', { name: '편집 이력' }).getByRole('button', { name: '되돌리기' })
      await poll('되돌리기가 켜진다', async () => undo.isEnabled(), (enabled) => enabled)
      await new Promise((resolve) => setTimeout(resolve, 1000))
      const atOpen = [...fetched]
      // eslint-disable-next-line no-console
      console.log(`[문서 교체 뒤 열기] 되짚기 조회 ${JSON.stringify(atOpen)}`)
      expect(atOpen).toEqual([])

      pressed = true
      const box = await undo.boundingBox()
      if (box === null) throw new Error('되돌리기 단추가 안 보인다')
      await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2)
      await poll('되짚기 이력을 받는다', async () => fetched.length, (count) => count > atOpen.length)
      const whileLoading = { disabled: await undo.isDisabled(), head: (await server(stack, fx.alice, fx.P)).head }
      release()
      const landed = await landedOrSkipped(stack, fx, page, head + 1)
      const after = await stable(page)
      const settled = await server(stack, fx.alice, fx.P)
      // eslint-disable-next-line no-console
      console.log(`[문서 교체 뒤 되돌리기] 열 때 ${JSON.stringify(atOpen)} · 누를 때 ${JSON.stringify(fetched.slice(atOpen.length))} · 받는 동안 ${JSON.stringify(whileLoading)} · 서버 head ${settled.head} · 통지 ${JSON.stringify(after.notices)}`)
      expect({
        pressFetches: fetched.length - atOpen.length,
        pressOps: fetched.some((entry) => entry.ops),
        whileLoading,
        head: settled.head,
        last: landed.content.slice(-2),
      }).toEqual({
        pressFetches: 1,
        pressOps: false,
        whileLoading: { disabled: true, head },
        head: head + 1,
        last: ['가', '나'],
      })
    } finally {
      release()
      await context.close()
    }
  })
})

interface Fixture {
  alice: Session
  bob: Session
  projectId: string
  pageId: string
  P: string
}

/** 앨리스 · 밥(editor)의 프로젝트와 앨리스의 revision 둘 — 1: «가» · «나» 넣음, 2: «나» → «나 고침». */
async function fixture(stack: EditorStack, slug: string): Promise<Fixture> {
  const alice = await stack.login(stack.users.alice)
  const bob = await stack.login(stack.users.bob)
  const call = (method: string, path: string, body?: unknown) => stack.request(alice, method, path, body)
  const project = created(await call('POST', '/projects', { name: '되돌리기 복원', slug: `undo-${slug}-${Date.now().toString(36)}` }))
  const member = await call('POST', `/projects/${project.id}/members`, { email: stack.users.bob.email, role: 'editor' })
  if (member.status >= 300) throw new Error(`픽스처 member ${member.status} ${JSON.stringify(member.body)}`)
  const menu = created(await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '메뉴' }))
  const target = created(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '페이지' }))
  const P = `/projects/${project.id}/pages/${target.id}`
  for (const [baseSeq, ops] of [
    [0, [{ op: 'add', path: '/root/children/0', value: text('n_ga00000001', '가') }, { op: 'add', path: '/root/children/1', value: text('n_na00000001', '나') }]],
    [1, [{ op: 'replace', path: '/root/children/1/props/content', value: '나 고침' }]],
  ] as const) {
    const seeded = await call('PATCH', `${P}/ops`, { baseSeq, ops })
    if (seeded.status >= 300) throw new Error(`픽스처 ops ${seeded.status} ${JSON.stringify(seeded.body)}`)
  }
  return { alice, bob, projectId: project.id, pageId: target.id, P }
}

/**
 * 되돌리기가 서버에 닿아 번호가 `head`가 되거나 · 건너뛰었다는 통지가 서면 그때의 서버 값. 건너뛴 판(못 붙잡은 항목)도 기다리지 않고 값으로
 * 단언하게 한다 — 번호만 기다리면 그 판이 «10s 안에 안 섰다»로 죽어 무엇이 틀렸는지 값이 안 남는다.
 */
async function landedOrSkipped(stack: EditorStack, fx: Fixture, page: Page, head: number): Promise<{ head: number; content: string[]; markers: unknown[]; notices: string[] }> {
  return poll(
    '되돌리기가 서버에 닿거나 건너뛴다',
    async () => ({
      ...(await server(stack, fx.alice, fx.P)),
      notices: await page.locator('.wb-shell-footer [role=status], .wb-shell-footer [role=alert]').allTextContents(),
    }),
    (value) => value.head === head || value.notices.some((notice) => notice.includes('건너뛰었습니다')),
  )
}

/** 되돌리기 단추가 켜지길 기다려 한 번 누른다. */
async function undoOnce(page: Page): Promise<void> {
  const undo = page.getByRole('group', { name: '편집 이력' }).getByRole('button', { name: '되돌리기' })
  await poll('되돌리기가 켜진다', async () => undo.isEnabled(), (enabled) => enabled)
  await undo.click()
}

/**
 * 내 revision 목록(`revisions?mine=true`)의 **답을 붙잡는다** — 요청은 곧바로 서버로 보내 읽게 하고(`read`), 받은 답을 `release()` 뒤에
 * 브라우저에 넘긴다(`delivered`). 서버가 읽은 판 뒤의 프레임 · ack 가 답보다 먼저 닿는 판을 세운다.
 */
function holdMyRevisions(page: Page): { read: Promise<void>; delivered: Promise<void>; release(): void } {
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let markRead!: () => void
  const read = new Promise<void>((resolve) => {
    markRead = resolve
  })
  let markDelivered!: () => void
  const delivered = new Promise<void>((resolve) => {
    markDelivered = resolve
  })
  let used = false
  void page.route(/\/revisions\?mine=true/, async (route: Route) => {
    if (used) return route.continue()
    used = true
    const response = await route.fetch()
    markRead()
    await gate
    await route.fulfill({ response })
    markDelivered()
  })
  return { read, delivered, release }
}

function created(response: { status: number; body: any }): { id: string } {
  if (response.status !== 201) throw new Error(`픽스처 ${response.status} ${JSON.stringify(response.body)}`)
  return response.body
}

async function server(stack: EditorStack, session: Session, path: string): Promise<{ head: number; content: string[]; markers: unknown[] }> {
  const page = (await stack.request(session, 'GET', path)).body
  const children = (page.schema.root.children ?? []) as any[]
  return { head: page.headSeq as number, content: children.map((child) => child.props?.content), markers: children.map((child) => child.marker) }
}

/** 캔버스 글 · 머리 통지가 500ms 동안 안 바뀌면 그 값. */
async function stable(page: Page): Promise<{ canvas: string; notices: string[] }> {
  const read = async () => ({
    canvas: (await canvasText(page)).replace(/\s+/g, ' ').trim(),
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
