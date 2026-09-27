import { focusElement, markerPoint } from '@wirebound/renderer'
import { useLayoutEffect, useState, type CSSProperties, type ReactElement, type RefObject } from 'react'

interface Measured {
  box: { left: number; top: number; width: number; height: number }
  marker: { x: number; y: number }
}

const MARKER_SIZE = 16

/**
 * 한 칸의 포커스 · 마커 겹쳐 보기 — 에디터가 그 노드를 골랐을 때의 외곽선과 코멘트 번호 자리. 좌표는 렌더러의
 * `focusElement` · `markerPoint` 가 짓는다(에디터 · HTML 뷰어 · PPTX 와 같은 함수 — 여기서 따로 셈하면 작성자가 본 자리와
 * 실제 자리가 갈린다). 칸(`position: relative`)의 왼쪽 위를 원점으로 옮겨 그린다.
 */
export function GalleryOverlay(props: { stage: RefObject<HTMLDivElement | null>; nodeId: string }): ReactElement | null {
  const [measured, setMeasured] = useState<Measured | null>(null)

  useLayoutEffect(() => {
    const stage = props.stage.current
    const cell = stage?.parentElement
    if (!stage || !cell) return
    const measure = () => {
      const root = stage.querySelector(`[data-wb-id="${props.nodeId}"]`)
      if (!root) return setMeasured(null)
      const origin = cell.getBoundingClientRect()
      const r = focusElement(root).getBoundingClientRect()
      const p = markerPoint(root)
      setMeasured({
        box: { left: r.left - origin.left, top: r.top - origin.top, width: r.width, height: r.height },
        marker: { x: p.x - origin.left, y: p.y - origin.top },
      })
    }
    measure()
    // 글꼴 · 이미지가 늦게 서거나 뷰포트를 바꾸면 자리가 옮는다. 칸을 그린 창의 것을 쓴다(프레임 iframe).
    const Observer = (stage.ownerDocument.defaultView as (Window & typeof globalThis) | null)?.ResizeObserver
    if (Observer === undefined) return
    const observer = new Observer(measure)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [props.stage, props.nodeId])

  if (measured === null) return null
  const { box, marker } = measured
  const boxStyle: CSSProperties = {
    position: 'absolute', left: box.left, top: box.top, width: box.width, height: box.height,
    outline: '2px solid #2563eb', outlineOffset: '1px', pointerEvents: 'none',
  }
  const markerStyle: CSSProperties = {
    position: 'absolute', left: marker.x - MARKER_SIZE / 2, top: marker.y - MARKER_SIZE / 2, width: MARKER_SIZE, height: MARKER_SIZE,
    borderRadius: '50%', background: '#f97316', color: '#fff', font: '10px/16px system-ui, sans-serif', textAlign: 'center',
    pointerEvents: 'none',
  }
  return (
    <>
      <div data-wb-gallery-focus="" style={boxStyle} />
      <div data-wb-gallery-marker="" style={markerStyle}>1</div>
    </>
  )
}
