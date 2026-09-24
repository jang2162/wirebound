// @vitest-environment node
/**
 * **편집을 WS로 내고 ack로 짝짓는 자리**(설계서 「정방향 흐름」). 소켓도 React도 없다 — 이 파일이
 * 재는 것은 *"어느 ack가 어느 편집의 것인가"*뿐이다.
 *
 * # 하나짜리로 재지 않는다
 *
 * **`clientOpId`가 하나면 짝짓기를 아예 안 해도 통과한다** — 기다리는 것이 하나뿐이니 아무
 * ack나 그것을 끝낸다. 그래서 아래 판은 **둘 이상을 매달아 두고** 그중 하나만 끝나는지 본다.
 * (편집 경로는 in-flight를 하나로 두지만, 그것을 지키는 것은 펌프 루프이지 이 파일이 아니다 —
 * 여기가 그 가정에 기대면 그 루프가 깨지는 날 **엉뚱한 편집이 성공으로 처리된다.**)
 */
import type { PatchOp } from '@wirebound/schema'
import { describe, expect, it } from 'vitest'
import { ApiError } from '../../src/api/client'
import { toFailure } from '../../src/api/failure'
import type { RealtimeLink } from '../../src/realtime/connection'
import { createEditChannel, type EditChannel } from '../../src/realtime/edit-channel'
import type { ServerFrame } from '../../src/realtime/protocol'

const OPS: PatchOp[] = [{ op: 'add', path: '/root/children/-', value: { id: 'n_x', type: 'Text', props: {} } }]

class FakeLink implements RealtimeLink {
  readonly sent: string[] = []

  open = true

  isOpen(): boolean {
    return this.open
  }

  send(payload: string): boolean {
    if (!this.open) return false
    this.sent.push(payload)
    return true
  }
}

function attached(): { channel: EditChannel; link: FakeLink } {
  const link = new FakeLink()
  const channel = createEditChannel()
  channel.attach(link)
  return { channel, link }
}

function ack(clientOpId: string, seq: number): ServerFrame {
  return {
    type: 'patch-ack',
    projectId: 'project_1',
    pageId: 'page_1',
    clientOpId,
    seq,
    revisionId: `rev_${seq}`,
    inverse: [{ op: 'remove', path: '/root/children/0' }],
    warnings: [],
  }
}

function refuse(clientOpId: string): ServerFrame {
  return {
    type: 'patch-error',
    projectId: 'project_1',
    pageId: 'page_1',
    clientOpId,
    status: 409,
    code: 'conflict',
    message: '페이지가 이미 변경되었습니다 (요청 baseSeq 4, 현재 7)',
    issues: [],
  }
}

/** 기다리는 프로미스를 만들되 unhandled rejection이 나지 않게 잡아 둔다. */
function inFlight(channel: EditChannel, clientOpId: string, baseSeq: number): Promise<unknown> {
  return channel.send({ pageId: 'page_1', clientOpId, ops: OPS, baseSeq }).catch((caught: unknown) => caught)
}

describe('붙어 있어야 낸다', () => {
  it('연결이 없으면 ready가 아니다 — 부르는 쪽이 REST로 간다', () => {
    expect(createEditChannel().ready()).toBe(false)
  })

  it('연결이 닫혀 있으면 ready가 아니다', () => {
    const { channel, link } = attached()
    link.open = false

    expect(channel.ready()).toBe(false)
  })

  it('붙어 있으면 프레임을 그대로 실어 보낸다', async () => {
    const { channel, link } = attached()

    void inFlight(channel, 'op_1', 4)

    expect(JSON.parse(link.sent[0]!)).toEqual({
      type: 'patch',
      pageId: 'page_1',
      baseSeq: 4,
      ops: OPS,
      clientOpId: 'op_1',
    })
  })

  it('닫힌 연결에 내면 그 자리에서 실패한다 — 아무것도 안 쓴다', async () => {
    const { channel, link } = attached()
    link.open = false

    const caught = await inFlight(channel, 'op_1', 4)

    expect(caught).toBeInstanceOf(Error)
    expect(link.sent).toEqual([])
  })
})

describe('ack가 자기 편집만 끝낸다', () => {
  it('둘을 매달아 두면 자기 것만 끝난다', async () => {
    const { channel } = attached()
    let firstDone = false
    const first = inFlight(channel, 'op_1', 4).then((value) => {
      firstDone = true
      return value
    })
    const second = inFlight(channel, 'op_2', 5)

    expect(channel.deliver(ack('op_2', 6))).toBe(true)

    expect(await second).toEqual({
      seq: 6,
      revisionId: 'rev_6',
      inverse: [{ op: 'remove', path: '/root/children/0' }],
      warnings: [],
    })
    expect(firstDone).toBe(false)
    // 남은 하나를 끝내 둔다 — 안 끝내면 프로미스가 매달린 채 파일이 끝난다.
    channel.deliver(ack('op_1', 7))
    await first
  })

  it('모르는 clientOpId는 아무것도 끝내지 않는다 — 늦게 온 ack가 큐를 흔들지 않는다', async () => {
    const { channel } = attached()
    let done = false
    const only = inFlight(channel, 'op_1', 4).then((value) => {
      done = true
      return value
    })

    expect(channel.deliver(ack('op_없는것', 9))).toBe(false)

    expect(done).toBe(false)
    channel.deliver(ack('op_1', 5))
    await only
  })

  it('같은 ack가 두 번 와도 두 번 끝내지 않는다', async () => {
    const { channel } = attached()
    const one = inFlight(channel, 'op_1', 4)
    channel.deliver(ack('op_1', 5))
    await one

    expect(channel.deliver(ack('op_1', 5))).toBe(false)
  })

  it('patch 프레임이 아닌 것은 채널이 손대지 않는다', () => {
    const { channel } = attached()

    expect(channel.deliver({ type: 'pong' })).toBe(false)
  })
})

describe('실패의 모양이 REST와 같다', () => {
  it('patch-error는 봉투 그대로 ApiError가 된다', async () => {
    const { channel } = attached()
    const one = inFlight(channel, 'op_1', 4)

    channel.deliver(refuse('op_1'))

    const caught = await one
    expect(caught).toBeInstanceOf(ApiError)
    expect(caught).toMatchObject({ status: 409, code: 'conflict' })
    // **화면이 읽는 문장이 REST와 같다** — `toFailure`가 두 경로를 같은 규칙으로 읽는다.
    expect(toFailure(caught, '편집을 저장하지 못했습니다')).toEqual({
      kind: 'message',
      message: '페이지가 이미 변경되었습니다 (요청 baseSeq 4, 현재 7)',
    })
  })

  it('issues가 있으면 그것이 이유가 된다 — 422의 판', async () => {
    const { channel } = attached()
    const one = inFlight(channel, 'op_1', 4)

    channel.deliver({
      type: 'patch-error',
      projectId: 'project_1',
      pageId: 'page_1',
      clientOpId: 'op_1',
      status: 422,
      code: 'validation-failed',
      message: '스키마 검증에 실패했습니다',
      issues: [{ path: '/root/children/0', message: '알 수 없는 컴포넌트 타입: 없는타입' }],
    })

    expect(toFailure(await one, '편집을 저장하지 못했습니다')).toEqual({
      kind: 'message',
      message: '알 수 없는 컴포넌트 타입: 없는타입',
    })
  })

  /**
   * **연결이 끊긴 것은 서버의 판정이 아니다.** 되세울 봉투가 없으므로 `ApiError`가 아니고,
   * 화면은 그것을 *"편집을 저장하지 못했습니다"*로 읽는다 — **REST에서 네트워크가 끊겼을
   * 때와 같은 문장**이다.
   */
  it('연결이 끊기면 기다리던 것이 전부 실패한다 — 매달아 두지 않는다', async () => {
    const { channel } = attached()
    const first = inFlight(channel, 'op_1', 4)
    const second = inFlight(channel, 'op_2', 5)

    channel.failInFlight()

    for (const caught of [await first, await second]) {
      expect(caught).not.toBeInstanceOf(ApiError)
      expect(toFailure(caught, '편집을 저장하지 못했습니다')).toEqual({
        kind: 'message',
        message: '편집을 저장하지 못했습니다',
      })
    }
  })

  it('연결을 떼도 같은 자리에서 끝난다', async () => {
    const { channel } = attached()
    const one = inFlight(channel, 'op_1', 4)

    channel.detach()

    expect(await one).toBeInstanceOf(Error)
    expect(channel.ready()).toBe(false)
  })

  it('새 연결을 붙이면 앞 연결에 매달린 것이 끝난다 — 그 ack는 영영 안 온다', async () => {
    const { channel } = attached()
    const one = inFlight(channel, 'op_1', 4)

    channel.attach(new FakeLink())

    expect(await one).toBeInstanceOf(Error)
    // 새 연결로는 그대로 낸다.
    expect(channel.ready()).toBe(true)
  })
})
