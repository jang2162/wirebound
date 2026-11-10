/**
 * **속성 패널의 «공통코드» 칸**(`src/panels/code-binding.tsx` · 편집 `src/edit/code-ops.ts`) — jsdom. 묶기 · 묶인 동안 잠긴 대표 글 칸 · 사용처
 * 링크 · 이름을 바꾼 뒤 풀면 새 이름 · 선택 위젯의 «표의 항목 중 고르기»(하나만) · 끊긴 참조의 한 줄 · 표에 없는 키를 든 붙여넣기(Review Focus 1).
 * 모듈 넣기 · 페이지 JSON 가져오기의 같은 판은 `test/palette/module-tab.test.tsx` · `test/panels/page-json.test.tsx` 의 «공통코드» 절.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  applyOps,
  CURRENT_DOCUMENT_VERSION,
  invertOps,
  writeNodesEnvelope,
  type CodeGroup,
  type PageDocument,
  type PatchOp,
  type WbNode,
} from '@wirebound/schema'
import type { ApiClient } from '../../src/api/client'
import type { PageDetail, PatchResult } from '../../src/api/types'
import { HEAD_SEQ, openPage, pageDetail, pageDoc, requireNode } from '../editor-harness'
import '../../src/catalog-setup'
import { structureRowName } from './tree-row'

const GROUP: CodeGroup = {
  key: 'ORDER_STATUS',
  name: '주문 상태',
  items: [
    { value: 'WAIT', name: '결제 대기', active: true },
    { value: 'SHIP', name: '배송 중', active: true },
  ],
}

function server(initial: PageDocument, tables: CodeGroup[][] = [[GROUP]]) {
  const calls: PatchOp[][] = []
  let held = initial
  let seq = HEAD_SEQ
  let reads = 0
  const api: Partial<ApiClient> = {
    patchOps: async (_projectId, _pageId, body) => {
      calls.push(body.ops)
      const inverse = invertOps(held, body.ops)
      held = applyOps(held, body.ops)
      seq += 1
      const result: PatchResult = {
        seq,
        revisionId: `rev-${seq}`,
        inverse,
        schemaVersion: 1,
        ...(body.clientOpId === undefined ? {} : { clientOpId: body.clientOpId }),
      }
      return result
    },
    getPage: async (_projectId, pageId) => ({ ...pageDetail(pageId, held), headSeq: seq }) satisfies PageDetail,
    listCodes: async () => structuredClone(tables[Math.min(reads++, tables.length - 1)]!),
    codeUsageCounts: async () => ({ ORDER_STATUS: { group: 3, items: { WAIT: 2 } } }),
  }
  return { calls, held: () => held, api }
}

const doc = (...children: WbNode[]): PageDocument => pageDoc({ id: 'n-root', type: 'Page', children })
const panel = () => within(screen.getByRole('complementary', { name: '우측 패널' }))
const codeField = () => screen.getByRole('complementary', { name: '우측 패널' }).querySelector<HTMLElement>('[data-wb-code-field]')!

function pick(type: string): void {
  fireEvent.click(within(screen.getByRole('region', { name: '구조 트리' })).getByRole('button', { name: structureRowName(type) }))
}

describe('속성 패널 — 공통코드 칸', () => {
  it('Affix 를 묶으면 서버 문서에 code 와 그 이름이 선다', async () => {
    const srv = server(doc({ id: 'n-affix', type: 'Affix', props: { text: '~' } }))
    await openPage(srv.held(), { apiOverrides: srv.api })
    pick('Affix')
    fireEvent.click(await panel().findByRole('button', { name: /공통코드로 묶기/ }))
    fireEvent.change(panel().getByLabelText('그룹'), { target: { value: 'ORDER_STATUS' } })
    fireEvent.change(panel().getByLabelText('항목'), { target: { value: 'SHIP' } })
    fireEvent.click(panel().getByRole('button', { name: '묶기' }))
    await waitFor(() => expect(srv.calls).toHaveLength(1))
    expect(srv.calls[0]![0]).toMatchObject({ op: 'test', path: '/root/children/0' })
    const node = srv.held().root.children![0]!
    expect(node.code).toEqual({ group: 'ORDER_STATUS', item: 'SHIP' })
    expect(node.props?.text).toBe('배송 중')
  })

  it('묶인 동안 «글» 칸이 잠기고 «공통코드: 주문 상태 › 결제 대기» · «이 코드를 쓰는 곳 2» 링크', async () => {
    const srv = server(doc({ id: 'n-affix', type: 'Affix', props: { text: '결제 대기' }, code: { group: 'ORDER_STATUS', item: 'WAIT' } }))
    await openPage(srv.held(), { apiOverrides: srv.api })
    pick('Affix')
    await waitFor(() => expect(codeField().textContent).toContain('공통코드: \u2068주문 상태\u2069 › \u2068결제 대기\u2069'))
    expect(panel().getByLabelText<HTMLInputElement>('글').disabled).toBe(true)
    const link = await panel().findByRole('link', { name: '이 코드를 쓰는 곳 2' })
    expect(link.getAttribute('href')).toBe('/projects/p-1/codes?group=ORDER_STATUS&item=WAIT')
  })

  it('표에서 이름을 바꾼 뒤 풀면 prop 이 새 이름이다', async () => {
    const renamed: CodeGroup = { ...GROUP, items: [{ value: 'WAIT', name: '입금 대기', active: true }] }
    const srv = server(doc({ id: 'n-affix', type: 'Affix', props: { text: '결제 대기' }, code: { group: 'ORDER_STATUS', item: 'WAIT' } }), [
      [renamed],
    ])
    await openPage(srv.held(), { apiOverrides: srv.api })
    pick('Affix')
    fireEvent.click(await panel().findByRole('button', { name: /풀기/ }))
    await waitFor(() => expect(srv.calls).toHaveLength(1))
    const node = srv.held().root.children![0]!
    expect(node.code).toBeUndefined()
    expect(node.props?.text).toBe('입금 대기')
  })

  it('Select 묶음 — 패널이 «표의 항목 중 고르기» 가 되고 하나만 고른다', async () => {
    const srv = server(
      doc({
        id: 'n-sel',
        type: 'Select',
        props: { options: [{ label: '결제 대기' }, { label: '배송 중' }] },
        code: { group: 'ORDER_STATUS' },
      }),
    )
    await openPage(srv.held(), { apiOverrides: srv.api })
    pick('Select')
    const picks = await panel().findByRole('group', { name: '표의 항목 중 고르기' })
    const radios = within(picks).getAllByRole('radio')
    expect(radios.map((radio) => radio.parentElement?.textContent)).toEqual(['\u2068결제 대기\u2069', '\u2068배송 중\u2069'])
    fireEvent.click(radios[1]!)
    await waitFor(() => expect(srv.calls).toHaveLength(1))
    expect(srv.held().root.children![0]!.code).toEqual({ group: 'ORDER_STATUS', selected: ['SHIP'] })
    expect(srv.held().root.children![0]!.props?.options).toEqual([{ label: '결제 대기' }, { label: '배송 중', selected: true }])
    // 선택지 목록 칸은 잠긴다 — 표가 정한다(입력이 있고 전부 꺼졌다).
    const row = panel().getByText('선택지', { selector: 'label' }).closest('.wb-shell-prop')!
    const inputs = [...row.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button')]
    expect(inputs.length).toBeGreaterThan(0)
    expect(inputs.filter((input) => !input.disabled).map((input) => input.outerHTML.slice(0, 60))).toEqual([])
  })

  it('끊긴 노드 — «끊긴 공통코드: ORDER_STATUS › GONE» · 다시 묶기 · 풀기', async () => {
    const srv = server(doc({ id: 'n-affix', type: 'Affix', props: { text: '옛 이름' }, code: { group: 'ORDER_STATUS', item: 'GONE' } }))
    await openPage(srv.held(), { apiOverrides: srv.api })
    pick('Affix')
    await waitFor(() => expect(codeField().textContent).toContain('끊긴 공통코드: ORDER_STATUS › GONE'))
    expect(panel().getByRole('button', { name: '다시 묶기' })).toBeTruthy()
    expect(panel().getByRole('button', { name: /풀기/ })).toBeTruthy()
    expect(requireNode('n-affix').getAttribute('data-wb-code-broken')).toBe('')
  })

  it('표에 없는 키를 든 노드를 붙이면 거절 없이 들어오고 «끊긴 공통코드 1개» 를 말한다(Review Focus 1)', async () => {
    const srv = server(doc({ id: 'n-text', type: 'Text', props: { content: '가' } }))
    await openPage(srv.held(), { apiOverrides: srv.api })
    pick('Text')
    const envelope = writeNodesEnvelope(
      [{ id: 'x-affix', type: 'Affix', props: { text: '남의 이름' }, code: { group: 'NOT_HERE', item: 'X' } }] as WbNode[],
      CURRENT_DOCUMENT_VERSION,
    )
    const event = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: { getData: () => envelope, setData: () => {} } })
    document.body.dispatchEvent(event)
    await waitFor(() => expect(srv.calls).toHaveLength(1))
    const pasted = srv.held().root.children![1]!
    expect(pasted.code).toEqual({ group: 'NOT_HERE', item: 'X' })
    await waitFor(() => expect(screen.getByRole('contentinfo', { name: '하단 바' }).textContent).toContain('끊긴 공통코드 1개'))
  })
})
