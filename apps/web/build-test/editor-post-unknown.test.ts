/**
 * **한도 안에 커밋이 확인됐는데 번호를 모르는 게시의 503 «모름»** — 서버는 응답 자리에서 `page-stale`을 내고(`services/lost-commit.ts`의 표 «커밋됐는데 번호를
 * 모른다»), 웹은 같은 키로 다시 보내 재생이 번호 프레임(`page-changed`)을 더한다(`panels/comment-panel.tsx`의 `verify` · 서버 `rebroadcastPostRevision`).
 *
 * 두 길이 겹친 판의 값 — 번호는 프레임으로 얹혀 화면이 서버와 같고, **경보 하나가 남는다**(프레임은 낡음을 안 푼다 — `EditorStore` 머리말 «프레임은 얹혀도 낡음을
 * 풀지 않는다»). «다시 불러오기»는 같은 판을 읽어 경보만 푼다(`confirmPageFresh`). 대가는 경보 하나 · `GET` 하나다. 같은 키로 다시 보내지 않는 클라이언트(MCP · CLI)
 * 에게는 이 신호만이 남의 화면을 다시 읽게 한다 — 그 몫은 `apps/api/test/late-commit-stale.test.ts` «번호를 모르는 쓰기»가 값으로 든다.
 *
 * 앨리스의 게시 COMMIT 답만 끊는다(`EditorStack.dbHalfCut` — 커밋을 늦추지 않는다 · 결말은 한도 안에 `committed`).
 */
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canvasFrame, editorStackPrerequisite, poll, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

const LATE_ALERT = '늦게 반영된 변경'

describe.skipIf(!전제.ok)('번호를 모르는 게시의 503 «모름»', () => {
  let stack: EditorStack

  beforeAll(async () => {
    if (!전제.ok) return
    stack = await startEditorStack(전제, { dbHalfCut: true })
  })

  afterAll(async () => {
    if (stack === undefined) return
    const { before, after } = await stack.close()
    expect(before.processes).toBeGreaterThan(0)
    expect(before.listeningPorts.length).toBeGreaterThanOrEqual(2)
    expect(before.databases).toBe(1)
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  })

  it('page-stale 과 재생의 번호 프레임이 함께 온다 — 화면은 서버와 같고 경보 하나가 남아 «다시 불러오기»가 푼다', async () => {
    const alice = await stack.login(stack.users.alice)
    const fx = await fixture(stack, alice)
    const [aliceTab, bobTab] = await Promise.all([stack.openTab(stack.users.alice), stack.openTab(stack.users.bob)])
    const aliceLog = watch(aliceTab.page)
    const bobLog = watch(bobTab.page)
    const postAnswers: number[] = []
    aliceTab.page.on('response', (response) => {
      if (response.request().method() === 'POST' && response.url().endsWith('/comments')) postAnswers.push(response.status())
    })
    const bobPageReads = countPageReads(bobTab.page, fx.pageId)
    try {
      await Promise.all([aliceTab.page.goto(fx.P), bobTab.page.goto(fx.P)])
      await Promise.all([
        canvasFrame(aliceTab.page).locator('body', { hasText: '원문' }).waitFor(),
        canvasFrame(bobTab.page).locator('body', { hasText: '원문' }).waitFor(),
      ])
      await Promise.all([
        poll(
          '앨리스가 룸에 든다',
          async () => aliceLog.slice(),
          (lines) => lines.includes('WS← joined'),
        ),
        poll(
          '밥이 룸에 든다',
          async () => bobLog.slice(),
          (lines) => lines.includes('WS← joined'),
        ),
      ])
      expect(await markers(bobTab.page)).toBe(0)

      // 게시 트랜잭션의 마지막 쓰기가 코멘트 행이다 — 그 연결의 COMMIT 답을 끊는다.
      stack.dbHalfCut!.arm('insert into "comments"')
      await selectFirstText(aliceTab.page, '원문')
      await aliceTab.page.getByRole('tab', { name: '코멘트' }).click()
      await aliceTab.page.locator('#wb-comment-draft').fill('답을 잃을 코멘트')
      await aliceTab.page.getByRole('button', { name: '코멘트 달기' }).click()
      await poll(
        '앨리스가 503 을 받고 같은 키로 다시 보내 재생을 받는다',
        async () => postAnswers.slice(),
        (answers) => answers.length >= 2,
        15_000,
      )
      expect(postAnswers).toEqual([503, 200])
      expect(stack.dbHalfCut!.fired).toBe(true)

      await Promise.all([
        poll(
          '밥이 page-stale 과 page-changed 를 받는다',
          async () => bobLog.slice(),
          (lines) => lines.includes('WS← page-stale') && lines.includes('WS← page-changed'),
          15_000,
        ),
        poll(
          '앨리스가 page-stale 을 받는다',
          async () => aliceLog.slice(),
          (lines) => lines.includes('WS← page-stale'),
          15_000,
        ),
      ])
      await bobTab.page.waitForTimeout(500)
      const landed = await server(stack, alice, fx)
      // 밥: 번호는 프레임으로 얹혀 화면이 서버와 같다 — 그런데 경보가 서 있다(필요 없는 경보 하나).
      const bobBefore = { 마커: await markers(bobTab.page), 경보: await alertShown(bobTab.page), 페이지조회: bobPageReads.count() }
      await bobTab.page.locator('.wb-shell-remote-alert').getByRole('button', { name: '다시 불러오기' }).click()
      await bobTab.page.locator('.wb-shell-remote-alert').waitFor({ state: 'detached', timeout: 10_000 })
      const bobAfter = { 마커: await markers(bobTab.page), 경보: await alertShown(bobTab.page), 페이지조회: bobPageReads.count() }
      // 앨리스: 낸 탭도 받는다 — 재생이 답했고 코멘트가 목록에 섰다.
      const aliceBefore = {
        마커: await markers(aliceTab.page),
        경보: await alertShown(aliceTab.page),
        코멘트: await commentCount(aliceTab.page),
      }
      if (aliceBefore.경보) {
        await aliceTab.page.locator('.wb-shell-remote-alert').getByRole('button', { name: '다시 불러오기' }).click()
        await aliceTab.page.locator('.wb-shell-remote-alert').waitFor({ state: 'detached', timeout: 10_000 })
      }
      const aliceAfter = { 마커: await markers(aliceTab.page), 경보: await alertShown(aliceTab.page) }
      // eslint-disable-next-line no-console
      console.log(
        `[게시 «모름» 겹침] 앨리스 ${aliceLog.join(' · ')} · 밥 ${bobLog.join(' · ')} · 게시 답 ${JSON.stringify(postAnswers)} · 서버 ${JSON.stringify(landed)} · 밥 누르기 전 ${JSON.stringify(bobBefore)} → 뒤 ${JSON.stringify(bobAfter)} · 앨리스 ${JSON.stringify(aliceBefore)} → ${JSON.stringify(aliceAfter)}`,
      )

      // 판 카나리아 — 커밋은 한 번(코멘트 행 1 · 머리 2) · 두 프레임이 다 왔다.
      expect(landed).toEqual({ head: 2, comments: 1 })
      expect(bobLog.filter((line) => line === 'WS← page-stale')).toHaveLength(1)
      expect(bobLog.filter((line) => line === 'WS← page-changed')).toHaveLength(1)
      // 성질 — 화면이 서버와 같다(번호 하나) · 경보가 남았다면 단추 한 번(`GET` 하나)에 풀리고 화면은 그대로다.
      expect(bobBefore.마커).toBe(1)
      expect(bobAfter).toEqual({ 마커: 1, 경보: false, 페이지조회: bobBefore.페이지조회 + (bobBefore.경보 ? 1 : 0) })
      expect(aliceBefore).toMatchObject({ 마커: 1, 코멘트: 1 })
      expect(aliceAfter).toEqual({ 마커: 1, 경보: false })
    } finally {
      await aliceTab.context.close()
      await bobTab.context.close()
    }
  }, 90_000)
})

interface Fixture {
  projectId: string
  pageId: string
  P: string
}

async function fixture(stack: EditorStack, owner: Session): Promise<Fixture> {
  const call = (method: string, path: string, body?: unknown) => stack.request(owner, method, path, body)
  const project = created(await call('POST', '/projects', { name: '게시 모름', slug: `post-unknown-${Date.now().toString(36)}` }))
  const member = await call('POST', `/projects/${project.id}/members`, { email: stack.users.bob.email, role: 'editor' })
  if (member.status >= 300) throw new Error(`픽스처 member ${member.status} ${JSON.stringify(member.body)}`)
  const menu = created(await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '메뉴' }))
  const page = created(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '페이지' }))
  const P = `/projects/${project.id}/pages/${page.id}`
  const seeded = await call('PATCH', `${P}/ops`, {
    baseSeq: 0,
    ops: [{ op: 'add', path: '/root/children/0', value: { id: 'n_text000001', type: 'Text', props: { content: '원문' } } }],
  })
  if (seeded.status >= 300) throw new Error(`픽스처 ops ${seeded.status} ${JSON.stringify(seeded.body)}`)
  return { projectId: project.id, pageId: page.id, P }
}

function created(response: { status: number; body: any }): { id: string } {
  if (response.status !== 201) throw new Error(`픽스처 ${response.status} ${JSON.stringify(response.body)}`)
  return response.body
}

async function server(stack: EditorStack, session: Session, fx: Fixture): Promise<{ head: number; comments: number }> {
  const page = (await stack.request(session, 'GET', fx.P)).body
  const rows = await stack.query<{ n: number }>('select count(*)::int as n from comments where page_id = $1', [fx.pageId])
  return { head: page.headSeq as number, comments: rows[0]!.n }
}

/** 캔버스 위의 코멘트 마커 수(`canvas/canvas.tsx`의 `.wb-shell-marker`) — 이 탭의 문서가 번호를 품었는가. */
function markers(page: Page): Promise<number> {
  return page.locator('.wb-shell-marker').count()
}

async function alertShown(page: Page): Promise<boolean> {
  return (await page.locator('[role=status]', { hasText: LATE_ALERT }).count()) > 0
}

function commentCount(page: Page): Promise<number> {
  return page.locator('li.wb-shell-comment').count()
}

/** 이 시점 뒤의 그 페이지 `GET` 수 — «다시 불러오기»의 대가를 센다. */
function countPageReads(page: Page, pageId: string): { count(): number } {
  let reads = 0
  page.on('request', (request) => {
    if (request.method() === 'GET' && request.url().endsWith(`/pages/${pageId}`)) reads += 1
  })
  return { count: () => reads }
}

async function selectFirstText(page: Page, content: string) {
  await canvasFrame(page).locator('body', { hasText: content }).waitFor()
  await page.locator('li button', { hasText: 'Text' }).first().click()
}

function watch(page: Page): string[] {
  const lines: string[] = []
  page.on('websocket', (ws) => {
    ws.on('framereceived', (frame) => {
      const kind = /"type":"(joined|page-changed|page-stale)"/.exec(String(frame.payload))?.[1]
      if (kind !== undefined) lines.push(`WS← ${kind}`)
    })
  })
  return lines
}
