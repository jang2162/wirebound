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

/** 레이아웃이 없는 jsdom 에서 다시 재게 하는 신호. 실브라우저에서는 `ResizeObserver` 가 부른다. */
const MEASURE_EVENT = 'wb-canvas-measure'

/** 문서가 비었을 때의 높이. 빈 캔버스도 누를 자리가 있어야 선택을 풀 수 있다. */
const MIN_HEIGHT = 320

export function CanvasIframe(props: {
  /** iframe 문서의 head 에 차례로 싣는 스타일. id 는 `data-wb-style` 값이다. */
  styles: readonly { id: string; css: string }[]
  width: number
  children: (frame: CanvasFrame) => ReactNode
  onFrame?: (frame: CanvasFrame | null) => void
  /** iframe 문서의 높이를 다시 잰 뒤 불린다 — 노드 상자가 바뀌었을 수 있다. */
  onResize?: () => void
  /**
   * 문서 밖(iframe 의 `body` · `html` 자체)을 눌렀다. **React 의 `onClick` 으로는 안 온다** — portal 의 컨테이너(body)는
   * React 가 그린 요소가 아니라서, 그것을 누른 클릭은 React 트리의 어느 핸들러에도 닿지 않는다(jsdom · 실브라우저 같다).
   */
  onBackgroundClick?: () => void
}): ReactElement {
  const [iframe, setIframe] = useState<HTMLIFrameElement | null>(null)
  const [frame, setFrame] = useState<CanvasFrame | null>(null)
  const [height, setHeight] = useState(MIN_HEIGHT)
  const { onFrame, onResize, onBackgroundClick } = props

  useLayoutEffect(() => {
    const doc = iframe?.contentDocument
    const win = iframe?.contentWindow
    if (!doc || !win) return
    // about:blank 은 브라우저마다 빈 body 를 갖기도, 안 갖기도 한다.
    if (doc.body === null) {
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
    const head = frame.document.head
    for (const { id, css } of props.styles) {
      // id 는 코드 상수(`base` · `theme`)라 셀렉터로 조립해도 된다 — 사용자 값이 아니다.
      let tag = head.querySelector<HTMLStyleElement>(`style[data-wb-style="${id}"]`)
      if (tag === null) {
        tag = frame.document.createElement('style')
        tag.setAttribute('data-wb-style', id)
        head.appendChild(tag)
      }
      if (tag.textContent !== css) tag.textContent = css
    }
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
      if (event.target === doc.body || event.target === doc.documentElement) onBackgroundClick()
    }
    doc.addEventListener('click', listener)
    return () => doc.removeEventListener('click', listener)
  }, [frame, onBackgroundClick])

  useLayoutEffect(() => {
    if (frame === null) return
    const measure = () => {
      setHeight(Math.max(MIN_HEIGHT, frame.document.documentElement.scrollHeight))
      onResize?.()
    }
    measure()
    const Observer = (frame.window as unknown as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver
    const observer = Observer ? new Observer(measure) : null
    observer?.observe(frame.document.body)
    frame.window.addEventListener(MEASURE_EVENT, measure)
    return () => {
      observer?.disconnect()
      frame.window.removeEventListener(MEASURE_EVENT, measure)
    }
  }, [frame, onResize])

  // portal 을 iframe **앞에** 둔다. 언마운트는 형제 순서대로 걷는데, iframe 을 먼저 떼면 jsdom 은 그 문서를 버려
  // portal 의 자식을 뗄 자리가 없어진다(`NotFoundError`). 실브라우저에서도 떼인 iframe 의 문서를 만지지 않는 편이 낫다.
  return (
    <>
      {frame !== null && createPortal(props.children(frame), frame.document.body)}
      <iframe
        ref={setIframe}
        className="wb-shell-canvas-iframe"
        title="캔버스 문서"
        style={{ width: `${props.width}px`, height: `${height}px` }}
      />
    </>
  )
}
