/**
 * **하단 판의 «모듈» 탭을 실브라우저로 잰다**(설계 spec `docs/superpowers/specs/2026-10-18-modules-states-layout-design.md` 「B2」 · 「B3」) —
 * jsdom 판(`test/palette/module-tab.test.tsx`)이 못 재는 끌어 놓기 · 새로고침 뒤 기억 · 막힌 저장소.
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 모듈 카드 끌어 놓기 — 캔버스 · 트리 | 기본 모듈을 빈 카드 안에 · 프로젝트 모듈을 구조 트리 줄 안에 놓은 자리가 서버 문서와 다르다 · 표시(미리보기)가 안 선다 · 넣은 노드가 안 골라진다 · 되돌리기 둘 뒤 원래 문서가 아니다 |
 * | 마지막 탭 기억 | «모듈» 탭을 고르고 새로고침하면 «컴포넌트» 로 선다 |
 * | 막힌 저장소 | `localStorage` 가 던지는 판에서 판이 안 서거나 «컴포넌트» 가 아니다 · 탭을 못 바꾼다 |
 */
import type { Page } from 'playwright-core'
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

  async function seed(slug: string): Promise<{ P: string; projectId: string }> {
    const project = (await call('POST', '/projects', { name: 'V2 모듈', slug: `${slug}-${Date.now().toString(36)}` })).body
    const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '가' })).body
    const pageId = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '쪽' })).body.id
    const P = `/projects/${project.id}/pages/${pageId}`
    const seeded = await call('PATCH', `${P}/ops`, {
      baseSeq: 0,
      ops: BASIC.map((value, at) => ({ op: 'add', path: `/root/children/${at}`, value })),
    })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
    return { P, projectId: project.id }
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

  it('기본 모듈을 빈 카드 안 · 프로젝트 모듈을 구조 트리 줄 안에 끌어 놓으면 서버 문서가 그 자리이고, 되돌리기 둘로 원래 문서다', async () => {
    const { P, projectId } = await seed('mod-drag')
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

      await grab(page, 'builtin:detail')
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
})
