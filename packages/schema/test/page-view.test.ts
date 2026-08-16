/**
 * **`page get`과 §12.2의 `get_page`가 낼 것**(P9-3 T4 · D4).
 *
 * 여기서 재는 것은 *"무엇을 싣는가"*이고 글자 모양은 CLI가 잰다 — 그 경계가 D4다.
 */
import { describe, expect, it } from 'vitest'
import { installCatalog } from '../src/component/catalog/index'
import { pageView } from '../src/page-view'
import type { PageDocument } from '../src/node'

installCatalog()

const 문서: PageDocument = {
  version: 1,
  root: {
    id: 'root',
    type: 'Page',
    children: [
      {
        id: 'btn',
        type: 'Button',
        marker: 1,
        props: { label: '검색' },
        interactions: [
          { on: 'click', actions: [{ type: 'setProp', target: 'list', prop: 'loading', value: true }] },
        ],
      },
      { id: 'card', type: 'Card', props: { title: '요약' }, children: [{ id: 'list', type: 'List', marker: 2 }] },
    ],
  },
} as PageDocument

function view(comments: { nodeId: string; body: string }[] = []) {
  return pageView({
    id: 'p1',
    title: '목록',
    description: '회원 목록',
    target: 'page:관리자/회원/목록',
    menuPath: ['관리자', '회원'],
    document: 문서,
    comments: comments.map((comment) => ({ ...comment, authorName: '사람', createdAt: '2026-08-16T00:00:00.000Z' })),
  })
}

describe('무엇을 싣는가', () => {
  it('접두를 벗긴 경로를 함께 낸다 — 사람이 치는 모양이다', () => {
    expect(view().path).toBe('관리자/회원/목록')
    expect(view().target).toBe('page:관리자/회원/목록')
  })

  it('노드를 읽는 순서로 펴고 깊이를 든다', () => {
    expect(view().nodes.map((node) => [node.depth, node.name])).toEqual([
      [0, '페이지'],
      [1, '① 검색 버튼'],
      [1, '요약 카드'],
      [2, '② 목록'],
    ])
  })

  it('노드 수가 편 목록의 길이와 같다 — 둘이 갈리면 화면이 거짓을 말한다', () => {
    expect(view().nodeCount).toBe(view().nodes.length)
    expect(view().nodeCount).toBe(4)
  })

  it('상호작용 문장을 다시 짜지 않는다 — `listInteractionSentences`의 것이다', () => {
    expect(view().interactions.map((sentence) => sentence.text)).toEqual([
      '① 검색 버튼 클릭 시 ② 목록이 로딩 상태로 바뀝니다',
    ])
  })

  it('문서를 그대로 든다 — `--json`이 이것을 낸다', () => {
    expect(view().document).toBe(문서)
  })
})

describe('코멘트가 붙은 노드를 이름으로 부른다', () => {
  it('문서에 있는 노드는 문장이 부르는 이름과 같다', () => {
    expect(view([{ nodeId: 'list', body: '정렬' }]).comments[0]?.nodeName).toBe('② 목록')
  })

  /**
   * **`사라진 노드`라고 부르는 자리를 새로 만들지 않았다.** 상호작용 문장이 같은 상태를
   * 부르는 말을 그대로 쓴다(`MISSING_NODE_NAME`) — 두 벌이면 갈린다.
   */
  it('문서에 없는 노드는 `사라진 노드`다', () => {
    expect(view([{ nodeId: '없는노드', body: '고아' }]).comments[0]?.nodeName).toBe('사라진 노드')
  })

  it('순서를 바꾸지 않는다 — 서버가 낸 순서가 대화의 순서다', () => {
    const result = view([
      { nodeId: 'list', body: '먼저' },
      { nodeId: 'btn', body: '나중' },
    ])
    expect(result.comments.map((comment) => comment.body)).toEqual(['먼저', '나중'])
  })
})
