/**
 * **N1 — 겹침 · 잘림 · 낮은 창 레이아웃을 실브라우저로 잰다**(`docs/superpowers/plans/2026-10-10-n1-report.md`). jsdom 은 배치 · 그려진 픽셀 · 프레임
 * 순서가 없어 아래 값을 못 잰다.
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 창 크기 표 | 판이 최소(220) 위인데 캔버스 칸이 `CANVAS_MIN_HEIGHT` 아래다 · 하단 바가 창 밖이다 · 표 밖의 칸에서 셸이 넘친다 · 24 칸의 캔버스 / 판 / 하단 바가 표와 다르다 |
 * | 낮은 줌의 선택 외곽선 | 줌 7 · 25 · 50 · 100% 에서 외곽선 위쪽 줄의 가장 진한 픽셀이 강조색에 가깝지 않다(굵기가 줌을 따라 준다) |
 * | 통지 닫기 색 | 통지 닫기 `×` 가 대화 상자 닫기와 다른 색이다 |
 * | 상호작용 «대상» 라벨 | 라벨이 두 줄 이상으로 접힌다 |
 * | 통지가 서고 걷힐 때 | 캔버스 칸 크기가 `CANVAS_MIN_HEIGHT` 와 다른 값이 한 프레임이라도 관찰자에 전달된다(판이 한 프레임 옛 높이로 그려진다) |
 * | 접힌 머리의 배율 | `…` 에 지금 배율 한 줄이 없다 · 누를 수 있다 · 줌을 바꿔도 값이 안 따라온다 |
 * | 배치 선 꼬리표 | 꼬리표가 노드의 첫 자식 상자와 겹친다 |
 * | 손잡이 | 캔버스 왼끝 노드의 손잡이가 칸에 잘린다(스크롤 0) |
 * | 뷰포트 높이 테마 | 문서 `body` 에 `min-height: 100vh` 를 걸면 캔버스 iframe 이 가만히 있어도 자란다 · 문서가 줄어도 안 준다 |
 */
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { CANVAS_MIN_HEIGHT, PALETTE_HEIGHT_FLOOR, PALETTE_HEIGHT_MIN } from '../src/shell/sidebar-layout'
import { canvasFrame, editorStackPrerequisite, startEditorStack, type EditorStack, type Session } from './editor-stack'
import { decodePng } from './png-pixels'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

const LONG_ALIAS = 'A'.repeat(60)
const NOTICE = (i: number) => `통지 ${i + 1} — 남이 이 페이지를 바꿔 화면이 낡았습니다. 다시 불러오면 서버의 판으로 돌아갑니다.`

describe.skipIf(!전제.ok)('N1 레이아웃 — 실브라우저', () => {
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

  async function fixture(slug: string, nodes: unknown[]): Promise<string> {
    const project = (await call('POST', '/projects', { name: 'N1', slug: `${slug}-${Date.now().toString(36)}` })).body
    const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '가' })).body
    const pageId = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '쪽' })).body.id
    const P = `/projects/${project.id}/pages/${pageId}`
    const seeded = await call('PATCH', `${P}/ops`, {
      baseSeq: 0,
      ops: nodes.map((value, at) => ({ op: 'add', path: `/root/children/${at}`, value })),
    })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
    return P
  }

  async function open(P: string, viewport: { width: number; height: number }, side?: number) {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport })
    if (side !== undefined)
      await page.addInitScript((w) => localStorage.setItem('wirebound.editor.sidebar', JSON.stringify({ sideWidth: w })), side)
    await page.goto(P)
    await canvasFrame(page).locator('[data-wb-id]').first().waitFor()
    await page.locator('[data-tree-row]').first().waitFor({ state: 'attached' })
    return { page, close: () => context.close() }
  }

  const rowButton = (page: Page, id: string) =>
    page.locator(`.wb-shell-region[aria-label="구조 트리"] [data-tree-row][data-tree-id="${id}"] button`).first()
  const TEXTS = [0, 1, 2].map((at) => ({ id: `n_t${at}000000000`, type: 'Text', props: { content: `글 ${at}` } }))

  async function openPaletteAtMax(page: Page): Promise<void> {
    await page.getByRole('contentinfo', { name: '하단 바' }).getByRole('button', { name: '컴포넌트', exact: true }).click()
    await page.getByRole('region', { name: '컴포넌트 목록' }).waitFor()
    await page.getByRole('separator', { name: '컴포넌트 목록 높이' }).focus()
    await page.keyboard.press('End')
  }

  /** 하단 바의 통지 무리에 통지 꼴 `<p>` 를 `count` 개로 맞춘다(실제 통지를 세우는 판은 이 트랙 밖이다). */
  const setNotices = (page: Page, count: number) =>
    page.evaluate(
      ([n, make]) => {
        const box = document.querySelector('.wb-shell-footer-notices')!
        for (const p of box.querySelectorAll('.wb-test-notice')) p.remove()
        for (let i = 0; i < (n as number); i += 1) {
          const p = document.createElement('p')
          p.className = 'wb-shell-remote-alert wb-test-notice'
          p.setAttribute('role', 'status')
          p.textContent = (make as string[])[i]!
          box.appendChild(p)
        }
      },
      [count, [0, 1, 2, 3, 4, 5, 6, 7].map(NOTICE)] as const,
    )

  /** L-038 — 창 폭 2 × 높이 4 × 통지 3 에서 캔버스 · 판 · 하단 바 · 셸 넘침을 잰다. */
  it('창 크기 표 — 판이 최소 위면 캔버스 칸이 최소를 지키고 하단 바가 창 안이다(Q7 (다): 판 최소가 캔버스 몫보다 앞서고, 최소로도 셸이 넘치면 판이 바닥까지 내려간다)', async () => {
    const P = await fixture('n1-table', TEXTS)
    const rows: string[] = []
    const bad: string[] = []
    const overflowing: string[] = []
    const measured: Record<string, number[]> = {}
    for (const width of [1440, 800]) {
      for (const height of [500, 600, 700, 900]) {
        const { page, close } = await open(P, { width, height })
        try {
          await openPaletteAtMax(page)
          for (const count of [0, 1, 8]) {
            await setNotices(page, count)
            await page.waitForTimeout(300)
            const v = await page.evaluate(() => {
              const h = (s: string) => Math.round(document.querySelector(s)!.getBoundingClientRect().height)
              const shell = document.querySelector('.wb-shell') as HTMLElement
              return {
                canvas: h('.wb-shell-canvas'),
                palette: h('.wb-shell-palette'),
                footer: h('.wb-shell-footer'),
                overflow: shell.scrollHeight - shell.clientHeight,
                footerBottom: Math.round(document.querySelector('.wb-shell-footer')!.getBoundingClientRect().bottom - innerHeight),
              }
            })
            const label = `${width}×${height} 통지 ${count}`
            rows.push(`${label}: ${JSON.stringify(v)}`)
            // 캔버스가 몫(240)을 못 지키면 판이 최소(220)에 있거나, 최소로는 셸이 넘쳐 판이 바닥(120) 위로 내려간 판이다(그 판의 셸은 안 넘친다).
            const atFloor = v.palette >= PALETTE_HEIGHT_FLOOR && v.palette < PALETTE_HEIGHT_MIN && v.overflow === 0
            if (!(v.canvas >= CANVAS_MIN_HEIGHT || v.palette === PALETTE_HEIGHT_MIN || atFloor))
              bad.push(`${label} 캔버스 ${v.canvas} · 판 ${v.palette}`)
            if (v.overflow > 0) overflowing.push(label)
            measured[label] = [v.canvas, v.palette, v.footer]
          }
        } finally {
          await close()
        }
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[N1 창 크기 표]\n${rows.join('\n')}`)
    expect(rows).toHaveLength(24)
    expect(bad).toEqual([])
    // 하단 바(통지 여덟 · 328px)가 창 높이의 대부분인 칸에서도 셸이 안 넘친다 — 판이 바닥(120) 위 121 까지 내려간다(캔버스 칸의 높이 48 은
    // 칸의 여백이고 그 줄은 0 이다 — 판 뒤에 겹친다). 통지 무리에 max-height 를 안 건다(Q-N1-3). 나머지 23 칸은 바닥을 두기 전과 같은 값이다
    // (캔버스 / 판 / 하단 바).
    expect(overflowing).toEqual([])
    expect(measured).toEqual({
      '1440×500 통지 0': [189, 220, 40],
      '1440×500 통지 1': [189, 220, 40],
      '1440×500 통지 8': [61, 220, 168],
      '1440×600 통지 0': [240, 269, 40],
      '1440×600 통지 1': [240, 269, 40],
      '1440×600 통지 8': [161, 220, 168],
      '1440×700 통지 0': [240, 369, 40],
      '1440×700 통지 1': [240, 369, 40],
      '1440×700 통지 8': [240, 241, 168],
      '1440×900 통지 0': [240, 569, 40],
      '1440×900 통지 1': [240, 569, 40],
      '1440×900 통지 8': [240, 441, 168],
      '800×500 통지 0': [189, 220, 40],
      '800×500 통지 1': [153, 220, 76],
      '800×500 통지 8': [48, 121, 328],
      '800×600 통지 0': [240, 269, 40],
      '800×600 통지 1': [240, 233, 76],
      '800×600 통지 8': [48, 220, 328],
      '800×700 통지 0': [240, 369, 40],
      '800×700 통지 1': [240, 333, 76],
      '800×700 통지 8': [101, 220, 328],
      '800×900 통지 0': [240, 569, 40],
      '800×900 통지 1': [240, 533, 76],
      '800×900 통지 8': [240, 281, 328],
    })
  }, 180_000)

  /** L-012 — 줌 4 곳에서 선택 외곽선 위쪽 줄을 찍어 가장 진한 픽셀의 R 값을 본다(강조색 #2f6fed 는 47, 흰 바탕은 255). */
  it('낮은 줌의 선택 외곽선 — 줌 7 · 25 · 50 · 100% 에서 강조색으로 보인다', async () => {
    const P = await fixture(
      'n1-outline',
      [0, 1, 2].map((at) => ({ id: `n_c${at}000000000`, type: 'Card', props: { title: `카드 ${at}` } })),
    )
    const darkest: Record<string, number> = {}
    const shoot = async (page: Page, name: string, zoomMax: number) => {
      const info = await page.evaluate(() => {
        const r = document.querySelector('.wb-shell-selection')!.getBoundingClientRect()
        const f = document.querySelector('.wb-shell-canvas-frame') as HTMLElement
        return { x: r.x, y: r.y, w: r.width, h: r.height, zoom: f.getBoundingClientRect().width / f.offsetWidth }
      })
      expect(info.zoom).toBeLessThan(zoomMax)
      const clip = {
        x: Math.max(0, info.x - 12),
        y: Math.max(0, info.y - 12),
        width: Math.min(info.w + 24, 300),
        height: Math.min(info.h + 24, 120),
      }
      const px = decodePng(await page.screenshot({ clip }))
      const col = px.width >> 1
      let min = 255
      for (let y = 0; y < px.height; y += 1) min = Math.min(min, px.at(col, y)[0])
      darkest[name] = min
    }
    {
      const { page, close } = await open(P, { width: 700, height: 800 })
      try {
        await page.getByLabel('뷰포트 폭').selectOption('1920')
        await page.waitForTimeout(500)
        await page.getByRole('button', { name: '더 보기', exact: true }).click()
        await page.getByRole('menuitem', { name: '화면 맞춤', exact: true }).click()
        await page.waitForTimeout(600)
        await rowButton(page, 'n_c1000000000').click()
        await page.locator('.wb-shell-selection[data-wb-selected-id="n_c1000000000"]').waitFor()
        await shoot(page, '7%', 0.1)
      } finally {
        await close()
      }
    }
    {
      const { page, close } = await open(P, { width: 1440, height: 800 })
      try {
        await rowButton(page, 'n_c1000000000').click()
        await page.locator('.wb-shell-selection[data-wb-selected-id="n_c1000000000"]').waitFor()
        await shoot(page, '100%', 1.01)
        for (const name of ['75%', '50%', '25%']) {
          await page.getByRole('button', { name: '축소', exact: true }).click()
          await page.waitForTimeout(400)
          await shoot(page, name, 1)
        }
      } finally {
        await close()
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[낮은 줌의 외곽선 가장 진한 R] ${JSON.stringify(darkest)}`)
    expect(Object.keys(darkest)).toHaveLength(5)
    for (const [name, r] of Object.entries(darkest)) expect({ name, strong: r <= 120 }).toEqual({ name, strong: true })
  }, 120_000)

  /** L-056 — 통지 닫기(`.wb-shell-edit-alert-close`)와 대화 상자 닫기(`.wb-shell-dialog-close`)의 계산된 색이 같다. */
  it('통지 닫기 × 는 대화 상자 닫기와 같은 잉크색이다', async () => {
    const P = await fixture('n1-close', TEXTS)
    const { page, close } = await open(P, { width: 1440, height: 800 })
    try {
      await page.evaluate(() => {
        const b = document.createElement('button')
        b.className = 'wb-shell-edit-alert-close wb-test-close'
        b.textContent = '×'
        document.querySelector('.wb-shell-footer-notices')!.appendChild(b)
      })
      const alert = await page.evaluate(() => getComputedStyle(document.querySelector('.wb-test-close')!).color)
      await page.locator('.wb-shell-title').click()
      await page.keyboard.press('?')
      await page.locator('dialog[open] .wb-shell-dialog-close').waitFor()
      const dialog = await page.evaluate(() => getComputedStyle(document.querySelector('dialog[open] .wb-shell-dialog-close')!).color)
      expect(dialog).not.toBe('')
      expect(alert).toBe(dialog)
    } finally {
      await close()
    }
  })

  /** L-043 — 우측 패널 폭 300 의 «대상» 라벨. 글자 노드 하나의 `Range` 줄 수로 센다. */
  it('상호작용 «대상» 라벨이 한 줄이다 — 긴 별칭 · 보통 이름', async () => {
    const P = await fixture('n1-label', [
      {
        id: 'n_save00000001',
        type: 'Button',
        props: { label: '저장' },
        interactions: [{ on: 'click', actions: [{ type: 'setVisible', target: 'n_long00000001', value: false }] }],
      },
      { id: 'n_long00000001', type: 'Card', alias: LONG_ALIAS },
      { id: 'n_norm00000001', type: 'Card', alias: '보통 이름' },
    ])
    const lines: Record<string, number> = {}
    for (const [name, target] of [
      ['긴', 'n_long00000001'],
      ['보통', 'n_norm00000001'],
    ] as const) {
      const { page, close } = await open(P, { width: 1440, height: 900 })
      try {
        await rowButton(page, 'n_save00000001').click()
        await page.getByRole('tab', { name: '상호작용' }).click()
        const select = page.locator('aside label.wb-shell-field', { hasText: /^대상/ }).locator('select')
        await select.waitFor()
        await select.selectOption(target)
        lines[name] = await page.evaluate(() => {
          const label = [...document.querySelectorAll('aside label.wb-shell-field')].find((l) => l.textContent?.trim().startsWith('대상'))!
          const text = [...label.childNodes].find((n) => n.nodeType === 3 && n.textContent!.includes('대상'))!
          const range = document.createRange()
          range.selectNodeContents(text)
          return new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size
        })
      } finally {
        await close()
      }
    }
    expect(lines).toEqual({ 긴: 1, 보통: 1 })
  })

  /**
   * L-052 — 통지가 서고 걷힐 때 캔버스 칸 크기가 관찰자에 어떤 순서로 닿는지 센다. 판 높이를 다시 재는 관찰자가 한 프레임 뒤에 반영하면 칸이 옛
   * 판 높이로 한 프레임 그려진다(통지가 서면 172 · 걷히면 308 이 먼저 닿고 다음 프레임에 240).
   */
  it('통지가 서고 걷힐 때 캔버스 칸이 한 프레임도 옛 판 높이로 그려지지 않는다', async () => {
    const P = await fixture('n1-frame', TEXTS)
    const seen: Record<string, [number, number][]> = {}
    for (const height of [700, 900]) {
      const { page, close } = await open(P, { width: 1440, height })
      try {
        await openPaletteAtMax(page)
        await page.waitForTimeout(300)
        for (const dir of ['서다', '걷히다'] as const) {
          seen[`${height} ${dir}`] = await page.evaluate(
            async ([d, texts]) => {
              const box = document.querySelector('.wb-shell-footer-notices')!
              const canvas = document.querySelector('.wb-shell-canvas')!
              let frame = 0
              let running = true
              const tick = () => {
                frame += 1
                if (running) requestAnimationFrame(tick)
              }
              requestAnimationFrame(tick)
              const log: [number, number][] = []
              let first = true
              const ro = new ResizeObserver((entries) => {
                if (first) {
                  first = false
                  return
                }
                log.push([frame, Math.round(entries[entries.length - 1]!.contentRect.height + 48)])
              })
              ro.observe(canvas)
              await new Promise((r) => setTimeout(r, 80))
              if (d === '서다') {
                for (let i = 0; i < 5; i += 1) {
                  const p = document.createElement('p')
                  p.className = 'wb-shell-remote-alert wb-test-notice'
                  p.setAttribute('role', 'status')
                  p.textContent = (texts as string[])[i]!
                  box.appendChild(p)
                }
              } else for (const p of box.querySelectorAll('.wb-test-notice')) p.remove()
              await new Promise((r) => setTimeout(r, 300))
              running = false
              ro.disconnect()
              return log
            },
            [dir, [0, 1, 2, 3, 4].map(NOTICE)] as const,
          )
        }
      } finally {
        await close()
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[통지 프레임] ${JSON.stringify(seen)}`)
    for (const [name, log] of Object.entries(seen)) {
      // 카나리아 — 칸 크기가 실제로 한 번은 바뀌어 전달됐다. 전달된 값은 전부 최소다(중간 값이 없다).
      expect({ name, delivered: log.length > 0, heights: [...new Set(log.map(([, h]) => h))] }).toEqual({
        name,
        delivered: true,
        heights: [CANVAS_MIN_HEIGHT],
      })
    }
  }, 120_000)

  /** L-040 — 창 700(접힌 머리)의 `…` 첫머리에 지금 배율이 눌리지 않는 한 줄로 선다. */
  it('접힌 머리 `…` 첫머리에 지금 배율이 눌리지 않는 한 줄로 선다 — 줌을 바꾸면 따라온다', async () => {
    const P = await fixture('n1-zoom', TEXTS)
    const { page, close } = await open(P, { width: 700, height: 800 })
    try {
      const readValue = async () => {
        await page.waitForTimeout(600)
        await page.getByRole('button', { name: '더 보기', exact: true }).click()
        const item = page.getByRole('menuitem', { name: /^배율 \d+%$/ })
        await item.waitFor()
        return {
          text: (await item.textContent())!.trim(),
          disabled: (await item.getAttribute('aria-disabled')) === 'true' || (await item.isDisabled()),
        }
      }
      const first = await readValue()
      await page.getByRole('menuitem', { name: '축소', exact: true }).click()
      const second = await readValue()
      await page.keyboard.press('Escape')
      expect({ first, second: second.text }).toEqual({ first: { text: '배율 100%', disabled: true }, second: '배율 75%' })
    } finally {
      await close()
    }
  })

  /** L-011 — 배치 선 꼬리표가 노드의 첫 자식 상자 위에 서지 않는다. */
  it('배치 선 꼬리표가 노드의 첫 자식 글을 덮지 않는다 — Flex · Grid', async () => {
    const P = await fixture('n1-tag', [
      {
        id: 'n_flex00000001',
        type: 'Flex',
        props: { direction: 'row' },
        children: [
          { id: 'n_btn000000001', type: 'Button', props: { label: '저장' } },
          { id: 'n_t2000000001', type: 'Text', props: { content: '둘' } },
        ],
      },
      {
        id: 'n_grid00000001',
        type: 'Grid',
        props: { columns: 2 },
        children: [
          { id: 'n_g1000000001', type: 'Text', props: { content: 'Grid 칸 1' } },
          { id: 'n_g2000000001', type: 'Text', props: { content: '칸 2' } },
        ],
      },
    ])
    const { page, close } = await open(P, { width: 1440, height: 900 })
    try {
      await page.getByRole('button', { name: '배치 선', exact: true }).click()
      await page.locator('.wb-shell-guide-tag').first().waitFor()
      await page.waitForTimeout(300)
      const overlaps = await page.evaluate(() => {
        const iframe = document.querySelector('iframe.wb-shell-canvas-iframe') as HTMLIFrameElement
        const f = iframe.getBoundingClientRect()
        const scale = f.width / iframe.offsetWidth
        const out: Record<string, { overlap: number; tags: number }> = {}
        for (const [guide, child] of [
          ['n_flex00000001', 'n_btn000000001'],
          ['n_grid00000001', 'n_g1000000001'],
        ] as const) {
          const tags = document.querySelectorAll(`.wb-shell-guide[data-wb-guide-for="${guide}"] .wb-shell-guide-tag`)
          const tag = tags[0]!.getBoundingClientRect()
          const c = iframe.contentDocument!.querySelector(`[data-wb-id="${child}"]`)!.getBoundingClientRect()
          const cx = f.x + c.x * scale
          const cy = f.y + c.y * scale
          const ox = Math.max(0, Math.min(tag.right, cx + c.width * scale) - Math.max(tag.left, cx))
          const oy = Math.max(0, Math.min(tag.bottom, cy + c.height * scale) - Math.max(tag.top, cy))
          out[guide] = { overlap: Math.round(ox * oy), tags: tags.length }
        }
        return out
      })
      expect(overlaps).toEqual({ n_flex00000001: { overlap: 0, tags: 1 }, n_grid00000001: { overlap: 0, tags: 1 } })
    } finally {
      await close()
    }
  })

  /** L-004 · L-015 — 캔버스 왼끝 노드의 손잡이는 칸 안에 온전히 선다(스크롤 0). 번호 마커와의 겹침은 값으로 적는다(모양만). */
  it('왼끝 노드의 손잡이가 칸에 안 잘린다', async () => {
    const P = await fixture('n1-handle', [{ id: 'n_tabs00000001', type: 'Tabs', props: { tabs: ['A', 'B'] } }, ...TEXTS])
    await call('POST', `${P}/comments`, { nodeId: 'n_t0000000000', body: '여기' })
    const seen: Record<string, unknown> = {}
    for (const [width, side] of [
      [1440, 200],
      [1024, 200],
    ] as const) {
      for (const id of ['n_tabs00000001', 'n_t0000000000']) {
        const { page, close } = await open(P, { width, height: 900 }, side)
        try {
          await rowButton(page, id).click()
          await page.locator('.wb-shell-canvas-handle').waitFor()
          await page.waitForTimeout(300)
          seen[`${width}/${side}/${id}`] = await page.evaluate(() => {
            const c = document.querySelector('.wb-shell-canvas')!.getBoundingClientRect()
            const h = document.querySelector('.wb-shell-canvas-handle')!.getBoundingClientRect()
            const mk = document.querySelector('.wb-shell-marker')?.getBoundingClientRect()
            const inter = (a: DOMRect, b: DOMRect) =>
              Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
              Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
            return {
              inside: Math.round(inter(h, c)) === Math.round(h.width * h.height),
              markerOverlap: mk === undefined ? null : Math.round(inter(h, mk)),
            }
          })
        } finally {
          await close()
        }
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[손잡이] ${JSON.stringify(seen)}`)
    for (const [name, value] of Object.entries(seen))
      expect({ name, inside: (value as { inside: boolean }).inside }).toEqual({ name, inside: true })
  }, 120_000)

  /**
   * L-019 — 테마가 `body` 에 `min-height: 100vh` 를 거는 판(문서 안에 같은 규칙의 시트를 얹어 흉내 낸다 — 시스템 테마 다섯에는 없다). 고치기 전
   * 값: 가만히 둬도 400ms 마다 +336px 자랐고(334 → 2364), 문서를 줄여도 안 줄었다.
   */
  it('뷰포트 높이 테마 — 캔버스 iframe 이 가만히 있어도 안 자라고 문서가 줄면 준다', async () => {
    const P = await fixture('n1-vh', [TEXTS[0]])
    const { page, close } = await open(P, { width: 1440, height: 800 })
    try {
      await page.evaluate(() => {
        const d = (document.querySelector('iframe.wb-shell-canvas-iframe') as HTMLIFrameElement).contentDocument!
        const style = d.createElement('style')
        style.textContent = 'body{min-height:100vh}'
        d.head.appendChild(style)
      })
      const height = () =>
        page.evaluate(() => Math.round(document.querySelector('iframe.wb-shell-canvas-iframe')!.getBoundingClientRect().height))
      const idle: number[] = []
      for (let i = 0; i < 5; i += 1) {
        await page.waitForTimeout(400)
        idle.push(await height())
      }
      const many = Array.from({ length: 30 }, (_, i) => ({
        op: 'add',
        path: `/root/children/${i + 1}`,
        value: { id: `n_m${String(i).padStart(11, '0')}`, type: 'Text', props: { content: `줄 ${i}` } },
      }))
      const baseSeq = async () => (await call('GET', P)).body.headSeq as number
      expect((await call('PATCH', `${P}/ops`, { baseSeq: await baseSeq(), ops: many })).status).toBe(200)
      await page.waitForTimeout(800)
      const grown = await height()
      expect(
        (await call('PATCH', `${P}/ops`, { baseSeq: await baseSeq(), ops: many.map(() => ({ op: 'remove', path: '/root/children/1' })) }))
          .status,
      ).toBe(200)
      await page.waitForTimeout(800)
      const shrunk = await height()
      // eslint-disable-next-line no-console
      console.log(`[뷰포트 높이 테마] ${JSON.stringify({ idle, grown, shrunk })}`)
      expect({ stable: new Set(idle).size === 1, grewWithContent: grown > idle[0]! + 400, shrankBack: shrunk === idle[0] }).toEqual({
        stable: true,
        grewWithContent: true,
        shrankBack: true,
      })
    } finally {
      await close()
    }
  }, 60_000)
})
