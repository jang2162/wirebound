/**
 * **경로 층**(`src/drag/use-placement.ts`) — 포인터가 트리 영역 위면 트리 판정, 캔버스 칸 위면 캔버스 판정, 둘 밖이면 `null`. 놓으면 지금
 * 스토어 문서로 판정을 다시 하고 편집 전송 길(`useEditCommit` 의 `commitOps`)로 낸다.
 *
 * **셸을 라우트째 띄우고 그 스토어에 드라이버를 붙인다**(`test/edit/use-edit-commit.test.tsx` 의 관례 — 스토어를 새로 쥐면 열린 페이지
 * 대조 · 편집 전송이 사라진다). 트리 영역은 jsdom 의 실제 DOM(상자만 값으로 준다), 캔버스 칸은 `canvasHitAt` 대신 **주입 함수**로 값을 준다
 * — jsdom 에 레이아웃 · `elementFromPoint` 가 없다. 캔버스 DOM 층은 실브라우저 판(`build-test/canvas-drop.test.ts`)이 잰다.
 *
 * **`vi.mock`은 이 파일에 있어야 한다** — 호이스팅이 그것이 적힌 파일에서만 일어난다(`editor-harness.tsx` 머리말).
 */
import { act, render, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import type { PatchOp, WbNode } from '@wirebound/schema'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '../../src/api/client'
import { ApiProvider } from '../../src/api/context'
import type { PatchResult } from '../../src/api/types'
import type { CanvasHit } from '../../src/canvas/canvas-drop'
import type { DropHint } from '../../src/drag/use-pointer-drag'
import { usePlacementDrop, type CanvasRegion, type PlacementDrop } from '../../src/drag/use-placement'
import type { Placing } from '../../src/edit/structure-drop'
import { EditorStore } from '../../src/store/editor-store'
import { EditorStoreProvider } from '../../src/store/use-editor-store'
import { HEAD_SEQ, OTHER_PAGE_ID, PAGE_ID, PROJECT_ID, openPage, pageDoc } from '../editor-harness'

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

function shellStore(): EditorStore {
  const store = createdStores.at(-1)
  if (store === undefined) throw new Error('셸이 EditorStore를 만들지 않았습니다')
  return store as EditorStore
}

/**
 * ```
 * n-root (Page)
 * ├ n-text (Text)
 * └ n-box  (Card)
 *    └ n-in (Text)
 * ```
 */
function doc() {
  return pageDoc({
    id: 'n-root',
    type: 'Page',
    children: [
      { id: 'n-text', type: 'Text', props: { content: '글' } },
      { id: 'n-box', type: 'Card', children: [{ id: 'n-in', type: 'Text' }] },
    ],
  })
}

/** 보낸 편집. 응답은 곧바로 성공이다. */
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

type Placement = ReturnType<typeof usePlacementDrop>
const placementRef: { current: Placement | null } = { current: null }

interface Regions {
  tree: HTMLElement | null
  canvas: CanvasRegion | null
  hit: CanvasHit | null
}
const regions: Regions = { tree: null, canvas: null, hit: null }

function PlacementDriver(props: { pageId: string }): ReactElement {
  placementRef.current = usePlacementDrop({
    projectId: PROJECT_ID,
    pageId: props.pageId,
    regions: { tree: () => regions.tree, canvas: () => regions.canvas },
    canvasHit: () => regions.hit,
  })
  return <span />
}

function mountDriver(client: ApiClient, pageId: string = PAGE_ID): (pageId: string) => void {
  const ui = (id: string) => (
    <ApiProvider client={client}>
      <EditorStoreProvider store={shellStore()}>
        <PlacementDriver pageId={id} />
      </EditorStoreProvider>
    </ApiProvider>
  )
  const { rerender } = render(ui(pageId))
  return (next) => rerender(ui(next))
}

function placement(): Placement {
  if (placementRef.current === null) throw new Error('드라이버가 아직 뜨지 않았습니다')
  return placementRef.current
}

/** 상자를 값으로 준다 — jsdom 에 레이아웃이 없다. */
function boxed<E extends HTMLElement>(element: E, rect: { left: number; top: number; width: number; height: number }): E {
  element.getBoundingClientRect = () =>
    ({ ...rect, x: rect.left, y: rect.top, right: rect.left + rect.width, bottom: rect.top + rect.height, toJSON: () => rect }) as DOMRect
  return element
}

/** 트리 영역 — 줄 셋(뿌리 · n-text · n-box)이 30px 씩 쌓인 `ul`. */
function treeRegion(): HTMLElement {
  const list = boxed(document.createElement('ul'), { left: 0, top: 100, width: 240, height: 90 })
  for (const [index, id] of ['n-root', 'n-text', 'n-box'].entries()) {
    const row = boxed(document.createElement('li'), { left: 0, top: 100 + index * 30, width: 240, height: 30 })
    row.setAttribute('data-tree-row', '')
    row.setAttribute('data-tree-id', id)
    list.append(row)
  }
  document.body.append(list)
  return list
}

const FRAME_STUB = {} as Window
const HOST_RECT = { left: 400, top: 200, width: 300, height: 40 }
const adding: Placing = { kind: 'new', type: 'Text' }

function over(placing: Placing, x: number, y: number): DropHint<PlacementDrop> | null {
  let hint: DropHint<PlacementDrop> | null = null
  act(() => {
    hint = placement().onOver(placing, { x, y })
  })
  return hint
}

function drop(placing: Placing, value: PlacementDrop): void {
  act(() => {
    placement().onDrop(placing, value)
  })
}

beforeEach(() => {
  createdStores.length = 0
  placementRef.current = null
  regions.tree = null
  regions.canvas = { frame: FRAME_STUB, zoom: 1 }
  regions.hit = null
})

afterEach(() => {
  regions.tree?.remove()
})

describe('어느 판정을 부르나', () => {
  it('트리 영역 위 → 트리 줄의 띠로 판정한다(n-text 줄 위 끝 = 앞)', async () => {
    const { patchOps } = recordingPatchOps()
    await openPage(doc(), { apiOverrides: { patchOps } })
    mountDriver({ patchOps } as unknown as ApiClient)
    regions.tree = treeRegion()
    // 캔버스가 답을 가져도 트리 영역 안이면 트리가 이긴다.
    regions.hit = { overId: 'n-box', zone: 'inside', rect: HOST_RECT, layout: { axis: 'y', reversed: false } }

    const hint = over(adding, 50, 132)
    expect(hint).toMatchObject({
      value: { target: { parentId: 'n-root', index: 0, placement: 'before' }, over: { overId: 'n-text', zone: 'before' } },
      rect: { left: 0, top: 130, width: 240, height: 30 },
      placement: 'before',
    })
  })

  it('캔버스 칸 위 → 캔버스가 준 대상 · 띠를 같은 판정에 넣는다 · 페이지 끝', async () => {
    const { patchOps } = recordingPatchOps()
    await openPage(doc(), { apiOverrides: { patchOps } })
    mountDriver({ patchOps } as unknown as ApiClient)
    regions.tree = treeRegion()

    regions.hit = { overId: 'n-box', zone: 'inside', rect: HOST_RECT, layout: { axis: 'x', reversed: true } }
    expect(over(adding, 500, 220)).toMatchObject({
      value: { target: { parentId: 'n-box', index: 1, placement: 'inside' }, layout: { axis: 'x', reversed: true } },
      rect: HOST_RECT,
      placement: 'inside',
    })

    regions.hit = { pageEnd: true, rect: HOST_RECT, layout: { axis: 'y', reversed: false } }
    expect(over(adding, 500, 220)).toMatchObject({
      value: { target: { parentId: 'n-root', index: 2, placement: 'inside' }, over: 'page-end' },
    })
  })

  it('둘 밖 → null · 캔버스가 답을 안 주면 null · 판정이 못 놓는 자리면 null', async () => {
    const { patchOps } = recordingPatchOps()
    await openPage(doc(), { apiOverrides: { patchOps } })
    mountDriver({ patchOps } as unknown as ApiClient)
    regions.tree = treeRegion()

    expect(over(adding, 900, 900)).toBeNull()
    // 잎(Text) 안 — 판정이 null.
    regions.hit = { overId: 'n-text', zone: 'inside', rect: HOST_RECT, layout: { axis: 'y', reversed: false } }
    expect(over(adding, 500, 220)).toBeNull()
    // 캔버스 칸이 없다.
    regions.canvas = null
    regions.hit = { overId: 'n-box', zone: 'inside', rect: HOST_RECT, layout: { axis: 'y', reversed: false } }
    expect(over(adding, 500, 220)).toBeNull()
  })
})

describe('놓는 순간 다시 판정한다', () => {
  async function armed(): Promise<{ sent: PatchOp[][]; value: PlacementDrop; setPage: (pageId: string) => void }> {
    const { sent, patchOps } = recordingPatchOps()
    await openPage(doc(), { apiOverrides: { patchOps } })
    const setPage = mountDriver({ patchOps } as unknown as ApiClient)
    regions.hit = { overId: 'n-text', zone: 'after', rect: HOST_RECT, layout: { axis: 'y', reversed: false } }
    const hint = over(adding, 500, 220)
    if (hint === null) throw new Error('판정이 안 섰다')
    return { sent, value: (hint as DropHint<PlacementDrop>).value, setPage }
  }

  it('그대로면 편집 하나 — 새 노드를 그 자리에 넣고 고른다', async () => {
    const { sent, value } = await armed()
    drop(adding, value)
    await waitFor(() => expect(sent).toHaveLength(1))
    const op = sent[0]![0]!
    expect(op).toMatchObject({ op: 'add', path: '/root/children/1', value: { type: 'Text' } })
    expect(shellStore().getState().selectedNodeId).toBe((op as { value: WbNode }).value.id)
  })

  it('끄는 사이 남이 대상을 지웠다 → 편집 0', async () => {
    const { sent, value } = await armed()
    act(() => {
      shellStore().applyRemoteChange(PAGE_ID, { seq: HEAD_SEQ + 1, ops: [{ op: 'remove', path: '/root/children/0' }], warnings: [] })
    })
    drop(adding, value)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(sent).toEqual([])
  })

  it('끄는 사이 남이 놓을 부모(뿌리)를 잡았다 → 편집 0', async () => {
    const { sent, value } = await armed()
    act(() => {
      shellStore().setLocks([{ pageId: PAGE_ID, nodeId: 'n-root', userId: 'u-bora', userName: '보라' }])
    })
    drop(adding, value)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(sent).toEqual([])
  })

  it('보인 대상이 지워지면 표시가 곧바로 걷히고, 포인터가 그 자리면 다음 물음(뗌)도 null — 그 밑에 다른 자리가 서도', async () => {
    const { sent, value } = await armed()
    act(() => {
      shellStore().applyRemoteChange(PAGE_ID, { seq: HEAD_SEQ + 1, ops: [{ op: 'remove', path: '/root/children/0' }], warnings: [] })
    })
    expect(placement().live({ value, rect: HOST_RECT, placement: 'after' })).toBeNull()
    // 지운 자리 밑에 이제 바탕(페이지 끝)이 있다 — 끌기 장치가 뗀 좌표로 다시 물어도 안 보인 자리를 내지 않는다.
    regions.hit = { pageEnd: true, rect: HOST_RECT, layout: { axis: 'y', reversed: false } }
    expect(over(adding, 501, 221)).toBeNull()
    // 문턱(4px) 안에서 한 번 더 움직여도 — 조금 움직였다 떼는 판 — 아무 자리도 안 낸다.
    expect(over(adding, 503, 222)).toBeNull()
    // 문턱 밖으로 나가면 지금 문서로 새 자리를 세운다.
    expect(over(adding, 510, 230)).toMatchObject({ value: { over: 'page-end', target: { parentId: 'n-root', index: 1 } } })
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(sent).toEqual([])
  })

  it('보인 자리의 부모를 남이 잡으면 표시가 곧바로 걷힌다 — 포인터가 멈춰 있어도', async () => {
    const { value } = await armed()
    expect(placement().live({ value, rect: HOST_RECT, placement: 'after' })).not.toBeNull()
    act(() => {
      shellStore().setLocks([{ pageId: PAGE_ID, nodeId: 'n-root', userId: 'u-bora', userName: '보라' }])
    })
    expect(placement().live({ value, rect: HOST_RECT, placement: 'after' })).toBeNull()
  })

  it('끄는 사이 페이지가 바뀌었다 → 표시가 걷히고 놓아도 편집 0', async () => {
    const { sent, value, setPage } = await armed()
    act(() => setPage(OTHER_PAGE_ID))
    expect(placement().live({ value, rect: HOST_RECT, placement: 'after' })).toBeNull()
    // 같은 끌기의 다음 움직임도 null 이다 — 새 페이지에 놓지 않는다.
    expect(over(adding, 500, 220)).toBeNull()
    drop(adding, value)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(sent).toEqual([])
  })

  it('끄는 사이 캔버스 iframe 이 새로 섰다 → 같은 끌기의 다음 움직임이 null · 놓아도 편집 0', async () => {
    const { sent, value } = await armed()
    expect(placement().live({ value, rect: HOST_RECT, placement: 'after' })).not.toBeNull()
    regions.canvas = { frame: {} as Window, zoom: 1 }
    expect(placement().live({ value, rect: HOST_RECT, placement: 'after' })).toBeNull()
    expect(over(adding, 500, 220)).toBeNull()
    drop(adding, value)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(sent).toEqual([])
  })
})
