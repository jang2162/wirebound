/**
 * **판정(«다시 확인»)에 머문 코멘트 게시는 번호 쓰기로 세지 않는다**(`panels/comment-panel.tsx`의 `perform` — `EditorStore.beginMarkerWrite`).
 *
 * 전송 루프는 409 를 받을 때 답을 기다리는 번호 쓰기가 있으면 그 답까지(한도 `MARKER_FRAME_WAIT_MS` 3s) 기다린다. 게시가 결과를 모르는 실패로
 * 판정에 가고 판정도 모르면 장부는 «다시 확인»을 누를 때까지 끝나지 않는다. 그 동안 세면 머리가 안 움직인 409 마다 3s 를 기다린다(고치기
 * 전 [jsdom]: 409 뒤 수습의 조회가 3s 뒤에야 나감). 끝은 답을 얹은 때와 판정으로 넘어간 때 가운데 먼저 오는 때다.
 */
import { act, fireEvent, screen, within } from '@testing-library/react'
import type { PageDocument } from '@wirebound/schema'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../src/api/client'
import type { PatchResult } from '../../src/api/types'
import { openPage, pageDetail, pageDoc } from '../editor-harness'

const pair = (): PageDocument =>
  pageDoc({
    id: 'n-root',
    type: 'Page',
    children: [
      { id: 'n-a', type: 'Text', props: {} },
      { id: 'n-b', type: 'Divider', props: {} },
    ],
  })

describe('판정에 머문 번호 쓰기', () => {
  it('«다시 확인»을 기다리는 게시는 409 를 받은 편집을 붙잡지 않는다', async () => {
    const doc = pair()
    let loads = 0
    const createComment = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')))
    await openPage(doc, {
      apiOverrides: {
        listComments: async () => [],
        createComment,
        patchOps: (): Promise<PatchResult> =>
          Promise.reject(new ApiError(409, 'conflict', '페이지가 이미 변경되었습니다 (요청 baseSeq 7, 현재 8)', [], true)),
        getPage: async (_projectId, pageId) => {
          loads += 1
          return { ...pageDetail(pageId, doc), headSeq: loads >= 2 ? 8 : 7 }
        },
      },
    })
    fireEvent.click(screen.getByRole('tab', { name: '코멘트' }))
    fireEvent.click(document.body.querySelector('[data-wb-id="n-b"]') as HTMLElement)
    fireEvent.change(await screen.findByLabelText('새 코멘트'), { target: { value: '새 말' } })
    fireEvent.click(screen.getByRole('button', { name: '코멘트 달기' }))
    // 보내기도 판정(같은 키로 다시 보내기)도 연결 실패 — «다시 확인»에 머문다.
    await screen.findByRole('button', { name: '다시 확인' })
    expect(createComment).toHaveBeenCalledTimes(2)
    fireEvent.click(screen.getByRole('tab', { name: '속성' }))

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const tree = screen.getByRole('region', { name: '구조 트리' })
      fireEvent.click(within(tree).getByRole('button', { name: 'Text' }))
      fireEvent.click(within(within(tree).getByRole('group', { name: '구조 편집' })).getByRole('button', { name: '아래로' }))
      await act(async () => {})
      await act(async () => {})

      // 기다리지 않고 곧바로 수습이 판을 다시 읽는다 — 시계를 흘리지 않았다.
      expect(loads).toBe(2)
    } finally {
      vi.useRealTimers()
    }
  })
})
