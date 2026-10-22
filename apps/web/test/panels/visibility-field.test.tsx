/**
 * **속성 패널 «상태 보임» 칸**(`src/panels/visibility-field.tsx` · `src/edit/ops.ts` 의 `visibilityOps` — 설계서 「설계서 화면 구조」의 «화면 상태»).
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | 세 갈래 | 첫 줄이 `[비활성][숨김][표시]` 라디오가 아니다 · «비활성» → «표시»가 지금 상태 하나로 시작하지 않는다 · «숨김»으로 옮기며 상태를 잃는다 · «비활성»이 보임을 안 걷는다 · 편집이 하나가 아니다 · ← → 가 갈래를 안 옮긴다 |
 * | 상태 고르기 | 둘째 줄이 «비활성»에서 선다 · 항목이 «기본» + 트리 차례 · 깊이 표지가 아니다 · 여럿을 못 켠다(토글) · 적는 차례가 켠 차례를 따른다 · 마지막 하나를 끌 수 있다 |
 * | 상태 없는 페이지 · 뿌리 | 고르개가 선다 · 뿌리에 칸이 선다 |
 * | 숨은 노드 · 잠금 | 지금 숨은 노드에 한 줄이 없다 · 남이 잡은 노드에서 칸이 켜져 있다 |
 */
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { applyOps, walkNodes, type PageDocument, type PatchOp, type ViewState, type WbNode } from '@wirebound/schema'
import type { ApiClient } from '../../src/api/client'
import type { PageDetail, PatchResult } from '../../src/api/types'
import { visibilityOps } from '../../src/edit/ops'
import {
  HIDDEN_NOW_NOTICE,
  LAST_STATE_REASON,
  NO_STATES_NOTICE,
  STATE_DEPTH_MARK,
  VISIBILITY_LABEL,
} from '../../src/panels/visibility-field'
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

/** 첫 줄의 라디오 — 이름 차례 · 고른 것. */
function modes(): { name: string; checked: boolean }[] {
  const group = within(field()!).getByRole('radiogroup', { name: VISIBILITY_LABEL })
  return within(group)
    .getAllByRole('radio')
    .map((radio) => ({ name: radio.textContent ?? '', checked: radio.getAttribute('aria-checked') === 'true' }))
}

function chooseMode(name: string): void {
  fireEvent.click(within(field()!).getByRole('radio', { name }))
}

function checkedMode(): string | undefined {
  return modes().find((mode) => mode.checked)?.name
}

/** 상태 단추 — 이름(접근 이름) · 깊이 표지 · 켰나 · 끈 까닭. */
function stateBoxes(): { name: string; mark: string; on: boolean; why: string | null }[] {
  return [...field()!.querySelectorAll<HTMLButtonElement>('.wb-shell-visibility-state')].map((button) => ({
    name: [...button.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent)
      .join(''),
    mark: button.querySelector('[aria-hidden="true"]')?.textContent ?? '',
    on: button.getAttribute('aria-pressed') === 'true',
    why: button.getAttribute('aria-disabled') === 'true' ? button.getAttribute('aria-description') : null,
  }))
}

function toggle(name: string): void {
  const group = within(field()!).getByRole('group')
  fireEvent.click(within(group).getByRole('button', { name }))
}

function buttonVisibility(held: PageDocument): unknown {
  return [...walkNodes(held.root)].find(({ node }) => node.id === 'n-btn')!.node.visibility
}

async function chooseState(name: string): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: /^화면 상태:/ }))
  fireEvent.click(await screen.findByRole('menuitemradio', { name }))
}

describe('«상태 보임» — 세 갈래', () => {
  it('«비활성» → «표시»는 지금 상태 하나로 시작한다 · «숨김»으로 옮겨도 상태가 그대로 · «비활성»은 보임을 걷는다 — 고칠 때마다 편집 하나', async () => {
    const srv = await open(doc())
    await chooseState('관리자')
    select('Button')
    expect(modes()).toEqual([
      { name: '비활성', checked: true },
      { name: '숨김', checked: false },
      { name: '표시', checked: false },
    ])
    // 둘째 줄은 «숨김» · «표시»에서만 선다.
    expect(within(field()!).queryByRole('group')).toBeNull()

    chooseMode('표시')
    await waitFor(() => expect(srv.calls).toHaveLength(1))
    expect(buttonVisibility(srv.held())).toEqual({ mode: 'only', states: ['s_admin'] })
    await waitFor(() => expect(checkedMode()).toBe('표시'))

    chooseMode('숨김')
    await waitFor(() => expect(srv.calls).toHaveLength(2))
    expect(buttonVisibility(srv.held())).toEqual({ mode: 'except', states: ['s_admin'] })

    chooseMode('비활성')
    await waitFor(() => expect(srv.calls).toHaveLength(3))
    expect(buttonVisibility(srv.held())).toBeUndefined()
    expect(srv.calls.map((ops) => ops.map((op) => op.op))).toEqual([['add'], ['replace'], ['remove']])
  })

  it('기본 상태에서 «표시»는 «기본» 하나로 시작한다', async () => {
    const srv = await open(doc())
    select('Button')
    chooseMode('표시')
    await waitFor(() => expect(srv.calls).toHaveLength(1))
    expect(buttonVisibility(srv.held())).toEqual({ mode: 'only', states: ['default'] })
  })

  it('← → 는 라디오 줄에서 갈래를 옮겨 고른다 — 포커스도 따라간다', async () => {
    const srv = await open(doc())
    select('Button')
    const none = within(field()!).getByRole('radio', { name: '비활성' })
    fireEvent.keyDown(none, { key: 'ArrowRight' })
    await waitFor(() => expect(srv.calls).toHaveLength(1))
    expect(buttonVisibility(srv.held())).toEqual({ mode: 'except', states: ['default'] })
    expect(document.activeElement?.textContent).toBe('숨김')
  })
})

describe('«상태 보임» — 상태 고르기', () => {
  it('«기본» + 트리 차례 · 깊이 표지 · 여럿을 켜는 토글 — 적는 차례는 켠 차례가 아니라 «기본» 다음 트리 차례다', async () => {
    const srv = await open(doc(undefined, { mode: 'only', states: ['s_guest'] }))
    select('Button')
    expect(stateBoxes().map(({ name, mark, on }) => [name, mark, on])).toEqual([
      ['기본', '', false],
      ['로그인', '', false],
      ['관리자', STATE_DEPTH_MARK, false],
      ['손님', '', true],
    ])
    // 깊이 표지는 접근 이름에 안 든다.
    expect(within(field()!).getByRole('button', { name: '관리자' })).toBeTruthy()

    toggle('관리자')
    await waitFor(() => expect(srv.calls).toHaveLength(1))
    toggle('기본')
    await waitFor(() => expect(srv.calls).toHaveLength(2))
    expect(buttonVisibility(srv.held())).toEqual({ mode: 'only', states: ['default', 's_admin', 's_guest'] })

    toggle('손님')
    await waitFor(() => expect(srv.calls).toHaveLength(3))
    expect(buttonVisibility(srv.held())).toEqual({ mode: 'only', states: ['default', 's_admin'] })
  })

  it('마지막 하나는 끌 수 없다 — 까닭을 달고 누르면 아무것도 안 보낸다', async () => {
    const srv = await open(doc(undefined, { mode: 'except', states: ['s_login'] }))
    select('Button')
    expect(stateBoxes().find((box) => box.name === '로그인')).toEqual({
      name: '로그인',
      mark: '',
      on: true,
      why: LAST_STATE_REASON,
    })
    toggle('로그인')
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(srv.calls).toEqual([])
    expect(stateBoxes().find((box) => box.name === '로그인')!.on).toBe(true)
  })
})

describe('«상태 보임» — 서지 않는 판 · 한 줄', () => {
  it('상태가 없는 페이지는 고르개 대신 한 줄이다', async () => {
    await open(doc([]))
    select('Button')
    expect(field()!.textContent).toContain(NO_STATES_NOTICE)
    expect(within(field()!).queryByRole('radiogroup')).toBeNull()
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
