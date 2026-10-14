/**
 * **모달 대화 상자와 하단 바를 실브라우저로 잰다** — `src/shell/shell-dialog.tsx`(`showModal` · 조합 중 Escape) · `src/shell/shell-footer.tsx`
 * (통지 줄). jsdom 은 `showModal` 이 없어 뒤 화면의 `inert` · 캔버스 iframe 의 누름 · 조합 상태 · 폭을 못 잰다(`test/shell/shell-dialog.test.tsx`
 * 는 스텁까지다).
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 모달이 열린 동안 캔버스 | 상자가 비모달로 선다 — 캔버스 iframe 의 노드를 누르면 선택이 바뀐다 · 키가 편집을 낸다 |
 * | 조합 중 Escape | 조합 구간을 안 든다 — Chrome 이 조합 중의 Escape 에도 `cancel` 을 내 상자가 닫히고 친 글이 사라진다 |
 * | 복원을 보내고 곧바로 닫음 | 상자가 내려가면 복원 답을 셸이 못 받는다 — 서버는 되돌렸는데 캔버스가 옛 글이다 |
 * | 창 1024 의 통지 셋 | 통지 칸이 읽을 폭을 못 받는다 · 캔버스가 320 아래로 준다 · 바가 창 밖이다 · 머리의 캔버스 도구가 덮인다 |
 * | 창 1024 의 통지 없음 | 바가 한 줄(40)보다 높다 · «컴포넌트»가 오른끝 여백에 안 닿는다 |
 */
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  canvasFrame,
  canvasText,
  editorStackPrerequisite,
  isRestoreUrl,
  poll,
  startEditorStack,
  type EditorStack,
  type Session,
} from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

describe.skipIf(!전제.ok)('모달 대화 상자 · 하단 바 — 실브라우저', () => {
  let stack: EditorStack
  let alice: Session

  beforeAll(async () => {
    if (!전제.ok) return
    stack = await startEditorStack(전제)
    alice = await stack.login(stack.users.alice)
  })

  afterAll(async () => {
    if (stack === undefined) return
    const { before, after } = await stack.close()
    expect(before.processes).toBeGreaterThan(0)
    expect(before.listeningPorts.length).toBeGreaterThanOrEqual(2)
    expect(before.databases).toBe(1)
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  })

  /**
   * 첫 노드를 고른 뒤 «스냅샷»을 연다. 둘째 노드의 자리를 실클릭하고(좌표 — 로케이터 클릭은 가림을 기다린다) 편집 단축키를 누른다. 모달이면 누름은
   * 배경막이 받고(`elementFromPoint` = 상자) 선택 · 편집이 그대로다. 판 카나리아: 누르기 전 속성 패널이 첫 노드의 글이다.
   */
  it('모달이 열린 동안 캔버스 iframe 을 눌러도 선택이 안 바뀌고, 키는 편집을 안 낸다', async () => {
    const { P } = await fixture(stack, alice, 'modal-canvas', 3)
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
    const patches: string[] = []
    page.on('websocket', (ws) =>
      ws.on('framesent', (frame) => {
        if (String(frame.payload).includes('"patch"')) patches.push(String(frame.payload))
      }),
    )
    try {
      await page.goto(P)
      await canvasFrame(page).locator('[data-wb-id="n_text0000001"]').click()
      const selected = () => page.locator('.wb-shell-panel textarea').first().inputValue()
      const before = await selected()
      await openDialog(page, '스냅샷')

      const second = (await canvasFrame(page).locator('[data-wb-id="n_text0000002"]').boundingBox())!
      const point = { x: second.x + 10, y: second.y + second.height / 2 }
      const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName ?? null, point)
      await page.mouse.click(point.x, point.y)
      await page.waitForTimeout(300)
      for (const key of ['Delete', 'Backspace', 'Control+z', 'Meta+z', 'Alt+ArrowUp', 'Alt+Shift+ArrowRight'])
        await page.keyboard.press(key)
      await page.waitForTimeout(300)

      expect(before.startsWith('글 1')).toBe(true)
      expect({ hit, 상자: await page.locator('dialog[open]').count(), 선택: (await selected()).slice(0, 3), 편집: patches.length }).toEqual(
        {
          hit: 'DIALOG',
          상자: 1,
          선택: '글 1',
          편집: 0,
        },
      )
    } finally {
      await context.close()
    }
  })

  /**
   * CDP 로 조합 상태를 세운다(`Input.imeSetComposition`). Chrome 은 조합 중의 Escape 를 `isComposing: true` 로 내고 **그래도 `cancel` 을 낸다** —
   * 판 카나리아로 그 둘이 이 판에서 났는지 센다. 조합을 끝낸 뒤의 Escape 는 닫는다(가드가 늘 막는 판이 아님을 가른다).
   */
  it('한글 조합 중의 Escape 는 상자를 안 닫고, 조합이 끝난 뒤의 Escape 는 닫는다', async () => {
    const { P } = await fixture(stack, alice, 'modal-ime', 1)
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
    try {
      await page.goto(P)
      await canvasFrame(page).locator('[data-wb-id]').first().waitFor()
      await openDialog(page, '스냅샷')
      const tag = page.locator('.wb-shell-snapshots-body input').first()
      await tag.click()
      await page.evaluate(() => {
        const seen: string[] = []
        ;(window as unknown as { __seen: string[] }).__seen = seen
        document.addEventListener('keydown', (event) => seen.push(`keydown ${event.key} ${event.isComposing}`), true)
        document.querySelector('dialog')!.addEventListener('cancel', () => seen.push('cancel'))
      })
      const cdp = await page.context().newCDPSession(page)
      await cdp.send('Input.imeSetComposition', { text: '한', selectionStart: 1, selectionEnd: 1 })
      await page.keyboard.press('Escape')
      await page.waitForTimeout(300)
      // 상자가 닫혔으면 칸도 없다 — 짧게 묻고 «없음»으로 적는다(30s 기다리지 않게).
      const during = {
        상자: await page.locator('dialog[open]').count(),
        글: await tag.inputValue({ timeout: 1_000 }).catch(() => '칸 없음'),
      }
      const seen = await page.evaluate(() => (window as unknown as { __seen: string[] }).__seen.slice())

      await cdp.send('Input.insertText', { text: '한' })
      await page.keyboard.press('Escape')
      const after = await poll(
        '조합 뒤 Escape 가 닫는다',
        () => page.locator('dialog[open]').count(),
        (count) => count === 0,
        3_000,
      ).catch(() => 1)

      expect(seen).toEqual(['keydown Escape true', 'cancel'])
      expect({ during, after }).toEqual({ during: { 상자: 1, 글: '한' }, after: 0 })
    } finally {
      await context.close()
    }
  })

  /**
   * 복원을 보내고 서버에 붙잡아(행 잠금 — 줄에 섰는지 센다) 그 사이 Escape 로 상자를 닫는다. 놓으면 답은 내려간 몸체가 쥔 셸의 콜백으로 온다 —
   * 캔버스가 서버 판(«원문»)이고 배너가 없다. main 의 팝오버를 닫은 판과 같은 값이다.
   */
  it('복원을 보내고 곧바로 상자를 닫아도 답을 셸이 받아 캔버스가 서버 판이다', async () => {
    const fx = await restoreFixture(stack, alice, 'modal-restore-close')
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
    const hold = await stack.holdRow('pages', fx.pageId)
    let released = false
    try {
      await page.goto(fx.P)
      await canvasFrame(page).locator('body', { hasText: '바뀐 글' }).waitFor()
      await openDialog(page, '스냅샷')
      await page.locator('li.wb-shell-snapshots-row', { hasText: 'v1' }).getByRole('button', { name: '이 상태로 되돌리기' }).click()
      await page.getByRole('button', { name: '되돌린다' }).click()
      await hold.waitForWaiters(1)
      await page.keyboard.press('Escape')
      const closed = await poll(
        '상자가 닫힌다',
        () => page.locator('dialog[open]').count(),
        (count) => count === 0,
        5_000,
      )
      const answered = page.waitForResponse((response) => isRestoreUrl(response.url()))
      await hold.release()
      released = true
      const status = (await answered).status()
      await canvasFrame(page)
        .locator('body', { hasText: '원문' })
        .waitFor({ timeout: 10_000 })
        .catch(() => undefined)
      await page.waitForTimeout(1_000)

      expect({ closed, status }).toEqual({ closed: 0, status: 200 })
      expect({ 캔버스: (await canvasText(page)).trim(), 배너: await page.locator('.wb-shell-remote-alert').count() }).toEqual({
        캔버스: '원문',
        배너: 0,
      })
    } finally {
      if (!released) await hold.release()
      await context.close()
    }
  })

  /**
   * 창 1024 · 사이드바 기본에서 통지 셋(테마 못 실음 · 남의 복원 · 권한 바뀜 — 모두 실제로 세운다)이 선다. 캔버스 칸의 폭은 444 다 — 하단 바의
   * 오른쪽 도구가 제 폭을 지키면 통지 칸이 남은 폭만 받아 한 줄이 한두 낱말이 되고 바가 자라 캔버스를 먹는다. 바가 접히면 통지가 칸 폭을 다
   * 쓴다(`src/shell.css`의 `.wb-shell-footer`). 권한이 viewer 로 내려가 하단 바에는 도구가 없다(«컴포넌트»는 editor 이상) — 캔버스 도구(뷰포트 ·
   * 줌)는 머리에 있다. 성질로 단언한다: 통지 한 줄의 폭 · 캔버스 몫(`CANVAS_MIN_WIDTH`와 같은 320) · 바가 창 안 · 머리의 캔버스 도구가 눌림 ·
   * 하단 바에 도구가 없음.
   */
  it('창 1024 에서 통지 셋이 서도 통지 칸이 읽을 폭이고, 캔버스가 320 이상 남고, 바가 창 안이다', async () => {
    const { P, projectId } = await fixture(stack, alice, 'footer-narrow', 3)
    const call = (method: string, path: string, body?: unknown) => stack.request(alice, method, path, body)
    const member = await call('POST', `/projects/${projectId}/members`, { email: stack.users.bob.email, role: 'editor' })
    if (member.status !== 201) throw new Error(`픽스처 member ${member.status}`)
    const snapshot = await call('POST', `/projects/${projectId}/snapshots`, { tag: 'narrow' })
    if (snapshot.status !== 201) throw new Error(`픽스처 snapshot ${snapshot.status}`)
    const { context, page } = await stack.openTab(stack.users.bob, { viewport: { width: 1024, height: 700 } })
    await page.route(`**/api/projects/${projectId}/theme`, (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: '테마 실패' }) }),
    )
    try {
      await page.goto(P)
      await canvasFrame(page).locator('[data-wb-id]').first().waitFor()
      const restored = await call('POST', `/projects/${projectId}/snapshots/${snapshot.body.id}/restore`)
      if (restored.status >= 300) throw new Error(`restore ${restored.status}`)
      const demoted = await call('PATCH', `/projects/${projectId}/members/${member.body.userId}`, { role: 'viewer' })
      if (demoted.status >= 300) throw new Error(`demote ${demoted.status}`)
      const footer = page.getByRole('contentinfo', { name: '하단 바' })
      await footer.getByText('스냅샷이 복원됐습니다', { exact: false }).waitFor()
      await footer.getByText('편집 권한이 없어져', { exact: false }).waitFor()
      await footer.locator('.wb-shell-theme-alert').waitFor()

      const seen = await page.evaluate(() => {
        const hitOk = (element: Element) => {
          const rect = element.getBoundingClientRect()
          const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
          return hit !== null && (hit === element || element.contains(hit))
        }
        const bar = document.querySelector('.wb-shell-footer')!.getBoundingClientRect()
        // L-141 — 이 선택자는 페이지 JSON 통지(가져온 결과 · 내보내기 실패)를 못 센다: 그 통지는 `role` 이 없는 줄 상자(`.wb-shell-pagejson-notice-row`) 안에 `role` 을 둔다(`panels/page-json-notices.tsx`). 이 판에는 그 통지가 안 서 수는 안 바뀐다 — 그 통지를 싣는 판은 이 선택자로 세지 않는다.
        const notices = [...document.querySelectorAll('.wb-shell-footer-notices > [role]')]
        return {
          count: notices.length,
          narrowest: Math.min(...notices.map((notice) => Math.round(notice.getBoundingClientRect().width))),
          canvas: Math.round(document.querySelector('.wb-shell-canvas')!.getBoundingClientRect().height),
          barInWindow: bar.bottom <= innerHeight,
          tools: [...document.querySelectorAll('.wb-shell-header select, .wb-shell-header .wb-shell-zoom button')].map(hitOk),
          footerTools: document.querySelectorAll('.wb-shell-footer-tools select, .wb-shell-footer-tools button').length,
        }
      })
      // eslint-disable-next-line no-console
      console.log(`[창 1024 통지 셋] ${JSON.stringify(seen)}`)

      expect(seen.count).toBe(3)
      expect({
        통지_폭: seen.narrowest >= 240,
        캔버스: seen.canvas >= 320,
        바_창_안: seen.barInWindow,
        도구: seen.tools,
        하단_도구: seen.footerTools,
      }).toEqual({ 통지_폭: true, 캔버스: true, 바_창_안: true, 도구: [true, true, true, true], 하단_도구: 0 })
    } finally {
      await context.close()
    }
  })

  /**
   * 창 1024 · 통지 없음. 통지 무리의 기본 폭(320)은 통지가 있을 때의 것이다 — 빈 무리가 그 폭을 쥐면 도구가 높이 0 인 빈 첫 줄 아래(줄 간격 6)로
   * 내려갈 수 있다. 바가 한 줄 높이(셸 CSS 의 최소 높이 40)이고 «컴포넌트»의 오른끝이 바의 안쪽 여백(12)에 닿는지로 잰다. 남은 도구가
   * «컴포넌트» 하나(26 높이 · 폭 100 남짓)라 빈 무리가 320 을 쥐어도 칸 444 에 들어간다 — 이 케이스가 지금 잡는 것은 한 줄 높이와 오른끝이다.
   * 판 카나리아: 통지가 0 이다.
   */
  it('창 1024 에서 통지가 없으면 하단 바는 «컴포넌트» 한 줄이다', async () => {
    const { P } = await fixture(stack, alice, 'footer-empty', 1)
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1024, height: 700 } })
    try {
      await page.goto(P)
      await canvasFrame(page).locator('[data-wb-id]').first().waitFor()
      const seen = await page.evaluate(() => {
        const bar = document.querySelector('.wb-shell-footer')!.getBoundingClientRect()
        const tools = document.querySelector('.wb-shell-footer-tools')!.getBoundingClientRect()
        return {
          count: document.querySelectorAll('.wb-shell-footer-notices > [role]').length,
          bar: Math.round(bar.height),
          tools: Math.round(tools.height),
          toolsRightGap: Math.round(bar.right - tools.right),
        }
      })
      // eslint-disable-next-line no-console
      console.log(`[창 1024 통지 없음] ${JSON.stringify(seen)}`)

      expect(seen.count).toBe(0)
      expect({ 바_높이: seen.bar, 도구_오른끝: seen.toolsRightGap }).toEqual({ 바_높이: 40, 도구_오른끝: 12 })
    } finally {
      await context.close()
    }
  })
})

async function openDialog(page: Page, item: string): Promise<void> {
  await page.getByRole('button', { name: '더 보기', exact: true }).click()
  await page.getByRole('menuitem', { name: item }).click()
  await page.locator('dialog[open]').waitFor()
}

async function fixture(stack: EditorStack, owner: Session, slug: string, count: number): Promise<{ P: string; projectId: string }> {
  const call = (method: string, path: string, body?: unknown) => stack.request(owner, method, path, body)
  const project = created(await call('POST', '/projects', { name: 'C1 모달', slug: `${slug}-${Date.now().toString(36)}` }))
  const menu = created(await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '메뉴' }))
  const target = created(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '첫째' }))
  const P = `/projects/${project.id}/pages/${target.id}`
  const ops = Array.from({ length: count }, (_, index) => ({
    op: 'add',
    path: `/root/children/${index}`,
    value: { id: `n_text${String(index + 1).padStart(7, '0')}`, type: 'Text', props: { content: `글 ${index + 1} — 캔버스를 채운다` } },
  }))
  const seeded = await call('PATCH', `${P}/ops`, { baseSeq: 0, ops })
  if (seeded.status >= 300) throw new Error(`픽스처 ops ${seeded.status} ${JSON.stringify(seeded.body)}`)
  return { P, projectId: project.id }
}

/** `원문`을 스냅샷 v1 에 얼리고 `바뀐 글`로 고친 페이지. */
async function restoreFixture(stack: EditorStack, owner: Session, slug: string): Promise<{ P: string; pageId: string }> {
  const call = (method: string, path: string, body?: unknown) => stack.request(owner, method, path, body)
  const project = created(await call('POST', '/projects', { name: 'C1 모달 복원', slug: `${slug}-${Date.now().toString(36)}` }))
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
  return { P, pageId: target.id }
}

function created(response: { status: number; body: any }): { id: string } {
  if (response.status !== 201) throw new Error(`픽스처 ${response.status} ${JSON.stringify(response.body)}`)
  return response.body
}
