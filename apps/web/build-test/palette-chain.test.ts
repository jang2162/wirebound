/**
 * **연달아 넣기 — 방금 넣은 노드 «뒤»**(`src/palette/palette-add.ts` 머리말 «연달아 넣기») — 하단 판 넣기 단추를 연달아 누르면 방금 넣은 노드의 형제로
 * 서고, 사람이 그 노드를 다시 누르면 «안» 으로 돌아가는지 서버 문서로 잰다.
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 검색 폼에 필드 셋 · 셋째를 눌러 글 | 필드 셋이 폼 몸통의 형제가 아니다(필드 안의 필드) · 셋째 필드를 캔버스에서 고른 뒤 넣은 글이 그 필드 안이 아니다 |
 * | 끌어 놓은 배치 뒤 | 카드 안에 끌어 놓은 배치를 고른 채 «배치 넣기» 가 그 형제가 아니다(배치 안의 배치) |
 *
 * 같은 카드의 넣기 단추를 `DOUBLE_CLICK_MS`(500ms) 안에 다시 누르면 둘째를 삼킨다(`palette/component-palette.tsx` 머리말 «카드») — 누름 사이를 그보다 띄운다.
 */
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DOUBLE_CLICK_MS } from '../src/shell/action-menu'
import {
  canvasFrame,
  dragLayoutSettled,
  editorStackPrerequisite,
  poll,
  startEditorStack,
  type EditorStack,
  type Session,
} from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

interface SchemaNode {
  id: string
  type: string
  children?: SchemaNode[]
  zones?: Record<string, SchemaNode[]>
}

const KNOWN = new Set(['n_form', 'n_card', 'n_last'])

describe.skipIf(!전제.ok)('연달아 넣기 — 실브라우저', () => {
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

  async function seed(slug: string, nodes: unknown[]): Promise<string> {
    const project = (await call('POST', '/projects', { name: '연달아 넣기', slug: `${slug}-${Date.now().toString(36)}` })).body
    const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '가' })).body
    const pageId = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '쪽' })).body.id
    const P = `/projects/${project.id}/pages/${pageId}`
    const seeded = await call('PATCH', `${P}/ops`, {
      baseSeq: 0,
      ops: nodes.map((value, at) => ({ op: 'add', path: `/root/children/${at}`, value })),
    })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
    return P
  }

  async function root(P: string): Promise<SchemaNode> {
    return (await call('GET', P)).body.schema.root as SchemaNode
  }

  /** 몸통(`children`)만 펴서 본 꼴 — 아는 노드는 id, 새 노드는 `+타입`. 구역은 안 본다(검색 폼의 단추 구역). */
  function shapeOf(node: SchemaNode, top = true): unknown {
    const name = top ? 'n_root' : KNOWN.has(node.id) ? node.id : `+${node.type}`
    const kids = node.children ?? []
    return kids.length > 0 ? { [name]: kids.map((child) => shapeOf(child, false)) } : name
  }

  /** 그 타입의 새 노드 id — 문서 차례. */
  function newIds(node: SchemaNode, type: string, out: string[] = []): string[] {
    if (node.type === type && !KNOWN.has(node.id)) out.push(node.id)
    for (const child of node.children ?? []) newIds(child, type, out)
    for (const list of Object.values(node.zones ?? {})) for (const child of list) newIds(child, type, out)
    return out
  }

  /** 창 1920 — 캔버스 칸이 페이지 폭(1280)을 다 담아 검색 폼의 셋째 열이 오른쪽 패널 밑에 숨지 않는다. */
  async function open(P: string): Promise<{ page: Page; close: () => Promise<void> }> {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1920, height: 900 } })
    await page.goto(P)
    await canvasFrame(page).locator('[data-wb-id]').first().waitFor()
    await page.getByRole('contentinfo', { name: '하단 바' }).getByRole('button', { name: '컴포넌트', exact: true }).click()
    await page.getByRole('region', { name: '컴포넌트 목록' }).waitFor()
    return { page, close: () => context.close() }
  }

  async function only(page: Page, type: string): Promise<void> {
    await page.getByRole('searchbox', { name: '컴포넌트 찾기' }).fill(type)
    await page.locator(`[data-wb-palette-card="${type}"]`).waitFor()
  }

  function treeRow(page: Page, id: string) {
    return page.locator(`.wb-shell-region[aria-label="구조 트리"] [data-tree-row][data-tree-id="${id}"]`)
  }

  async function selectedId(page: Page): Promise<string | null> {
    return page.evaluate(
      () =>
        document.querySelector('.wb-shell-structure-node[aria-current="true"]')?.closest('[data-tree-row]')?.getAttribute('data-tree-id') ??
        null,
    )
  }

  async function notice(page: Page): Promise<string> {
    return ((await page.locator('[data-wb-palette-notice]').textContent()) ?? '').trim()
  }

  /**
   * 그 카드의 «넣기» 단추를 누르고 서버에 닿기를 기다린다 — 그 타입의 새 노드 수가 늘거나 거절 문장이 서면 끝(자리는 기다리지 않는다 — 단언할 값이다).
   * 넣은 노드가 골라졌는지를 함께 낸다.
   */
  async function addOnce(page: Page, P: string, label: string, type: string): Promise<{ notice: string; selectedIsNew: boolean }> {
    const before = newIds(await root(P), type).length
    await page.waitForTimeout(DOUBLE_CLICK_MS + 100)
    await page.getByRole('button', { name: `${label} 넣기`, exact: true }).click()
    const ids = await poll(
      `${label} 넣기가 서버에 닿음`,
      async () => ({ ids: newIds(await root(P), type), notice: await notice(page) }),
      (v) => v.ids.length > before || v.notice !== '',
    )
    const last = ids.ids[ids.ids.length - 1]
    const selected = await poll(
      '넣은 노드를 고른다',
      () => selectedId(page),
      (v) => ids.ids.length === before || v === last,
    )
    return { notice: ids.notice, selectedIsNew: ids.ids.length > before && selected === last }
  }

  it('검색 폼을 고르고 필드를 셋 넣으면 폼 몸통에 형제 셋 — 셋째를 캔버스에서 눌러 글을 넣으면 그 필드 안', async () => {
    const P = await seed('chain-form', [
      { id: 'n_form', type: 'SearchForm' },
      { id: 'n_last', type: 'Text', props: { content: '끝' } },
    ])
    const { page, close } = await open(P)
    try {
      await treeRow(page, 'n_form').locator('.wb-shell-structure-node').click()
      expect(await selectedId(page)).toBe('n_form')
      await only(page, 'Field')
      const adds = []
      for (let i = 0; i < 3; i++) adds.push(await addOnce(page, P, '입력 필드', 'Field'))
      expect(adds).toEqual(Array.from({ length: 3 }, () => ({ notice: '', selectedIsNew: true })))
      const field = { '+Field': ['+Input'] }
      expect(shapeOf(await root(P))).toEqual({ n_root: [{ n_form: [field, field, field] }, 'n_last'] })

      // 셋째 필드를 캔버스에서 누른다 — 필드 상자(화면 좌표)를 4px 격자로 훑어 셸의 맨 위가 캔버스 iframe 이고(선택 외곽선 곁 손잡이가 아님) 그 점의
      // 가장 가까운 노드가 그 필드인 첫 점(라벨 자리 — 값 칸은 입력 노드)이다. iframe 은 줌으로 줄어 있어 배율로 그 문서 좌표에 옮긴다.
      const third = newIds(await root(P), 'Field')[2]!
      const box = (await canvasFrame(page).locator(`[data-wb-id="${third}"]`).boundingBox())!
      const at = (await page.evaluate(
        `(() => { const f = document.querySelector('iframe.wb-shell-canvas-iframe'); const r = f.getBoundingClientRect(); const d = f.contentDocument;
          const scale = r.width / f.clientWidth;
          for (let y = ${box.y} + 2; y < ${box.y + box.height} - 1; y += 4) for (let x = ${box.x} + 2; x < ${box.x + box.width} - 1; x += 4) {
            if (document.elementFromPoint(x, y) !== f) continue
            const el = d.elementFromPoint((x - r.left) / scale, (y - r.top) / scale)
            if (el?.closest('[data-wb-id]')?.getAttribute('data-wb-id') === '${third}') return { x, y }
          }
          return null })()`,
      )) as { x: number; y: number } | null
      // 카나리아 — 누를 점이 있다.
      expect(at).not.toBeNull()
      await page.mouse.click(at!.x, at!.y)
      await poll(
        '셋째 필드를 고른다',
        () => selectedId(page),
        (v) => v === third,
      )
      await only(page, 'Text')
      expect(await addOnce(page, P, '텍스트', 'Text')).toEqual({ notice: '', selectedIsNew: true })
      expect(shapeOf(await root(P))).toEqual({
        n_root: [{ n_form: [field, field, { '+Field': ['+Input', '+Text'] }] }, 'n_last'],
      })
    } finally {
      await close()
    }
  })

  it('카드 안에 끌어 놓은 배치를 고른 채 «배치 넣기» 는 그 형제', async () => {
    const P = await seed('chain-drop', [
      { id: 'n_card', type: 'Card', props: { title: '빈 카드' } },
      { id: 'n_last', type: 'Text', props: { content: '끝' } },
    ])
    const { page, close } = await open(P)
    try {
      await only(page, 'Flex')
      const card = (await page.locator('[data-wb-palette-card="Flex"]').boundingBox())!
      const from = { x: card.x + card.width / 2, y: card.y + card.height / 2 }
      await page.mouse.move(from.x, from.y)
      await page.mouse.down()
      await page.mouse.move(from.x + 3, from.y - 6, { steps: 3 })
      await dragLayoutSettled(page)
      const target = (await canvasFrame(page).locator('[data-wb-id="n_card"]').boundingBox())!
      await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 8 })
      await page.mouse.up()
      const dropped = await poll(
        '놓은 배치가 서버에 닿음',
        async () => newIds(await root(P), 'Flex'),
        (v) => v.length > 0,
      )
      // 카나리아 — 놓기가 카드 안이고 그 배치를 골랐다.
      expect(shapeOf(await root(P))).toEqual({ n_root: [{ n_card: ['+Flex'] }, 'n_last'] })
      await poll(
        '놓은 배치를 고른다',
        () => selectedId(page),
        (v) => v === dropped[0],
      )
      expect(await addOnce(page, P, '배치', 'Flex')).toEqual({ notice: '', selectedIsNew: true })
      expect(shapeOf(await root(P))).toEqual({ n_root: [{ n_card: ['+Flex', '+Flex'] }, 'n_last'] })
    } finally {
      await close()
    }
  })
})
