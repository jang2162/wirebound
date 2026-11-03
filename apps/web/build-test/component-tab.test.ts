/**
 * **«컴포넌트» 탭**(`src/panels/component-panel.tsx`) — 편집 모드 우측 탭이 고른 노드의 «속성» 과 «코멘트» 를 한 판에 싣고, 캔버스에서 노드를 누르면
 * 그 탭으로 옮겨 가는지 서버 값과 화면으로 잰다.
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 캔버스 누름 | 다른 탭(«코멘트» · «페이지 정보»)에서 캔버스 노드를 눌러도 탭이 «컴포넌트» 로 안 옮긴다 |
 * | 트리 줄 누름 | 구조 트리 줄을 눌렀는데 탭이 옮겨 간다 |
 * | 두 자리에서 달기 | «컴포넌트» 탭에서 단 말이 그 노드로 서버에 안 서거나 «코멘트» 탭에 안 보인다 · 거꾸로도 |
 * | 남이 단 말 | 다른 사람이 단 말이 다시 연 두 자리 중 한쪽에 안 선다 |
 * | 초안 | 탭 왕복 · 모드 왕복에 «컴포넌트» 탭의 초안이 사라지거나 «코멘트» 탭이 그 노드의 초안을 안 본다 |
 * | 노드를 바꿔 고름 | 묶음이 새 노드의 코멘트로 안 바뀐다 · 앞 노드의 초안이 새 노드의 상자에 남아 새 노드에 달린다 |
 *
 * 남이 단 말은 **다시 마운트할 때** 선다 — 코멘트 목록은 마운트 · 내 쓰기 뒤에만 다시 받는다(실시간 목록 갱신이 없다 — «코멘트» 탭과 같은 길).
 */
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canvasFrame, editorStackPrerequisite, poll, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

interface CommentRow {
  nodeId: string
  body: string
}

describe.skipIf(!전제.ok)('컴포넌트 탭 — 실브라우저', () => {
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

  /** 글 노드 둘(`n_a` · `n_b`)이 든 페이지 — bob 도 editor 다. 경로(`/projects/…/pages/…`)를 낸다. */
  async function seed(slug: string): Promise<string> {
    const project = (await call('POST', '/projects', { name: '컴포넌트 탭', slug: `${slug}-${Date.now().toString(36)}` })).body
    const member = await call('POST', `/projects/${project.id}/members`, { email: stack.users.bob.email, role: 'editor' })
    if (member.status >= 300) throw new Error(`member ${member.status}`)
    const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '가' })).body
    const pageId = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '쪽' })).body.id
    const P = `/projects/${project.id}/pages/${pageId}`
    const nodes = [
      { id: 'n_a', type: 'Text', props: { content: '가 글 노드입니다' } },
      { id: 'n_b', type: 'Text', props: { content: '나 글 노드입니다' } },
    ]
    const seeded = await call('PATCH', `${P}/ops`, {
      baseSeq: 0,
      ops: nodes.map((value, at) => ({ op: 'add', path: `/root/children/${at}`, value })),
    })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
    return P
  }

  async function comments(P: string): Promise<CommentRow[]> {
    const listed = (await call('GET', `${P}/comments`)).body as CommentRow[]
    return listed.map((row) => ({ nodeId: row.nodeId, body: row.body }))
  }

  async function open(P: string): Promise<{ page: Page; close: () => Promise<void> }> {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1920, height: 900 } })
    await page.goto(P)
    await canvasFrame(page).locator('[data-wb-id="n_b"]').waitFor()
    return { page, close: () => context.close() }
  }

  async function selectedTab(page: Page): Promise<string> {
    return ((await page.locator('[role="tab"][aria-selected="true"]').textContent()) ?? '').trim()
  }

  async function selectedId(page: Page): Promise<string | null> {
    return page.evaluate(
      () =>
        document.querySelector('.wb-shell-structure-node[aria-current="true"]')?.closest('[data-tree-row]')?.getAttribute('data-tree-id') ??
        null,
    )
  }

  function treeRow(page: Page, id: string) {
    return page.locator(`.wb-shell-region[aria-label="구조 트리"] [data-tree-row][data-tree-id="${id}"] .wb-shell-structure-node`)
  }

  /**
   * 캔버스에서 그 노드를 누른다 — 노드 상자(화면 좌표)를 4px 격자로 훑어 셸의 맨 위가 캔버스 iframe 이고 그 점의 가장 가까운 노드가 그 노드인 첫 점
   * (`palette-chain.test.ts` 의 꼴). iframe 은 줌으로 줄어 있어 배율로 그 문서 좌표에 옮긴다.
   */
  async function clickCanvasNode(page: Page, id: string): Promise<void> {
    const box = (await canvasFrame(page).locator(`[data-wb-id="${id}"]`).boundingBox())!
    const at = (await page.evaluate(
      `(() => { const f = document.querySelector('iframe.wb-shell-canvas-iframe'); const r = f.getBoundingClientRect(); const d = f.contentDocument;
        const scale = r.width / f.clientWidth;
        for (let y = ${box.y} + 2; y < ${box.y + box.height} - 1; y += 4) for (let x = ${box.x} + 2; x < ${box.x + box.width} - 1; x += 4) {
          if (document.elementFromPoint(x, y) !== f) continue
          const el = d.elementFromPoint((x - r.left) / scale, (y - r.top) / scale)
          if (el?.closest('[data-wb-id]')?.getAttribute('data-wb-id') === '${id}') return { x, y }
        }
        return null })()`,
    )) as { x: number; y: number } | null
    // 카나리아 — 누를 점이 있다.
    expect(at, `${id} 를 누를 점`).not.toBeNull()
    await page.mouse.click(at!.x, at!.y)
    await poll(
      `${id} 를 고른다`,
      () => selectedId(page),
      (v) => v === id,
    )
  }

  async function tab(page: Page, name: string): Promise<void> {
    await page.getByRole('tab', { name, exact: true }).click()
    await poll(
      `${name} 탭`,
      () => selectedTab(page),
      (v) => v === name,
    )
  }

  /** 지금 탭 판에 보이는 코멘트 본문 — 문서 차례. */
  async function bodies(page: Page): Promise<string[]> {
    return page.locator('[role="tabpanel"] .wb-shell-comment-body').allTextContents()
  }

  function draftBox(page: Page) {
    return page.locator('[role="tabpanel"]').getByLabel('새 코멘트', { exact: true })
  }

  /** 상자에 글을 치고 «코멘트 달기» 를 누른 뒤 서버에 그 글이 서기를 기다린다. */
  async function post(page: Page, P: string, body: string): Promise<CommentRow[]> {
    await draftBox(page).fill(body)
    await page.locator('[role="tabpanel"]').getByRole('button', { name: '코멘트 달기' }).click()
    return poll(
      `«${body}» 가 서버에 선다`,
      () => comments(P),
      (rows) => rows.some((row) => row.body === body),
    )
  }

  it('캔버스에서 노드를 누르면 탭이 «컴포넌트» 로 옮긴다 — «코멘트» · «페이지 정보» 에서 시작해도', async () => {
    const P = await seed('ct-canvas')
    const { page, close } = await open(P)
    try {
      const seen: Record<string, string> = {}
      await tab(page, '코멘트')
      await clickCanvasNode(page, 'n_a')
      seen['코멘트 → 캔버스 n_a'] = await selectedTab(page)
      await tab(page, '페이지 정보')
      await clickCanvasNode(page, 'n_b')
      seen['페이지 정보 → 캔버스 n_b'] = await selectedTab(page)
      expect(seen).toEqual({ '코멘트 → 캔버스 n_a': '컴포넌트', '페이지 정보 → 캔버스 n_b': '컴포넌트' })
      // 그 탭이 고른 노드의 속성 판이다 — 머리가 그 노드의 타입이다.
      expect(await page.locator('[role="tabpanel"] .wb-shell-panel-title').first().textContent()).toBe('Text')
    } finally {
      await close()
    }
  })

  it('구조 트리 줄을 누르면 탭은 그대로다', async () => {
    const P = await seed('ct-tree')
    const { page, close } = await open(P)
    try {
      const seen: Record<string, string> = {}
      await tab(page, '코멘트')
      await treeRow(page, 'n_a').click()
      await poll(
        'n_a 를 고른다',
        () => selectedId(page),
        (v) => v === 'n_a',
      )
      seen['코멘트 → 트리 n_a'] = await selectedTab(page)
      await tab(page, '상호작용')
      await treeRow(page, 'n_b').click()
      await poll(
        'n_b 를 고른다',
        () => selectedId(page),
        (v) => v === 'n_b',
      )
      seen['상호작용 → 트리 n_b'] = await selectedTab(page)
      expect(seen).toEqual({ '코멘트 → 트리 n_a': '코멘트', '상호작용 → 트리 n_b': '상호작용' })
    } finally {
      await close()
    }
  })

  it('«컴포넌트» 탭에서 단 말은 그 노드로 서버에 서고 «코멘트» 탭에도 보인다 — «코멘트» 탭에서 단 말도 «컴포넌트» 탭에 보인다', async () => {
    const P = await seed('ct-both')
    const { page, close } = await open(P)
    try {
      await clickCanvasNode(page, 'n_a')
      expect(await post(page, P, '컴포넌트에서 단 말')).toEqual([{ nodeId: 'n_a', body: '컴포넌트에서 단 말' }])
      await poll(
        '컴포넌트 탭 목록에 선다',
        () => bodies(page),
        (v) => v.includes('컴포넌트에서 단 말'),
      )
      await tab(page, '코멘트')
      await poll(
        '코멘트 탭 목록에 선다',
        () => bodies(page),
        (v) => v.includes('컴포넌트에서 단 말'),
      )

      // «코멘트» 탭에 머문 채 트리로 n_b 를 고르고 단다.
      await treeRow(page, 'n_b').click()
      await poll(
        'n_b 를 고른다',
        () => selectedId(page),
        (v) => v === 'n_b',
      )
      const after = await post(page, P, '코멘트 탭에서 단 말')
      expect(after).toEqual([
        { nodeId: 'n_a', body: '컴포넌트에서 단 말' },
        { nodeId: 'n_b', body: '코멘트 탭에서 단 말' },
      ])
      await tab(page, '컴포넌트')
      // «컴포넌트» 탭은 고른 노드(n_b)의 것만 — 같은 목록에서 고른 노드의 무리다.
      expect(
        await poll(
          '컴포넌트 탭이 n_b 의 말을 싣는다',
          () => bodies(page),
          (v) => v.length > 0,
        ),
      ).toEqual(['코멘트 탭에서 단 말'])
    } finally {
      await close()
    }
  })

  it('남이 단 말은 다시 연 두 자리에 다 선다', async () => {
    const P = await seed('ct-other')
    const { page, close } = await open(P)
    try {
      await clickCanvasNode(page, 'n_a')
      // 카나리아 — 판이 섰다(묶음이 비어 있다).
      await page.locator('[role="tabpanel"]').getByText('이 노드에 단 코멘트가 없습니다').waitFor()
      const posted = await stack.request(bob, 'POST', `${P}/comments`, { nodeId: 'n_a', body: '밥이 단 말' })
      expect(posted.status).toBe(201)
      await tab(page, '코멘트')
      const inComments = await poll(
        '코멘트 탭에 밥의 말',
        () => bodies(page),
        (v) => v.length > 0,
      )
      await tab(page, '컴포넌트')
      const inComponent = await poll(
        '컴포넌트 탭에 밥의 말',
        () => bodies(page),
        (v) => v.length > 0,
      )
      expect({ inComments, inComponent }).toEqual({ inComments: ['밥이 단 말'], inComponent: ['밥이 단 말'] })
    } finally {
      await close()
    }
  })

  it('«컴포넌트» 탭의 초안은 탭 왕복 · 모드 왕복에도 남고 «코멘트» 탭도 그 노드의 초안을 본다', async () => {
    const P = await seed('ct-draft')
    const { page, close } = await open(P)
    try {
      await clickCanvasNode(page, 'n_a')
      await draftBox(page).fill('쓰던 말')
      const seen: Record<string, string> = {}
      await tab(page, '코멘트')
      seen['코멘트 탭'] = await draftBox(page).inputValue()
      await tab(page, '컴포넌트')
      seen['탭 왕복'] = await draftBox(page).inputValue()
      await page.getByRole('button', { name: '뷰 모드', exact: true }).click()
      await poll(
        '뷰 모드',
        () => selectedTab(page),
        (v) => v !== '컴포넌트',
      )
      await page.getByRole('button', { name: '편집 모드', exact: true }).click()
      await poll(
        '편집 모드로 돌아와 컴포넌트 탭',
        () => selectedTab(page),
        (v) => v === '컴포넌트',
      )
      seen['모드 왕복'] = await draftBox(page).inputValue()
      expect(seen).toEqual({ '코멘트 탭': '쓰던 말', '탭 왕복': '쓰던 말', '모드 왕복': '쓰던 말' })
      expect(await comments(P)).toEqual([])
    } finally {
      await close()
    }
  })

  it('노드를 바꿔 고르면 묶음이 그 노드의 코멘트가 되고 앞 노드의 초안은 새 노드에 안 달린다', async () => {
    const P = await seed('ct-switch')
    for (const [nodeId, body] of [
      ['n_a', '가에 달린 말'],
      ['n_b', '나에 달린 말'],
    ]) {
      expect((await call('POST', `${P}/comments`, { nodeId, body })).status).toBe(201)
    }
    const { page, close } = await open(P)
    try {
      await clickCanvasNode(page, 'n_a')
      const seen: Record<string, unknown> = {}
      seen['n_a 목록'] = await poll(
        'n_a 묶음',
        () => bodies(page),
        (v) => v.length > 0,
      )
      await draftBox(page).fill('가에 쓰던 말')
      await clickCanvasNode(page, 'n_b')
      seen['n_b 목록'] = await poll(
        'n_b 묶음',
        () => bodies(page),
        (v) => v.length > 0 && !v.includes('가에 달린 말'),
      )
      seen['n_b 상자'] = await draftBox(page).inputValue()
      // 상자가 비어 있으면 «코멘트 달기» 는 꺼져 있다 — 앞 노드의 글을 새 노드에 달 길이 없다.
      seen['n_b 달기 꺼짐'] = await page.locator('[role="tabpanel"]').getByRole('button', { name: '코멘트 달기' }).isDisabled()
      expect(await post(page, P, '나에 새로 쓴 말')).toEqual([
        { nodeId: 'n_a', body: '가에 달린 말' },
        { nodeId: 'n_b', body: '나에 달린 말' },
        { nodeId: 'n_b', body: '나에 새로 쓴 말' },
      ])
      await clickCanvasNode(page, 'n_a')
      seen['n_a 로 돌아온 상자'] = await draftBox(page).inputValue()
      expect(seen).toEqual({
        'n_a 목록': ['가에 달린 말'],
        'n_b 목록': ['나에 달린 말'],
        'n_b 상자': '',
        'n_b 달기 꺼짐': true,
        'n_a 로 돌아온 상자': '가에 쓰던 말',
      })
    } finally {
      await close()
    }
  })
})
