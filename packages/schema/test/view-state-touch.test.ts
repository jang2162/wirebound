/**
 * **`viewStateTouch` 의 계약**(`../src/view-state-touch.ts`) — 결과 넷(`none` · `fork` · `mixed` · `hidden`)을 판마다 낸다. 무작위 판은 화면 판정의
 * 오라클(`apps/web/test/edit/view-state-fork-oracle.test.ts`)이 잰다 — 거기서는 `mixed` 를 `editInForkOps` 의 거절이 한 번 더 받쳐, `fork` 와
 * `mixed` 의 경계는 여기서만 갈린다.
 */
import { describe, expect, it } from 'vitest'
import type { PageDocument, WbNode } from '../src/node'
import type { PatchOp } from '../src/patch/types'
import { viewStateTouch } from '../src/view-state-touch'

const text = (id: string): WbNode => ({ id, type: 'Text', props: { content: id } })
const kase = (id: string, state: string, children: WbNode[]): WbNode => ({ id, type: 'StateCase', props: { state }, children })

/** 뿌리 > [n_pre, n_sw > [기본(n_dt, n_dt2), 관리자(n_at)], n_out]. */
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
        text('n_pre'),
        { id: 'n_sw', type: 'StateSwitch', children: [kase('n_cd', 'default', [text('n_dt'), text('n_dt2')]), kase('n_ca', 's_admin', [text('n_at')])] },
        text('n_out'),
      ],
    },
  }
}

const SET_DT: PatchOp = { op: 'replace', path: '/root/children/1/children/0/children/0/props/content', value: '바뀜' }

describe('viewStateTouch', () => {
  it('흐린 기본 가지 안만 — fork · 앞 형제를 민 뒤의 좌표도 같은 가지로 읽는다', () => {
    expect({
      inside: viewStateTouch(doc(), [SET_DT], 's_guest', false),
      shiftedRemove: viewStateTouch(doc(), [{ op: 'remove', path: '/root/children/0' }, { op: 'remove', path: '/root/children/0/children/0/children/0' }], 's_guest', false),
      movePathAfterFrom: viewStateTouch(doc(), [{ op: 'move', from: '/root/children/0', path: '/root/children/0/children/0/children/1' }], 's_guest', false),
      numberForm: viewStateTouch(doc(), [{ op: 'replace', path: '/root/children/01/children/0/children/0/props/content', value: '바뀜' }], 's_guest', false),
    }).toEqual({
      inside: { kind: 'fork', switchId: 'n_sw' },
      shiftedRemove: { kind: 'mixed' },
      movePathAfterFrom: { kind: 'mixed' },
      numberForm: { kind: 'fork', switchId: 'n_sw' },
    })
  })

  it('흐린 가지 안과 밖 · 가지 자신의 필드 — mixed', () => {
    expect([
      viewStateTouch(doc(), [SET_DT, { op: 'replace', path: '/root/children/2/props/content', value: '밖' }], 's_guest', false),
      viewStateTouch(doc(), [{ op: 'replace', path: '/root/children/1/children/0/props/state', value: 's_guest' }], 's_guest', false),
    ]).toEqual([{ kind: 'mixed' }, { kind: 'mixed' }])
  })

  it('안 보이는 가지 — hidden(«모든 가지 보기»면 none) · 흐린 가지와 함께여도 hidden 이 앞선다', () => {
    const setAt: PatchOp = { op: 'replace', path: '/root/children/1/children/1/children/0/props/content', value: '바뀜' }
    expect({
      defaultState: viewStateTouch(doc(), [setAt], null, false),
      adminHidesDefault: viewStateTouch(doc(), [SET_DT], 's_admin', false),
      withDimmed: viewStateTouch(doc(), [SET_DT, setAt], 's_guest', false),
      allCases: [viewStateTouch(doc(), [setAt], null, true), viewStateTouch(doc(), [SET_DT], 's_admin', true)],
    }).toEqual({
      defaultState: { kind: 'hidden' },
      adminHidesDefault: { kind: 'hidden' },
      withDimmed: { kind: 'hidden' },
      allCases: [{ kind: 'none' }, { kind: 'none' }],
    })
  })

  it('영역째 사라지는 묶음 · 영역 밖 · 가지 자신을 지움 · 적용이 실패하는 묶음 — none', () => {
    expect([
      // 풀기의 꼴 — 기본 가지 내용을 밖으로 옮기고 영역을 지운다.
      viewStateTouch(
        doc(),
        [
          { op: 'move', from: '/root/children/1/children/0/children/0', path: '/root/children/2' },
          { op: 'move', from: '/root/children/1/children/0/children/0', path: '/root/children/3' },
          { op: 'remove', path: '/root/children/1' },
        ],
        's_guest',
        false,
      ),
      viewStateTouch(doc(), [{ op: 'replace', path: '/root/children/0/props/content', value: '밖' }], 's_guest', false),
      viewStateTouch(doc(), [{ op: 'remove', path: '/root/children/1/children/1' }], null, false),
      viewStateTouch(doc(), [SET_DT, { op: 'remove', path: '/root/children/9' }], 's_guest', false),
    ]).toEqual([{ kind: 'none' }, { kind: 'none' }, { kind: 'none' }, { kind: 'none' }])
  })
})
