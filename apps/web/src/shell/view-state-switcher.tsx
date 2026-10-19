/**
 * **머리 상태 전환기** `[기본 ▾]`(설계서 「설계서 화면 구조」 «화면 상태») — 지금 상태를 **고르기만** 한다(`shell/use-view-state.ts`). 상태를
 * 더하고 다루는 것은 메뉴 트리의 상태 줄이다(`panels/state-rows.tsx`). 편집 모드 · 뷰 모드 · viewer 가 같은 부품을 쓴다.
 *
 * - **항목:** «기본»과 상태 트리(`viewStateOrder` — 트리 차례 · 하위 상태는 깊이만큼 들여 쓴다). 하나를 고르는 항목이고 지금 상태가 참이다.
 * - **단추는 지금 상태의 이름을 보인다**(`ActionMenu` 의 `text`) — 이름은 «화면 상태: <이름>»이라 보이는 글자가 이름 안에 든다.
 * - **열린 페이지가 없으면 안 선다** — 고를 상태가 없다.
 * - **좁은 창에서는 셸 `…` 로 접힌다**(`shell/head-fold.ts` 의 `tight`) — 같은 항목을 `viewStateMenuItems` 가 짓고, 접힌 판의 항목은 이름이
 *   «화면 상태: <이름>»이다(다른 `…` 항목 사이에서 무엇을 고르는지 말한다).
 */
import type { ReactElement } from 'react'
import { DEFAULT_VIEW_STATE, viewStateName, viewStateOrder } from '@wirebound/schema'
import { ActionMenu, type ActionMenuItem } from './action-menu'
import { ICONS } from './icons'
import { useViewState, type ViewStateChoice } from './use-view-state'

/** 단추의 접근 이름 머리 — 뒤에 지금 상태의 이름이 붙는다. */
export const VIEW_STATE_SWITCHER_LABEL = '화면 상태'

/** 지금 상태의 이름 — 기본이면 «기본». */
export function currentStateName(choice: ViewStateChoice): string {
  return viewStateName(choice.viewStates, choice.state ?? DEFAULT_VIEW_STATE)
}

/** 전환기의 항목 — 머리 전환기와 접힌 `…` 가 같은 것을 쓴다. `prefixed` 면 상태 항목의 글에 «화면 상태: »를 붙인다(접힌 판). */
export function viewStateMenuItems(choice: ViewStateChoice, options: { prefixed: boolean }): ActionMenuItem[] {
  const label = (name: string): string => (options.prefixed ? `${VIEW_STATE_SWITCHER_LABEL}: ${name}` : name)
  return [
    {
      key: 'view-state-default',
      label: label(viewStateName(choice.viewStates, DEFAULT_VIEW_STATE)),
      icon: ICONS.viewStates,
      checked: choice.state === null,
      onSelect: () => choice.choose(null),
    },
    ...viewStateOrder(choice.viewStates).map(({ state, depth }) => ({
      key: `view-state-${state.id}`,
      label: label(state.name),
      icon: ICONS.viewStates,
      checked: choice.state === state.id,
      depth,
      onSelect: () => choice.choose(state.id),
    })),
  ]
}

export function ViewStateSwitcher(props: { projectId: string; pageId: string | undefined }): ReactElement | null {
  const choice = useViewState(props.pageId)
  if (props.pageId === undefined) return null
  const name = currentStateName(choice)
  return (
    <ActionMenu
      label={`${VIEW_STATE_SWITCHER_LABEL}: ${name}`}
      icon={ICONS.viewStates}
      text={name}
      items={viewStateMenuItems(choice, { prefixed: false })}
    />
  )
}
