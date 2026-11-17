/**
 * **코멘트 묶음을 고르면 그 노드가 보이는 화면 상태로 바꾼다**(`shell/use-view-state.ts` 의 `stateShowingNode`) — 지금 상태에서 보이면 그대로,
 * 숨었으면 «기본» → 상태 트리 차례(`viewStateOrder`)의 첫 «보이는» 상태, 어느 상태에서도 안 보이면 안 바꾼다.
 */
import { describe, expect, it } from 'vitest'
import type { PageDocument } from '@wirebound/schema'
import { stateShowingNode } from '../../src/shell/use-view-state'

/** `s_login`(뿌리) · `s_admin`(부모 `s_login`). */
function doc(): Pick<PageDocument, 'root' | 'viewStates'> {
  return {
    root: {
      id: 'root',
      type: 'Page',
      children: [
        { id: 'A', type: 'Text', props: { content: '늘' } },
        {
          id: 'B',
          type: 'Card',
          visibility: { mode: 'only', states: ['s_admin'] },
          children: [{ id: 'D', type: 'Text', props: { content: '안' } }],
        },
        { id: 'C', type: 'Text', props: { content: '없음' }, visibility: { mode: 'except', states: ['default', 's_login'] } },
        { id: 'E', type: 'Text', props: { content: '기본만' }, visibility: { mode: 'only', states: ['default'] } },
      ],
    },
    viewStates: [
      { id: 's_login', name: '로그인' },
      { id: 's_admin', name: '관리자', parent: 's_login' },
    ],
  } as Pick<PageDocument, 'root' | 'viewStates'>
}

describe('stateShowingNode', () => {
  it('지금 상태에서 보이면 안 바꾼다', () => {
    expect(stateShowingNode(doc(), 'A', null)).toEqual({ change: false })
    expect(stateShowingNode(doc(), 'B', 's_admin')).toEqual({ change: false })
  })

  it('숨었으면 그 노드가 보이는 첫 상태로 — 기본에서 숨은 `only` 노드', () => {
    expect(stateShowingNode(doc(), 'B', null)).toEqual({ change: true, state: 's_admin' })
  })

  it('부모가 숨으면 자식도 숨는다 — 자식을 가리켜도 부모가 보이는 상태로', () => {
    expect(stateShowingNode(doc(), 'D', 's_login')).toEqual({ change: true, state: 's_admin' })
  })

  it('기본이 첫 후보다 — 기본에서만 보이는 노드는 기본으로', () => {
    expect(stateShowingNode(doc(), 'E', 's_admin')).toEqual({ change: true, state: null })
  })

  it('어느 상태에서도 안 보이면 안 바꾼다 — `s_login` 에서 숨으면 하위 `s_admin` 에서도 숨는다', () => {
    expect(stateShowingNode(doc(), 'C', null)).toEqual({ change: false })
    expect(stateShowingNode(doc(), 'C', 's_admin')).toEqual({ change: false })
  })

  it('없는 노드 · 문서가 없으면 안 바꾼다', () => {
    expect(stateShowingNode(doc(), 'Z', 's_admin')).toEqual({ change: false })
    expect(stateShowingNode(null, 'B', null)).toEqual({ change: false })
  })
})
