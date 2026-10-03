/**
 * **OS 클립보드로 노드를 주고받는 판을 실브라우저로 잰다** — `src/edit/use-clipboard.ts` · `src/shell/editor-keys.tsx`. jsdom 은 `clipboardData` 가 없어
 * 이벤트에 가짜를 실은 판까지다(`test/edit/use-clipboard.test.tsx`). 여기서는 Chrome 이 `Cmd/Ctrl+C` · `V` 에 내는 `copy` · `paste` 이벤트와
 * 그 클립보드를 그대로 쓴다.
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 다른 탭 · 다른 프로젝트 | 봉투가 탭을 못 건넌다 · id 를 새로 안 짓는다 · 다른 프로젝트의 페이지를 가리키던 동작이 남는다 · 뺀 수를 안 말한다 |
 * | 같은 프로젝트의 다른 페이지 | 지금 프로젝트에 있는 페이지 대상까지 뺀다 |
 * | 클립보드 권한 | 붙여넣기가 `navigator.clipboard` 권한에 기댄다 — 권한을 안 준 컨텍스트에서 안 선다 |
 *
 * **권한을 주지 않는다**(`context.grantPermissions` 없음) — 판 카나리아로 그 컨텍스트에서 `navigator.clipboard.readText()` 가 거절되는지 함께 센다.
 * 서버 문서(`GET …/pages/:id` 의 `schema`)로 단언한다.
 */
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canvasFrame, editorStackPrerequisite, poll, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

interface PastedNode {
  id: string
  type: string
  interactions?: { on: string; actions: { type: string; target: string }[] }[]
}

describe.skipIf(!전제.ok)('클립보드 — 실브라우저', () => {
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
    expect(before.listeningPorts.length).toBeGreaterThanOrEqual(2)
    expect(before.databases).toBe(1)
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  })

  async function children(P: string): Promise<PastedNode[]> {
    const response = await stack.request(alice, 'GET', P)
    return (response.body.schema.root.children ?? []) as PastedNode[]
  }

  const alerts = (page: Page) => page.locator('.wb-shell-edit-alert').allTextContents()

  it('복사 → 같은 컨텍스트의 다른 탭 · 다른 프로젝트 페이지에 붙이면 새 id 로 들어가고, 대상이 없는 동작은 빠지며 그 수를 말한다', async () => {
    const source = await sourceProject(stack, alice)
    const other = await plainProject(stack, alice, '다른 프로젝트', '받는 곳')
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
    try {
      // 권한을 안 준 컨텍스트 — `navigator.clipboard` 읽기는 거절돼야 판이 선다(카나리아).
      await page.goto(source.P1)
      await canvasFrame(page).locator('[data-wb-id="n_btn00000001"]').click()
      const readWithoutPermission = await page.evaluate(() =>
        navigator.clipboard.readText().then(
          () => 'read',
          (error: Error) => `rejected ${error.name}`,
        ),
      )
      const copied = await page.evaluate(() => {
        const seen: string[] = []
        ;(window as unknown as { __copies: string[] }).__copies = seen
        const frame = document.querySelector<HTMLIFrameElement>('iframe.wb-shell-canvas-iframe')!
        frame.contentDocument!.addEventListener('copy', (event) => seen.push(`copy ${event.defaultPrevented}`))
        return true
      })
      await page.keyboard.press('ControlOrMeta+c')
      const copies = await page.evaluate(() => (window as unknown as { __copies: string[] }).__copies.slice())

      const second = await context.newPage()
      await second.goto(other.P)
      await canvasFrame(second).locator('[data-wb-id]').first().waitFor()
      // 고른 것은 뿌리(페이지를 연 그대로) — 붙이기는 루트 끝이다.
      await canvasFrame(second).locator('body').click({ position: { x: 5, y: 5 } })
      await second.keyboard.press('ControlOrMeta+v')
      const pasted = await poll('붙인 노드가 서버에 닿는다', () => children(other.P), (nodes) => nodes.length === 2)
      const notice = await poll('뺀 수를 말한다', () => alerts(second), (texts) => texts.length > 0, 5_000)

      expect({ readWithoutPermission: readWithoutPermission.startsWith('rejected'), copied, copies }).toEqual({
        readWithoutPermission: true,
        copied: true,
        copies: ['copy true'],
      })
      const node = pasted[1]!
      expect({ type: node.type, sameId: node.id === 'n_btn00000001', interactions: node.interactions ?? null }).toEqual({
        type: 'Button',
        sameId: false,
        interactions: null,
      })
      expect(notice).toEqual(['상호작용 동작 2개는 대상이 없어 빼고 붙였습니다.'])
    } finally {
      await context.close()
    }
  })

  it('같은 프로젝트의 다른 페이지에 붙이면 그 프로젝트에 있는 페이지 대상은 남는다', async () => {
    const source = await sourceProject(stack, alice)
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
    try {
      await page.goto(source.P1)
      await canvasFrame(page).locator('[data-wb-id="n_btn00000001"]').click()
      await page.keyboard.press('ControlOrMeta+c')

      await page.goto(source.P2)
      await canvasFrame(page).locator('[data-wb-id]').first().waitFor()
      await page.keyboard.press('ControlOrMeta+v')
      const pasted = await poll('붙인 노드가 서버에 닿는다', () => children(source.P2), (nodes) => nodes.length === 2)
      const notice = await poll('뺀 수를 말한다', () => alerts(page), (texts) => texts.length > 0, 5_000)

      expect(pasted[1]!.interactions).toEqual([{ on: 'click', actions: [{ type: 'navigate', target: 'page:메뉴/둘째' }] }])
      expect(notice).toEqual(['상호작용 동작 1개는 대상이 없어 빼고 붙였습니다.'])
    } finally {
      await context.close()
    }
  })
})

/**
 * 프로젝트 하나 · 메뉴 «메뉴» · 페이지 «첫째»(P1 — 글 하나와 단추 하나) · «둘째»(P2 — 글 하나). 단추의 동작 둘 — 같은 페이지의 글을 보이기(노드 대상) ·
 * «둘째»로 가기(페이지 대상).
 */
async function sourceProject(stack: EditorStack, owner: Session): Promise<{ P1: string; P2: string }> {
  const call = (method: string, path: string, body?: unknown) => stack.request(owner, method, path, body)
  const project = created(await call('POST', '/projects', { name: 'E1 클립보드', slug: `clip-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}` }))
  const menu = created(await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '메뉴' }))
  const first = created(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '첫째' }))
  const second = created(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '둘째' }))
  const P1 = `/projects/${project.id}/pages/${first.id}`
  const P2 = `/projects/${project.id}/pages/${second.id}`
  await seed(call, P1, [
    { id: 'n_text0000001', type: 'Text', props: { content: '숨길 글' } },
    {
      id: 'n_btn00000001',
      type: 'Button',
      props: { label: '열기' },
      interactions: [
        {
          on: 'click',
          actions: [
            { type: 'setVisible', target: 'n_text0000001', value: false },
            { type: 'navigate', target: 'page:메뉴/둘째' },
          ],
        },
      ],
    },
  ])
  await seed(call, P2, [{ id: 'n_text0000002', type: 'Text', props: { content: '둘째 글' } }])
  return { P1, P2 }
}

async function plainProject(stack: EditorStack, owner: Session, menuTitle: string, pageTitle: string): Promise<{ P: string }> {
  const call = (method: string, path: string, body?: unknown) => stack.request(owner, method, path, body)
  const project = created(await call('POST', '/projects', { name: 'E1 받는 곳', slug: `clip-to-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}` }))
  const menu = created(await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: menuTitle }))
  const page = created(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: pageTitle }))
  const P = `/projects/${project.id}/pages/${page.id}`
  await seed(call, P, [{ id: 'n_text0000009', type: 'Text', props: { content: '받는 페이지' } }])
  return { P }
}

async function seed(
  call: (method: string, path: string, body?: unknown) => Promise<{ status: number; body: any }>,
  P: string,
  nodes: unknown[],
): Promise<void> {
  const ops = nodes.map((value, index) => ({ op: 'add', path: `/root/children/${index}`, value }))
  const seeded = await call('PATCH', `${P}/ops`, { baseSeq: 0, ops })
  if (seeded.status >= 300) throw new Error(`픽스처 ops ${seeded.status} ${JSON.stringify(seeded.body)}`)
}

function created(response: { status: number; body: any }): { id: string } {
  if (response.status !== 201) throw new Error(`픽스처 ${response.status} ${JSON.stringify(response.body)}`)
  return response.body
}
