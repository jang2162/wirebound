/**
 * **글자 수 한도는 코드 포인트다**(`panels/controls/text-control.tsx` 의 `clampPoints`) — 입력창의 `maxLength` 는 UTF-16 단위라 이모지를 둘로 센다(L-241).
 * 실브라우저 값(70개를 쳐 60개에서 멈춤)은 `apps/web/build-test/n19-notices.test.ts` 가 잰다 — 여기는 넣는 자리별 값이다.
 */
import { describe, expect, it } from 'vitest'
import { clampPoints, clampUnits } from '../../src/panels/controls/text-control'

const E = '😀'

describe('clampPoints', () => {
  it('한도 안이면 그대로다 — 이모지는 한 글자로 센다', () => {
    expect(clampPoints('', E.repeat(60), 60)).toBe(E.repeat(60))
    expect(clampPoints('', '가'.repeat(60), 60)).toBe('가'.repeat(60))
  })

  it('끝에 넘게 치면 넣은 글만 한도로 자른다', () => {
    expect(clampPoints(E.repeat(59), E.repeat(59) + E.repeat(5), 60)).toBe(E.repeat(60))
  })

  it('가운데에 한도를 넘게 치면 끝 글자가 밀려나지 않는다 — 넣은 글이 잘린다', () => {
    const previous = `가${E.repeat(57)}나`
    expect(clampPoints(previous, `가다다다${E.repeat(57)}나`, 60)).toBe(`가다${E.repeat(57)}나`)
  })

  it('이미 한도인 칸에 한 글자를 더 치면 막힌다', () => {
    const previous = `${E.repeat(30)}가${E.repeat(29)}`
    expect(clampPoints(previous, `${E.repeat(30)}나가${E.repeat(29)}`, 60)).toBe(previous)
  })

  it('이모지 둘이 앞 절반을 나눠 가져도 글자를 반으로 가르지 않는다', () => {
    // 😀(D83D DE00) → 😁(D83D DE01) — 앞 절반(D83D)이 같다.
    const previous = '😀'.repeat(59) + '😀'
    const next = '😀'.repeat(59) + '😁😁'
    const out = clampPoints(previous, next, 60)
    expect([...out].length).toBe(60)
    expect(out.replace(/[\ud800-\udbff][\udc00-\udfff]/g, '')).toBe('')
  })

  it('한도를 넘은 채 들어온 글(앞 판의 긴 글)도 더 늘리지 않는다', () => {
    const previous = '가'.repeat(70)
    expect(clampPoints(previous, previous + '나', 60)).toBe([...(previous + '나')].slice(0, 60).join(''))
  })
})

/**
 * **카탈로그 prop 의 글 한도는 UTF-16 단위다**(`clampUnits` — zod `.max()` 가 `length` 로 센다). 이모지 하나가 둘이다 — 한 칸 남은 자리에 이모지가 안 들어가고,
 * 글자를 반으로 가르지 않는다. 넣는 자리 규칙(넣은 글만 자름 · 끝 글자를 안 밀어냄)은 `clampPoints` 와 같다.
 */
describe('clampUnits', () => {
  it('한도 안이면 그대로 · 이모지는 두 단위로 센다', () => {
    expect(clampUnits('', E.repeat(10), 20)).toBe(E.repeat(10))
    expect(clampUnits('', E.repeat(11), 20)).toBe(E.repeat(10))
  })

  it('한 단위 남은 자리에 이모지를 치면 안 들어간다 — 반으로 가르지 않는다', () => {
    const out = clampUnits('가'.repeat(19), '가'.repeat(19) + E, 20)
    expect(out).toBe('가'.repeat(19))
    expect(() => encodeURIComponent(out)).not.toThrow()
  })

  it('가운데에 넘게 치면 넣은 글만 잘린다 · 끝 글자는 그대로', () => {
    expect(clampUnits('가'.repeat(18) + '나', '가'.repeat(9) + '다다다' + '가'.repeat(9) + '나', 20)).toBe(
      '가'.repeat(9) + '다' + '가'.repeat(9) + '나',
    )
  })

  it('한도를 넘은 채 들어온 글(앞 판의 긴 글)은 고치는 순간 한도로 자른다 — clampPoints 와 같다', () => {
    const previous = '가'.repeat(25)
    expect(clampUnits(previous, previous + '나', 20)).toBe('가'.repeat(20))
    expect(clampUnits(previous, '가'.repeat(24), 20)).toBe('가'.repeat(20))
  })
})
