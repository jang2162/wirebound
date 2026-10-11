// @vitest-environment node
/**
 * 캔버스 사각형 고르기의 순수한 몫(`canvas/canvas-marquee.ts`) — 좌표 옮기기와 «사각형 안에 완전히 든 노드». 포인터 · 끝 스크롤 · 그리기는
 * 실브라우저 판(`build-test/multiselect.test.ts`)이 잰다 — jsdom 에는 상자가 없다.
 */
import { describe, expect, it } from 'vitest'
import { hostToDocument, nodesInRect, rectBetween, toSurfaceRect } from '../../src/canvas/canvas-marquee'

const box = (left: number, top: number, width: number, height: number) => ({ left, top, width, height })

describe('rectBetween', () => {
  it('두 점이 어느 쪽에 있든 왼쪽 위 · 오른쪽 아래로 놓는다', () => {
    expect(rectBetween({ x: 50, y: 10 }, { x: 20, y: 40 })).toEqual({ left: 20, top: 10, right: 50, bottom: 40 })
  })
})

describe('nodesInRect', () => {
  const nodes = [
    { id: 'root', parentId: null, box: box(0, 0, 500, 500) },
    { id: 'card', parentId: 'root', box: box(10, 10, 200, 100) },
    { id: 'title', parentId: 'card', box: box(20, 20, 100, 20) },
    { id: 'text', parentId: 'root', box: box(10, 200, 100, 20) },
  ]

  it('완전히 든 상자만 고른다 — 걸치기만 한 것은 안 든다', () => {
    expect(nodesInRect({ left: 0, top: 150, right: 120, bottom: 230 }, nodes)).toEqual(['text'])
    expect(nodesInRect({ left: 0, top: 150, right: 100, bottom: 230 }, nodes)).toEqual([])
  })

  it('조상이 든 자손은 뺀다 — 가장 바깥 것들', () => {
    expect(nodesInRect({ left: 5, top: 5, right: 260, bottom: 240 }, nodes)).toEqual(['card', 'text'])
  })

  it('조상이 안 들면 자손이 든다', () => {
    expect(nodesInRect({ left: 15, top: 15, right: 150, bottom: 50 }, nodes)).toEqual(['title'])
  })

  it('뿌리는 안 든다 — 사각형이 페이지 전부를 덮어도 그 자식들이다', () => {
    expect(nodesInRect({ left: -1, top: -1, right: 600, bottom: 600 }, nodes)).toEqual(['card', 'text'])
  })

  it('크기가 0 인 상자(그려지지 않은 노드)는 안 든다', () => {
    expect(
      nodesInRect({ left: 0, top: 0, right: 600, bottom: 600 }, [...nodes, { id: 'empty', parentId: 'root', box: box(300, 300, 0, 0) }]),
    ).toEqual(['card', 'text'])
  })
})

describe('좌표', () => {
  /** iframe 요소가 호스트 창에서 (100, 50) 에 줌 0.5 로 서 있다 — `getBoundingClientRect` 는 줌이 곱해진 상자다. */
  const frame = { left: 100, top: 50 }

  it('호스트 점을 문서 점으로 — iframe 의 자리를 빼고 줌으로 나눈다', () => {
    expect(hostToDocument({ x: 150, y: 100 }, frame, 0.5)).toEqual({ x: 100, y: 100 })
    expect(hostToDocument({ x: 150, y: 100 }, frame, 1.5)).toEqual({ x: 50 / 1.5, y: 50 / 1.5 })
  })

  it('칸이 굴러 iframe 이 올라가면 같은 호스트 점이 문서의 더 아래다', () => {
    const scrolled = { left: 100, top: -150 }
    expect(hostToDocument({ x: 150, y: 100 }, scrolled, 1).y - hostToDocument({ x: 150, y: 100 }, frame, 1).y).toBe(200)
  })

  it('문서 사각형을 표면 상자로 — 표면의 iframe 자리를 더한다(줌은 표면이 이미 진다)', () => {
    expect(toSurfaceRect({ left: 10, top: 20, right: 60, bottom: 30 }, { left: 5, top: 7 })).toEqual({
      left: 15,
      top: 27,
      width: 50,
      height: 10,
    })
  })
})
