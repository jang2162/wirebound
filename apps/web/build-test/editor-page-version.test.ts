/**
 * **복원이 되살린 페이지의 번호가 옛 판본의 번호와 겹치지 않는다** — WS 가 끊긴 탭의 REST 편집이 남의 노드를 고치지 않는다.
 *
 * 서버는 편집의 경로를 `baseSeq` 판에 그대로 적용한다(설계서 「정방향 흐름」). 그러니 «번호가 같으면 같은 문서»여야 한다. 지워진
 * 페이지를 복원이 같은 id 로 되살리면 그 번호가 옛 판본이 쓴 번호 다음부터 서야 한다(`apps/api/src/repos/pages.ts` 의
 * `insertPageWithId`) — 0 부터 다시 세면, WS 가 끊겨 복원 방송을 못 받은 탭의 번호와 남의 편집으로 오른 번호가 우연히 같아지고,
 * 그 탭이 REST 로 낸 자리 경로가 **되살린 문서의 다른 노드**에 적용된다.
 *
 * 판: 앨리스가 `[가, 나, 다]`(head 1)를 연다 → 앨리스의 WS 를 끊고 다시 붙는 것도 거절한다(아래 `startWsRefusal` — REST 는
 * 지난다) → 페이지 삭제 → 스냅샷 복원 → 밥이 맨 앞에 넣는다 → 앨리스가 «나»를 고친다(REST `baseSeq 1`). 되살린 판이 0 부터
 * 세면 밥의 편집이 head 를 1 로 만들어 앨리스의 번호와 같아진다.
 *
 * 단언은 옛 증상이 아니라 성질이다 — 서버의 «가»가 그대로이고, 앨리스 화면이 서버와 같거나 거절을 말한다.
 */
import net from 'node:net'
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { editorStackPrerequisite, poll, startEditorStack, type EditorStack, type Session, canvasFrame, canvasText } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

describe.skipIf(!전제.ok)('되살린 페이지의 번호', () => {
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

  it('WS 가 끊긴 채 페이지가 지워졌다 되살아나고 남이 편집해도, REST 편집이 남의 노드를 고치지 않는다', async () => {
    const alice = await stack.login(stack.users.alice)
    const bob = await stack.login(stack.users.bob)
    const call = (method: string, path: string, body?: unknown) => stack.request(alice, method, path, body)
    const project = created(await call('POST', '/projects', { name: '되살린 번호', slug: `renumber-${Date.now().toString(36)}` }))
    const member = await call('POST', `/projects/${project.id}/members`, { email: stack.users.bob.email, role: 'editor' })
    if (member.status >= 300) throw new Error(`픽스처 member ${member.status} ${JSON.stringify(member.body)}`)
    const menu = created(await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '메뉴' }))
    const target = created(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '페이지' }))
    const P = `/projects/${project.id}/pages/${target.id}`
    const text = (id: string, content: string) => ({ id, type: 'Text', props: { content } })
    const seeded = await call('PATCH', `${P}/ops`, {
      baseSeq: 0,
      ops: [
        { op: 'add', path: '/root/children/0', value: text('n_ga00000001', '가') },
        { op: 'add', path: '/root/children/1', value: text('n_na00000001', '나') },
        { op: 'add', path: '/root/children/2', value: text('n_da00000001', '다') },
      ],
    })
    if (seeded.status >= 300) throw new Error(`픽스처 ops ${seeded.status}`)
    const snapshot = created(await call('POST', `/projects/${project.id}/snapshots`, { tag: 'renumber' }))

    const refusal = await startWsRefusal(new URL(stack.webUrl).port)
    const { context, page } = await stack.openTab(stack.users.alice, { origin: refusal.origin })
    const log = watch(page)
    try {
      await page.goto(P)
      await canvasFrame(page).locator('body', { hasText: '다' }).waitFor()
      // 판이 섰는가 — 앨리스가 WS 로 붙어 있었고, 끊은 것이 그 연결이다.
      await poll('앨리스의 WS 가 붙는다', async () => refusal.live(), (live) => live >= 1)
      expect(refusal.refuse()).toBeGreaterThanOrEqual(1)

      expect((await call('DELETE', P)).status).toBe(204)
      expect((await call('POST', `/projects/${project.id}/snapshots/${snapshot.id}/restore`)).status).toBe(200)
      const restored = await server(stack, alice, P)
      const bobs = await stack.request(bob, 'PATCH', `${P}/ops`, {
        baseSeq: restored.head,
        ops: [{ op: 'add', path: '/root/children/0', value: text('n_bob0000001', '밥') }],
      })
      expect(bobs.status).toBe(200)
      const beforeAlice = await server(stack, alice, P)

      await page.locator('li button', { hasText: 'Text' }).nth(1).click()
      const box = page.locator('.wb-shell-panel textarea').first()
      // 앨리스는 옛 판을 보고 있다 — 고른 칸이 «나»다.
      expect(await box.inputValue()).toBe('나')
      await box.click()
      await box.fill('앨리스 고침')
      await box.evaluate((element) => (element as HTMLElement).blur())
      // 판이 섰는가 — 편집이 REST 로 나갔다(WS 가 없다).
      await poll('앨리스의 편집이 REST 로 나가 답을 받는다', async () => log.lines.slice(), (lines) => lines.some((line) => line.startsWith('REST←')))

      const after = await stable(page)
      const landed = await server(stack, alice, P)
      // eslint-disable-next-line no-console
      console.log(
        `[되살린 번호] 복원 뒤 head ${restored.head} · 밥 뒤 ${JSON.stringify(beforeAlice)} · ${log.lines.join(' · ')} · 뒤 서버 ${JSON.stringify(landed)} · 앨리스 ${JSON.stringify(after)}`,
      )
      // 서버의 «가»는 그대로다 — 앨리스의 편집은 «나»에 닿았거나 거절됐다.
      expect(landed.content.filter((content) => content !== '나' && content !== '앨리스 고침')).toEqual(['밥', '가', '다'])
      // 앨리스 화면은 서버 판이거나, 거절을 말한다.
      if (after.canvas !== landed.content.join(' ')) expect(after.notices.join(' ')).toMatch(/\S/)
      // 되살린 판은 옛 판본이 쓴 번호(1)보다 뒤에서 센다 — 앨리스의 번호와 겹치지 않는다.
      expect(restored.head).toBeGreaterThan(1)
    } finally {
      await context.close()
      await refusal.close()
    }
  })

  /**
   * **남긴 번호가 없는 id 를 되살리면 2^32 에서 센다**(`apps/api/src/repos/pages.ts` 의 `insertPageWithId` «그 id 의 줄이 없으면») —
   * 그 번호로 한 판을 끝까지 돈다: 앨리스의 편집(REST · WS) → 밥의 화면에 프레임 → 앨리스의 ack → 새로고침 뒤 서버 이력으로 채운
   * 되돌리기(`GET …/revisions?mine=true`) → 되돌린 편집이 밥에게 닿는다. 번호를 다루는 자리(수 비교 · `+ 1`)가 안전 정수 안에서
   * 도는지를 본다. 줄 없는 판은 줄을 지워 세운다 — 번호를 남기기 전에 지운 판과 DB 가 같다.
   */
  it('2^32 에서 세는 되살린 페이지도 편집 · 프레임 · 새로고침 뒤 되돌리기가 돈다', async () => {
    const alice = await stack.login(stack.users.alice)
    const call = (method: string, path: string, body?: unknown) => stack.request(alice, method, path, body)
    const project = created(await call('POST', '/projects', { name: '큰 번호', slug: `big-seq-${Date.now().toString(36)}` }))
    const member = await call('POST', `/projects/${project.id}/members`, { email: stack.users.bob.email, role: 'editor' })
    if (member.status >= 300) throw new Error(`픽스처 member ${member.status} ${JSON.stringify(member.body)}`)
    const menu = created(await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '메뉴' }))
    const target = created(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '페이지' }))
    const P = `/projects/${project.id}/pages/${target.id}`
    const text = (id: string, content: string) => ({ id, type: 'Text', props: { content } })
    const seeded = await call('PATCH', `${P}/ops`, {
      baseSeq: 0,
      ops: [
        { op: 'add', path: '/root/children/0', value: text('n_ga00000001', '가') },
        { op: 'add', path: '/root/children/1', value: text('n_na00000001', '나') },
      ],
    })
    if (seeded.status >= 300) throw new Error(`픽스처 ops ${seeded.status}`)
    const snapshot = created(await call('POST', `/projects/${project.id}/snapshots`, { tag: 'big-seq' }))
    expect((await call('DELETE', P)).status).toBe(204)
    await stack.query('delete from page_seq_floors where page_id = $1', [target.id])
    expect((await call('POST', `/projects/${project.id}/snapshots/${snapshot.id}/restore`)).status).toBe(200)
    const floor = 2 ** 32
    expect((await server(stack, alice, P)).head).toBe(floor)

    const a = await stack.openTab(stack.users.alice)
    const b = await stack.openTab(stack.users.bob)
    try {
      await a.page.goto(P)
      await b.page.goto(P)
      await canvasFrame(a.page).locator('body', { hasText: '나' }).waitFor()
      await canvasFrame(b.page).locator('body', { hasText: '나' }).waitFor()

      await a.page.locator('li button', { hasText: 'Text' }).nth(1).click()
      const box = a.page.locator('.wb-shell-panel textarea').first()
      expect(await box.inputValue()).toBe('나')
      await box.click()
      await box.fill('큰 번호 고침')
      await box.evaluate((element) => (element as HTMLElement).blur())
      const edited = await poll('편집이 서버에 닿는다', () => server(stack, alice, P), (value) => value.head === floor + 1)
      expect(edited.content).toEqual(['가', '큰 번호 고침'])
      await canvasFrame(b.page).locator('body', { hasText: '큰 번호 고침' }).waitFor()
      // 앨리스의 ack 가 제 판을 머리로 두었다 — 낡음 · 거절 통지가 없다.
      expect(await stable(a.page)).toEqual({ canvas: '가 큰 번호 고침', notices: [] })

      await a.page.reload()
      await canvasFrame(a.page).locator('body', { hasText: '큰 번호 고침' }).waitFor()
      const undo = a.page.getByRole('group', { name: '편집 이력' }).getByRole('button', { name: '되돌리기' })
      await poll('새로고침으로 채운 되돌리기가 켜진다', async () => undo.isEnabled(), (enabled) => enabled)
      await undo.click()
      const undone = await poll('되돌리기가 서버에 닿는다', () => server(stack, alice, P), (value) => value.head === floor + 2)
      expect(undone.content).toEqual(['가', '나'])
      expect(await stable(a.page)).toEqual({ canvas: '가 나', notices: [] })
      expect((await stable(b.page)).canvas).toBe('가 나')
    } finally {
      await a.context.close()
      await b.context.close()
    }
  })
})

describe.skipIf(!전제.ok)('서버 이력으로 채운 되돌리기', () => {
  let stack: EditorStack

  beforeAll(async () => {
    if (!전제.ok) return
    stack = await startEditorStack(전제)
  })

  afterAll(async () => {
    if (stack === undefined) return
    const { before, after } = await stack.close()
    expect(before.processes).toBeGreaterThan(0)
    expect(before.databases).toBe(1)
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  })

  it('페이지를 연 뒤 남이 맨 앞에 넣어도 새로고침으로 채운 되돌리기가 제 노드를 되돌린다', async () => {
    const alice = await stack.login(stack.users.alice)
    const bob = await stack.login(stack.users.bob)
    const call = (method: string, path: string, body?: unknown) => stack.request(alice, method, path, body)
    const project = created(await call('POST', '/projects', { name: '되돌리기 이력', slug: `undo-history-${Date.now().toString(36)}` }))
    const member = await call('POST', `/projects/${project.id}/members`, { email: stack.users.bob.email, role: 'editor' })
    if (member.status >= 300) throw new Error(`픽스처 member ${member.status} ${JSON.stringify(member.body)}`)
    const menu = created(await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '메뉴' }))
    const target = created(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '페이지' }))
    const P = `/projects/${project.id}/pages/${target.id}`
    const text = (id: string, content: string) => ({ id, type: 'Text', props: { content } })
    // 앨리스의 revision 둘 — 1: «가» · «나»를 넣었다, 2: «나»를 «나 고침»으로 고쳤다(되돌리면 «나»).
    for (const [baseSeq, ops] of [
      [0, [{ op: 'add', path: '/root/children/0', value: text('n_ga00000001', '가') }, { op: 'add', path: '/root/children/1', value: text('n_na00000001', '나') }]],
      [1, [{ op: 'replace', path: '/root/children/1/props/content', value: '나 고침' }]],
    ] as const) {
      const seeded = await call('PATCH', `${P}/ops`, { baseSeq, ops })
      if (seeded.status >= 300) throw new Error(`픽스처 ops ${seeded.status} ${JSON.stringify(seeded.body)}`)
    }

    const { context, page } = await stack.openTab(stack.users.alice)
    try {
      await page.goto(P)
      await canvasFrame(page).locator('body', { hasText: '나 고침' }).waitFor()
      const undo = page.getByRole('group', { name: '편집 이력' }).getByRole('button', { name: '되돌리기' })
      // 새로고침으로 채운 스택이 섰다(세션 안에서 아무것도 안 고쳤다).
      await poll('되돌리기가 켜진다', async () => undo.isEnabled(), (enabled) => enabled)

      const bobs = await stack.request(bob, 'PATCH', `${P}/ops`, {
        baseSeq: 2,
        ops: [{ op: 'add', path: '/root/children/0', value: text('n_bob0000001', '밥') }],
      })
      expect(bobs.status).toBe(200)
      await canvasFrame(page).locator('body', { hasText: '밥' }).waitFor()

      await undo.click()
      const landed = await poll('되돌리기가 서버에 닿는다', () => server(stack, alice, P), (value) => value.head === 4)
      const after = await stable(page)
      // eslint-disable-next-line no-console
      console.log(`[서버 이력 되돌리기] 서버 ${JSON.stringify(landed)} · 앨리스 ${JSON.stringify(after)}`)
      expect(landed.content).toEqual(['밥', '가', '나'])
      expect(after.canvas).toBe('밥 가 나')
    } finally {
      await context.close()
    }
  })
})

function created(response: { status: number; body: any }): { id: string } {
  if (response.status !== 201) throw new Error(`픽스처 ${response.status} ${JSON.stringify(response.body)}`)
  return response.body
}

async function server(stack: EditorStack, session: Session, path: string): Promise<{ head: number; content: string[] }> {
  const page = (await stack.request(session, 'GET', path)).body
  return { head: page.headSeq as number, content: (page.schema.root.children ?? []).map((child: any) => child.props?.content) }
}

/** REST 편집과 그 답을 적는다. */
function watch(page: Page): { lines: string[] } {
  const lines: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'PATCH' && request.url().endsWith('/ops')) lines.push(`REST→ ${/"baseSeq":(\d+)/.exec(request.postData() ?? '')?.[0] ?? ''}`)
  })
  page.on('response', (response) => {
    if (response.request().method() === 'PATCH' && response.url().endsWith('/ops')) lines.push(`REST← ${response.status()}`)
  })
  return { lines }
}

/**
 * 브라우저 ↔ 웹 사이의 TCP 프록시. `refuse()` 뒤로는 **WS 연결만** 끊는다 — 지금 붙은 것을 RST 하고, 새로 오는 것도 요청 줄을 보는
 * 즉시 RST 한다. REST 와 vite 의 HMR 소켓은 그대로 지난다(HMR 까지 끊으면 페이지가 새로고침돼 판이 사라진다).
 */
function startWsRefusal(targetPort: string): Promise<{ origin: string; live(): number; refuse(): number; close(): Promise<void> }> {
  const conns = new Set<{ client: net.Socket; upstream: net.Socket; line: string }>()
  let refusing = false
  const isWs = (line: string) => /^GET [^\r\n]*\/ws[ ?]/.test(line)
  const server = net.createServer((client) => {
    const upstream = net.connect(Number(targetPort), '127.0.0.1')
    const conn = { client, upstream, line: '' }
    conns.add(conn)
    client.on('data', (chunk) => {
      if (conn.line === '') conn.line = /^[A-Z]+ [^\r\n]*/.exec(chunk.toString('latin1'))?.[0] ?? ''
      if (refusing && isWs(conn.line)) {
        client.resetAndDestroy()
        upstream.destroy()
        conns.delete(conn)
        return
      }
      upstream.write(chunk)
    })
    upstream.on('data', (chunk) => client.write(chunk))
    const end = () => {
      conns.delete(conn)
      client.destroy()
      upstream.destroy()
    }
    client.on('error', end)
    upstream.on('error', end)
    client.on('close', end)
    upstream.on('close', end)
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address !== null ? address.port : 0
      resolve({
        origin: `http://127.0.0.1:${port}`,
        live: () => [...conns].filter((conn) => isWs(conn.line)).length,
        refuse() {
          refusing = true
          let cut = 0
          for (const conn of [...conns]) {
            if (!isWs(conn.line)) continue
            cut += 1
            conn.client.resetAndDestroy()
            conn.upstream.destroy()
            conns.delete(conn)
          }
          return cut
        },
        close() {
          for (const conn of conns) {
            conn.client.destroy()
            conn.upstream.destroy()
          }
          return new Promise((done) => server.close(() => done()))
        },
      })
    })
  })
}

/** 캔버스 글 · 머리 통지가 500ms 동안 안 바뀌면 그 값. */
async function stable(page: Page): Promise<{ canvas: string; notices: string[] }> {
  const read = async () => ({
    canvas: (await canvasText(page)).replace(/\s+/g, ' ').trim(),
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
