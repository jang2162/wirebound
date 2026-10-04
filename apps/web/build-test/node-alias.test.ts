/**
 * **노드 별칭 · 구조 트리 줄 요약을 실브라우저로 잰다**(설계서 「설계서 화면 구조」의 노드 별칭 · 구조 트리 줄). jsdom 판은
 * `test/panels/node-alias.test.tsx`(고치는 자리) · `test/panels/structure-row-name.test.tsx`(줄 글) · `test/panels/alias-naming.test.tsx`
 * (이름이 되는 자리)가 갖고, 여기는 jsdom 이 못 재는 둘이다.
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | F2 로 고친 별칭이 남의 화면 · 상호작용 문장 · 되돌리기에 선다 | 진짜 키(F2)가 입력을 안 연다 · 편집(WS `patch`)이 서버에 안 닿는다 · 남(bob)의 트리 줄 · 상호작용 문장이 안 바뀐다 · 되돌리기 한 번에 옛 글로 안 돌아온다 |
 * | 좁은 창의 긴 별칭 · 요약이 칸 안에서 잘린다 | 줄 글이 트리 칸 밖으로 넘친다(글자 노드 `Range` 오른끝이 줄 단추 밖인데 잘리지 않는다) · 줄이 두 줄이 된다 · 문서가 가로로 스크롤한다 |
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
})
