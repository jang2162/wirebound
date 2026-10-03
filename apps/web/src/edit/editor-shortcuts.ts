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
 * - **`selectSiblings`(Cmd+A)는 여럿 고르기가 서면 기준 노드의 형제 모두를 고른다** — 하나만 고르는 판에서는 기준 노드가 그대로다(셸의
 *   `run`). 표에 두는 것은 브라우저의 «페이지 글자 전부 고르기»가 에디터 위에서 서지 않게 하려는 것이다.
 */
export const EDITOR_SHORTCUTS: readonly Shortcut[] = [
  {
    command: 'undo',
    label: '되돌리기',
    keys: (p) => `${CMD[p]}Z`,
    match: (e, p) => mod(e, p) && !e.shiftKey && letter(e) === 'z',
    edits: true,
  },
  {
    command: 'redo',
    label: '다시 실행',
    keys: (p) => `${SHIFT_CMD[p]}Z · ${CMD[p]}Y`,
    match: (e, p) => mod(e, p) && ((e.shiftKey && letter(e) === 'z') || (!e.shiftKey && letter(e) === 'y')),
    edits: true,
  },
  {
    command: 'delete',
    label: '고른 노드 삭제',
    keys: () => 'Delete · Backspace',
    match: (e) => bare(e) && (e.key === 'Delete' || e.key === 'Backspace'),
    edits: true,
  },
  {
    command: 'duplicate',
    label: '복제(바로 뒤에)',
    keys: (p) => `${CMD[p]}D`,
    match: (e, p) => mod(e, p) && !e.shiftKey && letter(e) === 'd',
    edits: true,
  },
  {
    command: 'selectSiblings',
    label: '형제 모두 고르기',
    keys: (p) => `${CMD[p]}A`,
    match: (e, p) => mod(e, p) && !e.shiftKey && letter(e) === 'a',
    edits: false,
  },
  {
    command: 'deselect',
    label: '선택 해제',
    keys: () => 'Escape',
    match: (e) => bare(e) && !e.shiftKey && e.key === 'Escape',
    edits: false,
  },
  {
    command: 'moveUp',
    label: '위로',
    keys: (p) => `${ALT[p]}↑`,
    match: (e) => e.altKey && !e.shiftKey && !e.metaKey && !e.ctrlKey && e.key === 'ArrowUp',
    edits: true,
  },
  {
    command: 'moveDown',
    label: '아래로',
    keys: (p) => `${ALT[p]}↓`,
    match: (e) => e.altKey && !e.shiftKey && !e.metaKey && !e.ctrlKey && e.key === 'ArrowDown',
    edits: true,
  },
  {
    command: 'outdent',
    label: '내어쓰기',
    keys: (p) => `${ALT_SHIFT[p]}←`,
    match: (e) => e.altKey && e.shiftKey && !e.metaKey && !e.ctrlKey && e.key === 'ArrowLeft',
    edits: true,
  },
  {
    command: 'indent',
    label: '들여쓰기',
    keys: (p) => `${ALT_SHIFT[p]}→`,
    match: (e) => e.altKey && e.shiftKey && !e.metaKey && !e.ctrlKey && e.key === 'ArrowRight',
    edits: true,
  },
  {
    command: 'selectPrev',
    label: '이전 노드 고르기',
    keys: () => '↑',
    match: (e) => bare(e) && !e.shiftKey && e.key === 'ArrowUp',
    edits: false,
  },
  {
    command: 'selectNext',
    label: '다음 노드 고르기',
    keys: () => '↓',
    match: (e) => bare(e) && !e.shiftKey && e.key === 'ArrowDown',
    edits: false,
  },
  {
    command: 'selectParent',
    label: '부모 고르기',
    keys: () => '←',
    match: (e) => bare(e) && !e.shiftKey && e.key === 'ArrowLeft',
    edits: false,
  },
  {
    command: 'selectFirstChild',
    label: '첫 자식 고르기',
    keys: () => '→',
    match: (e) => bare(e) && !e.shiftKey && e.key === 'ArrowRight',
    edits: false,
  },
  {
    command: 'help',
    label: '단축키 목록',
    keys: () => '?',
    match: (e) => bare(e) && (e.key === '?' || (e.shiftKey && e.code === 'Slash')),
    edits: false,
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
 *
 * **대상은 `nodeType` 으로 본다** — 캔버스 iframe 에서 난 이벤트의 대상은 그 창의 `Element` 라 호스트의 `instanceof` 가 거짓이다
 * (`canvas/canvas-document.tsx` 머리말). 모달은 **호스트 문서**에서 찾는다 — 캔버스 문서에는 대화 상자가 서지 않는다.
 */
export function shortcutsBlocked(event: Event & { isComposing?: boolean }, host: Document = document): boolean {
  if (event.isComposing === true) return true
  if (event.defaultPrevented) return true
  if (isTypingSurface(event.target)) return true
  const target = event.target as Node | null
  if (target !== null && target.nodeType === 1 && (target as Element).closest('[data-wb-own-shortcuts]') !== null) return true
  return host.querySelector('dialog[open]') !== null
}
