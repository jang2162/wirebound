/**
 * **끌기 진단 줄**(`src/drag/drag-debug.ts`) — 셸을 라우트째 띄워 하단 판의 카드를 캔버스로 끌어 놓고 `console.info` 의 `[wb-drag]` 줄을 센다.
 *
 * jsdom 에는 레이아웃이 없어 캔버스 판정(`canvasHitAt`)은 **이 파일이 고른 답**을 낸다(`hitPlan`) — 놓을 자리는 `structureDropTarget`(실물)이
 * 판정한다. 실브라우저 판(`build-test/drag-debug.test.ts`)은 실물 `canvasHitAt` 을 지난다.
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 켠 판 — 카드 → 캔버스 | 단계 줄이 차례대로 안 선다(`down` → `press` → `start` → `over` → `tag` → `release` → `end` → `drop`) · 놓을 자리 · 놓은 결과가 줄에 없다 |
 * | 꺼진 판 | `[wb-drag]` 줄이 하나라도 선다 · 진단 전용 리스너(창 잃음 · 캡처 · 전역 누름)를 건다 · 놓기가 켠 판과 다르다 |
 * | `null` 판 | 놓을 자리가 없는 까닭(`why=`)이 줄에 없다 — 판정(`not-container`)과 `canvasHitAt`(`outside-canvas`) 둘 다 |
 * | 움직임 | 같은 답 위의 움직임마다 `over` 줄이 선다(바뀔 때만이어야 한다) |
 *
 * **`vi.mock`은 이 파일에 있어야 한다** — 호이스팅이 그것이 적힌 파일에서만 일어난다(`editor-harness.tsx` 머리말).
 */
import { act, fireEvent, screen, within } from '@testing-library/react'
import type { PageDocument, PatchOp } from '@wirebound/schema'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import type { ApiClient } from '../../src/api/client'
import type { PatchResult } from '../../src/api/types'
import type { CanvasHit } from '../../src/canvas/canvas-drop'
import { DRAG_DEBUG_STORAGE_KEY, dragDebug, readDragDebugSwitch } from '../../src/drag/drag-debug'
import { EditorStore } from '../../src/store/editor-store'
import { PAGE_ID, openPage, pageDoc } from '../editor-harness'
import { installPointerEvents } from '../pointer-events'

installPointerEvents()

/** 캔버스 판정의 답 — `'actual'` 이면 실물(jsdom 에서는 상자가 0 이라 iframe 밖이다). */
let hitPlan: CanvasHit | 'actual' = 'actual'

vi.mock('../../src/canvas/canvas-drop', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/canvas/canvas-drop')>()
  return {
    ...actual,
    canvasHitAt: (...args: Parameters<typeof actual.canvasHitAt>) => (hitPlan === 'actual' ? actual.canvasHitAt(...args) : hitPlan),
  }
})

const createdStores: EditorStore[] = []

vi.mock('../../src/store/editor-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/store/editor-store')>()
  return {
    ...actual,
    EditorStore: class extends actual.EditorStore {
      constructor() {
        super()
        createdStores.push(this)
      }
    },
  }
})

/**
 * ```
 * n-root (Page)
 * ├ n-text (Text)
 * └ n-box  (Card)
 * ```
 */
const DOC: PageDocument = pageDoc({
  id: 'n-root',
  type: 'Page',
  children: [
    { id: 'n-text', type: 'Text', props: { content: '글' } },
    { id: 'n-box', type: 'Card', children: [] },
  ],
})

const RECT = { left: 300, top: 100, width: 400, height: 40 }
const PAGE_END: CanvasHit = { pageEnd: true, rect: RECT, layout: { axis: 'y', reversed: false } }
const ON_TEXT_INSIDE: CanvasHit = { overId: 'n-text', band: 'inside', rect: RECT, layout: { axis: 'y', reversed: false } }

function recordingPatchOps(): { sent: PatchOp[][]; patchOps: ApiClient['patchOps'] } {
  const sent: PatchOp[][] = []
  const patchOps: ApiClient['patchOps'] = async (_projectId, _pageId, body) => {
    sent.push(body.ops)
    const result: PatchResult = {
      seq: body.baseSeq + 1,
      revisionId: `rev-${body.baseSeq + 1}`,
      inverse: [],
      schemaVersion: 1,
      clientOpId: body.clientOpId ?? 'op-?',
    }
    return result
  }
  return { sent, patchOps }
}

async function openWithPalette(): Promise<PatchOp[][]> {
  const { sent, patchOps } = recordingPatchOps()
  await openPage(DOC, { apiOverrides: { patchOps } })
  fireEvent.click(within(screen.getByRole('contentinfo', { name: '하단 바' })).getByRole('button', { name: '컴포넌트' }))
  return sent
}

function card(type: string): HTMLElement {
  const found = screen.getByRole('region', { name: '컴포넌트 목록' }).querySelector<HTMLElement>(`[data-wb-palette-card="${type}"]`)
  if (found === null) throw new Error(`${type} 카드가 없다`)
  return found
}

function search(text: string): void {
  fireEvent.change(screen.getByRole('searchbox', { name: '컴포넌트 찾기' }), { target: { value: text } })
}

const POINTER = { pointerId: 1, pointerType: 'mouse' }

/** 카드를 쥐고 `path` 를 따라 움직인 뒤 마지막 점에서 뗀다. */
async function dragCard(type: string, path: readonly { x: number; y: number }[]): Promise<void> {
  search(type)
  const start = { x: 50, y: 700 }
  fireEvent.pointerDown(card(type), { ...POINTER, button: 0, clientX: start.x, clientY: start.y })
  for (const at of path) {
    await act(async () => {
      fireEvent.pointerMove(window, { ...POINTER, clientX: at.x, clientY: at.y })
    })
  }
  const end = path.at(-1) ?? start
  await act(async () => {
    fireEvent.pointerUp(window, { ...POINTER, button: 0, clientX: end.x, clientY: end.y })
  })
}

let info: MockInstance<typeof console.info>

/** `[wb-drag]` 줄. */
function dragLines(): string[] {
  return info.mock.calls.map((call) => String(call[0])).filter((text) => text.startsWith('[wb-drag]'))
}

/** 줄의 단계 낱말(`#n +ms` 뒤의 첫 낱말). */
function steps(lines: readonly string[]): string[] {
  return lines.map((line) => line.split(' ')[3] ?? '')
}

function switchOn(): void {
  localStorage.setItem(DRAG_DEBUG_STORAGE_KEY, '1')
  readDragDebugSwitch()
}

beforeEach(() => {
  localStorage.clear()
  readDragDebugSwitch()
  hitPlan = 'actual'
  info = vi.spyOn(console, 'info').mockImplementation(() => {})
})

afterEach(() => {
  info.mockRestore()
  localStorage.clear()
  readDragDebugSwitch()
})

describe('켠 판', () => {
  it('카드 → 캔버스 놓기 한 번에 단계 줄이 차례대로 선다 — 놓을 자리 · 놓은 결과까지', async () => {
    const sent = await openWithPalette()
    switchOn()
    hitPlan = PAGE_END
    info.mockClear()
    await dragCard('Divider', [
      { x: 60, y: 690 },
      { x: 400, y: 120 },
    ])
    const lines = dragLines()
    expect({ steps: steps(lines), sent: sent.length }).toEqual({
      steps: ['down', 'press', 'start', 'over', 'tag', 'release', 'end', 'drop'],
      sent: 1,
    })
    const line = (step: string) => lines.find((text) => text.split(' ')[3] === step) ?? ''
    expect({
      down: line('down'),
      press: line('press'),
      start: line('start'),
      over: line('over'),
      tag: line('tag'),
      release: line('release'),
      end: line('end'),
      drop: line('drop'),
    }).toEqual({
      down: expect.stringMatching(/ down pointer=mouse id=1 button=0 x=50 y=700 target=div\.wb-shell-palette-card\[Divider\]$/),
      press: expect.stringMatching(/ press pointer=mouse id=1 button=0 x=50 y=700 el=div\.wb-shell-palette-card\[Divider\] frames-held=1$/),
      start: expect.stringMatching(/ start via=threshold dist=14\.1 capture=absent$/),
      over: expect.stringMatching(/ over result=canvas parent=n-root index=2 placement=inside over=page-end x=60 y=690$/),
      tag: expect.stringMatching(/ tag label=구분선 left=0 top=0 width=0 height=0$/),
      release: expect.stringMatching(/ release x=400 y=120 landed=true shown=true still=true$/),
      end: expect.stringMatching(/ end why=release started=true$/),
      drop: expect.stringMatching(/ drop result=committed parent=n-root index=2 placing=new:Divider$/),
    })
    // 한 누름의 줄은 같은 번호다.
    expect(new Set(lines.map((text) => text.split(' ')[1])).size).toBe(1)
  })

  it('같은 답 위의 움직임은 `over` 를 다시 안 낸다 — 답이 바뀔 때만', async () => {
    await openWithPalette()
    switchOn()
    hitPlan = PAGE_END
    info.mockClear()
    search('Divider')
    fireEvent.pointerDown(card('Divider'), { ...POINTER, button: 0, clientX: 50, clientY: 700 })
    for (const at of [
      { x: 60, y: 690 },
      { x: 70, y: 680 },
      { x: 80, y: 670 },
    ]) {
      await act(async () => {
        fireEvent.pointerMove(window, { ...POINTER, clientX: at.x, clientY: at.y })
      })
    }
    hitPlan = ON_TEXT_INSIDE
    await act(async () => {
      fireEvent.pointerMove(window, { ...POINTER, clientX: 90, clientY: 660 })
    })
    await act(async () => {
      fireEvent.pointerMove(window, { ...POINTER, clientX: 95, clientY: 655 })
    })
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape' })
    })
    const overs = dragLines().filter((text) => text.split(' ')[3] === 'over')
    expect({ overs: overs.map((text) => text.replace(/^.* over /, '')), last: steps(dragLines()).at(-1) }).toEqual({
      overs: ['result=canvas parent=n-root index=2 placement=inside over=page-end x=60 y=690', 'result=none why=not-container x=90 y=660'],
      last: 'end',
    })
    expect(dragLines().at(-1)).toMatch(/ end why=escape started=true$/)
  })
})

describe('null 판 — 놓을 자리가 없는 까닭', () => {
  it('판정이 거절하면 그 까닭(`not-container`)이, 캔버스 판정이 `null` 이면 그 까닭(`outside-canvas`)이 줄에 든다 · 놓아도 편집 0', async () => {
    const sent = await openWithPalette()
    switchOn()
    hitPlan = ON_TEXT_INSIDE
    info.mockClear()
    await dragCard('Divider', [{ x: 60, y: 690 }])
    const verdictLines = dragLines()
    hitPlan = 'actual'
    info.mockClear()
    await dragCard('Divider', [{ x: 60, y: 690 }])
    const actualLines = dragLines()
    expect({
      verdict: verdictLines.filter((text) => / (over|release|drop) /.test(text)).map((text) => text.replace(/^.* \+\d+ms /, '')),
      actual: actualLines.filter((text) => / (over|release|drop) /.test(text)).map((text) => text.replace(/^.* \+\d+ms /, '')),
      sent: sent.length,
    }).toEqual({
      verdict: ['over result=none why=not-container x=60 y=690', 'release x=60 y=690 landed=false shown=false still=true'],
      actual: ['over result=none why=outside-canvas x=60 y=690', 'release x=60 y=690 landed=false shown=false still=true'],
      sent: 0,
    })
  })
})

describe('꺼진 판', () => {
  it('`[wb-drag]` 줄이 0 이고 진단 전용 리스너를 안 건다 — 놓기는 켠 판과 같다', async () => {
    const sent = await openWithPalette()
    hitPlan = PAGE_END
    const addWindow = vi.spyOn(window, 'addEventListener')
    const addElement = vi.spyOn(HTMLElement.prototype, 'addEventListener')
    info.mockClear()
    await dragCard('Divider', [
      { x: 60, y: 690 },
      { x: 400, y: 120 },
    ])
    // 카드에 건 것만 — React 는 뿌리 · portal 컨테이너에 모든 이벤트(캡처 포함)를 건다.
    const elementTypes = addElement.mock.calls.filter((_, at) => addElement.mock.contexts[at] === card('Divider')).map((call) => call[0])
    const added = addWindow.mock.calls.map((call) => call[0])
    addWindow.mockRestore()
    addElement.mockRestore()
    expect({
      debug: dragDebug(),
      lines: dragLines().length,
      infoCalls: info.mock.calls.length,
      windowListeners: [...new Set(added)]
        .filter((type) => ['pointermove', 'pointerup', 'pointercancel', 'keydown', 'blur', 'pointerdown'].includes(type))
        .sort(),
      captureListeners: elementTypes.filter((type) => type.includes('pointercapture')),
      sent: sent.length,
      inserted: sent[0]?.[0]?.op,
    }).toEqual({
      debug: null,
      lines: 0,
      infoCalls: 0,
      windowListeners: ['keydown', 'pointercancel', 'pointermove', 'pointerup'],
      captureListeners: [],
      sent: 1,
      inserted: 'add',
    })
  })

  it("저장소 키가 `'1'` 이 아니면 꺼진다 · 저장소가 던지면 꺼진다", () => {
    localStorage.setItem(DRAG_DEBUG_STORAGE_KEY, 'true')
    const notOne = readDragDebugSwitch()
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    const thrown = readDragDebugSwitch()
    getItem.mockRestore()
    localStorage.setItem(DRAG_DEBUG_STORAGE_KEY, '1')
    const on = readDragDebugSwitch()
    expect({ notOne, thrown, on: on !== null }).toEqual({ notOne: null, thrown: null, on: true })
  })

  it('주소의 `?debugDrag=1` 로도 켜진다', () => {
    const before = window.location.href
    window.history.replaceState(null, '', `${window.location.pathname}?debugDrag=1`)
    const on = readDragDebugSwitch()
    window.history.replaceState(null, '', before)
    expect({ on: on !== null, first: String(info.mock.calls.at(-1)?.[0]) }).toEqual({
      on: true,
      first: expect.stringMatching(/^\[wb-drag\] #0 \+\d+ms on source=query dpr=1 viewport=\d+x\d+ ua=/),
    })
  })
})

it('셸이 스토어를 만들었다(카나리아)', async () => {
  await openWithPalette()
  expect(createdStores.length).toBeGreaterThan(0)
  expect(PAGE_ID).toBeTruthy()
})
