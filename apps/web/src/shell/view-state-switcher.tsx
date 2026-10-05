/**
 * **머리 상태 전환기** `[기본 ▾]`(설계서 「설계서 화면 구조」 «화면 상태») — 지금 상태를 고른다(`shell/use-view-state.ts`). 편집 모드 · 뷰 모드 ·
 * viewer 가 같은 부품을 쓴다.
 *
 * - **항목:** «기본»과 상태 목록(하나를 고르는 항목 — 지금 상태가 참), `editable` 이면 그 뒤에 «상태 추가» · «상태 관리…».
 * - **단추는 지금 상태의 이름을 보인다**(`ActionMenu` 의 `text`) — 이름은 «화면 상태: <이름>»이라 보이는 글자가 이름 안에 든다.
 * - **열린 페이지가 없으면 안 선다** — 고를 상태가 없다.
 * - **좁은 창에서는 셸 `…` 로 접힌다**(`shell/head-fold.ts` 의 `tight`) — 같은 항목을 `viewStateMenuItems` 가 짓고, 접힌 판의 항목은 이름이
 *   «화면 상태: <이름>»이다(다른 `…` 항목 사이에서 무엇을 고르는지 말한다).
 */
import type { ReactElement } from 'react'
import { viewStateName } from '@wirebound/schema'
import { ActionMenu, type ActionMenuItem } from './action-menu'
import { ICONS } from './icons'
import { useManageDialog, useViewState, type ManageDialog, type ViewStateChoice } from './use-view-state'
import { ADD_STATE_TITLE, MANAGE_STATES_TITLE } from './view-states-dialog'

/** 단추의 접근 이름 머리 — 뒤에 지금 상태의 이름이 붙는다. */
export const VIEW_STATE_SWITCHER_LABEL = '화면 상태'

/** 지금 상태의 이름 — 기본이면 «기본». */
export function currentStateName(choice: ViewStateChoice): string {
  return viewStateName(choice.viewStates, choice.state ?? 'default')
}

/**
 * 전환기의 항목 — 머리 전환기와 접힌 `…` 가 같은 것을 쓴다. `prefixed` 면 상태 항목의 글에 «화면 상태: »를 붙인다(접힌 판). `manage` 를 주면
 * 끝에 «상태 추가» · «상태 관리…»를 싣는다(편집 모드 && 편집 권한 — 상자는 `shell/view-states-dialog.tsx`).
 */
export function viewStateMenuItems(
  choice: ViewStateChoice,
  options: { prefixed: boolean; manage?: (dialog: ManageDialog) => void },
): ActionMenuItem[] {
  const manage = options.manage
  const label = (name: string): string => (options.prefixed ? `${VIEW_STATE_SWITCHER_LABEL}: ${name}` : name)
  return [
    { key: 'view-state-default', label: label(viewStateName(choice.viewStates, 'default')), icon: ICONS.viewStates, checked: choice.state === null, onSelect: () => choice.choose(null) },
    ...choice.viewStates.map((entry) => ({
      key: `view-state-${entry.id}`,
      label: label(entry.name),
      icon: ICONS.viewStates,
      checked: choice.state === entry.id,
      onSelect: () => choice.choose(entry.id),
    })),
    ...(manage === undefined
      ? []
      : [
          { key: 'view-state-add', label: ADD_STATE_TITLE, icon: ICONS.add, onSelect: () => manage('add') },
          { key: 'view-state-manage', label: `${MANAGE_STATES_TITLE}…`, icon: ICONS.viewStates, onSelect: () => manage('manage') },
        ]),
  ]
}

export function ViewStateSwitcher(props: {
  projectId: string
  pageId: string | undefined
  /** 상태 목록을 고칠 수 있는가 — «상태 추가» · «상태 관리…» 를 싣는다(편집 모드 && 편집 권한). */
  editable: boolean
}): ReactElement | null {
  const choice = useViewState(props.pageId)
  const { open } = useManageDialog()
  if (props.pageId === undefined) return null
  const name = currentStateName(choice)
  const items = viewStateMenuItems(choice, { prefixed: false, ...(props.editable ? { manage: open } : {}) })
  return <ActionMenu label={`${VIEW_STATE_SWITCHER_LABEL}: ${name}`} icon={ICONS.viewStates} text={name} items={items} />
}
