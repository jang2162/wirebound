# A6 테마 트랙 보고 — `system-commerce`

계획: `docs/superpowers/plans/2026-09-30-a6-system-themes.md` 「T1 ~ T5 — 테마 트랙」(`<id>` = `commerce`). 브랜치 `feat/a6-commerce`.
이 문서는 발행 시점의 기록이다(`docs/guideline/base/04-citation.md` 「이력 문서는 연대기 금지의 예외다」).
설계 원천: `git show b2766e8c^:packages/themes/src/system/commerce.ts`(머리말의 «무엇이 다른가» 표 — 이 테마의 성격).

## 커밋

| 커밋 | 내용 |
|---|---|
| `5bf44a3b` | manifest(토큰 21 · variant · 패턴) · 뷰 다섯(`src/views/`) · `theme.tsx` · `index.ts`. `test/commerce.test.ts → .tsx` 이름 바꿈(내용은 다음 커밋)이 여기 함께 들었다 — `git mv` 로 먼저 stage 된 탓이고 내용 없는 이름 바꿈이라 해가 없다 |
| `3c34bbf8` | `theme.css` |
| `948a878a` | 판 `1.0.0`(`package.json`) · `checksums.json` 에 `system-commerce@1.0.0` 줄을 더함(`0.9.0` 줄은 그대로) |
| `956fe121` | 케이스(unit 24 · build-test 1 더함) |
| (이 보고서) | 이 문서 |

`system-commerce-1.0.0.wbtheme` sha256 `abb8f97f1280f1d6de9362ebef72e04d1c42da8d83080d57c6d59cd0a50528d9` — 변조 · 복원 뒤 다시 빌드해도 같은 값(결정적).

## 옛 → 새 대응표

### 토큰 (선언 21 — 색 10 · 글꼴 3 · 모양 6 · 배치 2)

| 옛 자리 | 새 토큰(무리 · label) | 기본값 |
|---|---|---|
| `semantic.primary` … `semantic.danger`(9) | 같은 키 9개(색 — 주색(구매 · 담기) · 주색(옅게) · 면 · 바탕 · 테두리 · 테두리(짙게) · 글자 · 글자(흐리게) · 위험) | 옛 palette 를 따라간 값(`#ea580c` · `#fffbeb` · `#ffffff` · `#fafaf9` · `#e7e5e4` · `#d6d3d1` · `#1c1917` · `#78716c` · `#e11d48`) |
| `semantic.price` | `semantic.price`(색 — 가격) | `#e11d48`(`danger` 를 참조로 두지 않았다 — 위험 색을 바꾸면 가격 색이 따라 바뀌면 안 된다) |
| `typography.family.sans` + `assets.fonts`(Pretendard `local()`) | `typography.family.sans`(글꼴 — 글꼴) + `theme.css` 의 `@font-face` 셋(400 · 600 · 700, `local()` 뿐) | `"Pretendard", "Apple SD Gothic Neo", system-ui, sans-serif` |
| `typography.body.fontSize` | 같은 키(글꼴 — 본문 글자 크기) | `16px`(admin 14px 와 갈리는 자리) |
| `typography.price.fontSize` | 같은 키(글꼴 — 가격 글자 크기) | `20px` |
| `radius.sm/md/lg/pill` | 같은 키 넷(모양) | `6px` · `10px` · `16px` · `999px` |
| `shadow.sm` · `shadow.lg` | 같은 키 둘(모양 — 카드 · 버튼 / 강조 카드) | 옛 값 그대로 |
| `space.unit` | `space.unit`(배치 — 간격 단위(밀도)) | `4px` — `theme.css` 의 `--wb-space-N` 이 전부 `calc(var(--wb-space-unit) * N)` 이라 밀도 토큰 하나가 여백 전부를 옮긴다 |
| `primitives.container.maxWidth` | `container.maxWidth`(배치 — 콘텐츠 폭) | `1200px` |
| 나머지 타이포 스케일 · `motion.base` · `grid.gap` · `section.paddingY` | **`theme.css` 의 `:root` 상수**(토큰 폼에 내지 않음) | 옛 값 |
| 선언도 상수도 안 옮김 | `semantic.success`(옛 컴포넌트 어디도 안 씀) · palette 이름들(semantic 이 값을 직접 가짐) · `shadow.md` · `motion.fast` · `primitives.breakpoints.lg`(1120 — 옛 컴포넌트가 안 씀) · `section.paddingYCompact`(아래 «테마 밖») | — |

### 구조 → variant · 뷰

| 컴포넌트 | 옛 구조 | 새 variant(굵게 = `defaultVariant`) | 뷰 |
|---|---|---|---|
| `Card` | `mediaTop` + 변형 `featured` | **`mediaTop`** · `featured` · `plain` | **뷰** — 머리의 `media` 조각은 기본 뷰(`plain`)에 없어 CSS 로 못 만든다. `plain` 은 기본 뷰로 넘긴다 |
| `List` | `mediaList` + 변형 `compact` · `featured` | **`mediaList`** · `cardGrid` · `compact` · `featured`(모두 `hideProps: ['columns']`) | **뷰** — 미디어 줄의 `body`(이름 위 가격) · 격자 칸의 `media` 가 기본 뷰(표)에 없다. 옛 머리말의 대가(«격자와 줄 목록을 한 문서에 둘 수 없다»)가 사라졌다 — `cardGrid` 가 variant 다 |
| `Tabs` | `pill` | **`pill`** · `underline` | 없음 — `pill` 은 `underline` 과 DOM 이 같다. CSS 만 |
| `Tree` | `accordion` | **`accordion`** · `indent` | **뷰** — DOM 중첩(`panel`)이 깊이다. `indent` 는 기본 뷰 |
| `KeyValue` | `cardGrid` | **`cardGrid`** · `table`(`hideProps: ['columns']`) | **뷰** — 기본 뷰가 `<table>` 이라 행을 상자로 못 세운다. 열 수는 노드 손잡이(`--wb-node-keyvalue-columns`)로 싣는다. `table` 은 기본 뷰 |
| `SearchForm` | `collapsible` | **`collapsible`** · `inline`(`hideProps: ['collapsed']`) | **뷰** — `toggle` 조각 · 접히면 자식이 DOM 에서 빠짐. 기본 뷰는 `collapsed` 를 안 읽는다. `inline` 은 기본 뷰 |
| `Section` | `contained` + 변형 `hero` · `muted` | **`default`** · `hero` · `muted` | 없음 |
| `Button` | `solid` + 변형 `secondary` · `danger` · `ghost` | **`default`** · `primary` · `secondary` · `danger` · `ghost`(패턴이 `primary` 를 쓴다) | 없음 |
| `Link` | `default` + 변형 `muted` | **`default`** · `muted` | 없음 |
| `EntryForm` | `labelTop` | 선언 안 함 — `labelLeft` 와 DOM 이 같고 «라벨이 위» 는 `Field` 의 세로 쌓기가 만든다. 고를 것이 없다 | 없음 |
| `Field` · `Text` · `Divider` | `filled` · 기본 | 선언 불가(`variantFrom`) | 없음 — `filled` 는 CSS 만(면을 채우고 아래 2px) |
| `Page` · `Flex` · `Grid` · `Media` · `Placeholder` | 기본 | 선언 없음 | 없음 |

패턴: 옛 `content.product`(상품 상세 — 이미지와 구매) 그대로.

### 뷰가 쓰는 초점 · 마커

뷰 다섯 모두 `Focus` 를 안 쓰고 마커는 기본(`top-start`)이다 — 루트가 곧 노드의 상자다(감싸는 틀 · 머리 장식이 없고, 페이지네이션 · 접힘 막대도 그 노드의 일부). 케이스가 선언한 variant 마다 `focusElement(루트) === 루트` · `data-wb-marker` 없음을 잠근다.

### 옛 성질 · 옛 스킨에서 옮긴 것과 바꾼 것

- **옛 테스트의 성질**(D4): `system-section-centered`(«inner 에 max-width 를 거는 규칙마다 margin 좌우 auto · 다른 값으로 덮는 규칙 없음») · `system-unresolved-literals`(«선언 값에 점 찍힌 맨 이름이 없다» + 새 판의 같은 부류 «규칙이 읽는 `--wb-` 변수는 `:root` 가 정의한다» · 검사기의 구분력 케이스) · `pattern-expand` 의 commerce 몫(«전개하면 validatePage 를 지나고 슬롯이 트리 순서로 매핑»). `system-portal` 은 portal 트랙의 몫. `system.test.ts` 의 일반 성질(오류 없이 선다 · `!important` 없음 등)은 `checkTheme` · 체크섬 케이스가 대신한다.
- **자식 결합자**: 자식을 담는 컴포넌트(`Section` · `Card` · `Tabs` · `SearchForm` · `EntryForm`)의 조각 규칙을 `>` 로 적었다. 옛 테마는 자손 결합자라 카드의 `title` · `media` · `body` 가 카드 안 목록의 조각까지 받았고 «시트 순서가 막는다» 로 두었다(`EntryForm` 의 `label` 도 안의 `Field` 라벨을 받았다). 케이스 «Card 안 List …» · «EntryForm 안 Field …» 가 잠근다.
- 옛 스킨에 **더한 것**(스크린숏을 보고 고친 것 포함): 알약 탭의 고른 칩을 짙게 채움(옛 스킨은 활성 탭을 가르지 않았다 — 주색은 구매 액션의 몫이라 글자색으로) · `underline` 탭 스킨 · `List` · `Tree` 루트의 목록 기본 여백 · 글머리 걷기 · `figure` 의 UA 좌우 여백 걷기 · `Button` 의 `font-family: inherit`(`<button>` 은 서체를 안 물려받는다) · `Placeholder` 글자를 세로 가운데 · **Media 틀에 테두리**(면이 Page 바탕과 같은 색이라 사진 자리가 안 보였다) · **접히는 필터 안 필드에 `flex: 1 1 200px`**(빈 입력 상자가 글자 폭까지 줄어 30px 칸이 됐다) · `featured` 줄에 좌우 여백 · 상품 격자(`cardGrid`)는 4 열 → 768 이하 3 열 → 480 이하 2 열.

## 스크린숏 — 본 것

`/private/tmp/claude-501/-Users-jang2162-IdeaProjects-wirebound/cd7364a6-937a-4a56-bc50-dbfe60c4e848/scratchpad/a6-shots/commerce/` — `system-commerce-390-{1,2}.png`(문서 높이 15569) · `system-commerce-1280-{1,2,3}.png`(21978) · `report.json`(두 폭 모두 콘솔 오류 0 · `data-wb-error` 0 · 넘침 0 · `pageScrollWidth` = 폭). 구간 PNG 를 이어 붙여 폭마다 2400 · 3000px 조각으로 잘라 전부 열어 봤다.

- **색**: 따뜻한 stone 바탕(`#fafaf9`) · 주황 버튼 · 로즈 가격(`List` 의 `meta` · `Card` 의 부제) — 옛 표의 «따뜻한 stone · orange» 가 선다. 강조 카드의 주황 테두리 · 히어로 섹션의 옅은 호박색이 보인다.
- **모서리**: 버튼 · 알약 탭이 완전한 알약, 카드 16px · 썸네일 10px · 입력 6px — 옛 «둥근 모서리(6~16px)와 알약 버튼».
- **서체 · 밀도**: 본문 16px(admin 14px 보다 크다) · 섹션 여백 56px(768 이하 40 · 480 이하 24) · 콘텐츠 폭 1200px. 이 기계에 Pretendard 가 없어 폴백(Apple SD Gothic Neo)으로 찍혔다 — `local()` 설계대로다.
- **구조**: 미디어 줄(112px 정사각 썸네일 옆 이름 위 가격 · 390 에서 72px) · 상품 격자(1280 에서 4 열이 아니라 3 칸 — 표본이 3 항목 · 390 에서 2 열) · 알약 탭 · 아코디언(펴진 가지에 왼쪽 선) · 속성 상자 격자 · 접히는 필터(접힘 판은 막대 하나) · 채운 입력(아래만 2px) — 옛 «미디어줄 · 이미지카드 · 알약탭 · 아코디언».
- **처음 판에서 고친 것**: Media 틀이 안 보임 · 접히는 필터 안 필드가 30px 로 줄어듦(둘 다 위 «더한 것»). 고친 뒤 다시 찍었다.
- **그대로 둔 것**: 전체 폭 `Card` 는 이미지 자리가 정사각이라 1280 에서 1000px 넘게 높다(갤러리 문서가 긴 까닭). 옛 테마와 같은 판단이다 — 상품 카드는 `Grid` 안에 놓이는 것이 정상 구성이고, 폭에 따라 높이를 줄이면 격자의 정사각이 깨진다. `Section — compact` 표본이 기본과 같게 보인다(아래 «테마 밖»).

## 게이트

| 명령 | 결과 |
|---|---|
| `pnpm typecheck` | 종료 0 |
| `pnpm --filter @wirebound/system-theme-commerce check` | 갤러리 칸 63 · 오류 없음 |
| `… shots --out …/a6-shots/commerce` | 두 폭 · `report.json` 문제 0 |
| `pnpm vitest run system-themes/commerce` | 1 파일 · **24 통과** · 건너뜀 0 · 실패 0(jsdom) |
| `pnpm vitest run --project build system-themes/commerce` | 1 파일 · **4 통과** · 건너뜀 0 · 실패 0 |
| `pnpm vitest run apps/api/test/system-themes.test.ts apps/api/test/system-theme-checksums.test.ts` | 2 파일 · **15 통과** · 실패 0(자기 DB 5448) |
| `pnpm test --maxWorkers=25%` | 369 파일 · **6289 통과 · 1 건너뜀 · 실패 1** · 536s. 실패 1 은 `apps/web/test/lock/one-verdict.test.ts` «검사가 진짜로 무언가를 본다 — 음성 대조» 의 5s 타임아웃(5180ms) — 그때 부하 평균 116(다섯 트랙이 함께 돌았다). 그 파일만 다시 돌려 **10 통과**(그 케이스 1091ms). 이 브랜치는 `apps` · `packages` 를 안 고친다(`git diff --stat main...HEAD -- apps packages` 빈 줄). 건너뜀 1 은 `apps/api/test/log-destination.test.ts` 의 Linux `/dev/full` 판(macOS) |

## 먼저 빨강 · 구분력

- **고치기 전(뼈대 HEAD) 소스로 새 unit 케이스**: `manifest.ts` · `theme.css` · `index.ts` · `theme.tsx` 를 `git show HEAD:` 로 끼워 돌림 → **19 실패 · 5 통과**. 통과 다섯: «components 선언은 카탈로그의 이름만» · «토큰마다 CSS 의 :root 에» · «검사기가 미해석 꼴을 잡고» · «카드 안 자식의 초점은 카드의 것이 아니다» · «`[data-wb-variant="default"]` 규칙이 없다» — 셋은 빈 선언 · 빈 CSS 에서 공허하게 초록이고(토큰 수 케이스 · 규칙 수 양성 대조가 그 판을 잡는다), 검사기 · 초점 케이스는 원래 성질을 잠그는 것이다. 백업(경로 전체 이름) → `cmp` 복원.
- **변조**(백업 → 한 곳 치환(맞은 수 1 확인) → `pnpm vitest run system-themes/commerce/test` → `cmp` 복원). 전부 **값으로** 죽었다:

| 변조 | 죽은 케이스(24 가운데) | 실패 값 |
|---|---|---|
| M1 Card `title` 규칙을 자손 결합자로 | «Card 안 List …» 1 | `expected [ Array(1) ] to deeply equal []` |
| M2 Section inner 의 `margin-left: auto` 뗌 | «inner 에 max-width …» 1 | `[ '', 'auto' ]` 대 `[ 'auto', 'auto' ]` |
| M3 Flex `gap` 을 정의 안 된 `--wb-space-9` 로 | «규칙이 읽는 --wb- 변수는 …» 1 | `[ '--wb-space-9' ]` |
| M4 Card 뷰의 `plain` 가지 뗌 | «Card: mediaTop …» 1 | `'mediaTop'` 대 `'plain'` |
| M5 SearchForm 뷰가 `collapsed` 를 안 읽음 | «SearchForm: collapsible …» 1 | `['toggle','fields','actions']` 대 `['toggle']` |
| M6 Tabs `defaultVariant` 를 `underline` 으로 | «옛 구조 선택이 defaultVariant 다» 1 | `toMatchObject` 불일치 |
| M7 EntryForm `label` 규칙을 자손 결합자로 | «EntryForm 안 Field …» 1 | `expected [ Array(1) ] to deeply equal []` |
| M8 Tree 뷰가 가지를 안 폄 | «Tree: accordion …» 1 | `length of 2 but got +0` |
| M9 KeyValue 열 수를 `'1'` 상수로 | «KeyValue: cardGrid …» 1 | `'1'` 대 `'3'` |
| M10 List 격자 첫 칸 `media` 에 `data-wb-focus` | «List: 선언한 variant 마다 초점은 루트 …» 1 | `List/cardGrid: expected <div data-wb-part="media"> to be <div …>` |
| M11 `:root` 의 `--wb-semantic-price` 이름 틀림 | «토큰마다 CSS 의 :root 에» · «규칙이 읽는 --wb- 변수는 …» 2 | 둘 다 그 변수를 재는 자리라 함께 죽는 것이 맞다 |
| M11 을 build-test 로 | «산출물 theme.css 가 토큰마다 …» 1(4 가운데) | `[ '--wb-semantic-price: #e11d48;' ]` |

M9 의 첫 판은 변조를 잘못 짰다(열 수 변수를 둔 채 다른 속성만 더함 — 0 실패). 열 수를 상수로 바꾼 판으로 다시 쟀다. 끝에 `git status` · `git diff --stat` 로 바뀐 파일이 뜻한 것뿐인지 봤다.

## 테마 밖에서 필요했던 것 · 코디네이터 몫

- **테마 밖을 고친 것 없음.** 새 의존 없음(`@testing-library/react` · `@wirebound/renderer` · `@wirebound/themes` 는 뼈대가 이미 devDependencies 에 둠).
- **`Section.compact`(«좁은 여백» 스위치)를 읽는 뷰가 없다** — 기본 뷰(`SectionView`)가 그 prop 을 DOM 에 안 싣고, 뼈대 뒤 다섯 테마 모두 기본 뷰를 쓰면 켜도 화면이 안 바뀐다(옛 구조 경로도 안 읽었다). 옛 테마들은 `section.paddingYCompact` 를 선언만 했다. 테마마다 Section 뷰를 쓰기보다 기본 뷰가 `data-wb-compact` 같은 훅을 내는 편이 한 벌이다 — SDK 의 몫이라 여기서 고치지 않았다. 넣을 자리: `packages/theme-sdk/src/default-views/structure.tsx` 의 `SectionView` 에 `data-wb-compact={props.compact === true ? '' : undefined}`, 그리고 spec `2026-09-27-code-themes-design.md` 「뷰 계약」 표 아래에 «기본 뷰는 상태가 아닌 불리언 prop 가운데 화면을 바꾸는 것(`Section.compact`)을 `data-wb-<prop>` 으로 싣는다» 한 줄.
- 지침: 없음(이번 트랙에서 지침이 틀리거나 빈 자리는 못 봤다).

## 끝

- 띄운 것: `wb-theme shots` · build-test 의 Chromium · dev 서버는 명령 안에서 닫힌다. 끝에 `ps` 로 이 워크트리 경로 · headless Chrome 을 찾아 0 건. Postgres 컨테이너(5448)는 이 워크트리의 것이라 그대로 둔다.
