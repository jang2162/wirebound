/**
 * *"표가 severity를 든 규칙은 `lintIssue`, 날라 온 severity를 쓰는 규칙은 `relayLintIssue`"*를
 * **타입으로** 지키는 자리. 런타임 가드(`lint-issue.test.ts`)는 표를 고친 뒤 남은 호출을
 * 잡고, 여기는 그 호출이 애초에 컴파일되지 않게 한다.
 */
import { lintIssue, relayLintIssue } from '../src/lint/issue'

const where = {}
const source = { severity: 'error' as const, path: '/', message: '아무거나' }

// 표가 severity를 든 규칙은 `lintIssue`가 받는다
lintIssue('comment-missing', where, '/', '메시지')
lintIssue('naming', where, '/', '메시지')

// relay 규칙은 `relayLintIssue`가 받는다
relayLintIssue('interaction-target', where, source)
relayLintIssue('document-invalid', where, source)

// @ts-expect-error relay 규칙에 severity를 지어 넣을 수 없다
lintIssue('interaction-target', where, '/', '메시지')
// @ts-expect-error 표가 severity를 든 규칙을 relay로 나를 수 없다
relayLintIssue('comment-missing', where, source)
// @ts-expect-error 표에 없는 id는 규칙이 아니다
lintIssue('없는규칙', where, '/', '메시지')
