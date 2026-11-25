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
import { BREAKS_REFERENCES, NO_MATCH } from '../../src/codes/codes-screen'
import { isolate } from '../../src/shell/isolate'
import { PAGE_ID, PROJECT_ID, PROJECT_NAME, pageDoc, renderEditor, selectionOutline } from '../editor-harness'
import { currentPath, currentSearch } from '../helpers'
import '../../src/catalog-setup'

interface Fake {
  groups: CodeGroup[]
  writes: string[]
  api: Partial<ApiClient>
}

const HIT: UsageHit = {
  kind: 'page',
  id: PAGE_ID,
  title: '회원 목록',
  nodes: [{ nodeId: 'n-affix', name: '결제 대기 사이 글자', type: 'Affix', trail: [] }],
}

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
    // 페이지마다 묶음(이름 · 노드 수) — 줄은 타입 · 노드 이름(조상이 없으면 조상 글이 없다).
    expect(usage.querySelector('summary')?.textContent).toBe(`페이지 ${isolate('회원 목록')}1`)
    expect(within(usage).getByRole('link').textContent).toBe(`Affix${isolate('결제 대기 사이 글자')}`)
    // 머리 — 조사 없이 «쓰는 곳» · 고른 범위 · 수.
    const region = screen.getByRole('region', { name: '사용처' })
    within(region).getByRole('heading', { name: '쓰는 곳' })
    expect(region.querySelector('.wb-shell-codes-key')?.textContent).toBe(`«${isolate('주문 상태')}» · 페이지 1 · 노드 1`)
  })

  /** 같은 이름의 노드 둘이 조상 이름으로 갈린다 — 내부 id 는 줄에 안 보인다. 조상이 셋 이상이면 가까운 둘만 · 앞은 «…». */
  it('사용처 — 같은 이름의 둘을 조상 이름으로 가르고 페이지마다 묶는다', async () => {
    const board = fake()
    const select = (nodeId: string, trail: string[]) => ({ nodeId, name: '셀렉트', type: 'Select', trail })
    board.api.codeUsage = async () => [
      {
        kind: 'page',
        id: PAGE_ID,
        title: '과목관리',
        nodes: [select('n_s1', ['검색 폼', '과목분류 필드']), select('n_s2', ['교수법 필드'])],
      },
      { kind: 'module', id: 'm1', title: '기본 틀', nodes: [select('n_s3', ['머리', '카드', '탭', '분류 필드'])] },
    ]
    await open(board)
    const usage = await screen.findByRole('list', { name: '사용처 목록' })
    expect([...usage.querySelectorAll('summary')].map((summary) => summary.textContent)).toEqual([
      `페이지 ${isolate('과목관리')}2`,
      `모듈 ${isolate('기본 틀')}1`,
    ])
    const lines = [...usage.querySelectorAll('.wb-shell-codes-usage-node')].map((line) => line.textContent)
    expect(lines).toEqual([
      `Select${isolate('셀렉트')}${isolate('검색 폼')} › ${isolate('과목분류 필드')}`,
      `Select${isolate('셀렉트')}${isolate('교수법 필드')}`,
      `Select${isolate('셀렉트')}… › ${isolate('탭')} › ${isolate('분류 필드')}`,
    ])
    expect(new Set(lines).size).toBe(lines.length)
    expect(lines.join('')).not.toContain('n_s')
    // 페이지 줄은 링크(그 노드로) · 모듈 줄은 글이다.
    expect(
      within(usage)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual([`/projects/${PROJECT_ID}/pages/${PAGE_ID}?node=n_s1`, `/projects/${PROJECT_ID}/pages/${PAGE_ID}?node=n_s2`])
    expect(screen.getByRole('region', { name: '사용처' }).querySelector('.wb-shell-codes-key')?.textContent).toBe(
      `«${isolate('주문 상태')}» · 페이지 1 · 모듈 1 · 노드 3`,
    )
  })

  it('그룹 찾기 — 이름 · 키의 부분 일치(대소문자 무시) · 없으면 문장 · 걸러진 고른 그룹의 오른쪽은 그대로', async () => {
    await open(fake())
    const find = screen.getByRole('searchbox', { name: '그룹 찾기' })
    const shown = () =>
      within(screen.getByRole('list', { name: '공통코드 그룹' }))
        .getAllByRole('button')
        .map((pick) => pick.querySelector('.wb-shell-admin-pick-name')?.textContent)
    expect(shown()).toEqual([isolate('주문 상태'), isolate('등급')])
    fireEvent.change(find, { target: { value: 'grade' } })
    expect(shown()).toEqual([isolate('등급')])
    fireEvent.change(find, { target: { value: '주문' } })
    expect(shown()).toEqual([isolate('주문 상태')])
    fireEvent.change(find, { target: { value: '  Order_ ' } })
    expect(shown()).toEqual([isolate('주문 상태')])
    // 고른 그룹(주문 상태)이 걸러져도 오른쪽은 그대로 — 찾기는 고르기가 아니다.
    fireEvent.change(find, { target: { value: '등' } })
    expect(shown()).toEqual([isolate('등급')])
    expect(screen.getByRole('region', { name: '그룹 주문 상태' })).toBeTruthy()
    expect(currentSearch()).toBe('')
    fireEvent.change(find, { target: { value: '없는 그룹' } })
    expect(screen.queryByRole('list', { name: '공통코드 그룹' })).toBeNull()
    screen.getByText(NO_MATCH)
    expect(screen.getByRole('region', { name: '그룹 주문 상태' })).toBeTruthy()
    // 비우면 다 선다.
    fireEvent.change(find, { target: { value: '' } })
    expect(shown()).toEqual([isolate('주문 상태'), isolate('등급')])
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

  /**
   * 화면은 룸에 안 들어 사용 수(`codeUsageCounts`)가 연 때의 값이다 — 연 뒤 다른 탭 · 다른 사람이 그 항목을 묶은 판. 지우기 직전에 사용처를 다시
   * 묻지 않으면 낡은 0 으로 확인 없이 지운다.
   */
  it('화면을 연 뒤 다른 길로 묶인 항목 «삭제» 는 확인 상자가 선다 — 연 때의 사용 수 0 으로 지우지 않는다', async () => {
    const board = fake()
    let asked = 0
    board.api.codeUsage = async (_p, key, item) => {
      asked += 1
      return key === 'ORDER_STATUS' && item === 'DONE'
        ? [{ ...HIT, nodes: [...HIT.nodes, { nodeId: 'n-late', name: '완료 버튼', type: 'Button', trail: [] }] }]
        : []
    }
    await open(board)
    // 판 카나리아 — 화면이 아는 사용 수는 0 이다.
    expect(within(rowOf('완료')).getAllByRole('cell')[4]!.textContent).toBe('0곳')
    const before = asked
    fireEvent.click(within(rowOf('완료')).getByRole('button', { name: '«완료» 더 보기' }))
    fireEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: '삭제' }))
    // 상자가 서거나 지우기가 나가거나 — 어느 쪽인지는 아래 값으로 가른다(상자만 기다리면 곧바로 지운 판이 시간 초과로 죽는다).
    await waitFor(() => expect(screen.queryByRole('dialog') !== null || board.writes.length > 0).toBe(true))
    expect(board.writes).toEqual([])
    const dialog = screen.getByRole('dialog', { name: '공통코드 항목 삭제' })
    // 수는 방금 물은 사용처의 노드 수다(연 때의 0 이 아니다).
    expect(dialog.textContent).toContain('2곳에서 씁니다')
    expect(asked - before).toBe(1)
    expect(board.writes).toEqual([])
    fireEvent.click(within(dialog).getByRole('button', { name: '삭제' }))
    await waitFor(() => expect(board.writes).toEqual(['delete-item ORDER_STATUS DONE']))
  })

  it('사용처 조회가 실패하면 지우지 않고 말한다', async () => {
    const board = fake()
    // 여는 동안의 사용처 칸 조회는 답하고, 지우기가 묻는 조회만 끊는다(하네스는 여는 때의 함수를 쥔다).
    let failing = false
    board.api.codeUsage = async () => {
      if (failing) throw new Error('끊김')
      return []
    }
    await open(board)
    failing = true
    fireEvent.click(within(rowOf('완료')).getByRole('button', { name: '«완료» 더 보기' }))
    fireEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: '삭제' }))
    await waitFor(() => expect(screen.queryByRole('alert') !== null || board.writes.length > 0).toBe(true))
    expect(board.writes).toEqual([])
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
