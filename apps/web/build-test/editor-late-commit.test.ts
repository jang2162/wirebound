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
})

interface Fixture {
  projectId: string
  pageId: string
  P: string
}

async function fixture(stack: EditorStack, owner: Session): Promise<Fixture> {
  const call = (method: string, path: string, body?: unknown) => stack.request(owner, method, path, body)
  const project = created(await call('POST', '/projects', { name: '늦은 커밋', slug: `late-commit-${Date.now().toString(36)}` }))
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
