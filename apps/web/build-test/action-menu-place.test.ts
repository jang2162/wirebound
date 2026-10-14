/**
 * **행동 메뉴의 열린 목록이 창 안에 다 보이는가를 실브라우저로 잰다**(`src/shell/action-menu.tsx` · `src/shell/use-popover-side.ts`). jsdom 은
 * 레이아웃 · 스크롤 칸의 잘림 · 겹침이 없어 «목록이 트리 칸 밖으로 잘린다»를 못 세운다.
 *
 * **보인다** = 목록 상자가 창과 그 조상의 잘라 내는 칸(`overflow` 가 `visible` 이 아닌 상자) 안에 다 들고(잘린 px 0), 항목마다 가운데 점의
 * `elementFromPoint` 가 그 항목이다(다른 칸이 위에 덮지 않는다).
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 쓰는 자리 × 창 셋 | 구조 트리 맨 아래 줄 `…` · 스크롤한 트리 가운데 줄 `…` · 메뉴 트리 줄 `+` · 메뉴 트리 맨 아래 줄 `…` · 구조 트리 머리 `+` · 메뉴 트리 머리 `+` · 셸 `…` 의 목록이 잘리거나 덮인다 |
 * | 셸 밖 화면 머리 `…` × 창 셋 | 프로젝트 목록 · 계정 설정 · 테마 관리 화면의 머리 `…`(`shell/page-head.tsx`)의 목록이 잘리거나 덮인다(L-141 — 셸 밖의 같은 부품) |
 */
import type { Locator, Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canvasFrame, editorStackPrerequisite, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

/** 창 셋 — 넓은 창 · 좁은 창 둘(정본 「설계서 화면 구조」 의 지원 폭 안). */
const WINDOWS = [
  { width: 1440, height: 900 },
  { width: 900, height: 700 },
  { width: 700, height: 700 },
] as const

/** 구조 트리에 심는 노드 수 — 창 900 높이에서도 트리 칸이 스크롤한다. */
const NODES = 40
/** 메뉴 트리의 메뉴 수(메뉴마다 페이지 둘) — 창 900 높이에서도 트리 칸이 스크롤한다. */
const MENUS = 14

const nodeId = (i: number): string => `n_t${String(i).padStart(10, '0')}`

interface Sight {
  /** 연 동안 누른 단추가 움직인 px(줄 자리만 — `openRowMenu`). */
  moved?: number
  /** 잘린 px — 창과 잘라 내는 조상 칸 밖으로 나간 만큼(위 · 아래 · 왼 · 오른). */
  clipped: { top: number; bottom: number; left: number; right: number }
  /** 항목 수 · 가운데 점이 그 항목이 아닌 수. */
  items: number
  covered: number
}

/** 열린 목록 하나를 잰다(머리말 «보인다»). 열린 목록이 하나가 아니면 던진다. */
async function sight(page: Page): Promise<Sight> {
  return page.evaluate(() => {
    const menus = [...document.querySelectorAll('[role="menu"]')]
    if (menus.length !== 1) throw new Error(`열린 메뉴가 ${menus.length} 개다`)
    const body = menus[0]!.closest('.wb-shell-action-menu-body') ?? menus[0]!
    const rect = body.getBoundingClientRect()
    let top = 0
    let left = 0
    let right = document.documentElement.clientWidth
    let bottom = document.documentElement.clientHeight
    // 고정 상자는 조상 칸이 자르지 않는다(포함 블록이 창이다 — 조상에 `transform` 이 없으면). 덮임은 아래 `elementFromPoint` 가 잰다.
    const fixed = getComputedStyle(body).position === 'fixed'
    for (let at = fixed ? null : body.parentElement; at !== null; at = at.parentElement) {
      const style = getComputedStyle(at)
      if (style.overflowX === 'visible' && style.overflowY === 'visible') continue
      const box = at.getBoundingClientRect()
      const inner = { top: box.top + at.clientTop, left: box.left + at.clientLeft }
      if (style.overflowY !== 'visible') {
        top = Math.max(top, inner.top)
        bottom = Math.min(bottom, inner.top + at.clientHeight)
      }
      if (style.overflowX !== 'visible') {
        left = Math.max(left, inner.left)
        right = Math.min(right, inner.left + at.clientWidth)
      }
    }
    const clip = (n: number): number => Math.max(0, Math.round(n))
    const items = [...menus[0]!.querySelectorAll<HTMLElement>('[role="menuitem"]')]
    const covered = items.filter((item) => {
      const r = item.getBoundingClientRect()
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      return hit === null || !item.contains(hit)
    }).length
    return {
      clipped: {
        top: clip(top - rect.top),
        bottom: clip(rect.bottom - bottom),
        left: clip(left - rect.left),
        right: clip(rect.right - right),
      },
      items: items.length,
      covered,
    }
  })
}

const NONE = { top: 0, bottom: 0, left: 0, right: 0 }

describe.skipIf(!전제.ok)('행동 메뉴 자리 — 실브라우저', () => {
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

  /** 메뉴 `MENUS` 개(메뉴마다 페이지 둘) · 첫 페이지에 Text `NODES` 개. */
  async function fixture(slug: string): Promise<{ P: string; menuIds: string[] }> {
    const call = (m: string, p: string, b?: unknown) => stack.request(alice, m, p, b)
    const project = (await call('POST', '/projects', { name: '관리자 콘솔 설계서', slug: `${slug}-${Date.now().toString(36)}` })).body
    const menuIds: string[] = []
    const pageIds: string[] = []
    for (let m = 0; m < MENUS; m += 1) {
      const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: `메뉴 ${m + 1}` })).body.id as string
      menuIds.push(menu)
      for (let p = 0; p < 2; p += 1)
        pageIds.push((await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu, title: `페이지 ${m + 1}-${p + 1}` })).body.id)
    }
    const P = `/projects/${project.id}/pages/${pageIds[0]}`
    const ops = Array.from({ length: NODES }, (_, i) => ({
      op: 'add',
      path: `/root/children/${i}`,
      value: { id: nodeId(i), type: 'Text', props: { content: `글 ${i + 1}` } },
    }))
    const seeded = await call('PATCH', `${P}/ops`, { baseSeq: 0, ops })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
    return { P, menuIds }
  }

  async function openEditor(P: string, viewport: { width: number; height: number }): Promise<{ page: Page; close: () => Promise<void> }> {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport })
    await page.goto(P)
    await canvasFrame(page).locator('[data-wb-id]').first().waitFor()
    await page.locator('[data-tree-row]').first().waitFor({ state: 'attached' })
    return { page, close: () => context.close() }
  }

  function structureRow(page: Page, id: string): Locator {
    return page.locator(`.wb-shell-region[aria-label="구조 트리"] [data-tree-row][data-tree-id="${id}"]`)
  }

  function menuRow(page: Page, id: string): Locator {
    return page.locator(`.wb-shell-region[aria-label="메뉴·페이지 트리"] [data-tree-row][data-tree-id="${id}"]`)
  }

  /**
   * 줄을 보이는 자리로 스크롤하고(`block`) 줄 단추를 눌러 고른 뒤 그 줄의 행동 단추를 누른다. 돌려주는 것은 **연 동안 단추가 움직인 px** —
   * 목록이 열리며 트리 칸이 스크롤하면(포커스가 간 항목을 칸이 보이는 자리로 끌어온다) 누른 단추가 손 밑에서 옮겨 간다.
   */
  async function openRowMenu(row: Locator, block: 'end' | 'center', name: RegExp): Promise<number> {
    await row.evaluate((element, where) => element.scrollIntoView({ block: where }), block)
    await row.locator('button').first().click()
    const toggle = row.getByRole('button', { name })
    const before = (await toggle.boundingBox())!.y
    await toggle.click()
    await row.page().getByRole('menu').waitFor()
    return Math.round((await toggle.boundingBox())!.y - before)
  }

  /** 쓰는 자리 — 그 자리의 단추를 눌러 목록을 연다. */
  const PLACES: { label: string; open: (page: Page, ids: { menuIds: string[] }) => Promise<number | void> }[] = [
    {
      label: '구조 트리 맨 아래 줄 …',
      open: (page) => openRowMenu(structureRow(page, nodeId(NODES - 1)), 'end', /더 보기$/),
    },
    {
      label: '스크롤한 구조 트리 가운데 줄 …',
      open: (page) => openRowMenu(structureRow(page, nodeId(NODES / 2)), 'center', /더 보기$/),
    },
    {
      label: '메뉴 트리 맨 아래 메뉴 줄 +',
      open: (page, { menuIds }) => openRowMenu(menuRow(page, menuIds[MENUS - 1]!), 'end', /추가$/),
    },
    {
      label: '메뉴 트리 맨 아래 메뉴 줄 …',
      open: (page, { menuIds }) => openRowMenu(menuRow(page, menuIds[MENUS - 1]!), 'end', /더 보기$/),
    },
    {
      label: '메뉴 트리 머리 +',
      open: async (page) => {
        await page
          .locator('.wb-shell-region[aria-label="메뉴·페이지 트리"]')
          .getByRole('button', { name: /추가$/ })
          .first()
          .click()
        await page.getByRole('menu').waitFor()
      },
    },
    {
      label: '구조 트리 머리 +',
      open: async (page) => {
        await page
          .locator('.wb-shell-region[aria-label="구조 트리"]')
          .getByRole('button', { name: /추가$/ })
          .first()
          .click()
        await page.getByRole('menu').waitFor()
      },
    },
    {
      label: '셸 …',
      open: async (page) => {
        await page.locator('.wb-shell-header').getByRole('button', { name: '더 보기', exact: true }).click()
        await page.getByRole('menu').waitFor()
      },
    },
  ]

  it.each(WINDOWS)('창 $width×$height — 쓰는 자리마다 열린 목록이 잘리지도 덮이지도 않는다', async (viewport) => {
    const ids = await fixture(`place-${viewport.width}`)
    const { page, close } = await openEditor(ids.P, viewport)
    try {
      const seen: Record<string, Sight> = {}
      for (const place of PLACES) {
        const moved = await place.open(page, ids)
        seen[place.label] = { ...(await sight(page)), ...(typeof moved === 'number' ? { moved } : {}) }
        await page.keyboard.press('Escape')
        await page.getByRole('menu').waitFor({ state: 'detached' })
      }
      // eslint-disable-next-line no-console
      console.log(`[행동 메뉴 자리 ${viewport.width}×${viewport.height}]`, JSON.stringify(seen))

      for (const [label, value] of Object.entries(seen)) {
        expect({ label, clipped: value.clipped, covered: value.covered, any: value.items > 0, moved: value.moved ?? 0 }).toEqual({
          label,
          clipped: NONE,
          covered: 0,
          any: true,
          moved: 0,
        })
      }
    } finally {
      await close()
    }
  })

  /**
   * 셸 밖 화면의 머리 `…`(`shell/page-head.tsx`) — 같은 부품이 프로젝트 목록 · 계정 설정 · 테마 관리 머리에 선다. 판은 같다(`sight`): 목록이 창 안에 다 들고 항목이 안 덮인다.
   * 카나리아: 목록이 열려 항목이 있다(`items > 0`).
   */
  it.each(WINDOWS)('창 $width×$height — 셸 밖 화면의 머리 …의 목록이 잘리지도 덮이지도 않는다', async (viewport) => {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport })
    try {
      const seen: Record<string, Sight> = {}
      for (const [label, path] of [
        ['프로젝트 목록', '/'],
        ['계정 설정', '/account'],
        ['테마 관리', '/admin/themes'],
      ] as const) {
        await page.goto(path)
        await page.locator('.wb-shell-project-head').waitFor()
        await page.locator('.wb-shell-project-head').getByRole('button', { name: '더 보기', exact: true }).click()
        await page.getByRole('menu').waitFor()
        seen[label] = await sight(page)
        await page.keyboard.press('Escape')
        await page.getByRole('menu').waitFor({ state: 'detached' })
      }
      // eslint-disable-next-line no-console
      console.log(`[셸 밖 머리 … ${viewport.width}×${viewport.height}]`, JSON.stringify(seen))
      for (const [label, value] of Object.entries(seen)) {
        expect({ label, clipped: value.clipped, covered: value.covered, any: value.items > 0 }).toEqual({
          label,
          clipped: NONE,
          covered: 0,
          any: true,
        })
      }
    } finally {
      await context.close()
    }
  })
})
