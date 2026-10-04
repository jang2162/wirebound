/**
 * **좁은 창에서 셸 머리가 창 안에서 줄을 바꾸는가** — 그 값들이 그 칸에 걸리는지를 잰다.
 *
 * 무엇이 깨지는가와 왜 이 값인가는 `src/shell.css`의 `.wb-shell-header` 주석이 갖는다(여기 두 벌로 적지 않는다). 요지: 머리가
 * 창보다 넓게 펼쳐지면 오른쪽 도구가 창 밖에 잘리고, 머리를 창 폭에 묶으면 묶음 단위로 줄을 바꾼다.
 *
 * # 이 자가 못 보는 것
 *
 * - **넘침 0 · 줄 수를 못 낸다.** jsdom에는 레이아웃이 없다. 그 값은 Chrome 에서 잰다 — 창 390 · 480 · 767 에서 머리의 모든 요소가
 *   `0 ≤ left` · `right ≤ 창 폭`인가, 머리 안 글자 노드 하나가 줄을 두 번 이상 쓰는가(`Range.getClientRects`의 서로 다른 `top`).
 * - **어느 묶음이 머리에 있는지는 안 본다.** 묶음이 새로 생기면 여기 한 줄을 더한다 — 빠뜨린 묶음은 Chrome 측정에서만 보인다.
 */
import { afterEach, describe, expect, it } from 'vitest'
import '../src/shell.css'

/**
 * 머리 · 하단 바 안에서 줄을 바꾸는 묶음. 이력은 없다 — 자식이 다 줄어들거나 짧다(`src/shell.css`의
 * `.wb-shell-header` 주석 · `shell-css-picker.test.ts`의 `ONE_LINE`). 에디터 머리의 가운데 무리(`wb-shell-head-tools` — 되돌리기 ·
 * 모드 · 뷰포트 폭 · 줌), 하단 바 자신(좁으면 «컴포넌트»가 통지 아래 줄로 간다 — `src/shell.css`의 `.wb-shell-footer`)과 그 두 무리(통지 · «컴포넌트»), 셸 밖
 * 화면 머리의 왼쪽 무리(`wb-shell-page-lead` — 로고 · 제목 · `shell/page-head.tsx`), 하단 컴포넌트 판의 머리 줄(`wb-shell-palette-head` —
 * 갈래 탭 · 검색 · 거절 문장)이 든다.
 */
const WRAPPING_GROUPS = [
  'wb-shell-head-tools',
  'wb-shell-footer',
  'wb-shell-footer-notices',
  'wb-shell-footer-tools',
  'wb-shell-page-lead',
  'wb-shell-palette-head',
] as const

function styleOf(className: string): CSSStyleDeclaration {
  const box = document.createElement('div')
  box.className = className
  document.body.appendChild(box)
  return getComputedStyle(box)
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('좁은 창의 셸 머리', () => {
  it('카나리아 — 이 파일이 진짜 shell.css 를 지난다', () => {
    const style = styleOf('wb-shell-header')
    expect(style.flexWrap).toBe('wrap')
    expect(style.gap).toBe('24px')
  })

  it('머리는 창보다 넓어지지 않는다 — 안쪽 여백까지 창 폭 안이다', () => {
    const style = styleOf('wb-shell-header')
    expect(style.maxWidth).toBe('100vw')
    expect(style.boxSizing).toBe('border-box')
  })

  it.each(WRAPPING_GROUPS)('%s 는 안에서 줄을 바꾼다', (className) => {
    expect(styleOf(className).flexWrap).toBe('wrap')
  })
})
