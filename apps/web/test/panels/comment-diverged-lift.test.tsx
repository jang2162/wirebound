/**
 * **번호 어긋남 통지가 풀리는 때**(`panels/comment-panel.tsx`의 `MARKERS_DIVERGED`). 서버가 바꾼 번호를 내 문서에 못 얹으면(M4c —
 * `applyMarkerChange`가 `'diverged'`) «번호를 화면에 반영하지 못했습니다»가 선다. 그 뒤 판을 다시 실어 그 번호의 revision 까지 품은 판이
 * 서면 화면은 서버 것이다 — 통지는 거짓이다([Chrome] 코멘트 삭제(번호 지움)가 커밋된 사이 되돌리기가 줄 서면 2/2 수습이 판을 다시 싣고도
 * 통지가 2.5s 뒤까지 남았다). **그 revision 앞을 읽은 판이면 남긴다** — 번호가 여전히 빠졌다.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import type { WbNode } from '@wirebound/schema'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../src/api/client'
import type { PageDetail } from '../../src/api/types'
import { HEAD_SEQ, PAGE_ID, openPage, pageDetail, pageDoc, canvasQuery } from '../editor-harness'
import { treeTool } from './tree-row'

const DIVERGED = /번호를 화면에 반영하지 못했습니다/

function three(markerOnA?: number): WbNode {
  const child = (key: 'a' | 'b' | 'c', content: string): WbNode => ({
    id: `n_${key}`,
    type: 'Text',
    props: { content },
    ...(key === 'a' && markerOnA !== undefined ? { marker: markerOnA } : {}),
  })
  return { id: 'n_root', type: 'Page', children: [child('a', '가'), child('b', '나'), child('c', '다')] }
}

/**
 * 게시의 번호(seq `HEAD_SEQ + 1`)를 못 얹어 통지를 세운 뒤, 구조 편집 하나가 409 를 받아 수습이 판을 다시 싣는다 — 그 판이 `reloaded`다.
 */
async function divergeThenReload(reloaded: PageDetail): Promise<void> {
  let calls = 0
  const getPage = vi.fn(async (_projectId: string, pageId: string) => {
    calls += 1
    return calls === 1 ? pageDetail(pageId, pageDoc(three())) : reloaded
  })
  await openPage(pageDoc(three()), {
    apiOverrides: {
      getPage,
      listComments: async () => [],
      createComment: async () => ({
        comment: { id: 'c1', nodeId: 'n_a', body: '새 말', authorId: 'u-1', authorName: '테스터', createdAt: '', updatedAt: '' },
        marker: 1,
        seq: HEAD_SEQ + 1,
        // 내 문서에 없는 경로 — 얹지 못한다.
        markerOps: [{ op: 'replace' as const, path: '/root/children/9/marker', value: 1 }],
      }),
      patchOps: async () => {
        throw new ApiError(409, 'conflict', '페이지가 이미 변경되었습니다')
      },
    },
  })
  fireEvent.click(screen.getByRole('tab', { name: '코멘트' }))
  fireEvent.click(canvasQuery('[data-wb-id="n_a"]') as HTMLElement)
  fireEvent.change(await screen.findByLabelText('새 코멘트'), { target: { value: '새 말' } })
  fireEvent.click(screen.getByRole('button', { name: '코멘트 달기' }))
  await waitFor(() => expect(screen.getByText(DIVERGED)).toBeTruthy())

  const tree = screen.getByRole('region', { name: '구조 트리' })
  fireEvent.click(within(tree).getAllByRole('button', { name: 'Text' })[1]!)
  fireEvent.click(treeTool(tree, '아래로'))
  await waitFor(() => expect(getPage).toHaveBeenCalledTimes(2))
  await act(async () => {})
}

describe('번호 어긋남 통지', () => {
  it('그 번호의 revision 까지 품은 판을 다시 실으면 풀린다', async () => {
    await divergeThenReload({ ...pageDetail(PAGE_ID, pageDoc(three(1))), headSeq: HEAD_SEQ + 1 })

    await waitFor(() => expect(document.body.querySelector('[data-wb-marker-for="n_a"]')?.textContent).toBe('1'))
    expect(screen.queryByText(DIVERGED)).toBeNull()
  })

  it('그 revision 앞을 읽은 판이면 남는다', async () => {
    await divergeThenReload({ ...pageDetail(PAGE_ID, pageDoc(three())), headSeq: HEAD_SEQ })

    expect(screen.getByText(DIVERGED)).toBeTruthy()
  })
})
