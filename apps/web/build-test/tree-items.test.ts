/**
 * **트리 항목 칸 — 실브라우저 판**(`src/panels/controls/tree-items-control.tsx` · 기본 뷰 `packages/theme-sdk/src/default-views/data.tsx` 의 `TreeEntries`).
 *
 * | 케이스 | 재는 값 |
 * |---|---|
 * | 흐름 | 속성 패널에서 항목 추가 · 이름 · 하위 항목 · 들여쓰기(Alt+Shift+→) · 내어쓰기(Alt+Shift+←) · 접기 — 걸음마다 WS `patch` 프레임 1 · 서버 문서가 그 계층 → 캔버스 · 번들(뷰어) · 화면 모드(PPTX 캡처 길)의 줄(단 · 이름 · 표지 · 펼침)이 서버 문서로 지은 기대와 같다 → «되돌리기» 한 번에 한 걸음씩 거꾸로 |
 * | 키보드만 | 이름 칸에 포커스를 둔 뒤 키만으로 — `…`(Enter · ↓) «아래에 항목 추가» · «하위 항목 추가» · «접기», 이름 치기 · Enter, Alt+Shift+→ · ← · Alt+↑ — 서버 문서가 그 계층 · 포커스가 옮긴 항목을 따른다 |
 *
 * jsdom 판(조작마다의 값 · 한도 · 깨진 값)은 `test/panels/tree-items-control.test.tsx`.
 */
import type { Frame, Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canvasFrame, editorStackPrerequisite, poll, startEditorStack, type EditorStack, type Session } from './editor-stack'
import { exportBundle, openBundlePage } from './layout-bundle'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

const TREE = '.wb-shell-region[aria-label="구조 트리"]'
const TREE_ID = 'n_tree00000001'

interface Item {
  label: string
  open?: boolean
  children?: Item[]
}

interface Node {
  id: string
  type: string
  props?: Record<string, unknown>
  children?: Node[]
}

/** 키 차례를 가리지 않는 글자 — 서버(JSONB)는 키를 제 차례로 낸다. */
const canon = (value: unknown): string =>
  JSON.stringify(value, (_key, v: unknown) =>
    v !== null && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([x], [y]) => (x < y ? -1 : 1)))
      : v,
  )

/** 서버 문서의 항목으로 지은 기대 줄 — 접힌 항목의 자식은 안 그린다(`단|이름|표지|펼침`). */
function expectedRows(items: readonly Item[], level = 0): string[] {
  return items.flatMap((item) => {
    const parent = (item.children ?? []).length > 0
    const open = parent && item.open === true
    const row = `${level}|${item.label}|${parent ? (open ? '▾' : '▸') : ''}|${parent ? String(open) : ''}`
    return [row, ...(open ? expectedRows(item.children!, level + 1) : [])]
  })
}

/** 그린 줄 — 캔버스 문서 · 번들 페이지에서 그 트리의 항목마다. */
const drawnRows = (doc: Pick<Frame, 'evaluate'>): Promise<string[]> =>
  doc.evaluate((id) => {
    const tree = document.querySelector(`[data-wb-id="${id}"]`)
    if (tree === null) return []
    return [...tree.querySelectorAll('[data-wb-part="item"]')].map((item) => {
      let level = 0
      for (let at = item.parentElement; at !== null && at !== tree; at = at.parentElement) {
        if (at.getAttribute('data-wb-part') === 'children') level += 1
      }
      const node = item.querySelector(':scope > [data-wb-part="node"]')
      return [
        level,
        node?.querySelector('[data-wb-part="label"]')?.textContent ?? '',
        node?.querySelector('[data-wb-part="toggle"]')?.textContent ?? '',
        item.getAttribute('data-wb-open') ?? '',
      ].join('|')
    })
  }, TREE_ID)

describe.skipIf(!전제.ok)('트리 항목 칸(실브라우저)', () => {
  let stack: EditorStack
  let alice: Session

  beforeAll(async () => {
    if (!전제.ok) return
    stack = await startEditorStack(전제)
    alice = await stack.login(stack.users.alice)
  })

  afterAll(async () => {
    if (stack === undefined) return
    const { after } = await stack.close()
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  })

  const call = (m: string, p: string, b?: unknown) => stack.request(alice, m, p, b)

  async function seed(slug: string, items: Item[]): Promise<{ P: string; projectId: string }> {
    const project = (await call('POST', '/projects', { name: '트리 항목', slug: `${slug}-${Date.now().toString(36)}` })).body
    const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '메뉴' })).body
    const pageId = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '쪽' })).body.id as string
    const P = `/projects/${project.id}/pages/${pageId}`
    const seeded = await call('PATCH', `${P}/ops`, {
      baseSeq: 0,
      ops: [{ op: 'add', path: '/root/children/0', value: { id: TREE_ID, type: 'Tree', props: { items } } }],
    })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
    return { P, projectId: project.id as string }
  }

  const serverItems = async (P: string): Promise<Item[]> =>
    (((await call('GET', P)).body.schema.root as Node).children ?? []).find((node) => node.id === TREE_ID)?.props?.items as Item[]

  /** 탭을 열고 트리 노드를 고른다 — WS `patch` 프레임을 센다. */
  async function open(P: string): Promise<{ page: Page; patches: string[]; close: () => Promise<void> }> {
    const patches: string[] = []
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 1100 } })
    page.on('websocket', (socket) =>
      socket.on('framesent', (frame) => {
        const text = typeof frame.payload === 'string' ? frame.payload : frame.payload.toString()
        if (text.includes('"type":"patch"')) patches.push(text)
      }),
    )
    await page.goto(P)
    await canvasFrame(page).locator(`[data-wb-id="${TREE_ID}"]`).waitFor({ state: 'attached' })
    await page.locator(`${TREE} [data-tree-row][data-tree-id="${TREE_ID}"]`).locator('button').first().click()
    await page.getByRole('group', { name: '항목', exact: true }).waitFor()
    return { page, patches, close: () => context.close() }
  }

  const widget = (page: Page) => page.getByRole('group', { name: '항목', exact: true })
  const nameCell = (page: Page, at: string) => widget(page).getByRole('textbox', { name: `항목 ${at} 이름`, exact: true })
  const focusedName = (page: Page) => page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? null)

  async function menuPick(page: Page, at: string, label: string): Promise<void> {
    await widget(page)
      .getByRole('button', { name: `항목 ${at} 더 보기`, exact: true })
      .click()
    await page.getByRole('menuitem', { name: label, exact: true }).click()
  }

  /** 서버가 `want` 가 될 때까지 — 그 사이 나간 `patch` 프레임 수를 낸다. */
  async function landed(P: string, patches: string[], before: number, what: string, want: Item[]): Promise<number> {
    await poll(
      what,
      () => serverItems(P),
      (items) => canon(items) === canon(want),
    )
    return patches.length - before
  }

  /**
   * **흐름.** 고치기 전(`stringList` 칸 — 글 목록 · 줄마다 ↑ ↓ 지우기)에는 첫 걸음 `role=group «항목»` 안에서 «항목 1 이름» 칸을 못 찾아 죽는다 — 보고
   * «재현» 에 그 값을 적는다.
   */
  it('흐름 — 걸음마다 편집 하나 · 서버 = 캔버스 = 번들 = 화면 모드 · 되돌리기 한 번에 한 걸음', async () => {
    const { P, projectId } = await seed('tree-flow', [{ label: '회원' }])
    const { page, patches, close } = await open(P)
    const steps: Record<string, unknown> = {}
    const history: Item[][] = [[{ label: '회원' }]]
    try {
      const step = async (name: string, act: () => Promise<void>, want: Item[]): Promise<void> => {
        const before = patches.length
        await act()
        steps[name] = await landed(P, patches, before, name, want)
        history.push(want)
      }

      await step('항목 추가', () => widget(page).getByRole('button', { name: '항목 추가', exact: true }).click(), [
        { label: '회원' },
        { label: '' },
      ])
      steps['추가 뒤 포커스'] = await focusedName(page)
      await step(
        '이름 «통계»',
        async () => {
          await page.keyboard.type('통계')
          await page.keyboard.press('Enter')
        },
        [{ label: '회원' }, { label: '통계' }],
      )
      await step('하위 항목 추가', () => menuPick(page, '1', '하위 항목 추가'), [
        { label: '회원', open: true, children: [{ label: '' }] },
        { label: '통계' },
      ])
      await step(
        '이름 «목록»',
        async () => {
          await page.keyboard.type('목록')
          await page.keyboard.press('Enter')
        },
        [{ label: '회원', open: true, children: [{ label: '목록' }] }, { label: '통계' }],
      )
      const indented: Item[] = [{ label: '회원', open: true, children: [{ label: '목록' }, { label: '통계' }] }]
      await step(
        '들여쓰기 Alt+Shift+→',
        async () => {
          await nameCell(page, '2').focus()
          await page.keyboard.press('Alt+Shift+ArrowRight')
        },
        indented,
      )
      steps['들여쓴 뒤 포커스'] = await focusedName(page)
      const frame = (await (await page.$('iframe.wb-shell-canvas-iframe'))!.contentFrame())!
      await poll(
        '캔버스에 들인 줄',
        () => drawnRows(frame),
        (rows) => rows.length === 3,
      )
      steps['들여쓴 뒤 — 캔버스'] = { drawn: await drawnRows(frame), want: expectedRows(indented) }
      await step('내어쓰기 Alt+Shift+←', () => page.keyboard.press('Alt+Shift+ArrowLeft'), [
        { label: '회원', open: true, children: [{ label: '목록' }] },
        { label: '통계' },
      ])
      const folded: Item[] = [{ label: '회원', children: [{ label: '목록' }] }, { label: '통계' }]
      await step('접기', () => menuPick(page, '1', '접기'), folded)
      await poll(
        '캔버스에 접힌 줄',
        () => drawnRows(frame),
        (rows) => rows.length === 2,
      )
      await page.waitForTimeout(300)
      steps['접은 뒤 — 캔버스'] = { drawn: await drawnRows(frame), want: expectedRows(folded) }

      // 내보내기 — 번들 뷰어 · 화면 모드(PPTX 가 캡처하는 판).
      const bundle = await exportBundle(stack, alice, projectId)
      try {
        const file = Object.values(bundle.pages)[0]!
        for (const [name, screen] of [
          ['번들', false],
          ['화면 모드', true],
        ] as const) {
          const opened = await openBundlePage(stack, file, { viewport: { width: 1280, height: 900 }, screen })
          try {
            steps[`내보내기 — ${name}`] = await drawnRows(opened.page)
          } finally {
            await opened.context.close()
          }
        }
      } finally {
        bundle.dispose()
      }

      // 되돌리기 — 한 번에 한 걸음씩 거꾸로(포커스가 칸 밖이어야 하므로 도구모음 단추로).
      const undone: boolean[] = []
      for (let back = history.length - 2; back >= 0; back--) {
        await page.getByRole('button', { name: '되돌리기', exact: true }).click()
        const want = history[back]!
        await poll(
          `되돌리기 → ${back}`,
          () => serverItems(P),
          (items) => canon(items) === canon(want),
        )
        undone.push(true)
      }
      steps['되돌리기'] = undone.length

      expect(steps).toEqual({
        '항목 추가': 1,
        '추가 뒤 포커스': '항목 2 이름',
        '이름 «통계»': 1,
        '하위 항목 추가': 1,
        '이름 «목록»': 1,
        '들여쓰기 Alt+Shift+→': 1,
        '들여쓴 뒤 포커스': '항목 1-2 이름',
        '들여쓴 뒤 — 캔버스': { drawn: ['0|회원|▾|true', '1|목록||', '1|통계||'], want: ['0|회원|▾|true', '1|목록||', '1|통계||'] },
        '내어쓰기 Alt+Shift+←': 1,
        접기: 1,
        '접은 뒤 — 캔버스': { drawn: ['0|회원|▸|false', '0|통계||'], want: ['0|회원|▸|false', '0|통계||'] },
        '내보내기 — 번들': ['0|회원|▸|false', '0|통계||'],
        '내보내기 — 화면 모드': ['0|회원|▸|false', '0|통계||'],
        되돌리기: 7,
      })
    } finally {
      await close()
    }
  })

  it('키보드만 — `…` 의 항목 · 이름 · Alt+Shift+→ · ← · Alt+↑ 로 같은 일 · 포커스가 옮긴 항목을 따른다', async () => {
    const { P } = await seed('tree-keys', [{ label: '가' }])
    const { page, patches, close } = await open(P)
    const steps: Record<string, unknown> = {}
    try {
      const keys = async (...pressed: string[]): Promise<void> => {
        for (const key of pressed) await page.keyboard.press(key)
      }
      const typeName = async (text: string): Promise<void> => {
        await page.keyboard.type(text)
        await page.keyboard.press('Enter')
      }
      // 들어오는 자리 — 첫 이름 칸(포커스를 준 뒤로는 키만 쓴다).
      await nameCell(page, '1').focus()

      // 이름 칸 → Tab → `…` → Enter(첫 항목 «아래에 항목 추가» 에 포커스) → Enter.
      let before = patches.length
      await keys('Tab', 'Enter', 'Enter')
      steps['아래에 추가'] = await landed(P, patches, before, '아래에 추가', [{ label: '가' }, { label: '' }])
      steps['아래에 추가 뒤 포커스'] = await focusedName(page)
      await typeName('나')
      await landed(P, patches, patches.length, '이름 나', [{ label: '가' }, { label: '나' }])

      before = patches.length
      await keys('Alt+Shift+ArrowRight')
      steps['들여쓰기'] = await landed(P, patches, before, '들여쓰기', [{ label: '가', open: true, children: [{ label: '나' }] }])
      steps['들여쓰기 뒤 포커스'] = await focusedName(page)

      // `…` → ↓(둘째 «하위 항목 추가») → Enter.
      before = patches.length
      await keys('Tab', 'Enter', 'ArrowDown', 'Enter')
      steps['하위 추가'] = await landed(P, patches, before, '하위 추가', [
        { label: '가', open: true, children: [{ label: '나', open: true, children: [{ label: '' }] }] },
      ])
      await typeName('다')
      await landed(P, patches, patches.length, '이름 다', [
        { label: '가', open: true, children: [{ label: '나', open: true, children: [{ label: '다' }] }] },
      ])

      before = patches.length
      await keys('Alt+Shift+ArrowLeft')
      steps['내어쓰기'] = await landed(P, patches, before, '내어쓰기', [
        { label: '가', open: true, children: [{ label: '나' }, { label: '다' }] },
      ])
      before = patches.length
      await keys('Alt+ArrowUp')
      steps['위로'] = await landed(P, patches, before, '위로', [{ label: '가', open: true, children: [{ label: '다' }, { label: '나' }] }])
      steps['위로 뒤 포커스'] = await focusedName(page)

      // 첫 줄의 `…` 로 접기 — Shift+Tab 으로 첫 줄로 돌아간다(1-1 이름 → 1 의 `…` → 1 이름은 지난다: 펼침 표지는 Tab 정지점이 아니다).
      before = patches.length
      await keys('Shift+Tab', 'Enter', 'ArrowDown', 'ArrowDown', 'Enter')
      steps['접기'] = await landed(P, patches, before, '접기', [{ label: '가', children: [{ label: '다' }, { label: '나' }] }])

      expect(steps).toEqual({
        '아래에 추가': 1,
        '아래에 추가 뒤 포커스': '항목 2 이름',
        들여쓰기: 1,
        '들여쓰기 뒤 포커스': '항목 1-1 이름',
        '하위 추가': 1,
        내어쓰기: 1,
        위로: 1,
        '위로 뒤 포커스': '항목 1-1 이름',
        접기: 1,
      })
    } finally {
      await close()
    }
  })
})
