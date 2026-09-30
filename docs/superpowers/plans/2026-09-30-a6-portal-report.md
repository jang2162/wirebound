# A6 테마 트랙 보고 — `system-portal`

계획: `docs/superpowers/plans/2026-09-30-a6-system-themes.md` 「T1 ~ T5 — 테마 트랙」(`<id>` = `portal`). 브랜치 `feat/a6-portal`.
이 문서는 발행 시점의 기록이다(`docs/guideline/base/04-citation.md` 「이력 문서는 연대기 금지의 예외다」).
설계 원천: `git show b2766e8c^:packages/themes/src/system/portal.ts`(머리말 «무엇이 다른가» 셋 — 읽는 화면 · 선으로 나눔 · 접고 폄).

## 커밋

| 커밋 | 내용 |
|---|---|
| `309eecf4` | manifest — 토큰 22 · 무리 넷 · 옛 구조를 `defaultVariant` 로, `admin` 의 구조를 곁에 · 패턴 `content.noticeBoard` |
| `ff58de57` | 뷰 다섯(`List` · `Tree` · `KeyValue` · `SearchForm` · `EntryForm`) — 곁의 variant 는 SDK 기본 뷰를 부른다 |
| `c8950ee2` | `theme.css` |
| `36e4ec8b` | 케이스 — `test/portal.test.ts`(선언 · 시트 · 옛 성질) · `test/views.test.tsx`(variant 마다 DOM · 마커) · `build-test/bundle-views.test.tsx`(번들의 뷰) |
| `91ec4695` | 판 `1.0.0` · `checksums.json` 에 `system-portal@1.0.0` 줄을 더함(`0.9.0` 줄은 그대로) |
| (이 보고서) | |

## 옛 → 새 대응

### 토큰 — 선언 22 개(무리 넷)

| 무리 | 새 토큰(`label`) | 옛 자리 · 기본값 |
|---|---|---|
| 색 `color` (15) | `semantic.primary`(주색) · `primaryStrong`(주색(짙게)) · `primarySoft`(주색(옅게)) · `primaryLine`(주색 선) · `surface`(면) · `surfaceMuted`(면(가라앉게)) · `canvas`(바탕) · `border`(테두리) · `borderStrong`(테두리(짙게)) · `divider`(구분선) · `text`(글자) · `textMuted`(글자(흐리게)) · `textFaint`(글자(옅게)) · `danger`(위험) · `dangerSoft`(위험(옅게)) | 옛 `semantic.*` 열다섯 그대로 — 값은 옛 `palette` 를 풀어 적음(`navy.700` → `#13497e` …) |
| 글꼴 `type` (3) | `typography.family.sans`(글꼴) · `typography.body.fontSize`(본문 크기 `15px`) · `typography.body.lineHeight`(본문 행간 `1.7`) | 옛 `typography.family.sans` · `typography.body` |
| 모양 `shape` (2) | `radius.sm`(`2px`) · `radius.md`(`3px`) | 옛 `radius.sm` · `radius.md` |
| 밀도 · 폭 `layout` (2) | `space.unit`(간격 단위 `4px`) · `container.maxWidth`(본문 폭 `1280px`) | 옛 `scale.space.unit` · `primitives.container.maxWidth` |

토큰 폼에 안 내고 `theme.css` 의 `:root` 상수로 둔 것: 간격 단계 `--wb-space-{1,2,3,4,5,10,14}`(= `calc(var(--wb-space-unit) * N)` — 밀도 칸 하나로 전부 바뀐다) · 제목 단계(display ~ h6 · caption 의 크기 · 행간) · `h6` 자간 · `motion.base`(`120ms`) · 키 칸 폭(`120px`).
옮기지 않은 것: `radius.none` · `radius.lg`(옛 컴포넌트가 안 씀) · `shadow.sm` · `shadow.md`(옛 머리말이 «선언만 하고 한 번도 안 쓴다»고 적은 토큰 — 안 쓰는 토큰은 `wb-theme check` 가 거절한다) · `palette.*`(색 토큰이 값을 직접 갖는다) · `primitives.grid` · `primitives.section` · `breakpoints`(시트의 `@media (max-width: 640px)` 상수).

### 구조 → variant · 뷰

옛 테마가 `admin` 과 달리 고른 구조 일곱이 `defaultVariant` 이고, `admin` 의 구조를 곁의 variant 로 두었다(계획 D4 — 한 문서에 둘 다 둔다). 옛 스킨 variant 는 같은 id 로 남겼다(`system-admin` 에서 옮겨 온 노드의 variant 가 그대로 산다).

| 컴포넌트 | 옛 구조 → `defaultVariant` | 곁의 variant | 옛 스킨 variant | 그리는 것 |
|---|---|---|---|---|
| `Card` | `bordered` | `plain` | `featured` | 기본 뷰(DOM 이 같다) · 시트 |
| `Tabs` | `enclosed` | `underline` | — | 기본 뷰 · 시트 |
| `List` | `stackedList` | `table` | `featured` · `compact`(제목 · 날짜 줄 위에 선다) | **뷰** `src/views/List.tsx` |
| `Tree` | `accordion` | `indent` | — | **뷰** `src/views/Tree.tsx` |
| `KeyValue` | `definitionList` | `table` | — | **뷰** `src/views/KeyValue.tsx` |
| `SearchForm` | `collapsible` | `inline` | — | **뷰** `src/views/SearchForm.tsx` |
| `EntryForm` | `sectioned` | `labelLeft` | — | **뷰** `src/views/EntryForm.tsx` |
| `Section` | (`contained` — admin 과 같음) | — | `default` · `hero` · `muted` | 기본 뷰 · 시트 |
| `Button` | (`solid`) | — | `default` · `primary` · `secondary` · `danger` · `ghost` | 기본 뷰 · 시트 |
| `Link` | (`default`) | — | `default` · `muted` | 기본 뷰 · 시트 |

`hideProps`: `List` 의 줄 variant 셋은 `columns`(줄 목록은 컬럼 이름을 안 읽는다) · `KeyValue:definitionList` 는 `columns` · `SearchForm:inline` 은 `collapsed`.
`Text` · `Field` · `Divider` 는 variant 를 prop 에서 얻어 선언하지 않는다(시트가 `data-wb-variant` 로 겨냥한다).

**뷰를 쓴 까닭:** 다섯 모두 옛 구조 구현체의 DOM 이 SDK 기본 뷰(= `admin` 의 구조)와 다르다 — 줄 목록(`ul/li` · `item` · `title` · `meta`), 중첩이 깊이를 나르는 트리(`panel` 중첩 · 들여쓰기 노드 변수 없음), 정의 목록(`dl/dt/dd`), 접히면 자식까지 DOM 에서 빠지는 검색(`toggle`), 자식마다 구획이 서는 서식(`section` · `sectionTitle`). 옛 구조 구현체(`git show b2766e8c^:packages/renderer/src/structures/{data,input}.tsx`)를 글자 그대로 옮겼다. 곁의 variant 는 `src/views/default-view.ts` 의 `defaultView(type)` 로 SDK 기본 뷰를 부른다(표의 타입이 `View | undefined` 라 없으면 싣는 순간 던진다). `Card:bordered` · `Tabs:enclosed` 는 옛 구현체도 기본 구조의 별칭이었다 — 뷰 없이 시트로만 갈린다.

**`Focus` · 마커:** 다섯 뷰 모두 루트가 곧 보이는 상자다(목록의 위쪽 굵은 선 · 트리 · 폼의 테두리가 루트에 걸린다) — `Focus` 도 `marker` 도 두지 않았고, 외곽선 · 마커가 루트를 따른다는 것을 케이스로 잠갔다(`test/views.test.tsx` «마커 · 외곽선은 뷰의 루트를 따른다» — 자식 `Field` 의 자리가 부모로 새지 않는지 포함). 좌표는 jsdom 값이 아니라 손으로 준 상자로 `markerPoint` 가 어느 요소를 재는지만 본다.

### 옛 성질 → 케이스

| 옛 케이스 · 성질 | 새 자리 |
|---|---|
| `system-portal` «서체의 두 층이 같은 이름을 가리킨다» — `@font-face` 이름 = 글꼴 토큰 첫 항목 · `Page` 와 `Button` 이 그 토큰을 건다 | `test/portal.test.ts` 「서체의 두 층이 같은 이름을 가리킨다」 셋(+ `src` 가 `local()` 뿐) |
| `system-section-centered` «inner 에 maxWidth 가 걸린 층마다 marginX 가 auto» | 같은 파일 「Section 은 가둔 칼럼을 가운데 둔다」 둘(폭 토큰 `1280px` · margin 을 덮는 규칙 없음) |
| `system-unresolved-literals` «미해석 리터럴 0 · 검사기 자가 대조» | 같은 파일 「시트의 미해석 값」 셋 — 점 찍힌 맨 이름 0 에 더해 **`:root` 에 없는 변수를 읽는 `var()` 0**(코드 테마에서 조용히 무효가 되는 꼴) |
| 옛 머리말 «면이 아니라 선으로» — `shadow` 를 한 번도 안 씀 · 2 ~ 4px 모서리 | 같은 파일 「면이 아니라 선으로 나눈다」 둘 |
| 옛 머리말 «`admin` 이 안 고르는 구조 일곱» | 같은 파일 `it.each` 일곱(`defaultVariant` · 곁의 variant) |
| 옛 `patterns.content.noticeBoard` | 같은 파일 «패턴 content.noticeBoard 를 옮긴다» |
| 옛 구조 구현체의 DOM(줄 목록 · 첫 마디만 펴짐 · 중첩 깊이 · 접히면 자식 없음 · 자식마다 구획) | `test/views.test.tsx` · `build-test/bundle-views.test.tsx` |

### 옛 테마에서 **못 하던 것**을 이제 한 것

- **박스 탭의 활성 탭이 패널과 이어진다** — 옛 머리말이 «활성 탭을 겨냥할 셀렉터가 아예 없다(열린 질문)»로 적은 것. 기본 뷰가 활성 탭에 `aria-selected` 를 달아 시트가 겨냥한다.
- **조각이 자식 노드로 새지 않는다** — 자식을 품는 컴포넌트는 자식 결합자(`>`)로 조각을 겨냥한다. 옛 테마는 `EntryForm.parts.label` 이 안의 `Field` · `Button` 의 `label` 까지 내려가 되돌리는 스킨 둘을 두었다(`theme.css` 머리말).
- **빈 목록의 제목이 흐려진다** — 옛 `empty` 상태는 줄에 색을 걸어 제 색을 선언한 제목까지 안 내려갔다.
- 밀도가 토큰 하나(`space.unit`)다.

## 스크린숏 — 직접 열어 본 것

경로: `/private/tmp/claude-501/-Users-jang2162-IdeaProjects-wirebound/cd7364a6-937a-4a56-bc50-dbfe60c4e848/scratchpad/a6-shots/portal/`(`system-portal-{390,1280}-{1,2}.png` · `report.json` — 두 폭 모두 콘솔 오류 0 · `data-wb-error` 0 · 넘침 0 · `pageScrollWidth` = 폭). 다시 찍는 법: `pnpm --filter @wirebound/system-theme-portal shots --out <디렉터리>`. 긴 그림은 1400 · 1800px 조각으로 잘라 읽었다.

본 것(1280 · 390):
- **색:** 채도 낮은 남색 — 표지 띠(`Section:hero`)는 짙은 남색 바탕에 흰 글씨, 버튼은 `#13497e`, 흰 면 · 옅은 회청 바탕. 옛 머리말 «색이 앞으로 나오면 안 된다» 그대로다.
- **선 · 모서리:** 카드는 1px 테두리 + 회색 머리 띠(강조는 남색 테두리 + 옅은 남색 띠), 목록은 위쪽 2px 짙은 선 + 행마다 1px 실선, 트리 · 검색 · 서식은 1px 테두리 상자. 모서리는 거의 각지다(2 ~ 3px). 그림자는 어디에도 없다.
- **구조:** 목록은 «항목 N ··· —» 한 줄씩 · 페이지 번호 가운데, 트리는 첫 마디만 펴져 가지가 가라앉은 바탕으로 들어간다, 검색은 «검색 조건 ▾» 머리줄 아래 필드 · 동작 줄(접힘 판은 머리줄만), 서식은 제목 아래 굵은 선 · «구획 1 · 2» 회색 머리글 · 오른쪽 아래 저장 · 취소. 박스 탭은 활성 탭 «나»가 흰 면으로 패널과 이어진다.
- **서체 · 밀도:** 본문 15px 에 행간이 넉넉하고(1.7) 라벨 · 구획 머리글은 13px 굵게 자간을 벌렸다. 간격은 `admin` 과 같은 4px 씨앗.
- **390 폭:** 검색 필드가 한 줄에 하나씩 접혀 흐르고(`flex: 1 1 180px`), 섹션 위아래 여백이 줄고(`@media (max-width: 640px)`), 서식 `labelLeft` 는 라벨 120px 칸 옆에 입력칸이 선다. 넘침 없음.

**어긋나 고친 것**(첫 판 그림에서 보고 고친 뒤 다시 찍음):
1. `KeyValue:definitionList` 의 키와 값이 세로로 어긋났다 — 행과 칸이 여백을 두 겹으로 가졌고 크기가 다른 두 글자를 위쪽으로 맞췄다. 행만 여백을 갖고 기준선으로 맞췄다.
2. `Field:checkbox` 의 칸이 16px 폭에 44px 높이로 길쭉했다 — 빈칸 자리 표시의 줄 높이가 상자를 늘렸다. 높이를 16px 로 박고 여백을 걷었다.
3. `Divider:vertical` 이 안 보였다 — 높이가 정해지지 않은 부모 안에서 `min-height: 100%` 가 0 이 된다. 한 줄 높이(1.5em)를 바닥으로 두었다(`system-admin` 의 시트도 같은 `100%` 를 쓴다 — admin 트랙 몫).

## 변조(구분력)

드라이버: 스크래치 `a6-portal/mutate.py` — 백업(경로 전체를 `__` 로 이은 이름) → 글자 하나 바꿈(맞은 수 1 확인) → 대상 케이스(`--reporter=json`) → 복사 복원 → 바이트 비교. 12 건 모두 `restored True`, 끝에 `git status` 비어 있음 · `git diff --stat` 비어 있음 · 다시 빌드한 `.wbtheme` sha256 이 표의 `541cb598…` 와 같음.

| # | 변조 | 죽은 케이스(실패 값) |
|---|---|---|
| M1 | 뷰 표에서 다섯 뷰를 뺌(기본 뷰만) | unit 8(`'TABLE'` 대 `'UL'` · `'indent'` 대 `'accordion'` · `'inline'` 대 `'collapsible'` …) · 번들 판 5(같은 값). **`checkTheme`(wbtheme.test 3)은 초록** — 뷰가 기본 뷰로 대신 그려져도 오류는 0 이라 번들 판이 그 몫이다 |
| M2 | Section inner 의 `margin-left: auto` 뗌 | «inner 가 본문 폭 토큰으로 …»(`to contain 'margin-left: auto;'`) 하나 |
| M3 | 700 굵기 `@font-face` 이름 `"Portal Sanz"` | «글꼴 토큰의 첫 항목이 …»(`to contain 'font-family: "Portal Sans";'`) 하나 |
| M4 | Button 의 `font-family` 뗌 | «Page 뿌리와 Button 이 …» 하나 |
| M5 | `primaryLine` 을 쓰는 한 줄을 `border` 로 | unit 0 · build `wbtheme.test` «선언한 토큰은 전부 쓰이고»(`['semantic.primaryLine']`) 하나 |
| M6 | Card 에 `box-shadow` | «시트에 box-shadow 가 없다» 하나 |
| M7 | List 뷰 루트에 `marker={{ placement: 'top-end' }}` | «마커 · 외곽선은 뷰의 루트를 따른다» `List` 칸 하나(`expected true to be false` — `data-wb-marker` 가 섬) |
| M8 | Tree 아코디언 마디에 `--wb-node-tree-level` 을 실음 | «Tree:accordion — …»(`not to contain '--wb-node-tree-level'`) 하나 |
| M9 | Tabs 패널 여백을 `:root` 에 없는 `--wb-space-6` 으로 | «읽는 변수는 전부 :root 에 있다»(`['--wb-space-6']`) 하나 |
| M10 | 접힘을 무시하고 늘 폄 | «SearchForm:collapsible — …»(`['toggle','fields','actions']` 대 `['toggle']`) 하나 |
| M11 | `List` 의 `defaultVariant` 를 `table` 로 | manifest `List` 칸 하나(`'table'` 대 `'stackedList'`) · 번들 판 `List:undefined` 하나(`'TABLE'` 대 `'UL'`) |
| M12 | `Section:muted` 의 inner 에 `margin-left: 0` 규칙을 심음 | «inner 의 margin 을 다른 값으로 덮는 규칙이 없다»(`expected [ Array(1) ] to deeply equal []`) 하나 |

새 케이스의 먼저 빨강: 뼈대 판(기본 뷰 · 빈 토큰 · 빈 시트) 위에서 `test/` 두 파일 **29 실패 · 18 통과**(통과한 18 은 기본 뷰에서도 참인 곁의 variant · 마커 칸과 카탈로그 이름 · 검사기 자가 대조). 첫 구현에서 1 실패 — 케이스 쪽 결함이었다: «margin 을 덮는 규칙» 탐지 정규식 `margin…:\s*(?!auto)` 가 `\s*` 역추적으로 `margin-left: auto` 도 잡았다 → 값을 뽑아 `auto` 와 견주게 고쳤다. 고친 탐지기가 덮는 규칙을 실제로 잡는 것은 M12 로 쟀다.

## 게이트

| 명령 | 결과 |
|---|---|
| `pnpm typecheck` | 종료 0 |
| `pnpm --filter @wirebound/system-theme-portal check` | 갤러리 칸 64 · 오류 없음 |
| `pnpm --filter @wirebound/system-theme-portal shots --out …/a6-shots/portal` | 390 · 1280 두 폭 · 문제 0 건 |
| `pnpm vitest run system-themes/portal` | 2 파일 · **47 통과 · 건너뜀 0 · 실패 0** (unit — jsdom 값) |
| `pnpm vitest run --project build system-themes/portal` | 2 파일 · **13 통과 · 건너뜀 0 · 실패 0** (`wbtheme.test` 3 — jsdom `checkTheme` · `bundle-views.test` 10 — jsdom, 번들을 공유 런타임으로) |
| `pnpm vitest run apps/api/test/system-themes.test.ts apps/api/test/system-theme-checksums.test.ts` | 2 파일 · **15 통과 · 건너뜀 0 · 실패 0** (이 워크트리 DB `:5450`) |
| `pnpm test --maxWorkers=25%` | 370 파일 · **6313 통과 · 1 건너뜀 · 실패 0** · 439.7s. 건너뜀은 이 트랙과 무관한 `apps/api/test/log-destination.test.ts` «Linux `/dev/full`»(macOS) |

## 테마 밖에서 필요했던 것

- **고친 것 없음** — `system-themes/portal/**` 와 이 보고서만 바꿨다. 새 의존 없음(`@testing-library/react` · `@wirebound/renderer` · `@wirebound/themes` 는 뼈대가 이미 devDependencies 에 두었다).
- 알려 둘 것(고치지 않음):
  - `checkTheme`(D2)는 «오류 없이 그려진다» 만 본다 — 테마 뷰가 통째로 기본 뷰로 대신 그려져도 초록이다(M1). 뷰를 쓰는 트랙은 번들을 공유 런타임으로 싣고 DOM 표지를 보는 케이스가 따로 있어야 한다(이 트랙은 `build-test/bundle-views.test.tsx`). 공용으로 올린다면 `checkTheme` 보고에 «칸마다 그려진 루트의 태그 · `data-wb-structure`» 를 더하는 길이 있다 — 뼈대 트랙 몫.
  - 갤러리 표본 `Section — compact`(`props.compact: true`)는 기본 뷰 · 이 테마 모두 읽지 않아 `Section — 자식 하나` 와 같은 그림이다.
  - `system-admin` 의 `Divider:vertical`(`min-height: 100%`)도 갤러리에서 안 보일 것이다 — admin 트랙에 알릴 것.
