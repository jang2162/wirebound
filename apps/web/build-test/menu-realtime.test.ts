/**
 * **메뉴 트리 실시간 — 실브라우저**(`apps/api` `menu-changed` · `src/tree/use-tree-commands.tsx`의 `remoteRev` · `reconcile` · `onPageGone`).
 *
 * alice 가 쓰고(api 로 곧바로 — 화면을 거치지 않는다) bob 의 탭이 받는다. 두 사람은 다른 브라우저 컨텍스트다.
 *
 * | 판 | 무엇을 재나 |
 * |---|---|
 * | 걸린 시간 | 메뉴 만들기 · 이름 · 옮기기 · 지우기 · 연쇄 삭제 · 페이지 만들기 · 페이지 지우기 — 보낸 순간부터 bob 의 트리에 서기까지(ms) |
 * | 열린 줄 메뉴 | bob 이 줄의 `…`를 연 채 alice 가 그 줄을 지운다 — 메뉴가 닫힌다 |
 * | 이름 입력 | bob 이 친 채 alice 가 그 메뉴를 지운다 — 입력이 닫히고 하단 바가 말한다 |
 * | 연쇄 상자 | bob 이 연 채 alice 가 그 밑에 페이지를 더한다 → «목록이 바뀌었습니다»와 새 목록 · 그 메뉴를 지운다 → 상자가 닫힌다 |
 * | 열린 페이지 | bob 이 연 페이지를 alice 가 지운다 — 캔버스가 «대상을 찾을 수 없습니다»로 간다 |
 * | 재연결 | bob 의 WS 를 끊고 그 사이 alice 가 쓴다 — 다시 붙으면 트리가 선다 |
 * | 복원 | alice 의 복원 — bob 의 트리가 곧바로 되돌아가고 복원 배너는 남는다 |
 * | 내 쓰기 · 늦은 신호 | bob 의 WS(서버 → 브라우저)를 늦춰 제 쓰기의 신호가 답보다 늦게 오게 한다 — 트리를 한 번만 받는다 · 앞섬(ms) |
 *
 * 걸린 시간 · 앞섬은 `[메뉴 실시간]` 줄로 찍는다(보고에 옮기는 값 — 케이스는 상한만 단언한다).
 */
import type { Page, Request } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canvasFrame, editorStackPrerequisite, poll, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

/** 받기까지의 상한 — 넘으면 «실시간»이 아니다. 잰 값은 `[메뉴 실시간]` 줄에 있고 이보다 한참 작다. */
const ARRIVAL_LIMIT_MS = 3_000

const TREE_DRAFT_DROPPED = '그 항목이 트리에서 사라져 친 이름을 쓰지 않았습니다'
const CASCADE_CHANGED = '목록이 바뀌었습니다 — 다시 확인하세요.'

describe.skipIf(!전제.ok)('메뉴 트리 실시간 — 실브라우저', () => {
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

  const call = (method: string, p: string, body?: unknown) => stack.request(alice, method, p, body)

  function created(response: { status: number; body: any }): { id: string } {
    if (response.status !== 201) throw new Error(`픽스처 ${response.status} ${JSON.stringify(response.body)}`)
    return response.body
  }

  async function ok(response: Promise<{ status: number; body: any }>): Promise<any> {
    const answer = await response
    if (answer.status >= 300) throw new Error(`요청 ${answer.status} ${JSON.stringify(answer.body)}`)
    return answer.body
  }

  /**
   * ```
   * 가   pages: 가1 가2      ← bob 이 가1 을 연다
   * └ 가-하위
   * 나   pages: 나1
   * 다
   * ```
   */
  async function fixture(slug: string) {
    const project = created(await call('POST', '/projects', { name: '메뉴 실시간', slug: `live-${slug}-${Date.now().toString(36)}` }))
    const P = `/projects/${project.id}`
    const ids: Record<string, string> = { project: project.id }
    const menu = async (title: string, parentId: string | null = null) => {
      ids[title] = created(await call('POST', `${P}/menu`, { parentId, title })).id
    }
    const page = async (title: string, under: string) => {
      ids[title] = created(await call('POST', `${P}/pages`, { menuNodeId: ids[under], title })).id
    }
    await menu('가')
    await menu('나')
    await menu('다')
    await menu('가-하위', ids['가'])
    await page('가1', '가')
    await page('가2', '가')
    await page('나1', '나')
    const added = await call('POST', `${P}/members`, { email: stack.users.bob.email, role: 'editor' })
    if (added.status >= 300) throw new Error(`member ${added.status}`)
    return { P, ids, url: `${P}/pages/${ids['가1']}`, outside: `${P}/pages/${ids['나1']}` }
  }

  interface BobTab {
    page: Page
    close: () => Promise<void>
    /** 이 탭이 낸 트리 조회(`GET …/tree`)의 보낸 시각(ms — `Date.now()`). */
    treeReads: number[]
    /** 받은 `menu-changed`의 번호와 받은 시각. */
    frames: { rev: number; at: number }[]
  }

  async function openBob(url: string, origin?: string): Promise<BobTab> {
    const { context, page } = await stack.openTab(stack.users.bob, { viewport: { width: 1440, height: 900 }, ...(origin === undefined ? {} : { origin }) })
    const treeReads: number[] = []
    const frames: { rev: number; at: number }[] = []
    page.on('request', (request: Request) => {
      if (request.method() === 'GET' && /\/api\/projects\/[^/]+\/tree$/.test(new URL(request.url()).pathname)) treeReads.push(Date.now())
    })
    page.on('websocket', (socket) => {
      socket.on('framereceived', (frame) => {
        const text = String(frame.payload)
        const rev = /"type":"menu-changed".*"rev":(\d+)/.exec(text)?.[1]
        if (rev !== undefined) frames.push({ rev: Number(rev), at: Date.now() })
      })
    })
    await page.goto(url)
    // 빈 페이지의 `Page` 노드는 크기가 0 이라 «보임»이 안 선다 — 붙었는지만 본다.
    await canvasFrame(page).locator('[data-wb-id]').first().waitFor({ state: 'attached' })
    await page.locator('[data-tree-row]').first().waitFor({ state: 'attached' })
    // 룸에 든 뒤에 시작한다 — 그 전의 쓰기는 이 탭이 첫 조회로 받는다.
    await page.waitForFunction(() => document.querySelector('[data-tree-row]') !== null)
    await page.waitForTimeout(300)
    return { page, close: () => context.close(), treeReads, frames }
  }

  const TREE = '.wb-shell-region[aria-label="메뉴·페이지 트리"]'

  function row(page: Page, id: string) {
    return page.locator(`${TREE} [data-tree-row][data-tree-id="${id}"]`)
  }

  /** 트리의 줄 — 화면 차례대로 `id`. */
  function rowIds(page: Page): Promise<string[]> {
    return page.locator(`${TREE} [data-tree-row]`).evaluateAll((rows) => rows.map((element) => element.getAttribute('data-tree-id') ?? ''))
  }

  /** `write`를 보내고 bob 의 트리가 `seen`을 만족할 때까지 — 보낸 순간부터의 ms. */
  async function arrival(bob: BobTab, write: () => Promise<unknown>, seen: (ids: string[]) => boolean): Promise<number> {
    const start = Date.now()
    await write()
    await poll('bob 의 트리', () => rowIds(bob.page), seen, ARRIVAL_LIMIT_MS + 2_000)
    return Date.now() - start
  }

  it('남의 쓰기가 bob 의 트리에 서기까지(ms) — 만들기 · 이름 · 옮기기 · 지우기 · 연쇄 삭제', async () => {
    const fx = await fixture('arrival')
    const bob = await openBob(fx.url)
    try {
      // 여는 동안의 조회는 빼고 센다 — dev 판은 `StrictMode`라 마운트 조회가 두 번이다.
      const readsBefore = bob.treeReads.length
      const P = fx.P
      const titleOf = (id: string) => row(bob.page, id).locator('> button, > a').first().innerText()
      const took: Record<string, number> = {}
      let made = ''
      took['메뉴 만들기'] = await arrival(
        bob,
        async () => (made = created(await call('POST', `${P}/menu`, { parentId: null, title: '라' })).id),
        (ids) => ids.includes(made),
      )
      const renameStart = Date.now()
      await ok(call('PATCH', `${P}/menu/${fx.ids['다']}`, { title: '다 바뀜' }))
      await poll('이름', () => titleOf(fx.ids['다']!), (title) => title.includes('다 바뀜'), ARRIVAL_LIMIT_MS + 2_000)
      took['이름 바꾸기'] = Date.now() - renameStart
      took['옮기기'] = await arrival(
        bob,
        () => ok(call('PATCH', `${P}/menu/${fx.ids['다']}`, { sortOrder: 0 })),
        (ids) => ids.indexOf(fx.ids['다']!) >= 0 && ids.indexOf(fx.ids['다']!) < ids.indexOf(fx.ids['가']!),
      )
      took['빈 메뉴 지우기'] = await arrival(bob, () => ok(call('DELETE', `${P}/menu/${made}`)), (ids) => !ids.includes(made))
      let pageMade = ''
      took['페이지 만들기'] = await arrival(
        bob,
        async () => (pageMade = created(await call('POST', `${P}/pages`, { menuNodeId: fx.ids['다'], title: '다1' })).id),
        (ids) => ids.includes(pageMade),
      )
      took['페이지 지우기'] = await arrival(bob, () => ok(call('DELETE', `${P}/pages/${pageMade}`)), (ids) => !ids.includes(pageMade))
      took['연쇄 삭제'] = await arrival(
        bob,
        () => ok(call('DELETE', `${P}/menu/${fx.ids['나']}`, { cascade: true, expect: { menuIds: [], pageIds: [fx.ids['나1']] } })),
        (ids) => !ids.includes(fx.ids['나']!) && !ids.includes(fx.ids['나1']!),
      )
      // eslint-disable-next-line no-console
      const reads = bob.treeReads.length - readsBefore
      console.log('[메뉴 실시간] 걸린 시간(ms)', JSON.stringify({ took, treeReads: reads, frames: bob.frames.length }))
      for (const [what, ms] of Object.entries(took)) expect(ms, what).toBeLessThan(ARRIVAL_LIMIT_MS)
      // 쓰기 일곱 — 신호 일곱 · 다시 받기는 신호마다 하나를 넘지 않는다.
      expect(bob.frames.length).toBe(7)
      expect(reads).toBeLessThanOrEqual(7)
    } finally {
      await bob.close()
    }
  }, 60_000)

  it('열린 줄 메뉴 — alice 가 그 줄을 지우면 메뉴가 닫힌다', async () => {
    const fx = await fixture('row-menu')
    const bob = await openBob(fx.url)
    try {
      const target = row(bob.page, fx.ids['가2']!)
      await target.locator('> button, > a').first().hover()
      await target.getByRole('button', { name: '가2 더 보기', exact: true }).click()
      await bob.page.getByRole('menuitem', { name: '이름 변경', exact: true }).waitFor()
      await ok(call('DELETE', `${fx.P}/pages/${fx.ids['가2']}`))
      await poll('줄이 빠진다', () => rowIds(bob.page), (ids) => !ids.includes(fx.ids['가2']!), ARRIVAL_LIMIT_MS)
      expect({ menus: await bob.page.getByRole('menu').count(), alerts: await bob.page.getByRole('alert').allTextContents() }).toEqual({ menus: 0, alerts: [] })
    } finally {
      await bob.close()
    }
  }, 60_000)

  it('이름 입력 — 친 채 alice 가 그 메뉴를 지우면 입력이 닫히고 하단 바가 말한다', async () => {
    const fx = await fixture('rename')
    const bob = await openBob(fx.url)
    try {
      const target = row(bob.page, fx.ids['다']!)
      await target.locator('> button, > a').first().hover()
      await target.getByRole('button', { name: '다 더 보기', exact: true }).click()
      await bob.page.getByRole('menuitem', { name: '이름 변경', exact: true }).click()
      const input = bob.page.getByLabel('이름', { exact: true })
      await input.fill('다 고침')
      await ok(call('DELETE', `${fx.P}/menu/${fx.ids['다']}`))
      await poll('입력이 닫힌다', () => input.count(), (n) => n === 0, ARRIVAL_LIMIT_MS)
      expect(await bob.page.getByRole('alert').allTextContents()).toContain(TREE_DRAFT_DROPPED)
    } finally {
      await bob.close()
    }
  }, 60_000)

  // bob 이 연 페이지는 서브트리 밖이다 — 안이면 «페이지가 사라짐»이 판을 비우며 하단 바도 비워(`EditorStore.clearPage`) 상자의 한 줄이 안 남는다
  // (캔버스의 «대상을 찾을 수 없습니다»가 말한다).
  it('연쇄 상자 — 밑에 페이지가 더해지면 «목록이 바뀌었습니다»와 새 목록 · 그 메뉴가 지워지면 닫힌다', async () => {
    const fx = await fixture('cascade')
    const bob = await openBob(fx.outside)
    try {
      const target = row(bob.page, fx.ids['가']!)
      await target.locator('> button, > a').first().hover()
      await target.getByRole('button', { name: '가 더 보기', exact: true }).click()
      await bob.page.getByRole('menuitem', { name: '삭제', exact: true }).click()
      const dialog = bob.page.getByRole('dialog', { name: '메뉴 삭제', exact: true })
      await dialog.waitFor()
      const listed = () => dialog.locator('.wb-shell-menu-delete-pages li').allTextContents()
      expect(await listed()).toEqual(['가1', '가2'])

      await ok(call('POST', `${fx.P}/pages`, { menuNodeId: fx.ids['가-하위'], title: '가-하위1' }))
      await dialog.getByText(CASCADE_CHANGED).waitFor({ timeout: ARRIVAL_LIMIT_MS })
      expect(await listed()).toEqual(['가1', '가2', '가-하위1'])

      const tree = await ok(call('GET', `${fx.P}/tree`))
      const sub = tree.menu.find((m: { id: string }) => m.id === fx.ids['가'])
      await ok(
        call('DELETE', `${fx.P}/menu/${fx.ids['가']}`, {
          cascade: true,
          expect: { menuIds: [fx.ids['가-하위']], pageIds: [...sub.pages.map((p: { id: string }) => p.id), ...sub.children[0].pages.map((p: { id: string }) => p.id)] },
        }),
      )
      await poll('상자가 닫힌다', () => dialog.count(), (n) => n === 0, ARRIVAL_LIMIT_MS)
      expect(await bob.page.getByRole('alert').allTextContents()).toContain('"가" 메뉴가 트리에서 사라져 삭제 상자를 닫았습니다')
    } finally {
      await bob.close()
    }
  }, 60_000)

  it('열린 페이지 — alice 가 지우면 캔버스가 «대상을 찾을 수 없습니다»로 간다(ms)', async () => {
    const fx = await fixture('open-page')
    const bob = await openBob(fx.url)
    try {
      const start = Date.now()
      await ok(call('DELETE', `${fx.P}/pages/${fx.ids['가1']}`))
      await bob.page.getByRole('alert').filter({ hasText: '대상을 찾을 수 없습니다' }).first().waitFor({ timeout: ARRIVAL_LIMIT_MS })
      const took = Date.now() - start
      // eslint-disable-next-line no-console
      console.log('[메뉴 실시간] 열린 페이지가 사라짐(ms)', took)
      expect({
        nodes: await canvasFrame(bob.page).locator('[data-wb-id]').count(),
        structureRows: await bob.page.locator('.wb-shell-region[aria-label="구조 트리"] [data-tree-row]').count(),
      }).toEqual({ nodes: 0, structureRows: 0 })
    } finally {
      await bob.close()
    }
  }, 60_000)

  it('재연결 — 끊긴 사이의 쓰기는 다시 붙으며 트리를 한 번 받아 선다(ms)', async () => {
    const fx = await fixture('reconnect')
    const proxy = await stack.startCutProxy()
    const bob = await openBob(fx.url, proxy.origin)
    try {
      const readsBefore = bob.treeReads.length
      const cut = proxy.reset(/GET \/api\/projects\/[^ ]+\/ws/)
      expect(cut).toBe(1)
      const start = Date.now()
      const made = created(await call('POST', `${fx.P}/menu`, { parentId: null, title: '끊긴 사이' })).id
      await poll('다시 붙어 선다', () => rowIds(bob.page), (ids) => ids.includes(made), 10_000)
      const took = Date.now() - start
      // eslint-disable-next-line no-console
      console.log('[메뉴 실시간] 재연결 뒤 선 시간(ms)', took, '받은 신호', JSON.stringify(bob.frames))
      // 신호는 끊긴 소켓으로 갔다 — 새 소켓의 다시 받기가 세웠다.
      expect(bob.frames.some((frame) => frame.at >= start)).toBe(false)
      expect(bob.treeReads.length).toBeGreaterThan(readsBefore)
    } finally {
      await bob.close()
      await proxy.close()
    }
  }, 60_000)

  it('복원 — bob 의 트리가 곧바로 되돌아가고 복원 배너는 남는다', async () => {
    const fx = await fixture('restore')
    const snapshot = created(await call('POST', `${fx.P}/snapshots`, { tag: `판-${Date.now().toString(36)}` }))
    const extra = created(await call('POST', `${fx.P}/menu`, { parentId: null, title: '복원이 지울 메뉴' })).id
    const bob = await openBob(fx.url)
    try {
      expect(await rowIds(bob.page)).toContain(extra)
      await ok(call('POST', `${fx.P}/snapshots/${snapshot.id}/restore`))
      await poll('되돌아간 트리', () => rowIds(bob.page), (ids) => !ids.includes(extra), ARRIVAL_LIMIT_MS)
      expect(await bob.page.getByText(/스냅샷이 복원됐습니다/).count()).toBeGreaterThan(0)
    } finally {
      await bob.close()
    }
  }, 60_000)

  /**
   * **내 쓰기의 신호가 답보다 늦게 오는 판** — bob 의 WS(서버 → 브라우저)를 늦춘다(`startDownDelay`). bob 이 최상위 메뉴를 만들면 답 뒤의
   * 다시 받기가 그 판을 들고 서고, 늦게 온 신호는 이미 받은 판이라 다시 받지 않는다. 늦추지 않은 판에서 신호와 답 뒤 조회의 앞섬도 잰다.
   */
  it('내 쓰기 · 늦은 신호 — 트리를 한 번만 받는다 · 앞섬(ms)', async () => {
    const measure = async (origin: string | undefined, slug: string) => {
      const fx = await fixture(slug)
      const bob = await openBob(fx.url, origin)
      try {
        const reads = bob.treeReads.length
        const sent = Date.now()
        await bob.page.locator(`${TREE} .wb-shell-region-actions [aria-haspopup="menu"]`).click()
        await bob.page.getByRole('menuitem', { name: '최상위 메뉴 추가', exact: true }).click()
        const input = bob.page.getByLabel('이름', { exact: true })
        await input.fill('bob 의 메뉴')
        await input.press('Enter')
        await poll('신호', async () => bob.frames.length, (n) => n >= 1, 5_000)
        await bob.page.waitForTimeout(800)
        return { reads: bob.treeReads.length - reads, frameAfter: bob.frames[0]!.at - sent, firstReadAfter: (bob.treeReads[reads] ?? 0) - sent }
      } finally {
        await bob.close()
      }
    }
    const plain = await measure(undefined, 'own-plain')
    const delay = await stack.startDownDelay(600)
    let late
    try {
      late = await measure(delay.origin, 'own-late')
      expect(delay.delayed()).toBeGreaterThan(0)
    } finally {
      await delay.close()
    }
    // eslint-disable-next-line no-console
    console.log('[메뉴 실시간] 내 쓰기 · 신호', JSON.stringify({ plain, late }))
    // 늦은 신호 — 답 뒤의 조회가 먼저 그 판을 받았다. 신호가 온 뒤 다시 받지 않는다.
    expect(late.reads).toBe(1)
    expect(late.frameAfter).toBeGreaterThan(late.firstReadAfter)
    // 늦추지 않은 판 — 많아야 둘(신호가 먼저 와 그 다시 받기와 답 뒤 조회가 겹쳤다).
    expect(plain.reads).toBeLessThanOrEqual(2)
  }, 90_000)
})
