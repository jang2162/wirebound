/**
 * **RV-CD — 프로젝트 카드 리뷰의 실브라우저 판**(`src/routes/project-list.tsx` · 리뷰 보고 `docs/superpowers/plans/2026-11-02-rv-cd-report.md`).
 * 구현 판(`build-test/project-cards.test.ts`)이 안 잰 갈래를 잰다 — 추가 카드 폼의 실패 · 불러오는 중의 겨룸 · 거름이 걸린 채 만들기 · 키보드 ·
 * 좁은 창과 확대 · 역할.
 *
 * | 케이스 | 재는 값 |
 * |---|---|
 * | 실패 갈래 | 슬러그 중복(409) · 형식 오류(400) · 서버 끊김(POST 를 abort)마다 창 1280 · 390×844 · 390×480 에서 알림의 자리(카드 안 · 목록 위) ·
 *   실패한 그 순간 창 안인가 · `scrollIntoView` 뒤 창 안인가 · 친 글이 남는가 · 포커스 자리 · «취소» 로 닫은 뒤 알림이 남는가 |
 * | 불러오는 중의 겨룸 | 목록 GET 을 붙잡은 채 폼을 열어 치고, 놓아 목록이 닿거나 끊어 실패한 뒤 친 글 · 포커스가 남고 이어 친 글자가 그 칸에 드는가 |
 * | 거름이 걸린 채 만들기 | 검색 · 역할 거름 아래 만든 판이 그 프로젝트로 가는가 · «뒤로» 온 목록에서 그 카드가 보이는가 |
 * | 키보드 | 위 줄 → 추가 카드 → 카드마다 정지점 차례와 접근 이름 · Enter 로 열고 만든 뒤 · Esc 로 닫은 뒤의 포커스 · 방향 제어 글자가 든 이름의 카드 |
 * | 좁은 창 · 확대 | 창 320 · 390 · 확대 200 %(창 1280 · 640) — «열기» · 톱니 · 추가 단추 크기, 연 폼이 카드 안, 뼈대 · 문서 가로 넘침, 넘친 글자 |
 * | 역할 | viewer · editor 카드의 «열기» 가 에디터를, 톱니가 읽기 전용 설정(저장 단추 · «위험 구역» 탭 없음)을 연다 |
 *
 * **실패 갈래의 포커스 · «취소» 두 케이스**는 리뷰 보고 M1 · L1 의 잠금이다 — 요청 중 칸을 잠그면 Chrome 이 포커스를 `body` 로 떨구므로 폼이 실패
 * 뒤 보냈던 칸으로 돌리고(`projects/project-form.tsx` 머리말 «잠그면 포커스가 빠지므로 …»), 폼을 닫으면 그 폼의 실패를 걷는다
 * (`projects/use-project-commands.tsx` 의 `closeForm`).
 */
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, type BrowserContext, type Page, type Route } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { editorStackPrerequisite, startEditorStack, type EditorStack, type Session, type StackUser } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

/** 끊을 자리 없는 긴 영문 이름(`project-cards.test.ts` 의 `LONG_NAME` 머리말 — 한글은 음절 사이에서 꺾여 넘침을 못 낸다). */
const LONG_NAME = 'AnotherVeryLongProjectNameWithoutAnySpaceForNarrowWindows'
/** 방향 제어 글자(덮어쓰기 U+202E)가 든 이름 — 서버는 프로젝트 이름에서 이 글자를 거절하지 않는다(`apps/api/src/routes/projects.ts` 의 `Name`). */
const BIDI_NAME = 'Mallory\u202E'

function grid(page: Page): ReturnType<Page['getByRole']> {
  return page.locator('.wb-shell-workspace-main').getByRole('list', { name: '프로젝트' })
}

/** 지금 포커스 — `body` 이거나 «태그:이름»(접근 이름 → 감싼 label 의 첫 글 → 글). */
function focusOf(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null
    if (el === null || el === document.body) return 'body'
    const label = el.getAttribute('aria-label') ?? el.closest('label')?.firstChild?.textContent?.trim() ?? el.textContent?.trim() ?? ''
    return `${el.tagName.toLowerCase()}:${label}`
  })
}

/** 내용 칸의 알림마다 — 글 · 카드 안인가 · 실패한 그 순간 창 안인가 · 폼과의 거리. */
function alerts(page: Page): Promise<{ text: string; inCard: boolean; inView: boolean; top: number; scrollY: number }[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.wb-shell-workspace-main [role="alert"]')].map((a) => {
      const r = a.getBoundingClientRect()
      return {
        text: a.textContent?.trim() ?? '',
        inCard: a.closest('li.wb-shell-home-add') !== null,
        inView: r.top >= 0 && r.bottom <= window.innerHeight && r.height > 0,
        top: Math.round(r.top),
        scrollY: Math.round(window.scrollY),
      }
    }),
  )
}

/** 알림을 `scrollIntoView` 한 뒤 창 안인가. */
function alertReachable(page: Page): Promise<boolean[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.wb-shell-workspace-main [role="alert"]')].map((a) => {
      a.scrollIntoView({ block: 'nearest' })
      const r = a.getBoundingClientRect()
      return r.top >= 0 && r.bottom <= window.innerHeight && r.height > 0
    }),
  )
}

/** 추가 카드의 폼 칸 값. 폼이 없으면 `null`. */
function formValues(page: Page): Promise<{ name: string; slug: string } | null> {
  return page.evaluate(() => {
    const form = document.querySelector('li.wb-shell-home-add form')
    if (form === null) return null
    const inputs = [...form.querySelectorAll<HTMLInputElement>('input')]
    return { name: inputs[0]?.value ?? '', slug: inputs[1]?.value ?? '' }
  })
}

/** 브라우저 확대를 실은 영속 컨텍스트(`rv-ws-workspace.test.ts` 의 `zoomedContext` 와 같은 꼴 — 사람을 고른다). */
async function zoomedContext(
  stack: EditorStack,
  user: StackUser,
  zoom: number,
  size: { width: number; height: number },
): Promise<BrowserContext> {
  if (!전제.ok) throw new Error('전제 없음')
  const dir = mkdtempSync(join(tmpdir(), 'rv-cd-zoom-'))
  mkdirSync(join(dir, 'Default'), { recursive: true })
  writeFileSync(
    join(dir, 'Default', 'Preferences'),
    JSON.stringify({ partition: { default_zoom_level: { x: Math.log(zoom) / Math.log(1.2) } } }),
  )
  const context = await chromium.launchPersistentContext(dir, {
    executablePath: 전제.executablePath,
    headless: true,
    viewport: null,
    baseURL: stack.webUrl,
    args: [`--window-size=${size.width},${size.height}`],
  })
  const response = await context.request.post(`${stack.webUrl}/api/auth/login`, { data: { email: user.email, password: user.password } })
  if (!response.ok()) throw new Error(`zoom login ${response.status()}`)
  return context
}

/** 카드 · 폼의 크기와 넘침(`project-cards.test.ts` 의 `measure` 에 문서 넘침 · dpr · 창 폭을 더했다). */
function sizes(page: Page): Promise<{
  dpr: number
  innerWidth: number
  cards: number
  minOpenH: number
  minGearH: number
  minGearW: number
  openOverInner: number
  addH: number
  doc: number
  workspace: number
  texts: string[]
  counted: number
}> {
  return page.evaluate(() => {
    const g = document.querySelector('ul[aria-label="프로젝트"]')!
    const cards = [...g.querySelectorAll<HTMLElement>('li.wb-shell-home-card')].filter(
      (li) => li.querySelector('.wb-shell-home-name') !== null,
    )
    let minOpenH = Infinity
    let minGearH = Infinity
    let minGearW = Infinity
    let openOverInner = Infinity
    for (const li of cards) {
      const style = getComputedStyle(li)
      const inner = li.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
      const open = li.querySelector('.wb-shell-home-open')!.getBoundingClientRect()
      const gear = li.querySelector('.wb-shell-home-settings')!.getBoundingClientRect()
      minOpenH = Math.min(minOpenH, open.height)
      minGearH = Math.min(minGearH, gear.height)
      minGearW = Math.min(minGearW, gear.width)
      openOverInner = Math.min(openOverInner, open.width / inner)
    }
    const add = g.querySelector('.wb-shell-home-add-button')?.getBoundingClientRect().height ?? -1
    const box = document.querySelector('.wb-shell-workspace')!
    const width = document.documentElement.clientWidth
    const texts: string[] = []
    let counted = 0
    const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent?.trim()) continue
      const range = document.createRange()
      range.selectNodeContents(n)
      const rects = [...range.getClientRects()]
      if (rects.length === 0) continue
      counted += 1
      const right = Math.max(...rects.map((r) => r.right))
      if (right > width + 0.5) texts.push(`${n.textContent.trim().slice(0, 20)} +${Math.round(right - width)}px`)
    }
    return {
      dpr: window.devicePixelRatio,
      innerWidth: window.innerWidth,
      cards: cards.length,
      minOpenH: Math.round(minOpenH),
      minGearH: Math.round(minGearH),
      minGearW: Math.round(minGearW),
      openOverInner: Math.round(openOverInner * 100) / 100,
      addH: Math.round(add),
      doc: document.documentElement.scrollWidth - width,
      workspace: box.scrollWidth - box.clientWidth,
      texts,
      counted,
    }
  })
}

/** 추가 카드를 연 판 — 폼의 칸 · 단추가 카드 오른끝 안인가 · 넘침. */
function openedForm(page: Page): Promise<{ controls: number; past: number; workspace: number; doc: number }> {
  return page.locator('li.wb-shell-home-add form').evaluate((el) => {
    const card = el.closest('li')!.getBoundingClientRect()
    const all = [...el.querySelectorAll('input, button')]
    const past = all.filter((child) => child.getBoundingClientRect().right > card.right + 0.5)
    const box = document.querySelector('.wb-shell-workspace')!
    return {
      controls: all.length,
      past: past.length,
      workspace: box.scrollWidth - box.clientWidth,
      doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }
  })
}

/** 실패 갈래 한 판의 잰 값. */
interface FailureRun {
  typed: string
  at: { text: string; inCard: boolean; inView: boolean; top: number; scrollY: number }[]
  values: { name: string; slug: string } | null
  focus: string
  reachable: boolean[]
  afterCancel: string[]
  cut: number
}

describe.skipIf(!전제.ok)('RV-CD — 프로젝트 카드 리뷰 실브라우저', () => {
  let stack: EditorStack
  let alice: Session
  const ids = new Map<string, string>()
  const slugs = new Map<string, string>()

  beforeAll(async () => {
    if (!전제.ok) return
    stack = await startEditorStack(전제)
    alice = await stack.login(stack.users.alice)
    const tag = Date.now().toString(36)
    const make = async (name: string, slug: string): Promise<void> => {
      const res = await stack.request(alice, 'POST', '/projects', { name, slug, description: null })
      if (res.status !== 201) throw new Error(`프로젝트 ${res.status} ${JSON.stringify(res.body)}`)
      ids.set(name, res.body.id as string)
      slugs.set(name, slug)
    }
    await make('고객 포털', `portal-${tag}`)
    await make('Report', `report-${tag}`)
    await make(LONG_NAME, `long-${tag}`)
    await make(BIDI_NAME, `bidi-${tag}`)
    // bob — «고객 포털» 의 viewer · «Report» 의 editor.
    for (const [name, role] of [
      ['고객 포털', 'viewer'],
      ['Report', 'editor'],
    ] as const) {
      const res = await stack.request(alice, 'POST', `/projects/${ids.get(name)}/members`, { email: stack.users.bob.email, role })
      if (res.status !== 201 && res.status !== 200) throw new Error(`멤버 ${res.status} ${JSON.stringify(res.body)}`)
    }
  })

  afterAll(async () => {
    if (stack === undefined) return
    const { before, after } = await stack.close()
    expect(before.processes).toBeGreaterThan(0)
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  })

  /**
   * 실패 갈래 판 — 한 번 재고 아래 세 케이스가 나눠 단언한다. 창마다 409(남의 슬러그) · 400(형식) · 끊김(POST 를 abort). 칸이 다시 풀릴 때(요청이
   * 끝남)까지 기다린 뒤 잰다.
   */
  let failureRuns: Promise<Record<string, FailureRun>> | null = null
  function failures(): Promise<Record<string, FailureRun>> {
    failureRuns ??= (async () => {
      const seen: Record<string, FailureRun> = {}
      const kinds = [
        { kind: '409', slug: () => slugs.get('고객 포털')! },
        { kind: '400', slug: () => 'Bad Slug' },
        { kind: 'cut', slug: () => `cut-${Date.now().toString(36)}` },
      ]
      for (const viewport of [
        { width: 1280, height: 900 },
        { width: 390, height: 844 },
        { width: 390, height: 480 },
      ]) {
        for (const { kind, slug } of kinds) {
          const where = `${kind}@${viewport.width}x${viewport.height}`
          const { context, page } = await stack.openTab(stack.users.alice, { viewport })
          try {
            let cut = 0
            if (kind === 'cut') {
              await page.route('**/api/projects', async (route) => {
                if (route.request().method() === 'POST') {
                  cut += 1
                  await route.abort('connectionreset')
                  return
                }
                await route.continue()
              })
            }
            await page.goto('/')
            await page.getByRole('link', { name: '고객 포털 열기', exact: true }).waitFor()
            await grid(page).getByRole('button', { name: '프로젝트 추가', exact: true }).click()
            const card = grid(page).locator('li.wb-shell-home-add')
            await card.getByLabel('이름').fill('실패 판')
            const slugBox = card.getByLabel('슬러그')
            const typed = slug()
            await slugBox.fill(typed)
            // 키보드 사람의 길 — 슬러그 칸에서 Enter.
            await slugBox.press('Enter')
            await page.locator('.wb-shell-workspace-main [role="alert"]').first().waitFor()
            await page.waitForFunction(() => !(document.querySelector('li.wb-shell-home-add input') as HTMLInputElement | null)?.disabled)
            const at = await alerts(page)
            const values = await formValues(page)
            const focus = await focusOf(page)
            const reachable = await alertReachable(page)
            await card.getByRole('button', { name: '취소', exact: true }).click()
            await grid(page).getByRole('button', { name: '프로젝트 추가', exact: true }).waitFor()
            const afterCancel = (await alerts(page)).map((a) => a.text)
            seen[where] = { typed, at, values, focus, reachable, afterCancel, cut }
          } finally {
            await context.close()
          }
        }
      }
      // eslint-disable-next-line no-console
      console.log('[rv-cd 실패 갈래]', JSON.stringify(seen))
      return seen
    })()
    return failureRuns
  }

  it('실패 갈래 — 409 · 400 · 끊김에서 알림이 실패한 그 순간 창 안에 서고 친 글이 남는다', async () => {
    const seen = await failures()
    expect(Object.keys(seen)).toHaveLength(9)
    for (const [where, v] of Object.entries(seen)) {
      // 카나리아 — 알림이 섰고, 끊김 판은 POST 를 끊었다.
      expect(v.at.length, where).toBeGreaterThan(0)
      if (where.startsWith('cut')) expect(v.cut, where).toBeGreaterThan(0)
      expect({ values: v.values, inView: v.at.map((a) => a.inView), reachable: v.reachable }, where).toEqual({
        values: { name: '실패 판', slug: v.typed },
        inView: v.at.map(() => true),
        reachable: v.at.map(() => true),
      })
    }
  })

  it('실패 갈래 — 실패한 뒤 포커스가 폼 안에 남는다(슬러그 칸에서 Enter 로 보낸 판)', async () => {
    const seen = await failures()
    const focus = Object.fromEntries(Object.entries(seen).map(([where, v]) => [where, v.focus]))
    expect(focus).toEqual(Object.fromEntries(Object.keys(seen).map((where) => [where, 'input:슬러그'])))
  })

  it('실패 갈래 — «취소» 로 폼을 닫으면 그 폼의 실패 알림도 걷힌다', async () => {
    const seen = await failures()
    const after = Object.fromEntries(Object.entries(seen).map(([where, v]) => [where, v.afterCancel]))
    expect(after).toEqual(Object.fromEntries(Object.keys(seen).map((where) => [where, []])))
  })

  it('불러오는 중에 연 폼 — 목록이 닿거나 조회가 실패해도 친 글 · 포커스가 남는다', async () => {
    const seen: Record<string, unknown> = {}
    for (const outcome of ['arrive', 'fail'] as const) {
      const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1280, height: 900 } })
      try {
        const held: Route[] = []
        let mode: 'hold' | 'pass' | 'abort' = 'hold'
        await page.route('**/api/projects', async (route) => {
          if (route.request().method() !== 'GET') return route.continue()
          if (mode === 'pass') return route.continue()
          if (mode === 'abort') return route.abort('connectionreset')
          held.push(route)
        })
        await page.goto('/')
        await page.getByText('불러오는 중…').waitFor()
        await grid(page).getByRole('button', { name: '프로젝트 추가', exact: true }).click()
        const card = grid(page).locator('li.wb-shell-home-add')
        await card.getByLabel('이름').pressSequentially('도중')
        await page.keyboard.press('Tab')
        await page.keyboard.type('mid')
        const heldCount = held.length
        mode = outcome === 'arrive' ? 'pass' : 'abort'
        for (const route of held.splice(0)) await (outcome === 'arrive' ? route.continue() : route.abort('connectionreset'))
        if (outcome === 'arrive') await page.getByRole('link', { name: '고객 포털 열기', exact: true }).waitFor()
        else await page.locator('.wb-shell-workspace-main [role="alert"]').first().waitFor()
        const values = await formValues(page)
        const focus = await focusOf(page)
        // 이어 친 글자가 그 칸에 드는가 — 포커스 · 캐럿이 그대로인지의 값.
        await page.keyboard.type('dle')
        const typed = await formValues(page)
        seen[outcome] = { heldCount, values, focus, typed }
      } finally {
        await context.close()
      }
    }
    // eslint-disable-next-line no-console
    console.log('[rv-cd 불러오는 중]', JSON.stringify(seen))
    for (const outcome of ['arrive', 'fail']) {
      const v = seen[outcome] as { heldCount: number; values: unknown; focus: string; typed: unknown }
      expect(v.heldCount, outcome).toBeGreaterThan(0)
      expect({ values: v.values, focus: v.focus, typed: v.typed }, outcome).toEqual({
        values: { name: '도중', slug: 'mid' },
        focus: 'input:슬러그',
        typed: { name: '도중', slug: 'middle' },
      })
    }
  })

  it('거름이 걸린 채 만들기 — 만든 프로젝트로 가고, «뒤로» 온 목록에서 그 카드가 보이는가', async () => {
    const seen: Record<string, unknown> = {}
    for (const [label, query] of [
      ['검색 0 건', '?q=zzzz-none'],
      ['viewer 거름', '?role=viewer'],
    ] as const) {
      const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1280, height: 900 } })
      try {
        await page.goto(`/${query}`)
        await grid(page).getByRole('button', { name: '프로젝트 추가', exact: true }).waitFor()
        await page.locator('.wb-shell-home-count').waitFor()
        const name = `거름 판 ${label}`
        const slug = `filtered-${Date.now().toString(36)}`
        await grid(page).getByRole('button', { name: '프로젝트 추가', exact: true }).click()
        const card = grid(page).locator('li.wb-shell-home-add')
        await card.getByLabel('이름').fill(name)
        await card.getByLabel('슬러그').fill(slug)
        await card.getByRole('button', { name: '만들기', exact: true }).click()
        // 판이 섰다는 것(목록을 떠났다)만 기다리고 주소는 값으로 그 자리에서 견준다.
        await page.waitForURL((url) => url.pathname !== '/')
        const created = await stack.query<{ id: string }>('select id from projects where slug = $1', [slug])
        const landed = new URL(page.url()).pathname === `/projects/${created[0]?.id}`
        expect(landed, label).toBe(true)
        await page.getByRole('region', { name: '메뉴·페이지 트리' }).waitFor()
        await page.goBack()
        await page.locator('.wb-shell-home-count').waitFor()
        const back = {
          search: new URL(page.url()).search,
          count: (await page.locator('.wb-shell-home-count').textContent()) ?? '',
          visible: await grid(page)
            .getByRole('link', { name: `${name} 열기`, exact: true })
            .count(),
        }
        seen[label] = { landed, back }
      } finally {
        await context.close()
      }
    }
    // eslint-disable-next-line no-console
    console.log('[rv-cd 거름 아래 만들기]', JSON.stringify(seen))
    for (const [label, v] of Object.entries(seen) as [string, { landed: boolean }][]) expect(v.landed, label).toBe(true)
  })

  it('키보드 — 정지점 차례 · 접근 이름 · 열고 만든 뒤 · Esc 뒤 포커스', async () => {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1280, height: 900 } })
    const seen: Record<string, unknown> = {}
    try {
      await page.goto('/')
      await page.getByRole('link', { name: '고객 포털 열기', exact: true }).waitFor()
      await page.locator('.wb-shell-home-search input').focus()
      const stops: string[] = []
      for (let i = 0; i < 9; i += 1) {
        await page.keyboard.press('Tab')
        stops.push(await focusOf(page))
      }
      seen.stops = stops
      // 접근 이름 — 방향 제어 글자가 든 이름의 카드.
      const bidiCard = grid(page).locator('li.wb-shell-home-card', { has: page.locator('.wb-shell-home-name', { hasText: 'Mallory' }) })
      seen.bidi = await bidiCard.evaluate((li) => {
        const name = li.querySelector('.wb-shell-home-name')!.getBoundingClientRect()
        const badge = li.querySelector('.wb-shell-home-role')?.getBoundingClientRect()
        const open = li.querySelector('.wb-shell-home-open')!
        const gear = li.querySelector('.wb-shell-home-settings')!
        const esc = (s: string | null): string =>
          (s ?? '').replace(/[\u202A-\u202E\u2066-\u2069]/g, (c) => `<U+${c.charCodeAt(0).toString(16).toUpperCase()}>`)
        return {
          openLabel: esc(open.getAttribute('aria-label')),
          gearTitle: esc(gear.getAttribute('title')),
          badgeRightOfName: badge === undefined ? null : badge.left >= name.right - 0.5,
          openText: open.textContent?.trim(),
        }
      })
      seen.bidiByRole = {
        open: await grid(page)
          .getByRole('link', { name: `${BIDI_NAME} 열기`, exact: true })
          .count(),
        gear: await grid(page)
          .getByRole('link', { name: `${BIDI_NAME} 설정`, exact: true })
          .count(),
      }

      // Esc 로 닫은 뒤 · «취소» 로 닫은 뒤.
      const add = grid(page).getByRole('button', { name: '프로젝트 추가', exact: true })
      await add.focus()
      await page.keyboard.press('Enter')
      seen.afterOpen = await focusOf(page)
      await page.keyboard.press('Escape')
      seen.afterEsc = await focusOf(page)
      await page.keyboard.press('Enter')
      await page.keyboard.press('Tab')
      await page.keyboard.press('Tab')
      await page.keyboard.press('Tab')
      await page.keyboard.press('Tab')
      seen.tabToCancel = await focusOf(page)
      await page.keyboard.press('Enter')
      seen.afterCancel = await focusOf(page)

      // 열고 · 치고 · Enter 로 만든 뒤.
      await page.keyboard.press('Enter')
      await page.keyboard.type('키보드 판')
      await page.keyboard.press('Tab')
      await page.keyboard.type(`kbd-${Date.now().toString(36)}`)
      await page.keyboard.press('Enter')
      await page.waitForURL(/\/projects\/[^/?]+$/)
      await page.getByRole('region', { name: '메뉴·페이지 트리' }).waitFor()
      seen.afterCreate = await focusOf(page)
    } finally {
      await context.close()
    }
    // eslint-disable-next-line no-console
    console.log('[rv-cd 키보드]', JSON.stringify(seen))
    expect(seen.afterOpen).toBe('input:이름')
    expect(seen.afterEsc).toBe('button:프로젝트 추가')
    expect(seen.tabToCancel).toBe('button:취소')
    expect(seen.afterCancel).toBe('button:프로젝트 추가')
    // 위 줄 둘 → 추가 카드 → 카드마다 «이름 → <이름> 열기 → <이름> 설정».
    const stops = seen.stops as string[]
    expect(stops.slice(0, 3)).toEqual(['select:역할', 'select:정렬', 'button:프로젝트 추가'])
    const first = stops[3]!.slice('a:'.length)
    const second = stops[6]!.slice('a:'.length)
    expect(stops.slice(3)).toEqual([
      `a:${first}`,
      `a:${first} 열기`,
      `a:${first} 설정`,
      `a:${second}`,
      `a:${second} 열기`,
      `a:${second} 설정`,
    ])
    expect(seen.bidiByRole).toEqual({ open: 1, gear: 1 })
  })

  it('좁은 창 320 · 390 · 확대 200 % — 눌리는 크기 · 연 폼이 카드 안 · 가로 넘침 0', async () => {
    const seen: Record<string, unknown> = {}
    const measureHere = async (page: Page, where: string): Promise<void> => {
      await page.goto('/')
      await page.getByRole('link', { name: '고객 포털 열기', exact: true }).waitFor()
      const got = await sizes(page)
      await grid(page).getByRole('button', { name: '프로젝트 추가', exact: true }).click()
      await grid(page).locator('li.wb-shell-home-add form').waitFor()
      seen[where] = { ...got, form: await openedForm(page) }
    }
    for (const width of [320, 390]) {
      const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width, height: 800 } })
      try {
        await measureHere(page, `창 ${width}`)
      } finally {
        await context.close()
      }
    }
    for (const window of [
      { width: 1280, height: 800 },
      { width: 640, height: 800 },
    ]) {
      const context = await zoomedContext(stack, stack.users.alice, 2, window)
      try {
        const page = context.pages()[0] ?? (await context.newPage())
        await measureHere(page, `확대 200% 창 ${window.width}`)
      } finally {
        await context.close()
      }
    }
    // eslint-disable-next-line no-console
    console.log('[rv-cd 좁은 창]', JSON.stringify(seen))
    for (const [where, raw] of Object.entries(seen)) {
      const v = raw as Awaited<ReturnType<typeof sizes>> & { form: Awaited<ReturnType<typeof openedForm>> }
      // 카나리아 — 카드 넷을 쟀고, 확대 판은 확대가 실렸다.
      expect(v.cards, where).toBeGreaterThanOrEqual(4)
      expect(v.counted, where).toBeGreaterThan(10)
      if (where.startsWith('확대')) expect(v.dpr, where).toBeCloseTo(2, 1)
      expect(
        {
          openH: v.minOpenH >= 36,
          gear: v.minGearH >= 36 && v.minGearW >= 36,
          add: v.addH >= 36,
          open60: v.openOverInner >= 0.6,
          doc: v.doc,
          workspace: v.workspace,
          texts: v.texts,
          form: { past: v.form.past, workspace: v.form.workspace, doc: v.form.doc },
        },
        where,
      ).toEqual({
        openH: true,
        gear: true,
        add: true,
        open60: true,
        doc: 0,
        workspace: 0,
        texts: [],
        form: { past: 0, workspace: 0, doc: 0 },
      })
    }
  })

  it('역할 — viewer · editor 카드의 «열기» 는 에디터, 톱니는 읽기 전용 설정', async () => {
    const seen: Record<string, unknown> = {}
    const { context, page } = await stack.openTab(stack.users.bob, { viewport: { width: 1280, height: 900 } })
    try {
      for (const [name, role] of [
        ['고객 포털', 'viewer'],
        ['Report', 'editor'],
      ] as const) {
        await page.goto('/')
        await page.getByRole('link', { name: `${name} 열기`, exact: true }).click()
        await page.waitForURL(/\/projects\/[^/?]+$/)
        await page.getByRole('region', { name: '메뉴·페이지 트리' }).waitFor()
        const editor = new URL(page.url()).pathname
        await page.goBack()
        await page.getByRole('link', { name: `${name} 설정`, exact: true }).click()
        await page.waitForURL(/\/settings/)
        const nameBox = page.locator('.wb-shell-workspace-main').getByLabel('이름', { exact: true })
        await nameBox.waitFor()
        seen[role] = {
          editor: editor === `/projects/${ids.get(name)}`,
          settings: new URL(page.url()).pathname === `/projects/${ids.get(name)}/settings`,
          readOnly: await nameBox.evaluate((el) => (el as HTMLInputElement).readOnly),
          save: await page.getByRole('button', { name: '저장', exact: true }).count(),
          danger: await page.getByRole('tab', { name: '위험 구역' }).count(),
        }
      }
    } finally {
      await context.close()
    }
    // eslint-disable-next-line no-console
    console.log('[rv-cd 역할]', JSON.stringify(seen))
    for (const role of ['viewer', 'editor']) {
      expect(seen[role], role).toEqual({ editor: true, settings: true, readOnly: true, save: 0, danger: 0 })
    }
  })
})
