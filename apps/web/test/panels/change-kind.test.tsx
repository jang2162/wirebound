/**
 * **«종류 바꾸기…»**(`src/panels/change-kind-dialog.tsx` · `src/panels/tree-row-actions.tsx` · `src/edit/change-kind.ts`) — jsdom 판. 줄 `…` 의
 * 항목이 입력 조각 줄에만 서고 · 상자의 종류 단추가 편집 하나를 내며 · 되돌리기가 옛 종류로 돌리고 · 남이 잡은 조각 · 상자를 연 뒤 온 잠금 ·
 * viewer 에서는 편집이 안 나가는 것을 잰다. op 의 모양은 `../edit/change-kind.test.ts`. 실브라우저 판(두 사람)은
 * `build-test/change-kind.test.ts`.
 *
 * 잠금 판은 `../lock/toolbar-abilities.test.tsx` 와 같은 꼴이다 — 가짜 소켓으로 잠금 프레임을 밀어 넣고 서버의 2차 방어(`lockConflictOfOps`)를
 * 대역이 그대로 돈다. `onopen` 을 안 불러 편집이 REST(`patchOps`)로 나간다.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { lockConflictOfOps, type CodeGroup, type PageDocument, type PatchOp, type WbNode } from '@wirebound/schema'
import { beforeAll, describe, expect, it } from 'vitest'
import { ApiError, type ApiClient } from '../../src/api/client'
import type { PageDetail, PatchResult } from '../../src/api/types'
import type { RealtimeSocket } from '../../src/realtime/connection'
import { createConnectionIdHolder, type RealtimeSetup } from '../../src/realtime/context'
import { createEditChannel } from '../../src/realtime/edit-channel'
import { createLockChannel } from '../../src/realtime/lock-channel'
import type { NodeLockView, ServerFrame } from '../../src/realtime/protocol'
import { HEAD_SEQ, PAGE_ID, PROJECT_ID, openPage, pageDetail, pageDoc } from '../editor-harness'
import { installPointerEvents } from '../pointer-events'
import '../../src/catalog-setup'
import { CODE_UNBOUND_NOTICE } from '../../src/panels/structure-toolbar'
import { isOff, queryRowAction, rowAction, rowReason, structureRowName } from './tree-row'

beforeAll(installPointerEvents)

const ME = 'u-1'
const CHANGE = '종류 바꾸기…'

class FakeSocket implements RealtimeSocket {
  onopen: (() => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  send(): void {}
  close(): void {
    this.onclose?.()
  }
}

const INPUT: WbNode = {
  id: 'n-in',
  type: 'Input',
  props: { placeholder: '고르세요', invalid: true, kind: 'number' },
  marker: 2,
  alias: '이름 칸',
}

/**
 * ```
 * n-root (Page)
 * └ n-f (Field '이름')
 *    ├ n-in (Input — 안내 · 오류 · 번호 · 별칭)
 *    └ n-af (Affix)
 * ```
 */
function doc(input: WbNode = INPUT): PageDocument {
  return pageDoc({
    id: 'n-root',
    type: 'Page',
    children: [
      {
        id: 'n-f',
        type: 'Field',
        props: { label: '이름' },
        children: [input, { id: 'n-af', type: 'Affix', props: { text: '~' } }],
      },
    ],
  })
}

interface Board {
  calls: PatchOp[][]
  status: number[]
  held: () => PageDocument
  lock: (locks: NodeLockView[]) => void
}

async function board(options: { role?: 'viewer'; piece?: WbNode; codes?: CodeGroup[] } = {}): Promise<Board> {
  const sockets: FakeSocket[] = []
  const calls: PatchOp[][] = []
  const status: number[] = []
  let live: NodeLockView[] = []
  let seq = HEAD_SEQ
  let held = doc(options.piece)

  const patchOps: ApiClient['patchOps'] = async (_projectId, _pageId, body) => {
    calls.push(body.ops)
    const conflict = lockConflictOfOps({ document: held, locks: live, ops: body.ops, viewerUserId: ME })
    if (conflict !== null) {
      status.push(423)
      throw new ApiError(423, 'locked', `${conflict.userName}님이 편집 중인 영역입니다`)
    }
    status.push(200)
    const { applyOps, invertOps } = await import('@wirebound/schema')
    const inverse = invertOps(held, body.ops)
    held = applyOps(held, body.ops)
    seq += 1
    const result: PatchResult = {
      seq,
      revisionId: `rev-${seq}`,
      inverse,
      schemaVersion: 4,
      ...(body.clientOpId === undefined ? {} : { clientOpId: body.clientOpId }),
    }
    return result
  }
  const getPage: ApiClient['getPage'] = async (_projectId, pageId) => {
    const detail: PageDetail = { ...pageDetail(pageId, held), headSeq: seq }
    return detail
  }
  const setup: RealtimeSetup = {
    holder: createConnectionIdHolder(),
    channel: createEditChannel(),
    lockChannel: createLockChannel(),
    origin: 'http://localhost:5173',
    connection: {
      createSocket: () => {
        const socket = new FakeSocket()
        sockets.push(socket)
        return socket
      },
      schedule: () => 1,
      cancel: () => {},
    },
  }
  await openPage(doc(options.piece), {
    realtime: setup,
    apiOverrides: {
      patchOps,
      getPage,
      listComments: async () => [],
      ...(options.codes === undefined ? {} : { listCodes: async () => options.codes!, codeUsageCounts: async () => ({}) }),
      ...(options.role === 'viewer'
        ? {
            getProject: async () => ({
              id: PROJECT_ID,
              name: '관리자 콘솔 설계서',
              slug: 'admin-console',
              description: '',
              role: 'viewer' as const,
              themeRev: 0,
            }),
          }
        : {}),
    },
  })
  return {
    calls,
    status,
    held: () => held,
    lock: (locks) => {
      live = locks
      const frame: ServerFrame = { type: 'locks', projectId: PROJECT_ID, locks }
      act(() => {
        sockets.at(-1)?.onmessage?.({ data: JSON.stringify(frame) })
      })
    },
  }
}

function structureRegion(): HTMLElement {
  return screen.getByRole('region', { name: '구조 트리' })
}

function row(type: string): HTMLElement {
  const button = within(structureRegion()).getByRole('button', { name: structureRowName(type) })
  return button.closest<HTMLElement>('[data-tree-row]')!
}

function dialog(): HTMLElement {
  return screen.getByRole('dialog', { name: CHANGE })
}

const piece = (document: PageDocument): WbNode => document.root.children![0]!.children![0]!

describe('줄 `…` 의 «종류 바꾸기…»', () => {
  it('입력 조각 줄에만 선다 — 사이 글자 · 필드 · 뿌리 줄에는 없다', async () => {
    await board()
    expect(isOff(rowAction(structureRegion(), CHANGE, row('Input')))).toBe(false)
    for (const type of ['Affix', 'Field', 'Page']) expect(queryRowAction(structureRegion(), CHANGE, row(type)), type).toBeNull()
  })

  it('상자의 «셀렉트» 하나로 편집 하나 — 같은 id · 번호 · 별칭, 안내 · 오류는 옮기고 kind 는 버린다 · 상자가 닫힌다', async () => {
    const srv = await board()
    fireEvent.click(rowAction(structureRegion(), CHANGE, row('Input')))
    const box = dialog()
    expect(
      within(within(box).getByRole('group', { name: '바꿀 종류' }))
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['여러 줄 입력', '셀렉트', '날짜', '시간', '체크박스', '라디오 묶음'])
    fireEvent.click(within(box).getByRole('button', { name: '셀렉트' }))

    await waitFor(() => expect(srv.calls).toHaveLength(1))
    expect(srv.status).toEqual([200])
    expect(piece(srv.held())).toEqual({
      id: 'n-in',
      type: 'Select',
      props: { placeholder: '고르세요', invalid: true },
      marker: 2,
      alias: '이름 칸',
    })
    expect(screen.queryByRole('dialog', { name: CHANGE })).toBeNull()
    // 트리 줄이 새 종류로 선다(같은 노드 — 고른 채다).
    await waitFor(() => expect(row('Select').classList.contains('wb-shell-tree-row-picked')).toBe(true))
  })

  it('되돌리기(Cmd+Z)가 옛 종류 · props 로 돌린다 — 서버 문서 = 바꾸기 전', async () => {
    const srv = await board()
    fireEvent.click(rowAction(structureRegion(), CHANGE, row('Input')))
    fireEvent.click(within(dialog()).getByRole('button', { name: '날짜' }))
    await waitFor(() => expect(srv.calls).toHaveLength(1))
    expect(piece(srv.held()).type).toBe('DateInput')

    fireEvent.click(screen.getByRole('button', { name: '되돌리기' }))
    await waitFor(() => expect(srv.calls).toHaveLength(2))
    expect(srv.held()).toEqual(doc())
    await waitFor(() => expect(within(structureRegion()).queryByRole('button', { name: structureRowName('Input') })).not.toBeNull())
  })

  it('취소는 편집을 안 낸다', async () => {
    const srv = await board()
    fireEvent.click(rowAction(structureRegion(), CHANGE, row('Input')))
    fireEvent.click(within(dialog()).getByRole('button', { name: '취소' }))
    expect(screen.queryByRole('dialog', { name: CHANGE })).toBeNull()
    expect(srv.calls).toEqual([])
  })
})

describe('잠금 · 권한', () => {
  it('고른 조각을 남이 잡으면 항목이 꺼지고 잡은 사람의 이름을 말한다', async () => {
    const srv = await board()
    fireEvent.click(within(structureRegion()).getByRole('button', { name: structureRowName('Input') }))
    srv.lock([{ pageId: PAGE_ID, nodeId: 'n-in', userId: 'u-bora', userName: '보라' }])
    expect(rowReason(structureRegion(), CHANGE, row('Input'))).toContain('보라')
    expect(isOff(rowAction(structureRegion(), CHANGE, row('Input')))).toBe(true)
  })

  it('상자를 연 뒤 남이 그 조각을 잡으면 단추를 눌러도 편집이 안 나간다 — 이유를 하단 바에 말한다', async () => {
    const srv = await board()
    fireEvent.click(rowAction(structureRegion(), CHANGE, row('Input')))
    srv.lock([{ pageId: PAGE_ID, nodeId: 'n-f', userId: 'u-bora', userName: '보라' }])
    fireEvent.click(within(dialog()).getByRole('button', { name: '셀렉트' }))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(srv.calls).toEqual([])
    expect(piece(srv.held()).type).toBe('Input')
    expect(screen.getAllByText(/보라님이/).length).toBeGreaterThan(0)
  })

  it('뷰 모드 — 구조 트리째 없고 «컴포넌트» 탭(선택지 위젯)도 없다 · 편집 0', async () => {
    const srv = await board()
    fireEvent.click(within(structureRegion()).getByRole('button', { name: structureRowName('Input') }))
    fireEvent.click(screen.getByRole('button', { name: '뷰 모드' }))
    await waitFor(() => expect(screen.queryByRole('region', { name: '구조 트리' })).toBeNull())
    expect(screen.queryByRole('tab', { name: '컴포넌트' })).toBeNull()
    expect(screen.queryByRole('group', { name: '선택지' })).toBeNull()
    expect(srv.calls).toEqual([])
  })

  it('viewer — 줄 `…` 에 «종류 바꾸기…» 가 없다(모듈로 저장만)', async () => {
    const srv = await board({ role: 'viewer' })
    await waitFor(() => expect(queryRowAction(structureRegion(), '모듈로 저장…', row('Input'))).not.toBeNull())
    expect(queryRowAction(structureRegion(), CHANGE, row('Input'))).toBeNull()
    expect(srv.calls).toEqual([])
  })
})

describe('공통코드에 묶인 조각의 종류 바꾸기', () => {
  const CODES: CodeGroup[] = [{ key: 'G', name: '그룹', items: [{ value: 'A', name: '새 가', active: true }] }]
  const BOUND: WbNode = {
    id: 'n-in',
    type: 'Select',
    props: { options: [{ label: '옛 가', selected: true }] },
    code: { group: 'G', selected: ['A'] },
  }
  const info = (): string | null => document.body.querySelector('.wb-shell-info-notice')?.textContent ?? null

  /** 표가 실렸다 — 트리 줄의 요약이 표의 이름이다. 안 기다리면 표 없이 풀어 대체 글이 남는다. */
  async function boundBoard(): Promise<Board> {
    const srv = await board({ piece: BOUND, codes: CODES })
    await waitFor(() => expect(row('Select').textContent).toContain('새 가'))
    return srv
  }

  it('못 받는 종류로 바꾸면 같은 편집이 묶음을 풀고 한 줄을 알린다', async () => {
    const srv = await boundBoard()
    fireEvent.click(rowAction(structureRegion(), CHANGE, row('Select')))
    fireEvent.click(within(dialog()).getByRole('button', { name: '여러 줄 입력' }))
    await waitFor(() => expect(srv.calls).toHaveLength(1))
    expect(piece(srv.held())).toEqual({ id: 'n-in', type: 'TextArea' })
    expect(info()).toBe(CODE_UNBOUND_NOTICE)
  })

  it('같은 묶음 꼴로 바꾸면 참조가 그대로이고 알리지 않는다', async () => {
    const srv = await boundBoard()
    fireEvent.click(rowAction(structureRegion(), CHANGE, row('Select')))
    fireEvent.click(within(dialog()).getByRole('button', { name: '체크박스' }))
    await waitFor(() => expect(srv.calls).toHaveLength(1))
    expect(piece(srv.held()).code).toEqual({ group: 'G', selected: ['A'] })
    expect(info()).toBeNull()
  })
})
