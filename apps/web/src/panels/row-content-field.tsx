/**
 * 속성 패널의 그리드 행 칸 **«행 내용: 기본 / 커스텀»**(`edit/row-content.ts` 머리말). 고른 노드가 `GridRow` 일 때만 선다. 문서의 값이 아니라 칸 유무를
 * 비추는 단추 꼴 라디오 둘이고(«상태 보임» 의 첫 줄과 같은 꼴 — `./visibility-field.tsx`), 고르면 편집 하나를 낸다(되돌리기 한 번).
 *
 * - **못 옮기는 쪽은 꺼진 채 칸 아래에 까닭 한 줄** — 첫 행 · 생략 띠 · 위 행 세로 칸 · 셀 틀을 읽는 열을 남이 쥠.
 * - **커스텀 → 기본에서 잃을 것이 있으면 칸 아래에 확인 줄**(인라인 — 모달은 셸의 대화 상자 몫이다). 확인을 누른 때 칸이 물은 때와 다르면(남의 고침이
 *   닿음) 걷지 않고 지금 칸으로 다시 묻는다 — 물은 것과 다른 칸을 걷지 않는다.
 * - 고칠 수 없는 판(남의 잠금 · viewer)은 둘 다 꺼진다 — 까닭은 패널 머리가 이미 말한다.
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactElement } from 'react'
import type { PageDocument, PatchOp } from '@wirebound/schema'
import { buildCellsOps, buildCellsReads, buildCellsRefusal } from '../edit/grid-row-actions'
import {
  cellsToLose,
  clearCellsOps,
  clearCellsQuestion,
  ROW_CONTENT_HINT,
  ROW_CONTENT_LABEL,
  ROW_CONTENT_LABELS,
  rowContentOf,
  toBasicRefusal,
  type RowContent,
} from '../edit/row-content'
import { findNodeSafely } from '../edit/safe-walk'
import { rovingStep } from '../palette/component-palette'

const CONTENTS: RowContent[] = ['basic', 'custom']
export const CLEAR_CELLS_CONFIRM = '기본으로 돌리기'
export const CLEAR_CELLS_CANCEL = '취소'

export function RowContentField(props: {
  document: PageDocument
  rowId: string
  /** 남의 잠금 · viewer — 둘 다 꺼진다. */
  disabled: boolean
  /** 셀 틀을 읽는 열의 남의 잠금 까닭 — 기본 → 커스텀만 막는다. 부르는 쪽이 `buildCellsReads` 로 묻는다. */
  readLock: (columnIds: readonly string[]) => string | null
  /** 편집 하나를 낸다 — 보내기 전의 잠금 물음(서버와 같은 물음 · 셀 틀을 읽는 열)은 부르는 쪽이 한다. `reads` 는 셀 틀을 읽는 열. */
  commit: (ops: PatchOp[], reads: readonly string[]) => void
}): ReactElement | null {
  const id = useId()
  const labelId = `${id}-label`
  const radios = useRef(new Map<RowContent, HTMLButtonElement>())
  /** 확인 줄 — 물은 때의 칸(글로) · 칸 수. */
  const [asking, setAsking] = useState<{ cells: string; count: number } | null>(null)
  /** 확인 줄이 서면 확인 단추로 포커스를 옮긴다(메뉴 트리의 삭제 확인과 같다 — `./menu-tree.tsx`). Escape 는 취소다. */
  const confirmButton = useRef<HTMLButtonElement>(null)
  const askingNow = asking !== null
  useEffect(() => {
    if (askingNow) confirmButton.current?.focus()
  }, [askingNow])

  const current = rowContentOf(props.document, props.rowId)
  if (current === null) return null
  const cellsNow = JSON.stringify(findNodeSafely(props.document.root, props.rowId)?.children ?? [])
  const reads = current === 'basic' ? buildCellsReads(props.document, props.rowId) : []
  const refusal =
    current === 'basic'
      ? (buildCellsRefusal(props.document, props.rowId) ?? props.readLock(reads))
      : toBasicRefusal(props.document, props.rowId)
  // 확인 줄은 그 행이 아직 커스텀일 때만 — 남이 먼저 걷었으면 걷힌다.
  const question = asking !== null && current === 'custom' ? asking : null

  const clear = (): void => {
    const edit = clearCellsOps(props.document, props.rowId)
    if (!('reason' in edit)) props.commit(edit.ops, [])
  }
  const choose = (next: RowContent): void => {
    if (props.disabled || next === current || refusal !== null) return
    if (next === 'custom') {
      const edit = buildCellsOps(props.document, props.rowId)
      if (!('reason' in edit)) props.commit(edit.ops, reads)
      return
    }
    const count = cellsToLose(props.document, props.rowId)
    if (count === 0) clear()
    else setAsking({ cells: cellsNow, count })
  }
  const confirm = (): void => {
    if (question === null) return
    // 물은 뒤 칸이 바뀌었으면(남의 고침이 닿음) 지금 칸으로 다시 묻는다.
    if (question.cells !== cellsNow) {
      const count = cellsToLose(props.document, props.rowId)
      setAsking(count === 0 ? null : { cells: cellsNow, count })
      if (count === 0) clear()
      return
    }
    setAsking(null)
    clear()
  }
  /** ← → Home End — 옮긴 갈래를 고른다(APG 라디오 묶음). 꺼진 갈래로는 안 간다. */
  const move = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    const next = rovingStep(event.key, index, CONTENTS.length)
    if (next === null) return
    event.preventDefault()
    const target = CONTENTS[next]!
    if (target === current || refusal !== null) return
    radios.current.get(target)?.focus()
    choose(target)
  }

  return (
    <div className="wb-shell-prop" data-wb-row-content="">
      <dt className="wb-shell-prop-label">
        <span id={labelId}>{ROW_CONTENT_LABEL}</span>
      </dt>
      <dd className="wb-shell-prop-value">
        <div className="wb-shell-row-content-modes" role="radiogroup" aria-labelledby={labelId} aria-disabled={props.disabled || undefined}>
          {CONTENTS.map((key, index) => (
            <button
              key={key}
              ref={(element) => {
                if (element === null) radios.current.delete(key)
                else radios.current.set(key, element)
              }}
              type="button"
              role="radio"
              className="wb-shell-row-content-mode"
              aria-checked={current === key}
              tabIndex={current === key ? 0 : -1}
              disabled={props.disabled || (key !== current && refusal !== null)}
              aria-description={key !== current && refusal !== null ? refusal : undefined}
              onClick={() => choose(key)}
              onKeyDown={(event) => move(event, index)}
            >
              {ROW_CONTENT_LABELS[key]}
            </button>
          ))}
        </div>
        {!props.disabled && refusal !== null && (
          <p className="wb-shell-prop-note" data-wb-row-content-why="">
            {refusal}
          </p>
        )}
        {question !== null && (
          <div
            className="wb-shell-row-content-confirm"
            role="group"
            aria-label="칸 걷기 확인"
            onKeyDown={(event) => {
              if (event.key !== 'Escape') return
              event.preventDefault()
              setAsking(null)
              radios.current.get(current)?.focus()
            }}
          >
            <p className="wb-shell-row-content-question">{clearCellsQuestion(question.count)}</p>
            <button type="button" ref={confirmButton} className="wb-shell-menu-tool" disabled={props.disabled} onClick={confirm}>
              {CLEAR_CELLS_CONFIRM}
            </button>
            <button type="button" className="wb-shell-menu-tool" onClick={() => setAsking(null)}>
              {CLEAR_CELLS_CANCEL}
            </button>
          </div>
        )}
        <p className="wb-shell-prop-note">{ROW_CONTENT_HINT}</p>
      </dd>
    </div>
  )
}
