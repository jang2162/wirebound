/**
 * **`page get`과 설계서 「MCP 도구」의 `get_page`가 낼 것.**
 *
 * 여기서 재는 것은 *"무엇을 싣는가"*이고 글자 모양은 CLI가 잰다 — 그것이 이 파일과 CLI의 경계다.
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
        interactions: [{ on: 'click', actions: [{ type: 'setProp', target: 'list', prop: 'loading', value: true }] }],
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
    expect(view().interactions.map((sentence) => sentence.text)).toEqual(['① 검색 버튼 클릭 시 ② 목록이 로딩 상태로 바뀝니다'])
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
   * **`사라진 노드`라고 부르는 자리를 따로 두지 않는다.** 상호작용 문장이 같은 상태를
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

describe('화면 상태 — 목록과 가지마다 상태 이름', () => {
  const 상태문서: PageDocument = {
    version: 1,
    viewStates: [
      { id: 's_admin', name: '관리자' },
      { id: 's_guest', name: '비로그인' },
    ],
    root: {
      id: 'r',
      type: 'Page',
      children: [
        { id: 't', type: 'Text', props: { content: '밖' } },
        {
          id: 'sw',
          type: 'StateSwitch',
          children: [
            { id: 'cd', type: 'StateCase', props: { state: 'default' }, children: [{ id: 'v', type: 'Button', props: { label: '보기' } }] },
            { id: 'ca', type: 'StateCase', props: { state: 's_admin' }, children: [{ id: 'a', type: 'Button', props: { label: '승인' } }] },
          ],
        },
      ],
    },
  }
  const 읽음 = () =>
    pageView({ id: 'p', title: '상태', description: null, target: 'page:상태', menuPath: [], document: 상태문서, comments: [] })

  it('목록을 그대로 싣는다 — 목록이 없는 문서는 빈 목록이다', () => {
    expect(읽음().viewStates).toEqual(상태문서.viewStates)
    expect(view().viewStates).toEqual([])
  })

  it('가지와 그 안 노드가 속한 상태(id · 이름)를 싣고, 영역 밖 노드는 그 키가 없다', () => {
    const byId = new Map(읽음().nodes.map((node) => [node.id, node]))
    expect(byId.get('ca')!.viewState).toEqual({ id: 's_admin', name: '관리자' })
    expect(byId.get('a')!.viewState).toEqual({ id: 's_admin', name: '관리자' })
    expect(byId.get('cd')!.viewState).toEqual({ id: 'default', name: '기본' })
    expect(byId.get('v')!.viewState).toEqual({ id: 'default', name: '기본' })
    expect('viewState' in byId.get('t')!).toBe(false)
    expect('viewState' in byId.get('sw')!).toBe(false)
  })
})
