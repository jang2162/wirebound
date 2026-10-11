/**
 * 별칭을 고치는 연산(`aliasOps`) — 노드 봉투의 `alias` 필드에 `add` · `replace` · `remove` 하나. 지은 연산을 적용한 문서는 늘 봉투를
 * 지난다(화면은 봉투가 거절할 값을 보내지 않는다).
 */
import { describe, expect, it } from 'vitest'
import { WbNodeSchema, applyOps, type PageDocument } from '@wirebound/schema'
import { aliasOps } from '../../src/edit/ops'

function doc(alias?: string): PageDocument {
  return {
    version: 1,
    root: {
      id: 'n-root',
      type: 'Page',
      children: [{ id: 'n-1', type: 'Button', ...(alias === undefined ? {} : { alias }), props: { label: '저장' } }],
    },
  }
}

const PATH = '/root/children/0/alias'

describe('aliasOps', () => {
  it('없던 별칭은 `add`', () => {
    expect(aliasOps(doc(), 'n-1', '머리 저장')).toEqual([{ op: 'add', path: PATH, value: '머리 저장' }])
  })

  it('있던 별칭은 `replace`', () => {
    expect(aliasOps(doc('옛 이름'), 'n-1', '새 이름')).toEqual([{ op: 'replace', path: PATH, value: '새 이름' }])
  })

  it('빈 값 · 공백만 · `null` 은 `remove` — 없으면 `null`', () => {
    expect(aliasOps(doc('옛 이름'), 'n-1', '')).toEqual([{ op: 'remove', path: PATH }])
    expect(aliasOps(doc('옛 이름'), 'n-1', '   ')).toEqual([{ op: 'remove', path: PATH }])
    expect(aliasOps(doc('옛 이름'), 'n-1', null)).toEqual([{ op: 'remove', path: PATH }])
    expect(aliasOps(doc(), 'n-1', '')).toBeNull()
  })

  it('같은 값이면 `null` — 앞뒤 공백만 다른 것도 같다', () => {
    expect(aliasOps(doc('저장'), 'n-1', '저장')).toBeNull()
    expect(aliasOps(doc('저장'), 'n-1', '  저장  ')).toBeNull()
  })

  it('없는 노드면 `null`', () => {
    expect(aliasOps(doc(), 'n-none', '이름')).toBeNull()
  })

  it('앞뒤 공백을 걷고 · 줄바꿈 · 탭은 공백 하나로 · 60자에서 자른다', () => {
    expect(aliasOps(doc(), 'n-1', '  저장  ')).toEqual([{ op: 'add', path: PATH, value: '저장' }])
    expect(aliasOps(doc(), 'n-1', '저장\n\t버튼')).toEqual([{ op: 'add', path: PATH, value: '저장 버튼' }])
    expect(aliasOps(doc(), 'n-1', '가'.repeat(61))).toEqual([{ op: 'add', path: PATH, value: '가'.repeat(60) }])
    // 자른 끝이 공백이면 그것도 걷는다 — 봉투는 뒤 공백을 안 받는다.
    expect(aliasOps(doc(), 'n-1', `${'가'.repeat(59)} 나`)).toEqual([{ op: 'add', path: PATH, value: '가'.repeat(59) }])
    expect(aliasOps(doc(), 'n-1', '😀'.repeat(61))).toEqual([{ op: 'add', path: PATH, value: '😀'.repeat(60) }])
  })

  it('보이는 글자가 없으면 빈 값과 같다 — 있던 별칭은 `remove`, 없으면 `null`', () => {
    expect(aliasOps(doc('옛 이름'), 'n-1', '\u200b')).toEqual([{ op: 'remove', path: PATH }])
    expect(aliasOps(doc(), 'n-1', '\u202e\u200b')).toBeNull()
  })

  it.each([
    '저장',
    ' 저장 ',
    '저장\n버튼',
    '가'.repeat(80),
    '😀'.repeat(70),
    '<script>alert(1)</script>',
    `${'가'.repeat(59)} 나`,
    '저장\u0085버튼',
    'a\u202eb',
    'a\ud800b',
    '\u200b가',
  ])('지은 연산을 적용한 노드는 봉투를 지난다 — %j', (value) => {
    const ops = aliasOps(doc(), 'n-1', value)
    expect(ops).not.toBeNull()
    const after = applyOps(doc(), ops!)
    expect(WbNodeSchema.safeParse(after.root).success).toBe(true)
  })
})
