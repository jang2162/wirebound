/**
 * **레이아웃 값을 실브라우저로 잰다** — 축소판 · 셸 세로 몫 · 외곽선 굵기 · 사용자 테마의 뷰포트 단위. jsdom 은 배치 · 미디어 쿼리 판정 ·
 * 그려진 픽셀이 없어 아래 값을 못 잰다. 값은 로그로 낸다 — 정책을 고르는 자리(축소판 폭 · 판 최소)가 값을 읽는 곳이다.
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | L-007 축소판 값 — 폭 셋 × 탭 다섯 | 카드가 17 보다 적다 · 줄임 비를 못 읽은 카드가 있다(표본이 안 섰다) · 축소판 iframe 폭이 카드 판(트랙) 폭과 다르다 |
 * | L-233 셸 세로 몫 — 창 800×500 · 통지 8 | 셸이 넘친다 · 판 121 · 하단 바 328 이 아니다 · 판 안 카드가 사라지거나(칸 0) 스크롤이 안 선다 · 칸의 높이를 못 읽는다 |
 * | L-237 줌별 외곽선 화면 굵기 | 줌 100 · 75 · 50 · 25% 중 하나라도 외곽선을 못 읽는다 |
 * | L-234 사용자 테마의 뷰포트 단위 | 올린 `.wbtheme`(`vh` 를 `body` · 카드 상자에 건 판)로 열면 캔버스 iframe 이 가만히 있어도 자란다 · 문서가 줄어도 안 준다 |
 *
 * 값 로그: `[N20 축소판 값 …]`(카드 폭 · 줄마다 카드 수 · 줄임 비 · iframe 폭 · iframe 에서 참인 `max-width` 미디어 규칙) · `[N20 세로 몫]` ·
 * `[N20 외곽선]` · `[N20 뷰포트 단위 테마]`. 다시 재는 법: `pnpm vitest run -c vitest.browser.config.ts apps/web/build-test/n20-layout.test.ts`.
 *
 * **축소판 iframe 폭** — 축소판은 판 하나에 iframe 하나이고 그 폭이 카드 판(트랙) 폭이다(`palette/palette-thumbs.tsx`). 표본은 제 폭
 * `NATURAL_WIDTH`(360)으로 그리지만 테마의 `@media (max-width: …)` 는 iframe 폭으로 판정하므로, 같은 표본도 창 폭에 따라 다른 갈래로 그려진다.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildTheme } from '@wirebound/theme-kit'
import { decodePng } from './png-pixels'
import { makeAdmin, putTheme, themeProject, uploadRaw } from './theme-fixtures'
import { canvasFrame, editorStackPrerequisite, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

/** 판 하나의 값 — 카드 크기 · 줄마다 카드 수 · 줄임 비 · iframe 폭 · iframe 안에서 참인 `max-width` 미디어 규칙. */
const THUMB_VALUES = `(() => {
  const iframe = document.querySelector('iframe.wb-shell-palette-thumbs-iframe')
  const doc = iframe?.contentDocument
  const track = document.querySelector('.wb-shell-palette-track')
  const cards = [...document.querySelectorAll('[data-wb-palette-card]')]
  const tops = [...new Set(cards.map((card) => Math.round(card.getBoundingClientRect().top)))]
  const scale = {}
  for (const card of cards) {
    const type = card.getAttribute('data-wb-palette-card')
    const m = /scale\\(([0-9.]+)\\)/.exec(doc?.querySelector('[data-wb-palette-thumb="' + type + '"]')?.style.transform ?? '')
    scale[type] = m === null ? null : Math.round(Number(m[1]) * 100) / 100
  }
  const rules = []
  for (const sheet of doc?.styleSheets ?? []) {
    let list
    try { list = sheet.cssRules } catch { continue }
    for (const rule of list) if (rule.constructor.name === 'CSSMediaRule' && /max-width/.test(rule.conditionText)) rules.push({ cond: rule.conditionText, on: doc.defaultView.matchMedia(rule.conditionText).matches })
  }
  const first = cards[0]?.getBoundingClientRect()
  return {
    cards: cards.length,
    perRow: tops.map((top) => cards.filter((card) => Math.round(card.getBoundingClientRect().top) === top).length),
    card: first === undefined ? null : [Math.round(first.width), Math.round(first.height)],
    track: track === null ? null : Math.round(track.getBoundingClientRect().width),
    iframe: iframe === null ? null : Math.round(iframe.getBoundingClientRect().width),
    scale,
    media: [...new Map(rules.map((rule) => [rule.cond, rule])).values()],
  }
})()`

describe.skipIf(!전제.ok)('N20 레이아웃 값 — 실브라우저', () => {
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
    const project = (await call('POST', '/projects', { name: 'N20', slug: `${slug}-${Date.now().toString(36)}` })).body
    const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '가' })).body
    const pageId = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '쪽' })).body.id
    const P = `/projects/${project.id}/pages/${pageId}`
    const seeded = await call('PATCH', `${P}/ops`, { baseSeq: 0, ops: nodes.map((value, at) => ({ op: 'add', path: `/root/children/${at}`, value })) })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
    return P
  }

  const TEXTS = [0, 1, 2].map((at) => ({ id: `n_t${at}000000000`, type: 'Text', props: { content: `글 ${at}` } }))

  it('L-007 축소판 값 — 창 폭 셋 × 탭 다섯의 카드 · 줄임 비 · iframe 폭', async () => {
    const P = await fixture('n20-thumbs', TEXTS)
    let cardsTotal = 0
    const lines: string[] = []
    for (const width of [1440, 1024, 800]) {
      const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width, height: 900 } })
      try {
        await page.goto(P)
        await canvasFrame(page).locator('[data-wb-id]').first().waitFor()
        await page.getByRole('contentinfo', { name: '하단 바' }).getByRole('button', { name: '컴포넌트', exact: true }).click()
        await page.getByRole('region', { name: '컴포넌트 목록' }).waitFor()
        const tabs = page.getByRole('tablist', { name: '갈래' }).getByRole('tab')
        const count = await tabs.count()
        expect(count).toBe(5)
        const widthCards = { count: 0 }
        for (let i = 0; i < count; i += 1) {
          await tabs.nth(i).click()
          await page.waitForTimeout(700)
          const v = (await page.evaluate(THUMB_VALUES)) as {
            cards: number
            perRow: number[]
            card: number[] | null
            track: number | null
            iframe: number | null
            scale: Record<string, number | null>
            media: { cond: string; on: boolean }[]
          }
          widthCards.count += v.cards
          expect(Object.values(v.scale).filter((s) => s === null)).toEqual([])
          expect(v.iframe).toBe(v.track)
          lines.push(`창 ${width} · ${await tabs.nth(i).innerText()}: ${JSON.stringify(v)}`)
        }
        cardsTotal = widthCards.count
        expect(widthCards.count).toBeGreaterThanOrEqual(17)
      } finally {
        await context.close()
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[N20 축소판 값 — 카드 ${cardsTotal}]\n${lines.join('\n')}`)
  }, 180_000)

  const NOTICE = (i: number) => `통지 ${i + 1} — 남이 이 페이지를 바꿔 화면이 낡았습니다. 다시 불러오면 서버의 판으로 돌아갑니다.`

  it('L-233 셸 세로 몫 — 창 800×500 · 통지 8 · 판이 바닥으로 내려간 칸마다 높이', async () => {
    const P = await fixture('n20-room', TEXTS)
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 800, height: 500 } })
    try {
      await page.goto(P)
      await canvasFrame(page).locator('[data-wb-id]').first().waitFor()
      await page.getByRole('contentinfo', { name: '하단 바' }).getByRole('button', { name: '컴포넌트', exact: true }).click()
      await page.getByRole('region', { name: '컴포넌트 목록' }).waitFor()
      await page.getByRole('separator', { name: '컴포넌트 목록 높이' }).focus()
      await page.keyboard.press('Home')
      await page.evaluate(
        ([n, make]) => {
          const box = document.querySelector('.wb-shell-footer-notices')!
          for (let i = 0; i < (n as number); i += 1) {
            const p = document.createElement('p')
            p.className = 'wb-shell-remote-alert wb-test-notice'
            p.setAttribute('role', 'status')
            p.textContent = (make as string[])[i]!
            box.appendChild(p)
          }
        },
        [8, [0, 1, 2, 3, 4, 5, 6, 7].map(NOTICE)] as const,
      )
      await page.waitForTimeout(400)
      const v = await page.evaluate(() => {
        const h = (s: string) => {
          const e = document.querySelector(s)
          return e === null ? null : Math.round(e.getBoundingClientRect().height)
        }
        const shell = document.querySelector('.wb-shell') as HTMLElement
        const cards = document.querySelector('.wb-shell-palette-cards') as HTMLElement | null
        return {
          window: innerHeight,
          shellOverflow: shell.scrollHeight - shell.clientHeight,
          head: h('.wb-shell-head') ?? h('header'),
          canvas: h('.wb-shell-canvas'),
          palette: h('.wb-shell-palette'),
          paletteHead: h('.wb-shell-palette-head'),
          paletteCards: cards === null ? null : Math.round(cards.clientHeight),
          cardsScroll: cards === null ? null : Math.round(cards.scrollHeight),
          cardTop: (() => {
            const card = document.querySelector('[data-wb-palette-card]')
            return card === null || cards === null ? null : Math.round(card.getBoundingClientRect().top - cards.getBoundingClientRect().top)
          })(),
          card: h('[data-wb-palette-card]'),
          footer: h('.wb-shell-footer'),
          notices: h('.wb-shell-footer-notices'),
        }
      })
      // eslint-disable-next-line no-console
      console.log(`[N20 세로 몫] 800×500 · 통지 8 · 판 최소: ${JSON.stringify(v)}`)
      expect(Object.values(v).filter((value) => value === null)).toEqual([])
      // 판이 바닥(120) 위 121 까지 내려가 셸이 안 넘친다 — 하단 바 328 · 캔버스 칸 48(여백 · 그 줄은 0 이라 판 뒤에 겹친다) · 판 머리 60 +
      // 카드 칸 55(카드 한 장이 사라지지 않고 스크롤된다).
      expect(v.shellOverflow).toBe(0)
      expect(v.palette).toBe(121)
      expect(v.canvas).toBe(48)
      expect(v.footer).toBe(328)
      expect(v.paletteCards!).toBeGreaterThan(0)
      expect(v.paletteCards!).toBeLessThan(v.card!)
      // 카드는 칸 안에 있고(맨 위가 칸 위) 칸의 내용이 칸보다 길어 스크롤된다.
      expect(v.cardTop!).toBeGreaterThanOrEqual(0)
      expect(v.cardTop!).toBeLessThan(v.paletteCards!)
      expect(v.cardsScroll!).toBeGreaterThan(v.paletteCards!)
    } finally {
      await context.close()
    }
  }, 120_000)

  it('L-237 줌별 선택 외곽선 화면 굵기 — 계산값 × 겹의 배율 · 찍은 픽셀의 연속 수', async () => {
    const P = await fixture('n20-outline', [0, 1, 2].map((at) => ({ id: `n_c${at}000000000`, type: 'Card', props: { title: `카드 ${at}` } })))
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 800 } })
    const seen: Record<string, unknown> = {}
    try {
      await page.goto(P)
      await canvasFrame(page).locator('[data-wb-id]').first().waitFor()
      await page.locator('[data-tree-row]').first().waitFor({ state: 'attached' })
      await page.locator('.wb-shell-region[aria-label="구조 트리"] [data-tree-row][data-tree-id="n_c1000000000"] button').first().click()
      await page.locator('.wb-shell-selection[data-wb-selected-id="n_c1000000000"]').waitFor()
      for (const name of ['100%', '75%', '50%', '25%']) {
        if (name !== '100%') {
          await page.getByRole('button', { name: '축소', exact: true }).click()
          await page.waitForTimeout(400)
        }
        const info = await page.evaluate(() => {
          const sel = document.querySelector('.wb-shell-selection') as HTMLElement
          const r = sel.getBoundingClientRect()
          const f = document.querySelector('.wb-shell-canvas-frame') as HTMLElement
          return {
            x: r.x,
            y: r.y,
            w: r.width,
            h: r.height,
            zoom: f.getBoundingClientRect().width / f.offsetWidth,
            layer: r.width / sel.offsetWidth,
            css: parseFloat(getComputedStyle(sel).outlineWidth),
          }
        })
        const clip = { x: Math.max(0, info.x - 12), y: Math.max(0, info.y - 12), width: Math.min(info.w + 24, 300), height: Math.min(info.h + 24, 120) }
        const px = decodePng(await page.screenshot({ clip }))
        const col = px.width >> 1
        let run = 0
        let best = 0
        for (let y = 0; y < px.height; y += 1) {
          if (px.at(col, y)[0] <= 120) {
            run += 1
            best = Math.max(best, run)
          } else run = 0
        }
        seen[name] = { zoom: Math.round(info.zoom * 100) / 100, layer: Math.round(info.layer * 100) / 100, cssPx: Math.round(info.css * 100) / 100, screenPx: Math.round(info.css * info.layer * 100) / 100, darkRun: best }
      }
    } finally {
      await context.close()
    }
    // eslint-disable-next-line no-console
    console.log(`[N20 외곽선] ${JSON.stringify(seen)}`)
    expect(Object.keys(seen)).toHaveLength(4)
  }, 120_000)

  const SAMPLE_ROOT = fileURLToPath(new URL('../../../packages/theme-kit/test/fixtures/sample-theme/', import.meta.url))

  /** kit 의 `sample-theme` 을 복사해 id · CSS 만 바꿔 `buildTheme` 로 짓는다 — 업로드가 받는 진짜 산출물이다. */
  async function cssTheme(id: string, css: string): Promise<Uint8Array> {
    const dir = mkdtempSync(join(tmpdir(), 'wb-n20-theme-'))
    try {
      cpSync(SAMPLE_ROOT, dir, { recursive: true })
      writeFileSync(
        join(dir, 'theme.config.ts'),
        `import { defineManifest } from '@wirebound/theme-sdk'\nexport default defineManifest({ id: '${id}', name: '${id}', version: '1.0.0', sdk: '^1.0.0', tokens: { items: {} } })\n`,
      )
      writeFileSync(join(dir, 'src/theme.css'), css)
      const built = await buildTheme({ root: dir, entry: 'src/index.tsx', outDir: join(dir, 'out') })
      return new Uint8Array(readFileSync(built.file))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }

  it('L-234 사용자 테마의 뷰포트 단위 — 올린 .wbtheme 로 열어도 iframe 이 가만히 있으면 안 자라고 문서가 줄면 준다', async () => {
    const alice = await stack.login(stack.users.alice)
    await makeAdmin(stack, stack.users.alice)
    const themes = [
      { id: 'vhbody', css: 'body { min-height: 100vh; }\n.sample-card { border: 1px solid #888; }' },
      { id: 'vhinner', css: '.sample-card { min-height: 100vh; border: 1px solid #888; }' },
      { id: 'vhinnerh', css: '.sample-card { height: 100vh; border: 1px solid #888; }' },
    ]
    const seen: Record<string, unknown> = {}
    for (const theme of themes) {
      expect(await uploadRaw(stack, alice, await cssTheme(theme.id, theme.css))).toBe(201)
      const project = await themeProject(stack, alice)
      await putTheme(project.call, project.id, { themeId: theme.id, version: '1.0.0', tokens: {} })
      const P = `/projects/${project.id}/pages/${project.first}`
      const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 800 } })
      try {
        await page.goto(P)
        await canvasFrame(page).locator('body', { hasText: '원문' }).waitFor()
        await page.waitForTimeout(800)
        const height = () => page.evaluate(() => Math.round(document.querySelector('iframe.wb-shell-canvas-iframe')!.getBoundingClientRect().height))
        const cardBox = () => canvasFrame(page).locator('.sample-card').first().evaluate((el) => Math.round(el.getBoundingClientRect().height))
        const idle: number[] = []
        for (let i = 0; i < 5; i += 1) {
          await page.waitForTimeout(400)
          idle.push(await height())
        }
        const card = await cardBox()
        const many = Array.from({ length: 30 }, (_, i) => ({ op: 'add', path: `/root/children/${i + 2}`, value: { id: `n_m${String(i).padStart(11, '0')}`, type: 'Text', props: { content: `줄 ${i}` } } }))
        const baseSeq = async () => (await project.call('GET', P.replace('/projects', '/projects'))).body.headSeq as number
        expect((await project.call('PATCH', `${P}/ops`, { baseSeq: await baseSeq(), ops: many })).status).toBe(200)
        await page.waitForTimeout(800)
        const grown = await height()
        expect((await project.call('PATCH', `${P}/ops`, { baseSeq: await baseSeq(), ops: many.map(() => ({ op: 'remove', path: '/root/children/2' })) })).status).toBe(200)
        await page.waitForTimeout(800)
        const shrunk = await height()
        const after: number[] = []
        for (let i = 0; i < 3; i += 1) {
          await page.waitForTimeout(400)
          after.push(await height())
        }
        seen[theme.id] = { idle, card, grown, shrunk, after }
        expect({ id: theme.id, stable: new Set(idle).size === 1, shrankBack: shrunk === idle[0], stableAfter: new Set(after).size === 1 }).toEqual({ id: theme.id, stable: true, shrankBack: true, stableAfter: true })
      } finally {
        await context.close()
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[N20 뷰포트 단위 테마] ${JSON.stringify(seen)}`)
  }, 180_000)
})
