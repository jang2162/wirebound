// @vitest-environment node
/**
 * **소켓에서 온 문자열은 신뢰할 수 없는 입력이다.** 서버가 보내는 것만 오는 것이 아니라
 * (프록시·확장·낡은 서버) 모양이 어긋난 것도 온다. 어긋난 것이 그대로 흘러 들어가면
 * `headSeq`가 `undefined`가 되고, 그 어긋남은 **다음 편집이 400을 받을 때까지 조용하다.**
 */
import { describe, expect, it } from 'vitest'
import { UNLOCK_FRAME, lockFrame, parseServerFrame, patchFrame, realtimeUrl } from '../../src/realtime/protocol'

const PAGE_CHANGED = {
  type: 'page-changed',
  projectId: 'p',
  pageId: 'g',
  seq: 7,
  ops: [{ op: 'remove', path: '/root/children/0' }],
  warnings: [],
  actor: { type: 'user', label: '홍길동' },
}

const PATCH_ACK = {
  type: 'patch-ack',
  projectId: 'p',
  pageId: 'g',
  clientOpId: 'op_1',
  seq: 8,
  revisionId: 'rev_8',
  inverse: [{ op: 'remove', path: '/root/children/0' }],
  warnings: [],
}

const PATCH_ERROR = {
  type: 'patch-error',
  projectId: 'p',
  pageId: 'g',
  clientOpId: 'op_1',
  status: 409,
  code: 'conflict',
  message: '페이지가 이미 변경되었습니다 (요청 baseSeq 4, 현재 7)',
  issues: [],
}

describe('읽는 것', () => {
  it('일곱 갈래를 전부 읽는다', () => {
    const read = [
      { type: 'joined', projectId: 'p', connectionId: 'wsc_1', userId: 'u', role: 'owner' },
      { type: 'presence', projectId: 'p', participants: [{ connectionId: 'wsc_1', userId: 'u', userName: '홍' }] },
      PAGE_CHANGED,
      { type: 'restored', projectId: 'p', snapshotId: 's', actor: { type: 'user', label: '홍길동' } },
      { type: 'pong' },
      PATCH_ACK,
      PATCH_ERROR,
    ].map((frame) => parseServerFrame(JSON.stringify(frame))?.type)

    expect(read).toEqual([
      'joined',
      'presence',
      'page-changed',
      'restored',
      'pong',
      'patch-ack',
      'patch-error',
    ])
  })

  it('patch-ack의 값을 그대로 옮긴다 — undo 스택이 이것을 든다', () => {
    expect(parseServerFrame(JSON.stringify(PATCH_ACK))).toEqual(PATCH_ACK)
  })

  it('patch-error의 봉투를 그대로 옮긴다 — 화면이 REST와 같은 규칙으로 읽는다', () => {
    expect(parseServerFrame(JSON.stringify(PATCH_ERROR))).toEqual(PATCH_ERROR)
  })

  it('page-changed의 값을 그대로 옮긴다', () => {
    expect(parseServerFrame(JSON.stringify(PAGE_CHANGED))).toEqual(PAGE_CHANGED)
  })

  /**
   * **`clientOpId`는 있을 때만 온다.** 이것을 안 읽으면 자기 편집이 되돌아온 것을 알아볼 수
   * 없고, 리베이스가 그것을 두 번 얹는다(`store/editor-store.ts`의 되받기 창).
   */
  it('page-changed의 clientOpId를 읽는다 — 있을 때만', () => {
    expect(parseServerFrame(JSON.stringify({ ...PAGE_CHANGED, clientOpId: 'op_1' }))).toEqual({
      ...PAGE_CHANGED,
      clientOpId: 'op_1',
    })
    // **없으면 키 자체가 없다** — `undefined`가 담기면 받는 쪽의 대조가 흔들린다.
    expect(Object.keys(parseServerFrame(JSON.stringify(PAGE_CHANGED)) ?? {})).not.toContain('clientOpId')
  })

  it('joined에서 role은 읽지 않는다 — 역할 판정은 한 자리다', () => {
    const frame = parseServerFrame(
      JSON.stringify({ type: 'joined', projectId: 'p', connectionId: 'wsc_1', userId: 'u', role: 'owner' }),
    )

    expect(frame).toEqual({ type: 'joined', projectId: 'p', connectionId: 'wsc_1', userId: 'u' })
  })
})

describe('안 읽는 것', () => {
  it('JSON이 아니면 null이다', () => {
    expect(parseServerFrame('{ 이것은 JSON이 아니다')).toBeNull()
  })

  it('객체가 아니면 null이다', () => {
    expect(parseServerFrame('"page-changed"')).toBeNull()
    expect(parseServerFrame('null')).toBeNull()
    expect(parseServerFrame('12')).toBeNull()
  })

  it('모르는 type은 null이다 — 던지지 않는다', () => {
    expect(parseServerFrame(JSON.stringify({ type: 'locked', nodeId: 'n_1' }))).toBeNull()
  })

  /**
   * **필드마다 하나씩 뺀 판을 만든다.** 하나로 뭉뚱그리면 어느 필드 검사를 지워도
   * 케이스가 살아남는다.
   */
  it.each(['projectId', 'pageId', 'seq', 'ops', 'warnings', 'actor'])(
    'page-changed에서 %s가 없으면 null이다',
    (missing) => {
      const broken: Record<string, unknown> = { ...PAGE_CHANGED }
      delete broken[missing]

      expect(parseServerFrame(JSON.stringify(broken))).toBeNull()
    },
  )

  it('seq가 문자열이면 null이다 — 타입도 본다', () => {
    expect(parseServerFrame(JSON.stringify({ ...PAGE_CHANGED, seq: '7' }))).toBeNull()
  })

  /**
   * **`clientOpId`가 빠진 ack가 흘러 들어가면 안 된다.** 짝지을 수 없는 ack는
   * `undefined`를 키로 in-flight를 뒤지게 되고, 그러면 엉뚱한 편집이 성공으로 처리된다.
   */
  it.each(['projectId', 'pageId', 'clientOpId', 'seq', 'revisionId', 'inverse', 'warnings'])(
    'patch-ack에서 %s가 없으면 null이다',
    (missing) => {
      const broken: Record<string, unknown> = { ...PATCH_ACK }
      delete broken[missing]

      expect(parseServerFrame(JSON.stringify(broken))).toBeNull()
    },
  )

  it.each(['projectId', 'pageId', 'clientOpId', 'status', 'code', 'message', 'issues'])(
    'patch-error에서 %s가 없으면 null이다',
    (missing) => {
      const broken: Record<string, unknown> = { ...PATCH_ERROR }
      delete broken[missing]

      expect(parseServerFrame(JSON.stringify(broken))).toBeNull()
    },
  )
})

describe('보내는 것', () => {
  it('patch 프레임에 서버가 요구하는 것을 전부 싣는다', () => {
    const raw = patchFrame({
      pageId: 'g',
      baseSeq: 4,
      ops: [{ op: 'remove', path: '/root/children/0' }],
      clientOpId: 'op_1',
    })

    expect(JSON.parse(raw)).toEqual({
      type: 'patch',
      pageId: 'g',
      baseSeq: 4,
      ops: [{ op: 'remove', path: '/root/children/0' }],
      clientOpId: 'op_1',
    })
  })
})

describe('잠금 프레임 (§7.2)', () => {
  const LOCK = { pageId: 'g', nodeId: 'n_b', userId: 'u_1', userName: '보라' }

  it('목록을 그대로 읽는다', () => {
    const frame = parseServerFrame(JSON.stringify({ type: 'locks', projectId: 'p', locks: [LOCK] }))

    expect(frame).toEqual({ type: 'locks', projectId: 'p', locks: [LOCK] })
  })

  it('빈 목록도 프레임이다 — *"아무도 안 잡고 있다"*가 뜻이 있다', () => {
    expect(parseServerFrame(JSON.stringify({ type: 'locks', projectId: 'p', locks: [] }))).toEqual({
      type: 'locks',
      projectId: 'p',
      locks: [],
    })
  })

  it('모양이 어긋난 원소를 버린다 — 배지가 `undefined`를 그리지 않는다', () => {
    const frame = parseServerFrame(
      JSON.stringify({
        type: 'locks',
        projectId: 'p',
        locks: [LOCK, { pageId: 'g', nodeId: 'n_c' }, null, { ...LOCK, userName: 7 }],
      }),
    )

    expect(frame).toEqual({ type: 'locks', projectId: 'p', locks: [LOCK] })
  })

  it('목록이 배열이 아니면 프레임 자체를 버린다', () => {
    expect(parseServerFrame(JSON.stringify({ type: 'locks', projectId: 'p', locks: {} }))).toBeNull()
  })

  it('잡는 프레임이 서버가 요구하는 것을 싣는다', () => {
    expect(JSON.parse(lockFrame('g', 'n_b'))).toEqual({ type: 'lock', pageId: 'g', nodeId: 'n_b' })
  })

  it('놓는 프레임에는 가리킬 값이 없다 — 연결 하나가 드는 잠금은 하나다', () => {
    expect(JSON.parse(UNLOCK_FRAME)).toEqual({ type: 'unlock' })
  })
})

describe('주소', () => {
  it('http면 ws다', () => {
    expect(realtimeUrl('http://localhost:5173', 'p1')).toBe('ws://localhost:5173/api/projects/p1/ws')
  })

  it('https면 wss다 — 안 바꾸면 브라우저가 혼합 콘텐츠로 막는다', () => {
    expect(realtimeUrl('https://wirebound.example', 'p1')).toBe('wss://wirebound.example/api/projects/p1/ws')
  })
})
