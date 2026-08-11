/**
 * **JSON 에디터 — ② W2가 채운다. 지금은 자리만 있다.**
 *
 * 이 파일이 왜 비어 있는데 존재하는지는 `token-editor.tsx` 머리말에 있다(①의 P5가 밟아서
 * 만든 자리다 — 셋이 한 파일에서 등록하면 병합이 충돌하고 **그 충돌은 회귀가 못 잡는다**).
 * **`routes/theme-editor.tsx`를 열지 마라.**
 *
 * ---
 *
 * # 계약
 *
 * - **초안은 `useThemeDraftStore()`에서 꺼내고 쓰기는 `putSection` 하나다**(D3).
 *   이 화면이 쓰는 절은 셋이다: `components` · `patterns` · `primitives`.
 * - **세 절을 한 상자에 넣지 마라**(D6). 서로 다른 절이고 이슈 경로도 갈린다.
 * - **`<textarea>`다. 새 런타임 의존을 더하지 마라**(D6 — 사용자가 정했다). 구문 강조·접기는 없다.
 * - **서버를 부르지 마라**(D3). `test/api-consumers.test.ts`가 실행으로 지킨다.
 *
 * ## 파싱 실패와 검증 실패를 가른다 (D6)
 *
 * | 무엇 | 언제 | 사용자가 할 일 |
 * |---|---|---|
 * | **파싱 실패** | `JSON.parse`가 던진다 | 문법을 고친다. **초안에 넣지 마라** — 못 읽은 것을 초안으로 만들면 갤러리가 앞 값으로 남아 *"고쳤는데 안 바뀐다"*가 된다 |
 * | **검증 실패** | 파싱은 됐고 `resolveTheme`이 이슈를 낸다 | 값을 고친다. **초안에는 들어간다** — 그래야 이슈가 그 값을 가리킨다 |
 *
 * **검증 이슈를 여기서 그리지 마라** — `theme/theme-issues.tsx`가 `path`까지 갖춰 한 곳에서
 * 그린다(D4). 여기서 그릴 것은 **파싱 실패 하나**이고, 그것은 이슈 채널에 없는 정보다.
 *
 * ## 알고 가야 할 것 둘
 *
 * 1. **`patterns`는 오늘 화면에 안 나온다**(P4b-3 §G.3 — 전개가 P7의 몫이다). JSON으로
 *    편집할 수는 있지만 갤러리에 아무것도 안 그려진다. **그 사실을 UI가 말해야 하는지는
 *    W2가 판정한다**(계획서가 그렇게 넘겼다).
 * 2. **primitives 값의 오타는 이제 `warning`을 낸다**(P4c-1 F1 — `suspicious-literal`).
 *    `error`가 아니라 저장이 된다. **P4c-1 이월 §1-①이 *"P4c-2가 이 판정을 뒤집을 수 있다"*고
 *    적었다** — 이 편집기가 primitives 값의 **전수**를 만들므로, 거짓 양성 0건을 **측정하면**
 *    전용 `error` 코드가 정당해진다. 재면 보고에 적어라(측정 없이 바꾸지는 마라).
 */
import type { ReactElement } from 'react'

export function JsonEditor(props: { locked: boolean }): ReactElement | null {
  void props.locked
  return null
}
