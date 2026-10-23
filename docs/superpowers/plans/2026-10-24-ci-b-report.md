# CI-B 보고 — 자리표시자 · 그림 올리기(3단계 문제 2)

설계: `docs/superpowers/specs/2026-10-24-compose-input-design.md` «문제 2 — 자리표시자». 브리프 `brief-ci-b.md` · 공통 규칙 `common-w8.md`. 판 번호는 SDK 1.5.0 · `system-admin` 1.5.0 이다(CI-A 의 1.4.0 위 — CI-A 병합 뒤 다시 맞춘다).

## B1 — props · 몸통 · 색 칸

### 바꾼 것

| 자리 | 무엇 |
| --- | --- |
| `packages/schema/src/component/catalog/document.ts` | `Placeholder` props: `label` · `width` · `height`(20 ~ 2000 · 선택) · `background` · `borderColor` · `color`(`PLACEHOLDER_COLOR` 소문자 `#rrggbb` 또는 `''` · 선택) · `border`(`dashed` · `solid` · `none`) · `radius`(0 ~ 999) · `fontSize`(10 ~ 72) · `align`(`start` · `center` · `end`) · `padding`(0 ~ 200). 몸통 구역 `body` «내용» |
| `packages/schema/src/component/define.ts` | `EditorControl` 에 `color` |
| `packages/theme-sdk/src/placeholder.ts`(새) | `placeholderVars(props)` · `PLACEHOLDER_VARS` — 정한 값만 `--wb-node-placeholder-*` 로(꼴 밖은 다시 거른다) |
| `packages/theme-sdk/src/default-views/document.tsx` | `PlaceholderView` — 뿌리에 변수 · 몸통이 있으면 `content`, 없으면 `label`. 기본 CSS(특이도 0): 변수 끊기 · 가로 줄 세우기 · 빈 칸 120px · 표지 규칙 · `Flex` 몫이면 너비가 바닥 |
| `packages/theme-sdk/src/marks.ts` | `Placeholder: { border, align }` |
| SDK 판 | 1.3.0 → 1.5.0(`version.ts` · `package.json`) |
| `system-themes/admin` | `theme.css` 가 변수를 대체값과 함께 읽는다 · 테두리 꼴 표지 · 몸통 `Text` 가 글 색을 물려받는다. 1.5.0(`sdk ^1.5.0`) · `checksums.json` 새 줄 |
| `packages/theme-gallery/src/samples.ts` | 자리표시자 표본 «정한 색 · 모서리 · 여백»(`PLACEHOLDER_SET_PROPS`) · «칩(내용)» |
| `packages/theme-kit/src/check.ts` | 정한 값 표본의 뿌리 변수를 잰다(`source: 'placeholder'`) |
| `packages/theme-kit/src/shots.ts` | 정한 값 표본의 계산 값을 실 Chromium 으로 잰다(`placeholder` · 문제 줄) |
| `packages/theme-kit/template` | `SKILL.md` 뷰 계약 · sdk 범위 `^1.5.0` |
| `apps/web/src/panels/controls/color-control.tsx`(새) | 색 칸 — 지금 색 · 글 칸(blur · Enter) · 고르개(`change` 한 번) · «테마 기본»(지우기) · 견본 열둘 · 잠금에 다 꺼짐 |
| `apps/web/config/llms-txt.ts` · `public/llms.txt` | 자리표시자 영어 설명 · `anyOf` · `pattern` 꼴 |
| 정본 설계서 | §4 «예외는 `Placeholder` 하나다» · 카탈로그 표 · §6.1 표지 목록 · «자리표시자의 그리기 값은 노드 변수로 실린다» · 속성 탭 «색 칸» |

### 결정과 이유

- **`wb-theme check` 는 계산된 색을 못 잰다 — 둘로 나눴다**(설계 «8» 과 다르다 · `q-ci-b.md` Q-B1). jsdom 25.0.1 은 특이도를 안 보고(문서 차례만) `var()` 를 안 푼다(계산 값이 `var(--x, blue)` 글자). 그래서 `check`(jsdom)는 뷰가 뿌리에 변수를 싣는지(오류), `shots`(실 Chromium)는 계산된 `background-color` · `border-top-color` · `border-top-style` · `color` · 모서리 · 글 크기 · 여백이 정한 값인지(문제 줄)를 잰다.
- **이미지 prop(`image` · `imageFit`)은 B2 에 넣는다** — B1 만 든 판에 위젯 없는 control 이 서지 않게.
- **색은 스키마가 소문자만 받는다** — 위젯이 대문자 · `#` 없는 여섯 자리를 바꿔 보낸다. 서버는 `#2563EB` 를 422 로 거절한다(문서에 두 표기가 섞이지 않게).
- **`Flex` 안에서 몫을 받은 자리표시자의 너비는 바닥(`min-width`)이다** — 몫 규칙 `flex: <몫>` 이 바탕 폭을 0 으로 두어 `width` 가 안 듣는다. 바탕 폭을 너비로 두려면 렌더러의 몫 변수 꼴을 바꿔야 해서(`Grid` 가 같은 변수를 칸 수로 읽는다) 안 했다.
- **안의 `Text` 는 기본테마에서 글 색만 물려받는다** — 글 크기까지 물려받게 하면 몸통의 제목(`h1`)이 캡션 크기가 된다.

### 잰 값

- `wb-theme shots` — `system-admin` 390 · 1280 두 폭에서 정한 값 표본의 계산 값 7 속성 다 정한 값(`placeholder: []`). 스타터 템플릿(풀어서 빌드한 판) 1280 에서도 `[]`.
- 서버 거절 — `PUT …/schema` · `PATCH …/ops` 둘 다 `url(https://example.com/x.png)` · `#2563eb;color:red` · `#2563eb}` · `var(--wb-x)` · `#2563EB` · `red` · `#fff` 를 세 색 prop 마다 422(`invalid-props`) · 편집은 문서 · `headSeq` 를 안 바꾼다. `Text` 의 `background` 도 422(모르는 prop).
- 번들 바이트 — 상태 없는 페이지 번들에서 바뀐 파일은 `assets/views.css` 하나(`bef9cb8070612849` → `d640f37f50db8546`) · 페이지 HTML 그대로.

### 혼자 죽는 변조(B1)

변조마다 그 케이스 파일만 돌렸다. 복원은 경로 이름 백업 · 바이트 비교. 빌드 산출물을 거친 것(M2 · M5)은 복원 뒤 `pnpm --filter '@wirebound/theme-kit...' build` 를 다시 돌렸다.

| 변조 | 자리 | 죽은 케이스(실행 · 실패) | 실패 값 |
| --- | --- | --- | --- |
| M1 정한 값 검사를 안 부른다 | `theme-kit/src/check.ts` | check «정한 그리기 값을 안 싣는 …» (10 · 1) | `[]` ≠ 변수 여덟 |
| M18 «다르면» → «비었으면» | 〃 | 같은 케이스 (10 · 1) | 틀린 값 하나를 못 잡음 `[]` |
| M2 계산 값 다름을 안 적는다 | `theme-kit/src/shots.ts` | shots «자리표시자 변수를 덮는 …» (5 · 1) | 종료 코드 0(1 이어야) |
| M3 기본테마 바탕이 변수를 안 읽는다 | `system-themes/admin/src/theme.css` | shots «system-admin 을 두 폭으로 …» (5 · 1) | `placeholder` 한 줄 |
| M17 기본테마 `solid` 표지 규칙을 뗀다 | 〃 | 같은 케이스 (5 · 1) | `border-top-style` 한 줄 |
| M5 템플릿 CSS 가 바탕을 덮는다 | `theme-kit/template/src/theme.css` | template «자리표시자가 정한 …» (9 · 1 · 건너뜀 1 = 설치 판) | `placeholder` 한 줄 |
| M6 고르개를 `input` 에 커밋 | `color-control.tsx` | color «고르개는 …» (6 · 1) | 편집 3 개(0 이어야) |
| M7 소문자로 안 바꾼다 | 〃 | color `normalizeColor` · «글 칸은 blur …» (6 · 2) | `null` · 편집 0 |
| M8 꼴 밖에 말하지 않는다 | 〃 | color «꼴 밖의 글 …» (6 · 1) | `alert` 없음 |
| M9 견본이 잠금에 안 꺼진다 | 〃 | props-lock «위젯 여덟이 …» (23 · 1) | `color` 칸 하나 `false` |
| M10 «테마 기본» 이 다른 색을 보낸다 | 〃 | color ««테마 기본» 은 …» (6 · 1) | `replace` ≠ `remove` |
| M11 뿌리마다 변수 끊기를 뗀다 | `theme-sdk/src/default-views/document.tsx` | placeholder-view «기본 CSS 가 …» (5 · 1) | 끊는 줄 없음 |
| M12 몸통 판정을 뒤집는다 | 〃 | placeholder-view «몸통이 없으면 라벨 …» (5 · 1) | 라벨 없음 |
| M13 색 거름을 «비지 않음» 으로 | `theme-sdk/src/placeholder.ts` | placeholder-view «placeholderVars 는 꼴 밖의 …» (5 · 1) | 변수 셋 |
| M14 색 꼴의 끝 닻(`$`)을 뗀다 | `schema/.../document.ts` | api placeholder-props 둘 (2 · 2) | `#2563eb;color:red` 200 |
| M16 표지 표에서 자리표시자를 뺀다 | `theme-sdk/src/marks.ts` | prop-marks (92 · 5) | 표지 없음 · DOM 같음 |
| M19 `anyOf` 꼴을 안 읽는다 | `apps/web/config/llms-txt.ts` | llms-txt «public/llms.txt 가 …» (2 · 1) | 생성물 다름 |
