/**
 * 설계서를 여는 에디터 셸. 좌측에 메뉴·구조 트리, 가운데 캔버스, 우측 탭 패널이다
 * (설계서 「설계서 화면 구조」).
 *
 * 캔버스 안쪽은 `canvas/canvas.tsx`, 우측 탭의 본문은 `PANEL_BODIES`의 패널들, 좌측의
 * 메뉴·페이지 트리는 `panels/menu-tree.tsx`가 그린다.
 *
 * 조회는 자리마다 나뉘어 있다. 셸은 `getProject`, 트리는 `getTree`, 캔버스는 `getPage`를
 * 각각 부르고 각자 실패를 자기 자리에 그린다. 한 곳에 모아 두면 어느 하나가 실패할 때
 * 화면 전체가 오류로 바뀌고, 사용자는 멀쩡한 트리까지 잃는다.
 *
 * 편집 상태(모드·뷰포트 폭·줌·선택·문서)는 `EditorStore`가 갖는다. 셸이 그것을 `useState`로
 * 들고 내려보내지 않는 이유는 낙관적 적용·롤백·undo다 — 그것이 붙은 상태는
 * 화면 없이 단위 테스트할 수 있어야 하고, 컴포넌트 안에 있으면 그럴 수 없다.
 */
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from 'react'
import { useParams } from 'react-router'
import { ApiError } from '../api/client'
import { useApi } from '../api/context'
import { SignedOut, toFailure, type Failure } from '../api/failure'
import type { PageDetail, ProjectView } from '../api/types'
import { Canvas } from '../canvas/canvas'
import { CanvasDocumentProvider } from '../canvas/canvas-document'
import { PlacementRegionsProvider } from '../drag/use-placement'
import { CommentPanel } from '../panels/comment-panel'
import { MenuTree } from '../panels/menu-tree'
import { PageJsonNoticeList, usePageJsonNotices } from '../panels/page-json-notices'
import { InteractionPanel } from '../panels/interaction-panel'
import { PageDescriptionPanel } from '../panels/page-description'
import { PanelDraftsProvider } from '../panels/panel-drafts'
import { PropertyPanel } from '../panels/property-panel'
import { AliasEditProvider } from '../panels/alias-edit'
import { StructureTree } from '../panels/structure-tree'
import { leftUnsentNotice, restoredRevisions, useEditCommit } from '../edit/use-edit-commit'
import { ActionMenu, type ActionMenuItem } from '../shell/action-menu'
import { ViewStateProvider, useManageDialog, useViewState } from '../shell/use-view-state'
import { ViewStatesDialog } from '../shell/view-states-dialog'
import { ViewStateSwitcher, viewStateMenuItems } from '../shell/view-state-switcher'
import { useViewStateAddress } from '../shell/view-state-address'
import { BrandLink } from '../shell/brand-link'
import { EditAlert } from '../shell/edit-alert'
import { EditWarnings } from '../shell/edit-warnings'
import { RemoteAlert } from '../shell/remote-alert'
import { EditorKeys } from '../shell/editor-keys'
import { ICONS, shellIcon } from '../shell/icons'
import { ShellDialog } from '../shell/shell-dialog'
import { ComponentPalette, PaletteToggle } from '../palette/component-palette'
import { GuidesToggle } from '../canvas/layout-guides'
import { ShellFooter } from '../shell/shell-footer'
import { useHeadFold, type HeadFold } from '../shell/head-fold'
import { PanelFoldToggle } from '../shell/panel-fold'
import { ShellResizer } from '../shell/shell-resizer'
import { useSidebarLayout } from '../shell/sidebar-layout'
import { useNodeLock } from '../realtime/use-node-lock'
import { useRealtime, type MembershipCause } from '../realtime/use-realtime'
import { ExportBody } from '../shell/export-panel'
import { SnapshotsBody } from '../shell/snapshots-panel'
import { projectAbilities } from '../projects/project-actions'
import { SessionNotices, useLogout } from '../session/session-menu'
import { useSessionUser } from '../session/session-context'
import { ProjectThemeProvider, useProjectTheme } from '../theme/project-theme'
import { ThemeAlert } from '../theme/theme-alert'
import {
  EditorStore,
  VIEWPORT_PRESETS,
  type DiscardTally,
  type EditorMode,
  type RemoteStale,
  type ViewportWidth,
} from '../store/editor-store'
import type { PendingEdit } from '../store/edit-queue'
import { LOSS_RANK } from '../store/loss-notice'
import {
  EditorStoreProvider,
  useEditorStore,
  useEditorStoreInstance,
} from '../store/use-editor-store'

/** 서버가 이유를 주지 않은 실패에 쓸 문장. */
const UNKNOWN_FAILURE = '프로젝트를 불러오지 못했습니다'
/** 조회 실패 화면의 제목. **프로젝트 이름과 겹치면 안 된다** — 아래 주석 참고. */
const FAILURE_TITLE = '설계서를 열지 못했습니다'
/** 아직 페이지를 고르지 않은 캔버스의 안내. */
const NO_PAGE_NOTICE = '왼쪽 트리에서 페이지를 고르세요'
/** 페이지 조회가 이유 없이 실패했을 때의 문장. 프로젝트 쪽(`UNKNOWN_FAILURE`)과 다르다. */
const PAGE_UNKNOWN_FAILURE = '페이지를 불러오지 못했습니다'

/** 줌 한 칸. 한계(0.05~2)는 스토어가 클램프하므로 여기서 다시 알 필요가 없다. */
const ZOOM_STEP = 0.25
/**
 * 축소 단추(−)가 멈추는 배율 — 한 칸(25%)이다. 스토어의 하한(5%)은 «화면 맞춤»이 좁은 칸에 넓은 프리셋을 맞추는 값이라, − 가 거기까지 내리면
 * 25% 다음 누름이 5% 로 뛴다(단추의 단계가 25 · 50 · 75 … 가 아니게 된다). 맞춤이 이보다 낮게 둔 배율에서 − 는 아무것도 안 하고 + 는 25% 로
 * 오른다(`useZoomCommands`).
 */
const ZOOM_OUT_FLOOR = ZOOM_STEP

/**
 * **화면에 들어가는 폭 ÷ 뷰포트 폭.** 잴 수 없으면 `null`이다.
 *
 * ## 무엇을 재는가 — 캔버스의 **content box**다
 *
 * 셋 중에서 고른다.
 *
 * | 상자 | 무엇인가 | 왜 아닌가 / 왜 맞는가 |
 * |---|---|---|
 * | `.wb-shell-canvas` | 스크롤되는 그리드 칸 | **이것이다.** 프레임이 잘리지 않고 들어가야 하는 자리가 여기다 |
 * | `.wb-shell-canvas-frame` | 뷰포트 폭 그대로의 상자 | 재려는 값이 이미 `viewportWidth`다 — 자기 자신을 나눈다 |
 * | `.wb-shell-canvas-surface` | 프레임 **안**의 문서 상자 | 프레임 안이라 프레임과 같은 폭이다. 같은 이유로 안 된다 |
 *
 * **`clientWidth`이지 `getBoundingClientRect()`가 아니다.** 둘의 갈림은 스크롤바다 —
 * `clientWidth`는 세로 스크롤바를 **빼고** 주고 `getBoundingClientRect().width`는 포함한다.
 * 프레임이 실제로 들어가야 하는 폭은 앞쪽이다. (프레임 쪽을 쟀다면 갈림이 하나 더
 * 있었다: `.wb-shell-canvas-frame`에는 `transform: scale()`이 걸려 있어
 * `getBoundingClientRect()`가 **변환 뒤** 크기를 준다. 캔버스에는 변환이 없어 이 갈림이
 * 없고, 그래서 지금 줌이 몇이든 이 계산이 같은 값을 낸다 — 두 번 눌러도 흔들리지 않는다.)
 *
 * **`padding`을 뺀다.** `clientWidth`는 padding box라 `.wb-shell-canvas`의 `padding: 24px`
 * 양쪽 48px이 들어 있다. 안 빼면 그만큼 넓게 잡아 프레임의 오른쪽이 잘린다.
 *
 * **`gap`은 뺄 것이 없다.** 여백은 `.wb-shell`의 그리드 `gap`(1px)이 칸 **사이**에 두는
 * 것이라 칸의 폭에 이미 반영돼 있고, 캔버스 안에는 무대 하나뿐이라 `gap`이 없다.
 *
 * ## 가운데 정렬은 보이는 폭으로 한다 — 그래서 뺄 여백이 없다
 *
 * 프레임은 **무대**(`.wb-shell-canvas-stage` — `CanvasFrame`) 안에 있고, 무대의 폭이 **보이는 폭**(프리셋 × 줌)이다. 무대가 `margin: 0 auto`로
 * 칸 가운데에 서므로, 맞춘 배율에서는 무대 폭이 곧 쓸 수 있는 폭이라 여백이 0 이다 — 쓸 수 있는 폭 ÷ 프리셋이 그대로 답이다.
 *
 * **프레임에 가운데 정렬을 걸면 두 가지가 틀린다**(Chrome, 창 1440 · 1280 × 좌측 기본 · 최대 × 프리셋 여섯 — 24칸 전부 가로 넘침):
 *
 * - **줌이 1 보다 작으면 변환 전 폭이 넘침으로 잡힌다.** `transform`은 레이아웃을 안 바꿔, 칸의 `scrollWidth`가 프리셋 + 안쪽 여백 48 이다
 *   (창 1440 · 프리셋 1920: 보이는 오른끝 843 < 칸 867 인데 `scrollWidth` 1968). 보이는 것은 다 들어갔는데 가로 막대가 선다.
 * - **좁은 프리셋의 가운데 정렬 여백을 못 읽는다.** 확대는 좌상단에서 오른쪽으로만 자라 여백만큼 넘치는데, 그 여백을 `getComputedStyle`의
 *   `marginLeft`가 `0px`로 준다(쓰인 값은 222px — 프리셋 375: 오른끝 996 > 칸 867).
 *
 * 무대는 캔버스 칸의 흐름 속 자식이라 칸의 넘침이 무대 폭(보이는 폭)으로 서고, 안의 프레임은 `transform`이 걸려 변환 뒤 상자로만
 * 넘침에 든다 — 변환 전 폭이 넘침으로 잡히던 것은 프레임이 칸의 흐름 속 자식이던 탓이다. 재는 판은 `build-test/editor-shell-layout.test.ts`의
 * «화면 맞춤»이다.
 *
 * ## 못 재는 경우가 있다
 *
 * 레이아웃이 없는 자리(jsdom, `display: none`)에서는 `clientWidth`가 0이고 계산된 CSS에
 * `padding`이 없다. 그때 나오는 0이나 `NaN`을 그대로 `setZoom`에 넘기면 **스토어가
 * 하한(0.05)으로 클램프해** 아무 이유 없이 5%가 된다 — 재지 못한 것과 "폭이 5%다"는 다른
 * 사실이므로 여기서 `null`로 갈라 부르는 쪽이 아무것도 안 하게 한다. **클램프를 여기서
 * 흉내 내는 것이 아니다** — 계산한 배율은 그대로 넘긴다(한계는 스토어 하나가 안다).
 */
function fitZoom(canvas: HTMLElement, viewportWidth: number): number | null {
  const style = getComputedStyle(canvas)
  const usable =
    canvas.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
  if (!Number.isFinite(usable) || usable <= 0) return null
  return usable / viewportWidth
}

/**
 * 재연결 재조회가 무언가를 잃었을 때의 안내.
 *
 * **두 조각을 따로 붙인다.** 보내지 못한 편집과 되돌리기 이력은 **다른 것**이고, 둘 중
 * 하나만 잃는 판이 실제로 있다(편집을 낸 적 없이 undo 스택만 있는 판, 그 반대의 판).
 * 한 문장으로 뭉뚱그리면 사용자가 무엇을 잃었는지 모른다.
 *
 * **`recover`의 문안을 건드리지 않는다**. 그쪽 문장은
 * `edit/edit-recovery.test.tsx`의 여러 케이스가 글자로 재고 있고, 이것은 **다른 사건**이다 —
 * 사용자가 낸 편집이 실패한 것이 아니라 연결이 끊겼다 붙은 것이다.
 *
 * **앞머리만 인자다.** 잃은 것을 세는 조각들은 재연결과 복원이 **똑같이** 잃는데,
 * *"왜 다시 읽었는가"*는 사용자에게 다른 사실이다 — 하나는 연결이 끊겼다 붙은 것이고
 * 하나는 자기가 방금 되돌린 것이다. 문장을 통째로 두 벌 두면 조각의 문안이 갈린다.
 *
 * **버린 편집은 둘로 센다 — 이미 나간 것과 안 나간 것**(`EditorStore.wasSent`). 나간 편집은 서버에 닿아 커밋됐을 수 있다 — 다시
 * 읽은 판이 그 커밋 **앞**을 읽었으면 그 편집은 서버에 있는데 화면에 없고, 뒤늦은 답은 큐에 없어 버려지며 방송은 낸 연결을
 * 뺀다. 그것을 «취소됐다»고 말하면 사용자가 믿고 다시 해 **두 번 선다**(Chrome: 배너 단추의 클릭이 blur 로 낸 편집이 조회보다
 * 8ms 먼저 나가, WS 를 10ms 늦춘 판에서 3/3 «취소됐다» · 서버에는 그 글). 그래서 모른다고 말하고 새로고침을 권한다 — 편집
 * 실패 수습의 «모름»(`edit/use-edit-commit.tsx`의 `unknownNotice`)과 같은 판정이다.
 */
function resyncNotice(lead: string, lost: { unsent: number; sent: number }, hadUndo: boolean): string {
  const parts = [lead]
  if (lost.sent > 0) {
    parts.push(`보낸 편집 ${lost.sent}개는 답을 받기 전이라 서버에 반영됐는지 알 수 없습니다 — 새로고침해 서버 상태를 확인하세요.`)
  }
  if (lost.unsent > 0) parts.push(`아직 저장되지 않은 편집 ${lost.unsent}개가 취소됐습니다.`)
  if (hadUndo) parts.push('되돌리기 이력이 초기화됐습니다.')
  return parts.join(' ')
}

/**
 * **목록을 받는 동안 페이지가 다시 실려 새로고침 이력을 싣지 않았을 때의 한 줄**(`restoreUndo` · `EditorStore.restoreUndoStack`의 `'reloaded'`).
 * 다시 싣기는 그때 스택이 비어 있어 이력을 잃었다고 말하지 않았다(`tellLost`의 `hadUndo`) — 말하지 않으면 새로고침한 사람은 되돌리기가 왜 꺼져
 * 있는지 모른다. 다시 새로고침하면 서버 판에서 다시 싣는다.
 */
const UNDO_RESTORE_DROPPED_NOTICE = '페이지를 다시 불러와 되돌리기 이력을 싣지 않았습니다 — 새로고침하면 다시 불러옵니다.'

/** 복원 뒤 다시 읽기가 실패해 판을 비우며 편집을 버렸을 때의 앞머리. 실패의 까닭은 캔버스가 말한다. */
const RELOAD_FAILED_LEAD = '페이지를 다시 불러오지 못했습니다.'

/**
 * 판을 다시 읽기 전에 **보낸 편집의 답을 기다리는** 한도(`editsAnswered`).
 *
 * 답은 보통 수 ms 뒤에 온다. 늦어지는 판은 서버가 그 편집을 행 잠금에 줄 세웠거나(남의 쓰기가 페이지 행을 쥐었다) 패킷을
 * 다시 보내는 판이다 — 3 초는 몇 번 다시 보내는 것(RTO 200ms 부터 두 배씩)까지 덮는다. 그보다 늦으면 «늦다»가 아니라 «안
 * 온다»로 본다(끊겼는데 아직 모른다 · 서버가 멈췄다) — 기다림을 끝내고 읽는다. 그때 나간 편집은 `resyncNotice`가 «반영됐는지
 * 모름»으로 말한다(Chrome: 행을 4.5s 쥔 판 — 3s 뒤 읽어 옛 판 · 그 문장 · 서버에는 그 글). 사람이 누른 단추의 답을 몇 초 넘게
 * 붙들지 않는다.
 */
const SENT_EDIT_WAIT_MS = 3_000

/**
 * **로그아웃이 두고 간 편집의 한 줄**(`settleEdits`) — 로그인 화면이 그린다(`session/session-context.tsx`의 `useSignOutNotice`).
 * 나간 편집 가운데 답을 못 받은 것(`sent`)은 서버에 반영됐는지 모른다 — 로그아웃 뒤에 커밋될 수도 있다. 커밋 전에 거절된 것(`refused`)과 한 번도
 * 안 나간 것(`unsent`)은 저장되지 않았다. 셋 다 0 이면 `null`.
 */
export function logoutLossNotice(sent: number, unsent: number, refused = 0): string | null {
  if (sent === 0 && unsent === 0 && refused === 0) return null
  const parts = [refused > 0 ? `거절된 편집 ${refused}개` : '', unsent > 0 ? `보내지 않은 편집 ${unsent}개` : ''].filter((part) => part !== '')
  const lost = parts.length === 0 ? '' : `${parts.join('와 ')}는 저장되지 않았습니다`
  if (sent === 0) return `로그아웃하며 ${lost} — 다시 로그인해 그 페이지를 확인하세요.`
  const tail = lost === '' ? '' : ` ${lost}.`
  return `로그아웃 전에 보낸 편집 ${sent}개의 답을 받지 못해 서버에 반영됐는지 알 수 없습니다.${tail} 다시 로그인해 그 페이지를 확인하세요.`
}

/**
 * **보낸 편집의 답(ack · 거절)을 기다린다** — 전송이 쉬면(`editStatus === 'idle'`) 풀린다. 한도(`SENT_EDIT_WAIT_MS`)나 `signal`로도
 * 풀린다. 판을 다시 싣는 두 이펙트와 로그아웃(`useLogout`의 `settle`)이 부른다.
 *
 * ## 왜 기다리나 — 판을 다시 싣는 단추는 그 클릭이 낸 편집과 겨룬다
 *
 * 속성 칸은 blur 에 커밋한다. 칸에 친 채 단추를 누르면 실클릭이 먼저 포커스를 옮겨 편집이 WS 로 나가고, 곧바로 단추가 조회를
 * 낸다 — 두 요청이 **다른 연결**로 겨룬다. 조회가 그 커밋 앞을 읽으면 `loadPage`가 나간 편집을 버리고 옛 판을 그린다. 답을
 * 받은 뒤에 읽으면 판이 그 편집을 품는다(Chrome: 행을 쥐어 편집을 줄 세운 판 · WS 를 10ms 늦춘 판 모두 화면 = 서버).
 *
 * **기다리는 값은 `editStatus` 하나고 그 값을 바꾸는 것은 전부 스토어를 지난다** — 구독이 모든 자리를 받는다. `'sending'`이면
 * 전송 루프가 편집을 내고 답을 기다리는 중이고, `'recovering'`이면 편집 실패 수습이 판을 다시 읽는 중이다(그 판을 먼저 싣게
 * 둔다). 전송 루프는 큐가 빌 때까지 이어서 내므로 그동안 낸 편집의 답까지 기다린다.
 *
 * jsdom 의 `fireEvent.click`은 포커스를 안 옮겨 blur 커밋이 안 난다 — 이 겨룸은 편집을 먼저 내고 누르는 케이스로 잰다.
 */
function editsAnswered(store: EditorStore, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const answered = (): boolean => store.getState().editStatus === 'idle'
    if (answered()) {
      resolve()
      return
    }
    const done = (): void => {
      stop()
      clearTimeout(timer)
      signal?.removeEventListener('abort', done)
      resolve()
    }
    const stop = store.subscribe(() => {
      if (answered()) done()
    })
    const timer = setTimeout(done, SENT_EDIT_WAIT_MS)
    signal?.addEventListener('abort', done)
  })
}

/**
 * **켜 둔 화면의 편집 권한이 바뀌었다는 통지**. 셸의 `canEdit`이 실행 중에 바뀔 때 선다 — 역할 이름이 아니라
 * «고칠 수 있는가»로 말한다(역할을 읽는 곳은 `projectAbilities` 하나다 · `test/role-access.test.ts`).
 *
 * **잃은 쪽이 «보내던 저장»을 말하는 까닭.** 강등 순간 나가 있던 쓰기는 서버가 커밋 순간의 권한으로 403 을
 * 내는데, 그 실패 문장이 설 자리는 숨은 폼 안이다 — 코멘트 게시 · 설명 저장 둘 다 403 이 **화면에 안 선다**
 * (Chrome 에서 잰 것). 문장을 폼 밖으로 옮기는 것은 그 패널의 일이라 여기서는 사용자가 «왜»를 알게 한다.
 */
const ROLE_NOTICE = {
  lost: '편집 권한이 없어져 편집 도구를 닫았습니다. 보내던 저장이 있었다면 거절됐을 수 있습니다 — 친 글은 지우지 않았습니다.',
  gained: '편집 권한이 생겨 편집 도구를 열었습니다.',
  unknown: '권한이 바뀌었는데 확인하지 못해 편집 도구를 닫았습니다. 새로고침해 확인하세요.',
} as const

/** 재연결로 다시 읽었을 때의 앞머리. */
const RESYNC_LEAD = '연결이 다시 붙어 페이지를 서버 상태로 다시 불러왔습니다.'
/** 트리가 열린 페이지를 잃어 다시 읽었더니 페이지가 있었다(트리가 잠깐 낡았다) — 판이 달랐을 때의 앞머리(`CanvasFrame`의 `goneCheck`). */
const PAGE_CHECK_LEAD = '페이지를 서버 상태로 다시 불러왔습니다.'
/** 열린 페이지가 서버에서 지워졌다 — 판을 비우며 버린 편집을 말할 때의 앞머리(`CanvasFrame`의 `goneCheck`). 누가 지웠는지 말하지 않는다. */
const PAGE_GONE_LEAD = '열어 둔 페이지가 지워졌습니다.'
/** 내가 스냅샷을 복원해 다시 읽었을 때의 앞머리. **재연결과 다른 사건이다.** */
const RESTORED_LEAD = '스냅샷을 복원해 페이지를 다시 불러왔습니다.'
/**
 * 복원 신호로 선 배너의 단추로 다시 읽었을 때의 앞머리. **누가 복원했는지 말하지 않는다** — 배너의 문장과 같은 까닭이다(`shell/remote-alert.tsx`의
 * `NOTICE`). 위 문장을 쓰면 남의 복원을 내가 한 일로, «다른 사람이 …»를 쓰면 알아보지 못한 내 복원을 남의 일로 말한다.
 */
const SIGNALLED_RESTORE_LEAD = '복원된 상태로 페이지를 다시 불러왔습니다.'
/**
 * 답을 잃은 내 복원 뒤 배너의 단추로 다시 읽었을 때의 앞머리(`RemoteStale`의 `own`) — 복원됐는지 모르거나(`EditorStore.markRestoreUnanswered`),
 * 그 복원 id 의 신호가 왔다(`EditorStore.markRestored` — 흉내 낸 남의 복원일 수 있어 내 복원이라고 하지 않는다).
 */
const OWN_RESTORE_LEAD: Record<NonNullable<RemoteStale['own']>, string> = {
  unanswered: '복원됐는지 확인하려고 페이지를 서버 상태로 다시 불러왔습니다.',
  landed: SIGNALLED_RESTORE_LEAD,
}

/** 우측 패널의 탭. **넷이 선언되고 모드마다 셋이 보인다** — 표는 아래 `PANEL_TABS`다. */
type PanelTab = 'props' | 'page' | 'comments' | 'interactions'

/**
 * 모드별 탭 구성. **설계서 「설계서 화면 구조」의 표를 그대로 옮긴 것이다.**
 *
 * | 모드 | 탭 |
 * |---|---|
 * | 편집 | **속성**(선택 노드) / 코멘트 / 상호작용 |
 * | 뷰 | **페이지 설명** / 코멘트 / 상호작용 |
 *
 * **첫째만 갈린다.** 코멘트·상호작용이 두 모드에 다 있는 것은 그 표가 그렇고, 캔버스의
 * 번호 마커가 두 모드에 다 있는 것(`canvas/canvas.tsx`)과도 짝이 맞는다 — 뷰 모드에서 설계서를 읽는
 * 사람이 보는 것이 바로 그 둘이다.
 *
 * **표를 모드로 키를 잡는 것이 요점이다.** 삼항으로 갈면 *"뷰 모드면 첫 탭만 바꾼다"*가
 * 코드에 안 보이고, 탭이 하나 더 갈리는 날 조건이 둘이 된다.
 */
const PANEL_TABS: Record<EditorMode, readonly { id: PanelTab; label: string }[]> = {
  edit: [
    { id: 'props', label: '속성' },
    { id: 'comments', label: '코멘트' },
    { id: 'interactions', label: '상호작용' },
  ],
  view: [
    { id: 'page', label: '페이지 설명' },
    { id: 'comments', label: '코멘트' },
    { id: 'interactions', label: '상호작용' },
  ],
}

/** 탭 하나의 본문. **표 기반이라 탭이 늘어도 삼항이 깊어지지 않는다**. */
const PANEL_BODIES: Record<
  PanelTab,
  // `canEdit`은 **넷 다** 본다(근거는 셸의 `canEdit` 주석).
  (props: { projectId: string; pageId: string | undefined; canEdit: boolean }) => ReactElement
> = {
  props: PropertyPanel,
  page: PageDescriptionPanel,
  comments: CommentPanel,
  interactions: InteractionPanel,
}

/**
 * 조회 상태. 성공과 실패를 판별 유니온으로 가른다 — `project === null`로 실패를 판정하면
 * 응답이 오기 전과 실패가 같은 값이 되어, 로딩 중에 오류 화면이 떴다 사라진다.
 */
type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; project: ProjectView }
  | { status: 'failed'; failure: Failure }

/**
 * 라우트가 잡는 컴포넌트. `/projects/:projectId`와 `/projects/:projectId/pages/:pageId`가
 * 같은 이것을 그린다 — 페이지를 연 것은 셸 안의 캔버스가 달라지는 일이지 다른 화면이 아니다.
 */
export function EditorShellRoute(): ReactElement {
  const params = useParams()
  const projectId = params.projectId ?? ''
  const api = useApi()
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  /**
   * 스토어는 셸이 사는 동안 하나다. `useMemo`가 아니라 ref인 것은 `useMemo`가 캐시일 뿐
   * 동일성 보장이 아니기 때문이다 — React가 값을 버리면 새 스토어가 생기고, 그 순간 편집
   * 상태가 조용히 초기화된다.
   */
  const storeRef = useRef<EditorStore | null>(null)
  if (storeRef.current === null) storeRef.current = new EditorStore()
  const store = storeRef.current

  /**
   * **역할을 아는가**. 멤버십이 바뀌었다는 신호를 받고 다시 읽기가 실패하면 `false`다 — 바뀐 것은 알고 무엇으로
   * 바뀌었는지는 모른다. 그때 셸은 고칠 수 없는 쪽으로 선다(아래 `reread`의 표).
   */
  const [roleKnown, setRoleKnown] = useState(true)
  /**
   * 다시 읽기의 차례. **늦게 낸 것의 답만 받는다** — 신호가 둘 잇달아 오면(내렸다 올림) 두 조회의 답이 거꾸로 올 수 있고,
   * 앞 것이 이기면 화면이 **지난 역할**로 선다. 첫 조회(아래 이펙트)도 차례를 올려 앞 프로젝트의 늦은 답을 버린다.
   */
  const reads = useRef(0)
  /**
   * **답을 못 받은 멤버십 신호가 있다**. 신호의 조회가 뒤의 조회(`joined` · `refused`)에 차례를 뺏기면, 그 뒤의 조회가
   * 실패했을 때 «바뀌었다는 신호가 없다»로 읽어 조용히 앞 역할을 두게 된다 — 신호는 **있었다.** 그래서 신호가 온 것을 차례와
   * 따로 적어 두고, **어느 차례든 성공한 답이 올 때까지** 실패를 신호의 실패(«역할을 모른다»)로 읽는다. 판정은 아래 `reread`의
   * 한 줄이다.
   */
  const signalUnanswered = useRef(false)
  /**
   * **이 프로젝트를 떠나면 끊기는 신호** — 첫 조회와 다시 읽기(`reread`)가 함께 싣는다(`ReadOptions.cancel`).
   * 답만 버리면(`alive` · `reads`) 떠난 셸의 `getProject`가 끝까지 내려받힌다(Chrome: 조회를 붙잡아 둔 채 목록으로 나가면
   * 떠난 조회도 200 으로 끝난다). **차례 장치(`reads`)와 겹치지 않는다** — 끊는 것은 «떠남»(프로젝트가 바뀜 · 셸이 내려감) 하나이고, 늦게 낸
   * 다시 읽기가 앞 것을 끊지는 않는다(앞 것의 답은 여전히 `reads`가 버린다). 끊긴 조회의 거절도 차례가 이미 지나 버려진다.
   */
  const leaving = useRef<AbortController | null>(null)

  /**
   * **켜 둔 셸이 프로젝트를 다시 읽는다**. 역할을 **실행 중에** 바꾸는 유일한 길이다 — 셸은 역할을 첫 조회의
   * 응답에서 읽고(`EditorShell`의 `abilities`), 여기서 그 응답을 갈아 끼운다. 역할을 읽는 줄은 그대로 하나다.
   *
   * | 무엇이 불렀나 | 읽는 동안 | 성공 | 401 | 404(멤버에서 빠졌다) | 그 밖(시간 제한 · 5xx · 연결) |
   * |---|---|---|---|---|---|
   * | `changed` — 서버가 «내 멤버십이 바뀌었다»를 보냈다 | **앞 역할 그대로**(한 번의 `GET` — 서버가 계속 판정한다) | 새 역할로 선다 | 로그인 화면(첫 조회와 같다) | «설계서를 열지 못했습니다»(첫 조회와 같다 — 셸째 내려간다) | **역할을 모른다** — 고칠 수 없는 쪽으로 서고 말한다(`ROLE_NOTICE.unknown`) |
   * | `joined` — 룸에 들었다(처음 · 다시 붙음) | 앞 역할 그대로 | 새 역할로 선다(같으면 아무 일 없다) | 로그인 화면 | «설계서를 열지 못했습니다» | **조용히 둔다** — 바뀌었다는 신호가 없다(재연결의 페이지 다시 읽기와 같다). **답을 못 받은 `changed`가 있으면 그쪽으로 읽는다**(`signalUnanswered`) |
   * | `refused` — 연결이 열리지 못하고 닫혔다(핸드셰이크 거절 — `MembershipCause` 표) | 앞 역할 그대로 | 같다 | 로그인 화면 | «설계서를 열지 못했습니다» — **셸째 내려가 재연결도 멈춘다** | `joined`와 같다 |
   *
   * **`joined`에 읽는 것이 여는 조회를 하나 늘린다** — 페이지를 열 때 `getProject`가 둘(첫 조회 + 룸에 든 뒤)이다. 재연결은
   * 하나다(두 번째 `open`이 아니라 `joined`에 읽는다 — `open`에 읽으면 룸에 들기 전의 창이 남는다). `refused`는 거절마다
   * 하나다 — 서버가 죽어 있으면 재연결 간격(끝 값 10초)마다 하나.
   *
   * **읽는 동안 입구를 닫지 않는다.** 닫으면 승격 · owner 넘기기에도 입구가 한 번 닫혔다 열리고, 그때 열린 편집 상자 ·
   * 잡은 잠금이 함께 닫혔다 열린다(잠금은 그 사이 남에게 갈 수 있다). 앞 역할이 틀렸어도 그 창의 쓰기는 서버가 커밋 순간의
   * 권한으로 거절한다.
   */
  const reread = useCallback(
    async (cause: MembershipCause): Promise<void> => {
      const turn = ++reads.current
      if (cause === 'changed') signalUnanswered.current = true
      try {
        const cancel = leaving.current?.signal
        const project = await api.getProject(projectId, cancel === undefined ? undefined : { cancel })
        if (reads.current !== turn) return
        signalUnanswered.current = false
        setState({ status: 'ready', project })
        setRoleKnown(true)
      } catch (caught) {
        if (reads.current !== turn) return
        const failure = toFailure(caught, UNKNOWN_FAILURE)
        if (failure.kind === 'signed-out' || (caught instanceof ApiError && caught.code === 'not-found')) {
          setState({ status: 'failed', failure })
          return
        }
        // **판정은 이 한 줄이다** — 이 차례가 무엇이었든, 답을 못 받은 신호가 있으면 역할을 모른다.
        if (signalUnanswered.current) setRoleKnown(false)
      }
    },
    [api, projectId],
  )
  const onMembership = useCallback((cause: MembershipCause) => void reread(cause), [reread])

  useEffect(() => {
    // 응답이 오기 전에 화면이 바뀌면 결과를 버린다(`require-auth`와 같은 이유).
    let alive = true

    // 프로젝트가 바뀌면 앞 프로젝트의 문서·선택·줌이 남지 않게 지운다. 노드 id는 문서
    // 안에서만 뜻이 있으므로, 남으면 선택 표시가 존재하지 않는 노드를 가리킨다.
    // 옮겨 가는 프로젝트를 함께 넘긴다 — 앞 편집의 답을 기다리던 전송 루프가 이어 보낼 곳이다(`EditorStore.queueProjectId`).
    store.reset(projectId)
    // 앞 프로젝트의 이름이 새 주소에서 잠깐 보이는 것도 막는다. 라우터는 두 프로젝트
    // 주소 사이에서 같은 컴포넌트를 다시 쓰므로 상태가 그대로 남는다.
    setState({ status: 'loading' })
    setRoleKnown(true)
    signalUnanswered.current = false
    // 앞 프로젝트로 나가 있던 다시 읽기의 답을 버린다(`reads`).
    const turn = ++reads.current
    // 이 프로젝트를 떠나면 끊는다(`leaving`) — 첫 조회도 다시 읽기도.
    const leave = new AbortController()
    leaving.current = leave

    // `.then(ok, err)`이 아니라 try/catch인 것은 호출 자체가 그 자리에서 던질 수도 있기
    // 때문이다. 그 예외는 이펙트 밖으로 새어 나가 앱 트리를 통째로 죽인다.
    async function load(): Promise<void> {
      try {
        const project = await api.getProject(projectId, { cancel: leave.signal })
        if (alive && reads.current === turn) setState({ status: 'ready', project })
      } catch (caught) {
        if (!alive || reads.current !== turn) return
        // 실패 → 화면 규칙은 `api/failure.tsx`에 있다. 여기서 다시 판정하지 않는다.
        setState({ status: 'failed', failure: toFailure(caught, UNKNOWN_FAILURE) })
      }
    }

    void load()
    return () => {
      alive = false
      leave.abort()
    }
  }, [api, projectId, store])

  if (state.status === 'loading') {
    return (
      <main className="wb-shell-notice">
        <p role="status">불러오는 중…</p>
      </main>
    )
  }

  if (state.status === 'failed') {
    // 세션이 끊겼으면 오류 화면이 아니라 로그인이다. 여기까지 온 사용자는 문지기를
    // 이미 통과한 뒤라, 이 판정이 없으면 새로고침 말고는 로그인 화면에 갈 길이 없다.
    if (state.failure.kind === 'signed-out') return <SignedOut />

    /**
     * **셸 대신** 오류다. 실패했는데도 셸의 랜드마크가 남아 있으면, 셸을 보는 테스트가
     * 오류 화면 위에서 통과한다. 제목도 프로젝트
     * 이름과 겹치지 않아야 같은 이유로 안전하다.
     */
    return (
      <main className="wb-shell-notice">
        <h1>{FAILURE_TITLE}</h1>
        <p role="alert">{state.failure.message}</p>
      </main>
    )
  }

  return (
    <EditorStoreProvider store={store}>
      {/* 캔버스 iframe 의 문서를 머리의 `…` 메뉴가 아는 통로(바깥 누름 닫기) — 캔버스와 머리의 공통 조상이 셸이라 셸째 감싼다. */}
      <CanvasDocumentProvider>
        {/* **프로젝트가 고정한 테마**(`theme/project-theme.tsx`) — 캔버스 · 속성 패널 · 패턴 고르개가 읽고, 셸이 프레임 · 다시 읽기로 따라잡게 한다. */}
        <ProjectThemeProvider projectId={state.project.id}>
          {/* 끌기의 두 대상(구조 트리 · 캔버스)을 경로 층이 아는 통로(`drag/use-placement.ts`) — 둘의 공통 조상이 셸이다. */}
          <PlacementRegionsProvider>
            {/* **지금 고른 화면 상태**(`shell/use-view-state.ts`) — 사람 · 탭마다의 값이라 셸째 한 번 깔고(셸의 머리 `…` 도 읽는다), 페이지를
                옮기면 기본으로 돌아간다. */}
            <ViewStateProvider pageId={params.pageId}>
              <EditorShell
                project={state.project}
                roleKnown={roleKnown}
                pageId={params.pageId}
                onMembership={onMembership}
              />
            </ViewStateProvider>
          </PlacementRegionsProvider>
        </ProjectThemeProvider>
      </CanvasDocumentProvider>
    </EditorStoreProvider>
  )
}

/** 세 패널과 상단 도구. 스토어는 컨텍스트에서 꺼낸다. */
function EditorShell(props: {
  project: ProjectView
  /** 역할을 아는가 — 모르면 아무것도 못 하는 쪽으로 선다(`EditorShellRoute`의 `reread`). */
  roleKnown: boolean
  pageId: string | undefined
  /** 역할을 다시 읽을 순간이다(신호 · 룸에 듦 · 핸드셰이크 거절 — `MembershipCause`) — 라우트가 프로젝트를 다시 읽는다. */
  onMembership: (cause: MembershipCause) => void
}): ReactElement {
  const store = useEditorStoreInstance()
  const mode = useEditorStore(store, (s) => s.mode)
  /**
   * 이 사람이 이 프로젝트에 무엇을 할 수 있나 — **역할을 읽는 곳은 이 셸의 이 줄이다**(`projects/project-actions.ts`).
   * 역할은 **실행 중에 바뀐다** — 라우트가 프로젝트를 다시 읽으면 이 줄이 새 값으로 다시 돈다. 모르면
   * (`roleKnown` 거짓) 판정 함수의 «모르는 값»(아무것도 못 한다)이다.
   */
  const abilities = projectAbilities(props.roleKnown ? props.project.role : undefined)
  /**
   * **설계서를 고칠 수 있는가**(설계서 「권한 모델」 — viewer 는 *"조회 전용 — 편집·코멘트 모두 불가"*). 이 값 하나가 에디터의
   * 쓰기 입구를 전부 가른다 — 받는 쪽은 역할을 모르고 이 불리언만 받는다.
   *
   * **숨기느냐 끄느냐는 자리의 종류로 가른다 — 한 자리에 한 관례다:**
   *
   * | 자리 | viewer 에게 | 왜 |
   * |---|---|---|
   * | **동작 입구** — 메뉴 트리의 줄 행동(`+` · `…` · 뿌리 `+`) · 끌어 놓기 · 빈 트리의 «최상위 메뉴» · 페이지 JSON · 구조 트리의 줄 행동(프리셋 · 패턴 포함) · 되돌리기 · 코멘트 폼 · 코멘트의 «수정» · «삭제» · 트리 두 곳의 단축키 | **숨긴다**(DOM 에서 뺀다) | 역할은 기다려서 풀리는 것이 아니다 — 켜질 길이 없는 회색 단추는 소음이다(스냅샷 복원 · 설정의 테마 고르개 · «페이지 설명»과 같은 판단). 뷰 모드가 편집 도구를 빼는 방식과도 같아서 viewer 의 편집 모드 좌측은 뷰 모드의 좌측과 같다 |
   * | **값을 보이는 칸** — 속성 패널 · 상호작용 패널의 위젯 | **끄고 이유 한 줄**(`panels/property-panel.tsx`의 `VIEWER_NOTICE`) | 그 칸이 곧 값의 표시다 — 숨기면 viewer 가 읽을 것을 잃는다. 그리고 두 패널에는 «꺼진 이유» 관례가 이미 있다(남의 잠금 — `lockedNotice`). |
   * | **잠금** — 노드를 고르는 것 | **잡지 않는다**(`useNodeLock`) | 고르기는 읽기다(속성 · 코멘트를 보려고 고른다). 서버는 viewer 의 `lock`을 조용히 버리지만(`MIN_ROLE_FOR_FRAME`) 보내는 것 자체가 쓰기 프레임이다 |
   *
   * **조회는 그대로다** — 모드 토글 · 뷰포트 · 줌 · 페이지 옮기기 · 노드 고르기 · 코멘트 읽기 · 탭 · 내보내기 · 스냅샷 목록.
   * **역할이 바뀌면 새로고침 없이 여기 닿는다**(서버의 `membership-changed` → 라우트의 다시 읽기). 바뀌는 순간
   * 무엇이 어떻게 되는지는 받는 쪽이 이미 갖는다 — 입구는 이 값으로 숨고 서고, 열린 편집 상자는 안 그려지되
   * 초안은 저장소에 남고(다시 editor 면 돌아온다), 잠금은 `useNodeLock`의 표대로 놓이고 잡힌다.
   */
  const canEdit = abilities.editDesign
  /**
   * **편집 권한이 바뀐 순간을 말한다**(`ROLE_NOTICE`). 처음 선 값에는 말하지 않는다 — 바뀐 것이 아니다. 다음 변화까지
   * 남는다(새로고침하면 사라진다).
   */
  const [roleNotice, setRoleNotice] = useState<string | null>(null)
  const shownCanEdit = useRef(canEdit)
  useEffect(() => {
    if (shownCanEdit.current === canEdit) return
    shownCanEdit.current = canEdit
    setRoleNotice(canEdit ? ROLE_NOTICE.gained : props.roleKnown ? ROLE_NOTICE.lost : ROLE_NOTICE.unknown)
  }, [canEdit, props.roleKnown])
  /**
   * **연결이 다시 붙었다는 신호**. 값에는 뜻이 없고 오를 때마다 캔버스가 페이지를
   * 다시 읽는다.
   *
   * **스토어에 두지 않는 이유:** `EditorState`가 드는 것은 **페이지 편집** 상태다
   * (문서·`headSeq`·undo 스택·전송 큐). 재조회 신호는 그 축이 아니고, 거기 얹으면
   * 편집과 무관한 이유로 스토어 구독자가 다시 그린다.
   */
  const [resyncToken, setResyncToken] = useState(0)

  /**
   * **캔버스 칸을 손에 쥐는 자리.** `화면 맞춤`이 누른 순간의 폭을 재려면 그 상자가 필요한데,
   * 버튼은 하단 바에 있고 상자는 가운데 칸이라 서로 안 보인다.
   *
   * **`document.querySelector('.wb-shell-canvas')`로 찾지 않는다.** 그러면 클래스 이름이
   * 배선이 되어, 이름을 바꾸는 날 아무것도 실패하지 않은 채 버튼만 조용히 죽는다.
   * ref는 그 연결을 타입으로 들고 있다.
   */
  const canvasRef = useRef<HTMLElement>(null)

  /**
   * **내가 스냅샷을 복원했다는 신호.** 값에는 뜻이 없고 오를 때마다 **복원이 바꾸는 것을 떠 있는 자리가 전부**
   * 다시 읽는다 — 앞의 두 토큰과 같은 모양이고 같은 이유로 스토어에 두지 않는다.
   *
   * | 복원이 바꾸는 것(`services/restore-plan.ts`의 단계 표) | 다시 읽는 자리 |
   * |---|---|
   * | 메뉴 · 페이지 목록 · 제목 | 좌측 트리(`MenuTree`의 `reloadToken`) |
   * | 열린 페이지의 문서 | 캔버스(`CanvasFrame`의 복원 재조회) — 구조 트리 · 속성 패널은 스토어에서 읽는다 |
   * | 코멘트 · 페이지 설명 | 우측 본문 — **탭을 다녀온 것처럼 다시 세운다**(`RightPanel`의 `key`) |
   * | 테마 바인딩 | `theme-changed` 프레임(복원도 보낸다 — `theme/project-theme.tsx` 의 `applyFrame`) · 놓치면 다시 읽기의 `themeRev`(`catchUp`) — 이 신호를 안 탄다 |
   *
   * **자리를 하나 빠뜨리면 탭을 다녀오거나 새로고침해야 맞는다** — 되돌렸다는 알림 아래 옛 코멘트 목록이 조용히 남는다
   * (Chrome: 스냅샷의 코멘트를 지운 뒤 복원하면 서버 1 · 탭 0). 복원이 바꾸는 것이 늘면 이 표에 줄을 더한다.
   *
   * **이 신호가 필요한 까닭:** 복원은 에디터 **위에** 뜨는 대화 상자에서 일어나므로 셸이 다시
   * 마운트되지 않는다 — 셸 밖 라우트에서 **돌아오는 길**이 있으면 저절로 다시 읽히겠지만
   * 그 길이 없다.
   *
   * **`resyncToken`을 재사용하지 않는다.** 두 사건은 **범위와 실패 정책이 다르다.**
   *
   * | | 재연결(`resyncToken`) | 복원(`restoredToken`) |
   * |---|---|---|
   * | 무엇이 달라졌나 | 끊긴 동안 놓친 프레임(이 페이지의 편집 · `menu-changed`) | **프로젝트 전체** — 페이지가 생기거나 사라진다 |
   * | 트리를 다시 읽나 | **읽는다** — 끊긴 동안의 `menu-changed`가 사라졌다(`MenuTree`의 `resyncToken`). 실패하면 조용히 둔다 | **읽는다** — 목록 자체가 바뀐다 |
   * | 재조회가 실패하면 | 조용히 둔다(화면은 재연결 전과 같고 잃은 것이 없다) | **말한다** — 화면에 남은 문서가 프로젝트의 상태가 아니라는 것을 이미 알기 때문이다 |
   *
   * 한 토큰으로 접으면 저 셋을 갈 자리가 없어진다 — 재연결이 복원 배너를 거두는 다시 읽기가 된다(코멘트 · 설명 · 테마는 안 읽는데).
   */
  const [restoredToken, setRestoredToken] = useState(0)
  /**
   * **이 셸이 본 가장 큰 `menu-changed` 번호** — 좌측 트리(`MenuTree`의 `remoteRev`)가 제 트리의 번호보다 크면 다시 받는다. 가장 큰 것만 든다 —
   * 방송은 연결마다 자격을 본 뒤 보내 두 쓰기의 프레임이 거꾸로 닿을 수 있다(서버 `ws/broadcast.ts`의 `deliver`).
   */
  const [menuRev, setMenuRev] = useState(0)
  const onMenuChanged = useCallback((rev: number) => setMenuRev((seen) => Math.max(seen, rev)), [])
  /**
   * **트리가 열린 페이지를 잃었다**(`MenuTree`의 `onPageGone`) — 캔버스가 그 페이지를 다시 읽고, 서버에도 없으면 «페이지가 사라짐»으로 간다
   * (`CanvasFrame`의 `goneCheck`). `at`은 신호마다 오르는 수다 — 같은 페이지를 다시 잃어도 새 신호다.
   */
  const [pageGone, setPageGone] = useState<{ pageId: string; at: number } | null>(null)
  const onPageGone = useCallback((gone: string) => setPageGone((last) => ({ pageId: gone, at: (last?.at ?? 0) + 1 })), [])
  /** 트리가 사라진 대상의 입력 · 상자를 닫으며 남기는 한 줄 — 하단 바(잃음 통지는 안 덮는다 · `panels/alias-edit.tsx`의 같은 자리). */
  const onTreeDropped = useCallback(
    (message: string) => {
      if (!store.showsLoss()) store.setEditFailure({ kind: 'message', message })
    },
    [store],
  )
  /**
   * **이 셸이 선 `reset` 세대**(`EditorStore.resetGeneration`). 셸 안에서 다른 프로젝트로 가면(뒤로 · 앞으로) 라우트는 스토어를 그대로 두고 이
   * 셸을 내린 뒤 새 셸을 세운다 — 복원을 보낸 몸체는 내려간 셸의 콜백을 쥔 채 답을 받는다. 그 콜백이 스토어에 쓰면 산 셸의 판을 바꾼다: 답이
   * 돌아온 셸의 복원 신호를 넘기고(다시 읽기는 내려간 셸에서 돌아 아무것도 안 한다), 다시 읽기 시작 표시가 다음 프로젝트의 복원 배너를 메뉴 ·
   * 테마를 다시 읽기 전에 풀게 하고, 답 잃음이 무관한 프로젝트에 «복원됐는지 모릅니다»를 세운다(Chrome:
   * `apps/web/build-test/editor-restore-signal-order.test.ts` «다른 프로젝트로 갔다 돌아옴» · «그 답이 거기 옴» · «그 답을 거기서 잃음»).
   * 그래서 복원 콜백과 `reloadAfterRestore`는 세대가 같을 때만 스토어에 쓴다. 거절 콜백은 `reset`이 미뤄 둔 목록을 비운 뒤라 거르지 않아도
   * 지금은 아무것도 안 바꾼다 — 같은 규칙으로 건다. 보냄(`onRestoreSent`)은 산 셸에서만 나므로 거르지 않는다.
   */
  const [shellGeneration] = useState(() => store.resetGeneration())
  const shellLive = useCallback(() => store.resetGeneration() === shellGeneration, [store, shellGeneration])
  /** 그 신호를 누가 올렸나 — 다시 읽으며 잃은 것을 말할 때의 앞머리다(`CanvasFrame`의 `applyServerPage`). 신호와 함께 바뀐다. */
  const [restoredLead, setRestoredLead] = useState(RESTORED_LEAD)
  /**
   * **복원 뒤 다시 읽기의 입구 하나** — 내가 복원했을 때(스냅샷 대화 상자)와 남의 복원을 배너의 단추로 다시 읽을 때가 함께 탄다. 한
   * 자리에서 올려야 한쪽 입구가 다시 읽을 자리를 빠뜨리지 않는다(`restoredToken` 표).
   *
   * **다시 읽기가 시작된 것을 스토어에 먼저 적는다**(`EditorStore.beginRestoreReread`) — 복원 배너는 이 다시 읽기의 판만 풀고, 그 사이 온 복원
   * 신호가 있으면 안 푼다.
   */
  const reloadAfterRestore = useCallback(
    (lead: string) => {
      if (!shellLive()) return
      store.beginRestoreReread()
      setRestoredLead(lead)
      setRestoredToken((token) => token + 1)
    },
    [store, shellLive],
  )

  /**
   * **룸에 붙어 있는다**(룸은 프로젝트 단위 하나다). 페이지를 옮겨도 연결은
   * 그대로다: 페이지마다 다시 붙으면 옮기는 동안 남의 변경을 놓친다.
   *
   * **`RealtimeProvider`가 없으면 아무것도 안 한다**(`realtime/context.tsx`) — 그래서 이 줄이
   * 에디터를 렌더하는 기존 화면 테스트를 건드리지 않는다.
   *
   * **두 번째 이후의 연결에서 신호가 온다**. 끊긴 동안 남이 낸 편집의 프레임은 사라졌고,
   * 그것을 갭으로 알아채려면 누군가 다음 편집을 내야 한다 — **아무것도 안 내고 보고만 있는
   * 사람은 스스로 수렴하지 않는다**. 다시 붙은 것 자체를 신호로 삼으면 그
   * 사람의 화면도 맞춰진다.
   */
  const theme = useProjectTheme()
  useRealtime(
    props.project.id,
    useCallback(() => setResyncToken((token) => token + 1), []),
    // **역할은 룸에 들 때마다 다시 읽는다**(`MembershipCause` — 끊긴 동안의 `membership-changed`도 사라졌다).
    props.onMembership,
    theme.applyFrame,
    onMenuChanged,
  )
  /**
   * **테마를 따라잡는다** — 라우트의 다시 읽기(룸에 듦 · 다시 붙음 · 멤버십 신호)가 받은 `themeRev` 가 쥔 바인딩보다 새것이면 다시 읽는다.
   * 끊긴 동안 놓친 `theme-changed` 는 이 길로만 닿는다(프레임은 다시 오지 않는다).
   */
  const { catchUp } = theme
  useEffect(() => catchUp(props.project.themeRev), [catchUp, props.project])

  /**
   * **고른 노드를 서버에 알린다**(설계서 「소프트 잠금」 — 선택이 곧 잠금이다). `pageId`는 주소에서 푼 값이다:
   * 스토어의 `openPageId`를 쓰면 주소가 바뀐 뒤 한 커밋 동안 **앞 페이지의 노드를 새 주소에서
   * 잡는다**(`useOpenPage`의 머리말).
   */
  useNodeLock(props.pageId, canEdit)

  /**
   * **좌측의 폭과 두 영역의 배분.** 값·한계·보존은 `shell/sidebar-layout.ts`가 갖고, 여기는
   * 그것을 마크업에 얹기만 한다 — 폭은 `.wb-shell-side`의 인라인 `width`, 배분은 두
   * `.wb-shell-region`의 인라인 `flex-grow`다.
   *
   * **인라인인 것은 `shell.css`가 이 값을 알 수 없기 때문이다**(사람마다 다르고 저장에서
   * 온다). 둘 다 상속되지 않는 속성이라 `shell.css` 머리말의 «상속되는 속성은 문서를 감싸는 상자에 걸지 않는다»를 건드리지 않는다
   * (`test/shell-css-guard.ts` 머리말의 ㉠ — *"자리·크기를 코드가 계산하는 것"*).
   */
  const layout = useSidebarLayout()
  /** 접히는 두 상자의 id — 머리의 접기 토글이 `aria-controls` 로 가리킨다(`shell/panel-fold.tsx`). */
  const sideId = useId()
  const panelId = useId()

  /**
   * **구조 트리가 있을 때만 배분이 있다.** 뷰 모드에서는 상자가 하나뿐이라 손잡이가 나눌
   * 것이 없고, 그때 `flex-grow`를 덮으면 오히려 고장이 난다 — flex는 `flex-grow`의 합이
   * 1보다 작으면 남는 공간을 **그 합만큼만** 나눠 주므로, 상자 하나에 `0.5`를 주면 좌측의
   * 절반이 빈칸이 된다. 설계서 「설계서 화면 구조」의 *"뷰 모드에서는 접혀 메뉴 트리가 전체를 쓴다"*가 그렇게 깨진다.
   */
  const split = mode === 'edit'
  /** 하단 컴포넌트 판과 그 토글이 서는가 — 편집 입구라 다른 편집 도구와 같은 값(편집 모드 && `canEdit`)이다. */
  const paletteEditable = mode === 'edit' && canEdit

  /**
   * 로그아웃 앞의 기다림 — 아래 `useLogout` 자리의 주석. 끊는 신호는 없다: 누른 뒤 화면을 옮겨도 로그아웃은 나간다. 기다림 뒤에 큐에 남은
   * 편집과 **기다리는 동안 버린 편집**을 세어 로그인 화면에 남길 한 줄을 돌려준다(`logoutLossNotice`).
   *
   * **버린 것도 센다**(`EditorStore.discardTally`) — 기다리는 동안 편집 실패 수습이 큐를 비우면(`failEdits`) 그 통지는 판을 다시 읽은 뒤에
   * 서고 셸째 내려가 아무도 못 본다. 큐만 세면 0 이다(jsdom: 로그아웃 뒤 409 → 수습). 누르기 전에 시작한 수습이 버린 것도 아직 말하지
   * 않았으니 센다(`recoveringDiscards`). **«거절»은 큐에서 빠진 편집에만 선다**(누계의 `refused`) — 큐에 남은 나간 편집은 그 보내기가 거절됐어도
   * «모름»이다: 번호 쓰기를 기다리는 편집은 409 를 받고도 큐에 남고, 한도 뒤 게시의 답이 오면 리베이스가 옮겨 다시 낸다(`use-edit-commit.tsx`의
   * `pump`) — 로그아웃 요청이 떠 있는 동안 커밋된다(Chrome `build-test/editor-post-between.test.ts`의 «로그아웃 한도 뒤 …»).
   */
  const settleEdits = useCallback(async () => {
    const start = store.discardTally()
    const untold = store.recoveringDiscards()
    await editsAnswered(store)
    const end = store.discardTally()
    const { pending } = store.getState()
    const sentHere = pending.filter(store.wasSent).length
    const since = (key: keyof DiscardTally): number => end[key] - start[key] + untold[key]
    return logoutLossNotice(sentHere + since('unknown'), pending.length - sentHere + since('unsent'), since('refused'))
  }, [store])

  /**
   * **로그아웃**(`session/session-menu.tsx`의 `useLogout`) — `…` 의 끝 항목이 부른다. **보낸 편집의 답을 받은 뒤에 나간다**(`settleEdits` ·
   * `editsAnswered`) — 칸에 친 채 누르면 그 클릭이 blur 로 낸 편집과 로그아웃이 다른 연결로 겨룬다. 로그아웃이 먼저 세션을 지우면 편집은
   * 커밋 순간의 재확인에서 거절되고 셸째 내려가 말할 자리도 없다(Chrome: 친 채 누른 3판 가운데 1판이 401 · 행 잠금에 줄 선 편집과 그 뒤에
   * 쌓인 편집은 둘 다 잃음). **막지는 않는다** — 한도가 지나면 그대로 나간다. 로그아웃은 권한을 줄이는 쓰기라, 막으면 누르고 떠난 사람의
   * 세션이 남는다. 한도 뒤에 잃는 편집은 셸째 내려가므로 로그인 화면이 말한다(`logoutLossNotice` · `useSignOutNotice`).
   */
  const { logout, busy: loggingOut, failure: logoutFailure } = useLogout(settleEdits)
  const sessionUser = useSessionUser()
  /**
   * 열린 대화 상자 — 스냅샷 · 내보내기. 한 번에 하나다(모달이다). 셋째 상자인 페이지 가져오기는 메뉴 트리가 연다 — 보내기 · 잠금이 트리의
   * 명령 훅에 있다(`panels/page-import-dialog.tsx` 머리말 «누가 여는가»).
   */
  const [dialog, setDialog] = useState<'snapshots' | 'export' | null>(null)
  /** 페이지 JSON 의 하단 바 통지 — 가져온 결과 · 내보내기 실패. 트리가 채우고 하단 바가 그린다(`panels/page-json-notices.tsx`). */
  const pageJsonNotices = usePageJsonNotices()
  /** 메뉴 트리 제목 줄의 행동 자리(`ShellRegion`의 `actionsRef`) — 트리가 뿌리 `+`를 거기 그린다. */
  const [menuHead, setMenuHead] = useState<HTMLDivElement | null>(null)
  /** 구조 트리 제목 줄의 행동 자리 — 같은 까닭. */
  const [structureHead, setStructureHead] = useState<HTMLDivElement | null>(null)
  /** 머리가 좁은 창에서 접힌 단계(`shell/head-fold.ts`) — `folded` 면 줌 묶음이 `…` 의 첫 항목들이 된다. */
  const fold = useHeadFold()
  const zoomCommands = useZoomCommands(canvasRef)
  const zoom = useEditorStore(store, (s) => s.zoom)
  /** 상태 전환기가 머리에 서는가 — `tight` · `folded` 면 `…` 로 접힌다(`shell/head-fold.ts`). */
  const switcherInHead = fold === 'wide' || fold === 'short'
  const viewStateChoice = useViewState(props.pageId)
  const manageDialog = useManageDialog()
  // 주소 `?state=` — 열 때 읽고 뷰 모드 · viewer 에서 쓴다(`shell/view-state-address.ts`).
  useViewStateAddress(props.pageId, mode === 'view' || !canEdit)
  /** `…` 의 항목 — spec 「`…` 메뉴」의 차례. 링크 둘은 주소가 있는 이동이다. 접힌 머리의 줌이 맨 앞에, 접힌 상태 전환기가 그다음에 선다. */
  const menuItems: ActionMenuItem[] = [
    ...(fold === 'folded'
      ? [
          // 줌 묶음이 머리에서 빠지면 지금 배율이 어디에도 안 보인다 — 눌리지 않는 한 줄로 알린다(항목 이름 «축소» · «확대» 는 그대로다).
          { key: 'zoom-value', label: `배율 ${Math.round(zoom * 100)}%`, disabled: true },
          { key: 'zoom-out', label: '축소', icon: ICONS.zoomOut, onSelect: zoomCommands.zoomOut },
          { key: 'zoom-in', label: '확대', icon: ICONS.zoomIn, onSelect: zoomCommands.zoomIn },
          { key: 'zoom-fit', label: '화면 맞춤', icon: ICONS.fitWidth, onSelect: zoomCommands.fit },
        ]
      : []),
    ...(!switcherInHead && props.pageId !== undefined
      ? viewStateMenuItems(viewStateChoice, { prefixed: true, ...(mode === 'edit' && canEdit ? { manage: manageDialog.open } : {}) })
      : []),
    { key: 'account', label: '계정 설정', icon: ICONS.account, to: '/account' },
    { key: 'settings', label: '프로젝트 설정', icon: ICONS.projectSettings, to: `/projects/${props.project.id}/settings` },
    { key: 'snapshots', label: '스냅샷', icon: ICONS.snapshots, onSelect: () => setDialog('snapshots') },
    { key: 'export', label: '프로젝트 내보내기', icon: ICONS.exportProject, onSelect: () => setDialog('export') },
    // 요청이 도는 동안 끈다 — 두 번 눌러 두 번 나갈 이유가 없다(로그인 폼과 같은 관례).
    { key: 'logout', label: '로그아웃', icon: ICONS.logout, onSelect: logout, disabled: loggingOut },
  ]

  return (
    // **별칭 입력이 선 줄**(`panels/alias-edit.tsx`) — 구조 트리가 그리고 에디터 단축키(F2)가 연다. 둘이 같은 값을 보게 셸이 한 번 깐다.
    <AliasEditProvider pageId={props.pageId}>
      {/* 접힌 쪽은 격자에서 트랙째 빠진다(`shell.css` 의 `.wb-shell-fold-side` · `.wb-shell-fold-panel`) — 상자는 DOM 에 남고 손잡이는 안 선다. */}
      <div className={['wb-shell', layout.sideFolded ? 'wb-shell-fold-side' : '', layout.panelFolded ? 'wb-shell-fold-panel' : ''].filter(Boolean).join(' ')}>
        <header className="wb-shell-header">
          {/* **머리의 왼쪽은 *"어디에 있고 어디로 나가는가"*다.** 가운데 도구들 · 오른쪽 끝의 `…` 와 갈리는 축이
              이것이라, 둘을 한 묶음으로 싸서 `space-between`이 사이를 벌리지 못하게 한다.

              **나가는 길을 여기 둔다** — 로고가 프로젝트 목록으로 가는 링크다(`shell/brand-link.tsx` — 접근 이름 «프로젝트 목록»).
              이것이 없으면 목록으로 가는 길이 화면에 **없다** — 브라우저 뒤로 가기나 주소를 손으로 고치는 것뿐이다.

              **제목 자체를 링크로 만들지 않는다.** 링크의 글자는 **갈 곳**을 말해야 하는데
              제목은 *"지금 여기"*를 말한다 — `관리자 콘솔 설계서`를 눌렀더니 프로젝트
              **목록**으로 가는 것은 그 계약을 어긴다. 제목은 `<h1>` 글자라 접근성 트리에서도 `heading`이다. */}
          <div className="wb-shell-lead">
            {/* **좌측 접기**는 머리 왼쪽 끝 — 접는 쪽과 같은 편이다(`shell/panel-fold.tsx`). */}
            <PanelFoldToggle side="side" folded={layout.sideFolded} controls={sideId} onToggle={layout.toggleSide} />
            {/* 접힌 머리(`short` · `folded`)에서는 로고 글자를 뺀다 — 좌우 접기 토글이 든 머리가 그 폭(78)으로 한 줄에 든다(`shell/head-fold.ts`). */}
            <BrandLink compact={fold !== 'wide'} />
            <h1 className="wb-shell-title">{props.project.name}</h1>
          </div>
          {/* **가운데 — 설계서와 캔버스를 다루는 도구.** 되돌리기 · 다시 실행 · 배치 선 · 모드(편집/뷰) 다음에 구분선, 그 뒤가 캔버스를
              다루는 도구(뷰포트 폭 · 줌)다. 캔버스 도구는 두 모드 다에 선다 — 보는 폭과 배율은 모드가 아니라 사람의 화면에 대한 값이다. 좁은
              창에서는 «뷰포트 폭» 글을 감추고, 더 좁으면 상태 전환기를, 그보다 좁으면 줌 묶음도 오른쪽 끝 `…` 로 접는다(`shell/head-fold.ts` 의 단계 표).

              **되돌리기·다시 실행은 편집 모드에만 있다**.
              「설계서 화면 구조」가 뷰 모드에서 구조 트리를 접고 속성 탭을 페이지 설명으로 바꾸는 것과 같은
              선이다 — **편집 도구는 편집 모드에 있다.**

              **뷰 모드에 두면 깨진다.** 뷰 모드에서 undo를 누르면 문서는
              되돌아가는데 **겹layer가 그 위에 그대로 얹혀 있어 화면이 안 바뀐다** — 눌렀는데
              아무 일도 안 일어난다. 그리고 그 존재 자체가 캔버스의
              리셋 판정(`canvas/canvas.tsx`의 `runtimeKey` 주석)이 딛고 선 *"뷰 모드에서 사용자는 편집하지 않는다"*를
              거짓으로 만든다.

              **겹layer를 함께 되돌리는 쪽을 고르지 않는다:** 되돌릴 대상이 문서가 아니라
              시연 상태라 *"어디까지"*가 정의되지 않는다(undo 한 칸이 겹layer 몇 칸인가).
              **원인을 없애는 쪽이 정의가 필요 없다.**

              **viewer 에게는 없다**(`canEdit` — 되돌릴 것은 제 편집뿐이고 viewer 는 편집을 못 낸다). */}
          <div className="wb-shell-head-tools">
            {/* **상태 전환기**(`shell/view-state-switcher.tsx`) — 두 모드 · 모든 역할에 선다(고르기는 읽기다). 상태 목록을 고치는 항목만 편집 모드 && `canEdit`. */}
            {switcherInHead && <ViewStateSwitcher projectId={props.project.id} pageId={props.pageId} editable={mode === 'edit' && canEdit} />}
            {mode === 'edit' && canEdit && <UndoTools projectId={props.project.id} pageId={props.pageId} />}
            {/* **배치 선**(`canvas/layout-guides.tsx`) — 편집 모드에서만 선다(선을 그리는 것도 편집 모드뿐이다). 읽기 도구라 viewer 에게도 선다. */}
            {mode === 'edit' && <GuidesToggle />}
            <ModeTools />
            {/* 접힌 머리에서는 구분선도 뺀다 — 뒤에 고르개 하나만 남아 가를 무리가 없고, 그 폭(선 1 + 틈 16)이 창 700 의 여유다(`shell/head-fold.ts`). */}
            {fold !== 'folded' && <span className="wb-shell-head-divider" aria-hidden="true" />}
            <CanvasTools canvasRef={canvasRef} fold={fold} />
          </div>
          {/* **오른쪽 끝의 `…`** — 이 프로젝트 전체 · 계정을 다루는 일(spec 「`…` 메뉴」). **역할로 감추지 않는다** — 항목 다섯이 모든 역할에게
              선다: 스냅샷 목록 · 내보내기 · 설정(읽기 전용 칸)은 viewer 도 본다(설계서 「권한 모델」 — 막는 것은 그 안의 생성 · 복원이고 그 판정은
              몸체가 한다). */}
          {/* **우측 접기**는 `…` 바로 앞 — 둘을 한 묶음으로 싸서 머리의 `space-between` 이 사이를 벌리지 못하게 한다. */}
          <div className="wb-shell-head-end">
            <PanelFoldToggle side="panel" folded={layout.panelFolded} controls={panelId} onToggle={layout.togglePanel} />
            <ActionMenu label="더 보기" heading={sessionUser?.name} items={menuItems} />
          </div>
          {/* **스냅샷 · 프로젝트 내보내기는 에디터 위의 대화 상자다**(`shell/shell-dialog.tsx`). 셸이 그리므로 셸이 내려가면 함께 내려간다.

              스냅샷 몸체에는 셸의 복원 콜백 넷을 그대로 준다 — 복원을 보낸 뒤 상자를 닫아도 답은 셸이 받는다(몸체가 보낸 순간 쥔 콜백).
              `onRestored` 가 답의 안전망 스냅샷 id 를 먼저 적는다 — 되돌아오는 내 복원의 신호를 알아보고, 미뤄 둔 신호를 가른다
              (`EditorStore.ownRestoreAnswered`). 내려간 셸의 답이면 스토어에 안 쓴다(`shellGeneration`). */}
          <ShellDialog open={dialog === 'snapshots'} title="스냅샷" onClose={() => setDialog(null)}>
            <SnapshotsBody
              projectId={props.project.id}
              onRestoreSent={store.beginOwnRestore}
              onRestored={(clientRestoreId, safetySnapshotId) => {
                if (shellLive()) store.ownRestoreAnswered(clientRestoreId, safetySnapshotId)
                reloadAfterRestore(RESTORED_LEAD)
              }}
              onRestoreRefused={(clientRestoreId) => {
                if (shellLive()) store.ownRestoreRefused(clientRestoreId)
              }}
              onRestoreUnanswered={(clientRestoreId) => {
                if (shellLive()) store.markRestoreUnanswered(clientRestoreId)
              }}
            />
          </ShellDialog>
          {/* **설계서를 내려받는 자리**(설계서 「HTML 정적 번들」). 번들은 viewer가 화면에서 볼 수 있는 것을 파일로 받는
              것이고 서버도 viewer에게 연다(「권한 모델」). */}
          <ShellDialog open={dialog === 'export'} title="프로젝트 내보내기" onClose={() => setDialog(null)}>
            <ExportBody projectId={props.project.id} />
          </ShellDialog>
          {/* **상태 다루기 상자**(`shell/view-states-dialog.tsx`) — 머리 전환기 · 접힌 `…` 의 «상태 추가» · «상태 관리…»가 연다. 편집 모드 && `canEdit` 일 때만. */}
          {props.pageId !== undefined && <ViewStatesDialog projectId={props.project.id} pageId={props.pageId} editable={mode === 'edit' && canEdit} />}
          {/* **에디터 단축키**(`shell/editor-keys.tsx`) — 호스트와 캔버스 문서에 리스너를 걸고, `?` 의 도움말 상자를 여기 그린다. 편집 명령은
              편집 모드 && `canEdit` 일 때만, 고르기 · 선택 이동 · 도움말은 늘 선다. */}
          <EditorKeys projectId={props.project.id} pageId={props.pageId} editable={mode === 'edit' && canEdit} />
        </header>

        <nav
          id={sideId}
          className={layout.sideFolded ? 'wb-shell-side wb-shell-folded' : 'wb-shell-side'}
          aria-label="메뉴와 구조"
          ref={layout.sideRef}
          style={{ width: `${layout.sideWidth}px` }}
        >
          <ShellRegion
            className="wb-shell-region"
            name="메뉴·페이지 트리"
            style={split ? { flexGrow: layout.regionGrow } : undefined}
            actionsRef={setMenuHead}
          >
            {/* 트리에 주는 `projectId`는 **조회해 온 프로젝트의 id**다. 경로의 파라미터를
                다시 읽지 않는 것은, 트리가 만드는 주소가 지금 열려 있는 프로젝트를 가리켜야
                하기 때문이다 — 둘은 같은 값이지만 진실은 조회 결과 쪽에 있다. */}
            {/* **복원이 트리도 바꾼다.** 스냅샷 시점에 있던 페이지가 지금 없거나 그
                반대다 — 문서만 다시 읽고 트리를 두면 목록이 존재하지 않는 페이지를 그린다.
                `resyncToken`은 여기 닿지 않는다(재연결은 이 페이지의 프레임만 잃는다). */}
            {/* **편집 도구를 낼지는 셸이 정한다**(「설계서 화면 구조」의 표가 여기 모여 있다 — 구조 트리·
                되돌리기·우측 탭이 이미 이 파일에서 갈린다). 트리 안의 넷(줄 행동 · 끌어 놓기 ·
                페이지 가져오기 대화 상자 · 편집 단축키)이 이 값 하나로 함께 갈린다 —
                `panels/menu-tree.tsx`의 `editable` 주석이 왜 넷이 함께인지 적고 있다.

                **이 값이 없으면 뷰 모드가 반만 뷰 모드다:** 구조 트리는 접히는데 좌측의 편집
                도구(`이름 변경`·`옮기기`)는 그대로 남아 눌린다.

                **viewer 에게는 편집 모드에서도 `false`다**(`canEdit`). 넷이 이 값 하나로 함께 가므로 역할도 여기
                한 번만 얹는다. **페이지** 이름 변경만 따로 닫는 칸을 두지 않는다 — 이 값이 그것을 덮고,
                두 벌이면 한쪽만 고쳐지는 자리가 생긴다. */}
            <MenuTree
              projectId={props.project.id}
              pageId={props.pageId}
              reloadToken={restoredToken}
              remoteRev={menuRev}
              resyncToken={resyncToken}
              onDropped={onTreeDropped}
              onPageGone={onPageGone}
              editable={mode === 'edit' && canEdit}
              headSlot={menuHead}
              notices={pageJsonNotices}
            />
          </ShellRegion>
          {/* 구조 트리는 편집 모드에서만 있다. 뷰 모드에서는 접혀 메뉴 트리가 좌측 전체를
              쓴다(「설계서 화면 구조」).

              "접힘"을 `hidden`이 아니라 **DOM에서 제거**로 구현한다. `hidden`이면 뷰 모드에서
              보이지도 않는 구조 트리가 계속 렌더되고 스토어를 구독하게 되는데,
              접힌 동안 그 상태를 유지할 이유가 없다(선택은 스토어가 갖고 있어 다시 펼칠 때
              그대로 돌아온다).

              **테스트는 둘 중 어느 쪽인지까지 잡지 못한다.** RTL의 role 조회가 `hidden`
              요소를 접근성 트리에서 빼므로 두 구현 모두 같은 단언을 통과한다(다시 재는 법:
              이 자리를 `hidden` 방식으로 바꾸고 `pnpm vitest run --project web` — 전량이 통과한다).
              테스트가 지키는 것은 "접힌다"는 사용자가 보는 성질이고, 방식은 여기 적힌
              이유다. */}
          {split && (
            <>
              {/* **두 영역 사이의 손잡이.** 값은 첫 영역의 **높이(px)**로 주고받고, 비율로
                  바꾸는 것은 `useSidebarLayout`이 한다 — 사람이 잡고 미는 것은 픽셀이고
                  창 높이가 바뀌어도 어긋나지 않아야 하는 것은 비율이다. */}
              <ShellResizer
                orientation="horizontal"
                className="wb-shell-region-resizer"
                label="좌측 두 영역의 세로 배분"
                ref={layout.regionResizerRef}
                value={Math.round(layout.regionRatio * 100)}
                min={Math.round(layout.regionRatioMin * 100)}
                max={Math.round((1 - layout.regionRatioMin) * 100)}
                valueText={`메뉴·페이지 트리 ${Math.round(layout.regionRatio * 100)}%`}
                onGrab={layout.grabRegionHeight}
                onMove={layout.setRegionHeight}
                onEdge={(edge) =>
                  layout.setRegionRatio(
                    edge === 'min' ? layout.regionRatioMin : 1 - layout.regionRatioMin,
                  )
                }
                onReset={layout.resetRegionRatio}
              />
              <ShellRegion
                className="wb-shell-region"
                name="구조 트리"
                style={{ flexGrow: 1 - layout.regionGrow }}
                actionsRef={setStructureHead}
              >
                {/* `projectId`는 메뉴 트리와 같은 이유로 **조회해 온 프로젝트의 id**다.
                    구조 편집이 그것을 `PATCH /projects/:id/pages/:id/ops`의 경로로 쓴다. */}
                {/* **트리는 viewer 도 본다**(읽기 — 노드를 골라 속성 · 코멘트를 본다). 줄 행동 · 끌어 놓기와 단축키만 `canEdit`으로 간다. */}
                <StructureTree
                  projectId={props.project.id}
                  pageId={props.pageId}
                  editable={canEdit}
                  headSlot={structureHead}
                />
              </ShellRegion>
            </>
          )}
        </nav>

        {/* **사이드바와 캔버스 사이의 손잡이.** 편집·뷰 모드 둘 다에 있다 — 폭은 모드가
            아니라 사람의 화면에 대한 값이다. 좌측을 접으면 안 선다 — 끌 폭이 없다. */}
        {!layout.sideFolded && (
          <ShellResizer
            orientation="vertical"
            className="wb-shell-side-resizer"
            label="사이드바 폭"
            value={layout.sideWidth}
            min={layout.sideWidthMin}
            max={layout.sideWidthMax}
            valueText={`${Math.round(layout.sideWidth)}px`}
            onGrab={layout.grabSideWidth}
            onMove={layout.setSideWidth}
            onEdge={(edge) => layout.setSideWidth(edge === 'min' ? layout.sideWidthMin : layout.sideWidthMax)}
            onReset={layout.resetSideWidth}
          />
        )}

        <main className="wb-shell-canvas" aria-label="캔버스" ref={canvasRef}>
          <CanvasFrame
            projectId={props.project.id}
            pageId={props.pageId}
            editable={mode === 'edit' && canEdit}
            resyncToken={resyncToken}
            restoredToken={restoredToken}
            restoredLead={restoredLead}
            goneCheck={pageGone}
          />
        </main>

        {/* **하단 컴포넌트 판**(`palette/component-palette.tsx`) — 캔버스와 하단 바 사이(그리드의 `palette` 줄). 편집 모드 · `canEdit` 일 때만
            선다 — 뷰 모드 · viewer 면 판도 토글도 없고 기억한 열림은 그대로다(돌아오면 다시 열린다). */}
        {paletteEditable && layout.paletteOpen && (
          <ComponentPalette
            projectId={props.project.id}
            pageId={props.pageId}
            height={layout.paletteHeight}
            min={layout.paletteHeightMin}
            max={layout.paletteHeightMax}
            onGrab={layout.grabPaletteHeight}
            onMove={layout.setPaletteHeight}
            onReset={layout.resetPaletteHeight}
          />
        )}

        {/* **하단 바**(`shell/shell-footer.tsx`) — 왼쪽은 통지 줄, 오른쪽은 «컴포넌트». 통지가 여럿이면 바가 위로 자라고 캔버스가 준다. */}
        <ShellFooter
          ref={layout.footerRef}
          notices={
            <>
              {/* 편집 실패 통지는 **한 자리**다. 조회 실패처럼 화면마다 나누지 않는 것은,
                  어느 화면에서 시작된 편집이든 실패의 결과가 같기 때문이다 — 페이지를 다시
                  받고 보내지 못한 편집을 잃는다. 하단 바는 어느 패널을 보고 있어도 캔버스
                  바로 아래라 눈에 들어온다. */}
              <EditAlert />
              {/* **경고는 실패가 아니다**. 실패 통지 바로 옆에 두되 `role`이 다르다 —
                  근거는 `shell/edit-warnings.tsx`의 머리말에 있다. */}
              <EditWarnings />
              {/* **남의 변경 때문에 화면이 낡았다는 통지**. `EditAlert`와 자리는 같고
                  `role`이 다르다 — 이쪽은 사용자가 방금 누른 것의 실패가 아니라 **남이 한 일**이다.
                  근거는 `shell/remote-alert.tsx`의 머리말에 있다. */}
              <RemoteAlert onReload={(stale) => reloadAfterRestore(stale.own === undefined ? SIGNALLED_RESTORE_LEAD : OWN_RESTORE_LEAD[stale.own])} />
              {/* **테마를 못 실었다**(`theme/theme-alert.tsx`) — 캔버스는 기본 뷰로 그리고 있다. */}
              <ThemeAlert />
              {/* **편집 권한이 바뀌었다**(`ROLE_NOTICE`). 남이 한 일이라 `RemoteAlert`와 같은 꼴이다. */}
              {roleNotice !== null && (
                <p className="wb-shell-remote-alert" role="status">
                  {roleNotice}
                </p>
              )}
              {/* **페이지 JSON — 가져온 결과 · 내보내기 실패**(`panels/page-json-notices.tsx`). 닫기를 누를 때까지 남는다(고아 코멘트는 되돌릴
                  수 없다 — 읽기 전에 사라지면 안 된다). */}
              <PageJsonNoticeList notices={pageJsonNotices} />
              {/* **세션 전환 · 로그아웃 실패**(`session/session-menu.tsx`의 `SessionNotices`). */}
              <SessionNotices failure={logoutFailure} className="wb-shell-session-alert" />
            </>
          }
          tools={paletteEditable && <PaletteToggle open={layout.paletteOpen} onToggle={layout.togglePalette} />}
        />

        {/* **캔버스와 우측 패널 사이의 손잡이**(`shell/sidebar-layout.ts` «두 폭은 한 예산을 나눠 쓴다»). 좌측 손잡이와 같은 부품이고 방향만
            반대다 — 왼쪽으로 끌면 패널이 넓어진다(`reversed`). 우측을 접으면 안 선다. */}
        {!layout.panelFolded && (
          <ShellResizer
            orientation="vertical"
            className="wb-shell-panel-resizer"
            label="우측 패널 폭"
            reversed
            value={layout.panelWidth}
            min={layout.panelWidthMin}
            max={layout.panelWidthMax}
            valueText={`${Math.round(layout.panelWidth)}px`}
            onGrab={layout.grabPanelWidth}
            onMove={layout.setPanelWidth}
            onEdge={(edge) => layout.setPanelWidth(edge === 'min' ? layout.panelWidthMin : layout.panelWidthMax)}
            onReset={layout.resetPanelWidth}
          />
        )}

        <aside
          id={panelId}
          ref={layout.panelRef}
          className={layout.panelFolded ? 'wb-shell-panel wb-shell-folded' : 'wb-shell-panel'}
          aria-label="우측 패널"
          style={{ width: `${layout.panelWidth}px` }}
        >
          {/* **본문 넷이 같은 `canEdit`을 받는다** — 속성 · 상호작용은 끄고, 코멘트 폼 · 설명 편집기는 숨긴다. */}
          <RightPanel projectId={props.project.id} pageId={props.pageId} canEdit={canEdit} restoredToken={restoredToken} />
        </aside>
      </div>
    </AliasEditProvider>
  )
}

/**
 * 우측 패널의 탭(설계서 「설계서 화면 구조」).
 *
 * **`mode`를 읽는다.** 그 절의 표대로 편집 모드는 **속성** / 코멘트 / 상호작용, 뷰 모드는 **페이지 설명** /
 * 코멘트 / 상호작용이다(위 `PANEL_TABS`).
 *
 * **본문은 삼항이 아니라 표다.** 탭이 셋이 되면 삼항이 겹치는데, 그러면 탭이 늘 때마다
 * 중첩이 깊어지고 어느 탭이 어느 본문인지 읽기 어렵다. **모드로 갈리는 것은 *목록*이지
 * 본문이 아니다** — 모드는 목록 표(`PANEL_TABS`)의 키이고 본문 표(`PANEL_BODIES`)는 모드를 모른다.
 *
 * **모드를 바꿀 때 탭이 어떻게 되는가 — 판정.** 지금 보던 탭이 새 모드에도 있으면 **그대로
 * 둔다**(코멘트를 보다 뷰 모드로 가면 코멘트가 그대로 보인다). 없으면(속성 ↔ 페이지 설명)
 * **그 모드의 첫 탭으로 간다.** 무조건 첫 탭으로 되돌리는 판을 고르지 않은 것은, 모드 토글이
 * *"같은 것을 다르게 본다"*이지 *"다른 것을 본다"*가 아니기 때문이다 — 캔버스가 문서를,
 * 좌측이 트리를 그대로 두는 것과 같은 결이다.
 *
 * **그 판정을 `useState` 대신 렌더 중 대조로 구현한다.** 이펙트로 고치면 **모드가 바뀐 첫
 * 커밋 하나 동안 없는 탭을 그린다** — `props` 탭 본문이 뷰 모드에서 한 번 그려지는 창이고,
 * 그 창은 이 저장소가 `openPageId`로 닫은 것과 같은 부류다(`CanvasFrame`의 주석).
 *
 * **탭 상태를 스토어에 두지 않는다.** `EditorState`가 드는 것은 **페이지 편집** 상태다
 * (문서·`headSeq`·undo 스택·전송 큐). 어느 탭을 보고 있는가는 그 축이 아니고, 거기 얹으면
 * 편집과 무관한 이유로 스토어 구독자가 다시 그린다 — `resyncToken`을 셸의 `useState`로
 * 둔 것과 같은 근거다.
 *
 * **`role="tab"`·`aria-selected`·`role="tabpanel"`을 다는 것이 계약이다.** 보조 기술이
 * "탭 중 하나"를 알아야 나머지 탭이 있다는 것을 알린다 — `ModeTools`의 모드 토글이
 * 눌리지 않은 쪽에도 `aria-pressed`를 다는 것과 같은 이유다.
 */
function RightPanel(props: {
  projectId: string
  pageId: string | undefined
  /** 설계서를 고칠 수 있는가 — 셸의 `canEdit`. 본문에 그대로 내린다. */
  canEdit: boolean
  /** 내가 스냅샷을 복원했다는 신호(셸의 `restoredToken`). 본문의 `key`다 — 아래 본문 자리의 주석. */
  restoredToken: number
}): ReactElement {
  const store = useEditorStoreInstance()
  const mode = useEditorStore(store, (s) => s.mode)
  const [chosen, setChosen] = useState<PanelTab>('props')

  const tabs = PANEL_TABS[mode]
  // 고른 탭이 이 모드에 없으면 첫 탭이다(위 머리말의 판정). **`chosen`을 고치지 않는다** —
  // 뷰 모드에서 속성을 보고 있었다는 사실이 남아 있어야 편집 모드로 돌아갈 때 되살아난다.
  const tab = tabs.some((item) => item.id === chosen) ? chosen : (tabs[0]?.id ?? 'comments')

  return (
    <>
      <div className="wb-shell-tabs" role="tablist" aria-label="우측 패널 탭">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`wb-tab-${item.id}`}
            className="wb-shell-tab"
            aria-selected={tab === item.id}
            aria-controls={`wb-tabpanel-${item.id}`}
            onClick={() => setChosen(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* **보이지 않는 탭은 DOM에서 뺀다** — `hidden`으로 두지 않는다. 코멘트 탭은
          마운트될 때 `listComments`를 부르므로, 감춰 둔 채 살려 두면 보지도 않는 목록을
          위해 페이지를 열 때마다 요청이 나간다. 구조 트리를 뷰 모드에서 DOM에서 빼는 것과
          같은 판단이고, 근거도 같다(그쪽 주석).

          **넷을 다 그리면 *"페이지를 한 번만 읽는다"*를 재는 케이스들이 `getPage` 두
          번으로 죽는다**(코멘트의 *"탭을 열기 전에는 조회하지 않는다"*도 함께).
          그러니 이 판단은 그대로 선다. **다만 대가가 요청 하나가 아니다.**

          **대가: 언마운트되는 본문이 든 «친 글자»와 «나가 있는 저장»이 사라진다.**
          그래서 본문들의 **페이지에 매인 상태**를 탭 목록 밖의 `PanelDraftsProvider`가
          든다 — 언마운트를 고른 것이 이 컴포넌트이므로 대가도 이 컴포넌트가 문다. 무엇을
          왜 드는지, 페이지가 바뀌면 무엇을 버리는지는 `panels/panel-drafts.tsx`의 머리말이
          갖는다(여기 두 벌로 적지 않는다).

          «페이지 설명»과 코멘트 탭이 **같은 provider**를 쓴다 — 페이지가 바뀌면 버리는 일도
          그 한 자리에서 같은 값으로 한다. */}
      <PanelDraftsProvider projectId={props.projectId} pageId={props.pageId}>
        <div
          className="wb-shell-tabpanel"
          role="tabpanel"
          id={`wb-tabpanel-${tab}`}
          aria-labelledby={`wb-tab-${tab}`}
        >
          {/* **복원하면 본문을 다시 세운다**(`key`). 코멘트 · 설명 본문은 마운트될 때 읽으므로 탭을 다녀오면 맞는데,
              복원은 탭을 안 바꾼다. 다시 세우는 것은 탭을 다녀온 것과 같은 길이다 — 친 글자 · 나가 있는 쓰기는 위
              provider 가 들고 있어 살아남고, 지난 쓰기의 통지는 마운트가 지운다(복원 앞의 일이다). 본문마다 신호를 받아
              다시 읽게 하지 않은 것은, 그러면 복원이 바꾸는 것을 읽는 본문이 늘 때마다 그 배선을 잊는 자리가 생기기 때문이다. */}
          {(() => {
            const Body = PANEL_BODIES[tab]
            return (
              <Body key={props.restoredToken} projectId={props.projectId} pageId={props.pageId} canEdit={props.canEdit} />
            )
          })()}
        </div>
      </PanelDraftsProvider>
    </>
  )
}

/**
 * 되돌리기·다시 실행 버튼.
 *
 * **`useEditCommit`의 두 번째 인스턴스다**(첫째는 속성 패널). 그래도 in-flight가 하나로 지켜지는 것은
 * 전송 루프의 가드를 스토어가 들기 때문이다 — 훅의 `ref`에 두면 여기서 낸 undo와 패널에서
 * 낸 편집이 동시에 나간다(`maxInFlight`가 2가 된다 — 잰 자리는 `store/editor-store.ts`의
 * `#pumping` 주석).
 *
 * `pageId`가 없으면 되돌릴 것도 없다 — 훅은 `''`를 받아 `useOpenPage('')`가 `null`을 내고
 * 스택이 비어 두 버튼이 다 비활성이 된다(속성 패널과 같은 관례).
 */
function UndoTools(props: { projectId: string; pageId: string | undefined }): ReactElement {
  const { undo, redo, canUndo, canRedo } = useEditCommit({
    projectId: props.projectId,
    pageId: props.pageId ?? '',
  })

  return (
    // 아이콘만 남는 단추다 — 이름 · `title` 은 아이콘을 얹기 전의 글 그대로(`shell/icons.ts` 머리말 «이름은 아이콘이 나르지 않는다»).
    <div className="wb-shell-history" role="group" aria-label="편집 이력">
      <button type="button" className="wb-shell-history-step" aria-label="되돌리기" title="되돌리기" onClick={undo} disabled={!canUndo}>
        {shellIcon('undo', 16)}
      </button>
      <button type="button" className="wb-shell-history-step" aria-label="다시 실행" title="다시 실행" onClick={redo} disabled={!canRedo}>
        {shellIcon('redo', 16)}
      </button>
    </div>
  )
}

/**
 * 이름표가 붙은 상자. `children`이 그 안의 내용이다 — 메뉴·페이지 트리, 그리고 편집
 * 모드의 구조 트리.
 */
function ShellRegion(props: {
  className: string
  name: string
  /** 세로 배분. **편집 모드에서만 온다** — 근거는 셸의 `split` 주석에 있다. */
  style?: CSSProperties
  /**
   * 제목 줄의 행동 자리를 받는다 — 트리의 뿌리 `+`가 portal 로 그리로 들어간다(`panels/menu-tree.tsx`의 `headSlot`). 명령을 셸이 아니라
   * 트리가 들고 있어(훅이 트리 안에 하나) 셸은 자리만 만든다.
   */
  actionsRef?: (element: HTMLDivElement | null) => void
  children?: ReactNode
}): ReactElement {
  return (
    <section className={props.className} aria-label={props.name} style={props.style}>
      <div className="wb-shell-region-head">
        <h2 className="wb-shell-region-title">{props.name}</h2>
        {props.actionsRef !== undefined && <div className="wb-shell-region-actions" ref={props.actionsRef} />}
      </div>
      {props.children}
    </section>
  )
}

/**
 * 캔버스에 담길 것의 상태. 문서 자체는 여기 두지 않는다 — 스토어가 갖는다. 화면이 문서를
 * 자기 `useState`에 들면 캔버스·속성 패널·구조 트리가 각자 다른 사본을 보게
 * 된다.
 */
type PageLoadState =
  | { status: 'empty' }
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'failed'; failure: Failure }

/**
 * 캔버스 프레임. 뷰포트 폭과 줌이 여기서 실제 치수가 되고, **열린 페이지의 문서를 받아
 * 스토어에 싣는 자리**이기도 하다.
 *
 * 문서를 받는 일이 트리가 아니라 여기 있는 이유는 `panels/menu-tree.tsx`의 주석에 있다 —
 * 요지는 "주소가 열린 페이지의 단일 진실"이라는 것이다. 트리는 주소만 바꾸고, 문서는
 * 주소(`pageId`)를 보고 받는다. 그래서 눌러서 연 페이지와 주소로 들어와 열린 페이지가
 * 같은 경로를 지난다.
 *
 * **아래 이펙트가 돌고 난 뒤의 스토어 문서는 지금 열려 있는 페이지의 것이거나 비어 있다.**
 * 여기가 문서를 싣는 유일한 자리이면서 비우는 자리이기도 하기 때문이다.
 *
 * **"이펙트가 돌고 난 뒤"라는 단서는 그대로다 — 무조건이 아니다.** 비우는 일이 `useEffect`
 * 안에 있어 커밋보다 뒤에 돌기 때문에, `pageId`가 바뀌고 나서 **첫 커밋 하나 동안**은
 * 스토어가 아직 앞 페이지의 문서·`headSeq`·선택을 들고 있다. **그 커밋을 화면이 그리지 않게
 * 만드는 것은 스토어의 `openPageId`다** — 문서를 읽는 셋(캔버스·구조 트리·속성 패널)이
 * `useOpenDocument(pageId)`로 그 값을 주소와 대조하고, 어긋나면 아무것도 그리지 않는다
 * (`store/use-editor-store.tsx`).
 *
 * **그 창은 보통의 단언으로는 보이지 않는다** — RTL이 단언 전에 이펙트를 흘리므로 어떤
 * `expect`도 그 사이를 보지 못한다(`test/setup.ts`). 그래서 커밋마다 화면을 읽는 장치를
 * 따로 만들어 쟀다(`test/editor-harness.tsx`의 `CommitProbe`). 잰 것 둘:
 *
 * - 대조를 없애고 셋이 `s.document`를 곧장 읽게 하면, 새 주소 아래 커밋 **하나**에 앞
 *   페이지의 캔버스 루트(`n-root`)·구조 트리 다섯 줄·앞 페이지에서 고른 노드의 속성이
 *   **함께** 나온다.
 * - `clearPage()`를 `useLayoutEffect`로 옮기는 쪽도 걸어 봤는데 **같은 관측이 그대로
 *   나온다.** 그쪽은 커밋을 DOM에 꽂은 뒤 페인트 전에 지우는 방식이라, 페인트가 없는
 *   jsdom에서는 고쳐졌는지 잴 방법이 없다. 스토어 쪽을 택한 이유가 그것이다.
 *
 * **그 성질이 무엇에 매여 있는지는 하나씩 지워 보고 쟀다.** 아래 셋이 그렇게 확인된
 * 하중이다 — 목록이 완전한지는 재지 못했으므로 "이것이 전부"라고 적지 않는다. 죽는 수는
 * 케이스를 더할 때마다 어긋나므로 **이름만 적는다.**
 *
 * 1. **`pageId`가 사라질 때의 `clearPage()`**(아래 `pageId === undefined` 분기). 페이지를
 *    떠났는데 문서가 남는 것을 막는다. 지우면 죽는 것 —
 *    `menu-tree`의 `페이지를 떠나 pageId 없는 주소로 돌아오면 스토어의 문서가 비워진다`와
 *    `canvas`의 `페이지를 떠나면 선택이 남지 않는다`.
 * 2. **조회를 시작할 때의 `clearPage()`** — 응답이 온 뒤가 아니다. 뒤에 갈아 끼우면 조회가
 *    도는 동안 주소는 새 페이지인데 스토어는 앞 페이지의 것을 들고 있다. 지우면 죽는 것 —
 *    `다른 페이지를 여는 동안…`과 `다른 페이지의 조회가
 *    실패하면…`. 지우는 대신 `catch`로 **옮기기만** 하면 앞의 하나만 죽는다.
 * 3. **성공 분기의 `if (!alive) return`.** 늦게 도착한 앞 페이지의 응답이 새 페이지의 문서를
 *    덮어쓰는 것을 막는다 — 조회가 둘 떠 있을 때 서버가 요청 순서대로 답한다는 보장이 없다.
 *    지우면 죽는 것 — `앞 페이지의 응답이 늦게 와도 새 페이지의 문서를 덮어쓰지 않는다`.
 *
 * 그래서 **스토어의 문서가 비어 있는 것은 셋 다를 뜻한다**: 열린 페이지가 없다(`empty`),
 * 조회 중이다(`loading`), 조회가 실패했다(`failed`). 그 셋을 갈라 그려야 하면
 * 스토어가 아니라 이 컴포넌트의 `PageLoadState`를 봐야 한다.
 *
 * **프레임 안쪽에는 문서를 겨냥하는 셸의 스타일이 없다** — 그 안은 테마 CSS가
 * 전담한다(`shell.css` 머리말). 그래서 아래 안내 문단들에 클래스가 없고, 스타일도 없다. 셸이
 * 글꼴·글자색을 걸어 두면 상속으로 프레임 안까지 내려가 테마가 정해야 할 값을 누른다 —
 * 선택자를 겨냥하지 않아도 새는 형태라 선택자만 보는 검사로는 보이지 않는다(그래서 문서를
 * 감싸는 상자에는 **속성 허용 목록**을 따로 건다).
 *
 * **프레임 안의 셸 클래스는 셋이다**(`canvas/canvas.tsx`): 문서를 감싸는
 * 상자와, 문서 **옆에** 그려지는 선택 아웃라인·오류 배너다. 셋 다 문서 노드를 겨냥하지
 * 않고, 상속되는 속성도 걸지 않는다 — 검사는 `apps/web/test/shell-css.test.ts`가 돌리고
 * 프레임과 그 상자까지 함께 본다.
 *
 * `ready` 분기만 문서를 그린다. 나머지 세 자리(안내·로딩·오류)에는 그릴 문서가 없다 —
 * 스토어의 문서가 비어 있다는 것은 그 셋 중 하나라는 뜻이므로(위), 스토어만 보고는
 * 어느 쪽인지 알 수 없다.
 *
 * **이 게이트는 지금 어떤 케이스도 지키지 않는다**(다시 재는 법: 게이트를 없애고 `<Canvas />`를
 * 늘 그린 채 `pnpm vitest run --project web` — 전량이 통과한다). 그래도 두는 것은, 통과하는 이유가
 * "위의 성질이 지켜지고 있어서"이기 때문이다 — 그 셋에서는 스토어의 문서가 비어 있어
 * 캔버스가 아무것도 그리지 않는다. 성질이 깨지는 날 이 게이트가 마지막 방벽이다.
 */
function CanvasFrame(props: {
  projectId: string
  pageId: string | undefined
  /** 편집 모드 && `canEdit` — 캔버스 손잡이가 이것으로 선다(`canvas/canvas-drag-handle.tsx`). */
  editable: boolean
  /** 연결이 다시 붙었다는 신호. 오를 때마다 아래 재조회 이펙트가 돈다. */
  resyncToken: number
  /** 스냅샷이 복원됐다는 신호(내 복원 · 남의 복원을 배너의 단추로). 오를 때마다 아래 복원 재조회 이펙트가 돈다. */
  restoredToken: number
  /** 그 재조회가 잃은 것을 말할 때의 앞머리(셸의 `restoredLead`). */
  restoredLead: string
  /** 트리가 이 페이지를 잃었다는 신호(셸의 `pageGone`). 오를 때마다 아래 «페이지가 사라짐» 이펙트가 돈다. */
  goneCheck: { pageId: string; at: number } | null
}): ReactElement {
  const api = useApi()
  const store = useEditorStoreInstance()
  const viewportWidth = useEditorStore(store, (s) => s.viewportWidth)
  const zoom = useEditorStore(store, (s) => s.zoom)
  const themeStatus = useProjectTheme().status
  const [state, setState] = useState<PageLoadState>({ status: 'empty' })
  /**
   * **프레임의 변환 전 높이(px)** — 무대의 높이를 «보이는 높이»(이 값 × 줌)로 두려고 잰다(아래 무대의 주석). `transform` 은 레이아웃을 안
   * 바꾸므로 `offsetHeight` 가 줌과 무관한 값이다. 문서가 자라거나 줄면 프레임이 다시 재어진다(`ResizeObserver`). 못 재면(jsdom) `null` —
   * 무대 높이를 안 건다.
   */
  const frameRef = useRef<HTMLDivElement | null>(null)
  const [frameHeight, setFrameHeight] = useState<number | null>(null)
  useLayoutEffect(() => {
    const frame = frameRef.current
    if (frame === null || typeof ResizeObserver !== 'function') return
    const read = (): void => setFrameHeight(frame.offsetHeight)
    read()
    const observer = new ResizeObserver(read)
    observer.observe(frame)
    return () => observer.disconnect()
  }, [])
  /**
   * **실패한 캔버스의 «다시 시도»가 올리는 수** — 페이지를 여는 이펙트가 이 값에 매여 다시 돈다(여는 길 그대로: 비우고 · 읽고 · 되돌리기
   * 이력을 채운다). 실패 문장만 두면 다시 여는 길이 다른 페이지로 갔다 오거나 새로고침뿐이다 — 판을 비운 복원 재조회의 실패가 앞 조회의
   * 성공을 세대로 이긴 판(`EditorStore.settlePageLoad`)도 여기서 풀린다.
   */
  const [openAttempt, setOpenAttempt] = useState(0)
  /**
   * 마지막으로 처리한 재조회 신호. **상태가 아니라 ref다** — 이 값이 바뀌었다고 다시 그릴
   * 이유가 없고, 상태로 두면 그 갱신이 아래 이펙트를 한 번 더 태운다.
   */
  const handledResync = useRef(0)
  /** 복원 신호 쪽의 같은 장치. 두 이펙트가 각자 든다 — 신호가 서로 다르다. */
  const handledRestore = useRef(0)
  /** «페이지가 사라짐» 신호 쪽의 같은 장치. */
  const handledGone = useRef(0)
  const { projectId, pageId, resyncToken, restoredToken, restoredLead, goneCheck } = props

  /**
   * **서버가 준 페이지를 스토어에 놓고, 그러면서 잃은 것이 있으면 말한다.**
   * 두 재조회 경로(재연결·복원)가 공유한다 — 잃는 것이 같기 때문이다.
   *
   * **`restoreUndo`를 부르지 않는 것이 이 함수의 요점이다.** 근거는 위 `restoreUndo`의
   * 독블록에 있는 실측이다: 서버가 내 것과 갈라진 뒤에 옛 `inverse`를 되살리면 **남의
   * 편집을 조용히 덮는다.** 두 경로 모두 전제가 같다 — 재연결은 끊긴 동안 남이 편집했을
   * 수 있다는 뜻이고, 복원은 문서가 통째로 갈렸다는 뜻이다.
   *
   * **말할 것이 없으면 말하지 않는다.** 버린 편집도 없고 스택도 비어 있었으면 이 재조회는
   * 무해하고, 그때 뜨는 통지는 사용자가 잃지 않은 것에 대한 경고가 된다.
   *
   * **앞 잃음을 덮지 않고 잇는다**(`EditorStore.tellLoss`) — 떠나며 버린 편집의 통지가 서 있는 채 다시 붙으면 «이력 초기화»가 그것을 덮어
   * 떠난 페이지의 잃음이 사라졌다(jsdom). 같은 앞머리의 조각은 수를 더한다.
   */
  const tellLost = useCallback(
    (lead: string, dropped: readonly PendingEdit[], hadUndo: boolean): void => {
      if (dropped.length === 0 && !hadUndo) return
      const sent = dropped.filter(store.wasSent).length
      const unsent = dropped.length - sent
      store.tellLoss({
        key: `resync:${lead}`,
        rank: sent > 0 ? LOSS_RANK.unknown : unsent > 0 ? LOSS_RANK.cancelled : LOSS_RANK.history,
        counts: [sent, unsent, hadUndo ? 1 : 0],
        render: ([sentCount, unsentCount, undoCount]) =>
          resyncNotice(lead, { sent: sentCount ?? 0, unsent: unsentCount ?? 0 }, (undoCount ?? 0) > 0),
      })
    },
    [store],
  )
  /**
   * **판을 비우고, 떠나며 버린 안 보낸 편집을 말한다**(`leftUnsentNotice`) — 판을 비우는 자리(`clearPage`)가 돌려준 것에서 센다. 답을 기다리던
   * 나간 편집은 여기서 안 센다 — 그 답이 거절이면 전송 루프가 합쳐 말하고(`abandonedOnLeave`), 저장됐으면 말할 것이 없다. 통지는 떠난
   * 페이지를 다시 열면 풀린다(`EditorStore.setLeaveNotice`의 `pages` · `leftPage`).
   */
  const leavePage = useCallback((): void => {
    const unsent = store.clearPage().filter((edit) => !store.wasSent(edit)).length
    const left = store.leftPage()
    if (unsent > 0) store.setLeaveNotice(leftUnsentNotice(unsent), left === null ? [] : [left], LOSS_RANK.cancelled)
  }, [store])
  const applyServerPage = useCallback(
    (openPageId: string, page: PageDetail, lead: string, ticket: number, restoreReread = false): void => {
      // **비우기 전에 센다.** `loadPage`가 두 스택을 비우므로 그 뒤에는 알 수 없다.
      const hadUndo = store.getState().undoStack.length > 0
      tellLost(lead, store.loadPage(openPageId, page.schema, page.headSeq, ticket, { restoreReread }), hadUndo)
    },
    [store, tellLost],
  )

  useEffect(() => {
    if (pageId === undefined) {
      // 화면만 되돌리면 스토어에는 앞 페이지의 문서와 `headSeq`가 남는다. 주소에 열린
      // 페이지가 없는데 스토어는 있다고 말하는 상태다 — 문서를 스토어에서 읽는 쪽(캔버스·
      // 구조 트리·속성 패널)이 열려 있지 않은 페이지를 그리게 된다. 남은 `headSeq`가 편집의
      // `baseSeq`가 되면 더 나쁘다.
      leavePage()
      setState({ status: 'empty' })
      return
    }

    // 응답이 오기 전에 다른 페이지로 옮기면 결과를 버린다. 이것이 없으면 늦게 온 앞
    // 페이지의 문서가 뒤 페이지를 덮어쓴다(아래 성공 분기의 `if (!alive) return`이 그
    // 자리다 — 지우면 `앞 페이지의 응답이 늦게 와도…`가 죽는다. 위 JSDoc의 하중 3).
    let alive = true
    // **떠나면 조회를 끊는다**(`ReadOptions.cancel`). `alive`만으로는 응답을 버릴 뿐 요청은 남아, 떠난
    // 방문의 큰 본문이 브라우저 연결을 쥐고 다음 방문의 조회를 줄 세운다(`api/http-client.ts`의 «떠난 조회는 끊는다»).
    const leave = new AbortController()
    setState({ status: 'loading' })
    // **조회를 시작할 때 비운다.** 응답이 온 뒤에 갈아 끼우면 조회가 도는 동안 주소는 새
    // 페이지인데 스토어는 앞 페이지의 문서와 `headSeq`를 들고 있다. 그동안 문서를 스토어에서
    // 읽는 쪽은 열려 있지 않은 페이지를 그리고, 앞 페이지의 revision 위에서 편집 요청이
    // 만들어진다. 캔버스가
    // 잠깐 비는 쪽을 택했다 — 새 페이지의 주소 아래에 앞 페이지의 내용이 그려지는 것보다
    // 낫다. 이미 비어 있으면 스토어가 알리지 않으므로 구독자가 헛일을 하지도 않는다. **비우며 버린 편집은 말한다**(`leavePage`).
    leavePage()

    /**
     * 내 revision을 받아 undo 스택을 채운다. **실패는 삼킨다** — 조회가 실패하면
     * undo만 없고 페이지는 그대로 열려 있다.
     *
     * **판을 실은 바로 뒤의 점(`undoRestorePoint`)을 들고 간다** — 목록을 받는 동안 판이 다시 실리거나(재연결 · 복원 · 수습) 비면 스토어가
     * 그 답을 버린다(세대) — 같은 페이지가 다시 실렸으면 버렸다고 한 줄 말한다(`UNDO_RESTORE_DROPPED_NOTICE`). 판을 실은 번호 뒤의 내 편집은 세션
     * 항목이 이미 든다 — 스토어가 그 아래에 끼운다(`restoreUndoStack`).
     *
     * **되짚는 길에 빠진 번호(내 revision 사이에 낀 남의 것 · 목록 답 전에 온 프레임 · 내 ack)는 여기서 받지 않는다** — 되돌리기를 처음
     * 누를 때 받는다(`edit/use-edit-commit.tsx`의 `undo` · `EditorStore.undoHistoryNeed`). 열 때 받으면 누르지 않아도 문서 통째 교체
     * revision 이 낀 페이지마다 수백 MB 를 내려받는다.
     *
     * **재조회(복구) 경로에서는 이것을 부르지 않는다.** 재조회는 서버가 내 것과 갈라졌다는
     * 뜻이고, 그때 옛 `inverse`를 되살리면 **남의 편집을 조용히 덮는다** — 실측: 내가 `A→B`로
     * 바꾼 뒤 남이 `C`로 바꾼 문서에 내 `inverse`(`replace … ← "A"`)를 적용하면 던지지 않고
     * 그대로 `A`가 되어 `C`가 사라진다. 설계서 「개인 undo/redo」의 건너뛰기는 **노드가 지워진 경우만** 잡는다
     * (그쪽은 `경로를 찾을 수 없습니다`로 던진다). 값이 갈린 흔한 경우는 못 잡으므로,
     * 충돌 뒤에는 스택을 비운 채 두고 사용자가 새로고침으로 되찾게 한다.
     */
    async function restoreUndo(openPageId: string): Promise<void> {
      const point = store.undoRestorePoint()
      if (point === null || point.pageId !== openPageId) return
      try {
        const mine = restoredRevisions(await api.listMyRevisions(projectId, openPageId, { cancel: leave.signal }))
        // 늦게 온 응답이 새 페이지의 스택을 덮지 않게 한다(문서 조회와 같은 가드).
        if (!alive) return
        // **다시 싣기가 버린 목록은 말한다** — 잃음의 조각으로 잇는다(`EditorStore.tellLoss`): 그 다시 싣기가 버린 편집을 이미 말했으면 그
        // 문장 뒤에 선다(세기가 가장 약하다 — 잃은 편집이 없다). 덮으면 그 편집 수를 잃는다. 사람이 누른 동작의 통지는 덮지 않는다(`overOther`).
        if (store.restoreUndoStack(mine, { point }) === 'reloaded') {
          store.tellLoss(
            { key: 'undo-restore-dropped', rank: LOSS_RANK.history, counts: [], render: () => UNDO_RESTORE_DROPPED_NOTICE },
            { overOther: false },
          )
        }
      } catch {
        // 여기서 알리지 않는다. 사용자가 할 수 있는 일이 없고, 편집 실패 통지 자리를
        // 부가 기능의 실패로 채우면 진짜 편집 실패가 묻힌다.
      }
    }

    // 열 페이지를 **인자로** 받는다. 이펙트 위쪽의 `undefined` 검사만으로는 이 안에서
    // `pageId`가 좁혀지지 않는다(호이스팅된 함수 선언이라 TS가 호출 시점을 모른다).
    async function load(openPageId: string): Promise<void> {
      // 판을 싣는 입구다 — 세대를 받는다(`EditorStore.beginPageLoad`의 표). 판이 빈 채 읽으므로 이 페이지의 창이 여기서 열린다.
      const ticket = store.beginPageLoad(openPageId)
      try {
        const page = await api.getPage(projectId, openPageId, { cancel: leave.signal })
        // 이 줄이 없으면 늦게 온 앞 페이지의 응답이 아래 `loadPage`로 흘러 **새 페이지의
        // 문서를 덮어쓴다.** 실측: 지우면 `앞 페이지의 응답이 늦게 와도 새 페이지의 문서를
        // 덮어쓰지 않는다` 하나가 죽는다.
        if (!alive) return
        // **뒤에 시작한 다시 싣기(재연결 · 복원)가 이 페이지를 먼저 실었으면 그 판이 새것이다** — 그 입구가 캔버스도 `ready`로
        // 놓았다. 되돌리기 이력은 채우지 않는다(그 판이 이미 비웠고, 비운 까닭이 이 페이지에도 선다 — 위 `restoreUndo`).
        if (!store.settlePageLoad(ticket)) return
        // **문서는 스토어로 간다.** `headSeq`가 편집 요청의 `baseSeq`다 — 문서와 함께
        // 실어야 편집 요청이 어느 revision 위에서 만들어졌는지가 어긋나지 않는다.
        // 연 페이지의 id도 같은 호출로 넘긴다: 읽는 쪽이 그것을 주소와 대조한다.
        store.loadPage(openPageId, page.schema, page.headSeq, ticket)
        setState({ status: 'ready' })
        // **undo 스택 복원은 `loadPage` 뒤다**. 순서가 뒤바뀌면 방금 채운 스택을
        // `loadPage`가 지운다 — 그것이 페이지 상태를 서버 것으로 놓는 자리이기 때문이다
        // (`store/editor-store.ts`). `restoreUndoStack이 loadPage 뒤에 온다`가 그 순서를
        // 고정한다.
        //
        // **페이지가 뜬 뒤에 받는다.** 이 조회가 실패해도 `setState({ status: 'ready' })`는
        // 이미 지났으므로 페이지는 열려 있다 — undo 복원은 부가 기능이고, 그것 때문에
        // 문서를 못 보게 되면 안 된다.
        void restoreUndo(openPageId)
      } catch (caught) {
        if (!alive) return
        // 뒤에 시작한 다시 싣기가 이미 판을 실었으면 그 판을 실패 문장 아래 감추지 않는다(위 성공 갈래의 세대 줄).
        if (store.pageLoadSuperseded(ticket)) return
        // 여기서 다시 `clearPage()`를 부르지 않는다. 조회 시작 시점에 이미 비웠고, 그
        // 사이에 문서를 싣는 길은 이 이펙트의 성공 분기뿐인데 그쪽은 도달하지 못했다
        // (앞 조회가 늦게 와도 `alive`가 false다 — **그 전제는 위 성공 분기의 가드가
        // 지키고, 그 가드는 `앞 페이지의 응답이 늦게 와도…`가 지킨다**). 여기에
        // `clearPage()`를 넣어도 `--project web` 전량이 그대로 통과한다(다시 재는 법: 넣고
        // `pnpm vitest run --project web`) — 아무도 지키지 않는 줄이라는 뜻이라 두지 않는다. 실패한 뒤 앞 페이지의 문서를
        // **되살려 놓는** 구현은 `다른 페이지의 조회가 실패하면…` 하나가 잡는다.
        //
        // 실패는 **이 상자 안에서** 끝난다. 셸 전체를 오류로 바꾸면 멀쩡한 트리까지
        // 사라져, 사용자가 다른 페이지로 옮겨 갈 길이 없어진다. **세션이 끊긴 것만 예외다**
        // — 그 실패는 이 상자 안에서 끝낼 수 없다(`api/failure.tsx`).
        setState({ status: 'failed', failure: toFailure(caught, PAGE_UNKNOWN_FAILURE) })
      }
    }

    void load(pageId)
    return () => {
      alive = false
      leave.abort()
    }
    // `openAttempt`는 이 이펙트를 다시 태우는 신호다(위 선언).
  }, [api, projectId, pageId, store, leavePage, openAttempt])

  /**
   * **연결이 다시 붙었으므로 페이지를 다시 읽는다**.
   *
   * ## 왜 위 이펙트에 얹지 않았나
   *
   * 위쪽은 **페이지를 여는** 경로다. 조회를 시작할 때 `clearPage()`로 캔버스를 비우고
   * `'loading'`을 그리는데, 재연결마다 그러면 **화면이 깜빡인다** — 사용자는 아무것도 안
   * 했고 문서는 대개 그대로다. 그리고 그쪽은 뒤이어 undo 스택을 복원하는데 **여기서는 그러면
   * 안 된다**(아래).
   *
   * **그래도 페이지 상태를 놓는 자리는 `loadPage` 하나다.** 스토어가 자기 조회를 갖지 않는
   * 것도 그대로다.
   *
   * ## undo 스택을 다시 채우지 않는다 — 그리고 그것을 말한다
   *
   * `loadPage`가 두 스택을 비우는데 여기서 `restoreUndo`를 부르지 않는다. 근거는 위
   * `restoreUndo`의 독블록에 있는 실측이다: 서버가 내 것과 갈라진 뒤에 옛 `inverse`를
   * 되살리면 **남의 편집을 조용히 덮는다.** 재연결로 들어온 재조회도 전제가 같다 — 끊긴
   * 동안 남이 편집했을 수 있다는 뜻이다.
   *
   * **대안 *"리베이스가 서면 이 경로가 드물어진다"*는 성립하지 않는다:** 리베이스는 갭을
   * 고치지 못하고(바탕이 서버 문서와 같아야 한다), 오히려 재연결마다 재조회가 **더해진다.**
   * 그래서 통지에 한 조각을 더한다 — 되돌리기 이력이 사라졌으면 그렇다고 말한다.
   *
   * **말할 것이 없으면 말하지 않는다.** 버린 편집도 없고 스택도 비어 있었으면 이 재조회는
   * 무해하고, 그때 뜨는 통지는 사용자가 하지도 않은 일에 대한 경고가 된다.
   *
   * ## 신호가 오를 때만 돈다 — `pageId`가 바뀔 때가 아니다
   *
   * 의존 배열에 `pageId`가 있으므로 이 이펙트는 **페이지를 옮길 때도 다시 돈다.** 그것을
   * 막지 않으면 **재연결을 한 번이라도 한 뒤로는 페이지를 옮길 때마다 `getPage`가
   * 두 번** 간다(위 이펙트가 한 번, 여기가 또 한 번).
   *
   * **`pageId`를 의존에서 빼는 쪽은 고르지 않았다** — 그러면 이 클로저가 낡은 `pageId`를
   * 들고 돌아 **지금 안 열린 페이지를 다시 읽는다.** 대신 **마지막으로 처리한 신호를 ref로
   * 들고** 같은 신호에 두 번 돌지 않게 한다. 신호가 오른 뒤에 페이지를 옮기면 그때는 위
   * 이펙트가 새 페이지를 서버 것으로 놓으므로, 여기가 또 읽을 이유가 없다.
   */
  useEffect(() => {
    // 첫 연결에서는 위 이펙트가 방금 서버 문서를 놓았다 — 다시 읽을 것이 없다.
    if (resyncToken === 0) return
    // 같은 신호에 두 번 돌지 않는다(위 머리말). **읽기와 쓰기가 한 문에 붙어 있어야 한다** —
    // 사이에 `await`이 끼면 같은 신호의 두 실행이 둘 다 통과한다.
    if (handledResync.current === resyncToken) return
    handledResync.current = resyncToken
    // **페이지가 없어도 신호를 소비한다 — 소비한 *뒤에* 빠진다**.
    // `pageId === undefined`를 위 조건에 얹어 **소비하지 않고** 빠지면, 나중에 페이지를
    // 열 때 이 이펙트가 그 페이지에 대해 한 번 더 돌아 `getPage`가 두 번
    // 간다. 페이지가 없으면 다시 읽을 문서도 없으므로 소비해도 잃는 것이 없다.
    //
    // **무해한 낭비가 아니다.** 두 번째 응답이 위 이펙트의 `restoreUndo`보다 늦게 오면
    // `applyServerPage → loadPage`가 **방금 복원한 undo 스택을 비우고**, 그냥 페이지를 연
    // 사용자에게 *"되돌리기 이력이 초기화됐습니다"*가 뜬다.
    if (pageId === undefined) return

    let alive = true
    // 떠나면 끊는다 — 위 이펙트와 같다.
    const leave = new AbortController()
    void (async () => {
      // 보낸 편집의 답을 받은 뒤에 읽는다 — 그 편집이 판에 실린다(`editsAnswered`).
      await editsAnswered(store, leave.signal)
      if (!alive) return
      // 판을 싣는 입구다 — 세대를 받는다(`EditorStore.beginPageLoad`의 표).
      const ticket = store.beginPageLoad(pageId)
      try {
        const page = await api.getPage(projectId, pageId, { cancel: leave.signal })
        if (!alive) return
        // 뒤에 시작한 다시 싣기가 판을 먼저 정했으면 이 답은 그보다 옛것이다. **판이 같다고 보고 넘어가는 것도 정한 것이다** —
        // 안 적으면 그 뒤에 온 앞 조회의 옛 답이 판을 덮는다(창 안에 얹힌 남의 프레임이 지워진다).
        if (!store.settlePageLoad(ticket)) return
        // **서버 판이 그대로면 다시 싣지 않는다** — 되돌리기 이력을 지킨다. 내 바탕이 곧 서버 문서면 스택의 `inverse`는 그
        // 문서 위의 것이라 남의 편집을 덮을 길이 없다(위 머리말의 전제가 안 선다). 보내지 않은 편집도 그 바탕 위에 그대로
        // 나간다 — 싣으면 오히려 그것을 버리고, 그사이 REST 로 나가던 편집의 답은 모르는 편집의 답이 된다. 다시 붙기만 하고
        // 아무도 안 고친 판이 흔하다 — 같은 사람이 다른 탭에서 다시 로그인하면 소켓을 갈아 끼우며 여기 온다(Chrome: 싣던
        // 판은 «되돌리기 이력이 초기화됐습니다» · 되돌리기 꺼짐). **«그대로»는 번호와 문서가 둘 다 같고 화면이 그 바탕 위에
        // 선 것이다** — 번호만 보면 끊긴 사이 지워졌다 복원으로 되살아난 페이지를 옛 문서로 두고, 바탕만 보면 편집 실패 수습이 아직
        // 되돌리지 못한 거절된 편집을 화면에 둔다(`holdsServerPage`의 머리말). **이 자리에만
        // 둔다** — 복원 경로는 판이 통째로 갈렸다는 신호라 늘 싣는다. 열린 페이지를 함께 보는 것은 «내 바탕»이 이 페이지의
        // 것일 때만 견주려는 것이다 — 그 대조만 떼도 지키는 케이스가 없다(여는 조회가 도는 중이면 그 조회가 싣는다).
        if (store.holdsServerPage(pageId, page.headSeq, page.schema)) return
        applyServerPage(pageId, page, RESYNC_LEAD, ticket)
        // **여는 조회가 실패해 있었으면 캔버스를 되살린다** — 복원 재조회의 같은 줄과 같다. 판은 방금 스토어에 실려 구조
        // 트리 · 속성 패널이 그리는데 캔버스만 실패 문장이면 세 자리가 다른 사실을 말한다. 위에서 넘어간 갈래는 스토어가
        // 이미 이 페이지를 들고 있다는 뜻이고, 그 판을 실은 쪽이 `ready`를 놓았다(여는 조회는 실패하면 스토어를 비운 채다).
        setState({ status: 'ready' })
      } catch {
        // **여기서 알리지 않는다.** 사용자가 요청한 조회가 아니고, 화면은 재연결 전과 같다 —
        // 되돌릴 것도 잃은 것도 없다.
        //
        // ***"낡았다는 것은 `RemoteAlert`가 이미 말하고 있다"*가 아니다.** 끊긴 동안의 프레임은 오지 않았으므로 갭 검사가 돈 적이 없고
        // `remoteStale`은 `null`이다 — 끊길 때 낡음을 세우는 코드도 없다(`onStatus`는 홀더를
        // 비우고 in-flight를 실패시킬 뿐이다). **그래서 이 갈래에서 화면은 낡은 채 아무 말도
        // 안 한다.** 그것을 말하려면 끊김 자체를 그리는 자리가 필요하고, 그 자리는 아직
        // 없다(남은 틈).
      }
    })()

    return () => {
      alive = false
      leave.abort()
    }
  }, [api, projectId, pageId, store, applyServerPage, resyncToken])

  /**
   * **내가 스냅샷을 복원했으므로 페이지를 다시 읽는다.**
   *
   * ## 왜 재연결 이펙트에 얹지 않았나 — 실패했을 때가 다르다
   *
   * 성공 경로는 같고(`applyServerPage`를 공유한다) **실패 경로가 갈린다.**
   *
   * 재연결 쪽은 조용히 둔다: 화면은 재연결 전과 같고 사용자가 요청한 조회도 아니다.
   * **복원 쪽은 그 근거가 성립하지 않는다** — 프로젝트가 방금 통째로 바뀐 것을 이미
   * 알고 있으므로, 화면에 남아 있는 문서는 *"아직 확인 못 한 것"*이 아니라 **틀린 것**이다.
   * 조용히 두면 **되돌렸는데 옛 문서를 그대로 보인다** — 복원 뒤 다시 읽기가 닫으려는 바로
   * 그 고장이 실패 갈래에 남는 꼴이다.
   *
   * ## 실패의 대부분은 "그 페이지가 사라진 것"이다
   *
   * 복원은 스냅샷 시점에 없던 페이지를 지운다. 지금 보고 있던 페이지가 그것이면 이
   * 조회가 404를 받는다. 그때 **스토어도 비운다** — `setState`만 하면 캔버스는 오류를
   * 그리지만 문서를 스토어에서 읽는 나머지 둘(구조 트리·속성 패널)은 **사라진 페이지의
   * 노드를 계속 그린다.** 셋이 같은 사실을 말해야 한다.
   *
   * ## 페이지를 여는 이펙트를 다시 태우지 않는 이유
   *
   * 그쪽(`pageId`가 바뀔 때 도는 이펙트)을 태우면 실패 화면까지 공짜로 얻는다. 그런데
   * 그 경로는 성공 뒤 **undo 스택을 복원한다** — 복원 직후에 그러면 옛 `inverse`가
   * 되돌아온 문서 위에 얹혀 **방금 되돌린 것을 조용히 덮는다.** 그래서 여기 따로 있다.
   *
   * 같은 신호에 두 번 돌지 않는 장치(`handledRestore`)는 재연결 쪽과 같다 — 근거도 같다
   * (신호가 오른 뒤 페이지를 옮기면 위 이펙트가 새 페이지를 서버 것으로 놓는다).
   */
  useEffect(() => {
    if (restoredToken === 0) return
    if (handledRestore.current === restoredToken) return
    handledRestore.current = restoredToken
    // 페이지가 없어도 신호를 소비한다 — 근거는 위 재연결 이펙트의 같은 자리에 있다.
    // **두 이펙트가 같은 모양이라 고장도 같다.** 그때도 **판을 비운 것으로 놓는다**(`clearPage`) — 남의 복원 배너는 페이지를 안
    // 연 화면에도 서고, 그것을 푸는 것은 다시 실은 판뿐이다. 열린 페이지가 없는 화면은 비운 판이 곧 서버 것이다.
    if (pageId === undefined) {
      store.clearPage({ restoreReread: true })
      return
    }

    let alive = true
    // 떠나면 끊는다 — 위 이펙트와 같다.
    const leave = new AbortController()
    void (async () => {
      // **보낸 편집의 답을 받은 뒤에 읽는다**(`editsAnswered`) — 배너의 단추는 누르는 클릭이 blur 로 편집을 내고 곧바로 이 조회를
      // 낸다. 먼저 읽으면 반영된 편집을 버리고 옛 판을 그린다.
      await editsAnswered(store, leave.signal)
      if (!alive) return
      // 판을 싣는 입구다 — 세대를 받는다(`EditorStore.beginPageLoad`의 표).
      const ticket = store.beginPageLoad(pageId)
      try {
        const page = await api.getPage(projectId, pageId, { cancel: leave.signal })
        if (!alive) return
        // 뒤에 시작한 다시 싣기가 판을 먼저 정했으면 이 답은 그보다 옛것이다(재연결 이펙트의 같은 줄).
        if (!store.settlePageLoad(ticket)) return
        // 복원 뒤 다시 읽기의 판이다 — 이 판만 복원 배너를 푼다(`EditorStore.beginRestoreReread`).
        applyServerPage(pageId, page, restoredLead, ticket, true)
        // 앞서 이 페이지의 조회가 실패해 있었을 수도 있다. 복원으로 다시 생긴 페이지를
        // 오류 문장 아래 감춰 두지 않는다.
        setState({ status: 'ready' })
      } catch (caught) {
        if (!alive) return
        // **비우는 것도 판을 정하는 것이다** — 뒤에 시작한 다시 싣기가 이미 실었으면 그 판을 지우지 않는다.
        if (!store.settlePageLoad(ticket)) return
        // 위 머리말의 둘째 절. 문서를 스토어에서 읽는 셋이 같은 사실을 말하게 한다. **비우며 버린 편집은 말한다** — 판을
        // 실을 때(`applyServerPage`)와 같은 문장 길이다. 되돌리기 이력은 말하지 않는다 — 그 페이지를 더 못 연다.
        const { pending } = store.getState()
        store.clearPage({ restoreReread: true })
        tellLost(RELOAD_FAILED_LEAD, pending, false)
        setState({ status: 'failed', failure: toFailure(caught, PAGE_UNKNOWN_FAILURE) })
      }
    })()

    return () => {
      alive = false
      leave.abort()
    }
    // `restoredLead`는 신호와 함께만 바뀐다 — 그 값으로 다시 돌아도 위 `handledRestore`가 막는다.
  }, [api, projectId, pageId, store, applyServerPage, tellLost, restoredToken, restoredLead])

  /**
   * **트리가 이 페이지를 잃었다 — 서버에 묻는다**(셸의 `pageGone` — 좌측 트리가 다시 받은 트리에 열린 페이지가 없을 때 올린다 · `MenuTree`의
   * `onPageGone`). 남이 페이지 · 그 메뉴를 지우면 이 탭은 다음 편집의 404 로만 알았다 — 트리가 지운 신호(`menu-changed`)를 받으면 여기로 온다.
   *
   * | 답 | 화면 |
   * |---|---|
   * | 404 | 판을 비우고(구조 트리 · 속성 패널도 그 페이지의 노드를 내린다) 버린 편집을 말한다(`PAGE_GONE_LEAD`) · 캔버스는 실패 문장 — 복원이 열린 페이지를 지운 판(아래 복원 이펙트의 실패 갈래)과 같은 끝이다 |
   * | 있다 · 판이 같다 | 아무것도 안 한다(트리가 잠깐 낡았다) |
   * | 있다 · 판이 다르다 | 서버 판을 싣는다(재연결 재조회와 같다 — `PAGE_CHECK_LEAD`) |
   * | 그 밖의 실패 | 조용히 둔다(재연결 재조회와 같은 판정 — 사람이 낸 조회가 아니다) |
   *
   * **보낸 편집의 답을 받은 뒤에 묻는다**(`editsAnswered`) — 다른 다시 읽기와 같다. 판을 싣는 입구라 세대를 받는다(`EditorStore.beginPageLoad`의 표).
   * 신호가 가리키는 페이지가 지금 열린 것이 아니면(그 사이 옮겼다) 신호만 소비한다 — 여는 이펙트가 새 페이지를 읽는다.
   */
  useEffect(() => {
    if (goneCheck === null || handledGone.current === goneCheck.at) return
    handledGone.current = goneCheck.at
    if (pageId === undefined || pageId !== goneCheck.pageId) return

    let alive = true
    const leave = new AbortController()
    void (async () => {
      await editsAnswered(store, leave.signal)
      if (!alive) return
      const ticket = store.beginPageLoad(pageId)
      try {
        const page = await api.getPage(projectId, pageId, { cancel: leave.signal })
        if (!alive || !store.settlePageLoad(ticket)) return
        if (store.holdsServerPage(pageId, page.headSeq, page.schema)) return
        applyServerPage(pageId, page, PAGE_CHECK_LEAD, ticket)
        setState({ status: 'ready' })
      } catch (caught) {
        if (!alive) return
        if (!(caught instanceof ApiError && caught.code === 'not-found')) return
        if (!store.settlePageLoad(ticket)) return
        const { pending } = store.getState()
        store.clearPage()
        tellLost(PAGE_GONE_LEAD, pending, false)
        setState({ status: 'failed', failure: toFailure(caught, PAGE_UNKNOWN_FAILURE) })
      }
    })()

    return () => {
      alive = false
      leave.abort()
    }
  }, [api, projectId, pageId, store, applyServerPage, tellLost, goneCheck])

  return (
    /* **무대 — 보이는 크기(프리셋 × 줌 · 프레임 높이 × 줌)짜리 상자.** 가운데 정렬과 칸의 넘침이 이 크기로 선다(`fitZoom` 머리말 «가운데
       정렬은 보이는 폭으로 한다»). 안의 프레임은 `transform` 이 걸려 변환 뒤 상자로만 넘침에 든다 — 무대 높이를 안 걸면 무대가 프레임의 변환
       전 높이로 서서, 줌이 1 보다 작을 때 칸 아래에 그 차만큼 빈 세로 스크롤이 선다(Chrome · 창 1440 · 글 40 줄 · 줌 50%: 칸의 세로 넘침이
       줌 100% 와 같은 709). */
    <div
      className="wb-shell-canvas-stage"
      style={{ width: `${viewportWidth * zoom}px`, ...(frameHeight === null ? {} : { height: `${frameHeight * zoom}px` }) }}
    >
    <div
      ref={frameRef}
      className="wb-shell-canvas-frame"
      // 폭은 프리셋 그대로, 줌은 그 위의 배율이다. 폭에 줌을 곱해 넣으면 "1280 폭에서
      // 어떻게 보이는가"라는 뷰포트 프리셋의 뜻이 깨진다.
      style={{ width: `${viewportWidth}px`, transform: `scale(${zoom})` }}
    >
      {state.status === 'empty' && <p>{NO_PAGE_NOTICE}</p>}
      {state.status === 'loading' && <p role="status">페이지를 불러오는 중…</p>}
      {/* 실패한 동안에는 그릴 문서가 없다. 이 상태로 들어오는 길은 조회뿐이고, 그
          조회가 시작될 때 스토어의 문서를 비웠기 때문이다 — 앞 페이지의 문서를 오류 문장
          밑에 그리면 어느 페이지를 보고 있는지 알 수 없다. */}
      {state.status === 'failed' &&
        (state.failure.kind === 'signed-out' ? (
          <SignedOut />
        ) : (
          <>
            <p role="alert">{state.failure.message}</p>
            <button type="button" onClick={() => setOpenAttempt((attempt) => attempt + 1)}>
              다시 시도
            </button>
          </>
        ))}
      {/* 테마를 싣는 동안은 문서를 안 그린다 — 기본 뷰로 한 번 그렸다가 테마로 갈아 끼우면 캔버스가 한 번 튄다. 번들의 한도가
          이 기다림을 끝낸다(`theme/bundle-loader.ts` 의 `BUNDLE_DEADLINE_MS`). */}
      {state.status === 'ready' &&
        (themeStatus === 'loading' ? <p role="status">테마를 불러오는 중…</p> : <Canvas projectId={projectId} pageId={pageId} editable={props.editable} />)}
    </div>
    </div>
  )
}

/** 모드 토글 — 머리의 가운데. 스토어를 읽고 쓴다. */
function ModeTools(): ReactElement {
  const store = useEditorStoreInstance()
  const mode = useEditorStore(store, (s) => s.mode)

  return (
    /* 두 상태 중 하나를 고르는 자리라 `aria-pressed`를 둘 다에 단다. 눌린 쪽만
       표시하면 보조 기술은 나머지 버튼이 토글인지 알 수 없다. */
    <div className="wb-shell-modes" role="group" aria-label="모드">
      <button
        type="button"
        className="wb-shell-mode"
        aria-pressed={mode === 'edit'}
        onClick={() => store.setMode('edit')}
      >
        편집 모드
      </button>
      <button
        type="button"
        className="wb-shell-mode"
        aria-pressed={mode === 'view'}
        onClick={() => store.setMode('view')}
      >
        뷰 모드
      </button>
    </div>
  )
}

/**
 * 줌 명령 셋 — 머리의 줌 묶음과 접힌 머리의 `…` 항목(`shell/head-fold.ts`)이 함께 부른다. 한계값(0.05~2)은 여기 두지 않는다 — 스토어가
 * 클램프하므로 한 칸씩 밀기만 하면 되고, 한계가 바뀌어도 고칠 곳이 하나로 남는다. 축소만 제 바닥(`ZOOM_OUT_FLOOR`)이 있다.
 */
function useZoomCommands(canvasRef: RefObject<HTMLElement | null>): { zoomOut: () => void; zoomIn: () => void; fit: () => void } {
  const store = useEditorStoreInstance()
  return {
    zoomOut: () => {
      const { zoom } = store.getState()
      store.setZoom(Math.max(zoom - ZOOM_STEP, Math.min(zoom, ZOOM_OUT_FLOOR)))
    },
    // 맞춤이 25% 아래에 둔 배율에서는 한 칸(+25)이 아니라 다음 25 배수(25%)로 오른다 — 18% → 43% 처럼 단계 밖의 값으로 튀지 않는다.
    zoomIn: () => {
      const { zoom } = store.getState()
      store.setZoom(zoom < ZOOM_OUT_FLOOR ? ZOOM_OUT_FLOOR : zoom + ZOOM_STEP)
    },
    /* **누른 순간의 1회 계산이다** — 창 크기를 따라다니지 않는다. 따라다니게 하면
       사용자가 손으로 맞춘 배율을 창을 조금만 흔들어도 빼앗기고, 그것을 막으려면
       *"마지막으로 누른 것이 맞춤인가"*라는 상태가 하나 더 생긴다. 줌 명령 셋은
       전부 **누른 값을 스토어에 놓는** 같은 모양이고, 이것도 그 하나다.

       **폭 기준이다.** 높이까지 맞추면 페이지가 세로로 길어 대개 읽을 수 없는 배율이
       나온다 — 뷰포트 프리셋이 폭만 고르는 것과 같은 축이다.

       한계값은 여기서도 모른다 — 잰 배율을 그대로 넘기고 스토어가 클램프한다
       (`fitZoom`이 `null`을 내는 것은 클램프가 아니라 *"재지 못했다"*이다). */
    fit: () => {
      const canvas = canvasRef.current
      if (canvas === null) return
      const next = fitZoom(canvas, store.getState().viewportWidth)
      if (next === null) return
      store.setZoom(next)
    },
  }
}

/**
 * 뷰포트 프리셋 · 줌 — 머리의 «편집 / 뷰» 다음. 둘 다 스토어를 읽고 쓴다. `fold` 가 좁은 창의 단계다(`shell/head-fold.ts`) — `short` 부터
 * «뷰포트 폭» 글을 눈에서만 감추고(고르개의 접근 이름은 그 글 그대로), `folded` 면 줌 묶음을 안 그린다(셸 `…` 가 든다).
 */
function CanvasTools(props: {
  /** 캔버스 칸. `화면 맞춤`이 이것의 폭을 잰다(위 `fitZoom`). */
  canvasRef: RefObject<HTMLElement | null>
  fold: HeadFold
}): ReactElement {
  const store = useEditorStoreInstance()
  const viewportWidth = useEditorStore(store, (s) => s.viewportWidth)
  const zoom = useEditorStore(store, (s) => s.zoom)
  const commands = useZoomCommands(props.canvasRef)

  return (
    <>
      <label className="wb-shell-field">
        <span className={props.fold === 'wide' ? undefined : 'wb-shell-head-field-hidden'}>뷰포트 폭</span>
        <select
          className="wb-shell-select"
          value={viewportWidth}
          // 프리셋 밖의 값은 스토어가 무시한다. 여기서 다시 거르면 같은 규칙이 두 곳에
          // 생기고, 둘이 어긋나는 날 어느 쪽이 맞는지 알 수 없다.
          onChange={(event) => store.setViewportWidth(Number(event.target.value) as ViewportWidth)}
        >
          {VIEWPORT_PRESETS.map((width) => (
            <option key={width} value={width}>
              {width}px
            </option>
          ))}
        </select>
      </label>

      {props.fold !== 'folded' && (
        <div className="wb-shell-zoom" role="group" aria-label="줌">
          <button
            type="button"
            className="wb-shell-zoom-step"
            aria-label="축소"
            title="축소"
            onClick={commands.zoomOut}
          >
            {shellIcon('zoomOut', 16)}
          </button>
          <span className="wb-shell-zoom-value">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            className="wb-shell-zoom-step"
            aria-label="확대"
            title="확대"
            onClick={commands.zoomIn}
          >
            {shellIcon('zoomIn', 16)}
          </button>
          {/* 누른 순간의 1회 계산 · 폭 기준(`useZoomCommands` 의 `fit`). */}
          <button
            type="button"
            className="wb-shell-zoom-fit"
            aria-label="화면 맞춤"
            title="화면 맞춤"
            onClick={commands.fit}
          >
            {shellIcon('fitWidth', 16)}
          </button>
        </div>
      )}
    </>
  )
}
