import { describe, expect, it } from 'vitest'
import { ISSUE_SEVERITY, LINT_RULES, VALIDATION_RULE, lintRule } from '@wirebound/schema'
import { THEME_ISSUE_SEVERITY } from '../src/issue'
import { THEME_RULE } from '../src/lint/index'

/**
 * **어느 코드가 설계서 「lint 규칙」의 어느 줄로 가는가** — 두 표를 통째로 못박는다.
 *
 * `Record<ValidationCode, …>`·`Record<ThemeIssueCode, …>`는 *"항목이 있는가"*만 본다. 그래서
 * **새 코드가 조용히 빠지는 경로는 없지만 오른쪽 값을 조용히 다른 줄로 옮기는 경로는 있다** —
 * 매핑을 바꾸는 변이(`unknown-component`를 ⑧에서 `theme-other`로, `unknown-primitive`를
 * ⑨에서, `invalid-interaction-prop`을 ③에서 …)는 이 표가 없으면 아무 케이스도 안 죽인다.
 *
 * 어느 코드를 어느 줄에 넣을지는 **판단**이다(⑧에 `unknown-component`·`unknown-variant`를
 * 함께 넣은 것이 그 예다). 판단은 밖에서 보이고 고칠 때 눈에 띄어야 한다.
 *
 * **이 파일이 `themes`에 있는 것은 두 표를 함께 보는 자리가 여기뿐이기 때문이다** —
 * `themes → schema`가 의존 방향이다(`lintProject`가 여기 있는 것과 같은 이유).
 */
describe('ValidationCode → lint 규칙', () => {
  it('표가 이 매핑 그대로다', () => {
    expect(VALIDATION_RULE).toEqual({
      // ③ *"대상 노드가 삭제된 상호작용 규칙"* — 상호작용 셋을 한 줄로 묶는다.
      'missing-interaction-target': 'interaction-target',
      'invalid-interaction-target': 'interaction-target',
      'invalid-interaction-prop': 'interaction-target',
      // 「lint 규칙」 밖 — 문서가 규격을 어긴 것들.
      'unknown-type': 'document-invalid',
      'invalid-props': 'document-invalid',
      'children-not-allowed': 'document-invalid',
      'unknown-variant': 'document-invalid',
      'ignored-variant': 'document-invalid',
      'duplicate-id': 'document-invalid',
      'bad-root': 'document-invalid',
      'slot-count': 'document-invalid',
      'bad-document': 'document-invalid',
    })
  })

  it('`ValidationCode` 전부를 덮는다 — severity 표와 열쇠가 같다', () => {
    expect(Object.keys(VALIDATION_RULE).sort()).toEqual(Object.keys(ISSUE_SEVERITY).sort())
  })
})

describe('ThemeIssueCode → lint 규칙', () => {
  it('표가 이 매핑 그대로다', () => {
    expect(THEME_RULE).toEqual({
      // ⑧ *"컴포넌트 정의에 없는 `structure` · `part` · `state` 참조"*
      // `unknown-component`·`unknown-variant`는 「lint 규칙」이 이름으로 들지 않았지만 **같은 대조**의
      // 결과다 — 갈라야 한다고 보면 「lint 규칙」 밖 규칙으로 옮겨야 하고 그 판단이 여기 보인다.
      'unknown-component': 'theme-vocabulary',
      'unknown-structure': 'theme-vocabulary',
      'unknown-part': 'theme-vocabulary',
      'unknown-variant': 'theme-vocabulary',
      'unknown-state': 'theme-vocabulary',
      // ⑨ *"존재하지 않는 토큰 참조"* — 참조가 풀리지 않는 것들.
      'unknown-token': 'theme-token',
      'unknown-primitive': 'theme-token',
      'circular-token': 'theme-token',
      'unresolved-token': 'theme-token',
      'suspicious-literal': 'theme-token',
      // ⑩ *"화이트리스트에 없는 스타일 프로퍼티"*
      'unknown-style-prop': 'theme-style-prop',
      // ⑫ *"패턴 `slots` 계약과 `schema` 불일치"*
      'bad-pattern-node': 'theme-pattern',
      'unknown-slot': 'theme-pattern',
      'unused-slot': 'theme-pattern',
      // ⑬ *"`extends` 대상이 없거나 상속 깊이 위반"*
      'bad-extends': 'theme-extends',
      // 「lint 규칙」의 여섯 줄 밖.
      'bad-token-value': 'theme-other',
      'bad-style-value': 'theme-other',
      'duplicate-token': 'theme-other',
      'duplicate-variable': 'theme-other',
      'bad-spec': 'theme-other',
      'bad-pattern-name': 'theme-other',
      'unknown-breakpoint': 'theme-other',
      'node-handle-overwrite': 'theme-other',
    })
  })

  it('`ThemeIssueCode` 전부를 덮는다 — severity 표와 열쇠가 같다', () => {
    expect(Object.keys(THEME_RULE).sort()).toEqual(Object.keys(THEME_ISSUE_SEVERITY).sort())
  })
})

/**
 * 위 두 표가 **베낀 값**이라는 것이 약점이다 — 고치는 사람이 표와 케이스를 함께 바꾸면
 * 조용히 지나간다. 그래서 베낄 수 없는 성질을 따로 잰다: 값이 실제로 표에 있는 규칙이고,
 * **나르는 규칙**이며(`severity: null` — 나르는 자리는 severity를 지어내지 않는다), 소유자가 그 표가 사는 패키지와 맞는가.
 */
describe('매핑의 오른쪽이 지켜야 하는 것', () => {
  const check = (table: Record<string, string>, owner: 'schema' | 'themes'): void => {
    for (const [code, id] of Object.entries(table)) {
      const rule = lintRule(id)
      expect(rule, `${code} → ${id}`).toBeDefined()
      // relay 전용이다 — 나르는 자리가 severity를 지어내면 원래 판정의 severity와 갈린다.
      expect(rule!.severity, `${code} → ${id}`).toBeNull()
      expect(rule!.owner, `${code} → ${id}`).toBe(owner)
    }
  }

  it('ValidationCode 쪽은 전부 schema 소유의 relay 규칙이다', () => {
    check(VALIDATION_RULE, 'schema')
  })

  it('ThemeIssueCode 쪽은 전부 themes 소유의 relay 규칙이다', () => {
    check(THEME_RULE, 'themes')
  })

  it('「lint 규칙」의 줄을 가진 규칙 중 나르는 것은 두 표 중 하나가 반드시 쓴다', () => {
    // **닿지 않는 줄이 없다.** 표에 relay 규칙을 만들어 두고 아무 코드도 그리로 안 보내면
    // 그 규칙은 영원히 안 난다.
    const used = new Set([...Object.values(VALIDATION_RULE), ...Object.values(THEME_RULE)])
    const relay = LINT_RULES.filter((rule) => rule.severity === null)
    expect(relay.length).toBeGreaterThan(0)
    for (const rule of relay) {
      expect([...used], rule.id).toContain(rule.id)
    }
  })
})
