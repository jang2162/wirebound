/**
 * 페이지 정보 탭의 **«종류»** — `[화면] [팝업]` 단추 꼴 라디오(설계 spec `2026-10-26-popup-attach-repeat-design.md` «8»). 종류는 문서 뿌리 타입이라
 * 열린 문서에서 읽고, 바꾸면 뿌리를 갈아 끼우는 편집 묶음 하나를 낸다(`edit/page-kind-ops.ts`). 팝업으로 바꾸면 팝업 제목이 지금 페이지 이름으로 선다.
 *
 * 남이 뿌리를 쥐었으면 꺼지고 까닭을 말한다(속성 패널과 같은 문장). 읽기만 하는 판(뷰 모드 · viewer)은 종류를 글로 보인다.
 */
import { useRef, type KeyboardEvent, type ReactElement } from 'react'
import { pageKindOf, type PageKind } from '@wirebound/schema'
import { pageKindOps } from '../edit/page-kind-ops'
import { useEditCommit } from '../edit/use-edit-commit'
import { useOpenDocument } from '../store/use-editor-store'
import { useLockedBy } from '../store/use-locked-by'
import { blockedNotice } from './property-panel'
import { rovingStep } from '../palette/component-palette'

const KINDS: readonly { value: PageKind; label: string }[] = [
  { value: 'page', label: '화면' },
  { value: 'popup', label: '팝업' },
]

export function PageKind(props: { projectId: string; pageId: string; title: string; canEdit: boolean }): ReactElement | null {
  const document = useOpenDocument(props.pageId)
  const { commitOps } = useEditCommit({ projectId: props.projectId, pageId: props.pageId })
  const lockOf = useLockedBy()
  const radios = useRef(new Map<PageKind, HTMLButtonElement>())
  if (document === null) return null
  const kind = pageKindOf(document)
  if (!props.canEdit) {
    return <p className="wb-shell-page-kind">종류 · {KINDS.find((item) => item.value === kind)?.label}</p>
  }
  const rootId = typeof document.root?.id === 'string' ? document.root.id : null
  const notice = blockedNotice(true, rootId === null ? null : lockOf(rootId))
  const choose = (next: PageKind): void => {
    if (next !== kind) commitOps(pageKindOps(document, next, props.title))
  }
  // 화살표로 옮기면 그 종류를 고른다 — 상태 보임의 단추 무리(`visibility-field.tsx`)와 같은 로빙이다.
  const move = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    const next = rovingStep(event.key, index, KINDS.length)
    if (next === null) return
    event.preventDefault()
    const target = KINDS[next]!.value
    radios.current.get(target)?.focus()
    choose(target)
  }
  return (
    <div className="wb-shell-page-kind" role="radiogroup" aria-label="종류" aria-description={notice ?? undefined}>
      <span className="wb-shell-page-kind-label" aria-hidden="true">
        종류
      </span>
      {KINDS.map((item, index) => (
        <button
          key={item.value}
          ref={(element) => {
            if (element === null) radios.current.delete(item.value)
            else radios.current.set(item.value, element)
          }}
          type="button"
          role="radio"
          className="wb-shell-page-kind-option"
          aria-checked={kind === item.value}
          tabIndex={kind === item.value ? 0 : -1}
          disabled={notice !== null}
          title={notice ?? undefined}
          onClick={() => choose(item.value)}
          onKeyDown={(event) => move(event, index)}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
