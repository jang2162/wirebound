/**
 * **코멘트 패널이 본문의 토큰을 풀어 링크로 그리고, 누르면 그 자리로 간다**(설계 `docs/superpowers/specs/2026-11-11-comment-tokens-design.md`
 * «풀린 모양» · «이동»). jsdom 값이다 — 다른 페이지 번호 토큰을 눌러 그 페이지 · 노드 · 강조가 서는 실브라우저 판은
 * `build-test/comment-tokens.test.ts`.
 *
 * 재번호 뒤 «#3» → «#1»(Review Focus 1) · 노드째 지운 번호와 번호 걷힌 노드(Review Focus 5) · 신호 셋 뒤 다시 풀림을 함께 둔다.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { formatCommentToken, nodeDisplayName, type CodeGroup, type PageDocument, type WbNode } from '@wirebound/schema'
import type { ApiClient } from '../../src/api/client'
import type { Comment, CommentIndex } from '../../src/api/types'
import type { RealtimeSocket } from '../../src/realtime/connection'
import { createConnectionIdHolder } from '../../src/realtime/context'
import { createEditChannel } from '../../src/realtime/edit-channel'
import { createCommentSignals } from '../../src/realtime/comment-signals'
import { HEAD_SEQ, PROJECT_ID, PROJECT_NAME, pageDoc, renderEditor, waitForNode } from '../editor-harness'
import { currentPath, currentSearch } from '../helpers'
import '../../src/catalog-setup'

const LIST = '11111111-1111-4111-8111-111111111111'
const DETAIL = '22222222-2222-4222-8222-222222222222'
const FOREIGN = '99999999-9999-4999-8999-999999999999'

class FakeSocket implements RealtimeSocket {
  onopen: (() => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  send(): void {}
  close(): void {
    this.onclose?.()
  }
}

const button: WbNode = { id: 'n_btn', type: 'Button', props: { label: '저장' } }
function listDoc(marker = 3): PageDocument {
  return pageDoc({ id: 'n_root', type: 'Page', children: [{ id: 'n_grid', type: 'DataGrid', marker }, button] })
}
const detailDoc = (): PageDocument => pageDoc({ id: 'n_root2', type: 'Page', children: [{ id: 'n_form', type: 'EntryForm', marker: 1 }] })

const STATUS: CodeGroup = { key: 'STATUS', name: '회원 상태', items: [{ value: 'ON', name: '활성', active: true }] }

function index(over: Partial<CommentIndex> = {}): CommentIndex {
  return {
    pages: [
      { id: LIST, title: '회원 목록', menuPath: '회원' },
      { id: DETAIL, title: '회원 상세', menuPath: '회원' },
    ],
    markers: [{ pageId: DETAIL, nodeId: 'n_form', marker: 1, nodeName: '등록 폼', firstComment: '' }],
    ...over,
  }
}

const t = formatCommentToken
const BODY = [
  `같은 번호 ${t('옛 번호', { kind: 'comment', pageId: LIST, nodeId: 'n_grid' })}`,
  `페이지 ${t('옛 제목', { kind: 'page', pageId: DETAIL })}`,
  `남 번호 ${t('옛', { kind: 'comment', pageId: DETAIL, nodeId: 'n_form' })}`,
  `코드 ${t('옛 코드', { kind: 'code', group: 'STATUS', item: 'ON' })}`,
  `남의 것 ${t('남의 페이지', { kind: 'page', pageId: FOREIGN })}`,
  `걷힌 번호 ${t('#9', { kind: 'comment', pageId: LIST, nodeId: 'n_btn' })}`,
  `지운 노드 ${t('회원 목록 #4', { kind: 'comment', pageId: LIST, nodeId: 'n_gone' })}`,
].join('\n')

function comment(over: Partial<Comment> & Pick<Comment, 'id' | 'nodeId' | 'body'>): Comment {
  return { authorId: 'u-1', authorName: '테스터', createdAt: '2026-11-11T00:00:00.000Z', updatedAt: '2026-11-11T00:00:00.000Z', ...over }
}

async function stage(options: { indexes?: CommentIndex[]; codes?: CodeGroup[][]; overrides?: Partial<ApiClient> } = {}) {
  const sockets: FakeSocket[] = []
  const indexes = options.indexes ?? [index()]
  const codes = options.codes ?? [[STATUS]]
  const commentIndex = vi.fn(async () => indexes[Math.min(commentIndex.mock.calls.length - 1, indexes.length - 1)]!)
  let codeCalls = 0
  const comments = createCommentSignals()
  renderEditor({
    docs: { [LIST]: listDoc(), [DETAIL]: detailDoc() },
    route: `/projects/${PROJECT_ID}/pages/${LIST}`,
    realtime: {
      holder: createConnectionIdHolder(),
      channel: createEditChannel(),
      comments,
      origin: 'http://localhost:5173',
      connection: {
        createSocket: () => {
          const socket = new FakeSocket()
          sockets.push(socket)
          return socket
        },
        schedule: (run) => {
          queueMicrotask(run)
          return 1
        },
        cancel: () => {},
      },
    },
    apiOverrides: {
      commentIndex,
      listCodes: async () => codes[Math.min(codeCalls++, codes.length - 1)]!,
      listComments: async (_project, pageId) =>
        pageId === LIST
          ? [comment({ id: 'c1', nodeId: 'n_grid', body: BODY })]
          : [comment({ id: 'c2', nodeId: 'n_form', body: '상세에 단 말' })],
      ...options.overrides,
    },
  })
  await screen.findByRole('heading', { name: PROJECT_NAME })
  await waitForNode('n_root')
  act(() => sockets[0]?.onopen?.())
  fireEvent.click(screen.getByRole('tab', { name: '코멘트' }))
  await waitFor(() => expect(body().querySelectorAll('a').length).toBeGreaterThan(0))
  return {
    commentIndex,
    frame: (data: Record<string, unknown>) =>
      act(() => sockets.at(-1)?.onmessage?.({ data: JSON.stringify({ projectId: PROJECT_ID, ...data }) })),
  }
}

function body(): HTMLElement {
  const found = document.body.querySelector<HTMLElement>('.wb-shell-comments .wb-shell-comment-body')
  if (found === null) throw new Error('코멘트 본문이 없습니다')
  return found
}

const links = (): string[] => [...body().querySelectorAll('a')].map((a) => a.textContent ?? '')

describe('코멘트 토큰 — 풀어 보이기', () => {
  it('토큰을 지금의 이름 · 번호 링크로 그리고 날 id 는 글자에 없다', async () => {
    await stage()
    expect(links()).toEqual(['#3', '회원 상세', '회원 상세 #1', '활성', `회원 목록 › ${nodeDisplayName(button)}`])
    const text = body().textContent ?? ''
    for (const id of [LIST, DETAIL, FOREIGN, 'n_grid', 'n_form', 'n_btn', 'n_gone', 'wb:']) expect(text).not.toContain(id)
  })

  it('끊긴 토큰은 단추 · 링크가 아니고 «찾을 수 없음» 이다 — 남의 id · 노드째 지운 번호', async () => {
    await stage()
    const broken = [...body().querySelectorAll('.wb-shell-comment-token-broken')].map((el) => el.textContent)
    expect(broken).toEqual(['남의 페이지 찾을 수 없음', '회원 목록 #4 찾을 수 없음'])
    expect(within(body()).queryAllByRole('button')).toEqual([])
    for (const el of body().querySelectorAll('.wb-shell-comment-token-broken')) expect(el.closest('a')).toBeNull()
  })

  // Review Focus 1
  it('재번호 편집 뒤 «#3» 이 «#1» 로 선다 — 같은 노드를 가리킨다', async () => {
    await stage({
      overrides: {
        renumberComments: async () => ({
          seq: HEAD_SEQ + 1,
          markerOps: [{ op: 'replace' as const, path: '/root/children/0/marker', value: 1 }],
        }),
      },
    })
    expect(links()[0]).toBe('#3')
    fireEvent.click(screen.getByRole('button', { name: '문서 순서대로 재번호' }))
    await waitFor(() => expect(links()[0]).toBe('#1'))
    expect(body().querySelector('a')?.getAttribute('href')).toBe(`/projects/${PROJECT_ID}/pages/${LIST}?node=n_grid&comment=1`)
  })

  it('comments-changed 뒤 다시 읽어 다른 페이지 번호가 새 값이다', async () => {
    const board = await stage({
      indexes: [index(), index({ markers: [{ pageId: DETAIL, nodeId: 'n_form', marker: 5, nodeName: '등록 폼', firstComment: '' }] })],
    })
    expect(links()[2]).toBe('회원 상세 #1')
    board.frame({ type: 'comments-changed', pageId: DETAIL })
    await waitFor(() => expect(links()[2]).toBe('회원 상세 #5'))
  })

  it('menu-changed 뒤 다시 읽어 페이지 제목이 새 값이다', async () => {
    const board = await stage({
      indexes: [index(), index({ pages: [index().pages[0]!, { id: DETAIL, title: '회원 정보', menuPath: '회원' }] })],
    })
    expect(links()[1]).toBe('회원 상세')
    board.frame({ type: 'menu-changed', rev: 9 })
    await waitFor(() => expect(links()[1]).toBe('회원 정보'))
  })

  it('codes-changed 뒤 코드 이름이 새 값이다', async () => {
    const board = await stage({ codes: [[STATUS], [{ ...STATUS, items: [{ value: 'ON', name: '사용 중', active: true }] }]] })
    expect(links()[3]).toBe('활성')
    board.frame({ type: 'codes-changed' })
    await waitFor(() => expect(links()[3]).toBe('사용 중'))
  })
})

describe('코멘트 토큰 — 누르면 간다', () => {
  it('페이지 토큰 → 그 페이지', async () => {
    await stage()
    fireEvent.click(within(body()).getByRole('link', { name: '회원 상세' }))
    await waitFor(() => expect(currentPath()).toBe(`/projects/${PROJECT_ID}/pages/${DETAIL}`))
    await waitForNode('n_root2')
  })

  it('다른 페이지 번호 토큰 → 그 페이지를 열고 노드를 고르고 코멘트 탭의 그 묶음을 강조', async () => {
    await stage()
    fireEvent.click(within(body()).getByRole('link', { name: '회원 상세 #1' }))
    await waitFor(() => expect(currentPath()).toBe(`/projects/${PROJECT_ID}/pages/${DETAIL}`))
    await waitFor(() => expect(document.body.querySelector('[data-comment-node="n_form"]')?.hasAttribute('data-flash')).toBe(true))
    expect(screen.getByRole('tab', { name: '코멘트' }).getAttribute('aria-selected')).toBe('true')
    // 고른 뒤 질의를 걷는다 — 뒤로 가기에 남지 않는다.
    await waitFor(() => expect(currentSearch()).toBe(''))
  })

  it('코드 토큰 → 공통코드 화면의 그 그룹 · 항목', async () => {
    await stage({ overrides: { codeUsageCounts: async () => ({}) } })
    fireEvent.click(within(body()).getByRole('link', { name: '활성' }))
    await waitFor(() => expect(currentPath()).toBe(`/projects/${PROJECT_ID}/codes`))
    expect(new URLSearchParams(currentSearch()).get('group')).toBe('STATUS')
    expect(new URLSearchParams(currentSearch()).get('item')).toBe('ON')
  })

  it('뷰 모드에서도 간다', async () => {
    await stage()
    fireEvent.click(screen.getByRole('button', { name: '뷰 모드' }))
    fireEvent.click(screen.getByRole('tab', { name: '코멘트' }))
    await waitFor(() => expect(links().length).toBeGreaterThan(0))
    fireEvent.click(within(body()).getByRole('link', { name: '회원 상세 #1' }))
    await waitFor(() => expect(document.body.querySelector('[data-comment-node="n_form"]')?.hasAttribute('data-flash')).toBe(true))
  })
})
