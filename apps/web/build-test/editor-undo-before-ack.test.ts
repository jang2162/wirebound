/**
 * **내 편집의 ack 가 닿기 전에 누른 Cmd+Z 는 그 편집을 되돌린다** — 앞선 편집이 아니라.
 *
 * 되돌리기 스택은 편집이 ack 될 때 서버가 준 `inverse` 로 쌓인다(`EditorStore.ackEdit`). ack 전에 Cmd+Z 를 누르면 스택 맨 위는 그 편집이 아니라
 * 그 앞의 항목이라, 새로고침으로 채운 첫 편집(페이지 만들기)을 되돌려 **페이지가 통째로 비고** 고른 노드가 풀렸다. `editor-shortcuts` «캔버스 iframe
 * 에 포커스가 있어도 …» 가 «몇 판에 하나 · main 에서도» 흔들리던 뿌리다 — 그 케이스는 서버 번호(GET)를 기다렸다 누르는데 ack 는 다른 연결(WS)로
 * 와서, 서버가 커밋한 뒤 ack 가 닿기 전의 틈에 Cmd+Z 가 들어가는 판이 몇 번에 한 번 선다.
 *
 * 판: 서버 → 브라우저 WS 를 `DELAY_MS` 늦춘다(`startDownDelay`) — ack 가 늦게 닿는 판을 결정론으로 만든다. Alt+↑ 로 옮기고 서버가 커밋한 것을 본
 * 뒤 곧바로 Cmd+Z. 도착 순서는 프레임 로그로 잰다 — ack 가 Cmd+Z 보다 먼저 닿았으면 판이 안 선 것이라 던진다.
 *
 * 단언은 성질이다 — 서버 문서가 옮기기 전과 같고(페이지가 안 비었다) 고른 노드가 그대로다.
 */
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canvasFrame, editorStackPrerequisite, poll, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

/** 서버 → 브라우저 WS 지연 — 서버 커밋(수십 ms)보다 넉넉히 길고 한도(`UNDO_ACK_WAIT_MS` 3s)보다 짧다. */
const DELAY_MS = 600

describe.skipIf(!전제.ok)('ack 전의 Cmd+Z', () => {
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
    expect(before.databases).toBe(1)
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  })

  async function server(P: string): Promise<{ ids: string[]; headSeq: number }> {
    const response = await stack.request(alice, 'GET', P)
    const children = (response.body.schema.root.children ?? []) as { id: string }[]
    return { ids: children.map((child) => child.id), headSeq: response.body.headSeq }
  }

  /** 고른 노드 — 속성 패널 글 칸의 값. 고른 것이 없으면 기다리지 않고 `(없음)` — 값으로 실패해야 원인이 남는다. */
  const selected = async (page: Page): Promise<string> => {
    const field = page.locator('.wb-shell-panel textarea').first()
    return (await field.count()) === 0 ? '(없음)' : field.inputValue()
  }

  it('옮긴 편집의 ack 가 늦게 닿는 동안 누른 Cmd+Z 가 그 옮김을 되돌린다 — 페이지가 비지 않고 고른 노드가 남는다', async () => {
    const { P } = await fixture(stack, alice, 'undo-before-ack')
    const delay = await stack.startDownDelay(DELAY_MS)
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 }, origin: delay.origin })
    const log: string[] = []
    const T0 = Date.now()
    page.on('websocket', (ws) => ws.on('framereceived', (frame) => log.push(`${Date.now() - T0} ${String(frame.payload).slice(0, 40)}`)))
    try {
      await page.goto(P)
      await canvasFrame(page).locator('[data-wb-id="n_text0000002"]').click()
      expect((await selected(page)).startsWith('글 2')).toBe(true)
      await poll('WS 가 늦춰진 채 붙는다', async () => delay.delayed(), (n) => n >= 1)
      await poll('룸에 든다', async () => log.slice(), (lines) => lines.some((line) => line.includes('"joined"')))

      await page.keyboard.press('Alt+ArrowUp')
      const moved = await poll('Alt+↑ 가 서버에 닿는다', () => server(P), (s) => s.headSeq === 2)
      const pressedAt = Date.now() - T0
      await page.keyboard.press('ControlOrMeta+z')
      // 판 카나리아 — Cmd+Z 를 누른 때 ack 는 아직 안 왔다(늦춘 WS).
      expect(log.filter((line) => line.includes('patch-ack') && Number(line.split(' ')[0]) <= pressedAt)).toEqual([])

      // 서버에 되돌림이 닿거나(번호 3) 한도가 지날 때까지 — 값은 아래에서 단언한다.
      const final = await poll('Cmd+Z 의 결과가 서버에 닿는다', () => server(P), (s) => s.headSeq >= 3, 8_000)
      await page.waitForTimeout(DELAY_MS + 300)
      const after = await selected(page)
      expect(moved.ids).toEqual(['n_text0000002', 'n_text0000001', 'n_text0000003', 'n_field000001'])
      expect({ ids: final.ids, headSeq: final.headSeq, selected: after.slice(0, 3) }).toEqual({
        ids: ['n_text0000001', 'n_text0000002', 'n_text0000003', 'n_field000001'],
        headSeq: 3,
        selected: '글 2',
      })
    } finally {
      await context.close()
    }
  })

  /** 늦춘 WS 로 에디터를 열고 둘째 글을 골라 룸에 든 뒤 `Alt+↑` 로 옮긴다 — 서버가 커밋한 것을 본 뒤(ack 는 아직)까지. */
  async function movedWithAckPending(slug: string): Promise<{ P: string; page: Page; log: string[]; T0: number; close: () => Promise<void> }> {
    const { P } = await fixture(stack, alice, slug)
    const delay = await stack.startDownDelay(DELAY_MS)
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 }, origin: delay.origin })
    const log: string[] = []
    const T0 = Date.now()
    page.on('websocket', (ws) => ws.on('framereceived', (frame) => log.push(`${Date.now() - T0} ${String(frame.payload).slice(0, 40)}`)))
    await page.goto(P)
    await canvasFrame(page).locator('[data-wb-id="n_text0000002"]').click()
    await poll('WS 가 늦춰진 채 붙는다', async () => delay.delayed(), (n) => n >= 1)
    await poll('룸에 든다', async () => log.slice(), (lines) => lines.some((line) => line.includes('"joined"')))
    await page.keyboard.press('Alt+ArrowUp')
    await poll('Alt+↑ 가 서버에 닿는다', () => server(P), (s) => s.headSeq === 2)
    return { P, page, log, T0, close: () => context.close() }
  }

  /** 판 카나리아 — 누른 때 ack 는 아직 안 왔다(늦춘 WS). */
  const noAckYet = (log: string[], T0: number): string[] => log.filter((line) => line.includes('patch-ack') && Number(line.split(' ')[0]) <= Date.now() - T0)

  it('누른 뒤 ack 전에 지운 노드는 되돌림에 되살아나지 않는다 — 미룬 되돌리기는 버려지고 지움만 서버에 간다', async () => {
    const t = await movedWithAckPending('undo-then-delete')
    try {
      await t.page.keyboard.press('ControlOrMeta+z')
      await t.page.keyboard.press('Delete')
      expect(noAckYet(t.log, t.T0)).toEqual([])
      // 지움이 서버에 닿을 때까지 — 값은 아래에서 단언한다.
      await poll('Delete 가 서버에 닿는다', () => server(t.P), (s) => s.headSeq >= 3, 8_000)
      await t.page.waitForTimeout(DELAY_MS * 3)
      const final = await server(t.P)
      expect(final).toEqual({ ids: ['n_text0000001', 'n_text0000003', 'n_field000001'], headSeq: 3 })
      expect(await t.page.locator('.wb-shell-edit-alert').allTextContents()).toEqual(['되돌리기 전에 새 편집이 있어 되돌리지 않았습니다.'])
    } finally {
      await t.close()
    }
  })

  it('키보드 Cmd+Z 와 머리 «되돌리기» 단추를 함께 눌러도 한 단계만 나간다 — 페이지가 비지 않는다', async () => {
    const t = await movedWithAckPending('undo-key-and-button')
    try {
      await t.page.keyboard.press('ControlOrMeta+z')
      await t.page.getByRole('group', { name: '편집 이력' }).getByRole('button', { name: '되돌리기', exact: true }).click()
      expect(noAckYet(t.log, t.T0)).toEqual([])
      await poll('되돌림이 서버에 닿는다', () => server(t.P), (s) => s.headSeq >= 3, 8_000)
      await t.page.waitForTimeout(DELAY_MS * 4)
      expect(await server(t.P)).toEqual({ ids: ['n_text0000001', 'n_text0000002', 'n_text0000003', 'n_field000001'], headSeq: 3 })
    } finally {
      await t.close()
    }
  })

  const REDO_NOTICE = '되돌리는 중입니다 — 서버에 닿은 뒤에 다시 실행할 수 있습니다.'

  it('미룬 되돌리기 위에 누른 Cmd+Shift+Z 는 이유를 말하고 아무것도 더 보내지 않는다(L-089)', async () => {
    const t = await movedWithAckPending('redo-while-deferred')
    try {
      await t.page.keyboard.press('ControlOrMeta+z')
      await t.page.keyboard.press('ControlOrMeta+Shift+z')
      expect(noAckYet(t.log, t.T0)).toEqual([])
      // 다시 실행의 까닭은 정보 통지 한 칸이 말한다(`shell/info-notice.tsx`).
      expect(await t.page.locator('.wb-shell-info-notice').allTextContents()).toEqual([REDO_NOTICE])
      await poll('되돌림이 서버에 닿는다', () => server(t.P), (s) => s.headSeq >= 3, 8_000)
      await t.page.waitForTimeout(DELAY_MS * 4)
      expect(await server(t.P)).toEqual({ ids: ['n_text0000001', 'n_text0000002', 'n_text0000003', 'n_field000001'], headSeq: 3 })
    } finally {
      await t.close()
    }
  })

  it('큐에 나간 되돌림의 ack 전에 누른 Cmd+Shift+Z 도 이유를 말한다 — 서버에는 되돌림 하나뿐이다(L-089)', async () => {
    const t = await movedWithAckPending('redo-while-queued')
    try {
      await t.page.keyboard.press('ControlOrMeta+z')
      // 되돌림이 서버에 닿았으나 그 ack(늦춘 WS)는 아직 — 이 틈이 큐에 나간 되돌림의 창이다.
      await poll('되돌림이 서버에 닿는다', () => server(t.P), (s) => s.headSeq === 3, 8_000)
      const acks = t.log.filter((line) => line.includes('patch-ack')).length
      await t.page.keyboard.press('ControlOrMeta+Shift+z')
      // 판 카나리아 — 누른 때 되돌림의 ack(둘째 patch-ack)는 아직 안 왔다.
      expect(acks).toBeLessThan(2)
      // 다시 실행의 까닭은 정보 통지 한 칸이 말한다(`shell/info-notice.tsx`).
      expect(await t.page.locator('.wb-shell-info-notice').allTextContents()).toEqual([REDO_NOTICE])
      await t.page.waitForTimeout(DELAY_MS * 3)
      expect(await server(t.P)).toEqual({ ids: ['n_text0000001', 'n_text0000002', 'n_text0000003', 'n_field000001'], headSeq: 3 })
    } finally {
      await t.close()
    }
  })

  /**
   * **앞 편집이 거절돼도 큐의 뒤 편집이 서버에 커밋되지 않는다**(장부 L-090 · 옛 R2b). [A, B] 가 큐에 있고 A 의 `patch` 프레임이 `patch-error` 로
   * 돌아오면 수습이 큐를 비워 B 도 취소된다 — 누른 Cmd+Z 도 «저장되지 않아» 로 버려진다. 판: 첫 `patch` 프레임을 서버에 안 넘기고 B 가 큐에 들 때까지
   * 붙잡았다 거절로 답한다(`page.routeWebSocket` — 가로챈 프레임 수가 카나리아). 답을 안 붙잡으면 B 가 거절 뒤에 눌린 새 편집이 되어 커밋된다
   * (그 판은 정상이다 — 사람이 거절을 본 뒤 낸 편집). 룸에 든(`joined`) 뒤에 눌러야 한다 — 그 전의 편집은 REST 로 나가 가로챈 프레임 수가 틀어진다.
   *
   * **혼자 죽는 변조가 없다** — 되돌림을 «저장되지 않아» 로 버리는 갈래(`afterAck` 의 `!acked`)를 떼면 아래 «마지막 편집이 ack 없이 …» 가 함께 죽고, 큐를 비우는 쪽(`recover`)은
   * `test/edit/edit-recovery.test.tsx` «보내지 못한 편집을 잃었다고 알린다» 가 소유한다. 이 케이스의 몫은 두 갈래가 **한 판에서 함께** 서는 실브라우저 값이다.
   */
  it('앞 편집 A 가 거절되면 큐의 B 도 서버에 안 나가고 누른 Cmd+Z 는 «저장되지 않아» 로 버려진다 — 서버는 그대로다(L-090)', async () => {
    const { P } = await fixture(stack, alice, 'a-rejected')
    const delay = await stack.startDownDelay(DELAY_MS)
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 }, origin: delay.origin })
    let patches = 0
    let held = 0
    try {
      await page.routeWebSocket(/\/ws/, (route) => {
        const server = route.connectToServer()
        route.onMessage((message) => {
          const text = typeof message === 'string' ? message : message.toString()
          let frame: { type?: string; clientOpId?: string; pageId?: string } = {}
          try {
            frame = JSON.parse(text)
          } catch {
            // 프레임이 아닌 것은 그대로 넘긴다.
          }
          if (frame.type === 'patch') {
            patches += 1
            if (patches === 1) {
              held += 1
              setTimeout(
                () => route.send(JSON.stringify({ type: 'patch-error', projectId: P.split('/')[2], pageId: frame.pageId, clientOpId: frame.clientOpId, status: 422, code: 'validation-failed', message: 'rv', issues: [] })),
                1_200,
              )
              return
            }
          }
          server.send(message)
        })
        server.onMessage((message) => route.send(message))
      })
      const joined: string[] = []
      page.on('websocket', (ws) => ws.on('framereceived', (frame) => String(frame.payload).includes('"joined"') && joined.push('joined')))
      await page.goto(P)
      await canvasFrame(page).locator('[data-wb-id="n_text0000002"]').click()
      await poll('WS 가 붙는다', async () => delay.delayed(), (n) => n >= 1)
      // 룸에 든 뒤에 누른다 — 그 전의 편집은 WS 가 안 열려 REST 로 나가 가로챈 프레임 수가 틀어진다.
      await poll('룸에 든다', async () => joined.slice(), (lines) => lines.length >= 1)
      await page.keyboard.press('Alt+ArrowDown')
      await page.keyboard.press('Alt+ArrowDown')
      await page.keyboard.press('ControlOrMeta+z')
      await page.waitForTimeout(1_200 + DELAY_MS * 4)
      const alerts = (await page.locator('.wb-shell-edit-alert').allTextContents()).join(' | ')
      expect({ patches, held, server: await server(P), alerts: { canceled: alerts.includes('편집 2개가 취소됐습니다'), unsaved: alerts.includes('되돌리려던 편집이 저장되지 않아') } }).toEqual({
        patches: 1,
        held: 1,
        server: { ids: ['n_text0000001', 'n_text0000002', 'n_text0000003', 'n_field000001'], headSeq: 1 },
        alerts: { canceled: true, unsaved: true },
      })
    } finally {
      await context.close()
      await delay.close()
    }
  })

  it('누른 때의 마지막 편집이 ack 없이 큐를 떠나면 앞 편집을 되돌리지 않는다 — 앞 편집의 ack 가 맨 위를 바꿔 놓은 채 리베이스가 마지막 편집을 버린 판', async () => {
    const { P } = await fixture(stack, alice, 'undo-last-dropped', true)
    const D = 1200
    const delay = await stack.startDownDelay(D)
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 }, origin: delay.origin })
    const log: string[] = []
    const T0 = Date.now()
    page.on('websocket', (ws) => ws.on('framereceived', (frame) => log.push(`${Date.now() - T0} ${String(frame.payload).slice(0, 40)}`)))
    try {
      await page.goto(P)
      await canvasFrame(page).locator('[data-wb-id="n_text0000002"]').click()
      await poll('WS 가 늦춰진 채 붙는다', async () => delay.delayed(), (n) => n >= 1)
      await poll('룸에 든다', async () => log.slice(), (lines) => lines.some((line) => line.includes('"joined"')))
      // A(둘째 글 ↓ 이동) 비행 · B(셋째 글 고침) · C(첫째 글 고침) 큐 — 누른 때의 마지막 편집은 C.
      await page.keyboard.press('Alt+ArrowDown')
      await canvasFrame(page).locator('[data-wb-id="n_text0000003"]').click()
      await page.locator('.wb-shell-panel textarea').first().fill('B글')
      await canvasFrame(page).locator('[data-wb-id="n_text0000001"]').click()
      await page.locator('.wb-shell-panel textarea').first().fill('C글')
      await canvasFrame(page).locator('[data-wb-id="n_text0000002"]').click()
      await page.keyboard.press('ControlOrMeta+z')
      // 판 카나리아 — 누른 때 ack 는 아직 안 왔다(늦춘 WS).
      expect(noAckYet(log, T0)).toEqual([])
      // 밥이 C 의 노드를 지워 리베이스가 C 를 버린다(ack 아닌 길로 큐를 떠난다).
      const head = (await stack.request(bob, 'GET', P)).body
      const index = (head.schema.root.children as { id: string }[]).findIndex((child) => child.id === 'n_text0000001')
      const removed = await stack.request(bob, 'PATCH', `${P}/ops`, { baseSeq: head.headSeq, ops: [{ op: 'remove', path: `/root/children/${index}` }] })
      expect(removed.status).toBeLessThan(300)
      await page.waitForTimeout(D * 8)
      // A 는 되돌려지지 않았다(둘째 글이 ↓ 이동한 채) — 되돌림 패치도 없다.
      expect(await server(P)).toEqual({ ids: ['n_text0000003', 'n_text0000002', 'n_field000001'], headSeq: 4 })
    } finally {
      await context.close()
    }
  })
})

async function fixture(stack: EditorStack, owner: Session, slug: string, withBob = false): Promise<{ P: string; projectId: string }> {
  const call = (method: string, path: string, body?: unknown) => stack.request(owner, method, path, body)
  const project = created(await call('POST', '/projects', { name: 'ack 전 되돌리기', slug: `${slug}-${Date.now().toString(36)}` }))
  if (withBob) created(await call('POST', `/projects/${project.id}/members`, { email: stack.users.bob.email, role: 'editor' }))
  const menu = created(await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '메뉴' }))
  const target = created(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '첫째' }))
  const P = `/projects/${project.id}/pages/${target.id}`
  const texts = [1, 2, 3].map((n, index) => ({
    op: 'add',
    path: `/root/children/${index}`,
    value: { id: `n_text000000${n}`, type: 'Text', props: { content: `글 ${n} — 캔버스를 채운다` } },
  }))
  const field = { op: 'add', path: '/root/children/3', value: { id: 'n_field000001', type: 'Field', props: { label: '이름' } } }
  const seeded = await call('PATCH', `${P}/ops`, { baseSeq: 0, ops: [...texts, field] })
  if (seeded.status >= 300) throw new Error(`픽스처 ops ${seeded.status} ${JSON.stringify(seeded.body)}`)
  return { P, projectId: project.id }
}

function created(response: { status: number; body: any }): { id: string } {
  if (response.status >= 300) throw new Error(`픽스처 ${response.status} ${JSON.stringify(response.body)}`)
  return response.body
}
