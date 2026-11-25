/**
 * **페이지 레이아웃의 에디터 입구를 실브라우저로 잰다**(설계 `docs/superpowers/specs/2026-11-25-page-layout-design.md` 「«페이지 정보» 탭의
 * «레이아웃»」 · 「에디터의 입구 — 머리의 «보기»」). jsdom 은 실제 WS · 리베이스 · 서버의 view-prefs 가 없다.
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 남이 먼저 레이아웃을 바꾼 판 | 남의 `replace /layout` 이 내 화면에 닿기 전에 «팝업» 을 누르면 리베이스가 내 묶음을 버리지 않는다(첫 `test /layout` 이 없다) — 서버가 팝업이 된다 |
 * | «보기» — GET 전에 바꾸고 PUT 이 실패 | 읽기의 답이 오기 전에 영역을 끄고 그 PUT 이 실패하면 화면이 서버가 가진 값(`subpage.gnb`)과 갈린다 — 실패가 GET 의 답보다 먼저인 판 · 뒤인 판 둘 다 |
 *
 * 서버의 view-prefs 는 GET 을 `page.route` 로 붙잡아 늦추고 PUT 을 전부 500 으로 끊는다 — 붙잡은 GET 수 · 끊은 PUT 수가 판 카나리아다.
 */
import { isolateBidi } from '@wirebound/schema'
import type { Page, Route } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canvasFrame, editorStackPrerequisite, poll, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

/** 보기 설정을 저장하지 못했을 때 하단 바의 한 줄(`src/store/use-view-prefs.ts` 의 `VIEW_PREFS_FAILED`). */
const VIEW_PREFS_FAILED = '보기 설정을 저장하지 못했습니다'

describe.skipIf(!전제.ok)('페이지 레이아웃의 에디터 입구 — 실브라우저', () => {
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

  /** 프로젝트 · 메뉴 · 서브페이지 하나(글 노드 하나) · bob 은 editor. */
  async function fixture(slug: string): Promise<{ projectId: string; P: string }> {
    const project = (await call('POST', '/projects', { name: '레이아웃', slug: `${slug}-${Date.now().toString(36)}` })).body
    const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '회원관리' })).body
    const member = await call('POST', `/projects/${project.id}/members`, { email: stack.users.bob.email, role: 'editor' })
    if (member.status >= 300) throw new Error(`member ${member.status}`)
    const made = await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '회원 목록', layout: 'subpage' })
    if (made.status >= 300) throw new Error(`page ${made.status} ${JSON.stringify(made.body)}`)
    const P = `/projects/${project.id}/pages/${made.body.id as string}`
    const seeded = await call('PATCH', `${P}/ops`, {
      baseSeq: 0,
      ops: [{ op: 'add', path: '/root/children/0', value: { id: 'n_text0000001', type: 'Text', props: { content: '본문' } } }],
    })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status}`)
    return { projectId: project.id as string, P }
  }

  async function serverDoc(P: string): Promise<{ schema: { layout: string; root: { type: string } }; headSeq: number }> {
    return (await call('GET', P)).body
  }

  const frames = (page: Page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))

  // 서버는 낡은 `baseSeq` 의 묶음을 거절하고(`stale`) 클라이언트가 남의 판 위로 다시 얹는다 — 그때 첫 `test /layout` 이 실패해 묶음째 버려진다.
  // 남의 바꿈은 `replace /layout` 하나라(뿌리는 그대로) 내 묶음의 `test /root/type` 은 맞는다 — `test /layout` 만 막는 판이다.
  it('남의 레이아웃 바꿈이 내 화면에 닿기 전에 «팝업» 을 누르면 묶음째 버려진다 — 서버 · 화면은 남의 «빈»', async () => {
    const { P } = await fixture('lu-rebase')
    // 서버 → 브라우저 WS 를 늦춰 남의 프레임이 누름 뒤에 닿게 한다.
    const delay = await stack.startDownDelay(2_500)
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 }, origin: delay.origin })
    const patches: string[] = []
    const received: string[] = []
    page.on('websocket', (socket) => {
      socket.on('framesent', (frame) => {
        const payload = typeof frame.payload === 'string' ? frame.payload : frame.payload.toString()
        if (payload.includes('"type":"patch"')) patches.push(payload)
      })
      socket.on('framereceived', (frame) => {
        received.push(typeof frame.payload === 'string' ? frame.payload : frame.payload.toString())
      })
    })
    try {
      await page.goto(P)
      await canvasFrame(page).locator('[data-wb-id]').first().waitFor({ state: 'attached' })
      // 편집이 WS 로 나가는 판 — 룸에 든 뒤에 누른다(그 전의 편집은 REST 로 나간다).
      await poll(
        '룸에 듦',
        async () => received.some((frame) => frame.includes('"type":"joined"')),
        (got) => got,
      )
      await page.getByRole('tab', { name: '페이지 정보', exact: true }).click()
      const group = page.getByRole('radiogroup', { name: '레이아웃', exact: true })
      await group.getByRole('radio', { name: '서브페이지', exact: true }).waitFor()
      expect(await group.getByRole('radio', { name: '서브페이지', exact: true }).getAttribute('aria-checked')).toBe('true')

      const theirs = await stack.request(bob, 'PATCH', `${P}/ops`, {
        baseSeq: (await serverDoc(P)).headSeq,
        ops: [
          { op: 'test', path: '/layout', value: 'subpage' },
          { op: 'replace', path: '/layout', value: 'blank' },
        ],
      })
      expect(theirs.status).toBe(200)
      const sentBefore = patches.length
      await group.getByRole('radio', { name: '팝업', exact: true }).click()
      // 판 카나리아 — 내 묶음이 나갔고(남의 프레임이 아직 안 닿아 화면은 서브페이지였다) 그 묶음이 팝업으로 바꾸는 것이다.
      await poll(
        '보낸 편집',
        async () => patches.length,
        (n) => n > sentBefore,
      )
      expect(patches[sentBefore]).toContain('"popup"')
      expect(received.some((frame) => frame.includes('"blank"'))).toBe(false)

      // 늦춘 시간이 지나 남의 프레임이 닿을 때까지 기다린 뒤(재는 값은 기다림에 안 넣는다), 리베이스 · 다시 보냄이 설 시간을 더 둔다.
      await poll(
        '남의 프레임이 닿음',
        async () => received.some((frame) => frame.includes('"blank"')),
        (got) => got,
        15_000,
      )
      await new Promise((resolve) => setTimeout(resolve, 3_000))
      await frames(page)
      const doc = await serverDoc(P)
      expect({
        server: { layout: doc.schema.layout, root: doc.schema.root.type },
        screen: await group.locator('[role="radio"][aria-checked="true"]').textContent(),
        delayed: delay.delayed() > 0,
      }).toEqual({ server: { layout: 'blank', root: 'Page' }, screen: '빈', delayed: true })
    } finally {
      await context.close()
      await delay.close()
    }
  }, 60_000)

  /**
   * «보기» 의 실패 되돌림(`src/store/use-view-prefs.ts` 머리말의 표 «마지막으로 보낸 PUT 이 실패하면») — 서버에는 GNB 를 끈 값이 있고, 에디터는
   * 그 GET 의 답을 받기 전에 LNB 를 끈다. PUT 은 500 이다. `order` 가 GET 의 답과 PUT 실패의 차례다.
   */
  async function viewPrefsRace(order: 'fail-then-read' | 'read-then-fail') {
    const { projectId, P } = await fixture(`lu-prefs-${order}`)
    const stored = await call('PUT', `/projects/${projectId}/view-prefs`, { hiddenRegions: ['subpage.gnb'] })
    expect(stored.status).toBe(200)
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
    let releaseRead!: () => void
    const readGate = new Promise<void>((resolve) => (releaseRead = resolve))
    let releasePut!: () => void
    const putGate = new Promise<void>((resolve) => (releasePut = resolve))
    const count = { heldReads: 0, cutPuts: 0 }
    await page.route(/\/api\/projects\/[^/]+\/view-prefs$/, async (route: Route) => {
      if (route.request().method() === 'GET') {
        count.heldReads += 1
        await readGate
        await route.continue()
        return
      }
      count.cutPuts += 1
      await putGate
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'internal', message: '서버 오류' }),
      })
    })
    try {
      await page.goto(P)
      const canvas = canvasFrame(page)
      await canvas.locator('[data-wb-id]').first().waitFor({ state: 'attached' })
      // 판 카나리아 — GET 이 붙잡혀 있고 그동안 캔버스는 다 켠 판이다(GNB 가 섰다).
      await poll(
        '붙잡은 GET',
        async () => count.heldReads,
        (n) => n > 0,
      )
      expect(await canvas.locator('[data-wb-layout-region="gnb"]').count()).toBe(1)

      const view = page.getByRole('button', { name: '보기', exact: true })
      await view.click()
      const menu = page.getByRole('menu', { name: '보기', exact: true })
      await menu.getByRole('menuitemcheckbox', { name: isolateBidi('LNB'), exact: true }).click()
      await poll(
        '나간 PUT',
        async () => count.cutPuts,
        (n) => n > 0,
      )
      const read = page.waitForResponse((response) => response.request().method() === 'GET' && /\/view-prefs$/.test(response.url()))
      if (order === 'fail-then-read') {
        releasePut()
        await page.getByText(VIEW_PREFS_FAILED, { exact: false }).first().waitFor()
        releaseRead()
        await read
      } else {
        releaseRead()
        await read
        await frames(page)
        releasePut()
        await page.getByText(VIEW_PREFS_FAILED, { exact: false }).first().waitFor()
      }
      await frames(page)
      const item = (name: string) =>
        menu.getByRole('menuitemcheckbox', { name: isolateBidi(name), exact: true }).getAttribute('aria-checked')
      const server = (await call('GET', `/projects/${projectId}/view-prefs`)).body
      expect({
        menu: { gnb: await item('GNB'), lnb: await item('LNB') },
        canvas: {
          gnb: await canvas.locator('[data-wb-layout-region="gnb"]').count(),
          lnb: await canvas.locator('[data-wb-layout-region="lnb"]').count(),
        },
        server,
      }).toEqual({ menu: { gnb: 'false', lnb: 'true' }, canvas: { gnb: 0, lnb: 1 }, server: { hiddenRegions: ['subpage.gnb'] } })
      expect(count.cutPuts).toBeGreaterThan(0)
    } finally {
      releaseRead()
      releasePut()
      await context.close()
    }
  }

  it('«보기» — GET 의 답 전에 바꾸고 PUT 이 먼저 실패하면 GET 의 답으로 맞춘다(화면 = 서버)', async () => {
    await viewPrefsRace('fail-then-read')
  }, 60_000)

  it('«보기» — GET 의 답 전에 바꾸고 GET 의 답 뒤에 PUT 이 실패하면 그 답으로 되돌린다(화면 = 서버)', async () => {
    await viewPrefsRace('read-then-fail')
  }, 60_000)
})
