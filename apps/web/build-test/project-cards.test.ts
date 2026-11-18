/**
 * **프로젝트 목록 카드**(`src/routes/project-list.tsx` — 설계 `docs/superpowers/specs/2026-11-02-theme-preview-and-project-cards-design.md`
 * 「프로젝트 목록 카드」) — 실브라우저 판. jsdom 은 배치 · 크기 · 넘침을 못 잰다(카드 구조 · 이름 · 주소는 `test/routes/project-list.test.tsx`).
 *
 * | 케이스 | 재는 값 |
 * |---|---|
 * | 눌리는 크기 | 창 1280 · 390 에서 카드마다 카드 안 표본 점(보조 단추 밖) 모두가 «<이름> 열기» 링크에 닿는다(카드 전체가 그 링크 — 늘인 링크),
 *   보조 단추가 그 링크 위에 선다(가운데의 맨 위 요소) · 톱니 높이 ≥ 36, 추가 카드 단추 높이 ≥ 36, 뼈대 상자
 *   (`.wb-shell-workspace`) 가로 넘침 0 · 창 오른끝을 넘는 글자 노드 0(끊을 자리 없는 긴 이름 카드를 싣는다). 추가 카드를 연 판의 폼 칸 · 단추가 카드
 *   오른끝 안이고 넘침 0 |
 * | «열기» | 누르면 주소가 `/projects/<id>` 이고 에디터가 선다 |
 * | 추가 카드로 만들기 | 추가 카드를 눌러 그 자리에 선 폼으로 만들면 그 프로젝트로 가고, 목록으로 돌아오면 그 카드가 추가 카드 바로 뒤에 선다 |
 * | 0 개 · 조회 실패 | 프로젝트가 없는 bob 이 빈 안내 옆 추가 카드로 만든다 · 목록 조회를 끊은 판(`page.route` 로 `GET /api/projects` 를 전부 abort)에서 알림과 함께
 *   선 추가 카드로 만든다 |
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright-core'
import { editorStackPrerequisite, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

/**
 * 끊을 자리 없는 긴 이름 — 카드 안에서 접히는지(`overflow-wrap: anywhere`) 본다. 영문이다 — Chrome 은 한글을 음절 사이에서 꺾어 한글 긴 이름은
 * `overflow-wrap` 없이도 안 넘친다(그 규칙을 뗀 변조가 살았다). 하이픈을 넣지 않는다(브라우저가 하이픈 뒤에서 줄을 바꾼다).
 */
const LONG_NAME = 'AVeryLongProjectNameWithoutAnySpaceThatMustWrapInsideTheCard'

/** 카드마다 잰 크기와 뼈대 넘침. */
interface CardSizes {
  cards: { name: string; openPoints: number; openMiss: number; gearHeight: number; gearWidth: number; gearOnTop: boolean }[]
  addHeight: number
  workspace: number
  texts: string[]
  counted: number
}

function measure(page: Page): Promise<CardSizes> {
  return page.evaluate(() => {
    const grid = document.querySelector('ul[aria-label="프로젝트"]')!
    const cards = [...grid.querySelectorAll<HTMLElement>('li.wb-shell-home-card')]
      .filter((li) => li.querySelector('.wb-shell-home-name') !== null)
      .map((li) => {
        // 카드 전체가 이름 링크다(늘인 링크) — 카드 안 표본 점마다 맨 위 요소가 그 링크(의 안)인지 센다. 보조 단추 위의 점은 뺀다.
        const link = li.querySelector('.wb-shell-home-name')!
        li.scrollIntoView({ block: 'center' })
        const r = li.getBoundingClientRect()
        let openPoints = 0
        let openMiss = 0
        for (const fy of [0.1, 0.3, 0.5, 0.7, 0.9])
          for (const fx of [0.05, 0.25, 0.5, 0.75, 0.95]) {
            const hit = document.elementFromPoint(r.left + r.width * fx, r.top + r.height * fy)
            if (hit?.closest('.wb-shell-home-settings')) continue
            openPoints += 1
            if (hit?.closest('a') !== link) openMiss += 1
          }
        const gearEl = li.querySelector('.wb-shell-home-settings')!
        const gear = gearEl.getBoundingClientRect()
        // 보조 단추가 늘인 링크 위에 섰다 — 가운데의 맨 위 요소가 그 단추(의 안)다.
        const gearOnTop =
          document.elementFromPoint(gear.left + gear.width / 2, gear.top + gear.height / 2)?.closest('.wb-shell-home-settings') === gearEl
        return { name: link.textContent ?? '', openPoints, openMiss, gearHeight: gear.height, gearWidth: gear.width, gearOnTop }
      })
    const add = grid.querySelector('.wb-shell-home-add-button')!.getBoundingClientRect()
    const box = document.querySelector('.wb-shell-workspace')!
    const width = document.documentElement.clientWidth
    const texts: string[] = []
    let counted = 0
    const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent?.trim()) continue
      const range = document.createRange()
      range.selectNodeContents(n)
      const rects = [...range.getClientRects()]
      if (rects.length === 0) continue
      counted += 1
      const right = Math.max(...rects.map((r) => r.right))
      if (right > width + 0.5) texts.push(`${n.textContent.trim().slice(0, 24)} +${Math.round(right - width)}px`)
    }
    return { cards, addHeight: add.height, workspace: box.scrollWidth - box.clientWidth, texts, counted }
  })
}

/** 내용 칸의 카드 격자 — 사이드바의 칸 목록과 가른다. */
function grid(page: Page): ReturnType<Page['getByRole']> {
  return page.locator('.wb-shell-workspace-main').getByRole('list', { name: '프로젝트' })
}

/** 추가 카드를 눌러 그 자리의 폼으로 만든다 — 끝나면 만든 프로젝트로 간다. */
async function createFromCard(page: Page, name: string, slug: string): Promise<void> {
  await grid(page).getByRole('button', { name: '프로젝트 추가', exact: true }).click()
  const card = grid(page).locator('li.wb-shell-home-add')
  await card.getByLabel('이름').fill(name)
  await card.getByLabel('슬러그').fill(slug)
  await card.getByRole('button', { name: '만들기', exact: true }).click()
  await page.waitForURL(/\/projects\/[^/]+$/)
}

describe.skipIf(!전제.ok)('프로젝트 목록 카드 — 실브라우저', () => {
  let stack: EditorStack
  let alice: Session
  const ids = new Map<string, string>()

  beforeAll(async () => {
    if (!전제.ok) return
    stack = await startEditorStack(전제)
    alice = await stack.login(stack.users.alice)
    const make = async (name: string, slug: string, description: string | null): Promise<void> => {
      const res = await stack.request(alice, 'POST', '/projects', { name, slug, description })
      if (res.status !== 201) throw new Error(`프로젝트 ${res.status} ${JSON.stringify(res.body)}`)
      ids.set(name, res.body.id as string)
    }
    const tag = Date.now().toString(36)
    await make('고객 포털', `portal-${tag}`, '외부 고객이 쓰는 포털')
    await make(LONG_NAME, `long-${tag}`, null)
    await make('Report', `report-${tag}`, null)
  })

  afterAll(async () => {
    if (stack === undefined) return
    const { before, after } = await stack.close()
    expect(before.processes).toBeGreaterThan(0)
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  })

  it('창 1280 · 390 — 카드 전체 · 톱니 · 추가 카드가 눌리는 크기이고 뼈대 상자가 가로로 안 넘친다', async () => {
    const measured: string[] = []
    for (const width of [1280, 390]) {
      const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width, height: 844 } })
      try {
        await page.goto('/')
        await page.getByRole('link', { name: '고객 포털 열기', exact: true }).waitFor()
        const got = await measure(page)
        // 카나리아 — 카드 셋을 다 쟀고 글자 노드를 걸었다.
        expect(got.cards.map((c) => c.name).sort(), `${width}`).toEqual([...ids.keys()].sort())
        expect(got.counted, `${width}`).toBeGreaterThan(10)
        for (const card of got.cards) {
          const label = `${card.name.slice(0, 12)}@${width}`
          measured.push(
            `${label}: 열기 점 ${card.openPoints - card.openMiss}/${card.openPoints} · 톱니 ${Math.round(card.gearWidth)}×${Math.round(card.gearHeight)}`,
          )
          // 카나리아 — 표본 점이 섰다(보조 단추가 다 덮지 않았다).
          expect(card.openPoints, label).toBeGreaterThanOrEqual(15)
          expect(card.openMiss, label).toBe(0)
          expect(card.gearHeight, label).toBeGreaterThanOrEqual(36)
          expect(card.gearOnTop, label).toBe(true)
        }
        measured.push(`추가@${width}: ${Math.round(got.addHeight)} · 넘침 ${got.workspace} · 글자 ${got.counted}`)
        expect(got.addHeight, `${width}`).toBeGreaterThanOrEqual(36)
        expect({ workspace: got.workspace, texts: got.texts }, `${width}`).toEqual({ workspace: 0, texts: [] })

        // 추가 카드를 연 판 — 그 자리의 만들기 폼(칸 셋 · 단추 둘)도 카드 폭 안에 선다.
        await grid(page).getByRole('button', { name: '프로젝트 추가', exact: true }).click()
        const form = grid(page).locator('li.wb-shell-home-add form')
        await form.waitFor()
        const opened = await form.evaluate((el) => {
          const card = el.closest('li')!.getBoundingClientRect()
          const past = [...el.querySelectorAll('input, button')].filter((child) => child.getBoundingClientRect().right > card.right + 0.5)
          const box = document.querySelector('.wb-shell-workspace')!
          return { controls: el.querySelectorAll('input, button').length, past: past.length, workspace: box.scrollWidth - box.clientWidth }
        })
        measured.push(`폼@${width}: 칸 ${opened.controls} · 카드 밖 ${opened.past} · 넘침 ${opened.workspace}`)
        expect(opened, `${width}`).toEqual({ controls: 5, past: 0, workspace: 0 })
      } finally {
        await context.close()
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[카드 크기] ${measured.join(' | ')}`)
  })

  it('«열기» 를 누르면 그 프로젝트의 에디터로 간다', async () => {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1280, height: 900 } })
    try {
      await page.goto('/')
      await page.getByRole('link', { name: 'Report 열기', exact: true }).click()
      // 판이 섰다는 것(목록을 떠났다)만 기다리고 주소는 값으로 견준다 — 다른 곳으로 가는 변조가 시간 초과가 아니라 주소로 죽게.
      await page.waitForURL(/\/projects\//)
      expect(new URL(page.url()).pathname).toBe(`/projects/${ids.get('Report')}`)
      await page.getByRole('region', { name: '메뉴·페이지 트리' }).waitFor()
    } finally {
      await context.close()
    }
  })

  it('추가 카드로 만든 프로젝트가 격자에 선다 — 추가 카드 바로 뒤', async () => {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1280, height: 900 } })
    try {
      await page.goto('/')
      await page.getByRole('link', { name: '고객 포털 열기', exact: true }).waitFor()
      await createFromCard(page, '카드로 만든 판', `card-${Date.now().toString(36)}`)
      await page.goto('/')
      await page.getByRole('link', { name: '카드로 만든 판 열기', exact: true }).waitFor()
      const order = await grid(page)
        .locator('li.wb-shell-home-card')
        .evaluateAll((items) => items.map((li) => li.querySelector('.wb-shell-home-name')?.textContent ?? '(추가)'))
      expect(order.slice(0, 2)).toEqual(['(추가)', '카드로 만든 판'])
    } finally {
      await context.close()
    }
  })

  it('프로젝트가 없는 사람 · 목록 조회가 끊긴 판에서도 추가 카드로 만든다', async () => {
    // (가) 0 개 — bob 은 아무 프로젝트에도 안 들었다.
    const bob = await stack.openTab(stack.users.bob, { viewport: { width: 390, height: 844 } })
    try {
      await bob.page.goto('/')
      await bob.page.getByText('참여 중인 프로젝트가 없습니다').waitFor()
      expect(await grid(bob.page).getByRole('listitem').count()).toBe(1)
      await createFromCard(bob.page, '밥의 첫 판', `bob-${Date.now().toString(36)}`)
    } finally {
      await bob.context.close()
    }

    // (나) 조회 실패 — 목록 GET 을 **전부** 끊고 만들기 POST 는 지나게 한다. 첫 GET 만 끊으면 dev 번들의 `StrictMode` 가 조회 이펙트를 두 번
    // 돌려 둘째 GET 이 목록을 채운다(`AGENTS.md` «dev 번들의 실브라우저 판은 `StrictMode` 라 …»).
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1280, height: 900 } })
    try {
      let aborted = 0
      await page.route('**/api/projects', async (route) => {
        if (route.request().method() === 'GET') {
          aborted += 1
          await route.abort('connectionreset')
          return
        }
        await route.continue()
      })
      await page.goto('/')
      await page.getByRole('alert').waitFor()
      expect(aborted).toBeGreaterThan(0)
      expect(await grid(page).getByRole('listitem').count()).toBe(1)
      const slug = `after-fail-${Date.now().toString(36)}`
      await createFromCard(page, '실패 뒤 만든 판', slug)
      const created = await stack.query<{ id: string }>('select id from projects where slug = $1', [slug])
      expect(new URL(page.url()).pathname).toBe(`/projects/${created[0]?.id}`)
    } finally {
      await context.close()
    }
  })
})
