# A6 admin 트랙 보고 — `system-admin` 1.0.0

계획: `docs/superpowers/plans/2026-09-30-a6-system-themes.md` 「T1 ~ T5 — 테마 트랙」(`<id>` = `admin`). 브랜치 `feat/a6-admin`.
이 문서는 발행 시점의 기록이다(`docs/guideline/base/04-citation.md` 「이력 문서는 연대기 금지의 예외다」).

## 요약

- 판 `0.1.0` → `1.0.0`. `checksums.json` 에 `system-admin@1.0.0` 줄을 **더했다**(`0.1.0` 줄은 그대로). `ADMIN_V0` · `ADMIN_V0_CSS` 이름은 그대로 — 지금 판을 가리킨다.
- 이름 · 설명은 옛 `meta` 그대로(`관리자` · `관리자 화면 기본 테마. 좁은 여백과 표 중심의 밀도를 갖는다.`).
- **선언 토큰 16 개**(색 9 · 모양 4 · 글자 2 · 밀도 1). 무리 넷, 칸마다 한국어 이름.
- **뷰 둘**(`List` · `KeyValue`) — 기본 뷰가 안 읽는 props 를 그린다. 나머지 17 컴포넌트는 SDK 기본 뷰.
- **variant 는 `0.1.0` 과 같은 id 들**(Section 3 · Card 2 · List 3 · Button 5 · Link 2, 전부 `defaultVariant: 'default'`) — 판을 올려도 없어지는 variant 가 0 이다.
- 옛 admin 이 이름만 고른 구조(`Tabs:underline` · `SearchForm:inline` · `EntryForm:labelLeft` · `List:table` · `Tree:indent`)의 **모양**을 `theme.css` 가 세운다. v0 판은 그 모양이 안 섰다(아래 «스크린숏»).

## 옛 → 새 대응표

원본: `git show b2766e8c^:packages/themes/src/system/admin.ts`.

### 토큰

| 옛 | 새 | 까닭 |
|---|---|---|
| `semantic.*` 9(primary · primarySoft · surface · canvas · border · borderStrong · text · textMuted · danger) | 토큰 9(무리 `color`, 키 · 기본값 그대로) | 사람이 고칠 만한 색. 키는 `0.1.0` 과 같다 — 저장한 토큰 값이 판을 올려도 이어진다 |
| `scale.radius` sm · md · lg | 토큰 `radius.sm` · `radius.md` · `radius.lg`(무리 `shape`) | 이름에 쓰이는 자리를 붙였다(«입력칸 · 단추» · «폼 · 그림» · «카드») |
| `scale.shadow.md` | 토큰 `shadow.md`(무리 `shape`, «그림자(강조 카드)») | `Card` `featured` 가 쓴다 |
| `scale.shadow.sm` | 걷음 | 옛 테마에서도 쓰는 스킨이 없었다 |
| `scale.space.unit` 4px | 토큰 `space.unit`(무리 `density`, «간격 단위 — 모든 여백이 이 값의 배수»). `--wb-space-N` 은 `calc(var(--wb-space-unit) * N)` | 옛 «unit 하나에서 스케일 파생» 을 CSS 로 옮겨 토큰 하나로 밀도가 바뀐다 |
| `scale.typography` 9 단 | 토큰 `typography.body.fontSize`(«본문 크기»), 나머지는 `theme.css` 상수 | 본문 크기만 폼에 — 제목 단계까지 내면 칸이 스물이 넘는다 |
| (없음 — 옛 admin 은 서체를 선언하지 않았다) | 토큰 `font.body`(«서체», `system-ui, -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`) | 옛 캔버스는 에디터의 서체를 물려받았다. 지금 캔버스 iframe · 내보낸 번들의 페이지 문서에는 서체가 없어 브라우저 기본(명조)으로 그려진다 — `[data-wb-component]` 마다 건다(`button` 은 서체를 안 물려받는다) |
| `palette.*` 10 | 걷음 | 스킨이 `semantic` 만 가리켰고 `semantic` 이 값을 직접 갖는다. 밖에서 `--wb-palette-*` 를 쓰는 곳 0(`git grep -n "wb-palette" -- ':!system-themes/admin' ':!docs'`) |
| `scale.motion.base` | 상수 `--wb-motion-base` | 사람이 고칠 값이 아니다 |
| `primitives.container.maxWidth: 'none'` | 상수 `--wb-container-maxWidth: none` | `length` 토큰은 `none` 을 못 받는다. 관리자 화면은 칼럼 폭을 안 가둔다(fluid) |
| `primitives.grid.gap` | 상수 `--wb-grid-gap` | |
| `primitives.container.gutter` · `grid.columns` · `section.paddingY(Compact)` | 걷음 | 옛 컴파일 CSS 에서도 `:root` 에 적히기만 하고 읽는 규칙이 없었다 |
| `primitives.breakpoints.sm` 640 | `@media (max-width: 640px)` | |

### 구조 → variant · 뷰

옛 admin 이 고른 구조는 전부 카탈로그의 **첫 구조**다 — `Section:contained` · `Card:plain` · `Tabs:underline` · `List:table` · `Tree:indent` · `KeyValue:table` · `SearchForm:inline` · `EntryForm:labelLeft` · `Field:outlined` · `Button:solid` · `Media:image`. 기본 뷰의 DOM 이 곧 그 구조라 **variant 로 옮길 다른 선택이 없다**(D4 의 «옛 선택을 `defaultVariant`» 가 걸릴 자리가 없다). variant 는 `0.1.0` 이 선언한 스킨 variant 그대로다.

| 컴포넌트 | 새 | 까닭 |
|---|---|---|
| `List` | 뷰 `src/views/List.tsx` | 기본 뷰는 `selectable` · `empty` · `loading` 을 안 읽는다. 뷰가 맨 앞 체크 칸(`data-wb-cell="check"` · `checkbox` 조각), «데이터가 없습니다» 한 줄(`empty` · 모든 칸을 덮는 `colSpan`), 칸마다 막대(`skeleton`)를 그린다. 셋이 꺼져 있으면 기본 뷰와 DOM 이 같다(케이스) |
| `KeyValue` | 뷰 `src/views/KeyValue.tsx` | 기본 뷰는 `columns` 를 안 읽고(쌍마다 한 행), 열 수를 CSS 로 나를 노드 변수도 없다. 뷰가 쌍을 `columns` 개씩 한 행에 놓고 모자란 마지막 행은 빈 칸(`filler`) 하나로 덮는다. `columns` 1 이면 기본 뷰와 DOM 이 같다 |
| 나머지 17 | SDK 기본 뷰 + `theme.css` | CSS 로 선다 |

두 뷰 모두 **루트가 표 전체**라 `Focus` · `marker` 를 두지 않는다 — 외곽선 · 번호 마커의 기준 상자가 기본 뷰와 같은 루트(표의 왼쪽 위)다.

### CSS 가 세운 옛 구조의 모양

| 구조 | `theme.css` |
|---|---|
| `Tabs:underline` | 목록 아래 1px 선, `aria-selected="true"` 탭만 주색 2px 밑줄 · 주색 글자 |
| `SearchForm:inline` | 필드가 한 줄로 서고(넘치면 접힘) 단추가 줄 끝 · 필드 아래 선에 맞춤. 640 이하에서는 필드 묶음이 한 줄을 다 쓰고 단추가 아래로 |
| `EntryForm:labelLeft` | 제목 아래 선, 필드마다 라벨 칸(8rem) · 입력 칸 두 칸 격자, 단추는 입력 칸 줄에 맞춤. 640 이하에서는 라벨이 위로 |
| `List:table` | 바깥 테두리 · 행마다 아래 실선 · 왼쪽 정렬 머리 · 줄무늬. `featured` 는 위 주색 선 + 주색 머리, `compact` 는 칸 위아래 여백 `space.1` |
| `Tree:indent` | 글머리표 없이 단계 × `space.5` 들여쓰기 |
| `KeyValue:table` | 키 칸에 옅은 바탕을 깐 격자 표. 640 이하에서는 쌍을 한 줄씩 쌓는다 |
| 폼의 단추 자리(`조회` · `초기화` · `저장` · `취소` — 기본 뷰가 `span` 으로 그림) | 첫째 주 단추 · 나머지 보조 단추, `Button` 과 같은 크기 |
| `Field:outlined` | 흰 바탕 · 회색 테두리 입력칸, `select` 는 ▾, `checkbox` · `radio` 는 라벨 앞 16px 상자, `required` 는 라벨 뒤 붉은 `*` |

폼의 조각 규칙은 직계(`>`)로 잡는다 — 안의 `Field` 도 `label` 조각을 가져 자손으로 잡으면 필드 라벨마다 폼 제목의 밑줄이 선다(첫 스크린숏에서 봤다 · 케이스로 잠갔다).

## 옮긴 옛 성질 (D4)

| 옛 케이스(`git show b2766e8c^:packages/themes/test/<파일>`) | 새 케이스(`system-themes/admin/test/admin.test.ts`) |
|---|---|
| `system-section-centered.test.ts` «inner에 maxWidth가 걸린 층마다 marginX가 auto다» | «max-width 를 거는 규칙마다 margin-left · margin-right 가 auto» |
| `system-section-centered.test.ts` «admin의 컨테이너 — fluid다» | «칼럼 폭은 가두지 않는다 — --wb-container-maxWidth 가 none» |
| `system-unresolved-literals.test.ts` (미해석 리터럴 0) | «선언 값에 var() 밖의 점 찍힌 맨 이름이 없다» + 새 꼴 «var() 가 가리키는 --wb-* 는 전부 :root 에 정의돼 있다»(코드 테마에서 조용히 버려지는 선언은 없는 변수를 가리킨 것이다) |
| `system.test.ts` «`!important`가 없다» | «!important 가 없다» |
| `system.test.ts` «Text 변형이 타이포 스케일을 건다» | «Text 의 역할마다 제 타이포 스케일을 건다»(아홉 역할 전부) |
| `system.test.ts` «파생된 간격 스케일이 실려 있다» | «--wb-space-N 은 전부 --wb-space-unit × N» |
| `system.test.ts` «내장 테마는 매번 같은 CSS를 낸다» | 옮기지 않음 — CSS 는 이제 생성물이 아니라 소스다. 빌드 결정성은 체크섬 케이스(`apps/api/test/system-theme-checksums.test.ts`)가 잰다(두 번 빌드한 sha256 이 같음을 이 트랙에서도 봤다) |
| `system-portal.test.ts` | portal 트랙의 몫 |

CSS 케이스는 `theme.css` 를 글자로 찾지 않고 jsdom 의 CSSOM 으로 읽어 규칙 · 선언 단위로 잰다. jsdom 이 규칙 105 · 선언 406 을 싣고, 원문을 주석 걷고 센 수(`{` − `@media` 1 · `;`)와 같다(두 방법).

## 스크린숏

`/private/tmp/claude-501/-Users-jang2162-IdeaProjects-wirebound/cd7364a6-937a-4a56-bc50-dbfe60c4e848/scratchpad/a6-shots/admin/` — `system-admin-390-{1,2}.png` · `system-admin-1280-{1,2}.png` · `report.json`(콘솔 오류 · `data-wb-error` · 가로 넘침 0). 견줄 v0 판: 같은 스크래치의 `a6-shots/_scaffold/admin/`.

직접 열어 본 것(이미지를 구간으로 잘라 읽음):

- **v0 판에서 본 결함**: 탭 `가나다` 가 붙어 한 글자열 · 고른 탭 표시 없음 / 조회 폼 필드가 세로로 쌓이고 단추 자리가 `조회초기화` 글자로 붙음 / 등록 폼 라벨이 위에 · `저장취소` 붙음 / 트리에 글머리표(•) / 키-값이 표 선 없이 `이름 홍` 한 줄 / `List` `featured` 가 기본과 같은 모습. 성격(«표 중심 · 조작하는 화면») 가운데 표만 섰다.
- **1280(새 판)**: 표가 테두리 · 행 선 · 줄무늬 · 왼쪽 정렬 머리로 서고 `compact` 가 눈에 띄게 촘촘하다 · `featured` 는 위 주색 선과 주색 머리 · 선택 가능 목록에 체크 칸(선택 행은 채운 상자) · 빈 목록은 «데이터가 없습니다». 탭은 고른 `나` 에 주색 밑줄. 조회 폼은 필드 둘 + `조회`(주) · `초기화`(보조)가 한 줄. 등록 폼은 라벨 왼쪽 칸 · 필수 `*` · 단추가 입력 칸 줄. 상세(`KeyValue` 2열)는 `이름 | 홍 | 나이 | 3` 격자. 카드 10px 모서리 · 1px 테두리, `featured` 는 주색 테두리 + 그림자. 단추 4px 모서리 채운 주색. 서체는 산세리프. 섹션은 폭을 안 가두고 옅은 회색 바탕.
- **첫 판에서 보고 고친 것**: ① 등록 폼의 필드 라벨마다 제목의 밑줄(자손 셀렉터) → 직계로 ② 390 에서 조회 폼 입력칸이 단추와 한 줄을 나눠 좁음 → 640 이하에서 필드 묶음 `flex-basis: 100%`.
- **390**: 표 세 칸이 넘치지 않고 · 조회 폼은 필드가 한 줄씩 · 단추가 아래 · 등록 폼 라벨이 위로 · 상세는 쌍마다 한 줄 · 가로 넘침 0(`report.json`).
- 그대로 둔 것: `Section` `hero` 는 640 이하에서 기본과 같은 여백(옛 `responsive.sm` 이 그랬다).
- `Divider` 세로 — 아래 «코디네이터가 넘긴 것» 2.

## 커밋

| 커밋 | 내용 |
|---|---|
| `1401bcdb` | manifest(토큰 16 · 이름 · 설명 · 판 `1.0.0`) · `theme.css` · 뷰 `List` · `KeyValue` · 케이스 두 파일 · `package.json` 판 · `checksums.json` 에 `system-admin@1.0.0` 줄 더함(그때 `b584102a…`) |
| `4e845ec8` | 이 보고서 첫 판 |
| («코디네이터가 넘긴 것» 커밋) | build-test 단언 · `shadow.md` 기본값 글자 · 세로 `Divider` · 케이스 하나 · `1.0.0` 체크섬 줄을 새 산출물로(`9a34736b…` — 이 브랜치에서 더한 줄이라 아직 배포 전) · 이 보고서 |

한 커밋으로 묶은 까닭: 소스를 한 바이트라도 바꾸면 산출물 sha256 이 바뀌어, 판 · 체크섬 줄을 따로 두면 사이 커밋마다 체크섬 케이스가 빨강이다.
sha256 은 두 번 빌드해 같았다(`pnpm --filter @wirebound/system-theme-admin build` → `shasum -a 256 system-themes/admin/dist/*.wbtheme`).

## 케이스 · 변조

케이스: `system-themes/admin/test/admin.test.ts` 16 · `test/views.test.tsx` 9(둘 다 jsdom) · `build-test/wbtheme.test.ts` 4(`checkTheme` 오류 0 · 안 쓰는 토큰 0 · 선언 밖 variant 0 에 더해 «빌드 CSS 에 토큰마다 기본값» — 아래 «코디네이터가 넘긴 것» 1). 아래 «먼저 빨강» · 변조 27 은 첫 커밋의 24 케이스에 대한 것이고, 뒤에 더한 둘은 «코디네이터가 넘긴 것» 에 적는다.

**먼저 빨강** — 두 파일을 고치기 전 소스(HEAD 의 `manifest.ts` · `theme.css` · `index.ts` · `theme.tsx` 를 끼움 → 실행 → 백업에서 복원 · `cmp` 같음)에 물림: **24 가운데 9 실패 · 15 통과.** 실패 9 는 값으로 죽었다(판 `'0.1.0'` · `List/featured` 규칙 없음 · `--wb-space-4: 16px` · 고른 탭 규칙 `undefined` · 체크 칸 · 빈 줄 · 막대 · `columns` 행 · 뷰 목록 `DEFAULT_VIEWS`). 통과 15 는 v0 도 가진 성질을 잠그는 것이다(토큰 칸 · `:root` 기본값 · variant id · `!important` · var 정의 · 맨 이름 · fluid · margin auto · Text 스케일 · 기본 뷰와 같은 DOM 둘 · 마커 둘 · 카탈로그 이름 · `default` 규칙 없음).

**구분력** — 변조 27(백업은 경로 전체 이름 → 글자 한 곳 바꿈(맞은 수 1 확인) → `pnpm vitest run system-themes/admin/test --reporter=json` → 백업 복원 · `filecmp` 같음). 실행 수는 매번 24. 도구: 스크래치 `a6-admin/mutate.py`.

| 변조 | 죽은 케이스(값) |
|---|---|
| M1 등록 폼 제목 규칙의 직계(`>`) 뗌 | «고른 탭만 … 필드 라벨에 안 닿는다» 만(`expected [ Array(1) ] to deeply equal []`) |
| M2 `--wb-space-4: 16px` | «--wb-space-N 은 …» 만(`expected '16px' to be 'calc(…) * 4)'`) |
| M3 `List` `featured` 규칙 둘 가운데 하나 뗌 | **안 죽음** — 다른 한 규칙이 그 variant 를 겨냥한다(케이스는 «규칙이 하나라도 있나» 를 잰다). M21 이 둘 다 뗀 판 |
| M4 단추 `transition` 에 `!important` | «!important 가 없다» 만 |
| M5 `Section` `inner` 의 `margin-left: auto` 뗌 | «max-width 를 거는 규칙마다 …» 만 |
| M6 없는 변수 `--wb-semantic-muted` 참조 | «var() 가 가리키는 --wb-* …» 만(`['--wb-semantic-muted']`) |
| M7 값에 맨 이름 `semantic.textMuted` | «점 찍힌 맨 이름이 없다» 만 |
| M8 `h1` 이 `h2` 스케일 | «Text 의 역할마다 …» 만 |
| M9 고른 탭 셀렉터를 `:first-child` 로 | «고른 탭만 …» 만(`expected undefined to be 'var(--wb-semantic-primary)'`) |
| M10 manifest 주색 기본값 `#2563ea` | «토큰마다 :root 에 같은 …» 만(`expected '#2563eb' to be '#2563ea'`) |
| M11 `--wb-container-maxWidth: 100%` | «칼럼 폭은 가두지 않는다» 만 |
| M12 `List` 행의 체크 칸 뗌 | «selectable — …» 만(`['check', null, null, null, null]`) |
| M13 빈 줄 `colSpan` 을 칼럼 수로 | «empty — …» 만(`'2'` 대 `'3'`) |
| M14 `loading` 무시 | «loading — …» 만(길이 0 대 6) |
| M15 `List` 루트에 `marker` | «기본 뷰와 DOM 이 같다» · «루트가 표 전체 …» 둘 |
| M16 `KeyValue` 빈 칸(`filler`) 뗌 | «columns 쌍씩 한 행 …» 만 |
| M17 `KeyValue` `columns` 무시 | 같은 케이스 만(행 3 대 2) |
| M18 `List` 줄무늬(`rowAlt`) 뗌 | «기본 뷰와 DOM 이 같다» 만 |
| M19 `space.unit` 의 무리 뗌 | «토큰은 12 ~ 30 개 · 칸마다 …» 만(`space.unit: expected false to be true`) |
| M20 `Button` `ghost` variant 뗌 | «0.1.0 이 선언한 variant …» 만 |
| M21 `List` `featured` 규칙 둘 다 뗌 | «… variant 마다 그 variant 를 겨냥한 규칙» 만(`['List/featured']`) |
| M22 `Link` `default` variant 규칙 더함 | «[data-wb-variant="default"] 규칙이 없다» 만 |
| M23 manifest 에 카탈로그 밖 `Banner` | «카탈로그의 이름만» · «0.1.0 이 선언한 variant» 둘(후자는 선언 목록을 통째로 견줘 함께 죽는다) |
| M24 `KeyValue` 루트에 `marker` | «columns 1 이면 기본 뷰와 DOM 이 같다» · «루트가 표 전체» 둘 |
| M25 `KeyValue` 키 칸을 `td` 로 | «columns 1 이면 기본 뷰와 …» 만 |
| M26 `List` 마커를 `selectable` 일 때만 | «루트가 표 전체 …(List)» 만 — M15 에서 함께 죽던 마커 케이스가 혼자 죽는 판 |
| M27 `KeyValue` 에 `columns > 1` 일 때만 `Focus` | «루트가 표 전체 …(KeyValue)» 만(`<tbody data-wb-focus>` 대 `<table>`) |

새 케이스 24 가 모두 혼자 죽는 변조를 하나 이상 가진다. 끝에 `git status` · `git diff --stat` 는 이 트랙의 변경만(변조 흔적 없음).

jsdom 값과 실브라우저 값: 위 케이스는 전부 jsdom(DOM · CSSOM — 레이아웃 없음). 레이아웃(한 줄 · 라벨 왼쪽 · 넘침)은 `wb-theme shots`(실 Chromium) 스크린숏과 `report.json` 으로만 봤다 — 케이스로 잠그지 않았다(아래 «테마 밖»).

## 게이트

| 명령 | 결과 |
|---|---|
| `pnpm typecheck` | 종료 0 |
| `pnpm --filter @wirebound/system-theme-admin check` | 갤러리 칸 53 · 오류 없음 |
| `pnpm --filter @wirebound/system-theme-admin shots --out …/a6-shots/admin` | 390(9222px · PNG 2) · 1280(10831px · PNG 2) · `report.json` 문제 0 |
| `pnpm vitest run system-themes/admin` | 2 파일 · **24 통과 · 건너뜀 0 · 실패 0** |
| `pnpm vitest run --project build system-themes/admin` | 1 파일 · **3 통과 · 건너뜀 0 · 실패 0** |
| `pnpm vitest run apps/api/test/system-themes.test.ts apps/api/test/system-theme-checksums.test.ts` | 2 파일 · **15 통과 · 건너뜀 0 · 실패 0**(global-setup 이 소스로 다시 빌드 — «시스템 테마 5 개 빌드 170ms») |
| `pnpm test --maxWorkers=25%` | 370 파일 · **6282 통과 · 1 건너뜀 · 실패 4** · 548.5s. 실패 4 는 전부 **5s 타임아웃** — `apps/web/test/role-access.test.ts` 1 · `apps/web/test/lock/one-verdict.test.ts` 3(소스를 훑는 케이스, admin 과 무관). 그때 부하 평균 125(다섯 트랙 동시). 두 파일만 다시 돌리면 **14 통과 · 실패 0**. 건너뜀 1 은 `log-destination` «Linux `/dev/full`»(macOS) |
| `pnpm test:browser` | 24 파일 · **89 통과 · 건너뜀 0 · 실패 0** · 341.3s — `canvas-iframe`(«늦게 온 테마 시트» — 단추 `transition` 카나리아) · `theme-canvas` · `theme-settings` · `theme-admin` · `theme-review` 포함. 이 워크트리 Postgres(5447) |

**«코디네이터가 넘긴 것» 을 고친 뒤 다시 돈 것**(마지막 트리):

| 명령 | 결과 |
|---|---|
| `pnpm typecheck` | 종료 0 |
| `pnpm --filter @wirebound/system-theme-admin check` | 갤러리 칸 53 · 오류 없음 |
| `shots` 두 폭 | `report.json` 문제 0 (1280 페이지 10852px) |
| `pnpm vitest run system-themes/admin` | 3 파일(unit 2 · build 1) · **29 통과 · 건너뜀 0 · 실패 0** |
| `pnpm vitest run --project build system-themes/admin` | 1 파일 · **4 통과 · 건너뜀 0 · 실패 0** |
| api 두 파일 | 2 파일 · **15 통과 · 건너뜀 0 · 실패 0**(체크섬 표의 `9a34736b…` 와 global-setup 빌드가 같음) |
| `pnpm test --maxWorkers=25%` | 370 파일 · **6287 통과 · 1 건너뜀 · 실패 0** · 287.4s(건너뜀은 `log-destination` «Linux `/dev/full`») |
| `pnpm vitest run --project build` `canvas-iframe` · `theme-canvas` · `theme-settings` · `theme-admin` · `theme-review` | 5 파일 · **22 통과 · 건너뜀 0 · 실패 0** — `pnpm test:browser` 전량(24 파일)은 첫 커밋 트리에서 돌았고, 뒤의 고침은 admin CSS 의 `Divider` · 그림자 글자뿐이라 admin CSS 에 기대는 다섯만 다시 돌았다 |

## 테마 밖에서 필요했던 것

고친 테마 밖 파일 0(이 보고서 빼고). 코디네이터가 판정할 것:

1. **레이아웃 성질을 잠그는 실브라우저 케이스가 없다.** «등록 폼 라벨이 입력칸 왼쪽» · «조회 폼이 한 줄» · «390 에서 넘침 0» 은 스크린숏으로만 봤다. `system-themes/admin` 은 playwright-core 에 기대지 않고(새 의존 금지), kit 의 `takeShots` 는 넘침 · 오류만 보고 요소 좌표를 안 낸다. 테마 build-test 가 요소 좌표를 잴 수 있으려면 kit 에 «갤러리 칸을 실 Chromium 에 그려 좌표 조회를 돌려주는» 도구가 필요하다(뼈대 트랙 몫).
2. **SDK 기본 뷰가 안 읽는 props 가 둘 더 있다** — `Section` `compact`(`--wb-section-paddingYCompact` 같은 자리가 옛 테마에도 있었으나 닿지 않았다) · `SearchForm` `collapsed`. admin 은 옛 모습(둘 다 효과 없음)을 지켜 뷰를 안 냈다. 다섯 테마가 모두 같은 빈칸을 가지면 기본 뷰가 읽게 하는 것이 맞다(SDK 몫).
3. 지침: 없음.

## 코디네이터가 넘긴 것 (`q-a6-admin.md`)

### 1. build-test 의 CSS 단언이 빈 글자와 견줬다(saas-marketing 트랙이 찾음)

- **재현(값):** `build-test/wbtheme.test.ts` 의 첫 케이스에 값을 찍는 줄을 임시로 넣고(백업 → 실행 → `cmp` 복원) `pnpm vitest run --project build system-themes/admin/build-test/wbtheme.test.ts` → `{"cssLength":0,"needleLength":0,"themeCssLength":19429}`. build 프로젝트에서 `ADMIN_V0_CSS`(`theme.css?raw`)가 빈 글자라 `toContain('')` — 늘 참이었다(루트 `vitest.config.ts` 의 `css.include` 는 unit 프로젝트에만 있다 — 고치지 않았다).
- **고친 것:** 그 단언을 걷고 케이스 «빌드 CSS 에 토큰마다 --wb-<키>: <기본값>; 이 있다» 를 세웠다 — 견주는 쪽은 manifest(`MANIFEST.tokens.items`), 카나리아는 빌드 CSS 길이 > 0 · 토큰 수 > 0. `ADMIN_V0_CSS` 가져오기를 뗐다.
- **새 케이스가 처음부터 빨강이었다 — 값 `['shadow.md']`.** 빌드가 CSS 를 줄이며 `rgba(15,23,42,.10)` 을 `rgba(15,23,42,.1)` 로 바꿔 manifest 기본값과 빌드 CSS 의 글자가 갈렸다(같은 값). manifest · `theme.css` 의 기본값을 줄인 꼴 `.1` 로 맞춰 셋이 같은 글자다 → 초록. 이 차이는 옛 단언으로는 영영 안 보였다.

### 2. `Divider` 세로가 0 높이(portal 트랙이 찾음)

- **재현:** 첫 스크린숏(1280 · 390 모두)에서 «Divider — 세로» 칸이 비어 있었다(위 «스크린숏» 첫 판에 적은 것). 높이가 정해지지 않은 부모에서 `min-height: 100%` 가 0 이다.
- **고친 것:** portal 과 같은 꼴 — `align-self: stretch` · `width: 1px` · `min-height: 1.5em`(한 줄 높이를 바닥으로, 가로 `Flex` 안에서는 늘어남). 좌우 여백은 안 둔다(`Flex` 의 `gap` 이 준다). 다시 찍은 1280 스크린숏에서 1px × 한 줄 높이 선이 보인다(`report.json` 문제 0, 1280 페이지 10852px).
- **케이스:** `admin.test.ts` «세로 Divider 의 최소 높이는 백분율이 아니다». 변조 — `min-height: 100%` 로 되돌림 → 그 케이스만 죽음(`expected '100%' not to match /%/`) → 백업 복원 · `cmp` 같음.

### 뒤따른 판

소스가 바뀌어 `1.0.0` 산출물이 바뀌었다 — 두 번 빌드한 sha256 이 같고(`9a34736b…`) 그 값으로 `system-admin@1.0.0` 줄을 고쳤다(`0.1.0` 줄은 그대로). 이 줄은 이 브랜치에서 더한 것이라 배포된 판이 아니다.

## 띄운 것

`check` · `shots` · build-test · `test:browser` 가 띄운 dev 서버 · Chromium 은 명령 · 케이스 안에서 닫힌다. 끝에 `ps -eo pid,etime,command | grep feat-a6-admin` 로 이 워크트리 경로의 남은 프로세스 · headless Chrome 을 찾아 0 건. Postgres 컨테이너(5447)는 이 워크트리의 것이라 그대로 둔다.
