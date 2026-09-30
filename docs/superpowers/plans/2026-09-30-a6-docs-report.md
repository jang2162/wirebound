# A6 테마 트랙 보고 — `system-docs`

계획: `docs/superpowers/plans/2026-09-30-a6-system-themes.md` 「T1 ~ T5 — 테마 트랙」(`<id>` = `docs`). 브랜치 `feat/a6-docs`.
이 문서는 발행 시점의 기록이다(`docs/guideline/base/04-citation.md` 「이력 문서는 연대기 금지의 예외다」).

설계 원천: 옛 JSON 테마 `git show b2766e8c^:packages/themes/src/system/docs.ts`(머리말의 «admin 과 갈리는 네 자리» 표) · 옛 케이스
`git show b2766e8c^:packages/themes/test/system-{section-centered,unresolved-literals}.test.ts`(이 테마 전용 케이스는 없었다).

## 커밋

| 커밋 | 내용 |
|---|---|
| `59eb7e23` | manifest — 토큰 22 · 무리 넷 · 옛 구조 선택을 `defaultVariant` 로 한 variant 선언 열 · `test/docs.test.ts` |
| `7b8bb5a3` | 뷰 넷(`Card` · `List` · `Tree` · `KeyValue`) — 옛 구조가 아닌 variant 는 SDK 기본 뷰에 넘김 · `test/views.test.tsx` |
| `82b5dff5` | `theme.css` — 옛 스킨 전부 · 옛 성질을 잠그는 `test/css.test.ts` |
| `eef7afcd` | 판 `1.0.0`(`package.json`) · `checksums.json` 에 `system-docs@1.0.0` 줄을 더함(`0.9.0` 줄은 그대로) |
| (이 보고서) | 이 문서 |

## 옛 → 새 대응

### 토큰 — 선언 22 개(무리 넷)

| 무리 | 새 토큰(키 = CSS 변수 `--wb-<키의 . 을 ->`) | 옛 자리 |
|---|---|---|
| 색(13) | `semantic.primary` · `primarySoft` · `surface` · `canvas` · `border` · `borderStrong` · `text` · `textMuted` · `danger` · `notice` · `noticeSoft` · `code` · `codeText` | 옛 `tokens.semantic` 13 개 그대로(값은 옛 `palette` 를 풀어 적음) |
| 글꼴(5) | `typography.family.serif` · `.sans` · `.mono` · `typography.body.fontSize`(17px) · `typography.body.lineHeight`(1.75) | 옛 `scale.typography.family` 셋 · `body` |
| 폭과 여백(2) | `container.maxWidth`(720px) · `section.paddingY`(40px) | 옛 `primitives.container.maxWidth` · `primitives.section.paddingY`(`space.10`) |
| 모양(2) | `radius.sm`(3px) · `radius.md`(6px) | 옛 `scale.radius` 의 sm · md |

`theme.css` 의 상수로 둔 것: `palette` 13 개(semantic 에 값으로 풀림) · 간격 단계(`--wb-space-*` — 쓰는 것만) · 제목 · 캡션 · 코드 · UI 글자 크기 ·
행간 · 굵기 · `motion.base`(120ms) · 본문 행 길이 `68ch`(토큰 길이 문법에 `ch` 가 없다 — px · rem · em · % · vh · vw) · 옛 `radius.lg`(옛
테마도 안 썼다) · `shadow` 둘(옛 테마도 안 썼다 — 새 CSS 에 그림자 0) · `breakpoints`(900 · 640 — `@media` 에 적음).

옛 `assets.fonts`(`local()` 만 가리키는 `@font-face` 여덟 블록)는 옮기지 않았다 — 옛 테마가 토큰 `family` 값에 face 이름 뒤로 같은 글꼴
이름을 늘어놓아 두 층이 같은 일을 했고, 새 토큰 값은 그 뒤쪽 이름들(`"Noto Serif KR"` · `Pretendard` · `"JetBrains Mono"` …)을 직접 싣는다.

### 구조 → variant(`defaultVariant` = 옛 구조 선택)

| 컴포넌트 | 옛 구조 | variant(굵게가 `defaultVariant`) | 뷰 |
|---|---|---|---|
| `Card` | `horizontal`(+ 노드 variant `default`·`featured`) | **`default` 참고 상자** · `featured` 경고 상자 · `plain` 보통 카드 | 뷰 — 주의 상자 DOM(`media` + `content`), `plain` 은 기본 뷰 |
| `Tabs` | `enclosed` | **`enclosed` 뚜껑 탭** · `underline` 밑줄 탭 | 기본 뷰(옛 렌더러에서도 DOM 이 같았다) — CSS 만 |
| `List` | `stackedList`(+ `compact`) | **`default` 문서 목록** · `compact` 촘촘 · `table` 표 | 뷰 — `<ul>/<li>`, `table` 은 기본 뷰. 줄 목록 둘은 `hideProps: ['columns']` |
| `Tree` | `accordion` | **`accordion`** · `indent` 들여쓰기 | 뷰 — 첫 마디만 펴진 중첩, `indent` 는 기본 뷰 |
| `KeyValue` | `definitionList` | **`definition` 정의 목록** · `table` 표 | 뷰 — `<dl>/<dt>/<dd>`, `table` 은 기본 뷰. `definition` 은 `hideProps: ['columns']` |
| `EntryForm` | `labelTop` | **`labelTop`** · `labelLeft` | 기본 뷰 — `labelLeft` 는 제 안의 `Field` 를 가로로 눕히는 CSS |
| `Field` | `underlined` | (선언 불가 — 변형이 `control` prop) | 기본 뷰 — 밑줄 CSS |
| `Button` | `text`(+ primary · secondary · danger · ghost) | **`default` 글자 버튼** · `primary` · `secondary` · `danger` · `ghost` | 기본 뷰 |
| `Link` | `default`(+ `muted`) | **`default` 본문 링크** · `muted` | 기본 뷰 |
| `Section` | `contained`(+ hero · muted) | **`default`** · `hero` · `muted` | 기본 뷰 |
| `Placeholder` | `default` 를 코드 블록으로 스킨 | **`code` 코드 블록** · `blank` 미정 영역 | 기본 뷰 — variant 별 CSS |

옛 노드 variant 의 id(`featured` · `compact` · 버튼 넷 · `muted` · `hero`)는 그대로 두었다 — 다른 테마에서 그 값을 고른 노드가 이 테마로 와도
같은 뜻(강조 → 경고 상자)으로 선다.

**옛 머리말의 대가 둘이 사라졌다:** ① «`Placeholder` 를 코드 블록으로 스킨하는 순간 미정 영역을 표현할 채널이 없다» → `blank` variant.
② «구조 선택이 타입 단위라 다른 모양을 한 문서에 둘 수 없다» → `plain` · `table` · `indent` · `underline` · `labelLeft`. 옛 머리말이 적은
«주의 상자 종류가 둘뿐(위험 · 팁 없음)» 은 그대로다 — 이 트랙은 옛 성격을 옮기는 일이라 variant 를 더 늘리지 않았다.

### 뷰를 쓴 컴포넌트와 까닭

| 뷰 | 까닭 |
|---|---|
| `src/views/Card.tsx` | 표시(`media`)를 옆에 두려면 머리 · 본문을 한 덩어리(`content`)로 묶어야 한다 — 감싸는 상자는 CSS 로 못 만든다. 마커는 `top-end`(왼쪽 위에 종류를 말하는 색 표시가 선다) |
| `src/views/List.tsx` | 줄 목록은 `<ul>/<li>` — 기본 뷰는 `<table>` |
| `src/views/Tree.tsx` | 아코디언은 깊이를 DOM 중첩(`panel` 안의 `node`)으로 낸다 — 기본 뷰는 평평한 목록 + 단계 변수 |
| `src/views/KeyValue.tsx` | `<dl>/<dt>/<dd>` 가 «용어와 그 뜻» 을 나른다 — 기본 뷰는 `<table>` |

넷 모두 `Focus` 를 두지 않는다(루트 상자가 곧 노드의 모양). 기본 뷰 모양의 variant 는 `DEFAULT_VIEWS[type]` 에 넘긴다
(`src/views/default-view.ts`) — DOM 을 베끼면 SDK 가 기본 뷰를 고칠 때 이 테마의 `plain` · `table` · `indent` 만 옛 DOM 으로 남는다.

## 옮긴 옛 성질

| 옛 케이스 · 머리말 | 새 케이스(`system-themes/docs/test/`) |
|---|---|
| `system-section-centered` «inner 에 maxWidth 가 걸린 층마다 marginX 가 auto» | `css.test.ts` «Section inner 에 폭을 걸거나 가로 여백을 덮는 규칙은 전부 auto 다»(반응형 층 포함 — 폭을 거는 규칙 수 > 0 양성 대조) |
| `system-unresolved-literals` «미해석 리터럴 0 — 브라우저가 말없이 선언을 버린다» | `css.test.ts` «theme.css 가 부르는 --wb-* 변수는 전부 :root 가 정의한다»(+ 검사기 자가 케이스) |
| 옛 `system.test` · `warning-channel` 의 «노드 손잡이 덮어쓰기» 경고 · 옛 머리말 «높이는 건드리지 않았다» | `css.test.ts` «Placeholder 의 height · Media 틀의 aspect-ratio 를 적지 않는다» · «Tree 마디의 왼쪽 여백은 아코디언에만 건다» |
| 머리말 «읽기 폭 — 칼럼 720px · 본문 68ch» | `css.test.ts` «읽기 폭 — 칼럼은 토큰, 본문 행은 글자 수» |
| 머리말 «서체 셋» | `css.test.ts` «서체 셋 — 본문 세리프 · 제목 산세리프 · 코드 모노» |
| 머리말 «본문 17px/1.75» | `css.test.ts` «본문은 크고 행간이 넓다» |
| 머리말 «선 하나로 만든다(`0 0 1px`)» | `css.test.ts` «선 하나로 가른다 — 아래 선만 1px»(그림자 규칙 0 포함) |

CSS 는 jsdom 의 `<style>` 파서(`sheet.cssRules` — `@media` 안까지)로 읽는다. 값을 재는 것이지 레이아웃이 아니다 — 화면은 아래 스크린숏.

## 스크린숏 — `/private/tmp/claude-501/-Users-jang2162-IdeaProjects-wirebound/cd7364a6-937a-4a56-bc50-dbfe60c4e848/scratchpad/a6-shots/docs/`

`system-docs-{390,1280}-{1,2}.png`(페이지가 8000px 보다 길어 구간 둘) · `report.json` — **콘솔 오류 0 · `data-wb-error` 0 · 가로 넘침 0**(두 폭,
`pageScrollWidth` = 폭). 페이지 높이(고친 뒤 다시 찍은 판 — `report.json` 의 `pageHeight`) 390: 11710px · 1280: 13111px. 이미지는 1600px(1280 폭) · 1400px(390 폭)
구간으로 잘라 원래 크기로 읽었다(`…/scratchpad/a6-docs/crops/`).

본 것(실 Chromium):

- **읽기 폭**: 1280 폭에서 `Section` 의 칼럼이 720px 로 가운데 선다(글자 시작 x≈280 = (1238 − 720)/2 + 여백). 390 폭에서는 칼럼이 폭을 채운다.
- **서체**: 본문 · 카드 본문 · 자식 글이 세리프, 제목 · 탭 · 목록 제목 · 버튼 · 필드 라벨이 산세리프, 코드 블록이 고정폭으로 섞여 선다.
- **색**: 잉크 / 종이 회색 · 남색 강조 하나 · 경고 상자만 호박색. 그림자 없음.
- **선**: 필드는 아래 선 하나(invalid 는 그 선이 `#d1383d` — 픽셀로 확인), 목록 줄 · 정의 목록 줄 · h2 가 아래 선으로 갈린다.
- **주의 상자**: 왼쪽 3px 막대 + 왼쪽 위 정사각 색 표시 + 오른쪽에 산세리프 제목 · 세리프 본문. 390 폭(`max-width: 640px`)에서 표시가 위 · 글이
  아래로 선다(옛 반응형 `sm: direction column`).
- **뚜껑 탭**: 탭 줄(바탕색 · 세 변 선)이 패널에 붙어 뚜껑으로 선다. 밑줄 탭은 선 위의 활성 밑줄.
- **아코디언**: 첫 마디만 펴져 왼쪽 선이 깊이를 보인다 · 들여쓰기 variant 는 기본 뷰 그대로.
- **어긋나서 고친 것 둘**(고친 뒤 다시 찍어 봄): ① `SearchForm` 안의 필드가 제 폭이 없어 밑줄만 남고 쪼그라들었다 → 필드에 `flex: 1 1 160px`
  · 폼에 `flex-wrap`. ② «빈 목록» 상태가 제목의 주색에 가려 안 보였다 → 빈 상태에서 제목도 흐린 글자색.
- **안 고친 것**: `Section` 의 `compact` prop 은 DOM 에 채널이 없어(기본 뷰가 싣지 않고 상태도 아니다) 이 테마도 그리지 않는다 — 갤러리의
  «compact» 칸이 보통 칸과 같다. 세로 `Divider` 는 높이를 주는 부모가 없는 갤러리 칸에서 보이지 않는다(`min-height: 100%` — 옛 값).

## 변조 — 백업(경로 전체 이름) → 한 곳만 맞는 글자 치환 → `pnpm vitest run --project unit system-themes/docs` → 바이트 비교 복원

스크립트 `…/scratchpad/a6-docs/mutate.py`. 매 변조 실행 33 · 끝에 소스 md5 가 변조 전과 같음 · `git status` 에 변조 흔적 없음.
**모든 변조가 값 단언으로 죽였다**(타임아웃 · 구문 오류 0).

| 변조 | 죽은 케이스(실패 값) |
|---|---|
| M1 900px 층이 inner 에 `margin-left: 0` | section-centered 만(층 둘의 `[media, margin-left, margin-right]` 배열이 모두 auto 인 기대와 다름) |
| M2 `:root` 의 `--wb-space-16` 지움 | unresolved 만(`['--wb-space-16']`) |
| M3 코드 블록에 `min-height` | 노드 손잡이(Placeholder · Media) 만 |
| M4 아코디언 마디 여백을 모든 Tree 에 | Tree 마디 여백 만 |
| M5 `68ch` → `720px` | 읽기 폭 만(`'720px'` 대 `'68ch'`) |
| M6 Text 바탕 서체 serif → sans | 서체 셋 만 |
| M7 본문 17 → 14px(manifest · CSS 함께) | «본문은 크고 행간이 넓다» 만 |
| M8 필드 밑줄 → 사방 1px | 선 하나 만(`'1px'` 대 `'0 0 1px'`) |
| M9 주의 상자 마커 뗌 | 마커 케이스 만(`null` 대 `'top-end'`) |
| M10 `content` 묶음 이름 바꿈 | Card default · featured DOM · «variant 를 안 고른 카드» (3) |
| M11 줄 목록 `<ul>` → `<div>` | List default · compact (2) |
| M12 아코디언 가지 안 폄 | 아코디언 만(panel 2 대 0) |
| M13 `<dt>` → `<div>` | 정의 목록 만 |
| M14 Tree `defaultVariant` → `indent` | «옛 구조 선택이 defaultVariant» · 아코디언(variant `'indent'`) (2) |
| M15 List 줄 목록의 `hideProps` 뗌 | hideProps 만 |
| M16 Card `plain` 선언 뗌 | «옛 선택 밖의 모양» · plain DOM · 마커(plain 이 주의 상자로 섬) (3) |
| M17 주의 상자 표시에 `Focus` | Card 외곽선 만 |
| M18 페이지네이션 늘 그림 | «페이지네이션을 끄면» 만 |
| M19 · M20 · M21 표 · 들여쓰기 위임 뗌 | 각 `table` / `indent` 케이스 만 |
| M22 판 `1.0.1` | «id · 판 · sdk» 만 |
| M23 토큰 하나의 무리 뗌 | «12 ~ 30 개 · 무리 · 한국어» 만 |
| M24 `:root` 기본값 하나를 manifest 와 다르게 | «:root 에 같은 이름 · 같은 기본값» 만 |
| M25 `Text` 에 variants 선언 | «카탈로그 · variantFrom» (`'role'`) · «옛 구조 선택» (2) |
| M26 List 첫 줄에 `data-wb-focus` | List 외곽선 만 |

혼자 죽는 변조를 못 본 것: «variant 를 안 고른 카드는 주의 상자다»(늘 «옛 구조 선택이 defaultVariant» 또는 Card DOM 케이스와 함께 죽는다 —
그 축은 `docs.test.ts` «옛 구조 선택이 defaultVariant 다» 가 소유하고, 이 케이스는 렌더러가 variant 없는 노드를 그 값으로 그리는 길을 잰다) ·
Tree · KeyValue 의 외곽선 케이스(M26 과 같은 꼴 — 따로 안 돌림) · unresolved 검사기 자가 케이스(테스트 안의 함수를 재는 양성 대조).
새 케이스는 구현 전에 먼저 빨강을 봤다(36 가운데 20 실패).

## 게이트(`eef7afcd` 위)

| 명령 | 결과 |
|---|---|
| `pnpm typecheck` | 종료 0 |
| `pnpm --filter @wirebound/system-theme-docs check` | 갤러리 칸 60 · 오류 0(안 쓰는 토큰 0 · 선언 밖 variant 0 포함) |
| `pnpm --filter @wirebound/system-theme-docs shots --out …/a6-shots/docs` | 두 폭 · `report.json` 문제 0 |
| `pnpm vitest run system-themes/docs` | 4 파일 · **36 통과 · 건너뜀 0 · 실패 0**(unit 33 + build 3 — 이 경로는 build 프로젝트도 고른다) |
| `pnpm vitest run --project build system-themes/docs` | 1 파일 · **3 통과 · 건너뜀 0 · 실패 0** |
| `pnpm vitest run apps/api/test/system-themes.test.ts apps/api/test/system-theme-checksums.test.ts` | 2 파일 · **15 통과 · 건너뜀 0 · 실패 0**(DB 5449 — `docker compose port postgres 5432` 가 `0.0.0.0:5449`) · global-setup 테마 다섯 빌드 144ms |
| `pnpm test --maxWorkers=25%` | 371 파일 · **6299 통과 · 1 건너뜀 · 실패 0** · 489.6s. 건너뜀은 `apps/api/test/log-destination.test.ts` 의 Linux `/dev/full` 판(macOS) |

jsdom 값: `test/*`(뷰 DOM · CSS 규칙 값) · `check`. 실브라우저 값: `shots`(Chromium) 뿐 — 마커 좌표 · 외곽선의 실측은 이 트랙에서 재지 않았다
(뷰가 `Focus` 를 안 두어 외곽선은 루트다).

`.wbtheme`: `system-docs-1.0.0.wbtheme` 6825 바이트(theme.js 6163) · sha256 `872b1639…21b7b9` — 두 번 빌드해 같았다.

## 테마 밖에서 필요했던 것

없다 — 고친 파일은 `system-themes/docs/**` 와 이 보고서뿐이다. 새 의존 · lock · 루트 설정 변경 없음.

지침으로 올릴 만한 것(코디네이터 판정):

- `packages/theme-kit/template/SKILL.md` 「토큰 값」 — `length` 에 `ch` 가 없어 «글자 수 기준 행 길이» 를 토큰으로 못 낸다. 문장 후보:
  «`ch` · `ex` 처럼 글꼴에 매인 단위는 토큰으로 받지 않는다 — 상수로 `theme.css` 에 둔다.»(문법을 넓힐지는 `packages/themes` 의 몫)
- `Section` 의 `compact` prop 이 기본 뷰 DOM 에 실리지 않아 어느 테마도 그 값을 그릴 수 없다(뷰를 쓰면 `props.compact` 로 가를 수는 있다).
  기본 뷰가 `data-wb-state` 나 노드 변수로 싣게 할지는 SDK 의 판정이다.
