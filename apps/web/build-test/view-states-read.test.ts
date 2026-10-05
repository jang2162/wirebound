/**
 * **화면 상태 읽기를 실브라우저로 잰다**(설계서 「설계서 화면 구조」 «화면 상태» · `src/shell/view-state-address.ts` · `src/canvas/state-badges.tsx`).
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | viewer 가 `?state=` 주소로 연다 | 주소의 상태로 안 선다 · 없는 id 가 기본으로 안 간다 |
 * | 영역 표지 | 뷰 모드에서 영역에 안 선다 · 영역의 왼쪽 위에 안 붙는다 · 가지 목록이 그 영역의 가지가 아니다 · 고른 상태가 캔버스 · 머리 · 주소에 안 간다 |
 * | 붙이기 통지 | 다른 페이지에서 온 영역의 없는 상태 가지를 안 빼거나 출처의 이름으로 안 말한다 |
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

  async function openTab(path: string, user: 'alice' | 'bob' = 'alice') {
    const { context, page } = await stack.openTab(stack.users[user], { viewport: VIEWPORT })
    await page.goto(path)
    await canvasFrame(page).locator('[data-wb-id]').first().waitFor({ state: 'attached' })
    return { page, close: () => context.close() }
  }

  const switcher = (page: Page) => page.getByRole('button', { name: /^화면 상태:/ })
  const badge = (page: Page) => page.getByRole('button', { name: /^상태에 따라 다름/ })
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
      // viewer 는 뷰 모드다 — 기본으로 서며 없는 id 의 질의를 걷는다.
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
