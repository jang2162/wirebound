/**
 * **공통코드에 묶인 입력 조각의 «종류 바꾸기» — 실브라우저 · 진짜 서버**(`src/edit/change-kind.ts` 머리말 «공통코드에 묶인 노드»). 서버의 검증
 * (`invalid-code-ref` → 422)을 지나는지는 가짜 서버(jsdom 판 `test/panels/change-kind.test.tsx`)로 못 잰다 — 편집은 WS `patch` 로 나가고 거절은
 * `patch-error` 로 온다.
 *
 * | 판 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 못 받는 종류로(셀렉트 → 여러 줄 입력) | 서버가 편집을 거절한다(`patch-error`) · 서버 문서에 `code` 가 남는다 · «공통코드 묶음을 풀었습니다» 가 안 선다 |
 * | 하나 고르는 종류로(체크박스 고름 둘 → 라디오 묶음) | 서버가 거절한다 · 고름이 첫 값 하나로 안 줄어든다 · 묶음이 풀린다 |
 */
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { editorStackPrerequisite, poll, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

interface Node {
  id: string
  type: string
  props?: Record<string, unknown>
  code?: { group: string; item?: string; selected?: string[] }
  children?: Node[]
}

describe.skipIf(!전제.ok)('묶인 조각의 종류 바꾸기 — 실브라우저', () => {
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

  /** 구조 트리에서 그 타입의 줄을 고르고 `…` › «종류 바꾸기…» 상자에서 `kind` 를 누른다. */
  async function changeKind(tab: Page, type: string, kind: string): Promise<void> {
    const tree = tab.locator('.wb-shell-region[aria-label="구조 트리"]')
    const row = tree
      .locator('[data-tree-row]')
      .filter({ has: tab.locator('.wb-shell-structure-node', { hasText: new RegExp(`^${type}`) }) })
    await row.locator('.wb-shell-structure-node').click()
    await row.locator('[aria-haspopup="menu"][aria-label$=" 더 보기"]').click()
    await tab.getByRole('menuitem', { name: '종류 바꾸기…', exact: true }).click()
    await tab.getByRole('dialog', { name: '종류 바꾸기…' }).getByRole('button', { name: kind, exact: true }).click()
  }

  it('못 받는 종류로 바꾸면 서버가 받고 묶음이 풀린다 · 하나 고르는 종류로 바꾸면 고름이 첫 값 하나로 줄어 남는다', async () => {
    const project = (await stack.request(alice, 'POST', '/projects', { name: '종류 바꾸기', slug: `kind-${Date.now().toString(36)}` })).body
    const base = `/projects/${project.id}`
    expect((await stack.request(alice, 'POST', `${base}/codes`, { key: 'G', name: '그룹' })).status).toBe(201)
    for (const [value, name] of [
      ['A', '새 가'],
      ['B', '새 나'],
    ])
      expect((await stack.request(alice, 'POST', `${base}/codes/G/items`, { value, name })).status).toBe(201)
    const menu = (await stack.request(alice, 'POST', `${base}/menu`, { parentId: null, title: '메뉴' })).body
    const page = (await stack.request(alice, 'POST', `${base}/pages`, { menuNodeId: menu.id, title: '주문' })).body
    const P = `${base}/pages/${page.id}`
    const seeded = await stack.request(alice, 'PATCH', `${P}/ops`, {
      baseSeq: 0,
      ops: [
        {
          op: 'add',
          path: '/root/children/0',
          value: {
            id: 'n_kindfield01',
            type: 'Field',
            props: { label: '상태' },
            children: [
              {
                id: 'n_kindselect1',
                type: 'Select',
                props: { options: [{ label: '옛 가', selected: true }] },
                code: { group: 'G', selected: ['A'] },
              },
              {
                id: 'n_kindchecks1',
                type: 'CheckboxGroup',
                props: {
                  options: [
                    { label: '옛 가', selected: true },
                    { label: '옛 나', selected: true },
                  ],
                },
                code: { group: 'G', selected: ['B', 'A'] },
              },
            ],
          },
        },
      ],
    })
    expect(seeded.status).toBe(200)
    const piece = async (id: string): Promise<Node> => {
      const root = (await stack.request(alice, 'GET', P)).body.schema.root as Node
      return root.children![0]!.children!.find((node) => node.id === id)!
    }

    const { context, page: tab } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
    try {
      const frames: string[] = []
      tab.on('websocket', (socket) => {
        socket.on('framereceived', (frame) => {
          if (typeof frame.payload !== 'string') return
          const kind = /"type":"([a-z-]+)"/.exec(frame.payload)?.[1]
          if (kind !== undefined) frames.push(kind)
        })
      })
      await tab.goto(P)
      // 룸에 든 뒤에 누른다 — 그 전의 편집은 REST 로 나가 다른 판이다. 표가 실린 것은 트리 줄의 이름으로 본다(안 실렸으면 표 없이 푼다).
      await poll(
        '룸에 들었다',
        async () => frames.includes('joined'),
        (joined) => joined,
      )
      await tab.locator('.wb-shell-region[aria-label="구조 트리"] .wb-shell-structure-node', { hasText: 'Select 새 가' }).waitFor()

      await changeKind(tab, 'Select', '여러 줄 입력')
      await poll(
        '서버 문서의 종류가 바뀐다',
        async () => (frames.includes('patch-error') ? 'rejected' : (await piece('n_kindselect1')).type),
        (type) => type === 'TextArea' || type === 'rejected',
      )
      expect(await piece('n_kindselect1')).toEqual({ id: 'n_kindselect1', type: 'TextArea' })
      expect(await tab.locator('.wb-shell-info-notice').textContent()).toBe('공통코드 묶음을 풀었습니다')

      // 같은 자리의 행동 메뉴 항목을 다시 누른다 — 앞 누름에서 더블클릭 창(500ms)을 넘긴다.
      await tab.waitForTimeout(600)
      await changeKind(tab, 'CheckboxGroup', '라디오 묶음')
      await poll(
        '서버 문서의 종류가 바뀐다',
        async () => (frames.includes('patch-error') ? 'rejected' : (await piece('n_kindchecks1')).type),
        (type) => type === 'RadioGroup' || type === 'rejected',
      )
      const radio = await piece('n_kindchecks1')
      expect({ type: radio.type, code: radio.code, options: radio.props?.options }).toEqual({
        type: 'RadioGroup',
        code: { group: 'G', selected: ['B'] },
        options: [{ label: '새 가' }, { label: '새 나', selected: true }],
      })
      // 편집 둘이 WS 로 나가 둘 다 받아들여졌다.
      expect({
        ack: frames.filter((kind) => kind === 'patch-ack').length,
        error: frames.filter((kind) => kind === 'patch-error').length,
      }).toEqual({
        ack: 2,
        error: 0,
      })
    } finally {
      await context.close()
    }
  })
})
