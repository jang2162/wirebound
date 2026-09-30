# A6 테마 트랙 보고 — `system-saas-marketing` 1.0.0

계획: `docs/superpowers/plans/2026-09-30-a6-system-themes.md` 「T1 ~ T5 — 테마 트랙」(`<id>` = `saas-marketing`). 브랜치 `feat/a6-saas-marketing`.
이 문서는 발행 시점의 기록이다(`docs/guideline/base/04-citation.md` 「이력 문서는 연대기 금지의 예외다」).
설계 원천: `git show b2766e8c^:packages/themes/src/system/saas-marketing.ts`(머리말 «`admin` 의 반대쪽 끝» 과 컴포넌트마다 고른 구조의 까닭).
옛 구조의 DOM: `git show b1cfd823^:packages/renderer/src/structures/{structure,data,document}.tsx`(`SectionSplitBg` · `ListCardGrid` · `TreeAccordion` · `KeyValueCardGrid` · `MediaIllustration`).

## 커밋

| 커밋 | 내용 |
|---|---|
| `32134813` | 뷰 다섯(`src/views/`) — `Section` · `List` · `Tree` · `KeyValue` · `Media`. `theme.tsx` · `index.ts` 가 `VIEWS` 를 쓴다 |
| `52577632` | 판 `1.0.0` — manifest 토큰 · variant, `theme.css`, `package.json` 판, `checksums.json` 에 `system-saas-marketing@1.0.0` 줄 더함(`0.9.0` 줄 그대로) |
| `c202de5b` | 케이스 — `test/saas-marketing.test.ts`(17) · `build-test/wbtheme.test.ts` 에 한 단언 |
| `ab5131f8` | 카드 그리드의 2열 전환을 옛 `md`(768px)로 — 앞 커밋이 1024px 로 적었다. `1.0.0` 은 배포 전이라 그 줄의 값을 바꿨다 |
| (이 보고서) | 보고서 |

## 옛 → 새 대응표

### 토큰 (선언 **21** 개 · 무리 넷)

| 옛 (`tokens` · `primitives`) | 새 | 무리 · label |
|---|---|---|
| `semantic.primary` · `primarySoft` · `accentSoft` · `surface` · `canvas` · `border` · `borderStrong` · `text` · `textMuted` · `textInverse` · `danger` (값은 옛 `palette` 를 따라간 값) | 같은 키의 `color` 토큰 11 | 색 — 주색 · 주색(옅게) · 보조색(옅게) — 히어로 배경 · 면 · 바탕 · 테두리 · 테두리(짙게) · 글자 · 글자(흐리게) · 글자(주색 위) · 위험 |
| `semantic.primaryStrong` · `semantic.accent` | 선언 안 함 | 옛 테마의 어느 컴포넌트도 안 썼다 — 폼에 내놓으면 `unusedTokens` 로 죽는다 |
| `palette.*` | 선언 안 함 | semantic 기본값에 녹았다(원시 팔레트는 사람이 고칠 자리가 아니다) |
| `typography.family.display` · `.sans` | `font` 토큰 2 | 서체 — 제목 서체 · 본문 서체 |
| `typography.display.fontSize` 64px · `h1` 48px · `body` 18px | `length` 토큰 3 | 서체 — «큰 타이포» 가 이 테마의 성격이라 세 크기만 낸다 |
| 나머지 타이포 단계(h2 ~ h6 · caption · 줄 높이 · 굵기 · 자간) | `:root` 상수 | |
| `radius.sm` · `md` · `lg` (8 · 14 · 24px) | `length` 토큰 3 | 모양 — 모서리(작게 · 중간 · 크게) |
| `radius.full` 999px | 상수 | 알약 모양의 뜻이라 고칠 값이 아니다 |
| `shadow.sm` · `md` · `lg`(두 겹) · `motion.*` · `space.unit` 4px | 상수 | |
| `primitives.container.maxWidth` 1200px | `length` 토큰 | 폭 · 여백 — 내용 폭 |
| `primitives.section.paddingY`(space.20 = 80px) | `length` 토큰 | 폭 · 여백 — 섹션 세로 여백 |
| `primitives.section.paddingYCompact`(40px) · `container.gutter` · `grid.gap` | 상수 · 규칙 값 | `paddingYCompact` 는 옛 테마가 선언만 하고 안 쓰던 값 — 이제 `Section` 의 `compact` prop 이 쓴다(아래) |
| `primitives.breakpoints` md 768 · sm 640 | `@media (max-width: 768px)` · `(max-width: 640px)` | |
| `assets.fonts`(`local()` 네 `@font-face`) | `theme.css` 머리의 `@font-face` 넷 | 네트워크 없음 |
| `assets.placeholder.style: 'photo'` · `icons` | 없음 | 옛날에도 컴파일되지 않던 선언. `Placeholder` 의 부드러운 채움이 그 뜻을 손으로 흉내 낸다(옛과 같다) |

### 구조 → variant · 뷰

| 컴포넌트 | 옛 구조(admin 은) | 새 variant (**굵게** = `defaultVariant`) | 뷰 |
|---|---|---|---|
| `Section` | `splitBg`(`contained`) + 노드 변형 `hero` · `muted` | **`default`** · `hero` · `muted` | **뷰** — `band`(워시) + `inner` |
| `Card` | `elevated`(`plain`) + `featured` | **`default`** · `featured` | 기본 뷰 — DOM 이 같다 |
| `Tabs` | `pill`(`underline`) | **`pill`** · `underline` | 기본 뷰 — DOM 이 같다 |
| `List` | `cardGrid`(`table`) + `featured` · `compact` | **`cards`** · `featured` · `compact`(셋 다 카드, `hideProps: ['columns']`) · `table` | **뷰** — 카드 그리드, `table` 은 기본 뷰에 넘김 |
| `Tree` | `accordion`(`indent`) | **`accordion`** · `indent` | **뷰** — 아코디언, `indent` 는 기본 뷰 |
| `KeyValue` | `cardGrid`(`table`) | **`tiles`** · `table` | **뷰** — 지표 타일(노드의 `columns` 를 변수로), `table` 은 기본 뷰 |
| `SearchForm` | `inline`(같음) | 선언 없음 | 기본 뷰 |
| `EntryForm` | `labelTop`(`labelLeft`) | 선언 없음 | 기본 뷰 — DOM 이 같다(스킨이 라벨을 위로) |
| `Field` | `filled`(`outlined`) | 선언 불가(`variantFrom: 'control'`) | 기본 뷰 — DOM 이 같다 |
| `Button` | `outline`(`solid`) + `primary` · `secondary` · `danger` · `ghost` | **`default`**(아웃라인) · `primary` · `secondary` · `danger` · `ghost` | 기본 뷰 — DOM 이 같다 |
| `Link` | `default` + `muted` | **`default`** · `muted` | 기본 뷰 |
| `Media` | `illustration`(`image`) | **`illustration`** · `image` | **뷰** — 틀 가운데 표지(✎, `kind: 'video'` 면 ▶), `image` 는 기본 뷰 |
| `Page` · `Slot` · `Flex` · `Grid` · `Text` · `Divider` · `Placeholder` | `default` | 선언 없음(`Text` · `Divider` 는 불가) | 기본 뷰 |

- **id 규칙:** 노드 변형(옛 `variants`)은 `system-admin` 과 같은 id(`default` · `hero` · `featured` · `primary` …)를 쓴다 — 테마를 바꿔도 같은 뜻이 이어진다. 구조에서 온 축은 모양 이름(`cards` · `pill` · `accordion` · `tiles` · `illustration`)이다. `admin` 문서의 `List`(`default` 등 이 테마에 없는 값)는 `defaultVariant` 인 카드 그리드로 그려진다 — 옛 «같은 `List` 노드가 관리자에서는 테이블로, 마케팅에서는 카드 그리드로» 가 그대로 선다.
- **옛 머리말의 대가 «구조 선택이 타입 단위라 히어로만 좌우 분할로 두는 것을 못 한다» 는 절반만 풀렸다** — 카드 그리드와 표 · 알약과 밑줄 탭은 이제 한 문서에 함께 둔다. 섹션의 좌우 분할(옛 `splitBg` 의 기본 `1fr 1fr`)은 옛 테마도 `display: block` 으로 덮어 안 쓰던 것이라 variant 로 만들지 않았다.
- `Page` · `Card` 제목 · `KeyValue` 값 · `EntryForm` 제목 · 큰 제목(`display` · `h1` · `h2`)에만 제목 서체 — 옛 배치 그대로.

### 뷰를 쓴 컴포넌트와 까닭 (다섯)

| 뷰 | 까닭 |
|---|---|
| `Section` | 워시를 칠할 **상자**(`band`)가 필요하다 — 기본 뷰(`contained`)는 `inner` 하나뿐이다. 의사 요소로 흉내 내면 외곽선 · 마커가 재는 상자와 그림이 갈린다. `compact` prop 을 클래스(`wbsm-section-compact`)로 싣는다 — 옛 테마는 `paddingYCompact` 를 선언만 하고 아무 자리도 안 읽었다 |
| `List` | 카드 그리드는 표와 DOM 이 다르다(`item` · `media` · `title` · `meta`) |
| `Tree` | 아코디언은 첫 항목을 `depth` 단계까지 겹친 `panel` 로 펼친다 |
| `KeyValue` | 타일 격자 — 노드의 `columns` 를 `--wb-node-keyvalue-columns` 로 나른다(테마가 열 수를 적으면 노드 값이 무시된다) |
| `Media` | 틀 가운데 표지(`glyph`) — 빈 틀만 두면 전부 사진으로 읽힌다. 옛 `illustration` 은 `kind` 를 안 봤다 — 새 뷰는 `video` 면 ▶ 를 둔다(옛 `video` 구조의 표지) |

다른 variant(`table` · `indent` · `image`)는 사본을 두지 않고 SDK 기본 뷰(`DEFAULT_VIEWS`)를 그대로 부른다(`src/views/fallback.ts`). **`Focus` · `marker` 는 쓰지 않는다** — 다섯 모두 노드의 상자가 곧 루트다(섹션은 워시까지가 노드의 폭). 케이스가 variant 13 칸에서 `focusElement(root) === root` 와 `data-wb-marker` 없음을 잰다.

### 옛 성질 → 케이스 (`test/saas-marketing.test.ts`)

| 옛 성질 | 새 케이스 |
|---|---|
| `system-section-centered`(가둔 칼럼을 가운데 둔다) | «Section 의 inner 는 가둔 칼럼을 가운데 둔다» — jsdom CSSOM 으로 `@media` 안까지 펼쳐, `max-width` 를 건 `inner` 규칙마다 좌우 `auto` · 다른 값으로 덮는 규칙 없음 |
| `system-unresolved-literals`(해석 안 된 참조가 CSS 에 실리면 브라우저가 선언을 버린다) | «var() 로 가리킨 테마 변수는 전부 :root 에 선언돼 있다» — 참조 100 개 이상 카나리아 · 노드 변수는 기본값 필수 |
| 옛 웹 케이스(`apps/web/test/theme/saas-marketing.test.tsx`)의 «조각 규칙이 중첩된 컴포넌트로 새는가»(`EntryForm` 제목 → 안의 `Field` · `Button` 라벨) | «조각 스킨이 중첩 컴포넌트로 새지 않는다» — 이제 막는 것은 카탈로그 순서가 아니라 자식 결합자(`>`) |
| 옛 «`List` 가 마케팅에서는 카드 그리드» | «variant 없는 List 는 카드 그리드로 그려진다(옛 선택)» · «옛 구조 선택이 defaultVariant 다» |
| (`system-portal` 은 portal 트랙의 것) | — |

그 밖: id · 판 · sdk / 카탈로그 이름 / 토큰 12 ~ 30 · 무리 · 한국어 label / 토큰마다 `:root` 에 같은 이름 · 기본값(카나리아) / `[data-wb-variant="default"]` 규칙 없음 / 뷰를 바꾼 것이 정확히 다섯 / variant 마다 DOM 표지(Section · List · Tree · KeyValue · Media). build-test 에는 «토큰 기본값이 빌드된 `theme.css` 의 `:root` 에 그대로 실린다» 를 더했다(빌드가 CSS 를 줄여 글자 대조는 못 한다).

## 스크린숏 — `wb-theme shots` 두 폭 (실 Chromium)

`/private/tmp/claude-501/-Users-jang2162-IdeaProjects-wirebound/cd7364a6-937a-4a56-bc50-dbfe60c4e848/scratchpad/a6-shots/saas-marketing/` — `system-saas-marketing-{390,1280}-{1,2,3}.png` · `report.json`(두 폭 모두 콘솔 오류 0 · `data-wb-error` 0 · 가로 넘침 0 · `pageScrollWidth` = 폭). 갤러리 칸 61.

직접 열어 본 것(이미지를 구간으로 잘라 읽음):

- **밀도 · 여백:** 섹션 세로 80px(히어로 96 · compact 40 · 768 이하 48 · 640 이하 40 — 390 폭에서는 compact 와 같은 값이 된다), 카드 안쪽 32px, 입력 칸 16/20px — `admin` 의 촘촘함과 반대로 넓다.
- **모서리 · 그림자:** 카드 · 카드 그리드 · 폼 · 타일 24px, 입력 14px, 버튼 · 탭 · 검색 바 알약. 카드는 두 겹 그림자로 떠 있고 `featured` 는 주색 테두리 + 큰 그림자.
- **색:** 보라 주색(#5b3df5)과 보라 기 도는 잉크 — 히어로 워시가 보라 → 청록으로 흐른다. `admin` 의 slate/blue 와 한눈에 갈린다.
- **서체:** 큰 제목(64 · 48 · 36px)과 본문 18px. 이 기계에는 Inter 가 없어 `local()` 뒤 Helvetica Neue 계열로 그려졌다.
- **구조:** 카드 그리드 1280 에서 3열 · 390 에서 1열, 알약 탭(고른 탭이 흰 알약), 아코디언 FAQ(주색 토글 · 줄 가름), 지표 타일(큰 수 가운데), 한 줄 검색 바(첫 동작이 채운 알약 · 640 이하 세로로 쌓임), 제목이 위에 선 문의 폼.
- **보고 고친 것 둘:** ① 알약 검색 바에서 필드 라벨 · 마지막 동작이 둥근 끝에 붙었다 → 양 끝 여백을 키움. ② 체크 · 라디오 칸이 흰 면 위에서 거의 안 보이고 줄 높이 때문에 20×32 로 늘었다 → 테두리 · `height: 20px`. 두 판을 다시 찍어 확인했다.
- **옛 테마에서 더한 것(옛에는 없던 스킨):** 알약 탭의 고른 탭 표시(옛 `pill` 은 고른 탭을 구분하지 않았다), 폼 · 검색 바의 첫 동작을 채운 알약으로, 아코디언 첫 단계의 줄 가름, `List` 표 variant 의 비교표 스킨. 모두 옛 머리말의 성격(주 CTA 하나만 채운다 · FAQ)에서 나왔다.

## «실패 먼저» 와 구분력

- **먼저 빨강:** 새 케이스 17 개를 뼈대(HEAD) 소스(`manifest.ts` · `index.ts` · `theme.tsx` · `theme.css` 를 `git show HEAD:` 로, `views/` 를 걷음)에 대고 돌려 **14 실패 · 3 통과**. 통과 셋 가운데 «토큰마다 :root 에…» 는 토큰 0 개라 빈 판이었다 → 카나리아(`items.length > 0`)를 더했다. 나머지 둘(카탈로그 이름 · `default` 규칙 없음)은 성질을 잠그는 케이스라 전에도 초록이 맞다. 복원: tar 백업 → 11 파일 `cmp` 동일.
- **변조**(백업 이름은 경로 전체 · 변조 → 실행 → 백업 복사 · `filecmp` 바이트 비교 → 끝의 `git status` 깨끗). 변조 스크립트는 찾는 글자가 정확히 1 번 맞는지 단언한다. 모두 **값으로** 죽었다.

| 변조 | 실행 · 실패 | 죽은 케이스와 값 |
|---|---|---|
| M1 `Section` `inner` 의 `margin-left: auto` 뗌 | 17 · 1 | 가운데 두기 — `margin-left: expected '' to be 'auto'` |
| M2 `EntryForm` 제목을 자손 결합자로 | 17 · 1 | 새지 않는다 — 버튼 라벨 `expected 'var(--wb-typography-h2-fontSize)' not to be …h2…` (필드 라벨은 jsdom 이 문서 순서로 겹쳐 뒤의 `Field` 규칙이 이겨 안 죽음 — 버튼 줄이 잡는다) |
| M3 히어로 여백이 선언 없는 `--wb-space-22` 를 가리킴 | 17 · 1 | 변수 선언 — `expected [ Array(1) ] to deeply equal []` |
| M4 `List` `defaultVariant` → `table` | 17 · 2 | defaultVariant(`'table'` 대 `'cards'`) · variant 없는 List(`data-wb-variant` `'table'` 대 `'cards'`) |
| M5 `VIEWS` 에서 `Tree` 뗌 | 17 · 2 | 다섯(`[…(1)]` 대 `[…(2)]`) · Tree(`'indent'` 대 `'accordion'`) |
| M6 `Section` `inner` 를 `Focus` 로 감쌈 | 17 · 1 | 외곽선 기준 — `Section-default: expected <div data-wb-part="inner"> to be <section>` |
| M7 `KeyValue` 가 열 수 변수를 안 나름 | 17 · 1 | KeyValue — `expected '' to be '3'` |
| M8 `:root` 에서 `--wb-radius-lg: 24px;` 뗌 | 17 · 2 | `:root` 대조(`to contain '--wb-radius-lg: 24px;'`) · 변수 선언(7 자리) |
| M9 `Media` video 표지를 ✎ 로 | 17 · 1 | Media — `expected '✎' to be '▶'` |
| M10 `Section` 이 compact 클래스를 안 담 | 17 · 1 | Section — `expected '' to be 'wbsm-section-compact'` |
| B1(build) `:root` 의 `--wb-radius-lg` 를 다른 이름으로 | 3 · 1 | 빌드 판 — `expected '@font-face{…' to contain '--wb-radius-lg: 24px;'` |
| B2(build) `accentSoft` 를 쓰는 유일한 자리 뗌 | 3 · 1 | 안 쓰는 토큰 — `expected [ 'semantic.accentSoft' ] to deeply equal []` |

B 변조 뒤 다시 빌드한 산출물의 sha256 이 표와 같음을 확인했다.

## 게이트

| 명령 | 결과 |
|---|---|
| `pnpm typecheck` | 종료 0 · 오류 0 |
| `pnpm --filter @wirebound/system-theme-saas-marketing check` | 갤러리 칸 61 · 오류 없음 |
| `shots`(390 · 1280) | `report.json` 문제 0 건 — PNG 폭마다 3 장(8000px 구간) |
| `pnpm vitest run system-themes/saas-marketing` | 2 파일(unit 1 · build 1) · **20 통과 · 건너뜀 0 · 실패 0** |
| `pnpm vitest run --project build system-themes/saas-marketing` | 1 파일 · **3 통과 · 건너뜀 0 · 실패 0** |
| `pnpm vitest run apps/api/test/system-themes.test.ts apps/api/test/system-theme-checksums.test.ts` | 2 파일 · **15 통과 · 건너뜀 0 · 실패 0**(자기 DB 5451 · global-setup 시스템 테마 5 개 빌드 217ms) |
| `pnpm test --maxWorkers=25%` | 종료 0 · 369 파일 · **6283 통과 · 1 건너뜀 · 실패 0** · 510s. 건너뜀은 `apps/api/test/log-destination.test.ts` «Linux `/dev/full`»(macOS — 이 트랙과 무관). 뼈대 보고의 6268 에서 +15 = 이 테마 unit 케이스 2 → 17 |

모두 jsdom 값은 unit · build-test, 실 Chromium 값은 `shots` 다.

## 테마 밖에서 필요했던 것 · 본 것 (고치지 않음 — 코디네이터 판정)

1. **`system-themes/admin/build-test/wbtheme.test.ts` 의 CSS 단언은 빈 글자를 재는 것으로 보인다(admin 파일은 재지 않았다 — 같은 기전의 추론).**
   잰 것: build 프로젝트에서 `@wirebound/system-theme-saas-marketing` 의 `SAAS_MARKETING_THEME_CSS`(`theme.css?raw`)가 **빈 글자**다 —
   이 트랙에서 빌드 CSS 와 견주는 단언을 짜자 `expected '@font-face{…' to be ''` 로 죽었다. 루트 `vitest.config.ts` 의 `css.include`
   가 unit 프로젝트에만 있기 때문이다. admin build-test 의 `expect(…themeCss…).toContain(ADMIN_V0_CSS….slice(0, 200))` 도 같은 import
   꼴이라 `toContain('')` — 늘 참 — 이 된다. 또 빌드는 CSS 를 줄여 싣는다(따옴표 · 공백 · 주석이 사라진다) — 소스와 글자로 견주는 자는
   설 수 없다. 고칠 자리: admin 트랙(그 파일) — 이 트랙처럼 토큰 기본값(`--wb-<키>: <기본값>;`)이 빌드 CSS 에 있는지로 잰다.
   **지침에 넣을 문장** — `CLAUDE.md` 「검증」 절에 새 소절 «build 프로젝트에서는 `*.css?raw` 가 빈 글자다»: «루트
   `vitest.config.ts` 의 `css.include` 는 unit 프로젝트에만 있어 `--project build` 에서 `theme.css?raw` 는 빈 글자로 읽힌다 — build-test
   에서 소스 CSS 가 필요하면 `readFileSync` 로 읽고 `length > 0` 카나리아를 함께 둔다. 빌드된 `theme.css` 는 줄인 글자라 소스와 글자로
   견주지 않는다.»
2. 새 의존 · lock · 루트 설정 · 공유 테스트는 건드리지 않았다. 필요한 것은 모두 `@wirebound/theme-sdk`(`DEFAULT_VIEWS` · `nodeVar` · `defaultViewsCss`)와 `@wirebound/renderer`(`renderDocument` · `focusElement` — 이미 devDependency)로 됐다.

## 끝

띄운 것: `shots` · build-test 의 Chromium · dev 서버는 명령 안에서 닫힌다. 끝에 `ps` 로 이 워크트리 경로의 프로세스 0 건을 확인했다(아래 커밋 직전). Postgres(5451)는 이 워크트리의 것이라 그대로 둔다.
