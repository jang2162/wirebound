/**
 * 페이지 정보 탭의 **«레이아웃»** — `[빈] [서브페이지] [팝업]` 단추 꼴 라디오(설계 `docs/superpowers/specs/2026-11-25-page-layout-design.md`
 * 「«페이지 정보» 탭의 «레이아웃»」). 레이아웃은 문서의 `layout` 이라 열린 문서에서 읽고, 바꾸면 편집 묶음 하나를 낸다(`edit/page-kind-ops.ts`).
 * 팝업으로 바꾸면 팝업 제목이 지금 페이지 이름으로 선다.
 *
 * **팝업 경계를 넘는 단추만 잠금을 본다** — 그 바꿈은 뿌리를 갈아 끼워 남이 뿌리를 쥐었으면 꺼지고 까닭을 말한다(속성 패널과 같은 문장).
 * 빈 ↔ 서브페이지는 `/layout` 하나라 켜진 채다. 읽기만 하는 판(뷰 모드 · viewer)은 레이아웃을 글로 보인다.
 */
import { useRef, type KeyboardEvent, type ReactElement } from 'react'
import type { PageLayout } from '@wirebound/schema'
import { crossesPopup, documentLayout, layoutOps } from '../edit/page-kind-ops'
import { useEditCommit } from '../edit/use-edit-commit'
import { useOpenDocument } from '../store/use-editor-store'
import { useLockedBy } from '../store/use-locked-by'
import { blockedNotice } from './property-panel'
import { rovingStep } from '../palette/component-palette'

const LAYOUTS: readonly { value: PageLayout; label: string }[] = [
  { value: 'blank', label: '빈' },
  { value: 'subpage', label: '서브페이지' },
  { value: 'popup', label: '팝업' },
]

export function PageLayoutField(props: { projectId: string; pageId: string; title: string; canEdit: boolean }): ReactElement | null {
  const document = useOpenDocument(props.pageId)
  const { commitOps } = useEditCommit({ projectId: props.projectId, pageId: props.pageId })
  const lockOf = useLockedBy()
  const radios = useRef(new Map<PageLayout, HTMLButtonElement>())
  if (document === null) return null
  const layout = documentLayout(document)
  if (!props.canEdit) {
    return <p className="wb-shell-page-layout">레이아웃 · {LAYOUTS.find((item) => item.value === layout)?.label}</p>
  }
  const rootId = typeof document.root?.id === 'string' ? document.root.id : null
  const notice = blockedNotice(true, rootId === null ? null : lockOf(rootId))
  const blocked = (next: PageLayout): boolean => notice !== null && crossesPopup(layout, next)
  const choose = (next: PageLayout): void => {
    if (next !== layout && !blocked(next)) commitOps(layoutOps(document, next, props.title))
  }
  // 화살표로 옮기면 그 레이아웃을 고른다 — 상태 보임의 단추 무리(`visibility-field.tsx`)와 같은 로빙이다. 꺼진 단추는 건너뛴다.
  const move = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    let next = rovingStep(event.key, index, LAYOUTS.length)
    if (next === null) return
    event.preventDefault()
    const step = next < index || event.key === 'End' ? -1 : 1
    while (next >= 0 && next < LAYOUTS.length && blocked(LAYOUTS[next]!.value)) next += step
    if (next < 0 || next >= LAYOUTS.length) return
    const target = LAYOUTS[next]!.value
    radios.current.get(target)?.focus()
    choose(target)
  }
  return (
    <div className="wb-shell-page-layout" role="radiogroup" aria-label="레이아웃" aria-description={notice ?? undefined}>
      <span className="wb-shell-page-layout-label" aria-hidden="true">
        레이아웃
      </span>
      {LAYOUTS.map((item, index) => {
        const off = blocked(item.value)
        return (
          <button
            key={item.value}
            ref={(element) => {
              if (element === null) radios.current.delete(item.value)
              else radios.current.set(item.value, element)
            }}
            type="button"
            role="radio"
            className="wb-shell-page-layout-option"
            aria-checked={layout === item.value}
            tabIndex={layout === item.value ? 0 : -1}
            disabled={off}
            title={off ? (notice ?? undefined) : undefined}
            onClick={() => choose(item.value)}
            onKeyDown={(event) => move(event, index)}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
