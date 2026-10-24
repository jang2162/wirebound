/**
 * 색 컨트롤(`color` — `panels/controls/color-control.tsx`). 자리표시자의 바탕 · 테두리 · 글 색.
 *
 * 글 칸은 blur/Enter 에 한 번, 견본 · 고르개 · «테마 기본» 은 곧바로 커밋한다. 값의 꼴은 소문자 `#rrggbb` — 대문자 · `#` 없는 여섯 자리는
 * 그 꼴로 바꿔 보내고, 꼴 밖은 보내지 않고 칸 밑에 말한다. «테마 기본» 은 prop 을 지운다(`remove`).
 *
 * **jsdom 값이다** — 고르개를 끄는 동안의 `input` 연타는 흉내(`fireEvent.input`)로 세운다. Chrome 이 끄는 동안 `input` 을 계속 내는지는 이 파일이
 * 재지 않는다(그 판은 손으로 끄는 것이라 자동화가 같은 이벤트를 못 낸다).
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ApiClient } from '../../src/api/client'
import type { PatchResult } from '../../src/api/types'
import { COLOR_FORMAT_ERROR, normalizeColor } from '../../src/panels/controls/color-control'
import { openPage, pageDoc } from '../editor-harness'
import '../../src/catalog-setup'
import { structureRowName } from './tree-row'

const DOC = pageDoc({
  id: 'n-root',
  type: 'Page',
  children: [
    { id: 'n-set', type: 'Placeholder', props: { label: '칩', background: '#2563eb' } },
    { id: 'n-empty', type: 'Placeholder', props: { label: '빈 칸' } },
  ],
})

function panel(): HTMLElement {
  return screen.getByRole('complementary', { name: '우측 패널' })
}

function selectAt(index: number): void {
  const buttons = within(screen.getByRole('region', { name: '구조 트리' })).getAllByRole('button', {
    name: structureRowName('Placeholder'),
  })
  fireEvent.click(buttons[index]!)
}

function group(label: string): HTMLElement {
  return within(panel()).getByRole('group', { name: label })
}

function textOf(label: string): HTMLInputElement {
  return within(group(label)).getByRole('textbox', { name: `${label} 값` }) as HTMLInputElement
}

function editable(): { calls: { ops: unknown }[]; api: Partial<ApiClient> } {
  const calls: { ops: unknown }[] = []
  let seq = 7
  const patchOps: ApiClient['patchOps'] = async (_projectId, _pageId, body) => {
    calls.push({ ops: body.ops })
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

describe('normalizeColor', () => {
  it('대문자 · # 없는 여섯 자리 · 앞뒤 공백을 소문자 #rrggbb 로 · 빈 글은 테마 기본 · 꼴 밖은 null', () => {
    expect(normalizeColor('#2563EB')).toBe('#2563eb')
    expect(normalizeColor(' 2563eb ')).toBe('#2563eb')
    expect(normalizeColor('')).toBe('')
    expect(normalizeColor('   ')).toBe('')
    for (const bad of ['#fff', 'red', 'url(x)', '#2563eb;', '#2563eb}', 'var(--x)', '#12345g', '#1234567'])
      expect(normalizeColor(bad), bad).toBeNull()
  })
})

describe('속성 패널 — 색 컨트롤', () => {
  it('글 칸은 blur 에 한 번 · 대문자는 소문자로 보낸다', async () => {
    const { calls, api } = editable()
    await openPage(DOC, { apiOverrides: api })
    selectAt(0)
    const input = textOf('바탕색')
    expect(input.value).toBe('#2563eb')
    fireEvent.change(input, { target: { value: '#FDE047' } })
    expect(calls).toHaveLength(0)
    fireEvent.blur(input)
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]!.ops).toEqual([{ op: 'replace', path: '/root/children/0/props/background', value: '#fde047' }])
  })

  it('꼴 밖의 글(url · ; · })은 안 보내고 칸 밑에 말한다', async () => {
    const { calls, api } = editable()
    await openPage(DOC, { apiOverrides: api })
    selectAt(0)
    for (const bad of ['url(https://example.com/x.png)', '#2563eb;color:red', '#2563eb}']) {
      const input = textOf('바탕색')
      fireEvent.change(input, { target: { value: bad } })
      fireEvent.blur(input)
      expect(within(group('바탕색')).getByRole('alert').textContent).toBe(COLOR_FORMAT_ERROR)
    }
    await new Promise((done) => setTimeout(done, 50))
    expect(calls).toHaveLength(0)
  })

  it('견본은 곧바로 그 색을 보낸다 · 안 정한 칸에는 add', async () => {
    const { calls, api } = editable()
    await openPage(DOC, { apiOverrides: api })
    selectAt(1)
    fireEvent.click(within(group('글 색')).getByRole('button', { name: '#dc2626' }))
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]!.ops).toEqual([{ op: 'add', path: '/root/children/1/props/color', value: '#dc2626' }])
  })

  it('«테마 기본» 은 prop 을 지운다 · 안 정한 칸에서는 꺼져 있다', async () => {
    const { calls, api } = editable()
    await openPage(DOC, { apiOverrides: api })
    selectAt(0)
    fireEvent.click(within(group('바탕색')).getByRole('button', { name: '테마 기본' }))
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]!.ops).toEqual([{ op: 'remove', path: '/root/children/0/props/background' }])
    expect((within(group('테두리 색')).getByRole('button', { name: '테마 기본' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('고르개는 끄는 동안의 input 이 아니라 change 에 한 번 보낸다', async () => {
    const { calls, api } = editable()
    await openPage(DOC, { apiOverrides: api })
    selectAt(1)
    const picker = within(group('테두리 색')).getByLabelText('테두리 색 고르기') as HTMLInputElement
    for (const value of ['#111111', '#222222', '#333333']) {
      picker.value = value
      fireEvent.input(picker)
    }
    await new Promise((done) => setTimeout(done, 50))
    expect(calls).toHaveLength(0)
    picker.value = '#333333'
    fireEvent.change(picker)
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]!.ops).toEqual([{ op: 'add', path: '/root/children/1/props/borderColor', value: '#333333' }])
  })
})
