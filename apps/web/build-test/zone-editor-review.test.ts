/**
 * **구역 에디터 리뷰(RV-ZE — `docs/superpowers/plans/2026-10-23-rv-ze-report.md`)의 판을 실브라우저로 잠근다.** jsdom 은 키가 나간 뒤의 422 되싣기 ·
 * 두 연결의 겨룸 · 레이아웃 · 스크롤이 없다 — 판정의 순수 함수는 `test/edit/indent-fit.test.tsx` · `test/store/zone-rebase.test.ts` ·
 * `packages/renderer/test/zones-editor-options.test.tsx` 가 갖는다.
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | H1 들여쓰기 · 내어쓰기 | 받는 타입 · 설 자리를 넘는 내어쓰기가 편집으로 나간다 · 까닭이 다른 입구의 문장이 아니다 · WS 를 늦춘 판에서 막힌 내어쓰기 뒤 곧바로 넣은 정상 편집이 버려진다 |
 * | M1 거울 — 맵을 지움 | 남이 맵을 지운 사이 다른 구역에 낸 내 넣기(키 `add`)가 버려진다 · 화면 ≠ 서버 |
 * | L2 접힌 검색폼의 구역 줄 | 구역 줄을 골라도 캔버스가 그 폼을 안 펼친다 · 문서가 바뀐다 |
 * | L1 놓은 뒤 스크롤 | 긴 문서 가장자리에서 스크롤해 놓은 노드가 칸이 걷히며 화면에서 뛴다(구역 없는 대조군은 원래 0) |
 */
import { childLists, installCatalog, type WbNode } from '@wirebound/schema'
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  canvasFrame,
  dragLayoutSettled,
  editorStackPrerequisite,
  poll,
  shownDrops,
  startEditorStack,
  type EditorStack,
  type Session,
} from './editor-stack'

installCatalog()

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

const TREE = '.wb-shell-region[aria-label="구조 트리"]'

/**
 * ```
 * Page
 * ├ Card       n_card   — 몸통 [n_kv]
 * ├ Card       n_bare   — `zones` 맵이 없다 · 몸통 [n_bt]
 * ├ Tabs       n_tabs   — [n_tp1 [n_t1] · n_tp2 [n_t2]]
 * ├ SearchForm n_form   접힘 — 몸통 [n_f1] · 단추 [n_s1]
 * └ Text       n_text
 * ```
 */
const DOC: WbNode[] = [
  { id: 'n_card', type: 'Card', props: { title: '카드' }, children: [{ id: 'n_kv', type: 'Text', props: { content: '몸통 글' } }] },
  {
    id: 'n_bare',
    type: 'Card',
    props: { title: '맵 없음' },
    children: [{ id: 'n_bt', type: 'Text', props: { content: '맵 없는 카드 글' } }],
  },
  {
    id: 'n_tabs',
    type: 'Tabs',
    props: { active: 0 },
    children: [
      { id: 'n_tp1', type: 'TabPanel', props: { label: '기본' }, children: [{ id: 'n_t1', type: 'Text', props: { content: '첫 탭 글' } }] },
      {
        id: 'n_tp2',
        type: 'TabPanel',
        props: { label: '상세' },
        children: [{ id: 'n_t2', type: 'Text', props: { content: '둘째 탭 글' } }],
      },
    ],
  },
  {
    id: 'n_form',
    type: 'SearchForm',
    props: { collapsed: true },
    children: [{ id: 'n_f1', type: 'Field', props: { label: '이름' } }],
    zones: { actions: [{ id: 'n_s1', type: 'Button', props: { label: '검색' } }] },
  },
  { id: 'n_text', type: 'Text', props: { content: '끝' } },
]

interface Tab {
  page: Page
  patches: string[]
  received: string[]
  close: () => Promise<void>
}

/** 고정 시드 — 판이 늘 같다. */
function seeded(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff
    return state / 0x7fffffff
  }
}

describe.skipIf(!전제.ok)('구역 에디터 리뷰 — 실브라우저', () => {
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
    const { after } = await stack.close()
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  })

  const call = (m: string, p: string, b?: unknown) => stack.request(alice, m, p, b)

  async function fixture(slug: string, nodes: WbNode[] = DOC): Promise<string> {
    const project = (await call('POST', '/projects', { name: '구역', slug: `${slug}-${Date.now().toString(36)}` })).body
    const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '가' })).body
    const member = await call('POST', `/projects/${project.id}/members`, { email: stack.users.bob.email, role: 'editor' })
    if (member.status >= 300) throw new Error(`member ${member.status}`)
    const pageId = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '쪽' })).body.id
    const P = `/projects/${project.id}/pages/${pageId}`
    const seededOps = await call('PATCH', `${P}/ops`, {
      baseSeq: 0,
      ops: nodes.map((value, at) => ({ op: 'add', path: `/root/children/${at}`, value })),
    })
    if (seededOps.status >= 300) throw new Error(`seed ${seededOps.status} ${JSON.stringify(seededOps.body)}`)
    return P
  }

  async function server(P: string): Promise<{ root: WbNode; headSeq: number }> {
    const body = (await call('GET', P)).body
    return { root: body.schema.root as WbNode, headSeq: body.headSeq as number }
  }

  function find(node: WbNode, id: string): WbNode | undefined {
    if (node.id === id) return node
    for (const { list } of childLists(node))
      for (const child of list) {
        const hit = find(child, id)
        if (hit !== undefined) return hit
      }
    return undefined
  }

  /** 서버 문서를 구조 트리 줄 차례로(`src/panels/structure-tree.tsx` 의 `rowLists` 와 같은 규칙). */
  function treeOrder(root: WbNode): string[] {
    const out: string[] = []
    const walk = (node: WbNode): void => {
      out.push(node.id)
      const lists = childLists(node)
      const zoned = lists.some((entry) => entry.pointer !== '/children')
      for (const entry of lists) {
        if (zoned) out.push(`zone:${node.id}:${entry.zone}`)
        for (const child of entry.list) walk(child)
      }
    }
    walk(root)
    return out
  }

  async function screenOrder(page: Page): Promise<string[]> {
    return page.evaluate((tree) => {
      const region = document.querySelector(tree)
      if (region === null) return []
      return Array.from(region.querySelectorAll('[data-tree-row], [data-tree-zone-row]')).map((el) =>
        el.hasAttribute('data-tree-zone-row')
          ? `zone:${el.getAttribute('data-tree-zone-parent')}:${el.getAttribute('data-tree-zone-name')}`
          : (el.getAttribute('data-tree-id') ?? '?'),
      )
    }, TREE)
  }

  async function openTab(
    P: string,
    user: 'alice' | 'bob' = 'alice',
    options: { origin?: string; viewport?: { width: number; height: number } } = {},
  ): Promise<Tab> {
    const { context, page } = await stack.openTab(stack.users[user], {
      viewport: options.viewport ?? { width: 1920, height: 1100 },
      ...(options.origin === undefined ? {} : { origin: options.origin }),
    })
    const patches: string[] = []
    const received: string[] = []
    page.on('websocket', (socket) => {
      socket.on('framesent', (frame) => {
        const payload = typeof frame.payload === 'string' ? frame.payload : frame.payload.toString()
        if (payload.includes('"type":"patch"')) patches.push(payload)
      })
      socket.on('framereceived', (frame) => {
        const kind = /"type":"([a-z-]+)"/.exec(String(frame.payload))?.[1]
        if (kind !== undefined) received.push(kind)
      })
    })
    await page.goto(P)
    await canvasFrame(page).locator('[data-wb-id="n_text"]').waitFor()
    return { page, patches, received, close: () => context.close() }
  }

  const treeRow = (page: Page, id: string) => page.locator(`${TREE} [data-tree-row][data-tree-id="${id}"]`)
  const selectRow = (page: Page, id: string) => treeRow(page, id).locator('button').first().click()
  const zoneRow = (page: Page, parentId: string, zone: string) =>
    page.locator(`${TREE} [data-tree-zone-row][data-tree-zone-parent="${parentId}"][data-tree-zone-name="${zone}"]`)

  async function openPalette(page: Page): Promise<void> {
    if ((await page.getByRole('region', { name: '컴포넌트 목록' }).count()) > 0) return
    await page.getByRole('contentinfo', { name: '하단 바' }).getByRole('button', { name: '컴포넌트', exact: true }).click()
    await page.getByRole('region', { name: '컴포넌트 목록' }).waitFor()
  }

  async function showOnly(page: Page, type: string): Promise<void> {
    await openPalette(page)
    await page.getByRole('searchbox', { name: '컴포넌트 찾기' }).fill(type)
    await page.locator(`[data-wb-palette-card="${type}"]`).waitFor()
  }

  /** `done` 이 서거나 `ms` 가 지날 때까지 읽고 마지막 값을 돌려준다 — 안 던진다(단언할 값을 끝 조건으로 기다리는 자리 — `zone-editor.test.ts` 의 `settle`). */
  async function settle<T>(read: () => Promise<T>, done: (value: T) => boolean, ms = 3000): Promise<T> {
    const until = Date.now() + ms
    let last = await read()
    while (!done(last) && Date.now() < until) {
      await new Promise((resolve) => setTimeout(resolve, 100))
      last = await read()
    }
    return last
  }

  const infoNotices = (page: Page) => page.locator('.wb-shell-info-notice').allTextContents()
  const alerts = (page: Page) => page.locator('.wb-shell-edit-alert').allTextContents()

  it('H1 — 받는 타입 · 설 자리를 넘는 내어쓰기 · 들여쓰기는 편집 없이 다른 입구와 같은 까닭을 말한다 · WS 를 늦춘 판에서 그 뒤에 곧바로 넣은 편집이 산다', async () => {
    const P = await fixture('indent')
    const delay = await stack.startWsDelay(2000)
    const tab = await openTab(P, 'alice', { origin: delay.origin })
    try {
      await poll(
        '룸에 들었다',
        async () => tab.received.slice(),
        (kinds) => kinds.includes('joined'),
        12000,
      )
      await openPalette(tab.page)
      await showOnly(tab.page, 'Divider')
      // 탭 패널 안 글의 내어쓰기 — 탭 몸통(탭 패널만 받는다).
      await selectRow(tab.page, 'n_t1')
      await tab.page.keyboard.press('Alt+Shift+ArrowLeft')
      // 짧게만 기다린다 — 고치기 전 판은 내어쓰기가 나가 2s 뒤에 422 를 받는다. 그 전에 다음 편집을 줄 세워야 «뒤에 줄 선 편집도 버린다» 판이 선다.
      const outdentNotice = await settle(
        () => infoNotices(tab.page),
        (list) => list.length > 0,
        300,
      )
      // 곧바로 — 올림이 늦는 사이 — 맵 없는 카드 바닥 구역에 구분선을 넣는다.
      await zoneRow(tab.page, 'n_bare', 'footer').click()
      await tab.page.locator('[data-wb-palette-card="Divider"] .wb-shell-palette-add').click()
      const footer = await settle(
        async () => (find((await server(P)).root, 'n_bare')?.zones?.footer ?? []).map((node) => node.type),
        (types) => types.length > 0,
        8000,
      )
      // 탭 패널의 들여쓰기 — 앞 탭 패널 몸통(탭 패널은 탭 안에만 선다).
      await selectRow(tab.page, 'n_tp2')
      await tab.page.keyboard.press('Alt+Shift+ArrowRight')
      const indentNotice = await settle(
        () => infoNotices(tab.page),
        (list) => list.some((text) => text.includes('탭 안에만')),
        1500,
      )
      await tab.page.waitForTimeout(1500)
      const root = (await server(P)).root
      expect({
        outdentNotice,
        indentNotice,
        footer,
        moves: tab.patches.filter((payload) => payload.includes('"op":"move"')).length,
        errors: tab.received.filter((kind) => kind === 'patch-error').length,
        alerts: await alerts(tab.page),
        tabs: [find(root, 'n_tp1')?.children?.map((node) => node.id), find(root, 'n_tabs')?.children?.map((node) => node.id)],
      }).toEqual({
        outdentNotice: ['탭에는 탭 패널만 놓을 수 있습니다'],
        indentNotice: ['탭 패널은 탭 안에만 놓을 수 있습니다'],
        footer: ['Divider'],
        moves: 0,
        errors: 0,
        alerts: [],
        tabs: [['n_t1'], ['n_tp1', 'n_tp2']],
      })
    } finally {
      await tab.close()
      await delay.close()
    }
  })

  it('M1 거울 — 남이 맵을 만든 넣기를 되돌리는 사이 내가 그 맵의 다른 구역에 넣으면 맵째로 되살아 선다 · 통지 없음 · 화면 = 서버', async () => {
    const P = await fixture('map-gone')
    // 밥이 먼저 맵 없는 카드에 맵을 만든다(머리 오른쪽 첫 노드).
    const made = await stack.request(bob, 'PATCH', `${P}/ops`, {
      baseSeq: (await server(P)).headSeq,
      ops: [{ op: 'add', path: '/root/children/1/zones', value: { headEnd: [{ id: 'n_bob', type: 'Button', props: { label: '밥' } }] } }],
    })
    const delay = await stack.startDownDelay(1800)
    const tab = await openTab(P, 'alice', { origin: delay.origin })
    try {
      // 룸에 든 뒤에 누른다 — 그 전의 편집은 실시간 채널이 없어 REST 로 나가 다른 판(409 되싣기)이 된다.
      await poll(
        '앨리스가 룸에 들었다',
        async () => tab.received.slice(),
        (kinds) => kinds.includes('joined'),
        12000,
      )
      await poll(
        '앨리스가 밥의 맵을 받았다',
        () => canvasFrame(tab.page).locator('[data-wb-id="n_bob"]').count(),
        (n) => n === 1,
        12000,
      )
      await showOnly(tab.page, 'Divider')
      await zoneRow(tab.page, 'n_bare', 'footer').click()
      // 밥이 맵을 만든 넣기를 되돌린다 — 앨리스는 그 프레임을 1.8s 늦게 받는다.
      const removed = await stack.request(bob, 'PATCH', `${P}/ops`, {
        baseSeq: (await server(P)).headSeq,
        ops: [{ op: 'remove', path: '/root/children/1/zones' }],
      })
      await tab.page.locator('[data-wb-palette-card="Divider"] .wb-shell-palette-add').click()
      const kinds = await settle(
        async () => tab.received.filter((kind) => kind === 'patch-error' || kind === 'patch-ack'),
        (list) => list.includes('patch-ack'),
        15000,
      )
      const zones = await settle(
        async () => find((await server(P)).root, 'n_bare')?.zones ?? null,
        (value) => value !== null,
        5000,
      )
      const root = (await server(P)).root
      const expected = treeOrder(root)
      const screen = await settle(
        () => screenOrder(tab.page),
        (order) => order.slice(1).join() === expected.slice(1).join(),
        8000,
      )
      expect({
        made: made.status,
        removed: removed.status,
        // 판 카나리아 — 첫 편집은 키 `add`(맵이 있던 화면에서 냈다)다.
        first: tab.patches[0]?.includes('"path":"/root/children/1/zones/footer"') ?? false,
        kinds,
        zones:
          zones === null ? null : Object.fromEntries(Object.entries(zones).map(([name, list]) => [name, list.map((node) => node.type)])),
        alerts: await alerts(tab.page),
        screen: screen.slice(1),
      }).toEqual({
        made: 200,
        removed: 200,
        first: true,
        kinds: ['patch-error', 'patch-ack'],
        zones: { footer: ['Divider'] },
        alerts: [],
        screen: expected.slice(1),
      })
    } finally {
      await tab.close()
      await delay.close()
    }
  })

  it('L2 — 접힌 검색폼 자신의 구역 줄을 고르면 캔버스가 그 폼을 펼친다 · 문서는 그대로 · 다른 것을 고르면 접힌 화면', async () => {
    const P = await fixture('reveal-zone')
    const tab = await openTab(P)
    try {
      const frame = canvasFrame(tab.page)
      const count = async () => [await frame.locator('[data-wb-id="n_s1"]').count(), await frame.locator('[data-wb-id="n_f1"]').count()]
      const before = await count()
      await zoneRow(tab.page, 'n_form', 'actions').click()
      const shown = await settle(count, ([s1]) => s1 === 1)
      await selectRow(tab.page, 'n_text')
      const folded = await settle(count, ([s1]) => s1 === 0)
      expect({ before, shown, folded, props: find((await server(P)).root, 'n_form')?.props, sent: tab.patches.length }).toEqual({
        before: [0, 0],
        shown: [1, 1],
        folded: [0, 0],
        props: { collapsed: true },
        sent: 0,
      })
    } finally {
      await tab.close()
    }
  })

  /**
   * 긴 문서(글 14 · 카드 또는 섹션 14 를 번갈아 · 끝 글) · 창 1500 × 720. 하단 판 단추 카드를 잡고 칸 밀림 뒤 캔버스 칸 아래(넷 중 하나는 위) 끝 띠로 가
   * 머물러 스크롤시키고, 안으로 한 걸음 들어와 놓는다. 손 떼기 직전 미리보기의 화면 위 끝과 놓은 뒤 150ms 의 새 노드 위 끝을 견준다(리뷰 RV-ZE L1 —
   * 리뷰는 같은 판 60 에서 카드 문서 20 · 대조군 0 의 `scrollTop` 변화를 쟀다).
   */
  async function edgeDrops(withCards: boolean, trials: number) {
    const nodes: WbNode[] = []
    for (let i = 0; i < 14; i += 1) {
      nodes.push({ id: `n_fill${i}`, type: 'Text', props: { content: `채움 글 ${i}` } })
      nodes.push(
        withCards
          ? {
              id: `n_c${i}`,
              type: 'Card',
              props: { title: `카드 ${i}` },
              children: [{ id: `n_ct${i}`, type: 'Text', props: { content: `몸통 ${i}` } }],
            }
          : { id: `n_c${i}`, type: 'Section', props: {}, children: [{ id: `n_ct${i}`, type: 'Text', props: { content: `몸통 ${i}` } }] },
      )
    }
    nodes.push({ id: 'n_text', type: 'Text', props: { content: '끝' } })
    const P = await fixture(withCards ? 'edge-cards' : 'edge-sections', nodes)
    const tab = await openTab(P, 'alice', { viewport: { width: 1500, height: 720 } })
    const rand = seeded(withCards ? 4242 : 4243)
    const pane = tab.page.locator('.wb-shell-canvas')
    const scrollTop = () => pane.evaluate((el) => el.scrollTop)
    /** 캔버스 문서의 노드 id 와 그 위 끝(호스트 창 좌표). */
    const nodeTops = () =>
      tab.page.evaluate(() => {
        const iframe = document.querySelector('iframe.wb-shell-canvas-iframe') as HTMLIFrameElement
        const f = iframe.getBoundingClientRect()
        const zoom = f.height / iframe.offsetHeight
        const out: Record<string, number> = {}
        for (const el of Array.from(iframe.contentDocument!.querySelectorAll('[data-wb-id]'))) {
          const id = el.getAttribute('data-wb-id') ?? ''
          if (id !== '' && !id.startsWith('wb:preview:')) out[id] = f.y + el.getBoundingClientRect().top * zoom
        }
        return out
      })
    const rows: { scrolled: boolean; shift: number | null; scroll: number }[] = []
    try {
      await showOnly(tab.page, 'Button')
      for (let t = 0; t < trials; t += 1) {
        await pane.evaluate((el) => (el.scrollTop = 0))
        const card = (await tab.page.locator('[data-wb-palette-card="Button"]').boundingBox())!
        const at = { x: card.x + card.width / 2, y: card.y + card.height / 2 }
        await tab.page.mouse.move(at.x, at.y)
        await tab.page.mouse.down()
        await tab.page.mouse.move(at.x + 3, at.y - 6, { steps: 3 })
        await dragLayoutSettled(tab.page)
        const box = (await pane.boundingBox())!
        const down = t % 4 !== 3
        const x = box.x + 60 + (box.width - 300) * rand()
        if (!down) await pane.evaluate((el) => (el.scrollTop = el.scrollHeight))
        await tab.page.mouse.move(x, down ? box.y + box.height - 8 : box.y + 8, { steps: 8 })
        const s0 = await scrollTop()
        await tab.page.waitForTimeout(400 + Math.floor(rand() * 900))
        await tab.page.mouse.move(x, down ? box.y + box.height - 40 - rand() * 60 : box.y + 40 + rand() * 60, { steps: 4 })
        await tab.page.waitForTimeout(250)
        const s1 = await scrollTop()
        const preview = (await shownDrops(tab.page)).find((drop) => drop.kind === 'preview') ?? null
        const ids = new Set(Object.keys(await nodeTops()))
        await tab.page.mouse.up()
        await tab.page.waitForTimeout(150)
        const s3 = await scrollTop()
        const tops = await nodeTops()
        const fresh = Object.keys(tops).find((id) => !ids.has(id)) ?? null
        rows.push({
          scrolled: s1 !== s0,
          shift: preview === null || fresh === null ? null : Math.round(tops[fresh]! - preview.rect.y),
          scroll: Math.round(s3 - s1),
        })
        await tab.page.waitForTimeout(150)
      }
      return rows
    } finally {
      await tab.close()
    }
  }

  it('L1 — 긴 문서 가장자리에서 스크롤해 놓은 노드는 칸이 걷혀도 보인 자리에 선다(구역 없는 대조군과 같다)', async () => {
    const cards = await edgeDrops(true, 16)
    const sections = await edgeDrops(false, 8)
    const summary = (rows: typeof cards) => ({
      trials: rows.length,
      scrolled: rows.filter((row) => row.scrolled).length,
      landed: rows.filter((row) => row.shift !== null).length,
      jumped: rows.filter((row) => row.shift !== null && Math.abs(row.shift) > 2).length,
    })
    // eslint-disable-next-line no-console
    console.log(`[L1 놓은 뒤 자리] ${JSON.stringify({ cards, sections })}`)
    const c = summary(cards)
    const s = summary(sections)
    // 카나리아 — 판이 섰다: 가장자리에서 스크롤했고 · 미리보기 자리에 노드가 섰다.
    expect({ scrolled: c.scrolled >= 12, landed: c.landed >= 12, sScrolled: s.scrolled >= 6, sLanded: s.landed >= 6 }).toEqual({
      scrolled: true,
      landed: true,
      sScrolled: true,
      sLanded: true,
    })
    expect({ cards: c.jumped, sections: s.jumped }).toEqual({ cards: 0, sections: 0 })
  })
})
