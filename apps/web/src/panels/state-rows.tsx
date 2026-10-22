/**
 * **메뉴 트리의 상태 줄** — 페이지 줄 아래에 그 페이지의 화면 상태가 트리로 선다(`viewStateOrder` — 트리 차례 · 하위 상태는 깊이만큼 들여 쓴다).
 * 페이지 줄이 접히면 함께 접힌다(`./menu-tree.tsx`). **고르기만 한다** — 상태를 더하고 고치고 지우는 입구는 우측 «페이지 정보» 탭이다
 * (`./page-states.tsx`).
 *
 * | 무엇 | 어떻게 |
 * |---|---|
 * | 목록 | 열린 페이지는 **열린 문서**(실시간 — 남이 더한 상태가 곧바로 선다), 다른 페이지는 **트리 응답**(`TreePage.viewStates` — 트리를 다시 읽을 때 따라온다) |
 * | 누르기 | 그 페이지를 열고 그 상태를 고른다 — 열린 페이지면 상태만 바꾸고(`useViewState` 의 `choose`), 다른 페이지면 주소 `?state=` 로 연다(`shell/view-state-address.ts` 가 열 때 읽는다) |
 * | 켜짐 | 지금 고른 상태의 줄 — `aria-current` |
 *
 * **상태 줄은 메뉴 트리의 줄(`[data-tree-row]`)이 아니다** — 표지가 `data-state-row` 다. 메뉴 트리의 선택 · 단축키 · 끌어 놓기 · ↑ ↓ 는 메뉴와
 * 페이지의 것이라(`tree/tree-actions.ts` 의 `TreeSelection`) 상태 줄은 거기 들지 않는다 — 상태 줄에서 친 `Delete` 가 고른 메뉴 · 페이지의
 * 삭제 확인을 걸지 않게 트리 상자가 그 키를 지나보낸다(`./menu-tree.tsx` 의 `handleKeyDown`).
 */
import type { ReactElement } from 'react'
import { Link, useNavigate } from 'react-router'
import { viewStateOrder, type ViewState } from '@wirebound/schema'
import type { TreePage } from '../api/types'
import { useViewState } from '../shell/use-view-state'
import { useOpenDocument } from '../store/use-editor-store'

const NO_STATES: readonly ViewState[] = []

/** 그 페이지의 상태 목록 — 열린 페이지는 열린 문서, 아니면 트리 응답(머리말 표). 열린 문서면 `open` 이 참이다. */
export function usePageStates(page: TreePage): { states: readonly ViewState[]; open: boolean } {
  const document = useOpenDocument(page.id)
  if (document !== null) return { states: Array.isArray(document.viewStates) ? document.viewStates : NO_STATES, open: true }
  return { states: Array.isArray(page.viewStates) ? page.viewStates : NO_STATES, open: false }
}

export function StateRows(props: {
  projectId: string
  page: TreePage
  /** 상태 줄을 누를 때 — 메뉴 트리의 고른 줄을 주소로 푼다(페이지 링크의 누름과 같다). */
  onPick: () => void
}): ReactElement | null {
  const { page } = props
  const { states, open } = usePageStates(page)
  const choice = useViewState(page.id)
  const navigate = useNavigate()
  const order = viewStateOrder(states)
  if (order.length === 0) return null

  const href = (stateId: string): string => `/projects/${props.projectId}/pages/${page.id}?state=${encodeURIComponent(stateId)}`
  /** 그 상태를 고른다 — 열린 페이지면 상태만, 아니면 그 상태의 주소로 연다(머리말 표). */
  const choose = (stateId: string): void => {
    props.onPick()
    if (open) choice.choose(stateId)
    else void navigate(href(stateId))
  }

  return (
    <ul className="wb-shell-tree-list" aria-label={`${page.title} 화면 상태`}>
      {order.map(({ state, depth }) => {
        const current = open && choice.state === state.id
        return (
          <li key={state.id}>
            <div
              className={'wb-shell-tree-state-row' + (current ? ' wb-shell-tree-state-row-current' : '')}
              data-state-row=""
              data-state-id={state.id}
              style={{ paddingLeft: depth * 12 }}
            >
              <Link
                className="wb-shell-tree-state"
                to={href(state.id)}
                aria-current={current ? 'true' : undefined}
                onClick={(event) => {
                  // 열린 페이지는 주소를 옮기지 않는다 — 편집 모드의 주소는 페이지를 가리키는 것이다(`shell/view-state-address.ts`).
                  if (open) event.preventDefault()
                  choose(state.id)
                }}
              >
                {state.name}
              </Link>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
