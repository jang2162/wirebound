/**
 * **jsdom의 `fireEvent.click`은 포커스를 옮기지 않는다.** 이 파일은 실브라우저의 클릭이
 * 포커스에 하는 일 **하나만** 흉내 낸다.
 *
 * ## 안 흉내 내면 무엇이 갈리는가
 *
 * 실브라우저의 클릭은 `mousedown` → (포커스 이동) → `mouseup` → `click`이다. 포커스 이동이
 * `click`보다 **먼저**이고, 그때 떠나는 입력이 blur를 낸다. 속성 패널은 **blur에 커밋**하므로
 * (`panels/controls/text-control.tsx`의 D5), 치던 중에 탭·모드·다른 노드·다른 페이지를
 * 누르면 **선택이 바뀌기 전에 원래 노드로 커밋된다**(8차 Chrome 실측 — `panels/
 * property-panel.tsx`의 `PropControl` 주석에 표가 있다).
 *
 * `fireEvent.click`은 그 가운데 `click`만 낸다. 그래서 jsdom에서는 같은 조작이 **요청 0건 ·
 * 친 글자 소실**로 나오고, 7차는 그 값을 «속성 패널도 탭을 누르면 친 글자를 잃는다»로 적었다
 * (jsdom 값을 제품의 행동처럼 적은 것이었다).
 *
 * ## 무엇을 흉내 내나 — Chrome 에서 잰 값 그대로
 *
 * 1. `mousedown`을 낸다. **누가 `preventDefault()`를 걸었으면 포커스를 안 옮긴다** — 브라우저가
 *    그렇게 하고, 이 흉내가 잡으려는 회귀가 바로 그것이다(누르면 포커스를 빼앗지 않게 하려고
 *    `mousedown`을 막는 것은 흔한 손질이고, 그 순간 blur 커밋이 사라진다).
 * 2. 누른 요소에서 가장 가까운 **마우스로 포커스를 받는 요소**로 포커스를 옮긴다. 없으면
 *    지금 포커스를 놓는다(`BODY`로). Chrome 실측: 탭·모드·트리 버튼 → `focusout INPUT → BUTTON`,
 *    캔버스의 `<div>` → `→ null`, 메뉴의 링크 → `→ A`.
 * 3. `mouseup`, `click`.
 *
 * ## 실패 방향 — 이 흉내가 거짓 초록을 내는 자리
 *
 * **«커밋된다»고 말하는데 실제로는 안 되는 쪽**이 위험하다. 알려진 자리:
 *
 * - **Chrome 만 쟀다.** Safari 는 클릭에 버튼을 포커스하지 않는다고 알려져 있다 — 그때도
 *   포커스는 `BODY`로 가 blur 가 나야 하므로 **커밋 여부는 같다고 본다. 잰 값은 아니다.**
 *   그리고 «버튼에 포커스가 있다»에 기대는 동작(예: 버튼의 Esc — `panels/menu-toolbar.tsx`)
 *   을 이 흉내로 재면 Safari 에 대해서는 거짓 초록이다. **이 흉내로 그런 것을 재지 않는다.**
 * - **CSS 를 모른다.** `pointer-events: none`이면 브라우저의 클릭은 그 요소에 안 닿는데, 이
 *   흉내는 준 요소에 그대로 낸다.
 * - **꺼진(`disabled`) 요소는 흉내 내지 않는다 — 던진다.** 꺼진 버튼을 눌렀을 때 포커스가 어디로
 *   가는지는 재지 않았다.
 *
 * **`setup.ts`에 넣지 않는다** — 부르는 케이스만 쓴다. `fireEvent.click`을 통째로 바꾸면 이
 * 스위트 전체의 사실이 바뀌고, *"jsdom 은 브라우저가 아니다"*라는 경계가 흐려진다
 * (`pointer-events.ts`와 같은 판단).
 */
import { act, fireEvent } from '@testing-library/react'

/**
 * 마우스로 포커스를 받는 요소. `tabindex="-1"`도 받는다(키보드로만 못 온다). 링크는 `href`가
 * 있어야 받는다.
 */
const MOUSE_FOCUSABLE =
  'a[href], button, input, select, textarea, [tabindex], [contenteditable=""], [contenteditable="true"]'

function isDisabled(element: Element): boolean {
  return (element as HTMLButtonElement).disabled === true || element.closest('fieldset:disabled') !== null
}

/** 실브라우저의 클릭 하나. 위 머리말의 세 걸음이다. */
export function clickAsBrowser(target: Element): void {
  if (isDisabled(target)) {
    throw new Error('꺼진 요소의 클릭은 흉내 내지 않는다 — 실브라우저에서 재지 않았다')
  }

  const proceed = fireEvent.mouseDown(target)
  if (proceed) {
    const focusable = target.closest(MOUSE_FOCUSABLE)
    act(() => {
      if (focusable instanceof HTMLElement) {
        focusable.focus()
      } else if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur()
      }
    })
  }
  fireEvent.mouseUp(target)
  fireEvent.click(target)
}
