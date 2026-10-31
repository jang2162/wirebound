/**
 * **관리자 칸 넷**(`src/admin/*`) · 링크 화면 둘(`routes/invite.tsx` · `routes/reset.tsx`) — 실브라우저 판. jsdom 케이스(`test/admin/*`)가 못 재는 것:
 * 실서버 위의 흐름 · 다른 컨텍스트(다른 사람의 브라우저) · 실클릭의 더블클릭 · 표의 넘침과 꺾인 줄.
 *
 * | 케이스 | 재는 값 |
 * |---|---|
 * | 초대 → 가입 → 비활성화 | 관리자가 화면에서 만든 링크(칸의 값)를 다른 컨텍스트가 열어 가입 → 사용자 표에 «초대 «이름»» → 그 사람의 열린 에디터 탭이 비활성화 뒤 로그인 화면으로 |
 * | 재설정 링크 | 관리자가 만든 재설정 링크를 로그인 안 한 컨텍스트가 열어 바꿈 → 로그인 화면의 한 줄 → 새 비밀번호로 로그인 200 · 옛 것 401 |
 * | 더블클릭 | 줄 «…» 의 «비활성화» 를 더블클릭해도 상자만 열린다(서버 요청 0) · 상자의 확정을 더블클릭해도 요청 1 |
 * | 넘침 | 창 390 · 720 · 721 · 900 · 1000 · 1920 × 칸 넷 — 문서 · 뼈대 상자의 가로 넘침 0 · 창 밖 글자 노드 0 · 시각 칸 꺾인 줄 ≤ 2 |
 *
 * **못 재는 것** — 시각의 날짜 조각에서 `-nowrap` 을 뗀 변조는 이 판들에서 산다: 잰 폭(표 꼴은 900 부터)에서 날짜 칸이 날짜 글 폭 밑으로 줄지
 * 않는다(표가 이메일 · 이름 칸을 먼저 접는다). 그 클래스는 더 좁은 표에 대한 보험이다. 확정 단추의 연타 거름(`confirmClick`)을 뗀 변조도 여기서 산다 —
 * 첫 누름이 상자를 닫아 둘째 누름이 닿을 단추가 없다. 그 겹은 jsdom `test/admin/users-section.test.tsx` «연타의 둘째 누름» 이 혼자 잰다.
 *
 * 원문은 화면의 칸(`링크`)에서 읽는다 — 응답을 엿보지 않는다. 사람이 하는 일(칸의 주소를 메신저로 넘김)과 같은 길이다.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright-core'
import { canvasFrame, editorStackPrerequisite, poll, startEditorStack, type EditorStack, type Session } from './editor-stack'
import { makeAdmin } from './theme-fixtures'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

const NEW_PASSWORD = 'admin-screens-new-pw-1'

/** 로그인 안 한 요청(가입) — 쿠키 없는 세션. */
const NOBODY: Session = { cookie: '' }

describe.skipIf(!전제.ok)('관리자 칸 넷 · 링크 화면 — 실브라우저', () => {
  let stack: EditorStack
  let alice: Session

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

  /** API 로 초대 링크를 만들어 그 원문으로 가입시킨다 — 판 만들기용(화면 흐름은 첫 케이스가 잰다). */
  async function signup(name: string, email: string): Promise<{ id: string }> {
    const made = await stack.request(alice, 'POST', '/admin/invites', { name: `${name} 링크`, kind: 'single' })
    expect(made.status).toBe(201)
    const joined = await stack.request(NOBODY, 'POST', `/auth/invites/${made.body.token}/signup`, { email, name, password: NEW_PASSWORD })
    expect(joined.status).toBe(201)
    return { id: joined.body.id }
  }

  function userRow(page: Page, name: string) {
    return page
      .getByRole('table', { name: '사용자' })
      .getByRole('row')
      .filter({ has: page.getByRole('cell', { name, exact: false }) })
      .first()
  }

  it('초대 링크를 화면에서 만들어 다른 컨텍스트가 가입 → 사용자 표에 «초대 «이름»» → 비활성화하면 그 사람의 열린 에디터 탭이 로그인 화면으로', async () => {
    const admin = await stack.openTab(stack.users.alice, { viewport: { width: 1280, height: 900 } })
    const guest = await stack.browser.newContext({ baseURL: stack.webUrl, viewport: { width: 1280, height: 900 } })
    try {
      const page = admin.page
      await page.goto('/admin/invites')
      await page.getByRole('button', { name: '초대 링크 만들기' }).click()
      const dialog = page.getByRole('dialog', { name: '초대 링크 만들기' })
      await dialog.getByLabel('이름(메모)').fill('디자인팀')
      await dialog.getByRole('radio', { name: /^여러 명/ }).check()
      await dialog.getByRole('button', { name: '만들기' }).click()
      const reveal = page.getByRole('region', { name: '초대 링크 «디자인팀»' })
      const url = await reveal.getByLabel('링크').inputValue()
      expect(url.startsWith(`${new URL(stack.webUrl).origin}/invite/`)).toBe(true)
      // 원문은 저장소 · 주소에 없다(`admin/link-reveal.tsx` 머리말).
      const token = url.slice(url.lastIndexOf('/') + 1)
      const stored = await page.evaluate(() => JSON.stringify([{ ...localStorage }, { ...sessionStorage }]))
      expect({ stored: stored.includes(token), address: page.url().includes(token) }).toEqual({ stored: false, address: false })

      // 다른 사람의 브라우저 — 링크를 열어 가입한다.
      const g = await guest.newPage()
      await g.goto(url)
      await g.getByLabel('이메일').fill('eve@browser.test')
      await g.getByLabel('이름').fill('이브')
      await g.getByLabel('비밀번호(8자 이상)').fill(NEW_PASSWORD)
      await g.getByLabel('비밀번호 확인').fill(NEW_PASSWORD)
      await g.getByRole('button', { name: '가입' }).click()
      await g.getByRole('heading', { name: '프로젝트' }).waitFor()
      expect(new URL(g.url()).pathname).toBe('/')

      // 이브를 프로젝트에 넣고 에디터를 연다.
      const project = (await stack.request(alice, 'POST', '/projects', { name: '이브 판', slug: `eve-${Date.now().toString(36)}` })).body
      const menu = (await stack.request(alice, 'POST', `/projects/${project.id}/menu`, { parentId: null, title: '메뉴' })).body
      const first = (await stack.request(alice, 'POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '첫째' })).body
      await stack.request(alice, 'PATCH', `/projects/${project.id}/pages/${first.id}/ops`, {
        baseSeq: 0,
        ops: [{ op: 'add', path: '/root/children/0', value: { id: 'n_admscr0001', type: 'Text', props: { content: '이브의 원문' } } }],
      })
      expect(
        (await stack.request(alice, 'POST', `/projects/${project.id}/members`, { email: 'eve@browser.test', role: 'editor' })).status,
      ).toBe(201)
      // 이브의 실시간 연결 — 붙은 것(`joined`)과 닫힌 것을 센다(판 카나리아).
      const ws = { joined: 0, closed: 0 }
      g.on('websocket', (socket) => {
        socket.on('framereceived', (frame) => {
          if (typeof frame.payload === 'string' && frame.payload.includes('"joined"')) ws.joined += 1
        })
        socket.on('close', () => {
          ws.closed += 1
        })
      })
      await g.goto(`/projects/${project.id}/pages/${first.id}`)
      await canvasFrame(g).locator('body', { hasText: '이브의 원문' }).waitFor()
      await poll(
        '이브의 실시간 연결이 붙는다',
        async () => ws.joined,
        (n) => n >= 1,
      )

      // 관리자 › 사용자 — 이브의 줄에 그 링크 이름.
      await page.goto('/admin/users')
      const eve = userRow(page, '이브')
      await eve.waitFor()
      expect(await eve.textContent()).toContain('초대 «디자인팀»')

      await eve.getByRole('button', { name: '이브 더 보기' }).click()
      await page.getByRole('menuitem', { name: '비활성화' }).click()
      const ask = page.getByRole('dialog', { name: '비활성화' })
      await ask.getByText('이 사람이 마지막 활성 owner 인 프로젝트는 없습니다.').waitFor()
      await ask.getByRole('button', { name: '비활성화' }).click()
      await page.getByText(/^이브 — 비활성화했습니다\. 거둔 링크 0개 · 활성 owner 가 없어진 프로젝트 0개\./).waitFor()

      // 이브의 열린 에디터 탭 — 로그인 화면으로.
      await poll(
        '이브의 탭이 로그인 화면으로',
        async () => new URL(g.url()).pathname,
        (path) => path === '/login',
        15_000,
      )
      await g.getByRole('button', { name: '로그인' }).waitFor()
      expect(ws.closed).toBeGreaterThanOrEqual(1)
      expect(await eve.getAttribute('data-active')).toBe('false')
    } finally {
      await guest.close()
      await admin.context.close()
    }
  })

  it('재설정 링크 — 관리자가 만든 링크를 로그인 안 한 컨텍스트가 열어 바꾸면 로그인 화면의 한 줄 · 새 비밀번호만 선다', async () => {
    await signup('프랭크', 'frank@browser.test')
    const admin = await stack.openTab(stack.users.alice, { viewport: { width: 1280, height: 900 } })
    const guest = await stack.browser.newContext({ baseURL: stack.webUrl, viewport: { width: 390, height: 844 } })
    try {
      const page = admin.page
      await page.goto('/admin/users')
      await userRow(page, '프랭크').getByRole('button', { name: '프랭크 더 보기' }).click()
      await page.getByRole('menuitem', { name: '재설정 링크 만들기' }).click()
      const url = await page.getByRole('region', { name: '프랭크의 비밀번호 재설정 링크' }).getByLabel('링크').inputValue()
      expect(url.includes('/reset/')).toBe(true)

      const g = await guest.newPage()
      await g.goto(url)
      await g.getByText('frank@browser.test').waitFor()
      const changed = `${NEW_PASSWORD}-reset`
      await g.getByLabel('비밀번호(8자 이상)').fill(changed)
      await g.getByLabel('비밀번호 확인').fill(changed)
      await g.getByRole('button', { name: '비밀번호 바꾸기' }).click()
      await g.getByText('비밀번호를 바꿨습니다 — 새 비밀번호로 로그인하세요').waitFor()
      expect(new URL(g.url()).pathname).toBe('/login')

      const login = async (password: string) =>
        (await stack.request(NOBODY, 'POST', '/auth/login', { email: 'frank@browser.test', password })).status
      expect({ old: await login(NEW_PASSWORD), next: await login(changed) }).toEqual({ old: 401, next: 200 })
      // 같은 링크를 다시 열면 공통 문장 — 한 번 쓰면 끝.
      await g.goto(url)
      await g.getByText('이 재설정 링크는 더 쓸 수 없습니다 — 관리자에게 새 링크를 받으세요').waitFor()
    } finally {
      await guest.close()
      await admin.context.close()
    }
  })

  it('더블클릭 — 줄 «…» 의 «비활성화» 는 상자만 연다 · 상자의 확정을 더블클릭해도 요청은 하나', async () => {
    const gina = await signup('지나', 'gina@browser.test')
    const admin = await stack.openTab(stack.users.alice, { viewport: { width: 1280, height: 900 } })
    const sent: string[] = []
    admin.page.on('request', (request) => {
      if (request.method() === 'POST' && /\/api\/admin\/users\/[^/]+\/deactivate$/.test(request.url())) sent.push(request.url())
    })
    try {
      const page = admin.page
      await page.goto('/admin/users')
      await userRow(page, '지나').getByRole('button', { name: '지나 더 보기' }).click()
      await page.getByRole('menuitem', { name: '비활성화' }).dblclick()
      const ask = page.getByRole('dialog', { name: '비활성화' })
      await ask.waitFor()
      await page.waitForTimeout(600)
      const active = async () =>
        (await stack.query<{ off: boolean }>('select deactivated_at is not null as off from users where id = $1', [gina.id]))[0]?.off
      expect({ sent: sent.length, off: await active(), open: await ask.isVisible() }).toEqual({ sent: 0, off: false, open: true })

      await ask.getByRole('button', { name: '비활성화' }).dblclick()
      await page.getByText(/^지나 — 비활성화했습니다\./).waitFor()
      await page.waitForTimeout(600)
      expect({ sent: sent.length, off: await active() }).toEqual({ sent: 1, off: true })
    } finally {
      await admin.context.close()
    }
  })

  /**
   * 표 넷의 넘침 — 긴 이름 · 긴 이메일 · 긴 링크 이름 · 활성 owner 없는 긴 프로젝트를 싣고 문턱(900) 앞뒤 · 좁은 창(390 · 720 · 721) · 넓은 창(1920)에서 잰다.
   * 시각 칸은 날짜 · 시각을 각각 안 끊어 두 줄까지다(`admin/admin-screen.tsx` 의 `When`).
   */
  it('창 390 · 720 · 721 · 900 · 1000 · 1920 × 칸 넷 — 넘침 0 · 창 밖 글자 0 · 시각 칸 ≤ 2 줄', async () => {
    await signup('띄어쓰지않은아주긴한글이름사용자입니다', 'a-very-long-mailbox-name-for-overflow-checks@long-subdomain.browser.test')
    await stack.request(alice, 'POST', '/admin/invites', {
      name: '띄어쓰지않은아주긴초대링크이름입니다마케팅디자인개발',
      kind: 'multi',
      expiresInDays: 90,
    })
    const orphan = (
      await stack.request(alice, 'POST', '/projects', {
        name: '활성owner가없는아주긴프로젝트이름입니다',
        slug: `orphan-long-${Date.now().toString(36)}`,
      })
    ).body
    // 활성 owner 를 없앤다 — 비활성 사용자를 owner 로 둔다. owner 를 남으로 바꾸는 길이 서버에 없어 DB 로 짓는다(판 만들기 · 이 케이스 혼자서도 선다).
    const gone = await signup('떠난owner', 'gone-owner@browser.test')
    expect((await stack.request(alice, 'POST', `/admin/users/${gone.id}/deactivate`)).status).toBe(200)
    await stack.query('update project_members set user_id = $2 where project_id = $1', [orphan.id, gone.id])

    const seen: Record<string, unknown>[] = []
    for (const width of [390, 720, 721, 900, 1000, 1920]) {
      const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width, height: 900 } })
      try {
        for (const [path, table] of [
          ['/admin/users', '사용자'],
          ['/admin/invites', '초대 링크'],
          ['/admin/projects', '프로젝트'],
          ['/admin/audit', '기록'],
        ] as const) {
          await page.goto(path)
          await page.getByRole('table', { name: table }).waitFor()
          const got = await measure(page)
          seen.push({ width, path, ...got })
          expect({ width, path, doc: got.doc, workspace: got.workspace, texts: got.texts, whenLines: got.whenLines <= 2 }).toEqual({
            width,
            path,
            doc: 0,
            workspace: 0,
            texts: [],
            whenLines: true,
          })
          expect(got.counted).toBeGreaterThan(5)
          expect(got.whenCells).toBeGreaterThan(0)
        }
      } finally {
        await context.close()
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[admin-screens 넘침] ${JSON.stringify(seen)}`)
  })
})

/**
 * 넘침 — 문서 · 뼈대 상자의 가로 넘침(px), 창 오른끝을 넘는 글자 노드(`AGENTS.md` «화면 넘침은 요소 상자로만 세지 않는다»), 시각 상자
 * (`.wb-shell-admin-when`)의 꺾인 줄 수 최댓값(상자 안 글자 노드들의 서로 다른 `top` — «표 칸의 글은 넘침과 함께 꺾인 줄 수로 잰다»).
 */
function measure(
  page: Page,
): Promise<{ doc: number; workspace: number; texts: string[]; counted: number; whenLines: number; whenCells: number }> {
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
    let whenLines = 0
    // 시각 상자(`When`) 하나의 글 노드 전부의 서로 다른 `top` — 꺾는 자리를 정하는 클래스(`-nowrap`)로 고르지 않는다(그 클래스를 뗀 판을 못 본다).
    const cells = [...document.querySelectorAll('.wb-shell-admin-when')]
    for (const cell of cells) {
      const tops = new Set<number>()
      const inner = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT)
      for (let t = inner.nextNode(); t; t = inner.nextNode()) {
        if (!t.textContent?.trim()) continue
        const range = document.createRange()
        range.selectNodeContents(t)
        for (const rect of range.getClientRects()) tops.add(Math.round(rect.top))
      }
      whenLines = Math.max(whenLines, tops.size)
    }
    return {
      doc: document.documentElement.scrollWidth - width,
      workspace: box.scrollWidth - box.clientWidth,
      texts,
      counted,
      whenLines,
      whenCells: cells.length,
    }
  })
}
