/**
 * **끌기 진단 줄을 실브라우저로 잰다**(`src/drag/drag-debug.ts`) — `?debugDrag=1` 로 연 에디터에서 카드를 캔버스에 끌어 놓으면 콘솔에 단계 줄이 서고,
 * 놓을 수 없는 자리에서는 그 까닭이 줄에 든다. 실물 `canvasHitAt` 을 지난다(jsdom 판 `test/drag/drag-debug.test.tsx` 는 그 답을 고른다).
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 켠 판 | 단계 줄이 차례대로 안 선다 · 판 위(`outside-canvas`) · 문서 아래 바탕(페이지 끝) · 문서 옆 바탕(`beside-or-above-document`)의 답이 줄에 없다 · 노드가 안 선다(서버 값) |
 * | 꺼진 판 | 질의 없이 연 에디터에서 `[wb-drag]` 줄이 선다 · 놓기가 켠 판과 다르다 |
 *
 * 콘솔은 `page.on('console')` 로 센다 — 받은 수 전체를 카나리아로 함께 적는다(꺼진 판은 페이지가 낸 `[canary]` 한 줄이 닿는지로 그 듣기가 산 것을 본다).
 * 놓을 수 없는 자리는 **문서 옆 바탕**이다 — 문서 아래 바탕은 페이지 끝으로 놓인다(`src/canvas/canvas-drop.ts` 머리말 «문서 옆 · 위의 바탕은 못
 * 놓는 자리로 남긴다»).
 */
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canvasFrame, editorStackPrerequisite, poll, startEditorStack, type EditorStack, type Session } from './editor-stack'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

interface Box {
  x: number
  y: number
  width: number
  height: number
}

const SHORT = [
  { id: 'n_text', type: 'Text', props: { content: '글' } },
  { id: 'n_last', type: 'Text', props: { content: '끝' } },
]
const KNOWN = new Set(SHORT.map((node) => node.id))

/** 줄의 단계 낱말(`[wb-drag] #n +ms` 뒤). */
function stepOf(line: string): string {
  return line.split(' ')[3] ?? ''
}

/** `want` 의 줄 조각이 `lines` 에 그 차례로 서는가 — 사이의 다른 줄(캡처 · 같은 답의 움직임)은 건너뛴다. 못 찾은 첫 조각을 돌려준다. */
function missingInOrder(lines: readonly string[], want: readonly string[]): string | null {
  let at = 0
  for (const piece of want) {
    while (at < lines.length && !lines[at]!.includes(piece)) at += 1
    if (at === lines.length) return piece
    at += 1
  }
  return null
}

describe.skipIf(!전제.ok)('끌기 진단 줄 — 실브라우저', () => {
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

  async function fixture(slug: string): Promise<string> {
    const project = (await call('POST', '/projects', { name: 'N30 진단', slug: `${slug}-${Date.now().toString(36)}` })).body
    const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '가' })).body
    const pageId = (await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '쪽' })).body.id
    const P = `/projects/${project.id}/pages/${pageId}`
    const seeded = await call('PATCH', `${P}/ops`, {
      baseSeq: 0,
      ops: SHORT.map((value, at) => ({ op: 'add', path: `/root/children/${at}`, value })),
    })
    if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
    return P
  }

  async function openEditor(url: string): Promise<{ page: Page; close: () => Promise<void>; consoleLines: string[]; patches: string[] }> {
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1440, height: 900 } })
    const consoleLines: string[] = []
    page.on('console', (message) => consoleLines.push(message.text()))
    const patches: string[] = []
    page.on('websocket', (socket) => {
      socket.on('framesent', (frame) => {
        const text = typeof frame.payload === 'string' ? frame.payload : frame.payload.toString()
        if (text.includes('"type":"patch"')) patches.push(text)
      })
    })
    await page.goto(url)
    await canvasFrame(page).locator('[data-wb-id]').nth(1).waitFor()
    return { page, close: () => context.close(), consoleLines, patches }
  }

  async function boxes(page: Page): Promise<{ cell: Box; frame: Box }> {
    return page.evaluate(() => {
      const plain = (r: DOMRect) => ({ x: r.x, y: r.y, width: r.width, height: r.height })
      return {
        cell: plain((document.querySelector('.wb-shell-canvas') as HTMLElement).getBoundingClientRect()),
        frame: plain((document.querySelector('iframe.wb-shell-canvas-iframe') as HTMLElement).getBoundingClientRect()),
      }
    })
  }

  async function openPalette(page: Page): Promise<void> {
    if ((await page.getByRole('region', { name: '컴포넌트 목록' }).count()) > 0) return
    await page.getByRole('contentinfo', { name: '하단 바' }).getByRole('button', { name: '컴포넌트', exact: true }).click()
    await page.getByRole('region', { name: '컴포넌트 목록' }).waitFor()
  }

  /** 카드를 쥐고 문턱을 넘긴 뒤 `to` 로 가서 뗀다. */
  async function dragCardTo(page: Page, type: string, to: { x: number; y: number }): Promise<void> {
    await page.getByRole('searchbox', { name: '컴포넌트 찾기' }).fill(type)
    const card = page.locator(`[data-wb-palette-card="${type}"]`)
    await card.waitFor()
    const box = (await card.boundingBox())!
    const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    await page.mouse.move(at.x, at.y)
    await page.mouse.down()
    await page.mouse.move(at.x + 3, at.y - 6, { steps: 3 })
    await page.mouse.move(to.x, to.y, { steps: 10 })
    await page.mouse.up()
  }

  async function order(P: string): Promise<string[]> {
    const root = (await call('GET', P)).body.schema.root as { children?: { id: string; type: string }[] }
    return (root.children ?? []).map((child) => (KNOWN.has(child.id) ? child.id : `+${child.type}`))
  }

  const dragLines = (lines: readonly string[]): string[] => lines.filter((line) => line.startsWith('[wb-drag]'))

  /** 한 누름(`#n`)의 줄 — `down` 의 번호로 가른다. */
  function gestureLines(lines: readonly string[], ordinal: number): string[] {
    const downs = lines.filter((line) => stepOf(line) === 'down').map((line) => line.split(' ')[1])
    const seq = downs[ordinal]
    return lines.filter((line) => line.split(' ')[1] === seq)
  }

  it('켠 판 — 단계 줄이 차례대로 서고 노드가 선다 · 문서 옆 바탕에서는 그 까닭이 줄에 든다', async () => {
    const P = await fixture('debug-on')
    const { page, close, consoleLines, patches } = await openEditor(`${P}?debugDrag=1`)
    try {
      await openPalette(page)
      const b = await boxes(page)
      // 문서 아래 바탕(페이지 끝 — M2 가 놓이게 한 띠).
      const before = dragLines(consoleLines).length
      await dragCardTo(page, 'Divider', { x: b.cell.x + b.cell.width / 2, y: (b.frame.y + b.frame.height + b.cell.y + b.cell.height) / 2 })
      const placed = await poll(
        '서버 문서',
        () => order(P),
        (v) => v.length === 3,
      ).catch(() => order(P))
      const sentAfterPlace = patches.length
      const first = gestureLines(dragLines(consoleLines).slice(before), 0)

      // 문서 옆 바탕 — 프리셋 375 로 문서를 칸보다 좁힌 판의 왼쪽.
      await page.getByLabel('뷰포트 폭').selectOption('375')
      const narrow = await poll(
        '프리셋이 실린다',
        () => boxes(page),
        (v) => Math.abs(v.frame.width - 375) < 1,
      )
      const beforeSide = dragLines(consoleLines).length
      await dragCardTo(page, 'Divider', {
        x: narrow.cell.x + (narrow.frame.x - narrow.cell.x) / 2,
        y: narrow.frame.y + narrow.frame.height / 2,
      })
      await page.waitForTimeout(500)
      const side = gestureLines(dragLines(consoleLines).slice(beforeSide), 0)

      expect({
        side: side.find((line) => stepOf(line) === 'release')?.replace(/^.* release /, ''),
        canary: consoleLines.length > 0,
        on: dragLines(consoleLines)[0],
        firstMissing: missingInOrder(first, [
          ' down pointer=mouse id=1 button=0 ',
          ' press pointer=mouse id=1 button=0 ',
          ' start via=threshold ',
          ' over result=none why=outside-canvas ',
          ' tag label=구분선 ',
          ' over result=canvas ',
          ' release ',
          ' end why=release started=true',
          ' drop result=committed ',
        ]),
        tags: first.filter((line) => stepOf(line) === 'tag').length,
        pageEnd: first.some((line) => / over result=canvas parent=\S+ index=2 placement=inside over=page-end /.test(line)),
        placed,
        sentAfterPlace,
        sideMissing: missingInOrder(side, [
          ' press ',
          ' start ',
          ' over result=none why=beside-or-above-document ',
          ' release x=',
          ' end why=release',
        ]),
        sideDrop: side.filter((line) => stepOf(line) === 'drop'),
        sentAfterSide: patches.length,
        after: await order(P),
      }).toEqual({
        side: expect.stringMatching(/ landed=false shown=false still=true$/),
        canary: true,
        on: expect.stringMatching(/^\[wb-drag\] #0 \+\d+ms on source=query dpr=1 viewport=1440x900 ua=/),
        firstMissing: null,
        tags: 1,
        pageEnd: true,
        placed: ['n_text', 'n_last', '+Divider'],
        sentAfterPlace: 1,
        sideMissing: null,
        sideDrop: [],
        sentAfterSide: 1,
        after: ['n_text', 'n_last', '+Divider'],
      })
    } finally {
      await close()
    }
  })

  it('꺼진 판 — 질의 없이 연 에디터에서는 `[wb-drag]` 줄이 0 이고 놓기는 같다', async () => {
    const P = await fixture('debug-off')
    const { page, close, consoleLines, patches } = await openEditor(P)
    try {
      await openPalette(page)
      const b = await boxes(page)
      await dragCardTo(page, 'Divider', { x: b.cell.x + b.cell.width / 2, y: (b.frame.y + b.frame.height + b.cell.y + b.cell.height) / 2 })
      const placed = await poll(
        '서버 문서',
        () => order(P),
        (v) => v.length === 3,
      ).catch(() => order(P))
      await page.evaluate(() => console.info('[canary]'))
      await poll(
        '카나리아 줄',
        async () => consoleLines.includes('[canary]'),
        (v) => v,
      ).catch(() => false)
      expect({ canary: consoleLines.includes('[canary]'), lines: dragLines(consoleLines), placed, sent: patches.length }).toEqual({
        canary: true,
        lines: [],
        placed: ['n_text', 'n_last', '+Divider'],
        sent: 1,
      })
    } finally {
      await close()
    }
  })
})
