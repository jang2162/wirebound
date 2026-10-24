/**
 * **노드 몫(`WbNode.weight`)이 시스템 테마에서 실제로 폭을 나누는가** — 실브라우저 판(내보낸 번들 · 문서 폭 1280). 몫을 싣는 길(렌더러가
 * 부모를 보고 정한 값 → `Root` 의 `--wb-node-weight`)은 jsdom(`packages/renderer/test/weight.test.tsx` · `packages/theme-sdk/test/root-weight.test.tsx`)
 * 이 잰다. 여기서는 그 값을 SDK 기본 CSS(`structureCssBlocks` 의 몫 규칙 셋)가 읽어 **상자가 바뀌는지**를 잰다.
 *
 * | 케이스 | 판 | 재는 값 |
 * |---|---|---|
 * | Flex 1 : 2 | 가로 `Flex` 안 `Card` 둘(몫 1 · 2) | 내용 상자 폭의 비 — `|둘 − 2 × 하나| ≤ 2px` |
 * | Grid 칸 | `Grid` 3열 안 몫 2 | 폭 = 칸 둘 + 틈 하나(± 2px) |
 * | Grid 자르기 | `Grid` 3열 안 몫 5 | 격자 열 수 3 · 폭 = 칸 셋 + 틈 둘 · 격자를 안 넘친다(Review Focus 2) |
 * | Grid 안 Grid | 4열 안의 2열 `Grid`(몫 3) | 바깥 열 수로 잘린다 — 칸 셋 폭 · 바깥 열 수 4 |
 * | 상속 끊기 | 몫 2 인 `Card` 안 `Flex` 의 `Text` 둘(몫 없음) | 내용 폭 그대로 — 몫 1 인 짝 `Card` 안 같은 `Text` 와 같고 줄을 안 채운다(Review Focus 1) |
 * | 몫 없는 문서 | 몫이 하나도 없는 페이지 | 몫 규칙을 걷은 `views.css` 판과 노드 상자가 같다(고치기 전 = 몫 규칙이 없던 판 — 몫이 없으면 DOM 은 그대로다) |
 *
 * **Flex 의 비는 내용 상자로 잰다** — 몫은 «남는 폭» 을 나눈다(정본 설계서 「페이지 스키마 노드」). 바탕 폭이 0 이어도 안 여백 · 테두리는 항목마다
 * 따로 붙어(flex 의 바탕 크기는 그 아래로 안 내려간다) 테두리 상자의 비는 여백만큼 1 : 2 에서 벗어난다 — docs 의 `Card` 가 433 : 831(여백 35)이었다.
 *
 * `WB_LAYOUT_WEIGHT_SHOTS=<디렉터리>` 를 주면 창 1440 에서 Flex 1 : 2 · Grid 칸을 테마마다 한 장씩 남기고(`<테마>-flex.png` · `<테마>-grid.png`), 에디터에서
 * Flex 자식을 고른 속성 패널을 한 장 남긴다(`panel-weight.png` — 그 판만 도는 케이스라 변수가 없으면 건너뛴다).
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canvasFrame, editorStackPrerequisite, startEditorStack, type EditorStack, type Session } from './editor-stack'
import { cssMentions, exportBundle, layoutProject, openBundlePage, stripCssRules, type Call } from './layout-bundle'
import { putTheme, seededVersion } from './theme-fixtures'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

const THEMES = ['system-admin'] as const
const SHOTS = process.env.WB_LAYOUT_WEIGHT_SHOTS

const text = (id: string, content: string, weight?: number) => ({
  id,
  type: 'Text',
  props: { content },
  ...(weight === undefined ? {} : { weight }),
})
const card = (id: string, title: string, weight: number | undefined, children: unknown[] = []) => ({
  id,
  type: 'Card',
  props: { title },
  ...(weight === undefined ? {} : { weight }),
  children,
})
const flex = (id: string, children: unknown[]) => ({ id, type: 'Flex', props: { direction: 'row' }, children })
const grid = (id: string, columns: number, children: unknown[], weight?: number) => ({
  id,
  type: 'Grid',
  props: { columns },
  ...(weight === undefined ? {} : { weight }),
  children,
})

/** 몫을 쓰는 페이지. */
const WEIGHTED = [
  flex('fx', [card('fx_a', '하나', 1), card('fx_b', '둘', 2)]),
  // 격자 안은 `Card` 다 — 칸 폭을 그대로 채운다. `Text` 는 테마가 글 폭을 묶어(docs 본문 `max-width: 68ch`) 두 칸을 차지해도 상자가 620px 에서 멈춘다.
  grid('g3', 3, [card('g3_w2', '두 칸', 2), card('g3_x', '한 칸', undefined), card('g3_y', '한 칸', undefined)]),
  grid('g3o', 3, [card('g3o_w5', '다섯 칸을 바란다', 5), card('g3o_x', '한 칸', undefined)]),
  // 안쪽 자식은 몫 1 을 적는다 — 안 적으면 상속 끊기를 뗀 판에서 바깥 몫 3 을 물려받아(안쪽 2열에 3칸) 이 판도 함께 죽는다(그 누수는 «상속 끊기» 가 잰다).
  grid('gn', 4, [grid('gn_in', 2, [card('gn_in_a', '안 하나', 1), card('gn_in_b', '안 둘', 1)], 3), card('gn_x', '한 칸', undefined)]),
  flex('rf', [
    card('rf_card', '몫 2', 2, [flex('rf_inner', [text('rf_i1', '가나'), text('rf_i2', '다라마')])]),
    card('rf_ctrl', '몫 1', 1, [flex('rf_cinner', [text('rf_c1', '가나'), text('rf_c2', '다라마')])]),
  ]),
]

/** 몫이 하나도 없는 페이지 — 고치기 전 배치를 견준다. */
const PLAIN = [
  flex('p_fx', [
    card('p_a', '하나', undefined),
    card('p_b', '둘', undefined, [text('p_b_t', '본문 한 줄')]),
    { id: 'p_dv', type: 'Divider', props: { direction: 'vertical' } },
  ]),
  grid('p_g', 3, [text('p_g1', '하나'), text('p_g2', '둘'), text('p_g3', '셋'), text('p_g4', '넷')]),
  card('p_c', '카드', undefined, [flex('p_cf', [text('p_cf1', '가나'), { id: 'p_cf2', type: 'Button', props: { label: '저장' } }])]),
  {
    id: 'p_sf',
    type: 'SearchForm',
    props: {},
    children: [
      { id: 'p_sf1', type: 'Field', props: { label: '검색어' }, children: [{ id: 'p_sf1i', type: 'Input' }] },
      { id: 'p_sf2', type: 'Field', props: { label: '상태' }, children: [{ id: 'p_sf2s', type: 'Select' }] },
    ],
  },
  { id: 'p_ls', type: 'List', props: { items: 2, columns: ['이름', '상태'], pagination: false } },
]

/** 노드마다 상자 · 계산 스타일 몇. 글로 넘긴다 — vitest 가 함수 안의 이름을 바꿔 페이지에서 죽지 않게. */
const MEASURE = `(ids) => {
  const out = {}
  for (const id of ids) {
    const el = document.querySelector('[data-wb-id="' + id + '"]')
    if (el === null) { out[id] = null; continue }
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    out[id] = {
      left: Math.round(r.left * 100) / 100,
      top: Math.round(r.top * 100) / 100,
      width: Math.round(r.width * 100) / 100,
      content: Math.round((r.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth)) * 100) / 100,
      height: Math.round(r.height * 100) / 100,
      gap: parseFloat(cs.columnGap) || 0,
      tracks: cs.display === 'grid' ? cs.gridTemplateColumns.split(' ').length : 0,
      weightVar: el.style.getPropertyValue('--wb-node-weight'),
      overflow: el.scrollWidth - el.clientWidth,
    }
  }
  return out
}`

interface Box {
  left: number
  top: number
  width: number
  content: number
  height: number
  gap: number
  tracks: number
  weightVar: string
  overflow: number
}

function ids(nodes: readonly unknown[]): string[] {
  const out: string[] = []
  const visit = (node: any) => {
    out.push(node.id)
    for (const child of node.children ?? []) visit(child)
  }
  for (const node of nodes) visit(node)
  return out
}

async function measure(page: Page, nodes: readonly unknown[]): Promise<Record<string, Box>> {
  const m: Record<string, Box | null> = await page.evaluate(`(${MEASURE})(${JSON.stringify(ids(nodes))})`)
  for (const [id, box] of Object.entries(m)) if (box === null) throw new Error(`${id} 가 안 그려졌다`)
  return m as Record<string, Box>
}

describe.skipIf(!전제.ok)('시스템 테마 — 노드 몫이 폭을 나눈다', () => {
  let stack: EditorStack
  let alice: Session
  let call: Call
  let projectId: string
  let pageIds: Record<string, string>

  beforeAll(async () => {
    if (!전제.ok) return
    stack = await startEditorStack(전제)
    alice = await stack.login(stack.users.alice)
    ;({ projectId, call, pageIds } = await layoutProject(stack, alice, '배치', { 몫: WEIGHTED, 몫없음: PLAIN }))
    if (SHOTS !== undefined) mkdirSync(SHOTS, { recursive: true })
  }, 180_000)

  afterAll(async () => {
    if (stack === undefined) return
    const { before, after } = await stack.close()
    expect(before.processes).toBeGreaterThan(0)
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  }, 120_000)

  it.each(THEMES)(
    '%s — Flex 1 : 2 · Grid 칸 · Grid 자르기 · Grid 안 Grid · 상속 끊기',
    async (themeId) => {
      await putTheme(call, projectId, { themeId, version: seededVersion(themeId), tokens: {} })
      const bundle = await exportBundle(stack, alice, projectId)
      let m: Record<string, Box>
      try {
        const { context, page } = await openBundlePage(stack, bundle.pages['배치-몫']!, {
          viewport: { width: 1980, height: 1400 },
          docWidth: 1280,
        })
        try {
          m = await measure(page, WEIGHTED)
        } finally {
          await context.close()
        }
        if (SHOTS !== undefined) {
          const { context, page } = await openBundlePage(stack, bundle.pages['배치-몫']!, { viewport: { width: 1440, height: 900 } })
          try {
            for (const [name, id] of [
              ['flex', 'fx'],
              ['grid', 'g3'],
            ] as const) {
              await page.evaluate((x) => document.querySelector(`[data-wb-id="${x}"]`)!.scrollIntoView({ block: 'center' }), id)
              await page.locator(`[data-wb-id="${id}"]`).screenshot({ path: join(SHOTS, `${themeId.replace(/^system-/, '')}-${name}.png`) })
            }
          } finally {
            await context.close()
          }
        }
      } finally {
        bundle.dispose()
      }
      const cell = (id: string) => m[id]!.width
      const values = {
        flex: [m.fx_a!.content, m.fx_b!.content],
        grid: { w2: m.g3_w2!.width, cell: cell('g3_x'), gap: m.g3!.gap },
        clip: {
          w5: m.g3o_w5!.width,
          cell: cell('g3o_x'),
          gap: m.g3o!.gap,
          tracks: m.g3o!.tracks,
          grid: m.g3o!.width,
          overflow: m.g3o!.overflow,
        },
        nested: { inner: m.gn_in!.width, cell: cell('gn_x'), gap: m.gn!.gap, tracks: m.gn!.tracks, innerTracks: m.gn_in!.tracks },
        inherit: {
          weighted: [m.rf_i1!.width, m.rf_i2!.width],
          control: [m.rf_c1!.width, m.rf_c2!.width],
          inner: m.rf_inner!.width,
          gap: m.rf_inner!.gap,
        },
      }
      // eslint-disable-next-line no-console
      console.log(`[몫] ${themeId} ${JSON.stringify(values)}`)
      const detail = `${themeId} ${JSON.stringify(values)}`
      // 카나리아 — 몫이 안 실리면 아래는 테마 배치를 잰다. 안쪽 Text 는 몫이 없어 변수가 비어야 한다. 자른 값(3열에 5 → 3)은 여기서 안 본다 — 자르기를
      // 뗀 변조가 카나리아가 아니라 «Grid 자르기» 로 죽게(값 자체는 `packages/renderer/test/weight.test.tsx` 가 잰다).
      expect(
        [m.fx_a!, m.fx_b!, m.g3_w2!, m.g3o_w5!, m.gn_in!].map((box) => box.weightVar !== '').concat(m.rf_i1!.weightVar === ''),
        detail,
      ).toEqual([true, true, true, true, true, true])
      // 성질마다 `soft` — 변조 하나가 어느 성질을 죽이는지 한 판에 다 보인다.
      const near = (a: number, b: number) => Math.abs(a - b) <= 2
      expect.soft(near(values.flex[1]!, 2 * values.flex[0]!), `Flex 1 : 2 — ${detail}`).toBe(true)
      expect.soft(near(values.grid.w2, 2 * values.grid.cell + values.grid.gap), `Grid 칸 — ${detail}`).toBe(true)
      expect
        .soft(
          {
            tracks: values.clip.tracks,
            spansThree: near(values.clip.w5, 3 * values.clip.cell + 2 * values.clip.gap),
            withinGrid: values.clip.w5 <= values.clip.grid + 0.5,
            overflow: values.clip.overflow,
          },
          `Grid 자르기 — ${detail}`,
        )
        .toEqual({ tracks: 3, spansThree: true, withinGrid: true, overflow: 0 })
      expect
        .soft(
          {
            tracks: values.nested.tracks,
            innerTracks: values.nested.innerTracks,
            spansThree: near(values.nested.inner, 3 * values.nested.cell + 2 * values.nested.gap),
          },
          `Grid 안 Grid — ${detail}`,
        )
        .toEqual({ tracks: 4, innerTracks: 2, spansThree: true })
      const [w1, w2] = values.inherit.weighted
      const [c1, c2] = values.inherit.control
      expect
        .soft(
          {
            sameAsControl: Math.abs(w1! - c1!) <= 0.5 && Math.abs(w2! - c2!) <= 0.5,
            doesNotFill: w1! + w2! + values.inherit.gap < values.inherit.inner - 2,
          },
          `상속 끊기 — ${detail}`,
        )
        .toEqual({ sameAsControl: true, doesNotFill: true })
    },
    180_000,
  )

  it.each(THEMES)(
    '%s — 몫이 없는 문서는 몫 규칙이 없던 판과 상자가 같다',
    async (themeId) => {
      await putTheme(call, projectId, { themeId, version: seededVersion(themeId), tokens: {} })
      const now = await exportBundle(stack, alice, projectId)
      const before = await exportBundle(stack, alice, projectId)
      let boxes: { now: Record<string, Box>; before: Record<string, Box> }
      try {
        // 카나리아 — 몫 규칙(상속 끊기 · Flex · Grid)을 걷었는가. 0 이면 두 판이 같은 CSS 다.
        expect(stripCssRules(before, 'assets/views.css', '--wb-node-weight')).toBeGreaterThan(0)
        expect(cssMentions(before, 'assets/views.css', '--wb-node-weight')).toBe(0)
        const read = async (file: string) => {
          const { context, page } = await openBundlePage(stack, file, { viewport: { width: 1980, height: 1400 }, docWidth: 1280 })
          try {
            return await measure(page, PLAIN)
          } finally {
            await context.close()
          }
        }
        boxes = { now: await read(now.pages['배치-몫없음']!), before: await read(before.pages['배치-몫없음']!) }
      } finally {
        now.dispose()
        before.dispose()
      }
      const differs = Object.keys(boxes.now).filter((id) => {
        const [a, b] = [boxes.now[id]!, boxes.before[id]!]
        return (['left', 'top', 'width', 'height'] as const).some((k) => Math.abs(a[k] - b[k]) > 0.5)
      })
      // 카나리아 — 판이 섰다(노드가 다 그려졌고 몫 변수가 하나도 없다).
      expect(Object.keys(boxes.now).length).toBe(ids(PLAIN).length)
      expect.soft(Object.values(boxes.now).filter((box) => box.weightVar !== '')).toEqual([])
      expect(differs, `${themeId} ${JSON.stringify(differs.map((id) => [id, boxes.now[id], boxes.before[id]]))}`).toEqual([])
    },
    180_000,
  )
  it.skipIf(SHOTS === undefined)(
    '스크린숏 — 에디터에서 Flex 자식을 고른 속성 패널의 «몫» 칸',
    async () => {
      const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
      try {
        await page.goto(`/projects/${projectId}/pages/${pageIds['몫']}`)
        await canvasFrame(page).locator('[data-wb-id]').first().waitFor()
        await page.locator('[data-tree-id="fx_b"] > button.wb-shell-structure-node').click()
        const panel = page.getByRole('complementary', { name: '우측 패널' })
        const field = panel.getByRole('textbox', { name: '몫', exact: true })
        await field.waitFor()
        expect(await field.inputValue()).toBe('2')
        await panel.screenshot({ path: join(SHOTS!, 'panel-weight.png') })
        await page.screenshot({ path: join(SHOTS!, 'editor-weight.png') })
      } finally {
        await context.close()
      }
    },
    180_000,
  )
})
