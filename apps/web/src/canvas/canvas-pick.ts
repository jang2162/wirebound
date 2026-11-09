/**
 * **캔버스 문서의 요소가 어느 노드로 골라지는가** — 누름(`./canvas.tsx` 의 표면 `onClick`)과 사각형(`./use-canvas-marquee.ts` 의 `drawnNodes`)이 함께
 * 부르는 한 판정이다(설계서 §9 «선택 — 고르는 법»). 두 벌로 지으면 누른 칸과 덮은 칸이 다른 노드를 고른다.
 */

/** 되풀이 줄의 사본이 싣는 원본 id(`packages/renderer/src/render.tsx`). */
export const COPY_OF_ATTR = 'data-wb-copy-of'
/** 그리드 열의 몸 칸(셀 틀 · 번호)이 싣는 열 id — SDK 기본 그리드 뷰의 `columnOf`. */
export const COLUMN_OF_ATTR = 'data-wb-column-of'

/**
 * 그 요소에서 가장 가까운 노드의 id. 노드 위가 아니면 `null`이다 — 빈 자리를 누르면 선택이 풀린다. `body` 까지만 올라간다 — iframe 밖(표면의 알림 ·
 * 배너)을 누르면 노드가 없다.
 *
 * **빈 `data-wb-id`는 건너뛴다.** 렌더러의 모양 가드가 흡수한 폴백은 id를 문자열로 읽지 못한 노드라 빈 문자열을 단다(`packages/renderer/src/fallback.tsx`).
 * 그것을 그대로 넣으면 스토어에는 선택이 있는데 가리키는 노드는 없는 상태가 된다.
 *
 * **그리드의 몸 칸은 그 줄의 행이다** — 셀 틀 · 번호 칸(`data-wb-column-of` — SDK 기본 그리드 뷰)과 그 안의 사본 노드는 칸을 품은 줄의 행(`GridRow` —
 * 되풀이 N 줄은 다 같은 행)이다. 셀 틀은 행마다 같은 꼴이라 열을 고치는 길은 머리 칸 · 첫 셀 틀의 원본 노드로 남고, 행의 «행 내용» 은 캔버스에서 그
 * 행을 골라야 선다. **첫 셀 틀의 원본 노드(`data-wb-id`)는 그 노드다** — 칸보다 먼저 만나 거기서 끝난다.
 *
 * **그 밖의 사본은 원본이다** — 커스텀 행 제 칸의 사본 · 사본 줄의 고름 칸(줄 `tr` 의 사본)은 원본이다. 가장 가까운 `data-wb-id` 로 오르면 그리드가
 * 골라져 이어진 Delete 가 그리드째 지웠다(`docs/superpowers/plans/2026-10-25-rv-gr-report.md` H1). 그래서 사본을 만나도 바로 끝내지 않고 칸이 있는지
 * 더 오른 뒤, 칸이 없으면 처음 만난 사본의 원본이다. 고른 뒤의 판정(남의 잠금)은 원본을 누른 것과 같다.
 */
export function nodeIdAt(target: EventTarget | null, body: HTMLElement): string | null {
  // `instanceof Element` 를 쓰지 않는다 — iframe 안의 요소는 iframe 창의 `Element` 로 만들어져 호스트 창의 것과 다르다.
  let element = isElement(target) ? target : null
  let copy: string | null = null

  while (element !== null && body.contains(element)) {
    const column = filled(element.getAttribute(COLUMN_OF_ATTR))
    if (column !== null) return lineOf(element, body) ?? column
    const id = filled(element.getAttribute('data-wb-id'))
    if (id !== null) return copy ?? id
    copy ??= filled(element.getAttribute(COPY_OF_ATTR))
    element = element.parentElement
  }

  return copy
}

/**
 * 그 요소가 든 그리드 몸 칸이 선 줄의 행 id — 요소 자신이 칸이어도 된다. 칸 밖이면 `null`. 사각형이 «그 줄의 행이 이미 든 판» 을 가르는 데 쓴다
 * (`./canvas-marquee.ts` 의 `MarqueeNode.line`).
 */
export function lineAt(element: Element, body: HTMLElement): string | null {
  for (let at: Element | null = element; at !== null && body.contains(at); at = at.parentElement) {
    if (filled(at.getAttribute(COLUMN_OF_ATTR)) !== null) return lineOf(at, body)
  }
  return null
}

/** 그리드 몸 칸을 품은 줄의 행 id — 첫 줄은 행 뿌리(`data-wb-id`), 되풀이 줄은 그 사본(`data-wb-copy-of`)이다. 줄을 못 찾으면(테마가 줄에 안 달면) `null`. */
function lineOf(cell: Element, body: HTMLElement): string | null {
  for (let element = cell.parentElement; element !== null && body.contains(element); element = element.parentElement) {
    const id = filled(element.getAttribute('data-wb-id')) ?? filled(element.getAttribute(COPY_OF_ATTR))
    if (id !== null) return id
  }
  return null
}

/** 빈 id 는 없는 것이다 — 렌더러의 모양 가드가 흡수한 폴백은 빈 `data-wb-id` 를 단다(`packages/renderer/src/fallback.tsx`). */
function filled(value: string | null): string | null {
  return value === null || value === '' ? null : value
}

function isElement(target: EventTarget | null): target is Element {
  return target !== null && (target as Node).nodeType === 1
}
