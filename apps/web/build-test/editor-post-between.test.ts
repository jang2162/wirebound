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
 */
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { editorStackPrerequisite, poll, startEditorStack, type EditorStack, type Session } from './editor-stack'

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
})

async function fixture(stack: EditorStack, owner: Session, slug: string) {
  const call = (m: string, p: string, b?: unknown) => stack.request(owner, m, p, b)
  const project = (await call('POST', '/projects', { name: '사이 게시', slug: `${slug}-${Date.now().toString(36)}` })).body
  const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '메뉴' })).body
  const first = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '첫째' })).body
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
  await page.locator('.wb-shell-canvas-frame', { hasText: content }).waitFor()
  await page.locator('li button', { hasText: 'Text' }).first().click()
  const box = page.locator('.wb-shell-panel textarea').first()
  await box.waitFor()
  return box
}
