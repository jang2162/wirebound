/**
 * **jsdom에는 `PointerEvent`가 없다.** 이 파일은 그 구멍만 메운다.
 *
 * ## 안 메우면 무엇이 조용히 통과하는가
 *
 * `fireEvent.pointerDown(el, { button: 0, clientX: 265 })`는 `window[EventType] || window.Event`
 * 로 생성자를 고르는데(`@testing-library/dom`의 `createEvent`), jsdom에 `PointerEvent`가 없으니
 * **평범한 `Event`**가 만들어진다. `Event`의 생성자는 `button`·`clientX`를 모르므로 그 값들이
 * **사라진다** — 핸들러가 받는 `event.button`은 `undefined`다.
 *
 * 그래서 `if (event.button !== 0) return` 같은 가드가 **모든 클릭을 막고**, 그 상태에서도
 * *"부르지 않는다"*를 재는 케이스는 전부 초록이다. 다시 재는 법: `shell-resizer.test.tsx`
 * 에서 `installPointerEvents()`를 빼고 돌리면 **긍정 케이스만 죽고 나머지는 통과한다** —
 * 긍정 케이스가 없으면 드래그가 통째로 안 도는 것을 아무도 모른다.
 *
 * ## 왜 `MouseEvent`를 상속하는가
 *
 * 이 셸이 포인터 이벤트에서 읽는 것은 `button`·`clientX`·`clientY`와 `pointerId`다 — 앞의 셋은
 * `MouseEvent`의 것이고, **`pointerId`만 더한다**(끌기 장치가 시작한 포인터의 이벤트만 듣는다 —
 * `src/drag/use-pointer-drag.ts` «시작한 포인터만 듣는다»). 안 더하면 모든 이벤트의 `pointerId`가
 * `undefined`로 같아 «다른 포인터»를 흉내 낼 수 없고 그 가드를 뗀 변조가 산다. 값은 브라우저와 같게
 * init 의 것 · 없으면 0 이다. `pressure` 같은 나머지 포인터 고유 필드는 쓰지 않으므로 흉내 내지 않는다
 * — 흉내 낸 값이 브라우저의 값과 다르면 그 자체가 거짓 초록의 자리가 된다.
 *
 * **`setup.ts`가 아니라 부르는 파일이 켠다.** 전역으로 켜면 포인터를 안 쓰는 파일까지
 * jsdom의 사실이 바뀌고, *"이 스위트는 브라우저가 아니다"*라는 경계가 흐려진다.
 */

/** `MouseEvent`로 흉내 낸 `PointerEvent`. 브라우저에는 진짜가 있으므로 여기서만 쓴다. */
class FakePointerEvent extends MouseEvent {
  readonly pointerId: number

  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init)
    this.pointerId = init.pointerId ?? 0
  }
}

/**
 * 이 파일이 도는 동안 `PointerEvent`를 있게 한다. **이미 있으면 손대지 않는다** — jsdom이
 * 언젠가 구현하면 그쪽이 이긴다.
 *
 * 되돌리는 함수를 돌려주지 않는 것은 vitest가 파일마다 환경을 새로 만들기 때문이다.
 */
export function installPointerEvents(): void {
  const scope = globalThis as unknown as { PointerEvent?: unknown }
  if (scope.PointerEvent === undefined) scope.PointerEvent = FakePointerEvent
}
