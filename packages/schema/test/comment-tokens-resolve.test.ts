/**
 * 코멘트 토큰 풀기 — 설계 «풀린 모양» 표의 줄마다 하나. 재번호(Review Focus 1) · 남의 프로젝트 id(Review Focus 2) · 번호 걷힌 노드와 노드째
 * 지운 번호(Review Focus 5)를 함께 둔다.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import {
  buildMarkerIndex,
  commentTokenText,
  formatCommentToken,
  indexCodes,
  installCatalog,
  nodeDisplayName,
  resolveCommentTokens,
  type CommentTokenContext,
  type PageDocument,
  type WbNode,
} from '../src/index'

beforeAll(() => {
  installCatalog()
})

const LIST = '11111111-1111-4111-8111-111111111111'
const DETAIL = '22222222-2222-4222-8222-222222222222'
const TWIN_A = '33333333-3333-4333-8333-333333333333'
const TWIN_B = '44444444-4444-4444-8444-444444444444'
const FOREIGN = '99999999-9999-4999-8999-999999999999'

const button: WbNode = { id: 'n_btn', type: 'Button', props: { label: '저장' } }
const grid: WbNode = { id: 'n_grid', type: 'DataGrid', marker: 3 }
const listDoc: PageDocument = { version: 2, root: { id: 'n_root', type: 'Page', children: [grid, button] } }
const detailDoc: PageDocument = {
  version: 2,
  root: { id: 'n_root', type: 'Page', children: [{ id: 'n_form', type: 'EntryForm', marker: 1 }] },
}

const codes = indexCodes([
  {
    key: 'STATUS',
    name: '회원 상태',
    items: [
      { value: 'A/B', name: '활성', active: true },
      { value: 'OFF', name: '꺼짐', active: false },
    ],
  },
])

function context(overrides: Partial<CommentTokenContext> = {}, docs = { list: listDoc, detail: detailDoc }): CommentTokenContext {
  return {
    currentPageId: LIST,
    pages: new Map([
      [LIST, { title: '회원 목록', menuPath: '관리자 › 회원' }],
      [DETAIL, { title: '회원 상세', menuPath: '관리자 › 회원' }],
      [TWIN_A, { title: '목록', menuPath: '관리자 › 상품' }],
      [TWIN_B, { title: '목록', menuPath: '관리자 › 주문' }],
    ]),
    markers: buildMarkerIndex(
      [
        { id: LIST, document: docs.list },
        { id: DETAIL, document: docs.detail },
        {
          id: TWIN_A,
          document: { version: 2, root: { id: 'n_root', type: 'Page', children: [{ id: 'n_x', type: 'DataGrid', marker: 2 }] } },
        },
      ],
      codes,
    ),
    codes,
    ...overrides,
  }
}

const token = (label: string, target: Parameters<typeof formatCommentToken>[1]) => formatCommentToken(label, target)

describe('resolveCommentTokens — 풀린 모양', () => {
  it('페이지는 제목', () => {
    const body = token('옛 제목', { kind: 'page', pageId: DETAIL })
    expect(resolveCommentTokens(body, context())).toEqual([{ type: 'link', text: '회원 상세', target: { kind: 'page', pageId: DETAIL } }])
  })

  it('같은 제목이 둘이면 «메뉴 › 제목»', () => {
    const body = token('목록', { kind: 'page', pageId: TWIN_B })
    expect(resolveCommentTokens(body, context())[0]).toMatchObject({ type: 'link', text: '관리자 › 주문 › 목록' })
  })

  it('같은 페이지의 번호는 «#3»', () => {
    const body = token('옛', { kind: 'comment', pageId: LIST, nodeId: 'n_grid' })
    expect(resolveCommentTokens(body, context())).toEqual([
      { type: 'link', text: '#3', target: { kind: 'comment', pageId: LIST, nodeId: 'n_grid' } },
    ])
  })

  it('다른 페이지의 번호는 «회원 상세 #1» · 같은 제목이면 메뉴를 앞에', () => {
    expect(resolveCommentTokens(token('옛', { kind: 'comment', pageId: DETAIL, nodeId: 'n_form' }), context())[0]).toMatchObject({
      type: 'link',
      text: '회원 상세 #1',
    })
    expect(resolveCommentTokens(token('옛', { kind: 'comment', pageId: TWIN_A, nodeId: 'n_x' }), context())[0]).toMatchObject({
      type: 'link',
      text: '관리자 › 상품 › 목록 #2',
    })
  })

  // Review Focus 1
  it('재번호 뒤에는 새 번호로 보인다 — 같은 대상', () => {
    const body = token('#3', { kind: 'comment', pageId: LIST, nodeId: 'n_grid' })
    const renumbered: PageDocument = { version: 2, root: { id: 'n_root', type: 'Page', children: [{ ...grid, marker: 1 }, button] } }
    expect(resolveCommentTokens(body, context({}, { list: renumbered, detail: detailDoc }))).toEqual([
      { type: 'link', text: '#1', target: { kind: 'comment', pageId: LIST, nodeId: 'n_grid' } },
    ])
  })

  // Review Focus 5
  it('번호가 걷힌 노드는 «회원 목록 › 노드 이름» 링크', () => {
    const body = token('#9', { kind: 'comment', pageId: LIST, nodeId: 'n_btn' })
    expect(resolveCommentTokens(body, context())).toEqual([
      { type: 'link', text: `회원 목록 › ${nodeDisplayName(button)}`, target: { kind: 'comment', pageId: LIST, nodeId: 'n_btn' } },
    ])
    expect(nodeDisplayName(button)).toContain('저장')
  })

  it('노드째 지운 번호는 끊김 — 대체 글', () => {
    const body = token('회원 목록 #4', { kind: 'comment', pageId: LIST, nodeId: 'n_gone' })
    expect(resolveCommentTokens(body, context())).toEqual([{ type: 'broken', text: '회원 목록 #4' }])
  })

  it('공통코드 그룹 · 항목(사용 안 함도 이름) · 끊긴 그룹 · 항목', () => {
    const ctx = context()
    expect(resolveCommentTokens(token('옛', { kind: 'code', group: 'STATUS' }), ctx)[0]).toMatchObject({ type: 'link', text: '회원 상태' })
    expect(resolveCommentTokens(token('옛', { kind: 'code', group: 'STATUS', item: 'A/B' }), ctx)[0]).toMatchObject({
      type: 'link',
      text: '활성',
    })
    expect(resolveCommentTokens(token('옛', { kind: 'code', group: 'STATUS', item: 'OFF' }), ctx)[0]).toMatchObject({ text: '꺼짐' })
    expect(resolveCommentTokens(token('옛 그룹', { kind: 'code', group: 'GONE' }), ctx)).toEqual([{ type: 'broken', text: '옛 그룹' }])
    expect(resolveCommentTokens(token('옛 항목', { kind: 'code', group: 'STATUS', item: 'X' }), ctx)).toEqual([
      { type: 'broken', text: '옛 항목' },
    ])
  })

  it('표를 못 받은 컨텍스트에서 코드 토큰은 끊김(대체 글)', () => {
    const { codes: _codes, ...rest } = context()
    expect(resolveCommentTokens(token('옛', { kind: 'code', group: 'STATUS' }), rest)).toEqual([{ type: 'broken', text: '옛' }])
  })

  // Review Focus 2
  it('컨텍스트에 없는 페이지 id 는 대체 글 그대로 끊김 — 컨텍스트 밖 이름을 안 낸다', () => {
    const ctx = context()
    const body = [
      token('남의 페이지', { kind: 'page', pageId: FOREIGN }),
      token('남의 번호', { kind: 'comment', pageId: FOREIGN, nodeId: 'n_grid' }),
    ].join(' ')
    const out = resolveCommentTokens(body, ctx)
    expect(out).toEqual([
      { type: 'broken', text: '남의 페이지' },
      { type: 'text', text: ' ' },
      { type: 'broken', text: '남의 번호' },
    ])
    expect(commentTokenText(body, ctx, true)).toBe('남의 페이지 (찾을 수 없음) 남의 번호 (찾을 수 없음)')
  })

  it('보통 글 · 모르는 꼴은 원문 그대로', () => {
    const body = '보세요 [링크](https://x.y) 와 [a](wb:)'
    expect(resolveCommentTokens(body, context())).toEqual([{ type: 'text', text: body }])
  })
})

describe('commentTokenText', () => {
  const body = `앞 ${token('옛', { kind: 'comment', pageId: DETAIL, nodeId: 'n_form' })} · ${token('옛', { kind: 'code', group: 'STATUS', item: 'A/B' })} · ${token('없음', { kind: 'page', pageId: FOREIGN })}`

  it('대상 없이(PPTX · CLI 사람 출력)', () => {
    expect(commentTokenText(body, context(), false)).toBe('앞 회원 상세 #1 · 활성 · 없음 (찾을 수 없음)')
  })

  it('대상과 함께(MCP · CLI --json)', () => {
    expect(commentTokenText(body, context(), true)).toBe(
      `앞 회원 상세 #1 (comment:${DETAIL}/n_form) · 활성 (code:STATUS/A%2FB) · 없음 (찾을 수 없음)`,
    )
  })
})

describe('buildMarkerIndex', () => {
  it('모든 노드를 «페이지/노드» 열쇠로 — 번호 없으면 null', () => {
    const index = buildMarkerIndex([{ id: LIST, document: listDoc }])
    expect(index.get(`${LIST}/n_grid`)).toEqual({ marker: 3, nodeName: nodeDisplayName(grid) })
    expect(index.get(`${LIST}/n_btn`)).toEqual({ marker: null, nodeName: nodeDisplayName(button) })
    expect(index.get(`${LIST}/n_root`)?.marker).toBeNull()
    expect(index.size).toBe(3)
  })
})
