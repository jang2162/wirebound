/**
 * **테마 갤러리 — ② W3이 채운다. 지금은 자리만 있다.**
 *
 * 이 파일이 왜 비어 있는데 존재하는지는 `token-editor.tsx` 머리말에 있다.
 * **`routes/theme-editor.tsx`를 열지 마라.**
 *
 * ---
 *
 * # 계약 — **초안을 다시 해석하지 마라**
 *
 * `resolved`를 **props로 받는다.** 스토어에서 초안을 꺼내 `resolveDraft`를 다시 부르면
 * **같은 초안에 대해 해석이 둘이 되고 갈릴 수 있다** — `routes/theme-editor.tsx`가 한 번
 * 해석해 갤러리·이슈 패널·CSS 주입 셋에 나눠 주는 것이 그 이유다(`draft-css.ts`의
 * `resolveDraft` 주석과 `use-theme-css.ts`의 `CompiledCss.resolved`가 같은 판단이다).
 *
 * **CSS도 주입하지 마라.** `routes/theme-editor.tsx`가 `useDraftCss`로 이미 싣고 있다.
 * 여기서 또 넣으면 **캔버스의 공유 시트를 덮는 그 사고**가 되살아난다(재라 #2 —
 * `draft-css.ts` 머리말의 관측 표).
 *
 * ---
 *
 * # 무엇을 그리는가
 *
 * 카탈로그가 선언한 컴포넌트를 **테마가 고른 구조로** 그린다. 배선은 이미 있다:
 * `themeStructures(resolved)`를 `renderDocument`의 `options.structures`에 넘긴다
 * (`canvas/canvas.tsx`가 같은 형태다).
 *
 * - **`resolved`가 `null`이면 `error`가 있다는 뜻이다.** 그때 무엇을 그릴지는 W3이 정한다 —
 *   렌더러는 테마 없이도 그리므로(카탈로그의 첫 구조를 쓴다) 빈 화면이 되지는 않는다.
 * - **`import '../catalog-setup'`이 필요하다.** 없으면 모든 노드가 폴백으로 그려진다
 *   (그 모듈의 주석 참고).
 * - **P4b-3 ③이 미리보기 문서를 만들어 봤지만 저장소에 없다**(스크래치패드였다) —
 *   이 슬라이스가 그것을 **처음으로 코드에 남긴다.**
 *
 * ## 재라 #5는 W3이 정한다
 *
 * *"컴포넌트 전부를 한 번씩인지, 구조 옵션마다인지."* **후자면 45개다**(P4b-2가 구현한 수,
 * P4b-3 ③이 재확인했다). 그러나 **구조 선택은 컴포넌트 타입 단위라**(P4b-3 이월 §D 벽 1)
 * 한 문서 안에서 같은 타입을 두 구조로 그릴 수 없다 — 구조 옵션마다 그리려면 **문서를
 * 나누고 `structures` 맵을 갈아 끼워 여러 번 렌더해야 한다.** 그 비용을 알고 정하라.
 *
 * ## 이 상자는 **문서를 감싸는 상자**다
 *
 * 여기 그려지는 것은 문서 노드(`[data-wb-component]`)다. 그래서 `.wb-shell-theme-gallery`가
 * `test/shell-css-guard.ts`의 `WRAPPERS`에 **이미 들어가 있다** — ①이 미리 넣었다.
 * **재서 확인했다:** 그 목록에 없는 상태로 그 상자에 `font-family`를 걸면 전체 회귀가
 * **0 사망**이고, 넣어 두면 **14 사망**이다. 즉 그 두 줄이 없으면 D7 위반이 조용히 지나간다.
 *
 * **갤러리 안쪽에 새 상자를 만들면 그것도 `WRAPPERS`에 더해야 한다** — 그 목록을 사람이
 * 갱신해야 하는 것이 그 검사의 알려진 사각이다(그 파일 머리말).
 */
import type { ReactElement } from 'react'
import type { ResolvedTheme } from '@wirebound/themes'

export function ThemeGallery(props: { resolved: ResolvedTheme | null }): ReactElement | null {
  void props.resolved
  return null
}
