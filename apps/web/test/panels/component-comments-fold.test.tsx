/**
 * **«컴포넌트» 탭의 «코멘트» 묶음 접힘**(`src/panels/component-panel.tsx`)과 **«코멘트» 탭 이름의 수**(`src/routes/editor.tsx` 의 `CommentTabLabel`) —
 * jsdom. 묶음을 펴서 달고 · 초안을 탭 왕복에 지키는 것은 실브라우저 `build-test/component-tab.test.ts`.
 */
import { fireEvent, screen, waitFor } from '@testing-library/react'
import type { WbNode } from '@wirebound/schema'
import { describe, expect, it } from 'vitest'
import type { Comment } from '../../src/api/types'
import { canvasQuery, openPage, pageDoc } from '../editor-harness'
import '../../src/catalog-setup'

const ROOT: WbNode = {
  id: 'n_root',
  type: 'Page',
  children: [
    { id: 'n_a', type: 'Text', props: { content: '가' } },
    { id: 'n_b', type: 'Text', props: { content: '나' } },
  ],
}

const comment = (id: string, nodeId: string): Comment => ({
  id,
  nodeId,
  body: `${id} 말`,
  authorId: 'u-1',
  authorName: '앨리스',
  createdAt: '2026-11-18T00:00:00Z',
  updatedAt: '2026-11-18T00:00:00Z',
})

const COMMENTS = [comment('c-1', 'n_a'), comment('c-2', 'n_a')]

function pick(nodeId: string): void {
  fireEvent.click(canvasQuery(`[data-wb-id="${nodeId}"]`) as HTMLElement)
}

const toggle = (): HTMLButtonElement => document.querySelector<HTMLButtonElement>('.wb-shell-component-part-toggle')!
const body = (): HTMLElement => document.getElementById('wb-component-comments-body')!
const count = (): string | null => document.querySelector('.wb-shell-component-part-count')?.textContent ?? null

describe('«컴포넌트» 탭 — «코멘트» 묶음 접힘', () => {
  it('기본으로 접혀 수만 말하고, «코멘트» 탭 이름 곁에 그 노드의 수가 서되 탭의 이름은 «코멘트» 그대로다', async () => {
    await openPage(pageDoc(ROOT), { apiOverrides: { listComments: async () => COMMENTS } })
    pick('n_a')
    await waitFor(() => expect(count()).toBe('2개'))
    const tab = screen.getByRole('tab', { name: '코멘트' })
    expect({
      expanded: toggle().getAttribute('aria-expanded'),
      label: toggle().textContent,
      hidden: body().hidden,
      badge: tab.querySelector('.wb-shell-tab-badge')?.textContent ?? null,
      badgeHidden: tab.querySelector('.wb-shell-tab-badge')?.getAttribute('aria-hidden') ?? null,
      note: document.getElementById(tab.getAttribute('aria-describedby') ?? '')?.textContent ?? null,
    }).toEqual({ expanded: 'false', label: '펼치기', hidden: true, badge: '2', badgeHidden: 'true', note: '고른 노드의 코멘트 2개' })

    // 코멘트가 없는 노드 — 수는 0개 · 탭 이름의 수는 안 선다.
    pick('n_b')
    await waitFor(() => expect(count()).toBe('0개'))
    expect(screen.getByRole('tab', { name: '코멘트' }).querySelector('.wb-shell-tab-badge')).toBeNull()
  })

  it('펼치면 본문이 보이고, 다른 노드를 골라도 · 탭을 다녀와도 편 채다', async () => {
    await openPage(pageDoc(ROOT), { apiOverrides: { listComments: async () => COMMENTS } })
    pick('n_a')
    await waitFor(() => expect(count()).toBe('2개'))
    fireEvent.click(toggle())
    expect({ expanded: toggle().getAttribute('aria-expanded'), label: toggle().textContent, hidden: body().hidden }).toEqual({
      expanded: 'true',
      label: '접기',
      hidden: false,
    })
    pick('n_b')
    await waitFor(() => expect(count()).toBe('0개'))
    expect({ expanded: toggle().getAttribute('aria-expanded'), hidden: body().hidden }).toEqual({ expanded: 'true', hidden: false })
    // 탭 본문은 탭을 옮기면 내려간다 — 편 상태는 우측 패널이 든다(`ComponentCommentsOpenProvider`).
    fireEvent.click(screen.getByRole('tab', { name: '페이지 정보' }))
    fireEvent.click(screen.getByRole('tab', { name: '컴포넌트' }))
    await waitFor(() => expect(toggle()).not.toBeNull())
    expect(toggle().getAttribute('aria-expanded')).toBe('true')
  })

  it('그 노드에 쓰던 초안이 있으면 접혀 있어도 펴 두고 접기 단추를 끈다', async () => {
    await openPage(pageDoc(ROOT), { apiOverrides: { listComments: async () => COMMENTS } })
    pick('n_a')
    await waitFor(() => expect(count()).toBe('2개'))
    // «코멘트» 탭에서 n_a 에 쓴다 — 같은 칸의 초안이다.
    fireEvent.click(screen.getByRole('tab', { name: '코멘트' }))
    fireEvent.change(await screen.findByLabelText('새 코멘트'), { target: { value: '쓰던 말' } })
    fireEvent.click(screen.getByRole('tab', { name: '컴포넌트' }))
    await waitFor(() => expect(toggle()).not.toBeNull())
    expect({ expanded: toggle().getAttribute('aria-expanded'), disabled: toggle().disabled, hidden: body().hidden }).toEqual({
      expanded: 'true',
      disabled: true,
      hidden: false,
    })
  })
})
