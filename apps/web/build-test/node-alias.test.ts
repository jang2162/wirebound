/**
 * **노드 별칭 · 구조 트리 줄 요약을 실브라우저로 잰다**(설계서 「설계서 화면 구조」의 노드 별칭 · 구조 트리 줄). jsdom 판은
 * `test/panels/node-alias.test.tsx`(고치는 자리) · `test/panels/structure-row-name.test.tsx`(줄 글) · `test/panels/alias-naming.test.tsx`
 * (이름이 되는 자리)가 갖고, 여기는 jsdom 이 못 재는 둘이다.
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | F2 로 고친 별칭이 남의 화면 · 상호작용 문장 · 되돌리기에 선다 | 진짜 키(F2)가 입력을 안 연다 · 편집(WS `patch`)이 서버에 안 닿는다 · 남(bob)의 트리 줄 · 상호작용 문장이 안 바뀐다 · 되돌리기 한 번에 옛 글로 안 돌아온다 |
 * | 접힌 줄과 별칭 입력 — 숨은 노드의 F2 · 입력 안의 ← → | F2 가 숨은 노드의 조상을 안 펴 입력이 화면에 안 선다 · 입력 안의 ← → 가 줄을 접거나 고른 노드를 옮긴다(캐럿이 안 옮는다) |
| 좁은 창의 긴 별칭 · 요약이 칸 안에서 잘린다 | 줄 글이 트리 칸 밖으로 넘친다(글자 노드 `Range` 오른끝이 줄 단추 밖인데 잘리지 않는다) · 줄이 두 줄이 된다 · 문서가 가로로 스크롤한다 |
 * | 긴 별칭의 글이 우측 패널 밖으로 안 나간다(속성 · 상호작용 · 코멘트 탭) | 제목 · 문장 · «달 곳»의 글자 노드 `Range` 오른끝이 패널 밖이고 그 자리를 자르는 조상이 패널 안에 없다 |
 * | 긴 별칭이 든 상호작용 대상 고르개가 우측 패널 안에 선다 | 고르개 `<select>` 가 가장 긴 항목(60자 별칭) 폭으로 늘어 패널 밖으로 나간다 — 별칭은 문장의 라벨성 prop 과 달리 자르지 않는다 |
 */
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canvasFrame, editorStackPrerequisite, poll, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

/** 60자 한 낱말 — 끊을 자리가 없다(하이픈도 없다 — 브라우저가 하이픈 뒤에서 줄을 바꾼다). */
const LONG_ALIAS = 'A'.repeat(60)

describe.skipIf(!전제.ok)('노드 별칭 · 줄 요약 — 실브라우저', () => {
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
    expect(before.databases).toBe(1)
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  })

  const call = (m: string, p: string, b?: unknown) => stack.request(alice, m, p, b)

  async function fixture(slug: string, nodes: unknown[]): Promise<{ P: string }> {
    const project = (await call('POST', '/projects', { name: 'F2 별칭', slug: `${slug}-${Date.now().toString(36)}` })).body
    const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '가' })).body
    const member = await call('POST', `/projects/${project.id}/members`, { email: stack.users.bob.email, role: 'editor' })
    if (member.status >= 300) throw new Error(`member ${member.status}`)
    const pageId = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '쪽' })).body.id
    const P = `/projects/${project.id}/pages/${pageId}`
    const seeded = await call('PATCH', `${P}/ops`, { baseSeq: 0, ops: nodes.map((value, at) => ({ op: 'add', path: `/root/children/${at}`, value })) })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
    return { P }
  }

  async function openEditor(P: string, user: 'alice' | 'bob', viewport = { width: 1440, height: 900 }): Promise<{ page: Page; close: () => Promise<void>; patches: string[] }> {
    const { context, page } = await stack.openTab(stack.users[user], { viewport })
    const patches: string[] = []
    page.on('websocket', (socket) => {
      socket.on('framesent', (frame) => {
        const text = typeof frame.payload === 'string' ? frame.payload : frame.payload.toString()
        if (text.includes('"type":"patch"')) patches.push(text)
      })
    })
    await page.goto(P)
    await canvasFrame(page).locator('[data-wb-id]').first().waitFor()
    await page.locator('[data-tree-row]').first().waitFor({ state: 'attached' })
    return { page, close: () => context.close(), patches }
  }

  const rowButton = (page: Page, id: string) => page.locator(`[data-tree-id="${id}"] > button.wb-shell-structure-node`)

  it('F2 로 고친 별칭이 남의 화면 · 상호작용 문장 · 되돌리기에 선다', async () => {
    const { P } = await fixture('f2-live', [
      {
        id: 'n_save00000001',
        type: 'Button',
        marker: 1,
        props: { label: '저장' },
        interactions: [{ on: 'click', actions: [{ type: 'setVisible', target: 'n_list00000001', value: false }] }],
      },
      { id: 'n_list00000001', type: 'List', marker: 2 },
    ])
    const a = await openEditor(P, 'alice')
    const b = await openEditor(P, 'bob')
    try {
      await b.page.getByRole('tab', { name: '상호작용' }).click()
      const sentence = b.page.locator('.wb-shell-interaction-sentence').first()
      await expect.poll(() => sentence.textContent()).toBe('① 저장 버튼 클릭 시 ② 목록이 숨겨집니다')

      await rowButton(a.page, 'n_save00000001').click()
      await a.page.keyboard.press('F2')
      const input = a.page.locator('.wb-shell-region[aria-label="구조 트리"]').getByRole('textbox', { name: '별칭', exact: true })
      await expect.poll(() => input.evaluate((el) => el === document.activeElement)).toBe(true)
      await a.page.keyboard.type('머리 저장')
      await a.page.keyboard.press('Enter')

      // 편집은 WS 프레임 하나 — `add /…/alias`.
      await expect.poll(() => a.patches.length).toBe(1)
      expect(JSON.parse(a.patches[0]!).ops).toEqual([{ op: 'add', path: '/root/children/0/alias', value: '머리 저장' }])
      await poll('서버 문서의 별칭', async () => (await stack.request(alice, 'GET', P)).body.schema.root.children[0].alias, (v) => v === '머리 저장')

      // 남의 화면 — 트리 줄 · 상호작용 문장.
      await expect.poll(() => rowButton(b.page, 'n_save00000001').textContent()).toBe('Button (머리 저장) 저장')
      await expect.poll(() => sentence.textContent()).toBe('① 머리 저장 클릭 시 ② 목록이 숨겨집니다')
      // 포커스는 줄 단추로 돌아온다.
      expect(await rowButton(a.page, 'n_save00000001').evaluate((el) => el === document.activeElement)).toBe(true)

      // 되돌리기 한 번.
      await a.page.getByRole('group', { name: '편집 이력' }).getByRole('button', { name: '되돌리기', exact: true }).click()
      await poll('되돌린 서버 문서', async () => (await stack.request(alice, 'GET', P)).body.schema.root.children[0].alias, (v) => v === undefined)
      await expect.poll(() => rowButton(b.page, 'n_save00000001').textContent()).toBe('Button 저장')
      await expect.poll(() => sentence.textContent()).toBe('① 저장 버튼 클릭 시 ② 목록이 숨겨집니다')
      expect(a.patches).toHaveLength(2)
    } finally {
      await a.close()
      await b.close()
    }
  })

  it('접힌 줄(F1)과 별칭 입력 — 숨은 노드의 F2 는 조상을 펴고 입력을 열고, 입력 안의 ← → 는 캐럿만 옮긴다', async () => {
    const { P } = await fixture('f2-fold', [
      {
        id: 'n_card00000001',
        type: 'Card',
        alias: '회원 카드',
        props: { title: '회원' },
        children: [{ id: 'n_save00000002', type: 'Button', props: { label: '저장' } }],
      },
    ])
    const a = await openEditor(P, 'alice')
    try {
      const expanded = () => rowButton(a.page, 'n_card00000001').getAttribute('aria-expanded')
      // 고른 노드의 조상을 사람이 접는다 — F1 은 저절로 다시 펴지 않는다.
      await rowButton(a.page, 'n_save00000002').click()
      await a.page.locator('[data-tree-id="n_card00000001"] > [data-tree-toggle]').click()
      expect({ expanded: await expanded(), saveRows: await rowButton(a.page, 'n_save00000002').count() }).toEqual({ expanded: 'false', saveRows: 0 })

      await a.page.keyboard.press('F2')
      const input = a.page.locator('.wb-shell-region[aria-label="구조 트리"]').getByRole('textbox', { name: '별칭' })
      // 값으로 끝나게 읽는다 — 입력이 안 서면 `evaluate` 가 시간 초과로 죽어 무엇이 틀렸는지 안 남는다.
      await input.waitFor({ timeout: 3000 }).catch(() => {})
      const owner = await input.evaluateAll((els) => els.map((el) => el.closest('li')?.querySelector(':scope > [data-tree-id]')?.getAttribute('data-tree-id')))
      const focused = await input.evaluateAll((els) => els.map((el) => el === document.activeElement))
      expect({ expanded: await expanded(), owner, focused }).toEqual({ expanded: 'true', owner: ['n_save00000002'], focused: [true] })

      // 입력 안의 ← → — 캐럿이 옮고, 고른 노드 · 접힘은 그대로다.
      await a.page.keyboard.type('저장 단추')
      await a.page.keyboard.press('ArrowLeft')
      await a.page.keyboard.press('ArrowLeft')
      const caret = () => input.evaluateAll((els) => els.map((el) => (el as HTMLInputElement).selectionStart))
      const afterLeft = await caret()
      await a.page.keyboard.press('ArrowRight')
      const afterRight = await caret()
      const current = await a.page
        .locator('.wb-shell-region[aria-label="구조 트리"] [aria-current="true"]')
        .evaluateAll((els) => els.map((el) => el.closest('[data-tree-id]')?.getAttribute('data-tree-id')))
      expect({ afterLeft, afterRight, current, expanded: await expanded() }).toEqual({
        afterLeft: [3],
        afterRight: [4],
        current: ['n_save00000002'],
        expanded: 'true',
      })
      await a.page.keyboard.press('Enter')
      await poll('별칭이 서버에 닿는다', async () => (await call('GET', P)).body.schema.root.children[0].children[0].alias, (alias) => alias === '저장 단추')
    } finally {
      await a.close()
    }
  })

  it('좁은 창(700) — 긴 별칭 · 긴 요약이 트리 칸 안에서 한 줄로 잘린다', async () => {
    const { P } = await fixture('f2-narrow', [
      { id: 'n_long00000001', type: 'Button', alias: LONG_ALIAS, props: { label: '아주 긴 라벨 '.repeat(6).trim() } },
      { id: 'n_text00000001', type: 'Text', alias: '안내 문단', props: { content: '긴 본문 글 '.repeat(10).trim() } },
      { id: 'n_tabs00000001', type: 'Tabs', props: { tabs: ['개요', '상세', '이력', '설정'] } },
    ])
    const a = await openEditor(P, 'alice', { width: 700, height: 700 })
    try {
      const measured = await a.page.evaluate(() => {
        const region = document.querySelector('.wb-shell-region[aria-label="구조 트리"]')!.getBoundingClientRect()
        const rows = [...document.querySelectorAll<HTMLElement>('.wb-shell-structure-node')]
        return {
          docScroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          rows: rows.map((button) => {
            const box = button.getBoundingClientRect()
            const tops = new Set<number>()
            let textRight = 0
            const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT)
            for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
              const range = document.createRange()
              range.selectNodeContents(node)
              for (const rect of range.getClientRects()) {
                if (rect.width === 0) continue
                tops.add(Math.round(rect.top))
                textRight = Math.max(textRight, rect.right)
              }
            }
            const style = getComputedStyle(button)
            return {
              id: button.closest('[data-tree-row]')?.getAttribute('data-tree-id'),
              withinRegion: box.right <= region.right + 0.5 && box.left >= region.left - 0.5,
              lines: tops.size,
              // 글이 단추를 넘으면 단추가 잘라야 한다(넘침 숨김 · 줄임표).
              clipped: textRight <= box.right + 0.5 || (style.overflowX === 'hidden' && style.textOverflow === 'ellipsis'),
              overflowsButton: textRight > box.right + 0.5,
            }
          }),
        }
      })
      expect(measured.docScroll).toBeLessThanOrEqual(0)
      for (const row of measured.rows) {
        expect({ id: row.id, withinRegion: row.withinRegion, lines: row.lines, clipped: row.clipped }).toEqual({ id: row.id, withinRegion: true, lines: 1, clipped: true })
      }
      // 판 카나리아 — 긴 별칭 줄은 정말 단추를 넘는다(안 넘으면 이 케이스는 잘림을 안 잰 것이다).
      expect(measured.rows.find((row) => row.id === 'n_long00000001')?.overflowsButton).toBe(true)
    } finally {
      await a.close()
    }
  })

  it.each([1440, 700])('긴 별칭의 글이 우측 패널 밖으로 안 나간다 — 창 %i', async (width) => {
    const { P } = await fixture(`f2-panel-${width}`, [
      {
        id: 'n_long00000001',
        type: 'Button',
        alias: LONG_ALIAS,
        marker: 1,
        props: { label: '저장' },
        interactions: [{ on: 'click', actions: [{ type: 'setVisible', target: 'n_long00000001', value: false }] }],
      },
    ])
    const a = await openEditor(P, 'alice', { width, height: width === 700 ? 700 : 900 })
    try {
      await rowButton(a.page, 'n_long00000001').click()
      const past: Record<string, string[]> = {}
      for (const tab of ['속성', '상호작용', '코멘트']) {
        await a.page.getByRole('tab', { name: tab, exact: true }).click()
        await a.page.waitForTimeout(200)
        past[tab] = await a.page.evaluate((alias) => {
          const panel = document.querySelector('aside[aria-label="우측 패널"]')!
          const right = panel.getBoundingClientRect().right
          const out: string[] = []
          const walker = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT)
          for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
            if (!(node.textContent ?? '').includes(alias.slice(0, 10))) continue
            const range = document.createRange()
            range.selectNodeContents(node)
            const end = Math.max(0, ...[...range.getClientRects()].map((rect) => rect.right))
            if (end <= right + 0.5) continue
            // 넘친 글을 자르는 조상이 패널 안에 있으면 보이지 않는다.
            let clip: Element | null = node.parentElement
            while (clip !== null && clip !== panel && getComputedStyle(clip).overflowX === 'visible') clip = clip.parentElement
            if (clip !== null && clip !== panel && clip.getBoundingClientRect().right <= right + 0.5) continue
            out.push((node.parentElement?.className || node.parentElement?.tagName) ?? '?')
          }
          return out
        }, LONG_ALIAS)
      }
      expect(past).toEqual({ 속성: [], 상호작용: [], 코멘트: [] })
    } finally {
      await a.close()
    }
  })

  it.each([1440, 700])('긴 별칭이 든 상호작용 대상 고르개가 우측 패널 안에 선다 — 창 %i', async (width) => {
    const { P } = await fixture(`f2-picker-${width}`, [
      {
        id: 'n_save00000001',
        type: 'Button',
        props: { label: '저장' },
        interactions: [{ on: 'click', actions: [{ type: 'setVisible', target: 'n_long00000001', value: false }] }],
      },
      { id: 'n_long00000001', type: 'Card', alias: LONG_ALIAS },
    ])
    const a = await openEditor(P, 'alice', { width, height: width === 700 ? 700 : 900 })
    try {
      await rowButton(a.page, 'n_save00000001').click()
      await a.page.getByRole('tab', { name: '상호작용' }).click()
      const select = a.page.locator('aside label.wb-shell-field', { hasText: /^대상/ }).locator('select')
      await select.waitFor({ timeout: 10_000 })
      const measured = await select.evaluate((element) => {
        const panel = element.closest('aside')!.getBoundingClientRect()
        const box = element.getBoundingClientRect()
        return { right: box.right, panelRight: panel.right, chosen: (element as HTMLSelectElement).selectedOptions[0]?.textContent ?? '' }
      })
      // 판 카나리아 — 고른 항목이 정말 긴 별칭이다.
      expect(measured.chosen).toBe(LONG_ALIAS)
      expect(measured.right).toBeLessThanOrEqual(measured.panelRight + 0.5)
    } finally {
      await a.close()
    }
  })
})
