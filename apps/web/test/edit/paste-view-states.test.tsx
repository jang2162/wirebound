/**
 * **붙이기와 화면 상태**(설계 spec 「페이지 JSON · 프리셋 · 붙여넣기」 · K Review Focus 5) — 붙이는 페이지에 없는 상태의 가지를 빼고
 * «상태 "X" 가지 N개를 뺐습니다»로 말한다. 이름은 봉투가 실은 출처의 목록에서 읽는다(없으면 id). 뺀 결과는 검증 오류가 없다 — 판 셋:
 * 영역째 · 가지만 · 영역 안 영역.
 *
 * 셸(`shell/editor-keys.tsx`)의 클립보드 길을 `<App />` 째 띄워 잰다 — 셸 케이스(`editor-keys.test.tsx`)와 같은 하네스다.
 */
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  applyOps,
  partitionIssues,
  readNodesEnvelope,
  validatePage,
  writeNodesEnvelope,
  type PageDocument,
  type PatchOp,
  type ViewState,
  type WbNode,
} from '@wirebound/schema'
import type { ApiClient } from '../../src/api/client'
import type { PageDetail, PatchResult } from '../../src/api/types'
import { droppedCasesNotice } from '../../src/edit/paste-ops'
import { HEAD_SEQ, openPage, pageDetail, pageDoc } from '../editor-harness'
import '../../src/catalog-setup'
import { structureRowName } from '../panels/tree-row'

afterEach(cleanup)

const ADMIN: ViewState = { id: 's_admin', name: '관리자' }
const GUEST: ViewState = { id: 's_guest', name: '비로그인' }

const caseOf = (id: string, state: string, children: WbNode[]): WbNode => ({ id, type: 'StateCase', props: { state }, children })
const button = (id: string, label: string): WbNode => ({ id, type: 'Button', props: { label } })

/** 붙일 페이지 — `n-root > n-a(Text)`. `viewStates` 를 주면 그 목록을 든다. */
function target(viewStates?: ViewState[]): PageDocument {
  const doc = pageDoc({ id: 'n-root', type: 'Page', children: [{ id: 'n-a', type: 'Text', props: { content: '글' } }] })
  return viewStates === undefined ? doc : { ...doc, viewStates }
}

function server(initial: PageDocument) {
  const calls: PatchOp[][] = []
  let seq = HEAD_SEQ
  let held = initial
  const patchOps: ApiClient['patchOps'] = async (_projectId, _pageId, body) => {
    calls.push(body.ops)
    const { invertOps } = await import('@wirebound/schema')
    const inverse = invertOps(held, body.ops)
    held = applyOps(held, body.ops)
    seq += 1
    const result: PatchResult = { seq, revisionId: `rev-${seq}`, inverse, schemaVersion: 1, ...(body.clientOpId === undefined ? {} : { clientOpId: body.clientOpId }) }
    return result
  }
  const getPage: ApiClient['getPage'] = async (_projectId, pageId) => {
    const detail: PageDetail = { ...pageDetail(pageId, held), headSeq: seq }
    return detail
  }
  return { calls, held: () => held, api: { patchOps, getPage } satisfies Partial<ApiClient> }
}

/** 클립보드 이벤트 — jsdom 에는 `clipboardData` 가 없어 가짜를 싣는다(`editor-keys.test.tsx` 의 `clip`). */
function clip(type: 'copy' | 'paste', text?: string): { written: string | undefined; prevented: boolean } {
  const data = new Map<string, string>()
  if (text !== undefined) data.set('text/plain', text)
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clipboardData', {
    value: { setData: (kind: string, value: string) => data.set(kind, value), getData: (kind: string) => data.get(kind) ?? '' },
  })
  document.body.dispatchEvent(event)
  return { written: data.get('text/plain'), prevented: event.defaultPrevented }
}

function alertTexts(): string[] {
  return screen.queryAllByRole('alert').map((element) => element.textContent ?? '')
}

/** 정보 통지 한 칸(`shell/info-notice.tsx` — `role="status"`)의 글. 실패 자리(`alert`)와 갈라 읽는다. */
function infoTexts(): string[] {
  return screen.queryAllByRole('status').filter((element) => element.classList.contains('wb-shell-info-notice')).map((element) => element.textContent ?? '')
}

/** 붙인 뒤 서버 문서 — 검증 오류가 없어야 한다. */
function errorsOf(doc: PageDocument): string[] {
  return partitionIssues(validatePage(doc)).errors.map((issue) => `${issue.code} ${issue.message}`)
}

async function pasteInto(doc: PageDocument, envelope: string) {
  const srv = server(doc)
  await openPage(doc, { apiOverrides: srv.api })
  expect(clip('paste', envelope).prevented).toBe(true)
  await waitFor(() => expect(srv.calls).toHaveLength(1))
  const pasted = (srv.calls[0]![0] as { value: WbNode }).value
  return { srv, pasted }
}

describe('붙일 페이지에 없는 상태의 가지를 빼고 말한다', () => {
  it('영역째 — 없는 상태의 가지를 빼고 상태마다 출처의 이름으로 말한다 · 검증 오류 0', async () => {
    const area: WbNode = {
      id: 'sw',
      type: 'StateSwitch',
      children: [caseOf('c-d', 'default', [button('b-d', '보기')]), caseOf('c-a', 's_admin', [button('b-a', '승인')]), caseOf('c-g', 's_guest', [button('b-g', '로그인')])],
    }
    const { srv, pasted } = await pasteInto(target(), writeNodesEnvelope([area], 1, [ADMIN, GUEST]))
    expect(pasted.type).toBe('StateSwitch')
    expect(pasted.children!.map((child) => child.props?.state)).toEqual(['default'])
    await waitFor(() =>
      expect(infoTexts()).toEqual([droppedCasesNotice([{ state: 's_admin', count: 1 }, { state: 's_guest', count: 1 }], [ADMIN, GUEST])]),
    )
    expect(alertTexts()).toEqual([])
    expect(infoTexts()[0]).toBe('상태 "관리자" 가지 1개를 뺐습니다. 상태 "비로그인" 가지 1개를 뺐습니다.')
    expect(errorsOf(srv.held())).toEqual([])
  })

  it('가지만 — 영역 없이 고른 가지는 그 내용으로 붙고, 뺀 것이 없어 말하지 않는다', async () => {
    const { srv, pasted } = await pasteInto(target(), writeNodesEnvelope([caseOf('c-a', 's_admin', [button('b-a', '승인')])], 1, [ADMIN]))
    expect(pasted.type).toBe('Button')
    expect(pasted.props?.label).toBe('승인')
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect([...alertTexts(), ...infoTexts()]).toEqual([])
    expect(errorsOf(srv.held())).toEqual([])
  })

  it('영역 안 영역 — 붙일 페이지에 있는 상태(같은 id)는 남기고 없는 상태만 뺀다 · 검증 오류 0', async () => {
    const inner: WbNode = { id: 'in', type: 'StateSwitch', children: [caseOf('ic-d', 'default', [button('ib-d', '안 기본')]), caseOf('ic-g', 's_guest', [button('ib-g', '안 비로그인')])] }
    const outer: WbNode = { id: 'out', type: 'StateSwitch', children: [caseOf('oc-d', 'default', [inner]), caseOf('oc-a', 's_admin', [button('ob-a', '승인')])] }
    const { srv, pasted } = await pasteInto(target([ADMIN]), writeNodesEnvelope([outer], 1, [ADMIN, GUEST]))
    expect(pasted.children!.map((child) => child.props?.state)).toEqual(['default', 's_admin'])
    expect(pasted.children![0]!.children![0]!.children!.map((child) => child.props?.state)).toEqual(['default'])
    await waitFor(() => expect(infoTexts()).toEqual(['상태 "비로그인" 가지 1개를 뺐습니다.']))
    expect(errorsOf(srv.held())).toEqual([])
  })

  it('출처의 목록이 없는 봉투(옛 판)는 상태 id 로 말한다', async () => {
    const area: WbNode = { id: 'sw', type: 'StateSwitch', children: [caseOf('c-d', 'default', []), caseOf('c-x', 's_x', [])] }
    await pasteInto(target(), writeNodesEnvelope([area], 1))
    await waitFor(() => expect(infoTexts()).toEqual(['상태 "s_x" 가지 1개를 뺐습니다.']))
  })
})

describe('다른 페이지로 붙일 때 상태를 이름으로 맞춘다(프리셋과 같은 자)', () => {
  /** 붙일 페이지의 «관리자»는 출처와 id 가 다르다. */
  const OTHER_ADMIN: ViewState = { id: 's_page_admin', name: '관리자' }

  it('같은 이름의 상태가 있으면 가지를 그 id 로 옮기고 말하지 않는다 · 없는 이름의 가지만 빼고 센다 · 검증 오류 0', async () => {
    const area: WbNode = {
      id: 'sw',
      type: 'StateSwitch',
      children: [caseOf('c-d', 'default', [button('b-d', '보기')]), caseOf('c-a', 's_admin', [button('b-a', '승인')]), caseOf('c-g', 's_guest', [button('b-g', '로그인')])],
    }
    const { srv, pasted } = await pasteInto(target([OTHER_ADMIN]), writeNodesEnvelope([area], 1, [ADMIN, GUEST]))
    expect(pasted.children!.map((child) => child.props?.state)).toEqual(['default', 's_page_admin'])
    await waitFor(() => expect(infoTexts()).toEqual(['상태 "비로그인" 가지 1개를 뺐습니다.']))
    expect(errorsOf(srv.held())).toEqual([])
  })

  it('이름이 글자 그대로 같을 때만 맞춘다 — 대소문자 · 다른 글자는 다른 상태다', async () => {
    const area: WbNode = { id: 'sw', type: 'StateSwitch', children: [caseOf('c-d', 'default', []), caseOf('c-a', 's_a', [button('b-a', '승인')])] }
    const { pasted } = await pasteInto(target([{ id: 's_page_a', name: 'Admin' }]), writeNodesEnvelope([area], 1, [{ id: 's_a', name: 'admin' }]))
    expect(pasted.children!.map((child) => child.props?.state)).toEqual(['default'])
    await waitFor(() => expect(infoTexts()).toEqual(['상태 "admin" 가지 1개를 뺐습니다.']))
  })

  it('같은 id 는 이름이 달라도 그대로다(같은 페이지 · 이름을 고친 복사)', async () => {
    const area: WbNode = { id: 'sw', type: 'StateSwitch', children: [caseOf('c-d', 'default', []), caseOf('c-a', 's_admin', [button('b-a', '승인')])] }
    const { pasted } = await pasteInto(target([{ id: 's_admin', name: '운영자' }]), writeNodesEnvelope([area], 1, [ADMIN]))
    expect(pasted.children!.map((child) => child.props?.state)).toEqual(['default', 's_admin'])
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect([...alertTexts(), ...infoTexts()]).toEqual([])
  })
})

describe('복사가 출처의 상태 목록을 싣는다', () => {
  it('상태가 있는 페이지에서 고른 영역의 봉투에 목록이 실린다', async () => {
    const area: WbNode = { id: 'sw', type: 'StateSwitch', children: [caseOf('c-d', 'default', [button('b-d', '보기')]), caseOf('c-a', 's_admin', [])] }
    const doc = { ...pageDoc({ id: 'n-root', type: 'Page', children: [area] }), viewStates: [ADMIN] }
    await openPage(doc, { apiOverrides: server(doc).api })
    const region = screen.getByRole('region', { name: '구조 트리' })
    fireEvent.click(within(region).getAllByRole('button', { name: structureRowName('Button') })[0]!)
    const copied = clip('copy')
    expect(copied.prevented).toBe(true)
    expect(readNodesEnvelope(copied.written!)).toEqual({ nodes: [button('b-d', '보기')], viewStates: [ADMIN] })
  })
})
