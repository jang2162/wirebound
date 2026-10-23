/**
 * **구역 에디터(설계 spec `2026-10-23-node-slots-design.md` 「8. 구현을 나누는 법」 B)를 실브라우저로 잰다** — 빈 구역 칸(Q2) · 구역에 놓기 · 구역 사이
 * 끌기 · 구역 안 축 · 받는 타입 제약의 이유 · 구조 트리의 구역 줄(넣을 자리) · 펼쳐 보이기(Q3) · viewer · 두 사람. jsdom 은 레이아웃 · 포인터 캡처 ·
 * `elementFromPoint` 가 없다 — 판정의 순수 함수는 `test/edit/zone-insert.test.ts` · `test/canvas/empty-zones.test.tsx` 가 갖는다.
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 끄는 동안만 칸이 선다 · 칸에 놓기 | 끌기 전 · 뒤에 칸이 있다 · 끄는 동안 받을 수 있는 빈 구역에 칸이 없다 · 놓은 노드가 그 구역에 없다 |
 * | 구역 사이 끌기 | 손잡이로 끈 단추가 빈 바닥에 안 선다 · 편집이 `move` 하나가 아니다 |
 * | 구역 안의 축 | 검색폼 단추줄 단추 앞의 미리보기가 가로 축 · 그 구역 · 그 단추 앞이 아니다 |
 * | 받는 타입 제약의 이유 | 탭에 단추 · 탭 밖에 탭 패널에서 이유가 포인터 곁에 안 서거나 미리보기가 선다 · 놓으면 편집이 나간다 |
 * | 구역 줄 — 넣기 · 붙여넣기 · 트리 놓기 | 구역 줄을 고른 뒤 «넣기» · Cmd+V 가 그 구역 끝이 아니다 · 트리의 구역 줄에 놓은 노드가 그 구역에 없다 |
 * | 펼쳐 보이기 | 고른 노드(지금 탭이 아닌 패널 안 · 접힌 검색폼 안)가 캔버스에 안 선다 · 문서(`active` · `collapsed`)가 바뀐다 · 남의 화면이 바뀐다 |
 * | viewer | 구역 줄을 못 고른다 · 넣는 입구가 선다 · 편집이 나간다 |
 * | 두 사람 — 다른 빈 구역의 첫 넣기(리뷰 RV-NS 발견 3) | 뒤에 닿은 쪽이 버려진다 · 화면 ≠ 서버 |
 * | 두 사람 — 끄는 동안 남이 그 구역을 채움 | 놓은 노드가 그 구역 밖에 선다 · 화면 ≠ 서버 |
 */
import { childLists, installCatalog, type WbNode } from '@wirebound/schema'
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canvasFrame, editorStackPrerequisite, poll, shownDrops, startEditorStack, type EditorStack, type Session } from './editor-stack'

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
 * ├ Card       n_card   '카드'     — 머리 오른쪽 [n_edit '수정'] · 몸통 [n_kv] · 제목 옆 · 바닥 비어 있음
 * ├ Card       n_bare   '맵 없음'  — `zones` 맵이 없다 · 몸통 [n_bt]
 * ├ Tabs       n_tabs   active 0  — [n_tp1 '기본' [n_t1] · n_tp2 '상세' [n_t2]]
 * ├ SearchForm n_form   접힘       — 몸통 [n_f1] · 단추 [n_s1]
 * ├ SearchForm n_form2  펴짐       — 몸통 [n_f2] · 단추 [n_u1 '초기화' · n_u2 '검색']
 * └ Text       n_text   '끝'
 * ```
 */
const DOC: WbNode[] = [
  {
    id: 'n_card',
    type: 'Card',
    props: { title: '카드' },
    children: [{ id: 'n_kv', type: 'Text', props: { content: '몸통 글' } }],
    zones: { headEnd: [{ id: 'n_edit', type: 'Button', props: { label: '수정' } }] },
  },
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
  {
    id: 'n_form2',
    type: 'SearchForm',
    children: [{ id: 'n_f2', type: 'Field', props: { label: '기간' } }],
    zones: {
      actions: [
        { id: 'n_u1', type: 'Button', props: { label: '초기화' } },
        { id: 'n_u2', type: 'Button', props: { label: '검색' } },
      ],
    },
  },
  { id: 'n_text', type: 'Text', props: { content: '끝' } },
]

interface Tab {
  page: Page
  patches: string[]
  received: string[]
  close: () => Promise<void>
}

describe.skipIf(!전제.ok)('구역 에디터 — 실브라우저', () => {
  let stack: EditorStack
  let alice: Session

  beforeAll(async () => {
    if (!전제.ok) return
    stack = await startEditorStack(전제)
    alice = await stack.login(stack.users.alice)
  })

  afterAll(async () => {
    if (stack === undefined) return
    const { after } = await stack.close()
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  })

  const call = (m: string, p: string, b?: unknown) => stack.request(alice, m, p, b)

  async function fixture(slug: string, bobRole: 'editor' | 'viewer' = 'editor'): Promise<string> {
    const project = (await call('POST', '/projects', { name: '구역', slug: `${slug}-${Date.now().toString(36)}` })).body
    const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '가' })).body
    const member = await call('POST', `/projects/${project.id}/members`, { email: stack.users.bob.email, role: bobRole })
    if (member.status >= 300) throw new Error(`member ${member.status}`)
    const pageId = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '쪽' })).body.id
    const P = `/projects/${project.id}/pages/${pageId}`
    const seeded = await call('PATCH', `${P}/ops`, {
      baseSeq: 0,
      ops: DOC.map((value, at) => ({ op: 'add', path: `/root/children/${at}`, value })),
    })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
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

  async function zoneIds(P: string, parentId: string, zone: string): Promise<string[]> {
    const node = find((await server(P)).root, parentId)
    const list = zone === 'body' ? node?.children : node?.zones?.[zone]
    return (list ?? []).map((child) => child.id)
  }

  /** 서버 문서를 구조 트리 줄 차례로(`src/panels/structure-tree.tsx` 의 `rowLists` 와 같은 규칙) — 노드는 id, 구역 줄은 `zone:부모:이름`. */
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

  /** 화면의 구조 트리 줄 차례 — 뿌리 id 는 서버가 지으니 그대로 읽는다. */
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

  async function openTab(P: string, user: 'alice' | 'bob' = 'alice', origin?: string): Promise<Tab> {
    const { context, page } = await stack.openTab(stack.users[user], {
      // 창 1920 — 칸이 1280 프리셋 문서보다 넓어 머리 오른쪽(카드 오른끝)이 칸 안에 선다(1440 이면 칸 860 에 가로로 밀려 손잡이가 창 밖이다).
      viewport: { width: 1920, height: 1100 },
      ...(origin === undefined ? {} : { origin }),
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
  const handle = (page: Page) => page.locator('.wb-shell-canvas-handle')

  /** 캔버스의 빈 구역 칸 — `부모:구역`(정렬). */
  async function slots(page: Page): Promise<string[]> {
    const handleEl = await page.$('iframe.wb-shell-canvas-iframe')
    const frame = await handleEl!.contentFrame()
    const list = (await frame!.evaluate(() =>
      Array.from(document.querySelectorAll('[data-wb-empty-zone]')).map(
        (el) => `${el.getAttribute('data-wb-empty-zone-of')}:${el.getAttribute('data-wb-empty-zone')}`,
      ),
    )) as string[]
    return list.sort()
  }

  async function boxOf(page: Page, selector: string): Promise<{ x: number; y: number; width: number; height: number }> {
    const box = await canvasFrame(page).locator(selector).first().boundingBox()
    if (box === null) throw new Error(`캔버스에 ${selector} 상자가 없다`)
    return box
  }
  const center = (box: { x: number; y: number; width: number; height: number }) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 })
  const slotSelector = (parentId: string, zone: string) => `[data-wb-empty-zone="${zone}"][data-wb-empty-zone-of="${parentId}"]`

  /** 하단 판을 연다 — 새 컨텍스트는 판이 접힌 채 선다(`build-test/palette.test.ts` 의 `openPalette`). */
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

  async function grabCard(page: Page, type: string): Promise<void> {
    await showOnly(page, type)
    const box = (await page.locator(`[data-wb-palette-card="${type}"]`).boundingBox())!
    const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    await page.mouse.move(at.x, at.y)
    await page.mouse.down()
    await page.mouse.move(at.x + 3, at.y - 6, { steps: 3 })
  }

  async function grabHandle(page: Page): Promise<void> {
    await handle(page).waitFor()
    const box = (await handle(page).boundingBox())!
    const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    await page.mouse.move(at.x, at.y)
    await page.mouse.down()
    await page.mouse.move(at.x + 3, at.y + 6, { steps: 3 })
  }

  const moveTo = (page: Page, at: { x: number; y: number }) => page.mouse.move(at.x, at.y, { steps: 8 })

  /**
   * 빈 구역 칸으로 간다 — 가는 길의 미리보기가 배치를 밀어 칸이 옮겨 가므로 칸을 다시 재며 그 구역에 미리보기가 설 때까지 다가간다(다섯 번까지).
   * 선 미리보기의 구역을 돌려준다.
   */
  async function aimAtSlot(page: Page, parentId: string, zone: string): Promise<string | null> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await moveTo(page, center(await boxOf(page, slotSelector(parentId, zone))))
      await page.waitForTimeout(120)
      const drops = await shownDrops(page)
      const preview = drops.find((drop) => drop.kind === 'preview')
      if (preview?.parent === parentId && (await previewZone(page)) === zone) return zone
    }
    return previewZone(page)
  }

  /** 끼운 미리보기가 선 구역 — 미리보기 뿌리의 가장 가까운 `[data-wb-zone]`(없으면 `null` — 몸통). */
  async function previewZone(page: Page): Promise<string | null> {
    const handleEl = await page.$('iframe.wb-shell-canvas-iframe')
    const frame = await handleEl!.contentFrame()
    return (await frame!.evaluate(() => {
      const preview = Array.from(document.querySelectorAll('[data-wb-id]')).find((el) =>
        (el.getAttribute('data-wb-id') ?? '').startsWith('wb:preview:'),
      )
      return preview?.parentElement?.closest('[data-wb-zone]')?.getAttribute('data-wb-zone') ?? null
    })) as string | null
  }

  const refusal = (page: Page) => page.locator('.wb-shell-drop-refusal')

  it('빈 구역 칸은 끄는 동안만 선다 — 하단 판의 단추를 바닥 칸에 놓으면 그 구역에 들고 칸이 걷힌다', async () => {
    const P = await fixture('slots')
    const tab = await openTab(P)
    try {
      const before = await slots(tab.page)
      await grabCard(tab.page, 'Button')
      await moveTo(tab.page, center(await boxOf(tab.page, '[data-wb-id="n_text"]')))
      const during = await poll(
        '칸이 선다',
        () => slots(tab.page),
        (list) => list.length > 0,
      )
      const zone = await aimAtSlot(tab.page, 'n_card', 'footer')
      const shown = await shownDrops(tab.page)
      await tab.page.mouse.up()
      const landed = await poll(
        '서버의 바닥',
        () => zoneIds(P, 'n_card', 'footer'),
        (ids) => ids.length === 1,
      )
      const after = await poll(
        '칸이 걷힌다',
        () => slots(tab.page),
        (list) => list.length === 0,
      )
      const node = find((await server(P)).root, landed[0]!)
      expect({
        before,
        during,
        preview: shown.filter((drop) => drop.kind === 'preview').map((drop) => [drop.placement, drop.parent]),
        zone,
        landed: node?.type,
        after,
      }).toEqual({
        before: [],
        // 접힌 검색폼(`n_form`)의 구역은 뷰가 안 그려 칸도 없다. 든 구역(머리 오른쪽 · 단추줄)은 칸이 없다.
        during: ['n_bare:footer', 'n_bare:headEnd', 'n_bare:titleSide', 'n_card:footer', 'n_card:titleSide'],
        preview: [['inside', 'n_card']],
        zone: 'footer',
        landed: 'Button',
        after: [],
      })
    } finally {
      await tab.close()
    }
  })

  it('구역 사이 끌기 — 머리 오른쪽 단추를 손잡이로 빈 바닥 칸에 놓으면 `move` 하나로 그 구역에 선다', async () => {
    const P = await fixture('across')
    const tab = await openTab(P)
    try {
      await selectRow(tab.page, 'n_edit')
      await grabHandle(tab.page)
      const aimed = await aimAtSlot(tab.page, 'n_card', 'footer')
      const sentBefore = tab.patches.length
      await tab.page.mouse.up()
      const footer = await poll(
        '서버의 바닥',
        () => zoneIds(P, 'n_card', 'footer'),
        (ids) => ids.length === 1,
      )
      const head = await zoneIds(P, 'n_card', 'headEnd')
      const sent = tab.patches
        .slice(sentBefore)
        .map((frame) => (JSON.parse(frame) as { ops: { op: string; from?: string; path: string }[] }).ops)
      expect({ aimed, footer, head, sent }).toEqual({
        aimed: 'footer',
        footer: ['n_edit'],
        head: [],
        // 편집 하나(프레임 하나) — 바닥 배열이 없어 빈 배열을 먼저 놓고 옮긴다(`edit/ops.ts` 의 `moveNodeOps` 머리말).
        sent: [
          [
            { op: 'add', path: '/root/children/0/zones/footer', value: [] },
            { op: 'move', from: '/root/children/0/zones/headEnd/0', path: '/root/children/0/zones/footer/0' },
          ],
        ],
      })
    } finally {
      await tab.close()
    }
  })

  it('구역 안의 축 — 검색폼 단추줄의 단추 앞에 놓는 미리보기는 가로 축 · 그 구역 · 그 단추 앞이다', async () => {
    const P = await fixture('axis')
    const tab = await openTab(P)
    try {
      await grabCard(tab.page, 'Button')
      const target = await boxOf(tab.page, '[data-wb-id="n_u2"]')
      await moveTo(tab.page, { x: target.x + target.width * 0.1, y: target.y + target.height / 2 })
      const drops = await poll(
        '미리보기',
        () => shownDrops(tab.page),
        (list) => list.some((drop) => drop.kind === 'preview'),
      )
      const zone = await previewZone(tab.page)
      await tab.page.mouse.up()
      const actions = await poll(
        '서버의 단추줄',
        () => zoneIds(P, 'n_form2', 'actions'),
        (ids) => ids.length === 3,
      )
      const preview = drops.find((drop) => drop.kind === 'preview')!
      expect({
        preview: [preview.placement, preview.axis, preview.parent, preview.prev, preview.next],
        zone,
        actions: [actions[0], actions[2]],
      }).toEqual({ preview: ['before', 'x', 'n_form2', 'n_u1', 'n_u2'], zone: 'actions', actions: ['n_u1', 'n_u2'] })
    } finally {
      await tab.close()
    }
  })

  it('받는 타입 제약 — 탭 «안» 에 단추 · 탭 밖에 탭 패널이면 이유가 포인터 곁에 서고 미리보기가 없다 · 놓아도 편집이 없다', async () => {
    const P = await fixture('refuse')
    const tab = await openTab(P)
    try {
      // 단추를 탭의 패널 칸 빈 자리(탭 «안» 띠)로.
      await grabCard(tab.page, 'Button')
      const tabs = await boxOf(tab.page, '[data-wb-id="n_tabs"]')
      await moveTo(tab.page, { x: tabs.x + tabs.width - 6, y: tabs.y + tabs.height * 0.5 })
      const card = await poll(
        '이유',
        () => refusal(tab.page).allTextContents(),
        (texts) => texts.length > 0,
      )
      const cardDrops = (await shownDrops(tab.page)).length
      await tab.page.mouse.up()
      // 탭 패널(탭 머리)을 손잡이로 글 곁에.
      await canvasFrame(tab.page).locator('[data-wb-id="n_tp1"]').click()
      await grabHandle(tab.page)
      await moveTo(tab.page, center(await boxOf(tab.page, '[data-wb-id="n_text"]')))
      const panel = await poll(
        '이유',
        () => refusal(tab.page).allTextContents(),
        (texts) => texts.length > 0,
      )
      const panelDrops = (await shownDrops(tab.page)).length
      await tab.page.mouse.up()
      const afterUp = await refusal(tab.page).count()
      await tab.page.waitForTimeout(600)
      expect({ card, cardDrops, panel, panelDrops, afterUp, sent: tab.patches.length }).toEqual({
        card: ['탭에는 탭 패널만 놓을 수 있습니다'],
        cardDrops: 0,
        panel: ['탭 패널은 탭 안에만 놓을 수 있습니다'],
        panelDrops: 0,
        afterUp: 0,
        sent: 0,
      })
    } finally {
      await tab.close()
    }
  })

  it('구조 트리의 구역 줄 — 고르고 «넣기» · Cmd+V 를 누르면 그 구역 끝에 들고, 줄을 끌어 구역 줄에 놓으면 그 구역에 선다', async () => {
    const P = await fixture('zone-row')
    const tab = await openTab(P)
    try {
      await zoneRow(tab.page, 'n_bare', 'footer').click()
      const current = await zoneRow(tab.page, 'n_bare', 'footer').getAttribute('aria-current')
      const heading = await tab.page.getByRole('heading', { name: 'Card · 바닥' }).count()
      await showOnly(tab.page, 'Divider')
      await tab.page.locator('[data-wb-palette-card="Divider"] .wb-shell-palette-add').click()
      const footer = await poll(
        '서버의 바닥',
        () => zoneIds(P, 'n_bare', 'footer'),
        (ids) => ids.length === 1,
      )

      // 붙여넣기 — 몸통 글을 복사하고 제목 옆 구역 줄을 고른 뒤 붙인다.
      await selectRow(tab.page, 'n_kv')
      await tab.page.keyboard.press('ControlOrMeta+c')
      await zoneRow(tab.page, 'n_bare', 'titleSide').click()
      await tab.page.keyboard.press('ControlOrMeta+v')
      const titleSide = await poll(
        '서버의 제목 옆',
        () => zoneIds(P, 'n_bare', 'titleSide'),
        (ids) => ids.length === 1,
      )

      // 트리 줄 끌기 — 앞 카드의 몸통 글 줄을 이 카드의 머리 오른쪽 구역 줄에 놓는다(둘이 가까워 트리 칸을 안 민다).
      await zoneRow(tab.page, 'n_bare', 'headEnd').scrollIntoViewIfNeeded()
      const from = (await treeRow(tab.page, 'n_kv').boundingBox())!
      const to = (await zoneRow(tab.page, 'n_bare', 'headEnd').boundingBox())!
      await tab.page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
      await tab.page.mouse.down()
      await tab.page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 + 6, { steps: 3 })
      await tab.page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 })
      const line = await poll(
        '트리의 «안» 표시',
        () => shownDrops(tab.page),
        (drops) => drops.some((drop) => drop.kind === 'line'),
      )
      await tab.page.mouse.up()
      const headEnd = await poll(
        '서버의 머리 오른쪽',
        () => zoneIds(P, 'n_bare', 'headEnd'),
        (ids) => ids.length === 1,
      )

      const root = (await server(P)).root
      expect({
        current,
        heading,
        footer: find(root, footer[0]!)?.type,
        titleSide: find(root, titleSide[0]!)?.type,
        line: line.filter((drop) => drop.kind === 'line').map((drop) => drop.placement),
        headEnd,
      }).toEqual({ current: 'true', heading: 1, footer: 'Divider', titleSide: 'Text', line: ['inside'], headEnd: ['n_kv'] })
    } finally {
      await tab.close()
    }
  })

  it('펼쳐 보이기 — 트리에서 지금 탭이 아닌 패널 · 접힌 검색폼 안의 노드를 고르면 캔버스만 펼친다 · 문서와 남의 화면은 그대로', async () => {
    const P = await fixture('reveal')
    const tab = await openTab(P)
    const other = await openTab(P, 'bob')
    try {
      const frame = canvasFrame(tab.page)
      const before = [await frame.locator('[data-wb-id="n_t2"]').count(), await frame.locator('[data-wb-id="n_f1"]').count()]
      await selectRow(tab.page, 'n_t2')
      await frame.locator('[data-wb-id="n_t2"]').waitFor()
      const tabShown = await frame.locator('[data-wb-id="n_t2"]').boundingBox()
      const selected = await tab.page.locator('.wb-shell-selection').getAttribute('data-wb-selected-id')
      const head = await frame.locator('[data-wb-part="tab"][aria-selected="true"] [data-wb-id]').getAttribute('data-wb-id')
      await selectRow(tab.page, 'n_f1')
      await frame.locator('[data-wb-id="n_f1"]').waitFor()
      const formShown = await frame.locator('[data-wb-id="n_f1"]').boundingBox()
      const tabGone = await frame.locator('[data-wb-id="n_t2"]').count()
      await selectRow(tab.page, 'n_text')
      await poll(
        '접힘이 돌아온다',
        () => frame.locator('[data-wb-id="n_f1"]').count(),
        (n) => n === 0,
      )
      const doc = (await server(P)).root
      expect({
        before,
        tab: tabShown !== null && tabShown.height > 0,
        selected,
        head,
        form: formShown !== null && formShown.height > 0,
        tabGone,
        props: [find(doc, 'n_tabs')?.props, find(doc, 'n_form')?.props],
        sent: tab.patches.length,
        other: [
          await canvasFrame(other.page).locator('[data-wb-id="n_t2"]').count(),
          await canvasFrame(other.page).locator('[data-wb-id="n_f1"]').count(),
        ],
      }).toEqual({
        before: [0, 0],
        tab: true,
        selected: 'n_t2',
        head: 'n_tp2',
        form: true,
        tabGone: 0,
        props: [{ active: 0 }, { collapsed: true }],
        sent: 0,
        other: [0, 0],
      })
    } finally {
      await tab.close()
      await other.close()
    }
  })

  it('viewer — 구역 줄은 고르고 넣는 입구 · 손잡이 · 편집은 없다', async () => {
    const P = await fixture('viewer', 'viewer')
    const tab = await openTab(P, 'bob')
    try {
      await zoneRow(tab.page, 'n_card', 'footer').click()
      const current = await zoneRow(tab.page, 'n_card', 'footer').getAttribute('aria-current')
      const notice = await tab.page.getByText('구역입니다. 이 화면에서는 넣을 수 없습니다.').count()
      const adds = await tab.page.locator('.wb-shell-palette-add').count()
      await selectRow(tab.page, 'n_kv')
      const handles = await handle(tab.page).count()
      await tab.page.keyboard.press('ControlOrMeta+c')
      await zoneRow(tab.page, 'n_card', 'footer').click()
      await tab.page.keyboard.press('ControlOrMeta+v')
      await tab.page.waitForTimeout(800)
      expect({ current, notice, adds, handles, sent: tab.patches.length, footer: await zoneIds(P, 'n_card', 'footer') }).toEqual({
        current: 'true',
        notice: 1,
        adds: 0,
        handles: 0,
        sent: 0,
        footer: [],
      })
    } finally {
      await tab.close()
    }
  })

  it('두 사람 — 맵이 없는 카드의 서로 다른 빈 구역에 함께 첫 노드를 넣으면 둘 다 선다(리뷰 RV-NS 발견 3) · 화면 = 서버', async () => {
    const P = await fixture('both-first')
    const delay = await stack.startWsDelay(1500)
    const bob = await openTab(P, 'bob', delay.origin)
    const watcher = await openTab(P)
    try {
      await poll(
        '밥이 룸에 들었다',
        async () => bob.received.slice(),
        (kinds) => kinds.includes('joined'),
        12000,
      )
      await zoneRow(bob.page, 'n_bare', 'footer').click()
      await showOnly(bob.page, 'Divider')
      await bob.page.locator('[data-wb-palette-card="Divider"] .wb-shell-palette-add').click()
      // 밥의 올림이 늦는 사이 앨리스가 같은 카드의 머리 오른쪽에 첫 노드를 넣는다 — 맵째 `add` 가 먼저 커밋된다.
      const { headSeq } = await server(P)
      const status = (
        await call('PATCH', `${P}/ops`, {
          baseSeq: headSeq,
          ops: [
            {
              op: 'add',
              path: '/root/children/1/zones',
              value: { headEnd: [{ id: 'n_alice', type: 'Button', props: { label: '앨리스' } }] },
            },
          ],
        })
      ).status
      await poll(
        '밥의 다시 보낸 편집의 답',
        async () => bob.received.slice(),
        (kinds) => kinds.includes('patch-ack'),
        15000,
      )
      const zones = await poll(
        '서버의 두 구역',
        async () => [await zoneIds(P, 'n_bare', 'headEnd'), await zoneIds(P, 'n_bare', 'footer')],
        ([head, foot]) => head!.length === 1 && foot!.length === 1,
        8000,
      )
      const root = (await server(P)).root
      const expected = treeOrder(root)
      const bobScreen = await poll(
        '밥의 화면',
        () => screenOrder(bob.page),
        (order) => order.slice(1).join() === expected.slice(1).join(),
        8000,
      )
      const watcherScreen = await poll(
        '지켜보는 화면',
        () => screenOrder(watcher.page),
        (order) => order.slice(1).join() === expected.slice(1).join(),
        8000,
      )
      const kinds = bob.received.filter((kind) => kind === 'patch-error' || kind === 'patch-ack')
      expect({
        status,
        zones: [zones[0], find(root, zones[1]![0]!)?.type],
        rebased: kinds.slice(0, 2),
        bob: bobScreen.slice(1),
        watcher: watcherScreen.slice(1),
      }).toEqual({
        status: 200,
        zones: [['n_alice'], 'Divider'],
        rebased: ['patch-error', 'patch-ack'],
        bob: expected.slice(1),
        watcher: expected.slice(1),
      })
    } finally {
      await bob.close()
      await watcher.close()
      await delay.close()
    }
  })

  it('두 사람 — 빈 바닥 칸으로 끄는 동안 남이 그 구역을 채우면 놓은 노드는 그 구역 안에 선다 · 화면 = 서버', async () => {
    const P = await fixture('fill-while-drag')
    const tab = await openTab(P)
    const bob = await stack.login(stack.users.bob)
    try {
      await grabCard(tab.page, 'Button')
      await moveTo(tab.page, center(await boxOf(tab.page, '[data-wb-id="n_text"]')))
      await poll(
        '칸이 선다',
        () => slots(tab.page),
        (list) => list.includes('n_bare:footer'),
      )
      const aimed = await aimAtSlot(tab.page, 'n_bare', 'footer')
      // 밥이 그 바닥에 첫 노드를 넣는다(맵째 `add`).
      const { headSeq } = await server(P)
      const status = (
        await stack.request(bob, 'PATCH', `${P}/ops`, {
          baseSeq: headSeq,
          ops: [
            { op: 'add', path: '/root/children/1/zones', value: { footer: [{ id: 'n_bob', type: 'Button', props: { label: '밥' } }] } },
          ],
        })
      ).status
      await poll(
        '남의 넣기가 화면에 닿는다',
        () => canvasFrame(tab.page).locator('[data-wb-id="n_bob"]').count(),
        (n) => n === 1,
      )
      const slotsAfterFill = await slots(tab.page)
      // 놓기 직전에 보인 자리 — 칸이 걷혀 미리보기가 밥의 노드 곁으로 옮겨 간다(캔버스가 다시 잰 뒤 `refresh`).
      const shownBefore = await poll(
        '미리보기가 밥의 노드 곁',
        async () => (await shownDrops(tab.page)).find((drop) => drop.kind === 'preview') ?? null,
        (drop) => drop !== null && (drop.prev === 'n_bob' || drop.next === 'n_bob'),
        5000,
      )
      await tab.page.mouse.up()
      const footer = await poll(
        '서버의 바닥',
        () => zoneIds(P, 'n_bare', 'footer'),
        (ids) => ids.length === 2,
        8000,
      )
      const root = (await server(P)).root
      const mine = footer.filter((id) => id !== 'n_bob')
      const strays = treeOrder(root).filter(
        (id) => !id.startsWith('zone:') && find(root, id)?.type === 'Button' && !['n_edit', 'n_s1', 'n_u1', 'n_u2', 'n_bob'].includes(id),
      )
      const expected = treeOrder(root)
      const screen = await poll(
        '화면',
        () => screenOrder(tab.page),
        (order) => order.slice(1).join() === expected.slice(1).join(),
        8000,
      )
      // 놓인 차례가 보인 차례다 — 미리보기가 밥의 노드 앞이었으면 앞, 뒤였으면 뒤(`edit/structure-drop.ts` 의 `sameDrop` 머리말 «차례는 지금 문서를 따라간다»).
      const shownOrder = shownBefore!.next === 'n_bob' ? ['mine', 'n_bob'] : ['n_bob', 'mine']
      expect({
        aimed,
        status,
        slotGone: !slotsAfterFill.includes('n_bare:footer'),
        landedAsShown: footer.map((id) => (id === 'n_bob' ? 'n_bob' : 'mine')),
        // 놓였으면 바닥 안이다 — 바닥 밖의 새 단추가 없다.
        strayOutsideFooter: strays.filter((id) => !mine.includes(id)),
        screen: screen.slice(1),
      }).toEqual({
        aimed: 'footer',
        status: 200,
        slotGone: true,
        landedAsShown: shownOrder,
        strayOutsideFooter: [],
        screen: expected.slice(1),
      })
    } finally {
      await tab.close()
    }
  })
})
