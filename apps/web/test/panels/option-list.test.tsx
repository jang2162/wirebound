/**
 * **선택지 위젯(`optionList`)과 목록 위젯의 옮기기**(`src/panels/controls/list-control.tsx`). 고르기(하나 · 여럿) · 고른 것 풀기 · 옮기기(고른 것이
 * 따라간다) · 하나 이상 · 상한 · 잠금. 추가 · 지우기 · 고치기의 커밋 규칙은 `./list-control.test.tsx` 가 잰다(같은 위젯).
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { OPTIONS_MAX } from '@wirebound/schema'
import { describe, expect, it } from 'vitest'
import type { ApiClient } from '../../src/api/client'
import type { PatchResult } from '../../src/api/types'
import { openPage, pageDoc } from '../editor-harness'
import '../../src/catalog-setup'
import { structureRowName } from './tree-row'

const MANY = Array.from({ length: OPTIONS_MAX }, (_, index) => ({ label: `항목 ${index + 1}` }))

const DOC = pageDoc({
  id: 'n-root',
  type: 'Page',
  children: [
    { id: 'n-sel', type: 'Select', props: { options: [{ label: '가' }, { label: '나', selected: true }, { label: '다' }] } },
    { id: 'n-chk', type: 'CheckboxGroup', props: { options: [{ label: '월', selected: true }, { label: '화' }] } },
    { id: 'n-list', type: 'Tree', props: { items: ['이름', '이메일', '가입일'] } },
    { id: 'n-one', type: 'RadioGroup', props: { options: [{ label: '하나' }] } },
    { id: 'n-full', type: 'Chip' },
    { id: 'n-max', type: 'TextArea' },
  ],
})

/** 상한까지 찬 선택지 — 추가가 꺼진다. */
const FULL_DOC = pageDoc({ id: 'n-root', type: 'Page', children: [{ id: 'n-sel', type: 'Select', props: { options: MANY } }] })

function editable(): { calls: unknown[]; api: Partial<ApiClient> } {
  const calls: unknown[] = []
  let seq = 7
  const patchOps: ApiClient['patchOps'] = async (_projectId, _pageId, body) => {
    calls.push(body.ops)
    seq += 1
    const result: PatchResult = {
      seq,
      revisionId: `rev-${seq}`,
      inverse: [],
      schemaVersion: 4,
      ...(body.clientOpId === undefined ? {} : { clientOpId: body.clientOpId }),
    }
    return result
  }
  return { calls, api: { patchOps } }
}

function select(type: string): void {
  fireEvent.click(within(screen.getByRole('region', { name: '구조 트리' })).getByRole('button', { name: structureRowName(type) }))
}

function list(label: string): HTMLElement {
  return within(screen.getByRole('complementary', { name: '우측 패널' })).getByRole('group', { name: label })
}

const button = (label: string, name: string) => within(list(label)).getByRole('button', { name })
/** 고르기 칸 — 이름(«… N번째 고르기»)으로 찾는다. 역할은 라디오 · 체크 둘이라 한 역할로 못 묻는다. */
const picks = (label: string) => within(list(label)).getAllByLabelText(/번째 고르기$/) as HTMLInputElement[]

describe('선택지 위젯', () => {
  it('하나만 고르는 선택지 — 라디오 · 고르면 다른 항목의 고름을 같은 편집에서 걷는다', async () => {
    const { calls, api } = editable()
    await openPage(DOC, { apiOverrides: api })
    select('Select')

    expect(picks('선택지').map((pick) => [pick.type, pick.checked])).toEqual([
      ['radio', false],
      ['radio', true],
      ['radio', false],
    ])
    fireEvent.click(picks('선택지')[2]!)

    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]).toEqual([
      { op: 'replace', path: '/root/children/0/props/options', value: [{ label: '가' }, { label: '나' }, { label: '다', selected: true }] },
    ])
  })

  it('«고른 것 풀기» — 전부 걷는다 · 고른 것이 없으면 꺼진다', async () => {
    const { calls, api } = editable()
    await openPage(DOC, { apiOverrides: api })
    select('Select')

    fireEvent.click(button('선택지', '고른 것 풀기'))
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]).toEqual([
      { op: 'replace', path: '/root/children/0/props/options', value: [{ label: '가' }, { label: '나' }, { label: '다' }] },
    ])

    select('RadioGroup')
    expect((button('선택지', '고른 것 풀기') as HTMLButtonElement).disabled).toBe(true)
  })

  it('여럿 고르는 선택지 — 체크 · 그 항목만 뒤집는다', async () => {
    const { calls, api } = editable()
    await openPage(DOC, { apiOverrides: api })
    select('CheckboxGroup')

    expect(picks('선택지').map((pick) => pick.type)).toEqual(['checkbox', 'checkbox'])
    fireEvent.click(picks('선택지')[1]!)
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]).toEqual([
      {
        op: 'replace',
        path: '/root/children/1/props/options',
        value: [
          { label: '월', selected: true },
          { label: '화', selected: true },
        ],
      },
    ])
  })

  it('옮기기 — 고른 것이 항목을 따라간다 · 맨 위의 «위로» · 맨 아래의 «아래로» 는 꺼진다', async () => {
    const { calls, api } = editable()
    await openPage(DOC, { apiOverrides: api })
    select('Select')

    expect((button('선택지', '1번째 위로') as HTMLButtonElement).disabled).toBe(true)
    expect((button('선택지', '3번째 아래로') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(button('선택지', '2번째 위로'))
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]).toEqual([
      { op: 'replace', path: '/root/children/0/props/options', value: [{ label: '나', selected: true }, { label: '가' }, { label: '다' }] },
    ])
  })

  it('하나뿐인 선택지는 못 지운다', async () => {
    await openPage(DOC, { apiOverrides: editable().api })
    select('RadioGroup')
    expect((button('선택지', '1번째 지우기') as HTMLButtonElement).disabled).toBe(true)
  })

  it(`상한(${OPTIONS_MAX})에 찬 선택지는 «항목 추가» 가 꺼진다`, async () => {
    await openPage(FULL_DOC, { apiOverrides: editable().api })
    select('Select')
    expect(picks('선택지')).toHaveLength(OPTIONS_MAX)
    expect((button('선택지', '항목 추가') as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('목록 위젯의 옮기기 — stringList 도 얻는다', () => {
  it('항목 «2번째 아래로» — 이웃과 자리를 바꾼 배열 하나', async () => {
    const { calls, api } = editable()
    await openPage(DOC, { apiOverrides: api })
    select('Tree')

    fireEvent.click(button('항목', '2번째 아래로'))
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]).toEqual([{ op: 'replace', path: '/root/children/2/props/items', value: ['이름', '가입일', '이메일'] }])
  })

  it('고치던 칸의 글은 옮기기에 실려 나간다 — 칸을 안 떠나고 단추를 눌러도 잃지 않는다', async () => {
    const { calls, api } = editable()
    await openPage(DOC, { apiOverrides: api })
    select('Tree')

    const cell = within(list('항목')).getByRole('textbox', { name: '항목 1번째 항목' })
    fireEvent.change(cell, { target: { value: '성명' } })
    fireEvent.click(button('항목', '1번째 아래로'))
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]).toEqual([{ op: 'replace', path: '/root/children/2/props/items', value: ['이메일', '성명', '가입일'] }])
  })
})
