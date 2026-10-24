/**
 * **«종류 바꾸기» 의 op**(`src/edit/change-kind.ts`) — 순수 함수 판. 화면 판(줄 `…` → 상자 → 편집 · 되돌리기 · 잠금)은 `../panels/change-kind.test.tsx`.
 */
import {
  applyOps,
  CURRENT_DOCUMENT_VERSION,
  installCatalog,
  invertOps,
  partitionIssues,
  validatePage,
  type PageDocument,
} from '@wirebound/schema'
import { beforeAll, describe, expect, it } from 'vitest'
import { carriedProps, changeKindOps, KIND_TYPES, kindTargets } from '../../src/edit/change-kind'

beforeAll(installCatalog)

function doc(piece: Record<string, unknown>): PageDocument {
  return {
    version: CURRENT_DOCUMENT_VERSION,
    root: {
      id: 'n_root',
      type: 'Page',
      children: [{ id: 'n_f', type: 'Field', props: { label: '상태' }, children: [{ id: 'n_p', ...piece } as never] }],
    },
  }
}

const piece = (document: PageDocument) => document.root.children![0]!.children![0]!

describe('kindTargets — 입력 조각끼리만', () => {
  it('입력 조각 일곱은 나머지 여섯으로 · 사이 글자 · 칩 · 단추 · 필드는 없다', () => {
    expect(KIND_TYPES).toHaveLength(7)
    for (const type of KIND_TYPES) expect(kindTargets(type)).toEqual(KIND_TYPES.filter((other) => other !== type))
    for (const type of ['Affix', 'Chip', 'Button', 'Field', 'Text', undefined, 3]) expect(kindTargets(type)).toEqual([])
  })
})

describe('changeKindOps', () => {
  it('Input → Select — 타입만 바꾸고 같은 이름의 prop(안내 · 비활성 · 오류 · 폭)을 옮기고 없는 prop(kind · value · readonly)은 버린다', () => {
    const before = doc({
      type: 'Input',
      props: { kind: 'number', value: '3', placeholder: '고르세요', size: 'short', disabled: true, readonly: true, invalid: true },
    })
    const ops = changeKindOps(before, 'n_p', 'Select')
    expect(ops).toEqual([
      { op: 'replace', path: '/root/children/0/children/0/type', value: 'Select' },
      {
        op: 'replace',
        path: '/root/children/0/children/0/props',
        value: { placeholder: '고르세요', size: 'short', disabled: true, invalid: true },
      },
    ])
    const after = applyOps(before, ops!)
    expect(partitionIssues(validatePage(after)).errors).toEqual([])
  })

  it('노드 봉투(id · 번호 · 별칭 · 보임 · 상호작용 · 몫)는 그대로 · 변형은 걷는다', () => {
    const envelope = {
      marker: 3,
      alias: '여부',
      weight: 2,
      visibility: { mode: 'except', states: ['s_a'] },
      interactions: [{ on: 'click', actions: [{ type: 'setVisible', target: 'n_f', value: false }] }],
    }
    const before: PageDocument = {
      ...doc({ type: 'RadioGroup', variant: 'segment', ...envelope }),
      viewStates: [{ id: 's_a', name: '가' }],
    }
    const after = applyOps(before, changeKindOps(before, 'n_p', 'Select')!)
    expect(piece(after)).toEqual({ id: 'n_p', type: 'Select', ...envelope })
    expect(partitionIssues(validatePage(after)).errors).toEqual([])
  })

  it('여럿 고른 체크 묶음 → 하나만 고르는 타입이면 고른 것은 첫째만 남는다(항목은 다 옮긴다)', () => {
    const options = [{ label: '월' }, { label: '화', selected: true }, { label: '수', selected: true }]
    expect(carriedProps({ options }, 'RadioGroup')).toEqual({
      options: [{ label: '월' }, { label: '화', selected: true }, { label: '수' }],
    })
    expect(carriedProps({ options }, 'CheckboxGroup')).toEqual({ options })
    expect(carriedProps({ options }, 'Input')).toEqual({})
  })

  it('같은 이름이어도 새 규격을 못 지나는 값은 그것만 버리고 나머지는 옮긴다', () => {
    // 저장된 문서의 prop 이 규격 밖일 수 있다(검증은 경고로 받는다) — 그 한 칸 때문에 안내 문구까지 잃지 않는다.
    expect(carriedProps({ placeholder: '입력', value: 7, size: 'huge' }, 'TextArea')).toEqual({ placeholder: '입력' })
  })

  it('옮길 것이 없으면 props 를 걷고 · props 키가 없던 노드에서는 타입만 바꾼다', () => {
    expect(changeKindOps(doc({ type: 'Input', props: { kind: 'password' } }), 'n_p', 'CheckboxGroup')).toEqual([
      { op: 'replace', path: '/root/children/0/children/0/type', value: 'CheckboxGroup' },
      { op: 'remove', path: '/root/children/0/children/0/props' },
    ])
    expect(changeKindOps(doc({ type: 'Input' }), 'n_p', 'DateInput')).toEqual([
      { op: 'replace', path: '/root/children/0/children/0/type', value: 'DateInput' },
    ])
  })

  it('입력 조각이 아니거나 · 같은 종류거나 · 없는 노드면 null', () => {
    expect(changeKindOps(doc({ type: 'Affix' }), 'n_p', 'Input')).toBeNull()
    expect(changeKindOps(doc({ type: 'Input' }), 'n_p', 'Input')).toBeNull()
    expect(changeKindOps(doc({ type: 'Input' }), 'n_p', 'Affix')).toBeNull()
    expect(changeKindOps(doc({ type: 'Input' }), 'n_gone', 'Select')).toBeNull()
  })

  it('되돌리면(서버 역연산) 바꾸기 전 노드 그대로다 — 변형 · props 까지', () => {
    const before = doc({
      type: 'RadioGroup',
      variant: 'radio',
      props: { options: [{ label: 'Y', selected: true }, { label: 'N' }], disabled: true },
    })
    const ops = changeKindOps(before, 'n_p', 'Input')!
    const after = applyOps(before, ops)
    expect(applyOps(after, invertOps(before, ops))).toEqual(before)
  })
})
