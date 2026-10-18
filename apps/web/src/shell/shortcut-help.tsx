/**
 * **단축키 목록 대화 상자** — `?` 가 연다(설계서 「설계서 화면 구조」의 단축키). 표 하나(`edit/editor-shortcuts.ts` 의 `EDITOR_SHORTCUTS`)를
 * 그대로 그리고, 키가 아니라 이벤트로 받는 클립보드 세 줄을 덧붙인다 — 글자를 여기 따로 적지 않는다.
 *
 * 모달(`ShellDialog`)이라 열린 동안 단축키 · 클립보드 리스너는 서지 않는다(`shortcutsBlocked` 의 `dialog[open]`). Escape 는 상자가 받는다.
 */
import type { ReactElement } from 'react'
import { CLIPBOARD_SHORTCUT_LINES, EDITOR_SHORTCUTS, type Platform, type ShortcutLine } from '../edit/editor-shortcuts'
import { ShellDialog } from './shell-dialog'

export function ShortcutHelp(props: { open: boolean; onClose: () => void; platform: Platform }): ReactElement | null {
  return (
    <ShellDialog open={props.open} title="단축키" onClose={props.onClose}>
      <div className="wb-shell-shortcut-body">
        <ShortcutTable caption="에디터 어디서나" lines={[...EDITOR_SHORTCUTS, ...CLIPBOARD_SHORTCUT_LINES]} platform={props.platform} />
      </div>
    </ShellDialog>
  )
}

function ShortcutTable(props: { caption: string; lines: readonly ShortcutLine[]; platform: Platform }): ReactElement {
  return (
    <table className="wb-shell-shortcut-table">
      <caption className="wb-shell-shortcut-caption">{props.caption}</caption>
      <tbody>
        {props.lines.map((line) => (
          <tr key={line.label}>
            <th scope="row" className="wb-shell-shortcut-keys">
              <kbd className="wb-shell-shortcut-kbd">{line.keys(props.platform)}</kbd>
            </th>
            <td className="wb-shell-shortcut-label">{line.label}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
