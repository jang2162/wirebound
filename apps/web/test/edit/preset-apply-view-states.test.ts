/**
 * **프리셋을 놓으면 그 프리셋의 화면 상태 목록이 함께 실린다**(설계 spec 「페이지 JSON · 프리셋 · 붙여넣기」) — 페이지의 목록을 지우지
 * 않고 잇는다:
 *
 * | 프리셋의 상태 | 페이지에 | 묶음 |
 * |---|---|---|
 * | 같은 id 가 있다 | 그대로 | 아무것도 안 더함 |
 * | id 는 없고 같은 이름이 있다 | 그 상태로 | 가지의 `state` 를 페이지의 id 로 바꿈 |
 * | 둘 다 없다 | 더함 | `add /viewStates`(목록이 없으면 배열째) · `/viewStates/-` |
 * | 더하면 20개를 넘는다 | — | 그 상태의 가지를 빼고 말한다 |
 *
 * 목록 없이 저장된 프리셋의 가지는 페이지에 없는 상태면 뺀다(붙이기와 같은 `prepareNodesForPaste`). 뺀 결과 · 적용한 문서는 검증 오류가
 * 없다. 셸의 통지 문장은 붙이기와 같은 `droppedCasesNotice` 다.
 */
import {
  applyOps,
  installCatalog,
  invertOps,
  partitionIssues,
  validatePage,
  VIEW_STATES_MAX,
  type PageDocument,
  type ViewState,
  type WbNode,
} from '@wirebound/schema'
import { beforeAll, describe, expect, it } from 'vitest'
import { presetApply } from '../../src/edit/preset-apply'

beforeAll(() => {
  installCatalog()
})

const ADMIN: ViewState = { id: 's_admin', name: '관리자' }
const GUEST: ViewState = { id: 's_guest', name: '비로그인' }

let counter = 0
const generate = (): string => `n_gen${String(++counter).padStart(6, '0')}`

function preset(): WbNode[] {
  return [
    {
      id: 'sw',
      type: 'StateSwitch',
      children: [
        { id: 'cd', type: 'StateCase', props: { state: 'default' }, children: [{ id: 'bd', type: 'Button', props: { label: '보기' } }] },
        { id: 'ca', type: 'StateCase', props: { state: 's_admin' }, children: [{ id: 'ba', type: 'Button', props: { label: '승인' } }] },
        { id: 'cg', type: 'StateCase', props: { state: 's_guest' }, children: [{ id: 'bg', type: 'Button', props: { label: '로그인' } }] },
      ],
    },
  ]
}

function page(viewStates?: ViewState[]): PageDocument {
  const doc: PageDocument = {
    version: 1,
    root: { id: 'root', type: 'Page', children: [{ id: 'old', type: 'Text', props: { content: '옛것' } }] },
  }
  return viewStates === undefined ? doc : { ...doc, viewStates }
}

/** 놓은 뒤의 문서 — 검증 오류가 없고, 묶음 하나의 역연산으로 원래 문서로 돌아온다. */
function placed(doc: PageDocument, viewStates: readonly ViewState[] | undefined) {
  const result = presetApply(doc, preset(), generate, viewStates)
  expect(result.apply, JSON.stringify(result.issues)).not.toBeNull()
  const after = applyOps(doc, result.apply!.ops)
  expect(partitionIssues(validatePage(after)).errors).toEqual([])
  expect(applyOps(after, invertOps(doc, result.apply!.ops))).toEqual(doc)
  const area = after.root.children![0]!
  return { result, after, states: area.children!.map((child) => child.props?.state) }
}

describe('프리셋의 상태 목록을 페이지 목록에 잇는다', () => {
  it('목록이 없는 페이지 — 프리셋의 목록을 배열째 싣고 가지를 다 남긴다', () => {
    const { result, after, states } = placed(page(), [ADMIN, GUEST])
    expect(after.viewStates).toEqual([ADMIN, GUEST])
    expect(states).toEqual(['default', 's_admin', 's_guest'])
    expect(result.droppedCases).toEqual([])
  })

  it('같은 id 가 있는 페이지 — 그 상태는 더하지 않고 없는 것만 끝에 더한다', () => {
    const { after, states } = placed(page([{ id: 's_other', name: '다른' }, ADMIN]), [ADMIN, GUEST])
    expect(after.viewStates).toEqual([{ id: 's_other', name: '다른' }, ADMIN, GUEST])
    expect(states).toEqual(['default', 's_admin', 's_guest'])
  })

  it('id 는 없고 같은 이름이 있는 페이지 — 가지를 페이지의 그 상태로 옮긴다(이름이 겹치는 상태를 더하지 않는다)', () => {
    const mine: ViewState = { id: 's_mine', name: '관리자' }
    const { after, states } = placed(page([mine]), [ADMIN, GUEST])
    expect(after.viewStates).toEqual([mine, GUEST])
    expect(states).toEqual(['default', 's_mine', 's_guest'])
  })

  it('더하면 20개를 넘는 상태의 가지는 빼고 센다', () => {
    const full = Array.from({ length: VIEW_STATES_MAX - 1 }, (_unused, index) => ({ id: `s_${index}`, name: `상태${index}` }))
    const { result, after, states } = placed(page(full), [ADMIN, GUEST])
    expect(after.viewStates).toEqual([...full, ADMIN])
    expect(states).toEqual(['default', 's_admin'])
    expect(result.droppedCases).toEqual([{ state: 's_guest', count: 1 }])
  })

  it('목록 없이 저장된 프리셋 — 페이지에 없는 상태의 가지는 빼고 센다', () => {
    const { result, after, states } = placed(page([ADMIN]), undefined)
    expect(after.viewStates).toEqual([ADMIN])
    expect(states).toEqual(['default', 's_admin'])
    expect(result.droppedCases).toEqual([{ state: 's_guest', count: 1 }])
  })

  it('카나리아 — 상태가 없는 프리셋은 목록을 건드리지 않는다(연산 하나)', () => {
    const result = presetApply(page(), [{ id: 't', type: 'Text', props: { content: '글' } }], generate, [])
    expect(result.apply!.ops).toHaveLength(1)
    expect(result.apply!.ops[0]!.path).toBe('/root/children')
  })
})
