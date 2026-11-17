/**
 * 상호작용 탭의 «화면 상태 바꾸기»(설계 spec `2026-11-17-set-view-state-design.md` «에디터») — 대상은 그 페이지의 상태 트리(기본 + 트리 차례 · 하위
 * 상태는 들임)에서 고른다. 상태가 없는 페이지는 «기본» 하나와 안내. 지운 상태는 «사라진 상태» 로 그대로 보인다. 고르면 그 대상이 편집으로 나간다.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { PageDocument, PatchOp, ViewState } from '@wirebound/schema'
import type { ApiClient } from '../../src/api/client'
import type { PatchResult } from '../../src/api/types'
import { missingStateOption, NO_VIEW_STATES } from '../../src/panels/interaction-panel'
import { openPage, pageDoc } from '../editor-harness'
import '../../src/catalog-setup'
import { structureRowName } from './tree-row'

const STATES: ViewState[] = [
  { id: 's_login', name: '로그인' },
  { id: 's_admin', name: '관리자', parent: 's_login' },
  { id: 's_guest', name: '손님' },
]

function doc(target: string, viewStates?: ViewState[]): PageDocument {
  const page = pageDoc({
    id: 'n-root',
    type: 'Page',
    children: [
      {
        id: 'n-btn',
        type: 'Button',
        props: { label: '등록' },
        interactions: [{ on: 'click', actions: [{ type: 'setViewState', target }] }],
      },
    ],
  })
  return viewStates === undefined ? page : { ...page, viewStates }
}

function editable(): { calls: PatchOp[][]; api: Partial<ApiClient> } {
  const calls: PatchOp[][] = []
  let seq = 7
  const patchOps: ApiClient['patchOps'] = async (_projectId, _pageId, body) => {
    calls.push(body.ops)
    seq += 1
    const result: PatchResult = {
      seq,
      revisionId: `rev-${seq}`,
      inverse: [],
      schemaVersion: 1,
      ...(body.clientOpId === undefined ? {} : { clientOpId: body.clientOpId }),
    }
    return result
  }
  return { calls, api: { patchOps } }
}

async function openRule(page: PageDocument, api?: Partial<ApiClient>): Promise<HTMLSelectElement> {
  await openPage(page, api === undefined ? {} : { apiOverrides: api })
  fireEvent.click(screen.getByRole('tab', { name: '상호작용' }))
  await waitFor(() => expect(screen.getByRole('tab', { name: '상호작용' }).getAttribute('aria-selected')).toBe('true'))
  const list = document.body.querySelector('.wb-shell-structure-list') as HTMLElement
  fireEvent.click(within(list).getByRole('button', { name: structureRowName('Button') }))
  return within(screen.getByRole('group', { name: '액션 1' })).getByLabelText('대상 상태') as HTMLSelectElement
}

const optionTexts = (select: HTMLSelectElement): string[] => [...select.options].map((option) => option.textContent ?? '')

describe('상호작용 탭 — 화면 상태 바꾸기', () => {
  it('대상은 기본 + 상태 트리 차례(하위 상태는 들임)이고 지금 대상이 골라져 있다', async () => {
    const select = await openRule(doc('s_admin', STATES))
    expect(optionTexts(select)).toEqual(['— 대상을 고르세요 —', '기본', '로그인', '  관리자', '손님'])
    expect(select.value).toBe('s_admin')
    expect(screen.queryByText(NO_VIEW_STATES)).toBeNull()
  })

  it('상태가 없는 페이지는 기본 하나와 «상태를 먼저 만드세요»', async () => {
    const select = await openRule(doc('default'))
    expect(optionTexts(select)).toEqual(['— 대상을 고르세요 —', '기본'])
    expect(screen.getByText(NO_VIEW_STATES)).toBeTruthy()
  })

  it('지운 상태는 «사라진 상태» 로 그대로 보인다 — 규칙의 문장도 같은 말이다', async () => {
    const select = await openRule(doc('s_gone', STATES))
    expect(select.value).toBe('s_gone')
    expect(optionTexts(select).at(-1)).toBe(missingStateOption('s_gone'))
    expect(screen.getAllByText('등록 버튼 클릭 시 화면이 사라진 상태로 바뀝니다').length).toBeGreaterThan(0)
  })

  it('고르면 그 대상이 편집으로 나간다', async () => {
    const { calls, api } = editable()
    const select = await openRule(doc('default', STATES), api)
    fireEvent.change(select, { target: { value: 's_guest' } })
    await waitFor(() => expect(calls).toHaveLength(1))
    expect((calls[0]![0] as { value: unknown }).value).toEqual([{ on: 'click', actions: [{ type: 'setViewState', target: 's_guest' }] }])
  })
})
