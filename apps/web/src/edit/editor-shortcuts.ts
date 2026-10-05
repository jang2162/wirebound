/**
 * **에디터 단축키 표 하나**(설계서 「설계서 화면 구조」의 단축키). 키 → 명령과, 단축키 · 클립보드 이벤트가 **서지 않는 때**를 여기 둔다.
 * 리스너는 `./use-editor-shortcuts.ts`(키) · `./use-clipboard.ts`(복사 · 잘라내기 · 붙여넣기)이고, 도움말 상자(`shell/shortcut-help.tsx`)가
 * 이 표를 그대로 그린다 — 표가 둘이면 한쪽만 고쳐진다.
 *
 * **순수하다** — React 를 모른다. 명령을 무엇에 잇는지는 셸(`shell/editor-keys.tsx`)이 정한다.
 *
 * ## 구조 트리 상자의 단축키 둘은 여기 없다
 *
 * 패턴 넣기 · 프리셋(`Alt`+`Shift`+`I` · `P`)은 구조 트리의 고르개를 여는 것이라 그 트리의 명령 인스턴스(`useStructureCommands` 의
 * `adding`)에 매인다 — 트리 상자 안의 표(`panels/structure-tree.tsx` 의 `TREE_SHORTCUTS`)가 받고, 도움말은 그 둘을 «구조 트리에서» 줄로
 * 덧붙인다. 메뉴 트리 상자의 단축키(`panels/menu-tree.tsx`)는 메뉴 · 페이지 줄의 것이라 그 상자가 받는다 — 포커스가 그 상자 안이면 이 표는
 * 서지 않는다(`shortcutsBlocked`).
 */
import { isTypingSurface } from '../panels/typing-surface'

export type ShortcutCommand =
  | 'undo'
  | 'redo'
  | 'delete'
  | 'duplicate'
  | 'deselect'
  | 'moveUp'
  | 'moveDown'
  | 'outdent'
  | 'indent'
  | 'selectPrev'
  | 'selectNext'
  | 'selectParent'
  | 'selectFirstChild'
  | 'selectSiblings'
  | 'alias'
  | 'help'

export type Platform = 'mac' | 'other'

/** 키 이벤트에서 표가 읽는 것. `KeyboardEvent` 그대로 넣어도 되고, 케이스는 이 모양만 지어 넣는다. */
export type ShortcutKeyEvent = Pick<KeyboardEvent, 'key' | 'code' | 'altKey' | 'shiftKey' | 'metaKey' | 'ctrlKey'>

export interface Shortcut {
  command: ShortcutCommand
  /** 도움말 상자에 그대로 쓰는 글자(예: `⌘Z` / `Ctrl+Z`). 키가 둘이면 ` · ` 로 잇는다. */
  keys: (platform: Platform) => string
  label: string
  match: (event: ShortcutKeyEvent, platform: Platform) => boolean
  /**
   * 편집을 내는가 — 뷰 모드 · viewer 에서 안 선다(`editable` — 리스너가 본다). 고른 노드를 남이 잡은 판은 명령이 제 판정으로 거른다
   * (삭제 · 순서 · 계층은 `structureAbilities` 의 잠금 · 되돌리기는 스토어의 `#startFrom` · 복제는 `editBlockedBy`).
   */
  edits: boolean
  /**
   * 누른 채의 키 반복(`event.repeat`)도 받는가. **지우기 · 복제는 안 받는다** — 지운 뒤 다음 반복이 다른 노드에 닿고(키보드 삭제는 선택을
   * 비우지만 그 판정이 바뀌면 반복이 이어 지운다), 복제는 1s 누름에 사본이 열 몇 개 선다. 컴포넌트 판 «넣기»(`palette/component-palette.tsx`)와
   * 같은 선례다. 되돌리기 · 다시 실행은 반복을 받는다 — 글 편집기의 Cmd+Z 와 같다. 거른 반복에도 `preventDefault` 는 건다(Cmd+D 의 책갈피).
   */
  repeat: boolean
}

/**
 * macOS 인가. **Cmd 와 Ctrl 이 엇갈리는 축이다** — mac 은 `metaKey`, 그 밖은 `ctrlKey`. `navigator.platform` 은 낡은 값이지만 Chrome ·
 * Safari · Firefox 가 다 채우고, 비면 `userAgent` 로 본다.
 */
export function platformOf(navigator: Pick<Navigator, 'platform' | 'userAgent'>): Platform {
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent) ? 'mac' : 'other'
}

/** 플랫폼의 «명령 키» 하나만 눌렸는가 — mac 에서 Ctrl+Z, 그 밖에서 Cmd(Win)+Z 는 안 선다. Alt 도 함께면 안 선다. */
function mod(event: ShortcutKeyEvent, platform: Platform): boolean {
  if (event.altKey) return false
  return platform === 'mac' ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey
}

/** 수식 키가 하나도 없다(Shift 는 따로 본다). */
function bare(event: ShortcutKeyEvent): boolean {
  return !event.altKey && !event.metaKey && !event.ctrlKey
}

/**
 * 눌린 글자 키(소문자). **`key` 가 ASCII 글자 하나면 그것을 보고, 아니면(`ㅋ` · `Process` 처럼 ASCII 밖) `code` 로 본다** — 한글 자판에서
 * Ctrl+Z 의 `key` 가 `ㅋ` 로 오는 판이 있고, `code` 는 물리 키라 자판을 안 탄다. `key` 를 먼저 보는 것은 Dvorak 처럼 글자 자리가 다른
 * 자판에서 글자대로 서게 하려는 것이다 — 그 자판에서 물리 `KeyZ` 가 내는 `;` 는 되돌리기가 아니다.
 */
function letter(event: ShortcutKeyEvent): string | null {
  if (/^[\x21-\x7e]$/.test(event.key)) return /^[a-z]$/i.test(event.key) ? event.key.toLowerCase() : null
  return /^Key[A-Z]$/.test(event.code) ? event.code.slice(3).toLowerCase() : null
}

const CMD: Record<Platform, string> = { mac: '⌘', other: 'Ctrl+' }
const SHIFT_CMD: Record<Platform, string> = { mac: '⇧⌘', other: 'Ctrl+Shift+' }
const ALT: Record<Platform, string> = { mac: '⌥', other: 'Alt+' }
const ALT_SHIFT: Record<Platform, string> = { mac: '⌥⇧', other: 'Alt+Shift+' }

/**
 * **차례가 판정이다** — `shortcutFor` 가 처음 맞는 것을 고른다. Alt 를 든 것(순서 · 계층)이 Alt 없는 화살표(선택 이동)보다 앞이고, 둘은
 * 수식 키 조건으로도 갈린다.
 *
 * - **`Delete` · `Backspace` 둘 다 삭제다** — macOS 노트북 자판에는 forward delete 가 없어 그 자리의 키가 `Backspace` 를 낸다. 키보드
 *   삭제는 **확인 없이 바로** 지운다(되돌리기로 돌아온다 — 설계서 「설계서 화면 구조」의 단축키 표). 줄 `…` 의 «삭제»도 바로 지우고, 두 번
 *   누르는 확인은 메뉴 트리(메뉴 · 페이지 — 되돌리기가 없다)의 것이다.
 * - **들여쓰기는 `→` 다** — 깊이를 늘리는 방향이 LTR 의 오른쪽이고, 메뉴 트리도 `→` 가 들여쓰기다(한쪽만 뒤집으면 한 화면의 두 트리에서
 *   같은 키가 반대 일을 한다 — `test/panels/tree-shortcuts.test.tsx`). **`Alt`+`←` · `→` 를 쓰지 않은 것은** 그것이 Windows · Linux 의
 *   Chrome · Firefox 에서 뒤로 · 앞으로라서다. `Shift` 를 더한 조합에 브라우저 · OS 기본 바인딩이 있는지는 재지 못했다.
 * - **`Tab` 은 빼앗지 않는다** — 키보드 사용자가 트리 · 패널을 빠져나갈 길이다.
 * - **`?` 는 `key` 로 본다** — 자판마다 `?` 자리가 다르다. `code` 가 `Slash` 인 Shift 판도 받는다(조합기가 `key` 를 바꾼 판).
 * - **Cmd+A 는 «기준 노드의 형제 모두»다**(기준 노드가 루트거나 없으면 루트의 자식 모두 — 설계서 「설계서 화면 구조」의 «고르는 법»). 브라우저의
 *   «전부 고르기»(캔버스 · 상호작용 문장의 글자)를 먹는다 — 이어 친 Cmd+C 는 글자 대신 고른 노드들의 봉투를 싣는다. 입력 칸 안의 Cmd+A 는
 *   칸의 것이다(`shortcutsBlocked`). 고르기라 뷰 모드 · viewer 에서도 선다.
 */
export const EDITOR_SHORTCUTS: readonly Shortcut[] = [
  {
    command: 'undo',
    label: '되돌리기',
    keys: (p) => `${CMD[p]}Z`,
    match: (e, p) => mod(e, p) && !e.shiftKey && letter(e) === 'z',
    edits: true,
    repeat: true,
  },
  {
    command: 'redo',
    label: '다시 실행',
    keys: (p) => `${SHIFT_CMD[p]}Z · ${CMD[p]}Y`,
    match: (e, p) => mod(e, p) && ((e.shiftKey && letter(e) === 'z') || (!e.shiftKey && letter(e) === 'y')),
    edits: true,
    repeat: true,
  },
  {
    command: 'delete',
    label: '고른 노드 삭제',
    keys: () => 'Delete · Backspace',
    match: (e) => bare(e) && (e.key === 'Delete' || e.key === 'Backspace'),
    edits: true,
    repeat: false,
  },
  {
    command: 'duplicate',
    label: '복제(바로 뒤에)',
    keys: (p) => `${CMD[p]}D`,
    match: (e, p) => mod(e, p) && !e.shiftKey && letter(e) === 'd',
    edits: true,
    repeat: false,
  },
  {
    command: 'deselect',
    label: '선택 해제',
    keys: () => 'Escape',
    match: (e) => bare(e) && !e.shiftKey && e.key === 'Escape',
    edits: false,
    repeat: true,
  },
  {
    command: 'moveUp',
    label: '위로',
    keys: (p) => `${ALT[p]}↑`,
    match: (e) => e.altKey && !e.shiftKey && !e.metaKey && !e.ctrlKey && e.key === 'ArrowUp',
    edits: true,
    repeat: true,
  },
  {
    command: 'moveDown',
    label: '아래로',
    keys: (p) => `${ALT[p]}↓`,
    match: (e) => e.altKey && !e.shiftKey && !e.metaKey && !e.ctrlKey && e.key === 'ArrowDown',
    edits: true,
    repeat: true,
  },
  {
    command: 'outdent',
    label: '내어쓰기',
    keys: (p) => `${ALT_SHIFT[p]}←`,
    match: (e) => e.altKey && e.shiftKey && !e.metaKey && !e.ctrlKey && e.key === 'ArrowLeft',
    edits: true,
    repeat: true,
  },
  {
    command: 'indent',
    label: '들여쓰기',
    keys: (p) => `${ALT_SHIFT[p]}→`,
    match: (e) => e.altKey && e.shiftKey && !e.metaKey && !e.ctrlKey && e.key === 'ArrowRight',
    edits: true,
    repeat: true,
  },
  {
    command: 'selectPrev',
    label: '이전 노드 고르기',
    keys: () => '↑',
    match: (e) => bare(e) && !e.shiftKey && e.key === 'ArrowUp',
    edits: false,
    repeat: true,
  },
  {
    command: 'selectNext',
    label: '다음 노드 고르기',
    keys: () => '↓',
    match: (e) => bare(e) && !e.shiftKey && e.key === 'ArrowDown',
    edits: false,
    repeat: true,
  },
  {
    command: 'selectParent',
    label: '접기 · 부모 고르기',
    keys: () => '←',
    match: (e) => bare(e) && !e.shiftKey && e.key === 'ArrowLeft',
    edits: false,
    repeat: true,
  },
  {
    command: 'selectFirstChild',
    label: '펴기 · 첫 자식 고르기',
    keys: () => '→',
    match: (e) => bare(e) && !e.shiftKey && e.key === 'ArrowRight',
    edits: false,
    repeat: true,
  },
  {
    command: 'selectSiblings',
    label: '형제 모두 고르기',
    keys: (p) => `${CMD[p]}A`,
    match: (e, p) => mod(e, p) && !e.shiftKey && letter(e) === 'a',
    edits: false,
    repeat: false,
  },
  {
    // **고른 노드 하나의 별칭 입력을 구조 트리 줄 아래에 연다**(`panels/alias-edit.tsx`) — 캔버스에 포커스가 있어도 선다. 반복은 안 받는다 —
    // 연 입력에 포커스가 가 다음 반복은 입력 칸의 키다.
    command: 'alias',
    label: '별칭 바꾸기',
    keys: () => 'F2',
    match: (e) => bare(e) && !e.shiftKey && e.key === 'F2',
    edits: true,
    repeat: false,
  },
  {
    command: 'help',
    label: '단축키 목록',
    keys: () => '?',
    match: (e) => bare(e) && (e.key === '?' || (e.shiftKey && e.code === 'Slash')),
    edits: false,
    repeat: true,
  },
]

/** 그 키의 단축키. 표에 없으면 `null`. */
export function shortcutFor(event: ShortcutKeyEvent, platform: Platform): Shortcut | null {
  return EDITOR_SHORTCUTS.find((shortcut) => shortcut.match(event, platform)) ?? null
}

/** 도움말에만 쓰는 줄 — 키가 아니라 그 키가 내는 브라우저 이벤트로 받는 것들. */
export interface ShortcutLine {
  keys: (platform: Platform) => string
  label: string
}

/**
 * 복사 · 잘라내기 · 붙여넣기. **표(`EDITOR_SHORTCUTS`)에 없다** — 키가 아니라 `copy` · `cut` · `paste` 이벤트로 받는다
 * (`./use-clipboard.ts` 머리말 — `clipboardData` 는 그 이벤트 안에서만 권한 묻기 없이 읽고 쓴다). 도움말이 이 줄을 덧붙인다.
 */
export const CLIPBOARD_SHORTCUT_LINES: readonly ShortcutLine[] = [
  { keys: (p) => `${CMD[p]}C`, label: '복사' },
  { keys: (p) => `${CMD[p]}X`, label: '잘라내기' },
  { keys: (p) => `${CMD[p]}V`, label: '붙여넣기' },
]

/**
 * 단축키 · 클립보드 이벤트가 **서지 않는 때** — 키 리스너와 클립보드 리스너가 같은 것을 부른다(규칙이 둘이면 한쪽만 고쳐진다).
 *
 * | 조건 | 까닭 |
 * |---|---|
 * | 한글 조합 중(`isComposing`) | 조합 중의 `Backspace` · `Escape` 는 조합의 키다 — 노드를 지우거나 선택을 풀면 친 글이 사라진다 |
 * | 이미 누가 받았다(`defaultPrevented`) | 열린 행동 메뉴의 Escape · 트리 상자의 패턴 단축키처럼 더 가까운 받는 쪽이 있다 |
 * | 글 입력 표면(`isTypingSurface`) | 입력 칸의 Delete · Cmd+Z · Cmd+C 는 그 칸의 것이다 |
 * | 제 단축키를 받는 상자 안(`[data-wb-own-shortcuts]`) | 메뉴 트리 상자 — 그 상자의 단축키가 받는다 |
 * | 모달이 열렸다(호스트 문서의 `dialog[open]`) | 상자 안 단추에서 친 Delete 가 뒤 화면의 노드를 지우면 안 된다 |
 * | 캔버스 문서에서 포커스 받은 요소가 문서 자체(`body` · `html`) · 글을 안 받는 기본 컨트롤(`button` · `a[href]`)이 아니다 | 아래 «캔버스 문서는 서는 대상을 센다» |
 *
 * **대상은 `nodeType` 으로 본다** — 캔버스 iframe 에서 난 이벤트의 대상은 그 창의 `Element` 라 호스트의 `instanceof` 가 거짓이다
 * (`canvas/canvas-document.tsx` 머리말). 모달은 **호스트 문서**에서 찾는다 — 캔버스 문서에는 대화 상자가 서지 않는다.
 *
 * ## 캔버스 문서는 서는 대상을 센다 — 막는 대상을 세지 않는다
 *
 * 캔버스는 테마 뷰(임의의 React)를 그린다. **닫힌 shadow root 안의 입력**은 이벤트 대상이 호스트로 리타게팅되고 그 `shadowRoot` 가 `null` 이라
 * `isTypingSurface` 가 못 본다(그 머리말 «이 판정이 못 보는 것») — 그 칸에서 친 Backspace 가 글자 대신 고른 노드를 지웠다(Chrome ·
 * `build-test/editor-shortcuts-review.test.ts` «L1»). `composedPath()` 도 닫힌 root 안을 바깥에 안 보여 쓸 수 없다. 그래서 캔버스 문서에서는
 * 거꾸로 센다 — 포커스가 없거나(`body`) 글을 안 받는 기본 컨트롤일 때만 서고, 그 밖의 포커스 받은 요소는 표면으로 본다. **`body` 하나로
 * 좁히지 않는다** — 캔버스의 Button 노드를 누르면 포커스가 그 `button` 이다(Text · Field 노드는 `body`).
 *
 * **이벤트 대상이 아니라 그 문서의 `activeElement` 를 본다.** 클립보드 이벤트의 대상은 포커스가 아니라 고른 자리(캐럿)의 시작 요소라, 캔버스
 * 본문을 누른 뒤의 Cmd+V 대상이 테마의 `div` 다 — 대상으로 가르면 붙이기가 막힌다(Chrome · `build-test/clipboard.test.ts`). 닫힌 shadow 안
 * 입력에 포커스가 있으면 `activeElement` 는 그 호스트다. 키 이벤트는 대상이 곧 포커스 받은 요소라 어느 쪽이든 같다.
 */
export function shortcutsBlocked(event: Event & { isComposing?: boolean }, host: Document = document): boolean {
  if (event.isComposing === true) return true
  if (event.defaultPrevented) return true
  if (isTypingSurface(event.target)) return true
  const target = event.target as Node | null
  const canvas = target === null ? null : target.ownerDocument
  if (canvas !== null && canvas !== host && canvas.activeElement !== null && !canvasKeyTarget(canvas.activeElement)) return true
  if (target !== null && target.nodeType === 1 && (target as Element).closest('[data-wb-own-shortcuts]') !== null) return true
  return host.querySelector('dialog[open]') !== null
}

/** 캔버스 문서에서 단축키가 서는 대상(`shortcutsBlocked` 의 «캔버스 문서는 서는 대상을 센다»). */
function canvasKeyTarget(element: Element): boolean {
  switch (element.localName) {
    case 'body':
    case 'html':
    case 'button':
      return true
    case 'a':
      return element.hasAttribute('href')
    default:
      return false
  }
}

/** 목록을 오가는 위젯(메뉴 · 목록 · 고르기 무리 · 열린 행동 메뉴 · 고르개)이 쥐는 키. */
const LIST_KEYS: ReadonlySet<string> = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Escape', 'Enter'])
/** 셸의 표지(`[data-wb-holds-keys]` — 열린 행동 메뉴 · 고르개)가 더 쥐는 키 — 아래 `keyHeldByWidget` 의 표. */
const HELD_KEYS: ReadonlySet<string> = new Set([...LIST_KEYS, 'Delete', 'Backspace'])
/** 가로 축 위젯(가로 탭 · 세로 손잡이 · 가로 값 조절)이 쥐는 키. */
const ROW_KEYS: ReadonlySet<string> = new Set(['ArrowLeft', 'ArrowRight', 'Home', 'End'])
/** 세로 축 위젯(세로 탭 · 가로 손잡이 · 세로 값 조절)이 쥐는 키. */
const COLUMN_KEYS: ReadonlySet<string> = new Set(['ArrowUp', 'ArrowDown', 'Home', 'End'])

const LIST_ROLES = ['menu', 'menuitem', 'listbox', 'option', 'radiogroup', 'combobox'].map((role) => `[role="${role}"]`).join(',')

/**
 * **그 키를 위젯이 쥐었는가** — 키 리스너만 본다(클립보드 이벤트에는 키가 없다). 참이면 단축키가 그 키를 받지 않고 `preventDefault` 도 안
 * 건다 — 위젯과 브라우저가 그대로 갖는다. **위젯은 그 위젯이 쓰는 키만 쥔다** — 명령 키 조합 · `?` 는 어느 위젯도 안 쥐고, Delete ·
 * Backspace 는 셸의 표지(열린 행동 메뉴 · 고르개)만 쥐어, 그 밖에서는 입력 표면이 아니면(`shortcutsBlocked`) 단축키로 간다.
 *
 * | 포커스가 어디 안인가 | 쥐는 키 | 까닭 |
 * |---|---|---|
 * | `role` menu · menuitem · listbox · option · radiogroup · combobox | 화살표 넷 · Home · End · Escape · Enter | 위젯이 안 쓰는 축의 키(열린 줄 메뉴의 ← →)가 전역 명령이 되면 그 위젯이 쥔 대상이 바뀐다 — 줄 `…` 메뉴의 «삭제»는 고른 노드에 대한 명령이라 ← 뒤 «삭제»가 부모를 지웠다(Chrome · `build-test/editor-shortcuts-review.test.ts` «H2») |
 * | `[data-wb-holds-keys="menu"]` — 열린 행동 메뉴의 단추 상자와 portal 된 목록(`shell/action-menu.tsx`) | 윗줄의 키 · Delete · Backspace | 메뉴는 고른 노드에 대한 명령을 들고 열려 있다 — 그 안의 Delete 가 노드를 지우면 메뉴는 닫히고(`openWhile`) 사람은 메뉴 항목을 고르려다 노드를 잃는다(Chrome · `build-test/action-menu-delete.test.ts`). 메뉴는 그 둘을 받아 아무것도 안 한다. 항목이 다 꺼진 메뉴는 포커스가 단추에 남는다 — 그 Escape 가 메뉴를 닫으며 선택까지 풀었다(«L2») |
 * | `[data-wb-holds-keys=""]` — 열린 고르개(`panels/structure-toolbar.tsx` 의 `StructurePicker`) | 윗줄과 같다 | 고르개는 고른 노드 · 줄에 대한 넣기 · 옮기기를 들고 열려 있다 — 그 안의 Delete 가 고른 노드를 지우면 넣을 자리가 사라지고 고르개가 말없이 닫혔다(타입 고르개 — 패턴 · 프리셋 고르개는 열린 채 남았다 · Chrome · `build-test/keyboard-holes.test.ts` «4»). 고르개 안의 Escape 는 고르개가 받아 닫는다(`cancelAdd`) |
 * | `role` tab · tablist | 탭 줄의 축(`aria-orientation` — 기본 가로)의 화살표 · Home · End | 로빙 탭(컴포넌트 판 갈래)은 ← → 로 탭을 옮긴다 |
 * | `role` separator · slider | 그 축의 화살표 · Home · End | 손잡이(`shell/shell-resizer.tsx`)는 세로줄이 ← →, 가로줄이 ↑ ↓ 다(그 머리말 «`aria-orientation`») |
 *
 * **표지는 포커스가 그 안일 때만 쥔다** — 호스트 문서에 있기만 하면 쥐던 판은 고르개가 선 동안 캔버스 · 줌 단추 · 고르개를 연 `+` 토글에서 친
 * Delete · ↓ · Escape 를 아무 말 없이 먹었다(Chrome · `build-test/editor-shortcuts-review-2.test.ts` «R2»). **역할마다 키를 가른다** — 모든
 * 역할이 같은 일곱 키를 쥐던 판은 키를 하나도 안 쓰는 우측 패널 탭을 누른 뒤의 Delete · ↓ · Escape 를 먹었다(«R3»). 위젯이 안 쓰는 축의 화살표
 * (탭의 ↑ ↓ · 손잡이의 직각)는 선택을 옮긴다 — 그 위젯은 대상을 쥐지 않아 해가 서지 않는다. 대상을 쥔 메뉴가 열린 동안 선택이 옮으면 그 메뉴는
 * 닫힌다(`shell/action-menu.tsx` 의 `openWhile`). **메뉴의 Delete · Backspace 는 역할(`menu` · `menuitem`)이 아니라 셸의 표지로 가른다** —
 * 역할로 가르면 캔버스에서 테마가 그린 ARIA 메뉴의 단추를 누른 뒤의 Delete 도 먹는다. 메뉴 트리 상자의 키 처리도 이 판정을 지난다
 * (`panels/menu-tree.tsx` 의 `handleKeyDown` — 목록의 키가 React 트리를 따라 그 상자에 닿는다).
 */
export function keyHeldByWidget(event: Pick<KeyboardEvent, 'key' | 'target'>): boolean {
  const target = event.target as Node | null
  const element = target !== null && target.nodeType === 1 ? (target as Element) : null
  if (element === null) return false
  if (element.closest('[data-wb-holds-keys]') !== null) return HELD_KEYS.has(event.key)
  if (element.closest(LIST_ROLES) !== null) return LIST_KEYS.has(event.key)
  const tab = element.closest('[role="tab"],[role="tablist"]')
  if (tab !== null) {
    const list = tab.closest('[role="tablist"]')
    return (list?.getAttribute('aria-orientation') === 'vertical' ? COLUMN_KEYS : ROW_KEYS).has(event.key)
  }
  const handle = element.closest('[role="separator"],[role="slider"]')
  if (handle !== null) return (axisOf(handle) === 'row' ? ROW_KEYS : COLUMN_KEYS).has(event.key)
  return false
}

/**
 * 손잡이 · 값 조절이 움직이는 축. 분리선의 `aria-orientation` 은 **선이 놓인 방향**이라 세로줄이 ← →, 가로줄(ARIA 의 `separator` 기본값)이
 * ↑ ↓ 로 움직인다. 값 조절은 놓인 방향(기본 가로)으로 움직인다.
 */
function axisOf(handle: Element): 'row' | 'column' {
  const orientation = handle.getAttribute('aria-orientation')
  if (handle.getAttribute('role') === 'separator') return orientation === 'vertical' ? 'row' : 'column'
  return orientation === 'vertical' ? 'column' : 'row'
}
