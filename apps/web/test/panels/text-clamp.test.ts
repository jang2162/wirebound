/**
 * **글자 수 한도는 코드 포인트다**(`panels/controls/text-control.tsx` 의 `clampPoints`) — 입력창의 `maxLength` 는 UTF-16 단위라 이모지를 둘로 센다(L-241).
 * 실브라우저 값(70개를 쳐 60개에서 멈춤)은 `apps/web/build-test/n19-notices.test.ts` 가 잰다 — 여기는 넣는 자리별 값이다.
 */
import { describe, expect, it } from 'vitest'
import { clampPoints } from '../../src/panels/controls/text-control'

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
