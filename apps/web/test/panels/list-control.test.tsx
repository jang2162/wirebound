/**
 * 목록 컨트롤(`pairList` — 같은 위젯이 `optionList` · `fileList` 도 그린다). 항목을 더하고 지우고 고친다. 트리 항목(`treeItems`)은
 * `tree-items-control.test.tsx`.
 *
 * **배열을 통째로 `replace`한다** — 항목마다 인덱스를 조작하지 않는다. 그 판단의 근거는
 * `panels/controls/list-control.tsx`에 있다.
 *
 * **케이스 `배열이 아닌 값이면 빈 목록으로 시작한다`가 이 파일의 방어선이다.** 속성 패널은
 * 캔버스의 오류 경계 **밖**이라(`apps/web/src`의 경계는 캔버스의 `CanvasBoundary` 하나이고
 * 속성 패널은 그 안에 없다) 여기서 던지면 셸 전체가 흰 화면이 된다.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ApiClient } from '../../src/api/client'
import type { PatchResult } from '../../src/api/types'
import { openPage, pageDoc, canvasQuery } from '../editor-harness'
import '../../src/catalog-setup'
import { structureRowName } from './tree-row'

const DOC = pageDoc({
  id: 'n-root',
  type: 'Page',
  children: [
    {
      id: 'n-kv',
      type: 'KeyValue',
      props: {
        pairs: [
          { key: '가입일', value: '2026-01-01' },
          { key: '등급', value: 'VIP' },
        ],
      },
    },
    // 빈 배열. 추가 버튼이 있어야 여기서 시작할 수 있다.
    { id: 'n-empty', type: 'KeyValue', props: { pairs: [] } },
  ],
})

/** `items`가 배열이 **아닌** 문서. 검증을 통과하지 못한 문서가 스토어에 실리는 창이다. */
const BROKEN_DOC = pageDoc({
  id: 'n-root',
  type: 'Page',
  children: [{ id: 'n-kv', type: 'KeyValue', props: { pairs: 7 } }],
})

function panel(): HTMLElement {
  return screen.getByRole('complementary', { name: '우측 패널' })
}

function selectAt(type: string, index = 0): void {
  const buttons = within(screen.getByRole('region', { name: '구조 트리' })).getAllByRole('button', {
    name: structureRowName(type),
  })
  const button = buttons[index]
  if (button === undefined) throw new Error(`구조 트리에 ${type}[${index}]이 없다`)
  fireEvent.click(button)
}

/** 목록 컨트롤 하나. 라벨로 찾는다. */
function list(label: string): HTMLElement {
  const group = within(panel()).queryByRole('group', { name: label })
  if (group === null) throw new Error(`목록 컨트롤이 없다: ${label}`)
  return group
}

/** 목록의 항목 입력들. `pairList`는 한 줄에 둘이다. */
function itemInputs(label: string): HTMLInputElement[] {
  return [...list(label).querySelectorAll<HTMLInputElement>('input')]
}

function itemValues(label: string): string[] {
  return itemInputs(label).map((input) => input.value)
}

function addButton(label: string): HTMLElement {
  return within(list(label)).getByRole('button', { name: '항목 추가' })
}

function removeButtons(label: string): HTMLElement[] {
  return within(list(label)).getAllByRole('button', { name: /지우기/ })
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

function lastOps(calls: { ops: unknown }[]): unknown {
  return calls.at(-1)?.ops ?? null
}

const KV = (pairs: [string, string][]) => pairs.map(([key, value]) => ({ key, value }))

describe('속성 패널 — 목록 컨트롤', () => {
  it('항목을 추가하면 배열 끝에 붙는다', async () => {
    const { calls, api } = editable()
    await openPage(DOC, { apiOverrides: api })

    selectAt('KeyValue', 0)
    fireEvent.click(addButton('키-값'))

    await waitFor(() => expect(calls).toHaveLength(1))
    // **배열 통째로 `replace`다.** 인덱스를 조작하는 `add /…/pairs/-`가 아니다.
    expect(lastOps(calls)).toEqual([
      {
        op: 'replace',
        path: '/root/children/0/props/pairs',
        value: KV([
          ['가입일', '2026-01-01'],
          ['등급', 'VIP'],
          ['', ''],
        ]),
      },
    ])
  })

  it('항목을 지우면 그 자리가 빠진다', async () => {
    const { calls, api } = editable()
    await openPage(DOC, { apiOverrides: api })

    selectAt('KeyValue', 0)
    fireEvent.click(removeButtons('키-값')[0]!)

    await waitFor(() => expect(calls).toHaveLength(1))
    expect(lastOps(calls)).toEqual([{ op: 'replace', path: '/root/children/0/props/pairs', value: KV([['등급', 'VIP']]) }])
  })

  it('항목을 고치면 blur에 나간다 — 키와 값을 함께 낸다', async () => {
    // 텍스트와 같은 규칙이다 — 글자마다 요청하면 undo 한 단계가 글자 하나가 된다.
    const { calls, api } = editable()
    await openPage(DOC, { apiOverrides: api })

    selectAt('KeyValue', 0)
    const inputs = itemInputs('키-값')
    // 한 줄에 키와 값 둘이다.
    expect(inputs).toHaveLength(4)
    fireEvent.change(inputs[1]!, { target: { value: '2026-02-02' } })

    // 타이핑만으로는 나가지 않는다.
    expect(calls).toHaveLength(0)

    fireEvent.blur(inputs[1]!)
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(lastOps(calls)).toEqual([
      {
        op: 'replace',
        path: '/root/children/0/props/pairs',
        value: KV([
          ['가입일', '2026-02-02'],
          ['등급', 'VIP'],
        ]),
      },
    ])
  })

  it('항목이 그대로면 blur해도 나가지 않는다', async () => {
    const { calls, api } = editable()
    await openPage(DOC, { apiOverrides: api })

    selectAt('KeyValue', 0)
    fireEvent.blur(itemInputs('키-값')[0]!)

    expect(calls).toHaveLength(0)
  })

  it('배열이 아닌 값이면 빈 목록으로 시작한다', async () => {
    // **이 파일의 방어선이다.** 속성 패널은 오류 경계 밖이라 여기서 던지면 셸 전체가
    // 흰 화면이 된다. `pairs`가 수인 문서를 심어 잰다.
    await openPage(BROKEN_DOC)

    selectAt('KeyValue')
    expect(itemValues('키-값')).toEqual([])
    expect(document.body.querySelector('.wb-shell')).not.toBeNull()
  })

  it('원소 모양이 깨진 pairList도 셸을 죽이지 않는다', async () => {
    // 배열이긴 한데 원소가 `{ key, value }`가 아닌 경우다. 위 케이스가 배열 자체를
    // 봤다면 이쪽은 원소를 본다 — 둘은 다른 갈래다.
    await openPage(
      pageDoc({
        id: 'n-root',
        type: 'Page',
        children: [{ id: 'n-kv', type: 'KeyValue', props: { pairs: ['그냥 문자열', null, 3] } }],
      }),
    )

    selectAt('KeyValue')

    // 세 줄이 빈 쌍으로 그려진다 — 지워 버리면 사용자가 무엇을 잃었는지 모른다.
    expect(itemValues('키-값')).toEqual(['', '', '', '', '', ''])
    expect(document.body.querySelector('.wb-shell')).not.toBeNull()
  })

  it('빈 배열도 그린다', async () => {
    // 추가 버튼이 있어야 빈 목록에서 시작할 수 있다.
    const { calls, api } = editable()
    await openPage(DOC, { apiOverrides: api })

    selectAt('KeyValue', 1)
    expect(itemValues('키-값')).toEqual([])
    fireEvent.click(addButton('키-값'))

    await waitFor(() => expect(calls).toHaveLength(1))
    expect(lastOps(calls)).toEqual([{ op: 'replace', path: '/root/children/1/props/pairs', value: KV([['', '']]) }])
  })

  it('편집한 목록이 캔버스에 반영된다', async () => {
    const { calls, api } = editable()
    await openPage(DOC, { apiOverrides: api })

    selectAt('KeyValue', 0)
    const input = itemInputs('키-값')[0]!
    fireEvent.change(input, { target: { value: '성명' } })
    fireEvent.blur(input)

    await waitFor(() => expect(calls).toHaveLength(1))
    const node = canvasQuery('[data-wb-id="n-kv"]')
    if (node === null) throw new Error('캔버스에 노드가 없다')
    expect(node.textContent).toContain('성명')
  })

  /**
   * **칸을 떠나지 않은 채 고른 것이 바뀌면 고치던 칸의 초안이 앞 노드에 간다**(`ListControl`의 `onLeave` → `panels/property-panel.tsx`의
   * `useLeftoverCommit`). `fireEvent.click`은 포커스를 안 옮겨 blur 없이 선택이 바뀐다 — 사람이 아니라 남의 일(일부 거절 · 다른 탭)이
   * 고른 것을 바꾸는 길과 같은 꼴이다. 새 노드(`n-empty`)에는 안 간다. 혼자 죽는 변조: `ListControl`이 내려갈 때 초안을 안 넘긴다.
   */
  it('고치던 칸을 떠나지 않은 채 고른 것이 바뀌면 그 초안이 앞 노드에 간다', async () => {
    const { calls, api } = editable()
    await openPage(DOC, { apiOverrides: api })

    selectAt('KeyValue', 0)
    fireEvent.change(itemInputs('키-값')[0]!, { target: { value: '성명' } })
    selectAt('KeyValue', 1)

    await waitFor(() => expect(calls).toHaveLength(1))
    expect(lastOps(calls)).toEqual([
      {
        op: 'replace',
        path: '/root/children/0/props/pairs',
        value: KV([
          ['성명', '2026-01-01'],
          ['등급', 'VIP'],
        ]),
      },
    ])
    expect(itemValues('키-값')).toEqual([])
  })

  it('다른 노드를 고르면 목록이 그 노드 값으로 바뀐다', async () => {
    await openPage(DOC)

    selectAt('KeyValue', 0)
    expect(itemValues('키-값')).toEqual(['가입일', '2026-01-01', '등급', 'VIP'])

    selectAt('KeyValue', 1)
    expect(itemValues('키-값')).toEqual([])
  })
})
