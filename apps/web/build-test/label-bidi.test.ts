/**
 * **라벨 · 제목 · 선택지 이름의 방향 제어 글자가 뒤따르는 다른 이름을 뒤집지 않는가** — 실브라우저 판. 별칭은 입구(봉투 · 화면 다듬기)가 방향
 * 제어 글자를 막지만 라벨 · 제목 · 선택지 이름 같은 props 의 글은 막지 않는다 — 그 글이 이어 붙는 자리(상호작용 문장 · 구조 트리 줄 요약 ·
 * 대상 고르개 · 내보낸 번들의 상호작용 목록)에서 이름마다 방향을 격리해야(`isolateBidi`) 뒤의 이름이 제 자리에 선다.
 *
 * 재는 값은 글자마다 화면 가로 가운데다 — 이름 조각들이 논리 차례 그대로 왼쪽 → 오른쪽으로 서는가. 제어 글자가 없는 글은 바이트가 그대로여야
 * 한다(감싸지 않는다 — 다른 판의 문장 비교가 그대로 선다).
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { unzipSync } from 'fflate'
import type { Locator, Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canvasFrame, editorStackPrerequisite, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

const RLO = '\u202e'
/** 라벨의 방향 제어 글자 — 이 글이 뒤따르는 글을 뒤집으면 안 된다. */
const HOSTILE = `a${RLO}b`

type Glyph = { ch: string; x: number }

/** 요소 안 글자(UTF-16 한 칸)마다 화면 가로 가운데 — 폭이 없는 글자(방향 제어)는 `NaN`. */
const glyphsOf = (target: Locator): Promise<Glyph[]> =>
  target.evaluate((root) => {
    const out: Array<{ ch: string; x: number }> = []
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const text = node.textContent ?? ''
      for (let at = 0; at < text.length; at += 1) {
        const range = document.createRange()
        range.setStart(node, at)
        range.setEnd(node, at + 1)
        const rect = range.getBoundingClientRect()
        out.push({ ch: text[at]!, x: rect.width === 0 ? Number.NaN : rect.left + rect.width / 2 })
      }
    }
    return out
  })

/** 논리 차례로 이은 조각들이 화면에서도 왼쪽부터 그 차례로 서는가 — 조각마다 가로 범위(폭 있는 글자만)를 견준다. */
function piecesInOrder(row: Glyph[], pieces: string[]): { text: string; inOrder: boolean; spans: string[] } {
  const text = row.map((glyph) => glyph.ch).join('')
  const spans: Array<[number, number]> = []
  let at = 0
  for (const piece of pieces) {
    const start = text.indexOf(piece, at)
    if (start < 0) throw new Error(`조각 ${JSON.stringify(piece)} 가 글에 없다: ${JSON.stringify(text)}`)
    const xs = row
      .slice(start, start + piece.length)
      .map((glyph) => glyph.x)
      .filter((x) => !Number.isNaN(x))
    spans.push([Math.min(...xs), Math.max(...xs)])
    at = start + piece.length
  }
  const inOrder = spans.every((span, index) => index === 0 || spans[index - 1]![1] < span[0])
  return { text, inOrder, spans: spans.map(([lo, hi]) => `${Math.round(lo)}-${Math.round(hi)}`) }
}

const unpacked: string[] = []

describe.skipIf(!전제.ok)('라벨 · 선택지 이름의 방향 제어 글자 — 실브라우저', () => {
  let stack: EditorStack
  let alice: Session
  let projectId = ''
  let P = ''

  beforeAll(async () => {
    if (!전제.ok) return
    stack = await startEditorStack(전제)
    alice = await stack.login(stack.users.alice)
    const call = (m: string, p: string, b?: unknown) => stack.request(alice, m, p, b)
    const project = (await call('POST', '/projects', { name: '라벨 bidi', slug: `lbl-${Date.now().toString(36)}` })).body
    projectId = project.id
    const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '가' })).body
    const pageId = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '쪽' })).body.id
    P = `/projects/${project.id}/pages/${pageId}`
    const nodes = [
      {
        id: 'n_save00000001',
        type: 'Button',
        marker: 1,
        props: { label: HOSTILE },
        interactions: [{ on: 'click', actions: [{ type: 'setVisible', target: 'n_list00000001', value: false }] }],
      },
      { id: 'n_list00000001', type: 'Button', marker: 2, props: { label: '저장' } },
      {
        id: 'n_cols00000001',
        type: 'CheckboxGroup',
        props: { options: [`x${RLO}yz`, '둘째', '셋째'].map((label) => ({ label, selected: true })) },
      },
    ]
    const seeded = await call('PATCH', `${P}/ops`, {
      baseSeq: 0,
      ops: nodes.map((value, at) => ({ op: 'add', path: `/root/children/${at}`, value })),
    })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
  }, 120_000)

  afterAll(async () => {
    for (const dir of unpacked) rmSync(dir, { recursive: true, force: true })
    if (stack === undefined) return
    const { before, after } = await stack.close()
    expect(before.processes).toBeGreaterThan(0)
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  }, 120_000)

  async function openEditor(): Promise<{ page: Page; close: () => Promise<void> }> {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
    await page.goto(P)
    await canvasFrame(page).locator('[data-wb-id]').first().waitFor()
    await page.locator('[data-tree-row]').first().waitFor({ state: 'attached' })
    return { page, close: () => context.close() }
  }

  it('구조 트리 줄 요약 — 선택지 이름의 방향 제어 글자가 뒤따르는 이름을 안 뒤집는다', async () => {
    const a = await openEditor()
    try {
      const tabsRow = a.page.locator('[data-tree-id="n_cols00000001"] > button.wb-shell-structure-node')
      const tabs = piecesInOrder(await glyphsOf(tabsRow), ['CheckboxGroup', `x${RLO}yz`, '둘째', '셋째'])
      // 판 카나리아 — 조각마다 폭 있는 글자를 잡았다(줄이 접혀 있으면 범위가 비어 `Infinity` 다).
      expect(
        tabs.spans.every((span) => !span.includes('Infinity')),
        JSON.stringify(tabs),
      ).toBe(true)
      expect(tabs.inOrder, JSON.stringify(tabs)).toBe(true)
    } finally {
      await a.close()
    }
  })

  it('상호작용 문장 — 라벨의 방향 제어 글자가 뒤따르는 이름을 안 뒤집는다', async () => {
    const a = await openEditor()
    try {
      await a.page.locator('[data-tree-id="n_save00000001"] > button.wb-shell-structure-node').click()
      await a.page.getByRole('tab', { name: '상호작용' }).click()
      const sentenceBox = a.page.locator('.wb-shell-interaction-sentence').first()
      await sentenceBox.waitFor()
      const sentence = piecesInOrder(await glyphsOf(sentenceBox), ['①', HOSTILE, '클릭', '②', '저장'])
      expect(
        sentence.spans.every((span) => !span.includes('Infinity')),
        JSON.stringify(sentence),
      ).toBe(true)
      expect(sentence.inOrder, JSON.stringify(sentence)).toBe(true)
    } finally {
      await a.close()
    }
  })

  it('상호작용 문장 목록(고른 노드 없음) — 페이지 전체 목록의 문장도 뒤따르는 이름을 안 뒤집는다', async () => {
    const a = await openEditor()
    try {
      await a.page.getByRole('tab', { name: '상호작용' }).click()
      // 고른 노드가 없으면 편집 칸 대신 페이지 전체 문장 목록이 선다.
      const item = a.page.locator('.wb-shell-interaction-list .wb-shell-interaction-sentence').first()
      await item.waitFor()
      const sentence = piecesInOrder(await glyphsOf(item), ['①', HOSTILE, '클릭', '②', '저장'])
      expect(
        sentence.spans.every((span) => !span.includes('Infinity')),
        JSON.stringify(sentence),
      ).toBe(true)
      expect(sentence.inOrder, JSON.stringify(sentence)).toBe(true)
    } finally {
      await a.close()
    }
  })

  it('대상 고르개 항목 — 같은 이름 함수가 낸 글이라 문장과 같은 격리를 갖는다', async () => {
    const a = await openEditor()
    try {
      await a.page.locator('[data-tree-id="n_save00000001"] > button.wb-shell-structure-node').click()
      await a.page.getByRole('tab', { name: '상호작용' }).click()
      await a.page.locator('.wb-shell-interaction-sentence').first().waitFor()
      // 네이티브 팝업은 글자 상자를 못 잰다 — 항목의 글이 이름마다 격리됐는지(같은 함수 `describeNode` 의 글)를 본다.
      const options = await a.page.locator('.wb-shell-interaction select option').allTextContents()
      const picked = options.filter((text) => text.includes(HOSTILE))
      expect(picked.length, JSON.stringify(options)).toBeGreaterThan(0)
      expect(
        picked.every((text) => text.includes(`\u2068${HOSTILE}\u2069`)),
        JSON.stringify(options),
      ).toBe(true)
    } finally {
      await a.close()
    }
  })

  it('내보낸 번들의 상호작용 목록 — 라벨의 방향 제어 글자가 뒤따르는 이름을 안 뒤집는다', async () => {
    const response = await fetch(`${stack.apiUrl}/api/projects/${projectId}/export?format=html`, { headers: { cookie: alice.cookie } })
    expect(response.status).toBe(200)
    const entries = unzipSync(new Uint8Array(await response.arrayBuffer()))
    const dir = mkdtempSync(join(tmpdir(), 'wb-label-bidi-'))
    unpacked.push(dir)
    let file: string | null = null
    for (const [path, bytes] of Object.entries(entries)) {
      if (path.endsWith('/')) continue
      mkdirSync(dirname(join(dir, path)), { recursive: true })
      writeFileSync(join(dir, path), bytes)
      if (/\/pages\/가-쪽\.html$/.test(path)) file = join(dir, path)
    }
    if (file === null) throw new Error(`번들에 페이지가 없다: ${Object.keys(entries).join(', ')}`)
    const context = await stack.browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await context.newPage()
    try {
      await page.goto(pathToFileURL(file).href)
      await page.waitForSelector('html[data-wb-ready]', { state: 'attached', timeout: 15_000 })
      // 상호작용 탭을 연다 — 닫힌 탭은 글자 상자의 폭이 0 이라 아무것도 못 잰다.
      await page.locator('label.wb-export-tab-interactions').click()
      const entry = page.locator('[data-wb-interaction-for="n_save00000001"] .wb-export-entry-body').first()
      await entry.waitFor({ state: 'visible' })
      const sentence = piecesInOrder(await glyphsOf(entry), ['①', HOSTILE, '클릭', '②', '저장'])
      // 판 카나리아 — 글자 상자가 잡혔다(닫힌 탭이면 범위가 비어 `Infinity` 다).
      expect(
        sentence.spans.every((span) => !span.includes('Infinity')),
        JSON.stringify(sentence),
      ).toBe(true)
      expect(sentence.inOrder, JSON.stringify(sentence)).toBe(true)
    } finally {
      await context.close()
    }
  })
})
