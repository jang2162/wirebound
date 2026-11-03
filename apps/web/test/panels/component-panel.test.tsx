/**
 * 편집 모드 우측의 **«컴포넌트» 탭**(`src/panels/component-panel.tsx`) — 코멘트 묶음이 무엇을 그리나(jsdom).
 *
 * 캔버스 누름이 탭을 옮기는가 · 두 자리에서 단 말 · 초안이 같은가는 실브라우저 판이 잰다(`build-test/component-tab.test.ts`).
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Comment } from '../../src/api/types'
import { canvasQuery, openPage, pageDoc } from '../editor-harness'

function comment(id: string, nodeId: string, body: string): Comment {
  return { id, nodeId, body, authorId: 'u-2', authorName: '보라', createdAt: '2026-11-03T00:00:00Z', updatedAt: '2026-11-03T00:00:00Z' }
}

const DOC = pageDoc({
  id: 'n_root',
  type: 'Page',
  children: [
    { id: 'n_a', type: 'Text', props: { content: '가' } },
    { id: 'n_b', type: 'Text', props: { content: '나' } },
  ],
})

function commentPart(): HTMLElement {
  return screen.getByRole('region', { name: '코멘트' })
}

describe('«컴포넌트» 탭의 코멘트 묶음', () => {
  it('고른 노드의 무리만 그리고 재번호 단추가 없다', async () => {
    await openPage(DOC, {
      apiOverrides: { listComments: async () => [comment('c1', 'n_a', '가의 말'), comment('c2', 'n_b', '나의 말')] },
    })
    fireEvent.click(canvasQuery('[data-wb-id="n_b"]') as HTMLElement)
    await waitFor(() => expect(within(commentPart()).queryAllByText(/의 말$/)).not.toHaveLength(0))
    expect({
      tab: screen.getByRole('tab', { name: '컴포넌트' }).getAttribute('aria-selected'),
      bodies: [...commentPart().querySelectorAll('.wb-shell-comment-body')].map((element) => element.textContent),
      renumber: within(commentPart()).queryByRole('button', { name: '문서 순서대로 재번호' }) !== null,
    }).toEqual({ tab: 'true', bodies: ['나의 말'], renumber: false })
  })
})
