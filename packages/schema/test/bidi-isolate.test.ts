/**
 * `isolateBidi` — 사람이 쓴 이름(라벨 · 제목 · 탭 이름 · 컬럼 이름)을 글에 이어 붙이는 자리의 방향 격리. 화면에서 뒤집히는지는 실브라우저 판
 * (`apps/web/build-test/label-bidi.test.ts`)이 재고, 여기는 **글자**를 못박는다 — 보통 글은 한 글자도 안 바뀌고, 제어 글자가 든 이름만
 * U+2068 … U+2069 로 감싼다.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { isolateBidi } from '../src/bidi'
import { installCatalog } from '../src/component/catalog/index'
import { clipped, firstOf, oneLine } from '../src/component/summary'
import { nodeSummary } from '../src/display'
import { describeInteraction, nodeDisplayName } from '../src/interaction/describe'
import type { PageDocument, WbNode } from '../src/node'

beforeAll(() => {
  installCatalog()
})

const RLO = '\u202e'
const FSI = '\u2068'
const PDI = '\u2069'

describe('isolateBidi', () => {
  it('제어 글자가 없는 글은 그대로다 — 한국어 · 라틴 · RTL 글자 · 이모지 · 빈 글', () => {
    for (const text of ['저장', 'Save', 'حفظ', 'שלום', '👍🏽', '', ' ', 'a · b']) expect(isolateBidi(text)).toBe(text)
  })

  it.each([
    ['RLO', `a${RLO}b`],
    ['LRE', 'a\u202ab'],
    ['LRM', 'a\u200eb'],
    ['RLM', 'a\u200fb'],
    ['ALM', 'a\u061cb'],
    ['RLI', 'a\u2067b'],
  ])('%s 가 든 글은 격리 시작 · 끝으로 감싼다', (_, text) => {
    const wrapped = isolateBidi(text)
    expect(wrapped.startsWith(FSI)).toBe(true)
    expect(wrapped.endsWith(PDI)).toBe(true)
    expect(wrapped.slice(1, -1).replace(/[\u2066-\u2069]/g, '')).toBe(text.replace(/[\u2066-\u2069]/g, ''))
  })

  it('안쪽의 격리 시작 · 끝은 걷는다 — 끝 격리(U+2069) 하나가 우리 격리를 일찍 닫아 뒤의 글을 뒤집으면 안 된다', () => {
    expect(isolateBidi(`a${PDI}${RLO}b`)).toBe(`${FSI}a${RLO}b${PDI}`)
    expect(isolateBidi(`a\u2066${RLO}b${PDI}`)).toBe(`${FSI}a${RLO}b${PDI}`)
    // 제어 글자가 없는 글(격리 글자가 하나도 없는 글)은 걷지도 감싸지도 않는다 — 격리 글자만 있으면 방향 제어가 있는 글이다.
    expect(isolateBidi('abc')).toBe('abc')
  })
})

describe('이름이 이어 붙는 자리', () => {
  const button = (id: string, label: string, extra: Partial<WbNode> = {}): WbNode =>
    ({ id, type: 'Button', props: { label }, ...extra }) as WbNode

  it('요약 읽개 — 제어 글자가 든 이름만 감싼다 · 자른 뒤에 감싼다', () => {
    expect(oneLine(`a${RLO}b`)).toBe(`${FSI}a${RLO}b${PDI}`)
    expect(oneLine('  a   b ')).toBe('a b')
    // 20 글자를 넘는 글은 자르고 `…` 를 붙인 **뒤** 감싼다 — 가둔 글을 자르면 끝 격리가 잘려 나간다.
    expect(clipped(`${RLO}${'가'.repeat(30)}`, 20)).toBe(`${FSI}${RLO}${'가'.repeat(19)}…${PDI}`)
    expect(clipped('가'.repeat(30), 20)).toBe(`${'가'.repeat(20)}…`)
    // 탭 이름 · 컬럼 이름 — 이름마다 따로 감싸 앞 이름의 제어 글자가 뒤 이름을 못 뒤집는다.
    expect(firstOf([`x${RLO}y`, '둘째', '셋째'])).toBe(`${FSI}x${RLO}y${PDI} · 둘째 · 셋째`)
    expect(firstOf(['개요', '상세'])).toBe('개요 · 상세')
  })

  it('줄 요약 — TabPanel · Card · Button', () => {
    const panel = { id: 'n_tabp00000001', type: 'TabPanel', props: { label: `x${RLO}y` } } as WbNode
    expect(nodeSummary(panel)).toBe(`${FSI}x${RLO}y${PDI}`)
    expect(nodeSummary(button('n_btn000000001', `a${RLO}b`))).toBe(`${FSI}a${RLO}b${PDI}`)
    expect(nodeSummary(button('n_btn000000002', '저장'))).toBe('저장')
  })

  it('문장 — 라벨 · 탭 이름 · 값 · 페이지 경로를 이름마다 감싼다 · 보통 글은 그대로다', () => {
    expect(nodeDisplayName(button('n_btn000000001', `a${RLO}b`))).toBe(`${FSI}a${RLO}b${PDI} 버튼`)
    expect(nodeDisplayName(button('n_btn000000002', '저장'))).toBe('저장 버튼')
    // 별칭은 입구가 막는다 — 별칭이 이름이면 그대로다.
    expect(nodeDisplayName(button('n_btn000000003', `a${RLO}b`, { alias: '머리 저장' }))).toBe('머리 저장')

    const source = button('n_src000000001', `a${RLO}b`, { marker: 1 })
    const tabs = {
      id: 'n_tabs00000001',
      type: 'Tabs',
      marker: 2,
      children: [
        { id: 'n_tabp00000001', type: 'TabPanel', props: { label: `x${RLO}y` } },
        { id: 'n_tabp00000002', type: 'TabPanel', props: { label: '둘째' } },
      ],
    } as WbNode
    const document = { version: 1, root: { id: 'page', type: 'Page', children: [source, tabs] } } as unknown as PageDocument
    const sentence = (action: object) => describeInteraction(document, source, { on: 'click', actions: [action] } as never)
    // 탭 이름 · `setProp` 의 글 값 · 페이지 경로(메뉴 · 페이지 제목 몫).
    expect(sentence({ type: 'switchTab', target: 'n_tabp00000001' })).toBe(
      `① ${FSI}a${RLO}b${PDI} 버튼 클릭 시 ② 탭이 "${FSI}x${RLO}y${PDI}" 탭으로 바뀝니다`,
    )
    expect(sentence({ type: 'setProp', target: 'n_src000000001', prop: 'label', value: `c${RLO}d` })).toContain(`"${FSI}c${RLO}d${PDI}"`)
    expect(sentence({ type: 'setProp', target: 'n_src000000001', prop: 'label', value: '보통' })).toContain('"보통"')
    expect(sentence({ type: 'navigate', target: `page:관리${RLO}자/목록` })).toContain(`${FSI}관리${RLO}자/목록${PDI} 페이지`)
    expect(sentence({ type: 'navigate', target: 'page:관리자/목록' })).toContain('관리자/목록 페이지')
  })
})
