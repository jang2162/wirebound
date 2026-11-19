/**
 * **구조 트리의 빈 구역 줄 — 실브라우저 판**(`src/panels/structure-tree.tsx` 의 `showEmpty` · `drag/hover-open.ts`). 감춤 · 칩 · 고르면 섬은
 * jsdom(`test/panels/structure-zone-rows.test.tsx`)이 잰다 — 이 파일은 jsdom 이 못 내는 끌기 · 배치를 잰다.
 *
 * | 케이스 | 재는 값 |
 * |---|---|
 * | 머물러 펴고 놓기 | 줄 끌기를 시작해도 다른 줄이 안 밀린다(끝 줄의 `top` 그대로) · 빈 구역을 감춘 카드 줄에 0.7s 넘게 머물면 그 카드의 빈 구역 줄이 선다 · 그 바닥 줄에
 *   놓으면 서버의 그 구역에 든다 · 놓은 뒤 편 줄이 다시 접힌다(칩이 돌아온다) |
 */
import { installCatalog, type WbNode } from '@wirebound/schema'
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canvasFrame, editorStackPrerequisite, poll, shownDrops, startEditorStack, type EditorStack, type Session } from './editor-stack'

installCatalog()

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

const TREE = '.wb-shell-region[aria-label="구조 트리"]'

/** 카드 둘 — 셋째 구역(제목 옆 · 머리 오른쪽 · 바닥)이 다 비어 줄마다 «빈 구역 3» 이다. */
const DOC = [
  { id: 'n_a', type: 'Card', props: { title: '가' }, children: [{ id: 'n_kv', type: 'Text', props: { content: '옮길 글' } }] },
  { id: 'n_bare', type: 'Card', props: { title: '나' }, children: [{ id: 'n_bt', type: 'Text', props: { content: '나의 글' } }] },
  { id: 'n_end', type: 'Text', props: { content: '끝' } },
]

describe.skipIf(!전제.ok)('구조 트리의 빈 구역 줄 — 실브라우저', () => {
  let stack: EditorStack
  let alice: Session

  beforeAll(async () => {
    if (!전제.ok) return
    stack = await startEditorStack(전제)
    alice = await stack.login(stack.users.alice)
  })

  afterAll(async () => {
    if (stack === undefined) return
    const { after } = await stack.close()
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  })

  const call = (m: string, p: string, b?: unknown) => stack.request(alice, m, p, b)

  async function fixture(slug: string): Promise<string> {
    const project = (await call('POST', '/projects', { name: '빈 구역', slug: `${slug}-${Date.now().toString(36)}` })).body
    const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '가' })).body
    const pageId = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '쪽' })).body.id
    const P = `/projects/${project.id}/pages/${pageId}`
    const seeded = await call('PATCH', `${P}/ops`, {
      baseSeq: 0,
      ops: DOC.map((value, at) => ({ op: 'add', path: `/root/children/${at}`, value })),
    })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
    return P
  }

  const treeRow = (page: Page, id: string) => page.locator(`${TREE} [data-tree-row][data-tree-id="${id}"]`)
  const zoneRow = (page: Page, parentId: string, zone: string) =>
    page.locator(`${TREE} [data-tree-zone-row][data-tree-zone-parent="${parentId}"][data-tree-zone-name="${zone}"]`)
  const chip = (page: Page, id: string) => treeRow(page, id).locator('.wb-shell-structure-empty-zones')
  const top = async (page: Page, id: string) => (await treeRow(page, id).boundingBox())!.y

  it('줄 끌기를 시작해도 줄이 안 밀리고, 빈 구역을 감춘 카드 줄에 머물면 그 빈 구역 줄이 서서 거기 놓인다', async () => {
    const P = await fixture('hover')
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 1000 } })
    try {
      await page.goto(P)
      await canvasFrame(page).locator('[data-wb-id="n_end"]').waitFor()
      // 판 카나리아 — 두 카드가 칩으로 접혀 있고 바닥 줄이 없다.
      const chips = [await chip(page, 'n_a').textContent(), await chip(page, 'n_bare').textContent()]
      const footerBefore = await zoneRow(page, 'n_bare', 'footer').count()
      const endBefore = await top(page, 'n_end')
      const from = (await treeRow(page, 'n_kv').boundingBox())!
      const card = (await treeRow(page, 'n_bare').boundingBox())!
      await page.mouse.move(from.x + 30, from.y + from.height / 2)
      await page.mouse.down()
      await page.mouse.move(from.x + 30, from.y + from.height / 2 + 6, { steps: 3 })
      // 카드 줄 가운데로 — 머물기 전(0.7s 안)에 잰다.
      await page.mouse.move(card.x + 30, card.y + card.height / 2, { steps: 6 })
      const endWhileDragging = await top(page, 'n_end')
      const footerEarly = await zoneRow(page, 'n_bare', 'footer').count()
      // 머문다 — 0.7s(`HOVER_OPEN_MS`) 뒤 그 카드의 빈 구역 줄이 선다. 기다림은 시간으로 두고 값을 그 자리에서 단언한다(펴는 장치를 뗀 변조가
      // 시간 초과가 아니라 이 값으로 죽게).
      await page.waitForTimeout(1500)
      expect({
        shifted: endWhileDragging - endBefore,
        footerEarly,
        footerAfterDwell: await zoneRow(page, 'n_bare', 'footer').count(),
      }).toEqual({
        shifted: 0,
        footerEarly: 0,
        footerAfterDwell: 1,
      })
      const zoneHeight = (await zoneRow(page, 'n_bare', 'footer').boundingBox())!.height
      const to = (await zoneRow(page, 'n_bare', 'footer').boundingBox())!
      await page.mouse.move(to.x + 30, to.y + to.height / 2, { steps: 6 })
      const line = await poll(
        '바닥 줄의 «안» 표시',
        () => shownDrops(page),
        (drops) => drops.some((drop) => drop.kind === 'line'),
        5000,
      )
      await page.mouse.up()
      const footer = await poll(
        '서버의 바닥',
        async () => (((await call('GET', P)).body.schema.root as WbNode).children?.[1]?.zones?.footer ?? []).map((node) => node.id),
        (ids) => ids.length === 1,
        8000,
      )
      // 놓은 뒤 — 편 줄이 접히고 칩이 돌아온다(바닥이 찼으니 «빈 구역 2»).
      await page.waitForTimeout(800)
      const after = {
        title: await zoneRow(page, 'n_bare', 'titleSide').count(),
        chip: await chip(page, 'n_bare')
          .textContent({ timeout: 1000 })
          .catch(() => null),
      }
      // 끌기를 시작할 때 빈 구역 줄을 전부 폈다면 끝 줄이 밀렸을 높이 — 끝 줄 위의 감춘 줄 수(칩 둘의 합) × 구역 줄 높이(«결정»의 잰 값).
      // eslint-disable-next-line no-console
      console.log(`[빈 구역 줄] 구역 줄 높이 ${zoneHeight}px · 끝 줄 위 감춘 줄 6 → 끌기 시작에 전부 폈다면 ${6 * zoneHeight}px 밀림`)
      expect({
        chips,
        footerBefore,
        placement: line.filter((drop) => drop.kind === 'line').map((drop) => drop.placement),
        footer,
        after,
      }).toEqual({
        chips: ['빈 구역 3', '빈 구역 3'],
        footerBefore: 0,
        placement: ['inside'],
        footer: ['n_kv'],
        after: { title: 0, chip: '빈 구역 2' },
      })
    } finally {
      await context.close()
    }
  })
})
