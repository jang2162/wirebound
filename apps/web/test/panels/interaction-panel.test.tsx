/**
 * 우측의 상호작용 탭(설계서 「설계서 화면 구조」의 셋째 탭 · 「모델」의 저작 · 「자동 문장화」의 문장).
 *
 * **노드를 고르는 일은 구조 트리를 눌러서 한다** — 스토어를 직접 건드리지 않는 것은
 * 의도다(속성 패널 케이스와 같은 근거). 사용자가 실제로 지나는 길이 이어져 있는지 함께 본다.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { validatePage, type PageDocument, type PatchOp } from '@wirebound/schema'
import { ApiError, type ApiClient } from '../../src/api/client'
import type { PatchResult } from '../../src/api/types'
import { deselect, openPage, PAGE_ID, pageDetail, pageDoc } from '../editor-harness'
import '../../src/catalog-setup'
import { structureRowName } from './tree-row'

/** 버튼 하나와 그리드 하나. 버튼이 트리거, 그리드가 타겟이다. */
const DOC = pageDoc({
  id: 'n-root',
  type: 'Page',
  children: [
    { id: 'n-btn', type: 'Button', props: { label: '검색' }, marker: 1 },
    { id: 'n-list', type: 'DataGrid', marker: 2 },
    {
      id: 'n-tabs',
      type: 'Tabs',
      children: [
        { id: 'n-tab-basic', type: 'TabPanel', props: { label: '기본정보' } },
        { id: 'n-tab-detail', type: 'TabPanel', props: { label: '상세정보' } },
      ],
    },
  ],
})

/** 이미 규칙이 하나 걸려 있는 문서. 설계서 「자동 문장화」의 첫째 예와 같은 모양이다. */
const DOC_WITH_RULE = pageDoc({
  id: 'n-root',
  type: 'Page',
  children: [
    {
      id: 'n-btn',
      type: 'Button',
      props: { label: '검색' },
      marker: 1,
      interactions: [{ on: 'click', actions: [{ type: 'setProp', target: 'n-list', prop: 'loading', value: true }] }],
    },
    { id: 'n-list', type: 'DataGrid', marker: 2 },
  ],
})

/** 편집이 실제로 나가는지 보는 자리 — 속성 패널 케이스의 같은 이름 헬퍼와 같다. */
function editable(): { calls: { ops: PatchOp[] }[]; api: Partial<ApiClient> } {
  const calls: { ops: PatchOp[] }[] = []
  let seq = 7
  const patchOps: ApiClient['patchOps'] = async (_projectId, _pageId, body) => {
    calls.push({ ops: body.ops })
    seq += 1
    const result: PatchResult = {
      seq,
      revisionId: `rev-${seq}`,
      inverse: [],
      schemaVersion: 1,
      ...(body.clientOpId === undefined ? {} : { clientOpId: body.clientOpId }),
    }
    return result
  }
  return { calls, api: { patchOps } }
}

async function openInteractionTab(): Promise<void> {
  fireEvent.click(screen.getByRole('tab', { name: '상호작용' }))
  await waitFor(() => expect(screen.getByRole('tab', { name: '상호작용' }).getAttribute('aria-selected')).toBe('true'))
}

/** 구조 트리에서 노드를 고른다. */
function selectNode(type: string): void {
  const list = document.body.querySelector('.wb-shell-structure-list')
  if (list === null) throw new Error('구조 트리 목록이 없습니다')
  fireEvent.click(within(list as HTMLElement).getByRole('button', { name: structureRowName(type) }))
}

/** 패널이 그린 문장들. 저작 자리의 문장과 목록의 문장이 모두 들어온다. */
function sentences(): string[] {
  return [...document.body.querySelectorAll('.wb-shell-interaction-sentence')].map((element) => element.textContent?.trim() ?? '')
}

describe('상호작용 탭 — 자리', () => {
  it('노드를 고르지 않으면 그렇다고 말한다', async () => {
    await openPage(DOC)
    // **고른 것이 없는 상태를 손으로 만든다.** 페이지를 열면 스토어가 루트를 고른 채로
    // 시작하므로(`store/editor-store.ts`의 `#selectionFor`), 그냥 열어서는 이 케이스가 재려는
    // 상태가 아니다. 캔버스 빈 자리를 누르는 것이 사용자가 그 상태에 이르는 길이다.
    deselect()
    await openInteractionTab()

    expect(screen.getByText('상호작용을 걸 노드를 캔버스나 구조 트리에서 고르세요')).toBeTruthy()
  })

  /**
   * **규칙 목록은 노드를 고르지 않아도 보인다** — 코멘트 탭도 같은 판정을 따른다.
   * 탭의 쓸모가 *"이 설계서에 어떤 규칙이 걸려 있는가"*를 훑는 것이기 때문이다.
   */
  it('노드를 고르지 않아도 이 페이지의 규칙이 보인다', async () => {
    await openPage(DOC_WITH_RULE)
    // **고른 것이 없는 상태를 손으로 만든다.** 페이지를 열면 스토어가 루트를 고른 채로
    // 시작하므로(`store/editor-store.ts`의 `#selectionFor`), 그냥 열어서는 이 케이스가 재려는
    // 상태가 아니다. 캔버스 빈 자리를 누르는 것이 사용자가 그 상태에 이르는 길이다.
    deselect()
    await openInteractionTab()

    expect(sentences()).toContain('① 검색 버튼 클릭 시 ② 그리드가 로딩 상태로 바뀝니다')
  })

  it('규칙이 하나도 없으면 그렇다고 말한다', async () => {
    await openPage(DOC)
    await openInteractionTab()

    expect(screen.getByText('아직 상호작용이 없습니다')).toBeTruthy()
  })
})

/**
 * **설계서 「모델」(상호작용)의 고정 6종을 화면이 그대로 보인다.** *"스크립트나 표현식은 허용하지
 * 않는다"*를 화면에서 지키는 자리다 — 자유 입력으로 규칙을 적을 길이 없어야 한다.
 */
describe('상호작용 탭 — 고정 6종 · 4종을 화면이 보인다', () => {
  async function openWithRule(): Promise<void> {
    await openPage(DOC_WITH_RULE)
    await openInteractionTab()
    selectNode('Button')
  }

  it('트리거 선택지가 상호작용 모델의 4종이다', async () => {
    await openWithRule()

    const select = screen.getByLabelText('트리거') as HTMLSelectElement
    expect([...select.options].map((option) => option.textContent)).toEqual(['클릭', '변경', '선택', '제출'])
  })

  it('액션 선택지가 상호작용 모델의 6종이다', async () => {
    await openWithRule()

    const group = screen.getByRole('group', { name: '액션 1' })
    const select = within(group).getByLabelText('종류') as HTMLSelectElement
    expect([...select.options].map((option) => option.textContent)).toEqual([
      '속성 바꾸기',
      '보이기·숨기기',
      '탭 전환',
      '페이지 이동',
      '팝업 열기',
      '팝업 닫기',
    ])
  })

  /**
   * **노드 타겟은 목록에서 고른다.** 자유 입력이면 사용자가 노드 id를 손으로
   * 적어야 하고, 그러면 오타가 곧 끊긴 규칙이 된다.
   */
  it('노드 타겟은 문서의 노드 목록에서 고른다', async () => {
    await openWithRule()

    const select = screen.getByLabelText('대상') as HTMLSelectElement
    expect([...select.options].map((option) => option.textContent)).toEqual(['— 대상을 고르세요 —', '페이지', '① 검색 버튼', '② 그리드'])
  })

  /**
   * **패널 머리 · 접근 이름 · 대상 고르개는 문장과 같은 이름이다** — 상태 가지 안 노드는 그 상태를 붙인다(K1 리뷰 R4). 안 붙이면 고르개의
   * «검색 버튼» 둘(기본 · 관리자)이 같은 글이 된다.
   */
  it('`only` 보임의 노드는 패널 머리 · 대상 고르개에서 그 상태를 붙인다 — 여럿은 잇고 · `except` 는 안 붙인다', async () => {
    await openPage({
      ...pageDoc({
        id: 'n-root',
        type: 'Page',
        children: [
          { id: 'n-list', type: 'DataGrid', visibility: { mode: 'except', states: ['s_guest'] } },
          {
            id: 'n-btn',
            type: 'Button',
            props: { label: '검색' },
            visibility: { mode: 'only', states: ['s_admin'] },
            interactions: [{ on: 'click', actions: [{ type: 'setProp', target: 'n-list', prop: 'loading', value: true }] }],
          },
          { id: 'n-ok', type: 'Button', props: { label: '승인' }, visibility: { mode: 'only', states: ['s_admin', 's_guest'] } },
        ],
      }),
      viewStates: [
        { id: 's_admin', name: '관리자' },
        { id: 's_guest', name: '손님' },
      ],
    })
    await openInteractionTab()
    // 숨은 노드도 구조 트리 줄로 고른다(흐리게 선다) — 지금 상태(기본)에서 «검색»은 숨어 있다. 버튼이 둘이라 첫 줄을 고른다.
    const list = document.body.querySelector<HTMLElement>('.wb-shell-structure-list')!
    fireEvent.click(within(list).getAllByRole('button', { name: structureRowName('Button') })[0]!)

    const section = screen.getByRole('region', { name: "'검색 버튼'(관리자 상태)의 상호작용" })
    expect(within(section).getByRole('heading', { level: 3 }).textContent).toBe("'검색 버튼'(관리자 상태)")
    const select = screen.getByLabelText('대상') as HTMLSelectElement
    const labels = [...select.options].map((option) => option.textContent)
    expect(labels).toContain("'검색 버튼'(관리자 상태)")
    expect(labels).toContain("'승인 버튼'(관리자 · 손님 상태)")
    expect(labels).toContain('그리드')
  })

  /** **`setProp`의 속성도 목록이다** — 카탈로그의 `editor`에서 온다(속성 패널과 같은 출처). */
  it('setProp의 속성은 타겟 컴포넌트의 editor 목록이다', async () => {
    await openWithRule()

    const select = screen.getByLabelText('속성') as HTMLSelectElement
    expect([...select.options].map((option) => option.textContent)).toContain('로딩 상태')
    expect([...select.options].map((option) => option.textContent)).toContain('고정 열 수')
  })
})

/**
 * **설계서 「자동 문장화」의 문장이 저작 자리에 함께 있다.** 규칙을 만드는 사람이 그것이 설계서에서 어떻게
 * 읽히는지를 그 자리에서 본다.
 */
describe('상호작용 탭 — 문장', () => {
  it('저작 중인 규칙의 문장이 보인다', async () => {
    await openPage(DOC_WITH_RULE)
    await openInteractionTab()
    selectNode('Button')

    // 저작 자리와 목록 둘 다 같은 문장을 낸다 — 만드는 함수가 하나이기 때문이다.
    expect(sentences().filter((text) => text === '① 검색 버튼 클릭 시 ② 그리드가 로딩 상태로 바뀝니다')).toHaveLength(2)
  })

  /**
   * **아직 타겟을 안 고른 액션을 *"사라진 노드"*라고 말하지 않는다**(화면이 말하는 것이 실제 상태와 어긋나는 부류).
   * 액션을 막 더한 상태이지 무엇이 없어진 것이 아니다.
   */
  it('액션을 막 더하면 "아직 고르지 않은 대상"이라고 말한다', async () => {
    const { api } = editable()
    await openPage(DOC, { apiOverrides: api })
    await openInteractionTab()
    selectNode('Button')

    fireEvent.click(screen.getByRole('button', { name: '상호작용 추가' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '규칙 1에 액션 추가' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '규칙 1에 액션 추가' }))

    await waitFor(() => expect(sentences()).toContain('① 검색 버튼 클릭 시 아직 고르지 않은 대상이 숨겨집니다'))
  })
})

/**
 * **저작이 편집 파이프라인을 지난다.** 새 계약을 만들지 않는다는 것을
 * **나가는 요청으로** 확인한다 — `PATCH .../ops`이고 경로가 노드 봉투의 `interactions`다.
 */
describe('상호작용 탭 — 편집 파이프라인', () => {
  it('상호작용을 더하면 ops가 나간다', async () => {
    const { calls, api } = editable()
    await openPage(DOC, { apiOverrides: api })
    await openInteractionTab()
    selectNode('Button')

    fireEvent.click(screen.getByRole('button', { name: '상호작용 추가' }))

    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]!.ops).toEqual([{ op: 'add', path: '/root/children/0/interactions', value: [{ on: 'click', actions: [] }] }])
  })

  it('규칙을 지우면 키째 사라진다', async () => {
    const { calls, api } = editable()
    await openPage(DOC_WITH_RULE, { apiOverrides: api })
    await openInteractionTab()
    selectNode('Button')

    fireEvent.click(screen.getByRole('button', { name: '규칙 1 삭제' }))

    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]!.ops).toEqual([{ op: 'remove', path: '/root/children/0/interactions' }])
  })

  it('트리거를 바꾸면 그 규칙만 갈린다', async () => {
    const { calls, api } = editable()
    await openPage(DOC_WITH_RULE, { apiOverrides: api })
    await openInteractionTab()
    selectNode('Button')

    fireEvent.change(screen.getByLabelText('트리거'), { target: { value: 'submit' } })

    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]!.ops).toEqual([
      {
        op: 'replace',
        path: '/root/children/0/interactions',
        value: [{ on: 'submit', actions: [{ type: 'setProp', target: 'n-list', prop: 'loading', value: true }] }],
      },
    ])
  })

  /**
   * **액션 타입을 바꾸면 앞 타입의 필드가 남지 않는다.** 남으면 `InteractionActionSchema`가
   * `strictObject`라 서버가 그 문서를 400/422로 거절한다 — 그 문서로 검증을 돌려 확인한다.
   */
  it('액션 타입을 바꾸면 앞 타입의 필드가 남지 않는다', async () => {
    const { calls, api } = editable()
    await openPage(DOC_WITH_RULE, { apiOverrides: api })
    await openInteractionTab()
    selectNode('Button')

    const group = screen.getByRole('group', { name: '액션 1' })
    fireEvent.change(within(group).getByLabelText('종류'), { target: { value: 'navigate' } })

    await waitFor(() => expect(calls).toHaveLength(1))
    const value = (calls[0]!.ops[0] as { value: unknown[] }).value
    expect(value).toEqual([{ on: 'click', actions: [{ type: 'navigate', target: '' }] }])

    // 그 문서가 실제로 봉투 검증을 통과하는가 — `prop`이 남아 있으면 `bad-document`다.
    const next: PageDocument = {
      version: 1,
      root: {
        ...DOC_WITH_RULE.root,
        children: [{ ...DOC_WITH_RULE.root.children![0]!, interactions: value as never }, DOC_WITH_RULE.root.children![1]!],
      },
    }
    expect(validatePage(next).filter((issue) => issue.code === 'bad-document')).toEqual([])
  })
})

/**
 * **`setProp`의 숫자 «값» 칸이 무엇을 싣나**(`panels/interaction-panel.tsx`의 `ValueField`). 수가 아니면 친 글을 문자열 그대로
 * 보낸다 — 검증이 `invalid-interaction-prop`으로 말한다. **`Infinity`도 수가 아니다:** `Number('Infinity')`·`Number('1e999')`는
 * `NaN`이 아니라 `Infinity`라, 그대로 실으면 서버는 JSON 으로 `null`을 저장하고 로컬 문서만 `Infinity`를 든 채 조용히 갈린다
 * (재연결 재조회의 `sameJson`이 그제야 «다르다»로 다시 싣는다).
 */
describe('상호작용 탭 — 숫자 값 칸', () => {
  const DOC_NUMBER_RULE = pageDoc({
    id: 'n-root',
    type: 'Page',
    children: [
      {
        id: 'n-btn',
        type: 'Button',
        props: { label: '검색' },
        marker: 1,
        interactions: [{ on: 'click', actions: [{ type: 'setProp', target: 'n-list', prop: 'fixedColumns', value: 3 }] }],
      },
      { id: 'n-list', type: 'DataGrid', marker: 2 },
    ],
  })

  it.each([
    { typed: '7', sent: 7 },
    { typed: 'abc', sent: 'abc' },
    { typed: 'Infinity', sent: 'Infinity' },
    { typed: '1e999', sent: '1e999' },
    { typed: '-Infinity', sent: '-Infinity' },
  ])('«$typed» 를 치면 $sent 를 싣는다', async ({ typed, sent }) => {
    const { calls, api } = editable()
    await openPage(DOC_NUMBER_RULE, { apiOverrides: api })
    await openInteractionTab()
    selectNode('Button')

    const field = within(screen.getByRole('group', { name: '액션 1' })).getByLabelText('값')
    expect((field as HTMLInputElement).value).toBe('3')
    fireEvent.change(field, { target: { value: typed } })
    fireEvent.blur(field)

    await waitFor(() => expect(calls).toHaveLength(1))
    const value = (calls[0]!.ops[0] as { value: { actions: { value: unknown }[] }[] }).value
    expect(value[0]!.actions[0]!.value).toBe(sent)
  })
})

/**
 * **여기서 이 물음을 던진다** —*"실패했다고 말하는데 조작은 일어났다."*
 * 상호작용 저작에서 그 부류의 거울상은 **저장에 실패했는데 화면에는 내 규칙이 남아 있는
 * 것**이다.
 *
 * ---
 *
 * **실패 뒤에도 저작 자리가 남는다.** `recover`가 `loadPage`를 지나지만, `loadPage`는
 * **같은 페이지를 다시 싣는 경로에서는 선택을 건드리지 않는다**(`store/editor-store.ts`의
 * `#selectionFor` — 다른 페이지를 실을 때만 선택을 새로 정한다. 다른 페이지의 id가 남으면
 * 안 되기 때문이다). 재조회가 사용자의 자리를 뺏지 않는 것이 목적이고, 409 복구가 그 경로다.
 *
 * **그래서 *"문서가 유일한 진실"*이라는 패널 설계가 하중을 진다:**
 *
 * | 심은 것 | 이 케이스 |
 * |---|---|
 * | `NodeRules`가 규칙 목록을 `useState`로 들게 한다(초안을 든다) | **죽는다** |
 *
 * 실패 통지를 보면서 자기 규칙이 그대로 있는 화면이 곧 위 부류다. 아래 케이스가 그 자리를
 * 잡는다(목록이 서버 상태를 보인다).
 *
 * **이 하중은 선택이 살아남는 데 기댄다.** 같은 페이지 재조회가 선택을 `null`로 놓으면
 * `NodeRules`가 언마운트되어 초안을 들었더라도 함께 사라진다 — 그러면 위 변조는 이 목록
 * 단언으로는 안 잡힌다. 그 변화는 아래 케이스의 «저작 자리는 그대로다» 단언이 먼저 잡는다.
 */
describe('상호작용 탭 — 저장에 실패하면', () => {
  it('실패를 말하고, 저작 자리는 남은 채 문서가 서버 값으로 되돌아간다', async () => {
    const patchOps: ApiClient['patchOps'] = async () => {
      // 서버는 낡은 `baseSeq`에 **409 `conflict`**를 낸다(`ApiErrorCode`에 `stale`은 없다 —
      // 그렇게 적으면 타입체크가 잡는다).
      throw new ApiError(409, 'conflict', '페이지가 이미 변경되었습니다 (요청 baseSeq 7, 현재 9)')
    }
    // 재조회는 원래 문서를 그대로 준다 — 서버에는 내 편집이 없다.
    const getPage: ApiClient['getPage'] = async () => pageDetail(PAGE_ID, DOC)

    await openPage(DOC, { apiOverrides: { patchOps, getPage } })
    await openInteractionTab()
    selectNode('Button')

    fireEvent.click(screen.getByRole('button', { name: '상호작용 추가' }))

    // 실패를 말한다.
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('페이지가 이미 변경되었습니다'))
    // **저작 자리는 그대로다** — 재조회가 선택을 건드리지 않으므로(위 머리말) `NodeRules`가
    // 마운트된 채 남는다. 고르던 자리에서 바로 다시 시도할 수 있다는 뜻이다.
    expect(screen.getByRole('button', { name: '상호작용 추가' })).toBeTruthy()
    expect(screen.queryByText('상호작용을 걸 노드를 캔버스나 구조 트리에서 고르세요')).toBeNull()
    // **그리고 조작이 문서에 남아 있지 않다** — 목록이 서버 상태를 보인다. **이 단언이
    // 하중을 진다**: 패널이 규칙 목록을 자기 `useState`로 들었다면 문서만 되돌아가고
    // 화면에는 내 규칙이 남아, 사용자는 취소됐다는 알림을 보면서 그것을 본다.
    expect(screen.getByText('아직 상호작용이 없습니다')).toBeTruthy()
  })

  /**
   * **재조회까지 실패하는 갈래에서는 화면이 되돌아가지 않는다 — 이것도 위 머리말의 부류다.**
   *
   * `recover`의 `catch`는 **`loadPage`를 지나지 않는다.** 그러면 선택도 유지되고
   * (`NodeRules`가 언마운트되지 않는다) `failEdits`는 큐만 비우므로 **낙관적으로 적용된 내
   * 규칙이 문서에 그대로 남는다.** 위 케이스가 재는 갈래와 정반대다.
   *
   * **되돌릴 문서가 없다 — 그것이 이 갈래의 성질이다.** 서버 상태를 못 읽었으므로 무엇으로
   * 되돌릴지 모른다. 문서를 비우는 쪽은 고르지 않는다(사용자가 보고 있던 것을 통째로
   * 잃는다). **할 수 있는 정직한 일은 그 상태를 말하는 것뿐이고**, 그것이
   * `'diverged'`에 내리는 판정과 같은 형태다(*"서버엔 있는데 내 화면엔 없다 — 새로고침하면
   * 맞춰집니다"*).
   */
  it('재조회까지 실패하면 규칙이 화면에 남고, 저장되지 않았다고 말한다', async () => {
    const patchOps: ApiClient['patchOps'] = async () => {
      throw new ApiError(409, 'conflict', '페이지가 이미 변경되었습니다')
    }
    // **첫 호출은 페이지를 여는 것이다** — 그것까지 실패시키면 화면이 아예 안 뜬다
    // (`캔버스에 노드가 없습니다`로 걸린다). 재조회만 실패시킨다.
    let opened = false
    const getPage: ApiClient['getPage'] = async () => {
      if (!opened) {
        opened = true
        return pageDetail(PAGE_ID, DOC)
      }
      throw new ApiError(500, 'internal', '서버 오류')
    }

    await openPage(DOC, { apiOverrides: { patchOps, getPage } })
    await openInteractionTab()
    selectNode('Button')

    fireEvent.click(screen.getByRole('button', { name: '상호작용 추가' }))

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())

    // **저작 자리도 규칙도 남아 있다.** 선택이 풀리지 않는다.
    expect(screen.getByRole('button', { name: '규칙 1 삭제' })).toBeTruthy()

    // **그래서 화면이 그 사실을 말해야 한다** — 말하지 않으면 사용자는 저장된 줄 안다.
    const alert = screen.getByRole('alert').textContent ?? ''
    expect(alert).toContain('서버 오류')
    expect(alert).toContain('저장되지 않았습니다')
    expect(alert).toContain('새로고침')
  })
})
