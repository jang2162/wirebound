/**
 * **속성 패널 «상태 보임» 칸**(`src/panels/visibility-field.tsx` · `src/edit/ops.ts` 의 `visibilityOps` — 설계 spec
 * `2026-10-18-modules-states-layout-design.md` 「C2」 · 「C3」).
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 세 갈래 | «없음» → «이 상태에서만»이 지금 상태 하나로 시작하지 않는다 · «이 상태에서 숨김»으로 옮기며 상태를 잃는다 · «없음»이 보임을 안 걷는다 · 편집이 하나가 아니다 |
 * | 상태 고르기 | 항목이 «기본» + 트리 차례 · 들여쓰기가 아니다 · 여럿을 못 고른다 · 적는 차례가 고른 차례를 따른다 · 마지막 하나를 뺄 수 있다 |
 * | 상태 없는 페이지 · 뿌리 | 고르개가 선다 · 뿌리에 칸이 선다 |
 * | 숨은 노드 · 잠금 | 지금 숨은 노드에 한 줄이 없다 · 남이 잡은 노드에서 칸이 켜져 있다 |
 */
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { applyOps, walkNodes, type PageDocument, type PatchOp, type ViewState, type WbNode } from '@wirebound/schema'
import type { ApiClient } from '../../src/api/client'
import type { PageDetail, PatchResult } from '../../src/api/types'
import { visibilityOps } from '../../src/edit/ops'
import { HIDDEN_NOW_NOTICE, LAST_STATE_REASON, NO_STATES_NOTICE, VISIBILITY_LABEL } from '../../src/panels/visibility-field'
import { HEAD_SEQ, openPage, pageDetail, pageDoc } from '../editor-harness'
import { structureRowName } from './tree-row'
import '../../src/catalog-setup'

afterEach(cleanup)

const LOGIN: ViewState = { id: 's_login', name: '로그인' }
const ADMIN: ViewState = { id: 's_admin', name: '관리자', parent: 's_login' }
const GUEST: ViewState = { id: 's_guest', name: '손님' }

function doc(viewStates: ViewState[] | undefined = [LOGIN, ADMIN, GUEST], visibility?: WbNode['visibility']): PageDocument {
  const base = pageDoc({
    id: 'n-root',
    type: 'Page',
    children: [{ id: 'n-btn', type: 'Button', props: { label: '저장' }, ...(visibility === undefined ? {} : { visibility }) }],
  })
  return viewStates === undefined ? base : { ...base, viewStates }
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
      schemaVersion: 2,
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

async function open(document: PageDocument) {
  const srv = server(document)
  await openPage(document, { apiOverrides: srv.api })
  return srv
}

function select(type: string): void {
  const list = document.body.querySelector<HTMLElement>('.wb-shell-structure-list')!
  fireEvent.click(within(list).getByRole('button', { name: structureRowName(type) }))
}

function field(): HTMLElement | null {
  return document.body.querySelector<HTMLElement>('[data-wb-node-visibility]')
}

function modeSelect(): HTMLSelectElement {
  return within(field()!).getByRole('combobox', { name: VISIBILITY_LABEL }) as HTMLSelectElement
}

/** 상태 칸 — 이름 · 들여쓰기 · 골랐나 · 끈 까닭. */
function stateBoxes(): { name: string; indent: string; checked: boolean; why: string | null }[] {
  return [...field()!.querySelectorAll<HTMLLabelElement>('.wb-shell-visibility-state')].map((label) => {
    const box = label.querySelector('input')!
    return {
      name: label.textContent ?? '',
      indent: label.style.paddingLeft,
      checked: box.checked,
      why: box.getAttribute('aria-disabled') === 'true' ? box.getAttribute('aria-description') : null,
    }
  })
}

function toggle(name: string): void {
  const label = [...field()!.querySelectorAll<HTMLLabelElement>('.wb-shell-visibility-state')].find((one) => one.textContent === name)!
  fireEvent.click(label.querySelector('input')!)
}

function buttonVisibility(held: PageDocument): unknown {
  return [...walkNodes(held.root)].find(({ node }) => node.id === 'n-btn')!.node.visibility
}

async function chooseState(name: string): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: /^화면 상태:/ }))
  fireEvent.click(await screen.findByRole('menuitemradio', { name }))
}

describe('«상태 보임» — 세 갈래', () => {
  it('«없음» → «이 상태에서만»은 지금 상태 하나로 시작한다 · «숨김»으로 옮겨도 상태가 그대로 · «없음»은 보임을 걷는다 — 고칠 때마다 편집 하나', async () => {
    const srv = await open(doc())
    await chooseState('관리자')
    select('Button')
    expect(modeSelect().value).toBe('none')

    fireEvent.change(modeSelect(), { target: { value: 'only' } })
    await waitFor(() => expect(srv.calls).toHaveLength(1))
    expect(buttonVisibility(srv.held())).toEqual({ mode: 'only', states: ['s_admin'] })

    fireEvent.change(modeSelect(), { target: { value: 'except' } })
    await waitFor(() => expect(srv.calls).toHaveLength(2))
    expect(buttonVisibility(srv.held())).toEqual({ mode: 'except', states: ['s_admin'] })

    fireEvent.change(modeSelect(), { target: { value: 'none' } })
    await waitFor(() => expect(srv.calls).toHaveLength(3))
    expect(buttonVisibility(srv.held())).toBeUndefined()
    expect(srv.calls.map((ops) => ops.map((op) => op.op))).toEqual([['add'], ['replace'], ['remove']])
  })

  it('기본 상태에서 «이 상태에서만»은 «기본» 하나로 시작한다', async () => {
    const srv = await open(doc())
    select('Button')
    fireEvent.change(modeSelect(), { target: { value: 'only' } })
    await waitFor(() => expect(srv.calls).toHaveLength(1))
    expect(buttonVisibility(srv.held())).toEqual({ mode: 'only', states: ['default'] })
  })
})

describe('«상태 보임» — 상태 고르기', () => {
  it('«기본» + 트리 차례 · 들여쓰기 · 여럿 — 적는 차례는 고른 차례가 아니라 «기본» 다음 트리 차례다', async () => {
    const srv = await open(doc(undefined, { mode: 'only', states: ['s_guest'] }))
    select('Button')
    expect(stateBoxes().map(({ name, indent, checked }) => [name, indent, checked])).toEqual([
      ['기본', '0px', false],
      ['로그인', '0px', false],
      ['관리자', '12px', false],
      ['손님', '0px', true],
    ])

    toggle('관리자')
    await waitFor(() => expect(srv.calls).toHaveLength(1))
    toggle('기본')
    await waitFor(() => expect(srv.calls).toHaveLength(2))
    expect(buttonVisibility(srv.held())).toEqual({ mode: 'only', states: ['default', 's_admin', 's_guest'] })

    toggle('손님')
    await waitFor(() => expect(srv.calls).toHaveLength(3))
    expect(buttonVisibility(srv.held())).toEqual({ mode: 'only', states: ['default', 's_admin'] })
  })

  it('마지막 하나는 뺄 수 없다 — 까닭을 달고 누르면 아무것도 안 보낸다', async () => {
    const srv = await open(doc(undefined, { mode: 'except', states: ['s_login'] }))
    select('Button')
    expect(stateBoxes().find((box) => box.name === '로그인')).toEqual({
      name: '로그인',
      indent: '0px',
      checked: true,
      why: LAST_STATE_REASON,
    })
    toggle('로그인')
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(srv.calls).toEqual([])
    expect(stateBoxes().find((box) => box.name === '로그인')!.checked).toBe(true)
  })
})

describe('«상태 보임» — 서지 않는 판 · 한 줄', () => {
  it('상태가 없는 페이지는 고르개 대신 한 줄이다', async () => {
    await open(doc([]))
    select('Button')
    expect(field()!.textContent).toContain(NO_STATES_NOTICE)
    expect(within(field()!).queryByRole('combobox')).toBeNull()
  })

  it('뿌리에는 칸이 없다', async () => {
    // 여는 순간 뿌리가 골라져 있다(구조 툴바 케이스의 «페이지를 열면 루트의 …»와 같은 판). 판 카나리아 — 패널은 섰다(별칭 칸).
    await open(doc())
    await waitFor(() => expect(document.body.querySelector('[data-wb-node-alias]')).not.toBeNull())
    expect(field()).toBeNull()
  })

  it('지금 상태에서 숨은 노드를 고르면 «캔버스에 그리지 않는다» 한 줄이 선다 — 보이는 상태로 가면 걷힌다', async () => {
    await open(doc(undefined, { mode: 'only', states: ['s_guest'] }))
    select('Button')
    expect(field()!.textContent).toContain(HIDDEN_NOW_NOTICE)
    await chooseState('손님')
    await waitFor(() => expect(field()!.textContent).not.toContain(HIDDEN_NOW_NOTICE))
  })
})

describe('`visibilityOps`', () => {
  it('갈래 — 없음에 넣기 add · 있음 replace · null remove · 같으면 null · 빈 상태 null · 뿌리 null', () => {
    const bare = doc()
    expect(visibilityOps(bare, 'n-btn', { mode: 'only', states: ['s_admin'] })).toEqual([
      { op: 'add', path: '/root/children/0/visibility', value: { mode: 'only', states: ['s_admin'] } },
    ])
    expect(visibilityOps(bare, 'n-btn', null)).toBeNull()
    expect(visibilityOps(bare, 'n-btn', { mode: 'only', states: [] })).toBeNull()
    expect(visibilityOps(bare, 'n-root', { mode: 'only', states: ['s_admin'] })).toBeNull()

    const shown = doc(undefined, { mode: 'only', states: ['s_admin'] })
    expect(visibilityOps(shown, 'n-btn', { mode: 'only', states: ['s_admin'] })).toBeNull()
    expect(visibilityOps(shown, 'n-btn', { mode: 'except', states: ['s_admin'] })).toEqual([
      { op: 'replace', path: '/root/children/0/visibility', value: { mode: 'except', states: ['s_admin'] } },
    ])
    expect(visibilityOps(shown, 'n-btn', null)).toEqual([{ op: 'remove', path: '/root/children/0/visibility' }])
  })
})
