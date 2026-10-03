/**
 * **jsdom의 `fireEvent.click`은 포커스를 옮기지 않는다.** 이 파일은 실브라우저의 클릭이
 * 포커스에 하는 일 **하나만** 흉내 낸다.
 *
 * ## 안 흉내 내면 무엇이 갈리는가
 *
 * 실브라우저의 클릭은 `pointerdown` → `mousedown` → (포커스 이동) → `pointerup` → `mouseup` →
 * `click`이다. 포커스 이동이 `click`보다 **먼저**이고, 그때 떠나는 입력이 blur를 낸다. 속성 패널은 **blur에 커밋**하므로
 * (`panels/controls/text-control.tsx` 머리말), 치던 중에 탭·모드·다른 노드·다른 페이지를
 * 누르면 **선택이 바뀌기 전에 원래 노드로 커밋된다**(Chrome 실측 — `panels/
 * property-panel.tsx`의 `PropControl` 주석에 표가 있다).
 *
 * `fireEvent.click`은 그 가운데 `click`만 낸다. 그래서 jsdom에서는 같은 조작이 **요청 0건 ·
 * 친 글자 소실**로 나온다. 그 값을 «속성 패널도 탭을 누르면 친 글자를 잃는다»로 적으면
 * jsdom 값을 제품의 행동처럼 적는 것이다.
 *
 * ## 무엇을 흉내 내나 — Chrome 에서 잰 값 그대로
 *
 * 1. `pointerdown`을 낸다. **누가 `preventDefault()`를 걸었으면 `mousedown`·`mouseup`을 안 내고
 *    포커스도 안 옮긴다** — Chrome 이 그렇게 한다(Pointer Events 의 «호환 마우스 이벤트»가 막힌다.
 *    `click`은 그대로 난다). 이 앱에 이미 그 꼴이 있다 — `shell/shell-resizer.tsx`가
 *    `onPointerDown`에서 막는다.
 * 2. `mousedown`을 낸다. **누가 `preventDefault()`를 걸었으면 포커스를 안 옮긴다.**
 * 3. 누른 요소에서 가장 가까운 **마우스로 포커스를 받는 요소**로 포커스를 옮긴다. 없으면
 *    지금 포커스를 놓는다(`BODY`로). Chrome 실측: 탭·모드·트리 버튼 → `focusout INPUT → BUTTON`,
 *    캔버스의 `<div>` → `→ null`, 메뉴의 링크 → `→ A`.
 * 4. `pointerup`, (1이 막히지 않았으면) `mouseup`, `click`.
 *
 * **1·2가 이 흉내가 잡으려는 회귀다** — «누르면 포커스를 빼앗지 않게» 하려고 누르는 이벤트를
 * 막는 것은 흔한 손질이고(끌어서 조절하는 손잡이·캔버스 패닝), 그 순간 blur 커밋이 사라진다(누름이 위젯을 내리면 `onLeave`가
 * 대신 커밋하지만 페이지를 옮기는 누름은 아니다 — `panels/property-panel.tsx`의 `useLeftoverCommit`). 2만 흉내 내고
 * 1(`pointerdown`)을 모르면 `onPointerDown`에 `preventDefault()`를 심은 자리에서도 **흉내는 blur 를 낸다.** 흉내가 그렇게 물러나는 것을
 * 잡는 것이 흉내 자신의 검사 둘이다(`panels/property-panel.test.tsx`의 «… 막으면 blur 가 없다» 둘).
 *
 * **`pointerdown`은 `MouseEvent`로 만든다** — jsdom 에는 `PointerEvent`가 없어
 * `fireEvent.pointerDown`은 `button`을 버린 평범한 `Event`를 낸다(`pointer-events.ts`의 머리말).
 * 그러면 `if (event.button !== 0) return`으로 시작하는 핸들러(`ShellResizer`)가 아무것도 안 막는다.
 *
 * ## 실패 방향 — 이 흉내가 거짓 초록을 내는 자리
 *
 * **«커밋된다»고 말하는데 실제로는 안 되는 쪽**이 위험하다. 알려진 자리:
 *
 * - **Chrome 만 쟀다.** Safari 는 클릭에 버튼을 포커스하지 않는다고 알려져 있다 — 그때도
 *   포커스는 `BODY`로 가 blur 가 나야 하므로 **커밋 여부는 같다고 본다. 잰 값은 아니다.**
 *   그리고 «버튼에 포커스가 있다»에 기대는 동작(예: 삭제 확인 단추의 Esc — `panels/menu-tree.tsx`의 `RemoveConfirm`)
 *   을 이 흉내로 재면 Safari 에 대해서는 거짓 초록이다. **이 흉내로 그런 것을 재지 않는다.**
 * **Chrome 과 댄 결과** — 위젯 다섯 × 갈래 다섯(탭·모드·트리·캔버스·다른 페이지)의 25칸과
 * 흉내를 흔드는 갈래 열둘. 25칸은 나간 편집(수·페이지·경로·값) · 첫 focusout · 활성 요소 · 돌아와
 * 본 값 · 서버 값이 **전부 같다.** 갈래 열둘 가운데 **«커밋된다»고 말하는데 Chrome 은 안 하는
 * 칸은 0이다** — 탭·캔버스의 `pointerdown` 막음과 리사이저 클릭도 둘 다 blur 가 없어 같다(탭 · 캔버스는 위젯이 내려가며
 * `onLeave`로 커밋된다 — 흉내와 Chrome 이 같은 길이다. 그 커밋 수는 Chrome 에 다시 대지 않았다).
 * 남은 갈림은 아래 넷이고 **어느 것도 커밋 여부가 갈리지 않는다:**
 *
 * - **CSS 를 모른다.** `pointer-events: none`이면 브라우저의 클릭은 그 요소에 안 닿는데, 이
 *   흉내는 준 요소에 그대로 낸다. Chrome 실측: 캔버스의 선택 아웃라인(`pointer-events: none`)
 *   자리를 누르면 그 아래 노드(`P`)에 닿아 선택이 그대로이고, 이 흉내에 아웃라인을 주면 선택이
 *   풀린다 — 커밋은 둘 다 1건이다.
 * - **라벨의 활성화를 모른다.** `<label>`을 누르면 Chrome 은 `click`의 기본 동작으로 그 칸에
 *   포커스를 다시 준다 — 활성 요소가 `TEXTAREA`/`SELECT`로 끝난다. 이 흉내는 `BODY`로 끝난다.
 *   커밋은 둘 다 1건 · `focusout → null`이다.
 * - **jsdom 은 포커스된 요소가 DOM 에서 빠질 때 blur 를 안 낸다** — 이 흉내의 몫이 아니다. 누르는
 *   이벤트가 막혀 포커스가 안 옮겨 간 채 선택·탭이 바뀌면 Chrome 은 칸이 빠질 때
 *   `focusout TEXTAREA → null`을 내고 이 흉내(jsdom)는 안 낸다. **blur 커밋은 둘 다 없다** — React 는
 *   빠지는 요소의 `onBlur`를 부르지 않는다. 커밋이 나면 내려가는 위젯의 `onLeave`다(코드로 판단한 것이다 — Chrome 에서 따로 재지 않았다).
 * - **꺼진(`disabled`) 요소는 흉내 내지 않는다 — 던진다.** Chrome 실측: 꺼진 버튼(«다시
 *   실행»)을 누르면 **`pointerdown`·`pointerup`만** 그 버튼에 닿고 `mousedown`·`mouseup`·`click`은
 *   안 닿으며, 포커스는 놓인다(`focusout TEXTAREA → null` · 커밋 1건 · 활성 요소 `BODY`). 그
 *   버튼의 `pointerdown`을 막았을 때 포커스가 어떻게 되는지는 재지 않아 흉내를 짓지 않았다.
 * - 키(Enter·Tab·Esc)·끌기·창 닫기·뒤로 가기는 이 흉내의 밖이다.
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

/**
 * 마우스 주 버튼의 포인터 이벤트 하나를 낸다. **`MouseEvent`로 만든다**(위 머리말) — `button`이
 * 살아야 `button !== 0`을 보는 핸들러가 막을지 말지를 제대로 고른다.
 */
function pointer(target: Element, type: 'pointerdown' | 'pointerup'): boolean {
  const view = target.ownerDocument.defaultView
  if (view === null) throw new Error('창이 없는 문서의 요소다')
  return fireEvent(
    target,
    new view.MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      button: 0,
      buttons: type === 'pointerdown' ? 1 : 0,
    }),
  )
}

/** 누른 요소에서 가장 가까운 마우스 포커스 요소로 포커스를 옮긴다. 없으면 놓는다. */
function moveFocus(target: Element): void {
  const focusable = target.closest(MOUSE_FOCUSABLE)
  act(() => {
    if (focusable instanceof HTMLElement) {
      focusable.focus()
    } else if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
  })
}

/** 실브라우저의 클릭 하나. 위 머리말의 네 걸음이다. */
export function clickAsBrowser(target: Element): void {
  if (isDisabled(target)) {
    throw new Error('꺼진 요소의 클릭은 흉내 내지 않는다 — 어느 이벤트가 닿는지 실브라우저에서 재지 않았다')
  }

  // 1. `pointerdown`이 막히면 `mousedown`·`mouseup`이 안 나고 포커스도 안 옮긴다(Chrome).
  const pointerProceeds = pointer(target, 'pointerdown')
  // 2. `mousedown`이 막히면 포커스를 안 옮긴다.
  if (pointerProceeds && fireEvent.mouseDown(target)) moveFocus(target)
  pointer(target, 'pointerup')
  if (pointerProceeds) fireEvent.mouseUp(target)
  fireEvent.click(target)
}
