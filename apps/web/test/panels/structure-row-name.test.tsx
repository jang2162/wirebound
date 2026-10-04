/**
 * **구조 트리 줄 글 `타입 (별칭) 요약`**(`src/panels/structure-tree.tsx`) 과 그것을 찾는 견주개(`./tree-row.ts` 의 `structureRowName`).
 *
 * - 줄 단추의 접근 이름은 보이는 글 그대로이고 `packages/schema` 의 `nodeRowLabel`과 같은 글이다(MCP 가 같은 것을 낸다).
 * - 요약만 흐린 조각이다(`.wb-shell-structure-summary`).
 * - 줄 행동 `+` · `…` 의 이름은 줄 글 전체로 짓는다 — 라벨이 «추가»인 Button 줄과 그 줄의 `+` 가 같은 이름이 되지 않게.
 * - **견주개 카나리아** — 같은 타입이 둘이면 `getByRole` 이 «여럿»으로 던지고, 줄 행동 토글은 고르지 않는다.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { CATALOG_TYPES, nodeRowLabel, type PageDocument, type PatchOp, type WbNode } from '@wirebound/schema'
import { describe, expect, it } from 'vitest'
import type { ApiClient } from '../../src/api/client'
import type { PatchResult } from '../../src/api/types'
import { HEAD_SEQ, openPage, pageDoc } from '../editor-harness'
import { structureRowName } from './tree-row'
import '../../src/catalog-setup'

const NODES: WbNode[] = [
  { id: 'n-flex', type: 'Flex', alias: '머리 줄', props: { direction: 'row' } },
  { id: 'n-save', type: 'Button', props: { label: '추가' } },
  { id: 'n-a', type: 'Text', props: { content: '첫 글' } },
  { id: 'n-b', type: 'Text', alias: '안내', props: { content: '둘째 글' } },
  { id: 'n-tabs', type: 'Tabs', props: { tabs: ['개요', '상세', '이력', '설정'] } },
  { id: 'n-sec', type: 'Section' },
]

function doc(): PageDocument {
  return pageDoc({ id: 'n-root', type: 'Page', children: NODES })
}

function server(): { calls: PatchOp[][]; api: Partial<ApiClient> } {
  const calls: PatchOp[][] = []
  let seq = HEAD_SEQ
  let held = doc()
  const patchOps: ApiClient['patchOps'] = async (_projectId, _pageId, body) => {
    calls.push(body.ops)
    const { applyOps, invertOps } = await import('@wirebound/schema')
    const inverse = invertOps(held, body.ops)
    held = applyOps(held, body.ops)
    seq += 1
    const result: PatchResult = { seq, revisionId: `rev-${seq}`, inverse, schemaVersion: 1, ...(body.clientOpId === undefined ? {} : { clientOpId: body.clientOpId }) }
    return result
  }
  return { calls, api: { patchOps } }
}

function region(): HTMLElement {
  return screen.getByRole('region', { name: '구조 트리' })
}

function rowButton(nodeId: string): HTMLButtonElement {
  return region().querySelector<HTMLButtonElement>(`[data-tree-id="${nodeId}"] > .wb-shell-structure-node`)!
}

describe('구조 트리 줄 — `타입 (별칭) 요약`', () => {
  it('줄 글 · 접근 이름이 `nodeRowLabel` 과 같다 — 노드마다', async () => {
    await openPage(doc())
    for (const node of NODES) {
      expect(rowButton(node.id).textContent, node.id).toBe(nodeRowLabel(node))
      expect(within(region()).getByRole('button', { name: nodeRowLabel(node) })).toBe(rowButton(node.id))
    }
    expect(rowButton('n-flex').textContent).toBe('Flex (머리 줄) 가로')
    expect(rowButton('n-tabs').textContent).toBe('Tabs 개요 · 상세 · 이력 · …')
    expect(rowButton('n-sec').textContent).toBe('Section')
  })

  it('요약만 흐린 조각이고 별칭은 따로 조각이다', async () => {
    await openPage(doc())
    expect(rowButton('n-b').querySelector('.wb-shell-structure-alias')?.textContent).toBe(' (안내)')
    expect(rowButton('n-b').querySelector('.wb-shell-structure-summary')?.textContent).toBe(' 둘째 글')
    expect(rowButton('n-sec').querySelector('.wb-shell-structure-summary')).toBeNull()
    expect(rowButton('n-a').querySelector('.wb-shell-structure-alias')).toBeNull()
  })

  it('줄 행동의 이름은 줄 글 전체다 — 라벨이 «추가»인 Button 줄과 그 줄의 `+` 가 갈린다', async () => {
    await openPage(doc())
    expect(within(region()).getAllByRole('button', { name: 'Button 추가' })).toEqual([rowButton('n-save')])
    const row = rowButton('n-save').closest<HTMLElement>('[data-tree-row]')!
    expect(within(row).getByRole('button', { name: 'Button 추가 추가' }).getAttribute('aria-haspopup')).toBe('menu')
    expect(within(row).getByRole('button', { name: 'Button 추가 더 보기' }).getAttribute('aria-haspopup')).toBe('menu')
  })

  it('별칭을 바꾸면 줄 글이 따라간다', async () => {
    const srv = server()
    await openPage(doc(), { apiOverrides: srv.api })
    fireEvent.click(rowButton('n-a'))
    fireEvent.doubleClick(rowButton('n-a'))
    const input = within(region()).getByRole<HTMLInputElement>('textbox', { name: '별칭' })
    fireEvent.change(input, { target: { value: '본문 첫 줄' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(rowButton('n-a').textContent).toBe('Text (본문 첫 줄) 첫 글'))
  })
})

describe('견주개 카나리아 — `structureRowName`', () => {
  it('같은 타입이 둘이면 `getByRole` 이 여럿으로 던지고 `getAllByRole` 은 줄 단추 둘만 고른다', async () => {
    await openPage(doc())
    expect(() => within(region()).getByRole('button', { name: structureRowName('Text') })).toThrow(/multiple/)
    expect(within(region()).getAllByRole('button', { name: structureRowName('Text') })).toEqual([rowButton('n-a'), rowButton('n-b')])
  })

  it('줄 행동 토글(`… 추가` · `… 더 보기`)은 고르지 않는다', async () => {
    await openPage(doc())
    expect(within(region()).getByRole('button', { name: structureRowName('Button') })).toBe(rowButton('n-save'))
    expect(within(region()).getByRole('button', { name: structureRowName('Flex') })).toBe(rowButton('n-flex'))
  })

  it('머리 겹침 — 타입 이름이 다른 타입의 머리가 되는 판이 카탈로그에 없다 · `Tab` 은 `Tabs` 에 안 맞는다', async () => {
    for (const a of CATALOG_TYPES) {
      for (const b of CATALOG_TYPES) {
        if (a === b) continue
        expect(structureRowName(a)(b, rowLikeElement()), `${a} ↔ ${b}`).toBe(false)
      }
    }
    await openPage(doc())
    expect(within(region()).queryAllByRole('button', { name: structureRowName('Tab') })).toEqual([])
  })
})

function rowLikeElement(): Element {
  const element = document.createElement('button')
  element.className = 'wb-shell-structure-node'
  return element
}
