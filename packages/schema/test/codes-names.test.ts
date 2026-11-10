/**
 * 상호작용 문장(`listInteractionSentences` · `describeInteraction`) · `pageView` 의 `interactions` 가 표(`CodeIndex`)를 받으면 묶인 노드를
 * **표의 이름**으로 부른다. 표를 안 넘긴 자리는 prop 의 대체 글이다. 사용처 목록의 이름은 `codes-usage.test.ts` 가 잰다.
 *
 * 픽스처는 prop 의 대체 글(«옛 …»)과 표의 이름(«새 …»)을 다르게 둔다 — 같으면 표를 안 받는 판과 받는 판이 같은 글을 낸다.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import {
  describeInteraction,
  indexCodes,
  installCatalog,
  listInteractionSentences,
  pageView,
  resetRegistry,
  type CodeTable,
  type PageDocument,
  type WbNode,
} from '../src/index'

beforeAll(() => {
  resetRegistry()
  installCatalog()
})

const TABLE: CodeTable = [
  {
    key: 'ORDER_STATUS',
    name: '주문 상태',
    items: [
      { value: 'WAIT', name: '새 대기', active: true },
      { value: 'TAB', name: '새 탭', active: true },
    ],
  },
]
const CODES = indexCodes(TABLE)

const button: WbNode = {
  id: 'n_btn',
  type: 'Button',
  props: { label: '옛 대기' },
  code: { group: 'ORDER_STATUS', item: 'WAIT' },
  interactions: [
    {
      on: 'click',
      actions: [
        { type: 'setVisible', target: 'n_affix', value: false },
        { type: 'switchTab', target: 'n_panel' },
      ],
    },
  ],
}
const affix: WbNode = { id: 'n_affix', type: 'Affix', props: { text: '옛 대기' }, code: { group: 'ORDER_STATUS', item: 'WAIT' } }
const tabs: WbNode = {
  id: 'n_tabs',
  type: 'Tabs',
  children: [
    { id: 'n_first', type: 'TabPanel', props: { label: '첫 탭' } },
    { id: 'n_panel', type: 'TabPanel', props: { label: '옛 탭' }, code: { group: 'ORDER_STATUS', item: 'TAB' } },
  ],
}
const doc: PageDocument = { version: 1, root: { id: 'n_root', type: 'Page', children: [button, affix, tabs] } }

describe('상호작용 문장의 노드 이름', () => {
  const WITH = '새 대기 버튼 클릭 시 새 대기 사이 글자가 숨겨집니다, 탭이 "새 탭" 탭으로 바뀝니다'
  const WITHOUT = '옛 대기 버튼 클릭 시 옛 대기 사이 글자가 숨겨집니다, 탭이 "옛 탭" 탭으로 바뀝니다'

  it('표를 받으면 트리거 · 대상 · 탭 이름이 표의 이름이다', () => {
    expect(listInteractionSentences(doc, CODES).map((sentence) => sentence.text)).toEqual([WITH])
    expect(describeInteraction(doc, button, button.interactions![0]!, CODES)).toBe(WITH)
  })

  it('표를 안 받으면 대체 글이다', () => {
    expect(listInteractionSentences(doc).map((sentence) => sentence.text)).toEqual([WITHOUT])
    expect(describeInteraction(doc, button, button.interactions![0]!)).toBe(WITHOUT)
  })

  it('pageView 의 interactions 가 표의 이름을 쓴다', () => {
    const view = pageView({ document: doc, comments: [], codes: CODES } as never)
    expect(view.interactions.map((sentence) => sentence.text)).toEqual([WITH])
  })
})
