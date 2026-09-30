# A6 — 시스템 테마 5종 · 정본 설계서 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 이 저장소에서는 `CLAUDE.md` 「메인 세션은 디스패치·판정·병합만 한다」를 따른다 — 트랙마다 워크트리의 Orca 워커가 한다.

**Goal:** 옛 JSON 테마 다섯(admin · commerce · docs · portal · saas-marketing)을 코드 테마(`system-<id>`)로 다시 써서 기본 설치하고, 정본 설계서를 코드 테마 체계에 맞춘다.

**Architecture:** 세 단계다. **① 뼈대(순차 트랙 하나)** — 새 패키지 넷의 뼈대 · 테마별 체크섬 파일 · 공용 검사 도구(모든 컴포넌트 × variant × 표본이 오류 없이 그려지는가) · 갤러리 스크린숏 명령(`wb-theme shots`)을 세우고 병합한다. **② 테마(병렬 트랙 다섯)** — 트랙마다 자기 `system-themes/<id>/` 만 고친다(새 의존 없음 · 공유 파일 없음). 옛 JSON 테마의 토큰 · 구조 선택 · 스킨을 manifest 토큰 · 컴포넌트 variant · 뷰 · `theme.css` 로 옮긴다. **③ 문서 · 전량 게이트(순차 트랙 하나)** — 정본 설계서와 코드 테마 spec 을 고치고 전량을 돈다.

**Tech Stack:** theme-sdk 뷰 계약 · theme-kit(`wb-theme build` · dev · 새 `shots`) · theme-gallery · vitest · playwright-core.

**Spec:** `docs/superpowers/specs/2026-09-27-code-themes-design.md` — 「목적과 범위」(«시스템 테마 5종은 새 SDK 로 다시 써서 기본 설치한다») · 「뷰 계약」 · 「manifest」 · 「시스템 테마」 · 「진행 단계」 A6, 머리의 «정본 설계서의 「명시적으로 제외한 것」 · 「컴포넌트 정의 구조」 · 「테마 시스템」 · 「설계서 화면 구조」 · 「HTML 정적 번들」 절은 A6 에서 이 문서에 맞춰 고친다». 설계 원천: 옛 테마 `git show b2766e8c^:packages/themes/src/system/<id>.ts`(머리말이 테마마다 «무엇이 다른가» 표를 갖는다)와 옛 테스트(`git show b2766e8c^:packages/themes/test/system-*.test.ts`).

## Global Constraints

- **시스템 테마의 `id` 는 `system-<옛 id>`**(`system-admin` · `system-commerce` · `system-docs` · `system-portal` · `system-saas-marketing`). 이름 · 설명은 옛 `meta` 의 한국어 그대로.
- **판:** 새 테마 넷은 `1.0.0`. `system-admin` 은 내용이 바뀌므로 `1.0.0` 으로 올리고 `0.1.0` 의 체크섬 줄은 남긴다(이미 배포한 판의 줄은 고치지 않는다 — 사용자 DB 에 `0.1.0` 이 시딩돼 있다).
- **테마 트랙은 자기 디렉터리 밖을 고치지 않는다** — `system-themes/<id>/**` 만. 새 의존 · lock · 루트 설정 · 공유 테스트 도구를 고칠 일이 생기면 고치지 말고 보고에 적는다(뼈대 트랙의 몫 — 코디네이터가 판정).
- 뷰는 SDK 뷰 계약만 쓴다(`view` · `Root` · `Focus` · `useToken` · `useWindow` — `window` 직접 참조 금지). 테마 코드는 캔버스 · 내보낸 번들 · PPTX Chromium 에서 같은 결과여야 한다.
- manifest 토큰은 무리(`groups`)와 한국어 `label` 을 갖는다(설정 페이지의 토큰 편집기가 그대로 폼으로 쓴다). 토큰 값은 `packages/themes` 의 값 문법 안(A2 · A3 의 `token-value-char` 포함).
- 주석 · 인용: `docs/guideline/base/03-comments.md` · `04-citation.md`. 테스트 보고: 실행 · 건너뜀 · 실패 수 · jsdom / 실브라우저 값 구분.

## Review Focus

1. **모든 컴포넌트 × 선언한 variant × 표본이 오류 없이 그려진다** — 캔버스(jsdom) · 실 Chromium(갤러리 스크린숏) 둘 다에서 `data-wb-error` 0 · 콘솔 오류 0. → 뼈대 T0.2 · 각 테마 트랙.
2. **같은 문서를 테마만 바꿔 그리면 레이아웃이 깨지지 않는다** — 좁은 폭(390) · 넓은 폭(1280)에서 가로 넘침 없음. → `wb-theme shots` 의 넘침 검사.
3. **번호 마커 · 초점 자리** — 뷰가 DOM 을 바꾼 컴포넌트는 `Focus` · `markerAttrs` 로 자리를 준다. 캔버스와 내보낸 번들의 마커 좌표가 같다. → 각 트랙의 마커 케이스.
4. **판 바꾸기** — `system-admin@0.1.0` 에 고정된 프로젝트가 설정 페이지에서 `1.0.0` 으로 올릴 때 토큰 이전 · 없는 variant 수가 옳다(impact). → 문서 트랙의 실브라우저 판.
5. **시딩 · 체크섬** — 기동이 다섯을 넣고, 판을 안 올린 변경은 테스트가 잡는다(A3 G5). → 뼈대 T0.1.

---

## 확정한 결정

### D1. 체크섬을 테마별 파일로

`system-themes/checksums.json`(한 파일)을 `system-themes/<id>/checksums.json`(`{ "<id>@<판>": "<sha256>" }`)으로 가른다 — 병렬 트랙이 한 파일의 이웃한 줄을 고쳐 병합이 부딪히지 않게. 체크섬 케이스는 `system-themes/*/checksums.json` 을 모아 견준다.

### D2. 공용 검사 도구 — `@wirebound/theme-kit` 의 `checkTheme`

`checkTheme(files: WbthemeFiles): Promise<ThemeCheckReport>` — `.wbtheme` 를 jsdom 에서 공유 런타임으로 싣고(`installRuntime` → `new Function(themeJs)` → `take()`), `galleryItems(theme)` 전부를 `renderDocument` 로 그려 `{ items, errors: { type, variant, label, message }[], unusedTokens, undeclaredVariantsUsedByPatterns }` 를 낸다. 시스템 테마마다 build-test 한 줄(`expect(report.errors).toEqual([])`)로 쓴다(지금 `system-themes/admin/build-test/wbtheme.test.tsx` 를 이것으로 옮긴다). 작성자도 쓸 수 있게 `wb-theme check` 명령으로도 낸다.

### D3. 갤러리 스크린숏 — `wb-theme shots`

`wb-theme shots [--out <디렉터리>] [--widths 390,1280]` — kit dev 의 갤러리 프레임을 playwright-core(Chromium 이 없으면 까닭을 말하고 끝남)로 열어 폭마다 PNG 한 장(전체 페이지)과 `report.json`(콘솔 오류 · `data-wb-error` · 가로 넘침 요소)을 낸다. 트랙 워커는 이것으로 스크린숏을 코디네이터 스크래치(`…/scratchpad/a6-shots/<id>/`)에 남긴다 — 코디네이터가 모아 사용자에게 보인다.

### D4. 옛 테마를 옮기는 규칙

- **토큰:** 옛 `tokens`(palette · semantic · space · radius · font · shadow)를 manifest `tokens.items` 로. 사람이 고칠 만한 것(색 · 서체 · 모서리 · 밀도)만 선언하고 나머지는 `theme.css` 의 상수로 둔다 — 토큰 폼이 수십 칸이 되지 않게(테마당 선언 토큰 12 ~ 30 을 기준으로 삼고 넘으면 까닭을 보고에).
- **구조 선택 → variant · 뷰:** 옛 테마가 컴포넌트 타입마다 고른 구조(예: commerce 의 `List:mediaList` · `Card:mediaTop` · `Tabs:pill` · `Tree:accordion`)는 그 테마의 `components` variant 선언과 뷰로. 옛 구조가 컴포넌트 **하나를 고르는** 것이었다면 이제는 variant 여럿을 선언하고 옛 선택을 `defaultVariant` 로 둔다(한 문서에 둘 다 쓸 수 있게 — 옛 머리말이 적은 «둘을 한 문서에 둘 수 없다» 대가가 사라진다).
- **패턴:** 옛 `patterns` 가 있으면 manifest `patterns` 로(패턴 규격은 `packages/themes` 가 그대로 갖고 있다).
- **옛 테스트의 성질**(`system-portal` · `system-section-centered` · `system-unresolved-literals`)은 그 테마 트랙의 케이스로 옮긴다(성질 이름을 보고의 표에).

---

## T0 — 뼈대 트랙(순차 · 먼저 병합)

**Files:** `system-themes/{commerce,docs,portal,saas-marketing}/`(admin 과 같은 모양 — `package.json` · `tsconfig.json` · `theme.config.ts` · `src/{manifest.ts,theme.tsx,theme.css,index.ts,css.d.ts}` · `test/` · `build-test/` — 뷰는 기본 뷰 · manifest 는 옛 meta 와 빈 토큰 몇 개 · 판 `1.0.0`), `system-themes/*/checksums.json`(D1 — 옛 한 파일을 걷고 그 테스트를 옮김), `vitest.config.ts`(alias 넷), `pnpm-lock.yaml`, `packages/theme-kit/src/{check.ts,shots.ts,bin.ts}`(D2 · D3), `apps/api/test/*`(시딩이 다섯을 넣는다 · 체크섬 케이스), `apps/web` 의 테스트 픽스처가 `system-admin` 만 가정한 자리

- [ ] **T0.1** 패키지 넷 · 체크섬 가르기 · 시딩 다섯 — api `system-themes.test.ts` 가 다섯 행 · 새 프로젝트는 여전히 `system-admin` 최신판. global-setup 이 다섯을 빌드(시간을 적는다).
- [ ] **T0.2** `checkTheme` · `wb-theme check` — 기본 뷰 판의 다섯이 오류 0. 일부러 던지는 뷰 · 선언 안 한 variant 를 쓰는 패턴 픽스처로 보고가 서는지.
- [ ] **T0.3** `wb-theme shots` — 기본 뷰 판의 system-admin 으로 두 폭 PNG · `report.json`. 가로 넘침 픽스처로 넘침이 잡히는지. Chromium 이 없는 판(`executablePath` 틀림)의 문장.
- [ ] **T0.4** 게이트: `pnpm typecheck` · `pnpm build` · `pnpm test` · `pnpm test:build`. 보고 `docs/superpowers/plans/2026-09-30-a6-t0-report.md`.

## T1 ~ T5 — 테마 트랙(병렬 · T0 병합 뒤, 트랙마다 워크트리 하나)

트랙마다 같은 꼴이다. `<id>` 는 admin · commerce · docs · portal · saas-marketing.

- [ ] **읽기:** 옛 `packages/themes/src/system/<id>.ts`(머리말의 «무엇이 다른가» 표가 이 트랙의 명세다) · 옛 테스트 · 지금 `system-themes/admin`(기본 뷰에 옛 admin CSS 를 입힌 첫 판).
- [ ] **manifest:** 토큰(D4) · `components`(옛 구조 선택을 variant 로 — `defaultVariant` 는 옛 선택) · `patterns` · `preview`(있으면).
- [ ] **뷰:** 기본 뷰 DOM 으로 옛 외형이 서지 않는 컴포넌트만 뷰를 쓴다(`src/views/<Type>.tsx`). 뷰가 DOM 을 바꾸면 `Focus` · 마커 자리를 준다.
- [ ] **`theme.css`:** 토큰 변수(`var(--wb-…)`)로 적고 `:root` 에 기본값(토큰 시트가 그 뒤에 선다 — A4 D3).
- [ ] **케이스:**
  - `build-test`: `checkTheme` 오류 0 · 선언 토큰 전부가 CSS 나 뷰에서 쓰인다(`unusedTokens` 0 — 안 쓰는 토큰을 폼에 내놓지 않는다).
  - `test`: 옛 테스트의 성질(D4) · variant 마다 그 뷰의 DOM 표지 · 마커 자리가 `Focus` 를 따른다.
  - `wb-theme shots` 두 폭: `report.json` 의 콘솔 오류 · `data-wb-error` · 가로 넘침 0. PNG 를 `…/scratchpad/a6-shots/<id>/` 에.
- [ ] **판 · 체크섬:** 판(Global Constraints)으로 빌드하고 자기 `checksums.json` 에 줄을 더한다.
- [ ] **게이트:** `pnpm typecheck` · `pnpm vitest run system-themes/<id>` · `pnpm vitest run --project build system-themes/<id>` · `pnpm vitest run apps/api/test/system-themes.test.ts`(자기 워크트리 DB) · `pnpm test --maxWorkers=25%`(다섯이 함께 돈다).
- [ ] **보고** `docs/superpowers/plans/2026-09-30-a6-<id>-report.md` — 옛 → 새 대응표(토큰 · 구조 → variant · 뷰) · 선언 토큰 수 · 뷰를 쓴 컴포넌트와 까닭 · 옮긴 옛 성질 · 스크린숏 경로 · 게이트 수.

## T6 — 문서 · 전량 게이트(순차 · 다섯 병합 뒤)

- [ ] 정본 설계서(`2026-08-03-wirebound-design.md`) — 코드 테마 spec 머리가 적은 다섯 절(«명시적으로 제외한 것» · «컴포넌트 정의 구조» · «테마 시스템» · «설계서 화면 구조» · «HTML 정적 번들»)을 코드 테마 체계로(지금 참인 것만 — 연대기 없이). 코드 테마 spec 의 머리 문장(«A6 에서 고친다»)과 「진행 단계」 를 지금 참인 것으로.
- [ ] 실브라우저 판(`apps/web/build-test/theme-system.test.ts`): 다섯 테마를 설정 페이지에서 차례로 골라 캔버스가 그 테마로 서는지(테마마다 대표 노드의 표지) · `system-admin@0.1.0` 프로젝트를 `1.0.0` 으로 올릴 때 확인 상자의 수가 impact 와 같은지 · 내보낸 번들이 그 테마로 그려지는지.
- [ ] 게이트: `pnpm typecheck` · `pnpm build` · `pnpm test` · `pnpm test:build` · `pnpm test:browser` · `EDITOR_STACK_BUNDLE=build pnpm test:browser`.
- [ ] 보고 `docs/superpowers/plans/2026-09-30-a6-report.md`.

---

## 이 계획이 정하지 않고 넘기는 것

- 시스템 테마의 자동 판 올림 알림 — 설정 페이지의 «새 버전» 표시(A4)가 이미 있다.
- 사용자 DB 적용 — 병합 뒤 코디네이터가 기동 시딩으로 넣는다(마이그레이션 없음).
