/**
 * **메뉴 연쇄 삭제의 확인 상자**(설계서 「트리의 줄 행동」 — 메뉴의 삭제). 하위(메뉴 · 페이지)가 있는 메뉴를 지우려 하면 트리 명령 훅이
 * 연다(`TreeCommands.removing` — `askRemove`). 하위가 없는 메뉴는 줄 아래의 두 번 누르기 확인 그대로다.
 *
 * # 무엇을 보이나
 *
 * - 문장 — «"회원관리" 메뉴와 하위 메뉴 N개 · 페이지 M개가 함께 삭제됩니다». 0 인 쪽은 빼고 말한다. «메뉴와»로 이어 이름의 받침과 무관하게
 *   조사가 맞는다(`page-import-dialog.tsx`의 `importDialogTitle`과 같은 수).
 * - **페이지가 있으면 경고 상자** — 경고 아이콘 · 위험 색으로 «페이지 M개와 그 안의 설계가 모두 삭제됩니다», 그 아래 지워질 페이지 이름의
 *   앞 `PAGE_PREVIEW_LIMIT`개와 «외 N개». 페이지는 이력까지 지워져 되돌리기가 없다 — 안전망 스냅샷으로만 돌아온다.
 * - 상자의 설명(`aria-describedby`)이 문장과 경고 상자를 함께 품는다 — 상자가 열릴 때 함께 읽힌다.
 * - 확인 단추는 글 + 위험 색이다(설계서 «글만» — 되돌릴 수 없는 일을 확정하는 단추).
 *
 * # 보이는 목록이 보내는 id 집합이다
 *
 * 상자와 보내는 자리가 같은 함수(`cascadeShown`)로 목록을 얻는다 — 서버는 그 id 집합으로 견주어, 다르면 아무것도 안 지우고 지금 목록을
 * 409 에 싣는다. 그때 상자는 그 목록으로 다시 서고 «목록이 바뀌었습니다» 한 줄을 띄운다. **남의 변경으로 트리를 다시 받아 목록(id 집합)이
 * 바뀌어도 같은 길이다** — 새 목록으로 다시 서고 같은 한 줄을 띄운다. 그 메뉴가 사라졌으면 상자를 닫고 하단 바가 말한다(`tree/use-tree-commands.tsx`의
 * `reconcile`). 내 조작의 다시 받기(409 의 목록이 꼴이 틀린 판)로 그 메뉴가 사라졌으면 상자는 그렇게 말하고 확인을 끈다.
 *
 * # 상자는 단축키 상자 **밖**에 선다
 *
 * 메뉴 트리가 그리는 자리는 `PageImportDialog`와 같다(`panels/menu-tree.tsx`의 `outside`) — 상자 단추에서 친 `Delete`가 뒤 트리의 삭제
 * 확인으로 버블되지 않게(`shell/shell-dialog.tsx` 머리말 «상자 안의 키는 React 트리를 따라 버블된다»).
 */
import { useId, type ReactElement } from 'react'
import { shellIcon } from '../shell/icons'
import { ShellDialog } from '../shell/shell-dialog'
import { cascadeShown, type RemoveTarget, type TreeCommands } from '../tree/use-tree-commands'

/**
 * 경고 상자에 이름을 보일 페이지 수. 나머지는 «외 N개»로 센다. 1440×900 창에서 상자가 굴림 없이 서는 수다 — 다시 재는 법:
 * `apps/web/build-test/menu-cascade-delete.test.ts`(상자의 높이 · 창 안에 드는가).
 */
export const PAGE_PREVIEW_LIMIT = 5

export const MENU_DELETE_TITLE = '메뉴 삭제'
export const MENU_DELETE_CONFIRM = '모두 삭제'

/** 상자의 문장 — 0 인 쪽은 빼고 말한다. */
export function cascadeSentence(title: string, menus: number, pages: number): string {
  const parts = [menus > 0 ? `하위 메뉴 ${menus}개` : null, pages > 0 ? `페이지 ${pages}개` : null].filter((part) => part !== null)
  return `"${title}" 메뉴와 ${parts.join(' · ')}가 함께 삭제됩니다`
}

export function cascadeWarning(pages: number): string {
  return `페이지 ${pages}개와 그 안의 설계가 모두 삭제됩니다`
}

export const CASCADE_SAFETY_NOTE = '지우기 직전 상태를 스냅샷으로 남깁니다 — 프로젝트 owner 가 그 스냅샷으로 되돌릴 수 있습니다.'
export const CASCADE_CHANGED = '목록이 바뀌었습니다 — 다시 확인하세요.'
export const CASCADE_BUSY = '조작을 보내는 중입니다'
export const CASCADE_GONE = '이 메뉴가 트리에 없습니다 — 다른 사람이 먼저 지웠을 수 있습니다.'

export function MenuDeleteDialog(props: { commands: TreeCommands }): ReactElement | null {
  const target = props.commands.removing
  if (target === null) return null
  return <OpenMenuDeleteDialog commands={props.commands} target={target} />
}

function OpenMenuDeleteDialog(props: { commands: TreeCommands; target: RemoveTarget }): ReactElement {
  const { commands, target } = props
  const sentenceId = useId()
  const warningId = useId()
  const menu = commands.state.status === 'ready' ? commands.state.menu : null
  const subtree = cascadeShown(target, menu)
  const pages = subtree?.pages ?? []
  const shown = pages.slice(0, PAGE_PREVIEW_LIMIT)
  const rest = pages.length - shown.length
  const describedBy = pages.length > 0 ? `${sentenceId} ${warningId}` : sentenceId
  // 꺼진 확인 단추의 까닭 — 마우스를 올리면 보이고, 꺼진 동안도 포커스를 받아 키보드로 읽힌다(`shell/action-menu.tsx` 머리말 «끈 항목은 …»).
  const why = subtree === null ? CASCADE_GONE : commands.busy ? CASCADE_BUSY : null

  return (
    <ShellDialog open title={MENU_DELETE_TITLE} onClose={commands.closeRemoving} describedBy={describedBy}>
      <div className="wb-shell-menu-delete-body">
        {target.changed && (
          <p className="wb-shell-menu-delete-changed" role="status">
            {CASCADE_CHANGED}
          </p>
        )}
        <p id={sentenceId} className="wb-shell-menu-delete-sentence">
          {subtree === null ? CASCADE_GONE : cascadeSentence(subtree.title, subtree.menus.length, pages.length)}
        </p>
        {pages.length > 0 && (
          <div id={warningId} className="wb-shell-menu-delete-warning">
            <p className="wb-shell-menu-delete-warning-head">
              {shellIcon('warning', 16, 'wb-shell-menu-delete-warning-icon')}
              <span>{cascadeWarning(pages.length)}</span>
            </p>
            <ul className="wb-shell-menu-delete-pages">
              {shown.map((page) => (
                <li key={page.id} className="wb-shell-menu-delete-page">
                  {page.title}
                </li>
              ))}
              {rest > 0 && <li className="wb-shell-menu-delete-rest">외 {rest}개</li>}
            </ul>
          </div>
        )}
        {subtree !== null && <p className="wb-shell-menu-delete-note">{CASCADE_SAFETY_NOTE}</p>}
        <div className="wb-shell-menu-delete-foot">
          <button type="button" className="wb-shell-menu-delete-cancel" onClick={commands.closeRemoving}>
            취소
          </button>
          <button
            type="button"
            className="wb-shell-menu-delete-confirm"
            aria-disabled={why !== null || undefined}
            title={why ?? undefined}
            aria-description={why ?? undefined}
            onClick={() => {
              if (why !== null) return
              commands.confirmCascade()
            }}
          >
            {MENU_DELETE_CONFIRM}
          </button>
        </div>
      </div>
    </ShellDialog>
  )
}
