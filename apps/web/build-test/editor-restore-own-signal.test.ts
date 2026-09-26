/**
 * **연결 id 없이 나간 내 복원의 신호가 복원 배너를 세우지 않는다**(`EditorStore.markRestored`의 안전망 스냅샷 id · 복원 id).
 *
 * 복원의 방송은 낸 연결도 빼지 않으므로(서버 `ws/notify.ts`의 `notifyRestored`) 내 복원의 신호는 늘 이 탭에 온다 — 이 판은 그 신호가
 * **다시 붙은 소켓**에 오는 칸이다(차례 넷은 `editor-restore-signal-order.test.ts`). 방송은 연결마다 권한을 물은 뒤 보내 REST 응답보다 늦을 수
 * 있다 — 내 다시 읽기가 시작된 뒤 온 신호는 그 다시 읽기의 판이 풀지 않는다. 판: WS 를 RST 로 끊고 곧바로 «되돌린다»(연결 id 없음), 페이지
 * 행을 쥐어 복원을 세운 채 소켓이 다시 붙기를 기다렸다가 놓는다.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { editorStackPrerequisite, poll, startEditorStack, type EditorStack, canvasFrame } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

describe.skipIf(!전제.ok)('연결 id 없이 나간 내 복원', () => {
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

  it('다시 붙은 소켓이 내 복원의 신호를 받아도 남의 복원 배너가 서지 않는다', async () => {
    const alice = await stack.login(stack.users.alice)
    const call = (method: string, path: string, body?: unknown) => stack.request(alice, method, path, body)
    const project = created(await call('POST', '/projects', { name: '내 복원', slug: `own-restore-${Date.now().toString(36)}` }))
    const menu = created(await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '메뉴' }))
    const target = created(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '페이지' }))
    const P = `/projects/${project.id}/pages/${target.id}`
    const seeded = await call('PATCH', `${P}/ops`, {
      baseSeq: 0,
      ops: [{ op: 'add', path: '/root/children/0', value: { id: 'n_text000001', type: 'Text', props: { content: '원문' } } }],
    })
    if (seeded.status >= 300) throw new Error(`픽스처 ops ${seeded.status}`)
    created(await call('POST', `/projects/${project.id}/snapshots`, { tag: 'v1' }))

    const cut = await stack.startCutProxy()
    const { context, page } = await stack.openTab(stack.users.alice, { origin: cut.origin })
    const events: string[] = []
    const t0 = Date.now()
    const at = (): number => Date.now() - t0
    page.on('websocket', (ws) => {
      ws.on('framereceived', (frame) => {
        const kind = /"type":"(joined|restored)"/.exec(String(frame.payload))?.[1]
        if (kind !== undefined) events.push(`${at()} WS← ${kind}`)
      })
    })
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes('/restore')) {
        events.push(`${at()} POST restore 연결id=${request.headers()['x-wb-connection-id'] === undefined ? '없음' : '있음'}`)
      }
      if (request.method() === 'GET' && request.url().endsWith(`/api${P}`)) events.push(`${at()} GET page`)
    })
    page.on('response', (response) => {
      if (response.url().includes('/restore')) events.push(`${at()} 복원 응답 ${response.status()}`)
    })
    try {
      await page.goto(P)
      await canvasFrame(page).locator('body', { hasText: '원문' }).waitFor()
      await poll('소켓이 룸에 든다', async () => events.slice(), (lines) => lines.some((line) => line.endsWith('WS← joined')))
      await page.getByRole('button', { name: '스냅샷' }).click()
      await page.getByRole('button', { name: '이 상태로 되돌리기' }).click()

      const hold = await stack.holdRow('pages', target.id)
      try {
        expect(cut.reset(/\/ws[ ?]/)).toBeGreaterThanOrEqual(1)
        await page.getByRole('button', { name: '되돌린다' }).click()
        await hold.waitForWaiters(1)
        // 다시 붙은 소켓이 룸에 들 때까지 복원을 세워 둔다 — 그래야 방송이 이 탭에 온다.
        await poll('소켓이 다시 룸에 든다', async () => events.slice(), (lines) => lines.filter((line) => line.endsWith('WS← joined')).length >= 2, 10_000)
      } finally {
        await hold.release()
      }
      await poll('내 복원의 신호가 온다', async () => events.slice(), (lines) => lines.some((line) => line.endsWith('WS← restored')), 10_000)
      await page.waitForTimeout(1_500)
      const notices = await page.locator('[role=status]').allTextContents()
      // eslint-disable-next-line no-console
      console.log(`[내 복원 신호] ${events.join(' · ')} · 통지 ${JSON.stringify(notices)}`)

      // 판이 섰는가: 복원이 연결 id 없이 나갔고 그 신호가 이 탭에 왔다.
      expect(events.some((line) => line.includes('POST restore 연결id=없음'))).toBe(true)
      expect(notices.some((text) => text.includes('스냅샷이 복원됐습니다'))).toBe(false)
    } finally {
      await context.close()
      await cut.close()
    }
  })
})

function created(response: { status: number; body: any }): { id: string } {
  if (response.status !== 201) throw new Error(`픽스처 ${response.status} ${JSON.stringify(response.body)}`)
  return response.body
}
