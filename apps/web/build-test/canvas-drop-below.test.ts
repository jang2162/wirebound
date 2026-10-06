/**
 * **문서 아래 바탕에 놓기를 실브라우저로 잰다**(`src/canvas/canvas-drop.ts` 머리말 «문서 아래 바탕은 페이지 끝이다»). 창 1440×900 · 하단 판 기본
 * 높이에서 짧은 문서의 iframe 은 캔버스 칸보다 125px 짧다 — 판에서 카드를 쥐고 올라오면 먼저 닿는 띠가 그 바탕이다.
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 카드 → 문서 아래 바탕 | 미리보기가 페이지 끝(뿌리의 마지막 자식 — 끝 노드 바로 뒤)에 안 선다 · 놓아도 서버 문서의 끝에 안 들어간다 · 넣은 노드를 안 고른다 · 칸 아래 끝 띠(24px) · 문서의 가로 범위 밖(왼쪽 아래 모서리)에서는 안 선다 |
 * | 손잡이 → 문서 아래 바탕 | 고른 노드가 페이지 끝으로 안 간다 · 끝 노드를 놓으면(제자리) 표시가 서거나 편집이 나간다 |
 * | 옆 · 위 바탕 | 문서 옆 · 위의 칸 바탕에서 표시가 서거나 놓아 편집이 나간다 — 못 놓는 자리 그대로다 |
 * | 긴 문서 — 바탕이 안 보이는 판 | 칸의 아래쪽에 놓은 것이 포인터 밑 노드 곁이 아니라 페이지 끝으로 간다(대조군 — 바탕은 문서 iframe 으로 가른다 · 칸으로 가르지 않는다) |
 * | 긴 문서를 끝까지 민 판 | 문서 밑에 드러난 칸의 안쪽 여백(끝 스크롤 띠와 같은 자리)에서 페이지 끝이 안 선다 |
 *
 * **«손잡이 → 문서 아래 바탕» 은 판정을 걷으면 «카드 → 문서 아래 바탕» 과 함께 죽는다** — 두 끌기가 같은 판정(`canvasHitAt`)을 지나서다. 이
 * 케이스가 혼자 갖는 축은 «손잡이도 같은 길이다» 다: 바탕 규칙을 새 노드(카드)에만 걸면 이것만 죽는다.
 */
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canvasFrame, editorStackPrerequisite, poll, shownDrops, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

interface SeedNode {
  id: string
  type: string
  props?: Record<string, unknown>
  children?: SeedNode[]
}

interface Box {
  x: number
  y: number
  width: number
  height: number
}

/**
 * ```
 * Page
 * ├ Text    n_text  '글'
 * ├ Card    n_card  '카드'
 * │ └ Text  n_intx  '안'
 * └ Text    n_last  '끝'
 * ```
 */
const SHORT: SeedNode[] = [
  { id: 'n_text', type: 'Text', props: { content: '글' } },
  { id: 'n_card', type: 'Card', props: { title: '카드' }, children: [{ id: 'n_intx', type: 'Text', props: { content: '안' } }] },
  { id: 'n_last', type: 'Text', props: { content: '끝' } },
]
/** 글 마흔 — 문서가 칸보다 길다(바탕이 안 보인다). */
const LONG: SeedNode[] = Array.from({ length: 40 }, (_, index) => ({ id: `n_t${index}`, type: 'Text', props: { content: `글 ${index} — 캔버스를 세로로 채운다` } }))
const KNOWN = new Set([...SHORT.map((node) => node.id), 'n_intx', ...LONG.map((node) => node.id)])

describe.skipIf(!전제.ok)('문서 아래 바탕에 놓기 — 실브라우저', () => {
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

  async function fixture(slug: string, nodes: readonly SeedNode[]): Promise<string> {
    const project = (await call('POST', '/projects', { name: 'M2 바탕', slug: `${slug}-${Date.now().toString(36)}` })).body
    const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '가' })).body
    const member = await call('POST', `/projects/${project.id}/members`, { email: stack.users.bob.email, role: 'editor' })
    if (member.status >= 300) throw new Error(`member ${member.status}`)
    const pageId = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '쪽' })).body.id
    const P = `/projects/${project.id}/pages/${pageId}`
    const seeded = await call('PATCH', `${P}/ops`, { baseSeq: 0, ops: nodes.map((value, at) => ({ op: 'add', path: `/root/children/${at}`, value })) })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
    return P
  }

  async function openEditor(P: string, user: 'alice' | 'bob' = 'alice'): Promise<{ page: Page; close: () => Promise<void>; patches: string[] }> {
    const { context, page } = await stack.openTab(stack.users[user], { viewport: { width: 1440, height: 900 } })
    const patches: string[] = []
    page.on('websocket', (socket) => {
      socket.on('framesent', (frame) => {
        const text = typeof frame.payload === 'string' ? frame.payload : frame.payload.toString()
        if (text.includes('"type":"patch"')) patches.push(text)
      })
    })
    await page.goto(P)
    await canvasFrame(page).locator('[data-wb-id]').nth(1).waitFor()
    return { page, close: () => context.close(), patches }
  }

  /** 캔버스 칸 · 문서 iframe 의 호스트 상자와 칸의 세로 스크롤. */
  async function boxes(page: Page): Promise<{ cell: Box; frame: Box; scrollTop: number; scrollMax: number }> {
    return page.evaluate(() => {
      const plain = (r: DOMRect) => ({ x: r.x, y: r.y, width: r.width, height: r.height })
      const cell = document.querySelector('.wb-shell-canvas') as HTMLElement
      const frame = document.querySelector('iframe.wb-shell-canvas-iframe') as HTMLElement
      return { cell: plain(cell.getBoundingClientRect()), frame: plain(frame.getBoundingClientRect()), scrollTop: cell.scrollTop, scrollMax: cell.scrollHeight - cell.clientHeight }
    })
  }

  async function nodeBox(page: Page, id: string): Promise<Box> {
    const box = await canvasFrame(page).locator(`[data-wb-id="${id}"]`).boundingBox()
    if (box === null) throw new Error(`캔버스에 ${id} 상자가 없다`)
    return box
  }

  async function openPalette(page: Page): Promise<void> {
    if ((await page.getByRole('region', { name: '컴포넌트 목록' }).count()) > 0) return
    await page.getByRole('contentinfo', { name: '하단 바' }).getByRole('button', { name: '컴포넌트', exact: true }).click()
    await page.getByRole('region', { name: '컴포넌트 목록' }).waitFor()
  }

  /** 판을 열고 검색으로 그 타입의 카드만 세운 뒤 쥐고 문턱(4px)을 넘긴다. */
  async function grabCard(page: Page, type: string): Promise<void> {
    await openPalette(page)
    await page.getByRole('searchbox', { name: '컴포넌트 찾기' }).fill(type)
    const card = page.locator(`[data-wb-palette-card="${type}"]`)
    await card.waitFor()
    const box = (await card.boundingBox())!
    const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    await page.mouse.move(at.x, at.y)
    await page.mouse.down()
    await page.mouse.move(at.x + 3, at.y - 6, { steps: 3 })
  }

  /** 고른 노드의 손잡이를 쥐고 문턱을 넘긴다. */
  async function grabHandle(page: Page): Promise<void> {
    const handle = page.locator('.wb-shell-canvas-handle')
    await handle.waitFor()
    const h = (await handle.boundingBox())!
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2)
    await page.mouse.down()
    await page.mouse.move(h.x + h.width / 2 + 3, h.y + h.height / 2 + 6, { steps: 3 })
  }

  async function moveTo(page: Page, at: { x: number; y: number }): Promise<void> {
    await page.mouse.move(at.x, at.y, { steps: 10 })
  }

  /** 지금 보인 놓을 자리 — `띠 · 부모가 뿌리인가 · 바로 앞 · 바로 뒤`. 없으면 `[]`. */
  async function shown(page: Page, rootId: string): Promise<string[]> {
    return (await shownDrops(page)).map((drop) => `${drop.kind}:${drop.placement} ${drop.parent === rootId ? '뿌리' : drop.parent} ${drop.prev}→${drop.next}`)
  }

  const rootIdOf = async (P: string): Promise<string> => (await call('GET', P)).body.schema.root.id as string

  /** 서버 문서에서 뿌리의 자식 차례 — 픽스처에 없는 노드(넣은 것)는 `+타입`. */
  async function order(P: string): Promise<string[]> {
    const root = (await call('GET', P)).body.schema.root as { children?: { id: string; type: string }[] }
    return (root.children ?? []).map((child) => (KNOWN.has(child.id) ? child.id : `+${child.type}`))
  }

  async function selectedId(page: Page): Promise<string | null> {
    return page.evaluate(() => document.querySelector('.wb-shell-selection')?.getAttribute('data-wb-selected-id') ?? null)
  }

  it('카드를 문서 아래 바탕에 놓으면 페이지 끝에 들어간다 — 칸 아래 끝 띠 · 문서의 가로 범위 밖에서도', async () => {
    const P = await fixture('below-card', SHORT)
    const rootId = await rootIdOf(P)
    const { page, close, patches } = await openEditor(P)
    try {
      await openPalette(page)
      const b = await boxes(page)
      // 판 카나리아 — 문서 iframe 이 칸보다 짧아 그 밑에 바탕이 보인다.
      const gap = b.cell.y + b.cell.height - (b.frame.y + b.frame.height)
      const x = b.cell.x + b.cell.width / 2

      await grabCard(page, 'Divider')
      await moveTo(page, { x, y: b.frame.y + b.frame.height + gap / 2 })
      const midHint = await shown(page, rootId)
      const tag = await page.locator('.wb-shell-palette-dragtag').textContent()
      await page.mouse.up()
      const mid = await poll('서버 문서', () => order(P), (v) => v.length === 4).catch(() => order(P))
      const added = ((await call('GET', P)).body.schema.root.children as { id: string }[]).at(-1)?.id
      const selected = await poll('넣은 노드를 고른다', () => selectedId(page), (id) => id === added, 3000).catch(() => selectedId(page))

      // 칸 아래 끝 띠(끝 스크롤 자리 — 민 것이 없어 안 밀린다) 안.
      await grabCard(page, 'Button')
      await moveTo(page, { x, y: b.cell.y + b.cell.height - 10 })
      const bandHint = await shown(page, rootId)
      await page.mouse.up()
      const band = await poll('서버 문서', () => order(P), (v) => v.length === 5).catch(() => order(P))

      // 문서가 칸보다 좁은 판(프리셋 375) — 문서의 가로 범위 밖 · 문서 아래끝보다 밑(왼쪽 아래 모서리).
      await page.getByLabel('뷰포트 폭').selectOption('375')
      const narrow = await poll('프리셋이 실린다', () => boxes(page), (v) => Math.abs(v.frame.width - 375) < 1)
      await grabCard(page, 'Link')
      await moveTo(page, { x: narrow.cell.x + (narrow.frame.x - narrow.cell.x) / 2, y: narrow.frame.y + narrow.frame.height + 30 })
      const cornerHint = await shown(page, rootId)
      await page.mouse.up()
      const corner = await poll('서버 문서', () => order(P), (v) => v.length === 6).catch(() => order(P))

      expect({ gap: gap > 80, frameLeftGap: narrow.frame.x - narrow.cell.x > 80, midHint, tag, mid, selected: selected === added, bandHint, band, cornerHint, corner, sent: patches.length }).toEqual({
        gap: true,
        frameLeftGap: true,
        midHint: [`preview:inside 뿌리 n_last→null`],
        tag: '구분선',
        mid: ['n_text', 'n_card', 'n_last', '+Divider'],
        selected: true,
        bandHint: [`preview:inside 뿌리 ${added}→null`],
        band: ['n_text', 'n_card', 'n_last', '+Divider', '+Button'],
        cornerHint: [expect.stringMatching(/^preview:inside 뿌리 .+→null$/)],
        corner: ['n_text', 'n_card', 'n_last', '+Divider', '+Button', '+Link'],
        sent: 3,
      })
    } finally {
      await close()
    }
  })

  it('손잡이로 문서 아래 바탕에 놓으면 그 노드가 페이지 끝으로 간다 — 끝 노드는 제자리라 아무 일도 없다', async () => {
    const P = await fixture('below-handle', SHORT)
    const rootId = await rootIdOf(P)
    const { page, close, patches } = await openEditor(P)
    try {
      await openPalette(page)
      const b = await boxes(page)
      const below = { x: b.cell.x + b.cell.width / 2, y: b.frame.y + b.frame.height + 40 }

      const text = await nodeBox(page, 'n_text')
      await page.mouse.click(text.x + text.width / 2, text.y + text.height / 2)
      await grabHandle(page)
      await moveTo(page, below)
      const moveHint = await shown(page, rootId)
      await page.mouse.up()
      const moved = await poll('서버 문서', () => order(P), (v) => v.at(-1) === 'n_text').catch(() => order(P))

      // 이제 끝 노드인 n_text 를 다시 그 바탕에 — 제자리다.
      await page.locator('.wb-shell-canvas-handle').waitFor()
      const sentBefore = patches.length
      await grabHandle(page)
      await moveTo(page, below)
      const sameHint = await shown(page, rootId)
      await page.mouse.up()
      await page.waitForTimeout(500)

      expect({ moveHint, moved, sameHint, sentAfterSame: patches.length - sentBefore, order: await order(P) }).toEqual({
        moveHint: ['preview:inside 뿌리 n_last→null'],
        moved: ['n_card', 'n_last', 'n_text'],
        sameHint: [],
        sentAfterSame: 0,
        order: ['n_card', 'n_last', 'n_text'],
      })
    } finally {
      await close()
    }
  })

  it('문서 옆 · 위의 칸 바탕은 못 놓는 자리다 — 표시가 없고 놓아도 편집이 없다', async () => {
    const P = await fixture('below-sides', SHORT)
    const rootId = await rootIdOf(P)
    const { page, close, patches } = await openEditor(P)
    try {
      await openPalette(page)
      await page.getByLabel('뷰포트 폭').selectOption('375')
      const b = await poll('프리셋이 실린다', () => boxes(page), (v) => Math.abs(v.frame.width - 375) < 1)
      const midY = b.frame.y + b.frame.height / 2
      const spots = {
        left: { x: b.cell.x + (b.frame.x - b.cell.x) / 2, y: midY },
        right: { x: b.frame.x + b.frame.width + (b.cell.x + b.cell.width - b.frame.x - b.frame.width) / 2, y: midY },
        top: { x: b.frame.x + b.frame.width / 2, y: b.cell.y + (b.frame.y - b.cell.y) / 2 },
      }
      const hints: Record<string, string[]> = {}
      for (const [name, at] of Object.entries(spots)) {
        await grabCard(page, 'Divider')
        await moveTo(page, at)
        // 끌기는 서 있다(이름표) — 자리만 없다.
        hints[name] = [...(await shown(page, rootId)), (await page.locator('.wb-shell-palette-dragtag').count()) === 1 ? '이름표' : '이름표 없음']
        await page.mouse.up()
        await page.waitForTimeout(300)
      }
      // 판 카나리아 — 같은 판에서 문서 안에는 놓인다.
      await grabCard(page, 'Divider')
      await moveTo(page, { x: b.frame.x + b.frame.width / 2, y: b.frame.y + b.frame.height - 20 })
      const insideHint = await shown(page, rootId)
      await page.mouse.up()
      const after = await poll('서버 문서', () => order(P), (v) => v.length === 4).catch(() => order(P))

      expect({ room: [b.frame.x - b.cell.x > 80, b.frame.y - b.cell.y >= 12], hints, insideHint, after, sent: patches.length }).toEqual({
        room: [true, true],
        hints: { left: ['이름표'], right: ['이름표'], top: ['이름표'] },
        insideHint: ['preview:inside 뿌리 n_last→null'],
        after: ['n_text', 'n_card', 'n_last', '+Divider'],
        sent: 1,
      })
    } finally {
      await close()
    }
  })

  it('긴 문서 — 바탕이 안 보이는 판에서는 칸의 아래쪽에 놓아도 포인터 밑 노드 곁이다(대조군)', async () => {
    const P = await fixture('below-long', LONG)
    const rootId = await rootIdOf(P)
    const { page, close, patches } = await openEditor(P)
    try {
      await openPalette(page)
      const b = await boxes(page)
      // 칸 아래 끝에서 40 ~ 110px 위에 가운데가 선 글 하나 — 그 위 25% 띠(앞 형제 자리)를 겨눈다. 노드 사이의 틈은 문서 안의 바탕이라
      // 고치기 전에도 페이지 끝이다(`src/canvas/canvas-drop.ts` 의 «노드가 없는 바탕 · 뿌리 자체는 페이지 끝»).
      let over: { id: string; box: Box } | null = null
      for (const node of LONG) {
        const box = await nodeBox(page, node.id)
        const middle = box.y + box.height / 2
        if (middle > b.cell.y + b.cell.height - 110 && middle < b.cell.y + b.cell.height - 40) over = { id: node.id, box }
      }
      if (over === null) throw new Error('칸 아래쪽에 선 글이 없다')
      await grabCard(page, 'Divider')
      await moveTo(page, { x: b.cell.x + b.cell.width / 2, y: over.box.y + over.box.height * 0.15 })
      const drops = await shownDrops(page)
      await page.mouse.up()
      const after = await poll('서버 문서', () => order(P), (v) => v.length === 41).catch(() => order(P))
      expect({
        // 판 카나리아 — 문서 iframe 이 칸 아래끝을 넘는다(바탕이 안 보인다).
        frameCoversCell: b.frame.y + b.frame.height > b.cell.y + b.cell.height,
        hint: drops.map((drop) => ({ kind: drop.kind, placement: drop.placement, root: drop.parent === rootId, next: drop.next })),
        // 끝 스크롤이 칸을 조금 밀어 포인터 밑 글이 겨눈 글이 아닐 수 있다 — 보인 자리의 다음 노드 앞에 들어갔는지로 잰다.
        placedBeforeShownNext: drops.length === 1 && drops[0]!.next !== null && after.indexOf('+Divider') === after.indexOf(drops[0]!.next) - 1,
        notAtEnd: after.at(-1),
        sent: patches.length,
      }).toEqual({
        frameCoversCell: true,
        hint: [{ kind: 'preview', placement: expect.stringMatching(/^(before|after)$/), root: true, next: expect.stringMatching(/^n_t\d+$/) }],
        placedBeforeShownNext: true,
        notAtEnd: 'n_t39',
        sent: 1,
      })
    } finally {
      await close()
    }
  })

  it('긴 문서를 끝까지 민 판 — 문서 밑에 드러난 칸의 안쪽 여백에 놓으면 페이지 끝이다', async () => {
    const P = await fixture('below-long-end', LONG)
    const rootId = await rootIdOf(P)
    const { page, close, patches } = await openEditor(P)
    try {
      await openPalette(page)
      await page.evaluate(() => {
        const cell = document.querySelector('.wb-shell-canvas') as HTMLElement
        cell.scrollTop = cell.scrollHeight
      })
      const b = await poll('칸이 끝까지 밀린다', () => boxes(page), (v) => v.scrollMax > 0 && Math.abs(v.scrollTop - v.scrollMax) < 1)
      const margin = b.cell.y + b.cell.height - (b.frame.y + b.frame.height)
      await grabCard(page, 'Divider')
      await moveTo(page, { x: b.cell.x + b.cell.width / 2, y: b.frame.y + b.frame.height + margin / 2 })
      const hint = await shown(page, rootId)
      await page.mouse.up()
      const after = await poll('서버 문서', () => order(P), (v) => v.length === 41).catch(() => order(P))
      expect({ margin: margin >= 12, hint, last: after.at(-1), count: after.length, sent: patches.length }).toEqual({
        margin: true,
        hint: ['preview:inside 뿌리 n_t39→null'],
        last: '+Divider',
        count: 41,
        sent: 1,
      })
    } finally {
      await close()
    }
  })
})
