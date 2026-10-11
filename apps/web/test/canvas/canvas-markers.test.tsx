/**
 * 캔버스의 **번호 마커**(설계서 「설계서 화면 구조」).
 *
 * 선택 아웃라인과 같은 장치를 두 번째로 쓰는 자리다 — `findNodeElement`로 상자를 잡아
 * 배율을 걷어 낸 문서 좌표로 그린다. 갈리는 것 둘을 여기서 잰다:
 *
 * 1. **한 번에 여럿이 그려진다**(아웃라인은 늘 하나다).
 * 2. **두 모드에 다 있다**(아웃라인은 편집 모드 전용이다) — 그 절의 뷰 모드 탭에도 코멘트가
 *    있기 때문이다.
 *
 * **자리(픽셀)는 재지 않는다.** jsdom의 `getBoundingClientRect`가 전부 0을 내므로 그
 * 값으로는 아무것도 증명되지 않는다 — 아웃라인 케이스가 `data-wb-selected-id`만 보는 것과
 * 같은 이유로 여기서도 **어느 노드에 몇 번이 붙었는가**만 본다.
 */
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { WbNode } from '@wirebound/schema'
import { openPage, pageDoc, waitForNode, canvasQuery } from '../editor-harness'

/** 지금 캔버스에 그려진 마커. `노드 id → 번호`다. */
function markers(): Record<string, string> {
  const found: Record<string, string> = {}
  for (const element of document.body.querySelectorAll<HTMLElement>('[data-wb-marker-for]')) {
    found[element.getAttribute('data-wb-marker-for') ?? ''] = element.textContent ?? ''
  }
  return found
}

/** 노드 셋을 가진 문서. `marker`를 붙일 자리를 고를 수 있어야 한다. */
function three(markerOf: Partial<Record<'a' | 'b' | 'c', number>>): WbNode {
  const child = (key: 'a' | 'b' | 'c', content: string): WbNode => ({
    id: `n_${key}`,
    type: 'Text',
    props: { content },
    ...(markerOf[key] !== undefined ? { marker: markerOf[key] } : {}),
  })

  return {
    id: 'n_root',
    type: 'Page',
    children: [child('a', '가'), child('b', '나'), child('c', '다')],
  }
}

describe('캔버스 번호 마커', () => {
  it('marker가 있는 노드에만 번호가 붙는다', async () => {
    await openPage(pageDoc(three({ a: 1, c: 2 })))

    await waitFor(() => expect(Object.keys(markers())).toHaveLength(2))
    expect(markers()).toEqual({ n_a: '1', n_c: '2' })
  })

  it('여럿을 동시에 그린다 — 아웃라인과 갈리는 자리다', async () => {
    await openPage(pageDoc(three({ a: 3, b: 1, c: 2 })))

    await waitFor(() => expect(Object.keys(markers())).toHaveLength(3))
    // **문서 순서와 번호가 어긋나 있어도 그대로 그린다** — 정리하는 것은 설계서 「설계서 화면
    // 구조」의 재번호 버튼이지 캔버스가 아니다.
    expect(markers()).toEqual({ n_a: '3', n_b: '1', n_c: '2' })
  })

  it('마커가 하나도 없으면 아무것도 안 그린다', async () => {
    await openPage(pageDoc(three({})))

    await waitForNode('n_a')
    expect(markers()).toEqual({})
  })

  it('뷰 모드에서도 보인다 — 아웃라인은 사라진다(D8)', async () => {
    // **«마커는 두 모드에 다 있다»를 재는 것은 이 케이스뿐이다.** `mode === 'edit'` 조건을 마커에도 걸면 여기서 죽는다.
    await openPage(pageDoc(three({ a: 1 })))
    await waitFor(() => expect(markers()).toEqual({ n_a: '1' }))

    // 노드를 골라 아웃라인을 세운 뒤 모드를 바꾼다 — 아웃라인이 사라지는 것이 대조군이다.
    fireEvent.click(canvasQuery('[data-wb-id="n_a"]') as HTMLElement)
    await waitFor(() => expect(document.body.querySelector('[data-wb-selected-id]')).not.toBeNull())

    fireEvent.click(screen.getByRole('button', { name: '뷰 모드' }))

    await waitFor(() => expect(document.body.querySelector('[data-wb-selected-id]')).toBeNull())
    expect(markers()).toEqual({ n_a: '1' })
  })

  it('마커에 무엇인지 말하는 이름이 붙는다', async () => {
    // 숫자 하나만 떠 있으면 그것이 무엇인지 알 수 없다.
    await openPage(pageDoc(three({ a: 2 })))

    await waitFor(() => expect(markers()).toEqual({ n_a: '2' }))
    expect(document.body.querySelector('[data-wb-marker-for="n_a"]')?.getAttribute('title')).toBe('코멘트 2번')
  })

  it('정수가 아닌 marker는 그리지 않는다', async () => {
    // 봉투 검증(`z.int().positive()`)이 막지만 검증 **전** 문서에 대해서는 그 보장이 없다.
    const broken = three({ a: 1 })
    ;(broken.children?.[1] as { marker?: unknown }).marker = '2'
    ;(broken.children?.[2] as { marker?: unknown }).marker = Number.NaN

    await openPage(pageDoc(broken))

    await waitFor(() => expect(markers()).toEqual({ n_a: '1' }))
  })
})
