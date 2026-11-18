/**
 * **로그아웃은 보낸 편집의 답을 받은 뒤에 나간다** — 막지는 않는다(`session/session-menu.tsx` 의 `settle`).
 *
 * 칸에 친 채 «로그아웃»을 누르면 실클릭이 먼저 포커스를 옮겨 편집이 WS 로 나가고, 곧바로 로그아웃이 다른 연결(REST)로 나간다. 로그아웃이
 * 먼저 세션을 지우면 편집은 커밋 순간의 재확인에서 401 로 거절되고, 셸째 내려가 말할 자리도 없다. 답을 기다리던 편집 뒤에 쌓인 편집은
 * 한 번도 안 나간다. 그래서 에디터의 로그아웃은 전송 루프가 쉴 때까지(한도 3s — `routes/editor.tsx` 의 `SENT_EDIT_WAIT_MS`) 기다린다.
 * **한도가 지나면 그대로 나간다** — 로그아웃은 권한을 줄이는 쓰기다. 막으면 공용 기기에서 누르고 떠난 사람의 세션이 남는다.
 *
 * 편집을 서버에 붙잡는 것은 페이지 행 잠금이다 — 줄이 섰는지는 `holdRow` 의 대기자로 센다(안 서면 던진다).
 */
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { editorStackPrerequisite, startEditorStack, type EditorStack, type Session, canvasFrame } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

describe.skipIf(!전제.ok)('로그아웃과 보낸 편집', () => {
  let stack: EditorStack

  beforeAll(async () => {
    if (!전제.ok) return
    stack = await startEditorStack(전제)
  })

  afterAll(async () => {
    if (stack === undefined) return
    const { before, after } = await stack.close()
    expect(before.processes).toBeGreaterThan(0)
    expect(before.listeningPorts.length).toBeGreaterThanOrEqual(2)
    expect(before.databases).toBe(1)
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  })

  it('칸에 친 채 로그아웃을 누르면 그 편집이 저장된 뒤 나간다', async () => {
    const alice = await stack.login(stack.users.alice)
    const fx = await fixture(stack, alice, 'logout-blur')
    const { context, page } = await stack.openTab(stack.users.alice)
    const log = watch(page)
    try {
      await page.goto(fx.P1)
      const box = await selectFirstText(page, '1쪽 원문')
      await box.click()
      await box.fill('친 채 나간 글')
      const hold = await stack.holdRow('pages', fx.first)
      // 실클릭 — blur 가 편집을 낸다. 행에 줄 서야 판이 선다.
      await page.getByRole('button', { name: '더 보기', exact: true }).click()
      await page.getByRole('menuitem', { name: '로그아웃' }).click()
      await hold.waitForWaiters(1)
      await new Promise((resolve) => setTimeout(resolve, 300))
      await hold.release()
      await page.waitForURL('**/login**', { timeout: 10_000 })

      // eslint-disable-next-line no-console
      console.log(`[친 채 로그아웃] ${log.lines.join(' · ')}`)
      expect(await server(stack, alice, fx.P1)).toEqual({ head: 2, content: ['친 채 나간 글'] })
      expect(order(log)).toEqual(['WS→ patch', 'WS← patch-ack', 'POST logout'])
      // 답을 받고 나갔다 — 로그인 화면은 잃은 것을 말하지 않는다.
      await page.getByRole('heading', { name: 'wirebound' }).waitFor()
      expect(await farewell(page)).toBe('')
    } finally {
      await context.close()
    }
  })

  it('답을 기다리는 편집 뒤에 쌓인 편집도 보낸 뒤 나간다', async () => {
    const alice = await stack.login(stack.users.alice)
    const fx = await fixture(stack, alice, 'logout-queue')
    const { context, page } = await stack.openTab(stack.users.alice)
    const log = watch(page)
    try {
      await page.goto(fx.P1)
      const hold = await stack.holdRow('pages', fx.first)
      const box = await selectFirstText(page, '1쪽 원문')
      await box.click()
      await box.fill('E1 보낸 글')
      await box.evaluate((element) => (element as HTMLElement).blur())
      await hold.waitForWaiters(1)
      await box.click()
      await box.fill('E2 쌓인 글')
      await box.evaluate((element) => (element as HTMLElement).blur())
      await canvasFrame(page).locator('body', { hasText: 'E2 쌓인 글' }).waitFor()

      await page.getByRole('button', { name: '더 보기', exact: true }).click()
      await page.getByRole('menuitem', { name: '로그아웃' }).click()
      await new Promise((resolve) => setTimeout(resolve, 300))
      await hold.release()
      await page.waitForURL('**/login**', { timeout: 10_000 })

      // eslint-disable-next-line no-console
      console.log(`[쌓인 채 로그아웃] ${log.lines.join(' · ')}`)
      expect(await server(stack, alice, fx.P1)).toEqual({ head: 3, content: ['E2 쌓인 글'] })
      expect(order(log)).toEqual(['WS→ patch', 'WS← patch-ack', 'WS→ patch', 'WS← patch-ack', 'POST logout'])
    } finally {
      await context.close()
    }
  })

  it('답이 한도 안에 안 오면 기다리지 않고 나간다 — 로그아웃은 막히지 않는다', async () => {
    const alice = await stack.login(stack.users.alice)
    const fx = await fixture(stack, alice, 'logout-slow')
    const { context, page } = await stack.openTab(stack.users.alice)
    const log = watch(page)
    try {
      await page.goto(fx.P1)
      const hold = await stack.holdRow('pages', fx.first)
      try {
        const box = await selectFirstText(page, '1쪽 원문')
        await box.click()
        await box.fill('붙잡힌 글')
        await box.evaluate((element) => (element as HTMLElement).blur())
        await hold.waitForWaiters(1)
        // 답을 기다리는 편집 뒤에 하나를 더 쌓는다 — 한도 뒤에는 한 번도 안 나간다.
        await box.click()
        await box.fill('쌓인 글')
        await box.evaluate((element) => (element as HTMLElement).blur())
        await canvasFrame(page).locator('body', { hasText: '쌓인 글' }).waitFor()

        const clicked = Date.now()
        await page.getByRole('button', { name: '더 보기', exact: true }).click()
        await page.getByRole('menuitem', { name: '로그아웃' }).click()
        const reached = await page.waitForURL('**/login**', { timeout: 8_000 }).then(
          () => true,
          () => false,
        )
        const waited = Date.now() - clicked
        // eslint-disable-next-line no-console
        console.log(`[한도 뒤 로그아웃] ${waited}ms · ${log.lines.join(' · ')}`)
        expect({ 로그인화면: reached, 나감: order(log).includes('POST logout'), 한도안: waited < 6_000 }).toEqual({
          로그인화면: true,
          나감: true,
          한도안: true,
        })
        // 세션이 실제로 지워졌다 — 그 탭의 쿠키로 다시 물으면 401 이다.
        expect(await page.evaluate(async () => (await fetch('/api/auth/me')).status)).toBe(401)
        // **두고 간 편집을 로그인 화면이 말한다**(`routes/editor.tsx`의 `logoutLossNotice`) — 셸은 내려갔다. 고치기 전에는 아무 말도 없었다.
        expect(await farewell(page)).toBe(
          '로그아웃 전에 보낸 편집 1개의 답을 받지 못해 서버에 반영됐는지 알 수 없습니다. 보내지 않은 편집 1개는 저장되지 않았습니다. 다시 로그인해 그 페이지를 확인하세요.',
        )
      } finally {
        await hold.release()
      }
    } finally {
      await context.close()
    }
  })
  /**
   * **남긴 한 줄은 그 로그아웃이 연 세션 세대 동안만 선다**(`session/session-context.tsx`의 `useSignOutNotice`). 한 브라우저의 두 탭 — 탭1 에서 앨리스가
   * 한도 뒤 나가 한 줄이 서고, 탭2 에서 밥이 들어오면 탭1 은 그 소식으로 밥이 되며, 밥이 탭2 에서 나가면 탭1 도 로그인 화면이다. 그때 앨리스의
   * 줄이 서면 밥에게 겪지 않은 잃음을 말한다. 고치기 전에는 섰다([Chrome] 3/3 — 한 줄은 이 탭의 로그인만 지웠다).
   */
  it('다른 탭에서 들어온 사람이 나간 뒤의 로그인 화면에는 앞 사람의 한 줄이 없다', async () => {
    const alice = await stack.login(stack.users.alice)
    const fx = await fixture(stack, alice, 'logout-other-tab')
    const { context, page } = await stack.openTab(stack.users.alice)
    const seen: string[] = []
    try {
      await page.goto(fx.P1)
      const hold = await stack.holdRow('pages', fx.first)
      try {
        const box = await selectFirstText(page, '1쪽 원문')
        await box.click()
        await box.fill('붙잡힌 글')
        await box.evaluate((element) => (element as HTMLElement).blur())
        await hold.waitForWaiters(1)
        await page.getByRole('button', { name: '더 보기', exact: true }).click()
        await page.getByRole('menuitem', { name: '로그아웃' }).click()
        await page.waitForURL('**/login**', { timeout: 8_000 })
      } finally {
        await hold.release()
      }
      const own = await farewell(page)
      const other = await context.newPage()
      await other.goto('/login')
      await other.getByLabel('이메일').fill(stack.users.bob.email)
      await other.getByLabel('비밀번호', { exact: true }).fill(stack.users.bob.password)
      await other.getByRole('button', { name: '로그인' }).click()
      await other.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 8_000 })
      await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 8_000 })
      seen.push(`밥 로그인 뒤 탭1 ${new URL(page.url()).pathname}`)
      // 밥은 프로젝트 목록(`/`)에 섰다 — 에디터 밖 화면의 «로그아웃» 은 사이드바 바닥 줄의 단추다(`shell/workspace-layout.tsx`).
      await other.getByRole('button', { name: '로그아웃', exact: true }).click()
      await other.waitForURL('**/login**', { timeout: 8_000 })
      await page.waitForURL('**/login**', { timeout: 8_000 })
      await page.getByRole('heading', { name: 'wirebound' }).waitFor()
      await page.waitForTimeout(300)
      const after = await farewell(page)
      // eslint-disable-next-line no-console
      console.log(
        `[다른 탭의 다음 사람] 앨리스 줄 ${JSON.stringify(own)} · ${seen.join(' · ')} · 밥 로그아웃 뒤 탭1 줄 ${JSON.stringify(after)}`,
      )

      // 판 카나리아 — 앨리스의 줄이 섰고 탭1 이 밥이 됐다가 로그인 화면으로 돌아왔다.
      expect(own).toBe(
        '로그아웃 전에 보낸 편집 1개의 답을 받지 못해 서버에 반영됐는지 알 수 없습니다. 다시 로그인해 그 페이지를 확인하세요.',
      )
      expect(seen).toEqual(['밥 로그인 뒤 탭1 /'])
      expect(after).toBe('')
    } finally {
      await context.close()
    }
  })
})

/** 로그인 화면의 `status` 글 — 로그아웃하며 남긴 한 줄. 없으면 빈 글. */
async function farewell(page: Page): Promise<string> {
  const notices = await page.locator('.wb-shell-login [role="status"]').allTextContents()
  return notices.join(' | ')
}

interface Fixture {
  first: string
  P1: string
}

async function fixture(stack: EditorStack, owner: Session, slug: string): Promise<Fixture> {
  const call = (method: string, path: string, body?: unknown) => stack.request(owner, method, path, body)
  const project = created(await call('POST', '/projects', { name: '로그아웃', slug: `${slug}-${Date.now().toString(36)}` }))
  const menu = created(await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '메뉴' }))
  const first = created(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '첫째' }))
  const P1 = `/projects/${project.id}/pages/${first.id}`
  const seeded = await call('PATCH', `${P1}/ops`, {
    baseSeq: 0,
    ops: [{ op: 'add', path: '/root/children/0', value: { id: 'n_one0000001', type: 'Text', props: { content: '1쪽 원문' } } }],
  })
  if (seeded.status >= 300) throw new Error(`픽스처 ops ${seeded.status} ${JSON.stringify(seeded.body)}`)
  return { first: first.id, P1 }
}

function created(response: { status: number; body: any }): { id: string } {
  if (response.status !== 201) throw new Error(`픽스처 ${response.status} ${JSON.stringify(response.body)}`)
  return response.body
}

async function server(stack: EditorStack, session: Session, path: string): Promise<{ head: number; content: string[] }> {
  const page = (await stack.request(session, 'GET', path)).body
  return { head: page.headSeq as number, content: (page.schema.root.children ?? []).map((child: any) => child.props?.content) }
}

async function selectFirstText(page: Page, content: string) {
  await canvasFrame(page).locator('body', { hasText: content }).waitFor()
  await page.locator('li button', { hasText: 'Text' }).first().click()
  const box = page.locator('.wb-shell-panel textarea').first()
  await box.waitFor()
  return box
}

/** 편집 프레임 · 답 · 로그아웃 요청을 시각 순으로 적는다. */
function watch(page: Page): { lines: string[] } {
  const lines: string[] = []
  const started = Date.now()
  const at = (): string => `${Date.now() - started}ms`
  page.on('websocket', (ws) => {
    ws.on('framesent', (frame) => {
      const payload = String(frame.payload)
      if (payload.includes('"patch"')) lines.push(`${at()} WS→ patch baseSeq=${/"baseSeq":(\d+)/.exec(payload)?.[1]}`)
    })
    ws.on('framereceived', (frame) => {
      const payload = String(frame.payload)
      const kind = /"type":"(patch-ack|patch-error)"/.exec(payload)?.[1]
      if (kind !== undefined) lines.push(`${at()} WS← ${kind} ${/"(seq|status)":(\d+)/.exec(payload)?.slice(1).join(' ') ?? ''}`)
    })
  })
  page.on('request', (request) => {
    if (request.url().includes('/auth/logout')) lines.push(`${at()} POST logout`)
  })
  return { lines }
}

/** 적은 줄에서 시각 · 값을 떼고 무엇이 어떤 순서로 났는지만. */
function order(log: { lines: string[] }): string[] {
  return log.lines.map((line) => /(WS→ patch|WS← patch-ack|WS← patch-error|POST logout)/.exec(line)?.[1] ?? line)
}
