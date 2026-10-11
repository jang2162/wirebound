/**
 * **끄는 동안의 배치 미리보기를 실브라우저로 잰다**(`src/canvas/canvas-preview.ts` · 판정 `src/drag/use-placement.ts` 머리말 «배치 미리보기» ·
 * «판정은 미리보기를 뺀 배치로»). 놓기 · 보인 자리 = 놓인 자리의 판은 `./canvas-drop*.test.ts` · `./palette*.test.ts` 가 공용 읽개
 * (`./editor-stack.ts` 의 `shownDrops`)로 잰다 — 여기는 미리보기 자체의 성질이다.
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 카드 → 빈 카드 · 형제 앞 | 미리보기가 그 자리에 안 선다 · 반투명이 아니다 · 앞에 끼운 미리보기가 그 형제를 안 민다 · 끄는 동안 편집 프레임이 나간다 · 구조 트리에 줄이 생긴다 · 놓거나 취소한 뒤 미리보기가 남는다 |
 * | 떨림 — 멈춤 · 1px 흔들기 | 포인터가 멈춰 있거나 1px 씩 흔들리는 동안 미리보기가 섰다 걷힌다(판정이 미리보기를 낀 배치로 재면 얇은 구분선을 카드 자식 앞에 보일 때 그렇다) |
 * | 손잡이로 옮기기 | 사본이 새 자리에 안 선다 · 원본이 안 흐려진다 · 사본이 원본 id 로 잡힌다(외곽선 · `data-wb-id` 조회) · 취소 뒤 원본의 흐림 · 외곽선 · 마커 자리가 돌아오지 않는다 |
 * | 남의 편집 | 끄는 중 bob 이 위에 노드를 넣으면 미리보기가 새 문서 위에 다시 서지 않는다(옛 문서 사본이 남는다) |
 * | iframe 높이 | 미리보기가 키운 iframe 이 끌다 취소한 뒤 끌기 전 높이로 안 돌아온다 · 남이 노드를 지워도 내용 높이로 안 준다 |
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
  marker?: number
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
 * ├ Card    n_empt  '빈 카드'
 * └ Text    n_last  '끝'   (코멘트 마커 1)
 * ```
 */
const BASIC: SeedNode[] = [
  { id: 'n_text', type: 'Text', props: { content: '글' } },
  { id: 'n_card', type: 'Card', props: { title: '카드' }, children: [{ id: 'n_intx', type: 'Text', props: { content: '안' } }] },
  { id: 'n_empt', type: 'Card', props: { title: '빈 카드' } },
  { id: 'n_last', type: 'Text', props: { content: '끝' }, marker: 1 },
]

/** 캔버스 문서 안에서 미리보기 노드(머리 `wb:preview:`)의 루트가 섰다 걷힌 수를 센다 — 판을 세우기 전에 건다. */
const COUNT_PREVIEW = `(() => {
  const doc = document.querySelector('iframe.wb-shell-canvas-iframe').contentDocument
  const hit = (n) => n.nodeType === 1 && (n.matches('[data-wb-id^="wb:preview:"]') || n.querySelector('[data-wb-id^="wb:preview:"]') !== null)
  window.__preview = { adds: 0, removes: 0 }
  new MutationObserver((records) => {
    for (const r of records) {
      for (const n of r.addedNodes) if (hit(n)) window.__preview.adds++
      for (const n of r.removedNodes) if (hit(n)) window.__preview.removes++
    }
  }).observe(doc.body, { childList: true, subtree: true })
})()`

describe.skipIf(!전제.ok)('배치 미리보기 — 실브라우저', () => {
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

  async function fixture(slug: string, nodes: readonly SeedNode[] = BASIC): Promise<string> {
    const project = (await call('POST', '/projects', { name: 'D4 미리보기', slug: `${slug}-${Date.now().toString(36)}` })).body
    const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '가' })).body
    const member = await call('POST', `/projects/${project.id}/members`, { email: stack.users.bob.email, role: 'editor' })
    if (member.status >= 300) throw new Error(`member ${member.status}`)
    const pageId = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '쪽' })).body.id
    const P = `/projects/${project.id}/pages/${pageId}`
    const seeded = await call('PATCH', `${P}/ops`, {
      baseSeq: 0,
      ops: nodes.map((value, at) => ({ op: 'add', path: `/root/children/${at}`, value })),
    })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
    return P
  }

  async function openEditor(P: string, ready = 'n_last'): Promise<{ page: Page; close: () => Promise<void>; patches: string[] }> {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
    const patches: string[] = []
    page.on('websocket', (socket) => {
      socket.on('framesent', (frame) => {
        const text = typeof frame.payload === 'string' ? frame.payload : frame.payload.toString()
        if (text.includes('"type":"patch"')) patches.push(text)
      })
    })
    await page.goto(P)
    await canvasFrame(page).locator(`[data-wb-id="${ready}"]`).waitFor()
    return { page, close: () => context.close(), patches }
  }

  async function nodeBox(page: Page, id: string): Promise<Box> {
    const box = await canvasFrame(page).locator(`[data-wb-id="${id}"]`).boundingBox()
    if (box === null) throw new Error(`캔버스에 ${id} 상자가 없다`)
    return box
  }

  async function spotIn(page: Page, id: string, fx: number, fy: number): Promise<{ x: number; y: number }> {
    const box = await nodeBox(page, id)
    return { x: box.x + box.width * fx, y: box.y + box.height * fy }
  }

  /** 미리보기 루트 · 그 계산 투명도. 없으면 `null`. */
  async function previewLook(page: Page): Promise<{ opacity: string; count: number } | null> {
    return page.evaluate(() => {
      const doc = (document.querySelector('iframe.wb-shell-canvas-iframe') as HTMLIFrameElement).contentDocument!
      const roots = Array.from(doc.querySelectorAll<HTMLElement>('[data-wb-id]')).filter(
        (el) =>
          (el.getAttribute('data-wb-id') ?? '').startsWith('wb:preview:') &&
          !(el.parentElement?.closest('[data-wb-id]')?.getAttribute('data-wb-id') ?? '').startsWith('wb:preview:'),
      )
      return roots.length === 0 ? null : { opacity: getComputedStyle(roots[0]!).opacity, count: roots.length }
    })
  }

  /** 캔버스 문서에서 `data-wb-id` 가 그 값인 요소 수와 첫 요소의 인라인 투명도. */
  async function nodeLook(page: Page, id: string): Promise<{ count: number; opacity: string }> {
    return page.evaluate((wanted) => {
      const doc = (document.querySelector('iframe.wb-shell-canvas-iframe') as HTMLIFrameElement).contentDocument!
      const found = Array.from(doc.querySelectorAll<HTMLElement>('[data-wb-id]')).filter((el) => el.getAttribute('data-wb-id') === wanted)
      return { count: found.length, opacity: found[0]?.style.opacity ?? '' }
    }, id)
  }

  async function grabCard(page: Page, type: string): Promise<void> {
    await page.getByRole('contentinfo', { name: '하단 바' }).getByRole('button', { name: '컴포넌트', exact: true }).click()
    await page.getByRole('searchbox', { name: '컴포넌트 찾기' }).fill(type)
    const box = (await page.locator(`[data-wb-palette-card="${type}"]`).boundingBox())!
    const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    await page.mouse.move(at.x, at.y)
    await page.mouse.down()
    await page.mouse.move(at.x + 3, at.y - 6, { steps: 3 })
  }

  function treeRows(page: Page) {
    return page.locator('.wb-shell-region[aria-label="구조 트리"] [data-tree-row]')
  }

  it('카드를 빈 카드 · 형제 앞으로 끌면 그 자리에 반투명 미리보기가 서고 뒤 형제가 밀린다 — 끄는 동안 편집 0 · 놓거나 취소하면 걷힌다', async () => {
    const P = await fixture('pv-card')
    const { page, close, patches } = await openEditor(P)
    try {
      const rowsBefore = await treeRows(page).count()
      const lastBefore = await nodeBox(page, 'n_last')
      const intxBefore = await nodeBox(page, 'n_intx')
      const into = await spotIn(page, 'n_empt', 0.5, 0.5)
      const front = await spotIn(page, 'n_intx', 0.5, 0.1)
      await grabCard(page, 'Divider')
      await page.mouse.move(into.x, into.y, { steps: 8 })
      const inside = { drops: await shownDrops(page), look: await previewLook(page) }
      await page.mouse.move(front.x, front.y, { steps: 8 })
      const before = {
        drops: await shownDrops(page),
        look: await previewLook(page),
        intxPushed: (await nodeBox(page, 'n_intx')).y - intxBefore.y,
      }
      const during = { patches: patches.length, rows: await treeRows(page).count() }
      await page.keyboard.press('Escape')
      await page.mouse.up()
      await page.waitForTimeout(300)
      const cancelled = {
        look: await previewLook(page),
        drops: (await shownDrops(page)).length,
        last: Math.abs((await nodeBox(page, 'n_last')).y - lastBefore.y) <= 0.5,
      }

      expect({
        inside: { at: inside.drops.map((d) => `${d.kind}:${d.at}`), look: inside.look },
        // 앞에 끼운 미리보기가 n_intx 를 실제로 민다(미리보기 높이만큼).
        before: { at: before.drops.map((d) => `${d.kind}:${d.at}:${d.next}`), look: before.look, pushed: before.intxPushed > 5 },
        during,
        cancelled,
      }).toEqual({
        inside: { at: ['preview:n_empt@0'], look: { opacity: '0.55', count: 1 } },
        before: { at: ['preview:n_card@0:n_intx'], look: { opacity: '0.55', count: 1 }, pushed: true },
        during: { patches: 0, rows: rowsBefore },
        cancelled: { look: null, drops: 0, last: true },
      })
    } finally {
      await close()
    }
  })

  /**
   * L-010 — 안 보이는 자리에 끼운 미리보기. 활성 패널만 보이는 `Tabs` 를 흉내 낸다(첫 자식 밖은 `display: none` — 시스템 테마 다섯은 패널을 다 보이므로 CSS 를 덧입힌다).
   * 첫 패널 «뒤» 에 끼운 미리보기는 숨어 상자가 0 × 0 이다 — 고치기 전에는 끄는 사람이 아무것도 못 보는 채 놓았다. 지금은 들어갈 부모(`Tabs`)에 강조색 테두리가 선다.
   */
  it('안 보이는 자리의 미리보기는 들어갈 부모를 테두리로 보이고 — 보이는 자리에서는 안 두른다 · 걷히면 원래대로', async () => {
    const tabsDoc: SeedNode[] = [
      { id: 'n_top', type: 'Text', props: { content: '위 글' } },
      {
        id: 'n_tabs',
        type: 'Tabs',
        props: { tabs: ['하나', '둘'], active: 0 },
        children: [
          { id: 'n_p0', type: 'Text', props: { content: '첫 패널 글' } },
          { id: 'n_p1', type: 'Text', props: { content: '둘째 패널 글' } },
        ],
      },
      { id: 'n_move', type: 'Text', props: { content: '옮길 글' } },
    ]
    const P = await fixture('pv-hidden', tabsDoc)
    const { page, close } = await openEditor(P, 'n_move')
    try {
      const frame = (await (await page.$('iframe.wb-shell-canvas-iframe'))!.contentFrame())!
      await frame.evaluate(() => {
        const style = document.createElement('style')
        style.textContent = '[data-wb-component="Tabs"] [data-wb-part="panel"] > :not(:first-child) { display: none !important }'
        document.head.appendChild(style)
      })
      await page.locator('.wb-shell-region[aria-label="구조 트리"] [data-tree-row][data-tree-id="n_move"] button').first().click()
      const handle = page.locator('.wb-shell-canvas-handle')
      await handle.waitFor()
      const h = (await handle.boundingBox())!
      /** 인라인 `outline` 이 걸린 노드 id 들과 그 값 — 걸린 것이 없으면 `[]`. */
      const outlined = () =>
        page.evaluate(() => {
          const doc = (document.querySelector('iframe.wb-shell-canvas-iframe') as HTMLIFrameElement).contentDocument!
          return Array.from(doc.querySelectorAll<HTMLElement>('[data-wb-id]'))
            .filter((el) => el.style.outline !== '')
            .map((el) => `${el.getAttribute('data-wb-id')} ${el.style.outline} ${el.style.outlineOffset}`)
        })
      const previewBox = async () =>
        (await shownDrops(page)).map(
          (d) => `${d.kind}:${d.parent}[${d.prev}→${d.next}] ${d.rect.width === 0 && d.rect.height === 0 ? '숨음' : '보임'}`,
        )

      await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2)
      await page.mouse.down()
      await page.mouse.move(h.x + h.width / 2 + 3, h.y + h.height / 2 + 6, { steps: 3 })
      // 상자는 미리보기를 세우기 전에 잰다 — 보이는 자리의 미리보기가 아래 노드를 민다.
      const p0 = await nodeBox(page, 'n_p0')
      // 보이는 자리 — 위 글 «뒤»(루트의 형제 자리).
      const top = await spotIn(page, 'n_top', 0.5, 0.9)
      await page.mouse.move(top.x, top.y, { steps: 8 })
      const visible = { shown: await previewBox(), outlined: await outlined() }
      // 숨은 자리 — 첫 패널 글 «뒤» = 둘째 패널 자리.
      await page.mouse.move(p0.x + 10, p0.y + p0.height - 2, { steps: 8 })
      await page.waitForTimeout(100)
      const hidden = { shown: await previewBox(), outlined: await outlined() }
      await page.keyboard.press('Escape')
      await page.mouse.up()
      await page.waitForTimeout(200)
      const cancelled = await outlined()
      expect({ visible, hidden, cancelled }).toEqual({
        visible: { shown: [expect.stringMatching(/보임$/)], outlined: [] },
        hidden: {
          shown: ['preview:n_tabs[n_p0→n_p1] 숨음'],
          outlined: [expect.stringMatching(/^n_tabs rgb\(47, 111, 237\) solid 2px -2px$/)],
        },
        cancelled: [],
      })
    } finally {
      await close()
    }
  })

  /**
   * 카드 자식 앞에 얇은 구분선을 보인 채 — 미리보기가 비운 자리보다 작아 포인터가 부모의 여백에 선다. 판정이 미리보기를 낀 배치로 재면 여기서
   * 다른 자리가 서고 걷히며 1px 흔들 때마다 섰다 걷힌다(`src/drag/use-placement.ts` 머리말 «판정은 미리보기를 뺀 배치로»).
   */
  it('떨림 — 포인터가 멈춰 있거나 1px 씩 흔들려도 미리보기가 섰다 걷히지 않고, 그대로 떼면 보인 자리에 놓인다', async () => {
    const P = await fixture('pv-still')
    const { page, close } = await openEditor(P)
    try {
      const front = await spotIn(page, 'n_intx', 0.5, 0.1)
      await page.evaluate(COUNT_PREVIEW)
      await grabCard(page, 'Divider')
      await page.mouse.move(front.x, front.y, { steps: 8 })
      await page.waitForTimeout(150)
      await page.evaluate('window.__preview = { adds: 0, removes: 0 }')
      await page.waitForTimeout(800)
      const still = await page.evaluate('window.__preview')
      for (let i = 0; i < 6; i += 1) {
        await page.mouse.move(front.x, front.y + (i % 2 === 0 ? 1 : -1))
        await page.waitForTimeout(80)
      }
      await page.mouse.move(front.x, front.y)
      await page.waitForTimeout(200)
      const wiggle = await page.evaluate('window.__preview')
      const shown = (await shownDrops(page)).map((d) => `${d.kind}:${d.at}`)
      await page.mouse.up()
      const landed = await poll(
        '서버 문서',
        async () =>
          (await call('GET', P)).body.schema.root.children[1].children.map((c: { id: string; type: string }) =>
            c.id === 'n_intx' ? c.id : `+${c.type}`,
          ),
        (ids: string[]) => ids.length === 2,
      ).catch(async () => (await call('GET', P)).body.schema.root.children[1].children.map((c: { id: string }) => c.id))
      expect({ still, wiggle, shown, landed }).toEqual({
        still: { adds: 0, removes: 0 },
        wiggle: { adds: 0, removes: 0 },
        shown: ['preview:n_card@0'],
        landed: ['+Divider', 'n_intx'],
      })
    } finally {
      await close()
    }
  })

  it('손잡이로 옮기면 사본이 새 자리에 서고 원본은 흐려진다 — 사본은 원본 id 로 안 잡히고, 취소하면 흐림 · 외곽선 · 마커가 제자리다', async () => {
    const P = await fixture('pv-move')
    const { page, close, patches } = await openEditor(P)
    try {
      const textAt = await spotIn(page, 'n_text', 0.5, 0.5)
      await page.mouse.click(textAt.x, textAt.y)
      const handle = page.locator('.wb-shell-canvas-handle')
      await handle.waitFor()
      const outline = async () =>
        page.evaluate(() => {
          const el = document.querySelector('.wb-shell-selection')
          if (el === null) return null
          const r = el.getBoundingClientRect()
          return {
            id: el.getAttribute('data-wb-selected-id'),
            x: Math.round(r.x),
            y: Math.round(r.y),
            w: Math.round(r.width),
            h: Math.round(r.height),
          }
        })
      const marker = async () =>
        page.evaluate(() => {
          const el = document.querySelector('[data-wb-marker-for="n_last"]')
          if (el === null) return null
          const r = el.getBoundingClientRect()
          return { count: document.querySelectorAll('.wb-shell-marker').length, x: Math.round(r.x), y: Math.round(r.y) }
        })
      const outlineBefore = await outline()
      const markerBefore = await marker()
      const into = await spotIn(page, 'n_empt', 0.5, 0.5)
      const h = (await handle.boundingBox())!
      await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2)
      await page.mouse.down()
      await page.mouse.move(h.x + h.width / 2 + 3, h.y + h.height / 2 + 6, { steps: 3 })
      await page.mouse.move(into.x, into.y, { steps: 8 })
      const during = {
        drops: (await shownDrops(page)).map((d) => `${d.kind}:${d.at}`),
        copy: await nodeLook(page, 'wb:preview:n_text'),
        original: await nodeLook(page, 'n_text'),
        outlineId: (await outline())?.id ?? null,
        markers: (await marker())?.count ?? 0,
        markerPushed: ((await marker())?.y ?? 0) > (markerBefore?.y ?? 0),
      }
      await page.keyboard.press('Escape')
      await page.mouse.up()
      await page.waitForTimeout(300)
      const after = {
        copy: (await nodeLook(page, 'wb:preview:n_text')).count,
        original: await nodeLook(page, 'n_text'),
        outline: await outline(),
        marker: await marker(),
      }
      expect({ during, after, sent: patches.length }).toEqual({
        during: {
          drops: ['preview:n_empt@0'],
          copy: { count: 1, opacity: '0.55' },
          original: { count: 1, opacity: '0.3' },
          outlineId: 'n_text',
          markers: 1,
          markerPushed: true,
        },
        after: { copy: 0, original: { count: 1, opacity: '' }, outline: outlineBefore, marker: markerBefore },
        sent: 0,
      })
    } finally {
      await close()
    }
  })

  /**
   * 미리보기는 끄는 동안 문서를 키운다 — 놓거나 취소한 뒤 iframe 이 그 높이로 남으면 문서 끝에 빈 꼬리가 남고 캔버스 칸이 그만큼 더 스크롤된다.
   * 남이 노드를 지워 문서가 준 판도 같은 측정이 줄인다(`src/canvas/canvas-iframe.tsx` 의 `contentHeight`).
   */
  it('iframe 은 끌기 뒤 끌기 전 높이로 — 끌다 취소하면 돌아오고, 남이 노드를 지우면 줄어든다', async () => {
    const lines = (prefix: string) =>
      Array.from({ length: 12 }, (_, i) => ({ id: `${prefix}${i}`, type: 'Text', props: { content: `${prefix} 글 ${i}` } }))
    const P = await fixture('pv-shrink', [
      { id: 'n_big', type: 'Card', props: { title: '큰 카드' }, children: lines('n_b') },
      ...Array.from({ length: 4 }, (_, i) => ({ id: `n_z${i}`, type: 'Text', props: { content: `끝 글 ${i}` } })),
      { id: 'n_big2', type: 'Card', props: { title: '둘째 큰 카드' }, children: lines('n_c') },
    ])
    const { page, close, patches } = await openEditor(P, 'n_big2')
    try {
      const heights = () =>
        page.evaluate(() => {
          const iframe = document.querySelector('iframe.wb-shell-canvas-iframe') as HTMLIFrameElement
          return { iframe: iframe.offsetHeight, content: Math.ceil(iframe.contentDocument!.documentElement.getBoundingClientRect().height) }
        })
      const settled = (until: (h: { iframe: number; content: number }) => boolean) =>
        poll('iframe 높이', heights, until, 3000).catch(heights)
      const before = await settled((h) => h.iframe === Math.max(320, h.content))
      await page.locator('.wb-shell-region[aria-label="구조 트리"] [data-tree-row][data-tree-id="n_big"]').locator('button').first().click()
      const handle = page.locator('.wb-shell-canvas-handle')
      await handle.waitFor()
      const target = await spotIn(page, 'n_z0', 0.5, 0.8)
      const h = (await handle.boundingBox())!
      await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2)
      await page.mouse.down()
      await page.mouse.move(h.x + h.width / 2 + 3, h.y + h.height / 2 + 8, { steps: 3 })
      await page.mouse.move(target.x, target.y, { steps: 6 })
      const during = {
        drops: (await shownDrops(page)).map((d) => `${d.kind}:after ${d.prev}`),
        iframe: (await settled((now) => now.iframe > before.iframe)).iframe,
      }
      await page.keyboard.press('Escape')
      await page.mouse.up()
      const cancelled = await settled((now) => now.iframe === before.iframe)
      // bob 은 고르지 않은 둘째 큰 카드를 지운다 — 앨리스가 고른 n_big 의 잠금에 안 닿는다.
      const bob = await stack.login(stack.users.bob)
      const head = (await stack.request(bob, 'GET', P)).body.headSeq as number
      const removed = await stack.request(bob, 'PATCH', `${P}/ops`, { baseSeq: head, ops: [{ op: 'remove', path: '/root/children/5' }] })
      await poll(
        '둘째 큰 카드가 캔버스에서',
        async () => canvasFrame(page).locator('[data-wb-id="n_big2"]').count(),
        (n) => n === 0,
      ).catch(() => -1)
      const after = await settled((now) => now.iframe === Math.max(320, now.content))
      expect({
        before: before.iframe,
        during: { drops: during.drops, grew: during.iframe > before.iframe },
        cancelled: cancelled.iframe,
        removed: removed.status,
        after: { iframe: after.iframe, shrank: after.content < before.content },
        sent: patches.length,
      }).toEqual({
        before: Math.max(320, before.content),
        during: { drops: ['preview:after n_z0'], grew: true },
        cancelled: before.iframe,
        removed: 200,
        after: { iframe: Math.max(320, after.content), shrank: true },
        sent: 0,
      })
    } finally {
      await close()
    }
  })

  it('끄는 중 bob 이 맨 위에 노드를 넣으면 미리보기가 새 문서 위에 다시 선다', async () => {
    const P = await fixture('pv-remote')
    const { page, close } = await openEditor(P)
    try {
      const into = await spotIn(page, 'n_empt', 0.5, 0.5)
      await grabCard(page, 'Divider')
      await page.mouse.move(into.x, into.y, { steps: 8 })
      const armed = (await shownDrops(page)).map((d) => `${d.kind}:${d.at}`)
      const bob = await stack.login(stack.users.bob)
      const head = (await stack.request(bob, 'GET', P)).body.headSeq as number
      const added = await stack.request(bob, 'PATCH', `${P}/ops`, {
        baseSeq: head,
        ops: [{ op: 'add', path: '/root/children/0', value: { id: 'n_bob', type: 'Text', props: { content: 'bob 의 글' } } }],
      })
      // 기다림은 값으로 끝낸다 — 안 서면 아래 단언이 `bob: 0` 으로 죽는다(시간 초과가 아니라).
      await poll(
        'bob 의 글이 캔버스에',
        async () => (await nodeLook(page, 'n_bob')).count,
        (n) => n > 0,
      ).catch(() => 0)
      await page.waitForTimeout(200)
      // 포인터를 지금 빈 카드 위로 옮긴다 — bob 의 글이 위에 서서 빈 카드가 밀렸다.
      const now = await spotIn(page, 'n_empt', 0.5, 0.5)
      await page.mouse.move(now.x, now.y, { steps: 4 })
      const again = {
        drops: (await shownDrops(page)).map((d) => `${d.kind}:${d.at}`),
        bob: (await nodeLook(page, 'n_bob')).count,
        previews: (await previewLook(page))?.count ?? 0,
      }
      await page.keyboard.press('Escape')
      await page.mouse.up()
      expect({ armed, added: added.status, again }).toEqual({
        armed: ['preview:n_empt@0'],
        added: 200,
        again: { drops: ['preview:n_empt@0'], bob: 1, previews: 1 },
      })
    } finally {
      await close()
    }
  })
})
