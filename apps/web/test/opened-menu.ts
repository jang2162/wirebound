/**
 * **그 상자 안의 단추가 연 행동 메뉴의 목록 상자** — 목록은 `document.body` 로 portal 되어 단추를 품은 상자(머리) 안에 없다
 * (`src/shell/action-menu.tsx` 머리말 «목록은 문서 맨 위 겹에 선다»). 그래서 `within(머리).getByRole('menuitem')` 대신 단추의
 * `aria-controls` 로 찾는다 — 머리말 머리(로그인한 사람)까지 든 상자를 돌려준다. 열린 단추가 하나가 아니면 던진다.
 */
export function openedMenu(container: HTMLElement): HTMLElement {
  const toggles = [...container.querySelectorAll<HTMLElement>('[aria-haspopup="menu"][aria-expanded="true"]')]
  if (toggles.length !== 1) throw new Error(`열린 메뉴 단추가 ${toggles.length} 개다`)
  const list = document.getElementById(toggles[0]!.getAttribute('aria-controls') ?? '')
  const body = list?.closest<HTMLElement>('.wb-shell-action-menu-body') ?? null
  if (body === null) throw new Error('단추가 가리키는 목록이 없다')
  return body
}
