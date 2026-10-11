import { describe, expect, it } from 'vitest'
import { LINT_RULES, lintRule } from '../src/lint/rules'
import { lintIssue, relayLintIssue } from '../src/lint/issue'

describe('lint 이슈를 만드는 자리', () => {
  it('severity를 표에서 파생시킨다 — 호출자가 고르지 않는다', () => {
    const issue = lintIssue('comment-missing', { pageId: 'p1' }, '/root/children/0', '코멘트가 없습니다')
    expect(issue).toEqual({
      rule: 'comment-missing',
      severity: 'warning',
      pageId: 'p1',
      nodeId: null,
      path: '/root/children/0',
      message: '코멘트가 없습니다',
    })
  })

  it('자리를 안 준 축은 null이다', () => {
    const issue = lintIssue('page-unlinked', {}, '/', '떠 있습니다')
    expect(issue.pageId).toBeNull()
    expect(issue.nodeId).toBeNull()
  })

  it('날라 온 이슈의 severity를 그대로 쓴다', () => {
    const relayed = relayLintIssue(
      'interaction-target',
      { pageId: 'p1', nodeId: 'n_000000000001' },
      { severity: 'warning', path: '/root/interactions/0', message: '타겟이 없습니다' },
    )
    expect(relayed.severity).toBe('warning')

    const asError = relayLintIssue('document-invalid', { pageId: 'p1' }, { severity: 'error', path: '/root', message: '봉투가 깨졌습니다' })
    expect(asError.severity).toBe('error')
    expect(asError.nodeId).toBeNull()
  })

  it('표가 severity를 든 규칙에 relay를 쓰면 던진다', () => {
    expect(() =>
      relayLintIssue(
        // 이 자리에 relay가 아닌 id를 넣는 것은 타입이 먼저 막는다(`test/lint-severity.test-d.ts`).
        // 런타임 가드는 표를 고쳐 relay를 없앤 뒤 부르는 코드가 남는 경우를 잡는다.
        'comment-missing' as never,
        {},
        { severity: 'error', path: '/', message: '아무거나' },
      ),
    ).toThrow()
  })

  it('표에 없는 규칙으로는 이슈를 만들 수 없다', () => {
    expect(() => lintIssue('없는규칙' as never, {}, '/', '아무거나')).toThrow()
  })
})

describe('표와 구현이 어긋나지 않는다', () => {
  it('relay 규칙만 severity가 null이다', () => {
    for (const rule of LINT_RULES) {
      const found = lintRule(rule.id)
      expect(found?.severity, rule.id).toBe(rule.severity)
    }
  })
})
