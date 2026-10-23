/**
 * **들여쓰기 · 내어쓰기가 받는 타입 · 설 자리를 본다**(리뷰 RV-ZE H1 · `docs/superpowers/plans/2026-10-23-rv-ze-report.md`). 두 조작은 부모를
 * 바꾸므로 다른 입구(놓기 · 넣기 · 붙이기)와 같은 판정(`edit/structure-drop.ts` 의 `fitRefusal`)을 지나야 한다 — 안 지나면 편집이 나가 서버
 * 422 를 받고, 페이지를 다시 실으며 뒤에 줄 선 편집까지 버린다. 셸째로 — 키(Alt+Shift+← →) · 줄 `…` 의 항목 · 가짜 서버가 받은 편집 수.
 * jsdom 값이다(실브라우저 판 — 줄 선 편집이 살아남는지 — 은 `build-test/zone-editor-review.test.ts`).
 */
import { fireEvent, screen } from '@testing-library/react'
import { applyOps, invertOps, type PatchOp } from '@wirebound/schema'
import { describe, expect, it } from 'vitest'
import type { ApiClient } from '../../src/api/client'
import type { PageDetail, PatchResult } from '../../src/api/types'
import { HEAD_SEQ, openPage, pageDetail, pageDoc } from '../editor-harness'
import { isOff, reasonOf } from '../panels/tree-row'
import '../../src/catalog-setup'

/**
 * ```
 * n-root
 *   n-tabs(Tabs)[n-tp1(TabPanel)[n-t1 Text] · n-tp2(TabPanel)[n-t2 Text]]
 *   n-card(Card)[n-k Text]
 * ```
 */
function doc(): ReturnType<typeof pageDoc> {
  return pageDoc({
    id: 'n-root',
    type: 'Page',
    children: [
      {
        id: 'n-tabs',
        type: 'Tabs',
        children: [
          { id: 'n-tp1', type: 'TabPanel', props: { label: '기본' }, children: [{ id: 'n-t1', type: 'Text', props: { content: '첫' } }] },
          { id: 'n-tp2', type: 'TabPanel', props: { label: '상세' }, children: [{ id: 'n-t2', type: 'Text', props: { content: '둘' } }] },
        ],
      },
      { id: 'n-card', type: 'Card', children: [{ id: 'n-k', type: 'Text', props: { content: '카드 글' } }] },
    ],
  })
}

function server(initial = doc()) {
  const calls: PatchOp[][] = []
  let seq = HEAD_SEQ
  let held = initial
  const patchOps: ApiClient['patchOps'] = async (_projectId, _pageId, body) => {
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
  }
  const getPage: ApiClient['getPage'] = async (_projectId, pageId) => {
    const detail: PageDetail = { ...pageDetail(pageId, held), headSeq: seq }
    return detail
  }
  const listComments: ApiClient['listComments'] = async () => []
  return { calls, api: { patchOps, getPage, listComments } satisfies Partial<ApiClient> }
}

const region = (): HTMLElement => screen.getByRole('region', { name: '구조 트리' })

function select(nodeId: string): void {
  const button = region().querySelector<HTMLElement>(`[data-tree-id="${nodeId}"] .wb-shell-structure-node`)
  if (button === null) throw new Error(`${nodeId} 줄이 없다`)
  fireEvent.click(button)
}

function key(init: KeyboardEventInit): void {
  fireEvent.keyDown(document.body, { bubbles: true, ...init })
}

const infos = (): (string | null)[] =>
  screen
    .queryAllByRole('status')
    .filter((element) => element.classList.contains('wb-shell-info-notice'))
    .map((element) => element.textContent)

/** 고른 줄 `…` 의 «들여쓰기» · «내어쓰기» — 꺼졌나 · 이유. */
function rowItems(nodeId: string): Record<string, [boolean, string | null]> {
  const row = region().querySelector<HTMLElement>(`[data-tree-id="${nodeId}"]`)!
  const more = Array.from(row.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
    button.getAttribute('aria-label')?.endsWith('더 보기'),
  )
  fireEvent.click(more!)
  const out: Record<string, [boolean, string | null]> = {}
  for (const name of ['들여쓰기', '내어쓰기']) {
    const item = screen.getByRole('menuitem', { name })
    out[name] = [isOff(item), reasonOf(item)]
  }
  fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape', bubbles: true })
  return out
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 30))

describe('들여쓰기 · 내어쓰기 — 받는 타입 · 설 자리(리뷰 RV-ZE H1)', () => {
  it('탭 패널 안 글의 내어쓰기는 탭 몸통(탭 패널만 받는다)이라 꺼지고, 키는 편집 없이 다른 입구와 같은 까닭을 말한다', async () => {
    const srv = server()
    await openPage(doc(), { apiOverrides: srv.api })
    select('n-t1')
    const items = rowItems('n-t1')
    key({ key: 'ArrowLeft', altKey: true, shiftKey: true })
    await settle()
    expect({ calls: srv.calls.length, items: items['내어쓰기'], info: infos() }).toEqual({
      calls: 0,
      items: [true, '탭에는 탭 패널만 놓을 수 있습니다'],
      info: ['탭에는 탭 패널만 놓을 수 있습니다'],
    })
  })

  it('탭 패널의 들여쓰기는 앞 탭 패널 몸통(탭 안에만 선다)이라 꺼지고, 키는 편집 없이 까닭을 말한다', async () => {
    const srv = server()
    await openPage(doc(), { apiOverrides: srv.api })
    select('n-tp2')
    const items = rowItems('n-tp2')
    key({ key: 'ArrowRight', altKey: true, shiftKey: true })
    await settle()
    expect({ calls: srv.calls.length, items: items['들여쓰기'], info: infos() }).toEqual({
      calls: 0,
      items: [true, '탭 패널은 탭 안에만 놓을 수 있습니다'],
      info: ['탭 패널은 탭 안에만 놓을 수 있습니다'],
    })
  })

  it('설 수 있는 자리면 그대로 나간다 — 카드 안 글의 내어쓰기는 뿌리 몸통으로 편집 하나', async () => {
    const srv = server()
    await openPage(doc(), { apiOverrides: srv.api })
    select('n-k')
    const items = rowItems('n-k')
    key({ key: 'ArrowLeft', altKey: true, shiftKey: true })
    await settle()
    expect({ calls: srv.calls, items: items['내어쓰기'], info: infos() }).toEqual({
      calls: [[{ op: 'move', from: '/root/children/1/children/0', path: '/root/children/2' }]],
      items: [false, null],
      info: [],
    })
  })
})
