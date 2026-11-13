/**
 * **코멘트가 가리킨 노드**(`comments/comment-pointing.tsx`) — 코멘트 패널이 쓰고 캔버스가 읽는 셸의 값. 페이지를 옮긴 첫 렌더에서 걷힌다.
 */
import { act, cleanup, render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { CommentPointingProvider, useCommentPointing, type CommentPointing } from '../../src/comments/comment-pointing'

afterEach(cleanup)

/** 렌더마다 본 값을 적는다 — 페이지를 옮긴 **첫** 렌더의 값을 잰다. */
function Probe(props: { seen: (string | null)[]; out: { current: CommentPointing | null } }): ReactElement {
  const pointing = useCommentPointing()
  props.seen.push(pointing.nodeId)
  props.out.current = pointing
  return <span />
}

describe('CommentPointingProvider', () => {
  it('point 로 세운 노드를 읽는다 · null 로 걷는다', () => {
    const seen: (string | null)[] = []
    const out: { current: CommentPointing | null } = { current: null }
    render(
      <CommentPointingProvider pageId="p1">
        <Probe seen={seen} out={out} />
      </CommentPointingProvider>,
    )
    expect(out.current?.nodeId).toBeNull()
    act(() => out.current?.point('A'))
    expect(out.current?.nodeId).toBe('A')
    act(() => out.current?.point(null))
    expect(out.current?.nodeId).toBeNull()
  })

  it('페이지를 옮긴 첫 렌더에서 걷힌다', () => {
    const seen: (string | null)[] = []
    const out: { current: CommentPointing | null } = { current: null }
    const tree = (pageId: string): ReactElement => (
      <CommentPointingProvider pageId={pageId}>
        <Probe seen={seen} out={out} />
      </CommentPointingProvider>
    )
    const { rerender } = render(tree('p1'))
    act(() => out.current?.point('A'))
    expect(out.current?.nodeId).toBe('A')
    seen.length = 0
    rerender(tree('p2'))
    expect(seen[0]).toBeNull()
    expect(seen.every((value) => value === null)).toBe(true)
  })

  it('provider 가 없으면 늘 null 이고 point 는 아무것도 안 한다', () => {
    const seen: (string | null)[] = []
    const out: { current: CommentPointing | null } = { current: null }
    render(<Probe seen={seen} out={out} />)
    act(() => out.current?.point('A'))
    expect(out.current?.nodeId).toBeNull()
  })
})
