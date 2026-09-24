/**
 * **셸 머리의 팝오버를 어느 쪽에 붙이나**(`src/shell/use-popover-side.ts`).
 *
 * jsdom 에는 레이아웃이 없어 상자가 모두 0 이다 — 그래서 **잰 치수를 심는다**: `getBoundingClientRect`를 클래스 이름으로
 * 갈라 돌려준다(토글을 감싼 상자의 오른쪽 끝 · 떠 있는 상자의 폭). 실브라우저 값(Chrome · 높이 900)은 그 파일 머리말이
 * 든다 — 1280 폭에서 내보내기 토글이 다음 줄 왼쪽(x 16)에 서고 380px 상자가 x −353 에 섰다.
 *
 * 두 팝오버를 **실물로** 연다 — 판정은 훅 하나지만 상자에 `ref`와 `data-side`를 싣는 것은 패널마다다. 한쪽이 빠뜨리면
 * 그 패널만 옛 자리에 선다.
 */
import { act, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { openPage, pageDoc } from '../editor-harness'
// **진짜 셸 CSS 를 문서에 싣는다** — 아래 «붙일 쪽의 규칙» 이 값으로 읽는다(`shell-css-wrap.test.ts`와 같은 기전).
import '../../src/shell.css'

/** 클래스 이름 → 심을 치수. 없는 것은 0 상자다. */
function stubRects(rects: Record<string, Partial<DOMRect>>): void {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const hit = Object.keys(rects).find((name) => this.classList.contains(name))
    const rect = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, ...(hit ? rects[hit] : {}) }
    return { ...rect, toJSON: () => rect } as DOMRect
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

const PANELS = [
  { toggle: '내보내기', root: 'wb-shell-export', body: 'wb-shell-export-body', width: 380 },
  { toggle: '스냅샷', root: 'wb-shell-snapshots', body: 'wb-shell-snapshots-body', width: 520 },
] as const

function body(className: string): HTMLElement {
  const found = document.querySelector<HTMLElement>(`.${className}`)
  if (found === null) throw new Error(`${className} 이 없습니다`)
  return found
}

describe.each(PANELS)('$toggle 상자', (panel) => {
  it('토글이 줄 왼쪽에 서 자리가 없으면 왼쪽 끝에 붙는다', async () => {
    stubRects({ [panel.root]: { left: 16, right: 76 }, [panel.body]: { width: panel.width } })
    await openPage(pageDoc({ id: 'n-root', type: 'Page', children: [] }))

    fireEvent.click(screen.getByRole('button', { name: panel.toggle }))

    expect(body(panel.body).dataset.side).toBe('start')
  })

  it('토글 왼쪽에 상자 폭만큼 자리가 있으면 오른쪽 끝에 붙는다 — 넓은 화면의 자리', async () => {
    stubRects({ [panel.root]: { left: 1379, right: 1424 }, [panel.body]: { width: panel.width } })
    await openPage(pageDoc({ id: 'n-root', type: 'Page', children: [] }))

    fireEvent.click(screen.getByRole('button', { name: panel.toggle }))

    expect(body(panel.body).dataset.side).toBe('end')
  })
})

/** 열린 채 창 폭이 바뀌면 다시 잰다 — 머리가 다시 한 줄이 되면 토글이 오른쪽 끝으로 돌아간다. */
it('열린 채 창 폭이 바뀌면 다시 고른다', async () => {
  const anchor = { left: 16, right: 76 }
  stubRects({ 'wb-shell-export': anchor, 'wb-shell-export-body': { width: 380 } })
  await openPage(pageDoc({ id: 'n-root', type: 'Page', children: [] }))
  fireEvent.click(screen.getByRole('button', { name: '내보내기' }))
  expect(body('wb-shell-export-body').dataset.side).toBe('start')

  anchor.right = 1424
  act(() => {
    window.dispatchEvent(new Event('resize'))
  })

  expect(body('wb-shell-export-body').dataset.side).toBe('end')
})

/**
 * **붙일 쪽의 규칙이 그 상자에 걸린다** — 문서에 실린 `shell.css`를 지나 `getComputedStyle`로 읽는다(값으로 잰다 —
 * `shell-css-wrap.test.ts` 머리말). jsdom 에는 레이아웃이 없어 상자가 화면 안에 드는지는 못 잰다 — 그 값은 실브라우저의
 * 것이다(`use-popover-side.ts` 머리말).
 */
describe.each(PANELS)('$body 의 붙일 쪽 규칙', (panel) => {
  function styleOf(side: string | null): CSSStyleDeclaration {
    const box = document.createElement('div')
    box.className = panel.body
    if (side !== null) box.dataset.side = side
    document.body.appendChild(box)
    return getComputedStyle(box)
  }

  it("기본은 오른쪽 끝이다 — 카나리아(이 파일이 진짜 shell.css 를 지난다)", () => {
    expect(styleOf('end').right).toBe('0px')
  })

  it("data-side='start' 면 왼쪽 끝에 붙고 오른쪽은 풀린다", () => {
    const style = styleOf('start')
    expect(style.left).toBe('0px')
    expect(style.right).toBe('auto')
  })
})
