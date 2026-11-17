/**
 * «화면 상태 바꾸기» 의 문장이 번들 · PPTX 에 상태 이름으로 실린다 — 둘 다 `pageSentences` 하나를 부른다(`test/duplicate-census.test.ts`). 상태
 * 이름은 사람이 지은 글이라 방향 제어를 가둔다 — 뒤 글(«상태로 바뀝니다»)이 안 뒤집힌다.
 */
import { installCatalog, type PageDocument } from '@wirebound/schema'
import { beforeAll, describe, expect, it } from 'vitest'
import { pageSentences } from '../src/sentences'

beforeAll(() => {
  installCatalog()
})

const RLO = String.fromCodePoint(0x202e)
const FSI = String.fromCodePoint(0x2068)
const PDI = String.fromCodePoint(0x2069)

const page: PageDocument = {
  version: 1,
  viewStates: [{ id: 's_detail', name: `상세${RLO}열림` }],
  root: {
    id: 'n_root',
    type: 'Page',
    children: [
      {
        id: 'n_add',
        type: 'Button',
        props: { label: '등록' },
        interactions: [{ on: 'click', actions: [{ type: 'setViewState', target: 's_detail' }] }],
      },
    ],
  },
}

describe('번들 · PPTX 의 상호작용 문장', () => {
  it('상태를 문서의 이름으로 부르고 방향 제어를 가둔다', () => {
    expect(pageSentences(page).map((sentence) => sentence.text)).toEqual([
      `등록 버튼 클릭 시 화면이 ‘${FSI}상세${RLO}열림${PDI}’ 상태로 바뀝니다`,
    ])
  })
})
