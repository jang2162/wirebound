/**
 * **키보드 구멍 묶음(J4)을 실브라우저로 잰다** — 메뉴 트리의 ↑ ↓ · 줄의 접고 펴기와 그 접근성 표지 · 포커스가 떠난 행동 메뉴 · 고르개 안의
 * Delete · 고르개를 닫은 뒤의 포커스 · 닫힌 토글 · 카드 «넣기»의 화살표(설계서 「설계서 화면 구조」 «트리 줄 접기» · «단축키»). 포커스 이동 ·
 * iframe 포커스 · 키 반복(CDP `autoRepeat`) · 접근성 트리(CDP `Accessibility`)는 jsdom 이 못 세우는 판이다.
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 메뉴 트리 ↑ ↓ | 보이는 줄을 옮겨 다니지 않는다 · 접힌 메뉴 안에 선다 · 페이지 줄로 옮기면 그 페이지가 열린다 · Enter 가 고른 페이지를 안 연다 · 끝에서 돈다 · 반복 · 두 번 치기가 서버 트리를 바꾼다 |
 * | 메뉴 트리 ↑ ↓ — 뷰 모드 | 뷰 모드에서 ↑ ↓ · ← → 가 안 선다 |
 * | 메뉴 트리 — 남의 바꿈 뒤 | 다시 받은 뒤 고른 줄 · 포커스가 풀린다 · 지운 줄의 포커스가 `body` 로 떨어진다 · 옮긴 줄의 포커스가 떨어진다 |
 * | 펼침 단추 · 줄의 접근성 | 펼침 단추가 Tab 정지점 · 접근성 트리에 선다 · 줄이 `expanded` 를 말하지 않는다 · ← → 뒤 `expanded` 가 안 바뀐다 |
 * | 포커스가 떠난 행동 메뉴 | 메뉴가 열린 채 포커스가 캔버스 · 다른 단추로 가도 메뉴가 남는다 |
 * | 고르개 안의 Delete | 고르개 안의 Delete · Backspace · 누름이 고른 노드를 지운다 |
 * | 고르개를 닫은 뒤의 포커스 | Escape · «취소»로 닫으면 포커스가 `body` 로 떨어진다 |
 * | 닫힌 토글 · 카드 «넣기»의 화살표 | 정본의 «위젯이 안 쓰는 축의 화살표는 선다» · «단추로 연다(↓)»와 다르다 · 닫힌 메뉴 트리 토글의 Alt+↓ 가 메뉴를 열며 그 메뉴를 옮긴다 |
 *
 * 서버의 트리(`GET …/tree`) · 문서(`GET …/pages/:id`)로 지워지지 않았음을 단언한다.
 */
import type { CDPSession, Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canvasFrame, editorStackPrerequisite, poll, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

const T = (id: string, content: string) => ({ id, type: 'Text', props: { content } })
const C = (id: string, title: string, children: unknown[]) => ({ id, type: 'Card', props: { title }, children })

/** `[카드[글 1, 글 2, 글 3], 글 4]`. */
const NODES = () => [C('n_card0000001', '카드', [T('n_text0000001', '글 1'), T('n_text0000002', '글 2'), T('n_text0000003', '글 3')]), T('n_text0000004', '글 4')]
const WHOLE = '카드[글 1,글 2,글 3],글 4'
const WITHOUT_TEXT2 = '카드[글 1,글 3],글 4'

const DELETE = { key: 'Delete', code: 'Delete', windowsVirtualKeyCode: 46, modifiers: 0 }
const DOWN = { key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40, modifiers: 0 }

const TREE = '.wb-shell-region[aria-label="메뉴·페이지 트리"]'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe.skipIf(!전제.ok)('키보드 구멍 묶음 — 실브라우저', () => {
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

  function created(response: { status: number; body: any }): { id: string } {
    if (response.status !== 201) throw new Error(`픽스처 ${response.status} ${JSON.stringify(response.body)}`)
    return response.body
  }

  async function ok(response: Promise<{ status: number; body: any }>): Promise<any> {
    const answer = await response
    if (answer.status >= 300) throw new Error(`요청 ${answer.status} ${JSON.stringify(answer.body)}`)
    return answer.body
  }

  /**
   * ```
   * 가   pages: 가1(연다 · 노드) 가2
   * └ 다   pages: 다1
   * 나   pages: 나1
   * ```
   * 보이는 차례(모두 펼침): 가 · 가1 · 가2 · 다 · 다1 · 나 · 나1. bob 은 editor 다.
   */
  async function fixture(slug: string) {
    const call = (m: string, p: string, b?: unknown) => stack.request(alice, m, p, b)
    const project = created(await call('POST', '/projects', { name: 'J4 키보드', slug: `j4-${slug}-${Date.now().toString(36)}` }))
    const P = `/projects/${project.id}`
    const ids: Record<string, string> = {}
    const menu = async (title: string, parentId: string | null = null) => {
      ids[title] = created(await call('POST', `${P}/menu`, { parentId, title })).id
    }
    const page = async (title: string, under: string) => {
      ids[title] = created(await call('POST', `${P}/pages`, { menuNodeId: ids[under], title })).id
    }
    await menu('가')
    await menu('나')
    await menu('다', ids['가'])
    await page('가1', '가')
    await page('가2', '가')
    await page('다1', '다')
    await page('나1', '나')
    const member = await call('POST', `${P}/members`, { email: stack.users.bob.email, role: 'editor' })
    if (member.status >= 300) throw new Error(`멤버 ${member.status}`)
    const url = `${P}/pages/${ids['가1']}`
    const seeded = await call('PATCH', `${url}/ops`, { baseSeq: 0, ops: NODES().map((value, index) => ({ op: 'add', path: `/root/children/${index}`, value })) })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
    const titles = Object.fromEntries(Object.entries(ids).map(([title, id]) => [id, title]))
    return { P, ids, titles, url }
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>

  async function open(url: string): Promise<{ page: Page; close: () => Promise<void> }> {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
    await page.goto(url)
    await canvasFrame(page).locator('[data-wb-id="n_text0000002"]').waitFor()
    await page.locator(`${TREE} [data-tree-row]`).first().waitFor({ state: 'attached' })
    // 룸에 든 뒤에 시작한다 — 그 전의 남의 쓰기는 첫 조회로 받는다(`./menu-realtime.test.ts` 의 `openBob`).
    await sleep(300)
    return { page, close: () => context.close() }
  }

  /** 서버의 메뉴 트리 — `제목[페이지…|하위…]` 를 차례대로. */
  async function serverTree(fx: Fixture): Promise<string> {
    const body = (await stack.request(alice, 'GET', `${fx.P}/tree`)).body
    type M = { title: string; sortOrder: number; pages: { title: string; sortOrder: number }[]; children: M[] }
    const order = <X extends { sortOrder: number }>(items: X[]) => [...items].sort((a, b) => a.sortOrder - b.sortOrder)
    const text = (m: M): string => `${m.title}[${order(m.pages).map((p) => p.title).join(',')}|${order(m.children).map(text).join(',')}]`
    return order(body.menu as M[]).map(text).join(',')
  }
  const TREE_WHOLE = '가[가1,가2|다[다1|]],나[나1|]'

  /** 서버의 그 페이지 — 뿌리 자식을 글자로(카드는 `제목[자식…]`). 편집이 멎을 때까지 기다린다. */
  async function serverPage(url: string): Promise<string> {
    const shape = async () => {
      const response = await stack.request(alice, 'GET', url)
      const text = (node: { props?: Record<string, unknown>; children?: unknown[] }): string => {
        const label = String(node.props?.content ?? node.props?.title ?? '')
        const children = Array.isArray(node.children) && node.children.length > 0 ? `[${node.children.map((c) => text(c as typeof node)).join(',')}]` : ''
        return label + children
      }
      return (response.body.schema.root.children ?? []).map(text).join(',')
    }
    let last = ''
    for (let i = 0; i < 12; i += 1) {
      await sleep(200)
      const now = await shape()
      if (now === last) break
      last = now
    }
    return shape()
  }

  /** 메뉴 트리 줄의 줄 단추(메뉴) · 링크(페이지). */
  const menuRow = (page: Page, id: string) => page.locator(`${TREE} [data-tree-row][data-tree-id="${id}"] > :is(button.wb-shell-tree-menu, a.wb-shell-tree-page)`)

  /** 포커스 받은 자리 — 메뉴 트리 줄이면 `제목`, 그 줄의 다른 단추면 `제목:이름`, 아니면 이름 · 역할 · 태그. */
  const focusOf = (page: Page, titles: Record<string, string> = {}) =>
    page.evaluate((titles) => {
      const active = document.activeElement
      if (active === null || active === document.body) return 'body'
      if (active.localName === 'iframe') return 'iframe'
      const row = active.closest('[data-tree-row]')
      const id = row?.getAttribute('data-tree-id') ?? ''
      const node = active.closest('[data-tree-kind="node"]')
      if (node !== null && active.classList.contains('wb-shell-structure-node')) return `node:${node.getAttribute('data-tree-id')}`
      const name = active.getAttribute('aria-label') ?? active.getAttribute('role') ?? (active.textContent?.trim() || active.localName)
      if (row !== null && row.closest('.wb-shell-region[aria-label="메뉴·페이지 트리"]') !== null) {
        const title = titles[id] ?? id
        return active.classList.contains('wb-shell-tree-menu') || active.classList.contains('wb-shell-tree-page') ? title : `${title}:${name}`
      }
      return name
    }, titles)

  /** 메뉴 트리의 고른 줄(`wb-shell-tree-row-picked`) — 제목. */
  const pickedRows = (page: Page, titles: Record<string, string>) =>
    page.locator(`${TREE} .wb-shell-tree-row-picked`).evaluateAll((rows, titles) => rows.map((row) => titles[row.getAttribute('data-tree-id') ?? ''] ?? '?'), titles)

  /** 열린 페이지(주소) — 제목. */
  const openedPage = (page: Page, titles: Record<string, string>) => titles[new URL(page.url()).pathname.split('/').pop() ?? ''] ?? page.url()

  /** 메뉴 트리 줄 — 화면 차례대로 제목. */
  const visibleRows = (page: Page, titles: Record<string, string>) =>
    page.locator(`${TREE} [data-tree-row]`).evaluateAll((rows, titles) => rows.map((row) => titles[row.getAttribute('data-tree-id') ?? ''] ?? '?'), titles)

  /** 구조 트리의 고른 노드 id. */
  const selectedNode = (page: Page) =>
    page.evaluate(() => {
      const button = document.querySelector('[data-tree-kind="node"] > button[aria-current="true"]')
      return button === null ? null : button.parentElement!.getAttribute('data-tree-id')
    })
  const nodeRow = (page: Page, id: string) => page.locator(`[data-tree-id="${id}"] > button.wb-shell-structure-node`)
  /** 구조 줄의 `+`(0) · `…`(1). */
  const nodeMenu = (page: Page, id: string, which: 0 | 1) => page.locator(`[data-tree-id="${id}"] button[aria-haspopup="menu"]`).nth(which)
  const item = (page: Page, name: string) => page.getByRole('menuitem', { name, exact: true })
  const menus = (page: Page) => page.locator('[role="menu"]').count()
  const pickers = (page: Page) => page.locator('.wb-shell-picker').count()

  /** CDP 로 1s 누른다 — 첫 `rawKeyDown` 뒤 400ms 부터 33ms 간격 `autoRepeat`. 낸 keydown 수를 돌려준다. */
  async function hold(page: Page, key: typeof DELETE): Promise<number> {
    const cdp: CDPSession = await page.context().newCDPSession(page)
    const started = Date.now()
    let sent = 1
    await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...key })
    await sleep(400)
    while (Date.now() - started < 1_000) {
      await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', autoRepeat: true, ...key })
      sent += 1
      await sleep(33)
    }
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...key })
    await cdp.detach()
    return sent
  }

  /** 지금 판 — 포커스 · 고른 줄 · 열린 페이지. */
  async function state(page: Page, fx: Fixture): Promise<{ focus: string; picked: string[]; opened: string }> {
    return { focus: await focusOf(page, fx.titles), picked: await pickedRows(page, fx.titles), opened: openedPage(page, fx.titles) }
  }

  describe('1 · 메뉴 트리 ↑ ↓', () => {
    it('보이는 줄을 옮겨 다니며 고른다 — 페이지 줄은 열지 않고 고르고, Enter 가 연다 · 접힌 메뉴 안은 건너뛴다 · 끝에서 멈춘다', async () => {
      const fx = await fixture('arrows')
      const { page, close } = await open(fx.url)
      try {
        const steps: Record<string, unknown> = {}
        await menuRow(page, fx.ids['가1']!).focus()
        steps['처음(가1 에 포커스)'] = await state(page, fx)
        for (const [name, key] of [
          ['↓', 'ArrowDown'],
          ['↓ ↓', 'ArrowDown'],
          ['↓ ↓ ↓', 'ArrowDown'],
          ['↑', 'ArrowUp'],
        ] as const) {
          await page.keyboard.press(key)
          steps[name] = await state(page, fx)
        }
        // «다»에서 ← 로 접고 ↓ 하면 «다1»을 건너뛴다.
        await page.keyboard.press('ArrowLeft')
        await page.keyboard.press('ArrowDown')
        steps['다 접고 ↓'] = { ...(await state(page, fx)), rows: await visibleRows(page, fx.titles) }
        await page.keyboard.press('ArrowDown')
        await page.keyboard.press('ArrowDown')
        steps['끝에서 ↓'] = await state(page, fx)
        await menuRow(page, fx.ids['가']!).focus()
        await page.keyboard.press('ArrowUp')
        steps['맨 위에서 ↑'] = await state(page, fx)
        // 고른 페이지 «가2» — Enter 가 연다.
        await page.keyboard.press('ArrowDown')
        await page.keyboard.press('ArrowDown')
        await page.keyboard.press('Enter')
        // 판이 섰다는 것만 기다린다 — 트리의 열린 줄 표지(`aria-current`)가 «가2»로 옮겼다. 고른 줄 · 포커스는 그 뒤 한 번 읽는다.
        await page.locator(`${TREE} [data-tree-id="${fx.ids['가2']}"] > a[aria-current="page"]`).waitFor({ state: 'attached', timeout: 5_000 }).catch(() => {})
        steps['가2 에서 Enter'] = await state(page, fx)
        // eslint-disable-next-line no-console
        console.log(`[J4 메뉴 ↑ ↓] ${JSON.stringify(steps)}`)
        expect(steps).toEqual({
          '처음(가1 에 포커스)': { focus: '가1', picked: ['가1'], opened: '가1' },
          '↓': { focus: '가2', picked: ['가2'], opened: '가1' },
          '↓ ↓': { focus: '다', picked: ['다'], opened: '가1' },
          '↓ ↓ ↓': { focus: '다1', picked: ['다1'], opened: '가1' },
          '↑': { focus: '다', picked: ['다'], opened: '가1' },
          '다 접고 ↓': { focus: '나', picked: ['나'], opened: '가1', rows: ['가', '가1', '가2', '다', '나', '나1'] },
          '끝에서 ↓': { focus: '나1', picked: ['나1'], opened: '가1' },
          '맨 위에서 ↑': { focus: '가', picked: ['나1'], opened: '가1' },
          '가2 에서 Enter': { focus: '가2', picked: ['가2'], opened: '가2' },
        })
        expect(await serverTree(fx)).toBe(TREE_WHOLE)
      } finally {
        await close()
      }
    }, 60_000)

    it('키 반복(1s 누름) · 두 번 치기 — 보이는 줄 차례로 옮기고 페이지를 열지 않으며 서버 트리는 그대로다', async () => {
      const fx = await fixture('repeat')
      const { page, close } = await open(fx.url)
      try {
        await menuRow(page, fx.ids['가']!).focus()
        const sent = await hold(page, DOWN)
        const held = await state(page, fx)
        await menuRow(page, fx.ids['가']!).focus()
        await page.keyboard.press('ArrowDown')
        await page.keyboard.press('ArrowDown')
        const twice = await state(page, fx)
        // eslint-disable-next-line no-console
        console.log(`[J4 메뉴 ↑ ↓ 반복] ${JSON.stringify({ sent, held, twice })}`)
        expect(sent).toBeGreaterThanOrEqual(10)
        expect({ held, twice }).toEqual({
          held: { focus: '나1', picked: ['나1'], opened: '가1' },
          twice: { focus: '가2', picked: ['가2'], opened: '가1' },
        })
        expect(await serverTree(fx)).toBe(TREE_WHOLE)
      } finally {
        await close()
      }
    }, 60_000)

    it('뷰 모드 — ↑ ↓ 로 고르고 ← → 로 접고 편다', async () => {
      const fx = await fixture('view')
      const { page, close } = await open(fx.url)
      try {
        await page.getByRole('button', { name: '뷰 모드' }).click()
        await menuRow(page, fx.ids['가1']!).focus()
        await page.keyboard.press('ArrowDown')
        const down = await state(page, fx)
        await page.keyboard.press('ArrowDown')
        await page.keyboard.press('ArrowLeft')
        const folded = await menuRow(page, fx.ids['다']!).getAttribute('aria-expanded')
        await page.keyboard.press('ArrowRight')
        const unfolded = await menuRow(page, fx.ids['다']!).getAttribute('aria-expanded')
        // eslint-disable-next-line no-console
        console.log(`[J4 메뉴 뷰 모드] ${JSON.stringify({ down, folded, unfolded })}`)
        expect({ down, folded, unfolded }).toEqual({ down: { focus: '가2', picked: ['가2'], opened: '가1' }, folded: 'false', unfolded: 'true' })
      } finally {
        await close()
      }
    }, 60_000)

    it('남의 바꿈으로 다시 받은 뒤 — 이름만 바뀌면 고른 줄 · 포커스가 그대로, 옮겨지면 새 자리에서 그대로, 지워지면 이웃 줄로 간다', async () => {
      const cases: [string, string, (fx: Fixture) => Promise<unknown>, (fx: Fixture, rows: string[]) => boolean][] = [
        ['가2 이름 바꿈', '가2', (fx) => ok(stack.request(bob, 'PATCH', `${fx.P}/pages/${fx.ids['가2']}`, { title: '가2 고침' })), () => true],
        ['다 를 나 밑으로 옮김', '다', (fx) => ok(stack.request(bob, 'PATCH', `${fx.P}/menu/${fx.ids['다']}`, { parentId: fx.ids['나'] })), (_fx, rows) => rows.indexOf('다') > rows.indexOf('나')],
        ['가2 지움', '가2', (fx) => ok(stack.request(bob, 'DELETE', `${fx.P}/pages/${fx.ids['가2']}`)), (_fx, rows) => !rows.includes('가2')],
        ['다 지움(하위째)', '다', (fx) => ok(stack.request(bob, 'DELETE', `${fx.P}/menu/${fx.ids['다']}`, { cascade: true, expect: { menuIds: [], pageIds: [fx.ids['다1']] } })), (_fx, rows) => !rows.includes('다')],
      ]
      const results: Record<string, unknown> = {}
      for (const [name, target, act, arrived] of cases) {
        const fx = await fixture(`live-${Object.keys(results).length}`)
        const { page, close } = await open(fx.url)
        try {
          await menuRow(page, fx.ids['가1']!).focus()
          for (let i = 0; i < 8 && (await focusOf(page, fx.titles)) !== target; i += 1) await page.keyboard.press('ArrowDown')
          const reached = await focusOf(page, fx.titles)
          await act(fx)
          // 이름이 바뀐 줄의 제목도 표에 싣는다.
          fx.titles[fx.ids['가2']!] = '가2'
          await poll('다시 받는다', () => visibleRows(page, fx.titles), (rows) => arrived(fx, rows), 5_000)
          await sleep(300)
          results[name] = { reached, ...(await state(page, fx)) }
        } finally {
          await close()
        }
      }
      // eslint-disable-next-line no-console
      console.log(`[J4 메뉴 다시 받기] ${JSON.stringify(results)}`)
      expect(results).toEqual({
        '가2 이름 바꿈': { reached: '가2', focus: '가2', picked: ['가2'], opened: '가1' },
        '다 를 나 밑으로 옮김': { reached: '다', focus: '다', picked: ['다'], opened: '가1' },
        '가2 지움': { reached: '가2', focus: '다', picked: ['다'], opened: '가1' },
        '다 지움(하위째)': { reached: '다', focus: '나', picked: ['나'], opened: '가1' },
      })
    }, 120_000)
  })

  describe('2 · 펼침 단추와 줄의 접근성', () => {
    it('펼침 단추는 Tab 정지점도 접근성 트리의 마디도 아니다 — 줄 단추가 `expanded` 를 말하고 ← → 가 그것을 바꾼다', async () => {
      const fx = await fixture('ax')
      const { page, close } = await open(fx.url)
      const cdp = await page.context().newCDPSession(page)
      try {
        await cdp.send('Accessibility.enable')
        /** 비-무시 마디 가운데 이름이 그것인 것 — 역할 · `expanded` · `pressed`. */
        const ax = async (names: string[]) => {
          const { nodes } = (await cdp.send('Accessibility.getFullAXTree')) as { nodes: any[] }
          const live = nodes.filter((node) => node.ignored !== true)
          const read = (node: any, key: string) => node.properties?.find((p: any) => p.name === key)?.value?.value
          return {
            rows: Object.fromEntries(
              names.map((name) => {
                const found = live.filter((node) => node.name?.value === name && ['button', 'link'].includes(node.role?.value))
                return [name, found.map((node) => ({ role: node.role?.value, expanded: read(node, 'expanded') ?? null, pressed: read(node, 'pressed') ?? null }))]
              }),
            ),
            toggles: live.filter((node) => ['접기', '펴기'].includes(node.name?.value)).length,
          }
        }
        const before = await ax(['가', '다', '나', '가2'])
        await menuRow(page, fx.ids['다']!).focus()
        const tabbed: string[] = []
        for (let i = 0; i < 3; i += 1) {
          await page.keyboard.press('Tab')
          tabbed.push(await focusOf(page, fx.titles))
        }
        await menuRow(page, fx.ids['다']!).focus()
        await page.keyboard.press('ArrowLeft')
        const left = await ax(['다'])
        await page.keyboard.press('ArrowRight')
        const right = await ax(['다'])
        // eslint-disable-next-line no-console
        console.log(`[J4 접근성] ${JSON.stringify({ before, tabbed, left, right })}`)
        expect({ before, tabbed, left: left.rows, right: right.rows }).toEqual({
          before: {
            rows: {
              가: [{ role: 'button', expanded: true, pressed: 'false' }],
              다: [{ role: 'button', expanded: true, pressed: 'false' }],
              나: [{ role: 'button', expanded: true, pressed: 'false' }],
              가2: [{ role: 'link', expanded: null, pressed: null }],
            },
            toggles: 0,
          },
          tabbed: ['다:다 추가', '다:다 더 보기', '다1'],
          left: { 다: [{ role: 'button', expanded: false, pressed: 'false' }] },
          right: { 다: [{ role: 'button', expanded: true, pressed: 'false' }] },
        })
      } finally {
        await cdp.detach().catch(() => {})
        await close()
      }
    }, 60_000)
  })

  describe('3 · 포커스가 떠난 행동 메뉴', () => {
    it('열린 메뉴에서 포커스가 밖(캔버스 · 다음 단추)으로 가면 메뉴가 닫힌다 — 그 뒤의 Delete 는 닫힌 메뉴처럼 고른 노드를 지운다', async () => {
      const ways: [string, (page: Page) => Promise<void>][] = [
        [
          '캔버스 포커스',
          (page) => page.evaluate(() => (document.querySelector('iframe.wb-shell-canvas-iframe') as HTMLIFrameElement).contentWindow!.focus()),
        ],
        [
          '단추에서 Tab',
          async (page) => {
            await nodeMenu(page, 'n_text0000002', 1).focus()
            await page.keyboard.press('Tab')
          },
        ],
        ['메뉴 안에서 Tab', (page) => page.keyboard.press('Tab')],
      ]
      const results: Record<string, unknown> = {}
      for (const [name, leave] of ways) {
        const fx = await fixture(`menu-leave-${Object.keys(results).length}`)
        const { page, close } = await open(fx.url)
        try {
          await nodeRow(page, 'n_text0000002').click()
          await nodeMenu(page, 'n_text0000002', 1).click()
          await page.locator('[role="menu"]').waitFor()
          await leave(page)
          await sleep(150)
          const left = { menus: await menus(page), focus: await focusOf(page) }
          await page.keyboard.press('Delete')
          results[name] = { ...left, server: await serverPage(fx.url), after: await menus(page) }
        } finally {
          await close()
        }
      }
      // eslint-disable-next-line no-console
      console.log(`[J4 떠난 메뉴] ${JSON.stringify(results)}`)
      expect(results).toEqual({
        '캔버스 포커스': { menus: 0, focus: 'iframe', server: WITHOUT_TEXT2, after: 0 },
        '단추에서 Tab': { menus: 0, focus: 'node:n_text0000003', server: WITHOUT_TEXT2, after: 0 },
        '메뉴 안에서 Tab': { menus: 0, focus: 'node:n_text0000003', server: WITHOUT_TEXT2, after: 0 },
      })
    }, 120_000)

    it('목록 안의 빈 자리(머리 · 여백)를 누르면 포커스가 `body` 로 가도 메뉴는 열린 채다', async () => {
      const fx = await fixture('menu-heading')
      const { page, close } = await open(fx.url)
      try {
        await page.locator('header.wb-shell-header').getByRole('button', { name: '더 보기', exact: true }).click()
        await page.locator('[role="menu"]').waitFor()
        await page.locator('.wb-shell-action-menu-heading').click()
        await sleep(150)
        const result = { focus: await focusOf(page), menus: await menus(page) }
        // eslint-disable-next-line no-console
        console.log(`[J4 떠난 메뉴 — 머리 누름] ${JSON.stringify(result)}`)
        expect(result).toEqual({ focus: 'body', menus: 1 })
      } finally {
        await close()
      }
    }, 60_000)
  })
})
