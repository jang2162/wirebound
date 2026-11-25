/**
 * **우측 패널 탭 머리 줄이 두 줄 이상으로 놓인 판 — 실브라우저**(`src/shell.css` 의 `.wb-shell-tabs` · `.wb-shell-tab`). 글 폭 합이 탭 줄 폭을 넘으면
 * (다른 글꼴 · 브라우저 최소 글자 크기) 탭째 다음 줄로 간다. 그때도 **줄마다 그 밑에 구분선이 서고, 고른 탭의 밑줄은 그 줄의 구분선 바로 위에 붙는다.**
 * 한 줄 판은 모양이 그대로다(구분선은 탭 바로 밑 1px · 탭 몸통과 8px 사이).
 *
 * | 판 | 세우는 법 |
 * |---|---|
 * | 한 줄 | 창 1280 · 패널 기본 폭 — 글꼴 그대로 |
 * | 여러 줄 | 탭 줄에 큰 글자를 주입(`.wb-shell-tabs { font-size }` — 탭은 `font: inherit`) · 18px · 36px |
 *
 * 구분선 · 밑줄은 상자가 아니라 테두리 · 그림자라 **찍은 그림의 픽셀로** 잰다 — 탭 줄을 찍어 페이지 안에서 풀고(`Image` → `canvas`), 줄마다 그
 * 줄 밑 1px 띠가 탭 줄 폭 전부 구분선 색인지, 고른 탭 밑 2px 띠가 그 탭 폭 전부 강조색인지 센다. 상자 좌표(탭 · 줄 · 탭 줄)는 값으로 함께 단언한다.
 *
 * `SM_SHOTS=<디렉터리>` 를 주면 판마다 탭 줄 그림을 그 디렉터리에 남긴다(보고의 전후 그림).
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { panelWidthDefault } from '../src/shell/sidebar-layout'
import { canvasFrame, editorStackPrerequisite, poll, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

const TAB_NAMES = ['페이지 정보', '컴포넌트', '코멘트', '상호작용']

interface Box {
  top: number
  bottom: number
  left: number
  right: number
}

interface Head {
  list: Box
  panelTop: number
  tabs: (Box & { name: string; selected: boolean })[]
  rows: Box[]
  /** 줄마다 그 밑 1px 띠에서 구분선 색인 픽셀 수 / 띠 폭. */
  lineUnder: { hits: number; width: number }[]
  /** 고른 탭 밑 2px 띠(두 행)에서 강조색인 픽셀 수 / 띠 폭(탭 좌우 끝 1px 은 뺀다). */
  underline: { hits: number; width: number }[]
}

describe.skipIf(!전제.ok)('우측 탭 머리 줄 — 실브라우저', () => {
  let stack: EditorStack
  let alice: Session
  let P: string

  beforeAll(async () => {
    if (!전제.ok) return
    stack = await startEditorStack(전제)
    alice = await stack.login(stack.users.alice)
    const call = (m: string, p: string, b?: unknown) => stack.request(alice, m, p, b)
    const project = (await call('POST', '/projects', { name: '탭 머리', slug: `tab-head-${Date.now().toString(36)}` })).body
    const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '가' })).body
    const pageId = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '쪽' })).body.id as string
    P = `/projects/${project.id}/pages/${pageId}`
    const seeded = await call('PATCH', `${P}/ops`, {
      baseSeq: 0,
      ops: [{ op: 'add', path: '/root/children/0', value: { id: 'm_first', type: 'Text', props: { content: '처음 글' } } }],
    })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
  })

  afterAll(async () => {
    if (stack === undefined) return
    const { before, after } = await stack.close()
    expect(before.processes).toBeGreaterThan(0)
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  })

  async function open(fontSize: number | null): Promise<{ page: Page; close: () => Promise<void> }> {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1280, height: 900 } })
    await page.goto(P)
    await canvasFrame(page).locator('[data-wb-id]').first().waitFor({ state: 'attached' })
    if (fontSize !== null) await page.addStyleTag({ content: `.wb-shell-tabs { font-size: ${fontSize}px; }` })
    return { page, close: () => context.close() }
  }

  const rightTabs = (page: Page) => page.getByRole('tablist', { name: '우측 패널 탭', exact: true })

  async function pick(page: Page, name: string): Promise<void> {
    await rightTabs(page).getByRole('tab', { name, exact: true }).click()
    await poll(
      `${name} 탭`,
      // 탭 이름 글만 — «코멘트» 탭은 곁에 수 배지를 단다(`routes/editor.tsx` 의 `CommentTabLabel`).
      async () =>
        (
          await rightTabs(page)
            .locator('[role="tab"][aria-selected="true"]')
            .evaluate((el) => el.firstChild?.textContent ?? '')
        ).trim(),
      (v) => v === name,
    )
  }

  /** 탭 줄의 상자 좌표와 픽셀 띠를 잰다. `shot` 이면 탭 줄 그림을 그 경로에 남긴다. */
  async function measure(page: Page, shot?: string): Promise<Head> {
    // 두 프레임 — 주입한 글자 · 고른 탭의 굵은 글이 그려진 뒤.
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))))
    const boxes = await page.evaluate(() => {
      const round = (r: DOMRect) => ({ top: r.top, bottom: r.bottom, left: r.left, right: r.right })
      const list = document.querySelector('[role="tablist"][aria-label="우측 패널 탭"]') as HTMLElement
      const panel = list.closest('.wb-shell-panel') as HTMLElement
      const tabs = [...list.querySelectorAll('[role="tab"]')].map((tab) => ({
        ...round(tab.getBoundingClientRect()),
        name: (tab.textContent ?? '').trim(),
        selected: tab.getAttribute('aria-selected') === 'true',
      }))
      const style = getComputedStyle(list)
      const selected = list.querySelector('[role="tab"][aria-selected="true"]') as HTMLElement
      return {
        list: round(list.getBoundingClientRect()),
        panelTop: panel.getBoundingClientRect().top,
        tabs,
        lineColor: style.getPropertyValue('--wb-shell-line').trim(),
        accent: getComputedStyle(selected).borderBottomColor,
      }
    })
    const rowTops = [...new Set(boxes.tabs.map((t) => Math.round(t.top)))].sort((a, b) => a - b)
    const rows = rowTops.map((top) => {
      const inRow = boxes.tabs.filter((t) => Math.round(t.top) === top)
      return {
        top: Math.min(...inRow.map((t) => t.top)),
        bottom: Math.max(...inRow.map((t) => t.bottom)),
        left: Math.min(...inRow.map((t) => t.left)),
        right: Math.max(...inRow.map((t) => t.right)),
      }
    })
    const clip = {
      x: Math.floor(boxes.list.left),
      y: Math.floor(boxes.list.top),
      width: Math.ceil(boxes.list.right) - Math.floor(boxes.list.left),
      height: Math.ceil(boxes.list.bottom) - Math.floor(boxes.list.top) + 2,
    }
    const png = await page.screenshot({ clip })
    if (shot !== undefined) writeFileSync(shot, png)
    const selected = boxes.tabs.find((t) => t.selected)!
    const bands = {
      lines: rows.map((row) => ({
        y: Math.round(row.bottom) - clip.y,
        x0: Math.round(boxes.list.left) - clip.x,
        x1: Math.round(boxes.list.right) - clip.x,
      })),
      underline: [2, 1].map((up) => ({
        y: Math.round(selected.bottom) - up - clip.y,
        x0: Math.round(selected.left) + 1 - clip.x,
        x1: Math.round(selected.right) - 1 - clip.x,
      })),
    }
    const counted = (await page.evaluate(
      async ({ data, bands, lineColor, accent }) => {
        const image = new Image()
        image.src = `data:image/png;base64,${data}`
        await image.decode()
        const canvas = document.createElement('canvas')
        canvas.width = image.width
        canvas.height = image.height
        const context = canvas.getContext('2d')!
        context.drawImage(image, 0, 0)
        const probe = document.createElement('canvas').getContext('2d')!
        const rgb = (color: string): number[] => {
          probe.fillStyle = color
          probe.fillRect(0, 0, 1, 1)
          return Array.from(probe.getImageData(0, 0, 1, 1).data.slice(0, 3))
        }
        const near = (pixel: ArrayLike<number>, color: number[]) => color.every((c, i) => Math.abs(c - (pixel[i] ?? 0)) <= 6)
        const count = (band: { y: number; x0: number; x1: number }, color: number[]) => {
          const row = context.getImageData(band.x0, band.y, band.x1 - band.x0, 1).data
          let hits = 0
          for (let x = 0; x < band.x1 - band.x0; x += 1) if (near(row.subarray(x * 4, x * 4 + 3), color)) hits += 1
          return { hits, width: band.x1 - band.x0 }
        }
        const line = rgb(lineColor)
        const strong = rgb(accent)
        return { lineUnder: bands.lines.map((b) => count(b, line)), underline: bands.underline.map((b) => count(b, strong)) }
      },
      { data: png.toString('base64'), bands, lineColor: boxes.lineColor, accent: boxes.accent },
    )) as Pick<Head, 'lineUnder' | 'underline'>
    return { list: boxes.list, panelTop: boxes.panelTop, tabs: boxes.tabs, rows, ...counted }
  }

  const shotPath = (name: string): string | undefined => (process.env.SM_SHOTS ? join(process.env.SM_SHOTS, name) : undefined)

  it('한 줄 판 — 구분선은 탭 바로 밑 1px 에 탭 줄 폭 전부 · 고른 탭의 밑줄은 그 위 2px · 탭 줄은 탭 높이 + 1', async () => {
    const opened = await open(null)
    const { page } = opened
    try {
      for (const name of TAB_NAMES) {
        await pick(page, name)
        const head = await measure(page, name === '컴포넌트' ? shotPath('one-row.png') : undefined)
        // eslint-disable-next-line no-console
        console.log(`[한 줄 ${name}] ${JSON.stringify(head)}`)
        const row = head.rows[0]!
        const selected = head.tabs.find((t) => t.selected)!
        expect(head.tabs.map((t) => t.name)).toEqual(TAB_NAMES)
        expect({
          줄: head.rows.length,
          탭줄폭: Math.round(head.list.right - head.list.left),
          탭줄높이_탭높이: Math.round((head.list.bottom - head.list.top - (row.bottom - row.top)) * 100) / 100,
          탭줄위_탭위: Math.round((row.top - head.list.top) * 100) / 100,
          줄좌우: [Math.round(row.left - head.list.left), Math.round(head.list.right - row.right)],
          고른탭밑: Math.round((row.bottom - selected.bottom) * 100) / 100,
          구분선: head.lineUnder.map((band) => band.hits === band.width),
          밑줄: head.underline.map((band) => band.hits === band.width),
        }).toEqual({
          줄: 1,
          탭줄폭: panelWidthDefault(1280) - 24,
          탭줄높이_탭높이: 1,
          탭줄위_탭위: 0,
          줄좌우: [0, 0],
          고른탭밑: 0,
          구분선: [true],
          밑줄: [true, true],
        })
      }
    } finally {
      await opened.close()
    }
  })

  // 18px 은 두 줄 · 36px 은 세 줄(가운데 줄에서 고른 판이 선다) — 한 케이스로 둔다(같은 성질이라 따로 두면 늘 함께 죽는다).
  it('탭 줄 글자 18px · 36px — 여러 줄로 놓여도 줄마다 그 밑에 구분선 · 고른 탭의 밑줄은 제 줄의 구분선 바로 위', async () => {
    const seen: Record<string, unknown> = {}
    // 고른 탭은 굵은 글이라 넓어져 줄 수가 판마다 다를 수 있다 — 기대는 그 판의 줄 수로 짓는다.
    const wanted: Record<string, unknown> = {}
    for (const fontSize of [18, 36]) {
      const opened = await open(fontSize)
      const { page } = opened
      try {
        for (const name of [...TAB_NAMES].reverse()) {
          await pick(page, name)
          const head = await measure(
            page,
            name === '컴포넌트' || name === '상호작용' ? shotPath(`rows-${fontSize}-${name}.png`) : undefined,
          )
          // eslint-disable-next-line no-console
          console.log(`[${fontSize}px ${name}] ${JSON.stringify(head)}`)
          const selected = head.tabs.find((t) => t.selected)!
          const own = head.rows.find((row) => Math.round(row.top) === Math.round(selected.top))!
          // 카나리아 — 이 판이 여러 줄이다(글자를 키운 주입이 실렸다).
          expect(head.rows.length, `${fontSize}px 의 줄 수`).toBeGreaterThan(1)
          seen[`${fontSize} ${name}`] = {
            // 줄 사이 — 다음 줄은 앞 줄 밑 구분선 1px 바로 밑에서 선다 · 마지막 줄 밑 1px 이 탭 줄 끝.
            줄사이: head.rows.slice(1).map((row, at) => Math.round((row.top - head.rows[at]!.bottom) * 100) / 100),
            끝: Math.round((head.list.bottom - head.rows.at(-1)!.bottom) * 100) / 100,
            줄폭: head.rows.map((row) => [Math.round(row.left - head.list.left), Math.round(head.list.right - row.right)]),
            고른탭밑: Math.round((own.bottom - selected.bottom) * 100) / 100,
            구분선: head.lineUnder.map((band) => band.hits === band.width),
            밑줄: head.underline.map((band) => band.hits === band.width),
          }
          const rows = head.rows.length
          wanted[`${fontSize} ${name}`] = {
            줄사이: Array.from({ length: rows - 1 }, () => 1),
            끝: 1,
            줄폭: Array.from({ length: rows }, () => [0, 0]),
            고른탭밑: 0,
            구분선: Array.from({ length: rows }, () => true),
            밑줄: [true, true],
          }
        }
      } finally {
        await opened.close()
      }
    }
    // 카나리아 — 세 줄 판이 섰다.
    expect(Object.values(seen).some((entry) => (entry as { 구분선: boolean[] }).구분선.length >= 3)).toBe(true)
    expect(seen).toEqual(wanted)
  })
})
