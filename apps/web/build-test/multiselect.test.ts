/**
 * **여러 노드 선택 — 실브라우저**(설계서 「설계서 화면 구조」의 «선택» · 「소프트 잠금」 · «편집 하나 = 되돌리기 하나»). 일회용 DB · api · vite ·
 * Chrome(`editor-stack.ts`). 헤드리스 Chrome 의 `navigator.platform` 은 `MacIntel` 이라 명령 키는 Meta 다(`ControlOrMeta`).
 *
 * | 판 | 무엇을 재나 |
 * |---|---|
 * | 두 계정 · 배지 | alice 가 셋을 고르면 bob 화면에 배지 셋 · bob 은 그 줄을 못 고른다(서버가 집합 잠금을 세 줄로 흘린다) |
 * | 늦은 목록 · 부분 거절 | bob 이 먼저 쥔 노드를 alice 가 사각형에 넣었다 — alice 는 bob 의 잠금 소식을 아직 못 받았다(WS 내림 지연). 서버가 그 노드만 거절하고 alice 의 선택에서 그것만 빠지며 하단 바 한 줄 |
 * | 일괄 속성 | 같은 타입 둘의 갈리는 칸을 바꾸면 서버 revision 하나 · bob 화면에 한 번에 · Cmd+Z 한 번에 통째로 |
 * | 일괄 삭제 | 셋을 지우면 revision 하나 · Cmd+Z 한 번에 통째로 |
 * | 사각형 | 줌 0.5 · 1.5 · 칸을 굴린 판 · 끝 스크롤 · 4px 안 뗌은 클릭 · Escape 는 걷기만 · 뗀 뒤의 클릭이 선택을 안 바꾼다 |
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
const id = (n: number) => `n_t${String(n).padStart(2, '0')}`
/** 글 `count` 개 — `n_t00` … */
const TEXTS = (count: number) => Array.from({ length: count }, (_, n) => T(id(n), `줄 ${n}`))

interface Box {
  x: number
  y: number
  width: number
  height: number
}

describe.skipIf(!전제.ok)('E2 여러 노드 선택 — 실브라우저', () => {
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
    expect(before.listeningPorts.length).toBeGreaterThanOrEqual(2)
    expect(before.databases).toBe(1)
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  })

  const call = (m: string, p: string, b?: unknown) => stack.request(alice, m, p, b)

  /** 프로젝트 · 메뉴 · 페이지 하나 — bob 은 editor. */
  async function fixture(slug: string, nodes: unknown[]): Promise<string> {
    const project = (await call('POST', '/projects', { name: 'E2 여러 노드', slug: `${slug}-${Date.now().toString(36)}` })).body
    const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '가' })).body
    const member = await call('POST', `/projects/${project.id}/members`, { email: stack.users.bob.email, role: 'editor' })
    if (member.status >= 300) throw new Error(`member ${member.status}`)
    const pageId = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '쪽' })).body.id
    const P = `/projects/${project.id}/pages/${pageId}`
    const seeded = await call('PATCH', `${P}/ops`, { baseSeq: 0, ops: nodes.map((value, at) => ({ op: 'add', path: `/root/children/${at}`, value })) })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
    return P
  }

  /** 서버의 그 페이지 — 뿌리 자식의 `id:내용` 과 `headSeq`. */
  async function server(P: string): Promise<{ children: string[]; headSeq: number }> {
    const body = (await call('GET', P)).body
    const children = (body.schema.root.children ?? []).map(
      (node: { id: string; props?: { content?: string } }) => `${node.id}:${node.props?.content ?? ''}`,
    )
    return { children, headSeq: body.headSeq }
  }

  async function openTab(P: string, user: 'alice' | 'bob' = 'alice', origin?: string) {
    const { context, page } = await stack.openTab(stack.users[user], { viewport: { width: 1440, height: 900 }, ...(origin === undefined ? {} : { origin }) })
    const received: string[] = []
    page.on('websocket', (socket) => {
      socket.on('framereceived', (frame) => {
        const kind = /"type":"([a-z-]+)"/.exec(String(frame.payload))?.[1]
        if (kind !== undefined) received.push(kind)
      })
    })
    await page.goto(P)
    await canvasFrame(page).locator('[data-wb-id]').first().waitFor()
    return { page, received, close: () => context.close() }
  }

  const row = (page: Page, nodeId: string) => page.locator(`[data-tree-id="${nodeId}"] > button.wb-shell-structure-node`)
  /** 캔버스 노드의 그려진 상자(페이지 좌표 — 줌이 곱해진 값). */
  async function nodeBox(page: Page, nodeId: string): Promise<Box> {
    const box = await canvasFrame(page).locator(`[data-wb-id="${nodeId}"]`).boundingBox()
    if (box === null) throw new Error(`${nodeId} 상자가 없다`)
    return box
  }
  /** 고른 것 — 캔버스 외곽선(기준 노드 · 나머지)으로 읽는다(화면이 그린 값). */
  const picked = (page: Page) =>
    page.evaluate(() => {
      const anchor = document.querySelector('[data-wb-selected-id]')?.getAttribute('data-wb-selected-id') ?? null
      const members = [...document.querySelectorAll('[data-wb-member-id]')].map((element) => element.getAttribute('data-wb-member-id')!)
      return { anchor, all: [...(anchor === null ? [] : [anchor]), ...members].sort() }
    })
  const alerts = (page: Page) => page.getByRole('alert').allTextContents()

  /**
   * `from` 의 왼쪽 위 바깥에서 `to` 의 오른쪽 아래 바깥까지 사각형을 그린다. 글 노드는 문서 폭을 다 차 그 왼끝이 문서의 왼끝이라 누름은 캔버스
   * 칸의 여백(문서 바깥)에서 난다 — 칸의 빈 자리도 사각형의 시작점이다(`canvas/use-canvas-marquee.ts` 머리말).
   */
  async function marquee(page: Page, from: Box, to: Box, options: { shift?: boolean; hold?: () => Promise<void> } = {}): Promise<void> {
    if (options.shift === true) await page.keyboard.down('Shift')
    await page.mouse.move(from.x - 6, from.y - 3)
    await page.mouse.down()
    await page.mouse.move(to.x + to.width + 6, to.y + to.height + 3, { steps: 10 })
    await options.hold?.()
    await page.mouse.up()
    if (options.shift === true) await page.keyboard.up('Shift')
  }

  /**
   * 캔버스 문서를 좁힌다(뷰포트 폭 375) — 1280 폭 문서는 이 창(1440)의 캔버스 칸보다 넓어 줌 1 · 1.5 에서 문서 오른끝이 칸 밖이다. 문서 폭을
   * 다 차는 글 노드를 사각형이 완전히 감싸려면 문서 양끝이 칸 안에 보여야 한다.
   */
  async function narrow(page: Page): Promise<void> {
    await page.getByLabel('뷰포트 폭').selectOption('375')
    await page.waitForTimeout(200)
  }

  /** 줌 단추로 그 배율까지 민다(`canvas-drop.test.ts` 와 같은 길). */
  async function zoomTo(page: Page, target: number): Promise<void> {
    const group = page.getByRole('group', { name: '줌' })
    for (let step = 0; step < 12; step += 1) {
      const now = Number((await group.locator('.wb-shell-zoom-value').textContent())?.replace('%', '')) / 100
      if (Math.abs(now - target) < 0.01) return
      await group.getByRole('button', { name: now < target ? '확대' : '축소', exact: true }).click()
    }
    throw new Error(`줌 ${target} 에 못 닿았다`)
  }

  /** 캔버스 칸을 밀어 그 노드가 칸 위에서 `offset` 아래에 서게 한다. 민 뒤 칸의 `scrollTop`. */
  async function scrollToNode(page: Page, nodeId: string, offset: number): Promise<number> {
    const box = await nodeBox(page, nodeId)
    return page.evaluate(
      ({ y, offset }) => {
        const canvas = document.querySelector('.wb-shell-canvas') as HTMLElement
        canvas.scrollTop += y - canvas.getBoundingClientRect().top - offset
        return canvas.scrollTop
      },
      { y: box.y, offset },
    )
  }

  it('alice 가 셋을 고르면 bob 화면에 배지 셋이 서고 bob 은 그 줄을 못 고른다', async () => {
    const P = await fixture('badges', TEXTS(5))
    const a = await openTab(P)
    const b = await openTab(P, 'bob')
    try {
      await row(a.page, id(0)).click()
      await row(a.page, id(2)).click({ modifiers: ['ControlOrMeta'] })
      await row(a.page, id(4)).click({ modifiers: ['ControlOrMeta'] })
      const badges = await poll(
        'bob 화면에 배지 셋',
        () => b.page.locator('.wb-shell-structure-lock').allTextContents(),
        (texts) => texts.length >= 3,
      )
      const disabled = await Promise.all([0, 1, 2, 3, 4].map((n) => row(b.page, id(n)).isDisabled()))
      expect({ alice: (await picked(a.page)).all, badges, disabled }).toEqual({
        alice: [id(0), id(2), id(4)],
        badges: Array(3).fill(`${stack.users.alice.name} 편집 중`),
        disabled: [true, false, true, false, true],
      })
    } finally {
      await a.close()
      await b.close()
    }
  })

  /**
   * bob 이 `n_t02` 를 먼저 쥔다. alice 는 WS 내림이 늦어 그 소식을 모른 채 `n_t01 … n_t03` 을 사각형으로 고른다(화면은 셋을 고르고 집합을
   * 보낸다). 서버가 `n_t02` 만 거절하고(`lock-denied`) alice 의 선택에서 그것만 빠지며 하단 바가 «bob님이 편집 중이라 고를 수 없습니다» 한 줄.
   * 카나리아: 늦춘 덩어리 수 > 0 · 사각형 직후 alice 가 셋을 고른 값 · 거절 프레임이 닿았다.
   */
  it('bob 이 먼저 쥔 노드를 늦게 안 alice 가 사각형에 넣으면 그것만 빠지고 하단 바 한 줄', async () => {
    const P = await fixture('late-list', TEXTS(5))
    const delay = await stack.startDownDelay(2500)
    const a = await openTab(P, 'alice', delay.origin)
    const b = await openTab(P, 'bob')
    try {
      await narrow(a.page)
      await poll('alice 의 WS 가 늦춰진 채 붙는다', async () => delay.delayed(), (n) => n >= 1)
      await a.page.waitForTimeout(3000)
      await row(b.page, id(2)).click()
      await b.page.waitForTimeout(300)
      const from = await nodeBox(a.page, id(1))
      const to = await nodeBox(a.page, id(3))
      await marquee(a.page, from, to)
      const right = await picked(a.page)
      await poll('거절이 alice 에게 닿는다', async () => a.received.filter((kind) => kind === 'lock-denied').length, (n) => n >= 1, 10_000)
      await a.page.waitForTimeout(300)
      expect({ delayed: delay.delayed() > 0, right: right.all, after: await picked(a.page), alerts: await alerts(a.page) }).toEqual({
        delayed: true,
        right: [id(1), id(2), id(3)],
        after: { anchor: id(3), all: [id(1), id(3)] },
        alerts: [`${stack.users.bob.name}님이 편집 중이라 고를 수 없습니다`],
      })
    } finally {
      await a.close()
      await b.close()
      await delay.close()
    }
  })

  it('일괄 속성 — 갈리는 칸 하나를 바꾸면 revision 하나로 bob 화면에 한 번에 · Cmd+Z 한 번에 통째로', async () => {
    const P = await fixture('bulk-props', TEXTS(3))
    const a = await openTab(P)
    const b = await openTab(P, 'bob')
    try {
      const before = await server(P)
      await row(a.page, id(0)).click()
      await row(a.page, id(2)).click({ modifiers: ['ControlOrMeta'] })
      const field = a.page.getByLabel('내용', { exact: true })
      const shown = { value: await field.inputValue(), placeholder: await field.getAttribute('placeholder') }
      await field.fill('같게')
      await field.press('Tab')
      await poll('서버에 닿는다', () => server(P), (now) => now.headSeq > before.headSeq)
      const bobSees = await poll(
        'bob 화면에 둘 다',
        () => canvasFrame(b.page).locator('[data-wb-id]').allTextContents(),
        (texts) => texts.filter((text) => text.includes('같게')).length >= 2,
      )
      const changed = await server(P)
      // 포커스가 속성 패널의 다음 칸(입력 표면)이면 Cmd+Z 는 그 칸의 것이다 — 트리 줄로 옮긴 뒤 누른다.
      await row(a.page, id(1)).click()
      await a.page.keyboard.press('ControlOrMeta+z')
      const undone = await poll('되돌림이 닿는다', () => server(P), (now) => now.headSeq > changed.headSeq)
      expect({ shown, revisions: changed.headSeq - before.headSeq, changed: changed.children, bob: bobSees.length > 0, undone: undone.children, undoRevisions: undone.headSeq - changed.headSeq }).toEqual({
        shown: { value: '', placeholder: '여러 값' },
        revisions: 1,
        changed: [`${id(0)}:같게`, `${id(1)}:줄 1`, `${id(2)}:같게`],
        bob: true,
        undone: before.children,
        undoRevisions: 1,
      })
    } finally {
      await a.close()
      await b.close()
    }
  })

  it('일괄 삭제 — 셋을 지우면 revision 하나 · Cmd+Z 한 번에 통째로', async () => {
    const P = await fixture('bulk-delete', TEXTS(5))
    const a = await openTab(P)
    try {
      const before = await server(P)
      await row(a.page, id(1)).click()
      await row(a.page, id(3)).click({ modifiers: ['ControlOrMeta'] })
      await row(a.page, id(4)).click({ modifiers: ['ControlOrMeta'] })
      await a.page.keyboard.press('Delete')
      const removed = await poll('지움이 닿는다', () => server(P), (now) => now.headSeq > before.headSeq)
      await a.page.keyboard.press('ControlOrMeta+z')
      const undone = await poll('되돌림이 닿는다', () => server(P), (now) => now.headSeq > removed.headSeq)
      expect({ removed: removed.children, revisions: removed.headSeq - before.headSeq, undone: undone.children, undoRevisions: undone.headSeq - removed.headSeq }).toEqual({
        removed: [`${id(0)}:줄 0`, `${id(2)}:줄 2`],
        revisions: 1,
        undone: before.children,
        undoRevisions: 1,
      })
    } finally {
      await a.close()
    }
  })

  /**
   * 줌 0.5 · 1.5 에서 `n_t02 … n_t04` 를 감싼 사각형이 그 셋을 고른다 · 칸을 굴린 판(scrollTop > 0)에서도 · Shift 로 그리면 더한다. 판정은 문서
   * 좌표라 줌 · 칸 스크롤이 안 끼어든다(`canvas/canvas-marquee.ts` 머리말).
   */
  it('사각형 — 줌 0.5 · 1.5 · 칸을 굴린 판 · Shift 로 더하기', async () => {
    const P = await fixture('marquee-zoom', TEXTS(24))
    const a = await openTab(P)
    try {
      await narrow(a.page)
      const rows: Record<string, unknown> = {}
      for (const zoom of [0.5, 1.5]) {
        await zoomTo(a.page, zoom)
        await scrollToNode(a.page, id(2), 80)
        await marquee(a.page, await nodeBox(a.page, id(2)), await nodeBox(a.page, id(4)))
        rows[String(zoom)] = (await picked(a.page)).all
      }
      await zoomTo(a.page, 1)
      const scrollTop = await scrollToNode(a.page, id(18), 120)
      await marquee(a.page, await nodeBox(a.page, id(18)), await nodeBox(a.page, id(19)))
      const scrolled = (await picked(a.page)).all
      await marquee(a.page, await nodeBox(a.page, id(21)), await nodeBox(a.page, id(21)), { shift: true })
      const added = (await picked(a.page)).all
      expect({ rows, scrolled: { scrollTop: scrollTop > 0, picked: scrolled }, added }).toEqual({
        rows: { '0.5': [id(2), id(3), id(4)], '1.5': [id(2), id(3), id(4)] },
        scrolled: { scrollTop: true, picked: [id(18), id(19)] },
        added: [id(18), id(19), id(21)],
      })
    } finally {
      await a.close()
    }
  })

  /**
   * 칸 위쪽 노드에서 누르고 칸 아래 끝(24px 안)에 멈춰 둔다 — 끌어 놓기와 같은 셈으로 칸이 굴러 처음 화면 밖 노드까지 든다. 카나리아: 칸이 굴렀다 ·
   * 처음 화면 밖이던 노드가 들었다.
   */
  it('사각형 — 칸 끝에 닿으면 끝 스크롤로 화면 밖 노드까지 든다', async () => {
    const P = await fixture('marquee-edge', TEXTS(40))
    const a = await openTab(P)
    try {
      await narrow(a.page)
      const pane = await a.page.locator('.wb-shell-canvas').boundingBox()
      if (pane === null) throw new Error('캔버스 칸이 없다')
      const start = await nodeBox(a.page, id(0))
      const firstHidden = await a.page.evaluate(() => {
        const canvas = document.querySelector('.wb-shell-canvas')!.getBoundingClientRect()
        const frame = document.querySelector<HTMLIFrameElement>('iframe.wb-shell-canvas-iframe')!
        const top = frame.getBoundingClientRect().top
        const nodes = [...frame.contentDocument!.querySelectorAll('[data-wb-id]')]
        return nodes.map((node) => node.getAttribute('data-wb-id')).find((nodeId, index) => nodeId!.startsWith('n_t') && top + nodes[index]!.getBoundingClientRect().bottom > canvas.bottom) ?? null
      })
      await a.page.mouse.move(start.x - 3, start.y - 3)
      await a.page.mouse.down()
      await a.page.mouse.move(start.x + start.width + 3, pane.y + pane.height - 8, { steps: 10 })
      await a.page.waitForTimeout(1500)
      const scrollTop = await a.page.evaluate(() => (document.querySelector('.wb-shell-canvas') as HTMLElement).scrollTop)
      await a.page.mouse.move(start.x + start.width + 4, pane.y + pane.height - 8)
      await a.page.mouse.up()
      const all = (await picked(a.page)).all
      expect({ scrolled: scrollTop > 0, firstHidden: firstHidden !== null && all.includes(firstHidden), first: all[0] }).toEqual({
        scrolled: true,
        firstHidden: true,
        first: id(0),
      })
    } finally {
      await a.close()
    }
  })

  /**
   * 4px 안에서 뗀 누름은 지금 클릭이다(그 노드 하나) · 사각형을 그리다 Escape 는 걷기만 한다(선택 그대로 · 사각형 없음) · 사각형을 뗀 뒤의 클릭이
   * 선택을 바꾸지 않는다(뒤따르는 클릭 삼킴 — 위 판들도 같은 성질에 기댄다).
   */
  it('사각형 — 4px 안 뗌은 클릭 · Escape 는 걷기만 · 뗀 뒤의 클릭은 삼킨다', async () => {
    const P = await fixture('marquee-click', TEXTS(5))
    const a = await openTab(P)
    try {
      await narrow(a.page)
      const one = await nodeBox(a.page, id(1))
      await a.page.mouse.move(one.x + 10, one.y + one.height / 2)
      await a.page.mouse.down()
      await a.page.mouse.move(one.x + 12, one.y + one.height / 2)
      await a.page.mouse.up()
      const click = await picked(a.page)

      const from = await nodeBox(a.page, id(2))
      const to = await nodeBox(a.page, id(3))
      await marquee(a.page, from, to, {
        hold: async () => {
          await a.page.keyboard.press('Escape')
        },
      })
      const escaped = { picked: await picked(a.page), drawn: await a.page.locator('[data-wb-marquee]').count() }

      // 사각형을 뗀 뒤 브라우저가 내는 클릭(누른 자리와 뗀 자리의 공통 조상 — 캔버스 문서의 뿌리 쪽)이 선택을 그 자리 하나로 바꾸면 안 된다.
      await marquee(a.page, from, to)
      await a.page.waitForTimeout(100)
      const ended = (await picked(a.page)).all
      expect({ click, escaped, ended }).toEqual({
        click: { anchor: id(1), all: [id(1)] },
        escaped: { picked: { anchor: id(1), all: [id(1)] }, drawn: 0 },
        ended: [id(2), id(3)],
      })
    } finally {
      await a.close()
    }
  })
})
