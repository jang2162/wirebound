/**
 * **계산 비용을 실브라우저로 재서 적는다**(장부 L-016 — 값은 `[판정 비용]` · `[배치 선 수천]` · `[축소판 비용]` 로그다. 기계마다 달라 **상한을 단언하지 않는다** — 단언은 «재는 판이 섰는가»
 * (선 수 · 표본 수 · 값이 있다)뿐이다). 다시 재는 법은 각 케이스의 머리말에 있다.
 *
 * | 케이스 | 무엇을 재나 |
 * |---|---|
 * | 놓을 자리 판정 — 자식 많은 Grid | `canvasHitAt` 한 번(포인터 밑 노드의 부모 · 형제 계산 스타일 · 상자를 읽는다)의 시간을 Grid 자식 100 · 500 · 2000 에서 |
 * | 배치 선 — 자식 수천의 Grid | `guideOf`(모서리 글 · 안쪽 선) 한 번의 시간을 자식 1000 · 3000 에서(`./layout-guides.test.ts` 는 400 까지) |
 * | 축소판 — 처음 그림 · 토큰이 바뀔 때 | 판을 열어 모든 표본이 창 안에 설 때까지 · 남이 토큰을 저장한 뒤 표본이 새 값으로 바뀔 때까지의 시간과 그 동안의 긴 작업 |
 */
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canvasFrame, editorStackPrerequisite, poll, startEditorStack, type EditorStack, type Session } from './editor-stack'
import { putTheme, seededVersion } from './theme-fixtures'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

const text = (id: string, content: string) => ({ id, type: 'Text', props: { content } })
const grid = (size: number) => ({
  id: `n_big${size}`,
  type: 'Grid',
  props: { columns: 10 },
  children: Array.from({ length: size }, (_, i) => text(`big${size}_${i}`, `칸 ${i}`)),
})

describe.skipIf(!전제.ok)('계산 비용 — 실브라우저', () => {
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

  async function fixture(slug: string, nodes: readonly unknown[], theme = 'system-admin'): Promise<{ P: string; projectId: string }> {
    const project = (await call('POST', '/projects', { name: 'L-016 비용', slug: `${slug}-${Date.now().toString(36)}` })).body
    if (theme !== 'system-admin') await putTheme(call, project.id, { themeId: theme, version: seededVersion(theme), tokens: {} })
    const member = await call('POST', `/projects/${project.id}/members`, { email: stack.users.bob.email, role: 'editor' })
    if (member.status >= 300) throw new Error(`member ${member.status}`)
    const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '메뉴' })).body
    const page = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '쪽' })).body
    const P = `/projects/${project.id}/pages/${page.id}`
    const seeded = await call('PATCH', `${P}/ops`, {
      baseSeq: 0,
      ops: nodes.map((value, index) => ({ op: 'add', path: `/root/children/${index}`, value })),
    })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
    return { P, projectId: project.id }
  }

  async function open(P: string, ready: string): Promise<{ page: Page; close: () => Promise<void> }> {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
    await page.goto(P)
    await canvasFrame(page).locator(`[data-wb-id="${ready}"]`).waitFor()
    return { page, close: () => context.close() }
  }

  /**
   * `canvasHitAt` 한 번의 시간 — Grid 의 한가운데 칸 위 점을 서른 번 묶음 다섯의 중앙값(ms). vite dev 의 모듈을 불러 재므로 운영 번들(`EDITOR_STACK_BUNDLE=build`)에서는 건너뛰고
   * 그렇다고 적는다. 글로 넘긴다 — 함수로 넘기면 vitest 가 안의 `import()` 를 제 것으로 바꿔 페이지에서 죽는다.
   */
  it('놓을 자리 판정 — 자식 많은 Grid 에서 canvasHitAt 한 번의 시간을 적는다', async () => {
    const SIZES = [100, 500, 2000]
    const { P } = await fixture('cost-hit', SIZES.map(grid))
    const { page, close } = await open(P, 'n_big2000')
    try {
      const judged = (await page.evaluate(`(async (sizes) => {
        let mod
        try {
          mod = await import(location.origin + '/src/canvas/canvas-drop.ts')
        } catch {
          return null
        }
        const iframe = document.querySelector('iframe.wb-shell-canvas-iframe')
        const f = iframe.getBoundingClientRect()
        const zoom = f.width / iframe.offsetWidth
        const win = iframe.contentWindow
        const doc = iframe.contentDocument
        const out = {}
        for (const size of sizes) {
          const grid = [...doc.querySelectorAll('[data-wb-id]')].find((el) => el.getAttribute('data-wb-id') === 'n_big' + size)
          const middle = grid.children[Math.floor(size / 2)]
          const r = middle.getBoundingClientRect()
          const point = { x: f.left + (r.left + r.width / 2) * zoom, y: f.top + (r.top + r.height / 2) * zoom }
          const node = (id) => ({ root: false, acceptsChildren: id.startsWith('n_big'), empty: false })
          let hit = null
          const batches = []
          for (let b = 0; b < 5; b += 1) {
            const started = performance.now()
            for (let i = 0; i < 30; i += 1) hit = mod.canvasHitAt(win, zoom, point, node, null)
            batches.push((performance.now() - started) / 30)
          }
          batches.sort((a, b) => a - b)
          out[size] = { ms: Math.round(batches[2] * 1000) / 1000, over: hit === null ? null : hit.overId }
        }
        return out
      })(${JSON.stringify(SIZES)})`)) as Record<number, { ms: number; over: string | null }> | null
      // eslint-disable-next-line no-console
      console.log(
        `[판정 비용] canvasHitAt 한 번(중앙값 ms · Grid 자식 수별) ${judged === null ? '운영 번들 — 건너뜀' : JSON.stringify(Object.fromEntries(Object.entries(judged).map(([size, v]) => [size, v.ms])))}`,
      )
      expect(
        judged === null
          ? 'skipped'
          : Object.entries(judged).map(([size, v]) => `${size}:${v.over?.startsWith(`big${size}_`) === true}:${v.ms >= 0}`),
      ).toEqual(judged === null ? 'skipped' : SIZES.map((size) => `${size}:true:true`))
    } finally {
      await close()
    }
  })

  it('배치 선 — 자식 수천의 Grid 에서 guideOf 한 번의 시간을 적는다(선 수 포함)', async () => {
    const SIZES = [1000, 3000]
    const { P } = await fixture('cost-guides', SIZES.map(grid))
    const { page, close } = await open(P, 'n_big3000')
    try {
      const started = Date.now()
      await page.getByRole('button', { name: '배치 선', exact: true }).click()
      const counted = await poll(
        '3000 판의 선',
        () =>
          page.evaluate(() => {
            const guide = document.querySelector('[data-wb-guide-for="n_big3000"]')
            return guide === null
              ? null
              : {
                  x: guide.querySelectorAll('[data-wb-guide-line="x"]').length,
                  y: guide.querySelectorAll('[data-wb-guide-line="y"]').length,
                }
          }),
        (value) => value !== null && value.x === 9 && value.y === 299,
        20_000,
      ).catch(() => null)
      const firstDrawMs = Date.now() - started
      const judged = (await page.evaluate(`(async (input) => {
        let mod
        try {
          mod = await import(location.origin + '/src/canvas/layout-guides.tsx')
        } catch {
          return null
        }
        const iframe = document.querySelector('iframe.wb-shell-canvas-iframe')
        const doc = iframe.contentDocument
        const out = {}
        for (const node of input) {
          const element = [...doc.querySelectorAll('[data-wb-id]')].find((el) => el.getAttribute('data-wb-id') === node.id)
          const batches = []
          for (let b = 0; b < 5; b += 1) {
            const started = performance.now()
            for (let i = 0; i < 10; i += 1) mod.guideOf(node, element, iframe.contentWindow)
            batches.push((performance.now() - started) / 10)
          }
          batches.sort((a, b) => a - b)
          out[node.children.length] = Math.round(batches[2] * 1000) / 1000
        }
        return out
      })(${JSON.stringify(SIZES.map(grid))})`)) as Record<number, number> | null
      // eslint-disable-next-line no-console
      console.log(
        `[배치 선 수천] 판정 하나(중앙값 ms · 자식 수별) ${judged === null ? '운영 번들 — 건너뜀' : JSON.stringify(judged)} · 배치 선을 켠 뒤 3000 판의 선이 서기까지 ${firstDrawMs}ms`,
      )
      expect({ counted, judged: judged === null || Object.values(judged).every((ms) => ms >= 0) }).toEqual({
        counted: { x: 9, y: 299 },
        judged: true,
      })
    } finally {
      await close()
    }
  })

  /**
   * 판을 연 뒤 «모든 표본이 창 안에 선다» 까지의 시간(rAF 로 읽는다)과, 남(bob)이 프로젝트 테마의 토큰을 저장한 뒤 alice 의 표본이 새 값으로 바뀔 때까지의 시간 · 그 동안의 긴 작업
   * (PerformanceObserver `longtask` — 50ms 넘는 작업의 수와 시간). 갈래 탭마다(카드 수가 다르다) 적는다 — 카드 하나당 비용이 일정한지로 «카드 30 개»(지금 카탈로그에
   * 둘 수 있는 타입은 17)를 가늠한다.
   */
  it('축소판 — 판을 처음 열 때와 남이 토큰을 저장할 때의 시간을 적는다', async () => {
    const { P, projectId } = await fixture('cost-thumbs', [text('n_t0', '글')], 'system-admin')
    const { page, close } = await open(P, 'n_t0')
    try {
      await page.evaluate(`(() => {
        window.__long = []
        new PerformanceObserver((list) => { for (const e of list.getEntries()) window.__long.push(Math.round(e.duration)) }).observe({ entryTypes: ['longtask'] })
      })()`)
      const allInside = `(() => {
        const iframe = document.querySelector('iframe.wb-shell-palette-thumbs-iframe')
        if (iframe === null) return false
        const f = iframe.getBoundingClientRect()
        const doc = iframe.contentDocument
        const windows = [...document.querySelectorAll('[data-wb-palette-window]')]
        if (windows.length === 0) return false
        return windows.every((win) => {
          const type = win.getAttribute('data-wb-palette-window')
          const wrapper = doc.querySelector('[data-wb-palette-thumb="' + type + '"]')
          const node = wrapper === null ? null : [...wrapper.querySelectorAll('[data-wb-id]')].find((el) => el.getAttribute('data-wb-id') === wrapper.getAttribute('data-wb-palette-node'))
          if (node == null) return false
          const w = win.getBoundingClientRect(), n = node.getBoundingClientRect()
          const left = f.left + n.left, top = f.top + n.top
          return getComputedStyle(wrapper).visibility === 'visible' && n.width > 0 && left >= w.left - 1 && top >= w.top - 1 && left + n.width <= w.right + 1 && top + n.height <= w.bottom + 1
        })
      })()`
      const toggle = page.getByRole('contentinfo', { name: '하단 바' }).getByRole('button', { name: '컴포넌트', exact: true })
      const opened: Record<string, unknown> = {}
      await toggle.click()
      await page.getByRole('region', { name: '컴포넌트 목록' }).waitFor()
      // 갈래 탭만 — 판 맨 위의 «목록 종류» 탭(«컴포넌트» · «모듈»)도 `role="tab"` 이다.
      const tabs = await page.getByRole('tablist', { name: '갈래' }).getByRole('tab').allInnerTexts()
      for (const tab of tabs) {
        // 누른 순간부터 잰다 — 누름 · 그림 · 표본 자리 맞추기가 다 든 시간이다.
        const measured = await page.evaluate(`(async () => {
          const button = [...document.querySelectorAll('[role="tablist"][aria-label="갈래"] [role="tab"]')].find((el) => el.textContent === ${JSON.stringify(tab)})
          const started = performance.now()
          button.click()
          // 다시 그리기 전의 옛 카드가 «다 섰다» 로 읽히지 않게 두 프레임을 먼저 보낸다.
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
          while (!(${allInside}) && performance.now() - started < 8000) await new Promise((resolve) => requestAnimationFrame(resolve))
          return { ms: Math.round(performance.now() - started), cards: document.querySelectorAll('[data-wb-palette-card]').length }
        })()`)
        opened[tab] = measured
      }
      // 처음 여는 값 — 판을 닫았다 다시 열어 첫 그림(깔개가 새로 선다)을 갈래마다가 아니라 한 번 잰다.
      await toggle.click()
      await page.evaluate('window.__long.length = 0')
      const reopened = await page.evaluate(`(async () => {
        const started = performance.now()
        ;[...document.querySelectorAll('button')].find((el) => el.textContent?.trim() === '컴포넌트' && el.getAttribute('aria-controls') === 'wb-shell-palette').click()
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        while (!(${allInside}) && performance.now() - started < 8000) await new Promise((resolve) => requestAnimationFrame(resolve))
        return { ms: Math.round(performance.now() - started), cards: document.querySelectorAll('[data-wb-palette-card]').length, long: window.__long.slice() }
      })()`)
      // 프로젝트 소유자가 토큰을 저장(테마 저장은 owner 의 몫이라 같은 사용자가 다른 탭처럼 저장한다) — 링크 표본의 글 색(주색을 따르는 표지 —
      // 기본테마의 기본 단추는 흰 단추라 주색을 안 쓴다)이 바뀔 때까지.
      const brand = '#123456'
      await page.getByRole('searchbox', { name: '컴포넌트 찾기' }).fill('Link')
      await page.locator('[data-wb-palette-card="Link"]').waitFor()
      const colorOf = `(() => { const doc = document.querySelector('iframe.wb-shell-palette-thumbs-iframe')?.contentDocument; const b = doc?.querySelector('[data-wb-palette-thumb="Link"] [data-wb-component="Link"]'); return b == null ? '' : getComputedStyle(b).color })()`
      await poll(
        '링크 표본',
        async () => String(await page.evaluate(colorOf)),
        (value) => value !== '',
      )
      const before = String(await page.evaluate(colorOf))
      await page.evaluate('window.__long.length = 0')
      await page.evaluate(`(() => {
        window.__changed = null
        const first = ${colorOf}
        const started = performance.now()
        const tick = () => {
          if (${colorOf} !== first) window.__changed = Math.round(performance.now() - started)
          else requestAnimationFrame(tick)
        }
        window.__mark = started
        requestAnimationFrame(tick)
      })()`)
      const color = (await call('GET', `/projects/${projectId}/theme`)).body
      const saved = await call('PUT', `/projects/${projectId}/theme`, {
        themeId: 'system-admin',
        version: seededVersion('system-admin'),
        rev: color.rev,
        tokens: { 'semantic.primary': brand },
      })
      const changed = await poll(
        '표본 색이 바뀐다',
        () => page.evaluate('window.__changed'),
        (value) => typeof value === 'number',
        8000,
      ).catch(() => null)
      const long = (await page.evaluate('window.__long')) as number[]
      // eslint-disable-next-line no-console
      console.log(
        `[축소판 비용] 갈래마다 표본이 다 서기까지 ${JSON.stringify(opened)} · 닫았다 다시 연 첫 그림 ${JSON.stringify(reopened)} · 남이 토큰 저장(${saved.status}) → 표본 색이 바뀌기까지 ${changed}ms · 긴 작업 ${JSON.stringify(long)} · 색 ${before}`,
      )
      expect({
        saved: saved.status,
        changed: typeof changed === 'number',
        opened: Object.keys(opened).length > 0,
        reopenedCards: (reopened as { cards: number }).cards > 0,
      }).toEqual({
        saved: 200,
        changed: true,
        opened: true,
        reopenedCards: true,
      })
    } finally {
      await close()
    }
  })
})
