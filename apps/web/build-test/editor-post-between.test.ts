/**
 * **편집 둘 사이에 코멘트 게시가 끼어도 둘째 편집이 산다**(`EditorStore.beginMarkerWrite` · 전송 루프의 409 갈래).
 *
 * 편집 A 가 행 잠금에 줄 선 사이 코멘트를 게시하고(번호 revision — 줄 2) 편집 B 를 친다. 행을 놓으면 A 가 커밋되고(ack) B 가 A 의 번호
 * 위로 나가는데, 게시가 그 사이 커밋해 B 는 409 를 받는다. 번호 revision 의 방송은 낸 연결을 빼므로 번호는 게시의 REST 응답으로만 오고,
 * 그 응답과 WS 의 409 는 다른 연결이라 순서가 묶이지 않는다. 응답이 먼저면 리베이스가 B 를 번호 뒤로 옮겨 409 뒤 다시 낸다 — 늦으면 전송
 * 루프가 «번호가 안 움직였다»로 보고 수습으로 가 B 를 버렸다. [Chrome] 지연 0 에서 응답이 409 보다 4–7ms 앞(11/11 살아남) · 응답만 15ms
 * 늦추면 3/3 B 를 잃고 «편집 1개가 취소됐습니다». 앞섬이 망의 흔들림보다 작다(`CLAUDE.md` «서로 다른 연결로 가는 두 메시지의 도착 순서»).
 *
 * 고친 뒤: 409 를 받을 때 이 탭이 답을 기다리는 번호 쓰기가 있으면 그 답까지(한도 `MARKER_FRAME_WAIT_MS`) 기다린 뒤 번호가 움직였는지 본다.
 *
 * **그 기다림 동안 떠나면 B 를 잃는다고 말한다**(전송 루프의 `passedOver` — 기다림 뒤에 판정을 다시 본다). 떠나면 판째 버려지므로 B 는 저장되지
 * 않는다(고치기 전 소스도 같다 — 수습). 고치기 전에는 기다림 앞에서 끝난 버림 검사가 낡아, 기다림 뒤 수습이 «큐가 바뀌었다»로 물러나고 통지가
 * 0 이었다([Chrome] 3/3 — 409 뒤 ~180ms 에 둘째로 옮김 · 3.5s 동안 통지 0).
 */
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { editorStackPrerequisite, poll, startEditorStack, type EditorStack, type Session, canvasFrame } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

describe.skipIf(!전제.ok)('편집 둘 사이의 코멘트 게시', () => {
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

  for (const delay of [0, 15]) {
    it(`게시 응답을 ${delay}ms 늦춰도 둘째 편집이 번호 뒤로 저장된다`, async () => {
      const alice = await stack.login(stack.users.alice)
      const fx = await fixture(stack, alice, `between${delay}`)
      const { context, page } = await stack.openTab(stack.users.alice)
      const lines: string[] = []
      const started = Date.now()
      const at = (): string => `${Date.now() - started}ms`
      page.on('websocket', (ws) => {
        ws.on('framesent', (frame) => {
          const payload = String(frame.payload)
          if (payload.includes('"patch"')) lines.push(`${at()} WS→ patch baseSeq=${/"baseSeq":(\d+)/.exec(payload)?.[1]}`)
        })
        ws.on('framereceived', (frame) => {
          const payload = String(frame.payload)
          const kind = /"type":"(patch-ack|patch-error)"/.exec(payload)?.[1]
          if (kind !== undefined) lines.push(`${at()} WS← ${kind} ${/"(seq|status)":(\d+)/.exec(payload)?.[0] ?? ''}`)
        })
      })
      // 게시 응답만 늦춘다 — 서버는 이미 커밋했다. 브라우저가 번호를 늦게 안다. 0 이면 가로채지 않는다(가로채기만으로 몇 ms 늦는다).
      if (delay > 0) {
        await page.route('**/comments', async (route) => {
          if (route.request().method() !== 'POST') return route.fallback()
          const response = await route.fetch()
          const body = await response.body()
          await new Promise((resolve) => setTimeout(resolve, delay))
          await route.fulfill({ response, body })
        })
      }
      page.on('response', (response) => {
        if (response.request().method() === 'POST' && response.url().includes('/comments')) lines.push(`${at()} POST 코멘트 ${response.status()}`)
      })
      try {
        await page.goto(fx.P1)
        const box = await selectFirstText(page, '원문')
        await box.click()
        await box.fill('편집 A')
        const hold = await stack.holdRow('pages', fx.first)
        try {
          // 탭을 누르는 실클릭이 blur 로 A 를 낸다 — 행에 줄 선다.
          await page.getByRole('tab', { name: '코멘트' }).click()
          await hold.waitForWaiters(1)
          await page.locator('#wb-comment-draft').fill('사이에 낀 게시')
          await page.getByRole('button', { name: '코멘트 달기' }).click()
          await hold.waitForWaiters(2)
          await page.getByRole('tab', { name: '속성' }).click()
          const second = page.locator('.wb-shell-panel textarea').first()
          await second.click()
          await second.fill('편집 B')
          await second.evaluate((element) => (element as HTMLElement).blur())
          await page.waitForTimeout(150)
        } finally {
          await hold.release()
        }
        const final = await poll('B 가 서버에 선다', () => server(stack, alice, fx.P1), (value) => value.head >= 4, 8_000).catch(() =>
          server(stack, alice, fx.P1),
        )
        await page.waitForTimeout(500)
        const alerts = await page.locator('[role=alert]').allTextContents()
        // eslint-disable-next-line no-console
        console.log(`[사이 게시 ${delay}ms] ${lines.join(' · ')} · 서버 ${JSON.stringify(final)}`)

        expect({ 서버: final, 취소통지: alerts.some((text) => text.includes('취소됐습니다')) }).toEqual({
          서버: { head: 4, content: ['편집 B#1'] },
          취소통지: false,
        })
      } finally {
        await context.close()
      }
    })
  }
  it('게시 응답을 기다리는 동안 다른 페이지로 옮기면 저장되지 않은 둘째 편집을 말한다', async () => {
    const alice = await stack.login(stack.users.alice)
    const fx = await fixture(stack, alice, 'between-leave')
    const { context, page } = await stack.openTab(stack.users.alice)
    const lines: string[] = []
    const started = Date.now()
    const at = (): string => `${Date.now() - started}ms`
    page.on('websocket', (ws) => {
      ws.on('framereceived', (frame) => {
        const payload = String(frame.payload)
        if (payload.includes('"patch-error"')) lines.push(`${at()} WS← patch-error`)
      })
    })
    // 게시 응답을 1.5s 붙잡는다 — 409 를 받은 B 가 그 답을 기다리는 창이다(한도 3s 안).
    await page.route('**/comments', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      const response = await route.fetch()
      const body = await response.body()
      await new Promise((resolve) => setTimeout(resolve, 1_500))
      lines.push(`${at()} POST 코멘트 응답 풂`)
      await route.fulfill({ response, body })
    })
    try {
      await page.goto(fx.P1)
      const box = await selectFirstText(page, '원문')
      await box.click()
      await box.fill('편집 A')
      const hold = await stack.holdRow('pages', fx.first)
      try {
        await page.getByRole('tab', { name: '코멘트' }).click()
        await hold.waitForWaiters(1)
        await page.locator('#wb-comment-draft').fill('사이에 낀 게시')
        await page.getByRole('button', { name: '코멘트 달기' }).click()
        await hold.waitForWaiters(2)
        await page.getByRole('tab', { name: '속성' }).click()
        const second = page.locator('.wb-shell-panel textarea').first()
        await second.click()
        await second.fill('편집 B')
        await second.evaluate((element) => (element as HTMLElement).blur())
        await page.waitForTimeout(150)
      } finally {
        await hold.release()
      }
      await poll('B 의 409', async () => lines.join(' · '), (value) => value.includes('patch-error'), 5_000)
      await page.waitForTimeout(100)
      lines.push(`${at()} 둘째로 옮김`)
      await page.getByRole('link', { name: '둘째' }).click()
      const alert = page.locator('[role=alert]', { hasText: '저장되지 않았습니다' })
      const said = await alert.waitFor({ timeout: 4_000 }).then(
        async () => (await alert.textContent()) ?? '',
        () => '',
      )
      const final = await server(stack, alice, fx.P1)
      // eslint-disable-next-line no-console
      console.log(`[사이 게시 · 떠남] ${lines.join(' · ')} · 서버 ${JSON.stringify(final)} · 통지 ${JSON.stringify(said)}`)

      // 판 카나리아 — 409 를 받은 뒤 · 게시 응답을 풀기 전에 옮겼다(기다림 안에서 떠났다).
      const order = ['WS← patch-error', '둘째로 옮김', 'POST 코멘트 응답 풂'].map((mark) => lines.findIndex((line) => line.includes(mark)))
      expect(order.every((index, i) => index >= 0 && (i === 0 || index > order[i - 1]!))).toBe(true)
      expect({ 서버: final, 통지: said }).toEqual({
        서버: { head: 3, content: ['편집 A#1'] },
        통지: '페이지가 이미 변경되었습니다 (요청 baseSeq 2, 현재 3) — 떠난 페이지에서 보낸 편집 1개가 저장되지 않았습니다. 그 페이지를 다시 열어 확인하세요.',
      })
    } finally {
      await context.close()
    }
  })

  /**
   * **로그아웃이 한도에서 센 거절은 «저장되지 않았다»가 아니다**(`routes/editor.tsx`의 `settleEdits`). B 가 게시의 답을 기다리는 동안(큐에 남은 채)
   * 로그아웃의 한도가 먼저 지나고, 로그아웃 요청이 떠 있는 사이 게시 응답이 풀리면 리베이스가 B 를 번호 뒤로 옮겨 다시 내 커밋한다. 성질: 서버에
   * B 가 있으면 한 줄은 그것을 저장 안 됨으로 말하지 않는다 — 이 판에서는 «모름» 문장이다. 고치기 전에는 큐에 남은 거절 표시 편집을 «거절된 편집
   * 1개는 저장되지 않았습니다»로 셌다([Chrome] 2/2 — 서버 `head 4 · ['편집 B#1']`).
   *
   * 창을 넓히려고 로그아웃 요청을 2s 붙잡는다(느린 망) — 붙잡지 않으면 창이 몇 ms 다.
   */
  it('로그아웃 한도 뒤 번호가 와 다시 낸 편집을 «저장되지 않았다»로 말하지 않는다', async () => {
    const alice = await stack.login(stack.users.alice)
    const fx = await fixture(stack, alice, 'between-logout')
    const { context, page } = await stack.openTab(stack.users.alice)
    const lines: string[] = []
    const started = Date.now()
    const at = (): string => `${Date.now() - started}ms`
    page.on('websocket', (ws) => {
      ws.on('framesent', (frame) => {
        const payload = String(frame.payload)
        if (payload.includes('"patch"')) lines.push(`${at()} WS→ patch baseSeq=${/"baseSeq":(\d+)/.exec(payload)?.[1]}`)
      })
      ws.on('framereceived', (frame) => {
        const payload = String(frame.payload)
        const kind = /"type":"(patch-ack|patch-error)"/.exec(payload)?.[1]
        if (kind !== undefined) lines.push(`${at()} WS← ${kind}`)
      })
    })
    // 게시 응답을 2.5s 붙잡는다 — 409 를 받은 B 가 그 답을 기다리는 창이다(번호 기다림 한도 3s 안 · 로그아웃 한도 뒤).
    await page.route('**/comments', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      const response = await route.fetch()
      const body = await response.body()
      await new Promise((resolve) => setTimeout(resolve, 2_500))
      lines.push(`${at()} POST 코멘트 응답 풂`)
      await route.fulfill({ response, body })
    })
    await page.route('**/api/auth/logout', async (route) => {
      lines.push(`${at()} POST logout 붙잡음`)
      await new Promise((resolve) => setTimeout(resolve, 2_000))
      lines.push(`${at()} POST logout 보냄`)
      await route.fallback()
    })
    try {
      await page.goto(fx.P1)
      const box = await selectFirstText(page, '원문')
      await box.click()
      await box.fill('편집 A')
      const hold = await stack.holdRow('pages', fx.first)
      try {
        await page.getByRole('tab', { name: '코멘트' }).click()
        await hold.waitForWaiters(1)
        await page.locator('#wb-comment-draft').fill('사이에 낀 게시')
        await page.getByRole('button', { name: '코멘트 달기' }).click()
        await hold.waitForWaiters(2)
        await page.getByRole('tab', { name: '속성' }).click()
        const second = page.locator('.wb-shell-panel textarea').first()
        await second.click()
        await second.fill('편집 B')
        await second.evaluate((element) => (element as HTMLElement).blur())
        await page.waitForTimeout(150)
        // 409 앞에 누른다 — 로그아웃 한도(누른 뒤 3s)가 번호 기다림 한도(409 뒤 3s)보다 먼저 끝난다.
        lines.push(`${at()} 로그아웃 누름`)
        await page.getByRole('button', { name: '로그아웃' }).click()
        await page.waitForTimeout(1_000)
      } finally {
        await hold.release()
      }
      await page.waitForURL('**/login**', { timeout: 10_000 })
      await page.getByRole('heading', { name: 'wirebound' }).waitFor()
      await page.waitForTimeout(300)
      const said = (await page.locator('.wb-shell-login [role="status"]').allTextContents()).join(' | ')
      const final = await server(stack, alice, fx.P1)
      // eslint-disable-next-line no-console
      console.log(`[사이 게시 · 로그아웃] ${lines.join(' · ')} · 서버 ${JSON.stringify(final)} · 한 줄 ${JSON.stringify(said)}`)

      // 판 카나리아 — B 의 409 · 로그아웃 요청(한도 뒤) · 게시 응답 · B 를 다시 냄 · 그 ack 가 이 순서로 났다.
      const marks = ['WS← patch-error', '로그아웃 누름', 'POST logout 붙잡음', 'POST 코멘트 응답 풂', 'WS→ patch baseSeq=3', 'POST logout 보냄']
      const order = marks.map((mark) => lines.findIndex((line) => line.includes(mark)))
      expect(order.every((index) => index >= 0)).toBe(true)
      expect(order.slice(2).every((index, i) => index > order[i + 1]!)).toBe(true)
      expect(order[1]!).toBeLessThan(order[0]!)
      // 성질 — 서버에 B 가 있으면 한 줄은 그것을 저장 안 됨으로 말하지 않는다(이 판: «모름»).
      expect({ 서버: final, 한줄: said }).toEqual({
        서버: { head: 4, content: ['편집 B#1'] },
        한줄: '로그아웃 전에 보낸 편집 1개의 답을 받지 못해 서버에 반영됐는지 알 수 없습니다. 다시 로그인해 그 페이지를 확인하세요.',
      })
    } finally {
      await context.close()
    }
  })
})

async function fixture(stack: EditorStack, owner: Session, slug: string) {
  const call = (m: string, p: string, b?: unknown) => stack.request(owner, m, p, b)
  const project = (await call('POST', '/projects', { name: '사이 게시', slug: `${slug}-${Date.now().toString(36)}` })).body
  const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '메뉴' })).body
  const first = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '첫째' })).body
  // 떠날 곳 — 트리의 «둘째» 링크로 옮긴다.
  await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '둘째' })
  const P1 = `/projects/${project.id}/pages/${first.id}`
  const seeded = await call('PATCH', `${P1}/ops`, { baseSeq: 0, ops: [{ op: 'add', path: '/root/children/0', value: { id: 'n_one0000001', type: 'Text', props: { content: '원문' } } }] })
  if (seeded.status >= 300) throw new Error(`seed ${seeded.status}`)
  return { first: first.id as string, P1 }
}
async function server(stack: EditorStack, s: Session, path: string) {
  const page = (await stack.request(s, 'GET', path)).body
  return { head: page.headSeq as number, content: (page.schema.root.children ?? []).map((c: any) => `${c.props?.content}${c.marker ? '#' + c.marker : ''}`) }
}
async function selectFirstText(page: Page, content: string) {
  await canvasFrame(page).locator('body', { hasText: content }).waitFor()
  await page.locator('li button', { hasText: 'Text' }).first().click()
  const box = page.locator('.wb-shell-panel textarea').first()
  await box.waitFor()
  return box
}
