/**
 * **N19 — 화면 상태 · 통지 · 문안 마무리를 실브라우저로 잰다**(`docs/superpowers/plans/2026-10-11-n19-report.md`). jsdom 은 배치(요소 상자) · 입력의 글자 수 ·
 * 늦은 WS 도착 차례가 없어 아래 값을 못 잰다.
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | L-244 영역이 영역의 직계 자식 | 뷰 모드 표지의 상자가 편집 모드 표지의 상자와 갈린다(바깥 영역에 표지가 안 서거나 안쪽 상자만 잰다) |
 * | L-245 머리 전환기로 선택이 빠짐 | 사람이 상태를 바꿔 선택이 빠지는 판에 통지가 안 서거나 문장이 그 판에 안 맞는다 |
 * | L-246 상태 이름의 방향 제어 글자 | 서버가 상태 이름의 방향 제어 글자를 받는다(그러면 `'…'(… 상태)` 문장에 격리 없이 든다) |
 * | L-247 열린 페이지가 함께 지워짐 | 연쇄 상자를 닫으며 남긴 한 줄이 «사라짐» 확인의 `clearPage` 에 같이 치워진다 |
 * | L-248 미룬 되돌리기 뒤 페이지 이동 | 한 줄이 새 페이지 위에서 «이전 화면에서» 라고 밝히지 않는다 · 미룬 되돌림이 새 판에 나간다 |
 * | L-249 423 · viewer 강등 | 423 거절이 «저장되지 않아» 로 안 버려진다 · 강등된 뒤 미룬 되돌림이 서버를 바꾼다 |
 * | L-113 (c) 이름만 바뀐 연쇄 상자 | 목록이 바뀐 뒤(409 목록을 쥔 판) 남이 바꾼 이름이 상자에 안 보인다 |
 * | L-241 별칭 칸의 이모지 | 칸이 이모지를 UTF-16 으로 세어 30개에서 멈춘다 · 서버 별칭이 60 코드 포인트가 아니다 |
 */
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { HIDDEN_SELECTION_NOTICE } from '../src/shell/use-view-state'
import { canvasFrame, editorStackPrerequisite, poll, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

const text = (id: string, content: string) => ({ id, type: 'Text', props: { content } })

describe.skipIf(!전제.ok)('N19 화면 상태 · 통지 — 실브라우저', () => {
  let stack: EditorStack
  let alice: Session

  beforeAll(async () => {
    if (!전제.ok) return
    stack = await startEditorStack(전제)
    alice = await stack.login(stack.users.alice)
  })

  afterAll(async () => {
    if (stack === undefined) return
    const { before, after } = await stack.close()
    expect(before.processes).toBeGreaterThan(0)
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  })

  const call = (m: string, p: string, b?: unknown) => stack.request(alice, m, p, b)

  async function fixture(slug: string, nodes: unknown[], viewStates: unknown[] = []): Promise<string> {
    const project = (await call('POST', '/projects', { name: 'N19', slug: `${slug}-${Date.now().toString(36)}` })).body
    const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '가' })).body
    const pageId = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '쪽' })).body.id
    const P = `/projects/${project.id}/pages/${pageId}`
    const ops: unknown[] = nodes.map((value, at) => ({ op: 'add', path: `/root/children/${at}`, value }))
    if (viewStates.length > 0) ops.unshift({ op: 'add', path: '/viewStates', value: viewStates })
    const seeded = await call('PATCH', `${P}/ops`, { baseSeq: 0, ops })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
    return P
  }

  async function open(P: string, viewport = { width: 1440, height: 900 }) {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport })
    await page.goto(P)
    await canvasFrame(page).locator('[data-wb-id]').first().waitFor({ state: 'attached' })
    return { page, close: () => context.close() }
  }

  const frames = (page: Page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))

  it('영역이 영역의 직계 자식인 문서 — 뷰 모드 표지의 상자가 편집 모드 표지의 상자와 같다', async () => {
    const P = await fixture('n19-nested-region', [
      text('n_out', '영역 밖 글'),
      {
        id: 'n_sw',
        type: 'StateSwitch',
        children: [
          {
            id: 'n_cd',
            type: 'StateCase',
            props: { state: 'default' },
            children: [
              {
                id: 'n_in',
                type: 'StateSwitch',
                children: [{ id: 'n_cdi', type: 'StateCase', props: { state: 'default' }, children: [text('n_dt', '안쪽 글')] }],
              },
            ],
          },
        ],
      },
    ])
    const { page, close } = await open(P)
    try {
      await frames(page)
      const edit = await page.evaluate(() =>
        [...document.querySelectorAll('[data-wb-region-for]')].map((el) => {
          const box = (el as HTMLElement).getBoundingClientRect()
          return [el.getAttribute('data-wb-region-for'), Math.round(box.left), Math.round(box.top), Math.round(box.width), Math.round(box.height)]
        }),
      )
      await page.getByRole('button', { name: '뷰 모드' }).click()
      await page.waitForTimeout(300)
      await frames(page)
      const view = await page.evaluate(() =>
        [...document.querySelectorAll('[data-wb-state-region-for]')].map((el) => {
          const box = (el as HTMLElement).getBoundingClientRect()
          return [el.getAttribute('data-wb-state-region-for'), Math.round(box.left), Math.round(box.top), Math.round(box.width), Math.round(box.height)]
        }),
      )
      expect(view).toEqual(edit)
      // 두 영역의 상자가 같아 표지 둘이 같은 자리에 겹쳐 선다(편집 모드의 꼬리표 둘도 같다) — 표지가 영역마다 하나씩 서는 것만 잠근다.
      expect(await page.locator('[data-wb-state-badge-for]').evaluateAll((els) => els.map((el) => el.getAttribute('data-wb-state-badge-for')))).toEqual(['n_sw', 'n_in'])
    } finally {
      await close()
    }
  }, 120_000)

  it('L-246 — 상태 이름의 방향 제어 글자는 입구(서버의 상태 목록 규칙)가 막는다 — 화면 문장에 이르지 않는다', async () => {
    const P = await fixture('n19-bidi-state', [text('n_out', '글')], [{ id: 's_ok', name: '관리자' }])
    const head = (await call('GET', P)).body.headSeq as number
    const rlo = '\u202e'
    const seen: Record<string, unknown> = {}
    const tries: Record<string, unknown[]> = {
      addList: [{ op: 'add', path: '/viewStates/-', value: { id: 's_bad', name: `나${rlo}쁜` } }],
      replaceName: [{ op: 'replace', path: '/viewStates/0/name', value: `x${rlo}y` }],
      replaceAll: [{ op: 'replace', path: '/viewStates', value: [{ id: 's_bad', name: `isolate\u2066z` }] }],
    }
    for (const [label, ops] of Object.entries(tries)) {
      const res = await call('PATCH', `${P}/ops`, { baseSeq: head, ops })
      seen[label] = res.status
    }
    expect(seen).toEqual({ addList: 422, replaceName: 422, replaceAll: 422 })
  }, 60_000)

  it('L-245 — 사람이 머리 전환기로 상태를 바꿔 선택이 빠지는 판에도 같은 통지가 선다(문장은 그 판에도 참이다)', async () => {
    const ADMIN = { id: 's_admin', name: '관리자' }
    const P = await fixture(
      'n19-prune',
      [
        text('n_out', '글'),
        {
          id: 'n_sw',
          type: 'StateSwitch',
          children: [
            { id: 'n_cd', type: 'StateCase', props: { state: 'default' }, children: [text('n_dt', '기본 글')] },
            { id: 'n_ca', type: 'StateCase', props: { state: ADMIN.id }, children: [text('n_at', '관리자 글')] },
          ],
        },
      ],
      [ADMIN],
    )
    const { page, close } = await open(P)
    try {
      await page.locator('[data-tree-id="n_dt"] > button').first().click()
      await frames(page)
      const before = await page.locator('.wb-shell-info-notice').allTextContents()
      await page.getByRole('button', { name: /^화면 상태:/ }).click()
      await page.getByRole('menuitemradio', { name: '관리자', exact: true }).click()
      await page.waitForTimeout(500)
      await frames(page)
      const after = await page.locator('.wb-shell-info-notice').allTextContents()
      const selected = await page.locator('[data-tree-id][aria-selected="true"], [data-tree-id][data-selected="true"]').count()
      expect({ before, after, selected }).toEqual({ before: [], after: [HIDDEN_SELECTION_NOTICE], selected: 0 })
    } finally {
      await close()
    }
  }, 60_000)

  it('L-247 — 열린 페이지가 함께 지워져도 연쇄 상자를 닫으며 남긴 한 줄이 캔버스의 «대상을 찾을 수 없습니다» 뒤에도 남는다', async () => {
    const mk = async (path: string, body: unknown) => {
      const r = await call('POST', path, body)
      if (r.status !== 201) throw new Error(`픽스처 ${r.status} ${JSON.stringify(r.body)}`)
      return r.body.id as string
    }
    const project = await mk('/projects', { name: 'N19', slug: `n19-gone-${Date.now().toString(36)}` })
    const P = `/projects/${project}`
    const m1 = await mk(`${P}/menu`, { parentId: null, title: '가' })
    const m2 = await mk(`${P}/menu`, { parentId: null, title: '나' })
    const p1 = await mk(`${P}/pages`, { menuNodeId: m1, title: '가1' })
    await mk(`${P}/pages`, { menuNodeId: m2, title: '나1' })
    const member = await call('POST', `${P}/members`, { email: stack.users.bob.email, role: 'editor' })
    if (member.status >= 300) throw new Error(`member ${member.status}`)
    const { context, page } = await stack.openTab(stack.users.bob, { viewport: { width: 1440, height: 900 } })
    try {
      await page.goto(`${P}/pages/${p1}`)
      await canvasFrame(page).locator('[data-wb-id]').first().waitFor({ state: 'attached' })
      await page.locator('[data-tree-row]').first().waitFor({ state: 'attached' })
      await page.waitForTimeout(500)
      const row = page.locator(`[data-tree-row][data-tree-id="${m1}"]`)
      await row.locator('> button, > a').first().hover()
      await row.getByRole('button', { name: '가 더 보기', exact: true }).click()
      await page.getByRole('menuitem', { name: '삭제', exact: true }).click()
      await page.getByRole('dialog', { name: '메뉴 삭제', exact: true }).waitFor()
      const tree = (await call('GET', `${P}/tree`)).body
      const sub = tree.menu.find((m: { id: string }) => m.id === m1)
      const del = await call('DELETE', `${P}/menu/${m1}`, { cascade: true, expect: { menuIds: [], pageIds: sub.pages.map((x: { id: string }) => x.id) } })
      expect(del.status).toBe(200)
      // 한 줄이 서고 3s 동안 그대로다 — 캔버스의 «사라짐» 확인이 판을 비우는 자리(`clearPage`)가 한 줄을 치우지 않는다.
      const want = ['대상을 찾을 수 없습니다', '"가" 메뉴가 트리에서 사라져 삭제 상자를 닫았습니다']
      await poll('두 줄이 선다', () => page.getByRole('alert').allTextContents(), (texts) => want.every((line) => texts.includes(line)), 5_000)
      await page.waitForTimeout(3_000)
      expect({ dialog: await page.getByRole('dialog').count(), alerts: await page.getByRole('alert').allTextContents() }).toEqual({ dialog: 0, alerts: want })
    } finally {
      await context.close()
    }
  }, 60_000)

  it('L-248 — 미룬 되돌리기를 두고 페이지를 옮기면 한 줄이 «이전 화면에서» 라고 밝혀 새 페이지 위에 선다', async () => {
    const mk = async (path: string, body: unknown) => {
      const r = await call('POST', path, body)
      if (r.status !== 201) throw new Error(`픽스처 ${r.status} ${JSON.stringify(r.body)}`)
      return r.body.id as string
    }
    const project = await mk('/projects', { name: 'N19', slug: `n19-undo-move-${Date.now().toString(36)}` })
    const menu = await mk(`/projects/${project}/menu`, { parentId: null, title: '메뉴' })
    const first = await mk(`/projects/${project}/pages`, { menuNodeId: menu, title: '첫째' })
    const second = await mk(`/projects/${project}/pages`, { menuNodeId: menu, title: '둘째' })
    const P = `/projects/${project}/pages/${first}`
    const texts = [1, 2, 3].map((n, index) => ({ op: 'add', path: `/root/children/${index}`, value: { id: `n_text000000${n}`, type: 'Text', props: { content: `글 ${n}` } } }))
    const seeded = await call('PATCH', `${P}/ops`, { baseSeq: 0, ops: texts })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status}`)
    const delay = await stack.startDownDelay(600)
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 }, origin: delay.origin })
    const log: string[] = []
    page.on('websocket', (ws) => ws.on('framereceived', (frame) => log.push(String(frame.payload).slice(0, 40))))
    try {
      await page.goto(P)
      await canvasFrame(page).locator('[data-wb-id="n_text0000002"]').click()
      await poll('WS 가 늦춰진 채 붙는다', async () => delay.delayed(), (n) => n >= 1)
      await poll('룸에 든다', async () => log.slice(), (lines) => lines.some((line) => line.includes('"joined"')))
      await page.keyboard.press('Alt+ArrowUp')
      await poll('서버에 닿는다', async () => (await call('GET', P)).body.headSeq, (n) => n === 2)
      await page.keyboard.press('ControlOrMeta+z')
      await page.locator(`[data-tree-row][data-tree-id="${second}"] > a, [data-tree-row][data-tree-id="${second}"] > button`).first().click()
      // 한 줄은 새 페이지 위에 서므로 «이전 화면에서» 로 어느 화면의 되돌리기였는지 밝힌다 — 그렇지 않으면 새 페이지의 되돌리기로 읽힌다.
      const line = '화면이 바뀌어 이전 화면에서 미뤄 둔 되돌리기는 하지 않았습니다.'
      await poll('한 줄이 선다', () => page.getByRole('alert').allTextContents(), (texts) => texts.includes(line), 5_000)
      // 늦춘 WS 의 ack(600ms)가 닿은 뒤에도 그대로이고 서버에는 옮김 하나뿐이다(미룬 되돌림이 안 나갔다).
      await page.waitForTimeout(1_500)
      expect({
        alerts: await page.getByRole('alert').allTextContents(),
        onSecond: new URL(page.url()).pathname.split('/').pop() === second,
        headSeq: (await call('GET', P)).body.headSeq,
      }).toEqual({ alerts: [line], onSecond: true, headSeq: 2 })
    } finally {
      await context.close()
    }
  }, 60_000)

  it('L-249 — 서버의 423 거절(남이 막 잠근 노드를 옮긴 편집)이 미룬 되돌리기를 두고 닿으면 «저장되지 않아» 로 버려지고 서버는 그대로다', async () => {
    const mk = async (path: string, body: unknown) => {
      const r = await call('POST', path, body)
      if (r.status !== 201) throw new Error(`픽스처 ${r.status} ${JSON.stringify(r.body)}`)
      return r.body.id as string
    }
    const project = await mk('/projects', { name: 'N19', slug: `n19-423-${Date.now().toString(36)}` })
    const menu = await mk(`/projects/${project}/menu`, { parentId: null, title: '메뉴' })
    const first = await mk(`/projects/${project}/pages`, { menuNodeId: menu, title: '첫째' })
    const member = await call('POST', `/projects/${project}/members`, { email: stack.users.bob.email, role: 'editor' })
    if (member.status >= 300) throw new Error(`member ${member.status}`)
    const P = `/projects/${project}/pages/${first}`
    const texts = [1, 2, 3].map((n, index) => ({ op: 'add', path: `/root/children/${index}`, value: { id: `n_text000000${n}`, type: 'Text', props: { content: `글 ${n} — 캔버스를 채운다` } } }))
    const seeded = await call('PATCH', `${P}/ops`, { baseSeq: 0, ops: texts })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status}`)
    const D = 1500
    const delay = await stack.startDownDelay(D)
    const a = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 }, origin: delay.origin })
    const b = await stack.openTab(stack.users.bob, { viewport: { width: 1440, height: 900 } })
    const log: string[] = []
    const T0 = Date.now()
    a.page.on('websocket', (ws) => ws.on('framereceived', (frame) => log.push(`${Date.now() - T0} ${String(frame.payload).slice(0, 60)}`)))
    try {
      await a.page.goto(P)
      await canvasFrame(a.page).locator('[data-wb-id="n_text0000002"]').waitFor()
      await poll('WS 가 늦춰진 채 붙는다', async () => delay.delayed(), (n) => n >= 1)
      await poll('룸에 든다', async () => log.slice(), (lines) => lines.some((line) => line.includes('"joined"')))
      await b.page.goto(P)
      await canvasFrame(b.page).locator('[data-wb-id="n_text0000002"]').click()
      await b.page.waitForTimeout(400)
      await canvasFrame(a.page).locator('[data-wb-id="n_text0000002"]').click()
      await a.page.keyboard.press('Alt+ArrowDown')
      await a.page.keyboard.press('ControlOrMeta+z')
      await a.page.waitForTimeout(D * 3)
      const server = (await call('GET', P)).body
      // 판 카나리아 — 423 은 서버가 낸 것이다(늦춘 WS 로 앞선 patch-error 프레임이 닿았다) · 잠금 알림은 그 뒤에 닿았다.
      expect(log.some((line) => line.includes('"patch-error"'))).toBe(true)
      expect({ alerts: await a.page.locator('.wb-shell-edit-alert').allTextContents(), head: server.headSeq, ids: server.schema.root.children.map((c: { id: string }) => c.id) }).toEqual({
        alerts: ['밥님이 편집 중인 영역입니다 — 페이지를 서버 상태로 다시 불러왔고, 편집 1개가 취소됐습니다. 되돌리려던 편집이 저장되지 않아 되돌리지 않았습니다.'],
        head: 1,
        ids: ['n_text0000001', 'n_text0000002', 'n_text0000003'],
      })
    } finally {
      await a.context.close()
      await b.context.close()
      await delay.close()
    }
  }, 90_000)

  it('L-249 — 내 편집이 커밋된 뒤 ack 전에 viewer 로 강등되면 미룬 되돌리기는 나가지 않는다 — 서버는 내 편집까지만이다', async () => {
    const mk = async (path: string, body: unknown) => {
      const r = await call('POST', path, body)
      if (r.status !== 201) throw new Error(`픽스처 ${r.status} ${JSON.stringify(r.body)}`)
      return r.body
    }
    const project = (await mk('/projects', { name: 'N19', slug: `n19-r11-${Date.now().toString(36)}` })).id as string
    const menu = (await mk(`/projects/${project}/menu`, { parentId: null, title: '메뉴' })).id as string
    const first = (await mk(`/projects/${project}/pages`, { menuNodeId: menu, title: '첫째' })).id as string
    const member = await mk(`/projects/${project}/members`, { email: stack.users.bob.email, role: 'editor' })
    const P = `/projects/${project}/pages/${first}`
    const texts = [1, 2, 3].map((n, index) => ({ op: 'add', path: `/root/children/${index}`, value: { id: `n_text000000${n}`, type: 'Text', props: { content: `글 ${n} — 캔버스를 채운다` } } }))
    const seeded = await call('PATCH', `${P}/ops`, { baseSeq: 0, ops: texts })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status}`)
    const D = 1500
    const delay = await stack.startDownDelay(D)
    const b = await stack.openTab(stack.users.bob, { viewport: { width: 1440, height: 900 }, origin: delay.origin })
    const log: string[] = []
    const T0 = Date.now()
    b.page.on('websocket', (ws) => ws.on('framereceived', (frame) => log.push(`${Date.now() - T0} ${String(frame.payload).slice(0, 50)}`)))
    try {
      await b.page.goto(P)
      await canvasFrame(b.page).locator('[data-wb-id="n_text0000002"]').click()
      await poll('WS 가 늦춰진 채 붙는다', async () => delay.delayed(), (n) => n >= 1)
      await poll('룸에 든다', async () => log.slice(), (lines) => lines.some((line) => line.includes('"joined"')))
      await b.page.keyboard.press('Alt+ArrowUp')
      await poll('서버에 닿는다', async () => (await call('GET', P)).body.headSeq, (n) => n === 2)
      await b.page.keyboard.press('ControlOrMeta+z')
      const demoted = await call('PATCH', `/projects/${project}/members/${member.userId}`, { role: 'viewer' })
      await b.page.waitForTimeout(D * 3)
      const server = (await call('GET', P)).body
      // 판 카나리아 — 강등 알림(`membership-changed`)이 ack 뒤에 닿았다(되돌림이 풀린 뒤 강등이 닿는 차례).
      const order = log.map((line) => line.split('"')[3] ?? '').filter((type) => type === 'patch-ack' || type === 'membership-changed')
      expect({ demoted: demoted.status, order, head: server.headSeq, ids: server.schema.root.children.map((c: { id: string }) => c.id) }).toEqual({
        demoted: 200,
        order: ['patch-ack', 'membership-changed'],
        head: 2,
        ids: ['n_text0000002', 'n_text0000001', 'n_text0000003'],
      })
    } finally {
      await b.context.close()
      await delay.close()
    }
  }, 90_000)

  it('L-113 (c) — 연쇄 상자가 열려 있는 동안 남이 이름만 바꾼 페이지가 새 이름으로 보인다 — 목록이 바뀐 뒤(409 목록을 쥔 판)에도', async () => {
    const mk = async (path: string, body: unknown) => {
      const r = await call('POST', path, body)
      if (r.status !== 201) throw new Error(`픽스처 ${r.status} ${JSON.stringify(r.body)}`)
      return r.body.id as string
    }
    const out: Record<string, unknown> = {}
    for (const variant of ['plain', 'afterListChange'] as const) {
      const project = await mk('/projects', { name: 'N19', slug: `n19-c-${variant.slice(0, 5)}-${Date.now().toString(36)}` })
      const P = `/projects/${project}`
      const m1 = await mk(`${P}/menu`, { parentId: null, title: '가' })
      const m2 = await mk(`${P}/menu`, { parentId: null, title: '나' })
      const p1 = await mk(`${P}/pages`, { menuNodeId: m1, title: '가1' })
      await mk(`${P}/pages`, { menuNodeId: m1, title: '가2' })
      const p2 = await mk(`${P}/pages`, { menuNodeId: m2, title: '나1' })
      const member = await call('POST', `${P}/members`, { email: stack.users.bob.email, role: 'editor' })
      if (member.status >= 300) throw new Error(`member ${member.status}`)
      const { context, page } = await stack.openTab(stack.users.bob, { viewport: { width: 1440, height: 900 } })
      try {
        await page.goto(`${P}/pages/${p2}`)
        await canvasFrame(page).locator('[data-wb-id]').first().waitFor({ state: 'attached' })
        await page.locator('[data-tree-row]').first().waitFor({ state: 'attached' })
        await page.waitForTimeout(500)
        const row = page.locator(`[data-tree-row][data-tree-id="${m1}"]`)
        await row.locator('> button, > a').first().hover()
        await row.getByRole('button', { name: '가 더 보기', exact: true }).click()
        await page.getByRole('menuitem', { name: '삭제', exact: true }).click()
        const dialog = page.getByRole('dialog', { name: '메뉴 삭제', exact: true })
        await dialog.waitFor()
        const listed = () => dialog.locator('.wb-shell-menu-delete-pages li').allTextContents()
        if (variant === 'afterListChange') {
          await mk(`${P}/pages`, { menuNodeId: m1, title: '가3' })
          await dialog.getByText('목록이 바뀌었습니다').waitFor({ timeout: 4000 })
        }
        const before = await listed()
        const renamed = await call('PATCH', `${P}/pages/${p1}`, { title: '가1 바뀜' })
        await page.waitForTimeout(1500)
        out[variant] = { renamed: renamed.status, before, after: await listed() }
      } finally {
        await context.close()
      }
    }
    expect(out).toEqual({
      plain: { renamed: 200, before: ['가1', '가2'], after: ['가1 바뀜', '가2'] },
      afterListChange: { renamed: 200, before: ['가1', '가2', '가3'], after: ['가1 바뀜', '가2', '가3'] },
    })
  }, 90_000)

  it('L-241 — 별칭 칸은 이모지를 코드 포인트로 센다 — 70개를 치면 60개에서 멈추고 서버의 별칭도 60 코드 포인트다', async () => {
    const P = await fixture('n19-emoji', [{ id: 'n_card00000001', type: 'Card', props: { title: '회원' } }])
    const { page, close } = await open(P, { width: 1280, height: 800 })
    try {
      await page.locator('[data-tree-id="n_card00000001"] > button').first().click()
      const field = page.getByRole('textbox', { name: '별칭' }).last()
      await field.fill('')
      await field.pressSequentially('😀'.repeat(70))
      const typed = await field.inputValue()
      await field.press('Enter')
      await page.waitForTimeout(800)
      const server = (await call('GET', P)).body.schema.root.children[0].alias
      expect({ points: [...typed].length, serverPoints: [...(server ?? '')].length }).toEqual({ points: 60, serverPoints: 60 })
    } finally {
      await close()
    }
  }, 60_000)
})
