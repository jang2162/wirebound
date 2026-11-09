/**
 * **커스텀 행을 첫 자리로 데려오는 편집의 확인 상자**(`edit/first-row-ask.ts`). 편집 통로(`edit/use-edit-commit.tsx` 의 `commitOps`)가 그 편집을
 * 내지 않고 스토어에 적으면(`EditorStore.askFirstRow`) 셸이 이것을 세운다 — 입구(끌기 · 키 · 행동 메뉴 · 붙이기 · 삭제)가 저마다 상자를 들지 않는다.
 * 끌기는 놓은 뒤에 묻는다(놓을 때 편집을 낸다).
 *
 * - **«계속»** — 물은 문서에서 노드 id 로 붙잡은 연산을 지금 문서로 옮겨 낸다(`EditorStore.settleFirstRowAsk`). 묻는 사이 남의 편집이 닿았어도 그
 *   편집이 여전히 얹히면 낸다 — 이미 물었으니 다시 판정해 묻지 않는다. 더는 얹히지 않으면(대상 · 목적지가 사라짐) 내지 않고 하단 바에 한 줄.
 * - **«취소» · Escape · 닫기** — 아무것도 안 낸다.
 *
 * 상자는 단축키 상자 밖(셸)에 선다 — 상자 단추에서 친 키가 뒤 트리로 버블되지 않게(`./shell-dialog.tsx` 머리말).
 */
import { useId, type ReactElement } from 'react'
import {
  FIRST_ROW_ASK_CONFIRM,
  FIRST_ROW_ASK_QUESTION,
  FIRST_ROW_ASK_STALE,
  FIRST_ROW_ASK_TITLE,
  FIRST_ROW_ASK_WHY,
} from '../edit/first-row-ask'
import { useEditCommit } from '../edit/use-edit-commit'
import { LOSS_RANK } from '../store/loss-notice'
import { useEditorStore, useEditorStoreInstance, useOpenDocument } from '../store/use-editor-store'
import { ShellDialog } from './shell-dialog'

export function FirstRowDialog(props: { projectId: string; pageId: string }): ReactElement | null {
  const store = useEditorStoreInstance()
  const ask = useEditorStore(store, (s) => s.firstRowAsk)
  // 주소와 대조한 문서 — 그 페이지가 열려 있지 않으면 `null`(`store/use-editor-store.tsx` 의 `useOpenPage`).
  const open = useOpenDocument(props.pageId)
  const { commitOps } = useEditCommit({ projectId: props.projectId, pageId: props.pageId })
  const sentenceId = useId()
  const whyId = useId()
  if (ask === null || ask.pageId !== props.pageId || open === null) return null

  function cancel(): void {
    store.settleFirstRowAsk(false)
  }

  function proceed(): void {
    const settled = store.settleFirstRowAsk(true)
    if (settled === undefined) return
    if (settled.ops === null || !commitOps(settled.ops, { firstRowAsked: true })) {
      store.tellLoss({ key: 'first-row:stale', rank: LOSS_RANK.cancelled, counts: [], render: () => FIRST_ROW_ASK_STALE })
      return
    }
    settled.after?.()
  }

  return (
    <ShellDialog open title={FIRST_ROW_ASK_TITLE} onClose={cancel} describedBy={`${sentenceId} ${whyId}`}>
      <div className="wb-shell-module-dialog">
        <p id={sentenceId} className="wb-shell-module-dialog-sentence">
          {FIRST_ROW_ASK_QUESTION}
        </p>
        <p id={whyId} className="wb-shell-module-dialog-note">
          {FIRST_ROW_ASK_WHY}
        </p>
        <div className="wb-shell-module-dialog-foot">
          <button type="button" className="wb-shell-module-text-action" onClick={cancel}>
            취소
          </button>
          <button
            type="button"
            className="wb-shell-module-text-action"
            onClick={(event) => {
              // 더블클릭의 둘째 누름은 버린다 — 상자가 닫힌 뒤 그 자리의 뒤 화면을 누르지 않게.
              if (event.detail > 1) return
              proceed()
            }}
          >
            {FIRST_ROW_ASK_CONFIRM}
          </button>
        </div>
      </div>
    </ShellDialog>
  )
}
