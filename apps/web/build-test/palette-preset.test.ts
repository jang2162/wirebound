/**
 * **팔레트 프리셋 «반복 행 표» · 파일첨부 — 실브라우저 판**(설계 spec `docs/superpowers/specs/2026-10-26-popup-attach-repeat-design.md` «5» · «8»).
 *
 * | 판 | 재는 것 |
 * |---|---|
 * | 카드 | «반복 행 표» 카드가 «그리드» 바로 뒤에 서고 축소판이 그 카드가 넣는 노드(열 셋 · 입력)다 |
 * | 넣기 입구 넷 | «넣기»(뿌리 — 페이지 끝) · 구역 줄 «넣기»(카드 바닥) · 잎(파일첨부)을 고른 «넣기»(그 뒤) · 캔버스 끌어 놓기 · 트리 줄 끌어 놓기가 모두 같은 꼴 — 서버 문서의 그 노드 = 프리셋 템플릿(id 만 다르다) |
 * | 되돌리기 | 프리셋 넣기 하나가 되돌리기 한 번에 통째로 걷힌다 |
 * | 거절 | 행을 고른 «넣기» 는 «그리드» 카드와 같은 거절 문장이다(판정은 타입) · 서버 그대로 |
 * | 파일첨부 | 필드를 고른 «파일첨부 넣기» 가 값 칸 끝에 단추 셋 든 파일첨부를 세운다 · 속성 «파일» 칸을 고치면 캔버스의 파일 줄이 바뀐다 |
 * | 글 한도 | 파일 이름 · 크기 · «최대 크기» 칸에 한도를 넘게 붙여 넣거나 쳐도 칸이 한도에서 멈추고 서버가 그 글을 받는다(거절 프레임 0) · UTF-16 단위 |
 */
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  canvasFrame,
  dragLayoutSettled,
  editorStackPrerequisite,
  poll,
  startEditorStack,
  type EditorStack,
  type Session,
} from './editor-stack'
import { FileAttachDef, FileEntrySchema } from '@wirebound/schema'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

const TREE = '.wb-shell-region[aria-label="구조 트리"]'
const PRESET = 'DataGrid:repeatRows'

interface Node {
  id: string
  type: string
  props?: Record<string, unknown>
  children?: Node[]
  zones?: Record<string, Node[]>
}

/** id 를 뗀 꼴 — 프리셋 템플릿과 견준다. */
function shape(node: Node): unknown {
  return {
    type: node.type,
    ...(node.props === undefined ? {} : { props: node.props }),
    ...(node.children === undefined ? {} : { children: node.children.map(shape) }),
    ...(node.zones === undefined ? {} : { zones: Object.fromEntries(Object.entries(node.zones).map(([k, v]) => [k, v.map(shape)])) }),
  }
}

/** 프리셋 «반복 행 표» 의 템플릿 — `packages/schema/src/component/catalog/data.ts` 의 `repeatRows` 와 같은 꼴(서버 문서를 견주는 기대값). */
const REPEAT_ROWS = {
  type: 'DataGrid',
  children: [
    { type: 'GridColumn', props: { label: '항목 1' }, children: [{ type: 'Input' }] },
    { type: 'GridColumn', props: { label: '항목 2' }, children: [{ type: 'Input' }] },
    {
      type: 'GridColumn',
      props: { label: '삭제', size: 'short', align: 'center' },
      children: [{ type: 'Button', props: { label: '삭제' } }],
    },
  ],
  zones: { headEnd: [{ type: 'Button', props: { label: '추가' } }], rows: [{ type: 'GridRow', props: { repeat: 2 } }] },
}

function walk(root: Node, visit: (node: Node, parent: Node | null, zone: string) => void): void {
  const go = (node: Node, parent: Node | null, zone: string) => {
    visit(node, parent, zone)
    for (const child of node.children ?? []) go(child, node, 'body')
    for (const [name, list] of Object.entries(node.zones ?? {})) for (const child of list) go(child, node, name)
  }
  go(root, null, 'body')
}

/** 문서의 그리드 수 — 꼴과 무관하게 «넣기가 섰다» 를 기다린다(폴의 끝 조건에 단언할 꼴을 넣지 않는다 — 프리셋을 뗀 변조가 시간 초과가 아니라 꼴 값으로 죽게). */
function gridCount(root: Node): number {
  let n = 0
  walk(root, (node) => {
    if (node.type === 'DataGrid') n += 1
  })
  return n
}

/** 프리셋 꼴의 그리드(머리 오른쪽에 «추가») — [부모 id, 구역, 그 노드]. */
function presetGrids(root: Node): { parent: string; zone: string; node: Node }[] {
  const out: { parent: string; zone: string; node: Node }[] = []
  walk(root, (node, parent, zone) => {
    if (node.type === 'DataGrid' && node.zones?.headEnd?.[0]?.props?.label === '추가') out.push({ parent: parent?.id ?? '', zone, node })
  })
  return out
}

describe.skipIf(!전제.ok)('팔레트 프리셋 · 파일첨부 — 실브라우저', () => {
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

  async function seed(slug: string, nodes: Node[]): Promise<string> {
    const call = (m: string, p: string, b?: unknown) => stack.request(alice, m, p, b)
    const project = (await call('POST', '/projects', { name: '프리셋', slug: `${slug}-${Date.now().toString(36)}` })).body
    const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '메뉴' })).body
    const pageId = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '쪽' })).body.id as string
    const P = `/projects/${project.id}/pages/${pageId}`
    const seeded = await call('PATCH', `${P}/ops`, {
      baseSeq: 0,
      ops: nodes.map((value, at) => ({ op: 'add', path: `/root/children/${at}`, value })),
    })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
    return P
  }

  const server = async (P: string): Promise<Node> => (await stack.request(alice, 'GET', P)).body.schema.root as Node
  const treeRow = (page: Page, id: string) => page.locator(`${TREE} [data-tree-row][data-tree-id="${id}"]`)
  const zoneRow = (page: Page, parentId: string, zone: string) =>
    page.locator(`${TREE} [data-tree-zone-row][data-tree-zone-parent="${parentId}"][data-tree-zone-name="${zone}"]`)
  const notice = async (page: Page) => ((await page.locator('[data-wb-palette-notice]').textContent()) ?? '').trim()

  async function openPalette(page: Page, query: string): Promise<void> {
    if ((await page.getByRole('region', { name: '컴포넌트 목록' }).count()) === 0) {
      await page.getByRole('contentinfo', { name: '하단 바' }).getByRole('button', { name: '컴포넌트', exact: true }).click()
      await page.getByRole('region', { name: '컴포넌트 목록' }).waitFor()
    }
    await page.getByRole('searchbox', { name: '컴포넌트 찾기' }).fill(query)
  }

  /** 카드의 «넣기» — 같은 카드의 둘째 누름으로 안 읽히게 더블클릭 간격(`DOUBLE_CLICK_MS`)을 넘긴다. */
  async function add(page: Page, key: string): Promise<void> {
    await page.waitForTimeout(600)
    await page.locator(`[data-wb-palette-card="${key}"] .wb-shell-palette-add`).click()
  }

  async function grab(page: Page, key: string): Promise<void> {
    const box = (await page.locator(`[data-wb-palette-card="${key}"]`).boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 3, box.y + box.height / 2 - 6, { steps: 3 })
    await dragLayoutSettled(page)
  }

  const SEED: Node[] = [
    { id: 'n_text000001', type: 'Text', props: { content: '앞 글' } },
    { id: 'n_card000001', type: 'Card', props: { title: '카드' } },
    { id: 'n_fa00000001', type: 'FileAttach', props: { files: [{ name: '통장사본.pdf', size: '2.1 MB' }] } },
    {
      id: 'n_grid000001',
      type: 'DataGrid',
      children: [{ id: 'n_col0000001', type: 'GridColumn', props: { label: '열' } }],
      zones: { rows: [{ id: 'n_row0000001', type: 'GridRow', props: { repeat: 2 } }] },
    },
    { id: 'n_field00001', type: 'Field', props: { label: '첨부' }, children: [{ id: 'n_input00001', type: 'Input' }] },
    { id: 'n_text000002', type: 'Text', props: { content: '끝 글' } },
  ]

  it('«반복 행 표» 카드는 «그리드» 바로 뒤 · 축소판이 넣을 노드다 — 넣기 입구 다섯이 모두 프리셋 꼴을 세운다', async () => {
    const P = await seed('preset-entries', SEED)
    // 창을 키운다 — 넣은 표 · 카드의 구역 줄로 트리가 길어져, 창 900 에서는 겨눌 줄이 트리 칸의 가장자리 자동 스크롤 띠에 든다.
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 1200 } })
    try {
      await page.goto(P)
      await canvasFrame(page).locator('[data-wb-id="n_text000002"]').waitFor()

      // 카드 — 데이터 갈래에서 «그리드» 바로 뒤 · 축소판에 열 셋 · 입력 둘(첫 줄) 이상.
      await openPalette(page, '')
      await page.getByRole('tablist', { name: '갈래' }).getByRole('tab', { name: '데이터' }).click()
      const keys = await page
        .locator('[data-wb-palette-card]')
        .evaluateAll((cards) => cards.map((card) => card.getAttribute('data-wb-palette-card')))
      expect(keys.slice(keys.indexOf('DataGrid'), keys.indexOf('DataGrid') + 2)).toEqual(['DataGrid', PRESET])
      expect(await page.locator(`[data-wb-palette-card="${PRESET}"] .wb-shell-palette-add`).getAttribute('aria-label')).toBe(
        '반복 행 표 넣기',
      )
      const thumb = await poll(
        '축소판',
        () =>
          page.evaluate((key) => {
            const doc = document.querySelector<HTMLIFrameElement>('iframe.wb-shell-palette-thumbs-iframe')?.contentDocument
            const wrapper = doc?.querySelector<HTMLElement>(`[data-wb-palette-thumb="${key}"]`)
            return {
              visible: wrapper?.style.visibility ?? '',
              columns: wrapper?.querySelectorAll('[data-wb-component="GridColumn"]').length ?? 0,
              inputs: wrapper?.querySelectorAll('[data-wb-component="Input"]').length ?? 0,
            }
          }, PRESET),
        (value) => value.visible === 'visible',
      )
      expect(thumb.columns).toBe(3)
      expect(thumb.inputs).toBeGreaterThanOrEqual(2)

      await openPalette(page, '반복')
      // 판이 섰다 = 그리드가 하나 늘었다(시드에 그리드 하나). 프리셋 꼴인지는 그 뒤 값으로 단언한다.
      const landed = async (label: string, k: number) => {
        await poll(
          label,
          async () => gridCount(await server(P)),
          (n) => n === 1 + k,
        )
        expect([label, presetGrids(await server(P)).length]).toEqual([label, k])
      }

      // ① 트리 — 필드 줄의 아래 띠에 놓는다(필드는 몸통을 받아 위 · 아래 25% 가 형제 자리다). 먼저 한다 — 넣은 표의 줄이 트리를 늘이면 그 줄이 창 밖으로 밀린다.
      await grab(page, PRESET)
      // 줄의 왼쪽(이름 위)을 겨눈다 — 오른쪽은 줄 행동 단추 자리다(`canvas-drop-review.test.ts` 의 `armedOnRow`).
      const row = (await treeRow(page, 'n_field00001').boundingBox())!
      await page.mouse.move(row.x + 30, row.y + row.height * 0.9, { steps: 10 })
      await page.waitForTimeout(150)
      await page.mouse.up()
      await landed('트리 놓기', 1)
      // ② 뿌리를 고른 넣기 — 페이지 끝(놓은 표가 골라져 있으니 뿌리 줄을 고른다).
      const rootId = (await server(P)).id
      await treeRow(page, rootId).locator('button').first().click()
      await add(page, PRESET)
      await landed('뿌리 넣기', 2)
      // ③ 카드 «바닥» 구역 줄.
      // 빈 구역 줄은 그 카드를 고르면 선다(`StructureNode` 의 `showEmpty`).
      await treeRow(page, 'n_card000001').locator('button').first().click()
      await zoneRow(page, 'n_card000001', 'footer').click()
      await add(page, PRESET)
      await landed('구역 줄 넣기', 3)
      // ④ 잎(파일첨부 — 몸통 없음)을 고른 넣기 — 그 뒤.
      await treeRow(page, 'n_fa00000001').locator('button').first().click()
      await add(page, PRESET)
      await landed('잎 뒤 넣기', 4)
      // ⑤ 캔버스 — 앞 글 아래 띠에 놓는다(문서 맨 위라 넣은 표에 밀려 캔버스 칸 밖으로 안 간다).
      await grab(page, PRESET)
      const head = (await canvasFrame(page).locator('[data-wb-id="n_text000001"]').boundingBox())!
      await page.mouse.move(head.x + head.width / 2, head.y + head.height * 0.85, { steps: 10 })
      await dragLayoutSettled(page)
      await page.mouse.up()
      await landed('캔버스 놓기', 5)

      const root = await server(P)
      const grids = presetGrids(root)
      // 다섯 다 프리셋 꼴 · id 는 다 다르다.
      expect(grids.map((grid) => shape(grid.node))).toEqual(Array.from({ length: 5 }, () => REPEAT_ROWS))
      const ids: string[] = []
      for (const grid of grids) walk(grid.node, (node) => ids.push(node.id))
      expect(new Set(ids).size).toBe(ids.length)
      expect(ids.length).toBe(5 * 9) // 그리드 · 열 셋 · 셀 틀 조각 셋 · «추가» · 행
      // 자리 — 카드 바닥에 하나 · 페이지 몸통에 넷(앞 글 뒤 · 파일첨부 뒤 · 필드 뒤 · 끝).
      expect(grids.filter((grid) => grid.parent === 'n_card000001').map((grid) => grid.zone)).toEqual(['footer'])
      const order = root.children!.map((node) => (grids.some((grid) => grid.node.id === node.id) ? '표' : node.id))
      expect(order).toEqual([
        'n_text000001',
        '표',
        'n_card000001',
        'n_fa00000001',
        '표',
        'n_grid000001',
        'n_field00001',
        '표',
        'n_text000002',
        '표',
      ])
      // 캔버스 — 프리셋 그리드마다 «추가» 단추 · 행 둘(원본 + 사본) × 입력 둘.
      const drawn = await canvasFrame(page)
        .locator('[data-wb-component="DataGrid"]')
        .evaluateAll((els) =>
          els
            .filter((el) => el.querySelector('[data-wb-zone="headEnd"]')?.textContent?.includes('추가'))
            .map((el) => el.querySelectorAll('[data-wb-component="Input"]').length),
        )
      expect(drawn).toEqual([4, 4, 4, 4, 4])
    } finally {
      await context.close()
    }
  }, 180_000)

  it('프리셋 넣기 하나는 되돌리기 한 번에 통째로 걷힌다 · 행을 고른 넣기는 «그리드» 카드와 같은 거절이다', async () => {
    const P = await seed('preset-undo', SEED)
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
    try {
      await page.goto(P)
      await canvasFrame(page).locator('[data-wb-id="n_text000002"]').waitFor()
      const before = JSON.stringify(await server(P))
      // 영문 타입으로 찾으면 두 카드가 함께 선다(«반복 행 표» 의 이름에는 «그리드» 가 없다).
      await openPalette(page, 'DataGrid')
      await page.locator(`[data-wb-palette-card="${PRESET}"]`).waitFor()

      await add(page, PRESET)
      await poll(
        '넣기',
        async () => gridCount(await server(P)),
        (n) => n === 2,
      )
      expect(presetGrids(await server(P))).toHaveLength(1)
      await page.getByRole('group', { name: '편집 이력' }).getByRole('button', { name: '되돌리기' }).click()
      await poll(
        '되돌리기 한 번에 원래대로',
        async () => JSON.stringify(await server(P)),
        (now) => now === before,
      )

      // 거절 — 행(칸만 받는다)을 고른다. 안이 거절되면 뒤(그리드의 «행» — 행만 받는다)도 거절이다.
      await treeRow(page, 'n_row0000001').locator('button').first().click()
      await add(page, PRESET)
      const refused = await poll(
        '프리셋 거절 문장',
        () => notice(page),
        (text) => text !== '',
      )
      await add(page, 'DataGrid')
      const base = await poll(
        '그리드 거절 문장',
        () => notice(page),
        (text) => text !== '',
      )
      expect(refused).toBe(base)
      expect(refused).toBe('행에는 칸만 놓을 수 있습니다')
      expect(JSON.stringify(await server(P))).toBe(before)
    } finally {
      await context.close()
    }
  }, 120_000)

  it('필드를 고른 «파일첨부 넣기» 는 값 칸 끝에 단추 셋 든 파일첨부 · 속성 «파일» 칸을 고치면 캔버스 줄이 바뀐다', async () => {
    const P = await seed('file-attach', SEED)
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
    try {
      await page.goto(P)
      await canvasFrame(page).locator('[data-wb-id="n_field00001"]').waitFor()
      await treeRow(page, 'n_field00001').locator('button').first().click()
      await openPalette(page, '파일첨부')
      await add(page, 'FileAttach')
      const field = await poll(
        '값 칸에 파일첨부',
        async () => (await server(P)).children!.find((node) => node.id === 'n_field00001')!,
        (node) => (node.children ?? []).length === 2,
      )
      const made = field.children![1]!
      expect(shape(made)).toEqual({
        type: 'FileAttach',
        zones: { actions: ['파일추가', '항목 제거', '전체 항목 제거'].map((label) => ({ type: 'Button', props: { label } })) },
      })
      // 캔버스 — 필드 이름이 묶음 이름(값 칸에 입력이 먼저 있어 이름 붙는 조각이 둘이라 «라벨 + 차례» — 렌더러 `fieldNames`) · 빈 목록 안내 줄 · 한도 글.
      const box = canvasFrame(page).locator(`[data-wb-id="${made.id}"]`)
      await box.waitFor()
      expect(await box.getAttribute('aria-label')).toBe('첨부 2')
      expect(await canvasFrame(page).locator('[data-wb-id="n_input00001"]').getAttribute('aria-label')).toBe('첨부 1')
      expect(await box.locator('[data-wb-part="drop"]').count()).toBe(1)
      expect(((await box.locator('[data-wb-part="limit"]').textContent()) ?? '').replace(/\s+/g, ' ').trim()).toBe('최대 1개 100 MB 제한')

      // 고른 파일첨부의 «파일» 칸 — «항목 추가» 뒤 이름 칸에 쳐서 떠난다.
      const files = page.getByRole('complementary', { name: '우측 패널' }).getByRole('group', { name: '파일' })
      await files.getByRole('button', { name: '항목 추가' }).click()
      await poll(
        '빈 줄',
        async () =>
          ((await server(P)).children!.find((n) => n.id === 'n_field00001')!.children![1]!.props?.files as unknown[] | undefined)?.length ??
          0,
        (n) => n === 1,
      )
      await files.getByRole('textbox', { name: '파일 1번째 이름' }).fill('사업자등록증.png')
      await files.getByRole('textbox', { name: '파일 1번째 크기' }).click()
      await files.getByRole('textbox', { name: '파일 1번째 크기' }).fill('1.2 MB')
      await files.getByRole('textbox', { name: '파일 1번째 크기' }).press('Enter')
      const saved = await poll(
        '서버에 파일 줄',
        async () => (await server(P)).children!.find((n) => n.id === 'n_field00001')!.children![1]!.props?.files,
        (value) => JSON.stringify(value) === JSON.stringify([{ name: '사업자등록증.png', size: '1.2 MB' }]),
      )
      expect(saved).toEqual([{ name: '사업자등록증.png', size: '1.2 MB' }])
      await poll(
        '캔버스의 파일 줄',
        async () => (await box.locator('[data-wb-part="fileName"]').allTextContents()).join(),
        (text) => text === '사업자등록증.png',
      )
      expect(await box.locator('[data-wb-part="drop"]').count()).toBe(0)
    } finally {
      await context.close()
    }
  }, 120_000)

  /**
   * **글 한도(RV-POB L1)** — 칸이 스키마의 글 한도(zod `.max()` — UTF-16 단위)에서 막는다. 막지 않으면 넘는 글이 거절(`patch-error` 422) → 다시
   * 불러오기로 사라진다. 한도는 정의에서 읽는다. 서버에 닿기를 기다리는 폴은 거절 프레임도 끝 조건에 넣는다 — 고치기 전 판이 값 없는 시간 초과로 죽지 않게.
   */
  it('파일 이름 · 크기 · «최대 크기» 칸은 글 한도에서 멈춘다 — 붙여 넣기 · 치기 · 이모지, 서버가 받는다 · 거절 0', async () => {
    const NAME_MAX = (FileEntrySchema.shape.name as unknown as { maxLength: number }).maxLength
    const SIZE_MAX = (FileEntrySchema.shape.size as unknown as { maxLength: number }).maxLength
    const MAX_SIZE_MAX = (
      (FileAttachDef.props as unknown as { shape: { maxSize: { unwrap(): unknown } } }).shape.maxSize.unwrap() as { maxLength: number }
    ).maxLength
    expect([NAME_MAX, SIZE_MAX, MAX_SIZE_MAX].every((max) => Number.isInteger(max) && max > 0)).toBe(true)
    const P = await seed('file-limits', SEED)
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    const rejected: string[] = []
    page.on('websocket', (socket) => {
      socket.on('framereceived', (frame) => {
        const payload = String(frame.payload)
        if (payload.includes('"type":"patch-error"')) rejected.push(payload)
      })
    })
    const attach = async () => (await server(P)).children!.find((node) => node.id === 'n_fa00000001')!.props ?? {}
    /** 커밋한 뒤 서버의 그 값이 바뀌거나 거절 프레임이 오면 끝난다 — 둘 다 값으로 돌려준다. 거절 수는 누르기 전에 센다(프레임이 폴보다 먼저 닿는다). */
    const landed = async (
      label: string,
      commit: () => Promise<void>,
      read: (props: Record<string, unknown>) => unknown,
      before: unknown,
    ) => {
      const errors = rejected.length
      await commit()
      const value = await poll(
        label,
        async () => ({ value: read(await attach()), errors: rejected.length }),
        (got) => JSON.stringify(got.value) !== JSON.stringify(before) || got.errors > errors,
      )
      return { value: value.value, rejected: value.errors - errors }
    }
    const paste = async (target: ReturnType<Page['getByRole']>, text: string) => {
      await page.evaluate((value) => navigator.clipboard.writeText(value), text)
      await target.click()
      await target.press('ControlOrMeta+A')
      await target.press('ControlOrMeta+V')
    }
    try {
      await page.goto(P)
      await canvasFrame(page).locator('[data-wb-id="n_fa00000001"]').waitFor()
      await treeRow(page, 'n_fa00000001').locator('button').first().click()
      const panel = page.getByRole('complementary', { name: '우측 패널' })
      const name = panel.getByRole('group', { name: '파일' }).getByRole('textbox', { name: '파일 1번째 이름' })
      const size = panel.getByRole('group', { name: '파일' }).getByRole('textbox', { name: '파일 1번째 크기' })
      const maxSize = panel.getByRole('textbox', { name: '최대 크기' })
      await name.waitFor()
      const fileName = (props: Record<string, unknown>) => (props.files as { name: string }[])[0]!.name
      const fileSize = (props: Record<string, unknown>) => (props.files as { size: string }[])[0]!.size

      // 이름 — 한도 + 5 자를 붙여 넣는다.
      await paste(name, 'n'.repeat(NAME_MAX + 5))
      const nameCell = await name.inputValue()
      const nameSaved = await landed('이름', () => name.press('Enter'), fileName, '통장사본.pdf')
      // 크기 — 한도 + 3 자를 한 글자씩 친다.
      await size.click()
      await size.press('ControlOrMeta+A')
      await size.pressSequentially('s'.repeat(SIZE_MAX + 3))
      const sizeCell = await size.inputValue()
      const sizeSaved = await landed('크기', () => size.press('Enter'), fileSize, '2.1 MB')
      // «최대 크기» — 한도 + 1 자를 붙여 넣는다(문서에 없는 prop — 기본값).
      await paste(maxSize, 'm'.repeat(MAX_SIZE_MAX + 1))
      const maxCell = await maxSize.inputValue()
      const maxSaved = await landed(
        '최대 크기',
        () => maxSize.press('Enter'),
        (props) => props.maxSize,
        undefined,
      )
      // 한 단위 남은 이름 칸에 이모지(두 단위)를 친다 — 안 들어간다.
      await name.fill('가'.repeat(NAME_MAX - 1))
      await page.keyboard.insertText('😀')
      const emojiCell = await name.inputValue()
      const emojiSaved = await landed('이모지', () => name.press('Enter'), fileName, nameSaved.value)

      expect({
        cells: [nameCell.length, sizeCell.length, maxCell.length, emojiCell === '가'.repeat(NAME_MAX - 1)],
        server: [nameSaved.value, sizeSaved.value, maxSaved.value, emojiSaved.value === '가'.repeat(NAME_MAX - 1)],
        rejected: rejected.length,
      }).toEqual({
        cells: [NAME_MAX, SIZE_MAX, MAX_SIZE_MAX, true],
        server: ['n'.repeat(NAME_MAX), 's'.repeat(SIZE_MAX), 'm'.repeat(MAX_SIZE_MAX), true],
        rejected: 0,
      })
    } finally {
      await context.close()
    }
  }, 120_000)
})
