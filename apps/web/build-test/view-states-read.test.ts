/**
 * **화면 상태 읽기를 실브라우저로 잰다**(설계서 「설계서 화면 구조」 «화면 상태» · `src/shell/view-state-address.ts` · `src/canvas/state-badges.tsx`).
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | viewer 가 `?state=` 주소로 연다 | 주소의 상태로 안 선다 · 없는 id 가 기본으로 안 간다 |
 * | 영역 표지 | 뷰 모드에서 영역에 안 선다 · 영역의 왼쪽 위에 안 붙는다 · 가지 목록이 그 영역의 가지가 아니다 · 고른 상태가 캔버스 · 머리 · 주소에 안 간다 |
 * | 붙이기 통지 | 다른 페이지에서 온 영역의 없는 상태 가지를 안 빼거나 출처의 이름으로 안 말한다 |
 * | 창 900 | 전환기가 `…` 로 접힌 머리(K2 `shell/head-fold.ts` 의 `tight`)에서 `…` 의 상태 항목 · 영역 표지 · 주소가 한 값을 안 따른다 |
 * | 고른 노드 | 뷰 모드에서 영역 표지로 상태를 바꿔 숨은 노드가 고른 것에 남는다(K2 `HiddenSelectionPrune`) · 편집이 나간다 · 편집 모드로 돌아와 주소가 바뀐다 |
 *
 * `WB_SHOTS_DIR` 를 주면 창 1440×900 의 화면을 찍어 둔다 — 뷰 모드 머리 전환기 · 영역 표지와 가지 목록 · 붙이기 통지.
 */
import { join } from 'node:path'
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canvasFrame, editorStackPrerequisite, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

const ADMIN = { id: 's_admin', name: '관리자' }
const GUEST = { id: 's_guest', name: '손님' }

const text = (id: string, content: string) => ({ id, type: 'Text', props: { content } })

/** 영역 밖 글 하나 · 상태 영역 하나(기본 가지 · 관리자 가지 — 손님 가지는 없다). */
const NODES = [
  text('n_out', '영역 밖 글'),
  // 누르면 캔버스 위에 런타임 알림 줄이 선다(없는 대상) — iframe 이 아래로 밀린 판에서 표지가 따라가는지 잰다.
  { id: 'n_bad', type: 'Button', props: { label: '없는 대상' }, interactions: [{ on: 'click', actions: [{ type: 'setVisible', target: 'n_missing', value: false }] }] },
  {
    id: 'n_sw',
    type: 'StateSwitch',
    children: [
      { id: 'n_cd', type: 'StateCase', props: { state: 'default' }, children: [text('n_dt', '기본 글')] },
      { id: 'n_ca', type: 'StateCase', props: { state: ADMIN.id }, children: [text('n_at', '관리자 글')] },
    ],
  },
]

const VIEWPORT = { width: 1440, height: 900 }

function shot(page: Page, name: string): Promise<unknown> | undefined {
  const dir = process.env.WB_SHOTS_DIR
  return dir === undefined ? undefined : page.screenshot({ path: join(dir, name) })
}

describe.skipIf(!전제.ok)('화면 상태 읽기 — 실브라우저', () => {
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
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  })

  const call = (m: string, p: string, b?: unknown) => stack.request(alice, m, p, b)

  /** 프로젝트 · 메뉴 · 페이지 둘(둘째는 상태 없는 빈 페이지). 첫 페이지에 상태 둘과 영역을 싣는다. bob 은 viewer. */
  async function fixture(slug: string): Promise<{ P: string; P2: string }> {
    const project = (await call('POST', '/projects', { name: '화면 상태 읽기', slug: `${slug}-${Date.now().toString(36)}` })).body
    const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '가' })).body
    const member = await call('POST', `/projects/${project.id}/members`, { email: stack.users.bob.email, role: 'viewer' })
    if (member.status >= 300) throw new Error(`member ${member.status}`)
    const pageId = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '첫째' })).body.id as string
    const page2Id = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '둘째' })).body.id as string
    const P = `/projects/${project.id}/pages/${pageId}`
    const seeded = await call('PATCH', `${P}/ops`, {
      baseSeq: 0,
      ops: [{ op: 'add', path: '/viewStates', value: [ADMIN, GUEST] }, ...NODES.map((value, at) => ({ op: 'add', path: `/root/children/${at}`, value }))],
    })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
    return { P, P2: `/projects/${project.id}/pages/${page2Id}` }
  }

  /** 탭을 연다 — 나간 편집 프레임(`patch`)을 센다(뷰 모드에는 편집이 없다). */
  async function openTab(path: string, user: 'alice' | 'bob' = 'alice', viewport = VIEWPORT) {
    const { context, page } = await stack.openTab(stack.users[user], { viewport })
    const patches: string[] = []
    page.on('websocket', (socket) => {
      socket.on('framesent', (frame) => {
        const payload = typeof frame.payload === 'string' ? frame.payload : frame.payload.toString()
        if (payload.includes('"type":"patch"')) patches.push(payload)
      })
    })
    await page.goto(path)
    await canvasFrame(page).locator('[data-wb-id]').first().waitFor({ state: 'attached' })
    return { page, patches, close: () => context.close() }
  }

  const switcher = (page: Page) => page.getByRole('button', { name: /^화면 상태:/ })
  const badge = (page: Page) => page.getByRole('button', { name: /^상태에 따라 다름/ })
  const canvasIds = async (page: Page) => (await canvasFrame(page).locator('[data-wb-id]').evaluateAll((els) => els.map((el) => el.getAttribute('data-wb-id') ?? ''))).slice(1)
  /**
   * 메뉴의 항목을 고르고 닫힌 것을 기다린다. 같은 자리를 곧 다시 누르는 판이 있어 `DOUBLE_CLICK_MS`(500ms — `shell/action-menu.tsx`)를 넘겨
   * 돌아온다 — 안 넘기면 다음 누름이 더블클릭의 둘째로 삼켜진다.
   */
  async function pick(page: Page, name: string): Promise<void> {
    await page.getByRole('menuitemradio', { name, exact: true }).click()
    await page.locator('[role="menu"]').waitFor({ state: 'detached' })
    await frames(page)
    await page.waitForTimeout(600)
  }
  /** 연 메뉴의 고른 항목을 읽고 Escape 로 닫는다. */
  async function checkedIn(page: Page, opener: ReturnType<Page['locator']>): Promise<string[]> {
    await opener.click()
    await page.getByRole('menuitemradio').first().waitFor()
    const checked = await page.getByRole('menuitemradio', { checked: true }).allTextContents()
    await page.keyboard.press('Escape')
    await page.locator('[role="menu"]').waitFor({ state: 'detached' })
    await page.waitForTimeout(600)
    return checked
  }
  const frames = (page: Page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  /** 캔버스에 선 노드 id(뿌리 뺌) · 머리 전환기 이름 · 주소의 질의. */
  async function shown(page: Page): Promise<{ canvas: string[]; head: string; search: string }> {
    const canvas = await canvasFrame(page).locator('[data-wb-id]').evaluateAll((els) => els.map((el) => el.getAttribute('data-wb-id') ?? ''))
    return { canvas: canvas.slice(1), head: (await switcher(page).getAttribute('aria-label')) ?? '', search: new URL(page.url()).search }
  }

  it('viewer 가 ?state= 주소로 열면 그 상태로 서고, 없는 id 는 기본이다', async () => {
    const { P } = await fixture('vs-read-addr')
    const seen: Record<string, unknown> = {}
    for (const [label, query] of [['관리자', '?state=s_admin'], ['없는 id', '?state=s_nope']] as const) {
      const tab = await openTab(`${P}${query}`, 'bob')
      try {
        await frames(tab.page)
        seen[label] = await shown(tab.page)
        if (label === '관리자') {
          await switcher(tab.page).click()
          await tab.page.getByRole('menuitemradio', { name: '관리자', exact: true }).waitFor()
          await shot(tab.page, 'k3-view-switcher.png')
        }
      } finally {
        await tab.close()
      }
    }
    expect(seen).toEqual({
      관리자: { canvas: ['n_out', 'n_bad', 'n_at'], head: '화면 상태: 관리자', search: '?state=s_admin' },
      // viewer 는 모드와 상관없이 주소를 쓴다 — 기본으로 서며 없는 id 의 질의를 걷는다.
      '없는 id': { canvas: ['n_out', 'n_bad', 'n_dt'], head: '화면 상태: 기본', search: '' },
    })
  })

  it('영역 표지 — 뷰 모드에서 영역의 안쪽 왼쪽 위에 서고, 누르면 그 영역의 가지에서 고른다 · 머리 · 주소가 따라간다', async () => {
    const { P } = await fixture('vs-read-badge')
    const tab = await openTab(P)
    try {
      expect(await badge(tab.page).count()).toBe(0)
      await tab.page.getByRole('button', { name: '뷰 모드' }).click()
      await badge(tab.page).waitFor()
      await frames(tab.page)
      // 표지의 왼쪽 위 = 영역(그려진 가지 자식 상자)의 왼쪽 위 — 화면 좌표. 점선 상자는 영역 상자 그대로다.
      const place = await tab.page.evaluate(() => {
        const iframe = document.querySelector('iframe') as HTMLIFrameElement
        const outer = iframe.getBoundingClientRect()
        const scale = outer.width / iframe.clientWidth
        const inner = iframe.contentDocument!.querySelector('[data-wb-id="n_dt"]')!.getBoundingClientRect()
        const holder = document.querySelector('[data-wb-state-badge-for="n_sw"]')!.getBoundingClientRect()
        const frameBox = document.querySelector('[data-wb-state-region-for="n_sw"]')!.getBoundingClientRect()
        const region = [outer.left + inner.left * scale, outer.top + inner.top * scale, outer.left + inner.right * scale, outer.top + inner.bottom * scale]
        return { region, badge: [holder.left, holder.top], frame: [frameBox.left, frameBox.top, frameBox.right, frameBox.bottom], iframeTop: outer.top }
      })
      expect(Math.abs(place.badge[0]! - place.region[0]!)).toBeLessThanOrEqual(1)
      expect(Math.abs(place.badge[1]! - place.region[1]!)).toBeLessThanOrEqual(1)
      for (const [at, value] of place.frame.entries()) expect(Math.abs(value - place.region[at]!)).toBeLessThanOrEqual(1)
      // 표지의 글은 줄임표 없이 다 보인다(`fullText` — 머리 전환기의 `8em` 줄임을 걷는다). 이 기계의 글꼴로는 글이 100px · 한도 104px 라
      // 걷지 않아도 맞는다 — 한글 글자가 더 넓은 글꼴(다른 OS)을 자간으로 흉내 내 잰다. 흉내가 실렸는지를 함께 본다.
      const cut = await tab.page.evaluate(() => {
        const text = document.querySelector('[data-wb-state-badge-for="n_sw"] .wb-shell-action-menu-text') as HTMLElement
        const wide = document.createElement('style')
        wide.textContent = '.wb-shell-action-menu-text { letter-spacing: 3px; }'
        document.head.append(wide)
        const value = { spacing: getComputedStyle(text).letterSpacing, scroll: text.scrollWidth, client: text.clientWidth }
        wide.remove()
        return value
      })
      expect(cut.spacing).toBe('3px')
      expect(cut.scroll).toBeLessThanOrEqual(cut.client)

      // 알림 줄이 iframe 을 밀면 표지도 따라 내려간다(표면 좌표의 iframe 자리 — `canvas.tsx` 의 `frameOffset`).
      await canvasFrame(tab.page).locator('[data-wb-id="n_bad"]').click()
      await tab.page.locator('.wb-shell-canvas-runtime').waitFor()
      await frames(tab.page)
      const pushed = await tab.page.evaluate(() => {
        const iframe = document.querySelector('iframe') as HTMLIFrameElement
        const outer = iframe.getBoundingClientRect()
        const scale = outer.width / iframe.clientWidth
        const inner = iframe.contentDocument!.querySelector('[data-wb-id="n_dt"]')!.getBoundingClientRect()
        const holder = document.querySelector('[data-wb-state-badge-for="n_sw"]')!.getBoundingClientRect()
        return { shifted: outer.top, region: outer.top + inner.top * scale, badge: holder.top }
      })
      // 카나리아 — 알림 줄이 iframe 을 실제로 밀었다(안 밀면 iframe 자리를 안 더하는 변조가 산다).
      expect(pushed.shifted).toBeGreaterThan(place.iframeTop + 5)
      expect(Math.abs(pushed.badge - pushed.region)).toBeLessThanOrEqual(1)

      await badge(tab.page).click()
      const items = tab.page.getByRole('menuitemradio')
      await items.first().waitFor()
      const listed = await items.evaluateAll((els) => els.map((el) => [el.textContent, el.getAttribute('aria-checked')]))
      await shot(tab.page, 'k3-view-badge-list.png')
      await tab.page.getByRole('menuitemradio', { name: '관리자', exact: true }).click()
      await tab.page.locator('[role="menu"]').waitFor({ state: 'detached' })
      await frames(tab.page)
      expect({ listed, after: await shown(tab.page) }).toEqual({
        listed: [
          ['기본', 'true'],
          ['관리자', 'false'],
        ],
        after: { canvas: ['n_out', 'n_bad', 'n_at'], head: '화면 상태: 관리자', search: '?state=s_admin' },
      })
    } finally {
      await tab.close()
    }
  })

  it('창 900 — 전환기가 `…` 로 접힌 머리에서 `…` 의 상태 항목 · 영역 표지 · 주소가 한 값을 따른다', async () => {
    const { P } = await fixture('vs-read-tight')
    const tab = await openTab(`${P}?state=s_admin`, 'bob', { width: 900, height: 700 })
    try {
      // viewer 도 «편집 모드»로 연다(읽기 전용) — 영역 표지는 뷰 모드에만 선다.
      await tab.page.getByRole('button', { name: '뷰 모드', exact: true }).click()
      await badge(tab.page).waitFor()
      await frames(tab.page)
      const more = tab.page.locator('.wb-shell-header').getByRole('button', { name: '더 보기', exact: true })
      const read = async () => ({
        inHead: await switcher(tab.page).count(),
        folded: await checkedIn(tab.page, more),
        badge: await checkedIn(tab.page, badge(tab.page)),
        canvas: await canvasIds(tab.page),
        search: new URL(tab.page.url()).search,
      })
      const seen: Record<string, unknown> = { 열림: await read() }
      // 영역 표지로 기본 — 접힌 `…` 의 항목과 주소가 따른다.
      await badge(tab.page).click()
      await pick(tab.page, '기본')
      seen['표지로 기본'] = await read()
      // 접힌 `…` 로 관리자 — 영역 표지의 목록과 주소가 따른다.
      await more.click()
      await pick(tab.page, '화면 상태: 관리자')
      seen['… 로 관리자'] = await read()
      expect({ seen, patches: tab.patches.length }).toEqual({
        seen: {
          열림: { inHead: 0, folded: ['화면 상태: 관리자'], badge: ['관리자'], canvas: ['n_out', 'n_bad', 'n_at'], search: '?state=s_admin' },
          '표지로 기본': { inHead: 0, folded: ['화면 상태: 기본'], badge: ['기본'], canvas: ['n_out', 'n_bad', 'n_dt'], search: '' },
          '… 로 관리자': { inHead: 0, folded: ['화면 상태: 관리자'], badge: ['관리자'], canvas: ['n_out', 'n_bad', 'n_at'], search: '?state=s_admin' },
        },
        patches: 0,
      })
    } finally {
      await tab.close()
    }
  })

  it('고른 노드 — 뷰 모드에서 영역 표지로 상태를 바꿔 고른 노드가 숨으면 고른 것에서 빠지고, 편집은 안 나간다', async () => {
    const { P } = await fixture('vs-read-pick')
    const tab = await openTab(P)
    const tree = tab.page.locator('.wb-shell-region[aria-label="구조 트리"]')
    const picked = () => tree.locator('[aria-current="true"], .wb-shell-structure-node-member').evaluateAll((els) => els.map((el) => el.closest('[data-tree-row]')?.getAttribute('data-tree-id') ?? ''))
    const panelEmpty = async () => (await tab.page.locator('.wb-shell-panel').first().textContent())?.includes('노드를 고르면 속성이 보입니다') ?? false
    try {
      await tree.locator('[data-tree-row][data-tree-id="n_dt"] .wb-shell-structure-node').click()
      await frames(tab.page)
      const before = { picked: await picked(), panelEmpty: await panelEmpty() }
      await tab.page.getByRole('button', { name: '뷰 모드', exact: true }).click()
      await badge(tab.page).waitFor()
      await badge(tab.page).click()
      await pick(tab.page, '관리자')
      const inView = { canvas: await canvasIds(tab.page), search: new URL(tab.page.url()).search }
      await tab.page.getByRole('button', { name: '편집 모드', exact: true }).click()
      await tree.waitFor()
      await frames(tab.page)
      expect({
        before,
        inView,
        after: { picked: await picked(), panelEmpty: await panelEmpty(), head: await switcher(tab.page).getAttribute('aria-label'), search: new URL(tab.page.url()).search },
        patches: tab.patches.length,
      }).toEqual({
        before: { picked: ['n_dt'], panelEmpty: false },
        inView: { canvas: ['n_out', 'n_bad', 'n_at'], search: '?state=s_admin' },
        // 편집 모드는 주소를 안 고친다(`shell/view-state-address.ts`) — 뷰 모드가 쓴 값이 남는다.
        after: { picked: [], panelEmpty: true, head: '화면 상태: 관리자', search: '?state=s_admin' },
        patches: 0,
      })
    } finally {
      await tab.close()
    }
  })

  it('붙이기 — 다른 페이지에서 온 영역의 없는 상태 가지를 빼고 출처의 이름으로 말한다', async () => {
    const { P, P2 } = await fixture('vs-read-paste')
    const tab = await openTab(P)
    try {
      // 첫 페이지에서 영역 안 노드를 골라 복사하지 않고, 영역째를 봉투로 싣는다 — 봉투는 출처 목록을 든다.
      const envelope = JSON.stringify({ wirebound: 'nodes', version: 1, nodes: [NODES.find((node) => node.type === 'StateSwitch')], viewStates: [ADMIN, GUEST] })
      await tab.page.goto(P2)
      await canvasFrame(tab.page).locator('[data-wb-id]').first().waitFor({ state: 'attached' })
      await tab.page.evaluate((text) => {
        const data = new DataTransfer()
        data.setData('text/plain', text)
        document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
      }, envelope)
      const notice = tab.page.getByRole('alert').filter({ hasText: '가지' })
      await notice.waitFor()
      await shot(tab.page, 'k3-paste-notice.png')
      expect(await notice.innerText()).toContain('상태 "관리자" 가지 1개를 뺐습니다.')
      await frames(tab.page)
      const ids = await canvasFrame(tab.page).locator('[data-wb-id]').evaluateAll((els) => els.map((el) => el.getAttribute('data-wb-id') ?? ''))
      // 기본 가지의 글만 붙었다(새 id) — 관리자 글은 없다.
      expect(await canvasFrame(tab.page).locator('body').innerText()).toContain('기본 글')
      expect(await canvasFrame(tab.page).locator('body').innerText()).not.toContain('관리자 글')
      expect(ids.length).toBe(2)
    } finally {
      await tab.close()
    }
  })
})
