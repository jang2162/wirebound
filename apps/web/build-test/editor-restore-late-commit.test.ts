/**
 * **늦게 커밋된 복원이 제때 커밋과 같은 꼬리를 늦게 내고, 받는 쪽은 트리 · 코멘트 · 캔버스를 서버 판으로 맞춘다**(서버 `routes/snapshots.ts`의 `announceRestore` —
 * `services/lost-commit.ts`의 `late` → 웹 `EditorStore.markRestored` · `#lostRestores` · `use-tree-commands.tsx`의 `remoteRev`).
 *
 * 앨리스의 복원 COMMIT 을 서버에서 `LATE_COMMIT_MS` 늦추고(`revisions` 의 `DEFERRABLE INITIALLY DEFERRED` 제약 트리거의 `pg_sleep`) api 가 DB 에 닿는 소켓만 끊는다
 * (`EditorStack.dbHalfCut`) — 커밋은 되는데 앨리스는 503 «모름»을 받는다. 서버는 한도(1s) 안에 결말을 못 알고, 커밋된 뒤 `restored` · `menu-changed` 를 낸다.
 *
 * | | 밥(지켜보는 탭) | 앨리스(낸 탭) |
 * |---|---|---|
 * | 신호 앞 | 트리에 둘째 페이지 · 코멘트 1 · 캔버스 «바뀐 글» | 503 → «복원됐는지 알 수 없습니다» → 단추로 다시 읽음(복원 앞 판) → 배너 걷힘 |
 * | 늦은 꼬리 | `menu-changed` 로 트리가 스스로 둘째 페이지를 지움 · «스냅샷이 복원됐습니다» 배너 · 코멘트는 아직 1 | 답을 잃은 내 복원의 id 를 실은 `restored` → 배너가 **다시** 선다(«스냅샷이 복원됐습니다» — «모른다» · «다른 사람» 없음 · CLAUDE.md «답을 잃은 쓰기에 세운 경보») |
 * | «다시 불러오기» | 코멘트 0 · 캔버스 «원문» · 배너 걷힘 | 같다 |
 *
 * `page-stale` 은 복원에 안 온다 — 밥의 로그로 센다. 서버 쪽 값(꼬리의 프레임 넷 · 변조)은 `apps/api/test/late-commit-stale.test.ts` «늦게 커밋된 복원»이 든다.
 */
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canvasFrame, canvasText, editorStackPrerequisite, poll, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

/** 커밋을 늦추는 폭 — 확인 한도(`LOST_COMMIT_PROBE_MS` 1s)를 넘기고 지켜보기(30s) 안이며, 앨리스가 503 뒤 단추로 다시 읽을 틈(약 1s)을 둔다. */
const LATE_COMMIT_MS = 4_000

const TREE = '.wb-shell-region[aria-label="메뉴·페이지 트리"]'
const RESTORED_ALERT = '스냅샷이 복원됐습니다'
const UNANSWERED_ALERT = '알 수 없습니다'

describe.skipIf(!전제.ok)('늦게 커밋된 복원의 꼬리', () => {
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

  it('밥의 트리 · 코멘트 · 캔버스가 서버 판과 같아지고, 앨리스의 걷힌 배너가 늦은 신호로 다시 선다', async () => {
    const alice = await stack.login(stack.users.alice)
    const fx = await fixture(stack, alice)
    const [aliceTab, bobTab] = await Promise.all([stack.openTab(stack.users.alice), stack.openTab(stack.users.bob)])
    const aliceLog = watch(aliceTab.page)
    const bobLog = watch(bobTab.page)
    const restoreAnswers: number[] = []
    aliceTab.page.on('response', (response) => {
      if (response.request().method() === 'POST' && response.url().endsWith('/restore')) restoreAnswers.push(response.status())
    })
    try {
      await Promise.all([aliceTab.page.goto(fx.P), bobTab.page.goto(fx.P)])
      await Promise.all([
        canvasFrame(aliceTab.page).locator('body', { hasText: '바뀐 글' }).waitFor(),
        canvasFrame(bobTab.page).locator('body', { hasText: '바뀐 글' }).waitFor(),
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
      // 밥: 복원 앞의 판 — 트리에 둘째 페이지 · 코멘트 1.
      await bobTab.page.getByRole('tab', { name: '코멘트' }).click()
      await bobTab.page.locator('li.wb-shell-comment').first().waitFor()
      expect(await secondPageRows(bobTab.page)).toBe(1)
      expect(await commentCount(bobTab.page)).toBe(1)

      await stack.query(
        `create or replace function zz_late_restore() returns trigger language plpgsql as $$ begin perform pg_sleep(${LATE_COMMIT_MS / 1000}); return null; end $$`,
      )
      await stack.query(
        `create constraint trigger zz_late_restore after insert on revisions deferrable initially deferred for each row when (new.page_id = '${fx.pageId}') execute function zz_late_restore()`,
      )
      try {
        // 복원의 첫 쓰기가 안전망 스냅샷이다(`services/restore.ts`) — 그 연결의 COMMIT 에서 끊는다.
        stack.dbHalfCut!.arm('insert into "snapshots"')
        await restore(aliceTab.page)
        await poll(
          '앨리스가 503 을 받는다',
          async () => restoreAnswers.slice(),
          (answers) => answers.length > 0,
          15_000,
        )
        expect(restoreAnswers).toEqual([503])
        expect(stack.dbHalfCut!.fired).toBe(true)
        await aliceTab.page.locator('[role=status]', { hasText: UNANSWERED_ALERT }).waitFor({ timeout: 10_000 })

        // 앨리스가 커밋 앞에 단추로 다시 읽는다 — 배너가 걷히고 화면은 복원 앞 판이다. 상자를 먼저 닫는다(모달이 열린 동안 하단 바는 `inert`).
        await aliceTab.page.keyboard.press('Escape')
        await poll(
          '스냅샷 대화 상자가 닫힌다',
          async () => aliceTab.page.getByRole('dialog').count(),
          (count) => count === 0,
          5_000,
        )
        await aliceTab.page.locator('.wb-shell-remote-alert').getByRole('button', { name: '다시 불러오기' }).click()
        await aliceTab.page.locator('.wb-shell-remote-alert').waitFor({ state: 'detached', timeout: 10_000 })
        const reread = {
          서버: await server(stack, alice, fx.P),
          캔버스: await canvasText(aliceTab.page),
          restored: aliceLog.filter((line) => line === 'WS← restored').length,
        }

        // 늦은 꼬리 — 두 탭 다 `restored` 를 받는다.
        await Promise.all([
          poll(
            '밥이 restored 를 받는다',
            async () => bobLog.slice(),
            (lines) => lines.includes('WS← restored'),
            25_000,
          ),
          poll(
            '앨리스가 restored 를 받는다',
            async () => aliceLog.slice(),
            (lines) => lines.includes('WS← restored'),
            25_000,
          ),
        ])
        const landed = await server(stack, alice, fx.P)

        // 앨리스: 답을 잃은 내 복원의 신호 — 걷혔던 배너가 다시 선다. «모른다» · «다른 사람»이 아니다.
        await aliceTab.page.locator('[role=status]', { hasText: RESTORED_ALERT }).waitFor({ timeout: 10_000 })
        const aliceStatuses = await aliceTab.page.locator('[role=status]').allTextContents()
        // 밥: 배너가 서고 트리는 `menu-changed` 로 스스로 둘째 페이지를 지웠다 — 코멘트 · 캔버스는 누르기 전이라 아직 복원 앞이다.
        await bobTab.page.locator('[role=status]', { hasText: RESTORED_ALERT }).waitFor({ timeout: 10_000 })
        await poll(
          '밥의 트리에서 둘째 페이지가 사라진다',
          () => secondPageRows(bobTab.page),
          (rows) => rows === 0,
          10_000,
        )
        const bobBefore = { 코멘트: await commentCount(bobTab.page), 캔버스: await canvasText(bobTab.page) }

        await bobTab.page.locator('.wb-shell-remote-alert').getByRole('button', { name: '다시 불러오기' }).click()
        await canvasFrame(bobTab.page).locator('body', { hasText: '원문' }).waitFor({ timeout: 10_000 })
        await bobTab.page.locator('.wb-shell-remote-alert').waitFor({ state: 'detached', timeout: 10_000 })
        await poll(
          '밥의 코멘트 목록이 비는다',
          () => commentCount(bobTab.page),
          (count) => count === 0,
          10_000,
        )
        await aliceTab.page.locator('.wb-shell-remote-alert').getByRole('button', { name: '다시 불러오기' }).click()
        await canvasFrame(aliceTab.page).locator('body', { hasText: '원문' }).waitFor({ timeout: 10_000 })
        await aliceTab.page.locator('.wb-shell-remote-alert').waitFor({ state: 'detached', timeout: 10_000 })

        const after = {
          밥: { 캔버스: await canvasText(bobTab.page), 코멘트: await commentCount(bobTab.page), 둘째줄: await secondPageRows(bobTab.page) },
          앨리스: { 캔버스: await canvasText(aliceTab.page), 둘째줄: await secondPageRows(aliceTab.page) },
        }
        // eslint-disable-next-line no-console
        console.log(
          `[늦은 복원] 앨리스 ${aliceLog.join(' · ')} · 밥 ${bobLog.join(' · ')} · 복원 답 ${JSON.stringify(restoreAnswers)} · 다시 읽은 뒤 ${JSON.stringify(reread)} · 커밋 뒤 서버 ${JSON.stringify(landed)} · 누르기 전 밥 ${JSON.stringify(bobBefore)} · 앨리스 상태줄 ${JSON.stringify(aliceStatuses)} · 누른 뒤 ${JSON.stringify(after)}`,
        )

        // 판 카나리아 — 앨리스의 다시 읽기는 복원 앞을 읽었고(신호 0 · 바뀐 글) 복원은 그 뒤에 커밋됐다.
        expect(reread).toEqual({ 서버: '바뀐 글', 캔버스: expect.stringContaining('바뀐 글') as unknown as string, restored: 0 })
        expect(landed).toBe('원문')
        expect(bobLog.filter((line) => line === 'WS← page-stale')).toEqual([])
        expect(bobLog.filter((line) => line === 'WS← menu-changed').length).toBeGreaterThanOrEqual(1)
        // 성질 — 화면이 서버와 다르면 그렇다고 말하고(앨리스 · 누가 했는지는 안 말한다), 단추가 셋(트리 · 코멘트 · 캔버스)을 서버 판으로 맞춘다.
        expect(aliceStatuses.some((text) => text.includes(RESTORED_ALERT))).toBe(true)
        expect(aliceStatuses.filter((text) => /다른 사람|알 수 없/.test(text))).toEqual([])
        expect(bobBefore).toEqual({ 코멘트: 1, 캔버스: expect.stringContaining('바뀐 글') as unknown as string })
        expect(after).toEqual({
          밥: { 캔버스: expect.stringContaining('원문') as unknown as string, 코멘트: 0, 둘째줄: 0 },
          앨리스: { 캔버스: expect.stringContaining('원문') as unknown as string, 둘째줄: 0 },
        })
      } finally {
        await stack.query('drop trigger if exists zz_late_restore on revisions')
        await stack.query('drop function if exists zz_late_restore()')
      }
    } finally {
      await aliceTab.context.close()
      await bobTab.context.close()
    }
  }, 120_000)
})

interface Fixture {
  projectId: string
  pageId: string
  P: string
}

/** 스냅샷 v1(원문 · 페이지 하나 · 코멘트 없음) 뒤에 글을 바꾸고 둘째 페이지와 코멘트를 더한다 — 복원이 셋을 되돌린다. */
async function fixture(stack: EditorStack, owner: Session): Promise<Fixture> {
  const call = (method: string, path: string, body?: unknown) => stack.request(owner, method, path, body)
  const project = created(await call('POST', '/projects', { name: '늦은 복원', slug: `late-restore-${Date.now().toString(36)}` }))
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
  created(await call('POST', `/projects/${project.id}/snapshots`, { tag: 'v1' }))
  const changed = await call('PATCH', `${P}/ops`, {
    baseSeq: 1,
    ops: [{ op: 'replace', path: '/root/children/0/props/content', value: '바뀐 글' }],
  })
  if (changed.status >= 300) throw new Error(`픽스처 ops ${changed.status} ${JSON.stringify(changed.body)}`)
  created(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '둘째' }))
  created(await call('POST', `${P}/comments`, { nodeId: 'n_text000001', body: '지워질 코멘트' }))
  return { projectId: project.id, pageId: page.id, P }
}

function created(response: { status: number; body: any }): { id: string } {
  if (response.status !== 201) throw new Error(`픽스처 ${response.status} ${JSON.stringify(response.body)}`)
  return response.body
}

async function server(stack: EditorStack, session: Session, path: string): Promise<string> {
  const detail = await stack.request(session, 'GET', path)
  return String(detail.body?.schema?.root?.children?.[0]?.props?.content)
}

/** 스냅샷 대화 상자에서 v1 로 되돌린다(`editor-restore-unanswered.test.ts`와 같은 걸음). */
async function restore(page: Page): Promise<void> {
  await page.getByRole('button', { name: '더 보기', exact: true }).click()
  await page.getByRole('menuitem', { name: '스냅샷' }).click()
  await page.getByRole('button', { name: '이 상태로 되돌리기' }).click()
  await page.getByRole('button', { name: '되돌린다' }).click()
}

/** 좌측 트리에서 «둘째» 페이지 줄의 수. */
function secondPageRows(page: Page): Promise<number> {
  return page.locator(`${TREE} .wb-shell-tree-page`, { hasText: '둘째' }).count()
}

/** 코멘트 탭의 코멘트 수. */
function commentCount(page: Page): Promise<number> {
  return page.locator('li.wb-shell-comment').count()
}

/** 이 탭의 WS 가 받은 프레임의 종류 — 판이 섰는지 · 신호가 왔는지를 값으로 센다. */
function watch(page: Page): string[] {
  const lines: string[] = []
  page.on('websocket', (ws) => {
    ws.on('framereceived', (frame) => {
      const kind = /"type":"(joined|restored|menu-changed|page-stale|theme-changed)"/.exec(String(frame.payload))?.[1]
      if (kind !== undefined) lines.push(`WS← ${kind}`)
    })
  })
  return lines
}
