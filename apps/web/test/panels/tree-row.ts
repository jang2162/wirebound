/**
 * **트리 줄 행동을 여는 길** — 옛 툴바(«메뉴 편집» · «구조 편집» 묶음)의 단추를 찾던 케이스가 줄의 `+` · `…`(`src/panels/tree-row-actions.tsx`)
 * 로 같은 명령에 닿게 하는 도우미. **단언은 옮기지 않는다** — 케이스가 재던 값(요청 · 트리 · 문서)은 그대로고, 바뀌는 것은 명령에
 * 닿는 길이다.
 *
 * 줄 행동은 **고른 줄의 것**을 쓴다(`.wb-shell-tree-row-picked`) — 옛 툴바가 고른 것에 작동하던 것과 같은 대상이다. 끈 단추의
 * `disabled`는 끈 항목의 `aria-disabled`가 대신한다(`isOff`).
 *
 * jsdom 은 CSS 를 안 읽으므로 줄 행동이 줄마다 보인다(실브라우저에서는 마우스 · 포커스 · 고른 줄에서만 — `build-test/tree-drag.test.ts`).
 */
import { fireEvent, within } from '@testing-library/react'

/** `+` 에 드는 항목 — 나머지는 `…`에 있다. */
const ADD_ITEMS = new Set(['하위 메뉴', '페이지 추가', 'JSON 에서 가져오기…', '안에 추가', '아래 추가', '패턴 넣기', '프리셋'])

/** 그 영역의 고른 줄. 없으면 던진다 — 고른 것이 없으면 줄 행동도 없다. */
export function pickedRow(region: HTMLElement): HTMLElement {
  const row = region.querySelector<HTMLElement>('.wb-shell-tree-row-picked')
  if (row === null) throw new Error('고른 줄이 없다 — 줄 행동은 고른 줄의 것이다')
  return row
}

/**
 * 줄의 `+` · `…` 단추. `+`가 없는 줄(페이지)에서 `+`를 물으면 `null`. 둘은 아이콘만이라 글자가 없다 — 접근 이름의 끝(«… 추가» ·
 * «… 더 보기» — `src/panels/tree-row-actions.tsx` 의 `TreeRowActions`)으로 가른다.
 */
export function rowToggle(row: HTMLElement, which: '+' | '…'): HTMLButtonElement | null {
  const toggles = [...row.querySelectorAll<HTMLButtonElement>('[aria-haspopup="menu"]')]
  const suffix = which === '+' ? ' 추가' : ' 더 보기'
  return toggles.find((toggle) => (toggle.getAttribute('aria-label') ?? '').endsWith(suffix)) ?? null
}

/**
 * 고른 줄(또는 준 줄)의 `+` · `…`에서 항목 하나 — 닫혀 있으면 연다. 항목이 없으면 던진다(`queryRowAction`은 `null`).
 */
export function rowAction(region: HTMLElement, name: string, row: HTMLElement = pickedRow(region)): HTMLElement {
  const item = queryRowAction(region, name, row)
  if (item === null) throw new Error(`줄 행동에 «${name}»이 없다`)
  return item
}

export function queryRowAction(region: HTMLElement, name: string, row: HTMLElement = pickedRow(region)): HTMLElement | null {
  const toggle = rowToggle(row, ADD_ITEMS.has(name) ? '+' : '…')
  if (toggle === null) return null
  if (toggle.getAttribute('aria-expanded') !== 'true') fireEvent.click(toggle)
  const listId = toggle.getAttribute('aria-controls')
  const list = listId === null ? null : document.getElementById(listId)
  if (list === null) throw new Error('열었는데 목록이 없다')
  return within(list).queryByRole('menuitem', { name })
}

/**
 * 꺼진 항목이 드는 이유 — `aria-description`. **`title` 이 같은 문장이 아니면 던진다** — 둘은 한 문장이다(`src/panels/toolbar-status.ts`
 * 머리말 «어디에 붙나»). 켜진 항목이면 `null`이다(그때 `title` 도 없다).
 */
export function reasonOf(item: Element): string | null {
  const description = item.getAttribute('aria-description')
  const title = item.getAttribute('title')
  if (description !== title) throw new Error(`«${item.textContent ?? ''}»의 title(${String(title)})과 aria-description(${String(description)})이 다르다`)
  return description
}

/** 그 줄에서 열린 `+` · `…`를 닫는다 — 열린 목록이 다음 걸음의 포커스 · 키를 쥐지 않게. */
function closeRowMenus(row: HTMLElement): void {
  for (const toggle of row.querySelectorAll<HTMLButtonElement>('[aria-haspopup="menu"][aria-expanded="true"]')) fireEvent.click(toggle)
}

/** 고른 줄(또는 준 줄)의 항목 하나가 드는 꺼진 이유(`reasonOf`). 연 목록은 닫는다. 항목이 없으면 던진다. */
export function rowReason(region: HTMLElement, name: string, row: HTMLElement = pickedRow(region)): string | null {
  const reason = reasonOf(rowAction(region, name, row))
  closeRowMenus(row)
  return reason
}

/** 고른 줄(또는 준 줄)의 `+` · `…` 항목 전부의 꺼진 이유 — 항목 글 → 이유(켜졌으면 `null`). 연 목록은 닫는다. */
export function rowReasons(region: HTMLElement, row: HTMLElement = pickedRow(region)): Record<string, string | null> {
  const reasons: Record<string, string | null> = {}
  for (const toggle of row.querySelectorAll<HTMLButtonElement>('[aria-haspopup="menu"]')) {
    if (toggle.getAttribute('aria-expanded') !== 'true') fireEvent.click(toggle)
    const list = document.getElementById(toggle.getAttribute('aria-controls') ?? '')
    if (list === null) throw new Error('열었는데 목록이 없다')
    for (const item of within(list).getAllByRole('menuitem')) reasons[item.textContent ?? ''] = reasonOf(item)
    fireEvent.click(toggle)
  }
  return reasons
}

/** 항목을 고른다 — 옛 `fireEvent.click(툴바 단추)`. */
export function chooseRowAction(region: HTMLElement, name: string, row?: HTMLElement): void {
  fireEvent.click(rowAction(region, name, row))
}

/** 끈 항목인가 — 옛 `단추.disabled`. */
export function isOff(item: HTMLElement): boolean {
  return item.getAttribute('aria-disabled') === 'true'
}

/** 영역 안에서 이름이 `title`인 줄(줄 단추 · 링크의 글자로 찾는다). */
export function rowNamed(region: HTMLElement, title: string): HTMLElement {
  const rows = [...region.querySelectorAll<HTMLElement>('[data-tree-row]')]
  const row = rows.find((candidate) => candidate.firstElementChild?.textContent === title)
  if (row === undefined) throw new Error(`«${title}» 줄이 없다`)
  return row
}

/** 줄 아래에 서는 단추 — 삭제 확인(«정말 삭제합니까?»). 줄 행동이 아니라 트리 영역의 단추다. */
const PANEL_BUTTONS = new Set(['정말 삭제합니까?'])

/** 제목 줄의 뿌리 `+`에만 있는 항목 — 페이지 통째에 더하는 것. */
const ROOT_ITEMS = new Set(['프리셋', '페이지에 추가', '최상위 메뉴 추가'])

/** 영역 제목 줄의 뿌리 `+`에서 항목 하나 — 닫혀 있으면 연다. */
export function rootAction(region: HTMLElement, name: string): HTMLElement {
  const toggle = region.querySelector<HTMLButtonElement>('.wb-shell-region-actions [aria-haspopup="menu"]')
  if (toggle === null) throw new Error('제목 줄에 뿌리 `+`가 없다')
  if (toggle.getAttribute('aria-expanded') !== 'true') fireEvent.click(toggle)
  const list = document.getElementById(toggle.getAttribute('aria-controls') ?? '')
  if (list === null) throw new Error('열었는데 목록이 없다')
  return within(list).getByRole('menuitem', { name })
}

/**
 * 옛 툴바의 `tool(name)` 자리 — 줄 아래 단추면 그 단추, 뿌리 `+`의 항목이면 그것, 아니면 고른 줄의 행동 항목. **고른 줄이 없는데
 * «패턴 넣기»를 물으면 뿌리 `+`의 것이다** — 옛 툴바의 «패턴 넣기»가 선택 없이 뿌리 끝에 꽂던 그 조작이다.
 */
export function treeTool(region: HTMLElement, name: string): HTMLElement {
  if (PANEL_BUTTONS.has(name)) return within(region).getByRole('button', { name })
  if (ROOT_ITEMS.has(name)) return rootAction(region, name)
  if (name === '패턴 넣기' && region.querySelector('.wb-shell-tree-row-picked') === null) return rootAction(region, name)
  return rowAction(region, name)
}

/**
 * **구조 트리 줄의 이름 견주개.** 줄의 접근 이름은 `타입 (별칭) 요약`이다(`src/panels/structure-tree.tsx` — `packages/schema` 의
 * `nodeRowLabel`과 같은 글). 타입으로 노드를 고르던 찾기는 «그 타입으로 시작하는 **줄 단추**»로 찾는다 — `Text` 가 `Text 텍스트` 에도
 * `Text (제목) 안내` 에도 맞고, `Tabs` 는 `Tab` 에 안 맞는다.
 *
 * **줄 단추(`.wb-shell-structure-node`)만 고른다** — 줄 행동의 `+` · `…`(`<줄 글> 추가` · `<줄 글> 더 보기`)도 같은 머리로 시작한다.
 * 같은 타입이 둘이면 `getByRole` 이 «여럿»으로 던진다 — 도우미가 엉뚱한 줄을 고르는 거짓 초록 대신 판이 선다(`./structure-row-name.test.tsx`).
 */
export function structureRowName(type: string): (name: string, element: Element | null) => boolean {
  const head = new RegExp(`^${type.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?: |$)`)
  return (name, element) => element !== null && element.classList.contains('wb-shell-structure-node') && head.test(name)
}

/**
 * 구조 트리 줄의 **타입** — 줄 단추의 첫 글자 마디(`src/panels/structure-tree.tsx` 가 타입을 먼저 쓰고 별칭 · 요약을 조각으로 잇는다).
 * 고를 수 없는 줄(`.wb-shell-structure-broken`)은 글 전부다. 줄 글 전부는 `textContent` 다.
 */
export function structureRowType(row: Element | null | undefined): string | null {
  if (row === null || row === undefined) return null
  if (!row.classList.contains('wb-shell-structure-node')) return row.textContent
  const first = row.firstChild
  return first !== null && first.nodeType === 3 ? first.textContent : row.textContent
}
