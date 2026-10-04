/**
 * **별칭이 이름이 되는 자리 — schema 쪽**(설계서 「설계서 화면 구조」의 노드 별칭 «보이는 자리»). 문장 · 고르개 · 코멘트 · `pageView`
 * (CLI `page get` · MCP `get_page`)가 노드를 부르는 이름은 하나(`describeNode` → `nodeDisplayName`)이고, 그것이 별칭을 읽는다.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import {
  describeInteraction,
  describeNode,
  installCatalog,
  listInteractionSentences,
  pageView,
  resetRegistry,
  type PageDocument,
  type WbNode,
} from '../src/index'

beforeAll(() => {
  resetRegistry()
  installCatalog()
})

const save: WbNode = {
  id: 'n_save',
  type: 'Button',
  alias: '머리 저장',
  marker: 1,
  props: { label: '저장' },
  interactions: [{ on: 'click', actions: [{ type: 'setProp', target: 'n_list', prop: 'loading', value: true }] }],
}
const list: WbNode = { id: 'n_list', type: 'List', alias: '회원 목록', marker: 2 }
const plain: WbNode = { id: 'n_plain', type: 'Button', props: { label: '취소' } }

const doc: PageDocument = { version: 1, root: { id: 'n_root', type: 'Page', children: [save, list, plain] } }

describe('describeNode · 문장', () => {
  it('별칭이 있으면 별칭으로 부른다 — 번호는 그 앞에', () => {
    expect(describeNode(save)).toBe('① 머리 저장')
    expect(describeNode(list)).toBe('② 회원 목록')
  })

  it('별칭이 없으면 지금 이름 그대로', () => {
    expect(describeNode(plain)).toBe('취소 버튼')
  })

  it('상호작용 문장의 주어 · 대상이 별칭이고 조사는 별칭에 맞춘다', () => {
    expect(describeInteraction(doc, save, save.interactions![0]!)).toBe('① 머리 저장 클릭 시 ② 회원 목록이 로딩 상태로 바뀝니다')
    expect(listInteractionSentences(doc).map((sentence) => sentence.text)).toEqual([
      '① 머리 저장 클릭 시 ② 회원 목록이 로딩 상태로 바뀝니다',
    ])
  })
})

describe('pageView — CLI `page get` · MCP `get_page`', () => {
  const view = pageView({
    id: 'p1',
    title: '목록',
    description: null,
    target: 'page:관리자/목록',
    menuPath: ['관리자'],
    document: doc,
    comments: [{ nodeId: 'n_list', body: '정렬', authorName: '보라', createdAt: '2026-10-04T00:00:00Z' }],
  })

  it('노드마다 이름 · 별칭 · 줄 글(`rowLabel`)을 싣는다 — 별칭이 없으면 `alias` 키가 없다', () => {
    expect(view.nodes.map(({ id, name, alias, rowLabel }) => ({ id, name, alias, rowLabel }))).toEqual([
      { id: 'n_root', name: '페이지', alias: undefined, rowLabel: 'Page' },
      { id: 'n_save', name: '① 머리 저장', alias: '머리 저장', rowLabel: 'Button (머리 저장) 저장' },
      { id: 'n_list', name: '② 회원 목록', alias: '회원 목록', rowLabel: 'List (회원 목록) 컬럼 1 · 컬럼 2' },
      { id: 'n_plain', name: '취소 버튼', alias: undefined, rowLabel: 'Button 취소' },
    ])
    expect('alias' in view.nodes[0]!).toBe(false)
  })

  it('코멘트의 노드 이름도 별칭이다', () => {
    expect(view.comments[0]!.nodeName).toBe('② 회원 목록')
  })
})
