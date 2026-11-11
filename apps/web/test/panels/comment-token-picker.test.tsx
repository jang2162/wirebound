/**
 * 코멘트 글 상자의 `#` 자동완성(`src/panels/comment-token-picker.tsx`). jsdom 값이다 — 한글 조합 중의 Enter 는 jsdom 이 Chrome 의 차례를 못
 * 흉내 내 실브라우저 판이 잰다(`build-test/comment-token-picker.test.ts` · Review Focus 4).
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { COMMENT_BODY_MAX_LENGTH, formatCommentToken, type CodeGroup, type PageDocument } from '@wirebound/schema'
import type { ApiClient } from '../../src/api/client'
import type { CommentIndex } from '../../src/api/types'
import { PICK_TOO_LONG } from '../../src/panels/comment-token-picker'
import { HEAD_SEQ, PROJECT_ID, PROJECT_NAME, pageDoc, renderEditor, waitForNode } from '../editor-harness'
import '../../src/catalog-setup'

const LIST = '11111111-1111-4111-8111-111111111111'
const DETAIL = '22222222-2222-4222-8222-222222222222'

const listDoc = (): PageDocument =>
  pageDoc({
    id: 'n_root',
    type: 'Page',
    children: [
      { id: 'n_grid', type: 'DataGrid', marker: 1 },
      { id: 'n_btn', type: 'Button', props: { label: '저장' } },
    ],
  })

const INDEX: CommentIndex = {
  pages: [
    { id: LIST, title: '회원 목록', menuPath: '회원' },
    { id: DETAIL, title: '회원 상세', menuPath: '회원' },
  ],
  markers: [
    { pageId: LIST, nodeId: 'n_grid', marker: 1, nodeName: '목록 그리드', firstComment: '검색 조건은 AND' },
    { pageId: DETAIL, nodeId: 'n_form', marker: 2, nodeName: '등록 폼', firstComment: '필수 칸' },
  ],
}
const STATUS: CodeGroup = { key: 'STATUS', name: '회원 상태', items: [{ value: 'ON', name: '활성', active: true }] }

async function stage(overrides: Partial<ApiClient> = {}) {
  const createComment = vi.fn(async (_p: string, _pg: string, body: { nodeId: string; body: string }) => ({
    comment: { id: 'c-new', nodeId: body.nodeId, body: body.body, authorId: 'u-1', authorName: '테스터', createdAt: '', updatedAt: '' },
    marker: 1,
    seq: HEAD_SEQ,
    markerOps: [],
  }))
  renderEditor({
    docs: { [LIST]: listDoc() },
    route: `/projects/${PROJECT_ID}/pages/${LIST}`,
    apiOverrides: {
      commentIndex: async () => INDEX,
      listCodes: async () => [STATUS],
      listComments: async () => [],
      createComment,
      ...overrides,
    },
  })
  await screen.findByRole('heading', { name: PROJECT_NAME })
  await waitForNode('n_root')
  fireEvent.click(screen.getByRole('tab', { name: '코멘트' }))
  const box = (await screen.findByLabelText('새 코멘트')) as HTMLTextAreaElement
  await waitFor(() => expect(box.disabled).toBe(false))
  return { box, createComment }
}

/** 상자에 글을 치고 캐럿을 끝에 둔다(`input` 한 번 — 사람이 친 끝 상태). */
function type(box: HTMLTextAreaElement, text: string): void {
  box.focus()
  fireEvent.change(box, { target: { value: text, selectionStart: text.length, selectionEnd: text.length } })
}

const options = (): string[] =>
  screen.queryByRole('listbox') === null
    ? []
    : within(screen.getByRole('listbox'))
        .getAllByRole('option')
        .map((option) => option.querySelector('.wb-shell-comment-picker-label')?.textContent ?? '')

describe('# 자동완성', () => {
  it('# 로 열리고 다섯 무리가 그 차례로 선다', async () => {
    const { box } = await stage()
    type(box, '보세요 #')
    await waitFor(() => expect(options()).toEqual(['#1', '회원 상세', '회원 상세 #2', '회원 상태', '활성']))
    expect(box.getAttribute('aria-expanded')).toBe('true')
    const groups = within(screen.getByRole('listbox'))
      .getAllByRole('option')
      .map((o) => o.querySelector('.wb-shell-comment-picker-group')?.textContent)
    expect(groups).toEqual(['이 페이지 번호', '페이지', '다른 페이지 번호', '공통코드 그룹', '공통코드 항목'])
  })

  it('친 글로 거른다 — 이름 · 덧말(노드 이름 · 첫 코멘트 · 키)', async () => {
    const { box } = await stage()
    type(box, '#상세')
    await waitFor(() => expect(options()).toEqual(['회원 상세', '회원 상세 #2']))
    type(box, '#AND')
    await waitFor(() => expect(options()).toEqual(['#1']))
    type(box, '#status')
    await waitFor(() => expect(options()).toEqual(['회원 상태']))
  })

  it('단어 가운데의 # 로는 안 연다', async () => {
    const { box } = await stage()
    type(box, 'a#')
    expect(options()).toEqual([])
    expect(box.getAttribute('aria-expanded')).toBe('false')
  })

  it('↓ · Enter 로 고르면 #… 자리가 토큰 원문이 된다', async () => {
    const { box } = await stage()
    type(box, '보세요 #상세 끝')
    // 캐럿을 `#상세` 끝으로.
    fireEvent.change(box, { target: { value: '보세요 #상세 끝', selectionStart: 7, selectionEnd: 7 } })
    await waitFor(() => expect(options()).toEqual(['회원 상세', '회원 상세 #2']))
    fireEvent.keyDown(box, { key: 'ArrowDown' })
    expect(within(screen.getByRole('listbox')).getAllByRole('option')[1]!.getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(box, { key: 'Enter' })
    await waitFor(() =>
      expect(box.value).toBe(`보세요 ${formatCommentToken('회원 상세 #2', { kind: 'comment', pageId: DETAIL, nodeId: 'n_form' })} 끝`),
    )
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('누름으로 고른다', async () => {
    const { box } = await stage()
    type(box, '#활')
    await waitFor(() => expect(options()).toEqual(['활성']))
    fireEvent.click(within(screen.getByRole('listbox')).getByRole('option'))
    await waitFor(() => expect(box.value).toBe(formatCommentToken('활성', { kind: 'code', group: 'STATUS', item: 'ON' })))
  })

  it('Escape 는 닫고 #… 를 보통 글로 둔다 — 그 # 로는 다시 안 연다', async () => {
    const { box } = await stage()
    type(box, '#회원')
    await waitFor(() => expect(options().length).toBeGreaterThan(0))
    fireEvent.keyDown(box, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(box.value).toBe('#회원')
    type(box, '#회원 상')
    expect(screen.queryByRole('listbox')).toBeNull()
    // 새 `#` 는 연다.
    type(box, '#회원 상 #')
    await waitFor(() => expect(options().length).toBeGreaterThan(0))
  })

  it('길이 한도를 넘는 고름은 넣지 않고 말한다', async () => {
    const { box } = await stage()
    const long = `${'가'.repeat(COMMENT_BODY_MAX_LENGTH - 5)} #활`
    type(box, long)
    await waitFor(() => expect(options()).toEqual(['활성']))
    fireEvent.keyDown(box, { key: 'Enter' })
    await waitFor(() => expect(screen.getByText(PICK_TOO_LONG)).toBeTruthy())
    expect(box.value).toBe(long)
  })

  it('조합 중(compositionstart ~ end)에는 열지 않고 끝난 뒤 거른다', async () => {
    const { box } = await stage()
    box.focus()
    fireEvent.compositionStart(box)
    fireEvent.change(box, { target: { value: '#상세', selectionStart: 3, selectionEnd: 3 } })
    expect(screen.queryByRole('listbox')).toBeNull()
    fireEvent.compositionEnd(box)
    await waitFor(() => expect(options()).toEqual(['회원 상세', '회원 상세 #2']))
  })

  it('저장 직전에 토큰의 라벨을 지금 이름으로 다시 적는다', async () => {
    const { box, createComment } = await stage()
    const stale = formatCommentToken('옛 이름 #9', { kind: 'comment', pageId: DETAIL, nodeId: 'n_form' })
    type(box, `보세요 ${stale}`)
    fireEvent.click(screen.getByRole('button', { name: '코멘트 달기' }))
    await waitFor(() => expect(createComment).toHaveBeenCalledTimes(1))
    expect(createComment.mock.calls[0]![2].body).toBe(
      `보세요 ${formatCommentToken('회원 상세 #2', { kind: 'comment', pageId: DETAIL, nodeId: 'n_form' })}`,
    )
  })

  it('고치는 상자에서도 연다 · 고른다', async () => {
    await stage({
      listComments: async () => [
        { id: 'c1', nodeId: 'n_grid', body: '처음 글', authorId: 'u-1', authorName: '테스터', createdAt: '', updatedAt: '' },
      ],
    })
    fireEvent.click(await screen.findByRole('button', { name: '수정' }))
    const edit = (await screen.findByLabelText('코멘트 수정')) as HTMLTextAreaElement
    type(edit, '처음 글 #활')
    await waitFor(() => expect(options()).toEqual(['활성']))
    fireEvent.keyDown(edit, { key: 'Enter' })
    await waitFor(() => expect(edit.value).toBe(`처음 글 ${formatCommentToken('활성', { kind: 'code', group: 'STATUS', item: 'ON' })}`))
  })
})
