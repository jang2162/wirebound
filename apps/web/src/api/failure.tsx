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
import type { ReactElement } from 'react'
import { Navigate } from 'react-router'
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
  return {
    kind: 'message',
    message: caught instanceof ApiError ? caught.message : unknownMessage,
  }
}

/**
 * 세션이 끊긴 실패를 화면 대신 로그인으로 바꾼다.
 *
 * `replace`인 것은 로그인한 뒤 뒤로 가기가 방금 튕겨 나온 주소로 돌아가면 다시 튕기기
 * 때문이다(`routes/require-auth.tsx`의 `RequireAuth`와 같은 이유).
 *
 * **컴포넌트인 것이 요점이다.** 목적지를 문자열로 돌려주면 네 자리가 각자 `<Navigate>`를
 * 쓰게 되고 규칙이 다시 흩어진다.
 */
export function SignedOut(): ReactElement {
  return <Navigate to="/login" replace />
}
