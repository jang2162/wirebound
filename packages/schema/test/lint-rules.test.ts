import { describe, expect, it } from 'vitest'
import designDoc from '../../../docs/superpowers/specs/2026-08-03-wirebound-design.md?raw'
import { LINT_RULES, lintRule } from '../src/lint/rules'

/**
 * 설계서 「lint 규칙」의 «설계서 규칙» 소제목 아래 불릿을 **설계 문서에서 읽는다.** 손으로 옮긴 인용은 설계가 바뀌어도
 * 조용하다. 다른 굵은 소제목이 나오면 그 뒤의 불릿은 세지 않는다.
 */
function specLines(): { group: 'document'; text: string }[] {
  const section = designDoc.slice(
    designDoc.indexOf('### 12.4 lint 규칙'),
    designDoc.indexOf('### 12.5 스킬'),
  )
  const found: { group: 'document'; text: string }[] = []
  let group: 'document' | null = null
  for (const line of section.split('\n')) {
    if (line.startsWith('**설계서 규칙**')) group = 'document'
    else if (line.startsWith('**')) group = null
    else if (line.startsWith('- ') && group !== null) found.push({ group, text: line.slice(2).trim() })
  }
  return found
}

describe('규칙 레지스트리가 설계서 lint 규칙 절을 센다', () => {
  const lines = specLines()

  it('설계 문서에서 규칙 줄을 실제로 읽는다', () => {
    // 파서가 어긋나면 빈 집합에서 아래 검사가 조용히 통과한다.
    expect(lines.length).toBeGreaterThan(0)
    expect(lines.filter((line) => line.group === 'document').length).toBeGreaterThan(0)
  })

  it('설계서 「lint 규칙」의 모든 줄이 규칙 하나를 갖는다', () => {
    // **수를 여기 적지 않는다.** 문서가 든 줄이 곧 기대값이다.
    const declared = LINT_RULES.filter((rule) => rule.spec !== null).map((rule) => `${rule.group}|${rule.spec}`)
    const expected = lines.map((line) => `${line.group}|${line.text}`)
    expect([...declared].sort()).toEqual([...expected].sort())
  })

  it('lint 규칙 절 밖의 규칙은 그렇다고 선언하고 이유를 든다', () => {
    for (const rule of LINT_RULES) {
      if (rule.spec !== null) continue
      expect(rule.beyondSpec, rule.id).toBeTypeOf('string')
      expect(rule.beyondSpec!.length, rule.id).toBeGreaterThan(0)
    }
  })

  it('id가 중복되지 않는다', () => {
    const ids = LINT_RULES.map((rule) => rule.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('규칙은 전부 schema가 구현하는 설계서 규칙이다', () => {
    for (const rule of LINT_RULES) {
      expect([rule.group, rule.owner], rule.id).toEqual(['document', 'schema'])
    }
  })

  it('lintRule이 id로 표를 찾는다', () => {
    for (const rule of LINT_RULES) {
      expect(lintRule(rule.id)).toBe(rule)
    }
  })
})
