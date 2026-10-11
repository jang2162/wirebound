/**
 * **E1 좁은 반증이 실브라우저로 찾은 판을 잠근다**(`docs/superpowers/plans/2026-10-03-e1-review-2.md` 의 R1 ~ R4). 앞 리뷰의 판은
 * `./editor-shortcuts-review.test.ts` 가 갖는다.
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | R1 열린 줄 메뉴 | 메뉴가 열린 채 선택이 옮으면(Cmd+V · Cmd+D · 캔버스 ↓) 그 메뉴의 «삭제»가 연 줄이 아니라 새 노드를 지운다 |
 * | R2 · R3 죽은 자리 | 고르개가 선 동안 · 우측 패널 탭을 누른 뒤 Delete · ↓ · Escape 가 아무것도 안 한다 · 고르개 안의 Escape 가 고르개를 안 닫는다 |
 * | R4 같은 페이지 다시 싣기 | 붙이는 사이 같은 페이지를 다시 실은 판(재연결 · 복원 다시 불러오기 · 편집 실패 수습)의 붙이기를 «옮겨»로 버리고 앞 통지를 덮는다 |
 *
 * 서버 문서(`GET …/pages/:id`)로 단언한다.
 */
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canvasFrame, editorStackPrerequisite, poll, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

const T = (id: string, content: string) => ({ id, type: 'Text', props: { content } })
const C = (id: string, title: string, children: unknown[]) => ({ id, type: 'Card', props: { title }, children })
const B = (id: string, label: string, extra: Record<string, unknown> = {}) => ({ id, type: 'Button', props: { label }, ...extra })
const GO = () => B('n_btngo000001', '가기', { interactions: [{ on: 'click', actions: [{ type: 'navigate', target: 'page:메뉴/둘째' }] }] })

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe.skipIf(!전제.ok)('E1 좁은 반증 대응 — 실브라우저', () => {
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
    expect(before.databases).toBe(1)
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  })

  /** 서버의 그 페이지 — 뿌리 자식을 글자로(카드는 `제목[자식…]`) 이은 것과 `headSeq`. */
  async function shape(P: string): Promise<{ shape: string; headSeq: number }> {
    const response = await stack.request(alice, 'GET', P)
    const text = (node: { id?: string; props?: Record<string, unknown>; children?: unknown[] }): string => {
      const label = String(node.props?.content ?? node.props?.title ?? node.props?.label ?? node.id)
      const children =
        Array.isArray(node.children) && node.children.length > 0 ? `[${node.children.map((c) => text(c as typeof node)).join(',')}]` : ''
      return label + children
    }
    return { shape: (response.body.schema.root.children ?? []).map(text).join(','), headSeq: response.body.headSeq }
  }

  /** 편집이 멎을 때까지 기다린 서버 값. */
  async function settled(P: string): Promise<{ shape: string; headSeq: number }> {
    let last = ''
    for (let i = 0; i < 20; i += 1) {
      await sleep(250)
      const now = JSON.stringify(await shape(P))
      if (now === last) break
      last = now
    }
    return shape(P)
  }

  async function open(P: string, origin?: string): Promise<{ page: Page; close: () => Promise<void> }> {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 }, origin })
    await page.goto(P)
    await page.locator('iframe.wb-shell-canvas-iframe').waitFor()
    await canvasFrame(page).locator('[data-wb-id]').first().waitFor()
    return { page, close: () => context.close() }
  }

  const selected = (page: Page) =>
    page.evaluate(() => {
      const button = document.querySelector('[data-tree-kind="node"] > button[aria-current="true"]')
      return button === null ? null : button.parentElement!.getAttribute('data-tree-id')
    })
  const row = (page: Page, id: string) => page.locator(`[data-tree-id="${id}"] > button.wb-shell-structure-node`)
  /** 그 줄의 `+`(0) · `…`(1). */
  const rowMenu = (page: Page, id: string, which: 0 | 1) => page.locator(`[data-tree-id="${id}"] button[aria-haspopup="menu"]`).nth(which)
  const item = (page: Page, name: string) => page.getByRole('menuitem', { name, exact: true })
  const pickers = (page: Page) => page.locator('.wb-shell-picker').count()

  /**
   * 줄 «글 4»의 `…` 를 연 채 길 하나 → 메뉴가 남았으면 그 메뉴의 «삭제». 머리말: «글 0» Cmd+D(되돌릴 편집) · «글 5» Cmd+C(봉투).
   * **선택을 옮기는 길(Cmd+V · Cmd+D · 캔버스 ↓)은 메뉴를 닫는다** — 메뉴의 항목 · 켜고 끔 · 설명이 다 고른 노드의 것이라 선택이 옮으면 메뉴째
   * 낡는다(`shell/action-menu.tsx` 의 `openWhile`). **선택이 그대로인 길(Cmd+Z · 남이 앞 형제를 지움)은 메뉴가 남아 연 줄에 닿는다.**
   */
  it('R1 열린 줄 메뉴 — 선택을 옮기는 길은 메뉴를 닫고, 선택이 그대로인 길에서는 «삭제»가 연 줄을 지운다', async () => {
    const nodes = () => [
      T('n_text0000000', '글 0'),
      C('n_card0000001', '카드', [T('n_text0000001', '글 1'), T('n_text0000002', '글 2')]),
      T('n_text0000004', '글 4'),
      T('n_text0000005', '글 5'),
    ]
    const paths: [string, (page: Page, P: string) => Promise<void>][] = [
      ['Cmd+V', (page) => page.keyboard.press('ControlOrMeta+v')],
      ['Cmd+D', (page) => page.keyboard.press('ControlOrMeta+d')],
      [
        '캔버스 포커스 ↓',
        async (page) => {
          // 메뉴를 닫지 않고 캔버스로 포커스를 옮기는 길은 프로그램뿐이다(누름은 메뉴를 먼저 닫는다).
          await page.evaluate(() => document.querySelector<HTMLIFrameElement>('iframe.wb-shell-canvas-iframe')!.contentWindow!.focus())
          await page.keyboard.press('ArrowDown')
        },
      ],
      ['Cmd+Z', (page) => page.keyboard.press('ControlOrMeta+z')],
      [
        '남이 앞 형제를 지움',
        async (_page, P) => {
          const now = await stack.request(bob, 'GET', P)
          const at = now.body.schema.root.children.findIndex((n: { id: string }) => n.id === 'n_card0000001')
          const response = await stack.request(bob, 'PATCH', `${P}/ops`, {
            baseSeq: now.body.headSeq,
            ops: [{ op: 'remove', path: `/root/children/${at}` }],
          })
          if (response.status >= 300) throw new Error(`bob ${response.status}`)
          await sleep(800)
        },
      ],
    ]
    const results: unknown[] = []
    for (const [name, act] of paths) {
      const { P } = await fixture(stack, alice, 'r1', nodes())
      const { page, close } = await open(P)
      try {
        await canvasFrame(page).locator('[data-wb-id="n_text0000000"]').click()
        await page.keyboard.press('ControlOrMeta+d')
        await poll(
          '머리말의 복제가 서버에 닿는다',
          () => shape(P),
          (s) => s.headSeq === 2,
        )
        await canvasFrame(page).locator('[data-wb-id="n_text0000005"]').click()
        await page.keyboard.press('ControlOrMeta+c')
        await row(page, 'n_text0000004').click()
        await rowMenu(page, 'n_text0000004', 1).click()
        // 판 카나리아 — 메뉴가 열렸고 포커스가 그 항목이다.
        const focusRole = await page.evaluate(() => document.activeElement?.getAttribute('role'))
        await act(page, P)
        await sleep(400)
        const menus = await page.locator('[role="menu"]').count()
        const movedTo = await selected(page)
        if (menus > 0) {
          await item(page, '삭제').click()
          await sleep(600)
        }
        results.push({ name, focusRole, menus, moved: movedTo !== 'n_text0000004', server: (await settled(P)).shape })
      } finally {
        await close()
      }
    }
    expect(results).toEqual([
      { name: 'Cmd+V', focusRole: 'menuitem', menus: 0, moved: true, server: '글 0,글 0,카드[글 1,글 2],글 4,글 5,글 5' },
      { name: 'Cmd+D', focusRole: 'menuitem', menus: 0, moved: true, server: '글 0,글 0,카드[글 1,글 2],글 4,글 4,글 5' },
      { name: '캔버스 포커스 ↓', focusRole: 'menuitem', menus: 0, moved: true, server: '글 0,글 0,카드[글 1,글 2],글 4,글 5' },
      { name: 'Cmd+Z', focusRole: 'menuitem', menus: 1, moved: false, server: '글 0,카드[글 1,글 2],글 5' },
      { name: '남이 앞 형제를 지움', focusRole: 'menuitem', menus: 1, moved: false, server: '글 0,글 0,글 5' },
    ])
  })

  /**
   * 반증 «항목 1» 의 죽은 자리 — 고르개(«아래 추가» · «패턴 넣기»)가 선 동안 고르개 밖의 키와 우측 패널 탭을 누른 뒤의 키. 칸마다 새 탭.
   * 고르개 표지는 포커스가 고르개 안일 때만 키를 쥐고, 고르개 안의 Escape 는 고르개를 닫는다(`cancelAdd`).
   */
  it('R2 · R3 고르개가 선 동안 고르개 밖 · 우측 패널 탭에서 Delete · ↓ · Escape 가 선다 — 고르개 안의 Escape 는 고르개만 닫는다', async () => {
    const nodes = () => [
      T('n_text0000000', '글 0'),
      C('n_card0000001', '카드', [T('n_text0000001', '글 1'), T('n_text0000002', '글 2'), T('n_text0000003', '글 3')]),
      T('n_text0000004', '글 4'),
      B('n_btn00000001', '단추'),
    ]
    const openAfter = async (page: Page) => {
      await row(page, 'n_text0000002').click()
      await rowMenu(page, 'n_text0000002', 0).click()
      await item(page, '아래 추가').click()
      await page.locator('.wb-shell-picker').waitFor()
    }
    const spots: [string, (page: Page) => Promise<void>][] = [
      [
        'S5b 고르개 연 `+` 토글 · Delete',
        async (page) => {
          await openAfter(page)
          await page.keyboard.press('Delete')
        },
      ],
      [
        'S5c 고르개 · 캔버스 «글 4» · Escape',
        async (page) => {
          await openAfter(page)
          await canvasFrame(page).locator('[data-wb-id="n_text0000004"]').click()
          await page.keyboard.press('Escape')
        },
      ],
      [
        'S5d 패턴 고르개 · 캔버스 «글 4» · ↓',
        async (page) => {
          await row(page, 'n_text0000002').click()
          await rowMenu(page, 'n_text0000002', 0).click()
          await item(page, '패턴 넣기').click()
          await sleep(300)
          await canvasFrame(page).locator('[data-wb-id="n_text0000004"]').click()
          await page.keyboard.press('ArrowDown')
        },
      ],
      [
        'S5f 고르개 · 줌 «확대» · Delete',
        async (page) => {
          await openAfter(page)
          await page.getByRole('button', { name: '확대', exact: true }).click()
          await page.keyboard.press('Delete')
        },
      ],
      [
        'S8 우측 패널 탭 · ↓',
        async (page) => {
          await canvasFrame(page).locator('[data-wb-id="n_text0000002"]').click()
          await page.getByRole('tab', { name: '상호작용' }).click()
          await page.keyboard.press('ArrowDown')
        },
      ],
      [
        'S8 우측 패널 탭 · Escape',
        async (page) => {
          await canvasFrame(page).locator('[data-wb-id="n_text0000002"]').click()
          await page.getByRole('tab', { name: '상호작용' }).click()
          await page.keyboard.press('Escape')
        },
      ],
      [
        'S8 우측 패널 탭 · Delete',
        async (page) => {
          await canvasFrame(page).locator('[data-wb-id="n_text0000002"]').click()
          await page.getByRole('tab', { name: '상호작용' }).click()
          await page.keyboard.press('Delete')
        },
      ],
      [
        '고르개 «취소»에 포커스 · Escape',
        async (page) => {
          await openAfter(page)
          await page.locator('.wb-shell-picker button').last().focus()
          await page.keyboard.press('Escape')
        },
      ],
    ]
    const results: Record<string, unknown> = {}
    for (const [name, act] of spots) {
      const { P } = await fixture(stack, alice, 'r2', nodes())
      const { page, close } = await open(P)
      try {
        await act(page)
        await sleep(400)
        results[name] = { selected: await selected(page), pickers: await pickers(page), server: (await settled(P)).shape }
      } finally {
        await close()
      }
    }
    const all = '글 0,카드[글 1,글 2,글 3],글 4,단추'
    expect(results).toEqual({
      'S5b 고르개 연 `+` 토글 · Delete': { selected: null, pickers: 0, server: '글 0,카드[글 1,글 3],글 4,단추' },
      'S5c 고르개 · 캔버스 «글 4» · Escape': { selected: null, pickers: 0, server: all },
      'S5d 패턴 고르개 · 캔버스 «글 4» · ↓': { selected: 'n_btn00000001', pickers: 1, server: all },
      'S5f 고르개 · 줌 «확대» · Delete': { selected: null, pickers: 0, server: '글 0,카드[글 1,글 3],글 4,단추' },
      'S8 우측 패널 탭 · ↓': { selected: 'n_text0000003', pickers: 0, server: all },
      'S8 우측 패널 탭 · Escape': { selected: null, pickers: 0, server: all },
      'S8 우측 패널 탭 · Delete': { selected: null, pickers: 0, server: '글 0,카드[글 1,글 3],글 4,단추' },
      '고르개 «취소»에 포커스 · Escape': { selected: 'n_text0000002', pickers: 0, server: all },
    })
  })

  /**
   * 페이지 대상 봉투(«가기» — `navigate` → «둘째»)의 붙이기는 페이지 목록(`GET …/tree`)을 읽은 뒤 붙는다 — 그 조회를 붙잡은 사이 같은 페이지를
   * 다시 싣는다. 다시 실은 판은 누른 때의 기준 노드(«글 1»)가 남아 있으면 그 뒤에 붙고, 붙이기는 기다리는 사이 선 통지(다시 싣기의 «되돌리기
   * 이력이 초기화됐습니다» · 수습의 «취소됐습니다»)를 치우지도 덮지도 않는다.
   * 판 카나리아: 붙잡은 조회 수 · V2 는 끊은 WS 수 · V5 · V6 은 가로챈 `patch` 프레임 수. 붙잡는 것은 그 주소의 조회 전부다 — 붙이기의 것 하나에 더해
   * V2 는 재연결의 트리 다시 받기 하나, V4b 는 복원의 `menu-changed`와 배너 단추의 다시 읽기가 트리를 하나씩 더 받는다(`src/tree/use-tree-commands.tsx`). V6 은 붙잡은 조회를 실패시킨다 — 붙이지 못했다는 말이 수습의
   * 통지 뒤에 잇는다(`EditorStore.tellLoss`).
   *
   * **편집 실패는 `page.routeWebSocket` 으로 세운다** — 편집은 WS `patch` 프레임으로 나가 `page.route` 로 `…/ops` 를 가로채면 아무것도 안 잡힌다.
   */
  it('R4 붙이는 사이 같은 페이지를 다시 실으면 누른 때의 기준 노드 뒤에 붙고 앞 통지를 덮지 않는다 — 재연결 · 복원 다시 불러오기 · 편집 실패 수습', async () => {
    type Ctx = {
      page: Page
      P: string
      projectId: string
      snapshotId: string
      cut: Awaited<ReturnType<EditorStack['startCutProxy']>>
      ws: { armed: boolean; failed: number }
    }
    /** 붙잡은 페이지 목록 조회를 끝에 실패시키는 판(V6 — 붙이지 못했다는 말이 앞 통지에 잇는다). */
    const failsTree = (name: string) => name.startsWith('V6')
    const patchFails = (name: string) => name.startsWith('V5') || name.startsWith('V6')
    const variants: [string, number, (c: Ctx) => Promise<unknown>][] = [
      [
        'V2 재연결 — 끊긴 사이 남이 «글 1»을 고침',
        6_000,
        async ({ cut, P }) => {
          await sleep(100)
          const reset = cut.reset(/\/ws/)
          const now = await stack.request(bob, 'GET', P)
          const response = await stack.request(bob, 'PATCH', `${P}/ops`, {
            baseSeq: now.body.headSeq,
            ops: [{ op: 'replace', path: '/root/children/0/props/content', value: '글 1 (bob)' }],
          })
          return { reset: reset > 0, bob: response.status }
        },
      ],
      [
        'V4b 복원 → 배너 «다시 불러오기»',
        4_000,
        async ({ page, projectId, snapshotId }) => {
          await sleep(100)
          const restored = await stack.request(alice, 'POST', `/projects/${projectId}/snapshots/${snapshotId}/restore`, {})
          const reload = page.getByRole('button', { name: '다시 불러오기', exact: true })
          await reload.waitFor({ timeout: 3_000 })
          await reload.click()
          return { restore: restored.status }
        },
      ],
      [
        'V5 내 편집(«글 2» Cmd+D)이 patch-error 422 → 수습',
        4_000,
        async ({ page, ws }) => {
          await sleep(100)
          ws.armed = true
          await canvasFrame(page).locator('[data-wb-id="n_text0000002"]').click()
          await page.keyboard.press('ControlOrMeta+d')
          await sleep(1_500)
          return { failed: ws.failed }
        },
      ],
      [
        'V6 V5 의 수습 뒤 페이지 목록 읽기가 실패',
        4_000,
        async ({ page, ws }) => {
          await sleep(100)
          ws.armed = true
          await canvasFrame(page).locator('[data-wb-id="n_text0000002"]').click()
          await page.keyboard.press('ControlOrMeta+d')
          await sleep(1_500)
          return { failed: ws.failed }
        },
      ],
    ]
    const results: unknown[] = []
    for (const [name, hold, act] of variants) {
      const { P, projectId } = await fixture(stack, alice, 'r4', [T('n_text0000001', '글 1'), T('n_text0000002', '글 2'), GO()], {
        bob: true,
      })
      const snapshot = await stack.request(alice, 'POST', `/projects/${projectId}/snapshots`, { tag: 'r4' })
      const cut = await stack.startCutProxy()
      const { page, close } = await open(P, cut.origin)
      try {
        const ws = { armed: false, failed: 0 }
        if (patchFails(name)) {
          await page.routeWebSocket(/\/ws/, (route) => {
            const server = route.connectToServer()
            route.onMessage((message) => {
              const frame = (() => {
                try {
                  return JSON.parse(typeof message === 'string' ? message : message.toString())
                } catch {
                  return null
                }
              })()
              if (ws.armed && ws.failed === 0 && frame?.type === 'patch') {
                ws.failed += 1
                route.send(
                  JSON.stringify({
                    type: 'patch-error',
                    projectId,
                    pageId: frame.pageId,
                    clientOpId: frame.clientOpId,
                    status: 422,
                    code: 'validation-failed',
                    message: 'r4',
                    issues: [],
                  }),
                )
                return
              }
              server.send(message)
            })
            server.onMessage((message) => route.send(message))
          })
          await page.reload()
          await canvasFrame(page).locator('[data-wb-id]').first().waitFor()
        }
        await sleep(600)
        await canvasFrame(page).locator('[data-wb-id="n_btngo000001"]').click()
        await page.keyboard.press('ControlOrMeta+c')
        let held = 0
        await page.route(/\/api\/projects\/[^/]+\/tree$/, async (route) => {
          held += 1
          await sleep(hold)
          if (failsTree(name)) await route.abort().catch(() => {})
          else await route.continue().catch(() => {})
        })
        await canvasFrame(page).locator('[data-wb-id="n_text0000001"]').click()
        await page.keyboard.press('ControlOrMeta+v')
        const canary = await act({ page, P, projectId, snapshotId: snapshot.body.id, cut, ws })
        await sleep(hold + 1_500)
        results.push({
          name,
          held,
          canary,
          server: (await settled(P)).shape,
          alerts: await page.locator('.wb-shell-edit-alert').allTextContents(),
        })
      } finally {
        await close()
        await cut.close()
      }
    }
    expect(results).toEqual([
      {
        name: 'V2 재연결 — 끊긴 사이 남이 «글 1»을 고침',
        held: 2,
        canary: { reset: true, bob: 200 },
        server: '글 1 (bob),가기,글 2,가기',
        alerts: [expect.stringContaining('연결이 다시 붙어 페이지를 서버 상태로 다시 불러왔습니다')],
      },
      {
        name: 'V4b 복원 → 배너 «다시 불러오기»',
        held: 3,
        canary: { restore: 200 },
        server: '글 1,가기,글 2,가기',
        alerts: [expect.stringContaining('복원된 상태로 페이지를 다시 불러왔습니다')],
      },
      {
        name: 'V5 내 편집(«글 2» Cmd+D)이 patch-error 422 → 수습',
        held: 1,
        canary: { failed: 1 },
        server: '글 1,가기,글 2,가기',
        alerts: [expect.stringContaining('편집 1개가 취소됐습니다')],
      },
      {
        name: 'V6 V5 의 수습 뒤 페이지 목록 읽기가 실패',
        held: 1,
        canary: { failed: 1 },
        server: '글 1,글 2,가기',
        alerts: [expect.stringMatching(/편집 1개가 취소됐습니다.*페이지 목록을 읽지 못해 붙이지 못했습니다/)],
      },
    ])
  })
})

/** 노드를 뿌리 자식으로 넣은 «첫째»와 빈 «둘째»(메뉴 «메뉴» 아래). bob 은 editor 다. */
async function fixture(
  stack: EditorStack,
  owner: Session,
  slug: string,
  nodes: unknown[],
  options: { bob?: boolean } = { bob: true },
): Promise<{ P: string; projectId: string }> {
  const call = (method: string, path: string, body?: unknown) => stack.request(owner, method, path, body)
  const project = created(await call('POST', '/projects', { name: 'E1 좁은 반증 대응', slug: `${slug}-${Date.now().toString(36)}` }))
  if (options.bob === true) {
    const member = await call('POST', `/projects/${project.id}/members`, { email: stack.users.bob.email, role: 'editor' })
    if (member.status >= 300) throw new Error(`멤버 ${member.status}`)
  }
  const menu = created(await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '메뉴' }))
  const first = created(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '첫째' }))
  created(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '둘째' }))
  const P = `/projects/${project.id}/pages/${first.id}`
  const ops = nodes.map((value, index) => ({ op: 'add', path: `/root/children/${index}`, value }))
  const seeded = await call('PATCH', `${P}/ops`, { baseSeq: 0, ops })
  if (seeded.status >= 300) throw new Error(`픽스처 ops ${seeded.status} ${JSON.stringify(seeded.body)}`)
  return { P, projectId: project.id }
}

function created(response: { status: number; body: any }): { id: string } {
  if (response.status !== 201) throw new Error(`픽스처 ${response.status} ${JSON.stringify(response.body)}`)
  return response.body
}
