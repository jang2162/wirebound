/**
 * **에디터가 노드를 부르는 이름이 표의 이름이다** — 구조 트리 줄(줄 글 · 줄 단추와 줄 행동의 접근 이름) · 상호작용 탭(제목 · 대상 목록 · 문장) ·
 * 상태 지우기 상자의 줄. 캔버스는 표의 이름으로 그리므로(`codes-canvas.test.tsx`) 이 자리들이 prop 의 대체 글을 쓰면 한 노드가 두 이름으로 불린다.
 *
 * 픽스처는 대체 글(«옛 이름»)과 표의 이름(«새 이름»)을 다르게 둔다. jsdom 값이다.
 */
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import type { CodeGroup, PageDocument } from '@wirebound/schema'
import { afterEach, describe, expect, it } from 'vitest'
import { REMOVE_STATE_TITLE } from '../../src/panels/remove-state-dialog'
import { PAGE_ID, nodeElement, openPage, pageDoc } from '../editor-harness'
import '../../src/catalog-setup'
import { rowToggle, structureRowName } from '../panels/tree-row'

afterEach(cleanup)

const GROUP: CodeGroup = { key: 'ORDER_STATUS', name: '주문 상태', items: [{ value: 'WAIT', name: '새 이름', active: true }] }

function doc(): PageDocument {
  return {
    ...pageDoc({
      id: 'n-root',
      type: 'Page',
      children: [
        {
          id: 'n-btn',
          type: 'Button',
          props: { label: '옛 이름' },
          code: { group: 'ORDER_STATUS', item: 'WAIT' },
          visibility: { mode: 'only', states: ['s_guest'] },
          interactions: [{ on: 'click', actions: [{ type: 'setVisible', target: 'n-btn', value: false }] }],
        },
        // 기본 상태에서 보이는 묶인 노드 — 표가 실렸는지를 캔버스의 이 노드로 기다린다(버튼은 «손님»에서만 보여 캔버스에 없다).
        { id: 'n-affix', type: 'Affix', props: { text: '옛 글' }, code: { group: 'ORDER_STATUS', item: 'WAIT' } },
      ],
    }),
    viewStates: [{ id: 's_guest', name: '손님' }],
  }
}

async function open(table: CodeGroup[]): Promise<HTMLElement> {
  await openPage(doc(), {
    apiOverrides: {
      listCodes: async () => table,
      codeUsageCounts: async () => ({}),
      getTree: async () => [
        {
          id: 'mn-1',
          title: '회원관리',
          sortOrder: 1,
          pages: [{ id: PAGE_ID, title: '회원 목록', sortOrder: 1, viewStates: [{ id: 's_guest', name: '손님' }] }],
          children: [],
        },
      ],
    },
  })
  const list = document.body.querySelector<HTMLElement>('.wb-shell-structure-list')
  if (list === null) throw new Error('구조 트리 목록이 없습니다')
  return list
}

/** 표가 실렸다 — 캔버스의 묶인 노드가 표의 이름으로 선다. 트리 줄로 기다리면 트리 줄의 고침을 뗀 변조가 다른 케이스의 판 만들기를 죽인다. */
const tableLoaded = (): Promise<void> => waitFor(() => expect(nodeElement('n-affix')?.textContent).toBe('새 이름'))

const buttonRow = (list: HTMLElement): HTMLElement => within(list).getByRole('button', { name: structureRowName('Button') })

describe('구조 트리 줄', () => {
  it('묶인 노드의 줄 글 · 줄 단추와 줄 행동의 접근 이름이 표의 이름이다', async () => {
    const list = await open([GROUP])
    await waitFor(() => expect(buttonRow(list).textContent).toBe('Button 새 이름'))
    expect(buttonRow(list).getAttribute('aria-label') ?? buttonRow(list).textContent).toBe('Button 새 이름')
    fireEvent.click(buttonRow(list))
    const row = buttonRow(list).closest<HTMLElement>('[data-tree-row]')!
    expect(rowToggle(row, '…')!.getAttribute('aria-label')).toBe('Button 새 이름 더 보기')
  })

  it('표에 없는 항목(끊긴 참조)이면 대체 글이다', async () => {
    const list = await open([{ ...GROUP, items: [] }])
    // 표가 실린 것을 캔버스의 끊김 표지로 기다린다 — 안 기다리면 표를 읽기 전의 대체 글과 못 가른다.
    await waitFor(() => expect(nodeElement('n-affix')?.getAttribute('data-wb-code-broken')).toBe(''))
    expect(buttonRow(list).textContent).toBe('Button 옛 이름')
  })
})

describe('상호작용 탭', () => {
  it('제목 · 대상 목록 · 규칙 문장 · 페이지 문장 목록이 표의 이름이다', async () => {
    const list = await open([GROUP])
    await tableLoaded()
    fireEvent.click(buttonRow(list))
    fireEvent.click(screen.getByRole('tab', { name: '상호작용' }))
    const panel = await screen.findByRole('tabpanel')
    const NAME = "'새 이름 버튼'(손님 상태)"
    await waitFor(() => expect(panel.textContent).toContain(NAME))
    expect(panel.textContent).not.toContain('옛 이름')
    const sentences = [...panel.querySelectorAll('.wb-shell-interaction-sentence')].map((p) => p.textContent)
    // 규칙 곁의 문장과 아래 «이 페이지의 상호작용» 목록 — 같은 문장이 두 번 선다.
    expect(sentences).toEqual(Array(2).fill(`${NAME} 클릭 시 ${NAME}가 숨겨집니다`))
    const options = [...panel.querySelectorAll('option')].map((option) => option.textContent ?? '')
    expect(options.filter((label) => label.includes('버튼'))).toEqual([NAME])
  })
})

describe('상태 지우기 상자', () => {
  it('함께 지워지는 노드의 줄이 표의 이름이다', async () => {
    await open([GROUP])
    await tableLoaded()
    fireEvent.click(screen.getByRole('tab', { name: '페이지 정보' }))
    fireEvent.click(await screen.findByRole('button', { name: '상태 손님 더 보기' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: '삭제' }))
    const dialog = await screen.findByRole('dialog', { name: REMOVE_STATE_TITLE })
    expect([...dialog.querySelectorAll('[data-node-id]')].map((li) => li.textContent)).toEqual(['Button 새 이름'])
  })
})
