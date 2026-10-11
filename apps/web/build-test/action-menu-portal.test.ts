/**
 * **행동 메뉴의 목록을 `document.body` 로 옮겨도 지키는 성질을 실브라우저로 잰다**(`src/shell/action-menu.tsx` 머리말 «목록은 문서 맨 위
 * 겹에 선다»). jsdom 은 포커스 이동 · Tab 차례 · 좌표 · 스크롤이 없다.
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 키 — 구조 트리 줄 `…` | ↓ 가 항목을 안 옮긴다 · ← 가 선택을 옮긴다 · Escape 뒤 포커스가 단추가 아니다 · 다시 연 메뉴의 Delete 가 고른 노드를 지운다(열린 행동 메뉴는 Delete 를 쥔다 — 판마다의 값은 `./action-menu-delete.test.ts`) |
 * | 키 — 메뉴 트리 줄 `…` 의 `?` · Delete | 에디터 도움말이 선다 · 메뉴 트리의 삭제 확인이 선다 · 에디터 단축키가 구조 노드를 지운다(메뉴 트리는 에디터 단축키를 안 받는다 — `data-wb-own-shortcuts`) |
 * | Tab · Shift+Tab | Tab 이 단추 다음 자리로 안 간다 · Shift+Tab 이 단추에 안 선다 |
 * | 바깥 누름 | 다른 줄을 한 번 눌러 메뉴가 닫히고 그 줄이 골라지지 않는다 |
 * | 스크롤 · 창 크기 | 칸을 굴리면 목록이 단추를 안 따라간다 · 단추가 칸 밖으로 나가도 목록이 남는다 · 닫힌 뒤 칸이 되굴려진다 · 창을 좁히면 목록이 창 밖이다 |
 * | 항목 고르기 | 자리마다 항목을 눌러 그 일이 안 일어난다(구조 «삭제» · 메뉴 «삭제» 확인 · 메뉴 `+` «페이지 추가» · 구조 머리 `+` «페이지에 추가» · 셸 `…` «스냅샷» · 목록 머리 `…` «계정 설정») |
 */
import type { Locator, Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canvasFrame, editorStackPrerequisite, poll, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

const NODES = 40
const MENUS = 14
const nodeId = (i: number): string => `n_t${String(i).padStart(10, '0')}`

describe.skipIf(!전제.ok)('행동 메뉴 portal — 지키는 성질 · 실브라우저', () => {
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
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  })

  const call = (m: string, p: string, b?: unknown) => stack.request(alice, m, p, b)

  async function fixture(slug: string): Promise<{ projectId: string; P: string; menuIds: string[]; pageIds: string[] }> {
    const project = (await call('POST', '/projects', { name: '관리자 콘솔 설계서', slug: `${slug}-${Date.now().toString(36)}` })).body
    const menuIds: string[] = []
    const pageIds: string[] = []
    for (let m = 0; m < MENUS; m += 1) {
      const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: `메뉴 ${m + 1}` })).body.id as string
      menuIds.push(menu)
      for (let p = 0; p < 2; p += 1)
        pageIds.push((await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu, title: `페이지 ${m + 1}-${p + 1}` })).body.id)
    }
    const P = `/projects/${project.id}/pages/${pageIds[0]}`
    const ops = Array.from({ length: NODES }, (_, i) => ({
      op: 'add',
      path: `/root/children/${i}`,
      value: { id: nodeId(i), type: 'Text', props: { content: `글 ${i + 1}` } },
    }))
    const seeded = await call('PATCH', `${P}/ops`, { baseSeq: 0, ops })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
    return { projectId: project.id, P, menuIds, pageIds }
  }

  async function openEditor(P: string, viewport = { width: 1440, height: 900 }): Promise<{ page: Page; close: () => Promise<void> }> {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport })
    await page.goto(P)
    await canvasFrame(page).locator('[data-wb-id]').first().waitFor()
    await page.locator('[data-tree-row]').first().waitFor({ state: 'attached' })
    return { page, close: () => context.close() }
  }

  const structureRow = (page: Page, id: string): Locator =>
    page.locator(`.wb-shell-region[aria-label="구조 트리"] [data-tree-row][data-tree-id="${id}"]`)
  const menuRow = (page: Page, id: string): Locator =>
    page.locator(`.wb-shell-region[aria-label="메뉴·페이지 트리"] [data-tree-row][data-tree-id="${id}"]`)

  /**
   * 줄을 보이게 굴리고 그 줄의 행동 단추를 연다(여는 누름이 그 줄을 고른다 — `panels/tree-row-actions.tsx`). 줄 행동은 마우스가 올라온 줄에서
   * 선다 — 메뉴 트리의 페이지 줄은 줄 단추가 링크라 눌러 고르면 페이지를 옮긴다. 돌려주는 것은 그 단추.
   */
  async function openRow(row: Locator, name: RegExp, block: 'center' | 'end' = 'center'): Promise<Locator> {
    await row.evaluate((element, where) => element.scrollIntoView({ block: where }), block)
    // 줄 상자는 `visibility: hidden` 이라 그 위가 아니라 늘 보이는 줄 단추(링크) 위에 올린다(`shell.css` 의 `.wb-shell-tree-row`).
    await row.locator(':scope > :first-child').hover()
    const toggle = row.getByRole('button', { name })
    await toggle.click()
    await row.page().getByRole('menu').waitFor()
    return toggle
  }

  async function serverIds(P: string): Promise<string[]> {
    return ((await call('GET', P)).body.schema.root.children as { id: string }[]).map((node) => node.id)
  }

  const focusName = (page: Page): Promise<string> =>
    page.evaluate(() => {
      const at = document.activeElement
      return at === null ? '' : (at.getAttribute('aria-label') ?? at.textContent ?? '').trim()
    })

  const selectedRow = (page: Page): Promise<string | null> =>
    page.evaluate(
      () =>
        document
          .querySelector('.wb-shell-region[aria-label="구조 트리"] [data-tree-row].wb-shell-tree-row-picked')
          ?.getAttribute('data-tree-id') ?? null,
    )

  it('키 — 구조 트리 줄 `…`: ↓ 는 항목 사이 · ← 는 선택을 안 옮김 · Escape 는 닫고 단추로 · Delete 는 메뉴가 받는다', async () => {
    const { P } = await fixture('portal-keys')
    const { page, close } = await openEditor(P)
    try {
      const target = nodeId(10)
      const toggle = await openRow(structureRow(page, target), /더 보기$/)
      const first = await focusName(page)
      await page.keyboard.press('ArrowDown')
      const second = await focusName(page)
      await page.keyboard.press('ArrowLeft')
      const afterLeft = { selected: await selectedRow(page), menus: await page.getByRole('menu').count() }
      await page.keyboard.press('Escape')
      const afterEscape = { menus: await page.getByRole('menu').count(), focus: await focusName(page), selected: await selectedRow(page) }
      const toggleName = await toggle.getAttribute('aria-label')

      await toggle.click()
      await page.getByRole('menu').waitFor()
      await page.keyboard.press('Delete')
      const ids = await poll(
        'Delete 가 서버에 닿거나 안 닿는다',
        () => serverIds(P),
        (list) => !list.includes(target),
        3_000,
      ).catch(() => serverIds(P))

      expect({
        moved: first.length > 0 && second.length > 0 && second !== first,
        afterLeft,
        afterEscape,
        deleted: !ids.includes(target),
        menus: await page.getByRole('menu').count(),
      }).toEqual({
        moved: true,
        afterLeft: { selected: target, menus: 1 },
        afterEscape: { menus: 0, focus: toggleName, selected: target },
        deleted: false,
        menus: 1,
      })
    } finally {
      await close()
    }
  })

  it('키 — 메뉴 트리 페이지 줄 `…` 안에서 에디터 단축키(`?`)가 안 서고, Delete 는 메뉴가 받아 삭제 확인도 안 서며 구조 노드는 그대로다', async () => {
    const { P, pageIds } = await fixture('portal-menu-delete')
    const { page, close } = await openEditor(P)
    try {
      // 구조 노드 하나를 먼저 고른다 — 에디터 단축키가 메뉴 트리의 Delete 를 받으면 이것이 지워진다.
      await structureRow(page, nodeId(0)).locator('button').first().click()
      const before = await serverIds(P)
      await openRow(menuRow(page, pageIds[5]!), /더 보기$/)
      // `?` 는 메뉴 트리가 안 쓰는 에디터 단축키(도움말)다 — 메뉴 트리 안에서는 안 선다(`data-wb-own-shortcuts`) — 표지를 재는 것은 `?` 다.
      // Delete 는 열린 메뉴가 쥐어 메뉴 트리의 삭제 확인도 에디터 단축키도 안 받는다(그 판의 축은 `./action-menu-delete.test.ts` 가 갖는다).
      await page.keyboard.press('?')
      await page.waitForTimeout(200)
      const help = await page.locator('dialog[open]').count()
      await page.keyboard.press('Delete')
      await page.waitForTimeout(400)
      const confirm = await page.getByRole('button', { name: '정말 삭제합니까?' }).count()

      expect({ help, confirm, structure: (await serverIds(P)).length === before.length }).toEqual({ help: 0, confirm: 0, structure: true })
    } finally {
      await close()
    }
  })

  it('Tab 은 단추 다음 자리로 · Shift+Tab 은 단추에 선다', async () => {
    const { P } = await fixture('portal-tab')
    const { page, close } = await openEditor(P)
    try {
      const toggle = await openRow(structureRow(page, nodeId(10)), /더 보기$/)
      await page.keyboard.press('Escape')
      // 기준 — 닫힌 단추에서 Tab 이 가는 자리.
      await toggle.focus()
      await page.keyboard.press('Tab')
      const expected = await focusName(page)

      await toggle.click()
      await page.getByRole('menu').waitFor()
      await page.keyboard.press('Tab')
      const afterTab = { menus: await page.getByRole('menu').count(), focus: await focusName(page) }

      await toggle.click()
      await page.getByRole('menu').waitFor()
      await page.keyboard.press('Shift+Tab')
      const afterShiftTab = { menus: await page.getByRole('menu').count(), focus: await focusName(page) }

      expect({ expectedIsSomething: expected.length > 0, afterTab, afterShiftTab }).toEqual({
        expectedIsSomething: true,
        afterTab: { menus: 0, focus: expected },
        afterShiftTab: { menus: 0, focus: await toggle.getAttribute('aria-label') },
      })
    } finally {
      await close()
    }
  })

  it('바깥 누름 — 다른 줄을 한 번 누르면 메뉴가 닫히고 그 줄이 골라진다 · 목록 안의 꺼진 항목을 눌러도 안 닫힌다', async () => {
    const { P } = await fixture('portal-outside')
    const { page, close } = await openEditor(P)
    try {
      // 뿌리 줄의 `…` 는 위로 · 아래로 · 들여쓰기 · 내어쓰기가 꺼져 있다(뿌리).
      await openRow(structureRow(page, nodeId(10)), /더 보기$/)
      const disabled = page.getByRole('menuitem').and(page.locator('[aria-disabled="true"]'))
      const disabledCount = await disabled.count()
      // 꺼진 항목은 playwright 가 «누를 수 없다»로 기다린다 — 사람의 누름처럼 그대로 누른다.
      if (disabledCount > 0) await disabled.first().click({ force: true })
      const afterDisabled = await page.getByRole('menu').count()
      // 위 줄을 누른다 — 목록은 아래로 열려 아래 줄들을 덮는다(덮인 줄은 사람도 못 누른다).
      await structureRow(page, nodeId(7)).locator('button').first().click()
      expect({
        disabledCount: disabledCount > 0,
        afterDisabled,
        menus: await page.getByRole('menu').count(),
        selected: await selectedRow(page),
      }).toEqual({
        disabledCount: true,
        afterDisabled: 1,
        menus: 0,
        selected: nodeId(7),
      })
    } finally {
      await close()
    }
  })

  it('스크롤 · 창 크기 — 목록이 단추를 따라가고, 단추가 칸 밖으로 나가면 닫히며 칸을 되굴리지 않는다 · 창을 좁혀도 창 안이다', async () => {
    const { P } = await fixture('portal-scroll')
    const { page, close } = await openEditor(P, { width: 1440, height: 700 })
    try {
      const row = structureRow(page, nodeId(NODES / 2))
      const toggle = await openRow(row, /더 보기$/)
      const scroller = await row.evaluateHandle((element) => {
        for (let at = element.parentElement; at !== null; at = at.parentElement) {
          const style = getComputedStyle(at)
          if (/(auto|scroll)/.test(style.overflowY) && at.scrollHeight > at.clientHeight) return at
        }
        throw new Error('스크롤 칸이 없다')
      })
      const gap = async (): Promise<number> => {
        const menu = (await page.locator('.wb-shell-action-menu-body').boundingBox())!
        const button = (await toggle.boundingBox())!
        return Math.round(menu.y - (button.y + button.height))
      }
      const gapBefore = await gap()
      await scroller.evaluate((element) => {
        ;(element as HTMLElement).scrollTop += 30
      })
      await page.waitForTimeout(100)
      const gapAfter = await gap()
      const menusAfterSmall = await page.getByRole('menu').count()

      await scroller.evaluate((element) => {
        ;(element as HTMLElement).scrollTop += 2000
      })
      const scrolledTo = await scroller.evaluate((element) => (element as HTMLElement).scrollTop)
      await page.waitForTimeout(150)
      const menusAfterLost = await page.getByRole('menu').count()
      const stayed = await scroller.evaluate((element) => (element as HTMLElement).scrollTop)

      // 창 크기 — 셸 `…` 를 연 채 좁힌다.
      await page.locator('.wb-shell-header').getByRole('button', { name: '더 보기', exact: true }).click()
      await page.getByRole('menu').waitFor()
      await page.setViewportSize({ width: 900, height: 700 })
      await page.waitForTimeout(150)
      const box = (await page.locator('.wb-shell-action-menu-body').boundingBox())!

      expect({
        gapSame: gapAfter === gapBefore,
        menusAfterSmall,
        menusAfterLost,
        stayed: stayed === scrolledTo,
        inside: box.x >= 0 && box.x + box.width <= 900 && box.y >= 0 && box.y + box.height <= 700,
      }).toEqual({ gapSame: true, menusAfterSmall: 1, menusAfterLost: 0, stayed: true, inside: true })
    } finally {
      await close()
    }
  })

  it('항목 고르기 — 자리마다 항목을 누르면 그 일이 일어난다', async () => {
    const { projectId, P, menuIds, pageIds } = await fixture('portal-choose')
    const { page, close } = await openEditor(P)
    try {
      const results: Record<string, unknown> = {}

      // 구조 트리 맨 아래 줄 `…` «삭제» — 확인 없이 바로(정본 «트리의 줄 행동»).
      const last = nodeId(NODES - 1)
      await openRow(structureRow(page, last), /더 보기$/, 'end')
      results.blockLast = await page.locator('.wb-shell-action-menu-body').getAttribute('data-block')
      await page.getByRole('menuitem', { name: '삭제', exact: true }).click()
      results.structureDelete = !(
        await poll(
          '구조 «삭제»',
          () => serverIds(P),
          (list) => !list.includes(last),
          5_000,
        )
      ).includes(last)

      // 메뉴 트리 맨 아래 페이지 줄 `…` «삭제» → «정말 삭제합니까?» → 서버에서 빠진다(페이지가 든 메뉴의 «삭제»는 꺼져 있다).
      const doomed = pageIds[pageIds.length - 1]!
      await page.waitForTimeout(600)
      await openRow(menuRow(page, doomed), /더 보기$/, 'end')
      await page.getByRole('menuitem', { name: '삭제', exact: true }).click()
      await page.getByRole('button', { name: '정말 삭제합니까?' }).click()
      const tree = async () =>
        ((await call('GET', `/projects/${projectId}/tree`)).body.menu as { pages: { id: string }[] }[]).flatMap((menu) =>
          menu.pages.map((one) => one.id),
        )
      results.menuDelete = !(await poll('페이지 «삭제»', tree, (ids) => !ids.includes(doomed), 5_000)).includes(doomed)

      // 메뉴 트리 줄 `+` «페이지 추가» → 이름 칸이 선다.
      await page.waitForTimeout(600)
      await openRow(menuRow(page, menuIds[2]!), /추가$/)
      await page.getByRole('menuitem', { name: '페이지 추가', exact: true }).click()
      results.pageInput = await page.locator('.wb-shell-region[aria-label="메뉴·페이지 트리"] .wb-shell-tree-input').count()
      await page.keyboard.press('Escape')

      // 구조 트리 머리 `+` «페이지에 추가» → 고르개가 선다.
      await page.waitForTimeout(600)
      await page
        .locator('.wb-shell-region[aria-label="구조 트리"]')
        .getByRole('button', { name: /추가$/ })
        .first()
        .click()
      await page.getByRole('menuitem', { name: '페이지에 추가', exact: true }).click()
      results.picker = (await page.locator('.wb-shell-region[aria-label="구조 트리"] [data-wb-holds-keys]').count()) > 0
      await page.keyboard.press('Escape')

      // 셸 `…` «스냅샷» → 대화 상자.
      await page.waitForTimeout(600)
      await page.locator('.wb-shell-header').getByRole('button', { name: '더 보기', exact: true }).click()
      await page.getByRole('menuitem', { name: '스냅샷', exact: true }).click()
      results.snapshots = await page.getByRole('dialog', { name: '스냅샷' }).count()
      await page.keyboard.press('Escape')

      // 목록 머리 `…` «계정 설정» → /account.
      await page.goto('/')
      await page.locator('.wb-shell-project-head').getByRole('button', { name: '더 보기', exact: true }).click()
      await page.getByRole('menuitem', { name: '계정 설정', exact: true }).click()
      await page.waitForURL(/\/account$/)
      results.account = new URL(page.url()).pathname

      expect(results).toEqual({
        blockLast: 'above',
        structureDelete: true,
        menuDelete: true,
        pageInput: 1,
        picker: true,
        snapshots: 1,
        account: '/account',
      })
    } finally {
      await close()
    }
  })
})
