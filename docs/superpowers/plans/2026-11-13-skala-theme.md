# 기본테마 2.0.0 — lms-skala 관리자 디자인 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기본테마(`system-admin`)를 `2.0.0` 으로 올려 lms-skala 관리자 본문(`.adp-` 어휘)과 닮은 모양으로 바꾼다.

**Architecture:** 테마는 뷰 없이 `theme.css` 와 manifest 토큰으로만 꾸민다(지금과 같다 — `VIEWS` 는 빈 채다). SDK · 렌더러 · 카탈로그는 안 고친다. 같은 id 의 새 판이라 새 프로젝트 · 테마가 빈 프로젝트가 저절로 이 판으로 서고, 이미 고정된 프로젝트는 그 판에 남는다.

**Tech Stack:** `@wirebound/theme-sdk` · `wb-theme build/check/shots` · vitest(jsdom · build · 실브라우저 `editor-stack`)

**Spec:** 이 문서의 「설계」 절(사용자가 2026-11-13 대화에서 승인). 참고 원본은 `/Users/jang2162/Projects/Work/lms-skala/src/main/resources/static/public/mng/scss/`(읽기만 — 그 저장소에 아무것도 쓰지 않는다)와 그 결정문 `/Users/jang2162/Projects/Work/lms-skala/docs/guides/mng-page-layout-decisions.md`.

## 설계

**무엇을 왜** — 사용자가 lms-skala 관리자 사이트와 닮은 디자인의 테마를 만들어 기본 테마를 교체하라고 했다. wirebound 로 그 사이트의 화면 설계서를 그리면 실제 화면과 같은 인상이어야 한다.

**접근 셋 가운데 고른 것**

| 접근 | 대가 | 판정 |
| --- | --- | --- |
| `system-admin` 을 `2.0.0` 으로 올림 | 없음 — 새 프로젝트는 늘 `system-admin` 최신판으로 선다 | **고름** |
| 새 id(`system-skala`)를 내고 기본값을 옮김 | 기본값 코드 · 시딩 · 마이그레이션 · 케이스를 전부 고친다. 시스템 테마가 다시 둘이 된다 | 버림 |
| 새 판을 내고 기존 프로젝트도 마이그레이션으로 옮김 | 고정 원칙(§6 «프로젝트가 그중 하나에 고정된다»)을 깬다. 사용자가 원하면 뒤 트랙 | 버림(이월) |

**목표** — 색 · 서체 · 밀도 · 카드 · 폼 표 · 조회 폼 · 표 · 단추 · 입력 · 팝업이 아래 「참고 값」 과 맞는다.

**비목표** — 헤더 · LNB 같은 셸(카탈로그에 없다). Pretendard 글꼴 파일 싣기(서체 이름만 맨 앞에 둔다). 기존 프로젝트의 판 올리기. SDK 기본 뷰 · 기본 CSS · 카탈로그 변경. 새 variant.

**반(反)목표** — variant id 가 없어지거나 토큰 키가 없어져, 1.x 에 고정된 프로젝트가 판을 올릴 때 모양 · 덮은 토큰을 잃는 것. 배포한 판(`checksums.json` 의 1.8.0 이하 줄)을 건드리는 것.

## Global Constraints

- `MANIFEST.id` 는 `system-admin`, `name` 은 `기본테마`, `version` 은 `2.0.0`, `sdk` 는 `^1.8.0` 그대로다.
- `system-themes/admin/checksums.json` 의 기존 열두 줄은 한 글자도 안 바꾼다. `system-admin@2.0.0` 한 줄만 더한다.
- `MANIFEST.components` 의 타입 · variant id · `defaultVariant` 는 그대로다(`test/admin.test.ts` «0.1.0 이 선언한 variant …» 가 잠근다).
- 지금 토큰 키 열여섯은 전부 남긴다(값만 바꾼다). 키를 더할 수는 있다 — 합쳐 30 개 이하.
- `theme.css` 에 `!important` · `@layer` 를 쓰지 않는다. `VIEWS` 는 빈 채다.
- 색 토큰 기본값은 소문자 `#rrggbb` 다(색 칸이 그 꼴로 보낸다).
- `packages/*` · `apps/*/src` 의 소스는 안 고친다. 케이스 · 픽스처는 고칠 수 있다(Task 1 의 인구조사가 정한다).
- 화면 문안 · 주석은 그 파일의 관례(한국어)를 따른다. 주석 규칙은 `docs/guideline/base/03-comments.md`, 인용 규칙은 `04-citation.md` 다.
- 커밋은 경로를 지정해 stage 한다. 커밋 메시지는 저장소 관례(영어 · conventional)다.

## 참고 값

lms-skala 의 `_tokens.scss` · `_card.scss` · `_field-grid.scss` · `_form.scss` · `_table.scss` · `_search.scss` · `_popup.scss` 에서 읽은 값이다. 여기 없는 부품은 그 파일들을 직접 읽어 같은 어휘로 맞춘다.

**토큰 기본값**

| 키 | 값 | 출처 |
| --- | --- | --- |
| `semantic.primary` | `#0a78d8` | `$c-primary` |
| `semantic.primarySoft` | `#d8e9fa` | `$c-bg-active` |
| `semantic.surface` | `#ffffff` | `$c-surface` |
| `semantic.canvas` | `#f3f4f6` | `$c-bg-sub` — 라벨 칸 · hover · 옅은 구역 |
| `semantic.border` | `#cccccc` | `$c-border` |
| `semantic.borderStrong` | `#666666` | `$c-neutral-strong` — 단추 hover 테두리 |
| `semantic.text` | `#333333` | `$c-text` |
| `semantic.textMuted` | `#666666` | `$c-neutral-strong` |
| `semantic.danger` | `#f04a3b` | `$c-danger` |
| `radius.sm` · `radius.md` · `radius.lg` | `4px` | `$radius` |
| `shadow.md` | `0 1px 2px rgba(20,30,50,.06)` | `$shadow-panel` 의 첫 겹(토큰 문법이 쉼표 겹을 받으면 두 겹 다) |
| `font.body` | `"Pretendard", -apple-system, BlinkMacSystemFont, "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", "Segoe UI", sans-serif` | `$font` |
| `typography.body.fontSize` | `13px` | `.adp-*` 본문 |
| `space.unit` | `4px` | 그대로 |

더하는 토큰(셋): `semantic.textStrong` `#1a1a1a`(«글자(짙게) — 제목 · 라벨», `$c-text-strong`) · `semantic.borderFaint` `#e8eaee`(«테두리(옅게) — 표 세로선», `$c-border-faint`) · `semantic.header` `#f2f4f7`(«머리 바탕 — 표 머리 · 팝업 제목줄», `$c-bg-header`). 셋 다 무리 `color`.

**CSS 상수(`:root`, 토큰 아님)** — 읽기 전용 바탕 `#f3f4f6` · 비활성 바탕 `#e4e7eb`(둘은 반드시 다른 색) · 안내 글 `#999999` · 성공 `#308008` · `--wb-form-labelWidth: 140px` · 페이지 바탕은 흰색(`Section` 의 `contained` 가 `surface`).

**부품**

| 부품 | 값 |
| --- | --- |
| 구역(`Section`) | 흰 바탕 · 위아래 여백 좁게(카드 사이 8px 인상) · 좌우 28px |
| 카드 | 흰 바탕 · 1px `border` · 모서리 4px · 그림자 없음 · **상자 여백 0** · 머리줄 최소 높이 42px · 머리줄 여백 6px 12px · 머리줄 밑선 1px `border` · 제목 14px 700 `textStrong` · 부제 12px `textMuted` · 몸통 여백 12px · 바닥 단추줄 오른쪽 · 틈 6px |
| 카드 안 폼 표 · 그리드 | 카드 몸통에 곧바로 든 폼 표 · 그리드는 여백 없이 붙는다(`.adp-card__body--flush` 인상) — 셀렉터로 못 가르면 몸통 여백 12px 을 지키고 보고에 적는다 |
| 탭 | 밑선 1px `border` · 고른 탭만 주색 밑줄(지금 케이스가 잠근다) · 탭 글 13px |
| 폼 표 · 상세 표 | 바깥 · 칸 선 1px `border` · 라벨 칸 140px `canvas` 바탕 13px 700 `textStrong` · 칸 최소 높이 42px · 칸 여백 8px 12px · 필수 별은 라벨 앞 `danger` |
| 조회 폼 | 열을 정한 조회 폼은 폼 표와 같은 격자(라벨 칸 `canvas` 바탕 · 칸 선) · 단추줄은 격자 아래 오른쪽 · 여백 8px 12px · 틈 6px. 열을 안 정한 한 줄 조회 폼은 지금 배치를 지키고 색 · 크기만 맞춘다 |
| 표(`DataGrid`) | 13px · 칸 여백 8px 10px · 가로선 1px `border` · 세로선 1px `borderFaint` · 머리 `header` 바탕 700 `textStrong` 가운데 · 줄 hover `canvas` · 고른 줄 `primarySoft` · 빈 표 안내 `textMuted` 가운데 여백 32px |
| 단추 | 최소 높이 30px · 여백 4px 14px · 13px 500 · 모서리 4px · **`default` · `secondary` 는 흰 바탕 1px `border` `text` 글(hover 에 테두리 `borderStrong`)** · `primary` 는 주색 채움 흰 글 · `danger` 는 `danger` 테두리 · 글(흰 바탕) · `ghost` 는 테두리 없음 · 비활성 불투명도 .6 |
| 입력 · 셀렉트 | 최소 높이 30px · 여백 4px 8px · 13px · 1px `border` · 모서리 4px · 안내 글 `#999999` · 읽기 전용 `#f3f4f6` · 비활성 `#e4e7eb` · 여러 줄 입력 최소 높이 120px |
| 세그먼트 | 붙은 칸 · 칸 최소 폭 44px · 최소 높이 28px · 여백 3px 12px · 고른 칸 **주색 채움 흰 글** |
| 체크 · 라디오 | 상자 14px · 글과 틈 6px |
| 칩 | 알약(999px) · 1px `border` · `canvas` 바탕 · 12px |
| 팝업 | 1px `border` · 모서리 4px · 제목줄 `header` 바탕 여백 12px 16px 제목 15px 700 · 몸통 여백 12px · 바닥 `canvas` 바탕 여백 10px 16px 단추 오른쪽 틈 6px |
| 글(`Text`) | 페이지 제목(`h1`) 22px 700 `textStrong` · 나머지 단계는 13px 본문에 맞춰 한 단계씩 내린다 |
| 포커스 | 누르는 조각의 `:focus-visible` 은 2px 주색 외곽선(지금 규칙이 있으면 색만 따른다) |

**기본 단추가 주색에서 흰 바탕으로 바뀐다** — 지금 `Button` 의 바탕(variant 없음 · `default` · `primary`)은 채운 주색이고 폼 · 파일첨부 단추 구역에서만 `default` 를 보조 꼴로 바꾼다(`test/admin.test.ts` «[data-wb-variant="default"] 규칙은 …»). 새 판은 바탕 자체를 흰 단추로 두고 `primary` 를 겨냥한 규칙으로 채운다. 그 케이스 둘(«default 규칙은 … 셋뿐» · «default · Button primary 밖의 …»)의 기대와 머리말을 이 뜻에 맞게 고친다 — `default` 를 겨냥한 규칙은 0 개가 되고, `primary` 는 겨냥한 규칙이 있어야 하는 쪽으로 간다.

## Review Focus

1. **1.8.0 이하에 고정된 프로젝트** — 새 판을 시딩한 뒤에도 그 판 그대로 그려지고 api 기동이 `SystemThemeError` 로 안 멈춘다(Task 5 가 `checksums.json` 옛 줄이 그대로인지 단언).
2. **토큰을 덮은 프로젝트가 2.0.0 으로 올릴 때** — 덮은 키가 새 판에도 있어 값이 이어진다(Task 2 «1.8.0 의 토큰 키를 전부 선언한다»).
3. **좁은 폭** — 라벨 칸 140px 인 폼 표 · 조회 폼이 창 1000 · 720 · 390 에서 문서 밖으로 안 넘치고 글자가 칸 밖으로 안 나간다(Task 4 의 넘침 케이스).
4. **토큰을 바꾼 사람** — 주색 · 테두리 · 간격 단위를 바꾸면 화면 전체가 따른다. `:root` 밖에 토큰 기본값과 같은 색 리터럴이 없다(Task 2 «토큰 색을 글자로 박지 않는다»).
5. **Pretendard 가 없는 기기** — 서체 값이 시스템 한글 서체로 떨어진다(Task 2 «서체는 … sans-serif 로 끝난다»).

---

## File Structure

- `system-themes/admin/src/manifest.ts` — 판 · 설명 · 토큰 선언.
- `system-themes/admin/src/theme.css` — 모양 전부. 절 구성(골격 · 데이터 · 입력 · 액션 · 문서 · 팝업 · 중간 폭 · 좁은 폭)은 그대로 둔다.
- `system-themes/admin/package.json` — `version`.
- `system-themes/admin/checksums.json` — `system-admin@2.0.0` 줄.
- `system-themes/admin/test/admin.test.ts` — manifest · CSS 성질(jsdom CSSOM).
- `apps/web/build-test/admin-look.test.ts`(새 파일) — 실브라우저에서 잰 크기 · 색 · 넘침.
- `docs/superpowers/specs/2026-08-03-wirebound-design.md` — 기본테마의 모양을 말하는 문장 가운데 바뀐 것.
- `docs/superpowers/plans/2026-11-13-sk-report.md`(새 파일) — 보고.

### Task 1: 인구조사와 기준선

**Files:**
- Create: `docs/superpowers/plans/2026-11-13-sk-report.md`

**Interfaces:**
- Produces: 보고의 「기준선」(프로젝트마다 파일 · 케이스 · 건너뜀 수 · Node 판)과 「기본테마 모양에 기대는 케이스」 목록 — Task 4 · 5 가 그 목록으로 깨진 케이스를 가른다.

- [ ] **Step 1: 기준선을 잰다** — 고치기 전 `pnpm typecheck` · `pnpm test` · `pnpm test:build` 를 돌려 프로젝트마다 통과 · 실패 · 건너뜀 수를 보고에 적는다(`.ruler` 「검증 — wirebound」 의 게이트 스크립트 규칙: `mise env` · `node -v` · `caffeinate` · load).
- [ ] **Step 2: 기본테마의 색 · 크기에 기대는 케이스를 센다** — `git grep -l -i -E '#2563eb|#eff6ff|#f8fafc|#e2e8f0|#94a3b8|#0f172a|#475569|#ef4444' -- ':!docs' ':!system-themes'` 의 파일마다 그 값이 제 픽스처의 것인지 시딩된 기본테마의 것인지 열어 가른다. 실브라우저 케이스에서 기본테마가 정하는 크기(라벨 폭 `8rem` · 단추 높이 · 카드 여백 · 표 칸 높이)를 수로 단언하는 자리를 `apps/web/build-test` · `apps/api/build-test` · `packages/theme-kit/build-test` 에서 센다. 목록과 센 식을 보고에 적는다.
- [ ] **Step 3: Commit** — `docs(plans): sk report — baseline and census`

### Task 2: manifest 2.0.0 과 토큰

**Files:**
- Modify: `system-themes/admin/src/manifest.ts` · `system-themes/admin/package.json` · `system-themes/admin/src/theme.css`(`:root` 블록) · `system-themes/admin/test/admin.test.ts`

**Interfaces:**
- Produces: `:root` 의 `--wb-semantic-textStrong` · `--wb-semantic-borderFaint` · `--wb-semantic-header`(Task 3 이 쓴다) 와 상수 `--wb-form-labelWidth: 140px`.

- [ ] **Step 1: 실패하는 케이스를 쓴다** — `test/admin.test.ts` 에:
  - «id · 판 · sdk · 이름 · 설명» 의 판을 `'2.0.0'`, 설명을 `'관리자 화면 기본 테마. 회색 선의 표 격자와 파란 주색을 쓴다.'` 로.
  - 새 케이스 «1.8.0 의 토큰 키를 전부 선언한다» — 열여섯 키를 글자로 늘어놓고 `Object.keys(items)` 가 전부 품는지.
  - 새 케이스 «색 토큰 기본값은 소문자 #rrggbb» — `type === 'color'` 인 칸마다 `/^#[0-9a-f]{6}$/`.
  - 새 케이스 «서체는 Pretendard 로 시작하고 sans-serif 로 끝난다 · 시스템 한글 서체를 품는다» — `"Malgun Gothic"` · `"Apple SD Gothic Neo"` 를 품는지.
  - 새 케이스 «토큰 색을 글자로 박지 않는다» — `:root` 밖 선언 값에 색 토큰 기본값(대소문자 무시)이 글자로 없다.
  - 새 케이스 «읽기 전용과 비활성의 바탕은 다른 색이다» — `:root` 의 두 상수 변수가 다르다.
- [ ] **Step 2: 돌려 빨강을 본다** — `pnpm vitest run system-themes/admin/test/admin.test.ts`. 판 · 설명 · 서체 케이스가 값으로 죽는지 실패 값을 본다.
- [ ] **Step 3: manifest · `:root` · `package.json` 을 「참고 값」 대로 고친다** — 토큰 기본값 · 새 토큰 셋 · 상수. 머리말의 «옛 JSON 테마 admin 이 출발점» 문장은 지금 참인 것(참고한 어휘와 무엇을 잠그는지)으로 바꾼다.
- [ ] **Step 4: 초록을 본다** — 같은 명령. «선언한 토큰은 전부 쓰인다»(`build-test/wbtheme.test.ts`)는 Task 3 뒤에야 서므로 새 토큰 셋을 쓰는 규칙은 Task 3 에서 넣는다.
- [ ] **Step 5: Commit** — `feat(admin): system theme 2.0.0 tokens — skala palette, 4px corners, 13px body`

### Task 3: 부품의 모양

**Files:**
- Modify: `system-themes/admin/src/theme.css` · `system-themes/admin/test/admin.test.ts`

**Interfaces:**
- Consumes: Task 2 의 변수.

절마다 한 커밋이다(골격 · 데이터 · 입력 · 액션 · 문서 · 팝업). 절마다:

- [ ] **Step 1: 그 절의 성질 케이스를 먼저 쓴다** — `test/admin.test.ts` 에 CSSOM 으로 잴 수 있는 것만: 단추 바탕 규칙에 `background` 가 `var(--wb-semantic-surface)` 이고 `primary` 를 겨냥한 규칙에 `var(--wb-semantic-primary)` 가 있다 · 고른 세그먼트 칸의 바탕이 `var(--wb-semantic-primary)` · 표 머리 바탕이 `var(--wb-semantic-header)` · 카드 뿌리의 `padding` 이 `0` · 머리줄 `min-height` 가 `42px`. 「참고 값」 의 «기본 단추가 … 바뀐다» 대로 `default` 케이스 둘을 고친다.
- [ ] **Step 2: 빨강을 본다.**
- [ ] **Step 3: 그 절의 규칙을 「참고 값 › 부품」 대로 고친다** — 배치를 세우는 규칙(쌍 격자 트랙 · subgrid · 960 · 640 접기 · 고정 열 · 생략 띠)은 뜻을 지키고 색 · 크기 · 선만 바꾼다. 주석은 지금 참인 것으로 고친다.
- [ ] **Step 4: 초록을 본다** — `pnpm vitest run system-themes/admin/test` 와 `pnpm -C system-themes/admin check`.
- [ ] **Step 5: Commit** — `feat(admin): <절> in the skala look`

끝에 `pnpm build` 뒤 `pnpm vitest run --project build system-themes/admin/build-test` 를 돌려 «선언한 토큰은 전부 쓰인다» · «갤러리 칸 전부가 오류 없이 그려진다» 가 초록인지 본다.

### Task 4: 실브라우저로 닮음과 넘침을 잰다

**Files:**
- Create: `apps/web/build-test/admin-look.test.ts`
- Modify: Task 1 의 목록에 든 케이스 가운데 새 모양으로 기대가 바뀐 것

**Interfaces:**
- Consumes: `apps/web/build-test/editor-stack.ts` 의 하네스(가까운 꼴은 `apps/web/build-test/form-table.test.ts` — 번들 페이지를 열어 재는 `layout-bundle.ts` 의 `openBundlePage`).

- [ ] **Step 1: 케이스를 쓴다** — 카드(제목 · 머리 오른쪽 단추) 안에 폼 표(2열 · 필수 칸 · 읽기 전용 · 비활성 입력 · 세그먼트) · 조회 폼(열 2 · 단추 둘) · 그리드(머리 · 세 줄) · 단추 다섯 variant · 팝업을 실은 페이지를 `pnpm build` 뒤 연다. `getComputedStyle` 로:
  - 단추 `default` 의 바탕 `rgb(255, 255, 255)` · 테두리 `rgb(204, 204, 204)` · 높이 ≥ 30, `primary` 의 바탕 `rgb(10, 120, 216)`.
  - 입력 높이 ≥ 30 · 읽기 전용 바탕 `rgb(243, 244, 246)` · 비활성 바탕 `rgb(228, 231, 235)`.
  - 폼 표 라벨 칸 폭 140 ± 1 · 바탕 `rgb(243, 244, 246)` · 칸 높이 ≥ 42.
  - 카드 테두리 `rgb(204, 204, 204)` · 모서리 `4px` · 머리줄 높이 ≥ 42.
  - 표 머리 바탕 `rgb(242, 244, 247)` · 고른 세그먼트 칸 바탕 `rgb(10, 120, 216)`.
  - 본문 글 크기 `13px` · 서체 값이 `Pretendard` 로 시작.
  - 창 1280 · 1000 · 720 · 390 에서 문서 `scrollWidth ≤ clientWidth` 이고 글자 노드의 `Range.getClientRects()` 오른끝이 뿌리 밖으로 안 나간다(`theme-system-review.test.ts` 의 `TEXT_PAST_ROOT` 꼴). 판마다 잰 노드 수 > 0 카나리아.
- [ ] **Step 2: 돌린다** — `pnpm test:browser apps/web/build-test/admin-look.test.ts`(Postgres 컨테이너가 떠 있어야 한다). 넘침이 나면 `theme.css` 를 고친다(케이스를 약하게 하지 않는다).
- [ ] **Step 3: 구분력을 한 번 센다** — `theme.css` 의 라벨 폭 상수를 `8rem` 으로, 단추 바탕을 주색으로 되돌린 변조 둘(백업 · 바이트 비교 복원 · 변조 뒤 `pnpm build`)에서 케이스가 그 값으로 죽는지 보고에 적는다.
- [ ] **Step 4: `wb-theme shots` 를 돈다** — `pnpm -C system-themes/admin shots`. 문제 줄 0 이어야 한다. 스크린숏 서너 장(카드 + 폼 표 · 그리드 · 조회 폼 · 팝업)을 `docs/superpowers/plans/2026-11-13-sk-shots/` 에 두고 보고에서 가리킨다.
- [ ] **Step 5: 기대가 바뀐 기존 케이스를 고친다** — `pnpm test:build` 전량을 돌려 빨강인 케이스마다 «새 모양 때문에 기대가 바뀐 것» 인지 «새 모양이 깬 것» 인지 실패 값으로 가른다. 앞의 것은 케이스를(값을 글자로 박지 말고 `@wirebound/test-support` 의 `SYSTEM_ADMIN` 이나 잰 값으로), 뒤의 것은 `theme.css` 를 고친다. 가른 표를 보고에 적는다.
- [ ] **Step 6: Commit** — `test(web): the skala look in the browser — sizes, colors, overflow at four widths`

### Task 5: 체크섬 · 정본 · 게이트

**Files:**
- Modify: `system-themes/admin/checksums.json` · `docs/superpowers/specs/2026-08-03-wirebound-design.md` · `docs/superpowers/plans/2026-11-13-sk-report.md`

- [ ] **Step 1: 체크섬을 적는다** — `pnpm build` 뒤 `shasum -a 256 system-themes/admin/dist/*.wbtheme` 의 값을 `"system-admin@2.0.0"` 줄로 더한다. `git diff system-themes/admin/checksums.json` 이 더한 한 줄(과 앞 줄의 쉼표)뿐인지 본다. 체크섬 뒤에 `theme.css` · manifest 를 다시 고쳤으면 다시 짓는다.
- [ ] **Step 2: 정본을 고친다** — `git grep -n '기본테마' docs/superpowers/specs/2026-08-03-wirebound-design.md` 의 줄마다 새 판에서도 참인지 본다. 모양이 바뀐 문장(단추 기본 꼴 · 세그먼트의 고른 칸 · 라벨 폭 등)만 지금 참인 것으로 고친다 — «앞 판은» 같은 연대기를 쓰지 않는다. 정본을 고쳤으므로 게이트는 전량 넷이다.
- [ ] **Step 3: 게이트** — `pnpm fmt` · `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm test:build`. 프로젝트마다 실행 · 통과 · 건너뜀 수를 Task 1 의 기준선과 견줘 등식으로 보고에 적는다(더한 케이스 수만큼만 는다).
- [ ] **Step 4: 보고를 닫는다** — 무엇을 바꿨나 · 「참고 값」 과 다르게 간 자리와 까닭 · 못 잰 것 · 이월(기존 프로젝트 올리기 · 글꼴 파일 · 셸) · 지침에 넣을 문장(있으면 어느 문서 어느 절에 무슨 문장).
- [ ] **Step 5: Commit** — `feat(admin): system theme 2.0.0 checksum; docs(spec, plans): the default theme's look, sk report`
