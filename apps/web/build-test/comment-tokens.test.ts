/**
 * **코멘트 토큰을 눌러 그 자리로 간다 — 실브라우저 판**(설계 `docs/superpowers/specs/2026-11-11-comment-tokens-design.md` «이동»). 앨리스가 «목록»
 * 페이지의 코멘트 본문에 든 «상세 #1» 토큰을 누르면 «상세» 페이지가 서고 그 노드가 골라지고 «코멘트» 탭의 그 묶음이 강조된다. jsdom 판은
 * `test/panels/comment-tokens.test.tsx`.
 *
 * | 무엇이 거짓이면 죽나 |
 * |---|
 * | 토큰이 풀린 글(«상세 #1»)로 안 선다 · 날 id 가 본문 글자에 보인다 |
 * | 누른 뒤 주소 · 캔버스 · 고른 노드 · 강조 가운데 하나가 그 대상이 아니다 |
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canvasFrame, editorStackPrerequisite, poll, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

describe.skipIf(!전제.ok)('코멘트 토큰 이동 — 실브라우저', () => {
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

  const call = (m: string, p: string, b?: unknown) => stack.request(alice, m, p, b)

  async function page(projectId: string, menuId: string, title: string, nodes: unknown[]): Promise<string> {
    const pageId = (await call('POST', `/projects/${projectId}/pages`, { menuNodeId: menuId, title })).body.id as string
    const seeded = await call('PATCH', `/projects/${projectId}/pages/${pageId}/ops`, {
      baseSeq: 0,
      ops: nodes.map((value, at) => ({ op: 'add', path: `/root/children/${at}`, value })),
    })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
    return pageId
  }

  it('다른 페이지의 번호 토큰을 누르면 그 페이지 · 노드 · 코멘트 묶음 강조가 선다', async () => {
    const project = (await call('POST', '/projects', { name: '코멘트 토큰', slug: `ct-${Date.now().toString(36)}` })).body
    const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '회원' })).body
    const list = await page(project.id, menu.id, '목록', [{ id: 'n_a', type: 'Text', props: { content: '목록 글' } }])
    const detail = await page(project.id, menu.id, '상세', [
      { id: 'n_top', type: 'Text', props: { content: '위 글' } },
      { id: 'n_form', type: 'Text', props: { content: '상세 글' } },
    ])
    const post = async (pageId: string, nodeId: string, body: string) => {
      const res = await call('POST', `/projects/${project.id}/pages/${pageId}/comments`, { nodeId, body })
      if (res.status !== 201) throw new Error(`comment ${res.status} ${JSON.stringify(res.body)}`)
    }
    await post(detail, 'n_top', '위에 단 말')
    await post(detail, 'n_form', '상세에 단 말')
    await post(list, 'n_a', `저기 보세요 [옛 글](wb:comment/${detail}/n_form) 끝`)

    const { context, page: tab } = await stack.openTab(stack.users.alice, { viewport: { width: 1600, height: 900 } })
    try {
      await tab.goto(`/projects/${project.id}/pages/${list}`)
      await canvasFrame(tab).locator('[data-wb-id="n_a"]').waitFor()
      await tab.getByRole('tab', { name: '코멘트', exact: true }).click()
      const link = tab.locator('.wb-shell-comments .wb-shell-comment-body a')
      await link.waitFor()
      expect(await link.textContent()).toBe('상세 #2')
      const bodyText = (await tab.locator('.wb-shell-comments .wb-shell-comment-body').textContent()) ?? ''
      expect(bodyText).toBe('저기 보세요 상세 #2 끝')

      await link.click()
      await poll(
        '상세 페이지가 선다',
        async () => new URL(tab.url()).pathname,
        (path) => path === `/projects/${project.id}/pages/${detail}`,
      )
      await canvasFrame(tab).locator('[data-wb-id="n_form"]').waitFor()
      // 판이 선 것(그 페이지의 묶음 둘이 목록에 섬)만 기다리고, 강조는 두 프레임 뒤 한 번 읽는다 — 단언할 값을 폴의 끝 조건에 넣지 않는다.
      await poll(
        '상세의 코멘트 목록',
        () => tab.evaluate(() => document.querySelectorAll('.wb-shell-comments [data-comment-node]').length),
        (n) => n === 2,
      )
      const state = await tab.evaluate(
        () =>
          new Promise((done) =>
            requestAnimationFrame(() =>
              requestAnimationFrame(() =>
                done({
                  selected:
                    document
                      .querySelector('.wb-shell-region[aria-label="구조 트리"] .wb-shell-structure-node[aria-current="true"]')
                      ?.closest('[data-tree-row]')
                      ?.getAttribute('data-tree-id') ?? null,
                  tab: document.querySelector('[role="tab"][aria-selected="true"]')?.firstChild?.textContent?.trim() ?? null,
                  flashed: [...document.querySelectorAll('[data-comment-node][data-flash]')].map((el) =>
                    el.getAttribute('data-comment-node'),
                  ),
                  search: location.search,
                }),
              ),
            ),
          ),
      )
      expect(state).toEqual({ selected: 'n_form', tab: '코멘트', flashed: ['n_form'], search: '' })
      // 강조는 잠깐이다 — 다시 사라진다.
      await poll(
        '강조가 걷힌다',
        () => tab.evaluate(() => document.querySelectorAll('[data-flash]').length),
        (n) => n === 0,
        5_000,
      )
    } finally {
      await context.close()
    }
  })
})
