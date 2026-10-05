/**
 * **«상태 나누기 풀기» 확인 상자** — 영역의 기본 가지만 남기고 벗기면 다른 가지(와 그 안 노드)가 지워진다(설계서 「설계서 화면 구조」
 * «화면 상태»). 구조 트리 줄 `…` 의 «상태 나누기 풀기»가 연다(`panels/structure-toolbar.tsx` 의 `ViewStateCommands.askUnsplit` — 다른 가지가
 * 없으면 묻지 않고 곧바로 푼다). 푸는 것은 편집 하나라 되돌리기 한 번에 돌아온다.
 *
 * **상자는 구조 트리의 단축키 상자 밖에 선다**(`panels/structure-tree.tsx` — 상자 단추의 키가 뒤 트리의 단축키로 버블되지 않게 · `shell/shell-dialog.tsx`
 * 머리말 «상자 안의 키는 React 트리를 따라 버블된다»).
 */
import { useId, type ReactElement } from 'react'
import { ShellDialog } from '../shell/shell-dialog'
import { UNSPLIT_LABEL } from '../edit/view-state-actions'
import type { ViewStateCommands } from './structure-toolbar'

/** 지워지는 노드 이름을 보이는 수 — 나머지는 «외 N개»(상태 삭제 상자와 같은 수 — `shell/view-states-dialog.tsx`). */
const PREVIEW_LIMIT = 8

export function unsplitSentence(cases: readonly { name: string }[]): string {
  return `기본 가지만 남기고 가지 ${cases.length}개(${cases.map((entry) => entry.name).join(' · ')})의 내용이 함께 삭제됩니다.`
}

export function UnsplitDialog(props: { commands: ViewStateCommands }): ReactElement | null {
  const shown = props.commands.unsplitting
  const sentenceId = useId()
  if (shown === null) return null
  const nodes = shown.nodes.slice(0, PREVIEW_LIMIT)
  const rest = shown.nodes.length - nodes.length
  const why = props.commands.unsplitWhy
  return (
    <ShellDialog open title={UNSPLIT_LABEL} onClose={props.commands.cancelUnsplit} describedBy={sentenceId}>
      <div className="wb-shell-view-states-body">
        <p id={sentenceId} className="wb-shell-view-states-sentence">
          {unsplitSentence(shown.cases)}
        </p>
        {nodes.length > 0 && (
          <ul className="wb-shell-view-states-removed" aria-label="함께 지워지는 노드">
            {nodes.map((entry) => (
              <li key={entry.id} data-node-id={entry.id}>
                {entry.label}
              </li>
            ))}
            {rest > 0 && <li className="wb-shell-view-states-rest">외 {rest}개</li>}
          </ul>
        )}
        <p className="wb-shell-view-states-note">되돌리기(Cmd+Z)로 영역과 가지를 함께 되살립니다.</p>
        <div className="wb-shell-view-states-foot">
          <button type="button" className="wb-shell-view-states-button" onClick={props.commands.cancelUnsplit}>
            취소
          </button>
          <button
            type="button"
            className="wb-shell-view-states-danger"
            aria-disabled={why !== undefined || undefined}
            title={why}
            aria-description={why}
            onClick={(event) => {
              if (why !== undefined || event.detail > 1) return
              props.commands.confirmUnsplit()
            }}
          >
            풀기
          </button>
        </div>
      </div>
    </ShellDialog>
  )
}
