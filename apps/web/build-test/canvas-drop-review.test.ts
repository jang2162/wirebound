/**
 * **D1 리뷰의 실브라우저 판** — 놓은 자리가 보인 자리인가(`src/drag/use-placement.ts` 머리말 «보인 자리에만 놓는다»)를 무작위 끌기의
 * 오라클과 두 클라이언트 판으로 잰다. 보고 `docs/superpowers/plans/2026-10-01-d1-review.md`. 손잡이 · 판정의 기본 판은
 * `./canvas-drop.test.ts` 가 갖는다.
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 무작위 끌기(오라클) | 뗀 순간의 표시를 **기하로** 노드에 대어 읽은 자리(부모 · 이웃)가 서버 문서와 다르다 · 표시가 포인터 밑 노드가 아니다 · 선이 포인터에서 먼 쪽 가장자리다 |
 * | 위 노드가 길어져 표시한 노드가 밀림 | 표시가 옛 좌표에 남는다 · 놓으면 보인 자리도 «편집 0» 도 아닌 자리로 간다 |
 * | 아래 다른 노드의 글 고침 · 내 앞 편집의 리베이스 | 남의 무관한 편집에 표시가 걷히거나 놓기가 버려진다(위 빨강을 «문서가 바뀌면 버린다» 로 닫는 고침이 여기서 죽는다) |
 * | 구조 트리 줄 끌기 — 보인 줄의 노드를 지움 · 줄이 밀림 | 보인 줄이 아닌 줄의 띠로 간다(C 의 원래 길 — 경로 층을 안 지난다) |
 * | 구조 트리 줄 끌기 — 보인 «안» 카드의 자식을 남이 지움 | 보인 자리(그 카드 끝)가 그대로인데 놓기가 버려진다 |
 * | «안» 표시(그리드 빈 칸) · 남이 그 상자 첫 자리에 넣음 | 포인터 밑이 그대로 빈 칸인데 표시가 걷히거나 놓기가 버려진다 |
 * | 남의 잠금이 끄는 중 닿음 · 끄는 중 viewer 로 강등 | 손잡이 · 표시가 남는다 · 편집이 나간다 |
 * | 손잡이와 번호 마커가 겹친 자리 · 더블클릭 · 오른쪽 단추 | 겹친 자리 누름이 손잡이가 아닌 것에 간다 · 편집이 나간다 · 고른 노드가 풀린다 |
 *
 * **오라클은 구현의 환산을 안 쓴다** — 노드 상자는 iframe 요소의 그려진 배율(`getBoundingClientRect().width / offsetWidth`)로 주 창에
 * 옮기고(`canvasHitAt` 의 `frameToHost` · 스토어의 줌 값을 안 읽는다), 표시는 `.wb-shell-drop-indicator` 의 상자 · `data-placement` 만 읽는다.
 * 기대 자리는 «끈 노드가 그 노드의 바로 앞 · 바로 뒤 형제 · 그 노드의 마지막 자식» 이라는 이웃 관계로 서버 문서에서 본다 — 차례 셈을
 * 다시 짓지 않는다. 표시 상자에 맞는 노드가 여럿이면(맞닿은 형제의 경계) 하나라도 맞으면 맞다.
 */
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canvasFrame, editorStackPrerequisite, poll, startEditorStack, type EditorStack, type Session } from './editor-stack'
import { putTheme } from './theme-fixtures'

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
interface Doc {
  id: string
  type?: string
  children?: Doc[]
}
interface Indicator {
  placement: string | null
  axis: string | null
  rect: Box
}

const text = (id: string, content: string): SeedNode => ({ id, type: 'Text', props: { content } })

/** 시드를 준 의사 난수(mulberry32) — 같은 시드면 같은 끌기 차례다. */
function seeded(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe.skipIf(!전제.ok)('D1 리뷰 — 놓은 자리 = 보인 자리 · 손잡이 — 실브라우저', () => {
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
    expect(before.listeningPorts.length).toBeGreaterThanOrEqual(2)
    expect(before.databases).toBe(1)
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  })

  const call = (m: string, p: string, b?: unknown) => stack.request(alice, m, p, b)

  /** 프로젝트 · 메뉴 · 페이지 하나에 문서를 싣는다. bob 은 `bobRole`. `theme` 을 주면 그 시스템 테마 `1.0.0`. */
  async function fixture(slug: string, nodes: SeedNode[], options: { theme?: string; bobRole?: string } = {}): Promise<{ P: string; projectId: string }> {
    const project = (await call('POST', '/projects', { name: 'D1 리뷰', slug: `${slug}-${Date.now().toString(36)}` })).body
    const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '가' })).body
    const member = await call('POST', `/projects/${project.id}/members`, { email: stack.users.bob.email, role: options.bobRole ?? 'editor' })
    if (member.status >= 300) throw new Error(`member ${member.status}`)
    if (options.theme !== undefined) await putTheme(call, project.id, { themeId: `system-${options.theme}`, version: '1.0.0', tokens: {} })
    const pageId = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '쪽' })).body.id
    const P = `/projects/${project.id}/pages/${pageId}`
    const seededOps = await call('PATCH', `${P}/ops`, { baseSeq: 0, ops: nodes.map((value, at) => ({ op: 'add', path: `/root/children/${at}`, value })) })
    if (seededOps.status >= 300) throw new Error(`seed ${seededOps.status} ${JSON.stringify(seededOps.body)}`)
    return { P, projectId: project.id }
  }

  const serverRoot = async (P: string): Promise<Doc> => (await stack.request(alice, 'GET', P)).body.schema.root as Doc

  /** 서버 문서의 모양 — 뿌리 id 는 서버가 짓는다(`ROOT`). */
  const shapeOf = (node: Doc, root = true): unknown =>
    node.children !== undefined && node.children.length > 0
      ? { [root ? 'ROOT' : node.id]: node.children.map((child) => shapeOf(child, false)) }
      : node.id
  const shape = async (P: string): Promise<unknown> => shapeOf(await serverRoot(P))

  async function bobOps(P: string, ops: unknown[]): Promise<number> {
    const head = (await stack.request(bob, 'GET', P)).body.headSeq as number
    return (await stack.request(bob, 'PATCH', `${P}/ops`, { baseSeq: head, ops })).status
  }

  async function openTab(P: string, user: 'alice' | 'bob' = 'alice', origin?: string) {
    const { context, page } = await stack.openTab(stack.users[user], { viewport: { width: 1440, height: 900 }, ...(origin === undefined ? {} : { origin }) })
    const patches: string[] = []
    /** 받은 프레임의 종류(`patch-error` · `patch-ack` …) — 리베이스가 섰는지의 카나리아. */
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
    await canvasFrame(page).locator('[data-wb-id]').first().waitFor()
    return { page, patches, received, close: () => context.close() }
  }

  const treeRow = (page: Page, id: string) => page.locator(`.wb-shell-region[aria-label="구조 트리"] [data-tree-row][data-tree-id="${id}"]`)
  /** 구조 트리 줄로 고른다 — 캔버스 가운데를 누르면 자식이 골린다. */
  const select = (page: Page, id: string) => treeRow(page, id).locator('button').first().click()
  const handle = (page: Page) => page.locator('.wb-shell-canvas-handle')

  async function indicators(page: Page): Promise<Indicator[]> {
    return page.locator('.wb-shell-drop-indicator').evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect()
        return { placement: el.getAttribute('data-placement'), axis: el.getAttribute('data-axis'), rect: { x: r.x, y: r.y, width: r.width, height: r.height } }
      }),
    )
  }

  async function nodeBox(page: Page, id: string): Promise<Box> {
    const box = await canvasFrame(page).locator(`[data-wb-id="${id}"]`).boundingBox()
    if (box === null) throw new Error(`캔버스에 ${id} 상자가 없다`)
    return box
  }

  /** 고른 노드의 손잡이를 쥐고 문턱을 넘긴 뒤 `at` 으로 간다. */
  async function grabTo(page: Page, at: { x: number; y: number }): Promise<void> {
    const box = await handle(page).boundingBox()
    if (box === null) throw new Error('손잡이가 없다')
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 3, box.y + box.height / 2 + 6, { steps: 3 })
    await page.mouse.move(at.x, at.y, { steps: 10 })
    await page.waitForTimeout(60)
  }

  /** 문서 노드 상자 — 주 창 좌표. 배율은 iframe 의 그려진 폭 ÷ 레이아웃 폭(머리말 «오라클은 구현의 환산을 안 쓴다»). */
  async function nodeBoxes(page: Page, ids: readonly string[]): Promise<Record<string, Box>> {
    const iframe = (await page.$('iframe.wb-shell-canvas-iframe'))!
    const outer = await iframe.evaluate((el) => {
      const r = el.getBoundingClientRect()
      return { x: r.x, y: r.y, scale: r.width / (el as HTMLElement).offsetWidth }
    })
    const inner: Record<string, Box> = await (await iframe.contentFrame())!.evaluate((wanted) => {
      const out: Record<string, { x: number; y: number; width: number; height: number }> = {}
      for (const el of Array.from(document.querySelectorAll('[data-wb-id]'))) {
        const id = el.getAttribute('data-wb-id')!
        if (!wanted.includes(id) || out[id] !== undefined) continue
        const r = el.getBoundingClientRect()
        out[id] = { x: r.x, y: r.y, width: r.width, height: r.height }
      }
      return out
    }, ids as string[])
    return Object.fromEntries(
      Object.entries(inner).map(([id, r]) => [
        id,
        { x: outer.x + r.x * outer.scale, y: outer.y + r.y * outer.scale, width: r.width * outer.scale, height: r.height * outer.scale },
      ]),
    )
  }

  describe('무작위 끌기 — 오라클', () => {
    /**
     * 가로 배치를 고루 싣는다: 줄바꿈된 flex(`n_flex`) · 그리드 둘째 줄 첫 칸(`n_g3`) · 가로 안의 세로(`n_row` > `n_rcol`) · 검색폼 필드 줄.
     * `n_row` 는 iframe 에 `row-reverse` 를 덧입혀 뒤집힌 배치를 세운다 — 시스템 테마 다섯에는 노드를 늘어놓는 `row-reverse` 상자가 없다
     * (`./canvas-drop.test.ts` 의 «시스템 테마 다섯의 가로 배치» 머리말).
     */
    const DOC: SeedNode[] = [
      text('n_a', '첫 글'),
      { id: 'n_flex', type: 'Flex', props: { direction: 'row', wrap: true }, children: Array.from({ length: 7 }, (_, i) => text(`n_x${i}`, `가로 무리의 꽤 긴 글 조각 ${i} 입니다`)) },
      { id: 'n_grid', type: 'Grid', props: { columns: 3 }, children: Array.from({ length: 5 }, (_, i) => text(`n_g${i}`, `칸 ${i}`)) },
      {
        id: 'n_card',
        type: 'Card',
        props: { title: '바깥 카드' },
        children: [
          { id: 'n_col', type: 'Flex', props: { direction: 'column' }, children: [text('n_c0', '세로 하나'), text('n_c1', '세로 둘')] },
          {
            id: 'n_row',
            type: 'Flex',
            props: { direction: 'row' },
            children: [
              { id: 'n_in', type: 'Card', props: { title: '가로 안 카드' }, children: [text('n_i0', '안 하나'), text('n_i1', '안 둘')] },
              text('n_r1', '가로 곁'),
              { id: 'n_rcol', type: 'Flex', props: { direction: 'column' }, children: [text('n_rc0', '곁 세로 하나'), text('n_rc1', '곁 세로 둘')] },
            ],
          },
        ],
      },
      { id: 'n_form', type: 'SearchForm', children: ['이름', '상태', '날짜'].map((label, i) => ({ id: `n_f${i}`, type: 'Field', props: { label } })) },
      { id: 'n_sec', type: 'Section', children: [text('n_s0', '영역 글')] },
      { id: 'n_empty', type: 'Card', props: { title: '빈 카드' } },
      { id: 'n_tabs', type: 'Tabs', children: [text('n_tb0', '탭 글')] },
      ...Array.from({ length: 6 }, (_, i) => text(`n_z${i}`, `끝 글 ${i}`)),
    ]
    const REVERSE = '[data-wb-id="n_row"]{flex-direction:row-reverse !important}'
    const THEMES = ['admin', 'commerce', 'docs', 'portal', 'saas-marketing'] as const
    const TRIALS = 3

    function locate(root: Doc, id: string): { parent: Doc | null; index: number } | null {
      const visit = (node: Doc, parent: Doc | null, index: number): { parent: Doc | null; index: number } | null => {
        if (node.id === id) return { parent, index }
        for (const [i, child] of (node.children ?? []).entries()) {
          const found = visit(child, node, i)
          if (found !== null) return found
        }
        return null
      }
      return visit(root, null, -1)
    }
    const ids = (root: Doc): string[] => [root.id, ...(root.children ?? []).flatMap(ids)]

    /** 표시 → 그 표시가 가리키는 노드 · 관계(기하로만). */
    function pointedAt(indicator: Indicator, boxes: Record<string, Box>, rootId: string): { id: string; rel: string; edge?: 'start' | 'end' }[] {
      const near = (a: number, b: number) => Math.abs(a - b) <= 1.5
      const out: { id: string; rel: string; edge?: 'start' | 'end' }[] = []
      const { rect } = indicator
      for (const [id, b] of Object.entries(boxes)) {
        if (indicator.placement === 'inside') {
          if (near(rect.x, b.x) && near(rect.y, b.y) && near(rect.width, b.width) && near(rect.height, b.height)) out.push({ id, rel: 'inside' })
          continue
        }
        if (id === rootId || indicator.placement === null) continue
        const x = indicator.axis === 'x'
        if (x ? !near(rect.y, b.y) || !near(rect.height, b.height) : !near(rect.x, b.x) || !near(rect.width, b.width)) continue
        const edge = x ? rect.x + rect.width / 2 : rect.y + rect.height / 2
        const [lo, hi] = x ? [b.x, b.x + b.width] : [b.y, b.y + b.height]
        if (near(edge, lo)) out.push({ id, rel: indicator.placement, edge: 'start' })
        else if (near(edge, hi)) out.push({ id, rel: indicator.placement, edge: 'end' })
      }
      return out
    }

    function stands(root: Doc, moved: string, at: { id: string; rel: string }): boolean {
      const m = locate(root, moved)
      if (m === null || m.parent === null) return false
      if (at.rel === 'inside') return m.parent.id === at.id && m.index === (m.parent.children ?? []).length - 1
      const o = locate(root, at.id)
      if (o === null || o.parent === null || o.parent.id !== m.parent.id) return false
      return at.rel === 'before' ? m.index === o.index - 1 : m.index === o.index + 1
    }

    it('다섯 테마 × 줌 셋 · 칸을 민 판 · 뒤집힌 가로 무리에서 뗀 순간의 표시가 가리킨 자리가 서버 문서의 자리다', async () => {
      const rand = seeded(7)
      const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!
      const wrong: unknown[] = []
      const count = { trials: 0, shown: 0, none: 0, x: 0, inside: 0, reversed: 0, scrolled: 0 }
      for (const theme of THEMES) {
        const { P } = await fixture(`oracle-${theme}`, DOC, { theme })
        const { page, patches, close } = await openTab(P)
        try {
          const frame = (await (await page.$('iframe.wb-shell-canvas-iframe'))!.contentFrame())!
          await frame.evaluate((css) => {
            const style = document.createElement('style')
            style.textContent = css
            document.head.appendChild(style)
          }, REVERSE)
          const pane = await page.evaluate(() => {
            const r = document.querySelector('.wb-shell-canvas')!.getBoundingClientRect()
            return { x: r.x, y: r.y, width: r.width, height: r.height }
          })
          for (const zoom of [0.5, 1, 1.5]) {
            const group = page.getByRole('group', { name: '줌' })
            for (let step = 0; step < 12; step += 1) {
              const now = Number((await group.locator('.wb-shell-zoom-value').textContent())?.replace('%', '')) / 100
              if (Math.abs(now - zoom) < 0.01) break
              await group.getByRole('button', { name: now < zoom ? '확대' : '축소', exact: true }).click()
            }
            for (let trial = 0; trial < TRIALS; trial += 1) {
              const before = await serverRoot(P)
              const all = ids(before)
              const moved = pick(all.filter((id) => id !== before.id))
              await select(page, moved)
              await handle(page).waitFor()
              // 손잡이가 칸 위 끝에서 80 + 0..200px 아래에 서게 민다(칸 끝 24px 의 끝 스크롤에 안 걸리게).
              await page.evaluate((extra) => {
                const canvas = document.querySelector('.wb-shell-canvas') as HTMLElement
                const h = document.querySelector('.wb-shell-canvas-handle')!.getBoundingClientRect()
                canvas.scrollTop += h.top - canvas.getBoundingClientRect().top - 80 - extra
                canvas.scrollLeft += Math.min(0, h.left - canvas.getBoundingClientRect().left - 20)
              }, Math.floor(rand() * 200))
              const boxes = await nodeBoxes(page, all)
              const inPane = (p: { x: number; y: number }) =>
                p.x > pane.x + 4 && p.x < pane.x + pane.width - 4 && p.y > pane.y + 40 && p.y < pane.y + pane.height - 40
              // 대상 — 절반 남짓은 무작위 노드(뒤집힌 무리의 자식을 더 자주)의 무작위 자리, 나머지는 칸 안 무작위 점.
              const rowChildren = all.filter((id) => locate(before, id)?.parent?.id === 'n_row')
              let target: { x: number; y: number } | null = null
              for (let tries = 0; tries < 40 && target === null; tries += 1) {
                const roll = rand()
                const id = roll < 0.3 && rowChildren.length > 0 ? pick(rowChildren) : roll < 0.7 ? pick(all) : null
                const b = id === null ? null : boxes[id]
                const p = b === null || b === undefined
                  ? { x: pane.x + rand() * pane.width, y: pane.y + rand() * pane.height }
                  : { x: b.x + b.width * (0.02 + rand() * 0.96), y: b.y + b.height * (0.02 + rand() * 0.96) }
                if (inPane(p)) target = p
              }
              if (target === null) continue
              count.trials += 1
              if (await page.evaluate(() => (document.querySelector('.wb-shell-canvas') as HTMLElement).scrollTop > 0)) count.scrolled += 1
              const sentBefore = patches.length
              await grabTo(page, target)
              const shown = await indicators(page)
              const atRelease = await nodeBoxes(page, all)
              await page.mouse.up()
              if (shown.length === 0) {
                count.none += 1
                await page.waitForTimeout(300)
                if (patches.length !== sentBefore) wrong.push({ theme, zoom, trial, moved, kind: '표시 없이 편집이 나갔다' })
                continue
              }
              count.shown += 1
              const indicator = shown[0]!
              if (indicator.axis === 'x') count.x += 1
              if (indicator.placement === 'inside') count.inside += 1
              const points = pointedAt(indicator, atRelease, before.id)
              const reversed = await frame.evaluate((id) => {
                const parent = document.querySelector(`[data-wb-id="${id}"]`)?.parentElement
                return parent !== null && parent !== undefined && getComputedStyle(parent).flexDirection.endsWith('-reverse')
              }, points[0]?.id ?? '')
              if (reversed && indicator.placement !== 'inside') count.reversed += 1
              const ptr = target
              const fits = points.filter((p) => {
                const b = atRelease[p.id]!
                const inside = ptr.x >= b.x - 1 && ptr.x <= b.x + b.width + 1 && ptr.y >= b.y - 1 && ptr.y <= b.y + b.height + 1
                if (p.edge === undefined) return inside || p.id === before.id
                // 선은 포인터에 가까운 쪽 가장자리다.
                const x = indicator.axis === 'x'
                const [lo, hi] = x ? [Math.abs(ptr.x - b.x), Math.abs(ptr.x - b.x - b.width)] : [Math.abs(ptr.y - b.y), Math.abs(ptr.y - b.y - b.height)]
                return inside && (p.edge === 'start' ? lo <= hi : hi <= lo)
              })
              let after: Doc
              try {
                after = await poll('서버 문서', () => serverRoot(P), (r) => JSON.stringify(r) !== JSON.stringify(before), 4000)
              } catch {
                wrong.push({ theme, zoom, trial, moved, indicator, kind: '표시가 섰는데 편집이 없다' })
                continue
              }
              if (fits.length === 0 || !fits.some((p) => stands(after, moved, p))) {
                wrong.push({ theme, zoom, trial, moved, target, indicator, points, fits, placed: locate(after, moved) && { parent: locate(after, moved)!.parent!.id, index: locate(after, moved)!.index } })
              }
            }
          }
        } finally {
          await close()
        }
      }
      // 판의 수 하한(카나리아) — 아무것도 안 잰 판이 «어긋남 0» 으로 초록이 되지 않게.
      expect({
        wrong,
        enough: count.trials >= 40 && count.shown >= 25 && count.x >= 4 && count.inside >= 4 && count.reversed >= 1 && count.scrolled >= 10,
      }, JSON.stringify(count)).toEqual({ wrong: [], enough: true })
    })
  })

  describe('끄는 중 남의 다른 편집', () => {
    const LONG = '아주 긴 글 '.repeat(120)
    /**
     * ```
     * Page
     * ├ Text n_top '위 글'
     * ├ Card n_card { n_k0 · n_k1 }
     * ├ Text n_mid   ← 표시를 세울 자리(앞)
     * ├ Card n_empt(빈)
     * ├ Text n_t0 · n_t1 · n_t2
     * ├ Text n_t3    ← 끄는 노드
     * └ Text n_end
     * ```
     */
    const DOC: SeedNode[] = [
      text('n_top', '위 글'),
      { id: 'n_card', type: 'Card', props: { title: '카드' }, children: [text('n_k0', '카드 하나'), text('n_k1', '카드 둘')] },
      text('n_mid', '가운데'),
      { id: 'n_empt', type: 'Card', props: { title: '빈 카드' } },
      text('n_t0', '아래 영'),
      text('n_t1', '아래 하나'),
      text('n_t2', '아래 둘'),
      text('n_t3', '옮길 글'),
      text('n_end', '끝'),
    ]
    const ORIGINAL = { ROOT: ['n_top', { n_card: ['n_k0', 'n_k1'] }, 'n_mid', 'n_empt', 'n_t0', 'n_t1', 'n_t2', 'n_t3', 'n_end'] }
    const BEFORE_MID = { ROOT: ['n_top', { n_card: ['n_k0', 'n_k1'] }, 'n_t3', 'n_mid', 'n_empt', 'n_t0', 'n_t1', 'n_t2', 'n_end'] }

    /** alice 가 n_t3 를 쥐고 n_mid 위쪽 띠(«앞» 선)를 세운 판. */
    async function armedBeforeMid(P: string, origin?: string) {
      const tab = await openTab(P, 'alice', origin)
      await select(tab.page, 'n_t3')
      await handle(tab.page).waitFor()
      const mid = await nodeBox(tab.page, 'n_mid')
      const at = { x: mid.x + mid.width * 0.3, y: mid.y + mid.height * 0.1 }
      await grabTo(tab.page, at)
      return { ...tab, at, armed: (await indicators(tab.page)).map((h) => `${h.placement}:${h.axis}`) }
    }

    /**
     * 표시는 «n_mid 앞» 인데 bob 이 위 노드의 글을 길게 고쳐(구조는 그대로) n_mid 가 112px 밀린다. 보인 자리의 판정(`live` 의 `holds`)은
     * 구조로 보아 그대로 «선다» — 옛 판은 표시가 옛 좌표에 남고, 떼면 끌기 장치가 뗀 좌표로 다시 물어 그 좌표에 지금 있는 카드 안으로
     * 보냈다(리뷰 R1). 기대: 캔버스가 다시 잰 뒤 표시가 걷히고(`src/drag/use-pointer-drag.ts` 머리말 «놓는 답은 보인 답이다» 의 `refresh`)
     * 놓은 자리가 보인 자리(n_mid 앞)거나 편집 0.
     */
    it('bob 이 위 노드의 글을 길게 고쳐 표시한 노드가 밀리면 표시가 걷히고 놓은 자리가 보인 자리거나 편집 0 이다', async () => {
      const { P } = await fixture('taller-above', DOC)
      const { page, close, armed } = await armedBeforeMid(P)
      try {
        const midBefore = (await nodeBox(page, 'n_mid')).y
        const status = await bobOps(P, [{ op: 'replace', path: '/root/children/0/props/content', value: LONG }])
        await poll('alice 캔버스에서 n_mid 가 밀린다', async () => (await nodeBox(page, 'n_mid')).y, (y) => y > midBefore + 40)
        await page.waitForTimeout(100)
        const afterShift = (await indicators(page)).map((h) => `${h.placement}:${h.axis}@${Math.round(h.rect.y)}`)
        await page.mouse.up()
        await page.waitForTimeout(800)
        const final = await shape(P)
        expect({ armed, status, afterShift }).toEqual({ armed: ['before:y'], status: 200, afterShift: [] })
        expect([ORIGINAL, BEFORE_MID]).toContainEqual(final)
      } finally {
        await close()
      }
    })

    /** 대조군 — 표시한 자리를 안 미는 남의 편집(아래 노드의 글)에는 표시가 남고 보인 자리에 선다. */
    it('bob 이 아래 다른 노드의 글을 고쳐도 표시가 남고 놓으면 보인 자리에 선다', async () => {
      const { P } = await fixture('prop-below', DOC)
      const { page, close, armed } = await armedBeforeMid(P)
      try {
        const status = await bobOps(P, [{ op: 'replace', path: '/root/children/4/props/content', value: '아래 영 고침' }])
        await canvasFrame(page).locator('[data-wb-id="n_t0"]', { hasText: '아래 영 고침' }).waitFor()
        const stillShown = (await indicators(page)).map((h) => `${h.placement}:${h.axis}`)
        await page.mouse.up()
        // 바뀔 때까지만 기다리고 자리는 값으로 견준다 — 놓기가 버려진 판이 시간 초과가 아니라 값으로 죽게.
        const final = await poll('서버 문서', () => shape(P), (s) => JSON.stringify(s) !== JSON.stringify(ORIGINAL), 3000).catch(() => shape(P))
        expect({ armed, status, stillShown, final }).toEqual({ armed: ['before:y'], status: 200, stillShown: ['before:y'], final: BEFORE_MID })
      } finally {
        await close()
      }
    })

    /**
     * 대조군 — 끄는 중 내 앞 편집이 리베이스된다(WS 올림을 1.5s 늦춰 bob 의 REST 편집이 먼저 커밋 → `patch-error` → 리베이스 · 다시 보냄).
     * 둘째 끌기의 표시를 세운 **뒤에** `patch-error` 가 닿는다(`rebasedWhileHeld` — 앞에 닿으면 이 판은 리베이스를 안 잰다). 리베이스는
     * 구조를 안 바꾸므로 표시가 남고 보인 자리에 선다.
     */
    it('끄는 중 내 앞 편집이 리베이스돼도 표시가 남고 놓으면 보인 자리에 선다', async () => {
      const { P } = await fixture('rebase', DOC)
      const delay = await stack.startWsDelay(1500)
      const tab = await openTab(P, 'alice', delay.origin)
      const { received } = tab
      try {
        await tab.page.waitForTimeout(2000)
        // 편집 1 — n_t2 를 n_mid 앞으로. 올림이 늦어 서버에 닿기 전에 아래가 다 선다.
        await select(tab.page, 'n_t2')
        await handle(tab.page).waitFor()
        const mid = await nodeBox(tab.page, 'n_mid')
        await grabTo(tab.page, { x: mid.x + mid.width * 0.3, y: mid.y + mid.height * 0.1 })
        await tab.page.mouse.up()
        // 편집 2 — n_t3 를 n_t0 앞으로 세운 채 멈춘다.
        await select(tab.page, 'n_t3')
        await handle(tab.page).waitFor()
        const t0 = await nodeBox(tab.page, 'n_t0')
        await grabTo(tab.page, { x: t0.x + t0.width * 0.3, y: t0.y + t0.height * 0.1 })
        const armed = (await indicators(tab.page)).map((h) => `${h.placement}:${h.axis}`)
        // bob 이 편집 1 보다 먼저 커밋한다 — 편집 1 은 `patch-error` 를 받고 리베이스돼 다시 나간다.
        const status = await bobOps(P, [{ op: 'replace', path: '/root/children/4/props/content', value: '아래 영!' }])
        const errorsAtArm = received.filter((k) => k === 'patch-error').length
        await poll('리베이스 뒤 다시 보낸 편집의 답', async () => received.filter((k) => k === 'patch-ack').length, (n) => n >= 1, 12000)
        const stillShown = (await indicators(tab.page)).map((h) => `${h.placement}:${h.axis}`)
        await tab.page.mouse.up()
        const final = await poll('서버 문서', () => shape(P), (s) => JSON.stringify(s).includes('"n_t3","n_t0"'), 8000).catch(() => shape(P))
        expect({ status, rebasedWhileHeld: errorsAtArm === 0 && received.includes('patch-error'), armed, stillShown, final }).toEqual({
          status: 200,
          rebasedWhileHeld: true,
          armed: ['before:y'],
          stillShown: ['before:y'],
          final: { ROOT: ['n_top', { n_card: ['n_k0', 'n_k1'] }, 'n_t2', 'n_mid', 'n_empt', 'n_t3', 'n_t0', 'n_t1', 'n_end'] },
        })
      } finally {
        await tab.close()
        await delay.close()
      }
    })

    /**
     * **원래 있던 길(C)** — 구조 트리 줄 끌기는 경로 층을 안 지난다(`src/drag/use-placement.ts` 머리말 «트리 줄 끌기를 이 층으로 옮기지
     * 않는다»). 옛 판은 끌기 장치가 뗀 좌표로 다시 물어 그 좌표에 지금 있는 줄의 띠로 놓았다(리뷰 R2). 지금은 다시 물은 답이 보인 답과
     * 다르면 놓지 않는다(`src/panels/structure-tree.tsx` 의 `sameDrop`). 표시는 옛 줄 상자에 남는다 — 이 케이스는 표시를 안 잰다.
     * «안» 카드에 세운 채 그 카드의 자식이 줄어도 그대로 그 카드 끝에 놓이는 판은 아래 «보인 «안» 카드의 자식을 남이 지워도».
     */
    describe('구조 트리 줄 끌기', () => {
      async function armedOnRow(P: string, overId: string, fy: number) {
        const tab = await openTab(P)
        await select(tab.page, 'n_t3')
        const source = (await treeRow(tab.page, 'n_t3').boundingBox())!
        await tab.page.mouse.move(source.x + 30, source.y + source.height / 2)
        await tab.page.mouse.down()
        await tab.page.mouse.move(source.x + 33, source.y + source.height / 2 + 6, { steps: 3 })
        const over = (await treeRow(tab.page, overId).boundingBox())!
        await tab.page.mouse.move(over.x + 30, over.y + over.height * fy, { steps: 8 })
        await tab.page.waitForTimeout(60)
        return { ...tab, armed: (await indicators(tab.page)).map((h) => h.placement) }
      }

      it('bob 이 보인 줄의 노드를 지우면 놓아도 편집 0 이다', async () => {
        const { P } = await fixture('tree-removed', DOC)
        const { page, close, armed } = await armedOnRow(P, 'n_empt', 0.5)
        try {
          const status = await bobOps(P, [{ op: 'remove', path: '/root/children/3' }])
          await treeRow(page, 'n_empt').waitFor({ state: 'detached' })
          await page.mouse.up()
          await page.waitForTimeout(800)
          expect({ armed, status }).toEqual({ armed: ['inside'], status: 200 })
          expect(await shape(P)).toEqual({ ROOT: ['n_top', { n_card: ['n_k0', 'n_k1'] }, 'n_mid', 'n_t0', 'n_t1', 'n_t2', 'n_t3', 'n_end'] })
        } finally {
          await close()
        }
      })

      it('bob 이 뿌리 첫 자리에 넣어 줄이 밀리면 놓은 자리가 보인 자리거나 편집 0 이다', async () => {
        const { P } = await fixture('tree-shifted', DOC)
        const { page, close, armed } = await armedOnRow(P, 'n_mid', 0.15)
        try {
          const status = await bobOps(P, [{ op: 'add', path: '/root/children/0', value: { id: 'n_bob', type: 'Text', props: { content: 'bob' } } }])
          await treeRow(page, 'n_bob').waitFor({ state: 'attached' })
          await page.mouse.up()
          await page.waitForTimeout(800)
          expect({ armed, status }).toEqual({ armed: ['before'], status: 200 })
          expect([
            { ROOT: ['n_bob', 'n_top', { n_card: ['n_k0', 'n_k1'] }, 'n_mid', 'n_empt', 'n_t0', 'n_t1', 'n_t2', 'n_t3', 'n_end'] },
            { ROOT: ['n_bob', 'n_top', { n_card: ['n_k0', 'n_k1'] }, 'n_t3', 'n_mid', 'n_empt', 'n_t0', 'n_t1', 'n_t2', 'n_end'] },
          ]).toContainEqual(await shape(P))
        } finally {
          await close()
        }
      })

      /** 리뷰 «3» 의 넷째 줄 — 보인 줄(카드)이 그 자리에 그대로면 다시 물은 답도 «그 카드 안» 이라 놓인다(놓기를 버리지 않는다). */
      it('보인 «안» 카드의 자식을 남이 지워도 놓으면 그 카드 끝이다', async () => {
        const { P } = await fixture('tree-inside-shrunk', DOC)
        const { page, close, armed } = await armedOnRow(P, 'n_card', 0.5)
        try {
          const status = await bobOps(P, [{ op: 'remove', path: '/root/children/1/children/1' }])
          await treeRow(page, 'n_k1').waitFor({ state: 'detached' })
          await page.mouse.up()
          const final = await poll('서버 문서', () => shape(P), (s) => JSON.stringify(s).includes('n_t3"]'), 3000).catch(() => shape(P))
          expect({ armed, status, final }).toEqual({
            armed: ['inside'],
            status: 200,
            final: { ROOT: ['n_top', { n_card: ['n_k0', 'n_t3'] }, 'n_mid', 'n_empt', 'n_t0', 'n_t1', 'n_t2', 'n_end'] },
          })
        } finally {
          await close()
        }
      })
    })
  })

  /**
   * **«안» 표시의 뜻은 «그 상자 안 끝»** — 남이 그 상자에 자식을 넣어도 같은 자리다(`src/edit/structure-drop.ts` 의 `sameDrop` 표 «안»). 옛
   * 판은 보인 자리 다시 판정이 «안» 의 차례(자식 수)까지 견줘 표시가 걷히고 그대로 떼면 편집 0 이었다(리뷰 R3 — 거짓 취소).
   *
   * **못 재는 것 — 넣은 칸이 포인터 밑으로 밀려 오는 판.** 둘째 칸(넣은 뒤 n_g0 가 오는 칸)에 세우면 포인터 밑이 «n_g0 뒤» 로 바뀌어 캔버스가
   * 다시 잴 때 표시가 걷히고 그대로 떼면 편집 0 이다(문서로는 같은 «그리드 끝» 이지만 보인 표시와 다른 자리라 놓지 않는다 — 6px 움직이면
   * `after:x` 가 서고 그리드 끝으로 놓인다). 이월로 남긴다(`docs/superpowers/plans/2026-10-01-d1-fix-report.md` «R3»).
   */
  describe('«안» 표시 — 남이 그 상자에 넣어도', () => {
    /** 3열 그리드에 칸 하나(n_g0) — 둘째 · 셋째 칸이 빈 자리다. */
    const DOC: SeedNode[] = [
      text('n_top', '위 글'),
      { id: 'n_grid', type: 'Grid', props: { columns: 3 }, children: [text('n_g0', '칸 영')] },
      text('n_t3', '옮길 글'),
      text('n_end', '끝'),
    ]

    /**
     * 그리드 `col` 번째 칸(0 부터) 가운데에 «안» 표시를 세운 뒤 bob 이 그리드 첫 자리에 넣는다. 줌 0.5 — 1440 창의 칸(860px)에 iframe
     * (1280px)이 다 들어와야 셋째 칸이 칸 안이다.
     */
    async function armedInGrid(slug: string, col: number) {
      const { P } = await fixture(slug, DOC)
      const tab = await openTab(P)
      const group = tab.page.getByRole('group', { name: '줌' })
      for (let step = 0; step < 12; step += 1) {
        const now = Number((await group.locator('.wb-shell-zoom-value').textContent())?.replace('%', '')) / 100
        if (Math.abs(now - 0.5) < 0.01) break
        await group.getByRole('button', { name: now < 0.5 ? '확대' : '축소', exact: true }).click()
      }
      await select(tab.page, 'n_t3')
      await handle(tab.page).waitFor()
      const grid = await nodeBox(tab.page, 'n_grid')
      const g0 = await nodeBox(tab.page, 'n_g0')
      const at = { x: grid.x + (grid.width * (col + 0.5)) / 3, y: g0.y + g0.height / 2 }
      await grabTo(tab.page, at)
      const armed = (await indicators(tab.page)).map((h) => `${h.placement}:${h.axis}`)
      const status = await bobOps(P, [{ op: 'add', path: '/root/children/1/children/0', value: { id: 'n_bob', type: 'Text', props: { content: 'bob' } } }])
      await canvasFrame(tab.page).locator('[data-wb-id="n_bob"]').waitFor()
      await tab.page.waitForTimeout(150)
      const afterInsert = (await indicators(tab.page)).map((h) => `${h.placement}:${h.axis}`)
      return { ...tab, P, at, armed, status, afterInsert }
    }

    it('넣은 뒤에도 포인터 밑이 빈 칸이면 표시가 남고 그대로 떼면 그 상자 끝이다', async () => {
      const { page, close, P, armed, status, afterInsert } = await armedInGrid('inside-kept', 2)
      try {
        await page.mouse.up()
        const final = await poll('서버 문서', () => shape(P), (s) => JSON.stringify(s).includes('n_t3"]'), 3000).catch(() => shape(P))
        expect({ armed, status, afterInsert, final }).toEqual({
          armed: ['inside:null'],
          status: 200,
          afterInsert: ['inside:null'],
          final: { ROOT: ['n_top', { n_grid: ['n_bob', 'n_g0', 'n_t3'] }, 'n_end'] },
        })
      } finally {
        await close()
      }
    })
  })

  describe('손잡이', () => {
    const DOC: SeedNode[] = [
      { id: 'n_text', type: 'Text', props: { content: '글' }, marker: 12 },
      { id: 'n_card', type: 'Card', props: { title: '카드' }, children: [{ id: 'n_intx', type: 'Text', props: { content: '안' } }] },
      { id: 'n_empt', type: 'Card', props: { title: '빈 카드' } },
      { id: 'n_divi', type: 'Divider' },
    ]
    const ORIGINAL = { ROOT: ['n_text', { n_card: ['n_intx'] }, 'n_empt', 'n_divi'] }

    /**
     * bob 이 먼저 n_card 를 고르고 그 소식이 alice 에게 4s 늦게 닿는 사이 alice 가 n_intx 를 골라 끈다(WS 내림 지연 — 그 사이 alice 의 트리
     * 줄은 안 꺼져 있다). 소식이 닿는 순간 손잡이 · 표시가 걷히고 떼도 편집 0. 손잡이의 잠금 조건 자체는 `test/canvas/canvas-drag-handle.test.tsx`
     * «고른 뒤 남이 그 노드를 잡으면 걷힌다» 가 갖는다 — 이 판은 끄는 중에 닿는 실브라우저 판이다.
     */
    it('끄는 중 남의 잠금이 닿으면 손잡이 · 표시가 곧바로 걷히고 떼도 편집 0 이다', async () => {
      const { P } = await fixture('lock-arrives', DOC)
      const delay = await stack.startDownDelay(4000)
      const a = await openTab(P, 'alice', delay.origin)
      const b = await openTab(P, 'bob')
      try {
        await poll('alice 의 WS 가 늦춰진 채 붙는다', async () => delay.delayed(), (n) => n >= 1)
        await a.page.waitForTimeout(4500)
        await select(b.page, 'n_card')
        await select(a.page, 'n_intx')
        await handle(a.page).waitFor()
        const empty = await nodeBox(a.page, 'n_empt')
        await grabTo(a.page, { x: empty.x + empty.width / 2, y: empty.y + empty.height / 2 })
        const armed = (await indicators(a.page)).map((h) => h.placement)
        // 기다림은 «bob 의 잠금 소식이 닿았다» 까지만 — 손잡이가 걷혔는지는 그 뒤 값으로 견준다(시간 초과로 죽지 않게).
        const locksBefore = a.received.filter((kind) => kind === 'locks').length
        await poll('bob 의 잠금 소식이 alice 에게 닿는다', async () => a.received.filter((kind) => kind === 'locks').length, (n) => n > locksBefore, 8000)
        await a.page.waitForTimeout(200)
        const afterLock = { handle: await handle(a.page).count(), shown: (await indicators(a.page)).length }
        await a.page.mouse.move(empty.x + empty.width / 2 + 6, empty.y + empty.height / 2)
        await a.page.mouse.up()
        await a.page.waitForTimeout(600)
        expect({ armed, afterLock, sent: a.patches.length, doc: await shape(P) }).toEqual({
          armed: ['inside'],
          afterLock: { handle: 0, shown: 0 },
          sent: 0,
          doc: ORIGINAL,
        })
      } finally {
        await a.close()
        await b.close()
        await delay.close()
      }
    })

    it('끄는 중 viewer 로 강등되면 손잡이 · 표시가 걷히고 떼도 편집 0 이다', async () => {
      const { P, projectId } = await fixture('demoted', DOC, { bobRole: 'owner' })
      const a = await openTab(P)
      try {
        await select(a.page, 'n_text')
        await handle(a.page).waitFor()
        const empty = await nodeBox(a.page, 'n_empt')
        await grabTo(a.page, { x: empty.x + empty.width / 2, y: empty.y + empty.height / 2 })
        const armed = (await indicators(a.page)).map((h) => h.placement)
        const members = (await stack.request(bob, 'GET', `/projects/${projectId}/members`)).body as { userId: string; email: string }[]
        const aliceId = members.find((m) => m.email === stack.users.alice.email)!.userId
        const demote = (await stack.request(bob, 'PATCH', `/projects/${projectId}/members/${aliceId}`, { role: 'viewer' })).status
        // 강등 소식(`membership-changed`)이 닿은 뒤 셸이 역할을 다시 읽을 짬을 두고 값으로 견준다(시간 초과로 죽지 않게).
        await poll('강등 소식이 alice 에게 닿는다', async () => a.received.includes('membership-changed'), (got) => got, 5000)
        await a.page.waitForTimeout(1000)
        const afterDemote = { handle: await handle(a.page).count(), shown: (await indicators(a.page)).length }
        await a.page.mouse.move(empty.x + empty.width / 2 + 6, empty.y + empty.height / 2)
        await a.page.mouse.up()
        await a.page.waitForTimeout(600)
        expect({ armed, demote, afterDemote, sent: a.patches.length, doc: await shape(P) }).toEqual({
          armed: ['inside'],
          demote: 200,
          afterDemote: { handle: 0, shown: 0 },
          sent: 0,
          doc: ORIGINAL,
        })
      } finally {
        await a.close()
      }
    })

    /**
     * 손잡이(외곽선 바깥 22px · 20px)와 번호 마커(모서리 가운데 · 지름 18px+)가 노드 왼쪽 위에서 겹친다. 마커는 누름을 안 받으므로
     * (`pointer-events: none`) 겹친 자리는 손잡이가 받는다 — 누르면 편집 0 · 고른 노드 그대로. 더블클릭도 같고, 오른쪽 단추로 눌러 끌면
     * 끌기가 안 선다.
     */
    it('번호 마커와 겹친 자리 누름 · 더블클릭 · 오른쪽 단추 끌기는 편집 0 이고 고른 노드가 그대로다', async () => {
      const { P } = await fixture('handle-marker', DOC)
      const a = await openTab(P)
      try {
        await select(a.page, 'n_text')
        await handle(a.page).waitFor()
        const hb = (await handle(a.page).boundingBox())!
        const mb = (await a.page.locator('.wb-shell-marker[data-wb-marker-for="n_text"]').boundingBox())!
        const overlap = {
          x: (Math.max(hb.x, mb.x) + Math.min(hb.x + hb.width, mb.x + mb.width)) / 2,
          y: (Math.max(hb.y, mb.y) + Math.min(hb.y + hb.height, mb.y + mb.height)) / 2,
          w: Math.min(hb.x + hb.width, mb.x + mb.width) - Math.max(hb.x, mb.x),
          h: Math.min(hb.y + hb.height, mb.y + mb.height) - Math.max(hb.y, mb.y),
        }
        const hit = await a.page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.className ?? null, overlap)
        await a.page.mouse.click(overlap.x, overlap.y)
        await a.page.mouse.dblclick(hb.x + hb.width / 2, hb.y + hb.height / 2)
        await a.page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2)
        await a.page.mouse.down({ button: 'right' })
        const empty = await nodeBox(a.page, 'n_empt')
        await a.page.mouse.move(empty.x + empty.width / 2, empty.y + empty.height / 2, { steps: 8 })
        const rightShown = (await indicators(a.page)).length
        await a.page.mouse.up({ button: 'right' })
        await a.page.keyboard.press('Escape')
        await a.page.waitForTimeout(400)
        const selected = await a.page.evaluate(() => document.querySelector('.wb-shell-selection')?.getAttribute('data-wb-selected-id') ?? null)
        expect({ overlaps: overlap.w > 0 && overlap.h > 0, hit, rightShown, selected, sent: a.patches.length, doc: await shape(P) }).toEqual({
          overlaps: true,
          hit: 'wb-shell-canvas-handle',
          rightShown: 0,
          selected: 'n_text',
          sent: 0,
          doc: ORIGINAL,
        })
      } finally {
        await a.close()
      }
    })
  })
})
