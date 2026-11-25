/**
 * **페이지 정보 «레이아웃» 과 남의 뿌리 잠금**(`src/panels/page-kind.tsx`). 팝업 경계를 넘는 바꿈만 뿌리를 갈아 끼우므로 남이 뿌리를 쥐었으면 그
 * 단추만 꺼지고 까닭(잠근 사람 이름)을 말한다 — 빈 ↔ 서브페이지는 `/layout` 하나라 켜진 채 나간다. 서버 대역은 `lockConflictOfOps` 를 그대로
 * 돈다(`../lock/props-lock.test.tsx` 와 같은 꼴 — 화면이 막았는지 · 서버가 받았는지를 가른다).
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { applyOps, invertOps, lockConflictOfOps, type PageDocument, type PatchOp } from '@wirebound/schema'
import { describe, expect, it } from 'vitest'
import { ApiError, type ApiClient } from '../../src/api/client'
import type { PageDetail, PatchResult } from '../../src/api/types'
import type { RealtimeSocket } from '../../src/realtime/connection'
import { createConnectionIdHolder, type RealtimeSetup } from '../../src/realtime/context'
import { createEditChannel } from '../../src/realtime/edit-channel'
import { createLockChannel } from '../../src/realtime/lock-channel'
import type { NodeLockView, ServerFrame } from '../../src/realtime/protocol'
import { HEAD_SEQ, PAGE_ID, PROJECT_ID, openPage, pageDetail, pageDoc } from '../editor-harness'
import '../../src/catalog-setup'

/** 하네스의 사용자 id(`editor-harness.tsx` 의 `USER`). */
const ME = 'u-1'
const HOLDER = '보라'

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

async function board(start: PageDocument): Promise<{ lockRoot: () => void; calls: { ops: PatchOp[] }[]; status: number[] }> {
  const sockets: FakeSocket[] = []
  const calls: { ops: PatchOp[] }[] = []
  const status: number[] = []
  let live: NodeLockView[] = []
  let seq = HEAD_SEQ
  let held = start
  const patchOps: ApiClient['patchOps'] = async (_projectId, _pageId, body) => {
    calls.push({ ops: body.ops })
    const conflict = lockConflictOfOps({ document: held, locks: live, ops: body.ops, viewerUserId: ME })
    if (conflict !== null) {
      status.push(423)
      throw new ApiError(423, 'locked', `${conflict.userName}님이 편집 중인 영역입니다`)
    }
    status.push(200)
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
  // `onopen` 을 부르지 않는다 — 편집이 REST(`patchOps` 대역)로 나간다. 잠금 프레임은 `onmessage` 로 들어온다.
  await openPage(start, { realtime: setup, apiOverrides: { patchOps, getPage } })
  return {
    lockRoot: () => {
      live = [{ pageId: PAGE_ID, nodeId: start.root.id, userId: 'u-bora', userName: HOLDER }]
      const frame: ServerFrame = { type: 'locks', projectId: PROJECT_ID, locks: live }
      act(() => {
        sockets.at(-1)?.onmessage?.({ data: JSON.stringify(frame) })
      })
    },
    calls,
    status,
  }
}

async function layoutGroup(): Promise<HTMLElement> {
  fireEvent.click(screen.getByRole('tab', { name: '페이지 정보' }))
  return screen.findByRole('radiogroup', { name: '레이아웃' })
}

function radio(group: HTMLElement, name: string): HTMLButtonElement {
  return within(group).getByRole('radio', { name }) as HTMLButtonElement
}

const PAGE = pageDoc({ id: 'n-root', type: 'Page', children: [{ id: 'n-text', type: 'Text', props: { content: '본문' } }] })

describe('페이지 정보 «레이아웃» — 남이 뿌리를 쥐면', () => {
  it('팝업 단추만 꺼지고 까닭을 말한다 · 빈 ↔ 서브페이지는 켜진 채 나가 서버가 받는다', async () => {
    const { lockRoot, calls, status } = await board(PAGE)
    const group = await layoutGroup()
    lockRoot()
    await waitFor(() => expect(radio(group, '팝업').disabled).toBe(true))
    expect([radio(group, '빈').disabled, radio(group, '서브페이지').disabled]).toEqual([false, false])
    expect(radio(group, '팝업').title).toContain(HOLDER)
    expect(group.getAttribute('aria-description')).toContain(HOLDER)

    fireEvent.click(radio(group, '팝업'))
    fireEvent.click(radio(group, '서브페이지'))
    await waitFor(() => expect(status).toEqual([200]))
    expect(calls.map((call) => call.ops)).toEqual([
      [
        { op: 'test', path: '/layout', value: 'blank' },
        { op: 'replace', path: '/layout', value: 'subpage' },
      ],
    ])
    await waitFor(() => expect(radio(group, '서브페이지').getAttribute('aria-checked')).toBe('true'))
  })

  it('팝업 페이지면 빈 · 서브페이지가 꺼지고(경계를 넘는다) 팝업은 켜진 채다', async () => {
    const popup = pageDoc({ id: 'n-root', type: 'Popup', props: { title: '상세' }, children: [] })
    const { lockRoot } = await board(popup)
    const group = await layoutGroup()
    lockRoot()
    await waitFor(() => expect(radio(group, '빈').disabled).toBe(true))
    expect([radio(group, '서브페이지').disabled, radio(group, '팝업').disabled]).toEqual([true, false])
  })
})
