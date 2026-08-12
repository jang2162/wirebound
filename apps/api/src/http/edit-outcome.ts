/**
 * 편집 파이프라인의 실패 사유를 HTTP 에러로 옮긴다. **매핑 표가 곧 이 함수다.**
 *
 * **`routes/pages.ts`에 있던 것을 P5-1이 여기로 옮겼다** — 코멘트 라우트가 두 번째
 * 소비자가 됐기 때문이다(`POST .../comments`가 번호를 부여하려고 같은 `applyEdit`을
 * 부른다 — P5-1 계획서 D2). `http/warnings.ts`가 P4c-1에서 같은 이유로 생긴 자리이고,
 * 규칙은 하나다: **같은 위험에 대한 규칙을 두 벌로 두지 않는다.** 두 벌이면 한쪽만
 * 고쳐지고, `stale`이 한 라우트에서는 409인데 다른 라우트에서는 400이 되는 식으로
 * 갈린다 — 그 어긋남은 클라이언트가 `code`로 분기하므로 화면에서 드러난다.
 *
 * **`default` 절을 두지 않는다.** 반환 타입을 `ApiError`로 못박아 두면 `EditOutcome`에
 * 새 사유가 생기는 순간 "값을 반환하지 않고 끝나는 경로가 있다"로 컴파일이 깨진다.
 * `default`를 두면 그 신호가 사라지고, 새 사유가 조용히 엉뚱한 상태 코드로 나간다.
 */
import { badRequest, conflict, notFound, validationFailed, type ApiError } from '../errors'
import type { EditOutcome } from '../services/edit-pipeline'

export function editOutcomeToApiError(
  outcome: Extract<EditOutcome, { ok: false }>,
  baseSeq: number,
): ApiError {
  switch (outcome.reason) {
    case 'not-found':
      return notFound()
    case 'stale':
      // 현재 headSeq를 에러 봉투의 새 필드가 아니라 **메시지에** 싣는다: 봉투는
      // `{ error: { code, message, issues? } }` 하나뿐이고, 409를 받은 클라이언트는
      // 어차피 페이지를 재조회한다 — 권위 있는 값은 그 재조회 응답의 headSeq다.
      // 여기 숫자는 사람이 로그를 읽을 때를 위한 것이다.
      return conflict(`페이지가 이미 변경되었습니다 (요청 baseSeq ${baseSeq}, 현재 ${outcome.headSeq})`)
    case 'patch-failed':
      // 400이 아니라 409인 이유: 본문 자체는 계약을 지켰다(zod를 통과했다). 서버
      // 문서의 현재 모양과 맞지 않을 뿐이라 stale과 같은 성질의 충돌이고, 클라이언트의
      // 대응도 같다 — 재조회 후 다시 시도한다.
      return conflict(`편집을 적용할 수 없습니다: ${outcome.message}`)
    case 'invalid':
      return validationFailed('스키마 검증에 실패했습니다', outcome.issues)
    case 'unsupported-version':
      return badRequest(outcome.message)
    case 'nul-byte':
      return badRequest('문서에 NUL 문자(U+0000)를 포함할 수 없습니다')
  }
}
