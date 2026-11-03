/**
 * **페이지 JSON 의 하단 바 통지** — 가져온 결과(설계서 「페이지 JSON」). 내보내기의 실패는 내보내기 모달 안에 선다(`./page-json-export.ts` 머리말
 * «실패는 모달 안의 문장이다»).
 *
 * # 셸이 상태를 들고 트리가 채운다
 *
 * 통지 줄은 셸의 하단 바(`shell/shell-footer.tsx`)이고, 가져오기는 메뉴 트리(`panels/menu-tree.tsx`)에서 일어난다. 그래서 셸이
 * `usePageJsonNotices`로 상태를 들고 그리며, 트리는 그 상태를 채우는 함수만 받는다(`MenuTree`의 `notices`). 트리가 하단 바 안의 자리로
 * portal 하지 않는 것은 통지 줄이 **비면 걷히기 때문이다**(`shell.css`의 `.wb-shell-footer-notices:empty`) — portal 의 자리 요소를 두면 줄이
 * 늘 비지 않아 좁은 칸에서 도구가 빈 첫 줄 아래로 내려간다.
 *
 * # 닫는 단추가 있다 — 저절로 걷히지 않는다
 *
 * 가져온 결과는 고아 코멘트가 **되돌릴 수 없는** 상태라 사용자가 읽기 전에 사라지면 안 되고(코멘트 행은 지워지지 않는다 — 말하지 않으면
 * 사용자는 자기가 그것을 만든 줄 모른다), 가져오기는 끝나자마자 새 페이지로 옮겨 가므로 페이지 이동에 걷히면 서자마자 사라진다.
 *
 * | 통지 | 걷히는 때 |
 * |---|---|
 * | 가져온 결과 | 그 통지의 «닫기» · 다음 가져오기를 **보낼 때**(`TreeCommands.importJson`) · 에디터를 떠날 때(셸이 내려간다) |
 *
 * 페이지 이동 · 모드 전환 · 다른 트리 조작 · 역할 바뀜으로는 안 걷힌다. 단추는 문장 **밖**에 둔다(`shell/edit-alert.tsx`의 떠남 통지와 같은
 * 꼴) — 문장의 글자가 곧 통지다.
 */
import { useMemo, useState, type ReactElement } from 'react'
import type { PageImported } from '../api/types'
import { shellIcon } from '../shell/icons'

export interface PageJsonNotices {
  imported: PageImported | null
  /** 가져온 결과를 세운다 — `null`이면 걷는다. */
  showImported: (imported: PageImported | null) => void
}

export function usePageJsonNotices(): PageJsonNotices {
  const [imported, showImported] = useState<PageImported | null>(null)
  return useMemo(() => ({ imported, showImported }), [imported])
}

/** 하단 바에 서는 가져온 결과. 없으면 아무것도 안 그린다. */
export function PageJsonNoticeList(props: { notices: PageJsonNotices }): ReactElement | null {
  const { notices } = props
  if (notices.imported === null) return null
  return <PageImportedNotice imported={notices.imported} onDismiss={() => notices.showImported(null)} />
}

/** 가져온 뒤에 말해야 하는 것 — 성공 통지이지만 `role="status"` 한 줄로 끝나지 않는다(머리말). */
function PageImportedNotice(props: { imported: PageImported; onDismiss: () => void }): ReactElement {
  const { imported } = props
  return (
    <div className="wb-shell-pagejson-notice-row">
      <div className="wb-shell-pagejson-notice">
        <p className="wb-shell-pagejson-notice-line" role="status">
          가져왔습니다: {imported.page.title} — 코멘트 {imported.comments.inserted}개
        </p>
        {imported.comments.dangling > 0 && (
          <p className="wb-shell-pagejson-notice-line">
            그중 {imported.comments.dangling}개는 가리키던 노드가 파일에 없어 <strong>&ldquo;사라진 노드&rdquo;</strong>로 들어갔습니다.
          </p>
        )}
        {imported.ignoredLayoutRef !== undefined && (
          <p className="wb-shell-pagejson-notice-line">
            레이아웃 <code>{imported.ignoredLayoutRef}</code>은 쓰지 않았습니다 — 이 페이지는 프로젝트의 기본 레이아웃으로 열립니다.
          </p>
        )}
      </div>
      <button
        type="button"
        className="wb-shell-edit-alert-close"
        aria-label="가져오기 결과 닫기"
        title="가져오기 결과 닫기"
        onClick={props.onDismiss}
      >
        {shellIcon('close', 14)}
      </button>
    </div>
  )
}
