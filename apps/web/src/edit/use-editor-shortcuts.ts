/**
 * **에디터 단축키 리스너** — 표(`./editor-shortcuts.ts`)를 호스트 `document` 와 캔버스 iframe 문서 **양쪽**의 `keydown` 에 건다.
 *
 * 호스트에 건 리스너는 캔버스 안의 키를 못 받는다 — 캔버스 문서는 별도 `Document` 라 그 안의 네이티브 이벤트가 호스트로 안 올라간다
 * (`canvas/canvas-document.tsx` 머리말). iframe 은 페이지를 옮길 때마다 새로 서므로 그 문서를 이펙트의 의존으로 둔다.
 *
 * **거르는 차례가 규격이다:** 서지 않는 때(`shortcutsBlocked` — 조합 · 이미 받음 · 입력 표면 · 제 단축키 상자 · 모달) → 표에서 찾기 →
 * 편집 명령인데 `editable` 이 거짓이면 안 섬 → `preventDefault` → `run`. **찾기 전에 걸러야** 입력 칸에서 친 `Backspace` 에
 * `preventDefault` 가 안 걸린다(걸리면 글자가 안 지워진다). **안 서는 명령에는 `preventDefault` 를 안 건다** — 뷰 모드의 화살표 · Escape 가
 * 브라우저 기본 동작을 그대로 갖는다.
 */
import { useEffect, useRef } from 'react'
import { platformOf, shortcutFor, shortcutsBlocked, type Platform, type ShortcutCommand } from './editor-shortcuts'

export function useEditorShortcuts(input: {
  /** `useCanvasDocument` 가 준다 — 캔버스가 없으면 `null`. */
  canvasDocument: Document | null
  /** 편집 모드 && `canEdit` — 편집 명령(`Shortcut.edits`)이 이것으로 선다. */
  editable: boolean
  /** 셸이 명령을 지금 함수에 잇는다. */
  run: (command: ShortcutCommand) => void
  /** 케이스가 Cmd/Ctrl 을 고르는 이음매. 운영은 `navigator` 에서 읽는다. */
  platform?: Platform
}): void {
  // 마지막 값 — 렌더마다 바뀌는 `run` · `editable` 로 리스너를 다시 걸지 않는다(`shell/use-popover-dismiss.ts` 의 `latest` 와 같은 까닭).
  const latest = useRef(input)
  useEffect(() => {
    latest.current = input
  })

  const { canvasDocument } = input
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (shortcutsBlocked(event)) return
      const { editable, run, platform } = latest.current
      const shortcut = shortcutFor(event, platform ?? platformOf(navigator))
      if (shortcut === null) return
      if (shortcut.edits && !editable) return
      event.preventDefault()
      run(shortcut.command)
    }
    const targets = canvasDocument === null ? [document] : [document, canvasDocument]
    for (const target of targets) target.addEventListener('keydown', onKeyDown)
    return () => {
      for (const target of targets) target.removeEventListener('keydown', onKeyDown)
    }
  }, [canvasDocument])
}
