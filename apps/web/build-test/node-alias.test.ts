/**
 * **노드 별칭 · 구조 트리 줄 요약을 실브라우저로 잰다**(설계서 「설계서 화면 구조」의 노드 별칭 · 구조 트리 줄). jsdom 판은
 * `test/panels/node-alias.test.tsx`(고치는 자리) · `test/panels/structure-row-name.test.tsx`(줄 글) · `test/panels/alias-naming.test.tsx`
 * (이름이 되는 자리)가 갖고, 여기는 jsdom 이 못 재는 둘이다.
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | F2 로 고친 별칭이 남의 화면 · 상호작용 문장 · 되돌리기에 선다 | 진짜 키(F2)가 입력을 안 연다 · 편집(WS `patch`)이 서버에 안 닿는다 · 남(bob)의 트리 줄 · 상호작용 문장이 안 바뀐다 · 되돌리기 한 번에 옛 글로 안 돌아온다 |
 * | 접힌 줄과 별칭 입력 — 숨은 노드의 F2 · 입력 안의 ← → | F2 가 숨은 노드의 조상을 안 펴 입력이 화면에 안 선다 · 입력 안의 ← → 가 줄을 접거나 고른 노드를 옮긴다(캐럿이 안 옮는다) |
 * | 입력을 연 노드를 다른 탭이 지우면 · 되살리면 · 옮기면 | 입력이 말없이 사라진다(하단 바가 안 말한다) · 같은 id 가 되살아나면 묻지 않은 입력이 다시 서며 포커스를 가져간다 · 옮기면 친 글이 빈 칸으로 돌아간다 |
 * | 줄의 별칭 · 요약은 방향을 격리한다 | 괄호가 안 닫힌 RTL 별칭 뒤의 `)` 와 RTL 요약이 한 RTL 덩이로 묶여 요약이 괄호 앞(왼쪽)에 선다 · 방향 제어 글자가 든 요약이 그 줄의 타입 · 별칭이나 이웃 줄을 뒤집는다 |
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
    const seeded = await call('PATCH', `${P}/ops`, {
      baseSeq: 0,
      ops: nodes.map((value, at) => ({ op: 'add', path: `/root/children/${at}`, value })),
    })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
    return { P }
  }

  async function openEditor(
    P: string,
    user: 'alice' | 'bob',
    viewport = { width: 1440, height: 900 },
  ): Promise<{ page: Page; close: () => Promise<void>; patches: string[] }> {
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
      { id: 'n_list00000001', type: 'DataGrid', marker: 2 },
    ])
    const a = await openEditor(P, 'alice')
    const b = await openEditor(P, 'bob')
    try {
      await b.page.getByRole('tab', { name: '상호작용' }).click()
      const sentence = b.page.locator('.wb-shell-interaction-sentence').first()
      await expect.poll(() => sentence.textContent()).toBe('① 저장 버튼 클릭 시 ② 그리드가 숨겨집니다')

      await rowButton(a.page, 'n_save00000001').click()
      await a.page.keyboard.press('F2')
      const input = a.page.locator('.wb-shell-region[aria-label="구조 트리"]').getByRole('textbox', { name: '별칭', exact: true })
      await expect.poll(() => input.evaluate((el) => el === document.activeElement)).toBe(true)
      await a.page.keyboard.type('머리 저장')
      await a.page.keyboard.press('Enter')

      // 편집은 WS 프레임 하나 — `add /…/alias`.
      await expect.poll(() => a.patches.length).toBe(1)
      expect(JSON.parse(a.patches[0]!).ops).toEqual([{ op: 'add', path: '/root/children/0/alias', value: '머리 저장' }])
      await poll(
        '서버 문서의 별칭',
        async () => (await stack.request(alice, 'GET', P)).body.schema.root.children[0].alias,
        (v) => v === '머리 저장',
      )

      // 남의 화면 — 트리 줄 · 상호작용 문장.
      await expect.poll(() => rowButton(b.page, 'n_save00000001').textContent()).toBe('Button (머리 저장) 저장')
      await expect.poll(() => sentence.textContent()).toBe('① 머리 저장 클릭 시 ② 그리드가 숨겨집니다')
      // 포커스는 줄 단추로 돌아온다.
      expect(await rowButton(a.page, 'n_save00000001').evaluate((el) => el === document.activeElement)).toBe(true)

      // 되돌리기 한 번.
      await a.page.getByRole('group', { name: '편집 이력' }).getByRole('button', { name: '되돌리기', exact: true }).click()
      await poll(
        '되돌린 서버 문서',
        async () => (await stack.request(alice, 'GET', P)).body.schema.root.children[0].alias,
        (v) => v === undefined,
      )
      await expect.poll(() => rowButton(b.page, 'n_save00000001').textContent()).toBe('Button 저장')
      await expect.poll(() => sentence.textContent()).toBe('① 저장 버튼 클릭 시 ② 그리드가 숨겨집니다')
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
      expect({ expanded: await expanded(), saveRows: await rowButton(a.page, 'n_save00000002').count() }).toEqual({
        expanded: 'false',
        saveRows: 0,
      })

      await a.page.keyboard.press('F2')
      const input = a.page.locator('.wb-shell-region[aria-label="구조 트리"]').getByRole('textbox', { name: '별칭' })
      // 값으로 끝나게 읽는다 — 입력이 안 서면 `evaluate` 가 시간 초과로 죽어 무엇이 틀렸는지 안 남는다.
      await input.waitFor({ timeout: 3000 }).catch(() => {})
      const owner = await input.evaluateAll((els) =>
        els.map((el) => el.closest('li')?.querySelector(':scope > [data-tree-id]')?.getAttribute('data-tree-id')),
      )
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
      await poll(
        '별칭이 서버에 닿는다',
        async () => (await call('GET', P)).body.schema.root.children[0].children[0].alias,
        (alias) => alias === '저장 단추',
      )
    } finally {
      await a.close()
    }
  })

  /** 같은 사람의 다른 탭이 낸 편집 — alice 세션의 REST(`PATCH …/ops`)로 지금 머리 위에 낸다. */
  async function otherTab(P: string, ops: unknown[]): Promise<void> {
    const head = (await call('GET', P)).body.headSeq as number
    const res = await call('PATCH', `${P}/ops`, { baseSeq: head, ops })
    if (res.status !== 200) throw new Error(`다른 탭 편집 ${res.status} ${JSON.stringify(res.body)}`)
  }

  it('입력을 연 노드를 다른 탭이 지우면 입력이 닫히고 하단 바가 말한다 — 되살아나도 입력이 다시 안 서고, 옮겨지면 친 글째 선다', async () => {
    const save = { id: 'n_save00000003', type: 'Button', props: { label: '저장' } }
    const { P } = await fixture('f2-gone', [{ id: 'n_card00000003', type: 'Card', props: { title: '회원' }, children: [save] }])
    const a = await openEditor(P, 'alice')
    try {
      const input = a.page.locator('.wb-shell-region[aria-label="구조 트리"]').getByRole('textbox', { name: '별칭', exact: true })
      const alerts = () => a.page.getByRole('alert').allTextContents()
      const seen = async () => ({
        inputs: await input.count(),
        focus: await a.page.evaluate(() => document.activeElement?.tagName ?? null),
        alerts: await alerts(),
      })

      await rowButton(a.page, 'n_save00000003').click()
      await a.page.keyboard.press('F2')
      await expect.poll(() => input.evaluateAll((els) => els.map((el) => el === document.activeElement))).toEqual([true])
      await a.page.keyboard.type('지움 중')

      await otherTab(P, [{ op: 'remove', path: '/root/children/0/children/0' }])
      await expect.poll(() => rowButton(a.page, 'n_save00000003').count()).toBe(0)
      await expect.poll(seen).toEqual({ inputs: 0, focus: 'BODY', alerts: ['바뀐 선택 때문에 친 값을 쓰지 않았습니다'] })

      // 다른 탭이 되돌린다 — 같은 id 가 같은 자리에 되살아난다.
      await otherTab(P, [{ op: 'add', path: '/root/children/0/children/0', value: save }])
      await expect.poll(() => rowButton(a.page, 'n_save00000003').count()).toBe(1)
      await a.page.waitForTimeout(300)
      expect(await seen()).toMatchObject({ inputs: 0, focus: 'BODY' })
      expect(a.patches).toEqual([])

      // 다시 열고 친 채 다른 부모로 옮겨진다 — 입력은 새 자리에 친 글째 서고 Enter 가 옮긴 자리에 쓴다.
      await rowButton(a.page, 'n_save00000003').click()
      await a.page.keyboard.press('F2')
      await expect.poll(() => input.evaluateAll((els) => els.map((el) => el === document.activeElement))).toEqual([true])
      await a.page.keyboard.type('옮김 중')
      await otherTab(P, [{ op: 'move', from: '/root/children/0/children/0', path: '/root/children/-' }])
      await expect.poll(() => a.page.locator('[data-tree-id="n_card00000003"] ~ ul [data-tree-id="n_save00000003"]').count()).toBe(0)
      await expect.poll(() => input.evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value))).toEqual(['옮김 중'])
      await input.press('Enter')
      await poll(
        '옮긴 자리의 별칭',
        async () => (await call('GET', P)).body.schema.root.children[1]?.alias,
        (alias) => alias === '옮김 중',
      )
    } finally {
      await a.close()
    }
  })

  /**
   * **스냅샷 복원이 입력을 연 노드를 빼거나 옮기는 판** — 복원은 배너 «다시 불러오기» 를 눌러야 화면에 실리고, 그 누름이 입력의 포커스를 가져가
   * blur 로 입력이 먼저 취소된다(`tree-input.tsx` — blur 는 취소). 그래서 복원으로 «입력은 열린 채 노드만 빠지거나 옮겨지는» 판은 서지 않는다 —
   * 상자가 스토어 문서로 가르는 길(`alias-edit.tsx`)은 다른 탭의 편집이 닿는 위 케이스가 잰다. 여기는 복원 쪽의 성질을 잠근다: 누르기 전에는 입력이
   * 그대로고 · 누른 뒤에는 닫히며(하단 바는 복원 통지가 말한다) · 친 글은 어느 노드에도 안 쓰인다(뺀 판은 없는 노드 · 옮긴 판은 옮긴 자리의 노드).
   */
  it('입력을 연 노드를 스냅샷 복원이 빼거나 옮겨도 «다시 불러오기» 뒤 입력은 닫히고 친 글은 어디에도 안 쓰인다', async () => {
    const save = { id: 'n_save00000004', type: 'Button', props: { label: '저장' } }
    const card = { id: 'n_card00000004', type: 'Card', props: { title: '회원' }, children: [] as unknown[] }
    const { P } = await fixture('f2-restore', [card])
    const projectId = P.split('/')[2]!
    const snapshot = async (tag: string): Promise<string> => {
      const made = await call('POST', `/projects/${projectId}/snapshots`, { tag })
      if (made.status >= 300) throw new Error(`스냅샷 ${made.status} ${JSON.stringify(made.body)}`)
      return made.body.id as string
    }
    const restore = async (id: string): Promise<void> => {
      const done = await call('POST', `/projects/${projectId}/snapshots/${id}/restore`)
      if (done.status >= 300) throw new Error(`복원 ${done.status} ${JSON.stringify(done.body)}`)
    }
    const aliases = async () =>
      JSON.stringify(
        ((await call('GET', P)).body.schema.root.children as { id: string; alias?: string }[]).map((node) => [node.id, node.alias ?? null]),
      )
    /** 입력을 열고 글을 친 채 복원을 건 뒤 «다시 불러오기» 를 누른다 — 누르기 전 입력 수와 누른 뒤 상태를 낸다. */
    async function typeThenRestore(snapshotId: string, typed: string) {
      const a = await openEditor(P, 'alice')
      try {
        const input = a.page.locator('.wb-shell-region[aria-label="구조 트리"]').getByRole('textbox', { name: '별칭', exact: true })
        const reload = a.page.getByRole('button', { name: '다시 불러오기' })
        await rowButton(a.page, 'n_save00000004').click()
        await a.page.keyboard.press('F2')
        await expect.poll(() => input.evaluateAll((els) => els.map((el) => el === document.activeElement))).toEqual([true])
        await a.page.keyboard.type(typed)
        await restore(snapshotId)
        await reload.waitFor()
        const before = await input.count()
        await reload.click()
        await reload.waitFor({ state: 'detached' })
        await expect.poll(() => input.count()).toBe(0)
        return { before, alerts: await a.page.getByRole('alert').allTextContents(), patches: a.patches }
      } finally {
        await a.close()
      }
    }
    // 1) 뺀다 — 복원할 판에는 저장 단추가 없다.
    const without = await snapshot('without')
    await otherTab(P, [{ op: 'add', path: '/root/children/0/children/0', value: save }])
    const removed = await typeThenRestore(without, '복원 중')
    expect({ removed, aliases: await aliases() }).toEqual({
      removed: { before: 1, alerts: ['복원된 상태로 페이지를 다시 불러왔습니다. 되돌리기 이력이 초기화됐습니다.'], patches: [] },
      aliases: '[["n_card00000004",null]]',
    })
    // 2) 옮긴다 — 복원할 판에서 저장 단추는 카드 밖(뿌리 끝)에 있다(앞 복원으로 지금 문서에는 저장 단추가 없다).
    await otherTab(P, [{ op: 'add', path: '/root/children/-', value: save }])
    const outside = await snapshot('outside')
    await otherTab(P, [{ op: 'move', from: '/root/children/1', path: '/root/children/0/children/-' }])
    const moved = await typeThenRestore(outside, '옮겨 복원')
    expect({ moved, aliases: await aliases() }).toEqual({
      moved: { before: 1, alerts: ['복원된 상태로 페이지를 다시 불러왔습니다. 되돌리기 이력이 초기화됐습니다.'], patches: [] },
      aliases: '[["n_card00000004",null],["n_save00000004",null]]',
    })
  })

  /** 줄 단추의 글자(UTF-16 한 칸)마다 화면 가로 가운데 — 폭이 없는 글자(방향 제어)는 `NaN`. */
  const glyphs = (page: Page, id: string) =>
    rowButton(page, id).evaluate((button) => {
      const out: Array<{ ch: string; x: number }> = []
      const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        const text = node.textContent ?? ''
        for (let at = 0; at < text.length; at += 1) {
          const range = document.createRange()
          range.setStart(node, at)
          range.setEnd(node, at + 1)
          const rect = range.getBoundingClientRect()
          out.push({ ch: text[at]!, x: rect.width === 0 ? Number.NaN : rect.left + rect.width / 2 })
        }
      }
      return out
    })

  /** 논리 차례로 이은 조각들이 화면에서도 왼쪽부터 그 차례로 서는가 — 조각마다 가로 범위(폭 있는 글자만)를 견준다. */
  function piecesInOrder(row: Array<{ ch: string; x: number }>, pieces: string[]): { text: string; inOrder: boolean; spans: string[] } {
    const text = row.map((glyph) => glyph.ch).join('')
    const spans: Array<[number, number]> = []
    let at = 0
    for (const piece of pieces) {
      const start = text.indexOf(piece, at)
      const xs = row
        .slice(start, start + piece.length)
        .map((glyph) => glyph.x)
        .filter((x) => !Number.isNaN(x))
      spans.push([Math.min(...xs), Math.max(...xs)])
      at = start + piece.length
    }
    const inOrder = spans.every((span, index) => index === 0 || spans[index - 1]![1] < span[0])
    return { text, inOrder, spans: spans.map(([lo, hi]) => `${Math.round(lo)}-${Math.round(hi)}`) }
  }

  /**
   * 별칭 · 요약 조각은 방향을 격리한다(`<bdi>`). **짝이 맞는 괄호는 격리 없이도 차례를 지킨다** — 괄호 짝 규칙(UBA N0)이 `(` 앞의 타입(LTR)을
   * 보고 괄호를 왼쪽 → 오른쪽으로 세운다. 그래서 판은 **괄호가 안 닫힌 RTL 별칭**이다: 줄의 `)` 가 별칭 안의 `(` 와 짝이 되어 RTL 로 서고, 별칭
   * · `)` · RTL 요약이 한 RTL 덩이로 묶여 요약이 괄호 앞(왼쪽)에 선다. 방향 제어 글자가 든 요약(라벨 몫 — 봉투가 막지 않는다 · 요약 읽개가 이름째 격리한다)은 줄 글의 끝이라
   * 격리 없이도 그 줄의 타입 · 별칭과 이웃 줄을 안 뒤집는다 — 그 둘은 원래 성질을 잠근다.
   */
  it('줄의 별칭 · 요약은 방향을 격리한다 — 괄호가 안 닫힌 RTL 별칭과 RTL 요약이 섞이지 않고, 방향 제어 글자가 든 요약은 그 줄 · 이웃 줄의 다른 글을 안 뒤집는다', async () => {
    const { P } = await fixture('f2-bidi', [
      { id: 'n_rtl000000001', type: 'Button', alias: 'زر الحفظ (رئيسي', props: { label: 'حفظ' } },
      { id: 'n_rlo000000001', type: 'Card', alias: '카드', props: { title: '가\u202e나다' } },
      { id: 'n_next00000001', type: 'Button', props: { label: '저장' } },
    ])
    const a = await openEditor(P, 'alice')
    try {
      const rtl = piecesInOrder(await glyphs(a.page, 'n_rtl000000001'), ['Button', '(', 'زر الحفظ (رئيسي', ')', 'حفظ'])
      const rlo = piecesInOrder(await glyphs(a.page, 'n_rlo000000001'), ['Card', '(', '카드', ')', '가'])
      const next = piecesInOrder(await glyphs(a.page, 'n_next00000001'), ['Button', '저', '장'])
      // 판 카나리아 — 줄 글이 논리 차례 그대로 그려졌다(조각을 다 찾았다).
      expect([rtl.text, rlo.text, next.text]).toEqual([
        'Button (زر الحفظ (رئيسي) حفظ',
        'Card (카드) \u2068가\u202e나다\u2069',
        'Button 저장',
      ])
      expect({ rtl, rlo: rlo.inOrder, next: next.inOrder }).toEqual({ rtl: { ...rtl, inOrder: true }, rlo: true, next: true })
    } finally {
      await a.close()
    }
  })

  it('좁은 창(700) — 긴 별칭 · 긴 요약이 트리 칸 안에서 한 줄로 잘린다', async () => {
    const { P } = await fixture('f2-narrow', [
      { id: 'n_long00000001', type: 'Button', alias: LONG_ALIAS, props: { label: '아주 긴 라벨 '.repeat(6).trim() } },
      { id: 'n_text00000001', type: 'Text', alias: '안내 문단', props: { content: '긴 본문 글 '.repeat(10).trim() } },
      {
        id: 'n_tabs00000001',
        type: 'CheckboxGroup',
        props: { options: ['개요', '상세', '이력', '설정'].map((label) => ({ label, selected: true })) },
      },
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
        expect({ id: row.id, withinRegion: row.withinRegion, lines: row.lines, clipped: row.clipped }).toEqual({
          id: row.id,
          withinRegion: true,
          lines: 1,
          clipped: true,
        })
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
      for (const tab of ['컴포넌트', '상호작용', '코멘트']) {
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
      expect(past).toEqual({ 컴포넌트: [], 상호작용: [], 코멘트: [] })
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
