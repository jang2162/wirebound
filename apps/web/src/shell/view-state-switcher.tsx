/**
 * **머리 상태 전환기** `[기본 ▾]`(설계서 「설계서 화면 구조」 «화면 상태») — 지금 상태를 고른다(`shell/use-view-state.ts`). 편집 모드 · 뷰 모드 ·
 * viewer 가 같은 부품을 쓴다.
 *
 * - **항목:** «기본»과 상태 목록(하나를 고르는 항목 — 지금 상태가 참), `editable` 이면 그 뒤에 «상태 추가» · «상태 관리…».
 * - **단추는 지금 상태의 이름을 보인다**(`ActionMenu` 의 `text`) — 이름은 «화면 상태: <이름>»이라 보이는 글자가 이름 안에 든다.
 * - **열린 페이지가 없으면 안 선다** — 고를 상태가 없다.
 */
import type { ReactElement } from 'react'
import { viewStateName } from '@wirebound/schema'
import { ActionMenu, type ActionMenuItem } from './action-menu'
import { ICONS } from './icons'
import { useViewState } from './use-view-state'

/** 단추의 접근 이름 머리 — 뒤에 지금 상태의 이름이 붙는다. */
export const VIEW_STATE_SWITCHER_LABEL = '화면 상태'

export function ViewStateSwitcher(props: {
  projectId: string
  pageId: string | undefined
  /** 상태 목록을 고칠 수 있는가 — «상태 추가» · «상태 관리…» 를 싣는다(편집 모드 && 편집 권한). */
  editable: boolean
}): ReactElement | null {
  const { state, viewStates, choose } = useViewState(props.pageId)
  if (props.pageId === undefined) return null
  const name = state === null ? viewStateName(viewStates, 'default') : viewStateName(viewStates, state)
  const items: ActionMenuItem[] = [
    { key: 'default', label: viewStateName(viewStates, 'default'), icon: ICONS.viewStates, checked: state === null, onSelect: () => choose(null) },
    ...viewStates.map((entry) => ({
      key: `state-${entry.id}`,
      label: entry.name,
      icon: ICONS.viewStates,
      checked: state === entry.id,
      onSelect: () => choose(entry.id),
    })),
  ]
  return <ActionMenu label={`${VIEW_STATE_SWITCHER_LABEL}: ${name}`} icon={ICONS.viewStates} text={name} items={items} />
}
