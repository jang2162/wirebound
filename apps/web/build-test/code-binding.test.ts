/**
 * **공통코드에 묶인 노드 — 실브라우저**(`src/codes/project-codes.tsx` · `src/panels/code-binding.tsx` · 캔버스 시트 `CODE_MARK_SHEET`). 진짜 api · 룸으로
 * 잰다 — jsdom 판(`test/codes/codes-canvas.test.tsx` · `test/panels/code-binding.test.tsx`)은 가짜 소켓이다.
 *
 * | 판 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 열기 | 캔버스가 묶인 `Affix` 를 표의 이름으로 그리지 않는다 · 날 키 · 코드값이 캔버스 글에 나온다 |
 * | 남이 지움(Review Focus 2) | 다른 사람이 항목을 지워도 이 탭이 옛 이름을 그대로 둔다 · 끊김 표지(`data-wb-code-broken` · 점선 외곽)가 안 선다 · 패널의 «끊긴 공통코드» 가 안 선다 |
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canvasFrame, editorStackPrerequisite, poll, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

describe.skipIf(!전제.ok)('공통코드에 묶인 노드 — 실브라우저', () => {
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

  it('표의 이름으로 그리고, 남이 그 항목을 지우면 끊김 표지 · 패널의 «끊긴 공통코드» 로 바뀐다', async () => {
    const project = (await stack.request(alice, 'POST', '/projects', { name: '공통코드 묶음', slug: `bind-${Date.now().toString(36)}` }))
      .body
    const base = `/projects/${project.id}`
    expect((await stack.request(alice, 'POST', `${base}/members`, { email: stack.users.bob.email, role: 'editor' })).status).toBe(201)
    expect((await stack.request(alice, 'POST', `${base}/codes`, { key: 'ORDER_STATUS', name: '주문 상태' })).status).toBe(201)
    expect((await stack.request(alice, 'POST', `${base}/codes/ORDER_STATUS/items`, { value: 'WAIT', name: '결제 대기' })).status).toBe(201)
    const menu = (await stack.request(alice, 'POST', `${base}/menu`, { parentId: null, title: '메뉴' })).body
    const page = (await stack.request(alice, 'POST', `${base}/pages`, { menuNodeId: menu.id, title: '주문 목록' })).body
    const bound = await stack.request(alice, 'PATCH', `${base}/pages/${page.id}/ops`, {
      baseSeq: 0,
      ops: [
        {
          op: 'add',
          path: '/root/children/0',
          value: { id: 'n_codebind001', type: 'Affix', props: { text: '옛 이름' }, code: { group: 'ORDER_STATUS', item: 'WAIT' } },
        },
      ],
    })
    expect(bound.status).toBe(200)

    const { context, page: tab } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
    try {
      // 룸에 든 것을 센다 — 남의 지우기 신호가 이 연결에 닿아야 한다.
      const ws = { joined: 0, codes: 0 }
      tab.on('websocket', (socket) => {
        socket.on('framereceived', (frame) => {
          if (typeof frame.payload !== 'string') return
          if (frame.payload.includes('"joined"')) ws.joined += 1
          if (frame.payload.includes('"codes-changed"')) ws.codes += 1
        })
      })
      await tab.goto(`${base}/pages/${page.id}`)
      const affix = canvasFrame(tab).locator('[data-wb-id="n_codebind001"]')
      await affix.waitFor()
      await poll(
        '캔버스가 표의 이름으로 그린다',
        async () => affix.textContent(),
        (text) => text === '결제 대기',
      )
      const text = (await canvasFrame(tab).locator('body').textContent()) ?? ''
      expect({ key: text.includes('ORDER_STATUS'), value: /\bWAIT\b/.test(text) }).toEqual({ key: false, value: false })
      await poll(
        '룸에 들었다',
        async () => ws.joined,
        (n) => n >= 1,
      )

      // 남이(밥 — 다른 세션) 그 항목을 지운다.
      expect((await stack.request(bob, 'DELETE', `${base}/codes/ORDER_STATUS/items/WAIT`)).status).toBe(204)
      await poll(
        '신호가 닿는다',
        async () => ws.codes,
        (n) => n >= 1,
      )
      await poll(
        '끊김 표지가 선다',
        async () => affix.getAttribute('data-wb-code-broken'),
        (value) => value === '',
      )
      expect(await affix.textContent()).toBe('옛 이름')
      const outline = await affix.evaluate((element) => getComputedStyle(element).outlineStyle)
      expect(outline).toBe('dashed')

      // 고르면 패널이 끊김을 말한다.
      await affix.click()
      await tab.locator('[data-wb-code-field]').getByText('끊긴 공통코드: ORDER_STATUS › WAIT').waitFor()
    } finally {
      await context.close()
    }
  })
})
