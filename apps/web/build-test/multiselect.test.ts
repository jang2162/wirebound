/**
 * **여러 노드 선택 — 실브라우저**(설계서 「설계서 화면 구조」의 «선택 — 고르는 법» · 「소프트 잠금」 · 「개인 undo/redo」의 «편집 하나 = 되돌리기 하나»). 일회용 DB · api · vite ·
 * Chrome(`editor-stack.ts`). 헤드리스 Chrome 의 `navigator.platform` 은 `MacIntel` 이라 명령 키는 Meta 다(`ControlOrMeta`).
 *
 * | 판 | 무엇을 재나 |
 * |---|---|
 * | 두 계정 · 배지 | alice 가 셋을 고르면 bob 화면에 배지 셋 · bob 은 그 줄을 못 고른다(서버가 집합 잠금을 세 줄로 흘린다) |
 * | 복원이 만든 겹침 | 복원이 alice · bob 의 잠금을 조상/자손으로 만든 뒤 bob 의 다음 프레임이 이미 쥔 노드도 거절받아 그것만 선택에서 빠진다 |
 * | 늦은 목록 · 부분 거절 | bob 이 먼저 쥔 노드를 alice 가 사각형에 넣었다 — alice 는 bob 의 잠금 소식을 아직 못 받았다(WS 내림 지연). 서버가 그 노드만 거절하고 alice 의 선택에서 그것만 빠지며 하단 바 한 줄 |
 * | 일괄 속성 | 같은 타입 둘의 갈리는 칸을 바꾸면 서버 revision 하나 · bob 화면에 한 번에 · Cmd+Z 한 번에 통째로 |
 * | 일괄 삭제 | 셋을 지우면 revision 하나 · Cmd+Z 한 번에 통째로 |
 * | 칸에 친 채 고른 것이 바뀐다 | 일부 거절 · 다른 탭의 지움 · 옮김이면 친 글이 앞 목록에 남은 노드로 · Cmd+클릭은 blur 가 앞 목록에 · 남은 노드가 없거나 타입이 바뀌었으면 하단 바 한 줄 · 브라우저 «앞으로»로 다른 페이지면 안 쓰고 한 줄 · 다른 탭의 로그아웃이면 쓰기 0 |
 * | 사각형 | 줌 0.5 · 1.5 · 칸을 굴린 판 · 끝 스크롤 · 4px 안 뗌은 클릭 · 작은 빈 사각형은 누른 자리의 클릭 · 길게 끈 빈 사각형은 아무것도 안 함 · Escape 는 걷기만 · 뗀 뒤의 클릭이 선택을 안 바꾼다 |
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
      // 서버가 나머지 둘은 쥐었다 — bob 화면(늦추지 않은 WS)에 alice 의 배지 둘이 선다. 화면 값만으로는 서버가 집합째 거절한 판과 안 갈린다.
      const bobBadges = await poll(
        'bob 화면에 alice 의 배지 둘',
        () =>
          b.page.evaluate(() =>
            // 배지는 줄(`[data-tree-id]`)의 형제다 — 같은 `li` 안의 줄에서 id 를 읽는다.
            [...document.querySelectorAll('.wb-shell-structure-lock')].map((badge) => badge.parentElement?.querySelector(':scope > [data-tree-id]')?.getAttribute('data-tree-id') ?? '').sort(),
          ),
        (ids) => ids.length >= 2,
        5000,
      ).catch((error: Error) => error.message)
      expect({ delayed: delay.delayed() > 0, right: right.all, after: await picked(a.page), alerts: await alerts(a.page), bobBadges }).toEqual({
        delayed: true,
        right: [id(1), id(2), id(3)],
        after: { anchor: id(3), all: [id(1), id(3)] },
        alerts: [`${stack.users.bob.name}님이 편집 중이라 고를 수 없습니다`],
        // bob 이 쥔 n_t02 는 bob 화면에 배지가 없다(제 잠금).
        bobBadges: [id(1), id(3)],
      })
    } finally {
      await a.close()
      await b.close()
      await delay.close()
    }
  })

  /**
   * **복원이 두 사람의 잠금을 조상/자손으로 만들면 다음 `lock` 프레임이 겹친 노드를 거절한다**(서버 `ws/lock.ts`의 «집합을 갈아 끼운다 —
   * 프레임마다 집합 전부를 판정한다»). alice 가 카드 `n_a`, bob 이 `n_x` · `n_b`를 쥔다. alice 가 `n_x`가 `n_a` 안에 있던 스냅샷을 복원한
   * 뒤 bob 이 `n_c`를 Cmd+클릭으로 더하면, 그 프레임(`n_x` · `n_b` · `n_c`)에서 이미 쥔 `n_x`도 다시 판정되어 거절된다 — bob 의 선택에서
   * `n_x`만 빠지고 하단 바 한 줄(일부 거절의 길). 카나리아: 복원 전 alice 화면에 bob 의 배지 둘 · 복원 응답 200 · bob 이 `restored`를 받았다.
   */
  it('복원이 만든 겹침 — 다음 프레임이 이미 쥔 노드도 거절해 그 노드만 선택에서 빠진다', async () => {
    const P = await fixture('restore-overlap', [
      { id: 'n_a', type: 'Card', props: { title: '카드' }, children: [T('n_a1', '안'), T('n_x', '엑스')] },
      T('n_b', '비'),
      T('n_c', '씨'),
    ])
    const projectId = P.split('/')[2]!
    const snapshot = (await call('POST', `/projects/${projectId}/snapshots`, { tag: 'x-in-a' })).body
    const head = (await call('GET', P)).body.headSeq
    const flat = await call('PATCH', `${P}/ops`, { baseSeq: head, ops: [{ op: 'move', from: '/root/children/0/children/1', path: '/root/children/1' }] })
    if (flat.status >= 300) throw new Error(`flat ${flat.status}`)
    const a = await openTab(P)
    const b = await openTab(P, 'bob')
    try {
      await row(a.page, 'n_a').click()
      await row(b.page, 'n_x').click()
      await row(b.page, 'n_b').click({ modifiers: ['ControlOrMeta'] })
      const bobBadges = await poll(
        'alice 화면에 bob 의 배지 둘',
        () => a.page.locator('.wb-shell-structure-lock').count(),
        (n) => n >= 2,
      )
      const restored = await call('POST', `/projects/${projectId}/snapshots/${snapshot.id}/restore`)
      await b.page.waitForTimeout(500)
      await row(b.page, 'n_c').click({ modifiers: ['ControlOrMeta'] })
      await poll('거절이 bob 에게 닿는다', async () => b.received.filter((kind) => kind === 'lock-denied').length, (n) => n >= 1, 5000).catch(() => 0)
      await b.page.waitForTimeout(300)
      const alertsOfBob = await alerts(b.page)
      expect({
        bobBadges,
        restored: restored.status,
        bob: (await picked(b.page)).all,
        alerts: alertsOfBob,
        received: b.received.includes('restored'),
        // bob 의 화면은 복원 뒤에도 앞 문서다(복원은 배너로 «다시 불러오기»를 기다린다) — 그 문서에서 `n_x`는 alice 의 `n_a` 밖이라 누가 쥐었는지
        // 못 읽어 이름 없이 말한다(설계서 「소프트 잠금」의 «아직 모르면 «다른 사람이»»).
      }).toEqual({ bobBadges: 2, restored: 200, bob: ['n_b', 'n_c'], alerts: ['다른 사람이 편집 중이라 고를 수 없습니다'], received: true })
    } finally {
      await a.close()
      await b.close()
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
   * **칸에 친 채 고른 것이 바뀐다**(`panels/property-panel.tsx`의 `useLeftoverCommit`). 사람이 칸을 떠나지 않았는데(blur 없이) 남의 일이
   * 고른 것을 바꾸면 위젯이 내려가며 친 글을 **앞 목록 가운데 아직 문서에 있고 남이 안 쥔 노드**에 쓴다 — 그런 노드가 없으면 버리고 하단 바
   * 한 줄. 남의 일은 일부 거절 · 같은 사람의 다른 탭(REST — 사람 단위 판정이라 내 잠금에 안 막힌다)의 지움 · 옮김이다. 사람의 Cmd+클릭은
   * 누름이 먼저 blur 로 커밋한다(목록이 바뀌기 전에 — 앞 목록에 간다).
   */
  describe('칸에 친 채 고른 것이 바뀐다', () => {
    /** 같은 사람의 다른 탭 — 서버의 머리 위에 묶음 하나(REST). */
    async function otherTab(P: string, ops: unknown[]): Promise<void> {
      const head = (await call('GET', P)).body.headSeq
      const response = await call('PATCH', `${P}/ops`, { baseSeq: head, ops })
      if (response.status >= 300) throw new Error(`다른 탭의 편집 ${response.status} ${JSON.stringify(response.body)}`)
    }
    const content = (page: Page) => page.getByLabel('내용', { exact: true })

    /**
     * bob 이 `n_t02` 를 먼저 쥔다. WS 내림이 늦은 alice 가 `n_t01 … n_t03` 을 사각형으로 고르고 곧바로 «내용» 칸에 친다(blur 없음). 거절이
     * 닿아 `n_t02` 가 빠지면 친 글은 남은 둘에 간다 · 거절의 통지는 그대로다. 카나리아: 늦춘 덩어리 > 0 · 친 직후 칸 값 · 거절 프레임.
     */
    it('일부 거절 — 친 글이 남은 노드에 가고 거절의 한 줄은 남는다', async () => {
      const P = await fixture('draft-denied', TEXTS(5))
      const delay = await stack.startDownDelay(2500)
      const a = await openTab(P, 'alice', delay.origin)
      const b = await openTab(P, 'bob')
      try {
        await narrow(a.page)
        await poll('alice 의 WS 가 늦춰진 채 붙는다', async () => delay.delayed(), (n) => n >= 1)
        await a.page.waitForTimeout(3000)
        const before = await server(P)
        await row(b.page, id(2)).click()
        await b.page.waitForTimeout(300)
        await marquee(a.page, await nodeBox(a.page, id(1)), await nodeBox(a.page, id(3)))
        await content(a.page).fill('새 글')
        const typed = await content(a.page).inputValue()
        await poll('거절이 alice 에게 닿는다', async () => a.received.filter((kind) => kind === 'lock-denied').length, (n) => n >= 1, 10_000)
        const after = await poll('친 글이 서버에 닿는다', () => server(P), (now) => now.headSeq > before.headSeq, 5000).catch(() => server(P))
        expect({ delayed: delay.delayed() > 0, typed, children: after.children, revisions: after.headSeq - before.headSeq, alerts: await alerts(a.page) }).toEqual({
          delayed: true,
          typed: '새 글',
          children: [`${id(0)}:줄 0`, `${id(1)}:새 글`, `${id(2)}:줄 2`, `${id(3)}:새 글`, `${id(4)}:줄 4`],
          revisions: 1,
          alerts: [`${stack.users.bob.name}님이 편집 중이라 고를 수 없습니다`],
        })
      } finally {
        await a.close()
        await b.close()
        await delay.close()
      }
    })

    it('같은 사람의 다른 탭이 고른 것 하나를 지운다 — 친 글이 남은 노드에 간다', async () => {
      const P = await fixture('draft-removed', TEXTS(3))
      const a = await openTab(P)
      try {
        await row(a.page, id(0)).click()
        await row(a.page, id(1)).click({ modifiers: ['ControlOrMeta'] })
        await content(a.page).fill('일괄 글')
        const before = await server(P)
        await otherTab(P, [{ op: 'remove', path: '/root/children/1' }])
        await poll('고른 것이 하나로 준다', () => picked(a.page), (now) => now.all.length === 1)
        const after = await poll('친 글이 서버에 닿는다', () => server(P), (now) => now.headSeq > before.headSeq + 1, 5000).catch(() => server(P))
        expect({ children: after.children, revisions: after.headSeq - before.headSeq, alerts: await alerts(a.page) }).toEqual({
          children: [`${id(0)}:일괄 글`, `${id(2)}:줄 2`],
          // 지움 하나 + 친 글 하나.
          revisions: 2,
          alerts: [],
        })
      } finally {
        await a.close()
      }
    })

    it('같은 사람의 다른 탭이 고른 카드를 다른 고른 카드 안으로 옮긴다 — 친 글이 둘 다에 간다', async () => {
      const card = (n: number) => ({ id: `n_c${n}`, type: 'Card', props: { title: `카드 ${n}` }, children: [] })
      const P = await fixture('draft-moved', [card(0), card(1)])
      const a = await openTab(P)
      try {
        await row(a.page, 'n_c0').click()
        await row(a.page, 'n_c1').click({ modifiers: ['ControlOrMeta'] })
        await a.page.getByLabel('제목', { exact: true }).fill('같은 제목')
        const before = await server(P)
        await otherTab(P, [{ op: 'move', from: '/root/children/1', path: '/root/children/0/children/-' }])
        await poll('고른 것이 바깥 카드 하나로 준다', () => picked(a.page), (now) => now.all.length === 1)
        const titles = async () => {
          const body = (await call('GET', P)).body
          const outer = body.schema.root.children[0]
          return { headSeq: body.headSeq as number, titles: [outer.props.title, outer.children?.[0]?.props?.title] }
        }
        const after = await poll('친 글이 서버에 닿는다', titles, (now) => now.headSeq > before.headSeq + 1, 5000).catch(() => titles())
        expect({ titles: after.titles, revisions: after.headSeq - before.headSeq, alerts: await alerts(a.page) }).toEqual({
          titles: ['같은 제목', '같은 제목'],
          revisions: 2,
          alerts: [],
        })
      } finally {
        await a.close()
      }
    })

    /** 사람의 Cmd+클릭 — 누름(mousedown)이 칸의 포커스를 거둬 blur 가 **앞 목록에** 커밋한 뒤 목록이 바뀐다. 새로 든 노드에는 안 간다. */
    it('Cmd+클릭으로 목록을 바꾸면 친 글은 앞 목록에 간다 — 새로 든 노드에는 안 간다', async () => {
      const P = await fixture('draft-cmd-click', TEXTS(3))
      const a = await openTab(P)
      try {
        await row(a.page, id(0)).click()
        await row(a.page, id(1)).click({ modifiers: ['ControlOrMeta'] })
        await content(a.page).fill('클릭 전 글')
        const before = await server(P)
        await row(a.page, id(2)).click({ modifiers: ['ControlOrMeta'] })
        const after = await poll('친 글이 서버에 닿는다', () => server(P), (now) => now.headSeq > before.headSeq, 5000).catch(() => server(P))
        await a.page.waitForTimeout(300)
        const settled = await server(P)
        expect({ picked: (await picked(a.page)).all, children: after.children, revisions: settled.headSeq - before.headSeq }).toEqual({
          picked: [id(0), id(1), id(2)],
          children: [`${id(0)}:클릭 전 글`, `${id(1)}:클릭 전 글`, `${id(2)}:줄 2`],
          revisions: 1,
        })
      } finally {
        await a.close()
      }
    })

    /**
     * 같은 id 의 노드가 다른 타입이 된다 — 같은 사람의 다른 탭이 문서를 통째로 갈아 끼워(`PUT …/schema`) 고른 글 노드를 같은 id 의 카드로
     * 바꿨다. 고른 것은 그대로지만 «내용» 칸이 내려가고, 그 초안을 쓸 «글» 노드가 없다: 버리고 하단 바 한 줄(카드의 제목에 쓰지 않는다).
     */
    it('다른 탭이 고른 노드의 타입을 바꾸면 친 글을 버리고 하단 바 한 줄', async () => {
      const P = await fixture('draft-retyped', TEXTS(2))
      const a = await openTab(P)
      try {
        await row(a.page, id(0)).click()
        await content(a.page).fill('타입 전 글')
        const before = (await call('GET', P)).body
        const retyped = structuredClone(before.schema)
        retyped.root.children[0] = { id: id(0), type: 'Card', props: { title: '카드' }, children: [] }
        const put = await call('PUT', `${P}/schema`, { schema: retyped })
        if (put.status >= 300) throw new Error(`PUT ${put.status} ${JSON.stringify(put.body)}`)
        await poll('제목 칸이 선다', () => a.page.getByLabel('제목', { exact: true }).count(), (n) => n === 1)
        await a.page.waitForTimeout(500)
        const after = (await call('GET', P)).body
        expect({
          picked: (await picked(a.page)).all,
          first: after.schema.root.children[0].props,
          revisions: after.headSeq - before.headSeq,
          alerts: await alerts(a.page),
        }).toEqual({ picked: [id(0)], first: { title: '카드' }, revisions: 1, alerts: ['바뀐 선택 때문에 친 값을 쓰지 않았습니다'] })
      } finally {
        await a.close()
      }
    })

    /** 하나 고른 판 — 그 노드를 같은 사람의 다른 탭이 지우면 쓸 노드가 없다: 버리고 하단 바 한 줄. */
    it('하나 고른 노드를 다른 탭이 지우면 친 글을 버리고 하단 바 한 줄', async () => {
      const P = await fixture('draft-single-removed', TEXTS(2))
      const a = await openTab(P)
      try {
        await row(a.page, id(0)).click()
        await content(a.page).fill('하나 글')
        const before = await server(P)
        await otherTab(P, [{ op: 'remove', path: '/root/children/0' }])
        await poll('고른 것이 빈다', () => picked(a.page), (now) => now.all.length === 0)
        await a.page.waitForTimeout(500)
        const after = await server(P)
        expect({ children: after.children, revisions: after.headSeq - before.headSeq, alerts: await alerts(a.page) }).toEqual({
          children: [`${id(1)}:줄 1`],
          revisions: 1,
          alerts: ['바뀐 선택 때문에 친 값을 쓰지 않았습니다'],
        })
      } finally {
        await a.close()
      }
    })

    /**
     * 칸에 친 채 **브라우저 «앞으로»**(popstate)로 다른 페이지 — 칸에 포커스가 있어 blur 가 없다. 위젯이 내려갈 때 스토어는 아직 앞 페이지지만
     * 주소는 다음 페이지라 쓰지 않는다(앞 페이지의 연산을 다음 페이지 경로로 내지 않는다) · 말없이 버리지도 않는다: 다음 페이지 화면에 하단 바 한
     * 줄 · 앞 페이지로 돌아가면 그 줄이 풀린다. 두 페이지는 같은 노드 id 를 싣는다(엉뚱한 페이지에 쓰이면 보이게). 카나리아: 친 직후 칸 값 ·
     * 포커스가 칸.
     */
    it.each([
      ['하나', [0]],
      ['여럿', [0, 1]],
    ] as const)('브라우저 «앞으로»로 다른 페이지에 가면 어느 페이지에도 안 쓰고 하단 바 한 줄 — %s', async (_, picks) => {
      const P = await fixture(`draft-forward-${picks.length}`, TEXTS(3))
      const projectId = P.split('/')[2]!
      const menuId = (await call('GET', P)).body.menuNodeId
      const second = (await call('POST', `/projects/${projectId}/pages`, { menuNodeId: menuId, title: '쪽2' })).body.id
      const P2 = `/projects/${projectId}/pages/${second}`
      const seeded = await call('PATCH', `${P2}/ops`, {
        baseSeq: 0,
        ops: TEXTS(3).map((value, at) => ({ op: 'add', path: `/root/children/${at}`, value: { ...value, props: { content: `둘째 ${at}` } } })),
      })
      if (seeded.status >= 300) throw new Error(`둘째 페이지 ${seeded.status}`)
      const a = await openTab(P)
      try {
        // 기록에 다음 페이지를 쌓는다 — 메뉴 링크로 갔다가 «뒤로».
        await a.page.getByRole('link', { name: '쪽2', exact: true }).click()
        await a.page.waitForURL(`**${P2}`)
        await canvasFrame(a.page).locator(`[data-wb-id="${id(0)}"]`).waitFor()
        await a.page.goBack()
        await a.page.waitForURL(`**${P}`)
        await canvasFrame(a.page).locator(`[data-wb-id="${id(0)}"]`).waitFor()
        await a.page.waitForTimeout(400)
        const before = { A: await server(P), B: await server(P2) }
        await row(a.page, id(picks[0]!)).click()
        for (const n of picks.slice(1)) await row(a.page, id(n)).click({ modifiers: ['ControlOrMeta'] })
        await content(a.page).fill('앞 페이지 글')
        const typed = { value: await content(a.page).inputValue(), focused: await content(a.page).evaluate((el) => el === document.activeElement) }
        await a.page.goForward()
        await a.page.waitForURL(`**${P2}`)
        await canvasFrame(a.page).locator(`[data-wb-id="${id(0)}"]`).waitFor()
        await a.page.waitForTimeout(800)
        const there = { A: await server(P), B: await server(P2), alerts: await alerts(a.page) }
        await a.page.goBack()
        await a.page.waitForURL(`**${P}`)
        await canvasFrame(a.page).locator(`[data-wb-id="${id(0)}"]`).waitFor()
        await a.page.waitForTimeout(500)
        expect({
          typed,
          revisions: { A: there.A.headSeq - before.A.headSeq, B: there.B.headSeq - before.B.headSeq },
          A: there.A.children,
          B: there.B.children,
          alerts: there.alerts,
          back: await alerts(a.page),
        }).toEqual({
          typed: { value: '앞 페이지 글', focused: true },
          revisions: { A: 0, B: 0 },
          A: before.A.children,
          B: before.B.children,
          alerts: ['바뀐 선택 때문에 친 값을 쓰지 않았습니다'],
          back: [],
        })
      } finally {
        await a.close()
      }
    })

    /**
     * 칸에 친 채 **로고 링크 «프로젝트 목록»을 눌러 에디터를 떠난다**(장부 L-091 · 정본 «칸에 친 채 떠나는 두 길») — 사람의 누름이라 blur 가 먼저 돌아 주소가
     * 아직 그 페이지일 때 친 그 페이지에 쓴다(편집 하나). 위 «앞으로»가 어느 페이지에도 안 쓰는 것과 일부러 다르다. 단언은 서버 값: 친 글이 그 페이지에
     * 있고 revision 이 하나 늘었다. 카나리아: 친 직후 칸 값 · 포커스가 칸 · 도착한 주소가 목록.
     *
     * **두 겹이 함께 막는다 — 한 겹씩 떼면 초록이다**: 누름의 blur 커밋(`panels/controls/text-control.tsx` 의 `onBlur`)과 위젯 정리의 쓰기(`useLeftoverCommit`)가
     * 각자 그 페이지에 쓴다. 둘 다 떼면 서버가 그대로여서 죽는다(마지막 값 `headSeq 1`).
     */
    it('로고 링크로 에디터를 떠나면 친 글이 그 페이지에 쓰이고 revision 이 하나 는다 — «앞으로»와 일부러 다른 규칙', async () => {
      const P = await fixture('draft-leave-link', TEXTS(3))
      const a = await openTab(P)
      try {
        const before = await server(P)
        await row(a.page, id(0)).click()
        await content(a.page).fill('떠나며 친 글')
        const typed = { value: await content(a.page).inputValue(), focused: await content(a.page).evaluate((el) => el === document.activeElement) }
        await a.page.getByRole('link', { name: '프로젝트 목록', exact: true }).click()
        await a.page.waitForURL((url) => url.pathname === '/')
        await poll('친 글이 서버에 닿는다', () => server(P), (now) => now.headSeq > before.headSeq, 5_000)
        const after = await server(P)
        expect({
          typed,
          revisions: after.headSeq - before.headSeq,
          first: after.children[0]?.split(':')[1],
        }).toEqual({ typed: { value: '떠나며 친 글', focused: true }, revisions: 1, first: '떠나며 친 글' })
      } finally {
        await a.close()
      }
    })

    /**
     * 칸에 친 채 **같은 브라우저의 다른 탭이 로그아웃** — 세션 소식에 셸이 내려가며 위젯이 초안을 넘기지만, 끝난 세션으로 쓰기를 내지 않는다
     * (`panels/property-panel.tsx`의 `useLeftoverCommit` — 패널이 선 세션 세대). 이 탭이 낸 편집 요청(WS `patch` · REST `PATCH …/ops`)을 센다.
     * 카나리아: 친 직후 칸 값 · 이 탭이 로그인 화면에 닿음 · 다른 탭의 로그아웃 요청이 셌다(요청을 세는 자가 돈다).
     */
    it('같은 브라우저의 다른 탭이 로그아웃하면 내려가는 칸이 쓰기를 내지 않는다', async () => {
      const P = await fixture('draft-signed-out', TEXTS(3))
      const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
      const writes: string[] = []
      page.on('websocket', (socket) => socket.on('framesent', (frame) => String(frame.payload).includes('"type":"patch"') && writes.push('ws patch')))
      page.on('request', (request) => request.method() === 'PATCH' && request.url().includes('/ops') && writes.push(`REST ${request.method()}`))
      const signOuts: string[] = []
      try {
        await page.goto(P)
        await canvasFrame(page).locator(`[data-wb-id="${id(0)}"]`).waitFor()
        const before = await server(P)
        await row(page, id(0)).click()
        await row(page, id(1)).click({ modifiers: ['ControlOrMeta'] })
        await content(page).fill('로그아웃 전 글')
        const typed = await content(page).inputValue()
        const other = await context.newPage()
        other.on('request', (request) => request.method() !== 'GET' && request.url().includes('/auth/') && signOuts.push(new URL(request.url()).pathname))
        await other.goto(P)
        await canvasFrame(other).locator(`[data-wb-id="${id(0)}"]`).waitFor()
        await other.getByRole('button', { name: '더 보기', exact: true }).click()
        await other.getByRole('menuitem', { name: '로그아웃' }).click()
        await other.waitForURL('**/login**', { timeout: 10_000 })
        await page.waitForURL('**/login**', { timeout: 10_000 })
        await page.waitForTimeout(1000)
        const after = await server(P)
        expect({ typed, signedOut: signOuts.length > 0, writes, revisions: after.headSeq - before.headSeq, children: after.children }).toEqual({
          typed: '로그아웃 전 글',
          signedOut: true,
          writes: [],
          revisions: 0,
          children: before.children,
        })
      } finally {
        await context.close()
      }
    })
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
   * **캔버스 문서 안에서 시작하는 사각형** — 카드 안쪽 여백에서 눌러 카드의 글 둘을 감싼다(카드는 안 든다 — 사각형이 카드 안이다). 누름 ·
   * 뗌이 다 카드 요소라 뗀 뒤의 클릭이 카드에 나고, 그 클릭은 표면의 `onClick` 으로 버블돼 카드 하나를 고르려 한다 — 삼켜야 글 둘이 남는다.
   * 카나리아: 누른 점의 `elementFromPoint` 가 iframe(문서 안)이다.
   */
  it('사각형 — 캔버스 문서 안에서 시작해도 서고 뗀 뒤의 클릭이 선택을 안 바꾼다', async () => {
    const P = await fixture('marquee-inside', [{ id: 'n_card', type: 'Card', props: { title: '카드' }, children: [T(id(0), '안 0'), T(id(1), '안 1')] }])
    const a = await openTab(P)
    try {
      await narrow(a.page)
      const card = await nodeBox(a.page, 'n_card')
      const first = await nodeBox(a.page, id(0))
      const second = await nodeBox(a.page, id(1))
      const press = { x: (card.x + first.x) / 2, y: first.y - 2 }
      const inside = await a.page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName ?? null, press)
      await a.page.mouse.move(press.x, press.y)
      await a.page.mouse.down()
      await a.page.mouse.move((second.x + second.width + card.x + card.width) / 2, second.y + second.height + 2, { steps: 10 })
      await a.page.mouse.up()
      await a.page.waitForTimeout(150)
      expect({ inside, card: press.x > card.x && press.x < first.x, picked: (await picked(a.page)).all }).toEqual({
        inside: 'IFRAME',
        card: true,
        picked: [id(0), id(1)],
      })
    } finally {
      await a.close()
    }
  })

  /**
   * **아무것도 감싸지 않은 사각형은 누른 자리의 클릭이다**(`canvas/use-canvas-marquee.ts` 머리말 «빈 사각형») — 노드 위에서 누르고 4px 넘게
   * 흔들려 뗀 손(6px · 10px · 트랙패드처럼 0 ~ 3px 떨림이 쌓여 문턱을 넘는 손)은 그 노드를 고른다. 칸 여백에서 그린 빈 사각형은 여백 클릭과
   * 같다(선택 그대로). 카나리아: 흔들림이 문턱을 넘어 사각형이 섰다(그리는 동안 `[data-wb-marquee]` 1).
   */
  it('사각형 — 노드 위에서 흔들린 클릭은 그 노드를 고르고 칸 여백의 빈 사각형은 선택을 안 바꾼다', async () => {
    const P = await fixture('marquee-jitter', TEXTS(6))
    const a = await openTab(P)
    try {
      await narrow(a.page)
      await row(a.page, id(5)).click()
      const drawn: number[] = []
      /** 노드 안쪽 한 점에서 누르고 `steps` 대로 옮겨 다닌 뒤 뗀다 — 마지막 자리에서 사각형이 서 있었는지 센다. */
      const wobble = async (nodeId: string, steps: Array<[number, number]>) => {
        const box = await nodeBox(a.page, nodeId)
        const at = { x: box.x + 30, y: box.y + box.height / 2 }
        await a.page.mouse.move(at.x, at.y)
        await a.page.mouse.down()
        for (const [dx, dy] of steps) await a.page.mouse.move(at.x + dx, at.y + dy)
        drawn.push(await a.page.locator('[data-wb-marquee]').count())
        await a.page.mouse.up()
        await a.page.waitForTimeout(150)
        return (await picked(a.page)).all
      }
      const six = await wobble(id(4), [[3, 0], [6, 0]])
      const ten = await wobble(id(3), [[5, 2], [10, 0]])
      const trackpad = await wobble(id(1), [[1, 0], [2, 1], [3, 2], [2, 3], [3, 3], [1, 2], [2, 2]])

      const card = await nodeBox(a.page, id(0))
      const pane = { x: card.x - 20, y: card.y + card.height / 2 }
      const inPane = await a.page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.className ?? null, pane)
      await a.page.mouse.move(pane.x, pane.y)
      await a.page.mouse.down()
      await a.page.mouse.move(pane.x - 4, pane.y + 6, { steps: 3 })
      await a.page.mouse.move(pane.x - 2, pane.y + 12, { steps: 3 })
      drawn.push(await a.page.locator('[data-wb-marquee]').count())
      await a.page.mouse.up()
      await a.page.waitForTimeout(150)
      const margin = (await picked(a.page)).all
      expect({ drawn, six, ten, trackpad, inPane: inPane?.includes('wb-shell-canvas') ?? false, margin }).toEqual({
        drawn: [1, 1, 1, 1],
        six: [id(4)],
        ten: [id(3)],
        trackpad: [id(1)],
        inPane: true,
        margin: [id(1)],
      })
    } finally {
      await a.close()
    }
  })

  /**
   * 노드 위에서 누르고 **길게 끈** 빈 사각형(가로로 끌어 높이 1px — 아무것도 완전히 안 감쌈)은 아무것도 안 한다 — 고른 셋이 그대로다(클릭으로
   * 읽어 누른 노드 하나로 갈아 끼우지 않는다). 클릭으로 읽는 것은 누른 점에서 `MARQUEE_CLICK_SLOP`(16px) 안에서만 움직인 사각형이다 — 14px 은
   * 누른 노드를 고르고 24px 은 그대로다. 카나리아: 떼기 직전 사각형이 서 있다(다섯 다).
   */
  it('사각형 — 노드에서 시작해 길게 끈 빈 사각형은 고른 것을 안 바꾼다', async () => {
    const P = await fixture('marquee-long-empty', TEXTS(6))
    const a = await openTab(P)
    try {
      await narrow(a.page)
      const three = async () => {
        await row(a.page, id(0)).click()
        await row(a.page, id(1)).click({ modifiers: ['ControlOrMeta'] })
        await row(a.page, id(3)).click({ modifiers: ['ControlOrMeta'] })
      }
      const drawn: number[] = []
      /** `n_t02` 의 `fromX`(상자 왼끝 기준)에서 누르고 가로로 `dx` 끌어 뗀다. */
      const drag = async (fromX: (box: Box) => number, dx: number) => {
        await three()
        const box = await nodeBox(a.page, id(2))
        const at = { x: fromX(box), y: box.y + box.height / 2 }
        await a.page.mouse.move(at.x, at.y)
        await a.page.mouse.down()
        await a.page.mouse.move(at.x + dx, at.y + 1, { steps: 12 })
        drawn.push(await a.page.locator('[data-wb-marquee]').count())
        await a.page.mouse.up()
        await a.page.waitForTimeout(150)
        return (await picked(a.page)).all
      }
      const leftward = await drag((box) => box.x + box.width - 20, -260)
      const rightward = await drag((box) => box.x + 20, 420)
      const past = await drag((box) => box.x + 40, 24)
      const within = await drag((box) => box.x + 40, 14)
      expect({ drawn, leftward, rightward, past, within }).toEqual({
        drawn: [1, 1, 1, 1],
        leftward: [id(0), id(1), id(3)],
        rightward: [id(0), id(1), id(3)],
        past: [id(0), id(1), id(3)],
        within: [id(2)],
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
