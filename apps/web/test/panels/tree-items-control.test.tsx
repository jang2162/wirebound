/**
 * 트리 항목 칸(`treeItems` — `src/panels/controls/tree-items-control.tsx`). 줄마다 이름 · 펼침 표지 · `…`, 이름 칸의 단축키, 한도.
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 그린다 | 접힌 항목의 자식 줄이 패널에서 빠진다 · 줄 이름이 자리를 안 갖는다 |
 * | 더하기 셋 | 맨 위 끝 · 바로 아래 · 하위(그 항목을 편다)가 아니다 · 편집이 prop 통째 `replace` 하나가 아니다 |
 * | 계층 · 차례 | 들여쓰기가 앞 형제의 자식 끝 · 내어쓰기가 부모 바로 뒤 · 위로 · 아래로가 이웃과 바꿈이 아니다 |
 * | 단축키 | 이름 칸의 Alt+Shift+→ · ← · Alt+↑ · ↓ 가 그 조작이 아니다 · 옮긴 뒤 포커스가 그 항목을 안 따른다 |
 * | 지우기 · 펼침 | 마지막 자식을 지운 부모에 `open` · `children` 이 남는다 · 펼침 단추 · «접기» 가 `open` 을 안 뒤집는다 |
 * | 이름 | blur 에 안 나간다 · 그대로인데 나간다 · 칸을 안 떠나고 들여쓰면 친 글을 잃는다 |
 * | 한도 | 100 항목에서 더하기가 켜진다 · 5 단에서 하위 · 들여쓰기가 켜진다 · 끈 까닭이 없다 |
 * | 깨진 값 | 배열이 아닌 값 · 깨진 원소에서 셸이 죽는다 |
 *
 * 실브라우저 판(키보드만으로 · 되돌리기 · 캔버스 · 번들 · 화면 모드)은 `build-test/tree-items.test.ts`.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ApiClient } from '../../src/api/client'
import type { PatchResult } from '../../src/api/types'
import { canvasQuery, openPage, pageDoc } from '../editor-harness'
import '../../src/catalog-setup'
import { structureRowName } from './tree-row'

const ITEMS = [
  { label: '회원', open: true, children: [{ label: '목록' }, { label: '휴면', children: [{ label: '해제' }] }] },
  { label: '통계' },
]

const doc = (items: unknown) => pageDoc({ id: 'n-root', type: 'Page', children: [{ id: 'n-tree', type: 'Tree', props: { items } }] })

function panel(): HTMLElement {
  return screen.getByRole('complementary', { name: '우측 패널' })
}

function selectTree(): void {
  fireEvent.click(within(screen.getByRole('region', { name: '구조 트리' })).getAllByRole('button', { name: structureRowName('Tree') })[0]!)
}

function widget(): HTMLElement {
  return within(panel()).getByRole('group', { name: '항목' })
}

/** 줄마다 «자리 이름=글» — 자리는 접근 이름의 «항목 1-2». */
function rows(): string[] {
  return [...widget().querySelectorAll<HTMLInputElement>('input[type="text"]')].map(
    (input) => `${(input.getAttribute('aria-label') ?? '').replace(/^항목 | 이름$/g, '')}=${input.value}`,
  )
}

function nameCell(at: string): HTMLInputElement {
  return within(widget()).getByRole<HTMLInputElement>('textbox', { name: `항목 ${at} 이름` })
}

/** 줄 `…` 를 열어 항목 하나를 고른다 — 꺼졌으면 고르지 않고 그 항목을 낸다. */
function menuItem(at: string, label: string): HTMLElement {
  fireEvent.click(within(widget()).getByRole('button', { name: `항목 ${at} 더 보기` }))
  return screen.getByRole('menuitem', { name: label })
}

function pick(at: string, label: string): void {
  fireEvent.click(menuItem(at, label))
}

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
      schemaVersion: 6,
      ...(body.clientOpId === undefined ? {} : { clientOpId: body.clientOpId }),
    }
    return result
  }
  return { calls, api: { patchOps } }
}

/** 편집 하나가 `items` 통째 `replace` 하나인지 보고 그 값을 낸다. */
async function committed(calls: unknown[], count = 1): Promise<unknown> {
  await waitFor(() => expect(calls).toHaveLength(count))
  const ops = calls.at(-1) as { op: string; path: string; value: unknown }[]
  expect(ops.map((op) => [op.op, op.path])).toEqual([['replace', '/root/children/0/props/items']])
  return ops[0]!.value
}

describe('트리 항목 칸 — 그린다', () => {
  it('모든 줄을 그린다 — 접힌 항목(«휴면»)의 자식도 패널에는 선다', async () => {
    await openPage(doc(ITEMS))
    selectTree()
    expect(rows()).toEqual(['1=회원', '1-1=목록', '1-2=휴면', '1-2-1=해제', '2=통계'])
    // 캔버스는 접힌 항목의 자식을 안 그린다 — 패널과 갈리는 것이 뜻이다(칸 머리말 «패널은 접힌 항목의 자식도 그린다»).
    expect(canvasQuery('[data-wb-id="n-tree"]')?.textContent).not.toContain('해제')
  })
})

describe('트리 항목 칸 — 더하기', () => {
  it('«항목 추가» 는 맨 위 끝에 빈 항목 하나를 더한다', async () => {
    const { calls, api } = editable()
    await openPage(doc(ITEMS), { apiOverrides: api })
    selectTree()
    fireEvent.click(within(widget()).getByRole('button', { name: '항목 추가' }))
    expect(await committed(calls)).toEqual([...ITEMS, { label: '' }])
  })

  it('«아래에 항목 추가» 는 그 항목 바로 뒤 · 같은 단이다', async () => {
    const { calls, api } = editable()
    await openPage(doc(ITEMS), { apiOverrides: api })
    selectTree()
    pick('1-1', '아래에 항목 추가')
    expect(await committed(calls)).toEqual([
      { label: '회원', open: true, children: [{ label: '목록' }, { label: '' }, { label: '휴면', children: [{ label: '해제' }] }] },
      { label: '통계' },
    ])
  })

  it('«하위 항목 추가» 는 그 항목의 자식 끝에 더하고 그 항목을 편다', async () => {
    const { calls, api } = editable()
    await openPage(doc(ITEMS), { apiOverrides: api })
    selectTree()
    pick('2', '하위 항목 추가')
    expect(await committed(calls)).toEqual([ITEMS[0], { label: '통계', open: true, children: [{ label: '' }] }])
  })
})

describe('트리 항목 칸 — 계층 · 차례', () => {
  it('들여쓰기 — 앞 형제의 자식 끝으로 가고 앞 형제를 편다', async () => {
    const { calls, api } = editable()
    await openPage(doc(ITEMS), { apiOverrides: api })
    selectTree()
    pick('2', '들여쓰기')
    expect(await committed(calls)).toEqual([
      { label: '회원', open: true, children: [{ label: '목록' }, { label: '휴면', children: [{ label: '해제' }] }, { label: '통계' }] },
    ])
  })

  it('내어쓰기 — 부모 바로 뒤로 가고, 뒤 형제는 그 자리에 남는다', async () => {
    const { calls, api } = editable()
    await openPage(doc(ITEMS), { apiOverrides: api })
    selectTree()
    pick('1-1', '내어쓰기')
    expect(await committed(calls)).toEqual([
      { label: '회원', open: true, children: [{ label: '휴면', children: [{ label: '해제' }] }] },
      { label: '목록' },
      { label: '통계' },
    ])
  })

  it('아래로 — 이웃과 자리를 바꾼다(자식이 따라간다)', async () => {
    const { calls, api } = editable()
    await openPage(doc(ITEMS), { apiOverrides: api })
    selectTree()
    pick('1', '아래로')
    expect(await committed(calls)).toEqual([ITEMS[1], ITEMS[0]])
  })

  it('맨 위 줄의 «위로» · «들여쓰기» · «내어쓰기» 는 꺼지고 까닭을 단다', async () => {
    await openPage(doc(ITEMS))
    selectTree()
    const reasons = ['위로', '들여쓰기', '내어쓰기'].map((label) => {
      const item = menuItem('1', label)
      fireEvent.keyDown(item, { key: 'Escape' })
      return [item.getAttribute('aria-disabled'), item.getAttribute('title')]
    })
    expect(reasons).toEqual([
      ['true', '앞에 형제가 있어야 합니다'],
      ['true', '앞에 형제 항목이 있어야 합니다'],
      ['true', '부모 항목이 있어야 합니다'],
    ])
  })
})

describe('트리 항목 칸 — 이름 칸의 단축키', () => {
  it.each([
    ['Alt+Shift+→ 들여쓰기', '2', { key: 'ArrowRight', altKey: true, shiftKey: true }, '1-3'],
    ['Alt+Shift+← 내어쓰기', '1-2', { key: 'ArrowLeft', altKey: true, shiftKey: true }, '2'],
    ['Alt+↑ 위로', '1-2', { key: 'ArrowUp', altKey: true }, '1-1'],
    ['Alt+↓ 아래로', '1', { key: 'ArrowDown', altKey: true }, '2'],
  ] as const)('%s — 편집 하나 · 포커스가 그 항목의 새 자리로 간다', async (_what, from, key, to) => {
    const { calls, api } = editable()
    await openPage(doc(ITEMS), { apiOverrides: api })
    selectTree()
    const label = nameCell(from).value
    nameCell(from).focus()
    fireEvent.keyDown(nameCell(from), key)
    await committed(calls)
    await act(async () => {})
    expect(document.activeElement).toBe(nameCell(to))
    expect(nameCell(to).value).toBe(label)
  })

  it('칸을 안 떠나고 들여쓰면 친 글이 그 편집에 실린다', async () => {
    const { calls, api } = editable()
    await openPage(doc(ITEMS), { apiOverrides: api })
    selectTree()
    fireEvent.change(nameCell('2'), { target: { value: '통계 보기' } })
    fireEvent.keyDown(nameCell('2'), { key: 'ArrowRight', altKey: true, shiftKey: true })
    const value = (await committed(calls)) as { children: { label: string }[] }[]
    expect(value[0]!.children.at(-1)).toEqual({ label: '통계 보기' })
  })
})

describe('트리 항목 칸 — 지우기 · 펼침', () => {
  it('마지막 자식을 지우면 부모에 `open` · `children` 이 안 남는다', async () => {
    const { calls, api } = editable()
    await openPage(doc(ITEMS), { apiOverrides: api })
    selectTree()
    pick('1-2-1', '지우기')
    expect(await committed(calls)).toEqual([
      { label: '회원', open: true, children: [{ label: '목록' }, { label: '휴면' }] },
      { label: '통계' },
    ])
  })

  it('펼침 단추(포인터)와 «펼치기» 가 `open` 을 뒤집는다 — 잎에는 둘 다 없다', async () => {
    const { calls, api } = editable()
    await openPage(doc(ITEMS), { apiOverrides: api })
    selectTree()
    const row = (at: string) => nameCell(at).parentElement!
    fireEvent.click(row('1').querySelector<HTMLButtonElement>('[data-tree-toggle]')!)
    expect(((await committed(calls)) as { open?: boolean }[])[0]!.open).toBeUndefined()
    pick('1-2', '펼치기')
    const value = (await committed(calls, 2)) as { children: { open?: boolean }[] }[]
    expect(value[0]!.children[1]!.open).toBe(true)
    // 잎 — 표지 자리는 빈 칸이고 «펼치기» · «접기» 가 목록에 없다.
    expect(row('2').querySelector('[data-tree-toggle]')).toBeNull()
    fireEvent.click(within(widget()).getByRole('button', { name: '항목 2 더 보기' }))
    expect(screen.queryByRole('menuitem', { name: /^(펼치기|접기)$/ })).toBeNull()
  })
})

describe('트리 항목 칸 — 이름', () => {
  it('이름은 blur 에 나가고, 그대로면 안 나간다', async () => {
    const { calls, api } = editable()
    await openPage(doc(ITEMS), { apiOverrides: api })
    selectTree()
    fireEvent.blur(nameCell('1-1'))
    expect(calls).toHaveLength(0)
    fireEvent.change(nameCell('1-1'), { target: { value: '회원 목록' } })
    expect(calls).toHaveLength(0)
    fireEvent.blur(nameCell('1-1'))
    const value = (await committed(calls)) as { children: { label: string }[] }[]
    expect(value[0]!.children[0]).toEqual({ label: '회원 목록' })
  })
})

describe('트리 항목 칸 — 한도', () => {
  it('100 항목이면 «항목 추가» · «아래에 항목 추가» · «하위 항목 추가» 가 꺼진다', async () => {
    await openPage(doc(Array.from({ length: 100 }, (_, index) => ({ label: `항목 ${index + 1}` }))))
    selectTree()
    const add = within(widget()).getByRole<HTMLButtonElement>('button', { name: '항목 추가' })
    const after = menuItem('1', '아래에 항목 추가')
    const child = screen.getByRole('menuitem', { name: '하위 항목 추가' })
    expect([add.disabled, add.title, after.getAttribute('aria-disabled'), child.getAttribute('title')]).toEqual([
      true,
      '트리 항목은 100개까지입니다',
      'true',
      '트리 항목은 100개까지입니다',
    ])
  })

  it('5 단의 항목은 «하위 항목 추가» 가, 4 단을 품은 항목은 «들여쓰기» 가 꺼진다', async () => {
    const chain = (depth: number, label: string): object =>
      depth === 1 ? { label } : { label, open: true, children: [chain(depth - 1, `${label}.`)] }
    await openPage(doc([{ label: '앞' }, chain(5, '뿌리')]))
    selectTree()
    const deepest = menuItem('2-1-1-1-1', '하위 항목 추가')
    fireEvent.keyDown(deepest, { key: 'Escape' })
    const indent = menuItem('2', '들여쓰기')
    expect([deepest.getAttribute('title'), indent.getAttribute('title')]).toEqual([
      '트리 깊이는 5단까지입니다',
      '트리 깊이는 5단까지입니다',
    ])
  })
})

describe('트리 항목 칸 — 깨진 값', () => {
  it('배열이 아닌 값이면 빈 칸으로 선다 — 셸이 산다', async () => {
    await openPage(doc('회원, 통계'))
    selectTree()
    expect(rows()).toEqual([])
    expect(document.body.querySelector('.wb-shell')).not.toBeNull()
  })

  it('깨진 원소는 빈 이름의 줄이다 — 지우지 않는다', async () => {
    await openPage(doc(['글', null, { label: 3, children: 'x' }]))
    selectTree()
    expect(rows()).toEqual(['1=', '2=', '3='])
    expect(document.body.querySelector('.wb-shell')).not.toBeNull()
  })
})
