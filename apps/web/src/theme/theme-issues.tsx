/**
 * 테마 이슈를 화면에 그린다. **저작 UI가 이슈를 보여 주는 것이 자기 일인 화면이다.**
 *
 * ---
 *
 * **캔버스의 규칙 *"이슈는 콘솔에만"*의 유효 범위 밖이다**(정본은 `theme/use-project-theme.ts` 머리말의 «이슈는
 * 콘솔에만 남긴다»). 그 규칙의 근거는 *"캔버스에 뿌리면 근원 하나를 나머지가 가린다"*이고 — 토큰 하나를 어긋내면
 * 이슈가 줄줄이 난다 — **캔버스에 대한 것**이다.
 * 여기서는 사용자가 방금 고친 값에 대한 답이므로 폭포 자체가 정보다.
 *
 * ---
 *
 * **severity가 모양을 가른다. 셋이 다르다:**
 *
 * | severity | 뜻 | 저장 | 이 화면 |
 * |---|---|---|---|
 * | `error` | 테마가 안 선다(`resolveTheme`이 `null`) | **막힌다** — 서버가 422다 | `role="alert"`. 저장 버튼을 끄는 근거이기도 하다 |
 * | `warning` | 테마는 선다 | **된다** | 조용한 목록. `role="alert"`이 **아니다** |
 *
 * **가르는 것은 `partitionIssues` 하나다.** 손으로 `severity === 'error'`를 비교하지 않는다 —
 * `packages/themes`의 소스 훑기 가드가 그 패키지 안에서 그것을 막지만, 그
 * 가드는 `apps/web`을 안 본다. **가드가 못 보는 자리에서
 * 규칙을 지키는 것이 이 import의 뜻이다.**
 *
 * ---
 *
 * **경고 안에서도 둘이 다르다** — *"둘을 같은 빨간 배지로 내면 둘째가 소음이
 * 된다"*. severity가 같으므로 모양이 아니라 **문안**으로 가른다:
 *
 * | 코드 | 무엇 | 사용자가 할 일 |
 * |---|---|---|
 * | `suspicious-literal` | 값이 참조처럼 생겼는데 이름공간이 목록 밖이다(`"spce.4"`) | **오타면 고친다.** 리터럴로 의도했으면 그대로 둔다 |
 * | `node-handle-overwrite` | 테마가 노드 손잡이의 CSS 프로퍼티를 덮는다 | **아무것도 안 해도 된다** — 설계서 「components — 구조 + 스킨」대로 테마가 이기는 것이 옳다 |
 *
 * **표에 없는 코드는 문안 없이 이슈만 그린다.** 코드가 늘 때 이 표를 갱신하지 않으면
 * *"설명이 빠진 이슈"*가 되지 *"틀린 설명이 붙은 이슈"*가 되지는 않는다 — 후자가 더 나쁘다.
 * (표를 강제하는 검사는 안 만들었다. `THEME_ISSUE_SEVERITY`처럼 `Record<ThemeIssueCode, …>`로
 * 두면 컴파일러가 강제하지만, 그러면 **설명할 말이 없는 코드에도 문장을 짜 넣게 된다.**)
 *
 * ---
 *
 * **`path`를 반드시 그린다**(*"그 경로로 자리를 짚어라"*). 목록만 있으면 어디를 고칠지
 * 사용자가 다시 찾는다. 글자로만 짚는다 — **누르면 그 자리로 가는 것(`onSelectPath`)은 없다.**
 *
 * > **갈 자리도 재료도 있다** — 토큰 GUI·JSON 에디터가 있고, 토큰 GUI 입력의 접근성 이름이
 * > 이슈의 `path`와 글자까지 같다. 만들지 않은 채 열린 자리다.
 */
import { useId, type ReactElement } from 'react'
import { partitionIssues } from '@wirebound/schema'
import type { ThemeIssue, ThemeIssueCode } from '@wirebound/themes'

/**
 * 경고 코드마다 *"그래서 무엇을 해야 하나"*. **`Partial`인 것이 판정이다** — 위 머리말 참고.
 */
const WARNING_HINTS: Partial<Record<ThemeIssueCode, string>> = {
  'suspicious-literal': '오타라면 고치고, 값 그대로 쓰려던 것이라면 그대로 두세요.',
  'node-handle-overwrite': '의도된 동작입니다 — 이 값은 노드에서 고른 것보다 우선합니다.',
}

/**
 * 이슈 목록 하나. **`error`와 `warning`을 갈라 그린다.**
 *
 * @param title 어디서 온 이슈인가. **두 채널이 있어서 필요하다**:
 *   편집 중 이슈는 **클라이언트가 계산한 것**이고 저장 응답의 `warnings`는 **서버가 판정한
 *   것**이다. 둘을 같은 상자에 뭉치면 갈릴 때 어느 쪽이 무엇인지 알 수 없다.
 *
 * ---
 *
 * **`title`이 눈에 보인다.**
 *
 * `aria-label`로만 내면 *"보조 기술은 가르고 눈은 못 가른다"* — 두 상자의 보이는 글자가
 * **글자까지 같아**, 사용자는 *"왜 같은 알림이 두 번 뜨지"*로 읽는다.
 *
 * 가져오기가 **셋째 상자**(*"가져오기가 거절한 이유"*)를 띄우고,
 * 그것은 편집 중 검증과 **다른 문서**에 대한 판정이다 — 내가 안 고친 초안에 대한 이슈와
 * 방금 거절된 파일에 대한 이슈가 한 화면에 함께 뜬다.
 *
 * **`aria-label`이 아니라 `aria-labelledby`다.** 제목이 화면에 있으면 `aria-label`은 같은
 * 말을 두 번 하는 것이고, 보조 기술이 보이는 제목과 다른 이름을 읽게 될 자리를 만든다.
 * `useId`를 쓰는 것은 이 상자가 한 화면에 여럿 뜨기 때문이다 — 제목 글자로 id를 만들면
 * 같은 제목 둘이 충돌한다.
 *
 * **`<h2>`인 이유:** 라우트의 `<h1>`이 테마 이름이고 이 안의 `<h3>`가 severity 묶음이다.
 */
export function ThemeIssueList(props: { title: string; issues: readonly ThemeIssue[] }): ReactElement | null {
  const headingId = useId()
  const { errors, warnings } = partitionIssues(props.issues)
  if (errors.length === 0 && warnings.length === 0) return null

  return (
    <section className="wb-shell-theme-issues" aria-labelledby={headingId}>
      <h2 className="wb-shell-theme-issues-title" id={headingId}>
        {props.title}
      </h2>
      {errors.length > 0 && (
        <IssueGroup
          className="wb-shell-theme-issue-group"
          heading={`오류 ${errors.length}건 — 저장할 수 없습니다`}
          issues={errors}
          // **`alert`은 오류에만 붙인다.** 경고까지 alert이면 보조 기술이 두 부류를 같은
          // 무게로 읽고, `node-handle-overwrite`가 저장을 막는 것처럼 들린다.
          alert
        />
      )}
      {warnings.length > 0 && (
        <IssueGroup
          className="wb-shell-theme-issue-group"
          heading={`알림 ${warnings.length}건 — 저장은 됩니다`}
          issues={warnings}
        />
      )}
    </section>
  )
}

function IssueGroup(props: {
  className: string
  heading: string
  issues: readonly ThemeIssue[]
  alert?: boolean
}): ReactElement {
  return (
    <div className={props.className} {...(props.alert === true ? { role: 'alert' } : {})}>
      <h3 className="wb-shell-theme-issue-heading">{props.heading}</h3>
      <ul className="wb-shell-theme-issue-list">
        {props.issues.map((issue, index) => (
          // **`key`가 인덱스인 것은 의도다.** 이슈에는 id가 없고 `path`는 유일하지 않다 —
          // 한 경로에서 코드가 다른 이슈가 둘 날 수 있다. 목록은 통째로 다시 계산되므로
          // 재정렬로 인한 상태 유실이 없다(항목이 상태를 갖지 않는다).
          <li key={`${issue.path}:${issue.code}:${index}`} className="wb-shell-theme-issue">
            {/* **경로를 먼저 그린다** — 사용자가 찾는 것은 "어디"이지 "무엇"이 아니다. */}
            <code className="wb-shell-theme-issue-path">{issue.path}</code>
            <span className="wb-shell-theme-issue-message">{issue.message}</span>
            {WARNING_HINTS[issue.code] !== undefined && (
              <span className="wb-shell-theme-issue-hint">{WARNING_HINTS[issue.code]}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * **저장을 막아야 하는가.** `error`가 하나라도 있으면 그렇다.
 *
 * 화면이 미리 막는 이유는 *"사용자가 422를 안 보게 한다"*다. 서버가 같은 것을
 * 다시 판정하므로 이 함수가 틀려도 **덜 막는 쪽**이면 서버가 잡고, **더 막는 쪽**이면
 * 저장할 수 있는 것을 못 저장한다. 그래서 판정을 여기서 새로 만들지 않고
 * `partitionIssues`를 그대로 쓴다.
 */
export function blocksSave(issues: readonly ThemeIssue[]): boolean {
  return partitionIssues(issues).errors.length > 0
}
