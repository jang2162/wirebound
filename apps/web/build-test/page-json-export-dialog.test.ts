/**
 * **페이지 JSON 내보내기 상자**(`src/panels/page-json-export-dialog.tsx` · `src/panels/page-json-export.ts`) — 페이지 줄 `…` 의 «JSON 내보내기» 가 여는
 * 모달을 Chrome 으로 잰다. 그 줄의 페이지 · 열린 페이지의 보낸 편집을 기다리는 것은 `page-json-dialog.test.ts` · `editor-export-open-edits.test.ts` 가 잰다.
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 열기 · 받기 | 항목이 곧바로 파일을 받는다(상자 없이) · 상자의 글이 받을 파일과 다르다 · «파일로 받기» 가 파일 하나(이름 · 내용)를 안 받는다 |
 * | 복사 | «클립보드에 복사» 뒤 클립보드 값이 상자의 글이 아니다 · 성공 문장이 없다 |
 * | 복사 실패 | 클립보드가 없는 문맥에서 실패 문장이 없다 · 글 상자를 골라 두지 않는다(포커스 · 고른 범위) |
 * | 불러오는 중 | 읽는 동안 «불러오는 중…» 이 없다 · 복사 · 받기가 선다 |
 * | 닫기 | Escape · 머리 «닫기» 가 상자를 안 닫는다 · 닫은 뒤 포커스가 줄의 `…` 로 안 돌아온다 |
 *
 * 클립보드는 `context.grantPermissions(['clipboard-read', 'clipboard-write'])` 로 열고 `navigator.clipboard.readText()` 로 읽는다. «복사 실패» 는
 * 보안 문맥이 아닌 판처럼 `navigator.clipboard` 를 지운 탭(`addInitScript`)으로 세운다 — 카나리아: 그 탭에서 `navigator.clipboard` 가 `undefined`.
 */
import { readFile } from 'node:fs/promises'
import type { BrowserContext, Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DOUBLE_CLICK_MS } from '../src/shell/action-menu'
import { canvasFrame, editorStackPrerequisite, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

const DIALOG = 'JSON 내보내기 — 첫째'

describe.skipIf(!전제.ok)('페이지 JSON 내보내기 상자 — 실브라우저', () => {
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

  async function fixture(slug: string): Promise<{ P: string; first: string }> {
    const project = (await call('POST', '/projects', { name: '내보내기 상자', slug: `${slug}-${Date.now().toString(36)}` })).body
    const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '메뉴' })).body
    const first = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '첫째' })).body.id as string
    const P = `/projects/${project.id}/pages/${first}`
    const seeded = await call('PATCH', `${P}/ops`, {
      baseSeq: 0,
      ops: [{ op: 'add', path: '/root/children/0', value: { id: 'n_export00001', type: 'Text', props: { content: '내보낼 글' } } }],
    })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
    return { P, first }
  }

  async function open(
    P: string,
    prepare?: (context: BrowserContext, page: Page) => Promise<void>,
  ): Promise<{ page: Page; context: BrowserContext; close: () => Promise<void> }> {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
    await prepare?.(context, page)
    await page.goto(P)
    await canvasFrame(page).locator('[data-wb-id]').first().waitFor({ state: 'attached' })
    return { page, context, close: () => context.close() }
  }

  function row(page: Page, id: string) {
    return page.locator(`.wb-shell-region[aria-label="메뉴·페이지 트리"] [data-tree-row][data-tree-id="${id}"]`)
  }

  /** 줄 `…` → «JSON 내보내기». */
  async function exportRow(page: Page, id: string): Promise<void> {
    await row(page, id).locator('> button, > a').first().hover()
    await row(page, id).getByRole('button', { name: '첫째 더 보기', exact: true }).click()
    await page.getByRole('menuitem', { name: 'JSON 내보내기', exact: true }).click()
  }

  const dialog = (page: Page) => page.getByRole('dialog', { name: DIALOG, exact: true })
  /** 닫힌 뒤 포커스가 선 자리 — 닫힘 뒤의 일(늦은 정리 · 다른 이펙트)이 포커스를 옮길 틈을 둔 뒤 읽는다. */
  const focusAfterClose = async (page: Page): Promise<string | null> => {
    await dialog(page).waitFor({ state: 'detached' })
    await page.waitForTimeout(300)
    return page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? null)
  }
  const box = (page: Page) => dialog(page).getByRole('textbox', { name: '내보낸 JSON', exact: true })

  it('항목은 상자를 열고, 상자의 글은 «파일로 받기» 가 받는 파일 하나와 같다', async () => {
    const { P, first } = await fixture('xd-open')
    const tab = await open(P)
    try {
      const downloads: string[] = []
      tab.page.on('download', (download) => downloads.push(download.suggestedFilename()))
      await exportRow(tab.page, first)
      await box(tab.page).waitFor()
      const shown = await box(tab.page).inputValue()
      const opened = {
        상자: await dialog(tab.page).isVisible(),
        읽기전용: await box(tab.page).getAttribute('readonly'),
        받음: downloads.length,
      }
      const downloading = tab.page.waitForEvent('download')
      await dialog(tab.page).getByRole('button', { name: '파일로 받기', exact: true }).click()
      const download = await downloading
      const text = await readFile((await download.path())!, 'utf8')
      await tab.page.waitForTimeout(300)
      const parsed = JSON.parse(shown) as { page: { title: string }; schema: { root: { children?: { id: string }[] } } }
      expect({
        opened,
        파일: download.suggestedFilename(),
        같은글: text === shown,
        제목: parsed.page.title,
        노드: parsed.schema.root.children?.map((child) => child.id),
        받은수: downloads.length,
      }).toEqual({
        opened: { 상자: true, 읽기전용: '', 받음: 0 },
        파일: '첫째.wirebound-page.json',
        같은글: true,
        제목: '첫째',
        노드: ['n_export00001'],
        받은수: 1,
      })
    } finally {
      await tab.close()
    }
  })

  it('«클립보드에 복사» 는 상자의 글을 클립보드에 넣고 성공을 말한다', async () => {
    const { P, first } = await fixture('xd-copy')
    const tab = await open(P, async (context) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: stack.webUrl })
    })
    try {
      await exportRow(tab.page, first)
      await box(tab.page).waitFor()
      const shown = await box(tab.page).inputValue()
      // 앞 값이 상자의 글과 같은 판을 가른다 — 미리 다른 글을 넣어 둔다.
      await tab.page.evaluate(() => navigator.clipboard.writeText('앞 값'))
      await dialog(tab.page).getByRole('button', { name: '클립보드에 복사', exact: true }).click()
      await dialog(tab.page).getByRole('status').waitFor()
      const clipboard = await tab.page.evaluate(() => navigator.clipboard.readText())
      expect({
        같은글: clipboard === shown,
        길이: clipboard.length > 100,
        문장: await dialog(tab.page).getByRole('status').textContent(),
      }).toEqual({
        같은글: true,
        길이: true,
        문장: '클립보드에 복사했습니다',
      })
    } finally {
      await tab.close()
    }
  })

  it('클립보드가 없는 문맥에서는 실패를 말하고 글 상자 전체를 골라 포커스를 둔다', async () => {
    const { P, first } = await fixture('xd-copy-fail')
    const tab = await open(P, async (context) => {
      await context.addInitScript(() => {
        Object.defineProperty(Navigator.prototype, 'clipboard', { configurable: true, get: () => undefined })
      })
    })
    try {
      const canary = await tab.page.evaluate(() => navigator.clipboard === undefined)
      await exportRow(tab.page, first)
      await box(tab.page).waitFor()
      const length = (await box(tab.page).inputValue()).length
      await dialog(tab.page).getByRole('button', { name: '클립보드에 복사', exact: true }).click()
      await dialog(tab.page).getByRole('alert').waitFor()
      const picked = await box(tab.page).evaluate((element) => {
        const area = element as HTMLTextAreaElement
        return { focused: document.activeElement === area, start: area.selectionStart, end: area.selectionEnd }
      })
      expect({ canary, 문장: await dialog(tab.page).getByRole('alert').textContent(), picked }).toEqual({
        canary: true,
        문장: '복사하지 못했습니다 — 글 상자의 글을 골라 직접 복사하세요',
        picked: { focused: true, start: 0, end: length },
      })
    } finally {
      await tab.close()
    }
  })

  it('읽는 동안은 «불러오는 중…» 이고 복사 · 받기가 없다 — 답이 오면 글 상자가 선다', async () => {
    const { P, first } = await fixture('xd-loading')
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => (release = resolve))
    let caught = 0
    const tab = await open(P)
    try {
      // 그 페이지의 코멘트 조회만 붙잡는다 — 내보내기가 페이지와 함께 읽는다(에디터의 다른 조회는 이미 끝났다).
      await tab.page.route(`**/api/projects/*/pages/${first}/comments**`, async (route) => {
        caught += 1
        await held
        await route.continue()
      })
      await exportRow(tab.page, first)
      await dialog(tab.page).getByRole('status').waitFor()
      const loading = {
        문장: await dialog(tab.page).getByRole('status').textContent(),
        단추: await dialog(tab.page)
          .getByRole('button', { name: /클립보드에 복사|파일로 받기/ })
          .count(),
        붙잡음: caught > 0,
      }
      release()
      await box(tab.page).waitFor()
      expect({
        loading,
        단추: await dialog(tab.page)
          .getByRole('button', { name: /클립보드에 복사|파일로 받기/ })
          .count(),
      }).toEqual({
        loading: { 문장: '불러오는 중…', 단추: 0, 붙잡음: true },
        단추: 2,
      })
    } finally {
      release()
      await tab.close()
    }
  })

  it('Escape · 머리 «닫기» 가 상자를 닫고 포커스는 줄의 `…` 로 돌아온다', async () => {
    const { P, first } = await fixture('xd-close')
    const tab = await open(P)
    try {
      await exportRow(tab.page, first)
      await box(tab.page).waitFor()
      await tab.page.keyboard.press('Escape')
      const afterEscape = await focusAfterClose(tab.page)
      // 같은 자리의 행동 메뉴 항목을 `DOUBLE_CLICK_MS` 안에 다시 누르면 더블클릭의 둘째로 삼킨다(`shell/action-menu.tsx`) — 띄운다.
      await tab.page.waitForTimeout(DOUBLE_CLICK_MS + 100)
      await exportRow(tab.page, first)
      await box(tab.page).waitFor()
      await dialog(tab.page).getByRole('button', { name: '닫기', exact: true }).click()
      const afterClose = await focusAfterClose(tab.page)
      expect({ afterEscape, afterClose }).toEqual({ afterEscape: '첫째 더 보기', afterClose: '첫째 더 보기' })
    } finally {
      await tab.close()
    }
  })
})
