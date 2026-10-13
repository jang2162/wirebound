/**
 * **늦게 커밋된 편집이 남의 화면에 경보를 세우고, «다시 불러오기»가 서버 판과 같게 만든다**(서버 `page-stale` 프레임 → `EditorStore.markPageStale` →
 * `RemoteAlert`).
 *
 * 앨리스의 편집(WS `patch`)의 COMMIT 을 서버에서 2.5s 늦추고(`DEFERRABLE INITIALLY DEFERRED` 제약 트리거의 `pg_sleep`) api 가 DB 에 닿는 소켓만 끊는다
 * (`EditorStack.dbHalfCut`) — 커밋은 되는데 앨리스는 503 «모름»을 받는다. 서버는 한도(1s) 안에 결말을 못 알고, 커밋된 뒤 룸에 번호 없는
 * `page-stale`을 낸다. 밥의 화면은 그 편집의 `page-changed`를 한 번도 못 받는다 — 그 신호만이 낡았다는 것을 알린다.
 *
 * **판 만들기:** 두 탭이 룸에 든(`joined`를 받은) 뒤에 보낸다 — 그 전의 쓰기는 방송이 룸에 닿기 전에 지난다. 편집은 앨리스의 UI 에서 낸다(WS `patch`).
 *
 * | | 밥(지켜보는 탭) | 앨리스(낸 탭) |
 * |---|---|---|
 * | 신호 | `page-stale` 한 번 · `page-changed` 없음 | `page-stale` 한 번(낸 연결도 받는다) |
 * | 경보 | 선다 — 누르기 전 캔버스는 옛 글 | 선다 — 수습이 신호 앞에 읽었다 |
 * | «다시 불러오기» | 서버 판과 같아지고 경보가 풀린다 | 같다 |
 *
 * **이미 새 판을 읽은 탭은 경보가 안 선다**(`seq` 힌트 — 아래 둘째 케이스). 신호가 revision 의 `seq` 를 힌트로 싣고, 받는 쪽은 `seq <= headSeq` 면 안 세운다. 신호보다 **먼저**
 * 커밋 뒤의 판을 읽은 밥(웹 → 브라우저 방향을 늦춘 연결 · `startDownDelay`)은 경보가 없고, 읽지 않은 탭은 같은 신호에 경보가 선다 — 참 경보가 사라지지 않는 대조군이다.
 */
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canvasFrame, canvasText, editorStackPrerequisite, poll, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

/** 커밋을 늦추는 폭 — 확인 한도(`LOST_COMMIT_PROBE_MS` 1s)를 넘기고 지켜보기(30s) 안이다. */
const LATE_COMMIT_MS = 2_500

const LATE_ALERT = '늦게 반영된 변경'

/** 밥의 WS 를 늦추는 폭 — 커밋(2.5s) 뒤 신호가 닿기 전에 밥이 둘째 페이지를 갔다 오는 시간(수 초)보다 넉넉하다. */
const DELAY_MS = 8_000

describe.skipIf(!전제.ok)('늦게 커밋된 편집의 경보', () => {
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

  it('밥의 화면에 경보가 서고 «다시 불러오기»로 서버 값과 같아진다 — 앨리스의 탭도 같다', async () => {
    const alice = await stack.login(stack.users.alice)
    const fx = await fixture(stack, alice)
    const [aliceTab, bobTab] = await Promise.all([stack.openTab(stack.users.alice), stack.openTab(stack.users.bob)])
    const aliceLog = watch(aliceTab.page)
    const bobLog = watch(bobTab.page)
    try {
      await Promise.all([aliceTab.page.goto(fx.P), bobTab.page.goto(fx.P)])
      await Promise.all([
        canvasFrame(aliceTab.page).locator('body', { hasText: '원문' }).waitFor(),
        canvasFrame(bobTab.page).locator('body', { hasText: '원문' }).waitFor(),
      ])
      // 두 탭이 룸에 들었다 — 그 뒤에 보낸다(판 만들기).
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

      await stack.query(
        `create or replace function zz_late_commit() returns trigger language plpgsql as $$ begin perform pg_sleep(${LATE_COMMIT_MS / 1000}); return null; end $$`,
      )
      await stack.query(
        `create constraint trigger zz_late_commit after insert on revisions deferrable initially deferred for each row when (new.page_id = '${fx.pageId}') execute function zz_late_commit()`,
      )
      try {
        stack.dbHalfCut!.arm('insert into "revisions"')
        const box = await selectFirstText(aliceTab.page, '원문')
        await box.click()
        await box.fill('앨리스가 친 글')
        await box.evaluate((element) => (element as HTMLElement).blur())

        // 판이 섰는가 — 앨리스는 503 «모름»을 받았고 DB 연결이 끊겼다.
        await poll(
          '앨리스가 503 을 받는다',
          async () => aliceLog.slice(),
          (lines) => lines.includes('WS← patch-error 503'),
          15_000,
        )
        expect(stack.dbHalfCut!.fired).toBe(true)

        await Promise.all([
          poll(
            '밥이 page-stale 을 받는다',
            async () => bobLog.slice(),
            (lines) => lines.includes('WS← page-stale'),
            20_000,
          ),
          poll(
            '앨리스가 page-stale 을 받는다',
            async () => aliceLog.slice(),
            (lines) => lines.includes('WS← page-stale'),
            20_000,
          ),
        ])
        const landed = await server(stack, alice, fx.P)
        expect(landed).toEqual({ head: 2, content: ['앨리스가 친 글'] })

        // 밥: 경보가 서 있고 화면은 아직 옛 글이다 — 그 편집의 번호 프레임은 한 번도 안 왔다.
        await bobTab.page.locator('[role=status]', { hasText: LATE_ALERT }).waitFor()
        const before = await canvasText(bobTab.page)
        expect(before).toContain('원문')
        expect(before).not.toContain('앨리스가 친 글')
        expect(bobLog.filter((line) => line === 'WS← page-changed')).toEqual([])
        expect(bobLog.filter((line) => line === 'WS← page-stale')).toHaveLength(1)

        // 앨리스: 낸 탭도 받는다 — 수습의 다시 읽기가 커밋 앞을 읽었다.
        await aliceTab.page.locator('[role=status]', { hasText: LATE_ALERT }).waitFor()
        expect(aliceLog.filter((line) => line === 'WS← page-stale')).toHaveLength(1)

        // 밥이 누른다 — 그 페이지만 읽는다(트리 · 코멘트는 안 읽는다).
        const treeReads = countTreeReads(bobTab.page)
        await bobTab.page.getByRole('button', { name: '다시 불러오기' }).click()
        await canvasFrame(bobTab.page).locator('body', { hasText: '앨리스가 친 글' }).waitFor({ timeout: 10_000 })
        await bobTab.page.locator('[role=status]', { hasText: LATE_ALERT }).waitFor({ state: 'detached' })
        expect(treeReads.count()).toBe(0)

        await aliceTab.page.getByRole('button', { name: '다시 불러오기' }).click()
        await aliceTab.page.locator('[role=status]', { hasText: LATE_ALERT }).waitFor({ state: 'detached' })
        await canvasFrame(aliceTab.page).locator('body', { hasText: '앨리스가 친 글' }).waitFor({ timeout: 10_000 })

        const shown = { 밥: await canvasText(bobTab.page), 앨리스: await canvasText(aliceTab.page) }
        // eslint-disable-next-line no-console
        console.log(
          `[늦은 커밋] 밥 ${bobLog.join(' · ')} · 앨리스 ${aliceLog.join(' · ')} · 서버 ${JSON.stringify(landed)} · 다시 읽은 뒤 ${JSON.stringify(shown)}`,
        )
        expect(shown.밥).toContain('앨리스가 친 글')
        expect(shown.앨리스).toContain('앨리스가 친 글')
        expect(await server(stack, alice, fx.P)).toEqual(landed)
      } finally {
        await stack.query('drop trigger if exists zz_late_commit on revisions')
        await stack.query('drop function if exists zz_late_commit()')
      }
    } finally {
      await aliceTab.context.close()
      await bobTab.context.close()
    }
  }, 90_000)

  /**
   * 신호가 오기 **전에** 커밋 뒤의 판을 읽은 탭 — 힌트가 없으면 경보가 한 번 서고 «다시 불러오기» 한 번(GET 하나)이 푼다(거짓 경보). 힌트가 있으면 안 선다.
   * 판 만들기: 밥의 WS 만 `DELAY_MS` 늦춘다(`startDownDelay`) — 신호가 닿기 전에 밥이 둘째 페이지를 갔다 첫째로 돌아와 서버 판(앨리스의 글)을 읽는다. 같은 밥이 직접 연결로
   * 연 둘째 탭은 읽지 않으므로 그 탭의 경보는 선다(참 경보 — 힌트가 `headSeq` 보다 앞선다).
   */
  it('신호보다 먼저 커밋 뒤의 판을 읽은 탭은 경보가 안 서고, 안 읽은 탭은 선다', async () => {
    const alice = await stack.login(stack.users.alice)
    const fx = await fixture(stack, alice, { second: '둘째' })
    const delay = await stack.startDownDelay(DELAY_MS)
    const [aliceTab, readerTab, idleTab] = await Promise.all([
      stack.openTab(stack.users.alice),
      stack.openTab(stack.users.bob, { origin: delay.origin }),
      stack.openTab(stack.users.bob),
    ])
    const aliceLog = watch(aliceTab.page)
    const readerLog = watchStale(readerTab.page)
    const idleLog = watchStale(idleTab.page)
    try {
      await Promise.all([aliceTab.page.goto(fx.P), readerTab.page.goto(fx.P), idleTab.page.goto(fx.P)])
      await Promise.all([aliceTab, readerTab, idleTab].map((tab) => canvasFrame(tab.page).locator('body', { hasText: '원문' }).waitFor()))
      await Promise.all([
        poll(
          '앨리스가 룸에 든다',
          async () => aliceLog.slice(),
          (lines) => lines.includes('WS← joined'),
        ),
        poll(
          '읽는 밥이 늦춰진 채 룸에 든다',
          async () => readerLog.lines.slice(),
          (lines) => lines.includes('WS← joined'),
          20_000,
        ),
        poll(
          '안 읽는 밥이 룸에 든다',
          async () => idleLog.lines.slice(),
          (lines) => lines.includes('WS← joined'),
        ),
      ])
      expect(delay.delayed()).toBeGreaterThanOrEqual(1)

      await stack.query(
        `create or replace function zz_late_commit() returns trigger language plpgsql as $$ begin perform pg_sleep(${LATE_COMMIT_MS / 1000}); return null; end $$`,
      )
      await stack.query(
        `create constraint trigger zz_late_commit after insert on revisions deferrable initially deferred for each row when (new.page_id = '${fx.pageId}') execute function zz_late_commit()`,
      )
      try {
        stack.dbHalfCut!.arm('insert into "revisions"')
        const box = await selectFirstText(aliceTab.page, '원문')
        await box.click()
        await box.fill('앨리스가 친 글')
        await box.evaluate((element) => (element as HTMLElement).blur())
        await poll(
          '앨리스가 503 을 받는다',
          async () => aliceLog.slice(),
          (lines) => lines.includes('WS← patch-error 503'),
          15_000,
        )
        expect(stack.dbHalfCut!.fired).toBe(true)

        // 커밋이 닿았다 — DB 의 값으로 기다린다. 읽는 밥은 신호(늦춰진 연결)가 오기 전에 둘째 페이지를 갔다 돌아와 서버 판을 읽는다.
        await poll(
          '늦은 커밋이 닿는다',
          async () => (await server(stack, alice, fx.P)).head,
          (head) => head === 2,
          15_000,
        )
        const reads = countPageReads(readerTab.page, fx.pageId)
        await readerTab.page.getByRole('link', { name: '둘째' }).click()
        await readerTab.page.getByRole('link', { name: '첫째' }).click()
        await canvasFrame(readerTab.page).locator('body', { hasText: '앨리스가 친 글' }).waitFor({ timeout: 10_000 })
        readerLog.lines.push('READ 서버 판')

        // 늦춰진 신호가 닿는다 — 힌트(`seq` = 커밋된 revision)와 함께.
        await poll(
          '읽는 밥이 늦춰진 page-stale 을 받는다',
          async () => readerLog.stale.slice(),
          (stale) => stale.length === 1,
          30_000,
        )
        await poll(
          '안 읽는 밥이 page-stale 을 받는다',
          async () => idleLog.stale.slice(),
          (stale) => stale.length === 1,
          20_000,
        )
        // 판이 섰는가 — 읽기가 신호보다 먼저였다(그래야 «이미 읽었다»를 재는 판이다).
        expect(readerLog.lines.indexOf('READ 서버 판')).toBeLessThan(readerLog.lines.indexOf('WS← page-stale'))
        expect(reads.count()).toBeGreaterThanOrEqual(1)
        // 힌트는 커밋된 revision 의 번호다.
        expect(readerLog.stale).toEqual([2])
        expect(idleLog.stale).toEqual([2])

        // 두 프레임을 그린 뒤에 센다 — 경보는 신호를 받은 렌더에 선다.
        await readerTab.page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
        await idleTab.page.locator('[role=status]', { hasText: LATE_ALERT }).waitFor()
        const shown = {
          읽은_밥_경보: await readerTab.page.locator('[role=status]', { hasText: LATE_ALERT }).count(),
          읽은_밥_글: await canvasText(readerTab.page),
          안_읽은_밥_경보: await idleTab.page.locator('[role=status]', { hasText: LATE_ALERT }).count(),
          안_읽은_밥_글: await canvasText(idleTab.page),
        }
        // eslint-disable-next-line no-console
        console.log(
          `[이미 읽은 탭] 읽은 밥 ${readerLog.lines.join(' · ')} · 안 읽은 밥 ${idleLog.lines.join(' · ')} · ${JSON.stringify(shown)}`,
        )
        expect(shown.읽은_밥_경보).toBe(0)
        expect(shown.읽은_밥_글).toContain('앨리스가 친 글')
        // 참 경보 — 안 읽은 탭은 옛 글을 그린 채 경보가 선다.
        expect(shown.안_읽은_밥_경보).toBe(1)
        expect(shown.안_읽은_밥_글).not.toContain('앨리스가 친 글')
      } finally {
        await stack.query('drop trigger if exists zz_late_commit on revisions')
        await stack.query('drop function if exists zz_late_commit()')
      }
    } finally {
      await aliceTab.context.close()
      await readerTab.context.close()
      await idleTab.context.close()
      await delay.close()
    }
  }, 120_000)
})

interface Fixture {
  projectId: string
  pageId: string
  P: string
}

async function fixture(stack: EditorStack, owner: Session, options: { second?: string } = {}): Promise<Fixture> {
  const call = (method: string, path: string, body?: unknown) => stack.request(owner, method, path, body)
  const project = created(await call('POST', '/projects', { name: '늦은 커밋', slug: `late-commit-${Date.now().toString(36)}` }))
  const member = await call('POST', `/projects/${project.id}/members`, { email: stack.users.bob.email, role: 'editor' })
  if (member.status >= 300) throw new Error(`픽스처 member ${member.status} ${JSON.stringify(member.body)}`)
  const menu = created(await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '메뉴' }))
  const page = created(
    await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: options.second === undefined ? '페이지' : '첫째' }),
  )
  if (options.second !== undefined)
    created(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: options.second }))
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

async function server(stack: EditorStack, session: Session, path: string): Promise<{ head: number; content: string[] }> {
  const page = (await stack.request(session, 'GET', path)).body
  return {
    head: page.headSeq as number,
    content: (page.schema.root.children ?? []).filter((child: any) => child.type === 'Text').map((child: any) => child.props?.content),
  }
}

/** 이 탭의 WS 가 보내고 받은 프레임의 종류 — 판이 섰는지 · 신호가 왔는지를 값으로 센다. */
function watch(page: Page): string[] {
  const lines: string[] = []
  page.on('websocket', (ws) => {
    ws.on('framereceived', (frame) => {
      const payload = String(frame.payload)
      const kind = /"type":"(joined|page-changed|page-stale|patch-ack|patch-error)"/.exec(payload)?.[1]
      if (kind === undefined) return
      const status = kind === 'patch-error' ? ` ${/"status":(\d+)/.exec(payload)?.[1]}` : ''
      lines.push(`WS← ${kind}${status}`)
    })
  })
  return lines
}

/** `watch` 와 같되 `page-stale` 프레임의 `seq` 힌트를 `stale` 에 적는다 — 힌트가 없는 신호는 `-1`. */
function watchStale(page: Page): { lines: string[]; stale: number[] } {
  const lines = watch(page)
  const stale: number[] = []
  page.on('websocket', (ws) => {
    ws.on('framereceived', (frame) => {
      const payload = String(frame.payload)
      if (!/"type":"page-stale"/.test(payload)) return
      const seq = /"seq":(\d+)/.exec(payload)?.[1]
      stale.push(seq === undefined ? -1 : Number(seq))
    })
  })
  return { lines, stale }
}

/** 그 페이지를 읽는 `GET …/pages/:id` 의 수 — 이 시점 뒤. */
function countPageReads(page: Page, pageId: string): { count(): number } {
  let reads = 0
  page.on('request', (request) => {
    if (request.method() === 'GET' && request.url().includes(`/pages/${pageId}`) && !request.url().includes('/comments')) reads += 1
  })
  return { count: () => reads }
}

/** «다시 불러오기»가 메뉴 트리를 다시 받지 않는지 — 이 시점 뒤의 `GET …/tree` 수. */
function countTreeReads(page: Page): { count(): number } {
  let reads = 0
  page.on('request', (request) => {
    if (request.method() === 'GET' && /\/api\/projects\/[^/]+\/tree/.test(request.url())) reads += 1
  })
  return { count: () => reads }
}

async function selectFirstText(page: Page, content: string) {
  await canvasFrame(page).locator('body', { hasText: content }).waitFor()
  await page.locator('li button', { hasText: 'Text' }).first().click()
  const box = page.locator('.wb-shell-panel textarea').first()
  await box.waitFor()
  return box
}
