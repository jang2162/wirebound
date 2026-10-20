/**
 * **하단 판의 «모듈» 탭을 실브라우저로 잰다**(설계 spec `docs/superpowers/specs/2026-10-18-modules-states-layout-design.md` 「B2」 · 「B3」 ·
 * `2026-10-20-personal-modules-design.md`) — jsdom 판(`test/palette/module-tab.test.tsx`)이 못 재는 끌어 놓기 · 넣을 수 없는 판의 끌기와 키 ·
 * 다른 프로젝트의 개인 모듈 · 새로고침 뒤 기억 · 막힌 저장소.
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 모듈 카드 끌어 놓기 — 캔버스 · 트리 | 개인 모듈을 빈 카드 안에 · 프로젝트 모듈을 구조 트리 줄 안에 놓은 자리가 서버 문서와 다르다 · 표시(미리보기)가 안 선다 · 넣은 노드가 안 골라진다 · 되돌리기 둘 뒤 원래 문서가 아니다 |
 * | 넣을 수 없는 판 — viewer · 뷰 모드 | 판 · «모듈» 탭이 안 선다 · «넣기» 단추가 선다 · 카드를 캔버스에 끌어 놓거나 카드 안에서 Enter 를 치면 편집이 나간다(카나리아: 같은 끌기가 편집 모드에서는 문서를 바꾼다) |
 * | 다른 프로젝트에서 저장한 개인 모듈 | 저장 상자의 기본값(개인)으로 저장한 모듈이 다른 프로젝트의 «개인 모듈» 묶음에 안 선다 · 넣으며 이 프로젝트에 없는 페이지를 가리키는 동작을 안 뺀다 · 뺀 수를 말하지 않는다 |
 * | 마지막 탭 기억 | «모듈» 탭을 고르고 새로고침하면 «컴포넌트» 로 선다 |
 * | 막힌 저장소 | `localStorage` 가 던지는 판에서 판이 안 서거나 «컴포넌트» 가 아니다 · 탭을 못 바꾼다 |
 */
import type { Locator, Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canvasFrame, editorStackPrerequisite, poll, shownDrops, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

interface SeedNode {
  id: string
  type: string
  props?: Record<string, unknown>
  children?: SeedNode[]
}

/**
 * ```
 * Page
 * ├ Text    n_text  '글'
 * ├ Card    n_card  '카드'
 * │ └ Text  n_intx  '안'
 * └ Card    n_empt  '빈 카드'
 * ```
 */
const BASIC: SeedNode[] = [
  { id: 'n_text', type: 'Text', props: { content: '글' } },
  { id: 'n_card', type: 'Card', props: { title: '카드' }, children: [{ id: 'n_intx', type: 'Text', props: { content: '안' } }] },
  { id: 'n_empt', type: 'Card', props: { title: '빈 카드' } },
]
const ORIGINAL = { n_root: ['n_text', { n_card: ['n_intx'] }, 'n_empt'] }
const KNOWN = new Set(['n_text', 'n_card', 'n_intx', 'n_empt'])

describe.skipIf(!전제.ok)('하단 판 «모듈» 탭 — 실브라우저', () => {
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

  async function seed(slug: string): Promise<{ P: string; projectId: string; menuId: string }> {
    const project = (await call('POST', '/projects', { name: 'V2 모듈', slug: `${slug}-${Date.now().toString(36)}` })).body
    const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '가' })).body
    const pageId = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '쪽' })).body.id
    const P = `/projects/${project.id}/pages/${pageId}`
    const seeded = await call('PATCH', `${P}/ops`, {
      baseSeq: 0,
      ops: BASIC.map((value, at) => ({ op: 'add', path: `/root/children/${at}`, value })),
    })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
    return { P, projectId: project.id, menuId: menu.id as string }
  }

  /** 서버 문서의 모양 — 뿌리는 `n_root`, 픽스처에 없는 노드(넣은 것)는 `+타입`. */
  async function shape(P: string): Promise<unknown> {
    const walk = (node: { id: string; type: string; children?: unknown[] }, root: boolean): unknown => {
      const name = root ? 'n_root' : KNOWN.has(node.id) ? node.id : `+${node.type}`
      return Array.isArray(node.children) && node.children.length > 0
        ? { [name]: node.children.map((child) => walk(child as never, false)) }
        : name
    }
    return walk((await call('GET', P)).body.schema.root, true)
  }

  async function addedTopIds(P: string, parentId: string): Promise<string[]> {
    const find = (node: { id: string; children?: unknown[] }): { id: string; children?: unknown[] } | null => {
      if (node.id === parentId) return node
      for (const child of node.children ?? []) {
        const hit = find(child as never)
        if (hit !== null) return hit
      }
      return null
    }
    const root = (await call('GET', P)).body.schema.root
    const parent = find(root)
    return ((parent?.children ?? []) as { id: string }[]).map((child) => child.id).filter((id) => !KNOWN.has(id))
  }

  async function openEditor(P: string, init?: string): Promise<{ page: Page; close: () => Promise<void> }> {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
    if (init !== undefined) await page.addInitScript({ content: init })
    await page.goto(P)
    await canvasFrame(page).locator('[data-wb-id]').first().waitFor()
    return { page, close: () => context.close() }
  }

  async function openPalette(page: Page): Promise<void> {
    await page.getByRole('contentinfo', { name: '하단 바' }).getByRole('button', { name: '컴포넌트', exact: true }).click()
    await page.getByRole('region', { name: '컴포넌트 목록' }).waitFor()
  }

  function viewTab(page: Page, name: '컴포넌트' | '모듈') {
    return page.getByRole('tablist', { name: '목록 종류' }).getByRole('tab', { name, exact: true })
  }

  async function grab(page: Page, key: string): Promise<void> {
    const box = (await page.locator(`[data-wb-module-card="${key}"]`).boundingBox())!
    // 카드의 왼쪽 몸통을 쥔다 — 오른쪽 위는 단추 줄이다.
    const at = { x: box.x + 30, y: box.y + box.height / 2 }
    await page.mouse.move(at.x, at.y)
    await page.mouse.down()
    await page.mouse.move(at.x + 3, at.y - 6, { steps: 3 })
  }

  async function selectedIds(page: Page): Promise<string[]> {
    return page.evaluate(() =>
      // 고른 노드 — 기준은 `aria-current`, 함께 고른 것은 `-member` 표지(`panels/structure-tree.tsx`).
      [...document.querySelectorAll('.wb-shell-region[aria-label="구조 트리"] [data-tree-row]')]
        .filter(
          (row) => row.querySelector(':scope > .wb-shell-structure-node[aria-current], :scope > .wb-shell-structure-node-member') !== null,
        )
        .map((row) => row.getAttribute('data-tree-id') ?? ''),
    )
  }

  /** 끌어 놓기 판의 개인 모듈 — 카드(키값) 하나와 단추 셋을 든 가로 줄. */
  const DETAIL_NODES = [
    { id: 'd_card', type: 'Card', children: [{ id: 'd_kv', type: 'KeyValue' }] },
    {
      id: 'd_flex',
      type: 'Flex',
      children: [
        { id: 'd_b1', type: 'Button', props: { label: '목록' } },
        { id: 'd_b2', type: 'Button', props: { label: '수정' } },
        { id: 'd_b3', type: 'Button', props: { label: '삭제' } },
      ],
    },
  ]

  it('개인 모듈을 빈 카드 안 · 프로젝트 모듈을 구조 트리 줄 안에 끌어 놓으면 서버 문서가 그 자리이고, 되돌리기 둘로 원래 문서다', async () => {
    const { P, projectId } = await seed('mod-drag')
    const mine = await call('POST', '/me/modules', { name: '상세 조회형', nodes: DETAIL_NODES })
    expect(mine.status, JSON.stringify(mine.body)).toBe(201)
    const personalId = mine.body.module.id as string
    const made = await call('POST', `/projects/${projectId}/modules`, {
      name: '단추 둘',
      nodes: [
        { id: 'm_a', type: 'Button', props: { label: '가' } },
        { id: 'm_b', type: 'Button', props: { label: '나' } },
      ],
    })
    expect(made.status, JSON.stringify(made.body)).toBe(201)
    const moduleId = made.body.module.id as string
    const { page, close } = await openEditor(P)
    try {
      await openPalette(page)
      await viewTab(page, '모듈').click()
      await page.locator(`[data-wb-module-card="project:${moduleId}"]`).waitFor()

      await page.locator(`[data-wb-module-card="personal:${personalId}"]`).waitFor()
      await grab(page, `personal:${personalId}`)
      const empty = (await canvasFrame(page).locator('[data-wb-id="n_empt"]').boundingBox())!
      await page.mouse.move(empty.x + empty.width / 2, empty.y + empty.height / 2, { steps: 8 })
      const canvasHint = (await shownDrops(page)).map((drop) => drop.placement)
      const tag = await page.locator('.wb-shell-palette-dragtag').textContent()
      await page.mouse.up()
      const into = await poll(
        '서버 문서',
        () => shape(P),
        (v) => JSON.stringify(v) !== JSON.stringify(ORIGINAL),
      )
      const placedInEmpty = await addedTopIds(P, 'n_empt')
      const selectedAfterDrop = await poll(
        '넣은 노드 전부를 고른다',
        () => selectedIds(page),
        (ids) => JSON.stringify(ids) === JSON.stringify(placedInEmpty),
      ).catch(() => selectedIds(page))

      await grab(page, `project:${moduleId}`)
      const row = (await page.locator('.wb-shell-region[aria-label="구조 트리"] [data-tree-row][data-tree-id="n_card"]').boundingBox())!
      await page.mouse.move(row.x + 30, row.y + row.height / 2, { steps: 8 })
      const rowHint = (await shownDrops(page)).map((drop) => drop.placement)
      await page.mouse.up()
      const onRow = await poll(
        '서버 문서',
        () => shape(P),
        (v) => JSON.stringify(v) !== JSON.stringify(into),
      )

      const undo = page.getByRole('group', { name: '편집 이력' }).getByRole('button', { name: '되돌리기' })
      for (let i = 0; i < 2; i += 1) await undo.click()
      const undone = await poll(
        '서버 문서',
        () => shape(P),
        (v) => JSON.stringify(v) === JSON.stringify(ORIGINAL),
      ).catch(() => shape(P))

      expect({ canvasHint, tag, into, selected: selectedAfterDrop, rowHint, onRow, undone }).toEqual({
        canvasHint: ['inside'],
        tag: '상세 조회형',
        into: {
          n_root: [
            'n_text',
            { n_card: ['n_intx'] },
            { n_empt: [{ '+Card': ['+KeyValue'] }, { '+Flex': ['+Button', '+Button', '+Button'] }] },
          ],
        },
        selected: placedInEmpty,
        // 트리 위면 트리의 선과 캔버스의 미리보기가 함께 선다(`drag/use-placement.ts` 머리말 «배치 미리보기» · `palette.test.ts` 와 같은 값).
        rowHint: ['inside', 'inside'],
        onRow: {
          n_root: [
            'n_text',
            { n_card: ['n_intx', '+Button', '+Button'] },
            { n_empt: [{ '+Card': ['+KeyValue'] }, { '+Flex': ['+Button', '+Button', '+Button'] }] },
          ],
        },
        undone: ORIGINAL,
      })
      expect(placedInEmpty).toHaveLength(2)
    } finally {
      await close()
    }
  }, 90_000)

  it('«모듈» 탭을 고르고 새로고침하면 «모듈» 탭으로 선다', async () => {
    const { P } = await seed('mod-remember')
    const { page, close } = await openEditor(P)
    try {
      await openPalette(page)
      await viewTab(page, '모듈').click()
      await page.getByRole('searchbox', { name: '모듈 찾기' }).waitFor()
      await page.reload()
      await canvasFrame(page).locator('[data-wb-id]').first().waitFor()
      // 판의 열림도 기억된다(`shell/sidebar-layout.ts`) — 안 열렸으면 연다.
      if ((await page.getByRole('region', { name: '컴포넌트 목록' }).count()) === 0) await openPalette(page)
      await page.getByRole('tablist', { name: '목록 종류' }).waitFor()
      expect([
        await viewTab(page, '컴포넌트').getAttribute('aria-selected'),
        await viewTab(page, '모듈').getAttribute('aria-selected'),
      ]).toEqual(['false', 'true'])
    } finally {
      await close()
    }
  }, 60_000)

  it('저장소가 던지면(읽기 · 쓰기) 판은 «컴포넌트» 로 서고 탭은 바뀐다', async () => {
    const { P } = await seed('mod-blocked')
    const blocked = `(() => {
      const fail = () => { throw new DOMException('막힌 저장소', 'SecurityError') }
      Storage.prototype.getItem = fail
      Storage.prototype.setItem = fail
    })()`
    const { page, close } = await openEditor(P, blocked)
    try {
      const throws = await page.evaluate(() => {
        try {
          window.localStorage.getItem('x')
          return false
        } catch {
          return true
        }
      })
      // 판이 섰는지를 값으로 잰다 — 읽기가 던져 판이 죽는 변조가 시간 초과가 아니라 `shown: false` 로 죽게.
      await page.getByRole('contentinfo', { name: '하단 바' }).getByRole('button', { name: '컴포넌트', exact: true }).click()
      const shown = await page
        .getByRole('tablist', { name: '목록 종류' })
        .waitFor({ timeout: 5_000 })
        .then(
          () => true,
          () => false,
        )
      if (!shown) {
        expect({ throws, shown }).toEqual({ throws: true, shown: true })
        return
      }
      const first = [
        await viewTab(page, '컴포넌트').getAttribute('aria-selected'),
        await viewTab(page, '모듈').getAttribute('aria-selected'),
      ]
      await viewTab(page, '모듈').click()
      await page.getByRole('searchbox', { name: '모듈 찾기' }).waitFor()
      const after = await viewTab(page, '모듈').getAttribute('aria-selected')
      expect({ throws, shown, first, after }).toEqual({ throws: true, shown: true, first: ['true', 'false'], after: 'true' })
    } finally {
      await close()
    }
  }, 60_000)

  /** 사람 하나로 에디터를 연다 — 보낸 편집 프레임(`patch`)을 센다(`palette-review.test.ts` 의 `openEditor` 와 같은 꼴). */
  async function openAs(user: 'alice' | 'bob', P: string): Promise<{ page: Page; close: () => Promise<void>; patches: string[] }> {
    const { context, page } = await stack.openTab(stack.users[user], { viewport: { width: 1440, height: 900 } })
    const patches: string[] = []
    page.on('websocket', (socket) => {
      socket.on('framesent', (frame) => {
        const text = typeof frame.payload === 'string' ? frame.payload : frame.payload.toString()
        if (text.includes('"type":"patch"')) patches.push(text)
      })
    })
    await page.goto(P)
    await canvasFrame(page).locator('[data-wb-id]').first().waitFor()
    return { page, close: () => context.close(), patches }
  }

  const structureRow = (page: Page, id: string): Locator =>
    page.locator(`.wb-shell-region[aria-label="구조 트리"] [data-tree-row][data-tree-id="${id}"]`)

  /** 카드를 쥐고 빈 카드 한가운데로 끌어 놓는다 — 놓기 직전에 선 표시 수를 낸다. */
  async function dragToEmpty(page: Page, key: string): Promise<number> {
    await grab(page, key)
    const empty = (await canvasFrame(page).locator('[data-wb-id="n_empt"]').boundingBox())!
    await page.mouse.move(empty.x + empty.width / 2, empty.y + empty.height / 2, { steps: 8 })
    const shown = (await shownDrops(page)).length
    await page.mouse.up()
    return shown
  }

  it('넣을 수 없는 판(viewer · 뷰 모드)은 «모듈» 하나 · «넣기» 가 없고 카드 끌어 놓기 · 카드 안 Enter 가 문서를 안 바꾼다 — 편집 모드의 같은 끌기는 바꾼다', async () => {
    const { P, projectId } = await seed('mod-readonly')
    const member = await call('POST', `/projects/${projectId}/members`, { email: stack.users.bob.email, role: 'viewer' })
    expect(member.status, JSON.stringify(member.body)).toBe(201)
    const bob = await stack.login(stack.users.bob)
    const nodes = [{ id: 'r_btn', type: 'Button', props: { label: '읽기 전용' } }]
    const alices = (await call('POST', '/me/modules', { name: '앨리스 단추', nodes })).body.module.id as string
    const bobs = (await stack.request(bob, 'POST', '/me/modules', { name: '밥 단추', nodes })).body.module.id as string

    const readOnly = async (user: 'alice' | 'bob', moduleId: string, prepare: (page: Page) => Promise<void>) => {
      const opened = await openAs(user, P)
      const { page } = opened
      await prepare(page)
      await page.getByRole('contentinfo', { name: '하단 바' }).getByRole('button', { name: '모듈', exact: true }).click()
      const region = page.getByRole('region', { name: '모듈 목록' })
      await region.waitFor()
      const key = `personal:${moduleId}`
      await page.locator(`[data-wb-module-card="${key}"]`).waitFor()
      const tabs = await page.getByRole('tablist', { name: '목록 종류' }).getByRole('tab').allTextContents()
      const add = await region.getByRole('button', { name: /넣기$/ }).count()
      const shown = await dragToEmpty(page, key)
      // 키 — 카드의 첫 단추(이름 바꾸기)에 포커스를 두고 Enter · Space · Escape.
      await page.locator(`[data-wb-module-card="${key}"] button`).first().focus()
      for (const press of ['Enter', 'Escape', ' ', 'Escape']) await page.keyboard.press(press)
      await page.waitForTimeout(800)
      return { opened, seen: { tabs, add, shown, sent: opened.patches.length, doc: await shape(P) } }
    }

    const viewer = await readOnly('bob', bobs, async () => {})
    await viewer.opened.close()
    const viewMode = await readOnly('alice', alices, async (page) => {
      await page.getByRole('button', { name: '뷰 모드' }).click()
    })
    // 카나리아 — 같은 끌기가 편집 모드에서는 문서를 바꾼다(판이 끌기를 받는 판이다).
    const { page, patches } = viewMode.opened
    try {
      await page.getByRole('button', { name: '편집 모드' }).click()
      await page.getByRole('region', { name: '컴포넌트 목록' }).waitFor()
      await viewTab(page, '모듈').click()
      await page.locator(`[data-wb-module-card="personal:${alices}"]`).waitFor()
      await dragToEmpty(page, `personal:${alices}`)
      const edited = await poll(
        '편집 모드의 끌기',
        () => shape(P),
        (v) => JSON.stringify(v) !== JSON.stringify(ORIGINAL),
      ).catch(() => shape(P))
      const readOnlyShape = { tabs: ['모듈'], add: 0, shown: 0, sent: 0, doc: ORIGINAL }
      expect({ viewer: viewer.seen, viewMode: viewMode.seen, edited, editSent: patches.length > 0 }).toEqual({
        viewer: readOnlyShape,
        viewMode: readOnlyShape,
        edited: { n_root: ['n_text', { n_card: ['n_intx'] }, { n_empt: ['+Button'] }] },
        editSent: true,
      })
    } finally {
      await viewMode.opened.close()
    }
  }, 120_000)

  it('다른 프로젝트에서 «모듈로 저장…»(기본값 개인)으로 남긴 모듈은 이 프로젝트의 «개인 모듈» 에 서고, 넣으면 이 프로젝트에 없는 페이지를 가리키는 동작을 빼고 그 수를 말한다', async () => {
    const origin = await seed('mod-origin')
    const there = await call('POST', `/projects/${origin.projectId}/pages`, { menuNodeId: origin.menuId, title: '그곳' })
    expect(there.status, JSON.stringify(there.body)).toBe(201)
    const head = (await call('GET', origin.P)).body.headSeq as number
    const navs = {
      id: 'n_navs',
      type: 'Card',
      props: { title: '길 둘' },
      children: [
        {
          id: 'n_go_there',
          type: 'Button',
          props: { label: '그곳으로' },
          interactions: [{ on: 'click', actions: [{ type: 'navigate', target: 'page:가/그곳' }] }],
        },
        {
          id: 'n_go_here',
          type: 'Button',
          props: { label: '쪽으로' },
          interactions: [{ on: 'click', actions: [{ type: 'navigate', target: 'page:가/쪽' }] }],
        },
      ],
    }
    const added = await call('PATCH', `${origin.P}/ops`, { baseSeq: head, ops: [{ op: 'add', path: '/root/children/3', value: navs }] })
    expect(added.status, JSON.stringify(added.body)).toBeLessThan(300)

    const first = await openAs('alice', origin.P)
    let choice: [string, boolean][]
    try {
      const row = structureRow(first.page, 'n_navs')
      await row.locator(':scope > :first-child').click()
      await row.locator(':scope > :first-child').hover()
      await row.getByRole('button', { name: /더 보기$/ }).click()
      await first.page.getByRole('menuitem', { name: '모듈로 저장…', exact: true }).click()
      const dialog = first.page.getByRole('dialog', { name: '모듈로 저장…' })
      await dialog.waitFor()
      choice = await dialog
        .getByRole('radio')
        .evaluateAll((radios) =>
          radios.map((radio) => [radio.closest('label')?.textContent ?? '', (radio as HTMLInputElement).checked] as [string, boolean]),
        )
      await dialog.getByRole('textbox', { name: '모듈 이름' }).fill('길 둘')
      await dialog.getByRole('button', { name: '저장', exact: true }).click()
      await dialog.waitFor({ state: 'detached' })
    } finally {
      await first.close()
    }

    const target = await seed('mod-target')
    const { page, close } = await openAs('alice', target.P)
    try {
      await openPalette(page)
      await viewTab(page, '모듈').click()
      const personal = page.getByRole('region', { name: '개인 모듈' })
      await personal.getByRole('button', { name: '길 둘 넣기', exact: true }).click()
      const placed = await poll(
        '넣은 카드',
        async () => ((await call('GET', target.P)).body.schema.root.children as { type: string; children?: unknown[] }[]).slice(3),
        (v) => v.length > 0,
      )
      const notice = await page.locator('.wb-shell-info-notice').textContent()
      const actions = ((placed[0]?.children ?? []) as { interactions?: { actions: unknown[] }[] }[]).map((child) =>
        (child.interactions ?? []).flatMap((interaction) => interaction.actions),
      )
      expect({ choice: choice!, types: placed.map((node) => node.type), actions, notice }).toEqual({
        choice: [
          ['개인 모듈', true],
          ['프로젝트 모듈', false],
        ],
        types: ['Card'],
        actions: [[], [{ type: 'navigate', target: 'page:가/쪽' }]],
        notice: '상호작용 동작 1개는 대상이 없어 빼고 넣었습니다.',
      })
    } finally {
      await close()
    }
  }, 120_000)
})
