/**
 * `toFailure`의 계약. **화면을 지나지 않는다** — 값만으로 판정한다.
 *
 * **형식 검사를 클라이언트에서 다시 하지 않는 근거는 *"서버가 400과 함께 문장을 준다"*이고,
 * 그 문장은 `error.message`가 아니라 `issues[]`에 온다.** 실측(다시 재는 법: 아래 요청을 api 에 보낸다):
 *
 * ```
 * POST /projects {name:'', slug:'BAD'} → 400
 *   error.message = "요청을 처리할 수 없습니다"
 *   error.issues  = [{path:'name', message:'이름을 입력하세요'},
 *                    {path:'slug', message:'슬러그는 소문자·숫자·하이픈만 …'}]
 * ```
 *
 * `toFailure`가 `caught.message`만 읽으면 화면에 오는 것은 **"요청을 처리할 수 없습니다"
 * 하나**다 — 무엇이 왜 틀렸는지가 사라지고, 형식 검사를 서버에 맡기는 근거가 성립하지 않는다.
 */
import { describe, expect, it } from 'vitest'
import { ApiError } from '../../src/api/client'
import { toFailure } from '../../src/api/failure'

const UNKNOWN = '무언가 잘못됐습니다 [T4-FAIL-1]'

describe('toFailure', () => {
  it('issues가 있으면 그 문장을 쓴다', () => {
    // **봉투 문장을 대신한다 — 덧붙이지 않는다.** 400의 봉투는 "요청을 처리할 수 없습니다"라
    // 아무것도 더하지 않고, 앞에 붙이면 진짜 이유가 뒤로 밀린다.
    const error = new ApiError(400, 'bad-request', '요청을 처리할 수 없습니다', [
      { path: 'slug', message: '슬러그는 소문자·숫자·하이픈만 쓸 수 있고, 하이픈으로 시작하거나 끝날 수 없습니다' },
    ])

    expect(toFailure(error, UNKNOWN)).toEqual({
      kind: 'message',
      message: '슬러그는 소문자·숫자·하이픈만 쓸 수 있고, 하이픈으로 시작하거나 끝날 수 없습니다',
    })
  })

  it('issues가 여럿이면 전부 보인다', () => {
    // **서버가 한 번에 여러 개를 낸다** — 폼 필드가 셋이라 실제로 셋이 함께 온다(실측:
    // `PATCH {name:'', slug:'BAD', description: 2001자}` → issues 셋). 첫 항목만 보이면
    // 사용자가 하나 고치고 다시 보내는 왕복을 필드 수만큼 하게 된다.
    const error = new ApiError(400, 'bad-request', '요청을 처리할 수 없습니다', [
      { path: 'name', message: '이름을 입력하세요' },
      { path: 'slug', message: '슬러그 형식이 틀렸습니다' },
      { path: 'description', message: '설명은 2000자 이하여야 합니다' },
    ])

    expect(toFailure(error, UNKNOWN)).toEqual({
      kind: 'message',
      message: '이름을 입력하세요 · 슬러그 형식이 틀렸습니다 · 설명은 2000자 이하여야 합니다',
    })
  })

  it('issues가 비면 봉투 문장을 쓴다', () => {
    // 409·404·403이 그 부류다 — 봉투 문장이 곧 이유다(실측: 중복 슬러그 409의 봉투가
    // "이미 사용 중인 슬러그입니다"이고 `issues`는 `[]`다).
    const error = new ApiError(409, 'conflict', '이미 사용 중인 슬러그입니다')

    expect(toFailure(error, UNKNOWN)).toEqual({ kind: 'message', message: '이미 사용 중인 슬러그입니다' })
  })

  it('세션이 끊긴 실패는 issues와 무관하게 signed-out이다', () => {
    // 갈래의 순서를 못박는다 — `unauthenticated`가 먼저다. 서버가 그 응답에 issues를 실어도
    // 화면은 문장이 아니라 로그인으로 가야 한다.
    const error = new ApiError(401, 'unauthenticated', '로그인이 필요합니다', [{ path: '', message: '세션이 만료되었습니다' }])

    expect(toFailure(error, UNKNOWN)).toEqual({ kind: 'signed-out' })
  })

  it('ApiError가 아니면 자리마다 다른 문장을 쓴다', () => {
    expect(toFailure(new TypeError('boom'), UNKNOWN)).toEqual({ kind: 'message', message: UNKNOWN })
    expect(toFailure('문자열', UNKNOWN)).toEqual({ kind: 'message', message: UNKNOWN })
  })

  it('issues의 내용이 계약을 어겨도 던지지 않는다', () => {
    // **`issues`는 서버가 준 값을 그대로 실은 것이다** — `http-client.ts`의 `readIssues`가
    // 배열인지만 보고 원소는 보지 않는다. `toFailure`는 오류 경계 밖에서(catch 블록 안에서)
    // 불리므로 여기서 던지면 그 예외를 잡는 곳이 없다.
    const broken = new ApiError(400, 'bad-request', '요청을 처리할 수 없습니다', [
      null,
      { path: 'a' },
      { path: 'b', message: 42 },
      { path: 'c', message: '' },
      { path: 'd', message: '살아남는 문장' },
    ] as unknown as ApiError['issues'])

    // 쓸 수 있는 문장만 남고, 하나라도 남으면 그것을 쓴다.
    expect(toFailure(broken, UNKNOWN)).toEqual({ kind: 'message', message: '살아남는 문장' })
  })

  it('쓸 수 있는 issue 문장이 하나도 없으면 봉투로 되돌아간다', () => {
    const empty = new ApiError(400, 'bad-request', '요청을 처리할 수 없습니다', [
      null,
      { path: 'a', message: '' },
    ] as unknown as ApiError['issues'])

    expect(toFailure(empty, UNKNOWN)).toEqual({ kind: 'message', message: '요청을 처리할 수 없습니다' })
  })

  /** 화면 상태 422 — 서버 문장이 상태 id(`s_…`)를 싣는다. 코드로 사람 문장을 짓는다(`VIEW_STATE_SENTENCES`). */
  describe('화면 상태 422 는 코드로 사람 문장이 된다', () => {
    const cases: [string, string, string][] = [
      [
        'state-cases-left',
        '목록에서 뺀 상태를 가리키는 가지가 남아 있습니다: s_abc123 — 상태 삭제는 그 가지를 함께 지웁니다',
        '그 상태로 만든 가지가 남아 있어 목록에서만 뺄 수 없습니다 — 상태 관리에서 지우세요',
      ],
      [
        'state-case-duplicate',
        '한 상태 영역에 같은 상태의 가지가 둘입니다: s_abc123',
        '한 상태 영역에 같은 상태의 가지가 둘이 될 수 없습니다',
      ],
      ['state-case-default', '상태 영역에는 기본 가지가 정확히 하나여야 합니다 (2개 발견)', '상태 영역에는 기본 가지가 하나여야 합니다'],
      ['state-case-outside', '상태 가지는 상태 영역 바로 아래에만 둘 수 있습니다', '상태 가지는 상태 영역 바로 아래에만 둘 수 있습니다'],
      ['state-switch-child', '상태 영역에는 상태 가지만 둘 수 있습니다 (현재: Text)', '상태 영역에는 상태 가지만 둘 수 있습니다'],
    ]
    it.each(cases)('%s', (code, server, shown) => {
      const error = new ApiError(422, 'validation-failed', '검증 실패', [
        { code, nodeId: 'n_c1', path: '/root/children/0', message: server },
      ])
      const failure = toFailure(error, UNKNOWN)
      expect(failure).toEqual({ kind: 'message', message: shown })
      expect(JSON.stringify(failure)).not.toMatch(/s_abc123|n_c1/)
    })

    it('가지마다 이슈가 하나여도 같은 문장은 한 번만 보이고, 다른 코드의 문장은 서버 것을 그대로 잇는다', () => {
      const left = (id: string) => ({
        code: 'state-cases-left',
        nodeId: id,
        path: '/root/children/0',
        message: `목록에서 뺀 상태를 가리키는 가지가 남아 있습니다: s_${id}`,
      })
      const error = new ApiError(422, 'validation-failed', '검증 실패', [
        left('n_c1'),
        left('n_c2'),
        { code: 'unknown-type', nodeId: 'n_x', path: '/root', message: '모르는 타입입니다' },
      ])
      expect(toFailure(error, UNKNOWN)).toEqual({
        kind: 'message',
        message: '그 상태로 만든 가지가 남아 있어 목록에서만 뺄 수 없습니다 — 상태 관리에서 지우세요 · 모르는 타입입니다',
      })
    })
  })
})
