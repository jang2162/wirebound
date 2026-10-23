/**
 * **«종류 바꾸기…» 상자** — 구조 트리 줄 `…` 의 «종류 바꾸기…» 가 연다(입력 조각 줄에만 · 편집할 수 있는 판에만 — `./tree-row-actions.tsx`). 바꿀 수 있는
 * 종류마다 단추가 서고, 누르면 곧바로 바꾸고 닫힌다 — 셀렉트 필드가 «넣기 → `…` → 종류 바꾸기… → 셀렉트» 다. 바꾸는 규칙은
 * `edit/change-kind.ts` 가 갖는다.
 *
 * **행동 메뉴의 하위 메뉴가 아니라 상자인 까닭:** 행동 메뉴(`shell/action-menu.tsx`)는 하위 메뉴가 없다 — 지으려면 중첩 portal · ← → · 바깥 누름 · 자리
 * 훅을 그 부품에 더해야 하고 그 메뉴를 쓰는 판이 다 영향권이다. 누름 수는 같다(코디네이터 답 — `docs/superpowers/plans/2026-10-24-ci-a-report.md`).
 *
 * **상자는 구조 트리의 키 상자 밖에 선다**(`shell/shell-dialog.tsx` 머리말 «상자 안의 키는 React 트리를 따라 버블된다» — 단추에서 친 `Delete` 가 뒤
 * 트리의 삭제로 버블되지 않게).
 */
import { useId, type ReactElement } from 'react'
import { getComponent } from '@wirebound/schema'
import { ShellDialog } from '../shell/shell-dialog'

/** 타입의 사람 이름 — 카탈로그 `label`(없는 타입이면 타입 이름 그대로). */
function labelOf(type: string): string {
  return getComponent(type)?.label ?? type
}

/** 줄 `…` 의 항목 이름 · 상자 제목. */
export const CHANGE_KIND_LABEL = '종류 바꾸기…'

export function ChangeKindDialog(props: {
  /** 바꿀 노드의 지금 타입 — `null` 이면 닫혀 있다. */
  from: string | null
  /** 바꿀 수 있는 종류(`kindTargets`). */
  targets: readonly string[]
  onPick: (type: string) => void
  onClose: () => void
}): ReactElement | null {
  const sentenceId = useId()
  if (props.from === null) return null
  return (
    <ShellDialog open title={CHANGE_KIND_LABEL} onClose={props.onClose} describedBy={sentenceId}>
      <div className="wb-shell-module-dialog">
        <p id={sentenceId} className="wb-shell-module-dialog-sentence">
          지금 종류는 «{labelOf(props.from)}» 입니다. 바꾸면 같은 이름의 값(안내 문구 · 비활성 · 선택지 …)은 옮기고 새 종류에 없는 값은
          버립니다.
        </p>
        <div className="wb-shell-module-dialog-targets" role="group" aria-label="바꿀 종류">
          {props.targets.map((type) => (
            <button key={type} type="button" className="wb-shell-module-text-action" onClick={() => props.onPick(type)}>
              {labelOf(type)}
            </button>
          ))}
        </div>
        <div className="wb-shell-module-dialog-foot">
          <button type="button" className="wb-shell-module-text-action" onClick={props.onClose}>
            취소
          </button>
        </div>
      </div>
    </ShellDialog>
  )
}
