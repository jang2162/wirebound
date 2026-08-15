// @vitest-environment node
/**
 * **소켓에서 온 문자열은 신뢰할 수 없는 입력이다.** 서버가 보내는 것만 오는 것이 아니라
 * (프록시·확장·낡은 서버) 모양이 어긋난 것도 온다. 어긋난 것이 그대로 흘러 들어가면
 * `headSeq`가 `undefined`가 되고, 그 어긋남은 **다음 편집이 400을 받을 때까지 조용하다.**
 */
import { describe, expect, it } from 'vitest'
import { parseServerFrame, realtimeUrl } from '../../src/realtime/protocol'

const PAGE_CHANGED = {
  type: 'page-changed',
  projectId: 'p',
  pageId: 'g',
  seq: 7,
  ops: [{ op: 'remove', path: '/root/children/0' }],
  warnings: [],
  actor: { type: 'user', label: '홍길동' },
}

describe('읽는 것', () => {
  it('다섯 갈래를 전부 읽는다', () => {
    const read = [
      { type: 'joined', projectId: 'p', connectionId: 'wsc_1', userId: 'u', role: 'owner' },
      { type: 'presence', projectId: 'p', participants: [{ connectionId: 'wsc_1', userId: 'u', userName: '홍' }] },
      PAGE_CHANGED,
      { type: 'restored', projectId: 'p', snapshotId: 's', actor: { type: 'user', label: '홍길동' } },
      { type: 'pong' },
    ].map((frame) => parseServerFrame(JSON.stringify(frame))?.type)

    expect(read).toEqual(['joined', 'presence', 'page-changed', 'restored', 'pong'])
  })

  it('page-changed의 값을 그대로 옮긴다', () => {
    expect(parseServerFrame(JSON.stringify(PAGE_CHANGED))).toEqual(PAGE_CHANGED)
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
})

describe('주소', () => {
  it('http면 ws다', () => {
    expect(realtimeUrl('http://localhost:5173', 'p1')).toBe('ws://localhost:5173/api/projects/p1/ws')
  })

  it('https면 wss다 — 안 바꾸면 브라우저가 혼합 콘텐츠로 막는다', () => {
    expect(realtimeUrl('https://wirebound.example', 'p1')).toBe('wss://wirebound.example/api/projects/p1/ws')
  })
})
