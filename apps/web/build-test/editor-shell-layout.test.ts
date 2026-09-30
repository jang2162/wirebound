/**
 * **에디터 셸의 가로 배치를 실브라우저로 잰다** — 우측 패널 폭 · 두 폭의 예산 · 하단 바 · 화면 맞춤(`src/shell/sidebar-layout.ts` 머리말
 * «두 폭은 한 예산을 나눠 쓴다» · `src/routes/editor.tsx`의 `fitZoom` · `src/shell/shell-footer.tsx`). jsdom 은 레이아웃이 없어 폭 · 넘침 ·
 * 가림을 못 잰다(`test/routes/sidebar-resizer.test.tsx`는 인라인 값까지다).
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 우측 손잡이 | 왼쪽으로 끌어도 · `ArrowLeft`로도 안 넓어진다 · 두 번 눌러 300 이 아니다 · 새로고침 뒤 폭을 잃는다 |
 * | 창을 줄이면 | 캔버스가 320 아래 · 셸에 가로 넘침 · 우측보다 좌측을 먼저 조인다 · 저장값을 되쓴다 |
 * | 하단 바의 통지 둘 | 한쪽이 가려진다 · 캔버스가 안 준다(바가 안 자란다) |
 * | 화면 맞춤 | 맞춘 뒤 캔버스에 가로 넘침이 있다(줌 하한 25% 에 막힌 칸은 보이는 프레임이 넘친 만큼만) · 좌측 최대에서 «화면 맞춤»이 가려진다 |
 * | 머리가 한 줄 | 창 1024 에서 머리가 두 줄이다(편집 · 뷰). 한 줄에 드는 최소 창 폭을 로그로 낸다 — `src/shell.css` «머리가 한 줄에 들어가는 폭» 표의 다시 재는 길 |
 */
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canvasFrame, editorStackPrerequisite, poll, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

const LAYOUT_KEY = 'wirebound.editor.sidebar'

describe.skipIf(!전제.ok)('에디터 셸 가로 배치 — 실브라우저', () => {
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

  it('우측 손잡이 — 왼쪽으로 끌면 · ArrowLeft 로 넓어지고, 두 번 누르면 300, 새로고침 뒤에도 그 폭이다', async () => {
    const { P } = await fixture(stack, alice, 'panel', 3)
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
    try {
      await page.goto(P)
      await canvasFrame(page).locator('[data-wb-id]').first().waitFor()
      const handle = page.getByRole('separator', { name: '우측 패널 폭' })
      const box = (await handle.boundingBox())!
      await page.mouse.move(box.x + box.width / 2, box.y + 200)
      await page.mouse.down()
      await page.mouse.move(box.x + box.width / 2 - 60, box.y + 200, { steps: 4 })
      await page.mouse.up()
      const dragged = await panelWidth(page)

      await handle.focus()
      await page.keyboard.press('ArrowLeft')
      const arrowed = await panelWidth(page)

      await handle.dblclick()
      const reset = await panelWidth(page)

      await handle.focus()
      for (let i = 0; i < 5; i += 1) await page.keyboard.press('ArrowLeft')
      const kept = await panelWidth(page)
      await page.reload()
      await canvasFrame(page).locator('[data-wb-id]').first().waitFor()
      const reloaded = await panelWidth(page)

      expect({ dragged, arrowed, reset, kept, reloaded }).toEqual({ dragged: 360, arrowed: 376, reset: 300, kept: 380, reloaded: 380 })
    } finally {
      await context.close()
    }
  })

  /**
   * 좌 400 · 우 500 을 1440 창에 두고 1024 로 줄인다 — 예산 688(1024 − 손잡이 둘 · 여백 넷 16 − 캔버스 320)에 212 넘친다. 우측이 먼저
   * 최소(300)까지 200 줄고, 남은 12 를 좌측이 줄어 388. 저장값은 그대로다 — 창을 되돌리면 두 폭이 돌아온다.
   */
  it('두 폭을 넓힌 채 창을 1024 로 줄이면 우측 먼저 조이고 캔버스는 320 · 가로 넘침 0 — 되돌리면 두 폭이 돌아온다', async () => {
    const { P } = await fixture(stack, alice, 'shrink', 3)
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
    try {
      await page.goto(P)
      await page.evaluate((key) => localStorage.setItem(key, JSON.stringify({ sideWidth: 400, panelWidth: 500 })), LAYOUT_KEY)
      await page.reload()
      await canvasFrame(page).locator('[data-wb-id]').first().waitFor()
      const wide = await widths(page)

      await page.setViewportSize({ width: 1024, height: 768 })
      const narrow = await poll('두 폭이 조여진다', () => widths(page), (value) => value.panel === 300)

      await page.setViewportSize({ width: 1440, height: 900 })
      const back = await poll('두 폭이 돌아온다', () => widths(page), (value) => value.panel === 500)
      const stored = await page.evaluate((key) => localStorage.getItem(key), LAYOUT_KEY)

      expect({ wide, narrow, back, stored: JSON.parse(stored ?? '{}') }).toEqual({
        wide: { side: 400, panel: 500, canvas: 1440 - 16 - 400 - 500, shellOverflow: 0 },
        narrow: { side: 388, panel: 300, canvas: 320, shellOverflow: 0 },
        back: { side: 400, panel: 500, canvas: 1440 - 16 - 400 - 500, shellOverflow: 0 },
        stored: { sideWidth: 400, panelWidth: 500 },
      })
    } finally {
      await context.close()
    }
  })

  /**
   * 통지 둘이 함께 선다 — 남의 복원(`RemoteAlert`)과 권한 바뀜(owner 가 밥을 viewer 로 내림). 둘 다 **보여야** 한다: 각 통지의 첫 줄 가운데를
   * `elementFromPoint`가 그 통지 안에서 맞히고 하단 바가 창 안이다. 바가 위로 자라 캔버스가 그만큼 준다.
   */
  it('하단 바에 통지 둘이 함께 서면 둘 다 보이고 캔버스가 준다', async () => {
    const { P, projectId } = await fixture(stack, alice, 'notices', 3)
    const call = (method: string, path: string, body?: unknown) => stack.request(alice, method, path, body)
    const member = await call('POST', `/projects/${projectId}/members`, { email: stack.users.bob.email, role: 'editor' })
    if (member.status !== 201) throw new Error(`픽스처 member ${member.status} ${JSON.stringify(member.body)}`)
    const snapshot = await call('POST', `/projects/${projectId}/snapshots`, { tag: 'foot' })
    if (snapshot.status !== 201) throw new Error(`픽스처 snapshot ${snapshot.status}`)

    const { context, page } = await stack.openTab(stack.users.bob, { viewport: { width: 1440, height: 900 } })
    try {
      await page.goto(P)
      await canvasFrame(page).locator('[data-wb-id]').first().waitFor()
      const canvasBefore = await page.locator('.wb-shell-canvas').evaluate((el) => el.getBoundingClientRect().height)

      const restored = await call('POST', `/projects/${projectId}/snapshots/${snapshot.body.id}/restore`)
      if (restored.status >= 300) throw new Error(`restore ${restored.status}`)
      const demoted = await call('PATCH', `/projects/${projectId}/members/${member.body.userId}`, { role: 'viewer' })
      if (demoted.status >= 300) throw new Error(`demote ${demoted.status}`)

      const footer = page.getByRole('contentinfo', { name: '하단 바' })
      await footer.getByText('스냅샷이 복원됐습니다', { exact: false }).waitFor()
      await footer.getByText('편집 권한이 없어져', { exact: false }).waitFor()
      const seen = await page.evaluate(() => {
        const bar = document.querySelector('.wb-shell-footer')!
        const barRect = bar.getBoundingClientRect()
        const notices = [...bar.querySelectorAll('[role="status"], [role="alert"]')]
        return {
          count: notices.length,
          visible: notices.map((notice) => {
            const range = document.createRange()
            range.selectNodeContents(notice)
            const line = range.getClientRects()[0]!
            const hit = document.elementFromPoint(line.left + Math.min(20, line.width / 2), line.top + line.height / 2)
            return hit !== null && notice.contains(hit)
          }),
          barInWindow: barRect.top >= 0 && barRect.bottom <= window.innerHeight,
          canvasAfter: document.querySelector('.wb-shell-canvas')!.getBoundingClientRect().height,
        }
      })

      expect({ count: seen.count, visible: seen.visible, barInWindow: seen.barInWindow, canvasShrank: seen.canvasAfter < canvasBefore }).toEqual({
        count: 2,
        visible: [true, true],
        barInWindow: true,
        canvasShrank: true,
      })
    } finally {
      await context.close()
    }
  })

  /**
   * **화면 맞춤 뒤 가로 넘침**(`fitZoom` 머리말 «가운데 정렬은 보이는 폭으로 한다»). 창 1440 · 1280 × 좌측 기본 · 최대 × 프리셋 여섯. 넘침은
   * 보이는 프레임이 칸을 넘은 만큼뿐이어야 한다 — 맞춘 줌이 하한(25%)에 막히지 않은 칸은 0, 막힌 칸(좌측 최대 × 넓은 프리셋)은 프레임이 정말
   * 넘친 만큼. «화면 맞춤»은 **실제 클릭**으로 누른다 — 좌측 최대에서 하단 바 도구가 우측 패널 밑으로 들어가면 여기서 죽는다.
   */
  it('화면 맞춤 뒤 캔버스의 가로 넘침은 보이는 프레임이 넘친 만큼뿐이다 — 막히지 않은 칸은 0', async () => {
    const { P } = await fixture(stack, alice, 'fit', 40)
    const cells: string[] = []
    const phantom: string[] = []
    for (const window of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
      for (const side of ['기본', '최대'] as const) {
        const { context, page } = await stack.openTab(stack.users.alice, { viewport: window })
        try {
          await page.goto(P)
          if (side === '최대') {
            await page.evaluate((key) => localStorage.setItem(key, JSON.stringify({ sideWidth: 5000 })), LAYOUT_KEY)
            await page.reload()
          }
          await canvasFrame(page).locator('[data-wb-id="n_text0000040"]').waitFor()
          for (const preset of [1920, 1440, 1280, 1024, 768, 375]) {
            await page.getByLabel('뷰포트 폭').selectOption(String(preset))
            await page.getByRole('button', { name: '화면 맞춤' }).click({ timeout: 3_000 })
            const m = await poll(
              '맞춘 줌이 무대에 실린다',
              () =>
                page.evaluate(() => {
                  const canvas = document.querySelector('.wb-shell-canvas') as HTMLElement
                  const frame = document.querySelector('.wb-shell-canvas-frame') as HTMLElement
                  const stage = document.querySelector('.wb-shell-canvas-stage') as HTMLElement
                  const right = frame.getBoundingClientRect().right - canvas.getBoundingClientRect().left
                  const scale = Number(/scale\(([\d.]+)\)/.exec(frame.style.transform)?.[1] ?? 'NaN')
                  return {
                    // 판 — 프레임에 실린 배율이 지금 프리셋의 것이다(고른 프리셋 × 배율 = 프레임의 보이는 폭).
                    settled: Math.abs(frame.getBoundingClientRect().width - Number(frame.style.width.replace('px', '')) * scale) < 1,
                    over: canvas.scrollWidth - canvas.clientWidth,
                    // 프레임이 칸의 안쪽 여백(24)까지 넘은 만큼 — 보이는 넘침.
                    visualOver: Math.max(0, Math.ceil(right + 24 - canvas.clientWidth)),
                    stageWidth: parseFloat(stage.style.width),
                    frameWidth: frame.getBoundingClientRect().width,
                    zoom: document.querySelector('.wb-shell-zoom-value')?.textContent ?? '',
                  }
                }),
              (value) => value.settled,
            )
            cells.push(`${window.width}·${side}·${preset} ${m.zoom} over ${m.over} visual ${m.visualOver}`)
            if (m.over !== m.visualOver) phantom.push(`${window.width}·${side}·${preset}: over ${m.over} ≠ visual ${m.visualOver}`)
          }
        } finally {
          await context.close()
        }
      }
    }
    // 판 카나리아 — 24 칸을 다 쟀고, 막히지 않은 칸(좌측 기본)은 넘침이 0 이다.
    expect(cells).toHaveLength(24)
    expect(cells.filter((cell) => cell.includes('·기본·') && !cell.endsWith('over 0 visual 0'))).toEqual([])
    expect(phantom).toEqual([])
  }, 180_000)

  /**
   * **머리가 한 줄에 드는 최소 창 폭**(편집 · 뷰) — 창 폭을 이분 탐색해 머리 높이가 2400 창의 높이와 같은 가장 좁은 폭을 찾는다. 단언은 느슨하다
   * (데스크톱 하한 1024 에서 한 줄) — 글꼴이 기계마다 달라 정확한 수는 로그의 값이다(`src/shell.css`의 그 표).
   */
  it('머리는 창 1024 에서 한 줄이다 — 한 줄에 드는 최소 창 폭을 로그로 낸다', async () => {
    // 표(`src/shell.css`)가 잰 이름 — 이름의 길이가 왼쪽 조각의 폭을 정한다.
    const { P } = await fixture(stack, alice, 'head', 1, '관리자 콘솔 설계서')
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 2400, height: 900 } })
    try {
      await page.goto(P)
      await canvasFrame(page).locator('[data-wb-id]').first().waitFor()
      const height = () => page.locator('.wb-shell-header').evaluate((el) => el.getBoundingClientRect().height)
      const least: Record<string, number> = {}
      for (const mode of ['편집 모드', '뷰 모드'] as const) {
        await page.setViewportSize({ width: 2400, height: 900 })
        await page.getByRole('button', { name: mode }).click()
        const one = await height()
        let narrow = 300
        let wide = 2400
        while (wide - narrow > 1) {
          const mid = Math.floor((narrow + wide) / 2)
          await page.setViewportSize({ width: mid, height: 900 })
          if ((await height()) <= one) wide = mid
          else narrow = mid
        }
        least[mode] = wide
      }
      // eslint-disable-next-line no-console
      console.log(`[머리 한 줄 최소 창 폭] ${JSON.stringify(least)}`)
      expect({ 편집: least['편집 모드']! <= 1024, 뷰: least['뷰 모드']! <= 1024 }).toEqual({ 편집: true, 뷰: true })
    } finally {
      await context.close()
    }
  })
})

async function panelWidth(page: Page): Promise<number> {
  return page.locator('.wb-shell-panel').evaluate((el) => Math.round(el.getBoundingClientRect().width))
}

async function widths(page: Page): Promise<{ side: number; panel: number; canvas: number; shellOverflow: number }> {
  return page.evaluate(() => {
    const width = (selector: string) => Math.round(document.querySelector(selector)!.getBoundingClientRect().width)
    const shell = document.querySelector('.wb-shell') as HTMLElement
    return {
      side: width('.wb-shell-side'),
      panel: width('.wb-shell-panel'),
      canvas: width('.wb-shell-canvas'),
      shellOverflow: shell.scrollWidth - shell.clientWidth,
    }
  })
}

async function fixture(
  stack: EditorStack,
  owner: Session,
  slug: string,
  count: number,
  name = 'C1 배치',
): Promise<{ P: string; projectId: string }> {
  const call = (m: string, p: string, b?: unknown) => stack.request(owner, m, p, b)
  const project = (await call('POST', '/projects', { name, slug: `${slug}-${Date.now().toString(36)}` })).body
  const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '메뉴' })).body
  const page = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '첫째' })).body
  const P = `/projects/${project.id}/pages/${page.id}`
  const ops = Array.from({ length: count }, (_, index) => ({
    op: 'add',
    path: `/root/children/${index}`,
    value: { id: `n_text${String(index + 1).padStart(7, '0')}`, type: 'Text', props: { content: `글 ${index + 1} — 캔버스를 세로로 채운다` } },
  }))
  const seeded = await call('PATCH', `${P}/ops`, { baseSeq: 0, ops })
  if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
  return { P, projectId: project.id }
}
