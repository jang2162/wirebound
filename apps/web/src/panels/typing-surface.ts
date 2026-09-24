/**
 * *"이 키 이벤트가 **사용자가 값을 넣거나 고르는 표면**에서 났는가"*를 판정하는 곳.
 *
 * **왜 이 물음이 필요한가.** 구조 트리의 키 핸들러는 트리와 툴바를 **함께** 감싸는 상자에
 * 붙어 있고, 그 상자 안에 고르개가 그려진다(`panels/structure-tree.tsx`). 첫 단축키가
 * 수식 키 없는 `Delete`·`Backspace`를 삭제로 받으므로, 출처를 보지 않으면 **이름을
 * 고치다 오타를 지운 사용자가 설계서의 노드를 잃는다.**
 *
 * **순수 함수이고 React를 모른다** — `edit/`의 판정들과 같은 층이다. 그래서 이 상자
 * **밖에** 새 패널이 생겨도 같은 규칙을 한 줄로 가져다 쓸 수 있다.
 *
 * ---
 *
 * # 태그 이름이 아니라 **편집 가능성**으로 가른다
 *
 * `INPUT`·`TEXTAREA`·`SELECT`·`contentEditable` 넷을 태그 이름으로 보면 **그 목록 밖의 표면
 * 둘에서 같은 사고가 난다**(노드 삭제 + 편집 1건):
 *
 * | 표면 | 왜 태그 목록에 없나 | 무엇이 잡나 |
 * |---|---|---|
 * | `<div role="textbox">` | 태그가 `DIV`다 | ㉢ — **ARIA가 편집 표면이라고 말한다** |
 * | shadow root를 든 요소 | 태그가 무엇이든 될 수 있다 | ㉣ — **안을 볼 수 없으면 물러선다** |
 *
 * **`apps/web`에 그런 표면이 없어도 이 규칙을 둔다.** 필요한 것은 *"그 상자에 앞으로 들어올
 * 입력 칸도 함께 지켜지는 규칙"*이고, 태그 목록은 그것을 **절반만** 만족하기 때문이다 — 다음에 무엇이 들어올지가 목록에 달려 있으면 그 목록을
 * 갱신하는 사람이 없는 날 같은 사고가 난다.
 *
 * # 갈래 넷
 *
 * ㉠ **편집 가능하다** — `contenteditable` 속성이 붙었거나(`"false"`는 아니다) 브라우저가
 *    `isContentEditable`로 그렇다고 말한다. **둘 다 보는 이유가 각각이다:** 속성은
 *    **상속된 편집 가능성**을 말해 주지 못하고(자식에는 속성이 없다), `isContentEditable`은
 *    **jsdom이 구현하지 않는다**(속성으로 붙이든 프로퍼티로 대입하든
 *    `undefined`다). 그래서 케이스가 재는 것은 속성 쪽이고, 상속 쪽은 브라우저의 동작을
 *    근거로 남긴다.
 * ㉡ **폼 컨트롤이다** — 값을 타이핑하거나(`input`·`textarea`) 고른다(`select`).
 *    태그 이름이 아니라 **생성자로 본다**: `role`을 덧씌워도, 커스텀 요소가 그것을
 *    상속해도 같은 판정이 나온다.
 * ㉢ **ARIA가 편집 표면이라고 말한다**(`EDITABLE_ROLES`) — 아래 목록의 근거는 *"우리
 *    단축키와 같은 키를 그 역할이 이미 쓴다"*이다.
 * ㉣ **shadow root를 든 요소다** — 그 안에서 난 이벤트는 **호스트로 리타게팅되므로**
 *    입력 칸이었는지 버튼이었는지 밖에서 알 수 없다. 알 수 없으면 물러선다.
 *
 * # 이 판정이 못 보는 것
 *
 * - **자기 키 처리를 하면서 편집 가능성도 role도 선언하지 않는 요소.** `tabindex`만 든
 *   `<div>`에 자체 `keydown`을 단 위젯이 그렇다 — 그런 위젯은 자기 이벤트를 멈추거나
 *   (`stopPropagation`) 위 넷 중 하나를 선언해야 한다.
 * - **다른 document의 요소**(`instanceof`가 거짓이 된다). 이 앱은 iframe을 그리지 않는다 — 그리게 되면 이 구멍이 열린다.
 * - **`mode: 'closed'`인 shadow root.** 그 호스트는 `shadowRoot`가 `null`이라 ㉣가 못
 *   본다(케이스가 그 한계를 값으로 고정한다). 리타게팅은 mode와 무관하게
 *   일어나므로 **구멍이 실재한다** — 다만 그것을 여는 방법이 없다. `attachShadow`를 다시
 *   불러 던지는지 보는 것은 DOM을 바꾸는 판정이라 쓸 수 없다.
 * - **상속된 `contenteditable`은 jsdom으로 재지 못했다**(위 ㉠).
 */

/**
 * 우리 단축키와 같은 키를 이미 쓰는 역할들. **이름이 아니라 키의 충돌이 근거다:**
 *
 * | 역할 | 무엇과 부딪히나 |
 * |---|---|
 * | `textbox` · `searchbox` | 타이핑 — `Delete`·`Backspace`가 글자를 지운다 |
 * | `combobox` · `listbox` · `option` | 목록 이동 — 화살표가 고르는 값을 바꾼다 |
 * | `spinbutton` · `slider` | 값 조절 — 화살표가 값을 바꾼다 |
 */
export const EDITABLE_ROLES: ReadonlySet<string> = new Set([
  'textbox',
  'searchbox',
  'combobox',
  'listbox',
  'option',
  'spinbutton',
  'slider',
])

export function isTypingSurface(target: EventTarget | null): boolean {
  // 요소가 아니면(document·window·다른 realm의 노드) 판정할 것이 없다.
  if (!(target instanceof HTMLElement)) return false

  // ㉠ 편집 가능하다. 속성과 프로퍼티를 **둘 다** 본다(위 머리말의 ㉠).
  const editable = target.getAttribute('contenteditable')
  if (editable !== null && editable !== 'false') return true
  if (target.isContentEditable) return true

  // ㉡ 폼 컨트롤. **생성자로 본다** — 태그 이름 비교는 `role`을 덧씌우거나 커스텀 요소가
  // 상속하는 경우를 놓친다.
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  ) {
    return true
  }

  // ㉢ ARIA가 편집 표면이라고 말한다.
  const role = target.getAttribute('role')
  if (role !== null && EDITABLE_ROLES.has(role)) return true

  // ㉣ 안을 볼 수 없다 — shadow root 안에서 난 이벤트는 호스트로 리타게팅된다.
  return target.shadowRoot !== null
}
