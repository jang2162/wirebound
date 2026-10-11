/**
 * **캔버스 문서가 iframe 에 들어간 뒤에도 셸의 호스트 리스너가 캔버스 위의 조작을 받는가**(`src/canvas/canvas-iframe.tsx`).
 * iframe 안의 `mousedown` · `keydown` · `pointermove` · `pointerup` 은 호스트 `document` · `window` 로 올라가지 않는다 — 문서가
 * 호스트에 그려지던 판(portal 이전)에서는 올라갔다. 호스트에 리스너를 거는 자리는 `src/shell/use-popover-dismiss.ts`(머리의 `…` 메뉴 —
 * `src/shell/action-menu.tsx`)와 `src/shell/shell-resizer.tsx`(손잡이 셋 — 좌측 폭 · 좌측 배분 · 우측 폭, 캔버스 위를 지나는 것은 폭 손잡이)다.
 *
 * 문서 노드는 iframe 이 있으면 그 안에서, 없으면 호스트에서 찾는다 — 같은 파일을 iframe 이전 판에 끼워 «원래는 됐다» 를 잰다.
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | `…` 메뉴를 연 채 캔버스를 누르면 닫힌다 | 캔버스의 `mousedown` 이 호스트 `document` 에 안 닿는다 |
 * | 초점이 캔버스 안에 있어도 Escape 가 `…` 메뉴를 닫는다 | 캔버스의 `keydown` 이 호스트 `document` 에 안 닿는다 |
 * | 폭 손잡이를 캔버스 위로 끌어도 따라오고, 캔버스 위에서 놓으면 끝난다 | 캔버스 위의 `pointermove` · `pointerup` 이 호스트 `window` 에 안 닿는다 |
 * | 빈 자리 클릭 — 편집은 선택을 풀고 뷰는 알림만 걷는다 | iframe 의 `body` · `html` 을 누른 클릭이 캔버스에 안 닿는다(`onBackgroundClick`) |
 */
import type { Locator, Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { editorStackPrerequisite, poll, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

const IFRAME = 'iframe.wb-shell-canvas-iframe'

describe.skipIf(!전제.ok)('캔버스 iframe — 호스트 리스너가 캔버스 위의 조작을 받는다', () => {
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

  // 머리의 떠 있는 목록은 `…` 메뉴 하나다 — 스냅샷 · 내보내기는 대화 상자라 바깥 누름으로 닫지 않는다(`src/shell/shell-dialog.tsx`).
  for (const [name, toggle, body] of [['`…` 메뉴', '.wb-shell-action-menu-toggle', '.wb-shell-action-menu-body']] as const) {
    it(`${name}를 연 채 캔버스의 노드를 누르면 닫힌다`, async () => {
      const P = await fixture(stack, alice, `pop-click-${toggle.length}`)
      await withTab(stack, async (page) => {
        await page.goto(P)
        await (await docNode(page, 'n_text0000002')).waitFor()
        await page.click(toggle)
        const opened = await page.locator(body).count()
        await clickClearOfPopover(await docNode(page, 'n_text0000002'))
        const closed = await settle(
          () => page.locator(body).count(),
          (count) => count === 0,
        )
        expect({ opened, afterCanvasClick: closed }).toEqual({ opened: 1, afterCanvasClick: 0 })
      })
    })

    it(`${name} — 초점이 캔버스 안의 요소에 있어도 Escape 가 닫는다`, async () => {
      const P = await fixture(stack, alice, `pop-esc-${toggle.length}`)
      await withTab(stack, async (page) => {
        await page.goto(P)
        const button = await docNode(page, 'n_button00001')
        await button.waitFor()
        await page.click(toggle)
        const opened = await page.locator(body).count()
        // 누르지 않고 초점만 옮긴다 — 누름(`mousedown`)이 닫는 갈래와 떼어 키 하나만 잰다. 키보드 사용자가 Tab 으로 캔버스의 단추에 든 판.
        await button.focus()
        const focusedInCanvas = await button.evaluate((el) => el.ownerDocument.activeElement === el)
        await page.keyboard.press('Escape')
        const closed = await settle(
          () => page.locator(body).count(),
          (count) => count === 0,
        )
        expect({ opened, focusedInCanvas, afterEscape: closed }).toEqual({ opened: 1, focusedInCanvas: true, afterEscape: 0 })
      })
    })
  }

  /**
   * **iframe 이 갈려도 새 문서에서 닫힌다.** 페이지를 옮기면 캔버스가 내려갔다 올라와 iframe 이 새로 선다. `…` 메뉴를 연 채 옮기면
   * 옛 iframe 문서에 건 리스너는 쓸모가 없고 새 문서에 걸려야 한다 — 문서를 한 번만 읽어 두는 구현은 여기서 죽는다.
   * 판 카나리아: 연 뒤 iframe 에 표시를 달고, 옮긴 뒤 그 표시가 없는(새로 선) iframe 인지 본다.
   */
  it('`…` 메뉴를 연 채 페이지를 옮겨 iframe 이 새로 서도, 캔버스를 누르면 닫힌다', async () => {
    const { P1, secondTitle } = await twoPages(stack, alice, 'pop-swap')
    await withTab(stack, async (page) => {
      await page.goto(P1)
      await page.getByRole('link', { name: secondTitle }).click()
      await (await docNode(page, 'n_second00001')).waitFor()
      await page.click('.wb-shell-action-menu-toggle')
      const opened = await page.locator('.wb-shell-action-menu-body').count()
      await page.locator(IFRAME).evaluate((el) => el.setAttribute('data-probe-old', ''))
      await page.goBack()
      await (await docNode(page, 'n_text0000002')).waitFor()
      const swapped = await settle(
        async () => ({ iframes: await page.locator(IFRAME).count(), old: await page.locator(`${IFRAME}[data-probe-old]`).count() }),
        (value) => value.iframes === 1 && value.old === 0,
      )
      const stillOpen = await page.locator('.wb-shell-action-menu-body').count()
      await clickClearOfPopover(await docNode(page, 'n_text0000002'))
      const closed = await settle(
        () => page.locator('.wb-shell-action-menu-body').count(),
        (count) => count === 0,
      )
      expect({ opened, swapped, stillOpen, afterCanvasClick: closed }).toEqual({
        opened: 1,
        swapped: { iframes: 1, old: 0 },
        stillOpen: 1,
        afterCanvasClick: 0,
      })
    })
  })

  it('사이드바 폭 손잡이를 캔버스 위로 끌어도 폭이 따라오고, 캔버스 위에서 놓으면 드래그가 끝난다', async () => {
    const P = await fixture(stack, alice, 'resize')
    await withTab(stack, async (page) => {
      await page.goto(P)
      await (await docNode(page, 'n_text0000002')).waitFor()
      const handle = page.locator('.wb-shell-side-resizer')
      const width = async () => Number(await handle.getAttribute('aria-valuenow'))
      const box = await handle.boundingBox()
      if (box === null) throw new Error('손잡이 상자를 못 쟀다')
      const x = box.x + box.width / 2
      const y = box.y + 300
      const start = await width()

      await page.mouse.move(x, y)
      await page.mouse.down()
      // 사람이 빨리 끄는 판 — 한 이벤트에 50px 씩. 손잡이와 캔버스 사이 여백(24px)을 넘으면 포인터가 손잡이를 앞질러 캔버스 위에 선다.
      await page.mouse.move(x + 150, y, { steps: 3 })
      const underPointer = await page.evaluate(([px, py]) => document.elementFromPoint(px!, py!)?.className ?? null, [x + 150, y])
      const dragged = await settle(width, (value) => value === start + 150)
      await page.mouse.up()
      // 놓은 뒤의 움직임은 폭을 바꾸지 않는다 — `pointerup` 을 못 받았으면 드래그가 붙은 채 남아 손잡이 쪽으로 돌아오는 포인터가 폭을 끈다.
      await page.mouse.move(x - 60, y, { steps: 3 })
      const afterRelease = await settle(width, (value) => value !== dragged, 500)
      expect({ start, dragged, afterRelease }, `놓은 자리: ${underPointer}`).toEqual({
        start,
        dragged: start + 150,
        afterRelease: start + 150,
      })
    })
  })

  it('빈 자리 클릭 — 편집 모드는 선택을 풀고, 뷰 모드는 알림만 걷고 선택은 그대로다', async () => {
    const P = await fixture(stack, alice, 'empty', [{ on: 'click', actions: [{ type: 'navigate', target: 'page:어딘가' }] }])
    await withTab(stack, async (page) => {
      await page.goto(P)
      const text = await docNode(page, 'n_text0000001')
      await text.waitFor()
      const outlineId = () =>
        page
          .locator('.wb-shell-selection')
          .getAttribute('data-wb-selected-id', { timeout: 500 })
          .catch(() => null)
      const notices = () => page.locator('.wb-shell-canvas-runtime').count()
      const frameBox = await page.locator('.wb-shell-canvas-frame').boundingBox()
      if (frameBox === null) throw new Error('프레임 상자를 못 쟀다')
      // 문서(3 노드)는 최소 높이(320px)보다 짧다 — 프레임 아래끝 바로 위는 노드가 아닌 빈 자리다.
      const empty = { x: frameBox.x + frameBox.width / 2, y: frameBox.y + frameBox.height - 12 }

      await text.click()
      const selected = await settle(outlineId, (id) => id !== null)
      await page.mouse.click(empty.x, empty.y)
      const afterEmpty = await settle(outlineId, (id) => id === null)

      await text.click()
      await settle(outlineId, (id) => id !== null)
      await page.getByRole('button', { name: '뷰 모드' }).click()
      await (await docNode(page, 'n_button00001')).click()
      const noticeShown = await settle(notices, (count) => count > 0)
      await page.mouse.click(empty.x, empty.y)
      const noticeAfterEmpty = await settle(notices, (count) => count === 0)
      await page.getByRole('button', { name: '편집 모드' }).click()
      const selectedAfterView = await settle(outlineId, (id) => id !== null)

      expect({ selected, afterEmpty, noticeShown, noticeAfterEmpty, selectedAfterView }).toEqual({
        selected: 'n_text0000001',
        afterEmpty: null,
        noticeShown: 1,
        noticeAfterEmpty: 0,
        selectedAfterView: 'n_text0000001',
      })
    })
  })
})

async function withTab(stack: EditorStack, run: (page: Page) => Promise<void>): Promise<void> {
  const { context, page } = await stack.openTab(stack.users.alice)
  try {
    await run(page)
  } finally {
    await context.close()
  }
}

/**
 * **떠 있는 목록이 안 덮는 자리를 누른다** — 노드의 왼끝에서 20px. `…` 메뉴는 머리 오른쪽에 붙어 아래로 자란다(`.wb-shell-action-menu-body`의
 * `right: 0`). 노드의 가운데를 누르면 누름이 목록 안에 떨어져 «안쪽을 눌렀다»로 안 닫힐 수 있다 — 재려던 리스너와 무관하게 빨갛다.
 */
async function clickClearOfPopover(node: Locator): Promise<void> {
  const box = await node.boundingBox()
  if (box === null) throw new Error('노드 상자를 못 쟀다')
  await node.click({ position: { x: 20, y: box.height / 2 } })
}

/**
 * 문서 노드 — iframe 안에 있으면 그 안에서, 호스트에 있으면(iframe 이전 판) 호스트에서. **노드가 선 쪽을 한 번의 읽기로 고른다** —
 * «iframe 이 있나» 를 따로 다시 읽으면 페이지를 옮기는 사이(옛 iframe 이 내려가고 새것이 아직 없다) 0 을 읽어 호스트를 골라, 호스트에는
 * 영영 안 서는 노드를 30s 기다렸다(«페이지를 옮겨 iframe 이 새로 서도» 의 흔들림 — 죽은 locator 가 `frameLocator` 없는 꼴이었다).
 */
async function docNode(page: Page, id: string): Promise<Locator> {
  const selector = `[data-wb-id="${id}"]`
  const inFrame = page.frameLocator(IFRAME).locator(selector)
  const inHost = page.locator(selector)
  const where = await poll(
    '캔버스 문서가 선다',
    async () => {
      try {
        return (await inFrame.count()) > 0 ? 'frame' : (await inHost.count()) > 0 ? 'host' : null
      } catch {
        return null // 옛 · 새 iframe 이 잠깐 둘이면 `frameLocator` 가 엄격 모드로 던진다 — 다음 읽기에 가른다.
      }
    },
    (found) => found !== null,
  )
  return where === 'frame' ? inFrame : inHost
}

/** 조건이 설 때까지(기본 3s) 읽고 **마지막 값을 돌려준다** — 서지 않아도 던지지 않아, 케이스가 타임아웃이 아니라 값으로 죽는다. */
async function settle<T>(read: () => Promise<T>, done: (value: T) => boolean, timeoutMs = 3_000): Promise<T> {
  const deadline = Date.now() + timeoutMs
  let value = await read()
  while (!done(value) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50))
    value = await read()
  }
  return value
}

/** `Page > [Button, Text × 2]` 페이지 하나. `buttonRules` 를 주면 Button 에 상호작용 규칙을 단다. */
async function fixture(stack: EditorStack, owner: Session, slug: string, buttonRules?: unknown[]): Promise<string> {
  const call = (m: string, p: string, b?: unknown) => stack.request(owner, m, p, b)
  const project = (await call('POST', '/projects', { name: 'A1a', slug: `${slug}-${Date.now().toString(36)}` })).body
  const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '메뉴' })).body
  const page = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '첫째' })).body
  const P = `/projects/${project.id}/pages/${page.id}`
  const button = { id: 'n_button00001', type: 'Button', props: { label: '버튼' }, ...(buttonRules ? { interactions: buttonRules } : {}) }
  const texts = [1, 2].map((n) => ({ id: `n_text000000${n}`, type: 'Text', props: { content: `글 ${n}` } }))
  const ops = [button, ...texts].map((value, index) => ({ op: 'add', path: `/root/children/${index}`, value }))
  const seeded = await call('PATCH', `${P}/ops`, { baseSeq: 0, ops })
  if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
  return P
}

/** 페이지 둘 — 첫째는 `fixture` 와 같은 모양(Button · Text 둘), 둘째는 Text 하나(`n_second00001`). */
async function twoPages(stack: EditorStack, owner: Session, slug: string): Promise<{ P1: string; secondTitle: string }> {
  const call = (m: string, p: string, b?: unknown) => stack.request(owner, m, p, b)
  const P1 = await fixture(stack, owner, slug)
  const projectId = P1.split('/')[2]!
  const menu = (await call('GET', `/projects/${projectId}/tree`)).body.menu[0]
  const second = (await call('POST', `/projects/${projectId}/pages`, { menuNodeId: menu.id, title: '둘째' })).body
  const seeded = await call('PATCH', `/projects/${projectId}/pages/${second.id}/ops`, {
    baseSeq: 0,
    ops: [{ op: 'add', path: '/root/children/0', value: { id: 'n_second00001', type: 'Text', props: { content: '둘째 글' } } }],
  })
  if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
  return { P1, secondTitle: '둘째' }
}
