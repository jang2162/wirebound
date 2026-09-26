/**
 * **내 복원의 답을 잃으면 배너를 세운다**(`EditorStore.markRestoreUnanswered`) — 답을 기다리는 동안 그 복원의 신호가 왔으면 «모른다»가 아니라 «복원됐습니다»다.
 *
 * 판: 서버가 복원을 커밋하고 그 신호가 이 탭에 닿은 뒤 브라우저가 답만 버린다(`route.fetch` → 신호 → `abort`). 복원의 방송은 낸 연결도 빼지
 * 않는다 — 연결을 빼던 판에서는 이 탭에 신호도 답도 없었다. 성질: 화면이 서버와 다르면 배너가 그렇다고 말하고, 그 단추가 화면을 서버 판으로
 * 맞춘다. 신호가 다시 읽기보다 늦게 오는 판은 `editor-restore-signal-order.test.ts`의 «늦게 커밋»이 든다.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { editorStackPrerequisite, poll, startEditorStack, type EditorStack, canvasFrame, canvasText } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

describe.skipIf(!전제.ok)('답을 잃은 내 복원', () => {
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

  it('서버는 복원했는데 답을 잃으면 배너가 그렇다고 말하고, 그 단추가 화면을 서버 판으로 맞춘다', async () => {
    const alice = await stack.login(stack.users.alice)
    const call = (method: string, path: string, body?: unknown) => stack.request(alice, method, path, body)
    const project = created(await call('POST', '/projects', { name: '답 잃은 복원', slug: `lost-restore-${Date.now().toString(36)}` }))
    const menu = created(await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '메뉴' }))
    const target = created(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '페이지' }))
    const P = `/projects/${project.id}/pages/${target.id}`
    const seeded = await call('PATCH', `${P}/ops`, {
      baseSeq: 0,
      ops: [{ op: 'add', path: '/root/children/0', value: { id: 'n_text000001', type: 'Text', props: { content: '원문' } } }],
    })
    if (seeded.status >= 300) throw new Error(`픽스처 ops ${seeded.status}`)
    created(await call('POST', `/projects/${project.id}/snapshots`, { tag: 'v1' }))
    const changed = await call('PATCH', `${P}/ops`, {
      baseSeq: 1,
      ops: [{ op: 'replace', path: '/root/children/0/props/content', value: '바뀐 글' }],
    })
    if (changed.status >= 300) throw new Error(`픽스처 ops ${changed.status}`)

    const { context, page } = await stack.openTab(stack.users.alice)
    const events: string[] = []
    const t0 = Date.now()
    const at = (): number => Date.now() - t0
    page.on('websocket', (ws) => {
      ws.on('framereceived', (frame) => {
        const kind = /"type":"(joined|restored)"/.exec(String(frame.payload))?.[1]
        if (kind !== undefined) events.push(`${at()} WS← ${kind}`)
      })
    })
    // **서버는 복원을 끝내고 브라우저는 그 답만 잃는다** — 그 신호가 닿은 뒤에 끊는다(신호가 답보다 먼저인 칸).
    await page.route('**/restore', async (route) => {
      const answer = await route.fetch()
      await poll('신호가 먼저 닿는다', async () => events.slice(), (lines) => lines.some((line) => line.endsWith('WS← restored')), 10_000)
      events.push(`${at()} 복원 서버 답 ${answer.status()} · 브라우저에는 끊김`)
      await route.abort('connectionreset')
    })
    const server = async (): Promise<string> => {
      const detail = await call('GET', `${P}`)
      return String(detail.body?.schema?.root?.children?.[0]?.props?.content)
    }
    const canvas = async (): Promise<string> => await canvasText(page)
    const banner = async (): Promise<boolean> => (await page.locator('.wb-shell-remote-alert', { hasText: '다시 불러오기' }).count()) > 0
    try {
      await page.goto(P)
      await canvasFrame(page).locator('body', { hasText: '바뀐 글' }).waitFor()
      await poll('소켓이 룸에 든다', async () => events.slice(), (lines) => lines.some((line) => line.endsWith('WS← joined')))
      await page.getByRole('button', { name: '스냅샷' }).click()
      await page.getByRole('button', { name: '이 상태로 되돌리기' }).click()
      await page.getByRole('button', { name: '되돌린다' }).click()
      await poll('복원이 서버에 닿는다', async () => events.slice(), (lines) => lines.some((line) => line.includes('복원 서버 답')), 10_000)
      await page.waitForTimeout(1_500)

      const after = { 서버: await server(), 캔버스: await canvas(), 배너: await banner() }
      const statuses = await page.locator('[role=status]').allTextContents()
      // eslint-disable-next-line no-console
      console.log(`[답 잃은 복원] ${events.join(' · ')} · ${JSON.stringify(after)} · 상태줄 ${JSON.stringify(statuses)}`)

      // 판 카나리아 — 서버는 복원했고(원문) 이 탭은 답을 못 받아 옛 판이다. 신호는 답보다 먼저 닿았다.
      expect(after.서버).toBe('원문')
      expect(after.캔버스).toContain('바뀐 글')
      expect(events.findIndex((line) => line.endsWith('WS← restored'))).toBeLessThan(events.findIndex((line) => line.includes('복원 서버 답')))
      // 성질 — 화면이 서버와 다르면 그렇다고 말한다(단추가 있다). 신호가 왔으니 «복원됐습니다»다 — «모른다»가 아니고, 누가 복원했는지는
      // 말하지 않는다(`shell/remote-alert.tsx`의 `OWN_RESTORE_NOTICE`).
      expect(after.배너).toBe(true)
      expect(statuses.some((text) => text.includes('스냅샷이 복원됐습니다'))).toBe(true)
      expect(statuses.filter((text) => /다른 사람|알 수 없/.test(text))).toEqual([])

      await page.locator('.wb-shell-remote-alert').getByRole('button', { name: '다시 불러오기' }).click()
      await canvasFrame(page).locator('body', { hasText: '원문' }).waitFor({ timeout: 10_000 })
      expect({ 캔버스: await canvas(), 배너: await banner() }).toEqual({ 캔버스: expect.stringContaining('원문') as unknown as string, 배너: false })
    } finally {
      await context.close()
    }
  })
})

function created(response: { status: number; body: any }): { id: string } {
  if (response.status !== 201) throw new Error(`픽스처 ${response.status} ${JSON.stringify(response.body)}`)
  return response.body
}
