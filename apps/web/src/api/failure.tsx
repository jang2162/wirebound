/**
 * **조회 실패를 화면으로 옮기는 규칙이 여기 한 곳에 있다** (설계 D5).
 *
 * D5가 못박은 것: *"화면은 `code`로 분기한다 — `unauthenticated`면 로그인으로,
 * `not-found`면 '없음', `forbidden`면 '권한 없음'."* 그리고 그 반대편 — **`status` 숫자로
 * 분기하지 않는다.** 서버는 "프로젝트가 없음"과 "멤버가 아님"을 일부러 둘 다 404로 내므로
 * (설계 §10 — 다른 프로젝트의 존재를 흘리지 않기 위해서다) HTTP 숫자로 가르면 그 의도가
 * 화면에서 깨진다.
 *
 * **왜 한 곳인가.** 조회하는 자리는 다섯이다(`getProject`·`getTree`·`getPage`·
 * `listProjects`·`me`). 앞의 넷은 `caught.message`를 자기 자리에 그리기만 했고, 그래서
 * **세션이 끊긴 것을 아무도 판정하지 않았다** — 문지기(`routes/require-auth.tsx`)는 이미
 * 통과한 뒤라 다시 판정하지 않으므로, 에디터 안에서 세션이 지워지면 화면에 "로그인이
 * 필요합니다"만 뜨고 **새로고침 말고는 로그인 화면에 갈 방법이 없다.** 다섯이 같은 판정을
 * 하려면 그 판정이 한 곳에 있어야 한다.
 *
 * **`not-found`·`forbidden`은 서버 문장 그대로다.** 화면이 문안을 다시 쓰면 서버가 이유를
 * 바꿔도 사용자는 옛 이유를 듣는다. 즉 이 모듈이 코드로 가르는 것은 **`unauthenticated`
 * 하나**이고, 나머지는 전부 `message`로 모인다 — 갈라야 할 이유가 생기면 그때 여기에 갈래를
 * 더한다.
 */
import { useEffect, type ReactElement } from 'react'
import { Navigate } from 'react-router'
import { useInvalidateSession } from '../session/session-context'
import { ApiError } from './client'

/**
 * 실패 하나를 화면이 다룰 수 있는 형태로.
 *
 * - `signed-out` — 세션이 끊겼다. 화면 대신 로그인으로 보낸다(`<SignedOut />`).
 * - `message` — 사용자에게 그대로 보여도 되는 한 문장.
 */
export type Failure = { kind: 'signed-out' } | { kind: 'message'; message: string }

/**
 * `catch`로 받은 값을 `Failure`로. **어떤 값이 와도 던지지 않는다.**
 *
 * @param unknownMessage `ApiError`가 아닌 값이 왔을 때 쓸 문장. 자리마다 다르다 — 무엇을
 *   못 불러왔는지가 다르기 때문이다.
 */
export function toFailure(caught: unknown, unknownMessage: string): Failure {
  if (caught instanceof ApiError && caught.code === 'unauthenticated') {
    return { kind: 'signed-out' }
  }
  if (caught instanceof ApiError) {
    return { kind: 'message', message: reason(caught) }
  }
  return { kind: 'message', message: unknownMessage }
}

/**
 * `ApiError` 하나를 사용자에게 보일 한 문장으로. **`issues`가 있으면 그것이 이유다.**
 *
 * **왜 봉투(`error.message`)만으로는 안 되는가 — 재서 적는다.** 서버는 무엇이 왜 틀렸는지를
 * `issues[]`에 넣고 봉투에는 갈래만 적는다:
 *
 * ```
 * POST /projects {name:'', slug:'BAD'} → 400
 *   봉투 = "요청을 처리할 수 없습니다"
 *   issues = [{path:'name', message:'이름을 입력하세요'},
 *             {path:'slug', message:'슬러그는 소문자·숫자·하이픈만 …'}]
 *
 * PUT .../schema (카탈로그 위반) → 422
 *   봉투 = "스키마 검증에 실패했습니다"
 *   issues = [{code:'unknown-type', nodeId:'n_…', path:'/root/children/0',
 *              message:'알 수 없는 컴포넌트 타입: 없는타입'}]
 * ```
 *
 * **둘 다 issues 쪽이 봉투보다 낫다** — 그래서 코드로 갈래를 나누지 않고 "issues가 있으면
 * 쓴다" 하나로 둔다. **계획서 D5가 *"서버가 400과 함께 문장을 준다"*고 적으면서 그 문장이
 * 어디에 오는지를 빠뜨렸고**, 그 탓에 `toFailure`가 봉투만 읽는 동안 D5의 근거가 화면에
 * 닿지 않았다(P2b-5 Task 4에서 재서 잡았다).
 *
 * **봉투를 앞에 붙이지 않고 대신한다.** 400의 봉투는 아무것도 더하지 않고, 앞에 두면 진짜
 * 이유가 뒤로 밀린다. 422의 봉투는 조금 더하지만 그것 하나를 위해 갈래를 만들지 않는다.
 *
 * **여럿이면 전부 이어 붙인다.** 서버가 한 번에 여러 개를 낸다(실측: 폼 필드 셋을 다 어기면
 * issues가 셋이다). 첫 항목만 보이면 사용자가 하나 고치고 다시 보내는 왕복을 필드 수만큼
 * 하게 된다.
 *
 * **`path`를 필드에 붙이지는 않는다.** `issues[].path`가 `'slug'`처럼 필드 이름을 담고 있어
 * 그 필드 옆에 문장을 놓을 수 있지만, 그것은 폼이 `path`↔필드 대응표를 갖는다는 뜻이고
 * **규칙이 서버와 폼 두 곳에 생긴다.** 이 단계는 한 줄로 모아 보인다 — 필드별 표시가 필요해지면
 * 그때 그 대응표를 어디에 둘지부터 정해야 한다.
 *
 * **던지지 않는 것이 계약이다.** `issues`는 서버가 준 값을 그대로 실은 것이고
 * (`http-client.ts`의 `readIssues`가 배열인지만 보고 원소는 보지 않는다), 이 함수는 오류 경계
 * 밖의 `catch` 블록에서 불린다. 그래서 원소가 `null`이거나 `message`가 문자열이 아니어도
 * 걸러 내고 넘어간다 — **쓸 수 있는 문장이 하나도 없으면 봉투로 되돌아간다.**
 */
function reason(error: ApiError): string {
  const detail = error.issues
    .map((issue: unknown) =>
      typeof issue === 'object' && issue !== null && typeof (issue as { message?: unknown }).message === 'string'
        ? (issue as { message: string }).message
        : '',
    )
    .filter((message) => message !== '')

  return detail.length === 0 ? error.message : detail.join(' · ')
}

/**
 * 세션이 끊긴 실패를 화면 대신 로그인으로 바꾼다.
 *
 * `replace`인 것은 로그인한 뒤 뒤로 가기가 방금 튕겨 나온 주소로 돌아가면 다시 튕기기
 * 때문이다(`routes/require-auth.tsx`의 `RequireAuth`와 같은 이유).
 *
 * **컴포넌트인 것이 요점이다.** 목적지를 문자열로 돌려주면 네 자리가 각자 `<Navigate>`를
 * 쓰게 되고 규칙이 다시 흩어진다. **전역 세션을 끊는 자리이기도 하다** — 조회가
 * `unauthenticated`를 받았다는 것은 문지기가 들고 있는 `authenticated`가 이미 틀렸다는
 * 뜻이므로, 주소만 옮기고 상태를 두면 로그인 화면이 다시 목록으로 돌려보낸다(이월 문서
 * §1의 순환).
 */
export function SignedOut(): ReactElement {
  const invalidate = useInvalidateSession()
  // 렌더 중이 아니라 커밋 뒤에 부른다 — 렌더 도중의 `setState`는 다른 컴포넌트를 갱신할 수
  // 없다. `invalidate`의 참조는 앱이 도는 내내 그대로이므로(`session-context.tsx`) 이
  // 이펙트는 마운트에 한 번만 돈다.
  useEffect(invalidate, [invalidate])
  return <Navigate to="/login" replace />
}
