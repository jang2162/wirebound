/**
 * **캔버스 판정의 순수 함수**(`src/canvas/canvas-drop.ts`) — 구역(`zoneOf`) · 배치 축(`axisOf`) · 좌표 환산(`hostToFrame` · `frameToHost`).
 * jsdom 에 레이아웃이 없으므로 상자 · 스타일을 값으로 준다. DOM 층(`canvasHitAt`)은 실브라우저 판(`build-test/canvas-drop.test.ts`)이 잰다.
 */
import { describe, expect, it } from 'vitest'
import { axisOf, frameToHost, hostToFrame, zoneOf, type Rect } from '../../src/canvas/canvas-drop'

const box: Rect = { left: 0, top: 0, width: 200, height: 100 }

describe('zoneOf — 축 방향 앞 25% · 뒤 25% · 가운데', () => {
  it('세로 축: 받는 노드는 앞 · 안 · 뒤, 안 받는 노드는 반씩', () => {
    expect(zoneOf(box, 'y', false, { x: 100, y: 10 }, true, false)).toBe('before')
    expect(zoneOf(box, 'y', false, { x: 100, y: 90 }, true, false)).toBe('after')
    expect(zoneOf(box, 'y', false, { x: 100, y: 50 }, true, false)).toBe('inside')
    expect(zoneOf(box, 'y', false, { x: 100, y: 50 }, false, false)).toBe('after')
    expect(zoneOf(box, 'y', false, { x: 100, y: 40 }, false, false)).toBe('before')
  })

  it('빈 컨테이너는 상자 전체가 안 — 앞 끝이어도', () => {
    expect(zoneOf(box, 'y', false, { x: 100, y: 10 }, true, true)).toBe('inside')
    expect(zoneOf(box, 'x', false, { x: 5, y: 50 }, true, true)).toBe('inside')
    // 자식을 안 받으면 «빈» 이 뜻이 없다 — 반씩.
    expect(zoneOf(box, 'y', false, { x: 100, y: 10 }, false, true)).toBe('before')
  })

  it('가로 축: x 로 같은 표 — y 는 보지 않는다', () => {
    expect(zoneOf(box, 'x', false, { x: 20, y: 5 }, true, false)).toBe('before')
    expect(zoneOf(box, 'x', false, { x: 180, y: 5 }, true, false)).toBe('after')
    expect(zoneOf(box, 'x', false, { x: 100, y: 95 }, true, false)).toBe('inside')
    expect(zoneOf(box, 'x', false, { x: 120, y: 5 }, false, false)).toBe('after')
  })

  it('뒤집힌 배치면 앞 · 뒤가 바뀐다 — 안은 그대로', () => {
    expect(zoneOf(box, 'x', true, { x: 20, y: 50 }, true, false)).toBe('after')
    expect(zoneOf(box, 'x', true, { x: 180, y: 50 }, true, false)).toBe('before')
    expect(zoneOf(box, 'x', true, { x: 100, y: 50 }, true, false)).toBe('inside')
    expect(zoneOf(box, 'y', true, { x: 100, y: 10 }, false, false)).toBe('after')
  })

  it('상자 왼 · 위가 0 이 아니어도 상자 안 자리로 잰다', () => {
    const moved: Rect = { left: 300, top: 400, width: 200, height: 100 }
    expect(zoneOf(moved, 'y', false, { x: 0, y: 410 }, true, false)).toBe('before')
    expect(zoneOf(moved, 'x', false, { x: 480, y: 0 }, true, false)).toBe('after')
  })
})

describe('axisOf — 부모의 계산 스타일 · 형제 상자', () => {
  const self: Rect = { left: 0, top: 0, width: 100, height: 40 }
  const right: Rect = { left: 120, top: 0, width: 100, height: 40 }
  const below: Rect = { left: 0, top: 60, width: 100, height: 40 }

  it('flex: row → x · row-reverse → x 뒤집힘 · column → y · column-reverse → y 뒤집힘 · inline-flex 도 같다', () => {
    expect(axisOf({ display: 'flex', flexDirection: 'row' }, [below], self)).toEqual({ axis: 'x', reversed: false })
    expect(axisOf({ display: 'flex', flexDirection: 'row-reverse' }, [], self)).toEqual({ axis: 'x', reversed: true })
    expect(axisOf({ display: 'flex', flexDirection: 'column' }, [right], self)).toEqual({ axis: 'y', reversed: false })
    expect(axisOf({ display: 'flex', flexDirection: 'column-reverse' }, [], self)).toEqual({ axis: 'y', reversed: true })
    expect(axisOf({ display: 'inline-flex', flexDirection: 'row' }, [], self)).toEqual({ axis: 'x', reversed: false })
  })

  it('block: 형제가 아래로 쌓이면 y · 형제가 같은 줄에 서면 x(인라인 상자)', () => {
    expect(axisOf({ display: 'block', flexDirection: 'row' }, [below], self)).toEqual({ axis: 'y', reversed: false })
    expect(axisOf({ display: 'block', flexDirection: 'row' }, [], self)).toEqual({ axis: 'y', reversed: false })
    expect(axisOf({ display: 'block', flexDirection: 'row' }, [right], self)).toEqual({ axis: 'x', reversed: false })
  })

  it('grid: 형제 둘이 같은 줄이면 x · 다른 줄이면 y · 마지막 줄에 혼자 선 칸도 x(다른 줄에 둘이 선다)', () => {
    expect(axisOf({ display: 'grid', flexDirection: 'row' }, [right], self)).toEqual({ axis: 'x', reversed: false })
    expect(axisOf({ display: 'grid', flexDirection: 'row' }, [below], self)).toEqual({ axis: 'y', reversed: false })
    const lone: Rect = { left: 0, top: 60, width: 100, height: 40 }
    expect(axisOf({ display: 'grid', flexDirection: 'row' }, [self, right], lone)).toEqual({ axis: 'x', reversed: false })
  })

  it('높이가 다른 형제도 세로로 겹치면 같은 줄이다(가운데 정렬) · 맞닿기만 하면 아니다', () => {
    const tall: Rect = { left: 120, top: -20, width: 100, height: 80 }
    expect(axisOf({ display: 'block', flexDirection: 'row' }, [tall], self)).toEqual({ axis: 'x', reversed: false })
    const touching: Rect = { left: 0, top: 40, width: 100, height: 40 }
    expect(axisOf({ display: 'block', flexDirection: 'row' }, [touching], self)).toEqual({ axis: 'y', reversed: false })
  })
})

describe('좌표 환산 — 호스트 점 ↔ iframe 점', () => {
  // iframe 요소의 호스트 상자(`getBoundingClientRect` — 칸 스크롤 · 프레임의 `scale(zoom)` 이 이미 들어 있다).
  for (const zoom of [0.5, 1, 1.5]) {
    it(`줌 ${zoom}: 프레임 상자 왼 · 위를 빼고 줌으로 나눈다 · 되돌리면 같은 자리`, () => {
      const frame: Rect = { left: 324, top: 88, width: 1280 * zoom, height: 900 * zoom }
      expect(hostToFrame({ x: 324 + 100 * zoom, y: 88 + 40 * zoom }, frame, zoom)).toEqual({ x: 100, y: 40 })
      expect(frameToHost({ left: 100, top: 40, width: 200, height: 30 }, frame, zoom)).toEqual({
        left: 324 + 100 * zoom,
        top: 88 + 40 * zoom,
        width: 200 * zoom,
        height: 30 * zoom,
      })
    })
  }

  it('칸을 스크롤한 판 — 프레임 상자가 위 · 왼으로 밀린 값이 그대로 든다', () => {
    // 칸 왼 위(24 · 64) + 안쪽 여백 24 에서 세로 300 · 가로 50 만큼 스크롤했다.
    const zoom = 1.5
    const frame: Rect = { left: 24 + 24 - 50, top: 64 + 24 - 300, width: 1920, height: 1350 }
    expect(hostToFrame({ x: 400, y: 300 }, frame, zoom)).toEqual({ x: (400 - frame.left) / zoom, y: (300 - frame.top) / zoom })
    expect(hostToFrame({ x: 400, y: 300 }, frame, zoom)).toEqual({ x: 268, y: 341.3333333333333 })
  })
})
