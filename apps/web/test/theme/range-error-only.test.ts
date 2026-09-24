/**
 * **테마 해석 · 병합의 던짐 가운데 `RangeError`만 잡는다**(`src/theme/draft-css.ts`의 `resolveDraft` ·
 * `src/theme/token-editor.tsx`의 `effectiveTokens`). 호출 스택을 넘긴 것은 이슈 · 자기 절 토큰으로 떨어지고, 그 밖의 던짐은
 * 해석기의 결함이라 덮지 않는다 — 덮으면 결함이 «중첩이 너무 깊습니다»로 보인다.
 *
 * 진짜 해석기로는 `RangeError` 아닌 던짐을 만들 수 없어 `resolveTheme` · `mergeTheme`을 목으로 던지게 한다. 목이 닿았는지는
 * 불린 수로 잰다 — 안 닿으면 진짜 해석기가 돌아 케이스가 헛돈다. 깊은 패턴으로 진짜 `RangeError`를 내는 판은
 * `draft-css.test.tsx` · `token-editor.test.tsx`가 잰다.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { systemTheme, type Theme, type ThemeTokens } from '@wirebound/themes'
import { resolveDraft } from '../../src/theme/draft-css'
import { effectiveTokens } from '../../src/theme/token-editor'

/** 목이 던질 것. `null`이면 진짜를 부른다. 불린 수도 센다. */
const thrown = vi.hoisted(() => ({
  resolve: null as Error | null,
  merge: null as Error | null,
  resolveCalls: 0,
  mergeCalls: 0,
}))

vi.mock('@wirebound/themes', async (importOriginal) => {
  const real = await importOriginal<typeof import('@wirebound/themes')>()
  return {
    ...real,
    resolveTheme: (...args: Parameters<typeof real.resolveTheme>) => {
      thrown.resolveCalls += 1
      if (thrown.resolve !== null) throw thrown.resolve
      return real.resolveTheme(...args)
    },
    mergeTheme: (...args: Parameters<typeof real.mergeTheme>) => {
      thrown.mergeCalls += 1
      if (thrown.merge !== null) throw thrown.merge
      return real.mergeTheme(...args)
    },
  }
})

afterEach(() => {
  thrown.resolve = null
  thrown.merge = null
  thrown.resolveCalls = 0
  thrown.mergeCalls = 0
})

const admin = systemTheme('admin')!
const ownTokens = { palette: { brand: '#010203' } } as ThemeTokens
const derived: Theme = {
  meta: { id: 'brand', name: '브랜드', version: '1.0.0', extends: 'system:admin' },
  tokens: ownTokens,
}

describe('resolveDraft', () => {
  it('스택을 넘긴 것은 이슈로 낸다', () => {
    thrown.resolve = new RangeError('Maximum call stack size exceeded')

    const result = resolveDraft(admin, null)

    expect(thrown.resolveCalls).toBe(1)
    expect(result.issues.map((one) => one.code)).toEqual(['bad-spec'])
  })

  it('그 밖의 던짐은 덮지 않는다', () => {
    const defect = new TypeError('해석기의 결함')
    thrown.resolve = defect

    expect(() => resolveDraft(admin, null)).toThrow(defect)
    expect(thrown.resolveCalls).toBe(1)
  })
})

describe('effectiveTokens', () => {
  it('스택을 넘긴 것은 자기 절 토큰으로 떨어진다', () => {
    thrown.merge = new RangeError('Maximum call stack size exceeded')

    expect(effectiveTokens(derived, admin)).toBe(ownTokens)
    expect(thrown.mergeCalls).toBe(1)
  })

  it('그 밖의 던짐은 덮지 않는다', () => {
    const defect = new TypeError('병합기의 결함')
    thrown.merge = defect

    expect(() => effectiveTokens(derived, admin)).toThrow(defect)
    expect(thrown.mergeCalls).toBe(1)
  })
})
