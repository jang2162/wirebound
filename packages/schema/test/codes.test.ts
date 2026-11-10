import { describe, expect, it } from 'vitest'
import {
  CODE_GROUPS_MAX,
  CODE_ITEMS_MAX,
  CODE_NAME_MAX,
  CODE_VALUE_MAX,
  CodeKeySchema,
  CodeNameSchema,
  CodeTableSchema,
  CodeValueSchema,
} from '../src/codes'

const RLO = String.fromCodePoint(0x202e)
const LS = String.fromCodePoint(0x2028)

describe('공통코드 글자 규칙', () => {
  it('키는 대문자로 시작하는 대문자 · 숫자 · 밑줄 40자까지다', () => {
    for (const key of ['ORDER_STATUS', 'A', 'A1_B', 'A'.repeat(40)]) expect(CodeKeySchema.safeParse(key).success, key).toBe(true)
    for (const key of ['order_status', '1A', 'A-B', '_A', '', 'A'.repeat(41), 'A B']) {
      expect(CodeKeySchema.safeParse(key).success, key).toBe(false)
    }
  })

  it('코드값은 1 ~ 40자이고 별칭이 받지 않는 글자를 거절한다', () => {
    for (const value of ['WAIT', '01', '결제', 'x'.repeat(CODE_VALUE_MAX)])
      expect(CodeValueSchema.safeParse(value).success, value).toBe(true)
    for (const value of ['', 'x'.repeat(CODE_VALUE_MAX + 1), `A${RLO}B`, `A${LS}B`, ' A', 'A ', '​']) {
      expect(CodeValueSchema.safeParse(value).success, JSON.stringify(value)).toBe(false)
    }
  })

  it('이름은 1 ~ 60자이고 같은 표로 거절한다', () => {
    expect(CodeNameSchema.safeParse('결제 대기').success).toBe(true)
    expect(CodeNameSchema.safeParse('가'.repeat(CODE_NAME_MAX)).success).toBe(true)
    expect(CodeNameSchema.safeParse('가'.repeat(CODE_NAME_MAX + 1)).success).toBe(false)
    expect(CodeNameSchema.safeParse(`결제${RLO}대기`).success).toBe(false)
    expect(CodeNameSchema.safeParse('').success).toBe(false)
  })

  it('표는 같은 키 둘 · 한 그룹 안 같은 값 둘을 거절한다', () => {
    const item = { value: 'WAIT', name: '대기', active: true }
    expect(CodeTableSchema.safeParse([{ key: 'A', name: '가', items: [item] }]).success).toBe(true)
    expect(
      CodeTableSchema.safeParse([
        { key: 'A', name: '가', items: [] },
        { key: 'A', name: '나', items: [] },
      ]).success,
    ).toBe(false)
    expect(CodeTableSchema.safeParse([{ key: 'A', name: '가', items: [item, { ...item, name: '다른' }] }]).success).toBe(false)
    // 다른 그룹의 같은 값은 겹침이 아니다.
    expect(
      CodeTableSchema.safeParse([
        { key: 'A', name: '가', items: [item] },
        { key: 'B', name: '나', items: [item] },
      ]).success,
    ).toBe(true)
  })

  it('표는 상한을 넘는 항목 · 그룹을 거절한다', () => {
    const items = Array.from({ length: CODE_ITEMS_MAX + 1 }, (_, i) => ({ value: `V${i}`, name: `이름${i}`, active: true }))
    expect(CodeTableSchema.safeParse([{ key: 'A', name: '가', items }]).success).toBe(false)
    expect(CodeTableSchema.safeParse([{ key: 'A', name: '가', items: items.slice(0, CODE_ITEMS_MAX) }]).success).toBe(true)
    const groups = Array.from({ length: CODE_GROUPS_MAX + 1 }, (_, i) => ({ key: `G${i}`, name: `그룹${i}`, items: [] }))
    expect(CodeTableSchema.safeParse(groups).success).toBe(false)
  })
})
