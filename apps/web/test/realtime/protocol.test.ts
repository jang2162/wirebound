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
      { type: 'restored', projectId: 'p', snapshotId: 's' },
      { type: 'pong' },
      PATCH_ACK,
      PATCH_ERROR,
    ].map((frame) => parseServerFrame(JSON.stringify(frame))?.type)

    expect(read).toEqual(['joined', 'presence', 'page-changed', 'restored', 'pong', 'patch-ack', 'patch-error'])
  })

  it('theme-changed 의 값을 그대로 옮긴다 — 토큰 값이 글자 · 수가 아니면 프레임을 버린다', () => {
    const frame = {
      type: 'theme-changed',
      projectId: 'p',
      themeId: 'sample',
      version: '1.0.0',
      tokens: { 'color.accent': '#e11d48', 'radius.md': 4 },
      rev: 3,
    }
    expect(parseServerFrame(JSON.stringify(frame))).toEqual(frame)
    expect(parseServerFrame(JSON.stringify({ ...frame, tokens: { 'color.accent': { evil: true } } }))).toBeNull()
    expect(parseServerFrame(JSON.stringify({ ...frame, rev: '3' }))).toBeNull()
    const { themeId: _omitted, ...withoutTheme } = frame
    expect(parseServerFrame(JSON.stringify(withoutTheme))).toBeNull()
  })

  it('restored 의 안전망 스냅샷 id 를 옮긴다 — 글자가 아니면 키를 안 만든다', () => {
    const base = { type: 'restored', projectId: 'p', snapshotId: 's' }

    expect(parseServerFrame(JSON.stringify({ ...base, safetySnapshotId: 's9' }))).toEqual({ ...base, safetySnapshotId: 's9' })
    expect(parseServerFrame(JSON.stringify({ ...base, safetySnapshotId: 9 }))).toEqual(base)
  })

  /**
   * **서버는 방송 프레임에 `actor`(낸 사람 · 토큰 이름)를 안 싣는다**(서버 `ws/protocol.ts`의 `ServerFrame` 머리말). 그래서 파서는
   * `actor` 없는 프레임을 읽어야 하고, 옛 서버가 실어 보낸 `actor`는 꼴이 무엇이든 프레임을 버리지 않고 옮기지도 않는다 — 읽는 자리가 없다.
   */
  it.each([
    ['page-changed', PAGE_CHANGED],
    ['restored', { type: 'restored', projectId: 'p', snapshotId: 's' }],
    [
      'theme-changed',
      { type: 'theme-changed', projectId: 'p', themeId: 'sample', version: '1.0.0', tokens: { 'color.accent': '#e11d48' }, rev: 3 },
    ],
    ['menu-changed', { type: 'menu-changed', projectId: 'p', rev: 4 }],
  ])('%s 는 actor 없이 읽고 · 옛 서버의 actor 는 프레임을 안 버리고 안 옮긴다', (_type, frame) => {
    expect(parseServerFrame(JSON.stringify(frame))).toEqual(frame)
    for (const actor of [{ type: 'mcp', label: '내 에이전트 자격' }, 'cli', null]) {
      const parsed = parseServerFrame(JSON.stringify({ ...frame, actor }))
      expect(parsed).toEqual(frame)
      expect(parsed).not.toHaveProperty('actor')
    }
  })

  it('page-stale 은 프로젝트 · 페이지 id 와 seq 힌트만 옮긴다 — 모르는 필드(actor)는 버리고, 페이지 id 가 없으면 프레임을 버린다', () => {
    const base = { type: 'page-stale', projectId: 'p', pageId: 'g' }

    expect(parseServerFrame(JSON.stringify(base))).toEqual(base)
    // 서버가 나중에 더한 필드가 이 갈래를 깨지 않는다. `seq` 는 힌트라 그대로 옮긴다(받는 쪽이 비교에만 쓴다).
    expect(parseServerFrame(JSON.stringify({ ...base, seq: 9, actor: { type: 'user', label: '홍' }, extra: true }))).toEqual({
      ...base,
      seq: 9,
    })
    expect(parseServerFrame(JSON.stringify({ ...base, seq: 0 }))).toEqual({ ...base, seq: 0 })
    expect(parseServerFrame(JSON.stringify({ type: 'page-stale', projectId: 'p' }))).toBeNull()
    expect(parseServerFrame(JSON.stringify({ ...base, pageId: 7 }))).toBeNull()
    expect(parseServerFrame(JSON.stringify({ type: 'page-stale', pageId: 'g' }))).toBeNull()
  })

  it('page-stale 의 어긋난 seq 힌트는 힌트만 버린다 — 프레임은 살아 경보가 지금처럼 선다', () => {
    const base = { type: 'page-stale', projectId: 'p', pageId: 'g' }

    for (const seq of ['9', -1, 1.5, null, true, {}]) {
      expect(parseServerFrame(JSON.stringify({ ...base, seq }))).toEqual(base)
    }
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
    const frame = parseServerFrame(JSON.stringify({ type: 'joined', projectId: 'p', connectionId: 'wsc_1', userId: 'u', role: 'owner' }))

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
  it.each(['projectId', 'pageId', 'seq', 'ops', 'warnings'])('page-changed에서 %s가 없으면 null이다', (missing) => {
    const broken: Record<string, unknown> = { ...PAGE_CHANGED }
    delete broken[missing]

    expect(parseServerFrame(JSON.stringify(broken))).toBeNull()
  })

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

describe('잠금 프레임 (설계서 「소프트 잠금」)', () => {
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

  /** 혼자 죽는 변조: 거절을 읽을 때 `nodeIds`를 안 본다(어느 노드의 거절인지 모르는 프레임이 잠금 통로에 닿는다). */
  it('거절(`lock-denied`)은 받지 않은 노드들을 싣고 온다 — 없거나 비었거나 글자가 아닌 것이 섞이면 버린다', () => {
    expect(
      parseServerFrame(JSON.stringify({ type: 'lock-denied', projectId: 'p', pageId: 'g', nodeIds: ['n_b', 'n_c'], lockId: 3 })),
    ).toEqual({
      type: 'lock-denied',
      projectId: 'p',
      pageId: 'g',
      nodeIds: ['n_b', 'n_c'],
      lockId: 3,
    })
    expect(parseServerFrame(JSON.stringify({ type: 'lock-denied', projectId: 'p', pageId: 'g', lockId: 3 }))).toBeNull()
    expect(parseServerFrame(JSON.stringify({ type: 'lock-denied', projectId: 'p', pageId: 'g', nodeIds: [], lockId: 3 }))).toBeNull()
    expect(
      parseServerFrame(JSON.stringify({ type: 'lock-denied', projectId: 'p', pageId: 'g', nodeIds: ['n_b', 4], lockId: 3 })),
    ).toBeNull()
    // 옛 모양(`nodeId` 하나)은 서버가 더 내지 않는다 — 읽지 않는다.
    expect(parseServerFrame(JSON.stringify({ type: 'lock-denied', projectId: 'p', pageId: 'g', nodeId: 'n_b', lockId: 3 }))).toBeNull()
  })

  /** 혼자 죽는 변조: 거절을 읽을 때 `lockId`를 안 본다(어느 `lock`의 거절인지 모르는 프레임이 통로에 닿는다). */
  it('거절은 어느 `lock`의 것인지(`lockId`)를 싣고 온다 — 없으면 버린다', () => {
    expect(parseServerFrame(JSON.stringify({ type: 'lock-denied', projectId: 'p', pageId: 'g', nodeIds: ['n_b'] }))).toBeNull()
  })

  it('잡는 프레임이 서버가 요구하는 것을 싣는다 — 노드 집합과 거절과 짝지을 차례까지', () => {
    expect(JSON.parse(lockFrame('g', ['n_b', 'n_c'], 7))).toEqual({ type: 'lock', pageId: 'g', nodeIds: ['n_b', 'n_c'], lockId: 7 })
  })

  it('놓는 프레임에는 가리킬 값이 없다 — 이 연결의 집합 전부를 놓는다', () => {
    expect(JSON.parse(UNLOCK_FRAME)).toEqual({ type: 'unlock' })
  })
})

describe('멤버십 프레임', () => {
  /**
   * 혼자 죽는 변조: 파서가 `projectId`를 안 본다. 역할 값이 실려 와도 옮기지 않는다 — 역할은 `getProject` 하나에서 읽는다
   * (`joined`의 `role`과 같은 까닭).
   */
  it('projectId 만 옮긴다 — 실려 온 역할은 버리고, projectId 가 없으면 프레임째 버린다', () => {
    expect(parseServerFrame(JSON.stringify({ type: 'membership-changed', projectId: 'p', role: 'viewer' }))).toEqual({
      type: 'membership-changed',
      projectId: 'p',
    })
    expect(parseServerFrame(JSON.stringify({ type: 'membership-changed' }))).toBeNull()
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
