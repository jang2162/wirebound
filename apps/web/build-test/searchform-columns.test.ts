/**
 * **조회 폼의 열(`SearchForm.columns`)이 시스템 테마에서 필드를 같은 폭 칸으로 까는가** — 실브라우저 판(내보낸 번들). 열을 정한 판의 표지
 * (`fields` 조각의 `data-wb-columns` · `--wb-node-searchform-columns`)와 필드 몫의 자르기는 jsdom(`packages/renderer/test/weight.test.tsx`)이 잰다.
 * 여기서는 테마 CSS 가 그 표지를 읽어 **상자가 바뀌는지**를 잰다.
 *
 * | 케이스 | 판 | 재는 값 |
 * |---|---|---|
 * | 3열 | 문서 폭 1280 · `columns: 3` · 필드 여섯 | 줄 둘 · 줄마다 셋 · 칸 폭 같음(± 2px) |
 * | 몫 | 문서 폭 1280 · `columns: 3` · 첫 필드 몫 2 | 그 칸 폭 = 칸 둘 + 틈 하나(± 2px) |
 * | 좁은 창 | 창 390 · 화면 모드(`#wb-screen` — 문서 폭 = 창 폭)(system-admin 의 좁은 창 문턱 640 아래) | 필드 여섯이 여섯 줄 · 몫 2 인 칸도 한 칸 폭 |
 * | 열 없음 | 문서 폭 1280 · `columns` 없음 | `data-wb-columns` 규칙을 걷은 `views.css` · `theme.css` 판과 노드 상자가 같다(고치기 전 = 그 규칙이 없던 판 — 열이 없으면 DOM 은 그대로다) |
 *
 * **«열 없음» 의 고치기 전 판은 `data-wb-columns` 를 품은 규칙을 걷어 세운다** — 그래서 표지 없이 거는 새 규칙(셀렉터에서 `[data-wb-columns]` 를 뺀
 * 규칙)은 이 케이스가 못 잡는다(걷히지 않아 두 판에 같이 선다). 이 케이스가 잡는 것은 표지가 열 없는 판에 새는 것이다(구조는 렌더러가 «안 정했으면
 * 속성 없음» 을 jsdom 으로도 잰다).
 *
 * `WB_SEARCHFORM_COLUMNS_SHOTS=<디렉터리>` 를 주면 창 1440 에서 3열 · 몫을 테마마다 한 장씩 남긴다(`<테마>-searchform-3.png`).
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { editorStackPrerequisite, startEditorStack, type EditorStack, type Session } from './editor-stack'
import { cssMentions, exportBundle, layoutProject, openBundlePage, stripCssRules, type Call } from './layout-bundle'
import { putTheme, seededVersion } from './theme-fixtures'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

const THEMES = ['system-admin'] as const
const SHOTS = process.env.WB_SEARCHFORM_COLUMNS_SHOTS

const field = (id: string, label: string, weight?: number) => ({
  id,
  type: 'Field',
  props: { label },
  ...(weight === undefined ? {} : { weight }),
})
const SIX = ['이름', '이메일', '상태', '가입일', '등급', '지역']

const COLUMNS = [
  { id: 'sf3', type: 'SearchForm', props: { columns: 3 }, children: SIX.map((label, i) => field(`sf3_${i}`, label)) },
  {
    id: 'sfw',
    type: 'SearchForm',
    props: { columns: 3 },
    children: [field('sfw_a', '검색어', 2), field('sfw_b', '상태'), field('sfw_c', '등급')],
  },
]
const PLAIN = [{ id: 'sf0', type: 'SearchForm', props: {}, children: SIX.slice(0, 3).map((label, i) => field(`sf0_${i}`, label)) }]

/** 노드마다 상자 · `fields` 조각의 틈 · 표지. 글로 넘긴다 — vitest 가 함수 안의 이름을 바꿔 페이지에서 죽지 않게. */
const MEASURE = `(ids) => {
  const out = {}
  for (const id of ids) {
    const el = document.querySelector('[data-wb-id="' + id + '"]')
    if (el === null) { out[id] = null; continue }
    const r = el.getBoundingClientRect()
    const fields = el.querySelector(':scope > [data-wb-part="fields"]')
    out[id] = {
      left: Math.round(r.left * 100) / 100,
      top: Math.round(r.top * 100) / 100,
      width: Math.round(r.width * 100) / 100,
      height: Math.round(r.height * 100) / 100,
      gap: fields === null ? 0 : parseFloat(getComputedStyle(fields).columnGap) || 0,
      columns: fields === null ? null : fields.getAttribute('data-wb-columns'),
      display: fields === null ? null : getComputedStyle(fields).display,
    }
  }
  return out
}`

interface Box {
  left: number
  top: number
  width: number
  height: number
  gap: number
  columns: string | null
  display: string | null
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

/** 상자들의 줄 — 위 좌표가 같은 것끼리(± 1px) 묶어 줄마다 수를 센다. */
function rows(boxes: Box[]): number[] {
  const tops: number[] = []
  const counts: number[] = []
  for (const box of boxes) {
    const at = tops.findIndex((top) => Math.abs(top - box.top) <= 1)
    if (at === -1) {
      tops.push(box.top)
      counts.push(1)
    } else counts[at]! += 1
  }
  return counts
}

describe.skipIf(!전제.ok)('시스템 테마 — 조회 폼의 열', () => {
  let stack: EditorStack
  let alice: Session
  let call: Call
  let projectId: string

  beforeAll(async () => {
    if (!전제.ok) return
    stack = await startEditorStack(전제)
    alice = await stack.login(stack.users.alice)
    ;({ projectId, call } = await layoutProject(stack, alice, '조회', { 열: COLUMNS, 열없음: PLAIN }))
    if (SHOTS !== undefined) mkdirSync(SHOTS, { recursive: true })
  }, 180_000)

  afterAll(async () => {
    if (stack === undefined) return
    const { before, after } = await stack.close()
    expect(before.processes).toBeGreaterThan(0)
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  }, 120_000)

  it.each(THEMES)(
    '%s — 3열 · 몫 · 좁은 창',
    async (themeId) => {
      await putTheme(call, projectId, { themeId, version: seededVersion(themeId), tokens: {} })
      const bundle = await exportBundle(stack, alice, projectId)
      let wide: Record<string, Box>
      let narrow: Record<string, Box>
      try {
        const read = async (viewport: { width: number; height: number }, more: { docWidth?: number; screen?: boolean }) => {
          const { context, page } = await openBundlePage(stack, bundle.pages['조회-열']!, { viewport, ...more })
          try {
            return await measure(page, COLUMNS)
          } finally {
            await context.close()
          }
        }
        wide = await read({ width: 1980, height: 1400 }, { docWidth: 1280 })
        narrow = await read({ width: 390, height: 1400 }, { screen: true })
        if (SHOTS !== undefined) {
          const { context, page } = await openBundlePage(stack, bundle.pages['조회-열']!, { viewport: { width: 1440, height: 900 } })
          try {
            await page.evaluate(() => document.querySelector('[data-wb-id="sf3"]')!.scrollIntoView({ block: 'start' }))
            const clip = await page.evaluate(() => {
              const [a, b] = ['sf3', 'sfw'].map((id) => document.querySelector(`[data-wb-id="${id}"]`)!.getBoundingClientRect())
              return {
                x: Math.max(0, a!.left - 8),
                y: Math.max(0, a!.top - 8),
                width: Math.max(a!.width, b!.width) + 16,
                height: b!.bottom - a!.top + 16,
              }
            })
            await page.screenshot({ path: join(SHOTS, `${themeId.replace(/^system-/, '')}-searchform-3.png`), clip })
          } finally {
            await context.close()
          }
        }
      } finally {
        bundle.dispose()
      }
      const six = (m: Record<string, Box>) => SIX.map((_, i) => m[`sf3_${i}`]!)
      const values = {
        wide: {
          rows: rows(six(wide)),
          widths: six(wide).map((b) => b.width),
          a: wide.sfw_a!.width,
          b: wide.sfw_b!.width,
          gap: wide.sfw!.gap,
        },
        narrow: { rows: rows(six(narrow)), a: narrow.sfw_a!.width, b: narrow.sfw_b!.width, form: narrow.sf3!.width },
      }
      // eslint-disable-next-line no-console
      console.log(`[조회 열] ${themeId} ${JSON.stringify(values)}`)
      const detail = `${themeId} ${JSON.stringify(values)}`
      // 카나리아 — 표지가 안 실리면(테마 뷰가 `fields` 에 안 폈다) 아래는 열 없는 배치를 잰다.
      // 격자인지(`display`)는 여기서 안 본다 — 테마의 열 규칙을 뗀 변조가 카나리아가 아니라 «3열» 로 죽게.
      expect([wide.sf3!.columns, wide.sfw!.columns], detail).toEqual(['3', '3'])
      // 카나리아 — 좁은 판의 문서가 창 폭을 받았다(셸이 서면 문서 칸이 0 으로 눌려 «한 줄에 하나» 가 폭 0 인 상자로 늘 참이다).
      expect(values.narrow.form > 300 && values.narrow.b > 100, detail).toBe(true)
      const near = (a: number, b: number) => Math.abs(a - b) <= 2
      const ws = values.wide.widths
      // 성질마다 `soft` — 변조 하나가 어느 성질을 죽이는지 한 판에 다 보인다.
      expect
        .soft({ rows: values.wide.rows, equal: ws.every((w) => near(w, ws[0]!)) }, `3열 — ${detail}`)
        .toEqual({ rows: [3, 3], equal: true })
      expect.soft(near(values.wide.a, 2 * values.wide.b + values.wide.gap), `몫 — ${detail}`).toBe(true)
      expect.soft({ rows: values.narrow.rows, sameWidth: near(values.narrow.a, values.narrow.b) }, `좁은 창 — ${detail}`).toEqual({
        rows: [1, 1, 1, 1, 1, 1],
        sameWidth: true,
      })
    },
    180_000,
  )

  it.each(THEMES)(
    '%s — 열을 안 정한 조회 폼은 열 규칙이 없던 판과 상자가 같다',
    async (themeId) => {
      await putTheme(call, projectId, { themeId, version: seededVersion(themeId), tokens: {} })
      const now = await exportBundle(stack, alice, projectId)
      const before = await exportBundle(stack, alice, projectId)
      let boxes: { now: Record<string, Box>; before: Record<string, Box> }
      try {
        // 카나리아 — 열 규칙을 걷었는가(기본 뷰 CSS · 테마 CSS 둘 이상 — 테마는 격자 하나 · 좁은 창 둘). 덜 걷으면 두 판이 같은 CSS 라 거짓 초록이다.
        const removed = [
          stripCssRules(before, 'assets/views.css', 'data-wb-columns'),
          stripCssRules(before, 'assets/theme/theme.css', 'data-wb-columns'),
        ]
        expect(removed[0]).toBeGreaterThan(0)
        expect(removed[1]).toBeGreaterThanOrEqual(2)
        expect([
          cssMentions(before, 'assets/views.css', 'data-wb-columns'),
          cssMentions(before, 'assets/theme/theme.css', 'data-wb-columns'),
        ]).toEqual([0, 0])
        const read = async (file: string) => {
          const { context, page } = await openBundlePage(stack, file, { viewport: { width: 1980, height: 1400 }, docWidth: 1280 })
          try {
            return await measure(page, PLAIN)
          } finally {
            await context.close()
          }
        }
        boxes = { now: await read(now.pages['조회-열없음']!), before: await read(before.pages['조회-열없음']!) }
      } finally {
        now.dispose()
        before.dispose()
      }
      const differs = Object.keys(boxes.now).filter((id) => {
        const [a, b] = [boxes.now[id]!, boxes.before[id]!]
        return (['left', 'top', 'width', 'height'] as const).some((k) => Math.abs(a[k] - b[k]) > 0.5)
      })
      // 카나리아 — 판이 섰다(노드가 다 그려졌다). 표지가 없는지는 `soft` 다 — 표지가 열 없는 판에 새는 변조가 상자 견줌으로도 죽는지 보이게.
      expect(Object.keys(boxes.now).length).toBe(ids(PLAIN).length)
      expect.soft(boxes.now.sf0!.columns).toBeNull()
      expect(differs, `${themeId} ${JSON.stringify(differs.map((id) => [id, boxes.now[id], boxes.before[id]]))}`).toEqual([])
    },
    180_000,
  )
})
