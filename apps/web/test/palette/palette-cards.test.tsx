/**
 * **하단 판의 카드**(`src/palette/component-palette.tsx`) — 갈래 탭 · 이름 검색 · 로빙 탭 인덱스 · 카드의 «넣기» 단추(계획 D6 의 표) · 카드 몸통을
 * 눌러도 넣지 않음.
 *
 * 셸을 라우트째 띄워 판을 토글로 열고 그 스토어에 드라이버를 붙인다(`test/drag/use-placement.test.tsx` 의 관례). 끌어 놓기 · Enter 로 누름 ·
 * 축소판은 실브라우저 판(`build-test/palette.test.ts`).
 *
 * **`vi.mock`은 이 파일에 있어야 한다** — 호이스팅이 그것이 적힌 파일에서만 일어난다(`editor-harness.tsx` 머리말).
 */
import { act, fireEvent, screen, within } from '@testing-library/react'
import { COMPONENT_GROUP_LABELS, COMPONENT_GROUPS, getComponent, type PageDocument, type PatchOp } from '@wirebound/schema'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '../../src/api/client'
import type { PatchResult } from '../../src/api/types'
import { lockedNotice } from '../../src/panels/property-panel'
import { DOUBLE_CLICK_MS } from '../../src/shell/action-menu'
import { lockedSelectionStatus } from '../../src/panels/toolbar-status'
import { STRUCTURE_WHY_DISABLED } from '../../src/panels/tree-row-actions'
import { EditorStore } from '../../src/store/editor-store'
import { PAGE_ID, openPage, pageDoc } from '../editor-harness'

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
const DOC: PageDocument = pageDoc({
  id: 'n-root',
  type: 'Page',
  children: [
    { id: 'n-text', type: 'Text', props: { content: '글' } },
    { id: 'n-box', type: 'Card', children: [{ id: 'n-in', type: 'Text' }] },
  ],
})

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

async function openWithPalette(doc: PageDocument = DOC): Promise<PatchOp[][]> {
  const { sent, patchOps } = recordingPatchOps()
  await openPage(doc, { apiOverrides: { patchOps } })
  fireEvent.click(within(screen.getByRole('contentinfo', { name: '하단 바' })).getByRole('button', { name: '컴포넌트' }))
  return sent
}

function palette(): HTMLElement {
  return screen.getByRole('region', { name: '컴포넌트 목록' })
}

function cards(): HTMLElement[] {
  return [...palette().querySelectorAll<HTMLElement>('[data-wb-palette-card]')]
}

function cardTypes(): string[] {
  return cards().map((card) => card.getAttribute('data-wb-palette-card') ?? '')
}

function card(type: string): HTMLElement {
  const found = cards().find((element) => element.getAttribute('data-wb-palette-card') === type)
  if (found === undefined) throw new Error(`${type} 카드가 없다 — 지금 ${cardTypes().join(', ')}`)
  return found
}

function search(text: string): void {
  fireEvent.change(within(palette()).getByRole('searchbox', { name: '컴포넌트 찾기' }), { target: { value: text } })
}

function notice(): string {
  return palette().querySelector('[data-wb-palette-notice]')?.textContent ?? ''
}

async function select(nodeId: string | null): Promise<void> {
  await act(async () => shellStore().selectNode(nodeId))
}

/** 카드의 «넣기» 단추 — 접근 이름 `<한국어 이름> 넣기`(머리말 «카드 — 끌면 놓고, 단추로 넣는다»). */
function addButton(type: string): HTMLElement {
  return within(card(type)).getByRole('button', { name: `${getComponent(type)!.label} 넣기` })
}

/** 그 카드의 «넣기» 단추를 누른다. */
async function clickCard(type: string): Promise<void> {
  fireEvent.click(addButton(type))
  await act(async () => {})
}

/** 카드마다 «넣기» 단추. */
function addButtons(): HTMLElement[] {
  return cards().map((element) => within(element).getByRole('button'))
}

beforeEach(() => localStorage.clear())
afterEach(() => localStorage.clear())

describe('갈래 탭', () => {
  it('탭 차례가 카탈로그 갈래 차례이고, 첫 탭이 골라져 그 갈래의 카드만 선다', async () => {
    await openWithPalette()
    const tabs = within(within(palette()).getByRole('tablist', { name: '갈래' })).getAllByRole('tab')
    const expected = COMPONENT_GROUPS.map((group) => COMPONENT_GROUP_LABELS[group])
    expect(tabs.map((tab) => tab.textContent)).toEqual(expected)
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('true')
    expect(cardTypes().length).toBeGreaterThan(0)
    expect(cardTypes().every((type) => getComponent(type)?.group === COMPONENT_GROUPS[0])).toBe(true)
  })

  it('다른 탭을 누르면 그 갈래의 카드로 바뀐다', async () => {
    await openWithPalette()
    fireEvent.click(within(palette()).getByRole('tab', { name: COMPONENT_GROUP_LABELS.action }))
    expect(cardTypes().length).toBeGreaterThan(0)
    expect(cardTypes().every((type) => getComponent(type)?.group === 'action')).toBe(true)
    expect(within(palette()).getByRole('tab', { name: COMPONENT_GROUP_LABELS.action }).getAttribute('aria-selected')).toBe('true')
  })
})

describe('이름 검색', () => {
  it('한국어 이름 · 영문 타입 · 대소문자 무시 — 갈래를 가리지 않는다', async () => {
    await openWithPalette()
    const button = getComponent('Button')!.label
    search(button)
    expect(cardTypes()).toEqual(['Button'])
    search('button')
    expect(cardTypes()).toEqual(['Button'])
    search('BUTTON')
    expect(cardTypes()).toEqual(['Button'])
  })

  it('NFC — 자모로 풀어 쓴(NFD) 한국어도 같은 이름이다', async () => {
    await openWithPalette()
    const button = getComponent('Button')!.label
    expect(button.normalize('NFD')).not.toBe(button)
    search(button.normalize('NFD'))
    expect(cardTypes()).toEqual(['Button'])
  })

  it('맞는 것이 없으면 카드 0 · 그렇다고 말한다', async () => {
    await openWithPalette()
    search('없는이름zz')
    expect(cardTypes()).toEqual([])
    expect(within(palette()).getByText('맞는 컴포넌트가 없습니다')).toBeTruthy()
  })
})

describe('로빙 탭 인덱스', () => {
  it('Tab 은 카드 줄에 한 번(«넣기» 단추) — 화살표 · Home/End 가 카드 사이를 옮긴다', async () => {
    await openWithPalette()
    const all = addButtons()
    expect(all.length).toBeGreaterThan(2)
    // 카드 몸통은 Tab 정지점이 아니다 — 줄 안에서 Tab 이 서는 것은 «넣기» 단추 하나다.
    const stops = [...palette().querySelectorAll<HTMLElement>('.wb-shell-palette-track [tabindex], .wb-shell-palette-track button')].filter(
      (element) => element.tabIndex === 0,
    )
    expect(stops).toEqual([all[0]])

    all[0]!.focus()
    fireEvent.keyDown(all[0]!, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(addButtons()[1])
    expect(addButtons().filter((element) => element.tabIndex === 0)).toEqual([addButtons()[1]])

    fireEvent.keyDown(addButtons()[1]!, { key: 'End' })
    expect(document.activeElement).toBe(addButtons().at(-1))
    fireEvent.keyDown(addButtons().at(-1)!, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(addButtons().at(-1))
    fireEvent.keyDown(addButtons().at(-1)!, { key: 'Home' })
    expect(document.activeElement).toBe(addButtons()[0])
    fireEvent.keyDown(addButtons()[0]!, { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(addButtons()[0])
  })
})

/** 넣은 노드(보낸 `add` 의 값). */
function added(sent: PatchOp[][]): { path: string; id: string; type: string } {
  const op = sent.at(-1)?.[0] as { op: string; path: string; value: { id: string; type: string } } | undefined
  if (op === undefined || op.op !== 'add') throw new Error(`보낸 add 가 없다: ${JSON.stringify(sent)}`)
  return { path: op.path, id: op.value.id, type: op.value.type }
}

describe('카드 몸통은 끌기 전용이다', () => {
  it('몸통을 누르기만 하면(끌기 문턱 안) 넣지 않고 거절 문장도 없다', async () => {
    const sent = await openWithPalette()
    await select('n-text')
    search('Divider')
    const body = card('Divider')
    fireEvent.pointerDown(body, { button: 0, pointerId: 1, clientX: 10, clientY: 10 })
    fireEvent.pointerUp(window, { button: 0, pointerId: 1, clientX: 11, clientY: 10 })
    fireEvent.click(body)
    fireEvent.click(body.querySelector('[data-wb-palette-window]')!)
    fireEvent.click(body.querySelector('.wb-shell-palette-label')!)
    await act(async () => {})
    expect({ sent, notice: notice(), selected: shellStore().getState().selectedNodeId }).toEqual({
      sent: [],
      notice: '',
      selected: 'n-text',
    })
  })

  it('«넣기» 단추는 카드마다 하나 — 이름이 «<한국어 이름> 넣기» 다', async () => {
    await openWithPalette()
    const names = cards().map((element) =>
      within(element)
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label')),
    )
    expect(names).toEqual(cardTypes().map((type) => [`${getComponent(type)!.label} 넣기`]))
  })
})

describe('«넣기» 단추 — 계획 D6 의 표', () => {
  it('고른 것 없음 → 뿌리 끝 · 넣은 노드를 고른다', async () => {
    const sent = await openWithPalette()
    await select(null)
    search('Divider')
    await clickCard('Divider')
    expect(sent).toHaveLength(1)
    const node = added(sent)
    expect({ path: node.path, type: node.type }).toEqual({ path: '/root/children/2', type: 'Divider' })
    expect(shellStore().getState().selectedNodeId).toBe(node.id)
  })

  it('뿌리 → 뿌리 끝', async () => {
    const sent = await openWithPalette()
    await select('n-root')
    search('Divider')
    await clickCard('Divider')
    expect(added(sent).path).toBe('/root/children/2')
  })

  it('자식을 받는 컴포넌트 → 그 안 끝', async () => {
    const sent = await openWithPalette()
    await select('n-box')
    search('Divider')
    await clickCard('Divider')
    expect(added(sent).path).toBe('/root/children/1/children/1')
  })

  it('잎 → 그 뒤(같은 부모)', async () => {
    const sent = await openWithPalette()
    await select('n-text')
    search('Divider')
    await clickCard('Divider')
    const node = added(sent)
    expect(node.path).toBe('/root/children/1')
    expect(shellStore().getState().selectedNodeId).toBe(node.id)
  })

  it('고른 노드를 남이 잡았다 → 넣지 않음 · 트리의 꺼진 항목과 같은 문장', async () => {
    const sent = await openWithPalette()
    await select('n-text')
    await act(async () => shellStore().setLocks([{ pageId: PAGE_ID, nodeId: 'n-text', userId: 'u-bora', userName: '보라' }]))
    search('Divider')
    await clickCard('Divider')
    expect(sent).toEqual([])
    expect(notice()).toBe(lockedSelectionStatus('보라'))
  })

  // 뿌리 · 컨테이너는 «안 끝» 이라 고른 노드의 잠금(`lockedBy` — 자손의 잠금도 센다)이 아니라 판정에 맡긴다(`palette-add.ts` 머리말).
  it('뿌리를 고른 채 남이 자손을 잡았다 → 그래도 뿌리 끝', async () => {
    const sent = await openWithPalette()
    await select('n-root')
    await act(async () => shellStore().setLocks([{ pageId: PAGE_ID, nodeId: 'n-in', userId: 'u-bora', userName: '보라' }]))
    search('Divider')
    await clickCard('Divider')
    expect({ path: sent.length === 1 ? added(sent).path : null, notice: notice() }).toEqual({ path: '/root/children/2', notice: '' })
  })

  it('컨테이너를 고른 채 남이 그 안 노드를 잡았다 → 그래도 그 안 끝', async () => {
    const sent = await openWithPalette()
    await select('n-box')
    await act(async () => shellStore().setLocks([{ pageId: PAGE_ID, nodeId: 'n-in', userId: 'u-bora', userName: '보라' }]))
    search('Divider')
    await clickCard('Divider')
    expect({ path: sent.length === 1 ? added(sent).path : null, notice: notice() }).toEqual({
      path: '/root/children/1/children/1',
      notice: '',
    })
  })

  it('고른 컨테이너를 남이 잡았다 → 넣지 않음 · 잠금 문장(판정이 막는다)', async () => {
    const sent = await openWithPalette()
    await select('n-box')
    await act(async () => shellStore().setLocks([{ pageId: PAGE_ID, nodeId: 'n-box', userId: 'u-bora', userName: '보라' }]))
    search('Divider')
    await clickCard('Divider')
    expect(sent).toEqual([])
    expect(notice()).toBe(lockedNotice('보라'))
  })

  it('판정 null — 넣을 자리(잎 바로 뒤)를 남이 잡았다 → 넣지 않음 · 잠금 문장', async () => {
    const sent = await openWithPalette()
    await select('n-text')
    await act(async () => shellStore().setLocks([{ pageId: PAGE_ID, nodeId: 'n-box', userId: 'u-bora', userName: '보라' }]))
    search('Divider')
    await clickCard('Divider')
    expect(sent).toEqual([])
    expect(notice()).toBe(lockedNotice('보라'))
  })

  it('자식을 안 받는 부모의 잎 → 넣지 않음 · 자식 허용 문장', async () => {
    // 단추는 자식을 안 받는다 — 그 아래 잎이 있는 문서(검증 전 문서 · 카탈로그가 바뀐 옛 문서)에서 잎 뒤에 넣으면 단추 안이다.
    const sent = await openWithPalette(
      pageDoc({ id: 'n-root', type: 'Page', children: [{ id: 'n-btn', type: 'Button', children: [{ id: 'n-bt', type: 'Text' }] }] }),
    )
    await select('n-bt')
    search('Divider')
    await clickCard('Divider')
    expect(sent).toEqual([])
    expect(notice()).toBe(STRUCTURE_WHY_DISABLED.addInside)
  })

  it('거절 문장은 고른 노드가 바뀌면 걷히고, 앞 노드로 돌아와도 다시 서지 않는다', async () => {
    const sent = await openWithPalette()
    await select('n-text')
    await act(async () => shellStore().setLocks([{ pageId: PAGE_ID, nodeId: 'n-text', userId: 'u-bora', userName: '보라' }]))
    search('Divider')
    await clickCard('Divider')
    const refused = notice()
    await select('n-box')
    const moved = notice()
    // 잠금은 그대로면 n-text 로 못 돌아온다(고르기 = 잠금) — 걷고 돌아와 판(id)이 같아져도 다시 서지 않는지 본다.
    await act(async () => shellStore().setLocks([]))
    await select('n-text')
    const back = { selected: shellStore().getState().selectedNodeId, notice: notice() }
    expect({ refused, moved, back, sent }).toEqual({
      refused: lockedSelectionStatus('보라'),
      moved: '',
      back: { selected: 'n-text', notice: '' },
      sent: [],
    })
  })

  // L-021 — 더블클릭 · 연달아 친 Enter(`click` 의 `detail` 0) 의 둘째는 첫 넣기가 이미 한 일이다(머리말 «카드»).
  it('같은 카드를 더블클릭 간격 안에 다시 누르면 둘째는 넣지 않는다 · 다른 카드 · 간격 뒤의 같은 카드는 넣는다', async () => {
    const sent = await openWithPalette()
    await select(null)
    search('i')
    const now = vi.spyOn(performance, 'now')
    try {
      now.mockReturnValue(1_000)
      await clickCard('Divider')
      now.mockReturnValue(1_200)
      await clickCard('Divider')
      const afterRepeat = sent.length
      now.mockReturnValue(1_300)
      await clickCard('Link')
      const afterOther = sent.length
      now.mockReturnValue(1_300 + DOUBLE_CLICK_MS + 1)
      await clickCard('Link')
      expect({ afterRepeat, afterOther, afterLater: sent.length }).toEqual({ afterRepeat: 1, afterOther: 2, afterLater: 3 })
    } finally {
      now.mockRestore()
    }
  })

  it('거절된 누름은 «넣은 누름» 으로 안 적는다 — 풀린 뒤 곧바로 다시 누르면 넣는다', async () => {
    const sent = await openWithPalette()
    await select('n-text')
    await act(async () => shellStore().setLocks([{ pageId: PAGE_ID, nodeId: 'n-text', userId: 'u-bora', userName: '보라' }]))
    search('Divider')
    const now = vi.spyOn(performance, 'now')
    try {
      now.mockReturnValue(5_000)
      await clickCard('Divider')
      await act(async () => shellStore().setLocks([]))
      now.mockReturnValue(5_100)
      await clickCard('Divider')
      expect({ refusedThenAdded: sent.length }).toEqual({ refusedThenAdded: 1 })
    } finally {
      now.mockRestore()
    }
  })

  it('거절 문장은 다음 넣기가 걷는다', async () => {
    const sent = await openWithPalette()
    await select('n-text')
    await act(async () => shellStore().setLocks([{ pageId: PAGE_ID, nodeId: 'n-text', userId: 'u-bora', userName: '보라' }]))
    search('Divider')
    await clickCard('Divider')
    expect(notice()).not.toBe('')
    await act(async () => shellStore().setLocks([]))
    await clickCard('Divider')
    expect(sent).toHaveLength(1)
    expect(notice()).toBe('')
  })
})
