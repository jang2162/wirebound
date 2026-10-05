/**
 * **화면 상태 편집을 실브라우저로 잰다**(설계서 「설계서 화면 구조」 «화면 상태» · `src/shell/use-view-state.ts` · `src/shell/view-state-switcher.tsx`).
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 전환 | 고른 상태의 가지가 캔버스 · 구조 트리에 안 선다 · 가지가 없는 상태에서 기본 가지가 안 선다 · «모든 가지 보기»가 가지를 다 안 편다 · 고르기가 편집을 낸다 |
 * | 페이지를 옮기면 | 옮겼다 돌아온 페이지가 앞서 고른 상태로 선다 |
 * | 창 900 | 접힌 머리의 `…` 항목으로 고르지 못한다 |
 * | 남이 상태를 지우면 | 지워진 상태를 고른 채 남아 캔버스가 아무 가지도 안 그리거나 머리가 지운 이름을 든다 |
 */
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
  {
    id: 'n_sw',
    type: 'StateSwitch',
    props: {},
    children: [
      { id: 'n_cd', type: 'StateCase', props: { state: 'default' }, children: [text('n_dt', '기본 글')] },
      { id: 'n_ca', type: 'StateCase', props: { state: ADMIN.id }, children: [text('n_at', '관리자 글')] },
    ],
  },
]

describe.skipIf(!전제.ok)('화면 상태 편집 — 실브라우저', () => {
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

  const call = (m: string, p: string, b?: unknown) => stack.request(alice, m, p, b)

  /** 프로젝트 · 메뉴 · 페이지 둘(둘째는 빈 페이지). 첫 페이지에 상태 둘과 영역을 싣는다. bob 은 editor. */
  async function fixture(slug: string): Promise<{ P: string; P2: string; pageId: string; page2Id: string }> {
    const project = (await call('POST', '/projects', { name: '화면 상태', slug: `${slug}-${Date.now().toString(36)}` })).body
    const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '가' })).body
    const member = await call('POST', `/projects/${project.id}/members`, { email: stack.users.bob.email, role: 'editor' })
    if (member.status >= 300) throw new Error(`member ${member.status}`)
    const pageId = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '첫째' })).body.id as string
    const page2Id = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '둘째' })).body.id as string
    const P = `/projects/${project.id}/pages/${pageId}`
    const seeded = await call('PATCH', `${P}/ops`, {
      baseSeq: 0,
      ops: [{ op: 'add', path: '/viewStates', value: [ADMIN, GUEST] }, ...NODES.map((value, at) => ({ op: 'add', path: `/root/children/${at}`, value }))],
    })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
    return { P, P2: `/projects/${project.id}/pages/${page2Id}`, pageId, page2Id }
  }

  async function openTab(P: string, viewport = { width: 1440, height: 900 }, user: 'alice' | 'bob' = 'alice') {
    const { context, page } = await stack.openTab(stack.users[user], { viewport })
    const patches: string[] = []
    page.on('websocket', (socket) => {
      socket.on('framesent', (frame) => {
        const payload = typeof frame.payload === 'string' ? frame.payload : frame.payload.toString()
        if (payload.includes('"type":"patch"')) patches.push(payload)
      })
    })
    await page.goto(P)
    await canvasFrame(page).locator('[data-wb-id]').first().waitFor()
    return { page, patches, close: () => context.close() }
  }

  const switcher = (page: Page) => page.getByRole('button', { name: /^화면 상태:/ })
  /** 두 프레임 — 고른 뒤의 다시 그리기가 화면에 닿는다. */
  const frames = (page: Page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  /**
   * 머리 전환기로 고른다 — 메뉴가 닫힌 것(고른 판이 섰다)만 기다리고 두 프레임 뒤에 돌아온다. 고른 값이 화면에 섰는지는 기다리지 않는다
   * (그 값을 단언한다 — 기다림에 넣으면 그 값을 깨는 변조가 시간 초과로 죽는다).
   */
  async function choose(page: Page, name: string): Promise<void> {
    await switcher(page).click()
    await page.getByRole('menuitemradio', { name, exact: true }).click()
    await page.locator('[role="menu"]').waitFor({ state: 'detached' })
    await frames(page)
  }
  /** 캔버스에 선 노드 id · 구조 트리 줄 id — 둘 다 문서 차례이고 뿌리(서버가 짓는 id · 맨 앞)는 뺀다. */
  async function shown(page: Page): Promise<{ canvas: string[]; tree: string[]; head: string }> {
    const canvas = await canvasFrame(page).locator('[data-wb-id]').evaluateAll((els) => els.map((el) => el.getAttribute('data-wb-id') ?? ''))
    const tree = await page.locator('.wb-shell-region[aria-label="구조 트리"] [data-tree-row]').evaluateAll((els) => els.map((el) => el.getAttribute('data-tree-id') ?? ''))
    const head = (await switcher(page).getAttribute('aria-label')) ?? ''
    return { canvas: canvas.slice(1), tree: tree.slice(1), head }
  }

  it('전환 — 캔버스 · 구조 트리가 고른 상태의 가지를 보이고, 가지가 없는 상태는 기본 가지 · «모든 가지 보기»는 다 편다 · 편집은 안 나간다', async () => {
    const { P } = await fixture('vs-switch')
    const tab = await openTab(P)
    try {
      const seen: Record<string, unknown> = {}
      seen['처음'] = await shown(tab.page)
      await choose(tab.page, '관리자')
      seen['관리자'] = await shown(tab.page)
      await choose(tab.page, '손님')
      seen['손님'] = await shown(tab.page)
      const all = tab.page.getByRole('button', { name: '모든 가지 보기', exact: true })
      await all.click()
      await frames(tab.page)
      seen['모든 가지'] = { pressed: await all.getAttribute('aria-pressed'), tree: (await shown(tab.page)).tree }
      expect(seen).toEqual({
        처음: { canvas: ['n_out', 'n_dt'], tree: ['n_out', 'n_sw', 'n_cd', 'n_dt'], head: '화면 상태: 기본' },
        관리자: { canvas: ['n_out', 'n_at'], tree: ['n_out', 'n_sw', 'n_ca', 'n_at'], head: '화면 상태: 관리자' },
        손님: { canvas: ['n_out', 'n_dt'], tree: ['n_out', 'n_sw', 'n_cd', 'n_dt'], head: '화면 상태: 손님' },
        '모든 가지': { pressed: 'true', tree: ['n_out', 'n_sw', 'n_cd', 'n_dt', 'n_ca', 'n_at'] },
      })
      expect(tab.patches).toEqual([])
    } finally {
      await tab.close()
    }
  })

  it('페이지를 옮겼다 돌아오면 기본이다', async () => {
    const { P, page2Id, pageId } = await fixture('vs-page')
    const tab = await openTab(P)
    try {
      await choose(tab.page, '관리자')
      // 페이지 줄의 줄 단추는 링크다 — 줄 상자의 첫 자식(`./action-menu-delete.test.ts` 와 같은 찾기).
      const menuRow = (id: string) => tab.page.locator(`.wb-shell-region[aria-label="메뉴·페이지 트리"] [data-tree-row][data-tree-id="${id}"] > :first-child`)
      await menuRow(page2Id).click()
      await tab.page.waitForURL(`**/pages/${page2Id}`)
      // 둘째 페이지(빈 페이지)가 캔버스에 선 뒤 — 첫 페이지의 노드가 걷혔다.
      await canvasFrame(tab.page).locator('[data-wb-id="n_out"]').waitFor({ state: 'detached' })
      const away = (await switcher(tab.page).getAttribute('aria-label')) ?? ''
      await menuRow(pageId).click()
      await canvasFrame(tab.page).locator('[data-wb-id="n_out"]').waitFor()
      await frames(tab.page)
      expect({ away, back: await shown(tab.page) }).toEqual({
        away: '화면 상태: 기본',
        back: { canvas: ['n_out', 'n_dt'], tree: ['n_out', 'n_sw', 'n_cd', 'n_dt'], head: '화면 상태: 기본' },
      })
    } finally {
      await tab.close()
    }
  })

  it('창 900 — 머리에 전환기가 없고 `…` 의 «화면 상태: 관리자»로 고른다', async () => {
    const { P } = await fixture('vs-tight')
    const tab = await openTab(P, { width: 900, height: 700 })
    try {
      const inHead = await switcher(tab.page).count()
      const menu = tab.page.locator('.wb-shell-header').getByRole('button', { name: '더 보기', exact: true })
      await menu.click()
      const radios = await tab.page.getByRole('menuitemradio').allTextContents()
      // 항목이 없으면 누르지 않고 값으로 죽는다(누르기를 기다리면 시간 초과로 죽는다).
      let checked: string[] = []
      if (radios.includes('화면 상태: 관리자')) {
        await tab.page.getByRole('menuitemradio', { name: '화면 상태: 관리자', exact: true }).click()
        await tab.page.locator('[role="menu"]').waitFor({ state: 'detached' })
        await frames(tab.page)
        await tab.page.waitForTimeout(600)
        await menu.click()
        checked = await tab.page.getByRole('menuitemradio', { checked: true }).allTextContents()
      }
      const canvas = (await canvasFrame(tab.page).locator('[data-wb-id]').evaluateAll((els) => els.map((el) => el.getAttribute('data-wb-id') ?? ''))).slice(1)
      expect({ inHead, radios, checked, canvas }).toEqual({
        inHead: 0,
        radios: ['화면 상태: 기본', '화면 상태: 관리자', '화면 상태: 손님'],
        checked: ['화면 상태: 관리자'],
        canvas: ['n_out', 'n_at'],
      })
    } finally {
      await tab.close()
    }
  })

  it('고른 상태를 남이 지우면 기본으로 선다 — 머리 · 캔버스 · 트리', async () => {
    const { P } = await fixture('vs-gone')
    const tab = await openTab(P)
    try {
      await choose(tab.page, '관리자')
      const before = await shown(tab.page)
      const head = (await stack.request(bob, 'GET', P)).body.headSeq as number
      // 상태 삭제는 가지째다(`removeViewStateOps` 의 꼴 — 가지 `remove` 뒤 목록 항목 `remove`).
      const removed = await stack.request(bob, 'PATCH', `${P}/ops`, {
        baseSeq: head,
        ops: [
          { op: 'remove', path: '/root/children/1/children/1' },
          { op: 'test', path: '/viewStates/0/id', value: ADMIN.id },
          { op: 'remove', path: '/viewStates/0' },
        ],
      })
      expect(removed.status).toBe(200)
      // 남의 편집이 닿은 것 — 지운 가지가 캔버스에서 걷혔다(재는 것은 그 뒤 선 가지와 머리다).
      await canvasFrame(tab.page).locator('[data-wb-id="n_at"]').waitFor({ state: 'detached' })
      await frames(tab.page)
      expect({ before, after: await shown(tab.page) }).toEqual({
        before: { canvas: ['n_out', 'n_at'], tree: ['n_out', 'n_sw', 'n_ca', 'n_at'], head: '화면 상태: 관리자' },
        after: { canvas: ['n_out', 'n_dt'], tree: ['n_out', 'n_sw', 'n_cd', 'n_dt'], head: '화면 상태: 기본' },
      })
    } finally {
      await tab.close()
    }
  })
})
