/**
 * **별칭이 이름이 되는 자리 — 웹**(설계서 「설계서 화면 구조」의 노드 별칭 «보이는 자리»). 상호작용 탭의 문장 · 머리 · 대상 고르개,
 * 코멘트 탭의 «달 곳» · 무리 머리, 캔버스 옮기기 손잡이가 별칭을 든다. 구조 트리 줄은 `./structure-row-name.test.tsx`, 속성 패널
 * 제목은 `./node-alias.test.tsx` 가 잰다. 이름은 `@wirebound/schema` 가 짓는다(`describeNode` · `nodeHeading`) — 여기는 화면이 그것을
 * 부르는가다.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import type { PageDocument } from '@wirebound/schema'
import { describe, expect, it } from 'vitest'
import type { Comment } from '../../src/api/types'
import { canvasQuery, openPage, pageDoc } from '../editor-harness'
import '../../src/catalog-setup'

function doc(): PageDocument {
  return pageDoc({
    id: 'n_root',
    type: 'Page',
    children: [
      {
        id: 'n_save',
        type: 'Button',
        alias: '머리 저장',
        marker: 1,
        props: { label: '저장' },
        interactions: [{ on: 'click', actions: [{ type: 'setVisible', target: 'n_list', value: false }] }],
      },
      { id: 'n_list', type: 'DataGrid', alias: '회원 목록', marker: 2 },
      { id: 'n_plain', type: 'Text', props: { content: '안내' } },
    ],
  })
}

const COMMENTS: Comment[] = [
  {
    id: 'c-1',
    nodeId: 'n_list',
    body: '정렬',
    authorId: 'u-2',
    authorName: '보라',
    createdAt: '2026-10-04T00:00:00Z',
    updatedAt: '2026-10-04T00:00:00Z',
  },
  {
    id: 'c-2',
    nodeId: 'n_plain',
    body: '문구',
    authorId: 'u-2',
    authorName: '보라',
    createdAt: '2026-10-04T00:00:00Z',
    updatedAt: '2026-10-04T00:00:00Z',
  },
]

async function openTab(name: '상호작용' | '코멘트'): Promise<void> {
  fireEvent.click(screen.getByRole('tab', { name }))
  await waitFor(() => expect(screen.getByRole('tab', { name }).getAttribute('aria-selected')).toBe('true'))
}

function pick(nodeId: string): void {
  fireEvent.click(canvasQuery(`[data-wb-id="${nodeId}"]`) as HTMLElement)
}

describe('상호작용 탭', () => {
  it('문장 · 고른 노드의 머리 · 대상 고르개가 별칭으로 부른다', async () => {
    await openPage(doc())
    // 캔버스에서 고르면 탭이 «컴포넌트» 로 옮긴다(`src/shell/canvas-pick.tsx`) — 고른 뒤 탭을 연다.
    pick('n_save')
    await openTab('상호작용')

    const sentences = [...document.body.querySelectorAll('.wb-shell-interaction-sentence')].map((element) => element.textContent?.trim())
    expect(sentences).toContain('① 머리 저장 클릭 시 ② 회원 목록이 숨겨집니다')
    expect(document.body.querySelector('.wb-shell-panel-subtitle')?.textContent).toBe('① 머리 저장')
    const select = screen.getByLabelText('대상') as HTMLSelectElement
    expect([...select.options].map((option) => option.textContent)).toEqual([
      '— 대상을 고르세요 —',
      '페이지',
      '① 머리 저장',
      '② 회원 목록',
      '안내 텍스트',
    ])
  })
})

describe('코멘트 탭', () => {
  it('«달 곳» 이 `타입 (별칭)` 을 말한다 — 별칭이 없으면 지금 그대로', async () => {
    await openPage(doc(), { apiOverrides: { listComments: async () => [] } })
    const target = (): string => document.body.querySelector('#wb-comment-target')?.textContent ?? '(없음)'
    // 캔버스에서 고르면 탭이 «컴포넌트» 로 옮긴다(`src/shell/canvas-pick.tsx`) — 고를 때마다 «코멘트» 탭을 다시 연다.
    pick('n_save')
    await openTab('코멘트')
    await waitFor(() => expect(target()).toBe('달 곳: 1 Button (머리 저장) (n_save)'))
    pick('n_plain')
    await openTab('코멘트')
    await waitFor(() => expect(target()).toBe('달 곳: – Text (n_plain)'))
  })

  it('무리 머리가 별칭과 id 를 말한다 — 별칭이 없으면 id 만', async () => {
    await openPage(doc(), { apiOverrides: { listComments: async () => COMMENTS } })
    await openTab('코멘트')
    await waitFor(() => expect(document.body.querySelectorAll('.wb-shell-comment-group-title')).toHaveLength(2))
    const titles = [...document.body.querySelectorAll('.wb-shell-comment-group-title')].map((element) =>
      element.textContent?.replace(/\s+/g, ' ').trim(),
    )
    expect(titles).toEqual(['2 회원 목록 (n_list)', '– n_plain'])
  })
})

describe('캔버스 옮기기 손잡이', () => {
  it('이름이 `타입 (별칭) 옮기기` 다', async () => {
    await openPage(doc())
    pick('n_save')
    expect(within(document.body).getByRole('button', { name: 'Button (머리 저장) 옮기기' })).toBeTruthy()
  })
})
