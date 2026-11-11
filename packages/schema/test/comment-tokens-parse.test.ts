import { describe, expect, it } from 'vitest'
import { formatCommentToken, parseCommentBody, type CommentSegment, type CommentTokenTarget } from '../src/index'

const PAGE = '0f8c1a52-3b9e-4d7a-9c11-2b3d4e5f6a7b'
const OTHER = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'

const joined = (segments: CommentSegment[]) => segments.map((s) => (s.type === 'text' ? s.text : s.raw)).join('')

function roundTrip(body: string): CommentSegment[] {
  const segments = parseCommentBody(body)
  expect(joined(segments)).toBe(body)
  return segments
}

describe('parseCommentBody', () => {
  const targets: CommentTokenTarget[] = [
    { kind: 'page', pageId: PAGE },
    { kind: 'comment', pageId: PAGE, nodeId: 'n_abc-01' },
    { kind: 'code', group: 'STATUS' },
    { kind: 'code', group: 'STATUS', item: 'ACTIVE' },
  ]

  it.each(targets)('종류마다 왕복한다 — %o', (target) => {
    const raw = formatCommentToken('회원 목록 #3', target)
    expect(roundTrip(raw)).toEqual([{ type: 'token', label: '회원 목록 #3', target, raw }])
  })

  it('한 본문의 토큰 여럿과 사이 글 · 줄바꿈', () => {
    const a = formatCommentToken('회원 목록', { kind: 'page', pageId: PAGE })
    const b = formatCommentToken('#3', { kind: 'comment', pageId: OTHER, nodeId: 'btn' })
    const body = `앞 ${a} 가운데\n줄 ${b}${b}\n끝`
    const segments = roundTrip(body)
    expect(segments.map((s) => s.type)).toEqual(['text', 'token', 'text', 'token', 'token', 'text'])
    expect(segments[0]).toEqual({ type: 'text', text: '앞 ' })
    expect(segments[2]).toEqual({ type: 'text', text: ' 가운데\n줄 ' })
    expect(segments[5]).toEqual({ type: 'text', text: '\n끝' })
  })

  // Review Focus 3 — 토큰처럼 생긴 보통 글은 원문 그대로 글 조각 하나다.
  it.each([
    '[링크](https://example.com)',
    '[a](wb:)',
    '닫히지 않은 [ 대괄호',
    'wb:page/' + PAGE,
    '[a](wb:page/' + PAGE,
    '[a](wb:unknown/x)',
    '[a] (wb:page/' + PAGE + ')',
    '[a](wb:page/' + PAGE + ' )',
    '[줄\n바꿈](wb:page/' + PAGE + ')',
  ])('보통 글 — %j', (body) => {
    expect(roundTrip(body)).toEqual([{ type: 'text', text: body }])
  })

  it('중첩 [ 뒤의 토큰은 산다', () => {
    const raw = formatCommentToken('A', { kind: 'page', pageId: PAGE })
    const segments = roundTrip(`[[x ${raw}`)
    expect(segments).toEqual([
      { type: 'text', text: '[[x ' },
      { type: 'token', label: 'A', target: { kind: 'page', pageId: PAGE }, raw },
    ])
  })

  it('글에 ] · \\ 가 든 라벨이 왕복한다', () => {
    for (const label of ['a]b', 'a\\b', 'a\\]b', '끝\\', '[x]', ']']) {
      const raw = formatCommentToken(label, { kind: 'code', group: 'G' })
      const [segment] = roundTrip(`${raw}`)
      expect(segment).toMatchObject({ type: 'token', label })
    }
  })

  it('/ · 공백 · ) · ( · % 가 든 코드값이 왕복한다', () => {
    for (const item of ['A/B', 'A B', 'x)y', '(괄호)', '100%', '한글 값']) {
      const target: CommentTokenTarget = { kind: 'code', group: 'G', item }
      const raw = formatCommentToken('글', target)
      expect(raw).not.toMatch(/\(wb:code\/G\/.*[ )(].*\)$/u)
      expect(roundTrip(`앞 ${raw} 뒤`)[1]).toEqual({ type: 'token', label: '글', target, raw })
    }
  })

  it('라벨의 줄바꿈은 공백으로 적는다 — 줄바꿈 라벨은 토큰이 아니다', () => {
    const raw = formatCommentToken('두\n줄', { kind: 'page', pageId: PAGE })
    expect(roundTrip(raw)[0]).toMatchObject({ type: 'token', label: '두 줄' })
  })

  it.each([
    `[a](wb:page/not-a-uuid)`,
    `[a](wb:comment/not-a-uuid/n1)`,
    `[a](wb:comment/${PAGE}/bad id)`,
    `[a](wb:comment/${PAGE}/${'x'.repeat(65)})`,
    `[a](wb:comment/${PAGE})`,
    `[a](wb:comment/${PAGE}/n1/extra)`,
    `[a](wb:page/${PAGE}/extra)`,
    `[a](wb:code/lower)`,
    `[a](wb:code/G/)`,
    `[a](wb:code/G/%E0%A4%A)`,
    `[a](wb:code/G/a/b)`,
  ])('꼴이 깨진 대상은 토큰이 아니다 — %s', (body) => {
    expect(roundTrip(body)).toEqual([{ type: 'text', text: body }])
  })

  it('빈 본문 · 토큰 없는 본문', () => {
    expect(parseCommentBody('')).toEqual([])
    expect(roundTrip('그냥 글')).toEqual([{ type: 'text', text: '그냥 글' }])
  })
})
