/**
 * **수습 조각 열쇠의 머리**(`edit/use-edit-commit.tsx`의 `refusalHead`) — 같은 까닭은 번호 · 경로가 달라도 한 머리, 다른 까닭은 다른 머리다.
 *
 * 문장은 **서버가 실제로 낸 것이다** — api 하네스(`withApi`)로 `PATCH .../ops`를 보내 받은 봉투 문장(issues 가 있으면 화면이 쓰는 issues 문장 —
 * `api/failure.tsx`의 `reason`)을 옮겼다. `unsupported-version` 줄만 하네스로 못 세워 `@wirebound/schema`의 `migrateDocument` 틀에 번호를
 * 넣었다. 서버 문장이 바뀌어 머리에 번호가 들면 이 표가 낡는다 — 다시 재는 법: 같은 요청을 보내 문장을 모은다.
 */
import { describe, expect, it } from 'vitest'
import { refusalHead } from '../../src/edit/use-edit-commit'

/** 까닭마다 서버 문장 여럿 — 같은 줄 안은 번호 · 경로 · 이름만 다르다. */
const SERVER_REFUSALS: Record<string, string[]> = {
  stale: ['페이지가 이미 변경되었습니다 (요청 baseSeq 0, 현재 2)', '페이지가 이미 변경되었습니다 (요청 baseSeq 7, 현재 2)'],
  'patch-failed': [
    '편집을 적용할 수 없습니다: 바꿀 값을 찾을 수 없습니다: /root/children/9/props/x',
    '편집을 적용할 수 없습니다: 지울 값을 찾을 수 없습니다: /root/children/3',
    '편집을 적용할 수 없습니다: 배열 인덱스가 범위를 벗어납니다: /root/children/12',
  ],
  'unknown-type': ['알 수 없는 컴포넌트 타입: Bogus', '알 수 없는 컴포넌트 타입: Other'],
  'duplicate-id': ['id가 중복됩니다: n_route000001'],
  // 별칭을 단 노드의 문장은 타입 뒤 괄호에 별칭이 든다(`validate.ts` 의 `aliasNote`) — 머리가 별칭에 안 갈린다.
  'invalid-props': [
    "List의 props가 올바르지 않습니다 ('회원 목록'): items 너무 작습니다",
    "List의 props가 올바르지 않습니다 ('주문: 목록'): items 너무 작습니다",
    'List의 props가 올바르지 않습니다: items 너무 작습니다',
  ],
  'children-not-allowed': ["Divider은 자식을 담을 수 없습니다 ('구분선')", 'Divider은 자식을 담을 수 없습니다'],
  'nul-byte': ['문서에 NUL 문자(U+0000)를 포함할 수 없습니다'],
  'bad-path': ['경로는 /root · /viewStates 아래이거나 /version이어야 합니다'],
  'unsupported-version': ['지원하지 않는 문서 버전: 3', '지원하지 않는 문서 버전: 4'],
}

describe('refusalHead', () => {
  it('같은 까닭의 서버 문장은 번호 · 경로가 달라도 머리가 하나다 — 조각이 거절마다 늘지 않는다', () => {
    const heads = Object.fromEntries(
      Object.entries(SERVER_REFUSALS).map(([cause, messages]) => [cause, [...new Set(messages.map(refusalHead))]]),
    )

    expect(heads).toEqual({
      stale: ['페이지가 이미 변경되었습니다'],
      'patch-failed': ['편집을 적용할 수 없습니다'],
      'unknown-type': ['알 수 없는 컴포넌트 타입'],
      'duplicate-id': ['id가 중복됩니다'],
      'invalid-props': ['List의 props가 올바르지 않습니다'],
      'children-not-allowed': ['Divider은 자식을 담을 수 없습니다'],
      'nul-byte': ['문서에 NUL 문자'],
      'bad-path': ['경로는 /root · /viewStates 아래이거나 /version이어야 합니다'],
      'unsupported-version': ['지원하지 않는 문서 버전'],
    })
  })
})
