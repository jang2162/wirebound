/**
 * 구조 트리 하단의 툴바(D4). 선택 노드 하나에 작동한다.
 *
 * **`<App />`을 라우트째 렌더한다**(`../editor-harness` 머리말). 툴바만 떼어 내면
 * "고른 노드"가 스토어를 지나는지, 편집이 P2b-2 파이프라인을 지나는지 재지 못한다 —
 * 이 태스크의 하중이 정확히 그 둘이다.
 *
 * **`undo하면 …`과 `편집이 실패하면 …`이 "새 파이프라인이 없다"는 주장의 하중이다.**
 * 그 둘이 없으면 구조 편집이 P2b-2의 낙관적 적용·직렬 전송·실패 수렴·undo를 실제로
 * 지나는지 아무도 모른다.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { PatchOp } from '@wirebound/schema'
import { ApiError, type ApiClient } from '../../src/api/client'
import type { PageDetail, PatchResult } from '../../src/api/types'
import {
  HEAD_SEQ,
  openPage,
  pageDetail,
  pageDoc,
  structureTypes,
} from '../editor-harness'
import '../../src/catalog-setup'

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
  return within(structureRegion()).getByRole('group', { name: '구조 편집' })
}

function toolButton(name: string): HTMLButtonElement {
  return within(toolbar()).getByRole<HTMLButtonElement>('button', { name })
}

/** 트리에서 노드 하나를 고른다. 줄 이름이 타입이므로 문서의 타입이 전부 달라야 한다. */
function select(type: string): void {
  fireEvent.click(within(structureRegion()).getByRole('button', { name: type }))
}

/** 지금 선택 표시가 붙은 줄의 이름. 표시가 없으면 `null`이다. */
function selectedType(): string | null {
  const marked = structureRegion().querySelector('.wb-shell-structure-node[aria-current="true"]')
  return marked?.textContent ?? null
}

/** 셸 상단의 되돌리기 버튼. */
function undoButton(): HTMLButtonElement {
  return within(screen.getByRole('group', { name: '편집 이력' })).getByRole<HTMLButtonElement>(
    'button',
    { name: '되돌리기' },
  )
}

/** 툴바 버튼 셋의 이름. Task 6이 여기에 둘을 더한다. */
const BUTTONS = ['삭제', '위로', '아래로']

describe('구조 툴바 — 삭제와 순서 이동', () => {
  it('노드를 고르지 않으면 버튼이 전부 비활성이다', async () => {
    await openPage(doc(), { apiOverrides: server().api })

    for (const name of BUTTONS) {
      expect(toolButton(name).disabled, name).toBe(true)
    }
  })

  it('비활성인 버튼이 왜 비활성인지 말한다', async () => {
    // **문안을 지어내지 않고 조건을 그대로 옮긴다.** 상태별로 다른 문장을 만들지 않는
    // 것은 판정이 두 벌이 되지 않게 하기 위해서다 — 판정은 `structureAbilities` 하나가
    // 하고(D3), 여기 있는 것은 "그 버튼이 활성이려면 무엇이 필요한가"뿐이다.
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
    // **D5.** `applyEdit`은 `selectedNodeId`를 건드리지 않으므로(P2b-2 이월 §4), 툴바가
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

    expect(toolButton('삭제').disabled).toBe(true)
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

    expect(toolButton('위로').disabled).toBe(true)
    expect(toolButton('아래로').disabled).toBe(false)
  })

  it('아래로 옮기면 형제 순서가 바뀐다', async () => {
    // **`index + 1`이 맞는지가 여기서 걸린다.** 웨이브 1이 잰 계약 — `moveNodeOps`의
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

    expect(toolButton('아래로').disabled).toBe(true)
    expect(toolButton('위로').disabled).toBe(false)
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
    // **P2b-2 파이프라인이 그대로 돈다는 증거다.** 되돌리기는 서버가 준 `inverse`를
    // 새 편집으로 되보내는 것이고(설계 §7.1), 그 `inverse`는 서버 대역이 자기 문서에서
    // 만든 값이다 — 클라이언트가 계산한 것이 아니다.
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
    // **D4 — 어떤 실패든 재조회로 수렴한다.** 낙관적으로 지운 노드가 서버 문서에서
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

  it('편집이 실패하면 선택이 지워진다', async () => {
    // **툴바가 옮긴 선택이 남지 않는다 — 재서 확인한 값이다.** 재조회는 `loadPage`를
    // 지나고, 그것이 문서·`headSeq`뿐 아니라 **선택까지** 서버 상태로 재설정한다
    // (P2b-2 이월 §1). 그래서 실패 뒤 선택은 부모(`Page`)가 아니라 **없음**이다.
    //
    // 이 케이스가 있는 이유: 이 값을 적어 두지 않으면 다음 사람이 "삭제 뒤 선택은
    // 부모"라는 D5만 보고 실패 경로에서도 부모일 것이라 읽는다. **두 경로가 갈린다.**
    const srv = server({ failAt: 1 })
    await openPage(doc(), { apiOverrides: srv.api })
    select('Card')

    fireEvent.click(toolButton('삭제'))

    await waitFor(() => expect(structureTypes()).toEqual(INITIAL_TYPES))
    expect(selectedType()).toBeNull()
  })
})
