/**
 * **내 복원의 신호와 답이 어떤 차례로 와도 화면이 서버와 같거나 배너가 그렇다고 말한다**(`EditorStore.markRestored`).
 *
 * 복원의 방송은 낸 연결도 빼지 않는다(서버 `ws/notify.ts`의 `notifyRestored`) — 답을 잃은 탭에게는 그 신호만이 서버가 복원했다는 것을 알린다.
 * 그래서 내 복원의 신호가 늘 이 탭에 오고, 탭은 답을 받은 복원을 안전망 스냅샷 id 로 알아보고 넘긴다. 입구는 스냅샷 대화 상자 하나다(MCP · CLI 에는
 * 복원이 없다). 칸은 넷이다:
 *
 * | | 신호가 답보다 먼저 | 신호가 답(다시 읽기)보다 늦게 |
 * |---|---|---|
 * | 답을 받음 | 아래 «답보다 먼저» — 거짓 배너 0 | 아래 «다시 읽기보다 늦게» — 거짓 배너 0 |
 * | 답을 잃음 | `editor-restore-unanswered.test.ts` — «복원됐습니다» | 아래 «늦게 커밋» — 배너가 다시 선다 |
 *
 * 차례는 붙잡아 세운다: 답을 신호 뒤로 미루려면 `route.fetch` 뒤 신호를 기다렸다 `fulfill`, 신호를 뒤로 미루려면 서버 → 브라우저 WS 만 늦춘다
 * (`startDownDelay`), 커밋을 다시 읽기 뒤로 미루려면 페이지 행을 쥐어 복원을 서버에 세운다(`holdRow`). 거짓 배너는 끝 화면이 아니라 DOM 에 선
 * 횟수로 센다 — 섰다가 다시 읽기가 걷은 판도 센다.
 *
 * 네 칸 밖의 판 둘도 여기 둔다.
 *
 * - **답을 기다리는 사이 셸이 내려갔다 다시 선 판**(셸 안의 프로젝트 전환 · 뒤로 · 앞으로) — 내려간 셸의 복원 콜백은 스토어에 안 쓰고
 *   (`routes/editor.tsx`의 `shellGeneration`) `reset`은 앞 셸의 복원을 잊는다. 아래 «다른 프로젝트로 …» 넷.
 * - **미뤄 둔 신호의 한도**(`EditorStore`의 `RESTORE_SIGNAL_WAIT_MS`) — 흉내 낸 복원 id 와 매달린 답, 그리고 그 대가. 아래 «흉내 낸 신호 …» ·
 *   «답이 한도보다 늦음».
 */
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { editorStackPrerequisite, poll, startEditorStack, type EditorStack, type Session, type StackUser, canvasFrame, canvasText } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

/** 서버 → 브라우저 WS 지연 — 복원 답 · 다시 읽기(수백 ms)보다 넉넉히 길다. */
const DELAY_MS = 1_500

/** 미뤄 둔 신호의 한도(`EditorStore`의 `RESTORE_SIGNAL_WAIT_MS` — 10s)를 넘겨 기다리는 폭. */
const BEYOND_WAIT_MS = 12_000

describe.skipIf(!전제.ok)('내 복원의 신호와 답의 차례', () => {
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

  it('답을 받음 · 신호가 답보다 먼저 — 배너가 한 번도 서지 않는다', async () => {
    const alice = await stack.login(stack.users.alice)
    const fx = await fixture(stack, alice, 'restore-first')
    const { context, page } = await stack.openTab(stack.users.alice)
    const { lines: events, at } = watch(page)
    // **답을 신호 뒤로 미룬다** — 서버는 끝냈고, 그 신호가 이 탭에 닿은 뒤에야 답을 건넨다.
    await page.route('**/restore', async (route) => {
      const answer = await route.fetch()
      await poll('신호가 먼저 닿는다', async () => events.slice(), (lines) => lines.some((line) => line.endsWith('WS← restored')), 10_000)
      events.push(`${at()} 복원 답 ${answer.status()} 건넴`)
      await route.fulfill({ response: answer })
    })
    try {
      await page.goto(fx.P)
      await canvasFrame(page).locator('body', { hasText: '바뀐 글' }).waitFor()
      await poll('소켓이 룸에 든다', async () => events.slice(), (lines) => lines.some((line) => line.endsWith('WS← joined')))
      await countBanners(page)
      await restore(page)
      await canvasFrame(page).locator('body', { hasText: '원문' }).waitFor({ timeout: 10_000 })
      await page.waitForTimeout(1_000)
      const seen = await bannersSeen(page)
      // eslint-disable-next-line no-console
      console.log(`[답보다 먼저] ${events.join(' · ')} · 배너 선 수 ${seen}`)

      // 판 카나리아 — 신호가 답보다 먼저 닿았다.
      expect(first(events, 'WS← restored')).toBeLessThan(first(events, '복원 답 200 건넴'))
      expect({ 서버: await server(stack, alice, fx.P), 배너: seen }).toEqual({ 서버: '원문', 배너: 0 })
    } finally {
      await context.close()
    }
  })

  it('답을 받음 · 신호가 다시 읽기보다 늦게 — 배너가 한 번도 서지 않는다', async () => {
    const alice = await stack.login(stack.users.alice)
    const fx = await fixture(stack, alice, 'restore-late-signal')
    const delay = await stack.startDownDelay(DELAY_MS)
    const { context, page } = await stack.openTab(stack.users.alice, { origin: delay.origin })
    const { lines: events, at } = watch(page)
    try {
      await page.goto(fx.P)
      await canvasFrame(page).locator('body', { hasText: '바뀐 글' }).waitFor()
      await poll('앨리스의 WS 가 늦춰진 채 붙는다', async () => delay.delayed(), (n) => n >= 1)
      await poll('소켓이 룸에 든다', async () => events.slice(), (lines) => lines.some((line) => line.endsWith('WS← joined')), 10_000)
      await countBanners(page)
      await restore(page)
      await canvasFrame(page).locator('body', { hasText: '원문' }).waitFor({ timeout: 10_000 })
      await poll('신호가 늦게 닿는다', async () => events.slice(), (lines) => lines.some((line) => line.endsWith('WS← restored')), 10_000)
      await page.waitForTimeout(1_000)
      const seen = await bannersSeen(page)
      // eslint-disable-next-line no-console
      console.log(`[다시 읽기보다 늦게] ${events.join(' · ')} · 배너 선 수 ${seen}`)

      // 판 카나리아 — 신호는 답과 다시 읽기의 페이지 조회 뒤에 닿았다.
      expect(first(events, 'WS← restored')).toBeGreaterThan(last(events, 'GET page'))
      expect(last(events, 'GET page')).toBeGreaterThan(first(events, '복원 답 200'))
      expect({ 서버: await server(stack, alice, fx.P), 배너: seen }).toEqual({ 서버: '원문', 배너: 0 })
    } finally {
      await context.close()
      await delay.close()
    }
  })

  /**
   * **F1** — 답을 잃으면 «모른다»가 서고(`editor-restore-unanswered.test.ts`), 그 단추의 다시 읽기가 배너를 걷는다. 답을 잃었다는 것은 서버가
   * 아직 처리 중일 수 있다는 뜻이라, 다시 읽은 **뒤에** 커밋되면 그 신호만이 화면이 낡았다는 것을 안다. 연결을 빼던 판에서는 서버 `원문` ·
   * 캔버스 «바뀐 글» · 배너 없음 · `WS← restored` 없음이었다.
   *
   * 열린 대화 상자(모달 — 뒤 화면이 inert)가 배너 단추를 막는 것은 이 케이스의 축이 아니다 — 닫고 잰다.
   */
  it('답을 잃음 · 다시 읽기보다 늦게 커밋 — 배너가 다시 서고, 그 단추가 화면을 서버 판으로 맞춘다', async () => {
    const alice = await stack.login(stack.users.alice)
    const fx = await fixture(stack, alice, 'restore-late-commit')
    const { context, page } = await stack.openTab(stack.users.alice)
    const { lines: events, at } = watch(page)
    const hold = await stack.holdRow('pages', fx.pageId)
    let released = false
    // **서버로는 보내고 브라우저에는 끊는다** — 서버에 선 요청은 행을 놓을 때 커밋된다.
    let late: Promise<number> | undefined
    await page.route('**/restore', async (route) => {
      late = route.fetch({ timeout: 60_000 }).then((answer) => {
        events.push(`${at()} 늦은 커밋 ${answer.status()}`)
        return answer.status()
      })
      await hold.waitForWaiters(1)
      events.push(`${at()} 복원이 서버에 섰다 · 브라우저에는 끊김`)
      await route.abort('connectionreset')
    })
    try {
      await page.goto(fx.P)
      await canvasFrame(page).locator('body', { hasText: '바뀐 글' }).waitFor()
      await poll('소켓이 룸에 든다', async () => events.slice(), (lines) => lines.some((line) => line.endsWith('WS← joined')))
      await restore(page)
      await poll('답을 잃은 배너가 선다', async () => banner(page), (shown) => shown, 10_000)

      // 사람이 배너의 단추로 다시 읽는다 — 서버는 아직 복원 전이다(행을 쥐었다). 복원을 보낸 대화 상자를 먼저 닫는다(머리말).
      await page.keyboard.press('Escape')
      await poll('스냅샷 대화 상자가 닫힌다', async () => page.locator('.wb-shell-snapshots-body').count(), (count) => count === 0, 5_000)
      await page.locator('.wb-shell-remote-alert').getByRole('button', { name: '다시 불러오기' }).click()
      await poll('배너가 걷힌다', async () => banner(page), (shown) => !shown, 10_000)
      await page.waitForTimeout(500)
      const reread = { 서버: await server(stack, alice, fx.P), 캔버스: await canvas(page), 배너: await banner(page) }

      await hold.release()
      released = true
      expect(await late).toBe(200)
      await page.waitForTimeout(2_000)
      const after = { 서버: await server(stack, alice, fx.P), 캔버스: await canvas(page), 배너: await banner(page) }
      const statuses = await page.locator('[role=status]').allTextContents()
      // eslint-disable-next-line no-console
      console.log(`[늦은 커밋] ${events.join(' · ')} · 다시 읽은 뒤 ${JSON.stringify(reread)} · 커밋 뒤 ${JSON.stringify(after)} · 상태줄 ${JSON.stringify(statuses)}`)

      // 판 카나리아 — 다시 읽기는 복원 앞을 읽었고, 복원은 그 뒤에 커밋됐다.
      expect(reread).toEqual({ 서버: '바뀐 글', 캔버스: expect.stringContaining('바뀐 글') as unknown as string, 배너: false })
      expect(after.서버).toBe('원문')
      // 성질 — 화면이 서버와 다르면 그렇다고 말한다(단추가 있다). 누가 복원했는지는 말하지 않는다(`shell/remote-alert.tsx`의 `NOTICE`).
      expect({ 맞음: after.캔버스.includes(after.서버), 배너: after.배너 }).toEqual({ 맞음: false, 배너: true })
      expect(statuses.some((text) => text.includes('스냅샷이 복원됐습니다'))).toBe(true)
      expect(statuses.filter((text) => /다른 사람|알 수 없/.test(text))).toEqual([])

      await page.locator('.wb-shell-remote-alert').getByRole('button', { name: '다시 불러오기' }).click()
      await canvasFrame(page).locator('body', { hasText: '원문' }).waitFor({ timeout: 10_000 })
      await page.waitForTimeout(500)
      expect({ 캔버스: await canvas(page), 배너: await banner(page) }).toEqual({ 캔버스: expect.stringContaining('원문') as unknown as string, 배너: false })
    } finally {
      if (!released) await hold.release()
      await late?.catch(() => undefined)
      await context.close()
    }
  })

  /**
   * **셸이 내려갔다 다시 서도 내 복원이 조용히 넘겨지지 않는다**(`EditorStore.reset` · `routes/editor.tsx`의 `shellGeneration`). 셸 안에서
   * 다른 프로젝트로 가면 라우트는 스토어를 그대로 두고 셸만 내렸다 다시 세운다 — 복원을 보낸 몸체는 내려간 셸의 콜백을 쥔 채 답을 받는다.
   * 그 콜백이 산 스토어에 «내 것»을 적으면, 돌아온 셸에 온 그 복원의 신호가 넘겨지는데 다시 읽기는 내려간 셸에서 돌아(아무것도 안 함)
   * 서버 `원문` · 캔버스 «바뀐 글» · 배너 없음이었다. 두 차례 다 그랬다 — 신호가 먼저면 미뤄 둔 신호를 죽은 셸의 답이 넘겼고, 답이 먼저면
   * 죽은 셸의 답이 적은 안전망 id 가 뒤의 신호를 넘겼다. 이제 돌아온 셸에는 그 복원이 남의 복원으로 선다(문장은 반만 맞고 단추는 맞다).
   *
   * 다른 프로젝트로 가는 링크는 셸 안에 없다 — 이력을 건너뛰는 뒤로 · 앞으로가 이 길이다. `pushState` + `popstate`로 그 길을 탄다.
   */
  for (const order of ['신호가 먼저', '답이 먼저'] as const) {
    it(`복원이 도는 사이 다른 프로젝트로 갔다 돌아옴 · ${order} — 커밋 뒤 화면이 서버와 같거나 배너가 선다`, async () => {
      const alice = await stack.login(stack.users.alice)
      const fx = await fixture(stack, alice, `restore-away-${order === '신호가 먼저' ? 'signal' : 'answer'}`)
      const other = await fixture(stack, alice, 'restore-away-other')
      // 답이 먼저인 차례 — 서버 → 브라우저 WS 만 늦춘다.
      const delay = order === '답이 먼저' ? await stack.startDownDelay(DELAY_MS) : undefined
      const { context, page } = await stack.openTab(stack.users.alice, delay === undefined ? {} : { origin: delay.origin })
      const { lines: events, at } = watch(page)
      const hold = await stack.holdRow('pages', fx.pageId)
      let released = false
      if (order === '신호가 먼저') {
        await page.route('**/restore', async (route) => {
          const answer = await route.fetch({ timeout: 60_000 })
          await poll('신호가 먼저 닿는다', async () => events.slice(), (lines) => lines.some((line) => line.endsWith('WS← restored')), 15_000)
          events.push(`${at()} 복원 답 ${answer.status()} 건넴`)
          await route.fulfill({ response: answer })
        })
      }
      try {
        await page.goto(fx.P)
        await canvasFrame(page).locator('body', { hasText: '바뀐 글' }).waitFor()
        await joinedAtLeast(events, 1)
        await restore(page)
        await hold.waitForWaiters(1)
        await travel(page, other.P)
        await canvasFrame(page).locator('body', { hasText: '바뀐 글' }).waitFor()
        await joinedAtLeast(events, 2)
        await page.evaluate(() => history.back())
        await page.waitForURL((url) => url.pathname === fx.P)
        await canvasFrame(page).locator('body', { hasText: '바뀐 글' }).waitFor()
        await joinedAtLeast(events, 3)
        events.push(`${at()} 돌아옴`)
        const back = { 서버: await server(stack, alice, fx.P), 배너: await banner(page) }

        await hold.release()
        released = true
        await poll('신호', async () => events.slice(), (lines) => lines.some((line) => line.endsWith('WS← restored')), 15_000)
        await poll('답', async () => events.slice(), (lines) => lines.some((line) => line.includes('복원 답 200')), 15_000)
        await page.waitForTimeout(2_500)
        const after = { 서버: await server(stack, alice, fx.P), 캔버스: await canvas(page), 배너: await banner(page) }
        const statuses = await page.locator('[role=status]').allTextContents()
        // eslint-disable-next-line no-console
        console.log(`[다른 프로젝트 · ${order}] ${events.join(' · ')} · 돌아온 뒤 ${JSON.stringify(back)} · 커밋 뒤 ${JSON.stringify(after)} · 상태줄 ${JSON.stringify(statuses)}`)

        // 판 카나리아 — 돌아온 뒤에도 복원은 서버에 서 있었고, 행을 놓자 커밋됐다. 그 차례로 닿았다.
        expect(back).toEqual({ 서버: '바뀐 글', 배너: false })
        expect(after.서버).toBe('원문')
        const signalAt = first(events, 'WS← restored')
        const answerAt = events.findIndex((line) => line.includes('복원 답 200'))
        expect(order === '신호가 먼저' ? signalAt < answerAt : answerAt < signalAt).toBe(true)
        // 성질 — 화면이 서버와 다르면 그렇다고 말한다.
        expect({ 맞음: after.캔버스.includes(after.서버), 배너: after.배너 }).toEqual({ 맞음: false, 배너: true })
      } finally {
        if (!released) await hold.release()
        await context.close()
        await delay?.close()
      }
    })
  }

  /**
   * **내려간 셸의 복원 답은 다음 프로젝트의 배너를 풀지 않는다**(`routes/editor.tsx`의 `reloadAfterRestore`). 그 답이 부르는 다시 읽기의 시작
   * 표시(`EditorStore.beginRestoreReread`)가 산 스토어에 적히면, 그 뒤에 시작한 아무 페이지 조회가 복원 배너를 푼다 — 메뉴 · 테마는 다시
   * 읽지 않았는데(다시 읽는 자리들은 내려간 셸에 있었다). B 에서 남의 복원이 지운 페이지 «셋째»가 트리에 남은 채 배너가 사라진다.
   */
  it('복원이 도는 사이 다른 프로젝트로 감 · 그 답이 거기 옴 — 남의 복원 배너가 트리를 다시 읽기 전에 안 풀린다', async () => {
    const alice = await stack.login(stack.users.alice)
    const bob = await stack.login(stack.users.bob)
    const fx = await fixture(stack, alice, 'restore-dead-answer')
    const b = await otherProject(stack, bob, stack.users.alice, 'restore-dead-answer-b')
    const { context, page } = await stack.openTab(stack.users.alice)
    const { lines: events, at } = watch(page)
    const hold = await stack.holdRow('pages', fx.pageId)
    let released = false
    try {
      await page.goto(fx.P)
      await canvasFrame(page).locator('body', { hasText: '바뀐 글' }).waitFor()
      await joinedAtLeast(events, 1)
      await restore(page)
      await hold.waitForWaiters(1)
      await travel(page, b.first)
      await canvasFrame(page).locator('body', { hasText: '첫째 원문' }).waitFor()
      await joinedAtLeast(events, 2)
      await page.getByRole('link', { name: '셋째' }).waitFor()

      // 밥이 B 를 «셋째»가 없던 판으로 복원한다 — 앨리스에게는 남의 복원 배너.
      const restored = await stack.request(bob, 'POST', `/projects/${b.projectId}/snapshots/${b.snapshotId}/restore`)
      if (restored.status !== 200) throw new Error(`밥의 복원 ${restored.status}`)
      await poll('남의 복원 배너', async () => banner(page), (shown) => shown, 10_000)

      // A 의 복원을 놓는다 — 그 답이 B 에 선 탭에 온다(내려간 셸의 콜백).
      await hold.release()
      released = true
      await poll('A 의 답', async () => events.slice(), (lines) => lines.some((line) => line.includes('복원 답 200')), 15_000)
      await page.waitForTimeout(500)
      events.push(`${at()} 둘째로 옮김`)
      await page.getByRole('link', { name: '둘째' }).click()
      await canvasFrame(page).locator('body', { hasText: '둘째 원문' }).waitFor()
      await page.waitForTimeout(1_500)
      const after = {
        트리에_셋째: (await page.getByRole('link', { name: '셋째' }).count()) > 0,
        서버에_셋째: (await stack.request(alice, 'GET', `/projects/${b.projectId}/pages/${b.third}`)).status === 200,
        배너: await banner(page),
      }
      const statuses = await page.locator('[role=status]').allTextContents()
      // eslint-disable-next-line no-console
      console.log(`[죽은 셸의 답] ${events.join(' · ')} · 둘째로 옮긴 뒤 ${JSON.stringify(after)} · 상태줄 ${JSON.stringify(statuses)}`)

      // 판 카나리아 — 트리는 아직 복원 앞 판이다(«셋째»가 있다), 서버에는 없다.
      expect({ 트리에_셋째: after.트리에_셋째, 서버에_셋째: after.서버에_셋째 }).toEqual({ 트리에_셋째: true, 서버에_셋째: false })
      // 성질 — 트리가 서버와 다르면 배너가 그렇다고 말한다.
      expect(after.배너).toBe(true)
    } finally {
      if (!released) await hold.release()
      await context.close()
    }
  })

  /**
   * **내려간 셸의 «답 잃음»은 다음 프로젝트에 배너를 세우지 않는다**(`routes/editor.tsx`의 `shellGeneration`). 그 콜백이 산 스토어에 쓰면 B 에
   * «복원됐는지 모릅니다»가 선다 — B 는 그 복원과 무관하다.
   */
  it('복원이 도는 사이 다른 프로젝트로 감 · 그 답을 거기서 잃음 — 거기에 배너가 서지 않는다', async () => {
    const alice = await stack.login(stack.users.alice)
    const fx = await fixture(stack, alice, 'restore-dead-lost')
    const other = await fixture(stack, alice, 'restore-dead-lost-other')
    const { context, page } = await stack.openTab(stack.users.alice)
    const { lines: events, at } = watch(page)
    let cut: (() => void) | undefined
    const gate = new Promise<void>((resolve) => (cut = resolve))
    // 서버로 보내지 않고 붙잡았다가 끊는다 — 탭에는 답을 잃은 복원이다.
    await page.route('**/restore', async (route) => {
      events.push(`${at()} 복원 붙잡음`)
      await gate
      events.push(`${at()} 복원 끊음`)
      await route.abort('connectionreset')
    })
    try {
      await page.goto(fx.P)
      await canvasFrame(page).locator('body', { hasText: '바뀐 글' }).waitFor()
      await joinedAtLeast(events, 1)
      await restore(page)
      await poll('복원이 붙잡힌다', async () => events.slice(), (lines) => lines.some((line) => line.endsWith('복원 붙잡음')))
      await travel(page, other.P)
      await canvasFrame(page).locator('body', { hasText: '바뀐 글' }).waitFor()
      await joinedAtLeast(events, 2)
      await countBanners(page)
      cut?.()
      await poll('끊었다', async () => events.slice(), (lines) => lines.some((line) => line.endsWith('복원 끊음')))
      await page.waitForTimeout(1_500)
      const seen = await bannersSeen(page)
      const statuses = await page.locator('[role=status]').allTextContents()
      // eslint-disable-next-line no-console
      console.log(`[죽은 셸의 답 잃음] ${events.join(' · ')} · 배너 선 수 ${seen} · 상태줄 ${JSON.stringify(statuses)}`)

      expect({ 배너: seen, 복원_문장: statuses.some((text) => text.includes('복원')) }).toEqual({ 배너: 0, 복원_문장: false })
    } finally {
      cut?.()
      await context.close()
    }
  })

  /**
   * **미뤄 둔 신호는 한도(`RESTORE_SIGNAL_WAIT_MS` — 10s) 안에 답을 못 만나면 남의 복원으로 선다**(`EditorStore.markRestored`). 탭이 지은 복원
   * id 는 룸의 모두에게 보여, owner 가 남의 id 를 실어 복원하면 그 신호는 그 탭의 답까지 미뤄진다 — 답이 매달리면(쓰기에는 시간 한도가 없다)
   * 화면이 서버와 다른데 배너가 끝까지 없었다. 한도 뒤에는 배너가 서고, 매달린 답이 오면 그 다시 읽기가 화면을 서버 판으로 맞춘다.
   */
  it('흉내 낸 신호 · 내 답이 매달림 — 한도 뒤 배너가 서고, 답의 다시 읽기가 화면을 서버와 맞춘다', async () => {
    const alice = await stack.login(stack.users.alice)
    const bob = await stack.login(stack.users.bob)
    const fx = await fixture(stack, alice, 'restore-mimic', true)
    const member = await stack.request(alice, 'POST', `/projects/${fx.projectId}/members`, { email: stack.users.bob.email, role: 'owner' })
    if (member.status >= 300) throw new Error(`픽스처 member ${member.status}`)
    const { context, page } = await stack.openTab(stack.users.alice)
    const { lines: events, at } = watch(page)
    let restoreId: string | undefined
    let answer: (() => void) | undefined
    const gate = new Promise<void>((resolve) => (answer = resolve))
    // 앨리스의 복원은 서버에서 끝나고, 답만 붙잡는다.
    await page.route('**/restore', async (route) => {
      restoreId = route.request().headers()['x-wb-restore-id']
      const response = await route.fetch({ timeout: 60_000 })
      events.push(`${at()} 앨리스 복원 서버 ${response.status()} · 답 붙잡음`)
      await gate
      await route.fulfill({ response })
    })
    try {
      await page.goto(fx.P)
      await canvasFrame(page).locator('body', { hasText: '셋째 글' }).waitFor()
      await joinedAtLeast(events, 1)
      await countBanners(page)
      await page.getByRole('button', { name: '더 보기', exact: true }).click()
      await page.getByRole('menuitem', { name: '스냅샷' }).click()
      await page.locator('li.wb-shell-snapshots-row', { hasText: 'v1' }).getByRole('button', { name: '이 상태로 되돌리기' }).click()
      await page.getByRole('button', { name: '되돌린다' }).click()
      await poll('앨리스 복원이 서버에서 끝남', async () => events.slice(), (lines) => lines.some((line) => line.endsWith('답 붙잡음')), 15_000)
      await poll('앨리스 신호', async () => events.filter((line) => line.endsWith('WS← restored')).length, (n) => n >= 1)

      // 밥이 앨리스의 복원 id 를 실어 v2(«바뀐 글»)로 복원한다.
      const snapshots = await stack.request(bob, 'GET', `/projects/${fx.projectId}/snapshots`)
      const v2 = (snapshots.body.snapshots ?? snapshots.body).find((snapshot: { tag: string }) => snapshot.tag === 'v2')
      const mimic = await fetch(`${stack.apiUrl}/api/projects/${fx.projectId}/snapshots/${v2.id}/restore`, {
        method: 'POST',
        headers: { cookie: bob.cookie, 'x-wb-restore-id': restoreId ?? '' },
      })
      events.push(`${at()} 밥 복원 ${mimic.status}`)
      await poll('밥 신호', async () => events.filter((line) => line.endsWith('WS← restored')).length, (n) => n >= 2)
      const bobSignal = Date.now()
      await page.waitForTimeout(2_000)
      const early = { 배너: await banner(page), 선_수: await bannersSeen(page) }
      // 한도가 지나도록 기다린다 — 폴로 기다리면 배너가 끝내 안 서는 판이 값이 아니라 시간 초과로 죽는다.
      await page.waitForTimeout(BEYOND_WAIT_MS - (Date.now() - bobSignal))
      const hung = { 서버: await server(stack, alice, fx.P), 캔버스: await canvas(page), 배너: await banner(page) }

      answer?.()
      await canvasFrame(page).locator('body', { hasText: hung.서버 }).waitFor({ timeout: 10_000 })
      await page.waitForTimeout(1_000)
      const after = { 서버: await server(stack, alice, fx.P), 캔버스: await canvas(page), 배너: await banner(page) }
      // eslint-disable-next-line no-console
      console.log(`[흉내 · 매달린 답] ${events.join(' · ')} · 2s ${JSON.stringify(early)} · ${BEYOND_WAIT_MS}ms ${JSON.stringify(hung)} · 답 뒤 ${JSON.stringify(after)}`)

      // 판 카나리아 — 밥의 신호는 앨리스의 답까지 미뤄졌다(2s 에 배너 없음), 서버는 밥의 판이고 캔버스는 아직 옛 글이다.
      expect(early).toEqual({ 배너: false, 선_수: 0 })
      expect({ 서버: hung.서버, 캔버스에_서버: hung.캔버스.includes(hung.서버) }).toEqual({ 서버: '바뀐 글', 캔버스에_서버: false })
      // 성질 — 한도 뒤에는 말한다. 답의 다시 읽기가 화면을 맞추고 배너를 걷는다.
      expect(hung.배너).toBe(true)
      expect({ 맞음: after.캔버스.includes(after.서버), 배너: after.배너 }).toEqual({ 맞음: true, 배너: false })
    } finally {
      answer?.()
      await context.close()
    }
  })

  /**
   * **R2 의 대가 — 내 답이 한도보다 늦으면 거짓 배너가 한 번 서고, 그 답의 다시 읽기가 걷는다.** 신호는 답보다 먼저 닿아 미뤄지고, 한도가
   * 지나면 남의 복원으로 선다. 답이 오면 셸이 복원 뒤 다시 읽기를 시작하고(`reloadAfterRestore`) 그 판이 배너를 푼다.
   */
  it('답을 받음 · 답이 한도보다 늦음 — 거짓 배너가 한 번 서고 답의 다시 읽기가 걷는다', async () => {
    const alice = await stack.login(stack.users.alice)
    const fx = await fixture(stack, alice, 'restore-late-answer')
    const { context, page } = await stack.openTab(stack.users.alice)
    const { lines: events, at } = watch(page)
    let answer: (() => void) | undefined
    const gate = new Promise<void>((resolve) => (answer = resolve))
    await page.route('**/restore', async (route) => {
      const response = await route.fetch({ timeout: 60_000 })
      events.push(`${at()} 복원 서버 ${response.status()} · 답 붙잡음`)
      await gate
      events.push(`${at()} 복원 답 ${response.status()} 건넴`)
      await route.fulfill({ response })
    })
    try {
      await page.goto(fx.P)
      await canvasFrame(page).locator('body', { hasText: '바뀐 글' }).waitFor()
      await joinedAtLeast(events, 1)
      await countBanners(page)
      await restore(page)
      await poll('신호', async () => events.slice(), (lines) => lines.some((line) => line.endsWith('WS← restored')), 10_000)
      await page.waitForTimeout(BEYOND_WAIT_MS)
      const hung = { 배너: await banner(page) }
      answer?.()
      await canvasFrame(page).locator('body', { hasText: '원문' }).waitFor({ timeout: 10_000 })
      await poll('배너가 걷힌다', async () => banner(page), (shown) => !shown, 10_000)
      await page.waitForTimeout(500)
      const after = { 서버: await server(stack, alice, fx.P), 캔버스: await canvas(page), 배너: await banner(page), 선_수: await bannersSeen(page) }
      // eslint-disable-next-line no-console
      console.log(`[한도보다 늦은 답] ${events.join(' · ')} · ${BEYOND_WAIT_MS}ms ${JSON.stringify(hung)} · 답 뒤 ${JSON.stringify(after)}`)

      expect(first(events, 'WS← restored')).toBeLessThan(first(events, '건넴'))
      expect(hung).toEqual({ 배너: true })
      expect(after).toEqual({ 서버: '원문', 캔버스: expect.stringContaining('원문') as unknown as string, 배너: false, 선_수: 1 })
    } finally {
      answer?.()
      await context.close()
    }
  })
})

/** 셸 안에서 다른 주소로 간다 — 이력을 건너뛰는 뒤로 · 앞으로와 같은 길(`popstate`)이다. */
async function travel(page: Page, to: string): Promise<void> {
  await page.evaluate((path) => {
    history.pushState({}, '', path)
    dispatchEvent(new PopStateEvent('popstate'))
  }, to)
}

/** 소켓이 룸에 든 수가 `count` 이상이 될 때까지 — 프로젝트를 옮길 때마다 새 룸에 든다. */
async function joinedAtLeast(lines: string[], count: number): Promise<void> {
  await poll(`룸에 ${count}번 든다`, async () => lines.filter((line) => line.endsWith('WS← joined')).length, (n) => n >= count, 10_000)
}

/**
 * 밥의 프로젝트 — 앨리스는 owner 다. 페이지 «첫째» · «둘째»를 스냅샷에 얼린 뒤 «셋째»를 더한다(그 스냅샷으로 복원하면 «셋째»가 지워진다).
 */
async function otherProject(
  stack: EditorStack,
  owner: Session,
  member: StackUser,
  slug: string,
): Promise<{ projectId: string; snapshotId: string; first: string; third: string }> {
  const call = (method: string, path: string, body?: unknown) => stack.request(owner, method, path, body)
  const project = created(await call('POST', '/projects', { name: '다른 프로젝트', slug: `${slug}-${Date.now().toString(36)}` }))
  const invited = await call('POST', `/projects/${project.id}/members`, { email: member.email, role: 'owner' })
  if (invited.status >= 300) throw new Error(`픽스처 member ${invited.status} ${JSON.stringify(invited.body)}`)
  const menu = created(await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '메뉴' }))
  const pages: string[] = []
  for (const [title, content, nodeId] of [
    ['첫째', '첫째 원문', 'n_one0000001'],
    ['둘째', '둘째 원문', 'n_two0000001'],
  ] as const) {
    const made = created(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title }))
    const seeded = await call('PATCH', `/projects/${project.id}/pages/${made.id}/ops`, {
      baseSeq: 0,
      ops: [{ op: 'add', path: '/root/children/0', value: { id: nodeId, type: 'Text', props: { content } } }],
    })
    if (seeded.status >= 300) throw new Error(`픽스처 ops ${seeded.status}`)
    pages.push(made.id)
  }
  const snapshot = created(await call('POST', `/projects/${project.id}/snapshots`, { tag: 'b1' }))
  const third = created(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '셋째' }))
  return { projectId: project.id, snapshotId: snapshot.id, first: `/projects/${project.id}/pages/${pages[0]}`, third: third.id }
}

/** `원문`을 스냅샷 v1 에 얼리고 `바뀐 글`로 고친 페이지. `third`면 그 판을 v2 에 얼리고 `셋째 글`로 한 번 더 고친다. */
async function fixture(stack: EditorStack, owner: Session, slug: string, third = false): Promise<{ P: string; pageId: string; projectId: string }> {
  const call = (method: string, path: string, body?: unknown) => stack.request(owner, method, path, body)
  const project = created(await call('POST', '/projects', { name: '복원 차례', slug: `${slug}-${Date.now().toString(36)}` }))
  const menu = created(await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '메뉴' }))
  const target = created(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '페이지' }))
  const P = `/projects/${project.id}/pages/${target.id}`
  const seeded = await call('PATCH', `${P}/ops`, {
    baseSeq: 0,
    ops: [{ op: 'add', path: '/root/children/0', value: { id: 'n_text000001', type: 'Text', props: { content: '원문' } } }],
  })
  if (seeded.status >= 300) throw new Error(`픽스처 ops ${seeded.status}`)
  created(await call('POST', `/projects/${project.id}/snapshots`, { tag: 'v1' }))
  const changed = await call('PATCH', `${P}/ops`, {
    baseSeq: 1,
    ops: [{ op: 'replace', path: '/root/children/0/props/content', value: '바뀐 글' }],
  })
  if (changed.status >= 300) throw new Error(`픽스처 ops ${changed.status}`)
  if (third) {
    created(await call('POST', `/projects/${project.id}/snapshots`, { tag: 'v2' }))
    const again = await call('PATCH', `${P}/ops`, {
      baseSeq: 2,
      ops: [{ op: 'replace', path: '/root/children/0/props/content', value: '셋째 글' }],
    })
    if (again.status >= 300) throw new Error(`픽스처 ops ${again.status}`)
  }
  return { P, pageId: target.id, projectId: project.id }
}

/** 이 탭이 받은 것의 차례 — `joined` · `restored` 프레임, 복원 답, 페이지 조회. 줄 머리는 시작부터 ms 다. */
function watch(page: Page): { lines: string[]; at(): number } {
  const t0 = Date.now()
  const lines: string[] = []
  const at = (): number => Date.now() - t0
  page.on('websocket', (ws) => {
    ws.on('framereceived', (frame) => {
      const kind = /"type":"(joined|restored)"/.exec(String(frame.payload))?.[1]
      if (kind !== undefined) lines.push(`${at()} WS← ${kind}`)
    })
  })
  page.on('response', (response) => {
    if (response.url().includes('/restore')) lines.push(`${at()} 복원 답 ${response.status()}`)
  })
  page.on('request', (request) => {
    if (request.method() === 'GET' && /\/api\/projects\/[^/]+\/pages\/[^/?]+$/.test(request.url())) lines.push(`${at()} GET page`)
  })
  return { lines, at }
}

/** 꼬리가 `tail`인 첫 줄 · 끝 줄의 자리(없으면 -1) — 줄 머리의 ms 없이 견준다. */
function first(lines: string[], tail: string): number {
  return lines.findIndex((line) => line.endsWith(tail))
}

function last(lines: string[], tail: string): number {
  for (let index = lines.length - 1; index >= 0; index -= 1) if (lines[index]!.endsWith(tail)) return index
  return -1
}

async function restore(page: Page): Promise<void> {
  await page.getByRole('button', { name: '더 보기', exact: true }).click()
  await page.getByRole('menuitem', { name: '스냅샷' }).click()
  await page.getByRole('button', { name: '이 상태로 되돌리기' }).click()
  await page.getByRole('button', { name: '되돌린다' }).click()
}

/** 복원 배너(«다시 불러오기» 단추가 있는 머리 통지)가 DOM 에 선 횟수를 세기 시작한다. */
async function countBanners(page: Page): Promise<void> {
  await page.evaluate(() => {
    const box = window as unknown as { __restoreBanners: number }
    box.__restoreBanners = 0
    let present = false
    new MutationObserver(() => {
      const now = document.querySelector('.wb-shell-remote-alert .wb-shell-remote-reload') !== null
      if (now && !present) box.__restoreBanners += 1
      present = now
    }).observe(document.body, { childList: true, subtree: true, characterData: true })
  })
}

async function bannersSeen(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __restoreBanners: number }).__restoreBanners)
}

async function server(stack: EditorStack, session: Session, P: string): Promise<string> {
  const detail = await stack.request(session, 'GET', P)
  return String(detail.body?.schema?.root?.children?.[0]?.props?.content)
}

async function canvas(page: Page): Promise<string> {
  return await canvasText(page)
}

async function banner(page: Page): Promise<boolean> {
  return (await page.locator('.wb-shell-remote-alert', { hasText: '다시 불러오기' }).count()) > 0
}

function created(response: { status: number; body: any }): { id: string } {
  if (response.status !== 201) throw new Error(`픽스처 ${response.status} ${JSON.stringify(response.body)}`)
  return response.body
}
