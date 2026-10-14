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
 * | 입력 · 옮김 | bob 이 친 채 alice 가 그 줄을 다른 부모로 · 접힌 메뉴 안으로 · 같은 부모 안에서 옮긴다 — 입력이 친 글째 서고 이어 친 글이 뒤에 붙는다 |
 * | 연쇄 상자 | bob 이 연 채 alice 가 그 밑에 페이지를 더한다 → «목록이 바뀌었습니다»와 새 목록 · 그 메뉴를 지운다 → 상자가 닫힌다 |
 * | 연쇄 상자 · 바뀐 직후의 누름 | 바뀌고 30ms 뒤의 누름 · 두 번 바뀜 · 더블클릭 · Enter · 줄어든 목록 · 409 와 신호가 겹친 판 — 첫 누름은 «새 목록 확인»만 푼다 |
 * | 열린 페이지 | bob 이 연 페이지를 alice 가 지운다 — 캔버스가 «대상을 찾을 수 없습니다»로 간다 |
 * | 재연결 | bob 의 WS 를 끊고 그 사이 alice 가 쓴다 — 다시 붙으면 트리가 선다 |
 * | 복원 | alice 의 복원 — bob 의 트리가 곧바로 되돌아가고 복원 배너는 남는다 |
 * | 내 쓰기 · 늦은 신호 | bob 의 WS(서버 → 브라우저)를 늦춰 제 쓰기의 신호가 답보다 늦게 오게 한다 — 트리를 한 번만 받는다 · 앞섬(ms) |
 *
 * **못 재는 것**(L-141) — 이 파일의 «bob 의 트리에 안 섰다» 류 단언은 폴이 곧 성질의 단언이라, 판이 안 선 것(시간 초과)과 성질이 거짓인 것이 같은 실패로 나온다. 규칙은 지침 «폴의 끝 조건에 단언할 값을 넣지 않는다»
 * 가 갖는다. 변조로 잴 때는 폴이 끝난 뒤의 마지막 값을 찍어 둘을 가른다(J1 보고 이월 9).
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
    const { context, page } = await stack.openTab(stack.users.bob, {
      viewport: { width: 1440, height: 900 },
      ...(origin === undefined ? {} : { origin }),
    })
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
      await poll(
        '이름',
        () => titleOf(fx.ids['다']!),
        (title) => title.includes('다 바뀜'),
        ARRIVAL_LIMIT_MS + 2_000,
      )
      took['이름 바꾸기'] = Date.now() - renameStart
      took['옮기기'] = await arrival(
        bob,
        () => ok(call('PATCH', `${P}/menu/${fx.ids['다']}`, { sortOrder: 0 })),
        (ids) => ids.indexOf(fx.ids['다']!) >= 0 && ids.indexOf(fx.ids['다']!) < ids.indexOf(fx.ids['가']!),
      )
      took['빈 메뉴 지우기'] = await arrival(
        bob,
        () => ok(call('DELETE', `${P}/menu/${made}`)),
        (ids) => !ids.includes(made),
      )
      let pageMade = ''
      took['페이지 만들기'] = await arrival(
        bob,
        async () => (pageMade = created(await call('POST', `${P}/pages`, { menuNodeId: fx.ids['다'], title: '다1' })).id),
        (ids) => ids.includes(pageMade),
      )
      took['페이지 지우기'] = await arrival(
        bob,
        () => ok(call('DELETE', `${P}/pages/${pageMade}`)),
        (ids) => !ids.includes(pageMade),
      )
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
      await poll(
        '줄이 빠진다',
        () => rowIds(bob.page),
        (ids) => !ids.includes(fx.ids['가2']!),
        ARRIVAL_LIMIT_MS,
      )
      expect({ menus: await bob.page.getByRole('menu').count(), alerts: await bob.page.getByRole('alert').allTextContents() }).toEqual({
        menus: 0,
        alerts: [],
      })
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
      await poll(
        '입력이 닫힌다',
        () => input.count(),
        (n) => n === 0,
        ARRIVAL_LIMIT_MS,
      )
      expect(await bob.page.getByRole('alert').allTextContents()).toContain(TREE_DRAFT_DROPPED)
    } finally {
      await bob.close()
    }
  }, 60_000)

  /** 줄의 `+`(`more` 가 거짓) · `…`에서 항목을 고른다. */
  async function openRowAction(page: Page, id: string, title: string, item: string, more = true): Promise<void> {
    const target = row(page, id)
    await target.locator('> button, > a').first().hover()
    await target.getByRole('button', { name: `${title} ${more ? '더 보기' : '추가'}`, exact: true }).click()
    await page.getByRole('menuitem', { name: item, exact: true }).click()
  }

  /** 그 줄을 품은 메뉴 줄의 id — 최상위면 `''`, 줄이 안 그려졌으면(접힌 메뉴 안) `null`. 화면 차례로는 못 가른다(«나» 밑의 «다»도 «나1» 뒤다). */
  function parentRow(page: Page, id: string): Promise<string | null> {
    return row(page, id)
      .count()
      .then((n) =>
        n === 0
          ? null
          : row(page, id).evaluate(
              (element) =>
                element
                  .closest('li')
                  ?.parentElement?.closest('li')
                  ?.querySelector(':scope > [data-tree-row]')
                  ?.getAttribute('data-tree-id') ?? '',
            ),
      )
  }

  /** 다음 트리 조회의 답이 오고 그 판이 그려질 때까지 — 단언할 값(줄 자리 · 입력)을 끝 조건에 안 넣는다. */
  async function rereadSettled(page: Page, write: () => Promise<unknown>): Promise<void> {
    const answered = page.waitForResponse(
      (response) => response.request().method() === 'GET' && /\/api\/projects\/[^/]+\/tree$/.test(new URL(response.url()).pathname),
      { timeout: ARRIVAL_LIMIT_MS },
    )
    await write()
    await answered
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(null)))))
  }

  /** 입력의 값 · 포커스 · 하단 바. */
  async function inputState(page: Page) {
    const input = page.getByLabel('이름', { exact: true })
    const count = await input.count()
    return {
      count,
      value: count === 1 ? await input.inputValue() : null,
      focused: await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? null),
      alerts: await page.getByRole('alert').allTextContents(),
    }
  }

  /**
   * **입력에 친 채 그 줄이 옮겨진다** — 다른 부모로 옮겨진 줄은 React 가 새로 마운트해 입력도 새로 선다. 친 글 · 포커스가 그대로 서고,
   * 이어 친 글이 그 뒤에 붙는다. 접힌 메뉴 안으로 들어가면 그 메뉴가 펴지고 입력이 보인다(`panels/menu-tree.tsx`의 `chains`).
   * 같은 부모 안 순서는 다시 마운트가 안 나는 대조군이다. 그 줄이 지워진 판은 위 «이름 입력» 케이스다.
   */
  describe('입력에 친 채 그 줄이 옮겨진다 — 친 글째 선다', () => {
    type Fx = Awaited<ReturnType<typeof fixture>>
    const cases: {
      name: string
      open: (fx: Fx, page: Page) => Promise<void>
      move: (fx: Fx) => Promise<unknown>
      /** 옮긴 줄과 옮겨 간 부모 — 대조군은 부모가 그대로다. */
      moved: (fx: Fx) => [string, string]
    }[] = [
      {
        name: '메뉴 이름 · 다른 부모로',
        open: (fx, page) => openRowAction(page, fx.ids['다']!, '다', '이름 변경'),
        move: (fx) => ok(call('PATCH', `${fx.P}/menu/${fx.ids['다']}`, { parentId: fx.ids['나'] })),
        moved: (fx) => [fx.ids['다']!, fx.ids['나']!],
      },
      {
        name: '페이지 이름 · 다른 메뉴로',
        open: (fx, page) => openRowAction(page, fx.ids['가2']!, '가2', '이름 변경'),
        move: (fx) => ok(call('PATCH', `${fx.P}/pages/${fx.ids['가2']}`, { menuNodeId: fx.ids['나'] })),
        moved: (fx) => [fx.ids['가2']!, fx.ids['나']!],
      },
      {
        name: '새 페이지 입력 · 그 메뉴를 다른 부모로',
        open: (fx, page) => openRowAction(page, fx.ids['다']!, '다', '페이지 추가', false),
        move: (fx) => ok(call('PATCH', `${fx.P}/menu/${fx.ids['다']}`, { parentId: fx.ids['나'] })),
        moved: (fx) => [fx.ids['다']!, fx.ids['나']!],
      },
      {
        name: '메뉴 이름 · 접힌 메뉴 안으로',
        open: async (fx, page) => {
          // 입력을 열기 전에 접는다 — 입력이 열린 채 접기 단추를 누르면 blur 가 입력을 닫는다.
          // 펼침 단추는 `aria-hidden`이라 역할로 안 잡힌다(`panels/tree-fold.tsx`).
          await row(page, fx.ids['나']!).locator('[data-tree-toggle]').click()
          await poll(
            '나1 이 접힌다',
            () => rowIds(page),
            (ids) => !ids.includes(fx.ids['나1']!),
            ARRIVAL_LIMIT_MS,
          )
          await openRowAction(page, fx.ids['다']!, '다', '이름 변경')
        },
        move: (fx) => ok(call('PATCH', `${fx.P}/menu/${fx.ids['다']}`, { parentId: fx.ids['나'] })),
        moved: (fx) => [fx.ids['다']!, fx.ids['나']!],
      },
      {
        name: '메뉴 이름 · 같은 부모 안 순서(대조군)',
        open: (fx, page) => openRowAction(page, fx.ids['다']!, '다', '이름 변경'),
        move: (fx) => ok(call('PATCH', `${fx.P}/menu/${fx.ids['다']}`, { sortOrder: 0 })),
        moved: (fx) => [fx.ids['다']!, ''],
      },
    ]
    for (const c of cases) {
      it(
        c.name,
        async () => {
          const fx = await fixture(`input-move-${cases.indexOf(c)}`)
          const bob = await openBob(fx.url)
          try {
            await c.open(fx, bob.page)
            const input = bob.page.getByLabel('이름', { exact: true })
            await input.fill('친 글')
            const frames = bob.frames.length
            await rereadSettled(bob.page, () => c.move(fx))
            const [moved, under] = c.moved(fx)
            const after = { parent: await parentRow(bob.page, moved), ...(await inputState(bob.page)) }
            await bob.page.keyboard.type('XY')
            // 입력이 없으면(접힌 메뉴가 안 펴짐) 기다리지 않고 `null` — 단언이 값으로 죽게 한다.
            const typedOn = (await input.count()) === 1 ? await input.inputValue() : null
            // eslint-disable-next-line no-console
            console.log('[메뉴 실시간] 입력 · 옮김', c.name, JSON.stringify({ after, typedOn }))
            expect(bob.frames.length).toBe(frames + 1)
            expect({ ...after, typedOn }).toEqual({
              parent: under,
              count: 1,
              value: '친 글',
              focused: '이름',
              alerts: [],
              typedOn: '친 글XY',
            })
          } finally {
            await bob.close()
          }
        },
        60_000,
      )
    }
  })

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
          expect: {
            menuIds: [fx.ids['가-하위']],
            pageIds: [...sub.pages.map((p: { id: string }) => p.id), ...sub.children[0].pages.map((p: { id: string }) => p.id)],
          },
        }),
      )
      await poll(
        '상자가 닫힌다',
        () => dialog.count(),
        (n) => n === 0,
        ARRIVAL_LIMIT_MS,
      )
      expect(await bob.page.getByRole('alert').allTextContents()).toContain('"가" 메뉴가 트리에서 사라져 삭제 상자를 닫았습니다')
    } finally {
      await bob.close()
    }
  }, 60_000)

  /**
   * **목록이 바뀐 직후의 누름**(J1 리뷰 R2) — 남의 변경으로 연쇄 상자의 목록이 바뀌면 확인 단추가 «새 목록 확인»으로 서고, 첫 누름은 그 글만
   * «모두 삭제»로 되돌린다(요청 없음 · `RemoveTarget.recheck`). 둘째 누름이 새 목록을 지운다. 409 길(`./menu-cascade-delete.test.ts`
   * «같은 수 · 다른 페이지»)도 같은 단추 · 같은 한 줄이다 — 아래 «409 와 신호가 겹친 판»이 두 길을 한 판에 세운다.
   */
  describe('연쇄 상자 — 목록이 바뀐 직후의 누름은 새 목록 확인이다', () => {
    const CONFIRM = '모두 삭제'
    const RECHECK = '새 목록 확인'

    /** 누른 뒤 그 판이 그려질 때까지 — 보냈으면 요청 이벤트가 이미 섰다. */
    const settle = (page: Page) =>
      page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(null)))))

    interface Cascade {
      bob: BobTab
      dialog: ReturnType<Page['getByRole']>
      /** bob 의 탭이 낸 연쇄 삭제(`DELETE …/menu/:id`) 수. */
      deletes: () => number
      /** 확인 단추의 글 · «목록이 바뀌었습니다» 줄 수 · 목록. 상자가 닫혔으면 단추 `null` — 기다리지 않고 값으로 죽게 한다. */
      state: () => Promise<{ button: string | null; changed: number; listed: string[] }>
      serverHas: (title: string) => Promise<boolean>
      /** 연 뒤에 낸 트리 조회가 모두 답을 받을 때까지. */
      readsDone: () => Promise<void>
    }

    async function openCascade(fx: Awaited<ReturnType<typeof fixture>>, origin?: string): Promise<Cascade> {
      const bob = await openBob(fx.outside, origin)
      let deletes = 0
      bob.page.on('request', (request: Request) => {
        if (request.method() === 'DELETE' && /\/menu\/[^/]+$/.test(new URL(request.url()).pathname)) deletes += 1
      })
      const base = bob.treeReads.length
      let readsEnded = 0
      const ended = (request: Request) => {
        if (request.method() === 'GET' && /\/api\/projects\/[^/]+\/tree$/.test(new URL(request.url()).pathname)) readsEnded += 1
      }
      bob.page.on('requestfinished', ended)
      bob.page.on('requestfailed', ended)
      await openRowAction(bob.page, fx.ids['가']!, '가', '삭제')
      const dialog = bob.page.getByRole('dialog', { name: '메뉴 삭제', exact: true })
      await dialog.waitFor()
      const serverTitles = async (): Promise<string[]> => {
        const tree = await ok(call('GET', `${fx.P}/tree`))
        const walk = (nodes: { title: string; pages: { title: string }[]; children: unknown[] }[]): string[] =>
          nodes.flatMap((node) => [node.title, ...node.pages.map((page) => page.title), ...walk(node.children as typeof nodes)])
        return walk(tree.menu)
      }
      return {
        bob,
        dialog,
        deletes: () => deletes,
        state: async () => ({
          button: (await dialog.count()) === 0 ? null : await dialog.locator('.wb-shell-menu-delete-confirm').innerText(),
          changed: await dialog.getByText(CASCADE_CHANGED, { exact: true }).count(),
          listed: await dialog.locator('.wb-shell-menu-delete-pages li').allTextContents(),
        }),
        serverHas: async (title) => (await serverTitles()).includes(title),
        readsDone: async () => {
          await poll(
            '트리 조회가 끝난다',
            async () => bob.treeReads.length - base - readsEnded,
            (pending) => pending <= 0,
            ARRIVAL_LIMIT_MS,
          )
          await settle(bob.page)
        },
      }
    }

    it('목록이 바뀌고 30ms 뒤의 누름 — 지우지 않고 «모두 삭제»로 돌아간다 · 다음 누름이 새 목록을 지운다', async () => {
      const fx = await fixture('recheck-30ms')
      const c = await openCascade(fx)
      try {
        // 목록(`li` 수)이 바뀌는 순간 30ms 뒤 단추를 누른다 — 사람이 단추에 손을 올린 채 그 순간 누른 판(리뷰 R2 의 판).
        await c.bob.page.evaluate(() => {
          const before = document.querySelectorAll('.wb-shell-menu-delete-pages li').length
          const w = window as unknown as { __recheck: { changedAt?: number; clickedAt?: number } }
          w.__recheck = {}
          const observer = new MutationObserver(() => {
            if (document.querySelectorAll('.wb-shell-menu-delete-pages li').length === before) return
            observer.disconnect()
            w.__recheck.changedAt = performance.now()
            setTimeout(() => {
              ;(document.querySelector('.wb-shell-menu-delete-confirm') as HTMLButtonElement).click()
              w.__recheck.clickedAt = performance.now()
            }, 30)
          })
          observer.observe(document.body, { childList: true, subtree: true })
        })
        await ok(call('POST', `${fx.P}/pages`, { menuNodeId: fx.ids['가-하위'], title: '방금 더한 페이지' }))
        const at = await poll(
          '바뀐 목록 위의 누름',
          () => c.bob.page.evaluate(() => (window as unknown as { __recheck: { changedAt?: number; clickedAt?: number } }).__recheck),
          (value) => value.clickedAt !== undefined,
          ARRIVAL_LIMIT_MS,
        )
        await settle(c.bob.page)
        const first = { ...(await c.state()), deletes: c.deletes(), kept: await c.serverHas('방금 더한 페이지') }
        // eslint-disable-next-line no-console
        console.log('[메뉴 실시간] 바뀐 목록 위의 누름(ms)', (at.clickedAt ?? 0) - (at.changedAt ?? 0), JSON.stringify(first))
        expect(first).toEqual({ button: CONFIRM, changed: 1, listed: ['가1', '가2', '방금 더한 페이지'], deletes: 0, kept: true })

        await c.dialog.getByRole('button', { name: CONFIRM, exact: true }).click()
        await poll(
          '서버에서 «가»가 사라진다',
          () => c.serverHas('가'),
          (has) => !has,
          ARRIVAL_LIMIT_MS,
        )
        expect({ deletes: c.deletes(), added: await c.serverHas('방금 더한 페이지') }).toEqual({ deletes: 1, added: false })
      } finally {
        await c.bob.close()
      }
    }, 60_000)

    it('확인한 뒤 목록이 또 바뀌면 다시 «새 목록 확인»이다 · 그 단추의 더블클릭은 안 지운다', async () => {
      const fx = await fixture('recheck-twice')
      const c = await openCascade(fx)
      try {
        await rereadSettled(c.bob.page, () => call('POST', `${fx.P}/pages`, { menuNodeId: fx.ids['가'], title: '하나' }))
        expect(await c.state()).toEqual({ button: RECHECK, changed: 1, listed: ['가1', '가2', '하나'] })
        await c.dialog.locator('.wb-shell-menu-delete-confirm').click()
        await settle(c.bob.page)
        expect({ ...(await c.state()), deletes: c.deletes() }).toEqual({
          button: CONFIRM,
          changed: 1,
          listed: ['가1', '가2', '하나'],
          deletes: 0,
        })
        await rereadSettled(c.bob.page, () => call('POST', `${fx.P}/pages`, { menuNodeId: fx.ids['가'], title: '둘' }))
        expect(await c.state()).toEqual({ button: RECHECK, changed: 1, listed: ['가1', '가2', '하나', '둘'] })
        // 더블클릭 — 첫 누름은 확인으로 소비되고, 둘째(`detail` 2)는 버린다.
        await c.dialog.locator('.wb-shell-menu-delete-confirm').dblclick()
        await settle(c.bob.page)
        expect({ ...(await c.state()), deletes: c.deletes(), kept: await c.serverHas('둘') }).toEqual({
          button: CONFIRM,
          changed: 1,
          listed: ['가1', '가2', '하나', '둘'],
          deletes: 0,
          kept: true,
        })
        await c.dialog.getByRole('button', { name: CONFIRM, exact: true }).click()
        await poll(
          '서버에서 «가»가 사라진다',
          () => c.serverHas('가'),
          (has) => !has,
          ARRIVAL_LIMIT_MS,
        )
        expect(await c.serverHas('둘')).toBe(false)
      } finally {
        await c.bob.close()
      }
    }, 60_000)

    it('키보드 Enter — 단추에 포커스를 둔 채 목록이 바뀌면 첫 Enter 는 확인 · 둘째가 지운다', async () => {
      const fx = await fixture('recheck-enter')
      const c = await openCascade(fx)
      try {
        await c.dialog.locator('.wb-shell-menu-delete-confirm').focus()
        await rereadSettled(c.bob.page, () => call('POST', `${fx.P}/pages`, { menuNodeId: fx.ids['가-하위'], title: '방금 더한 페이지' }))
        await c.bob.page.keyboard.press('Enter')
        await settle(c.bob.page)
        const first = { ...(await c.state()), deletes: c.deletes(), kept: await c.serverHas('방금 더한 페이지') }
        expect(first).toEqual({ button: CONFIRM, changed: 1, listed: ['가1', '가2', '방금 더한 페이지'], deletes: 0, kept: true })
        await c.bob.page.keyboard.press('Enter')
        await poll(
          '서버에서 «가»가 사라진다',
          () => c.serverHas('가'),
          (has) => !has,
          ARRIVAL_LIMIT_MS,
        )
        expect(c.deletes()).toBe(1)
      } finally {
        await c.bob.close()
      }
    }, 60_000)

    it('줄어든 목록(남이 하위 페이지를 지움)도 첫 누름은 확인이다', async () => {
      const fx = await fixture('recheck-shrunk')
      const c = await openCascade(fx)
      try {
        await rereadSettled(c.bob.page, () => call('DELETE', `${fx.P}/pages/${fx.ids['가2']}`))
        expect(await c.state()).toEqual({ button: RECHECK, changed: 1, listed: ['가1'] })
        await c.dialog.locator('.wb-shell-menu-delete-confirm').click()
        await settle(c.bob.page)
        expect({ ...(await c.state()), deletes: c.deletes(), kept: await c.serverHas('가') }).toEqual({
          button: CONFIRM,
          changed: 1,
          listed: ['가1'],
          deletes: 0,
          kept: true,
        })
        await c.dialog.getByRole('button', { name: CONFIRM, exact: true }).click()
        await poll(
          '서버에서 «가»가 사라진다',
          () => c.serverHas('가'),
          (has) => !has,
          ARRIVAL_LIMIT_MS,
        )
      } finally {
        await c.bob.close()
      }
    }, 60_000)

    /**
     * **409 와 신호가 겹친 판** — bob 의 WS(서버 → 브라우저)를 늦춰 alice 의 쓰기 신호가 bob 의 «모두 삭제» 뒤에 닿게 한다. 첫 누름은 낡은
     * 목록을 보내 409 를 받고(409 길), 늦은 신호는 그 409 목록과 같은 트리를 세운다(신호 길 — 목록이 같아 다시 세우지 않는다). 두 길이 같은
     * 한 줄 · 같은 단추를 보이고, 신호가 와도 «새 목록 확인»이 풀리지 않는다.
     */
    it('409 와 신호가 겹친 판 — 같은 한 줄 · 같은 단추 · 신호가 확인을 안 푼다', async () => {
      const fx = await fixture('recheck-409')
      const delay = await stack.startDownDelay(2_000)
      const c = await openCascade(fx, delay.origin)
      try {
        const frames = c.bob.frames.length
        const added = created(await call('POST', `${fx.P}/pages`, { menuNodeId: fx.ids['가-하위'], title: '방금 더한 페이지' })).id
        await c.dialog.locator('.wb-shell-menu-delete-confirm').click()
        // 409 의 답 — 상자가 «바뀌었다»로 다시 선다(누르는 순간 닫혔다 답 뒤에 다시 선다).
        await poll(
          '409 뒤 다시 선 상자',
          () => c.dialog.getByText(CASCADE_CHANGED, { exact: true }).count(),
          (n) => n > 0,
          ARRIVAL_LIMIT_MS,
        )
        expect({ ...(await c.state()), deletes: c.deletes(), signalYet: c.bob.frames.length > frames }).toEqual({
          button: RECHECK,
          changed: 1,
          listed: ['가1', '가2', '방금 더한 페이지'],
          deletes: 1,
          signalYet: false,
        })
        await poll(
          '늦은 신호',
          async () => c.bob.frames.length,
          (n) => n > frames,
          10_000,
        )
        // 신호가 낸 다시 받기가 있으면 그 답까지 — 409 뒤의 다시 받기가 이미 그 판을 받았으면 신호는 다시 받지 않는다.
        await settle(c.bob.page)
        await c.readsDone()
        expect({ ...(await c.state()), delayed: delay.delayed() > 0 }).toEqual({
          button: RECHECK,
          changed: 1,
          listed: ['가1', '가2', '방금 더한 페이지'],
          delayed: true,
        })
        await c.dialog.locator('.wb-shell-menu-delete-confirm').click()
        await settle(c.bob.page)
        expect({ ...(await c.state()), deletes: c.deletes() }).toEqual({
          button: CONFIRM,
          changed: 1,
          listed: ['가1', '가2', '방금 더한 페이지'],
          deletes: 1,
        })
        await c.dialog.getByRole('button', { name: CONFIRM, exact: true }).click()
        await poll(
          '서버에서 «가»가 사라진다',
          () => c.serverHas('가'),
          (has) => !has,
          ARRIVAL_LIMIT_MS,
        )
        expect({ deletes: c.deletes(), added: (await call('GET', `${fx.P}/pages/${added}`)).status }).toEqual({ deletes: 2, added: 404 })
      } finally {
        await c.bob.close()
        await delay.close()
      }
    }, 60_000)
  })

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
      await poll(
        '다시 붙어 선다',
        () => rowIds(bob.page),
        (ids) => ids.includes(made),
        10_000,
      )
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
      await poll(
        '되돌아간 트리',
        () => rowIds(bob.page),
        (ids) => !ids.includes(extra),
        ARRIVAL_LIMIT_MS,
      )
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
        await poll(
          '신호',
          async () => bob.frames.length,
          (n) => n >= 1,
          5_000,
        )
        await bob.page.waitForTimeout(800)
        return {
          reads: bob.treeReads.length - reads,
          frameAfter: bob.frames[0]!.at - sent,
          firstReadAfter: (bob.treeReads[reads] ?? 0) - sent,
        }
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
  /**
   * **내 조작 뒤의 다시 받기가 남의 지움을 함께 싣는 판**(장부 L-094) — 그 신호는 이미 받은 판이라 `reconcile` 을 안 타고, 고른 줄이 사라진 줄을
   * 가리킨 채 남아 트리의 단축키가 죽었다. bob 이 «다» 를 고른 채 alice 가 «다» 를 지우고, bob 의 WS(서버 → 브라우저)를 늦춰 신호보다 먼저
   * bob 의 «최상위 메뉴 추가» 답 뒤 다시 받기가 지운 트리를 받게 한다. 판 카나리아: 늦춘 WS 에 프레임이 실제로 지연됐고, 트리에서 «다» 줄이 사라졌다.
   * 단언은 성질이다 — 사라진 줄을 고른 채가 아니라 주소의 페이지가 선택이라 Delete 가 그 페이지의 삭제 확인을 건다(남의 지움만 있었던 판과 같다).
   */
  it('내 조작 뒤의 다시 받기가 남의 지움을 싣는 판 — 사라진 줄을 고른 채 남지 않아 Delete 가 주소의 페이지에 닿는다', async () => {
    const confirmAfterDelete = async (
      own: boolean,
      slug: string,
    ): Promise<{ rows: number; pressed: number; confirm: number; delayed: number }> => {
      const fx = await fixture(slug)
      const delay = own ? await stack.startDownDelay(1_500) : null
      const bob = await openBob(fx.url, delay?.origin)
      try {
        await bob.page.locator(`${TREE} button.wb-shell-tree-menu`, { hasText: '다' }).first().click()
        await poll(
          '룸에 든 채 지연된다',
          async () => (delay === null ? 1 : delay.delayed()),
          (n) => n >= 1,
        )
        await ok(call('DELETE', `${fx.P}/menu/${fx.ids['다']}`))
        if (own) {
          await bob.page.locator(`${TREE} .wb-shell-region-actions [aria-haspopup="menu"]`).click()
          await bob.page.getByRole('menuitem', { name: '최상위 메뉴 추가', exact: true }).click()
          const input = bob.page.getByLabel('이름', { exact: true })
          await input.fill('새 메뉴')
          await input.press('Enter')
        }
        await poll(
          '트리에서 «다» 가 사라진다',
          () => rowIds(bob.page),
          (ids) => !ids.includes(fx.ids['다']!),
          5_000,
        )
        // 지연된 신호가 닿을 때까지 — 신호가 닿아도 같은 값이어야 한다.
        await bob.page.waitForTimeout(own ? 2_200 : 600)
        await bob.page.locator(`${TREE} .wb-shell-region-actions button`).first().focus()
        await bob.page.keyboard.press('Delete')
        const confirm = await bob.page.getByRole('button', { name: '정말 삭제합니까?', exact: true }).count()
        return {
          rows: (await rowIds(bob.page)).length,
          pressed: await bob.page.locator(`${TREE} button[aria-pressed="true"]`).count(),
          confirm,
          delayed: delay?.delayed() ?? 0,
        }
      } finally {
        await bob.close()
        await delay?.close()
      }
    }
    const only = await confirmAfterDelete(false, 'pick-remote')
    const own = await confirmAfterDelete(true, 'pick-own')
    // eslint-disable-next-line no-console
    console.log('[메뉴 실시간] 고른 줄 · 남의 지움', JSON.stringify({ only, own }))
    expect(only.confirm).toBe(1)
    expect({ confirm: own.confirm, pressed: own.pressed }).toEqual({ confirm: 1, pressed: 0 })
    expect(own.delayed).toBeGreaterThan(0)
  }, 90_000)
})
