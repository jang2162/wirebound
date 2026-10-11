/**
 * **상태를 고른 채 낸 편집의 판정**(`src/edit/view-state-fork.ts`) · **상태 영역의 자리 규칙**(`src/edit/structure-actions.ts` 의 `regionRules`) ·
 * **줄 `…` 의 상태 명령**(`src/edit/view-state-actions.ts`). 실브라우저 판은 `build-test/view-states-editor.test.ts` 의 Task 3 절이다.
 */
import { describe, expect, it } from 'vitest'
import { applyOps, findNode, unsplitStatesOps, validatePage, type PageDocument, type PatchOp, type WbNode } from '@wirebound/schema'
import { acceptsChildren, regionRulesAt, structureAbilities } from '../../src/edit/structure-actions'
import { structureDropTarget } from '../../src/edit/structure-drop'
import { moveNodeOps } from '../../src/edit/ops'
import { duplicateOps, removeManyOps } from '../../src/edit/paste-ops'
import { FORK_REFUSED, HIDDEN_REFUSED, planViewStateEdit } from '../../src/edit/view-state-fork'
import {
  removeCasePlan,
  splitPlan,
  SPLIT_CASE_REASON,
  SPLIT_ROOT_REASON,
  SPLIT_SIBLINGS_REASON,
  unsplitPlan,
} from '../../src/edit/view-state-actions'
import '../../src/catalog-setup'

const text = (id: string, content: string): WbNode => ({ id, type: 'Text', props: { content } })
const sw = (id: string, cases: WbNode[]): WbNode => ({ id, type: 'StateSwitch', props: {}, children: cases })
const kase = (id: string, state: string, children: WbNode[]): WbNode => ({ id, type: 'StateCase', props: { state }, children })

/** 뿌리 > [n_out, n_sw > [기본(n_dt), 관리자(n_at)], n_tail] · 상태 관리자 · 손님. */
function doc(): PageDocument {
  return {
    version: 1,
    viewStates: [
      { id: 's_admin', name: '관리자' },
      { id: 's_guest', name: '손님' },
    ],
    root: {
      id: 'n_root',
      type: 'Page',
      children: [
        text('n_out', '밖'),
        sw('n_sw', [kase('n_cd', 'default', [text('n_dt', '기본')]), kase('n_ca', 's_admin', [text('n_at', '관리자')])]),
        text('n_tail', '끝'),
      ],
    },
  }
}

let counter = 0
const newId = (): string => `n_new${String((counter += 1)).padStart(9, '0')}`

describe('planViewStateEdit — 흐린 기본 가지 안을 고친 편집', () => {
  const setDefaultText: PatchOp[] = [{ op: 'replace', path: '/root/children/1/children/0/children/0/props/content', value: '바뀜' }]

  it('기본 상태의 기본 가지 · 영역 밖 편집은 그대로다', () => {
    expect(planViewStateEdit(doc(), setDefaultText, null, newId)).toEqual({ kind: 'plain' })
    expect(planViewStateEdit(doc(), [{ op: 'replace', path: '/root/children/0/props/content', value: '바뀜' }], 's_guest', newId)).toEqual({
      kind: 'plain',
    })
  })

  it('안 보이는 가지 안을 고치면 보내지 않는다 — «모든 가지 보기»를 켰으면 그대로다(K2 리뷰 H2)', () => {
    const setAdminText: PatchOp[] = [{ op: 'replace', path: '/root/children/1/children/1/children/0/props/content', value: '바뀜' }]
    expect({
      adminHidesDefault: planViewStateEdit(doc(), setDefaultText, 's_admin', newId),
      defaultHidesAdmin: planViewStateEdit(doc(), setAdminText, null, newId),
      guestHidesAdmin: planViewStateEdit(doc(), setAdminText, 's_guest', newId),
      allCases: [
        planViewStateEdit(doc(), setDefaultText, 's_admin', newId, true),
        planViewStateEdit(doc(), setAdminText, null, newId, true),
      ],
    }).toEqual({
      adminHidesDefault: { kind: 'refused', reason: HIDDEN_REFUSED },
      defaultHidesAdmin: { kind: 'refused', reason: HIDDEN_REFUSED },
      guestHidesAdmin: { kind: 'refused', reason: HIDDEN_REFUSED },
      allCases: [{ kind: 'plain' }, { kind: 'plain' }],
    })
  })

  it('앞 형제를 민 뒤 흐린 가지 안을 고치는 묶음은 보내지 않는다 — 끌어 놓기 · 여럿 Delete(고른 차례 둘) · 여럿 Cmd+D(K2 리뷰 H1)', () => {
    const d = doc()
    const batches = {
      drag: moveNodeOps(d, 'n_out', 'n_cd', 1),
      removeOutFirst: removeManyOps(d, ['n_out', 'n_dt']),
      removeInFirst: removeManyOps(d, ['n_dt', 'n_out']),
      duplicate: (() => {
        const made = duplicateOps(d, ['n_out', 'n_dt'], newId)
        return 'ops' in made ? made.ops : null
      })(),
    }
    const verdicts = Object.fromEntries(
      Object.entries(batches).map(([name, ops]) => {
        if (ops === null) return [name, 'ops null']
        // 묶음이 실제로 앞 형제를 먼저 민다 — 포인터가 «뺀 뒤» 좌표다(판 카나리아).
        const first = ops[0]!
        return [
          name,
          {
            shifts: first.op === 'remove' || first.op === 'move' ? (first.op === 'move' ? first.from : first.path) : first.path,
            plan: planViewStateEdit(d, ops, 's_guest', newId).kind,
          },
        ]
      }),
    )
    expect(verdicts).toEqual({
      drag: { shifts: '/root/children/0', plan: 'refused' },
      removeOutFirst: { shifts: '/root/children/0', plan: 'refused' },
      removeInFirst: { shifts: '/root/children/1/children/0/children/0', plan: 'refused' },
      duplicate: { shifts: '/root/children/1', plan: 'refused' },
    })
  })

  it('영역째 다루는 묶음(풀기)은 평범한 편집이다 — 흐린 · 안 보이는 기본 가지를 영역 밖으로 꺼내도(K2 리뷰 L2)', () => {
    const ops = unsplitStatesOps(doc(), 'n_sw')!
    expect([planViewStateEdit(doc(), ops, 's_guest', newId), planViewStateEdit(doc(), ops, 's_admin', newId)]).toEqual([
      { kind: 'plain' },
      { kind: 'plain' },
    ])
    expect(findNode(applyOps(doc(), ops).root, 'n_sw')).toBeUndefined()
  })

  it('가지가 없는 상태에서 기본 가지 안을 고치면 복사 + 편집 한 묶음 — 기본 가지는 그대로 · 검증 오류 0', () => {
    const before = doc()
    const plan = planViewStateEdit(before, setDefaultText, 's_guest', newId)
    if (plan.kind !== 'fork') throw new Error(`fork 가 아니다: ${plan.kind}`)
    const after = applyOps(before, plan.ops)
    const cases = after.root.children![1]!.children!
    expect({
      default: cases[0],
      guest: {
        state: cases[2]!.props!.state,
        text: cases[2]!.children![0]!.props!.content,
        newText: cases[2]!.children![0]!.id !== 'n_dt',
      },
      remapsText: plan.remap.get('n_dt') === cases[2]!.children![0]!.id,
      issues: validatePage(after).filter((issue) => issue.severity === 'error'),
    }).toEqual({
      default: kase('n_cd', 'default', [text('n_dt', '기본')]),
      guest: { state: 's_guest', text: '바뀜', newText: true },
      remapsText: true,
      issues: [],
    })
  })

  it('영역 안과 밖을 함께 · 가지 자신의 필드를 고치면 보내지 않는다', () => {
    const mixed: PatchOp[] = [...setDefaultText, { op: 'replace', path: '/root/children/0/props/content', value: '밖도' }]
    expect(planViewStateEdit(doc(), mixed, 's_guest', newId)).toEqual({ kind: 'refused', reason: FORK_REFUSED })
    expect(
      planViewStateEdit(doc(), [{ op: 'replace', path: '/root/children/1/children/0/props/state', value: 's_guest' }], 's_guest', newId),
    ).toEqual({
      kind: 'refused',
      reason: FORK_REFUSED,
    })
  })

  it('영역 노드 · 가지 노드 자신을 지우는 편집은 평범한 편집이다', () => {
    expect(planViewStateEdit(doc(), [{ op: 'remove', path: '/root/children/1' }], 's_guest', newId)).toEqual({ kind: 'plain' })
  })

  it('흐린 영역이 둘이면 둘을 함께 고친 편집은 보내지 않는다', () => {
    const two = doc()
    two.root.children!.push(sw('n_sw2', [kase('n_cd2', 'default', [text('n_dt2', '둘째')])]))
    const both: PatchOp[] = [
      ...setDefaultText,
      { op: 'replace', path: '/root/children/3/children/0/children/0/props/content', value: '둘' },
    ]
    expect(planViewStateEdit(two, both, 's_guest', newId)).toEqual({ kind: 'refused', reason: FORK_REFUSED })
  })

  it('겹친 영역 — 바깥 영역이 흐리면 바깥 것을 복사한다(안쪽 영역은 복사 안에 선다)', () => {
    const nested = doc()
    nested.root.children![1]!.children![0]!.children!.push(sw('n_inner', [kase('n_ic', 'default', [text('n_it', '안')])]))
    const plan = planViewStateEdit(
      nested,
      [{ op: 'replace', path: '/root/children/1/children/0/children/1/children/0/children/0/props/content', value: '안 바뀜' }],
      's_guest',
      newId,
    )
    expect(plan.kind === 'fork' ? plan.switchId : plan.kind).toBe('n_sw')
  })
})

describe('regionRules — 상태 영역의 자리 규칙', () => {
  it('영역은 안에 안 받고 · 가지는 곁 · 계층을 못 옮기고 · 기본 가지는 못 지운다 · 가지 바로 안의 노드는 못 내어쓴다', () => {
    const d = doc()
    const off = (id: string) => {
      const abilities = structureAbilities(d, id)
      return (Object.keys(abilities) as (keyof typeof abilities)[]).filter((key) => !abilities[key]).sort()
    }
    expect({
      region: off('n_sw'),
      defaultCase: off('n_cd'),
      adminCase: off('n_ca'),
      inCase: off('n_dt'),
      afterRegion: regionRulesAt(d, 'n_tail').indent !== undefined,
      acceptsRegion: acceptsChildren(d.root.children![1]),
    }).toEqual({
      // 뿌리 자식이라 «내어쓰기»도 꺼진다(자리 규칙 밖) — Text 는 자식을 안 받는다(카탈로그).
      region: ['addInside', 'indent', 'outdent'],
      defaultCase: ['addAfter', 'indent', 'moveUp', 'outdent', 'remove'],
      adminCase: ['addAfter', 'indent', 'moveDown', 'outdent'],
      inCase: ['addInside', 'indent', 'moveDown', 'moveUp', 'outdent'],
      afterRegion: true,
      acceptsRegion: false,
    })
  })

  it('끌어 놓기 — 영역 안 · 가지 곁에 못 놓고, 가지는 끌어 옮기지 않는다', () => {
    const d = doc()
    const free = () => null
    expect({
      intoRegion: structureDropTarget(d, { kind: 'node', id: 'n_out' }, 'n_sw', 'inside', free),
      besideCase: structureDropTarget(d, { kind: 'node', id: 'n_out' }, 'n_cd', 'after', free),
      caseOut: structureDropTarget(d, { kind: 'node', id: 'n_ca' }, 'n_out', 'after', free),
      intoCase: structureDropTarget(d, { kind: 'node', id: 'n_out' }, 'n_cd', 'inside', free) !== null,
    }).toEqual({ intoRegion: null, besideCase: null, caseOut: null, intoCase: true })
  })
})

describe('줄 `…` 의 상태 명령', () => {
  it('나누기 — 루트 · 가지 · 이어지지 않은 형제는 까닭 · 관리자 상태면 그 가지도', () => {
    const d = doc()
    const admin = splitPlan(d, ['n_out'], 's_admin', newId)
    const after = 'ops' in admin ? applyOps(d, admin.ops) : null
    expect({
      root: splitPlan(d, ['n_root'], null, newId),
      kase: splitPlan(d, ['n_cd'], null, newId),
      apart: splitPlan(d, ['n_out', 'n_tail'], null, newId),
      adminCases: after?.root.children![0]!.children!.map((child) => child.props!.state),
    }).toEqual({
      root: { reason: SPLIT_ROOT_REASON },
      kase: { reason: SPLIT_CASE_REASON },
      apart: { reason: SPLIT_SIBLINGS_REASON },
      adminCases: ['default', 's_admin'],
    })
  })

  it('풀기 — 지워지는 가지 · 노드를 보이고 · 가지 지우기는 기본 가지에 없다', () => {
    const d = doc()
    const plan = unsplitPlan(d, 'n_sw')
    expect({
      shown: plan !== null && 'ops' in plan ? plan.shown : null,
      notRegion: unsplitPlan(d, 'n_out'),
      removeDefault: removeCasePlan(d, 'n_cd'),
      removeAdmin: removeCasePlan(d, 'n_ca'),
    }).toEqual({
      shown: { switchId: 'n_sw', cases: [{ id: 'n_ca', name: '관리자' }], nodes: [{ id: 'n_at', label: 'Text 관리자' }] },
      notRegion: null,
      removeDefault: null,
      removeAdmin: { ops: [{ op: 'remove', path: '/root/children/1/children/1' }] },
    })
  })
})
