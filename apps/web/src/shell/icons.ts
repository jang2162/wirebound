/**
 * **셸의 아이콘 표** — 동작 하나에 lucide 아이콘 하나. 단추 · 메뉴 항목은 아이콘을 여기서만 받는다.
 *
 * ## 같은 동작은 어디서나 같은 아이콘이다
 *
 * 삭제는 트리 줄 «삭제» · 속성 목록 «N번째 지우기» · 상호작용 · 코멘트가 다 `remove`(휴지통)다. 자리마다 lucide 를 직접 고르면 같은
 * 동작이 자리마다 다른 그림이 되고, 그림으로 뜻을 읽는 사람에게는 다른 동작으로 보인다. 그래서 자리는 lucide 를 직접 들이지 않고 이
 * 표의 열쇠를 쓴다 — 아이콘을 바꿀 때 고칠 곳이 한 줄이다. 열쇠는 **그림이 아니라 동작**의 이름이다(`remove` 이지 `trash` 가 아니다).
 *
 * ## 이름은 아이콘이 나르지 않는다
 *
 * 아이콘은 늘 `aria-hidden` 이다. 글과 함께 서는 자리(메뉴 항목 · 주 단추)는 글이 이름이고, 아이콘만 남는 단추는 `aria-label` 과
 * `title` 이 그 자리의 글을 그대로 든다 — 접근 이름은 아이콘을 얹기 전의 글과 글자까지 같다. 둘 다 `test/shell/icon-census.test.tsx` 가
 * 센다(아이콘만 남은 단추의 이름 · `title`, 행동 메뉴 항목의 아이콘).
 *
 * ## 크기 · 선 굵기 · 색은 자리가 정한다
 *
 * 표는 그림만 고른다. 크기는 그 자리의 꼴이 정하고(메뉴 항목 14 — `shell/action-menu.tsx` 머리말 «항목의 아이콘» · 촘촘한 단추 14 ·
 * 머리 · 하단 바 · 대화 상자 머리의 단추 16), 선 굵기는 2(가져오기 상자 파일 칸의 24px 그림만 1.75), 색은 글자색(`currentColor` —
 * lucide 의 기본값)이라 끈 단추 · 위험 단추의 색을 그대로 받는다.
 *
 * **lucide 를 들이는 곳은 이 파일 하나다**(`ActionMenuItem.icon` 의 타입 `LucideIcon` 만 빼고) — 자리마다 직접 들이면 위 «같은 동작은
 * 어디서나 같은 아이콘»이 지켜지는지 이 표만 봐서는 모른다. `test/shell/icon-census.test.tsx` 가 센다.
 */
import {
  ArrowDown,
  ArrowUp,
  BetweenHorizontalEnd,
  Blocks,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  CircleCheck,
  CircleUser,
  CircleX,
  CornerDownRight,
  Download,
  Eye,
  Ellipsis,
  FileDown,
  FilePlus,
  FileUp,
  FolderInput,
  FolderOpen,
  FolderPlus,
  GripVertical,
  History,
  Layers,
  LayoutTemplate,
  ListTree,
  ListIndentDecrease,
  ListIndentIncrease,
  ListOrdered,
  LogOut,
  MessageSquarePlus,
  MousePointerClick,
  MoveHorizontal,
  PanelLeft,
  PanelRight,
  Palette,
  Pencil,
  PackageOpen,
  Plus,
  Redo2,
  Settings,
  Split,
  SquareDashed,
  Stamp,
  Trash2,
  TriangleAlert,
  Undo2,
  Upload,
  Users,
  Ungroup,
  X,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from 'lucide-react'
import { createElement, type ReactElement } from 'react'

export const ICONS = {
  /** 무엇을 더한다 — 트리 줄 · 뿌리의 `+`, 컴포넌트 카드의 «넣기», 목록 · 상호작용의 «추가». */
  add: Plus,
  /** 행동 메뉴를 연다 — 트리 줄 · 머리의 `…`. */
  more: Ellipsis,
  /** 지운다 — 메뉴의 «삭제» · 속성 목록의 «N번째 지우기» · 상호작용 · 코멘트의 지우기. */
  remove: Trash2,
  /** 통지 · 대화 상자를 닫는다. */
  close: X,
  /** 끌어 옮긴다 — 캔버스 손잡이. */
  drag: GripVertical,
  undo: Undo2,
  redo: Redo2,
  zoomOut: ZoomOut,
  zoomIn: ZoomIn,
  /** 캔버스 폭에 맞춘다(«화면 맞춤» — 폭 기준). */
  fitWidth: MoveHorizontal,
  /** 좌측(메뉴 · 구조 트리)을 접고 편다 — 머리 왼쪽 끝의 토글(`shell/panel-fold.tsx`). */
  foldSide: PanelLeft,
  /** 우측 패널을 접고 편다 — 머리 오른쪽 끝(`…` 앞)의 토글. */
  foldPanel: PanelRight,
  /** 접힌 것을 편다 · 편 것을 접는다 — 펼침 단추의 머리. */
  expand: ChevronRight,
  collapse: ChevronDown,
  /** 트리의 줄을 모두 접는다 · 모두 편다 — 트리 머리. */
  collapseAll: ChevronsDownUp,
  expandAll: ChevronsUpDown,
  /** 이름 · 글을 고친다 — «이름 변경» · 코멘트 «수정». */
  rename: Pencil,
  moveUp: ArrowUp,
  moveDown: ArrowDown,
  indent: ListIndentIncrease,
  outdent: ListIndentDecrease,
  /** 다른 부모 밑으로 옮긴다 — 페이지의 «옮기기». */
  reparent: FolderInput,
  /** 메뉴를 만든다 — «하위 메뉴» · «최상위 메뉴 추가». */
  addMenu: FolderPlus,
  addPage: FilePlus,
  /** 노드를 고른 것의 자식으로 — «안에 추가» · 뿌리의 «페이지에 추가». */
  addInside: CornerDownRight,
  /** 노드를 고른 것의 다음 형제로 — «아래 추가». */
  addAfter: BetweenHorizontalEnd,
  pattern: LayoutTemplate,
  preset: Stamp,
  importJson: FileUp,
  exportJson: FileDown,
  account: CircleUser,
  projectSettings: Settings,
  themes: Palette,
  snapshots: History,
  exportProject: Download,
  logout: LogOut,
  /** 하단 컴포넌트 판을 연다 · 닫는다. */
  palette: Blocks,
  /** 코멘트를 단다. */
  comment: MessageSquarePlus,
  /** 번호를 문서 순서로 다시 매긴다. */
  renumber: ListOrdered,
  /** 캔버스의 배치 선(Flex · Grid 의 경계와 방향)을 켜고 끈다 — 머리. */
  layoutGuides: SquareDashed,
  /** 동작이 아니라 결과의 표지 — 읽은 것 · 들어간 것(성공) · 실패 · 경고(페이지 가져오기 상자). */
  succeeded: CircleCheck,
  failed: CircleX,
  warning: TriangleAlert,
  /** 화면 상태를 고르고 다룬다 — 머리 상태 전환기 · «상태 관리…»(`shell/view-state-switcher.tsx`). */
  viewStates: Layers,
  /** 고른 노드를 상태 영역으로 감싼다 — «상태별로 나누기». */
  splitStates: Split,
  /** 상태 영역을 벗긴다 — «상태 나누기 풀기». */
  unsplitStates: Ungroup,
  /** 구조 트리의 상태 영역 가지를 전부 편다 — «모든 가지 보기»(트리 머리). */
  allCases: ListTree,
  /** 빈 캔버스 안내(`routes/editor.tsx` 의 `EmptyCanvas`) — 트리에서 페이지를 누르라는 그림. */
  pickPage: MousePointerClick,
  /** 빈 프로젝트 목록의 그림(`routes/project-list.tsx`). */
  noProjects: FolderOpen,
  /** 프로젝트 설정의 «멤버» 탭(`routes/settings.tsx`). */
  members: Users,
  /** 테마 관리 «테마 패키지 올리기»(`routes/admin-themes.tsx`). */
  uploadTheme: Upload,
  /** 테마 관리 «스타터 템플릿 받기». */
  themeTemplate: PackageOpen,
  /** 테마 관리 판 줄의 «미리보기». */
  preview: Eye,
} as const satisfies Record<string, LucideIcon>

export type IconName = keyof typeof ICONS

/**
 * 표의 아이콘 하나를 그린다 — `aria-hidden` · 선 2 · 글자색(머리말 «이름은 아이콘이 나르지 않는다» · «크기 · 선 굵기 · 색은 자리가 정한다»).
 * `size` 는 그 자리의 꼴이다.
 */
export function shellIcon(name: IconName, size: number, className = 'wb-shell-icon'): ReactElement {
  return createElement(ICONS[name], { className, size, strokeWidth: 2, 'aria-hidden': 'true' })
}
