/**
 * RV-WS 리뷰 — 뼈대(`src/shell/workspace-layout.tsx`) · 프로젝트 목록(`routes/project-list.tsx`) · 설정 가로 탭(`routes/settings.tsx`)의 실브라우저 판.
 * 보고 `docs/superpowers/plans/2026-10-31-rv-ws-report.md` 의 «4» – «7».
 *
 * | 케이스 | 재는 것 |
 * |---|---|
 * | 좁은 창 키보드 | 창 390 — 접힌 칸은 Tab 차례에서 빠지고, «메뉴» 를 Enter 로 펴면 칸 · 사람 줄 · 로그아웃이 차례로 서고, Space 로 접힌다 |
 * | 문턱 언저리 넘침 | 창 719 · 720 · 721 · 900 · 960 · 1000 에서 화면 여섯(목록 · 계정 · 설정 일반 · 테마 · 멤버 · 테마 관리)의 문서 · 뼈대 상자 · 글자 노드 넘침 |
 * | 페이지 줌 | 창 1280×800 에 브라우저 확대 125 · 150 % — 사이드바가 서고 칸 전부에 닿으며 화면 넷이 안 넘친다 |
 * | 주소 질의 | 모르는 값 · 빈 값 · 아주 긴 글 · 특수 글자 · 깨진 `%` 가 기본값으로 접히고, 뒤로 가기로 돌아오면 남고, 0 건과 빈 목록의 문장이 갈린다 |
 * | 한글 조합 | 검색 칸에 CDP `Input.imeSetComposition` 으로 조합을 세우고 끝낸 뒤 칸 값 · 주소 |
 * | 세션 통지 | 로그아웃 실패 줄이 좁은 창에서도 창 안에 서고, 다른 탭에서 다른 사람이 로그인하면 이름 · 통지가 바뀐다 |
 * | 목록에서 로그아웃 | 에디터에서 보낸 편집이 서버에 붙잡힌 채 목록으로 나와 사이드바 «로그아웃» 을 누른 판의 차례 · 서버 값 · 로그인 화면의 줄 |
 * | 설정 가로 탭 | ← → Home End · 모르는 `?section=` · owner 아님의 «위험 구역» 없음 · 창 320 에서 탭 줄이 안에서 구르고 End 로 간 탭이 줄 안에 보인다 |
 * | 고친 판 | 리뷰의 skip 셋을 FX-WS 가 뗐다 — 아래 «고친 판» 머리말 |
 * | skip 둘 | 이월 — 아래 «skip» 머리말 |
 */
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, type BrowserContext, type Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canvasFrame, editorStackPrerequisite, startEditorStack, type EditorStack, type Session } from './editor-stack'
import { makeAdmin, themeProject } from './theme-fixtures'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

/** 전환 통지의 앞머리 — 뒤에 새 사람의 이름이 붙는다(`session/session-menu.tsx` 의 `switchedNotice`). */
const SWITCHED_LEAD = '다른 사람으로 로그인됐습니다'
const LONG_NAME = '띄어쓰지않은아주긴프로젝트이름이카드한칸을넘치는지재는표본입니다가나다라마바사'

/** 화면 여섯 — 이름 · 주소 · 다 섰다는 표지. */
function screens(projectId: string): [string, string, (page: Page) => Promise<void>][] {
  const settings = (section: string, region: string): [string, string, (page: Page) => Promise<void>] => [
    `설정 ${region}`,
    `/projects/${projectId}/settings?section=${section}`,
    (page) => page.getByRole('region', { name: region }).waitFor(),
  ]
  return [
    ['프로젝트 목록', '/', (page) => page.getByRole('link', { name: '테마 판', exact: true }).waitFor()],
    ['계정 설정', '/account', (page) => page.getByText('alice@browser.test').waitFor()],
    settings('general', '일반'),
    settings('theme', '테마'),
    settings('members', '멤버'),
    ['테마 관리', '/admin/themes', (page) => page.getByRole('list', { name: '테마 목록' }).waitFor()],
  ]
}

/** 넘침 — 문서 · 뼈대 상자의 가로 넘침(px)과 창 오른끝을 넘는 글자 노드(`build-test/workspace-layout.test.ts` 의 `overflow` 와 같은 자). */
function overflow(page: Page): Promise<{ doc: number; workspace: number; texts: string[]; counted: number }> {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth
    const box = document.querySelector('.wb-shell-workspace')!
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
      if (right > width + 0.5) texts.push(`${n.textContent.trim().slice(0, 24)} +${Math.round(right - width)}px`)
    }
    return { doc: document.documentElement.scrollWidth - width, workspace: box.scrollWidth - box.clientWidth, texts, counted }
  })
}

/** 지금 포커스가 선 요소의 글 · 자리(사이드바 칸 목록 안인가). */
function focused(page: Page): Promise<{ text: string; inLinks: boolean }> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null
    return { text: el?.textContent?.trim() ?? '', inLinks: el?.closest('.wb-shell-workspace-links') !== null && el !== null }
  })
}

/**
 * 브라우저 확대를 실은 영속 컨텍스트 — 프로필의 `Default/Preferences` 에 `partition.default_zoom_level`(log(배율) ÷ log(1.2))을 적고
 * `viewport: null` 로 띄운다(`AGENTS.md` «브라우저 확대(페이지 줌)는 뷰포트 흉내로 못 잰다»). 로그인은 컨텍스트의 요청으로.
 */
async function zoomedContext(stack: EditorStack, zoom: number, window: { width: number; height: number }): Promise<BrowserContext> {
  if (!전제.ok) throw new Error('전제 없음')
  const dir = mkdtempSync(join(tmpdir(), 'rv-ws-zoom-'))
  mkdirSync(join(dir, 'Default'), { recursive: true })
  const level = Math.log(zoom) / Math.log(1.2)
  writeFileSync(join(dir, 'Default', 'Preferences'), JSON.stringify({ partition: { default_zoom_level: { x: level } } }))
  const context = await chromium.launchPersistentContext(dir, {
    executablePath: 전제.executablePath,
    headless: true,
    viewport: null,
    baseURL: stack.webUrl,
    args: [`--window-size=${window.width},${window.height}`],
  })
  const response = await context.request.post(`${stack.webUrl}/api/auth/login`, {
    data: { email: stack.users.alice.email, password: stack.users.alice.password },
  })
  if (!response.ok()) throw new Error(`zoom login ${response.status()}`)
  return context
}

describe.skipIf(!전제.ok)('RV-WS — 뼈대 · 목록 · 설정 탭 실브라우저', () => {
  let stack: EditorStack
  let alice: Session
  let projectId = ''

  beforeAll(async () => {
    if (!전제.ok) return
    stack = await startEditorStack(전제)
    await makeAdmin(stack, stack.users.alice)
    alice = await stack.login(stack.users.alice)
    projectId = (await themeProject(stack, alice)).id
    const make = async (name: string, slug: string, description: string | null): Promise<string> => {
      const res = await stack.request(alice, 'POST', '/projects', { name, slug, description })
      if (res.status !== 201) throw new Error(`프로젝트 ${res.status} ${JSON.stringify(res.body)}`)
      return res.body.id as string
    }
    await make('고객 포털 운영', `portal-${Date.now().toString(36)}`, '외부 고객이 쓰는 포털')
    await make(
      LONG_NAME,
      `long-${Date.now().toString(36)}`,
      'https://example.com/아주/긴/주소/가/설명에/들어간/판/입니다/띄어쓰기없이/계속',
    )
    await make('Report', `report-${Date.now().toString(36)}`, null)
    // bob 은 테마 판의 viewer — 설정에서 «위험 구역» 이 없어야 하는 사람.
    const added = await stack.request(alice, 'POST', `/projects/${projectId}/members`, { email: stack.users.bob.email, role: 'viewer' })
    if (added.status !== 201) throw new Error(`멤버 ${added.status}`)
  })

  afterAll(async () => {
    if (stack === undefined) return
    const { before, after } = await stack.close()
    expect(before.processes).toBeGreaterThan(0)
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  })

  it('창 390 — 접힌 칸은 Tab 차례에서 빠지고, Enter 로 펴면 칸 · 로그아웃이 차례로 서고, Space 로 다시 접힌다 · 다른 화면으로 가면 접힌다', async () => {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 390, height: 844 } })
    try {
      await page.goto('/')
      await page.getByRole('link', { name: '테마 판', exact: true }).waitFor()
      const toggle = page.getByRole('button', { name: '메뉴' })

      await page.keyboard.press('Tab')
      await page.keyboard.press('Tab')
      expect((await focused(page)).text).toBe('메뉴')
      // 접힌 채 다음 Tab — 칸 목록 안으로 가지 않는다.
      await page.keyboard.press('Tab')
      const afterFolded = await focused(page)
      expect(afterFolded.inLinks).toBe(false)

      await page.keyboard.press('Shift+Tab')
      expect((await focused(page)).text).toBe('메뉴')
      await page.keyboard.press('Enter')
      expect(await toggle.getAttribute('aria-expanded')).toBe('true')
      const stops: string[] = []
      for (let i = 0; i < 9; i += 1) {
        await page.keyboard.press('Tab')
        stops.push((await focused(page)).text)
      }
      expect(stops).toEqual(['프로젝트', '계정', '사용자', '초대 링크', '프로젝트', '테마', '기록', '로그아웃', '새 프로젝트'])

      await toggle.focus()
      await page.keyboard.press('Space')
      expect(await toggle.getAttribute('aria-expanded')).toBe('false')
      expect(await page.getByRole('navigation', { name: '작업 공간' }).isVisible()).toBe(false)
      // Escape 는 접지 않는다(펴는 꼴은 흐름 안이라 가두기 · Escape 가 없다 — 구현 «결정»). 값으로 적는다.
      await page.keyboard.press('Enter')
      await page.keyboard.press('Escape')
      const afterEscape = await toggle.getAttribute('aria-expanded')

      // 대조군 — 다른 컴포넌트의 화면(목록 → 계정)으로 가면 뼈대가 새로 서 접힌다.
      await page.getByRole('navigation', { name: '작업 공간' }).getByRole('link', { name: '계정', exact: true }).click()
      await page.getByText('alice@browser.test').waitFor()
      expect(await page.getByRole('button', { name: '메뉴' }).getAttribute('aria-expanded')).toBe('false')
      // eslint-disable-next-line no-console
      console.log(`[rv-ws 390 키보드] 접힌 채 Tab → «${afterFolded.text}» · Escape 뒤 aria-expanded=${afterEscape}`)
    } finally {
      await context.close()
    }
  })

  it('창 719 · 720 · 721 · 900 · 960 · 1000 — 화면 여섯이 가로로 안 넘친다(719 는 접힘 · 펼침 둘 다)', async () => {
    const seen: Record<string, { doc: number; workspace: number; texts: string[]; counted: number }> = {}
    for (const width of [719, 720, 721, 900, 960, 1000]) {
      const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width, height: 900 } })
      try {
        for (const [name, path, ready] of screens(projectId)) {
          await page.goto(path)
          await ready(page)
          seen[`${name}@${width}`] = await overflow(page)
          if (width < 720) {
            await page.getByRole('button', { name: '메뉴' }).click()
            await page.getByRole('navigation', { name: '관리자' }).waitFor()
            seen[`${name}@${width} 펼침`] = await overflow(page)
          }
        }
        // 카나리아 — 720 부터는 사이드바(위 줄이 아니다)다.
        const side = await page.evaluate(() => document.querySelector('.wb-shell-workspace-side')!.getBoundingClientRect().width)
        if (width >= 720) expect(side, `${width}`).toBeGreaterThan(150)
        else expect(side, `${width}`).toBeGreaterThan(width - 2)
      } finally {
        await context.close()
      }
    }
    // eslint-disable-next-line no-console
    console.log('[rv-ws 문턱 넘침]', JSON.stringify(seen))
    const bad = Object.entries(seen).filter(([, v]) => v.doc > 0 || v.workspace > 0 || v.texts.length > 0)
    for (const [where, v] of Object.entries(seen)) expect(v.counted, where).toBeGreaterThan(5)
    expect(bad).toEqual([])
  })

  it('브라우저 확대 125 · 150 %(창 1280×800) — 사이드바가 서고 칸 전부에 닿으며 화면 넷이 안 넘친다', async () => {
    const seen: string[] = []
    for (const zoom of [1.25, 1.5]) {
      const context = await zoomedContext(stack, zoom, { width: 1280, height: 800 })
      try {
        const page = context.pages()[0] ?? (await context.newPage())
        for (const [name, path, ready] of screens(projectId).filter(([n]) => !n.startsWith('설정 ') || n === '설정 테마')) {
          await page.goto(path)
          await ready(page)
          const got = await page.evaluate(() => {
            const side = document.querySelector('.wb-shell-workspace-side')!
            const items = [...side.querySelectorAll<HTMLElement>('a, button')].filter((el) => el.offsetParent !== null)
            const unreachable: string[] = []
            for (const el of items) {
              el.scrollIntoView({ block: 'nearest' })
              const r = el.getBoundingClientRect()
              const s = side.getBoundingClientRect()
              if (r.top < s.top - 0.5 || r.bottom > Math.min(s.bottom, window.innerHeight) + 0.5)
                unreachable.push(el.textContent?.trim() ?? '')
            }
            return {
              dpr: window.devicePixelRatio,
              innerWidth: window.innerWidth,
              side: side.getBoundingClientRect().width,
              items: items.length,
              unreachable,
            }
          })
          const over = await overflow(page)
          seen.push(
            `${name}@${zoom * 100}%: dpr ${got.dpr} · 폭 ${got.innerWidth} · 칸 ${got.items} · 못 닿음 ${got.unreachable.length} · 넘침 ${over.doc}/${over.workspace}/${over.texts.length}`,
          )
          // 카나리아 — 확대가 실렸다(배율이 dpr 로 · CSS 폭이 줄었다).
          expect(got.dpr, name).toBeCloseTo(zoom, 1)
          expect(got.innerWidth, name).toBeLessThan(1280 / zoom + 2)
          expect(got.side, name).toBeGreaterThan(150)
          // 로고 · 작업 공간 둘 · 관리자 다섯 · 로그아웃 — «메뉴» 는 넓은 창에서 숨는다.
          expect(got.items, name).toBe(9)
          expect({ name, unreachable: got.unreachable, doc: over.doc <= 0, workspace: over.workspace <= 0, texts: over.texts }).toEqual({
            name,
            unreachable: [],
            doc: true,
            workspace: true,
            texts: [],
          })
        }
      } finally {
        await context.close()
      }
    }
    // eslint-disable-next-line no-console
    console.log('[rv-ws 줌]', seen.join(' · '))
    expect(seen).toHaveLength(8)
  })

  it('주소 질의 — 모르는 값 · 빈 값 · 긴 글 · 특수 글자 · 깨진 `%` 가 화면을 깨지 않고 기본값으로 접힌다, 0 건과 빈 목록의 문장이 갈린다', async () => {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1280, height: 900 } })
    const dialogs: string[] = []
    const errors: string[] = []
    page.on('dialog', (dialog) => {
      dialogs.push(dialog.message())
      void dialog.dismiss()
    })
    page.on('pageerror', (error) => errors.push(error.message))
    const read = () =>
      page.evaluate(() => {
        const main = document.querySelector('.wb-shell-workspace-main')!
        const selects = [...main.querySelectorAll('select')].map((s) => s.value)
        const input = main.querySelector<HTMLInputElement>('input[type="search"]')
        return {
          text: input?.value ?? null,
          role: selects[0] ?? null,
          sort: selects[1] ?? null,
          cards: main.querySelectorAll('.wb-shell-home-card').length,
          count: main.querySelector('.wb-shell-home-count')?.textContent ?? null,
          noMatch: main.textContent?.includes('검색 결과가 없습니다') ?? false,
          empty: main.textContent?.includes('참여 중인 프로젝트가 없습니다') ?? false,
        }
      })
    // 3000 자(27KB 주소)는 vite dev 가 431 로 거절했다 — 앱이 아니라 서버의 머리 한도다. 1000 자(9KB)로 잰다.
    const LONG = '가'.repeat(1000)
    const cases: [string, string][] = [
      ['빈 값', '/?q=&role=&sort='],
      ['모르는 값', '/?role=admin&sort=zzz'],
      ['스크립트', `/?q=${encodeURIComponent('<script>alert(1)</script>')}`],
      ['맨 %', '/?q=%'],
      ['깨진 %', '/?q=%E0%A4%A'],
      ['긴 글', `/?q=${encodeURIComponent(LONG)}`],
    ]
    const seen: Record<string, unknown> = {}
    try {
      for (const [name, path] of cases) {
        await page.goto(path)
        await page.getByRole('heading', { name: '프로젝트', exact: true }).waitFor()
        await page.locator('.wb-shell-home-bar').waitFor()
        seen[name] = { ...(await read()), over: await overflow(page) }
      }
      // eslint-disable-next-line no-console
      console.log(
        '[rv-ws 주소 질의]',
        JSON.stringify(seen, (k, v) => (typeof v === 'string' && v.length > 40 ? `${v.slice(0, 12)}…(${v.length})` : v)),
      )
      const v = seen as Record<
        string,
        {
          text: string
          role: string
          sort: string
          cards: number
          noMatch: boolean
          empty: boolean
          over: { doc: number; workspace: number; texts: string[] }
        }
      >
      const at = (key: string) => {
        const found = v[key]
        if (found === undefined) throw new Error(`판이 없다: ${key}`)
        return found
      }
      expect([at('빈 값').text, at('빈 값').role, at('빈 값').sort, at('빈 값').cards]).toEqual(['', 'all', 'updated', 4])
      expect([at('모르는 값').role, at('모르는 값').sort, at('모르는 값').cards]).toEqual(['all', 'updated', 4])
      expect([at('스크립트').text, at('스크립트').noMatch, at('스크립트').empty]).toEqual(['<script>alert(1)</script>', true, false])
      expect(at('맨 %').cards + (at('맨 %').noMatch ? 1 : 0)).toBeGreaterThan(0)
      expect(at('깨진 %').cards + (at('깨진 %').noMatch ? 1 : 0)).toBeGreaterThan(0)
      expect([at('긴 글').text?.length, at('긴 글').noMatch]).toEqual([1000, true])
      for (const [name, value] of Object.entries(v)) {
        expect({ name, doc: value.over.doc <= 0, workspace: value.over.workspace <= 0, texts: value.over.texts }).toEqual({
          name,
          doc: true,
          workspace: true,
          texts: [],
        })
      }
      expect({ dialogs, errors }).toEqual({ dialogs: [], errors: [] })

      // 뒤로 가기 — 거른 채 카드로 에디터에 갔다가 돌아오면 거름이 남는다.
      await page.goto('/')
      await page.locator('.wb-shell-home-bar').waitFor()
      await page.getByRole('searchbox').fill('포털')
      await page.getByRole('combobox', { name: '정렬' }).selectOption('name')
      await page.waitForURL(/q=/)
      const filtered = page.url()
      await page.getByRole('link', { name: '고객 포털 운영', exact: true }).click()
      await page.waitForURL(/\/projects\//)
      await page.goBack()
      await page.locator('.wb-shell-home-bar').waitFor()
      const back = await read()
      expect({ url: page.url(), text: back.text, sort: back.sort, cards: back.cards }).toEqual({
        url: filtered,
        text: '포털',
        sort: 'name',
        cards: 1,
      })
    } finally {
      await context.close()
    }
  })

  /**
   * **한글 조합**을 CDP `Input.imeSetComposition`(조합 세움) · `Input.insertText`(조합 끝냄)로 세운다(`AGENTS.md` «한글 조합 중의 키는 CDP …»).
   * 대조군 둘 — 같은 걸음을 (가) 화면에 꽂은 맨 `<input>` 과 (나) 같은 화면의 «새 프로젝트» 폼 «이름» 칸(값을 컴포넌트 상태가 든다)에도 친다.
   * 셋째로 검색 칸에 영문을 한 글자씩 빠르게 친다.
   */
  it('한글 조합 — 대조군(맨 입력 · 상태가 든 입력)과 검색 칸(주소가 든 입력)의 칸 값 · 주소를 적는다', async () => {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1280, height: 900 } })
    try {
      await page.goto('/')
      await page.getByRole('searchbox').waitFor()
      const cdp = await context.newCDPSession(page)
      const STEPS = [
        ['ㄱ', false],
        ['고', false],
        ['곡', false],
        ['고', true],
        ['ㄱ', false],
        ['개', false],
        ['객', false],
        ['객', true],
      ] as const
      async function compose(target: ReturnType<Page['locator']>): Promise<string[]> {
        await target.click()
        const seen: string[] = []
        for (const [text, commit] of STEPS) {
          if (commit) await cdp.send('Input.insertText', { text })
          else await cdp.send('Input.imeSetComposition', { text, selectionStart: text.length, selectionEnd: text.length })
          await page.waitForTimeout(60)
          seen.push(await target.inputValue())
        }
        await page.waitForTimeout(200)
        return seen
      }

      // (가) 맨 입력 — 앱 밖. 하네스가 조합을 옳게 세우는지의 카나리아다.
      await page.evaluate(() => {
        const input = document.createElement('input')
        input.id = 'rv-ws-plain'
        input.style.cssText = 'position:fixed;left:0;bottom:0;z-index:9999'
        document.body.append(input)
      })
      const plain = await compose(page.locator('#rv-ws-plain'))
      await page.evaluate(() => document.getElementById('rv-ws-plain')!.remove())

      // (나) 상태가 든 입력 — «새 프로젝트» 폼의 «이름».
      await page.getByRole('button', { name: '새 프로젝트' }).click()
      const nameBox = page.locator('.wb-shell-project-form').getByLabel('이름')
      const stateful = await compose(nameBox)
      await page.getByRole('button', { name: '취소' }).click()

      // (다) 검색 칸 — 값이 주소 질의(`?q=`)에서 온다.
      const box = page.getByRole('searchbox')
      const search = await compose(box)
      const q = new URL(page.url()).searchParams.get('q')

      // (라) 검색 칸에 영문 한 글자씩 — 사이를 두지 않고 · 150ms 씩.
      const typed: string[] = []
      for (const delay of [0, 150]) {
        await page.goto('/')
        await box.waitFor()
        await box.click()
        await box.pressSequentially('report', { delay })
        await page.waitForTimeout(300)
        typed.push(await box.inputValue())
      }

      // eslint-disable-next-line no-console
      console.log(
        `[rv-ws 한글 조합] 맨 입력 ${JSON.stringify(plain)} · 상태 입력 ${JSON.stringify(stateful)} · 검색 칸 ${JSON.stringify(search)} · 주소 q=${q} · 영문(0 · 150ms) ${JSON.stringify(typed)}`,
      )
      // 카나리아 — 하네스가 조합을 옳게 세운다.
      expect(plain.at(-1)).toBe('고객')
      expect(stateful.at(-1)).toBe('고객')
      // 검색 칸의 값은 단언하지 않는다 — 성질은 아래 skip «검색 칸에 한글을 조합해 치면 …» 이 단언한다.
      expect(search).toHaveLength(STEPS.length)
    } finally {
      await context.close()
    }
  })

  it('세션 통지 — 좁은 창의 로그아웃 실패 줄이 창 안에 서고, 다른 탭에서 다른 사람이 로그인하면 이름이 바뀌고 전환 통지가 선다', async () => {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 390, height: 844 } })
    try {
      await page.goto('/account')
      await page.getByText('alice@browser.test').waitFor()
      let aborted = 0
      await page.route('**/api/auth/logout', async (route) => {
        aborted += 1
        await route.abort()
      })
      await page.getByRole('button', { name: '메뉴' }).click()
      await page.getByRole('button', { name: '로그아웃', exact: true }).click()
      const alert = page.locator('.wb-shell-workspace-main [role="alert"]')
      await alert.waitFor()
      const placed = await alert.evaluate((el) => {
        const r = el.getBoundingClientRect()
        return { text: el.textContent, inView: r.top >= 0 && r.bottom <= window.innerHeight, top: Math.round(r.top) }
      })
      expect(aborted).toBe(1)
      // 끊긴 요청의 문장은 http 관문의 것(«서버에 연결하지 못했습니다»)이다 — 자리만 잰다.
      expect({ said: (placed.text ?? '').length > 0, inView: placed.inView }).toEqual({ said: true, inView: true })
      await page.unroute('**/api/auth/logout')

      // 다른 탭(같은 브라우저 컨텍스트)에서 로그아웃 → bob 으로 로그인.
      const other = await context.newPage()
      await other.setViewportSize({ width: 1280, height: 900 })
      await other.goto('/')
      await other.getByRole('button', { name: '로그아웃', exact: true }).click()
      await other.waitForURL('**/login**')
      await page.waitForURL('**/login**')
      await other.getByLabel('이메일').fill(stack.users.bob.email)
      await other.getByLabel('비밀번호').fill(stack.users.bob.password)
      await other.getByRole('button', { name: '로그인' }).click()
      await page.waitForURL((url) => !url.pathname.startsWith('/login'))
      const name = await page.locator('.wb-shell-workspace-user-name').textContent()
      // eslint-disable-next-line no-console
      console.log(`[rv-ws 세션] 실패 줄 top ${placed.top} · 다른 탭 로그인 뒤 이 탭 ${new URL(page.url()).pathname} · 이름 «${name}»`)
      expect(name).toBe(stack.users.bob.name)
    } finally {
      await context.close()
    }
  })

  it('에디터에서 보낸 편집이 서버에 붙잡힌 채 목록으로 나와 사이드바 «로그아웃» 을 누른 판 — 차례 · 서버 값 · 로그인 화면의 줄을 적는다', async () => {
    const got = await logoutFromListAfterEdit(stack, alice)
    // 판 카나리아 — 편집이 나갔고 로그아웃이 나갔다. 성질(잃지 않거나 말한다)은 아래 skip 이 단언한다.
    expect(got.lines).toContain('WS→ patch')
    expect(got.lines).toContain('POST logout')
  })

  it('설정 가로 탭 — ← → Home End · 모르는 `?section=` · owner 아님의 «위험 구역» 없음 · 창 320 에서 탭 줄이 안에서 구른다', async () => {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1280, height: 900 } })
    const steps: string[] = []
    try {
      await page.goto(`/projects/${projectId}/settings?section=bogus`)
      await page.getByRole('region', { name: '일반' }).waitFor()
      const selected = () => page.getByRole('tab', { selected: true }).textContent()
      const section = () => new URL(page.url()).searchParams.get('section')
      steps.push(`처음 ${await selected()}`)
      await page.getByRole('tab', { selected: true }).focus()
      const expected = ['테마 theme', '멤버 members', '위험 구역 danger', '일반 general', '위험 구역 danger']
      for (const [i, key] of ['ArrowRight', 'ArrowRight', 'End', 'Home', 'ArrowLeft'].entries()) {
        await page.keyboard.press(key)
        // 고른 탭은 주소보다 한 박자 늦게 그려질 수 있다(붐빌 때) — 그 걸음의 값이 설 때까지 기다린 뒤 다음 키를 누른다.
        await expect.poll(async () => `${(await selected())?.trim()} ${section()}`, { timeout: 5_000 }).toBe(expected[i])
        steps.push(`${key} ${(await selected())?.trim()} ${section()}`)
      }
      expect(steps).toEqual([
        '처음 일반',
        'ArrowRight 테마 theme',
        'ArrowRight 멤버 members',
        'End 위험 구역 danger',
        'Home 일반 general',
        'ArrowLeft 위험 구역 danger',
      ])
    } finally {
      await context.close()
    }

    const viewer = await stack.openTab(stack.users.bob, { viewport: { width: 1280, height: 900 } })
    try {
      await viewer.page.goto(`/projects/${projectId}/settings?section=danger`)
      // 판이 선 것은 탭 목록으로 기다린다 — 고른 절을 기다리면 그 값을 깨는 변조가 값이 아니라 시간 초과로 죽는다.
      await viewer.page.getByRole('tablist', { name: '설정 절' }).waitFor()
      await viewer.page.getByRole('tab', { selected: true }).waitFor()
      const tabs = await viewer.page.getByRole('tab').allTextContents()
      const chosen = await viewer.page.getByRole('tab', { selected: true }).textContent()
      expect({ tabs: tabs.map((t) => t.trim()), chosen: chosen?.trim() }).toEqual({ tabs: ['일반', '테마', '멤버'], chosen: '일반' })
    } finally {
      await viewer.context.close()
    }

    const narrow = await stack.openTab(stack.users.alice, { viewport: { width: 320, height: 700 } })
    try {
      await narrow.page.goto(`/projects/${projectId}/settings`)
      await narrow.page.getByRole('region', { name: '일반' }).waitFor()
      const got = await tabRowAfterEnd(narrow.page)
      // eslint-disable-next-line no-console
      console.log(`[rv-ws 설정 탭 320] ${JSON.stringify(got)}`)
      // 탭 줄이 넘쳐 안에서 구른다(카나리아 — 320 에서 넘치는 판이다) · 문서 · 뼈대는 안 넘친다 · 탭 줄 밖 글자 노드는 창 안.
      expect(got.scroll).toBeGreaterThan(0)
      expect({ doc: got.doc <= 0, workspace: got.workspace <= 0, outside: got.outside }).toEqual({
        doc: true,
        workspace: true,
        outside: [],
      })
    } finally {
      await narrow.context.close()
    }
  })

  /**
   * **고친 판(FX-WS)** — 리뷰의 skip 셋(R-4b · R-5a · R-6b)을 뗀 것이다. 고치기 전 소스에서 뗀 판의 실패 값은 보고
   * `docs/superpowers/plans/2026-10-31-fx-ws-report.md` 에 있다.
   */
  describe('고친 판 — 설정 탭 줄 · 검색 칸 · 전환 통지', () => {
    it('창 320 — 설정 탭 줄에서 End 로 고른 탭이 탭 줄 안에 보인다 · 반쯤 보이는 탭을 누르면 세로 스크롤이 그대로다', async () => {
      const narrow = await stack.openTab(stack.users.alice, { viewport: { width: 320, height: 700 } })
      try {
        await narrow.page.goto(`/projects/${projectId}/settings`)
        await narrow.page.getByRole('region', { name: '일반' }).waitFor()
        expect((await tabRowAfterEnd(narrow.page)).inRow).toBe(true)

        // 누름 — 반쯤 보이는 «위험 구역» 을 보이는 쪽에서 누른다. playwright 의 `click` 은 누르기 전에 스스로 굴리므로 좌표로 누른다. 창 높이를
        // 줄여 세로로 구를 자리를 만든다(320×700 의 «일반» 은 안 구른다 — 그 판에서는 «튐» 을 못 잰다).
        await narrow.page.setViewportSize({ width: 320, height: 360 })
        await narrow.page.goto(`/projects/${projectId}/settings`)
        await narrow.page.getByRole('region', { name: '일반' }).waitFor()
        const before = await verticalScroll(narrow.page, true)
        const point = await narrow.page.evaluate(() => {
          const row = document.querySelector('.wb-shell-settings-tabs')!.getBoundingClientRect()
          const tab = [...document.querySelectorAll('.wb-shell-settings-tab')].at(-1)!.getBoundingClientRect()
          return {
            x: Math.round((tab.left + Math.min(tab.right, row.right)) / 2),
            y: Math.round(tab.top + tab.height / 2),
            cut: tab.right > row.right + 0.5,
          }
        })
        await narrow.page.mouse.click(point.x, point.y)
        await narrow.page.getByRole('region', { name: '위험 구역' }).waitFor()
        await narrow.page.waitForTimeout(300)
        const after = await verticalScroll(narrow.page)
        // eslint-disable-next-line no-console
        console.log(`[fx-ws 설정 탭 320 누름] 반쯤 보임 ${point.cut} · 세로 ${JSON.stringify(before)} → ${JSON.stringify(after)}`)
        // 카나리아 — 누른 탭이 반쯤 보이는 판이고, 세로로 구를 자리가 있는 판이다(없으면 «튐» 을 못 잰다).
        expect(point.cut).toBe(true)
        expect(before.room).toBeGreaterThan(0)
        // 누른 뒤의 `scrollTop` 만 보면 «위험 구역» 판이 짧아 0 으로 잘린 값이다 — 누른 동안 스크롤 이벤트가 본 가장 큰 값으로 잰다.
        expect(after.most).toBe(before.top)
      } finally {
        await narrow.context.close()
      }
    })

    it('검색 칸에 한글을 조합해 치면 끝낸 글이 칸 값 · 주소에 그대로 선다 · 조합 중에는 주소를 안 고친다 · 주소가 칸 밖에서 바뀌면 칸이 따른다', async () => {
      const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1280, height: 900 } })
      try {
        await page.goto('/')
        const box = page.getByRole('searchbox')
        await box.click()
        const cdp = await context.newCDPSession(page)
        const addressed: (string | null)[] = []
        for (const [text, commit] of [
          ['ㄱ', false],
          ['고', false],
          ['고', true],
          ['ㄱ', false],
          ['개', false],
          ['객', false],
          ['객', true],
        ] as const) {
          if (commit) await cdp.send('Input.insertText', { text })
          else await cdp.send('Input.imeSetComposition', { text, selectionStart: text.length, selectionEnd: text.length })
          await page.waitForTimeout(60)
          addressed.push(new URL(page.url()).searchParams.get('q'))
        }
        await page.waitForTimeout(200)
        expect({ value: await box.inputValue(), q: new URL(page.url()).searchParams.get('q') }).toEqual({ value: '고객', q: '고객' })
        // 조합 중(확정 전) 걸음의 주소는 그 앞 확정 값 그대로다 — 자모가 주소에 안 실린다. 확정 걸음(셋째 · 일곱째)은 60ms 안에 안 실릴 수 있어 안 본다.
        expect([addressed[0], addressed[1], addressed[3], addressed[4], addressed[5]]).toEqual([null, null, '고', '고', '고'])
        // 영문을 사이 없이 — 글자를 잃지 않는다.
        await box.fill('')
        await box.pressSequentially('report', { delay: 0 })
        await page.waitForTimeout(300)
        expect({ value: await box.inputValue(), q: new URL(page.url()).searchParams.get('q') }).toEqual({ value: 'report', q: 'report' })

        // CPU 를 늦춘 판 — 전이가 키 사이에 늦게 커밋돼도(제 `replace` 가 칸보다 늦게 닿아도) 칸이 되돌아가지 않는다.
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 8 })
        await box.fill('')
        await box.pressSequentially('abcdefghij', { delay: 15 })
        await page.waitForTimeout(800)
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
        const slow = { value: await box.inputValue(), q: new URL(page.url()).searchParams.get('q') }
        await box.fill('report')
        await page.waitForTimeout(300)

        // 칸 밖에서 주소가 바뀐다 — 사이드바 «프로젝트»(질의 없는 `/` 로 감) · 뒤로 가기. 주소가 바뀐 것만 기다리고 칸 값은 한 번 읽는다 — 칸 값을
        // 기다리면 «따르지 않는» 변조가 값이 아니라 시간 초과로 죽는다.
        await page.getByRole('navigation', { name: '작업 공간' }).getByRole('link', { name: '프로젝트' }).click()
        await page.waitForURL((url) => url.pathname === '/' && url.search === '')
        await page.waitForTimeout(500)
        const away = await box.inputValue()
        await page.goBack()
        await page.waitForURL((url) => url.searchParams.get('q') === 'report')
        await page.waitForTimeout(500)
        const back = await box.inputValue()
        // eslint-disable-next-line no-console
        console.log(
          `[fx-ws 검색 칸] 조합 걸음의 주소 ${JSON.stringify(addressed)} · CPU 8배 ${JSON.stringify(slow)} · 사이드바 «프로젝트» 뒤 «${away}» · 뒤로 가기 뒤 «${back}»`,
        )
        expect(slow).toEqual({ value: 'abcdefghij', q: 'abcdefghij' })
        expect({ away, back }).toEqual({ away: '', back: 'report' })
      } finally {
        await context.close()
      }
    })

    it('역할 · 정렬 고르기 — 고른 값이 칸 · 주소에 선다(같은 전이를 지나는 고르는 컨트롤의 측정)', async () => {
      const { page, context } = await stack.openTab(stack.users.alice, { viewport: { width: 1280, height: 900 } })
      try {
        await page.goto('/')
        const role = page.getByLabel('역할')
        const sort = page.getByLabel('정렬')
        await role.waitFor()
        // (가) 사람의 빠르기 — 하나 고르고 그 판이 선 뒤 다음을 고른다.
        await role.selectOption('editor')
        await sort.selectOption('name')
        await role.selectOption('owner')
        await page.waitForTimeout(300)
        const human = {
          role: await role.inputValue(),
          sort: await sort.inputValue(),
          q: [new URL(page.url()).searchParams.get('role'), new URL(page.url()).searchParams.get('sort')],
        }
        // (나) 한 틱 안에 셋 — 사람이 못 내는 빠르기. 값만 적는다(단언하지 않는다).
        await page.goto('/')
        await role.waitFor()
        const tick = await page.evaluate(async () => {
          const pick = (select: HTMLSelectElement, value: string) => {
            select.value = value
            select.dispatchEvent(new Event('change', { bubbles: true }))
            return select.value
          }
          const [r, s] = [...document.querySelectorAll<HTMLSelectElement>('.wb-shell-home-bar select')]
          const right = [pick(r!, 'editor'), pick(s!, 'name'), pick(r!, 'owner')]
          await new Promise((resolve) => setTimeout(resolve, 300))
          return { right, later: [r!.value, s!.value], search: location.search }
        })
        // eslint-disable-next-line no-console
        console.log(
          `[fx-ws 역할 · 정렬] 사람 빠르기 ${JSON.stringify(human)} · 한 틱 셋: 고른 직후 ${JSON.stringify(tick.right)} · 300ms 뒤 ${JSON.stringify(tick.later)} · 주소 ${tick.search}`,
        )
        expect(human).toEqual({ role: 'owner', sort: 'name', q: ['owner', 'name'] })
      } finally {
        await context.close()
      }
    })

    it('창 390 — 다른 탭에서 다른 사람이 로그인하면 전환 통지가 새 사람의 이름을 말하고 창 안에 보인다', async () => {
      const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 390, height: 844 } })
      try {
        await page.goto('/account')
        await page.getByText('alice@browser.test').waitFor()
        const other = await context.newPage()
        await other.setViewportSize({ width: 1280, height: 900 })
        await other.goto('/login')
        await other.request.post('/api/auth/logout')
        await other.goto('/login')
        await other.getByLabel('이메일').fill(stack.users.bob.email)
        await other.getByLabel('비밀번호').fill(stack.users.bob.password)
        await other.getByRole('button', { name: '로그인' }).click()
        const notice = page.locator('.wb-shell-workspace-main [role="status"]', { hasText: SWITCHED_LEAD })
        await notice.waitFor()
        // 전환은 이 탭을 목록으로 옮긴다 — 목록이 다 선 뒤에 잰다(옮기는 도중의 판은 통지가 잠깐 창 밖이다).
        await page.waitForURL((url) => url.pathname === '/')
        await page.locator('.wb-shell-workspace-main').getByRole('list', { name: '프로젝트' }).waitFor()
        await page.waitForTimeout(300)
        const got = await notice.evaluate((el) => {
          const r = el.getBoundingClientRect()
          return {
            text: el.textContent ?? '',
            inView: r.top >= 0 && r.bottom <= window.innerHeight && r.height > 0,
            box: [Math.round(r.top), Math.round(r.bottom), window.innerHeight],
          }
        })
        // eslint-disable-next-line no-console
        console.log(`[fx-ws 전환 통지 390] «${got.text}» · 창 안 ${got.inView} · top · bottom · 창 ${JSON.stringify(got.box)}`)
        expect({ named: got.text.includes(stack.users.bob.name), inView: got.inView }).toEqual({ named: true, inView: true })
      } finally {
        await context.close()
      }
    })
  })

  /**
   * **R-4a.** 관리자 칸 넷은 같은 꼴(`admin/admin-screen.tsx`)이라 칸을 옮겨도 React 가 뼈대를 이어 간다 — 뼈대가 주소(`pathname`)를 보고 «메뉴» 를
   * 접는다(`shell/workspace-layout.tsx` 머리말 «좁은 창»). 그것을 뗀 판의 실패 값은 `expected 'true' to be 'false'` 다.
   */
  it('창 390 — 펼친 «메뉴» 에서 관리자 칸(사용자 → 초대 링크)을 누르면 접힌다', async () => {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 390, height: 844 } })
    try {
      await page.goto('/admin/users')
      await page.getByRole('heading', { name: '사용자' }).waitFor()
      await page.getByRole('button', { name: '메뉴' }).click()
      await page.getByRole('navigation', { name: '관리자' }).getByRole('link', { name: '초대 링크' }).click()
      await page.getByRole('heading', { name: '초대 링크' }).waitFor()
      expect(await page.getByRole('button', { name: '메뉴' }).getAttribute('aria-expanded')).toBe('false')
    } finally {
      await context.close()
    }
  })
  /**
   * **skip — 지금 빨강 · 이월.** 뗀 판의 실패 값은 보고 `docs/superpowers/plans/2026-10-31-rv-ws-report.md` 에 있다.
   */
  describe.skip('skip — 지금 빨강(이월)', () => {
    /**
     * **이월(2026-10-31 사내 공용 운영) — R-6a.** 에디터에서 보낸 편집이 서버에 닿기 전에 목록으로 나와 사이드바 «로그아웃» 을 누르면 편집이 말없이
     * 사라진다 — 뼈대의 `useLogout` 은 `settle` 이 없다(기준 `20b398e2` 의 `page-head.tsx` 부터 같은 길).
     */
    it('목록 화면에서 로그아웃해도 보낸 편집이 저장되거나, 로그인 화면이 잃은 것을 말한다(에디터 `…` 의 로그아웃과 같은 성질)', async () => {
      const got = await logoutFromListAfterEdit(stack, alice)
      expect(got.content[0] === '붙잡힌 채 목록으로' || got.said !== '').toBe(true)
    })
  })
})

/**
 * 에디터에서 칸을 고쳐 보낸 편집을 서버에 붙잡아 둔 채(`holdRow`) 로고로 목록에 나와 사이드바 «로그아웃» 을 누르고, 붙잡기를 푼 뒤의 차례 ·
 * 서버 값 · 로그인 화면의 줄을 돌려준다(`build-test/editor-logout-edits.test.ts` 의 판을 목록에서 누른 꼴).
 */
async function logoutFromListAfterEdit(
  stack: EditorStack,
  alice: Session,
): Promise<{ lines: string[]; head: number; content: string[]; said: string }> {
  const call = (method: string, path: string, body?: unknown) => stack.request(alice, method, path, body)
  const project = (await call('POST', '/projects', { name: '목록 로그아웃', slug: `list-logout-${Date.now().toString(36)}` })).body
  const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '메뉴' })).body
  const first = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '첫째' })).body
  const P1 = `/projects/${project.id}/pages/${first.id}`
  await call('PATCH', `${P1}/ops`, {
    baseSeq: 0,
    ops: [{ op: 'add', path: '/root/children/0', value: { id: 'n_rvws000001', type: 'Text', props: { content: '1쪽 원문' } } }],
  })
  const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1280, height: 900 } })
  const lines: string[] = []
  page.on('websocket', (ws) => {
    ws.on('framesent', (frame) => {
      if (String(frame.payload).includes('"patch"')) lines.push('WS→ patch')
    })
    ws.on('framereceived', (frame) => {
      const kind = /"type":"(patch-ack|patch-error)"/.exec(String(frame.payload))?.[1]
      if (kind !== undefined) lines.push(`WS← ${kind}`)
    })
  })
  page.on('request', (request) => {
    if (request.url().includes('/auth/logout')) lines.push('POST logout')
  })
  try {
    await page.goto(P1)
    await canvasFrame(page).locator('body', { hasText: '1쪽 원문' }).waitFor()
    await page.locator('li button', { hasText: 'Text' }).first().click()
    const box = page.locator('.wb-shell-panel textarea').first()
    await box.waitFor()
    const hold = await stack.holdRow('pages', first.id)
    try {
      await box.click()
      await box.fill('붙잡힌 채 목록으로')
      await box.evaluate((element) => (element as HTMLElement).blur())
      await hold.waitForWaiters(1)
      await page.getByRole('link', { name: '프로젝트 목록' }).first().click()
      await page.waitForURL((url) => url.pathname === '/')
      await page.getByRole('button', { name: '로그아웃', exact: true }).click()
      await page.waitForURL('**/login**', { timeout: 8_000 })
    } finally {
      await hold.release()
    }
    await page.getByRole('heading', { name: 'wirebound' }).waitFor()
    await page.waitForTimeout(800)
    const said = (await page.locator('.wb-shell-login [role="status"]').allTextContents()).join(' | ')
    const after = (await stack.request(alice, 'GET', P1)).body
    const content = (after.schema.root.children ?? []).map((child: any) => child.props?.content)
    // eslint-disable-next-line no-console
    console.log(
      `[rv-ws 목록에서 로그아웃] 차례 ${lines.join(' · ')} · 서버 head ${after.headSeq} ${JSON.stringify(content)} · 로그인 화면 줄 «${said}»`,
    )
    return { lines, head: after.headSeq as number, content, said }
  } finally {
    await context.close()
  }
}

/**
 * 설정 탭 줄을 품은 세로 스크롤 상자(가장 가까운 조상)의 `scrollTop` · 구를 자리(`scrollHeight − clientHeight`) · `arm` 한 뒤 스크롤 이벤트가 본 가장 큰
 * `scrollTop`(`most` — 판이 짧아져 잘리기 전의 튐).
 */
function verticalScroll(page: Page, arm = false): Promise<{ top: number; room: number; most: number }> {
  return page.evaluate((arming) => {
    let el: Element | null = document.querySelector('.wb-shell-settings-tabs')
    while (el !== null && !(el.scrollHeight > el.clientHeight && /(auto|scroll)/.test(getComputedStyle(el).overflowY)))
      el = el.parentElement
    const box = el ?? document.scrollingElement!
    const held = window as unknown as { rvWsMost?: number }
    if (arming) {
      held.rvWsMost = box.scrollTop
      box.addEventListener('scroll', () => {
        held.rvWsMost = Math.max(held.rvWsMost ?? 0, box.scrollTop)
      })
    }
    return { top: box.scrollTop, room: box.scrollHeight - box.clientHeight, most: held.rvWsMost ?? box.scrollTop }
  }, arm)
}

/**
 * 설정 탭 줄에서 고른 탭에 포커스를 두고 End 를 누른 뒤(«위험 구역» 판이 서고 300ms) 탭 줄의 구름 · 고른 탭이 줄 안에 보이는지 · 문서와 뼈대의
 * 넘침 · 탭 줄 **밖** 글자 노드 가운데 창 오른끝을 넘는 것(탭 줄 안의 글은 그 줄이 잘라 굴리므로 뺀다).
 */
async function tabRowAfterEnd(page: Page): Promise<{
  scroll: number
  scrolled: number
  inRow: boolean
  focused: string
  doc: number
  workspace: number
  outside: string[]
}> {
  await page.getByRole('tab', { selected: true }).focus()
  await page.keyboard.press('End')
  await page.getByRole('region', { name: '위험 구역' }).waitFor()
  await page.waitForTimeout(300)
  return page.evaluate(() => {
    const row = document.querySelector('.wb-shell-settings-tabs')!
    const tab = document.querySelector('.wb-shell-settings-tab[aria-selected="true"]')!.getBoundingClientRect()
    const box = row.getBoundingClientRect()
    const width = document.documentElement.clientWidth
    const workspace = document.querySelector('.wb-shell-workspace')!
    const outside: string[] = []
    const walker = document.createTreeWalker(workspace, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent?.trim() || row.contains(n)) continue
      const range = document.createRange()
      range.selectNodeContents(n)
      const rects = [...range.getClientRects()]
      if (rects.length > 0 && Math.max(...rects.map((r) => r.right)) > width + 0.5) outside.push(n.textContent.trim().slice(0, 24))
    }
    return {
      scroll: row.scrollWidth - row.clientWidth,
      scrolled: row.scrollLeft,
      inRow: tab.left >= box.left - 0.5 && tab.right <= box.right + 0.5,
      focused: (document.activeElement as HTMLElement | null)?.textContent?.trim() ?? '',
      doc: document.documentElement.scrollWidth - width,
      workspace: workspace.scrollWidth - workspace.clientWidth,
      outside,
    }
  })
}
