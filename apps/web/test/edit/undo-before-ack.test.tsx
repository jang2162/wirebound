/**
 * **내 편집의 ack 가 닿기 전에 누른 되돌리기 · 다시 실행은 ack 까지 미뤘다가 그 편집에 한다**(`edit/use-edit-commit.tsx` 의 `afterAck` ·
 * `EditorStore.awaitsStackAck`). 스택은 ack 가 쌓으므로 미루지 않으면 누른 것이 그 앞 항목을 되돌린다 — 실브라우저 판은
 * `build-test/editor-undo-before-ack.test.ts`(페이지가 통째로 비었다).
 *
 * | 입구 | 끝 |
 * |---|---|
 * | ack 전 누름 | 누른 때 큐의 마지막 편집이 **ack 로** 나가면 한 번 되돌린다(`EditorStore.deferralAcked`) |
 * | 미루는 동안 또 누름(같은 키 · 키 + 머리 단추) | 버린다 — 슬롯은 스토어에 하나다 · 한 단계만 나간다 |
 * | 미루는 동안 반대 종류를 누름(되돌리기 ↔ 다시 실행) | 슬롯 뒤에 한 줄 선다 — 누른 차례대로 나가고 서로를 새 편집으로 버리지 않는다 |
 * | 마지막 편집이 ack 아닌 길(리베이스 버림 · 거절)로 떠남 | 앞 편집의 ack 가 맨 위를 바꿨어도 되돌리지 않는다 · «되돌리려던 편집이 저장되지 않아 …» 가 잃음 통지에 한 번 이어진다 |
 * | 누른 뒤에 낸 편집(Delete · 속성 글) | 기다리지도 되돌리지도 않는다 — ack 때 큐에 있으면 버리고 말한다 |
 * | 답이 거절(`patch-error`) | 미룬 것은 버린다 · 앞 항목을 되돌리지 않는다 |
 * | 리베이스가 그 편집을 버림 | 하지 않는다 · 버림 통지가 서고 «저장되지 않아» 가 이어진다 |
 * | 미루는 동안 잃음이 섬(리베이스가 가운데 편집을 버림) | ack 로 나간 되돌림이 그 통지를 안 지운다 — 누른 때의 통지로 가른다(`sayAfterWait`) |
 * | 한도(3s) 지남 | 말하고 안 한다(서 있는 잃음 통지를 덮지 않고 잇는다 · 두 번 눌러도 한 조각) · ack 가 그 뒤에 오면 마지막 누름이 기다린 편집이 나갔을 때 그 조각만 거둔다 |
 * | 미루는 동안 페이지를 옮김 | 버린다 — 새 판에 아무것도 안 나간다 · «화면이 바뀌어 이전 화면에서 미뤄 둔 되돌리기는 하지 않았습니다.» 한 줄 |
 * | 미루는 동안 뷰 모드 · viewer | 버린다 — 키 · 단추 어느 입구로 눌렀든 |
 *
 * **못 재는 것 — 판 대조 둘**(`afterAck` 의 구독 · 마이크로태스크의 `boardEpoch` 검사): 함께 떼도 이 파일 · 스토어 · 훅 케이스가 안 죽는다. 판을 비우는
 * 자리(`loadPage` · `clearPage` · `reset`)는 같은 `#apply` 에서 큐와 스택을 함께 비워 구독의 첫 알림이 «큐 비어 맨 위 그대로» 로 와 하지 않기 때문이다.
 * 그 알림 뒤에 스택이 다시 차기(`restoreUndo` 는 비동기)까지 구독이 살아 있어야 닿는데 거기서 이미 끝난다. 한도 갈래의 검사는 따로다.
 *
 * **두 겹이 함께 막는 것 — 슬롯 · 새 편집 검사:** 키 + 머리 단추 케이스는 한 겹씩 떼면 초록이고 둘 다 떼야 빨강이다(둘째 훅의 마이크로태스크가 첫째가
 * 방금 낸 되돌림을 «누른 뒤 새로 들어온 편집»으로 보고 버린다). 슬롯을 혼자 재는 것은 `test/edit/use-edit-commit.test.tsx` «슬롯이 풀린다» ·
 * `test/store/editor-store.test.ts` «미룬 되돌리기 슬롯» 이다.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import type { PageDocument, PatchOp } from '@wirebound/schema'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RevisionSummary } from '../../src/api/types'
import { UNDO_ACK_WAIT_MS } from '../../src/edit/use-edit-commit'
import type { RealtimeSocket } from '../../src/realtime/connection'
import { createConnectionIdHolder } from '../../src/realtime/context'
import { createEditChannel } from '../../src/realtime/edit-channel'
import { HEAD_SEQ, OTHER_PAGE_TITLE, PAGE_ID, PROJECT_ID, canvasQueryAll, openPage, pageDoc, waitForNode } from '../editor-harness'
import '../../src/catalog-setup'
import { structureRowName } from '../panels/tree-row'

class FakeSocket implements RealtimeSocket {
  onopen: (() => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  readonly sent: unknown[] = []
  send(data: string): void {
    this.sent.push(JSON.parse(data))
  }
  close(): void {
    this.onclose?.()
  }
}

const text = (id: string, content: string) => ({ id, type: 'Text', props: { content, role: 'body' } })
const doc = (): PageDocument => pageDoc({ id: 'n-root', type: 'Page', children: [text('n-ga', '가'), text('n-na', '나')] })
const OLD_ENTRY: RevisionSummary = {
  id: `rev-${HEAD_SEQ}`,
  seq: HEAD_SEQ,
  actorType: 'user',
  actorId: 'u-1',
  actorLabel: 'u-1',
  ops: [],
  inverse: [{ op: 'replace', path: '/root/children/1/props/content', value: '옛 나' }],
  createdAt: '2026-09-25T09:00:00.000Z',
}
const INVERSE: PatchOp[] = [{ op: 'replace', path: '/root/children/0/props/content', value: '가' }]

const undoButton = () =>
  within(screen.getByRole('group', { name: '편집 이력' })).getByRole<HTMLButtonElement>('button', { name: '되돌리기' })
const redoButton = () =>
  within(screen.getByRole('group', { name: '편집 이력' })).getByRole<HTMLButtonElement>('button', { name: '다시 실행' })
const contents = () =>
  canvasQueryAll('[data-wb-id^="n-"]')
    .filter((node) => node.getAttribute('data-wb-id') !== 'n-root')
    .map((node) => node.textContent ?? '')

/** 판 — 새로고침으로 채운 옛 항목(나) 위에서 «가» 를 고쳐 보낸다(ack 는 아직). */
async function stage(): Promise<{
  patches: () => { ops: PatchOp[]; clientOpId: string }[]
  frame: (data: Record<string, unknown>) => void
  ackFirst: () => void
  failFirst: () => void
  edit: (index: number, value: string) => Promise<void>
  ack: (index: number, inverse: PatchOp[]) => void
}> {
  const sockets: FakeSocket[] = []
  await openPage(doc(), {
    realtime: {
      holder: createConnectionIdHolder(),
      channel: createEditChannel(),
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
    },
    apiOverrides: { listMyRevisions: async () => [OLD_ENTRY], listRevisionsBefore: async () => [] },
    docs: { 'pg-2': pageDoc({ id: 'n-root2', type: 'Page', children: [text('n-other', '다른 페이지')] }) },
  })
  act(() => sockets[0]?.onopen?.())
  await waitFor(() => expect(undoButton().disabled).toBe(false))
  const patches = () =>
    (sockets[0]?.sent ?? []).filter((f) => (f as { type?: string }).type === 'patch') as { ops: PatchOp[]; clientOpId: string }[]
  const frame = (data: Record<string, unknown>) =>
    act(() => sockets[0]?.onmessage?.({ data: JSON.stringify({ projectId: PROJECT_ID, pageId: PAGE_ID, warnings: [], ...data }) }))
  const edit = async (index: number, value: string): Promise<void> => {
    fireEvent.click(
      within(screen.getByRole('region', { name: '구조 트리' })).getAllByRole('button', { name: structureRowName('Text') })[index]!,
    )
    const box = within(screen.getByRole('complementary', { name: '우측 패널' })).getByLabelText<HTMLTextAreaElement>('내용')
    fireEvent.change(box, { target: { value } })
    fireEvent.blur(box)
    await act(async () => {})
  }
  await edit(0, '가 고침')
  await waitFor(() => expect(patches()).toHaveLength(1))
  return {
    patches,
    frame,
    edit,
    ack: (index, inverse) =>
      frame({
        type: 'patch-ack',
        clientOpId: patches()[index]?.clientOpId,
        seq: HEAD_SEQ + 1 + index,
        revisionId: `rev-${index}`,
        inverse,
      }),
    ackFirst: () =>
      frame({ type: 'patch-ack', clientOpId: patches()[0]?.clientOpId, seq: HEAD_SEQ + 1, revisionId: 'rev-mine', inverse: INVERSE }),
    failFirst: () =>
      frame({
        type: 'patch-error',
        clientOpId: patches()[0]?.clientOpId,
        status: 409,
        code: 'conflict',
        message: '페이지가 이미 변경되었습니다',
        issues: [],
      }),
  }
}

const alerts = (): string =>
  screen
    .queryAllByRole('alert')
    .filter((node) => node.classList.contains('wb-shell-edit-alert'))
    .map((node) => node.textContent)
    .join(' | ')

const pressKey = (): void => {
  fireEvent.keyDown(document.body, { bubbles: true, key: 'z', code: 'KeyZ', ctrlKey: true })
}

const BOB_REMOVES_FIRST = {
  type: 'page-changed',
  seq: HEAD_SEQ + 1,
  ops: [{ op: 'remove', path: '/root/children/0' }],
  actor: { type: 'user', label: '밥' },
}
const BOB_REMOVES_SECOND = {
  type: 'page-changed',
  seq: HEAD_SEQ + 1,
  ops: [{ op: 'remove', path: '/root/children/1' }],
  actor: { type: 'user', label: '밥' },
}
const UNSAVED = '되돌리려던 편집이 저장되지 않아 되돌리지 않았습니다.'
const LOST_SECOND = '다른 사람의 변경과 겹쳐 아직 저장되지 않은 편집 1개를 버렸습니다.'

afterEach(() => {
  vi.useRealTimers()
})

describe('ack 전의 되돌리기', () => {
  it('ack 전에 누르면 앞 항목이 아니라 그 편집을 ack 뒤에 되돌린다', async () => {
    const s = await stage()
    fireEvent.click(undoButton())
    await act(async () => {})
    // 미룸 — 앞 항목(나)의 inverse 가 나가지 않았다.
    expect(s.patches()).toHaveLength(1)
    s.ackFirst()
    await waitFor(() => expect(s.patches()).toHaveLength(2))
    expect({ sent: s.patches()[1]?.ops, contents: contents() }).toEqual({ sent: INVERSE, contents: ['가', '나'] })
  })

  it('미루는 동안 또 누른 것은 버린다 — 한 단계만 나간다', async () => {
    const s = await stage()
    fireEvent.click(undoButton())
    fireEvent.click(undoButton())
    s.ackFirst()
    await waitFor(() => expect(s.patches()).toHaveLength(2))
    // 되돌림의 ack 까지 받아야 둘째 누름이 있었다면 그 되돌림이 큐에서 나온다.
    s.frame({
      type: 'patch-ack',
      clientOpId: s.patches()[1]?.clientOpId,
      seq: HEAD_SEQ + 2,
      revisionId: 'rev-undo',
      inverse: [{ op: 'replace', path: '/root/children/0/props/content', value: '가 고침' }],
    })
    await act(async () => {})
    await act(async () => {})
    expect(s.patches()).toHaveLength(2)
  })

  it('답이 거절이면 미룬 것을 버리고 앞 항목을 되돌리지 않는다', async () => {
    const s = await stage()
    fireEvent.click(undoButton())
    s.failFirst()
    await act(async () => {})
    await act(async () => {})
    // 앞 항목(나)의 inverse 가 나가지 않았다 — 거절 뒤 수습이 페이지를 다시 불러와 스택을 비운다(그래서 «맨 위가 바뀌었을 때만» 가드는 이 입구로는 안 재진다 — 보고의 표).
    // 거절은 페이지를 다시 불러와 스택을 비운다 — 되돌리기 단추도 꺼진다.
    expect(undoButton().disabled).toBe(true)
    expect(s.patches()).toHaveLength(1)
  })

  it('한도가 지나면 말하고 안 한다 — ack 가 그 뒤에 오면 그 문장을 거두고 되돌리지도 않는다', async () => {
    const s = await stage()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    fireEvent.click(undoButton())
    await act(async () => {
      vi.advanceTimersByTime(UNDO_ACK_WAIT_MS + 1)
    })
    expect(alerts()).toContain('아직 서버에 닿지 않아')
    s.ackFirst()
    await act(async () => {})
    await act(async () => {})
    expect({ alert: alerts(), sent: s.patches().length }).toEqual({ alert: '', sent: 1 })
  })

  it('미루는 동안 페이지를 옮기면 버린다 — 새 판에 아무것도 안 나간다', async () => {
    const s = await stage()
    fireEvent.click(undoButton())
    fireEvent.click(within(screen.getByRole('region', { name: '메뉴·페이지 트리' })).getByRole('link', { name: OTHER_PAGE_TITLE }))
    await waitForNode('n-other')
    s.ackFirst()
    await act(async () => {})
    await act(async () => {})
    // L-095 — 말없이 버리지 않는다: 누른 키가 아무것도 안 한 까닭을 한 줄로 말한다.
    expect({ sent: s.patches().length, contents: [...new Set(contents())], alert: alerts() }).toEqual({
      sent: 1,
      contents: ['다른 페이지'],
      alert: '화면이 바뀌어 이전 화면에서 미뤄 둔 되돌리기는 하지 않았습니다.',
    })
  })

  it('누른 뒤에 낸 편집은 되돌리지 않는다 — 미룬 되돌리기는 버리고 그렇다고 말한다', async () => {
    const s = await stage()
    fireEvent.click(undoButton())
    await act(async () => {})
    await s.edit(1, '나 고침')
    s.ackFirst()
    await act(async () => {})
    // 나간 것은 «나 고침» 뿐이다(큐의 둘째) — 그 ack 뒤에도 되돌림이 안 나간다.
    await waitFor(() => expect(s.patches()).toHaveLength(2))
    s.ack(1, [{ op: 'replace', path: '/root/children/1/props/content', value: '나' }])
    await act(async () => {})
    await act(async () => {})
    expect({ sent: s.patches().length, contents: contents(), alert: alerts() }).toEqual({
      sent: 2,
      contents: ['가 고침', '나 고침'],
      alert: '되돌리기 전에 새 편집이 있어 되돌리지 않았습니다.',
    })
  })

  it('키보드와 머리 단추를 함께 눌러도 한 단계만 나간다', async () => {
    const s = await stage()
    pressKey()
    fireEvent.click(undoButton())
    s.ackFirst()
    await waitFor(() => expect(s.patches()).toHaveLength(2))
    s.ack(1, [{ op: 'replace', path: '/root/children/0/props/content', value: '가 고침' }])
    await act(async () => {})
    await act(async () => {})
    expect(s.patches()).toHaveLength(2)
  })

  it('한도 문장은 서 있는 잃음 통지를 덮지 않고, ack 가 와도 그 통지를 지우지 않는다', async () => {
    const s = await stage()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    fireEvent.click(undoButton())
    await act(async () => {})
    // 누른 뒤 낸 둘째 편집을 밥이 지워 리베이스가 버린다 — 잃음 통지가 선다. 미룬 되돌리기가 기다리는 앞 편집(나감 · 답 없음)은 그대로다.
    await s.edit(1, '나 고침')
    s.frame(BOB_REMOVES_SECOND)
    await act(async () => {})
    expect(alerts()).toContain(LOST_SECOND)
    await act(async () => {
      vi.advanceTimersByTime(UNDO_ACK_WAIT_MS + 1)
    })
    // 한도 문장은 잃음 통지를 덮지 않고 잇는다.
    expect(alerts()).toContain(LOST_SECOND)
    expect(alerts()).toContain('아직 서버에 닿지 않아')
    s.ackFirst()
    await act(async () => {})
    await act(async () => {})
    // ack 가 와서 한도 문장을 거둘 때는 제 조각만 거둔다.
    expect(alerts()).toBe(LOST_SECOND)
  })

  it('미루는 동안 선 잃음(리베이스가 가운데 편집을 버림)은 ack 로 나간 되돌림이 지우지 않는다(L-088)', async () => {
    const s = await stage()
    // 큐: A(가 고침 · 나감) · B(나 고침) · C(가 고침 2). 누른 때 마지막 먹이 편집은 C.
    await s.edit(1, '나 고침')
    await s.edit(0, '가 고침 2')
    fireEvent.click(undoButton())
    await act(async () => {})
    // 밥이 «나» 를 지워 리베이스가 B 를 버린다 — 잃음 통지가 선다.
    s.frame(BOB_REMOVES_SECOND)
    await act(async () => {})
    expect(alerts()).toContain(LOST_SECOND)
    s.ackFirst()
    await waitFor(() => expect(s.patches()).toHaveLength(2))
    s.ack(1, [{ op: 'replace', path: '/root/children/0/props/content', value: '가 고침' }])
    await waitFor(() => expect(s.patches()).toHaveLength(3))
    await act(async () => {})
    // 되돌림(셋째 패치)이 나갔고, 그 사이 선 잃음 통지는 그대로다.
    expect({ sent: s.patches().length, alert: alerts() }).toEqual({ sent: 3, alert: LOST_SECOND })
  })

  it('키보드로 미룬 뒤 뷰 모드로 바꾸면 버린다 — 뷰 모드에서 커밋되지 않는다', async () => {
    const s = await stage()
    pressKey()
    await act(async () => {})
    fireEvent.click(screen.getByRole('button', { name: '뷰 모드' }))
    s.ackFirst()
    await act(async () => {})
    await act(async () => {})
    expect(s.patches()).toHaveLength(1)
  })

  it('머리 단추로 미룬 뒤 뷰 모드로 바꾸면 버린다 — 단추가 내려가며 거둔다', async () => {
    const s = await stage()
    fireEvent.click(undoButton())
    await act(async () => {})
    fireEvent.click(screen.getByRole('button', { name: '뷰 모드' }))
    s.ackFirst()
    await act(async () => {})
    await act(async () => {})
    expect(s.patches()).toHaveLength(1)
  })

  it('리베이스가 내 유일한 대기 편집을 버리면 되돌리지 않고 말한다 — 맨 아래 항목이 되돌려지지 않는다', async () => {
    const s = await stage()
    fireEvent.click(undoButton())
    await act(async () => {})
    s.frame(BOB_REMOVES_FIRST)
    await act(async () => {})
    await act(async () => {})
    expect({ sent: s.patches().length, contents: contents(), alert: alerts() }).toEqual({
      sent: 1,
      contents: ['나'],
      alert: `${LOST_SECOND} ${UNSAVED}`,
    })
  })

  it('마지막 편집이 ack 아닌 길로 떠나면 앞 편집의 ack 가 맨 위를 바꿔 놓아도 앞 편집을 되돌리지 않는다', async () => {
    const s = await stage()
    // [가 고침(비행), 나 고침(큐)] 에서 누른다 — 누른 때의 마지막 편집은 «나 고침».
    await s.edit(1, '나 고침')
    fireEvent.click(undoButton())
    await act(async () => {})
    // 앞 편집이 ack 되어 스택 맨 위가 바뀐다.
    s.ackFirst()
    await waitFor(() => expect(s.patches()).toHaveLength(2))
    // 밥이 «나»를 지워 리베이스가 «나 고침»을 버린다 — ack 가 아닌 길로 큐를 떠난다.
    s.frame({ ...BOB_REMOVES_SECOND, seq: HEAD_SEQ + 2 })
    await act(async () => {})
    await act(async () => {})
    expect({ sent: s.patches().length, contents: contents(), alert: alerts() }).toEqual({
      sent: 2,
      contents: ['가 고침'],
      alert: `${LOST_SECOND} ${UNSAVED}`,
    })
  })

  it('둘째 편집이 거절되어도 앞 편집을 되돌리지 않고 되돌리려던 편집 문장을 한 번만 잇는다', async () => {
    const s = await stage()
    await s.edit(1, '나 고침')
    fireEvent.click(undoButton())
    await act(async () => {})
    s.ackFirst()
    await waitFor(() => expect(s.patches()).toHaveLength(2))
    // 둘째 편집을 서버가 거절한다 — 거절 수습의 말에 되돌리려던 편집 문장이 한 번 이어진다.
    s.frame({
      type: 'patch-error',
      clientOpId: s.patches()[1]?.clientOpId,
      status: 409,
      code: 'conflict',
      message: '페이지가 이미 변경되었습니다',
      issues: [],
    })
    await act(async () => {})
    await act(async () => {})
    expect(s.patches()).toHaveLength(2)
    expect(alerts().split(UNSAVED)).toHaveLength(2)
  })

  it('한도 문장은 두 번 눌러도 한 조각이다', async () => {
    const s = await stage()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    fireEvent.click(undoButton())
    await act(async () => {
      vi.advanceTimersByTime(UNDO_ACK_WAIT_MS + 1)
    })
    fireEvent.click(undoButton())
    await act(async () => {
      vi.advanceTimersByTime(UNDO_ACK_WAIT_MS + 1)
    })
    const sentence = '편집이 아직 서버에 닿지 않아 되돌리지 못했습니다. 잠시 뒤 다시 눌러 주세요.'
    expect(alerts()).toBe(sentence)
    // 거두는 것은 마지막 누름이 끝났을 때다.
    s.ackFirst()
    await act(async () => {})
    await act(async () => {})
    expect({ alert: alerts(), sent: s.patches().length }).toEqual({ alert: '', sent: 1 })
  })

  it('한도 문장은 앞 누름이 기다린 편집이 나가도 뒤 누름이 기다리는 동안 거두지 않는다', async () => {
    const s = await stage()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    fireEvent.click(undoButton())
    await act(async () => {
      vi.advanceTimersByTime(UNDO_ACK_WAIT_MS + 1)
    })
    // 둘째 편집이 큐에 서고(앞 편집은 아직 답 없음) 두 번째 누름이 그 편집을 기다린다.
    await s.edit(1, '나 고침')
    fireEvent.click(undoButton())
    await act(async () => {
      vi.advanceTimersByTime(UNDO_ACK_WAIT_MS + 1)
    })
    s.ackFirst()
    await act(async () => {})
    await act(async () => {})
    // 앞 누름이 기다린 편집은 나갔지만 뒤 누름이 기다리는 편집은 아직 큐에 있다 — 문장이 남는다.
    expect(alerts()).toContain('아직 서버에 닿지 않아')
  })

  it('되돌리기 · 다시 실행을 번갈아 누르면 누른 차례대로 나간다 — 서로를 새 편집으로 버리지 않는다', async () => {
    const s = await stage()
    const set = (index: number, value: string): PatchOp[] => [{ op: 'replace', path: `/root/children/${index}/props/content`, value }]
    s.ack(0, set(0, '가'))
    await s.edit(1, '나 고침')
    await waitFor(() => expect(s.patches()).toHaveLength(2))
    s.ack(1, set(1, '나'))
    // 둘을 되돌려 다시 실행 스택에 둘을 쌓는다(되돌림마다 ack 까지 기다린다).
    fireEvent.click(undoButton())
    await waitFor(() => expect(s.patches()).toHaveLength(3))
    s.ack(2, set(1, '나 고침'))
    await act(async () => {})
    fireEvent.click(undoButton())
    await waitFor(() => expect(s.patches()).toHaveLength(4))
    s.ack(3, set(0, '가 고침'))
    await waitFor(() => expect(redoButton().disabled).toBe(false))
    // 다시 실행 → 되돌리기 → 다시 실행 을 ack 전에 연타한다.
    fireEvent.click(redoButton())
    await waitFor(() => expect(s.patches()).toHaveLength(5))
    fireEvent.click(undoButton())
    fireEvent.click(redoButton())
    await act(async () => {})
    s.ack(4, set(0, '가'))
    await waitFor(() => expect(s.patches()).toHaveLength(6))
    s.ack(5, set(0, '가 고침'))
    await waitFor(() => expect(s.patches()).toHaveLength(7))
    // 누른 차례(다시 실행 · 되돌리기 · 다시 실행)대로 셋이 나갔고 버려진 것이 없다.
    expect({
      values: s
        .patches()
        .slice(4)
        .map((p) => (p.ops[0] as { value?: string }).value),
      alert: alerts(),
    }).toEqual({ values: ['가 고침', '가', '가 고침'], alert: '' })
  })
})
