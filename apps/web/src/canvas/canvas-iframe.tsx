/**
 * 캔버스 문서를 그리는 same-origin iframe. 목적은 **문서 분리**다 — 테마 CSS 가 에디터를 칠하지 않고,
 * 테마의 `@media` 가 뷰포트 프리셋 폭으로 판정된다(설계 spec 「캔버스 iframe」). 보안 격리가 아니다.
 *
 * 문서 트리는 호스트의 React 로 그려 portal 로 iframe body 에 붙인다. 그래서 React 이벤트는 호스트 트리로
 * 버블링하고(React 가 portal 의 컨테이너에도 리스너를 단다), 뷰 코드의 전역 `window` 는 호스트 창이다 —
 * iframe 창은 SDK 의 `useWindow` 로 받는다.
 *
 * 높이는 문서를 따라간다(안쪽 스크롤 없음). 그래야 iframe 안의 좌표가 곧 표면의 좌표이고, 선택 외곽선 · 마커를
 * 호스트 문서에 그대로 얹을 수 있다.
 */
import { useLayoutEffect, useState, type ReactElement, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export interface CanvasFrame {
  document: Document
  window: Window
}

/**
 * iframe 문서의 head 에 싣는 시트 하나. `css` 는 `<style>`, `href` 는 `<link rel=stylesheet>` 다 — 테마 번들의 `theme.css` 는 `<link>` 여야
 * 한다: 그 안의 자산 경로(`./assets/…`)가 파일 URL 을 기준으로 풀려야 한다(spec 「`.wbtheme` 파일」).
 */
export type CanvasSheet = { readonly id: string; readonly css: string } | { readonly id: string; readonly href: string }

/** 레이아웃이 없는 jsdom 에서 다시 재게 하는 신호. 실브라우저에서는 `ResizeObserver` 가 부른다. */
const MEASURE_EVENT = 'wb-canvas-measure'

/**
 * link 시트가 실리는 동안 캔버스 문서의 전이를 멈추는 시트. `@layer` 안의 `!important` 는 층 밖(테마 시트)의 `!important` 를 이긴다 —
 * 테마가 `transition` 에 `!important` 를 실어도 멈춘다. 층 이름은 head 맨 앞에서 처음 선언되므로 테마가 층을 써도 이 층이 먼저다(케이스는
 * `!important` 없는 system-admin 으로만 잰다 — `build-test/canvas-iframe.test.ts` 「늦게 온 테마 시트」).
 */
const HOLD_ATTR = 'data-wb-hold'
const HOLD_CSS = '@layer wb-hold { *, *::before, *::after { transition: none !important; } }'

/** 문서마다 아직 안 실린 link 시트. */
const pendingLinks = new WeakMap<Document, Set<HTMLLinkElement>>()

/** 문서가 비었을 때의 높이. 빈 캔버스도 누를 자리가 있어야 선택을 풀 수 있다. iframe 은 이 값과 문서 높이의 큰 쪽이다. */
export const MIN_HEIGHT = 320

export function CanvasIframe(props: {
  /**
   * iframe 문서의 head 에 **배열 차례대로** 싣는 시트. id 는 `data-wb-style` 값이다. 차례가 곧 겹침의 차례다 — 뒤의 것이 같은 특이도에서
   * 이긴다(캔버스는 `base` → `theme` → `tokens` — `canvas/canvas.tsx`).
   */
  styles: readonly CanvasSheet[]
  width: number
  children: (frame: CanvasFrame) => ReactNode
  onFrame?: (frame: CanvasFrame | null) => void
  /** iframe 문서의 높이를 다시 잰 뒤 불린다 — 노드 상자가 바뀌었을 수 있다. */
  onResize?: () => void
  /**
   * 문서 밖(iframe 의 `body` · `html` 자체)을 눌렀다. **React 의 `onClick` 으로는 안 온다** — portal 의 컨테이너(body)는
   * React 가 그린 요소가 아니라서, 그것을 누른 클릭은 React 트리의 어느 핸들러에도 닿지 않는다(jsdom · 실브라우저 같다).
   */
  onBackgroundClick?: (event: MouseEvent) => void
  /**
   * iframe 의 클래스 · 이름. 없으면 캔버스의 것(`wb-shell-canvas-iframe` · «캔버스 문서»)이다. **캔버스가 아닌 문서는 제 것을 준다** — 셸 ·
   * 시험이 캔버스 iframe 을 그 클래스로 찾아(`build-test/editor-stack.ts` 의 `canvasFrame`), 같은 화면의 다른 iframe(하단 판의 축소판)이 그
   * 클래스를 달면 둘이 잡힌다.
   */
  className?: string
  title?: string
}): ReactElement {
  const [iframe, setIframe] = useState<HTMLIFrameElement | null>(null)
  const [frame, setFrame] = useState<CanvasFrame | null>(null)
  const [height, setHeight] = useState(MIN_HEIGHT)
  const { onFrame, onResize, onBackgroundClick } = props

  useLayoutEffect(() => {
    const doc = iframe?.contentDocument
    const win = iframe?.contentWindow
    if (!doc || !win) return
    // about:blank 은 브라우저마다 빈 body 를 갖기도, 안 갖기도 한다. body 를 가진 판(Chromium)은 doctype 이 없어 quirks 모드
    // (`BackCompat`)다 — 번들 · PPTX(표준 모드)와 레이아웃이 갈린다(quirks 의 `form` 아래 1em · 줄 높이 셈 · 백분율 높이). 그 판도
    // 다시 써서 늘 표준 모드로 세운다(`build-test/theme-system-review.test.ts` 「캔버스 = 번들」).
    if (doc.body === null || doc.compatMode !== 'CSS1Compat') {
      doc.open()
      doc.write('<!doctype html><html><head></head><body></body></html>')
      doc.close()
    }
    doc.body.style.margin = '0'
    const next = { document: doc, window: win }
    setFrame(next)
    onFrame?.(next)
    return () => onFrame?.(null)
    // onFrame 은 iframe 이 설 때의 것을 쓴다 — 바뀔 때마다 frame 을 다시 알리면 받는 쪽이 null 을 한 번 거친다.
  }, [iframe])

  useLayoutEffect(() => {
    if (frame === null) return
    holdTransitions(frame, syncSheets(frame.document, props.styles))
  }, [frame, props.styles])

  /**
   * **iframe 안의 폼 제출은 문서를 떠나지 않는다.** 폼 안에 진짜 제출 단추가 있으면(기본 `type` 이 `submit` 인 `<button>`) 브라우저가
   * iframe 을 `about:blank?` 로 옮겨 캔버스가 빈다 — 호스트 주소는 그대로라 무엇이 일어났는지 안 보인다. 렌더러의 `submit` 핸들러는
   * 규칙이 있을 때만 막으므로(`packages/renderer/src/render.tsx` 의 `handlersFor`) 편집 모드 · 규칙 없는 폼은 여기서 막는다.
   *
   * **캡처 단계에서 기본 동작만 막고 전파는 둔다** — React 의 `submit` 핸들러(규칙)는 그대로 불린다
   * (`build-test/canvas-iframe-submit.test.ts`).
   */
  useLayoutEffect(() => {
    if (frame === null) return
    const doc = frame.document
    const stay = (event: Event) => event.preventDefault()
    doc.addEventListener('submit', stay, true)
    return () => doc.removeEventListener('submit', stay, true)
  }, [frame])

  useLayoutEffect(() => {
    if (frame === null || onBackgroundClick === undefined) return
    const doc = frame.document
    const listener = (event: Event) => {
      if (event.target === doc.body || event.target === doc.documentElement) onBackgroundClick(event as MouseEvent)
    }
    doc.addEventListener('click', listener)
    return () => doc.removeEventListener('click', listener)
  }, [frame, onBackgroundClick])

  useLayoutEffect(() => {
    if (frame === null) return
    const Observer = (frame.window as unknown as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver
    let observer: ResizeObserver | null = null
    const measure = () => {
      setHeight(Math.max(MIN_HEIGHT, naturalHeight(frame, iframe)))
      onResize?.()
      // `body` 가 뷰포트 단위 최소 높이를 가지면 내용이 줄어도 `body` 크기가 안 변해 관찰자가 안 깬다 — 그 안의 문서 뿌리도 함께 본다(이미 보는 요소는 그대로다).
      for (const child of Array.from(frame.document.body.children)) observer?.observe(child)
    }
    observer = Observer ? new Observer(measure) : null
    measure()
    observer?.observe(frame.document.body)
    frame.window.addEventListener(MEASURE_EVENT, measure)
    return () => {
      observer?.disconnect()
      frame.window.removeEventListener(MEASURE_EVENT, measure)
    }
  }, [frame, iframe, onResize])

  // portal 을 iframe **앞에** 둔다. 언마운트는 형제 순서대로 걷는데, iframe 을 먼저 떼면 jsdom 은 그 문서를 버려
  // portal 의 자식을 뗄 자리가 없어진다(`NotFoundError`). 실브라우저에서도 떼인 iframe 의 문서를 만지지 않는 편이 낫다.
  return (
    <>
      {frame !== null && createPortal(props.children(frame), frame.document.body)}
      <iframe
        ref={setIframe}
        className={props.className ?? 'wb-shell-canvas-iframe'}
        title={props.title ?? '캔버스 문서'}
        style={{ width: `${props.width}px`, height: `${height}px` }}
      />
    </>
  )
}

/**
 * **문서 내용의 높이 — iframe 자신의 높이에 묶이지 않는 값으로 잰다.** 뿌리의 `scrollHeight` 는 뷰포트(= 지금 iframe 높이) 아래로 안 내려가
 * 늘기만 하고 줄지 않는다 — 그것으로 재면 끌기의 미리보기가 문서를 한 번 키운 뒤 놓거나 취소해도 iframe 이 그 높이로 남아 문서 끝에 빈 꼬리가
 * 서고, 남이 노드를 지워도 · 늦게 실린 테마 시트가 처음 그린 문서를 줄여도 안 준다.
 *
 * `html` 의 상자 높이는 내용(겹친 바깥 여백 포함)만큼이고, `body` 의 `scrollHeight` 는 상자 밖으로 넘친 자손까지 센다 — 둘의 큰 쪽이다. 테마가
 * 뿌리 · `body` 에 뷰포트 단위 높이(`min-height: 100vh` 등)를 걸면 이 값도 iframe 높이에 묶여 다시 줄지 않는다 — 시스템 테마에는 그런 규칙이
 * 없다(`build-test/canvas-preview.test.ts` 「iframe 은 끌기 뒤 끌기 전 높이로」).
 */
function contentHeight(frame: CanvasFrame): number {
  const { document: doc, window: win } = frame
  const top = doc.body.getBoundingClientRect().top + win.scrollY
  return Math.ceil(Math.max(doc.documentElement.getBoundingClientRect().height, top + doc.body.scrollHeight))
}

/**
 * **뷰포트 단위에 안 묶인 문서 높이** — 잠깐 iframe 을 최소 높이로 줄여 재고 되돌린다. 테마가 뿌리 · `body` 에 `min-height: 100vh` 를 걸면 `contentHeight`
 * 는 iframe 높이(= 그 `100vh`)에 묶여 문서가 줄어도 안 줄고, 바깥 여백이 더해져 잴 때마다 자란다(실측: 400ms 마다 +336px 로 끝없이 자랐다 —
 * `build-test/n1-layout.test.ts` 「뷰포트 높이 테마」). 줄여 재면 그 단위가 최소 높이로 풀려 값이 문서 내용만 남는다. 같은 작업 안에서 줄이고 되돌려
 * 그림은 한 번도 줄지 않는다 — 다만 줄이는 동안 앞선 칸의 스크롤이 문서 끝에 맞춰 당겨지므로 스크롤 조상의 자리를 되돌려 놓는다.
 */
function naturalHeight(frame: CanvasFrame, iframe: HTMLIFrameElement | null): number {
  if (iframe === null) return contentHeight(frame)
  const kept: { element: HTMLElement; top: number; left: number }[] = []
  for (let element = iframe.parentElement; element !== null; element = element.parentElement) {
    if (element.scrollTop !== 0 || element.scrollLeft !== 0) kept.push({ element, top: element.scrollTop, left: element.scrollLeft })
  }
  const before = iframe.style.height
  iframe.style.height = `${MIN_HEIGHT}px`
  try {
    return contentHeight(frame)
  } finally {
    iframe.style.height = before
    for (const { element, top, left } of kept) {
      element.scrollTop = top
      element.scrollLeft = left
    }
  }
}

/**
 * head 의 시트를 `sheets` 와 같게 — 같은 id 의 같은 종류는 그 요소를 고쳐 쓰고(링크를 다시 받지 않게), 종류가 바뀌면 그 자리에서 바꾸고,
 * 사라진 id 는 걷는다. 차례가 어긋났을 때만 다시 붙인다 — `<link>` 를 떼었다 붙이면 시트가 한 번 빠졌다 선다.
 */
function syncSheets(doc: Document, sheets: readonly CanvasSheet[]): HTMLLinkElement[] {
  const head = doc.head
  const existing = new Map<string, Element>()
  for (const el of head.querySelectorAll('[data-wb-style]')) existing.set(el.getAttribute('data-wb-style') ?? '', el)
  const wanted: Element[] = []
  const loading: HTMLLinkElement[] = []
  for (const sheet of sheets) {
    let el = existing.get(sheet.id)
    const tag = 'href' in sheet ? 'link' : 'style'
    if (el !== undefined && el.tagName.toLowerCase() !== tag) {
      const replacement = doc.createElement(tag)
      replacement.setAttribute('data-wb-style', sheet.id)
      el.replaceWith(replacement)
      el = replacement
    }
    if (el === undefined) {
      el = doc.createElement(tag)
      el.setAttribute('data-wb-style', sheet.id)
      head.appendChild(el)
    }
    if ('href' in sheet) {
      if (el.getAttribute('rel') !== 'stylesheet') el.setAttribute('rel', 'stylesheet')
      if (el.getAttribute('href') !== sheet.href) {
        el.setAttribute('href', sheet.href)
        loading.push(el as HTMLLinkElement)
      }
    } else if (el.textContent !== sheet.css) {
      el.textContent = sheet.css
    }
    existing.delete(sheet.id)
    wanted.push(el)
  }
  for (const stale of existing.values()) stale.remove()
  const order = [...head.querySelectorAll('[data-wb-style]')]
  if (order.length !== wanted.length || order.some((el, i) => el !== wanted[i])) {
    for (const el of wanted) head.appendChild(el)
  }
  return loading
}

/**
 * **새로 받는 link 시트가 실릴 때까지 전이를 멈춘다.** `<link>` 는 문서를 그린 뒤에 얹히므로(인라인 `<style>` 과 달리 첫 계산에 없다) 그 시트의
 * `transition`(system-admin 의 단추는 padding 까지 옮긴다)이 기본값 → 테마 값을 전이로 그린다 — 노드가 수백 ms 동안 미끄러지고, 그 사이에 잰
 * 선택 외곽선 · 마커가 옛 자리에 남는다(`build-test/canvas-iframe.test.ts` 「늦게 온 테마 시트」). 판을 바꿔 href 가 바뀔 때도 같다.
 *
 * 다 실리면(`load` · `error`) 시트가 얹힌 값을 한 번 계산하게 한 뒤 멈춤을 걷고 다시 잰다 — 같은 계산에서 걷으면 그 계산이 전이를 연다.
 * 다시 재라는 신호는 `test/canvas/canvas-iframe.test.tsx` 가 센다. 그 신호 없이 실브라우저의 외곽선 · 마커가 틀리는 판은 못 세웠다 — 대개 시트가
 * 실린 뒤에 서서 신호를 뗀 변조도 실브라우저 판은 초록이다. 노드는 시트가 실릴 때 body 크기를 안 바꾸고 옮길 수 있어(`ResizeObserver` 가
 * 안 부른다) 둔다.
 * 실리기 전에 걷힌 link(판이 또 바뀜)는 기다리지 않는다. jsdom 은 link 를 싣지 않아 `load` 가 안 온다 — 멈춤이 남지만 jsdom 에는 전이가 없다.
 */
function holdTransitions(frame: CanvasFrame, loading: readonly HTMLLinkElement[]): void {
  const doc = frame.document
  let waiting = pendingLinks.get(doc)
  if (waiting === undefined) {
    waiting = new Set()
    pendingLinks.set(doc, waiting)
  }
  const pending = waiting
  const release = () => {
    const hold = doc.head.querySelector(`style[${HOLD_ATTR}]`)
    if (hold === null) return
    void doc.documentElement.getBoundingClientRect()
    hold.remove()
    frame.window.dispatchEvent(new Event(MEASURE_EVENT))
  }
  for (const link of [...pending]) if (!link.isConnected) pending.delete(link)
  for (const link of loading) {
    if (pending.has(link)) continue
    pending.add(link)
    const settle = () => {
      link.removeEventListener('load', settle)
      link.removeEventListener('error', settle)
      pending.delete(link)
      if (pending.size === 0) release()
    }
    link.addEventListener('load', settle)
    link.addEventListener('error', settle)
  }
  if (pending.size === 0) {
    release()
    return
  }
  if (doc.head.querySelector(`style[${HOLD_ATTR}]`) === null) {
    const hold = doc.createElement('style')
    hold.setAttribute(HOLD_ATTR, '')
    doc.head.prepend(hold)
    // 글(`textContent`)이 아니라 규칙으로 넣는다 — jsdom 의 CSS 파서는 `@layer` 를 못 읽어 캔버스를 그릴 때마다 오류를 찍는다. 거기엔 전이가 없다.
    try {
      hold.sheet?.insertRule(HOLD_CSS)
    } catch {
      // `@layer` 를 못 읽는 문서 — 멈출 전이도 없다.
    }
  }
}
