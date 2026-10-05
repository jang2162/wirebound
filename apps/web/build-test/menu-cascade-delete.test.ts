/**
 * **메뉴 연쇄 삭제 — 실브라우저**(`src/panels/menu-delete-dialog.tsx` · apps/api README «메뉴 연쇄 삭제»).
 *
 * | 판 | 무엇을 재나 |
 * |---|---|
 * | 확인 상자 | 1440×900 에서 상자가 창 안에 굴림 없이 서는가(`PAGE_PREVIEW_LIMIT` 의 근거 — 상자 높이 · 목록 한 줄 높이 · 남는 높이) · 경고 상자의 위험 색 · 설명(`aria-describedby`) · «모두 삭제» 뒤 서버의 트리 · 안전망 |
 * | 하위가 없는 메뉴 | 상자 없이 줄 아래 두 번 누르기 |
 * | 같은 수 · 다른 페이지 | alice 의 트리가 낡은 사이 bob 이 페이지 하나를 밖으로 · 새 페이지 하나를 안으로 — 수는 같다. «모두 삭제»가 아무것도 안 지우고, 상자가 서버의 지금 목록 · «목록이 바뀌었습니다»로 다시 서고, 다시 누르면 그 목록을 지운다 |
 * | 받는 쪽 | 지운 페이지를 열어 둔 bob 의 화면 — 친 글 · 열린 줄 메뉴가 지운 뒤 어떻게 끝나는가. **페이지 `DELETE` 판과 같은 값인지** 견준다(둘 다 `menu-changed`를 낸다 — 트리를 다시 받고 «페이지가 사라짐»으로 간다) |
 *
 * `WB_SHOTS_DIR` 이 있으면 그 디렉터리에 스크린숏을 남긴다(사람이 보는 그림 — 케이스는 그 값에 기대지 않는다).
 */
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canvasFrame, editorStackPrerequisite, poll, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

const SHOTS = process.env['WB_SHOTS_DIR']

async function shot(page: Page, name: string): Promise<void> {
  if (SHOTS === undefined || SHOTS === '') return
  await mkdir(SHOTS, { recursive: true })
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) })
}

describe.skipIf(!전제.ok)('메뉴 연쇄 삭제 — 실브라우저', () => {
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
    expect(before.databases).toBe(1)
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  })

  const call = (method: string, p: string, body?: unknown) => stack.request(alice, method, p, body)

  function created(response: { status: number; body: any }): { id: string } {
    if (response.status !== 201) throw new Error(`픽스처 ${response.status} ${JSON.stringify(response.body)}`)
    return response.body
  }

  /**
   * ```
   * 회원관리   pages: 회원 화면 1 … 8
   * └ 등급     pages: 등급표
   * 빈 메뉴
   * 설정       pages: 환경          ← alice 가 여는 페이지(서브트리 밖)
   * ```
   */
  async function fixture(slug: string) {
    const project = created(await call('POST', '/projects', { name: '연쇄 삭제', slug: `cascade-${slug}-${Date.now().toString(36)}` }))
    const member = created(await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '회원관리' }))
    const empty = created(await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '빈 메뉴' }))
    const settings = created(await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '설정' }))
    const grade = created(await call('POST', `/projects/${project.id}/menu`, { parentId: member.id, title: '등급' }))
    for (let index = 1; index <= 8; index += 1) {
      created(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: member.id, title: `회원 화면 ${index}` }))
    }
    created(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: grade.id, title: '등급표' }))
    const env = created(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: settings.id, title: '환경' }))
    return { projectId: project.id, member: member.id, empty: empty.id, P: `/projects/${project.id}/pages/${env.id}` }
  }

  function row(page: Page, id: string) {
    return page.locator(`.wb-shell-region[aria-label="메뉴·페이지 트리"] [data-tree-row][data-tree-id="${id}"]`)
  }

  async function chooseRowItem(page: Page, id: string, title: string, item: string): Promise<void> {
    await row(page, id).locator('> button, > a').first().hover()
    await row(page, id).getByRole('button', { name: `${title} 더 보기`, exact: true }).click()
    await page.getByRole('menuitem', { name: item, exact: true }).click()
  }

  /**
   * 꺼진 항목의 이유를 사람이 보는 그림 — 구조 트리 뿌리(`Page`) 줄 `…`의 꺼진 «삭제»에 마우스를 올린다. 브라우저의 `title` 풍선은 OS 가
   * 그려 화면 캡처에 안 찍히므로, 그 항목의 `title` 값을 «주석» 상자로 덧그려 찍고 걷는다(그림에도 주석이라 적는다).
   */
  async function tooltipShot(page: Page): Promise<void> {
    const structure = page.locator('.wb-shell-region[aria-label="구조 트리"]')
    await structure.getByRole('button', { name: 'Page 더 보기', exact: true }).click()
    const item = page.getByRole('menuitem', { name: '삭제', exact: true })
    await item.hover()
    await page.evaluate(() => {
      const target = [...document.querySelectorAll('[role="menuitem"]')].find((element) => element.textContent?.trim() === '삭제') as HTMLElement
      const rect = target.getBoundingClientRect()
      const note = document.createElement('div')
      note.id = 'wb-shot-note'
      note.textContent = `주석 — 이 항목의 title · aria-description: «${target.title}» / «${target.getAttribute('aria-description')}»`
      Object.assign(note.style, {
        position: 'fixed', left: `${rect.left}px`, top: `${rect.bottom + 6}px`, zIndex: '2147483647', padding: '4px 8px',
        background: '#ffffe1', border: '1px solid #767676', font: '12px system-ui', color: '#000', whiteSpace: 'nowrap',
      })
      document.body.append(note)
    })
    await shot(page, '2-disabled-item-tooltip')
    await page.evaluate(() => document.getElementById('wb-shot-note')?.remove())
    await page.keyboard.press('Escape')
  }

  it('확인 상자 — 1440×900 에서 창 안에 굴림 없이 · 경고 상자 · 설명 · «모두 삭제» 뒤 서버', async () => {
    const fx = await fixture('dialog')
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
    try {
      await page.goto(fx.P)
      await row(page, fx.member).locator('> button, > a').first().waitFor()
      await shot(page, '1-tree-without-status-line')
      if (SHOTS !== undefined && SHOTS !== '') await tooltipShot(page)
      await chooseRowItem(page, fx.member, '회원관리', '삭제')
      const dialog = page.getByRole('dialog', { name: '메뉴 삭제', exact: true })
      await dialog.waitFor()
      await shot(page, '3-cascade-dialog')

      const measured = await page.evaluate(() => {
        const box = document.querySelector('dialog[open]') as HTMLDialogElement
        const rect = box.getBoundingClientRect()
        const items = [...box.querySelectorAll('.wb-shell-menu-delete-pages li')]
        const itemHeight = items.length === 0 ? 0 : items[0]!.getBoundingClientRect().height
        const ids = (box.getAttribute('aria-describedby') ?? '').split(/\s+/).filter((id) => id !== '')
        const warning = box.querySelector('.wb-shell-menu-delete-warning') as HTMLElement
        const confirm = [...box.querySelectorAll('button')].find((button) => button.textContent === '모두 삭제') as HTMLButtonElement
        return {
          top: Math.round(rect.top),
          bottom: Math.round(rect.bottom),
          height: Math.round(rect.height),
          scrolls: box.scrollHeight > box.clientHeight + 1,
          itemHeight: Math.round(itemHeight * 10) / 10,
          items: items.map((item) => item.textContent),
          described: ids.map((id) => document.getElementById(id)?.textContent ?? null),
          warningColor: getComputedStyle(warning).color,
          confirmBackground: getComputedStyle(confirm).backgroundColor,
          confirmSvg: confirm.querySelector('svg') !== null,
        }
      })
      // eslint-disable-next-line no-console
      console.log('[확인 상자 1440×900]', JSON.stringify({ ...measured, room: 900 - measured.bottom }))

      await dialog.getByRole('button', { name: '모두 삭제', exact: true }).click()
      const tree = await poll(
        '서버의 트리에서 서브트리가 사라진다',
        async () => (await call('GET', `/projects/${fx.projectId}/tree`)).body.menu as { title: string }[],
        (menu) => !menu.some((node) => node.title === '회원관리'),
      )
      const snapshots = (await call('GET', `/projects/${fx.projectId}/snapshots`)).body as { tag: string }[]

      expect({
        fits: measured.top >= 0 && measured.bottom <= 900,
        scrolls: measured.scrolls,
        items: measured.items,
        described: measured.described,
        warningColor: measured.warningColor,
        confirmBackground: measured.confirmBackground,
        confirmSvg: measured.confirmSvg,
        tree: tree.map((node) => node.title),
        safety: snapshots.filter((snapshot) => snapshot.tag.startsWith('메뉴 "회원관리" 삭제 전 ')).length,
        dialogs: await page.locator('dialog[open]').count(),
      }).toEqual({
        fits: true,
        scrolls: false,
        items: ['회원 화면 1', '회원 화면 2', '회원 화면 3', '회원 화면 4', '회원 화면 5', '외 4개'],
        described: [
          '"회원관리" 메뉴와 하위 메뉴 1개 · 페이지 9개가 함께 삭제됩니다',
          '페이지 9개와 그 안의 설계가 모두 삭제됩니다회원 화면 1회원 화면 2회원 화면 3회원 화면 4회원 화면 5외 4개',
        ],
        warningColor: 'rgb(180, 35, 24)',
        confirmBackground: 'rgb(180, 35, 24)',
        confirmSvg: false,
        tree: ['빈 메뉴', '설정'],
        safety: 1,
        dialogs: 0,
      })
    } finally {
      await context.close()
    }
  })

  it('하위가 없는 메뉴 — 상자 없이 줄 아래 두 번 누르기', async () => {
    const fx = await fixture('inline')
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
    try {
      await page.goto(fx.P)
      await row(page, fx.empty).locator('> button, > a').first().waitFor()
      await chooseRowItem(page, fx.empty, '빈 메뉴', '삭제')
      const confirm = page.getByRole('button', { name: '정말 삭제합니까?', exact: true })
      await confirm.waitFor()
      await shot(page, '4-leaf-menu-inline-confirm')
      const dialogs = await page.locator('dialog[open]').count()
      await confirm.click()
      const tree = await poll(
        '서버의 트리에서 빈 메뉴가 사라진다',
        async () => (await call('GET', `/projects/${fx.projectId}/tree`)).body.menu as { title: string }[],
        (menu) => !menu.some((node) => node.title === '빈 메뉴'),
      )
      const snapshots = (await call('GET', `/projects/${fx.projectId}/snapshots`)).body as unknown[]
      expect({ dialogs, tree: tree.map((node) => node.title), snapshots: snapshots.length }).toEqual({
        dialogs: 0,
        tree: ['회원관리', '설정'],
        snapshots: 0,
      })
    } finally {
      await context.close()
    }
  })

  it('같은 수 · 다른 페이지 — 낡은 상자의 «모두 삭제»는 아무것도 안 지우고 지금 목록으로 상자를 다시 세운다', async () => {
    const bob = await stack.login(stack.users.bob)
    const project = created(await call('POST', '/projects', { name: '같은 수', slug: `cascade-same-${Date.now().toString(36)}` }))
    const member = created(await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '회원관리' }))
    const settings = created(await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '설정' }))
    const added = await call('POST', `/projects/${project.id}/members`, { email: stack.users.bob.email, role: 'editor' })
    if (added.status >= 300) throw new Error(`member ${added.status}`)
    created(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: member.id, title: '회원 목록' }))
    const moved = created(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: member.id, title: '회원 상세' }))
    const env = created(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: settings.id, title: '환경' }))
    const serverPages = async (): Promise<string[]> =>
      ((await call('GET', `/projects/${project.id}/tree`)).body.menu as { pages: { title: string }[] }[])
        .flatMap((node) => node.pages.map((page) => page.title))
        .sort()

    // **alice 의 트리를 낡게 세운다** — 그의 WS(서버 → 브라우저)를 늦춰 bob 의 두 쓰기의 `menu-changed`가 «모두 삭제» 뒤에 닿게 한다. 신호가 먼저
    // 닿으면 상자가 남의 변경으로 다시 서서(`reconcile` — `./menu-realtime.test.ts`) 409 길을 안 탄다. 판이 섰는지는 늦춘 덩어리 수로 본다.
    const delay = await stack.startDownDelay(8_000)
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 }, origin: delay.origin })
    try {
      await page.goto(`/projects/${project.id}/pages/${env.id}`)
      await row(page, member.id).locator('> button, > a').first().waitFor()
      // bob 의 두 쓰기 — 신호가 늦어 alice 의 트리는 낡은 채다(수는 그대로 페이지 2).
      const out = await stack.request(bob, 'PATCH', `/projects/${project.id}/pages/${moved.id}`, { menuNodeId: settings.id })
      expect(out.status).toBe(200)
      created(await stack.request(bob, 'POST', `/projects/${project.id}/pages`, { menuNodeId: member.id, title: '새 결제 화면(bob)' }))

      await chooseRowItem(page, member.id, '회원관리', '삭제')
      const dialog = page.getByRole('dialog', { name: '메뉴 삭제', exact: true })
      await dialog.waitFor()
      const before = await dialog.locator('.wb-shell-menu-delete-pages li').allTextContents()
      await dialog.getByRole('button', { name: '모두 삭제', exact: true }).click()
      // 첫 누름의 답 — 상자가 «바뀌었다»로 다시 서거나(고친 판) 서버에서 서브트리가 사라진다(지운 판). 상자는 누르는 순간 닫혔다 답 뒤에
      // 다시 서므로 «닫힘»을 끝 조건으로 쓰지 않는다. 어느 쪽이든 값으로 단언한다.
      const first = await poll(
        '첫 «모두 삭제»의 답이 선다',
        async () => ({
          changed: await dialog.getByText('목록이 바뀌었습니다 — 다시 확인하세요.', { exact: true }).count(),
          deleted: !(await serverPages()).includes('회원 목록'),
        }),
        (state) => state.changed > 0 || state.deleted,
      )
      const after = await dialog.locator('.wb-shell-menu-delete-pages li').allTextContents()
      const sentence = first.changed === 0 ? null : await dialog.locator('.wb-shell-menu-delete-sentence').innerText()
      const kept = await serverPages()
      const safety = ((await call('GET', `/projects/${project.id}/snapshots`)).body as unknown[]).length
      expect({ before, first, after, sentence, kept, safety }).toEqual({
        before: ['회원 목록', '회원 상세'],
        first: { changed: 1, deleted: false },
        after: ['회원 목록', '새 결제 화면(bob)'],
        sentence: '"회원관리" 메뉴와 페이지 2개가 함께 삭제됩니다',
        kept: ['새 결제 화면(bob)', '환경', '회원 목록', '회원 상세'],
        safety: 0,
      })

      await dialog.getByRole('button', { name: '모두 삭제', exact: true }).click()
      const left = await poll('서버 트리에서 회원관리가 사라진다', serverPages, (titles) => !titles.includes('회원 목록'))
      expect(left).toEqual(['환경', '회원 상세'])
      expect(delay.delayed()).toBeGreaterThan(0)
    } finally {
      await context.close()
      await delay.close()
    }
  })

  /**
   * **받는 쪽** — bob 이 연 페이지(`P1`)를 alice 가 지운다. 지우는 길 둘(페이지 `DELETE` · 그 페이지를 품은 메뉴의 연쇄 삭제)에서 bob 의 화면이
   * 같은 값으로 끝나는지 견준다. 둘 다 `menu-changed`를 내므로 bob 의 트리가 곧바로 다시 받고, 열린 페이지가 빠졌으니 캔버스가 서버에 물어
   * «대상을 찾을 수 없습니다»로 간다(`src/routes/editor.tsx`의 «페이지가 사라짐»). 다음 편집을 기다리지 않는다.
   */
  describe('지운 페이지를 열어 둔 사람', () => {
    async function receiver(slug: string) {
      const project = created(await call('POST', '/projects', { name: '받는 쪽', slug: `recv-${slug}-${Date.now().toString(36)}` }))
      const member = created(await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '회원관리' }))
      const grade = created(await call('POST', `/projects/${project.id}/menu`, { parentId: member.id, title: '등급' }))
      const added = await call('POST', `/projects/${project.id}/members`, { email: stack.users.bob.email, role: 'editor' })
      if (added.status >= 300) throw new Error(`member ${added.status}`)
      const p1 = created(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: member.id, title: '회원 목록' }))
      const p2 = created(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: grade.id, title: '등급표' }))
      const seeded = await call('PATCH', `/projects/${project.id}/pages/${p1.id}/ops`, {
        baseSeq: 0,
        ops: [{ op: 'add', path: '/root/children/0', value: { id: 'n_text0000001', type: 'Text', props: { content: '처음' } } }],
      })
      if (seeded.status >= 300) throw new Error(`seed ${seeded.status}`)
      return { projectId: project.id, member: member.id, grade: grade.id, p1: p1.id, p2: p2.id, P: `/projects/${project.id}/pages/${p1.id}` }
    }

    async function remove(mode: 'page' | 'cascade', fx: Awaited<ReturnType<typeof receiver>>): Promise<number> {
      const answer =
        mode === 'page'
          ? await call('DELETE', `/projects/${fx.projectId}/pages/${fx.p1}`)
          : await call('DELETE', `/projects/${fx.projectId}/menu/${fx.member}`, {
              cascade: true,
              expect: { menuIds: [fx.grade], pageIds: [fx.p1, fx.p2] },
            })
      return answer.status
    }

    async function openBob(P: string) {
      const { context, page } = await stack.openTab(stack.users.bob, { viewport: { width: 1440, height: 900 } })
      const received: string[] = []
      page.on('websocket', (socket) => {
        socket.on('framereceived', (frame) => {
          const kind = /"type":"([a-z-]+)"/.exec(String(frame.payload))?.[1]
          if (kind !== undefined) received.push(kind)
        })
      })
      await page.goto(P)
      await canvasFrame(page).locator('[data-wb-id]').first().waitFor()
      return { context, page, received }
    }

    async function seen(page: Page) {
      return {
        path: new URL(page.url()).pathname.replace(/[0-9a-f-]{36}/g, '<id>'),
        alerts: (await page.getByRole('alert').allTextContents()).map((text) => text.trim()).filter((text) => text !== ''),
        notices: (await page.locator('.wb-shell-footer-notices').innerText().catch(() => '')).trim(),
        canvas: (await canvasFrame(page).locator('[data-wb-id]').allTextContents().catch(() => [] as string[])).join('|'),
        treeRows: await page.locator('.wb-shell-region[aria-label="메뉴·페이지 트리"] [data-tree-row]').count(),
      }
    }

    async function typed(mode: 'page' | 'cascade') {
      const fx = await receiver(`typed-${mode}`)
      const bob = await openBob(fx.P)
      try {
        await bob.page.locator('[data-tree-id="n_text0000001"] > button.wb-shell-structure-node').click()
        const field = bob.page.getByLabel('내용', { exact: true })
        await field.fill('친 글')
        const status = await remove(mode, fx)
        const settled = await poll('bob 의 캔버스가 «페이지가 사라짐»으로', () => seen(bob.page), (now) => now.alerts.length > 0, 5_000)
        await bob.page.waitForTimeout(300)
        if (mode === 'cascade') await shot(bob.page, '5-receiver-after-cascade')
        return {
          status,
          afterDelete: { ...(await seen(bob.page)), fields: await field.count() },
          frames: bob.received.filter((kind) => kind === 'menu-changed').length,
          patchError: bob.received.includes('patch-error'),
          settledRows: settled.treeRows,
        }
      } finally {
        await bob.context.close()
      }
    }

    async function openMenu(mode: 'page' | 'cascade') {
      const fx = await receiver(`menu-${mode}`)
      const bob = await openBob(fx.P)
      try {
        const pageRow = row(bob.page, fx.p1)
        await pageRow.locator('> button, > a').first().hover()
        await pageRow.getByRole('button', { name: '회원 목록 더 보기', exact: true }).click()
        await bob.page.getByRole('menuitem', { name: '이름 변경', exact: true }).waitFor()
        const status = await remove(mode, fx)
        const after = await poll('줄이 빠진다', () => seen(bob.page), (now) => now.alerts.length > 0, 5_000)
        await bob.page.waitForTimeout(300)
        return { status, menuOpen: await bob.page.getByRole('menu').count(), pageRow: await pageRow.count(), after: { ...after, treeRows: null } }
      } finally {
        await bob.context.close()
      }
    }

    it('친 글 — 지우면 곧바로 «페이지가 사라짐»으로 가고 칸도 내려간다 · 페이지 삭제와 같은 판이다', async () => {
      const page = await typed('page')
      const cascade = await typed('cascade')
      // eslint-disable-next-line no-console
      console.log('[받는 쪽 · 친 글]', JSON.stringify({ page, cascade }, null, 1))
      expect([page.status, cascade.status]).toEqual([204, 200])
      expect({ ...cascade, status: null, settledRows: null, afterDelete: { ...cascade.afterDelete, treeRows: null } }).toEqual({
        ...page,
        status: null,
        settledRows: null,
        afterDelete: { ...page.afterDelete, treeRows: null },
      })
      // 캔버스는 «대상을 찾을 수 없습니다» · 속성 칸의 친 글은 그 노드가 내려가며 하단 바가 말한다(`src/panels/property-panel.tsx`의 `DROPPED_DRAFT_NOTICE`).
      expect({ alerts: page.afterDelete.alerts, fields: page.afterDelete.fields, canvas: page.afterDelete.canvas, frames: page.frames, patchError: page.patchError }).toEqual({
        alerts: ['대상을 찾을 수 없습니다', '바뀐 선택 때문에 친 값을 쓰지 않았습니다'],
        fields: 0,
        canvas: '',
        frames: 1,
        patchError: false,
      })
    })

    it('열린 줄 메뉴 — 지우면 그 줄과 함께 닫힌다 · 페이지 삭제와 같은 판이다', async () => {
      const page = await openMenu('page')
      const cascade = await openMenu('cascade')
      // eslint-disable-next-line no-console
      console.log('[받는 쪽 · 열린 메뉴]', JSON.stringify({ page, cascade }, null, 1))
      expect({ ...cascade, status: null }).toEqual({ ...page, status: null })
      expect({ menuOpen: page.menuOpen, pageRow: page.pageRow, path: page.after.path }).toEqual({
        menuOpen: 0,
        pageRow: 0,
        path: '/projects/<id>/pages/<id>',
      })
    })
  })
})
