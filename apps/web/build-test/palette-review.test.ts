/**
 * **D2 리뷰 — 하단 컴포넌트 판을 실브라우저로 다시 잰다**(`docs/superpowers/plans/2026-10-01-d2-review.md`). 구현의 판
 * (`./palette.test.ts`)이 안 잰 자리를 값으로 잰다 — 클릭 추가의 자리를 서버 문서로 · 빠른 두 번 누름 · Enter 누른 채 · 축소판 좌표를
 * 판 폭 셋과 민 판에서 · 남이 테마를 바꿈 · 입력 표본의 `inert` · 판이 닫히는 때 · 창 700 의 최대 판과 통지 · 카드 끌기 중 남의 편집.
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | «넣기» 단추 — 고른 것마다 | 고른 것 없음 · 뿌리 · 컨테이너 · 잎에서 서버 문서가 계획 D6 의 자리가 아니다 · 넣은 노드가 안 골라진다 · 프레임이 하나가 아니다 |
 * | 클릭 추가 — 남의 잠금 | 뒤 형제를 bob 이 잡은 잎 · 부모를 잡으려 한 판에서 문장 · 프레임 · 서버 문서가 판정대로가 아니다 |
 * | 클릭 추가 — 뿌리 선택 + 남의 잠금 | 페이지를 연 그대로(뿌리 선택) bob 이 다른 노드를 고르면 서버가 받는 페이지 끝 넣기를 판이 거절한다 |
 * | 거절 문장 — 페이지 옮김 | 앞 페이지에서 선 거절 문장이 옮긴 페이지에 남는다 |
 * | 클릭 추가 — 자식을 안 받는 부모의 잎 | 검증 전 문서(SQL 로 부모 타입을 `Button` 으로)에서 편집이 나간다 · 문장이 `+` 의 «안에 추가» 설명이 아니다 |
 * | 빠른 두 번 누름 | 넣은 수 · 차례가 누른 수와 다르다(기록 — 두 번 누름은 넣기 둘) |
 * | Enter 누른 채 | 키 반복마다 넣는다 — 누른 채 한 번이 넣기 여럿이 된다 |
 * | 누르는 사이 남이 지움 | bob 이 alice 의 고른 노드를 지우려 함 → 그 답 · 뒤의 누름이 엉뚱한 자리로 간다 |
 * | 축소판 좌표 | 판 폭 셋(창 1440 · 1024 · 800)과 카드 판을 가운데 · 끝까지 세로로 민 판에서 표본이 창 밖이다 · 표본 중심과 창 중심이 1px 넘게 어긋난다 · 민 판이 하나도 없다 |
 * | 축소판 — 남이 테마를 바꿈 | bob 이 프로젝트 테마를 `system-portal` 로 바꾼 뒤에도 축소판 단추가 옛 테마 색이다 |
 * | 축소판 — 입력 표본 `inert` | 입력 표본 자리를 눌러 iframe 이 포커스 · 클릭을 받는다 · 그 점의 맨 위가 그 카드가 아니다 |
 * | 판 열고 접기 | 뷰 모드 · 실시간 viewer 강등에 판이 남는다 · 돌아오면 기억대로 안 선다 · 페이지를 옮기면 판이 닫히거나 표본이 빈다 |
 * | 창 700 · 최대 판 · 통지 다섯 | 셸이 세로로 넘친다 · 하단 바가 창 밖이다 · 하단 바가 자라도 판이 안 줄어 캔버스 칸이 `CANVAS_MIN_HEIGHT` 아래다 · 통지를 걷어도 판이 안 돌아온다 |
 * | 통지가 판을 조인 동안 손잡이 | 창 700 · 800 에서 키우는 몸짓(↑ · End · 위로 끌기)이 기억한 높이를 조인 값으로 누른다(통지를 걷어도 · 새로 고쳐도 조인 높이) · 줄이는 몸짓(↓ · 아래로 끌기)이 그린 높이에서 한 번에 안 움직이거나 그 높이를 안 기억한다 |
 * | 판을 연 채 화면 맞춤 | 맞춤 줌이 판을 닫은 판과 다르다 |
 * | 카드 끌기 중 남의 편집 | bob 이 대상을 잡음 · 지움 · 위 글을 길게 고쳐 대상이 밀림(표시가 옛 좌표에 남는다) · viewer 강등 — 표시가 남거나 보인 자리 밖으로 편집이 나간다 |
 * | 카드 끌기 — 안 미는 남의 편집(대조군) | 캔버스가 다시 잴 때 판의 끌기가 다시 묻지 않고 표시를 걷기만 한다 · 놓은 자리가 보인 자리가 아니다 |
 */
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { GALLERY_SAMPLES } from '@wirebound/theme-gallery'
import { placeableGroups } from '../src/panels/type-picker'
import { CANVAS_MIN_HEIGHT } from '../src/shell/sidebar-layout'
import { canvasFrame, editorStackPrerequisite, poll, shownDrops, startEditorStack, type EditorStack, type Session } from './editor-stack'
import { putTheme, seededVersion } from './theme-fixtures'

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
 * ├ Card    n_empt  '빈 카드'
 * └ Text    n_last  '끝'
 * ```
 */
const BASIC: SeedNode[] = [
  { id: 'n_text', type: 'Text', props: { content: '글' } },
  { id: 'n_card', type: 'Card', props: { title: '카드' }, children: [{ id: 'n_intx', type: 'Text', props: { content: '안' } }] },
  { id: 'n_empt', type: 'Card', props: { title: '빈 카드' } },
  { id: 'n_last', type: 'Text', props: { content: '끝' } },
]
const ORIGINAL = { n_root: ['n_text', { n_card: ['n_intx'] }, 'n_empt', 'n_last'] }
const KNOWN = new Set(['n_text', 'n_card', 'n_intx', 'n_empt', 'n_last', 'n_text2', 'n_empt2'])

const CARD_THUMBS = `(() => {
  const iframe = document.querySelector('iframe.wb-shell-palette-thumbs-iframe')
  if (iframe === null) return null
  const f = iframe.getBoundingClientRect()
  const doc = iframe.contentDocument
  const out = {}
  for (const win of document.querySelectorAll('[data-wb-palette-window]')) {
    const type = win.getAttribute('data-wb-palette-window')
    const w = win.getBoundingClientRect()
    const wrapper = doc.querySelector('[data-wb-palette-thumb="' + type + '"]')
    const node = wrapper === null ? null : [...wrapper.querySelectorAll('[data-wb-id]')].find((el) => el.getAttribute('data-wb-id') === wrapper.getAttribute('data-wb-palette-node'))
    if (node == null) { out[type] = { inside: false, dx: null, dy: null }; continue }
    const n = node.getBoundingClientRect()
    const left = f.left + n.left, top = f.top + n.top
    const shown = getComputedStyle(wrapper).visibility === 'visible' && n.width > 0 && n.height > 0
    out[type] = {
      inside: shown && left >= w.left - 1 && top >= w.top - 1 && left + n.width <= w.right + 1 && top + n.height <= w.bottom + 1,
      dx: Math.round((left + n.width / 2 - (w.left + w.width / 2)) * 10) / 10,
      dy: Math.round((top + n.height / 2 - (w.top + w.height / 2)) * 10) / 10,
    }
  }
  return out
})()`

const THUMB_BUTTON = `(() => {
  const doc = document.querySelector('iframe.wb-shell-palette-thumbs-iframe')?.contentDocument
  const button = doc?.querySelector('[data-wb-palette-thumb="Button"] [data-wb-component="Button"]')
  return button == null ? '단추 없음' : getComputedStyle(button).backgroundColor
})()`

function rgb(hex: string): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (m === null) throw new Error(`색이 #rrggbb 가 아니다: ${hex}`)
  return `rgb(${parseInt(m[1]!, 16)}, ${parseInt(m[2]!, 16)}, ${parseInt(m[3]!, 16)})`
}

describe.skipIf(!전제.ok)('D2 리뷰 — 하단 판 실브라우저', () => {
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

  async function seed(slug: string, pages: SeedNode[][], bobRole: 'editor' | 'owner' = 'editor'): Promise<{ P: string[]; projectId: string; pageIds: string[] }> {
    const project = (await call('POST', '/projects', { name: 'D2 리뷰', slug: `${slug}-${Date.now().toString(36)}` })).body
    const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '가' })).body
    const member = await call('POST', `/projects/${project.id}/members`, { email: stack.users.bob.email, role: bobRole })
    if (member.status >= 300) throw new Error(`member ${member.status}`)
    const P: string[] = []
    const pageIds: string[] = []
    for (const [index, nodes] of pages.entries()) {
      const pageId = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: `쪽${index + 1}` })).body.id
      const path = `/projects/${project.id}/pages/${pageId}`
      if (nodes.length > 0) {
        const seeded = await call('PATCH', `${path}/ops`, { baseSeq: 0, ops: nodes.map((value, at) => ({ op: 'add', path: `/root/children/${at}`, value })) })
        if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
      }
      P.push(path)
      pageIds.push(pageId)
    }
    return { P, projectId: project.id, pageIds }
  }

  async function shape(P: string): Promise<unknown> {
    const walk = (node: { id: string; type: string; children?: unknown[] }, root: boolean): unknown => {
      const name = root ? 'n_root' : KNOWN.has(node.id) ? node.id : `+${node.type}`
      return Array.isArray(node.children) && node.children.length > 0 ? { [name]: node.children.map((child) => walk(child as never, false)) } : name
    }
    return walk((await call('GET', P)).body.schema.root, true)
  }

  async function addedIds(P: string): Promise<string[]> {
    const ids: string[] = []
    const root = (await call('GET', P)).body.schema.root
    const walk = (node: { id: string; children?: unknown[] }) => {
      if (!KNOWN.has(node.id) && node.id !== root.id) ids.push(node.id)
      for (const child of node.children ?? []) walk(child as never)
    }
    walk(root)
    return ids
  }

  async function openEditor(
    P: string,
    user: 'alice' | 'bob' = 'alice',
    viewport = { width: 1440, height: 900 },
  ): Promise<{ page: Page; close: () => Promise<void>; patches: string[]; received: string[] }> {
    const { context, page } = await stack.openTab(stack.users[user], { viewport })
    const patches: string[] = []
    const received: string[] = []
    page.on('websocket', (socket) => {
      socket.on('framesent', (frame) => {
        const text = typeof frame.payload === 'string' ? frame.payload : frame.payload.toString()
        if (text.includes('"type":"patch"')) patches.push(text)
      })
      socket.on('framereceived', (frame) => {
        const text = typeof frame.payload === 'string' ? frame.payload : frame.payload.toString()
        const kind = /"type":"([^"]+)"/.exec(text)?.[1]
        if (kind !== undefined) received.push(kind)
      })
    })
    await page.goto(P)
    await canvasFrame(page).locator('[data-wb-id]').first().waitFor()
    return { page, close: () => context.close(), patches, received }
  }

  async function openPalette(page: Page): Promise<void> {
    await page.getByRole('contentinfo', { name: '하단 바' }).getByRole('button', { name: '컴포넌트', exact: true }).click()
    await page.getByRole('region', { name: '컴포넌트 목록' }).waitFor()
  }

  async function only(page: Page, type: string): Promise<void> {
    await page.getByRole('searchbox', { name: '컴포넌트 찾기' }).fill(type)
    await page.locator(`[data-wb-palette-card="${type}"]`).waitFor()
  }

  async function nodeBox(page: Page, id: string) {
    const box = await canvasFrame(page).locator(`[data-wb-id="${id}"]`).boundingBox()
    if (box === null) throw new Error(`캔버스에 ${id} 상자가 없다`)
    return box
  }

  async function spotIn(page: Page, id: string, fx: number, fy: number) {
    const box = await nodeBox(page, id)
    return { x: box.x + box.width * fx, y: box.y + box.height * fy }
  }

  async function pick(page: Page, id: string): Promise<void> {
    const at = await spotIn(page, id, 0.5, 0.5)
    await page.mouse.click(at.x, at.y)
  }

  function treeRow(page: Page, id: string) {
    return page.locator(`.wb-shell-region[aria-label="구조 트리"] [data-tree-row][data-tree-id="${id}"]`)
  }

  /** 지금 고른 노드 — 구조 트리의 `aria-current` 줄(뿌리도 센다). */
  async function selectedId(page: Page): Promise<string | null> {
    return page.evaluate(
      () => document.querySelector('.wb-shell-structure-node[aria-current="true"]')?.closest('[data-tree-row]')?.getAttribute('data-tree-id') ?? null,
    )
  }

  async function notice(page: Page): Promise<string> {
    return ((await page.locator('[data-wb-palette-notice]').textContent()) ?? '').trim()
  }

  async function grabCard(page: Page, type: string): Promise<void> {
    const box = (await page.locator(`[data-wb-palette-card="${type}"]`).boundingBox())!
    const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    await page.mouse.move(at.x, at.y)
    await page.mouse.down()
    await page.mouse.move(at.x + 3, at.y - 6, { steps: 3 })
  }

  /** 지금 보인 놓을 자리(`./editor-stack.ts` 의 `shownDrops` — 트리의 선 · 캔버스의 배치 미리보기). */
  async function indicators(page: Page): Promise<{ placement: string | null; y: number }[]> {
    return (await shownDrops(page)).map((drop) => ({ placement: drop.placement, y: Math.round(drop.rect.y) }))
  }

  async function bobOps(P: string, ops: unknown[]): Promise<number> {
    const head = (await stack.request(bob, 'GET', P)).body.headSeq as number
    return (await stack.request(bob, 'PATCH', `${P}/ops`, { baseSeq: head, ops })).status
  }

  /** 그 카드의 «넣기» 단추(`palette/component-palette.tsx` 머리말 «카드 — 끌면 놓고, 단추로 넣는다»). */
  function addButton(page: Page, label: string) {
    return page.getByRole('button', { name: `${label} 넣기`, exact: true })
  }

  /** 한 판에서 고른 것을 세우고 «구분선» 카드의 «넣기» 단추를 눌러, 서버 문서 · 문장 · 고른 노드 · 프레임 수를 낸다. */
  async function clickAdd(page: Page, P: string, patches: string[]) {
    const sentBefore = patches.length
    await addButton(page, '구분선').click()
    await page.waitForTimeout(600)
    const added = await addedIds(P)
    const selected = await selectedId(page)
    return {
      shape: await shape(P),
      notice: await notice(page),
      selectedIsNew: added.length > 0 && selected === added[added.length - 1],
      sent: patches.length - sentBefore,
    }
  }

  describe('클릭 추가', () => {
    it.each([
      ['고른 것 없음', 'none', { n_root: ['n_text', { n_card: ['n_intx'] }, 'n_empt', 'n_last', '+Divider'] }],
      ['뿌리', 'root', { n_root: ['n_text', { n_card: ['n_intx'] }, 'n_empt', 'n_last', '+Divider'] }],
      ['컨테이너', 'n_card', { n_root: ['n_text', { n_card: ['n_intx', '+Divider'] }, 'n_empt', 'n_last'] }],
      ['잎', 'n_text', { n_root: ['n_text', '+Divider', { n_card: ['n_intx'] }, 'n_empt', 'n_last'] }],
      ['자식이 든 컨테이너 안의 잎', 'n_intx', { n_root: ['n_text', { n_card: ['n_intx', '+Divider'] }, 'n_empt', 'n_last'] }],
    ])('%s → 서버 문서가 그 자리 · 넣은 노드를 고른다 · 프레임 1', async (_label, what, expected) => {
      const { P } = await seed(`rv-click-${what.replace(/_/g, '-')}`, [BASIC])
      const { page, close, patches } = await openEditor(P[0]!)
      try {
        await openPalette(page)
        await only(page, 'Divider')
        if (what === 'none') {
          const last = await nodeBox(page, 'n_last')
          await page.mouse.click(last.x + 200, last.y + last.height + 30)
        } else if (what === 'root') {
          await page.locator('.wb-shell-region[aria-label="구조 트리"] .wb-shell-structure-node').first().click()
        } else await treeRow(page, what).locator('.wb-shell-structure-node').click()
        const before = await selectedId(page)
        const result = await clickAdd(page, P[0]!, patches)
        expect({ ...result, selectedBefore: what === 'none' ? before === null : what === 'root' ? before !== null : before === what }).toEqual({
          shape: expected,
          notice: '',
          selectedIsNew: true,
          sent: 1,
          selectedBefore: true,
        })
      } finally {
        await close()
      }
    })

    it('잎의 바로 뒤 형제를 bob 이 잡았다 → 넣지 않음 · 잠금 문장 · 프레임 0', async () => {
      const { P } = await seed('rv-click-next', [BASIC])
      const b = await openEditor(P[0]!, 'bob')
      const { page, close, patches } = await openEditor(P[0]!)
      try {
        await pick(page, 'n_text')
        await pick(b.page, 'n_card')
        await poll('bob 의 잠금이 alice 에게', () => page.locator('.wb-shell-structure-lock').count(), (n) => n > 0)
        await openPalette(page)
        await only(page, 'Divider')
        const result = await clickAdd(page, P[0]!, patches)
        expect(result).toEqual({ shape: ORIGINAL, notice: '밥님이 편집 중이라 바꿀 수 없습니다', selectedIsNew: false, sent: 0 })
      } finally {
        await close()
        await b.close()
      }
    })

    /**
     * alice 가 카드 안 글(n_intx)을 고른 채 bob 이 그 카드(부모)를 누른다 — bob 의 선택이 서는지(값)와 그 뒤 alice 의 누름. 기록 케이스다.
     */
    it('고른 것의 부모를 bob 이 누른다 → bob 의 선택 · alice 의 누름', async () => {
      const { P } = await seed('rv-click-parent', [BASIC])
      const b = await openEditor(P[0]!, 'bob')
      const { page, close, patches } = await openEditor(P[0]!)
      try {
        await pick(page, 'n_intx')
        await page.waitForTimeout(500)
        const cardTitle = await nodeBox(b.page, 'n_card')
        await b.page.mouse.click(cardTitle.x + cardTitle.width - 10, cardTitle.y + 8)
        await page.waitForTimeout(800)
        const bobSelected = await selectedId(b.page)
        await openPalette(page)
        await only(page, 'Divider')
        const result = await clickAdd(page, P[0]!, patches)
        // eslint-disable-next-line no-console
        console.log(`[리뷰 부모 잠금] ${JSON.stringify({ bobSelected, result })}`)
        expect({ bobSelected, result }).toEqual({
          bobSelected: expect.not.stringMatching(/^n_card$/),
          result: { shape: { n_root: ['n_text', { n_card: ['n_intx', '+Divider'] }, 'n_empt', 'n_last'] }, notice: '', selectedIsNew: true, sent: 1 },
        })
      } finally {
        await close()
        await b.close()
      }
    })

    /**
     * **페이지를 열면 뿌리가 골라진다**(`store/editor-store.ts` 의 `#selectionFor` — 남이 막지 않으면 뿌리). 그 채 bob 이 아무 노드(n_last)를
     * 고르면 `lockedBy(뿌리)` 가 자손의 잠금도 보아 막음으로 센다. 같은 편집(뿌리 끝에 넣기)을 bob 의 잠금 아래 REST 로 보내면 서버는
     * 받으므로, 판은 고른 노드의 잠금을 «그 뒤» 에 넣는 잎에만 먼저 보고 «안 끝» 은 편집 판정에 맡긴다(`palette/palette-add.ts` 머리말).
     * 이 케이스는 «뿌리를 고른 채 남이 다른 노드를 잡아도 페이지 끝에 넣는다» 를 성질로 단언한다 — 앞선 잠금 검사를 모든 고른 노드에
     * 걸면 빨강이다(문장 «밥님이 편집 중이라 고를 수도 바꿀 수도 없습니다» · 프레임 0).
     */
    it('페이지를 연 그대로(뿌리 선택) bob 이 다른 노드를 고르면 → 클릭 추가가 페이지 끝에 넣는다', async () => {
      const { P } = await seed('rv-click-root-lock', [BASIC])
      const { page, close, patches } = await openEditor(P[0]!)
      const b = await openEditor(P[0]!, 'bob')
      try {
        const openedWith = await selectedId(page)
        await pick(b.page, 'n_last')
        await poll('bob 의 잠금이 alice 에게', () => page.locator('.wb-shell-structure-lock').count(), (n) => n > 0)
        await openPalette(page)
        await only(page, 'Divider')
        const result = await clickAdd(page, P[0]!, patches)
        const head = (await call('GET', P[0]!)).body.headSeq as number
        const server = await call('PATCH', `${P[0]!}/ops`, {
          baseSeq: head,
          ops: [{ op: 'add', path: `/root/children/${result.sent === 0 ? 4 : 5}`, value: { id: 'n_probe_end', type: 'Divider' } }],
        })
        // eslint-disable-next-line no-console
        console.log(`[리뷰 뿌리 + 남의 잠금] ${JSON.stringify({ openedWith, result, server: server.status })}`)
        expect({ openedWithRoot: openedWith !== null && !KNOWN.has(openedWith), server: server.status, notice: result.notice, sent: result.sent }).toEqual({
          openedWithRoot: true,
          server: 200,
          notice: '',
          sent: 1,
        })
      } finally {
        await close()
        await b.close()
      }
    })

    /**
     * 판은 페이지를 옮겨도 그대로 서 있으므로(셸과 함께 남는다) 거절 문장은 그것을 세운 판(페이지 · 고른 노드)을 적어 두고 다르면 비운다
     * (`palette/component-palette.tsx` 의 `notice`). «옮긴 페이지에 앞 페이지의 거절 문장이 없다» 를 성질로 단언한다 — 판을 안 보면 빨강이다.
     */
    it('거절 문장이 선 채 페이지를 옮기면 옮긴 페이지에 그 문장이 없다', async () => {
      const { P } = await seed('rv-notice-move', [BASIC, [{ id: 'n_text2', type: 'Text', props: { content: '둘째' } }]])
      const b = await openEditor(P[0]!, 'bob')
      const { page, close, patches } = await openEditor(P[0]!)
      try {
        await pick(page, 'n_text')
        await pick(b.page, 'n_card')
        await poll('bob 의 잠금이 alice 에게', () => page.locator('.wb-shell-structure-lock').count(), (n) => n > 0)
        await openPalette(page)
        await only(page, 'Divider')
        const refused = await clickAdd(page, P[0]!, patches)
        await page.getByRole('link', { name: '쪽2' }).click()
        await page.waitForURL((url) => url.pathname === P[1])
        await canvasFrame(page).locator('[data-wb-id="n_text2"]').waitFor()
        await page.waitForTimeout(300)
        const afterMove = await notice(page)
        // eslint-disable-next-line no-console
        console.log(`[리뷰 거절 문장 옮김] ${JSON.stringify({ refused: refused.notice, afterMove })}`)
        expect({ refused: refused.notice, afterMove }).toEqual({ refused: '밥님이 편집 중이라 바꿀 수 없습니다', afterMove: '' })
      } finally {
        await close()
        await b.close()
      }
    })

    it('자식을 안 받는 부모의 잎(검증 전 문서) → 넣지 않음 · «안에 추가» 설명 · 프레임 0', async () => {
      const { P, pageIds } = await seed('rv-click-invalid', [BASIC])
      // 카드(n_card)의 타입을 단추로 — 단추는 자식을 안 받는다. 서버 검증을 지나지 않는 문서다.
      await stack.query(`UPDATE pages SET schema = jsonb_set(schema, '{root,children,1,type}', '"Button"') WHERE id = $1`, [pageIds[0]])
      const { page, close, patches } = await openEditor(P[0]!)
      try {
        await treeRow(page, 'n_intx').locator('.wb-shell-structure-node').click()
        const before = await selectedId(page)
        await openPalette(page)
        await only(page, 'Divider')
        const result = await clickAdd(page, P[0]!, patches)
        expect({ before, notice: result.notice, sent: result.sent }).toEqual({
          before: 'n_intx',
          notice: '자식을 담을 수 있는 타입이어야 하고, children이 배열이어야 합니다',
          sent: 0,
        })
      } finally {
        await close()
      }
    })

    it('빠르게 두 번 누름 — 누른 수만큼 넣고, 둘째는 첫째가 넣은(고른) 노드 뒤다(기록)', async () => {
      const { P } = await seed('rv-click-dbl', [BASIC])
      const { page, close, patches } = await openEditor(P[0]!)
      try {
        await openPalette(page)
        await only(page, 'Divider')
        await pick(page, 'n_text')
        await addButton(page, '구분선').dblclick()
        await page.waitForTimeout(800)
        const dbl = { shape: await shape(P[0]!), sent: patches.length }
        // eslint-disable-next-line no-console
        console.log(`[리뷰 두 번 누름] ${JSON.stringify(dbl)}`)
        expect(dbl).toEqual({ shape: { n_root: ['n_text', '+Divider', '+Divider', { n_card: ['n_intx'] }, 'n_empt', 'n_last'] }, sent: 2 })
      } finally {
        await close()
      }
    })

    /**
     * «넣기» 단추는 `<button>` 이라 반복 keydown(`repeat: true`)마다 브라우저가 `click` 을 낸다 — 판은 반복 Enter · Space 를 버린다(`palette/component-palette.tsx`
     * 의 `moveCard`). 이 케이스는 «누른 채 한 번은 넣기 하나» 를 성질로 단언한다 — 그 거름을 떼면 빨강이다(첫 keydown + 반복 다섯 → 넣기 여섯).
     */
    it('Enter 를 누른 채 두면(첫 keydown + 반복 다섯) 넣기는 하나다', async () => {
      const { P } = await seed('rv-click-held', [BASIC])
      const { page, close, patches } = await openEditor(P[0]!)
      try {
        await openPalette(page)
        await only(page, 'Divider')
        await pick(page, 'n_last')
        await addButton(page, '구분선').focus()
        // playwright 는 이미 누른 키의 down 을 `repeat: true` 로 낸다.
        for (let i = 0; i < 6; i += 1) {
          await page.keyboard.down('Enter')
          await page.waitForTimeout(40)
        }
        await page.keyboard.up('Enter')
        await page.waitForTimeout(1000)
        const held = { shape: await shape(P[0]!), sent: patches.length }
        // eslint-disable-next-line no-console
        console.log(`[리뷰 Enter 누른 채] ${JSON.stringify(held)}`)
        expect(held).toEqual({ shape: { n_root: ['n_text', { n_card: ['n_intx'] }, 'n_empt', 'n_last', '+Divider'] }, sent: 1 })
      } finally {
        await close()
      }
    })

    it('누르는 사이 bob 이 alice 의 고른 노드를 지우려 한다 → 서버 답 · 뒤의 누름', async () => {
      const { P } = await seed('rv-click-removed', [BASIC])
      const { page, close, patches } = await openEditor(P[0]!)
      try {
        await openPalette(page)
        await only(page, 'Divider')
        await pick(page, 'n_last')
        await page.waitForTimeout(500)
        const removed = await bobOps(P[0]!, [{ op: 'remove', path: '/root/children/3' }])
        await page.waitForTimeout(500)
        const result = await clickAdd(page, P[0]!, patches)
        // eslint-disable-next-line no-console
        console.log(`[리뷰 고른 노드 지움] ${JSON.stringify({ removed, result })}`)
        expect({ removed, result }).toEqual({
          removed: 423,
          result: { shape: { n_root: ['n_text', { n_card: ['n_intx'] }, 'n_empt', 'n_last', '+Divider'] }, notice: '', selectedIsNew: true, sent: 1 },
        })
      } finally {
        await close()
      }
    })
  })

  describe('축소판', () => {
    it.each([1440, 1024, 800])('창 폭 %i — 카드 판을 처음 · 가운데 · 끝까지(세로로) 밀어도 표본이 카드 창 안 · 중심 차 1px 안', async (width) => {
      const { P } = await seed(`rv-thumb-${width}`, [BASIC])
      const { page, close } = await openEditor(P[0]!, 'alice', { width, height: 900 })
      try {
        await openPalette(page)
        // 검색어 «» — 갈래 탭이 아니라 카드 전부를 세우려 공백 아닌 한 글자 대신 모든 타입에 든 글을 못 고르므로 탭을 돈다.
        const tabs = page.getByRole('tablist', { name: '갈래' }).getByRole('tab')
        const worst: Record<string, number> = {}
        const outside: string[] = []
        /** 끝까지 민 판의 `scrollTop` — 줄이 판보다 길었던 탭이 하나는 있어야 «민 판»을 잰 것이다(카나리아). */
        let scrolled = 0
        let paletteWidth = 0
        for (let i = 0; i < (await tabs.count()); i += 1) {
          await tabs.nth(i).click()
          for (const at of ['start', 'middle', 'end'] as const) {
            // 카드는 판 폭에 맞춰 여러 줄로 감싸이고 판이 세로로 민다(`src/palette/component-palette.tsx` 의 `PaletteCards`).
            const top = await page.evaluate((where) => {
              const box = document.querySelector('.wb-shell-palette-cards') as HTMLElement
              box.scrollTop = where === 'start' ? 0 : where === 'middle' ? (box.scrollHeight - box.clientHeight) / 2 : box.scrollHeight
              return box.scrollTop
            }, at)
            scrolled = Math.max(scrolled, top)
            const read = await poll(
              '표본이 선다',
              async () => (await page.evaluate(CARD_THUMBS)) as Record<string, { inside: boolean; dx: number | null; dy: number | null }> | null,
              (v) => v !== null && Object.values(v).length > 0 && Object.values(v).every((c) => c.inside),
              3000,
            ).catch(async () => (await page.evaluate(CARD_THUMBS)) as Record<string, { inside: boolean; dx: number | null; dy: number | null }>)
            for (const [type, c] of Object.entries(read ?? {})) {
              if (!c.inside) outside.push(`${type}@${at}`)
              worst[type] = Math.max(worst[type] ?? 0, Math.abs(c.dx ?? 99), Math.abs(c.dy ?? 99))
            }
          }
          paletteWidth = await page.evaluate(() => Math.round(document.querySelector('.wb-shell-palette')!.getBoundingClientRect().width))
        }
        // eslint-disable-next-line no-console
        console.log(`[리뷰 축소판 좌표] 창 ${width} · 판 폭 ${paletteWidth}: ${JSON.stringify(worst)}`)
        expect({
          outside,
          offCenter: Object.entries(worst).filter(([, d]) => d > 1).map(([t, d]) => `${t}:${d}`),
          types: Object.keys(worst).length,
          scrolled: scrolled > 0,
        }).toEqual({
          outside: [],
          offCenter: [],
          types: placeableGroups().flatMap((g) => g.types).length,
          scrolled: true,
        })
      } finally {
        await close()
      }
    })

    it('표본 없는 타입도 카드 창 안에 선다(기록 — 어느 타입이 표본이 없는지)', async () => {
      const missing = placeableGroups()
        .flatMap((g) => g.types)
        .map((t) => t.type)
        .filter((type) => (GALLERY_SAMPLES[type]?.length ?? 0) === 0)
      const { P } = await seed('rv-thumb-missing', [BASIC])
      const { page, close } = await openEditor(P[0]!)
      try {
        await openPalette(page)
        const results: Record<string, boolean> = {}
        for (const type of missing) {
          await only(page, type)
          const read = await poll(
            '표본',
            async () => (await page.evaluate(CARD_THUMBS)) as Record<string, { inside: boolean }> | null,
            (v) => v?.[type]?.inside === true,
            3000,
          ).catch(async () => (await page.evaluate(CARD_THUMBS)) as Record<string, { inside: boolean }>)
          results[type] = read?.[type]?.inside === true
        }
        // eslint-disable-next-line no-console
        console.log(`[리뷰 표본 없는 타입] ${JSON.stringify(results)}`)
        expect(Object.entries(results).filter(([, ok]) => !ok)).toEqual([])
      } finally {
        await close()
      }
    })

    it('bob 이 프로젝트 테마를 system-portal 로 바꾸면 alice 의 축소판도 그 테마로 선다', async () => {
      const { P, projectId } = await seed('rv-thumb-theme', [BASIC], 'owner')
      const manifest = (await call('GET', `/theme-packages/system-portal/${seededVersion('system-portal')}/manifest`)).body
      const portalPrimary = rgb(String(manifest.tokens.items['semantic.primary'].default))
      const { page, close } = await openEditor(P[0]!)
      try {
        await openPalette(page)
        await only(page, 'Button')
        const before = await poll('축소판 단추', async () => String(await page.evaluate(THUMB_BUTTON)), (v) => v !== '단추 없음')
        const bobCall = (m: string, p: string, b?: unknown) => stack.request(bob, m, p, b)
        await putTheme(bobCall, projectId, { themeId: 'system-portal', version: seededVersion('system-portal'), tokens: {} })
        const after = await poll('테마를 따라간다', async () => String(await page.evaluate(THUMB_BUTTON)), (v) => v === portalPrimary).catch(
          async () => String(await page.evaluate(THUMB_BUTTON)),
        )
        const thumbs = await page.evaluate(CARD_THUMBS)
        expect({ changed: before !== portalPrimary, after, thumbsInside: Object.values(thumbs as object).every((c: { inside: boolean }) => c.inside) }).toEqual({
          changed: true,
          after: portalPrimary,
          thumbsInside: true,
        })
      } finally {
        await close()
      }
    })

    // 카드 몸통은 끌기 전용이라 그 누름은 아무것도 안 한다 — 넣지 않고(`sent` 0) 포커스도 안 옮긴다(`BODY`). 재는 것은 iframe 이 안 받는 것이다.
    it('입력(Field) 표본의 컨트롤 자리를 눌러도 iframe 이 클릭 · 포커스를 안 받고 그 카드 몸통이 받는다(넣지 않음)', async () => {
      const { P } = await seed('rv-thumb-input', [BASIC])
      const { page, close, patches } = await openEditor(P[0]!)
      try {
        await openPalette(page)
        await only(page, 'Field')
        await poll('입력 표본', async () => (await page.evaluate(CARD_THUMBS)) as Record<string, { inside: boolean }> | null, (v) => v?.Field?.inside === true)
        await page.evaluate(`(() => {
          const doc = document.querySelector('iframe.wb-shell-palette-thumbs-iframe').contentDocument
          window.__thumbHits = { clicks: 0, focus: 0 }
          doc.addEventListener('click', () => window.__thumbHits.clicks++, true)
          doc.addEventListener('focusin', () => window.__thumbHits.focus++, true)
        })()`)
        const center = (await page.evaluate(`(() => {
          const iframe = document.querySelector('iframe.wb-shell-palette-thumbs-iframe')
          const f = iframe.getBoundingClientRect()
          const el = iframe.contentDocument.querySelector('[data-wb-palette-thumb="Field"] [data-wb-part="control"]')
          if (el === null) return null
          const b = el.getBoundingClientRect()
          return { x: f.left + b.left + b.width / 2, y: f.top + b.top + b.height / 2 }
        })()`)) as { x: number; y: number } | null
        if (center === null) throw new Error('입력 표본에 컨트롤 자리가 없다')
        // 축소판 문서 전체의 포커스 받을 요소 수 — SDK 기본 뷰 · 시스템 테마는 입력을 `<div>` 로 그린다(기록).
        const focusables = await page.evaluate(`document.querySelector('iframe.wb-shell-palette-thumbs-iframe').contentDocument.querySelectorAll('input, select, textarea, button, a[href], [tabindex]').length`)
        const top = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[data-wb-palette-card]')?.getAttribute('data-wb-palette-card') ?? null, center)
        await page.mouse.click(center.x, center.y)
        await page.keyboard.type('ab')
        await page.waitForTimeout(500)
        const active = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.getAttribute('data-wb-palette-card') ?? document.activeElement?.tagName ?? null)
        const hits = await page.evaluate('window.__thumbHits')
        expect({ top, hits, active, sent: patches.length, focusables }).toEqual({ top: 'Field', hits: { clicks: 0, focus: 0 }, active: 'BODY', sent: 0, focusables: 0 })
      } finally {
        await close()
      }
    })
  })

  describe('판 열고 접기 · 높이', () => {
    it('뷰 모드로 바꾸면 판 · 토글이 없고, 편집 모드로 돌아오면 기억대로 열린다 · 페이지를 옮겨도 열린 채 표본이 선다', async () => {
      const { P } = await seed('rv-open-mode', [BASIC, [{ id: 'n_text2', type: 'Text', props: { content: '둘째' } }]])
      const { page, close } = await openEditor(P[0]!)
      try {
        await openPalette(page)
        await only(page, 'Button')
        const footer = page.getByRole('contentinfo', { name: '하단 바' })
        await page.getByRole('button', { name: '뷰 모드' }).click()
        await page.waitForTimeout(300)
        const inView = { palette: await page.getByRole('region', { name: '컴포넌트 목록' }).count(), toggle: await footer.getByRole('button', { name: '컴포넌트', exact: true }).count() }
        await page.getByRole('button', { name: '편집 모드' }).click()
        await page.getByRole('region', { name: '컴포넌트 목록' }).waitFor()
        const back = await page.getByRole('region', { name: '컴포넌트 목록' }).count()
        await page.getByRole('link', { name: '쪽2' }).click()
        await page.waitForURL((url) => url.pathname === P[1])
        await canvasFrame(page).locator('[data-wb-id="n_text2"]').waitFor()
        const afterMove = await page.getByRole('region', { name: '컴포넌트 목록' }).count()
        const thumbs = await poll(
          '옮긴 뒤 표본',
          async () => (await page.evaluate(CARD_THUMBS)) as Record<string, { inside: boolean }> | null,
          (v) => v !== null && Object.values(v).length > 0 && Object.values(v).every((c) => c.inside),
          5000,
        ).catch(async () => (await page.evaluate(CARD_THUMBS)) as Record<string, { inside: boolean }> | null)
        const query = await page.getByRole('searchbox', { name: '컴포넌트 찾기' }).inputValue()
        // eslint-disable-next-line no-console
        console.log(`[리뷰 판 모드 · 옮김] ${JSON.stringify({ inView, back, afterMove, query, thumbs })}`)
        expect({ inView, back, afterMove, thumbsOk: thumbs !== null && Object.values(thumbs).length > 0 && Object.values(thumbs).every((c) => c.inside) }).toEqual({
          inView: { palette: 0, toggle: 0 },
          back: 1,
          afterMove: 1,
          thumbsOk: true,
        })
      } finally {
        await close()
      }
    })

    it('판을 연 bob 이 viewer 로 강등되면 판 · 토글이 걷히고, editor 로 돌아오면 다시 선다', async () => {
      const { P, projectId } = await seed('rv-open-demote', [BASIC])
      const b = await openEditor(P[0]!, 'bob')
      try {
        await openPalette(b.page)
        const members = (await call('GET', `/projects/${projectId}/members`)).body as { userId: string; email: string }[]
        const bobId = members.find((m) => m.email === stack.users.bob.email)!.userId
        const demote = (await call('PATCH', `/projects/${projectId}/members/${bobId}`, { role: 'viewer' })).status
        const gone = await poll('판이 걷힌다', () => b.page.getByRole('region', { name: '컴포넌트 목록' }).count(), (n) => n === 0, 6000).catch(() =>
          b.page.getByRole('region', { name: '컴포넌트 목록' }).count(),
        )
        const toggle = await b.page.getByRole('contentinfo', { name: '하단 바' }).getByRole('button', { name: '컴포넌트', exact: true }).count()
        const promote = (await call('PATCH', `/projects/${projectId}/members/${bobId}`, { role: 'editor' })).status
        const back = await poll('다시 선다', () => b.page.getByRole('region', { name: '컴포넌트 목록' }).count(), (n) => n === 1, 6000).catch(() =>
          b.page.getByRole('region', { name: '컴포넌트 목록' }).count(),
        )
        expect({ demote, gone, toggle, promote, back }).toEqual({ demote: 200, gone: 0, toggle: 0, promote: 200, back: 1 })
      } finally {
        await b.close()
      }
    })

    /**
     * 창 700 · 판 최대 · 하단 바에 통지 다섯(실제 통지 꼴의 `<p role="status">` 를 통지 무리에 얹는다 — 통지 다섯을 실제로 세우는 판은 이
     * 트랙 밖이다). 셸이 넘치지 않는지 · 하단 바가 창 안인지 · 하단 바가 자란 만큼 판이 줄어 캔버스 칸이 `CANVAS_MIN_HEIGHT` 를 지키는지를
     * 잰다(판 최대는 잰 하단 바로 셈한다 — `shell/sidebar-layout.ts` 머리말 «하단 판의 높이»). 통지를 걷으면 판이 기억한 높이로 돌아온다.
     */
    it('창 700 · 최대 판 · 통지 다섯 — 셸이 넘치지 않고 하단 바가 창 안이며 판이 줄어 캔버스 칸이 최소를 지킨다', async () => {
      const { P } = await seed('rv-open-700', [BASIC])
      const { page, close } = await openEditor(P[0]!, 'alice', { width: 1440, height: 700 })
      try {
        await openPalette(page)
        await page.getByRole('separator', { name: '컴포넌트 목록 높이' }).focus()
        await page.keyboard.press('End')
        const atMax = await page.evaluate(() => Math.round(document.querySelector('.wb-shell-palette')!.getBoundingClientRect().height))
        await page.evaluate(() => {
          const box = document.querySelector('.wb-shell-footer-notices')!
          for (let i = 0; i < 5; i += 1) {
            const p = document.createElement('p')
            p.className = 'wb-shell-remote-alert'
            p.setAttribute('role', 'status')
            p.textContent = `통지 ${i + 1} — 남이 이 페이지를 바꿔 화면이 낡았습니다. 다시 불러오면 서버의 판으로 돌아갑니다.`
            box.appendChild(p)
          }
        })
        await page.waitForTimeout(300)
        const seen = await page.evaluate(() => {
          const h = (s: string) => Math.round(document.querySelector(s)!.getBoundingClientRect().height)
          const shell = document.querySelector('.wb-shell') as HTMLElement
          const footer = document.querySelector('.wb-shell-footer')!.getBoundingClientRect()
          return {
            canvas: h('.wb-shell-canvas'),
            palette: h('.wb-shell-palette'),
            footer: h('.wb-shell-footer'),
            overflow: shell.scrollHeight - shell.clientHeight,
            footerInWindow: footer.bottom <= innerHeight + 0.5,
            notices: document.querySelectorAll('.wb-shell-footer-notices > [role]').length,
          }
        })
        await page.evaluate(() => {
          for (const p of document.querySelectorAll('.wb-shell-footer-notices > .wb-shell-remote-alert')) p.remove()
        })
        await page.waitForTimeout(300)
        const cleared = await page.evaluate(() => Math.round(document.querySelector('.wb-shell-palette')!.getBoundingClientRect().height))
        // eslint-disable-next-line no-console
        console.log(`[리뷰 창 700 최대 판 통지 다섯] ${JSON.stringify({ atMax, ...seen, cleared })}`)
        expect({
          overflow: seen.overflow,
          footerInWindow: seen.footerInWindow,
          notices: seen.notices,
          canvasKept: seen.canvas >= CANVAS_MIN_HEIGHT,
          cleared,
        }).toEqual({ overflow: 0, footerInWindow: true, notices: 5, canvasKept: true, cleared: atMax })
      } finally {
        await close()
      }
    })

    /**
     * 통지가 판을 조인 동안 손잡이를 만진다 — 키우는 몸짓(ArrowUp · End · 위로 끌기)은 그린 최대에 막혀 화면이 그대로이고 기억한 높이도
     * 그대로여야 한다(통지가 걷히면 · 새로 고치면 앞 높이). 줄이는 몸짓(ArrowDown · 아래로 끌기)은 **그린 높이에서** 한 번에 움직이고 그
     * 높이를 기억한다(`shell/sidebar-layout.ts` 의 `setPaletteHeight`). 창 700 은 조인 판이 최소에 붙어 줄임이 1px 이라 창 800 에서도 잰다.
     */
    it('통지가 판을 조인 동안 손잡이를 만져도 기억한 높이가 통지에 안 눌린다 — 줄이는 몸짓은 그린 높이에서 움직인다', async () => {
      const { P } = await seed('rv-open-press', [BASIC])
      const seen: Record<string, unknown> = {}
      for (const height of [700, 800]) {
        const { page, close } = await openEditor(P[0]!, 'alice', { width: 1440, height })
        try {
          await openPalette(page)
          const handle = page.getByRole('separator', { name: '컴포넌트 목록 높이' })
          const drawn = () => page.evaluate(() => Math.round(document.querySelector('.wb-shell-palette')!.getBoundingClientRect().height))
          const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('wirebound.editor.sidebar') ?? '{}').paletteHeight as number | undefined)
          const notices = async (on: boolean) => {
            await page.evaluate((add) => {
              const box = document.querySelector('.wb-shell-footer-notices')!
              for (const p of box.querySelectorAll('.wb-test-notice')) p.remove()
              for (let i = 0; add && i < 5; i += 1) {
                const p = document.createElement('p')
                p.className = 'wb-shell-remote-alert wb-test-notice'
                p.setAttribute('role', 'status')
                p.textContent = `통지 ${i + 1} — 남이 이 페이지를 바꿔 화면이 낡았습니다. 다시 불러오면 서버의 판으로 돌아갑니다.`
                box.appendChild(p)
              }
            }, on)
            await page.waitForTimeout(300)
          }
          const drag = async (dy: number) => {
            const box = (await handle.boundingBox())!
            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
            await page.mouse.down()
            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + dy, { steps: 4 })
            await page.mouse.up()
          }
          const gestures: Record<string, () => Promise<void>> = {
            ArrowUp: () => handle.press('ArrowUp'),
            End: () => handle.press('End'),
            dragUp: () => drag(-40),
            ArrowDown: () => handle.press('ArrowDown'),
            dragDown: () => drag(30),
          }
          for (const [name, gesture] of Object.entries(gestures)) {
            await notices(false)
            await handle.press('End')
            const max = { drawn: await drawn(), stored: await stored() }
            await notices(true)
            const squeezed = await drawn()
            await gesture()
            await page.waitForTimeout(150)
            const touched = { drawn: await drawn(), stored: await stored() }
            await notices(false)
            seen[`${height} ${name}`] = { max, squeezed, touched, cleared: await drawn() }
          }
          await handle.press('End')
          await notices(true)
          await handle.press('ArrowUp')
          await page.reload()
          // 열림은 기억된다 — 토글을 다시 누르면 닫힌다.
          await page.getByRole('region', { name: '컴포넌트 목록' }).waitFor()
          await page.waitForTimeout(300)
          seen[`${height} 새로 고침`] = { drawn: await drawn(), stored: await stored() }
        } finally {
          await close()
        }
      }
      // eslint-disable-next-line no-console
      console.log(`[통지 중 손잡이] ${JSON.stringify(seen)}`)
      const at = (key: string) => seen[key] as { max: { drawn: number; stored: number }; squeezed: number; touched: { drawn: number; stored: number }; cleared: number }
      const verdict: Record<string, unknown> = {}
      for (const height of [700, 800]) {
        for (const name of ['ArrowUp', 'End', 'dragUp']) {
          const v = at(`${height} ${name}`)
          verdict[`${height} ${name}`] = { screen: v.touched.drawn === v.squeezed, stored: v.touched.stored === v.max.stored, cleared: v.cleared === v.max.drawn }
        }
        for (const [name, step] of [['ArrowDown', 16], ['dragDown', 30]] as const) {
          const v = at(`${height} ${name}`)
          const want = Math.max(220, v.squeezed - step)
          verdict[`${height} ${name}`] = { screen: v.touched.drawn === want, stored: v.touched.stored === want, cleared: v.cleared === want }
        }
        const reloaded = seen[`${height} 새로 고침`] as { drawn: number }
        verdict[`${height} 새로 고침`] = reloaded.drawn === at(`${height} ArrowUp`).max.drawn
      }
      const ok = { screen: true, stored: true, cleared: true }
      expect(verdict).toEqual({
        '700 ArrowUp': ok, '700 End': ok, '700 dragUp': ok, '700 ArrowDown': ok, '700 dragDown': ok, '700 새로 고침': true,
        '800 ArrowUp': ok, '800 End': ok, '800 dragUp': ok, '800 ArrowDown': ok, '800 dragDown': ok, '800 새로 고침': true,
      })
    })

    it('판을 연 채 화면 맞춤 — 줌이 판을 닫은 판과 같다', async () => {
      const { P } = await seed('rv-open-fit', [BASIC])
      const { page, close } = await openEditor(P[0]!, 'alice', { width: 1024, height: 700 })
      try {
        const zoomGroup = page.getByRole('group', { name: '줌' })
        const fit = page.locator('.wb-shell-zoom-fit')
        const value = async () => (await zoomGroup.locator('.wb-shell-zoom-value').textContent())?.trim()
        await fit.click()
        const closed = await value()
        await zoomGroup.getByRole('button').first().click()
        await openPalette(page)
        await fit.click()
        const opened = await value()
        const hscroll = await page.evaluate(() => {
          const c = document.querySelector('.wb-shell-canvas') as HTMLElement
          return c.scrollWidth - c.clientWidth
        })
        expect({ closed, opened, hscroll }).toEqual({ closed, opened: closed, hscroll: 0 })
      } finally {
        await close()
      }
    })
  })

  describe('카드 끌기 중 남의 편집', () => {
    async function armed(P: string) {
      const tab = await openEditor(P)
      await openPalette(tab.page)
      await only(tab.page, 'Divider')
      await grabCard(tab.page, 'Divider')
      await tab.page.mouse.move(...(Object.values(await spotIn(tab.page, 'n_empt', 0.5, 0.5)) as [number, number]), { steps: 8 })
      return { ...tab, armedHint: (await indicators(tab.page)).map((h) => h.placement) }
    }

    it('bob 이 그 카드를 고르면 표시가 걷히고 조금 움직였다 놓아도 편집이 없다', async () => {
      const { P } = await seed('rv-drag-lock', [BASIC])
      const b = await openEditor(P[0]!, 'bob')
      const { page, close, patches, armedHint } = await armed(P[0]!)
      try {
        await pick(b.page, 'n_empt')
        await poll('잠금', () => page.locator('.wb-shell-structure-lock').count(), (n) => n > 0)
        const still = (await indicators(page)).length
        const here = await spotIn(page, 'n_empt', 0.5, 0.5)
        await page.mouse.move(here.x + 1, here.y + 1)
        const moved = (await indicators(page)).length
        await page.mouse.up()
        await page.waitForTimeout(500)
        expect({ armedHint, still, moved, sent: patches.length, shape: await shape(P[0]!) }).toEqual({ armedHint: ['inside'], still: 0, moved: 0, sent: 0, shape: ORIGINAL })
      } finally {
        await close()
        await b.close()
      }
    })

    it('bob 이 그 카드를 지우면 표시가 걷히고 조금 움직였다 놓아도 그 밑의 다른 자리로 안 간다', async () => {
      const { P } = await seed('rv-drag-remove', [BASIC])
      const { page, close, patches, armedHint } = await armed(P[0]!)
      try {
        const here = await spotIn(page, 'n_empt', 0.5, 0.5)
        const removed = await bobOps(P[0]!, [{ op: 'remove', path: '/root/children/2' }])
        await canvasFrame(page).locator('[data-wb-id="n_empt"]').waitFor({ state: 'detached' })
        const still = (await indicators(page)).length
        await page.mouse.move(here.x + 1, here.y + 1)
        const moved = (await indicators(page)).map((h) => h.placement)
        await page.mouse.up()
        await page.waitForTimeout(500)
        expect({ armedHint, removed, still, sent: patches.length, shape: await shape(P[0]!), moved }).toEqual({
          armedHint: ['inside'],
          removed: 200,
          still: 0,
          sent: 0,
          shape: { n_root: ['n_text', { n_card: ['n_intx'] }, 'n_last'] },
          moved: expect.any(Array),
        })
      } finally {
        await close()
      }
    })

    /**
     * 표시 «n_last 앞» 을 세운 채 bob 이 위 글(n_text)을 길게 고쳐 n_last 가 밀린다. D1 의 손잡이 판(`./canvas-drop-review.test.ts` «bob 이 위
     * 노드의 글을 길게 고쳐 …»)과 같은 성질 — 다시 잰 뒤 표시가 걷히고 놓은 자리가 보인 자리거나 편집 0 — 을 카드 출처로 단언한다. 판은
     * 캔버스의 형제라 캔버스가 다시 잰 것을 경로 층으로 받아 끌기 장치의 `refresh` 를 부른다(`drag/use-placement.ts` 의 `useCanvasRemeasured`) —
     * 그 구독을 떼면 빨강이다(표시가 옛 y 에 남는다 · 놓으면 편집 0). 표시를 걷기만 하는 판은 아래 대조군이 잡는다.
     */
    it('bob 이 위 글을 길게 고쳐 표시한 노드가 밀리면 표시가 걷히고 놓은 자리가 보인 자리거나 편집 0 이다', async () => {
      const { P } = await seed('rv-drag-shift', [BASIC])
      const tab = await openEditor(P[0]!)
      const { page, close } = tab
      try {
        await openPalette(page)
        await only(page, 'Divider')
        await grabCard(page, 'Divider')
        const lastBox = await nodeBox(page, 'n_last')
        await page.mouse.move(lastBox.x + lastBox.width * 0.3, lastBox.y + lastBox.height * 0.1, { steps: 8 })
        const armedHint = await indicators(page)
        const status = await bobOps(P[0]!, [{ op: 'replace', path: '/root/children/0/props/content', value: '아주 긴 글 '.repeat(120) }])
        await poll('밀린다', async () => (await nodeBox(page, 'n_last')).y, (y) => y > lastBox.y + 40)
        await page.waitForTimeout(150)
        const afterShift = await indicators(page)
        const lastNow = Math.round((await nodeBox(page, 'n_last')).y)
        await page.mouse.up()
        await page.waitForTimeout(800)
        const final = await shape(P[0]!)
        // eslint-disable-next-line no-console
        console.log(`[리뷰 카드 끌기 밀림] ${JSON.stringify({ armedHint, status, afterShift, lastNow, final })}`)
        expect({ armed: armedHint.map((h) => h.placement), status, afterShift }).toEqual({ armed: ['before'], status: 200, afterShift: [] })
        expect([ORIGINAL, { n_root: ['n_text', { n_card: ['n_intx'] }, 'n_empt', '+Divider', 'n_last'] }]).toContainEqual(final)
      } finally {
        await close()
      }
    })

    /**
     * 대조군 — 표시한 자리를 안 미는 남의 편집(위 글을 짧게 고침)에도 캔버스는 다시 잰다(`layoutKey` 의 `doc`). 판의 끌기가 그때 마지막
     * 좌표로 **다시 묻고**(같은 자리면 그대로) 표시를 걷기만 하지 않는지 — 표시가 남고 놓으면 보인 자리(n_last 앞)에 선다. D1 의 손잡이
     * 대조군(`./canvas-drop-review.test.ts` «bob 이 아래 다른 노드의 글을 고쳐도»)과 같은 성질이다.
     */
    it('bob 이 표시한 노드를 안 미는 편집을 하면 표시가 남고 놓으면 보인 자리에 선다', async () => {
      const { P } = await seed('rv-drag-noshift', [BASIC])
      const tab = await openEditor(P[0]!)
      const { page, close } = tab
      try {
        await openPalette(page)
        await only(page, 'Divider')
        await grabCard(page, 'Divider')
        const lastBox = await nodeBox(page, 'n_last')
        await page.mouse.move(lastBox.x + lastBox.width * 0.3, lastBox.y + lastBox.height * 0.1, { steps: 8 })
        const armed = (await indicators(page)).map((h) => h.placement)
        const status = await bobOps(P[0]!, [{ op: 'replace', path: '/root/children/0/props/content', value: '글 고침' }])
        await canvasFrame(page).locator('[data-wb-id="n_text"]', { hasText: '글 고침' }).waitFor()
        await page.waitForTimeout(150)
        const stillShown = (await indicators(page)).map((h) => h.placement)
        const lastNow = Math.round((await nodeBox(page, 'n_last')).y)
        await page.mouse.up()
        const final = await poll('서버 문서', () => shape(P[0]!), (s) => JSON.stringify(s) !== JSON.stringify(ORIGINAL), 3000).catch(() => shape(P[0]!))
        // eslint-disable-next-line no-console
        console.log(`[리뷰 카드 끌기 안 밀림] ${JSON.stringify({ armed, status, stillShown, lastBefore: Math.round(lastBox.y), lastNow, final })}`)
        expect({ armed, status, stillShown, final }).toEqual({
          armed: ['before'],
          status: 200,
          stillShown: ['before'],
          final: { n_root: ['n_text', { n_card: ['n_intx'] }, 'n_empt', '+Divider', 'n_last'] },
        })
      } finally {
        await close()
      }
    })

    it('끄는 중 viewer 로 강등되면 판 · 표시가 걷히고 떼도 편집 0 이다', async () => {
      const { P, projectId } = await seed('rv-drag-demote', [BASIC], 'owner')
      const a = await openEditor(P[0]!)
      try {
        await openPalette(a.page)
        await only(a.page, 'Divider')
        await grabCard(a.page, 'Divider')
        const empty = await nodeBox(a.page, 'n_empt')
        await a.page.mouse.move(empty.x + empty.width / 2, empty.y + empty.height / 2, { steps: 8 })
        const armedHint = (await indicators(a.page)).map((h) => h.placement)
        const members = (await stack.request(bob, 'GET', `/projects/${projectId}/members`)).body as { userId: string; email: string }[]
        const aliceId = members.find((m) => m.email === stack.users.alice.email)!.userId
        const demote = (await stack.request(bob, 'PATCH', `/projects/${projectId}/members/${aliceId}`, { role: 'viewer' })).status
        await poll('강등 소식', async () => a.received.includes('membership-changed'), (got) => got, 5000)
        await a.page.waitForTimeout(1000)
        const afterDemote = { palette: await a.page.getByRole('region', { name: '컴포넌트 목록' }).count(), shown: (await indicators(a.page)).length }
        await a.page.mouse.move(empty.x + empty.width / 2 + 6, empty.y + empty.height / 2)
        const afterMove = (await indicators(a.page)).length
        await a.page.mouse.up()
        await a.page.waitForTimeout(600)
        expect({ armedHint, demote, afterDemote, afterMove, sent: a.patches.length, doc: await shape(P[0]!) }).toEqual({
          armedHint: ['inside'],
          demote: 200,
          afterDemote: { palette: 0, shown: 0 },
          afterMove: 0,
          sent: 0,
          doc: ORIGINAL,
        })
      } finally {
        await a.close()
      }
    })

    it('카드를 머리(캔버스 · 트리 밖)에 놓으면 표시가 없고 편집이 없다', async () => {
      const { P } = await seed('rv-drag-out', [BASIC])
      const { page, close, patches } = await openEditor(P[0]!)
      try {
        await openPalette(page)
        await only(page, 'Divider')
        await grabCard(page, 'Divider')
        const head = (await page.locator('.wb-shell-header').boundingBox())!
        await page.mouse.move(head.x + head.width / 2, head.y + head.height / 2, { steps: 8 })
        const shown = (await indicators(page)).length
        await page.mouse.up()
        await page.waitForTimeout(500)
        expect({ shown, sent: patches.length, shape: await shape(P[0]!) }).toEqual({ shown: 0, sent: 0, shape: ORIGINAL })
      } finally {
        await close()
      }
    })
  })
})
