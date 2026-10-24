/**
 * **조합 입력 — 실브라우저 판**(설계 spec `docs/superpowers/specs/2026-10-24-compose-input-design.md` 문제 1).
 *
 * | 판 | 재는 것 |
 * |---|---|
 * | 넣기 입구 넷 | 팔레트 «넣기»(페이지 끝) · 구역 줄을 고른 «넣기»(검색폼 «조건») · 카드 끌어 놓기 · 복사 → 붙여넣기가 모두 «라벨 + 입력 하나» 를 같은 꼴로 세운다 — 서버 문서의 값 칸 = `[Input]`(props 없음) · 캔버스의 값 조각 안에 입력 상자가 보인다 |
 * | 종류 바꾸기 · 되돌리기 | 줄 `…` → «종류 바꾸기…» → «날짜» 가 서버에서 같은 id 의 `DateInput` · Cmd+Z 가 서버를 옛 `Input` 으로 |
 * | 종류 바꾸기 · 두 사람 | 남(bob)의 안내 문구 고침이 내 화면에 닿기 전에(서버 → 브라우저 1.5s 지연) 내가 셀렉트로 바꿔도 끝에 화면 = 서버(캔버스의 안내 글 · 타입) |
 * | 잠금 | 남이 고른 조각은 줄 `…` 가 안 서 «종류 바꾸기…» 에 닿을 길이 없다 · 눌러도 안 골라진다(고른 뒤 잠긴 판 · 상자를 연 뒤 잠긴 판은 jsdom `test/panels/change-kind.test.tsx`) |
 *
 * 모듈 넣기는 저장된 노드를 그대로 넣는 길이라 `initial` 이 안 끼고(값 칸째 저장된다) 여기서 따로 안 잰다.
 */
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canvasFrame, editorStackPrerequisite, poll, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

const TREE = '.wb-shell-region[aria-label="구조 트리"]'

interface Node {
  id: string
  type: string
  props?: Record<string, unknown>
  children?: Node[]
  zones?: Record<string, Node[]>
}

/** 문서의 `Field` 전부(구역까지 걷는다). */
function fieldsIn(root: Node): Node[] {
  const out: Node[] = []
  const walk = (node: Node) => {
    if (node.type === 'Field') out.push(node)
    for (const child of node.children ?? []) walk(child)
    for (const list of Object.values(node.zones ?? {})) for (const child of list) walk(child)
  }
  walk(root)
  return out
}

/** 캔버스의 필드마다 — 라벨 글 · 값 조각 안 조각 타입들 · 첫 조각의 상자 크기. 글로 넘긴다(변환기가 함수에 끼우는 도우미가 페이지에 없다). */
const CANVAS_FIELDS = `(() => [...document.querySelectorAll('[data-wb-component="Field"]')].map((field) => {
  const label = field.querySelector(':scope > [data-wb-part="label"]')
  const pieces = [...field.querySelectorAll(':scope > [data-wb-part="value"] > [data-wb-component]')]
  const first = pieces[0] ? pieces[0].getBoundingClientRect() : null
  return {
    label: label === null ? null : label.textContent,
    pieces: pieces.map((piece) => piece.getAttribute('data-wb-component')),
    box: first === null ? null : { width: Math.round(first.width), height: Math.round(first.height) },
  }
}))()`

describe.skipIf(!전제.ok)('조합 입력 — 실브라우저', () => {
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

  async function seed(slug: string, nodes: Node[], bob = false): Promise<{ P: string; projectId: string }> {
    const call = (m: string, p: string, b?: unknown) => stack.request(alice, m, p, b)
    const project = (await call('POST', '/projects', { name: '조합 입력', slug: `${slug}-${Date.now().toString(36)}` })).body
    const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '메뉴' })).body
    const pageId = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '쪽' })).body.id as string
    const P = `/projects/${project.id}/pages/${pageId}`
    const seeded = await call('PATCH', `${P}/ops`, {
      baseSeq: 0,
      ops: nodes.map((value, at) => ({ op: 'add', path: `/root/children/${at}`, value })),
    })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
    if (bob) {
      const member = await call('POST', `/projects/${project.id}/members`, { email: stack.users.bob.email, role: 'editor' })
      if (member.status !== 201) throw new Error(`멤버 ${member.status}`)
    }
    return { P, projectId: project.id }
  }

  const server = async (P: string): Promise<{ root: Node; headSeq: number }> => {
    const body = (await stack.request(alice, 'GET', P)).body
    return { root: body.schema.root as Node, headSeq: body.headSeq as number }
  }
  const treeRow = (page: Page, id: string) => page.locator(`${TREE} [data-tree-row][data-tree-id="${id}"]`)
  const zoneRow = (page: Page, parentId: string, zone: string) =>
    page.locator(`${TREE} [data-tree-zone-row][data-tree-zone-parent="${parentId}"][data-tree-zone-name="${zone}"]`)

  async function openPalette(page: Page): Promise<void> {
    if ((await page.getByRole('region', { name: '컴포넌트 목록' }).count()) > 0) return
    await page.getByRole('contentinfo', { name: '하단 바' }).getByRole('button', { name: '컴포넌트', exact: true }).click()
    await page.getByRole('region', { name: '컴포넌트 목록' }).waitFor()
  }

  async function showField(page: Page): Promise<void> {
    await openPalette(page)
    await page.getByRole('searchbox', { name: '컴포넌트 찾기' }).fill('입력 필드')
    await page.locator('[data-wb-palette-card="Field"]').waitFor()
  }

  /** 줄 `…` 을 열어 «종류 바꾸기…» 항목을 준다(그 줄을 먼저 고른다 — 줄 행동은 고른 줄에 선다). */
  async function changeKindItem(page: Page, id: string) {
    await treeRow(page, id).locator('button').first().click()
    await treeRow(page, id)
      .getByRole('button', { name: /더 보기$/ })
      .click()
    return page.getByRole('menuitem', { name: '종류 바꾸기…' })
  }

  it('넣기 입구 넷(팔레트 · 구역 줄 · 끌어 놓기 · 붙여넣기)이 모두 «라벨 + 입력 하나» 를 같은 꼴로 세운다', async () => {
    const { P } = await seed('ci-entries', [
      { id: 'n_sf00000001', type: 'SearchForm', zones: { actions: [{ id: 'n_sfb0000001', type: 'Button', props: { label: '검색' } }] } },
      { id: 'n_text000001', type: 'Text', props: { content: '끝 글' } },
    ])
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
    try {
      await page.goto(P)
      await canvasFrame(page).locator('[data-wb-id="n_text000001"]').waitFor()
      const add = page.locator('[data-wb-palette-card="Field"] .wb-shell-palette-add')
      const count = async () => fieldsIn((await server(P)).root).length

      // ① 팔레트 «넣기» — 뿌리를 고른 그대로(페이지 끝).
      await showField(page)
      await add.click()
      await poll('팔레트 넣기가 서버에 닿는다', count, (n) => n === 1)

      // ② 구역 줄 «조건»(검색폼의 몸통)을 고르고 «넣기».
      await zoneRow(page, 'n_sf00000001', 'body').click()
      await page.waitForTimeout(600) // 같은 카드의 둘째 누름으로 안 읽히게 더블클릭 간격을 넘긴다(`DOUBLE_CLICK_MS`).
      await add.click()
      await poll('구역 줄 넣기가 서버에 닿는다', count, (n) => n === 2)

      // ③ 카드를 끌어 끝 글 아래 띠에 놓는다.
      const card = (await page.locator('[data-wb-palette-card="Field"]').boundingBox())!
      await page.mouse.move(card.x + card.width / 2, card.y + card.height / 2)
      await page.mouse.down()
      await page.mouse.move(card.x + card.width / 2 + 3, card.y + card.height / 2 - 6, { steps: 3 })
      const target = (await canvasFrame(page).locator('[data-wb-id="n_text000001"]').boundingBox())!
      await page.mouse.move(target.x + target.width / 2, target.y + target.height * 0.85, { steps: 10 })
      await page.waitForTimeout(150)
      await page.mouse.up()
      await poll('끌어 놓기가 서버에 닿는다', count, (n) => n === 3)

      // ④ 첫 필드를 골라 복사 → 붙여넣기(그 뒤에 선다).
      const first = (await server(P)).root.children!.find((node) => node.type === 'Field')!
      await treeRow(page, first.id).locator('button').first().click()
      await page.keyboard.press('ControlOrMeta+c')
      await page.keyboard.press('ControlOrMeta+v')
      await poll('붙여넣기가 서버에 닿는다', count, (n) => n === 4)

      const { root } = await server(P)
      const fields = fieldsIn(root)
      // 서버 문서 — 넷 다 라벨 prop 없이(카탈로그 기본값 «라벨») 값 칸에 props 없는 `Input` 하나. id 는 다 다르다.
      expect(
        fields.map((field) => ({
          props: field.props ?? null,
          pieces: (field.children ?? []).map((piece) => [piece.type, piece.props ?? null]),
        })),
      ).toEqual(Array.from({ length: 4 }, () => ({ props: null, pieces: [['Input', null]] })))
      const ids = fields.flatMap((field) => [field.id, ...(field.children ?? []).map((piece) => piece.id)])
      expect(new Set(ids).size).toBe(8)
      // 자리 — 검색폼 몸통에 하나(구역 줄 넣기), 페이지에 셋(팔레트 넣기 · 그 뒤에 붙인 것 · 끝 글 뒤에 끌어 놓은 것).
      const sf = root.children!.find((node) => node.id === 'n_sf00000001')!
      expect(fieldsIn(sf)).toHaveLength(1)
      expect(root.children!.map((node) => (node.type === 'Field' ? 'Field' : node.id))).toEqual([
        'n_sf00000001',
        'n_text000001',
        'Field',
        'Field',
        'Field',
      ])

      // 캔버스 — 필드마다 라벨 «라벨» · 값 조각 안 입력 상자가 보인다(폭 · 높이 > 0).
      const handle = await page.$('iframe.wb-shell-canvas-iframe')
      const shown = await poll(
        '캔버스에 필드 넷',
        async () =>
          (await (await handle!.contentFrame())!.evaluate(CANVAS_FIELDS)) as {
            label: string | null
            pieces: string[]
            box: { width: number; height: number } | null
          }[],
        (list) => list.length === 4,
      )
      for (const field of shown) {
        expect({ label: field.label, pieces: field.pieces }).toEqual({ label: '라벨', pieces: ['Input'] })
        expect(field.box!.width).toBeGreaterThan(40)
        expect(field.box!.height).toBeGreaterThan(10)
      }
    } finally {
      await context.close()
    }
  }, 120_000)

  const FIELD: Node = {
    id: 'n_field00001',
    type: 'Field',
    props: { label: '상태' },
    children: [{ id: 'n_input00001', type: 'Input', props: { placeholder: '옛 안내', kind: 'number' } }],
  }

  it('«종류 바꾸기…» → 날짜 — 서버에서 같은 id 의 DateInput · Cmd+Z 가 옛 Input 으로 돌린다', async () => {
    const { P } = await seed('ci-kind-undo', [FIELD])
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
    try {
      await page.goto(P)
      await canvasFrame(page).locator('[data-wb-id="n_input00001"]').waitFor()
      await (await changeKindItem(page, 'n_input00001')).click()
      await page.getByRole('dialog', { name: '종류 바꾸기…' }).getByRole('button', { name: '날짜', exact: true }).click()
      const piece = async () => (await server(P)).root.children![0]!.children![0]!
      expect(await poll('서버가 날짜로', piece, (node) => node.type === 'DateInput')).toEqual({
        id: 'n_input00001',
        type: 'DateInput',
        props: { placeholder: '옛 안내' },
      })
      await canvasFrame(page).locator('[data-wb-id="n_input00001"][data-wb-component="DateInput"]').waitFor({ state: 'attached' })

      await page.getByRole('group', { name: '편집 이력' }).getByRole('button', { name: '되돌리기' }).click()
      expect(await poll('되돌리기가 서버를 옛 입력으로', piece, (node) => node.type === 'Input')).toEqual(FIELD.children![0])
    } finally {
      await context.close()
    }
  }, 90_000)

  it('남의 안내 문구 고침이 닿기 전에 셀렉트로 바꿔도 끝에 화면 = 서버(타입 · 캔버스의 안내 글)', async () => {
    const { P } = await seed('ci-kind-race', [FIELD], true)
    const bob = await stack.login(stack.users.bob)
    const slow = await stack.startDownDelay(1500)
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 }, origin: slow.origin })
    try {
      const received: string[] = []
      const sent: string[] = []
      page.on('websocket', (socket) => {
        socket.on('framereceived', (f) => received.push(String(f.payload)))
        socket.on('framesent', (f) => sent.push(String(f.payload)))
      })
      await page.goto(`${slow.origin}${P}`)
      await canvasFrame(page).locator('[data-wb-id="n_input00001"]').waitFor()
      // 실시간 채널이 붙은 뒤에 누른다 — 그 전의 편집은 REST 로 나가 늦춘 판(WS 리베이스)을 안 잰다(409 면 서버 판으로 다시 싣는다).
      await poll('joined', async () => received.some((f) => f.includes('"type":"joined"')), Boolean, 15_000)

      // 남이 그 조각의 안내 문구를 고친다 — 내가 그 줄을 고르기 전이다(고르면 그 조각을 내가 잡아 남의 고침이 423 이다). 내 화면에는 1.5s 뒤에 닿는다.
      const head = (await server(P)).headSeq
      const theirs = await stack.request(bob, 'PATCH', `${P}/ops`, {
        baseSeq: head,
        ops: [{ op: 'replace', path: '/root/children/0/children/0/props/placeholder', value: '남의 안내' }],
      })
      expect(theirs.status, JSON.stringify(theirs.body)).toBe(200)
      const before = received.filter((f) => f.includes('"type":"page-changed"')).length
      await (await changeKindItem(page, 'n_input00001')).click()
      const dialog = page.getByRole('dialog', { name: '종류 바꾸기…' })
      await dialog.getByRole('button', { name: '셀렉트', exact: true }).click()
      // 판 카나리아 — 누른 때 남의 고침은 아직 내 화면에 안 닿았다(바꾸기는 낡은 판 위에서 지어졌다).
      expect(before).toBe(0)

      const settled = await poll(
        '서버가 셀렉트로',
        async () => (await server(P)).root.children![0]!.children![0]!,
        (node) => node.type === 'Select',
        15_000,
      )
      // 늦은 프레임 · 리베이스가 다 닿을 때까지 — 캔버스의 그 노드가 서버와 같은 안내 글을 보일 때까지 기다리고 값으로 견준다.
      const serverHint = String((settled.props ?? {}).placeholder ?? '== 선택 ==')
      const canvasHint = await poll(
        '캔버스가 서버의 안내 글',
        async () =>
          (await canvasFrame(page)
            .locator('[data-wb-id="n_input00001"]')
            .evaluate((el) => [el.getAttribute('data-wb-component'), el.textContent])) as [string | null, string | null],
        (v) => v[0] === 'Select' && v[1] === serverHint,
        15_000,
      ).catch(async () =>
        canvasFrame(page)
          .locator('[data-wb-id="n_input00001"]')
          .evaluate((el) => [el.getAttribute('data-wb-component'), el.textContent]),
      )
      // eslint-disable-next-line no-console
      console.log(
        `[종류 바꾸기 · 두 사람] 서버 ${JSON.stringify(settled)} · 캔버스 ${JSON.stringify(canvasHint)} · 늦춘 덩어리 ${slow.delayed()}`,
      )
      expect(slow.delayed()).toBeGreaterThan(0)
      expect(received.filter((f) => f.includes('"type":"page-changed"')).length).toBeGreaterThan(0)
      // 판 카나리아 — 내 바꾸기가 실시간 채널(WS `patch`)로 나갔고 남의 고침 뒤에 서버가 받았다.
      expect(sent.filter((f) => f.includes('"type":"patch"') && f.includes('/type')).length).toBeGreaterThan(0)
      expect(settled.id).toBe('n_input00001')
      expect(canvasHint).toEqual(['Select', serverHint])
    } finally {
      await context.close()
      await slow.close()
    }
  }, 90_000)

  it('남이 고른 조각은 줄 `…` 가 안 서 «종류 바꾸기…» 에 닿을 길이 없다 — 눌러도 안 골라진다', async () => {
    const { P } = await seed('ci-kind-lock', [FIELD, { id: 'n_text000001', type: 'Text', props: { content: '다른 곳' } }], true)
    const bobTab = await stack.openTab(stack.users.bob, { viewport: { width: 1440, height: 900 } })
    const aliceTab = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
    try {
      await bobTab.page.goto(P)
      await canvasFrame(bobTab.page).locator('[data-wb-id="n_input00001"]').waitFor()
      await aliceTab.page.goto(P)
      await canvasFrame(aliceTab.page).locator('[data-wb-id="n_input00001"]').waitFor()
      const aliceMore = () => treeRow(aliceTab.page, 'n_input00001').getByRole('button', { name: /더 보기$/ })
      const pickInput = async () => {
        await treeRow(aliceTab.page, 'n_input00001').locator('button').first().click({ force: true })
        await aliceTab.page.waitForTimeout(300)
      }

      await treeRow(bobTab.page, 'n_input00001').locator('button').first().click()
      await poll(
        '남의 잠금이 닿는다(줄의 «편집 중» 배지)',
        () => aliceTab.page.locator(`${TREE} .wb-shell-structure-lock`, { hasText: stack.users.bob.name }).count(),
        (n) => n === 1,
        15_000,
      )
      await pickInput()
      // 남이 잡은 노드는 고를 수 없어 줄 행동(`…`)이 안 선다 — «종류 바꾸기…» 에 닿을 길이 없다.
      expect(await aliceMore().count()).toBe(0)
      expect(await aliceTab.page.getByRole('menuitem', { name: '종류 바꾸기…' }).count()).toBe(0)

      // 대조 — 남이 다른 노드로 옮기면(잠금을 놓으면) 같은 누름으로 줄 `…` 가 서고 «종류 바꾸기…» 가 켜져 있다.
      await treeRow(bobTab.page, 'n_text000001').locator('button').first().click()
      await poll(
        '잠금이 풀려 그 줄을 고를 수 있다',
        async () => {
          await pickInput()
          return aliceMore().count()
        },
        (n) => n === 1,
        15_000,
      )
      await aliceMore().click()
      expect(await aliceTab.page.getByRole('menuitem', { name: '종류 바꾸기…' }).getAttribute('aria-disabled')).toBe(null)
      expect((await server(P)).root.children![0]!.children![0]!.type).toBe('Input')
    } finally {
      await aliceTab.context.close()
      await bobTab.context.close()
    }
  }, 90_000)
})
