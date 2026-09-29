# A5 — 내보내기(HTML 번들 · PPTX)가 프로젝트의 코드 테마로 돈다 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 이 저장소에서는 `CLAUDE.md` 「메인 세션은 디스패치·판정·병합만 한다」를 따른다 — 태스크는 워크트리의 Orca 워커가 한다.

**Goal:** 내보낸 HTML 번들과 PPTX 화면이 SDK 기본 뷰가 아니라 프로젝트가 고정한 `테마@판` 의 뷰 · CSS · 토큰으로 그려진다. 테마 코드는 브라우저에서만 돈다.

**Architecture:** 목업을 Node 에서 그리던 것(`react-dom/server` 의 `renderToStaticMarkup` · 상호작용 상태를 미리 그린 조각)을 걷고, **번들의 페이지가 브라우저에서 스스로 그린다.** 새 일반 스크립트 `assets/runtime.js`(react · react-dom · schema 카탈로그 · renderer · theme-sdk 런타임 · 내보내기 호스트 — vite IIFE 빌드)가 페이지 JSON 을 읽어 `renderDocument` 로 그리고, 상호작용은 캔버스 미리보기와 같은 `runInteraction` 을 브라우저에서 돌리고, 마커는 renderer 의 `markerPoint` 로 놓는다. 테마 패키지 파일은 `assets/theme/` 에 그대로 싣고 토큰은 `assets/tokens.css`. 셸(트리 네비 · 설명 · 코멘트 · 상호작용 목록)은 exporter 자기 코드라 지금처럼 Node 에서 그린다. PPTX 는 Chromium 이 **그 번들의 페이지를 그대로** 연다 — 파일은 메모리에서 `route.fulfill` 로 가짜 origin 에 내주고 그 밖의 네트워크는 지금처럼 막는다. 준비 신호는 `<html data-wb-ready>`, 실패는 `data-wb-failed`.

**Tech Stack:** React 19 · vite 6(IIFE) · Fastify worker thread · playwright-core · vitest(jsdom · build-test).

**Spec:** `docs/superpowers/specs/2026-09-27-code-themes-design.md` — 「내보내기와 PPTX」(«테마 코드는 브라우저에서만 돈다» · HTML 번들 배치 · PPTX) · 「.wbtheme 파일」(일반 스크립트 · 공유 런타임 · 자산 상대 경로). 앞 차수: `docs/superpowers/plans/2026-09-28-a4-report.md` · `-a4-fix-report.md`(캔버스의 시트 차례 · 번들 적재 · 서버 manifest 한 벌).

## Global Constraints

- **api 의 Node 프로세스(메인 · worker thread)는 테마 코드(`theme.js`)를 실행하지 않는다** — 바이트로 읽어 번들에 싣기만 한다. exporter 의 Node 쪽은 목업을 더 이상 그리지 않는다(`react-dom/server` 는 셸에만 남는다).
- **번들은 `file://` 로 열려야 한다** — 모든 스크립트는 일반 스크립트(모듈 아님), 상대 경로. 한글 파일 이름(`filename.ts`) 그대로.
- **PPTX 의 Chromium 은 가짜 origin 밖의 네트워크에 닿지 않는다** — `screen-chromium.test.ts` «일곱 길 어느 것도 서버에 닿지 않는다» 가 그대로 초록이어야 한다.
- **캔버스와 같은 규칙으로 그린다** — 시트 차례 `defaultViewsCss()` → `theme.css`(link) → `tokens.css`, `ThemeProvider` 에 `tokenValues`, 정의의 manifest 는 서버 manifest 로 바꿔 끼운다(A4 H3). 그 규칙을 두 벌로 짜지 않는다 — 공유할 것은 `theme-sdk` · `themes` 로 옮긴다.
- 지금의 한도(`EXPORT_RENDER_LIMIT` · 한 장 `timeoutMs` 10 s · `maxPages` 200 · `maxArea`)를 그대로 쓴다. 한 장의 한도에 테마 적재 · 글꼴 · 첫 렌더가 든다.
- exporter 의 DOM 경계(`public-api.test.ts` 의 `BROWSER_SOURCES` · `tsconfig.runtime.json`)를 새 브라우저 소스로 옮긴다 — Node 쪽 소스가 `window` · `document` 를 안 만진다는 판정을 잃지 않는다.
- 주석 · 인용: `docs/guideline/base/03-comments.md` · `04-citation.md`. 테스트 보고: 실행 · 건너뜀 · 실패 수 · jsdom / 실브라우저 값 구분.

## Review Focus

1. **`file://` 로 연 번들** — 한글 이름 페이지 · 테마 글꼴(`assets/theme/assets/*.woff2`)이 `theme.css` 기준 상대 경로로 풀리고, 페이지 사이 이동 · 코멘트 마커가 선다. → Task 5.
2. **테마 번들이 실패한다** — 등록 안 함 · 최상위에서 던짐 · 뷰가 던짐. HTML 은 기본 뷰로 그리고 상태 줄에 까닭, PPTX 는 그 장을 그리지 않고 까닭을 적는다(`x-wb-screen-failures`). → Task 3 · Task 4 · Task 5.
3. **PPTX 가 준비를 기다린다** — 늦은 글꼴 · 늦은 `theme.css` · 전이가 한 장 한도(10 s) 안에서 끝난 뒤 찍고, 한도를 넘으면 까닭과 함께 건너뛴다. 가짜 origin 밖으로 새지 않는다. → Task 4.
4. **상호작용이 캔버스 미리보기와 같다** — 페이지 이동(대상 · 끊긴 대상) · 보이기/숨기기 · 폼 제출이 캔버스 미리보기 모드와 같은 결과. 옛 «상호작용 상태가 너무 많아» 한도가 사라져도 폭주하지 않는다. → Task 2 · Task 5.
5. **worker thread 판과 같은 스레드 판의 산출물이 바이트로 같다** — 지금은 `runtime.js` 만 다를 수 있었다(`export-worker.test.ts`). 이제 `runtime.js` 는 빌드 산출물이라 전부 같아야 한다. → Task 3.

---

## 확정한 결정

### D1. 번들 배치와 페이지

```
<root>/
  index.html                 첫 페이지의 사본(지금과 같다)
  pages/<이름>.html           셸(SSR) + 빈 목업 자리 + 페이지 JSON + 스크립트
  assets/shell.css           셸 CSS(지금과 같다)
  assets/views.css           defaultViewsCss()          ← 옛 assets/theme.css 를 가른다
  assets/theme/theme.js      패키지 파일 그대로
  assets/theme/theme.css     (패키지에 있으면)
  assets/theme/assets/**     패키지 자산 그대로(바이너리)
  assets/tokens.css          tokensCss(서버 manifest, 프로젝트 토큰).css
  assets/runtime.js          내보내기 런타임(D2)
```

- 페이지 `<head>`: `shell.css` · `views.css` · `theme/theme.css` · `tokens.css` 차례의 `<link>`(캔버스와 같은 차례). 패키지에 `theme.css` 가 없으면 그 link 를 안 싣는다(A4 이월 «없는 theme.css 의 404 link» 를 여기서는 만들지 않는다).
- `<body>` 끝: `<script type="application/json" id="wb-export-page">`(`{ document, title, target, manifest, tokens, themeRef, hrefs, comments }` — `scriptJson` 으로) → `<script src="…/assets/runtime.js">` → `<script src="…/assets/theme/theme.js" id="wb-export-theme">` → 인라인 `<script>__wirebound_export__.boot()</script>`. 전부 일반 스크립트 · `defer` 없음(차례대로 돈다).
- 목업 자리 `.wb-export-canvas` 는 비어 있고 `<noscript>` 한 줄(«이 설계서의 화면은 자바스크립트로 그립니다»).
- 바인딩이 없는(null) 프로젝트 · 패키지를 못 읽은 판: `assets/theme/**` 을 안 싣고 페이지 JSON 의 `themeRef` 가 null — 런타임이 기본 뷰로 그린다. 미리보기 응답의 `themeId` 는 `"id@판"` 또는 null.
- `BundleFile.content` 를 `string | Uint8Array` 로 넓힌다(api 의 `ZipEntry` 는 이미 그 꼴).

### D2. 내보내기 런타임 `runtime.js`

- 소스 `packages/exporter/src/browser/`(새 디렉터리 — DOM lib 은 여기에만, `tsconfig.runtime.json` · `BROWSER_SOURCES` 를 옮긴다). 진입 `src/browser/runtime.tsx`: `installCatalog()` · `installRuntime(window)`(theme-sdk) · `window.__wirebound_export__ = { boot }`.
- `boot()`: 페이지 JSON 을 읽고 → `take(#wb-export-theme)` 로 정의를 받아 `adoptManifest`(D3)로 서버 manifest 를 끼움(실패면 까닭) → `createRoot(.wb-export-canvas)` 에 `<ThemeProvider value={{ tokens: tokenValues(manifest, tokens), window }}>{renderDocument(document, { theme, onNodeError, interaction })}</ThemeProvider>`.
- 상호작용: 캔버스 미리보기 모드와 같은 renderer `runInteraction` · overlay 를 상태로 두고 다시 그린다(옛 «상태를 미리 그린 조각» 과 `MAX_VARIANTS` 를 걷는다). 이동 요청은 `hrefs`(대상 → 이 파일에서의 상대 경로 · 모호하면 null)로 `location.href`. 문장(상태 줄 · 끊긴 대상)은 옛 `browser.ts` 의 것을 옮긴다.
- 마커: 코멘트 목록의 `data-wb-marker-for` 마다 renderer `markerPoint(노드)` 로 `.wb-export-marker` 를 놓는다(캔버스 `canvas.tsx` 와 같은 함수). 크기 바뀜 · 다시 그림 뒤 다시 잰다.
- 준비 신호: 첫 커밋 → `theme.css` link 의 `load`/`error` → `document.fonts.ready` → 한 프레임 뒤 `<html data-wb-ready>`. 실패: 번들 등록 없음 · `adoptManifest` 실패 · 노드가 던짐(`onNodeError`) → `<html data-wb-failed="<까닭>">`(준비 신호도 선다 — HTML 은 기본 뷰 · 오류 노드로 그대로 보인다) + 상태 줄 한 줄.
- 화면 모드: `location.hash === '#wb-screen'` 이면 `<html data-wb-screen>` — 셸 CSS 가 네비 · 패널을 숨기고 목업만 남긴다(PPTX 가 찍는 판, D5).
- 빌드: `packages/exporter/vite.runtime.config.ts`(lib · `formats: ['iife']` · react · react-dom 을 **묶는다** · `define: { 'process.env.NODE_ENV': '"production"' }` · `esbuild.jsxDev: false`) → `dist/runtime.js`. `package.json` 의 `build` 가 tsdown 뒤 이것을 돈다, `exports["./runtime.js"] = "./dist/runtime.js"`. 테마 번들의 공유 런타임 전역(`__wirebound_runtime__` 의 react · jsxRuntime · sdk)은 이 런타임이 묶은 사본을 준다 — 판이 하나다.
- api 는 기동 때 `createRequire(import.meta.url).resolve('@wirebound/exporter/runtime.js')` 를 읽어 쥔다 — 없으면 기동이 멈추고 «`pnpm build` 를 먼저» 를 말한다(시스템 테마와 같은 꼴). api 테스트의 global-setup 이 exporter 런타임을 빌드한다(system-admin 과 같은 자리). 크기를 보고에 적는다.

### D3. 공유할 규칙 — 한 벌

- `adoptManifest(definition, manifest): { ok: true; definition } | { ok: false; reason }` 를 `@wirebound/theme-sdk/runtime` 으로 옮긴다(웹 `theme/bundle-loader.ts` 의 `withServerManifest` 를 이것으로 — 문장 그대로). id · version 이 다르면 실패, 같으면 `{ ...definition, manifest }`.
- 시트 차례 · 토큰 값은 `defaultViewsCss` · `tokensCss` · `tokenValues` 를 그대로 부른다(새 함수 없음).

### D4. api — 바인딩과 패키지를 싣는다

- `readExportRows` 가 `findProjectTheme` · `readThemePackageFiles` 를 함께 읽는다(같은 스냅숏 — 지금 행을 읽는 트랜잭션 안). 패키지 바이트는 `readWbtheme` 으로 `{ manifest, themeJs, themeCss, assets }` — 이슈가 있으면(있을 수 없지만) 테마 없이 내보내고 미리보기에 경고 한 줄.
- worker thread 로 넘기는 행(`ToWorker`)에 `theme: { ref, manifest, tokens, themeJs, themeCss, assets: [path, bytes][] } | null` 을 더한다(바이트는 전송 가능 배열로).
- `exportBundle({ pages, theme, runtimeJs })` — exporter 는 파일 시스템을 안 읽는다(런타임 문자열은 api 가 넘긴다).

### D5. PPTX — 번들의 페이지를 연다

- `ScreenRenderer.render` 의 입력을 `{ files: ReadonlyMap<string, string | Uint8Array>, pages: { title, path }[] }` 로 바꾼다. api 는 PPTX 도 **같은 번들**을 지어 그 파일과 페이지 경로를 넘긴다.
- Chromium: `context.route('https://export.wirebound.invalid/**', 메모리에서 fulfill — 확장자로 content-type)` · 그 밖은 지금처럼 abort. `page.goto(<origin>/pages/<이름>.html#wb-screen)` → `FREEZE_MOTION` 주입(초기화 스크립트로 — 첫 그림 전에) → `html[data-wb-ready]` 를 한 장 한도 안에서 기다림 → `data-wb-failed` 면 그 까닭으로 건너뜀 → `.wb-export-canvas` 의 크기를 재고(지금 `measure` 의 규칙 — 넓이 한도 · 찍은 뒤 커졌나) → 그 요소를 찍는다.
- 화면에 마커를 그린다(HTML 과 같은 문서라 같은 마커) — PPTX 슬라이드가 코멘트를 번호로 싣고 있으면 번호가 맞는지 케이스로 본다. 싣지 않으면 `#wb-screen` 에서 마커를 숨기고 그 판단을 보고에 적는다.
- 까닭 문장: 테마 등록 없음 · 테마 판 불일치 · 노드가 던짐(«테마 뷰가 던졌습니다: <노드 id>») · 한도 안에 준비 안 됨(`SCREEN_FONTS_LATE` 를 넓혀 «한 장의 한도 안에 준비되지 않았습니다 — N ms»).

### D6. 걷는 것

- exporter: `src/page.tsx` 의 목업 SSR(`exportPage` 는 셸 없는 한 페이지 HTML 을 내던 공개 함수 — 소비자를 세고, PPTX 가 안 쓰게 되면 걷는다. 웹 `bundle-parity.test.tsx` 는 D7 로 옮긴다), `src/runtime/plan.ts` · `src/runtime/browser.ts`(→ `src/browser/`), `RUNTIME_JS` 의 `toString()` 판, `MAX_VARIANTS`.
- api: `export-bundle.ts` · `export-pptx.ts` · `export-source.ts` 머리말의 «테마는 읽지 않는다», `themeId: null` 고정 타입.

### D7. 견주기(parity)

- 캔버스와 내보내기는 같은 `renderDocument` · 같은 시트 차례를 쓴다. 웹 `test/canvas/bundle-parity.test.tsx` 는 exporter 가 내는 **브라우저 진입 함수**(`mountExportDocument(root, input)` — `src/browser/` 에서 내보내고 jsdom 에서 부를 수 있게)로 그린 트리와 캔버스 iframe 트리를 견준다. exporter 의 `parity.test.tsx` · `bundle-parity.test.tsx` · `runtime-bundle.test.ts` 도 같은 진입 함수로 옮긴다(SSR 과 견주던 것을 걷는다).

---

## 파일 구조

```
packages/theme-sdk/src/runtime.ts                     adoptManifest
apps/web/src/theme/bundle-loader.ts                    withServerManifest → adoptManifest
packages/exporter/src/browser/{runtime.tsx, boot.tsx, interaction.ts, markers.ts, ready.ts, mount.tsx}   (신규 — 옛 runtime/browser.ts 자리)
packages/exporter/vite.runtime.config.ts · package.json · tsconfig.runtime.json
packages/exporter/src/bundle/{index.ts, shell.tsx, shell-css.ts}   페이지 JSON · 스크립트 · 화면 모드 CSS · 바이너리 파일
packages/exporter/src/page.tsx · src/runtime/*          걷음(D6)
apps/api/src/services/{export-source.ts, export-bundle.ts, export-pptx.ts, export-job.ts, export-worker*.ts, screen-render.ts, screen-render-chromium.ts, export-runtime.ts(신규 — runtime.js 읽기)}
apps/api/src/app.ts · test/global-setup.ts               런타임 적재 · 빌드
apps/api/build-test/screen-chromium.test.ts · export-*.test.ts
apps/web/test/canvas/bundle-parity.test.tsx
apps/web/build-test/export-bundle.test.ts(신규 — file:// 실브라우저)
```

---

## Task 1: 런타임 뼈대 · `adoptManifest` · api 가 런타임을 쥔다

**Files:** `packages/theme-sdk/src/runtime.ts`(+ test), `apps/web/src/theme/bundle-loader.ts`, `packages/exporter/src/browser/*`(뼈대 — 기본 뷰로 그리고 준비 신호), `packages/exporter/vite.runtime.config.ts` · `package.json` · `tsconfig.runtime.json` · `test/public-api.test.ts`(`BROWSER_SOURCES`), `apps/api/src/services/export-runtime.ts` · `app.ts` · `test/global-setup.ts` · Test `packages/exporter/build-test/runtime-dist.test.ts`(신규 — jsdom 에서 `dist/runtime.js` 를 실행: 페이지 JSON 하나로 노드가 서고 `data-wb-ready` 가 섬), `packages/theme-sdk/test/runtime.test.ts`(더함), `apps/api/test/export-runtime.test.ts`

- [ ] **Step 1: 실패하는 테스트** — `adoptManifest`(같은 판 → 끼움 · 다른 id/판 → 까닭 문장이 웹의 지금 문장과 같음). 웹 `bundle-loader` 케이스가 그대로 초록. `dist/runtime.js` 가 IIFE(`import` · `export` 문 없음) · `process.env` 글자 없음 · `jsxDEV` 없음 · 실행하면 `window.__wirebound_runtime__` 과 `window.__wirebound_export__.boot` 이 선다 · 기본 뷰로 그리고 `data-wb-ready`. api: 런타임 파일이 없으면 `buildApp` 이 까닭(`pnpm build`)과 함께 던진다 · 있으면 문자열을 쥔다.
- [ ] **Step 2 ~ 4.** `pnpm build` 뒤 크기(바이트 · gzip)를 적는다.
- [ ] **Step 5: 커밋** — `feat(exporter, theme-sdk): browser export runtime skeleton built as an IIFE; adoptManifest shared with the web`

## Task 2: 페이지가 브라우저에서 그린다 — 목업 SSR · 미리 그린 상태를 걷는다

**Files:** `packages/exporter/src/bundle/*`, `src/browser/{boot,interaction,markers,mount}.tsx`, `src/page.tsx` · `src/runtime/*`(걷음), `src/index.ts`, exporter 테스트(`bundle` · `bundle-parity` · `parity` · `runtime-bundle` · `runtime-plan` · `runtime-sentences` · `page` · `bundle-size` · `duplicate-census` · `public-api`), `apps/web/test/canvas/bundle-parity.test.tsx`

- [ ] **Step 1: 실패하는 테스트**
  - 번들 트리(D1 — 테마 없는 판): `views.css` · `runtime.js` · 페이지 JSON 스크립트 · 스크립트 차례. 페이지 HTML 에 목업 노드가 **없다**(`data-wb-id` 0) · `<noscript>` 있음.
  - `mountExportDocument` 로 jsdom 에서 그린 트리 = 캔버스 미리보기가 그린 트리(웹 `bundle-parity` 를 옮긴 판) · 옛 `runtime-bundle` 의 상호작용 판(이동 · 보이기/숨기기 · 폼)을 같은 진입 함수로 — 결과는 캔버스 미리보기(`renderDocument` + `runInteraction`)와 같다.
  - 마커 자리 = `markerPoint(노드)`(jsdom 은 좌표가 0 이라 **호출 수와 인자**로 — 좌표 값은 Task 5 실브라우저).
  - 옛 판의 성질 가운데 걷는 것(`MAX_VARIANTS` 문장 · 미리 그린 조각)과 옮긴 것을 보고에 표로(지운 케이스 이름과 까닭).
- [ ] **Step 2 ~ 4.** exporter 전량 · 웹 전량.
- [ ] **Step 5: 구분력** — 상호작용 다시 그림을 뗀 판 · 마커를 `getBoundingClientRect` 좌상단으로 되돌린 판 각각 무엇이 죽는지.
- [ ] **Step 6: 커밋** — `feat(exporter): bundle pages render in the browser with the shared renderer; drop server-rendered mockups and pre-rendered states`

## Task 3: 테마를 번들에 싣는다(api)

**Files:** `apps/api/src/services/{export-source,export-bundle,export-job,export-worker,export-worker-protocol,export-worker-thread}.ts`, `routes/export.ts`(미리보기 `themeId`), `apps/web/src/api/types.ts`(주석), `packages/exporter/src/bundle/index.ts`(`theme` · 바이너리), api 테스트(`export-bundle` · `export-routes` · `export-worker` · `export-zip`) · Test `apps/api/test/export-theme.test.ts`

- [ ] **Step 1: 실패하는 테스트**
  - `system-admin@0.1.0` 프로젝트의 zip: `assets/theme/theme.js` 가 패키지의 것과 바이트로 같음 · `theme.css` 같음 · `tokens.css` = `tokensCss(manifest, 토큰).css`(토큰을 PUT 한 뒤) · 페이지 JSON 의 `themeRef` · `manifest`(서버 것) · `tokens`.
  - 자산이 있는 픽스처 패키지(`test/theme-fixtures.ts` 로 글꼴 한 파일)를 올려 고정 → `assets/theme/assets/<이름>` 이 바이트로 같음(바이너리가 문자열로 망가지지 않음).
  - `theme.css` 없는 패키지 → link 없음 · 파일 없음.
  - 미리보기 `themeId` = `"system-admin@0.1.0"`.
  - **worker thread 판과 같은 스레드 판의 zip 이 전 파일 바이트로 같다**(`export-worker.test.ts` 의 `runtime.js` 예외를 걷는다).
  - api 프로세스가 `theme.js` 를 실행하지 않는다 — `export-*` 소스가 `new Function` · `vm` · `eval` · 동적 `import(` 를 안 쓰는지 세는 자를 하나(`stripComments` 로 주석을 걷고 — `CLAUDE.md` «거짓 빨강이라 안전하다»).
- [ ] **Step 2 ~ 4.** api 전량(DB).
- [ ] **Step 5: 커밋** — `feat(api): export bundles carry the project's theme package files, tokens.css and page theme data`

## Task 4: PPTX 가 번들의 페이지를 연다

**Files:** `apps/api/src/services/{screen-render,screen-render-chromium,export-pptx}.ts`, `packages/exporter/src/bundle/shell-css.ts`(화면 모드), `src/browser/ready.ts`, api 테스트(`export-pptx-screens` · `screen-render` · `screen-renderer-census`), `apps/api/build-test/screen-chromium.test.ts`

- [ ] **Step 1: 실패하는 테스트**
  - 가짜 renderer 판: `render` 가 받은 `files` 가 그 프로젝트 zip 의 파일과 같고 `pages[].path` 가 `pages/<이름>.html`.
  - Chromium build-test(`browserLaunches` 로 건너뜀을 실물로 정함):
    - system-admin 판 화면이 PNG 로 나오고 크기가 목업 요소의 크기(셸이 없다 — `#wb-screen`).
    - 샘플 테마(kit 으로 지은 — `apps/web/build-test/theme-fixtures.ts` 의 꼴)의 뷰가 화면에 선다(목업 안 글자 · 픽셀 한 점).
    - 번들이 등록 안 함 · 뷰가 던짐 → 그 장만 실패, 까닭 문장.
    - 늦은 글꼴(가짜 origin 의 글꼴 응답을 늦춤) · 한도 넘김 → 까닭에 ms.
    - «일곱 길 어느 것도 서버에 닿지 않는다» 가 번들 페이지로도 초록(테마 CSS · 스크립트가 바깥 주소를 가리키는 픽스처).
    - 전이 멈춤(`FREEZE_MOTION`)이 첫 그림 전에 선다 — 늦은 `theme.css` 의 전이가 찍힌 크기를 흔들지 않는다(찍은 뒤 커졌나 검사가 안 걸림).
- [ ] **Step 2 ~ 4.** `pnpm test:build`(Chromium 이 있어야 — 건너뛴 수를 적는다).
- [ ] **Step 5: 구분력** — `data-wb-failed` 판정을 뗀 판 · 가짜 origin 밖 abort 를 뗀 판 · `data-wb-ready` 를 안 기다린 판 각각.
- [ ] **Step 6: 커밋** — `feat(api): PPTX screens open the export bundle's own pages in Chromium and wait for data-wb-ready`

## Task 5: 실브라우저로 번들을 연다

**Files:** `apps/web/build-test/export-bundle.test.ts`(신규 — `editor-stack.ts` 로 프로젝트를 만들고 테마를 고정해 내보내기 zip 을 받아 스크래치에 풀고 `file://` 로 연다)

- [ ] **Step 1: 케이스**(고치기 전 = main 에서 빨강 — main 의 번들은 기본 뷰라 샘플 뷰가 없다)
  - 샘플 테마로 고정 · 토큰 하나 저장 → `file://…/index.html` 에서 샘플 뷰가 서고 토큰 변수의 계산값이 저장한 값 · 테마 글꼴이 `document.fonts` 에 `loaded`.
  - 한글 이름 페이지로 가는 이동 요소를 누르면 그 파일이 열린다 · 끊긴 대상은 상태 줄.
  - 코멘트 마커의 자리 = 그 노드의 `markerPoint`(계산값으로 — 페이지에서 renderer 를 부를 수 없으니 `data-wb-focus` · 배치 속성을 가진 픽스처 노드로 기대 좌표를 셈).
  - 번들이 던지는 테마로 고정 → 기본 뷰 · 상태 줄 까닭 · `data-wb-failed`.
  - 콘솔 오류 0(테마가 정상인 판).
- [ ] **Step 2: 구분력** — 시트 차례를 바꾼 판(토큰이 theme.css 에 짐) · `adoptManifest` 를 뗀 판.
- [ ] **Step 3: 커밋** — `test(web): open exported bundles over file:// in Chrome with a code theme`

## Task 6: 문서 · 게이트 · 보고

- [ ] 코드 테마 spec 「내보내기와 PPTX」 를 지금 참인 것으로(배치의 `views.css` · 페이지 JSON · 화면 모드 · 가짜 origin · 준비 · 실패 속성 — «SDK 가 `data-wb-ready` 를 세운다» 는 «내보내기 런타임이» 로), 「진행 단계」 A1 ~ A4 의 «내보내기는 기본 뷰» 문장을 걷는다. 정본 설계서의 내보내기 절. `apps/api/README.md` 의 내보내기 절 · 미리보기 `themeId` · 화면 실패 까닭.
- [ ] 게이트: `pnpm typecheck` · `pnpm build` · `pnpm test` · `pnpm test:build` · `pnpm test:browser` · `EDITOR_STACK_BUNDLE=build pnpm test:browser`. 실행 · 건너뜀 · 실패.
- [ ] 보고 `docs/superpowers/plans/2026-09-29-a5-report.md` — 태스크마다 커밋 · 실행 수 · 구분력 · 걷은 케이스와 까닭 · `runtime.js` 크기 · 계획과 달라진 것 · jsdom / 실브라우저 값 구분 · 이월.

---

## 이 계획이 정하지 않고 넘기는 것

- 번들 안 페이지 사이의 상태 유지(한 페이지에서 연 오버레이를 다른 페이지로 들고 가기) — 지금과 같다(없음).
- 스냅샷에서 내보내기(옛 판의 테마로) — 지금 내보내기는 살아 있는 프로젝트만 읽는다.
- CLI · MCP — CLI 는 서버 zip 을 받아 풀 뿐이라 바뀌지 않는다.
