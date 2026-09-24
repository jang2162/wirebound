/**
 * **서버가 편집 응답에 실어 보낸 문서 경고를 그리는 자리**(설계서 「정방향 흐름」).
 *
 * ## 왜 있어야 하나
 *
 * 서버는 `PATCH .../ops`·`PUT .../schema` 응답에 `warnings`를 싣는다
 * (`apps/api/src/routes/pages.ts`의 `withWarnings`). **클라이언트가 그 필드를 읽지 않으면
 * 경고는 조용히 버려진다.**
 *
 * **그 대가가 크다.** 상호작용 이슈 셋이 전부 `warning`이라(`error`로 두면 타겟이 된
 * 노드를 지우는 편집이 422가 된다) **끊긴 타겟이 문서에 남은 채 저장되는데, 이 자리가
 * 없으면 아무도 그것을 볼 수 없다.** 여기가 그 이슈들이 **사람에게 닿는 자리**다.
 *
 * ## 왜 여기인가
 *
 * **편집 실패 통지(`EditAlert`) 옆이다.** 후보 셋을 놓고 골랐다:
 *
 * | 후보 | 판정 |
 * |---|---|
 * | **셸 머리 — 통지 옆** | **골랐다.** 편집의 결과라는 점이 실패와 같고(`EditAlert`이 그 자리를 한 곳으로 모은 근거가 그것이다), 어느 탭을 보고 있어도 눈에 든다 |
 * | 상호작용 탭 | 경고가 상호작용만이 아니다 — `ignored-variant`도 같은 채널이고, 그 탭에 두면 그 탭이 남의 것까지 소유하게 된다 |
 * | 캔버스 | 렌더 실패 배너와 자리가 겹친다. 그쪽은 *"이 문서를 못 그렸다"*이고 이쪽은 *"그렸지만 규칙이 깨져 있다"*라 섞이면 갈라 읽을 수 없다 |
 *
 * ## 실패가 아니다 — `role`이 다르다
 *
 * `EditAlert`은 `role="alert"`이고 이쪽은 `role="status"`다. **저장은 성공했다.** 경고를
 * `alert`으로 내면 보조 기술 사용자가 방금 한 편집이 실패한 줄 안다 — `RemoteAlert`가
 * `'diverged'`를 `alert`이 아니라 `status`로 두는 것과 같은 판정이다.
 */
import type { ReactElement } from 'react'
import { useEditorStore, useEditorStoreInstance } from '../store/use-editor-store'

/** 머리글. 몇 개인지 먼저 말한다 — 목록만 있으면 그것이 무엇인지 알 수 없다. */
function heading(count: number): string {
  return `저장했지만 문서에 경고 ${count}개가 있습니다`
}

export function EditWarnings(): ReactElement | null {
  const store = useEditorStoreInstance()
  const warnings = useEditorStore(store, (s) => s.editWarnings)

  if (warnings.length === 0) return null

  return (
    <div className="wb-shell-edit-warnings" role="status">
      <p className="wb-shell-edit-warnings-title">{heading(warnings.length)}</p>
      <ul className="wb-shell-edit-warnings-list">
        {/* **키가 `path`다** — 이슈 하나는 문서의 한 자리에 매여 있고, 같은 자리에 두 코드가
            함께 나오는 경우가 있어(`unknown-variant`와 `ignored-variant`는 배타적이지만
            상호작용 셋은 액션마다 하나다) `code`를 함께 넣는다. */}
        {warnings.map((issue) => (
          <li key={`${issue.path}:${issue.code}`} className="wb-shell-edit-warnings-item">
            {issue.message}
          </li>
        ))}
      </ul>
    </div>
  )
}
