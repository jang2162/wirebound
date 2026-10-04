/**
 * 구조 트리 하단의 툴바. 선택 노드 하나에 작동한다.
 *
 * **`<App />`을 라우트째 렌더한다**(`../editor-harness` 머리말). 툴바만 떼어 내면
 * "고른 노드"가 스토어를 지나는지, 편집이 기존 편집 파이프라인을 지나는지 재지 못한다 —
 * 이 툴바의 하중이 정확히 그 둘이다.
 *
 * **`undo하면 …`과 `편집이 실패하면 …`이 "새 파이프라인이 없다"는 주장의 하중이다.**
 * 그 둘이 없으면 구조 편집이 기존 편집 파이프라인의 낙관적 적용·직렬 전송·실패 수렴·undo를 실제로
 * 지나는지 아무도 모른다.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { PatchOp } from '@wirebound/schema'
import { ApiError, type ApiClient } from '../../src/api/client'
import type { PageDetail, PatchResult } from '../../src/api/types'
import {
  deselect,
  HEAD_SEQ,
  openPage,
  pageDetail,
  pageDoc,
  structureTypes,
} from '../editor-harness'
import '../../src/catalog-setup'
import { isOff, queryRowAction, treeTool, structureRowName, structureRowType } from './tree-row'

/**
 * 타입이 전부 다른 문서. **이름으로 노드를 고를 수 있어야** 순서가 바뀐 뒤에도 같은
 * 노드를 집는다 — 인덱스로 고르면 이 파일이 재려는 것(순서 변경) 때문에 케이스가
 * 서로를 흔든다.
 *
 * ```
 * n-root (Page)
 * ├ n-a   (Text)      첫 형제
 * ├ n-box (Card)      자식 둘 — 서브트리째 사라지는지 본다
 * │  ├ n-1 (Button)
 * │  └ n-2 (Link)
 * └ n-c   (Divider)   막내
 * ```
 */
function doc(): ReturnType<typeof pageDoc> {
  return pageDoc({
    id: 'n-root',
    type: 'Page',
    children: [
      { id: 'n-a', type: 'Text' },
      {
        id: 'n-box',
        type: 'Card',
        children: [
          { id: 'n-1', type: 'Button' },
          { id: 'n-2', type: 'Link' },
        ],
      },
      { id: 'n-c', type: 'Divider' },
    ],
  })
}

/** 처음 트리에 그려지는 줄. 순서 케이스가 이것과 대조한다. */
const INITIAL_TYPES = ['Page', 'Text', 'Card', 'Button', 'Link', 'Divider']

/** 서버가 준 실패 문장. 화면이 하드코딩할 리 없는 문자열이어야 한다. */
const SERVER_REASON = '문서가 이미 바뀌었습니다 [P2b3-409]'

interface Server {
  calls: { ops: PatchOp[]; baseSeq: number }[]
  api: Partial<ApiClient>
}

/**
 * **서버 대역이 진짜 `applyOps`·`invertOps`로 자기 문서를 든다**(`test/edit/undo-redo.test.tsx`와
 * 같은 이유). 손으로 적은 `inverse`를 쓰면 "클라이언트가 계산하지 않는다"를 재는 케이스가
 * 서버 것과 구별되지 않는다. 재조회(`getPage`)도 그 문서를 답하므로 **실패 뒤 수렴이
 * 서버가 실제로 든 상태로** 간다.
 */
function server(options: { failAt?: number } = {}): Server {
  const calls: { ops: PatchOp[]; baseSeq: number }[] = []
  let seq = HEAD_SEQ
  let held = doc()

  const patchOps: ApiClient['patchOps'] = async (_projectId, _pageId, body) => {
    calls.push({ ops: body.ops, baseSeq: body.baseSeq })
    if (options.failAt === calls.length) {
      throw new ApiError(409, 'conflict', SERVER_REASON)
    }
    const { applyOps, invertOps } = await import('@wirebound/schema')
    const inverse = invertOps(held, body.ops)
    held = applyOps(held, body.ops)
    seq += 1
    const result: PatchResult = {
      seq,
      revisionId: `rev-${seq}`,
      inverse,
      schemaVersion: 1,
      ...(body.clientOpId === undefined ? {} : { clientOpId: body.clientOpId }),
    }
    return result
  }

  const getPage: ApiClient['getPage'] = async (_projectId, pageId) => {
    const detail: PageDetail = { ...pageDetail(pageId, held), headSeq: seq }
    return detail
  }

  return { calls, api: { patchOps, getPage } }
}

function structureRegion(): HTMLElement {
  return screen.getByRole('region', { name: '구조 트리' })
}

function toolbar(): HTMLElement {
  // 옛 «구조 편집» 툴바 자리 — 줄 행동 · 고르개 · 상태줄이 트리 영역 안에 선다(`../panels/tree-row.ts`).
  return structureRegion()
}

function toolButton(name: string): HTMLElement {
  return treeTool(toolbar(), name)
}

/** 트리에서 노드 하나를 고른다. 줄 이름이 타입이므로 문서의 타입이 전부 달라야 한다. */
function select(type: string): void {
  fireEvent.click(within(structureRegion()).getByRole('button', { name: structureRowName(type) }))
}

/** 지금 선택 표시가 붙은 줄의 이름. 표시가 없으면 `null`이다. */
function selectedType(): string | null {
  const marked = structureRegion().querySelector('.wb-shell-structure-node[aria-current="true"]')
  return structureRowType(marked)
}

/** 셸 상단의 되돌리기 버튼. */
function undoButton(): HTMLButtonElement {
  return within(screen.getByRole('group', { name: '편집 이력' })).getByRole<HTMLButtonElement>(
    'button',
    { name: '되돌리기' },
  )
}

/** 툴바 버튼의 이름. 늘어나면 `버튼이 전부 비활성이다`가 새 버튼도 함께 본다. */
const BUTTONS = ['안에 추가', '아래 추가', '삭제', '위로', '아래로', '들여쓰기', '내어쓰기']

/**
 * `childType` 줄이 `parentType` 줄 **안에** 그려져 있는가.
 *
 * **계층 이동은 전위 순회 목록을 바꾸지 않는다** — 들여써도 순서가 그대로라
 * `structureTypes()`만으로는 `['Page','Card','Section',…]`이 양쪽에서 같다. 중첩을
 * 보지 않으면 "아무 일도 안 일어난 구현"이 통과한다.
 */
function isNestedIn(childType: string, parentType: string): boolean {
  const child = within(structureRegion()).getByRole('button', { name: structureRowName(childType) }).closest('li')
  const parent = within(structureRegion()).getByRole('button', { name: structureRowName(parentType) }).closest('li')
  if (child === null || parent === null) throw new Error('구조 트리의 줄이 목록 항목이 아닙니다')
  return parent.contains(child)
}

describe('구조 툴바 — 삭제와 순서 이동', () => {
  it('노드를 고르지 않으면 고른 줄이 없다 — 줄 행동은 줄마다 그 줄을 고르며 연다', async () => {
    await openPage(doc(), { apiOverrides: server().api })
    // **고른 것이 없는 상태를 손으로 만든다.** 페이지를 열면 스토어가 루트를 고른 채로
    // 시작하므로(`store/editor-store.ts`의 `#selectionFor`), 그냥 열어서는 이 케이스가 재려는
    // 상태가 아니다. 캔버스 빈 자리를 누르는 것이 사용자가 그 상태에 이르는 길이다.
    deselect()

    // 판정 일곱이 전부 꺼지는 상태(`structureAbilities`의 `NOTHING`) — 줄 행동으로는 그 상태의 항목에 닿지 않는다. 그 판정이 서는
    // 입구는 단축키이고(`./structure-keyboard.test.tsx`), 이유는 상태줄이 말한다(아래 «선택을 풀면 …»).
    expect(structureRegion().querySelectorAll('.wb-shell-tree-row-picked')).toHaveLength(0)
    expect(BUTTONS).toHaveLength(7)
  })

  it('비활성인 버튼이 왜 비활성인지 말한다', async () => {
    // **문안을 지어내지 않고 조건을 그대로 옮긴다.** 상태별로 다른 문장을 만들지 않는
    // 것은 판정이 두 벌이 되지 않게 하기 위해서다 — 판정은 `structureAbilities` 하나가
    // 하고, 여기 있는 것은 "그 버튼이 활성이려면 무엇이 필요한가"뿐이다.
    await openPage(doc(), { apiOverrides: server().api })

    expect(toolButton('삭제').title).toBe('루트가 아닌 노드를 고르세요')
    expect(toolButton('위로').title).toBe('앞에 형제가 있는 노드를 고르세요')
    expect(toolButton('아래로').title).toBe('뒤에 형제가 있는 노드를 고르세요')
  })

  it('할 수 있는 조작에는 이유를 붙이지 않는다', async () => {
    // 활성일 때 `title`이 남으면 버튼 이름과 겹쳐 읽힌다.
    await openPage(doc(), { apiOverrides: server().api })
    select('Text')

    expect(toolButton('삭제').title).toBe('')
  })

  it('삭제하면 트리에서 사라진다', async () => {
    // **낙관적 적용이 화면까지 온다.** 자식 둘도 함께 사라져야 한다 — 서브트리째다.
    await openPage(doc(), { apiOverrides: server().api })
    select('Card')

    fireEvent.click(toolButton('삭제'))

    await waitFor(() => expect(structureTypes()).toEqual(['Page', 'Text', 'Divider']))
  })

  it('삭제하면 서버로 remove op이 나간다', async () => {
    const srv = server()
    await openPage(doc(), { apiOverrides: srv.api })
    select('Card')

    fireEvent.click(toolButton('삭제'))

    await waitFor(() => expect(srv.calls).toHaveLength(1))
    expect(srv.calls[0]?.ops).toEqual([{ op: 'remove', path: '/root/children/1' }])
    expect(srv.calls[0]?.baseSeq).toBe(HEAD_SEQ)
  })

  it('삭제 뒤 선택이 부모로 옮겨진다', async () => {
    // `applyEdit`은 `selectedNodeId`를 건드리지 않으므로, 툴바가
    // 옮기지 않으면 선택이 **사라진 노드를 가리킨 채** 남는다 — 사용자는 트리에서 자기
    // 위치를 잃고, 속성 패널은 "노드를 고르면 속성이 보입니다"로 되돌아간다.
    await openPage(doc(), { apiOverrides: server().api })
    select('Card')
    expect(selectedType()).toBe('Card')

    fireEvent.click(toolButton('삭제'))

    await waitFor(() => expect(selectedType()).toBe('Page'))
  })

  it('안쪽 노드를 지우면 선택이 그 부모로 간다', async () => {
    // 위 케이스는 부모가 루트다. 부모가 루트가 아닌 자리도 지나가야 "항상 루트로
    // 보낸다"는 구현이 갈린다.
    await openPage(doc(), { apiOverrides: server().api })
    select('Button')

    fireEvent.click(toolButton('삭제'))

    await waitFor(() => expect(selectedType()).toBe('Card'))
  })

  it('루트는 삭제 버튼이 비활성이다', async () => {
    await openPage(doc(), { apiOverrides: server().api })
    select('Page')

    expect(isOff(toolButton('삭제'))).toBe(true)
    expect(toolButton('삭제').title).toBe('루트가 아닌 노드를 고르세요')
  })

  it('위로 옮기면 형제 순서가 바뀐다', async () => {
    await openPage(doc(), { apiOverrides: server().api })
    select('Card')

    fireEvent.click(toolButton('위로'))

    // Card가 Text 앞으로. 자식 둘이 따라간다.
    await waitFor(() =>
      expect(structureTypes()).toEqual(['Page', 'Card', 'Button', 'Link', 'Text', 'Divider']),
    )
  })

  it('위로 옮기면 move op이 나간다', async () => {
    const srv = server()
    await openPage(doc(), { apiOverrides: srv.api })
    select('Card')

    fireEvent.click(toolButton('위로'))

    await waitFor(() => expect(srv.calls).toHaveLength(1))
    expect(srv.calls[0]?.ops).toEqual([
      { op: 'move', from: '/root/children/1', path: '/root/children/0' },
    ])
  })

  it('첫 형제는 위로 버튼이 비활성이다', async () => {
    await openPage(doc(), { apiOverrides: server().api })
    select('Text')

    expect(isOff(toolButton('위로'))).toBe(true)
    expect(isOff(toolButton('아래로'))).toBe(false)
  })

  it('아래로 옮기면 형제 순서가 바뀐다', async () => {
    // **`index + 1`이 맞는지가 여기서 걸린다.** 잰 계약 — `moveNodeOps`의
    // `index`는 결과 배열에서의 자리다(`[A,B,C]`에서 A를 2로 주면 `[B,C,A]`).
    await openPage(doc(), { apiOverrides: server().api })
    select('Text')

    fireEvent.click(toolButton('아래로'))

    await waitFor(() =>
      expect(structureTypes()).toEqual(['Page', 'Card', 'Button', 'Link', 'Text', 'Divider']),
    )
  })

  it('아래로 옮기면 move op이 나간다', async () => {
    const srv = server()
    await openPage(doc(), { apiOverrides: srv.api })
    select('Text')

    fireEvent.click(toolButton('아래로'))

    await waitFor(() => expect(srv.calls).toHaveLength(1))
    expect(srv.calls[0]?.ops).toEqual([
      { op: 'move', from: '/root/children/0', path: '/root/children/1' },
    ])
  })

  it('막내는 아래로 버튼이 비활성이다', async () => {
    await openPage(doc(), { apiOverrides: server().api })
    select('Divider')

    expect(isOff(toolButton('아래로'))).toBe(true)
    expect(isOff(toolButton('위로'))).toBe(false)
  })

  it('옮겨도 선택이 그 노드에 남는다', async () => {
    // `applyEdit`이 선택을 건드리지 않는 성질이 여기서는 **이롭게** 작용한다 — 노드가
    // 옮겨져도 id가 그대로라 선택이 따라간다. 툴바가 이동에서 선택을 손대면 안 된다는
    // 뜻이기도 하다.
    await openPage(doc(), { apiOverrides: server().api })
    select('Text')

    fireEvent.click(toolButton('아래로'))

    await waitFor(() =>
      expect(structureTypes()).toEqual(['Page', 'Card', 'Button', 'Link', 'Text', 'Divider']),
    )
    expect(selectedType()).toBe('Text')
  })

  it('undo하면 삭제한 노드가 돌아온다', async () => {
    // **기존 편집 파이프라인이 그대로 돈다는 증거다.** 되돌리기는 서버가 준 `inverse`를
    // 새 편집으로 되보내는 것이고(설계서 「개인 undo/redo」), 그 `inverse`는 서버 대역이
    // 자기 문서에서 만든 값이다 — 클라이언트가 계산한 것이 아니다(「정방향 흐름」).
    const srv = server()
    await openPage(doc(), { apiOverrides: srv.api })
    select('Card')

    fireEvent.click(toolButton('삭제'))
    await waitFor(() => expect(structureTypes()).toEqual(['Page', 'Text', 'Divider']))

    await waitFor(() => expect(undoButton().disabled).toBe(false))
    fireEvent.click(undoButton())

    await waitFor(() => expect(structureTypes()).toEqual(INITIAL_TYPES))
    // 되보낸 것이 서버가 만든 `inverse`인지 본다 — 서브트리를 통째로 품은 `add` 하나다.
    await waitFor(() => expect(srv.calls).toHaveLength(2))
    expect(srv.calls[1]?.ops).toEqual([
      {
        op: 'add',
        path: '/root/children/1',
        value: {
          id: 'n-box',
          type: 'Card',
          children: [
            { id: 'n-1', type: 'Button' },
            { id: 'n-2', type: 'Link' },
          ],
        },
      },
    ])
  })

  it('편집이 실패하면 재조회로 되돌아간다', async () => {
    // **어떤 실패든 재조회로 수렴한다.** 낙관적으로 지운 노드가 서버 문서에서
    // 되살아나고, 사용자는 그 사실을 통지로 안다.
    const srv = server({ failAt: 1 })
    await openPage(doc(), { apiOverrides: srv.api })
    select('Card')

    fireEvent.click(toolButton('삭제'))

    // 낙관적으로는 사라졌다가…
    await waitFor(() => expect(structureTypes()).toEqual(['Page', 'Text', 'Divider']))
    // …서버 문서로 되돌아온다.
    await waitFor(() => expect(structureTypes()).toEqual(INITIAL_TYPES))
    expect(screen.getByRole('alert').textContent).toContain(SERVER_REASON)
  })

  it('편집이 실패해도 툴바가 옮긴 선택은 남는다 — 두 경로가 갈리지 않는다', async () => {
    // **실패 경로가 선택을 따로 손대지 않는다**는 것을 고정한다. `loadPage`가 같은 페이지를
    // 다시 싣는 경로에서는 선택을 건드리지 않으므로(`store/editor-store.ts`의 `#selectionFor` —
    // 사용자가 하지도 않은 재조회가 자리를 뺏지 않는다) 실패 뒤에도 «삭제 뒤 선택은 부모»
    // 그대로 **부모**다. 되돌아온 문서 위에서 사용자는 고르던 자리 곁에 그대로 있다.
    //
    // 재조회가 선택까지 비우면 여기가 `null`이 되어 «삭제 뒤 선택은 부모»와 실패 경로가 갈린다.
    const srv = server({ failAt: 1 })
    await openPage(doc(), { apiOverrides: srv.api })
    select('Card')

    fireEvent.click(toolButton('삭제'))

    await waitFor(() => expect(structureTypes()).toEqual(INITIAL_TYPES))
    // 삭제가 옮겨 둔 부모(`Page` — 이 문서의 루트)가 그대로다.
    expect(selectedType()).toBe('Page')
  })
})

// ---------------------------------------------------------------------------
// 계층 이동
// ---------------------------------------------------------------------------

/**
 * 계층 이동용 문서. **앞 형제의 종류가 케이스를 가른다.**
 *
 * ```
 * n-root  (Page)
 * ├ n-box   (Card)      many · children 키가 **없다** — 배열을 먼저 만드는 갈래를 탄다
 * ├ n-group (Section)   many · 자식 둘 — 서브트리가 따라가는지 본다
 * │  ├ n-1 (Button)
 * │  └ n-2 (Link)
 * ├ n-tail  (Divider)   앞 형제가 `many`라 들여쓸 수 있다
 * └ n-last  (Text)      앞 형제가 `none`이라 들여쓸 수 없다 — 들여쓰기의 핵심 제약
 * ```
 */
function nestDoc(): ReturnType<typeof pageDoc> {
  return pageDoc({
    id: 'n-root',
    type: 'Page',
    children: [
      { id: 'n-box', type: 'Card' },
      {
        id: 'n-group',
        type: 'Section',
        children: [
          { id: 'n-1', type: 'Button' },
          { id: 'n-2', type: 'Link' },
        ],
      },
      { id: 'n-tail', type: 'Divider' },
      { id: 'n-last', type: 'Text' },
    ],
  })
}

/** `nestDoc`의 서버 대역. 자기 문서를 들고 `inverse`를 만든다. */
function nestServer(): Server {
  const calls: { ops: PatchOp[]; baseSeq: number }[] = []
  let seq = HEAD_SEQ
  let held = nestDoc()

  const patchOps: ApiClient['patchOps'] = async (_projectId, _pageId, body) => {
    calls.push({ ops: body.ops, baseSeq: body.baseSeq })
    const { applyOps, invertOps } = await import('@wirebound/schema')
    const inverse = invertOps(held, body.ops)
    held = applyOps(held, body.ops)
    seq += 1
    const result: PatchResult = {
      seq,
      revisionId: `rev-${seq}`,
      inverse,
      schemaVersion: 1,
      ...(body.clientOpId === undefined ? {} : { clientOpId: body.clientOpId }),
    }
    return result
  }

  const getPage: ApiClient['getPage'] = async (_projectId, pageId) => {
    const detail: PageDetail = { ...pageDetail(pageId, held), headSeq: seq }
    return detail
  }

  return { calls, api: { patchOps, getPage } }
}

describe('구조 툴바 — 들여쓰기와 내어쓰기', () => {
  it('들여쓰면 앞 형제의 마지막 자식이 된다', async () => {
    await openPage(nestDoc(), { apiOverrides: nestServer().api })
    select('Divider')

    fireEvent.click(toolButton('들여쓰기'))

    // Divider가 Section 안으로. **전위 순회 목록은 그대로다** — 중첩으로만 보인다.
    await waitFor(() => expect(isNestedIn('Divider', 'Section')).toBe(true))
    expect(structureTypes()).toEqual(['Page', 'Card', 'Section', 'Button', 'Link', 'Divider', 'Text'])
  })

  it('들여쓰면 앞 형제의 뒤에 붙는다', async () => {
    // "마지막 자식"이 어디인지를 op으로 못박는다. 앞 형제(`n-group`)의 자식이 둘이므로
    // 인덱스는 2다 — **다른 배열이라 값을 뺀 것의 영향을 받지 않는다**(`moveNodeOps`의 계약).
    const srv = nestServer()
    await openPage(nestDoc(), { apiOverrides: srv.api })
    select('Divider')

    fireEvent.click(toolButton('들여쓰기'))

    await waitFor(() => expect(srv.calls).toHaveLength(1))
    expect(srv.calls[0]?.ops).toEqual([
      { op: 'move', from: '/root/children/2', path: '/root/children/1/children/2' },
    ])
  })

  it('앞 형제에 children 키가 없으면 배열을 먼저 만든다', async () => {
    // **`children` 키를 먼저 만드는 갈래가 화면에서 실제로 쓰이는 자리다.** `n-box`는
    // `children` 키가 없는 `Card`이고, 거기로 `move` 하나만 보내면 `applyOps`가
    // `경로를 찾을 수 없습니다`로 던지고, 로컬 적용이 던진 편집은 나가지 않는다(편집이 삼켜진다).
    const srv = nestServer()
    await openPage(nestDoc(), { apiOverrides: srv.api })
    select('Section')

    fireEvent.click(toolButton('들여쓰기'))

    await waitFor(() => expect(isNestedIn('Section', 'Card')).toBe(true))
    expect(srv.calls[0]?.ops).toEqual([
      { op: 'add', path: '/root/children/0/children', value: [] },
      { op: 'move', from: '/root/children/1', path: '/root/children/0/children/0' },
    ])
  })

  it('서브트리가 통째로 따라간다', async () => {
    await openPage(nestDoc(), { apiOverrides: nestServer().api })
    select('Section')

    fireEvent.click(toolButton('들여쓰기'))

    await waitFor(() => expect(isNestedIn('Section', 'Card')).toBe(true))
    // 자식 둘이 여전히 Section 안에 있고, 그 Section이 Card 안에 있다.
    expect(isNestedIn('Button', 'Section')).toBe(true)
    expect(isNestedIn('Link', 'Section')).toBe(true)
    expect(structureTypes()).toEqual(['Page', 'Card', 'Section', 'Button', 'Link', 'Divider', 'Text'])
  })

  it('앞 형제가 none이면 들여쓰기 버튼이 비활성이다', async () => {
    // **들여쓰기의 핵심 제약.** `n-last`의 앞 형제는 `Divider`이고 자식을 담을 수 없다 —
    // 들여쓰면 그 문서는 `children-not-allowed`로 검증에 걸린다.
    await openPage(nestDoc(), { apiOverrides: nestServer().api })
    select('Text')

    expect(isOff(toolButton('들여쓰기'))).toBe(true)
    expect(toolButton('들여쓰기').title).toBe('앞 형제가 자식을 담을 수 있어야 합니다')
  })

  it('첫 형제는 들여쓰기가 비활성이다', async () => {
    // 앞 형제가 아예 없다. `Card`가 `many`인데도 안 되는 것은 자기 자신 안으로는 갈 수
    // 없기 때문이고, 위 케이스와 이유가 다르다.
    await openPage(nestDoc(), { apiOverrides: nestServer().api })
    select('Card')

    expect(isOff(toolButton('들여쓰기'))).toBe(true)
  })

  it('내어쓰면 부모의 다음 형제가 된다', async () => {
    await openPage(nestDoc(), { apiOverrides: nestServer().api })
    select('Button')

    fireEvent.click(toolButton('내어쓰기'))

    await waitFor(() => expect(isNestedIn('Button', 'Section')).toBe(false))
    // **부모 "다음"이 어디인지가 여기서 걸린다.** Section 바로 뒤여야 한다 — 루트의
    // 끝이 아니다.
    expect(structureTypes()).toEqual(['Page', 'Card', 'Section', 'Link', 'Button', 'Divider', 'Text'])
  })

  it('내어쓰기는 부모 인덱스 + 1로 나간다', async () => {
    const srv = nestServer()
    await openPage(nestDoc(), { apiOverrides: srv.api })
    select('Button')

    fireEvent.click(toolButton('내어쓰기'))

    await waitFor(() => expect(srv.calls).toHaveLength(1))
    expect(srv.calls[0]?.ops).toEqual([
      { op: 'move', from: '/root/children/1/children/0', path: '/root/children/2' },
    ])
  })

  it('부모가 루트면 내어쓰기가 비활성이다', async () => {
    await openPage(nestDoc(), { apiOverrides: nestServer().api })
    select('Divider')

    expect(isOff(toolButton('내어쓰기'))).toBe(true)
    expect(toolButton('내어쓰기').title).toBe('부모가 루트가 아니어야 합니다')
  })

  it('들여쓴 뒤 내어쓰면 제자리로 돌아온다', async () => {
    // **왕복 대조 — 계층 이동의 핵심이다.** "부모의 **다음** 형제"의 인덱스를 손으로
    // 적으면 틀리기 쉽다. 한쪽만 맞아도 왕복은 어긋난다.
    await openPage(nestDoc(), { apiOverrides: nestServer().api })
    select('Divider')

    fireEvent.click(toolButton('들여쓰기'))
    await waitFor(() => expect(isNestedIn('Divider', 'Section')).toBe(true))

    fireEvent.click(toolButton('내어쓰기'))
    await waitFor(() => expect(isNestedIn('Divider', 'Section')).toBe(false))

    // 원래 자리는 Section **뒤**, Text **앞**이다.
    expect(structureTypes()).toEqual(['Page', 'Card', 'Section', 'Button', 'Link', 'Divider', 'Text'])
  })

  it('배열을 만드는 갈래도 트리가 제자리로 돌아온다', async () => {
    // 위 왕복은 `move` 하나짜리 갈래다. `children` 키를 만드는 두 op 갈래도 제자리로
    // 돌아오는지 본다 — 그쪽은 `add`와 `move`의 경로 기준이 다르다.
    //
    // **문서 수준의 왕복은 아니다.** 들여쓰기가 만든 `children: []`이
    // 내어쓴 뒤에도 남으므로 문서는 원본과 다르다(무해하다 — `children: []`은
    // `validatePage` 이슈가 0이다). **왕복하는 것은 트리 구조이고**, 이름이 그렇게
    // 말한다. `undo` 경로는 다르다: 그쪽은 서버가 만든 `inverse`가 `remove
    // /…/children`을 함께 보내 키까지 지운다(`undo하면 들여쓰기가 되돌아간다`).
    await openPage(nestDoc(), { apiOverrides: nestServer().api })
    select('Section')

    fireEvent.click(toolButton('들여쓰기'))
    await waitFor(() => expect(isNestedIn('Section', 'Card')).toBe(true))

    fireEvent.click(toolButton('내어쓰기'))
    await waitFor(() => expect(isNestedIn('Section', 'Card')).toBe(false))

    expect(structureTypes()).toEqual(['Page', 'Card', 'Section', 'Button', 'Link', 'Divider', 'Text'])
  })

  it('undo하면 들여쓰기가 되돌아간다', async () => {
    const srv = nestServer()
    await openPage(nestDoc(), { apiOverrides: srv.api })
    select('Section')

    fireEvent.click(toolButton('들여쓰기'))
    await waitFor(() => expect(isNestedIn('Section', 'Card')).toBe(true))

    await waitFor(() => expect(undoButton().disabled).toBe(false))
    fireEvent.click(undoButton())

    await waitFor(() => expect(isNestedIn('Section', 'Card')).toBe(false))
    // 되보낸 것이 서버가 만든 `inverse`인지 본다 — 두 op 갈래의 역은 둘이고,
    // **빈 `children`이 남지 않는다**.
    await waitFor(() => expect(srv.calls).toHaveLength(2))
    expect(srv.calls[1]?.ops).toEqual([
      { op: 'move', from: '/root/children/0/children/0', path: '/root/children/1' },
      { op: 'remove', path: '/root/children/0/children' },
    ])
  })
})

/**
 * **도구모음 아래 상태줄**(`src/panels/toolbar-status.ts`).
 *
 * 문안 표 자체는 `./toolbar-status.test.ts`가 갖는다 — 여기서 재는 것은 셋이다:
 * ㉠ 그 문장이 **화면에 서는가**(마우스를 올리지 않아도 보이는 자리인가), ㉡ **보조 기술이
 * 닿는가**(비활성 버튼은 탭 순서에서 빠지므로 *활성* 버튼의 설명이어야 한다), ㉢ **`title`이
 * 그대로 남는가**(상태줄은 대표 이유 하나를 말하고 나머지는 여전히 `title`에만 있다).
 */
function statusLine(): HTMLElement {
  const line = toolbar().querySelector<HTMLElement>('.wb-shell-structure-status')
  if (line === null) throw new Error('구조 트리에 상태줄이 없습니다')
  return line
}

describe('구조 툴바 — 상태줄', () => {
  it('페이지를 열면 왜 회색인지가 화면에 있다 — 마우스를 올리지 않아도', async () => {
    // 여는 순간이 곧 루트를 고른 상태다(`#selectionFor`). 도구 일곱 중 여섯이 꺼지는
    // 자리이고, 상태줄이 없으면 그 이유가 `title`에만 있다.
    await openPage(doc(), { apiOverrides: server().api })

    expect(statusLine().textContent).toBe('루트라 삭제·순서·계층을 바꿀 수 없습니다')
  })

  it('**활성 버튼이 그 문장을 자기 설명으로 든다** — 활성 버튼이 있을 때는 그쪽이 먼저다', async () => {
    // `disabled` 버튼은 포커스를 받지 못해 탭 순서에서 빠진다. 그래서 `title`이든
    // `aria-describedby`든 **비활성 버튼에 건 설명은 키보드 사용자에게 영영 안 읽힌다.**
    // 이 케이스가 재는 것은 그 반대편이다 — 지금 탭이 닿는 버튼(루트 상태에서 유일하게
    // 살아 있는 `안에 추가`)의 **접근 가능한 설명**이 상태줄 문장으로 계산되는가.
    //
    // **"그쪽뿐"은 아니다** — 판정 일곱이
    // **전부** 꺼지면 이 길이 통째로 끊긴다(아래 `선택을 풀면 …`). 여기서 재는 것은
    // *"활성 버튼이 있을 때 그 버튼이 문장을 든다"*까지다.
    await openPage(doc(), { apiOverrides: server().api })

    toolButton('안에 추가')
    const reachable = screen.getByRole('menuitem', {
      name: '안에 추가',
      description: '루트라 삭제·순서·계층을 바꿀 수 없습니다',
    })

    // 대조 둘. **켜져 있어야** 화살표가 닿고, 설명은 상태줄 **그 요소**에서 와야 한다.
    expect(isOff(reachable)).toBe(false)
    expect(reachable.getAttribute('aria-describedby')).toBe(statusLine().id)
  })

  it('비활성 버튼도 같은 것을 가리킨다 — 마우스는 그 버튼에 닿는다', async () => {
    await openPage(doc(), { apiOverrides: server().api })

    expect(toolButton('삭제').getAttribute('aria-describedby')).toBe(statusLine().id)
  })

  it('**`title`은 그대로 남는다** — 상태줄이 말하지 않은 여섯이 갈 곳은 거기뿐이다', async () => {
    // 상태줄은 *"고른 것이 무엇이라서"*를 하나만 말한다. 버튼마다의 조건은 결이 다르다.
    await openPage(doc(), { apiOverrides: server().api })

    expect(statusLine().textContent).toBe('루트라 삭제·순서·계층을 바꿀 수 없습니다')
    expect(toolButton('들여쓰기').title).toBe('앞 형제가 자식을 담을 수 있어야 합니다')
    expect(toolButton('내어쓰기').title).toBe('부모가 루트가 아니어야 합니다')
  })

  it('할 말이 없으면 비운다 — 그리고 그때는 가리키지도 않는다', async () => {
    // `Card`는 자식을 담고 앞뒤로 형제가 있다 — 무리가 통째로 죽은 것이 없다.
    await openPage(doc(), { apiOverrides: server().api })
    select('Card')

    expect(isOff(toolButton('안에 추가'))).toBe(false)
    expect(statusLine().textContent).toBe('')
    // **빈 요소를 가리키지 않는다** — 설명이 비어 있는 것이 아니라 관계만 남는다.
    expect(toolButton('삭제').getAttribute('aria-describedby')).toBeNull()
  })

  it('자리는 지킨다 — 문장이 없어도 요소가 남는다', async () => {
    // 상태가 바뀔 때마다 툴바 높이가 달라지면, 툴바가 `sticky`라 그 차이가 그대로 트리
    // 높이의 출렁임이 된다. 자리를 지키는 값은 CSS에 있고(`test/shell-css-status.test.ts`)
    // 여기서 재는 것은 **요소가 DOM에서 사라지지 않는다**는 쪽이다.
    await openPage(doc(), { apiOverrides: server().api })
    select('Card')

    expect(statusLine().textContent).toBe('')
    expect(toolbar().contains(statusLine())).toBe(true)
  })

  it('선택을 옮기면 문장이 따라 바뀐다', async () => {
    await openPage(doc(), { apiOverrides: server().api })
    expect(statusLine().textContent).toBe('루트라 삭제·순서·계층을 바꿀 수 없습니다')

    // `Text`는 자식을 담지 못한다 — 트리를 봐서는 알 수 없는 유일한 제약이라 사다리에서
    // 형제 자리보다 위다(`Text`는 맨 앞 형제이기도 하다).
    select('Text')

    expect(statusLine().textContent).toBe('자식을 담지 못하는 타입입니다')
  })

  it('아무것도 안 고르면 고르라고 말한다', async () => {
    await openPage(doc(), { apiOverrides: server().api })

    deselect()

    expect(statusLine().textContent).toBe('트리에서 노드를 고르면 편집할 수 있습니다')
  })

  it('**선택을 풀면 그 문장에 닿는 길이 상태줄 자신뿐이다** — 앱째로 잰다', async () => {
    // **켠 항목의 설명만으로는 닿지 않는 자리다.** 선택이 없으면 고른 줄이 없어 판정에 매인 항목에 닿을 길이 없고, 남는
    // 뿌리 `+`의 `패턴 넣기`·`프리셋`에는 **이 설명을 걸지 않는다**(선택이 없어도 되는 조작이라 없는 전제조건을 만든다).
    // 그래서 상태줄 자신이 탭 정지점이 아니면 이 상태에서 키보드가 문장에 **영영 못 닿는다.**
    //
    // 열두 상태의 표는 `./toolbar-status-reach.test.tsx`가 갖는다(상태줄만 떼어 렌더한다).
    // **여기서 재는 것은 그 상태가 진짜 앱에서 나온다는 쪽이다.**
    await openPage(doc(), { apiOverrides: server().api })
    deselect()

    const line = statusLine()
    expect(line.textContent).toBe('트리에서 노드를 고르면 편집할 수 있습니다')
    expect(line.tabIndex).toBe(0)
    // 뿌리 `+`의 둘은 설명이 없다 — 문장을 든 것은 상태줄 하나다.
    expect(toolButton('패턴 넣기').getAttribute('aria-describedby')).toBeNull()
    expect(toolButton('프리셋').getAttribute('aria-describedby')).toBeNull()
  })

  it('**알림 자리를 쓰지 않는다** — `role="alert"`도 `aria-live`도 아니다', async () => {
    // 이 셸의 알림 자리는 `EditAlert` 하나다(`shell/edit-alert.tsx`). 실패가 아닌 것에 그
    // 채널을 쓰면 그 하나뿐인 규칙이 흩어지고, `aria-live`를 걸면 **선택을 옮길 때마다
    // 읽혀 트리 탐색이 불가능해진다.**
    await openPage(doc(), { apiOverrides: server().api })

    const line = statusLine()
    expect(line.getAttribute('role')).toBeNull()
    expect(line.getAttribute('aria-live')).toBeNull()
  })
})
