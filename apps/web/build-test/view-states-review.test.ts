/**
 * **K2 리뷰가 찾은 판을 실브라우저로 잠근다**(`docs/superpowers/plans/2026-10-06-k2-review.md` — H1 · H2 · H3 · L1 ~ L4). 판정 함수는 jsdom ·
 * 오라클이 잰다(`test/edit/view-state-edit.test.ts` · `test/edit/view-state-fork-oracle.test.ts`) — 여기는 화면의 입구가 그 판정에 닿는지다.
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | H1 끌어 놓기 · 여럿 Delete · 사각형 + Delete · 여럿 Cmd+D | 앞 형제를 민 뒤 흐린 가지 안을 고치는 묶음이 나가 기본 가지가 바뀐다 · 까닭을 안 말한다 |
 * | H2 고른 채 · 속성 칸 · 트리 이름 입력 · F2 · 일괄 속성 | 남이 가지를 먼저 만든 뒤 숨은 노드가 고른 것에 남는다 · 친 글이 숨은 기본 가지에 쓰인다 · 버린 초안을 말하지 않는다 |
 * | H2 의 예외 | «모든 가지 보기»를 켜고 고른 안 보이는 가지의 편집을 막는다 |
 * | H3 풀기 확인 · 같은 수 다른 id | 연 뒤 남이 만든 가지 · 바꾼 노드를 보이지 않고 지운다 · 바뀐 목록의 첫 누름이 보낸다 · 지운 것이 보인 것과 다르다 |
 * | L1 · L3 가지 줄의 Cmd+D · 붙여넣기 | 편집이 나간다 · 까닭이 자리 규칙의 문장이 아니다 |
 * | L2 흐린 영역 풀기 | 풀리지 않는다(엉뚱한 까닭으로 거절) |
 * | L4 숨은 가지의 잠금 | 꺼진 영역 줄에 까닭이 없다 |
 *
 * **못 재는 것:** H2 의 속성 칸 · 일괄 속성은 두 겹이 막는다 — 초안을 쓸 노드에서 안 보이는 노드를 거르는 것(`src/panels/property-panel.tsx` 의
 * `useLeftoverCommit`)과 안 보이는 가지를 고치는 편집을 판정이 거절하는 것(`src/edit/view-state-fork.ts` 의 `HIDDEN_REFUSED` — 거절된 초안은 같은
 * «쓰지 않았습니다»로 끝난다). 한 겹씩 떼면 초록이고 둘 다 떼야 빨강이다 — 판정 겹은 `test/edit/view-state-edit.test.ts` 가 혼자 잰다. 풀기 확인의
 * «누를 때 한 번 더 견줌»은 렌더 중 견줌이 먼저 다시 세워 떼도 초록이다(상태 삭제 확인과 같은 처지 — `src/shell/view-states-dialog.tsx` 의
 * `confirmRemove`).
 *
 * 남의 편집이 닿았는지는 alice 캔버스에 bob 의 글이 섰는지로 기다린다(판이 섰다) — 단언하는 값(고른 것 · 프레임 · 서버 기본 가지)은 그 뒤에 한 번 읽는다.
 * 거절 판의 «안 나갔다»는 서버 닿음을 2s 기다린 뒤 값으로 잰다(나갔으면 그 사이 닿는다).
 */
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DEFAULT_CASE_REMOVE_REASON } from '../src/edit/structure-actions'
import { HIDDEN_SELECTION_NOTICE } from '../src/shell/use-view-state'
import { canvasFrame, editorStackPrerequisite, poll, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

const ADMIN = { id: 's_admin', name: '관리자' }
const GUEST = { id: 's_guest', name: '손님' }
const text = (id: string, content: string) => ({ id, type: 'Text', props: { content } })

/** 앞 글 · 영역(기본 가지 글 셋 · 관리자 가지 — 손님 가지는 없다) · 뒤 글. */
const NODES = [
  text('n_pre', '앞 글'),
  {
    id: 'n_sw',
    type: 'StateSwitch',
    props: {},
    children: [
      {
        id: 'n_cd',
        type: 'StateCase',
        props: { state: 'default' },
        children: [text('n_dt', '기본 글'), text('n_dt2', '기본 둘'), text('n_dt3', '기본 셋')],
      },
      { id: 'n_ca', type: 'StateCase', props: { state: ADMIN.id }, children: [text('n_at', '관리자 글')] },
    ],
  },
  text('n_out', '뒤 글'),
]

/** 문장은 소스의 것을 글자로 싣는다(이 파일은 화면을 밖에서 본다 — 소스를 import 하지 않는다). */
const FORK_REFUSED = '이 상태의 가지가 없는 영역 안과 밖을 한 번에 고칠 수 없습니다 — 영역 안을 먼저 고쳐 이 상태의 가지를 만드세요'
const DROPPED_DRAFT = '바뀐 선택 때문에 친 값을 쓰지 않았습니다'
const CASE_SIDE = '가지 곁에는 노드를 둘 수 없습니다 — 상태 영역을 고르고 아래 추가하세요'

describe.skipIf(!전제.ok)('화면 상태 편집 — K2 리뷰 판(실브라우저)', () => {
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

  async function fixture(slug: string): Promise<string> {
    const project = (await call('POST', '/projects', { name: '화면 상태 리뷰', slug: `${slug}-${Date.now().toString(36)}` })).body
    const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '가' })).body
    const member = await call('POST', `/projects/${project.id}/members`, { email: stack.users.bob.email, role: 'editor' })
    if (member.status >= 300) throw new Error(`member ${member.status}`)
    const pageId = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '첫째' })).body.id as string
    const P = `/projects/${project.id}/pages/${pageId}`
    const seeded = await call('PATCH', `${P}/ops`, {
      baseSeq: 0,
      ops: [
        { op: 'add', path: '/viewStates', value: [ADMIN, GUEST] },
        ...NODES.map((value, at) => ({ op: 'add', path: `/root/children/${at}`, value })),
      ],
    })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
    return P
  }

  async function openTab(P: string, user: 'alice' | 'bob' = 'alice', viewport = { width: 1440, height: 900 }) {
    const { context, page } = await stack.openTab(stack.users[user], { viewport })
    const patches: string[] = []
    /** 받은 프레임 글 — 남의 편집이 닿았는지 본다. */
    const received: string[] = []
    page.on('websocket', (socket) => {
      socket.on('framesent', (frame) => {
        const payload = typeof frame.payload === 'string' ? frame.payload : frame.payload.toString()
        if (payload.includes('"type":"patch"')) patches.push(payload)
      })
      socket.on('framereceived', (frame) => {
        received.push(typeof frame.payload === 'string' ? frame.payload : frame.payload.toString())
      })
    })
    await page.goto(P)
    await canvasFrame(page).locator('[data-wb-id]').first().waitFor()
    return { page, patches, received, close: () => context.close() }
  }

  const frames = (page: Page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  const switcher = (page: Page) => page.getByRole('button', { name: /^화면 상태:/ })
  async function choose(page: Page, name: string): Promise<void> {
    await page.waitForTimeout(600)
    await switcher(page).click()
    await page.getByRole('menuitemradio', { name, exact: true }).click()
    await page.locator('[role="menu"]').waitFor({ state: 'detached' })
    await frames(page)
  }
  async function server(P: string): Promise<{ headSeq: number; root: { id: string; children?: unknown[] } }> {
    const body = (await call('GET', P)).body
    return { headSeq: body.headSeq as number, root: body.schema.root }
  }
  const findId = (node: { id: string; children?: unknown[] }, id: string): unknown =>
    node.id === id
      ? node
      : ((node.children ?? []) as { id: string; children?: unknown[] }[])
          .map((child) => findId(child, id))
          .find((found) => found !== undefined)
  const defaultBranch = async (P: string) => JSON.stringify(findId((await server(P)).root, 'n_cd'))
  const ids = async (P: string): Promise<string[]> => {
    const out: string[] = []
    const walk = (node: { id: string; children?: unknown[] }) => {
      out.push(node.id)
      for (const child of (node.children ?? []) as { id: string; children?: unknown[] }[]) walk(child)
    }
    walk((await server(P)).root)
    return out
  }
  /** 서버에 닿기를 기다린다 — 안 닿으면 `null`(거절 판). */
  const landed = (P: string, after: number, ms = 2_000) =>
    poll(
      '서버에 닿음',
      () => server(P),
      (value) => value.headSeq > after,
      ms,
    ).catch(() => null)
  const treeRow = (page: Page, id: string) => page.locator(`.wb-shell-region[aria-label="구조 트리"] [data-tree-row][data-tree-id="${id}"]`)
  const pickRow = (page: Page, id: string, add = false) =>
    treeRow(page, id)
      .locator('.wb-shell-structure-node')
      .click(add ? { modifiers: ['Meta'] } : undefined)
  const picked = (page: Page) =>
    page
      .locator(
        '.wb-shell-region[aria-label="구조 트리"] [aria-current="true"], .wb-shell-region[aria-label="구조 트리"] .wb-shell-structure-node-member',
      )
      .evaluateAll((els) => els.map((el) => el.closest('[data-tree-row]')?.getAttribute('data-tree-id') ?? ''))
  const notices = (page: Page) => page.locator('.wb-shell-footer [role="alert"], .wb-shell-footer [role="status"]').allTextContents()
  const panelText = (page: Page) => page.locator('.wb-shell-panel textarea').first()
  const allCases = async (page: Page) => {
    await page.locator('.wb-shell-region[aria-label="구조 트리"]').getByRole('button', { name: '모든 가지 보기', exact: true }).click()
    await frames(page)
  }
  const ops = (patches: readonly string[]) => patches.map((frame) => (JSON.parse(frame) as { ops: unknown[] }).ops)

  /** 손님 상태로 «앞 형제를 민 뒤 흐린 가지 안»을 고치는 입구 하나를 돌리고, 나간 프레임 · 기본 가지 · 하단 바를 낸다. */
  async function shiftedEntry(slug: string, act: (page: Page) => Promise<unknown>, canvasWidth?: string) {
    const P = await fixture(slug)
    const tab = await openTab(P)
    try {
      await choose(tab.page, GUEST.name)
      if (canvasWidth !== undefined) {
        await tab.page.getByLabel('뷰포트 폭').selectOption(canvasWidth)
        await frames(tab.page)
      }
      const before = await defaultBranch(P)
      const head = (await server(P)).headSeq
      const sent = tab.patches.length
      const canary = await act(tab.page)
      await landed(P, head)
      await frames(tab.page)
      return {
        canary,
        frames: ops(tab.patches.slice(sent)),
        defaultSame: before === (await defaultBranch(P)),
        notices: await notices(tab.page),
      }
    } finally {
      await tab.close()
    }
  }

  it('H1 끌어 놓기 — `n_pre` 를 흐린 `n_dt` 아래로 끌면 보내지 않고 까닭을 말한다 · 기본 가지 그대로', async () => {
    const result = await shiftedEntry('h1-drag', async (page) => {
      const from = (await treeRow(page, 'n_pre').locator('.wb-shell-structure-node').boundingBox())!
      const to = (await treeRow(page, 'n_dt').locator('.wb-shell-structure-node').boundingBox())!
      await page.mouse.move(from.x + 20, from.y + from.height / 2)
      await page.mouse.down()
      await page.mouse.move(from.x + 24, from.y + from.height / 2 + 8, { steps: 3 })
      await page.mouse.move(to.x + 20, to.y + to.height * 0.85, { steps: 8 })
      // 판 카나리아 — 놓기 표시가 섰다(끌기가 그 자리를 받았다).
      const indicator = await page.locator('.wb-shell-drop-indicator').count()
      await page.mouse.up()
      return { indicator }
    })
    expect(result).toEqual({ canary: { indicator: 1 }, frames: [], defaultSame: true, notices: [FORK_REFUSED] })
  })

  it('H1 여럿 Delete — `n_pre` · `n_dt` 를 함께 고른 Delete(고른 차례 둘)는 보내지 않고 까닭을 말한다', async () => {
    const run = (order: [string, string]) =>
      shiftedEntry(order[0] === 'n_pre' ? 'h1-del-a' : 'h1-del-b', async (page) => {
        await pickRow(page, order[0])
        await pickRow(page, order[1], true)
        const selection = (await picked(page)).sort()
        await page.keyboard.press('Delete')
        return { selection }
      })
    expect([await run(['n_pre', 'n_dt']), await run(['n_dt', 'n_pre'])]).toEqual([
      { canary: { selection: ['n_dt', 'n_pre'] }, frames: [], defaultSame: true, notices: [FORK_REFUSED] },
      { canary: { selection: ['n_dt', 'n_pre'] }, frames: [], defaultSame: true, notices: [FORK_REFUSED] },
    ])
  })

  it('H1 사각형 + Delete — 캔버스 사각형으로 `n_pre` ~ `n_dt` 를 고른 Delete 는 보내지 않고 까닭을 말한다', async () => {
    const result = await shiftedEntry(
      'h1-marquee',
      async (page) => {
        const a = (await canvasFrame(page).locator('[data-wb-id="n_pre"]').boundingBox())!
        const b = (await canvasFrame(page).locator('[data-wb-id="n_dt"]').boundingBox())!
        await page.mouse.move(a.x - 6, a.y - 3)
        await page.mouse.down()
        await page.mouse.move(b.x + b.width + 6, b.y + b.height + 3, { steps: 10 })
        await page.mouse.up()
        await frames(page)
        const selection = (await picked(page)).sort()
        await page.keyboard.press('Delete')
        return { selection }
      },
      '375',
    )
    expect(result).toEqual({ canary: { selection: ['n_dt', 'n_pre'] }, frames: [], defaultSame: true, notices: [FORK_REFUSED] })
  })

  it('H1 여럿 Cmd+D — `n_pre` · `n_dt` 를 함께 고른 복제는 보내지 않고 까닭을 말한다', async () => {
    const result = await shiftedEntry('h1-dup', async (page) => {
      await pickRow(page, 'n_pre')
      await pickRow(page, 'n_dt', true)
      const selection = (await picked(page)).sort()
      await page.keyboard.press('Meta+d')
      return { selection }
    })
    expect(result).toEqual({ canary: { selection: ['n_dt', 'n_pre'] }, frames: [], defaultSame: true, notices: [FORK_REFUSED] })
  })

  it('H1 여럿 일괄 속성 — `n_pre` · `n_dt` 를 함께 고른 속성 칸의 글은 보내지 않고 까닭을 말한다 · 기본 가지 그대로', async () => {
    const result = await shiftedEntry('h1-bulk', async (page) => {
      await pickRow(page, 'n_pre')
      await pickRow(page, 'n_dt', true)
      const selection = (await picked(page)).sort()
      const box = panelText(page)
      await box.click()
      await box.fill('일괄 고침')
      await box.evaluate((element) => (element as HTMLElement).blur())
      return { selection, boxes: await panelText(page).count() }
    })
    expect(result).toEqual({ canary: { selection: ['n_dt', 'n_pre'], boxes: 1 }, frames: [], defaultSame: true, notices: [FORK_REFUSED] })
  })

  /**
   * H2 판 — alice(손님)가 흐린 노드를 고르고 `during` 을 한 채, bob(손님)이 흐린 `n_dt3` 를 고쳐 손님 가지를 먼저 만든다. bob 의 글이 alice 캔버스에
   * 서면(판이 섰다) `after` 를 하고 값을 읽는다.
   */
  async function hiddenAfterFork(
    slug: string,
    pick: string[],
    during: (page: Page) => Promise<void>,
    after: (page: Page) => Promise<void> = async () => {},
  ) {
    const P = await fixture(slug)
    const a = await openTab(P)
    const b = await openTab(P, 'bob')
    try {
      await choose(a.page, GUEST.name)
      await pickRow(a.page, pick[0]!)
      for (const more of pick.slice(1)) await pickRow(a.page, more, true)
      await during(a.page)
      const before = await defaultBranch(P)
      await choose(b.page, GUEST.name)
      await pickRow(b.page, 'n_dt3')
      const head = (await server(P)).headSeq
      const box = panelText(b.page)
      await box.click()
      await box.fill('밥 손님')
      await box.evaluate((element) => (element as HTMLElement).blur())
      const forked = await landed(P, head)
      // 판이 섰다 — bob 의 손님 가지가 alice 캔버스에 선다.
      await canvasFrame(a.page).getByText('밥 손님').waitFor()
      const sent = a.patches.length
      await after(a.page)
      await landed(P, (await server(P)).headSeq)
      await frames(a.page)
      return {
        forked: forked !== null,
        picked: await picked(a.page),
        panel: (await a.page.locator('.wb-shell-panel').first().textContent())?.includes('노드를 고르면 속성이 보입니다') ?? false,
        frames: ops(a.patches.slice(sent)),
        defaultSame: before === (await defaultBranch(P)),
        notices: await notices(a.page),
        aliasInput: await a.page.locator('.wb-shell-tree-input').count(),
      }
    } finally {
      await a.close()
      await b.close()
    }
  }

  it('H2 고른 채 — 남이 가지를 먼저 만들어 고른 흐린 노드가 숨으면 고른 것에서 빠지고 속성 패널이 빈다', async () => {
    const result = await hiddenAfterFork('h2-pick', ['n_dt'], async () => {})
    expect(result).toEqual({
      forked: true,
      picked: [],
      panel: true,
      frames: [],
      defaultSame: true,
      notices: [HIDDEN_SELECTION_NOTICE],
      aliasInput: 0,
    })
  })

  it('H2 속성 칸 친 중 — 친 글은 숨은 노드에 안 쓰고 떠남을 말한다', async () => {
    const result = await hiddenAfterFork(
      'h2-prop',
      ['n_dt'],
      async (page) => {
        await panelText(page).click()
        await panelText(page).fill('앨리스 초안')
      },
      // 칸이 남아 있으면 떠난다 — 빠졌으면 할 것이 없다.
      async (page) => {
        if ((await panelText(page).count()) > 0) await panelText(page).evaluate((element) => (element as HTMLElement).blur())
      },
    )
    expect(result).toEqual({
      forked: true,
      picked: [],
      panel: true,
      frames: [],
      defaultSame: true,
      notices: [DROPPED_DRAFT, HIDDEN_SELECTION_NOTICE],
      aliasInput: 0,
    })
  })

  it('H2 트리 이름 입력 중 · F2 중 — 입력이 닫히고 친 별칭을 안 쓰며 떠남을 말한다 · «모든 가지 보기»를 켜도 묻지 않은 입력이 안 선다', async () => {
    const typeAlias = (open: (page: Page) => Promise<void>) => async (page: Page) => {
      await open(page)
      await page.locator('.wb-shell-tree-input').fill('앨리스 별칭')
    }
    const showAll = async (page: Page) => {
      await allCases(page)
    }
    const dbl = await hiddenAfterFork(
      'h2-alias-dbl',
      ['n_dt'],
      typeAlias((page) => treeRow(page, 'n_dt').locator('.wb-shell-structure-node').dblclick()),
      showAll,
    )
    const f2 = await hiddenAfterFork(
      'h2-alias-f2',
      ['n_dt'],
      typeAlias((page) => page.keyboard.press('F2')),
      showAll,
    )
    expect([dbl, f2]).toEqual([
      {
        forked: true,
        picked: [],
        panel: true,
        frames: [],
        defaultSame: true,
        notices: [DROPPED_DRAFT, HIDDEN_SELECTION_NOTICE],
        aliasInput: 0,
      },
      {
        forked: true,
        picked: [],
        panel: true,
        frames: [],
        defaultSame: true,
        notices: [DROPPED_DRAFT, HIDDEN_SELECTION_NOTICE],
        aliasInput: 0,
      },
    ])
  })

  it('H2 일괄 속성 중 — 여럿을 고른 칸에 친 글을 숨은 노드들에 안 쓴다', async () => {
    const result = await hiddenAfterFork(
      'h2-bulk',
      ['n_dt', 'n_dt2'],
      async (page) => {
        await panelText(page).click()
        await panelText(page).fill('앨리스 일괄')
      },
      async (page) => {
        if ((await panelText(page).count()) > 0) await panelText(page).evaluate((element) => (element as HTMLElement).blur())
      },
    )
    expect(result).toEqual({
      forked: true,
      picked: [],
      panel: true,
      frames: [],
      defaultSame: true,
      notices: [DROPPED_DRAFT, HIDDEN_SELECTION_NOTICE],
      aliasInput: 0,
    })
  })

  /**
   * H3 — 남의 편집은 같은 사람의 다른 탭(REST)으로 낸다. alice 가 영역을 고르면 그 서브트리를 쥐어 bob 의 편집은 alice 의 잠금이 TTL 로 풀린 뒤에야
   * 닿는다 — 상자를 연 채 겹치는 판이 아니다. 같은 사람의 쓰기는 제 잠금에 안 막힌다.
   */
  it('H3 풀기 확인 — 연 뒤 다른 탭이 그 영역에 가지를 만들면 새 목록으로 다시 서고, 첫 누름은 안 보내며, 지운 것 = 보인 것', async () => {
    const P = await fixture('h3')
    const a = await openTab(P)
    try {
      await pickRow(a.page, 'n_sw')
      await a.page.waitForTimeout(600)
      await treeRow(a.page, 'n_sw')
        .getByRole('button', { name: /더 보기$/ })
        .click()
      await a.page.getByRole('menuitem', { name: '상태 나누기 풀기', exact: true }).click()
      const box = a.page.getByRole('dialog')
      // 상자가 닫혔으면(누름이 보냈다) 그렇다고 값으로 낸다 — 없는 요소를 기다리면 시간 초과로 죽는다.
      const look = async () =>
        (await box.count()) === 0
          ? { gone: true }
          : {
              sentence: (await box.locator('.wb-shell-view-states-sentence').textContent()) ?? '',
              ids: (
                await box.locator('[data-node-id]').evaluateAll((els) => els.map((el) => el.getAttribute('data-node-id') ?? ''))
              ).sort(),
              changed: await box.locator('.wb-shell-view-states-changed').count(),
              button: (await box.locator('.wb-shell-view-states-danger').textContent()) ?? '',
            }
      const opened = await look()
      let head = (await server(P)).headSeq
      const other = await call('PATCH', `${P}/ops`, {
        baseSeq: head,
        ops: [
          {
            op: 'add',
            path: '/root/children/1/children/-',
            value: { id: 'n_cg', type: 'StateCase', props: { state: GUEST.id }, children: [text('n_gt', '손님 글')] },
          },
        ],
      })
      // 판이 섰다 — 다른 탭의 편집이 서버에 들고(200) 그 프레임이 alice 탭에 닿았다.
      await poll(
        'alice 에 닿음',
        async () => a.received.some((frame) => frame.includes('n_cg')),
        (value) => value,
        5_000,
      )
      await frames(a.page)
      const reopened = await look()
      const sent = a.patches.length
      head = (await server(P)).headSeq
      await box.locator('.wb-shell-view-states-danger').click()
      await landed(P, head, 1_000)
      const firstPress = { frames: a.patches.length - sent, after: await look() }
      if ('gone' in firstPress.after) {
        expect({ opened, reopened, firstPress }).toEqual({ firstPress: { frames: 0, after: { button: '풀기' } } })
        return
      }
      const before = await ids(P)
      await a.page.waitForTimeout(600)
      await box.locator('.wb-shell-view-states-danger').click()
      await landed(P, head)
      const after = await ids(P)
      expect({
        other: other.status,
        opened,
        reopened,
        firstPress: { frames: firstPress.frames, button: firstPress.after.button },
        // 지운 것 = 영역 · 가지 셋(보인 목록에 없다) + 보인 노드.
        gone: before.filter((id) => !after.includes(id)).sort(),
      }).toEqual({
        other: 200,
        opened: { sentence: '기본 가지만 남기고 가지 1개(관리자)의 내용이 함께 삭제됩니다.', ids: ['n_at'], changed: 0, button: '풀기' },
        reopened: {
          sentence: '기본 가지만 남기고 가지 2개(관리자 · 손님)의 내용이 함께 삭제됩니다.',
          ids: ['n_at', 'n_gt'],
          changed: 1,
          button: '새 목록 확인',
        },
        firstPress: { frames: 0, button: '풀기' },
        gone: ['n_at', 'n_ca', 'n_cd', 'n_cg', 'n_gt', 'n_sw'],
      })
    } finally {
      await a.close()
    }
  })

  it('H3 풀기 확인 — 가지는 같고 그 안 노드만 바뀌어도(같은 수 · 다른 id) 새 목록으로 다시 선다', async () => {
    const P = await fixture('h3-nodes')
    const a = await openTab(P)
    try {
      await pickRow(a.page, 'n_sw')
      await a.page.waitForTimeout(600)
      await treeRow(a.page, 'n_sw')
        .getByRole('button', { name: /더 보기$/ })
        .click()
      await a.page.getByRole('menuitem', { name: '상태 나누기 풀기', exact: true }).click()
      const box = a.page.getByRole('dialog')
      const head = (await server(P)).headSeq
      const other = await call('PATCH', `${P}/ops`, {
        baseSeq: head,
        ops: [
          { op: 'remove', path: '/root/children/1/children/1/children/0' },
          { op: 'add', path: '/root/children/1/children/1/children/0', value: text('n_at2', '관리자 새 글') },
        ],
      })
      await poll(
        'alice 에 닿음',
        async () => a.received.some((frame) => frame.includes('n_at2')),
        (value) => value,
        5_000,
      )
      await frames(a.page)
      expect({
        other: other.status,
        ids: await box.locator('[data-node-id]').evaluateAll((els) => els.map((el) => el.getAttribute('data-node-id') ?? '')),
        changed: await box.locator('.wb-shell-view-states-changed').count(),
        button: await box.locator('.wb-shell-view-states-danger').textContent(),
      }).toEqual({ other: 200, ids: ['n_at2'], changed: 1, button: '새 목록 확인' })
    } finally {
      await a.close()
    }
  })

  it('H2 의 예외 — «모든 가지 보기»를 켜면 기본 상태에서 안 보이는 관리자 가지 안도 고친다(평범한 편집)', async () => {
    const P = await fixture('h2-all')
    const tab = await openTab(P)
    try {
      await allCases(tab.page)
      await pickRow(tab.page, 'n_at')
      const head = (await server(P)).headSeq
      const sent = tab.patches.length
      const box = panelText(tab.page)
      await box.click()
      await box.fill('관리자 고침')
      await box.evaluate((element) => (element as HTMLElement).blur())
      await landed(P, head)
      expect({
        frames: ops(tab.patches.slice(sent)),
        text: (findId((await server(P)).root, 'n_at') as { props: { content: string } }).props.content,
        notices: await notices(tab.page),
      }).toEqual({
        frames: [[{ op: 'replace', path: '/root/children/1/children/1/children/0/props/content', value: '관리자 고침' }]],
        text: '관리자 고침',
        notices: [],
      })
    } finally {
      await tab.close()
    }
  })

  /** 기본 상태 · «모든 가지 보기»로 한 판을 돌리고 나간 프레임 · 하단 바를 낸다. */
  async function caseRow(slug: string, act: (page: Page) => Promise<void>) {
    const P = await fixture(slug)
    const tab = await openTab(P)
    try {
      const head = (await server(P)).headSeq
      await act(tab.page)
      await landed(P, head)
      await frames(tab.page)
      return { frames: ops(tab.patches), headSame: (await server(P)).headSeq === head, notices: await notices(tab.page) }
    } finally {
      await tab.close()
    }
  }

  it('L1 · L3 가지 줄의 Cmd+D · 붙여넣기 — 보내지 않고 자리 규칙의 까닭을 말한다', async () => {
    const duplicate = await caseRow('l1', async (page) => {
      await allCases(page)
      await pickRow(page, 'n_ca')
      await page.keyboard.press('Meta+d')
    })
    const paste = await caseRow('l3', async (page) => {
      await canvasFrame(page).locator('[data-wb-id="n_out"]').click()
      await page.keyboard.press('ControlOrMeta+c')
      await allCases(page)
      await pickRow(page, 'n_ca')
      await page.keyboard.press('ControlOrMeta+v')
    })
    expect([duplicate, paste]).toEqual([
      { frames: [], headSame: true, notices: [CASE_SIDE] },
      { frames: [], headSame: true, notices: [CASE_SIDE] },
    ])
  })

  it('L1 가지 줄의 Cmd+X · Delete — 기본 가지는 둘 다 말없이 안 보낸다(까닭은 꺼진 삭제 항목이 단다) · 다른 가지는 그 가지만 지운다(목록은 그대로)', async () => {
    const base = await caseRow('l1-cut-d', async (page) => {
      await allCases(page)
      await pickRow(page, 'n_cd')
      await page.keyboard.press('Meta+x')
    })
    const other = await caseRow('l1-cut-a', async (page) => {
      await allCases(page)
      await pickRow(page, 'n_ca')
      await page.keyboard.press('Meta+x')
    })
    const baseDelete = await caseRow('l1-del-d', async (page) => {
      await allCases(page)
      await pickRow(page, 'n_cd')
      await page.keyboard.press('Delete')
    })
    expect([base, baseDelete, other]).toEqual([
      // 기본 가지의 Cmd+X · Delete 는 이제 자리 규칙의 까닭을 정보 통지가 말한다(L-078).
      { frames: [], headSame: true, notices: [DEFAULT_CASE_REMOVE_REASON] },
      { frames: [], headSame: true, notices: [DEFAULT_CASE_REMOVE_REASON] },
      { frames: [[{ op: 'remove', path: '/root/children/1/children/1' }]], headSame: false, notices: [] },
    ])
  })

  it('L2 흐린 영역 풀기 — 손님 상태에서도 풀린다(기본 가지 내용이 그 자리에)', async () => {
    const P = await fixture('l2')
    const tab = await openTab(P)
    try {
      await choose(tab.page, GUEST.name)
      await pickRow(tab.page, 'n_sw')
      await tab.page.waitForTimeout(600)
      await treeRow(tab.page, 'n_sw')
        .getByRole('button', { name: /더 보기$/ })
        .click()
      await tab.page.getByRole('menuitem', { name: '상태 나누기 풀기', exact: true }).click()
      const head = (await server(P)).headSeq
      await tab.page.getByRole('dialog').locator('.wb-shell-view-states-danger').click()
      await landed(P, head)
      const root = (await server(P)).root as { children: { id: string }[] }
      expect({ children: root.children.map((child) => child.id), notices: await notices(tab.page) }).toEqual({
        children: ['n_pre', 'n_dt', 'n_dt2', 'n_dt3', 'n_out'],
        notices: [],
      })
    } finally {
      await tab.close()
    }
  })

  it('L4 숨은 가지의 잠금 — 꺼진 영역 줄에 «밥님이 이 영역의 다른 가지를 편집 중입니다» 까닭과 배지', async () => {
    const P = await fixture('l4')
    const a = await openTab(P)
    const b = await openTab(P, 'bob')
    try {
      await choose(b.page, ADMIN.name)
      await pickRow(b.page, 'n_at')
      // 판이 섰다 — alice 의 영역 줄이 꺼진다(잠금이 닿았다).
      await poll(
        '잠금이 닿음',
        () => treeRow(a.page, 'n_sw').locator('.wb-shell-structure-node').isDisabled(),
        (value) => value,
        5_000,
      )
      const row = treeRow(a.page, 'n_sw')
      expect({
        title: await row.locator('.wb-shell-structure-node').getAttribute('title'),
        badge: await a.page.locator('[data-tree-row][data-tree-id="n_sw"] ~ .wb-shell-structure-lock').allTextContents(),
      }).toEqual({ title: '밥님이 이 영역의 다른 가지를 편집 중입니다', badge: ['밥 편집 중 · 다른 가지'] })
    } finally {
      await a.close()
      await b.close()
    }
  })
})
