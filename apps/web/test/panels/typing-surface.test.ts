/**
 * `panels/typing-surface.ts` — *"이 키가 값을 넣거나 고르는 표면에서 났는가"*(델타 리뷰 N1).
 *
 * **화면 없이 잰다.** 순수 함수라 요소를 직접 만들어 넣는다 — 이 판정이 **화면에 실제로
 * 걸리는지**는 `structure-keyboard.test.tsx`가 상자에 노드를 붙여 잰다. 둘은 다른 것을
 * 잰다: 여기는 *"무엇을 표면으로 보는가"*, 저기는 *"그 판정이 핸들러를 지나는가"*.
 *
 * **앞 판이 태그 이름으로 갈랐고 그 목록 밖에서 사고가 재현됐다.** 그래서 아래 표는
 * **목록에 없던 것들을 먼저** 적는다.
 */
import { describe, expect, it } from 'vitest'
import { EDITABLE_ROLES, isTypingSurface } from '../../src/panels/typing-surface'

function el(tag: string, attributes: Record<string, string> = {}): HTMLElement {
  const element = document.createElement(tag)
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value)
  return element
}

describe('isTypingSurface', () => {
  it('shadow root를 든 요소는 표면이다 — 안을 볼 수 없다', () => {
    const host = el('div')
    host.attachShadow({ mode: 'open' })

    expect(isTypingSurface(host)).toBe(true)
  })

  /**
   * **한계를 값으로 고정한다.** `mode: 'closed'`면 호스트의 `shadowRoot`가 `null`이라
   * ㉣가 그것을 못 본다 — **리타게팅은 mode와 무관하게 일어나므로 구멍은 실재한다.**
   * 여는 방법이 없어서 남긴 것이지 괜찮아서가 아니다(`attachShadow`를 다시 불러 던지는지
   * 보는 것은 DOM을 바꾸는 판정이라 쓸 수 없다). 이월에 같은 문장을 적었다.
   */
  it('닫힌 shadow root는 잡지 못한다 — 재서 확인한 한계다', () => {
    const host = el('span')
    host.attachShadow({ mode: 'closed' })

    expect(host.shadowRoot).toBeNull()
    expect(isTypingSurface(host)).toBe(false)
  })

  it('contenteditable 속성이 붙은 요소는 표면이다', () => {
    expect(isTypingSurface(el('div', { contenteditable: 'true' }))).toBe(true)
    expect(isTypingSurface(el('div', { contenteditable: '' }))).toBe(true)
    expect(isTypingSurface(el('div', { contenteditable: 'plaintext-only' }))).toBe(true)
  })

  it('contenteditable="false"는 표면이 아니다 — 꺼 둔 것이다', () => {
    expect(isTypingSurface(el('div', { contenteditable: 'false' }))).toBe(false)
  })

  // **역할마다 한 줄이다.** 목록에서 만들므로 역할을 더하거나 빼면 이 케이스가 따라간다 —
  // 수를 산문에 적지 않는다.
  for (const role of EDITABLE_ROLES) {
    it(`role="${role}"인 요소는 표면이다`, () => {
      expect(isTypingSurface(el('div', { role }))).toBe(true)
    })
  }

  it('폼 컨트롤 셋은 태그와 무관하게 표면이다 — 생성자로 본다', () => {
    expect(isTypingSurface(el('input'))).toBe(true)
    expect(isTypingSurface(el('textarea'))).toBe(true)
    expect(isTypingSurface(el('select'))).toBe(true)
  })

  it('role을 덧씌운 입력 칸도 여전히 표면이다', () => {
    // 앞 판은 태그 이름만 봤으므로 이 자리는 그때도 참이었다. **`role`이 판정을 뒤집지
    // 않는 것**을 못박아 둔다 — 갈래 넷 중 하나만 만족해도 표면이다.
    expect(isTypingSurface(el('input', { role: 'button' }))).toBe(true)
  })

  it('평범한 상자와 버튼은 표면이 아니다 — 반대편', () => {
    expect(isTypingSurface(el('div'))).toBe(false)
    expect(isTypingSurface(el('button'))).toBe(false)
    expect(isTypingSurface(el('li'))).toBe(false)
    // 우리 트리의 줄이 그것이다 — 여기가 참이 되면 단축키가 통째로 죽는다.
    expect(isTypingSurface(el('button', { class: 'wb-shell-structure-node' }))).toBe(false)
  })

  it('우리가 쓰지 않는 역할은 표면이 아니다', () => {
    expect(isTypingSurface(el('div', { role: 'button' }))).toBe(false)
    expect(isTypingSurface(el('div', { role: 'treeitem' }))).toBe(false)
  })

  it('요소가 아닌 것에서는 던지지 않고 거짓이다', () => {
    // 이 층의 계약은 *"던지지 않는다"*다 — 구조 트리에 오류 경계가 없다.
    expect(isTypingSurface(null)).toBe(false)
    expect(isTypingSurface(document)).toBe(false)
    expect(isTypingSurface(document.createTextNode('글자') as unknown as EventTarget)).toBe(false)
  })
})
