// @vitest-environment jsdom
/**
 * **내보낸 HTML 설계서가 별칭으로 노드를 부르는가**(설계서 「설계서 화면 구조」의 노드 별칭 «보이는 자리» — 내보낸 설계서의 상호작용
 * 목록 · 코멘트 탭). 문장 · 이름은 `@wirebound/schema` 가 짓고(`listInteractionSentences` · `describeNode`) 번들은 그것을 React 로
 * 그려 HTML 에 싣는다 — 별칭에 든 `<script>` 는 글로 남고 요소가 되지 않는다(`./escape.test.ts` 의 «자리 넷»과 같은 길).
 */
import { installCatalog, type PageDocument } from '@wirebound/schema'
import { beforeAll, describe, expect, it } from 'vitest'
import { exportBundle } from '../src/bundle/index'

beforeAll(() => {
  installCatalog()
})

const HOSTILE = '<script>window.__hit=1</script>저장'

const DOC: PageDocument = {
  version: 1,
  root: {
    id: 'n_root',
    type: 'Page',
    children: [
      {
        id: 'n_save',
        type: 'Button',
        alias: HOSTILE,
        marker: 1,
        props: { label: '저장' },
        interactions: [{ on: 'click', actions: [{ type: 'setVisible', target: 'n_list', value: false }] }],
      },
      { id: 'n_list', type: 'List', alias: '회원 목록', marker: 2 },
    ],
  },
}

function pageDom(): Document {
  const bundle = exportBundle({
    pages: [{ title: '별칭', document: DOC, comments: [{ nodeId: 'n_list', body: '정렬' }] }],
    runtimeJs: '/* runtime */',
  })
  const file = bundle.files.find((candidate) => candidate.path === bundle.pagePaths[0])!
  return new DOMParser().parseFromString(String(file.content), 'text/html')
}

describe('내보낸 설계서 — 별칭', () => {
  it('상호작용 목록의 문장이 별칭으로 부른다', () => {
    const lines = [...pageDom().querySelectorAll('[data-wb-interaction-for] .wb-export-entry-body')].map((line) => line.textContent)
    expect(lines).toEqual([`① ${HOSTILE} 클릭 시 ② 회원 목록이 숨겨집니다`])
  })

  it('코멘트 탭의 노드 이름도 별칭이다', () => {
    const labels = [...pageDom().querySelectorAll('[data-wb-marker-for="n_list"] .wb-export-entry-label')].map((label) => label.textContent)
    expect(labels).toContain('② 회원 목록')
  })

  it('별칭의 `<script>` 는 글로 남는다 — 요소가 되지 않는다', () => {
    const dom = pageDom()
    const scripts = [...dom.querySelectorAll('script')].map((script) => script.textContent ?? '')
    expect(scripts.some((text) => text.includes('window.__hit=1') && !text.includes('"alias"'))).toBe(false)
    expect(dom.body.innerHTML).toContain('&lt;script&gt;window.__hit=1&lt;/script&gt;저장')
  })
})
