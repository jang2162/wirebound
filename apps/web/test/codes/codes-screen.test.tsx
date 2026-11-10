/**
 * **공통코드 화면**(`src/routes/codes.tsx` · `src/codes/codes-screen.tsx`) — jsdom · 메모리 속 가짜 표. 그룹 목록 · 항목 표 · 사용처 · viewer 의
 * 읽기 전용 · 쓰이는 항목 지우기의 확인 · 안 쓰이는 항목은 묻지 않음 · 코드값 칸이 글뿐 · 사용처 줄이 에디터로 가 그 노드를 고름을 잰다.
 * 좁은 창의 카드 접힘 · 긴 이름 넘침은 실브라우저(`apps/web/build-test/codes-screen.test.ts`).
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import type { CodeGroup, UsageHit } from '@wirebound/schema'
import { describe, expect, it } from 'vitest'
import type { ApiClient, CodeUsageCounts } from '../../src/api/client'
import type { ProjectView } from '../../src/api/types'
import { BREAKS_REFERENCES } from '../../src/codes/codes-screen'
import { isolate } from '../../src/shell/isolate'
import { PAGE_ID, PROJECT_ID, PROJECT_NAME, pageDoc, renderEditor, selectionOutline } from '../editor-harness'
import { currentPath, currentSearch } from '../helpers'
import '../../src/catalog-setup'

interface Fake {
  groups: CodeGroup[]
  writes: string[]
  api: Partial<ApiClient>
}

const HIT: UsageHit = { kind: 'page', id: PAGE_ID, title: '회원 목록', nodes: [{ nodeId: 'n-affix', name: '결제 대기 사이 글자' }] }

function fake(role: ProjectView['role'] = 'owner'): Fake {
  const groups: CodeGroup[] = [
    {
      key: 'ORDER_STATUS',
      name: '주문 상태',
      items: [
        { value: 'WAIT', name: '결제 대기', active: true },
        { value: 'DONE', name: '완료', active: false },
      ],
    },
    { key: 'GRADE', name: '등급', items: [] },
  ]
  const writes: string[] = []
  const counts = (): CodeUsageCounts => ({ ORDER_STATUS: { group: 1, items: { WAIT: 1 } } })
  const group = (key: string) => groups.find((entry) => entry.key === key)!
  return {
    groups,
    writes,
    api: {
      getProject: async () => ({ id: PROJECT_ID, name: PROJECT_NAME, slug: 'admin-console', description: '', role, themeRev: 0 }),
      listCodes: async () => structuredClone(groups),
      codeUsageCounts: async () => counts(),
      codeUsage: async (_p, key, item) => (key === 'ORDER_STATUS' && (item === undefined || item === 'WAIT') ? [HIT] : []),
      createCodeGroup: async (_p, body) => {
        writes.push(`create-group ${body.key}`)
        groups.push({ ...body, items: [] })
        return groups.at(-1)!
      },
      createCodeItem: async (_p, key, body) => {
        writes.push(`create-item ${key} ${body.value}`)
        const item = { value: body.value, name: body.name, active: true }
        group(key).items.push(item)
        return item
      },
      deleteCodeItem: async (_p, key, value) => {
        writes.push(`delete-item ${key} ${value}`)
        group(key).items = group(key).items.filter((item) => item.value !== value)
      },
    },
  }
}

async function open(board: Fake, route = `/projects/${PROJECT_ID}/codes`): Promise<void> {
  renderEditor({
    route,
    apiOverrides: board.api,
    docs: {
      [PAGE_ID]: pageDoc({
        id: 'n-root',
        type: 'Page',
        children: [{ id: 'n-affix', type: 'Affix', props: { text: '결제 대기' }, code: { group: 'ORDER_STATUS', item: 'WAIT' } }],
      }),
    },
  })
  await screen.findByRole('heading', { name: `${PROJECT_NAME} 공통코드` })
  await screen.findByRole('list', { name: '공통코드 그룹' })
}

const table = () => screen.getByRole('table', { name: '공통코드 항목' })
const rowOf = (name: string): HTMLElement => {
  const found = within(table())
    .getAllByRole('row')
    .find((tr) => tr.textContent?.includes(isolate(name)))
  if (found === undefined) throw new Error(`${name} 줄이 없다`)
  return found
}

describe('공통코드 화면', () => {
  it('그룹 목록 · 항목 표 · 사용처', async () => {
    await open(fake())
    const picks = within(screen.getByRole('list', { name: '공통코드 그룹' })).getAllByRole('button')
    expect(picks.map((pick) => pick.textContent)).toEqual([
      `${isolate('주문 상태')}ORDER_STATUS · 항목 2 · 사용 1`,
      `${isolate('등급')}GRADE · 항목 0 · 사용 0`,
    ])
    expect(picks[0]!.getAttribute('aria-current')).toBe('true')
    expect(
      within(table())
        .getAllByRole('columnheader')
        .map((th) => th.textContent),
    ).toEqual(['차례', '코드값', '이름', '사용 여부', '사용 수', '행동'])
    const cells = within(rowOf('결제 대기'))
      .getAllByRole('cell')
      .map((td) => td.textContent)
    expect(cells.slice(0, 5)).toEqual(['1', 'WAIT', isolate('결제 대기'), '사용', '1곳'])
    expect(within(rowOf('완료')).getAllByRole('cell')[3]!.textContent).toBe('사용 안 함')
    const usage = await screen.findByRole('list', { name: '사용처 목록' })
    expect(usage.textContent).toBe(`페이지 ${isolate('회원 목록')} › ${isolate('결제 대기 사이 글자')}`)
  })

  it('코드값 칸은 글뿐이다 — 고칠 칸이 없고 «…» 에도 코드값 바꾸기가 없다', async () => {
    await open(fake())
    const valueCell = within(rowOf('결제 대기')).getAllByRole('cell')[1]!
    expect(valueCell.querySelector('input')).toBeNull()
    fireEvent.click(within(rowOf('결제 대기')).getByRole('button', { name: '«결제 대기» 더 보기' }))
    const menu = await screen.findByRole('menu')
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['이름 바꾸기', '사용 안 함으로', '위로', '아래로', '삭제'])
  })

  it('viewer 는 만들기 · «…» 가 없다', async () => {
    await open(fake('viewer'))
    expect(screen.queryByRole('button', { name: /그룹 만들기/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /항목 추가/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /더 보기/ })).toBeNull()
  })

  it('쓰이는 항목 «삭제» 는 확인 상자에 사용 수 · 첫 곳 · «참조가 끊깁니다» 를 보이고, 확인해야 지운다', async () => {
    const board = fake()
    await open(board)
    fireEvent.click(within(rowOf('결제 대기')).getByRole('button', { name: '«결제 대기» 더 보기' }))
    fireEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: '삭제' }))
    const dialog = await screen.findByRole('dialog', { name: '공통코드 항목 삭제' })
    expect(dialog.textContent).toContain('1곳에서 씁니다')
    expect(dialog.textContent).toContain(BREAKS_REFERENCES)
    expect(within(dialog).getByRole('list', { name: '지우면 끊길 곳' }).textContent).toContain(isolate('회원 목록'))
    expect(board.writes).toEqual([])
    fireEvent.click(within(dialog).getByRole('button', { name: '삭제' }))
    await waitFor(() => expect(board.writes).toEqual(['delete-item ORDER_STATUS WAIT']))
  })

  it('안 쓰이는 항목은 묻지 않고 지운다', async () => {
    const board = fake()
    await open(board)
    fireEvent.click(within(rowOf('완료')).getByRole('button', { name: '«완료» 더 보기' }))
    fireEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: '삭제' }))
    await waitFor(() => expect(board.writes).toEqual(['delete-item ORDER_STATUS DONE']))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('그룹을 만들면 그 그룹이 골라진다 · 주소에 실린다', async () => {
    const board = fake()
    await open(board)
    fireEvent.click(screen.getByRole('button', { name: /그룹 만들기/ }))
    const dialog = await screen.findByRole('dialog', { name: '공통코드 그룹 만들기' })
    fireEvent.change(within(dialog).getByLabelText(/그룹 키/), { target: { value: 'PAY_METHOD' } })
    fireEvent.change(within(dialog).getByLabelText('이름'), { target: { value: '결제 수단' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '만들기' }))
    await waitFor(() => expect(board.writes).toEqual(['create-group PAY_METHOD']))
    await waitFor(() => expect(screen.getByRole('region', { name: '그룹 결제 수단' })).toBeTruthy())
  })

  it('사용처 줄을 누르면 에디터로 가 그 노드가 골라진다', async () => {
    await open(fake())
    fireEvent.click(await screen.findByRole('link', { name: new RegExp('결제 대기 사이 글자') }))
    await waitFor(() => expect(currentPath()).toBe(`/projects/${PROJECT_ID}/pages/${PAGE_ID}`))
    await waitFor(() => expect(selectionOutline()?.getAttribute('data-wb-selected-id')).toBe('n-affix'))
    // 고른 뒤 질의를 걷는다 — 다시 고르지 않는다.
    expect(currentSearch()).toBe('')
  })
})
