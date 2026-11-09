/**
 * **«페이지 정보» 탭의 입력 · 단추가 셸의 꼴이다**(`src/panels/page-description.tsx` · `src/panels/page-states.tsx` · `shell.css` 의 `.wb-shell-page-title-input`
 * 머리 주석) — Chrome 의 계산된 스타일로 잰다. 칸 · 글 상자는 «컴포넌트» 탭 «속성» 묶음의 칸(`.wb-shell-control` — 글 노드의 «글» 상자)과 같은 값, 단추는 패널의 글 단추
 * (`.wb-shell-panel-action`) 값이다. 둘을 안 달면 브라우저 기본 꼴(테두리 `2px inset` · `Arial 13.3333px` 단추)로 선다.
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 페이지 이름 칸 | 이름 칸이 «속성» 묶음 칸과 다른 글꼴 · 테두리 · 모서리 · 여백 · 글 색이다 |
 * | 페이지 설명 글 상자 | 설명 상자가 그렇다 |
 * | «이름 저장» · «설명 저장» | 두 저장 단추가 패널 단추 꼴이 아니다 · 꺼진 판의 글이 흐리지 않다 |
 * | «상태 추가» | 그 단추가 패널 단추 꼴이 아니다 |
 * | 상태 20개(한도)의 «상태 추가» | `aria-disabled` 로 끈 단추의 글이 흐리지 않다 |
 * | 상태 설명 상자 | 상자 · «상태 설명 저장» · «취소» 가 셸 꼴이 아니다 |
 * | 지워진 상태의 쓰던 설명 | 남이 상태를 지운 뒤 남는 읽기 상자 · «버리기» 가 셸 꼴이 아니다 |
 */
import type { Locator, Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canvasFrame, editorStackPrerequisite, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

/** 견주는 계산된 스타일. 글 상자의 줄 높이 · 칸의 폭 · 높이는 자리마다 다르므로 안 본다. */
interface Look {
  font: string
  border: string
  radius: string
  padding: string
  background: string
  color: string
}

async function lookOf(target: Locator): Promise<Look> {
  return target.evaluate((element) => {
    const s = getComputedStyle(element)
    return {
      font: `${s.fontFamily} ${s.fontSize}`,
      border: `${s.borderTopWidth} ${s.borderTopStyle} ${s.borderTopColor}`,
      radius: s.borderTopLeftRadius,
      padding: `${s.paddingTop} ${s.paddingRight} ${s.paddingBottom} ${s.paddingLeft}`,
      background: s.backgroundColor,
      color: s.color,
    }
  })
}

/** 패널의 글 단추(`.wb-shell-panel-action`) — 켜진 판. 글꼴은 패널(`.wb-shell-panel`)의 것을 12px 로 물려받는다. */
function buttonLook(panelFont: string, color = 'rgb(29, 37, 48)'): Look {
  return {
    font: `${panelFont} 12px`,
    border: '1px solid rgb(223, 227, 232)',
    radius: '4px',
    padding: '3px 8px 3px 8px',
    background: 'rgb(255, 255, 255)',
    color,
  }
}

const MUTED = 'rgb(107, 118, 132)'

describe.skipIf(!전제.ok)('«페이지 정보» 탭의 입력 꼴 — 실브라우저', () => {
  let stack: EditorStack
  let alice: Session
  /** «컴포넌트» 탭 «속성» 묶음의 칸 꼴 — 글 노드의 «글» 상자. */
  let control: Look
  /** 패널의 글꼴(`font-family`). */
  let panelFont: string

  beforeAll(async () => {
    if (!전제.ok) return
    stack = await startEditorStack(전제)
    alice = await stack.login(stack.users.alice)
    const { P } = await fixture('look-ref')
    const tab = await open(P)
    try {
      await tab.page.locator('li button', { hasText: 'Text' }).first().click()
      await tab.page.getByRole('tab', { name: '컴포넌트', exact: true }).click()
      const box = tab.page
        .getByRole('tabpanel')
        .getByRole('region', { name: '속성', exact: true })
        .locator('textarea.wb-shell-control')
        .first()
      await box.waitFor()
      control = await lookOf(box)
      panelFont = await tab.page.locator('.wb-shell-panel').evaluate((element) => getComputedStyle(element).fontFamily)
      // eslint-disable-next-line no-console
      console.log(`[속성 묶음 칸] ${JSON.stringify(control)} · 패널 글꼴 ${panelFont}`)
    } finally {
      await tab.close()
    }
  })

  afterAll(async () => {
    if (stack === undefined) return
    const { before, after } = await stack.close()
    expect(before.processes).toBeGreaterThan(0)
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  })

  const call = (m: string, p: string, b?: unknown) => stack.request(alice, m, p, b)

  async function fixture(slug: string, extraStates = 0): Promise<{ P: string }> {
    const project = (await call('POST', '/projects', { name: '페이지 정보 꼴', slug: `${slug}-${Date.now().toString(36)}` })).body
    const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '가' })).body
    const pageId = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '첫째' })).body.id
    const P = `/projects/${project.id}/pages/${pageId}`
    const seeded = await call('PATCH', `${P}/ops`, {
      baseSeq: 0,
      ops: [
        {
          op: 'add',
          path: '/viewStates',
          value: [
            { id: 's_login', name: '로그인', description: '로그인한 판' },
            ...Array.from({ length: extraStates }, (_, at) => ({ id: `s_more${at}`, name: `상태 ${at + 2}` })),
          ],
        },
        { op: 'add', path: '/root/children/0', value: { id: 'n_text0000001', type: 'Text', props: { content: '글' } } },
      ],
    })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
    return { P }
  }

  async function open(P: string): Promise<{ page: Page; close: () => Promise<void> }> {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
    await page.goto(P)
    await canvasFrame(page).locator('[data-wb-id]').first().waitFor({ state: 'attached' })
    return { page, close: () => context.close() }
  }

  async function infoTab(page: Page): Promise<Locator> {
    await page.getByRole('tab', { name: '페이지 정보', exact: true }).click()
    const panel = page.getByRole('tabpanel')
    await panel.getByRole('textbox', { name: '페이지 이름', exact: true }).waitFor()
    return panel
  }

  /** 견줄 값이 UA 꼴이 아닌가의 카나리아 — «속성» 묶음 칸이 셸 꼴로 쟀다. */
  function controlCanary(): void {
    expect(control.border).toBe('1px solid rgb(223, 227, 232)')
  }

  it('페이지 이름 칸은 «속성» 묶음의 칸과 같은 꼴이다', async () => {
    controlCanary()
    const { P } = await fixture('look-title')
    const tab = await open(P)
    try {
      const panel = await infoTab(tab.page)
      expect(await lookOf(panel.getByRole('textbox', { name: '페이지 이름', exact: true }))).toEqual(control)
    } finally {
      await tab.close()
    }
  })

  it('페이지 설명 글 상자는 «속성» 묶음의 칸과 같은 꼴이다', async () => {
    controlCanary()
    const { P } = await fixture('look-desc')
    const tab = await open(P)
    try {
      const panel = await infoTab(tab.page)
      expect(await lookOf(panel.getByRole('textbox', { name: '페이지 설명', exact: true }))).toEqual(control)
    } finally {
      await tab.close()
    }
  })

  it('«이름 저장» · «설명 저장» 은 패널의 글 단추 꼴이고, 꺼진 판은 글이 흐리다', async () => {
    const { P } = await fixture('look-save')
    const tab = await open(P)
    try {
      const panel = await infoTab(tab.page)
      const titleSave = panel.getByRole('button', { name: '이름 저장', exact: true })
      const descriptionSave = panel.getByRole('button', { name: '설명 저장', exact: true })
      const off = { 이름: await lookOf(titleSave), 설명: await lookOf(descriptionSave) }
      await panel.getByRole('textbox', { name: '페이지 이름', exact: true }).fill('첫째 고침')
      await panel.getByRole('textbox', { name: '페이지 설명', exact: true }).fill('새 설명')
      const on = { 이름: await lookOf(titleSave), 설명: await lookOf(descriptionSave) }
      expect({ off, on }).toEqual({
        off: { 이름: buttonLook(panelFont, MUTED), 설명: buttonLook(panelFont, MUTED) },
        on: { 이름: buttonLook(panelFont), 설명: buttonLook(panelFont) },
      })
    } finally {
      await tab.close()
    }
  })

  it('«상태 추가» 는 패널의 글 단추 꼴이다', async () => {
    const { P } = await fixture('look-add')
    const tab = await open(P)
    try {
      const panel = await infoTab(tab.page)
      expect(await lookOf(panel.getByRole('button', { name: '상태 추가', exact: true }))).toEqual(buttonLook(panelFont))
    } finally {
      await tab.close()
    }
  })

  it('상태가 한도(20)면 «상태 추가» 는 꺼진 단추의 흐린 글이다', async () => {
    const { P } = await fixture('look-add-full', 19)
    const tab = await open(P)
    try {
      const panel = await infoTab(tab.page)
      const add = panel.getByRole('button', { name: '상태 추가', exact: true })
      expect({ 꺼짐: await add.getAttribute('aria-disabled'), 꼴: await lookOf(add) }).toEqual({
        꺼짐: 'true',
        꼴: buttonLook(panelFont, MUTED),
      })
    } finally {
      await tab.close()
    }
  })

  it('상태 설명 상자 · «상태 설명 저장» · «취소» 가 셸 꼴이다', async () => {
    controlCanary()
    const { P } = await fixture('look-describe')
    const tab = await open(P)
    try {
      const panel = await infoTab(tab.page)
      await panel.getByRole('button', { name: '상태 로그인 더 보기', exact: true }).click()
      await tab.page.getByRole('menuitem', { name: '설명 쓰기', exact: true }).click()
      const box = panel.getByRole('textbox', { name: '상태 설명', exact: true })
      await box.waitFor()
      expect({
        상자: await lookOf(box),
        저장: await lookOf(panel.getByRole('button', { name: '상태 설명 저장', exact: true })),
        취소: await lookOf(panel.getByRole('button', { name: '취소', exact: true })),
      }).toEqual({ 상자: control, 저장: buttonLook(panelFont), 취소: buttonLook(panelFont) })
    } finally {
      await tab.close()
    }
  })

  it('남이 상태를 지운 뒤 남는 «쓰던 설명» 상자 · «버리기» 가 셸 꼴이다', async () => {
    controlCanary()
    const { P } = await fixture('look-gone')
    const tab = await open(P)
    try {
      const panel = await infoTab(tab.page)
      await panel.getByRole('button', { name: '상태 로그인 더 보기', exact: true }).click()
      await tab.page.getByRole('menuitem', { name: '설명 쓰기', exact: true }).click()
      await panel.getByRole('textbox', { name: '상태 설명', exact: true }).fill('쓰던 글')
      const head = (await call('GET', P)).body.headSeq as number
      const removed = await call('PATCH', `${P}/ops`, { baseSeq: head, ops: [{ op: 'remove', path: '/viewStates/0' }] })
      if (removed.status >= 300) throw new Error(`remove ${removed.status} ${JSON.stringify(removed.body)}`)
      const gone = panel.getByRole('group', { name: '지워진 상태의 설명', exact: true })
      await gone.waitFor()
      expect({
        상자: await lookOf(gone.getByRole('textbox', { name: '쓰던 설명', exact: true })),
        버리기: await lookOf(gone.getByRole('button', { name: '버리기', exact: true })),
      }).toEqual({ 상자: control, 버리기: buttonLook(panelFont) })
    } finally {
      await tab.close()
    }
  })
})
