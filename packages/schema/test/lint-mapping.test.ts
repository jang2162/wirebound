import { describe, expect, it } from 'vitest'
import { VALIDATION_RULE } from '../src/lint/design'
import { ISSUE_SEVERITY } from '../src/validate'

/**
 * **`validatePage`의 어느 코드가 설계서 「lint 규칙」의 어느 줄로 가는가** — 표를 통째로 못박는다.
 *
 * `Record<ValidationCode, …>`는 *"항목이 있는가"*만 본다. 그래서 **새 코드가 조용히 빠지는 경로는 없지만 오른쪽 값을 조용히
 * 다른 줄로 옮기는 경로는 있다** — 매핑을 바꾸는 변이(`invalid-interaction-prop`을 ③에서 `document-invalid`로 …)는
 * 이 표가 없으면 아무 케이스도 안 죽인다. 어느 코드를 어느 줄에 넣을지는 **판단**이라 밖에서 보여야 한다.
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
      'ignored-variant': 'document-invalid',
      'duplicate-id': 'document-invalid',
      'bad-root': 'document-invalid',
      'nested-page': 'document-invalid',
      'slot-count': 'document-invalid',
      'bad-document': 'document-invalid',
      // 저장 경계만 낸다(편집 전후) — lint 는 받지 않지만 표는 모든 코드를 덮는다.
      'state-cases-left': 'document-invalid',
    })
  })

  it('`ValidationCode` 전부를 덮는다 — severity 표와 열쇠가 같다', () => {
    expect(Object.keys(VALIDATION_RULE).sort()).toEqual(Object.keys(ISSUE_SEVERITY).sort())
  })
})
