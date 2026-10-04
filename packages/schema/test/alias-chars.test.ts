/**
 * 별칭으로 받지 않는 글자(`packages/schema/src/alias.ts` 머리말의 표) — 봉투는 거절하고 화면의 다듬기(`tidyAlias`)는 걷고,
 * 둘이 한 벌을 읽는다.
 */
import { describe, expect, it } from 'vitest'
import { WbNodeSchema } from '../src/envelope'
import { readNodesEnvelope } from '../src/clipboard'
import { nodeAlias, nodeRowLabel, tidyAlias } from '../src/index'

const accepts = (alias: string) => WbNodeSchema.safeParse({ id: 'n_000000000001', type: 'Button', alias }).success

const DIRECTION_CONTROLS: Array<[string, string]> = [
  ['U+061C ALM', '\u061c'],
  ['U+200E LRM', '\u200e'],
  ['U+200F RLM', '\u200f'],
  ['U+202A LRE', '\u202a'],
  ['U+202B RLE', '\u202b'],
  ['U+202C PDF', '\u202c'],
  ['U+202D LRO', '\u202d'],
  ['U+202E RLO', '\u202e'],
  ['U+2066 LRI', '\u2066'],
  ['U+2067 RLI', '\u2067'],
  ['U+2068 FSI', '\u2068'],
  ['U+2069 PDI', '\u2069'],
]

describe('봉투 — 받지 않는 글자', () => {
  it.each([
    ['C1 NEL(U+0085)', 'a\u0085b'],
    ['C1 CSI(U+009B)', 'a\u009b31mb'],
    ['C1 첫 글자(U+0080)', 'a\u0080b'],
    ['C1 끝 글자(U+009F)', 'a\u009fb'],
    ['DEL', 'a\u007fb'],
    ['문단 구분자(U+2029)', 'a\u2029b'],
    ['ESC', 'a\u001b[31mb'],
    ...DIRECTION_CONTROLS.map(([name, ch]): [string, string] => [`방향 제어 ${name}`, `a${ch}b`]),
    ['외짝 서로게이트(앞)', 'a\ud800'],
    ['외짝 서로게이트(뒤)', '\udc00a'],
    ['거꾸로 선 서로게이트 쌍', 'a\ude00\ud83db'],
  ])('%s를 거부한다', (_label, alias) => {
    expect(accepts(alias)).toBe(false)
  })

  it.each([
    ['폭 없는 공백만(U+200B)', '\u200b'],
    ['폭 없는 글자 다섯', '\u200b\u200c\u200d\u2060\ufeff'],
    ['폭 없는 글자 사이의 공백', '\u200b \u200b'],
    ['BOM 만', '\ufeff'],
  ])('보이는 글자가 없으면 거부한다 — %s', (_label, alias) => {
    expect(accepts(alias)).toBe(false)
  })

  it.each([
    ['ZWJ 로 이은 이모지', '👨\u200d👩\u200d👧'],
    ['보이는 글 사이의 폭 없는 공백', 'a\u200bb'],
    ['안쪽 NBSP', '저장\u00a0버튼'],
    ['RTL 글', 'زر الحفظ'],
    ['서로게이트 쌍(이모지)', '😀'],
  ])('%s는 받는다', (_label, alias) => {
    expect(accepts(alias)).toBe(true)
  })

  it('클립보드 봉투도 같은 판정이다 — 방향 제어 글자가 든 별칭의 노드 묶음은 «봉투 아님»', () => {
    const text = JSON.stringify({ wirebound: 'nodes', version: 1, nodes: [{ id: 'a', type: 'Button', alias: 'a\u202eb' }] })
    expect(readNodesEnvelope(text)).toBeNull()
  })
})

describe('tidyAlias — 화면이 보낼 값', () => {
  it.each([
    ['줄을 바꾸는 글자는 공백 하나로', '저장\n\t버튼', '저장 버튼'],
    ['C1 도 공백으로', '저장\u0085버튼', '저장 버튼'],
    ['방향 제어 글자는 뺀다', 'a\u202eb\u2066c\u2069', 'abc'],
    ['외짝 서로게이트는 뺀다', 'a\ud800b\udc00', 'ab'],
    ['서로게이트 쌍은 그대로', '😀저장', '😀저장'],
    ['앞뒤 공백을 걷는다', '  저장  ', '저장'],
    ['보이는 글자가 없으면 빈 값', '\u200b \u2060', ''],
    ['방향 제어 글자만이면 빈 값', '\u202e\u200f', ''],
    ['60자에서 자르고 끝 공백을 다시 걷는다', `${'가'.repeat(59)} 나`, '가'.repeat(59)],
    ['자른 앞이 보이지 않는 글자뿐이면 빈 값', `${'\u200b'.repeat(60)}가`, ''],
  ])('%s', (_label, input, expected) => {
    expect(tidyAlias(input)).toBe(expected)
  })

  it('봉투와 한 벌이다 — 기본 다국어 평면의 글자 하나를 끼운 `a?b` 를 봉투가 받는 것과 다듬기가 그대로 두는 것이 같다', () => {
    const split: string[] = []
    for (let code = 0; code <= 0xffff; code += 1) {
      const value = `a${String.fromCharCode(code)}b`
      if (accepts(value) !== (tidyAlias(value) === value)) split.push(code.toString(16))
    }
    expect(split).toEqual([])
  })
})

describe('읽는 쪽 — 보이는 글자가 없는 별칭은 없는 것', () => {
  it('`nodeAlias` 는 `null` · 줄 글에 빈 괄호가 안 선다', () => {
    const node = { id: 'n_000000000001', type: 'Button', alias: '\u200b', props: { label: '저장' } }
    expect(nodeAlias(node)).toBeNull()
    expect(nodeRowLabel(node)).toBe('Button 저장')
  })
})
