/**
 * **에디터 단축키를 실브라우저로 잰다** — `src/edit/use-editor-shortcuts.ts` · `src/shell/editor-keys.tsx`. jsdom 은 포커스가 캔버스 iframe 에 있을 때
 * 키가 어느 문서로 가는지 · 입력 칸의 기본 동작(글자 지우기 · 칸의 되돌리기) · 한글 조합 상태를 못 잰다(`test/edit/editor-keys.test.tsx` 는
 * 이벤트를 손으로 올린 판까지다).
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 캔버스 포커스 | 리스너가 호스트 문서에만 걸렸다 — 캔버스를 눌러 포커스가 iframe 에 있으면 Alt+↑ · Cmd+Z · ↓ · Delete · `?` 가 안 선다 |
 * | 속성 패널 글 칸 | 거름이 입력 칸을 못 본다 — Backspace 가 노드를 지우고 Cmd+Z 가 칸이 아니라 문서를 되돌린다 |
 * | 한글 조합 | 조합 중의 Backspace 가 노드를 지운다 |
 * | 캔버스 문서의 입력 칸 | 캔버스 iframe 의 입력을 호스트 생성자로 본다 — 그 칸에서 친 `?` 가 도움말을 열고 `Delete` 가 노드를 지운다 |
 *
 * 서버 문서(`GET …/pages/:id` 의 `schema` · `headSeq`)로 단언한다 — 화면이 아니라 서버에 무엇이 나갔는지가 값이다.
 */
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canvasFrame, editorStackPrerequisite, poll, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

describe.skipIf(!전제.ok)('에디터 단축키 — 실브라우저', () => {
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

  /** 서버의 그 페이지 — 뿌리 자식 id 들과 `headSeq`. */
  async function server(P: string): Promise<{ ids: string[]; headSeq: number }> {
    const response = await stack.request(alice, 'GET', P)
    const children = (response.body.schema.root.children ?? []) as { id: string }[]
    return { ids: children.map((child) => child.id), headSeq: response.body.headSeq }
  }

  /** 고른 노드 — 속성 패널 글 칸의 값(픽스처의 글은 노드마다 다르다). */
  const selected = (page: Page) => page.locator('.wb-shell-panel textarea').first().inputValue()

  it('캔버스 iframe 에 포커스가 있어도 Alt+↑ · Cmd+Z · ↓ · Delete · ? 가 선다', async () => {
    const { P } = await fixture(stack, alice, 'keys-canvas')
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
    try {
      await page.goto(P)
      await canvasFrame(page).locator('[data-wb-id="n_text0000002"]').click()
      // 판 카나리아 — 포커스가 캔버스 문서에 있다(호스트의 활성 요소가 iframe).
      const focus = await page.evaluate(() => document.activeElement?.tagName)
      const platform = await page.evaluate(() => navigator.platform)
      expect((await selected(page)).startsWith('글 2')).toBe(true)

      await page.keyboard.press('Alt+ArrowUp')
      const moved = await poll('Alt+↑ 가 서버에 닿는다', () => server(P), (s) => s.headSeq === 2)
      await page.keyboard.press('ControlOrMeta+z')
      const undone = await poll('Cmd+Z 가 서버에 닿는다', () => server(P), (s) => s.headSeq === 3)
      await page.keyboard.press('ArrowDown')
      const next = await selected(page)
      await page.keyboard.press('Delete')
      const deleted = await poll('Delete 가 서버에 닿는다', () => server(P), (s) => s.headSeq === 4)
      await page.keyboard.press('Shift+Slash')
      const help = await page.getByRole('dialog', { name: '단축키' }).count()
      await page.keyboard.press('Escape')
      const closed = await poll('Escape 가 닫는다', () => page.locator('dialog[open]').count(), (count) => count === 0, 3_000)

      expect({ focus, platform: platform.length > 0 }).toEqual({ focus: 'IFRAME', platform: true })
      expect({
        moved: moved.ids,
        undone: undone.ids,
        next: next.slice(0, 3),
        deleted: deleted.ids,
        help,
        closed,
      }).toEqual({
        moved: ['n_text0000002', 'n_text0000001', 'n_text0000003', 'n_field000001'],
        undone: ['n_text0000001', 'n_text0000002', 'n_text0000003', 'n_field000001'],
        next: '글 3',
        deleted: ['n_text0000001', 'n_text0000002', 'n_field000001'],
        help: 1,
        closed: 0,
      })
    } finally {
      await context.close()
    }
  })

  it('속성 패널 글 칸의 Backspace · Cmd+Z 는 칸의 것이다 — 노드 편집 0', async () => {
    const { P } = await fixture(stack, alice, 'keys-field')
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
    try {
      await page.goto(P)
      await canvasFrame(page).locator('[data-wb-id="n_text0000002"]').click()
      const field = page.locator('.wb-shell-panel textarea').first()
      await field.click()
      await field.press('End')
      const original = await field.inputValue()
      const before = await server(P)

      await page.keyboard.press('Backspace')
      const afterBackspace = await field.inputValue()
      await page.keyboard.press('ControlOrMeta+z')
      const afterUndo = await field.inputValue()
      await page.keyboard.press('ArrowUp')
      await page.waitForTimeout(300)

      expect({
        afterBackspace: afterBackspace === original.slice(0, -1),
        afterUndo: afterUndo === original,
        server: await server(P),
        selected: (await selected(page)).slice(0, 3),
      }).toEqual({ afterBackspace: true, afterUndo: true, server: before, selected: '글 2' })
    } finally {
      await context.close()
    }
  })

  /**
   * CDP 로 조합 상태를 세운다(`Input.imeSetComposition`) — 판 카나리아로 그 Backspace 가 `isComposing: true` 로 왔는지 센다.
   */
  it('한글 조합 중의 Backspace 는 노드를 지우지 않는다', async () => {
    const { P } = await fixture(stack, alice, 'keys-ime')
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
    try {
      await page.goto(P)
      await canvasFrame(page).locator('[data-wb-id="n_text0000002"]').click()
      const field = page.locator('.wb-shell-panel textarea').first()
      await field.click()
      await page.evaluate(() => {
        const seen: string[] = []
        ;(window as unknown as { __seen: string[] }).__seen = seen
        document.addEventListener('keydown', (event) => seen.push(`${event.key} ${event.isComposing}`), true)
      })
      const before = await server(P)
      const cdp = await page.context().newCDPSession(page)
      await cdp.send('Input.imeSetComposition', { text: '한', selectionStart: 1, selectionEnd: 1 })
      await page.keyboard.press('Backspace')
      await page.waitForTimeout(300)
      const seen = await page.evaluate(() => (window as unknown as { __seen: string[] }).__seen.slice())

      expect(seen).toContain('Backspace true')
      expect(await server(P)).toEqual(before)
    } finally {
      await context.close()
    }
  })

  /**
   * **시스템 테마는 캔버스에 진짜 입력 칸을 안 그린다**(`Field` 는 `<div data-wb-part="control">` — 와이어프레임이다). 테마 뷰는 임의의 React 라
   * 사용자 테마는 그릴 수 있으므로, 캔버스 문서(same-origin)에 입력 칸을 하나 심어 그 판을 세운다 — 그 칸의 생성자는 iframe 창의 것이다.
   * 판 카나리아: 그 칸이 호스트의 `HTMLInputElement` 가 아니다 · 포커스가 iframe 에 있다.
   */
  it('캔버스 문서의 입력 칸에서 친 ? · Backspace · Delete 는 그 칸의 것이다 — 도움말 0 · 노드 편집 0', async () => {
    const { P } = await fixture(stack, alice, 'keys-canvas-input')
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
    try {
      await page.goto(P)
      await canvasFrame(page).locator('[data-wb-id="n_text0000002"]').click()
      const before = await server(P)
      const foreignRealm = await page.evaluate(() => {
        const frame = document.querySelector<HTMLIFrameElement>('iframe.wb-shell-canvas-iframe')!
        const input = frame.contentDocument!.createElement('input')
        input.id = 'planted-input'
        frame.contentDocument!.body.appendChild(input)
        return !(input instanceof HTMLInputElement)
      })
      const input = canvasFrame(page).locator('#planted-input')
      await input.click()
      await page.keyboard.type('a?')
      await page.keyboard.press('Backspace')
      await page.keyboard.press('Shift+Slash')
      await page.keyboard.press('Delete')
      await page.waitForTimeout(300)

      expect({
        foreignRealm,
        focus: await page.evaluate(() => document.activeElement?.tagName),
        dialogs: await page.locator('dialog[open]').count(),
        value: await input.inputValue(),
        server: await server(P),
      }).toEqual({ foreignRealm: true, focus: 'IFRAME', dialogs: 0, value: 'a?', server: before })
    } finally {
      await context.close()
    }
  })
})

/** 글 셋과 `Field` 하나를 든 페이지. */
async function fixture(stack: EditorStack, owner: Session, slug: string): Promise<{ P: string; projectId: string }> {
  const call = (method: string, path: string, body?: unknown) => stack.request(owner, method, path, body)
  const project = created(await call('POST', '/projects', { name: 'E1 단축키', slug: `${slug}-${Date.now().toString(36)}` }))
  const menu = created(await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '메뉴' }))
  const target = created(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '첫째' }))
  const P = `/projects/${project.id}/pages/${target.id}`
  const texts = [1, 2, 3].map((n, index) => ({
    op: 'add',
    path: `/root/children/${index}`,
    value: { id: `n_text000000${n}`, type: 'Text', props: { content: `글 ${n} — 캔버스를 채운다` } },
  }))
  const field = { op: 'add', path: '/root/children/3', value: { id: 'n_field000001', type: 'Field', props: { label: '이름' } } }
  const seeded = await call('PATCH', `${P}/ops`, { baseSeq: 0, ops: [...texts, field] })
  if (seeded.status >= 300) throw new Error(`픽스처 ops ${seeded.status} ${JSON.stringify(seeded.body)}`)
  return { P, projectId: project.id }
}

function created(response: { status: number; body: any }): { id: string } {
  if (response.status !== 201) throw new Error(`픽스처 ${response.status} ${JSON.stringify(response.body)}`)
  return response.body
}
