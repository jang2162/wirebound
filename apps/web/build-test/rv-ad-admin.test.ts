/**
 * **RV-AD — 관리자 칸 넷의 리뷰 재현**(실브라우저 · 리뷰 보고 `docs/superpowers/plans/2026-11-01-rv-ad-report.md`). jsdom 판은 `test/rv-ad-admin.test.tsx`.
 *
 * - `describe.skip` 은 지금 빨강인 판이다 — **고칠 트랙이 skip 을 떼고 초록으로 돌린다.**
 * - 그 밖은 지금 참인 성질을 잠그거나(고치기 전에도 초록) 잰 값을 `[rv-ad …]` 줄로 남긴다.
 *
 * 판 만들기는 API 로 한다(`admin-screens.test.ts` 의 `signup` 과 같은 꼴) — 화면 흐름은 그 파일이 잰다.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, type BrowserContext, type Page } from 'playwright-core'
import { editorStackPrerequisite, poll, startEditorStack, type EditorStack, type Session } from './editor-stack'
import { makeAdmin } from './theme-fixtures'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

const PASSWORD = 'rv-ad-admin-pw-1'
const NOBODY: Session = { cookie: '' }
const RLO = String.fromCharCode(0x202e)
const PDF = String.fromCharCode(0x202c)

const log = (label: string, value: unknown): void => {
  // eslint-disable-next-line no-console
  console.log(`[rv-ad ${label}] ${JSON.stringify(value)}`)
}

/** 한 요소 안 글자들을 화면 차례(줄 → 왼쪽부터)로 읽는다 — 방향 제어 글자가 바꾼 «보이는 글» 이다. */
const VISUAL = `(element) => {
  const out = []
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    for (let i = 0; i < node.data.length; i += 1) {
      const ch = node.data[i]
      if (/[\\u200e\\u200f\\u202a-\\u202e\\u2066-\\u2069]/.test(ch)) continue
      const range = document.createRange()
      range.setStart(node, i)
      range.setEnd(node, i + 1)
      const rect = range.getBoundingClientRect()
      if (rect.width === 0 && ch !== ' ') continue
      out.push({ ch, x: rect.left, y: Math.round(rect.top) })
    }
  }
  out.sort((a, b) => a.y - b.y || a.x - b.x)
  return out.map((c) => c.ch).join('')
}`

describe.skipIf(!전제.ok)('RV-AD — 관리자 칸 실브라우저', () => {
  let stack: EditorStack
  let alice: Session
  let seq = 0

  beforeAll(async () => {
    if (!전제.ok) return
    stack = await startEditorStack(전제)
    await makeAdmin(stack, stack.users.alice)
    alice = await stack.login(stack.users.alice)
  })

  afterAll(async () => {
    if (stack === undefined) return
    const { before, after } = await stack.close()
    expect(before.processes).toBeGreaterThan(0)
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  })

  async function signup(name: string): Promise<{ id: string; email: string; session: Session }> {
    seq += 1
    const email = `rv-ad-${seq}-${Date.now().toString(36)}@browser.test`
    const made = await stack.request(alice, 'POST', '/admin/invites', { name: `${seq} 링크`, kind: 'single' })
    expect(made.status).toBe(201)
    const joined = await stack.request(NOBODY, 'POST', `/auth/invites/${made.body.token}/signup`, { email, name, password: PASSWORD })
    expect(joined.status).toBe(201)
    return { id: joined.body.id, email, session: await stack.login({ email, name, password: PASSWORD }) }
  }

  function userRow(page: Page, email: string) {
    return page
      .getByRole('table', { name: '사용자' })
      .getByRole('row')
      .filter({ has: page.getByText(email, { exact: true }) })
  }

  async function auditCount(action: string, targetUserId: string): Promise<number> {
    const rows = await stack.query<{ n: string }>('select count(*) as n from admin_audit where action = $1 and target_user_id = $2', [
      action,
      targetUserId,
    ])
    return Number(rows[0]!.n)
  }

  async function createInviteOnScreen(page: Page, name: string): Promise<string> {
    await page.getByRole('button', { name: '초대 링크 만들기' }).click()
    const dialog = page.getByRole('dialog', { name: '초대 링크 만들기' })
    await dialog.getByLabel('이름(메모)').fill(name)
    await dialog.getByRole('button', { name: '만들기' }).click()
    return page
      .getByRole('region', { name: `초대 링크 «${name}»` })
      .getByLabel('링크')
      .inputValue()
  }

  async function readClipboard(): Promise<string> {
    const reader = await stack.browser.newContext({ baseURL: stack.webUrl })
    try {
      await reader.grantPermissions(['clipboard-read', 'clipboard-write'])
      const page = await reader.newPage()
      await page.goto('/login')
      return await page.evaluate(() => navigator.clipboard.readText())
    } finally {
      await reader.close()
    }
  }

  async function writeClipboard(text: string): Promise<void> {
    const writer = await stack.browser.newContext({ baseURL: stack.webUrl })
    try {
      await writer.grantPermissions(['clipboard-read', 'clipboard-write'])
      const page = await writer.newPage()
      await page.goto('/login')
      await page.evaluate((value) => navigator.clipboard.writeText(value), text)
    } finally {
      await writer.close()
    }
  }

  // 고칠 트랙이 skip 을 떼고 초록으로 돌린다.
  describe.skip('H1 — 새 링크 상자가 앞 링크의 «복사했습니다» 를 물려받는다', () => {
    it('밥의 재설정 링크를 복사한 뒤 초대 링크를 만들면 — 새 상자가 «복사했습니다» 라고 말하는데 클립보드는 밥의 재설정 링크다', async () => {
      const bob = await signup('복사밥')
      const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1280, height: 900 } })
      try {
        await context.grantPermissions(['clipboard-read', 'clipboard-write'])
        await page.goto('/admin/users')
        await userRow(page, bob.email).getByRole('button', { name: '복사밥 더 보기' }).click()
        await page.getByRole('menuitem', { name: '재설정 링크 만들기' }).click()
        const resetBox = page.getByRole('region', { name: '복사밥의 비밀번호 재설정 링크' })
        const resetUrl = await resetBox.getByLabel('링크').inputValue()
        await resetBox.getByRole('button', { name: '복사' }).click()
        await resetBox.getByText('복사했습니다').waitFor()
        expect(await readClipboard()).toBe(resetUrl)

        const inviteUrl = await createInviteOnScreen(page, '새 팀')
        const box = page.getByRole('region', { name: '초대 링크 «새 팀»' })
        const clip = await readClipboard()
        const seen = {
          copiedShown: await box.getByText('복사했습니다').isVisible(),
          clipboard: clip === inviteUrl ? 'invite' : clip === resetUrl ? 'bob-reset' : 'other',
        }
        log('H1', seen)
        expect(seen).toEqual({ copiedShown: false, clipboard: 'bob-reset' })
      } finally {
        await context.close()
      }
    })
  })

  it('«복사» — 클립보드 판마다 화면 문장이 클립보드의 실제와 맞는다(«복사했습니다» 면 그 주소 · 실패면 칸이 통째로 골라짐)', async () => {
    const variants = {
      granted: null,
      default: null,
      rejected: `{ const c = navigator.clipboard; if (c) Object.defineProperty(c, 'writeText', { value: () => Promise.reject(new DOMException('denied', 'NotAllowedError')) }) }`,
      absent: `Object.defineProperty(Navigator.prototype, 'clipboard', { get: () => undefined, configurable: true })`,
    } as const
    const seen: Record<string, unknown> = {}
    for (const [variant, script] of Object.entries(variants)) {
      const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1280, height: 900 } })
      try {
        if (variant === 'granted') await context.grantPermissions(['clipboard-read', 'clipboard-write'])
        if (script !== null) await context.addInitScript({ content: script })
        await page.goto('/admin/invites')
        const url = await createInviteOnScreen(page, `복사 ${variant}`)
        const box = page.getByRole('region', { name: `초대 링크 «복사 ${variant}»` })
        const sentinel = `sentinel-${variant}`
        await writeClipboard(sentinel)
        await page.bringToFront()
        await box.getByRole('button', { name: '복사' }).click()
        await box.getByText(/복사했습니다|복사하지 못했습니다/).waitFor()
        const said = (await box.getByText(/복사했습니다|복사하지 못했습니다/).textContent()) ?? ''
        const selection = await box
          .getByLabel('링크')
          .evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd, el.value.length])
        const clip = await readClipboard()
        seen[variant] = { said, clipboard: clip === url ? 'url' : clip === sentinel ? 'unchanged' : 'other', selection }
        if (said === '복사했습니다') expect(clip).toBe(url)
        else expect([selection[0], selection[1]]).toEqual([0, selection[2]])
      } finally {
        await context.close()
      }
    }
    log('복사 판', seen)
    expect(Object.keys(seen)).toHaveLength(4)
  })

  it('새 링크의 원문은 저장소 · IndexedDB · 주소 · history.state · 콘솔 · 뒤따른 요청에 없고, 칸을 옮기거나(뒤로 가기 포함) 다른 탭에서는 DOM 에도 없다', async () => {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1280, height: 900 } })
    try {
      const consoleLines: string[] = []
      page.on('console', (message) => consoleLines.push(message.text()))
      await page.goto('/admin/invites')
      await page.getByRole('heading', { name: '초대 링크' }).waitFor()
      const requests: string[] = []
      const created = page.waitForResponse(
        (response) => response.url().endsWith('/api/admin/invites') && response.request().method() === 'POST',
      )
      page.on('request', (request) => requests.push(`${request.method()} ${request.url()} ${request.postData() ?? ''}`))
      const url = await createInviteOnScreen(page, '새는가')
      await created
      const token = url.slice(url.lastIndexOf('/') + 1)
      const at = await page.evaluate(async () => ({
        local: JSON.stringify({ ...localStorage }),
        session: JSON.stringify({ ...sessionStorage }),
        idb: JSON.stringify(await indexedDB.databases()),
        state: JSON.stringify(history.state),
        url: location.href,
      }))
      // 판 카나리아 — 원문이 화면에 있다.
      expect((await page.content()).includes(token)).toBe(true)

      // SPA 로 다른 칸 → 뒤로 가기.
      await page.getByRole('navigation', { name: '관리자' }).getByRole('link', { name: '사용자' }).click()
      await page.getByRole('table', { name: '사용자' }).waitFor()
      const afterMove = (await page.content()).includes(token)
      await page.goBack()
      await page.getByRole('button', { name: '초대 링크 만들기' }).waitFor()
      await page.getByRole('table', { name: '초대 링크' }).waitFor()
      const afterBack = (await page.content()).includes(token)
      const other = await context.newPage()
      await other.goto('/admin/invites')
      await other.getByRole('table', { name: '초대 링크' }).waitFor()
      const otherTab =
        (await other.content()).includes(token) || (await other.evaluate(() => JSON.stringify({ ...sessionStorage }))).includes(token)

      const leaks = {
        local: at.local.includes(token),
        session: at.session.includes(token),
        idb: at.idb.includes(token),
        state: at.state.includes(token),
        url: at.url.includes(token),
        console: consoleLines.some((line) => line.includes(token)),
        requests: requests.filter((line) => line.includes(token)).length,
        afterMove,
        afterBack,
        otherTab,
      }
      log('새는 자리', { ...leaks, requestsSeen: requests.length, idbNames: at.idb })
      // 카나리아 — 뒤따른 요청을 실제로 셌다(목록 다시 받기 · 칸 옮김).
      expect(requests.length).toBeGreaterThan(0)
      expect(leaks).toEqual({
        local: false,
        session: false,
        idb: false,
        state: false,
        url: false,
        console: false,
        requests: 0,
        afterMove: false,
        afterBack: false,
        otherTab: false,
      })
    } finally {
      await context.close()
    }
  })

  // 고칠 트랙이 skip 을 떼고 초록으로 돌린다.
  describe.skip('H3 — bfcache 로 돌아오면 새 링크 상자가 원문째 되살아난다', () => {
    it('bfcache 를 켠 Chrome(Playwright 기본 인자 `--disable-back-forward-cache` 를 뺀다) — 다른 문서로 떠났다 «뒤로» 오면 원문이 DOM 에 없다', async () => {
      const browser = await chromium.launch({
        executablePath: 전제.ok ? 전제.executablePath : undefined,
        headless: true,
        ignoreDefaultArgs: ['--disable-back-forward-cache'],
      })
      let context: BrowserContext | undefined
      try {
        context = await browser.newContext({ baseURL: stack.webUrl, viewport: { width: 1280, height: 900 } })
        const login = await context.request.post(`${stack.webUrl}/api/auth/login`, {
          data: { email: stack.users.alice.email, password: stack.users.alice.password },
        })
        expect(login.ok()).toBe(true)
        const page = await context.newPage()
        await page.goto('/admin/invites')
        const url = await createInviteOnScreen(page, 'bfcache')
        const token = url.slice(url.lastIndexOf('/') + 1)
        await page.evaluate(() => {
          ;(window as unknown as { rvMark: number }).rvMark = 1
        })
        await page.goto(`${stack.webUrl}/api/health`)
        // bfcache 로 되살면 `load` 가 다시 안 온다 — 커밋까지만 기다린다.
        await page.goBack({ waitUntil: 'commit' })
        await page.getByRole('heading', { name: '초대 링크', exact: true }).waitFor()
        const back = await page.evaluate((needle) => {
          const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming & { notRestoredReasons?: unknown }
          return {
            restored: (window as unknown as { rvMark?: number }).rvMark === 1,
            token: document.documentElement.outerHTML.includes(needle),
            reasons: JSON.stringify(nav?.notRestoredReasons ?? null),
          }
        }, token)
        log('bfcache', { bundle: process.env.EDITOR_STACK_BUNDLE ?? 'dev', ...back })
        // 뒤로 와서 원문이 보이면 «이 화면을 떠나면 다시 볼 수 없습니다» 가 거짓이다. bfcache 를 막는 고침이면 `restored` 가 거짓이 되고, 되살린 뒤
        // 상자를 거두는 고침이면 `restored` 가 참인 채 `token` 이 거짓이다 — 둘 다 받는다.
        expect(back.token).toBe(false)
      } finally {
        await context?.close()
        await browser.close()
      }
    })
  })

  // 고칠 트랙이 skip 을 떼고 초록으로 돌린다.
  describe.skip('H2 — 줄 «…» 의 항목에서 Enter 를 누른 채 있으면 메뉴가 다시 열려 첫 항목(재설정 링크 만들기)이 거듭 나간다', () => {
    it('«관리자로 지정» 에서 Enter 를 누른 채(첫 keydown + 반복 keydown 20 번 · 35ms) — 지정 하나 · 재설정 링크 0', async () => {
      const carol = await signup('반복캐럴')
      const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1280, height: 900 } })
      try {
        await page.goto('/admin/users')
        const toggle = userRow(page, carol.email).getByRole('button', { name: '반복캐럴 더 보기' })
        await toggle.focus()
        await page.keyboard.press('ArrowDown')
        await page.getByRole('menuitem', { name: '재설정 링크 만들기' }).waitFor()
        await page.keyboard.press('ArrowDown')
        expect(await page.evaluate(() => document.activeElement?.textContent ?? '')).toContain('관리자로 지정')
        await page.keyboard.down('Enter')
        for (let i = 0; i < 20; i += 1) {
          await page.waitForTimeout(35)
          await page.keyboard.down('Enter')
        }
        await page.keyboard.up('Enter')
        await page.waitForTimeout(1500)
        const held = {
          grant: await auditCount('admin.grant', carol.id),
          reset: await auditCount('reset.create', carol.id),
          revoke: await auditCount('admin.revoke', carol.id),
          deactivate: await auditCount('user.deactivate', carol.id),
          links: Number(
            (await stack.query<{ n: string }>('select count(*) as n from password_resets where user_id = $1', [carol.id]))[0]!.n,
          ),
        }
        log('H2 키 반복', held)
        expect({ grant: held.grant, reset: held.reset }).toEqual({ grant: 1, reset: 0 })
      } finally {
        await context.close()
      }
    })
  })

  it('관리자 아닌 사람이 칸 넷을 열면 `/api/admin/*` 요청이 0 · (잰 값) 열린 칸에서 강등되면 다음 쓰기의 화면', async () => {
    const { context, page } = await stack.openTab(stack.users.bob, { viewport: { width: 1280, height: 900 } })
    const adminRequests: string[] = []
    let all = 0
    page.on('request', (request) => {
      all += 1
      if (new URL(request.url()).pathname.startsWith('/api/admin')) adminRequests.push(request.url())
    })
    try {
      for (const section of ['users', 'invites', 'projects', 'audit']) {
        await page.goto(`/admin/${section}`)
        await page.getByText('인스턴스 관리자만 볼 수 있습니다').waitFor()
        await page.waitForTimeout(300)
      }
    } finally {
      await context.close()
    }
    log('비관리자', { all, admin: adminRequests })
    expect(all).toBeGreaterThan(0)
    expect(adminRequests).toEqual([])

    // 강등 — 둘째 관리자(밥)가 앨리스를 해제한다.
    const target = await signup('강등대상')
    const bobSession = await stack.login(stack.users.bob)
    await makeAdmin(stack, stack.users.bob)
    const tab = await stack.openTab(stack.users.alice, { viewport: { width: 1280, height: 900 } })
    try {
      await tab.page.goto('/admin/users')
      await userRow(tab.page, target.email).waitFor()
      const users = (await stack.request(bobSession, 'GET', '/admin/users')).body as { id: string; email: string }[]
      const aliceId = users.find((user) => user.email === stack.users.alice.email)!.id
      expect((await stack.request(bobSession, 'DELETE', `/admin/users/${aliceId}/admin`)).status).toBe(200)
      await userRow(tab.page, target.email).getByRole('button', { name: '강등대상 더 보기' }).click()
      await tab.page.getByRole('menuitem', { name: '관리자로 지정' }).click()
      await poll(
        '쓰기의 실패 한 줄이 선다',
        async () => tab.page.getByRole('alert').count(),
        (n) => n > 0,
      )
      await tab.page.waitForTimeout(500)
      const seen = {
        alert: await tab.page.getByRole('alert').allTextContents(),
        table: await tab.page.getByRole('table', { name: '사용자' }).count(),
        adminNav: await tab.page.getByRole('navigation', { name: '관리자' }).count(),
        grant: await auditCount('admin.grant', target.id),
      }
      log('강등', seen)
      expect(seen.grant).toBe(0)
      expect(seen.alert.length).toBeGreaterThan(0)
    } finally {
      await tab.context.close()
      await makeAdmin(stack, stack.users.alice)
      await stack.query('update users set is_instance_admin = false where email = $1', [stack.users.bob.email])
    }
  })

  /** 사람의 이름을 DB 에 바로 적는다 — 서버가 앞으로 방향 제어 글자를 막아도 이미 든 이름(옛 행)의 판을 세운다. */
  async function rename(id: string, name: string): Promise<void> {
    await stack.query('update users set name = $1 where id = $2', [name, id])
  }

  // 고칠 트랙이 skip 을 떼고 초록으로 돌린다.
  describe.skip('M1 — 이름의 방향 제어 글자(U+202E)가 확인 상자 문장의 뒤를 뒤집는다', () => {
    it('비활성화 상자 — 이름 뒤의 «(이메일) 계정을 비활성화합니다. …» 가 보이는 차례 그대로다', async () => {
      const spoof = await signup('뒤집개')
      await rename(spoof.id, `${RLO}사퇴박`)
      const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1280, height: 900 } })
      try {
        await page.goto('/admin/users')
        await userRow(page, spoof.email)
          .getByRole('button', { name: /더 보기$/ })
          .click()
        await page.getByRole('menuitem', { name: '비활성화' }).click()
        const sentence = page.getByRole('dialog', { name: '비활성화' }).getByText(/계정을 비활성화합니다/)
        const visual = await sentence.evaluate(new Function(`return ${VISUAL}`)() as (el: Element) => string)
        log('M1 상자', visual)
        expect(visual).toContain(`(${spoof.email}) 계정을 비활성화합니다. 로그인 · 세션 · API 토큰이 바로 끊깁니다.`)
      } finally {
        await context.close()
      }
    })
  })

  it('U+202E 이름 — 표(1280) · 카드 꼴(720)에서 보이는 글 · 끝 닫은 이름의 확인 상자 문장(잰 값) · 넘침 0', async () => {
    const real = await signup('박퇴사')
    const spoof = await signup('흉내')
    const fenced = await signup('흉내닫음')
    const multi = await signup('여러줄')
    await rename(spoof.id, `${RLO}사퇴박`)
    await rename(fenced.id, `${RLO}사퇴박${PDF}`)
    await rename(multi.id, `줄바꿈\n이름${RLO}뒤집힘`)
    await stack.query('update users set is_instance_admin = true where id = $1', [spoof.id])
    const seen: Record<string, unknown> = {}
    try {
      for (const width of [1280, 720]) {
        const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width, height: 900 } })
        try {
          await page.goto('/admin/users')
          await userRow(page, real.email).waitFor()
          const visual = async (email: string) =>
            userRow(page, email)
              .getByRole('cell')
              .first()
              .evaluate(new Function(`return ${VISUAL}`)() as (el: Element) => string)
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
          seen[`표 ${width}`] = {
            real: await visual(real.email),
            spoof: await visual(spoof.email),
            fenced: await visual(fenced.email),
            multi: await visual(multi.email),
            overflow,
          }
          expect(overflow).toBe(0)
          if (width === 1280) {
            await userRow(page, fenced.email)
              .getByRole('button', { name: /더 보기$/ })
              .click()
            await page.getByRole('menuitem', { name: '비활성화' }).click()
            seen['상자 fenced'] = await page
              .getByRole('dialog', { name: '비활성화' })
              .getByText(/계정을 비활성화합니다/)
              .evaluate(new Function(`return ${VISUAL}`)() as (el: Element) => string)
            await page.keyboard.press('Escape')
          }
        } finally {
          await context.close()
        }
      }
    } finally {
      await stack.query('update users set is_instance_admin = false where id = $1', [spoof.id])
    }
    log('U+202E', seen)
    // 카나리아 — 두 폭과 상자 하나를 다 쟀다(값은 보고 M1).
    expect(Object.keys(seen)).toEqual(['표 1280', '상자 fenced', '표 720'])
  })

  it('카드 꼴 문턱(899 · 900 · 901) — 넘침 0 · 접근성 트리의 칸 이름(잰 값)', async () => {
    const who = await signup('접근성대상이름이꽤길어서좁은카드에서꺾이는지보는사람')
    const seen: Record<string, unknown> = {}
    for (const width of [899, 900, 901]) {
      const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width, height: 900 } })
      try {
        await page.goto('/admin/users')
        const row = userRow(page, who.email)
        await row.waitFor()
        const overflow = await page.evaluate(() => {
          const root = document.documentElement
          let past = 0
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
          for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
            if ((node as Text).data.trim() === '') continue
            const range = document.createRange()
            range.selectNodeContents(node)
            for (const rect of range.getClientRects()) if (rect.right > root.clientWidth + 0.5) past += 1
          }
          return { doc: root.scrollWidth - root.clientWidth, past }
        })
        const cdp = await context.newCDPSession(page)
        const { nodes } = (await cdp.send('Accessibility.getFullAXTree')) as {
          nodes: {
            nodeId: string
            parentId?: string
            role?: { value: string }
            name?: { value: string }
            ignored?: boolean
            childIds?: string[]
          }[]
        }
        const byId = new Map(nodes.map((node) => [node.nodeId, node]))
        const cell = nodes.find((node) => !node.ignored && (node.name?.value ?? '').includes(who.email))
        const rowNode = cell?.parentId === undefined ? undefined : byId.get(cell.parentId)
        const cells = (rowNode?.childIds ?? [])
          .map((id) => byId.get(id))
          .filter((node) => node !== undefined && !node.ignored)
          .map((node) => `${node!.role?.value}:${node!.name?.value ?? ''}`)
        const roles = (role: string) => nodes.filter((node) => !node.ignored && node.role?.value === role).length
        seen[width] = {
          overflow,
          table: roles('table'),
          columnheader: roles('columnheader'),
          rowRole: rowNode?.role?.value,
          cells,
        }
        expect(overflow).toEqual({ doc: 0, past: 0 })
      } finally {
        await context.close()
      }
    }
    log('문턱', seen)
  })

  it('owner 넘기기 — 대상 목록에 비활성 사용자가 없다 · 그새 활성 owner 가 생기면 409 문장 · 나에게 넘기면 이름이 링크가 된다', async () => {
    const owner = await signup('떠난주인')
    const gone = await signup('비활성사람')
    const other = await signup('먼저받는사람')
    const users = (await stack.request(alice, 'GET', '/admin/users')).body as { id: string; email: string }[]
    const aliceId = users.find((user) => user.email === stack.users.alice.email)!.id
    const make = async (slug: string) =>
      (await stack.request(owner.session, 'POST', '/projects', { name: `고아 ${slug}`, slug: `${slug}-${Date.now().toString(36)}` }))
        .body as {
        id: string
        name: string
      }
    const first = await make('rvad-a')
    const second = await make('rvad-b')
    expect((await stack.request(alice, 'POST', `/admin/users/${owner.id}/deactivate`)).status).toBe(200)
    expect((await stack.request(alice, 'POST', `/admin/users/${gone.id}/deactivate`)).status).toBe(200)

    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1280, height: 900 } })
    try {
      await page.goto('/admin/projects')
      const row = (name: string) => page.getByRole('table', { name: '프로젝트' }).getByRole('row').filter({ hasText: name })
      await row(first.name).waitFor()
      await row(first.name)
        .getByRole('button', { name: `${first.name} 더 보기` })
        .click()
      await page.getByRole('menuitem', { name: 'owner 넘기기' }).click()
      const dialog = page.getByRole('dialog', { name: 'owner 넘기기' })
      const pick = dialog.getByLabel('새 owner')
      await pick.waitFor()
      const options = await pick.locator('option').allTextContents()
      // 그새 다른 관리자가 넘긴다.
      expect((await stack.request(alice, 'POST', `/admin/projects/${first.id}/owner`, { userId: other.id })).status).toBe(200)
      await pick.selectOption({ label: options.find((label) => label.includes('— 나'))! })
      await dialog.getByRole('button', { name: 'owner 로 만들기' }).click()
      const conflict = await dialog.getByRole('alert').textContent()
      await dialog.getByRole('button', { name: '취소' }).click()
      await poll(
        '409 뒤 닫으면 «…» 가 사라진다',
        async () =>
          row(first.name)
            .getByRole('button', { name: `${first.name} 더 보기` })
            .count(),
        (n) => n === 0,
      )

      await row(second.name)
        .getByRole('button', { name: `${second.name} 더 보기` })
        .click()
      await page.getByRole('menuitem', { name: 'owner 넘기기' }).click()
      await dialog.getByLabel('새 owner').selectOption({ value: aliceId })
      await dialog.getByRole('button', { name: 'owner 로 만들기' }).click()
      const link = row(second.name).getByRole('link', { name: second.name })
      await link.waitFor()
      const seen = {
        options,
        hasInactive: options.some((label) => label.includes('떠난주인') || label.includes('비활성사람')),
        conflict,
        firstIsLink: await row(first.name).getByRole('link').count(),
        secondHref: await link.getAttribute('href'),
      }
      log('owner', seen)
      expect({ hasInactive: seen.hasInactive, firstIsLink: seen.firstIsLink, secondHref: seen.secondHref }).toEqual({
        hasInactive: false,
        firstIsLink: 0,
        secondHref: `/projects/${second.id}`,
      })
      expect(conflict).not.toBe('')
    } finally {
      await context.close()
    }
  })
})
