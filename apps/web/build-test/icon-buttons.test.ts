/**
 * **아이콘 단추를 실브라우저로 잰다** — 아이콘만 남은 단추(`src/shell/icons.ts` 머리말 «이름은 아이콘이 나르지 않는다»)가 좁은 칸에서
 * 상자를 넘지 않는가, 휴지통이 누르기 전에 위험 색이 되는가. jsdom 은 레이아웃 · `:hover` 가 없어 둘 다 못 잰다(이름 · `title` ·
 * 메뉴 항목의 아이콘은 `test/shell/icon-census.test.tsx`가 센다).
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 좁은 칸 | 사이드바 최소 폭(200) · 창 700 에서 아이콘만 남은 단추가 자르는 조상(가로 `overflow` 가 `visible` 이 아닌 가장 가까운 조상)이나 창 밖으로 나간다 · 아이콘이 단추 밖으로 나간다 · 긴 이름 줄의 `+` · `…` 가 다음 줄로 접힌다 · 목록 항목의 휴지통이 칸 아래로 접힌다 |
 * | 머리 한 줄 | 창 1024 에서 머리의 가운데 도구(되돌리기 · 배치 선 · 모드 · 구분선 · 뷰포트 폭 · 줌 묶음)가 두 줄로 접힌다 |
 * | 휴지통의 위험 색 | 속성 목록 · 상호작용 · 코멘트의 휴지통이 마우스를 올려도 · 키보드 포커스에도 붉지 않다 · 끈 휴지통이 붉다 |
 *
 * **넘침은 요소 상자로 잰다** — 아이콘 단추에는 글자 노드가 없어 `CLAUDE.md` «화면 넘침은 요소 상자로만 세지 않는다»의 글자 판이 설
 * 자리가 없다. 대신 그 절이 말하는 «`overflow: hidden` 조상이 잘라 숨긴다»를 조상 상자와 견줘 잰다.
 *
 * **창 700 에는 줌 단추가 없다**(L-141 — 못 재는 것) — 줌 묶음이 창 875 아래에서 `…` 의 항목(배율 · 축소 · 확대 · 화면 맞춤)으로 접힌다. 잰 값(N38): 창 1440 · 900 은 줌 그룹 1 · 단추 3, 창 700 은 그룹 0 · 단추 0 ·
 * `…` 항목 11 가운데 줌 넷. 그래서 아래 «좁은 칸» 의 창 700 판은 줌 단추를 못 재고 창 1440 판이 잰다. 접힌 항목의 자리(열린 목록이 잘리지 않는가)는 `./action-menu-place.test.ts` 의 «셸 …» 가 창 700 에서 잰다.
 *
 * **캔버스 손잡이(«… 옮기기»)는 넘침 판에서 뺀다** — 손잡이는 노드 외곽선의 바깥 왼쪽 위에 서서(`src/canvas/canvas-drag-handle.tsx` 의
 * `OUTSIDE`) 캔버스 왼끝에 붙은 노드에서는 캔버스 칸이 잘라 낸다. 아이콘과 무관한 손잡이 자리의 성질이라 이 판이 재지 않는다.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canvasFrame, editorStackPrerequisite, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

const LAYOUT_KEY = 'wirebound.editor.sidebar'
const LONG_MENU = '회원관리 아주 긴 메뉴 이름이라 사이드바 최소 폭을 넘는다'
const DANGER = 'rgb(180, 35, 24)'

/**
 * 보이는 아이콘만 남은 단추마다 — 이름 · 상자 · 아이콘이 단추 안인가 · 자르는 조상과 창 밖으로 나간 px. 문자열로 넘긴다(`tsx` 의
 * `__name` 이 페이지에 없다 — `CLAUDE.md` 「실브라우저 판은 …」).
 */
const ICON_FIT = `() => {
  const out = []
  for (const b of document.querySelectorAll('button')) {
    if ((b.textContent || '').trim() !== '' || b.classList.contains('wb-shell-canvas-handle')) continue
    const r = b.getBoundingClientRect()
    if (r.width === 0 || r.height === 0 || getComputedStyle(b).visibility === 'hidden') continue
    const svg = b.querySelector('svg')
    const s = svg === null ? null : svg.getBoundingClientRect()
    const inside = s !== null && s.left >= r.left - 0.5 && s.right <= r.right + 0.5 && s.top >= r.top - 0.5 && s.bottom <= r.bottom + 0.5
    let clipLeft = 0
    let clipRight = Math.max(0, r.right - document.documentElement.clientWidth)
    for (let p = b.parentElement; p !== null; p = p.parentElement) {
      if (getComputedStyle(p).overflowX === 'visible') continue
      const pr = p.getBoundingClientRect()
      clipLeft = Math.max(clipLeft, pr.left - r.left)
      clipRight = Math.max(clipRight, r.right - pr.right)
      break
    }
    out.push({ name: b.getAttribute('aria-label'), w: Math.round(r.width), h: Math.round(r.height), inside, over: Math.round(Math.max(clipLeft, clipRight)) })
  }
  return out
}`

/** 줄의 `+` · `…` 가 이름과 한 줄인가 — 행동 상자의 위가 이름 단추의 아래보다 위면 한 줄이다. */
const ROW_LINES = `(title) => {
  const row = [...document.querySelectorAll('[data-tree-row]')].find((el) => el.firstElementChild && el.firstElementChild.textContent === title)
  if (!row) return null
  const name = row.firstElementChild.getBoundingClientRect()
  const actions = row.querySelector('.wb-shell-tree-row-actions')
  const a = actions.getBoundingClientRect()
  return { oneLine: a.top < name.bottom - 0.5, rowHeight: Math.round(row.getBoundingClientRect().height), actionsWidth: Math.round(a.width) }
}`

/** 속성 목록 항목마다 — 휴지통이 칸과 한 줄인가. */
const LIST_LINES = `() => [...document.querySelectorAll('.wb-shell-list-item')].map((item) => {
  const cell = item.querySelector('.wb-shell-list-cell').getBoundingClientRect()
  const remove = item.querySelector('.wb-shell-list-remove').getBoundingClientRect()
  return { oneLine: remove.top < cell.bottom - 0.5, removeWidth: Math.round(remove.width) }
})`

describe.skipIf(!전제.ok)('아이콘 단추 — 실브라우저', () => {
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

  /**
   * 판마다 긴 이름 메뉴 줄을 고르고(줄 `+` · `…` 가 선다) 목록 칸(Tabs)을 고른 뒤 잰다. 판 카나리아: 아이콘만 남은 단추가 셋 이상
   * 보이고(머리 `…` · 되돌리기 · 줄 `+` · `…` · 휴지통 …) 긴 이름 줄을 찾았다.
   */
  it.each([
    { label: '사이드바 최소 폭(200) · 창 1440', width: 1440, height: 900 },
    { label: '창 700', width: 700, height: 700 },
  ])('$label 에서 아이콘만 남은 단추가 넘치지 않고 줄이 안 접힌다', async ({ width, height }) => {
    const { P } = await fixture(stack, alice, `icons-${width}`)
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width, height } })
    try {
      await page.goto(P)
      await page.evaluate((key) => localStorage.setItem(key, JSON.stringify({ sideWidth: 200, panelWidth: 300 })), LAYOUT_KEY)
      await page.reload()
      await canvasFrame(page).locator('[data-wb-id]').first().waitFor()
      await page.getByRole('button', { name: LONG_MENU, exact: true }).click()
      // 노드는 구조 트리에서 고른다 — 창 700 에서는 캔버스 칸이 좁아 노드 상자의 가운데가 우측 패널 밑에 깔린다.
      // 줄의 접근 이름은 `타입 (별칭) 요약`이라 줄을 id 로 찾는다(`test/panels/tree-row.ts` 의 `structureRowName` 머리말).
      await page.locator('[data-tree-id="n_tabs000001"] > button.wb-shell-structure-node').click()
      await page.getByRole('button', { name: '1번째 지우기' }).waitFor()

      const fit = (await page.evaluate(`(${ICON_FIT})()`)) as { name: string; w: number; h: number; inside: boolean; over: number }[]
      const row = await page.evaluate(`(${ROW_LINES})(${JSON.stringify(LONG_MENU)})`)
      const list = await page.evaluate(`(${LIST_LINES})()`)
      // eslint-disable-next-line no-console
      console.log(`[아이콘 단추 ${width}×${height}]`, JSON.stringify({ fit, row, list }))

      expect(fit.length).toBeGreaterThanOrEqual(3)
      expect(fit.filter((button) => !button.inside || button.over > 0)).toEqual([])
      expect(row).toEqual({ oneLine: true, rowHeight: expect.any(Number), actionsWidth: expect.any(Number) })
      expect(list).toEqual([
        { oneLine: true, removeWidth: expect.any(Number) },
        { oneLine: true, removeWidth: expect.any(Number) },
      ])
    } finally {
      await context.close()
    }
  })

  /**
   * 줌 묶음(축소 · 확대 · 화면 맞춤)이 아이콘만인 까닭 — 머리의 폭 예산(`src/shell.css` 의 `.wb-shell-zoom-fit` · `src/shell/head-fold.ts`). 창 1024 는
   * 접지 않는 단계(«뷰포트 폭» 글 · 줌 묶음이 머리에 선다)다. 한 줄 = 머리 가운데 무리의 직계 자식이 모두 같은 줄이다. 판 카나리아: 직계 자식이
   * 일곱(상태 전환기 · 되돌리기 묶음 · 배치 선 · 모드 · 구분선 · 뷰포트 폭 · 줌)이다. 머리가 한 줄에 드는 최소 창 폭은 `editor-head-tools.test.ts` 가 잰다. 저장한
   * 좌측 기본 폭(264)은 창 1024 에서 캔버스 몫(480)을 남기려고 228 로 조여 그려진다 — 칸 480 이 그 판의 카나리아다(`src/shell/sidebar-layout.ts` 의 `fitWidths`).
   */
  it('창 1024 · 좌측 기본 폭에서 머리의 가운데 도구가 한 줄이다', async () => {
    const { P } = await fixture(stack, alice, 'icons-footer')
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1024, height: 768 } })
    try {
      await page.goto(P)
      await page.evaluate((key) => localStorage.setItem(key, JSON.stringify({ sideWidth: 264, panelWidth: 300 })), LAYOUT_KEY)
      await page.reload()
      await canvasFrame(page).locator('[data-wb-id]').first().waitFor()
      const tools = await page.locator('.wb-shell-head-tools').evaluate((box) => {
        const kids = [...box.children].map((kid) => kid.getBoundingClientRect())
        return { children: kids.length, rows: new Set(kids.map((rect) => Math.round(rect.top + rect.height / 2))).size }
      })
      const canvas = await page.locator('.wb-shell-canvas').evaluate((el) => Math.round(el.getBoundingClientRect().width))
      expect({ canvas, tools }).toEqual({ canvas: 480, tools: { children: 7, rows: 1 } })
    } finally {
      await context.close()
    }
  })

  it('휴지통(속성 목록 · 상호작용 · 코멘트)은 마우스를 올리면 · 키보드 포커스에 위험 색이고, 그 전에는 아니다', async () => {
    const { P } = await fixture(stack, alice, 'icons-danger')
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
    try {
      await page.goto(P)
      await canvasFrame(page).locator('[data-wb-id]').first().waitFor()
      const seen: Record<string, { rest: string; hover: string; focus: string }> = {}
      const probe = async (name: string): Promise<void> => {
        const button = page.getByRole('button', { name, exact: true }).first()
        const color = (): Promise<string> => button.evaluate((el) => getComputedStyle(el).color)
        await page.mouse.move(0, 0)
        const rest = await color()
        await button.hover()
        const hover = await color()
        await page.mouse.move(0, 0)
        await button.focus()
        // 포커스는 키보드로 옮겨야 `:focus-visible` 이 선다 — Tab 한 번 앞에서 되돌아온다.
        await page.keyboard.press('Shift+Tab')
        await page.keyboard.press('Tab')
        const focus = await color()
        seen[name] = { rest, hover, focus }
      }

      const structure = page.getByRole('region', { name: '구조 트리' })
      await structure.locator('[data-tree-id="n_tabs000001"] > button.wb-shell-structure-node').click()
      await probe('1번째 지우기')
      await structure.locator('[data-tree-id="n_btn0000001"] > button.wb-shell-structure-node').click()
      await page.getByRole('tab', { name: '상호작용' }).click()
      await probe('규칙 1 삭제')
      await probe('액션 1 삭제')
      await page.getByRole('tab', { name: '코멘트' }).click()
      await page.getByText('버튼 문구 확인').waitFor()
      await probe('삭제')

      const ink = seen['1번째 지우기']!.rest
      expect(ink).not.toBe(DANGER)
      expect(seen).toEqual({
        '1번째 지우기': { rest: ink, hover: DANGER, focus: DANGER },
        '규칙 1 삭제': { rest: ink, hover: DANGER, focus: DANGER },
        '액션 1 삭제': { rest: ink, hover: DANGER, focus: DANGER },
        삭제: { rest: ink, hover: DANGER, focus: DANGER },
      })
    } finally {
      await context.close()
    }
  })
})

/** 긴 이름 메뉴 하나 · 페이지 하나 · Tabs(목록 칸 둘) · 상호작용 한 규칙(액션 하나)을 단 Button · 코멘트 하나. */
async function fixture(stack: EditorStack, owner: Session, slug: string): Promise<{ P: string }> {
  const call = (m: string, p: string, b?: unknown) => stack.request(owner, m, p, b)
  const project = (await call('POST', '/projects', { name: '아이콘 판', slug: `${slug}-${Date.now().toString(36)}` })).body
  const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: LONG_MENU })).body
  const page = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '첫째' })).body
  const P = `/projects/${project.id}/pages/${page.id}`
  const ops = [
    { op: 'add', path: '/root/children/0', value: { id: 'n_tabs000001', type: 'Tabs', props: { tabs: ['개요', '상세'] } } },
    {
      op: 'add',
      path: '/root/children/1',
      value: {
        id: 'n_btn0000001',
        type: 'Button',
        props: { label: '검색' },
        interactions: [{ on: 'click', actions: [{ type: 'setVisible', target: 'n_tabs000001', value: false }] }],
      },
    },
  ]
  const seeded = await call('PATCH', `${P}/ops`, { baseSeq: 0, ops })
  if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
  const commented = await call('POST', `${P}/comments`, { nodeId: 'n_btn0000001', body: '버튼 문구 확인' })
  if (commented.status >= 300) throw new Error(`comment ${commented.status} ${JSON.stringify(commented.body)}`)
  return { P }
}
