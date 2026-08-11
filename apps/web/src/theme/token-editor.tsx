/**
 * **토큰 GUI — ② W1이 채운다. 지금은 자리만 있다.**
 *
 * ---
 *
 * # 이 파일이 왜 비어 있는데 존재하나 — ①의 P5가 재서 만든 자리다
 *
 * ②의 셋(W1·W2·W3)이 각자 워크트리에서 병렬로 일한다. **셋 다 자기 화면을 화면에
 * 등록해야 하는데, 등록 지점이 한 파일이면 셋이 같은 몇 줄을 고쳐 병합이 반드시 충돌한다.**
 * 그것은 테스트가 못 잡는 부류다 — ①이 스텁으로 밟아 보고 **전체 회귀 0 사망**을 확인했다
 * (충돌은 회귀가 아니라 `git merge`에서 난다).
 *
 * 그래서 ①이 **등록을 미리 끝내 두었다.** `routes/theme-editor.tsx`가 이 이름을 이미
 * import하고 이미 자리에 그리고 있으므로, **W1은 이 파일 하나만 고치면 된다.**
 *
 * > **셋 다 `routes/theme-editor.tsx`를 열지 마라.** 열어야 할 것 같으면 그것은 아래
 * > 계약이 모자라다는 뜻이고, 그때는 고치지 말고 **코디네이터에게 물어라** — 셋 중
 * > 하나만 그 파일을 고쳐야 병합이 선다.
 *
 * ---
 *
 * # 계약
 *
 * - **초안은 `useThemeDraftStore()`에서 꺼낸다.** props로 받지 않는 것은 D3의
 *   *"초안 하나가 테마 문서 전체다"* 때문이다 — 셋이 같은 스토어를 봐야 갈리지 않는다.
 * - **쓰기는 `store.putSection(절, 값)` 하나다.** 그 절만 갈아 끼우고 나머지는 건드리지
 *   않는다. 토큰 GUI가 쓰는 절은 `tokens` 하나다(§6.3의 3단 — `palette`·`semantic`·`scale`).
 * - **서버를 부르지 마라.** 저장은 `routes/theme-editor.tsx`가 한다(D3 — 저장 전까지 서버에
 *   안 보낸다). `test/api-consumers.test.ts`가 그것을 실행으로 지킨다: 이 파일에서
 *   `api.*`를 부르면 그 케이스가 죽는다(①이 심어서 확인했다 — **1 사망**).
 * - **이슈를 여기서 그리지 마라.** `theme/theme-issues.tsx`가 한 곳에서 그린다(D4).
 * - **클래스는 `wb-shell-` 접두어다.** 아래 CSS 절 참고.
 *
 * ## 어휘 — **드롭다운을 하드코딩하지 마라**(P4c-1 이월 §1이 쟀다)
 *
 * | 자리 | 고를 수 있는 이름공간 | 상수 |
 * |---|---|---|
 * | 컴포넌트 스타일 값 | 토큰 7 + primitives 3 = **열** | `TOKEN_NAMESPACES` + `STYLE_PRIMITIVE_NAMESPACES` |
 * | `primitives` 값 | **토큰 7만** — primitives를 고르면 `bad-style-value`(**error**) | `TOKEN_NAMESPACES` |
 * | `breakpoints` | **어디에도 없다** | — |
 *
 * **`breakpoints`를 제안하면 사용자를 함정에 빠뜨린다** — `--wb-breakpoints-md`라는 변수가
 * 존재하지 않아 `var()`가 빈 값으로 풀리고 선언이 **조용히 죽는다**(그쪽이 쟀다).
 *
 * ## `--wb-shell-` 접두어를 쓰지 마라 (클래스 말고 **CSS 변수**)
 *
 * 토큰 미리보기가 값을 보이려고 CSS 변수를 만들 일이 있으면 그 이름은 테마의 것
 * (`--wb-…`)이지 셸의 것이 아니다. **셸의 여섯과 교집합이 비어 있어야** D5의 분리가
 * 유지된다(`shell.css`의 팔레트 절).
 *
 * ---
 *
 * # 재라 #4는 W1이 정한다
 *
 * *"컬러 피커와 텍스트 입력 중 어느 쪽이 진실인가."* `<input type="color">`는 `#rrggbb`만
 * 받으므로 **`rgba()`·참조 문자열(`palette.gray-500`)을 못 담는다.** §6.3이 `semantic`을
 * `palette` 참조로 두는 것을 권하므로 **참조를 못 적는 편집기는 3단을 무너뜨린다** —
 * 그 사실을 안고 정하라.
 */
import type { ReactElement } from 'react'

export function TokenEditor(props: { locked: boolean }): ReactElement | null {
  // **`props`를 읽는 자리를 남겨 둔다** — 안 읽으면 `noUnusedParameters`가 막는다.
  void props.locked
  return null
}
