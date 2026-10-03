/**
 * **클립보드 리스너** — 호스트 `document` 와 캔버스 iframe 문서의 `copy` · `cut` · `paste` 를 받는다(설계서 「설계서 화면 구조」의 클립보드).
 *
 * **키(keydown)가 아니라 이벤트로 받는다** — `clipboardData.setData` · `getData` 는 사용자 몸짓 안의 그 이벤트에서 권한 묻기 없이 Chrome ·
 * Safari · Firefox 에서 된다. `navigator.clipboard.readText` 는 브라우저에 따라 권한을 묻는다. 그래서 단축키 표(`./editor-shortcuts.ts`)에는
 * 복사 · 잘라내기 · 붙여넣기가 없다.
 *
 * **거르는 것은 단축키와 같다**(`shortcutsBlocked` — 조합 · 이미 받음 · 입력 표면 · 제 단축키 상자 · 모달) — 입력 칸의 복사 · 붙여넣기는 그
 * 칸의 것이다. 복사 · 잘라내기는 하나 더 거른다: **사용자가 글자를 긁어 골랐으면** 그 글자의 복사다(패널의 코멘트 본문을 긁어 Cmd+C 한 것을
 * 노드 봉투로 바꾸면 안 된다). 잘라내기 · 붙여넣기는 `editable` 일 때만 선다 — 복사는 뷰 모드 · viewer 도 한다.
 *
 * **노드를 싣지 못하는 판은 막지 않는다** — `copy` 가 `null`(고른 노드가 없다 · 루트다)이거나 `paste` 가 `false`(봉투가 아니다)면
 * `preventDefault` 를 안 걸어 브라우저의 기본 동작이 그대로다.
 */
import { useEffect, useRef } from 'react'
import { shortcutsBlocked } from './editor-shortcuts'

export function useClipboard(input: {
  canvasDocument: Document | null
  /** 편집 모드 && `canEdit` — 잘라내기 · 붙여넣기가 이것으로 선다. */
  editable: boolean
  /** 고른 노드의 봉투 글자. 실을 것이 없으면 `null`. */
  copy: () => string | null
  /**
   * 잘라내기 — 지울 수 있으면 지우고 봉투 글자를 낸다. 못 지우면(루트 · 남의 잠금) `null` 이고 아무것도 안 싣는다 — 지워지지 않을 노드를
   * 잘라낸 척 싣지 않는다. 지우는 편집과 싣기는 같은 이벤트 안에서 잇달아 돈다.
   */
  cut: () => string | null
  /** 붙일 글자를 받는다. 노드 봉투였으면(편집을 냈든 이유를 말했든) `true`. */
  paste: (text: string) => boolean
}): void {
  const latest = useRef(input)
  useEffect(() => {
    latest.current = input
  })

  const { canvasDocument } = input
  useEffect(() => {
    const onCopyOrCut = (event: ClipboardEvent): void => {
      if (shortcutsBlocked(event) || textSelected(event)) return
      const cutting = event.type === 'cut'
      if (cutting && !latest.current.editable) return
      // 실을 곳이 없으면 아무것도 안 한다 — 잘라내기가 봉투 없이 지우면 노드를 잃는다.
      if (event.clipboardData === null) return
      const text = cutting ? latest.current.cut() : latest.current.copy()
      if (text === null) return
      event.clipboardData.setData('text/plain', text)
      event.preventDefault()
    }
    const onPaste = (event: ClipboardEvent): void => {
      if (shortcutsBlocked(event) || !latest.current.editable) return
      const text = event.clipboardData?.getData('text/plain') ?? ''
      if (text === '') return
      if (latest.current.paste(text)) event.preventDefault()
    }
    const targets = canvasDocument === null ? [document] : [document, canvasDocument]
    for (const target of targets) {
      target.addEventListener('copy', onCopyOrCut)
      target.addEventListener('cut', onCopyOrCut)
      target.addEventListener('paste', onPaste)
    }
    return () => {
      for (const target of targets) {
        target.removeEventListener('copy', onCopyOrCut)
        target.removeEventListener('cut', onCopyOrCut)
        target.removeEventListener('paste', onPaste)
      }
    }
  }, [canvasDocument])
}

/** 이벤트가 난 문서에 긁어 고른 글자가 있는가 — 있으면 그 글자의 복사다. */
function textSelected(event: Event): boolean {
  const target = event.target as Node | null
  const owner = target === null ? null : target.nodeType === 9 ? (target as Document) : target.ownerDocument
  const selection = owner?.getSelection() ?? null
  return selection !== null && !selection.isCollapsed && selection.toString() !== ''
}
