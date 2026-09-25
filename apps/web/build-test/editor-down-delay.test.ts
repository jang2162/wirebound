/**
 * **게시 응답이 사이 프레임보다 먼저 닿아도 번호가 제 노드에 붙는다** — 서버 → 브라우저 방향만 늦추는 도구(`editor-stack.ts` 의
 * `startDownDelay`)로 도착 순서를 뒤집어 잰다.
 *
 * 코멘트 게시는 번호를 매긴 revision 을 남기고, 그 번호는 게시의 응답(`seq`)으로 이 탭에 온다. 같은 페이지에 남이 먼저 번호를 매겼으면
 * 그 revision 은 WS 프레임으로 온다 — 서로 다른 연결이다. localhost 에서는 프레임이 대개 먼저지만 그 앞섬은 수 ms 라 망에서는 뒤집힌다.
 * 뒤집히면 응답의 `seq` 가 다음 번호가 아니다 — 웹은 사이 프레임을 기다렸다 얹는다(`store/editor-store.ts` 의 번호 기다림 · 한도 3s).
 * 기다리지 않고 얹으면 번호가 남의 노드에 붙고, 다음 편집이 남의 글을 덮는다.
 *
 * 판: `[가, 나]` 페이지. 앨리스의 WS 를 서버 → 브라우저로 `DELAY_MS` 늦춘다(REST 는 그대로). 밥이 «가» 에 첫 코멘트를 단다(seq 2 —
 * 그 프레임이 앨리스에게 늦게 간다). 곧바로 앨리스가 «나» 에 코멘트를 단다(seq 3 — 응답이 먼저 닿는다). 도착 순서는 로그로 잰다 — 응답이
 * 프레임보다 먼저가 아니면 판이 안 선 것이라 던진다.
 *
 * 단언은 성질이다 — 앨리스 화면의 번호(문서 순)가 서버 문서의 번호와 같고 통지가 없다.
 *
 * | 변조 | 값 |
 * |---|---|
 * | 웹이 번호 응답을 기다리지 않고 곧바로 얹는다(`applyMarkerChange` 의 사이 프레임 기다림을 뗌) | 화면 `["2"]` · 서버 `[1, 2]` — 밥의 번호를 잃는다 |
 * | `DELAY_MS` 를 0 으로(도구를 끈 판) | 카나리아 — 프레임이 응답보다 먼저 닿아 판이 안 선다 |
 */
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { editorStackPrerequisite, poll, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

/** 서버 → 브라우저 WS 지연 — 게시 한 번(수십 ms)보다 넉넉히 길고 번호 기다림의 한도(3s)보다 짧다. */
const DELAY_MS = 400

describe.skipIf(!전제.ok)('서버 → 브라우저 지연으로 뒤집은 도착 순서', () => {
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

  it('남의 번호 프레임보다 내 게시 응답이 먼저 닿아도 화면의 번호가 서버와 같다', async () => {
    const alice = await stack.login(stack.users.alice)
    const bob = await stack.login(stack.users.bob)
    const call = (method: string, path: string, body?: unknown) => stack.request(alice, method, path, body)
    const project = created(await call('POST', '/projects', { name: '뒤집힌 번호', slug: `down-delay-${Date.now().toString(36)}` }))
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

    const delay = await stack.startDownDelay(DELAY_MS)
    const { context, page } = await stack.openTab(stack.users.alice, { origin: delay.origin })
    const log = watch(page)
    try {
      await page.goto(P)
      await page.locator('.wb-shell-canvas-frame', { hasText: '나' }).waitFor()
      // 판이 섰는가 — 앨리스의 WS 가 지연 프록시를 지나 붙었다.
      await poll('앨리스의 WS 가 늦춰진 채 붙는다', async () => delay.delayed(), (n) => n >= 1)
      // 룸에 든 뒤에 게시한다 — 연결 id(`joined`)를 받기 전의 게시는 제 연결을 안 싣고 나가 방송이 제 탭에도 온다(다른 판이다).
      await poll('앨리스가 룸에 든다', async () => log.lines.slice(), (lines) => lines.includes('WS← joined'))
      await page.locator('li button', { hasText: 'Text' }).nth(1).click()
      await page.getByRole('tab', { name: '코멘트' }).click()
      await page.locator('#wb-comment-draft').fill('앨리스의 코멘트')

      const bobs = await stack.request(bob, 'POST', `${P}/comments`, { nodeId: 'n_ga00000001', body: '밥의 코멘트' })
      expect(bobs.status).toBe(201)
      log.lines.push(`밥 게시 seq ${bobs.body.seq}`)
      const posted = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().includes('/comments'))
      await page.getByRole('button', { name: '코멘트 달기' }).click()
      const response = await posted
      log.lines.push(`앨리스 게시 응답 ${response.status()} seq ${(await response.json()).seq}`)
      await poll('밥의 번호 프레임이 늦게 닿는다', async () => log.lines.slice(), (lines) => lines.some((line) => line.startsWith('WS← page-changed')))

      const after = await stable(page)
      const landed = await server(stack, alice, P)
      // eslint-disable-next-line no-console
      console.log(`[뒤집힌 번호] ${log.lines.join(' · ')} · 서버 ${JSON.stringify(landed)} · 앨리스 ${JSON.stringify(after)}`)
      // 판이 섰는가 — 앨리스의 게시 응답이 밥의 프레임보다 먼저 닿았다.
      const answeredAt = log.lines.findIndex((line) => line.startsWith('앨리스 게시 응답'))
      const frameAt = log.lines.findIndex((line) => line.startsWith('WS← page-changed'))
      expect(answeredAt).toBeLessThan(frameAt)
      expect(landed.markers).toEqual([1, 2])
      expect({ 번호: after.markers, 통지: after.notices }).toEqual({ 번호: landed.markers.map(String), 통지: [] })
    } finally {
      await context.close()
      await delay.close()
    }
  })
})

function created(response: { status: number; body: any }): { id: string } {
  if (response.status !== 201) throw new Error(`픽스처 ${response.status} ${JSON.stringify(response.body)}`)
  return response.body
}

/** 서버 문서의 번호 — 문서 순. */
async function server(stack: EditorStack, session: Session, path: string): Promise<{ head: number; markers: number[] }> {
  const page = (await stack.request(session, 'GET', path)).body
  return {
    head: page.headSeq as number,
    markers: (page.schema.root.children ?? []).map((child: any) => child.marker).filter((marker: unknown) => marker !== undefined),
  }
}

/** 게시 응답 · 받은 프레임을 시각 순으로 적는다. */
function watch(page: Page): { lines: string[] } {
  const lines: string[] = []
  page.on('websocket', (ws) => {
    ws.on('framereceived', (frame) => {
      const payload = String(frame.payload)
      if (/"type":"joined"/.test(payload)) lines.push('WS← joined')
      const kind = /"type":"(page-changed)"/.exec(payload)?.[1]
      if (kind !== undefined) lines.push(`WS← ${kind} seq ${/"seq":(\d+)/.exec(payload)?.[1]}`)
    })
  })
  return { lines }
}

/** 캔버스의 번호 · 머리 통지가 500ms 동안 안 바뀌면 그 값. */
async function stable(page: Page): Promise<{ markers: string[]; notices: string[] }> {
  const read = async () => ({
    markers: await page.locator('.wb-shell-canvas-frame .wb-shell-marker').allTextContents(),
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
