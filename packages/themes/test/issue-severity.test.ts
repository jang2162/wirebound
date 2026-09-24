import { ISSUE_SEVERITY, ignoredVariantMessage, installCatalog, requireComponent, validatePage } from '@wirebound/schema'
import { beforeAll, describe, expect, it } from 'vitest'
import { THEME_ISSUE_SEVERITY, issue } from '../src/issue'
import { resolveTheme } from '../src/resolve/index'

beforeAll(() => {
  installCatalog()
})

/**
 * **`themes`에 경고가 될 이슈가 있는가.**
 *
 * `resolveTheme`은 **`error`가 하나라도 있으면** `theme`을 `null`로 내고 경고는 통과시킨다.
 * 그래서 여기서 지키는 것은 **경고 목록이 정확히 무엇인가**다. 새 코드가
 * 조용히 `warning`이 되면 여기가 죽고, 그러면 `resolveTheme`·`assertResolvable`이
 * 그것을 통과시켜도 되는지 다시 묻게 된다.
 */
describe('ThemeIssue.severity', () => {
  it('경고인 코드가 정확히 이 둘이다 — 나머지는 전부 error다', () => {
    const codes = Object.keys(THEME_ISSUE_SEVERITY)
    expect(codes.length).toBeGreaterThan(0)

    const warnings = codes.filter((code) => THEME_ISSUE_SEVERITY[code as never] === 'warning')
    expect(warnings.sort()).toEqual(['node-handle-overwrite', 'suspicious-literal'])

    // 나머지가 전부 error인 것까지 본다 — 세 번째 값이 생기면 여기가 죽는다.
    for (const code of codes) {
      expect(['error', 'warning']).toContain(THEME_ISSUE_SEVERITY[code as never])
    }
  })

  it('issue()가 표에서 severity를 파생시킨다', () => {
    expect(issue('bad-spec', 'meta', '가')).toEqual({
      code: 'bad-spec',
      severity: 'error',
      path: 'meta',
      message: '가',
    })
  })

  it('resolveTheme이 낸 이슈도 severity를 단다', () => {
    const { theme, issues } = resolveTheme({
      meta: { id: 'a', name: '가', version: '1.0.0' },
      tokens: { semantic: { primary: '{없는.토큰}' } },
    })
    expect(theme).toBeNull()
    expect(issues.length).toBeGreaterThan(0)
    for (const entry of issues) {
      expect(entry.severity).toBe(THEME_ISSUE_SEVERITY[entry.code])
    }
  })

  /**
   * **설계와 어긋난 것이 아니라 이 구현이 갈라 둔 것이다 — 그 갈림을 눈에 보이게 둔다.**
   *
   * 같은 조건(`variantFrom`을 가진 컴포넌트에 `variant`를 적었다)이
   * **페이지 문서에서는 `warning`, 테마 패턴에서는 `error`**다. 문장은 글자까지 같다
   * (`ignoredVariantMessage` 하나를 둘이 부른다 — `spec-patterns.test.ts`가 대조한다).
   *
   * 원인은 코드 유니온을 일부러 갈라 둔 것이다: 패턴 쪽은 catch-all
   * `bad-pattern-node`라 **타입 오타·props 위반·`Slot` 금지**를 함께 담으므로 통째로
   * `warning`으로 내리면 진짜 오류가 저장을 통과한다. 갈라 내려면 전용 코드가 필요하고
   * 그것이 곧 평행 유니온이다. **이 케이스가 죽는 날은 그 결정을 바꾸는 날이다.**
   */
  it('같은 조건이 페이지에서는 경고, 패턴에서는 오류다 (알려진 비대칭)', () => {
    const text = requireComponent('Text')
    const message = ignoredVariantMessage(text, 'caption')

    const pageIssues = validatePage({
      version: 1,
      root: {
        id: 'n_000000000001',
        type: 'Page',
        children: [{ id: 'n_000000000002', type: 'Text', variant: 'caption', props: { role: 'h2' } }],
      },
    })
    expect(pageIssues.map((entry) => entry.code)).toEqual(['ignored-variant'])
    expect(pageIssues[0]!.message).toBe(message)
    expect(pageIssues[0]!.severity).toBe(ISSUE_SEVERITY['ignored-variant'])
    expect(pageIssues[0]!.severity).toBe('warning')

    const { issues: themeIssues } = resolveTheme({
      meta: { id: 'a', name: '가', version: '1.0.0' },
      patterns: {
        'hero.split': {
          name: '가',
          schema: { type: 'Text', variant: 'caption', props: { role: 'h2' } },
        },
      },
    })
    const sameCondition = themeIssues.filter((entry) => entry.message === message)
    expect(sameCondition.map((entry) => entry.code)).toEqual(['bad-pattern-node'])
    expect(sameCondition[0]!.severity).toBe('error')
  })
})
