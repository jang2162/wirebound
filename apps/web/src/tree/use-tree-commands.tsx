/**
 * 메뉴 트리의 조회·선택·조작을 한 곳에 모은 훅. **화면이 부르는 유일한 관문이다.**
 *
 * 조회가 컴포넌트 안에 있으면 줄 행동이 그것을 부를 길이 없다 — 조작이 끝나면 트리를 다시
 * 받아야 하는데, 재조회 함수가 `MenuTree`의 `useEffect` 안에 갇혀 있기 때문이다.
 * `useStructureCommands` / 구조 트리 줄 행동의 분리와 같은 모양이다.
 *
 * **낙관 적용을 하지 않는다.** 요청 하나가 성공하면 트리를 통째로 다시 받는다. 이 파일의
 * 형태를 정하는 근거는 둘이다 — 서버가 `sortOrder`를 재번호하고,
 * 생성 응답(`MenuNode`)에는 `pages`·`children`이 없어 트리에 그대로 꽂을 수 없다.
 *
 * **큐가 아니라 잠금이다.** 조작이 나가 있는 동안 `busy`가 `true`이고 툴바 전체가
 * 비활성이다. 구조 편집의 직렬화(`store/edit-queue.ts`)와 다른 장치인 이유는 여기 요청끼리
 * 의존이 없기 때문이다 — 막아야 하는 것은 같은 버튼 연타와 "재조회 중에 또 조작"뿐이다.
 *
 * **잠금을 훅 안에 두는 것이 안전한 것은 이 훅의 인스턴스가 하나이기 때문이다.**
 * 훅을 부르는 자리가 둘이 되면 잠금이 각자 것이 되어 요청이 겹쳐 나간다 — `useEditCommit`의
 * 펌프 가드를 훅의 `ref`에 두면 인스턴스가 둘일 때 `maxInFlight`가 2가 되는 것과 같은 고장이다.
 * **이 훅을 부르는 자리는 `panels/menu-tree.tsx` 한 곳이고(`useTreeCommands(` 호출 자리로
 * 센다), 툴바는 그 결과를 prop으로 받는다.** 두 번째 호출자가
 * 생기면 잠금이 각자 것이 되므로, 그때는 잠금을 위로 올려야 한다.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { ApiError, MENU_SUBTREE_CHANGED, readSubtreeListing } from '../api/client'
import { useApi } from '../api/context'
import { toFailure, type Failure } from '../api/failure'
import { MENU_TITLE_CHANGED, PAGE_META_CHANGED, judgeMeta, metaConflict } from '../api/page-meta'
import type { PageImported, TreeMenuNode } from '../api/types'
import { metaConflictSentence } from '../panels/meta-conflict'
import type { PanelLock } from '../panels/panel-drafts'
import { useWriteLedger, writeKey, type PageAt, type Receiver, type WriteConclusion, type WriteTarget } from '../panels/write-ledger'
import { useSessionEpoch } from '../session/session-context'
import {
  flattenMenus,
  menuOutdentTarget,
  menuSubtree,
  previousMenuSibling,
  treeAbilities,
  treeSpot,
  type MenuSubtree,
  type TreeAbilities,
  type TreeSelection,
} from './tree-actions'
import type { MenuDrop } from './tree-drop'

/** 서버가 이유를 주지 않은 조회 실패에 쓸 문장. */
const UNKNOWN_FAILURE = '메뉴를 불러오지 못했습니다'

/**
 * 서버가 이유를 주지 않은 **조작** 실패에 쓸 문장. 조회와 갈라 적는 것은 사용자가 방금 한
 * 일이 다르기 때문이다 — 조회는 화면이 스스로 한 것이고 조작은 사용자가 누른 것이다.
 */
const UNKNOWN_COMMAND_FAILURE = '요청을 처리하지 못했습니다'

/**
 * **트리 이름 변경의 장부 칸**(`panels/write-ledger.tsx`). 키는 (프로젝트, 페이지 없음, 이 칸) — **프로젝트에
 * 하나다.** 트리 조작은 잠금으로 한 번에 하나이고(`run`), 이름 변경이 «모름»에 머무는 동안 그 프로젝트의 트리 조작 전부가 잠긴다
 * (새로 선 트리도 — 에디터를 떠났다 와도). 페이지를 자리로 두지 않는 까닭은 `rename`의 머리말.
 */
const RENAME_SLOT = 'tree/rename'

/**
 * **트리의 칸 — 판정의 말이 닿는 자리**. 이름 변경의 판정은 이것들을 **쓰기를 낸 인스턴스의 state 가
 * 아니라** 장부의 `deliver`로 보낸다 — 지금 떠 있는 트리(`Receiver` — 종류 `'tree'`)가 받는다. 설명의 칸 쓰기와 같은 길이다
 * (`panels/panel-drafts.tsx`의 `usePanelSlot`). 칸은 객체의 정체성으로 가른다.
 */
const TREE_FAILURE = { name: 'tree/failure' }
const TREE_CONFLICT = { name: 'tree/conflict' }
/** 트리 칸 하나를 세운다 — `at`은 그 값을 낸 조회의 순서 번호(`issueTreeRead`), `rev`는 그 답의 판 번호다(실패면 없다). */
const TREE_STATE = { name: 'tree/state' }
interface TreeStateUpdate {
  at: number
  state: TreeLoadState
  rev?: number
}
/** 매달린 내 제목 하나를 고친다 — `titles`가 `null`이면 지운다. */
const TREE_HANGING = { name: 'tree/hanging' }
interface HangingUpdate {
  item: string
  titles: string[] | null
}

/** 시간 안에 응답이 없어 다시 읽는 중(`PendingNotice`). 설명의 문장과 같은 결이다(`panels/page-description.tsx`). */
const RENAME_CHECKING = '응답이 없어 이름이 바뀌었는지 서버에서 확인하는 중입니다'
/** 다시 읽기도 실패했다 — «다시 확인»이 선다. */
const RENAME_UNKNOWN = '응답이 없고, 이름이 바뀌었는지 확인하지도 못했습니다'
/** 다시 읽었더니 서버의 제목이 바탕 그대로다(`judgeMeta`의 `'base'`). */
const RENAME_NOT_SAVED = '응답이 없어 서버를 다시 읽었더니 이름이 바뀌지 않았습니다'
/** 다시 읽었더니 그 항목이 트리에 없다(그 사이 지워졌다). */
const RENAME_GONE = '응답이 없어 서버를 다시 읽었더니 그 항목이 트리에 없습니다'
/**
 * 떠나 있는 동안 끝난 실패의 머리 — **그 프로젝트의 트리가 떠 있지 않을 때** 남는다(트리의 `Receiver.sees`). 프로젝트 목록 ·
 * 테마 편집기에 가 있었든 **에디터 안에서 다른 프로젝트**에 가 있었든 참인 문장이다(«에디터를 떠나 있는 동안»이라 적으면
 * 에디터 안의 다른 프로젝트에 가 있던 경우에 거짓이 된다). 설명의 «이 페이지를 떠나 있는 동안 저장하지 못했습니다»(`pending-notice.tsx`)와 같은 결이다.
 */
const RENAME_MISSED = '이 화면을 떠나 있는 동안 이름을 바꾸지 못했습니다'

/**
 * **트리가 바뀌어 사라진 항목에 열려 있던 입력을 닫았다** — 친 글이 있었을 때만 하단 바에 선다(`reconcile`). 누가 지웠는지 말하지 않는다 —
 * 같은 사람의 다른 탭 · 복원도 같은 신호다(`shell/remote-alert.tsx`의 `NOTICE`와 같은 판정).
 */
export const TREE_DRAFT_DROPPED = '그 항목이 트리에서 사라져 친 이름을 쓰지 않았습니다'
/** 연쇄 삭제 상자가 가리키던 메뉴가 트리에서 사라져 상자를 닫았다(`reconcile`). */
export function cascadeClosedNotice(title: string): string {
  return `"${title}" 메뉴가 트리에서 사라져 삭제 상자를 닫았습니다`
}

/**
 * **트리 조회를 낸 순서**. 트리 칸은 **늦게 낸 조회의 답만** 받는다(`newer`) — 도착 순서가 아니다.
 * 도착 순서로 받으면 에디터를 떠났다 돌아온 새 트리가 **커밋 전에** 건 마운트 조회가, 이름 변경이 커밋된 **뒤** 낸 다시 받기(장부가
 * 새 트리에 배달한다 — `rename`)보다 늦게 올 때 그 옛 제목으로 덮는다(새 트리 `회원` → 마운트 조회가 와서 `회원관리`). 설명의 조회가
 * 같은 창을 `answered`로 닫는 것과 같은 규칙이다(`panels/page-description.tsx`). 트리 인스턴스가 바뀌어도(떠났다 돌아옴) 한 줄로
 * 늘어야 하므로 모듈에 하나 둔다.
 */
let treeReads = 0
function issueTreeRead(): number {
  treeReads += 1
  return treeReads
}

/** `run`의 `send`가 이것을 돌려주면 `run`이 트리를 다시 받지 않는다 — 이름 변경은 스스로 받아 떠 있는 트리로 보낸다(`rename`). */
const NO_RELOAD = Symbol('no-reload')

/** 인라인 입력이 무엇을 위해 열려 있는지. 닫혀 있으면 `null`. */
export interface TreeEditing {
  /**
   * **`new-root-menu`만 선택을 보지 않는다.** 나머지 셋은 고른 것에 붙는 조작이라 선택이
   * 없으면 성립하지 않는데(`treeAbilities`), 최상위 메뉴가 붙는 곳은 트리 자체다 — **빈 트리에는 고를
   * 것이 없고, 그것이 이 갈래가 있는 이유다**(`panels/menu-tree.tsx`의 빈 상태).
   */
  kind: 'new-menu' | 'new-root-menu' | 'new-page' | 'rename'
  /** 입력의 초기값. 이름 변경이면 지금 제목, 새로 만들기면 빈 문자열이다. */
  initial: string
}

/**
 * 조회 상태. 성공과 실패를 판별 유니온으로 가른다 — `menu.length === 0`으로 판정하면
 * 응답이 오기 전과 "메뉴가 없는 프로젝트"와 실패가 전부 같은 값이 된다.
 */
export type TreeLoadState =
  | { status: 'loading' }
  | { status: 'ready'; menu: TreeMenuNode[] }
  | { status: 'failed'; failure: Failure }

export interface TreeCommands {
  state: TreeLoadState
  selection: TreeSelection | null
  /** 메뉴 · 페이지를 고른다(페이지는 줄의 `+` · `…`가 고른다). `null`이면 "열린 페이지가 선택된 것"으로 되돌아간다(선택은 파생값이다 — `selection`). */
  select: (selection: TreeSelection | null) => void
  abilities: TreeAbilities
  /** 조작이 하나 나가 있는 동안 `true`. 툴바 전체가 비활성이다. */
  busy: boolean
  /** 마지막 조작의 실패. 다음 조작이 시작되면 `null`이 된다. */
  failure: Failure | null
  editing: TreeEditing | null
  openInput: (kind: TreeEditing['kind']) => void
  /** Enter로 확정. 빈 문자열이면 아무것도 하지 않는다. */
  submitInput: (title: string) => void
  cancelInput: () => void
  /** 입력에 친 글 — 칠 때마다. 다시 받은 트리가 그 입력의 대상을 지우면 친 글이 있었는지를 이것으로 안다(`reconcile`). */
  typeInput: (value: string) => void
  /**
   * 입력이 설 때의 값 — 친 글이 있으면 그것, 없으면 `editing.initial`. **입력은 다시 마운트될 수 있다** — 남이 그 줄을 다른 부모로
   * 옮기면 React 가 줄째 새로 그려 입력도 새로 선다. 시작 값을 `editing.initial`로 주면 친 글이 연 순간의 제목으로 말없이 돌아간다.
   */
  inputValue: () => string
  /** 삭제 확인(두 번 누르기의 첫 번째)이 걸려 있으면 `true`. 하위가 없는 메뉴와 페이지의 길이다. */
  confirmingRemove: boolean
  /**
   * 고른 것을 지우려고 묻는다. **하위(메뉴 · 페이지)가 있는 메뉴면 확인 상자**(`removing` — `panels/menu-delete-dialog.tsx`)를, 아니면
   * 두 번 누르기의 첫 번째(`confirmingRemove`)를 건다.
   */
  askRemove: () => void
  confirmRemove: () => void
  cancelRemove: () => void
  /** 연쇄 삭제 확인 상자의 대상. 닫혀 있으면 `null`. 상자가 보이는 목록이 곧 보내는 id 집합이다(`cascadeShown`). */
  removing: RemoveTarget | null
  /** 상자의 «삭제» — 상자가 보인 id 집합을 싣고 연쇄 삭제를 보낸다. 서버의 집합이 다르면 서버가 실은 지금 목록으로 상자를 다시 연다. */
  confirmCascade: () => void
  closeRemoving: () => void
  /** 형제 사이에서 한 칸 옮긴다. `-1`이면 위로, `+1`이면 아래로. */
  move: (delta: -1 | 1) => void
  /** 한 단계 안으로 — 앞 형제 메뉴의 마지막 자식이 된다. */
  indent: () => void
  /** 한 단계 밖으로 — 부모의 다음 형제가 된다. */
  outdent: () => void
  /**
   * **페이지 가져오기 대화 상자의 대상** — 열려 있으면 연 순간의 메뉴(id · 제목), 닫혀 있으면 `null`(`panels/page-import-dialog.tsx`).
   * 대상을 **연 순간의 id 로 쥔다** — 상자가 열린 동안 남이 그 메뉴를 지우면 트리의 선택 · 판정이 아니라 서버의 거절이 그것을 말한다
   * (`importFailure`).
   */
  importing: ImportTarget | null
  /** 고른 메뉴를 대상으로 상자를 연다 — 판정은 «페이지 추가»와 같은 `abilities.addPage`다. */
  openImport: () => void
  /**
   * 상자를 닫는다 — 상자 안의 실패도 함께 걷힌다(읽은 사람이 닫은 것이다). 보내는 중에도 닫힌다(머리 «닫기» · Escape — 답이 오래 걸릴 때
   * 사람을 가두지 않는다). 보낸 요청은 멈추지 않는다 — 답은 아래 `importJson`의 자리 규칙을 따른다.
   */
  closeImport: () => void
  /**
   * **파일 한 벌로 페이지를 만든다**(설계서 「페이지 JSON」). 상자의 대상 **메뉴** 밑에 붙는다.
   *
   * **`submitInput('new-page')`와 같은 잠금·재조회·이동을 지난다** — 가져오기도 트리를
   * 바꾸는 조작이고, 여기에 자기 잠금을 따로 두면 트리 조작 하나가 나가 있는 동안 가져오기가
   * 겹쳐 나간다(트리 조작의 잠금이 막는 그것).
   */
  importJson: (file: unknown, title?: string) => void
  /**
   * **가져오기 실패의 자리 — 상자 안이다.** 보낸 상자가 아직 열려 있으면 실패가 여기 서고(상자를 닫지 않고 고른 파일 · 글자를 둔 채
   * 이유를 보인다), 그 사이 상자를 닫았으면 트리의 `failure`로 간다 — 한 실패가 서는 자리는 언제나 하나다.
   */
  importFailure: Failure | null
  /**
   * **페이지 제목의 충돌**(`api/page-meta.ts`). 이름 변경이 409 · `page-meta-changed`를 받았고 서버 값이
   * 내 제목도 아니면 선다 — 그 사람의 제목(`theirs`)과 내가 친 제목(`mine`)을 든다. 다음 조작 · 다른 선택에 풀린다.
   */
  conflict: TitleConflict | null
  /** «내 글로 덮기» — 그 사람의 제목을 새 바탕으로 내 제목을 다시 보낸다. */
  overwriteTitle: () => void
  /** «내 글 버리기» — 그 사람의 제목을 받는다(트리는 충돌 때 이미 다시 받았다). */
  discardTitle: () => void
  /**
   * **이름 변경의 장부 칸** — 단계(«확인 중» · «모름»과 «다시 확인») · 떠나 있는 동안 끝난 실패. 화면은 이것을
   * `PendingNotice`로 그린다(`panels/menu-tree.tsx`). 이것이 서 있는 동안 `busy`도 선다.
   */
  renameLock: PanelLock
  /** `PendingNotice`에 줄 문장 셋(«확인 중» · «모름» · 떠나 있는 동안의 머리). */
  renameNotices: { checking: string; unknown: string; missedLead: string }
  /** 소속 메뉴 목록이 열려 있으면 고를 수 있는 것들. 닫혀 있으면 `null`. */
  reparenting: { id: string; path: string }[] | null
  openReparent: () => void
  reparentTo: (menuId: string) => void
  cancelReparent: () => void
  /**
   * **끌어 놓은 자리로 옮긴다**(`tree/tree-drop.ts` 의 `menuDropTarget` 이 준 자리). 선택이 아니라 끈 것에 대해 돈다 — 끌기는 줄을
   * 고르지 않는다(누름이 클릭이 아니다 — `drag/use-pointer-drag.ts` 의 «끈 뒤의 클릭을 삼킨다»).
   */
  dropTo: (dragged: TreeSelection, target: MenuDrop) => void
}

/**
 * 연쇄 삭제 상자의 대상 — `TreeCommands.removing`. `changed`는 서버가 «그 사이 하위가 바뀌었다»(409 `MENU_SUBTREE_CHANGED`)로 돌려보내
 * 다시 묻는 판이고, `listed`는 그 409 가 실은 지금 목록이다 — 있으면 상자는 그것을 보이고 그 id 를 보낸다(`cascadeShown`).
 */
export interface RemoveTarget {
  menuId: string
  changed: boolean
  listed: MenuSubtree | null
}

/**
 * 상자가 보이는 목록 — 서버가 409 로 실은 목록이 있으면 그것, 없으면 지금 트리에서 센 것. **상자와 보내는 자리(`confirmCascade`)가 이
 * 함수 하나를 부른다** — 보이는 것이 보내는 것이어야 서버의 집합 견줌이 «사람이 본 것만 지운다»를 지킨다(apps/api README «메뉴 연쇄
 * 삭제»). 409 목록을 트리보다 앞에 두는 까닭: 다시 받은 트리는 409 뒤의 조회라 그 사이 또 바뀌었을 수 있고, 그래도 서버가 다시 견주므로
 * 어느 쪽을 보여도 본 것만 지운다 — 앞에 두면 상자가 «바뀌었다»를 말한 바로 그 목록을 보인다.
 */
export function cascadeShown(target: RemoveTarget, menu: TreeMenuNode[] | null): MenuSubtree | null {
  return target.listed ?? menuSubtree(menu, target.menuId)
}

/** 가져오기 상자의 대상 메뉴 — `TreeCommands.importing`. */
export interface ImportTarget {
  menuId: string
  /** 연 순간의 제목 — 상자의 제목이 말한다. 그 뒤 이름이 바뀌어도 상자는 연 그 메뉴를 말한다. */
  title: string
}

/** 이름 변경이 만난 제목 충돌 — `TreeCommands.conflict`. **메뉴도 같다.** */
export interface TitleConflict {
  /** 무엇의 제목인가 — 메뉴 · 페이지. */
  target: TreeSelection
  /** 내가 친 제목. */
  mine: string
  /** 서버가 견준 그 사람의 제목 — «내 글로 덮기»의 새 바탕이다. */
  theirs: string
  /** 그 제목이 **앞서 보낸 내 제목과 같다**(`judgeMeta`의 `'late'`) — «다른 사람이 바꿨다»고 말하지 않는다. */
  late: boolean
}

export function useTreeCommands(props: {
  projectId: string
  pageId: string | undefined
  /** 오를 때마다 트리를 다시 받는다. 지금 올리는 것은 스냅샷 복원 하나다(아래 이펙트). */
  reloadToken: number
  /**
   * **가져온 결과를 하단 바에 세운다**(`panels/page-json-notices.tsx` — 셸이 상태를 든다). 성공하면 결과를, 다음 가져오기를 보낼 때
   * `null`을 준다. **`failure`와 다른 축이다** — 성공했는데도 말해야 하는 것(고아가 된 코멘트 수 · 쓰지 않은 `layoutRef`)이 있고, 그것을
   * `failure`에 실으면 성공이 실패처럼 보인다. 없으면 결과를 말하지 않는다.
   */
  onImported?: (imported: PageImported | null) => void
  /**
   * **셸이 본 가장 큰 `menu-changed` 번호**(`realtime/use-realtime.ts`). 이 칸의 트리 번호보다 크면 다시 받는다(`refresh`). 없으면 0 —
   * 실시간 연결이 없는 화면은 남의 변경을 안 받는다.
   */
  remoteRev?: number
  /** 오를 때마다 다시 받는다 — 실시간 연결이 다시 붙었다(끊긴 동안의 `menu-changed`는 다시 오지 않는다). 셸의 `resyncToken`이다. */
  resyncToken?: number
  /** 하단 바에 한 줄 — 다시 받은 트리가 열린 입력 · 상자의 대상을 지웠을 때(`reconcile`). 없으면 말하지 않는다. */
  onDropped?: (message: string) => void
  /**
   * **열린 페이지(`pageId`)가 트리에서 사라졌다** — 앞 트리에 있던 그 페이지가 새 트리에 없다. 셸이 캔버스에 넘겨 서버에 묻는다
   * (`routes/editor.tsx`의 `CanvasFrame` «페이지가 사라짐»). 내가 지운 페이지는 안 부른다(`ownRemoval`) — 지운 조작이 프로젝트 뿌리로 옮긴다.
   */
  onPageGone?: (pageId: string) => void
}): TreeCommands {
  const api = useApi()
  // **렌더 시점 판정이 아니라 명령형 이동(`useNavigate`)이다.** 렌더 시점 판정
  // (`<Navigate>` 컴포넌트 — `api/failure.tsx`의 *"컴포넌트인 것이 요점이다"*)의 관용구는
  // "이 상태면 저기로 간다"를 말한다. 여기 이동은 **비동기 조작이 끝난 뒤의 명령형 이동**이라
  // 그렇게 표현되지 않는다: 만들기가 성공한 그 순간에만 한 번 일어나고, 렌더가 다시 돌 때
  // 같은 판정을 되풀이하면 안 된다.
  const navigate = useNavigate()
  const { projectId, pageId, reloadToken } = props
  const remoteRev = props.remoteRev ?? 0
  const resyncToken = props.resyncToken ?? 0

  const [state, setState] = useState<TreeLoadState>({ status: 'loading' })
  /**
   * 이 트리 칸에 선 값의 조회 번호(`issueTreeRead`). **늦게 낸 조회의 답만 받는다** — 판정은 `newer` 한 줄이다. ref 인 것은
   * 칸을 세우는 자리가 둘(이 인스턴스의 `load` · 장부가 배달하는 `accept`)이고 둘 다 렌더 밖의 비동기 뒤에 돌기 때문이다.
   */
  const shownAt = useRef(0)
  /** `at`에 낸 조회의 답이 이 칸에 설 수 있는가 — 그보다 늦게 낸 조회의 답이 이미 섰으면 아니다. 서면 번호를 올린다. */
  const newer = useCallback((at: number): boolean => {
    if (at < shownAt.current) return false
    shownAt.current = at
    return true
  }, [])
  /** 이 칸에 선 트리의 판 번호(`TreeRead.rev`). `settles`가 올린다. */
  const shownRev = useRef(0)
  /**
   * **`at`에 낸 조회가 판 `rev`를 답했다 — 이 칸에 설 수 있는가.** 판 번호가 먼저다: 작은 번호의 답은 늦게 냈어도 낡았고(두 조회가 다른 연결로
   * 가 서버에서 차례가 뒤집혔다), 큰 번호의 답은 일찍 냈어도 새것이다. 번호가 같으면 «늦게 낸 조회의 답만»(`newer`) — 번호를 모르는 답(테스트의
   * 가짜 api 는 늘 0)이 그 규칙 하나로 갈린다. 서면 번호 둘을 올린다.
   */
  const settles = useCallback((at: number, rev: number): boolean => {
    if (rev < shownRev.current) return false
    if (rev === shownRev.current && at < shownAt.current) return false
    shownRev.current = rev
    shownAt.current = Math.max(shownAt.current, at)
    return true
  }, [])
  const [picked, setPicked] = useState<TreeSelection | null>(null)
  /**
   * **잠금(`inFlight`)과 표시(`busy`)를 갈라 둔다.**
   *
   * - `inFlight`는 **제어 플래그**다. 조작이 나가 있는 동안 두 번째 요청을 막는다.
   * - `busy`는 **관측 상태**다. 버튼을 비활성으로 그리려면 렌더가 그것을 봐야 한다.
   *
   * **잠금이 `ref`여야 하는 이유는 잰 것이다.** `useState`의 `busy` 하나로 둘을 다
   * 하면, `run`이 매 렌더 새로 만들어지고 `busy`를 **그 렌더의 값으로 닫으므로** 같은
   * 클로저에서 오는 두 번째 호출은 여전히 `false`를 본다(`setBusy(true)`는 다음 렌더에야
   * 보인다). 한 렌더의 `commands`를 붙잡고 같은 tick에 `submitInput`을 두 번 부르면
   * `createMenu`가 **2회** 나간다(`조작 잠금 > 같은 tick에 두 번 확정해도 요청은 한 번이다`가
   * 잰다). 렌더를 사이에 두면 1회다 — 즉 state 가드가 막는 것은
   * 버튼의 `disabled`가 이미 막는 부류뿐이다.
   *
   * **`editor-store.ts`의 `#pumping`과 같은 부류이되 원인이 다르다.** 그쪽이 스토어에 있는
   * 것은 `useEditCommit`을 부르는 자리가 **여럿**이라 훅의 `ref`로는 인스턴스마다 가드가 따로
   * 서기 때문이고(`maxInFlight`가 2가 된다), 여기는 훅 인스턴스가 하나이므로 훅의 `ref`로 닫힌다.
   * 공통점은 "상태로는 동기 재진입을 막지 못한다"이다.
   */
  const inFlight = useRef(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [conflict, setConflict] = useState<TitleConflict | null>(null)
  const [editing, setEditing] = useState<TreeEditing | null>(null)
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const [removing, setRemoving] = useState<RemoveTarget | null>(null)
  const [pickingMenu, setPickingMenu] = useState(false)
  const [importing, setImporting] = useState<ImportTarget | null>(null)
  /**
   * **열린 상자의 대상 — 렌더 밖에서 읽는 사본.** 가져오기의 답(`run` 뒤)이 «보낸 그 상자가 아직 열려 있나»를 물을 때 쓴다 — 닫았다
   * 다시 연 상자는 다른 객체라 지난 상자의 실패가 새 상자에 서지 않는다.
   */
  const importOpen = useRef<ImportTarget | null>(null)
  const [importFailure, setImportFailure] = useState<Failure | null>(null)

  /**
   * **이름 변경의 장부 칸**(`RENAME_SLOT`). 장부는 에디터보다 오래 살므로(`panels/write-ledger.tsx`), 이름
   * 변경이 나가 있는 채 에디터를 떠났다 오면 **새로 선 트리도 잠긴 채** 선다 — 이 인스턴스의 `inFlight`는 새것이라 모른다.
   */
  const ledger = useWriteLedger()
  const renameTarget = useMemo<WriteTarget>(
    () => ({ projectId, pageId: undefined, slot: RENAME_SLOT, realm: 'tree' }),
    [projectId],
  )
  const renameEntry = ledger.writes.get(writeKey(renameTarget))
  const renameLocked = renameEntry !== undefined
  const renameLock: PanelLock = {
    locked: renameLocked,
    phase: renameEntry?.phase ?? null,
    recheck: renameEntry?.recheck ?? null,
    missed: ledger.missed.get(writeKey(renameTarget)) ?? null,
    dismiss: () => ledger.dismiss(renameTarget),
    run: (write) => ledger.run(renameTarget, receiver.token, write),
  }
  /**
   * **매달린 내 제목**(`api/page-meta.ts`의 `judgeMeta` — `'late'`). 판정이 «바뀌지 않았습니다»(`'base'`)였던 이름 변경이
   * 보낸 제목을 항목마다 든다 — 끊긴 요청이 늦게 커밋되면 다음 이름 변경의 409 가 그 제목을 싣고 온다. 들지 않으면 **내
   * 제목이 «다른 사람의 제목»으로** 보인다(설명의 `Draft.pending`과 같은 까닭). 이 인스턴스에 산다 — 에디터를 떠나면
   * 버려진다(남는 틈).
   */
  const hanging = useRef(new Map<string, string[]>())
  /** 열린 입력에 친 글(`typeInput`). 입력을 열면 비운다 — `null`이면 아직 안 쳤다. */
  const typed = useRef<string | null>(null)

  /**
   * **선택은 파생값이다.** `picked`가 `null`이면 주소가 말하는 페이지가 선택이다.
   *
   * 이펙트로 동기화하지 않는다. 그렇게 하면 주소가 바뀔 때마다 렌더가 한 번 더 돌고,
   * 그 사이에 "주소는 새 페이지인데 선택은 아직 옛 것"인 렌더가 낀다.
   *
   * **다만 그 창을 이 저장소의 테스트로는 재지 못한다.** 이 자리를
   * `useState` + `useEffect` 동기화로 바꿔도 **`--project web` 전량에서 죽는 케이스가 없다.**
   * RTL의 `fireEvent`가 `act` 안에서 돌아 이펙트를 **동기적으로 flush**하므로, 클릭
   * 다음 줄에서 읽는 시점에는 이미 이펙트가 지나간 뒤다 — 그 "한 프레임"은
   * 실제 브라우저의 페인트 사이 창이고 jsdom에는 그 사이가 없다.
   *
   * 그래서 파생을 고르는 근거는 **잰 것이 아니라 형태다**: 상태가 하나 줄고, 주소와
   * 선택이 어긋날 수 있는 중간 상태 자체가 없다. 창의 크기는 재지 않았다.
   */
  const selection: TreeSelection | null =
    picked ?? (pageId !== undefined ? { kind: 'page', id: pageId } : null)

  const menu = state.status === 'ready' ? state.menu : null
  const abilities = treeAbilities(menu, selection)

  /** 내가 지우려고 보낸 페이지 id — 그 페이지가 트리에서 빠져도 «사라짐»을 안 부른다(`onPageGone`). 트리에 다시 서면(복원) 걷는다. */
  const ownRemoval = useRef(new Set<string>())
  /** 앞 렌더의 트리 — «앞 트리에 있던 페이지가 새 트리에 없다»를 가른다. */
  const lastMenu = useRef<TreeMenuNode[] | null>(null)
  const onPageGone = useRef(props.onPageGone)
  onPageGone.current = props.onPageGone
  /**
   * **열린 페이지가 트리에서 빠지면 셸에 알린다**(`onPageGone`). 트리가 바뀔 때마다 — 남의 변경으로 받은 트리든 내 조작 · 복원 뒤의 다시
   * 받기든. **앞 트리에 있던 것만 센다** — 트리가 처음 설 때 주소의 페이지가 없는 판(다른 프로젝트의 주소 · 이미 지워진 주소)은 캔버스의 여는
   * 조회가 이미 404 를 말한다.
   */
  useEffect(() => {
    const before = lastMenu.current
    lastMenu.current = menu
    if (menu === null || pageId === undefined) return
    const now = findPageTitle(menu, pageId) !== null
    if (now) {
      ownRemoval.current.delete(pageId)
      return
    }
    if (before === null || findPageTitle(before, pageId) === null || ownRemoval.current.has(pageId)) return
    onPageGone.current?.(pageId)
  }, [menu, pageId])

  /**
   * **남의 변경으로 받은 트리에 열린 것을 맞추는 자리**(`reconcile` — 아래 선언). ref 인 것은 그 함수가 렌더마다 지금 상태를 닫아 새로 서기
   * 때문이다 — `load`의 의존에 넣으면 마운트 조회가 렌더마다 다시 돈다.
   */
  const reconcileRef = useRef<(next: TreeMenuNode[]) => void>(() => {})

  /**
   * 트리를 받는다. `reload`가 `true`면 `loading`으로 되돌리지 않는다 — 조작 뒤의 재조회에서
   * 트리가 잠깐 사라지면 사용자가 방금 만든 것을 확인할 자리가 흔들린다.
   *
   * **`alive` 플래그는 프로젝트가 바뀔 때를 위한 것이다**(`routes/require-auth.tsx`와 같은
   * 이유) — 응답이 오기 전에 화면이 바뀌면 결과를 버린다.
   *
   * **`.then(ok, err)`이 아니라 try/catch인 것은 호출 자체가 그 자리에서 던질 수도 있기
   * 때문이다.** 그 예외는 이펙트 밖으로 새어 나가 앱 트리를 통째로 죽인다.
   */
  const load = useCallback(
    async (alive: () => boolean, reload: boolean, cancel?: AbortSignal, remote = false): Promise<void> => {
      // **번호는 보낼 때 받는다**(`issueTreeRead`) — 판 번호가 같으면 그 뒤에 낸 조회의 답이 먼저 서 있는 이 답은 낡았다(`settles`).
      const at = issueTreeRead()
      if (!reload) setState({ status: 'loading' })
      try {
        const read = await api.readTree(projectId, cancel === undefined ? undefined : { cancel })
        if (!alive() || !settles(at, read.rev)) return
        // **남의 변경으로 받은 트리면 열린 입력 · 상자 · 선택을 맞춘다**(`reconcile`) — 내 조작 뒤의 다시 받기는 그 조작이 스스로 맞춘다.
        if (remote) reconcileRef.current(read.menu)
        setState({ status: 'ready', menu: read.menu })
      } catch (caught) {
        // **남의 변경으로 낸 조회의 실패는 조용히 둔다** — 화면은 앞 트리 그대로이고, 사람이 누른 조회가 아니다(재연결 재조회와 같은 판정 —
        // `routes/editor.tsx`). 실패 화면으로 바꾸면 멀쩡히 보이던 트리를 가린다. 다음 신호 · 재연결이 다시 받는다.
        if (!alive() || remote || !newer(at)) return
        // 실패 → 화면 규칙은 `api/failure.tsx`에 있다. 여기서 다시 판정하지 않는다.
        setState({ status: 'failed', failure: toFailure(caught, UNKNOWN_FAILURE) })
      }
    },
    [api, projectId, newer, settles],
  )

  useEffect(() => {
    let alive = true
    // **떠나면 요청째 끊는다**(`ReadOptions.cancel`). 답만 버리면(`alive`) 떠난 트리의 조회가
    // 끝까지 내려받힌다(Chrome: 트리 조회를 붙잡아 둔 채 목록으로 가도 그 조회가 200 으로 끝까지 온다). 페이지 조회와 같은 장치다
    // (`routes/editor.tsx`).
    const leave = new AbortController()
    void load(() => alive, false, leave.signal)
    return () => {
      alive = false
      leave.abort()
    }
  }, [load])

  /**
   * **바깥이 신호를 올리면 다시 받는다.** 지금 올리는 것은 **스냅샷 복원**이다(셸의
   * `restoredToken`) — 복원은 페이지를 지우고 만들므로 이 목록 자체가 바뀐다.
   *
   * **`reload: true`다.** 위 이펙트와 갈리는 자리가 그것이고, 조작 뒤 재조회와 같은
   * 이유다 — 트리가 잠깐 사라지면 사용자가 방금 되돌린 결과를 확인할 자리가 흔들린다.
   *
   * **의존의 `load`가 바뀔 때는 돌지 않아야 한다.** `load`는 `projectId`가 바뀌면 새로
   * 만들어지는데, 그때는 위 이펙트가 이미 새 프로젝트의 트리를 받는다. 마지막으로 처리한
   * 신호를 ref로 들어 같은 신호에 두 번 돌지 않게 한다 — 셸의 재조회 이펙트가 같은 자리에서
   * 같은 장치를 쓰고, 근거도 같다(`routes/editor.tsx`).
   */
  const handledReload = useRef(0)
  useEffect(() => {
    if (reloadToken === 0 || handledReload.current === reloadToken) return
    handledReload.current = reloadToken

    let alive = true
    const leave = new AbortController()
    void load(() => alive, true, leave.signal)
    return () => {
      alive = false
      leave.abort()
    }
  }, [load, reloadToken])

  /**
   * 화면이 사라진 뒤의 `setState`를 막는다. **이펙트의 `alive` 플래그로는 안 되는 자리다** —
   * 조작은 버튼 클릭에서 시작해 `await` 뒤에 상태를 쓰므로, 그 사이에 화면이 사라졌는지를
   * 알 방법이 그 클로저에 없다.
   */
  const unmounted = useRef(false)
  /** 이 트리가 내려가면 끊기는 신호 — 조작 뒤의 다시 받기(`run`)가 싣는다(떠난 트리의 조회를 끊는다 — 위 마운트 조회와 같다). */
  const gone = useRef(new AbortController())
  useEffect(() => {
    unmounted.current = false
    gone.current = new AbortController()
    const leaving = gone.current
    return () => {
      unmounted.current = true
      leaving.abort()
    }
  }, [])

  /**
   * **남의 변경으로 다시 받는다** — `menu-changed`의 번호가 이 칸의 트리보다 크거나(`remoteRev`) 연결이 다시 붙었을 때(`resyncToken`).
   *
   * **받는 중에 온 신호는 합친다** — 조회가 떠 있으면 «한 번 더»만 적고, 끝나면 한 번 더 받는다. 떠 있던 조회는 그 신호보다 먼저 났을 수 있어
   * (서버가 그 커밋 앞에서 읽었다) 버릴 수 없고, 신호마다 조회를 내면 남이 잇달아 고칠 때 조회가 줄을 선다. 신호 뒤에 낸 조회는 그 커밋 뒤에
   * 읽으므로(신호는 커밋 뒤에 나간다) 합친 한 번이 그 사이 신호를 다 덮는다.
   *
   * **잠금(`inFlight`)을 안 잡는다** — 사람의 조작이 아니다. 조작이 떠 있어도 받고, 둘의 답은 판 번호로 가른다(`settles`).
   */
  const refreshing = useRef(false)
  const refreshAgain = useRef(false)
  const refresh = useCallback(async (): Promise<void> => {
    if (refreshing.current) {
      refreshAgain.current = true
      return
    }
    refreshing.current = true
    try {
      do {
        refreshAgain.current = false
        await load(() => !unmounted.current, true, gone.current.signal, true)
      } while (refreshAgain.current && !unmounted.current)
    } finally {
      refreshing.current = false
    }
  }, [load])

  // 번호를 보고 판정한다 — 이 칸이 이미 그 판을 들고 있으면(내 쓰기의 다시 받기가 먼저 끝났다) 받지 않는다.
  useEffect(() => {
    if (remoteRev > shownRev.current) void refresh()
  }, [remoteRev, refresh])

  /** 재연결 신호 — 같은 신호에 두 번 돌지 않는다(위 `handledReload`와 같은 장치). */
  const handledResync = useRef(0)
  useEffect(() => {
    if (resyncToken === 0 || handledResync.current === resyncToken) return
    handledResync.current = resyncToken
    void refresh()
  }, [resyncToken, refresh])

  /**
   * **이 트리가 받는 자리로 선다**(`panels/write-ledger.tsx`의 `Receiver` — 종류 `'tree'`). 이름 변경의 판정이 끝났을 때
   * 그 쓰기를 낸 트리가 내려가 있고 **새 트리가 떠 있으면**(에디터를 떠났다 돌아왔다) 판정의 말이 이 새 트리에 닿는다 — 낸
   * 인스턴스의 state 에만 쓰면(`if (alive()) …`) 새 트리는 «바뀌지 않았습니다»도 충돌 화면도 없이 잠금만 풀린다.
   *
   * **보는 것은 프로젝트다** — 트리는 그 프로젝트의 어느 페이지에서나 떠 있고, 같은 프로젝트 안의 페이지 이동에 다시 마운트되지
   * 않는다(jsdom · Chrome 둘 다). `accept`와 `sees`가 같은 판정이다. 우측 패널(종류 `'page'`)과 겹치지 않는다 — 한 쓰기를
   * 보는 자리는 그 쓰기의 종류의 것 하나다.
   */
  const accept = useCallback(
    (at: PageAt, key: object, update: unknown): void => {
      if (unmounted.current || at.projectId !== projectId) return
      if (key === TREE_FAILURE) setFailure(update as Failure | null)
      else if (key === TREE_CONFLICT) setConflict(update as TitleConflict | null)
      else if (key === TREE_STATE) {
        // **늦게 낸 조회의 답만**(`newer`) — 이 트리의 마운트 조회가 배달된 값보다 먼저 났으면 그 조회의 답은 여기서 버려진다.
        const { at: readAt, state: next, rev } = update as TreeStateUpdate
        if (rev === undefined ? newer(readAt) : settles(readAt, rev)) setState(next)
      }
      else if (key === TREE_HANGING) {
        const { item, titles } = update as HangingUpdate
        if (titles === null) hanging.current.delete(item)
        else hanging.current.set(item, titles)
      }
    },
    [projectId, newer, settles],
  )
  const sees = useCallback((at: PageAt): boolean => !unmounted.current && at.projectId === projectId, [projectId])
  const [token] = useState(() => Symbol('tree'))
  const receiver = useMemo<Receiver>(() => ({ token, realm: 'tree', accept, sees }), [token, accept, sees])
  const { receive } = ledger
  // **레이아웃 이펙트다** — 우측 패널과 같은 까닭(`panel-drafts.tsx`): 자식 이펙트보다 먼저 선다.
  useLayoutEffect(() => receive(receiver), [receive, receiver])
  // 칸 쓰기의 주소 — 그 쓰기를 부른 렌더의 세션 세대를 단다(장부가 지난 세대의 것을 버린다).
  const epoch = useSessionEpoch()

  /**
   * 조작 하나를 보내고 **성공하면 트리를 다시 받는다. 재조회가 곧 수렴이다.**
   *
   * `after`는 재조회 **뒤에** 부른다 — 주소를 옮기는 것이 그 자리다. 실패하면 부르지
   * 않는다: 만들지 못한 페이지로 가면 안 된다.
   *
   * **실패해도 트리를 다시 받지 않는다 — 404 만 뺀다.** 서버가 거절했다는 것은 트리가 그대로라는 뜻이라 받아 봐야 같은 것이 온다. 404 는
   * 반대로 «이 트리가 낡았다»다(대상이 이미 없다 — 남이 지운 신호를 못 받았거나 실시간 연결이 없다) — 그때는 다시 받는다(아래 `catch`).
   *
   * **"재조회하면 실패 문장이 조회 상태에 덮인다"는 근거로 쓰지 않는다 — 조건이 빠진
   * 문장이다.** 실패 뒤에도 재조회하도록 바꿔 재면 **재조회가 성공하면 실패 문장이 그대로
   * 보이고**(`getTree` 2회, 트리도 그려진다) **재조회까지 실패했을 때만** 덮인다.
   * `failure`와 `state`가 서로 다른 상태이고 `menu-tree.tsx`가 둘을 독립적으로 그리기
   * 때문이다 — `state`가 `failed`가 될 때만 조기 반환이 걸려 조작 실패 문장이 함께 사라진다.
   *
   * **재진입을 막는 것은 `inFlight`(ref)이지 `busy`(state)가 아니다** — 위 선언의 실측을
   * 보라.
   *
   * **단축키가 버튼의 방벽을 벗기므로 이 가드는 잰 것이다.** 이 가드를 지우면 죽는 케이스는
   * `조작 잠금 > 같은 tick에 두 번 확정해도 요청은 한 번이다`(훅을 직접 태우는 케이스)와
   * `메뉴 트리 단축키 > busy인 동안 단축키가 걸리지 않는다`(화면을 지나는 케이스)다. 단축키는
   * 버튼의 `disabled`를 지나지 않으므로 `busy`가 서 있어도 핸들러에 닿는다.
   */
  async function run(send: () => Promise<unknown>, after?: () => void, fail?: (failure: Failure) => void): Promise<void> {
    // **장부에 이름 변경이 나가 있어도 잠긴다**(에디터를 떠났다 와 새로 선 트리도).
    if (inFlight.current || renameLocked) return
    inFlight.current = true
    setBusy(true)
    setFailure(null)
    // **다음 조작이 시작되면 앞 충돌이 풀린다** — 실패 문장과 같은 자리다. «내 글로 덮기»도 여기를 지나고, 또
    // 부딪히면 `rename`이 새 값으로 다시 세운다.
    setConflict(null)
    try {
      // **다시 받지 않을 판**이면(`NO_RELOAD` — 이름 변경의 판정용 다시 읽기가 이미 받았거나 실패했다) 여기서 끝난다.
      if ((await send()) === NO_RELOAD) return
      if (unmounted.current) return
      await load(() => !unmounted.current, true, gone.current.signal)
      if (unmounted.current) return
      after?.()
    } catch (caught) {
      if (unmounted.current) return
      const failure = toFailure(caught, UNKNOWN_COMMAND_FAILURE)
      // **실패가 설 자리를 부른 쪽이 정할 수 있다**(`fail`) — 가져오기는 상자 안이다(`importJson`).
      if (fail === undefined) setFailure(failure)
      else fail(failure)
      // **404 면 트리를 다시 받는다** — 대상이 이미 없다는 것은 이 트리가 낡았다는 신호다(남이 지웠는데 그 신호를 못 받았다 · 실시간 연결이
      // 없다). 안 받으면 지워진 줄이 남아 다음 조작도 404 다. 다시 받은 트리는 남의 변경으로 받은 것과 같게 맞춘다(`reconcile`).
      if (caught instanceof ApiError && caught.code === 'not-found') void load(() => !unmounted.current, true, gone.current.signal, true)
    } finally {
      // **잠금은 언마운트 여부와 무관하게 푼다.** `ref`는 렌더와 상관없는 값이라 여기서
      // 놓치면 그 인스턴스가 영구히 잠긴다. 표시(`setBusy`)만 마운트 여부를 본다.
      //
      // **이 줄은 케이스가 지킨다 — 지우면 잠금이 영구히 걸려 `조작 잠금` 묶음과 "여는"
      // 가드를 재는 케이스들이 함께 죽는다.** 죽는 수는 적지 않는다 — 케이스가 늘면
      // **그 수가 틀리므로** 갈래만 적는다. 잠금이지 영구 차단이 아니라는 것이 그 케이스들의 하중이다.
      inFlight.current = false
      if (!unmounted.current) setBusy(false)
    }
  }

  /**
   * 선택을 바꾼다. 메뉴를 누르면 그 메뉴가, 페이지를 누르면 `null`이 들어온다 —
   * 후자는 "주소가 말하는 것으로 되돌아간다"는 뜻이다.
   *
   * **열려 있던 입력을 함께 닫는다.** 다른 것을 고른 뒤에도 입력이 남아 있으면 그 입력이
   * 어느 항목에 붙는지가 화면에서 사라진다.
   */
  function select(next: TreeSelection | null): void {
    setPicked(next)
    setEditing(null)
    // 충돌 통지의 «이 제목»이 가리키는 것이 선택이다 — 다른 것을 고르면 무엇의 충돌인지가 화면에서 사라진다.
    setConflict(null)
    setPickingMenu(false)
    // **삭제 확인이 함께 풀린다**(확인이 풀리는 조건 중 하나) — 다른 항목에 대고 두 번째
    // 클릭이 되면 사용자가 확인한 것과 지워지는 것이 달라진다.
    setConfirmingRemove(false)
    setRemoving(null)
  }

  /**
   * 인라인 입력을 연다. 실패 문장을 함께 지운다 — 새 조작을 시작했다는 뜻이다.
   *
   * **이름 변경만 초기값을 채운다.** 바꾸려는 것을 지우고 다시 치게 하면 안 된다.
   */
  function openInput(kind: TreeEditing['kind']): void {
    // **조작이 나가 있으면 열지 않는다(`run`과 같은 잠금).** 화면에서는 툴바가 비활성이라 이 경로가
    // 없지만 훅 API로는 열리는데, 그때 친 제목은 **요청도 못 나가고 조용히 사라진다** —
    // `submitInput`이 `run`에 닿아도 `inFlight`가 서 있어 되돌아오기 때문이다(실측).
    // 입력을 비활성으로 그리는 것으로는 그것을 막지 못해 여기서 막는다.
    //
    // **키보드 단축키가 버튼을 지나지 않으므로 이 자리가 그 방벽이다.**
    if (inFlight.current || renameLocked) return
    setFailure(null)
    setConflict(null)
    // **다른 조작을 시작하면 확인이 풀린다.**
    setConfirmingRemove(false)
    setPickingMenu(false)
    typed.current = null
    setEditing({ kind, initial: kind === 'rename' ? currentTitle() : '' })
  }

  /** 선택 대상의 지금 제목. 못 찾으면 빈 문자열 — 그러면 입력이 비어 열린다. */
  function currentTitle(): string {
    if (menu === null || selection === null) return ''
    if (selection.kind === 'menu') return findMenuTitle(menu, selection.id) ?? ''
    return findPageTitle(menu, selection.id) ?? ''
  }

  /**
   * **이름을 바탕과 함께 보낸다 — 페이지도 메뉴도.** 바탕은 입력이 열릴 때의 제목이다(`editing.initial`
   * — 트리가 마지막으로 받은 값). 판정은 **설명과 같은 함수 둘**이다(`api/page-meta.ts`의 `metaConflict` · `judgeMeta`):
   *
   * | 결말 | 화면 |
   * |---|---|
   * | 200 | 트리를 다시 받는다 |
   * | 409(페이지 `page-meta-changed` · 메뉴 `menu-title-changed`) — 지금 값이 내 제목(`'mine'`) | 성공처럼 — 다시 받는다 |
   * | 409 — `'late'` · `'other'` | 충돌(`conflict`) — «지금 글로 덮기 / 앞서 보낸 글로 두기» · «내 글로 덮기 / 내 글 버리기». 다시 받는다 |
   * | 그 밖의 실패 | 실패 문장 — 다시 받지 않는다(`run`의 실패와 같다) |
   * | **10초 안에 응답이 없다** | 트리를 **다시 읽어** 판정한다 — `'mine'` 성공 · `'base'` «바뀌지 않았습니다» · 그 밖은 충돌. 다시 읽은 트리를 그대로 세운다 |
   * | 다시 읽기도 실패 | «모름» + «다시 확인»(`renameLock` — 그동안 트리 조작 전부가 잠긴다) |
   *
   * **쓰기 장부를 그대로 탄다**(`panels/write-ledger.tsx` — 시간 제한 · «모름» · `settle` → `WriteConclusion` · 떠나 있는 동안
   * 끝난 실패). **판정의 말은 장부의 `deliver`로 보낸다** — 실패 문장 · 충돌 · 다시 읽은 트리 · 매달린 값이 이 인스턴스가
   * 아니라 **지금 떠 있는 이 프로젝트의 트리**(위 `receiver`)에 닿는다. 에디터를 떠났다 돌아와 새 트리가 떠 있는 채 판정이 끝나도,
   * 새 트리에서 «다시 확인»을 눌러도 그 트리가 말한다. 뒤의 다시 받기도 같은 길로 간다(`reload`).
   *
   * **받을 트리가 아예 없으면**(프로젝트 목록 · 테마 편집기 · 다른 프로젝트에 가 있는 채 끝났다) 장부가 결말을 남기고 돌아온 트리가
   * «이 화면을 떠나 있는 동안 …»으로 말한다 — **판정으로 끝난 결말도**(`panels/write-ledger.tsx`의 «판정으로 끝난 쓰기도
   * 전한다» — 실패만 남기면 목록에 가 있는 동안 `'base'` · `'other'`로 끝난 이름 변경을 돌아온 트리가 한마디도 하지 않는다).
   * 충돌 화면과 매달린 값은 다시 세우지 않는다(같은 절의 판정).
   */
  async function rename(target: TreeSelection, title: string, base: string): Promise<unknown> {
    const key = `${target.kind}:${target.id}`
    const pending = hanging.current.get(key) ?? []
    const code = target.kind === 'menu' ? MENU_TITLE_CHANGED : PAGE_META_CHANGED
    // **이 렌더의 받는 자리 · 세대로 부친다** — 받는 것은 그때 떠 있는 트리다(`Ledger.deliver`).
    const from = receiver
    const at = { projectId, pageId: undefined, epoch }
    const put = (slot: object, update: unknown): void => ledger.deliver(from, at, slot, update)
    const hang = (titles: string[] | null): void => put(TREE_HANGING, { item: key, titles } satisfies HangingUpdate)
    let reload = true

    /** 서버 제목 하나를 판정한다 — 409 의 지금 값과 다시 읽은 값이 같은 길을 지난다(설명의 `land`와 같은 모양). */
    function land(current: string, asked: 'verified' | 'rejected'): WriteConclusion {
      const verdict = judgeMeta(current, title, base, pending)
      if (verdict === 'mine') {
        hang(null)
        return null
      }
      if (verdict === 'base' && asked === 'verified') {
        // 끊긴 요청이 늦게 커밋될 수 있다 — 보낸 제목을 매달린 값으로 든다.
        hang([...pending, title])
        const failure: Failure = { kind: 'message', message: RENAME_NOT_SAVED }
        put(TREE_FAILURE, failure)
        return failure
      }
      const late = verdict === 'late'
      put(TREE_CONFLICT, { target, mine: title, theirs: current, late } satisfies TitleConflict)
      return { kind: 'message', message: metaConflictSentence('제목', current, late) }
    }

    await renameLock.run<unknown, { at: number; menu: TreeMenuNode[]; rev: number }>({
      send: (signal) =>
        target.kind === 'menu'
          ? api.updateMenu(projectId, target.id, { title, base: { title: base } }, { signal })
          : api.updatePage(projectId, target.id, { title, base: { title: base } }, { signal }),
      // **다시 읽는 것은 트리 하나다** — 메뉴도 페이지도 그 안에 제목이 있다. 받은 트리는 판정 뒤에 그대로 세운다.
      // 번호는 **보낼 때** 받는다(`issueTreeRead`) — 판정 뒤에 세우는 트리도 «늦게 낸 조회의 답만» 규칙을 지난다.
      verify: async (signal) => {
        const at = issueTreeRead()
        return { at, ...(await api.readTree(projectId, { signal })) }
      },
      settle: (outcome) => {
        if (outcome.kind === 'done') {
          hang(null)
          return null
        }
        if (outcome.kind === 'failed') {
          const clash = metaConflict(outcome.caught, 'title', code)
          // 제목은 `null`이 아니다(서버의 `Title`) — 계약 밖 `null`이 오면 빈 제목으로 보인다.
          if (clash !== null) return land(clash.current ?? '', 'rejected')
          reload = false
          const failure = toFailure(outcome.caught, UNKNOWN_COMMAND_FAILURE)
          put(TREE_FAILURE, failure)
          return failure
        }
        reload = false
        const { at: readAt, menu: read, rev } = outcome.verdict
        put(TREE_STATE, { at: readAt, rev, state: { status: 'ready', menu: read } } satisfies TreeStateUpdate)
        const current = target.kind === 'menu' ? findMenuTitle(read, target.id) : findPageTitle(read, target.id)
        if (current === null) {
          const failure: Failure = { kind: 'message', message: RENAME_GONE }
          put(TREE_FAILURE, failure)
          return failure
        }
        return land(current, 'verified')
      },
    })
    // **다시 받기도 떠 있는 트리로 보낸다**(`run`의 `load`는 이 인스턴스에만 쓴다 — 내려가 있으면 새 트리는 커밋 전에 읽은 제목에
    // 머문다). 실패의 모양은 `load`와 같다.
    if (reload) {
      const at = issueTreeRead()
      try {
        const read = await api.readTree(projectId)
        put(TREE_STATE, { at, rev: read.rev, state: { status: 'ready', menu: read.menu } } satisfies TreeStateUpdate)
      } catch (caught) {
        put(TREE_STATE, { at, state: { status: 'failed', failure: toFailure(caught, UNKNOWN_FAILURE) } } satisfies TreeStateUpdate)
      }
    }
    return NO_RELOAD
  }

  /**
   * 입력을 확정한다. **빈 문자열이면 아무것도 하지 않고 입력을 열어 둔다** — 서버의
   * `Title`이 `z.string().min(1)`이라 400이 되는데 그 왕복을 만들지 않는다. 닫지 않는 것은
   * 닫으면 사용자가 무엇이 잘못됐는지 모른 채 입력을 잃기 때문이다.
   *
   * **제목 중복을 검사하지 않는다.** 서버에 유일성 제약이 없다 — 같은 제목의 메뉴를 형제로도
   * 자식으로도 만들 수 있다(`tree/tree-actions.ts`의 `flattenMenus` 주석).
   *
   * **값이 바뀌었는지도 비교하지 않는다.** 서버는 제목을 **정규화하지 않는다** — api 하네스로
   * `' 회원관리'`·`'회원관리 '`·`'  회원  관리  '`·`'\t회원관리\n'`을 `PATCH`로
   * 보내면 넷 다 200이고 **받은 값이 보낸 값과 글자까지 같다**(페이지도 같다). 그러므로
   * `' 회원관리'`와 `'회원관리'`는 서버에서 다른 값이고, 클라이언트가 "같으니 보내지 않는다"로
   * 막으면 **사용자가 그 공백을 지울 방법이 없어진다.**
   *
   * (부수 관찰: `'   '`처럼 공백만인 제목도 200이다 — `z.string().min(1)`이 길이만 본다.
   * 여기서 막지 않는 것은 화면이 막기로 한 것이 빈 문자열 하나이기 때문이고, 그 밖의 정책을
   * 화면이 새로 만들지 않는다.)
   */
  function submitInput(title: string): void {
    if (editing === null) return
    if (title === '') return

    const kind = editing.kind

    // **최상위 메뉴는 선택을 보지 않는다 — 여기가 이 갈래의 전부다.** 아래 셋과 갈리는
    // 자리가 그것이고, 그래서 선택 가드보다 **위**에 선다.
    //
    // **이 갈래가 없으면 빈 트리가 막다른 길이다.** 메뉴 노드가 0개인 새 프로젝트
    // (`apps/api/src/repos/projects.ts`의 `insertProject`는 프로젝트·멤버·기본 레이아웃만
    // 만든다)에서는 고를 메뉴가 없어 `treeAbilities`가 아홉을 전부 끄고, 페이지는
    // `menuNodeId`가 필수라 페이지도 만들 수 없다. 서버는 루트를 받는다
    // (`apps/api/src/routes/menu.ts`의
    // `parentId: z.uuid().nullable().optional()` · `body.parentId ?? null`) —
    // `api/http-client.ts`의 `createMenu`도 *"`parentId`는 `null`이어도 그대로 싣는다"*를
    // 적고 있다.
    //
    // **`title === ''` 가드보다는 아래다** — 빈 제목은 이 갈래에서도 나가지 않는다.
    if (kind === 'new-root-menu') {
      setEditing(null)
      void run(async () => {
        await api.createMenu(projectId, { parentId: null, title })
      })
      return
    }

    // 나머지 셋은 고른 것에 붙는다.
    if (selection === null) return
    setEditing(null)

    if (kind === 'rename') {
      // **메뉴와 페이지가 다른 엔드포인트다** — 선택의 `kind`가 가른다(`rename`). **둘 다 바탕을 싣는다.**
      const base = editing.initial
      const target = selection
      void run(() => rename(target, title, base))
      return
    }

    // 새로 만들기는 **메뉴를 고른 상태에서만** 열린다(`treeAbilities`의 판정) — 여기 오는 선택은 메뉴다.
    if (selection.kind !== 'menu') return
    const parentId = selection.id

    if (kind === 'new-menu') {
      void run(async () => {
        await api.createMenu(projectId, { parentId, title })
      })
      return
    }

    // **만든 페이지로 이동한다.** 응답의 `id`가 주소에 들어간다 — 빈 문자열은
    // `SHAPES.pageDetail`이 막으므로 여기서 다시 보지 않는다.
    let created: string | null = null
    void run(
      async () => {
        const page = await api.createPage(projectId, { menuNodeId: parentId, title })
        created = page.id
      },
      () => {
        if (created !== null) navigate(`/projects/${projectId}/pages/${created}`)
      },
    )
  }

  /**
   * **가져오기 상자를 연다**(`panels/page-import-dialog.tsx`). 고른 메뉴가 대상이다 — 메뉴 줄 `+`의 «JSON 에서 가져오기…»가 열면서
   * 그 줄을 고른다(`panels/menu-tree.tsx`의 `pick`).
   *
   * **`abilities.addPage`를 지난다.** 가져오기는 **페이지를 만드는 것**이므로 판정이 `페이지 추가`와 같다. 판정을 여기서 새로 짜면
   * 그 표가 두 벌이 된다(판정은 `treeAbilities` 한 곳이 한다). 판정은 **여는 순간에만** 본다 — 열린 뒤 남이 그 메뉴를 지워도 보내기를
   * 막지 않고 서버의 거절을 상자 안에 보인다(`importFailure`). 막으면 단추가 까닭 없이 꺼진다.
   *
   * **«여는» 조작이라 같은 가드를 지난다**(`openInput` · `openReparent` · `askRemove`) — 조작이 나가 있으면 열지 않고, 열면서 앞 실패 ·
   * 입력 · 확인을 걷는다(한 번에 하나만 진행한다).
   */
  function openImport(): void {
    if (inFlight.current || renameLocked) return
    if (selection === null || selection.kind !== 'menu' || !abilities.addPage || menu === null) return
    const target: ImportTarget = { menuId: selection.id, title: findMenuTitle(menu, selection.id) ?? '' }
    setFailure(null)
    setConflict(null)
    setEditing(null)
    setConfirmingRemove(false)
    setPickingMenu(false)
    setImportFailure(null)
    importOpen.current = target
    setImporting(target)
  }

  function closeImport(): void {
    importOpen.current = null
    setImporting(null)
    setImportFailure(null)
  }

  /**
   * **파일 한 벌로 페이지를 만든다**(「페이지 JSON」).
   *
   * **`submitInput`의 `new-page` 갈래와 같은 모양이다** — `run`을 지나므로 잠금·재조회·
   * 이동이 그대로 따라온다. 그 셋을 여기서 다시 짜지 않는 것이 요점이다: 가져오기가 자기
   * 잠금을 가지면 트리 조작과 겹쳐 나가고, 재조회를 빠뜨리면 만든 페이지가 트리에
   * 안 보인다.
   *
   * **대상은 상자를 연 순간의 메뉴다**(`importing`) — 지금의 선택이 아니다. 상자가 없으면 아무것도 안 한다.
   *
   * **실패의 자리는 하나다**(`importFailure`의 머리말) — 보낸 상자가 아직 열려 있으면 상자 안, 닫았으면 트리의 실패 줄.
   * 성공하면 결과를 하단 바의 통지로 남기고(`onImported`), 보낸 상자가 아직 열려 있으면 닫고 만든 페이지로 옮긴다. **닫은 상자의 성공은
   * 옮기지 않는다** — 닫은 사람은 그 일에서 손을 뗐다. 답이 온 순간 다른 페이지로 데려가면 그동안 하던 일에서 끌려 나간다.
   *
   * **봉투를 여기서 읽지 않는다.** 화면이 미리보기를 그리느라 이미 읽었고(`parsePageJson`),
   * 여기서 다시 읽으면 같은 판정이 두 자리가 된다. 서버도 같은 함수를 쓴다.
   */
  function importJson(file: unknown, title?: string): void {
    const target = importOpen.current
    if (target === null) return
    const menuNodeId = target.menuId

    props.onImported?.(null)
    setImportFailure(null)
    let result: PageImported | null = null
    void run(
      async () => {
        result = await api.importPage(projectId, {
          menuNodeId,
          file,
          // **없으면 키를 만들지 않는다** — 서버가 `title`을 파일의 제목으로 대신한다.
          ...(title !== undefined && title !== '' ? { title } : {}),
        })
      },
      () => {
        if (result === null) return
        props.onImported?.(result)
        // **닫은 상자의 성공은 옮기지 않는다**(위 머리말) — 결과는 하단 바에 섰다.
        if (importOpen.current !== target) return
        closeImport()
        // **만든 페이지로 이동한다** — `submitInput`의 `new-page`와 같다. 빈 문자열 id는
        // `SHAPES.pageImported`가 이미 막았다.
        navigate(`/projects/${projectId}/pages/${result.page.id}`)
      },
      (failure) => {
        if (importOpen.current === target) setImportFailure(failure)
        else setFailure(failure)
      },
    )
  }

  /**
   * 형제 사이에서 한 칸 옮긴다. `delta`가 `-1`이면 위로, `+1`이면 아래로다.
   *
   * **목적지가 `index + delta`이고 방향 보정이 없는 것은 서버가 결과 배열 기준이기
   * 때문이다 — 잰 값이다**(api 하네스로 `PATCH`를 보내 잰다):
   *
   * ```
   * 메뉴   [A:0 B:1 C:2] 에 PATCH {sortOrder: 2} (A)  →  [B:0 C:1 A:2]   결과 기준
   * 페이지 [A:0 B:1 C:2] 에 PATCH {sortOrder: 2} (A)  →  [B:0 C:1 A:2]   같다
   * 메뉴   [A:0 B:1 C:2] 에 PATCH {sortOrder: 0} (B)  →  [B:0 A:1 C:2]   반대 방향도 맞는다
   * ```
   *
   * **메뉴와 페이지를 각각 잰다** — 서로 다른 저장소 함수를 지나므로(`repos/menu.ts` vs
   * `repos/pages.ts`) 한쪽만 재고 양쪽에 쓸 수 없다. 값은 같다.
   *
   * **`treeSpot.index`를 쓰지 `node.sortOrder`를 쓰지 않는다.** 그 인덱스는 `sortOrder`
   * 오름차순으로 정렬한 뒤의 자리이고, 서버가 0부터 연속으로 재번호한다는 것은
   * **서버의 불변식이지 이 화면이 지킬 수 있는 것이 아니다.**
   * `sortOrder가 0부터 연속이 아닌 트리에서도 목적지가 맞는다`가 그것을 못박는다.
   *
   * **페이지는 `sortOrder` 하나만 싣는다** — `menuNodeId`가 섞여 나가면 사용자가 옮기지
   * 않은 소속까지 덮어쓴다(서버가 그 키를 받으므로 실수가 조용히 통과한다).
   *
   * **선택은 손대지 않는다.** id가 바뀌지 않으므로 저절로 따라간다 — 옮긴 뒤 다시 골라야
   * 하면 연속으로 두 칸 옮길 수 없다.
   */
  function move(delta: -1 | 1): void {
    if (menu === null || selection === null) return
    const spot = treeSpot(menu, selection)
    if (spot === null) return

    const target = selection.id
    const sortOrder = spot.index + delta
    // **범위 밖이면 되돌아온다.** `indent`·`outdent`가 목적지가 없을 때 그렇게 하는 것과
    // 같다 — 이 가드가 없으면 판정을 벗기고 첫째에서 `move(-1)`을 부를 때
    // `sortOrder: -1`이 나가고 서버가 400을 낸다(`SortOrder`가 `z.int().min(0)`이다).
    //
    // 화면·단축키는 둘 다 `treeAbilities.moveUp`/`moveDown`을 지나므로 이 자리에
    // 닿지 않는다. 남기는 것은 그것이 벗겨졌을 때의 방벽이고, 훅을 직접 태우는 케이스가
    // 그것을 지킨다(`조작 잠금`의 형태와 같다).
    if (sortOrder < 0 || sortOrder >= spot.siblingCount) return
    void run(async () => {
      if (selection.kind === 'menu') await api.updateMenu(projectId, target, { sortOrder })
      else await api.updatePage(projectId, target, { sortOrder })
    })
  }

  /**
   * 한 단계 안으로 — **앞 형제 메뉴의 마지막 자식**이 된다.
   *
   * **`sortOrder`를 주지 않는다 — 잰 값이다**(api 하네스로 잰다): `PATCH {parentId}`만 주면
   * **새 부모의 맨 뒤**로 간다.
   *
   * ```
   * M1(자식1:0 자식2:1) 에 M2를 PATCH {parentId: M1}  →  자식1:0 자식2:1 M2:2
   * ```
   *
   * 들여쓰기의 정의가 *"앞 형제의 **마지막** 자식"*(구조 트리의 들여쓰기와 같은 정의)이므로 그
   * 기본 동작이 곧 목적지다 — 자리를 지목할 필요가 없다.
   *
   * **`previousMenuSibling`이 `null`이면 되돌아온다 — 그 가드를 지워도 죽는 케이스가 없다**
   * (단축키가 붙어 있어도 그렇다). 덮는 것은 `treeAbilities.indent`
   * 이고, 그것이 버튼의 `disabled`와 **단축키의 판정 통과 둘 다**에 걸린다 — 단축키도
   * `if (!abilities[…]) return`을 지나기 때문이다(`panels/menu-tree.tsx`).
   * **구조 트리의 같은 자리도 같은 이유로 죽는 케이스가 없다.**
   *
   * **잠금 가드와 갈린 자리다.** 그쪽은 단축키가 `disabled`를 우회하므로 하중이 있는데
   * (`run`의 머리말), 판정은 단축키도 지나므로 우회로가 없다.
   *
   * 남기는 것은 그것이 벗겨졌을 때의 `TypeError` 방벽이기 때문이다 — `previous.id`를 읽는
   * 순간 던지고, 이 트리에는 오류 경계가 없다. **닫는 케이스는 만들지 못했다:** 판정을
   * 지나지 않고 이 함수에 닿는 경로가 화면에도 단축키에도 없다.
   */
  function indent(): void {
    if (menu === null || selection === null || selection.kind !== 'menu') return
    const previous = previousMenuSibling(menu, selection.id)
    if (previous === null) return

    const target = selection.id
    void run(async () => {
      await api.updateMenu(projectId, target, { parentId: previous.id })
    })
  }

  /**
   * 한 단계 밖으로 — **부모의 다음 형제**가 된다.
   *
   * **여기는 `sortOrder`를 함께 준다.** `parentId`만 주면 맨 뒤로 가는데(위 실측) 내어쓰기는
   * 자리를 지목해야 하기 때문이다. **둘을 함께 주면 그 값이 새 부모의 형제 배열 기준으로
   * 삽입된다 — 그것도 잰 값이다:**
   *
   * ```
   * M1(자식1:0 자식2:1) 에 M3을 PATCH {parentId: M1, sortOrder: 1}  →  자식1:0 M3:1 자식2:2
   * ```
   *
   * **`menuOutdentTarget`이 조부모 id와 부모의 자리를 준다.** `index + 1`을 여기서 만드는
   * 것은 그 함수가 자리만 알려 주고 `sortOrder`를 만들지 않기로 했기 때문이다.
   *
   * **역방향이 항등이 아니다** — 내어썼다가 들여쓰면 제자리가 아니다(들여쓰기가 언제나
   * 마지막 자식으로 가므로). 구조 트리도 같은 성질이고, 여기서도 케이스가 그것을
   * 못박는다.
   */
  function outdent(): void {
    if (menu === null || selection === null || selection.kind !== 'menu') return
    const destination = menuOutdentTarget(menu, selection.id)
    if (destination === null) return

    const target = selection.id
    void run(async () => {
      await api.updateMenu(projectId, target, {
        parentId: destination.parentId,
        sortOrder: destination.index + 1,
      })
    })
  }

  /**
   * 소속 메뉴 목록을 연다. **지금 소속을 목록에서 뺀다** — 고를 이유가 없다.
   *
   * 목록은 `flattenMenus`가 만든다(손목록을 두지 않는다). 지금 소속은 `treeSpot`이 준
   * `parentId`이고, 페이지의 그 값은 소속 메뉴 id다.
   */
  const reparenting: { id: string; path: string }[] | null = (() => {
    if (!pickingMenu || menu === null || selection === null || selection.kind !== 'page') return null
    const owner = treeSpot(menu, selection)?.parentId ?? null
    return flattenMenus(menu).filter((option) => option.id !== owner)
  })()

  /**
   * 고른 메뉴로 페이지를 옮긴다.
   *
   * **`sortOrder`를 주지 않는다 — 잰 값이다**(api 하네스로 잰다):
   *
   * ```
   * TO(T1:0 T2:1) 에 PATCH {menuNodeId: TO}               →  T1:0 T2:1 옮길것:2   (맨 뒤)
   * TO(T1:0 T2:1) 에 PATCH {menuNodeId: TO, sortOrder: 1} →  T1:0 옮길것:1 T2:2   (그 자리)
   * ```
   *
   * 옮기는 사람이 자리를 지목하지 않았으므로 맨 뒤가 맞다 — 지목하고 싶으면 옮긴 뒤
   * 위/아래로 옮기면 된다.
   *
   * **선택을 옮기지 않는다.** id 가 바뀌지 않으므로 선택이 저절로 따라간다 — 주소로 고른 페이지는 열린 채, 줄의 `…`로 고른
   * 페이지는 고른 채 남는다.
   */
  function reparentTo(menuId: string): void {
    if (selection === null || selection.kind !== 'page') return
    const target = selection.id
    setPickingMenu(false)
    void run(async () => {
      await api.updatePage(projectId, target, { menuNodeId: menuId })
    })
  }

  /**
   * 끌어 놓은 자리로 옮긴다 — **지금 «위로 · 들여쓰기 · 옮기기»가 보내는 것과 같은 요청이다**(spec 「드래그로 옮기기」 — 드래그만의
   * 새 편집 종류를 만들지 않는다). 잠금 · 다시 받기 · 실패 문장은 `run` 의 길이다.
   *
   * **부모가 같으면 `sortOrder` 하나만 싣는다** — `move` 와 같은 까닭(페이지에 `menuNodeId` 가 섞여 나가면 옮기지 않은 소속까지
   * 덮는다). 부모가 바뀌면 둘을 함께 싣는다 — 부모만 주면 맨 뒤로 간다(`reparentTo` 머리말의 실측). 싣는 `sortOrder` 는 «옮긴 뒤 그
   * 부모 안 차례»다 — 서버가 두 판에서 그 값을 같은 뜻으로 읽는다(`apps/api/test/tree-drop-order.test.ts`).
   *
   * **부모가 같은지는 보낼 때의 트리로 다시 본다** — 끄는 동안 트리를 다시 받았을 수 있다. 끈 것이 트리에서 사라졌으면 되돌아온다.
   */
  function dropTo(dragged: TreeSelection, target: MenuDrop): void {
    if (menu === null) return
    const spot = treeSpot(menu, dragged)
    if (spot === null) return
    const sortOrder = target.index
    const reparent = spot.parentId !== target.parentId
    void run(async () => {
      if (dragged.kind === 'menu') {
        await api.updateMenu(projectId, dragged.id, reparent ? { parentId: target.parentId, sortOrder } : { sortOrder })
        return
      }
      // 페이지의 부모는 늘 메뉴다(`menuDropTarget` 이 `null` 부모를 페이지에 안 준다).
      if (reparent && target.parentId !== null) {
        await api.updatePage(projectId, dragged.id, { menuNodeId: target.parentId, sortOrder })
        return
      }
      await api.updatePage(projectId, dragged.id, { sortOrder })
    })
  }

  /**
   * 삭제를 실행한다(두 번 누르기의 두 번째 클릭).
   *
   * **지우기 전에 자리를 먼저 읽는다** — 지운 뒤에는 그 노드가 트리에 없어 `treeSpot`이
   * `null`이고 부모를 알 길이 없다. `useStructureCommands`의 `removeSelected`가 같은 형태다.
   *
   * **메뉴를 지우면 선택이 부모로 간다.** 지운 것을 계속 가리키면 툴바가 사라진 항목에
   * 작동하는 상태가 되고, `treeAbilities`가 전부 `false`를 내므로 사용자는 아무것도 못 하는
   * 채로 자기 위치를 잃는다. 루트 메뉴였으면 갈 부모가 없어 `null`이다.
   *
   * **열려 있던 페이지를 지우면 프로젝트 루트로 `replace` 이동한다.** `replace`인 것은 뒤로
   * 가기가 지워진 페이지로 돌아가면 404를 만나기 때문이다. 열려 있지 않은 페이지(줄의 `…`로 고른 것)를 지우면 주소를 두고
   * 선택만 주소의 페이지로 돌린다 — 아래 `deletePage` 갈래의 주석.
   */
  function confirmRemove(): void {
    if (menu === null || selection === null) return
    // 자리를 **지금** 읽는다. `run`은 비동기라 그 안에서는 이미 늦다.
    const spot = treeSpot(menu, selection)
    setConfirmingRemove(false)

    if (selection.kind === 'menu') {
      const parentId = spot?.parentId ?? null
      const target = selection.id
      void run(
        () => api.deleteMenu(projectId, target),
        () => setPicked(parentId === null ? null : { kind: 'menu', id: parentId }),
      )
      return
    }

    // **열려 있던 페이지를 지웠을 때만 프로젝트 루트로 간다.** 페이지 선택은 두 길로 온다 — 주소(열린 페이지 · `picked === null`)와
    // 줄의 `+` · `…`(`panels/tree-row-actions.tsx` — 누르면 그 줄을 `select({kind:'page'})`로 고른다). 뒤 길로 고른 페이지는 열려 있지
    // 않을 수 있고, 그것을 지우고 주소를 루트로 옮기면 **보고 있던 페이지가 닫힌다.** 그래서 지운 것이 주소의 페이지인지로 가른다.
    const target = selection.id
    const wasOpen = pageId === target
    ownRemoval.current.add(target)
    void run(
      () => api.deletePage(projectId, target),
      () => {
        setPicked(null)
        if (wasOpen) navigate(`/projects/${projectId}`, { replace: true })
      },
      (failure) => {
        // 못 지웠다 — 그 페이지가 트리에서 빠지면(남이 먼저 지웠다 · 404) 내 지움이 아니다.
        ownRemoval.current.delete(target)
        setFailure(failure)
      },
    )
  }

  /**
   * 연쇄 삭제를 보낸다(상자의 «삭제»). **싣는 id 는 상자가 그리는 목록 그대로다**(`cascadeShown`).
   *
   * **열린 페이지가 지운 서브트리 안이면 프로젝트 루트로 `replace` 이동한다** — 페이지 삭제(`confirmRemove`)와 같은 까닭(뒤로 가기가
   * 지운 페이지로 돌아가면 404 다). 선택은 지운 메뉴의 부모로 간다(메뉴 삭제와 같다).
   *
   * **서버가 «목록이 바뀌었다»로 돌려보내면 그 409 가 실은 지금 목록으로 상자를 다시 연다**(`changed` · `listed`) — 사람이 그 목록을
   * 보고 다시 누른다. 트리도 다시 받는다(트리가 낡았다는 신호다). 목록의 꼴이 틀리면 다시 받은 트리로 센다. 그 밖의 실패는 트리의 실패
   * 줄로 간다(상자는 닫힌 채다).
   */
  function confirmCascade(): void {
    if (removing === null || menu === null) return
    const subtree = cascadeShown(removing, menu)
    if (subtree === null) return
    const target = removing.menuId
    const parentId = treeSpot(menu, { kind: 'menu', id: target })?.parentId ?? null
    const wasOpen = pageId !== undefined && subtree.pages.some((page) => page.id === pageId)
    for (const page of subtree.pages) ownRemoval.current.add(page.id)
    setRemoving(null)
    // `run`의 실패 갈래는 `Failure`(문장)만 받는다 — 목록이 바뀐 409 인지는 보낸 자리에서 가른다.
    let changed = false
    let listed: MenuSubtree | null = null
    void run(
      async () => {
        try {
          return await api.deleteMenuCascade(projectId, target, {
            menuIds: subtree.menus.map((entry) => entry.id),
            pageIds: subtree.pages.map((page) => page.id),
          })
        } catch (caught) {
          const issue = caught instanceof ApiError ? caught.issues.find((each) => each.code === MENU_SUBTREE_CHANGED) : undefined
          changed = issue !== undefined
          listed = issue === undefined ? null : readSubtreeListing(issue.subtree)
          throw caught
        }
      },
      () => {
        setPicked(parentId === null ? null : { kind: 'menu', id: parentId })
        if (wasOpen) navigate(`/projects/${projectId}`, { replace: true })
      },
      (failure) => {
        for (const page of subtree.pages) ownRemoval.current.delete(page.id)
        if (!changed) {
          setFailure(failure)
          return
        }
        setRemoving({ menuId: target, changed: true, listed })
        void load(() => !unmounted.current, true, gone.current.signal)
      },
    )
  }

  /**
   * **남의 변경으로 받은 트리에 열린 것을 맞춘다**(`load`의 `remote` 갈래가 부른다 — 트리를 세우기 직전). 대상이 사라진 것은 닫고, 연쇄 삭제
   * 상자는 목록이 바뀌었으면 새 목록으로 다시 세운다.
   *
   * | 열린 것 | 대상이 사라졌다 | 대상이 남았다 |
   * |---|---|---|
   * | 이름 입력 · 새 메뉴 · 새 페이지(고른 줄에 붙는 셋) | 닫는다 — 친 글이 있었으면 하단 바 `TREE_DRAFT_DROPPED` | 그대로(옮겨졌으면 새 자리에 친 글째 선다 — `inputValue` · 접힌 메뉴 안이면 `panels/menu-tree.tsx`의 `chains`가 편다) |
   * | 고른 줄(`picked`) · 두 번 누르기 확인 · 소속 메뉴 목록 | 고름을 풀고(주소의 페이지로 돌아간다) 둘을 닫는다 | 그대로 |
   * | 제목 충돌 통지 | 걷는다 — 무엇의 충돌인지가 화면에서 사라졌다 | 그대로 |
   * | 연쇄 삭제 상자 | 닫는다 — 하단 바 `cascadeClosedNotice` | 보인 id 집합과 새 서브트리가 다르면 새 목록으로 다시 세우고 «목록이 바뀌었습니다»(409 와 같은 길) |
   *
   * **열린 페이지가 사라진 것은 여기서 안 본다** — 아래 `onPageGone`의 이펙트가 트리마다 본다. 줄의 행동 메뉴는 그 줄이 트리에서 빠지며 함께
   * 내려간다. 가져오기 상자는 연 순간의 메뉴 id 로 보내고 서버의 거절을 상자 안에 보인다(`importing` 머리말) — 여기서 안 닫는다.
   *
   * **내 조작 뒤의 다시 받기는 안 탄다** — 그 조작이 스스로 맞춘다(지운 메뉴의 부모로 고름 · 지운 페이지면 프로젝트 뿌리로).
   */
  function reconcile(next: TreeMenuNode[]): void {
    const has = (target: TreeSelection): boolean => treeSpot(next, target) !== null
    const told: string[] = []
    if (selection !== null && !has(selection)) {
      if (editing !== null && editing.kind !== 'new-root-menu') {
        if (typed.current !== null && typed.current !== editing.initial) told.push(TREE_DRAFT_DROPPED)
        typed.current = null
        setEditing(null)
      }
      setConfirmingRemove(false)
      setPickingMenu(false)
      if (picked !== null) setPicked(null)
    }
    if (conflict !== null && !has(conflict.target)) setConflict(null)
    if (removing !== null) {
      const shown = cascadeShown(removing, menu)
      const now = menuSubtree(next, removing.menuId)
      if (now === null) {
        setRemoving(null)
        told.push(cascadeClosedNotice(shown?.title ?? findMenuTitle(menu ?? [], removing.menuId) ?? ''))
      } else if (shown === null || !sameIds(shown, now)) {
        setRemoving({ menuId: removing.menuId, changed: true, listed: now })
      }
    }
    const last = told.at(-1)
    if (last !== undefined) props.onDropped?.(last)
  }
  reconcileRef.current = reconcile

  return {
    state,
    selection,
    select,
    abilities,
    busy: busy || renameLocked,
    failure,
    editing,
    openInput,
    submitInput,
    cancelInput: () => setEditing(null),
    typeInput: (value) => {
      typed.current = value
    },
    inputValue: () => typed.current ?? editing?.initial ?? '',
    confirmingRemove,
    removing,
    confirmCascade,
    closeRemoving: () => setRemoving(null),
    askRemove: () => {
      // **조작이 나가 있으면 확인도 걸지 않는다(`run`과 같은 잠금).** 이 가드가 없으면
      // `busy` 중 `Delete`가 확인을 걸 때 그 확인이 **잠금이 풀린 뒤까지 살아남아**
      // 클릭 한 번에 삭제가 나간다(실측). 삭제의 두 번 누르기가 사실상 한 번이 되고 undo가 없다.
      //
      // **"여는" 셋이 같은 가드를 갖는다** — `openInput`·`openReparent`·여기. `cancel*`은
      // 반대로 **닫는** 것이라 잠금 중에도 열어 둔다: 취소를 막을 이유가 없다.
      if (inFlight.current || renameLocked) return
      // 확인을 걸면서 열려 있던 입력과 앞 실패를 함께 지운다 — 한 번에 하나만 진행한다.
      setFailure(null)
      setEditing(null)
      // **하위가 있는 메뉴는 상자로 묻는다** — 무엇이 함께 지워지는지(수 · 페이지 이름)를 보여야 하고, 두 번 누르기로는 그것을 말할
      // 자리가 없다. 하위가 없으면 지금의 두 번 누르기 그대로다.
      const subtree = selection?.kind === 'menu' ? menuSubtree(menu, selection.id) : null
      if (selection?.kind === 'menu' && subtree !== null && (subtree.menus.length > 0 || subtree.pages.length > 0)) {
        setConfirmingRemove(false)
        setRemoving({ menuId: selection.id, changed: false, listed: null })
        return
      }
      setConfirmingRemove(true)
    },
    confirmRemove,
    cancelRemove: () => setConfirmingRemove(false),
    move,
    indent,
    outdent,
    conflict,
    overwriteTitle: () => {
      if (conflict === null) return
      // **바탕을 옮기면 매달린 값을 버린다**(설명의 `submit`과 같다) — 덮기의 바탕이 보인 그 값이라, 늦은 내 제목이었으면
      // 이제 바탕이다.
      hanging.current.delete(`${conflict.target.kind}:${conflict.target.id}`)
      void run(() => rename(conflict.target, conflict.mine, conflict.theirs))
    },
    discardTitle: () => setConflict(null),
    renameLock,
    renameNotices: { checking: RENAME_CHECKING, unknown: RENAME_UNKNOWN, missedLead: RENAME_MISSED },
    reparenting,
    openReparent: () => {
      if (inFlight.current || renameLocked) return
      setFailure(null)
      setEditing(null)
      setConfirmingRemove(false)
      setPickingMenu(true)
    },
    reparentTo,
    cancelReparent: () => setPickingMenu(false),
    dropTo,
    importing,
    openImport,
    closeImport,
    importJson,
    importFailure,
  }
}

/**
 * 메뉴 제목 하나. **`tree-actions.ts`의 `byOrder` 관문을 지나지 않는다** — 그 파일이 세운
 * "던지지 않는다" 계약 밖에서 배열을 직접 돈다.
 *
 * **그런데도 안전한 근거는 둘이고, 둘 다 잰 것이다.** *"표시용이기 때문에 그 계약이
 * 필요한 자리가 아니다"*는 근거가 아니다 — 계약이 필요한지를 정하는 것은
 * "표시용인가"가 아니라 **"렌더에서 나쁜 값에 닿는가"**다.
 *
 * 1. **관문이 세 배열을 이미 보장한다.** `SHAPES.treeEnvelope`가 `isTreeMenuNode`로 재귀
 *    검사하며 `pages`·`children`이 배열인지까지 본다. **`tree-actions.ts`가
 *    일부러 기대지 않기로 한 바로 그 보장이다** — 그쪽은 관문과 다른 커밋에서 바뀔 수 있어
 *    스스로 닫았고, 여기는 그 보장 위에 선다.
 * 2. **여기는 렌더가 아니라 이벤트 핸들러다.** `currentTitle()`은 `openInput`에서만 불리고
 *    그것은 버튼 클릭이다. 실측: 핸들러에서 던지면 `.wb-shell`이 **살아 있고** 예외가 밖으로
 *    새지도 않는다. 대조로 렌더에서 던지면 그 렌더가 통째로 실패한다.
 *
 * **던지는 입력은 찾지 못했다.** 관문을 지나는 깨진 모양 둘(중복 `id`, `pages` 원소가
 * `children`을 갖는 것)로 이름 변경을 열어 보니 둘 다 던지지 않았고 셸도 살아 있었다
 * (중복 `id`에서는 첫 일치의 제목이 초기값이 된다 — 그 값이 틀릴 수는 있어도 던지지 않는다).
 */
function findMenuTitle(nodes: TreeMenuNode[], menuId: string): string | null {
  for (const node of nodes) {
    if (node.id === menuId) return node.title
    const found = findMenuTitle(node.children, menuId)
    if (found !== null) return found
  }
  return null
}

function findPageTitle(nodes: TreeMenuNode[], pageId: string): string | null {
  for (const node of nodes) {
    for (const page of node.pages) {
      if (page.id === pageId) return page.title
    }
    const found = findPageTitle(node.children, pageId)
    if (found !== null) return found
  }
  return null
}

/** 두 목록이 같은 메뉴 · 페이지 id 집합인가 — 서버의 연쇄 삭제 견줌과 같은 술어다(차례 · 제목은 안 본다 — 이름만 바뀐 판은 같은 행이다). */
function sameIds(a: MenuSubtree, b: MenuSubtree): boolean {
  const same = (x: { id: string }[], y: { id: string }[]): boolean => {
    if (x.length !== y.length) return false
    const ids = new Set(x.map((entry) => entry.id))
    return y.every((entry) => ids.has(entry.id))
  }
  return same(a.menus, b.menus) && same(a.pages, b.pages)
}
