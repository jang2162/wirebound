/**
 * **화면 상태 편집을 실브라우저로 잰다**(설계서 「설계서 화면 구조」 «화면 상태» · `src/shell/use-view-state.ts` · `src/shell/view-state-switcher.tsx`).
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 전환 | 고른 상태의 가지가 캔버스 · 구조 트리에 안 선다 · 가지가 없는 상태에서 기본 가지가 안 선다 · «모든 가지 보기»가 가지를 다 안 편다 · 고르기가 편집을 낸다 |
 * | 페이지를 옮기면 | 옮겼다 돌아온 페이지가 앞서 고른 상태로 선다 |
 * | 창 900 | 접힌 머리의 `…` 항목으로 고르지 못한다 |
 * | 남이 상태를 지우면 | 지워진 상태를 고른 채 남아 캔버스가 아무 가지도 안 그리거나 머리가 지운 이름을 든다 |
 * | 상태 추가 · 관리 · 삭제 확인 | 이름 규칙을 어긴 이름을 보낸다 · 더한 상태를 안 고른다 · 확인의 가지 수 · 노드가 실제로 지운 id 집합과 다르다 · 되돌리기 한 번에 안 돌아온다 |
 * | 바뀐 목록 · 두 사람 | 확인을 연 뒤 바뀐 목록을 다시 안 세우거나 첫 누름에 보낸다 · 남의 노드 잠금이 목록 편집을 막는다 · 지울 가지 안 남의 잠금에 삭제가 켜져 있다 |
 * | 되돌리기 · 리베이스 | 남이 순서를 바꾼 뒤 «상태 추가» 되돌리기가 남의 상태를 뺀다 · 가지가 생긴 상태의 되돌리기가 상태 · 가지를 잃는다 |
 * | 나누기 · 풀기 · 가지 지우기 | 묶음 모양이 다르다 · 관리자 상태의 나누기가 그 가지를 안 만든다 · 이어지지 않은 형제에 켜져 있다 · 풀기가 안 묻는다 · 되돌리기 한 번에 안 돌아온다 |
 * | 흐린 가지 안 편집 | 기본 가지가 바뀐다 · 편집이 두 프레임이다 · 고른 것이 복사로 안 옮긴다 · 되돌리기 한 번에 가지째 안 빠진다 · 두 사람의 잠금이 그 노드에 안 걸린다 |
 * | 자리 규칙 | 영역의 «안에 추가» · 가지의 «아래 추가»가 켜져 있다 · 가지 줄을 영역 밖에 끌어 놓으면 옮긴다 |
 * | 표지 | 꼬리표 · 흐림이 상태와 다르다 · 상자가 보이는 가지의 자식 합에서 1px 넘게 어긋난다(줌 · 스크롤 · 남의 편집 뒤) · 문서 안에 표지가 들어간다 · 뷰 모드에 남는다 |
 *
 * **못 재는 것:** 표지 상자에 iframe 의 표면 안 자리를 더하는 셈(`src/canvas/canvas.tsx` 의 상태 영역 표지 이펙트 — `frameOffset`)을 떼도 «표지»는
 * 초록이다 — 판마다 iframe 이 표면 왼쪽 위에 서서 더할 값이 0 이다(배치 선 `./layout-guides.test.ts` 머리말과 같은 처지). 그 이펙트의 의존에서
 * 줌을 떼도 초록이다 — 상자가 iframe 문서 좌표라 줌에 안 바뀐다(배치 선과 같은 의존을 맞춰 둔 것이다).
 */
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canvasFrame, editorStackPrerequisite, poll, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

const ADMIN = { id: 's_admin', name: '관리자' }
const GUEST = { id: 's_guest', name: '손님' }

const text = (id: string, content: string) => ({ id, type: 'Text', props: { content } })

/** 영역 밖 글 하나 · 상태 영역 하나(기본 가지 · 관리자 가지 — 손님 가지는 없다). */
const NODES = [
  text('n_out', '영역 밖 글'),
  {
    id: 'n_sw',
    type: 'StateSwitch',
    props: {},
    children: [
      { id: 'n_cd', type: 'StateCase', props: { state: 'default' }, children: [text('n_dt', '기본 글')] },
      { id: 'n_ca', type: 'StateCase', props: { state: ADMIN.id }, children: [text('n_at', '관리자 글')] },
    ],
  },
]

describe.skipIf(!전제.ok)('화면 상태 편집 — 실브라우저', () => {
  let stack: EditorStack
  let alice: Session
  let bob: Session

  beforeAll(async () => {
    if (!전제.ok) return
    stack = await startEditorStack(전제)
    alice = await stack.login(stack.users.alice)
    bob = await stack.login(stack.users.bob)
  })

  afterAll(async () => {
    if (stack === undefined) return
    const { before, after } = await stack.close()
    expect(before.processes).toBeGreaterThan(0)
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  })

  const call = (m: string, p: string, b?: unknown) => stack.request(alice, m, p, b)

  /** 프로젝트 · 메뉴 · 페이지 둘(둘째는 빈 페이지). 첫 페이지에 상태 둘과 영역을 싣는다. bob 은 editor. */
  async function fixture(slug: string, extra: unknown[] = []): Promise<{ P: string; P2: string; pageId: string; page2Id: string }> {
    const project = (await call('POST', '/projects', { name: '화면 상태', slug: `${slug}-${Date.now().toString(36)}` })).body
    const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '가' })).body
    const member = await call('POST', `/projects/${project.id}/members`, { email: stack.users.bob.email, role: 'editor' })
    if (member.status >= 300) throw new Error(`member ${member.status}`)
    const pageId = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '첫째' })).body.id as string
    const page2Id = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '둘째' })).body.id as string
    const P = `/projects/${project.id}/pages/${pageId}`
    const seeded = await call('PATCH', `${P}/ops`, {
      baseSeq: 0,
      ops: [{ op: 'add', path: '/viewStates', value: [ADMIN, GUEST] }, ...[...NODES, ...extra].map((value, at) => ({ op: 'add', path: `/root/children/${at}`, value }))],
    })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
    return { P, P2: `/projects/${project.id}/pages/${page2Id}`, pageId, page2Id }
  }

  async function openTab(P: string, viewport = { width: 1440, height: 900 }, user: 'alice' | 'bob' = 'alice') {
    const { context, page } = await stack.openTab(stack.users[user], { viewport })
    const patches: string[] = []
    /** 받은 프레임의 종류(`page-changed` · `patch-ack` · `patch-error` …). */
    const received: string[] = []
    page.on('websocket', (socket) => {
      socket.on('framesent', (frame) => {
        const payload = typeof frame.payload === 'string' ? frame.payload : frame.payload.toString()
        if (payload.includes('"type":"patch"')) patches.push(payload)
      })
      socket.on('framereceived', (frame) => {
        const kind = /"type":"([a-z-]+)"/.exec(String(frame.payload))?.[1]
        if (kind !== undefined) received.push(kind)
      })
    })
    await page.goto(P)
    await canvasFrame(page).locator('[data-wb-id]').first().waitFor()
    return { page, patches, received, close: () => context.close() }
  }

  const switcher = (page: Page) => page.getByRole('button', { name: /^화면 상태:/ })
  /** 두 프레임 — 고른 뒤의 다시 그리기가 화면에 닿는다. */
  const frames = (page: Page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  /**
   * 머리 전환기로 고른다 — 메뉴가 닫힌 것(고른 판이 섰다)만 기다리고 두 프레임 뒤에 돌아온다. 고른 값이 화면에 섰는지는 기다리지 않는다
   * (그 값을 단언한다 — 기다림에 넣으면 그 값을 깨는 변조가 시간 초과로 죽는다).
   */
  async function choose(page: Page, name: string): Promise<void> {
    await switcher(page).click()
    await page.getByRole('menuitemradio', { name, exact: true }).click()
    await page.locator('[role="menu"]').waitFor({ state: 'detached' })
    await frames(page)
  }
  /** 캔버스에 선 노드 id · 구조 트리 줄 id — 둘 다 문서 차례이고 뿌리(서버가 짓는 id · 맨 앞)는 뺀다. */
  async function shown(page: Page): Promise<{ canvas: string[]; tree: string[]; head: string }> {
    const canvas = await canvasFrame(page).locator('[data-wb-id]').evaluateAll((els) => els.map((el) => el.getAttribute('data-wb-id') ?? ''))
    const tree = await page.locator('.wb-shell-region[aria-label="구조 트리"] [data-tree-row]').evaluateAll((els) => els.map((el) => el.getAttribute('data-tree-id') ?? ''))
    const head = (await switcher(page).getAttribute('aria-label')) ?? ''
    return { canvas: canvas.slice(1), tree: tree.slice(1), head }
  }

  it('전환 — 캔버스 · 구조 트리가 고른 상태의 가지를 보이고, 가지가 없는 상태는 기본 가지 · «모든 가지 보기»는 다 편다 · 편집은 안 나간다', async () => {
    const { P } = await fixture('vs-switch')
    const tab = await openTab(P)
    try {
      const seen: Record<string, unknown> = {}
      seen['처음'] = await shown(tab.page)
      await choose(tab.page, '관리자')
      seen['관리자'] = await shown(tab.page)
      await choose(tab.page, '손님')
      seen['손님'] = await shown(tab.page)
      const all = tab.page.getByRole('button', { name: '모든 가지 보기', exact: true })
      await all.click()
      await frames(tab.page)
      seen['모든 가지'] = { pressed: await all.getAttribute('aria-pressed'), tree: (await shown(tab.page)).tree }
      // 영역 줄의 요약은 보이는 가지가 하나여도 가지 전부를 센다.
      await all.click()
      await frames(tab.page)
      seen['영역 줄'] = await tab.page.locator('[data-tree-row][data-tree-id="n_sw"] .wb-shell-structure-node').textContent()
      // 뷰 모드의 전환기는 고르기만 — 상태 목록을 고치는 항목이 없다.
      await tab.page.getByRole('button', { name: '뷰 모드', exact: true }).click()
      await switcher(tab.page).click()
      seen['뷰 모드 항목'] = await tab.page.locator('[role="menu"] [role^="menuitem"]').allTextContents()
      await tab.page.keyboard.press('Escape')
      expect(seen).toEqual({
        처음: { canvas: ['n_out', 'n_dt'], tree: ['n_out', 'n_sw', 'n_cd', 'n_dt'], head: '화면 상태: 기본' },
        관리자: { canvas: ['n_out', 'n_at'], tree: ['n_out', 'n_sw', 'n_ca', 'n_at'], head: '화면 상태: 관리자' },
        손님: { canvas: ['n_out', 'n_dt'], tree: ['n_out', 'n_sw', 'n_cd', 'n_dt'], head: '화면 상태: 손님' },
        '모든 가지': { pressed: 'true', tree: ['n_out', 'n_sw', 'n_cd', 'n_dt', 'n_ca', 'n_at'] },
        '영역 줄': 'StateSwitch 가지 2',
        '뷰 모드 항목': ['기본', '관리자', '손님'],
      })
      expect(tab.patches).toEqual([])
    } finally {
      await tab.close()
    }
  })

  it('페이지를 옮겼다 돌아오면 기본이다', async () => {
    const { P, page2Id, pageId } = await fixture('vs-page')
    const tab = await openTab(P)
    try {
      await choose(tab.page, '관리자')
      // 페이지 줄의 줄 단추는 링크다 — 줄 상자의 첫 자식(`./action-menu-delete.test.ts` 와 같은 찾기).
      const menuRow = (id: string) => tab.page.locator(`.wb-shell-region[aria-label="메뉴·페이지 트리"] [data-tree-row][data-tree-id="${id}"] > :first-child`)
      await menuRow(page2Id).click()
      await tab.page.waitForURL(`**/pages/${page2Id}`)
      // 둘째 페이지(빈 페이지)가 캔버스에 선 뒤 — 첫 페이지의 노드가 걷혔다.
      await canvasFrame(tab.page).locator('[data-wb-id="n_out"]').waitFor({ state: 'detached' })
      const away = (await switcher(tab.page).getAttribute('aria-label')) ?? ''
      await menuRow(pageId).click()
      await canvasFrame(tab.page).locator('[data-wb-id="n_out"]').waitFor()
      await frames(tab.page)
      expect({ away, back: await shown(tab.page) }).toEqual({
        away: '화면 상태: 기본',
        back: { canvas: ['n_out', 'n_dt'], tree: ['n_out', 'n_sw', 'n_cd', 'n_dt'], head: '화면 상태: 기본' },
      })
    } finally {
      await tab.close()
    }
  })

  it('창 900 — 머리에 전환기가 없고 `…` 의 «화면 상태: 관리자»로 고른다', async () => {
    const { P } = await fixture('vs-tight')
    const tab = await openTab(P, { width: 900, height: 700 })
    try {
      const inHead = await switcher(tab.page).count()
      const menu = tab.page.locator('.wb-shell-header').getByRole('button', { name: '더 보기', exact: true })
      await menu.click()
      const radios = await tab.page.getByRole('menuitemradio').allTextContents()
      // 항목이 없으면 누르지 않고 값으로 죽는다(누르기를 기다리면 시간 초과로 죽는다).
      let checked: string[] = []
      if (radios.includes('화면 상태: 관리자')) {
        await tab.page.getByRole('menuitemradio', { name: '화면 상태: 관리자', exact: true }).click()
        await tab.page.locator('[role="menu"]').waitFor({ state: 'detached' })
        await frames(tab.page)
        await tab.page.waitForTimeout(600)
        await menu.click()
        checked = await tab.page.getByRole('menuitemradio', { checked: true }).allTextContents()
      }
      const canvas = (await canvasFrame(tab.page).locator('[data-wb-id]').evaluateAll((els) => els.map((el) => el.getAttribute('data-wb-id') ?? ''))).slice(1)
      expect({ inHead, radios, checked, canvas }).toEqual({
        inHead: 0,
        radios: ['화면 상태: 기본', '화면 상태: 관리자', '화면 상태: 손님'],
        checked: ['화면 상태: 관리자'],
        canvas: ['n_out', 'n_at'],
      })
    } finally {
      await tab.close()
    }
  })

  it('고른 상태를 남이 지우면 기본으로 선다 — 머리 · 캔버스 · 트리', async () => {
    const { P } = await fixture('vs-gone')
    const tab = await openTab(P)
    try {
      await choose(tab.page, '관리자')
      const before = await shown(tab.page)
      const head = (await stack.request(bob, 'GET', P)).body.headSeq as number
      // 상태 삭제는 가지째다(`removeViewStateOps` 의 꼴 — 가지 `remove` 뒤 목록 항목 `remove`).
      const removed = await stack.request(bob, 'PATCH', `${P}/ops`, {
        baseSeq: head,
        ops: [
          { op: 'remove', path: '/root/children/1/children/1' },
          { op: 'test', path: '/viewStates/0/id', value: ADMIN.id },
          { op: 'remove', path: '/viewStates/0' },
        ],
      })
      expect(removed.status).toBe(200)
      // 남의 편집이 닿은 것 — 지운 가지가 캔버스에서 걷혔다(재는 것은 그 뒤 선 가지와 머리다).
      await canvasFrame(tab.page).locator('[data-wb-id="n_at"]').waitFor({ state: 'detached' })
      await frames(tab.page)
      expect({ before, after: await shown(tab.page) }).toEqual({
        before: { canvas: ['n_out', 'n_at'], tree: ['n_out', 'n_sw', 'n_ca', 'n_at'], head: '화면 상태: 관리자' },
        after: { canvas: ['n_out', 'n_dt'], tree: ['n_out', 'n_sw', 'n_cd', 'n_dt'], head: '화면 상태: 기본' },
      })
    } finally {
      await tab.close()
    }
  })

  // ── Task 2 — 상태 관리 · 삭제 확인 ─────────────────────────────────────────────────

  /** 서버 문서 — 목록 · 노드 id 집합(뿌리 빼고) · 머리 번호. */
  async function server(P: string): Promise<{ states: string[]; ids: string[]; headSeq: number }> {
    const body = (await stack.request(alice, 'GET', P)).body
    const ids: string[] = []
    const walk = (node: { id: string; children?: unknown[] }, root: boolean): void => {
      if (!root) ids.push(node.id)
      for (const child of (node.children ?? []) as { id: string; children?: unknown[] }[]) walk(child, false)
    }
    walk(body.schema.root, true)
    return { states: ((body.schema.viewStates ?? []) as { name: string }[]).map((state) => state.name), ids, headSeq: body.headSeq as number }
  }
  /**
   * 서버 머리 번호가 `after` 를 넘을 때까지 — 보낸 편집이 닿았다는 것만 기다린다(재는 값은 그 뒤 `server`). 3s 안에 안 닿으면 던지지 않고
   * 돌아온다 — 안 보낸 판은 뒤의 단언이 서버 값으로 죽는다(시간 초과로 죽지 않게).
   */
  const landed = (P: string, after: number) => poll('서버에 닿음', () => server(P), (value) => value.headSeq > after, 3_000).catch(() => null)
  const dialog = (page: Page) => page.getByRole('dialog')
  /**
   * 전환기의 «상태 추가» · «상태 관리…»로 상자를 연다. 같은 자리의 메뉴 항목을 다시 누르는 판이라 앞 누름에서 `DOUBLE_CLICK_MS`(500ms)를 넘겨
   * 누른다(`src/shell/action-menu.tsx` — 포인터로 고른 뒤 같은 자리의 클릭 하나를 삼킨다).
   */
  async function openManage(page: Page, item: '상태 추가' | '상태 관리…'): Promise<void> {
    await page.waitForTimeout(600)
    await switcher(page).click()
    await page.getByRole('menuitem', { name: item, exact: true }).click()
    await dialog(page).waitFor()
  }
  const undo = (page: Page) => page.getByRole('button', { name: '되돌리기', exact: true }).click()
  /** 확인 상자의 모양 — 문장 · 함께 지워지는 노드 id · 확인 단추 글과 꺼짐 · 알림. */
  async function confirmShape(page: Page) {
    const box = dialog(page)
    // 상자가 닫혔으면(누름이 보냈다) 그렇다고 값으로 낸다 — 없는 요소를 기다리면 시간 초과로 죽는다.
    if ((await box.locator('.wb-shell-view-states-danger').count()) === 0) return { gone: true }
    return {
      sentence: (await box.locator('.wb-shell-view-states-sentence').textContent()) ?? '',
      ids: await box.locator('[data-node-id]').evaluateAll((els) => els.map((el) => el.getAttribute('data-node-id') ?? '')),
      button: (await box.locator('.wb-shell-view-states-danger').textContent()) ?? '',
      disabled: await box.locator('.wb-shell-view-states-danger').getAttribute('aria-disabled'),
      reason: await box.locator('.wb-shell-view-states-danger').getAttribute('title'),
      changed: await box.locator('.wb-shell-view-states-changed').count(),
    }
  }

  it('상태 추가 — 이름 규칙을 어기면 보내지 않고 까닭을 말하며, 더하면 그 상태를 고르고 · 되돌리기 한 번에 빠진다', async () => {
    const { P } = await fixture('vs-add')
    const tab = await openTab(P)
    try {
      const start = await server(P)
      await openManage(tab.page, '상태 추가')
      const field = dialog(tab.page).getByLabel('새 상태 이름')
      await field.fill('관리자')
      await dialog(tab.page).getByRole('button', { name: '추가' }).click()
      const duplicate = (await dialog(tab.page).locator('.wb-shell-view-states-problem').allTextContents()).join('')
      await field.fill('가'.repeat(31))
      await dialog(tab.page).getByRole('button', { name: '추가' }).click()
      const long = (await dialog(tab.page).locator('.wb-shell-view-states-problem').allTextContents()).join('')
      const refusedSent = tab.patches.length
      await field.fill('  직원  ')
      await dialog(tab.page).getByRole('button', { name: '추가' }).click()
      await landed(P, start.headSeq)
      await frames(tab.page)
      const added = { server: (await server(P)).states, head: await switcher(tab.page).getAttribute('aria-label'), dialogs: await dialog(tab.page).count() }
      const head = (await server(P)).headSeq
      await undo(tab.page)
      await landed(P, head)
      await frames(tab.page)
      expect({ duplicate, long, refusedSent, added, undone: (await server(P)).states, headAfterUndo: await switcher(tab.page).getAttribute('aria-label') }).toEqual({
        duplicate: '같은 이름의 상태가 있습니다',
        long: '이름은 30자까지입니다',
        refusedSent: 0,
        added: { server: ['관리자', '손님', '직원'], head: '화면 상태: 직원', dialogs: 0 },
        undone: ['관리자', '손님'],
        headAfterUndo: '화면 상태: 기본',
      })
    } finally {
      await tab.close()
    }
  })

  it('상태 관리 — 이름 바꾸기 · 순서 · 삭제(확인의 가지 수 · 노드 = 실제로 지운 id 집합) · 되돌리기 한 번에 상태와 가지가 돌아온다', async () => {
    const { P } = await fixture('vs-manage')
    const tab = await openTab(P)
    try {
      await openManage(tab.page, '상태 관리…')
      let head = (await server(P)).headSeq
      await dialog(tab.page).getByRole('button', { name: '손님 이름 바꾸기', exact: true }).click()
      await dialog(tab.page).getByLabel('손님 새 이름').fill('방문자')
      await dialog(tab.page).getByRole('button', { name: '저장', exact: true }).click()
      await landed(P, head)
      const renamed = (await server(P)).states
      head = (await server(P)).headSeq
      await dialog(tab.page).getByRole('button', { name: '방문자 위로', exact: true }).click()
      await landed(P, head)
      const moved = (await server(P)).states
      const before = await server(P)
      await dialog(tab.page).getByRole('button', { name: '관리자 삭제', exact: true }).click()
      const shape = await confirmShape(tab.page)
      await dialog(tab.page).locator('.wb-shell-view-states-danger').click()
      await landed(P, before.headSeq)
      const after = await server(P)
      const removed = before.ids.filter((id) => !after.ids.includes(id))
      await dialog(tab.page).getByRole('button', { name: '닫기' }).click()
      await undo(tab.page)
      await landed(P, after.headSeq)
      const restored = await server(P)
      expect({ renamed, moved, shape, removed, afterStates: after.states, restoredStates: restored.states, restoredIds: restored.ids }).toEqual({
        renamed: ['관리자', '방문자'],
        moved: ['방문자', '관리자'],
        shape: { sentence: '"관리자" 상태를 지웁니다. 가지 1개의 내용이 함께 삭제됩니다.', ids: ['n_at'], button: '삭제', disabled: null, reason: null, changed: 0 },
        removed: ['n_ca', 'n_at'],
        afterStates: ['방문자'],
        restoredStates: ['방문자', '관리자'],
        restoredIds: before.ids,
      })
    } finally {
      await tab.close()
    }
  })

  it('확인을 연 뒤 남이 그 상태로 가지를 더하면 상자가 새 목록으로 다시 서고, 첫 누름은 «새 목록 확인»이라 안 보낸다', async () => {
    const { P } = await fixture('vs-changed')
    const tab = await openTab(P)
    try {
      await openManage(tab.page, '상태 관리…')
      await dialog(tab.page).getByRole('button', { name: '손님 삭제', exact: true }).click()
      const opened = await confirmShape(tab.page)
      const head = (await server(P)).headSeq
      const added = await stack.request(bob, 'PATCH', `${P}/ops`, {
        baseSeq: head,
        ops: [{ op: 'add', path: '/root/children/1/children/2', value: { id: 'n_cg', type: 'StateCase', props: { state: GUEST.id }, children: [text('n_gt', '손님 글')] } }],
      })
      expect(added.status).toBe(200)
      // 남의 편집이 이 탭에 닿은 것 — 구조 트리의 영역 줄 요약이 «가지 3»이 된다(재는 것은 그 뒤 상자의 모양이다).
      await tab.page.locator('[data-tree-row][data-tree-id="n_sw"] button', { hasText: '가지 3' }).first().waitFor({ state: 'attached' })
      await frames(tab.page)
      const changed = await confirmShape(tab.page)
      const sentBefore = tab.patches.length
      await dialog(tab.page).locator('.wb-shell-view-states-danger').click()
      await frames(tab.page)
      const afterFirst = { sent: tab.patches.length - sentBefore, button: ((await confirmShape(tab.page)) as { button?: string }).button }
      await tab.page.waitForTimeout(600)
      const beforeSecond = await server(P)
      // 첫 누름이 보냈으면(상자가 닫힘) 둘째는 없다 — 값(`afterFirst`)으로 죽는다.
      if ((await dialog(tab.page).locator('.wb-shell-view-states-danger').count()) > 0) await dialog(tab.page).locator('.wb-shell-view-states-danger').click()
      await landed(P, beforeSecond.headSeq)
      const after = await server(P)
      expect({ opened, changed, afterFirst, removed: beforeSecond.ids.filter((id) => !after.ids.includes(id)), states: after.states }).toEqual({
        opened: { sentence: '"손님" 상태를 지웁니다. 이 상태의 가지는 없습니다.', ids: [], button: '삭제', disabled: null, reason: null, changed: 0 },
        changed: { sentence: '"손님" 상태를 지웁니다. 가지 1개의 내용이 함께 삭제됩니다.', ids: ['n_gt'], button: '새 목록 확인', disabled: null, reason: null, changed: 1 },
        afterFirst: { sent: 0, button: '삭제' },
        removed: ['n_cg', 'n_gt'],
        states: ['관리자'],
      })
    } finally {
      await tab.close()
    }
  })

  it('두 사람 — bob 이 페이지 안 노드를 잡아도 상태 추가 · 이름 바꾸기는 막히지 않고, 지울 가지 안 노드를 잡으면 삭제가 꺼지고 까닭을 단다', async () => {
    const { P } = await fixture('vs-two')
    const tab = await openTab(P)
    const other = await openTab(P, { width: 1440, height: 900 }, 'bob')
    const bobName = stack.users.bob.name
    try {
      // 배지는 줄 상자의 형제다(`src/panels/structure-tree.tsx` 의 «편집 중» 배지).
      const badge = (page: Page, id: string) => page.locator(`[data-tree-row][data-tree-id="${id}"] ~ .wb-shell-structure-lock`)
      // bob 이 영역 밖 글을 고른다(잠금) — alice 의 트리에 배지가 서면 잠금이 닿은 것이다.
      await other.page.locator('[data-tree-row][data-tree-id="n_out"] button').first().click()
      await badge(tab.page, 'n_out').waitFor()
      let head = (await server(P)).headSeq
      await openManage(tab.page, '상태 추가')
      await dialog(tab.page).getByLabel('새 상태 이름').fill('직원')
      await dialog(tab.page).getByRole('button', { name: '추가' }).click()
      await landed(P, head)
      const added = (await server(P)).states
      head = (await server(P)).headSeq
      await openManage(tab.page, '상태 관리…')
      await dialog(tab.page).getByRole('button', { name: '손님 이름 바꾸기', exact: true }).click()
      await dialog(tab.page).getByLabel('손님 새 이름').fill('방문자')
      await dialog(tab.page).getByRole('button', { name: '저장', exact: true }).click()
      await landed(P, head)
      const renamed = (await server(P)).states
      await dialog(tab.page).getByRole('button', { name: '닫기' }).click()
      // bob 이 관리자 가지 안 글을 잡는다 — alice 도 관리자를 보아 그 줄의 배지를 기다린다.
      await choose(other.page, '관리자')
      await other.page.locator('[data-tree-row][data-tree-id="n_at"] button').first().click()
      await choose(tab.page, '관리자')
      await badge(tab.page, 'n_at').waitFor()
      await openManage(tab.page, '상태 관리…')
      await dialog(tab.page).getByRole('button', { name: '관리자 삭제', exact: true }).click()
      const blocked = await confirmShape(tab.page)
      const sent = tab.patches.length
      const beforeClick = (await server(P)).headSeq
      // 꺼진 단추(`aria-disabled`)도 누름은 받는다 — playwright 는 그것을 «안 켜짐»으로 기다리므로 힘으로 누른다.
      await dialog(tab.page).locator('.wb-shell-view-states-danger').click({ force: true })
      await tab.page.waitForTimeout(600)
      expect({ added, renamed, blocked, sentOnClick: tab.patches.length - sent, headSame: (await server(P)).headSeq === beforeClick }).toEqual({
        added: ['관리자', '손님', '직원'],
        renamed: ['관리자', '방문자', '직원'],
        blocked: {
          sentence: '"관리자" 상태를 지웁니다. 가지 1개의 내용이 함께 삭제됩니다.',
          ids: ['n_at'],
          button: '삭제',
          disabled: 'true',
          reason: `${bobName}님이 편집 중인 노드가 있어 함께 지울 수 없습니다`,
          changed: 0,
        },
        sentOnClick: 0,
        headSame: true,
      })
    } finally {
      await tab.close()
      await other.close()
    }
  })

  /** 남의 편집(`page-changed`)이 이 탭에 닿을 때까지 — 받은 프레임의 수가 `after` 를 넘는다. */
  async function remoteArrived(received: string[], after: number): Promise<void> {
    await poll('남의 편집이 닿음', async () => received.filter((kind) => kind === 'page-changed').length, (count) => count > after)
  }

  it('남이 순서를 바꾼 뒤 «상태 추가» 되돌리기는 내가 더한 상태만 뺀다 — 남의 상태를 안 뺀다(K1 R1 의 화면 몫)', async () => {
    const { P } = await fixture('vs-undo-moved')
    const tab = await openTab(P)
    try {
      const start = await server(P)
      await openManage(tab.page, '상태 추가')
      await dialog(tab.page).getByLabel('새 상태 이름').fill('직원')
      await dialog(tab.page).getByRole('button', { name: '추가' }).click()
      await landed(P, start.headSeq)
      const body = (await stack.request(bob, 'GET', P)).body
      const staff = (body.schema.viewStates as { id: string; name: string }[]).find((state) => state.name === '직원')!
      const seen = tab.received.filter((kind) => kind === 'page-changed').length
      const moved = await stack.request(bob, 'PATCH', `${P}/ops`, {
        baseSeq: body.headSeq,
        ops: [
          { op: 'test', path: '/viewStates/2/id', value: staff.id },
          { op: 'move', from: '/viewStates/2', path: '/viewStates/0' },
        ],
      })
      expect(moved.status).toBe(200)
      await remoteArrived(tab.received, seen)
      const head = (await server(P)).headSeq
      await undo(tab.page)
      await landed(P, head)
      expect({ movedTo: (await server(P)).states }).toEqual({ movedTo: ['관리자', '손님'] })
    } finally {
      await tab.close()
    }
  })

  it('남이 그 상태로 가지를 만든 뒤의 «상태 추가» 되돌리기 — 서버가 422 로 막고 상태 · 가지가 남는다(K1 이월 11 — 화면의 말은 사람 문장)', async () => {
    const { P } = await fixture('vs-undo-cased')
    const tab = await openTab(P)
    try {
      const start = await server(P)
      await openManage(tab.page, '상태 추가')
      await dialog(tab.page).getByLabel('새 상태 이름').fill('직원')
      await dialog(tab.page).getByRole('button', { name: '추가' }).click()
      await landed(P, start.headSeq)
      const body = (await stack.request(bob, 'GET', P)).body
      const staff = (body.schema.viewStates as { id: string; name: string }[]).find((state) => state.name === '직원')!
      const seen = tab.received.filter((kind) => kind === 'page-changed').length
      const cased = await stack.request(bob, 'PATCH', `${P}/ops`, {
        baseSeq: body.headSeq,
        ops: [{ op: 'add', path: '/root/children/1/children/2', value: { id: 'n_cs', type: 'StateCase', props: { state: staff.id }, children: [text('n_st', '직원 글')] } }],
      })
      expect(cased.status).toBe(200)
      await remoteArrived(tab.received, seen)
      const before = await server(P)
      const errors = tab.received.filter((kind) => kind === 'patch-error').length
      await undo(tab.page)
      await poll('되돌리기의 답', async () => tab.received.filter((kind) => kind === 'patch-error').length, (count) => count > errors)
      await tab.page.waitForTimeout(800)
      const after = await server(P)
      const notices = await tab.page.locator('.wb-shell-footer [role="alert"], .wb-shell-footer [role="status"]').allTextContents()
      // 사람 문장이다 — 서버 이슈 문장의 상태 id(`s_…`)가 안 보인다(`api/failure.tsx` 의 `VIEW_STATE_SENTENCES`).
      const shotsDir = process.env['WB_SHOTS_DIR']
      if (shotsDir !== undefined) {
        for (const width of [1440, 900]) {
          await tab.page.setViewportSize({ width, height: width === 1440 ? 900 : 700 })
          await tab.page.waitForTimeout(400)
          await tab.page.screenshot({ path: `${shotsDir}/m1-state-cases-left-${width}.png` })
        }
      }
      expect({ states: after.states, ids: after.ids, headSame: after.headSeq === before.headSeq, notices }).toEqual({
        states: ['관리자', '손님', '직원'],
        ids: before.ids,
        headSame: true,
        notices: ['그 상태로 만든 가지가 남아 있어 목록에서만 뺄 수 없습니다 — 상태 관리에서 지우세요 — 페이지를 서버 상태로 다시 불러왔고, 되돌리기 · 다시 실행 1개가 취소됐습니다.'],
      })
    } finally {
      await tab.close()
    }
  })

  // ── Task 3 — 나누기 · 풀기 · 상태를 고른 채 편집 · 자리 규칙 ───────────────────────────────

  /** 서버 문서의 모양 — 뿌리 밑의 노드를 `{ id: 자식 }` 꼴로(뿌리 빼고 · 가지는 `id(state)`). */
  async function serverShape(P: string): Promise<unknown> {
    const body = (await stack.request(alice, 'GET', P)).body
    const shape = (node: { id: string; type: string; props?: { state?: string; content?: string }; children?: unknown[] }): unknown => {
      const name = node.type === 'StateCase' ? `${node.id}(${node.props?.state})` : node.type === 'Text' ? `${node.id}:${node.props?.content}` : node.id
      const kids = (node.children ?? []) as (typeof node)[]
      return kids.length === 0 ? name : { [name]: kids.map(shape) }
    }
    return ((body.schema.root.children ?? []) as Parameters<typeof shape>[0][]).map(shape)
  }
  const treeRow = (page: Page, id: string) => page.locator(`.wb-shell-region[aria-label="구조 트리"] [data-tree-row][data-tree-id="${id}"]`)
  const pickRow = (page: Page, id: string) => treeRow(page, id).locator('.wb-shell-structure-node').click()
  /** 고른 줄의 `…` · `+` 를 열어 항목을 읽는다 — 이름 · 꺼짐 · 까닭. */
  async function rowMenu(page: Page, id: string, which: '더 보기' | '추가'): Promise<{ label: string; disabled: boolean; reason: string | null }[]> {
    await page.waitForTimeout(600)
    await treeRow(page, id).getByRole('button', { name: new RegExp(`${which}$`) }).click()
    const items = await page.locator('[role="menu"] [role="menuitem"]').evaluateAll((els) =>
      els.map((el) => ({ label: el.textContent ?? '', disabled: el.getAttribute('aria-disabled') === 'true', reason: el.getAttribute('title') })),
    )
    return items
  }
  async function rowCommand(page: Page, id: string, label: string): Promise<void> {
    await page.waitForTimeout(600)
    await treeRow(page, id).getByRole('button', { name: /더 보기$/ }).click()
    await page.getByRole('menuitem', { name: label, exact: true }).click()
  }

  it('나누기 — 줄 `…` «상태별로 나누기»: 기본 상태면 기본 가지 하나, 관리자 상태면 관리자 가지도 복사로 · 되돌리기 한 번', async () => {
    const { P } = await fixture('vs-split')
    const tab = await openTab(P)
    try {
      const original = (await serverShape(P)) as unknown[]
      await pickRow(tab.page, 'n_out')
      let head = (await server(P)).headSeq
      await rowCommand(tab.page, 'n_out', '상태별로 나누기')
      await landed(P, head)
      const splitDefault = await serverShape(P)
      head = (await server(P)).headSeq
      await undo(tab.page)
      await landed(P, head)
      const undone = await serverShape(P)
      await choose(tab.page, '관리자')
      await pickRow(tab.page, 'n_out')
      head = (await server(P)).headSeq
      await rowCommand(tab.page, 'n_out', '상태별로 나누기')
      await landed(P, head)
      const splitAdmin = await serverShape(P)
      // 서버가 지은 새 id(`n_` + 12 hex)는 «NEW»로 — 모양만 견준다.
      const norm = (value: unknown) => JSON.parse(JSON.stringify(value).replace(/n_[0-9a-f]{12}/g, 'NEW'))
      expect({ splitDefault: norm(splitDefault), undone: JSON.stringify(undone) === JSON.stringify(original), splitAdmin: norm(splitAdmin) }).toEqual({
        splitDefault: [{ NEW: [{ 'NEW(default)': ['n_out:영역 밖 글'] }] }, original[1]],
        undone: true,
        splitAdmin: [{ NEW: [{ 'NEW(default)': ['n_out:영역 밖 글'] }, { [`NEW(${ADMIN.id})`]: ['NEW:영역 밖 글'] }] }, original[1]],
      })
    } finally {
      await tab.close()
    }
  })

  it('여럿을 고른 나누기 — 이어진 형제가 아니면 꺼지고 까닭을 단다', async () => {
    const { P } = await fixture('vs-split-many', [text('n_x', '셋째'), text('n_y', '넷째')])
    const tab = await openTab(P)
    try {
      await pickRow(tab.page, 'n_out')
      await treeRow(tab.page, 'n_x').locator('.wb-shell-structure-node').click({ modifiers: ['Meta'] })
      // 줄 행동은 기준 노드(마지막에 누른 줄)에 선다.
      const apart = (await rowMenu(tab.page, 'n_x', '더 보기')).find((item) => item.label === '상태별로 나누기')
      await tab.page.keyboard.press('Escape')
      await pickRow(tab.page, 'n_x')
      await treeRow(tab.page, 'n_y').locator('.wb-shell-structure-node').click({ modifiers: ['Meta'] })
      const together = (await rowMenu(tab.page, 'n_y', '더 보기')).find((item) => item.label === '상태별로 나누기')
      expect({ apart, together }).toEqual({
        apart: { label: '상태별로 나누기', disabled: true, reason: '같은 부모의 이어진 형제만 한 영역으로 나눌 수 있습니다' },
        together: { label: '상태별로 나누기', disabled: false, reason: null },
      })
    } finally {
      await tab.close()
    }
  })

  it('흐린 기본 가지 안을 고친 편집은 «복사 + 편집» 한 묶음 — 기본 가지는 그대로 · 고른 것은 복사로 · 되돌리기 한 번에 가지째 빠진다', async () => {
    const { P } = await fixture('vs-fork')
    const tab = await openTab(P)
    try {
      await choose(tab.page, '손님')
      await pickRow(tab.page, 'n_dt')
      const head = (await server(P)).headSeq
      const sent = tab.patches.length
      const box = tab.page.locator('.wb-shell-panel textarea').first()
      await box.click()
      await box.fill('손님 글')
      await box.evaluate((element) => (element as HTMLElement).blur())
      await landed(P, head)
      await frames(tab.page)
      const forked = await serverShape(P)
      const frames1 = tab.patches.length - sent
      const picked = (
        await tab.page.locator('.wb-shell-region[aria-label="구조 트리"] [aria-current="true"]').evaluateAll((els) => els.map((el) => el.closest('[data-tree-row]')?.getAttribute('data-tree-id') ?? ''))
      ).join(',')
      const canvas = (await shown(tab.page)).canvas
      // 칸을 떠나며 낸 «복사 + 편집» 뒤 위젯의 정리가 같은 초안을 한 번 더 넘긴다 — 복사 id 표(`forkedId` · `rememberFork`)가 그것을 복사로 돌려 «이미 그 값»으로 걸러야
      // 한다. 표가 없으면 옛 노드(이제 숨은 기본 가지)가 쓸 대상이 못 돼 «바뀐 선택 때문에 친 값을 쓰지 않았습니다» 가 거짓으로 선다(장부 L-075).
      const alerts = await tab.page.locator('.wb-shell-edit-alert').allTextContents()
      const after = await server(P)
      await undo(tab.page)
      await landed(P, after.headSeq)
      const undone = await serverShape(P)
      const sw = (forked as Record<string, unknown>[])[1] as Record<string, Record<string, string[]>[]>
      const guest = sw['n_sw']!.find((entry) => Object.keys(entry)[0]!.endsWith(`(${GUEST.id})`))
      const guestCase = guest === undefined ? null : Object.keys(guest)[0]!.replace(`(${GUEST.id})`, '')
      const guestText = guest === undefined ? null : Object.values(guest)[0]![0]!
      expect({
        frames: frames1,
        defaultBranch: sw['n_sw']!.filter((entry) => Object.keys(entry)[0] === 'n_cd(default)'),
        guestText: guestText?.replace(/^n_[0-9a-f]{12}:/, 'NEW:'),
        pickedIsCopy: picked !== 'n_dt' && guestText?.startsWith(`${picked}:`),
        canvasHasCopy: canvas.length === 2 && canvas[0] === 'n_out' && canvas[1] !== 'n_dt',
        undone: JSON.stringify(undone) === JSON.stringify([
          'n_out:영역 밖 글',
          { n_sw: [{ 'n_cd(default)': ['n_dt:기본 글'] }, { [`n_ca(${ADMIN.id})`]: ['n_at:관리자 글'] }] },
        ]),
        guestCaseNew: guestCase !== null && guestCase !== 'n_cd',
        alerts,
      }).toEqual({
        frames: 1,
        defaultBranch: [{ 'n_cd(default)': ['n_dt:기본 글'] }],
        guestText: 'NEW:손님 글',
        pickedIsCopy: true,
        canvasHasCopy: true,
        undone: true,
        guestCaseNew: true,
        alerts: [],
      })
    } finally {
      await tab.close()
    }
  })

  it('풀기 — 다른 가지가 있으면 확인(지워지는 가지 · 노드)을 묻고, 풀면 기본 가지 내용이 그 자리에 · 되돌리기 한 번', async () => {
    const { P } = await fixture('vs-unsplit')
    const tab = await openTab(P)
    try {
      const original = await serverShape(P)
      await pickRow(tab.page, 'n_sw')
      const head = (await server(P)).headSeq
      await rowCommand(tab.page, 'n_sw', '상태 나누기 풀기')
      await frames(tab.page)
      // 묻지 않고 풀었으면 상자가 없다 — 값(`asked: null`)으로 죽는다.
      const asked =
        (await dialog(tab.page).count()) === 0
          ? null
          : {
              title: await dialog(tab.page).getByRole('heading').first().textContent(),
              sentence: await dialog(tab.page).locator('.wb-shell-view-states-sentence').textContent(),
              ids: await dialog(tab.page).locator('[data-node-id]').evaluateAll((els) => els.map((el) => el.getAttribute('data-node-id'))),
            }
      if (asked !== null) await dialog(tab.page).getByRole('button', { name: '풀기', exact: true }).click()
      await landed(P, head)
      const unsplit = await serverShape(P)
      const after = (await server(P)).headSeq
      await undo(tab.page)
      await landed(P, after)
      expect({ asked, unsplit, undone: JSON.stringify(await serverShape(P)) === JSON.stringify(original) }).toEqual({
        asked: { title: '상태 나누기 풀기', sentence: '기본 가지만 남기고 가지 1개(관리자)의 내용이 함께 삭제됩니다.', ids: ['n_at'] },
        unsplit: ['n_out:영역 밖 글', 'n_dt:기본 글'],
        undone: true,
      })
    } finally {
      await tab.close()
    }
  })

  it('가지 줄 «이 상태 가지 지우기» — 그 가지만 지워 그 상태는 기본을 따라간다 · 기본 가지 줄에는 없고 «삭제»가 까닭과 함께 꺼진다', async () => {
    const { P } = await fixture('vs-remove-case')
    const tab = await openTab(P)
    try {
      await tab.page.getByRole('button', { name: '모든 가지 보기', exact: true }).click()
      await pickRow(tab.page, 'n_cd')
      const defaultRow = (await rowMenu(tab.page, 'n_cd', '더 보기')).filter((item) => ['이 상태 가지 지우기(기본으로 돌아감)', '삭제'].includes(item.label))
      await tab.page.keyboard.press('Escape')
      await pickRow(tab.page, 'n_ca')
      const head = (await server(P)).headSeq
      await rowCommand(tab.page, 'n_ca', '이 상태 가지 지우기(기본으로 돌아감)')
      await landed(P, head)
      expect({ defaultRow, after: await serverShape(P) }).toEqual({
        defaultRow: [{ label: '삭제', disabled: true, reason: '기본 가지는 지울 수 없습니다 — 영역째 지우거나 «상태 나누기 풀기»를 쓰세요' }],
        after: ['n_out:영역 밖 글', { n_sw: [{ 'n_cd(default)': ['n_dt:기본 글'] }] }],
      })
    } finally {
      await tab.close()
    }
  })

  it('영역 · 가지의 자리 규칙 — 영역의 «안에 추가» · 가지의 «아래 추가»가 까닭과 함께 꺼지고, 가지 줄을 영역 밖에 끌어 놓아도 안 옮긴다', async () => {
    const { P } = await fixture('vs-rules')
    const tab = await openTab(P)
    try {
      await pickRow(tab.page, 'n_sw')
      const regionAdd = (await rowMenu(tab.page, 'n_sw', '추가')).find((item) => item.label === '안에 추가')
      await tab.page.keyboard.press('Escape')
      await pickRow(tab.page, 'n_cd')
      const caseAdd = (await rowMenu(tab.page, 'n_cd', '추가')).find((item) => item.label === '아래 추가')
      await tab.page.keyboard.press('Escape')
      // 가지 줄을 끌어 영역 밖 글(n_out) 위에 놓는다.
      const from = (await treeRow(tab.page, 'n_cd').locator('.wb-shell-structure-node').boundingBox())!
      const to = (await treeRow(tab.page, 'n_out').locator('.wb-shell-structure-node').boundingBox())!
      const before = await server(P)
      const sent = tab.patches.length
      await tab.page.mouse.move(from.x + 20, from.y + from.height / 2)
      await tab.page.mouse.down()
      await tab.page.mouse.move(from.x + 24, from.y + from.height / 2 + 8, { steps: 3 })
      await tab.page.mouse.move(to.x + 20, to.y + to.height * 0.8, { steps: 8 })
      const indicator = await tab.page.locator('.wb-shell-drop-indicator, [data-drop-indicator]').count()
      await tab.page.mouse.up()
      await tab.page.waitForTimeout(600)
      expect({ regionAdd, caseAdd, indicator, sent: tab.patches.length - sent, headSame: (await server(P)).headSeq === before.headSeq }).toEqual({
        regionAdd: { label: '안에 추가', disabled: true, reason: '상태 영역 안에는 가지만 섭니다 — 가지를 고르고 그 안에 추가하세요' },
        caseAdd: { label: '아래 추가', disabled: true, reason: '가지 곁에는 노드를 둘 수 없습니다 — 상태 영역을 고르고 아래 추가하세요' },
        indicator: 0,
        sent: 0,
        headSame: true,
      })
    } finally {
      await tab.close()
    }
  })

  it('두 사람이 다른 상태를 보며 같은 영역을 편집 — 흐린 기본 가지 노드를 alice 가 잡으면 bob 은 못 고르고, alice 의 편집이 가지를 복사해 옮긴 뒤에는 고른다', async () => {
    const { P } = await fixture('vs-two-states')
    const tab = await openTab(P)
    const other = await openTab(P, { width: 1440, height: 900 }, 'bob')
    try {
      await choose(tab.page, '손님')
      await pickRow(tab.page, 'n_dt')
      // alice 의 잠금이 bob 에게 닿으면 n_dt 줄에 배지가 선다(줄 상자의 형제 — 위 «두 사람» 케이스의 `badge`).
      await other.page.locator('[data-tree-row][data-tree-id="n_dt"] ~ .wb-shell-structure-lock').waitFor()
      const blockedForBob = await treeRow(other.page, 'n_dt').locator('.wb-shell-structure-node').isDisabled()
      const head = (await server(P)).headSeq
      const box = tab.page.locator('.wb-shell-panel textarea').first()
      await box.click()
      await box.fill('손님 글')
      await box.evaluate((element) => (element as HTMLElement).blur())
      await landed(P, head)
      // alice 의 선택이 복사로 옮겨 잠금이 풀린 것 — bob 의 n_dt 배지가 걷힌다. 3s 안에 안 걷히면 기다리지 않고 값(`freeForBob`)으로 죽는다.
      await other.page.locator('[data-tree-row][data-tree-id="n_dt"] ~ .wb-shell-structure-lock').waitFor({ state: 'detached', timeout: 3_000 }).catch(() => undefined)
      const freeForBob = !(await treeRow(other.page, 'n_dt').locator('.wb-shell-structure-node').isDisabled())
      if (freeForBob) await pickRow(other.page, 'n_dt')
      await frames(other.page)
      const bobPicked = (
        await other.page.locator('.wb-shell-region[aria-label="구조 트리"] [aria-current="true"]').evaluateAll((els) => els.map((el) => el.closest('[data-tree-row]')?.getAttribute('data-tree-id') ?? ''))
      ).join(',')
      expect({ blockedForBob, freeForBob, bobPicked, defaultText: JSON.stringify(await serverShape(P)).includes('n_dt:기본 글') }).toEqual({
        blockedForBob: true,
        freeForBob: true,
        bobPicked: 'n_dt',
        defaultText: true,
      })
    } finally {
      await tab.close()
      await other.close()
    }
  })

  // ── Task 4 — 캔버스 표지 ─────────────────────────────────────────────────────────

  /** 표지 하나와 그 영역의 보이는 가지 자식(`kidIds`)의 차 — 꼬리표 · 흐림과 함께. */
  async function markOf(page: Page, switchId: string, kidIds: string[]) {
    return page.evaluate(
      ({ switchId, kidIds }) => {
        const iframe = document.querySelector('iframe.wb-shell-canvas-iframe') as HTMLIFrameElement
        const f = iframe.getBoundingClientRect()
        const zoom = f.width / iframe.offsetWidth
        const doc = iframe.contentDocument!
        const mark = document.querySelector(`.wb-shell-region-mark[data-wb-region-for="${switchId}"]`)
        const inDocument = doc.querySelectorAll('.wb-shell-region-mark, .wb-shell-region-tag').length
        if (mark === null) return { label: null, dimmed: null, diff: null, inDocument }
        const r = mark.getBoundingClientRect()
        let l = Infinity
        let t = Infinity
        let rr = -Infinity
        let b = -Infinity
        for (const id of kidIds) {
          const el = [...doc.querySelectorAll('[data-wb-id]')].find((e) => e.getAttribute('data-wb-id') === id)
          if (el === undefined) continue
          const c = el.getBoundingClientRect()
          l = Math.min(l, f.left + c.left * zoom)
          t = Math.min(t, f.top + c.top * zoom)
          rr = Math.max(rr, f.left + c.right * zoom)
          b = Math.max(b, f.top + c.bottom * zoom)
        }
        const diff = Math.max(Math.abs(r.left - l), Math.abs(r.top - t), Math.abs(r.right - rr), Math.abs(r.bottom - b))
        return { label: mark.getAttribute('data-wb-region'), dimmed: mark.classList.contains('wb-shell-region-mark-dimmed'), diff: Math.round(diff * 100) / 100, inDocument }
      },
      { switchId, kidIds },
    )
  }
  const fits = (value: { diff: number | null }) => ({ ...value, diff: value.diff !== null && value.diff <= 1 ? '≤1' : value.diff })

  it('표지 — 상태마다 꼬리표(«상태 영역 · 가지 2» · «관리자 · 기본에서 다름» · «손님 · 기본과 같음» + 흐림) · 상자는 보이는 가지와 맞고 · 줌 · 스크롤 · 남의 편집 뒤에도 · 문서에는 아무것도 안 넣는다', async () => {
    const fill = Array.from({ length: 24 }, (_, index) => text(`n_f${index}`, `채우는 글 ${index} — 캔버스를 세로로 길게 만든다`))
    const { P } = await fixture('vs-marks', fill)
    const tab = await openTab(P)
    try {
      const seen: Record<string, unknown> = {}
      seen['기본'] = fits(await markOf(tab.page, 'n_sw', ['n_dt']))
      await choose(tab.page, '관리자')
      seen['관리자'] = fits(await markOf(tab.page, 'n_sw', ['n_at']))
      await choose(tab.page, '손님')
      seen['손님'] = fits(await markOf(tab.page, 'n_sw', ['n_dt']))
      for (const step of ['확대', '확대', '축소', '축소', '축소'] as const) {
        await tab.page.getByRole('button', { name: step, exact: true }).click()
        await frames(tab.page)
      }
      seen['줌 0.75'] = fits(await markOf(tab.page, 'n_sw', ['n_dt']))
      await tab.page.locator('.wb-shell-canvas').evaluate((el) => {
        const scroller = [el, ...el.querySelectorAll('*')].find((node) => node.scrollHeight > node.clientHeight + 10 && getComputedStyle(node).overflowY !== 'visible')
        if (scroller !== undefined) scroller.scrollTop = 120
      })
      await frames(tab.page)
      seen['스크롤'] = fits(await markOf(tab.page, 'n_sw', ['n_dt']))
      // 남이 기본 가지에 글 하나를 더하고(상자는 두 자식의 합이어야 한다) 영역 앞에 글 둘을 넣는다(영역이 아래로 밀린다).
      const body = (await stack.request(bob, 'GET', P)).body
      const seenFrames = tab.received.filter((kind) => kind === 'page-changed').length
      const pushed = await stack.request(bob, 'PATCH', `${P}/ops`, {
        baseSeq: body.headSeq,
        ops: [
          { op: 'add', path: '/root/children/1/children/0/children/-', value: text('n_dt2', '기본 가지의 둘째 글 — 첫째보다 길게 늘여 오른끝이 다르다') },
          { op: 'add', path: '/root/children/0', value: text('n_p1', '밀어 내는 글 하나') },
          { op: 'add', path: '/root/children/0', value: text('n_p2', '밀어 내는 글 둘') },
        ],
      })
      expect(pushed.status).toBe(200)
      await remoteArrived(tab.received, seenFrames)
      await frames(tab.page)
      seen['남의 편집 뒤'] = fits(await markOf(tab.page, 'n_sw', ['n_dt', 'n_dt2']))
      await tab.page.getByRole('button', { name: '뷰 모드', exact: true }).click()
      await frames(tab.page)
      seen['뷰 모드'] = (await markOf(tab.page, 'n_sw', ['n_dt'])).label
      expect(seen).toEqual({
        기본: { label: '상태 영역 · 가지 2', dimmed: false, diff: '≤1', inDocument: 0 },
        관리자: { label: '관리자 · 기본에서 다름', dimmed: false, diff: '≤1', inDocument: 0 },
        손님: { label: '손님 · 기본과 같음', dimmed: true, diff: '≤1', inDocument: 0 },
        '줌 0.75': { label: '손님 · 기본과 같음', dimmed: true, diff: '≤1', inDocument: 0 },
        스크롤: { label: '손님 · 기본과 같음', dimmed: true, diff: '≤1', inDocument: 0 },
        '남의 편집 뒤': { label: '손님 · 기본과 같음', dimmed: true, diff: '≤1', inDocument: 0 },
        '뷰 모드': null,
      })
    } finally {
      await tab.close()
    }
  })

  // ── N8 — 고른 영역 · 가지의 캔버스 외곽선 · 빈 가지 자리표(L-072 · L-073) ─────────────────────────

  /** 빈 기본 가지를 가진 영역 — 앞 형제는 위의 `n_sw`(요소 없는 투명 노드)다. 관리자 가지에는 글이 있다. */
  const EMPTY_AREA = {
    id: 'n_sw0',
    type: 'StateSwitch',
    props: {},
    children: [
      { id: 'n_cd0', type: 'StateCase', props: { state: 'default' }, children: [] },
      { id: 'n_ca0', type: 'StateCase', props: { state: ADMIN.id }, children: [text('n_at0', '관리자만 글')] },
    ],
  }

  /**
   * 셸 겹의 상자(`selector`)와 그 값 — 화면 좌표의 상자와 `kidIds`(캔버스 요소들)의 합의 차(`diff`), 외곽선 굵기(화면 px = 계산값 × 줌).
   * `kidIds` 가 비면 차는 `null`(자리표 — 합이 없다).
   */
  async function overlayBox(page: Page, selector: string, kidIds: string[]) {
    return page.evaluate(
      ({ selector, kidIds }) => {
        const iframe = document.querySelector('iframe.wb-shell-canvas-iframe') as HTMLIFrameElement
        const f = iframe.getBoundingClientRect()
        const zoom = f.width / iframe.offsetWidth
        const doc = iframe.contentDocument!
        const box = document.querySelector(selector) as HTMLElement | null
        if (box === null) return null
        const r = box.getBoundingClientRect()
        let l = Infinity
        let t = Infinity
        let rr = -Infinity
        let b = -Infinity
        for (const id of kidIds) {
          const el = [...doc.querySelectorAll('[data-wb-id]')].find((e) => e.getAttribute('data-wb-id') === id)
          if (el === undefined) continue
          const c = el.getBoundingClientRect()
          l = Math.min(l, f.left + c.left * zoom)
          t = Math.min(t, f.top + c.top * zoom)
          rr = Math.max(rr, f.left + c.right * zoom)
          b = Math.max(b, f.top + c.bottom * zoom)
        }
        const diff = kidIds.length === 0 ? null : Math.round(Math.max(Math.abs(r.left - l), Math.abs(r.top - t), Math.abs(r.right - rr), Math.abs(r.bottom - b)) * 100) / 100
        const outline = Math.round(parseFloat(getComputedStyle(box).outlineWidth) * zoom * 100) / 100
        return { diff, outline, height: Math.round(r.height / zoom), zoom: Math.round(zoom * 100) / 100, top: r.top, bottom: r.bottom }
      },
      { selector, kidIds },
    )
  }
  const near = (value: { diff: number | null; outline: number } | null) =>
    value === null ? null : { diff: value.diff === null ? null : value.diff <= 1 ? '≤1' : value.diff, outline: Math.abs(value.outline - 2) <= 0.05 ? '2px' : value.outline }

  it('영역 · 가지 줄을 고르면 캔버스에 외곽선이 선다 — 상자는 보이는 가지의 자식 합 · 굵기는 일반 노드와 같은 줌 규칙 · 그려지지 않은 가지는 없다', async () => {
    const { P } = await fixture('vs-outline')
    const tab = await openTab(P)
    try {
      const seen: Record<string, unknown> = {}
      const sel = (id: string) => `.wb-shell-selection[data-wb-selected-id="${id}"]`
      await pickRow(tab.page, 'n_sw')
      await frames(tab.page)
      seen['영역'] = near(await overlayBox(tab.page, sel('n_sw'), ['n_dt']))
      await pickRow(tab.page, 'n_cd')
      await frames(tab.page)
      seen['기본 가지'] = near(await overlayBox(tab.page, sel('n_cd'), ['n_dt']))
      // 손잡이: 영역에는 서고 가지에는 없다(가지는 영역 밖으로 못 옮긴다).
      seen['가지 손잡이'] = await tab.page.locator('.wb-shell-canvas-handle').count()
      await choose(tab.page, '관리자')
      await pickRow(tab.page, 'n_sw')
      await frames(tab.page)
      seen['관리자 영역'] = near(await overlayBox(tab.page, sel('n_sw'), ['n_at']))
      // 안 그려진 가지(기본) — 외곽선이 없다.
      await pickRow(tab.page, 'n_ca')
      await tab.page.getByRole('button', { name: '모든 가지 보기', exact: true }).click()
      await pickRow(tab.page, 'n_cd')
      await frames(tab.page)
      seen['그려지지 않은 기본 가지'] = await tab.page.locator(sel('n_cd')).count()
      await tab.page.getByRole('button', { name: '모든 가지 보기', exact: true }).click()
      for (const step of ['확대', '확대', '축소', '축소', '축소'] as const) {
        await tab.page.getByRole('button', { name: step, exact: true }).click()
        await frames(tab.page)
      }
      await pickRow(tab.page, 'n_sw')
      await frames(tab.page)
      const region = await overlayBox(tab.page, sel('n_sw'), ['n_at'])
      seen['줌 0.75'] = region === null ? null : region.diff !== null && region.diff <= 1 ? '상자 ≤1' : region.diff
      // 굵기는 일반 노드의 선택 외곽선과 같은 줌 규칙을 따른다(`canvas.tsx` 의 `outlineWidth: 2 / zoom`) — 같은 줌에서 같은 값이다.
      await pickRow(tab.page, 'n_out')
      await frames(tab.page)
      const plain = await overlayBox(tab.page, sel('n_out'), ['n_out'])
      seen['줌 0.75 굵기 = 일반 노드'] = region !== null && plain !== null && region.outline === plain.outline
      expect(seen).toEqual({
        영역: { diff: '≤1', outline: '2px' },
        '기본 가지': { diff: '≤1', outline: '2px' },
        '가지 손잡이': 0,
        '관리자 영역': { diff: '≤1', outline: '2px' },
        '그려지지 않은 기본 가지': 0,
        '줌 0.75': '상자 ≤1',
        '줌 0.75 굵기 = 일반 노드': true,
      })
    } finally {
      await tab.close()
    }
  })

  it('빈 가지의 영역 — «여기 비어 있음» 자리표가 앞 형제 아래에 서고(문서를 안 민다) · 고르면 그 상자에 외곽선이 선다 · 가지에 글이 있는 상태에서는 자리표가 없다', async () => {
    const { P } = await fixture('vs-empty', [EMPTY_AREA])
    const tab = await openTab(P)
    try {
      const seen: Record<string, unknown> = {}
      const docBottom = () =>
        canvasFrame(tab.page).locator('[data-wb-id="n_dt"]').evaluate((el) => Math.round(el.getBoundingClientRect().bottom * 100) / 100)
      const before = await docBottom()
      const placeholder = tab.page.locator('.wb-shell-region-mark[data-wb-region-for="n_sw0"] [data-wb-region-empty]')
      seen['자리표 글'] = (await placeholder.count()) === 0 ? null : await placeholder.textContent()
      const mark = await overlayBox(tab.page, '.wb-shell-region-mark[data-wb-region-for="n_sw0"]', [])
      const upper = await overlayBox(tab.page, '.wb-shell-region-mark[data-wb-region-for="n_sw"]', ['n_dt'])
      // 앞 형제(영역 n_sw — 요소 없음)의 마지막 그려진 글 바로 아래에 선다 — 겹치지 않는다.
      seen['앞 영역 바로 아래'] = mark !== null && upper !== null ? Math.abs(mark.top - upper.bottom) <= 1 : null
      seen['높이'] = mark?.height
      await pickRow(tab.page, 'n_sw0')
      await frames(tab.page)
      const outline = await overlayBox(tab.page, '.wb-shell-selection[data-wb-selected-id="n_sw0"]', [])
      seen['외곽선이 자리표 상자'] = outline !== null && mark !== null ? Math.abs(outline.top - mark.top) <= 1 && Math.abs(outline.bottom - mark.bottom) <= 1 : null
      seen['외곽선 굵기'] = outline === null ? null : Math.abs(outline.outline - 2) <= 0.05 ? '2px' : outline.outline
      seen['문서가 안 밀림'] = (await docBottom()) === before
      seen['문서 안 자리표'] = await canvasFrame(tab.page).locator('[data-wb-region-empty]').count()
      await choose(tab.page, '관리자')
      seen['관리자 — 자리표'] = await tab.page.locator('[data-wb-region-empty]').count()
      await tab.page.getByRole('button', { name: '뷰 모드', exact: true }).click()
      await frames(tab.page)
      seen['뷰 모드 — 자리표'] = await tab.page.locator('[data-wb-region-empty]').count()
      expect(seen).toEqual({
        '자리표 글': '여기 비어 있음',
        '앞 영역 바로 아래': true,
        높이: 28,
        '외곽선이 자리표 상자': true,
        '외곽선 굵기': '2px',
        '문서가 안 밀림': true,
        '문서 안 자리표': 0,
        '관리자 — 자리표': 0,
        '뷰 모드 — 자리표': 0,
      })
    } finally {
      await tab.close()
    }
  })
})
