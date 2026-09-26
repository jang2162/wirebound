/**
 * **페이지를 옮긴 뒤 친 편집은 그 페이지로 간다** — 앞 페이지의 편집이 서버에 떠 있는 동안 옮겨도.
 *
 * 전송 루프(`edit/use-edit-commit.tsx` 의 `pump`)는 앞 편집의 답을 기다리는 동안 페이지가 바뀌어도 이어 돈다. 답이 온 뒤 큐의
 * 머리는 **새 페이지의 편집**이고, 그것을 어느 경로로 내는지가 이 판이 재는 것이다. 번호가 맞으면 서버가 받으므로 틀린 경로로
 * 가도 오류가 없다 — 서버에서 앞 페이지의 글이 덮이고 새 페이지는 그대로, 화면은 새 페이지에 그 글, 통지 0 이다.
 *
 * jsdom 판은 `apps/web/test/edit/reload-sent-edits.test.tsx` 가 따로 든다. 여기는 실클릭 · 실 blur 로 편집을 내고 서버 행을
 * 쥐어 그 편집을 서버에 붙잡는다 — 줄이 섰는지는 `waitForWaiters` 가 DB 에서 센다(안 서면 판이 안 선 것이라 던진다).
 *
 * 판: 1쪽 head 1 · 2쪽 head 2. 1쪽에서 친 채 1쪽 행을 쥐고 트리의 «둘째»를 누른다(blur 가 1쪽 편집을 낸다 — 행에 줄 선다) →
 * 2쪽에서 치고 blur → 놓는다. 1쪽 편집의 ack 가 1쪽을 head 2 로 올리므로, 2쪽 편집(baseSeq 2)이 1쪽 경로로 나가면 받아진다.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright-core'
import { editorStackPrerequisite, poll, startEditorStack, type EditorStack, canvasFrame } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

describe.skipIf(!전제.ok)('페이지를 옮긴 뒤의 편집', () => {
  let stack: EditorStack

  beforeAll(async () => {
    if (!전제.ok) return
    stack = await startEditorStack(전제)
  })

  afterAll(async () => {
    if (stack === undefined) return
    const { before, after } = await stack.close()
    // 세는 자가 눈을 떴는가 — 도는 동안 프로세스 · 포트 · DB 가 보였어야 뒤의 0 이 뜻을 갖는다.
    expect(before.processes).toBeGreaterThan(0)
    expect(before.listeningPorts.length).toBeGreaterThanOrEqual(2)
    expect(before.databases).toBe(1)
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  })

  it('1쪽 편집이 서버에 떠 있는 채 2쪽으로 옮겨 친 글은 2쪽에 저장된다 — 1쪽을 덮지 않는다', async () => {
    const alice = await stack.login(stack.users.alice)
    const call = (method: string, path: string, body?: unknown) => stack.request(alice, method, path, body)
    const project = await create(call, '/projects', { name: '페이지 이동', slug: `move-${Date.now().toString(36)}` })
    const menu = await create(call, `/projects/${project.id}/menu`, { parentId: null, title: '메뉴' })
    const first = await create(call, `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '첫째' })
    const second = await create(call, `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '둘째' })
    const P1 = `/projects/${project.id}/pages/${first.id}`
    const P2 = `/projects/${project.id}/pages/${second.id}`
    const text = (id: string, content: string) => ({ op: 'add', path: '/root/children/0', value: { id, type: 'Text', props: { content } } })
    await patch(call, P1, 0, [text('n_one0000001', '1쪽 원문')])
    await patch(call, P2, 0, [text('n_two0000001', '2쪽 원문')])
    await patch(call, P2, 1, [{ op: 'replace', path: '/root/children/0/props/content', value: '2쪽 원문' }])
    const server = async (path: string) => {
      const page = (await call('GET', path)).body
      return { head: page.headSeq as number, content: (page.schema.root.children ?? []).map((child: any) => child.props?.content) }
    }
    expect([await server(P1), await server(P2)]).toEqual([
      { head: 1, content: ['1쪽 원문'] },
      { head: 2, content: ['2쪽 원문'] },
    ])

    const { context, page } = await stack.openTab(stack.users.alice)
    const frames: string[] = []
    page.on('websocket', (ws) => {
      ws.on('framesent', (frame) => {
        const payload = String(frame.payload)
        if (!payload.includes('"patch"')) return
        const target = /"pageId":"([^"]+)"/.exec(payload)?.[1]
        frames.push(`→ patch ${target === first.id ? '1쪽' : target === second.id ? '2쪽' : target} baseSeq=${/"baseSeq":(\d+)/.exec(payload)?.[1]}`)
      })
      ws.on('framereceived', (frame) => {
        const payload = String(frame.payload)
        const kind = /"type":"(patch-ack|patch-error)"/.exec(payload)?.[1]
        if (kind !== undefined) frames.push(`← ${kind} ${/"(seq|status)":(\d+)/.exec(payload)?.[0] ?? ''}`)
      })
    })
    try {
      await page.goto(P1)
      await selectText(page, '1쪽 원문')
      const box = page.locator('.wb-shell-panel textarea').first()
      await box.click()
      await box.fill('1쪽에 친 글')

      const hold = await stack.holdRow('pages', first.id)
      // 실클릭 — 포커스가 옮겨 가며 blur 가 1쪽 편집을 낸다. 그 편집이 행에 줄 서야 판이 선다.
      await page.getByRole('link', { name: '둘째' }).click()
      await hold.waitForWaiters(1)

      await selectText(page, '2쪽 원문')
      const box2 = page.locator('.wb-shell-panel textarea').first()
      await box2.click()
      await box2.fill('2쪽에 친 글')
      await box2.evaluate((element) => (element as HTMLElement).blur())
      await hold.release()

      // 두 편집이 다 서버에 닿을 때까지 — 어느 페이지에 닿든 head 의 합이 둘 오른다(1 + 2 → 5).
      const after = await poll(
        '두 편집이 서버에 닿는다',
        async () => [await server(P1), await server(P2)] as const,
        ([one, two]) => one.head + two.head >= 5,
      )
      const notices = await page.locator('.wb-shell-header [role=status], .wb-shell-header [role=alert]').allTextContents()
      // eslint-disable-next-line no-console
      console.log(`[페이지 이동] ${frames.join(' · ')} · 서버 ${JSON.stringify(after)}`)
      expect({ 서버: after, 통지: notices, 순서: frames }).toEqual({
        서버: [
          { head: 2, content: ['1쪽에 친 글'] },
          { head: 3, content: ['2쪽에 친 글'] },
        ],
        통지: [],
        순서: expect.any(Array),
      })
      // 편집 둘이 각자 제 페이지 경로로 나갔다 — 서버 값이 맞아도 경로가 틀리면 그것은 우연이다.
      expect(frames.filter((line) => line.startsWith('→'))).toEqual(['→ patch 1쪽 baseSeq=1', '→ patch 2쪽 baseSeq=2'])
    } finally {
      await context.close()
    }
  })
})

type Call = (method: string, path: string, body?: unknown) => Promise<{ status: number; body: any }>

async function create(call: Call, path: string, body: unknown): Promise<{ id: string }> {
  const response = await call('POST', path, body)
  if (response.status !== 201) throw new Error(`픽스처 ${path} ${response.status} ${JSON.stringify(response.body)}`)
  return response.body
}

async function patch(call: Call, path: string, baseSeq: number, ops: unknown[]): Promise<void> {
  const response = await call('PATCH', `${path}/ops`, { baseSeq, ops })
  if (response.status >= 300) throw new Error(`픽스처 ${path}/ops ${response.status} ${JSON.stringify(response.body)}`)
}

/** 구조 트리에서 글 노드를 골라 속성 칸을 연다 — 캔버스가 그 페이지의 글을 그린 뒤에. */
async function selectText(page: Page, content: string): Promise<void> {
  await canvasFrame(page).locator('body', { hasText: content }).waitFor()
  await page.locator('li button', { hasText: 'Text' }).first().click()
  await page.locator('.wb-shell-panel textarea').first().waitFor()
}

