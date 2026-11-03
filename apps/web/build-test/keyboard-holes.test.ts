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
 * | 고르개 안의 Delete | 메뉴 트리 «옮기기» 목록 안의 Delete · Backspace 가 고른 페이지의 삭제 확인을 건다(구조 트리의 고르개는 걷었다) |
 * | 고르개를 닫은 뒤의 포커스 | 메뉴 트리 «옮기기»를 «취소»로 닫으면 포커스가 `body` 로 떨어진다 |
 * | 닫힌 토글 · 카드 «넣기»의 화살표 | 정본의 «위젯이 안 쓰는 축의 화살표는 선다» · «단추로 연다(↓)»와 다르다 · 닫힌 메뉴 트리 토글의 Alt+↓ 가 메뉴를 열며 그 메뉴를 옮긴다 |
 *
 * 서버의 트리(`GET …/tree`) · 문서(`GET …/pages/:id`)로 지워지지 않았음을 단언한다.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
const NODES = () => [
  C('n_card0000001', '카드', [T('n_text0000001', '글 1'), T('n_text0000002', '글 2'), T('n_text0000003', '글 3')]),
  T('n_text0000004', '글 4'),
]
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
    const seeded = await call('PATCH', `${url}/ops`, {
      baseSeq: 0,
      ops: NODES().map((value, index) => ({ op: 'add', path: `/root/children/${index}`, value })),
    })
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
    const text = (m: M): string =>
      `${m.title}[${order(m.pages)
        .map((p) => p.title)
        .join(',')}|${order(m.children).map(text).join(',')}]`
    return order(body.menu as M[])
      .map(text)
      .join(',')
  }
  const TREE_WHOLE = '가[가1,가2|다[다1|]],나[나1|]'

  /** 서버의 그 페이지 — 뿌리 자식을 글자로(카드는 `제목[자식…]`). 편집이 멎을 때까지 기다린다. */
  async function serverPage(url: string): Promise<string> {
    const shape = async () => {
      const response = await stack.request(alice, 'GET', url)
      const text = (node: { props?: Record<string, unknown>; children?: unknown[] }): string => {
        const label = String(node.props?.content ?? node.props?.title ?? '')
        const children =
          Array.isArray(node.children) && node.children.length > 0 ? `[${node.children.map((c) => text(c as typeof node)).join(',')}]` : ''
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
  const menuRow = (page: Page, id: string) =>
    page.locator(`${TREE} [data-tree-row][data-tree-id="${id}"] > :is(button.wb-shell-tree-menu, a.wb-shell-tree-page)`)

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
        return active.classList.contains('wb-shell-tree-menu') || active.classList.contains('wb-shell-tree-page')
          ? title
          : `${title}:${name}`
      }
      return name
    }, titles)

  /** 메뉴 트리의 고른 줄(`wb-shell-tree-row-picked`) — 제목. */
  const pickedRows = (page: Page, titles: Record<string, string>) =>
    page
      .locator(`${TREE} .wb-shell-tree-row-picked`)
      .evaluateAll((rows, titles) => rows.map((row) => titles[row.getAttribute('data-tree-id') ?? ''] ?? '?'), titles)

  /** 열린 페이지(주소) — 제목. */
  const openedPage = (page: Page, titles: Record<string, string>) =>
    titles[new URL(page.url()).pathname.split('/').pop() ?? ''] ?? page.url()

  /** 메뉴 트리 줄 — 화면 차례대로 제목. */
  const visibleRows = (page: Page, titles: Record<string, string>) =>
    page
      .locator(`${TREE} [data-tree-row]`)
      .evaluateAll((rows, titles) => rows.map((row) => titles[row.getAttribute('data-tree-id') ?? ''] ?? '?'), titles)

  /** 구조 트리의 고른 노드 id. */
  const selectedNode = (page: Page) =>
    page.evaluate(() => {
      const button = document.querySelector('[data-tree-kind="node"] > button[aria-current="true"]')
      return button === null ? null : button.parentElement!.getAttribute('data-tree-id')
    })
  const nodeRow = (page: Page, id: string) => page.locator(`[data-tree-id="${id}"] > button.wb-shell-structure-node`)
  /** 구조 줄의 `+`(0) · `…`(1). */
  /** 구조 트리 줄의 `…`(줄 행동은 `…` 하나다 — `+` 는 걷었다). */
  const nodeMore = (page: Page, id: string) => page.locator(`[data-tree-id="${id}"] button[aria-haspopup="menu"][aria-label$=" 더 보기"]`)
  const item = (page: Page, name: string) => page.getByRole('menuitem', { name, exact: true })
  const menus = (page: Page) => page.locator('[role="menu"]').count()

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
        await page
          .locator(`${TREE} [data-tree-id="${fx.ids['가2']}"] > a[aria-current="page"]`)
          .waitFor({ state: 'attached', timeout: 5_000 })
          .catch(() => {})
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
          // 코드로 준 포커스도 그 줄을 고른다(포커스가 줄에 서면 그 줄이 고른 줄이다 — «7»).
          '맨 위에서 ↑': { focus: '가', picked: ['가'], opened: '가1' },
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
        expect({ down, folded, unfolded }).toEqual({
          down: { focus: '가2', picked: ['가2'], opened: '가1' },
          folded: 'false',
          unfolded: 'true',
        })
      } finally {
        await close()
      }
    }, 60_000)

    it('남의 바꿈으로 다시 받은 뒤 — 이름만 바뀌면 고른 줄 · 포커스가 그대로, 옮겨지면 새 자리에서 그대로, 지워지면 이웃 줄로 간다', async () => {
      const cases: [string, string, (fx: Fixture) => Promise<unknown>, (fx: Fixture, rows: string[]) => boolean][] = [
        [
          '가2 이름 바꿈',
          '가2',
          (fx) => ok(stack.request(bob, 'PATCH', `${fx.P}/pages/${fx.ids['가2']}`, { title: '가2 고침' })),
          () => true,
        ],
        [
          '다 를 나 밑으로 옮김',
          '다',
          (fx) => ok(stack.request(bob, 'PATCH', `${fx.P}/menu/${fx.ids['다']}`, { parentId: fx.ids['나'] })),
          (_fx, rows) => rows.indexOf('다') > rows.indexOf('나'),
        ],
        [
          '가2 지움',
          '가2',
          (fx) => ok(stack.request(bob, 'DELETE', `${fx.P}/pages/${fx.ids['가2']}`)),
          (_fx, rows) => !rows.includes('가2'),
        ],
        [
          '다 지움(하위째)',
          '다',
          (fx) =>
            ok(
              stack.request(bob, 'DELETE', `${fx.P}/menu/${fx.ids['다']}`, {
                cascade: true,
                expect: { menuIds: [], pageIds: [fx.ids['다1']] },
              }),
            ),
          (_fx, rows) => !rows.includes('다'),
        ],
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
          await poll(
            '다시 받는다',
            () => visibleRows(page, fx.titles),
            (rows) => arrived(fx, rows),
            5_000,
          )
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
                return [
                  name,
                  found.map((node) => ({
                    role: node.role?.value,
                    expanded: read(node, 'expanded') ?? null,
                    pressed: read(node, 'pressed') ?? null,
                  })),
                ]
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
          // 포커스가 선 줄이 고른 줄이라 `pressed` 가 참이다(«7»).
          left: { 다: [{ role: 'button', expanded: false, pressed: 'true' }] },
          right: { 다: [{ role: 'button', expanded: true, pressed: 'true' }] },
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
          (page) =>
            page.evaluate(() => (document.querySelector('iframe.wb-shell-canvas-iframe') as HTMLIFrameElement).contentWindow!.focus()),
        ],
        [
          '단추에서 Tab',
          async (page) => {
            await nodeMore(page, 'n_text0000002').focus()
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
          await nodeMore(page, 'n_text0000002').click()
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

  /** 메뉴 트리 «가2» 줄 `…` 의 «옮기기»(소속 메뉴 목록). */
  async function openMove(page: Page, fx: Fixture): Promise<void> {
    const target = page.locator(`${TREE} [data-tree-row][data-tree-id="${fx.ids['가2']}"]`)
    await menuRow(page, fx.ids['가2']!).hover()
    await target.getByRole('button', { name: '가2 더 보기', exact: true }).click()
    await item(page, '옮기기').click()
    await page.locator('.wb-shell-menu-picker').waitFor()
  }

  describe('4 · 고르개 안의 Delete', () => {
    /** 고치기 전에도 초록인 잠금 케이스다 — 메뉴 트리의 키 처리가 «옮기기»가 열린 동안 편집 단축키를 안 받는다(`src/panels/menu-tree.tsx` 의 `handleKeyDown`). */
    it('메뉴 트리 «옮기기» 목록 안의 Delete · Backspace 는 고른 페이지의 삭제 확인을 안 걸고 목록은 열린 채다', async () => {
      const results: Record<string, unknown> = {}
      for (const key of ['Delete', 'Backspace']) {
        const fx = await fixture(`move-del-${key.toLowerCase()}`)
        const { page, close } = await open(fx.url)
        try {
          await openMove(page, fx)
          await page.locator('.wb-shell-menu-picker').getByRole('button', { name: '취소', exact: true }).focus()
          await page.keyboard.press(key)
          await sleep(200)
          results[key] = {
            confirms: await page.locator('.wb-shell-tree-confirm').count(),
            movers: await page.locator('.wb-shell-menu-picker').count(),
            server: await serverTree(fx),
          }
        } finally {
          await close()
        }
      }
      // eslint-disable-next-line no-console
      console.log(`[J4 옮기기 Delete] ${JSON.stringify(results)}`)
      const kept = { confirms: 0, movers: 1, server: TREE_WHOLE }
      expect(results).toEqual({ Delete: kept, Backspace: kept })
    }, 60_000)
  })

  describe('5 · 고르개를 닫은 뒤의 포커스', () => {
    it('메뉴 트리 «옮기기»를 «취소»로 닫으면 포커스가 연 자리로 돌아온다', async () => {
      const cases: [string, (page: Page, fx: Fixture) => Promise<void>, (page: Page) => Promise<void>][] = [
        [
          '메뉴 트리 «옮기기» · «취소» Enter',
          async (page, fx) => {
            await nodeRow(page, 'n_text0000002').click()
            await openMove(page, fx)
          },
          async (page) => {
            await page.locator('.wb-shell-menu-picker').getByRole('button', { name: '취소', exact: true }).focus()
            await page.keyboard.press('Enter')
          },
        ],
      ]
      const results: Record<string, unknown> = {}
      for (const [name, place, shut] of cases) {
        const fx = await fixture(`picker-focus-${Object.keys(results).length}`)
        const { page, close } = await open(fx.url)
        try {
          await place(page, fx)
          const opener = await focusOf(page, fx.titles)
          await page.locator('.wb-shell-menu-picker button:not([disabled])').first().focus()
          await shut(page)
          await sleep(150)
          results[name] = {
            opener,
            pickers: await page.locator('.wb-shell-menu-picker').count(),
            focus: await focusOf(page, fx.titles),
            selected: await selectedNode(page),
          }
        } finally {
          await close()
        }
      }
      // eslint-disable-next-line no-console
      console.log(`[J4 고르개 포커스] ${JSON.stringify(results)}`)
      const back = (opener: string) => ({ opener, pickers: 0, focus: opener, selected: 'n_text0000002' })
      expect(results).toEqual({
        '메뉴 트리 «옮기기» · «취소» Enter': back('가2:가2 더 보기'),
      })
    }, 180_000)
  })

  describe('6 · 닫힌 토글 · 카드 «넣기»의 화살표(정본과 견줌)', () => {
    it('닫힌 `…` 의 ← · 카드 «넣기»의 ↓ 는 선택을 옮긴다 · 토글의 ↓ 는 메뉴를 연다 · 메뉴 트리 닫힌 토글의 Alt+↓ 는 메뉴만 연다', async () => {
      const results: Record<string, unknown> = {}
      {
        const fx = await fixture('n11-toggle')
        const { page, close } = await open(fx.url)
        try {
          await nodeRow(page, 'n_text0000002').click()
          await nodeMore(page, 'n_text0000002').focus()
          await page.keyboard.press('ArrowLeft')
          const left = { selected: await selectedNode(page), menus: await menus(page), focus: await focusOf(page) }
          await page.keyboard.press('Enter')
          await page.locator('[role="menu"]').waitFor()
          results['닫힌 … · ← 뒤 Enter'] = {
            left,
            selected: await selectedNode(page),
            menus: await menus(page),
            server: await serverPage(fx.url),
          }
        } finally {
          await close()
        }
      }
      {
        const fx = await fixture('n11-card')
        const { page, close } = await open(fx.url)
        try {
          await nodeRow(page, 'n_text0000002').click()
          await page.getByRole('contentinfo', { name: '하단 바' }).getByRole('button', { name: '컴포넌트', exact: true }).click()
          await page.getByRole('searchbox', { name: '컴포넌트 찾기' }).fill('Divider')
          await page.locator('[data-wb-palette-card="Divider"]').waitFor()
          await page.getByRole('button', { name: '구분선 넣기', exact: true }).focus()
          await page.keyboard.press('ArrowDown')
          results['카드 «넣기» · ↓'] = { selected: await selectedNode(page), focus: await focusOf(page), server: await serverPage(fx.url) }
        } finally {
          await close()
        }
      }
      {
        const fx = await fixture('o4')
        const { page, close } = await open(fx.url)
        try {
          await nodeRow(page, 'n_text0000002').click()
          await nodeMore(page, 'n_text0000002').click()
          await page.locator('[role="menu"]').waitFor()
          await page.keyboard.press('Escape')
          const closed = { menus: await menus(page), focus: await focusOf(page) }
          await page.keyboard.press('ArrowDown')
          results['닫은 … 에서 ↓'] = { closed, menus: await menus(page), focus: await focusOf(page), selected: await selectedNode(page) }
        } finally {
          await close()
        }
      }
      {
        const fx = await fixture('o4-menu')
        const { page, close } = await open(fx.url)
        try {
          const 가 = page.locator(`${TREE} [data-tree-row][data-tree-id="${fx.ids['가']}"]`)
          await menuRow(page, fx.ids['가']!).click()
          await 가.getByRole('button', { name: '가 더 보기', exact: true }).focus()
          await page.keyboard.press('Alt+ArrowDown')
          await sleep(300)
          results['메뉴 트리 닫힌 … 에서 Alt+↓'] = { menus: await menus(page), server: await serverTree(fx) }
        } finally {
          await close()
        }
      }
      // eslint-disable-next-line no-console
      console.log(`[J4 화살표 정본] ${JSON.stringify(results)}`)
      expect(results).toEqual({
        '닫힌 … · ← 뒤 Enter': {
          left: { selected: 'n_card0000001', menus: 0, focus: 'Text 글 2 더 보기' },
          selected: 'n_text0000002',
          menus: 1,
          server: WHOLE,
        },
        '카드 «넣기» · ↓': { selected: 'n_text0000003', focus: '구분선 넣기', server: WHOLE },
        '닫은 … 에서 ↓': { closed: { menus: 0, focus: 'Text 글 2 더 보기' }, menus: 1, focus: 'menuitem', selected: 'n_text0000002' },
        '메뉴 트리 닫힌 … 에서 Alt+↓': { menus: 1, server: TREE_WHOLE },
      })
    }, 120_000)
  })

  describe('7 · N4 키보드 · 포커스 마무리', () => {
    it('메뉴 트리 — 포커스가 선 줄이 고른 줄이다(Tab 으로 닿은 줄의 Delete 는 그 줄의 삭제 확인) · Home · End 는 보이는 첫 · 끝 줄(L-032 · L-033)', async () => {
      const fx = await fixture('n4-home')
      const { page, close } = await open(fx.url)
      try {
        // 열린 페이지는 «가1» — 고른 줄도 «가1» 이다. Tab 으로 «가2» 에 닿는 것은 그 링크에 포커스가 서는 것과 같다.
        const before = await state(page, fx)
        await menuRow(page, fx.ids['가2']!).focus()
        const arrived = await state(page, fx)
        await page.keyboard.press('Delete')
        await sleep(200)
        const confirm = await page
          .locator('.wb-shell-tree-confirm')
          .evaluateAll(
            (all, titles) =>
              all.map(
                (one) =>
                  titles[
                    one.closest('[data-tree-row]')?.getAttribute('data-tree-id') ??
                      one.parentElement?.previousElementSibling?.getAttribute('data-tree-id') ??
                      ''
                  ] ?? '?',
              ),
            fx.titles,
          )
        await page.keyboard.press('Escape')
        await menuRow(page, fx.ids['가2']!).focus()
        await page.keyboard.press('Home')
        const home = await state(page, fx)
        await page.keyboard.press('End')
        const end = await state(page, fx)
        await page.keyboard.press('Home')
        const homeAgain = await state(page, fx)
        // eslint-disable-next-line no-console
        console.log(`[N4 메뉴 포커스 · Home · End] ${JSON.stringify({ before, arrived, confirm, home, end, homeAgain })}`)
        expect({ before, arrived, home, end, homeAgain }).toEqual({
          before: { focus: 'body', picked: ['가1'], opened: '가1' },
          arrived: { focus: '가2', picked: ['가2'], opened: '가1' },
          home: { focus: '가', picked: ['가'], opened: '가1' },
          end: { focus: '나1', picked: ['나1'], opened: '가1' },
          homeAgain: { focus: '가', picked: ['가'], opened: '가1' },
        })
        // 삭제 확인은 포커스가 선 «가2» 줄 몫이다 — 서버 트리는 그대로(확인만 섰다).
        expect(confirm).toEqual(['가2'])
        expect(await serverTree(fx)).toBe(TREE_WHOLE)
      } finally {
        await close()
      }
    }, 60_000)

    it('구조 트리 — 줄에 포커스를 둔 채 화살표로 선택을 옮기면 포커스가 따라가 이어 친 Enter · Space 가 앞 줄을 다시 고르지 않는다(L-033)', async () => {
      const fx = await fixture('n4-struct')
      const { page, close } = await open(fx.url)
      try {
        await nodeRow(page, 'n_text0000002').click()
        const steps: Record<string, unknown> = {}
        const read = async () => ({ selected: await selectedNode(page), focus: await focusOf(page) })
        await page.keyboard.press('ArrowDown')
        steps['↓'] = await read()
        await page.keyboard.press('Enter')
        steps['↓ Enter'] = await read()
        await page.keyboard.press('ArrowUp')
        await page.keyboard.press('Space')
        steps['↑ Space'] = await read()
        // ← 는 부모(카드)로 · → 는 첫 자식으로 — 포커스도 따라간다.
        await page.keyboard.press('ArrowLeft')
        steps['←'] = await read()
        await page.keyboard.press('ArrowRight')
        steps['→'] = await read()
        // 포커스가 캔버스 · 패널에 있으면 건드리지 않는다.
        await page.locator('.wb-shell-tab').first().focus()
        await page.keyboard.press('ArrowDown')
        steps['탭에서 ↓'] = await read()
        // eslint-disable-next-line no-console
        console.log(`[N4 구조 트리 포커스] ${JSON.stringify(steps)}`)
        expect(steps).toEqual({
          '↓': { selected: 'n_text0000003', focus: 'node:n_text0000003' },
          '↓ Enter': { selected: 'n_text0000003', focus: 'node:n_text0000003' },
          '↑ Space': { selected: 'n_text0000002', focus: 'node:n_text0000002' },
          '←': { selected: 'n_card0000001', focus: 'node:n_card0000001' },
          '→': { selected: 'n_text0000001', focus: 'node:n_text0000001' },
          '탭에서 ↓': { selected: 'n_text0000002', focus: 'tab' },
        })
        expect(await serverPage(fx.url)).toBe(WHOLE)
      } finally {
        await close()
      }
    }, 60_000)

    /** 정본(`shell/action-menu.tsx` 머리말 «끈 항목은 …» — 누르기 · Enter · Space 는 아무것도 안 한다)과 같은 값이라 고치기 전에도 초록이다(L-070). */
    it('꺼진 항목을 누르면 메뉴는 열린 채 남고 아무 편집도 안 나간다 — 정본대로(L-070)', async () => {
      const fx = await fixture('n4-disabled')
      const { page, close } = await open(fx.url)
      try {
        await nodeRow(page, 'n_text0000001').click()
        await nodeMore(page, 'n_text0000001').click()
        await page.locator('[role="menu"]').waitFor()
        const off = await page.locator('[role="menuitem"][aria-disabled="true"]').evaluateAll((all) => all.map((one) => one.textContent))
        await page.locator('[role="menuitem"][aria-disabled="true"]').first().click({ force: true })
        await sleep(200)
        await page.keyboard.press('Enter')
        await sleep(200)
        const result = { off, menus: await menus(page), focus: await focusOf(page), server: await serverPage(fx.url) }
        // eslint-disable-next-line no-console
        console.log(`[N4 꺼진 항목] ${JSON.stringify(result)}`)
        expect(result).toEqual({ off: ['위로', '들여쓰기'], menus: 1, focus: 'menuitem', server: WHOLE })
      } finally {
        await close()
      }
    }, 60_000)

    it('옮기기 목록 안의 Escape 는 목록을 닫고 연 자리로 포커스를 돌려준다 — 고르는 칸 · «취소» 모두(L-045)', async () => {
      const results: Record<string, unknown> = {}
      for (const [name, focus] of [
        ['고르는 칸', (page: Page) => page.locator('.wb-shell-menu-picker select').focus()],
        ['«취소»', (page: Page) => page.locator('.wb-shell-menu-picker button').focus()],
      ] as const) {
        const fx = await fixture(`n4-moveesc-${Object.keys(results).length}`)
        const { page, close } = await open(fx.url)
        try {
          await openMove(page, fx)
          const opener = await focusOf(page, fx.titles)
          await focus(page)
          await page.keyboard.press('Escape')
          await sleep(200)
          results[name] = {
            opener,
            movers: await page.locator('.wb-shell-menu-picker').count(),
            focus: await focusOf(page, fx.titles),
            server: await serverTree(fx),
          }
        } finally {
          await close()
        }
      }
      // eslint-disable-next-line no-console
      console.log(`[N4 옮기기 Escape] ${JSON.stringify(results)}`)
      const back = { opener: '가2:가2 더 보기', movers: 0, focus: '가2:가2 더 보기', server: TREE_WHOLE }
      expect(results).toEqual({ '고르는 칸': back, '«취소»': back })
    }, 120_000)

    it('상자를 연 메뉴가 그 사이 사라지면 상자를 닫을 때 포커스가 트리의 줄로 간다 — `body` 로 안 떨어진다(L-058)', async () => {
      const fx = await fixture('n4-dialoggone')
      const { page, close } = await open(fx.url)
      try {
        const target = page.locator(`${TREE} [data-tree-row][data-tree-id="${fx.ids['나']}"]`)
        await menuRow(page, fx.ids['나']!).hover()
        await target.getByRole('button', { name: '나 추가', exact: true }).click()
        await page.getByRole('menuitem', { name: 'JSON 에서 가져오기…', exact: true }).click()
        await page.getByRole('dialog').waitFor()
        await ok(
          stack.request(bob, 'DELETE', `${fx.P}/menu/${fx.ids['나']}`, {
            cascade: true,
            expect: { menuIds: [], pageIds: [fx.ids['나1']] },
          }),
        )
        await poll(
          '트리에서 «나» 가 빠짐',
          () => visibleRows(page, fx.titles),
          (rows) => !rows.includes('나'),
          5_000,
        )
        const open1 = await page.getByRole('dialog').count()
        await page.keyboard.press('Escape')
        await sleep(300)
        const result = {
          dialogOpenAfterRemoteDelete: open1,
          dialogs: await page.getByRole('dialog').count(),
          focus: await focusOf(page, fx.titles),
          picked: await pickedRows(page, fx.titles),
        }
        // eslint-disable-next-line no-console
        console.log(`[N4 사라진 메뉴의 상자] ${JSON.stringify(result)}`)
        // 포커스는 고른 줄이다 — 남이 지운 «나» 를 고르고 있었으면 다시 받은 트리가 이웃 «다1» 을 골랐다(`panels/menu-tree.tsx` 의 `treeFocusFallback`).
        expect(result).toEqual({ dialogOpenAfterRemoteDelete: 1, dialogs: 0, focus: '다1', picked: ['다1'] })
      } finally {
        await close()
      }
    }, 60_000)

    /**
     * 값으로 적어 둘 것(L-035) — 열린 페이지가 남의 지움으로 사라지면 고른 줄이 이웃 줄로 옮는다. 정본(`use-tree-commands.tsx` 의 `reconcile` ·
     * `pickAfterGone`)대로다. **포커스가 그 줄에 있으면 다시 받은 트리가 포커스를 이웃 줄로 돌려주고(`refocus`) 그 포커스가 줄을 고르므로** 두 길이
     * 같은 값을 낸다 — 포커스가 다른 데(우측 탭 — 캔버스는 지운 페이지를 내려 포커스를 `body` 로 떨어뜨려 같은 길을 탄다)에 있는 판이 `pickAfterGone` 의 몫이다.
     */
    it('열린 페이지가 남의 지움으로 사라지면 고른 줄이 이웃 줄로 옮는다 — 포커스가 그 줄에 있으면 따라가고 우측 탭에 있으면 그대로다(L-035 — 값)', async () => {
      const results: Record<string, unknown> = {}
      for (const where of ['줄', '탭'] as const) {
        const fx = await fixture(`n4-gone-${where === '줄' ? 'row' : 'tab'}`)
        const { page, close } = await open(fx.url)
        try {
          await menuRow(page, fx.ids['나1']!).click()
          await page.locator(`${TREE} [data-tree-id="${fx.ids['나1']}"] > a[aria-current="page"]`).waitFor({ state: 'attached' })
          await sleep(300)
          if (where === '탭') await page.locator('.wb-shell-tab').first().focus()
          const before = await state(page, fx)
          await ok(stack.request(bob, 'DELETE', `${fx.P}/pages/${fx.ids['나1']}`))
          await poll(
            '트리에서 «나1» 이 빠짐',
            () => visibleRows(page, fx.titles),
            (rows) => !rows.includes('나1'),
            5_000,
          )
          await sleep(500)
          results[where] = { before, after: await state(page, fx) }
        } finally {
          await close()
        }
      }
      // eslint-disable-next-line no-console
      console.log(`[N4 열린 페이지가 사라짐] ${JSON.stringify(results)}`)
      expect(results).toEqual({
        줄: { before: { focus: '나1', picked: ['나1'], opened: '나1' }, after: { focus: '나', picked: ['나'], opened: '나1' } },
        탭: { before: { focus: 'tab', picked: ['나1'], opened: '나1' }, after: { focus: 'tab', picked: ['나'], opened: '나1' } },
      })
    }, 120_000)

    it('우측 패널 탭 — ← → Home End 로 탭을 옮기고 포커스가 따라간다 · 고른 탭만 Tab 정지점이다(L-037)', async () => {
      const fx = await fixture('n4-tabs')
      const { page, close } = await open(fx.url)
      try {
        const tabs = page.locator('.wb-shell-tab')
        const selectedTab = () => page.locator('.wb-shell-tab[aria-selected="true"]').textContent()
        const read = async () => ({ tab: await selectedTab(), focus: await page.evaluate(() => document.activeElement?.textContent ?? '') })
        const steps: Record<string, unknown> = {}
        steps['탭 정지점'] = await tabs.evaluateAll((all) => all.map((one) => one.getAttribute('tabindex')))
        // 처음 고른 탭(«컴포넌트»)은 첫 탭(«페이지 정보») 다음이다 — Tab 으로 닿는 그 탭에서 시작한다.
        await page.locator('.wb-shell-tab[aria-selected="true"]').focus()
        steps['처음'] = await read()
        await page.keyboard.press('ArrowRight')
        steps['→'] = await read()
        await page.keyboard.press('End')
        steps['End'] = await read()
        await page.keyboard.press('ArrowRight')
        steps['끝에서 →'] = await read()
        await page.keyboard.press('ArrowLeft')
        steps['←'] = await read()
        await page.keyboard.press('Home')
        steps['Home'] = await read()
        steps['본문 id'] = await page.locator('[role="tabpanel"]').getAttribute('aria-labelledby')
        // 탭의 ← → 는 위젯이 쥔다 — 고른 노드는 그대로다(`keyHeldByWidget`).
        await nodeRow(page, 'n_text0000002').click()
        await tabs.first().focus()
        await page.keyboard.press('ArrowRight')
        steps['노드를 고른 채 →'] = { selected: await selectedNode(page), ...(await read()) }
        // eslint-disable-next-line no-console
        console.log(`[N4 우측 탭] ${JSON.stringify(steps)}`)
        expect(steps).toEqual({
          '탭 정지점': ['-1', '0', '-1', '-1'],
          처음: { tab: '컴포넌트', focus: '컴포넌트' },
          '→': { tab: '코멘트', focus: '코멘트' },
          End: { tab: '상호작용', focus: '상호작용' },
          '끝에서 →': { tab: '상호작용', focus: '상호작용' },
          '←': { tab: '코멘트', focus: '코멘트' },
          Home: { tab: '페이지 정보', focus: '페이지 정보' },
          '본문 id': 'wb-tab-page',
          '노드를 고른 채 →': { selected: 'n_text0000002', tab: '컴포넌트', focus: '컴포넌트' },
        })
      } finally {
        await close()
      }
    }, 60_000)

    /**
     * 거절된 삭제의 선택(L-061) — **세 경로(줄 `…` «삭제» · 키보드 단일 · 키보드 일괄)가 같은 선택으로 돌아온다.** 편집을 서버에 닿기 전에 잡아 두었다가(`routeWebSocket` 의
     * `patch` 프레임) 423 `patch-error` 로 거절하고, 남이 그 사이 노드를 지우거나 다른 부모로 옮긴 판은 잡아 둔 동안 bob 이 보낸다. 돌아온 노드가 없으면 선택은 빈 채다.
     * 판 카나리아: `held`(잡은 프레임 수 — 받아들임 판은 0) · 남이 보낸 요청의 상태 코드.
     */
    it('거절된 삭제가 노드를 돌려놓으면 고른 노드도 돌아온다 — 줄 … · 키보드 단일 · 일괄이 같다 · 남이 지웠거나 옮겼으면 비운 채다(L-061)', async () => {
      type Variant = { path: 'row' | 'key'; pick: string[]; reject: boolean; bob?: 'remove' | 'move' }
      const variants: [string, Variant][] = [
        ['줄 … 삭제 · 하나', { path: 'row', pick: ['n_text0000002'], reject: true }],
        ['키보드 · 하나', { path: 'key', pick: ['n_text0000002'], reject: true }],
        ['키보드 · 여럿', { path: 'key', pick: ['n_text0000001', 'n_text0000003'], reject: true }],
        ['키보드 · 여럿 · 남이 하나를 지움', { path: 'key', pick: ['n_text0000001', 'n_text0000003'], reject: true, bob: 'remove' }],
        ['키보드 · 하나 · 남이 다른 부모로 옮김', { path: 'key', pick: ['n_text0000002'], reject: true, bob: 'move' }],
        ['키보드 · 여럿 · 받아들임', { path: 'key', pick: ['n_text0000001', 'n_text0000003'], reject: false }],
      ]
      const results: Record<string, unknown> = {}
      for (const [name, variant] of variants) {
        const fx = await fixture(`n4-423-${Object.keys(results).length}`)
        const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
        try {
          const projectId = fx.P.split('/').pop()!
          let armed = false
          let held: { send: (text: string) => void; frame: any } | null = null
          let heldCount = 0
          await page.routeWebSocket(/\/ws/, (route) => {
            const server = route.connectToServer()
            route.onMessage((message) => {
              const frame = (() => {
                try {
                  return JSON.parse(typeof message === 'string' ? message : message.toString())
                } catch {
                  return null
                }
              })()
              if (variant.reject && armed && held === null && frame?.type === 'patch') {
                heldCount += 1
                held = { send: (text) => route.send(text), frame }
                return
              }
              server.send(message)
            })
            server.onMessage((message) => route.send(message))
          })
          await page.goto(fx.url)
          await canvasFrame(page).locator('[data-wb-id="n_text0000002"]').waitFor()
          await sleep(600)
          const picked = () =>
            page
              .locator('[data-tree-kind="node"]')
              .evaluateAll((all) =>
                all
                  .filter(
                    (one) =>
                      one.querySelector(':scope > button[aria-current="true"], :scope > button.wb-shell-structure-node-member') !== null,
                  )
                  .map((one) => one.getAttribute('data-tree-id')),
              )
          await nodeRow(page, variant.pick[0]!).click()
          for (const id of variant.pick.slice(1)) {
            await page.keyboard.down('ControlOrMeta')
            await nodeRow(page, id).click()
            await page.keyboard.up('ControlOrMeta')
          }
          const before = await picked()
          armed = true
          if (variant.path === 'row') {
            await nodeMore(page, variant.pick[0]!).click()
            await item(page, '삭제').click()
          } else {
            await page.keyboard.press('Delete')
          }
          let bobStatus: number | null = null
          if (variant.reject) {
            await poll(
              '편집을 잡았다',
              async () => heldCount,
              (n) => n === 1,
              5_000,
            )
            if (variant.bob !== undefined) {
              // 내 선택의 잠금이 풀리는 사이의 423 은 다시 보낸다.
              for (let attempt = 0; attempt < 15 && bobStatus !== 200; attempt += 1) {
                const now = await stack.request(bob, 'GET', fx.url)
                const op =
                  variant.bob === 'remove'
                    ? { op: 'remove', path: '/root/children/0/children/0' }
                    : { op: 'move', from: '/root/children/0/children/1', path: '/root/children/2' }
                bobStatus = (await stack.request(bob, 'PATCH', `${fx.url}/ops`, { baseSeq: now.body.headSeq, ops: [op] })).status
                if (bobStatus !== 200) await sleep(300)
              }
              await sleep(500)
            }
            held!.send(
              JSON.stringify({
                type: 'patch-error',
                projectId,
                pageId: held!.frame.pageId,
                clientOpId: held!.frame.clientOpId,
                status: 423,
                code: 'locked',
                message: '밥님이 편집 중인 노드입니다',
                issues: [],
              }),
            )
          }
          await sleep(1_500)
          results[name] = { before, held: heldCount, bob: bobStatus, after: await picked() }
        } finally {
          await context.close()
        }
      }
      // eslint-disable-next-line no-console
      console.log(`[N4 거절된 삭제의 선택] ${JSON.stringify(results)}`)
      expect(results).toEqual({
        '줄 … 삭제 · 하나': { before: ['n_text0000002'], held: 1, bob: null, after: ['n_text0000002'] },
        '키보드 · 하나': { before: ['n_text0000002'], held: 1, bob: null, after: ['n_text0000002'] },
        '키보드 · 여럿': { before: ['n_text0000001', 'n_text0000003'], held: 1, bob: null, after: ['n_text0000001', 'n_text0000003'] },
        '키보드 · 여럿 · 남이 하나를 지움': { before: ['n_text0000001', 'n_text0000003'], held: 1, bob: 200, after: [] },
        '키보드 · 하나 · 남이 다른 부모로 옮김': { before: ['n_text0000002'], held: 1, bob: 200, after: [] },
        '키보드 · 여럿 · 받아들임': { before: ['n_text0000001', 'n_text0000003'], held: 0, bob: null, after: [] },
      })
    }, 300_000)

    it('속성 고르개에 같은 값의 change 가 와도 편집을 안 낸다 — 다른 값은 낸다(L-062)', async () => {
      const fx = await fixture('n4-select')
      const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
      try {
        let patches = 0
        await page.routeWebSocket(/\/ws/, (route) => {
          const server = route.connectToServer()
          route.onMessage((message) => {
            try {
              if (JSON.parse(typeof message === 'string' ? message : message.toString())?.type === 'patch') patches += 1
            } catch {
              /* 프레임이 아닌 것은 그대로 보낸다 */
            }
            server.send(message)
          })
          server.onMessage((message) => route.send(message))
        })
        await page.goto(fx.url)
        await canvasFrame(page).locator('[data-wb-id="n_card0000001"]').waitFor()
        await sleep(600)
        await canvasFrame(page).locator('[data-wb-id="n_card0000001"]').click()
        const select = page.locator('select.wb-shell-control').first()
        await select.waitFor()
        await select.selectOption('h1')
        await poll(
          '첫 편집이 나감',
          async () => patches,
          (n) => n >= 1,
          5_000,
        )
        const first = patches
        // 같은 값의 change — Playwright 의 `selectOption` 은 값이 같아도 `input` · `change` 를 낸다.
        await select.selectOption('h1')
        await sleep(800)
        const same = patches
        await select.selectOption('h2')
        await poll(
          '다른 값은 나감',
          async () => patches,
          (n) => n > same,
          5_000,
        )
        // eslint-disable-next-line no-console
        console.log(`[N4 같은 값의 change] ${JSON.stringify({ first, same, other: patches })}`)
        expect({ first, same, other: patches }).toEqual({ first: 1, same: 1, other: 2 })
      } finally {
        await context.close()
      }
    }, 60_000)

    it('상자 머리 · 배경막에 놓은 파일을 브라우저가 열지 않는다 — 파일 칸에 놓은 파일은 받는다(L-063)', async () => {
      const fx = await fixture('n4-filedrop')
      const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
      const dir = await mkdtemp(join(tmpdir(), 'wb-n4-drop-'))
      const file = join(dir, 'dropped.wirebound-page.json')
      await writeFile(
        file,
        JSON.stringify({
          wireboundVersion: '1',
          page: { title: '놓은 파일', description: null },
          schema: {
            version: 5,
            root: { id: 'file_root', type: 'Page', children: [{ id: 'file_text', type: 'Text', props: { content: '본문' } }] },
          },
          comments: [],
        }),
      )
      try {
        await page.goto(fx.url)
        await canvasFrame(page).locator('[data-wb-id="n_text0000002"]').waitFor()
        await page.locator(`${TREE} [data-tree-row]`).first().waitFor({ state: 'attached' })
        await sleep(400)
        const target = page.locator(`${TREE} [data-tree-row][data-tree-id="${fx.ids['나']}"]`)
        await menuRow(page, fx.ids['나']!).hover()
        await target.getByRole('button', { name: '나 추가', exact: true }).click()
        await page.getByRole('menuitem', { name: 'JSON 에서 가져오기…', exact: true }).click()
        const dialog = page.getByRole('dialog')
        await dialog.waitFor()
        const cdp = await context.newCDPSession(page)
        const drop = async (x: number, y: number) => {
          const data = { items: [], files: [file], dragOperationsMask: 1 }
          await cdp.send('Input.dispatchDragEvent', { type: 'dragEnter', x, y, data })
          await cdp.send('Input.dispatchDragEvent', { type: 'dragOver', x, y, data })
          await cdp.send('Input.dispatchDragEvent', { type: 'drop', x, y, data })
          await sleep(500)
        }
        const centre = async (selector: string) => {
          const box = (await page.locator(selector).boundingBox())!
          return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
        }
        const results: Record<string, unknown> = {}
        const url = page.url()
        // 상자 머리 · 배경막(상자 밖 왼쪽 위 모서리) · 몸체의 파일 칸.
        const head = await centre('.wb-shell-dialog-head h2')
        await drop(head.x, head.y)
        results['머리'] = { tabs: context.pages().length, url: page.url() === url, dialogs: await dialog.count() }
        await drop(4, 4)
        results['배경막'] = { tabs: context.pages().length, url: page.url() === url, dialogs: await dialog.count() }
        const zone = await centre('.wb-shell-pagejson-drop')
        await drop(zone.x, zone.y)
        const preview = await poll(
          '칸이 받음',
          () => dialog.getByRole('status').textContent(),
          (text) => (text ?? '').includes('놓은 파일'),
          5_000,
        ).catch(() => 'no preview')
        results['파일 칸'] = {
          tabs: context.pages().length,
          url: page.url() === url,
          dialogs: await dialog.count(),
          received: String(preview).includes('놓은 파일'),
        }
        // eslint-disable-next-line no-console
        console.log(`[N4 파일 놓기] ${JSON.stringify(results)}`)
        expect(results).toEqual({
          머리: { tabs: 1, url: true, dialogs: 1 },
          배경막: { tabs: 1, url: true, dialogs: 1 },
          '파일 칸': { tabs: 1, url: true, dialogs: 1, received: true },
        })
      } finally {
        await context.close()
        await rm(dir, { recursive: true, force: true })
      }
    }, 90_000)
  })
})
