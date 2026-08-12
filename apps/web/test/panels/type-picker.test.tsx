/**
 * 타입 목록과 노드 추가(Task 7). **`<App />`을 라우트째 렌더한다**(`../editor-harness`).
 *
 * **`페이지에 둘 수 있는 모든 타입이 목록에 있다`가 D6의 하중이다** — 분모를 손으로 적지
 * 않고 `listComponents()`에서 계산하므로, 카탈로그에 컴포넌트가 늘면 여기서 죽는다.
 * 그것이 "그룹 표를 손으로 두지 않는다"는 D6의 판단을 지키는 자리다.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  listComponents,
  validatePage,
  type PageDocument,
  type PatchOp,
} from '@wirebound/schema'
import { ApiError, type ApiClient } from '../../src/api/client'
import type { PageDetail, PatchResult } from '../../src/api/types'
import { HEAD_SEQ, openPage, pageDetail, pageDoc, structureTypes } from '../editor-harness'
import { createNode } from '../../src/edit/create-node'
import '../../src/catalog-setup'

/**
 * ```
 * n-root (Page)
 * ├ n-a   (Text)     none — `안에 추가`가 비활성이어야 한다
 * ├ n-box (Card)     many · 자식 하나
 * │  └ n-1 (Button)
 * ├ n-empty (Section) many · children 키가 **없다** — 배열째 add 갈래를 탄다
 * └ n-c   (Divider)
 * ```
 */
function doc(): PageDocument {
  return pageDoc({
    id: 'n-root',
    type: 'Page',
    children: [
      { id: 'n-a', type: 'Text' },
      { id: 'n-box', type: 'Card', children: [{ id: 'n-1', type: 'Button' }] },
      { id: 'n-empty', type: 'Section' },
      { id: 'n-c', type: 'Divider' },
    ],
  })
}

const INITIAL_TYPES = ['Page', 'Text', 'Card', 'Button', 'Section', 'Divider']

interface Server {
  calls: { ops: PatchOp[]; baseSeq: number }[]
  api: Partial<ApiClient>
}

function server(): Server {
  const calls: { ops: PatchOp[]; baseSeq: number }[] = []
  let seq = HEAD_SEQ
  let held = doc()

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

function structureRegion(): HTMLElement {
  return screen.getByRole('region', { name: '구조 트리' })
}

function toolButton(name: string): HTMLButtonElement {
  return within(within(structureRegion()).getByRole('group', { name: '구조 편집' })).getByRole(
    'button',
    { name },
  )
}

function select(type: string): void {
  fireEvent.click(within(structureRegion()).getByRole('button', { name: type }))
}

function selectedType(): string | null {
  return (
    structureRegion().querySelector('.wb-shell-structure-node[aria-current="true"]')?.textContent ??
    null
  )
}

/** 타입 목록. 열려 있지 않으면 던진다. */
function picker(): HTMLElement {
  return within(structureRegion()).getByRole('group', { name: '타입 고르기' })
}

function typeSelect(): HTMLSelectElement {
  return within(picker()).getByRole<HTMLSelectElement>('combobox', { name: '타입' })
}

/** 목록에 실린 타입 이름들. `value`를 보는 것은 보이는 글자에 표시가 붙기 때문이다. */
function optionValues(): string[] {
  return [...typeSelect().options].map((option) => option.value)
}

function pick(type: string): void {
  fireEvent.change(typeSelect(), { target: { value: type } })
  fireEvent.click(within(picker()).getByRole('button', { name: '추가' }))
}

function undoButton(): HTMLButtonElement {
  return within(screen.getByRole('group', { name: '편집 이력' })).getByRole<HTMLButtonElement>(
    'button',
    { name: '되돌리기' },
  )
}

/**
 * 페이지 문서에 둘 수 있는 타입. **손으로 적지 않는다** — 카탈로그를 훑어 실제로
 * `validatePage`를 통과하는 것만 남긴다(웨이브 1의 `페이지에 둘 수 없는 타입은 Slot뿐이다`와
 * 같은 계산이다).
 */
function placeableTypes(): string[] {
  return listComponents()
    .filter((def) => {
      const node = createNode(def.type, () => 'n-probe')
      if (node === null) return false
      return (
        validatePage({ version: 1, root: { id: 'r', type: 'Page', children: [node] } }).length === 0
      )
    })
    .map((def) => def.type)
}

describe('타입 목록과 노드 추가', () => {
  it('페이지에 둘 수 있는 모든 타입이 목록에 있다', async () => {
    // **D6의 하중이다.** 분모가 `listComponents()`에서 계산되므로 카탈로그에 컴포넌트가
    // 늘면 여기서 죽는다 — 그것이 "그룹 표를 손으로 두지 않는다"는 판단을 지킨다.
    await openPage(doc(), { apiOverrides: server().api })
    select('Card')
    fireEvent.click(toolButton('안에 추가'))

    expect(optionValues().slice().sort()).toEqual(placeableTypes().slice().sort())
    expect(optionValues().length).toBeGreaterThan(0)
  })

  it('페이지에 둘 수 없는 타입은 목록에 없다', async () => {
    // 웨이브 1이 잰 것: `Slot`은 어디에 넣어도 `slot-count`가 난다(설계 §4.4). 목록에
    // 두면 고르는 순간 서버가 422를 내므로 **보내 봐야 실패할 편집을 만들지 않는다**(D7).
    await openPage(doc(), { apiOverrides: server().api })
    select('Card')
    fireEvent.click(toolButton('안에 추가'))

    const blocked = listComponents()
      .map((def) => def.type)
      .filter((type) => !placeableTypes().includes(type))

    expect(blocked).toEqual(['Slot'])
    for (const type of blocked) {
      expect(optionValues(), type).not.toContain(type)
    }
  })

  it('목록은 이름순이다', async () => {
    // D6 — 카탈로그 파일의 분류(action·data·…)는 런타임에 없으므로 그것으로 나누지
    // 않는다. 이름순 한 목록이면 어디를 봐야 할지가 하나로 정해진다.
    await openPage(doc(), { apiOverrides: server().api })
    select('Card')
    fireEvent.click(toolButton('안에 추가'))

    expect(optionValues()).toEqual(optionValues().slice().sort())
  })

  it('자식을 담을 수 있는 타입이 표시된다', async () => {
    // **런타임 정보로 가르는 것은 D6이 허용한 것이다** — `def.children === 'many'`.
    // 이름과 표시를 갈라 두어야(`value`는 타입 이름, 보이는 글자에만 표시) 위 대조가
    // 표시 문구에 흔들리지 않는다.
    await openPage(doc(), { apiOverrides: server().api })
    select('Card')
    fireEvent.click(toolButton('안에 추가'))

    const many = new Set(
      listComponents().filter((def) => def.children === 'many').map((def) => def.type),
    )
    for (const option of typeSelect().options) {
      expect(option.textContent?.includes('담을 수 있음'), option.value).toBe(many.has(option.value))
    }
  })

  it('안에 추가로 고르면 선택 노드의 마지막 자식이 된다', async () => {
    await openPage(doc(), { apiOverrides: server().api })
    select('Card')
    fireEvent.click(toolButton('안에 추가'))
    pick('Text')

    // `n-box`의 자식이 둘이 되고 새 노드가 뒤다.
    await waitFor(() =>
      expect(structureTypes()).toEqual([
        'Page', 'Text', 'Card', 'Button', 'Text', 'Section', 'Divider',
      ]),
    )
  })

  it('아래 추가로 고르면 선택 노드의 다음 형제가 된다', async () => {
    await openPage(doc(), { apiOverrides: server().api })
    select('Card')
    fireEvent.click(toolButton('아래 추가'))
    pick('Link')

    // `n-box` **뒤**여야 한다 — 그 자식 뒤가 아니고 루트 끝도 아니다.
    await waitFor(() =>
      expect(structureTypes()).toEqual([
        'Page', 'Text', 'Card', 'Button', 'Link', 'Section', 'Divider',
      ]),
    )
  })

  it('추가하면 add op이 나간다', async () => {
    const srv = server()
    await openPage(doc(), { apiOverrides: srv.api })
    select('Card')
    fireEvent.click(toolButton('안에 추가'))
    pick('Text')

    await waitFor(() => expect(srv.calls).toHaveLength(1))
    const ops = srv.calls[0]?.ops
    expect(ops).toHaveLength(1)
    expect(ops?.[0]?.op).toBe('add')
    expect(ops?.[0]?.path).toBe('/root/children/1/children/1')
  })

  it('children 키가 없는 컨테이너에는 배열째 add한다', async () => {
    // **웨이브 1이 잰 갈래다.** `createNode`가 `children`을 만들지 않으므로 새로 만든
    // 컨테이너는 전부 이 경로를 지난다 — 그것이 Task 7에서 처음 실제로 쓰인다.
    const srv = server()
    await openPage(doc(), { apiOverrides: srv.api })
    select('Section')
    fireEvent.click(toolButton('안에 추가'))
    pick('Text')

    await waitFor(() => expect(srv.calls).toHaveLength(1))
    expect(srv.calls[0]?.ops).toEqual([
      { op: 'add', path: '/root/children/2/children', value: expect.objectContaining({}) },
    ])
    // 값이 배열이어야 한다 — 노드 하나를 그대로 놓으면 `children`이 노드가 된다.
    expect(Array.isArray((srv.calls[0]?.ops[0] as { value: unknown }).value)).toBe(true)
  })

  it('추가한 노드가 선택된다', async () => {
    // 사용자가 방금 만든 것을 바로 편집할 수 있어야 한다.
    await openPage(doc(), { apiOverrides: server().api })
    select('Card')
    fireEvent.click(toolButton('안에 추가'))
    pick('Link')

    await waitFor(() => expect(selectedType()).toBe('Link'))
  })

  it('추가한 노드에 속성 패널이 그 타입의 필드를 보인다', async () => {
    // **P2b-2와 이어진다는 증거다** — 새로 만든 노드가 카탈로그의 `editor` 명세를 지나
    // 위젯으로 그려진다.
    await openPage(doc(), { apiOverrides: server().api })
    select('Card')
    fireEvent.click(toolButton('안에 추가'))
    pick('Link')

    const panel = screen.getByRole('complementary', { name: '우측 패널' })
    await waitFor(() => expect(within(panel).getByRole('heading').textContent).toBe('Link'))
    expect(within(panel).getByLabelText('라벨')).toBeTruthy()
  })

  it('취소하면 아무것도 나가지 않는다', async () => {
    // **양성 대조다.** 없으면 늘 보내는 구현이 통과한다.
    const srv = server()
    await openPage(doc(), { apiOverrides: srv.api })
    select('Card')
    fireEvent.click(toolButton('안에 추가'))
    fireEvent.change(typeSelect(), { target: { value: 'Text' } })

    fireEvent.click(within(picker()).getByRole('button', { name: '취소' }))

    expect(srv.calls).toHaveLength(0)
    expect(structureTypes()).toEqual(INITIAL_TYPES)
    // 목록이 닫힌다 — 열린 채 남으면 취소가 아무 일도 안 한 것으로 보인다.
    expect(within(structureRegion()).queryByRole('group', { name: '타입 고르기' })).toBeNull()
  })

  it('children이 none인 노드에는 안에 추가가 비활성이다', async () => {
    await openPage(doc(), { apiOverrides: server().api })
    select('Text')

    expect(toolButton('안에 추가').disabled).toBe(true)
    expect(toolButton('안에 추가').title).toBe(
      '자식을 담을 수 있는 타입이어야 하고, children이 배열이어야 합니다',
    )
  })

  it('루트는 아래 추가가 비활성이다', async () => {
    // 루트에는 형제가 없다. 안에 추가는 되어야 한다(`Page`는 `many`다).
    await openPage(doc(), { apiOverrides: server().api })
    select('Page')

    expect(toolButton('아래 추가').disabled).toBe(true)
    expect(toolButton('안에 추가').disabled).toBe(false)
  })

  it('undo하면 추가한 노드가 사라진다', async () => {
    const srv = server()
    await openPage(doc(), { apiOverrides: srv.api })
    select('Card')
    fireEvent.click(toolButton('안에 추가'))
    pick('Text')

    await waitFor(() => expect(structureTypes()).toHaveLength(INITIAL_TYPES.length + 1))
    await waitFor(() => expect(undoButton().disabled).toBe(false))
    fireEvent.click(undoButton())

    await waitFor(() => expect(structureTypes()).toEqual(INITIAL_TYPES))
    // 서버가 만든 `inverse`가 되보내진다 — 배열 자리의 `add`이므로 `remove` 하나다.
    await waitFor(() => expect(srv.calls).toHaveLength(2))
    expect(srv.calls[1]?.ops).toEqual([{ op: 'remove', path: '/root/children/1/children/1' }])
  })

  it('고른 것이 없으면 추가 버튼이 둘 다 비활성이다', async () => {
    await openPage(doc(), { apiOverrides: server().api })

    expect(toolButton('안에 추가').disabled).toBe(true)
    expect(toolButton('아래 추가').disabled).toBe(true)
  })
})
