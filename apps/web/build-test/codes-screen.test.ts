/**
 * **공통코드 화면 — 실브라우저**(`src/codes/codes-screen.tsx`). 관리자 칸과 같은 꼴(목록 | 상세 · 표 → 900px 아래 카드)이 긴 영문 이름 · 코드값 ·
 * 페이지 제목에서도 창 밖으로 안 넘는지 잰다. jsdom 의 흐름 판(만들기 · 지우기 · 사용처 이동)은 `apps/web/test/codes/codes-screen.test.tsx`.
 *
 * | 판 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 창 390 · 720 · 899 · 900 · 1000 · 1099 · 1100 · 1920 | 문서 · 뼈대 상자의 가로 넘침 0 · 창 밖 글자 노드 0(`AGENTS.md` «화면 넘침은 요소 상자로만 세지 않는다») |
 * | 접힘 | 899 이하는 표 머리가 숨고 줄이 카드(`grid`) · 900 이상은 표 머리가 선다 |
 *
 * 긴 낱말은 끊을 자리 없는 영문이고 붙임표가 없다(`AGENTS.md` 의 같은 절 — 한글 · 붙임표는 Chrome 이 스스로 꺾어 넘침을 못 낸다).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright-core'
import { editorStackPrerequisite, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

const LONG_KEY = 'AVERYLONGCOMMONCODEGROUPKEYFORWIDTHCHECK'
const LONG_NAME = 'Averyverylongenglishcommoncodenamewithoutanyspacesatall'
const LONG_VALUE = 'averylongcodevaluewithoutbreakpointsxyz'
const LONG_TITLE = 'Averyverylongpagetitlethatneverbreaksanywhereforoverflow'

describe.skipIf(!전제.ok)('공통코드 화면 — 실브라우저', () => {
  let stack: EditorStack
  let alice: Session
  let projectId: string

  beforeAll(async () => {
    if (!전제.ok) return
    stack = await startEditorStack(전제)
    alice = await stack.login(stack.users.alice)
    const project = (await stack.request(alice, 'POST', '/projects', { name: '공통코드 넘침', slug: `codes-${Date.now().toString(36)}` }))
      .body
    projectId = project.id
    const base = `/projects/${projectId}`
    expect((await stack.request(alice, 'POST', `${base}/codes`, { key: LONG_KEY, name: LONG_NAME })).status).toBe(201)
    for (let i = 0; i < 3; i += 1) {
      const res = await stack.request(alice, 'POST', `${base}/codes/${LONG_KEY}/items`, {
        value: `${LONG_VALUE.slice(0, 38)}${i}`,
        name: `${LONG_NAME}${i}`,
      })
      expect(res.status).toBe(201)
    }
    const menu = (await stack.request(alice, 'POST', `${base}/menu`, { parentId: null, title: '메뉴' })).body
    const page = (await stack.request(alice, 'POST', `${base}/pages`, { menuNodeId: menu.id, title: LONG_TITLE })).body
    const bound = await stack.request(alice, 'PATCH', `${base}/pages/${page.id}/ops`, {
      baseSeq: 0,
      ops: [
        {
          op: 'add',
          path: '/root/children/0',
          value: {
            id: 'n_codewidth01',
            type: 'Affix',
            alias: LONG_NAME,
            props: { text: 'x' },
            code: { group: LONG_KEY, item: `${LONG_VALUE.slice(0, 38)}0` },
          },
        },
      ],
    })
    expect(bound.status).toBe(200)
  })

  afterAll(async () => {
    if (stack === undefined) return
    const { before, after } = await stack.close()
    expect(before.processes).toBeGreaterThan(0)
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  })

  it('창 390 · 720 · 899 · 900 · 1000 · 1099 · 1100 · 1920 — 넘침 0 · 창 밖 글자 0 · 899 이하는 카드', async () => {
    const seen: Record<string, unknown>[] = []
    for (const width of [390, 720, 899, 900, 1000, 1099, 1100, 1920]) {
      const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width, height: 900 } })
      try {
        await page.goto(`/projects/${projectId}/codes?group=${LONG_KEY}`)
        await page.getByRole('table', { name: '공통코드 항목' }).waitFor()
        await page.getByRole('list', { name: '사용처 목록' }).waitFor()
        const got = await measure(page)
        seen.push({ width, ...got })
        expect({ width, doc: got.doc, workspace: got.workspace, texts: got.texts }).toEqual({ width, doc: 0, workspace: 0, texts: [] })
        expect({ width, head: got.head, row: got.row }).toEqual(
          width < 900 ? { width, head: 'none', row: 'grid' } : { width, head: 'table-header-group', row: 'table-row' },
        )
        // 판 카나리아 — 긴 글이 실제로 그려졌다.
        expect(got.counted).toBeGreaterThan(5)
        expect(got.longSeen).toBe(true)
      } finally {
        await context.close()
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[codes-screen 넘침] ${JSON.stringify(seen)}`)
  })
})

/** 문서 · 뼈대 상자의 가로 넘침, 창 오른끝을 넘는 글자 노드, 표 머리 · 첫 줄의 `display`. */
function measure(
  page: Page,
): Promise<{ doc: number; workspace: number; texts: string[]; counted: number; longSeen: boolean; head: string; row: string }> {
  return page.evaluate(
    ([long]) => {
      const width = document.documentElement.clientWidth
      const box = document.querySelector('.wb-shell-workspace')!
      const texts: string[] = []
      let counted = 0
      let longSeen = false
      const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT)
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.textContent?.trim()) continue
        const range = document.createRange()
        range.selectNodeContents(n)
        const rects = [...range.getClientRects()]
        if (rects.length === 0) continue
        counted += 1
        if (n.textContent.includes(long!)) longSeen = true
        const right = Math.max(...rects.map((r) => r.right))
        if (right > width + 0.5) texts.push(`${n.textContent.trim().slice(0, 24)} +${Math.round(right - width)}px`)
      }
      const table = document.querySelector('table[aria-label="공통코드 항목"]')!
      return {
        doc: document.documentElement.scrollWidth - width,
        workspace: box.scrollWidth - box.clientWidth,
        texts,
        counted,
        longSeen,
        head: getComputedStyle(table.querySelector('thead')!).display,
        row: getComputedStyle(table.querySelector('tbody tr')!).display,
      }
    },
    [LONG_NAME],
  )
}
