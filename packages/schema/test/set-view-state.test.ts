/**
 * 상호작용 «화면 상태 바꾸기»(`setViewState` — 설계 spec `2026-11-17-set-view-state-design.md`)의 스키마 몫 — 봉투 · 검증 · 문장 · lint ·
 * 노드를 옮기는 자리(붙이기 · 모듈 · id 재발급)가 대상을 상태 id 로 다루는가.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { prepareNodesForPaste } from '../src/clipboard'
import { installCatalog } from '../src/component/catalog/index'
import { actionTarget, checkViewStateAction } from '../src/interaction/check'
import { describeInteraction, listInteractionSentences } from '../src/interaction/describe'
import { lintDesign } from '../src/lint/design'
import { moduleNodesForSave } from '../src/module/save'
import type { Interaction, LayoutDocument, PageDocument, ViewState, WbNode } from '../src/node'
import { remapNodeIds } from '../src/tree'
import { partitionIssues, validateLayout, validatePage } from '../src/validate'

beforeAll(() => {
  installCatalog()
})

const SOURCE = 'n_000000000002'
const STATES: ViewState[] = [
  { id: 's_detail', name: '상세 열림' },
  { id: 's_edit', name: '수정', parent: 's_detail' },
]

function button(interaction: Interaction): WbNode {
  return { id: SOURCE, type: 'Button', props: { label: '등록' }, interactions: [interaction] }
}

/** `viewStates` 가 `null` 이면 목록이 없는 페이지다. */
function pageWith(target: string, viewStates: ViewState[] | null = STATES): PageDocument {
  return {
    version: 1,
    root: { id: 'n_000000000001', type: 'Page', children: [button({ on: 'click', actions: [{ type: 'setViewState', target }] })] },
    ...(viewStates === null ? {} : { viewStates }),
  }
}

describe('검증 — 대상은 그 문서의 상태 id 또는 default', () => {
  it('기본 · 목록의 상태(하위 상태 포함)는 이슈가 없다', () => {
    for (const target of ['default', 's_detail', 's_edit']) expect(validatePage(pageWith(target))).toEqual([])
  })

  it('목록에 없는 상태는 view-state-missing 경고 — 저장을 막지 않는다', () => {
    const issues = validatePage(pageWith('s_gone'))
    expect(issues).toEqual([
      {
        code: 'view-state-missing',
        severity: 'warning',
        nodeId: SOURCE,
        path: '/root/children/0/interactions/0/actions/0',
        message: 'setViewState의 대상 상태가 페이지의 상태 목록에 없습니다: s_gone',
      },
    ])
    expect(partitionIssues(issues).errors).toEqual([])
  })

  it('상태가 없는 페이지는 기본만 맞다', () => {
    expect(validatePage(pageWith('default', null))).toEqual([])
    expect(validatePage(pageWith('s_detail', null)).map((issue) => issue.code)).toEqual(['view-state-missing'])
  })

  it('아직 안 고른 대상은 «사라졌다» 가 아니라 «아직 고르지 않았다» 로 말한다', () => {
    expect(validatePage(pageWith('')).map((issue) => issue.message)).toEqual(['setViewState의 대상 상태를 아직 고르지 않았습니다'])
  })

  it('레이아웃 문서는 상태가 없어 기본만 맞다', () => {
    const layout = (target: string): LayoutDocument => ({
      version: 1,
      root: {
        id: 'n_000000000001',
        type: 'Page',
        children: [button({ on: 'click', actions: [{ type: 'setViewState', target }] }), { id: 'n_000000000009', type: 'Slot' }],
      },
    })
    expect(validateLayout(layout('default'))).toEqual([])
    expect(validateLayout(layout('s_detail')).map((issue) => issue.code)).toEqual(['view-state-missing'])
  })

  it('봉투는 대상 밖의 키를 받지 않는다', () => {
    const doc = pageWith('s_detail')
    ;(doc.root.children![0]!.interactions![0]!.actions[0] as Record<string, unknown>).value = true
    expect(validatePage(doc).map((issue) => issue.code)).toEqual(['bad-document'])
  })

  it('판정 함수 하나 — 런타임이 같은 함수를 부른다', () => {
    expect(checkViewStateAction(STATES, { type: 'setViewState', target: 's_edit' })).toBeNull()
    expect(checkViewStateAction(undefined, { type: 'setViewState', target: 'default' })).toBeNull()
    expect(checkViewStateAction([], { type: 'setViewState', target: 's_edit' })?.code).toBe('view-state-missing')
  })
})

describe('문장 — 상태를 이름으로 부른다', () => {
  const sentence = (target: string, viewStates: ViewState[] = STATES): string => {
    const doc = pageWith(target, viewStates)
    return describeInteraction(doc, doc.root.children![0]!, doc.root.children![0]!.interactions![0]!)
  }

  it('상태 · 기본 · 사라짐 · 안 고름', () => {
    expect(sentence('s_detail')).toBe('등록 버튼 클릭 시 화면이 ‘상세 열림’ 상태로 바뀝니다')
    expect(sentence('default')).toBe('등록 버튼 클릭 시 화면이 기본 상태로 바뀝니다')
    expect(sentence('s_gone')).toBe('등록 버튼 클릭 시 화면이 사라진 상태로 바뀝니다')
    expect(sentence('')).toBe('등록 버튼 클릭 시 화면이 아직 고르지 않은 상태로 바뀝니다')
  })

  it('방향 제어 글자를 든 상태 이름은 가둔다 — 뒤 글이 안 뒤집힌다', () => {
    const rlo = String.fromCodePoint(0x202e)
    const text = sentence('s_detail', [{ id: 's_detail', name: `상세${rlo}열림` }])
    expect(text).toBe(
      `등록 버튼 클릭 시 화면이 ‘${String.fromCodePoint(0x2068)}상세${rlo}열림${String.fromCodePoint(0x2069)}’ 상태로 바뀝니다`,
    )
  })

  it('문서 전체의 문장(패널 · 내보내기)도 같은 문장이다', () => {
    expect(listInteractionSentences(pageWith('s_edit')).map((line) => line.text)).toEqual([
      '등록 버튼 클릭 시 화면이 ‘수정’ 상태로 바뀝니다',
    ])
  })
})

describe('lint — 대상 상태가 지워진 규칙은 interaction-target 으로 나른다', () => {
  it('경고로 그대로 나른다', () => {
    const issues = lintDesign({
      pages: [{ id: 'pg1', menuNodeId: 'm1', title: '목록', target: 'page:관리자/목록', document: pageWith('s_gone') }],
      menu: [{ id: 'm1', parentId: null, title: '관리자' }],
      comments: [],
    }).filter((issue) => issue.rule === 'interaction-target')
    expect(issues.map((issue) => [issue.severity, issue.nodeId, issue.message])).toEqual([
      ['warning', SOURCE, 'setViewState의 대상 상태가 페이지의 상태 목록에 없습니다: s_gone'],
    ])
  })
})

/** 노드의 첫 상호작용 첫 액션의 대상 — 액션이 빠졌으면 `undefined`. */
const targetOf = (node: WbNode): string | undefined => {
  const action = node.interactions?.[0]?.actions[0]
  return action === undefined ? undefined : actionTarget(action)
}

describe('노드를 옮기는 자리 — 대상은 노드 id 가 아니다', () => {
  const node = (target: string): WbNode => button({ on: 'click', actions: [{ type: 'setViewState', target }] })

  it('붙이기 — 붙일 페이지에 그 상태가 없으면 빼고 센다 · 기본은 늘 남는다', () => {
    const keep = { node: () => true, page: () => true, state: (id: string) => id === 's_detail' }
    const out = prepareNodesForPaste([node('s_detail'), node('s_gone'), node('default')], keep, () => 'n_00000000aaaa')
    expect(out.droppedActions).toBe(1)
    expect(out.nodes.map((entry) => targetOf(entry))).toEqual(['s_detail', undefined, 'default'])
  })

  it('붙이기 — 같은 id 의 노드가 붙일 문서에 있어도 상태가 없으면 뺀다', () => {
    const keep = { node: () => true, page: () => true, state: () => false }
    expect(prepareNodesForPaste([node('s_detail')], keep, () => 'n_00000000aaab').droppedActions).toBe(1)
  })

  it('모듈 — 기본이 아닌 상태로 바꾸는 액션은 뺀다(상태는 페이지마다 따로다)', () => {
    const out = moduleNodesForSave([node('s_detail'), node('default')])
    expect(out.droppedActions).toBe(1)
    expect(out.nodes.map((entry) => targetOf(entry))).toEqual([undefined, 'default'])
  })

  it('id 재발급 — 노드 id 와 같은 글자의 상태 대상도 옮기지 않는다', () => {
    const root: WbNode = { id: 'n_000000000001', type: 'Page', children: [node('n_000000000001')] }
    const { root: copied } = remapNodeIds(root, () => 'n_0000000000ff')
    expect(copied.children![0]!.interactions![0]!.actions[0]).toEqual({ type: 'setViewState', target: 'n_000000000001' })
  })
})
