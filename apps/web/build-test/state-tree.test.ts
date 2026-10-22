/**
 * **상태 트리 · 노드별 보임을 실브라우저로 잰다**(설계 spec `docs/superpowers/specs/2026-10-18-modules-states-layout-design.md` 「C」 · 계획 V3 Task 4
 * Step 3). jsdom 은 배치 · 실제 WS · 두 사람의 잠금 · 주소창이 없어 아래 값을 못 잰다.
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 상태마다 캔버스 | 고른 상태에서 캔버스에 선 노드 집합이 보임 판정(물려받기 · `only` · `except` · `default`)과 다르다 · 구조 트리가 숨은 노드를 안 그리거나 안 흐린다 · 고르기가 편집을 낸다 |
 * | 메뉴 트리 상태 줄 | 트리 차례 · 깊이로 안 선다 · 누르면 그 상태가 안 골라진다 · 다른 페이지의 줄이 `?state=` 로 안 연다 |
 * | 패널 «상태 보임» | 고른 갈래 · 켠 상태가 서버 · 캔버스에 안 닿는다 |
 * | «페이지 정보» 탭 | 탭에서 더한 상태 · 고친 이름 · 설명이 서버와 메뉴 트리 상태 줄에 곧바로 안 선다 · 남이 고친 상태 · 페이지 이름이 탭에 곧바로 안 선다 · 탭에서 바꾼 페이지 이름이 메뉴 트리에 안 선다 |
 * | 상태 설명 초안 | 탭 · 모드 왕복에 친 글이 사라진다 · 뷰 모드에 상자가 선다 · 다른 상태의 상자를 열면 앞 상자가 닫힌다 · 남이 그 상태를 지우면 친 글이 말없이 사라진다 · 남이 같은 상태에 쓴 설명을 저장이 덮는다(화면에 와 있는 판 · 서버만 아는 판) |
 * | 상태 삭제 · 두 사람 | 지울 노드를 남이 잡았는데 «삭제»가 켜져 있다 · 놓은 뒤에도 꺼져 있다 · 서버가 상자가 말한 것과 다르게 바뀐다 · 되돌리기 한 번에 서버가 안 돌아온다 |
 * | 연 뒤 바뀐 집합 | 다른 탭이 그 상태에 보임을 걸었는데 상자가 다시 안 서거나 첫 누름에 보낸다 |
 * | 남의 상태 추가 | 열린 페이지에 남이 더한 상태가 새로고침 없이 메뉴 트리 · 전환기에 안 선다 |
 * | 주소 · viewer | viewer 가 `?state=` 로 연 상태로 안 선다 · 상태 `…` 가 viewer 에게(트리 · 탭) 선다 · 뷰 모드에서 고른 상태가 주소에 안 실린다 |
 */
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canvasFrame, editorStackPrerequisite, poll, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

const LOGIN = { id: 's_login', name: '로그인' }
const ADMIN = { id: 's_admin', name: '관리자', parent: 's_login' }
const GUEST = { id: 's_guest', name: '손님' }

const text = (id: string, content: string, visibility?: { mode: 'only' | 'except'; states: string[] }) => ({
  id,
  type: 'Text',
  props: { content },
  ...(visibility === undefined ? {} : { visibility }),
})

/** 노드 다섯 — 모두 · 로그인에서만(관리자가 물려받는다) · 관리자에서만 · 손님 빼고 · 기본에서만. */
const NODES = [
  text('n_all', '모두'),
  text('n_login', '로그인 글', { mode: 'only', states: ['s_login'] }),
  text('n_admin', '관리자 글', { mode: 'only', states: ['s_admin'] }),
  text('n_noguest', '손님 빼고', { mode: 'except', states: ['s_guest'] }),
  text('n_default', '기본 글', { mode: 'only', states: ['default'] }),
]

/** 상태마다 캔버스에 서야 하는 노드 — 보임 판정(`isVisibleIn`)을 손으로 적은 표. */
const EXPECTED: Record<string, string[]> = {
  기본: ['n_all', 'n_noguest', 'n_default'],
  로그인: ['n_all', 'n_login', 'n_noguest'],
  관리자: ['n_all', 'n_login', 'n_admin', 'n_noguest'],
  손님: ['n_all'],
}

describe.skipIf(!전제.ok)('상태 트리 · 노드별 보임 — 실브라우저', () => {
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

  /** 프로젝트 · 메뉴 · 페이지 둘(둘째에 상태 «검토» 하나). 첫 페이지에 상태 트리와 노드 다섯. bob 의 역할을 정한다. */
  async function fixture(slug: string, bobRole: 'editor' | 'viewer' = 'editor') {
    const project = (await call('POST', '/projects', { name: '상태 트리', slug: `${slug}-${Date.now().toString(36)}` })).body
    const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '가' })).body
    const member = await call('POST', `/projects/${project.id}/members`, { email: stack.users.bob.email, role: bobRole })
    if (member.status >= 300) throw new Error(`member ${member.status}`)
    const pageId = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '첫째' })).body.id as string
    const page2Id = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '둘째' })).body.id as string
    const P = `/projects/${project.id}/pages/${pageId}`
    const P2 = `/projects/${project.id}/pages/${page2Id}`
    const seed = async (path: string, ops: unknown[]) => {
      const seeded = await call('PATCH', `${path}/ops`, { baseSeq: 0, ops })
      if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
    }
    await seed(P, [
      { op: 'add', path: '/viewStates', value: [LOGIN, ADMIN, GUEST] },
      ...NODES.map((value, at) => ({ op: 'add', path: `/root/children/${at}`, value })),
    ])
    await seed(P2, [
      { op: 'add', path: '/viewStates', value: [{ id: 's_review', name: '검토' }] },
      { op: 'add', path: '/root/children/0', value: text('n_review', '검토 글', { mode: 'only', states: ['s_review'] }) },
    ])
    return { P, P2, pageId, page2Id }
  }

  /** 서버의 문서. */
  async function serverDoc(P: string): Promise<{ schema: any; headSeq: number }> {
    return (await call('GET', P)).body
  }

  async function openTab(path: string, user: 'alice' | 'bob' = 'alice', viewport = { width: 1440, height: 900 }, origin?: string) {
    const { context, page } = await stack.openTab(stack.users[user], origin === undefined ? { viewport } : { viewport, origin })
    const patches: string[] = []
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
    await page.goto(path)
    await canvasFrame(page).locator('[data-wb-id]').first().waitFor({ state: 'attached' })
    return { page, patches, received, close: () => context.close() }
  }

  const frames = (page: Page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  const switcherName = async (page: Page) => (await page.getByRole('button', { name: /^화면 상태:/ }).getAttribute('aria-label')) ?? ''

  /** 캔버스에 선 노드 id(뿌리 뺌) · 구조 트리 줄 id(뿌리 뺌) · 흐린 줄 id. */
  async function shown(page: Page): Promise<{ canvas: string[]; tree: string[]; dimmed: string[] }> {
    const canvas = await canvasFrame(page)
      .locator('[data-wb-id]')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-wb-id') ?? ''))
    const rows = page.locator('.wb-shell-region[aria-label="구조 트리"] [data-tree-row]')
    const tree = await rows.evaluateAll((els) => els.map((el) => el.getAttribute('data-tree-id') ?? ''))
    const dimmed = await rows.evaluateAll((els) =>
      els.filter((el) => el.querySelector('.wb-shell-structure-node-hidden') !== null).map((el) => el.getAttribute('data-tree-id') ?? ''),
    )
    return { canvas: canvas.slice(1), tree: tree.slice(1), dimmed }
  }

  /** 메뉴 트리의 상태 줄 — 이름 · 깊이 · 켜짐. */
  async function stateRows(page: Page, pageTitle: string) {
    return page.locator(`ul[aria-label="${pageTitle} 화면 상태"] [data-state-row]`).evaluateAll((rows) =>
      rows.map((row) => {
        const link = row.querySelector('.wb-shell-tree-state')!
        return [link.textContent ?? '', (row as HTMLElement).style.paddingLeft, link.getAttribute('aria-current') === 'true']
      }),
    )
  }

  /** 구조 트리에서 그 노드 줄의 잠금 배지(«○○ 편집 중» — 줄 상자의 형제다). */
  const lockBadge = (page: Page, nodeId: string) =>
    page.locator(`.wb-shell-region[aria-label="구조 트리"] li:has(> [data-tree-id="${nodeId}"]) > .wb-shell-structure-lock`)

  const stateLink = (page: Page, id: string) => page.locator(`[data-state-row][data-state-id="${id}"] .wb-shell-tree-state`)

  /** 우측 «페이지 정보» 탭을 연다 — 상태를 다루는 입구다(메뉴 트리의 상태 줄은 고르기만 한다). */
  async function infoTab(page: Page) {
    await page.getByRole('tab', { name: '페이지 정보', exact: true }).click()
    const panel = page.getByRole('tabpanel')
    await panel.getByRole('textbox', { name: '페이지 이름', exact: true }).waitFor()
    return panel
  }

  /** 탭의 상태 줄 — 이름 · 깊이 · 설명. */
  async function tabStates(page: Page) {
    return page
      .getByRole('tabpanel')
      .locator('ul[aria-label="화면 상태"] > li')
      .evaluateAll((rows) =>
        rows.map((row) => [
          row.querySelector('.wb-shell-page-state-name')?.textContent ?? '',
          (row as HTMLElement).style.paddingLeft,
          row.querySelector('.wb-shell-page-state-description')?.textContent ?? null,
        ]),
      )
  }

  /** 탭에서 상태 `…` 의 항목을 고른다. */
  async function stateItem(page: Page, name: string, item: string): Promise<void> {
    const panel = await infoTab(page)
    await panel.getByRole('button', { name: `상태 ${name} 더 보기`, exact: true }).click()
    await page.getByRole('menuitem', { name: item, exact: true }).click()
  }

  it('상태마다 캔버스에 선 노드가 보임 판정과 같고, 구조 트리는 모두 그리며 숨은 노드를 흐린다 — 상태 줄로 고른다 · 편집 0', async () => {
    const { P } = await fixture('st-canvas')
    const tab = await openTab(P)
    try {
      expect(await stateRows(tab.page, '첫째')).toEqual([
        ['로그인', '0px', false],
        ['관리자', '12px', false],
        ['손님', '0px', false],
      ])
      const seen: Record<string, Awaited<ReturnType<typeof shown>> & { head: string; current: unknown }> = {}
      seen['기본'] = { ...(await shown(tab.page)), head: await switcherName(tab.page), current: null }
      for (const [id, name] of [
        ['s_login', '로그인'],
        ['s_admin', '관리자'],
        ['s_guest', '손님'],
      ] as const) {
        await stateLink(tab.page, id).click()
        await poll(
          `${name} 고름`,
          () => switcherName(tab.page),
          (head) => head === `화면 상태: ${name}`,
        )
        await frames(tab.page)
        const current = (await stateRows(tab.page, '첫째')).filter((row) => row[2]).map((row) => row[0])
        seen[name] = { ...(await shown(tab.page)), head: await switcherName(tab.page), current }
      }
      // eslint-disable-next-line no-console
      console.log('[상태마다]', JSON.stringify(seen))
      const all = NODES.map((node) => node.id)
      for (const name of Object.keys(EXPECTED)) {
        expect({ name, canvas: seen[name]!.canvas, tree: seen[name]!.tree, dimmed: seen[name]!.dimmed }).toEqual({
          name,
          canvas: EXPECTED[name],
          tree: all,
          dimmed: all.filter((id) => !EXPECTED[name]!.includes(id)),
        })
      }
      expect(['로그인', '관리자', '손님'].map((name) => seen[name]!.current)).toEqual([['로그인'], ['관리자'], ['손님']])
      expect(tab.patches).toEqual([])
      // 열린 페이지의 상태 줄은 주소를 안 옮긴다(편집 모드의 주소는 페이지를 가리킨다).
      expect(new URL(tab.page.url()).search).toBe('')
    } finally {
      await tab.close()
    }
  }, 90_000)

  it('다른 페이지의 상태 줄은 그 페이지를 `?state=` 로 연다 — 머리 · 캔버스가 그 상태다', async () => {
    const { P, page2Id } = await fixture('st-other')
    const tab = await openTab(P)
    try {
      expect(await stateRows(tab.page, '둘째')).toEqual([['검토', '0px', false]])
      await stateLink(tab.page, 's_review').click()
      await poll(
        '둘째 · 검토',
        async () => new URL(tab.page.url()),
        (url) => url.pathname.endsWith(page2Id) && url.search === '?state=s_review',
      )
      await poll(
        '검토 고름',
        () => switcherName(tab.page),
        (head) => head === '화면 상태: 검토',
      )
      await canvasFrame(tab.page).locator('[data-wb-id="n_review"]').waitFor({ state: 'attached' })
      expect((await shown(tab.page)).canvas).toEqual(['n_review'])
      expect(await stateRows(tab.page, '둘째')).toEqual([['검토', '0px', true]])
    } finally {
      await tab.close()
    }
  }, 60_000)

  it('패널 «상태 보임» — 손님 상태에서 «표시»를 고르면 서버에 그 보임이 서고, 기본으로 가면 캔버스에서 빠진다', async () => {
    const { P } = await fixture('st-panel')
    const tab = await openTab(P)
    try {
      await stateLink(tab.page, 's_guest').click()
      await poll(
        '손님',
        () => switcherName(tab.page),
        (head) => head === '화면 상태: 손님',
      )
      await tab.page.locator('.wb-shell-region[aria-label="구조 트리"] [data-tree-id="n_all"] > .wb-shell-structure-node').click()
      await tab.page.locator('[data-wb-node-visibility]').getByRole('radio', { name: '표시', exact: true }).click()
      const server = await poll(
        '서버 보임',
        () => serverDoc(P),
        (doc) => doc.schema.root.children[0].visibility !== undefined,
      )
      expect(server.schema.root.children[0].visibility).toEqual({ mode: 'only', states: ['s_guest'] })
      expect((await shown(tab.page)).canvas).toContain('n_all')

      await tab.page.getByRole('button', { name: /^화면 상태:/ }).click()
      await tab.page.getByRole('menuitemradio', { name: '기본', exact: true }).click()
      await poll(
        '기본',
        () => switcherName(tab.page),
        (head) => head === '화면 상태: 기본',
      )
      await frames(tab.page)
      expect((await shown(tab.page)).canvas).toEqual(['n_noguest', 'n_default'])

      // 상태 줄은 여럿을 켜는 토글이다 — «기본»을 켜면 기본 화면에 다시 선다(고른 노드는 그대로 n_all 이다).
      const field = tab.page.locator('[data-wb-node-visibility]')
      await field.getByRole('button', { name: '기본', exact: true }).click()
      await poll(
        '서버 보임 — 기본 켬',
        () => serverDoc(P),
        (doc) => (doc.schema.root.children[0].visibility?.states ?? []).length === 2,
      )
      expect((await serverDoc(P)).schema.root.children[0].visibility).toEqual({ mode: 'only', states: ['default', 's_guest'] })
      await poll(
        '기본 화면에 다시 섬',
        async () => (await shown(tab.page)).canvas,
        (canvas) => canvas.includes('n_all'),
      )
      expect(await field.getByRole('button', { name: '기본', exact: true }).getAttribute('aria-pressed')).toBe('true')

      // «숨김»으로 옮기면 켠 상태 그대로 숨는다 — 기본 화면에서 빠진다.
      await field.getByRole('radio', { name: '숨김', exact: true }).click()
      await poll(
        '서버 보임 — 숨김',
        () => serverDoc(P),
        (doc) => doc.schema.root.children[0].visibility?.mode === 'except',
      )
      await poll(
        '기본 화면에서 빠짐',
        async () => (await shown(tab.page)).canvas,
        (canvas) => !canvas.includes('n_all'),
      )

      // «비활성»은 보임을 걷는다 — 기본 화면에 다시 선다.
      await field.getByRole('radio', { name: '비활성', exact: true }).click()
      await poll(
        '서버 보임 — 걷음',
        () => serverDoc(P),
        (doc) => doc.schema.root.children[0].visibility === undefined,
      )
      await poll(
        '기본 화면에 다시 섬(비활성)',
        async () => (await shown(tab.page)).canvas,
        (canvas) => canvas.includes('n_all'),
      )
    } finally {
      await tab.close()
    }
  }, 60_000)

  it('«페이지 정보» 탭 — 상태를 더하고 이름 · 설명을 고치면 서버와 메뉴 트리 상태 줄에 곧바로 선다', async () => {
    const { P } = await fixture('st-info')
    const tab = await openTab(P)
    try {
      const panel = await infoTab(tab.page)
      // 판 카나리아 — 탭이 상태 셋을 그린다.
      expect(await tabStates(tab.page)).toEqual([
        ['로그인', '0px', null],
        ['관리자', '12px', null],
        ['손님', '0px', null],
      ])

      // 더하기 — 목록 아래 «상태 추가».
      await panel.getByRole('button', { name: '상태 추가', exact: true }).click()
      const name = panel.getByRole('textbox', { name: '상태 이름', exact: true })
      await name.fill('방문자')
      await name.press('Enter')
      await poll(
        '서버 — 더함',
        () => serverDoc(P),
        (doc) => (doc.schema.viewStates ?? []).some((state: { name: string }) => state.name === '방문자'),
      )
      await poll(
        '트리 상태 줄 — 더함',
        () => stateRows(tab.page, '첫째'),
        (rows) => rows.some((row) => row[0] === '방문자'),
      )

      // 이름 바꾸기 — `…` «이름 바꾸기».
      await panel.getByRole('button', { name: '상태 방문자 더 보기', exact: true }).click()
      await tab.page.getByRole('menuitem', { name: '이름 바꾸기', exact: true }).click()
      const rename = panel.getByRole('textbox', { name: '상태 이름', exact: true })
      await rename.fill('손님 외')
      await rename.press('Enter')
      await poll(
        '트리 상태 줄 — 이름',
        () => stateRows(tab.page, '첫째'),
        (rows) => rows.some((row) => row[0] === '손님 외') && !rows.some((row) => row[0] === '방문자'),
      )

      // 설명 쓰기 — `…` «설명 쓰기».
      await panel.getByRole('button', { name: '상태 손님 외 더 보기', exact: true }).click()
      await tab.page.getByRole('menuitem', { name: '설명 쓰기', exact: true }).click()
      await panel.getByRole('textbox', { name: '상태 설명', exact: true }).fill('처음 온 사람\n둘째 줄')
      await panel.getByRole('button', { name: '상태 설명 저장', exact: true }).click()
      const after = await poll(
        '서버 — 설명',
        () => serverDoc(P),
        (doc) => (doc.schema.viewStates ?? []).some((state: { description?: string }) => state.description !== undefined),
      )
      expect(after.schema.viewStates.at(-1)).toMatchObject({ name: '손님 외', description: '처음 온 사람\n둘째 줄' })
      expect((await tabStates(tab.page)).at(-1)).toEqual(['손님 외', '0px', '처음 온 사람\n둘째 줄'])
      // 머리 전환기도 같은 목록이다(더한 상태를 고른 채다).
      expect(await switcherName(tab.page)).toBe('화면 상태: 손님 외')
    } finally {
      await tab.close()
    }
  }, 60_000)

  it('«페이지 정보» 탭 — 남이 고친 상태 이름 · 설명과 페이지 이름이 곧바로 서고, 탭에서 바꾼 페이지 이름이 메뉴 트리에 선다', async () => {
    const { P } = await fixture('st-info-live')
    const tab = await openTab(P)
    try {
      const panel = await infoTab(tab.page)
      // 남(bob)이 «손님»의 이름 · 설명을 고친다.
      const head = (await serverDoc(P)).headSeq
      const res = await stack.request(bob, 'PATCH', `${P}/ops`, {
        baseSeq: head,
        ops: [
          { op: 'test', path: '/viewStates/2/id', value: 's_guest' },
          { op: 'replace', path: '/viewStates/2/name', value: '비회원' },
          { op: 'add', path: '/viewStates/2/description', value: '밥이 쓴 설명' },
        ],
      })
      expect(res.status).toBe(200)
      await poll(
        '탭 — 남의 상태',
        () => tabStates(tab.page),
        (rows) => rows.some((row) => row[0] === '비회원' && row[2] === '밥이 쓴 설명'),
      )

      // 남(bob)이 페이지 이름을 바꾼다 — 메뉴 트리 쓰기라 `menu-changed`가 오고 탭이 이름을 다시 읽는다.
      const renamed = await stack.request(bob, 'PATCH', P, { title: '밥의 첫째' })
      expect(renamed.status).toBe(200)
      const title = panel.getByRole('textbox', { name: '페이지 이름', exact: true })
      await poll(
        '탭 — 남의 페이지 이름',
        () => title.inputValue(),
        (value) => value === '밥의 첫째',
      )

      // 탭에서 이름을 바꾼다 — 메뉴 트리의 페이지 줄이 따라간다.
      await title.fill('앨리스의 첫째')
      await panel.getByRole('button', { name: '이름 저장', exact: true }).click()
      await poll(
        '서버 — 페이지 이름',
        async () => (await call('GET', P)).body.title as string,
        (value) => value === '앨리스의 첫째',
      )
      await tab.page.getByRole('region', { name: '메뉴·페이지 트리' }).getByRole('link', { name: '앨리스의 첫째', exact: true }).waitFor()
      expect(await panel.getByText('이름을 저장했습니다').count()).toBe(1)
    } finally {
      await tab.close()
    }
  }, 60_000)

  /** 탭에서 그 상태 줄의 설명 상자. */
  const describeBox = (page: Page, stateId: string) =>
    page.getByRole('tabpanel').locator(`li[data-state-id="${stateId}"]`).getByRole('textbox', { name: '상태 설명', exact: true })

  /** 서버의 그 상태 설명. */
  async function serverDescription(P: string, stateId: string): Promise<string | undefined> {
    const doc = await serverDoc(P)
    return (doc.schema.viewStates ?? []).find((state: { id: string }) => state.id === stateId)?.description
  }

  it('상태 설명 초안은 탭 왕복 · 모드 왕복을 넘고(뷰 모드에는 상자가 없다), 다른 상태의 상자를 열어도 앞 초안이 남는다', async () => {
    const { P } = await fixture('st-desc-draft')
    const tab = await openTab(P)
    try {
      await stateItem(tab.page, '손님', '설명 쓰기')
      await describeBox(tab.page, 's_guest').fill('손님 초안')

      // 탭 왕복 — «속성» → «페이지 정보».
      await tab.page.getByRole('tab', { name: '속성', exact: true }).click()
      await infoTab(tab.page)
      expect(await describeBox(tab.page, 's_guest').inputValue()).toBe('손님 초안')

      // 모드 왕복 — 뷰 모드의 탭은 읽기만이라 상자가 없고, 편집 모드로 돌아오면 초안이 선다.
      await tab.page.getByRole('button', { name: '뷰 모드' }).click()
      await tab.page.getByRole('tab', { name: '페이지 정보', exact: true }).click()
      await tab.page.getByRole('tabpanel').locator('ul[aria-label="화면 상태"]').waitFor()
      expect(await tab.page.getByRole('tabpanel').getByRole('textbox', { name: '상태 설명', exact: true }).count()).toBe(0)
      await tab.page.getByRole('button', { name: '편집 모드' }).click()
      await infoTab(tab.page)
      expect(await describeBox(tab.page, 's_guest').inputValue()).toBe('손님 초안')

      // 다른 상태의 상자를 연다 — 앞 초안의 상자는 그대로 남는다.
      await stateItem(tab.page, '로그인', '설명 쓰기')
      await describeBox(tab.page, 's_login').fill('로그인 초안')
      expect(await describeBox(tab.page, 's_guest').inputValue()).toBe('손님 초안')

      // 하나를 저장하면 그 상태만 서버에 닿고 다른 상자는 남는다.
      await tab.page
        .getByRole('tabpanel')
        .locator('li[data-state-id="s_login"]')
        .getByRole('button', { name: '상태 설명 저장', exact: true })
        .click()
      await poll(
        '서버 — 로그인 설명',
        () => serverDescription(P, 's_login'),
        (value) => value === '로그인 초안',
      )
      expect(await serverDescription(P, 's_guest')).toBeUndefined()
      expect(await describeBox(tab.page, 's_guest').inputValue()).toBe('손님 초안')
      await poll(
        '탭 — 로그인 상자가 닫히고 설명이 선다',
        () => tabStates(tab.page),
        (rows) => rows[0]![2] === '로그인 초안',
      )
    } finally {
      await tab.close()
    }
  }, 60_000)

  it('설명을 치는 중 남이 그 상태를 지우면 «지워졌습니다» 와 친 글이 남고, 버리기로 걷는다 — 편집 0', async () => {
    const { P } = await fixture('st-desc-gone')
    const tab = await openTab(P)
    try {
      await stateItem(tab.page, '손님', '설명 쓰기')
      await describeBox(tab.page, 's_guest').fill('지울 초안\n둘째 줄')
      const head = (await serverDoc(P)).headSeq
      // 손님을 숨기던 노드의 보임을 걷고 상태를 뺀다(`removeViewStateOps` 가 짓는 것과 같은 묶음).
      const res = await stack.request(bob, 'PATCH', `${P}/ops`, {
        baseSeq: head,
        ops: [
          { op: 'remove', path: '/root/children/3/visibility' },
          { op: 'test', path: '/viewStates/2/id', value: 's_guest' },
          { op: 'remove', path: '/viewStates/2' },
        ],
      })
      expect(res.status).toBe(200)
      await poll(
        '탭 — 손님 줄이 빠진다',
        () => tabStates(tab.page),
        (rows) => rows.length === 2,
      )
      const gone = tab.page.getByRole('tabpanel').getByRole('group', { name: '지워진 상태의 설명', exact: true })
      await gone.waitFor()
      expect(await gone.getByText('«손님» 상태가 지워졌습니다', { exact: false }).count()).toBe(1)
      expect(await gone.getByRole('textbox').inputValue()).toBe('지울 초안\n둘째 줄')
      await gone.getByRole('button', { name: '버리기', exact: true }).click()
      expect(await gone.count()).toBe(0)
      expect(tab.patches).toEqual([])
    } finally {
      await tab.close()
    }
  }, 60_000)

  it('상자를 연 뒤 남이 같은 상태의 설명을 쓰면 저장이 덮지 않고 충돌을 세운다 — 버리기는 남의 글 · 덮기는 내 글', async () => {
    const { P } = await fixture('st-desc-clash')
    const tab = await openTab(P)
    try {
      const write = async (value: string, op: 'add' | 'replace') => {
        const head = (await serverDoc(P)).headSeq
        const res = await stack.request(bob, 'PATCH', `${P}/ops`, {
          baseSeq: head,
          ops: [
            { op: 'test', path: '/viewStates/2/id', value: 's_guest' },
            { op, path: '/viewStates/2/description', value },
          ],
        })
        expect(res.status).toBe(200)
        // 남의 프레임이 이 탭에 닿은 뒤에 누른다 — 화면의 문서가 남의 글을 든 판이다.
        await poll(
          '탭 — 남의 설명 프레임',
          async () => tab.received.some((frame) => frame.includes(value)),
          (got) => got,
        )
      }
      const row = tab.page.getByRole('tabpanel').locator('li[data-state-id="s_guest"]')
      const clash = row.getByRole('alert')

      // 칸이 없던 상태 — 연 뒤 남이 칸을 만든다.
      await stateItem(tab.page, '손님', '설명 쓰기')
      await describeBox(tab.page, 's_guest').fill('앨리스 설명')
      await write('밥의 설명', 'add')
      await poll(
        '서버 — 밥의 설명',
        () => serverDescription(P, 's_guest'),
        (value) => value === '밥의 설명',
      )
      await frames(tab.page)
      await row.getByRole('button', { name: '상태 설명 저장', exact: true }).click()
      await clash.waitFor()
      expect(await clash.innerText()).toContain('다른 사람이 이 상태 설명을 바꿨습니다')
      expect(await clash.innerText()).toContain('밥의 설명')
      expect(await serverDescription(P, 's_guest')).toBe('밥의 설명')
      // 버리기 — 남의 글을 받는다.
      await clash.getByRole('button', { name: '내 글 버리기', exact: true }).click()
      await poll(
        '탭 — 남의 설명',
        () => tabStates(tab.page),
        (rows) => rows[2]![2] === '밥의 설명',
      )
      expect(await describeBox(tab.page, 's_guest').count()).toBe(0)

      // 칸이 있던 상태 — 연 뒤 남이 바꾼다. 덮기는 그 값을 바탕으로 내 글을 보낸다. 같은 자리의 항목을 다시 누르므로 앞 누름에서
      // `DOUBLE_CLICK_MS`(500ms)를 넘긴다 — 안 넘기면 행동 메뉴가 둘째 누름으로 삼킨다(`shell/action-menu.tsx`).
      await new Promise((resolve) => setTimeout(resolve, 600))
      await stateItem(tab.page, '손님', '설명 쓰기')
      await describeBox(tab.page, 's_guest').fill('앨리스 둘째')
      await write('밥의 둘째', 'replace')
      await poll(
        '서버 — 밥의 둘째',
        () => serverDescription(P, 's_guest'),
        (value) => value === '밥의 둘째',
      )
      await frames(tab.page)
      await row.getByRole('button', { name: '상태 설명 저장', exact: true }).click()
      await clash.waitFor()
      expect(await clash.innerText()).toContain('밥의 둘째')
      await clash.getByRole('button', { name: '내 글로 덮기', exact: true }).click()
      await poll(
        '서버 — 덮은 내 글',
        () => serverDescription(P, 's_guest'),
        (value) => value === '앨리스 둘째',
      )
    } finally {
      await tab.close()
    }
  }, 60_000)

  it('남의 설명이 내 화면에 닿기 전에 저장하면 서버가 묶음째 거절하고 같은 충돌이 선다 — 서버는 남의 글', async () => {
    const { P } = await fixture('st-desc-race')
    // 서버 → 브라우저 WS 를 늦춰 남의 프레임이 저장 뒤에 닿게 한다.
    const delay = await stack.startDownDelay(2_500)
    const tab = await openTab(P, 'alice', { width: 1440, height: 900 }, delay.origin)
    try {
      // 편집이 WS 로 나가는 판 — 룸에 든 뒤에 친다(그 전의 편집은 REST 로 나간다).
      await poll(
        '룸에 듦',
        async () => tab.received.some((frame) => frame.includes('"type":"joined"')),
        (got) => got,
      )
      await stateItem(tab.page, '손님', '설명 쓰기')
      await describeBox(tab.page, 's_guest').fill('앨리스 설명')
      const head = (await serverDoc(P)).headSeq
      const res = await stack.request(bob, 'PATCH', `${P}/ops`, {
        baseSeq: head,
        ops: [
          { op: 'test', path: '/viewStates/2/id', value: 's_guest' },
          { op: 'add', path: '/viewStates/2/description', value: '밥의 설명' },
        ],
      })
      expect(res.status).toBe(200)
      const row = tab.page.getByRole('tabpanel').locator('li[data-state-id="s_guest"]')
      await row.getByRole('button', { name: '상태 설명 저장', exact: true }).click()
      // 판 카나리아 — 저장이 서버로 나갔다(남의 프레임이 아직 안 닿아 화면은 바탕 그대로였다).
      await poll(
        '보낸 편집',
        async () => tab.patches.length,
        (n) => n >= 1,
      )
      expect(tab.patches[0]).toContain('앨리스 설명')
      const clash = row.getByRole('alert')
      await clash.waitFor({ timeout: 15_000 })
      expect(await clash.innerText()).toContain('밥의 설명')
      expect(await serverDescription(P, 's_guest')).toBe('밥의 설명')
      expect(delay.delayed()).toBeGreaterThan(0)
    } finally {
      await tab.close()
      await delay.close()
    }
  }, 60_000)

  it('두 사람 — bob 이 지울 노드를 잡으면 «삭제»가 까닭과 함께 꺼지고, 놓으면 켜진다 · 지우면 서버가 상자대로 바뀌고 되돌리기 한 번에 돌아온다', async () => {
    const { P } = await fixture('st-remove')
    const before = await serverDoc(P)
    const alicePage = await openTab(P)
    const bobPage = await openTab(P, 'bob')
    try {
      // bob 이 관리자 글을 고른다(잠금). alice 는 «로그인»(하위 «관리자») 삭제를 묻는다 — 관리자 글이 함께 지워진다.
      await bobPage.page.locator('.wb-shell-region[aria-label="구조 트리"] [data-tree-id="n_admin"] > .wb-shell-structure-node').click()
      await lockBadge(alicePage.page, 'n_admin').waitFor()
      await stateItem(alicePage.page, '로그인', '삭제')
      const dialog = alicePage.page.getByRole('dialog', { name: '상태 삭제' })
      await dialog.waitFor()
      const danger = dialog.locator('.wb-shell-view-states-danger')
      const sentences = await dialog.locator('.wb-shell-view-states-sentence').allTextContents()
      const removed = await dialog.locator('[data-node-id]').evaluateAll((els) => els.map((el) => el.getAttribute('data-node-id')))
      expect({ sentences, removed }).toEqual({
        sentences: ['"로그인" 상태와 하위 상태 1개(관리자)를 지웁니다.', '노드 2개가 함께 삭제됩니다.'],
        removed: ['n_login', 'n_admin'],
      })
      expect({ off: await danger.getAttribute('aria-disabled'), why: await danger.getAttribute('aria-description') }).toEqual({
        off: 'true',
        why: expect.stringContaining('편집 중인 노드가 있어 함께 지울 수 없습니다'),
      })

      // bob 이 다른 노드로 옮기면 잠금이 풀리고 «삭제»가 켜진다.
      await bobPage.page.locator('.wb-shell-region[aria-label="구조 트리"] [data-tree-id="n_all"] > .wb-shell-structure-node').click()
      // 판이 섰다 — alice 의 화면에서 잠금이 «모두»로 옮겼다(배지). 그 뒤 두 프레임을 그린 «삭제»의 값을 단언한다(기다림에 넣지 않는다).
      await lockBadge(alicePage.page, 'n_all').waitFor()
      await poll(
        'n_admin 잠금 풀림',
        () => lockBadge(alicePage.page, 'n_admin').count(),
        (count) => count === 0,
      )
      await frames(alicePage.page)
      expect({ off: await danger.getAttribute('aria-disabled'), why: await danger.getAttribute('aria-description') }).toEqual({
        off: null,
        why: null,
      })
      await danger.click()
      const after = await poll(
        '서버 삭제',
        () => serverDoc(P),
        (doc) => (doc.schema.viewStates ?? []).length === 1,
      )
      expect({
        states: after.schema.viewStates,
        nodes: after.schema.root.children.map((node: { id: string }) => node.id),
      }).toEqual({ states: [GUEST], nodes: ['n_all', 'n_noguest', 'n_default'] })
      await poll(
        '상태 줄',
        () => stateRows(alicePage.page, '첫째'),
        (rows) => rows.length === 1,
      )

      // 되돌리기 한 번 — 상태 · 노드 · 보임이 함께 돌아온다(편집 하나). 포커스를 메뉴 트리 밖(구조 트리 — bob 이 안 잡은 줄)에 둔다 — 메뉴 트리
      // 상자는 에디터 단축키를 안 받는다(`data-wb-own-shortcuts`).
      await alicePage.page.locator('.wb-shell-region[aria-label="구조 트리"] [data-tree-id="n_noguest"] > .wb-shell-structure-node').click()
      await alicePage.page.keyboard.press('ControlOrMeta+z')
      const restored = await poll(
        '서버 되돌림',
        () => serverDoc(P),
        (doc) => (doc.schema.viewStates ?? []).length === 3,
      )
      expect({ states: restored.schema.viewStates, root: restored.schema.root }).toEqual({
        states: before.schema.viewStates,
        root: before.schema.root,
      })
    } finally {
      await alicePage.close()
      await bobPage.close()
    }
  }, 90_000)

  it('연 뒤 다른 탭이 그 상태에 보임을 걸면 상자가 새 집합으로 다시 서고 첫 누름은 안 보낸다 — 지운 것 = 보인 것', async () => {
    const { P } = await fixture('st-restand')
    const tab = await openTab(P)
    try {
      // 손님을 고른다(메뉴 트리 상태 줄) — 아래 남의 편집이 닿은 것을 손님 화면의 흐림으로 본다.
      await stateLink(tab.page, 's_guest').click()
      await poll(
        '손님',
        () => switcherName(tab.page),
        (head) => head === '화면 상태: 손님',
      )
      await stateItem(tab.page, '손님', '삭제')
      const dialog = tab.page.getByRole('dialog', { name: '상태 삭제' })
      await dialog.waitFor()
      const removed = () => dialog.locator('[data-node-id]').evaluateAll((els) => els.map((el) => el.getAttribute('data-node-id')))
      expect(await removed()).toEqual([])

      // 같은 사람의 다른 탭(REST)이 «손님 빼고»를 손님에서만 보이게 한다 — 그 상태를 지우면 «손님 빼고»가 함께 지워진다(연 뒤에는 보임을 걷을
      // 노드였다). 손님 화면에서 그 노드가 보이게 된다.
      const head = (await serverDoc(P)).headSeq
      const res = await call('PATCH', `${P}/ops`, {
        baseSeq: head,
        ops: [{ op: 'replace', path: '/root/children/3/visibility', value: { mode: 'only', states: ['s_guest'] } }],
      })
      expect(res.status).toBe(200)
      // 판이 섰다 — 남의 편집이 alice 의 문서에 닿았다(손님 화면에서 «손님 빼고»가 보여 구조 트리 줄의 흐림이 걷힌다). 상자의 값은 그 뒤 두 프레임에
      // 단언한다.
      await poll(
        '남의 편집 닿음',
        async () => (await shown(tab.page)).dimmed,
        (dimmed) => !dimmed.includes('n_noguest'),
      )
      await frames(tab.page)
      const danger = dialog.locator('.wb-shell-view-states-danger')
      expect({
        changed: await dialog.getByRole('status').allTextContents(),
        removed: await removed(),
        button: await danger.textContent(),
      }).toEqual({ changed: ['목록이 바뀌었습니다 — 다시 확인하세요.'], removed: ['n_noguest'], button: '새 목록 확인' })

      await danger.click()
      await tab.page.waitForTimeout(600)
      expect((await serverDoc(P)).schema.viewStates).toHaveLength(3)
      expect(await danger.textContent()).toBe('삭제')

      await danger.click()
      const after = await poll(
        '서버 삭제',
        () => serverDoc(P),
        (doc) => (doc.schema.viewStates ?? []).length === 2,
      )
      expect(after.schema.root.children.map((node: { id: string }) => node.id)).toEqual(['n_all', 'n_login', 'n_admin', 'n_default'])
    } finally {
      await tab.close()
    }
  }, 60_000)

  it('남이 열린 페이지에 상태를 더하면 새로고침 없이 메뉴 트리 · 전환기에 선다', async () => {
    const { P } = await fixture('st-live')
    const tab = await openTab(P)
    try {
      const head = (await serverDoc(P)).headSeq
      const res = await stack.request(bob, 'PATCH', `${P}/ops`, {
        baseSeq: head,
        ops: [
          { op: 'add', path: '/viewStates/-', value: { id: 's_new', name: '새 상태', parent: 's_guest' } },
          { op: 'add', path: '/root/children/0/visibility', value: { mode: 'only', states: ['s_new'] } },
        ],
      })
      expect(res.status).toBe(200)
      // 판이 섰다 — 같은 편집이 «모두»를 새 상태에서만 보이게 해 기본 화면의 캔버스에서 빠진다(캔버스는 열린 문서로 그린다). 상태 줄은 그 뒤에 단언한다.
      await poll(
        '남의 편집 닿음',
        async () => (await shown(tab.page)).canvas,
        (canvas) => !canvas.includes('n_all'),
      )
      await frames(tab.page)
      expect(await stateRows(tab.page, '첫째')).toEqual([
        ['로그인', '0px', false],
        ['관리자', '12px', false],
        ['손님', '0px', false],
        ['새 상태', '12px', false],
      ])
      await tab.page.getByRole('button', { name: /^화면 상태:/ }).click()
      expect(await tab.page.getByRole('menuitemradio').allTextContents()).toEqual(['기본', '로그인', '관리자', '손님', '새 상태'])
    } finally {
      await tab.close()
    }
  }, 60_000)

  it('viewer 가 `?state=` 로 열면 그 상태로 서고 상태 줄 `…` 가 없다 · 뷰 모드에서 고른 상태가 주소에 실린다', async () => {
    const { P } = await fixture('st-viewer', 'viewer')
    const viewer = await openTab(`${P}?state=s_admin`, 'bob')
    try {
      await poll(
        '관리자',
        () => switcherName(viewer.page),
        (head) => head === '화면 상태: 관리자',
      )
      await frames(viewer.page)
      expect((await shown(viewer.page)).canvas).toEqual(EXPECTED['관리자'])
      await stateLink(viewer.page, 's_admin').hover()
      expect(await viewer.page.getByRole('button', { name: '상태 관리자 더 보기', exact: true }).count()).toBe(0)
      // 탭도 읽기만 한다 — 이름 · 설명 글은 서고(판 카나리아) `…` · «상태 추가»가 없다.
      await viewer.page.getByRole('tab', { name: '페이지 정보', exact: true }).click()
      await poll(
        '탭 상태 목록',
        () => tabStates(viewer.page),
        (rows) => rows.length === 3,
      )
      expect(
        await viewer.page
          .getByRole('tabpanel')
          .getByRole('button', { name: /더 보기$|^상태 추가$/ })
          .count(),
      ).toBe(0)
      await stateLink(viewer.page, 's_guest').click()
      await poll(
        '주소',
        async () => new URL(viewer.page.url()).search,
        (search) => search === '?state=s_guest',
      )
    } finally {
      await viewer.close()
    }

    const tab = await openTab(P)
    try {
      await tab.page.getByRole('button', { name: '뷰 모드' }).click()
      await stateLink(tab.page, 's_login').click()
      await poll(
        '주소',
        async () => new URL(tab.page.url()).search,
        (search) => search === '?state=s_login',
      )
      expect(await tab.page.getByRole('button', { name: '상태 로그인 더 보기', exact: true }).count()).toBe(0)
    } finally {
      await tab.close()
    }
  }, 60_000)
})
