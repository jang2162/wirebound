/**
 * **붙이기와 화면 상태**(설계 spec `2026-10-18-modules-states-layout-design.md` 「C2」 · 계획 V3 Task 5) — 붙인 노드의 보임은 붙이는 페이지의
 * 상태로 맞춘다: 같은 id 는 그대로, 같은 이름은 그 페이지의 id 로(`edit/paste-states.ts`), 둘 다 없는 상태는 보임에서 빼고 «상태 "X" 보임 N곳을
 * 뺐습니다»로 말한다(이름은 봉투가 실은 출처의 목록 — 없으면 id). `only` 가 비면 보임을 걷고 따로 말한다 — 그 노드는 이제 모든 상태에서 보인다.
 * «기본»은 늘 남는다. 지금 고른 상태는 붙지 않는다. 뺀 결과는 검증 오류가 없다.
 *
 * 셸(`shell/editor-keys.tsx`)의 클립보드 길을 `<App />` 째 띄워 잰다 — 셸 케이스(`editor-keys.test.tsx`)와 같은 하네스다.
 */
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  CURRENT_DOCUMENT_VERSION,
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
import { clearedOnlyNotice, droppedStatesNotice } from '../../src/edit/paste-ops'
import { HEAD_SEQ, openPage, pageDetail, pageDoc } from '../editor-harness'
import '../../src/catalog-setup'
import { structureRowName } from '../panels/tree-row'

afterEach(cleanup)

const ADMIN: ViewState = { id: 's_admin', name: '관리자' }
const GUEST: ViewState = { id: 's_guest', name: '비로그인' }

const button = (id: string, label: string, visibility?: WbNode['visibility']): WbNode => ({
  id,
  type: 'Button',
  props: { label },
  ...(visibility === undefined ? {} : { visibility }),
})

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
  return screen
    .queryAllByRole('status')
    .filter((element) => element.classList.contains('wb-shell-info-notice'))
    .map((element) => element.textContent ?? '')
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

describe('붙일 페이지에 없는 상태는 보임에서 빼고 말한다', () => {
  it('`only` 의 상태가 다 빠지면 보임을 걷고 둘 다 말한다 — 상태마다 출처의 이름 · 검증 오류 0', async () => {
    const { srv, pasted } = await pasteInto(
      target(),
      writeNodesEnvelope([button('b-a', '승인', { mode: 'only', states: ['s_admin', 's_guest'] })], CURRENT_DOCUMENT_VERSION, [
        ADMIN,
        GUEST,
      ]),
    )
    expect(pasted.visibility).toBeUndefined()
    const dropped = droppedStatesNotice(
      [
        { state: 's_admin', count: 1 },
        { state: 's_guest', count: 1 },
      ],
      [ADMIN, GUEST],
    )
    await waitFor(() => expect(infoTexts()).toEqual([`${dropped} ${clearedOnlyNotice(1)}`]))
    expect(dropped).toBe('상태 "관리자" 보임 1곳을 뺐습니다. 상태 "비로그인" 보임 1곳을 뺐습니다.')
    expect(alertTexts()).toEqual([])
    expect(errorsOf(srv.held())).toEqual([])
  })

  it('남은 상태가 있으면 보임은 남은 상태로 — 뺀 상태만 말한다', async () => {
    const { srv, pasted } = await pasteInto(
      target([ADMIN]),
      writeNodesEnvelope([button('b-a', '승인', { mode: 'only', states: ['s_admin', 's_guest'] })], CURRENT_DOCUMENT_VERSION, [
        ADMIN,
        GUEST,
      ]),
    )
    expect(pasted.visibility).toEqual({ mode: 'only', states: ['s_admin'] })
    await waitFor(() => expect(infoTexts()).toEqual(['상태 "비로그인" 보임 1곳을 뺐습니다.']))
    expect(errorsOf(srv.held())).toEqual([])
  })

  it('`except` 가 비면 보임을 걷되 «모든 상태에서 보인다»를 따로 말하지 않는다 — 원래 보이던 곳에서 그대로 보인다', async () => {
    const { pasted } = await pasteInto(
      target(),
      writeNodesEnvelope([button('b-a', '승인', { mode: 'except', states: ['s_guest'] })], CURRENT_DOCUMENT_VERSION, [GUEST]),
    )
    expect(pasted.visibility).toBeUndefined()
    await waitFor(() => expect(infoTexts()).toEqual(['상태 "비로그인" 보임 1곳을 뺐습니다.']))
  })

  it('«기본»은 늘 남는다 · 자손의 보임도 맞춘다', async () => {
    const card: WbNode = {
      id: 'c',
      type: 'Card',
      visibility: { mode: 'only', states: ['default', 's_guest'] },
      children: [button('b-a', '승인', { mode: 'except', states: ['s_guest', 'default'] })],
    }
    const { srv, pasted } = await pasteInto(target(), writeNodesEnvelope([card], CURRENT_DOCUMENT_VERSION, [GUEST]))
    expect(pasted.visibility).toEqual({ mode: 'only', states: ['default'] })
    expect(pasted.children![0]!.visibility).toEqual({ mode: 'except', states: ['default'] })
    await waitFor(() => expect(infoTexts()).toEqual(['상태 "비로그인" 보임 2곳을 뺐습니다.']))
    expect(errorsOf(srv.held())).toEqual([])
  })

  it('출처의 목록이 없는 봉투는 상태 id 로 말한다', async () => {
    await pasteInto(target(), writeNodesEnvelope([button('b-a', '승인', { mode: 'except', states: ['s_x'] })], CURRENT_DOCUMENT_VERSION))
    await waitFor(() => expect(infoTexts()).toEqual(['상태 "s_x" 보임 1곳을 뺐습니다.']))
  })

  it('지금 고른 상태는 붙지 않는다 — 보임 없는 노드는 보임 없이 들어간다', async () => {
    const { pasted } = await pasteInto(target([ADMIN]), writeNodesEnvelope([button('b-a', '승인')], CURRENT_DOCUMENT_VERSION, [ADMIN]))
    expect(pasted.visibility).toBeUndefined()
  })
})

describe('다른 페이지로 붙일 때 상태를 이름으로 맞춘다(`edit/paste-states.ts`)', () => {
  /** 붙일 페이지의 «관리자»는 출처와 id 가 다르다. */
  const OTHER_ADMIN: ViewState = { id: 's_page_admin', name: '관리자' }

  it('같은 이름의 상태가 있으면 보임을 그 id 로 옮기고 말하지 않는다 · 없는 이름만 빼고 센다 · 검증 오류 0', async () => {
    const { srv, pasted } = await pasteInto(
      target([OTHER_ADMIN]),
      writeNodesEnvelope([button('b-a', '승인', { mode: 'only', states: ['s_admin', 's_guest'] })], CURRENT_DOCUMENT_VERSION, [
        ADMIN,
        GUEST,
      ]),
    )
    expect(pasted.visibility).toEqual({ mode: 'only', states: ['s_page_admin'] })
    await waitFor(() => expect(infoTexts()).toEqual(['상태 "비로그인" 보임 1곳을 뺐습니다.']))
    expect(errorsOf(srv.held())).toEqual([])
  })

  it('이름이 글자 그대로 같을 때만 맞춘다 — 대소문자 · 다른 글자는 다른 상태다', async () => {
    const { pasted } = await pasteInto(
      target([{ id: 's_page_a', name: 'Admin' }]),
      writeNodesEnvelope([button('b-a', '승인', { mode: 'only', states: ['s_a'] })], CURRENT_DOCUMENT_VERSION, [
        { id: 's_a', name: 'admin' },
      ]),
    )
    expect(pasted.visibility).toBeUndefined()
    await waitFor(() => expect(infoTexts()).toEqual([`상태 "admin" 보임 1곳을 뺐습니다. ${clearedOnlyNotice(1)}`]))
  })

  it('화면 상태 바꾸기의 대상도 같은 이름의 상태로 옮기고 · 없는 이름은 그 액션을 뺀다 · 기본은 그대로', async () => {
    const opener = (id: string, target: string): WbNode => ({
      ...button(id, '열기'),
      interactions: [{ on: 'click', actions: [{ type: 'setViewState', target }] }],
    })
    const srv = server(target([OTHER_ADMIN]))
    await openPage(srv.held(), { apiOverrides: srv.api })
    const envelope = writeNodesEnvelope(
      [opener('b-a', 's_admin'), opener('b-b', 's_guest'), opener('b-c', 'default')],
      CURRENT_DOCUMENT_VERSION,
      [ADMIN, GUEST],
    )
    expect(clip('paste', envelope).prevented).toBe(true)
    await waitFor(() => expect(srv.calls).toHaveLength(1))
    const pasted = srv.calls[0]!.map((op) => (op as { value: WbNode }).value)
    expect(pasted.map((node) => node.interactions?.[0]?.actions[0])).toEqual([
      { type: 'setViewState', target: 's_page_admin' },
      undefined,
      { type: 'setViewState', target: 'default' },
    ])
    expect(errorsOf(srv.held())).toEqual([])
  })

  it('같은 id 는 이름이 달라도 그대로다(같은 페이지 · 이름을 고친 복사)', async () => {
    const { pasted } = await pasteInto(
      target([{ id: 's_admin', name: '운영자' }]),
      writeNodesEnvelope([button('b-a', '승인', { mode: 'only', states: ['s_admin'] })], CURRENT_DOCUMENT_VERSION, [ADMIN]),
    )
    expect(pasted.visibility).toEqual({ mode: 'only', states: ['s_admin'] })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect([...alertTexts(), ...infoTexts()]).toEqual([])
  })
})

describe('옛 판 봉투는 붙이지 않는다', () => {
  /**
   * 옛 클립보드(판 1 · 2 · 3 봉투)는 붙이지 않는다 — 문서 판 3 · 4 의 옮기기는 DB 마이그레이션에만 있고 런타임은 옛 판을 올리지 않는다(설계 spec
   * `2026-10-23-node-slots-design.md` 「7. 옮기기」). 상태 영역이 든 판 1 봉투도 같은 거절이다.
   */
  it('판 1 봉투(상태 영역)는 안 붙이고 까닭을 말한다 — 편집이 안 나간다', async () => {
    const region: WbNode = {
      id: 'sw',
      type: 'StateSwitch',
      children: [{ id: 'c-d', type: 'StateCase', props: { state: 'default' }, children: [button('b-d', '보기')] }],
    }
    const srv = server(target([{ id: 's_page_admin', name: '관리자' }]))
    await openPage(srv.held(), { apiOverrides: srv.api })
    expect(clip('paste', writeNodesEnvelope([region], 1, [ADMIN])).prevented).toBe(true)
    await waitFor(() => expect(document.body.textContent).toContain('이 판이 읽을 수 없는 버전입니다'))
    expect(srv.calls).toHaveLength(0)
  })
})

describe('복사가 출처의 상태 목록을 싣는다', () => {
  it('상태가 있는 페이지에서 고른 노드의 봉투에 목록과 보임이 실린다', async () => {
    const shown = button('b-d', '보기', { mode: 'only', states: ['s_admin'] })
    const doc = { ...pageDoc({ id: 'n-root', type: 'Page', children: [shown] }), viewStates: [ADMIN] }
    await openPage(doc, { apiOverrides: server(doc).api })
    const region = screen.getByRole('region', { name: '구조 트리' })
    fireEvent.click(within(region).getAllByRole('button', { name: structureRowName('Button') })[0]!)
    const copied = clip('copy')
    expect(copied.prevented).toBe(true)
    expect(readNodesEnvelope(copied.written!)).toEqual({ nodes: [shown], viewStates: [ADMIN] })
  })
})
